// LA ORQUESTACIÓN: `LOC.run` monta la simulación entera, y `LOC.fetchHSU` trae
// el histórico del SCADA. Ninguna de las dos tenía banco propio.
//
// Los veinte arneses de viento prueban PIEZAS —`theta`, `control`, `poa`,
// `single`, `dual`, `pasivo`, `rosa`, `gumbel`…— y cada uno la suya. Lo que
// nadie miraba es el MONTAJE: en qué orden se llaman, qué se le pasa a cada
// una y qué sale del conjunto. Y ahí viven decisiones que no son de ninguna
// pieza:
//
//   · la LÍNEA BASE también pasa por el lazo de control antes de convertirse
//     en POA. Si no pasara, la referencia sería un seguidor que teletransporta
//     y TODOS los deltas de todas las estrategias saldrían inflados;
//   · la CONSIGNA se guarda antes del lazo, que es lo que permite dibujar la
//     orden y el recorrido como dos cosas distintas;
//   · el límite de mediodía es de las estrategias B y no de las A;
//   · las A se orientan por el rumbo del VIENTO y las B por el azimut del SOL.
//
// MEDIDO el 2026-09-10 sobre `LOC.fetchHSU`, con el mutante verificado
// aplicado en disco y corrido contra los VEINTE arneses que abren la ficha:
// poner las horas por defecto a 24 en vez de 720 mató CERO. Es lo esperable —
// ningún arnés la nombra— y por eso este fichero existe.
//
// `LOC.run` se prueba SIN RED: `cfg.meteoPre` corta la descarga y deja
// inyectar la meteo. No es un atajo del banco, es una entrada de primera clase
// de la función —la misma que usa el camino del CSV y el del SCADA— y aquí se
// comprueba además que de verdad corta: cualquier petición a fuera se aborta.
//
//   python3 -m http.server 8099
//   node tests/test_viento_orquestacion.js
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };
const cerca = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;

// La meteo de entrada se construye DENTRO de la página, para que las series
// sean `Float64Array` de verdad y no arrays convertidos al cruzar el puente.
//
// El episodio está puesto a mano y con criterio: sube por encima del segundo
// umbral, se mantiene, y termina en CALMA. Sin la cola en calma el episodio no
// se cierra y el recuento de eventos no prueba lo que dice — es la lección que
// ya costó una vuelta en `test_viento_steppers`.
const FIXTURE = (dias, rumbo) => `(function(){
  var n = ${dias} * 24, t = new Array(n);
  var ghi = new Float64Array(n), dhi = new Float64Array(n), dni = new Float64Array(n);
  var temp = new Float64Array(n), ws = new Float64Array(n), wd = new Float64Array(n);
  var gust = new Float64Array(n);
  var t0 = Date.UTC(2024, 2, 1, 0, 0, 0);
  for (var i = 0; i < n; i++) {
    t[i] = new Date(t0 + i * 3600e3);
    var h = i % 24;
    var el = Math.max(0, Math.sin((h - 6) / 12 * Math.PI));
    ghi[i] = el * 850; dhi[i] = ghi[i] * 0.16;
    dni[i] = el > 0 ? (ghi[i] - dhi[i]) / Math.max(el, 0.087) : 0;
    temp[i] = 14;
    // Día 1 al borde · día 2 con temporal · día 3 al borde · día 4 con un
    // temporal CORTO QUE EMPIEZA AL MEDIODÍA.
    //
    // Los 9,5 m/s NO son un número cualquiera: son 34,2 km/h, justo POR DEBAJO
    // del primer umbral (40). Cizallados a 60 m —factor (60/10)^(1/7) = 1,29—
    // pasan a 44,1 km/h y lo CRUZAN. La primera versión de esta fixture usaba
    // 3 y 6 m/s, tan lejos del umbral que cambiar la altura no movía una sola
    // hora: el banco comparaba 13 h contra 13 h y se marcaba en rojo sin que
    // nada estuviera mal. Un mutante exige un fixture donde la mutación tenga
    // efecto, y una altura también.
    //
    // Ese segundo temporal tampoco es decorativo. MEDIDO sobre esta misma
    // fixture, el seguidor pasa por la banda del mediodía —[0°, 10°]— justo a
    // las 12:00 (θ = +6,28°). El temporal grande engancha a las 04:00, con el
    // seguidor a −5°, así que la REGLA DEL MEDIODÍA no podía dispararse nunca
    // y su mutante sobrevivía: no por un banco flojo, sino porque el escenario
    // no visitaba el sitio donde la regla decide.
    var d = Math.floor(i / 24);
    ws[i] = (d === 1) ? (h >= 4 && h <= 16 ? 22 : 9.5)
          : (d === 3 && h >= 12 && h <= 15) ? 22 : 9.5;
    // Y el rumbo de ESE temporal es del ESTE (90°) a propósito. La regla del
    // mediodía solo actúa cuando el azimut de referencia está POR DEBAJO de
    // 180° —«noonFlip» exige «sg > 0»—, así que con el viento a 225° no puede
    // dispararse a NINGUNA hora. Mi segunda hipótesis fue que faltaba la hora;
    // era el rumbo. Lo dijo el mutante al sobrevivir dos veces seguidas.
    wd[i] = (d === 3) ? 90 : ${rumbo}; gust[i] = ws[i] * 1.3;
  }
  return { t: t, ghi: ghi, dhi: dhi, dni: dni, temp: temp, ws: ws, wd: wd,
           gust: gust, source: 'banco', unidad: 'm/s', tiene_rafaga: true };
})()`;

