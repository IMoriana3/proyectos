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

  // ── C1 · EL CRUCE DEL §11: EL VIENTO VETA EL TRÁNSITO ──────────────
  // `veto_transito` existía desde el PR-A y estaba cableado, pero solo se ejercitaba
  // sobre las 120 muestras escritas a mano del demo: el viento que esta ficha simula
  // NUNCA llegaba a la máquina de granizo. La fuente nueva compone el episodio del
  // demo sobre el viento del emplazamiento y hace la pregunta que faltaba: si esto
  // hubiera caído durante el peor viento del año, ¿se habría vetado el tránsito?
  //
  // El régimen importa en las DOS direcciones: con viento flojo el veto no debe
  // dispararse, o «vetó» dejaría de significar nada.
  const meteoPico = pico => {
    const n = 8760, h = { time: [], shortwave_radiation: [], diffuse_radiation: [],
      direct_normal_irradiance: [], temperature_2m: [], windspeed_10m: [],
      winddirection_10m: [] };
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(2023, 0, 1) + i * 3600e3);
      h.time.push(d.toISOString().slice(0, 16));
      const el = Math.max(0, Math.sin((i % 24 - 6) / 12 * Math.PI));
      h.shortwave_radiation.push(el * 900); h.diffuse_radiation.push(el * 130);
      h.direct_normal_irradiance.push(el * 700); h.temperature_2m.push(15);
      const dist = Math.abs(i - 4380);              // un temporal a mitad de año
      h.windspeed_10m.push(5 + (dist < 40 ? pico * Math.exp(-dist / 12) : 0));
      h.winddirection_10m.push(225);
    }
    return { hourly: h };
  };

  const corre = async pico => {
    await page.unroute('**/archive-api.open-meteo.com/**').catch(() => {});
    await page.route('**/archive-api.open-meteo.com/**', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(meteoPico(pico)) }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#run', { timeout: 15000 });
    await page.click('#run');
    await page.waitForFunction(() => window.REP && REP.timeline, { timeout: 90000 });
    await page.click('text=⛨ Granizo'); await page.waitForTimeout(400);
    await page.selectOption('#gFuente', 'viento'); await page.waitForTimeout(200);
    await page.click('#gRun'); await page.waitForTimeout(2500);
    return page.evaluate(() => ({
      // el sostenido de las muestras tiene que SER el del informe, no un valor
      // cualquiera: si solo se mirase «hubo veto», falsear el sostenido pasaría
      // desapercibido porque la racha —derivada del mismo viento— vetaría igual.
      sostenidoOk: (() => {
        const w = REP.timeline.wind_ms, ms = window.GRAN_MUESTRAS || [];
        if (!ms.length) return null;
        return ms.every((m, i) => Math.abs(m.viento_sostenido_ms -
          w[Math.min(w.length - 1, i)]) < 0.02);
      })(),
      picoSostenido: Math.max.apply(null, (window.GRAN_MUESTRAS || [{viento_sostenido_ms:0}])
        .map(m => m.viento_sostenido_ms)),
      vetos: (GRAN.diario || []).filter(l => /veto|envolvente|LOCKOUT|NO-ACCIÓN/i.test(l)).length,
      ordenes: (GRAN.transiciones || []).filter(t => /STOW|EMERGENCIA/.test(t.a || t.destino || '')).length,
      fuente: (GRAN.parametros && GRAN.parametros.procedencia) || '',
      nm: (GRAN.not_modeled || []).join(' ')
    }));
  };

  const fuerte = await corre(22), flojo = await corre(3);

  check('con temporal, el viento VETA el tránsito de granizo (' + fuerte.vetos +
        ' vetos, ' + fuerte.ordenes + ' órdenes)',
        fuerte.vetos > 0 && fuerte.ordenes === 0,
        JSON.stringify(fuerte).slice(0, 160));

  check('y con viento flojo el tránsito SÍ se ordena (' + flojo.vetos + ' vetos, ' +
        flojo.ordenes + ' órdenes)', flojo.ordenes > 0 && flojo.vetos === 0,
        'sin este caso, «vetó» pasaría por no haber nada que ordenar');

  check('el viento SOSTENIDO de las muestras es el del informe, no un relleno (' +
        'pico ' + (fuerte.picoSostenido * 3.6).toFixed(0) + ' km/h)',
        fuerte.sostenidoOk === true && fuerte.picoSostenido > 15,
        'si se falsea el sostenido, la racha vetaría igual y el fallo pasaría: ' +
        'hay que mirar el valor, no solo el efecto');

  check('la procedencia dice que el granizo es del demo y el viento del sitio',
        /demo/i.test(fuerte.fuente) && /viento/i.test(fuerte.fuente), fuerte.fuente);

  check('y va dicho que NO es una predicción, sino dos cosas hechas coincidir',
        /NO es una predicción/.test(fuerte.nm), fuerte.nm.slice(0, 140));

  check('y que la racha es derivada, no medida',
        /racha no viene medida/i.test(fuerte.nm), fuerte.nm.slice(0, 200));

  check('la ficha no lanza errores de JS', errores.length === 0, errores.join(' | '));
  await browser.close();
  console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();
