#!/usr/bin/env python3
"""Genera tests/careo-osm-exclusiones.json: lo que dice el CORE de las
exclusiones sugeridas desde OSM, para carear el espejo del generador.

`generador-layout.html` lleva un espejo en JavaScript de
`solargpt_core/osm_exclusions.py` (SolarGPTfull, 2026-11-16, «Haz todo»):
misma consulta a Overpass, mismas categorías, mismo cosido de anillos. Este
script escribe, sobre un JSON de Overpass enlatado (la forma de `out geom`):

  * el texto de la consulta para un bbox con margen y unas categorías;
  * lo que lee el core de cada elemento (categoría, clave, valor, forma, nº
    de vértices);
  * el área que quitan las exclusiones del core dentro de la parcela, caso a
    caso (unión de todas, recortada a la parcela), con su retranqueo.

    python3 tests/gen_careo_osm_exclusiones.py --core /ruta/a/SolarGPTfull/solargpt

Necesita el entorno del core (shapely, pyproj, requests). Derivado nuestro:
se regenera, y el diff lo enseña.
"""
import argparse
import json
import math
import os
import subprocess
import sys

LAT, LON = 41.57634, -0.79814
M_LON = 111320 * math.cos(math.radians(LAT))   # la aproximación plana de la ficha
M_LAT = 110540


def ll(x, y):
    """Metros locales (este, norte) → [lon, lat], como aLonLat del arnés."""
    return [LON + x / M_LON, LAT + y / M_LAT]


def rect(x0, y0, x1, y1):
    return [ll(x0, y0), ll(x1, y0), ll(x1, y1), ll(x0, y1), ll(x0, y0)]


def g(pts):
    return [{"lat": la, "lon": lo} for lo, la in pts]


PARCELA = rect(0, 0, 400, 300)

ELEMENTOS = [
    {"type": "way", "id": 1, "tags": {"waterway": "stream"},
     "geometry": g([ll(200, -20), ll(200, 320)])},
    {"type": "way", "id": 2, "tags": {"building": "yes"},
     "geometry": g(rect(40, 40, 60, 70))},
    {"type": "way", "id": 3, "tags": {"highway": "track"},
     "geometry": g(rect(250, 150, 350, 250))},
    {"type": "relation", "id": 9,
     "tags": {"natural": "water", "type": "multipolygon"},
     "members": [
         {"type": "way", "ref": 91, "role": "outer",
          "geometry": g([ll(100, 200), ll(150, 200), ll(150, 250)])},
         {"type": "way", "ref": 92, "role": "outer",          # el trozo va AL REVÉS
          "geometry": g([ll(100, 200), ll(100, 250), ll(150, 250)])}]},
    {"type": "way", "id": 5, "tags": {"power": "line"},
     "geometry": g([ll(-10, 280), ll(410, 280)])},
    {"type": "way", "id": 6, "tags": {"railway": "rail"},
     "geometry": g([ll(-10, 330), ll(410, 330)])},
    {"type": "way", "id": 7, "tags": {"amenity": "bench"},
     "geometry": g([ll(10, 10), ll(11, 11)])},
]

#: Casos de área: retranqueos → lo que quita el core dentro de la parcela.
CASOS = [
    ("arroyo_y_embalse_b5", {"cauces": 5.0}),
    ("edificio_b0", {"edificios": 0.0}),
    ("edificio_b4", {"edificios": 4.0}),
    ("camino_en_anillo_b5", {"caminos": 5.0}),
    ("tendido_b6", {"lineas_electricas": 6.0}),
    ("via_fuera_b10_no_entra", {"ferrocarril": 10.0}),
    ("via_fuera_b40_entra_10m", {"ferrocarril": 40.0}),
    ("todo_junto", {"cauces": 5.0, "edificios": 4.0, "caminos": 5.0,
                    "lineas_electricas": 6.0, "ferrocarril": 40.0}),
]


def _commit(ruta):
    try:
        return subprocess.run(["git", "-C", ruta, "rev-parse", "HEAD"],
                              capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--core", default=os.environ.get("SOLARGPT_CORE", ""),
                    help="ruta al paquete solargpt (el que contiene solargpt_core/)")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__),
                                                  "careo-osm-exclusiones.json"))
    args = ap.parse_args()
    if args.core:
        sys.path.insert(0, args.core)
    from solargpt_core import osm_exclusions as ox

    raw = {"elements": ELEMENTOS}
    feats = ox.parse_exclusion_features(raw)
    leidos = [{"ref": f["ref"], "category": f["category"], "key": f["key"],
               "value": f["value"], "kind": f["kind"],
               "n_vertices": (sum(len(r) for r in f["rings"]) if "rings" in f
                              else len(f["coords"]))} for f in feats]
    margen = 50.0
    bbox = ox._bbox_with_margin(PARCELA, margen)
    cats = ["cauces", "edificios", "lineas_electricas"]
    casos = []
    for nombre, buffers in CASOS:
        res = ox.suggest_exclusions(PARCELA, feats, buffers)
        casos.append({"nombre": nombre, "retranqueos": buffers,
                      "area_m2": res["total_area_m2"],
                      "por_categoria": {e["category"]: e["area_m2"]
                                        for e in res["exclusions"]},
                      "avisos": res["warnings"]})
    salida = {
        "procedencia": {"generador": "tests/gen_careo_osm_exclusiones.py",
                        "core": "solargpt_core.osm_exclusions",
                        "core_commit": _commit(args.core) if args.core else None},
        "lat": LAT, "lon": LON, "parcela_lonlat": PARCELA,
        "overpass": raw,
        "consulta": {"margen_m": margen, "bbox": list(bbox), "categorias": cats,
                     "texto": ox.build_exclusion_query(bbox, cats, timeout=90)},
        # La que hace la FICHA al pulsar «Buscar en OSM» con solo cauces a 5 m:
        # margen = max(10 m, retranqueos) = 10 m (test_osm_exclusiones_ui.js).
        "consulta_ui": {"margen_m": 10.0, "categorias": ["cauces"],
                        "texto": ox.build_exclusion_query(
                            ox._bbox_with_margin(PARCELA, 10.0), ["cauces"],
                            timeout=90)},
        "leidos": leidos,
        "casos": casos,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{args.out}: {len(leidos)} elementos leídos, {len(casos)} casos de área")


if __name__ == "__main__":
    main()
