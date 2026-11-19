// Careo de las EXCLUSIONES SUGERIDAS DESDE OSM del generador contra el core — SIN navegador.
//
// `generador-layout.html` trae de Overpass cauces, carreteras, caminos, tendidos,
// vías y edificios dentro de la parcela y los convierte en exclusiones del motor
// con el retranqueo que pone quien firma. Es un espejo de
// `solargpt_core/osm_exclusions.py` (SolarGPTfull, 2026-11-16), y dos espejos sin
// careo son dos verdades.
//
// Cómo: extrae del HTML REAL el bloque «OSM · EXCLUSIONES SUGERIDAS» y el bloque
// «MOTOR DE LAYOUT», y los corre contra tests/careo-osm-exclusiones.json (escrito
// por gen_careo_osm_exclusiones.py con el core):
//   · la CONSULTA a Overpass, carácter a carácter     → el mismo filtro de OSM
//   · lo LEÍDO de cada elemento, idéntico             → categoría, clave, valor,
//                                                       forma y vértices (con el
//                                                       anillo partido COSIDO)
//   · el ÁREA que quitan, dentro del 1 %              → el motor la barre con
//                                                       pasos de 0,25 m; el core
//                                                       usa el buffer de Shapely
//   · sin retranqueo, ERROR que nombra la categoría   → no hay default legal
//
// Mutantes, predicción escrita ANTES de correrlos (tests/README.md):
//   J1 sin dar la vuelta a un trozo al revés al coser   → caen 6 (el recuento, la relación y los dos
//      elementos que se desplazan tras ella, arroyo_y_embalse_b5 y todo_junto)
//   J2 un área no se ensancha (solo su anillo)          → caen 3 (edificio_b4, arroyo_y_embalse_b5, todo_junto)
//   J3 un retranqueo ausente vale 5 m                   → cae 1 (sin retranqueo, error)
//   J4 la consulta pierde el `~` de la expresión        → cae 1 (consulta)
//
// J1 se re-predijo de 2 a 6 ANTES de correrlo: sin la relación, los elementos
// siguientes se desplazan un puesto y cada comparación por índice cae.
//
//   node tests/test_osm_exclusiones.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const html = fs.readFileSync(path.join(RAIZ, 'generador-layout.html'), 'utf8');
const mo = html.match(/OSM · EXCLUSIONES SUGERIDAS — inicio[\s\S]*?\*\/([\s\S]*?)\/\* ═+ OSM · EXCLUSIONES SUGERIDAS — fin/);
const mm = html.match(/MOTOR DE LAYOUT — inicio[\s\S]*?\*\/([\s\S]*?)\/\* ═+ MOTOR DE LAYOUT — fin/);
check('el bloque OSM · EXCLUSIONES SUGERIDAS está delimitado en el HTML', !!mo);
check('el bloque MOTOR DE LAYOUT está delimitado en el HTML', !!mm);
if (!mo || !mm) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('el bloque OSM extraído tiene sustancia (> 4000 caracteres)', mo[1].length > 4000, mo[1].length);
const ctx = { console, module: { exports: {} }, performance: { now: () => 0 } };
vm.createContext(ctx);
try { vm.runInContext(mm[1] + '\n' + mo[1] + '\n;globalThis.__OSMX = OSMX; globalThis.__LAY = LAY;', ctx); }
catch (e) { check('los bloques compilan en Node', false, e.message); }
const OSMX = ctx.__OSMX, LAY = ctx.__LAY;
check('exporta OSMX y LAY', !!(OSMX && OSMX.parsea && LAY && LAY.compute));
if (!OSMX || !LAY) { console.log('\nFALLOS: ' + ko); process.exit(1); }

const fix = JSON.parse(fs.readFileSync(path.join(__dirname, 'careo-osm-exclusiones.json'), 'utf8'));

