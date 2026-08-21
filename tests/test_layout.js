// Careo de la ficha «Generador de layout» contra el core Python — SIN navegador.
//
// La ficha genera la implantación en el navegador para poder abrirse sin
// levantar nada, y eso abre la puerta a la segunda verdad: dos motores que dicen
// cosas distintas sobre la misma parcela y nadie mirando. Esto la cierra.
//
// Cómo: extrae el bloque «MOTOR DE LAYOUT» del generador-layout.html REAL —no una
// copia en un .js de test, que se quedaría careando una versión vieja mientras la
// ficha evoluciona— y lo corre sobre las MISMAS parcelas y parámetros que corrió
// `solargpt_core.layout_v2.compute_layout_v2` (tests/careo-layout.json, generado
// por gen_careo_layout.py).
//
// Qué se exige, y por qué eso y no la igualdad:
//   · el nº de FILAS, idéntico            → es la geometría del campo: pitch,
//                                            setback y orientación en un número
//   · las MESAS, dentro del 2,5 %         → el core lleva refinamientos de borde
//                                            que aquí no están portados (relleno
//                                            por columna, edge-fill, consolidación)
//   · los kWp, dentro del 2,5 %           → se derivan de las mesas
//   · el ÁREA ÚTIL, dentro del 0,5 %      → el setback como erosión exacta contra
//                                            el buffer(-d) de Shapely; el 0,5 %
//                                            es la discretización del barrido
//   · la geometría de la mesa, EXACTA     → largo, apertura, fila y GCR no admiten
//                                            tolerancia: son fórmulas cerradas
//   · UTM contra pyproj, < 1 mm           → las series clásicas frente al patrón
//
// Y tres mutantes: si el setback deja de morder, si la banda de erosión se
// escribe sin el término del vértice, o si el GCR se calcula sobre el pitch
// equivocado, el careo tiene que ponerse rojo.
//
//   node tests/test_layout.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

// ── 1) extraer el motor del HTML de verdad ──
const html = fs.readFileSync(path.join(RAIZ, 'generador-layout.html'), 'utf8');
// El marcador de inicio abre un comentario largo (el que explica qué está portado
// y qué no): el código empieza en el PRIMER `*/` posterior.
const m = html.match(/MOTOR DE LAYOUT — inicio[\s\S]*?\*\/([\s\S]*?)\/\* ═+ MOTOR DE LAYOUT — fin/);
check('el bloque MOTOR DE LAYOUT está delimitado en el HTML', !!m);
if (!m) { console.log('\nFALLOS: 1'); process.exit(1); }
const ctx = { console, module: { exports: {} }, performance: { now: () => 0 } };
vm.createContext(ctx);
try { vm.runInContext(m[1], ctx); } catch (e) { check('el motor compila en Node', false, e.message); }
const LAY = ctx.LAY;
check('el motor compila y exporta LAY', !!(LAY && LAY.compute));
if (!LAY) { console.log('\nFALLOS: ' + ko); process.exit(1); }

// ── 2) UTM contra pyproj ──
const fix = JSON.parse(fs.readFileSync(path.join(__dirname, 'careo-layout.json'), 'utf8'));
for (const p of fix.utm_ref) {
  const zona = LAY.utmZone(p.lon), sur = p.lat < 0;
  check('EPSG de ' + p.lon + ',' + p.lat, LAY.utmEpsg(p.lon, p.lat) === p.epsg,
    LAY.utmEpsg(p.lon, p.lat) + ' vs ' + p.epsg);
  const q = LAY.utmFwd(p.lon, p.lat, zona, sur);
  const d = Math.hypot(q[0] - p.x, q[1] - p.y);
  check('UTM directa en ' + p.lon.toFixed(3) + ',' + p.lat.toFixed(3) + ' (' + (d * 1000).toFixed(3) + ' mm)',
    d < 0.001, d.toFixed(6) + ' m');
  const b = LAY.utmInv(q[0], q[1], zona, sur);
  const dm = Math.hypot((b[0] - p.lon) * 111320 * Math.cos(p.lat * Math.PI / 180), (b[1] - p.lat) * 110540);
  check('UTM inversa cierra el viaje en ' + p.lon.toFixed(3) + ',' + p.lat.toFixed(3), dm < 0.001, dm.toFixed(6) + ' m');
}

