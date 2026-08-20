// La ficha «Generador de layout» en un navegador real (Chromium via Playwright).
//
// El careo (test_layout.js) mide el MOTOR, que es donde está la física. Esto mide
// lo otro: que la ficha esté CABLEADA. Un motor perfecto detrás de un botón que no
// llama a nadie, o de un lienzo que se queda en negro, se lee como «no funciona».
//
// Comprueba: que genera y pinta de verdad (píxeles de mesa en el lienzo, no solo
// números), que los tres caminos de parcela acaban en un layout, que el reparto
// multi-talla sale en pantalla, que el montaje fijo cambia lo que se rotula y que
// las salidas (GeoJSON/DXF/KML/3D) se habilitan solo cuando hay algo que exportar.
//
//   npm install playwright                     # el navegador ya está en /opt/pw-browsers
//   python3 -m http.server 8099                # servir el repo (en otra terminal)
//   node tests/test_layout_ui.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const GEOJSON_PRUEBA = JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon',
  coordinates: [[[-0.8035, 41.5743], [-0.7928, 41.5743], [-0.7928, 41.5784], [-0.8035, 41.5784], [-0.8035, 41.5743]]] } });

// Píxeles verdes de mesa sobre el fondo del panel: el lienzo pintado, no descrito.
const pintado = page => page.evaluate(() => {
  const c = document.querySelector('#cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 40 && d[i + 1] > 140 && d[i + 2] < 180) n++;
  return n;
});
// Esperar a que el rótulo CAMBIE no vale: dos generaciones iguales dan el mismo
// texto («navegador · 35 ms») y la espera se queda colgada para siempre. Se
// borra antes de pulsar, y así lo que se espera es que vuelva a escribirse.
const generar = async page => {
  await page.evaluate(() => { document.querySelector('#hint').textContent = ''; });
  await page.click('#genBtn');
  await page.waitForFunction(() => {
    const t = document.querySelector('#hint').textContent;
    return t.indexOf('calculando') < 0 && (t.indexOf('ms') >= 0 || t.indexOf('error') >= 0);
  }, null, { timeout: 30000 });
};
const num = s => parseInt(String(s).replace(/[^\d]/g, ''), 10);
// La caja del lienzo se mide respecto al VIEWPORT: si los `fill` anteriores han
// movido el scroll y queda medio fuera, los clics calculados con ella caen donde
// no es y la prueba mide otra cosa. Traerlo a la vista antes de medir.
// Los avanzados viven en un <details> plegado: sin abrirlo, Playwright espera
// para siempre a un control que existe pero no se ve.
const abreAvanzados = page => page.evaluate(() => {
  document.querySelectorAll('details.adv').forEach(d => { d.open = true; });
});
const cajaLienzo = async page => {
  await page.evaluate(() => document.querySelector('#cv').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(120);
  return page.evaluate(() => { const r = document.querySelector('#cv').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height }; });
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const fallos = [];
  page.on('pageerror', e => fallos.push(e.message));
  // Ortofoto: el banco no puede depender del servidor de teselas de Esri (ni de
  // que haya red), así que se sirve un PNG propio de 256×256 con la misma forma.
  // El camino de la ortofoto se ejercita de verdad; lo que no se prueba es Esri.
  const TESELA = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAA' +
    'IElEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAHwaIAAB1F0m1AAAAABJRU5ErkJggg==', 'base64');
  let teselasPedidas = 0;
  await page.route('https://server.arcgisonline.com/**', r => {
    teselasPedidas++;
    r.fulfill({ status: 200, contentType: 'image/png',
                headers: { 'access-control-allow-origin': '*' }, body: TESELA });
  });
  await page.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });

  // ── arranque ──
  check('las salidas arrancan deshabilitadas (no hay nada que exportar)',
    await page.evaluate(() => ['expGeo', 'expDxf', 'expKml', 'd3Btn'].every(i => document.getElementById(i).disabled)));
  check('el emplazamiento arranca en «manual»', (await page.textContent('#sitioSel')).trim() === 'manual');
  check('el azimut de filas se deriva del eje (eje N-S 0° → filas a 90°)',
    await page.inputValue('#panelAz') === '90');

  // ── ortofoto y navegación ──
  // Esperar al estado FINAL: «cargando ortofoto…» también tiene longitud, y
  // comprobar contra él es medir la carrera, no el resultado.
  await page.waitForFunction(() => /Esri World Imagery|sin ortofoto/.test(
    document.querySelector('#basemapMsg').textContent), null, { timeout: 15000 });
  check('pide teselas de ortofoto al arrancar', teselasPedidas > 0, String(teselasPedidas));
  check('y lo dice en la leyenda', /Esri World Imagery/.test(await page.textContent('#basemapMsg')),
    await page.textContent('#basemapMsg'));
  // El lienzo debe poder LEERSE: si la tesela entrara sin CORS quedaría «teñido»
  // y getImageData lanzaría — y con él se caen todas las comprobaciones de pintado.
  check('el lienzo no queda teñido por las teselas (crossOrigin)',
    await page.evaluate(() => { try { const c = document.querySelector('#cv');
      c.getContext('2d').getImageData(0, 0, 2, 2); return true; } catch (e) { return false; } }));
  check('con CORS no hace falta el reintento sin él', !(await page.evaluate(() => LIENZO_TENIDO)));
  const vista0 = await page.evaluate(() => ({ cx: VIEW.cx, cy: VIEW.cy, z: VIEW.z }));
  // La rueda se despacha donde está el ratón, y arranca en (0,0): sin mover el
  // puntero al lienzo, el evento no llega y la comprobación mediría nada.
  const cajaCv = await cajaLienzo(page);
  await page.mouse.move(cajaCv.x + cajaCv.w / 2, cajaCv.y + cajaCv.h / 2);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(120);
  const vista1 = await page.evaluate(() => ({ cx: VIEW.cx, cy: VIEW.cy, z: VIEW.z }));
  check('la rueda acerca', vista1.z > vista0.z, vista0.z + ' → ' + vista1.z);
  const caja0 = await cajaLienzo(page);
  await page.mouse.move(caja0.x + caja0.w / 2, caja0.y + caja0.h / 2);
  await page.mouse.down();
  await page.mouse.move(caja0.x + caja0.w / 2 + 90, caja0.y + caja0.h / 2 + 40, { steps: 6 });
  await page.mouse.up();
  const vista2 = await page.evaluate(() => ({ cx: VIEW.cx, cy: VIEW.cy, z: VIEW.z }));
  check('arrastrar mueve la vista', Math.abs(vista2.cx - vista1.cx) > 1e-9);
  await page.click('#fit');
  check('«Encajar» vuelve a centrar la parcela',
    Math.abs((await page.evaluate(() => VIEW.cx)) - vista0.cx) < 1e-7);
  await page.uncheck('#orto');
  check('apagar la ortofoto se dice', /apagada/.test(await page.textContent('#basemapMsg')));
  await page.check('#orto');

  // ── buscador de emplazamiento ──
  // Sin red: el geocodificador no se exige (este banco tiene que correr sin
  // internet), pero la cartera y los presets sí, y la ausencia de red se
  // DECLARA en vez de devolver una lista vacía que se lee como «no existe».
  await page.route('https://geocoding-api.open-meteo.com/**', r => r.abort());
  await page.click('#sitioQ');
  await page.fill('#sitioQ', 'gabes');
  await page.waitForSelector('#sitioRes .it', { timeout: 5000 });
  check('buscar «gabes» (sin acento) encuentra el preset de Túnez',
    /Gabès/.test(await page.textContent('#sitioRes')), await page.textContent('#sitioRes'));
  await page.click('#sitioRes .it');
  check('elegirlo rellena la latitud', Math.abs(+(await page.inputValue('#lat')) - 33.8792) < 1e-3,
    await page.inputValue('#lat'));
  check('y la longitud', Math.abs(+(await page.inputValue('#lon')) - 9.8736) < 1e-3,
    await page.inputValue('#lon'));
  check('y el rótulo deja de decir «manual»', /Gabès/.test(await page.textContent('#sitioSel')),
    await page.textContent('#sitioSel'));
  check('y la parcela se recentra sobre el sitio elegido',
    /33\.8/.test(await page.textContent('#parcelTag')) || (await page.textContent('#parcelTag')).indexOf('ha') > 0);

  // Las funciones puras del buscador, sobre la copia REAL que vive en esta
  // ficha (no la de sim-viento): que un texto que NO son coordenadas no se
  // cuele como un 0,0 en el Golfo de Guinea es lo que separa un buscador de
  // una trampa.
  const puras = await page.evaluate(() => ({
    tunez: normSitio('Túnez') === 'tunez',
    coma: JSON.stringify(parseCoords('41,5763 -0,7981')),
    hemis: JSON.stringify(parseCoords('16.59 S 71.80 W')),
    noCoords: [parseCoords('Ayora'), parseCoords('600x450'), parseCoords(''),
               parseCoords('99999, 1')].every(v => v === null),
    fuera: parseCoords('91, 0') === null,
    orden: filtraSitios(sitiosLocales(), 'valencia ayora').length
         === filtraSitios(sitiosLocales(), 'ayora valencia').length
  }));
  check('normaliza acentos («Túnez» → «tunez»)', puras.tunez);
  check('lee coordenadas con coma decimal', puras.coma === '{"lat":41.5763,"lon":-0.7981}', puras.coma);
  check('lee hemisferios S/W como negativos', puras.hemis === '{"lat":-16.59,"lon":-71.8}', puras.hemis);
  check('un texto que no son coordenadas NO se cuela como 0,0', puras.noCoords);
  check('una latitud imposible se rechaza', puras.fuera);
  check('el filtro no depende del orden de las palabras', puras.orden > 0);

  // Coordenadas pegadas: el camino más corto para quien viene de un DWG
  await page.fill('#sitioQ', '41.5763, -0.7981');
  await page.waitForSelector('#sitioRes .gr', { timeout: 5000 });
  check('unas coordenadas pegadas salen como opción propia',
    /Coordenadas/.test(await page.textContent('#sitioRes')));
  await page.click('#sitioRes .it');
  check('y se aplican', Math.abs(+(await page.inputValue('#lat')) - 41.5763) < 1e-3);

  // Sin red, el buscador lo dice en vez de quedarse mudo
  await page.fill('#sitioQ', 'reikiavik');
  // Esperar al estado FINAL, no al «Buscando…» intermedio (350 ms de pausa
  // antes de llamar, más el fallo de red).
  await page.waitForFunction(() => /Sin red|no encuentra nada/.test(
    document.querySelector('#sitioRes').textContent), null, { timeout: 10000 });
  check('sin red para el geocodificador, se DICE en el desplegable',
    /Sin red/.test(await page.textContent('#sitioRes')), await page.textContent('#sitioRes'));
  await page.keyboard.press('Escape');

  // Tocar lat a mano suelta el nombre: decir «Gabès» sobre otras coordenadas
  // sería ponerle nombre de planta a otro emplazamiento
  await page.fill('#sitioQ', 'ayora');
  await page.waitForSelector('#sitioRes .it', { timeout: 5000 });
  await page.click('#sitioRes .it');
  check('elegir Ayora deja su nombre puesto', /Ayora/.test(await page.textContent('#sitioSel')));
  await page.fill('#lat', '40.0000');
  await page.dispatchEvent('#lat', 'input');
  check('cambiar la latitud a mano suelta el nombre del sitio',
    (await page.textContent('#sitioSel')).trim() === 'manual', await page.textContent('#sitioSel'));

  // ── rectángulo por cotas ──
  await generar(page);
  const mesas = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  check('genera con el rectángulo por defecto (' + mesas + ' mesas)', mesas > 500);
  check('y lo PINTA en el lienzo', await pintado(page) > 20000);
  check('el pie cuenta filas, pitch y huso UTM',
    /\d+ filas · pitch .* · setback .* · UTM \d+/.test(await page.textContent('#foot')));
  check('las salidas se habilitan al haber layout',
    await page.evaluate(() => ['expGeo', 'expDxf', 'expKml', 'd3Btn'].every(i => !document.getElementById(i).disabled)));

  // ── el pitch manda: más pitch, menos filas ──
  const filas1 = num(await page.textContent('#ro .ro:nth-child(4) .v'));
  await page.fill('#pitch', '9'); await generar(page);
  const filas2 = num(await page.textContent('#ro .ro:nth-child(4) .v'));
  check('subir el pitch de 6 a 9 m quita filas (' + filas1 + ' → ' + filas2 + ')', filas2 < filas1);
  await page.fill('#pitch', '6');

  // ── multi-talla: el reparto se ve ──
  await page.fill('#mods', '28, 14, 7'); await generar(page);
  const reparto = await page.textContent('#sizes');
  check('multi-talla saca la tabla de reparto con más de una talla',
    /Reparto por talla/.test(reparto) && /28/.test(reparto) && /14/.test(reparto), reparto.slice(0, 90));
  await page.fill('#mods', '28');

  // ── montaje fijo: cambia el rótulo y desaparecen los trackers ──
  await page.selectOption('#mount', 'fija'); await generar(page);
  const claves = await page.evaluate(() => [...document.querySelectorAll('#ro .ro .k')].map(e => e.textContent));
  check('en montaje FIJO se rotulan «Estructuras», no mesas ni trackers',
    claves.indexOf('Estructuras') >= 0 && claves.indexOf('Trackers') < 0, claves.join(','));
  check('y el selector monofila/bifila queda inhabilitado (sin motor no hay bifila)',
    await page.evaluate(() => document.querySelector('#bifila').disabled));
  await page.selectOption('#mount', 'tracker');
  await page.fill('#axis', '0');
  await page.dispatchEvent('#axis', 'change');

  // El buscador es lo PRIMERO y no depende del modo: estaba dentro del panel
  // «por cotas» y al elegir «dibujarla sobre el lienzo» desaparecía, justo
  // cuando más falta hace — es lo que te lleva hasta tu finca.
  for (const modo of ['draw', 'geojson', 'rect']) {
    await page.selectOption('#parcelMode', modo);
    check('el buscador sigue a la vista en modo «' + modo + '»',
      await page.isVisible('#sitioQ') && await page.isVisible('#lat') && await page.isVisible('#lon'));
  }
  // Y elegir un sitio en modo dibujo VUELA allí, en vez de reencuadrar sobre
  // una parcela que puede estar a cientos de kilómetros.
  await page.selectOption('#parcelMode', 'draw');
  await page.fill('#sitioQ', 'san jose');
  await page.waitForSelector('#sitioRes .it', { timeout: 5000 });
  await page.click('#sitioRes .it');
  const centro = await page.evaluate(() => ({ lat: u2lat(VIEW.cy), lon: u2lon(VIEW.cx), z: VIEW.z }));
  check('elegir sitio en modo dibujo lleva la vista allí (' + centro.lat.toFixed(2) + ', ' + centro.lon.toFixed(2) + ')',
    Math.abs(centro.lat - (-16.5958)) < 0.05 && Math.abs(centro.lon - (-71.8064)) < 0.05 && centro.z >= 16);
  check('y en modo dibujo sin dibujar nada se dice de dónde sale la parcela',
    /del rectángulo por cotas/.test(await page.textContent('#parcelTag')),
    await page.textContent('#parcelTag'));
  await page.selectOption('#parcelMode', 'rect');

  // ── parcela por GeoJSON ──
  await page.selectOption('#parcelMode', 'geojson');
  await page.fill('#geotxt', GEOJSON_PRUEBA);
  await page.click('#geoApplyBtn');
  check('el GeoJSON pegado se reconoce y da su superficie',
    /vértices · [\d,.]+ ha/.test(await page.textContent('#parcelTag')), await page.textContent('#parcelTag'));
  await generar(page);
  check('y genera sobre esa parcela', num(await page.textContent('#ro .ro:nth-child(2) .v')) > 500);

  // ── un GeoJSON roto se dice, no se traga ──
  await page.fill('#geotxt', '{ esto no es geojson');
  await page.click('#geoApplyBtn');
  check('un GeoJSON inválido sale por pantalla', /No se pudo leer/.test(await page.textContent('#foot')));

  // ── parcela dibujada a mano ──
  await page.selectOption('#parcelMode', 'draw');
  await page.click('#drawStart');
  const caja = await cajaLienzo(page);
  for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]])
    await page.mouse.click(caja.x + caja.w * fx, caja.y + caja.h * fy);
  await page.mouse.dblclick(caja.x + caja.w * 0.25, caja.y + caja.h * 0.75);
  check('la parcela dibujada se cierra con cuatro vértices (el doble clic no los duplica)',
    /^4 vértices/.test(await page.textContent('#parcelTag')), await page.textContent('#parcelTag'));
  // La regresión que se veía en producción: con el primer vértice el encuadre se
  // recalculaba sobre una caja de tamaño CERO, y la parcela salía de «0,00 ha»
  // con una escala de milímetros. La vista ya no se reencuadra al dibujar.
  check('la parcela dibujada tiene superficie de verdad, no 0,00 ha',
    !/ 0[.,]00 ha/.test(await page.textContent('#parcelTag')), await page.textContent('#parcelTag'));
  await generar(page);
  check('y también genera sobre ella', num(await page.textContent('#ro .ro:nth-child(2) .v')) > 0);

  // ── exclusiones dibujadas (§02.5c) ──
  // Lo que se exige no es que se dibujen, sino que el motor las OBEDEZCA: una
  // exclusión que se pinta pero no quita mesas es peor que no tenerla, porque
  // se lee como que el hueco está respetado.
  await page.selectOption('#parcelMode', 'rect');
  await page.fill('#prot', '0'); await page.dispatchEvent('#prot', 'change');
  await generar(page);
  const mesasSinExcl = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  const cajaEx = await cajaLienzo(page);
  await page.click('#exclStart');
  for (const [fx, fy] of [[0.38, 0.38], [0.62, 0.38], [0.62, 0.62], [0.38, 0.62]])
    await page.mouse.click(cajaEx.x + cajaEx.w * fx, cajaEx.y + cajaEx.h * fy);
  await page.mouse.dblclick(cajaEx.x + cajaEx.w * 0.38, cajaEx.y + cajaEx.h * 0.62);
  check('la exclusión dibujada se cuenta en la parcela',
    /1 exclusión/.test(await page.textContent('#parcelTag')), await page.textContent('#parcelTag'));
  await generar(page);
  const mesasConExcl = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  check('y el motor la OBEDECE: quita mesas (' + mesasSinExcl + ' → ' + mesasConExcl + ')',
    mesasConExcl < mesasSinExcl && mesasConExcl > 0);
  await page.click('#exclClear');
  check('el encuadre no arrastra el boceto anterior (la exclusión cae DENTRO de la parcela)',
    await page.evaluate(() => {
      const e = EXCL[0] || [], p = PARCEL || [];
      const x = e.map(q => q[0]), y = e.map(q => q[1]);
      const px_ = p.map(q => q[0]), py = p.map(q => q[1]);
      return Math.min(...x) >= Math.min(...px_) && Math.max(...x) <= Math.max(...px_) &&
             Math.min(...y) >= Math.min(...py) && Math.max(...y) <= Math.max(...py);
    }));
  check('quitarlas las borra del recuento',
    !/exclusión/.test(await page.textContent('#parcelTag')), await page.textContent('#parcelTag'));
  await generar(page);
  check('y el layout vuelve a lo que era',
    num(await page.textContent('#ro .ro:nth-child(2) .v')) === mesasSinExcl);

  // ── exclusión de LÍNEA con buffer ──
  await page.click('#lineStart');
  await page.fill('#lineBuf', '25');
  const cajaL = await cajaLienzo(page);
  await page.mouse.click(cajaL.x + cajaL.w * 0.25, cajaL.y + cajaL.h * 0.30);
  await page.mouse.click(cajaL.x + cajaL.w * 0.75, cajaL.y + cajaL.h * 0.70);
  await page.mouse.dblclick(cajaL.x + cajaL.w * 0.75, cajaL.y + cajaL.h * 0.70);
  check('una exclusión de línea se cuenta (dos puntos bastan: no es un polígono)',
    await page.evaluate(() => EXCL_LINEAS.length === 1 && EXCL_LINEAS[0].pts.length >= 2),
    JSON.stringify(await page.evaluate(() => EXCL_LINEAS.map(L => L.pts.length))));
  await generar(page);
  const mesasLinea = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  check('y el motor la obedece con su buffer (' + mesasSinExcl + ' → ' + mesasLinea + ')',
    mesasLinea < mesasSinExcl && mesasLinea > 0);
  check('el desglose por fuente cuenta la línea aparte',
    await page.evaluate(() => RES.stats.drop_line_buffer > 0 && RES.stats.drop_area_line_m2 > 0));
  await page.click('#exclClear');
  await generar(page);

  // ── bifila: si es bifila, es bifila ──
  // El invariante que costó arreglar en el cuaderno: la sub-fila B es el ESPEJO
  // de la A, no una colocación independiente. Sin eso, en multi-talla y en borde
  // irregular las X difieren, el emparejado no casa y el campo sale lleno de
  // mesas sueltas con pinta de monofila.
  await page.fill('#prot', '35'); await page.dispatchEvent('#prot', 'change');
  await page.fill('#mods', '28, 14, 7');
  await page.selectOption('#bifila', '1');
  await generar(page);
  const inv = await page.evaluate(() => {
    let pares = 0, malos = 0, dxmax = 0;
    for (let i = 0; i + 1 < RES.rows.length; i += 2) {
      const A = RES.rows[i], B = RES.rows[i + 1]; pares++;
      if (A.length !== B.length) { malos++; continue; }
      const xa = A.map(t => (t.x0 + t.x1) / 2).sort((p, q) => p - q);
      const xb = B.map(t => (t.x0 + t.x1) / 2).sort((p, q) => p - q);
      for (let k = 0; k < xa.length; k++) dxmax = Math.max(dxmax, Math.abs(xa[k] - xb[k]));
    }
    return { pares, malos, dxmax };
  });
  check('bifila multi-talla en parcela girada: ningún par descuadrado (' + inv.pares + ' pares)',
    inv.malos === 0 && inv.pares > 5, JSON.stringify(inv));
  check('y las sub-filas A y B comparten X exactamente (Δx = 0)', inv.dxmax < 1e-9, String(inv.dxmax));
  check('toda línea sigue con conteo PAR de mesas',
    await page.evaluate(() => RES.rows.every(r => r.length % 2 === 0)));

  // ── el eje de transmisión se DIBUJA ──
  await page.check('#showAxis');
  await page.waitForTimeout(200);
  const ejes = await page.evaluate(() => {
    // Se cuentan los segmentos que la ficha pinta como eje: mismo criterio que
    // el dibujo, sobre los datos que tiene delante.
    if (!RES.stats.bifila || !RES.rows.length) return 0;
    let n = 0;
    for (let i = 0; i + 1 < RES.rows.length; i += 2)
      n += Math.min(RES.rows[i].length, RES.rows[i + 1].length);
    return n;
  });
  check('con bifila hay ejes de transmisión que dibujar (' + ejes + ')', ejes > 50);
  check('y el lienzo los pinta (más píxeles con el eje que sin él)',
    await page.evaluate(async () => {
      const cuenta = () => { const c = document.querySelector('#cv');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 130 && d[i + 2] < 90) n++;
        return n; };
      document.querySelector('#showAxis').checked = false; draw(); const sin = cuenta();
      document.querySelector('#showAxis').checked = true;  draw(); const con = cuenta();
      return con > sin + 200;
    }));
  await page.uncheck('#showAxis');
  await page.fill('#prot', '0'); await page.dispatchEvent('#prot', 'change');
  await page.fill('#mods', '28');

  // ── el 3D recibe lo MISMO que se ve en 2D ──
  await page.fill('#mods', '28, 14, 7');
  await generar(page);
  const RES_mesas = await page.evaluate(() => RES.stats.structures);
  const alViewer = await page.evaluate(() => {
    document.querySelector('#d3Btn').click();
    return JSON.parse(localStorage.getItem('cobertura_layout') || '{}');
  });
  check('el 3D recibe la geometría de mesa (ancho, largo, gaps, pitch)',
    alViewer.mesa && alViewer.mesa.modW > 0 && alViewer.mesa.pasoFila > 0 &&
    alViewer.mesa.gapDrive != null, JSON.stringify(alViewer.mesa || {}).slice(0, 120));
  check('con UN TIPO POR TALLA y su largo real, no una talla global',
    Object.keys(alViewer.mesa.tipos || {}).length > 1,
    JSON.stringify(alViewer.mesa && alViewer.mesa.tipos));
  check('y cada tracker con su mods, su razón de largo y su tipo',
    (alViewer.trackers || []).every(t => t.mods > 0 && t.mr > 0 && t.mr <= 1 && t.blk && t.t) &&
    alViewer.trackers.some(t => t.mr < 0.999),
    JSON.stringify((alViewer.trackers || [])[0]));
  check('los trackers del 3D son PAREJAS de mesas (la mitad que en 2D, ±10 %)',
    Math.abs(alViewer.trackers.length - RES_mesas / 2) < RES_mesas * 0.1,
    alViewer.trackers.length + ' vs ' + (RES_mesas / 2));
  await page.fill('#mods', '28');

  // ── render, descartadas y eje bifila ──
  await page.selectOption('#render', 'line');
  await page.waitForTimeout(150);
  check('el render de líneas sigue pintando', await pintado(page) > 3000);
  await page.selectOption('#render', 'poly');
  await page.check('#showDisc'); await page.check('#showAxis');
  await page.waitForTimeout(150);
  check('con descartadas y eje bifila activados no revienta nada',
    await pintado(page) > 20000);
  await page.uncheck('#showDisc'); await page.uncheck('#showAxis');

  // ── forzar strings completos ──
  await abreAvanzados(page);
  await page.fill('#mods', '28, 14, 7');
  await generar(page);
  const multiTodo = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  await page.check('#forceComplete');
  await generar(page);
  const multiCompletos = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  check('forzar strings completos quita las tallas cortas (' + multiTodo + ' → ' + multiCompletos + ')',
    multiCompletos < multiTodo && multiCompletos > 0);
  check('y solo queda la talla principal',
    await page.evaluate(() => Object.keys(RES.stats.by_size || {}).length === 1),
    JSON.stringify(await page.evaluate(() => RES.stats.by_size)));
  await page.uncheck('#forceComplete');
  await page.fill('#mods', '28');

  // ── barrido de orientación ──
  await page.check('#optGrid');
  await page.fill('#gridFrom', '0'); await page.fill('#gridTo', '90'); await page.fill('#gridStep', '30');
  await page.evaluate(() => { document.querySelector('#hint').textContent = ''; });
  await page.click('#genBtn');
  await page.waitForFunction(() => /barrido/.test(document.querySelector('#hint').textContent),
    null, { timeout: 60000 });
  check('el barrido corre y dice cuánto ha tardado',
    /barrido \d/.test(await page.textContent('#hint')), await page.textContent('#hint'));
  check('y deja el azimut ganador escrito en el formulario',
    await page.evaluate(() => Math.abs(+document.querySelector('#panelAz').value - RES.stats.grid_angle_deg) < 1));
  check('con la traza de todos los ángulos probados',
    await page.evaluate(() => (RES.stats.sweep || []).length === 3),
    JSON.stringify(await page.evaluate(() => (RES.stats.sweep || []).map(x => x.az))));
  await page.uncheck('#optGrid');

  // ── MDT: elevación, pendientes medidas y filtro por pendiente ──
  // El servicio de elevación se simula: el banco no puede depender de Open-Meteo
  // ni de que haya red. Lo que se prueba es que la ficha lo pide, mide las
  // pendientes, EXCLUYE por pendiente máxima y lo cuenta como fuente propia.
  // Terreno sintético DETERMINISTA, en coordenadas absolutas: llano en el sur y
  // subiendo hacia el este cada vez más según se va al norte, hasta ~10°.
  // (Normalizarlo por lote sería otra cosa en cada llamada: la malla saldría
  // troceada y las pendientes, absurdas.)
  const LAT0 = 41.57634, LON0 = -0.79814;
  const K = 14700;                       // m por grado de longitud ≈ tan(10°)·mLon
  const zSint = (lat, lon) => {
    const t = Math.max(0, Math.min(1, (lat - (LAT0 - 0.002)) / 0.004));
    return 100 + K * (lon - LON0) * t;
  };
  // PNG terrarium 16×16 con la cota subiendo hacia el este: z = R·256+G+B/256−32768
  const PNG_TERRENO = (() => {
    const zlib = require('zlib'), W = 16, H = 16;
    const cruda = Buffer.alloc(H * (1 + W * 3));
    for (let y = 0; y < H; y++) {
      const fila = y * (1 + W * 3); cruda[fila] = 0;
      for (let x = 0; x < W; x++) {
        const z = 100 + 300 * (x / (W - 1)) + 32768;      // 100 m a 400 m de oeste a este
        const R = Math.floor(z / 256), G = Math.floor(z % 256), B = Math.round((z % 1) * 256) % 256;
        const o = fila + 1 + x * 3; cruda[o] = R; cruda[o + 1] = G; cruda[o + 2] = B;
      }
    }
    const crc = b => { let c = ~0; for (const v of b) { c ^= v;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
    const chunk = (tipo, datos) => { const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
      const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
      const c = Buffer.alloc(4); c.writeUInt32BE(crc(cuerpo));
      return Buffer.concat([len, cuerpo, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8 bits, RGB
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(cruda)), chunk('IEND', Buffer.alloc(0))]);
  })();
  let peticionesDem = 0;
  await page.route('https://api.open-meteo.com/v1/elevation**', r => {
    peticionesDem++;
    const u = new URL(r.request().url());
    const lats = u.searchParams.get('latitude').split(',').map(Number);
    const lons = u.searchParams.get('longitude').split(',').map(Number);
    r.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ elevation: lats.map((la, i) => zSint(la, lons[i])) }) });
  });
  // El terreno sintético está escrito alrededor de El Burgo, así que la parcela
  // tiene que estar ahí: los pasos anteriores dejaron el emplazamiento en San
  // José (Perú) y el mock habría devuelto un llano perfecto.
  // Teselas de terreno (la fuente por defecto): la cota va CODIFICADA EN EL
  // COLOR, así que una imagen son 65.536 cotas en una petición. Se sirve un PNG
  // sintético con la misma rampa que el mock de Open-Meteo.
  let teselasTerreno = 0;
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/**', async r => {
    teselasTerreno++;
    // 256×256 con z creciendo hacia el este, codificado terrarium
    const { createCanvas } = {};   // sin dependencias: se compone el PNG a mano abajo
    r.fulfill({ status: 200, contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' }, body: PNG_TERRENO });
  });
  await page.selectOption('#parcelMode', 'rect');
  await page.fill('#lat', String(LAT0)); await page.dispatchEvent('#lat', 'change');
  await page.fill('#lon', String(LON0)); await page.dispatchEvent('#lon', 'change');
  await generar(page);
  const mesasSinMdt = num(await page.textContent('#ro .ro:nth-child(2) .v'));

  // Primero la fuente por defecto, contando las peticiones: son 1-4, no 24.
  await page.fill('#demN', '12');
  await page.click('#demBtn');
  await page.waitForFunction(() => /malla|No se pud/.test(document.querySelector('#demTag').textContent),
    null, { timeout: 30000 });
  check('las teselas de terreno resuelven el MDT en pocas llamadas (' + teselasTerreno + ')',
    teselasTerreno > 0 && teselasTerreno <= 9, String(teselasTerreno));
  check('y el rótulo dice de dónde sale',
    /Teselas de terreno/.test(await page.textContent('#demTag')), await page.textContent('#demTag'));
  check('con cotas decodificadas del color, no ceros',
    await page.evaluate(() => DEM && DEM.z.flat().some(v => Math.abs(v) > 1)));

  // La CASCADA, que es el patrón de sources_for_country: si la primera fuente
  // cae, prueba la siguiente y DICE cuál ha servido. Se tumba la de teselas a
  // propósito y tiene que salir adelante con Open Topo Data.
  await page.evaluate(() => { DEM = null; });
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/**', r => r.abort());
  let otdLlamadas = 0;
  await page.route('https://api.opentopodata.org/**', r => {
    otdLlamadas++;
    const u = new URL(r.request().url());
    const loc = u.searchParams.get('locations').split('|').map(p => p.split(',').map(Number));
    r.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ results: loc.map(([la, lo]) => ({ elevation: zSint(la, lo) })) }) });
  });
  await page.selectOption('#demSrc', 'auto');
  await page.fill('#demN', '12');
  await page.click('#demBtn');
  await page.waitForFunction(() => /malla|Ninguna fuente/.test(document.querySelector('#demTag').textContent),
    null, { timeout: 40000 });
  check('la cascada cae a la fuente siguiente cuando la primera falla',
    otdLlamadas > 0 && /Open Topo Data/.test(await page.textContent('#demTag')),
    await page.textContent('#demTag'));
  check('y el MDT queda montado igual',
    await page.evaluate(() => !!DEM && DEM.z.flat().some(v => Math.abs(v) > 1)));
  // Con todas caídas, lo dice en vez de quedarse a medias
  await page.route('https://api.opentopodata.org/**', r => r.abort());
  await page.route('https://api.open-elevation.com/**', r => r.abort());
  await page.route('https://api.open-meteo.com/v1/elevation**', r => r.abort());
  await page.evaluate(() => { DEM = null; _demCache = {}; });
  await page.click('#demBtn');
  await page.waitForFunction(() => /Ninguna fuente/.test(document.querySelector('#demTag').textContent),
    null, { timeout: 60000 });
  check('con todas las fuentes caídas se DICE, con el porqué de cada una',
    /Ninguna fuente/.test(await page.textContent('#demTag')) &&
    /Open Topo Data/.test(await page.textContent('#demTag')));
  // Restaurar para lo que viene
  await page.unroute('https://api.open-meteo.com/v1/elevation**');
  await page.route('https://api.open-meteo.com/v1/elevation**', r => {
    peticionesDem++;
    const u = new URL(r.request().url());
    const lats = u.searchParams.get('latitude').split(',').map(Number);
    const lons = u.searchParams.get('longitude').split(',').map(Number);
    r.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ elevation: lats.map((la, i) => zSint(la, lons[i])) }) });
  });

  // Y ahora la otra fuente, punto a punto
  await page.selectOption('#demSrc', 'openmeteo');
  await page.click('#demBtn');
  await page.waitForFunction(() => /malla|No se pudo/.test(document.querySelector('#demTag').textContent),
    null, { timeout: 30000 });
  check('pide la elevación por lotes', peticionesDem > 0, String(peticionesDem));
  check('y monta la malla', /malla 12×12/.test(await page.textContent('#demTag')),
    await page.textContent('#demTag'));
  check('mide las pendientes y las escribe arriba',
    Math.abs(+(await page.inputValue('#slopeEw'))) > 0.5, await page.inputValue('#slopeEw'));
  check('las pendientes pasan a ser del MDT y dejan de ser editables',
    await page.evaluate(() => document.querySelector('#slopeEw').disabled));
  // Un límite que RECORTE sin vaciar: el plano sintético sube 400 m en el bbox,
  // así que con 1° no quedaría ni una mesa y no se estaría midiendo el filtro,
  // se estaría midiendo el caso vacío (que se prueba aparte, más abajo).
  await page.fill('#slopeMax', '6');
  await page.dispatchEvent('#slopeMax', 'change');
  await page.waitForTimeout(200);
  check('bajar la pendiente máxima marca celdas fuera',
    /[1-9]\d* celda/.test(await page.textContent('#demTag')), await page.textContent('#demTag'));
  await generar(page);
  const mesasConMdt = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  check('y el filtro de pendiente QUITA mesas, sin vaciar el campo (' + mesasSinMdt + ' → ' + mesasConMdt + ')',
    mesasConMdt < mesasSinMdt && mesasConMdt > 0);
  check('contadas como fuente «topo», aparte de las tuyas',
    await page.evaluate(() => RES.stats.drop_topo_mask > 0 && RES.stats.n_excl_topo > 0));
  check('y si se lleva más de un tercio de la parcela, se avisa',
    await page.evaluate(() => (RES.avisos || []).some(a => a.codigo === 'mdt_excluye_demasiado')) ||
    await page.evaluate(() => (RES.stats.mdt_excl_frac || 0) <= 0.35));
  // Y el caso límite: una pendiente máxima imposible deja el campo vacío y la
  // ficha lo DICE, en vez de quedarse en blanco sin explicación.
  await page.fill('#slopeMax', '0.2'); await page.dispatchEvent('#slopeMax', 'change');
  await generar(page);
  check('una pendiente máxima imposible deja el layout vacío y se dice',
    /No cabe ninguna estructura|área útil queda vacía/.test(await page.textContent('#foot')) ||
    await page.evaluate(() => !!document.querySelector('.aviso.fail')),
    await page.textContent('#foot'));
  await page.fill('#slopeMax', '6'); await page.dispatchEvent('#slopeMax', 'change');
  await generar(page);
  await page.check('#demOff');
  await page.dispatchEvent('#demOff', 'change');
  await generar(page);
  check('desactivar el filtro devuelve el layout entero',
    num(await page.textContent('#ro .ro:nth-child(2) .v')) === mesasSinMdt);
  await page.uncheck('#demOff'); await page.uncheck('#demUse');
  await page.dispatchEvent('#demUse', 'change');
  check('desmarcar «usar las del MDT» devuelve las pendientes a mano',
    !(await page.evaluate(() => document.querySelector('#slopeEw').disabled)));
  await page.check('#demOff'); await page.dispatchEvent('#demOff', 'change');

  // ── varias parcelas ──
  // Cada recinto va por su cuenta al motor: implantar sobre la unión daría filas
  // cruzando el hueco entre parcelas, que es justo lo que no existe.
  await page.selectOption('#parcelMode', 'rect');
  await page.fill('#pw', '400'); await page.dispatchEvent('#pw', 'change');
  await page.fill('#ph', '300'); await page.dispatchEvent('#ph', 'change');
  await generar(page);
  const unaSola = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  await page.fill('#parcelName', 'Recinto norte');
  await page.click('#parcelAdd');
  check('la parcela añadida aparece en la lista con su nombre y superficie',
    /Recinto norte/.test(await page.textContent('#parcelList')) &&
    /ha/.test(await page.textContent('#parcelList')));
  // Segunda parcela, desplazada al norte para que no se solapen
  await page.fill('#lat', String(LAT0 + 0.006)); await page.dispatchEvent('#lat', 'change');
  await generar(page);
  const dos = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  check('con dos parcelas el layout suma (' + unaSola + ' → ' + dos + ')',
    dos > unaSola * 1.6, unaSola + ' vs ' + dos);
  check('y el pie las cuenta', /2 parcelas/.test(await page.textContent('#foot')),
    await page.textContent('#foot'));
  check('con su reparto por parcela en la tabla',
    /Reparto por parcela/.test(await page.textContent('#sizes')));
  await page.evaluate(() => { PARCELAS = []; pintaParcelas(); });
  await page.fill('#lat', String(LAT0)); await page.dispatchEvent('#lat', 'change');
  await page.fill('#pw', '600'); await page.dispatchEvent('#pw', 'change');
  await page.fill('#ph', '450'); await page.dispatchEvent('#ph', 'change');

  // ── importar KML ──
  const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>Finca A</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
-0.8035,41.5743,0 -0.7928,41.5743,0 -0.7928,41.5784,0 -0.8035,41.5784,0 -0.8035,41.5743,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><name>Finca B</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
-0.7900,41.5743,0 -0.7850,41.5743,0 -0.7850,41.5784,0 -0.7900,41.5784,0 -0.7900,41.5743,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Document></kml>`;
  await page.setInputFiles('#kmlFile', { name: 'fincas.kml', mimeType: 'application/vnd.google-earth.kml+xml',
                                          buffer: Buffer.from(KML) });
  await page.waitForFunction(() => /Importado|No se pudo/.test(document.querySelector('#foot').textContent),
    null, { timeout: 8000 });
  check('el KML se importa', /Importado/.test(await page.textContent('#foot')),
    await page.textContent('#foot'));
  check('y sus DOS polígonos son dos parcelas, no uno tirado a la basura',
    /Finca B/.test(await page.textContent('#parcelList')), await page.textContent('#parcelList'));
  await generar(page);
  check('y genera sobre las dos', num(await page.textContent('#ro .ro:nth-child(2) .v')) > 100);
  // Un KML roto se dice
  await page.setInputFiles('#kmlFile', { name: 'roto.kml', mimeType: 'text/plain',
                                          buffer: Buffer.from('esto no es kml') });
  await page.waitForFunction(() => /No se pudo leer el KML/.test(document.querySelector('#foot').textContent),
    null, { timeout: 8000 });
  check('un KML roto se dice, no se traga', true);
  await page.evaluate(() => { PARCELAS = []; pintaParcelas(); });
  await page.selectOption('#parcelMode', 'rect');
  await page.fill('#lat', String(LAT0)); await page.dispatchEvent('#lat', 'change');

  // ── civil & exports (§02.5g) ──
  // Lo que se comprueba es el CONTENIDO de los ficheros, no que el botón exista:
  // un CSV de hincas con las columnas bien y cero filas se lee como que no hay
  // nada que replantear.
  await generar(page);
  const bajado = async id => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#' + id)]);
    const st = await dl.createReadStream();
    let txt = ''; for await (const c of st) txt += c;
    return { nombre: dl.suggestedFilename(), txt };
  };
  const hincas = await bajado('expHincas');
  const filasH = hincas.txt.trim().split('\n');
  check('las hincas salen con su cabecera canónica',
    filasH[0] === 'estructura;hinca;lat;lon;cadena_m;z', filasH[0]);
  check('y con hincas de verdad (' + (filasH.length - 1) + ')', filasH.length > 100);
  check('equiespaciadas incluyendo los dos extremos',
    filasH[1].split(';')[4] === '0', filasH[1]);
  const boq = await bajado('expBoq');
  check('las mediciones traen potencia, módulos, mesas e hincas',
    /Potencia pico/.test(boq.txt) && /Hincas/.test(boq.txt) && /Tubo de par/.test(boq.txt));
  const dae = await bajado('expDae');
  check('el COLLADA es XML con su malla',
    /<COLLADA/.test(dae.txt) && /<triangles count="\d+"/.test(dae.txt) && /\.dae$/.test(dae.nombre));
  // El XYZ de PVsyst es TERRENO, no layout: con MDT exporta puntos; sin MDT
  // tiene que NEGARSE y decir por qué, en vez de escribir un plano a cota 0 que
  // se leería como que el terreno es llano.
  const xyz = await bajado('expXyz');
  check('el XYZ de PVsyst sale en X;Y;Z metros locales',
    xyz.txt.split('\n')[0] === 'X;Y;Z' && xyz.txt.trim().split('\n').length > 100,
    xyz.txt.split('\n')[0]);
  await page.evaluate(() => { window._demGuardado = DEM; DEM = null; });
  await page.click('#expXyz');
  check('sin MDT se niega y explica por qué',
    /descarga antes el MDT/.test(await page.textContent('#foot')), await page.textContent('#foot'));
  await page.evaluate(() => { DEM = window._demGuardado; });
  // Pitch por banda
  await page.click('#btnPitchBanda');
  check('el pitch por banda saca su tabla',
    /Pitch requerido por banda/.test(await page.textContent('#sizes')));
  check('con el pitch en llano calculado con la fórmula del core',
    await page.evaluate(() => {
      const R = pitchPorBanda(), c = apertura(), th = (+document.querySelector('#maxAng').value) * Math.PI / 180;
      const esperado = c * Math.cos(th) + c * Math.sin(th) / Math.tan(15 * Math.PI / 180);
      return Math.abs(R.llano - esperado) < 1e-9;
    }));
  check('y una pendiente en contra pide MÁS pitch que en llano',
    await page.evaluate(() => {
      const R = pitchPorBanda();
      return R.bandas.every(b => !isFinite(b.pitch_req) || b.pitch_req >= R.llano - 1e-9);
    }));

  // ── checklist antes de congelar (§02.5i) ──
  await page.click('#btnChecklist');
  const chk = await page.textContent('#sizes');
  check('el checklist saca los ocho puntos del cuaderno', /Checklist antes de congelar/.test(chk));
  check('marca solo lo que la ficha SABE (los demás quedan como «mirar fuera»)',
    /de los que esta ficha sabe/.test(chk) && /§08\.R1/.test(chk));
  check('y no deja marcar a mano: son casillas calculadas',
    await page.evaluate(() => document.querySelectorAll('#sizes input').length === 0));

  // ── pitch imposible: la ficha lo canta ──
  await page.selectOption('#parcelMode', 'rect');
  await page.fill('#pitch', '1.2'); await generar(page);
  check('un pitch menor que la apertura sale como aviso de FALLO',
    await page.evaluate(() => !!document.querySelector('.aviso.fail')));

  check('ningún error de JavaScript en toda la sesión', !fallos.length, fallos.join(' | '));

  // ── la ortofoto, cuando el servidor NO manda cabecera CORS ──
  // Es el caso que deja al usuario sin fondo: con `crossOrigin` puesto, una
  // respuesta sin CORS no es una imagen que se ve mal, es una imagen que NO
  // CARGA. La ficha tiene que reintentar sin él y enseñarla igual.
  // No se puede simular «respuesta sin ACAO» desde aquí (el enrutador de
  // Playwright añade CORS por su cuenta), así que se fuerza el MISMO efecto que
  // ve el navegador cuando falta la cabecera: el primer intento de cada tesela
  // falla, y solo el reintento —el que va sin `crossOrigin`— llega a cargar.
  const pag2 = await browser.newPage();
  const vistas = new Set();
  await pag2.route('https://server.arcgisonline.com/**', r => {
    const u = r.request().url();
    if (!vistas.has(u)) { vistas.add(u); r.abort(); return; }
    r.fulfill({ status: 200, contentType: 'image/png', body: TESELA });
  });
  await pag2.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });
  await pag2.waitForFunction(() => /Esri World Imagery|sin ortofoto/.test(
    document.querySelector('#basemapMsg').textContent), null, { timeout: 15000 });
  check('si el primer intento falla, el reintento SIN CORS trae la imagen igual',
    /Esri World Imagery/.test(await pag2.textContent('#basemapMsg')),
    await pag2.textContent('#basemapMsg'));
  check('y se declara que el lienzo ha quedado teñido',
    (await pag2.evaluate(() => LIENZO_TENIDO)) === true &&
    /sin CORS/.test(await pag2.textContent('#basemapMsg')),
    await pag2.textContent('#basemapMsg'));
  await pag2.close();

  // ── y cuando no hay teselas de ninguna manera ──
  const pag3 = await browser.newPage();
  await pag3.route('https://server.arcgisonline.com/**', r => r.abort());
  await pag3.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });
  await pag3.waitForFunction(() => /sin ortofoto/.test(
    document.querySelector('#basemapMsg').textContent), null, { timeout: 15000 });
  check('sin ortofoto se DICE y se cae a la retícula',
    /retícula de 50 m/.test(await pag3.textContent('#basemapMsg')),
    await pag3.textContent('#basemapMsg'));
  await pag3.close();

  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
  process.exit(ko ? 1 : 0);
})();
