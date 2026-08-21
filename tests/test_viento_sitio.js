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
  // `var TZ={...}` es una línea, no un bloque con llave en columna 0
  const j = firma.startsWith('function') ? html.indexOf('\n}', i) : html.indexOf('\n', i) - 1;
  return j < 0 ? null : html.slice(i, j + 2);
}
const FIRMAS = ['function normSitio(t){', 'function parseCoords(t){',
                'function filtraSitios(lista,q){', 'var TZ={zona:null',
                'function tzOffMin(d){', 'function L(d){', 'function U(msPared){',
                'function tzSigla(){', 'function localAISO(v){'];
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

// ── 1bis) HORAS LOCALES del emplazamiento ────────────────────────────────
// La física se queda en UTC; lo que pasa a hora del sitio es lo que se enseña
// y lo que se teclea. Un episodio «a las 15:27» en Arequipa son las 10:27 de
// allí: la cifra era correcta y la lectura, falsa.
ctx.TZ.zona = 'Europe/Madrid'; ctx.TZ.lon = -0.8;
check('Madrid en enero es UTC+1', ctx.tzOffMin(new Date('2023-01-15T12:00:00Z')) === 60);
check('Madrid en julio es UTC+2 (horario de verano)',
      ctx.tzOffMin(new Date('2023-07-15T12:00:00Z')) === 120);
ctx.TZ.zona = 'America/Lima';
check('Lima es UTC-5 todo el año (allí no hay cambio de hora)',
      ctx.tzOffMin(new Date('2023-01-15T12:00:00Z')) === -300 &&
      ctx.tzOffMin(new Date('2023-07-15T12:00:00Z')) === -300);
(function () {
  const d = ctx.L('2023-07-15T15:27:00Z');
  check('15:27Z se lee 10:27 en Arequipa',
        d.getUTCHours() === 10 && d.getUTCMinutes() === 27,
        d.getUTCHours() + ':' + d.getUTCMinutes());
})();
// La vuelta (hora de pared -> instante) tiene que valer TAMBIÉN los días del
// cambio de hora: es donde una conversión de una sola pasada se desplaza.
ctx.TZ.zona = 'Europe/Madrid';
[['2023-01-15T09:00', 60], ['2023-07-15T09:00', 120],
 ['2023-03-26T12:00', 120], ['2023-10-29T12:00', 60]].forEach(c => {
  const m = c[0].match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  const pared = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const utc = ctx.U(pared);
  check('ida y vuelta ' + c[0] + ' (desfase ' + ((pared - utc) / 60000) + ' min)',
        ctx.L(new Date(utc)).getTime() === pared && (pared - utc) / 60000 === c[1]);
});
// Sin zona declarada NO se inventa la civil: se deriva de la longitud, que es
// hora SOLAR, y eso va dicho en pantalla.
ctx.TZ.zona = null;
[[-71.8064, -300], [9.8736, 60], [-0.7981, 0]].forEach(c => {
  ctx.TZ.lon = c[0];
  check('sin zona, lon ' + c[0] + ' -> ' + (c[1] / 60) + ' h (solar)',
        ctx.tzOffMin(new Date()) === c[1]);
});
check('El Burgo por longitud NO da la hora civil española',
      (function () { ctx.TZ.lon = -0.7981; return ctx.tzOffMin(new Date()) === 0; })(),
      'si diera 60 estaría fingiendo saber la zona');
// El borde de las rachas: se teclea local, al motor va en UTC.
ctx.TZ.zona = 'Europe/Madrid'; ctx.TZ.lon = -0.8;
check('racha tecleada 14 jul 14:00 sale 12:00Z',
      ctx.localAISO('2023-07-14T14:00') === '2023-07-14T12:00',
      ctx.localAISO('2023-07-14T14:00'));
check('y en enero, 14:00 sale 13:00Z',
      ctx.localAISO('2023-01-14T14:00') === '2023-01-14T13:00');
check('lo que no es fecha se devuelve tal cual',
      ctx.localAISO('') === '' && ctx.localAISO('xxx') === 'xxx');

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

  // el rótulo de zona tiene que seguir al sitio elegido
  await page.fill('#sitioQ', 'san jose');
  await page.waitForSelector('#sitioRes .it', { timeout: 5000 });
  await page.click('#sitioRes .it');
  const tzPe = (await page.$eval('#tzLbl', e => e.textContent)).trim();
  check('elegir Arequipa pone la zona del sitio (' + tzPe + ')',
        /UTC-5/.test(tzPe) && /America\/Lima/.test(tzPe));
  await page.fill('#sitioQ', '41.5763, -0.7981');
  await page.waitForSelector('#sitioRes .it', { timeout: 5000 });
  await page.click('#sitioRes .it');
  const tzCo = (await page.$eval('#tzLbl', e => e.textContent)).trim();
  check('coordenadas sueltas: se DERIVA de la longitud y se dice (' + tzCo + ')',
        /longitud/.test(tzCo) && /SOLAR/i.test(tzCo));
  // La tabla de rachas nace vacía, así que hay que meter una para que salga
  // la cabecera: comprobarla sobre la tabla vacía habría dado verde sin mirar
  // nada (el mensaje de «sin rachas» no lleva cabecera).
  await page.click('#gadd');
  await page.waitForSelector('#gtbl thead th', { timeout: 5000 });
  const cab = await page.$eval('#gtbl thead th', e => e.textContent);
  check('la cabecera de las rachas dice en qué hora se teclea (' + cab.trim() + ')',
        /Cuándo/.test(cab) && /UTC[+-]/.test(cab));

  // El laboratorio tenía las rachas y ninguna salida: se metían y no había
  // nada que dijera cómo llegaban al 3D (el botón de simular está arriba del
  // todo y no se ve desde ahí). Un banco de pruebas sin botón de «probar» es
  // media herramienta.
  check('el laboratorio tiene su propio botón de simular',
        await page.$('#labRun') !== null);
  // (arriba ya se añadió una racha para comprobar la cabecera)
  const pista1 = (await page.$eval('#labHint', e => e.textContent)).trim();
  check('y dice qué va a inyectar (' + pista1 + ')', /1 racha/.test(pista1));
  await page.click('#gadd');
  await page.waitForFunction(() =>
    /2 rachas/.test(document.getElementById('labHint').textContent), { timeout: 5000 });
  check('el aviso sigue a la tabla al añadir otra',
        /2 rachas/.test(await page.$eval('#labHint', e => e.textContent)));
  // y con la tabla vacía lo dice, en vez de callarse
  // Vaciar la tabla SIN una tormenta de clics. Pulsar el botón de borrar en
  // bucle mataba la pestaña —«Target page has been closed», a distinta altura
  // en cada vuelta— porque la tabla se redibuja entera en cada pulsación y la
  // página lleva encima una escena de three.js. El estado final es el mismo y
  // se ejercita el mismo camino (`renderGusts` con la tabla vacía + `labHint`),
  // que es lo que este test mira; el botón de borrar tiene su propio sitio y no
  // es aquí. Un arnés que tumba el navegador no mide: mide el navegador.
  await page.evaluate(() => { GUSTS.length = 0; renderGusts(); });
  await page.waitForFunction(
    () => !document.querySelector('#gtbl [data-del]'), { timeout: 5000 });
  const pista0 = (await page.$eval('#labHint', e => e.textContent)).trim();
  check('sin rachas dice que no hay nada que inyectar (' + pista0 + ')',
        /no hay nada que inyectar/.test(pista0));

  check('la ficha no lanza errores de JS', errores.length === 0, errores.join(' | '));
  await browser.close();
  console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko)
                 : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();
