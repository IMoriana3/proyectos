#!/usr/bin/env python3
"""Cuerpo JSON del PR que abre `lanzar.sh` con los mapas recién calculados.

    python3 pr_cuerpo.py <carpeta pasivo> <rama> <rama base> ESP_2022_0.25 [...]
"""
import json
import os
import sys


def main(argv):
    sal, rama, base, tags = argv[1], argv[2], argv[3], argv[4:]
    filas = []
    for tag in tags:
        with open(os.path.join(sal, tag + ".json"), encoding="utf-8") as f:
            d = json.load(f)
        medias = " · ".join(f"{k} {v['media']:+.2f} %" for k, v in d["resumen"].items() if v)
        fallos = f", {len(d['fallos'])} sin dato" if d["fallos"] else ""
        filas.append(f"- **{d['pais']} {d['year']}**, {d['paso']}°: {d['n_nodos']} nodos{fallos}"
                     f" · suelta {d['configuracion']['passive']['release_kmh']} km/h (no medida)"
                     f" · ganancia media {medias}")
    cuerpo = ("Mapas de ganancia del pasivo calculados en el NAS con `tools/mapa_pasivo` "
              "(ERA5 · Copernicus C3S, CC-BY 4.0).\n\n" + "\n".join(filas))
    print(json.dumps({"title": "Mapa pasivo: " + ", ".join(tags), "body": cuerpo,
                      "head": rama, "base": base}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv)
