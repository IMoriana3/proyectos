#!/usr/bin/env bash
#
# EL ÚLTIMO CI DE CADA REPO, ANTES DE EMPEZAR A TRABAJAR.
#
# ═══ POR QUÉ EXISTE ═══
#
# El 2026-09-24 se descubrió que el CI de `siting` llevaba CINCO CORRIDAS
# SEGUIDAS EN ROJO —288 a 292— por una línea de continuación que se partió al
# añadir cuatro mutaciones. Diecisiete mutaciones declaradas dejaron de
# correrse, el paso moría con `command not found` y exit 127, y se siguió
# trabajando y empujando encima durante un día entero.
#
# La línea partida fue el defecto. Que pasaran cinco corridas sin que nada
# avisara es OTRA COSA, y es peor: una puerta que nadie mira no es una puerta.
# Da igual lo bien construida que esté.
#
# Este fichero es el mínimo para que no vuelva. No es una puerta de CI: es lo
# PRIMERO que se hace al abrir una sesión, y su respuesta se dice en voz alta
# antes de tocar nada. Es barato a propósito —una llamada por repo— porque una
# comprobación cara al arrancar se acaba saltando.
#
#   bash docs/ci_al_dia.sh              # todos los repos declarados
#   bash docs/ci_al_dia.sh siting       # sólo los que casen con el patrón
#
# ═══ LOS TRES ESTADOS, AQUÍ TAMBIÉN ═══
#
#   rc = 0   se ha mirado y todo está en verde
#   rc = 1   se ha mirado y hay algo en rojo
#   rc = 2   NO SE HA PODIDO MIRAR (sin red, sin token, sin permiso)
#
# El 2 no es un 0 amable: «no he podido comprobar el CI» y «el CI está bien»
# son afirmaciones distintas, y confundirlas es exactamente lo que este
# fichero viene a impedir.
#
set -o pipefail
DUENYO="${DUENYO_GH:-IMoriana3}"

# ── LOS REPOS, DECLARADOS ────────────────────────────────────────────────
# Escritos a mano A PROPÓSITO: una lista sacada de la API traería repos que no
# son de esta suite y escondería el día que uno deje de estar. Si se añade un
# repo al trabajo y no se añade aquí, este fichero no lo mira — y por eso
# publica su ALCANCE abajo, para que el hueco se vea.
REPOS=(
  proyectos siting cobertura-zigbee scada gemelo-digital
  visores checklist-solar-v2 gorraiz-dashboard solargptfull
  factiun-cartera cobertura-rf-fv
)
# `visores` se llamaba `visor-san-jose`. El nombre viejo responde 301 y GitHub
# redirige a `/repositories/{id}`, que el proxy de estas sesiones no deja pasar:
# o sea que con el nombre viejo el repo salía como «NO MIRADO» y un CI en rojo
# podía esconderse ahí. Queda escrito para que nadie lo vuelva a poner.
PISO=8            # MEDIDO: menos repos consultados que esto es no haber mirado

PATRON="${1:-}"
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "NO SE HA PODIDO MIRAR: no hay GITHUB_TOKEN ni GH_TOKEN en el entorno."
  echo "Esto NO es un verde: es que no se ha comprobado el CI de ningún repo."
  exit 2
fi

# `-L` NO es decoración: un repo renombrado responde 301 y sin seguir la
# redirección sale como «no responde o no hay permiso» — o sea, un repo rojo
# podría esconderse detrás de un cambio de nombre. Pasó con `visor-san-jose`
# la primera vez que se corrió esto.
api() { curl -sSL --max-time 20 -H "Authorization: Bearer $TOKEN" \
        -H "Accept: application/vnd.github+json" "$1" 2>/dev/null; }

