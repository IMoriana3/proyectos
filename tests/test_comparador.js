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

// ── 1b) MANIFIESTO del golden — PORTAL-BUG-01 ──────────────────────────────
// Este fichero estuvo CINCO DÍAS careando dos físicas distintas sin que nada lo
// dijera, y no por un error de cálculo:
//
//   2026-08-20 14:46 · el motor JS de la ficha empieza a sombrear el
//                      circunsolar (`dirCirc`, commit c84753f)
//   2026-08-21 08:36 · el CORE hace lo mismo (SolarGPT v1.64.0, 8c6fbc6)
//   2026-08-21 17:43 · se regenera este golden (9a15dc2) — NUEVE HORAS después
//                      del cambio del core y con la física VIEJA dentro: el
//                      clon local de SolarGPT desde el que se generó no tenía
//                      ese merge.
//
// El golden no registraba de qué core salía, así que estar atrasado era
// indistinguible de estar al día. Esto es lo que cierra esa puerta.
//
// CLASIFICACIÓN, que el protocolo de PORTAL-BUG-01 pedía por escrito y no se
// llegó a dejar. De las seis categorías previstas, el fallo fue DOS:
//
//   1. fixture obsoleto ....................... NO. El fixture describía
//      correctamente al core del que salió; el problema es que ese core ya no
//      era el de `main`.
//   2. bug en el portal ....................... NO. El motor JS había portado
//      la corrección del circunsolar el día ANTES que el core.
//   3. bug en el core ......................... NO, en aquel momento. (Sí lo
//      hubo después, y es otra incidencia: CROSS-TILT-01.)
//   4. input no equivalente ................... NO. Misma meteo, misma
//      geometría: el fixture las lleva dentro y el careo las reusa.
//   5. CAMBIO FÍSICO INTENCIONADO SIN MIGRACIÓN ... SÍ. v1.64.0 corrigió la
//      sombra del circunsolar deliberadamente y nadie regeneró el golden.
//   6. TOLERANCIA INCORRECTA .................. SÍ, y es la que lo dejó pasar
//      cinco días: 8 % y 2,5 pp son seis veces el hueco real, así que la
//      deriva cabía entera dentro del margen.
//
// Las dos a la vez importan: la 5 lo causó y la 6 lo hizo invisible. Arreglar
// solo una habría dejado la puerta abierta por el otro lado.
const CRUDO = fs.readFileSync(path.join(__dirname, 'careo-estructuras.json'), 'utf8');
const crypto = require('crypto');
const MAN = JSON.parse(CRUDO).manifiesto;

