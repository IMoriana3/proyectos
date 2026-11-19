#!/usr/bin/env python3
"""¿SIGUE CADA COPIA FIJADA CUADRANDO CON SU ORIGINAL?

Un candado es una afirmación sobre BYTES: «esta copia es este sha256». Y como
toda afirmación, envejece — la copia del gemelo se quedó dos meses por detrás
con su doctrina escrita en la cabecera, y la del canon de radio daba 4,8 dB de
diferencia cuando nadie la careaba.

Esto no sustituye a los careos de cada repo, que son los que de verdad valen:
un candado cuadra consigo mismo y no dice NADA sobre si la copia está al día
respecto al ORIGINAL VIVO. Lo que esto contesta es la pregunta barata de
encima: ¿el fichero que el candado nombra sigue teniendo el sha que declara?

  python3 docs/candados.py            # sobre los repos declarados en repos.sh
  python3 docs/candados.py --raiz DIR
  python3 docs/candados.py --sin-censo # solo los careos, sin el censo de copias


Y LA OTRA MITAD: LAS COPIAS QUE NINGÚN CANDADO NOMBRA
------------------------------------------------------
Lo de arriba carea las copias DECLARADAS. Pero un candado sólo mira donde se le
dice que mire, y el parque de copias es mayor que la lista. Medido el
2026-11-19: `seguidor.js` existe CINCO veces y el único careado era el del
canon. Las otras cuatro —gemelo-digital, cobertura-zigbee, cobertura-rf-fv,
proyectos— nadie las miraba, y eran TRES contenidos distintos:

    44.097 B  SolarGPTfull/viewers/lib/seguidor.js   <- el fijado
    44.491 B  gemelo-digital/seguidor.js             <- «copia sincronizada» según el propio candado
    44.491 B  proyectos/seguidor.js
    47.995 B  cobertura-zigbee/seguidor.js
    47.995 B  cobertura-rf-fv/seguidor.js

Y las tres declaran `VERSION = '0.4.23'`. La versión MIENTE, que es la deriva
silenciosa con su mejor disfraz: si el número coincide, nadie va a mirar los
bytes.

Así que el censo busca, por nombre de fichero, TODAS las copias que hay bajo la
raíz, y dice cuáles no nombra ningún candado. Una copia no nombrada que además
DIFIERE del fijado es rojo: se ha mirado y está mal. Una no nombrada idéntica
hoy no es rojo —hoy cuadra— pero se LISTA, porque mañana puede no cuadrar y no
hay nada que lo vaya a decir.

El censo NO decide quién va por delante. En `seguidor.js` el superconjunto es
el de cobertura-zigbee, no el fijado: «sincronizar» copiando el candado encima
borraría código vivo. Qué copia promover es decisión humana; esto sólo deja de
esconder que hay varias.

rc = 0  todas las copias fijadas cuadran
rc = 1  al menos una NO cuadra: el candado está rancio
rc = 2  no se ha podido comprobar (sin repos, o un FORMATO DESCONOCIDO)


POR QUÉ UN FORMATO DESCONOCIDO ES rc = 2 Y NO UN SALTO
-------------------------------------------------------
Porque ya me pasó, el 2026-09-24, y con la mano en la masa. La primera versión
de este cruce la escribí de un tirón en la terminal y entendía dos formas
—`copias: [...]` y `copia: {...}`—. `viewers/lib/seguidor.lock.json` usa una
tercera (`modelo` + `sha256` arriba del todo), así que el bucle no lo tocaba y
**salía un «siete de siete verdes» que en realidad eran seis**.

Lo dije como «no comprobado» en vez de contarlo, que es lo mínimo. Pero lo
mínimo no es el arreglo: un cruce que se salta en silencio lo que no entiende
es la séptima lección con otro traje — el vacío leyéndose como normal. Así que
aquí un formato que no se reconozca **para la comprobación entera**, dice cuál
es y sale con 2. Seis de siete con el séptimo NOMBRADO vale más que un siete
que no lo es; y un rc = 2 que obliga a mirarlo vale más que las dos cosas.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import sys

# ── LOS FORMATOS QUE SE RECONOCEN ────────────────────────────────────────
# Cada entrada dice cómo sacar la lista de (ruta, sha256) de ese candado. Son
# tres porque nacieron en tres sitios distintos y ninguno sabía de los otros;
# unificarlos es otro encargo y tocaría tres repos. Lo que NO puede pasar es
# que aparezca un cuarto y nadie se entere.
def _de_copias(d):
    """canon.lock.json de rf-fv y de cobertura-zigbee: lista `copias`."""
    return [(c.get("aqui") or c.get("ruta"), c.get("sha256")) for c in d["copias"]]


def _de_copia(d):
    """zigbee_pv_model.lock.json y gemelo.lock.json: una sola `copia`."""
    c = d["copia"]
    return [(c.get("aqui") or c.get("ruta"), c.get("sha256"))]


def _de_modelo(d):
    """seguidor.lock.json: el fichero va en `modelo` y el sha arriba del todo.
    ÉSTE es el que la primera versión se saltaba."""
    return [(d["modelo"], d["sha256"])]


FORMATOS = [
    ("copias", lambda d: "copias" in d, _de_copias),
    ("copia",  lambda d: "copia" in d,  _de_copia),
    ("modelo", lambda d: "modelo" in d and "sha256" in d, _de_modelo),
]


def lee(lock: pathlib.Path):
    """Devuelve (nombre_formato, [(ruta, sha), ...]) o lanza si no lo conoce."""
    d = json.loads(lock.read_text(encoding="utf8"))
    for nombre, casa, saca in FORMATOS:
        if casa(d):
            return nombre, saca(d)
    raise ValueError(
        "formato no reconocido. Claves de nivel 1: " + ", ".join(sorted(d)) +
        ". Añádelo a FORMATOS —o arregla el candado— pero NO lo saltes: un "
        "candado que nadie carea es exactamente el estado del que estos "
        "ficheros vienen a sacarnos.")


def resuelve(lock: pathlib.Path, ruta: str) -> pathlib.Path | None:
    """La ruta de un candado es relativa a la RAÍZ DEL REPO, y el candado puede
    estar a cualquier profundidad. Se prueban los padres de menos a más."""
    for base in [lock.parent, *lock.parents[1:4]]:
        cand = base / ruta
        if cand.exists():
            return cand
    return None


def censo(raiz: pathlib.Path, declaradas: dict[pathlib.Path, str]) -> list[tuple]:
    """Copias que ningún candado nombra, por nombre de fichero.

    `declaradas` es {ruta_resuelta: sha_declarado}. Se buscan bajo la raíz todas
    las copias que se llamen igual que alguna declarada y se devuelve la lista
    de las que no están en ella, con su sha y si coincide con el fijado.
    """
    porNombre: dict[str, str] = {}
    for f, sha in declaradas.items():
        porNombre.setdefault(f.name, sha)

    fuera = []
    for nombre, sha_fijado in sorted(porNombre.items()):
        for cand in sorted(raiz.glob("*/**/" + nombre)):
            if "node_modules" in str(cand) or cand in declaradas:
                continue
            real = hashlib.sha256(cand.read_bytes()).hexdigest()
            fuera.append((str(cand).replace(str(raiz) + "/", ""),
                          nombre, real == sha_fijado, real))
    return fuera


def main() -> int:
    raiz = pathlib.Path("/home/user")
    if "--raiz" in sys.argv:
        raiz = pathlib.Path(sys.argv[sys.argv.index("--raiz") + 1])

    locks = sorted(p for p in raiz.glob("*/**/*.lock.json")
                   if "node_modules" not in str(p))
    if not locks:
        print("SIN COMPROBAR: no se ha encontrado ningún candado bajo " + str(raiz))
        print("Cero candados no es «todo bien»: es que no se ha mirado.")
        return 2

    rancios, sin_fichero, desconocidos, careadas = [], [], [], 0
    declaradas: dict[pathlib.Path, str] = {}        # para el censo de abajo
    for lk in locks:
        corto = str(lk).replace(str(raiz) + "/", "")
        try:
            formato, copias = lee(lk)
        except Exception as e:                       # noqa: BLE001 — se dice cuál
            desconocidos.append((corto, str(e)))
            print("  ?  %-58s %s" % (corto, e))
            continue
        for ruta, sha in copias:
            if not ruta or not sha:
                desconocidos.append((corto, "una copia sin `ruta` o sin `sha256`"))
                print("  ?  %-58s copia incompleta" % corto)
                continue
            f = resuelve(lk, ruta)
            if f is None:
                sin_fichero.append((corto, ruta))
                print("  ✗  %-58s NO existe: %s" % (corto, ruta))
                continue
            real = hashlib.sha256(f.read_bytes()).hexdigest()
            declaradas[f.resolve()] = sha
            careadas += 1
            if real == sha:
                print("  ✔  %-58s %s" % (corto, ruta))
            else:
                rancios.append((corto, ruta, sha[:12], real[:12]))
                print("  ✗  RANCIO %-51s %s" % (corto, ruta))
                print("         declara %s… y el fichero es %s…" % (sha[:12], real[:12]))

    # ── EL CENSO ────────────────────────────────────────────────────────────
    # Va DESPUÉS de los careos porque necesita saber qué rutas están declaradas,
    # y ANTES del veredicto porque una copia no nombrada que difiere es un
    # hallazgo, no una nota al pie.
    huerfanas = [] if "--sin-censo" in sys.argv else censo(raiz, declaradas)
    divergentes = [h for h in huerfanas if not h[2]]
    if huerfanas:
        print()
        print("CENSO de copias que NINGÚN candado nombra:")
        for ruta, nombre, igual, real in huerfanas:
            print("  %s  %-58s %s" % ("=" if igual else "≠", ruta,
                                      "idéntica al fijado" if igual
                                      else "DIFIERE (" + real[:12] + "…)"))

    print()
    print("alcance: %d candados · %d formatos reconocidos · %d copias careadas"
          % (len(locks), len(FORMATOS), careadas)
          + ("" if "--sin-censo" in sys.argv else
             " · %d copias sin candado (%d divergentes)" % (len(huerfanas), len(divergentes))))

    if desconocidos:
        print()
        print("SIN COMPROBAR: %d candado(s) con formato que no conozco." % len(desconocidos))
        print("NO se saltan y no se cuentan como verdes: o se añade su formato a")
        print("FORMATOS, o se arregla el candado. Un cruce que ignora lo que no")
        print("entiende publica un verde que no ha mirado.")
        return 2
    # EL ROJO VA ANTES QUE EL PISO, Y NO ES UN DETALLE DE ORDEN.
    # La primera versión preguntaba primero «¿he careado alguna?» y después
    # «¿alguna está mal?». Con un candado cuyo único fichero no existe salían
    # cero careadas, así que un hallazgo CONFIRMADO —falta el fichero— se
    # publicaba como rc = 2, «no comprobado». Un rojo no se degrada nunca: se
    # ha mirado y está mal, aunque no se haya podido mirar nada más.
    # Es el mismo defecto que `copiaQueFalta` de factiun-cartera tuvo esta
    # misma mañana, cometido otra vez al escribir esto. Lo cazó su propio
    # control negativo, que es para lo que están.
    if rancios or sin_fichero or divergentes:
        print()
        print("ROJO · %d copia(s) fuera de su candado:"
              % (len(rancios) + len(sin_fichero) + len(divergentes)))
        for ruta, nombre, _igual, real in divergentes:
            print("    %s: NINGÚN candado la nombra y DIFIERE del fijado (%s…)" % (ruta, real[:12]))
        for c, r, dice, es in rancios:
            print("    %s → %s: declara %s… y es %s…" % (c, r, dice, es))
        for c, r in sin_fichero:
            print("    %s → %s: el fichero no está" % (c, r))
        print("    Si la copia cambió a propósito, actualiza su candado EN EL MISMO")
        print("    commit. Si no, alguien la tocó sin pasar por su careo.")
        if divergentes:
            print("    Para las que ningún candado nombra: NO las sobrescribas sin mirar")
            print("    quién va por delante. En seguidor.js el superconjunto es el de")
            print("    cobertura-zigbee, no el fijado. Promover una copia es decisión")
            print("    humana; lo que esto arregla es que dejen de ser invisibles.")
        return 1
    if not careadas:
        print()
        print("SIN COMPROBAR: hay candados pero no se ha careado ni una copia.")
        print("Cero careos no es «todo bien»: es que no se ha mirado nada.")
        return 2

    print("VERDE · las %d copias fijadas cuadran con su candado." % careadas)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
