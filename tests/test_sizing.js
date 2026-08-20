// Careo del DIMENSIONADO ELÉCTRICO contra el core Python — SIN navegador.
//
// La ficha dimensiona en el navegador para poder abrirse sin levantar nada, y
// eso abre la puerta de siempre: dos motores que dicen cosas distintas y nadie
// mirando. Aquí se cierra igual que con la física — extrayendo el bloque
// «FÍSICA PURA» del comparador-estructuras.html REAL y exigiéndole las MISMAS
// cifras que dio el core en `tests/careo-sizing.json`.
//
// Y aquí la exigencia es EXACTA, no «se parece»: no hay dos modelos de
// transposición discutiendo, hay una cuenta de enteros. Un string de más o de
// menos por MPPT es un unifilar equivocado.
//
// Lo que además se exige, porque es lo que se lee en pantalla:
//   · el `binding` — QUIÉN limita: la potencia, la corriente de operación, la
//     de cortocircuito o el tope del datasheet. Un número de strings sin saber
//     quién lo limita no se puede discutir con nadie.
//   · la `confidence` — `datasheet` si hay límites por MPPT, `cec_derived` si
//     solo hay el Idcmax del catálogo, que es un valor DERIVADO (≈Pdco/Vdco) y
//     por tanto una cota, no la verdad.
//
//   node tests/test_sizing.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

// ── la física del HTML de verdad ──
const html = fs.readFileSync(path.join(RAIZ, 'comparador-estructuras.html'), 'utf8');
const m = html.match(/FÍSICA PURA — inicio[\s\S]*?\*\/([\s\S]*?)\/\* ═+ FÍSICA PURA — fin/);
check('el bloque FÍSICA PURA está delimitado en el HTML', !!m);
if (!m) { console.log('\nFALLOS: 1'); process.exit(1); }
const ctx = { console, module: { exports: {} } };
vm.createContext(ctx);
try { vm.runInContext(m[1], ctx); } catch (e) { check('la física compila en Node', false, e.message); }
const FIS = ctx.FIS;
check('la física exporta el dimensionado', !!(FIS && FIS.strings && FIS.plantaElec && FIS.ventana));
if (!FIS || !FIS.strings) { console.log('\nFALLOS: ' + ko); process.exit(1); }

const fix = JSON.parse(fs.readFileSync(path.join(__dirname, 'careo-sizing.json'), 'utf8'));
const MOD = fix.modulo, INV = fix.inversor, N = fix.mods_por_string;
const P_STR = N * MOD.pmax;

// ── 1) el redondeo de Python, que no es el de JS ──
// `int(round(x))` redondea al PAR en el .5 exacto. Si esto se porta con
// Math.round, el conteo de strings se va de uno en los empates — y los empates
// salen, porque las potencias de módulo e inversor son números redondos.
[[0.5, 0], [1.5, 2], [2.5, 2], [3.5, 4], [-0.5, -0], [24.5, 24], [25.5, 26],
 [1.4, 1], [1.6, 2], [26.0, 26]].forEach(([x, y]) => {
  check('roundPy(' + x + ') = ' + y, Object.is(FIS.roundPy(x), y) || FIS.roundPy(x) === y,
    String(FIS.roundPy(x)));
});

// ── 2) strings por MPPT y por inversor, caso a caso ──
Object.keys(fix.strings).forEach(nombre => {
  const c = fix.strings[nombre], e = c._entrada;
  const js = FIS.strings({
    imp: e.imp_module_a, isc: e.isc_module_a, pString: e.p_string_w,
    paco: e.paco_w, target: e.target_dc_ac, nMppt: e.n_mppt,
    iMppt: e.i_mppt_max_a, iscMppt: e.isc_mppt_max_a,
    topeMppt: e.strings_per_mppt_max, idcmax: e.idcmax_total_a });
  const par = [
    ['por potencia', js.porPotencia, c.strings_by_power],
    ['por corriente', js.porCorriente, c.strings_by_current],
    ['recomendados', js.recomendados, c.strings_recommended],
    ['por MPPT', js.porMppt, c.strings_per_mppt],
  ];
  par.forEach(([q, a, b]) => check('[' + nombre + '] ' + q + ' = ' + b, a === b, String(a)));
  check('[' + nombre + '] manda «' + c.binding + '»', js.manda === c.binding, js.manda);
  check('[' + nombre + '] confianza «' + c.confidence + '»', js.confianza === c.confidence, js.confianza);
  check('[' + nombre + '] DC/AC = ' + c.dc_ac_recommended,
    Math.abs(js.dcac - c.dc_ac_recommended) < 1e-9, String(js.dcac));
});

