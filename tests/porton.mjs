/* EL CONVENIO DEL PORTÓN, PARA LOS BANCOS QUE USAN `node:assert`.
 *
 * ═══ EL PROBLEMA QUE ESTO RESUELVE ═══
 *
 * `tests/correr.sh` no saca el veredicto del código de salida: lo LEE del
 * recuento de líneas `OK   ` que publica cada banco, y exige un piso. El
 * motivo está escrito allí y vale repetirlo: un banco que revienta antes de
 * comprobar nada, o que se come la mitad de sus comprobaciones por un `return`
 * temprano, sale con 0 y se colaría como verde silencioso. El piso es lo que lo
 * impide, y el piso necesita un recuento.
 *
 * Un banco escrito con `node:assert` no publica nada: calla al pasar y
 * revienta al fallar. Es una forma perfectamente razonable de escribir pruebas
 * —y la de las de `node --test`— pero en esta puerta cuenta CERO, así que
 * cualquier piso lo pone rojo y sin piso cae al `:-1`, que es un umbral que no
 * puede fallar. Las dos salidas son malas.
 *
 * ═══ POR QUÉ UN ENVOLTORIO Y NO UNA REESCRITURA ═══
 *
 * Porque reescribir 87 aserciones a mano es la manera de perder una. La
 * superficie de `assert` se conserva EXACTA: los sitios de llamada no se tocan
 * ni una coma, sólo cambia de dónde viene `assert`. Lo que el envoltorio añade
 * es la publicación y el recuento.
 *
 * Y cambia una cosa a propósito: `assert` corta el banco en la primera
 * aserción que falla, y esto no. Se anota el fallo y se sigue, que es lo que
 * hace falta para ver TODOS los fallos de una corrida en vez de uno por
 * corrida. Si el propio código del banco revienta después —porque siguió
 * adelante con un valor malo— el banco muere ahí, publica menos comprobaciones
 * que su piso y la puerta lo caza. O sea que el piso sigue siendo la red.
 *
 * ═══ EL NOMBRE DE CADA COMPROBACIÓN ═══
 *
 * Sale del sitio de llamada: fichero, línea y COLUMNA. La columna no es
 * decoración —estos bancos están escritos densos, con varias aserciones en la
 * misma línea— así que sin ella dos comprobaciones distintas publicarían el
 * mismo nombre y un recuento de nombres únicos mentiría. Y se acompaña del
 * trozo de fuente que la hace, para que la línea se lea sin abrir el fichero.
 */

import assertReal from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let pasadas = 0;
let fallos = 0;

/* El fuente de cada banco se lee UNA vez y se guarda, para poder citar la
   expresión que hace cada comprobación sin releer el fichero 87 veces. */
const fuentes = new Map();
function lineaDe(fichero, linea) {
  if (!fuentes.has(fichero)) {
    try { fuentes.set(fichero, readFileSync(fichero, 'utf8').split('\n')); }
    catch { fuentes.set(fichero, null); }
  }
  const ls = fuentes.get(fichero);
  return ls && ls[linea - 1] !== undefined ? ls[linea - 1] : null;
}

/* El sitio de llamada, sacado de la pila. `stackTraceLimit` se sube porque el
   valor por defecto puede recortar justo el marco que hace falta. */
function sitio() {
  const antes = Error.stackTraceLimit;
  Error.stackTraceLimit = 20;
  const pila = (new Error().stack || '').split('\n');
  Error.stackTraceLimit = antes;
  /* se busca el primer marco que NO sea de este fichero: ése es quien llama */
  const yo = fileURLToPath(import.meta.url);
  for (const l of pila.slice(1)) {
    const m = l.match(/\(?(?:file:\/\/)?((?:\/|[A-Za-z]:)[^\s:()]+):(\d+):(\d+)\)?\s*$/);
    if (!m) continue;
    if (m[1] === yo) continue;
    const corto = m[1].slice(m[1].lastIndexOf('/') + 1);
    const linea = Number(m[2]), col = Number(m[3]);
    const src = lineaDe(m[1], linea);
    /* la expresión empieza en la columna de la llamada; se recorta a lo que
       cabe en una línea de log sin partir el sentido */
    let expr = '';
    if (src) {
      expr = src.slice(col - 1).trim();
      const hasta = expr.search(/;\s*(assert|await)/);
      if (hasta > 0) expr = expr.slice(0, hasta);
      if (expr.length > 70) expr = expr.slice(0, 67) + '...';
    }
    return `${corto}:${linea}:${col}` + (expr ? ' · ' + expr : '');
  }
  return 'sitio desconocido';
}

function pasa(donde) { pasadas++; console.log('OK   ' + donde); }
function falla(donde, e) {
  fallos++;
  const msg = (e && (e.message || String(e)) || 'sin mensaje').split('\n')[0];
  console.log('FAIL ' + donde + ' -> ' + msg);
}

function envuelve(fn, receptor) {
  return function (...args) {
    const donde = sitio();
    let r;
    try {
      r = fn.apply(receptor, args);
    } catch (e) { falla(donde, e); return undefined; }
    /* `assert.rejects` y `doesNotReject` devuelven promesa: el veredicto de
       esas no se sabe hasta que resuelve, así que se devuelve la promesa ya
       encadenada y el banco tiene que esperarla —como ya hacía con `assert`. */
    if (r && typeof r.then === 'function') {
      return r.then(() => pasa(donde), (e) => { falla(donde, e); });
    }
    pasa(donde);
    return r;
  };
}

/* Se envuelve con Proxy y no con una lista de métodos: una lista se queda
   corta en silencio el día que un banco use `assert.doesNotThrow`, y entonces
   esa comprobación no se publicaría y el recuento mentiría por defecto. */
export const assert = new Proxy(assertReal, {
  apply(destino, _this, args) { return envuelve(destino, undefined)(...args); },
  get(destino, prop, receptor) {
    const v = Reflect.get(destino, prop, receptor);
    if (typeof v !== 'function') return v;
    return envuelve(v, destino);
  },
});

export function cuentas() { return { pasadas, fallos }; }

/* EL VEREDICTO. Sale con 1 si ha fallado algo, y con 2 si no ha comprobado
   NADA: cero comprobaciones no es un pase, es un banco que no ha llegado a
   ejecutarse, y decirlo aquí es más barato que dejárselo al piso. */
export function veredicto() {
  console.log(`\n  ${pasadas} comprobaciones · ${fallos} fallos`);
  if (fallos) { process.exit(1); }
  if (pasadas === 0) {
    console.log('  NO COMPROBADO: cero comprobaciones publicadas.');
    process.exit(2);
  }
  process.exit(0);
}

export default assert;
