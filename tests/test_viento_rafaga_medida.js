// LA RÁFAGA MEDIDA MANDA SOBRE EL MODELO — y antes no mandaba.
//
// El CSV de la HSU trae ráfaga: `LOC.parseCSV` la parsea en `o.gust`, pone
// `tiene_rafaga` y la ficha llega a anunciar «· trae ráfaga» en pantalla. Y al
// marcar la casilla de ráfaga, `LOC.scenario` hacía esto sin mirar:
//
//     ws = LOC.gust(ws, sc.gust_seed||sc.seed||42, pphG);   // el modelo, siempre
//
// Medido antes de tocar nada: `M.gust` NO lo leía nadie en toda la ficha. O sea
// que quien subía el histórico de su planta con ráfaga medida obtenía en su
// lugar una realización sintética de Cook/IEC, en silencio, y sobre ese número
// se contaban abanderamientos.
//
// Y había un segundo agujero delante: `LOC.resample` construía su objeto con
// `t` y `source` y nada más, así que remuestrear PERDÍA `gust`, `unidad` y
// `tiene_rafaga`. Con el paso por defecto de 1 min siempre se remuestrea, o sea
// que el informe declaraba «sin ráfaga» aunque la fuente la trajera.
//
// Este arnés fija las dos cosas sobre las funciones REALES extraídas del HTML
// —no una copia— y en los dos regímenes: con ráfaga medida y sin ella.
//
//   node tests/test_viento_rafaga_medida.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

// ── las funciones REALES, extraídas del HTML por firma ────────────────
// Se sacan una a una y no el bloque entero: el cuerpo del `<script>` arranca
// la UI y toca el DOM, así que ejecutarlo aquí moriría antes de definir nada.
// Es el mismo extractor que usa `test_viento_ejes.js`, y por el mismo motivo
// que allí: una copia daría verde mientras el original evoluciona.
const HTML = fs.readFileSync(path.join(__dirname, '..', 'sim-viento.html'), 'utf8');
function saca(firma) {
  const i = HTML.indexOf(firma);
  if (i < 0) return null;
  const j = HTML.indexOf('\n};', i);
  return j < 0 ? null : HTML.slice(i, j + 3);
}
const FIRMAS = ['LOC.resample=function(M,stepMin){', 'LOC.scenario=function(M,sc,lat,dtH){',
                'LOC.gust=function(ws,seed,pasosPorHora){',
                'LOC.windSynth=function(nh,k,A,lat,seed){',
                'LOC.kernel=function(dtMin,dur,shape){',
                'LOC.rng=function(seed){', 'LOC.norm=function(r){'];
const trozos = FIRMAS.map(saca);
check('las funciones siguen en el HTML con esa firma', trozos.every(Boolean),
      FIRMAS.filter((f, i) => !trozos[i]).join(' · '));
if (!trozos.every(Boolean)) { console.log('\nFALLOS: ' + ko); process.exit(1); }
// El vacío y lo casi vacío son error, no PASS: un extractor que se traiga dos
// líneas también compila.
check('lo extraído tiene cuerpo (' + trozos.join('').length + ' chars)',
      trozos.join('').length > 4000);