const CFG = {
  lat: 41.5, lon: -1.0, year: 2024,
  resample_minutes: 60,           // sin remuestrear: la fixture ya es horaria
  wind_height_m: 10,
  threshold_1_kmh: 40, threshold_2_kmh: 60,
  slew_deg_s: 0.17, deadband_deg: 1.0,
  destow_hold_minutes: 30, partial_park_minutes: 0,
  partial_stow_min_abs_deg: 0, noon_limit_deg: 0,
  tracker: { max_angle_deg: 55, gcr: 0.397, backtrack: true },
  strategies: ['A1', 'A2', 'B1', 'B2'],
  // Las series por estrategia SOLO se retienen si se pide ventana: sin esto
  // `run` devuelve los agregados y nada más, y la primera versión de este
  // banco daba `undefined` al buscarlas donde no estaban.
  timeline: { hours: 120, max_steps: 600 },
};

async function corre(page, extra, dias) {
  return page.evaluate(async (a) => {
    const M = eval(a.fix);
    const extra = Object.assign({}, a.extra); delete extra.__rumbo;
    const cfg = Object.assign({}, a.cfg, extra, { meteoPre: M });
    const R = await LOC.run(cfg);
    // Se devuelve un resumen serializable: las series completas no cruzan bien
    // el puente y aquí lo que se juzga son invariantes, no cada muestra.
    const resumen = { cases: R.cases, config: R.config, baseline: R.baseline,
                      meteo: R.meteo, wind: R.wind };
    resumen._modo = {}; resumen._nOrden = {}; resumen._pasos = {};
    const TL = (R.timeline && R.timeline.cases) || {};
    Object.keys(TL).forEach(function (S) {
      const s = TL[S];
      resumen._modo[S] = Array.from(s.mode);
      let dif = 0, pasoOrden = 0, pasoTheta = 0;
      for (let i = 1; i < s.theta.length; i++) {
        if (Math.abs(s.orden[i] - s.theta[i]) > 1e-9) dif++;
        pasoOrden = Math.max(pasoOrden, Math.abs(s.orden[i] - s.orden[i - 1]));
        pasoTheta = Math.max(pasoTheta, Math.abs(s.theta[i] - s.theta[i - 1]));
      }
      resumen._nOrden[S] = dif;
      resumen._pasos[S] = { orden: pasoOrden, theta: pasoTheta };
    });
    resumen._pasosVentana = R.timeline ? R.timeline.window.steps : 0;
    return resumen;
  }, { fix: FIXTURE(dias || 4, (extra && extra.__rumbo) || 225), cfg: CFG, extra: extra || {} });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext();
  // TODO lo de fuera se corta. Es a la vez higiene del banco y comprobación:
  // si `meteoPre` no cortara la descarga, la simulación no terminaría.
  // La ficha SONDEA al arrancar si hay un motor local escuchando
  // (`127.0.0.1:8765/health` y compañía). Eso no es meteo y no tiene nada que
  // ver con `meteoPre`: la primera versión de este banco lo contaba como
  // «se ha ido a buscar datos» y se marcaba a sí misma en rojo.
  const fuera = [], meteo = [];
  await ctx.route('**://*/**', r => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    fuera.push(u);
    if (/open-meteo|meteo\/history|archive-api/.test(u)) meteo.push(u);
    return r.abort();
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#run', { timeout: 20000 });
  check('la ficha carga y expone `LOC.run` y `LOC.fetchHSU`',
        await page.evaluate(() => typeof LOC === 'object' &&
              typeof LOC.run === 'function' && typeof LOC.fetchHSU === 'function'));

  const R = await corre(page);
  check('con `meteoPre` la simulación TERMINA sin pedir nada a la red',
        !!R && !!R.cases && Object.keys(R.cases).length === 4,
        R && R.cases ? Object.keys(R.cases).join(',') : 'sin casos');
  check('y no se ha ido a buscar meteo a ningún sitio', meteo.length === 0,
        meteo.slice(0, 2).join(' · '));
  check('lo único que sale a la red es el sondeo del motor local, no datos',
        fuera.every(u => /\/health$/.test(u)), fuera.slice(0, 2).join(' · '));

  // ══════════════════════════════════════════════════════════════════
  //  1) LA LÍNEA BASE TAMBIÉN PASA POR EL LAZO DE CONTROL
  // ══════════════════════════════════════════════════════════════════
  // Es la decisión más silenciosa de todo el montaje: la referencia contra la
  // que se miden TODAS las estrategias es un seguidor con banda muerta y
  // velocidad finita, no uno ideal. Si alguien quitara esa llamada, la base
  // subiría y cada delta saldría más negativo — sin que nada fallara.
  //
  // Se prueba cambiando SOLO la velocidad del actuador: si la base pasa por el
  // lazo, su energía tiene que moverse; si no pasara, sería idéntica.
//
  // LA VELOCIDAD TIENE QUE MORDER, y a paso horario casi ninguna lo hace: con
  // dt = 3600 s, 0,02 °/s son 72° en un paso, más que el recorrido entero.
  // MEDIDO sobre esta fixture (kWh/m², 3 días):
  //
  //        slew   5,0     0,05    0,01    0,005   0,001
  //        base   28,235  28,235  28,235  28,504  20,576
  //
  // Las tres primeras dan lo MISMO: ahí el actuador no limita nada y un banco
  // escrito con 0,02 —la primera versión de éste— compara dos cosas iguales y
  // se marca en rojo sin que nada esté mal. Se usa 0,005, que es donde el lazo
  // empieza a decidir.
  const lento = await corre(page, { slew_deg_s: 0.005 });
  const rapido = await corre(page, { slew_deg_s: 5.0 });
  check('la ENERGÍA DE REFERENCIA depende de la velocidad del actuador',
        Math.abs(lento.baseline.poa_kwh_m2 - rapido.baseline.poa_kwh_m2) > 1e-6,
        lento.baseline.poa_kwh_m2 + ' vs ' + rapido.baseline.poa_kwh_m2);

  // Y AQUÍ UNA QUE PARECE OBVIA Y ES FALSA, con sus números, para que nadie la
  // «arregle»: con backtracking, un actuador MÁS LENTO puede dar MÁS energía
  // (28,504 contra 28,235). No es un bug. El backtracking aparta el panel del
  // sol para no dar sombra a la fila de detrás, y `LOC.poa` transpone UNA FILA
  // SOLA, sin sombreado entre filas: el sacrificio no se cobra en este modelo,
  // así que no llegar a ejecutarlo se parece a una ganancia.
  //
  // La monotonía sí se sostiene en el régimen donde el backtracking no está
  // (35,64 -> 30,963 -> 20,576), y ahí es donde se exige — segundo corolario:
  // el invariante se prueba donde puede romperse, no donde queda bonito.
  const sinBT = t => corre(page, { slew_deg_s: t,
    tracker: { max_angle_deg: 55, gcr: 0.397, backtrack: false } });
  const [bt5, bt005, bt001] = [await sinBT(5.0), await sinBT(0.005), await sinBT(0.001)];
  check('sin backtracking, frenar el actuador SIEMPRE cuesta energía',
        bt5.baseline.poa_kwh_m2 > bt005.baseline.poa_kwh_m2 &&
        bt005.baseline.poa_kwh_m2 > bt001.baseline.poa_kwh_m2,
        [bt5, bt005, bt001].map(x => x.baseline.poa_kwh_m2).join(' > '));
  check('y con backtracking NO es monótono, que es lo que este modelo implica',
        lento.baseline.poa_kwh_m2 > rapido.baseline.poa_kwh_m2,
        lento.baseline.poa_kwh_m2 + ' (lento) > ' + rapido.baseline.poa_kwh_m2 +
        ' (rápido): la fila sola no paga la sombra que el backtracking evita');

  const anchoB = await corre(page, { deadband_deg: 20 });
  check('la referencia depende también de la banda muerta',
        Math.abs(anchoB.baseline.poa_kwh_m2 - R.baseline.poa_kwh_m2) > 1e-6,
        anchoB.baseline.poa_kwh_m2 + ' vs ' + R.baseline.poa_kwh_m2);

  // ══════════════════════════════════════════════════════════════════
  //  2) LA CONSIGNA SE GUARDA ANTES DEL LAZO
  // ══════════════════════════════════════════════════════════════════
  // La máquina de estados manda un ESCALÓN y el hierro lo recorre a 0,17 °/s.
  // Son dos series distintas y la ficha dibuja las dos: sin la consigna no se
  // puede ver que la POA cae en rampa y no de golpe.
// Se mira sobre la corrida LENTA por la misma razón de arriba: con el
  // actuador rápido la orden y el recorrido coinciden y no habría nada que
  // distinguir. La distinción exige un mundo donde exista.
  check('la orden y el recorrido difieren durante la maniobra',
        lento._nOrden.A1 > 0, lento._nOrden.A1 + ' pasos distintos');
  check('y la ORDEN da saltos mayores que el recorrido, no al revés',
        lento._pasos.A1.orden > lento._pasos.A1.theta + 1e-9,
        'orden ' + lento._pasos.A1.orden.toFixed(2) + '° · recorrido ' +
        lento._pasos.A1.theta.toFixed(2) + '°');
  check('el recorrido respeta la velocidad del actuador',
        lento._pasos.A1.theta <= 0.005 * 3600 + 1e-6,
        lento._pasos.A1.theta.toFixed(2) + '° en una hora, tope ' + (0.005 * 3600));

  // ══════════════════════════════════════════════════════════════════
  //  3) A MIRA AL VIENTO Y B AL SOL — Y EL MEDIODÍA ES DE LAS B
  // ══════════════════════════════════════════════════════════════════
  ['A1', 'A2'].forEach(S => check(S + ' se declara orientada al viento',
        R.cases[S].orientation === 'viento', R.cases[S].orientation));
  ['B1', 'B2'].forEach(S => check(S + ' se declara orientada al sol',
        R.cases[S].orientation === 'sol', R.cases[S].orientation));
  check('las de un umbral no tienen histéresis y las de dos sí',
        R.cases.A1.has_hysteresis === false && R.cases.A2.has_hysteresis === true &&
        R.cases.B1.has_hysteresis === false && R.cases.B2.has_hysteresis === true);
// EL RUMBO MUEVE LAS A Y NO LAS B, y esto es lo que faltaba: la primera
  // versión comprobaba la ETIQUETA («orientation: viento») y no que el rumbo
  // llegara a decidir nada. Su mutante —hacer que las A se orienten por el sol
  // como las B— SOBREVIVÍA con todo en verde. Una etiqueta no es un mecanismo.
  const otroRumbo = await corre(page, { __rumbo: 90 });
  check('cambiar el RUMBO DEL VIENTO mueve las estrategias A',
        Math.abs(otroRumbo.cases.A1.poa_kwh_m2 - R.cases.A1.poa_kwh_m2) > 1e-9 ||
        Math.abs(otroRumbo.cases.A2.poa_kwh_m2 - R.cases.A2.poa_kwh_m2) > 1e-9,
        otroRumbo.cases.A1.poa_kwh_m2 + ' vs ' + R.cases.A1.poa_kwh_m2);
  check('y NO mueve las B, que se orientan por el sol',
        otroRumbo.cases.B1.poa_kwh_m2 === R.cases.B1.poa_kwh_m2 &&
        otroRumbo.cases.B2.poa_kwh_m2 === R.cases.B2.poa_kwh_m2,
        otroRumbo.cases.B1.poa_kwh_m2 + ' vs ' + R.cases.B1.poa_kwh_m2);

  const conNoon = await corre(page, { noon_limit_deg: 10 });
  check('el límite de mediodía CAMBIA las estrategias B',
        Math.abs(conNoon.cases.B1.poa_kwh_m2 - R.cases.B1.poa_kwh_m2) > 1e-9 ||
        Math.abs(conNoon.cases.B2.poa_kwh_m2 - R.cases.B2.poa_kwh_m2) > 1e-9,
        conNoon.cases.B1.poa_kwh_m2 + ' vs ' + R.cases.B1.poa_kwh_m2);
  check('y NO toca las A, que orientan por el viento',
        conNoon.cases.A1.poa_kwh_m2 === R.cases.A1.poa_kwh_m2 &&
        conNoon.cases.A2.poa_kwh_m2 === R.cases.A2.poa_kwh_m2,
        conNoon.cases.A1.poa_kwh_m2 + ' vs ' + R.cases.A1.poa_kwh_m2);

  // ══════════════════════════════════════════════════════════════════
  //  4) LO QUE PUBLICA TIENE QUE CUADRAR CONSIGO MISMO
  // ══════════════════════════════════════════════════════════════════
  // Son las cifras que van al informe. Un desglose que no suma su propio total
  // es la forma barata de que un error de montaje pase por dato.
  Object.keys(R.cases).forEach(function (S) {
    const c = R.cases[S];
    check(S + ': el delta es la diferencia contra la referencia',
          cerca(c.poa_delta_kwh_m2, c.poa_kwh_m2 - R.baseline.poa_kwh_m2, 0.002),
          c.poa_delta_kwh_m2 + ' vs ' + (c.poa_kwh_m2 - R.baseline.poa_kwh_m2).toFixed(3));
    check(S + ': y el porcentaje es ese delta sobre la referencia',
          cerca(c.poa_delta_pct, 100 * (c.poa_kwh_m2 - R.baseline.poa_kwh_m2) / R.baseline.poa_kwh_m2, 0.02),
          c.poa_delta_pct);
    check(S + ': las horas de abanderamiento son las parciales más las totales',
          cerca(c.hours_stow, c.hours_partial + c.hours_full, 0.02),
          c.hours_stow + ' vs ' + (c.hours_partial + c.hours_full));
    check(S + ': las horas enganchadas incluyen además la histéresis',
          cerca(c.hours_engaged, c.hours_partial + c.hours_full + c.hours_hold, 0.02),
          c.hours_engaged);
    check(S + ': los eventos se reparten entre los que llegan a tope y los que no',
          c.n_events === c.n_events_full + c.n_events_partial_only,
          c.n_events + ' vs ' + (c.n_events_full + c.n_events_partial_only));
    check(S + ': el desglose mensual suma el total del año',
          cerca(c.poa_monthly_kwh_m2.reduce((a, b) => a + b, 0), c.poa_kwh_m2, 0.05),
          c.poa_monthly_kwh_m2.reduce((a, b) => a + b, 0).toFixed(3) + ' vs ' + c.poa_kwh_m2);
    check(S + ': y las horas por mes suman las horas enganchadas',
          cerca(c.hours_by_month.reduce((a, b) => a + b, 0), c.hours_engaged, 0.05),
          c.hours_by_month.reduce((a, b) => a + b, 0));
  });

  // EL ORÁCULO INDEPENDIENTE: los episodios se vuelven a contar aquí, sobre la
  // serie de modos, sin usar nada de lo que `run` calculó. Un episodio es una
  // racha máxima con el modo distinto de IDLE.
  Object.keys(R._modo).forEach(function (S) {
    const m = R._modo[S];
    let n = 0;
    for (let i = 0; i < m.length; i++)
      if (m[i] !== 'IDLE' && (i === 0 || m[i - 1] === 'IDLE')) n++;
    check(S + ': el recuento de episodios coincide con las rachas de la serie de modos',
          n === R.cases[S].n_events, n + ' contados aquí · ' + R.cases[S].n_events + ' publicados');
  });
  check('el escenario visita los tres modos, o no se está probando la máquina',
        (function () { const v = new Set(R._modo.A2); return v.has('IDLE') &&
          (v.has('PARTIAL_STOW') || v.has('FULL_STOW')); })(),
        Array.from(new Set(R._modo.A2)).join(' '));

  // ══════════════════════════════════════════════════════════════════
  //  5) LO QUE LE PASA A CADA PIEZA
  // ══════════════════════════════════════════════════════════════════
  const alto = await corre(page, { wind_height_m: 60 });
  check('la ALTURA DE MEDIDA llega al cizallamiento y cambia el resultado',
        Math.abs(alto.cases.A1.hours_engaged - R.cases.A1.hours_engaged) > 1e-9,
        alto.cases.A1.hours_engaged + ' h a 60 m · ' + R.cases.A1.hours_engaged + ' h a 10 m');
  check('y a más altura, más viento y más horas abanderado',
        alto.cases.A1.hours_engaged > R.cases.A1.hours_engaged,
        alto.cases.A1.hours_engaged + ' vs ' + R.cases.A1.hours_engaged);
  const fino = await corre(page, { resample_minutes: 15 });
  check('el REMUESTREO llega a `resample`: cuatro veces más muestras',
        fino.meteo.rows === (R.meteo.rows - 1) * 4 + 1,
        fino.meteo.rows + ' vs ' + R.meteo.rows);
  check('y el resultado no cambia de orden de magnitud al afinar el paso',
        cerca(fino.baseline.poa_kwh_m2, R.baseline.poa_kwh_m2,
              0.1 * R.baseline.poa_kwh_m2),
        fino.baseline.poa_kwh_m2 + ' vs ' + R.baseline.poa_kwh_m2);

  // ══════════════════════════════════════════════════════════════════
  //  6) EL CASO PASIVO: EL DENOMINADOR ES OBLIGATORIO
  // ══════════════════════════════════════════════════════════════════
  // La ficha LANZA a propósito si no se le da el nº de trackers, porque la
  // pérdida de la fila suelta se reparte entre todas las filas: sin ese número
  // el resultado no es interpretable. Es un error deliberado y por eso se
  // prueba como tal.
  const sinDenom = await page.evaluate(async (a) => {
    const M = eval(a.fix);
    const cfg = Object.assign({}, a.cfg, { meteoPre: M, passive: { enabled: true } });
    try { await LOC.run(cfg); return null; } catch (e) { return String(e.message || e); }
  }, { fix: FIXTURE(4, 225), cfg: CFG });
  check('el caso pasivo SIN nº de trackers no se calcula: lanza',
        typeof sinDenom === 'string' && sinDenom.length > 0, String(sinDenom));
  check('y el error explica POR QUÉ hace falta el denominador',
        typeof sinDenom === 'string' && /trackers/.test(sinDenom) && /50/.test(sinDenom),
        String(sinDenom).slice(0, 80));

  const pasivo = await corre(page, { passive: { enabled: true, n_trackers: 10,
    release_kmh: 90, side_mode: 'fijo' } }, 3);
  check('con denominador sí se calcula, y como un caso más',
        !!pasivo.cases.PASIVO, Object.keys(pasivo.cases).join(','));
  check('y publica la fracción de campo expuesta, que es el denominador',
        pasivo.cases.PASIVO.passive.fraccion_expuesta > 0 &&
        pasivo.cases.PASIVO.passive.fraccion_expuesta < 1,
        pasivo.cases.PASIVO.passive.fraccion_expuesta);

  // EL LADO SIGUE AL VIENTO, y esto cierra un hueco que `test_viento_control`
  // llevaba DECLARADO: allí se comprueba la función `ladoDelViento` y se dice
  // que el CAMINO que la llama —`side_mode` en «viento»— no lo ejercitaba
  // ningún arnés, así que el mutante del lado invertido moría cero veces.
  // Aquí ese camino se recorre entero, y el lado se ve en el resultado: con el
  // viento del ESTE la fila suelta acaba en otro sitio que con el del OESTE, y
  // eso cambia lo que recoge.
  //
  // La suelta va a 70 km/h y no a los 90 de fábrica POR UNA RAZÓN MEDIDA: el
  // temporal de la fixture sopla a 22 m/s, que son 79 km/h. Con el umbral en
  // 90 la fila NO se suelta nunca, el lado no llega a decidirse y el careo
  // de aquí abajo salía idéntico para el este y para el oeste — otra vez la
  // fixture sin el mecanismo dentro, y van cuatro hoy.
  const porViento = async (rumbo) => (await corre(page, { __rumbo: rumbo,
    passive: { enabled: true, n_trackers: 10, release_kmh: 70, side_mode: 'viento' } }))
      .cases.PASIVO.passive;
  const este = await porViento(90), oeste = await porViento(270);
  check('con `side_mode` en «viento» el modo publicado es «viento», no «fijo»',
        este.side_mode === 'viento' && oeste.side_mode === 'viento',
        este.side_mode + ' / ' + oeste.side_mode);
  check('y el lado NO es un número fijo, porque es una serie que sigue al rumbo',
        este.side_deg === null, String(este.side_deg));
  check('el rumbo decide dónde acaba la fila suelta: este y oeste no dan lo mismo',
        Math.abs(este.row_poa_kwh_m2 - oeste.row_poa_kwh_m2) > 1e-6,
        este.row_poa_kwh_m2 + ' vs ' + oeste.row_poa_kwh_m2);
  check('y con el viento del ESTE la fila recoge MÁS que con el del oeste',
        este.row_poa_kwh_m2 > oeste.row_poa_kwh_m2,
        este.row_poa_kwh_m2 + ' > ' + oeste.row_poa_kwh_m2 +
        ': si se invirtiera el signo del lado, esto se daría la vuelta');

  // Sin rumbo en la meteo, «al lado del que sopla» NO puede seguir a nadie: la
  // ficha lo dice y cae al lado de montaje en vez de dar por bueno un
  // resultado que parece dinámico y no lo es.
  const sinRumbo = await page.evaluate(async (a) => {
    const M = eval(a.fix);
    for (let i = 0; i < M.wd.length; i++) M.wd[i] = NaN;
    const cfg = Object.assign({}, a.cfg, { meteoPre: M,
      passive: { enabled: true, n_trackers: 10, side_mode: 'viento' } });
    const R = await LOC.run(cfg);
    return (R.cases && R.cases.PASIVO && R.cases.PASIVO.passive) || null;
  }, { fix: FIXTURE(4, 225), cfg: CFG });
  check('sin rumbo, el lado «del que sopla» se DECLARA caído al de montaje',
        !!sinRumbo && sinRumbo.side_sin_direccion === true,
        sinRumbo ? JSON.stringify(sinRumbo).slice(0, 90) : 'sin caso pasivo');
  check('y el modo publicado pasa a «fijo», no sigue diciendo «viento»',
        !!sinRumbo && sinRumbo.side_mode === 'fijo',
        sinRumbo ? sinRumbo.side_mode : '—');

  // ══════════════════════════════════════════════════════════════════
  //  7) `LOC.fetchHSU`: EL HISTÓRICO DEL SCADA
  // ══════════════════════════════════════════════════════════════════
  // Se intercepta el SCADA en el navegador, así que se prueba la función real
  // con la respuesta que se quiera — incluidas las que nadie provoca a mano:
  // un 500, una respuesta sin muestras, un rumbo negativo.
// El caso va en la RUTA y no en la query, porque `fetchHSU` CONCATENA
  // `/meteo/history?hours=…` al final: con `?caso=ok` en medio, la URL acababa
  // siendo `…/?caso=ok/meteo/history?hours=48` y el servidor devolvía 404.
  // Y la ruta se registra DESPUÉS del corta-todo a propósito: en Playwright
  // gana la última.
  await ctx.route('**/scada-de-mentira/**', async (route) => {
    const ruta = new URL(route.request().url()).pathname;
    const caso = /\/scada-de-mentira\/([a-z0-9]+)/.exec(ruta);
    const c = caso ? caso[1] : 'ok';
    if (c === 'http500') return route.fulfill({ status: 500, body: 'nope' });
    if (c === 'vacio') return route.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ series: { t: [] } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ series: {
        t: ['2024-03-01T00:00:00Z', '2024-03-01T01:00:00Z', '2024-03-01T02:00:00Z'],
        wind_speed: [5.5, -2, null],
        wind_direction: [-30, 400, null],
        temp_air: [12.5, null, 9],
      } }) });
  });
  const url = BASE + '/scada-de-mentira';

  const H = await page.evaluate(async (u) => {
    const o = await LOC.fetchHSU(u + '/ok', 48, 'HSU 7');
    return { t: o.t.map(String), ws: Array.from(o.ws), wd: Array.from(o.wd),
             temp: Array.from(o.temp), ghi: Array.from(o.ghi),
             dni: Array.from(o.dni), dhi: Array.from(o.dhi), gust: Array.from(o.gust),
             source: o.source, unidad: o.unidad, tiene_rafaga: o.tiene_rafaga };
  }, url);

  check('trae una muestra por instante del SCADA', H.ws.length === 3, H.ws.length);
  check('el viento negativo se acota a cero, no viaja negativo',
        H.ws[1] === 0, H.ws[1]);
  check('y una velocidad ausente se lee como cero, no como NaN',
        H.ws[2] === 0, H.ws[2]);
  check('el rumbo se normaliza al círculo: −30° son 330°',
        cerca(H.wd[0], 330, 1e-9), H.wd[0]);
  check('y 400° son 40°', cerca(H.wd[1], 40, 1e-9), H.wd[1]);
  check('un rumbo ausente es NaN y no cero: cero es el NORTE',
        Number.isNaN(H.wd[2]), H.wd[2]);
  check('la temperatura ausente cae a 15 °C, declarado en el código',
        H.temp[1] === 15, H.temp[1]);
  check('y la que viene se respeta', H.temp[0] === 12.5, H.temp[0]);
  check('sin irradiancia en el SCADA, la GHI es NaN y no cero',
        Number.isNaN(H.ghi[0]), H.ghi[0]);
  // Lo que NO trae va declarado, que es la regla de la casa: el SCADA da
  // viento y temperatura, no ráfaga ni componentes de irradiancia.
  check('la ráfaga se declara ausente', H.tiene_rafaga === false, H.tiene_rafaga);
  check('la unidad se declara en m/s', H.unidad === 'm/s', H.unidad);
  check('y la fuente se identifica', H.source === 'hsu-scada', H.source);

  // EL CAREO CON `completaHSU`: lo que sale del SCADA sin irradiancia tiene que
  // salir MARCADO al pasar por la compleción, que es el camino real de la
  // ficha. Es el contrato entre las dos, y aquí se recorre entero.
  const marcado = await page.evaluate(async (u) => {
    const M = await LOC.fetchHSU(u + '/ok', 48);
    const C = LOC.completaHSU(M, 41.5, -1.0);
    return { sin: C.sin_irradiancia, ghi0: C.ghi[0], dni0: C.dni[0] };
  }, url);
  check('el SCADA sin sol pasa por `completaHSU` y sale DECLARADO',
        marcado.sin === true, String(marcado.sin));
  check('y con el sol del cielo claro puesto, no con ceros',
        Number.isFinite(marcado.ghi0), marcado.ghi0);

  // La URL. Es contrato con el SCADA de planta: si cambia, deja de encontrar el
  // histórico y el mensaje de error no dice por qué.
  const urls = await page.evaluate(async (u) => {
    const vistos = [];
    const orig = window.fetch;
    window.fetch = function (x, o) { vistos.push(String(x)); return orig.apply(this, arguments); };
    try { await LOC.fetchHSU(u + '/ok', 48, 'HSU 7'); } catch (e) {}
    try { await LOC.fetchHSU(u + '/ok', null, null); } catch (e) {}
    window.fetch = orig;
    return vistos;
  }, url);
  check('pide las horas que se le piden', /hours=48/.test(urls[0] || ''), urls[0]);
  check('y por defecto pide 720, que es el mes', /hours=720/.test(urls[1] || ''), urls[1]);
  check('la HSU viaja codificada, que lleva espacio',
        /hsu=HSU(%20|\+)7/.test(urls[0] || ''), urls[0]);
  check('y sin HSU no se manda el parámetro vacío',
        !/hsu=/.test(urls[1] || ''), urls[1]);

  const err500 = await page.evaluate(async (u) => {
    try { await LOC.fetchHSU(u + '/http500', 48); return null; }
    catch (e) { return String(e.message || e); }
  }, url);
  check('un SCADA que contesta 500 NO se lee como datos: lanza',
        typeof err500 === 'string' && /500/.test(err500), String(err500));
  check('y el error dice dónde mirar', typeof err500 === 'string' &&
        /meteo\/history/.test(err500), String(err500).slice(0, 70));

  const errVacio = await page.evaluate(async (u) => {
    try { await LOC.fetchHSU(u + '/vacio', 48); return null; }
    catch (e) { return String(e.message || e); }
  }, url);
  check('una respuesta SIN muestras tampoco pasa por buena',
        typeof errVacio === 'string' && /muestras/.test(errVacio), String(errVacio));

  // ══════════════════════════════════════════════════════════════════
  //  8) CONTROL POSITIVO
  // ══════════════════════════════════════════════════════════════════
  // Todo lo de arriba pasa hoy. Un banco donde todo pasa puede querer decir
  // que no mide: aquí se hace correr `run` con una configuración que TIENE que
  // dar otro resultado, y se exige que lo dé.
  const sinTope = await corre(page, { tracker: { max_angle_deg: 5, gcr: 0.397, backtrack: true } });
  check('CONTROL: con el tope mecánico a 5° el resultado es otro',
        Math.abs(sinTope.baseline.poa_kwh_m2 - R.baseline.poa_kwh_m2) > 1e-6,
        sinTope.baseline.poa_kwh_m2 + ' vs ' + R.baseline.poa_kwh_m2 +
        ': si coincidieran, este banco no distinguiría la geometría');

  check('la ficha no ha lanzado ningún error por el camino',
        errores.length === 0, errores.slice(0, 2).join(' · '));

  await browser.close();
  console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL el banco reventó -> ' + e.message); process.exit(1); });
