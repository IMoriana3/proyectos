// La planta real con TODAS las estrategias a la vez, en Chromium.
//
// La comparativa enseña las cinco a la vez pero sobre bloques sintéticos
// iguales; la planta real enseña la geometría de verdad pero movida por UNA.
// Esto comprueba lo de en medio: que las franjas existen, que cada una mueve
// sus trackers con SU estrategia —comprobado sobre las matrices de instancia,
// no sobre el estado interno— y que la pantalla dice lo que es: ninguna planta
// corre cinco estrategias a la vez.
//
// El layout se INYECTA: los de verdad viven en el Pages de `cobertura-zigbee`
// y sin red no hay planta. Interceptar la petición es lo que hace que este
// arnés se pueda correr en cualquier sitio — y lo que evita que la única
// prueba de esta pantalla dependa de que un host de terceros esté arriba.
//
//   node tests/test_viento_planta.js        (necesita el servidor en :8099)
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

// Campo sintético ANCHO: 24 trackers en línea, para que el reparto vaya por X
// y las franjas se puedan distinguir a ojo y por matriz.
const LAYOUT = {
  clat: 41.5763, clon: -0.7981, mods: 28, modW: 1.134, filaZ: 3,
  trackers: Array.from({ length: 24 }, (_, i) => ({ x: i * 80, n: 0, rot: 0, t: 'completo' }))
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.route('**/*_layout.json', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LAYOUT) }));
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#escena', { timeout: 15000 });

  check('con la comparativa, el control de franjas NO se ofrece',
        await page.$eval('#bandasBox', e => e.style.display === 'none'),
        'la comparativa ya enseña las cinco: ahí el control no significa nada');

  await page.selectOption('#escena', 'fayon');
  await page.waitForFunction(() => window.ESC && ESC.kind === 'planta', { timeout: 25000 });
  check('la planta se monta (' + await page.evaluate(() => ESC.n + ' trackers') + ')',
        await page.evaluate(() => ESC.n) === LAYOUT.trackers.length);
  check('y ahora sí se ofrece el control de franjas',
        await page.$eval('#bandasBox', e => e.style.display === ''));
  check('pero por defecto la planta se mueve con UNA estrategia',
        await page.evaluate(() => ESC.bandas === false));

  // ── encender las franjas ───────────────────────────────────────────
  await page.check('#bandas');
  await page.waitForTimeout(700);
  check('franjas encendidas', await page.evaluate(() => ESC.bandas === true));
  const reparto = await page.evaluate(() => {
    const c = {}; ESC.banda.forEach(b => { const k = ESC.bandaKs[b]; c[k] = (c[k] || 0) + 1; });
    return c;
  });
  check('una franja por caso, equilibradas (' + JSON.stringify(reparto) + ')',
        Object.keys(reparto).length >= 5 &&
        Math.max(...Object.values(reparto)) - Math.min(...Object.values(reparto)) <= 1);
  check('los rótulos y las barras se montan sobre cada franja',
        await page.evaluate(() => ESC.etiquetas && ESC.etiquetas.children.length >= 10));

  // Con el viento a cero TODAS las estrategias dan el mismo ángulo —no hay
  // abanderamiento que ordenar— y el test pasaría o fallaría por el motivo
  // equivocado. Se sube a 45 km/h, entre los dos umbrales: ahí A1/B1 se van al
  // límite y A2/B2 se quedan en el sector parcial, así que las franjas TIENEN
  // que separarse. Es el régimen donde la propiedad puede romperse.
  await page.fill('#lV', '45');
  await page.dispatchEvent('#lV', 'input');
  /* Y hay que dejar que el hierro LLEGUE. `LIVE.ang` es el ángulo EJECUTADO,
     que sube a 0,17 °/s; con el reloj parado la orden existe y el seguidor no
     se ha movido, así que las seis franjas seguirían a 0° y el test aprobaría
     o fallaría por el motivo equivocado. Saltar la hora produce un dt grande
     —es el comportamiento declarado del modo en vivo— y cada caso llega a
     donde le toca. */
  await page.fill('#lH', '600'); await page.dispatchEvent('#lH', 'input');
  await page.waitForTimeout(300);
  await page.fill('#lH', '900'); await page.dispatchEvent('#lH', 'input');
  await page.waitForTimeout(700);

  // ── LO QUE IMPORTA: ángulos DISTINTOS por franja, medido en la matriz ──
  // No basta con que el estado interno diga que son distintos: lo que se ve
  // son las matrices de instancia, y ahí es donde hay que mirar.
  const angulos = await page.evaluate(() => {
    const m = ESC.mesas.instanceMatrix.array, porBanda = {};
    const porTracker = 2 * ESC.nFilas;         // instancias que ocupa cada tracker
    for (let i = 0; i < ESC.n; i++) {
      const off = i * porTracker * 16;
      /* La matriz es R_y(rot+90°)·R_x(θ)·…, así que el seno de θ NO está donde
         estaría en una rotación X pura: el giro del tubo lo mueve de sitio.
         Lo invariante es el elemento (1,1) = cos θ —la fila 1 de R_y es
         (0,1,0) y no toca ese término—, y el seno sale de (0,1) = sen θ ·
         cos(rot). Con el layout inyectado rot = 0, así que (0,1) = sen θ.
         (Mi primera versión leía e[6] y daba 0° SIEMPRE: el test fallaba por
         una lectura mal hecha, no por el código.) */
      const ang = Math.atan2(m[off + 4], m[off + 5]) * 180 / Math.PI;
      const k = ESC.bandaKs[ESC.banda[i]];
      (porBanda[k] = porBanda[k] || []).push(Math.round(ang * 10) / 10);
    }
    return porBanda;
  });
  const distintos = new Set(Object.values(angulos).map(v => v[0]));
  check('cada franja está a SU ángulo, y no todas al mismo (' +
        Object.entries(angulos).map(([k, v]) => k + '=' + v[0] + '°').join(' · ') + ')',
        distintos.size >= 2, JSON.stringify([...distintos]));
  check('dentro de una franja, sus trackers van juntos',
        Object.values(angulos).every(v => new Set(v).size <= 2));

  // ── el pasivo: se suelta el BORDE, no la franja entera ─────────────
  const pas = await page.evaluate(() => {
    const iPas = ESC.bandaKs.indexOf('PASIVO');
    if (iPas < 0) return null;
    let enBanda = 0, sueltos = 0;
    for (let i = 0; i < ESC.n; i++) {
      if (ESC.banda[i] === iPas) enBanda++;
      if (ESC.bandaSuelto[i]) sueltos++;
    }
    return { enBanda, sueltos };
  });
  check('en la franja del pasivo se suelta el borde, no la franja (' +
        (pas ? pas.sueltos + ' de ' + pas.enBanda : 'sin caso pasivo') + ')',
        !pas || (pas.sueltos > 0 && pas.sueltos < pas.enBanda));

  // ── el pasivo, EN SU RÉGIMEN: por encima del umbral de suelta ──────
  // A 45 km/h el pasivo no se ha soltado (su umbral es 90), así que su ángulo
  // y el de la base COINCIDEN y la distinción «solo el borde» no se puede
  // observar: el mutante que pinta la franja entera al ángulo del pasivo
  // sobrevivía. Hay que subir el viento hasta donde el pasivo hace algo.
  // Y la HORA también hay que elegirla: a las 16:40 el seguidor base ya está
  // pegado a su límite, así que coincide con el pasivo suelto y la distinción
  // vuelve a ser inobservable. Cerca del mediodía la base está casi plana
  // (medido: 1,1° a las 12:00) y el pasivo, caído a −55°.
  await page.fill('#lV', '100'); await page.dispatchEvent('#lV', 'input');
  await page.fill('#lH', '600'); await page.dispatchEvent('#lH', 'input');
  await page.waitForTimeout(400);
  await page.fill('#lH', '720'); await page.dispatchEvent('#lH', 'input');
  await page.waitForTimeout(800);
  const pasAng = await page.evaluate(() => {
    const m = ESC.mesas.instanceMatrix.array, pt = 2 * ESC.nFilas;
    const iPas = ESC.bandaKs.indexOf('PASIVO');
    const ang = i => Math.round(Math.atan2(m[i * pt * 16 + 4], m[i * pt * 16 + 5])
                                * 180 / Math.PI * 10) / 10;
    const sueltos = [], resto = [];
    for (let i = 0; i < ESC.n; i++)
      if (ESC.banda[i] === iPas) (ESC.bandaSuelto[i] ? sueltos : resto).push(ang(i));
    return { sueltos, resto, pasivo: LIVE.ang.PASIVO, base: LIVE.ang.BASE };
  });
  check('a 100 km/h el pasivo SÍ hace algo distinto de la base (' +
        Math.round(pasAng.pasivo) + '° vs ' + Math.round(pasAng.base) + '°)',
        Math.abs(pasAng.pasivo - pasAng.base) > 1,
        'sin eso, la comprobación de abajo no puede fallar');
  check('y dentro de su franja SOLO el borde está suelto (' +
        pasAng.sueltos.join(',') + ' vs resto ' + pasAng.resto.join(',') + ')',
        pasAng.sueltos.length > 0 && pasAng.resto.length > 0 &&
        Math.abs(pasAng.sueltos[0] - pasAng.resto[0]) > 1,
        'la franja entera al ángulo del pasivo sería dibujar un abanderamiento de planta');

  // ── y la pantalla DICE lo que es ───────────────────────────────────
  const nota = await page.$eval('#bandasNota', e => e.textContent);
  check('la nota avisa de que NO es una planta con cinco estrategias (' +
        nota.slice(0, 60) + '…)', /no es una planta con/i.test(nota));

  await page.uncheck('#bandas');
  await page.waitForTimeout(500);
  check('apagarlas vuelve a una sola estrategia y quita los rótulos',
        await page.evaluate(() => ESC.bandas === false && !ESC.etiquetas));

  check('la ficha no lanza errores de JS', errores.length === 0, errores.join(' | '));
  await browser.close();
  console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();
