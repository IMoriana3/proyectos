// LA PORTADA: el careo con la cartera, y las funciones puras que nadie miraba.
//
// `index.html` son 466 KB y la vigilaban 25 comprobaciones entre `test_index`
// y `test_integridad`, todas sobre releases, enlaces e integridad de las
// tablas. Las funciones que DECIDEN lo que se ve no las miraba nadie. MEDIDO,
// con los mutantes verificados aplicados en disco y corridos contra
// `test_index`, `test_integridad` y `test_pwa`:
//
//   · la potencia redondeada a entero siempre       -> mató CERO
//   · el orden por nombre invertido                 -> mató CERO
//   · la cuenta de estados contando doble           -> mató CERO
//   · la búsqueda mirando solo el nombre            -> mató CERO
//
// El primero contradice de frente un comentario del propio fichero, que dice:
// «Redondear El Burgo a "14" escondía los 13,96 que la cartera sí tiene, y a
// esta escala esa décima es medio megavatio». Eso es una declaración que
// afirma un arreglo sin nada que la sostenga: se podía volver a redondear y
// el comentario seguiría ahí, mintiendo con autoridad.
//
// EL CONTROL POSITIVO, Y UNA CORRECCIÓN MÍA. Al comprobar que el instrumento
// medía —hacer que `cardHTML` devolviera cadena vacía, o sea TODAS las
// tarjetas de herramienta en blanco— leí que `test_index` seguía verde. ERA
// FALSO, y el error era de mi medición: ese arnés REVIENTA (salida 1, cero
// comprobaciones leídas) esperando la tarjeta de la toolbox, que ya no se
// pinta, y mi script contaba solo líneas FAIL. Una explosión no es un
// superviviente. El portón sí lo caza: el recuento leído cae a cero, por
// debajo del suelo de 18. Cuarto corolario, otra vez: el veredicto salía de
// la señal equivocada.
//
// Lo que SÍ queda en pie, y medido: esa comprobación se llama «se pintan las
// tarjetas» y cuenta `article.card` SIN DISTINGUIR, con umbral «más de
// cinco». Con las de herramienta vacías la página conserva ONCE tarjetas de
// planta, que son también `article.card`, así que su condición pasaría igual
// si el arnés llegara hasta ella. Es un listón flojo con un nombre que promete
// más que lo que mira. Aquí las tarjetas se cuentan por rejilla y se exige UNA
// POR HERRAMIENTA, que es lo que el nombre dice.
//
// ── EL CAREO ──────────────────────────────────────────────────────────
// La pieza principal de este banco no es ninguna de esas. Es que
// `cartera-tabla.html` ESCRIBE `factiun_plantas` con `publishSpecs` y esta
// portada lo LEE en `SPECS` para poner la potencia junto al nombre. Son dos
// cabezas de un contrato entre fichas, sin servidor de por medio, y nada las
// careaba: cada lado tenía (ahora) su propio banco y ninguno comprobaba que
// encajaran. Aquí se corre el `publishSpecs` DE VERDAD, extraído de la
// cartera, y lo que escribe se le da a la portada tal cual.
//
//   python3 -m http.server 8099
//   node tests/test_portada.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), vm = require('vm');

const BASE = process.env.BASE || 'http://localhost:8099';
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