# ── POR QUÉ UN REPO «NO RESPONDE»: RED, PERMISO O RENOMBRADO ──────────────
# La primera versión de esto decía «no responde o no hay permiso» para los tres
# casos, y con eso un repo RENOMBRADO desaparece del radar en silencio: sale
# igual que uno caído, nadie lo persigue, y su CI deja de mirarse sin que nada
# avise. Pasó con `visor-san-jose` → `visores` el 2026-09-24.
#
# Los códigos están MEDIDOS en este entorno, no supuestos:
#   200  bien
#   301  RENOMBRADO. GitHub redirige a `/repositories/{id}` y el proxy de estas
#        sesiones no deja pasar esa ruta, así que el nombre nuevo NO se puede
#        sacar de aquí: hay que buscarlo y corregir la lista a mano.
#   403  sin permiso O no existe. El proxy devuelve el MISMO 403 para «el repo
#        no está en el alcance de esta sesión» y para «ese repo no existe», así
#        que aquí no se distinguen — y se dice, en vez de elegir uno.
#   404  no existe (fuera de este proxy).
#   000  RED: no se ha llegado a hablar con GitHub.
# OJO CON EL `|| echo 000`: curl YA imprime `000` cuando no llega a hablar con
# el servidor, y ADEMÁS sale con código != 0, así que el `||` añadía un segundo
# y salía «HTTP 000000», que no casa con ningún caso y caía al comodín. Salió
# probándolo con un host inválido, no leyéndolo.
sonda() {
  local c
  c=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
      -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/$DUENYO/$1" 2>/dev/null)
  echo "${c:-000}"
}
porque() {
  case "$1" in
    301) echo "RENOMBRADO · corrige la lista de este fichero" ;;
    403) echo "sin permiso o no existe (el proxy da el mismo 403 para los dos)" ;;
    404) echo "no existe" ;;
    000|"") echo "RED · no se ha llegado a hablar con GitHub" ;;
    *) echo "HTTP $1" ;;
  esac
}

printf '%-20s %-10s %-9s %-10s  %s\n' repo rama corrida estado título
printf '%-20s %-10s %-9s %-10s  %s\n' '--------------------' '----------' '---------' '----------' '------'

