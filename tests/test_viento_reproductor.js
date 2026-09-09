// El reproductor del modo episodio: PASAR DE LA BARRA ES SEGUIR EN EL TIEMPO.
//
// «Si pasa la barra debe cambiar de día.» No lo hacía. La ventana del 3D es la
// del episodio de viento más caro del año, y al llegar a su último paso el
// reproductor volvía a su primer instante — `(TPOS+pasos) % t.length` —, así que
// con un año entero de meteo detrás la escena se quedaba dando vueltas al mismo
// día y la fecha del rótulo no pasaba nunca de la del episodio.
//
// Lo que se fija aquí no es «hay un botón», es la propiedad que hace honesta la
// reproducción: la ventana siguiente EMPIEZA DONDE ACABA la anterior, sin hueco
// ni solape. Por eso se corre por su propio ancho y no por 24 h fijas: con una
// ventana de 36 h saltar un día repetiría doce horas ya vistas, y con una de 16 h
// se saltaría ocho sin enseñarlas. Las dos versiones «cambian de día» y solo una
// enseña el año que hay debajo.
//
// Y los dos límites, que van medidos y no supuestos:
//   · la serie del año se RETIENE muestreada al paso de la ventana, no al del
//     cálculo (con el default minutal serían más de cien megas retenidos para
//     pintar 240 pasos). El paso queda declarado en `window.step_minutes`.
//   · por el camino del MOTOR el informe llega por HTTP y NO trae serie: ahí no
//     se puede correr la ventana, los botones se apagan y el rótulo lo DICE. Un
//     reproductor que da la vuelta sin explicarlo se lee como el defecto de antes.
//
// La meteo se INYECTA: sin un año sintético con episodios de viento no hay
// ventana que correr, y el arnés dependería de que Open-Meteo esté arriba.
//
//   node tests/test_viento_reproductor.js      (necesita el servidor en :8099)
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (x ? ' -> ' + x : '')); } };

// Año sintético con viento que sube y baja: los senos de periodo corto dan los
// episodios y el largo los reparte por el año, para que la ventana del peor no
// caiga pegada a un extremo (y `‹` o `›` quedarían apagados por el borde, no por
// el código).
const meteoSint = () => {
  const n = 8760, h = { time: [], shortwave_radiation: [], diffuse_radiation: [],
    direct_normal_irradiance: [], temperature_2m: [], windspeed_10m: [], winddirection_10m: [] };
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2023, 0, 1) + i * 3600e3);
    h.time.push(d.toISOString().slice(0, 16));
    const el = Math.max(0, Math.sin((i % 24 - 6) / 12 * Math.PI));
    h.shortwave_radiation.push(el * 900); h.diffuse_radiation.push(el * 130);
    h.direct_normal_irradiance.push(el * 700); h.temperature_2m.push(15);
    h.windspeed_10m.push(8 + 9 * Math.sin(i / 5) + 8 * Math.sin(i / 733));
    h.winddirection_10m.push(225);
  }
  return { hourly: h };
};

