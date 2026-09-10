// LA MÁQUINA QUE DECIDE ABANDERAR — y que no vigilaba nadie.
//
// `LOC.dual` es la que convierte viento en órdenes de posición: dos umbrales,
// sector parcial, aparcado y la histéresis de vuelta. Todo lo que la ficha
// cuenta después —horas abanderadas, maniobras, POA perdida— sale de aquí.
//
// MEDIDO ANTES DE ESCRIBIR NADA, y por eso existe este fichero: se puso el
// `hold` de la histéresis a CERO en la llamada real y los 22 arneses —1.668
// comprobaciones— siguieron VERDES. Ni uno se enteró. O sea que la histéresis
// se podía borrar y el repo no lo notaba.
//
// Duele más porque el informe la NARRA: «el viento baja del umbral unos
// minutos y vuelve, sigue siendo el mismo (el hold de N min)». Una frase en
// pantalla afirmando un comportamiento que nada comprobaba.
//
// Lo que la cubría hasta ahora era cobertura de PASO, no de propiedad: los
// arneses de navegador ejecutan `dual` de punta a punta y se enteran de lo que
// mueve los totales —quitar la conversión km/h→m/s de los umbrales mata 7
// comprobaciones entre `reproductor` y `sello`, comprobado— pero no de lo que
// solo cambia la FORMA de la respuesta sin cambiar mucho los agregados. La
// histéresis es exactamente eso.
//
// Se extrae del HTML real, no se copia: una copia daría verde mientras el
// original evoluciona (misma regla que test_viento_ejes.js).
//
//   node tests/test_viento_abanderamiento.js
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
                'LOC.dual=function(thT,ws,az,T1,T2,pmin,full,dtS,holdMin,parkMin,dead,noon){'];
const trozos = FIRMAS.map(saca);
check('las funciones siguen en el HTML con esa firma', trozos.every(Boolean),
      FIRMAS.filter((f, i) => !trozos[i]).join(' · '));
if (!trozos.every(Boolean)) { console.log('\nFALLOS: ' + ko); process.exit(1); }
// El vacío y lo casi vacío son error, no PASS: un extractor que se traiga dos
// líneas también compila.
check('lo extraído tiene cuerpo (' + trozos.join('').length + ' chars)',
      trozos.join('').length > 1200);

