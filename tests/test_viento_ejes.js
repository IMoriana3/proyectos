// Lienzos y ejes de la ficha «Viento & Abanderamiento» — SIN navegador.
//
// Nace de una captura del usuario en la que la comparativa salía ESTIRADA
// —letras separadas, barras gordas— y los ejes repetían etiquetas («2, 2, 1,
// 1, 0» en horas; «0.01, 0.01, 0.01, 0.00, 0.00» en POA perdida). Las dos
// cosas se pueden comprobar sin pintar nada, porque las dos viven en funciones
// puras: el preparador del lienzo y el generador de ejes.
//
// Se extraen del sim-viento.html REAL, no de una copia en el test: una copia
// se quedaría careando una versión vieja mientras la ficha evoluciona (misma
// regla que test_comparador.js).
//
//   node tests/test_viento_ejes.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const html = fs.readFileSync(path.join(RAIZ, 'sim-viento.html'), 'utf8');
function saca(firma) {
  const i = html.indexOf(firma);
  if (i < 0) return null;
  // `var X=...` es una línea, no un bloque con llave en columna 0
  const j = firma.startsWith('function') ? html.indexOf('\n}', i) : html.indexOf('\n', i) - 1;
  return j < 0 ? null : html.slice(i, j + 2);
}
const FIRMAS = ['function prep2d(cv){', 'function nicePaso(bruto){',
                'function niceDec(paso){', 'function niceEje(max,n){',
                'function niceEjes2(maxA,maxB,n){', 'function niceRango(lo,hi,n){',
                'function ejesTransmision(nF,pitch,filasPorTrk,esPasivo,hueco){',
                'function pasoReproductor(stepMin,factor){',
                'var FACTORES_REPRO=', 'var REPRO_MAX_S=',
                'function factorPorDefecto(stepMin,pasos){',
                'function duracionRepro(stepMin,factor,pasos){'];
const trozos = FIRMAS.map(saca);
check('las funciones puras siguen en el HTML', trozos.every(Boolean),
      FIRMAS.filter((f, i) => !trozos[i]).join(', '));
if (!trozos.every(Boolean)) { console.log('\nFALLOS: ' + ko); process.exit(1); }
// Un extractor que se traiga dos líneas también «compila»: el vacío y lo casi
// vacío son error, no PASS.
check('lo extraído tiene cuerpo (' + trozos.join('').length + ' chars)',
      trozos.join('').length > 900);