check('el golden trae manifiesto', !!MAN);
if (MAN) {
  // Cada campo por separado, no un `&&` de todos: parámetros fundidos = criterio
  // fantasma, y aquí interesa saber CUÁL falta.
  [['generado_utc', MAN.generado_utc], ['generador', MAN.generador],
   ['motivo', MAN.motivo], ['sha256', MAN.sha256],
   ['core.commit', MAN.core && MAN.core.commit],
   ['core.version', MAN.core && MAN.core.version]].forEach(([k, v]) => {
    check('el manifiesto declara ' + k, !!v && String(v).trim() !== '',
      'vacío — procedencia INCOMPLETA: este golden no lleva a ningún sitio');
  });

  check('el motivo de la regeneración tiene sustancia (' +
    String(MAN.motivo || '').length + ' caracteres)',
    String(MAN.motivo || '').trim().length >= 20,
    'un golden que se actualiza sin dejar escrito POR QUÉ es un golden que se ' +
    'actualiza para poner el CI verde');

  check('el golden NO se generó sobre un árbol de core sucio',
    MAN.core && MAN.core.sucio === false,
    'con cambios sin commitear en el core, este golden no lo puede reproducir nadie');

  // El sello se calcula sobre los BYTES del fichero con el propio campo vacío:
  // hashear el objeto parseado sería carear `json.dumps` contra
  // `JSON.stringify`, que no escriben los mismos números (0.0 vs 0).
  const mh = CRUDO.match(/"sha256": "([0-9a-f]{64})"/);
  check('el sello del golden está donde se espera', !!mh);
  if (mh) {
    const calc = crypto.createHash('sha256')
      .update(CRUDO.replace(mh[0], '"sha256": ""'), 'utf8').digest('hex');
    check('el golden no se ha editado a mano (sha256 cuadra)', calc === mh[1],
      calc.slice(0, 16) + '… vs ' + mh[1].slice(0, 16) + '…');
  }

  // PIN de la versión del core. No puede comprobarse contra el core de verdad
  // —no está aquí, el generador lo pide con `--core`—, así que se fija: subir
  // el golden a otro core obliga a tocar ESTA línea, y entonces el cambio de
  // física aparece en el diff en vez de colarse en un JSON de 30 KB.
  // Re-medido el 2026-08-26 tras traer main 5cc22b2, que cambio la fisica del
  // comparador en v1.36 (hincas, horizonte acotado) y v1.37 (azimut de la
  // estructura). El hueco JS<->core NO se movio: sigue en 1,36 % de POA
  // (fija_ew) y 0,367 pp de delta, asi que las tolerancias se quedan donde
  // estaban. Lo unico que cambia es contra que core esta sellado el golden.
  /* Re-fijado el 2026-08-26 al regenerar contra `origin/main` limpio.
     El pin anterior decía v1.70.0 / f67c555 y NINGUNO de los dos existe:
     el core de `main` es v1.69.0 y ese commit no está en SolarGPTfull —
     `git fetch origin f67c555` da «couldn't find remote ref». O sea que el
     golden venía sellado contra una rama que nunca aterrizó, con un número
     de versión que tampoco. Las CIFRAS sí cuadraban, porque la física que
     aquella rama traía acabó entrando por otro camino (CROSS-TILT-01); lo
     que mentía era la etiqueta, que es justo lo que este pin existe para
     que no pase. */
  const CORE_PIN = { version: '1.69.0', commit: 'ce3701c0' };
  check('el golden corresponde al core fijado (v' + CORE_PIN.version + ')',
    MAN.core.version === CORE_PIN.version,
    'golden v' + MAN.core.version + ' vs pin v' + CORE_PIN.version +
    ' — si has regenerado contra otro core, actualiza CORE_PIN y di en el ' +
    'cuerpo del PR qué se movió y por qué');
  check('y al commit fijado (' + CORE_PIN.commit + ')',
    String(MAN.core.commit).startsWith(CORE_PIN.commit),
    String(MAN.core.commit).slice(0, 8) + ' vs ' + CORE_PIN.commit);
}

// ── 2) el catálogo del JS es el del core ──
const fix = JSON.parse(fs.readFileSync(path.join(__dirname, 'careo-estructuras.json'), 'utf8'));
const clavesJS = FIS.CATALOGO.map(s => s.key).sort();
check('el catálogo del JS es el del core (' + clavesJS.length + ')',
  JSON.stringify(clavesJS) === JSON.stringify(fix.core.catalogo.slice().sort()),
  clavesJS.join(',') + ' vs ' + fix.core.catalogo.join(','));

/* ── 2a) el golden dice DE DÓNDE sale ──────────────────────────────────────
   `gen_careo_estructuras.py` recibe el core como una RUTA LOCAL (`--core`), así
   que el resultado depende de lo que tuviera comprobado quien lo generó. Sin
   dejar constancia, un golden viejo es indistinguible de uno al día: el
   2026-08-21 el core corrigió la sombra del circunsolar por la mañana y este
   fixture se regeneró por la tarde desde un checkout anterior — se quedó una
   física por detrás del core Y del portal, y el careo siguió en verde porque
   la deriva cabía de sobra en la tolerancia.
   Esto no detecta que el golden esté viejo (para eso está el guard del lado
   del core, que sí tiene el core delante); detecta que no se pueda ni saberlo. */
const proc = fix.procedencia;
check('el golden declara su procedencia', !!proc);
check('...y de qué commit del core salió',
  !!(proc && /^[0-9a-f]{40}$/.test(proc.core_commit || '')),
  proc && proc.core_descripcion);
check('...y con qué pvlib, que la física vive ahí',
  !!(proc && proc.pvlib), proc && ('pvlib ' + proc.pvlib));
