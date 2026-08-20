// La ficha «Generador de layout» en un navegador real (Chromium via Playwright).
//
// El careo (test_layout.js) mide el MOTOR, que es donde está la física. Esto mide
// lo otro: que la ficha esté CABLEADA. Un motor perfecto detrás de un botón que no
// llama a nadie, o de un lienzo que se queda en negro, se lee como «no funciona».
//
// Comprueba: que genera y pinta de verdad (píxeles de mesa en el lienzo, no solo
// números), que los tres caminos de parcela acaban en un layout, que el reparto
// multi-talla sale en pantalla, que el montaje fijo cambia lo que se rotula y que
// las salidas (GeoJSON/DXF/KML/3D) se habilitan solo cuando hay algo que exportar.
//
//   npm install playwright                     # el navegador ya está en /opt/pw-browsers
//   python3 -m http.server 8099                # servir el repo (en otra terminal)
//   node tests/test_layout_ui.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const GEOJSON_PRUEBA = JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon',
  coordinates: [[[-0.8035, 41.5743], [-0.7928, 41.5743], [-0.7928, 41.5784], [-0.8035, 41.5784], [-0.8035, 41.5743]]] } });

// Píxeles verdes de mesa sobre el fondo del panel: el lienzo pintado, no descrito.
const pintado = page => page.evaluate(() => {
  const c = document.querySelector('#cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 40 && d[i + 1] > 140 && d[i + 2] < 180) n++;
  return n;
});
const generar = async page => {
  const antes = await page.evaluate(() => document.querySelector('#hint').textContent);
  await page.click('#genBtn');
  await page.waitForFunction(p => {
    const t = document.querySelector('#hint').textContent;
    return t !== p && t.indexOf('calculando') < 0 && (t.indexOf('ms') >= 0 || t.indexOf('error') >= 0);
  }, antes, { timeout: 30000 });
};
const num = s => parseInt(String(s).replace(/[^\d]/g, ''), 10);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const fallos = [];
  page.on('pageerror', e => fallos.push(e.message));
  await page.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });

  // ── arranque ──
  check('las salidas arrancan deshabilitadas (no hay nada que exportar)',
    await page.evaluate(() => ['expGeo', 'expDxf', 'expKml', 'd3Btn'].every(i => document.getElementById(i).disabled)));
  check('el azimut de filas se deriva del eje (eje N-S 0° → filas a 90°)',
    await page.inputValue('#panelAz') === '90');

  // ── rectángulo por cotas ──
  await generar(page);
  const mesas = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  check('genera con el rectángulo por defecto (' + mesas + ' mesas)', mesas > 500);
  check('y lo PINTA en el lienzo', await pintado(page) > 20000);
  check('el pie cuenta filas, pitch y huso UTM',
    /\d+ filas · pitch .* · setback .* · UTM \d+/.test(await page.textContent('#foot')));
  check('las salidas se habilitan al haber layout',
    await page.evaluate(() => ['expGeo', 'expDxf', 'expKml', 'd3Btn'].every(i => !document.getElementById(i).disabled)));

  // ── el pitch manda: más pitch, menos filas ──
  const filas1 = num(await page.textContent('#ro .ro:nth-child(4) .v'));
  await page.fill('#pitch', '9'); await generar(page);
  const filas2 = num(await page.textContent('#ro .ro:nth-child(4) .v'));
  check('subir el pitch de 6 a 9 m quita filas (' + filas1 + ' → ' + filas2 + ')', filas2 < filas1);
  await page.fill('#pitch', '6');

  // ── multi-talla: el reparto se ve ──
  await page.fill('#mods', '28, 14, 7'); await generar(page);
  const reparto = await page.textContent('#sizes');
  check('multi-talla saca la tabla de reparto con más de una talla',
    /Reparto por talla/.test(reparto) && /28/.test(reparto) && /14/.test(reparto), reparto.slice(0, 90));
  await page.fill('#mods', '28');

  // ── montaje fijo: cambia el rótulo y desaparecen los trackers ──
  await page.selectOption('#mount', 'fija'); await generar(page);
  const claves = await page.evaluate(() => [...document.querySelectorAll('#ro .ro .k')].map(e => e.textContent));
  check('en montaje FIJO se rotulan «Estructuras», no mesas ni trackers',
    claves.indexOf('Estructuras') >= 0 && claves.indexOf('Trackers') < 0, claves.join(','));
  check('y el selector monofila/bifila queda inhabilitado (sin motor no hay bifila)',
    await page.evaluate(() => document.querySelector('#bifila').disabled));
  await page.selectOption('#mount', 'tracker');
  await page.fill('#axis', '0');
  await page.dispatchEvent('#axis', 'change');

  // ── parcela por GeoJSON ──
  await page.selectOption('#parcelMode', 'geojson');
  await page.fill('#geotxt', GEOJSON_PRUEBA);
  await page.click('#geoApplyBtn');
  check('el GeoJSON pegado se reconoce y da su superficie',
    /vértices · [\d,.]+ ha/.test(await page.textContent('#parcelTag')), await page.textContent('#parcelTag'));
  await generar(page);
  check('y genera sobre esa parcela', num(await page.textContent('#ro .ro:nth-child(2) .v')) > 500);

  // ── un GeoJSON roto se dice, no se traga ──
  await page.fill('#geotxt', '{ esto no es geojson');
  await page.click('#geoApplyBtn');
  check('un GeoJSON inválido sale por pantalla', /No se pudo leer/.test(await page.textContent('#foot')));

  // ── parcela dibujada a mano ──
  await page.selectOption('#parcelMode', 'draw');
  await page.click('#drawStart');
  const caja = await page.evaluate(() => { const r = document.querySelector('#cv').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]])
    await page.mouse.click(caja.x + caja.w * fx, caja.y + caja.h * fy);
  await page.mouse.dblclick(caja.x + caja.w * 0.25, caja.y + caja.h * 0.75);
  check('la parcela dibujada se cierra con cuatro vértices (el doble clic no los duplica)',
    /^4 vértices/.test(await page.textContent('#parcelTag')), await page.textContent('#parcelTag'));
  await generar(page);
  check('y también genera sobre ella', num(await page.textContent('#ro .ro:nth-child(2) .v')) > 0);

  // ── pitch imposible: la ficha lo canta ──
  await page.selectOption('#parcelMode', 'rect');
  await page.fill('#pitch', '1.2'); await generar(page);
  check('un pitch menor que la apertura sale como aviso de FALLO',
    await page.evaluate(() => !!document.querySelector('.aviso.fail')));

  check('ningún error de JavaScript en toda la sesión', !fallos.length, fallos.join(' | '));
  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
  process.exit(ko ? 1 : 0);
})();
