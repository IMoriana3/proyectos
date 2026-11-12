// EL MAPA DE PAÍS, ABIERTO en Chromium, con Open-Meteo simulado.
//
// La pestaña «Mapa» corre la simulación del año en cada nodo de una rejilla y
// pinta la ganancia del pasivo frente al activo. El motor puro lo fija
// `test_viento_mapa_motor.js`; esto comprueba lo que solo se ve con la página
// entera, y cada cláusula es un fallo que daría un mapa bonito y falso:
//
//   · un nodo del mapa ES la corrida de la ficha para ese punto: se carea con
//     un `LOC.run` armado aparte, con meteo recién bajada y sin pasar por la
//     caché;
//   · el mapa mira el viento de CADA nodo: con la meteo de mentira (más viento
//     al noroeste), la ganancia crece hacia el noroeste;
//   · retocar la estrategia NO vuelve a pedir meteo (cero peticiones) y SÍ
//     cambia el resultado;
//   · un HTTP 429 no pierde nodos: espera y sigue;
//   · un nodo que llega SIN ráfaga no se da por bueno entre vecinos con ella.
//
//   node tests/test_viento_mapa.js      (necesita el servidor en :8099)
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');
const { respuesta, fuerza } = require('./meteo_sintetica_mapa.js');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  // La red de fuera, cortada: lo único que contesta es la meteo simulada.
  const red = { n: 0, modo: 'ok', cortes: 0 };
  await page.route(/^https?:\/\/(?!localhost)/, r => {
    const u = r.request().url();
    if (!u.includes('archive-api.open-meteo.com')) return r.abort();
    red.n++;
    if (red.modo === '429' && red.cortes > 0) { red.cortes--; return r.fulfill({ status: 429, body: '{"error":true}' }); }
    if (red.modo === 'sinrafaga' && red.cortes > 0 && u.includes('wind_gusts_10m')) { red.cortes--; return r.abort(); }
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(respuesta(u)) });
  });
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tabMapa', { timeout: 15000 });
  await page.evaluate(() => { LOC.MAPA.ESPERA_S = 0; LOC.MAPA.ESPERA_429_S = [0.05, 0.05, 0.05, 0.05]; });

  // ── la pestaña ──
  check('la cuarta pestaña es la del mapa y no desplaza a las otras tres',
        await page.evaluate(() => { const b = document.querySelectorAll('#tabs button');
          return b.length === 4 && b[3].id === 'tabMapa' && b[0].id === 'tabViento'; }));
  check('al abrir la ficha el mapa no se ve', await page.$eval('#panelMapa', e => e.style.display === 'none'));
  await page.click('#tabMapa');
  await page.waitForFunction(() => MAPA.plan && MAPA.plan.nodos.length > 0, null, { timeout: 30000 });
  check('se ve el mapa y se esconde el simulador',
        await page.$eval('#panelMapa', e => e.style.display !== 'none') &&
        await page.$eval('#panelViento', e => e.style.display === 'none'));
  check('el país sale del emplazamiento de la ficha (El Burgo → España)',
        await page.$eval('#mPais', e => e.value) === 'ESP');
  check('abrir la pestaña NO pide meteo', red.n === 0);
  const plan = await page.evaluate(() => ({ n: MAPA.plan.nodos.length, regla: MAPA.plan.regla,
    dentro: MAPA.plan.nodos.every(o => FactiunMapasPais.valorEn(MAPA.rej, o.lat, o.lon) != null) }));
  check('a 1° España tiene entre 40 y 70 nodos, todos en tierra del país (' + plan.n + ')',
        plan.n >= 40 && plan.n <= 70 && plan.dentro && plan.regla === 'punto');
  check('el plan lo dice antes de pedir nada',
        new RegExp(plan.n + ' nodos').test(await page.$eval('#mPlan', e => e.textContent)));
  check('sin mapa no se puede exportar', await page.$eval('#mPng', e => e.disabled) && await page.$eval('#mJson', e => e.disabled));

  // ── generar ──
  const genera = async () => { await page.click('#mRun');
    await page.waitForFunction(() => !MAPA.corriendo && MAPA.hecho, null, { timeout: 300000 }); };
  await genera();
  const r1 = await page.evaluate(() => mLista().map(o => ({ lat: o.lat, lon: o.lon, g: o.g })));
  check('todos los nodos calculados (' + r1.filter(o => o.g).length + ' de ' + plan.n + ')',
        r1.length === plan.n && r1.every(o => o.g && isFinite(o.g.ganancia_pct)));
  check('una petición por nodo, ni una más (' + red.n + ')', red.n === plan.n);
  check('todos dispararon con la ráfaga MEDIDA de la fuente', r1.every(o => o.g.rafaga === 'medida'));
  // el viento de mentira crece al noroeste: las horas abanderado tienen que seguirlo
  const corr = (xs, ys) => { const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    return xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) /
      Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0)); };
  const F = r1.map(o => fuerza(o.lat, o.lon));
  const cH = corr(F, r1.map(o => o.g.h_activo));
  check('el mapa mira el viento de CADA nodo: más viento, más horas abanderado (correlación ' + cH.toFixed(3) + ')', cH > 0.6);
  check('ganancia = lo que el pasivo capta de más sobre el activo, con las POA del informe',
        r1.every(o => Math.abs(o.g.ganancia_pct - (o.g.pasivo_pct - o.g.activo_pct)) < 0.02 * Math.max(1, Math.abs(o.g.activo_pct))));

  // ── un nodo ES la corrida de la ficha ──
  const careo = await page.evaluate(async () => {
    const o = mLista()[Math.floor(MAPA.plan.nodos.length / 2)];
    const M = await LOC.fetchYear(o.lat, o.lon, +$('mYear').value, +$('mYear').value);   // sin caché ni empaquetado
    const b = cuerpoSim(['B2'], 'openmeteo');
    Object.assign(b, { lat: o.lat, lon: o.lon, year: +$('mYear').value, year1: +$('mYear').value, meteoPre: M,
      resample_minutes: 15, wind_scenario: { base: 'meteo', use_gust: true }, timeline: null, passive: cuerpoPasivo() });
    const R = await LOC.run(b);
    return { mapa: o.g, act: R.cases.B2.poa_delta_pct, pas: R.cases.PASIVO.poa_delta_pct,
             n: R.cases.B2.n_events, eA: R.cases.B2.poa_kwh_m2, eP: R.cases.PASIVO.poa_kwh_m2 };
  });
  red.n = 0;
  check('el nodo del mapa da lo MISMO que la corrida de la ficha para ese punto (activo ' + careo.act + ' %)',
        careo.mapa.activo_pct === careo.act && careo.mapa.pasivo_pct === careo.pas && careo.mapa.n_activo === careo.n &&
        Math.abs(careo.mapa.ganancia_pct - 100 * (careo.eP - careo.eA) / careo.eA) < 1e-12);

  // ── lo que se pinta ──
  const pix = await page.evaluate(() => {
    const cv = $('mLienzo'), x = cv.getContext('2d'), k = cv.width / cv.clientWidth, g = MAPA.geo;
    const en = (lon, lat) => Array.from(x.getImageData(Math.round(g.X(lon) * k), Math.round(g.Y(lat) * k), 1, 1).data);
    const hex = c => '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
    return { tierra: hex(en(-3.4, 40.4)), mar: hex(en(-9.3, 36.2)), rampa: LOC.MAPA.RAMPA };
  });
  check('tierra adentro el píxel es un color de la rampa (' + pix.tierra + ')', pix.rampa.includes(pix.tierra));
  check('y en el mar no (' + pix.mar + ')', !pix.rampa.includes(pix.mar));
  check('el resumen del país y la tabla de nodos aparecen',
        /Ganancia media/.test(await page.$eval('#mKpis', e => e.textContent)) &&
        (await page.$$eval('#mTabla tbody tr', n => n.length)) === Math.min(20, plan.n));
  check('con mapa ya se puede exportar', !(await page.$eval('#mPng', e => e.disabled)) && !(await page.$eval('#mJson', e => e.disabled)));

  // ── la rejilla exportada ──
  const ex = await page.evaluate(() => mExporta());
  const llenas = ex.valores.flat().filter(v => v != null).length;
  check('la rejilla exportada lleva un valor por nodo, en el formato de las láminas (' + llenas + ')',
        llenas === plan.n && ex.filas === ex.valores.length && ex.columnas === ex.valores[0].length && ex.escala === 1000);
  check('las filas van de norte a sur y el valor es el del nodo',
        (() => { const o = r1[0], f = Math.round((ex.extension[3] - ex.paso_deg / 2 - o.lat) / ex.paso_deg),
          c = Math.round((o.lon - ex.extension[0] - ex.paso_deg / 2) / ex.paso_deg);
          return ex.valores[f][c] === Math.round(o.g.ganancia_pct * 1000); })());
  check('y lleva con qué se calculó (umbrales, pasivo, año, estrategia)',
        ex.configuracion.threshold_1_kmh > 0 && ex.configuracion.passive.release_kmh > 0 &&
        ex.opciones.ref === 'B2' && ex.opciones.year > 2000 && !('meteoPre' in ex.configuracion));

  // ── retocar no vuelve a bajar ──
  await page.selectOption('#mRef', 'A1');
  await genera();
  const r2 = await page.evaluate(() => mLista().map(o => o.g));
  check('cambiar de estrategia NO pide meteo otra vez (' + red.n + ' peticiones)', red.n === 0);
  const cG = corr(F, r2.map(g => g.ganancia_pct));
  check('frente a A1 (todo o nada, cara al viento) la ganancia crece con el viento del nodo (correlación ' + cG.toFixed(3) + ')', cG > 0.6);
  check('y SÍ cambia el mapa: A1 pierde más que B2, luego la ganancia sube',
        r2.every(g => g) && r2.reduce((s, g) => s + g.ganancia_pct, 0) > r1.reduce((s, o) => s + o.g.ganancia_pct, 0) + 0.5);
  check('el plan cuenta la meteo guardada', new RegExp(plan.n + ' con meteo guardada').test(await page.$eval('#mPlan', e => e.textContent)));

  // ── de un nodo al simulador ──
  const obj = await page.evaluate(() => { const o = mLista()[3], r = $('mLienzo').getBoundingClientRect();
    return { x: r.left + MAPA.geo.X(o.lon), y: r.top + MAPA.geo.Y(o.lat), lat: o.lat, lon: o.lon }; });
  await page.mouse.click(obj.x, obj.y);
  check('un clic fija el nodo y la lectura da sus números',
        /ganancia/.test(await page.$eval('#mLectura', e => e.textContent)) && (await page.$('#mLleva')) !== null);
  await page.click('#mLleva');
  check('«Llevar al Simulador» pone sus coordenadas en la ficha y vuelve a ella',
        await page.evaluate(o => +$('lat').value === o.lat && +$('lon').value === o.lon &&
          $('panelViento').style.display !== 'none' && $('panelMapa').style.display === 'none', obj));
  await page.click('#tabMapa');

  // ── HTTP 429: espera y sigue ──
  await page.click('#mBorra');
  await page.waitForFunction(() => /vaciada/.test($('mEstado').textContent), null, { timeout: 10000 });
  await page.selectOption('#mPaso', '2');
  await page.selectOption('#mRef', 'B2');
  const n2 = await page.evaluate(() => MAPA.plan.nodos.length);
  red.n = 0; red.modo = '429'; red.cortes = 4;            // dos nodos rebotados (petición + su reintento sin ráfaga)
  await genera();
  const r3 = await page.evaluate(() => mLista().map(o => o.g));
  check('tras vaciar la caché vuelve a pedir, y un 429 no pierde nodos (' + r3.filter(Boolean).length + ' de ' + n2 + ')',
        red.n >= n2 + 4 && r3.length === n2 && r3.every(g => g && g.rafaga === 'medida'));

  // ── un nodo que llega sin ráfaga no se da por bueno ──
  await page.click('#mBorra');
  await page.waitForFunction(() => /vaciada/.test($('mEstado').textContent), null, { timeout: 10000 });
  await page.selectOption('#mRef', 'B1');
  red.n = 0; red.modo = 'sinrafaga'; red.cortes = 1;       // la 1.ª petición con ráfaga se corta; la de respaldo, sin ráfaga, llega
  await genera();
  const r4 = await page.evaluate(() => mLista().map(o => o.g));
  check('el nodo cuya ráfaga se cortó se REPITE: ninguno queda con viento medio (' + red.n + ' peticiones para ' + n2 + ' nodos)',
        red.n === n2 + 2 && r4.every(g => g && g.rafaga === 'medida'));

  check('sin errores de página', errores.length === 0, errores.join(' | ').slice(0, 300));
  await page.screenshot({ path: process.env.CAPTURA_MAPA || '/tmp/mapa_arnes.png' });
  await browser.close();
  console.log('\n' + (ko ? 'FALLOS: ' + ko : 'OK — ' + ok + '/' + ok + ' comprobaciones'));
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL el arnés revienta -> ' + (e && e.stack || e)); process.exit(1); });
