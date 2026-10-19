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
BASE="https://raw.githubusercontent.com/IMoriana3/proyectos/79edd2ebcd9dba2eff263df9fa76a102cc738cf1/tools"
VENV="${HOME}/.cache/wn3-probe-venv"
PROBE="${HOME}/.cache/weathernext_gcs_probe.py"

echo "WeatherNext 3: comprobación puntual; máximo 3 horas, 4 variables."
echo "No se descargan rejillas completas, ni se envían datos a Supabase."
echo "El lector y las librerías se ejecutan en Google Cloud Shell."
mkdir -p "${HOME}/.cache"
python3 -m venv "$VENV"
"$VENV/bin/python" -m pip --disable-pip-version-check install --quiet \
  'xarray>=2025.1,<2027' 'dask[array]>=2025.1,<2027' 'zarr>=3,<4' \
  'obstore>=0.6,<1'
curl --fail --silent --show-error --location \
  "$BASE/weathernext_gcs_probe.py" -o "$PROBE"
"$VENV/bin/python" "$PROBE" --lat "$LAT" --lon "$LON" --hours 3
