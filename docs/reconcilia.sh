#!/usr/bin/env bash
#
# ANTES DE RECONCILIAR UNA RAMA CON `main`: ¿HAY ALGO QUE NO HAYA ENTRADO?
#
# El bucle de trabajo termina en `git checkout -B <rama> origin/main`, y ese
# comando TIRA EN SILENCIO todo commit de la rama que no esté en main. Cuando el
# PR se mergeó con squash, el contenido SÍ está en main aunque los commits no, y
# tirarlos es correcto. Pero si se siguió commiteando DESPUÉS de abrir el PR, o
# el PR se mergeó con una cabeza anterior, esos commits se pierden sin una
# palabra.
#
# PASÓ, Y DOS VECES EL MISMO DÍA (2026-09-24). El PR #511 de `proyectos` se
# mergeó con la cabeza `19f64fc7`; después se empujaron a la MISMA rama la QUINTA
# LECCIÓN (`09069af`) y el cambio del censo a «SIN MINUTOS» (`c81cd9c`). Ninguno
# entró. Se descubrió por casualidad —un conflicto en el PR siguiente— y no
# porque nada lo vigilara. La ironía es que uno de los dos commits perdidos era
# justo la lección de leer el fichero entero antes de tocarlo.
#
# LO QUE COMPRUEBA, que es lo barato y lo que sirve: no mira commits, mira
# CONTENIDO. `git diff origin/main HEAD` vacío significa que todo lo de la rama
# está en main, con squash o sin él. No vacío significa que hay trabajo que NO
# está publicado, y entonces dice QUÉ FICHEROS y se niega.
#
#   bash docs/reconcilia.sh                 # en el repo, sobre la rama actual
#   bash docs/reconcilia.sh --rama <nombre>
#   bash docs/reconcilia.sh --hacerlo       # y si está limpio, reconcilia
#
# rc = 0 todo lo de la rama está en main (se puede reconciliar sin perder nada)
# rc = 1 hay contenido de la rama que NO está en main: NO reconciliar
# rc = 2 no se ha podido comprobar (no es un repo, no hay main, sin red)
set -u

RAMA=""
HACERLO=0
while [ $# -gt 0 ]; do
  case "$1" in
    --rama) RAMA="${2:-}"; shift 2 ;;
    --hacerlo) HACERLO=1; shift ;;
    *) echo "opcion desconocida: $1"; exit 2 ;;
  esac
done

git rev-parse --git-dir >/dev/null 2>&1 || { echo "SIN COMPROBAR: esto no es un repo git."; exit 2; }
[ -n "$RAMA" ] || RAMA=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[ -n "$RAMA" ] && [ "$RAMA" != "HEAD" ] || { echo "SIN COMPROBAR: no hay rama actual (¿HEAD suelto?)."; exit 2; }

BASE=$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
[ -n "$BASE" ] || BASE=main

# La referencia de `main` tiene que estar AL DÍA, o esto compara contra un main
# viejo y da un falso verde — el mismo error que el censo de CI con las
# respuestas rancias.
if ! git fetch origin "$BASE" --quiet 2>/dev/null; then
  echo "SIN COMPROBAR: no se ha podido traer origin/$BASE (¿sin red?)."
  echo "Comparar contra un main viejo daría un verde que no significa nada."
  exit 2
fi
git rev-parse --verify -q "origin/$BASE" >/dev/null || { echo "SIN COMPROBAR: no hay origin/$BASE."; exit 2; }

MAIN=$(git rev-parse "origin/$BASE")
CAB=$(git rev-parse "$RAMA" 2>/dev/null) || { echo "SIN COMPROBAR: no existe la rama «$RAMA»."; exit 2; }

echo "rama    $RAMA  ($(echo "$CAB" | cut -c1-8))"
echo "base    origin/$BASE  ($(echo "$MAIN" | cut -c1-8))"

# SÓLO LO SEGUIDO. Un fichero sin seguir no lo toca `checkout -B` —sobrevive— y
# contarlo como riesgo haría que esta guardia se disparara con su propio fichero
# recién escrito, que fue lo que pasó al probarla. Lo que sí es peligroso son las
# modificaciones de ficheros SEGUIDOS.
SUCIO=$(git status --porcelain --untracked-files=no 2>/dev/null | head -20)
if [ -n "$SUCIO" ]; then
  echo
  echo "ROJO · hay cambios seguidos sin commitear. Reconciliar ahora los mezcla:"
  echo "$SUCIO" | sed 's/^/    /'
  exit 1
fi

