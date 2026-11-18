// EL LOTE DEL MAPA DE PAÍS (tools/mapa_pasivo), de punta a punta sin red.
//
// El mapa de 0,25° se calcula fuera del navegador —en el NAS, con ERA5— y la
// pestaña solo lo carga. Lo que no puede pasar es que el número del lote y el
// de la pestaña para el mismo nodo, la misma meteo y la misma configuración
// sean distintos. Aquí:
//
//   · se escribe un meteo.bin (el formato de era5.py) con la meteo de mentira
//     de `meteo_sintetica_mapa.js`;
//   · `calcula.js` corre el lote con las CUATRO estrategias a la vez;
//   · cada nodo y cada estrategia se carea con `LOC.run` de UNA estrategia
//     sobre la misma meteo — la corrida de la pestaña —: tienen que dar lo
//     MISMO al bit;
//   · y la pestaña, en Chromium, carga la lámina, cambia de estrategia sin
//     recalcular y la suelta al tocar el año.
//
// La parte Python (unidades de ERA5, DNI, ZIP del CDS) la cubre
// `python3 tools/mapa_pasivo/era5.py autoprueba`.
//
//   node tests/test_mapa_lote.js      (la parte de navegador necesita :8099)
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { execFileSync } = require('child_process');
const { respuesta } = require('./meteo_sintetica_mapa.js');
const REPO = path.join(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, c, extra) => { if (c) { ok++; console.log('OK   ' + n); } else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lote_'));
  const CALC = path.join(REPO, 'tools', 'mapa_pasivo', 'calcula.js');
  const node = (...a) => execFileSync(process.execPath, [CALC, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  // ── 1. nodos ──
  node('nodos', '--repo', REPO, '--pais', 'PRT', '--anio', '2022', '--paso', '1', '--salida', path.join(tmp, 'nodos.json'));
  const N = JSON.parse(fs.readFileSync(path.join(tmp, 'nodos.json'), 'utf8'));
  check('nodos de Portugal a 1° (' + N.nodos.length + ') con país, año y paso', N.iso3 === 'PRT' && N.year === 2022 && N.paso === 1 && N.nodos.length >= 6);
  let rechazo = '';
  try { node('nodos', '--repo', REPO, '--pais', 'PRT', '--anio', '2022', '--paso', '0.1', '--salida', path.join(tmp, 'x.json')); }
  catch (e) { rechazo = String(e.stderr || e.message); }
  check('un paso que no es múltiplo de 0,25° se rechaza (ERA5 no tiene más detalle)', /múltiplo de 0,25/.test(rechazo));

  // ── 2. meteo.bin en el formato de era5.py ──
  const COLS = ['ghi', 'dhi', 'dni', 'temp', 'ws', 'wd', 'gust'];
  const nh = 8760, cab = { formato: 'factiun-meteo-nodos', v: 1, iso3: 'PRT', year: 2022, t0: '2022-01-01T00:00Z', dt_s: 3600,
    n_horas: nh, columnas: COLS, nodos: N.nodos, fuente: 'sintética (arnés)' };
  let cb = Buffer.from(JSON.stringify(cab)); cb = Buffer.concat([cb, Buffer.alloc((4 - (cb.length + 4) % 4) % 4, 32)]);
  const datos = Buffer.alloc(N.nodos.length * COLS.length * nh * 4);
  const mapa = { ghi: 'shortwave_radiation', dhi: 'diffuse_radiation', dni: 'direct_normal_irradiance', temp: 'temperature_2m',
    ws: 'windspeed_10m', wd: 'winddirection_10m', gust: 'wind_gusts_10m' };
  N.nodos.forEach(([la, lo], k) => {
    const H = respuesta('https://x/?latitude=' + la + '&longitude=' + lo + '&start_date=2022-01-01&hourly=wind_gusts_10m').hourly;
    COLS.forEach((c, i) => { for (let h = 0; h < nh; h++) datos.writeFloatLE(H[mapa[c]][h], ((k * COLS.length + i) * nh + h) * 4); });
  });
  const L4 = Buffer.alloc(4); L4.writeUInt32LE(cb.length);
  fs.writeFileSync(path.join(tmp, 'meteo.bin'), Buffer.concat([L4, cb, datos]));

  // ── 3. la configuración, como la descarga la pestaña ──
  const H = fs.readFileSync(path.join(REPO, 'sim-viento.html'), 'utf8');
  const a = H.indexOf('var LOC={'), b = H.indexOf('/* ===================== EMPLAZAMIENTOS');
  const ctx = { console, Math, Date, JSON, Float64Array, Float32Array, Int32Array, Uint8Array, Array, Object, Promise, setTimeout, URL, performance };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(H.slice(a, b) + ';this.LOC=LOC;', ctx);
  const LOC = ctx.LOC;
  const { chromium } = require('playwright'), { EXEC } = require('./pw_navegador.js');
  const browser = await chromium.launch({ executablePath: EXEC });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errores = []; page.on('pageerror', e => errores.push(String(e)));
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.click('#tabMapa');
  await page.waitForFunction(() => MAPA.plan && MAPA.plan.nodos.length > 0, null, { timeout: 30000 });
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('#mConf')]);
  const cfgRuta = path.join(tmp, 'config.json'); await descarga.saveAs(cfgRuta);
  const CFG = JSON.parse(fs.readFileSync(cfgRuta, 'utf8'));
  check('la pestaña descarga la configuración para el NAS, limpia de lo que es de cada nodo',
        CFG.formato === 'factiun-mapa-pasivo-config' && CFG.refs.join() === 'A1,A2,B1,B2' &&
        CFG.configuracion.passive && CFG.configuracion.passive.n_trackers >= 1 &&
        !('lat' in CFG.configuracion) && !('strategies' in CFG.configuracion) && !('meteoPre' in CFG.configuracion));

  // ── 4. el lote ──
  const sal = path.join(tmp, 'pasivo');
  const log = node('calcula', '--repo', REPO, '--nodos', path.join(tmp, 'nodos.json'), '--meteo', path.join(tmp, 'meteo.bin'),
    '--config', cfgRuta, '--salida', sal);
  const D = JSON.parse(fs.readFileSync(path.join(sal, 'PRT_2022_1.json'), 'utf8'));
  check('el lote calcula todos los nodos (' + D.n_nodos + ') y ninguno falla', D.n_nodos === N.nodos.length && D.fallos.length === 0, log.slice(-300));
  check('la lámina lleva con qué se calculó (configuración, opciones, fuente, huella del motor)',
        D.configuracion.passive.release_kmh === CFG.configuracion.passive.release_kmh && D.opciones.rafaga === CFG.opciones.rafaga &&
        /sintética/.test(D.fuente) && /^[0-9a-f]{16}$/.test(D.motor.sim_viento_sha256));
  const IDX = JSON.parse(fs.readFileSync(path.join(sal, 'indice.json'), 'utf8'));
  check('el índice se rehace con la lámina nueva', IDX.laminas.length === 1 && IDX.laminas[0].fichero === 'PRT_2022_1.json' && IDX.laminas[0].n_nodos === D.n_nodos);

  // ── 5. careo: lote (4 estrategias a la vez) vs pestaña (una corrida por estrategia) ──
  // Misma meteo: la que se guardó en float32, leída con el mismo lector.
  const leeNodo = k => { const raw = fs.readFileSync(path.join(tmp, 'meteo.bin')), off = 4 + cb.length, o = {};
    COLS.forEach((c, i) => { o[c] = new Float32Array(raw.buffer.slice(raw.byteOffset + off + (k * COLS.length + i) * nh * 4, raw.byteOffset + off + (k * COLS.length + i + 1) * nh * 4)); });
    const time = []; for (let h = 0; h < nh; h++) time.push(new Date(Date.UTC(2022, 0, 1) + h * 3600e3).toISOString().slice(0, 16));
    const A = x => Array.from(x);
    return { hourly: { time, shortwave_radiation: A(o.ghi), diffuse_radiation: A(o.dhi), direct_normal_irradiance: A(o.dni),
      temperature_2m: A(o.temp), windspeed_10m: A(o.ws), winddirection_10m: A(o.wd), wind_gusts_10m: A(o.gust) } }; };
  let iguales = 0, total = 0, primero = '';
  for (let k = 0; k < N.nodos.length; k++) {
    const [lat, lon] = N.nodos[k];
    for (const ref of CFG.refs) {
      const M = await LOC._omParse(leeNodo(k), false);
      const rep = await LOC.run(LOC.mapaCuerpo(CFG.configuracion, { lat, lon }, { year: 2022, ref, step: CFG.opciones.step, rafaga: CFG.opciones.rafaga }, M));
      const g = LOC.mapaGanancia(rep, ref), l = LOC.mapaDeLamina(D.nodos[k][2], ref);
      total++;
      if (JSON.stringify(g) === JSON.stringify(l)) iguales++; else if (!primero) primero = ref + ' ' + lat + ',' + lon + ': ' + JSON.stringify(g) + ' vs ' + JSON.stringify(l);
    }
  }
  check('cada nodo y cada estrategia del lote = la corrida de la pestaña, al bit (' + iguales + '/' + total + ')', iguales === total, primero);
  check('y las cuatro estrategias dan cosas distintas (no es la misma copiada)',
        new Set(CFG.refs.map(r => LOC.mapaDeLamina(D.nodos[0][2], r).activo_pct)).size > 1);

  // ── 6. la pestaña carga la lámina ──
  await page.route('**/data/mapas_pais/pasivo/**', r => {
    const f = path.join(sal, path.basename(new URL(r.request().url()).pathname));
    fs.existsSync(f) ? r.fulfill({ contentType: 'application/json', body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' });
  });
  await page.evaluate(() => mIndiceLaminas());
  check('el desplegable lista el mapa calculado',
        await page.$$eval('#mLamina option', o => o.some(x => x.value === 'PRT_2022_1.json' && /Portugal/.test(x.textContent))));
  await page.selectOption('#mLamina', 'PRT_2022_1.json');
  await page.waitForFunction(() => MAPA.lamina && MAPA.hecho, null, { timeout: 30000 });
  const vista = await page.evaluate(() => ({ pais: $('mPais').value, paso: $('mPaso').value, year: $('mYear').value,
    lista: mLista().map(o => o.g), ref: $('mRef').value, est: $('mEstado').textContent }));
  check('al cargarla pone país, rejilla y año del mapa', vista.pais === 'PRT' && vista.paso === '1' && vista.year === '2022');
  check('y enseña los valores del fichero, nodo a nodo',
        vista.lista.length === D.n_nodos && vista.lista.every((g, i) => g && Math.abs(g.ganancia_pct - LOC.mapaDeLamina(D.nodos[i][2], vista.ref).ganancia_pct) < 1e-12));
  check('dice con qué configuración se calculó (suelta incluida)', /Calculado con/.test(vista.est) && /suelta del pasivo/.test(vista.est));
  await page.selectOption('#mRef', 'A1');
  const a1 = await page.evaluate(() => ({ l: !!MAPA.lamina, g: mLista()[0].g, corr: MAPA.corriendo }));
  check('cambiar de estrategia lee la otra capa del fichero, sin recalcular',
        a1.l && !a1.corr && a1.g.ganancia_pct === LOC.mapaDeLamina(D.nodos[0][2], 'A1').ganancia_pct);
  check('el pie del PNG cita ERA5 de Copernicus', await page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 1000; const x = cv.getContext('2d'); let t = '';
    const f = x.fillText.bind(x); x.fillText = (s, ...r) => { t += s + '|'; return f(s, ...r); };
    mPinta(x, 1600, 1000, MTEMA.claro, 1, false); return /Copernicus/.test(t); }));
  await page.fill('#mYear', '2021'); await page.dispatchEvent('#mYear', 'change');
  check('tocar el año suelta el mapa cargado (ya no es el de ese año)',
        await page.evaluate(() => !MAPA.lamina && !MAPA.hecho && $('mLamina').value === ''));
  check('sin errores de página', errores.length === 0, errores.join(' | ').slice(0, 300));
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\n' + (ko ? 'FALLOS: ' + ko : 'OK — ' + ok + '/' + ok + ' comprobaciones'));
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL el arnés revienta -> ' + (e && e.stack || e)); process.exit(1); });
