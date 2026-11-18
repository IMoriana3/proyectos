// El «Buscador de implantaciones» en un navegador real (Chromium vía Playwright).
//
// El motor NO se prueba aquí: es el MISMO bloque «MOTOR DE LAYOUT» del generador y ya
// tiene su careo contra el core en test_layout.js. Lo que se mide es lo que el buscador
// añade encima, que es donde puede mentir:
//
//   · que el motor se EXTRAE de verdad del generador en runtime (si el regex deja de
//     casar, la página entera es un aviso, no un buscador);
//   · DETERMINISMO: misma semilla y mismo site → mismo mejor kWp con las mismas opciones.
//     Sin esto la semilla de la barra es decoración, y la semilla está para reproducir;
//   · MONOTONÍA: el récord nunca baja al seguir buscando;
//   · que sobre una PARCELA REAL (un layout.json con vallado) el buscador corre y saca
//     strings — que es el modo con el que se enseña una planta de la casa;
//   · y que el lienzo PINTA mesas (píxeles verdes), no solo cuenta números.
//
//   npm install playwright                     # el navegador ya está en /opt/pw-browsers
//   python3 -m http.server 8099                # servir el repo (en otra terminal)
//   node tests/test_buscador.js
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');   // dónde está el chromium, en un solo sitio
const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

// un vallado mínimo con la forma de los layouts de la suite: tramos de [x,n] en metros
const LAYOUT_PRUEBA = { title: 'Prueba', fence: [
  [[0, 0], [400, 0]], [[400, 0], [400, 260]], [[400, 260], [0, 260]], [[0, 260], [0, 0]]] };

