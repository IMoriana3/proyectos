"""Genera `tests/careo-estructuras.json`: la meteo y el resultado CANÓNICO.

El careo de la ficha no puede ser «se parece»: tiene que ser contra el core.
Este script corre `solargpt_core.structure_compare.compare_structures` sobre una
meteo determinista y congela las dos cosas —la meteo de entrada y el resultado—
para que `tests/test_comparador.js` alimente al motor del navegador EXACTAMENTE
lo mismo y compare peras con peras.

Se regenera a mano (no en CI: necesita el repo del motor y pvlib):

    python3 tests/gen_careo_estructuras.py --core /ruta/a/SolarGPTfull/solargpt

Doce días —el 15 de cada mes, horario— en vez del año entero: recorre las cuatro
estaciones, ejercita el backtracking en el solsticio de invierno (que es cuando
la sombra entre filas manda) y deja un fixture de 30 KB en vez de 600 KB. Los
kWh/m² del fixture son los de esos doce días, no un año: lo que se carea es la
FÍSICA y el ORDEN, no un anual.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

LAT, LON = 37.3891, -5.9845          # Sevilla — el sitio por defecto de la ficha
YEAR = 2023
DIAS = [f"{YEAR}-{m:02d}-15" for m in range(1, 13)]
ESTRUCTURAS = ["fija_optima", "fija_proyecto", "fija_ew",
               "tracker_hsat", "tracker_hsat_nobt", "tracker_tsat"]
PITCH_M, ANCHO_M = 6.00, 2.382
ALBEDO, TILT_PROYECTO, MAX_ANGLE = 0.20, 25.0, 55.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--core", required=True, help="raíz del repo con solargpt_core/")
    ap.add_argument("--out", default=str(Path(__file__).parent / "careo-estructuras.json"))
    a = ap.parse_args()
    sys.path.insert(0, a.core)

    import numpy as np
    import pandas as pd
    import pvlib
    from solargpt_core.structure_compare import CATALOGO, compare_structures

    idx = pd.DatetimeIndex(
        np.concatenate([pd.date_range(d, periods=24, freq="1h", tz="UTC").to_numpy()
                        for d in DIAS]))
    cs = pvlib.location.Location(LAT, LON, tz="UTC").get_clearsky(idx, model="ineichen")
    meteo = pd.DataFrame({"GHI": cs["ghi"], "DNI": cs["dni"], "DHI": cs["dhi"]}, index=idx)

    # Mismo tilt de proyecto y misma geometría que teclea la ficha por defecto.
    cmp_ = compare_structures(
        meteo, LAT, LON, structures=ESTRUCTURAS, albedo=ALBEDO,
        gcr=ANCHO_M / PITCH_M, collector_height_m=ANCHO_M,
        tilt_proyecto_deg=TILT_PROYECTO)

    # El comparador normaliza a AÑO equivalente; el fixture guarda el bruto de
    # los doce días para que el JS no tenga que replicar esa normalización.
    anos = cmp_.assumptions["years_equiv"]
    filas = [{
        "key": r.key, "label": r.label,
        "poa_kwh_m2": round(r.poa_kwh_m2_year * anos, 4),
        "poa_ideal_kwh_m2": round(r.poa_ideal_kwh_m2_year * anos, 4),
        "delta_pct": round(r.gain_vs_baseline_pct, 4),
        "sombra_pct": round(r.shading_loss_pct, 4),
        "tilt_deg": (None if r.tilt_deg is None else round(r.tilt_deg, 2)),
        "gcr": round(r.gcr, 6),
    } for r in cmp_.rows]

    doc = {
        "_": "Generado por tests/gen_careo_estructuras.py — NO editar a mano.",
        "core": {"catalogo": sorted(CATALOGO), "baseline": cmp_.baseline_key,
                 "ghi_kwh_m2": round(cmp_.assumptions["ghi_kwh_m2_year"] * anos, 4),
                 "years_equiv": round(anos, 6)},
        "cfg": {"lat": LAT, "lon": LON, "year": YEAR, "pitch_m": PITCH_M,
                "collector_width_m": ANCHO_M, "albedo": ALBEDO,
                "tilt_deg": TILT_PROYECTO, "max_angle_deg": MAX_ANGLE,
                "axis_tilt_deg": 10.0, "structures": ESTRUCTURAS},
        "meteo": {
            "t": [t.strftime("%Y-%m-%dT%H:%M:%SZ") for t in idx],
            "ghi": [round(float(v), 3) for v in meteo["GHI"]],
            "dni": [round(float(v), 3) for v in meteo["DNI"]],
            "dhi": [round(float(v), 3) for v in meteo["DHI"]],
        },
        "esperado": filas,
    }
    Path(a.out).write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    print(f"escrito {a.out} · {len(idx)} pasos · {len(filas)} estructuras")
    for f in filas:
        print(f"  {f['label']:<42} {f['poa_kwh_m2']:>8.1f} kWh/m²  {f['delta_pct']:+7.2f} %")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
