// Buscador de emplazamiento de «Viento & Abanderamiento».
//
// Dos capas, y la segunda es la que comprueba que existe de verdad:
//   1. las funciones PURAS extraídas del HTML real (normalizar, leer
//      coordenadas pegadas, filtrar la lista local), sin navegador;
//   2. la ficha ABIERTA en Chromium: se teclea y se elige, y las coordenadas
//      tienen que cambiar. Un buscador que filtra pero no rellena el
//      formulario está tan roto como uno que no filtra.
//
// La búsqueda REMOTA (geocodificador de Open-Meteo) no se exige: depende de la
// red y este banco tiene que poder correr sin ella. Lo que sí se exige es que
// su ausencia se DECLARE — un desplegable vacío se lee como «ese sitio no
// existe» cuando lo que pasa es que no hay internet.
//
//   node tests/test_viento_sitio.js            (necesita el servidor en :8099)
const fs = require('fs'), path = require('path'), vm = require('vm');
const { chromium } = require('playwright');
const RAIZ = path.join(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

// ── 1) las funciones puras, del HTML de verdad ───────────────────────────
const html = fs.readFileSync(path.join(RAIZ, 'sim-viento.html'), 'utf8');
function saca(firma) {
  const i = html.indexOf(firma);
  if (i < 0) return null;
  const j = html.indexOf('\n}', i);
  return j < 0 ? null : html.slice(i, j + 2);
}
const FIRMAS = ['function normSitio(t){', 'function parseCoords(t){',
                'function filtraSitios(lista,q){'];
const trozos = FIRMAS.map(saca);
check('las funciones del buscador siguen en el HTML', trozos.every(Boolean),
      FIRMAS.filter((f, i) => !trozos[i]).join(', '));
if (!trozos.every(Boolean)) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('lo extraído tiene cuerpo (' + trozos.join('').length + ' chars)',
      trozos.join('').length > 500);
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(trozos.join('\n'), ctx);

check('los acentos no cuentan: «Túnez, Gabès»',
      ctx.normSitio('Túnez, Gabès') === 'tunez, gabes');
check('normSitio aguanta null', ctx.normSitio(null) === '');

// Coordenadas pegadas: el camino más corto para quien viene de un DWG.
[['41.5763, -0.7981', 41.5763, -0.7981],
 ['41,5763 -0,7981', 41.5763, -0.7981],      // coma decimal, que es la de aquí
 ['16.5958 S 71.8064 W', -16.5958, -71.8064],
 ['39.1182;-1.1599', 39.1182, -1.1599]].forEach(c => {
  const r = ctx.parseCoords(c[0]);
  check('lee coordenadas «' + c[0] + '»',
        !!r && Math.abs(r.lat - c[1]) < 1e-9 && Math.abs(r.lon - c[2]) < 1e-9,
        JSON.stringify(r));
});
// Y lo que NO son coordenadas tiene que seguir su camino al buscador: un
// texto colado como coordenadas acabaría en 0,0, en el Golfo de Guinea.
['Ayora', '', '24019', '91.0, 0.0', '0, 181', 'El Burgo I', 'abc, def'].forEach(q => {
  check('«' + q + '» NO son coordenadas', ctx.parseCoords(q) === null);
});

const L = [{ n: '23003 · El Burgo I (Zaragoza, ES)', lat: 41.5, lon: -0.8, src: 'Presets' },
           { n: '24021 · Túnez (Gabès, TN)', lat: 33.9, lon: 9.9, src: 'Presets' },
           { n: 'Planta X · 24019', lat: -16.6, lon: -71.8, src: 'Cartera', cod: '24019' }];
check('encuentra sin acentos («tunez»)', ctx.filtraSitios(L, 'tunez').length === 1);
check('encuentra con acentos («Gabès»)', ctx.filtraSitios(L, 'Gabès').length === 1);
check('las palabras van en cualquier orden',
      ctx.filtraSitios(L, 'burgo zaragoza').length === 1 &&
      ctx.filtraSitios(L, 'zaragoza burgo').length === 1);
check('encuentra por código de planta', ctx.filtraSitios(L, '24019').length === 1);
check('sin texto enseña la lista', ctx.filtraSitios(L, '').length === 3);
check('lo que no está no aparece', ctx.filtraSitios(L, 'reikiavik').length === 0);

// ── 2) la ficha abierta: teclear, elegir, y que cambien las coordenadas ──
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sitioQ', { timeout: 15000 });

  check('el buscador existe en la ficha', await page.$('#sitioQ') !== null);
  check('ya no queda el desplegable de plantas', await page.$('#plant') === null);

  const antes = await page.$eval('#lat', e => e.value);
  await page.click('#sitioQ');
  await page.fill('#sitioQ', 'ayora');
  await page.waitForSelector('#sitioRes .it', { timeout: 5000 });
  const items = await page.$$eval('#sitioRes .it b', ns => ns.map(n => n.textContent));
  check('teclear filtra la lista local (' + items.length + ')',
        items.length >= 1 && items.some(t => /ayora/i.test(t)), items.join(' | '));

  await page.click('#sitioRes .it');
  const dsp = await page.$eval('#lat', e => e.value);
  const lon = await page.$eval('#lon', e => e.value);
  check('elegir rellena las coordenadas (' + antes + ' -> ' + dsp + ', ' + lon + ')',
        dsp !== antes && Math.abs(+dsp - 39.1182) < 0.01 && Math.abs(+lon + 1.1599) < 0.01);
  check('y el rótulo dice qué sitio es',
        /ayora/i.test(await page.$eval('#sitioSel', e => e.textContent)));

  // coordenadas pegadas
  await page.fill('#sitioQ', '-16.5958, -71.8064');
  await page.waitForSelector('#sitioRes .it', { timeout: 5000 });
  await page.click('#sitioRes .it');
  check('pegar coordenadas también vale',
        Math.abs(+(await page.$eval('#lat', e => e.value)) + 16.5958) < 0.01 &&
        Math.abs(+(await page.$eval('#lon', e => e.value)) + 71.8064) < 0.01);

  // tocar lat a mano deja de nombrar un sitio que ya no es
  await page.fill('#lat', '10.0');
  await page.dispatchEvent('#lat', 'input');
  check('cambiar las coordenadas a mano borra el nombre del sitio',
        (await page.$eval('#sitioSel', e => e.textContent)).trim() === 'manual');

  check('la ficha no lanza errores de JS', errores.length === 0, errores.join(' | '));
  await browser.close();
  console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko)
                 : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();
