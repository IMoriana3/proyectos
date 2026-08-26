// Careo de la ficha «Comparador de estructuras» contra el core Python — SIN navegador.
//
// La ficha calcula en el navegador para poder abrirse sin levantar nada, y eso
// abre la puerta a la segunda verdad: dos motores que dicen cosas distintas y
// nadie mirando. Esto es lo que cierra esa puerta.
//
// Cómo: extrae el bloque «FÍSICA PURA» del comparador-estructuras.html REAL
// —no una copia en un .js de test, que se quedaría careando una versión vieja
// mientras la ficha evoluciona— y lo corre sobre la MISMA meteo que corrió el
// core (tests/careo-estructuras.json, generado por gen_careo_estructuras.py).
//
// Qué se exige, y por qué eso y no la igualdad:
//   · el ORDEN entre estructuras, idéntico          → es para lo que existe la ficha
//   · los Δ% contra la referencia, dentro de 2,5 pp → la decisión no puede cambiar
//   · la POA absoluta, dentro del 8 %               → isotrópica vs Perez, sin IAM
//   · señales de que la física está viva: el backtracking quita la sombra, el
//     eje inclinado GANA al horizontal (la trampa del azimut), la fija apunta
//     al ecuador en los dos hemisferios.
//
//   node tests/test_comparador.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

// ── 1) extraer la física del HTML de verdad ──
const html = fs.readFileSync(path.join(RAIZ, 'comparador-estructuras.html'), 'utf8');
// El marcador de inicio abre un comentario largo (el que explica qué es y qué
// no es este motor): el código empieza en el PRIMER `*/` posterior.
const m = html.match(/FÍSICA PURA — inicio[\s\S]*?\*\/([\s\S]*?)\/\* ═+ FÍSICA PURA — fin/);
check('el bloque FÍSICA PURA está delimitado en el HTML', !!m);
if (!m) { console.log('\nFALLOS: 1'); process.exit(1); }
const ctx = { console, module: { exports: {} } };
vm.createContext(ctx);
try { vm.runInContext(m[1], ctx); } catch (e) { check('la física compila en Node', false, e.message); }
const FIS = ctx.FIS;
check('la física compila y exporta FIS', !!(FIS && FIS.compara));
if (!FIS) { console.log('\nFALLOS: ' + ko); process.exit(1); }

// ── 2) el catálogo del JS es el del core ──
const fix = JSON.parse(fs.readFileSync(path.join(__dirname, 'careo-estructuras.json'), 'utf8'));
const clavesJS = FIS.CATALOGO.map(s => s.key).sort();
check('el catálogo del JS es el del core (' + clavesJS.length + ')',
  JSON.stringify(clavesJS) === JSON.stringify(fix.core.catalogo.slice().sort()),
  clavesJS.join(',') + ' vs ' + fix.core.catalogo.join(','));

// ── 2b) el TAMAÑO de la estructura, contra `layout_engine.compute_size_from_mods` ──
// Cifras sacadas del core (mismos argumentos): si la ficha se inventa una
// fórmula propia para la mesa, el layout de planta y la ficha dejan de hablar
// del mismo tracker.
const MOD = { modL: 2.382, modW: 1.134, gapMod: 0.02, gapMot: 0.5,
              modsStr: 28, nStr: 2, filas: 1 };
[['1V', 65.0840, 2.3820, 56],
 ['2V', 65.0840, 4.7640, 112],
 ['1H', 134.9720, 1.1340, 56],
 ['2H', 134.9720, 2.2680, 112]].forEach(([tabla, largo, apertura, mods]) => {
  const T = FIS.tamano({ ...MOD, tabla });
  check('tamaño ' + tabla + ': largo de fila = ' + largo + ' m',
    Math.abs(T.largoFila - largo) < 1e-3, T.largoFila.toFixed(4));
  check('tamaño ' + tabla + ': apertura = ' + apertura + ' m',
    Math.abs(T.apertura - apertura) < 1e-3, T.apertura.toFixed(4));
  check('tamaño ' + tabla + ': ' + mods + ' módulos por fila',
    T.modsFila === mods, String(T.modsFila));
});
// el alto de colector SÍ lleva los gaps (convención de la página 8 · Fija)
check('el alto de colector lleva los gaps y la apertura no (2V)',
  Math.abs(FIS.tamano({ ...MOD, tabla: '2V' }).altoColector - 4.784) < 1e-6);
// monofila/bifila NO cambia la mesa: es operativa, no geométrica
const mono = FIS.tamano({ ...MOD, filas: 1 }), bi = FIS.tamano({ ...MOD, filas: 2 });
check('bifila no cambia la geometría de la mesa',
  mono.largoFila === bi.largoFila && mono.apertura === bi.apertura);
check('bifila SÍ dobla los módulos por tracker (' + mono.modsTracker + ' → ' + bi.modsTracker + ')',
  bi.modsTracker === mono.modsTracker * 2);

// ── 2c) IGUALDAD DE POTENCIA PICO ──
// Es el marco de la comparación: mismos MWp, y de ahí salen los módulos, las
// estructuras y la parcela. Las cifras están calculadas a mano, no copiadas de
// la propia función — si no, el test solo diría que la función es determinista.
//   1V, 28 mods/string, 2 strings → 56 módulos por fila; 660 Wp → 36,96 kWp/fila
//   10 MWp / 660 Wp = 15151,5 → 15152 módulos pedidos → 271 filas (15176 módulos)
//   suelo = 271 × 6,00 m × 65,084 m = 105 826,6 m² = 10,5827 ha
const GP = { ...FIS.tamano({ ...MOD, tabla: '1V' }), pitch: 6.0, wp: 660 };
const P = FIS.planta(GP, 10);
check('pico: 10 MWp a 660 Wp pide 15152 módulos', P.pedidos === 15152, String(P.pedidos));
check('pico: se redondea a FILA entera (271 filas de 56)',
  P.filas === 271 && P.mods === 271 * 56, P.filas + ' / ' + P.mods);
