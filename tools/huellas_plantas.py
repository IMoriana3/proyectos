#!/usr/bin/env python3
"""Genera HUELLAS, el plano en miniatura de cada planta para sus tarjetas en la portada.

Cada planta de PLANTS (index.html) enseña su plano REAL de seguidores: cada
seguidor es un segmento N-S con su longitud (módulos × 1,15 m; sin dato, la
mediana de la planta o 32 m), y los seguidores alineados en la misma fila con
hueco menor de 6 m se funden en un solo trazo. Las coordenadas se llevan a una
caja de 160×100 manteniendo la proporción, con el norte arriba. No se inventa
nada: lo que no está en el layout no se dibuja.

Fuente: cobertura-zigbee/<planta>_layout.json. El diccionario de abajo liga el
NOMBRE de la planta en PLANTS con el fichero.

  python3 tools/huellas_plantas.py ../cobertura-zigbee > /tmp/huellas.json
  # y pegar en index.html:  const HUELLAS=<json>;
"""
import json, sys, datetime

PLANTAS = {  # nombre en PLANTS → slug del layout
    "El Burgo I": "elburgo", "Fayón": "fayon", "San José": "sanjose", "Túnez": "tunez", "Ayora": "ayora",
    "Bagnarelli": "bagnarelli", "Benante": "benante", "Panbianco": "panbianco", "Páramo": "paramo",
    "El Polvorín": "polvorin", "El Naranjo Dicayagua": "dicayagua", "Catania": "catania",
}

def huella(layout):
    t = layout['trackers']
    ls = [a['mods'] * 1.15 for a in t if a.get('mods')]
    L0 = sorted(ls)[len(ls) // 2] if ls else 32.0
    segs = sorted((round(a['x']), a['n'] - (a['mods'] * 1.15 if a.get('mods') else L0) / 2,
                   a['n'] + (a['mods'] * 1.15 if a.get('mods') else L0) / 2) for a in t)
    filas = []
    for x, n0, n1 in segs:
        if filas and filas[-1][0] == x and n0 - filas[-1][2] < 6: filas[-1][2] = max(filas[-1][2], n1)
        else: filas.append([x, n0, n1])
    xs = [f[0] for f in filas]; ns = [f[1] for f in filas] + [f[2] for f in filas]
    x0, x1, n0, n1 = min(xs), max(xs), min(ns), max(ns); W = x1 - x0 or 1; H = n1 - n0 or 1
    s = min(150 / W, 92 / H); ox = (160 - W * s) / 2; oy = (100 - H * s) / 2
    d = ''.join('M%g %gV%g' % (round(ox + (x - x0) * s, 1), round(100 - (oy + (a - n0) * s), 1), round(100 - (oy + (b - n0) * s), 1)) for x, a, b in filas)
    return {"n": len(t), "filas": len(filas), "d": d, "sw": round(max(0.7, min(2.4, s * 5.5)), 2),
            "ancho_m": round(W), "alto_m": round(H)}

def main(raiz):
    out = {"_fuente": {"layouts": "cobertura-zigbee/<planta>_layout.json", "herramienta": "tools/huellas_plantas.py",
                       "generado": datetime.date.today().isoformat(),
                       "nota": "cada seguidor es un segmento N-S de módulos×1,15 m; filas alineadas con hueco < 6 m fundidas; caja 160×100 a escala, norte arriba"}}
    for nombre, slug in PLANTAS.items():
        out[nombre] = huella(json.load(open(f'{raiz}/{slug}_layout.json')))
    sys.stdout.write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '../cobertura-zigbee')
