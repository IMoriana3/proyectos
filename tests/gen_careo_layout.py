#!/usr/bin/env python3
"""Genera tests/careo-layout.json: el MISMO conjunto de parcelas y parámetros
corrido por el motor canónico `solargpt_core.layout_v2.compute_layout_v2`.

El fichero es el patrón contra el que `tests/test_layout.js` carea el motor
portado al navegador de `generador-layout.html`. Sin esto, el navegador
calcularía una segunda verdad y nadie estaría mirando.

    python3 tests/gen_careo_layout.py --core /ruta/a/SolarGPTfull/solargpt

Necesita el entorno del core (shapely, pyproj, numpy, pandas).
"""
import argparse
import json
import math
import os
import sys

# Parcelas del careo, en coordenadas locales (metros) alrededor del centro.
# Se convierten a lon/lat con la misma aproximación plana que usa la ficha, para
# que los dos motores reciban EXACTAMENTE el mismo anillo.
LAT, LON = 41.57634, -0.79814


def _to_lonlat(pts, lat=LAT, lon=LON):
    m_lon = 111320.0 * math.cos(math.radians(lat))
    m_lat = 110540.0
    return [(lon + x / m_lon, lat + y / m_lat) for x, y in pts]


def _rect(w, h, rot_deg=0.0):
    c, s = math.cos(math.radians(rot_deg)), math.sin(math.radians(rot_deg))
    pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    return [(x * c - y * s, x * s + y * c) for x, y in pts]


# «L»: una parcela con un entrante, para que el careo no viva sólo de rectángulos.
_L = [(-300, -225), (300, -225), (300, 0), (40, 0), (40, 225), (-300, 225)]

CASOS = [
    {"nombre": "rect 600x450 · tracker bifila 1V/28",
     "poly": _rect(600, 450), "cfg": {"mount_type": "tracker", "table_type": "1V",
      "mods_per_struct": 28, "bifila": True, "pitch_m": 6.0, "panel_az_deg": 90.0}},
    {"nombre": "rect 600x450 · tracker monofila",
     "poly": _rect(600, 450), "cfg": {"mount_type": "tracker", "table_type": "1V",
      "mods_per_struct": 28, "bifila": False, "pitch_m": 6.0, "panel_az_deg": 90.0}},
    {"nombre": "rect girado 35° · tracker bifila",
     "poly": _rect(600, 450, 35), "cfg": {"mount_type": "tracker", "table_type": "1V",
      "mods_per_struct": 28, "bifila": True, "pitch_m": 6.0, "panel_az_deg": 90.0}},
    {"nombre": "rect 600x450 · fija 2V/20 pitch 4",
     "poly": _rect(600, 450), "cfg": {"mount_type": "fija", "table_type": "2V",
      "mods_per_struct": 20, "bifila": False, "pitch_m": 4.0, "panel_az_deg": 180.0}},
    {"nombre": "rect 600x450 · multi-talla 28/14/7",
     "poly": _rect(600, 450), "cfg": {"mount_type": "tracker", "table_type": "1V",
      "mods_per_struct": [28, 14, 7], "bifila": False, "pitch_m": 6.0,
      "panel_az_deg": 90.0}},
    {"nombre": "rect 600x450 · vial E-O cada 5 filas",
     "poly": _rect(600, 450), "cfg": {"mount_type": "tracker", "table_type": "1V",
      "mods_per_struct": 28, "bifila": False, "pitch_m": 6.0, "panel_az_deg": 90.0,
      "road_every": 5, "road_w": 4.0}},
    {"nombre": "parcela en L · tracker monofila",
     "poly": _L, "cfg": {"mount_type": "tracker", "table_type": "1V",
      "mods_per_struct": 28, "bifila": False, "pitch_m": 6.0, "panel_az_deg": 90.0}},
    {"nombre": "rect 600x450 · hueco central de 120x120",
     "poly": _rect(600, 450), "holes": [_rect(120, 120)],
     "cfg": {"mount_type": "tracker", "table_type": "1V",
      "mods_per_struct": 28, "bifila": False, "pitch_m": 6.0, "panel_az_deg": 90.0}},
    {"nombre": "rect 300x300 · setback 15 m",
     "poly": _rect(300, 300), "cfg": {"mount_type": "tracker", "table_type": "1V",
      "mods_per_struct": 14, "bifila": False, "pitch_m": 6.0, "panel_az_deg": 90.0,
      "setback_m": 15.0}},
]