check('pico: el instalado sube sobre el pedido (10,0162 MWp)',
  Math.abs(P.mwp - 10.01616) < 1e-4, P.mwp.toFixed(5));
check('pico: el suelo es filas × pitch × largo (10,5827 ha)',
  Math.abs(P.ha - 10.58266) < 1e-4, P.ha.toFixed(5));
check('pico: densidad de parcela ' + P.mwpHa.toFixed(4) + ' MWp/ha',
  Math.abs(P.mwpHa - P.mwp / P.ha) < 1e-9);
// El campo es un RECTÁNGULO y sus dos lados se publican: es lo que contesta a
// «¿las pone una detrás de otra o las hace infinitas?». Una detrás de otra —
// para contar suelo. (Para la SOMBRA sí son infinitas, y eso va dicho aparte.)
check('el campo se rompe en bloques hasta quedar CUADRADO (' +
  Math.round(P.ladoFila) + ' × ' + Math.round(P.ladoPitch) + ' m, ' +
  P.bloques + '×' + P.filasPorBloque + ')',
  Math.abs(P.ladoFila / P.ladoPitch - 1) < 0.25,
  JSON.stringify([P.ladoFila, P.ladoPitch, P.bloques, P.filasPorBloque]));
check('los bloques cubren todas las filas',
  P.bloques * P.filasPorBloque >= P.filas &&
  (P.bloques - 1) * P.filasPorBloque < P.filas,
  P.bloques + '×' + P.filasPorBloque + ' vs ' + P.filas);
check('los lados salen de la geometría, no de un ajuste',
  Math.abs(P.ladoFila - P.bloques * 65.084) < 1e-6 &&
  Math.abs(P.ladoPitch - P.filasPorBloque * 6.0) < 1e-9);
// las hectáreas siguen siendo la HUELLA de las filas: el rectángulo que las
// envuelve es algo mayor porque el último bloque queda incompleto
check('las hectáreas siguen siendo la huella de las filas, no el rectángulo',
  Math.abs(P.ha - P.filas * 6.0 * 65.084 / 1e4) < 1e-9 &&
  P.ladoFila * P.ladoPitch / 1e4 >= P.ha - 1e-9,
  P.ha.toFixed(4) + ' vs ' + (P.ladoFila * P.ladoPitch / 1e4).toFixed(4));
// y una tira imposible ya no puede salir: a 100 MWp el lado más largo se queda
// en el orden del kilómetro, no en diecisiete
const P100 = FIS.planta(GP, 100);
check('a 100 MWp el campo sigue siendo cuadrado, no una tira de 17 km (' +
  Math.round(P100.ladoFila) + ' × ' + Math.round(P100.ladoPitch) + ' m)',
  Math.max(P100.ladoFila, P100.ladoPitch) < 2000 &&
  Math.abs(P100.ladoFila / P100.ladoPitch - 1) < 0.25,
  JSON.stringify([P100.ladoFila, P100.ladoPitch]));

// más pitch = mismos módulos, mismas filas, MÁS suelo. Es toda la comparación.
const Pancho = FIS.planta({ ...GP, pitch: 9.0 }, 10);
check('pico: abrir el pitch no cambia los módulos, solo el suelo',
  Pancho.mods === P.mods && Math.abs(Pancho.ha / P.ha - 1.5) < 1e-6,
  Pancho.ha.toFixed(4));
// bifila: la mesa no cambia, pero son la mitad de seguidores
const Pbi = FIS.planta({ ...FIS.tamano({ ...MOD, tabla: '1V', filas: 2 }), pitch: 6.0, wp: 660 }, 10);
check('pico: bifila deja las mismas filas y la mitad de seguidores (' +
  Pbi.filas + ' / ' + Pbi.trackers + ')',
  Pbi.filas === P.filas && Pbi.trackers === Math.ceil(P.filas / 2));
// una mesa 2V dobla los módulos por fila: la mitad de estructuras, mismo pico
const P2V = FIS.planta({ ...FIS.tamano({ ...MOD, tabla: '2V' }), pitch: 12.0, wp: 660 }, 10);
check('pico: una mesa 2V necesita la mitad de estructuras (' + P2V.filas + ')',
  P2V.filas === Math.ceil(15152 / 112), String(P2V.filas));
// entradas imposibles: null, no un número con pinta de bueno
check('pico: sin potencia no hay dimensionado', FIS.planta(GP, 0) === null);
check('pico: sin Wp de módulo no hay dimensionado', FIS.planta({ ...GP, wp: 0 }, 10) === null);
// la energía incidente es la POA por los m² que el pico obliga a montar
check('pico: incidente = POA × área / 1e6 (GWh)',
  Math.abs(FIS.incidente(2000, P.areaMod) - 2000 * P.areaMod / 1e6) < 1e-9);

// ── 3) correr el motor del navegador sobre la MISMA meteo ──
const C = fix.cfg;
const M = { source: 'careo',
  t: fix.meteo.t.map(s => new Date(s)),
  ghi: Float64Array.from(fix.meteo.ghi),
  dni: Float64Array.from(fix.meteo.dni),
  dhi: Float64Array.from(fix.meteo.dhi) };