// ── 3) correr el motor del navegador sobre las MISMAS parcelas ──
const M_LON = 111320 * Math.cos(fix.lat * Math.PI / 180), M_LAT = 110540;
const aLonLat = pts => pts.map(p => [fix.lon + p[0] / M_LON, fix.lat + p[1] / M_LAT]);

function correr(caso, over) {
  const g = Object.assign({}, caso.cfg, over || {});
  return LAY.compute({
    coords: caso.poly_lonlat ? caso.poly_lonlat : aLonLat(caso.poly),
    holes: caso.poly_lonlat ? (caso.holes_lonlat || []) : (caso.holes || []).map(aLonLat),
    exclusions: caso.excl_lonlat || [],
    mount: g.mount_type === 'fija' ? 'fija' : 'tracker',
    table: g.table_type,
    mods: Array.isArray(g.mods_per_struct) ? g.mods_per_struct : [g.mods_per_struct],
    modLen: g.mod_len, modWid: g.mod_wid, moduleWp: fix.module_wp,
    pitch: g.pitch_m, setback: g.setback_m, panelAz: g.panel_az_deg,
    bifila: g.bifila,
    gapModules: g.gap_modules,
    gapMotor: g.mount_type === 'fija' ? g.gap_modules : g.gap_motor,
    gapNs: g.mount_type === 'fija' ? g.gap_modules : g.gap_ns,
    roadEvery: g.road_every, roadW: g.road_w,
    roadNsEvery: g.road_ns_every, roadNsW: g.road_ns_w,
    mode: g.layout_mode, minStructs: g.min_structs_per_row,
    rowOffset: 'none', alignGrid: g.align_to_grid, center: true
  });
}
const dpct = (a, b) => (b ? Math.abs(100 * (a - b) / b) : (a ? Infinity : 0));
// Los casos se buscan por NOMBRE, no por índice: insertar un caso nuevo en el
// fixture desplazaba los índices fijos y las comprobaciones cruzadas pasaban a
// comparar cosas distintas sin decirlo.
const caso = frag => {
  const i = fix.casos.findIndex(c => c.nombre.indexOf(frag) >= 0);
  if (i < 0) throw new Error('no hay caso «' + frag + '» en el fixture');
  return i;
};