// Un paso de reloj REAL que avanza exactamente una muestra: es el régimen del
// bucle de fotogramas, y el único donde se ve dónde cae la costura. Con un `dt`
// grande el resto de la división tapa la diferencia entre seguir y dar la vuelta.
const UN_PASO = `1.001 / pasosPorSegundo(TL.window.step_minutes, +document.getElementById('tspeed').value)`;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.route('**/archive-api.open-meteo.com/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(meteoSint()) }));
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#run', { timeout: 15000 });
  await page.click('#run');
  await page.waitForFunction(() => window.REP && REP.timeline, { timeout: 120000 });
  await page.waitForTimeout(800);

  // ── la serie retenida ───────────────────────────────────────────────
  const base = await page.evaluate(() => ({
    tieneSrc: !!REP.__src,
    srcDtMin: REP.__src ? REP.__src.dtH * 60 : null,
    enJSON: Object.keys(JSON.parse(JSON.stringify(REP))).includes('__src'),
    win: REP.timeline.window,
  }));
  check('la serie del año se retiene y NO viaja en el informe',
        base.tieneSrc && !base.enJSON, JSON.stringify(base));
  check('retenida al paso de la VENTANA, no al del cálculo (' + base.srcDtMin + ' min)',
        Math.abs(base.srcDtMin - base.win.step_minutes) < 1e-6,
        base.srcDtMin + ' vs ' + base.win.step_minutes);

  await page.click('#mEp');
  await page.waitForTimeout(600);
  const v0 = await page.evaluate(() => ({ start: TL.window.start, end: TL.window.end,
    steps: TL.window.steps, paso: TL.window.step_minutes, esEpisodio: TL === VENT0,
    hint: document.getElementById('c3hint').textContent }));
  check('el modo episodio arranca en la ventana del informe, con su mismo muestreo',
        v0.start === base.win.start && v0.end === base.win.end && v0.steps === base.win.steps
        && v0.paso === base.win.step_minutes && v0.esEpisodio, JSON.stringify(v0));
  check('y el rótulo dice QUÉ TRAMO se está viendo (sin fechas, dos ventanas se leen iguales)',
        /→/.test(v0.hint) && /pasos de/.test(v0.hint), v0.hint);

  // ── correr la ventana a mano ────────────────────────────────────────
  const v1 = await page.evaluate(() => {
    const antes = TL.window.end;
    const pudo = correVentana(1, 0);
    return { pudo, antes, start: TL.window.start, end: TL.window.end,
             paso: TL.window.step_minutes, esEpisodio: TL === VENT0 };
  });
  check('la ventana siguiente EMPIEZA donde acaba la anterior: sin hueco ni solape',
        v1.pudo && Date.parse(v1.start) > Date.parse(v1.antes)
        && Date.parse(v1.start) - Date.parse(v1.antes) <= v1.paso * 60e3 + 1,
        v1.antes + ' -> ' + v1.start);
  check('y CAMBIA DE DÍA: ya no es el día del episodio',
        v1.start.slice(0, 10) !== v0.start.slice(0, 10), v0.start + ' -> ' + v1.start);
  check('el paso NO se mueve al correr la ventana (la velocidad elegida sigue valiendo)',
        v1.paso === v0.paso, v0.paso + ' -> ' + v1.paso);

  // Esta comprobación vigila la SIMETRÍA de la ida y la vuelta, y NO la
  // continuidad: se predijo que el mutante de las 24 h la mataría y no lo hizo
  // —correr 24 h hacia delante y 24 h hacia atrás devuelve a los mismos
  // límites, mal ancho incluido—. Queda escrito para que nadie la lea como una
  // segunda guardia del hueco: la del hueco es la de arriba, y la del
  // reproductor es la de la costura.
  const v2 = await page.evaluate(() => ({ pudo: correVentana(-1), start: TL.window.start }));
  check('y se puede volver: la ida y la vuelta son simétricas',
        v2.pudo && v2.start === v0.start, JSON.stringify(v2));
  check('correr el reproductor NO toca REP.timeline, que lee el resto de la ficha',
        await page.evaluate(() => REP.timeline.window.start) === base.win.start);

  // ── EL MUTANTE: correr 24 h fijas en vez del ancho de la ventana ────
  // Las dos versiones cambian de día, así que un test que solo mirara la fecha
  // daría verde con las dos. Lo que distingue es la CONTINUIDAD, y es lo que
  // este mutante tiene que poner en rojo.
  const mut = await page.evaluate(() => {
    const bueno = window.ventanaVecina;
    window.ventanaVecina = function (dir) {
      const a = Date.parse(TL.window.start), b = Date.parse(TL.window.end);
      return { t0: a + dir * 864e5, t1: b + dir * 864e5 };
    };
    const antes = TL.window.end, paso = TL.window.step_minutes;
    correVentana(1, 0);
    const salto = Date.parse(TL.window.start) - Date.parse(antes);
    window.ventanaVecina = bueno;
    build3D();
    return { salto, paso, continuo: salto > 0 && salto <= paso * 60e3 + 1 };
  });
  check('MUTANTE: corriendo 24 h fijas la costura deja de ser continua',
        mut.continuo === false, 'salto de ' + (mut.salto / 6e4) + ' min con paso de ' + mut.paso);

  // ── reproducción: al pasar de la barra el reloj sigue ───────────────
  const play = await page.evaluate(new Function('return (async () => {' +
    'update3D(TL.t.length - 1);' +
    'const antes = { t: TL.t[TPOS], win: TL.window.start };' +
    'EPACC = 0; PLAY = true; epTick(' + UN_PASO + '); PLAY = false;' +
    'return { antes, ahora: TL.t[TPOS], win: TL.window.start, finWin: TL.window.end };' +
    '})()'));
  check('la costura del reproductor es el instante SIGUIENTE, no el primero de la ventana',
        Date.parse(play.ahora) - Date.parse(play.antes.t) <= v0.paso * 60e3 + 1
        && Date.parse(play.ahora) > Date.parse(play.antes.t), JSON.stringify(play));
  check('o sea que al pasar de la barra cambia de VENTANA en vez de repetirla',
        play.win !== play.antes.win, JSON.stringify(play));
  check('y la nueva llega a un día que la del episodio no tenía',
        play.finWin.slice(0, 10) > v0.end.slice(0, 10),
        v0.start + '..' + v0.end + ' -> ' + play.win + '..' + play.finWin);

  // ── el final del año no es un sitio donde quedarse clavado ──────────
  const fin = await page.evaluate(new Function('return (async () => {' +
    'const SRC = REP.__src, ult = SRC.t[SRC.t.length - 1].getTime();' +
    'const ancho = Date.parse(TL.window.end) - Date.parse(TL.window.start);' +
    'ponVentana(LOC.ventana(SRC, ult - ancho, ult), 0);' +
    'const enFin = { hay: hayVentana(1), off: document.getElementById("tnext").disabled };' +
    'update3D(TL.t.length - 1); EPACC = 0; PLAY = true; epTick(' + UN_PASO + '); PLAY = false;' +
    'return { enFin, tras: TL.window.start, volvio: TL === VENT0 };' +
    '})()'));
  check('en la última ventana del año el botón de avanzar se APAGA',
        fin.enFin.hay === false && fin.enFin.off === true, JSON.stringify(fin.enFin));
  check('y al pasar de la barra se vuelve al episodio en vez de quedarse clavado',
        fin.volvio === true && fin.tras === base.win.start, JSON.stringify(fin));

  // ── sin serie (informe del motor): se declara, y da la vuelta ───────
  const sin = await page.evaluate(new Function('return (async () => {' +
    'const src = REP.__src; delete REP.__src; build3D();' +
    'const hint = document.getElementById("c3hint").textContent;' +
    'const off = document.getElementById("tnext").disabled && document.getElementById("tprev").disabled;' +
    'update3D(TL.t.length - 1); EPACC = 0; PLAY = true; epTick(' + UN_PASO + '); PLAY = false;' +
    'const dioVuelta = TPOS === 0 && TL === VENT0;' +
    'Object.defineProperty(REP, "__src", { value: src, enumerable: false, configurable: true });' +
    'build3D();' +
    'return { hint, off, dioVuelta };' +
    '})()'));
  check('sin serie del año los dos botones se apagan y el rótulo lo DICE',
        sin.off && /no trae la serie del año/.test(sin.hint), sin.hint);
  check('y ahí la barra da la vuelta, que es la única conducta posible',
        sin.dioVuelta, JSON.stringify(sin));

  check('la ficha no lanza errores de JS', errores.length === 0, errores.join(' | '));
  await browser.close();
  console.log((ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();