const gcr = C.collector_width_m / C.pitch_m;
// El core corre con UNA cota (su `collector_height_m`), que es la APERTURA; la
// ficha distingue apertura (GCR) de alto de colector (sombreado) y con 1V —lo
// que hay en el fixture— valen lo mismo. Igualarlas aquí es lo que hace que el
// careo compare física y no una diferencia de configuración.
// Fija y tracker se configuran por separado en la ficha; el fixture del core
// corrió con UNA geometría, así que aquí se le dan las dos iguales — lo que se
// carea es la física, no una diferencia de configuración.
const G = { apertura: C.collector_width_m, altoColector: C.collector_width_m,
            largoFila: 65.084, pitch: C.pitch_m, gcr };
const cfg = { lat: C.lat, lon: C.lon, gcr, fija: G, tracker: G,
  maxang: C.max_angle_deg, albedo: C.albedo, tilt: C.tilt_deg, tiltEW: 12,
  axTilt: C.axis_tilt_deg, pend: C.cross_axis_slope_deg, geomDe: () => G };
const rep = FIS.compara(C.structures, M, cfg);
const js = {}; rep.filas.forEach(f => { js[f.key] = f; });
const core = {}; fix.esperado.forEach(f => { core[f.key] = f; });

check('la referencia es la misma que la del core (' + rep.base + ')', rep.base === fix.core.baseline);
check('el GHI del sitio cuadra (±1 %)',
  Math.abs(rep.ghi / fix.core.ghi_kwh_m2 - 1) < 0.01,
  rep.ghi.toFixed(1) + ' vs ' + fix.core.ghi_kwh_m2.toFixed(1));

// ── 4) el ORDEN, que es lo que decide ──
const ordena = o => Object.keys(o).sort((a, b) => o[b].poa - o[a].poa).join(' > ');
const ordJS = ordena(Object.fromEntries(Object.entries(js).map(([k, v]) => [k, { poa: v.neta }])));
const ordCore = ordena(Object.fromEntries(Object.entries(core).map(([k, v]) => [k, { poa: v.poa_kwh_m2 }])));
check('el orden entre estructuras es el mismo', ordJS === ordCore, '\n     JS   ' + ordJS + '\n     core ' + ordCore);

// ── 5) magnitudes, con la tolerancia declarada ──
const TOL_POA = 0.08, TOL_DELTA = 2.5;
C.structures.forEach(k => {
  const a = js[k], b = core[k];
  if (!a || !b) { check('falta ' + k, false); return; }
  const dPoa = Math.abs(a.neta / b.poa_kwh_m2 - 1);
  check('POA de ' + k + ' dentro del ' + (TOL_POA * 100) + ' % (' + (dPoa * 100).toFixed(1) + ' %)',
    dPoa < TOL_POA, a.neta.toFixed(1) + ' vs ' + b.poa_kwh_m2.toFixed(1));
  const dDelta = Math.abs(a.delta - b.delta_pct);
  check('Δ% de ' + k + ' dentro de ' + TOL_DELTA + ' pp (' + dDelta.toFixed(2) + ' pp)',
    dDelta < TOL_DELTA, a.delta.toFixed(2) + ' vs ' + b.delta_pct.toFixed(2));
});

// ── 5b) LOS BARRIDOS ──
// La rejilla de pitch se exige EXACTA contra la de `pitch_sweep._generate_step_pitches`
// (son las cifras de `test_pitch_sweep.py` del core): es aritmética, no física.
const gr = (a, b, c) => FIS.pasosPitch(a, b, c);
check('rejilla 5,0→6,0 cada 10 cm: 11 puntos exactos',
  gr(5, 6, 10).length === 11 && Math.abs(gr(5, 6, 10)[5] - 5.5) < 1e-9,
  gr(5, 6, 10).join(','));
check('rejilla 5,0→6,0 cada 25 cm: [5, 5.25, 5.5, 5.75, 6]',
  JSON.stringify(gr(5, 6, 25)) === JSON.stringify([5, 5.25, 5.5, 5.75, 6]),
  gr(5, 6, 25).join(','));
check('el extremo se fuerza si el paso no cae justo',
  gr(5, 6, 40)[gr(5, 6, 40).length - 1] === 6, gr(5, 6, 40).join(','));
[[[-1, 6, 10], '> 0'], [[5, 6, 0], 'paso'], [[7, 6, 10], 'mínimo']].forEach(([args, txt]) => {
  let msg = '';
  try { gr.apply(null, args); } catch (e) { msg = e.message; }
  check('rejilla imposible (' + args.join(',') + ') se rechaza: «' + txt + '»',
    msg.indexOf(txt) >= 0, msg || '(no lanzó)');
});

// Y la FÍSICA del barrido, con las mismas exigencias que el core se pone a sí
// mismo en `test_pitch_sweep.py`: el GCR baja con el pitch, la POA de módulo
// sube y la densidad de suelo baja. Si alguna se diera la vuelta, el barrido
// estaría diciendo lo contrario de lo que la geometría obliga.
const spTk = FIS.spec('tracker_hsat');
const bp = FIS.barridoPitch(spTk, M, cfg, { min: 4.5, max: 7.5, pasoCm: 50 });
check('el barrido da ' + bp.puntos.length + ' puntos (4,5→7,5 cada 50 cm)', bp.puntos.length === 7);
check('el GCR baja estrictamente con el pitch',
  bp.puntos.every((q, i) => i === 0 || q.gcr < bp.puntos[i - 1].gcr));
