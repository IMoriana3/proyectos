// LA PUERTA DE METEO: `LOC.fetchYear` pide el año a Open-Meteo, y NADIE MIRABA
// LA URL — que es donde vive el contrato con el servicio.
//
// EL HALLAZGO, y es el que justifica este fichero. MEDIDO el 2026-09-10 con
// los mutantes verificados aplicados en disco, contra los seis arneses que
// nombran esta función o interceptan esa API:
//
//     windspeed_unit=ms  ->  kmh ............................ mató CERO
//     end_date usa `year` en vez de `year1` (multi-año roto) . mató CERO
//     se quita el `if(!r.ok)` (un 500 se lee como datos) ..... mató CERO
//
// El primero es el grave: si el servicio devuelve km/h y la ficha lo trata
// como m/s, TODO el viento de TODA corrida real sale multiplicado por 3,6.
// Con eso, un sitio con 8 m/s de media pasaría a 28,8 y el seguidor se
// abanderaría casi todo el año — y el portón entero seguiría verde.
//
// Y no es que los arneses estén flojos: es que INTERCEPTAN la API y contestan
// con su propia respuesta, así que la URL que se pidió les da igual. La única
// forma de vigilar un contrato con un servicio de fuera es MIRAR LO QUE SE
// PIDE, no lo que se recibe.
//
// El reintento sin ráfaga ya lo cubre `test_viento_rafaga_medida.js`; aquí se
// mira lo que nadie comprobaba: QUÉ fallos lo disparan. Y al medirlo salió que
// el comentario de la ficha decía más de lo que la forma del código compra —
// va corregido allí y la tabla medida está más abajo.
//
//   python3 -m http.server 8099
//   node tests/test_viento_meteo.js
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

