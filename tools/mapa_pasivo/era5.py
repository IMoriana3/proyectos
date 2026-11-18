#!/usr/bin/env python3
"""ERA5 (Copernicus C3S) → meteo por nodo para el mapa de ganancia del pasivo.

Es la mitad «datos» del lote de `tools/mapa_pasivo/`. La otra mitad
(`calcula.js`) corre el motor de `sim-viento.html` sobre lo que esto deja. La
regla de este fichero es una sola: entregar a ese motor LO MISMO que le
entregaría Open-Meteo para ese punto, para que un nodo del lote y un nodo de
la pestaña sean la misma cuenta con el mismo tipo de dato.

    shortwave_radiation      = ssrd / 3600             W/m², media de la hora ANTERIOR
    diffuse_radiation        = (ssrd − fdir) / 3600
    direct_normal_irradiance = (fdir / 3600) / cos(cenit a mitad de esa hora)
    temperature_2m           = t2m − 273,15            °C
    windspeed_10m            = √(u10² + v10²)          m/s
    winddirection_10m        = de dónde VIENE, 0° = norte
    wind_gusts_10m           = fg10                    m/s, máxima de la hora anterior

ERA5 fecha las acumulaciones al FINAL de la hora, que es la convención de
Open-Meteo («preceding hour»): la marca T guarda [T−1 h, T]. No hay que
desplazar nada. La DNI sí necesita el sol de esa hora, y se toma a mitad del
intervalo (T − 30 min), con el cenit acotado a 85° para que el amanecer no
dispare la división.

Uso (lo llama `lanzar.sh`; a mano solo para depurar):

    python3 era5.py descarga  --nodos nodos.json --cache /datos/cache
    python3 era5.py extrae    --nodos nodos.json --cache /datos/cache --salida meteo.bin
    python3 era5.py autoprueba

La descarga necesita una cuenta gratuita en https://cds.climate.copernicus.eu,
aceptar la licencia de ERA5 (CC-BY 4.0) y la clave en `CDSAPI_KEY`.
"""
from __future__ import annotations

import argparse
import calendar
import json
import os
import struct
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import numpy as np

VARIABLES_CDS = [
    "10m_u_component_of_wind",
    "10m_v_component_of_wind",
    "10m_wind_gust_since_previous_post_processing",
    "surface_solar_radiation_downwards",
    "total_sky_direct_solar_radiation_at_surface",
    "2m_temperature",
]
# Nombres cortos con los que pueden venir en el netCDF.
CORTOS = {
    "u10": ["u10"], "v10": ["v10"], "t2m": ["t2m"],
    "ssrd": ["ssrd"], "fdir": ["fdir"], "fg10": ["fg10", "i10fg", "10fg"],
}
# Orden de las columnas en el binario: el de `LOC.MAPA.COLS` del motor.
COLUMNAS = ["ghi", "dhi", "dni", "temp", "ws", "wd", "gust"]
FORMATO_BIN = "factiun-meteo-nodos"
CENIT_MAX = 85.0


def _lee_nodos(ruta):
    j = json.loads(Path(ruta).read_text(encoding="utf-8"))
    nod = np.array(j["nodos"], dtype=float)
    if nod.ndim != 2 or nod.shape[1] < 2 or not len(nod):
        raise SystemExit(f"{ruta}: sin nodos")
    return j, nod[:, 0], nod[:, 1]


def area_de(lats, lons, margen=0.25):
    """Recuadro N/O/S/E en múltiplos de 0,25° (la rejilla nativa de ERA5)."""
    q = lambda v, f: f(v / 0.25) * 0.25
    return [q(lats.max() + margen, np.ceil), q(lons.min() - margen, np.floor),
            q(lats.min() - margen, np.floor), q(lons.max() + margen, np.ceil)]


def fichero_mes(cache, iso3, anio, mes):
    return Path(cache) / f"era5_{iso3}_{anio}_{mes:02d}.nc"


