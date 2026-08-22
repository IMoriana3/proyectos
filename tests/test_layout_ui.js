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
  // «El tracker se define arriba, no podemos poner arriba lo de 1V y abajo el
  // pitch»: el pitch (que fija el GCR derivado de esta tarjeta), el GCR
  // objetivo y el tipo de tracker viven CON la estructura; en Implantación
  // quedan setback, azimuts y modo.
  // «¿Dónde está lo de alinear a rejilla?» — estaba plegada en avanzados,
  // siendo la palanca que cambia el campo un tercio y a la que mandan los dos
  // avisos del motor. Tiene que verse SIN abrir nada.
  check('«Alinear a rejilla» está A LA VISTA (sin abrir avanzados)',
    await page.evaluate(() => {
      const el = document.querySelector('#alignGrid');
      const r = el.getBoundingClientRect();
      return !el.closest('details') && r.width > 0 && r.height > 0;
    }));
  check('pitch, GCR objetivo y tipo de tracker viven en la tarjeta de ESTRUCTURA',
    await page.evaluate(() => {
      const card = sel => document.querySelector(sel).closest('.card');
      return card('#pitch') === card('#mount') && card('#gcrObj') === card('#mount') &&
             card('#bifila') === card('#mount') && card('#setback') !== card('#mount');
    }));
  // MESA y FILA no son lo mismo: una mesa es UN string y una fila de tracker
  // son DOS mesas + motor. La casilla decía «Mód./fila: 28» para un 1V/28 —
  // el string, no la fila (56) — y con multi-talla solo enseñaba la primera.
  check('los derivados separan Mód./mesa (28) de Mód./fila (56)',
    /Mód\.\/mesa[\s\S]*28[\s\S]*Mód\.\/fila[\s\S]*56/.test(await page.textContent('#deriv')),
    (await page.textContent('#deriv')).replace(/\s+/g, ' '));
  await page.fill('#mods', '28, 14, 7'); await page.dispatchEvent('#mods', 'input');
  check('y con multi-talla enseñan TODAS las tallas (56·28·14)',
    /56·28·14/.test(await page.textContent('#deriv')),
    (await page.textContent('#deriv')).replace(/\s+/g, ' '));
  await page.selectOption('#mount', 'fija');
  check('en fija el rótulo es Mód./estructura (no hay fila de dos mesas)',
    /Mód\.\/estructura/.test(await page.textContent('#deriv')) &&
    !/Mód\.\/fila/.test(await page.textContent('#deriv')));
  await page.selectOption('#mount', 'tracker');
  await page.fill('#axis', '0'); await page.dispatchEvent('#axis', 'change');
  await page.fill('#mods', '28'); await page.dispatchEvent('#mods', 'input');

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
  // Pausa MAYOR que el debounce del autoguardado (800 ms): pegar y pulsar en el
  // mismo instante hacía que el guardado diferido del `input` cazara el estado
  // YA aplicado y el test no midiera el botón — un usuario pega, mira, y pulsa.
  await page.waitForTimeout(1000);
  await page.click('#geoApplyBtn');
  check('el GeoJSON pegado se reconoce y da su superficie',
    /vértices · [\d,.]+ ha/.test(await page.textContent('#parcelTag')), await page.textContent('#parcelTag'));
  // Lo que se mide es el COMPORTAMIENTO: pegar un GeoJSON y aplicarlo tiene que
  // acabar en la sesión sin pasar por Generar. Lo garantizan DOS mecanismos
  // (el blur del textarea al pulsar dispara `change`, y applyGeo llama a
  // autoguarda() explícito); el mutante que mata este check quita los dos —
  // quitar solo el explícito lo deja verde por el blur, y está bien que así sea.
  // Se mide ANTES de generar (pintar() también guarda, y taparía el camino) y
  // por CONTENIDO (el lon −0.8035 solo está en el GeoJSON de prueba, no en la
  // parcela por cotas que la sesión ya traía de los pasos anteriores).
  check('y la parcela aplicada queda en la sesión autoguardada sin pasar por Generar',
    await page.waitForFunction(() => {
      try {
        const st = JSON.parse(localStorage.getItem('genlayout_sesion') || 'null');
        return !!(st && st.parcel && st.parcel.some(p => Math.abs(p[0] + 0.8035) < 1e-9));
      } catch (e) { return false; }
    }, null, { timeout: 4000 }).then(() => true).catch(() => false));
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
  check('y el lienzo los pinta (biela ROJA y viga GRIS del canon: más píxeles con la casilla que sin ella)',
    await page.evaluate(async () => {
      // Colores de la página 6 de Streamlit: biela #C0392B, viga #7F8C8D.
      const cuenta = () => { const c = document.querySelector('#cv');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let rojo = 0, gris = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 150 && d[i] < 220 && d[i + 1] < 90 && d[i + 2] < 80) rojo++;
          if (Math.abs(d[i] - 127) < 20 && Math.abs(d[i + 1] - 140) < 20 && Math.abs(d[i + 2] - 141) < 22) gris++;
        }
        return { rojo, gris }; };
      document.querySelector('#showAxis').checked = false; draw(); const sin = cuenta();
      document.querySelector('#showAxis').checked = true;  draw(); const con = cuenta();
      return con.rojo > sin.rojo + 200 && con.gris > sin.gris + 200;
    }));
  await page.uncheck('#showAxis');
  await page.fill('#prot', '0'); await page.dispatchEvent('#prot', 'change');
  await page.fill('#mods', '28');

  // ── el 3D recibe lo MISMO que se ve en 2D, EN LOS TRES MODOS ──
  // La semántica del visor: un nodo es UN TRACKER, y con filaZ>0 ese nodo
  // dibuja DOS filas y el eje de transmisión (Ayora: pasoFila 6, filaZ 3).
  // «No siempre un nodo = un bifila»: monofila y fija exportan distinto, y
  // cada modo se comprueba por separado.
  await page.fill('#mods', '28, 14, 7');
  await page.selectOption('#bifila', '1');
  await generar(page);
  const mesasBif = await page.evaluate(() => RES.stats.structures);
  const v3bif = await page.evaluate(() => {
    document.querySelector('#d3Btn').click();
    return JSON.parse(localStorage.getItem('cobertura_layout') || '{}');
  });
  check('BIFILA → filaZ = pitch/2 (el visor pone las 2 filas y el EJE él solo)',
    v3bif.mesa && Math.abs(v3bif.mesa.filaZ - v3bif.mesa.pasoFila / 2) < 1e-9,
    JSON.stringify({ filaZ: v3bif.mesa && v3bif.mesa.filaZ, paso: v3bif.mesa && v3bif.mesa.pasoFila }));
  check('BIFILA → un nodo por PAREJA A/B: ~mesas/4 (' + v3bif.trackers.length + ' vs ' + mesasBif + ' mesas)',
    Math.abs(v3bif.trackers.length - mesasBif / 4) <= mesasBif * 0.02);
  // UN eje de transmisión POR BIFILA, en el MOTOR — se pintaba uno por MESA
  // (dos por tracker), que es lo que se vio en Larraga. El eje va en el hueco
  // entre las dos mesas de la fila: su X no puede caer DENTRO de una mesa.
  const ejesBif = await page.evaluate(() => {
    const es = ejesBifila();
    const dentroDeMesa = e => RES.rows.some(f => f.some(t =>
      e.xa > t.x0 + 0.01 && e.xa < t.x1 - 0.01 &&
      e.ya > t.y0 - 0.01 && e.ya < t.y1 + 0.01));
    return { n: es.length, enMesa: es.filter(dentroDeMesa).length,
             pares: RES.rows.reduce((a, f) => a + f.length, 0) / 4 };
  });
  check('y en el 2D, UN eje de transmisión por bifila (' + ejesBif.n + ' ejes para ' + mesasBif + ' mesas)',
    Math.abs(ejesBif.n - ejesBif.pares) <= Math.max(2, ejesBif.pares * 0.02), JSON.stringify(ejesBif));
  check('cada eje en el hueco del MOTOR, no atravesando una mesa',
    ejesBif.enMesa === 0, ejesBif.enMesa + ' ejes dentro de mesa');
  // VIGA DE TORSIÓN: una por TRACKER (no por mesa), recorriéndolo de punta a
  // punta CRUZANDO el hueco del motor. Cobertura medida de los mutantes:
  // «una viga por mesa» muere en el conteo Y en la longitud (sobra el tramo
  // del motor × nº de trackers); «viga solo sobre la primera mesa» conserva
  // el conteo y muere en la longitud (falta media planta de viga).
  const vgBif = await page.evaluate(() => {
    const vs = vigasTorsion();
    let lenV = vs.reduce((a, v) => a + Math.abs(v.xb - v.xa), 0);
    let mesas = 0, lenM = 0, motores = 0;
    RES.rows.forEach(f => { mesas += f.length; f.forEach(t => lenM += t.x1 - t.x0);
      motores += trksFila(f).filter(tr => tr.length === 2).length; });
    const esperado = lenM + motores * (RES.stats.gap_motor_m || 0.5);
    return { n: vs.length, mesas, lenV: +lenV.toFixed(2), esperado: +esperado.toFixed(2) };
  });
  check('VIGA DE TORSIÓN: una por tracker, no por mesa (' + vgBif.n + ' vigas para ' + vgBif.mesas + ' mesas)',
    Math.abs(vgBif.n - vgBif.mesas / 2) <= Math.max(2, vgBif.mesas * 0.02), JSON.stringify(vgBif));
  check('y la viga recorre el tracker ENTERO, motor incluido (Σ largos = Σ mesas + huecos de motor)',
    Math.abs(vgBif.lenV - vgBif.esperado) < 0.5, JSON.stringify(vgBif));
  check('con un TIPO por talla y el largo de FILA real (2 mesas + motor)',
    Object.keys(v3bif.mesa.tipos).length > 1 &&
    Object.values(v3bif.mesa.tipos).every(t => t.largo > 0 && t.modsAla > 0),
    JSON.stringify(v3bif.mesa.tipos));
  check('y cada nodo con su talla, su razón de largo y alguna corta de verdad',
    v3bif.trackers.every(t => t.mods > 0 && t.mr > 0 && t.mr <= 1 && t.blk) &&
    v3bif.trackers.some(t => t.mr < 0.999));
  check('y en tracker `fijas` va vacío (no hay mesas fijas que dibujar)',
    Array.isArray(v3bif.fijas) && v3bif.fijas.length === 0);

  await page.selectOption('#bifila', '0');
  await generar(page);
  const mesasMono = await page.evaluate(() => RES.stats.structures);
  const v3mono = await page.evaluate(() => {
    document.querySelector('#d3Btn').click();
    return JSON.parse(localStorage.getItem('cobertura_layout') || '{}');
  });
  check('MONOFILA → filaZ = 0 y un nodo por tracker: ~mesas/2 (' + v3mono.trackers.length + ')',
    v3mono.mesa.filaZ === 0 && Math.abs(v3mono.trackers.length - mesasMono / 2) <= mesasMono * 0.02);
  // En monofila la viga es TODO lo que hay que dibujar de ejes (no hay biela)
  // — y antes no se pintaba NADA: la casilla solo actuaba con bifila, así que
  // en monofila nada unía las 2 mesas + motor de cada tracker en pantalla.
  const vgMono = await page.evaluate(() => {
    const vs = vigasTorsion();
    let mesas = 0; RES.rows.forEach(f => { mesas += f.length; });
    const cuenta = () => { const c = document.querySelector('#cv');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let gris = 0, rojo = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - 127) < 20 && Math.abs(d[i + 1] - 140) < 20 && Math.abs(d[i + 2] - 141) < 22) gris++;
        if (d[i] > 150 && d[i] < 220 && d[i + 1] < 90 && d[i + 2] < 80) rojo++;
      }
      return { gris, rojo }; };
    document.querySelector('#showAxis').checked = false; draw(); const sin = cuenta();
    document.querySelector('#showAxis').checked = true;  draw(); const con = cuenta();
    document.querySelector('#showAxis').checked = false; draw();
    return { n: vs.length, mesas, sin, con };
  });
  check('MONOFILA → viga de torsión por tracker también (' + vgMono.n + ' para ' + vgMono.mesas + ' mesas)',
    Math.abs(vgMono.n - vgMono.mesas / 2) <= Math.max(2, vgMono.mesas * 0.02), JSON.stringify(vgMono));
  check('y el lienzo la pinta en GRIS sin inventar bielas (monofila no tiene eje de transmisión)',
    vgMono.con.gris > vgMono.sin.gris + 200 && vgMono.con.rojo <= vgMono.sin.rojo + 20,
    JSON.stringify(vgMono));

  await page.selectOption('#mount', 'fija');
  await generar(page);
  const estrFija = await page.evaluate(() => RES.stats.structures);
  const v3fija = await page.evaluate(() => {
    document.querySelector('#d3Btn').click();
    return JSON.parse(localStorage.getItem('cobertura_layout') || '{}');
  });
  check('FIJA → filaZ = 0 y un nodo POR ESTRUCTURA (' + v3fija.trackers.length + ' vs ' + estrFija + ')',
    v3fija.mesa.filaZ === 0 &&
    Math.abs(v3fija.trackers.length - estrFija) <= estrFija * 0.02);
  // Una estructura fija no tiene tubo de torsión: la casilla no puede pintarle
  // vigas grises a un montaje que no rota (misma puerta que el canon: la capa
  // de ejes solo existe en tracker).
  check('FIJA → sin viga de torsión que pintar (el gris no aparece al marcar la casilla)',
    await page.evaluate(() => {
      const cuenta = () => { const c = document.querySelector('#cv');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let gris = 0;
        for (let i = 0; i < d.length; i += 4)
          if (Math.abs(d[i] - 127) < 20 && Math.abs(d[i + 1] - 140) < 20 && Math.abs(d[i + 2] - 141) < 22) gris++;
        return gris; };
      document.querySelector('#showAxis').checked = false; draw(); const sin = cuenta();
      document.querySelector('#showAxis').checked = true;  draw(); const con = cuenta();
      document.querySelector('#showAxis').checked = false; draw();
      return con <= sin + 20;
    }));
  // El visor con `fija` NO construye seguidores: corta en terreno.html:961 y el
  // campo se dibuja desde `fijas` (buildFijasInst) — mandar fija:true con las
  // mesas solo en `trackers` era un visor VACÍO (hallazgo de la verificación
  // adversarial, comprobado contra el fuente del visor). `fija` viaja como
  // {tilt} porque el visor lee LAYOUT.fija.tilt para el rótulo del ángulo.
  const tiltFija = await page.evaluate(() => +document.querySelector('#fixTilt').value);
  check('FIJA → el campo viaja en `fijas` (una entrada por estructura, que es lo que el visor dibuja)',
    Array.isArray(v3fija.fijas) && v3fija.fijas.length === estrFija,
    (v3fija.fijas || []).length + ' vs ' + estrFija);
  check('FIJA → fija:{tilt} y cada mesa con su rectángulo desescorzable (p = fondo·cos i ≤ apertura)',
    v3fija.fija && typeof v3fija.fija === 'object' && v3fija.fija.tilt === tiltFija &&
    v3fija.fijas.every(f => f.w > 0 && f.p > 0 && f.inclinacion === tiltFija &&
      f.p <= f.w && isFinite(f.azimut) && f.cols > 0 && f.rows >= 1),
    JSON.stringify(v3fija.fijas && v3fija.fijas[0]));
  // Y la TABLA manda en el handoff: con 2V los módulos por ala siguen siendo
  // los del string (a lo largo del tubo van mods de ancho modWid, apilados en
  // n filas) y la cuerda del colector se dobla. Mandar mods×n como «módulos
  // por ala» dibujaba la fila 2V del DOBLE de largo en el visor.
  await page.selectOption('#table', '2V');
  await generar(page);
  const v3dosV = await page.evaluate(() => {
    document.querySelector('#d3Btn').click();
    return JSON.parse(localStorage.getItem('cobertura_layout') || '{}');
  });
  const dims2v = await page.evaluate(() => ({ modLen: +document.querySelector('#modLen').value }));
  check('2V → mods por ala = los del string (no ×2) y modH = cuerda del colector (2·módulo)',
    v3dosV.mods === 28 && Math.abs(v3dosV.mesa.modH - 2 * dims2v.modLen) < 1e-6,
    JSON.stringify({ mods: v3dosV.mods, modH: v3dosV.mesa.modH }));
  await page.selectOption('#table', '1V');
  await page.selectOption('#mount', 'tracker');
  await page.selectOption('#bifila', '1');
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
  check('con cotas decodificadas del color, no ceros ni sentinelas',
    await page.evaluate(() => {
      const zs = DEM ? DEM.z.flat() : [];
      return zs.length > 0 && zs.every(v => v > -100 && v < 5000) &&
             Math.max(...zs) - Math.min(...zs) > 5;
    }), JSON.stringify(await page.evaluate(() =>
      DEM && [Math.min(...DEM.z.flat()), Math.max(...DEM.z.flat())])));

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
  // Los CUATRO CUADROS del §02.5b («haz como en el notebook»): satélite,
  // elevación, pendiente total y excluidas — pintados, no solo presentes.
  check('salen los cuatro cuadros del MDT',
    await page.evaluate(() => document.querySelectorAll('#demPaneles canvas').length === 4));
  check('con sus títulos canónicos',
    /satelital/i.test(await page.textContent('#demPaneles')) &&
    /Elevación/.test(await page.textContent('#demPaneles')) &&
    /Pendiente total/.test(await page.textContent('#demPaneles')) &&
    /excluidas/i.test(await page.textContent('#demPaneles')),
    (await page.textContent('#demPaneles')).replace(/\s+/g, ' ').slice(0, 140));
  check('y pintados de verdad (elevación y pendiente no están en blanco)',
    await page.evaluate(() => {
      const cvs = document.querySelectorAll('#demPaneles canvas');
      const vivos = [...cvs].slice(1, 3).map(c => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let i = 0; i < d.length; i += 40) if (d[i] + d[i + 1] + d[i + 2] > 60) n++;
        return n;
      });
      return vivos.every(v => v > 200);
    }));
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
  // Y DESCARTA SOLA: aplicar el MDT regenera sin volver a pulsar Generar.
  // «La topografía no descarta ninguna estructura» era esto: descartaba, pero
  // solo al regenerar a mano.
  const descartaSolo = await page.waitForFunction(m => {
    const el = document.querySelectorAll('#ro .ro')[1];
    if (!el) return false;
    const v = parseInt(el.querySelector('.v').textContent.replace(/[^\d]/g, ''), 10);
    return v > 0 && v < m;
  }, mesasSinMdt, { timeout: 30000 }).then(() => true).catch(() => false);
  check('y el MDT descarta SOLO, sin volver a pulsar Generar', descartaSolo);
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

  // ── el recuento del MDT es DE LA PARCELA, no de su bbox ──
  // El raster cubre el bbox de la parcela; con una parcela irregular las
  // celdas de FUERA del polígono se contaban y se pintaban como descartadas
  // («me está marcando terreno fuera de la parcela que yo he dibujado»).
  // Triángulo = medio bbox: las celdas del otro medio no pueden contar.
  await page.uncheck('#demOff'); await page.dispatchEvent('#demOff', 'change');
  await page.selectOption('#parcelMode', 'geojson');
  const TRI = { W: LON0 - 0.004, E: LON0 + 0.004, S: LAT0 - 0.002, N: LAT0 + 0.002 };
  await page.fill('#geotxt', JSON.stringify({ type: 'Feature', properties: {}, geometry: {
    type: 'Polygon', coordinates: [[[TRI.W, TRI.S], [TRI.E, TRI.S], [TRI.W, TRI.N], [TRI.W, TRI.S]]] } }));
  await page.click('#geoApplyBtn');
  await page.evaluate(() => { document.querySelector('#demTag').textContent = ''; });
  await page.click('#demBtn');
  await page.waitForFunction(() => /malla|No se pud/.test(document.querySelector('#demTag').textContent),
    null, { timeout: 30000 });
  const triCeldas = await page.evaluate(t => {
    const qs = celdasExcluidas();
    // fuera = centro claramente al otro lado de la diagonal del triángulo
    // (margen de unas celdas para no discutir por el borde)
    const fuera = qs.filter(q => {
      const cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2;
      return (cx - t.W) / (t.E - t.W) + (cy - t.S) / (t.N - t.S) > 1.12;
    });
    return { total: qs.length, fuera: fuera.length };
  }, TRI);
  check('con parcela TRIANGULAR sigue habiendo celdas excluidas dentro (' + triCeldas.total + ')',
    triCeldas.total > 0, JSON.stringify(triCeldas));
  check('y NINGUNA en el medio bbox que queda fuera del triángulo',
    triCeldas.fuera === 0, triCeldas.fuera + ' celdas de fuera contadas');
  check('el rótulo y la tarjeta lo dicen: celdas «de tu parcela», no del bbox',
    /de tu parcela/.test(await page.textContent('#demTag')) &&
    /en la parcela/.test(await page.textContent('#derivDem')),
    (await page.textContent('#demTag')).slice(0, 90));
  check('y el cuadro de zonas excluidas mide % DE LA PARCELA',
    /% de la parcela/.test(await page.textContent('#demPaneles')));
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

  // ── módulos dibujados y UN color de mesa ──
  // «En el 2D dibuja los módulos»: al acercarse salen los separadores reales de
  // módulo. Y «¿por qué dos colores?»: había verde y azul sin leyenda — ahora
  // toda mesa es del mismo color y el reparto por talla vive en su tabla.
  await page.fill('#pw', '120'); await page.dispatchEvent('#pw', 'change');
  await page.fill('#ph', '90'); await page.dispatchEvent('#ph', 'change');
  await page.fill('#mods', '28, 14, 7');
  await generar(page);
  await page.click('#fit');
  await page.waitForTimeout(250);
  const seps = await page.evaluate(() => {
    const cuenta = () => { const c = document.querySelector('#cv');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] < 70 && d[i + 1] > 80 && d[i + 1] < 185 && d[i + 2] < 160) n++;   // verde OSCURO = separador sobre mesa
      return n; };
    const cerca = cuenta();
    VIEW.z -= 4; draw(); const lejos = cuenta(); VIEW.z += 4; draw();
    return { cerca, lejos };
  });
  check('al acercarse se dibujan los separadores de módulo (' + seps.cerca + ' px vs ' + seps.lejos + ' de lejos)',
    seps.cerca > seps.lejos * 3 && seps.cerca > 400, JSON.stringify(seps));
  const colorCorta = await page.evaluate(() => {
    // la mesa MÁS CORTA (talla pequeña): su centro tiene que ser del MISMO verde
    let corta = RES.structures[0];
    for (const t of RES.structures) if (t.len < corta.len) corta = t;
    const c = (corta.lonlat[0].map((v, i) => corta.lonlat.reduce((a, q) => a + q[i], 0) / 4));
    const pp = px(c[0], c[1]);
    const d = document.querySelector('#cv').getContext('2d')
      .getImageData(Math.round(pp[0]) - 1, Math.round(pp[1]) - 1, 3, 3).data;
    let mejor = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) if (d[i + 1] > mejor[1]) mejor = [d[i], d[i + 1], d[i + 2]];
    return mejor;
  });
  check('la mesa corta es del MISMO color que las demás (verde, no azul)',
    colorCorta[1] > 140 && colorCorta[2] < 200 && colorCorta[2] < colorCorta[1] + 30,
    'rgb(' + colorCorta.join(',') + ')');
  await page.fill('#pw', '600'); await page.dispatchEvent('#pw', 'change');
  await page.fill('#ph', '450'); await page.dispatchEvent('#ph', 'change');

  // ── el export GeoJSON lleva la PARCELA ──
  // Sin ella, el fichero no podía volver a entrar como caso del careo ni
  // reabrirse como proyecto: eran mesas flotando sin el recinto que las explica.
  await generar(page);
  const geoExp = JSON.parse((await bajado('expGeo')).txt);
  check('el GeoJSON exportado lleva su feature tipo=parcela',
    (geoExp.geojson.features || []).some(f => f.properties && f.properties.tipo === 'parcela'));

  // ── sesión: guardar a fichero, cargar en una página LIMPIA ──
  await page.fill('#prot', '35'); await page.dispatchEvent('#prot', 'change');
  await page.selectOption('#bifila', '1');
  await generar(page);
  const cajaS = await cajaLienzo(page);
  await page.click('#exclStart');
  for (const [fx, fy] of [[0.42, 0.42], [0.58, 0.42], [0.58, 0.58], [0.42, 0.58]])
    await page.mouse.click(cajaS.x + cajaS.w * fx, cajaS.y + cajaS.h * fy);
  await page.mouse.dblclick(cajaS.x + cajaS.w * 0.42, cajaS.y + cajaS.h * 0.58);
  await generar(page);
  const mesasSes = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  const sesion = await bajado('sesGuardar');
  check('la sesión se guarda a fichero .json', /sesion\.json$/.test(sesion.nombre), sesion.nombre);

  // ── el export GeoJSON VUELVE A ENTRAR y reproduce el caso entero ──
  // La doc lo promete y la verificación adversarial lo pilló en falso:
  // parseGeoJSON no conocía el envoltorio {stats,geojson} («geometría
  // ausente») y las exclusiones del export se tiraban. Roundtrip real:
  // exportar, BORRAR las exclusiones, pegar el export, y que vuelvan con él.
  const expRound = (await bajado('expGeo')).txt;
  await page.click('#exclClear');
  check('(preparación) las exclusiones quedan borradas antes del roundtrip',
    await page.evaluate(() => EXCL.length === 0));
  await page.selectOption('#parcelMode', 'geojson');
  // el export son ~800 KB (todas las mesas): page.fill se ahoga con su cadena
  // de accionabilidad — el valor entra por evaluate, con su evento input.
  await page.evaluate(t => { const el = document.querySelector('#geotxt');
    el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); }, expRound);
  await page.click('#geoApplyBtn');
  check('el export de la ficha se reconoce (parcela + exclusiones del fichero)',
    /Export de la ficha reconocido/.test(await page.textContent('#foot')) &&
    await page.evaluate(() => EXCL.length === 1),
    await page.textContent('#foot'));
  await generar(page);
  const mesasRound = num(await page.textContent('#ro .ro:nth-child(2) .v'));
  check('y al generar reproduce el caso entero: mismas mesas (' + mesasRound + ' vs ' + mesasSes + ')',
    mesasRound === mesasSes);
  const pag5 = await browser.newPage();
  await pag5.route('https://server.arcgisonline.com/**', r => r.abort());
  await pag5.route('https://geocoding-api.open-meteo.com/**', r => r.abort());
  await pag5.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });
  await pag5.evaluate(() => { try { localStorage.removeItem('genlayout_sesion'); } catch (e) {} });
  await pag5.setInputFiles('#sesFile', { name: 'sesion.json', mimeType: 'application/json',
                                          buffer: Buffer.from(sesion.txt) });
  await pag5.waitForFunction(() => /Sesión cargada/.test(document.querySelector('#foot').textContent),
    null, { timeout: 10000 });
  check('la página limpia restaura la configuración (giro 35, multi-talla, BIFILA)',
    await pag5.inputValue('#prot') === '35' &&
    /28, ?14, ?7/.test(await pag5.inputValue('#mods')) &&
    await pag5.inputValue('#bifila') === '1');
  check('y la exclusión dibujada vuelve con ella',
    await pag5.evaluate(() => EXCL.length === 1));
  await pag5.evaluate(() => { document.querySelector('#hint').textContent = ''; });
  await pag5.click('#genBtn');
  await pag5.waitForFunction(() => /ms/.test(document.querySelector('#hint').textContent),
    null, { timeout: 30000 });
  const mesasPag5 = num(await pag5.textContent('#ro .ro:nth-child(2) .v'));
  check('y al generar sale la MISMA cuenta de mesas (' + mesasPag5 + ' vs ' + mesasSes + ')',
    mesasPag5 === mesasSes);
  check('sin monofilas de contrabando: sigue bifila con líneas PARES y Δx = 0',
    await pag5.evaluate(() => RES.stats.bifila === true &&
      RES.rows.every(r => r.length % 2 === 0) && RES.stats.ab_max_dx_m < 0.01));
  await pag5.close();

  // ── sesión: el autoguardado sobrevive a recargar ──
  await page.waitForTimeout(1100);                       // deja correr el debounce
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /Sesión anterior restaurada/.test(document.querySelector('#foot').textContent),
    null, { timeout: 10000 });
  check('recargar NO pierde el trabajo: sesión restaurada sola',
    await page.inputValue('#prot') === '35' && await page.evaluate(() => EXCL.length === 1));
  // «empezar de cero» borra y recarga limpio
  await page.click('#sesReset');
  await page.waitForFunction(() => !/restaurada/.test(document.querySelector('#foot').textContent),
    null, { timeout: 10000 });
  check('«empezar de cero» arranca de verdad de cero',
    await page.inputValue('#prot') === '0' && await page.evaluate(() => EXCL.length === 0));

  // ── gate layout ↔ sizing (§06.5) ──
  await abreAvanzados(page);
  await generar(page);
  const gDatos = await page.evaluate(() => ({ s: RES.stats.strings, k: RES.stats.kWp }));
  await page.evaluate(d => localStorage.setItem('factiun_sizing',
    JSON.stringify({ n_strings_total: d.s, pnom_kwp: d.k })), gDatos);
  await page.click('#btnGate');
  check('gate con sizing coherente → PASS (y se rellena solo de factiun_sizing)',
    /PASS/.test(await page.textContent('#sizes')), (await page.textContent('#sizes')).slice(0, 90));
  await page.click('#btnChecklist');
  check('y el checklist §02.5i lo recoge como PASS',
    /Gate layout ↔ sizing[\s\S]*PASS/.test(await page.textContent('#sizes')));
  await page.fill('#gateStrings', String(Math.round(gDatos.s * 1.3)));
  await page.click('#btnGate');
  // por el ESTADO, no por /FAIL/: la nota «WARN no es FAIL» contiene la
  // palabra FAIL en cualquier resultado del gate — la misma trampa del WARN.
  check('gate con strings un 30 % desviados → FAIL con su mensaje canónico',
    await page.evaluate(() => GATE && GATE.status === 'FAIL') &&
    /strings desalineados/.test(await page.textContent('#sizes')));
  await page.fill('#gateStrings', ''); await page.fill('#gateKwp', '');
  await page.evaluate(() => localStorage.removeItem('factiun_sizing'));
  await page.click('#btnGate');
  // el ESTADO del gate, no una palabra suelta: el propio texto explica «WARN no
  // es FAIL» y esa frase contiene la palabra FAIL — buscarla a secas era medir
  // la explicación, no el resultado.
  check('gate sin datos de sizing → WARN, no FAIL (falta información, no está mal)',
    await page.evaluate(() => GATE && GATE.status === 'WARN'));
  // Y en el checklist, WARN es el estado ↗ («depende de otra ficha»), no el ☐
  // de «mirado y está mal»: desmarcarlo por no tener datos era castigar el
  // no-haber-mirado igual que el estar-mal.
  await page.click('#btnChecklist');
  check('y el checklist recoge el WARN como pendiente (↗), no como desmarcado (☐)',
    await page.evaluate(() => {
      // la FILA del gate, no el contenedor (que también contiene el texto):
      const fila = [...document.querySelectorAll('#sizes div')].filter(d =>
        /Gate layout/.test(d.textContent) && d.textContent.length < 200).pop();
      return !!fila && fila.textContent.trim().startsWith('↗');
    }));

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

  // ── el área útil se VE, también con el grid girado ──
  // La banda se pintaba con un fillRect entre los dos extremos proyectados de
  // cada línea de barrido: sin giro son casi horizontales y colaba; con el
  // azimut girado son diagonales y lo que salía era la caja envolvente de cada
  // segmento — una neblina que no se leía como área útil (el «¿dónde está el
  // área útil?» de producción). Ahora son quads en el marco LOCAL, y esto lo
  // mide en el régimen donde el fillRect mentía: parcela chica con setback
  // enorme y SIN mesas (así el único verde del lienzo es la banda), sin
  // ortofoto (fondo determinista) y azimut a 135°.
  const pag6 = await browser.newPage();
  await pag6.route('https://server.arcgisonline.com/**', r => r.abort());
  await pag6.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });
  await pag6.evaluate(() => { document.querySelector('#orto').checked = false; });
  await pag6.fill('#pw', '100'); await pag6.fill('#ph', '90');
  await pag6.fill('#setback', '40'); await pag6.fill('#panelAz', '135');
  await generar(pag6);
  const util = await pag6.evaluate(() => {
    const st = RES && RES.stats;
    const c = document.querySelector('#cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    // Verde de la banda: más verde que rojo con margen (el relleno azul de la
    // parcela solo, g−r ≈ 12, no llega) y sin el azul del trazo del contorno.
    let verde = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i + 1] > d[i] + 22 && d[i + 2] < d[i + 1] + 30 && d[i + 1] < 190) verde++;
    return { mesas: st ? st.structures : -1, banda: (RES.inner_band || []).length, verde };
  });
  check('parcela chica + setback 40 m: sin mesas pero con área útil calculada',
    util.mesas === 0 && util.banda > 0, JSON.stringify(util));
  check('la banda del área útil SE VE con el grid girado (píxeles verdes sin una sola mesa)',
    util.verde > 400, util.verde + ' px');
  await pag6.close();

  // ── 🪄 VARITA: detectar el contorno de un campo en la ortofoto ──
  // Detección VISUAL (flood-fill + Moore + Douglas-Peucker), no catastral.
  // El núcleo se mide sobre un ImageData sintético CON RUIDO (un fixture
  // limpio no valida una guarda contra píxeles reales), y el cableado entero
  // —teselas → offscreen → detección → DRAW en lonlat— sobre teselas a RAYAS
  // generadas aquí mismo: columnas de tesela claras/oscuras alternas, así el
  // campo detectable existe de verdad en la ortofoto que sirve el stub.
  const zlib = require('zlib');
  function pngSolido(r, g, b, size = 256) {
    const T = []; for (let n = 0; n < 256; n++) { let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
    const crc = buf => { let c = ~0; for (const by of buf) c = T[(c ^ by) & 255] ^ (c >>> 8); return (~c) >>> 0; };
    const chunk = (tipo, datos) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
      const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
      const c4 = Buffer.alloc(4); c4.writeUInt32BE(crc(cuerpo));
      return Buffer.concat([len, cuerpo, c4]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
    const fila = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) { fila[1 + x * 3] = r; fila[2 + x * 3] = g; fila[3 + x * 3] = b; }
    const idat = zlib.deflateSync(Buffer.concat(Array(size).fill(fila)));
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  }
  const T_CLARO = pngSolido(150, 140, 90), T_OSCURO = pngSolido(60, 90, 50);

  const pagV = await browser.newPage();
  await pagV.route('https://server.arcgisonline.com/**', r => {
    const m = r.request().url().match(/tile\/(\d+)\/(\d+)\/(\d+)/);
    const claro = m && (+m[3]) % 2 === 0;
    r.fulfill({ status: 200, contentType: 'image/png',
                headers: { 'access-control-allow-origin': '*' },
                body: claro ? T_CLARO : T_OSCURO });
  });
  await pagV.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });
  await pagV.waitForFunction(() => /Esri World Imagery/.test(
    document.querySelector('#basemapMsg').textContent), null, { timeout: 15000 });

  // núcleo puro, sobre sintético con ruido determinista
  const nucleo = await pagV.evaluate(() => {
    const w = 200, h = 200, img = new ImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dentro = x >= 40 && x < 160 && y >= 60 && y < 140;
      const ruido = ((x * 7 + y * 13) % 5) - 2;
      const i = (y * w + x) * 4;
      d[i] = (dentro ? 150 : 60) + ruido; d[i + 1] = (dentro ? 140 : 90) + ruido;
      d[i + 2] = (dentro ? 90 : 50) + ruido; d[i + 3] = 255;
    }
    const seg = varitaSegmenta(d, w, h, 100, 100, 24);
    if (!seg) return { fallo: 'segmenta null' };
    const ring = varitaContorno(seg.dentro, w, h);
    if (!ring) return { fallo: 'contorno null' };
    const simp = varitaSimplifica(ring, 2.5);
    let a2 = 0;
    for (let i = 0; i < simp.length; i++) {
      const p = simp[i], q = simp[(i + 1) % simp.length];
      a2 += p[0] * q[1] - q[0] * p[1];
    }
    const xs = simp.map(p => p[0]), ys = simp.map(p => p[1]);
    const capON = varitaSegmenta(d, w, h, 100, 100, 1000) === null;
    return { n: seg.n, crudo: ring.length, verts: simp.length,
             area: Math.abs(a2 / 2), bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
             capON };
  });
  check('VARITA núcleo: el campo con ruido se segmenta (~120×80 px, ' + (nucleo.n || 0) + ')',
    !nucleo.fallo && Math.abs(nucleo.n - 9600) < 960, JSON.stringify(nucleo));
  check('y el contorno simplificado clava área y caja (' + nucleo.verts + ' vértices)',
    Math.abs(nucleo.area - 9600) < 1150 &&
    nucleo.bbox[0] >= 36 && nucleo.bbox[1] >= 56 && nucleo.bbox[2] <= 164 && nucleo.bbox[3] <= 144,
    JSON.stringify(nucleo));
  check('el crudo trae cientos de puntos y la simplificación lo deja en pocos (mutante ε=0 muere aquí)',
    nucleo.crudo > 100 && nucleo.verts <= 30, nucleo.crudo + ' → ' + nucleo.verts);
  check('y el TOPE del 45% mata la tolerancia pasada de rosca (mutante sin-tope muere aquí)',
    nucleo.capON === true);

  // ── el criterio de ACEPTACIÓN, con el caso REAL del estreno como fixture ──
  // La captura del 2026-08-21 («sin sentido»): sobre la ortofoto de una
  // planta construida, la varita aceptó la franja de suelo entre dos filas
  // de trackers — una esquirla de ~8 px de ancho. Y el «gana la primera»
  // hacía que, pinchando un claro dentro de un campo con textura, se quedara
  // con el fragmento en vez del campo.
  const criterio = await pagV.evaluate(() => {
    const w = 200, h = 200;
    const pinta = f => { const img = new ImageData(w, h), d = img.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = f(x, y), i = (y * w + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      } return d; };
    // CASO 1 · la esquirla de la captura: franja clara de 8 px entre "filas"
    const esquirla = pinta((x, y) => (x >= 96 && x < 104) ? [150, 140, 90] : [40, 55, 35]);
    const r1 = varitaEscoge(esquirla, w, h, 100, 100);
    // CASO 2 · claro DENTRO de un campo: parche (Δ≈27 del campo, >16 <34) en
    // un campo grande sobre fondo oscuro. La fina se queda en el parche; la
    // gruesa da el campo. Tiene que ganar EL CAMPO (mutante «gana la
    // primera» muere aquí).
    const campo = pinta((x, y) => {
      if (x < 30 || x >= 170 || y < 40 || y >= 160) return [40, 55, 35];
      if (x >= 85 && x < 115 && y >= 85 && y < 115) return [170, 155, 100];
      return [150, 140, 90];
    });
    const r2 = varitaEscoge(campo, w, h, 100, 100);
    let bbox2 = null;
    if (r2) {
      const xs = r2.ring.map(p => p[0]), ys = r2.ring.map(p => p[1]);
      bbox2 = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    return { esquirla: r1, campoTol: r2 && r2.tol, bbox2, n2: r2 && r2.n };
  });
  check('la ESQUIRLA de la captura se rechaza — «no se distingue», no un contorno sin sentido',
    criterio.esquirla === null, JSON.stringify(criterio.esquirla));
  check('y pinchando un CLARO dentro del campo gana el CAMPO, no el fragmento (mutante «gana la primera» muere aquí)',
    !!criterio.bbox2 && criterio.n2 > 10000 &&
    criterio.bbox2[0] >= 26 && criterio.bbox2[1] >= 36 &&
    criterio.bbox2[2] <= 174 && criterio.bbox2[3] <= 164 &&
    (criterio.bbox2[2] - criterio.bbox2[0]) > 130,
    JSON.stringify(criterio));

  // E2E: clic sobre una columna clara → DRAW con el contorno de ESA raya
  const cajaV = await cajaLienzo(pagV);
  const punto = await pagV.evaluate(() => {
    const cv = document.querySelector('#cv'), S = escalaMundo();
    const n = Math.pow(2, Math.round(VIEW.z));
    let tx = Math.floor(VIEW.cx * n); if (((tx % n) + n) % n % 2 !== 0) tx += 1;
    const x = ((tx + 0.5) / n - VIEW.cx) * S + cv.width / 2;
    return { x, y: cv.height / 2, lado: S / n, w: cv.width, h: cv.height };
  });
  // La página arranca en modo «rect» — LA QUEJA REAL («no encuentro la
  // varita»): el botón vive ahora en la barra del mapa, visible en todos los
  // modos, y al armarla cambia sola a «Dibujarla sobre el lienzo».
  check('la varita se VE sin abrir ningún panel (modo rect)',
    await pagV.evaluate(() => document.querySelector('#varitaBtn').offsetParent !== null &&
      document.querySelector('#parcelMode').value === 'rect'));
  await pagV.click('#varitaBtn');
  check('y al armarla cambia sola al modo dibujo',
    (await pagV.evaluate(() => document.querySelector('#parcelMode').value)) === 'draw');
  check('la cabecera enseña la versión (el guard de integridad la carea con la ficha)',
    /^v\d+\.\d+/.test(await pagV.textContent('#verBadge')));
  check('la varita armada lo dice y enciende la ortofoto',
    /Clic en el campo/.test(await pagV.textContent('#varitaBtn')) &&
    /borrador visual/.test(await pagV.textContent('#mapHint')),
    await pagV.textContent('#mapHint'));
  await pagV.evaluate(() => { _movido = 0; });
  await pagV.mouse.click(cajaV.x + punto.x * (cajaV.w / punto.w),
                         cajaV.y + punto.y * (cajaV.h / punto.h));
  const detectado = await pagV.evaluate(() => {
    if (!DRAW.length) return { n: 0 };
    const xs = DRAW.map(p => px(p[0], p[1])[0]), ys = DRAW.map(p => px(p[0], p[1])[1]);
    return { n: DRAW.length, drawing, conParcela: !!PARCEL,
             xspan: Math.max(...xs) - Math.min(...xs), yspan: Math.max(...ys) - Math.min(...ys),
             hint: document.querySelector('#mapHint').textContent };
  });
  check('E2E: el clic en la raya clara propone su contorno como DIBUJO en curso (' + detectado.n + ' vértices)',
    detectado.n >= 4 && detectado.drawing === true && detectado.conParcela &&
    /contorno propuesto/.test(detectado.hint) && /no linde oficial/.test(detectado.hint),
    JSON.stringify(detectado));
  check('y el contorno mide lo que la raya: un ancho de tesela y todo el alto del lienzo',
    Math.abs(detectado.xspan - punto.lado) < punto.lado * 0.4 &&
    detectado.yspan > punto.h * 0.85,
    JSON.stringify({ xspan: detectado.xspan, lado: punto.lado, yspan: detectado.yspan, h: punto.h }));
  await pagV.close();

  // uniforme de verdad → «no se distingue un recinto» (el tope, de punta a punta)
  const pagU = await browser.newPage();
  await pagU.route('https://server.arcgisonline.com/**', r => r.fulfill({
    status: 200, contentType: 'image/png',
    headers: { 'access-control-allow-origin': '*' }, body: T_CLARO }));
  await pagU.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });
  await pagU.waitForFunction(() => /Esri World Imagery/.test(
    document.querySelector('#basemapMsg').textContent), null, { timeout: 15000 });
  await pagU.click('#varitaBtn');
  await pagU.evaluate(() => { _movido = 0; });
  const cajaU = await cajaLienzo(pagU);
  await pagU.mouse.click(cajaU.x + cajaU.w / 2, cajaU.y + cajaU.h / 2);
  check('con ortofoto UNIFORME la varita lo dice en vez de inventarse un recinto',
    /no se distingue un recinto/.test(await pagU.textContent('#mapHint')),
    await pagU.textContent('#mapHint'));
  await pagU.close();

  // sin teselas → «necesita la ortofoto», no un contorno fantasma
  const pagS = await browser.newPage();
  await pagS.route('https://server.arcgisonline.com/**', r => r.abort());
  await pagS.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });
  await pagS.waitForFunction(() => /sin ortofoto/.test(
    document.querySelector('#basemapMsg').textContent), null, { timeout: 15000 });
  await pagS.click('#varitaBtn');
  await pagS.evaluate(() => { _movido = 0; });
  const cajaSn = await cajaLienzo(pagS);
  await pagS.mouse.click(cajaSn.x + cajaSn.w / 2, cajaSn.y + cajaSn.h / 2);
  check('sin teselas la varita pide la ortofoto en vez de detectar sobre el fondo',
    /necesita la ortofoto/.test(await pagS.textContent('#mapHint')),
    await pagS.textContent('#mapHint'));
  await pagS.close();

  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
  process.exit(ko ? 1 : 0);
})();