check('...y que el core NO tenía cambios sin commitear al generarlo',
  !!(proc && proc.core_limpio === true),
  proc && proc.core_limpio === false ? 'generado sobre un árbol sucio: irreproducible' : '');

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

// ── 5) magnitudes, con la tolerancia JUSTIFICADA ──────────────────────────
// PORTAL-BUG-01: las tolerancias eran 8 % y 2,5 pp, y NO son un número redondo
// elegido por prudencia — son seis veces el hueco que el careo tiene de verdad,
// y esa holgura fue la que dejó pasar cinco días una deriva de física. Medido
// sobre este mismo fixture:
//
//   hueco REAL JS↔core (Hay-Davies vs Perez, sin IAM)  POA 1,365 %  ·  Δ% 0,367 pp
//   deriva que introdujo el core v1.64                  POA 0,994 %  ·  Δ% 1,120 pp
//   tolerancia anterior                                 POA 8,000 %  ·  Δ% 2,500 pp
//
// De ahí salen las dos cifras, y una limitación que va DICHA:
//
//   · Δ% → 0,80 pp. Es 2,2× el hueco real, y habría cazado la deriva de 1,12 pp.
//     Es el eje que discrimina, porque el Δ% se mide contra la misma referencia
//     en los dos motores y buena parte del sesgo del modelo se cancela.
//   · POA → 2,5 %. Es 1,8× el hueco real. **No puede cazar esta clase de
//     deriva**: los 0,994 % que movió v1.64 caben por debajo del 1,365 % que
//     separa a Hay-Davies de Perez. Apretarla más sería un test que se pone
//     rojo por el modelo, no por un bug. Se declara en vez de fingir que cubre
//     lo que no cubre.
const TOL_POA = 0.025, TOL_DELTA = 0.80;
// Hueco medido con el golden al día. Si alguien afloja las tolerancias, esto
// enseña contra qué se están comparando.
const HUECO_MEDIDO = { poa_pct: 1.365, delta_pp: 0.367 };
check('la tolerancia de Δ% no es gratuita: ' + TOL_DELTA + ' pp sobre un hueco real de ' +
  HUECO_MEDIDO.delta_pp + ' pp (×' + (TOL_DELTA / HUECO_MEDIDO.delta_pp).toFixed(1) + ')',
  TOL_DELTA / HUECO_MEDIDO.delta_pp < 3.0,
  'con más de ×3 de holgura la comprobación deja de vigilar la física');
check('la tolerancia de POA tampoco: ' + (TOL_POA * 100).toFixed(1) + ' % sobre ' +
  HUECO_MEDIDO.poa_pct + ' % (×' + (TOL_POA * 100 / HUECO_MEDIDO.poa_pct).toFixed(1) + ')',
  TOL_POA * 100 / HUECO_MEDIDO.poa_pct < 3.0);

C.structures.forEach(k => {
  const a = js[k], b = core[k];
  if (!a || !b) { check('falta ' + k, false); return; }
  const dPoa = Math.abs(a.neta / b.poa_kwh_m2 - 1);
  check('POA de ' + k + ' dentro del ' + (TOL_POA * 100).toFixed(1) + ' % (' + (dPoa * 100).toFixed(2) + ' %)',
    dPoa < TOL_POA, a.neta.toFixed(1) + ' vs ' + b.poa_kwh_m2.toFixed(1));
  const dDelta = Math.abs(a.delta - b.delta_pct);
  check('Δ% de ' + k + ' dentro de ' + TOL_DELTA + ' pp (' + dDelta.toFixed(3) + ' pp)',
    dDelta < TOL_DELTA, a.delta.toFixed(2) + ' vs ' + b.delta_pct.toFixed(2));
});