const js = [];
for (const caso of fix.casos) {
  const r = correr(caso), s = r.stats, k = caso.core, n = caso.nombre;
  js.push(r);
  // Con exclusiones el core barre el origen Y (11 offsets simétricos) y se queda
  // con el que más coloca; ese barrido NO está portado, así que la fila de
  // arranque puede diferir en una. Sin exclusiones la cuenta tiene que cuadrar.
  // Con exclusiones/agujeros los DOS lados barren el origen X/Y (el port del
  // sweep entró el 2026-08-21), pero la puntuación puede elegir offsets
  // distintos por décimas y mover la fila de arranque: ±1 sigue siendo
  // legítimo AHÍ — sin exclusiones no hay barrido y la cuenta debe cuadrar.
  const tolFilas = ((caso.holes && caso.holes.length) ||
                    (caso.holes_lonlat && caso.holes_lonlat.length) ||
                    (caso.excl_lonlat && caso.excl_lonlat.length)) ? 1 : 0;
  check(n + ' · filas', Math.abs(s.rows - k.rows) <= tolFilas, s.rows + ' vs ' + k.rows);
  const tolM = caso.tol_mesas_pct || 2.5;
  check(n + ' · mesas dentro del ' + tolM + ' % (' + s.structures + ' vs ' + k.structures + ', ' +
        dpct(s.structures, k.structures).toFixed(2) + ' %)', dpct(s.structures, k.structures) <= tolM);
  check(n + ' · kWp dentro del ' + tolM + ' % (' + dpct(s.kWp, k.kWp).toFixed(2) + ' %)', dpct(s.kWp, k.kWp) <= tolM);
  check(n + ' · área útil dentro del 0,5 % (' + dpct(s.inner_area_m2, k.inner_area_m2).toFixed(3) + ' %)',
        dpct(s.inner_area_m2, k.inner_area_m2) <= 0.5);
  check(n + ' · área de parcela dentro del 0,2 %', dpct(s.poly_area_m2, k.poly_area_m2) <= 0.2,
        s.poly_area_m2.toFixed(1) + ' vs ' + k.poly_area_m2.toFixed(1));
  check(n + ' · largo de mesa exacto', dpct(s.mesa_len_m, k.mesa_len_m) < 0.01,
        s.mesa_len_m + ' vs ' + k.mesa_len_m);
  check(n + ' · apertura del colector exacta', dpct(s.collector_h_m, k.collector_h_m) < 0.01,
        s.collector_h_m + ' vs ' + k.collector_h_m);
  // En tracker el GCR es fórmula cerrada (apertura/pitch) y no admite tolerancia.
  // En montaje FIJO el core lo define por ÁREA (colector/útil), así que arrastra
  // la misma diferencia que el conteo de mesas: se le exige lo mismo que a ellas.
  const tolGcr = (k.fila_len_m ? 0.5 : tolM);
  check(n + ' · GCR ' + (k.fila_len_m ? 'exacto' : 'por área, dentro del ' + tolM + ' %'),
        dpct(s.GCR, k.GCR) < tolGcr, s.GCR.toFixed(4) + ' vs ' + k.GCR.toFixed(4));
  if (k.fila_len_m) check(n + ' · largo de fila (2 mesas + motor) exacto',
    dpct(s.fila_len_m, k.fila_len_m) < 0.01, s.fila_len_m + ' vs ' + k.fila_len_m);
}

// ── 4) señales de que la geometría está viva ──
const caso0 = fix.casos[caso('tracker bifila 1V/28')];
const sinSetback = correr(caso0, { setback_m: 0 });
check('el setback MUERDE: sin él el área útil sube',
  sinSetback.stats.inner_area_m2 > js[caso('tracker bifila 1V/28')].stats.inner_area_m2 * 1.02,
  sinSetback.stats.inner_area_m2.toFixed(0) + ' vs ' + js[caso('tracker bifila 1V/28')].stats.inner_area_m2.toFixed(0));
check('sin setback el área útil es la de la parcela (< 0,5 %)',
  dpct(sinSetback.stats.inner_area_m2, sinSetback.stats.poly_area_m2) < 0.5);
const setbackGrande = correr(caso0, { setback_m: 40 });
check('un setback de 40 m quita mesas',
  setbackGrande.stats.structures < js[caso('tracker bifila 1V/28')].stats.structures);

// La erosión, contra su definición: un cuadrado de 100×100 erosionado 5 m mide
// 90×90. Es lo que un `buffer(-5)` de Shapely devuelve, y lo que caza el mutante
// de la banda escrita sin el término del vértice (que no erosiona nada).
const cuadrado = [[0, 0], [100, 0], [100, 50], [0, 50]];
const banda = LAY.bandAt([cuadrado], 25, 5);
check('la banda de erosión cubre los DOS lados verticales, no solo el del origen',
  banda.length === 2 && Math.abs(banda[1][0] - 95) < 1e-6 && Math.abs(banda[1][1] - 105) < 1e-6,
  JSON.stringify(banda));
const dentro = LAY.ivSub(LAY.insideAt([cuadrado], 25), banda);
check('erosión de 5 m sobre un lado de 100 m deja 90 m',
  dentro.length === 1 && Math.abs((dentro[0][1] - dentro[0][0]) - 90) < 1e-6,
  JSON.stringify(dentro));
