// UNA VARIABLE QUE NO EXISTE NO FALLA: DEJA LA PROPIEDAD COMO ESTABA.
//
// `background: var(--panel-2)` con `--panel-2` sin definir NO es un error de
// CSS. La declaración se descarta en tiempo de cálculo y la propiedad se queda
// con su valor inicial o heredado — o sea, la regla desaparece EN SILENCIO y
// la página sigue pintándose. Ni la consola dice nada, ni el validador, ni
// ningún arnés de los que ya había.
//
// EL HALLAZGO que justifica este fichero, MEDIDO el 2026-09-23 en el navegador
// sobre `sim-viento.html` antes de tocar nada:
//
//     #sitioRes  background-color .... rgba(0, 0, 0, 0)      ← TRANSPARENTE
//     .it        border-bottom-color .. rgb(234,244,255)     ← el color del TEXTO
//     .it .co    color ................ rgb(234,244,255)     ← el color del TEXTO
//
// El desplegable del buscador de emplazamiento se dibujaba SIN FONDO, así que
// la lista de plantas caía encima de los campos de latitud y longitud y se
// leían las dos cosas superpuestas. Es lo que el mantenedor reportó como
// «desplegable para elegir emplazamiento se ve mal», y no era el maquetado:
// eran tres variables que esa ficha usa y no define.
//
// Y había una PEOR, que no se ve mirando la pantalla. El careo con el motor
// canónico pinta la columna de diferencia con
//
//     color: (|d| <= tol) ? var(--live) : var(--build)
//
// —verde si coincide, ámbar si no—. NINGUNA de las dos existe en esa ficha, así
// que las dos ramas salían del MISMO color heredado: un veredicto codificado en
// color que no codificaba nada. Coincidir y no coincidir se veían igual.
//
// De dónde salen: `sim-solar.html` tiene una paleta (`--panel-2`, `--line-soft`,
// `--muted-2`, `--live`, `--build`) y `sim-viento.html` tiene OTRA (`--bg2`,
// `--card`, `--line2`, `--ok`, `--warn`). Al copiar un bloque de una a la otra
// viajó el uso y no la definición. Por eso el guard es por FICHERO: el
// vocabulario es de cada ficha, y lo que aquí se prohíbe es usar una palabra
// que esta ficha no tiene.
//
// `var(--x, respaldo)` NO se marca: declarar el respaldo es justamente decir
// qué pasa si la variable no está. Eso es contrato, no descuido.
//
//   node tests/test_css_variables.js            (la parte estática, sin red)
//   python3 -m http.server 8099                 (para la parte del navegador)
//   node tests/test_css_variables.js
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');   // dónde está el chromium, en un solo sitio
const RAIZ = path.join(__dirname, '..');
const BASE = process.env.BASE_URL || process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

// ══════════════════════════════════════════════════════════════════
//  EL AUDITOR, como función pura
// ══════════════════════════════════════════════════════════════════
// Aparte y con el documento por argumento a propósito: el caso que importa
// —una ficha con una variable huérfana— ya no existe en el repo después del
// arreglo, así que sin poder alimentarlo a mano el guard no se podría poner
// rojo, y un guard que no se puede poner rojo tampoco mide.

// Los USOS se buscan en TODO el documento, no solo en el `<style>`: los dos
// que pintaban el veredicto del careo viven en un `style="..."` construido
// desde JavaScript, que es exactamente donde nadie mira.
function usos(doc) {
  const out = [];
  // `var(` + nombre + lo que siga. Si lo siguiente es una coma hay RESPALDO
  // declarado y no se marca.
  const re = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,?)/g;
  let m;
  while ((m = re.exec(doc)) !== null) out.push({ nombre: m[1], respaldo: m[2] === ',' });
  return out;
}

