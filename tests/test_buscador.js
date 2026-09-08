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

  // monotonía: el récord no baja al seguir
  await page.evaluate(() => PASO(25));
  const e2 = await page.evaluate(() => ESTADO());
  check('el récord no baja al seguir buscando', e2.mejorKwp >= e1.mejorKwp, e2.mejorKwp + ' < ' + e1.mejorKwp);

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
  // un JSON sin vallado no cuela
  check('sin `fence` no hay parcela real', (await page.evaluate(() => cargaLayoutReal({ title: 'x' }))) === false);

  console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
  if (fallos.length) console.log('errores JS: ' + fallos.join(' | '));
  await browser.close();
  process.exit(ko || fallos.length ? 1 : 0);
})();
