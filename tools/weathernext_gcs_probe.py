#!/usr/bin/env python3
"""WeatherNext 3 GCS Zarr access probe (read-only, noncanonical).

One 0.1-degree grid point, at most six hourly steps, up to four variables.
No download of a global grid, no write, no Supabase/GitHub token, no cron.
This verifies Google storage access only: production WeatherContract lives in
SolarGPTfull/server/weathernext3_gcs.py and proyectos/lib/meteo.js.

Usage: python weathernext_gcs_probe.py --lat 41.0 --lon -1.0
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys

BUCKET = "weathernext3_statistics_spatial"
PREFIX = (
    "weathernext_3_0_0_statistics/zarr/2026_to_present/"
    "20260101_01hr_01_preds/predictions.zarr"
)
PREFIX_PATTERN = re.compile(
    r"^weathernext_3_0_0_statistics/zarr/2026_to_present/"
    r"\d{8}_(?:0\d|1\d|2[0-3])hr_\d{2}_preds/predictions\.zarr$"
)
FIELDS = (
    "temperature_2m_p50",
    "wind_speed_10m_p50",
    "surface_solar_radiation_downwards_1hr_p50",
    "total_cloud_cover_p50",
)


def point_probe(*, lat: float, lon: float, hours: int = 3,
                prefix: str = PREFIX):
    if not (math.isfinite(lat) and -90 <= lat <= 90 and
            math.isfinite(lon) and -180 <= lon <= 180):
        raise ValueError("Coordenadas inválidas")
    if not 1 <= hours <= 6:
        raise ValueError("El piloto permite 1-6 horas, no descargas masivas")
    if not PREFIX_PATTERN.fullmatch(prefix):
        raise ValueError("Solo se aceptan ejecuciones oficiales del bucket GCS")

    print("[1/3] Librerías instaladas. Preparando lector Zarr…", flush=True)
    # These imports are intentionally deferred so --help works before setup.
    import numpy as np
    import obstore
    import xarray as xr
    import zarr

    print("[2/3] Abriendo metadatos del bucket Google (sin descargar la rejilla)…", flush=True)
    store = obstore.store.GCSStore(bucket=BUCKET, prefix=prefix)
    dataset = xr.open_zarr(zarr.storage.ObjectStore(store), chunks={})
    try:
        present = [v for v in FIELDS if v in dataset.data_vars]
        if not {"temperature_2m_p50", "wind_speed_10m_p50"}.issubset(present):
            raise RuntimeError(
                "Zarr accesible, pero faltan temperatura o viento P50; "
                "hay que revisar el esquema real"
            )
        lon_360 = lon % 360.0
        # Subset variables + space + lead time BEFORE triggering .load().
        selected = dataset[present].sel(
            lat_0p1=lat, lon_0p1=lon_360, method="nearest"
        ).sel(lead_time=slice(np.timedelta64(1, "h"),
                              np.timedelta64(hours, "h")))
        if selected.sizes.get("lead_time", 0) == 0:
            raise RuntimeError("No hay lead times en el intervalo solicitado")
        print("[3/3] Leyendo 3 horas de una celda meteorológica…", flush=True)
        selected = selected.load()
        samples = []
        for idx, lead in enumerate(selected["lead_time"].values):
            numeric = {}
            for variable in present:
                val = float(np.asarray(selected[variable].isel(
                    lead_time=idx).values).item())
                numeric[variable] = val if math.isfinite(val) else None
            samples.append({
                "lead_hour": int(np.asarray(lead).astype(
                    "timedelta64[s]").astype(int) // 3600),
                "values_native_units": numeric,
            })
        counts = {
            variable: sum(x["values_native_units"][variable] is not None
                          for x in samples)
            for variable in present
        }
        if counts["temperature_2m_p50"] == 0 or counts["wind_speed_10m_p50"] == 0:
            raise RuntimeError("El Zarr no devolvió valores numéricos reales")
        init = str(np.asarray(dataset["init_time"].values).reshape(-1)[0])
        return {
            "status": "GCS_NUMERIC_POINT_READ_OK",
            "source": "weathernext3",
            "surface": "GCS",
            "bucket": BUCKET,
            "run_prefix": prefix,
            "init_time": init,
            "requested": {"lat": lat, "lon": lon, "hours": hours},
            "grid": {
                "lat": float(selected.lat_0p1.values),
                "lon_360": float(selected.lon_0p1.values),
            },
            "valid_numeric_counts": counts,
            "samples": samples,
            "published_to_supabase": False,
            "is_live_in_solargpt": False,
        }
    finally:
        dataset.close()


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--lat", type=float, required=True)
    cli.add_argument("--lon", type=float, required=True)
    cli.add_argument("--hours", type=int, default=3)
    cli.add_argument("--run-prefix", default=PREFIX)
    args = cli.parse_args()
    try:
        result = point_probe(lat=args.lat, lon=args.lon,
                             hours=args.hours, prefix=args.run_prefix)
    except Exception as exc:
        print(f"WeatherNext GCS probe FAILED: {type(exc).__name__}: {exc}",
              file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
