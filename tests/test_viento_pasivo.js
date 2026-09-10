// LA FILA QUE SE SUELTA SOLA — y las tres correcciones que nadie comprobaba.
//
// `LOC.pasivo` es el desembrague MECÁNICO de la fila de perímetro: por encima
// de un umbral de viento el embrague cede, la fila cae a su tope y se queda
// ahí hasta que el seguimiento vuelve a pasar por ese ángulo. No es una
// estrategia de control —nadie la manda— y de ella salen las horas y los
// episodios que el informe publica.
//
// MEDIDO ANTES DE ESCRIBIR ESTE FICHERO: `LOC.pasivo` no aparecía en ningún
// arnés, y un mutante que le quita el reenganche por CRUCE mató CERO contra
// los nueve arneses de viento.
//
// Y hay algo peor que la ausencia de cobertura: su cuerpo lleva TRES
// correcciones documentadas en comentarios, cada una con su número medido, y
// ninguna tenía prueba. Un comentario que narra un bug arreglado y no tiene
// banco detrás va camino de mentir — porque el día que alguien reordene esas
// líneas, el comentario seguirá diciendo que están en orden.
//
//   1. el ORDEN: primero el reenganche, después la suelta. Al revés, con
//      viento sostenido la fila se reengancha y pasa un paso entero en
//      seguimiento antes de soltarse otra vez, en pleno vendaval.
//   2. el reenganche por CRUCE y no solo por proximidad. Con `tol` de 1° y
//      paso grueso, el seguimiento PASA por el ángulo entre dos muestras sin
//      que ninguna caiga dentro de la tolerancia.
//   3. un episodio termina cuando la fila se engancha DE VERDAD, no cuando se
//      cumple la condición geométrica.
//
// Las tres se ejercitan abajo con su régimen, y la 2 con su número: sobre el
// mismo viento y el mismo θ, el episodio dura 3 h con cruce y 24 h sin él.
//
// Se extrae del HTML real, no se copia (misma regla que test_viento_ejes.js).
//
//   node tests/test_viento_pasivo.js
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
const FIRMAS = ['LOC.sign=function(az){', 'LOC.noonFlip=function(sg,th,lim){',
                'LOC.pasivo=function(thT,ws,release,side,tol,dtS){',
                'LOC.single=function(thT,ws,az,T,full,noon){'];
const trozos = FIRMAS.map(saca);
check('las funciones siguen en el HTML con esa firma', trozos.every(Boolean),
      FIRMAS.filter((f, i) => !trozos[i]).join(' · '));
if (!trozos.every(Boolean)) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('lo extraído tiene cuerpo (' + trozos.join('').length + ' chars)',
      trozos.join('').length > 1000);

