/* LAS TRES TARJETAS DE NOTION Y LA LÍNEA ESCRITA DEL PIE, en un Chromium de verdad.
 *
 * Por qué existe: el panel tenía UN solo eje para decir en qué punto está una pantalla, `status`, y
 * con él se estaba contando media verdad —«Producción» en tres tarjetas cuya lectura real de datos
 * nadie ha comprobado con una sesión autorizada—. El arreglo no es degradar el estado (las
 * pantallas están publicadas de verdad): es un eje aparte, `verificacion`, que se pinta con la
 * tarjeta CERRADA. Lo que este banco sujeta es justo lo que se puede ir en silencio:
 *
 *   · que lo que falta se lea sin abrir nada (si sólo saliera en el detalle, no sirve de nada);
 *   · que esa línea sea una frase —estado y fecha escritos—, no un juego de insignias;
 *   · que el chip «Sin verificar» CUENTE y FILTRE, en vez de decorar;
 *   · que el botón de una tarjeta hermana la abra aunque un filtro la esté escondiendo;
 *   · que los enlaces de Notion de las tres rotulen su destino real.
 *
 * Seis mutantes MEDIDOS el 2026-11-15, los seis en rojo: `verifChip` que no dice nunca que falta
 * algo mata 4 comprobaciones; esconder la línea del pie con la ficha cerrada, 3; la fecha otra vez
 * en ISO, 3; un acceso a la hermana que la centra sin abrirla, 2; el chip contando por estado, 1; y
 * el estado sin escribir en la línea, 1. Piso del arnés: 13.
 *
 *   python3 -m http.server 8099       # servir el repo (en otra terminal)
 *   node tests/test_tarjetas_notion.js
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');
const BASE = process.env.BASE_URL || process.env.BASE || 'http://localhost:8099';
const TRIO = ['Notion compras', 'Notion ventas', 'Notion ingeniería'];

let passed = 0, failed = 0, browser;
const check = async (name, fn) => {
  try { await fn(); console.log('OK   ' + name); passed++; }
  catch (e) { console.error('FAIL ' + name + ' — ' + e.message); failed++; }
};
async function abrir() {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await ctx.route('https://api.github.com/**', r => r.fulfill({ status: 403, body: '{}' }));
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#grid article.card');
  return { ctx, page };
}
const tarjeta = (page, nombre) =>
  page.locator('#grid article.card').filter({ has: page.locator('.name', { hasText: nombre }) }).first();

(async () => {
  browser = await chromium.launch({ headless: true, executablePath: EXEC || undefined, args: ['--no-sandbox'] });

  /* ---- 1. el sello se lee con la tarjeta cerrada ---- */
  for (const nombre of TRIO) {
    await check('«' + nombre + '» enseña el sello sin abrir la ficha', async () => {
      const { ctx, page } = await abrir();
      try {
        const card = tarjeta(page, nombre);
        assert.equal(await card.count(), 1, 'la tarjeta no está en la rejilla');
        assert.ok(!(await card.evaluate(el => el.classList.contains('open'))), 'la tarjeta nace abierta');
        const sello = card.locator('.pie-linea .verif');
        assert.ok(await sello.isVisible(), 'lo que falta no se lee con la ficha cerrada');
        assert.match((await sello.innerText()).trim(), /^falta comprobar /, 'el aviso no dice qué falta');
        const motivo = await sello.getAttribute('title');
        assert.ok(motivo && motivo.length > 40, 'el aviso no lleva el motivo entero: ' + JSON.stringify(motivo));
        // y la línea es una frase, no un juego de insignias: estado y fecha escritos
        const linea = (await card.locator('.pie-linea').innerText()).replace(/\s+/g, ' ');
        assert.match(linea, /en producción/, 'el estado no va escrito en la línea: ' + linea);
        assert.match(linea, /al día el \d{1,2} [a-z]{3} \d{4}/, 'la fecha no se lee en cristiano: ' + linea);
        assert.equal(await card.locator('.status').count(), 0, 'la insignia de estado sigue en la cabecera');
      } finally { await ctx.close(); }
    });
  }

  /* ---- 2. el detalle dice QUÉ falta, no sólo que falta ---- */
  await check('el detalle publica la fila «Verificación» con el motivo entero', async () => {
    const { ctx, page } = await abrir();
    try {
      const card = tarjeta(page, 'Notion compras');
      await card.locator('.card-toggle').click();
      const dd = card.locator('.detail .kv dd.nota');
      assert.ok(await dd.isVisible(), 'no hay fila de verificación en el detalle');
      const texto = await dd.innerText();
      assert.match(texto, /sesión autorizada en producción/);
      assert.ok(await dd.evaluate(el => el.classList.contains('pend')), 'la fila no se marca como pendiente');
    } finally { await ctx.close(); }
  });

  /* ---- 3. el chip «Sin verificar» cuenta y filtra de verdad ---- */
  await check('el chip «Sin verificar» cuenta las tarjetas que lo declaran', async () => {
    const { ctx, page } = await abrir();
    try {
      const chip = page.locator('#chips .chip', { hasText: 'Sin verificar' });
      assert.equal(await chip.count(), 1, 'no hay chip de verificación');
      const declaradas = await page.evaluate(() => TOOLS.filter(p => p.verificacion && p.verificacion.texto && p.verificacion.estado !== 'hecha').length);
      assert.ok(declaradas >= TRIO.length, 'esperaba al menos ' + TRIO.length + ' declaradas, hay ' + declaradas);
      assert.match(await chip.innerText(), new RegExp('· ' + declaradas + '$'));
    } finally { await ctx.close(); }
  });

  await check('el chip deja en pantalla sólo las que tienen algo sin comprobar', async () => {
    const { ctx, page } = await abrir();
    try {
      await page.locator('#chips .chip', { hasText: 'Sin verificar' }).click();
      const nombres = await page.locator('#grid article.card .name').allInnerTexts();
      assert.ok(nombres.length > 0, 'el filtro deja la rejilla vacía');
      for (const n of TRIO) assert.ok(nombres.includes(n), 'falta ' + n + ' en el filtro');
      const sellos = await page.locator('#grid article.card .pie-linea .verif.pend').count();
      assert.equal(sellos, nombres.length, 'hay tarjetas filtradas sin sello pendiente');
    } finally { await ctx.close(); }
  });

  /* ---- 4. el filtro de estado NO cuenta la verificación como un estado ---- */
  await check('«Producción» sigue contando por estado, no por verificación', async () => {
    const { ctx, page } = await abrir();
    try {
      const esperado = await page.evaluate(() => TOOLS.filter(p => p.status === 'live').length);
      const chip = page.locator('#chips .chip', { hasText: 'Producción' }).first();
      assert.match(await chip.innerText(), new RegExp('· ' + esperado + '$'));
      await chip.click();
      const nombres = await page.locator('#grid article.card .name').allInnerTexts();
      assert.equal(nombres.length, esperado);
      for (const n of TRIO) assert.ok(nombres.includes(n), 'el trío está servido: ' + n + ' debería salir en Producción');
    } finally { await ctx.close(); }
  });

  /* ---- 5. las hermanas se abren aunque un filtro las esconda ---- */
  await check('el acceso a una tarjeta hermana la abre y la centra', async () => {
    const { ctx, page } = await abrir();
    try {
      const card = tarjeta(page, 'Notion ventas');
      await card.locator('.card-toggle').click();
      const frase = (await card.locator('.detail .prosa').innerText()).replace(/\s+/g, ' ');
      assert.match(frase, /^Se consulta junto a .+\.$/, 'las hermanas no van en una frase: ' + frase);
      const rel = card.locator('.detail .rel', { hasText: 'Notion compras' });
      assert.equal(await rel.count(), 1, 'no hay acceso a la hermana');
      await rel.click();
      const hermana = tarjeta(page, 'Notion compras');
      await hermana.waitFor({ state: 'visible' });
      assert.ok(await hermana.evaluate(el => el.classList.contains('open')), 'la hermana no queda desplegada');
      assert.ok(await hermana.locator('.detail .kv').isVisible(), 'el detalle de la hermana no se ve');
    } finally { await ctx.close(); }
  });

  await check('el acceso quita el filtro que escondía a la hermana', async () => {
    const { ctx, page } = await abrir();
    try {
      const card = tarjeta(page, 'Notion ingeniería');
      await card.locator('.card-toggle').click();
      await page.fill('#q', 'radar');                       // deja fuera a Compras, no a Ingeniería
      assert.equal(await tarjeta(page, 'Notion compras').count(), 0, 'la búsqueda no esconde a la hermana');
      await tarjeta(page, 'Notion ingeniería').locator('.detail .rel', { hasText: 'Notion compras' }).click();
      const hermana = tarjeta(page, 'Notion compras');
      await hermana.waitFor({ state: 'visible' });
      assert.ok(await hermana.evaluate(el => el.classList.contains('open')), 'la hermana no queda desplegada');
      assert.equal(await page.inputValue('#q'), '', 'la búsqueda que la escondía sigue puesta');
    } finally { await ctx.close(); }
  });

  /* ---- 6. las tres, juntas y con su destino rotulado ---- */
  await check('las tres tarjetas viven en la familia Cartera', async () => {
    const { ctx, page } = await abrir();
    try {
      const fams = await page.evaluate(ns => ns.map(n => {
        const card = [...document.querySelectorAll('#grid article.card')].find(c => c.querySelector('.name').textContent === n);
        return card && card.dataset.fam;
      }), TRIO);
      assert.deepEqual(fams, TRIO.map(() => 'cartera'));
    } finally { await ctx.close(); }
  });

  await check('cada tarjeta rotula su enlace de Notion con el destino real', async () => {
    const { ctx, page } = await abrir();
    try {
      const links = await page.evaluate(ns => ns.map(n => {
        const p = TOOLS.find(t => t.name === n) || {};
        return (p.links || []).filter(l => /notion\.com/.test(l.url)).map(l => l.label);
      }), TRIO);
      assert.deepEqual(links, [
        ['Abrir Notion · Componentes'],
        ['Abrir Notion · Mercado'],
        ['Abrir Notion · Hub de ingeniería']
      ]);
    } finally { await ctx.close(); }
  });

  await check('la versión de la tarjeta de compras es la que sirve su pantalla', async () => {
    const { ctx, page } = await abrir();
    try {
      const v = await page.evaluate(() => TOOLS.find(p => p.name === 'Notion compras').version);
      assert.equal(v, '1.1');
      assert.match(await tarjeta(page, 'Notion compras').locator('.pie-linea .ver').innerText(), /1\.1/);
    } finally { await ctx.close(); }
  });

  /* ---- 7. una tarjeta sin el campo no pinta sello ---- */
  await check('una tarjeta sin `verificacion` no pinta sello ni entra en el filtro', async () => {
    const { ctx, page } = await abrir();
    try {
      const n = await page.evaluate(() => (TOOLS.find(p => !p.verificacion) || {}).name);
      assert.ok(n, 'todas las tarjetas declaran verificación: el caso no se puede probar');
      assert.equal(await tarjeta(page, n).locator('.pie-linea .verif').count(), 0);
      await page.locator('#chips .chip', { hasText: 'Sin verificar' }).click();
      assert.equal(await tarjeta(page, n).count(), 0);
    } finally { await ctx.close(); }
  });

  await browser.close();
  console.log('\n' + passed + ' OK, ' + failed + ' FAIL');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FAIL arnés — ' + e.stack); process.exit(1); });
