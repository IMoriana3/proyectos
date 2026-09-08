// Pruebas del panel de proyectos en un navegador real (Chromium via Playwright).
//
// Lo que comprueba de verdad: que la version y la fecha de la tarjeta salen de
// la ULTIMA RELEASE de GitHub y no del texto escrito a mano — que es justo lo
// que se quedaba viejo (la ficha decia 2.3 / 5-ago con el ZIP ya por la 11.4).
// Y que si la API falla, la tarjeta NO se queda en blanco: mantiene el valor
// escrito a mano.
//
//   npm install playwright            # el navegador ya esta en /opt/pw-browsers
//   python3 -m http.server 8099       # servir el repo (en otra terminal)
//   node tests/test_index.js
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
function check(nombre, valor, esperado) {
  const bien = String(valor) === String(esperado);
  if (bien) { ok++; console.log('OK   ' + nombre + ' = ' + valor); }
  else { ko++; console.log('FAIL ' + nombre + ' : obtenido ' + JSON.stringify(String(valor)) + ', esperado ' + JSON.stringify(String(esperado))); }
}

// La tarjeta de la toolbox, por su nombre visible.
async function tarjetaToolbox(page) {
  return page.locator('article.card', { has: page.locator('.name', { hasText: 'TCU Toolbox' }) }).first();
}

// Monta la pagina con la API de releases simulada. `respuesta` decide que
// contesta github: un objeto -> 200 con ese JSON; un numero -> ese codigo HTTP.
async function abrir(browser, respuesta) {
  const page = await browser.newPage();
  await page.route('https://api.github.com/repos/*/*/releases/latest', route => {
    if (typeof respuesta === 'number') { route.fulfill({ status: respuesta, body: '{}' }); return; }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respuesta) });
  });
  // localStorage limpio: la cache de 6 h taparia la segunda pasada
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  // ---------- la release manda sobre lo escrito a mano ----------
  let page = await abrir(browser, { tag_name: 'toolbox-v12.7', published_at: '2026-09-01T10:00:00Z' });
  let card = await tarjetaToolbox(page);
  await page.waitForFunction(() => {
    const c = [...document.querySelectorAll('article.card')].find(x => x.querySelector('.name')?.textContent.includes('TCU Toolbox'));
    return c && c.querySelector('.ver')?.textContent === '12.7';
  }, null, { timeout: 5000 });
  check('version de la release', await card.locator('.ver').textContent(), '12.7');
  check('fecha de la release', await card.locator('.upd').textContent(), 'act. 2026-09-01');
  // y queda cacheada para no gastar el limite de la API en cada recarga
  const cache = await page.evaluate(() => localStorage.getItem('rel:IMoriana3/scada'));
  check('la release se cachea', JSON.parse(cache).ver, '12.7');
  await page.close();

  // ---------- tags con otras formas ----------
  page = await abrir(browser, { tag_name: 'v3.1', published_at: '2026-01-02T00:00:00Z' });
  card = await tarjetaToolbox(page);
  await page.waitForFunction(() => {
    const c = [...document.querySelectorAll('article.card')].find(x => x.querySelector('.name')?.textContent.includes('TCU Toolbox'));
    return c && c.querySelector('.ver')?.textContent === '3.1';
  }, null, { timeout: 5000 });
  check('tag v3.1 sin prefijo', await card.locator('.ver').textContent(), '3.1');
  await page.close();

  // ---------- si la API falla, se queda lo escrito a mano ----------
  page = await abrir(browser, 403);   // 403 = limite de la API sin autenticar
  card = await tarjetaToolbox(page);
  await page.waitForTimeout(700);
  const vMano = await card.locator('.ver').textContent();
  const fMano = await card.locator('.upd').textContent();
  check('sin API, la version no se vacia', vMano.length > 0, 'true');
  check('sin API, la fecha no se vacia', fMano !== 'act. —', 'true');
  check('sin API, no cachea nada', await page.evaluate(() => localStorage.getItem('rel:IMoriana3/scada')), 'null');
  await page.close();

  // ---------- lo de siempre sigue funcionando ----------
  page = await abrir(browser, 403);
  const nCards = await page.locator('article.card').count();
  check('se pintan las tarjetas', nCards > 5, 'true');

  // ---------- las tarjetas de planta solo llevan VISTAS ----------
  // El boton «Coordenadas» armaba aqui el ZIP de campo, y despistaba: entre seis
  // botones que abren una vista habia uno que descargaba un fichero, y no se
  // entendia que descargaba ni para que. Eso se hace ahora DENTRO de Cobertura,
  // con «↓ Medir en planta», que es donde esta el que va a medir. Aqui no vuelve.
  const pv = await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('article.pcard'));
    const hijos = c.flatMap(x => Array.from(x.querySelectorAll('.pviews > *')));
    return {
      tarjetas: c.length,
      // cada hijo es un enlace a una vista o el hueco de una vista que no hay
      soloVistas: hijos.every(h => (h.tagName === 'A' && h.href) ||
                                   (h.tagName === 'SPAN' && h.classList.contains('off'))),
      botones: hijos.filter(h => h.tagName === 'BUTTON').length,
      texto: /coordenadas/i.test(document.querySelector('#plants').textContent),
    };
  });
  check('hay tarjetas de planta', pv.tarjetas > 5, 'true');
  check('en la fila de vistas no hay ningun boton', pv.botones, '0');
  check('solo enlaces a vistas (y huecos de las que faltan)', pv.soloVistas, 'true');
  check('y la palabra «Coordenadas» no aparece en ninguna tarjeta', pv.texto, 'false');
  // y la maquinaria del ZIP se fue con el: dejarla es codigo muerto que un dia
  // alguien vuelve a cablear sin querer
  check('sin el armador de paquetes en la pagina', await page.evaluate(
    () => ['zipStore','crc32','bajaPaquete','paqueteDe','leemeDe','slugCobertura']
            .some(f => typeof window[f] === 'function')), 'false');
  card = await tarjetaToolbox(page);
  await card.locator('.card-toggle').click();
  check('el detalle abre', await card.locator('.detail').isVisible(), 'true');
  check('con su historial', await card.locator('.log li').count() > 0, 'true');
  // el boton Paquete apunta a la release, no a un ZIP con la version pegada
  check('descarga a releases/latest', await card.locator('a.btn[download]').getAttribute('href'), 'https://github.com/IMoriana3/scada/releases/latest');
  // y la documentacion carga
  await card.locator('button.btn.docs').click();
  await page.waitForSelector('#reader.open', { timeout: 5000 });
  await page.waitForFunction(() => !document.querySelector('#reader-body .doc-loading'), null, { timeout: 5000 });
  const doc = await page.locator('#reader-body').textContent();
  check('la doc carga', doc.includes('TCU Toolbox'), 'true');
  check('la doc no da error', doc.includes('Documentacion no disponible'), 'false');
  await page.close();

  await browser.close();
  console.log('');
  if (ko) { console.log(ko + ' PRUEBAS FALLIDAS (' + ok + ' OK)'); process.exit(1); }
  console.log('TODAS OK (' + ok + ' comprobaciones)');
})().catch(e => { console.error(e); process.exit(1); });