const ctx = { console, window: { devicePixelRatio: 2 } };
vm.createContext(ctx);
try { vm.runInContext(trozos.join('\n'), ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
check('el bloque compila y expone las funciones',
      typeof ctx.prep2d === 'function' && typeof ctx.niceEje === 'function');
if (typeof ctx.niceEje !== 'function') { console.log('\nFALLOS: ' + ko); process.exit(1); }

// ── 1) el lienzo OCULTO no se estira, y se declara ────────────────────────
// `clientWidth` vale 0 mientras la tarjeta está en display:none. Si el ancho
// de dibujo cae ahí al de diseño (880) mientras el CSS estira el lienzo al del
// contenedor, todo sale multiplicado en horizontal — que es lo que se veía.
function lienzo(clientWidth) {
  return { width: 880, height: 230, dataset: {}, style: {}, clientWidth: clientWidth,
           getContext: () => ({ setTransform: () => {} }) };
}
const oc = lienzo(0);
const p1 = ctx.prep2d(oc), p2 = ctx.prep2d(oc), p3 = ctx.prep2d(oc);
check('el lienzo sin maquetar se DECLARA', p1.medido === false);
// El error latente: `cv.width` deja de ser el ancho de diseño en cuanto se le
// mete el búfer en píxeles FÍSICOS, así que releerlo de ahí multiplicaba por
// el dpr en cada pasada (880 → 1760 → 3520).
check('llamarlo en oculto NO acumula el dpr (' + [p1.W, p2.W, p3.W] + ')',
      p1.W === 880 && p2.W === 880 && p3.W === 880);
const vi = lienzo(1900);
const p4 = ctx.prep2d(vi);
check('maquetado: dibuja al ancho REAL', p4.medido === true && p4.W === 1900);
check('el búfer va en píxeles físicos', vi.width === 3800);

// ── 2) ningún eje repite etiquetas ────────────────────────────────────────
// Es el defecto que se ve: un eje que dice cuatro veces lo mismo no está
// midiendo, y deja sin saber cuánto vale una división.
function rotulos(e) {
  const r = [];
  for (let i = 0; i <= e.n; i++) r.push((e.paso * (e.n - i)).toFixed(e.dec));
  return r;
}
[2, 0.01, 1, 7, 0.0034, 123, 0.5, 1440, 0].forEach(max => {
  const e = ctx.niceEje(max, 4), lab = rotulos(e);
  const unicas = new Set(lab).size === lab.length;
  const cabe = e.hi >= max - 1e-12;
  const holgura = max > 0 ? e.hi / max : 1;
  check('eje 0–' + max + ' sin repetir [' + lab.join(', ') + ']',
        unicas && cabe && e.n >= 1 && holgura <= 2.0001,
        'únicas=' + unicas + ' cabe=' + cabe + ' holgura=' + holgura.toFixed(2));
});

// ── 3) los ejes de la mensual COMPARTEN rejilla ───────────────────────────
// Con divisiones distintas, los rótulos de un lado no caerían sobre ninguna
// línea de la rejilla.
[[2, 0.01], [1440, 3.7], [0, 0], [7, 0.5]].forEach(par => {
  const [A, B] = ctx.niceEjes2(par[0], par[1], 4);
  check('rejilla común para ' + par.join(' / ') + ' (' + A.n + ' divisiones)',
        A.n === B.n && A.hi >= par[0] - 1e-12 && B.hi >= par[1] - 1e-12);
});

// ── 4) el eje con signo contiene el cero y no repite ──────────────────────
[[-0.0005, 0.0034], [-2, 0], [0, 0.0034], [-0.5, 0.5]].forEach(r => {
  const e = ctx.niceRango(r[0], r[1], 4);
  const lab = e.ticks.map(v => v.toFixed(e.dec));
  const cero = e.ticks.some(v => Math.abs(v) < e.paso * 1e-6);
  check('rango ' + r.join('..') + ' -> [' + lab.join(', ') + ']',
        new Set(lab).size === lab.length && e.lo <= r[0] + 1e-12
        && e.hi >= r[1] - 1e-12 && cero);
});

// ── 5) MUTANTE: sin paso redondo, esto tiene que ponerse rojo ─────────────
// Un arnés que no se puede poner rojo no mide. Se reproduce el cálculo viejo
// —partir el máximo en cuatro— y se exige que el criterio lo rechace.
(function () {
  const viejo = max => { const lab = []; for (let i = 0; i <= 4; i++) lab.push((max * (1 - i / 4)).toFixed(0)); return lab; };
  const lab = viejo(2);                       // «2, 2, 1, 1, 0»
  check('MUTANTE: el criterio caza el eje sin redondear [' + lab.join(', ') + ']',
        new Set(lab).size !== lab.length);
})();

// ── 6) el EJE DE TRANSMISIÓN de la escena 3D ─────────────────────────────
// Bifila es UN motor moviendo DOS filas unidas por este eje. La regla vive
// aparte del dibujo justo para poder ejercitarla sin montar una escena.
const ET = ctx.ejesTransmision;
check('monofila NO lleva eje de transmisión', ET(6, 6, 1, false).length === 0);
check('bifila empareja las filas de dos en dos', ET(6, 6, 2, false).length === 3);
check('un nº impar de filas no deja media pareja colgando',
      ET(5, 6, 2, false).length === 2);
(function () {
  const e = ET(6, 6, 2, false);
  const largos = e.map(v => +(v.xb - v.x0).toFixed(6));
  check('sin pasivo, todos los ejes miden el pitch [' + largos.join(', ') + ']',
        largos.every(L => L === 6) && e.every(v => !v.suelto));
  // los pares no se solapan y cubren filas contiguas
  const ok = e.every((v, i) => Math.abs((v.xb - v.xa) - 6) < 1e-9)
          && e.slice(1).every((v, i) => v.xa - e[i].xb === 6);
  check('cada eje une filas CONTIGUAS y los pares no se pisan', ok,
        JSON.stringify(e.map(v => [v.xa, v.xb])));
})();
(function () {
  const e = ET(6, 6, 2, true);          // caso PASIVO
  const sueltos = e.filter(v => v.suelto);
  check('en el pasivo se corta UN solo eje, el de la fila de perímetro',
        sueltos.length === 1 && e[0].suelto);
  check('el corte deja hueco de verdad (' + (sueltos[0].x0 - sueltos[0].xa).toFixed(2) + ' m)',
        sueltos[0].x0 > sueltos[0].xa && sueltos[0].xb - sueltos[0].x0 < 6);
  check('los demás ejes del bloque del pasivo siguen enteros',
        e.slice(1).every(v => Math.abs((v.xb - v.x0) - 6) < 1e-9));
  // la fila de perímetro es la que el bloque dibuja la primera (x más negativo)
  const minx = Math.min.apply(null, e.map(v => v.xa));
  check('el eje cortado es el de la fila de perímetro', sueltos[0].xa === minx);
})();
// MUTANTE: si el corte se dibujara entero, la fila parecería seguir enganchada
check('MUTANTE: un eje sin hueco no pasa por cortado',
      !(ET(6, 6, 2, true, 0)[0].x0 > ET(6, 6, 2, true, 0)[0].xa));

// ── 7) la velocidad del reproductor ES una velocidad ─────────────────────
// El «×1» de antes no lo era: el bucle iba a 160 ms por paso y cada paso son
// los minutos de la ventana, así que con paso de 1 min corría a 375× y con
// paso de 5 min a 1.875×. Un rótulo que dice ×1 sobre algo que va a 375× no
// es una escala mal calibrada, es un número inventado.
const PR = ctx.pasoReproductor;
[[1, 60], [1, 300], [1, 900], [1, 3600], [5, 60], [5, 300], [15, 3600], [30, 60]]
  .forEach(c => {
    const [stepMin, f] = c;
    const r = PR(stepMin, f);
    // minutos simulados por segundo real que sale DE VERDAD del bucle
    const simPorSeg = (r.pasos * stepMin) / (r.ms / 1000);
    const err = Math.abs(simPorSeg - f / 60) / (f / 60);
    check('paso ' + stepMin + ' min a ×' + f + ' -> ' + r.ms.toFixed(0) + ' ms, ' +
          r.pasos + ' paso(s) = ×' + (simPorSeg * 60).toFixed(0),
          err < 0.02 && r.ms >= 50, 'error ' + (err * 100).toFixed(1) + '%');
  });
check('nunca baja del suelo de repintado', PR(1, 100000).ms >= 50);
check('entradas absurdas no dividen por cero',
      PR(0, 0).ms >= 50 && isFinite(PR(0, 0).ms) && PR(null, null).pasos >= 1);
// MUTANTE: la cadencia vieja, con su rótulo. Tiene que salir muy lejos de ×1.
(function () {
  const msViejo = Math.max(40, 320 / 2);            // «×1» de antes
  const factorReal = (1 /* min por paso */ * 60) / (msViejo / 1000);
  check('MUTANTE: el «×1» viejo iba en realidad a ×' + Math.round(factorReal),
        factorReal > 100);
})();

// ── 8) al abrir, el reproductor tiene que AVANZAR ────────────────────────
// La ventana se muestrea a 240 pasos como mucho, así que el factor que la hace
// mirable depende del paso. Un default fijo dejó la reproducción a 800 ms por
// fotograma con el paso habitual de 4 min —192 s la ventana entera, diez veces
// más lenta que la versión anterior— y eso se lee como que no avanza.
const FD = ctx.factorPorDefecto, DR = ctx.duracionRepro;
[[1, 240], [4, 240], [10, 96], [15, 64], [30, 32], [60, 16]].forEach(c => {
  const [stepMin, pasos] = c;
  const f = FD(stepMin, pasos);
  const seg = DR(stepMin, f, pasos);
  check('paso ' + stepMin + ' min · ' + pasos + ' pasos -> arranca en ×' + f +
        ' (' + seg.toFixed(0) + ' s la ventana)',
        seg <= ctx.REPRO_MAX_S + 0.001 && ctx.FACTORES_REPRO.indexOf(f) >= 0);
});
check('el factor elegido es el MÁS LENTO que cabe (no el más rápido a lo bruto)',
      (function () {
        const f = FD(4, 240), i = ctx.FACTORES_REPRO.indexOf(f);
        return i === 0 || DR(4, ctx.FACTORES_REPRO[i - 1], 240) > ctx.REPRO_MAX_S;
      })());
// MUTANTE: el default fijo de la versión anterior, sobre la ventana habitual.
check('MUTANTE: con ×300 fijo la ventana de paso 4 min tardaba ' +
      Math.round(DR(4, 300, 240)) + ' s',
      DR(4, 300, 240) > ctx.REPRO_MAX_S * 3);
// Y no puede pasarse de largo: con paso muy grueso ni el más rápido cabe, y
// entonces devuelve el tope en vez de undefined.
check('con paso imposible devuelve el tope declarado',
      FD(600, 240) === ctx.FACTORES_REPRO[ctx.FACTORES_REPRO.length - 1]);

console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko)
                : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
process.exit(ko ? 1 : 0);
