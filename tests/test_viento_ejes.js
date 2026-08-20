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
                'function pasosPorSegundo(stepMin,factor){',
                'function duracionRepro(stepMin,factor,pasos){',
                                'function factorPorDefecto(stepMin,pasos){',
                'function opcionesRepro(stepMin,pasos){',
                'function avancePasos(acc,dtReal,factor,stepMin){',
                'var DURACIONES_REPRO=', 'var REPRO_MIN_PASOS_S=', 'var REPRO_DEF_S='];
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
// El «×1» de la primera versión no lo era: el bucle iba a 160 ms por paso y
// cada paso son los minutos de la ventana, así que con paso de 1 min corría a
// 375× y con paso de 5 min a 1.875×. Ahora el avance sale de acumular el
// tiempo real del bucle de fotogramas, así que el factor se cumple por
// construcción y lo que se comprueba es la CUENTA.
const PPS = ctx.pasosPorSegundo, DR = ctx.duracionRepro;
[[1, 60], [1, 300], [1, 3600], [5, 300], [15, 3600], [30, 60]].forEach(c => {
  const [stepMin, f] = c;
  // minutos simulados por segundo real que sale de la cuenta
  const simPorSeg = PPS(stepMin, f) * stepMin;
  check('paso ' + stepMin + ' min a ×' + f + ' avanza ' + simPorSeg.toFixed(1) +
        ' min/s = ×' + Math.round(simPorSeg * 60),
        Math.abs(simPorSeg * 60 - f) < 1e-9);
});
check('la duración de la ventana es pasos / (pasos por segundo)',
      Math.abs(DR(4, 3600, 240) - 240 / PPS(4, 3600)) < 1e-9 &&
      Math.abs(DR(4, 3600, 240) - 16) < 1e-9);
check('entradas absurdas no dividen por cero',
      isFinite(PPS(0, 0)) && PPS(0, 0) > 0 && isFinite(DR(null, null, null)));
// MUTANTE: la cadencia vieja, con su rótulo. Tiene que salir muy lejos de ×1.
(function () {
  const msViejo = Math.max(40, 320 / 2);            // «×1» de antes
  const factorReal = (1 /* min por paso */ * 60) / (msViejo / 1000);
  check('MUTANTE: el «×1» viejo iba en realidad a ×' + Math.round(factorReal),
        factorReal > 100);
})();

// ── 7bis) el avance no depende de CÓMO venga troceado el tiempo ──────────
// Es la propiedad que el `setInterval` no tenía y por la que «le costaba
// cargar y de golpe saltaba horas»: cuando un fotograma tarda más que el
// intervalo, el navegador ENCOLA las llamadas y luego las ejecuta seguidas.
// Con acumulador no hay cola: se avanza el tiempo real transcurrido.
const AV = ctx.avancePasos;
function corre(dts, factor, stepMin) {
  let acc = 0, total = 0, mayorSalto = 0;
  dts.forEach(dt => {
    const r = AV(acc, dt, factor, stepMin);
    acc = r.acc; total += r.pasos;
    mayorSalto = Math.max(mayorSalto, r.pasos);
  });
  return { total, mayorSalto };
}
(function () {
  const f = 3600, stepMin = 4;
  const suave = new Array(600).fill(1 / 60);            // 10 s a 60 fps
  const atasco = new Array(60).fill(1 / 6);             // 10 s a 6 fps
  const mixto = [];                                     // 10 s con un parón
  for (let i = 0; i < 540; i++) mixto.push(1 / 60);
  mixto.push(1.0);                                      // un fotograma de 1 s
  const a = corre(suave, f, stepMin), b = corre(atasco, f, stepMin), c = corre(mixto, f, stepMin);
  check('10 s reales avanzan lo mismo a 60 fps que a 6 fps (' +
        a.total + ' vs ' + b.total + ' pasos)', Math.abs(a.total - b.total) <= 1);
  check('y lo mismo con un parón de 1 s en medio (' + c.total + ')',
        Math.abs(a.total - c.total) <= 1);
  check('a 60 fps se avanza de uno en uno (mayor salto ' + a.mayorSalto + ')',
        a.mayorSalto <= 1);
  check('un parón de 1 s se paga en UN salto, no en veinte fotogramas (' +
        c.mayorSalto + ' pasos)', c.mayorSalto >= 10 && c.mayorSalto <= 20);
})();
check('sin tiempo no se avanza', AV(0, 0, 3600, 4).pasos === 0);
check('el resto se guarda para el fotograma siguiente',
      AV(0, 1 / 60, 60, 4).pasos === 0 && AV(0, 1 / 60, 60, 4).acc > 0);
// MUTANTE: el `setInterval` de antes. Con fotogramas de 167 ms y un intervalo
// de 67 ms, el navegador encola 2,5 llamadas por fotograma — y esa cola es
// justo lo que se veía como un salto de horas.
check('MUTANTE: con intervalo fijo de 67 ms y fotogramas de 167 ms se encolan ' +
      (167 / 67).toFixed(1) + ' llamadas por fotograma', 167 / 67 > 2);