# ───────────────────────────── descarga ─────────────────────────────
def descarga(args):
    import cdsapi
    j, lats, lons = _lee_nodos(args.nodos)
    anio, iso3 = int(j["year"]), j["iso3"]
    if not os.environ.get("CDSAPI_KEY") and not Path.home().joinpath(".cdsapirc").exists():
        raise SystemExit("Falta la clave de Copernicus: variable CDSAPI_KEY (ver README).")
    cli = cdsapi.Client(url=os.environ.get("CDSAPI_URL", "https://cds.climate.copernicus.eu/api"),
                        key=os.environ.get("CDSAPI_KEY") or None, quiet=True)
    area = area_de(lats, lons)
    Path(args.cache).mkdir(parents=True, exist_ok=True)
    meses = range(1, 13) if not args.meses else [int(m) for m in args.meses.split(",")]
    for mes in meses:
        dest = fichero_mes(args.cache, iso3, anio, mes)
        if dest.exists() and _mes_completo(dest, anio, mes):
            print(f"  {dest.name}: ya estaba", flush=True)
            continue
        dias = calendar.monthrange(anio, mes)[1]
        pet = {
            "product_type": ["reanalysis"], "variable": VARIABLES_CDS,
            "year": [str(anio)], "month": [f"{mes:02d}"],
            "day": [f"{d:02d}" for d in range(1, dias + 1)],
            "time": [f"{h:02d}:00" for h in range(24)],
            "data_format": "netcdf", "download_format": "unarchived", "area": area,
        }
        for intento in range(1, 4):
            try:
                t = time.time()
                print(f"  {dest.name}: pedido a Copernicus (área {area}) — la cola puede tardar", flush=True)
                tmp = dest.with_suffix(".part")
                cli.retrieve("reanalysis-era5-single-levels", pet, str(tmp))
                tmp.replace(dest)
                if not _mes_completo(dest, anio, mes):
                    raise RuntimeError("el fichero no trae el mes entero")
                print(f"  {dest.name}: {dest.stat().st_size/1e6:.1f} MB en {time.time()-t:.0f} s", flush=True)
                break
            except Exception as e:  # noqa: BLE001 — se reintenta y luego se para
                print(f"  {dest.name}: intento {intento} falló: {e}", flush=True)
                if intento == 3:
                    raise
                time.sleep(60 * intento)


# ───────────────────────────── lectura ─────────────────────────────
def _abre(ruta):
    """Un mes de ERA5 como un único Dataset. El CDS nuevo, al mezclar variables
    instantáneas y acumuladas, devuelve un ZIP con un netCDF por tipo aunque se
    pida «unarchived»; se abren todos y se juntan."""
    import xarray as xr
    ruta = Path(ruta)
    if zipfile.is_zipfile(ruta):
        tmpd = Path(tempfile.mkdtemp(prefix="era5_"))
        with zipfile.ZipFile(ruta) as z:
            z.extractall(tmpd)
        partes = [xr.load_dataset(p) for p in sorted(tmpd.glob("*.nc"))]
        ds = xr.merge(partes, compat="override", join="outer")
    else:
        ds = xr.load_dataset(ruta)
    if "valid_time" in ds.dims or "valid_time" in ds.coords:
        if "time" not in ds.dims:
            ds = ds.rename({"valid_time": "time"})
    if "expver" in ds.dims:  # ERA5T y ERA5 en el mismo fichero: el primero que tenga dato
        partes = [ds.isel(expver=i) for i in range(ds.sizes["expver"])]
        base = partes[0]
        for p in partes[1:]:
            base = base.combine_first(p)
        ds = base
    for k in ("latitude", "longitude"):
        if k not in ds.coords:
            raise ValueError(f"{ruta.name}: falta la coordenada {k}")
    return ds


def _var(ds, corto):
    for n in CORTOS[corto]:
        if n in ds.data_vars:
            return ds[n]
    raise KeyError(f"falta la variable {corto} (busqué {CORTOS[corto]})")


def _mes_completo(ruta, anio, mes):
    try:
        ds = _abre(ruta)
        n = calendar.monthrange(anio, mes)[1] * 24
        ok = ds.sizes.get("time", 0) >= n and all(_var(ds, k) is not None for k in CORTOS)
        ds.close()
        return ok
    except Exception:  # noqa: BLE001
        return False


def _horas(anio):
    t0 = np.datetime64(f"{anio}-01-01T00:00")
    n = (366 if calendar.isleap(anio) else 365) * 24
    return t0, n