// ── 1) consulta y bbox con margen ──
const bb = OSMX.bboxConMargen(fix.parcela_lonlat, fix.consulta.margen_m);
check('el bbox con margen es el del core', bb.every((v, i) => Math.abs(v - fix.consulta.bbox[i]) < 1e-12),
  JSON.stringify(bb) + ' vs ' + JSON.stringify(fix.consulta.bbox));
const q = OSMX.consulta(fix.consulta.bbox, fix.consulta.categorias, 90);
check('la consulta a Overpass es la del core, carácter a carácter', q === fix.consulta.texto,
  JSON.stringify(q.slice(0, 160)));

// ── 2) lo leído ──
const els = OSMX.parsea(fix.overpass);
check('lee tantos elementos como el core (' + fix.leidos.length + ')', els.length === fix.leidos.length,
  els.length + ' vs ' + fix.leidos.length);
fix.leidos.forEach((esp, i) => {
  const f = els[i] || {};
  const nv = f.rings ? f.rings.reduce((a, r) => a + r.length, 0) : (f.coords || []).length;
  const igual = f.ref === esp.ref && f.category === esp.category && f.key === esp.key &&
    f.value === esp.value && f.kind === esp.kind && nv === esp.n_vertices;
  check('lee ' + esp.ref + ' como el core (' + esp.category + ', ' + esp.kind + ', ' + esp.n_vertices + ' vértices)',
    igual, JSON.stringify({ ref: f.ref, category: f.category, kind: f.kind, nv }));
});

// ── 3) sin retranqueo no hay default ──
let err = null;
try { OSMX.aExclusiones(els, { cauces: null }); } catch (e) { err = e.message; }
check('sin retranqueo, error que nombra la categoría', !!err && err.indexOf('Cauces y agua') >= 0, err);
err = null;
try { OSMX.aExclusiones(els, { acequias: 3 }); } catch (e) { err = e.message; }
check('categoría desconocida, error', !!err && err.indexOf('desconocida') >= 0, err);
const cero = OSMX.aExclusiones(els, { lineas_electricas: 0 });
check('una línea con retranqueo 0 no excluye nada y se avisa',
  cero.lineas.length === 0 && cero.avisos.some(a => a.indexOf('no excluye nada') >= 0), JSON.stringify(cero.avisos));

// ── 4) el área que quitan, contra el core ──
const lay = JSON.parse(fs.readFileSync(path.join(__dirname, 'careo-layout.json'), 'utf8'));
const base = lay.casos[0].cfg;
function corre(ex) {
  return LAY.compute({
    coords: fix.parcela_lonlat, holes: [],
    exclusions: ex ? ex.areas : [], exclLines: ex ? ex.lineas : [],
    mount: 'tracker', table: base.table_type, mods: [base.mods_per_struct],
    modLen: base.mod_len, modWid: base.mod_wid, moduleWp: lay.module_wp,
    pitch: base.pitch_m, setback: 0, panelAz: base.panel_az_deg, bifila: base.bifila,
    gapModules: base.gap_modules, gapMotor: base.gap_motor, gapNs: base.gap_ns,
    roadEvery: 0, roadW: base.road_w, roadNsEvery: 0, roadNsW: base.road_ns_w,
    mode: base.layout_mode, minStructs: base.min_structs_per_row,
    rowOffset: 'none', alignGrid: base.align_to_grid, center: true
  }).stats.inner_area_m2;
}
const a0 = corre(null);
check('la parcela sin exclusiones es la del core (±1 %)',
  Math.abs(a0 - 400 * 300) / (400 * 300) < 0.01, a0.toFixed(1));
fix.casos.forEach(c => {
  const ex = OSMX.aExclusiones(els, c.retranqueos);
  const quita = a0 - corre(ex);
  const tol = Math.max(0.01 * c.area_m2, 5);
  check('«' + c.nombre + '» quita lo que el core: ' + quita.toFixed(1) + ' m² vs ' + c.area_m2 + ' m²',
    Math.abs(quita - c.area_m2) <= tol, (quita - c.area_m2).toFixed(1));
});

console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
process.exit(ko ? 1 : 0);