// ── 8) ninguna velocidad ofrecida deja la escena congelada ───────────────
// El reproductor NO tiene tiempo continuo: la ventana viene muestreada a 240
// pasos como mucho, así que con paso de 4 min un ×60 avanza una muestra cada
// CUATRO SEGUNDOS. Ofrecer esa velocidad es ofrecer algo que parece roto — y
// es exactamente lo que se vio. Las opciones se construyen con la ventana
// delante y en la unidad que importa: cuánto tarda en reproducirse entera.
const OP = ctx.opcionesRepro, FD = ctx.factorPorDefecto;
[[4, 240], [1, 240], [10, 96], [15, 64], [30, 32], [60, 16], [4, 20], [1, 6]]
  .forEach(c => {
    const [stepMin, pasos] = c;
    const ops = OP(stepMin, pasos);
    const lentas = ops.filter(o => pasos / o.seg < ctx.REPRO_MIN_PASOS_S);
    check('paso ' + stepMin + ' min · ' + pasos + ' pasos -> ' + ops.length +
          ' opciones, la más lenta a ' + (pasos / ops[0].seg).toFixed(1) + ' pasos/s',
          ops.length >= 1 && lentas.length === 0,
          ops.map(o => o.seg + 's ×' + o.factor).join(' '));
  });
check('el factor de cada opción es el ×N honesto',
      OP(4, 240).every(o => Math.abs(o.factor - (240 / o.seg) * 4 * 60) < 1));
check('el default es el más cercano a los ' + ctx.REPRO_DEF_S + ' s',
      (function () {
        const ops = OP(4, 240), f = FD(4, 240);
        const el = ops.find(o => o.factor === f);
        return !!el && ops.every(o =>
          Math.abs(o.seg - ctx.REPRO_DEF_S) >= Math.abs(el.seg - ctx.REPRO_DEF_S));
      })());
// MUTANTE: la lista fija anterior, sobre la ventana habitual.
(function () {
  const stepMin = 4, pasos = 240;
  const pps = 60 / 60 / stepMin;                    // el ×60 que se ofrecía
  check('MUTANTE: el ×60 fijo avanzaba una muestra cada ' + (1 / pps).toFixed(0) +
        ' s con paso de ' + stepMin + ' min', 1 / pps >= 4);
})();

// ── 9) la caja de sombras no puede depender del RUMBO del sol ────────────
// Estaba dimensionada con el ancho y el largo del MUNDO, pero sus ejes son los
// de la LUZ y giran con ella. Lo que queda fuera no proyecta ni recibe sombra,
// así que unos bloques salían sombreados y los de al lado no — por el encuadre
// de la sombra, no por la física. Se reproduce aquí lo que hace three.js.
(function () {
  const V = (x, y, z) => ({ x, y, z });
  const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
  const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const norm = a => { const m = Math.hypot(a.x, a.y, a.z) || 1; return V(a.x / m, a.y / m, a.z / m); };
  // escena real de la comparativa: 6 casos, 10 trackers bifila
  const anchoTot = 396, largoTot = 174.8, largoBloque = 65, alto = 6;
  const d = Math.max(anchoTot, largoTot + 20) * 0.88, R = Math.max(320, d * 1.5);
  const esq = [];
  for (let sx = -1; sx <= 1; sx += 2) for (let sy = 0; sy <= 1; sy++) for (let sz = -1; sz <= 1; sz += 2)
    esq.push(V(sx * (anchoTot / 2 + largoBloque / 2), sy * alto, sz * (largoTot / 2 + largoBloque / 2)));
  function barre(lx, ly, near, far) {
    let fuera = 0, total = 0, peor = 0;
    for (let el = 5; el <= 85; el += 5) for (let az = 0; az < 360; az += 10) {
      const e = el * Math.PI / 180, a = az * Math.PI / 180;
      const dir = V(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
      const tgt = V(0, 8, 0);
      const pos = V(tgt.x + dir.x * R, tgt.y + dir.y * R, tgt.z + dir.z * R);
      const zA = norm(sub(pos, tgt)), xA = norm(cross(V(0, 1, 0), zA)), yA = cross(zA, xA);
      let malo = false;
      esq.forEach(p => {
        const r = sub(p, pos), px = dot(r, xA), py = dot(r, yA), pd = -dot(r, zA);
        if (Math.abs(px) > lx || Math.abs(py) > ly || pd < near || pd > far) {
          malo = true; peor = Math.max(peor, Math.max(Math.abs(px) - lx, Math.abs(py) - ly));
        }
      });
      total++; if (malo) fuera++;
    }
    return { fuera, total, peor };
  }
  const Rsom = 0.5 * Math.hypot(anchoTot + largoBloque, largoTot + largoBloque) + 8;
  const ok = barre(Rsom, Rsom, Math.max(1, R - Rsom * 1.25), R + Rsom * 1.25);
  check('la caja por ESFERA cubre la escena desde las ' + ok.total +
        ' direcciones del sol', ok.fuera === 0, ok.fuera + ' fuera, peor ' + ok.peor.toFixed(0) + ' m');
  // MUTANTE: la caja anterior, dimensionada con ancho y largo del mundo.
  const mal = barre(anchoTot * 0.6, (largoTot + 20) * 0.8, 0.5, Math.max(2000, d * 6));
  check('MUTANTE: la caja por ancho/largo dejaba fuera el ' +
        Math.round(100 * mal.fuera / mal.total) + ' % de las direcciones',
        mal.fuera > mal.total * 0.5 && mal.peor > 50,
        mal.fuera + '/' + mal.total + ', peor ' + mal.peor.toFixed(0) + ' m');
})();

console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko)
                : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
process.exit(ko ? 1 : 0);
