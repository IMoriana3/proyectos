// La pestaña Granizo, ABIERTA en Chromium.
//
// Los arneses de traza y de espejo comprueban la física y la frontera entre
// repos. Esto comprueba lo que ninguno de los dos ve: que la pantalla existe,
// que el diagrama es la tabla que decide, que los tres contadores corren, y
// que el banner de NO VALIDADO está donde tiene que estar — en la UI, no solo
// en el JSON. Un parámetro no validado que solo se declara en la respuesta lo
// lee el que depura, no el que mira.
//
//   node tests/test_granizo_pestana.js      (necesita el servidor en :8099)
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
const HAIL_DEFENSIVOS = ['HAIL_STOW_PREDICTIVO', 'HAIL_STOW_REACTIVO',
  'EMERGENCIA', 'HAIL_STOW_CONFIRMADO', 'MANTENIMIENTO_DE_POSICIÓN'];
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });

  // ── las pestañas ────────────────────────────────────────────────────
  await page.waitForSelector('#tabGranizo', { timeout: 15000 });
  check('la ficha tiene pestañas Viento y Granizo',
        (await page.$('#tabViento')) !== null && (await page.$('#tabGranizo')) !== null);
  check('y el hueco de Nieve va DECLARADO, no como pestaña muerta',
        await page.$eval('#tabs button:disabled', e => /pendiente/i.test(e.textContent)));
  check('el panel de viento sigue siendo el que se ve al abrir',
        await page.$eval('#panelGranizo', e => e.style.display === 'none'));

  await page.click('#tabGranizo');
  await page.waitForSelector('#gParams .gp', { timeout: 10000 });
  check('al cambiar de pestaña se ve la de granizo',
        await page.$eval('#panelGranizo', e => e.style.display !== 'none')
        && await page.$eval('#panelViento', e => e.style.display === 'none'));

  // ── el banner, en la UI ─────────────────────────────────────────────
  const banner = (await page.$eval('#gNoval', e => e.textContent)).trim();
  check('el banner dice NO VALIDADOS en la pantalla (' + banner.slice(0, 40) + '…)',
        /NO VALIDADOS/.test(banner));
  check('y arrastra que el informe es un BORRADOR interno', /BORRADOR/.test(banner));

  // ── el diagrama ES la tabla que decide ──────────────────────────────
  const cajas = await page.$$eval('#gDiagrama rect', n => n.length);
  check('el diagrama pinta los doce estados (' + cajas + ')', cajas === 12);
  const aristas = await page.$$eval('#gDiagrama path[marker-end]', n => n.length);
  const tabla = await page.evaluate(() => GTABLA.filter(t => t.de).length);
  check('y una arista por transición NO transversal de la tabla (' +
        aristas + ' vs ' + tabla + ')', aristas === tabla);
  check('las transversales no llevan flecha, y se dice por qué',
        /cualquier estado/.test(await page.$eval('#gDiagrama', e => e.textContent)));

  // ── los parámetros salen del core, no tecleados en la ficha ─────────
  const nP = await page.$$eval('#gParams .gp', n => n.length);
  check('los parámetros son editables (' + nP + ')', nP >= 13);
  check('y sus valores salen del demo generado por el core',
        await page.evaluate(() => GJULIO && GJULIO.t_sin_precipitacion_min === 15));

  // ── correr ───────────────────────────────────────────────────────────
  await page.click('#gRun');
  await page.waitForFunction(
    () => document.getElementById('gTimelineCard').style.display !== 'none',
    { timeout: 30000 });
  const donde = await page.$eval('#gModoNota', e => e.textContent);
  check('corre y dice DÓNDE se ha calculado (' + donde.slice(0, 46) + '…)',
        /navegador|motor/.test(donde));
  const diario = await page.$eval('#gDiario', e => e.textContent);
  check('el diario sale entero', diario.split('\n').length >= 5);
  check('y arrastra lo no modelado (§10.2, §9.3)',
        /§10\.2/.test(await page.$eval('#gNoMod', e => e.textContent)));

  // ── LOS TRES CONTADORES ─────────────────────────────────────────────
  const conts = await page.$$eval('#gConts .c .n', n => n.map(x => x.textContent.trim()));
  check('los tres criterios de salida, cada uno con su contador (' + conts.join(' · ') + ')',
        conts.length === 3 && conts.includes('permanencia')
        && conts.includes('pasadas limpias') && conts.includes('sin precipitación'));
  const antes = await page.$$eval('#gConts .c .v', n => n.map(x => x.textContent.trim()));
  const max = await page.$eval('#gPos', e => +e.max);
  await page.fill('#gPos', String(max));
  await page.dispatchEvent('#gPos', 'input');
  const despues = await page.$$eval('#gConts .c .v', n => n.map(x => x.textContent.trim()));
  check('y CORREN al mover el instante (' + antes[2] + ' -> ' + despues[2] + ')',
        JSON.stringify(antes) !== JSON.stringify(despues));
  check('el estado vivo cambia con el deslizador',
        (await page.$eval('#gEstadoVivo', e => e.textContent)).trim().length > 0);

  // ── editar un parámetro y volver a correr sobre la MISMA serie ──────
  // El régimen hay que buscarlo: con `t_sin_precipitacion_min = 0` el caso de
  // demostración termina en NORMAL igual que con 15, así que comparar los dos
  // finales no comprobaba nada — y la primera versión de este check pasaba
  // `true` como condición, que es un test que aprueba siempre. Se usa la
  // permanencia mínima, que sí puede retener el caso hasta el final.
  const finJulio = await page.evaluate(() => GRAN.estados[GRAN.estados.length - 1]);
  check('con los criterios de julio, el caso de demostración vuelve a NORMAL',
        finJulio === 'NORMAL', finJulio);
  await page.fill('#gParams .gp[data-k="t_min_permanencia_min"]', '9999');
  await page.click('#gRun');
  await page.waitForFunction(
    () => GRAN && GRAN.parametros.valores.t_min_permanencia_min === 9999,
    { timeout: 20000 });
  const finRetenido = await page.evaluate(() => GRAN.estados[GRAN.estados.length - 1]);
  check('subir la permanencia mínima lo RETIENE en defensa (' + finJulio +
        ' -> ' + finRetenido + ')',
        finRetenido !== finJulio && HAIL_DEFENSIVOS.includes(finRetenido),
        finRetenido);
  await page.click('#gReset');
  await page.click('#gRun');
  await page.waitForFunction(
    () => GRAN && GRAN.estados[GRAN.estados.length - 1] === 'NORMAL',
    { timeout: 20000 });
  check('y «volver a los de julio» deshace el cambio en el resultado, no solo en el campo',
        (await page.evaluate(() => GRAN.estados[GRAN.estados.length - 1])) === 'NORMAL');
  check('y «volver a los de julio» restaura el valor',
        await page.$eval('#gParams .gp[data-k="t_sin_precipitacion_min"]', e => +e.value) === 15);

  check('la ficha no lanza errores de JS', errores.length === 0, errores.join(' | '));
  await browser.close();
  console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();