BASE = {
    "setback_m": 5.0, "mod_len": 2.382, "mod_wid": 1.134,
    "gap_modules": 0.02, "gap_motor": 0.5, "gap_ns": 0.5,
    "road_every": 0, "road_w": 4.0, "road_ns_every": 0, "road_ns_w": 4.0,
    "layout_mode": "aligned", "align_to_grid": True, "min_structs_per_row": 2,
}
STAT_KEYS = ["structures", "trackers", "rows", "modules", "kWp", "GCR",
             "fill_factor", "usable_fill", "struct_w_m", "collector_h_m",
             "mesa_len_m", "fila_len_m", "poly_area_m2", "inner_area_m2",
             "col_area_m2", "density_kWp_ha", "mods_per_struct"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--core", default=os.environ.get("SOLARGPT_CORE", ""),
                    help="ruta al paquete solargpt (el que contiene solargpt_core/)")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__),
                                                  "careo-layout.json"))
    args = ap.parse_args()
    if args.core:
        sys.path.insert(0, args.core)
    from solargpt_core.layout_v2 import compute_layout_v2
    from solargpt_core.config import OFFICIAL_DEFAULTS

    # Referencia UTM del propio pyproj: la ficha implementa las series clásicas
    # de Transverse Mercator y esto es lo que impide que se desvíen en silencio.
    from pyproj import Transformer
    utm_ref = []
    for lo, la in [(LON, LAT), (2.1734, 41.3851), (-71.0610, 42.3550),
                   (-71.8064, -16.5958), (103.8520, 1.2900)]:
        zone = min(max(int((lo + 180) / 6) + 1, 1), 60)
        epsg = 32600 + zone if la >= 0 else 32700 + zone
        tx = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
        x, y = tx.transform(lo, la)
        utm_ref.append({"lon": lo, "lat": la, "epsg": epsg,
                        "x": round(x, 4), "y": round(y, 4)})

    salida = {"lat": LAT, "lon": LON,
              "module_wp": float(OFFICIAL_DEFAULTS.get("module_wp", 630)),
              "utm_ref": utm_ref, "casos": []}
    for caso in CASOS:
        cfg = dict(BASE); cfg.update(caso["cfg"])
        anillo = _to_lonlat(caso["poly"])
        anillo_cerrado = list(anillo) + [anillo[0]]
        huecos = [list(_to_lonlat(h)) + [_to_lonlat(h)[0]] for h in caso.get("holes", [])]
        res = compute_layout_v2(
            anillo_cerrado, cfg["pitch_m"], cfg["panel_az_deg"], cfg["setback_m"],
            cfg["mount_type"], cfg["table_type"], cfg["mods_per_struct"],
            cfg["mod_len"], cfg["mod_wid"], bifila=cfg["bifila"],
            gap_modules=cfg["gap_modules"],
            gap_motor=(cfg["gap_motor"] if cfg["mount_type"] == "tracker" else cfg["gap_modules"]),
            gap_ns=(cfg["gap_ns"] if cfg["mount_type"] == "tracker" else cfg["gap_modules"]),
            road_every=cfg["road_every"], road_w=cfg["road_w"],
            road_ns_every=cfg["road_ns_every"], road_ns_w=cfg["road_ns_w"],
            layout_mode=cfg["layout_mode"], align_to_grid=cfg["align_to_grid"],
            min_structs_per_row=cfg["min_structs_per_row"],
            holes_lonlat=(huecos or None))
        st = res["stats"]
        salida["casos"].append({
            "nombre": caso["nombre"],
            "poly": [[round(x, 4), round(y, 4)] for x, y in caso["poly"]],
            "holes": [[[round(x, 4), round(y, 4)] for x, y in h]
                      for h in caso.get("holes", [])],
            "cfg": cfg,
            "core": {k: (None if st.get(k) is None else
                         (float(st[k]) if isinstance(st.get(k), (int, float)) else st.get(k)))
                     for k in STAT_KEYS},
        })
        print(f"  · {caso['nombre']}: {st['structures']} mesas · "
              f"{st['kWp'] / 1000:.2f} MWp · {st['rows']} filas")

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(salida, f, indent=1, ensure_ascii=False)
    print(f"\nEscrito {args.out} ({len(salida['casos'])} casos).")


if __name__ == "__main__":
    main()
