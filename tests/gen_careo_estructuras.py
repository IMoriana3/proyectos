"""Genera `tests/careo-estructuras.json`: la meteo y el resultado CANÓNICO.

El careo de la ficha no puede ser «se parece»: tiene que ser contra el core.
Este script corre `solargpt_core.structure_compare.compare_structures` sobre una
meteo determinista y congela las dos cosas —la meteo de entrada y el resultado—
para que `tests/test_comparador.js` alimente al motor del navegador EXACTAMENTE
lo mismo y compare peras con peras.

Se regenera a mano (no en CI: necesita el repo del motor y pvlib):

    python3 tests/gen_careo_estructuras.py --core /ruta/a/SolarGPTfull/solargpt \
        --motivo "por qué se regenera"

Doce días —el 15 de cada mes, horario— en vez del año entero: recorre las cuatro
estaciones, ejercita el backtracking en el solsticio de invierno (que es cuando
la sombra entre filas manda) y deja un fixture de 30 KB en vez de 600 KB. Los
kWh/m² del fixture son los de esos doce días, no un año: lo que se carea es la
FÍSICA y el ORDEN, no un anual.

MANIFIESTO — por qué existe (PORTAL-BUG-01, 2026-08-26)
=======================================================
Este golden estuvo **cinco días midiendo otra física** sin que nada lo dijera, y
el mecanismo del fallo es de proceso, no de cálculo:

* 2026-08-20 14:46 · el motor JS de la ficha empieza a sombrear el circunsolar
  (`dirCirc`, commit `c84753f`);
* 2026-08-21 08:36 · el CORE hace lo mismo (`8c6fbc6`, SolarGPT v1.64.0: «la
  sombra entre filas tapa también el circunsolar de Perez»);
* 2026-08-21 17:43 · se regenera este fixture (`9a15dc2`)… **nueve horas
  después** del cambio del core y con la física VIEJA dentro. El clon local de
  SolarGPT desde el que se generó no tenía ese merge.

Y no cantó por dos razones que ahora se cierran aquí:

1. **el fixture no registraba de qué core salía**, así que era imposible saber
   que estaba atrasado sin rehacer el cálculo;
2. la tolerancia del careo (2,5 pp y 8 %) es más ANCHA que la deriva que
   introdujo el cambio (máx. 1,12 pp y 1,0 %), así que `test_comparador.js`
   siguió en verde careando dos físicas distintas.

Por eso el fixture lleva ahora un bloque `manifiesto` con el commit y la versión
del core, la fecha, el hash del contenido y el MOTIVO de la regeneración, y
**EL CORE TIENE QUE ESTAR EN `main`** (2026-08-26). `--core` es una ruta LOCAL
y nada obligaba a que el checkout estuviera en `main`. Ese día este golden se
generó desde la rama de un PR ABIERTO de SolarGPTfull, así que pasó a describir
una física que en `main` no existía: `main` quedó en rojo, y **con `main` rojo
toda rama nueva nace roja** — tres PRs atascados a la vez y un ciclo cerrado (el
PR bloqueado por un pin, el arreglo del pin bloqueado por este golden, y este
golden solo se arreglaba mergeando el PR).

Registrar la procedencia hizo el fixture AUDITABLE. Pero auditable no es
correcto: había que ir a mirarlo. Ahora es MECANISMO — el generador se niega, y
saltárselo exige `--permitir-core-fuera-de-main`, que hay que escribir a mano.

`--motivo` es OBLIGATORIO: un golden que se puede actualizar sin dejar dicho por
qué es un golden que se actualiza para poner el CI verde.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

LAT, LON = 37.3891, -5.9845          # Sevilla — el sitio por defecto de la ficha
YEAR = 2023
DIAS = [f"{YEAR}-{m:02d}-15" for m in range(1, 13)]
ESTRUCTURAS = ["fija_optima", "fija_proyecto", "fija_ew",
               "tracker_hsat", "tracker_hsat_nobt", "tracker_tsat"]
PITCH_M, ANCHO_M = 6.00, 2.382
ALBEDO, TILT_PROYECTO, MAX_ANGLE = 0.20, 25.0, 55.0
PENDIENTE = 8.0        # pendiente del terreno ⊥ a las filas, en grados


def _git(repo: Path, *args: str) -> str:
    """Salida de un `git` en `repo`, o "" si no se puede leer.

    No se inventa nada: si el core no es un repo git o el binario no está, el
    campo sale vacío y el guard del careo lo declara como procedencia
    INCOMPLETA. Un SHA fabricado sería peor que ninguno.
    """
    try:
        out = subprocess.run(["git", "-C", str(repo), *args],
                             capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return ""
    return out.stdout.strip() if out.returncode == 0 else ""


def procedencia_del_core(core: Path) -> dict:
    """De qué core sale este golden. Lo que faltaba en PORTAL-BUG-01.

    `sucio` no es cosmético: un golden generado sobre un árbol con cambios sin
    commitear no es reproducible por nadie más, y el careo tiene que poder
    decirlo en vez de dar por buena una procedencia que no lleva a ningún sitio.
    """
    raiz = core.parent if core.name == "solargpt" else core
    version = fecha_version = ""
    try:
        sys.path.insert(0, str(core))
        from solargpt_core import version as _v          # type: ignore
        version = str(getattr(_v, "__version__", ""))
        fecha_version = str(getattr(_v, "VERSION_DATE", ""))
    except Exception:                                     # noqa: BLE001
        pass
    return {
        "repo": "IMoriana3/SolarGPTfull",
        "commit": _git(raiz, "rev-parse", "HEAD"),
        "commit_fecha": _git(raiz, "log", "-1", "--format=%ad", "--date=short"),
        "rama": _git(raiz, "rev-parse", "--abbrev-ref", "HEAD"),
        "version": version,
        "version_fecha": fecha_version,
        "sucio": bool(_git(raiz, "status", "--porcelain")),
    }


#: Hueco del hash dentro del propio fichero, antes de rellenarlo.
_HUECO_SHA = '"sha256": ""'


def sellar(texto: str) -> str:
    """Mete en el fichero el SHA-256 de SU PROPIO TEXTO con el hueco vacío.

    El hash se calcula sobre los BYTES del fichero, no sobre el dict
    reserializado, y eso es deliberado: `json.dumps` de Python y
    `JSON.stringify` de JavaScript **no** escriben los mismos números
    (`0.0` frente a `0`, `1e-05` frente a `0.00001`), así que un hash sobre el
    objeto parseado sería un careo entre lenguajes disfrazado de comprobación
    de integridad, y se rompería el día menos oportuno por un cero.

    El truco para que el hash quepa dentro de lo que hashea: se escribe con el
    campo VACÍO, se hashea el texto, y se sustituye el hueco. El verificador
    hace justo lo contrario. Textual, sin ambigüedad y comprobable desde
    cualquier lenguaje que sepa leer un fichero.
    """
    if texto.count(_HUECO_SHA) != 1:
        raise RuntimeError(
            f"se esperaba exactamente un hueco {_HUECO_SHA} en el golden y hay "
            f"{texto.count(_HUECO_SHA)}: sellarlo mal es peor que no sellarlo")
    h = hashlib.sha256(texto.encode("utf-8")).hexdigest()
    return texto.replace(_HUECO_SHA, f'"sha256": "{h}"', 1)


#: La cadena de cálculo EN ORDEN. Sirve para LOCALIZAR: recorrida de principio
#: a fin, la primera etapa que discrepa es el primer punto de divergencia. El
#: protocolo de PORTAL-BUG-01 lo pedía y este golden no lo tenía —guardaba
#: cuatro agregados finales—, así que el 2026-08-26 el careo solo supo decir
#: «el POA no cuadra» y de ahí se acusó al portal de enseñar física vieja
#: cuando el que fallaba era el core: el backtracking no llevaba la pendiente
#: (CROSS-TILT-01). Con el ÁNGULO delante, eso se ve de un vistazo.
#: θ NO va como agregado, va como SERIE. Medido: el defecto que motivó todo
#: esto —backtrackear como si el campo fuese llano— mueve θ 7,5° de media y
#: hasta 34,8° paso a paso, y sin embargo la MEDIA de |θ| solo se mueve 0,07°,
#: porque las desviaciones se compensan. Un agregado de θ parecería cobertura y
#: no lo sería: por eso la serie se guarda entera y el careo mira `max|Δθ|`.
_ETAPAS = (
    ("poa_directa", "POA_Direct", "sum"),
    ("poa_difusa_cielo", "POA_Sky_Diffuse", "sum"),
    ("poa_difusa_suelo", "POA_Ground_Diffuse", "sum"),
    ("poa_ideal_sin_sombra", "POA_Ideal_NoShade", "sum"),
    ("sombra_media", "ShadedFraction", "mean"),
    ("poa_neta", "POA_Global", "sum"),
)


def _cadena(cmp_):
    """Un número por etapa y estructura, del detalle que publica el core.

    Se piden con `getattr` porque `detalle` es reciente: contra un core que no
    lo exponga el golden sale SIN cadena y el careo lo dice, en vez de fingir
    que localiza. Una fija no tiene ángulo y su cadena empieza en la directa:
    las columnas ausentes se saltan, no se rellenan con un cero que mentiría.
    """
    import numpy as _np
    detalle = getattr(cmp_, "detalle", None) or {}
    out = {}
    for clave, df in detalle.items():
        etapas = {}
        for nombre, col, modo in _ETAPAS:
            if col not in df.columns:
                continue
            v = df[col].to_numpy(dtype=float)
            if modo == "abs_mean":  # ya no se usa; se deja el modo por si vuelve
                # Solo los pasos DE DÍA. El ángulo nocturno no es un dato, es un
                # relleno, y promediarlo mete media serie a cero. El motor de la
                # ficha promedia solo de día —su bucle salta la noche—, así que
                # sin esta máscara los dos lados medirían cosas distintas y la
                # comparación daría un factor ≈2 falso. Medido antes de ponerla:
                # tracker_hsat 15,261 aquí contra 30,138 en la ficha.
                dia = (df["GHI"].to_numpy(dtype=float) > 0.0
                       if "GHI" in df.columns else _np.ones(len(v), dtype=bool))
                vd = v[dia]
                val = _np.nanmean(_np.abs(vd)) if vd.size else 0.0
            else:
                val = _np.nansum(v) if modo == "sum" else _np.nanmean(v)
            etapas[nombre] = round(float(val), 6)
        # La SERIE de θ, solo en los pasos de día y solo para lo que la tiene.
        # Una fija no sigue al sol: su θ es el tilt, constante, y guardarlo 288
        # veces no informa de nada.
        if "theta_target_deg" in df.columns and clave.startswith("tracker"):
            th = df["theta_target_deg"].to_numpy(dtype=float)
            dia = (df["GHI"].to_numpy(dtype=float) > 0.0
                   if "GHI" in df.columns else _np.ones(len(th), dtype=bool))
            # Longitud COMPLETA con `null` donde no hay día, no solo los pasos
            # diurnos: los dos motores no ponen la frontera del día en el mismo
            # sitio —hay un paso con GHI>0 en el que la ficha ya considera el sol
            # bajo el horizonte— y comparar dos listas de 144 y 145 elementos
            # alinea mal TODO lo que va detrás. Con el índice compartido, cada
            # lado marca sus huecos y se comparan solo los pasos que ambos tienen.
            etapas["theta_serie"] = [(round(float(x), 3) if ok else None)
                                     for x, ok in zip(th, dia)]
        if etapas:
            out[clave] = etapas
    return out


def _procedencia(core_dir: Path) -> dict:
    """De qué core y con qué stack salió este golden.

    Sin esto el fixture era INAUDITABLE por construcción: `--core` es una ruta
    LOCAL sin pin, así que el resultado depende de lo que tuviera comprobado
    quien lo generó, y no quedaba ni rastro de qué era. Y pasó de verdad: el
    2026-08-21 el core corrigió la sombra del circunsolar de Perez a las 08:36
    y este fichero se regeneró a las 17:43 —nueve horas DESPUÉS— desde un
    checkout viejo. El golden se quedó una física por detrás del core Y del
    portal, y mirándolo no había forma de saberlo.
    """
    def _git(*args: str) -> str:
        try:
            return subprocess.run(("git", "-C", str(core_dir), *args),
                                  capture_output=True, text=True, timeout=15,
                                  check=True).stdout.strip()
        except Exception:
            return "desconocido"

    import numpy
    import pandas
    import pvlib

    sucio = _git("status", "--porcelain")
    return {
        "core_commit": _git("rev-parse", "HEAD"),
        "core_descripcion": _git("log", "-1", "--format=%h %ad %s", "--date=short"),
        # False = se generó con cambios sin commitear: el commit NO describe
        # lo que se ejecutó, así que el golden no es reproducible.
        "core_limpio": sucio == "",
        "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "python": sys.version.split()[0],
        "pvlib": pvlib.__version__,
        "numpy": numpy.__version__,
        "pandas": pandas.__version__,
    }


def core_en_main(core_dir: Path) -> tuple:
    """¿El core del que se va a generar está EN `main`? (ok, detalle)

    2026-08-26. La regla que faltaba, y la que costó una noche entera.

    `--core` es una ruta LOCAL: nada obliga a que el checkout esté en `main`.
    El 2026-08-26 este golden se generó desde la rama del PR #156 de
    SolarGPTfull —abierto y SIN MERGEAR—, así que pasó a describir una física
    que en `main` no existía. Consecuencia: `main` en rojo, y **con `main` rojo
    toda rama nueva nace roja**. Tres PRs atascados a la vez, tres sesiones
    empujando el mismo pin, y un ciclo cerrado —el PR bloqueado por el pin, el
    arreglo del pin bloqueado por este golden, y este golden solo se arreglaba
    mergeando el PR—.

    Registrar la procedencia (lo que ya hacía este script) hizo el fixture
    AUDITABLE: se podía saber de dónde venía. Pero auditable no es lo mismo que
    correcto — había que ir a mirarlo. Esto lo convierte en **mecanismo**: el
    generador se niega, y quien quiera saltárselo tiene que decirlo por su
    nombre.

    No basta con mirar la rama: se comprueba por ANCESTRO contra `origin/main`
    refrescado, porque un checkout puede llamarse `main` y estar por detrás, y
    porque `origin/main` es una caché — si no se refresca, la comprobación
    mide un remoto de hace horas.
    """
    def _git(*args: str):
        try:
            r = subprocess.run(("git", "-C", str(core_dir), *args),
                               capture_output=True, text=True, timeout=30)
            return r.returncode, r.stdout.strip()
        except Exception as e:
            return 1, str(e)

    cod, _ = _git("fetch", "origin", "main")
    if cod != 0:
        return None, ("no se pudo refrescar `origin/main` (¿sin red?). NO se "
                      "da por buena la comprobación: se declara que no se pudo "
                      "hacer, que es distinto de que salga bien.")
    _, head = _git("rev-parse", "HEAD")
    cod, _ = _git("merge-base", "--is-ancestor", "HEAD", "origin/main")
    if cod == 0:
        return True, f"{head[:12]} está en `main`"
    _, rama = _git("rev-parse", "--abbrev-ref", "HEAD")
    return False, (
        f"el core está en {head[:12]} (rama `{rama}`), que NO es ancestro de "
        f"`origin/main`. Generar aquí produce un golden que describe una física "
        f"que `main` no tiene: dejaría `main` en rojo, y con `main` rojo toda "
        f"rama nueva nace roja. Mergea primero, o pasa "
        f"`--permitir-core-fuera-de-main` con su motivo si sabes lo que haces.")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--core", required=True, help="raíz del repo con solargpt_core/")
    ap.add_argument("--out", default=str(Path(__file__).parent / "careo-estructuras.json"))
    # OBLIGATORIO a propósito: regenerar un golden sin dejar escrito POR QUÉ es
    # la forma más fácil de tapar una deriva de física con un commit de una
    # línea. Ver el bloque MANIFIESTO del docstring.
    ap.add_argument("--motivo", required=True,
                    help="por qué se regenera (queda en el manifiesto del golden)")
    ap.add_argument("--permitir-core-fuera-de-main", action="store_true",
                    help="generar aunque el core NO esté en `main` (lo normal "
                         "es que esto sea un error: ver core_en_main)")
    a = ap.parse_args()
    if len(a.motivo.strip()) < 20:
        ap.error("--motivo demasiado corto: se pide una frase que explique el "
                 "cambio, no una palabra. Un motivo vacío de contenido es un "
                 "motivo ausente con mejor cara.")
    # LA PUERTA: el core tiene que estar en `main`.
    _ok, _detalle = core_en_main(Path(a.core).resolve())
    if _ok is False and not a.permitir_core_fuera_de_main:
        ap.error(f"core fuera de `main`: {_detalle}")
    if _ok is False:
        print(f"  ⚠️  GENERANDO DESDE FUERA DE `main` a propósito: {_detalle}")
    elif _ok is None:
        print(f"  ⚠️  {_detalle}")
    else:
        print(f"  ✅ {_detalle}")

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
        tilt_proyecto_deg=TILT_PROYECTO,
        cross_axis_slope_deg=PENDIENTE)

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

    proc = _procedencia(Path(a.core).resolve())
    doc = {
        "_": "Generado por tests/gen_careo_estructuras.py — NO editar a mano.",
        "procedencia": proc,
        "core": {"catalogo": sorted(CATALOGO), "baseline": cmp_.baseline_key,
                 "pendiente_deg": PENDIENTE,
                 "ghi_kwh_m2": round(cmp_.assumptions["ghi_kwh_m2_year"] * anos, 4),
                 "years_equiv": round(anos, 6)},
        "cfg": {"lat": LAT, "lon": LON, "year": YEAR, "pitch_m": PITCH_M,
                "collector_width_m": ANCHO_M, "albedo": ALBEDO,
                "tilt_deg": TILT_PROYECTO, "max_angle_deg": MAX_ANGLE,
                "axis_tilt_deg": 10.0, "cross_axis_slope_deg": PENDIENTE,
                "structures": ESTRUCTURAS},
        "meteo": {
            "t": [t.strftime("%Y-%m-%dT%H:%M:%SZ") for t in idx],
            "ghi": [round(float(v), 3) for v in meteo["GHI"]],
            "dni": [round(float(v), 3) for v in meteo["DNI"]],
            "dhi": [round(float(v), 3) for v in meteo["DHI"]],
        },
        "esperado": filas,
        # DÓNDE, no sólo QUÉ. Ver `_ETAPAS`.
        "cadena": _cadena(cmp_),
    }
    doc["manifiesto"] = {
        "_": ("De qué core sale este golden y por qué se regeneró. Sin esto, un "
              "fixture atrasado es indistinguible de uno al día — que es como "
              "PORTAL-BUG-01 estuvo cinco días careando dos físicas."),
        "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generador": Path(__file__).name,
        "motivo": a.motivo.strip(),
        "core": procedencia_del_core(Path(a.core).resolve()),
    }
    doc["manifiesto"]["sha256"] = ""          # hueco: lo rellena `sellar`

    texto = sellar(json.dumps(doc, ensure_ascii=False, indent=None))
    Path(a.out).write_text(texto, encoding="utf-8")
    doc["manifiesto"]["sha256"] = json.loads(texto)["manifiesto"]["sha256"]
    mc = doc["manifiesto"]["core"]
    print(f"escrito {a.out} · {len(idx)} pasos · {len(filas)} estructuras")
    print(f"  core   {mc['version'] or '?'} · {(mc['commit'] or '?')[:8]} "
          f"({mc['commit_fecha'] or '?'}){'  ÁRBOL SUCIO' if mc['sucio'] else ''}")
    print(f"  sha256 {doc['manifiesto']['sha256'][:16]}…")
    print(f"  motivo {a.motivo.strip()}")
    if not mc["commit"] or not mc["version"]:
        print("  AVISO: procedencia INCOMPLETA — el careo lo declarará")
    print(f"  core: {proc['core_descripcion']}"
          + ("" if proc["core_limpio"] else "   ⚠ CON CAMBIOS SIN COMMITEAR"))
    print(f"  stack: pvlib {proc['pvlib']} · numpy {proc['numpy']} "
          f"· pandas {proc['pandas']}")
    for f in filas:
        print(f"  {f['label']:<42} {f['poa_kwh_m2']:>8.1f} kWh/m²  {f['delta_pct']:+7.2f} %")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
