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

  // ── LA CONSIGNA Y LO EJECUTADO SON DOS COSAS ───────────────────────
  // «full stow · θ 0,0°» con el reloj parado se lee como que el
  // abanderamiento no se ha dado. Se ha dado: no ha LLEGADO. El eje va a
  // 0,17 °/s y cruzar de un límite al otro son casi once minutos.
  await page.uncheck('#bandas');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lV', { timeout: 15000 });
  await page.fill('#lV', '111'); await page.dispatchEvent('#lV', 'input');
  await page.waitForTimeout(900);
  const parado = await page.$$eval('#tiles .tile', ns => ns.map(n =>
    n.querySelector('.m').textContent.replace(/\s+/g, ' ').trim()));
  const stow = parado.filter(t => /full stow/.test(t));
  check('con el reloj parado, las cuatro motorizadas ORDENAN pero no han ' +
        'llegado (' + stow.length + ' en full stow)', stow.length >= 4);
  check('y la tarjeta lo DICE: consigna, tiempo de recorrido y reloj parado',
        stow.filter(t => /ordenado -55° · en camino/.test(t)).length >= 4 &&
        stow.some(t => /reloj parado/.test(t)),
        stow[0]);
  // Aqui esta el nudo de todo el asunto. Las cuatro motorizadas y el pasivo
  // acaban en el MISMO angulo, y hasta ahora la ficha les daba tambien la
  // misma palabra: las cinco decian «full stow». No es lo mismo. Un full stow
  // es una orden que el hierro tarda minutos en recorrer; la suelta es un
  // desembrague que llega en un paso. La teja tiene que separarlos.
  const tejaPas = parado.filter(t => /suelta/.test(t));
  check('el PASIVO no dice «full stow»: eso es una ORDEN, y a el no le ordena ' +
        'nadie — dice «suelta»', tejaPas.length === 1 && stow.length === 4,
        'suelta=' + tejaPas.length + ' full_stow=' + stow.length + ' || ' + parado.join(' || '));
  check('y esta YA en el tope sin «en camino»: no lo mueve un motor, CAE',
        tejaPas.some(t => /θ -55/.test(t) && !/en camino/.test(t)),
        tejaPas.join(' || '));
  check('la suelta no se pinta del color del stow ordenado: son causas distintas',
        await page.evaluate(() => MODO_COL.SUELTA !== MODO_COL.FULL_STOW &&
                                  MODO_COL.SUELTA != null));
  check('y el seguidor SIN abanderar no se marca por su retardo natural',
        parado.some(t => /seguimiento/.test(t) && !/en camino/.test(t)),
        'con un umbral por debajo de 2° la base decía «en camino» al mediodía');

  await page.click('#lPlay');
  await page.waitForFunction(() => LIVE && LIVE.ang.A1 < -30, { timeout: 20000 });
  const andando = await page.$$eval('#tiles .tile', ns => ns.map(n =>
    n.querySelector('.m').textContent.replace(/\s+/g, ' ').trim()));
  check('corriendo el reloj, el ángulo avanza y el «en camino» se acorta',
        andando.some(t => /full stow/.test(t) && /en camino/.test(t) &&
                          !/reloj parado/.test(t)),
        andando.filter(t => /full stow/.test(t))[0]);

  // La coincidencia de angulo es eso, una coincidencia: el lado de montaje del
  // pasivo es -55 y el viento venia del oeste. Con el viento del ESTE las
  // motorizadas de tipo A se van a +55 y el pasivo sigue cayendo a -55, porque
  // no elige lado: se cae al suyo. Sin esta comprobacion, el careo del angulo
  // pasaria igual estando el pasivo mal, por dar los dos -55 siempre.
  await page.fill('#lD', '90'); await page.dispatchEvent('#lD', 'input');
  await page.waitForTimeout(700);
  const este = await page.evaluate(() => ({ ...LIVE.orden }));
  check('con el viento del ESTE las tipo A ordenan +55 y el pasivo sigue en -55: ' +
        'no elige lado, se cae al suyo',
        Math.round(este.A1) === 55 && Math.round(este.A2) === 55 &&
        Math.round(este.PASIVO) === -55, JSON.stringify(este));

  // ── LA HUELLA DE CADA FRANJA EN EL SUELO ───────────────────────────
  // Con las franjas encendidas, a que grupo pertenece un seguidor solo se sabia por el
  // color de su poste. La tentacion es pintar una caja por franja; seria mentira,
  // porque la planta es un poligono irregular y la caja cubriria suelo sin seguidores.
  // Se comprueba sobre una planta CON DIENTE DE SIERRA Y UN HUECO DENTRO, que es el
  // regimen donde una caja y una huella de verdad dan resultados distintos. En una
  // planta rectangular las dos coincidirian y el test pasaria por el motivo equivocado.
  const IRREG = { clat: 41.5, clon: -0.8, mods: 28, modW: 1.134, filaZ: 3, trackers: [] };
  for (let c = 0; c < 20; c++) {
    const alto = 6 + Math.round(4 * Math.sin(c / 3));
    for (let r = 0; r < alto; r++) {
      if (c >= 8 && c <= 11 && r >= 2 && r <= 3) continue;      // el hueco, a proposito
      IRREG.trackers.push({ x: c * 24, n: r * 40, rot: 0, t: 'completo' });
    }
  }
  await page.unroute('**/*_layout.json');
  await page.route('**/*_layout.json', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(IRREG) }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#escena', { timeout: 15000 });
  await page.selectOption('#escena', 'fayon');
  await page.waitForFunction(() => window.ESC && ESC.kind === 'planta', { timeout: 25000 });
  await page.check('#bandas');
  await page.waitForTimeout(700);

  const H = await page.evaluate(() => {
    const hu = (ESC.bifila ? ESC.filaZ : 0) + 1.6;
    const h = huellaBandas(ESC.base, ESC.banda, ESC.bandaKs.length, hu, 10, 0);
    const xs = ESC.base.map(b => b.x);
    return {
      porFranja: h.map((o, i) => ({
        k: ESC.bandaKs[i], rects: o.rects.length, borde: o.borde.length,
        cols: new Set(o.rects.map(r => Math.round(r.u))).size })),
      hu: h[0].rects[0].hu, huMin: hu,
      paso: (() => { const u = [...new Set(xs)].sort((a, b) => a - b);
        const d = []; for (let q = 1; q < u.length; q++) d.push(u[q] - u[q - 1]);
        d.sort((a, b) => a - b); return d[Math.floor(d.length / 2)]; })(),
      // ninguna huella puede salirse de la planta
      fuera: h.some(o => o.rects.some(r =>
        r.u - r.hu < Math.min(...xs) - 1e-6 - h[0].rects[0].hu ||
        r.u + r.hu > Math.max(...xs) + 1e-6 + h[0].rects[0].hu))
    };
  });

  check('hay una huella por franja, y ninguna vacia (' +
        H.porFranja.map(f => f.k + ':' + f.rects).join(' ') + ')',
        H.porFranja.length >= 5 && H.porFranja.every(f => f.rects > 0));

  check('el ancho se MIDE del paso entre columnas, no se elige (' + H.hu + ' m de ' +
        H.paso + ' m de paso)', Math.abs(H.hu - H.paso / 2) < 0.01 && H.hu > H.huMin,
        'con el ancho de la estructura a secas salen tiras sueltas, no una franja');

  // El hueco interior: la columna que lo cruza tiene que quedar PARTIDA en dos tramos.
  // Una caja —o una union que ignore los huecos— daria un rectangulo por columna.
  const partidas = H.porFranja.filter(f => f.rects > f.cols);
  check('un hueco dentro de la planta parte la huella: no se pinta suelo vacio (' +
        partidas.map(f => f.k).join(' ') + ')', partidas.length >= 1,
        JSON.stringify(H.porFranja));

  check('ninguna huella se sale del campo', H.fuera === false);

  // El contorno es el de la UNION: si fuese el de cada rectangulo por separado serian
  // exactamente 4 aristas por rectangulo, y la franja saldria rayada por dentro.
  const rayado = H.porFranja.filter(f => f.borde === 4 * f.rects);
  check('el contorno cancela las aristas interiores (' +
        H.porFranja.map(f => f.borde + '<' + 4 * f.rects).join(' ') + ')',
        rayado.length === 0,
        'una franja con 4 aristas por rectangulo es una franja dibujada a rayas');

  check('la ficha no lanza errores de JS', errores.length === 0, errores.join(' | '));
  await browser.close();
  console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();
