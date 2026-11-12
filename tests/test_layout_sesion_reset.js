/* «Empezar de cero» en el generador de layout no debe resucitar la sesión.
 *
 * El caso: un cambio justo antes (deja un autoguardado pendiente, 800 ms) y
 * una recarga que tarda más que eso. El temporizador sigue vivo durante la
 * recarga, volvía a escribir la sesión recién borrada y la página «limpia» la
 * restauraba. En CI, donde la recarga es lenta, `test_layout_ui.js` salía rojo
 * a ratos justo ahí (línea de «empezar de cero»). Aquí la recarga se retrasa a
 * propósito para que el caso se dé siempre, no por azar.
 */
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');
const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('OK   ' + n); } else { ko++; console.log('FAIL ' + n + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };

(async () => {
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('#prot', '35');
  await page.waitForTimeout(1200);                                   // deja correr el autoguardado
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /restaurada/.test(document.querySelector('#foot')?.textContent || ''), null, { timeout: 10000 });
  check('(preparación) la sesión guardada se restaura al recargar', await page.inputValue('#prot') === '35');

  let recargas = 0;
  await page.route('**/generador-layout.html', async r => { recargas++; await new Promise(x => setTimeout(x, 1500)); await r.continue(); });
  await page.fill('#prot', '40');                                    // autoguardado pendiente
  await page.click('#sesReset');
  await page.waitForTimeout(3500);
  const foot = await page.evaluate(() => document.querySelector('#foot')?.textContent || '');
  check('(preparación) la recarga se ha retrasado más que el autoguardado', recargas >= 1, recargas);
  check('«empezar de cero» con un autoguardado pendiente y recarga lenta no restaura la sesión',
    !/restaurada/.test(foot) && await page.inputValue('#prot') === '0', { prot: await page.inputValue('#prot'), foot: foot.slice(0, 80) });
  check('y no queda sesión guardada', await page.evaluate(() => !localStorage.getItem('genlayout_sesion')));
  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FAIL');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL excepción ' + e.message); process.exit(1); });
