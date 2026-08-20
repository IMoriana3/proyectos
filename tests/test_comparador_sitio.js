// Buscador de emplazamiento del «Comparador de estructuras».
//
// Dos capas, y la segunda es la que comprueba que existe de verdad:
//   1. las funciones PURAS extraídas del HTML real (normalizar sin acentos,
//      leer coordenadas pegadas, filtrar la lista local), sin navegador;
//   2. la ficha ABIERTA en Chromium: se teclea, se elige, y las coordenadas
//      del formulario tienen que cambiar. Un buscador que filtra pero no
//      rellena está tan roto como uno que no filtra.
//
// Y una tercera cosa que aquí importa más que en la ficha de Viento: elegir
// emplazamiento tiene que MOVER la escena 3D y las lecturas. Poner `.value` a
// mano no dispara 'change', y sin eso la ficha se quedaba en la latitud
// anterior — con Assú (hemisferio SUR) la fija seguía mirando al sur.
//
// La búsqueda REMOTA (geocodificador de Open-Meteo) no se exige: depende de la
// red y este banco tiene que poder correr sin ella. Lo que sí se exige es que
// su ausencia se DECLARE: un desplegable vacío se lee como «ese sitio no
// existe» cuando lo que pasa es que no hay internet.
//
//   python3 -m http.server 8099        (en otra terminal)
//   node tests/test_comparador_sitio.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const { chromium } = require('playwright');
const RAIZ = path.join(__dirname, '..');
const URL = process.env.URL || 'http://127.0.0.1:8099/comparador-estructuras.html';
const EXEC = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

// ── 1) las funciones puras, del HTML de verdad ──
const html = fs.readFileSync(path.join(RAIZ, 'comparador-estructuras.html'), 'utf8');
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
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(trozos.join('\n'), ctx);

check('los acentos no cuentan: «Túnez, Gabès»',
  ctx.normSitio('Túnez, Gabès') === 'tunez, gabes', ctx.normSitio('Túnez, Gabès'));
check('normSitio aguanta null', ctx.normSitio(null) === '');

// Coordenadas pegadas: el camino más corto para quien viene de un DWG o de Maps.
[['37.3891, -5.9845', 37.3891, -5.9845],
 ['41,5763 -0,7981', 41.5763, -0.7981],        // coma decimal, que es la de aquí
 ['16.5958 S 71.8064 W', -16.5958, -71.8064],
 ['5.58 S 36.91 O', -5.58, -36.91],            // la O de Oeste, en español
 ['39.1182;-1.1599', 39.1182, -1.1599]].forEach(c => {
  const r = ctx.parseCoords(c[0]);
  check('lee coordenadas «' + c[0] + '»',
    !!r && Math.abs(r.lat - c[1]) < 1e-9 && Math.abs(r.lon - c[2]) < 1e-9, JSON.stringify(r));
});
// Y lo que NO son coordenadas tiene que seguir su camino al buscador: colarlo
// como un 0,0 dejaría la comparación en el Golfo de Guinea sin avisar.
['Ayora', 'Sevilla', '', 'El Burgo I', '91.0, 0.0', '0.0, 181.0', '12'].forEach(q => {
  check('«' + q + '» NO son coordenadas', ctx.parseCoords(q) === null,
    JSON.stringify(ctx.parseCoords(q)));
});

// El filtro local: todas las palabras, en cualquier orden, y por código.
const LISTA = [{ n: 'El Burgo I', cod: 'burgo', src: 'Presets', lat: 41.65, lon: -4.73 },
               { n: 'Ayora · 24019', cod: '24019', src: 'Cartera', lat: 39.06, lon: -1.06 },
               { n: 'Túnez', cod: 'tunez', src: 'Presets', lat: 35.5, lon: 10 }];
check('filtra por nombre', ctx.filtraSitios(LISTA, 'burgo').length === 1);
check('filtra sin acentos («tunez» encuentra «Túnez»)',
  ctx.filtraSitios(LISTA, 'tunez').length === 1);
check('filtra por código', ctx.filtraSitios(LISTA, '24019').length === 1);
check('todas las palabras, en cualquier orden',
  ctx.filtraSitios(LISTA, 'ayora cartera').length === 1 &&
  ctx.filtraSitios(LISTA, 'cartera ayora').length === 1);
check('una palabra que no está deja la lista vacía',
  ctx.filtraSitios(LISTA, 'ayora burgo').length === 0);
check('sin texto salen los primeros, no ninguno', ctx.filtraSitios(LISTA, '').length === 3);

