// LOS LIENZOS A LA DENSIDAD DE LA PANTALLA — y esto no lo miraba ningún arnés.
//
// Un `<canvas>` tiene DOS tamaños: el del BÚFER (`width`/`height`, píxeles de
// dibujo) y el que OCUPA (CSS). Si el búfer es menor, el navegador amplía lo
// dibujado —y con ello la letra y el trazo—: se ve gordo y blando. En una
// pantalla de densidad 2, dibujar a resolución CSS ya es la mitad de la que
// hay. Por eso las fichas hacen `dpr = min(devicePixelRatio, 2)` y dimensionan
// el búfer con él.
//
// EL HUECO, MEDIDO: con `var dpr=1` en `layout.html` —verificado aplicado en
// disco— los cuatro arneses que abren esa ficha dieron 544 comprobaciones
// VERDES y salida 0: `test_layout` (201), `test_layout_ui` (182),
// `test_zonas_mixto` (106) y `test_buscador` (55). Se comprobaron las dos
// señales, el recuento y el código de salida, porque hoy ya leí una explosión
// como un superviviente por mirar solo una.
//
// Y HABÍA UNA HERRAMIENTA QUE LO MEDÍA Y NO VOTABA. `tools/test_nitidez.mjs`
// hace esta misma medida sobre CINCO repos, pero no da veredicto: cuenta los
// lienzos malos, los imprime y termina con 0 pase lo que pase. Un informe con
// nombre de banco. No se toca —es un instrumento de varios repos a propósito,
// y sirve para MIRAR— y en su lugar la parte de ESTE repo entra aquí, con
// veredicto y con el navegador y el servidor que ya usa el resto del portón.
//
// La espera a que se asiente NO es prudencia de más: es la lección de aquella
// herramienta, escrita en su código. Midiendo en carrera con la maquetación,
// el comparador dio ×1,4 en una pasada y ×1,99 en la siguiente sin tocar nada.
// Se espera a que ni el búfer ni lo ocupado cambien en varias vueltas.
//
//   python3 -m http.server 8099
//   node tests/test_nitidez.js
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

