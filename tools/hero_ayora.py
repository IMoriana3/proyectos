#!/usr/bin/env python3
"""Genera HERO_AYORA, los datos del hero de la portada (index.html).

El hero pinta el relieve REAL de Ayora con sus 751 seguidores. Los datos van
embebidos en index.html (una constante JS) para que la portada abra sin red y
sin servidor, y salen de dos ficheros de cobertura-zigbee:

  ayora_relieve.json  relieve empalmado (levantamiento as-built + DEM), 6 m
  ayora_layout.json   posición y tamaño de cada seguidor

Se submuestrea el relieve a una malla de 80×56 (bilineal) sobre la caja de los
seguidores con 140 m de margen, y las cotas se guardan en decímetros sobre la
mínima. No se inventa nada: cada número es interpolación de la malla real.

  python3 tools/hero_ayora.py ../cobertura-zigbee > /tmp/hero.json
  # y pegar el JSON en index.html: const HERO_AYORA=<json>;

Para regenerar tras un cambio del relieve o del layout, repetir y volver a
pegar. El campo `fuente` del JSON dice de dónde salió y cuándo.
"""
import json, sys, datetime

NX, NN, MARGEN = 80, 56, 140

def main(raiz):
    R = json.load(open(f'{raiz}/ayora_relieve.json'))
    L = json.load(open(f'{raiz}/ayora_layout.json'))
    t = L['trackers']
    xs = [a['x'] for a in t]; ns = [a['n'] for a in t]
    x0, x1 = min(xs) - MARGEN, max(xs) + MARGEN
    n0, n1 = min(ns) - MARGEN, max(ns) + MARGEN
    dx = (x1 - x0) / (NX - 1); dn = (n1 - n0) / (NN - 1)
    z = R['z']; nx, nn, paso, rx0, rn0 = R['nx'], R['nn'], R['paso'], R['x0'], R['n0']

    def zat(x, n):
        fi = (x - rx0) / paso; fj = (n - rn0) / paso
        i = max(0, min(nx - 2, int(fi))); j = max(0, min(nn - 2, int(fj)))
        u = max(0, min(1, fi - i)); v = max(0, min(1, fj - j))
        a = z[j * nx + i]; b = z[j * nx + i + 1]; c = z[(j + 1) * nx + i]; d = z[(j + 1) * nx + i + 1]
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v

    grid = [zat(x0 + i * dx, n0 + j * dn) for j in range(NN) for i in range(NX)]
    zmin, zmax = min(grid), max(grid)
    # [x, n, longitud, cota] en decímetros; 28 módulos de 1,15 m si la ficha no trae `mods`
    filas = [[round(a['x'] * 10), round(a['n'] * 10), round((a.get('mods') or 28) * 1.15 * 10),
              round((zat(a['x'], a['n']) - zmin) * 10)] for a in t]
    gcr = L.get('gcr') if isinstance(L.get('gcr'), (int, float)) else 0.3973   # «derivado · cuerda 2.384 / paso 6» en el layout
    out = {
        "planta": "Ayora", "code": "24025", "lat": round(L['clat'], 5), "lon": round(L['clon'], 5),
        "gcr": gcr, "pitch": 6,
        "x0": round(x0, 1), "n0": round(n0, 1), "dx": round(dx, 2), "dn": round(dn, 2), "nx": NX, "nn": NN,
        "zmin": round(zmin, 2), "zmax": round(zmax, 2),
        "fuente": {
            "relieve": "cobertura-zigbee/ayora_relieve.json (levantamiento as-built + DEM, generado %s; p50 %s m · p95 %s m contra %s cotas medidas)"
                       % (R.get('generado'), str(R['calidad'].get('p50_m')).replace('.', ','), str(R['calidad'].get('p95_m')).replace('.', ','),
                          '{:,}'.format(R['calidad'].get('n_cotas', 0)).replace(',', '.')),
            "layout": "cobertura-zigbee/ayora_layout.json (%d seguidores)" % len(t),
            "muestreo": "malla %d×%d a %.0f×%.0f m, bilineal sobre la malla de %s m; cotas en dm sobre %.1f m" % (NX, NN, dx, dn, paso, zmin),
            "generado": datetime.date.today().isoformat(),
            "herramienta": "tools/hero_ayora.py",
        },
        "z": [round((v - zmin) * 10) for v in grid],
        "filas": filas,
    }
    sys.stdout.write(json.dumps(out, separators=(',', ':'), ensure_ascii=False))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '../cobertura-zigbee')
