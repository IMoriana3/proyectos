// EL TROCEADO POR AÑOS Y LA FUENTE REDUCIDA — dos piezas de fontanería de las
// que cuelgan un número de diseño y la velocidad del reproductor.
//
// `LOC.runMulti` parte una meteo de varios años en años naturales, corre cada
// uno y devuelve sus MÁXIMOS. Esos máximos son exactamente lo que come
// `LOC.gumbel` para dar el viento de periodo de retorno a 50 y 100 años, así
// que un error en el troceado —un año que se come una hora del siguiente, un
// máximo atribuido al año equivocado— no da un fallo: da otro viento de
// diseño.
//
// `LOC.fuenteReducida` submuestrea la fuente del reproductor 3D y ESCALA su
// paso de tiempo. Si el paso no se escalara, la animación seguiría corriendo
// pero el año entero pasaría k veces más deprisa, y no hay nada en pantalla
// que lo delate.
//
// MEDIDO: ninguna de las dos aparecía en ningún arnés.
//
// CÓMO SE PRUEBA UNA ORQUESTACIÓN SIN EL MOTOR
// ---------------------------------------------
// `runMulti` llama a `LOC.run`, que es la simulación entera. Traerla aquí
// sería probar el motor y no el reparto. En su lugar se le pone un ESPÍA en el
// sitio de `LOC.run`: registra lo que recibe y devuelve un resultado de
// mentira. Lo que queda bajo prueba es exactamente lo que no tenía banco —
// qué trozo le toca a cada año, en qué orden, con qué banderas, y de dónde
// sale cada máximo.
//
// Se extrae del HTML real, no se copia (misma regla que test_viento_ejes.js).
//
//   node tests/test_viento_multi.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };
process.on('unhandledRejection', e => {
  console.log('FAIL una promesa se rompió sin capturar -> ' + (e && e.message || e));
  console.log('\nFALLA — promesa sin capturar'); process.exit(1);
});

const html = fs.readFileSync(path.join(RAIZ, 'sim-viento.html'), 'utf8');
function saca(firma) {
  const i = html.indexOf(firma);
  if (i < 0) return null;
  const j = html.indexOf('\n};', i);
  return j < 0 ? null : html.slice(i, j + 3);
}
const FIRMAS = ['LOC.runMulti=function(cfg,onPaso){',
                'LOC.fuenteReducida=function(SRC,k){'];
const trozos = FIRMAS.map(saca);
check('las dos funciones siguen en el HTML con esa firma', trozos.every(Boolean),
      FIRMAS.filter((f, i) => !trozos[i]).join(' · '));
if (!trozos.every(Boolean)) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('lo extraído tiene cuerpo (' + trozos.join('').length + ' chars)',
      trozos.join('').length > 900);

// El ESPÍA ocupa el sitio de `LOC.run`. Guarda cada `cfg` que recibe y
// devuelve un informe de mentira cuyo `wind.max_ms` es el máximo REAL del
// trozo: así el careo de máximos mide el reparto, no una constante.
function conEspia() {
  const llamadas = [];
  const c = { console, Promise, Object, Date, Math, Array, Float64Array,
              LOC: {
                run: function (cfg) {
                  llamadas.push(cfg);
                  const ws = cfg.meteoPre.ws;
                  let mx = -Infinity;
                  for (let i = 0; i < ws.length; i++) if (ws[i] > mx) mx = ws[i];
                  return Promise.resolve({ wind: { max_ms: mx }, _año: cfg.year });
                }
              } };
  vm.createContext(c);
  vm.runInContext(trozos.join('\n'), c);
  return { LOC: c.LOC, llamadas };
}
const { LOC: L0 } = conEspia();
check('quedan expuestas las dos',
      typeof L0.runMulti === 'function' && typeof L0.fuenteReducida === 'function');