// Las páginas de este repo que dibujan en lienzo, con cuántos se esperan. El
// número va aquí A PROPÓSITO: si una ficha pierde un lienzo —porque un panel
// deja de pintarse— la medida de los que quedan seguiría saliendo perfecta.
// Medido el 2026-09-10 con densidad 2.
//
// Y OJO CON LO QUE NO SE VE. La primera versión de este banco medía UN lienzo
// en `sim-viento.html` y daba verde: los otros ocho están ocultos hasta que ha
// corrido una simulación, así que la medida no los alcanzaba. Lo delató su
// propia batería —el mutante que pone `dpr=1` en el 2D de esa ficha SOBREVIVÍA
// mientras el del 3D moría—, que es el quinto corolario en su forma más
// literal: la fixture no contenía el mecanismo. Así que aquí la ficha de
// viento se CORRE, con la meteo interceptada como en los demás arneses de
// viento, y pasa de 1 lienzo medido a 7.
//
// Quedan DOS que ni así aparecen —`extCv` (extremos) y `gTl` (línea de tiempo
// de racha)—: piden más interacción de la que este banco hace. Va dicho aquí
// en vez de contarlos como medidos.
const meteoSint = lat => {
  const n = 8760, h = { time: [], shortwave_radiation: [], diffuse_radiation: [],
    direct_normal_irradiance: [], temperature_2m: [], windspeed_10m: [], winddirection_10m: [] };
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2023, 0, 1) + i * 3600e3);
    h.time.push(d.toISOString().slice(0, 16));
    const el = Math.max(0, Math.sin((i % 24 - 6) / 12 * Math.PI));
    h.shortwave_radiation.push(el * 900); h.diffuse_radiation.push(el * 130);
    h.direct_normal_irradiance.push(el * 700); h.temperature_2m.push(15);
    h.windspeed_10m.push(4 + 6 * Math.sin(i / 7)); h.winddirection_10m.push(225);
  }
  return { hourly: h };
};
const PAGINAS = [
  ['sim-solar.html', 7, null],
  ['sim-viento.html', 7, async page => {
    await page.waitForSelector('#run', { timeout: 15000 });
    await page.click('#run');
    await page.waitForFunction(() => window.REP && REP.cases, { timeout: 120000 });
  }],
  ['generador-layout.html', 1, null],
  ['comparador-estructuras.html', 3, null],
  ['layout.html', 1, null],
];
// ×1,9 y no ×2 porque el búfer se redondea a entero: un ancho CSS impar da
// 1,99 y no es un fallo. Por debajo de 1,9 ya no es redondeo.
const MINIMO = 1.9;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  let totalLienzos = 0;
  for (const [pag, esperados, antes] of PAGINAS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    // Todo lo de fuera se corta —estas fichas piden terreno y meteo, y una
    // espera de red haría la medida lenta y caprichosa— salvo la meteo, que se
    // INTERCEPTA con una serie sintética, la misma forma que usan los demás
    // arneses de viento. Lo que se mide es el DIMENSIONADO del lienzo, que no
    // depende del dato; la meteo hace falta solo para que la simulación
    // termine y aparezcan los paneles.
    //
    // EL ORDEN IMPORTA y me costó una tirada: en Playwright gana la ruta
    // registrada la ÚLTIMA, así que el corta-todo va PRIMERO. Al revés
    // abortaba la meteo, la simulación no terminaba nunca y el banco moría
    // esperando — con un mensaje de tiempo agotado que no decía nada de esto.
    await ctx.route('**://*/**', r => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await ctx.route('**/archive-api.open-meteo.com/**', r => {
      const lat = +new URL(r.request().url()).searchParams.get('latitude');
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(meteoSint(lat)) });
    });
    const page = await ctx.newPage();
    let medidas = null;
    try {
      await page.goto(BASE + '/' + pag, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (antes) await antes(page);
      let prev = '', estable = 0;
      for (let i = 0; i < 40 && estable < 3; i++) {
        await page.waitForTimeout(350);
        const ahora = await page.evaluate(() => [...document.querySelectorAll('canvas')]
          .map(c => c.width + 'x' + c.height + '@' + Math.round(c.getBoundingClientRect().width)).join(','));
        estable = (ahora === prev) ? estable + 1 : 0; prev = ahora;
      }
      medidas = await page.evaluate(() => [...document.querySelectorAll('canvas')].map(c => {
        const b = c.getBoundingClientRect();
        return { id: c.id || String(c.className || '').slice(0, 20) || '(sin id)',
                 css: Math.round(b.width), buf: c.width,
                 ratio: b.width > 0 ? +(c.width / b.width).toFixed(3) : null,
                 dpr: window.devicePixelRatio };
      }).filter(x => x.css > 40));
    } catch (e) {
      check(pag + ': la ficha abre y deja medir sus lienzos', false, e.message.split('\n')[0]);
      await ctx.close();
      continue;
    }
    // El propio banco tiene que estar midiendo donde se puede fallar: si el
    // navegador no diera densidad 2, todos los ratios saldrían ×1 y esto sería
    // un rojo del entorno leído como regresión (segundo corolario).
    const dpr = medidas.length ? medidas[0].dpr : null;
    check(pag + ': el navegador da densidad 2, que es donde esto se nota',
          dpr === 2, String(dpr));
    check(pag + ': siguen estando sus ' + esperados + ' lienzos',
          medidas.length === esperados, medidas.length + ' medidos');
    medidas.forEach(function (c) {
      totalLienzos++;
      const veredicto = c.ratio >= MINIMO ? '' :
        (c.ratio >= 0.98 ? 'BLANDO: se dibuja a resolución CSS' : 'AMPLIADO: letra y trazo agrandados');
      check(pag + ' · «' + c.id + '» dibuja a la densidad de la pantalla',
            c.ratio >= MINIMO,
            veredicto + ' — búfer ' + c.buf + ' sobre ' + c.css + ' ocupados = ×' + c.ratio);
    });
    await ctx.close();
  }
  // El total va escrito por la misma razón que el de cada página: si una ficha
// dejara de pintar y otra ganara un panel, los recuentos por página podrían
// cuadrar por separado. Diecinueve, medidos el 2026-09-10 con densidad 2.
check('se han medido los diecinueve lienzos del repo', totalLienzos === 19, totalLienzos);

  // ── CONTROL POSITIVO ────────────────────────────────────────────────
  // Una batería donde todo pasa puede querer decir que la batería no mide.
  // Aquí se fabrica un lienzo con el búfer a la mitad y se exige que la MISMA
  // regla lo condene: si no, todo lo de arriba sería decorativo.
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const pc = await ctxC.newPage();
  await pc.setContent('<canvas id="malo" width="300" style="width:600px;height:200px"></canvas>' +
                      '<canvas id="bueno" width="1200" style="width:600px;height:200px"></canvas>');
  const ctrl = await pc.evaluate(() => [...document.querySelectorAll('canvas')].map(c =>
    ({ id: c.id, ratio: +(c.width / c.getBoundingClientRect().width).toFixed(3) })));
  const malo = ctrl.find(c => c.id === 'malo'), bueno = ctrl.find(c => c.id === 'bueno');
  check('CONTROL: un lienzo con el búfer a la mitad NO pasa la regla',
        malo.ratio < MINIMO, '×' + malo.ratio);
  check('CONTROL: y uno bien dimensionado SÍ la pasa',
        bueno.ratio >= MINIMO, '×' + bueno.ratio);
  await ctxC.close();

  await browser.close();
  console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL el banco reventó -> ' + e.message); process.exit(1); });