// ── `publishSpecs` de la cartera, de verdad ───────────────────────────
// Se extrae emparejando llaves, igual que en `test_cartera.js`: si alguien
// cambia lo que la cartera publica, este careo lo ve sin que nadie lo copie
// aquí a mano.
const cart = fs.readFileSync(path.join(RAIZ, 'cartera-tabla.html'), 'utf8');
function sacaFn(html, nombre) {
  const i = html.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let nivel = 0, cad = null;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    const c = html[k], p = html[k - 1];
    if (cad) { if (c === cad && p !== '\\') cad = null; continue; }
    if (c === '"' || c === "'") { cad = c; continue; }
    if (c === '{') nivel++;
    else if (c === '}') { nivel--; if (nivel === 0) return html.slice(i, k + 1); }
  }
  return null;
}
function sacaConst(html, nombre) {
  const suelta = html.match(new RegExp('^const ' + nombre + '\\s*=\\s*([^;]+);', 'm'));
  if (suelta) return 'var ' + nombre + ' = ' + suelta[1] + ';';
  const dentro = html.match(new RegExp('\\b' + nombre + '\\s*=\\s*(\\[[^\\]]*\\]|\\{[^}]*\\})'));
  return dentro ? 'var ' + nombre + ' = ' + dentro[1] + ';' : null;
}
const piezas = ['publishSpecs', 'firstInt', 'num'].map(f => sacaFn(cart, f));
const consPub = sacaConst(cart, 'NPROY');
check('`publishSpecs` sigue en la cartera, con sus dos ayudantes',
      piezas.every(Boolean) && !!consPub,
      piezas.map((p, i) => p ? '' : ['publishSpecs', 'firstInt', 'num'][i]).join(' '));

// Una planta de la portada, elegida por tener código Y potencia escrita a
// mano: es la única forma de comprobar que el dato VIVO gana al copiado.
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
check('la portada sigue leyendo el registro compartido `factiun_plantas`',
      /localStorage\.getItem\('factiun_plantas'\)/.test(idx));