const ctx = { console, LOC: {} };
vm.createContext(ctx);
try { vm.runInContext(trozos.join('\n'), ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;
check('queda expuesta la máquina', typeof LOC.dual === 'function');

// ── el banco ──────────────────────────────────────────────────────────
// Un paso = 60 s, así que `holdMin` minutos son `holdMin` pasos. Los ángulos
// de seguimiento son planos a +50° para que cualquier movimiento sea del
// abanderamiento y no del sol: si la respuesta cambia, ha sido la máquina.
const DT = 60, FULL = 60, PMIN = 30, T1 = 10, T2 = 20;
const AZ = 90;                       // este ⇒ sign(az) = +1
const corre = (vientos, opt) => {
  const o = opt || {};
  const n = vientos.length;
  const th = new Float64Array(n).fill(o.th === undefined ? 50 : o.th);
  const az = new Float64Array(n).fill(o.az === undefined ? AZ : o.az);
  return LOC.dual(th, Float64Array.from(vientos), az, T1, T2,
                  o.pmin === undefined ? PMIN : o.pmin, FULL, DT,
                  o.hold === undefined ? 10 : o.hold,
                  o.park === undefined ? 0 : o.park,
                  o.dead === undefined ? 1 : o.dead,
                  o.noon === undefined ? 0 : o.noon);
};
const rep = (v, n) => new Array(n).fill(v);

// ── 1) LA HISTÉRESIS SOSTIENE ─────────────────────────────────────────
// Cinco pasos de viento fuerte y luego calma. Con `hold` de 10 min la vuelta
// NO puede ser inmediata: el modo tiene que seguir en DESTOW_HOLD y el ángulo
// congelado en la última orden, no en el de seguimiento.
const R1 = corre([...rep(15, 5), ...rep(0, 20)], { hold: 10 });
check('tras la calma NO vuelve al instante: sigue en DESTOW_HOLD',
      R1.mode[5] === 'DESTOW_HOLD' && R1.mode[9] === 'DESTOW_HOLD',
      R1.mode.slice(4, 11).join(','));
check('y durante el hold el ángulo queda CONGELADO en la última orden',
      R1.theta[5] === R1.theta[4] && R1.theta[9] === R1.theta[4],
      R1.theta.slice(4, 11).join(','));
// Y suelta cuando toca. Sin esto, «sostiene» se cumpliría no soltando nunca.
const iLibre = R1.mode.indexOf('IDLE', 5);
check('y SUELTA cuando se cumple el hold, no se queda pegado',
      iLibre > 5 && iLibre <= 5 + 11 && R1.theta[iLibre] === 50,
      'suelta en el paso ' + iLibre);

// ── 2) EL CASTAÑETEO, que es el motivo de que la histéresis exista ────
// Viento que cruza T1 arriba y abajo cada dos pasos durante 40. Con hold de
// 10 min, la máquina NO debe llegar a soltar ni una vez; sin hold, suelta en
// cada bajada. Este es el oráculo de COMPORTAMIENTO: cuenta maniobras, no
// ángulos, que es lo que se rompe sin que los agregados se muevan.
const diente = [];
for (let i = 0; i < 40; i++) diente.push(i % 4 < 2 ? 15 : 0);
const conHold = corre(diente, { hold: 10 });
const sinHold = corre(diente, { hold: 0 });
const sueltas = m => m.filter((v, i) => v === 'IDLE' && m[i - 1] === 'DESTOW_HOLD').length;
check('con histéresis, un viento que castañetea sobre T1 NO suelta ninguna vez',
      sueltas(conHold.mode) === 0, sueltas(conHold.mode) + ' sueltas');
check('y sin ella suelta en CADA bajada (por eso existe)',
      sueltas(sinHold.mode) >= 9,
      sueltas(sinHold.mode) + ' sueltas de 10 bajadas');
// AQUÍ ESTÁ EL MECANISMO DE LA CEGUERA, y se comprueba en vez de contarse.
//
// Con el seguidor ya DENTRO del sector (θ=50°, pmin=30°), la orden es 50° en
// las tres situaciones: abanderando parcial se recorta a 50, sosteniendo se
// congela en 50, y libre sigue al seguimiento en 50. O sea que quitar la
// histéresis no mueve NI UN GRADO: cambia el modo declarado y nada más.
//
// Eso es exactamente por qué los 22 arneses no se enteraron. Miran ángulos y
// agregados, y por ese camino la histéresis es invisible. Se comprueba —y no
// se afirma en un comentario— porque es la razón de ser de este fichero.
check('con θ dentro del sector, el hold cambia SOLO el modo y ni un grado',
      conHold.theta.every((v, i) => v === sinHold.theta[i])
      && conHold.mode.join(',') !== sinHold.mode.join(','),
      'si los ángulos difirieran, el hueco no habría existido');
// Y donde sí mueve la orden: con el seguidor por debajo de pmin, sostener
// significa quedarse en el borde del sector en vez de volver a 5°.
const dienteBajo = corre(diente, { th: 5, hold: 10 });
const dienteBajoSin = corre(diente, { th: 5, hold: 0 });
check('con θ por debajo de pmin sí cambia la ORDEN, y por eso importa',
      dienteBajo.theta.some((v, i) => v !== dienteBajoSin.theta[i]),
      'máx |Δ| ' + Math.max.apply(null,
        Array.from(dienteBajo.theta).map((v, i) => Math.abs(v - dienteBajoSin.theta[i]))));

// ── 3) T2 MANDA SOBRE T1 ──────────────────────────────────────────────
const R3 = corre([...rep(15, 3), ...rep(25, 3), ...rep(15, 3)]);
check('por encima de T2 va a abanderamiento TOTAL',
      R3.mode[3] === 'FULL_STOW' && Math.abs(R3.theta[3]) === FULL,
      R3.mode[3] + ' ' + R3.theta[3]);
check('y con el signo del lado que toca (este ⇒ +)', R3.theta[3] === FULL);
check('al bajar a la franja de T1 vuelve a PARCIAL, no a IDLE',
      R3.mode[6] === 'PARTIAL_STOW', R3.mode[6]);

// ── 4) T2 REARMA LA HISTÉRESIS ────────────────────────────────────────
// Un pico por encima de T2 pone el hold a cero; la cuenta empieza de nuevo
// desde la calma, no desde antes del pico.
const R4 = corre([...rep(15, 2), ...rep(25, 1), ...rep(0, 20)], { hold: 5 });
check('un pico sobre T2 REARMA el hold (la cuenta empieza tras el pico)',
      R4.mode[3] === 'DESTOW_HOLD' && R4.mode[7] === 'DESTOW_HOLD',
      R4.mode.slice(3, 9).join(','));

// ── 5) LOS UMBRALES SON ESTRICTOS ─────────────────────────────────────
// `v>T1` y no `>=`: justo EN el umbral no se abandera. Es la frontera donde
// un `>=` mal puesto cambia el recuento de horas sin que nada chirríe.
const R5 = corre([T1, T1 + 0.001, T2, T2 + 0.001], { hold: 0 });
check('en T1 exacto NO abandera; un pelo por encima, sí',
      R5.mode[0] === 'IDLE' && R5.mode[1] === 'PARTIAL_STOW',
      R5.mode.slice(0, 2).join(','));
check('en T2 exacto sigue en parcial; un pelo por encima, total',
      R5.mode[2] === 'PARTIAL_STOW' && R5.mode[3] === 'FULL_STOW',
      R5.mode.slice(2, 4).join(','));

// ── 6) EL SECTOR PARCIAL ──────────────────────────────────────────────
// Con |θ| ya dentro del sector, el parcial recorta pero no aparca.
const R6a = corre(rep(15, 4), { th: 50 });
check('dentro del sector, el parcial RECORTA al rango y no aparca',
      R6a.theta[0] === 50 && R6a.mode[0] === 'PARTIAL_STOW');
// Con |θ| por debajo de pmin hay que llevarlo AL borde del sector: dejarlo
// donde está sería abanderar a un ángulo que la regla prohíbe.
const R6b = corre(rep(15, 4), { th: 5 });
check('por debajo de pmin, se lleva al BORDE del sector (no se queda donde estaba)',
      R6b.theta[0] === PMIN, String(R6b.theta[0]));
check('y nunca devuelve un |θ| por debajo de pmin mientras abandera parcial',
      R6b.theta.every((v, i) => R6b.mode[i] !== 'PARTIAL_STOW' || Math.abs(v) >= PMIN));
// Al oeste, el sector es el simétrico. Un signo mal puesto aquí aparcaría en
// el lado contrario, que es un error que en planta se ve y en un agregado no.
const R6c = corre(rep(15, 4), { th: -5, az: 270 });
check('al oeste el sector es el simétrico (−pmin), no el mismo',
      R6c.theta[0] === -PMIN, String(R6c.theta[0]));

// ── 7) EL APARCADO TIENE DURACIÓN ─────────────────────────────────────
// `parkMin` mantiene el ángulo de aparcado aunque el seguimiento ya no lo
// pida. Sin él, la orden saltaría del borde al ángulo recortado en un paso.
const R7 = corre(rep(15, 12), { th: 5, park: 5 });
check('el aparcado se SOSTIENE los minutos declarados',
      R7.theta.slice(0, 5).every(v => v === PMIN), R7.theta.slice(0, 6).join(','));
check('y luego libera (no aparca para siempre)',
      R7.theta[11] === PMIN || R7.mode[11] === 'PARTIAL_STOW');

// ── 8) EL FLIP DE MEDIODÍA ────────────────────────────────────────────
// El comentario del código dice que el flip va ANTES de decidir sector y
// parada, y que corregirlo después habría aparcado en el lado contrario. Eso
// es una afirmación sobre el orden de dos líneas: o se comprueba, o es una
// frase. Con θ dentro de la franja de mediodía y siguiendo al este, el
// abanderamiento parcial tiene que irse al OESTE.
const R8 = corre(rep(15, 4), { th: 5, noon: 10, az: AZ });
check('en la franja de mediodía, siguiendo al este, abandera al OESTE',
      R8.theta[0] === -PMIN, String(R8.theta[0]));
check('y fuera de la franja no se toca nada',
      corre(rep(15, 4), { th: 40, noon: 10 }).theta[0] === 40);
check('con límite 0 la regla NO existe (y no se aplica por accidente)',
      corre(rep(15, 4), { th: 5, noon: 0 }).theta[0] === PMIN);

// ── 9) CALMA DESDE PARADO ─────────────────────────────────────────────
// Sin haber abanderado nunca no hay nada que sostener: el hold no puede
// inventarse un DESTOW_HOLD a partir de IDLE.
const R9 = corre(rep(0, 5), { hold: 10 });
check('desde IDLE, la calma no dispara ninguna histéresis',
      R9.mode.every(m => m === 'IDLE'), R9.mode.join(','));
check('y la orden sigue al seguimiento, sin recortes',
      R9.theta.every(v => v === 50));

// ── MUTANTE ───────────────────────────────────────────────────────────
// El defecto medido, reproducido aquí: el `hold` a cero. Si este banco no lo
// cazara, no estaría midiendo lo que dice medir — y es exactamente lo que
// pasaba con los 22 arneses antes de este fichero.
check('MUTANTE: con hold 0 la respuesta al mismo viento ES distinta',
      corre([...rep(15, 5), ...rep(0, 10)], { hold: 10 }).mode.join(',') !==
      corre([...rep(15, 5), ...rep(0, 10)], { hold: 0 }).mode.join(','),
      'si coincidieran, este banco no distinguiría la histéresis');

// ── EL CABLEADO, que es donde estaba el agujero de verdad ─────────────
// Todo lo de arriba comprueba que la MÁQUINA se porta. No comprueba que la
// ficha se la pase bien, y el defecto medido estaba justo ahí: en la llamada
// real, no dentro de `dual`. Poniendo un `0` literal en la posición de
// `holdMin` los 22 arneses seguían verdes — y este banco también seguiría
// verde, porque llama a `dual` con sus propios argumentos.
//
// Esto es una comprobación de FORMA y lo digo en vez de disimularlo: mira el
// texto de la llamada, no su efecto. Vale menos que las de arriba y sirve
// para lo que sirve — que nadie sustituya una palanca de configuración por
// una constante sin que salte nada. La alternativa buena (ejecutar `run`
// entero con dos configuraciones y carear las respuestas) vive en los arneses
// de navegador, y allí es donde toca, no aquí.
const iCall = html.indexOf('LOC.dual(thB,');
check('la ficha llama a la máquina (si esto falla, lo de arriba prueba un fósil)',
      iCall > 0);
if (iCall > 0) {
  const llamada = html.slice(iCall + 'LOC.dual('.length,
                             html.indexOf(');', iCall));
  const args = llamada.split(',').map(s => s.trim());
  const ESPERADO = { 5: 'cfg.partial_stow_min_abs_deg',
                     8: 'cfg.destow_hold_minutes',
                     9: 'cfg.partial_park_minutes' };
  check('la llamada tiene los doce argumentos', args.length === 12,
        args.length + ': ' + args.join(' | '));
  Object.keys(ESPERADO).forEach(function (k) {
    check('el argumento ' + k + ' sigue siendo ' + ESPERADO[k] + ', no una constante',
          args[k] === ESPERADO[k], 'es `' + args[k] + '`');
  });
}

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