check('la POA por m² de MÓDULO sube con el pitch (' +
  bp.puntos[0].poa.toFixed(1) + ' → ' + bp.puntos[6].poa.toFixed(1) + ')',
  bp.puntos[6].poa > bp.puntos[0].poa);
check('la densidad por m² de SUELO baja con el pitch (' +
  bp.puntos[0].suelo.toFixed(1) + ' → ' + bp.puntos[6].suelo.toFixed(1) + ')',
  bp.puntos[6].suelo < bp.puntos[0].suelo);
const bpNb = FIS.barridoPitch(FIS.spec('tracker_hsat_nobt'), M, cfg,
  { min: 4.5, max: 7.5, pasoCm: 50 });
check('sin backtracking, abrir el pitch QUITA sombra (' + bpNb.puntos[0].sombra.toFixed(2) +
  ' → ' + bpNb.puntos[6].sombra.toFixed(2) + ' %)',
  bpNb.puntos[6].sombra < bpNb.puntos[0].sombra - 0.1);
const bpLlano = FIS.barridoPitch(spTk, M, { ...cfg, pend: 0 },
  { min: 4.5, max: 7.5, pasoCm: 50 });
check('en llano, con backtracking la sombra es ~0 a cualquier pitch (por eso existe)',
  bpLlano.puntos.every(q => q.sombra < 0.5),
  bpLlano.puntos.map(q => q.sombra.toFixed(2)).join(','));
// Los DOS máximos son de dos preguntas distintas, y en pitch caen en extremos
// opuestos del rango: ésa es toda la razón de no declarar un óptimo único.
check('el máximo de POA cae en el pitch más abierto (' + bp.maxPoa.pitch + ' m)',
  bp.maxPoa.pitch === 7.5);
check('el máximo de suelo cae en el más apretado (' + bp.maxSuelo.pitch + ' m)',
  bp.maxSuelo.pitch === 4.5);
check('el relativo vale 0 en el pitch CONFIGURADO, no en un 6,00 fijo',
  Math.abs(bp.puntos.find(q => Math.abs(q.pitch - bp.actual) < 1e-6).rel) < 1e-9,
  String(bp.actual));
check('el coste de apretar 1 m es negativo y el terreno ahorrado positivo (' +
  bp.costeM1.toFixed(2) + ' % POA / ' + bp.sueloM1.toFixed(0) + ' % suelo)',
  bp.costeM1 < 0 && bp.sueloM1 > 0);
// un GCR > 1 no es un punto malo: es geometría imposible, y se marca
const bpMal = FIS.barridoPitch(spTk, M, cfg, { min: 1.0, max: 3.0, pasoCm: 100 });
check('los pitches con GCR > 1 se marcan imposibles y no pueden ganar',
  bpMal.hayImposibles && !bpMal.maxSuelo.imposible && bpMal.maxSuelo.gcr <= 1,
  JSON.stringify(bpMal.puntos.map(q => [q.pitch, +q.gcr.toFixed(2), q.imposible])));

// El barrido de TILT sí tiene óptimo interior — es lo que lo distingue del de
// pitch, y por eso uno declara ganador y el otro no.
const bt = FIS.barridoTilt(FIS.spec('fija_proyecto'), M, cfg, { min: 0, max: 60, paso: 5 });
check('el barrido de tilt da 13 puntos (0..60 cada 5°)', bt.puntos.length === 13);
check('el óptimo de tilt es INTERIOR, no un extremo (' + bt.optimo.tilt + '°)',
  bt.optimo.tilt > 0 && bt.optimo.tilt < 60);
check('el óptimo del barrido cuadra con FIS.tiltOptimo (±5°)',
  Math.abs(bt.optimo.tilt - js.fija_optima.tilt) <= 5,
  bt.optimo.tilt + ' vs ' + js.fija_optima.tilt);
check('el relativo del tilt es 0 en el óptimo y negativo fuera',
  Math.abs(bt.optimo.rel) < 1e-9 && bt.puntos.every(q => q.rel <= 1e-9));

// ── 6) la física está viva, no devuelve constantes ──
check('con pendiente (' + C.cross_axis_slope_deg + '°) el backtracking YA NO deja la sombra a ' +
  'cero (' + js.tracker_hsat.sombra.toFixed(2) + ' %): el ángulo se calcula en llano',
  js.tracker_hsat.sombra > 0.5);
check('y esa sombra residual es la que dice el core (' + core.tracker_hsat.sombra_pct.toFixed(2) + ' %)',
  Math.abs(js.tracker_hsat.sombra - core.tracker_hsat.sombra_pct) < 1.0,
  js.tracker_hsat.sombra.toFixed(2) + ' vs ' + core.tracker_hsat.sombra_pct.toFixed(2));
// y en LLANO sí se va a cero, que es la razón de ser del backtracking
const llano = FIS.compara(['tracker_hsat', 'tracker_hsat_nobt'], M, { ...cfg, pend: 0 });
const llanoBt = llano.filas.find(f => f.key === 'tracker_hsat');
check('en terreno LLANO el backtracking sí deja la sombra a cero (' +
  llanoBt.sombra.toFixed(3) + ' %)', llanoBt.sombra < 0.5, llanoBt.sombra.toFixed(3));
check('la pendiente EMPEORA el backtracking (' + llanoBt.sombra.toFixed(2) + ' → ' +
  js.tracker_hsat.sombra.toFixed(2) + ' %)', js.tracker_hsat.sombra > llanoBt.sombra + 0.5);
