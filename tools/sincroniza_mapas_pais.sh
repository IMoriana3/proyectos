#!/usr/bin/env bash
#
# Copia el paquete de láminas de país a data/mapas_pais/.
#
#   bash tools/sincroniza_mapas_pais.sh <carpeta-del-paquete>
#
# El paquete lo genera el workflow «mapas-pais» del repo siting
# (tools/mapa_pais.py) y lo deja en su rama `mapas-pais-datos`; el workflow
# «mapas-pais-sync» de este repo la clona y llama aquí. Se puede correr a mano
# con cualquier carpeta que tenga la misma forma.
#
# NO SE COPIA A CIEGAS. Antes de tocar data/mapas_pais/ se comprueba que el
# paquete está entero —indice.json legible, y cada ficha, lámina y rejilla que
# nombra existe— y que no trae muchos menos países que lo publicado: una rama
# de datos a medias o vacía no debe dejar el Panel sin mapas. Para encoger el
# paquete a propósito: FORZAR=1.
#
# Sale 0 tanto si hay cambios como si no; lo que cambió lo dice `git status`.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORIGEN="${1:?uso: sincroniza_mapas_pais.sh <carpeta-del-paquete>}"
DESTINO="$RAIZ/data/mapas_pais"

python3 - "$ORIGEN" "$DESTINO" "${FORZAR:-0}" <<'PY'
import json, os, sys
origen, destino, forzar = sys.argv[1], sys.argv[2], sys.argv[3] == "1"

def falla(msg):
    print("NO SE COPIA:", msg, file=sys.stderr)
    sys.exit(1)

try:
    indice = json.load(open(os.path.join(origen, "indice.json"), encoding="utf-8"))
except Exception as e:
    falla(f"el paquete no trae un indice.json legible ({e})")
if not indice:
    falla("el indice.json del paquete está vacío")

faltan = []
for iso3, e in indice.items():
    for var, meta in e.get("variables", {}).items():
        ficha_ruta = os.path.join(origen, meta["ficha"])
        if not os.path.exists(ficha_ruta):
            faltan.append(meta["ficha"]); continue
        ficha = json.load(open(ficha_ruta, encoding="utf-8"))
        for clave in ("imagen", "rejilla"):
            if not os.path.exists(os.path.join(origen, ficha[clave])):
                faltan.append(ficha[clave])
if faltan:
    falla(f"{len(faltan)} ficheros nombrados en el índice no están: {', '.join(faltan[:8])}")

antes = 0
try:
    antes = len(json.load(open(os.path.join(destino, "indice.json"), encoding="utf-8")))
except FileNotFoundError:
    pass
if antes and len(indice) < 0.9 * antes and not forzar:
    falla(f"el paquete trae {len(indice)} países y hay {antes} publicados; "
          "para encogerlo a propósito, FORZAR=1")

n_v = sum("viento" in e["variables"] for e in indice.values())
n_i = sum("irradiancia" in e["variables"] for e in indice.values())
print(f"paquete válido: {len(indice)} países · viento {n_v} · irradiación {n_i} (publicados antes: {antes})")
PY

# La copia, sin rsync (no siempre está): lo que decide es el CONTENIDO, no la
# fecha del clon, y un fichero que desaparece del paquete desaparece del Panel.
python3 - "$ORIGEN" "$DESTINO" <<'PY'
import filecmp, os, shutil, sys
origen, destino = sys.argv[1], sys.argv[2]
os.makedirs(destino, exist_ok=True)
nuevos = {f for f in os.listdir(origen) if os.path.isfile(os.path.join(origen, f))}
viejos = {f for f in os.listdir(destino) if os.path.isfile(os.path.join(destino, f))}
copiados = 0
for f in sorted(nuevos):
    o, d = os.path.join(origen, f), os.path.join(destino, f)
    if not os.path.exists(d) or not filecmp.cmp(o, d, shallow=False):
        shutil.copyfile(o, d)
        copiados += 1
for f in sorted(viejos - nuevos):
    os.remove(os.path.join(destino, f))
print(f"data/mapas_pais/ al día: {copiados} copiados · {len(viejos - nuevos)} retirados")
PY
