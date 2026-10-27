#!/usr/bin/env bash
#
# ¿MUERDEN LOS CUATRO BANCOS DE METEO?
#
# Los cuatro pasaron del convenio `node:assert` —que calla al pasar y no
# publica recuento— al del portón. Eso los hace CONTABLES, que es lo que la
# puerta necesita, pero no demuestra nada sobre si comprueban algo: un banco
# que publica ochenta líneas `OK` y no muerde es peor que ninguno, porque
# ocupa el sitio de una vigilancia que no existe.
#
# Así que se rompe a propósito el código que cada uno vigila y se exige que se
# ponga ROJO. Una mutación que sobrevive señala una comprobación que no está.
#
# CÓMO SE RESTAURA, Y POR QUÉ ASÍ: la copia se guarda antes, se escribe de
# vuelta al acabar cada mutación y se CAREA POR sha256. No se usa
# `git checkout -- .`: eso borra también lo que no está comiteado, y en esta
# misma sesión ya se llevó por delante trabajo sin guardar.

set -u
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 1

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# LA TABLA VA SIN SEPARADOR: cinco elementos consecutivos por mutación, en
# este orden —banco, fichero a romper, ancla, sustituto, qué error imita.
#
# Sin separador porque los anclas son JavaScript y ya han roto dos intentos:
# con `|` se partían por los `||` del propio código, y con `§` se partían por
# la mitad porque es multibyte y el IFS de bash corta por BYTES, no por
# caracteres. Las dos veces los campos salieron corridos y el arnés acusó a
# bancos que no había llegado a tocar.
MUTACIONES=(
  "test_meteo_forecast_cache.mjs"
  "lib/meteo-forecast-cache.js"
  'run_time_utc:new Date(row.init_time).toISOString()'
  'run_time_utc:row.init_time'
  "deja de canonizar la hora de pasada"

  "test_meteo_weathernext_comparison.mjs"
  "lib/meteo.js"
  'mae:count?sum(r=>Math.abs(r.difference))/count:null'
  'mae:count?sum(r=>r.difference)/count:null'
  "el error medio sin valor absoluto"

  "test_meteo_weathernext_transport.mjs"
  "lib/meteo.js"
  'for(let i=0;i<total;i++){'
  'for(let i=0;i<total-1;i++){'
  "una hora de menos en la serie"

  "test_meteo_weathernext_contract.mjs"
  "lib/weather-contract.js"
  'const pkg={
    schema_version:WEATHER_CONTRACT_VERSION,'
  'const pkg={
    schema_version:"9.9.9",'
  "sella el contrato con otra versión"

  "test_meteo_weathernext_contract.mjs"
  "lib/weather-contract.js"
  'if(val!==null)out[field]=val;'
  'out[field]=val===null?0:val;'
  "un cuantil que falta pasa a valer 0"
)