mirados=0; rojos=0; nc=0; lista_rojos=""; renombrados=""; declarados=0; infra=""
for r in "${REPOS[@]}"; do
  [ -n "$PATRON" ] && [[ "$r" != *"$PATRON"* ]] && continue
  declarados=$((declarados+1))
  rama=$(api "https://api.github.com/repos/$DUENYO/$r" | \
         python3 -c 'import sys,json;print(json.load(sys.stdin).get("default_branch",""))' 2>/dev/null)
  if [ -z "$rama" ]; then
    cod=$(sonda "$r")
    printf '%-20s %-10s %-9s %-10s  %s\n' "$r" "?" "-" "⚠ NO MIRADO" "$(porque "$cod")"
    nc=$((nc+1)); [ "$cod" = "301" ] && renombrados="$renombrados $r"; continue
  fi
  # LA RESPUESTA TIENE QUE SER DE ESTE REPO, Y ESO SE COMPRUEBA.
  # El 2026-09-24 el censo publicó una vez «cobertura-rf-fv#4 failure». Ese
  # repo no tiene ninguna corrida número 4 —comprobado sobre sus doce últimas—
  # y el 4 era el número de `factiun-cartera`, la fila JUSTO ANTERIOR. No
  # reprodujo: `read` resetea bien sus variables y la API devuelve #41 success
  # de forma consistente. O sea que no sé qué lo produjo.
  #
  # Lo que NO se hace es apuntarlo como transitorio y seguir: un censo que se
  # puede equivocar de repo es peor que no tenerlo, porque el error se lee como
  # un hallazgo. Así que cada respuesta declara de qué repo es y se carea con
  # el que se preguntó. Si no cuadra, sale NO MIRADO con el motivo, no un
  # veredicto sobre el repo equivocado.
  # LA CABEZA DE LA RAMA, para saber si la corrida es DE ESTE CÓDIGO.
  cabeza=$(api "https://api.github.com/repos/$DUENYO/$r/commits/$rama" | \
           python3 -c 'import sys,json;print(json.load(sys.stdin).get("sha","")[:40])' 2>/dev/null)
  ultima() { api "https://api.github.com/repos/$DUENYO/$1/actions/runs?branch=$2&per_page=10" | \
    CABEZA="$3" \
    REPO_ESPERADO="$1" python3 -c '
import sys, json, os
esperado = os.environ.get("REPO_ESPERADO", "")
cabeza = os.environ.get("CABEZA", "")
try: d = json.load(sys.stdin).get("workflow_runs", [])
except Exception: print("|||"); raise SystemExit
if not d:
    print("-|sin corridas|-|")
else:
    # NO SE COGE `d[0]`: se ORDENA aquí por fecha. El endpoint ha devuelto dos
    # veces una corrida de semanas atrás como si fuera la última (ver la
    # cabecera), y pedir diez y ordenarlas quita la parte del problema que sea
    # de ordenación. La que sea de caché la caza el careo de abajo.
    d.sort(key=lambda z: z.get("created_at", ""), reverse=True)
    x = d[0]
    dice = ((x.get("repository") or {}).get("name") or "").lower()
    if dice and esperado and dice != esperado.lower():
        print("-|OTRO REPO|-|la respuesta dice ser de «%s»" % dice)
    else:
        est = x["conclusion"] if x["status"] == "completed" else x["status"]
        titulo = x["display_title"][:44]
        # LA DURACION, para separar «el código falla» de «nunca hubo runner».
        dur = ""
        try:
            import datetime as _dt
            _a = _dt.datetime.fromisoformat(x["run_started_at"].replace("Z", "+00:00"))
            _b = _dt.datetime.fromisoformat(x["updated_at"].replace("Z", "+00:00"))
            dur = str(int((_b - _a).total_seconds()))
        except Exception:
            dur = ""
        idjob = str(x.get("id", ""))
        # ¿ES DE ESTE CÓDIGO? Si la corrida no es de la cabeza de la rama, su
        # veredicto es sobre OTRO commit, y eso hay que decirlo: puede ser una
        # respuesta rancia, o puede ser que el último empuje no disparara nada
        # —que es lo que pasa en repos cuyo workflow sólo corre en `main`—.
        if cabeza and x.get("head_sha") and x["head_sha"] != cabeza:
            titulo = "NO ES DE LA CABEZA (%s, %s) · %s" % (x["head_sha"][:7], x["created_at"][:10], titulo[:20])
            est = "rancia:" + str(est)
            dur = dur or "" 
        print("%s|%s|%s|%s|%s|%s" % (x["run_number"], est, x["created_at"][:10], dur, idjob, titulo))' 2>/dev/null; }

  # UN REINTENTO, Y SÓLO PARA ESTO. La respuesta ha llegado RANCIA tres veces en
  # una sesión —una página entera de corridas viejas del repo correcto, así que
  # ordenar por fecha no ayuda—, y un reintento separa lo transitorio de lo
  # real: `gorraiz-dashboard` dio una corrida de marzo una vez y luego 20 de 20
  # correctas; `factiun-cartera` da la de junio SIEMPRE, porque su CI de verdad
  # lleva desde junio sin correr sobre `main`.
  #
  # Esto NO es «reintentar hasta que salga verde»: el reintento sólo se usa
  # cuando la corrida no es de la cabeza, y si la segunda tampoco lo es, se
  # publica NO MIRADO con las dos fechas. Un rojo nunca se reintenta.
  linea=$(ultima "$r" "$rama" "$cabeza")
  case "$linea" in
    *"|rancia:"*) linea=$(ultima "$r" "$rama" "$cabeza") ;;
  esac
  IFS='|' read -r num est fecha dur idrun titulo <<< "$linea"

  # ══ «NUNCA HUBO RUNNER» NO ES UN FALLO DE CÓDIGO ═════════════════════════
  #
  # Medido el 2026-09-24. Los dos repos PRIVADOS de la suite dan esta firma y
  # ninguno de los nueve públicos:
  #
  #   factiun-cartera   runner=''  pasos=0   corrida de   4 s
  #   solargptfull      runner=''  pasos=0   corrida de  54 s
  #   gemelo-digital    runner='GitHub Actions 1000019148'  pasos=5   ← rojo REAL
  #
  # El job no llega a despacharse: no corre ni `actions/checkout`, y los logs
  # devuelven 404 porque nunca se escribieron. Los minutos de repos privados se
  # facturan y los de públicos no, así que esto apunta a minutos agotados o a un
  # límite de gasto — cosa de la cuenta, no del código. Leerlo como «rojo» manda
  # a alguien a buscar un defecto que no existe.
  #
  # EL CRITERIO NO ES LA DURACIÓN, Y ESO SE APRENDIÓ PROBÁNDOLO. La primera
  # versión exigía «menos de 10 s», y con eso `solargptfull` —que tarda 54— se
  # leía como rojo de código durante horas. Lo que manda es que el job NO TENGA
  # RUNNER y NO TENGA PASOS; el tiempo es incidental.
  #
  # Se mira sólo a los jobs que FALLARON, y hacen falta los dos: un job
  # `skipped` también sale con runner nulo y cero pasos, y no significa nada.
  # LA FIRMA MANDA SOBRE LA ANTIGÜEDAD. Una corrida sin minutos dice más que
  # «no es de la cabeza»: la segunda es cierta pero no explica nada, y en un
  # repo cuyo flujo está a mano A PROPÓSITO sería permanente y se leería como
  # ruido. Así que se mira la firma también en las rancias, y si aparece, gana.
  if [ -n "$idrun" ] && ! echo "$est" | grep -qE '^(success|in_progress|queued)'; then
    firma=$(api "https://api.github.com/repos/$DUENYO/$r/actions/runs/$idrun/jobs" | \
      python3 -c '
import sys, json
try: j = json.load(sys.stdin).get("jobs", [])
except Exception: j = []
malos = [x for x in j if x.get("conclusion") == "failure"]
if malos and all(not (x.get("runner_name") or "") and not x.get("steps") for x in malos):
    print("sin_runner")' 2>/dev/null)
    if [ "$firma" = "sin_runner" ]; then
      case "$est" in
        rancia:*) titulo="SIN MINUTOS: nunca hubo runner · y además la corrida NO es de la cabeza" ;;
        *)        titulo="SIN MINUTOS: nunca hubo runner (0 pasos, ${dur}s) · $titulo" ;;
      esac
      est="infra:$est"
    fi
  fi

  mirados=$((mirados+1))
  case "$est" in
    success)            icono="✅ verde" ;;
    "sin corridas")     icono="— sin CI"; mirados=$((mirados-1)); nc=$((nc+1)) ;;
    "OTRO REPO")        icono="⚠ NO MIRADO"; mirados=$((mirados-1)); nc=$((nc+1)) ;;
    rancia:*)           icono="⚠ NO MIRADO"; mirados=$((mirados-1)); nc=$((nc+1)) ;;
    infra:*)            icono="🔌 SIN MINUTOS"; infra="$infra $r#$num" ;;
    in_progress|queued) icono="… en marcha" ;;
    "")                 icono="⚠ NO MIRADO"; mirados=$((mirados-1)); nc=$((nc+1)) ;;
    *)                  icono="❌ $est"; rojos=$((rojos+1)); lista_rojos="$lista_rojos $r#$num" ;;
  esac
  printf '%-20s %-10s %-9s %-10s  %s\n' "$r" "${rama:0:10}" "${num:-–}" "$icono" "${titulo:-}"