// ── 3) la planta entera ──
Object.keys(fix.planta).forEach(nombre => {
  const c = fix.planta[nombre], e = c._entrada;
  const js = FIS.plantaElec({
    modo: (e.mode === 'from_modules' ? 'modulos' : 'mwp'),
    mwp: e.mwp_target, nModulos: e.n_modules, wp: e.wp_module,
    modsString: e.mods_per_string, invKw: e.inv_pnom_ac_kw,
    invMaxKw: e.inv_pmax_ac_kw, target: e.dc_ac_target, redMw: e.pgrid_max_mw });
  [['strings totales', js.strings, c.n_strings_total],
   ['módulos', js.modulos, c.n_modules_used],
   ['inversores', js.inversores, c.n_inverters],
   ['strings por inversor', js.stringsPorInv, c.strings_per_inverter],
   ['resto de módulos', js.resto, c.remainder_modules],
   ['MWp', js.mwp, c.mwp_actual],
   ['kWp DC', js.dcKwp, c.pnom_dc_kwp],
   ['kW AC nominal', js.acKw, c.pnom_ac_kw],
   ['kW AC máximo', js.acMaxKw, c.pnom_ac_max_kw],
   ['DC/AC', js.dcac, c.dc_ac_ratio],
   ['clipping de red %', js.clipRedPct, c.clipping_vs_grid_pct],
  ].forEach(([q, a, b]) => check('[planta ' + nombre + '] ' + q + ' = ' + b,
    Math.abs(a - b) < 1e-9, String(a)));
  check('[planta ' + nombre + '] limitada por red = ' + c.grid_limited,
    js.limitadaPorRed === c.grid_limited, String(js.limitadaPorRed));
});

// ── 4) la ventana de tensión ──
// No está en el core (vivía dentro de la página 5 del Streamlit), así que las
// cifras están calculadas A MANO con la convención bankable: βVmp = 1,15·βVoc,
// Voc en el día más frío contra Vdcmax y Vmp en el más caliente contra el
// suelo de la ventana MPPT.
//   βVoc = -0,25 %/°C → βVmp = -0,2875 %/°C
//   Voc(-10°C) = 41,5 · (1 + (-0,25/100)·(-35)) = 41,5 · 1,0875   = 45,13125 V
//   Vmp( 70°C) = 34,7 · (1 + (-0,2875/100)·(45)) = 34,7 · 0,870625 = 30,2107 V
//   Vmp(-10°C) = 34,7 · (1 + (-0,2875/100)·(-35)) = 34,7 · 1,100625 = 38,1917 V
//   N_min = ceil(500 / 30,2107)  = ceil(16,55) = 17
//   N_maxVdc  = floor(1500 / 45,13125) = floor(33,24) = 33
//   N_maxMppt = floor(1500 / 38,1917) = floor(39,28) = 39
//   N_max = min(33, 39) = 33  → manda Vdcmax
const V = FIS.ventana({ voc: MOD.voc, vmp: MOD.vmp, betaVocPct: -0.25,
  tMin: -10, tMax: 70, mpptLow: INV.mppt_low, mpptHigh: INV.mppt_high,
  vdcMax: INV.vdcmax });
check('ventana: βVmp = 1,15·βVoc = -0,2875 %/°C', Math.abs(V.betaVmpPct + 0.2875) < 1e-12);
check('ventana: Voc en frío = 45,13125 V', Math.abs(V.vocFrio - 45.13125) < 1e-6, V.vocFrio.toFixed(5));
check('ventana: Vmp en caliente = 30,2107 V', Math.abs(V.vmpCaliente - 30.2107) < 1e-4, V.vmpCaliente.toFixed(4));
check('ventana: Vmp en frío = 38,1917 V', Math.abs(V.vmpFrio - 38.1917) < 1e-4, V.vmpFrio.toFixed(4));
check('ventana: N mínimo = 17 (el suelo del MPPT en el día más caliente)', V.nMin === 17, String(V.nMin));
check('ventana: N máximo por Vdcmax = 33', V.nMaxVdc === 33, String(V.nMaxVdc));
check('ventana: N máximo por MPPT alto = 39', V.nMaxMppt === 39, String(V.nMaxMppt));
check('ventana: manda el más restrictivo (33, por Vdcmax)',
  V.nMax === 33 && V.mandaArriba === 'vdcmax');
check('ventana: 17..33 es viable', V.viable === true);
// el string elegido escala linealmente
const S = FIS.stringV(26, V);
check('string de 26: Voc en frío = 1173,4 V (bajo los 1500 del inversor)',
  Math.abs(S.vocFrio - 26 * 45.13125) < 1e-6 && S.vocFrio < INV.vdcmax);
check('string de 26: Vmp en caliente = 785,5 V (por encima del suelo MPPT)',
  Math.abs(S.vmpCaliente - 26 * 30.2107) < 1e-3 && S.vmpCaliente > INV.mppt_low);