// ── 5b) DÓNDE se separan, no sólo QUE se separan ──────────────────────────
// El protocolo de PORTAL-BUG-01 pedía comparar los outputs INTERMEDIOS y
// localizar el PRIMER punto de divergencia. Este banco comparaba POA y Δ%
// finales, y el 2026-08-26 eso costó caro: cuando el core y la ficha se
// separaron, lo único que supo decir fue «el Δ% no cuadra» — y de ahí se
// dedujo, mal, que la ficha enseñaba física vieja. Fallaba el core: el
// backtracking no llevaba la pendiente (CROSS-TILT-01).
//
// La cadena se recorre EN ORDEN y se corta en la primera etapa que se separa:
// una etapa mala arrastra todas las siguientes, y enumerarlas esconde al
// culpable entre sus consecuencias.
//
// HUECO DECLARADO, y es la mitad de la cadena: el motor de la ficha publica
// `ideal`, `sombra` y `neta`, pero NO el ángulo ni el desglose de difusa. O
// sea que desde este lado se puede localizar entre esas tres, y no antes. El
// ángulo —que es justo lo que habría resuelto el caso de hoy— sólo se carea
// desde el core, en `test_careo_comparador_golden.py`. Para cerrarlo del todo
// habría que publicar θ desde el bloque FÍSICA PURA, y ese bloque está fijado
// por hash: mover el pin es una decisión aparte, no un efecto colateral de
// este banco.
const ETAPAS_JS = [
  ['poa_ideal_sin_sombra', a => a.ideal, b => b.poa_ideal_kwh_m2, 'kWh/m²', TOL_POA, true],
  ['sombra', a => a.sombra, b => b.sombra_pct, 'pp', 0.8, false],
  ['poa_neta', a => a.neta, b => b.poa_kwh_m2, 'kWh/m²', TOL_POA, true],
];
C.structures.forEach(k => {
  const a = js[k], b = core[k];
  if (!a || !b) return;
  let culpable = null;
  for (const [nombre, fjs, fcore, ud, tol, relativa] of ETAPAS_JS) {
    const x = fjs(a), y = fcore(b);
    if (x == null || y == null) continue;
    const d = relativa ? Math.abs(x / y - 1) : Math.abs(x - y);
    if (d >= tol) { culpable = { nombre, x, y, d, ud, relativa }; break; }
  }
  check('la cadena de ' + k + (culpable ? ' se separa en «' + culpable.nombre + '»' : ' cuadra etapa por etapa'),
    culpable === null,
    culpable ? ('JS ' + culpable.x.toFixed(3) + ' vs core ' + culpable.y.toFixed(3) +
                ' (' + (culpable.relativa ? (culpable.d * 100).toFixed(2) + ' %' : culpable.d.toFixed(3) + ' pp') +
                '). Las etapas anteriores cuadran, así que la divergencia NACE aquí.') : '');
});
// Y el zombi: si la cadena no supiera cortar en la primera, esto no probaría
// nada. Se le da una cadena con la etapa 1 mala y la 3 peor, y tiene que
// nombrar la 1.
{
  const falsoJs = { ideal: 110, sombra: 0.2, neta: 50 };
  const falsoCore = { poa_ideal_kwh_m2: 100, sombra_pct: 0.2, poa_kwh_m2: 100 };
  let primera = null;
  for (const [nombre, fjs, fcore, , tol, relativa] of ETAPAS_JS) {
    const d = relativa ? Math.abs(fjs(falsoJs) / fcore(falsoCore) - 1)
                       : Math.abs(fjs(falsoJs) - fcore(falsoCore));
    if (d >= tol) { primera = nombre; break; }
  }
  check('ZOMBI: con dos etapas malas, la cadena nombra la PRIMERA',
    primera === 'poa_ideal_sin_sombra', 'nombró ' + primera);
}