// Mutante: la banda sin el término del vértice (lo que había antes del fix)
const bandaMutante = LAY.ivNorm([[-5, 5]]);
check('MUTANTE: con la banda incompleta la erosión NO cierra (el careo se pone rojo)',
  Math.abs((LAY.ivSub(LAY.insideAt([cuadrado], 25), bandaMutante)[0][1]
          - LAY.ivSub(LAY.insideAt([cuadrado], 25), bandaMutante)[0][0]) - 90) > 1);

// GCR de tracker = apertura / pitch, y el mutante que lo calcula sobre otro pitch
const gcrCaso = js[caso('tracker bifila 1V/28')].stats;
check('GCR de tracker = apertura / pitch',
  Math.abs(gcrCaso.GCR - gcrCaso.collector_h_m / gcrCaso.pitch_m) < 1e-9);
check('MUTANTE: GCR sobre el pitch equivocado se sale de tolerancia',
  dpct(gcrCaso.collector_h_m / (gcrCaso.pitch_m + 1), caso0.core.GCR) > 0.5);

// Bifila: si es bifila, es bifila — conteo PAR de mesas por línea
const bif = js[caso('tracker bifila 1V/28')];
check('bifila: toda línea tiene un número PAR de mesas',
  bif.rows.every(r => r.length % 2 === 0), bif.rows.map(r => r.length).filter(n => n % 2).join(','));
check('bifila: las sub-filas A y B quedan alineadas en X (Δx ≈ 0)',
  bif.stats.ab_max_dx_m < 0.01, String(bif.stats.ab_max_dx_m));

// Montaje fijo: bifila se ignora y se DICE
const fija = correr(fix.casos[caso('fija 2V/20')], { bifila: true });
check('en montaje fijo bifila se ignora', fija.stats.bifila === false);
check('y se dice en pantalla (aviso)',
  fija.avisos.some(a => a.codigo === 'bifila_ignorada_en_fija'));

// Multi-talla: aparecen tallas menores rellenando la cola
const multi = js[caso('multi-talla 28/14/7')].stats;
check('multi-talla: el reparto usa más de una talla',
  Object.keys(multi.by_size || {}).length > 1, JSON.stringify(multi.by_size));
check('multi-talla coloca más módulos que la talla única',
  multi.modules > js[caso('tracker monofila')].stats.modules,
  multi.modules + ' vs ' + js[caso('tracker monofila')].stats.modules);

// El hueco quita mesas donde está
const conHueco = js[caso('hueco central')].stats, sinHueco = js[caso('tracker monofila')].stats;
check('un hueco en la parcela quita mesas', conHueco.structures < sinHueco.structures,
  conHueco.structures + ' vs ' + sinHueco.structures);

// Vial: el mismo campo con vial cada 5 filas tiene MENOS filas
check('el vial E-O se come filas',
  js[caso('vial E-O')].stats.rows < js[caso('tracker monofila')].stats.rows,
  js[caso('vial E-O')].stats.rows + ' vs ' + js[caso('tracker monofila')].stats.rows);

// Pitch por debajo de la apertura: el motor lo canta, no lo calla
const pitchMalo = correr(caso0, { pitch_m: 1.5 });
check('un pitch menor que la apertura sale como FALLO en los avisos',
  pitchMalo.avisos.some(a => a.codigo === 'pitch_menor_que_apertura' && a.severidad === 'fail'));

// Los viales repartidos simétricamente (port de _centered_road_positions)
check('viales centrados: total=6 cada 5 → [3]', JSON.stringify(LAY.centeredRoadPositions(6, 5)) === '[3]');
check('viales centrados: total=11 cada 5 → [4,7]', JSON.stringify(LAY.centeredRoadPositions(11, 5)) === '[4,7]');
check('viales centrados: total=16 cada 5 → [4,8,12]', JSON.stringify(LAY.centeredRoadPositions(16, 5)) === '[4,8,12]');