done

echo ""
# ── EL ALCANCE, Y EL PISO QUE NO APLICA CUANDO SE PIDE UN TROZO ──────────
# El piso existe para que una corrida COMPLETA que mire poco salga con 2. Pero
# `ci_al_dia.sh siting` es pedir un trozo a propósito, y con el piso puesto
# salía SIEMPRE con 2 — o sea que el modo documentado en la cabecera no servía
# para nada. Se vio probándolo, no leyéndolo.
# Con patrón el piso no aplica, y a cambio NUNCA se dice «todos en verde»:
# se dice cuántos de los que casan, que es lo único que se ha mirado.
if [ -n "$PATRON" ]; then
  echo "alcance PARCIAL A PROPÓSITO (patrón «$PATRON»): $mirados de ${#REPOS[@]} repos · $nc sin poder mirar"
else
  echo "alcance: $mirados repos consultados de ${#REPOS[@]} declarados (piso $PISO) · $nc sin poder mirar"
fi
if [ -z "$PATRON" ] && [ "$mirados" -lt "$PISO" ]; then
  echo "ALCANCE INSUFICIENTE: se han podido mirar $mirados y el piso son $PISO."
  echo "Una puerta verde afirma dos cosas: «he mirado» y «está bien». Esto no ha mirado."
  exit 2
