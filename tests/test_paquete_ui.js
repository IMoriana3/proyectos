/* El botón «Coordenadas» de cada tarjeta de planta, en un Chromium de verdad.
 *
 * `test_paquete_campo.js` prueba el escritor de ZIP; esto prueba EL CAMINO
 * ENTERO: pulsar en la tarjeta, leer el índice, bajar los ficheros de esa
 * planta, armar el ZIP y descargarlo — y que el ZIP se abra con `unzip`.
 *
 * Los ficheros se sirven desde el repo de Cobertura Zigbee clonado AL LADO. En
 * producción el panel y los datos cuelgan los dos de imoriana3.github.io, o sea
 * el MISMO origen; aquí el panel va en localhost, así que la respuesta simulada
 * lleva la cabecera de CORS que allí no hace falta.
 *
 *   python3 -m http.server 8103        (en otra terminal, en este repo)
 *   node tests/test_paquete_ui.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.dirname(__dirname);
const ZIGBEE = path.join(path.dirname(RAIZ), 'cobertura-zigbee');
const URL_PANEL = process.env.URL || 'http://127.0.0.1:8103/index.html';
const EXEC = process.env.CHROMIUM_PATH || process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

const btn = (slug) => `[...document.querySelectorAll('#plants .paq-btn')].find(x=>x.dataset.paq===${JSON.stringify(slug)})`;

(async () => {
  if (!fs.existsSync(path.join(ZIGBEE, 'cobertura_coords', 'indice.json'))) {
    console.log('SKIP: no encuentro cobertura-zigbee/cobertura_coords/indice.json al lado');
    process.exit(0);
  }
  const browser = await chromium.launch({ executablePath: EXEC });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 }, acceptDownloads: true });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.route(/imoriana3\.github\.io\/cobertura-zigbee\//, r => {
    const rel = r.request().url().split('/cobertura-zigbee/')[1].split('?')[0];
    const f = path.join(ZIGBEE, rel);
    const cors = { 'access-control-allow-origin': '*' };
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, headers: cors, body: 'no' });
    return r.fulfill({ status: 200, headers: cors, body: fs.readFileSync(f),
                       contentType: rel.endsWith('.json') ? 'application/json' : 'text/csv' });
  });
  await page.goto(URL_PANEL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  /* Todas las plantas llevan el botón: el nombre de cobertura sale de su propia
     URL, así que no hay una segunda lista que se quede vieja. */
  const n = await page.evaluate(`document.querySelectorAll('#plants .paq-btn').length`);
  const tarj = await page.evaluate(`document.querySelectorAll('#plants .pcard').length`);
  check('cada tarjeta de planta lleva su botón de coordenadas', n === tarj && n > 5, n + ' de ' + tarj);

  /* El camino entero, sobre una planta con muchos ámbitos. */
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
    page.evaluate(`{ const b=${btn('ayora')}; b.scrollIntoView(); b.click(); }`)
  ]);
  await page.waitForTimeout(1500);
  check('pulsar en Ayora descarga su paquete', !!dl && dl.suggestedFilename() === 'cobertura_ayora.zip',
        dl ? dl.suggestedFilename() : 'sin descarga');
  if (dl) {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ui-')), 'cobertura_ayora.zip');
    await dl.saveAs(f);
    const corre = (args) => { try { return { out: execFileSync('unzip', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }), err: '' }; }
                              catch (e) { return { out: String(e.stdout || ''), err: String(e.stderr || e.message) }; } };
    const t = corre(['-t', f]);
    check('y `unzip` lo da por bueno', /No errors detected/.test(t.out) && !t.err.trim(),
          (t.err || t.out).trim().split('\n').pop());
    const lista = corre(['-Z1', f]).out.trim().split('\n');
    check('con todos los ámbitos de la planta dentro de su carpeta',
          lista.length >= 15 && lista.every(q => q.startsWith('ayora/')) &&
          lista.some(q => /coords_ayora_NCU\d\d\.csv$/.test(q)) &&
          lista.includes('ayora/manifiesto_ayora.json') && lista.includes('ayora/ncus_ayora.csv'),
          lista.length + ' ficheros');
    const leeme = corre(['-p', f, 'ayora/LEEME.txt']).out;
    check('y un LÉEME que dice CUÁL lanzar y qué hacer al volver',
          /NCU<nn>_GW<n>/.test(leeme) && /no se sondean/.test(leeme) &&
          /ayora_real\.geojson/.test(leeme), leeme.split('\n')[0]);
    const csv = corre(['-p', f, 'ayora/coords_ayora_NCU01.csv']).out;
    check('los CSV salen enteros, con su cabecera y sus nodos',
          /^node_id,lat,lon,etiqueta,rol,enlace,ncu,gw,esclavo/.test(csv) && csv.trim().split('\n').length > 40,
          csv.trim().split('\n').length + ' líneas');
  }

  /* Una planta sin malla no puede tener un botón que falla cada vez. */
  await page.evaluate(`{ const b=${btn('dicayagua')}; b.scrollIntoView(); b.click(); }`);
  await page.waitForTimeout(2000);
  const dic = await page.evaluate(`(()=>{ const b=${btn('dicayagua')};
    return {t:b.textContent, off:b.disabled, av:b.title}; })()`);
  check('una planta sin malla apaga su botón y dice por qué',
        dic.off === true && /Sin malla/.test(dic.t) && /no tiene malla/i.test(dic.av), JSON.stringify(dic));

  check('sin errores de JavaScript', errs.length === 0, errs.slice(0, 2).join(' | '));
  await browser.close();
  console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
  process.exit(ko ? 1 : 0);
})();
