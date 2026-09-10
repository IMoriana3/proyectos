// EL VIENTO A 50 AÑOS — un número de diseño que no vigilaba nadie.
//
// `LOC.gumbel` ajusta una Gumbel por momentos sobre los máximos anuales y de
// ahí salen los periodos de retorno que la ficha ENSEÑA: la fila «Viento a 50
// años · km/h · Gumbel», la curva de 2 a 100 años y el pie que declara sobre
// cuántos máximos se ajustó.
//
// MEDIDO ANTES DE ESCRIBIR ESTE FICHERO, y es la razón de que exista. Dos
// mutantes independientes sobre el ajuste —el signo de la constante de
// Euler-Mascheroni, y `Math.E` donde va `Math.PI`— corrieron contra los siete
// arneses de viento (238 comprobaciones) y mataron **CERO** cada uno. Se podía
// cambiar el viento de diseño a 50 años y el repo no se enteraba.
//
// Es la misma familia que la histéresis del abanderamiento: un mecanismo que
// los arneses de navegador ATRAVIESAN sin comprobar, porque miran que la
// página pinte y no que el número signifique algo.
//
// LOS ORÁCULOS, y por qué son tres y no uno
// ------------------------------------------
// Un careo contra la fórmula recalculada en el test es una tautología si se
// copia el código. Aquí se escribe la fórmula CERRADA aparte —momentos de la
// Gumbel, que están en cualquier manual— y además se exigen dos propiedades
// que no dependen de la fórmula:
//
//   · la ESCALA: multiplicar todos los máximos por k multiplica β y los
//     retornos por k, y desplazarlos por c desplaza μ y los retornos por c.
//     Una Gumbel por momentos tiene que ser equivariante, y eso se cumple sea
//     cual sea la constante que uno ponga… salvo que la constante esté donde
//     no toca.
//   · el ORDEN de la media: `V(2) < media < V(5)`, que sale de los cuantiles
//     de la Gumbel y es ADIMENSIONAL —no depende de β—. Es el que caza el
//     signo de Euler-Mascheroni, que la equivariancia no ve.
//
// Se extrae del HTML real, no se copia (misma regla que test_viento_ejes.js).
//
//   node tests/test_viento_gumbel.js
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
const FIRMA = 'LOC.gumbel=function(maximos){';
const trozo = saca(FIRMA);
check('la función sigue en el HTML con esa firma', !!trozo, FIRMA);
if (!trozo) { console.log('\nFALLOS: ' + ko); process.exit(1); }
// El vacío y lo casi vacío son error, no PASS.
check('lo extraído tiene cuerpo (' + trozo.length + ' chars)', trozo.length > 500);

