#!/usr/bin/env python3
"""Pasa un AÑO METEOROLÓGICO al CSV que `LOC.parseCSV` de sim-viento.html lee.

Los años ya existen —horneados, en los repos de la casa— y hasta ahora no había
forma de meterlos en la ficha sin tocarlos a mano. Esto es el envase, nada más:
no interpola, no rellena huecos, no sintetiza nada. Las únicas dos cosas que
transforma van dichas en pantalla cuando las hace.

    # TMY de PVGIS horneado (cobertura-zigbee: elburgo/ayora/sanjose)
    python3 tools/anio_a_csv.py --pvgis-tmy /ruta/a/elburgo_tmy.json -o elburgo.csv

    # export horario de Open-Meteo (SolarGPTfull: madrid, sevilla, tokyo…)
    python3 tools/anio_a_csv.py --openmeteo /ruta/a/madrid.csv --anio 2024 -o madrid24.csv

    # serie horaria de PVGIS (Timeseries_<lat>_<lon>_…csv)
    python3 tools/anio_a_csv.py --pvgis-horario /ruta/a/Timeseries_….csv -o sitio.csv

LA UNIDAD VA ESCRITA EN LA CABECERA, y no es cosmética. La ficha deducía la
unidad del percentil 98 («si pasa de 45, es km/h»), y un año de reanálisis no
lo cruza: medido el 2026-10-03, un año de Open-Meteo en km/h con p98 de 26
entró como m/s y multiplicó todo el viento por 3,6 sin que nada chirriara.
Desde entonces la ficha lee primero la unidad DECLARADA; este conversor la
declara siempre, así que por este camino no hay nada que adivinar.

LO QUE NINGUNA DE LAS TRES FUENTES TRAE: dirección de viento ni ráfaga medida.
No se inventan. La ficha ya declara en pantalla que sin dirección el lado «cara
al viento» es un lado fijo disfrazado, y que la ráfaga, si no viene medida, la
pone su modelo. Si tu fuente SÍ las trae, añádelas como columnas
`wind_direction` y `gust` y la ficha las usará: la medida manda sobre el modelo.

La ruta del fichero de origen se pasa SIEMPRE por argumento, nunca se adivina
una ruta hermana en el disco: misma regla que `tests/gen_careo_layout.py` con
`--core`. Un camino que cruza el disco funciona en una máquina y en ninguna otra.
"""
import argparse
import csv
import datetime as dt
import json
import sys

CABECERA = ["time", "wind_speed (m/s)", "temp (degC)", "ghi (W/m2)"]


def avisa(*a):
    print(*a, file=sys.stderr)