// ── 5a) CENTINELA de PORTAL-BUG-01 ────────────────────────────────────────
// Los números del golden VIEJO (core v1.63, antes de que la sombra tapara el
// circunsolar). Con la tolerancia de entonces pasaban; con la de ahora tienen
// que caer. Sin esto, apretar las tolerancias sería una afirmación sin medir:
// esto es la prueba de que la puerta que se dejó abierta ya no lo está.
const GOLDEN_VIEJO_v163 = {
  fija_optima: { poa: 84.9623, delta: 0.0 },
  fija_proyecto: { poa: 83.2087, delta: -2.0641 },
  fija_ew: { poa: 69.0831, delta: -18.6897 },
  tracker_hsat: { poa: 93.5703, delta: 10.1315 },
  tracker_hsat_nobt: { poa: 96.7986, delta: 13.9312 },
  tracker_tsat: { poa: 100.0250, delta: 17.7287 },
};
const cazadas = C.structures.filter(k => {
  const v = GOLDEN_VIEJO_v163[k], b = core[k];
  return Math.abs(v.delta - b.delta_pct) >= TOL_DELTA ||
         Math.abs(v.poa / b.poa_kwh_m2 - 1) >= TOL_POA;
});
// Y aquí va un límite MEDIDO, no una promesa: de las seis estructuras, la
// tolerancia de hoy solo caza `tracker_hsat_nobt`, que es la de deriva mayor
// (1,120 pp). Las otras dos con sombra —`tracker_hsat` 0,499 pp y
// `tracker_tsat` 0,448 pp— se quedan por debajo del listón, y **no se puede
// bajar más**: el hueco irreducible entre Hay-Davies y Perez es 0,367 pp, así
// que cazarlas dejaría ×1,3 de holgura y el careo se pondría rojo por el
// modelo en vez de por un bug.
//
// Lo que esto SÍ garantiza: que una deriva de esta clase pone el careo en ROJO.
// Con una basta para parar el merge, que es para lo que existe. Escrito así
// —con el número— para que nadie lea «la tolerancia cubre la deriva» y se
// quede tranquilo con las otras dos.
//
// (Esta comprobación se escribió prediciendo ≥2 y salió 1. Se corrige la
// predicción, no el listón.)
check('CENTINELA: la tolerancia de hoy CAZA el golden viejo de v1.63 (' +
  cazadas.length + ' de ' + C.structures.length + ' estructuras: ' +
  (cazadas.join(', ') || '—') + ')',
  cazadas.length >= 1, 'ninguna — la deriva volvería a colarse entera');
// Y el mutante del centinela: con la tolerancia ANTERIOR no cazaba ninguna, que
// es exactamente lo que pasó. Si esto falla, el centinela no mide lo que dice.
const cazadasAntes = C.structures.filter(k => {
  const v = GOLDEN_VIEJO_v163[k], b = core[k];
  return Math.abs(v.delta - b.delta_pct) >= 2.5 ||
         Math.abs(v.poa / b.poa_kwh_m2 - 1) >= 0.08;
});
check('MUTANTE del centinela: con la tolerancia ANTERIOR (8 % / 2,5 pp) no cazaba ninguna',
  cazadasAntes.length === 0, 'cazaba ' + cazadasAntes.join(', '));

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
// Esto medía lo contrario hasta SolarGPT v1.70.0: el ángulo se calculaba en
// llano y con pendiente quedaba un 3,7 % de sombra residual. Ahora el core lleva
// `cross_axis_tilt` (pvlib), la ficha también, y el backtracking sigue haciendo
// su trabajo en cuesta.
check('con pendiente (' + C.cross_axis_slope_deg + '°) el backtracking SIGUE quitando la ' +
  'sombra (' + js.tracker_hsat.sombra.toFixed(2) + ' %): el ángulo va con la pendiente',
  js.tracker_hsat.sombra < 0.5);
/* 1,0 pp absoluto sobre una sombra de ~4 % era un 25 % relativo de aire: la
   deriva que se coló medía 0,44 pp. Lo medido hoy contra el core al día es
   0,07 pp. */
check('y esa sombra —la que quede— es la que dice el core (' + core.tracker_hsat.sombra_pct.toFixed(2) + ' %)',
  Math.abs(js.tracker_hsat.sombra - core.tracker_hsat.sombra_pct) < 0.5,
  js.tracker_hsat.sombra.toFixed(2) + ' vs ' + core.tracker_hsat.sombra_pct.toFixed(2));
// y en LLANO sí se va a cero, que es la razón de ser del backtracking
const llano = FIS.compara(['tracker_hsat', 'tracker_hsat_nobt'], M, { ...cfg, pend: 0 });
const llanoBt = llano.filas.find(f => f.key === 'tracker_hsat');
check('en terreno LLANO el backtracking sí deja la sombra a cero (' +
  llanoBt.sombra.toFixed(3) + ' %)', llanoBt.sombra < 0.5, llanoBt.sombra.toFixed(3));