// Una respuesta mínima pero COMPLETA de Open-Meteo: si le faltara un campo, el
// parseador caería por su rama de ausencia y el banco estaría midiendo eso.
function respuesta(conRafaga) {
  const t = ['2023-01-01T00:00', '2023-01-01T01:00', '2023-01-01T02:00'];
  const H = {
    time: t,
    shortwave_radiation: [0, 120, 340],
    diffuse_radiation: [0, 40, 90],
    direct_normal_irradiance: [0, 300, 600],
    temperature_2m: [4.5, 5.0, 6.5],
    windspeed_10m: [3.2, 7.7, 11.4],
    winddirection_10m: [10, 200, 350],
  };
  if (conRafaga) H.wind_gusts_10m = [5.0, 12.0, 18.5];
  return JSON.stringify({ hourly: H });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext();

  // El estado del SERVICIO de mentira se maneja desde aquí, no desde la página:
  // así se puede hacer que la primera petición falle y la segunda no, que es
  // como se ejercita el reintento.
  let modo = 'ok', urls = [];
  // EL ORDEN: el corta-todo va PRIMERO porque en Playwright gana la ruta
  // registrada la ÚLTIMA. Al revés, el corta-todo se comía la meteo y el banco
  // moría con «Failed to fetch» — que es lo mismo que ya me pasó escribiendo
  // `test_viento_orquestacion.js`, así que aquí va dicho para no volver.
  await ctx.route('**://*/**', r => r.request().url().startsWith(BASE)
    ? r.continue() : r.abort());
  await ctx.route('**archive-api.open-meteo.com**', route => {
    const u = route.request().url();
    urls.push(u);
    const conRafaga = /wind_gusts_10m/.test(u);
    if (modo === 'http500') return route.fulfill({ status: 500, body: 'boom' });
    if (modo === 'basura') return route.fulfill({ status: 200,
      contentType: 'application/json', body: '{esto no es json' });
    // Bien formado pero SIN `hourly`: aquí quien lanza es `_omParse`, no la
    // decodificación. Es el caso que distingue las dos mitades.
    if (modo === 'sin-hourly') return route.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ avisos: [] }) });
    if (modo === 'cae-con-rafaga' && conRafaga) return route.abort('failed');
    if (modo === 'cae-siempre') return route.abort('failed');
    return route.fulfill({ status: 200, contentType: 'application/json',
                           body: respuesta(conRafaga) });
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#run', { timeout: 20000 });
  check('la ficha expone `LOC.fetchYear` y `LOC.clearsky`',
        await page.evaluate(() => typeof LOC.fetchYear === 'function' &&
                                  typeof LOC.clearsky === 'function'));

  // ══════════════════════════════════════════════════════════════════
  //  1) LA URL ES EL CONTRATO
  // ══════════════════════════════════════════════════════════════════
  urls = []; modo = 'ok';
  const M = await page.evaluate(async () => {
    const o = await LOC.fetchYear(41.5, -1.25, 2023, 2023);
    return { n: o.t.length, source: o.source, rafaga: o.tiene_rafaga,
             ws: Array.from(o.ws), wd: Array.from(o.wd),
             gust: o.gust ? Array.from(o.gust) : null };
  });
  check('se pide UNA vez cuando el servicio responde', urls.length === 1, urls.length);
  const U = urls[0] || '';

  // LA UNIDAD. Es el mutante que mató cero contra todo lo demás, y el que más
  // caro sale: pedir km/h y tratarlo como m/s multiplica el viento por 3,6.
  check('se piden METROS POR SEGUNDO, que es lo que la ficha supone',
        /[?&]windspeed_unit=ms(&|$)/.test(U), U.slice(-120));
  check('y la hora en UTC, que es en la que se interpretan las muestras',
        /[?&]timezone=UTC(&|$)/.test(U), U.slice(-60));
  check('las coordenadas son las pedidas, no las de la ficha',
        /[?&]latitude=41\.5(&|$)/.test(U) && /[?&]longitude=-1\.25(&|$)/.test(U),
        U.slice(0, 110));
  check('el rango empieza el 1 de enero del año pedido',
        /[?&]start_date=2023-01-01(&|$)/.test(U), U);
  check('y acaba el 31 de diciembre', /[?&]end_date=2023-12-31(&|$)/.test(U), U);
  check('se piden las variables del modelo y la ráfaga',
        /hourly=[^&]*windspeed_10m/.test(U) && /hourly=[^&]*wind_gusts_10m/.test(U),
        (U.match(/hourly=[^&]*/) || [''])[0].slice(0, 110));

  // EL RANGO MULTI-AÑO. Su mutante —usar `year` también de fin— tampoco moría:
  // un año en vez de cinco no da error, da otro viento de diseño.
  urls = [];
  await page.evaluate(() => LOC.fetchYear(41.5, -1.25, 2019, 2023));
  check('con dos años, el rango va del primero al ÚLTIMO',
        /start_date=2019-01-01/.test(urls[0] || '') && /end_date=2023-12-31/.test(urls[0] || ''),
        (urls[0] || '').slice(-90));

  // ══════════════════════════════════════════════════════════════════
  //  2) LO QUE SE RECIBE
  // ══════════════════════════════════════════════════════════════════
  check('trae una muestra por hora servida', M.n === 3, M.n);
  check('y se identifica como Open-Meteo', M.source === 'open_meteo', M.source);
  check('el viento llega tal cual, sin convertir', M.ws[2] === 11.4, M.ws[2]);
  check('el rumbo también', M.wd[1] === 200, M.wd[1]);
  check('con ráfaga servida, se DECLARA que la hay',
        M.rafaga === true && M.gust && M.gust[2] === 18.5, String(M.rafaga));

  // ══════════════════════════════════════════════════════════════════
  //  3) UN 500 NO SON DATOS
  // ══════════════════════════════════════════════════════════════════
  urls = []; modo = 'http500';
  const err500 = await page.evaluate(async () => {
    try { await LOC.fetchYear(41.5, -1.25, 2023, 2023); return null; }
    catch (e) { return String(e.message || e); }
  });
  check('un 500 se convierte en error, no se intenta parsear',
        typeof err500 === 'string' && /500/.test(err500), String(err500));
  check('y el mensaje nombra al servicio, para saber dónde mirar',
        typeof err500 === 'string' && /Open-Meteo/.test(err500), String(err500));
  // Un 500 es respuesta del servicio, no fallo de red: NO es el caso del
  // reintento, que existe para la variable que el servicio no reconoce.
  // Y AQUÍ LO MEDIDO, que no es lo que la ficha decía. Un 500 SÍ dispara el
  // reintento: el manejador de fallo cuelga del `then` que hace el
  // `if(!r.ok)`, así que ve también los errores HTTP. Cuesta una petición de
  // más y el error final es el mismo, así que no es un bug — pero la nota de
  // la ficha afirmaba lo contrario y se ha corregido con esta tabla.
  check('un 500 reintenta una vez y se rinde con el mismo error',
        urls.length === 2, urls.length + ' peticiones');

  // ══════════════════════════════════════════════════════════════════
  //  4) EL REINTENTO ES PARA LA RED, NO PARA NUESTROS BUGS
  // ══════════════════════════════════════════════════════════════════
  // Esto es lo que el comentario de la ficha PROMETE —«va como segundo
  // argumento de `then` y no como `catch` a propósito: así este manejador ve
  // SOLO los fallos de la petición, y un error de parseo —que sería un bug
  // nuestro— no dispara un reintento que lo taparía»— y lo que nadie
  // comprobaba. Una promesa en un comentario no es un mecanismo.
  urls = []; modo = 'basura';
  const errParse = await page.evaluate(async () => {
    try { await LOC.fetchYear(41.5, -1.25, 2023, 2023); return null; }
    catch (e) { return String(e.message || e); }
  });
  check('una respuesta ilegible da error', typeof errParse === 'string', String(errParse));
  check('decodificar mal el JSON también reintenta: entra en «fallo de petición»',
        urls.length === 2, urls.length + ' peticiones');

  // LA MITAD QUE SÍ ES CIERTA, y es la que la forma `then(B, C)` compra: si
  // quien lanza es `_omParse` —o sea NUESTRA lectura de una respuesta bien
  // formada— el reintento NO se dispara, porque ahí taparía un bug nuestro.
  // Ésta es la distinción que el comentario de la ficha quería expresar, y la
  // única de las dos que se sostiene.
  urls = []; modo = 'sin-hourly';
  const errNuestro = await page.evaluate(async () => {
    try { await LOC.fetchYear(41.5, -1.25, 2023, 2023); return null; }
    catch (e) { return String(e.message || e); }
  });
  check('si el que falla es NUESTRO parseo, no se reintenta',
        urls.length === 1, urls.length + ' peticiones');
  check('y el error es el nuestro, no el de la red',
        typeof errNuestro === 'string' && /sin datos/.test(errNuestro),
        String(errNuestro));

  // El reintento sí, cuando la petición CAE con la ráfaga pedida.
  urls = []; modo = 'cae-con-rafaga';
  const conReintento = await page.evaluate(async () => {
    const o = await LOC.fetchYear(41.5, -1.25, 2023, 2023);
    return { rafaga: o.tiene_rafaga, noServida: !!o.rafaga_no_servida, n: o.t.length };
  });
  check('si la petición CON ráfaga cae, se pide otra vez',
        urls.length === 2, urls.length + ' peticiones');
  check('y la segunda va SIN la ráfaga',
        !/wind_gusts_10m/.test(urls[1] || ''),
        (urls[1] || '').match(/hourly=[^&]*/)?.[0].slice(0, 90));
  check('el resultado llega igual, con la ausencia DECLARADA',
        conReintento.n === 3 && conReintento.rafaga === false &&
        conReintento.noServida === true, JSON.stringify(conReintento));

  // Y UN reintento como mucho: si el segundo también cae, se propaga ESE error.
  urls = []; modo = 'cae-siempre';
  const dosCaidas = await page.evaluate(async () => {
    try { await LOC.fetchYear(41.5, -1.25, 2023, 2023); return null; }
    catch (e) { return String(e.message || e); }
  });
  check('si el segundo intento también cae, se rinde y lo dice',
        typeof dosCaidas === 'string', String(dosCaidas).slice(0, 60));
  check('y no se queda pidiendo en bucle: dos y para',
        urls.length === 2, urls.length + ' peticiones');

  // ══════════════════════════════════════════════════════════════════
  //  5) EL CIELO CLARO NO PIDE NADA
  // ══════════════════════════════════════════════════════════════════
  // Es la fuente que INVENTA el año a propósito, y su valor está en no
  // depender de nadie: si algún día saliera a la red, dejaría de servir para
  // lo que existe —correr sin conexión y sin depender de un servicio ajeno.
  urls = []; modo = 'ok';
  const fuera = [];
  const espia = page.on('request', r => {
    if (!r.url().startsWith(BASE)) fuera.push(r.url());
  });
  const CS = await page.evaluate(async () => {
    const o = await LOC.clearsky(41.5, -1.25, 2023);
    return { n: o.t.length, source: o.source, ghiMax: Math.max.apply(null, Array.from(o.ghi)),
             wsMax: Math.max.apply(null, Array.from(o.ws)),
             rafaga: o.tiene_rafaga };
  });
  check('el cielo claro no pide NADA a la red', urls.length === 0 && fuera.length === 0,
        urls.length + ' a meteo · ' + fuera.length + ' fuera');
  check('y devuelve un año entero de muestras', CS.n >= 8760, CS.n);
  check('con sol de verdad', CS.ghiMax > 500, CS.ghiMax);
  // Lo que INVENTA va declarado: viento a cero y sin ráfaga. Es la regla de la
  // casa —lo no medido se enseña como no medido— y aquí es literal.
  check('el viento del cielo claro es CERO, no un viento inventado',
        CS.wsMax === 0, CS.wsMax);
  check('y la ráfaga se declara ausente', CS.rafaga !== true, String(CS.rafaga));
  check('la fuente se identifica como lo que es', /clear|cielo|sint/i.test(CS.source || ''),
        CS.source);

  // ══════════════════════════════════════════════════════════════════
  //  6) CONTROL POSITIVO
  // ══════════════════════════════════════════════════════════════════
  // Todo lo de arriba pasa hoy. Se comprueba que el instrumento distingue:
  // se pide un año distinto y la URL tiene que cambiar. Si no cambiara, este
  // banco estaría leyendo una URL que no depende de lo que se pide.
  urls = [];
  await page.evaluate(() => LOC.fetchYear(-33.4, 151.2, 2015, 2015));
  check('CONTROL: pedir otro sitio y otro año cambia la URL',
        /latitude=-33\.4/.test(urls[0] || '') && /start_date=2015-01-01/.test(urls[0] || ''),
        (urls[0] || '').slice(0, 110) +
        ': si no cambiara, este banco no estaría midiendo lo que se pide');

  await browser.close();
  console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL el banco reventó -> ' + e.message); process.exit(1); });