const ctx = { console, LOC: { D2R: Math.PI / 180 } };
vm.createContext(ctx);
try { vm.runInContext(trozos.join('\n'), ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;
check('quedan expuestas las tres que deciden',
      typeof LOC.resample === 'function' && typeof LOC.scenario === 'function'
      && typeof LOC.gust === 'function');

// ── una meteo horaria de mentira, CON ráfaga medida ───────────────────
// La ráfaga se pone MUY por encima de la media para que usarla o no sea
// distinguible sin ambigüedad: si el resultado no la refleja, es que se
// sintetizó.
const N = 48;
function meteo({ conRafaga }) {
  const M = { t: [], source: 'hsu', unidad: 'm/s',
    ghi: new Float64Array(N), dhi: new Float64Array(N), dni: new Float64Array(N),
    temp: new Float64Array(N), ws: new Float64Array(N), wd: new Float64Array(N) };
  if (conRafaga) { M.gust = new Float64Array(N); M.tiene_rafaga = true; }
  for (let i = 0; i < N; i++) {
    M.t.push(new Date(Date.UTC(2023, 0, 1) + i * 3600e3));
    M.ws[i] = 5;                       // media plana: 5 m/s
    M.wd[i] = 200;
    if (conRafaga) M.gust[i] = (i % 6 === 0) ? 30 : 7;   // picos medidos
  }
  return M;
}

// ── 1) el remuestreo no puede perder lo que no es serie ───────────────
const R = LOC.resample(meteo({ conRafaga: true }), 1);
check('remuestreando a 1 min, `tiene_rafaga` SOBREVIVE', R.tiene_rafaga === true);
check('y `unidad` también', R.unidad === 'm/s', String(R.unidad));
check('y la serie de ráfaga viaja', !!R.gust && R.gust.length === R.t.length,
      R.gust ? R.gust.length + ' vs ' + R.t.length : 'no viaja');

// La retención, que es lo que la hace legítima: 60 pasos con el valor de SU
// hora, no una rampa entre picos. Interpolar inventaría ráfagas intermedias.
const primeraHora = Array.from(R.gust.slice(0, 60));
check('la ráfaga se SOSTIENE dentro de la hora, no se interpola',
      primeraHora.every(v => v === primeraHora[0]) && primeraHora[0] === 30,
      'primeros: ' + primeraHora.slice(0, 4).join(',') + ' …');
check('y la hora siguiente tiene SU valor, no una mezcla',
      R.gust[60] === 7, String(R.gust[60]));

// ── 2) con ráfaga medida, el modelo NO se usa ─────────────────────────
const conM = LOC.resample(meteo({ conRafaga: true }), 1);
const dtH = (conM.t[1] - conM.t[0]) / 3600e3;
const S1 = LOC.scenario(conM, { base: 'meteo', use_gust: true }, 40, dtH);
check('con ráfaga medida, el origen se declara `medida`',
      S1.meta && S1.meta.gust_origen === 'medida',
      S1.meta && S1.meta.gust_origen);
check('el pico de la serie ES el medido (30), no uno sintetizado',
      Math.abs(Math.max.apply(null, Array.from(S1.ws)) - 30) < 1e-9,
      String(Math.max.apply(null, Array.from(S1.ws))));
check('y se publica la cobertura, para que un número bajo se pueda atribuir',
      typeof S1.meta.gust_cobertura_pct === 'number' && S1.meta.gust_cobertura_pct > 0,
      String(S1.meta && S1.meta.gust_cobertura_pct));
check('la nota DICE que no se sintetiza nada',
      /MEDIDA de la fuente/.test((S1.meta.not_modeled || '') + ' ' +
                                 JSON.stringify(S1.meta)));

// ── 3) sin ráfaga medida, el modelo entra y SE DECLARA ────────────────
const sinM = LOC.resample(meteo({ conRafaga: false }), 1);
const S2 = LOC.scenario(sinM, { base: 'meteo', use_gust: true }, 40, dtH);
check('sin ráfaga medida, el origen se declara `modelo`',
      S2.meta && S2.meta.gust_origen === 'modelo', S2.meta && S2.meta.gust_origen);
check('y la serie SÍ cambia respecto a la media (el modelo ha actuado)',
      Math.max.apply(null, Array.from(S2.ws)) > 5.0001,
      String(Math.max.apply(null, Array.from(S2.ws))));
check('la nota dice que si la fuente la trajera, mandaría ella',
      /mandaría ella/.test(JSON.stringify(S2.meta)));

// ── 4) donde la medida NO llega, no se inventa ────────────────────────
// Una fuente con ráfaga solo en la primera mitad: los pasos sin medida tienen
// que quedarse en la MEDIA, no rellenarse con el modelo. Mezclar procedencias
// en una serie es lo que hace que después un número no se pueda atribuir.
const parcial = meteo({ conRafaga: true });
for (let i = N / 2; i < N; i++) parcial.gust[i] = NaN;
const S3 = LOC.scenario(LOC.resample(parcial, 1),
                        { base: 'meteo', use_gust: true }, 40, dtH);
const segundaMitad = Array.from(S3.ws.slice(Math.floor(S3.ws.length / 2) + 60));
check('los pasos sin ráfaga medida se quedan en la media, no se rellenan',
      segundaMitad.every(v => Math.abs(v - 5) < 1e-9),
      'máx en la mitad sin medida: ' + Math.max.apply(null, segundaMitad));
check('y la cobertura lo refleja (no dice 100 %)',
      S3.meta.gust_cobertura_pct < 60, String(S3.meta.gust_cobertura_pct));

// ── 5) OPEN-METEO: la ráfaga se pide, y pedirla no puede romper nada ──
// La consulta lleva `wind_gusts_10m` de forma OPTIMISTA. Si el servicio no la
// reconoce, la petición falla ENTERA —no devuelve el resto sin ese campo— así
// que el camino principal no puede depender de que la sirva: se reintenta sin
// ella. Aquí se ejercitan los tres caminos con un `fetch` de mentira, que es lo
// único que se puede hacer sin red y lo único que hace falta.
const LOC2 = ctx.LOC;
for (const f of ['LOC.fetchYear=function(lat,lon,year,year1,sinRafaga){',
                 'LOC._omParse=function(j,sinRafaga){']) {
  const t = saca(f);
  check('se extrae ' + f.slice(4, f.indexOf('=')), !!t, f);
  if (t) vm.runInContext(t, ctx);
}
vm.runInContext("LOC.OM='a,b'; LOC.OM_RAFAGA='wind_gusts_10m';", ctx);

function cuerpoOM({ conGust }) {
  const H = { time: [], shortwave_radiation: [], diffuse_radiation: [],
    direct_normal_irradiance: [], temperature_2m: [], windspeed_10m: [],
    winddirection_10m: [] };
  if (conGust) H.wind_gusts_10m = [];
  for (let i = 0; i < 24; i++) {
    H.time.push('2023-01-01T' + String(i).padStart(2, '0') + ':00');
    H.shortwave_radiation.push(0); H.diffuse_radiation.push(0);
    H.direct_normal_irradiance.push(0); H.temperature_2m.push(15);
    H.windspeed_10m.push(5); H.winddirection_10m.push(200);
    if (conGust) H.wind_gusts_10m.push(21);
  }
  return { hourly: H };
}
// Un `fetch` que responde según lo que se le pida, y CUENTA las llamadas.
function fakeFetch({ aceptaGust, redCae }) {
  const urls = [];
  ctx.fetch = (u) => {
    urls.push(u);
    if (redCae) return Promise.reject(new Error('red caída'));
    const pide = /wind_gusts_10m/.test(u);
    if (pide && !aceptaGust)
      return Promise.resolve({ ok: false, status: 400 });     // la API la rechaza
    return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpoOM({ conGust: pide })) });
  };
  return urls;
}

