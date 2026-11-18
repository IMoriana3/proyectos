#!/usr/bin/env bash
# El lote entero, de una vez. Lo arranca el contenedor de `compose.yaml` en el
# NAS; todo lo que guarda va a /datos (la carpeta compartida del NAS).
#
#   PAISES="ESP PRT"  ANIOS="2022"  PASO=0.25  RAMA=main
#   CDSAPI_KEY=<clave de Copernicus>     (obligatoria)
#   GH_TOKEN=<token de GitHub>           (opcional: sube los mapas a una rama y abre un PR)
set -euo pipefail
PAISES="${PAISES:-ESP}"; ANIOS="${ANIOS:-2022}"; PASO="${PASO:-0.25}"; RAMA="${RAMA:-main}"
REPO_URL="https://github.com/IMoriana3/proyectos"
log(){ printf '\n== %s · %s\n' "$(date '+%H:%M:%S')" "$*"; }

[ -n "${CDSAPI_KEY:-}" ] || { echo "Falta CDSAPI_KEY (la clave de Copernicus). Ver tools/mapa_pasivo/README.md"; exit 1; }
[ -d /datos ] || { echo "Falta la carpeta /datos (el volumen del NAS en compose.yaml)."; exit 1; }
mkdir -p /datos/cache /datos/trabajo /datos/resultados /datos/pip

log "código: $REPO_URL @ $RAMA"
# El clon de la vez anterior se tira entero: el código se baja limpio en cada
# lote, así que lo que se calcula es siempre lo de la rama, no un resto.
if [ -d /datos/repo ]; then rm -rf -- /datos/repo; fi
git clone -q --depth 1 -b "$RAMA" "$REPO_URL" /datos/repo
R=/datos/repo; T=/datos/repo/tools/mapa_pasivo
GIT_SHA="$(git -C "$R" rev-parse HEAD)"; export GIT_SHA
echo "   commit $GIT_SHA"

log "dependencias de Python"
pip install -q --break-system-packages --cache-dir /datos/pip -r "$T/requisitos.txt"
if ! python3 "$T/era5.py" autoprueba > /datos/trabajo/autoprueba.log 2>&1; then
  cat /datos/trabajo/autoprueba.log; echo "La autoprueba de era5.py falla: no sigo."; exit 1
fi
echo "   autoprueba de era5.py: OK"

CONFIG="$T/config_defecto.json"
if [ -f /datos/config.json ]; then CONFIG=/datos/config.json; fi
echo "   configuración: $CONFIG"

SAL="$R/data/mapas_pais/pasivo"; HECHOS=()
for PAIS in $PAISES; do for ANIO in $ANIOS; do
  TAG="${PAIS}_${ANIO}_${PASO}"
  log "$TAG · nodos"
  node "$T/calcula.js" nodos --repo "$R" --pais "$PAIS" --anio "$ANIO" --paso "$PASO" --salida "/datos/trabajo/nodos_$TAG.json"
  log "$TAG · ERA5 (Copernicus; la cola del CDS puede tardar)"
  python3 "$T/era5.py" descarga --nodos "/datos/trabajo/nodos_$TAG.json" --cache /datos/cache
  python3 "$T/era5.py" extrae --nodos "/datos/trabajo/nodos_$TAG.json" --cache /datos/cache --salida "/datos/trabajo/meteo_$TAG.bin"
  log "$TAG · cálculo (motor de sim-viento.html)"
  node "$T/calcula.js" calcula --repo "$R" --nodos "/datos/trabajo/nodos_$TAG.json" --meteo "/datos/trabajo/meteo_$TAG.bin" \
       --config "$CONFIG" --salida "$SAL"
  cp "$SAL/$TAG.json" /datos/resultados/
  rm -f -- "/datos/trabajo/meteo_$TAG.bin"
  HECHOS+=("$TAG")
done; done
cp "$SAL/indice.json" /datos/resultados/
log "hecho: ${HECHOS[*]} → carpeta resultados"

if [ -z "${GH_TOKEN:-}" ]; then
  echo "Sin GH_TOKEN: los mapas se quedan en la carpeta resultados del NAS."
  exit 0
fi
log "subida a GitHub"
B="mapa-pasivo/$(date '+%Y%m%d-%H%M')-${HECHOS[0]}"
cd "$R"
git config user.name "Lote mapa pasivo (NAS)"
git config user.email "lote-mapa-pasivo@users.noreply.github.com"
git checkout -q -b "$B"
git add data/mapas_pais/pasivo
git commit -q -m "mapa pasivo: ${HECHOS[*]} (ERA5, lote del NAS)" -m "Calculado con tools/mapa_pasivo sobre $GIT_SHA."
git push -q "https://x-access-token:${GH_TOKEN}@github.com/IMoriana3/proyectos" "$B"
CUERPO=$(python3 "$T/pr_cuerpo.py" "$SAL" "$B" "$RAMA" "${HECHOS[@]}")
URL=$(curl -sS -X POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
      https://api.github.com/repos/IMoriana3/proyectos/pulls -d "$CUERPO" \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("html_url") or d)')
echo "   PR: $URL"
