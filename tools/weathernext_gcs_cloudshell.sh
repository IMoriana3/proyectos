#!/usr/bin/env bash
# Read-only WeatherNext 3 point pilot in FREE interactive Google Cloud Shell.
# No GitHub Actions, no NAS, no Supabase writes, no service-account key files.
set -euo pipefail
if [[ $# -ne 2 ]]; then
  echo "Uso: bash weathernext_gcs_cloudshell.sh LAT LON" >&2
  exit 2
fi
LAT="$1"
LON="$2"
BASE="https://raw.githubusercontent.com/IMoriana3/proyectos/72f527bfd3c73e63c5d980d78cd0dbe646f784bb/tools"
VENV="${HOME}/.cache/wn3-probe-venv"
PROBE="${HOME}/.cache/weathernext_gcs_probe.py"

SECONDS=0
echo "[1/4] Descargando comprobador público de solo lectura..."
mkdir -p "${HOME}/.cache"
curl --fail --silent --show-error --location "$BASE/weathernext_gcs_probe.py" -o "$PROBE"
echo "[2/4] Preparando Python (reutiliza instalación incompleta)..."
if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV"
else
  echo "Entorno Python existente encontrado."
fi
echo "[3/4] Instalando/verificando librerías: AHORA SE VE EL PROGRESO."
echo "La primera instalación puede tardar unos minutos. Espera sin pulsar Ctrl+C."
"$VENV/bin/python" -m pip --disable-pip-version-check install --progress-bar on --timeout 30 --retries 2 \
  'xarray>=2025.1,<2027' 'dask[array]>=2025.1,<2027' \
  'zarr>=3,<4' 'obstore>=0.6,<1'
echo "[4/4] Leyendo Google WeatherNext: una celda, 3 horas y 4 variables..."
echo "No se escribe en Supabase ni en GitHub."
"$VENV/bin/python" "$PROBE" --lat "$LAT" --lon "$LON" --hours 3
echo "Prueba terminada en ${SECONDS} segundos."
