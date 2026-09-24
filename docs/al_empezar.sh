#!/usr/bin/env bash
#
# LO PRIMERO DE CADA SESIÓN, Y ES UNA SOLA ORDEN.
#
# ═══ POR QUÉ ═══
#
# Dos huecos distintos, el mismo modo de fallo: EL VACÍO SE LEE COMO NORMAL.
#
#   · El CI de `siting` llevaba CINCO CORRIDAS EN ROJO y se siguió empujando
#     encima un día entero. De ahí salió `ci_al_dia.sh`.
#   · Dos commits de `proyectos` —la quinta lección y el censo con «SIN
#     MINUTOS»— NUNCA entraron en main: el PR se fusionó con una cabeza anterior
#     y `git checkout -B <rama> origin/main` los tiró sin una palabra. Se
#     descubrió POR CASUALIDAD al tercer día, cuando el PR siguiente salió con
#     conflicto. De ahí salió `reconcilia.sh`.
#
# Un hueco que se encuentra por casualidad al tercer día no está cubierto. Así
# que los dos guardias se corren SOLOS y JUNTOS, al empezar, antes de tocar nada,
# y su respuesta se dice en voz alta.
#
#   bash docs/al_empezar.sh              # los dos, sobre todos los repos
#   bash docs/al_empezar.sh --base /ruta # donde están los clones (por defecto, ..)
#   bash docs/al_empezar.sh --solo-ramas # sólo el barrido de ramas
#   bash docs/al_empezar.sh --solo-ci    # sólo el censo de CI
#
# ═══ LOS TRES ESTADOS, JUNTOS ═══
#
#   rc = 0   se ha mirado TODO y no hay nada pendiente
#   rc = 1   se ha mirado y hay algo: CI en rojo, o trabajo fuera de main
#   rc = 2   NO SE HA PODIDO MIRAR algo (sin red, sin token, sin clon)
#
# El 2 manda sobre el 0 y el 1 manda sobre el 2 sólo cuando el rojo ya está
# confirmado: «no he podido mirar» nunca se publica como «está bien», y un rojo
# confirmado no se degrada a «no comprobado».
set -u

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$AQUI/repos.sh" || { echo "NO SE HA PODIDO MIRAR: falta repos.sh."; exit 2; }

BASE="$(cd "$AQUI/../.." && pwd)"
SOLO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="${2:-}"; shift 2 ;;
    --solo-ramas) SOLO=ramas; shift ;;
    --solo-ci) SOLO=ci; shift ;;
    *) echo "opcion desconocida: $1"; exit 2 ;;
  esac
done

rc_ci=0; rc_ramas=0

# ── 1 · EL CI DE CADA REPO ───────────────────────────────────────────────
if [ "$SOLO" != "ramas" ]; then
  echo "══════════════════════════════════════════════════════════════════════"
  echo " 1 · EL ÚLTIMO CI DE main, REPO A REPO"
  echo "══════════════════════════════════════════════════════════════════════"
  bash "$AQUI/ci_al_dia.sh"
  rc_ci=$?
  echo
fi

