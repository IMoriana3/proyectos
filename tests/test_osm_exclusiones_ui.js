// La ficha EJECUTADA: «🧭 Exclusiones sugeridas desde OSM» en el navegador, con
// Overpass interceptado (el banco no depende de un servidor vivo: sirve el mismo
// JSON enlatado que careó el core, tests/careo-osm-exclusiones.json).
//
// Qué se exige:
//   · sin categoría o sin retranqueo NO se pide nada a Overpass, y se dice qué falta
//     (no hay distancia legal por defecto);
//   · lo que se envía a Overpass es la consulta del CORE, carácter a carácter;
//   · lo cargado es lo que toca (arroyo + contorno del embalse como líneas, el
//     embalse como área), con fecha del dato y atribución en pantalla;
//   · la CONSECUENCIA: tras «Generar», ninguna mesa pisa el pasillo del arroyo ni
//     el embalse ensanchado — y SIN las de OSM sí los pisan (si no, el test no
//     distinguiría nada);
//   · sobrevive a recargar la página (sesión) y «Quitar las de OSM» las quita.
//
//   BASE_URL=http://localhost:8099 node tests/test_osm_exclusiones_ui.js
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };
const fix = JSON.parse(fs.readFileSync(path.join(__dirname, 'careo-osm-exclusiones.json'), 'utf8'));
const TESELA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAA' +
  'IElEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAHwaIAAB1F0m1AAAAABJRU5ErkJggg==', 'base64');
const ESPEJOS = ['https://overpass-api.de/**', 'https://overpass.kumi.systems/**',
                 'https://overpass.private.coffee/**'];

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const page = await browser.newPage();
  const fallos = [];
  page.on('pageerror', e => fallos.push(e.message));
  const pedidas = [];
  for (const ep of ESPEJOS)
    await page.route(ep, r => {
      pedidas.push(r.request().postData() || '');
      r.fulfill({ status: 200, contentType: 'application/json',
                  headers: { 'access-control-allow-origin': '*' },
                  body: JSON.stringify(Object.assign(
                    { osm3s: { timestamp_osm_base: '2026-11-16T10:00:00Z' } }, fix.overpass)) });
    });
  await page.route('https://server.arcgisonline.com/**', r => r.fulfill({ status: 200,
    contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: TESELA }));
  await page.route('https://geocoding-api.open-meteo.com/**', r => r.abort());
  await page.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

  // parcela por GeoJSON: la misma del careo
  await page.selectOption('#parcelMode', 'geojson');
  await page.fill('#geotxt', JSON.stringify({ type: 'Feature', geometry:
    { type: 'Polygon', coordinates: [fix.parcela_lonlat] } }));
  await page.click('#geoApplyBtn');
  await page.click('#osmxPanel summary');
  const res = () => page.textContent('#osmxRes');

  await page.click('#osmxBuscar');
  check('sin categoría no busca y lo dice', /Marca al menos una categoría/.test(await res()) && pedidas.length === 0,
    await res());
  await page.check('#osmx_cauces');
  await page.click('#osmxBuscar');
  check('sin retranqueo no pide nada a Overpass y nombra la categoría',
    pedidas.length === 0 && /Pon el retranqueo de: Cauces y agua/.test(await res()), await res());
  check('el retranqueo arranca VACÍO (no hay default legal)',
    await page.inputValue('#osmxb_cauces') === '');

  await page.fill('#osmxb_cauces', '5');
  await page.click('#osmxBuscar');
  await page.waitForFunction(() => /Pulsa Generar|no disponible/.test(document.querySelector('#osmxRes').textContent));
  check('pide UNA vez a Overpass', pedidas.length === 1, pedidas.length);
  const enviada = decodeURIComponent((pedidas[0] || '').replace(/^data=/, '').replace(/\+/g, ' '));
  check('lo enviado a Overpass es la consulta del core, carácter a carácter',
    enviada === fix.consulta_ui.texto, JSON.stringify(enviada.slice(0, 120)));
  const est = await page.evaluate(() => ({ a: OSMX_EST.areas.length, l: OSMX_EST.lineas.length,
    bufs: OSMX_EST.lineas.map(x => x.buf) }));
  check('carga el arroyo y el contorno del embalse como líneas y el embalse como área',
    est.a === 1 && est.l === 2 && est.bufs.every(b => b === 5), JSON.stringify(est));
  const txt = await res();
  check('dice qué cargó, con su retranqueo, la fecha del dato y la atribución',
    /Cauces y agua: 2 \(retranqueo 5 m\)/.test(txt) && /2026-11-16T10:00:00Z/.test(txt) &&
    /© OpenStreetMap contributors/.test(txt), txt);

  // ── la consecuencia ──
  const M_LON = 111320 * Math.cos(fix.lat * Math.PI / 180), M_LAT = 110540;
  async function genera() {
    await page.evaluate(() => { RES = null; });
    await page.click('#genBtn');
    await page.waitForFunction(() => RES && RES.structures, null, { timeout: 120000 });
    return page.evaluate(([lat, lon, mlon, mlat]) => {
      let pisan = 0;
      const dentro = (x, y) => (x > 195.3 && x < 204.7) ||                         // pasillo del arroyo
        (x > 95.3 && x < 154.7 && y > 195.3 && y < 254.7);                        // embalse ensanchado (caja)
      RES.structures.forEach(s => {
        const xs = s.lonlat.map(p => (p[0] - lon) * mlon), ys = s.lonlat.map(p => (p[1] - lat) * mlat);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        let toca = false;
        for (let k = 0; k <= 20 && !toca; k++) for (let j = 0; j <= 20 && !toca; j++)
          toca = dentro(x0 + (x1 - x0) * k / 20, y0 + (y1 - y0) * j / 20);
        if (toca) pisan++;
      });
      return { n: RES.structures.length, pisan };
    }, [fix.lat, fix.lon, M_LON, M_LAT]);
  }
  const con = await genera();
  check('con las de OSM, ninguna mesa pisa el pasillo del arroyo ni el embalse (de ' + con.n + ')',
    con.n > 20 && con.pisan === 0, JSON.stringify(con));

  // El autoguardado espera 800 ms (autoguarda()): se espera a que la sesión
  // GUARDADA lleve ya las de OSM —eso también se comprueba— y entonces se recarga.
  await page.waitForFunction(() => { try { const s = JSON.parse(localStorage.getItem('genlayout_sesion') || '{}');
    return !!(s.osmx && s.osmx.lineas && s.osmx.lineas.length === 2); } catch (e) { return false; } },
    null, { timeout: 10000 }).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded' });
  const tras = await page.evaluate(() => OSMX_EST.lineas.length + OSMX_EST.areas.length);
  check('las de OSM sobreviven a recargar la página', tras === 3, 'tras recargar: ' + tras);

  await page.click('#osmxPanel summary');
  await page.click('#osmxQuitar');
  check('«Quitar las de OSM» las quita', await page.evaluate(() =>
    OSMX_EST.lineas.length + OSMX_EST.areas.length) === 0);
  const sin = await genera();
  check('y SIN ellas hay mesas encima del arroyo o del embalse (el test distingue)', sin.pisan > 0,
    JSON.stringify(sin));

  check('sin errores de página', fallos.length === 0, fallos.join(' | '));
  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL arnés: ' + e.message); process.exit(1); });
