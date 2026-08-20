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
    coords: aLonLat(caso.poly),
    holes: (caso.holes || []).map(aLonLat),
    exclusions: [],
    mount: g.mount_type === 'fija' ? 'fija' : 'tracker',
    table: g.table_type,
    mods: Array.isArray(g.mods_per_struct) ? g.mods_per_struct : [g.mods_per_struct],
    modLen: g.mod_len, modWid: g.mod_wid, moduleWp: fix.module_wp,
    pitch: g.pitch_m, setback: g.setback_m, panelAz: g.panel_az_deg,
    bifila: g.bifila, gapModules: g.gap_modules, gapMotor: g.gap_motor, gapNs: g.gap_ns,
    roadEvery: g.road_every, roadW: g.road_w,
    roadNsEvery: g.road_ns_every, roadNsW: g.road_ns_w,
    mode: g.layout_mode, minStructs: g.min_structs_per_row,
    rowOffset: 'none', alignGrid: g.align_to_grid, center: true
  });
}
const dpct = (a, b) => (b ? Math.abs(100 * (a - b) / b) : (a ? Infinity : 0));

const js = [];
for (const caso of fix.casos) {
  const r = correr(caso), s = r.stats, k = caso.core, n = caso.nombre;
  js.push(r);
  // Con exclusiones el core barre el origen Y (11 offsets simétricos) y se queda
  // con el que más coloca; ese barrido NO está portado, así que la fila de
  // arranque puede diferir en una. Sin exclusiones la cuenta tiene que cuadrar.
  const tolFilas = (caso.holes && caso.holes.length) ? 1 : 0;
  check(n + ' · filas', Math.abs(s.rows - k.rows) <= tolFilas, s.rows + ' vs ' + k.rows);
  check(n + ' · mesas dentro del 2,5 % (' + s.structures + ' vs ' + k.structures + ', ' +
        dpct(s.structures, k.structures).toFixed(2) + ' %)', dpct(s.structures, k.structures) <= 2.5);
  check(n + ' · kWp dentro del 2,5 % (' + dpct(s.kWp, k.kWp).toFixed(2) + ' %)', dpct(s.kWp, k.kWp) <= 2.5);
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
  const tolGcr = (k.fila_len_m ? 0.5 : 2.5);
  check(n + ' · GCR ' + (k.fila_len_m ? 'exacto' : 'por área, dentro del 2,5 %'),
        dpct(s.GCR, k.GCR) < tolGcr, s.GCR.toFixed(4) + ' vs ' + k.GCR.toFixed(4));
  if (k.fila_len_m) check(n + ' · largo de fila (2 mesas + motor) exacto',
    dpct(s.fila_len_m, k.fila_len_m) < 0.01, s.fila_len_m + ' vs ' + k.fila_len_m);
}

// ── 4) señales de que la geometría está viva ──
const caso0 = fix.casos[0];
const sinSetback = correr(caso0, { setback_m: 0 });
check('el setback MUERDE: sin él el área útil sube',
  sinSetback.stats.inner_area_m2 > js[0].stats.inner_area_m2 * 1.02,
  sinSetback.stats.inner_area_m2.toFixed(0) + ' vs ' + js[0].stats.inner_area_m2.toFixed(0));
check('sin setback el área útil es la de la parcela (< 0,5 %)',
  dpct(sinSetback.stats.inner_area_m2, sinSetback.stats.poly_area_m2) < 0.5);
const setbackGrande = correr(caso0, { setback_m: 40 });
check('un setback de 40 m quita mesas',
  setbackGrande.stats.structures < js[0].stats.structures);

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
const gcrCaso = js[0].stats;
check('GCR de tracker = apertura / pitch',
  Math.abs(gcrCaso.GCR - gcrCaso.collector_h_m / gcrCaso.pitch_m) < 1e-9);
check('MUTANTE: GCR sobre el pitch equivocado se sale de tolerancia',
  dpct(gcrCaso.collector_h_m / (gcrCaso.pitch_m + 1), caso0.core.GCR) > 0.5);

// Bifila: si es bifila, es bifila — conteo PAR de mesas por línea
const bif = js[0];
check('bifila: toda línea tiene un número PAR de mesas',
  bif.rows.every(r => r.length % 2 === 0), bif.rows.map(r => r.length).filter(n => n % 2).join(','));
check('bifila: las sub-filas A y B quedan alineadas en X (Δx ≈ 0)',
  bif.stats.ab_max_dx_m < 0.01, String(bif.stats.ab_max_dx_m));

// Montaje fijo: bifila se ignora y se DICE
const fija = correr(fix.casos[3], { bifila: true });
check('en montaje fijo bifila se ignora', fija.stats.bifila === false);
check('y se dice en pantalla (aviso)',
  fija.avisos.some(a => a.codigo === 'bifila_ignorada_en_fija'));

// Multi-talla: aparecen tallas menores rellenando la cola
const multi = js[4].stats;
check('multi-talla: el reparto usa más de una talla',
  Object.keys(multi.by_size || {}).length > 1, JSON.stringify(multi.by_size));
check('multi-talla coloca más módulos que la talla única',
  multi.modules > js[1].stats.modules, multi.modules + ' vs ' + js[1].stats.modules);

// El hueco quita mesas donde está
const conHueco = js[7].stats, sinHueco = js[1].stats;
check('un hueco en la parcela quita mesas', conHueco.structures < sinHueco.structures,
  conHueco.structures + ' vs ' + sinHueco.structures);

// Vial: el mismo campo con vial cada 5 filas tiene MENOS filas
check('el vial E-O se come filas', js[5].stats.rows < js[1].stats.rows,
  js[5].stats.rows + ' vs ' + js[1].stats.rows);

// Pitch por debajo de la apertura: el motor lo canta, no lo calla
const pitchMalo = correr(caso0, { pitch_m: 1.5 });
check('un pitch menor que la apertura sale como FALLO en los avisos',
  pitchMalo.avisos.some(a => a.codigo === 'pitch_menor_que_apertura' && a.severidad === 'fail'));

// Los viales repartidos simétricamente (port de _centered_road_positions)
check('viales centrados: total=6 cada 5 → [3]', JSON.stringify(LAY.centeredRoadPositions(6, 5)) === '[3]');
check('viales centrados: total=11 cada 5 → [4,7]', JSON.stringify(LAY.centeredRoadPositions(11, 5)) === '[4,7]');
check('viales centrados: total=16 cada 5 → [4,8,12]', JSON.stringify(LAY.centeredRoadPositions(16, 5)) === '[4,8,12]');

// GeoJSON: una feature por mesa, anillo cerrado
const gj = LAY.toGeoJSON(js[0]);
check('el GeoJSON trae una feature por mesa (más los viales)',
  gj.features.filter(f => f.properties.tipo === 'mesa').length === js[0].stats.structures);
check('los anillos del GeoJSON están cerrados',
  gj.features.every(f => {
    const r = f.geometry.coordinates[0];
    return r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
  }));

console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
process.exit(ko ? 1 : 0);
