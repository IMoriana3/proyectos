// EL EXPEDIENTE DE HOMOLOGACIÓN — que la pantalla diga lo que dicen sus datos.
//
// `homologacion.html` es una lista de requisitos con su nivel de evidencia, y
// TODO lo que enseña arriba (el veredicto, la barra, las cuatro cifras, el mapa
// de casillas) es un recuento de esa lista. El defecto que este fichero vigila
// es el de cualquier resumen: que el número de arriba y las filas de abajo
// dejen de ser la misma cuenta. Con una página que se va a enseñar a un cliente
// para decirle «12 requisitos no tienen evidencia», un 11 arriba y doce filas
// abajo es peor que no tener página.
//
// Por eso los recuentos se sacan DOS veces y por caminos distintos: de `REQS`
// (el dato, leído del fichero y evaluado aquí, fuera del navegador) y del DOM
// (lo que se pinta). Si coinciden, la página cuenta bien; si alguien cambia un
// nivel en `REQS` las dos se mueven juntas y el banco sigue verde, que es lo
// correcto: aquí no se fija el VALOR de la evidencia, se fija que no se
// contradiga.
//
// LO QUE NO COMPRUEBA, dicho: que el nivel asignado a cada requisito sea el
// verdadero. Eso es una lectura de código y documentos fechada en `REVISION`,
// no una medida, y ningún arnés puede saber si «Simulado» debería ser
// «Declarado».
//
//   python3 -m http.server 8099
//   node tests/test_homologacion.js
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');   // dónde está el chromium, en un solo sitio
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = process.env.BASE_URL || process.env.BASE || 'http://localhost:8099';
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

// ── 1 · EL DATO, leído del fichero y evaluado fuera del navegador ────────
const html = fs.readFileSync(path.join(RAIZ, 'homologacion.html'), 'utf8');
const script = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
const hasta = script.indexOf('/* ---------- estado ---------- */');
check('el bloque de datos está delimitado', hasta > 0);
const caja = {};
vm.createContext(caja);
vm.runInContext(script.slice(0, hasta) + '\n;this.D={VER,REVISION,EV,FAM,WHO,TOOLS,REQS,FINDS,SOURCES,T,MEDIDAS};', caja);
const D = caja.D;

/* La validación va como función para poder darle un dato roto a propósito:
   un validador que nunca ha visto un error no se sabe si los ve. */
function validar(d) {
  const mal = [];
  const ev = new Set(d.EV.map(e => e.k)), fam = new Set(d.FAM.map(f => f.k)), who = new Set(d.WHO.map(w => w.k));
  d.REQS.forEach((r, i) => {
    if (r.n !== i + 1) mal.push('nº ' + r.n + ' fuera de orden (posición ' + (i + 1) + ')');
    if (!ev.has(r.ev)) mal.push('nº ' + r.n + ': nivel desconocido «' + r.ev + '»');
    if (!fam.has(r.f)) mal.push('nº ' + r.n + ': bloque desconocido «' + r.f + '»');
    if (!who.has(r.w)) mal.push('nº ' + r.n + ': responsable desconocido «' + r.w + '»');
    for (const k of ['es', 'en', 'hes', 'hen', 'ces', 'cen'])
      if (!r[k] || String(r[k]).trim().length < 5) mal.push('nº ' + r.n + ': texto «' + k + '» vacío');
    for (const t of r.t) if (!d.TOOLS[t[0]]) mal.push('nº ' + r.n + ': herramienta desconocida «' + t[0] + '»');
    /* LO MEDIDO EN PLANTA VA ETIQUETADO. Una cifra de planta sólo entra por `mes`/`men`, y
       sólo con `med` apuntando a una campaña que diga planta, fuente y periodo. */
    const M = d.MEDIDAS || {};
    if (r.med) {
      const m = M[r.med];
      if (!m || !m.planta || !m.es || !m.en || !/\d{2}\/\d{2}/.test(m.periodo || '')) mal.push('nº ' + r.n + ': campaña de medida «' + r.med + '» sin planta, fuente o periodo');
      for (const k of ['mes', 'men']) if (!r[k] || String(r[k]).trim().length < 5) mal.push('nº ' + r.n + ': medido «' + k + '» vacío');
    } else if (r.mes || r.men) mal.push('nº ' + r.n + ': cifra medida sin campaña (`med`)');
    /* y la etiqueta no se teclea a mano en ningún texto: se compone en un solo sitio */
    for (const k of ['es', 'en', 'hes', 'hen', 'ces', 'cen', 'mes', 'men'])
      for (const c of Object.keys(M)) if (String(r[k] || '').includes(M[c].periodo) || /Medido ·|Measured ·/.test(String(r[k] || '')))
        mal.push('nº ' + r.n + ': «' + k + '» lleva la etiqueta de medida tecleada a mano');
  });
  d.FINDS.forEach((h, i) => h.r.forEach(n => {
    if (!d.REQS.some(r => r.n === n)) mal.push('hallazgo ' + (i + 1) + ' arrastra el nº ' + n + ', que no existe');
  }));
  return mal;
}
const mal = validar(D);
check('los ' + D.REQS.length + ' requisitos son coherentes (nivel, bloque, responsable, textos, herramientas)', !mal.length, mal.slice(0, 4).join(' · '));
// el mismo validador, con un dato roto: tiene que cantar los cuatro
const roto = JSON.parse(JSON.stringify({ EV: D.EV, FAM: D.FAM, WHO: D.WHO, TOOLS: D.TOOLS, REQS: D.REQS, FINDS: D.FINDS, MEDIDAS: D.MEDIDAS }));
roto.REQS[2].ev = 'probado'; roto.REQS[5].t.push(['nohay']); roto.REQS[8].hen = ''; roto.FINDS[0].r.push(999);
const malRoto = validar(roto);
check('el validador ve un nivel inventado, una herramienta que no existe, un texto vacío y un hallazgo colgado',
  malRoto.length === 4, malRoto.length + ' avisos: ' + malRoto.join(' · '));