// ── 2) la ficha abierta ──
(async () => {
  const b = await chromium.launch({ executablePath: EXEC,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);

  check('el desplegable de plantas ya no existe',
    (await p.evaluate(() => !document.getElementById('plant'))) === true);
  check('y en su sitio hay un buscador',
    (await p.evaluate(() => !!document.getElementById('sitioQ'))) === true);
  check('arranca en «manual», sin fingir un sitio',
    (await p.evaluate(() => document.getElementById('sitioSel').textContent)) === 'manual');

  // teclear un preset y elegirlo tiene que mover el formulario
  await p.fill('#sitioQ', 'tunez');
  await p.waitForTimeout(250);
  const lista = await p.evaluate(() =>
    [...document.querySelectorAll('#sitioRes .it')].map(e => e.querySelector('b').textContent));
  check('teclear «tunez» encuentra «Túnez» (sin acento)',
    lista.some(t => /Túnez/.test(t)), JSON.stringify(lista));
  await p.evaluate(() => document.querySelector('#sitioRes .it')
    .dispatchEvent(new MouseEvent('mousedown')));
  await p.waitForTimeout(400);
  const tun = await p.evaluate(() => ({ lat: +document.getElementById('lat').value,
    lon: +document.getElementById('lon').value,
    sel: document.getElementById('sitioSel').textContent }));
  check('elegirlo rellena lat/lon (' + tun.lat + ', ' + tun.lon + ')',
    Math.abs(tun.lat - 35.5) < 1e-6 && Math.abs(tun.lon - 10) < 1e-6, JSON.stringify(tun));
  check('y el rótulo pasa a nombrar el sitio', tun.sel === 'Túnez', tun.sel);

  // coordenadas pegadas, el camino del DWG
  await p.fill('#sitioQ', '-5.5800, -36.9100');
  await p.waitForTimeout(250);
  const grupos = await p.evaluate(() =>
    [...document.querySelectorAll('#sitioRes .gr')].map(e => e.textContent));
  check('pegar coordenadas ofrece el grupo «Coordenadas» el primero',
    grupos[0] === 'Coordenadas', JSON.stringify(grupos));
  // y NO dice que está buscando fuera: con coordenadas pegadas la búsqueda
  // remota ni se lanza, así que anunciarla era mentira
  check('con coordenadas no anuncia una búsqueda remota que no va a hacer',
    (await p.evaluate(() => !/Buscando en Open-Meteo/.test(
      document.getElementById('sitioRes').textContent))) === true);
  await p.evaluate(() => document.querySelector('#sitioRes .it')
    .dispatchEvent(new MouseEvent('mousedown')));
  await p.waitForTimeout(600);

  // ── y lo que de verdad importa aquí: la ficha ENTERA se entera ──
  const sur = await p.evaluate(`(() => {
    document.getElementById('hora').value = 720; actualiza3D();
    const B = BLOQUES.find(b => b.key === 'fija_optima');
    const sp = B.filas[0].spin;
    sp.updateWorldMatrix(true, false);
    const n = new THREE.Vector3(0,1,0).applyQuaternion(
      sp.getWorldQuaternion(new THREE.Quaternion())).normalize();
    return { lat: +document.getElementById('lat').value,
             lon: +document.getElementById('lon').value,
             nz: +n.z.toFixed(3),
             ctxLat: cfgActual().lat };
  })()`);
  check('las coordenadas pegadas llegan al formulario (' + sur.lat + ', ' + sur.lon + ')',
    Math.abs(sur.lat + 5.58) < 1e-6 && Math.abs(sur.lon + 36.91) < 1e-6, JSON.stringify(sur));
  check('y a la configuración que usa el motor', Math.abs(sur.ctxLat + 5.58) < 1e-6);
  check('en el hemisferio SUR la fija se dibuja mirando al NORTE (z=' + sur.nz + ')',
    sur.nz < -0.15, String(sur.nz));

  // tocar lat a mano deja de nombrar un sitio que ya no es
  await p.evaluate(() => { const e = document.getElementById('sitioQ');
    e.value = 'Túnez'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('#sitioRes .it')
    .dispatchEvent(new MouseEvent('mousedown')));
  await p.waitForTimeout(300);
  await p.evaluate(() => { const e = document.getElementById('lat');
    e.value = '48.85'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(200);
  const tras = await p.evaluate(() => ({ sel: document.getElementById('sitioSel').textContent,
    q: document.getElementById('sitioQ').value }));
  check('cambiar lat a mano borra el nombre del sitio (no se llama «Túnez» a otro sitio)',
    tras.sel === 'manual' && tras.q === '', JSON.stringify(tras));

  check('sin errores de JS', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log('\n' + (ko ? 'FALLOS: ' + ko + ' (de ' + (ok + ko) + ')' : 'OK — ' + ok + '/' + ok + ' comprobaciones'));
  process.exit(ko ? 1 : 0);
})();