// Todo lo asíncrono va dentro de un guardia: una promesa rechazada sin capturar
// mata el proceso con una traza en vez de dar un FAIL, y entonces el arnés deja
// de REPORTAR y pasa a explotar. Se vio con el mutante que quita el reintento.
process.on('unhandledRejection', e => {
  check('ninguna promesa queda sin capturar', false, String(e && e.message || e));
  console.log('\nFALLA — ' + ok + '/' + (ok + ko) + ' comprobaciones');
  process.exit(1);
});

(async () => {
 try {
  // (a) el servicio la sirve
  let urls = fakeFetch({ aceptaGust: true });
  let M = await LOC2.fetchYear(40, 0, 2023);
  check('OM · se PIDE la ráfaga en la consulta', /wind_gusts_10m/.test(urls[0]), urls[0]);
  check('OM · con ráfaga servida, `tiene_rafaga` queda en true', M.tiene_rafaga === true);
  check('OM · y la serie llega con el valor medido', M.gust && M.gust[0] === 21,
        M.gust ? String(M.gust[0]) : 'sin serie');
  check('OM · una sola llamada cuando todo va bien', urls.length === 1, String(urls.length));

  // (b) la API la RECHAZA: el camino principal no puede caerse
  urls = fakeFetch({ aceptaGust: false });
  M = await LOC2.fetchYear(40, 0, 2023);
  check('OM · si la API rechaza la ráfaga, la meteo SIGUE llegando',
        !!M && M.ws && M.ws.length === 24);
  check('OM · y se reintenta SIN ella (dos llamadas, la segunda sin el campo)',
        urls.length === 2 && !/wind_gusts_10m/.test(urls[1]),
        urls.length + ' llamadas');
  check('OM · la ausencia va DECLARADA, no callada',
        M.rafaga_no_servida === true && !M.tiene_rafaga);

  // (c) la red cae de verdad: se propaga, no se disfraza de «sin ráfaga»
  urls = fakeFetch({ redCae: true });
  let err = null;
  try { await LOC2.fetchYear(40, 0, 2023); } catch (e) { err = e; }
  check('OM · si la red cae, el error se PROPAGA (no se lee como «sin ráfaga»)',
        !!err && /red caída/.test(err.message), err && err.message);
  check('OM · y el reintento se gasta UNA vez, no en bucle',
        urls.length === 2, urls.length + ' llamadas');

 } catch (e) {
   check('el camino de Open-Meteo no revienta', false, String(e && e.message || e));
 }
  console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();

// ── MUTANTE ───────────────────────────────────────────────────────────
// El defecto original, reproducido: sintetizar aunque haya medida. Si este
// arnés no lo cazara, no estaría midiendo lo que dice medir.
const mut = LOC.resample(meteo({ conRafaga: true }), 1);
const mutWs = LOC.gust(Float64Array.from(mut.ws), 42,
                       Math.max(1, Math.round(1 / dtH)));
check('MUTANTE: el modelo sobre esta misma media NO da el pico medido',
      Math.abs(Math.max.apply(null, Array.from(mutWs)) - 30) > 1,
      'el modelo da ' + Math.max.apply(null, Array.from(mutWs)).toFixed(2) +
      ' y la medida 30: si coincidieran, este banco no distinguiría');