# ── UN HUECO ENCONTRADO Y NO TAPADO ──────────────────────────────────────
#
# La primera mutación que se probó contra el contrato atacaba la guarda de
# versión de `publishWeatherContract` (lib/weather-contract.js:241) y
# SOBREVIVIÓ. No porque al banco le falte una aserción, sino porque ese banco
# no llama a esa función en absoluto: sólo usa `buildWeatherContract` y
# `browserConsumerStamp`. O sea que `publishWeatherContract`, `loadWeatherContract`,
# `loadActiveWeatherContract`, `activeWeatherRef` y `clearActiveWeatherContract`
# están SIN CUBRIR.
#
# La mutación se cambió a la versión que el banco sí sella —línea 152, dentro
# de `buildWeatherContract`— porque un arnés con una mutación viva no da
# veredicto y lo que aquí se quería medir es si los cuatro bancos muerden.
# Pero el hueco queda escrito: cubrir la publicación y la carga del contrato
# es trabajo aparte, y no haberlo hecho no es lo mismo que no hacer falta.
#
# UNA TABLA MAL FORMADA CORRE LOS CAMPOS Y EL ARNÉS MIENTE SIN ENTERARSE: eso
# es lo que pasó dos veces montando esto. Así que se comprueba antes.
if (( ${#MUTACIONES[@]} % 5 != 0 )); then
  echo "ROJO · la tabla de mutaciones tiene ${#MUTACIONES[@]} elementos, que no es múltiplo de 5"
  exit 1
fi

vivas=0; muertas=0; sin_aplicar=0
printf "%-42s %-46s %s\n" "BANCO" "MUTACIÓN" "VEREDICTO"
for ((k=0; k<${#MUTACIONES[@]}; k+=5)); do
  banco="${MUTACIONES[k]}"; fichero="${MUTACIONES[k+1]}"
  viejo="${MUTACIONES[k+2]}"; nuevo="${MUTACIONES[k+3]}"; motivo="${MUTACIONES[k+4]}"
  antes="$(sha256sum "$fichero" | cut -d' ' -f1)"
  cp "$fichero" "$TMP/copia"

  if ! grep -qF -- "$viejo" "$fichero"; then
    printf "  %-40s %-46s NO MUERDE · el texto ya no está en %s\n" "$banco" "$motivo" "$fichero"
    vivas=$((vivas+1)); continue
  fi
  # UNA MUTACIÓN QUE NO SE APLICA NO DICE NADA DEL BANCO.
  #
  # Si el ancla no está, o está más de una vez, esto ABORTA la iteración. La
  # primera versión no lo hacía: seguía adelante, corría el banco sobre el
  # fichero SIN mutar, lo veía pasar y lo apuntaba como «SOBREVIVE» — o sea
  # acusaba al banco de no tener una comprobación cuando lo que había pasado
  # es que no se le había puesto nada delante. Es el mismo error que un piso
  # en verde por no haber corrido nada: confundir «no he podido mirar» con
  # «he mirado y está mal».
  if ! python3 -I - "$fichero" "$viejo" "$nuevo" <<'PY'
import io,sys
p,viejo,nuevo=sys.argv[1],sys.argv[2],sys.argv[3]
s=io.open(p,encoding='utf8').read()
n=s.count(viejo)
if n!=1:
    sys.stderr.write("el ancla aparece %d veces, no 1\n" % n)
    sys.exit(1)
io.open(p,'w',encoding='utf8').write(s.replace(viejo,nuevo))
PY
  then
    cp "$TMP/copia" "$fichero"
    printf "  %-40s %-46s NO APLICADA · el ancla no es única\n" "$banco" "$motivo"
    sin_aplicar=$((sin_aplicar+1)); continue
  fi
  salida="$(timeout 120 node "tests/$banco" 2>&1)"; rc=$?
  fallos="$(printf '%s' "$salida" | grep -c '^FAIL ' || true)"

  cp "$TMP/copia" "$fichero"
  despues="$(sha256sum "$fichero" | cut -d' ' -f1)"
  if [ "$antes" != "$despues" ]; then
    echo "ROJO · la restauración de $fichero NO ha dejado el fichero como estaba"
    echo "       antes=$antes  despues=$despues"
    exit 1
  fi

  if [ "$rc" -ne 0 ] || [ "$fallos" -gt 0 ]; then
    printf "  %-40s %-46s MUERE (rc=%s, %s FAIL)\n" "$banco" "$motivo" "$rc" "$fallos"
    muertas=$((muertas+1))
  else
    printf "  %-40s %-46s SOBREVIVE\n" "$banco" "$motivo"
    vivas=$((vivas+1))
  fi
done

echo
echo "  $muertas muertas · $vivas vivas · $sin_aplicar sin aplicar"
if [ "$sin_aplicar" -gt 0 ]; then
  echo "  NO COMPROBADO: alguna mutación no se ha aplicado, así que de ese banco"
  echo "  no se sabe nada. Arregla el ancla antes de leer el resto."
  exit 2
fi
if [ "$vivas" -gt 0 ]; then
  echo "  ROJO: una mutación viva es una comprobación que falta."
  exit 1
fi
echo "  MIDE: los cuatro bancos muerden."
exit 0
