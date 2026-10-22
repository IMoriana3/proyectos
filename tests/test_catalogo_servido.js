/* ¿ESTÁN LAS SEIS PÁGINAS ENGANCHADAS AL CATÁLOGO SERVIDO?
 *
 * ═══ POR QUÉ ═══
 *
 * `cartera-tabla.html` publica el catálogo de plantas en `localStorage` bajo
 * `factiun_plantas`, y seis páginas de este repo lo leen: layout, sim-solar,
 * meteo (por `lib/meteo-browser.js`), comparador-estructuras, sim-viento y
 * generador-layout.
 *
 * Hoy funcionan, pero sólo porque la técnica existe Y alguien la abre en ese
 * navegador. Son las dos premisas que van a caducar: la cartera se va a borrar
 * —se decidió dejar una sola, la de Supabase— y entonces estas seis se
 * quedarían con el selector VACÍO sin dar error, que es exactamente lo que les
 * pasó a las cinco de Cobertura-Zigbee cuando aquel repo cambió de dominio.
 *
 * Aquí el fallo todavía NO ha ocurrido. Esta puerta existe para que no ocurra:
 * engancha cada página a `data/plantas.js` —el catálogo como fichero que este
 * mismo origen se sirve— y vigila que siga enganchada.
 *
 * ═══ LOS TRES FALLOS QUE VIGILA ═══
 *
 * 1. Que una página se quede SIN enganchar. Sería invisible hasta el día del
 *    borrado, y entonces invisible otra vez: selector vacío, sin error.
 * 2. Que el `<script>` del catálogo vaya DESPUÉS del código que lo lee. Las
 *    seis leen en el arranque, así que un orden mal puesto deja
 *    `window.FACTIUN_PLANTAS` sin definir justo cuando hace falta —y como la
 *    lectura va dentro de un `try`, tampoco daría error.
 * 3. Que `localStorage` deje de ir primero. Si el fichero ganara, un navegador
 *    con la cartera recién usada vería datos más viejos que los suyos.
 *
 * ═══ MET EO VA APARTE, Y A PROPÓSITO ═══
 *
 * `meteo.html` no lee el buzón: lo lee `lib/meteo-browser.js` por ella
 * (`loadFactiunPlants`). Así que a la página le toca cargar el fichero y a la
 * librería usar el ayudante. Se comprueban las dos cosas por separado, porque
 * cada una se puede romper sin la otra.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const FICHERO = path.join(RAIZ, 'data', 'plantas.js');

/* las cinco que leen en la propia página, y meteo, que lee por la librería */
const EN_LA_PAGINA = ['layout.html', 'sim-solar.html', 'comparador-estructuras.html',
                      'sim-viento.html', 'generador-layout.html'];
const POR_LIBRERIA = { pagina: 'meteo.html', libreria: path.join('lib', 'meteo-browser.js') };
const PAGINAS = EN_LA_PAGINA.concat([POR_LIBRERIA.pagina]);

let ok = 0;
const fallos = [];
function chk(nombre, real, esperado) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('OK   ' + nombre); return true; }
  console.log('FAIL ' + nombre + ' -> esperado ' + b + ', medido ' + a);
  fallos.push(nombre);
  return false;
}
const chkQue = (n, c) => chk(n, !!c, true);

/* ── 1. el fichero del catálogo ──────────────────────────────────────────── */
chkQue('data/plantas.js existe', fs.existsSync(FICHERO));
if (!fs.existsSync(FICHERO)) {
  console.log('NO COMPROBADO: sin el fichero no hay nada que comprobar.');
  process.exit(2);
}
const src = fs.readFileSync(FICHERO, 'utf8');
const ventana = {};
try {
  new Function('window', 'localStorage', src)(ventana, { getItem: () => null });
  ok++; console.log('OK   se evalúa como lo haría un <script>');
} catch (e) {
  console.log('FAIL el fichero no es JavaScript válido -> ' + (e && e.message));
  fallos.push('el fichero no es JavaScript válido');
}
chkQue('define window.FACTIUN_PLANTAS', ventana.FACTIUN_PLANTAS && typeof ventana.FACTIUN_PLANTAS === 'object');
chkQue('define el ayudante window.FACTIUN_CATALOGO_JSON', typeof ventana.FACTIUN_CATALOGO_JSON === 'function');