// GeoJSON: una feature por mesa, anillo cerrado
const gj = LAY.toGeoJSON(js[caso('tracker bifila 1V/28')]);
check('el GeoJSON trae una feature por mesa (más los viales)',
  gj.features.filter(f => f.properties.tipo === 'mesa').length === js[0].stats.structures);
check('los anillos del GeoJSON están cerrados',
  gj.features.every(f => {
    const r = f.geometry.coordinates[0];
    return r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
  }));

// La parcela REAL vigila desde dentro: si alguien borra la semilla de
// tests/parcelas/ (o el generador deja de leerla), esto se pone rojo y el careo
// vuelve a ser un banco de rectángulos de laboratorio — que es como se escapó
// lo de bifila la primera vez.
check('el fixture incluye al menos una PARCELA REAL de tests/parcelas/',
  fix.casos.some(c => c.nombre.indexOf('PARCELA REAL') === 0));
// …y el directorio semilla EXISTE con al menos un .geojson: el check de arriba
// mira el fixture comiteado, así que borrar la semilla lo dejaba en verde
// mientras la próxima regeneración perdía la finca en silencio.
check('y tests/parcelas/ conserva su semilla (.geojson)',
  (() => { try {
    return fs.readdirSync(path.join(__dirname, 'parcelas'))
             .filter(f => /\.geojson$/.test(f)).length >= 1;
  } catch (e) { return false; } })());

