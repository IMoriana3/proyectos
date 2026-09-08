// El «Buscador de implantaciones» en un navegador real (Chromium vía Playwright).
//
// El motor NO se prueba aquí: es el MISMO bloque «MOTOR DE LAYOUT» del generador y ya
// tiene su careo contra el core en test_layout.js. Lo que se mide es lo que el buscador
// añade encima, que es donde puede mentir:
//
//   · que el motor se EXTRAE de verdad del generador en runtime (si el regex deja de
//     casar, la página entera es un aviso, no un buscador);
//   · DETERMINISMO: misma semilla y mismo site → mismo mejor kWp con las mismas opciones.
//     Sin esto la semilla de la barra es decoración, y la semilla está para reproducir;
//   · MONOTONÍA: el récord nunca baja al seguir buscando;
//   · que sobre una PARCELA REAL (un layout.json con vallado) el buscador corre y saca
//     strings — que es el modo con el que se enseña una planta de la casa;
//   · y que el lienzo PINTA mesas (píxeles verdes), no solo cuenta números.
//
//   npm install playwright                     # el navegador ya está en /opt/pw-browsers
//   python3 -m http.server 8099                # servir el repo (en otra terminal)
//   node tests/test_buscador.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

// un vallado mínimo con la forma de los layouts de la suite: tramos de [x,n] en metros
const LAYOUT_PRUEBA = { title: 'Prueba', fence: [
  [[0, 0], [400, 0]], [[400, 0], [400, 260]], [[400, 260], [0, 260]], [[0, 260], [0, 0]]] };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const fallos = [];
  page.on('pageerror', e => fallos.push(e.message));
  const URL1 = BASE + '/buscador-implantacion.html?quieto=1&semilla=123456-654321&site=3';

  await page.goto(URL1);
  await page.waitForFunction(() => window.LAY && window.LAY.compute, null, { timeout: 30000 });
  check('el motor se extrae del generador y exporta compute', true);

  await page.evaluate(() => PASO(25));
  const e1 = await page.evaluate(() => ESTADO());
  check('25 candidatos corridos son 25 opciones', e1.opciones === 25, e1.opciones);
  check('y hay un mejor con kWp de verdad', e1.mejorKwp > 0, e1.mejorKwp);
  check('con sus strings', e1.mejorStr > 0, e1.mejorStr);
  check('la semilla pedida es la que corre', e1.semilla === '123456-654321' && e1.site === 3, e1.semilla + ' site ' + e1.site);

  // ── EL RENDIMIENTO POR ORIENTACIÓN, que es lo que faltaba ──────────────────────────────────
  // Girar las filas gira el EJE del seguidor y eso cuesta producción. Sin esto la búsqueda
  // ordenaba por kWp INSTALADOS y premiaba llenar en diagonal: más módulos, peor planta.
  check('el modelo solar se extrae de sim-solar.html', e1.sol === true);
  check('y con él se construye la tabla de rendimiento', e1.tabla === true);
  const f = await page.evaluate(() => [0, 10, 20, 30, 45].map(a => FACTOR(a)));
  check('el eje N-S es la referencia (f = 1)', Math.abs(f[0] - 1) < 1e-9, f[0]);
  check('girarlo SIEMPRE cuesta, y más cuanto más se gira',
    f[1] < f[0] && f[2] < f[1] && f[3] < f[2] && f[4] < f[3], JSON.stringify(f.map(x => +x.toFixed(4))));
  // el orden de magnitud importa: plano no penalizaría nada, exagerado prohibiría girar aunque
  // compense. En eje horizontal a media latitud, 45° cuestan pocos puntos — eso es lo real.
  check('y el coste a 45° es de pocos puntos, ni ruido ni prohibición',
    f[4] > 0.90 && f[4] < 0.995, f[4].toFixed(4));
  check('el mejor se ordena por ENERGÍA = kWp × rendimiento',
    Math.abs(e1.mejorEner - e1.mejorKwp * e1.mejorRend) < 1e-6,
    JSON.stringify({ ener: e1.mejorEner, kwp: e1.mejorKwp, rend: e1.mejorRend }));

  // monotonía: el récord (en energía) no baja al seguir
  await page.evaluate(() => PASO(25));
  const e2 = await page.evaluate(() => ESTADO());
  check('el récord no baja al seguir buscando', e2.mejorEner >= e1.mejorEner, e2.mejorEner + ' < ' + e1.mejorEner);

  // la barra cuenta lo mismo que el estado
  const barra = await page.evaluate(() => document.getElementById('barra').textContent);
  check('la barra dice las opciones y la semilla', barra.includes('50') && barra.includes('123456-654321'), barra.slice(0, 90));

  // pinta de verdad: píxeles verdes de mesa en el lienzo
  const verdes = await page.evaluate(() => {
    const c = document.getElementById('lienzo'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 130 && d[i] < 150 && d[i + 2] < 180) n++;
    return n;
  });
  check('el lienzo pinta mesas (píxeles verdes)', verdes > 300, verdes);
  // y lo pintado SE VE: el velo de error está apagado de verdad (un display propio en CSS pisa
  // el atributo hidden, y ya nos tapó la página entera una vez mientras este banco miraba solo
  // el buffer del canvas — esto mira lo compuesto)
  check('el velo de error no tapa la página', await page.evaluate(() =>
    getComputedStyle(document.getElementById('aviso')).display === 'none'), 'display ≠ none');

  // determinismo: misma URL, mismas 25 → el MISMO mejor
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page2.goto(URL1);
  await page2.waitForFunction(() => window.LAY && window.LAY.compute, null, { timeout: 30000 });
  await page2.evaluate(() => PASO(25));
  const e3 = await page2.evaluate(() => ESTADO());
  check('misma semilla → mismo mejor kWp (reproducible)', e3.mejorKwp === e1.mejorKwp, e3.mejorKwp + ' vs ' + e1.mejorKwp);
  check('y mismos strings', e3.mejorStr === e1.mejorStr, e3.mejorStr + ' vs ' + e1.mejorStr);
  await page2.close();

  // parcela real: un layout.json con vallado entra y el buscador corre sobre ella
  const real = await page.evaluate(L => cargaLayoutReal(L), LAYOUT_PRUEBA);
  check('un layout.json con `fence` se carga como parcela real', real === true);
  await page.evaluate(() => PASO(12));
  const e4 = await page.evaluate(() => ESTADO());
  check('y el buscador corre sobre el vallado real', e4.real === true && e4.opciones === 12 && e4.mejorKwp > 0,
    JSON.stringify({ real: e4.real, opciones: e4.opciones, kwp: e4.mejorKwp }));
  const barra2 = await page.evaluate(() => document.getElementById('barra').textContent);
  check('la barra dice que es la parcela real y cuál', barra2.includes('parcela real') && barra2.includes('Prueba'), barra2.slice(0, 80));
  // el origen UTM del dibujo se RE-MIDE al cambiar de parcela: sin eso las mesas del site
  // nuevo salían corridas con el origen del anterior cuando conduce PASO() (grabación, banco)
  check('el origen del dibujo se re-mide en la parcela nueva', await page.evaluate(() => {
    const antes = ESTADO().off.slice();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    const enBlanco = ESTADO().off[0] === 0;                    // nuevoSite lo resetea…
    PASO(3);
    const despues = ESTADO().off;                              // …y el primer candidato lo vuelve a medir
    return enBlanco && despues[0] !== 0 && (despues[0] !== antes[0] || despues[1] !== antes[1]);
  }), true);
  // un JSON sin vallado no cuela
  check('sin `fence` no hay parcela real', (await page.evaluate(() => cargaLayoutReal({ title: 'x' }))) === false);

  // ── EL PUENTE CON EL GENERADOR: Optimizar → encargo → A → mandos puestos al volver ──
  // Un CONTEXTO común: browser.newPage() aísla el storage por página, y el canal real del
  // puente es el localStorage compartido de un mismo navegador.
  const ctx = await browser.newContext();
  const pageG = await ctx.newPage();
  await pageG.setViewportSize({ width: 1400, height: 900 });
  pageG.on('pageerror', e => fallos.push('generador: ' + e.message));
  await pageG.goto(BASE + '/generador-layout.html');
  await pageG.waitForFunction(() => window.LAY && typeof readCfg === 'function', null, { timeout: 30000 });
  // sin parcela (se fuerza: la ficha arranca con un rectángulo por defecto), Optimizar avisa y NO abre
  await pageG.evaluate(() => { window.open = () => { window.__abierto = true; return null; }; });
  const guarda = await pageG.evaluate(() => { const p = PARCEL; PARCEL = [];
    document.getElementById('optBtn').click();
    const r = { abierto: !!window.__abierto, hint: document.getElementById('hint').textContent };
    PARCEL = p; return r; });
  check('sin parcela, Optimizar avisa y no abre', !guarda.abierto && guarda.hint.includes('sin parcela'), JSON.stringify(guarda));
  // con parcela: el encargo lleva la cfg ENTERA del panel
  await pageG.evaluate(() => {
    PARCEL = [[-0.80, 41.57], [-0.79, 41.57], [-0.79, 41.578], [-0.80, 41.578]];
    HOLES = []; EXCL = [];
    document.getElementById('pitchTrk').value = 7;               // una mesa distinta a la del buscador suelto
    document.getElementById('panelAz').value = 100;              // y un azimut propio
  });
  await pageG.click('#optBtn');
  const enc = await pageG.evaluate(() => JSON.parse(localStorage.getItem('buscador_encargo')));
  check('Optimizar deja el encargo con la cfg del panel', !!enc && enc.de === 'generador' &&
    enc.cfg.coords.length === 4 && enc.cfg.pitch === 7 && enc.cfg.panelAz === 100,
    JSON.stringify(enc && { pitch: enc.cfg && enc.cfg.pitch, az: enc.cfg && enc.cfg.panelAz }));

  // ── CASO 1: parcela donde girar NO compensa → el buscador NO debe proponer nada ──────────
  // Antes proponía como «mejor» algo PEOR que el punto de partida: el muestreo aleatorio casi
  // nunca caía en el giro 0 y girar resta. Ahora la BASE entra la primera y es la referencia.
  const pageE = await ctx.newPage();
  await pageE.setViewportSize({ width: 1280, height: 800 });
  pageE.on('pageerror', e => fallos.push('encargo: ' + e.message));
  await pageE.goto(BASE + '/buscador-implantacion.html?encargo=1&quieto=1&semilla=42-42');
  await pageE.waitForFunction(() => window.LAY && window.LAY.compute, null, { timeout: 30000 });
  await pageE.evaluate(() => PASO(1));
  const b0 = await pageE.evaluate(() => ESTADO());
  check('el PRIMER candidato es la base: sin girar', b0.mejorGiro === 0 && b0.baseKwp > 0,
    JSON.stringify({ giro: b0.mejorGiro, base: b0.baseKwp }));
  await pageE.evaluate(() => PASO(40));
  const ee = await pageE.evaluate(() => ESTADO());
  check('el buscador corre en modo encargo, con el azimut del panel', ee.encargo === true && ee.az0 === 100 && ee.mejorKwp > 0,
    JSON.stringify({ encargo: ee.encargo, az0: ee.az0, kwp: ee.mejorKwp }));
  check('el mejor NUNCA queda por debajo de la base', ee.mejorEner >= ee.baseEner - 1e-9,
    JSON.stringify({ mejor: ee.mejorEner, base: ee.baseEner }));
  const barraE = await pageE.evaluate(() => document.getElementById('barra').textContent);
  check('y la barra dice de quién es la parcela', barraE.includes('parcela del Generador') && barraE.includes('A'), barraE.slice(0, 90));
  if (Math.abs(ee.mejorEner - ee.baseEner) < 1e-9) {
    check('sin mejora, la barra lo dice en redondo', barraE.includes('la base sigue ganando'), barraE.slice(-90));
    await pageE.keyboard.press('a');
    check('y A NO envia nada: aplicarlo empeoraria lo que ya hay',
      (await pageE.evaluate(() => localStorage.getItem('buscador_mejor'))) === null);
    check('avisando de por que', (await pageE.evaluate(() => document.getElementById('barra').textContent)).includes('NO se envía'));
  }
  await pageE.close();

  // ── CASO 2: parcela ALARGADA EN DIAGONAL, metida COMO LA METE UN USUARIO ─────────────────
  // Inyectar PARCEL por JS no deja la ficha en el estado en que la deja la UI: al generar se
  // usaba otra parcela y el careo comparaba dos plantas distintas (era el banco engañándose,
  // no el producto). Se pega el GeoJSON y se pulsa su botón, como en test_layout_ui.
  const DIAG = (() => {
    const cx = -0.80, cy = 41.575, L = 0.0085, W = 0.0011, a = 30 * Math.PI / 180;
    const R = (dx, dy) => [cx + (dx * Math.cos(a) - dy * Math.sin(a)), cy + (dx * Math.sin(a) + dy * Math.cos(a)) * 0.75];
    const r = [R(-L, -W), R(L, -W), R(L, W), R(-L, W)];
    return JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [r.concat([r[0]])] } });
  })();
  await pageG.selectOption('#parcelMode', 'geojson');
  await pageG.fill('#geotxt', DIAG);
  await pageG.waitForTimeout(1000);                       // el debounce del autoguardado
  await pageG.click('#geoApplyBtn');
  // sin barrido: la gracia del caso es que la BASE no venga ya optimizada, y así se puede
  // comprobar la ida y vuelta entera. Con barrido, la ficha ya elige el azimut ella sola.
  await pageG.evaluate(() => {
    document.getElementById('optAz').checked = false; document.getElementById('optGrid').checked = false;
    document.getElementById('panelAz').value = 90; document.getElementById('axis').value = 0;
  });
  await pageG.evaluate(() => { document.querySelector('#hint').textContent = ''; document.querySelector('#genBtn').click(); });
  await pageG.waitForFunction(() => { const t = document.querySelector('#hint').textContent;
    return t.indexOf('ms') >= 0 || t.indexOf('error') >= 0; }, null, { timeout: 60000 });
  await pageG.evaluate(() => document.getElementById('optBtn').click());
  const pageD = await ctx.newPage();
  pageD.on('pageerror', e => fallos.push('diagonal: ' + e.message));
  await pageD.goto(BASE + '/buscador-implantacion.html?encargo=1&quieto=1&semilla=9-9');
  await pageD.waitForFunction(() => window.LAY && window.LAY.compute, null, { timeout: 30000 });
  await pageD.evaluate(() => PASO(80));
  const ed = await pageD.evaluate(() => ESTADO());
  check('en una parcela diagonal SÍ encuentra mejora, y grande', ed.mejorEner > ed.baseEner * 1.05 && ed.mejorGiro > 5,
    JSON.stringify({ base: Math.round(ed.baseKwp), mejor: Math.round(ed.mejorKwp), giro: +ed.mejorGiro.toFixed(1) }));
  await pageD.keyboard.press('a');
  const mejor = await pageD.evaluate(() => JSON.parse(localStorage.getItem('buscador_mejor')));
  if (!mejor) { check('en la diagonal SÍ debería haber envío (no lo hubo)', false, JSON.stringify(ed)); }
  else {
  check('A lo envía con su azimut y sus números', !!mejor && mejor.kwp === ed.mejorKwp && ['none', 'half'].includes(mejor.rowOffset),
    JSON.stringify(mejor && { az: mejor.panelAz, kwp: mejor.kwp }));
  // el EJE viaja: en este motor las filas son ⟂ al eje, así que aplicar el giro sin mover el eje
  // dejaría un layout que declara un eje que no es el suyo (y de ahí comen 3D y backtracking)
  check('el mejor lleva su EJE, coherente con las filas', Math.abs(mejor.axis - (mejor.panelAz - 90)) < 1e-9,
    JSON.stringify({ axis: mejor.axis, panelAz: mejor.panelAz }));
  await pageD.close();

  // al VOLVER al generador (focus), los mandos aparecen puestos y el hint lo canta
  await pageG.evaluate(() => window.dispatchEvent(new Event('focus')));
  const puesto = await pageG.evaluate(() => ({
    az: document.getElementById('panelAz').value,
    eje: document.getElementById('axis').value,
    off: document.getElementById('rowOffset').value,
    vial: document.getElementById('roadNsEvery').value,
    hint: document.getElementById('hint').textContent,
    limpio: localStorage.getItem('buscador_mejor') === null }));
  check('al volver, el azimut del mejor está puesto', Math.abs(+puesto.az - mejor.panelAz) < 0.06, puesto.az + ' vs ' + mejor.panelAz);
  check('y el tresbolillo y los viales', puesto.off === mejor.rowOffset && +puesto.vial === mejor.roadNsEvery,
    puesto.off + '/' + puesto.vial);
  check('y el EJE también, que si no el layout declara uno que no es el suyo',
    Math.abs(+puesto.eje - mejor.axis) < 0.06 && Math.abs(+puesto.az - +puesto.eje - 90) < 0.12,
    JSON.stringify({ eje: puesto.eje, az: puesto.az, esperado: mejor.axis }));
  check('el hint pide Generar y el canal queda limpio', puesto.hint.includes('Generar') && puesto.limpio, puesto.hint.slice(0, 70));
  // el barrido propio de la ficha se APAGA: si no, al generar re-barre y pisa el azimut que
  // acaba de traer el buscador — prometía una planta y salía otra
  check('y el barrido de la ficha queda apagado, para respetar el azimut aplicado',
    await pageG.evaluate(() => !document.getElementById('optAz').checked && !document.getElementById('optGrid').checked), true);

  // ── Y EL CAREO QUE FALTABA: que al GENERAR salgan los kWp que el buscador prometió. Sin esto
  //    el puente podía poner los mandos «bien» y dar otra planta, y nadie se enteraba. Es la
  //    comprobación que habría cazado sola el «igual???» de 2026-09-08.
  await pageG.evaluate(() => { document.querySelector('#hint').textContent = ''; document.querySelector('#genBtn').click(); });
  await pageG.waitForFunction(() => { const t = document.querySelector('#hint').textContent;
    return t.indexOf('ms') >= 0 || t.indexOf('error') >= 0; }, null, { timeout: 60000 });
  const kwpReal = await pageG.evaluate(() => RES.stats.kWp);
  check('el Generador reproduce los kWp que el buscador prometió',
    Math.abs(kwpReal - mejor.kwp) / mejor.kwp < 1e-6, kwpReal + ' vs ' + mejor.kwp);
  }

  // ── MONTAJE FIJO: ahí el azimut de filas es el de los PANELES (al sur). Girarlo no es una
  //    variante de reparto, es apuntar los módulos a otro sitio: no se gira y se dice. ──
  await pageG.evaluate(() => { document.getElementById('mount').value = 'fija';
    if (typeof syncAz === 'function') syncAz();
    document.getElementById('optBtn').click(); });
  const pageF = await ctx.newPage();
  await pageF.goto(BASE + '/buscador-implantacion.html?encargo=1&quieto=1&semilla=7-7');
  await pageF.waitForFunction(() => window.LAY && window.LAY.compute, null, { timeout: 30000 });
  await pageF.evaluate(() => PASO(8));
  const ef = await pageF.evaluate(() => ESTADO());
  check('en fija no se gira nada', ef.encargo === true && ef.gira === false && ef.mejorGiro === 0,
    JSON.stringify({ gira: ef.gira, giro: ef.mejorGiro }));
  check('y la barra lo dice', (await pageF.evaluate(() => document.getElementById('barra').textContent)).includes('fija: no se gira'));
  await ctx.close();

  console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
  if (fallos.length) console.log('errores JS: ' + fallos.join(' | '));
  await browser.close();
  process.exit(ko || fallos.length ? 1 : 0);
})();