const ctx = { console, LOC: {} };
vm.createContext(ctx);
try { vm.runInContext(trozos.join('\n'), ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;
check('quedan expuestas las dos máquinas',
      typeof LOC.pasivo === 'function' && typeof LOC.single === 'function');

// ── el banco ──────────────────────────────────────────────────────────
const REL = 25, LADO = -30, TOL = 1, DT = 3600;      // paso de 1 h
const P = (th, ws, o) => {
  o = o || {};
  return LOC.pasivo(Float64Array.from(th), Float64Array.from(ws),
                    o.release === undefined ? REL : o.release,
                    o.side === undefined ? LADO : o.side,
                    o.tol === undefined ? TOL : o.tol,
                    o.dtS === undefined ? DT : o.dtS);
};
const rep = (v, n) => new Array(n).fill(v);
const sueltos = m => Array.from(m).reduce((a, b) => a + b, 0);

// ── 1) SIN VIENTO NO PASA NADA ────────────────────────────────────────
// El caso trivial, y no es de adorno: una máquina que declarase episodios en
// calma inflaría las horas del informe sin que ningún número pareciera raro.
const R0 = P(rep(20, 12), rep(0, 12));
check('en calma no hay episodio, ni un paso suelto',
      R0.episodios.length === 0 && sueltos(R0.mask) === 0);
check('y la orden es el seguimiento, intacta',
      Array.from(R0.theta).every(v => v === 20));
check('y no se cuenta ningún reenganche', R0.pasosPorElAngulo === 0);

// ── 2) LA SUELTA ──────────────────────────────────────────────────────
const R1 = P([...rep(20, 3), ...rep(20, 5)], [...rep(0, 3), ...rep(30, 5)]);
check('por encima del umbral la fila cae a SU lado, no al ángulo de seguimiento',
      R1.theta[3] === LADO && R1.mask[3] === 1, String(R1.theta[3]));
check('y antes del viento seguía en seguimiento',
      R1.theta[2] === 20 && R1.mask[2] === 0);
// El umbral es ESTRICTO. Justo en el valor de suelta el embrague aguanta, y
// esa frontera decide horas: un `>=` mal puesto mueve el recuento entero.
const R2 = P(rep(20, 4), [REL, REL, REL + 0.001, REL + 0.001]);
check('en el umbral exacto NO se suelta; un pelo por encima, sí',
      R2.mask[0] === 0 && R2.mask[1] === 0 && R2.mask[2] === 1,
      Array.from(R2.mask).join(''));

// ── 3) EL LADO SE CONGELA EN LA SUELTA ────────────────────────────────
// Una fila desembragada está apoyada en su tope: el viento ya no la mueve de
// ahí. Si el lado siguiera al rumbo durante el episodio, sería una fila que
// se pasea sola con el embrague abierto.
const ladoSerie = [-30, -30, -30, 55, 55, 55, 55, 55];
const R3 = P(rep(20, 8), [0, 0, 30, 30, 30, 30, 30, 30], { side: ladoSerie });
check('el lado se congela en el instante de la suelta, no sigue al rumbo',
      Array.from(R3.theta.slice(2)).every(v => v === -30),
      Array.from(R3.theta).join(','));

// ── 4) EL REENGANCHE POR PROXIMIDAD ───────────────────────────────────
const R4 = P([20, 20, -30.5, 20, 20], [0, 30, 0, 0, 0]);
check('cuando el seguimiento pasa CERCA del lado (dentro de tol), reengancha',
      R4.mask[2] === 0 && R4.episodios.length === 1,
      Array.from(R4.mask).join(''));

// ── 5) EL REENGANCHE POR CRUCE — la corrección 2, con su número ───────
// θ sube en saltos de 11°: cruza el lado (−30) entre dos muestras sin que
// ninguna caiga dentro de 1°. Sin el criterio de cruce la fila se queda
// suelta PARA SIEMPRE, y el episodio se marca sin reenganche.
const thGrueso = [], wsGrueso = [];
for (let i = 0; i < 24; i++) { thGrueso.push(-55 + 11 * i); wsGrueso.push(i < 3 ? 30 : 0); }
const R5 = P(thGrueso, wsGrueso);
check('a paso GRUESO el cruce reengancha aunque ninguna muestra caiga en tol',
      R5.episodios.length === 1 && !R5.episodios[0].sin_reenganche,
      JSON.stringify(R5.episodios[0]));
check('y el episodio dura lo que dura el viento (3 h), no el resto de la serie',
      R5.episodios[0].hours === 3, String(R5.episodios[0].hours));
// El anti-oráculo: cuánto costaría no tenerlo. 24 h en vez de 3 sobre el mismo
// viento — el episodio se comería la serie entera.
check('MEDIDO: sin cruce serían las 24 h de la serie (8×), no 3',
      sueltos(R5.mask) === 3, sueltos(R5.mask) + ' pasos sueltos de 24');

// ── 6) EL ORDEN Y EL EPISODIO — correcciones 1 y 3, en el mismo régimen ─
// Viento sostenido por encima del umbral y θ barriendo de tope a tope: la
// condición de reenganche se cumple varias veces, pero la fila NO llega a
// seguir ni un paso porque se vuelve a soltar en el mismo instante.
const thVaiven = [], wsVaiven = [];
for (let i = 0; i < 40; i++) {
  thVaiven.push(-55 + 110 * Math.abs(((i % 20) / 10) - 1));
  wsVaiven.push(i < 5 ? 0 : 30);
}
const R6 = P(thVaiven, wsVaiven);
check('con viento sostenido la máscara NO baja ni un paso (el orden importa)',
      Array.from(R6.mask.slice(5)).every(v => v === 1),
      Array.from(R6.mask).join(''));
check('la condición de reenganche SÍ se cumple varias veces (si no, no probaría nada)',
      R6.pasosPorElAngulo >= 3, String(R6.pasosPorElAngulo));
check('y aun así se declara UN episodio, no uno por cada vez que se cumple',
      R6.episodios.length === 1, R6.episodios.length + ' episodios');
check('cuyas horas cubren todo el vendaval', R6.episodios[0].hours === 35,
      String(R6.episodios[0].hours));

// ── 7) EL EPISODIO QUE NO CIERRA VA DECLARADO ─────────────────────────
// Si la serie acaba con la fila suelta, el episodio se publica marcado. Un
// episodio abierto contado como cerrado subestimaría las horas.
const R7 = P(rep(20, 6), rep(30, 6));
check('si la serie termina con la fila suelta, se declara `sin_reenganche`',
      R7.episodios.length === 1 && R7.episodios[0].sin_reenganche === true);
check('y sus horas llegan hasta el final de la serie',
      R7.episodios[0].hours === 6, String(R7.episodios[0].hours));

// ── 8) LAS HORAS CUADRAN CON LA MÁSCARA ───────────────────────────────
// Dos caminos al mismo número: los episodios y los pasos marcados. Que
// cuadren es lo que permite atribuir una hora a un episodio concreto.
[R5, R6, R7].forEach(function (R, k) {
  const horas = R.episodios.reduce((s, e) => s + e.hours, 0);
  check('las horas de los episodios cuadran con la máscara (caso ' + (k + 1) + ')',
        Math.abs(horas - sueltos(R.mask) * DT / 3600) < 1e-9,
        horas + ' vs ' + sueltos(R.mask));
});

// ══════════════════════════════════════════════════════════════════════
//  LOC.single — la estrategia de UN umbral
// ══════════════════════════════════════════════════════════════════════
// Tampoco la nombraba ningún arnés. Es la hermana simple de `LOC.dual`: sin
// sector parcial y sin histéresis, todo o nada.
const FULL = 60, AZ_E = 90, AZ_O = 270;
const S = (th, ws, o) => {
  o = o || {};
  return LOC.single(Float64Array.from(th), Float64Array.from(ws),
                    Float64Array.from(o.az || rep(AZ_E, th.length)),
                    o.T === undefined ? 20 : o.T, FULL,
                    o.noon === undefined ? 0 : o.noon);
};
const U1 = S([40, 40, 40], [0, 25, 0]);
check('single: por encima del umbral, abanderamiento TOTAL al lado del este',
      U1.mode[1] === 'FULL_STOW' && U1.theta[1] === FULL,
      U1.mode[1] + ' ' + U1.theta[1]);
check('y por debajo sigue al seguimiento, sin tocar el ángulo',
      U1.mode[0] === 'IDLE' && U1.theta[0] === 40);
const U2 = S([40, 40], [20, 20.001]);
check('single: el umbral también es estricto',
      U2.mode[0] === 'IDLE' && U2.mode[1] === 'FULL_STOW',
      U2.mode.join(','));
check('single: al oeste el signo se invierte',
      S([40], [25], { az: [AZ_O] }).theta[0] === -FULL);
// El límite de mediodía vale para las dos máquinas. Sin él, con θ dentro de la
// franja el seguidor cruzaría por el cero justo cuando el sol pasa el
// meridiano — el mismo bug que se corrigió en `dual`.
check('single: en la franja de mediodía abandera al OESTE, como dual',
      S([5], [25], { noon: 10 }).theta[0] === -FULL,
      String(S([5], [25], { noon: 10 }).theta[0]));
check('y fuera de la franja no se toca nada',
      S([40], [25], { noon: 10 }).theta[0] === FULL);

// ── MUTANTE ───────────────────────────────────────────────────────────
// El defecto medido, reproducido aquí sobre la función real: sin el criterio
// de cruce, el mismo viento deja la fila suelta ocho veces más tiempo. Si este
// banco no lo distinguiera, no estaría midiendo lo que dice medir.
const ctxM = { console, LOC: {} };
vm.createContext(ctxM);
vm.runInContext(trozos.join('\n').replace(/var cruza=\([^;]*\);/, 'var cruza=false;'), ctxM);
const RM = ctxM.LOC.pasivo(Float64Array.from(thGrueso), Float64Array.from(wsGrueso),
                           REL, LADO, TOL, DT);
check('MUTANTE: sin reenganche por cruce, 3 h pasan a 24 y queda sin reenganchar',
      RM.episodios[0].hours === 24 && RM.episodios[0].sin_reenganche === true,
      RM.episodios[0].hours + ' h · sin_reenganche ' + RM.episodios[0].sin_reenganche +
      ': si coincidiera con 3, este banco no distinguiría el criterio');

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
