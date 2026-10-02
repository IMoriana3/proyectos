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
const { EXEC } = require('./pw_navegador.js');   // dónde está el chromium, en un solo sitio
const BASE = process.env.BASE_URL || 'http://localhost:8099';
const HAIL_DEFENSIVOS = ['HAIL_STOW_PREDICTIVO', 'HAIL_STOW_REACTIVO',
  'EMERGENCIA', 'HAIL_STOW_CONFIRMADO', 'MANTENIMIENTO_DE_POSICIÓN'];
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });

  // ── las pestañas ────────────────────────────────────────────────────
  await page.waitForSelector('#tabGranizo', { timeout: 15000 });
  check('la ficha tiene pestañas Viento y Granizo',
        (await page.$('#tabViento')) !== null && (await page.$('#tabGranizo')) !== null);
  /* AQUÍ HABÍA UN GUARD DEL HUECO DE NIEVE, y cumplió: exigía que la tercera
     pestaña fuera un botón DESACTIVADO con su motivo, para que nadie dejara una
     pestaña muerta en su sitio. El 2026-10-01 el hueco se llenó —la pestaña
     existe y hace una cosa concreta— y el guard se puso rojo, que es justo lo
     que tenía que hacer.
     No se borra: se le cambia la afirmación. Lo que ahora hay que vigilar es
     que esa pestaña NO INVENTE la máquina que no existe, y eso lo lleva
     `tests/test_amenaza_maniobra.js`. Aquí queda lo que a esta pestaña le toca:
     que la tercera exista y que sea de nieve. */
  check('y la tercera pestaña ya no es un hueco: existe y es la de Nieve',
        (await page.$('#tabNieve')) !== null &&
        (await page.$eval('#tabNieve', e => /nieve/i.test(e.textContent))) &&
        (await page.$$('#tabs button:disabled')).length === 0);
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

  // ── VDE ES EL DEFAULT, Y ESTE EPISODIO NO ESCALA CON ÉL ──────────────
  // Desde el 2026-10 la ficha arranca con los valores de VDE encima de los de
  // julio, porque manda VDE. Y eso tiene una consecuencia MEDIDA sobre esta
  // serie: el granizo del episodio de demostración son 1,6 cm (16 mm)
  // constantes, así que pasa el 1,0 de julio en sus 63 muestras y el 1,9 de VDE
  // en NINGUNA. La máquina se queda en NORMAL y no hay dinámica que mirar.
  //
  // No es un fallo y no se tapa: se comprueba. Lo que viene DESPUÉS prueba la
  // dinámica con los criterios de JULIO —que es el régimen para el que este
  // episodio se construyó, y lo dice el nombre de su propia comprobación— así
  // que aquí se pulsa el botón de julio a propósito.
  check('al abrir, el tamaño es el de VDE (1,9 cm = 19 mm)',
        await page.$eval('#gParams .gp[data-k="umbral_tamano_granizo_cm"]', e => +e.value) === 1.9);
  await page.click('#gRun');
  await page.waitForFunction(
    () => document.getElementById('gTimelineCard').style.display !== 'none',
    { timeout: 30000 });
  // SE AFIRMA LO QUE SE SABE, y «no escala» NO se sabe: la pre-alerta de esta
  // máquina se dispara con `cape >= umbral || prob >= umbral` y ninguno de los
  // dos mira el tamaño del granizo, así que con VDE puede haber estados de
  // vigilancia igual. Lo que el tamaño decide es llegar a DEFENSA, y eso es lo
  // que se exige aquí. Afirmar de más habría puesto este arnés rojo por una
  // frase mía, no por un defecto.
  const estadosVDE = await page.evaluate(() => GRAN ? GRAN.estados.slice() : null);
  check('y con VDE este episodio NO llega a defensa: su granizo son 16 mm, bajo los 19',
        !!estadosVDE && !estadosVDE.some(e => HAIL_DEFENSIVOS.includes(e)),
        estadosVDE ? [...new Set(estadosVDE)].join(',') : 'sin GRAN');
  check('la ficha lo DICE en vez de dejar la pantalla vacía sin motivo',
        /1,6 cm \(16 mm\)/.test(await page.$eval('#panelGranizo', e => e.textContent)));
  await page.click('#gReset');            // los de julio: a partir de aquí, dinámica

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
    // 90 s y no los 30 de por defecto. La recarga cae justo después de una
    // corrida de un año a paso MINUTAL, y en un runner de dos núcleos esa
    // cuenta sigue ocupando el hilo principal cuando se pide el reload: en CI
    // expiraba a los 30 s con las 21 comprobaciones anteriores en verde. No es
    // aflojar un listón —no se comprueba nada menos—, es darle a una operación
    // lenta el tiempo que de verdad tarda en la máquina más lenta que la corre.
    // Es la misma holgura que este arnés ya le da a `REP.timeline` dos líneas
    // más abajo.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#run', { timeout: 15000 });
    await page.click('#run');
    await page.waitForFunction(() => window.REP && REP.timeline, { timeout: 90000 });
    await page.click('text=⛨ Granizo'); await page.waitForTimeout(400);
    await page.selectOption('#gFuente', 'viento'); await page.waitForTimeout(200);
    // LOS DE JULIO, Y HAY QUE PEDIRLOS: este bloque hace un `reload` completo, y
    // al recargar la ficha arranca con su default, que desde el 2026-10 es VDE.
    // Con el 1,9 cm de VDE el granizo del demo (1,6 cm) no escala, así que no
    // habría tránsito que vetar y estas dos comprobaciones medirían el vacío
    // —medido: 0 vetos y 0 órdenes—. Lo que se prueba aquí es el VETO DEL VIENTO
    // sobre las señales de granizo del demo, y eso necesita que el granizo
    // escale: su régimen es el de julio y ahora se declara en vez de heredarse.
    // Un arnés que depende de cuál sea el default por casualidad es frágil dos
    // veces: se rompe cuando el default cambia, y no dice qué necesitaba.
    await page.click('#gReset'); await page.waitForTimeout(200);
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
