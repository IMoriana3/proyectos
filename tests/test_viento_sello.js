// El informe tiene que decir DE DÓNDE SALE.
//
// «Ponga el emplazamiento que ponga no me varía el número de abanderamientos.» La
// cadena estaba bien —el fetch lleva lat/lon, y dos sitios distintos dan números
// distintos— pero la pantalla no lo DECÍA: la etiqueta nombraba la fuente
// («Open-Meteo (ERA5)») y no el sitio, así que dos corridas de dos emplazamientos se
// veían idénticas y no había forma de comprobar de un vistazo si el número que estabas
// leyendo era del sitio nuevo o del anterior.
//
// El sello sale del CUERPO QUE SE CORRIÓ, no de las casillas: editar la latitud sin
// volver a simular no debe moverlo, porque los números de la tabla siguen siendo los
// del sitio de antes — y eso también se dice.
//
// La meteo se INYECTA y depende de la latitud: sin eso no hay régimen donde el número
// pueda cambiar, y las comprobaciones pasarían por no haber nada que ver.
//
//   node tests/test_viento_sello.js        (necesita el servidor en :8099)
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const meteoSint = lat => {
  const n = 8760, h = { time: [], shortwave_radiation: [], diffuse_radiation: [],
    direct_normal_irradiance: [], temperature_2m: [], windspeed_10m: [],
    winddirection_10m: [] };
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2023, 0, 1) + i * 3600e3);
    h.time.push(d.toISOString().slice(0, 16));
    const el = Math.max(0, Math.sin((i % 24 - 6) / 12 * Math.PI));
    h.shortwave_radiation.push(el * 900); h.diffuse_radiation.push(el * 130);
    h.direct_normal_irradiance.push(el * 700); h.temperature_2m.push(15);
    h.windspeed_10m.push((lat > 42 ? 14 : 4) + 6 * Math.sin(i / 7));   // el SITIO manda
    h.winddirection_10m.push(225);
  }
  return { hourly: h };
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  const pedidas = [];
  let lento = false;
  await page.route('**/archive-api.open-meteo.com/**', async r => {
    const lat = +new URL(r.request().url()).searchParams.get('latitude');
    pedidas.push(lat);
    if (lento) await new Promise(res => setTimeout(res, 1500));
    r.fulfill({ status: 200, contentType: 'application/json',
                body: JSON.stringify(meteoSint(lat)) });
  });
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#run', { timeout: 15000 });

  const sello = () => page.$eval('#meteoTag', e => e.textContent.replace(/\s+/g, ' ').trim());

  await page.fill('#lat', '41.5763'); await page.dispatchEvent('#lat', 'input');
  await page.click('#run');
  await page.waitForFunction(() => window.REP && REP.cases, { timeout: 90000 });
  await page.waitForTimeout(500);
  const s1 = await sello(), n1 = await page.evaluate(() => REP.cases.A1.n_events);
  check('el informe SELLA con qué coordenadas se calculó', /41\.5763/.test(s1), s1);

  await page.fill('#lat', '43.2'); await page.dispatchEvent('#lat', 'input');
  await page.waitForTimeout(300);
  const s2 = await sello();
  check('y si cambias de sitio SIN volver a simular, lo DICE en vez de callarse',
        /vuelve a simular/.test(s2) && /41\.5763/.test(s2), s2);

  await page.click('#run');
  await page.waitForFunction(() => window.REP && REP.corrida && REP.corrida.lat > 42,
                             { timeout: 90000 });
  await page.waitForTimeout(500);
  const s3 = await sello(), n3 = await page.evaluate(() => REP.cases.A1.n_events);
  check('al volver a simular el sello se REHACE, no enseña el de la corrida anterior',
        /43\.2000/.test(s3) && !/vuelve a simular/.test(s3), s3);

  // Lo que vuelve no-trivial a todo lo anterior: si el número no cambiara, el sello
  // estaría sellando una corrida que en realidad no se hizo.
  check('y el número de abanderamientos SÍ cambia con el sitio (' + n1 + ' -> ' + n3 + ')',
        n1 !== n3);
  check('con una petición a la meteo por sitio (' + JSON.stringify(pedidas) + ')',
        pedidas.length >= 2 && pedidas[0] !== pedidas[pedidas.length - 1]);

  // El sello sale del CUERPO QUE SE CORRIÓ, no de las casillas — y eso solo se puede
  // distinguir en un hueco concreto: una corrida de un año tarda segundos, y en ese
  // rato se puede editar la latitud. Si el sello leyera la casilla, sellaría un sitio
  // del que no ha calculado nada. Sin este caso, las dos versiones son indistinguibles.
  // Con la meteo inyectada la corrida acaba en milisegundos y NO HAY HUECO donde
  // editar: sin retardo, las dos versiones se comportan igual y el caso pasaría por no
  // existir. Se retrasa la respuesta para abrir el hueco que en la vida real abre la
  // red.
  lento = true;
  await page.fill('#lat', '41.5763'); await page.dispatchEvent('#lat', 'input');
  await page.click('#run');
  await page.waitForTimeout(400);
  await page.fill('#lat', '38.0');   await page.dispatchEvent('#lat', 'input');
  await page.waitForFunction(() => window.REP && REP.corrida, { timeout: 90000 });
  await page.waitForTimeout(500);
  const s4 = await sello();
  check('si se toca la casilla MIENTRAS corre, el sello es el del sitio que se calculó',
        /41\.5763/.test(s4) && !/en pantalla: 38/.test(s4), s4);
  check('y avisa de que la casilla ya no coincide', /vuelve a simular/.test(s4), s4);

  // ── LA VELOCIDAD DE SUELTA VIAJA CON EL RESULTADO ─────────────────
  // La fila del pasivo ya enseñaba el DENOMINADOR —«1 fila de 20»— porque sin él
  // el impacto de planta no es interpretable. Faltaba la otra mitad: a qué viento
  // se suelta. Ese número manda en todo el caso y NO está medido: es un sustituto
  // declarado del par de desembrague. Estaba en el anexo, no en la fila.
  //
  // Lo que hay que vigilar no es que aparezca un número: es que sea EL QUE SE
  // CONFIGURÓ. Un literal fijo se vería igual mientras nadie mueva la casilla.
  const filaPasivo = () => page.evaluate(() => {
    const tr = [...document.querySelectorAll('#cmpCard tbody tr')]
      .find(t => /PASIVO/.test(t.textContent));
    return tr ? tr.children[0].textContent.replace(/\s+/g, ' ').trim() : '';
  });

  // La meteo inyectada de este arnés depende de la LATITUD: a 41,5° el viento
  // no pasa de ~36 km/h y no cruzaría ninguno de los dos umbrales, así que la
  // última comprobación pasaría por no haber nada que ver. Se mueve al sitio
  // ventoso, donde 60 se cruza y 90 no — que es el régimen que separa los dos.
  await page.fill('#lat', '43.2'); await page.dispatchEvent('#lat', 'input');
  const vistas = {};
  for (const v of ['90', '60']) {
    await page.fill('#pasV', v); await page.dispatchEvent('#pasV', 'input');
    // El resultado ANTERIOR se borra antes de pulsar. Sin esto la espera de
    // abajo se cumple al instante con el `REP` de la vuelta previa, y la
    // segunda iteración lee la etiqueta VIEJA: el arnés fallaba 2 de cada 4
    // veces y su rojo decía «no sigue el valor configurado» — que es un
    // diagnóstico falso, porque la ficha lo seguía perfectamente. Un test que
    // espera sobre estado que puede sobrevivir a la acción no está esperando
    // a nada.
    await page.evaluate(() => { window.REP = null; });
    await page.click('#run');
    await page.waitForFunction(() => window.REP && REP.cases && REP.cases.PASIVO,
                               { timeout: 90000 });
    await page.waitForTimeout(400);
    vistas[v] = { fila: await filaPasivo(),
                  ev: await page.evaluate(() => REP.cases.PASIVO.n_events) };
  }

  check('la fila del pasivo dice a qué viento se suelta (' + vistas['90'].fila + ')',
        /suelta a 90 km\/h/.test(vistas['90'].fila), vistas['90'].fila);
  check('y va dicho que NO es una medida',
        /no medida/.test(vistas['90'].fila), vistas['90'].fila);
  check('sigue el valor CONFIGURADO, no un literal (90 -> 60)',
        /suelta a 60 km\/h/.test(vistas['60'].fila), vistas['60'].fila);
  check('sin perder el denominador, que era la otra mitad',
        /1 fila de \d+ \(/.test(vistas['60'].fila), vistas['60'].fila);
  // Lo que vuelve no-trivial a todo lo anterior: si el umbral no cambiara el
  // resultado, enseñarlo al lado del resultado no serviría de nada.
  check('y ese umbral CAMBIA el resultado (' + vistas['90'].ev + ' -> ' +
        vistas['60'].ev + ' abanderamientos)', vistas['90'].ev !== vistas['60'].ev);

  check('la ficha no lanza errores de JS', errores.length === 0, errores.join(' | '));
  await browser.close();
  console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();
