#!/usr/bin/env bash
#
# EL CORREDOR DE LOS ARNESES — y el sitio donde «verde» deja de ser una lectura
# a ojo.
#
# Este repo tenía veintiún arneses de navegador y NINGUNA puerta: el único
# workflow era el de Pages, así que las pruebas corrían cuando alguien se
# acordaba. Un check que no bloquea es decorativo; uno que no existe no es
# nada. Esto es la mitad mecánica de cerrarlo — la otra mitad, marcarlo como
# obligatorio en la protección de rama, es del mantenedor y está escrita en
# tests/README.md.
#
# LA REGLA QUE JUSTIFICA EL FICHERO: el veredicto sale del RECUENTO LEÍDO, no
# del código de salida. Aquí eso no es una costumbre, es el código:
#
#   · `set -o pipefail`, porque `cmd | tee` devuelve el estado de `tee`;
#   · un arnés está verde si SALE con 0 **y** no imprime ninguna línea `FAIL`
#     **y** imprime al menos `PISO` líneas `OK`;
#   · el vacío es ERROR, no PASS: un arnés que revienta antes de comprobar
#     nada, o que cambia su formato de salida, se pone ROJO en vez de colarse
#     como verde silencioso. Es el modo de fallo más barato de sufrir y el más
#     caro de descubrir tarde.
#
# EL PISO no es decoración. Sin él, un `return` temprano que se coma la mitad
# de las comprobaciones deja el arnés en verde con doce checks en vez de
# trescientos, y nadie lo mira. Los números salen de una corrida medida (ver
# tests/README.md) y solo se BAJAN a propósito, con el motivo escrito: si un
# arnés pierde comprobaciones por una razón legítima, se edita aquí y el
# cambio aparece en el diff.
#
#   bash tests/correr.sh                 # todos
#   bash tests/correr.sh viento          # los que casen con el patrón
#   BASE_URL=http://localhost:8099 bash tests/correr.sh
#
# Necesita el repo servido en :8099 (el workflow lo levanta; en local,
# `python3 -m http.server 8099`).

set -o pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 1

BASE="${BASE_URL:-http://localhost:8099}"
export BASE_URL="$BASE" BASE="$BASE"
LOGS="${LOGS_DIR:-$RAIZ/.arneses}"
TIEMPO_MAX="${TIMEOUT_ARNES:-600}"
PATRON="${1:-}"

# ── EL PISO DE CADA ARNÉS ────────────────────────────────────────────────
# Comprobaciones mínimas que tiene que publicar. Los números están MEDIDOS
# —corrida completa del 2026-09-09, los 21 en verde, 1.630 comprobaciones en
# 1.030 s— y no copiados de la documentación: al medirlos, seis de los que
# tests/README.md daba por buenos estaban viejos (`test_layout` publica 201 y
# el texto decía 196; `test_index` 18 y decía 13; `test_granizo_pestana` 28 y
# decía 22). Un piso transcrito habría nacido mintiendo.
#
# Se SUBE al añadir cobertura y se BAJA solo a propósito, con el motivo
# escrito: si un arnés pierde comprobaciones por una razón legítima se edita
# aquí y el cambio aparece en el diff, que es justo lo que un recuento que
# nadie fija no consigue.
declare -A PISO=(
  [test_buscador.js]=55
  [test_careo_pvsyst.js]=11
  [test_comparador.js]=304
  [test_comparador_3d.js]=247
  [test_comparador_sitio.js]=36
  [test_ejecucion_traza.mjs]=61
  [test_granizo_espejo.mjs]=9
  [test_granizo_pestana.js]=28
  [test_granizo_traza.mjs]=30
  [test_index.js]=18
  [test_integridad.js]=7
  [test_layout.js]=201
  [test_layout_ui.js]=182
  [test_pwa.js]=21
  [test_sizing.js]=115
  [test_viento_ejes.js]=77
  [test_viento_planta.js]=35
  [test_viento_reproductor.js]=18
  [test_viento_sello.js]=17
  [test_viento_sitio.js]=52
  [test_zonas_mixto.js]=106
)