// ── una meteo de TRES años, con un máximo distinto en cada uno ────────
// Los máximos van marcados a propósito y son distintos entre sí: si el
// troceado se equivocara de año, el careo lo vería en el valor y no solo en el
// recuento.
const AÑOS = [2021, 2022, 2023], PICOS = { 2021: 31, 2022: 44, 2023: 27 };
function meteoMulti() {
  const t = [], n = AÑOS.length * 40;
  const M = { t: [], source: 'hsu', unidad: 'm/s', tiene_rafaga: true,
              ghi: [], dhi: [], dni: [], temp: [], ws: [], wd: [] };
  AÑOS.forEach(function (y, k) {
    for (let i = 0; i < 40; i++) {
      M.t.push(new Date(Date.UTC(y, 5, 1 + Math.floor(i / 24), i % 24)));
      ['ghi', 'dhi', 'dni', 'temp', 'wd'].forEach(c => M[c].push(0));
      M.ws.push(i === 17 ? PICOS[y] : 5 + (i % 4));
    }
  });
  ['ghi', 'dhi', 'dni', 'temp', 'ws', 'wd'].forEach(c => { M[c] = Float64Array.from(M[c]); });
  return M;
}

(async function () {
  // ══════════════════════════════════════════════════════════════════
  //  1) EL TROCEADO POR AÑOS
  // ══════════════════════════════════════════════════════════════════
  const { LOC, llamadas } = conEspia();
  const pasos = [];
  const R = await LOC.runMulti({ year: 2021, year1: 2023, lat: 40, lon: 0,
                                 meteoPre: meteoMulti(), timeline: { algo: 1 } },
                               (k, tot, y) => pasos.push([k, tot, y]));

  check('corre una vez por año, ni una más', llamadas.length === AÑOS.length,
        String(llamadas.length));
  check('y en orden ascendente', llamadas.map(c => c.year).join(',') === AÑOS.join(','),
        llamadas.map(c => c.year).join(','));
  check('devuelve un informe por año, con su etiqueta',
        R.anos.map(a => a.year).join(',') === AÑOS.join(','),
        R.anos.map(a => a.year).join(','));

  // EL TROZO DE CADA AÑO CONTIENE SU AÑO Y NADA MÁS. Un solapamiento de una
  // hora movería un pico de año y con él el máximo anual.
  llamadas.forEach(function (c, k) {
    const y = AÑOS[k], ts = c.meteoPre.t;
    check('el trozo de ' + y + ' empieza y acaba dentro de ' + y,
          ts[0].getUTCFullYear() === y && ts[ts.length - 1].getUTCFullYear() === y,
          ts[0].toISOString() + ' … ' + ts[ts.length - 1].toISOString());
    check('y no se deja ninguna hora de ' + y + ' fuera', ts.length === 40,
          String(ts.length));
  });

  // LOS MÁXIMOS, que son lo que come Gumbel. Se carean contra los picos
  // marcados: si el reparto se torciera, aquí saldría el número de otro año.
  check('los máximos anuales son los de SU año, en su orden',
        R.maximos.join(',') === AÑOS.map(y => PICOS[y]).join(','),
        R.maximos.join(',') + ' vs ' + AÑOS.map(y => PICOS[y]).join(','));

  // Las banderas caras solo van al PRIMER año: la traza y la línea de tiempo
  // del reproductor no caben tres veces en memoria.
  check('la línea de tiempo se pide solo para el primer año',
        llamadas[0].timeline != null && llamadas.slice(1).every(c => c.timeline == null),
        llamadas.map(c => c.timeline ? '1' : '0').join(''));
  check('y la traza también', llamadas[0].include_trace === true
        && llamadas.slice(1).every(c => c.include_trace === false),
        llamadas.map(c => c.include_trace ? '1' : '0').join(''));

  // Los campos que NO son serie viajan a cada trozo: sin ellos el motor
  // decidiría por defecto y, por ejemplo, dejaría de usar la ráfaga medida.
  check('cada trozo conserva la procedencia, la unidad y si trae ráfaga',
        llamadas.every(c => c.meteoPre.source === 'hsu' && c.meteoPre.unidad === 'm/s'
                            && c.meteoPre.tiene_rafaga === true));

  check('el aviso de progreso llega una vez por año, con el total',
        pasos.length === 3 && pasos[0][1] === 3 && pasos[2][2] === 2023,
        JSON.stringify(pasos));

  // Un solo año no es un caso especial: tiene que dar una llamada y un máximo.
  const uno = conEspia();
  const R1 = await uno.LOC.runMulti({ year: 2022, lat: 40, lon: 0,
                                      meteoPre: meteoMulti() });
  check('con `year1` ausente sigue partiendo por los años que HAY en la serie',
        R1.maximos.length === 3, String(R1.maximos.length));

  // ══════════════════════════════════════════════════════════════════
  //  2) LA FUENTE REDUCIDA
  // ══════════════════════════════════════════════════════════════════
  const N = 100;
  const SRC = { t: Array.from({ length: N }, (_, i) => new Date(Date.UTC(2023, 0, 1, 0, i))),
                el: Float64Array.from({ length: N }, (_, i) => i),
                azp: Float64Array.from({ length: N }, (_, i) => 180 + i),
                ws: Float64Array.from({ length: N }, (_, i) => i * 0.1),
                wd: Float64Array.from({ length: N }, (_, i) => i),
                thB: Float64Array.from({ length: N }, (_, i) => -i),
                poaB: Float64Array.from({ length: N }, (_, i) => i * 2),
                dtH: 1 / 60, max_steps: 240,
                series: { A1: { theta: Float64Array.from({ length: N }, (_, i) => i),
                                poa: Float64Array.from({ length: N }, (_, i) => i),
                                mode: Array.from({ length: N }, (_, i) => 'M' + i) } } };
  const K = 5, RED = L0.fuenteReducida(SRC, K);
  check('con k ≤ 1 devuelve la MISMA fuente, sin copiarla',
        L0.fuenteReducida(SRC, 1) === SRC && L0.fuenteReducida(SRC, 0) === SRC);
  check('con k = ' + K + ' se queda con una de cada ' + K,
        RED.t.length === Math.ceil(N / K), String(RED.t.length));
  check('y son las muestras 0, ' + K + ', ' + 2 * K + ' … (no una media)',
        RED.el[0] === 0 && RED.el[1] === K && RED.el[2] === 2 * K,
        [RED.el[0], RED.el[1], RED.el[2]].join(','));

  // EL PASO ESCALA. Es lo que hace que el reproductor tarde lo mismo en pasar
  // el año: sin esto la animación va k veces más deprisa y nada lo delata.
  check('el paso de tiempo se ESCALA por k (el año dura lo mismo)',
        Math.abs(RED.dtH - SRC.dtH * K) < 1e-15,
        RED.dtH + ' vs ' + SRC.dtH * K);
  check('y el tramo cubierto es el mismo',
        Math.abs((RED.t.length - 1) * RED.dtH - (Math.ceil(N / K) - 1) * SRC.dtH * K) < 1e-12);
  check('el tope de pasos del reproductor viaja intacto', RED.max_steps === 240);

  // Las series por estrategia viajan enteras, incluida la ORDEN, que es
  // distinta del ángulo ejecutado y es lo que la tarjeta enseña.
  check('cada serie conserva θ, POA y modo', RED.series.A1.theta[1] === K
        && RED.series.A1.poa[1] === K && RED.series.A1.mode[1] === 'M' + K,
        JSON.stringify([RED.series.A1.theta[1], RED.series.A1.poa[1], RED.series.A1.mode[1]]));
  check('y la ORDEN cae a θ cuando la serie no la trae, en vez de quedar vacía',
        RED.series.A1.orden && RED.series.A1.orden[1] === K,
        RED.series.A1.orden ? String(RED.series.A1.orden[1]) : 'no viaja');
  // Con orden propia, se respeta la suya y no se sustituye por θ.
  const conOrden = Object.assign({}, SRC, { series: { A1: Object.assign({},
    SRC.series.A1, { orden: Float64Array.from({ length: N }, (_, i) => 1000 + i) }) } });
  check('y cuando SÍ la trae, se respeta la suya',
        L0.fuenteReducida(conOrden, K).series.A1.orden[1] === 1000 + K,
        String(L0.fuenteReducida(conOrden, K).series.A1.orden[1]));

  // ── MUTANTE ─────────────────────────────────────────────────────────
  // El defecto que no se vería en pantalla: no escalar el paso. La animación
  // corre igual de suave y el año pasa cinco veces más deprisa.
  const cM = { console, Promise, Object, Date, Math, Array, Float64Array, LOC: {} };
  vm.createContext(cM);
  vm.runInContext(trozos.join('\n').replace('dtH:SRC.dtH*k,', 'dtH:SRC.dtH,'), cM);
  const REDM = cM.LOC.fuenteReducida(SRC, K);
  check('MUTANTE: sin escalar el paso, la fuente reducida cubre k veces menos tiempo',
        Math.abs(REDM.dtH - RED.dtH) > 1e-12,
        'mutado ' + REDM.dtH + ' · bueno ' + RED.dtH +
        ': si coincidieran, este banco no distinguiría la escala del reproductor');

  console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();