# ── 2 · ¿HAY TRABAJO QUE NO ESTÁ EN main? ────────────────────────────────
# El nombre del repo y el de la carpeta no siempre coinciden (`Siting` /
# `siting`, `Cobertura-Zigbee` / `cobertura-zigbee`), así que se resuelve sin
# distinguir mayúsculas. Un repo declarado que no esté clonado NO es un verde:
# es un «no se ha podido mirar», y se cuenta aparte.
if [ "$SOLO" != "ci" ]; then
  echo "══════════════════════════════════════════════════════════════════════"
  echo " 2 · ¿HAY TRABAJO SUBIDO QUE NO ESTÁ EN main?"
  echo "══════════════════════════════════════════════════════════════════════"
  mirados=0; sin_clon=(); con_cosas=(); no_mirados=()
  for r in "${REPOS[@]}"; do
    dir=""
    for cand in "$BASE/$r" "$BASE"/*; do
      [ -d "$cand/.git" ] || continue
      b="$(basename "$cand")"
      if [ "$(printf '%s' "$b" | tr 'A-Z' 'a-z')" = "$r" ]; then dir="$cand"; break; fi
    done
    if [ -z "$dir" ]; then sin_clon+=("$r"); continue; fi
    mirados=$((mirados + 1))
    salida="$(cd "$dir" && bash "$AQUI/reconcilia.sh" 2>&1)"; rc=$?
    case $rc in
      0) printf '  %-20s ✔\n' "$r" ;;
      1) n=$(printf '%s\n' "$salida" | grep -cE '^      [0-9a-f]{7,}')
         printf '  %-20s ⚠  %s\n' "$r" \
           "$([ "$n" -gt 0 ] && echo "$n commit(s) suyos FUERA de main" || echo 'la rama está sucia o desalineada')"
         printf '%s\n' "$salida" | sed -n 's/^      /       /p' | head -8
         con_cosas+=("$r") ;;
      *) printf '  %-20s ·  no se ha podido mirar\n' "$r"; no_mirados+=("$r") ;;
    esac
  done
  echo
  echo "alcance: $mirados repos mirados de ${#REPOS[@]} declarados (piso $PISO_REPOS)"
  [ ${#sin_clon[@]} -gt 0 ] && echo "  SIN CLON aquí, no mirados: ${sin_clon[*]}"
  if [ "$mirados" -lt "$PISO_REPOS" ]; then
    echo "  ALCANCE INSUFICIENTE: esto no ha mirado bastante."
    rc_ramas=2
  elif [ ${#con_cosas[@]} -gt 0 ]; then
    echo
    echo "  HAY TRABAJO FUERA DE main: ${con_cosas[*]}"
    echo "  Ni está perdido ni está en camino: si esos commits tienen que entrar,"
    echo "  abre su PR. Y NO reconcilies esas ramas —el checkout -B los tira—."
    rc_ramas=1
  elif [ ${#no_mirados[@]} -gt 0 ]; then
    rc_ramas=2
  else
    echo "  Nada pendiente: todo lo subido está en main."
  fi
  echo
fi

# ══════════════════════════════════════════════════════════════════════
#  3 · ¿SIGUE CADA COPIA FIJADA CUADRANDO CON SU CANDADO?
# ══════════════════════════════════════════════════════════════════════
#
# La tercera pregunta que ninguna CI hace, por la misma razón que las otras
# dos: cada repo carea SUS copias, y nadie mira el conjunto. Un candado es una
# afirmación sobre bytes y envejece — la copia del gemelo se quedó dos meses
# por detrás con su doctrina escrita en la cabecera.
#
# Y va aquí, además, por algo que pasó el 2026-09-24: un canon se mergeó por
# squash y su sha lo comprobé de casualidad, porque me acordé. Un merge opera
# sobre bytes; si normaliza uno, el careo de otro repo sale rojo mañana con el
# rastro frío. Esto lo pregunta SOLO, todos los días.
echo "══════════════════════════════════════════════════════════════════════"
echo " 3 · ¿SIGUE CADA COPIA FIJADA CUADRANDO CON SU CANDADO?"
echo "══════════════════════════════════════════════════════════════════════"
if [ -f "$AQUI/candados.py" ]; then
  python3 "$AQUI/candados.py" --raiz "$BASE" 2>&1 | sed 's/^/  /'
  rc_cand=${PIPESTATUS[0]}
else
  echo "  SIN COMPROBAR: no está docs/candados.py al lado."
  rc_cand=2
fi
echo

# ── EL VEREDICTO, JUNTO ──────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════════════════════"
if [ "$rc_ci" = "1" ] || [ "$rc_ramas" = "1" ] || [ "$rc_cand" = "1" ]; then
  echo " VEREDICTO: HAY ALGO. Díselo al usuario ANTES de ponerte a trabajar."
  exit 1
fi
if [ "$rc_ci" = "2" ] || [ "$rc_ramas" = "2" ] || [ "$rc_cand" = "2" ]; then
  echo " VEREDICTO: ALGO NO SE HA PODIDO MIRAR. Eso NO es un verde."
  exit 2
fi
echo " VEREDICTO: CI en verde, nada fuera de main y los candados cuadran."
exit 0