check('y sigue teniendo su respaldo escrito a mano (`pdc` por planta)',
      /pdc\s*:/.test(idx));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page0 = await browser.newPage();
  await page0.goto(BASE + '/index.html', { waitUntil: 'networkidle' });

  // Las plantas de la portada, con su código y su potencia de respaldo.
  const PL = await page0.evaluate(() => PLANTS.map(p => ({
    code: p.code, codCartera: p.codCartera || null, name: p.name || p.nombre || '', pdc: p.pdc })));
  const conCodigo = PL.filter(p => p.code != null && String(p.code).trim() !== '');
  check('la portada trae plantas con código y potencia de respaldo',
        conCodigo.length >= 3, conCodigo.length + ' de ' + PL.length);

  // ══════════════════════════════════════════════════════════════════
  //  1) EL CAREO CARTERA -> PORTADA
  // ══════════════════════════════════════════════════════════════════
  // Se elige una planta real de la portada y se le publica desde la CARTERA
  // una potencia distinta de la escrita a mano. Si el contrato funciona, la
  // tarjeta tiene que decir la de la cartera.
  const objetivo = conCodigo.find(p => p.pdc != null && +p.pdc > 0) || conCodigo[0];
  const VIVA = 87.65;   // ni redonda ni igual a ninguna de respaldo
  const ctxC = { console, JSON, String, Object, Array, Math, parseFloat, parseInt, isFinite,
                 localStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; },
                                 setItem(k, v) { this._d[k] = String(v); } },
                 DATA: [{ num: objetivo.code, proyecto: objetivo.name, pdc: VIVA, pac: 70,
                          string: '28 mod', lat: '', lon: '', trk_total: 500 }] };
  vm.createContext(ctxC);
  vm.runInContext(consPub + '\n' + piezas.join('\n') + '\npublishSpecs();', ctxC);
  const publicado = ctxC.localStorage.getItem('factiun_plantas');
  check('la cartera publica algo en `factiun_plantas`', !!publicado);
  const mapa = JSON.parse(publicado || '{}');
  check('y ahí dentro está la planta que se le dio, con su potencia',
        mapa[String(objetivo.code)] && mapa[String(objetivo.code)].pdc === VIVA,
        JSON.stringify(mapa[String(objetivo.code)] || null).slice(0, 90));

  // Ahora la portada, arrancada con ESE registro ya escrito.
  async function abrirCon(reg) {
    const p = await browser.newPage();
    await p.addInitScript(r => { try { localStorage.clear();
      if (r) localStorage.setItem('factiun_plantas', r); } catch (e) {} }, reg || null);
    await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    return p;
  }
  const page = await abrirCon(publicado);
  const leido = await page.evaluate(c => (typeof SPECS === 'object' && SPECS[String(c)]) || null, objetivo.code);
  check('la portada LEE lo que la cartera acaba de publicar',
        leido && leido.pdc === VIVA, JSON.stringify(leido).slice(0, 80));
  const txtViva = await page.evaluate(c => potenciaDC(PLANTS.find(p => String(p.code) === String(c))), objetivo.code);
  check('y el dato VIVO de la cartera gana al escrito a mano en la portada',
        txtViva.indexOf('87,65') >= 0, txtViva);
  // La tarjeta pintada tiene que decir lo mismo que la función: si no, hay una
  // ruta de dibujo que se salta el contrato.
  const enTarjeta = await page.evaluate(n => {
    const t = Array.from(document.querySelectorAll('#plants article.card'))
      .map(e => e.textContent).find(x => x.indexOf(n) >= 0); return t || ''; }, objetivo.name);
  check('y la tarjeta pintada dice lo mismo que la función',
        enTarjeta.indexOf('87,65') >= 0, enTarjeta.slice(0, 70));
  await page.close();

  // Sin registro publicado —la cartera no se ha abierto nunca en este
  // navegador— la portada NO puede quedarse muda: para eso está el respaldo.
  const pageSin = await abrirCon(null);
  const sinReg = await pageSin.evaluate(c => potenciaDC(PLANTS.find(p => String(p.code) === String(c))), objetivo.code);
  check('sin la cartera abierta, la portada cae al respaldo escrito a mano',
        sinReg.length > 0 && sinReg.indexOf('MWdc') >= 0, JSON.stringify(sinReg));
  check('y no dice la potencia viva que nadie ha publicado', sinReg.indexOf('87,65') < 0, sinReg);

  // ══════════════════════════════════════════════════════════════════
  //  2) EL FORMATO DE LA POTENCIA — el comentario que nadie sostenía
  // ══════════════════════════════════════════════════════════════════
  // «Dos decimales hasta 100 MW y entero por encima. Redondear El Burgo a
  // "14" escondía los 13,96». Se ejercitan los DOS lados del umbral, la coma
  // decimal, y el caso que el propio comentario nombra.
  const F = v => pageSin.evaluate(x => potenciaDC({ code: '__NADA__', pdc: x }), v);
  check('13,96 MW se dice con sus dos decimales, no redondeado a 14',
        (await F(13.96)) === ' · 13,96 MWdc', await F(13.96));
  check('y con coma decimal, no con punto', (await F(13.96)).indexOf('.') < 0);
  check('99,99 sigue con decimales (justo por debajo del umbral)',
        (await F(99.99)) === ' · 99,99 MWdc', await F(99.99));
  check('100 ya va entero (justo por encima)', (await F(100)) === ' · 100 MWdc', await F(100));
  check('150,4 se redondea a 150 arriba del umbral', (await F(150.4)) === ' · 150 MWdc', await F(150.4));
  check('los ceros de cola no se enseñan: 14,00 es «14»',
        (await F(14)) === ' · 14 MWdc', await F(14));
  check('y 14,50 es «14,5»', (await F(14.5)) === ' · 14,5 MWdc', await F(14.5));
  // Páramo: la cartera la tiene a 0 y el fichero dice que un «0 MW» sería peor
  // que no decir nada.
  check('una planta a cero no dice «0 MW»: no dice nada', (await F(0)) === '', JSON.stringify(await F(0)));
  check('ni una potencia negativa', (await F(-5)) === '');
  check('ni una que no es número', (await F('lo que sea')) === '');
  check('ni una que falta', (await pageSin.evaluate(() => potenciaDC({ code: '__NADA__' }))) === '');

  // ══════════════════════════════════════════════════════════════════
  //  3) LA CUENTA DE ESTADOS
  // ══════════════════════════════════════════════════════════════════
  // Alimenta los medidores y los chips: si cuenta de más, la portada dice que
  // hay proyectos que no existen.
  const cuenta = await pageSin.evaluate(() => ({ c: countByStatus(), n: TOOLS.length,
    orden: ORDER.slice(), estados: TOOLS.map(t => t.status) }));
  const suma = Object.keys(cuenta.c).reduce((s, k) => s + cuenta.c[k], 0);
  const conocidos = cuenta.estados.filter(e => cuenta.orden.indexOf(e) >= 0).length;
  check('la cuenta por estado suma exactamente las herramientas de estado conocido',
        suma === conocidos, suma + ' vs ' + conocidos);
  check('y no cuenta más de las que hay', suma <= cuenta.n, suma + ' de ' + cuenta.n);
  check('todos los estados del orden aparecen en la cuenta, aunque sean cero',
        cuenta.orden.every(k => cuenta.c[k] !== undefined), JSON.stringify(cuenta.c));
  check('ninguna cuenta es negativa', Object.keys(cuenta.c).every(k => cuenta.c[k] >= 0));
  // El careo con lo pintado: los chips llevan el número escrito, así que si la
  // cuenta miente, mienten los dos sitios a la vez o no encajan.
  const chips = await pageSin.evaluate(() => Array.from(document.querySelectorAll('#chips .chip')).map(b => b.textContent.trim()));
  check('el chip «Todos» dice el total de herramientas',
        chips.length > 0 && chips[0].indexOf('· ' + cuenta.n) >= 0, chips[0]);
  check('y hay un chip por cada estado con proyectos',
        chips.length === 1 + cuenta.orden.filter(k => cuenta.c[k] > 0).length,
        chips.length + ' chips · ' + JSON.stringify(cuenta.c));

  // ══════════════════════════════════════════════════════════════════
  //  4) EL FILTRO Y LA BÚSQUEDA
  // ══════════════════════════════════════════════════════════════════
  async function conEstado(f, q, sort) {
    return pageSin.evaluate(a => { const g = { q: state.q, f: state.filter, s: state.sort };
      state.q = a.q; state.filter = a.f; state.sort = a.s;
      const r = filtered().map(p => p.name);
      state.q = g.q; state.filter = g.f; state.sort = g.s; return r; },
      { q: q || '', f: f || 'all', s: sort || 'recent' });
  }
  const todos = await conEstado('all', '', 'recent');
  check('sin filtro salen todas las herramientas', todos.length === cuenta.n, todos.length);
  const vivos = await conEstado(cuenta.orden.find(k => cuenta.c[k] > 0), '', 'recent');
  const primerEstado = cuenta.orden.find(k => cuenta.c[k] > 0);
  check('filtrando por un estado salen exactamente las de ese estado',
        vivos.length === cuenta.c[primerEstado], vivos.length + ' vs ' + cuenta.c[primerEstado]);
  // LA BÚSQUEDA MIRA TRES CAMPOS, no solo el nombre — el mutante que lo
  // recortaba a `name` mató cero.
  const conObjetivo = await pageSin.evaluate(() => TOOLS.find(p => p.objetivo &&
    p.objetivo.split(/\s+/).some(w => w.length > 6 && !p.name.toLowerCase().includes(w.toLowerCase()))));
  if (conObjetivo) {
    const palabra = conObjetivo.objetivo.split(/\s+/).find(w => w.length > 6 &&
      !conObjetivo.name.toLowerCase().includes(w.toLowerCase())).replace(/[^\wáéíóúñÁÉÍÓÚÑ]/g, '');
    const hall = await conEstado('all', palabra, 'recent');
    check('la búsqueda mira el OBJETIVO, no solo el nombre («' + palabra + '»)',
          hall.indexOf(conObjetivo.name) >= 0, hall.join(' · ').slice(0, 70));
  } else {
    check('la búsqueda mira el OBJETIVO, no solo el nombre', false,
          'ninguna herramienta tiene una palabra de objetivo fuera de su nombre — fixture inservible');
  }
  const stackTool = await pageSin.evaluate(() => TOOLS.find(p => p.stack && p.stack.length > 3));
  if (stackTool) {
    const t = stackTool.stack.split(/[\s,·]+/).find(w => w.length > 3) || stackTool.stack;
    const hall = await conEstado('all', t, 'recent');
    check('y mira el STACK («' + t + '»)', hall.indexOf(stackTool.name) >= 0, hall.length + ' resultados');
  }
  const nada = await conEstado('all', 'zzzzqqqnoexiste', 'recent');
  check('una búsqueda sin resultados devuelve lista vacía, no todas', nada.length === 0, nada.length);
  check('la búsqueda no distingue mayúsculas',
        (await conEstado('all', todos[0].toUpperCase(), 'recent')).indexOf(todos[0]) >= 0);
  // LOS TRES ÓRDENES. El de nombre invertido mató cero.
  const porNombre = await conEstado('all', '', 'name');
  const orden = porNombre.slice().sort((a, b) => a.localeCompare(b, 'es'));
  check('el orden por nombre va de la A a la Z, no al revés',
        JSON.stringify(porNombre) === JSON.stringify(orden), porNombre.slice(0, 3).join(' · '));
  const porEstado = await conEstado('all', '', 'status');
  const rangos = await pageSin.evaluate(n => n.map(x => STATUS[TOOLS.find(t => t.name === x).status].rank), porEstado);
  check('el orden por estado respeta el rango declarado',
        rangos.every((v, i, A) => i === 0 || v >= A[i - 1]), rangos.join(' '));
  check('y los tres órdenes devuelven las mismas herramientas, solo que colocadas',
        porNombre.length === todos.length && porEstado.length === todos.length &&
        porNombre.slice().sort().join('|') === todos.slice().sort().join('|'));

  // ══════════════════════════════════════════════════════════════════
  //  5) LAS TARJETAS QUE EL NOMBRE DE LA OTRA COMPROBACIÓN NO MIRABA
  // ══════════════════════════════════════════════════════════════════
  // `test_index` cuenta `article.card` sin distinguir, y las de planta ya
  // pasan de cinco: con TODAS las tarjetas de herramienta en blanco seguía
  // verde. Aquí se cuentan las de la rejilla, que son las de herramienta.
  const rejilla = await pageSin.evaluate(() => document.querySelectorAll('#grid article.card').length);
  const plantas = await pageSin.evaluate(() => document.querySelectorAll('#plants article.card').length);
  check('la rejilla de HERRAMIENTAS pinta una tarjeta por herramienta',
        rejilla === cuenta.n, rejilla + ' vs ' + cuenta.n);
  check('y las de PLANTA se cuentan aparte, no tapan a las otras',
        plantas === PL.length, plantas + ' vs ' + PL.length);
  check('ninguna tarjeta de la rejilla sale vacía',
        await pageSin.evaluate(() => Array.from(document.querySelectorAll('#grid article.card'))
          .every(c => c.textContent.trim().length > 3)));
  // Y que el filtro llega hasta el dibujo, no solo hasta la función.
  await pageSin.evaluate(k => setFilter(k), primerEstado);
  const trasFiltrar = await pageSin.evaluate(() => document.querySelectorAll('#grid article.card').length);
  check('al filtrar por un estado, la rejilla pinta solo ésas',
        trasFiltrar === cuenta.c[primerEstado], trasFiltrar + ' vs ' + cuenta.c[primerEstado]);
  await pageSin.evaluate(() => setFilter('all'));
  check('y al quitar el filtro vuelven todas',
        (await pageSin.evaluate(() => document.querySelectorAll('#grid article.card').length)) === cuenta.n);

  await pageSin.close();
  await browser.close();
  console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL el banco reventó -> ' + e.message); process.exit(1); });