def _coseno_cenit(lat, lon, t_mitad):
    import pandas as pd
    import pvlib
    sp = pvlib.solarposition.get_solarposition(pd.DatetimeIndex(t_mitad, tz="UTC"), lat, lon,
                                               method="nrel_numpy")
    z = sp["zenith"].to_numpy(float)
    return np.cos(np.radians(z)), z


def extrae(args):
    import xarray as xr
    j, lats, lons = _lee_nodos(args.nodos)
    anio, iso3 = int(j["year"]), j["iso3"]
    t0, n_h = _horas(anio)
    N = len(lats)
    cab = {"formato": FORMATO_BIN, "v": 1, "iso3": iso3, "year": anio,
           "t0": f"{anio}-01-01T00:00Z", "dt_s": 3600, "n_horas": n_h,
           "columnas": COLUMNAS, "nodos": [[float(a), float(b)] for a, b in zip(lats, lons)],
           "fuente": "ERA5 · Copernicus C3S (CC-BY 4.0) · reanalysis-era5-single-levels"}
    cb = json.dumps(cab, separators=(",", ":")).encode()
    cb += b" " * ((-(len(cb) + 4)) % 4)            # los float32 empiezan alineados a 4
    off = 4 + len(cb)
    salida = Path(args.salida)
    with open(salida, "wb") as f:
        f.write(struct.pack("<I", len(cb)))
        f.write(cb)
        f.truncate(off + N * len(COLUMNAS) * n_h * 4)
    M = np.memmap(salida, dtype="<f4", mode="r+", offset=off, shape=(N, len(COLUMNAS), n_h))
    M[:] = np.nan
    C = {c: i for i, c in enumerate(COLUMNAS)}
    ilat = xr.DataArray(lats, dims="n")
    ilon = xr.DataArray(lons, dims="n")
    meses = range(1, 13) if not args.meses else [int(m) for m in args.meses.split(",")]
    for mes in meses:
        ruta = fichero_mes(args.cache, iso3, anio, mes)
        if not ruta.exists():
            raise SystemExit(f"falta {ruta.name}: corre antes «descarga»")
        ds = _abre(ruta)
        sel = ds.sel(latitude=ilat, longitude=ilon, method="nearest")
        dlat = np.abs(sel["latitude"].values - lats).max()
        dlon = np.abs(sel["longitude"].values - lons).max()
        if max(dlat, dlon) > 0.01:
            raise SystemExit(f"{ruta.name}: los nodos no caen en la rejilla de ERA5 "
                             f"(desvío {max(dlat, dlon):.3f}°). El lote solo admite pasos múltiplos de 0,25°.")
        t = sel["time"].values.astype("datetime64[m]")
        idx = ((t - t0) / np.timedelta64(1, "h")).astype(int)
        dentro = (idx >= 0) & (idx < n_h)
        idx = idx[dentro]
        g = lambda k: _var(sel, k).transpose("n", "time").values[:, dentro].astype("f8")
        u, v = g("u10"), g("v10")
        ssrd, fdir = g("ssrd") / 3600.0, g("fdir") / 3600.0
        M[:, C["ghi"], idx] = np.maximum(0, ssrd)
        M[:, C["dhi"], idx] = np.maximum(0, ssrd - fdir)
        M[:, C["dni"], idx] = np.maximum(0, fdir)        # directa HORIZONTAL; se pasa a normal abajo
        M[:, C["temp"], idx] = g("t2m") - 273.15
        M[:, C["ws"], idx] = np.hypot(u, v)
        M[:, C["wd"], idx] = (270.0 - np.degrees(np.arctan2(v, u))) % 360.0
        M[:, C["gust"], idx] = np.maximum(0, g("fg10"))
        ds.close()
        print(f"  {ruta.name}: {len(idx)} horas", flush=True)
    # la DNI necesita el sol de cada nodo
    horas = t0 + np.arange(n_h) * np.timedelta64(1, "h")
    t_mitad = (horas - np.timedelta64(30, "m")).astype("datetime64[ns]")
    for k in range(N):
        cz, z = _coseno_cenit(lats[k], lons[k], t_mitad)
        dh = np.array(M[k, C["dni"]], dtype="f8")
        dn = np.where(z < 90.0, dh / np.maximum(cz, np.cos(np.radians(CENIT_MAX))), 0.0)
        M[k, C["dni"]] = np.clip(dn, 0, 1400.0)
    M.flush()
    huecos = int(np.isnan(np.asarray(M[:, [C["ghi"], C["ws"]], :])).sum())
    if huecos and not args.meses:
        raise SystemExit(f"{salida.name}: {huecos} valores sin dato en GHI o viento — falta algún mes")
    print(f"  {salida.name}: {N} nodos × {n_h} h ({salida.stat().st_size/1e6:.0f} MB)", flush=True)


