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
  # La cartera del usuario NO la probaba nadie: de los 33 arneses, el único que
  # nombraba `cartera-tabla.html` era `test_pwa.js`, y lo que hacía con ella era
  # listarla en la caché. MEDIDO: un mutante que invierte la migración de fases
  # —cada «Terminado» del usuario pasa a «Sin empezar» en su cartera guardada—
  # mató CERO en `test_pwa`, `test_index` y `test_integridad`, y ningún otro
  # arnés abre el fichero, así que ése era el cuadro completo. Lo que hay
  # debajo son datos de verdad y sin vuelta atrás: `migrateFases` reescribe lo
  # guardado en CADA carga, y `publishSpecs` escribe `factiun_plantas`, el
  # registro que LEEN los demás visores.
  [test_cartera.js]=45
  [test_comparador.js]=304
  [test_comparador_3d.js]=247
  [test_comparador_sitio.js]=36
  [test_ejecucion_traza.mjs]=61
  # 8 y no 9 A PROPÓSITO, y esto es un HUECO DECLARADO, no un listón flojo.
  #
  # CORREGIDO: la primera versión de esta nota decía que la novena
  # comprobación «carea el espejo commiteado contra la FUENTE» y que cerrarla
  # exigía un secreto de solo lectura sobre `SolarGPTfull`. Las dos cosas eran
  # falsas, y se ven leyendo el arnés:
  #
  #   · el careo contra la fuente SÍ ocurre —lo hace «el espejo de este repo
  #     está en orden», con la regla extraída a función pura— y sin el hermano
  #     degrada a auto-consistencia contra el `.sha256` commiteado. El propio
  #     arnés lo dice en su salida: «SIN repo hermano: no se ha podido carear
  #     (modo declarado, no aprobado)». Y las cuatro combinaciones de la regla
  #     —espejo viejo, al día, sin hash, sin espejo— se ejercitan SIEMPRE sobre
  #     la función pura, aquí incluido.
  #   · la que no corre es otra: «el generador del core escribe también el
  #     espejo y su hash», que lee `solargpt/scripts/gen_goldens_hailstow.py`
  #     de `SolarGPTfull`.
  #
  # O sea que lo que falta en CI no es el careo, es comprobar que el generador
  # del core sigue escribiendo el espejo. Y eso NO necesita secreto ninguno:
  # el generador vive en `SolarGPTfull`, así que la comprobación se cierra
  # ALLÍ, en su propia suite, sin clonar nada.
  #
  # HECHO, y esta línea se actualiza porque un hueco declarado también se
  # mantiene: una nota que sigue diciendo «queda por hacer» sobre algo ya
  # hecho miente con la autoridad de estar escrita al lado del código.
  # Está en `solargpt/tests/test_generadores_de_espejo.py`, y cierra MÁS de
  # lo que esta nota pedía:
  #
  #   · no lo GREPEA, lo EJECUTA. La comprobación de aquí exige que el fuente
  #     del generador mencione `hailstow_casos.sha256`, y un grep sigue verde
  #     si la promesa está escrita en un comentario y ha dejado de cumplirse.
  #     Allí se corre `main()` con el destino parcheado y se mira lo escrito.
  #   · y son DOS generadores, no uno: `gen_goldens_ejecucion.py` tenía el
  #     contrato idéntico y no tenía guardián en NINGÚN repo — ni siquiera el
  #     grep que el de granizo sí tenía desde aquí.
  #
  # El piso sigue siendo 8, pero YA NO por lo mismo: no porque falte cerrar
  # nada, sino porque la novena comprobación de este arnés necesita el
  # checkout hermano y en esta CI no está. Eso no se arregla subiendo el
  # listón; se quedaría rojo en cada tirada.
  #
  # Y una advertencia sobre esta nota misma: el nombre del fichero de allí es
  # PROSA, y nada de este repo lo comprueba. Se pensó un careo textual —«que
  # algún test de la suite hermana nombre el generador»— y se descartó al
  # medirlo: `test_stow_machine.py` ya lo nombraba ANTES de que el guardián
  # existiera, así que ese oráculo habría estado verde con el hueco abierto,
  # y un oráculo que pasa con el bug puesto no es un oráculo. Si aquel
  # fichero se renombra, esta línea envejece y solo la caza quien lea los dos
  # repos. Queda dicho aquí en vez de fingir que hay una red debajo.
  [test_granizo_espejo.mjs]=8
  [test_granizo_pestana.js]=28
  [test_granizo_traza.mjs]=30
  [test_index.js]=18
  [test_integridad.js]=7
  [test_layout.js]=201
  [test_layout_ui.js]=182
  [test_pwa.js]=21
  # El careo que faltaba entre DOS FICHAS: `cartera-tabla.html` escribe
  # `factiun_plantas` con `publishSpecs` y `index.html` lo lee en `SPECS` para
  # poner la potencia junto al nombre. Cada lado tenía ya su banco y ninguno
  # comprobaba que encajaran; aquí se corre el `publishSpecs` DE VERDAD y lo
  # que escribe se le da a la portada.
  #
  # MEDIDO: contra `test_index`, `test_integridad` y `test_pwa` mataron CERO la
  # potencia redondeada siempre a entero, el orden por nombre invertido, la
  # cuenta de estados contando doble y la búsqueda mirando solo el nombre.
  #
  # Y el CONTROL POSITIVO encontró una comprobación cuyo NOMBRE miente: con
  # `cardHTML` devolviendo cadena vacía —todas las tarjetas de herramienta en
  # blanco— `test_index` seguía verde, incluida la llamada «se pintan las
  # tarjetas». Cuenta `article.card` sin distinguir, y las de PLANTA solas ya
  # pasan de cinco. Aquí se cuentan por rejilla.
  [test_portada.js]=42
  # El hueco de `sim-solar.html` NO era «no la abre nadie»: `test_buscador.js`
  # sí corre `solarGeom` y `singleaxis` de esta ficha en el navegador —romper
  # `singleaxis` mata 9 allí, y romper la marca del bloque, 4—. Lo que no había
  # era NINGÚN valor fijado: allí solo se comprueba un ORDEN (el eje N-S vale 1
  # y girarlo cuesta más cada vez), y un orden sobrevive a casi cualquier error
  # de valor. MEDIDO: contra los CINCO arneses que podían verlo, mataron CERO
  # el día juliano corrido un día entero, el backtracking quitado del todo y la
  # refracción anulada. Este banco los mata 4, 5 y 3.
  [test_solar.js]=73
  [test_sizing.js]=115
  # Nace de un hueco MEDIDO: con el `hold` de la histéresis puesto a cero en
  # la llamada real, los diez arneses que abren la ficha —539 comprobaciones—
  # se quedaron verdes. La histéresis se podía borrar y el repo no lo notaba.
  [test_viento_abanderamiento.js]=33
  # De la batería de mutación del 2026-09-10: SIETE mutantes sobre mecanismos
  # que ningún arnés nombraba —Gumbel, lazo de control, denominador del pasivo—
  # mataron CERO comprobaciones contra los 238 de los arneses de viento. Estos
  # dos ficheros los cazan.
  [test_viento_control.js]=28
  # De la SEGUNDA batería, la del control positivo: `parseCSV` con el separador
  # menos frecuente, `rosa` repartiendo por truncamiento y `pasivo` sin
  # reenganche por cruce mataron CERO cada uno. El de CSV no es un hueco de
  # banco sino de CAMINO: cuelga del manejador de subida, que ningún arnés
  # dispara — y se cierra igual, porque el código existe y decide.
  [test_viento_csv.js]=31
  [test_viento_ejes.js]=77
  # Las dos fuentes sintéticas INVENTAN datos a propósito, y lo que este arnés
  # vigila sobre todo es que lo DECLAREN: viento cero y rumbo NaN en el cielo
  # claro, y `sin_irradiancia` al completar. Ninguna aparecía en un arnés.
  [test_viento_fuente.js]=28
  [test_viento_gumbel.js]=24
  # `runMulti` produce los MÁXIMOS ANUALES que come Gumbel, así que un error en
  # el troceado por años no da un fallo: da otro viento de diseño. Se prueba la
  # orquestación con un espía en el sitio de `LOC.run`, sin traer el motor.
  [test_viento_multi.js]=28
  [test_viento_pasivo.js]=30
  [test_viento_planta.js]=35
  # De la TERCERA pasada: intercambiar los factores de vista del cielo y el
  # suelo en `LOC.poa` —la transposición de la que sale toda la energía— mató
  # CERO contra los TRECE arneses de viento. Medido con el árbol limpio y nada
  # más corriendo.
  [test_viento_poa.js]=30
  [test_viento_rafaga_medida.js]=39
  [test_viento_reproductor.js]=18
  [test_viento_rosa.js]=23
  # El CONTROL POSITIVO de la segunda batería —declinación de 23,45° a 13,45°,
  # que mueve el ángulo de seguimiento hasta 13,8°— murió CERO contra los nueve
  # arneses de viento. Verificado que el instrumento medía: con un error de
  # sintaxis inyectado, el navegador sí lo ve. Este arnés ancla la geometría a
  # astronomía de manual.
  [test_viento_sol.js]=28
  # El careo de las DOS cabezas del abanderamiento: la de serie (informe) y la
  # de paso a paso (panel en vivo). Encontró que `stepperPasivo` reenganchaba
  # solo por proximidad mientras `pasivo` ya llevaba el criterio de cruce: a
  # paso de una hora, 3 pasos sueltos contra 24.
  [test_viento_steppers.js]=17
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
# Vacío: ningún arnés está exento. Si alguno deja de poder correr, se apunta
# AQUÍ con su motivo — y el guard de zombis de abajo exige que el fichero siga
# existiendo, para que una exención no sobreviva al arnés que eximía.
#
# CORRECCIÓN, y va escrita porque la versión anterior de este comentario decía
# lo contrario: NO es cierto que los veintiún arneses den lo mismo con red que
# sin ella. Lo escribí midiendo que ninguno NOMBRA un host externo, que es otra
# cosa, y la primera tirada de CI lo desmintió — `test_layout_ui` comprueba que
# la cascada de fuentes de terreno caiga al siguiente peldaño cuando la primera
# falla, y con red DE VERDAD la cascada aterriza en un peldaño que el arnés no
# intercepta. O sea que ese arnés depende de NO tener red, justo al revés de lo
# que yo había afirmado. Se arregla en su sitio (interceptando también ese
# peldaño), no aquí: una exención lo taparía.
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
    # 25 y no 3. Con 3 líneas, un arnés que revienta enseña el pie de la traza
    # —«}», vacío, «Node.js v22»— y ni una palabra del error: medido en la
    # tirada #2 de esta puerta, que dejó cuatro rojos ilegibles. El log entero
    # va en el artefacto, pero el que lee la consola tiene que poder empezar
    # por aquí.
    tail -25 "$log" | sed 's/^/     /'
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
