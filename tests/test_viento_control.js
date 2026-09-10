// EL LAZO DE ACTUACIÓN Y LOS DENOMINADORES DEL PASIVO — atravesados, no
// comprobados.
//
// De dónde sale este fichero, y va con los números porque es el argumento
// entero. Se hizo una batería de mutación sobre mecanismos de `sim-viento.html`
// que ningún arnés NOMBRA, midiendo cada mutante contra los siete arneses de
// viento (238 comprobaciones). Los siete mutantes, todos verificados aplicados,
// mataron CERO:
//
//     gumbel: signo de Euler-Mascheroni ............ 0    (→ test_viento_gumbel.js)
//     gumbel: β con e en vez de π .................. 0    (→ test_viento_gumbel.js)
//     gumbel: ajusta con 2 años en vez de 5 ........ 0    (→ test_viento_gumbel.js)
//     ladoDelViento: lado invertido ................ 0    ← aquí
//     fracExpuesta: olvida las filas por seguidor .. 0    ← aquí
//     control: la banda muerta no actúa ............ 0    ← aquí
//     control: sin límite de velocidad de giro ..... 0    ← aquí
//
// LOS TRES CASOS NO SON EL MISMO, y confundirlos sería repetir el error que
// esta sesión ya cometió una vez —leer «no lo nombra» como «no lo cubre»—:
//
//   · `LOC.control` se llama DOS VECES dentro de `LOC.run`, o sea en el camino
//     principal que todo arnés de navegador atraviesa. Aquí el cero es un hueco
//     de cobertura puro: el código corre y nadie mira lo que hace.
//   · `LOC.fracExpuesta` corre siempre que corre el bloque pasivo, y
//     `test_viento_planta` lo ejercita de verdad (comprueba el ángulo de la
//     fila soltada a 100 km/h). Mismo caso: atravesado y sin mirar.
//   · `LOC.ladoDelViento` es OTRA COSA: solo se llama con
//     `side_mode === 'viento'`, y **ningún arnés pone ese modo** —comprobado—,
//     así que su mutante era INALCANZABLE, no «no comprobado». El hueco ahí no
//     es de oráculo sino de camino: hay un modo entero de la ficha que no se
//     ejercita. Se cubre aquí sobre la función pura, y el hueco del camino
//     queda DECLARADO abajo en vez de darse por cerrado.
//
// Se extrae del HTML real, no se copia (misma regla que test_viento_ejes.js).
//
//   node tests/test_viento_control.js
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
const FIRMAS = ['LOC.sign=function(az){',
                'LOC.control=function(tgt,dtS,maxang,slew,dead){',
                'LOC.ladoDelViento=function(wd,full){',
                'LOC.fracExpuesta=function(nTrk,fpt,fs){'];
const trozos = FIRMAS.map(saca);
check('las funciones siguen en el HTML con esa firma', trozos.every(Boolean),
      FIRMAS.filter((f, i) => !trozos[i]).join(' · '));
if (!trozos.every(Boolean)) { console.log('\nFALLOS: ' + ko); process.exit(1); }
// El vacío y lo casi vacío son error, no PASS.
check('lo extraído tiene cuerpo (' + trozos.join('').length + ' chars)',
      trozos.join('').length > 700);