# ───────────────────────────── autoprueba ─────────────────────────────
def autoprueba(_args):
    """Un ERA5 de mentira con la forma del CDS nuevo (ZIP con dos netCDF, uno
    instantáneo y otro acumulado, latitud descendente, `valid_time`) y valores
    elegidos para que cada conversión tenga UNA respuesta: si alguna unidad,
    signo, convención o alineación está mal, falla."""
    import xarray as xr
    fallos = []
    ok = lambda nombre, c: (print(("OK   " if c else "FAIL ") + nombre), None if c else fallos.append(nombre))
    tmp = Path(tempfile.mkdtemp(prefix="autoprueba_era5_"))
    anio, iso3 = 2021, "TST"
    lats_g = np.arange(44.0, 39.75, -0.25)        # descendente, como ERA5
    lons_g = np.arange(-2.0, 1.25, 0.25)
    nodos = [[42.0, -1.0], [41.5, 0.5], [43.75, -2.0]]
    (tmp / "nodos.json").write_text(json.dumps({"iso3": iso3, "year": anio, "nodos": nodos}))
    for mes in (1, 2):
        dias = calendar.monthrange(anio, mes)[1]
        t = np.datetime64(f"{anio}-{mes:02d}-01T00:00") + np.arange(dias * 24) * np.timedelta64(1, "h")
        h = ((t - np.datetime64(f"{anio}-01-01T00:00")) / np.timedelta64(1, "h")).astype(float)
        LA, LO = np.meshgrid(lats_g, lons_g, indexing="ij")
        forma = (len(t),) + LA.shape
        base = np.broadcast_to(LA * 100 + LO, forma)          # identifica el nodo
        hh = np.broadcast_to(h[:, None, None], forma)          # identifica la hora
        u = np.full(forma, -3.0); v = np.full(forma, 4.0)      # sopla DEL este-sur… → 5 m/s
        inst = xr.Dataset(
            {"u10": (("valid_time", "latitude", "longitude"), u),
             "v10": (("valid_time", "latitude", "longitude"), v),
             "t2m": (("valid_time", "latitude", "longitude"), 273.15 + base / 1000 + 0 * hh),
             "fg10": (("valid_time", "latitude", "longitude"), hh % 30 + 0 * base)},
            coords={"valid_time": t, "latitude": lats_g, "longitude": lons_g})
        acum = xr.Dataset(
            {"ssrd": (("valid_time", "latitude", "longitude"), np.full(forma, 3600.0 * 500)),
             "fdir": (("valid_time", "latitude", "longitude"), np.full(forma, 3600.0 * 300))},
            coords={"valid_time": t, "latitude": lats_g, "longitude": lons_g})
        dz = tmp / f"m{mes}"
        dz.mkdir()
        inst.to_netcdf(dz / "data_stream-oper_stepType-instant.nc")
        acum.to_netcdf(dz / "data_stream-oper_stepType-accum.nc")
        with zipfile.ZipFile(fichero_mes(tmp, iso3, anio, mes), "w") as z:
            for p in dz.glob("*.nc"):
                z.write(p, p.name)
    ok("un mes en ZIP con dos netCDF se reconoce completo", _mes_completo(fichero_mes(tmp, iso3, anio, 1), anio, 1))
    salida = tmp / "meteo.bin"
    extrae(argparse.Namespace(nodos=tmp / "nodos.json", cache=tmp, salida=salida, meses="1,2"))
    raw = salida.read_bytes()
    L = struct.unpack("<I", raw[:4])[0]
    cab = json.loads(raw[4:4 + L])
    ok("cabecera con formato, año y columnas en el orden del motor",
       cab["formato"] == FORMATO_BIN and cab["year"] == anio and cab["columnas"] == COLUMNAS)
    ok("los datos empiezan alineados a 4 bytes", (4 + L) % 4 == 0)
    n_h = cab["n_horas"]
    ok("un año normal son 8760 horas", n_h == 8760)
    M = np.frombuffer(raw, dtype="<f4", offset=4 + L).reshape(len(nodos), len(COLUMNAS), n_h)
    C = {c: i for i, c in enumerate(COLUMNAS)}
    ok("velocidad = √(u²+v²) = 5 m/s", np.allclose(M[:, C["ws"], :24], 5.0))
    # u=−3 (hacia el oeste), v=+4 (hacia el norte): VIENE del sureste-este, 143,13°
    ok("dirección meteorológica (de dónde viene): u=−3, v=4 → 143,1°",
       np.allclose(M[:, C["wd"], :24], (270 - np.degrees(np.arctan2(4, -3))) % 360, atol=1e-3)
       and abs(float(M[0, C["wd"], 0]) - 143.13) < 0.01)
    ok("temperatura en °C y del NODO pedido (no del vecino)",
       all(abs(float(M[k, C["temp"], 5]) - (nodos[k][0] * 100 + nodos[k][1]) / 1000) < 1e-3 for k in range(3)))
    ok("ráfaga en su HORA (fg10 = hora % 30): sin desplazar", np.allclose(M[0, C["gust"], :48], np.arange(48) % 30))
    ok("GHI = ssrd/3600 = 500 W/m²", np.allclose(M[:, C["ghi"], :24], 500.0))
    ok("DHI = (ssrd − fdir)/3600 = 200 W/m²", np.allclose(M[:, C["dhi"], :24], 200.0))
    feb_fin = (31 + 28) * 24
    ok("enero y febrero llenos, marzo sin dato (se pidieron dos meses)",
       not np.isnan(M[:, C["ghi"], :feb_fin]).any() and np.isnan(M[:, C["ghi"], feb_fin:]).all())
    # DNI: de noche 0; de día directa horizontal / cos(cenit a mitad de hora), acotada
    cz, z = _coseno_cenit(42.0, -1.0, (np.datetime64(f"{anio}-01-01T00:00") + np.arange(24) * np.timedelta64(1, "h")
                                       - np.timedelta64(30, "m")).astype("datetime64[ns]"))
    dn = M[0, C["dni"], :24]
    noche = z >= 90
    ok("DNI = 0 con el sol bajo el horizonte", np.all(dn[noche] == 0))
    dia = (~noche) & (z < 80)
    esperada = np.minimum(300 / np.maximum(cz, np.cos(np.radians(CENIT_MAX))), 1400.0)
    ok("DNI de día = 300 / cos(cenit a mitad de hora), acotada a 1400",
       dia.any() and np.allclose(dn[dia], esperada[dia], rtol=1e-4) and (esperada[dia] < 1400).any())
    ok("DNI acotada (nunca por encima de 1400)", float(np.nanmax(M[:, C["dni"], :feb_fin])) <= 1400.0)
    ok("área en múltiplos de 0,25° y con margen", area_de(np.array([42.1, 41.5]), np.array([-1.0, 0.6])) == [42.5, -1.25, 41.25, 1.0])
    print(("\nFALLOS: " + str(len(fallos))) if fallos else "\nOK — autoprueba de era5.py")
    return 1 if fallos else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="orden", required=True)
    for nombre in ("descarga", "extrae"):
        p = sub.add_parser(nombre)
        p.add_argument("--nodos", required=True)
        p.add_argument("--cache", required=True)
        p.add_argument("--meses", default="", help="solo para depurar: '1,2'")
        if nombre == "extrae":
            p.add_argument("--salida", required=True)
    sub.add_parser("autoprueba")
    a = ap.parse_args(argv)
    if a.orden == "descarga":
        return descarga(a) or 0
    if a.orden == "extrae":
        return extrae(a) or 0
    return autoprueba(a)


if __name__ == "__main__":
    sys.exit(main())