# ══ ¿Y EL CLON, ESTÁ AL DÍA CON SU PROPIA REMOTA? ═══════════════════════════
#
# ESTO ACERTABA EL VEREDICTO Y EQUIVOCABA LA CAUSA, que cuesta casi lo mismo
# que fallar el veredicto: manda a mirar donde no es, y enseña a desconfiar de
# sus rojos.
#
# Pasó el 2026-09-24, después de mergear `solargptfull` #274. Esta guardia sacó
# ROJO listando DIEZ ficheros como «la rama aporta esto y no está en main», y
# recomendó abrir un PR nuevo con ellos. Comprobado a mano fichero a fichero:
# CERO diferían, todo estaba dentro. Lo que pasaba es que el PR se había
# actualizado DESDE EL SERVIDOR —el botón «Update branch» de GitHub, o
# `update_pull_request_branch` por API— y ese commit de fusión nace en el
# remoto. El clon local se quedó uno por detrás, y esto comparaba una rama
# rancia contra un main al día.
#
# Y es el MISMO MECANISMO que la ref local rancia de hace unos días: preguntar
# a una referencia LOCAL en vez de al remoto. Arriba se hace bien con `main`
# —hay un `fetch` explícito y un rc = 2 si no se puede— y aquí no se hacía con
# la propia rama. La mitad de la pregunta iba contra datos frescos y la otra
# mitad contra datos viejos.
#
# Sale rc = 2 y no rc = 1 a propósito: no es que haya trabajo fuera, es que
# ESTA PREGUNTA NO SE PUEDE CONTESTAR desde una copia vieja.
if git ls-remote --heads origin "$RAMA" 2>/dev/null | grep -q .; then
  if ! git fetch origin "$RAMA" --quiet 2>/dev/null; then
    echo
    echo "SIN COMPROBAR: no se ha podido traer origin/$RAMA (¿sin red?)."
    echo "Comparar una rama local contra un main al día da hallazgos fantasma."
    exit 2
  fi
  REM=$(git rev-parse --verify -q "origin/$RAMA" 2>/dev/null)
  if [ -n "$REM" ] && [ "$REM" != "$CAB" ]; then
    SOLO_REMOTA=$(git rev-list --count "$CAB".."$REM" 2>/dev/null)
    if [ "${SOLO_REMOTA:-0}" != "0" ]; then
      SOLO_LOCAL=$(git rev-list --count "$REM".."$CAB" 2>/dev/null)
      echo
      echo "SIN COMPROBAR: TU CLON VA POR DETRÁS DE SU PROPIA REMOTA."
      echo
      echo "    local    $RAMA          $(echo "$CAB" | cut -c1-8)"
      echo "    remota   origin/$RAMA   $(echo "$REM" | cut -c1-8)"
      echo
      # EL REMEDIO NO ES EL MISMO EN LOS DOS CASOS, y confundirlos sería repetir
      # el defecto que esto viene a arreglar: acertar el veredicto y equivocar
      # la causa. `--ff-only` es correcto cuando el clon sólo va POR DETRÁS, y
      # FALLA cuando han divergido — ahí hay que decidir, no avanzar.
      if [ "${SOLO_LOCAL:-0}" = "0" ]; then
        echo "    la remota tiene $SOLO_REMOTA commit(s) que tu clon no tiene. Sólo vas por detrás."
        echo
        echo "    HAZ ESTO:  git fetch origin $RAMA && git merge --ff-only origin/$RAMA"
      else
        echo "    HAN DIVERGIDO: la remota tiene $SOLO_REMOTA commit(s) que tu clon no tiene,"
        echo "    y tu clon $SOLO_LOCAL que ella no. Un \`--ff-only\` aquí FALLA, y un"
        echo "    \`checkout -B\` tiraría los tuyos."
        echo
        echo "    MIRA PRIMERO QUÉ HAY DE CADA LADO, y decide:"
        echo "      git log --oneline $CAB..$REM      # lo que sólo tiene la remota"
        echo "      git log --oneline $REM..$CAB      # lo que sólo tienes tú"
      fi
      echo
      echo "    Y NO te creas un rojo de esta guardia hasta entonces: comparando"
      echo "    una rama rancia contra un main al día salen APORTES FANTASMA —"
      echo "    ficheros que parecen no estar en main y sí están—. Pasa siempre"
      echo "    que la rama se actualiza desde el servidor («Update branch»)."
      exit 2
    fi
  fi
fi