// y con lo medido roto de las cuatro maneras en que se puede colar una cifra sin etiqueta
const sinEtiqueta = JSON.parse(JSON.stringify({ EV: D.EV, FAM: D.FAM, WHO: D.WHO, TOOLS: D.TOOLS, REQS: D.REQS, FINDS: D.FINDS, MEDIDAS: D.MEDIDAS }));
const conMed = D.REQS.filter(r => r.med).map(r => r.n), sinMed = D.REQS.filter(r => !r.med).map(r => r.n);
sinEtiqueta.REQS[conMed[0] - 1].med = 'nohay';                       // campaña que no existe
sinEtiqueta.REQS[conMed[1] - 1].men = '';                            // medido sin su inglés
sinEtiqueta.REQS[sinMed[0] - 1].mes = 'Medido en algún sitio: 3 s';  // cifra medida sin campaña
sinEtiqueta.REQS[sinMed[1] - 1].hes += ' Medido · El Burgo I: 3 s.';   // etiqueta tecleada a mano fuera de la línea medida
const malMed = validar(sinEtiqueta);
check('el validador ve una campaña que no existe, un medido sin traducir, una cifra sin campaña y una etiqueta tecleada a mano',
  malMed.length === 4, malMed.length + ' avisos: ' + malMed.join(' · '));
check('hay ' + conMed.length + ' requisitos con medida de planta y todos cuelgan de una campaña con planta, fuente y periodo',
  conMed.length >= 5 && Object.values(D.MEDIDAS).every(m => m.planta && m.es && m.en && m.periodo && m.nes && m.prog), conMed.join(','));

check('hay requisitos en los nueve bloques', D.FAM.every(f => D.REQS.some(r => r.f === f.k)),
  D.FAM.filter(f => !D.REQS.some(r => r.f === f.k)).map(f => f.k).join(','));
const cuenta = k => D.REQS.filter(r => r.ev === k).length;
const N = { total: D.REQS.length, medido: cuenta('medido'), simulado: cuenta('simulado'), declarado: cuenta('declarado'), falta: cuenta('falta') };
check('los cuatro niveles suman el total (' + [N.medido, N.simulado, N.declarado, N.falta].join('+') + '=' + N.total + ')',
  N.medido + N.simulado + N.declarado + N.falta === N.total);