fi
# ── LOS QUE RESPONDEN TIENEN QUE SER LOS DECLARADOS ──────────────────────
# El piso dice «has mirado bastantes». Esto dice otra cosa: «has mirado TODOS
# los que dices vigilar». La lista puede quedarse vieja —un repo renombrado, uno
# que cambia de dueño, uno archivado— y sin esta comprobación el censo sigue
# saliendo verde con un hueco dentro. Es alcance otra vez.
if [ "$mirados" != "$declarados" ]; then
  echo "LA LISTA NO CUADRA: responden $mirados de los $declarados declarados."
  [ -n "$renombrados" ] && echo "  RENOMBRADO(S):$renombrados — busca el nombre nuevo y corrígelo en REPOS."
  echo "  Un repo de la lista que no responde NO se ha comprobado. Eso no es un verde:"
  echo "  la lista de repos vigilados se queda vieja sin que nada avise, y su CI deja"
  echo "  de mirarse en silencio."
  [ -n "$lista_rojos" ] && echo "  (y además, EN ROJO:$lista_rojos)"
  exit 2
fi
if [ -n "$infra" ]; then
  echo "SIN MINUTOS — no es fallo de código:$infra"
  echo "  El job falló SIN RUNNER y SIN PASOS: no llegó a despacharse, no corrió ni"
  echo "  el checkout, y sus logs no existen. No es la duración lo que lo dice —uno"
  echo "  tarda 4 s y otro 54—, es que nunca hubo runner."
  echo "  Los minutos de repos PRIVADOS se facturan y los de públicos no. Se mira en"
  echo "  Settings → Billing → Actions, no en el código."
  echo "  Y ANTES DE «ARREGLAR» NADA: lee la cabecera ENTERA del flujo. Una puerta"
  echo "  apagada a propósito se lee igual que una rota, y la diferencia suele estar"
  echo "  escrita justo encima del bloque \`on:\` — no desde donde casó tu patrón."
fi
if [ -n "$lista_rojos" ]; then
  echo "EN ROJO:$lista_rojos"
  echo "Díselo al usuario ANTES de ponerte a trabajar, y no des por cerrada ninguna"
  echo "tarea de esos repos hasta ver cerrar su corrida."
  exit 1
fi
if [ "$nc" != "0" ]; then
  echo "$nc repo(s) no se han podido mirar. Eso NO es un verde entero: dilo."
  exit 2
fi
if [ -n "$PATRON" ]; then
  echo "los $mirados que casan con «$PATRON», en verde. El RESTO no se ha mirado."
else
  echo "todos en verde. Ahora sí."
fi