// CONSOLIDACIÓN, la lección que costó aprender dos veces: «dos medios seguidos
// es mejor UNO entero». En TODOS los casos multi-talla se exige que no queden
// dos trackers ADYACENTES de la misma talla cuando la talla doble existe
// Y CABRÍA: el motor solo funde cuando el doble pasa la re-comprobación
// (huecos/exclusiones de la fila, banda de la sub-fila B, viales), así que el
// detector la reproduce — sin ella, una finca legítima con una acequia
// estrecha entre dos trackers ponía el careo en rojo sin defecto del motor
// (repro de la verificación adversarial: 60×200 con dos ranuras de 0,55 m →
// 9 falsos «malos», los nueve con el doble cruzando la ranura).
// COBERTURA DEL INVARIANTE, medida con mutantes (no supuesta): la propiedad
// la garantizan DOS mecanismos redundantes — el greedy largest-first (con
// catálogo doblante, el 2m siempre se prueba antes que dos m) y la
// consolidación. Por eso los mutantes SUELTOS quedan verdes (el otro
// mecanismo cubre: greedy invertido a secas → consolidaFila funde y el campo
// sale bien) y el mutante DOBLE (greedy invertido + consolidación fuera)
// pone ROJOS los seis casos multi con miles de adyacencias. El check vigila
// la SALIDA, no el mecanismo — que es lo que el cliente ve en planta.
const rectCortaPoly = (x0, y0, x1, y1, poly) => {
  // ¿el rectángulo [x0,y0]-[x1,y1] toca el polígono? (vértice dentro del
  // rect, esquina del rect dentro del polígono, o cruce de aristas)
  const dentroPoly = (px, py) => {
    let c = false;
    for (let u = 0, v = poly.length - 1; u < poly.length; v = u++) {
      const [ax, ay] = poly[u], [bx, by] = poly[v];
      if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) c = !c;
    }
    return c;
  };
  for (const [px, py] of poly)
    if (px >= x0 && px <= x1 && py >= y0 && py <= y1) return true;
  for (const [px, py] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    if (dentroPoly(px, py)) return true;
  const seg = (p1, p2, p3, p4) => {
    const d = (a, b, cpt) => (b[0] - a[0]) * (cpt[1] - a[1]) - (b[1] - a[1]) * (cpt[0] - a[0]);
    const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  };
  const esq = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let u = 0, v = poly.length - 1; u < poly.length; v = u++)
    for (let e = 0; e < 4; e++)
      if (seg(poly[u], poly[v], esq[e], esq[(e + 1) % 4])) return true;
  return false;
};
fix.casos.forEach((c, i) => {
  const mps = c.cfg.mods_per_struct;
  if (!Array.isArray(mps) || mps.length < 2) return;
  const r = js[i];
  const gm = (c.cfg.gap_motor || 0.5) + 0.15, gn = (c.cfg.gap_ns || 0.5) + 0.2;
  // Obstáculos en el marco LOCAL del motor (el mismo de las mesas): huecos,
  // exclusiones y viales — lo mismo que consulta consolidaFila al re-comprobar.
  const aLocal = ll => r.toLocal(r.toUtm(ll));
  const obst = (c.poly_lonlat ? (c.holes_lonlat || []) : (c.holes || []).map(aLonLat))
    .concat(c.excl_lonlat || [])
    .map(ring => ring.map(aLocal))
    .concat((r.roads || []).map(rd => rd.utm.map(pt => r.toLocal(pt))));
  const FIT = 0.05;                                   // la holgura del motor
  let malos = 0;
  for (let fi = 0; fi < r.rows.length; fi++) {
    const fila = r.rows[fi];
    const so = fila.slice().sort((a, b) => a.x0 - b.x0);
    const gr = []; let cur = [];
    for (const t of so) {
      if (cur.length && cur.length < 2 && t.x0 - cur[cur.length - 1].x1 <= gm) cur.push(t);
      else { if (cur.length) gr.push(cur); cur = [t]; }
    }
    if (cur.length) gr.push(cur);
    // Bandas donde el doble tiene que caber: la de esta fila y, en bifila, la
    // de su gemela (las filas van en pares A/B consecutivos).
    const bandaDe = f => {
      let y0 = Infinity, y1 = -Infinity;
      for (const t of f) { if (t.y0 < y0) y0 = t.y0; if (t.y1 > y1) y1 = t.y1; }
      return [y0, y1];
    };
    const bandas = [bandaDe(fila)];
    if (c.cfg.bifila) {
      const par = (fi % 2 === 0) ? fi + 1 : fi - 1;
      if (r.rows[par] && r.rows[par].length) bandas.push(bandaDe(r.rows[par]));
    }
    for (let k = 0; k + 1 < gr.length; k++) {
      const a = gr[k], b = gr[k + 1];
      if (!(a.length === 2 && b.length === 2 && a[0].mods === b[0].mods &&
            mps.includes(2 * a[0].mods) && b[0].x0 - a[1].x1 <= gn)) continue;
      const cabria = bandas.every(bd => obst.every(o =>
        !rectCortaPoly(a[0].x0 + FIT, bd[0] + FIT, b[1].x1 - FIT, bd[1] - FIT, o)));
      if (cabria) malos++;
    }
  }
  check(c.nombre + ' · nunca dos trackers de la misma talla seguidos cuando el doble CABE',
    malos === 0, malos + ' adyacencias fundibles sin fundir');
});