const ctx = { console, LOC: {} };
vm.createContext(ctx);
try { vm.runInContext(trozo, ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;
check('queda expuesto el ajuste', typeof LOC.gumbel === 'function');

// ── la fórmula cerrada, ESCRITA APARTE ────────────────────────────────
// Momentos de la Gumbel: E[X] = μ + γβ y Var[X] = π²β²/6, con γ la constante
// de Euler-Mascheroni. Invirtiendo: β = s·√6/π y μ = x̄ − γβ. El cuantil de
// periodo de retorno T es la inversa de la acumulada en 1 − 1/T.
const GAMMA = 0.5772156649015329;
const media = a => a.reduce((s, v) => s + v, 0) / a.length;
const sdMuestral = a => {
  const m = media(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
};
const teorico = a => {
  const beta = sdMuestral(a) * Math.sqrt(6) / Math.PI;
  const mu = media(a) - GAMMA * beta;
  return { mu, beta, V: T => mu - beta * Math.log(-Math.log(1 - 1 / T)) };
};

// Máximos anuales verosímiles (m/s), 12 años. No son planos a propósito: con
// dispersión cero β sale 0 y la mitad de las propiedades se vuelven triviales
// —el fixture tiene que contener el mecanismo, no solo la forma—.
const MAX = [22.1, 25.4, 19.8, 28.3, 24.0, 21.5, 30.2, 23.7, 26.9, 20.4, 27.1, 24.8];

// ── 1) EL AJUSTE ES EL DE MOMENTOS ────────────────────────────────────
const G = LOC.gumbel(MAX), Tq = teorico(MAX);
check('devuelve un ajuste sobre 12 máximos', !!G && G.n_anos === 12,
      G && String(G.n_anos));
check('β sale del desvío MUESTRAL (n−1) por √6/π',
      Math.abs(G.beta - Tq.beta) < 1e-3, G.beta + ' vs ' + Tq.beta.toFixed(4));
check('μ resta γ·β a la media (γ = Euler-Mascheroni)',
      Math.abs(G.mu - Tq.mu) < 1e-3, G.mu + ' vs ' + Tq.mu.toFixed(4));
check('y publica la media y el desvío que ha usado',
      Math.abs(G.media_ms - media(MAX)) < 1e-3
      && Math.abs(G.sd_ms - sdMuestral(MAX)) < 1e-3,
      G.media_ms + ' / ' + G.sd_ms);

// ── 2) LOS PERIODOS DE RETORNO ────────────────────────────────────────
const PERIODOS = [2, 5, 10, 25, 50, 100];
check('publica los seis periodos declarados, en orden',
      G.retorno.length === 6 && G.retorno.every((r, i) => r.T === PERIODOS[i]),
      G.retorno.map(r => r.T).join(','));
check('cada uno es el cuantil de la Gumbel ajustada',
      G.retorno.every(r => Math.abs(r.ms - Tq.V(r.T)) < 0.02),
      G.retorno.map(r => r.ms).join(',') + ' vs ' +
      PERIODOS.map(T => Tq.V(T).toFixed(2)).join(','));
check('crecen estrictamente con el periodo',
      G.retorno.every((r, i) => i === 0 || r.ms > G.retorno[i - 1].ms));
// La tolerancia son 0,068 y está CALCULADA, no tanteada: los dos campos se
// redondean por separado desde el valor crudo —`ms` a 0,01 y `kmh` a 0,1—, así
// que `kmh` NO se deriva del `ms` publicado. Con V=23,985 salen 23,99 y 86,3,
// y 23,99×3,6 = 86,364: discrepan en la última cifra por construcción. El
// margen es 0,005·3,6 (el redondeo de los m/s) + 0,05 (el de los km/h). Una
// tolerancia más ancha admitiría una conversión equivocada; una más estrecha
// se pondría roja sola. Queda dicho aquí porque quien lea 86,3 y multiplique
// 23,99 por 3,6 va a pensar que hay un error y no lo hay.
check('los km/h son los m/s por 3,6 (y no otra conversión)',
      G.retorno.every(r => Math.abs(r.kmh - r.ms * 3.6) < 0.07),
      G.retorno.map(r => r.ms + '→' + r.kmh).join(' '));

// ── 3) EL ORDEN DE LA MEDIA — el oráculo ADIMENSIONAL ─────────────────
// Para una Gumbel: V(2) = μ + 0,3665β y la media = μ + 0,5772β, así que el
// retorno de 2 años queda POR DEBAJO de la media de los máximos, y el de 5
// (μ + 1,4999β) por encima. No depende de β ni de las unidades: solo del
// signo con que γ entra en μ. Con el signo cambiado, V(2) se va por encima de
// la media y este orden se rompe.
const m0 = media(MAX);
check('el retorno de 2 años queda POR DEBAJO de la media de los máximos',
      G.retorno[0].ms < m0, G.retorno[0].ms + ' vs media ' + m0.toFixed(2));
check('y el de 5 años por encima (orden que fija el signo de γ)',
      G.retorno[1].ms > m0, G.retorno[1].ms + ' vs media ' + m0.toFixed(2));

// ── 4) EQUIVARIANCIA — la propiedad que no depende de la fórmula ──────
// Un ajuste por momentos tiene que respetar cambio de escala y de origen. Se
// comprueba sobre el RESULTADO, sin recalcular nada: si β y los retornos no
// escalan con k, el factor está mal puesto.
const K = 2.5, C = 7.0;
const Gk = LOC.gumbel(MAX.map(v => v * K));
const Gc = LOC.gumbel(MAX.map(v => v + C));
check('escalar los máximos por k escala β por k',
      Math.abs(Gk.beta - G.beta * K) < 0.01, Gk.beta + ' vs ' + (G.beta * K).toFixed(3));
check('y escala TODOS los retornos por k',
      G.retorno.every((r, i) => Math.abs(Gk.retorno[i].ms - r.ms * K) < 0.05),
      Gk.retorno.map(r => r.ms).join(','));
check('desplazar los máximos por c desplaza μ por c y NO toca β',
      Math.abs(Gc.mu - (G.mu + C)) < 0.01 && Math.abs(Gc.beta - G.beta) < 0.01,
      Gc.mu + ' / ' + Gc.beta);
check('y desplaza todos los retornos por c',
      G.retorno.every((r, i) => Math.abs(Gc.retorno[i].ms - (r.ms + C)) < 0.02));

// ── 5) EL SUELO DE MUESTRAS ───────────────────────────────────────────
// Ajustar una distribución de extremos con dos años no es un ajuste, es una
// recta por dos puntos con nombre de estadística. La función se niega, y eso
// es un contrato: la ficha decide con `G ? … : ''` si enseña el bloque.
check('con 4 máximos NO ajusta (devuelve null)',
      LOC.gumbel(MAX.slice(0, 4)) === null);
check('con 5 sí (el suelo está donde se declara)',
      LOC.gumbel(MAX.slice(0, 5)) !== null);
check('y con ninguno tampoco revienta', LOC.gumbel([]) === null);

// ── 6) EL AJUSTE NO DEPENDE DEL ORDEN ─────────────────────────────────
// Son máximos ANUALES: el año en que ocurrió cada uno no entra en el ajuste
// por momentos. Si el orden importara, sería que algo lee la serie como
// temporal.
const revuelto = [...MAX].reverse();
const Gr = LOC.gumbel(revuelto);
check('barajar los máximos no cambia el ajuste',
      Gr.mu === G.mu && Gr.beta === G.beta
      && Gr.retorno.every((r, i) => r.ms === G.retorno[i].ms));

// ── 7) EL SEGUNDO ORÁCULO: lo ESPERADO, no solo lo posible ────────────
// Que los retornos crezcan y sean finitos es la cota barata. La que mide es
// el salto entre 50 y 100 años: para una Gumbel vale exactamente
// β·ln(ln(100/99)/ln(50/49))⁻¹… o dicho sin álgebra, sobre viento real son
// unos pocos km/h. Un ajuste con β desbocado sigue siendo monótono.
const salto = G.retorno[5].ms - G.retorno[4].ms;
check('el salto de 50 a 100 años es el de la Gumbel, no cualquiera',
      Math.abs(salto - (Tq.V(100) - Tq.V(50))) < 0.02, String(salto));
check('y es una fracción pequeña del propio valor (cordura física)',
      salto / G.retorno[4].ms < 0.15,
      salto.toFixed(2) + ' sobre ' + G.retorno[4].ms);

// ── MUTANTE ───────────────────────────────────────────────────────────
// El defecto medido, reproducido aquí: β con `Math.E` en vez de `Math.PI`. Si
// este banco no lo distinguiera, no estaría midiendo lo que dice medir — y es
// exactamente lo que pasaba con los siete arneses de viento antes de este
// fichero.
//
// CORREGIDO al medirlo, y va escrito porque el error es instructivo: la
// primera versión comparaba las dos BETA y pedía más de 0,5 de diferencia. La
// diferencia real es 0,39 —el cociente π/e vale 1,156— así que la comprobación
// se ponía roja sobre un código correcto. Y el fallo de fondo no era el
// umbral: era que la afirmación habla del VIENTO A 50 AÑOS y yo medía β. Se
// mide lo que se afirma.
const betaMal = sdMuestral(MAX) * Math.sqrt(6) / Math.E;
const v50Mal = (media(MAX) - GAMMA * betaMal)
             - betaMal * Math.log(-Math.log(1 - 1 / 50));
const deltaKmh = Math.abs(v50Mal - G.retorno[4].ms) * 3.6;
check('MUTANTE: β con e en vez de π mueve el viento a 50 años varios km/h',
      deltaKmh > 3,
      'bueno ' + (G.retorno[4].ms * 3.6).toFixed(1) + ' km/h · mutado ' +
      (v50Mal * 3.6).toFixed(1) + ' km/h · Δ ' + deltaKmh.toFixed(1) +
      ': si coincidieran, este banco no distinguiría el ajuste');

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