check('sin backtracking SÍ hay sombra (' + js.tracker_hsat_nobt.sombra.toFixed(2) + ' %)',
  js.tracker_hsat_nobt.sombra > js.tracker_hsat.sombra + 0.5);
check('sin backtracking apunta mejor: más POA ideal',
  js.tracker_hsat_nobt.ideal > js.tracker_hsat.ideal);
check('el eje INCLINADO gana al horizontal en latitud media',
  js.tracker_tsat.neta > js.tracker_hsat.neta,
  'TSAT ' + js.tracker_tsat.neta.toFixed(1) + ' vs HSAT ' + js.tracker_hsat.neta.toFixed(1));
check('el tilt óptimo es plausible a ' + C.lat.toFixed(0) + '°N (' + js.fija_optima.tilt + '°)',
  js.fija_optima.tilt > 20 && js.fija_optima.tilt < 45);
check('el óptimo bate al tilt de proyecto', js.fija_optima.neta >= js.fija_proyecto.neta);
check('la fija transpone por encima del GHI', js.fija_proyecto.transp > 5);

// ── 6b) EL ÓPTIMO NETO CONTRA EL DE TRANSPOSICIÓN ──
// El aviso decía «queda 1-3° por encima» como número FIJO. Eso solo vale a GCR
// flojo: con las filas apretadas un tilt alto se tapa la fila de detrás y el
// óptimo NETO se desploma. A GCR 0,68 en Sevilla la diferencia es de ONCE
// grados, y decir «1-3°» ahí se lee como «casi coinciden» cuando no coinciden
// en absoluto. Ahora el segundo óptimo se calcula y la diferencia se publica.
check('la fila publica también el óptimo SIN sombra',
  js.fija_optima.tiltSinSombra != null && js.fija_optima.tiltSinSombra > 0,
  String(js.fija_optima.tiltSinSombra));
check('el óptimo neto nunca puede pasarse del de transposición (' +
  js.fija_optima.tilt + '° ≤ ' + js.fija_optima.tiltSinSombra + '°)',
  js.fija_optima.tilt <= js.fija_optima.tiltSinSombra);
check('el aviso da la diferencia MEDIDA, no un «1-3°» de memoria',
  (rep.avisos.some(a => /serían\s+\d+°/.test(a)) ||
   rep.avisos.some(a => /saldría lo mismo/.test(a))) &&
  !rep.avisos.some(a => /1-3°/.test(a)),
  rep.avisos.find(a => /tilt óptimo/.test(a)) || '(sin aviso)');
// Los avisos salen del bloque de física y se pintan ESCAPADOS —bien escapados,
// porque llevan etiquetas de estructura—, así que un <b> aquí se ve tal cual.
check('ningún aviso lleva HTML: se pintan escapados',
  !rep.avisos.some(a => /<[a-z/]/i.test(a)),
  rep.avisos.find(a => /<[a-z/]/i.test(a)) || '');
// y que no se vayan de largo: un aviso de cinco líneas no se lee
check('los avisos son concisos (el más largo, ' +
  Math.max.apply(null, rep.avisos.map(a => a.length)) + ' caracteres)',
  Math.max.apply(null, rep.avisos.map(a => a.length)) < 300,
  rep.avisos.slice().sort((a, b) => b.length - a.length)[0]);
// Y en cristiano: el aviso tiene que decir QUÉ es el número antes de cómo se
// saca. «el NETO, barrido CON sombra» era jerga que no se entiende sola.
const avTilt = rep.avisos.find(a => /tilt óptimo/.test(a)) || '';
check('el aviso del tilt no usa jerga («el NETO», «barrido»)',
  !/\bel NETO\b/.test(avTilt) && !/barrido/i.test(avTilt), avTilt.slice(0, 140));
check('y dice qué es el número: el mejor ángulo AQUÍ, con la sombra contada',
  /mejor ángulo AQUÍ/i.test(avTilt) && /sombra entre filas contada/i.test(avTilt),
  avTilt.slice(0, 140));
// el aviso de la E-O repetía «SIN sombreado entre filas» dos veces en la misma frase
const avEW = rep.avisos.find(a => /Este-Oeste/.test(a)) || '';
check('el aviso de la E-O no se repite a sí mismo',
  (avEW.match(/sombra entre filas|sombreado entre filas/gi) || []).length <= 1, avEW.slice(0, 160));

// Y la física detrás: apretar las filas TIENE que bajar el óptimo neto, sin
// mover el de transposición (que no sabe de vecinas).
const opt = gcr => {
  const G = { apertura: C.collector_width_m, altoColector: C.collector_width_m,
              largoFila: 65.084, pitch: C.collector_width_m / gcr, gcr };
  const c = { ...cfg, geomDe: () => G };
  const sp = FIS.spec('fija_optima');
  return { neto: FIS.tiltOptimo(M, c, sp),
           sinSombra: FIS.tiltOptimo(M, c, { fam: sp.fam, sinSombra: true }) };
};
const flojo = opt(0.40), apretado = opt(0.75);
check('con las filas apretadas el óptimo NETO baja (' + flojo.neto + '° → ' +
  apretado.neto + '° al pasar de GCR 0,40 a 0,75)', apretado.neto < flojo.neto - 5);
check('y el de transposición NO se mueve: no sabe que hay vecinas (' +
  flojo.sinSombra + '° = ' + apretado.sinSombra + '°)',
  flojo.sinSombra === apretado.sinSombra);

