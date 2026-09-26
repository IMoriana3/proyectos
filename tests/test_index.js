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
const { EXEC } = require('./pw_navegador.js');   // dónde está el chromium, en un solo sitio
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
  const browser = await chromium.launch({ executablePath: EXEC });

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
  page = await abrir(browser, { tag_name: 'v11.89', published_at: '2026-10-02T00:00:00Z' });
  card = await tarjetaToolbox(page);
  await page.waitForFunction(() => {
    const c = [...document.querySelectorAll('article.card')].find(x => x.querySelector('.name')?.textContent.includes('TCU Toolbox'));
    return c && c.querySelector('.ver')?.textContent === '11.89';
  }, null, { timeout: 5000 });
  check('tag v11.89 sin prefijo', await card.locator('.ver').textContent(), '11.89');
  await page.close();

  // Una respuesta atrasada de /latest no debe rebajar la revision publicada.
  page = await abrir(browser, { tag_name: 'toolbox-v11.87', published_at: '2026-09-25T00:00:00Z' });
  card = await tarjetaToolbox(page);
  await page.waitForTimeout(700);
  check('release anterior no rebaja la tarjeta', await card.locator('.ver').textContent(), '11.88');
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
  // CORREGIDO. Esto contaba `article.card` A SECAS con umbral «mas de cinco»,
  // y se llamaba «se pintan las tarjetas»: las de PLANTA son tambien
  // `article.card` y con las de herramienta vacias quedan ONCE, asi que la
  // condicion pasaria sin haberse pintado ni una herramienta. El mecanismo no
  // estaba sin vigilar —con ese mutante el arnes revienta y el porton lo caza
  // por recuento— pero el liston era flojo y el nombre prometia mas. Ahora
  // cuenta la rejilla, que es la de herramientas, y exige UNA POR HERRAMIENTA.
  const nCards = await page.locator('#grid article.card').count();
  const nTools = await page.evaluate(() => TOOLS.length);
  check('se pintan las tarjetas de herramienta', nCards === nTools && nTools > 5, 'true');

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

  // ---------- LA VERSION DE LAS APPS SALE DE LA APP, NO DE LA TARJETA ----------
  // Las tarjetas de los dos simuladores ya no escriben su numero: llevan
  // `verEnApp: true` y el Panel lo LEE del fichero de la app. Aqui se prueba
  // que de verdad lo lee, y sobre todo que cuando NO puede leerlo no se
  // inventa nada — que es la parte que antes no existia, porque el numero
  // estaba escrito y siempre habia algo que pintar aunque fuera mentira.
  const URL_BT = 'https://imoriana3.github.io/cobertura-zigbee/backtracking.html';
  const APPS   = 'https://imoriana3.github.io/cobertura-zigbee/*';

  // Abre el Panel con las apps simuladas. `cuerpo` es el HTML que devuelven
  // (string) o el codigo HTTP con el que fallan (numero). `previo` siembra
  // localStorage como si este navegador ya las hubiera leido antes.
  async function abrirConApps(cuerpo, previo) {
    const pg = await browser.newPage();
    pg.route('https://api.github.com/repos/*/*/releases/latest', r => r.fulfill({ status: 403, body: '{}' }));
    pg.route(APPS, r => typeof cuerpo === 'number'
      ? r.fulfill({ status: cuerpo, body: '' })
      : r.fulfill({ status: 200, contentType: 'text/html', body: cuerpo }));
    await pg.addInitScript(([u, v]) => {
      try { localStorage.clear(); if (v) localStorage.setItem('ver:' + u, JSON.stringify(v)); } catch (e) {}
    }, [URL_BT, previo || null]);
    await pg.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    return pg;
  }
  // Espera a que el chip deje de decir «...», PERO SIN REVENTAR. Con un
  // `waitForFunction` a secas, desconectar el lector daba «Timeout 5000ms
  // exceeded» y nada mas: rojo, si, pero sin decir que habia pintado en su
  // lugar, que es el unico dato que ahorra la tarde. Si no llega a tiempo se
  // devuelve lo que haya y lo dice la comprobacion de abajo, con su valor.
  async function estable(pg, nombre) {
    try {
      await pg.waitForFunction(n => {
        const c = [...document.querySelectorAll('article.card')].find(x => x.querySelector('.name')?.textContent.trim() === n);
        const t = c && c.querySelector('.ver')?.textContent.trim();
        return t && t !== '...';
      }, nombre, { timeout: 5000 });
    } catch (e) { /* lo cuenta el check, con el texto real */ }
    return chipDe(pg, nombre);
  }
  const chipDe = async (pg, nombre) => pg.evaluate(n => {
    const c = [...document.querySelectorAll('article.card')].find(x => x.querySelector('.name')?.textContent.trim() === n);
    const v = c && c.querySelector('.ver');
    return v ? { txt: v.textContent.trim(), pend: v.classList.contains('pend') } : { txt: '(sin chip)', pend: null };
  }, nombre);

  // 1) la app responde -> el chip dice LO QUE DICE LA APP.
  //    EL CONTROL QUE HACE QUE ESTO PRUEBE ALGO: 'v9.9.9' no esta escrito en
  //    index.html, asi que si aparece solo ha podido venir del fetch. Sin
  //    esta linea la comprobacion pasaria igual con el numero copiado.
  const idxSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  check('el numero de la prueba NO esta escrito en el Panel', idxSrc.includes('v9.9.9'), 'false');
  page = await abrirConApps("<html><script>\nconst VER='v9.9.9';\n</script></html>");
  const chipBT = await estable(page, 'Simulador de backtracking');
  check('la version sale de la app', chipBT.txt, 'v9.9.9');
  check('y no va marcada como dudosa', chipBT.pend, 'false');
  check('la lectura se cachea', JSON.parse(await page.evaluate(u => localStorage.getItem('ver:' + u), URL_BT)).ver, 'v9.9.9');
  // el control de al lado: una tarjeta SIN puntero sigue pintando su literal
  check('una tarjeta sin puntero sigue con su numero escrito',
        (await chipDe(page, 'Producción 3D por string')).txt.length > 0, 'true');
  await page.close();

  // 2) la app no responde y este navegador no la habia leido nunca ->
  //    LO DICE. No pinta un numero, porque no tiene ninguno que sea suyo.
  page = await abrirConApps(404);
  await page.waitForTimeout(700);
  let c1 = await chipDe(page, 'Simulador de backtracking');
  check('sin app y sin lectura previa, lo declara', c1.txt, 'version no leida');
  check('y no se inventa un numero', /\d/.test(c1.txt), 'false');
  check('y no cachea nada', await page.evaluate(u => localStorage.getItem('ver:' + u), URL_BT), 'null');
  await page.close();

  // 3) la app no responde pero este navegador YA la habia leido -> ensena la
  //    ultima lectura MARCADA, que no es lo mismo que ensenarla a secas.
  page = await abrirConApps(500, { t: Date.now() - 7 * 3600 * 1000, ver: 'v7.7.7' });
  await page.waitForTimeout(700);
  c1 = await chipDe(page, 'Simulador de backtracking');
  check('sin app pero con lectura previa, ensena la ultima', c1.txt.startsWith('v7.7.7'), 'true');
  check('y la marca como no comprobada', c1.pend, 'true');
  await page.close();

  await browser.close();
  console.log('');
  if (ko) { console.log(ko + ' PRUEBAS FALLIDAS (' + ok + ' OK)'); process.exit(1); }
  console.log('TODAS OK (' + ok + ' comprobaciones)');
})().catch(e => { console.error(e); process.exit(1); });
