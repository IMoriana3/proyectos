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
  axTilt: C.axis_tilt_deg, geomDe: () => G };
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
check('con backtracking la sombra es ~0 a cualquier pitch (por eso existe)',
  bp.puntos.every(q => q.sombra < 0.5));
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
check('el backtracking deja la sombra casi a cero (' + js.tracker_hsat.sombra.toFixed(2) + ' %)',
  js.tracker_hsat.sombra < 0.5);
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
  rep.avisos.some(a => /saldría\s+\d+°/.test(a)) && !rep.avisos.some(a => /1-3°/.test(a)),
  rep.avisos.find(a => /tilt óptimo/.test(a)) || '(sin aviso)');

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
FIS.psTSAT = function (el, az, axTiltDeg, lat) { return psTSATBueno(el, az, -axTiltDeg, -lat); };
const mut = FIS.compara(['tracker_hsat', 'tracker_tsat'], M, cfg);
const mutTsat = mut.filas.find(f => f.key === 'tracker_tsat');
const mutHsat = mut.filas.find(f => f.key === 'tracker_hsat');
check('MUTANTE: con el eje mirando al polo, el TSAT deja de ganar',
  mutTsat.neta < mutHsat.neta,
  'mutado ' + mutTsat.neta.toFixed(1) + ' vs HSAT ' + mutHsat.neta.toFixed(1));
FIS.psTSAT = psTSATBueno;

console.log('\n' + (ko ? 'FALLOS: ' + ko + ' (de ' + (ok + ko) + ')' : 'OK — ' + ok + '/' + ok + ' comprobaciones'));
process.exit(ko ? 1 : 0);