// ── 6b-bis) LA PENDIENTE ES DEL SITIO, CON AZIMUT ──
// Un emplazamiento no tiene una pendiente «⊥ a las filas»: tiene UNA, con su
// magnitud y su dirección de caída. Referenciarla a las filas le pedía al
// terreno girar con cada estructura. Lo que gira son las FILAS, y por eso cada
// familia ve una COMPONENTE distinta del mismo plano.
const FIJA = FIS.spec('fija_proyecto'), TK = FIS.spec('tracker_hsat'),
      EW = FIS.spec('fija_ew');
const N = { lat: 37.4 };                       // hemisferio norte, sin desvíos
check('sin desvíos, la fija apila al SUR (180°) y el seguidor y las dos aguas al ESTE (90°)',
  FIS.azPitch(N, FIJA) === 180 && FIS.azPitch(N, TK) === 90 && FIS.azPitch(N, EW) === 90,
  [FIS.azPitch(N, FIJA), FIS.azPitch(N, TK), FIS.azPitch(N, EW)].join(','));
check('en el hemisferio SUR la fija apila al NORTE, que es donde tiene el ecuador',
  FIS.azPitch({ lat: -16.6 }, FIJA) === 0);
// El azimut es una decisión de PROYECTO y se declara como desvío: 0 = la
// orientación de manual, positivo hacia el oeste. Así vale en los dos
// hemisferios y es como se especifica en obra.
check('el desvío gira la fija: 15° al oeste = mirar a 195°',
  FIS.azPitch({ lat: 37.4, desvFija: 15 }, FIJA) === 195);
check('y el del eje gira el seguidor: eje a 20° = apilar a 110°',
  FIS.azPitch({ lat: 37.4, desvEje: 20 }, TK) === 110);
check('y son INDEPENDIENTES: el desvío de la fija no toca al seguidor',
  FIS.azPitch({ lat: 37.4, desvFija: 15 }, TK) === 90 &&
  FIS.azPitch({ lat: 37.4, desvEje: 20 }, FIJA) === 180);
// Los cuatro rumbos cardinales, que son los que se pueden razonar a mano.
[[180, 16, 0, 'al SUR: la fija la ve entera y el seguidor NADA'],
 [90, 0, 16, 'al ESTE: al revés, el seguidor entera y la fija nada'],
 [0, -16, 0, 'al NORTE: la fija la ve entera pero con el signo cambiado'],
 [270, 0, -16, 'al OESTE: el seguidor, con el signo cambiado']
].forEach(([az, cf, ct, nom]) => {
  const f = FIS.pendComp(16, az, 180), t = FIS.pendComp(16, az, 90);
  check('cayendo ' + nom, Math.abs(f.cruz - cf) < 1e-9 && Math.abs(t.cruz - ct) < 1e-9,
    JSON.stringify({ fija: +f.cruz.toFixed(3), tk: +t.cruz.toFixed(3) }));
  // y lo que no ve ⊥ lo ve A LO LARGO: no se pierde por el camino
  check('  y lo que no entra ⊥ entra a lo largo (tan²⊥ + tan²largo = tan²β)',
    Math.abs(Math.tan(f.cruz * Math.PI / 180) ** 2 + Math.tan(f.largo * Math.PI / 180) ** 2
             - Math.tan(16 * Math.PI / 180) ** 2) < 1e-12);
});
// El caso en que TODAS ven lo mismo no es un ajuste: es un azimut concreto.
const d45 = FIS.pendComp(16, 135, 180), t45 = FIS.pendComp(16, 135, 90);
check('solo cayendo en diagonal (135°) las dos ven lo MISMO: ' + d45.cruz.toFixed(2) + '°',
  Math.abs(d45.cruz - t45.cruz) < 1e-9 &&
  Math.abs(d45.cruz - Math.atan(Math.tan(16 * Math.PI / 180) / Math.SQRT2) * 180 / Math.PI) < 1e-9,
  d45.cruz.toFixed(4) + ' vs ' + t45.cruz.toFixed(4));
check('terreno llano: ninguna ve nada, apunte donde apunte el azimut',
  [0, 45, 90, 200, 359].every(a => FIS.pendComp(0, a, 180).cruz === 0 &&
                                   FIS.pendComp(0, a, 90).cruz === 0));
// Y lo que pedía el caso general: con la estructura girada, la componente ⊥ ya
// no es la del manual. Terreno al sur y fija desviada 30° al oeste.
const gir = FIS.pendComp(16, 180, 210);
check('con la fija desviada 30°, de los 16° del terreno solo ve ' +
  gir.cruz.toFixed(1) + '° ⊥ a sus filas (cos 30° · tan β)',
  Math.abs(Math.tan(gir.cruz * Math.PI / 180) -
           Math.tan(16 * Math.PI / 180) * Math.cos(30 * Math.PI / 180)) < 1e-12,
  JSON.stringify(gir));
check('  y el resto le entra a lo largo de las filas',
  Math.abs(Math.tan(gir.cruz * Math.PI / 180) ** 2 +
           Math.tan(gir.largo * Math.PI / 180) ** 2 -
           Math.tan(16 * Math.PI / 180) ** 2) < 1e-12);
// El seam del careo: el core recibe el cross-axis directamente, así que sin
// azimut declarado `pend` ES el cross-axis. Con azimut, se deriva.
check('sin azimut declarado, `pend` es el cross-axis tal cual (el camino del careo)',
  FIS.cruz({ pend: 8, lat: 37.4 }, FIJA) === 8 && FIS.cruz({ pend: 8, lat: 37.4 }, TK) === 8);
