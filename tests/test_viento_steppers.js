// DOS CABEZAS PARA UNA REGLA — el careo que faltaba, y la que se había quedado
// atrás.
//
// El abanderamiento está implementado DOS VECES en esta ficha, a propósito:
//
//   · `LOC.dual` / `LOC.pasivo` resuelven la serie ENTERA de una vez, y de
//     ellas salen las horas, los episodios y la POA del informe;
//   · `LOC.stepper` / `LOC.stepperPasivo` son máquinas paso a paso para el
//     panel EN VIVO, que no tiene la serie: recibe un instante cada vez.
//
// Las dos formas hacen falta y ninguna puede desaparecer. Lo que no puede
// pasar es que DIVERJAN, porque entonces la pantalla enseña una maniobra y el
// informe cuenta otra. Nada lo comprobaba.
//
// LO QUE SE ENCONTRÓ AL CAREARLAS
// --------------------------------
// `LOC.pasivo` reengancha la fila por CRUCE o por proximidad; su comentario
// documenta que sin el cruce, a paso grueso, el seguimiento pasa por el ángulo
// entre dos muestras y la fila se queda suelta para siempre. `stepperPasivo`
// reenganchaba SOLO por proximidad: la corrección estaba en una cabeza y no en
// la otra. Medido sobre la misma serie a paso de una hora:
//
//     LOC.pasivo         3 pasos sueltos     111000000000000000000000
//     stepperPasivo     24 pasos sueltos     111111111111111111111111
//
// O sea, suelta para siempre en el panel mientras el informe decía que había
// reenganchado. Se alineó la copia con su canon —no es una decisión de diseño,
// es que una de las dos ya llevaba la corrección escrita— y a paso FINO, que es
// el régimen normal, el comportamiento no cambia (44 pasos sueltos antes y
// después).
//
// El paso aquí no es el de la serie sino el salto del reloj simulado, así que
// esto se veía al ARRASTRAR el control de tiempo, no con el reloj corriendo
// solo. Queda dicho porque medir la divergencia de las funciones y afirmar que
// el usuario la sufre a diario son dos cosas distintas, y solo he medido la
// primera.
//
// `LOC.dual` y `LOC.stepper`, en cambio, ya coincidían: 120 pasos con viento
// variado, cero diferencias. Este banco lo fija para que sigan haciéndolo.
//
// Se extrae del HTML real, no se copia (misma regla que test_viento_ejes.js).
//
//   node tests/test_viento_steppers.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const html = fs.readFileSync(path.join(RAIZ, 'sim-viento.html'), 'utf8');
function saca(firma) {
  const i = html.indexOf(firma);
  if (i < 0) return null;
  const j = html.indexOf('\n};', i);
  return j < 0 ? null : html.slice(i, j + 3);
}
// La velocidad de giro se LEE del HTML: tecleada aquí, el careo del lazo
// seguiría verde el día que la ficha cambie el hierro.
const mSlew = html.match(/LOC\.SLEW\s*=\s*([\d.]+)/);
check('la velocidad de giro se lee del HTML, no se teclea', !!mSlew);
const SLEW = mSlew ? Number(mSlew[1]) : 0.17;
const FIRMAS = ['LOC.sign=function(az){', 'LOC.noonFlip=function(sg,th,lim){',
                'LOC.dual=function(thT,ws,az,T1,T2,pmin,full,dtS,holdMin,parkMin,dead,noon){',
                'LOC.single=function(thT,ws,az,T,full,noon){',
                'LOC.pasivo=function(thT,ws,release,side,tol,dtS){',
                'LOC.stepper=function(kind,cfg){',
                'LOC.stepperPasivo=function(cfg){'];
const trozos = FIRMAS.map(saca);
check('las siete funciones siguen en el HTML con esa firma', trozos.every(Boolean),
      FIRMAS.filter((f, i) => !trozos[i]).join(' · '));
if (!trozos.every(Boolean) || !mSlew) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('lo extraído tiene cuerpo (' + trozos.join('').length + ' chars)',
      trozos.join('').length > 3000);

function carga(src) {
  const c = { console, LOC: { D2R: Math.PI / 180, SLEW } };
  vm.createContext(c);
  vm.runInContext(src, c);
  return c.LOC;
}
const LOC = carga(trozos.join('\n'));
check('quedan expuestas las cuatro máquinas',
      ['dual', 'single', 'pasivo', 'stepper', 'stepperPasivo']
        .every(f => typeof LOC[f] === 'function'));

