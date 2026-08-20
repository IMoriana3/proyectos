"""Genera `tests/careo-sizing.json`: el dimensionado CANÓNICO, del core.

La ficha calcula el sizing en el navegador para poder abrirse sin levantar
nada, y eso abre la puerta de siempre: dos motores que dicen cosas distintas y
nadie mirando. Este script congela lo que dice el core —`string_sizing` y
`plant_config`, las dos funciones puras que ya usan el cuaderno y el
Streamlit— sobre unos casos elegidos para que `tests/test_sizing.js` exija al
navegador EXACTAMENTE las mismas cifras.

Los casos no son decorativos: cada uno fija una de las cosas que se rompen.

  * `bankable`     el caso de referencia (módulo 630 W, Sungrow 350 kW).
  * `manda_pico`   con MPPT holgado, quien limita es la POTENCIA (`power`).
  * `manda_imppt`  con la corriente de operación apretada, manda el MPPT.
  * `manda_isc`    con la de cortocircuito apretada, manda la protección.
  * `manda_tope`   con el tope de strings del datasheet, manda el datasheet.
  * `solo_idcmax`  sin límites de datasheet: el `Idcmax` del CEC como COTA,
                   que es lo único que se puede decir de él (es derivado,
                   ≈Pdco/Vdco, y el core lo marca con confianza `cec_derived`).
  * planta:        desde MWp y desde nº de módulos, con y sin límite de red.

Se regenera a mano (no en CI: necesita el repo del motor):

    python3 tests/gen_careo_sizing.py --core /ruta/a/SolarGPTfull/solargpt
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from pathlib import Path

# Módulo canónico de la casa (630 Wp) e inversor bankable del preset del
# Streamlit (Sungrow SG350HX, 350 kW AC). Las cifras eléctricas son las que
# usa la página 5 por defecto.
MOD = {"pmax": 630.0, "voc": 41.5, "vmp": 34.7, "isc": 18.5, "imp": 17.5}
INV = {"paco": 350000.0, "mppt_low": 500.0, "mppt_high": 1500.0,
       "vdcmax": 1500.0, "idcmax": 500.0}
N_STR = 26                       # módulos por string del caso de referencia

CASOS_STRINGS = [
    ("bankable",    dict(n_mppt=12, i_mppt_max_a=40.0, isc_mppt_max_a=60.0,
                         strings_per_mppt_max=4, target_dc_ac=1.20)),
    ("manda_pico",  dict(n_mppt=12, i_mppt_max_a=400.0, isc_mppt_max_a=600.0,
                         strings_per_mppt_max=40, target_dc_ac=1.20)),
    ("manda_imppt", dict(n_mppt=6, i_mppt_max_a=30.0, isc_mppt_max_a=600.0,
                         strings_per_mppt_max=40, target_dc_ac=1.50)),
    ("manda_isc",   dict(n_mppt=6, i_mppt_max_a=400.0, isc_mppt_max_a=30.0,
                         strings_per_mppt_max=40, target_dc_ac=1.50)),
    ("manda_tope",  dict(n_mppt=6, i_mppt_max_a=400.0, isc_mppt_max_a=600.0,
                         strings_per_mppt_max=2, target_dc_ac=1.50)),
    ("solo_idcmax", dict(n_mppt=12, target_dc_ac=1.20)),
]

CASOS_PLANTA = [
    ("desde_mwp",      dict(mode="from_mwp", mwp_target=10.0, wp_module=630.0,
                            inv_pnom_ac_kw=350.0, mods_per_string=26,
                            dc_ac_target=1.20)),
    ("desde_modulos",  dict(mode="from_modules", n_modules=15873, wp_module=630.0,
                            inv_pnom_ac_kw=350.0, mods_per_string=26,
                            dc_ac_target=1.20)),
    ("con_red",        dict(mode="from_mwp", mwp_target=10.0, wp_module=630.0,
                            inv_pnom_ac_kw=350.0, inv_pmax_ac_kw=385.0,
                            mods_per_string=26, dc_ac_target=1.30,
                            pgrid_max_mw=8.0)),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--core", required=True)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "careo-sizing.json"))
    a = ap.parse_args()
    core = Path(a.core)
    for p in (str(core), str(core / "solargpt_core")):
        if p not in sys.path:
            sys.path.insert(0, p)

    from solargpt_core.string_sizing import size_strings_per_inverter
    from solargpt_core.plant_config import (PlantSizingInputs, SizingMode,
                                            compute_plant_sizing)

    p_string = N_STR * MOD["pmax"]
    strings = {}
    for nombre, kw in CASOS_STRINGS:
        strings[nombre] = size_strings_per_inverter(
            imp_module_a=MOD["imp"], isc_module_a=MOD["isc"],
            p_string_w=p_string, paco_w=INV["paco"],
            idcmax_total_a=INV["idcmax"], **kw)
        strings[nombre]["_entrada"] = dict(kw, imp_module_a=MOD["imp"],
                                           isc_module_a=MOD["isc"],
                                           p_string_w=p_string,
                                           paco_w=INV["paco"],
                                           idcmax_total_a=INV["idcmax"])

    planta = {}
    for nombre, kw in CASOS_PLANTA:
        kw = dict(kw)
        kw["mode"] = SizingMode(kw["mode"])
        res = compute_plant_sizing(PlantSizingInputs(**kw))
        planta[nombre] = dataclasses.asdict(res)
        kw["mode"] = kw["mode"].value
        planta[nombre]["_entrada"] = kw

    out = Path(a.out)
    out.write_text(json.dumps({
        "modulo": MOD, "inversor": INV, "mods_por_string": N_STR,
        "strings": strings, "planta": planta,
    }, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{out}  {len(strings)} casos de string, {len(planta)} de planta")


if __name__ == "__main__":
    main()