ADELANTE=$(git rev-list --count "$MAIN".."$CAB" 2>/dev/null)
DETRAS=$(git rev-list --count "$CAB".."$MAIN" 2>/dev/null)
# NINGUNO DE LOS DOS DIFFS DECIDE BIEN. Los probé los dos y los dos fallan, en
# direcciones opuestas:
#
#   merge-base..HEAD  daba ROJO en toda rama recién mergeada POR SQUASH: sus
#                     commits no son ancestros de main, pero su contenido sí
#                     está dentro. Medido en `scada` y `gemelo-digital`.
#   main..rama        (dos puntos) da ROJO en toda rama que va POR DETRÁS: el
#                     texto NUEVO de main aparece como «inserción» de la rama,
#                     que es el texto VIEJO. Medido en `factiun-cartera`, 1 por
#                     delante y 7 por detrás: 11 inserciones que no eran suyas.
#
# LA PREGUNTA BUENA es otra, y es la que esta guardia quería hacer desde el
# principio: ¿lo que la rama APORTA ya está igual en main? Así que se toman los
# ficheros que la rama toca sobre su base común —eso sí lo dice bien
# `merge-base..HEAD`— y se compara, FICHERO A FICHERO, la versión de la rama
# contra la de main. Si todas coinciden, no hay nada que perder, con squash o
# sin él y esté la rama por detrás lo que esté.
#
# UN FALSO ROJO QUE SE QUEDA, Y A PROPÓSITO: si la rama tocó un fichero y main
# lo cambió DESPUÉS por otra razón, las versiones difieren y esto avisa aunque
# el trabajo de la rama sí entrara. Es el lado seguro: un rojo de más cuesta una
# mirada, un verde de más pierde trabajo.
COMUN=$(git merge-base "$MAIN" "$CAB" 2>/dev/null)
APORTA=$(git diff --stat "$COMUN" "$CAB" 2>/dev/null)
DIF=""
if [ -n "$COMUN" ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    a=$(git show "$MAIN:$f" 2>/dev/null | git hash-object --stdin 2>/dev/null)
    b=$(git show "$CAB:$f"  2>/dev/null | git hash-object --stdin 2>/dev/null)
    [ "$a" != "$b" ] && DIF="$DIF$f"$'\n'
  done <<EOF
$(git diff --name-only "$COMUN" "$CAB" 2>/dev/null)
EOF
fi
echo "commits la rama va $ADELANTE por delante y $DETRAS por detrás"
[ -n "$COMUN" ] && echo "base común $(git rev-parse --short "$COMUN") ($(git log -1 --format=%ci "$COMUN" 2>/dev/null | cut -c1-16))"
echo

# UN FALSO POSITIVO QUE ENCONTRÓ EL PRIMER BARRIDO DE LOS ONCE REPOS: con la rama
# DETRÁS de main y sin ningún commit propio, `git diff` sale lleno —main ha
# avanzado— y esta guardia gritaba «hay contenido fuera» sin poder nombrar un solo
# commit. No hay nada que perder: si la rama no va por delante, TODOS sus commits
# están en main por definición. Lo que decide es el número de commits propios; el
# diff sólo manda cuando los hay.
if [ "$ADELANTE" = "0" ]; then
  echo "VERDE · la rama no va por delante de origin/$BASE: no hay nada suyo que perder."
  if [ "$DETRAS" != "0" ]; then
    echo "        (va $DETRAS commits POR DETRÁS: reconciliar es ponerla al día.)"
  fi
  if [ "$HACERLO" = "1" ]; then
    echo
    echo "reconciliando…"
    git checkout -B "$RAMA" "origin/$BASE" || exit 2
    echo "hecho: $RAMA = origin/$BASE ($(git rev-parse --short HEAD))"
  else
    echo "        Para hacerlo: bash docs/reconcilia.sh --hacerlo"
  fi
  exit 0
fi

if [ -z "$DIF" ]; then
  echo "VERDE · el contenido de la rama está ENTERO en origin/$BASE."
  if [ "$ADELANTE" != "0" ]; then
    echo "        (los $ADELANTE commits de delante son la historia que el squash aplanó:"
    echo "         tirarlos no pierde nada, porque su contenido ya está dentro.)"
  fi
  if [ "$HACERLO" = "1" ]; then
    echo
    echo "reconciliando…"
    git checkout -B "$RAMA" "origin/$BASE" || exit 2
    echo "hecho: $RAMA = origin/$BASE ($(git rev-parse --short HEAD))"
    echo
    echo "  Y EL EMPUJÓN, CON EL SEGURO EXPLÍCITO. El \`checkout -B\` acaba de dejar"
    echo "  el upstream apuntando a origin/$BASE, así que un --force-with-lease a"
    echo "  secas compara contra la referencia EQUIVOCADA y sale «stale info» aunque"
    echo "  la rama local y la remota coincidan. Medido el 2026-09-24, en rf-fv:"
    echo
    echo "    REM=\$(git ls-remote origin $RAMA | cut -f1)"
    echo "    git push --force-with-lease=$RAMA:\$REM origin HEAD:$RAMA"
  else
    echo "        Para hacerlo: bash docs/reconcilia.sh --hacerlo"
  fi
  exit 0
fi

echo "ROJO · LA RAMA APORTA ESTO Y NO ESTÁ EN origin/$BASE:"
echo
echo "$APORTA" | sed 's/^/    /'
echo
echo "    NO reconcilies: \`git checkout -B $RAMA origin/$BASE\` tira esto sin avisar."
echo "    Los commits que lo traen:"
git log --oneline "$MAIN".."$CAB" 2>/dev/null | sed 's/^/      /'
echo
echo "    Si el PR ya se mergeó, es que se mergeó con una cabeza ANTERIOR a estos"
echo "    commits. Abre un PR nuevo con ellos antes de tocar la rama."
exit 1
