#!/usr/bin/env python3
"""Genera HUELLAS, el plano en miniatura de cada planta para sus tarjetas en la portada.

Cada planta de PLANTS (index.html) enseña su plano REAL de seguidores, con la
MISMA geometría que el Layout 2D de cobertura-zigbee (plano.html: calcTDIM y
cotasSeg), para no inventar nada:

  · largo de cada seguidor: `mesa.tipos[blk].largo` si el DWG está medido; si
    no, la fórmula del modelo (2 alas de N módulos con N-1 huecos + hueco de
    motor) con `mods`/`modW`/`filaZ` del layout, y `mr` o «medio» como razón;
  · BÍFILA: dos bandas a ±filaZ del eje (Bagnarelli 2,75, Túnez 3,125, El Burgo
    3,0…) cuando a la escala de la caja se distinguen (≥ 1,2 unidades); si no,
    un solo trazo del ancho de la mesa. filaZ = 0 (Páramo, Dicayagua) es una
    sola fila;
  · RUMBO: `rot` es el rumbo del eje en grados al este del norte de cuadrícula
    (Bagnarelli 23,7; Dicayagua 90 = mesas fijas este-oeste). Se gira cada
    seguidor sobre su centro; con rot 0 el eje es norte-sur;
  · caja de 160×100 a escala, norte arriba.

Los seguidores con rot 0, de una banda, alineados en la misma x y con hueco
menor de 6 m se funden en un trazo (San José, Ayora…) para no inflar el HTML.

  python3 tools/huellas_plantas.py ../cobertura-zigbee > /tmp/huellas.json
  # y pegar en index.html:  const HUELLAS=<json>;
"""
import json, math, re, sys, datetime

PLANTAS = {  # nombre en PLANTS → slug del layout
    "El Burgo I": "elburgo", "Fayón": "fayon", "San José": "sanjose", "Túnez": "tunez", "Ayora": "ayora",
    "Bagnarelli": "bagnarelli", "Benante": "benante", "Panbianco": "panbianco", "Páramo": "paramo",
    "El Polvorín": "polvorin", "El Naranjo Dicayagua": "dicayagua", "Catania": "catania",
}
# módulos por ALA cuando el layout no lo dice (igual que TMODS de plano.html) y cotas medidas que
# mandan sobre el modelo (TMEAS)
TMODS = {"elburgo": 28, "ayora": 28, "sanjose": 32, "fayon": 24, "bagnarelli": 21, "paramo": 24}
TMEAS = {"fayon": {"halfL": 27.58, "filaZ": 3.006, "cuerda": 2.413}}

def calc_tdim(L, slug):
    """Copia de calcTDIM() de plano.html."""
    mesa = L.get('mesa')
    if mesa and mesa.get('tipos'):
        largos = [z['largo'] for z in mesa['tipos'].values()]
        d = {"halfL": max(largos) / 2, "filaZ": mesa.get('filaZ', 3.0), "cuerda": mesa.get('modH', 2.382)}
    elif mesa:
        mods = L.get('mods') or 28
        d = {"halfL": (2 * (mods * mesa['modW'] + (mods - 1) * mesa.get('gapMod', 0.012)) + mesa.get('gapDrive', 0.55)) / 2,
             "filaZ": mesa.get('filaZ', 3.0), "cuerda": mesa.get('modH', 2.382)}
    else:
        modW = L.get('modW') or 1.134; mods = L.get('mods') or TMODS.get(slug, 28); g = 0.012
        d = {"halfL": (2 * (mods * modW + (mods - 1) * g) + 0.55) / 2,
             "filaZ": L['filaZ'] if L.get('filaZ') is not None else 3.0, "cuerda": 2.382}
        d.update(TMEAS.get(slug, {}))
    return d

def cotas_seg(L, t, TD):
    """Copia de cotasSeg() de plano.html: envolvente de un seguidor a lo largo de su eje."""
    tipos = (L.get('mesa') or {}).get('tipos') or {}
    z = tipos.get(t.get('blk')) if t.get('blk') else None
    if z:
        half = z['largo'] / 2
        return (z.get('desde', -half), z.get('hasta', half), z)
    mr = t.get('mr')
    medio = bool(re.match(r'^medio', t.get('t') or '', re.I))
    h = TD['halfL'] * mr if isinstance(mr, (int, float)) and 0 < mr < 1 else (TD['halfL'] * 0.504 if medio else TD['halfL'])
    return (-h, h, None)