// LA FINCA DE LARRAGA («deja mil huecos donde entran trackers», 2026-08-21):
// el ancla GLOBAL de la rejilla — canónica — pierde una unidad por linde
// diagonal en cada fila. Tres medidas sobre los datos:
//  1) el motor AVISA del déficit (rejilla_deja_hueco) en vez de callar;
//  2) sin «alinear a rejilla», cada fila ancla en su linde y el campo gana
//     ≥30 % de mesas manteniendo el Δx=0 del par bifila;
//  3) la mejora respeta la unidad atómica (fila completa): conteo par.
{
  const i = caso('Larraga');
  const c = fix.casos[i], r = js[i];
  // La semilla de Larraga se conserva SUCIA a propósito (el lazo de 0,9 m del
  // cierre del dibujo, el que Streamlit avisó): el motor tiene que REPARARLA
  // —partir en el punto de cruce, como make_valid— y DECIRLO. Quitar un
  // vértice «a ojo» reparaba con otro anillo y movía el barrido 4 mesas.
  // «pongo adaptativo y me sale exactamente igual»: con la rejilla global
  // puesta, adaptive ancla en la misma rejilla — mismo resultado que aligned,
  // y el motor lo DICE en vez de dejar el selector como un placebo.
  {
    const adaptCon = correr(c, { layout_mode: 'adaptive' });
    check('Larraga · adaptive con rejilla = aligned (y el motor lo AVISA)',
      adaptCon.stats.structures === r.stats.structures &&
      (adaptCon.avisos || []).some(a => a.codigo === 'adaptive_con_rejilla'));
    const adaptSin = correr(c, { layout_mode: 'adaptive', align_to_grid: false });
    check('Larraga · adaptive SIN rejilla sí se despega (y sin aviso)',
      adaptSin.stats.structures > r.stats.structures &&
      !(adaptSin.avisos || []).some(a => a.codigo === 'adaptive_con_rejilla'));
  }
  check('Larraga · el anillo sucio se repara AVISANDO (parcela_se_cruzaba)',
    (r.avisos || []).some(a => a.codigo === 'parcela_se_cruzaba'));
  check('Larraga · y los casos limpios NO llevan ese aviso',
    !(js[caso('rect girado 35° · BIFILA')].avisos || [])
      .some(a => a.codigo && a.codigo.indexOf('parcela_se_cruz') === 0));
  check('Larraga · con el barrido X/Y portado, las mesas salen CLAVADAS al core (' +
        r.stats.structures + ' = ' + c.core.structures + ')',
    r.stats.structures === c.core.structures &&
    r.stats.y_offset_optimized === true);
  check('Larraga · el ancla global AVISA del hueco que deja (rejilla_deja_hueco)',
    (r.avisos || []).some(a => a.codigo === 'rejilla_deja_hueco'),
    JSON.stringify((r.avisos || []).map(a => a.codigo)));
  const sinRejilla = correr(c, { align_to_grid: false });
  const s2 = sinRejilla.stats;
  check('Larraga · sin rejilla global: cada fila ancla en su linde y gana ≥30 % (' +
        r.stats.structures + ' → ' + s2.structures + ')',
    s2.structures >= Math.ceil(r.stats.structures * 1.30));
  check('Larraga · la mejora sigue siendo BIFILA de verdad: Δx = 0 y conteo par',
    s2.bifila === true && s2.ab_max_dx_m < 0.01 &&
    sinRejilla.rows.every(f => f.length % 2 === 0));
  check('Larraga · y sin rejilla el aviso de hueco NO sale (ya no lo hay)',
    !(sinRejilla.avisos || []).some(a => a.codigo === 'rejilla_deja_hueco'));
}

// El invariante que costó arreglar en el cuaderno, medido en TODOS los casos
// bifila del fixture: cada línea con conteo par y las sub-filas A/B con las
// MISMAS X. Si la B vuelve a colocarse por su cuenta, esto se pone rojo.
fix.casos.forEach((c, i) => {
  if (!c.cfg.bifila) return;
  const r = js[i];
  let malos = 0, dxmax = 0, pares = 0;
  for (let k = 0; k + 1 < r.rows.length; k += 2) {
    const A = r.rows[k], B = r.rows[k + 1]; pares++;
    if (A.length !== B.length) { malos++; continue; }
    const xa = A.map(t => (t.x0 + t.x1) / 2).sort((p, q) => p - q);
    const xb = B.map(t => (t.x0 + t.x1) / 2).sort((p, q) => p - q);
    for (let z = 0; z < xa.length; z++) dxmax = Math.max(dxmax, Math.abs(xa[z] - xb[z]));
  }
  check(c.nombre + ' · si es bifila, ES bifila (' + pares + ' pares, Δx ' + dxmax.toFixed(4) + ' m)',
    malos === 0 && dxmax < 1e-9 && r.rows.every(f => f.length % 2 === 0));
});

console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
process.exit(ko ? 1 : 0);
