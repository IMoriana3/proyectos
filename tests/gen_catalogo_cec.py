"""Genera `data/cec-modulos.json` y `data/cec-inversores.json` para la ficha web.

De dónde salen: de los CSV que YA mantiene el core (`solargpt/data/`), que a su
vez se construyen desde la lista oficial ADA de la CEC (módulos) y desde la
librería de SAM/NREL (inversores). Aquí no se descarga nada ni se recalcula
nada: se recorta y se pasa a JSON para que la ficha pueda abrirse en el Panel
sin levantar un Python, que es la convención de todas las fichas.

Qué se recorta y por qué:
  * módulos: los de la lista **2024** con Pmax ≥ 300 Wp. El resto son de la
    lista de 2019 o de gama tejado pequeña, y la ficha compara ESTRUCTURAS de
    planta. Quedan 16 758 de 37 857 (2,4 MB, 287 KB comprimidos por Pages).
  * inversores: TODOS los que tienen `Paco` (4 910). Son 656 KB y el catálogo
    de inversores es donde más falta hace tener también el histórico: una
    planta que se audita lleva el inversor que lleva.

Qué NO se toca, porque el core lo declara así:
  * los duplicados se MARCAN, no se borran (dos fabricantes pueden vender el
    mismo módulo). Aquí van todos y el que busca decide.
  * `alpha_sc` (A/°C) y `beta_oc` (V/°C) ya vienen convertidos desde los %/°C
    del Excel de la CEC. Se copian tal cual.
  * `A_c` es área de CÉLULAS, no del módulo: no sirve para deducir el largo y
    por eso ni se exporta. La ficha usa `Length`/`Width` si están y si no lo
    dice y cae al módulo canónico.

Se regenera a mano (no en CI: necesita el repo del motor):

    python3 tests/gen_catalogo_cec.py --core /ruta/a/SolarGPTfull/solargpt
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

WP_MIN = 300.0          # por debajo es tejado, y esta ficha es de planta
VINTAGE_MOD = "cec2024"  # la lista viva; la de 2019 se queda fuera de módulos

# Columnas exportadas, en el orden en que van en cada fila del JSON. Se
# publican como una lista de listas y no como objetos: 16 758 objetos con 13
# claves cada uno son 3 MB de nombres de campo repetidos.
COLS_MOD = ["name", "mfr", "wp", "L", "W", "ns",
            "voc", "vmp", "isc", "imp", "beta", "gamma", "tec"]
COLS_INV = ["name", "mfr", "paco", "pdco", "vdco", "vdcmax", "idcmax",
            "mlow", "mhigh", "vac", "src"]


def _num(fila: dict, clave: str):
    try:
        v = float(fila[clave])
    except (TypeError, ValueError, KeyError):
        return None
    return v if v == v else None          # NaN fuera


def _red(v, n):
    return None if v is None else round(v, n)


def modulos(csv_path: Path) -> list[list]:
    out = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r.get("source") != VINTAGE_MOD:
                continue
            wp = _num(r, "STC")
            if not wp or wp < WP_MIN:
                continue
            out.append([
                r["name"], r.get("Manufacturer", "") or "", _red(wp, 1),
                _red(_num(r, "Length"), 4), _red(_num(r, "Width"), 4),
                _red(_num(r, "N_s"), 0),
                _red(_num(r, "V_oc_ref"), 2), _red(_num(r, "V_mp_ref"), 2),
                _red(_num(r, "I_sc_ref"), 3), _red(_num(r, "I_mp_ref"), 3),
                # beta_oc en V/°C y gamma_r en %/°C: las unidades del core
                _red(_num(r, "beta_oc"), 5), _red(_num(r, "gamma_r"), 4),
                r.get("Technology", "") or "",
            ])
    out.sort(key=lambda x: -(x[2] or 0))   # por potencia, que es como se busca
    return out


def inversores(csv_path: Path) -> list[list]:
    out = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            nombre = (r.get("Unnamed: 0") or "").strip()
            paco = _num(r, "Paco")
            # '[0]' es un artefacto del CSV de SAM; el core lo filtra igual
            if not nombre or nombre == "[0]" or not paco:
                continue
            out.append([
                nombre, r.get("Manufacturer", "") or "", _red(paco, 0),
                _red(_num(r, "Pdco"), 0), _red(_num(r, "Vdco"), 1),
                _red(_num(r, "Vdcmax"), 0), _red(_num(r, "Idcmax"), 2),
                _red(_num(r, "Mppt_low"), 0), _red(_num(r, "Mppt_high"), 0),
                _red(_num(r, "Vac"), 0), r.get("source", "") or "",
            ])
    out.sort(key=lambda x: -(x[2] or 0))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--core", required=True,
                    help="ruta a SolarGPTfull/solargpt (donde está data/)")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data"))
    a = ap.parse_args()
    core, out = Path(a.core), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    mods = modulos(core / "data" / "cec_modules_2024.csv")
    invs = inversores(core / "data" / "cec_inverters.csv")
    if not mods or not invs:
        raise SystemExit("catálogo vacío: ¿es la ruta del core correcta?")

    for nombre, cols, filas, fuente in (
        ("cec-modulos.json", COLS_MOD, mods,
         "CEC 2024 (lista oficial ADA) · Pmax ≥ %g Wp" % WP_MIN),
        ("cec-inversores.json", COLS_INV, invs,
         "CEC / SAM (NREL) · parámetros Sandia"),
    ):
        p = out / nombre
        p.write_text(json.dumps(
            {"fuente": fuente, "n": len(filas), "cols": cols, "filas": filas},
            separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        print(f"{p}  {len(filas)} filas  {p.stat().st_size/1e6:.2f} MB")


if __name__ == "__main__":
    main()