const ctx = { console, LOC: { SLEW: 0.17, DEADBAND: 1.0 } };
vm.createContext(ctx);
try { vm.runInContext(trozos.join('\n'), ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;
check('quedan expuestas las cuatro', ['sign', 'control', 'ladoDelViento',
      'fracExpuesta'].every(f => typeof LOC[f] === 'function'));

const F64 = a => Float64Array.from(a);
const arr = o => Array.from(o);

// ══════════════════════════════════════════════════════════════════════
//  1) LA BANDA MUERTA
// ══════════════════════════════════════════════════════════════════════
// Existe para que el motor no persiga el ruido: por debajo de `dead` grados
// respecto a DONDE ESTÁ, la orden se mantiene. Sin ella el seguidor arranca en
// cada paso, y eso en planta es desgaste; en la simulación, un recuento de
// maniobras inventado.
const DT = 60, MAXANG = 60;
const sinLimite = { slew: 0, dead: 0 };
const corre = (tgt, o) => arr(LOC.control(F64(tgt), DT, MAXANG,
                                          (o || {}).slew === undefined ? 0 : o.slew,
                                          (o || {}).dead === undefined ? 0 : o.dead));

// Un objetivo que tirita ±0,4° alrededor de 10°, con banda de 1°.
const tiritona = [10, 10.4, 9.6, 10.3, 9.7, 10.2, 9.8];
const conBanda = corre(tiritona, { dead: 1 });
check('con banda muerta, un objetivo que tirita NO mueve la orden',
      conBanda.every(v => v === 10), conBanda.join(','));
const sinBanda = corre(tiritona, sinLimite);
check('y sin ella la orden persigue cada temblor (por eso existe)',
      sinBanda.some((v, i) => v !== conBanda[i]), sinBanda.join(','));

// La banda se mide contra la ORDEN ANTERIOR, no contra el objetivo anterior:
// una rampa más lenta que la banda no se pierde, se ACUMULA y cuando cruza el
// umbral la orden salta al objetivo ENTERO, no al borde de la banda. Eso
// distingue una banda muerta de un cuantizador, que es otra cosa.
const rampa = [0, 0.9, 1.8, 2.7, 3.6];
const R = corre(rampa, { dead: 1 });
check('una rampa más lenta que la banda se ACUMULA, no se pierde',
      R[1] === 0 && R[2] === 1.8, R.join(','));
check('y al cruzarla salta al objetivo ENTERO, no al borde de la banda',
      R[2] === 1.8 && R[2] !== 1.0, String(R[2]));

// ══════════════════════════════════════════════════════════════════════
//  2) EL LÍMITE DE VELOCIDAD DE GIRO
// ══════════════════════════════════════════════════════════════════════
// El seguidor no teletransporta: `slew` grados por segundo. Con dtS=60 y el
// canónico de 0,17 °/s son 10,2° por paso. Un salto de 50° tarda cinco pasos, y
// eso es justo lo que hace que una maniobra de abanderamiento CUESTE tiempo.
const SLEW = 0.17, MAXD = SLEW * DT;
const salto = [0, 50, 50, 50, 50, 50, 50];
const S = corre(salto, { slew: SLEW });
check('un salto grande se recorre a ' + MAXD.toFixed(1) + '°/paso, no de golpe',
      Math.abs(S[1] - MAXD) < 1e-9 && Math.abs(S[2] - 2 * MAXD) < 1e-9,
      S.slice(0, 4).map(v => v.toFixed(2)).join(','));
check('y llega al objetivo sin pasarse',
      Math.abs(S[6] - 50) < 1e-9 && S.every(v => v <= 50 + 1e-9),
      S.map(v => v.toFixed(2)).join(','));
check('sin límite, el mismo salto se hace en UN paso (por eso existe)',
      corre(salto, sinLimite)[1] === 50);
// El signo: bajar está igual de limitado que subir. Un límite que solo actúa
// en un sentido deja el retorno del abanderamiento gratis.
const bajada = corre([0, -50, -50, -50, -50, -50, -50], { slew: SLEW });
check('el límite actúa en los DOS sentidos',
      Math.abs(bajada[1] + MAXD) < 1e-9, bajada.slice(0, 3).join(','));

// `slew = 0` significa SIN LÍMITE, no «no se mueve». Es la lectura contraria y
// la del código (`slew>0 ? slew*dtS : Infinity`); un 0 que congelara el
// seguidor sería un bug silencioso muy caro.
check('slew 0 significa SIN límite, no seguidor congelado',
      corre(salto, { slew: 0 })[1] === 50);

// ══════════════════════════════════════════════════════════════════════
//  3) EL TOPE MECÁNICO
// ══════════════════════════════════════════════════════════════════════
const pasado = corre([0, 200, 200], { slew: 0, dead: 0 });
check('la orden nunca supera el tope mecánico', pasado.every(v => Math.abs(v) <= MAXANG),
      pasado.join(','));
check('y el PRIMER paso también se recorta (no entra libre)',
      corre([200, 200], sinLimite)[0] === MAXANG);
check('por el lado negativo igual', corre([-200, -200], sinLimite)[0] === -MAXANG);

// ══════════════════════════════════════════════════════════════════════
//  4) LOS DOS LÍMITES JUNTOS
// ══════════════════════════════════════════════════════════════════════
// Con banda y velocidad a la vez, el orden importa: primero se decide SI se
// mueve (banda) y después CUÁNTO (velocidad). Al revés, un objetivo dentro de
// la banda consumiría paso de giro para quedarse donde está.
const ambos = corre([0, 0.5, 30, 30, 30], { slew: SLEW, dead: 1 });
check('dentro de la banda no se gasta paso de giro',
      ambos[1] === 0, String(ambos[1]));
check('y fuera de ella, el giro sigue limitado',
      Math.abs(ambos[2] - MAXD) < 1e-9, String(ambos[2]));

// ══════════════════════════════════════════════════════════════════════
//  5) EL DENOMINADOR DEL PASIVO
// ══════════════════════════════════════════════════════════════════════
// La fila que se desembraga pierde siempre lo mismo; lo que cambia es entre
// cuántas se reparte. Ahí el factor que se olvida no da un número absurdo: da
// uno PLAUSIBLE del doble, que es la clase de error que nadie cuestiona.
check('1 fila suelta de 20 trackers × 2 filas es 1/40, no 1/20',
      Math.abs(LOC.fracExpuesta(20, 2, 1) - 0.025) < 1e-12,
      String(LOC.fracExpuesta(20, 2, 1)));
check('y con monofila (1 fila por tracker) sí es 1/20',
      Math.abs(LOC.fracExpuesta(20, 1, 1) - 0.05) < 1e-12);
check('con un solo tracker bifila se condena la MITAD del campo',
      Math.abs(LOC.fracExpuesta(1, 2, 1) - 0.5) < 1e-12);
check('la fracción está acotada a 1 (no se puede condenar más que todo)',
      LOC.fracExpuesta(2, 2, 99) === 1);
// Las entradas se sanean a enteros ≥1: un 0 daría división por cero y un ∞ que
// viajaría a la pantalla como fracción.
check('un 0 de trackers no produce infinito, cae al suelo de 1',
      isFinite(LOC.fracExpuesta(0, 2, 1)) && LOC.fracExpuesta(0, 2, 1) === 0.5);
check('los defaults declarados son 2 filas por tracker y 1 suelta',
      LOC.fracExpuesta(10) === LOC.fracExpuesta(10, 2, 1));

// ══════════════════════════════════════════════════════════════════════
//  6) EL LADO DEL QUE SOPLA — y su hueco de CAMINO, declarado
// ══════════════════════════════════════════════════════════════════════
// Un signo invertido aquí aparca la fila en el lado CONTRARIO al que sopla:
// exactamente la maniobra que el modo existe para evitar. En planta se ve; en
// un agregado anual, no.
const ESTE = 90, OESTE = 270;
const lados = arr(LOC.ladoDelViento(F64([ESTE, OESTE, ESTE]), 55));
check('con el viento del ESTE la fila cae al lado positivo',
      lados[0] === 55, String(lados[0]));
check('y del OESTE al negativo (el signo, que es todo el mecanismo)',
      lados[1] === -55, String(lados[1]));
check('el lado sigue al rumbo paso a paso', lados[2] === 55);
// Sin rumbo el motor resuelve con un lado fijo; que aquí salga +1 es la
// convención de `LOC.sign`, y se fija para que un cambio se vea.
check('sin rumbo (NaN) cae al lado positivo, no a NaN',
      arr(LOC.ladoDelViento(F64([NaN]), 55))[0] === 55);

// HUECO DECLARADO, y se declara porque medirlo fue el hallazgo: lo de arriba
// comprueba la FUNCIÓN. El camino de la ficha que la llama —`side_mode` en
// «viento»— no lo ejercita ningún arnés: ninguno toca `#pasModo`. Por eso el
// mutante del lado invertido murió cero veces contra los siete arneses, y por
// eso este banco no puede decir que ese camino esté cubierto. Cerrarlo pide un
// arnés de navegador que ponga el selector y compruebe el lado resultante, y
// eso es otro PR — anotarlo aquí es lo que impide que el verde de este fichero
// se lea como más de lo que es.
check('DECLARADO: ningún arnés pone `side_mode` en «viento» (hueco de camino)',
      !/pasModo|side_mode/.test(
        fs.readdirSync(path.join(RAIZ, 'tests'))
          .filter(f => /^test_.*\.(js|mjs)$/.test(f) && f !== 'test_viento_control.js')
          .map(f => fs.readFileSync(path.join(RAIZ, 'tests', f), 'utf8'))
          .join('\n')),
      'si esto falla es BUENA noticia: alguien ha cubierto el camino y toca ' +
      'retirar esta declaración en vez de arreglarla');

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