// ── el escenario del careo ────────────────────────────────────────────
// Viento que cruza los DOS umbrales varias veces y θ barriendo de tope a tope:
// hace falta que los dos umbrales, el sector parcial, el aparcado y la
// histéresis se ejerciten, o el careo compararía dos máquinas en reposo.
const T1 = 10, T2 = 20, PMIN = 30, FULL = 60, DEAD = 1, NOON = 0, AZ = 90;
const HOLD_MIN = 10, PARK_MIN = 5;
function escenario(n) {
  const th = [], ws = [], az = [];
  for (let i = 0; i < n; i++) {
    th.push(-55 + 110 * Math.abs(((i % 40) / 20) - 1));
    // La cola de CALMA no es relleno: sin ella la histéresis de 10 min no
    // llega a vencer entre rachas y el escenario no visita IDLE nunca, así
    // que el careo no compararía el camino de vuelta. Lo dijo la comprobación
    // de cobertura de estados, que para eso está.
    ws.push(i >= n - 30 ? 0 : (i % 17 < 6 ? 25 : (i % 9 < 4 ? 15 : 0)));
    az.push(AZ);
  }
  return { th, ws, az };
}
const cfgStep = dtS => ({ full: FULL, pmin: PMIN, T1, T2, holdS: HOLD_MIN * 60,
                          parkS: PARK_MIN * 60, dead: DEAD, noon: NOON });

// ══════════════════════════════════════════════════════════════════════
//  1) CAREO dual ↔ stepper
// ══════════════════════════════════════════════════════════════════════
// Se comparan el MODO y la ORDEN, no el ángulo ejecutado: el stepper además
// pasa la orden por el lazo de giro, y `dual` no lo hace. Comparar `theta`
// sería carear dos cosas distintas y la diferencia no significaría nada.
function careoDual(dtS, n, LL) {
  const L = LL || LOC, { th, ws, az } = escenario(n);
  const D = L.dual(Float64Array.from(th), Float64Array.from(ws), Float64Array.from(az),
                   T1, T2, PMIN, FULL, dtS, HOLD_MIN, PARK_MIN, DEAD, NOON);
  const S = L.stepper('2', cfgStep(dtS));
  let modos = 0, ordenes = 0, primera = -1;
  for (let i = 0; i < n; i++) {
    const r = S.step(th[i], ws[i], az[i], dtS);
    if (r.mode !== D.mode[i]) { modos++; if (primera < 0) primera = i; }
    if (Math.abs(r.orden - D.theta[i]) > 1e-9) { ordenes++; if (primera < 0) primera = i; }
  }
  return { modos, ordenes, primera };
}
[[60, 120], [300, 80], [900, 60]].forEach(function (c) {
  const [dtS, n] = c;
  const r = careoDual(dtS, n);
  check('a paso de ' + (dtS / 60) + ' min, dual y stepper dan el MISMO modo y la MISMA orden',
        r.modos === 0 && r.ordenes === 0,
        r.modos + ' modos y ' + r.ordenes + ' órdenes distintos, la primera en el paso ' + r.primera);
});
// Y que el escenario EJERCITA las dos máquinas: un careo entre dos cosas
// paradas sale verde sin medir nada.
(function () {
  const { th, ws, az } = escenario(120);
  const D = LOC.dual(Float64Array.from(th), Float64Array.from(ws), Float64Array.from(az),
                     T1, T2, PMIN, FULL, 60, HOLD_MIN, PARK_MIN, DEAD, NOON);
  const vistos = {};
  D.mode.forEach(m => { vistos[m] = (vistos[m] || 0) + 1; });
  check('el escenario visita los cuatro estados, no compara dos máquinas paradas',
        ['IDLE', 'PARTIAL_STOW', 'FULL_STOW', 'DESTOW_HOLD'].every(m => vistos[m] > 0),
        JSON.stringify(vistos));
})();

// ══════════════════════════════════════════════════════════════════════
//  2) CAREO pasivo ↔ stepperPasivo — el que encontró la divergencia
// ══════════════════════════════════════════════════════════════════════
const REL = 25, LADO = -30, TOL = 1;
function careoPasivo(dtS, th, ws, LL) {
  const L = LL || LOC;
  const A = L.pasivo(Float64Array.from(th), Float64Array.from(ws), REL, LADO, TOL, dtS);
  const S = L.stepperPasivo({ pSide: LADO, pTol: TOL, pRel: REL, full: FULL });
  const m = [];
  for (let i = 0; i < th.length; i++) m.push(S.step(th[i], ws[i], dtS).mode === 'SUELTA' ? 1 : 0);
  return { serie: Array.from(A.mask).join(''), stepper: m.join('') };
}
// RÉGIMEN FINO: el normal. Aquí las dos coincidían ya.
const finoTh = [], finoWs = [];
for (let i = 0; i < 200; i++) { finoTh.push(-55 + 110 * i / 200); finoWs.push(i < 10 ? 30 : 0); }
const fino = careoPasivo(60, finoTh, finoWs);
check('a paso fino, pasivo y stepperPasivo sueltan y reenganchan igual',
      fino.serie === fino.stepper,
      fino.serie + '\n       ' + fino.stepper);