# ── EL PISO TIENE QUE CUBRIR A TODOS ─────────────────────────────────────
# Un arnés nuevo sin piso caería al `:-1` de más abajo y quedaría vigilado
# por un umbral que no puede fallar: verde con una sola comprobación. Así que
# se exige que la tabla los nombre a todos, y añadir un arnés obliga a medir
# el suyo. Es la lista de exenciones al revés: allí sobra una entrada, aquí
# falta.
for _t in tests/test_*.js tests/test_*.mjs; do
  _n="$(basename "$_t")"
  if [ -z "${PISO[$_n]+x}" ]; then
    echo "ROJO · $_n no tiene piso en tests/correr.sh"
    echo "       córrelo y apunta cuántas comprobaciones publica"
    exit 1
  fi
done

# ── LO QUE NO CORRE AQUÍ, CON DUEÑO Y MOTIVO ─────────────────────────────
# Vacío a propósito: hoy los veintiún arneses corren sin repos hermanos ni
# red. Si alguno deja de poder, se apunta AQUÍ con su motivo — y el guard de
# zombis de abajo exige que el fichero siga existiendo, para que una exención
# no sobreviva al arnés que eximía.
declare -A EXCLUIDOS=()

mkdir -p "$LOGS"
rojo=0; verdes=0; total_checks=0; lista_rojos=""

# ── el servidor tiene que estar de verdad ────────────────────────────────
# Un arnés contra un puerto muerto falla por el entorno y se lee como
# regresión. Se comprueba ANTES y se declara.
if ! curl -sf -o /dev/null --max-time 5 "$BASE/index.html"; then
  echo "ROJO · no hay nada sirviendo en $BASE"
  echo "       levanta el repo:  python3 -m http.server 8099"
  exit 1
fi

# ── guard de zombis de la lista de exenciones (corolario 6) ──────────────
for e in "${!EXCLUIDOS[@]}"; do
  if [ ! -f "tests/$e" ]; then
    echo "ROJO · exención huérfana: tests/$e ya no existe, borra su entrada"
    exit 1
  fi
  if [ -z "${EXCLUIDOS[$e]}" ]; then
    echo "ROJO · exención sin motivo: $e"
    exit 1
  fi
done

for t in tests/test_*.js tests/test_*.mjs; do
  n="$(basename "$t")"
  [ -n "$PATRON" ] && [[ "$n" != *"$PATRON"* ]] && continue
  if [ -n "${EXCLUIDOS[$n]+x}" ]; then
    echo "EXENTO $n — ${EXCLUIDOS[$n]}"
    continue
  fi

  log="$LOGS/$n.log"
  ini=$(date +%s)
  timeout "$TIEMPO_MAX" node "$t" > "$log" 2>&1
  rc=$?
  seg=$(( $(date +%s) - ini ))

  # El veredicto se LEE. `|| true` porque grep -c devuelve 1 con cero líneas y
  # eso no es un fallo del arnés, es la ausencia de fallos.
  oks=$(grep -c '^OK   ' "$log" || true)
  fallos=$(grep -c '^FAIL ' "$log" || true)
  piso="${PISO[$n]:-1}"

  motivo=""
  [ "$rc" -ne 0 ] && motivo="salió con $rc"
  [ "$rc" -eq 124 ] && motivo="se pasó de $TIEMPO_MAX s"
  [ "$fallos" -gt 0 ] && motivo="${motivo:+$motivo · }$fallos comprobaciones en rojo"
  [ "$oks" -lt "$piso" ] && motivo="${motivo:+$motivo · }publicó $oks comprobaciones y el piso es $piso"

  total_checks=$(( total_checks + oks ))
  if [ -z "$motivo" ]; then
    verdes=$(( verdes + 1 ))
    printf 'OK   %-30s %4d comprobaciones · %ss\n' "$n" "$oks" "$seg"
  else
    rojo=1; lista_rojos="$lista_rojos $n"
    printf 'ROJO %-30s %s · %ss\n' "$n" "$motivo" "$seg"
    echo "     ── últimas líneas de $log ──"
    grep '^FAIL ' "$log" | head -5 | sed 's/^/     /'
    tail -3 "$log" | sed 's/^/     /'
  fi
done

echo
echo "$verdes arneses verdes · $total_checks comprobaciones leídas"
if [ "$rojo" -ne 0 ]; then
  echo "ROJOS:$lista_rojos"
  echo "(el veredicto sale del recuento leído, no del código de salida)"
  exit 1
fi
exit 0