def huella(L, slug):
    TD = calc_tdim(L, slug); t = L['trackers']
    # encuadre por los centros y el largo máximo
    xs = [a['x'] for a in t]; ns = [a['n'] for a in t]
    x0, x1, n0, n1 = min(xs) - TD['halfL'], max(xs) + TD['halfL'], min(ns) - TD['halfL'], max(ns) + TD['halfL']
    W = x1 - x0 or 1; H = n1 - n0 or 1
    s = min(150 / W, 92 / H); ox = (160 - W * s) / 2; oy = (100 - H * s) / 2
    X = lambda x: round(ox + (x - x0) * s, 1); Y = lambda n: round(100 - (oy + (n - n0) * s), 1)
    bif_visible = 2 * TD['filaZ'] * s >= 1.2 and TD['filaZ'] > 0.05
    segs = []       # (x, n0, n1) para fundir filas (rot 0, una banda)
    paths = []      # trazos sueltos (girados o bífilas)
    for a in t:
        d0, d1, z = cotas_seg(L, a, TD)
        rot = float(a.get('rot') or 0)
        mono = bool(z and (z.get('mono') or (z.get('ancho') and z['ancho'] < 2 * TD['filaZ'])))
        bandas = [-TD['filaZ'], TD['filaZ']] if (bif_visible and not mono) else [0.0]
        if rot == 0 and len(bandas) == 1:
            segs.append(('v', round(a['x']), a['n'] + d0, a['n'] + d1)); continue
        if rot == 90 and len(bandas) == 1:   # mesas este-oeste (Dicayagua): se funden a lo largo de x
            segs.append(('h', round(a['n']), a['x'] + d0, a['x'] + d1)); continue
        r = math.radians(rot); ux, un = math.sin(r), math.cos(r)      # eje: rumbo al este del norte
        px, pn = math.cos(r), -math.sin(r)                             # perpendicular
        for off in bandas:
            cx, cn = a['x'] + px * off, a['n'] + pn * off
            paths.append('M%g %gL%g %g' % (X(cx + ux * d0), Y(cn + un * d0), X(cx + ux * d1), Y(cn + un * d1)))
    segs.sort(); filas = []
    for o, k, a0, a1 in segs:
        if filas and filas[-1][0] == o and filas[-1][1] == k and a0 - filas[-1][3] < 6: filas[-1][3] = max(filas[-1][3], a1)
        else: filas.append([o, k, a0, a1])
    d = ''.join(('M%g %gV%g' % (X(k), Y(a0), Y(a1))) if o == 'v' else ('M%g %gH%g' % (X(a0), Y(k), X(a1))) for o, k, a0, a1 in filas) + ''.join(paths)
    ancho = (TD['cuerda'] if bif_visible or TD['filaZ'] <= 0.05 else 2 * TD['filaZ'] + TD['cuerda'])
    sw = max(0.7, min(2.4, ancho * s))
    return {"n": len(t), "d": d, "sw": round(sw, 2), "ancho_m": round(W), "alto_m": round(H),
            "bifila": bool(TD['filaZ'] > 0.05), "bifila_visible": bif_visible, "rot": sorted({float(a.get('rot') or 0) for a in t}),
            "halfL": round(TD['halfL'], 2), "filaZ": TD['filaZ']}

def main(raiz):
    out = {"_fuente": {"layouts": "cobertura-zigbee/<planta>_layout.json", "herramienta": "tools/huellas_plantas.py",
                       "generado": datetime.date.today().isoformat(),
                       "nota": "misma geometría que plano.html (calcTDIM/cotasSeg): largo por tipo de mesa o por el modelo, bífila a ±filaZ cuando se distingue a escala, rumbo `rot` al este del norte; caja 160×100 a escala, norte arriba"}}
    for nombre, slug in PLANTAS.items():
        out[nombre] = huella(json.load(open(f'{raiz}/{slug}_layout.json')), slug)
    sys.stdout.write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '../cobertura-zigbee')