check('y la pendiente ya no lo estropea (' + llanoBt.sombra.toFixed(2) + ' → ' +
  js.tracker_hsat.sombra.toFixed(2) + ' %)',
  js.tracker_hsat.sombra < llanoBt.sombra + 0.5);
/* El guardia del guard: si el SOMBREADO hubiera dejado de ver la pendiente, la
   comprobación de arriba daría verde por la razón equivocada. Sin backtracking
   la pendiente tiene que seguir notándose. */
const llanoNb = llano.filas.find(f => f.key === 'tracker_hsat_nobt');
check('sin backtracking la pendiente SÍ se sigue notando (' + llanoNb.sombra.toFixed(2) +
  ' → ' + js.tracker_hsat_nobt.sombra.toFixed(2) + ' %)',
  js.tracker_hsat_nobt.sombra > llanoNb.sombra + 0.3,
  llanoNb.sombra.toFixed(2) + ' vs ' + js.tracker_hsat_nobt.sombra.toFixed(2));
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
// Al seguidor esa misma pendiente no le entra ⊥ —le entra a lo largo del eje—,
// así que no le cambia el `cross_axis_slope`. Lo que sí le cambia es el EJE: un
// eje norte-sur sobre un terreno que cae norte-sur no es horizontal.
check('  al seguidor esa pendiente no le entra ⊥: su cross-axis sigue en cero',
  Math.abs(FIS.cruz({ ...cfg, pend: 16, pendAz: 180 }, TK)) < 1e-9);
check('  pero sí le inclina el EJE, y eso mueve su POA (' +
  llanoAz.tracker_hsat_nobt.neta.toFixed(1) + ' → ' +
  caeSur.tracker_hsat_nobt.neta.toFixed(1) + ' kWh/m²)',
  caeSur.tracker_hsat_nobt.neta > llanoAz.tracker_hsat_nobt.neta + 1,
  [llanoAz.tracker_hsat_nobt.neta, caeSur.tracker_hsat_nobt.neta].join(' vs '));
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
// Y lo lleva TODO seguidor, no solo el que el catálogo llama TSAT: un eje
// norte-sur sobre un terreno que cae norte-sur sigue el terreno, y entonces está
// inclinado. Mientras esto era solo del TSAT, la escena dibujaba el eje del HSAT
// siguiendo el terreno y la física lo calculaba plano.
check('lo lleva TODO seguidor, no solo el que se llama TSAT',
  Math.abs(FIS.ejeTilt({ pend: 26, pendAz: 180, lat: 37.4 },
                       FIS.spec('tracker_hsat')) - 26) < 0.01);
check('y una fija no: no tiene eje que inclinar',
  FIS.ejeTilt({ pend: 26, pendAz: 180, lat: 37.4 }, FIJA) === 0 &&
  FIS.ejeTilt({ pend: 26, pendAz: 180, lat: 37.4 }, EW) === 0);
// La consecuencia, que hay que ver venir: con pendiente a lo largo del eje, el
// HSAT y el TSAT son la MISMA estructura y dan lo mismo.
const nsSur = FIS.compara(['tracker_hsat', 'tracker_tsat'], M,
  { ...cfg, pend: 12, pendAz: 180 });
const nsLlano = FIS.compara(['tracker_hsat', 'tracker_tsat'], M,
  { ...cfg, pend: 0, pendAz: 180 });
check('con el terreno cayendo a lo largo del eje, HSAT y TSAT coinciden: ' +
  'son la misma estructura',
  Math.abs(nsSur.filas[0].neta - nsSur.filas[1].neta) < 1e-9,
  nsSur.filas.map(f => f.key + ':' + f.neta.toFixed(2)).join(' '));
check('y en llano también, porque el eje lo pone el terreno y no hay',
  Math.abs(nsLlano.filas[0].neta - nsLlano.filas[1].neta) < 1e-9,
  nsLlano.filas.map(f => f.key + ':' + f.neta.toFixed(2)).join(' '));
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
