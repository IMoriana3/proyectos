// Pruebas de la app instalable (PWA) en un navegador real.
//
// Lo que comprueba de verdad, que son las tres cosas que rompen una PWA sin
// que se note al mirarla:
//   1) el manifest es válido y sus iconos EXISTEN (un icono 404 = no instalable);
//   2) el service worker se activa, con el scope esperado, y precachea el armazón;
//   3) sin red la app sigue abriendo y pintando (que es para lo que se instala).
// Y un cuarto que ya nos mordió: que el SW NO recargue la página en la primera
// visita al tomar el control.
//
//   npm install playwright            # el navegador ya esta en /opt/pw-browsers
//   python3 -m http.server 8099       # servir el repo (en otra terminal)
//   node tests/test_pwa.js
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8099';
const CACHE = 'factiun-panel-v1';        // debe coincidir con sw.js
let ok = 0, ko = 0;
function check(nombre, valor, esperado) {
  const bien = String(valor) === String(esperado);
  if (bien) { ok++; console.log('OK   ' + nombre + ' = ' + valor); }
  else { ko++; console.log('FAIL ' + nombre + ' : obtenido ' + JSON.stringify(String(valor)) + ', esperado ' + JSON.stringify(String(esperado))); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  // La API de releases no pinta nada aqui: se corta para no gastar el limite.
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 403, body: '{}' }));

  let recargas = 0;
  page.on('framenavigated', f => { if (f === page.mainFrame()) recargas++; });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });

  // ---------- manifest ----------
  const man = await page.evaluate(async () => {
    const l = document.querySelector('link[rel=manifest]');
    if (!l) return { href: null };
    const r = await fetch(l.href);
    return { href: l.getAttribute('href'), status: r.status, j: await r.json() };
  });
  check('link al manifest', man.href, 'manifest.webmanifest');
  check('el manifest se sirve', man.status, 200);
  check('scope de la app', man.j.scope, '/');           // "/" para que los visores del mismo dominio abran dentro
  check('display', man.j.display, 'standalone');
  check('hay icono maskable', man.j.icons.some(i => i.purpose === 'maskable'), true);
  const iconos = await page.evaluate(async icons => {
    const o = [];
    for (const i of icons) { try { const r = await fetch(i.src, { cache: 'no-store' }); o.push(r.status); } catch (e) { o.push('ERR'); } }
    return o;
  }, man.j.icons);
  check('todos los iconos existen', iconos.every(s => s === 200), true);
  const apple = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=apple-touch-icon]').href)).status);
  check('apple-touch-icon existe', apple, 200);

  // ---------- service worker ----------
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { scope: r && r.scope, estado: r && r.active && r.active.state };
  });
  check('SW activo', sw.estado, 'activated');
  check('scope del SW', sw.scope, BASE.replace(/\/$/, '') + '/');
  check('no recarga la pagina en la primera visita', recargas, 1);

  // ---------- precache del armazon ----------
  await page.waitForFunction(async c => (await (await caches.open(c)).keys()).length >= 8, CACHE, { timeout: 10000 });
  const cache = await page.evaluate(async c => (await (await caches.open(c)).keys()).map(r => new URL(r.url).pathname), CACHE);
  ['/index.html', '/cartera-tabla.html', '/layout.html', '/sim-solar.html', '/manifest.webmanifest']
    .forEach(u => check('precacheado ' + u, cache.includes(u), true));

  // ---------- boton de instalar ----------
  check('el boton sale solo si se puede instalar', await page.locator('#btn-inst').isVisible(), false);
  await page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted = 1; }; window.dispatchEvent(e); });
  check('aparece con beforeinstallprompt', await page.locator('#btn-inst').isVisible(), true);
  await page.locator('#btn-inst').click();
  check('el clic abre el instalador del navegador', await page.evaluate(() => window.__prompted || 0), 1);

  // ---------- sin red ----------
  await ctx.setOffline(true);
  const off = await ctx.newPage();
  await off.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await off.waitForTimeout(1200);
  check('offline: pinta las tarjetas', await off.locator('article.card').count() > 0, true);
  check('offline: pinta las plantas', await off.locator('.plants article').count() > 0, true);
  const otra = await ctx.newPage();
  const res = await otra.goto(BASE + '/cartera-tabla.html', { waitUntil: 'domcontentloaded' });
  check('offline: abre la cartera tecnica', res.status(), 200);
  await ctx.setOffline(false);

  await browser.close();
  console.log('');
  if (ko) { console.log('FALLAN ' + ko + ' de ' + (ok + ko)); process.exit(1); }
  console.log('TODAS OK (' + ok + ' comprobaciones)');
})();