// ── 4b) LAS TEMPERATURAS DEL EMPLAZAMIENTO ──
// El string se dimensiona por los dos extremos térmicos del SITIO, y teclear
// -10/70 a ojo es dimensionar otro sitio. Convención bankable (IEC 62548), la
// misma que la página 5 del Streamlit: P0,5 del aire para el frío y P99,5 del
// aire + 25 °C de delta de célula para el calor.
//
// El percentil se interpola linealmente entre las dos muestras que lo rodean,
// que es lo que hace `pandas.Series.quantile` por defecto — o sea, la cifra
// contra la que se compara. Las de aquí están calculadas A MANO.
//   serie 0..100 (101 muestras): i = 100·p
//   P0,5  → i = 0.5  → 0 + (1-0)·0.5  = 0.5
//   P99,5 → i = 99.5 → 99 + (100-99)·0.5 = 99.5
const cien = Array.from({ length: 101 }, (_, i) => i);
check('percentil 0,5 de 0..100 = 0,5 (interpolado, como pandas)',
  Math.abs(FIS.percentil(cien, 0.005) - 0.5) < 1e-12, String(FIS.percentil(cien, 0.005)));
check('percentil 99,5 de 0..100 = 99,5',
  Math.abs(FIS.percentil(cien, 0.995) - 99.5) < 1e-12, String(FIS.percentil(cien, 0.995)));
check('la mediana de 0..100 es 50', Math.abs(FIS.percentil(cien, 0.5) - 50) < 1e-12);
check('el percentil no depende del orden de entrada',
  Math.abs(FIS.percentil(cien.slice().reverse(), 0.005) - 0.5) < 1e-12);
check('los NaN no cuentan (una hora sin dato no es 0 °C)',
  Math.abs(FIS.percentil([NaN, 0, NaN, 100], 0.5) - 50) < 1e-12,
  String(FIS.percentil([NaN, 0, NaN, 100], 0.5)));
check('sin ninguna muestra buena devuelve NaN, no un cero con pinta de dato',
  !isFinite(FIS.percentil([NaN, NaN], 0.5)));

const TP = FIS.tempsProyecto(cien);
check('T mín de célula = el P0,5 del aire, SIN sumar nada (0,5 °C)',
  Math.abs(TP.tMin - 0.5) < 1e-9, String(TP.tMin));
check('T máx de célula = P99,5 del aire + 25 °C de delta (124,5 °C)',
  Math.abs(TP.tMax - 124.5) < 1e-9, String(TP.tMax));
check('publica también el aire crudo, para poder discutirlo',
  TP.aireMin === 0.5 && TP.aireMax === 99.5 && TP.delta === 25, JSON.stringify(TP));
check('sin temperaturas devuelve null en vez de inventarse un rango',
  FIS.tempsProyecto([NaN, NaN]) === null);
// y el resultado entra en la ventana: más frío = menos módulos por string
const vFrio = FIS.ventana({ voc: MOD.voc, vmp: MOD.vmp, betaVocPct: -0.25,
  tMin: -20, tMax: 70, mpptLow: INV.mppt_low, mpptHigh: INV.mppt_high, vdcMax: INV.vdcmax });
check('un emplazamiento más frío recorta el máximo de módulos por string (' +
  V.nMax + ' → ' + vFrio.nMax + ')', vFrio.nMax < V.nMax);

// ── 5) que la ventana se declare INVIABLE cuando lo es ──
// Un módulo de mucha tensión con un inversor de poca: el mínimo por MPPT sale
// por encima del máximo por Vdcmax y no hay ningún N que valga. Devolver un
// número ahí sería inventarse un unifilar.
const mala = FIS.ventana({ voc: 41.5, vmp: 34.7, betaVocPct: -0.25, tMin: -10, tMax: 70,
  mpptLow: 1000, mpptHigh: 1100, vdcMax: 1100 });
check('ventana imposible: se declara inviable en vez de devolver un N',
  mala.viable === false && mala.nMin > mala.nMax, JSON.stringify(mala));

// ── 6) el caso «ni un string entra en un MPPT» ──
// No es un redondeo: es una pareja módulo/inversor que no existe. El core lo
// declara y aquí también.
const cero = FIS.strings({ imp: MOD.imp, isc: MOD.isc, pString: P_STR,
  paco: INV.paco, target: 1.2, nMppt: 6, iMppt: 5.0 });
check('un MPPT que no admite ni un string se declara inviable',
  cero.inviable === true && cero.recomendados === 0, JSON.stringify(cero));

// ── 7) el NEC 690.8 NO recorta strings ──
// Es la decisión declarada del core: Isc×1.25 dimensiona cableado y
// protecciones, no la capacidad de entrada del inversor. Aplicarlo aquí
// recortaba ~22 % de planta sin razón física. Si alguien lo mete, este check
// se pone rojo: con Isc 18,5 A y 60 A por MPPT salen 3 strings, no 2.
const sinNec = FIS.strings({ imp: MOD.imp, isc: MOD.isc, pString: P_STR,
  paco: INV.paco, target: 1.5, nMppt: 6, iscMppt: 60.0 });
check('el NEC 690.8 no entra en el conteo de strings (3/MPPT, no 2)',
  sinNec.porMppt === 3, String(sinNec.porMppt));

console.log('\n' + (ko ? 'FALLOS: ' + ko + ' (de ' + (ok + ko) + ')' : 'OK — ' + ok + '/' + ok + ' comprobaciones'));
process.exit(ko ? 1 : 0);