// RÉGIMEN GRUESO: el que separaba las dos cabezas. θ salta 11° por paso y
// CRUZA el lado sin que ninguna muestra caiga dentro de la tolerancia.
const gruesoTh = [], gruesoWs = [];
for (let i = 0; i < 24; i++) { gruesoTh.push(-55 + 11 * i); gruesoWs.push(i < 3 ? 30 : 0); }
const grueso = careoPasivo(3600, gruesoTh, gruesoWs);
check('a paso GRUESO también, que es donde se habían separado',
      grueso.serie === grueso.stepper,
      grueso.serie + '\n       ' + grueso.stepper);
check('y el escenario grueso tiene el mecanismo dentro: ninguna muestra cae en tol',
      gruesoTh.every(t => Math.abs(t - LADO) > TOL),
      'mínima distancia al lado: ' +
      Math.min.apply(null, gruesoTh.map(t => Math.abs(t - LADO))).toFixed(2));
// El anti-oráculo, con el número medido: sin el criterio de cruce el stepper
// se quedaba suelto las 24 horas.
const sinCruce = carga(trozos.join('\n').replace(
  'var cruza=(prev!=null&&suelta&&(prev-side)*(tgt-side)<=0);', 'var cruza=false;'));
const roto = careoPasivo(3600, gruesoTh, gruesoWs, sinCruce);
check('MEDIDO: sin el cruce, el stepper se queda suelto 24 pasos y la serie 3',
      roto.stepper === '1'.repeat(24) && roto.serie === '111' + '0'.repeat(21),
      roto.serie + ' vs ' + roto.stepper);

// ══════════════════════════════════════════════════════════════════════
//  3) CAREO single ↔ stepper de un umbral
// ══════════════════════════════════════════════════════════════════════
(function () {
  const n = 60, { th, ws, az } = escenario(n);
  const U = LOC.single(Float64Array.from(th), Float64Array.from(ws), Float64Array.from(az),
                       T1, FULL, NOON);
  const S = LOC.stepper('1', cfgStep(60));
  let dif = 0;
  for (let i = 0; i < n; i++) {
    const r = S.step(th[i], ws[i], az[i], 60);
    if (r.mode !== U.mode[i] || Math.abs(r.orden - U.theta[i]) > 1e-9) dif++;
  }
  check('single y el stepper de UN umbral también coinciden', dif === 0,
        dif + ' pasos distintos');
})();

// ══════════════════════════════════════════════════════════════════════
//  4) LA ORDEN Y LO EJECUTADO SON DOS COSAS
// ══════════════════════════════════════════════════════════════════════
// El stepper devuelve las dos, y el comentario del código explica por qué: la
// máquina ORDENA ±55 y el hierro tarda ~11 min a 0,17 °/s. Sin la consigna, la
// tarjeta enseñaría «FULL STOW · θ 0,0°» y se leería que el abanderamiento no
// se ha dado. Se ha dado: no ha LLEGADO.
(function () {
  const S = LOC.stepper('2', cfgStep(1));
  const r = S.step(0, 30, AZ, 1);       // un solo segundo de vendaval
  check('en el primer segundo de FULL_STOW la ORDEN ya es el tope',
        r.mode === 'FULL_STOW' && Math.abs(r.orden) === FULL, r.mode + ' ' + r.orden);
  check('y lo EJECUTADO todavía no: el hierro va a su velocidad',
        Math.abs(r.theta) <= SLEW + 1e-9 && Math.abs(r.theta) > 0,
        r.theta + ' (máximo ' + SLEW + '°/s × 1 s)');
  // Y llega, en el tiempo que dice la velocidad: 60/0,17 ≈ 353 s.
  let t = 1;
  while (Math.abs(S.theta) < FULL - 1e-9 && t < 5000) { S.step(0, 30, AZ, 1); t++; }
  check('y llega al tope en el tiempo que marca la velocidad de giro (~' +
        Math.round(FULL / SLEW) + ' s)',
        Math.abs(t - FULL / SLEW) < 3, t + ' s');
})();

// ── MUTANTE ───────────────────────────────────────────────────────────
// Si el careo no distinguiera dos máquinas distintas, no estaría midiendo
// nada. Se rompe UNA de las dos cabezas —el umbral alto del stepper— y se
// exige que el careo lo vea.
const mutado = carga(trozos.join('\n').replace('}else if(ws>T2){', '}else if(ws>T2*2){'));
const rM = careoDual(60, 120, mutado);
check('MUTANTE: con el umbral alto movido en UNA cabeza, el careo lo caza',
      rM.modos > 0 || rM.ordenes > 0,
      rM.modos + ' modos y ' + rM.ordenes + ' órdenes: si fuera 0, el careo no ' +
      'distinguiría las dos máquinas');

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