check('con azimut, cada familia recibe SU componente',
  Math.abs(FIS.cruz({ pend: 16, pendAz: 180, lat: 37.4 }, FIJA) - 16) < 1e-9 &&
  Math.abs(FIS.cruz({ pend: 16, pendAz: 180, lat: 37.4 }, TK)) < 1e-9);
// Y lo que de verdad importa: eso llega al SOMBREADO, no se queda en la nota.
const caeSur = porClaveTmp(FIS.compara(['fija_proyecto', 'tracker_hsat_nobt'], M,
  { ...cfg, pend: 16, pendAz: 180 }));
const caeEste = porClaveTmp(FIS.compara(['fija_proyecto', 'tracker_hsat_nobt'], M,
  { ...cfg, pend: 16, pendAz: 90 }));
const llanoAz = porClaveTmp(FIS.compara(['fija_proyecto', 'tracker_hsat_nobt'], M,
  { ...cfg, pend: 0, pendAz: 180 }));
function porClaveTmp(r) { return Object.fromEntries(r.filas.map(f => [f.key, f])); }
check('cayendo al SUR la pendiente mueve la sombra de la FIJA (' +
  llanoAz.fija_proyecto.sombra.toFixed(2) + ' → ' + caeSur.fija_proyecto.sombra.toFixed(2) + ' %)',
  Math.abs(caeSur.fija_proyecto.sombra - llanoAz.fija_proyecto.sombra) > 0.05);
check('  y NO la del seguidor, que la lleva a lo largo del eje (' +
  caeSur.tracker_hsat_nobt.sombra.toFixed(3) + ' %)',
  Math.abs(caeSur.tracker_hsat_nobt.sombra - llanoAz.tracker_hsat_nobt.sombra) < 1e-9);
check('cayendo al ESTE se invierte: mueve al SEGUIDOR (' +
  llanoAz.tracker_hsat_nobt.sombra.toFixed(2) + ' → ' +
  caeEste.tracker_hsat_nobt.sombra.toFixed(2) + ' %)',
  Math.abs(caeEste.tracker_hsat_nobt.sombra - llanoAz.tracker_hsat_nobt.sombra) > 0.05);
check('  y no a la fija',
  Math.abs(caeEste.fija_proyecto.sombra - llanoAz.fija_proyecto.sombra) < 1e-9);

// ── 6b-ter) EL EJE INCLINADO LO PONE EL TERRENO ──
// Un TSAT no es un seguidor con un parámetro más: es un seguidor sobre una
// pendiente que corre A LO LARGO de su eje. Un eje no se inclina en el aire,
// así que el «eje inclinado °» no se teclea, se deriva — y con SIGNO, porque
// un emplazamiento no elige hacia dónde baja.
const TSAT = FIS.spec('tracker_tsat');
[[180, 26, 'cayendo al SUR el eje mira al ECUADOR'],
 [0, -26, 'cayendo al NORTE mira al POLO, y eso también existe'],
 [90, 0, 'cayendo al ESTE no hay nada a lo largo del eje: horizontal'],
 [270, 0, 'ni al OESTE']
].forEach(([az, esp, nom]) => {
  const e = FIS.ejeTilt({ pend: 26, pendAz: az, lat: 37.4 }, TSAT);
  check(nom + ' (' + e.toFixed(1) + '°)', Math.abs(e - esp) < 0.01, e.toFixed(3));
});
check('en LLANO el eje sale 0: sin pendiente no hay TSAT que valga',
  FIS.ejeTilt({ pend: 0, pendAz: 180, lat: 37.4 }, TSAT) === 0);
check('en el hemisferio SUR el ecuador está al norte, y el signo se da la vuelta',
  Math.abs(FIS.ejeTilt({ pend: 26, pendAz: 0, lat: -16.6 }, TSAT) - 26) < 0.01,
  FIS.ejeTilt({ pend: 26, pendAz: 0, lat: -16.6 }, TSAT).toFixed(3));
check('y solo el TSAT lo lleva: un HSAT es horizontal por definición',
  FIS.ejeTilt({ pend: 26, pendAz: 180, lat: 37.4 }, FIS.spec('tracker_hsat')) === 0);
check('sin azimut declarado se respeta el valor recibido (el camino del careo)',
  FIS.ejeTilt({ pend: 8, axTilt: 10, lat: 37.4 }, TSAT) === 10);
// Y el signo tiene consecuencia, que es lo que lo hace física y no adorno.
const ejeEq = FIS.compara(['tracker_tsat'], M, { ...cfg, pend: 20, pendAz: 180 });
const ejePol = FIS.compara(['tracker_tsat'], M, { ...cfg, pend: 20, pendAz: 0 });
check('el eje hacia el ECUADOR capta más que hacia el POLO (' +
  ejeEq.filas[0].neta.toFixed(1) + ' vs ' + ejePol.filas[0].neta.toFixed(1) + ' kWh/m²)',
  ejeEq.filas[0].neta > ejePol.filas[0].neta + 10,
  ejeEq.filas[0].neta.toFixed(1) + ' vs ' + ejePol.filas[0].neta.toFixed(1));

// ── 6c) LA MISMA PENDIENTE PARA LAS TRES: eso es la igualdad ──
// El parámetro es UNO, del emplazamiento, y entra en el sombreado de todas las
// familias por el mismo sitio. Lo que se exige aquí no es que exista el campo
// sino que MUEVA a las tres: si solo moviera a una, la comparación en igualdad
// sería mentira aunque el número estuviera puesto.
const conPend = FIS.compara(['fija_proyecto', 'tracker_hsat', 'tracker_hsat_nobt'], M,
  { ...cfg, pend: 12 });