// la versión, con LA REGLA DEL PANEL (se extrae de index.html, no se copia)
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const mRe = idx.match(/const VER_RE_APP\s*=\s*(\/.*\/[a-z]*);/);
const VER_RE = mRe ? eval(mRe[1]) : null;
const mVer = VER_RE && html.match(VER_RE);
check('el Panel puede leer la versión de la ficha con su propia regla', !!(mVer && mVer[1] === D.VER), mVer ? mVer[1] : 'no casa');
check('la fecha de revisión es una fecha', /^\d{4}-\d{2}-\d{2}$/.test(D.REVISION), D.REVISION);

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const page = await browser.newPage({ viewport: { width: 1320, height: 900 } });
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.removeItem('factiun_homologacion_lang'); } catch (e) {} });
  await page.goto(BASE + '/homologacion.html', { waitUntil: 'load' });
  await page.waitForSelector('.req');

  // ── 2 · lo pintado contra el dato ──────────────────────────────────────
  const dom = await page.evaluate(() => ({
    filas: document.querySelectorAll('.req').length,
    casillas: document.querySelectorAll('.cell').length,
    cifras: [...document.querySelectorAll('.lv')].map(b => [b.dataset.ev, +b.querySelector('.n').textContent]),
    porNivel: ['medido', 'simulado', 'declarado', 'falta'].map(k => document.querySelectorAll('.req[data-ev="' + k + '"]').length),
    casNivel: ['medido', 'simulado', 'declarado', 'falta'].map(k => document.querySelectorAll('.cell.' + k).length),
    segs: [...document.querySelectorAll('.stack .s')].map(s => [s.dataset.ev, s.getBoundingClientRect().width]),
    veredicto: document.getElementById('vBig').textContent,
    lang: document.documentElement.lang, h1: document.getElementById('h1').textContent
  }));
  check('una fila por requisito (' + dom.filas + ')', dom.filas === N.total);
  check('una casilla del mapa por requisito (' + dom.casillas + ')', dom.casillas === N.total);
  const esperado = [N.medido, N.simulado, N.declarado, N.falta];
  check('las cuatro cifras son el recuento del dato', JSON.stringify(dom.cifras.map(c => c[1])) === JSON.stringify(esperado), JSON.stringify(dom.cifras));
  check('las filas de cada nivel son las del dato', JSON.stringify(dom.porNivel) === JSON.stringify(esperado), JSON.stringify(dom.porNivel));
  check('las casillas de cada nivel son las del dato', JSON.stringify(dom.casNivel) === JSON.stringify(esperado), JSON.stringify(dom.casNivel));
  check('el veredicto lleva las cifras del dato, no escritas a mano',
    dom.veredicto.includes(' ' + N.medido + ' ') && dom.veredicto.includes(' ' + N.total + ' ') && dom.veredicto.includes(' ' + N.falta + ' '), dom.veredicto);
  // la barra: un solo eje. El ancho de cada tramo, proporcional a su recuento.
  const anchoTotal = dom.segs.reduce((a, s) => a + s[1], 0);
  const peor = Math.max(...dom.segs.map(s => Math.abs(s[1] / anchoTotal - N[s[0]] / N.total)));
  check('cada tramo de la barra mide lo que su recuento (desvío máx. ' + (100 * peor).toFixed(2) + ' pp)', peor < 0.02, JSON.stringify(dom.segs));
  check('arranca en castellano', dom.lang === 'es' && dom.h1 === D.T.es.h1, dom.lang + ' · ' + dom.h1);

  // ── 3 · los filtros ────────────────────────────────────────────────────
  const visibles = () => page.evaluate(() => [...document.querySelectorAll('.req')].map(r => +r.id.slice(2)));
  await page.click('.fbtn[data-f="ev"][data-v="falta"]');
  let v = await visibles();
  check('filtrar por «Falta» deja ' + N.falta + ' filas, todas de ese nivel',
    v.length === N.falta && v.every(n => D.REQS[n - 1].ev === 'falta'), v.join(','));
  check('el contador dice lo que se ve', (await page.textContent('#count')).includes(N.falta + ' de ' + N.total), await page.textContent('#count'));
  await page.click('.fbtn[data-f="w"][data-v="firmware"]');
  v = await visibles();
  const esp2 = D.REQS.filter(r => r.ev === 'falta' && r.w === 'firmware').map(r => r.n);
  check('los dos filtros se suman (falta + firmware = ' + esp2.length + ')', JSON.stringify(v) === JSON.stringify(esp2), v.join(','));
  // una casilla de un requisito que el filtro esconde: quita los filtros y lo enseña
  const oculto = D.REQS.find(r => !(r.ev === 'falta' && r.w === 'firmware')).n;
  await page.click('.cell[data-go="' + oculto + '"]');
  await page.waitForTimeout(700);
  v = await visibles();
  check('pulsar la casilla de un requisito escondido quita los filtros', v.length === N.total, v.length);
  check('…y lo deja a la vista', await page.evaluate(n => { const r = document.getElementById('r-' + n).getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight; }, oculto));
  await page.fill('#q', '40022');
  v = await visibles();
  const esp3 = D.REQS.filter(r => (r.es + r.en + r.hes + r.hen + r.ces + r.cen).includes('40022')).map(r => r.n);
  check('el buscador encuentra el registro 40022 (' + esp3.join(',') + ')', esp3.length > 0 && JSON.stringify(v) === JSON.stringify(esp3), v.join(','));
  await page.fill('#q', 'zzzz-no-existe');
  check('sin resultados lo dice, en vez de dejar la lista en blanco', (await page.locator('.empty').count()) === 1);
  await page.click('#clr');
  check('«quitar filtros» devuelve las ' + N.total, (await visibles()).length === N.total);
  await page.click('.maprow .fam[data-fam="comms"]');
  v = await visibles();
  check('pulsar un bloque del mapa filtra por él', v.length === D.REQS.filter(r => r.f === 'comms').length && v.every(n => D.REQS[n - 1].f === 'comms'), v.join(','));
  await page.click('.maprow .fam[data-fam="comms"]');
  // el color sigue al nivel: filtrar no repinta ni reordena la barra
  await page.click('.stack .s[data-ev="simulado"]');
  const tras = await page.evaluate(() => [...document.querySelectorAll('.stack .s')].map(s => s.dataset.ev + ':' + getComputedStyle(s).backgroundColor));
  await page.click('.stack .s[data-ev="simulado"]');
  const antes = await page.evaluate(() => [...document.querySelectorAll('.stack .s')].map(s => s.dataset.ev + ':' + getComputedStyle(s).backgroundColor));
  check('filtrar no cambia el orden ni el color de la barra', JSON.stringify(tras) === JSON.stringify(antes), tras.join(' '));

  // ── 4 · el rótulo de las marcas y los enlaces ──────────────────────────
  await page.hover('.cell[data-go="1"]');
  check('pasar por una casilla enseña su requisito', await page.evaluate(t => {
    const el = document.getElementById('tip'); return el.style.display === 'block' && el.textContent.includes(t); }, D.REQS[0].es));
  const enl = await page.evaluate(() => [...document.querySelectorAll('.req .tl a')].map(a => a.getAttribute('href')));
  const conUrl = D.REQS.reduce((a, r) => a + r.t.filter(t => D.TOOLS[t[0]].url).length, 0);
  check('cada herramienta con página lleva su enlace (' + conUrl + ')', enl.length === conUrl && enl.every(h => h && h.length > 3), enl.length);
  const locales = [...new Set(enl.filter(h => !/^https?:/.test(h)))];
  check('los enlaces a fichas de este repo apuntan a ficheros que existen', locales.length > 0 && locales.every(h => fs.existsSync(path.join(RAIZ, h))), locales.join(','));

  // ── 5 · el idioma ──────────────────────────────────────────────────────
  await page.click('#langs button[data-lang="en"]');
  const en = await page.evaluate(() => ({ lang: document.documentElement.lang, h1: document.getElementById('h1').textContent,
    niveles: [...document.querySelectorAll('.lv .nm')].map(x => x.textContent.trim()), r1: document.querySelector('#r-1 .rq').textContent,
    filas: document.querySelectorAll('.req').length }));
  check('en inglés cambian el título, los niveles y los requisitos',
    en.lang === 'en' && en.h1 === D.T.en.h1 && JSON.stringify(en.niveles) === JSON.stringify(D.EV.map(e => e.en)) && en.r1 === D.REQS[0].en,
    JSON.stringify(en));
  check('…y siguen siendo las mismas filas', en.filas === N.total);
  const p2 = await browser.newPage({ viewport: { width: 1320, height: 900 } });
  await p2.goto(BASE + '/homologacion.html?lang=en', { waitUntil: 'load' });
  check('`?lang=en` abre en inglés (para pasar el enlace a un cliente)', await p2.evaluate(() => document.documentElement.lang) === 'en');
  const medEn = await p2.evaluate(() => [...document.querySelectorAll('.req .tag-medido')].map(x => x.textContent));
  check('y en inglés la etiqueta también va: «Measured · El Burgo I · NCU logs · 26/05–04/10/2026»',
    medEn.length === conMed.length && medEn.every(t => t === 'Measured · El Burgo I · NCU logs · 26/05–04/10/2026'), JSON.stringify(medEn.slice(0, 2)));
  await p2.close();
  await page.click('#langs button[data-lang="es"]');
  /* — lo medido en planta, en pantalla: siempre detrás de su etiqueta — */
  const med = await page.evaluate(() => ({
    tags: [...document.querySelectorAll('.req .tag-medido')].map(x => x.textContent),
    empieza: [...document.querySelectorAll('.req .med')].every(x => x.firstElementChild && x.firstElementChild.className === 'tag-medido'),
    lang: document.documentElement.lang,
    fuera: [...document.querySelectorAll('.req')].filter(x => { const c = x.cloneNode(true); c.querySelectorAll('.tag-medido').forEach(m => m.remove()); return /26\/05–04\/10\/2026|logs de NCU|Medido ·/.test(c.textContent); }).map(x => x.id),
    r2: (document.querySelector('#r-2 .med') || { textContent: '' }).textContent, ev2: document.querySelector('#r-2').dataset.ev,
    ev3: document.querySelector('#r-3').dataset.ev, ev19: document.querySelector('#r-19').dataset.ev,
    titulo: (document.querySelector('#r-2 .tag-medido') || { title: '' }).title }));
  check('cada cifra medida en planta va detrás de su etiqueta: ' + conMed.length + ' líneas, «Medido · El Burgo I · logs de NCU · 26/05–04/10/2026»',
    med.tags.length === conMed.length && med.tags.every(t => t === 'Medido · El Burgo I · logs de NCU · 26/05–04/10/2026') && med.empieza, JSON.stringify(med.tags.slice(0, 2)));
  check('y la etiqueta no aparece tecleada en ningún otro sitio de la ficha', med.lang === 'es' && med.fuera.length === 0, med.lang + ' ' + med.fuera.join(','));
  check('el requisito 2 dice lo medido con su n, y los niveles son los de los datos (2 y 3 medidos, 19 simulado)',
    /196 s de mediana/.test(med.r2) && /9\.112 maniobras/.test(med.r2) && med.ev2 === 'medido' && med.ev3 === 'medido' && med.ev19 === 'simulado'
    && /377 alarmas/.test(med.titulo) && /abanderamientos_reales\.py/.test(med.titulo), med.r2.slice(0, 120));

  // ── 6 · en papel ───────────────────────────────────────────────────────
  await page.emulateMedia({ media: 'print' });
  const papel = await page.evaluate(() => ({
    filtros: getComputedStyle(document.getElementById('filters')).display,
    barra: getComputedStyle(document.querySelector('.bar')).display,
    fondo: getComputedStyle(document.body).backgroundColor,
    tinta: getComputedStyle(document.querySelector('.req .rq')).color,
    filas: [...document.querySelectorAll('.req')].filter(r => r.getBoundingClientRect().height > 0).length
  }));
  check('impreso no lleva controles', papel.filtros === 'none' && papel.barra === 'none', JSON.stringify(papel));
  check('impreso va en claro: fondo blanco y tinta oscura', papel.fondo === 'rgb(255, 255, 255)' && papel.tinta === 'rgb(17, 24, 32)', papel.fondo + ' · ' + papel.tinta);
  check('impreso lleva las ' + N.total + ' filas', papel.filas === N.total, papel.filas);
  await page.emulateMedia({ media: 'screen' });

  // ── 7 · en un móvil ────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(150);
  check('a 390 px no hay desplazamiento horizontal', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0);
  check('a 390 px las casillas siguen midiendo 30 px (se pueden tocar)', await page.evaluate(() =>
    [...document.querySelectorAll('.cell')].every(c => c.getBoundingClientRect().width >= 30)));

  check('sin errores de página', !errores.length, errores.slice(0, 3).join(' | '));
  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FAIL');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL el arnés reventó -> ' + (e && e.stack || e)); process.exit(1); });
