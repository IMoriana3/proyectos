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

ADELANTE=$(git rev-list --count "$MAIN".."$CAB" 2>/dev/null)
DETRAS=$(git rev-list --count "$CAB".."$MAIN" 2>/dev/null)
# DOS PREGUNTAS DISTINTAS, Y HACEN FALTA LAS DOS. Me equivoqué en las dos
# direcciones antes de dar con esto:
#
#   DECIDIR  -> `git diff main rama` (dos puntos). ¿Difiere el contenido de la
#               rama del de main? Vacío = todo lo suyo está dentro, CON SQUASH O
#               SIN ÉL, que es para lo que existe esta guardia. Usar aquí la base
#               común daba ROJO en toda rama recién mergeada por squash: sus
#               commits no son ancestros, pero su contenido sí está.
#   CONTAR   -> `merge-base..HEAD`. Qué APORTA la rama. El de dos puntos enseña
#               además, como si fueran borrados suyos, todo lo que main ha
#               añadido por su lado: con una rama 36 commits por detrás son 2.996
#               líneas «borradas» que nadie ha borrado.
#
# Así que se decide con el primero y se INFORMA con el segundo.
COMUN=$(git merge-base "$MAIN" "$CAB" 2>/dev/null)
DIF=$(git diff --stat "$MAIN" "$CAB" 2>/dev/null)
APORTA=$(git diff --stat "$COMUN" "$CAB" 2>/dev/null)
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