// Las DEFINICIONES, en cambio, solo cuentan donde de verdad definen. Son TRES
// sitios, y los tres salieron de medir, no de suponer:
//   · dentro de un bloque `<style>` (`--x: valor;`);
//   · dentro de un atributo `style="…"`, que es como se parametriza un
//     componente. La primera versión de este auditor no lo contemplaba y marcó
//     `--e` de `index.html` como huérfana: se define en
//     `style="--e:${st.color}"` —dentro de una plantilla de JavaScript— y la
//     consume `.pest .led` por herencia. Habría sido un falso positivo en el
//     primer fichero que auditó;
//   · por `setProperty('--x', …)`, que también define de pleno derecho —
//     `index.html` pinta así el color del lector (`--c`).
//
// Y la DIFERENCIA con un `--x:` suelto dentro de JavaScript, que no define
// nada, es el CONTEXTO: estar dentro de un `style=`, no estar dentro de una
// cadena. Los dos casos van en el control positivo, uno frente al otro.
//
// LÍMITE DICHO: esto comprueba que la palabra EXISTE en la ficha, no que su
// ÁMBITO alcance a quien la usa. Una variable definida en un `style=` de un
// elemento y usada por otro que no es descendiente suyo pasaría este guard y
// seguiría sin pintar. Eso lo ve el navegador, y por eso la segunda mitad del
// fichero mira el color calculado y no el fuente.
function definidas(doc) {
  const set = new Set();
  const mete = txt => {
    const re = /(--[A-Za-z0-9_-]+)\s*:/g;
    let m; while ((m = re.exec(txt)) !== null) set.add(m[1]);
  };
  (doc.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).forEach(mete);
  const reAttr = /style\s*=\s*(['"])([\s\S]*?)\1/gi;
  let a; while ((a = reAttr.exec(doc)) !== null) mete(a[2]);
  const re2 = /setProperty\(\s*['"](--[A-Za-z0-9_-]+)['"]/g;
  let m; while ((m = re2.exec(doc)) !== null) set.add(m[1]);
  return set;
}

function huerfanas(doc) {
  const def = definidas(doc);
  const vistas = new Set(), out = [];
  usos(doc).forEach(u => {
    if (u.respaldo || def.has(u.nombre) || vistas.has(u.nombre)) return;
    vistas.add(u.nombre); out.push(u.nombre);
  });
  return out;
}

// ── El control positivo del propio auditor ──
// Sin esto, «cero huérfanas en nueve fichas» y «el auditor no mira» se leen
// igual. Cada caso es un mecanismo distinto de los que se midieron de verdad.
const CASOS = [
  ['caza la que falta', '<style>a{color:var(--no-existe)}</style>', ['--no-existe']],
  ['no marca la que SÍ está', '<style>:root{--x:#fff}a{color:var(--x)}</style>', []],
  ['no marca la que trae respaldo', '<style>a{color:var(--x, #fff)}</style>', []],
  ['tampoco con el respaldo pegado', '<style>a{color:var(--x,#fff)}</style>', []],
  ['la definición NO tiene que estar en :root',
   '<style>.t{--x:#fff}.t a{color:var(--x)}</style>', []],
  ['caza la de un style= escrito desde JS',
   '<style>:root{--x:#fff}</style><script>h=\'<i style="color:var(--live)">\'</script>',
   ['--live']],
  ['setProperty también define',
   '<script>e.style.setProperty("--c","red")</script><style>i{color:var(--c)}</style>', []],
  // Los dos de abajo son la MISMA cadena `--e:` dentro de JavaScript y se
  // resuelven al revés. Lo que los separa no es el lenguaje, es el `style=`.
  ['un `style=` escrito desde JS SÍ define',
   '<script>h=`<i style="--e:${c}">`</script><style>.led{background:var(--e)}</style>', []],
  ['un `--x:` suelto dentro de JS NO define nada',
   '<script>var s="--x:#fff"</script><style>a{color:var(--x)}</style>', ['--x']],
];
CASOS.forEach(([nombre, doc, esperado]) => {
  const got = huerfanas(doc);
  check('control · ' + nombre,
        got.length === esperado.length && got.every((g, i) => g === esperado[i]),
        JSON.stringify(got));
});

// ══════════════════════════════════════════════════════════════════
//  1) NINGUNA FICHA USA UNA VARIABLE QUE NO DEFINE
// ══════════════════════════════════════════════════════════════════
const FICHAS = fs.readdirSync(RAIZ).filter(f => f.endsWith('.html')).sort();
check('hay fichas que auditar', FICHAS.length >= 8, FICHAS.length);

let totalUsos = 0;
FICHAS.forEach(f => {
  const doc = fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const u = usos(doc);
  totalUsos += u.length;
  const h = huerfanas(doc);
  check(f + ': toda variable que usa, la define', h.length === 0, h.join(' '));
});
// El vacío es error, no PASS: si el extractor dejara de encontrar usos, las
// nueve comprobaciones de arriba saldrían verdes sin haber mirado nada.
check('el extractor encuentra usos de verdad en el repo', totalUsos > 400, totalUsos);

// ── El veredicto del careo, leído del fichero real ──
// La comprobación de arriba sabe que `--ok` y `--warn` están DEFINIDAS; ésta
// sabe que el careo usa DOS variables y no una. Es la propiedad que se rompió:
// un veredicto codificado en color necesita dos colores distintos, y si las
// dos ramas apuntan al mismo nombre —o al mismo por resolverse a nada—
// «coincide» y «no coincide» se pintan igual sin que nadie lo note.
const vientoDoc = fs.readFileSync(path.join(RAIZ, 'sim-viento.html'), 'utf8');
const lineaCareo = (vientoDoc.match(/.*\?\s*'var\(--[^']*'\s*:\s*'var\(--[^']*'.*/) || [''])[0];
const paresCareo = (lineaCareo.match(/var\(--[A-Za-z0-9_-]+\)/g) || []);
check('el careo pinta su diferencia con dos colores', paresCareo.length === 2,
      JSON.stringify(paresCareo));
check('y son DOS colores distintos', paresCareo[0] !== paresCareo[1],
      paresCareo.join(' / '));
check('los dos existen en la ficha',
      paresCareo.length === 2 &&
      paresCareo.every(v => definidas(vientoDoc).has(v.slice(4, -1))),
      paresCareo.join(' / '));

// ══════════════════════════════════════════════════════════════════
//  2) EL EFECTO, EN EL NAVEGADOR
// ══════════════════════════════════════════════════════════════════
// La parte estática vigila el MECANISMO; esto vigila lo que el mantenedor
// mira. Las dos hacen falta: un `background` puede quedarse transparente por
// otros motivos, y una variable huérfana puede no pintar nada visible.
function rgba(txt) {
  const m = String(txt).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map(s => parseFloat(s.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
const igual = (a, b) => a && b && a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
const luma = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Nada de fuera: el geocodificador de Open-Meteo no pinta este desplegable
  // —la lista local sí— y dejarlo salir haría que el banco dependiera de la red.
  await ctx.route('**://*/**', r => r.request().url().startsWith(BASE)
    ? r.continue() : r.abort());
  const page = await ctx.newPage();
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sitioQ', { timeout: 20000 });
  await page.click('#sitioQ');
  await page.waitForFunction(() =>
    document.querySelectorAll('#sitioRes .it').length > 0, null, { timeout: 10000 });

  const M = await page.evaluate(() => {
    const cs = n => getComputedStyle(n);
    const res = document.getElementById('sitioRes');
    const it = res.querySelector('.it');
    const co = it.querySelector('.co');
    const raiz = cs(document.documentElement);
    const r = res.getBoundingClientRect();
    return {
      items: res.querySelectorAll('.it').length,
      ancho: r.width, alto: r.height,
      fondo: cs(res).backgroundColor,
      separador: cs(it).borderBottomColor,
      coord: cs(co).color,
      texto: cs(document.body).color,
      tarjeta: cs(res.closest('.card')).backgroundColor,
      input: cs(document.getElementById('sitioQ')).backgroundColor,
      ok: raiz.getPropertyValue('--ok').trim(),
      warn: raiz.getPropertyValue('--warn').trim(),
    };
  });

  check('el desplegable se abre con la lista local, sin red', M.items >= 5, M.items);
  check('y ocupa sitio', M.ancho > 150 && M.alto > 60, M.ancho + '×' + M.alto);

  // EL DEFECTO REPORTADO. `alpha === 1` y no «distinto de transparente»: un
  // fondo a medio opacar deja leer lo de abajo igual de mal.
  const fondo = rgba(M.fondo);
  check('el fondo del desplegable es OPACO', fondo && fondo.a === 1, M.fondo);

  // Cae sobre DOS fondos —la tarjeta y el hueco del input— y tiene que
  // distinguirse de los dos, o parece parte de ellos.
  check('y se distingue de la tarjeta que hay detrás',
        !igual(fondo, rgba(M.tarjeta)), M.fondo + ' vs ' + M.tarjeta);
  check('y del hueco del input, que está justo encima',
        !igual(fondo, rgba(M.input)), M.fondo + ' vs ' + M.input);

  // La separación entre filas se quedaba en `currentColor` —blanco de texto—
  // porque `border-bottom-color` hereda cuando su variable no resuelve.
  const sep = rgba(M.separador), tx = rgba(M.texto);
  check('la separación entre filas NO es el color del texto',
        !igual(sep, tx), M.separador);
  check('y es más apagada que el texto', luma(sep) < luma(tx) * 0.6,
        Math.round(luma(sep)) + ' vs ' + Math.round(luma(tx)));

  // La coordenada es dato secundario: si se pinta igual que el nombre, la
  // fila no tiene jerarquía y es lo que hacía la lista ilegible.
  const co = rgba(M.coord);
  check('la coordenada se lee como secundaria', luma(co) < luma(tx) * 0.75,
        Math.round(luma(co)) + ' vs ' + Math.round(luma(tx)));

  // EL SEÑALADO DE LA FILA. En una lista de ocho plantas con el mismo aspecto,
  // el realce es lo único que dice cuál se va a elegir. Va aquí porque su
  // variable es la HERMANA de la del fondo y se pierde igual de callada: sin
  // ella el realce no desaparece con estruendo, simplemente no ocurre.
  await page.hover('#sitioRes .it');
  const sob = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#sitioRes .it')).backgroundColor);
  check('al pasar por encima, la fila se señala',
        !igual(rgba(sob), fondo) && rgba(sob).a === 1, sob + ' vs ' + M.fondo);

  // EL VEREDICTO DEL CAREO. Dos ramas, dos colores: si resolvieran al mismo
  // —o a nada— «coincide» y «no coincide» se verían igual.
  check('el color de «coincide» del careo existe', /^#|rgb/.test(M.ok), M.ok);
  check('el de «no coincide» también', /^#|rgb/.test(M.warn), M.warn);
  check('y no son el mismo color', M.ok !== M.warn, M.ok + ' / ' + M.warn);

  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FAIL');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
