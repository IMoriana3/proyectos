// EL DESPLEGABLE DE PLANTA DE `sim-solar.html` ROTULA EL Nº DE PROYECTO, no la clave de cartera.
//
// Lo que se vio en pantalla: «El Burgo I · 24002». El 24002 es el número de la HOJA DE CARTERA; el
// de proyecto es 23003 (DWG XG23003EL_BURGO y siting), y es el que se rotula en toda la casa
// (DECIDIDO 2026-08-13, ver NPROY en cartera-tabla.html e index.html). La cartera ya lo publica
// como `nproy` dentro de `factiun_plantas`; esta ficha leía el registro y aun así pintaba la clave.
//
// Tres cosas se fijan, en un navegador real y con el registro sembrado como lo escribe la cartera:
//   · el rótulo lleva `nproy` cuando difiere de la clave (El Burgo I · 23003);
//   · el rótulo es la propia clave cuando coinciden (Ayora · 24025) o cuando el registro es viejo y
//     no trae `nproy` (un localStorage anterior a que la cartera lo publicara);
//   · y el `value` SIGUE siendo la clave de cartera: es la que indexa PLANTS, COORDS_FALLBACK y el
//     índice de layouts, así que elegir El Burgo tiene que seguir trayendo sus coordenadas.
//
// MEDIDO: el código anterior (`' · '+cod`) mata la primera comprobación y deja las demás en verde,
// que es exactamente el defecto que se vio.
//
//   python3 -m http.server 8099       # servir el repo (en otra terminal)
//   node tests/test_solar_planta.js
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');
const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
};

/* Como lo escribe publishSpecs() de cartera-tabla.html: clave = nº de cartera, `nproy` = nº de
   proyecto. Páramo va SIN `nproy` a propósito: es el registro viejo. */
const CARTERA = {
  '24002': { cod:24002, nproy:'23003', nombre:'El Burgo I', lat:41.57634, lon:-0.79814, estado_pem:'En marcha' },
  '24025': { cod:24025, nproy:'24025', nombre:'Ayora',      lat:39.11821, lon:-1.15985, estado_pem:'En marcha' },
  '25019': { cod:25019,                nombre:'Paramo',     lat:null,     lon:null,     estado_pem:'Sin comenzar' },
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const page = await browser.newPage({ viewport:{ width:1400, height:1000 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(d => { try { localStorage.setItem('factiun_plantas', JSON.stringify(d)); } catch (e) {} }, CARTERA);
  await page.goto(BASE + '/sim-solar.html');
  await page.waitForSelector('#plant option[value="24002"]', { state:'attached' });

  const opts = await page.evaluate(() => [...document.querySelectorAll('#plant option')]
    .map(o => ({ value:o.value, text:o.textContent.trim() })));
  const por = v => opts.find(o => o.value === v);

  check('El Burgo I se rotula con el nº de PROYECTO (23003), no con el de cartera',
    por('24002') && por('24002').text === 'El Burgo I · 23003', por('24002'));
  check('y su value sigue siendo la clave de cartera (24002)', !!por('24002'));
  check('Ayora, donde los dos números coinciden, se rotula con el suyo',
    por('24025') && por('24025').text === 'Ayora · 24025', por('24025'));
  check('un registro viejo sin nproy cae a la clave, no a «undefined»',
    por('25019') && por('25019').text === 'Paramo · 25019', por('25019'));
  check('ningún rótulo enseña «undefined» ni «null»', opts.every(o => !/undefined|null/.test(o.text)), opts);
  check('la opción manual sigue la primera', opts[0] && opts[0].value === '' && /manual/.test(opts[0].text), opts[0]);

  await page.selectOption('#plant', '24002');
  const coords = await page.evaluate(() => [document.getElementById('lat').value, document.getElementById('lon').value]);
  check('elegir El Burgo I por su clave trae sus coordenadas de la cartera',
    Math.abs(+coords[0] - 41.57634) < 1e-5 && Math.abs(+coords[1] + 0.79814) < 1e-5, coords);
  check('sin errores de página', errs.length === 0, errs);

  await browser.close();
  console.log(`\n${ok} OK · ${ko} FAIL`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL excepción -> ' + e.message); process.exit(1); });