const sinPend = FIS.compara(['fija_proyecto', 'tracker_hsat', 'tracker_hsat_nobt'], M,
  { ...cfg, pend: 0 });
const porClave = r => Object.fromEntries(r.filas.map(f => [f.key, f]));
const CP = porClave(conPend), SP = porClave(sinPend);
['fija_proyecto', 'tracker_hsat', 'tracker_hsat_nobt'].forEach(k => {
  check('la pendiente mueve la sombra de ' + k + ' (' + SP[k].sombra.toFixed(2) +
    ' → ' + CP[k].sombra.toFixed(2) + ' %)',
    Math.abs(CP[k].sombra - SP[k].sombra) > 0.05,
    SP[k].sombra.toFixed(3) + ' vs ' + CP[k].sombra.toFixed(3));
});
check('y es UN solo parámetro, no uno por familia: las tres cambian a la vez',
  ['fija_proyecto', 'tracker_hsat', 'tracker_hsat_nobt']
    .every(k => CP[k].sombra !== SP[k].sombra));
// y la POA también, que es lo que decide
check('con pendiente el ranking se recalcula con TODAS en el mismo terreno',
  conPend.filas.every(f => isFinite(f.neta) && f.neta > 0) &&
  Math.abs(CP.tracker_hsat.neta - SP.tracker_hsat.neta) > 0.01,
  CP.tracker_hsat.neta.toFixed(2) + ' vs ' + SP.tracker_hsat.neta.toFixed(2));

// ── 6d) EL BACKTRACKING NUNCA INVIERTE EL ÁNGULO ──
// Retroceder es APLANARSE para no taparse: como mucho hasta plano. Pasarse del
// cero sería tumbarse hacia el otro lado, que no evita ninguna sombra — la
// crea. Con GCR ≤ 1 la cota nunca actúa; con un GCR imposible (>1, la apertura
// no cabe en el pitch) era lo único que faltaba: con 3V a pitch 6 el seguidor
// salía a −32,6° A MEDIODÍA y girando al revés.
[[0.397, 'GCR normal'], [0.794, 'GCR apretado'], [1.0, 'GCR justo en el límite']]
  .forEach(([g, nom]) => {
  [-60, -30, -5, 0, 5, 30, 60].forEach(ps => {
    const th = FIS.theta(ps, g, 55, true);
    check('backtracking a ' + nom + ' (' + g + ') no invierte el signo en ps=' + ps + '° (θ=' +
      th.toFixed(1) + '°)', ps === 0 || th * ps >= -1e-9, String(th));
    check('  y nunca se pasa del ángulo astronómico (|' + th.toFixed(1) + '| ≤ |' + ps + '|)',
      Math.abs(th) <= Math.abs(ps) + 1e-9);
  });
});
// y con la geometría IMPOSIBLE se queda plano en vez de inventarse un ángulo
[1.19, 1.59, 3.0].forEach(g => {
  const th = [-60, -20, 0, 20, 60].map(ps => FIS.theta(ps, g, 55, true));
  check('con GCR ' + g + ' (imposible) el seguidor se queda PLANO, no invertido',
    th.every(t => Math.abs(t) < 1e-9), JSON.stringify(th));
});
// sin backtracking la cota no pinta nada: sigue el sol y punto
check('sin backtracking el ángulo es el astronómico, cota o no cota',
  Math.abs(FIS.theta(40, 1.19, 55, false) - 40) < 1e-9 &&
  Math.abs(FIS.theta(-40, 0.4, 55, false) + 40) < 1e-9);

// ── 7) hemisferio sur: la fija tiene que mirar al NORTE ──
// Si `psFija` no cambiara de signo bajo el ecuador, la fija apuntaría al polo y
// perdería contra el plano horizontal. Es el guard de esa línea.
const sur = { ...cfg, lat: -C.lat };
const Msur = { source: 'careo', t: M.t, ghi: M.ghi, dni: M.dni, dhi: M.dhi };
const repSur = FIS.compara(['fija_proyecto', 'tracker_hsat'], Msur, sur);
check('en el hemisferio sur la fija sigue transponiendo por encima del GHI',
  repSur.filas[0].transp > 5, repSur.filas[0].transp.toFixed(1) + ' %');

// ── 8) mutante: si el signo del eje inclinado se invierte, el careo tiene que caer ──
// Un guard que nunca se pone rojo es decoración. Se invierte a mano el sentido
// del eje (mirando al polo, que es lo que hacía el core con el azimut sin
// esquivar) y se exige que el TSAT deje de ganar.
const psTSATBueno = FIS.psTSAT;
FIS.psTSAT = function (el, az, axTiltDeg, lat) { return psTSATBueno(el, az, -axTiltDeg, lat); };
const mut = FIS.compara(['tracker_hsat', 'tracker_tsat'], M, cfg);
const mutTsat = mut.filas.find(f => f.key === 'tracker_tsat');
const mutHsat = mut.filas.find(f => f.key === 'tracker_hsat');
check('MUTANTE: con el eje mirando al polo, el TSAT deja de ganar',
  mutTsat.neta < mutHsat.neta,
  'mutado ' + mutTsat.neta.toFixed(1) + ' vs HSAT ' + mutHsat.neta.toFixed(1));
FIS.psTSAT = psTSATBueno;

console.log('\n' + (ko ? 'FALLOS: ' + ko + ' (de ' + (ok + ko) + ')' : 'OK — ' + ok + '/' + ok + ' comprobaciones'));
process.exit(ko ? 1 : 0);