// Espera a que la ficha esté LISTA para computar: el motor traído del
// generador Y la parcela construida. Va en una función y no repetida cuatro
// veces porque la ventana entre las dos cosas es justo lo que se nos escapó.
async function esperaListo(pg) {
  await pg.waitForFunction(() => window.LAY && window.LAY.compute, null, { timeout: 30000 });
  await pg.waitForFunction(() => {
    try { return typeof CFGP !== 'undefined' && CFGP && CFGP.coords && CFGP.coords.length > 0; }
    catch (e) { return false; }
  }, null, { timeout: 30000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const fallos = [];
  page.on('pageerror', e => fallos.push(e.message));
  const URL1 = BASE + '/buscador-implantacion.html?quieto=1&semilla=123456-654321&site=3';

  await page.goto(URL1);
  // LA ESPERA VA POR LA PARCELA, NO SOLO POR EL MOTOR. Esperar únicamente a
  // `LAY.compute` deja una ventana abierta: la ficha pone `window.LAY` en
  // cuanto se trae el motor del generador, pero la PARCELA (`CFGP`) la
  // construye `nuevoSite()` DESPUÉS, y entre las dos cosas hay un `await` que
  // se descarga `sim-solar.html` entera (67 KB). En esa ventana `compute`
  // existe y `CFGP` sigue a null, así que `PASO()` le pasa un objeto SIN
  // `coords` y el motor revienta con «Cannot read properties of undefined
  // (reading 'map')».
  //
  // No es teoría: pasó en CI el 2026-09-10 (publicó 15 de 55 comprobaciones y
  // murió ahí), y aquí no se reproduce ni en tres pasadas seguidas — es una
  // carrera que solo se abre cuando la máquina va cargada. La espera correcta
  // es la que incluye el dato que `compute` necesita.
  await esperaListo(page);
  check('el motor se extrae del generador y exporta compute', true);

  await page.evaluate(() => PASO(25));
  const e1 = await page.evaluate(() => ESTADO());
  check('25 candidatos corridos son 25 opciones', e1.opciones === 25, e1.opciones);
  check('y hay un mejor con kWp de verdad', e1.mejorKwp > 0, e1.mejorKwp);
  check('con sus strings', e1.mejorStr > 0, e1.mejorStr);
  check('la semilla pedida es la que corre', e1.semilla === '123456-654321' && e1.site === 3, e1.semilla + ' site ' + e1.site);

  // ── EL RENDIMIENTO POR ORIENTACIÓN, que es lo que faltaba ──────────────────────────────────
  // Girar las filas gira el EJE del seguidor y eso cuesta producción. Sin esto la búsqueda
  // ordenaba por kWp INSTALADOS y premiaba llenar en diagonal: más módulos, peor planta.
  check('el modelo solar se extrae de sim-solar.html', e1.sol === true);
  check('y con él se construye la tabla de rendimiento', e1.tabla === true);
  const f = await page.evaluate(() => [0, 10, 20, 30, 45].map(a => FACTOR(a)));
  check('el eje N-S es la referencia (f = 1)', Math.abs(f[0] - 1) < 1e-9, f[0]);
  check('girarlo SIEMPRE cuesta, y más cuanto más se gira',
    f[1] < f[0] && f[2] < f[1] && f[3] < f[2] && f[4] < f[3], JSON.stringify(f.map(x => +x.toFixed(4))));
  // el orden de magnitud importa: plano no penalizaría nada, exagerado prohibiría girar aunque
  // compense. En eje horizontal a media latitud, 45° cuestan pocos puntos — eso es lo real.
  check('y el coste a 45° es de pocos puntos, ni ruido ni prohibición',
    f[4] > 0.90 && f[4] < 0.995, f[4].toFixed(4));
  check('el mejor se ordena por ENERGÍA = kWp × rendimiento',
    Math.abs(e1.mejorEner - e1.mejorKwp * e1.mejorRend) < 1e-6,
    JSON.stringify({ ener: e1.mejorEner, kwp: e1.mejorKwp, rend: e1.mejorRend }));

  // monotonía: el récord (en energía) no baja al seguir
  await page.evaluate(() => PASO(25));
  const e2 = await page.evaluate(() => ESTADO());
  check('el récord no baja al seguir buscando', e2.mejorEner >= e1.mejorEner, e2.mejorEner + ' < ' + e1.mejorEner);

  // la barra cuenta lo mismo que el estado
  const barra = await page.evaluate(() => document.getElementById('barra').textContent);
  check('la barra dice las opciones y la semilla', barra.includes('50') && barra.includes('123456-654321'), barra.slice(0, 90));

  // pinta de verdad: píxeles verdes de mesa en el lienzo
  const verdes = await page.evaluate(() => {
    const c = document.getElementById('lienzo'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 130 && d[i] < 150 && d[i + 2] < 180) n++;
    return n;
  });
  check('el lienzo pinta mesas (píxeles verdes)', verdes > 300, verdes);

  // ── EL PUNTO DE VISTA ES EL DEL MAPA ────────────────────────────────────────────────────
  // La y de mundo es NORTE y la de pantalla crece hacia ABAJO: sin cambiar el signo, la
  // planta salía ESPEJADA N-S respecto al mapa del Generador — «¿por qué el punto de vista
  // no es el mismo?» (2026-09-16). Dos comprobaciones, porque la vista GIRA:
  check('a giro 0, el norte queda ARRIBA en el lienzo', await page.evaluate(() => {
    VISTA.ang = 0;
    const n = pV([TR.cx, TR.cy + 50]), s = pV([TR.cx, TR.cy - 50]);
    return n[1] < s[1];
  }), 'el norte cae por debajo del sur: espejo N-S');
  // y girada NO se vuelve espejo: la quiralidad este×norte se conserva con cualquier ángulo
  // (una rotación honesta la mantiene; un espejo la invierte — es lo que distingue «lo veo
  // girado» de «lo veo del revés», que fue el parte)
  check('girar la vista no la convierte en espejo (quiralidad este×norte)', await page.evaluate(() => {
    VISTA.ang = 1.1;
    const o = pV([TR.cx, TR.cy]), e = pV([TR.cx + 50, TR.cy]), n = pV([TR.cx, TR.cy + 50]);
    const cruz = (e[0] - o[0]) * (n[1] - o[1]) - (e[1] - o[1]) * (n[0] - o[0]);
    VISTA.ang = 0;
    return cruz < 0;
  }), 'cruz ≥ 0: la vista está espejada');
  // la brújula existe y se pinta: como la vista gira, el norte no es fijo en pantalla y sin
  // flecha un giro casual se lee como este mismo bug
  check('la brújula se pinta en el lienzo', await page.evaluate(() => {
    VISTA.ang = 0; dibuja();
    const c = document.getElementById('lienzo'), d = Math.min(devicePixelRatio || 1, 2);
    const im = c.getContext('2d').getImageData(0, 0, Math.round(64 * d), Math.round(72 * d)).data;
    let n = 0; for (let i = 0; i < im.length; i += 4) if (im[i] > 150 && im[i + 1] > 150 && im[i + 2] > 150) n++;
    return n > 5;
  }), 'sin píxeles claros en la esquina de la brújula');
  // y lo pintado SE VE: el velo de error está apagado de verdad (un display propio en CSS pisa
  // el atributo hidden, y ya nos tapó la página entera una vez mientras este banco miraba solo
  // el buffer del canvas — esto mira lo compuesto)
  check('el velo de error no tapa la página', await page.evaluate(() =>
    getComputedStyle(document.getElementById('aviso')).display === 'none'), 'display ≠ none');

  // ── EL INFORME PARA CLIENTE (formato del estudio de batería del Gemelo) ──────────────────
  // No recalcula nada: cosecha LayoutSearchUI.report(). Lo que puede mentir es lo que se mide:
  // que lleve las cifras de ESTA búsqueda, los planos re-dibujados, el límite declarado del
  // índice y el rótulo interno/cliente.
  const inf1 = await page.evaluate(() => LayoutInforme.html());
  check('el informe se construye y es el de ESTA búsqueda',
    typeof inf1 === 'string' && inf1.includes('Estudio de optimización') && inf1.includes('123456-654321'),
    inf1 ? inf1.slice(0, 80) : String(inf1));
  check('y declara el límite del índice: cielo claro, no energía anual',
    inf1.includes('cielo claro') && inf1.includes('no es una previsión de energía anual'),
    'falta la declaración de límites');
  check('con los planos y las gráficas re-dibujados en claro',
    (inf1.match(/data:image\/png/g) || []).length >= 3, (inf1.match(/data:image\/png/g) || []).length + ' figuras');
  check('sin marcar «cliente», se rotula uso interno', inf1.includes('Uso interno de Factiun'));
  const inf2 = await page.evaluate(() => { $('repCliente').checked = true; const h = LayoutInforme.html(); $('repCliente').checked = false; return h; });
  check('marcado «cliente», cambia el rótulo', inf2.includes('para el cliente') && !inf2.includes('Uso interno de Factiun'));

  // ── NINGUNA MESA PINTADA SE SALE DE LA PARCELA («el optimizador se sale de la parcela»,
  // 2026-11-18). El motor estaba limpio; el LIENZO anclaba su frame UTM por TRASLACIÓN al
  // vértice 0 de la parcela, y la convergencia de cuadrícula es un GIRO que una traslación no
  // absorbe: medido aquí mismo, hasta 0,99 m fuera de la linde. El oráculo corre EN ESTE site
  // (sintético, con giros grandes y orígenes desplazados) porque es el régimen donde el ancla
  // rompía: en parcelas pequeñas el error cabe dentro del retranqueo y el check no mediría.
  const fuera = await page.evaluate(() => {
    const pip = (pt, P) => { let c = false; for (let u = 0, v = P.length - 1; u < P.length; v = u++) {
      if ((P[u][1] > pt[1]) !== (P[v][1] > pt[1]) && pt[0] < (P[v][0] - P[u][0]) * (pt[1] - P[u][1]) / (P[v][1] - P[u][1]) + P[u][0]) c = !c; } return c; };
    const dSeg = (pt, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2));
      return Math.hypot(a[0] + t * dx - pt[0], a[1] + t * dy - pt[1]); };
    const fueraMax = () => { const u = ULTIMO; if (!u || !u.valid || !u.r) return 0; let peor = 0;
      u.r.structures.forEach(st => mesaEnLienzo(st, u.r).forEach(q => {
        if (!pip(q, PARCELA.pts)) { let d = 1 / 0;
          for (let i = 0, j = PARCELA.pts.length - 1; i < PARCELA.pts.length; j = i++) d = Math.min(d, dSeg(q, PARCELA.pts[j], PARCELA.pts[i]));
          peor = Math.max(peor, d); } }));
      return peor; };
    let peor = 0;
    for (let i = 0; i < 20; i++) { PASO(1); peor = Math.max(peor, fueraMax()); }
    return peor;
  });
  // OJO con el veredicto: la primera versión devolvía «true o la distancia» y check() toma
  // cualquier número no nulo como verdadero — un check que no podía ponerse rojo, cazado por
  // su propio mutante (el ancla puesta daba 0,88 m… y salía OK). El número SIEMPRE, y la
  // comparación aquí fuera, donde se lee.
  check('ninguna mesa pintada se sale de la parcela (frame del lienzo), candidato a candidato',
    fuera < 0.05, 'peor salida ' + fuera.toFixed(2) + ' m — con el ancla OFF esto medía hasta 0,99 m');

  // determinismo: misma URL, mismas 25 → el MISMO mejor
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page2.goto(URL1);
  await esperaListo(page2);
  // sin evaluaciones no hay nada que informar: html() es null y el botón está apagado
  check('sin búsqueda, el informe se niega (null) y su botón está apagado', await page2.evaluate(() =>
    LayoutInforme.html() === null && $('searchInforme').disabled === true), 'informe de la nada');
  await page2.evaluate(() => PASO(25));
  const e3 = await page2.evaluate(() => ESTADO());
  check('misma semilla → mismo mejor kWp (reproducible)', e3.mejorKwp === e1.mejorKwp, e3.mejorKwp + ' vs ' + e1.mejorKwp);
  check('y mismos strings', e3.mejorStr === e1.mejorStr, e3.mejorStr + ' vs ' + e1.mejorStr);
  await page2.close();

  // parcela real: un layout.json con vallado entra y el buscador corre sobre ella
  const real = await page.evaluate(L => cargaLayoutReal(L), LAYOUT_PRUEBA);
  check('un layout.json con `fence` se carga como parcela real', real === true);
  await page.evaluate(() => PASO(12));
  const e4 = await page.evaluate(() => ESTADO());
  check('y el buscador corre sobre el vallado real', e4.real === true && e4.opciones === 12 && e4.mejorKwp > 0,
    JSON.stringify({ real: e4.real, opciones: e4.opciones, kwp: e4.mejorKwp }));
  const barra2 = await page.evaluate(() => document.getElementById('barra').textContent);
  check('la barra dice que es la parcela real y cuál', barra2.includes('parcela real') && barra2.includes('Prueba'), barra2.slice(0, 80));
  // (aquí vivía «el origen del dibujo se re-mide en la parcela nueva»: vigilaba el ancla OFF
  //  por TRASLACIÓN del frame UTM. El ancla se retiró con el bug del 2026-11-18 y su oráculo
  //  vive arriba, en el site sintético — el régimen donde el ancla rompía de verdad. El salto
  //  de site que este bloque ejercitaba se conserva:)
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' })); PASO(3); });
  check('tras cambiar de site, las mesas del nuevo se pintan en SU parcela', await page.evaluate(() => {
    const u = ULTIMO; if (!u || !u.r) return false;
    const q = mesaEnLienzo(u.r.structures[0], u.r)[0];
    const xs = PARCELA.pts.map(p => p[0]), ys = PARCELA.pts.map(p => p[1]);
    return q[0] >= Math.min(...xs) - 1 && q[0] <= Math.max(...xs) + 1 && q[1] >= Math.min(...ys) - 1 && q[1] <= Math.max(...ys) + 1;
  }), 'la primera mesa cae fuera de la caja de la parcela nueva');;
  // ── CRITERIO POTENCIA («debe poder optimizar por energía o por potencia», 2026-11-18) ──
  // El check vive en TRACKER con giros: ahí el factor solar muerde (≠1) y apagarlo se nota.
  // En fija sin tabla el factor ya vale 1 y el check no mediría (régimen de riesgo).
  await page.evaluate(() => {
    $('searchCrit').value = 'potencia'; $('searchCrit').dispatchEvent(new Event('change'));
    $('searchRun').click(); PASO(15);
  });
  check('bajo criterio POTENCIA, el índice ES la potencia aunque haya giros', await page.evaluate(() =>
    TRACE.some(r => r.valid && Math.abs(r.panelAz - AZ0) > 5) &&
    TRACE.every(r => !r.valid || Math.abs(r.score - r.kWp) < 1e-9) &&
    (!MEJOR || MEJOR.rend === 1)), 'el factor solar se coló en el criterio potencia');
  check('y el mando del tilt queda apagado, con su motivo en pantalla', await page.evaluate(() =>
    $('searchTiltMax').disabled === true &&
    $('objective').textContent.includes('POTENCIA')), 'potencia sin declarar en pantalla');
  check('la nota de variables dice POR QUÉ el tilt está apagado y cómo encenderlo', await page.evaluate(() =>
    !$('varWhy').hidden && $('varWhy').textContent.includes('POTENCIA') && $('varWhy').textContent.includes('Energía')),
    'casilla apagada sin su porqué en pantalla');
  await page.evaluate(() => { $('searchCrit').value = 'energia'; $('searchCrit').dispatchEvent(new Event('change')); });

  // un JSON sin vallado no cuela
  check('sin `fence` no hay parcela real', (await page.evaluate(() => cargaLayoutReal({ title: 'x' }))) === false);

  // ── EL PUENTE CON EL GENERADOR: Optimizar → encargo → A → mandos puestos al volver ──
  // Un CONTEXTO común: browser.newPage() aísla el storage por página, y el canal real del
  // puente es el localStorage compartido de un mismo navegador.
  const ctx = await browser.newContext();
  const pageG = await ctx.newPage();
  await pageG.setViewportSize({ width: 1400, height: 900 });
  pageG.on('pageerror', e => fallos.push('generador: ' + e.message));
  await pageG.goto(BASE + '/generador-layout.html');
  // Ésta NO pasa por `esperaListo` a propósito: no llama a `PASO()`, y de
  // hecho fuerza `PARCEL = []` para comprobar el aviso. Exigirle parcela
  // sería esperar justo lo que este bloque quiere que falte.
  await pageG.waitForFunction(() => window.LAY && typeof readCfg === 'function', null, { timeout: 30000 });
  // sin parcela (se fuerza: la ficha arranca con un rectángulo por defecto), Optimizar avisa y NO abre
  await pageG.evaluate(() => { window.open = () => { window.__abierto = true; return null; }; });
  const guarda = await pageG.evaluate(() => { const p = PARCEL; PARCEL = [];
    document.getElementById('optBtn').click();
    const r = { abierto: !!window.__abierto, hint: document.getElementById('hint').textContent };
    PARCEL = p; return r; });
  check('sin parcela, Optimizar avisa y no abre', !guarda.abierto && guarda.hint.includes('sin parcela'), JSON.stringify(guarda));
  // con parcela: el encargo lleva la cfg ENTERA del panel
  await pageG.evaluate(() => {
    PARCEL = [[-0.80, 41.57], [-0.79, 41.57], [-0.79, 41.578], [-0.80, 41.578]];
    HOLES = []; EXCL = [];
    document.getElementById('pitchTrk').value = 7;               // una mesa distinta a la del buscador suelto
    document.getElementById('panelAz').value = 100;              // y un azimut propio
  });
  await pageG.click('#optBtn');
  const enc = await pageG.evaluate(() => JSON.parse(localStorage.getItem('buscador_encargo')));
  check('Optimizar deja el encargo con la cfg del panel', !!enc && enc.de === 'generador' &&
    enc.cfg.coords.length === 4 && enc.cfg.pitch === 7 && enc.cfg.panelAz === 100,
    JSON.stringify(enc && { pitch: enc.cfg && enc.cfg.pitch, az: enc.cfg && enc.cfg.panelAz }));

  // ── CASO 1: el eje de partida viene TORCIDO → hay que enderezarlo, y eso es giro NEGATIVO ──
  // El buscador solo probaba giros de 0 a 45°: media rosa, y justo la mitad que no sirve. Con
  // el eje de partida a 10° del N-S (panelAz 100), esa ventana solo ofrecía alejarse más, el
  // rendimiento solo podía bajar y la base ganaba SIEMPRE por construcción — «sigue cogiendo
  // esta opción como la mejor… y no es verdad» (2026-09-09). Ahora se buscan los 180 grados.
  // Sigue en pie que la BASE entra la primera y es la referencia: nada se propone por debajo.
  const pageE = await ctx.newPage();
  await pageE.setViewportSize({ width: 1280, height: 800 });
  pageE.on('pageerror', e => fallos.push('encargo: ' + e.message));
  await pageE.goto(BASE + '/buscador-implantacion.html?encargo=1&quieto=1&semilla=42-42');
  await esperaListo(pageE);
  await pageE.evaluate(() => PASO(1));
  const b0 = await pageE.evaluate(() => ESTADO());
  check('el PRIMER candidato es la base: sin girar', b0.mejorGiro === 0 && b0.baseKwp > 0,
    JSON.stringify({ giro: b0.mejorGiro, base: b0.baseKwp }));
  await pageE.evaluate(() => PASO(40));
  const ee = await pageE.evaluate(() => ESTADO());
  check('el buscador corre en modo encargo, con el azimut del panel', ee.encargo === true && ee.az0 === 100 && ee.mejorKwp > 0,
    JSON.stringify({ encargo: ee.encargo, az0: ee.az0, kwp: ee.mejorKwp }));
  check('el mejor NUNCA queda por debajo de la base', ee.mejorEner >= ee.baseEner - 1e-9,
    JSON.stringify({ mejor: ee.mejorEner, base: ee.baseEner }));
  const barraE = await pageE.evaluate(() => document.getElementById('barra').textContent);
  check('y la barra dice de quién es la parcela', barraE.includes('parcela del Generador') && barraE.includes('A'), barraE.slice(0, 90));
  // con la parcela del USUARIO la vista es LA DEL MAPA: norte arriba, sin giro y sin
  // tumbado («sigue girado», 2026-09-16 — la brújula no bastaba). El giro y el falso 3D
  // quedan para los sites sintéticos, que no tienen mapa con el que carearse.
  check('con encargo, la vista es la del mapa: plana, sin giro y a una escala', await pageE.evaluate(() => {
    if (!VISTA.plano || VISTA.ang !== 0) return false;
    const o = pV([TR.cx, TR.cy]), n = pV([TR.cx, TR.cy + 50]), e = pV([TR.cx + 50, TR.cy]);
    const v = o[1] - n[1], h = e[0] - o[0];        // 50 m en pantalla, por eje
    return v > 0 && Math.abs(v - h) < 1e-6;        // norte arriba y MISMA escala que el este
  }), 'la vista del encargo sigue girada o tumbada');
  // con el eje torcido, la mejora EXISTE y hay que encontrarla
  check('con el eje torcido, el buscador SI encuentra algo mejor que la base',
    ee.mejorEner > ee.baseEner * 1.0005, JSON.stringify({ mejor: ee.mejorEner, base: ee.baseEner }));
  check('y lo mejor es enderezar el eje: giro NEGATIVO, el que no se miraba',
    ee.mejorGiro < 0, ee.mejorGiro);
  check('el eje acaba mas cerca del N-S que el de partida',
    Math.abs(((ee.az0 + ee.mejorGiro - 90) % 180 + 270) % 180 - 90) < 10, ee.mejorGiro);
  check('y con mejor rendimiento que la base', ee.mejorRend > 0.999, ee.mejorRend);
  const giros = await pageE.evaluate(() => NUBE.map(p => p[0]));
  check('se muestrean los dos lados de la rosa',
    giros.some(g => g < -45) && giros.some(g => g > 45), JSON.stringify([Math.min(...giros).toFixed(0), Math.max(...giros).toFixed(0)]));
  await pageE.close();

  // ── CASO 1b: si la base YA es lo mejor, no se propone nada ───────────────────────────────
  // Es el otro lado de lo mismo: con el eje ya en N-S sobre una parcela que no premia girar,
  // todo giro resta y el buscador tiene que decirlo y NO mandar nada. Antes esto salia «bien»
  // por el motivo equivocado —no miraba donde estaba la mejora—, asi que ahora se comprueba
  // sobre un caso en el que es verdad.
  await pageG.evaluate(() => { document.getElementById('panelAz').value = 90; });   // eje N-S
  await pageG.click('#optBtn');
  const pageB = await ctx.newPage();
  await pageB.setViewportSize({ width: 1280, height: 800 });
  pageB.on('pageerror', e => fallos.push('encargo N-S: ' + e.message));
  await pageB.evaluate(() => localStorage.removeItem('buscador_mejor')).catch(() => {});
  await pageB.goto(BASE + '/buscador-implantacion.html?encargo=1&quieto=1&semilla=42-42');
  await esperaListo(pageB);
  await pageB.evaluate(() => { localStorage.removeItem('buscador_mejor'); $('searchXY').checked=false; nuevoSite(true); PASO(60); });
  const eb = await pageB.evaluate(() => ESTADO());
  const barraB = await pageB.evaluate(() => document.getElementById('barra').textContent);
  check('con el eje ya en N-S, la base sigue ganando', Math.abs(eb.mejorEner - eb.baseEner) < 1e-9,
    JSON.stringify({ mejor: eb.mejorEner, base: eb.baseEner, giro: eb.mejorGiro }));
  check('sin mejora, la barra lo dice en redondo', barraB.includes('la base sigue ganando'), barraB.slice(-90));
  // y el informe da la MISMA conclusión que la barra: la referencia se mantiene. Un informe
  // que anuncia hallazgo donde la barra dice «sigue ganando» serían dos verdades.
  check('sin mejora, el informe concluye que la referencia se mantiene', await pageB.evaluate(() =>
    (LayoutInforme.html() || '').includes('se mantiene como la mejor')), 'conclusión incoherente con la barra');
  await pageB.keyboard.press('a');
  check('y A NO envia nada: aplicarlo empeoraria lo que ya hay',
    (await pageB.evaluate(() => localStorage.getItem('buscador_mejor'))) === null);
  check('avisando de por que', (await pageB.evaluate(() => document.getElementById('barra').textContent)).includes('NO se envía'));
  await pageB.close();

  // ── CASO 1c: con un azimut de partida BAJO, el giro negativo se sale por debajo de 0 ──────
  // 20° de partida menos 90° de giro son −70°: el mando del Generador se lo traga, pero eso
  // no se escribe en un plano. El azimut de filas es una recta, asi que 290° es lo mismo.
  await pageG.evaluate(() => { document.getElementById('panelAz').value = 20; });
  await pageG.click('#optBtn');
  const pageC = await ctx.newPage();
  pageC.on('pageerror', e => fallos.push('encargo az bajo: ' + e.message));
  await pageC.goto(BASE + '/buscador-implantacion.html?encargo=1&quieto=1&semilla=42-42');
  await esperaListo(pageC);
  const az20 = await pageC.evaluate(() => { const o = []; for (let i = 0; i < 80; i++) { PASO(1); o.push([ULTIMO.giro, ULTIMO.az]); } return o; });
  check('el caso se prueba de verdad: hay giros que se salen por debajo de 0',
    az20.some(x => 20 + x[0] < 0), JSON.stringify(az20.map(x => +x[0].toFixed(0)).slice(0, 8)));
  check('y aun asi el azimut aplicado nunca es negativo',
    az20.every(x => x[1] >= 0 && x[1] < 360),
    JSON.stringify(az20.filter(x => x[1] < 0).slice(0, 3)));
  await pageC.close();
  await pageG.evaluate(() => { document.getElementById('panelAz').value = 100; });   // se deja como estaba

  // ── CASO 2: parcela ALARGADA EN DIAGONAL, metida COMO LA METE UN USUARIO ─────────────────
  // Inyectar PARCEL por JS no deja la ficha en el estado en que la deja la UI: al generar se
  // usaba otra parcela y el careo comparaba dos plantas distintas (era el banco engañándose,
  // no el producto). Se pega el GeoJSON y se pulsa su botón, como en test_layout_ui.
  const DIAG = (() => {
    const cx = -0.80, cy = 41.575, L = 0.0085, W = 0.0011, a = 30 * Math.PI / 180;
    const R = (dx, dy) => [cx + (dx * Math.cos(a) - dy * Math.sin(a)), cy + (dx * Math.sin(a) + dy * Math.cos(a)) * 0.75];
    const r = [R(-L, -W), R(L, -W), R(L, W), R(-L, W)];
    return JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [r.concat([r[0]])] } });
  })();
  await pageG.selectOption('#parcelMode', 'geojson');
  await pageG.fill('#geotxt', DIAG);
  await pageG.waitForTimeout(1000);                       // el debounce del autoguardado
  await pageG.click('#geoApplyBtn');
  // sin barrido: la gracia del caso es que la BASE no venga ya optimizada, y así se puede
  // comprobar la ida y vuelta entera. Con barrido, la ficha ya elige el azimut ella sola.
  await pageG.evaluate(() => {
    // Generar ya no contiene un barrido independiente.
    document.getElementById('panelAz').value = 90; document.getElementById('axis').value = 0;
  });
  await pageG.evaluate(() => { document.querySelector('#hint').textContent = ''; document.querySelector('#genBtn').click(); });
  await pageG.waitForFunction(() => { const t = document.querySelector('#hint').textContent;
    return t.indexOf('ms') >= 0 || t.indexOf('error') >= 0; }, null, { timeout: 60000 });
  await pageG.evaluate(() => document.getElementById('optBtn').click());
  const pageD = await ctx.newPage();
  pageD.on('pageerror', e => fallos.push('diagonal: ' + e.message));
  await pageD.goto(BASE + '/buscador-implantacion.html?encargo=1&quieto=1&semilla=9-9');
  await esperaListo(pageD);
  await pageD.evaluate(() => PASO(80));
  const ed = await pageD.evaluate(() => ESTADO());
  check('en una parcela diagonal SÍ encuentra mejora, y grande', ed.mejorEner > ed.baseEner * 1.05 && ed.mejorGiro > 5,
    JSON.stringify({ base: Math.round(ed.baseKwp), mejor: Math.round(ed.mejorKwp), giro: +ed.mejorGiro.toFixed(1) }));
  await pageD.keyboard.press('a');
  const mejor = await pageD.evaluate(() => JSON.parse(localStorage.getItem('buscador_mejor')));
  if (!mejor) { check('en la diagonal SÍ debería haber envío (no lo hubo)', false, JSON.stringify(ed)); }
  else {
  check('A lo envía con su azimut y sus números', !!mejor && mejor.kwp === ed.mejorKwp && ['none', 'half'].includes(mejor.rowOffset),
    JSON.stringify(mejor && { az: mejor.panelAz, kwp: mejor.kwp }));
  // el EJE viaja: en este motor las filas son ⟂ al eje, así que aplicar el giro sin mover el eje
  // dejaría un layout que declara un eje que no es el suyo (y de ahí comen 3D y backtracking)
  check('el mejor lleva su EJE, coherente con las filas', Math.abs(mejor.axis - (mejor.panelAz - 90)) < 1e-9,
    JSON.stringify({ axis: mejor.axis, panelAz: mejor.panelAz }));
  await pageD.close();

  // al VOLVER al generador (focus), los mandos aparecen puestos y el hint lo canta
  await pageG.evaluate(() => window.dispatchEvent(new Event('focus')));
  const puesto = await pageG.evaluate(() => ({
    az: document.getElementById('panelAz').value,
    eje: document.getElementById('axis').value,
    off: document.getElementById('rowOffset').value,
    vial: document.getElementById('roadNsEvery').value,
    hint: document.getElementById('hint').textContent,
    limpio: localStorage.getItem('buscador_mejor') === null }));
  check('al volver, el azimut del mejor está puesto', Math.abs(+puesto.az - mejor.panelAz) < 0.06, puesto.az + ' vs ' + mejor.panelAz);
  check('y el tresbolillo y los viales', puesto.off === mejor.rowOffset && +puesto.vial === mejor.roadNsEvery,
    puesto.off + '/' + puesto.vial);
  check('y el EJE también, que si no el layout declara uno que no es el suyo',
    Math.abs(+puesto.eje - mejor.axis) < 0.06 && Math.abs(+puesto.az - +puesto.eje - 90) < 0.12,
    JSON.stringify({ eje: puesto.eje, az: puesto.az, esperado: mejor.axis }));
  check('el hint pide Generar y el canal queda limpio', puesto.hint.includes('Generar') && puesto.limpio, puesto.hint.slice(0, 70));
  // el barrido propio de la ficha se APAGA: si no, al generar re-barre y pisa el azimut que
  // acaba de traer el buscador — prometía una planta y salía otra
  check('y el barrido de la ficha queda apagado, para respetar el azimut aplicado',
    await pageG.evaluate(() => !document.getElementById('optAz') && !document.getElementById('optGrid')), true);

  // ── Y EL CAREO QUE FALTABA: que al GENERAR salgan los kWp que el buscador prometió. Sin esto
  //    el puente podía poner los mandos «bien» y dar otra planta, y nadie se enteraba. Es la
  //    comprobación que habría cazado sola el «igual???» de 2026-09-08.
  await pageG.evaluate(() => { document.querySelector('#hint').textContent = ''; document.querySelector('#genBtn').click(); });
  await pageG.waitForFunction(() => { const t = document.querySelector('#hint').textContent;
    return t.indexOf('ms') >= 0 || t.indexOf('error') >= 0; }, null, { timeout: 60000 });
  const kwpReal = await pageG.evaluate(() => RES.stats.kWp);
  check('el Generador reproduce los kWp que el buscador prometió',
    Math.abs(kwpReal - mejor.kwp) / mejor.kwp < 1e-6, kwpReal + ' vs ' + mejor.kwp);
  }

  // ── MONTAJE FIJO: ahí el azimut de filas es el de los PANELES (al sur). Girarlo no es una
  //    variante de reparto, es apuntar los módulos a otro sitio: no se gira y se dice. ──
  await pageG.evaluate(() => { document.getElementById('mount').value = 'fija';
    if (typeof syncAz === 'function') syncAz();
    document.getElementById('fixTilt').value = 5;     // un tilt de partida claramente malo, para que haya mejora que encontrar
    document.getElementById('optBtn').click(); });
  const pageF = await ctx.newPage();
  await pageF.goto(BASE + '/buscador-implantacion.html?encargo=1&quieto=1&semilla=7-7');
  await esperaListo(pageF);
  await pageF.evaluate(() => PASO(8));
  const ef = await pageF.evaluate(() => ESTADO());
  check('en fija no se gira nada', ef.encargo === true && ef.gira === false && ef.mejorGiro === 0,
    JSON.stringify({ gira: ef.gira, giro: ef.mejorGiro }));
  check('y la barra lo dice', (await pageF.evaluate(() => document.getElementById('barra').textContent)).includes('fija: no se gira'));
  check('y la nota de variables dice por qué el azimut no se busca en fija', await pageF.evaluate(() =>
    !$('varWhy').hidden && $('varWhy').textContent.includes('fija')), 'azimut apagado sin su porqué');

  // ── EL TILT DE LA FIJA ES VARIABLE («optimizar también el tilt», 2026-11-18) ────────────
  // La huella del motor no depende del tilt, así que el criterio es un índice de ENERGÍA:
  // la física del comparador de estructuras (careada contra el core), extraída en runtime —
  // transposición Perez de cielo claro en 12 días + SOMBRA entre filas al pitch + cielo
  // enmascarado —, normalizada al tilt del encargo.
  await pageF.evaluate(() => PASO(40));
  const et = await pageF.evaluate(() => ESTADO());
  check('la tabla de inclinación se construye y la referencia vale 1',
    et.tablaTilt === true && (await pageF.evaluate(() => Math.abs(FTILT(TILT0) - 1) < 1e-9)),
    JSON.stringify({ tablaTilt: et.tablaTilt, tilt0: et.tilt0 }));
  check('se muestrean inclinaciones distintas', (await pageF.evaluate(() =>
    new Set(TRACE.filter(r => r.tilt != null).map(r => r.tilt)).size)) >= 4, 'menos de 4 tilts distintos');
  // la SOMBRA está dentro del índice: a tilt alto, la neta sombreada pierde contra la sin
  // sombra, y la TABLA tiene que salir de la física SOMBREADA (es lo que el mutante vigila)
  check('el índice lleva la sombra entre filas, y la tabla sale de la física sombreada',
    await pageF.evaluate(() => {
      const con = TILT_CORRE(50, false), sin = TILT_CORRE(50, true), ref = TILT_CORRE(TILT0, false);
      return con != null && con < sin && Math.abs(FTILT(50) - con / ref) < 1e-9;
    }), 'la tabla no sale de la física sombreada');
  check('con un tilt de partida malo (5°), el buscador encuentra una inclinación mejor',
    et.mejorTilt != null && et.mejorTilt > 10 && et.mejorEner > et.baseEner * 1.0005,
    JSON.stringify({ tilt: et.mejorTilt, mejor: et.mejorEner, base: et.baseEner }));
  await pageF.keyboard.press('a');
  const mt = await pageF.evaluate(() => JSON.parse(localStorage.getItem('buscador_mejor') || 'null'));
  check('A envía la inclinación del mejor', !!mt && Number.isFinite(mt.tilt) && mt.tilt !== 5, JSON.stringify(mt && { tilt: mt.tilt }));
  await pageG.evaluate(() => window.dispatchEvent(new Event('focus')));
  check('y el generador la aplica al mando de la fija', await pageG.evaluate(tilt =>
    +document.getElementById('fixTilt').value === tilt &&
    document.getElementById('hint').textContent.includes('tilt'), mt ? mt.tilt : -1),
    await pageG.evaluate(() => document.getElementById('fixTilt').value + ' · ' + document.getElementById('hint').textContent.slice(0, 60)));
  // la tecla A deja un aviso PEGAJOSO en la barra (9 s): se limpia para que el bloque
  // siguiente lea la BARRA y no el aviso
  await pageF.evaluate(() => { AVISO_BARRA = null; });

  // ── EL TOPE DE INCLINACIÓN («debemos poder limitar el tilt máximo», 2026-11-18) ─────────
  // Es una restricción ESTRUCTURAL: ninguna variante puede superarla, candidato a candidato.
  await pageF.evaluate(() => {
    $('searchTiltMax').value = 20; $('searchTiltMax').dispatchEvent(new Event('change'));
    $('searchRun').click(); PASO(48);
  });
  const tope = await pageF.evaluate(() => ({
    tilts: [...new Set(TRACE.filter(r => r.tilt != null).map(r => r.tilt))],
    peor: Math.max(...TRACE.filter(r => r.tilt != null).map(r => r.tilt)),
    mejorTilt: MEJOR ? MEJOR.tilt : null, distintos: new Set(TRACE.filter(r => r.tilt != null).map(r => r.tilt)).size }));
  check('con tope 20°, ninguna variante lo supera y se sigue barriendo debajo',
    tope.peor <= 20 && tope.distintos >= 3 && tope.mejorTilt != null && tope.mejorTilt <= 20,
    JSON.stringify(tope));

  // ── LA BARRA TIENE QUE PODERSE LEER ─────────────────────────────────────────────────────
  // Se ordena por ENERGÍA, así que la mejor puede llevar MENOS potencia instalada y ganar
  // igual subiendo el rendimiento. Con «base 6,14 MWp · mejor 6,06 MWp · +1,5 %» eso parece
  // una cuenta mal hecha: faltaba el rendimiento de la BASE y qué mide ese porcentaje.
  await pageF.evaluate(() => {
    BASE_REF = { kwp: 6140, rend: 0.968, ener: 6140 * 0.968, str: 0 };
    MEJOR = { kwp: 6060, rend: 0.999, ener: 6060 * 0.999, giro: -48, az: 270, offset: 'none', vial: 0, str: 0, util: 0 };
    barra(); });
  const bTexto = await pageF.evaluate(() => document.getElementById('barra').textContent);
  check('la base se enseña con SU rendimiento, no solo con los MWp',
    /base\s+6[.,]14 MWp\s*×\s*96[.,]8\s*%/.test(bTexto), bTexto.slice(0, 160));
  check('el porcentaje dice de que es: del ÍNDICE SOLAR', bTexto.includes('% de índice solar'), bTexto.slice(-160));
  check('y cuadra con las dos energias', /\+1[.,]9 % de índice solar|\+1[.,]9% de índice solar/.test(bTexto),
    (bTexto.match(/\+[\d.,]+ ?% de índice solar/) || [''])[0]);
  check('con menos potencia que la base, se DICE al lado',
    /-1[.,]3\s*% de potencia/.test(bTexto) && /\+3[.,]1 puntos de rendimiento/.test(bTexto),
    (bTexto.match(/\([^)]*potencia[^)]*\)/) || [''])[0]);
  // y si la mejor lleva MAS potencia, no hay nada que explicar
  const bMas = await pageF.evaluate(() => {
    MEJOR = { kwp: 6300, rend: 0.999, ener: 6300 * 0.999, giro: -48, az: 270, offset: 'none', vial: 0, str: 0, util: 0 };
    barra(); return document.getElementById('barra').textContent; });
  check('con mas potencia, no se cuelga la explicacion', !/de potencia/.test(bMas),
    (bMas.match(/\([^)]*\)/) || [''])[0]);

  await ctx.close();

  console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
  if (fallos.length) console.log('errores JS: ' + fallos.join(' | '));
  await browser.close();
  process.exit(ko || fallos.length ? 1 : 0);
})();