/* ── 2. el ayudante, en sus cuatro casos ─────────────────────────────────── */
function conLs(ls) {
  const w = {};
  new Function('window', 'localStorage', src)(w, ls);
  const j = w.FACTIUN_CATALOGO_JSON();
  return j ? Object.keys(JSON.parse(j)) : null;
}
const delFichero = Object.keys(ventana.FACTIUN_PLANTAS || {});
chk('localStorage vacío -> el fichero', conLs({ getItem: () => null }), delFichero);
chk('localStorage «{}» -> el fichero', conLs({ getItem: () => '{}' }), delFichero);
/* EL QUE IMPORTA: el navegador manda cuando tiene datos. */
chk('localStorage con datos -> MANDA el navegador',
  conLs({ getItem: () => JSON.stringify({ 99999: { cod: 99999 } }) }), ['99999']);
chk('localStorage bloqueado -> cae al fichero sin petar',
  conLs({ getItem: () => { throw new Error('bloqueado'); } }), delFichero);

/* ── 3. las seis páginas cargan el fichero ───────────────────────────────── */
const sinScript = [];
for (const p of PAGINAS) {
  if (fs.readFileSync(path.join(RAIZ, p), 'utf8').indexOf('data/plantas.js') < 0) sinScript.push(p);
}
chk('las seis cargan el fichero del catálogo', sinScript, []);

/* ── 4. las cinco que leen en la página usan el ayudante, y en orden ─────── */
const sinAyudante = [], ordenMal = [], lecturaSuelta = [];
for (const p of EN_LA_PAGINA) {
  const h = fs.readFileSync(path.join(RAIZ, p), 'utf8');
  const iScript = h.indexOf('data/plantas.js');
  const iLee = h.indexOf('FACTIUN_CATALOGO_JSON');
  if (iLee < 0) sinAyudante.push(p);
  if (iScript >= 0 && iLee >= 0 && iScript > iLee) ordenMal.push(p);
  /* ninguna lectura directa puede quedar sin el ayudante delante */
  const re = /localStorage\.getItem\(['"]factiun_plantas['"]\)/g;
  let m;
  while ((m = re.exec(h)) !== null) {
    if (!h.slice(Math.max(0, m.index - 70), m.index).includes('FACTIUN_CATALOGO_JSON')) {
      lecturaSuelta.push(p + '@' + m.index);
    }
  }
}
chk('las cinco que leen en la página usan el ayudante', sinAyudante, []);
chk('el <script> va antes de la lectura en las cinco', ordenMal, []);
chk('no queda ninguna lectura directa sin el ayudante', lecturaSuelta, []);

/* ── 5. meteo: la página carga el fichero y la LIBRERÍA usa el ayudante ──── */
const lib = fs.readFileSync(path.join(RAIZ, POR_LIBRERIA.libreria), 'utf8');
chkQue('meteo-browser.js usa el ayudante', lib.indexOf('FACTIUN_CATALOGO_JSON') >= 0);
const sueltaLib = [];
{
  const re = /localStorage\.getItem\(['"]factiun_plantas['"]\)/g;
  let m;
  while ((m = re.exec(lib)) !== null) {
    if (!lib.slice(Math.max(0, m.index - 70), m.index).includes('FACTIUN_CATALOGO_JSON')) {
      sueltaLib.push(POR_LIBRERIA.libreria + '@' + m.index);
    }
  }
}
chk('ni en la librería queda una lectura suelta', sueltaLib, []);

/* ── 6. y el fichero tiene que llegar al sitio publicado ─────────────────── */
/* `build-cloudflare-pages.sh` copia sólo unos directorios concretos. Si
   `data/` saliera de esa lista, el <script> daría 404 y volveríamos al selector
   vacío —esta vez con el agravante de que las páginas ya no leerían otra cosa. */
const build = fs.readFileSync(path.join(RAIZ, 'tools', 'build-cloudflare-pages.sh'), 'utf8');
chkQue('el paquete de Pages copia data/', /for dir in [^\n]*\bdata\b/.test(build));

console.log('\n  ' + ok + ' comprobaciones OK · ' + delFichero.length + ' plantas en el catálogo servido');
if (fallos.length) { console.log('  MAL ' + fallos.length + ': ' + fallos.join(' · ')); process.exit(1); }
process.exit(0);