def de_pvgis_tmy(ruta, anio):
    """[GHI, DNI, DHI, Tamb °C, WS10m m/s] x 8760, sin fechas."""
    d = json.load(open(ruta))
    h = d["h"]
    if len(h) != 8760:
        raise SystemExit(f"esperaba 8760 horas y hay {len(h)}: ¿es un TMY?")
    # EL TMY NO GUARDA LAS FECHAS, solo el índice de hora. PVGIS las sirve
    # ordenadas 1-ene 00:00 → 31-dic 23:00, así que índice→día-del-año es
    # correcto y el sol de la ficha sale bien. La ETIQUETA del año es
    # convención: cada mes de un TMY sale de un año real distinto, y por eso
    # el año tiene que ser NO BISIESTO o sobrarían 24 horas.
    if (anio % 4 == 0 and anio % 100 != 0) or anio % 400 == 0:
        raise SystemExit(f"{anio} es bisiesto y un TMY trae 8760 h: elige otro con --anio")
    avisa(f"  fechas repuestas sobre {anio} (el TMY solo guarda el índice de hora;"
          f" cada mes viene de un año real distinto)")
    t0 = dt.datetime(anio, 1, 1, tzinfo=dt.timezone.utc)
    filas = [[(t0 + dt.timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M"),
              round(ws, 2), ta, ghi] for i, (ghi, _dni, _dhi, ta, ws) in enumerate(h)]
    return filas, float(d["lat"]), float(d["lon"]), d.get("fuente", "PVGIS TMY")


def de_openmeteo(ruta, anio):
    """Export del archivo de Open-Meteo: 3 líneas de cabecera y luego la tabla.

    `wind_speed_10m` viene en KM/H —es el default de la API, y SolarGPTfull lo
    dice en dos sitios (scripts/run_derry_real_check.py y
    wind_stow_strategy_compare.py, que divide por 3,6)—. Se pasa a m/s aquí.
    """
    f = open(ruta)
    cab = [f.readline() for _ in range(3)]
    campos = cab[0].strip().split(",")
    val = cab[1].strip().split(",")
    meta = dict(zip(campos, val))
    lat, lon = float(meta["latitude"]), float(meta["longitude"])
    filas = []
    for r in csv.DictReader(f):
        if anio and r["time"][:4] != str(anio):
            continue
        filas.append([r["time"], round(float(r["wind_speed_10m"]) / 3.6, 3),
                      r["temperature_2m"], r["shortwave_radiation"]])
    if not filas:
        raise SystemExit(f"ninguna fila de {anio} en ese fichero")
    avisa("  viento convertido de km/h a m/s (÷3,6): es la unidad en la que"
          " Open-Meteo sirve `wind_speed_10m` por defecto")
    return filas, lat, lon, "Open-Meteo (reanálisis ERA5), horario"


def de_pvgis_horario(ruta, anio):
    """`Timeseries_<lat>_<lon>_…csv`: cabecera de texto, fechas 20050101:0030."""
    lat = lon = None
    lineas = open(ruta, encoding="utf-8-sig").read().splitlines()
    i = 0
    for i, l in enumerate(lineas):
        if l.startswith("Latitude"):
            lat = float(l.split("\t")[-1].split(":")[-1])
        elif l.startswith("Longitude"):
            lon = float(l.split("\t")[-1].split(":")[-1])
        elif l.startswith("time,"):
            break
    if lat is None or lon is None:
        raise SystemExit("no encuentro Latitude/Longitude en la cabecera de PVGIS")
    filas = []
    for r in csv.DictReader(lineas[i:]):
        t = r["time"]
        if len(t) != 13 or ":" not in t:
            continue
        if anio and t[:4] != str(anio):
            continue
        # la marca de PVGIS es el CENTRO de la hora (…:0030). Se deja tal cual:
        # desplazarla media hora sería inventar una convención que no es la suya.
        iso = f"{t[0:4]}-{t[4:6]}-{t[6:8]}T{t[9:11]}:{t[11:13]}"
        ghi = float(r.get("Gb(i)", 0) or 0) + float(r.get("Gd(i)", 0) or 0)
        filas.append([iso, r["WS10m"], r["T2m"], round(ghi, 1)])
    if not filas:
        raise SystemExit("no he leído ninguna fila: ¿es un Timeseries de PVGIS?")
    avisa("  `WS10m` de PVGIS ya viene en m/s: no se convierte nada")
    avisa("  la hora de PVGIS marca el CENTRO del intervalo (…:0030) y se deja así")
    return filas, lat, lon, "PVGIS horario (seriescalc)"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--pvgis-tmy", metavar="JSON")
    g.add_argument("--openmeteo", metavar="CSV")
    g.add_argument("--pvgis-horario", metavar="CSV")
    ap.add_argument("--anio", type=int, default=None,
                    help="año a extraer de un export multianual; para --pvgis-tmy, "
                         "el año NO BISIESTO sobre el que reponer las fechas (2023)")
    ap.add_argument("-o", "--salida", required=True)
    a = ap.parse_args()

    if a.pvgis_tmy:
        filas, lat, lon, fuente = de_pvgis_tmy(a.pvgis_tmy, a.anio or 2023)
    elif a.openmeteo:
        filas, lat, lon, fuente = de_openmeteo(a.openmeteo, a.anio)
    else:
        filas, lat, lon, fuente = de_pvgis_horario(a.pvgis_horario, a.anio)

    with open(a.salida, "w", newline="") as g_:
        w = csv.writer(g_)
        w.writerow(CABECERA)
        w.writerows(filas)

    ws = sorted(float(r[1]) for r in filas)
    p98 = ws[min(len(ws) - 1, int(len(ws) * 0.98))]
    avisa(f"\n{a.salida}: {len(filas)} h · {fuente}")
    avisa(f"  viento m/s — p98 {p98:.1f}, máx {ws[-1]:.1f}  (= {ws[-1] * 3.6:.1f} km/h)")
    avisa("  sin dirección ni ráfaga medida: la ficha lo declarará en pantalla")
    avisa(f"\nEn sim-viento.html: Fuente = «HSU de la planta · CSV», "
          f"latitud {lat}, longitud {lon}.")


if __name__ == "__main__":
    main()
