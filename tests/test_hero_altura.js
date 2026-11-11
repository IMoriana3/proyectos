// LA PORTADA NO CAMBIA DE TAMAÑO AL HACERSE DE NOCHE.
//
// Pedido en campo, con dos capturas a las 16:16 y a las 18:15: «¿por qué
// cambia el tamaño?». La cabecera del panel del héroe era una fila con
// `flex-wrap:wrap`: de día el modo («backtracking») cabe al lado de «Ángulo
// ejecutado · fila tipo backtracking»; de noche dice «noche · posición
// nocturna», no cabe, baja a una segunda línea, y el panel ENTERO —y con él el
// 3D de al lado— crece esa línea. La página salta cada vez que el sol se pone
// o se recorre el día con el deslizador.
//
// Aquí se recorre el día con el propio deslizador del héroe y se exige que la
// cabecera sea UNA línea y que la altura del panel no se mueva, a dos anchos
// de ventana (el de las capturas y uno más estrecho, donde antes saltaba
// antes).
//
//   python3 -m http.server 8099
//   node tests/test_hero_altura.js
'use strict';
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');
const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  for (const ancho of [1825, 1280]) {
    const page = await browser.newPage({ viewport: { width: ancho, height: 900 } });
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    // el héroe solo existe en modo presentación (body.presenta): sin él todo mide 0 y el banco
    // pasaría sin mirar nada — que es lo que hizo su primera versión
    await page.evaluate(() => document.body.classList.add('presenta'));
    await page.waitForFunction(() => {
      const m = document.getElementById('h-modo'); return m && m.textContent.trim() !== '—';
    }, null, { timeout: 30000 });
    const mide = (min) => page.evaluate((min) => {
      const r = document.getElementById('h-min'); r.value = String(min);
      r.dispatchEvent(new Event('input', { bubbles: true }));
      const head = document.querySelector('.hero-head'), modo = document.getElementById('h-modo');
      const lh = parseFloat(getComputedStyle(modo).lineHeight) || modo.getBoundingClientRect().height;
      return { panel: document.querySelector('.hero-panel').getBoundingClientRect().height,
               head: head.getBoundingClientRect().height, lh,
               modoTop: modo.getBoundingClientRect().top, labTop: head.firstElementChild.getBoundingClientRect().top,
               modo: modo.textContent };
    }, min);
    // del mediodía a la noche, pasando por la tarde: los tres modos que se ven en un día
    const dia = await mide(720), tarde = await mide(16 * 60 + 16), noche = await mide(23 * 60);
    check(ancho + ' px: el héroe se ve de verdad (si mide 0, no se mide nada)', dia.panel > 100 && dia.head > 5,
      'panel ' + dia.panel.toFixed(0) + ' · cabecera ' + dia.head.toFixed(0));
    check(ancho + ' px: de noche el modo dice «noche»', /noche/.test(noche.modo), noche.modo);
    check(ancho + ' px: de noche la cabecera sigue en UNA línea (el modo no baja)',
      Math.abs(noche.modoTop - noche.labTop) < noche.lh / 2,
      'modo ' + noche.modoTop.toFixed(0) + ' · etiqueta ' + noche.labTop.toFixed(0));
    check(ancho + ' px: el panel mide lo mismo de día, de tarde y de noche',
      Math.abs(noche.panel - dia.panel) < 1 && Math.abs(tarde.panel - dia.panel) < 1,
      'día ' + dia.panel.toFixed(1) + ' · tarde ' + tarde.panel.toFixed(1) + ' · noche ' + noche.panel.toFixed(1));
    await page.close();
  }
  await browser.close();
  console.log('\n' + (ko ? 'FALLOS: ' + ko : 'OK — ' + ok + '/' + ok + ' comprobaciones'));
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL el banco reventó -> ' + e.message); process.exit(1); });
