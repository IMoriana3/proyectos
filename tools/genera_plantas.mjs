/* GENERA `data/plantas.js`: EL CATÁLOGO DE PLANTAS COMO FICHERO SERVIDO.
 *
 * ═══ EL PROBLEMA QUE RESUELVE ═══
 *
 * `cartera-tabla.html` publica el catálogo en `localStorage` bajo
 * `factiun_plantas` y once páginas lo leen. `localStorage` es POR ORIGEN, y la
 * suite dejó de estar en un solo origen: Proyectos en `panel-im3.pages.dev` y
 * Cobertura-Zigbee en `cobertura-zigbee.imoriana3.workers.dev`. Las cinco
 * páginas de allí leen un almacén donde nadie escribe, y no dan error: salen
 * con el selector de plantas VACÍO. Confirmado el 2026-10-22.
 *
 * De las tres salidas posibles —un proxy inverso, un dominio propio, o publicar
 * el catálogo como fichero— sólo ésta arregla la CLASE de problema: un fichero
 * que cada origen se sirve a sí mismo no le importa en qué dominio esté nadie,
 * así que mover un repo mañana no vuelve a romperlo.
 *
 * ═══ POR QUÉ UN `.js` Y NO UN `.json` ═══
 *
 * Porque las cinco páginas leen el catálogo en UNA LÍNEA SÍNCRONA, y tres de
 * ellas calculan su `SPEC` así, en el arranque del módulo. Un `fetch` es
 * asíncrono y arrastraría reescribir ese flujo en cada una. Un
 * `<script src="./datos/plantas.js">` que asigna una global es síncrono, así
 * que la línea cambia y nada más se mueve.
 *
 * ═══ POR QUÉ NO SE REIMPLEMENTA `publishSpecs()` ═══
 *
 * Porque entonces habría dos definiciones del catálogo y divergirían. Esto
 * RECORTA la función de `cartera-tabla.html` y la ejecuta: si allí cambia qué
 * campos publica, aquí cambia solo. El banco comprueba que el recorte sigue
 * encontrando la función.
 *
 * ═══ NIEGA POR DEFECTO ═══
 *
 * El catálogo lleva nombre de proyecto, coordenadas, potencias, trackers, NCUs
 * y país: dato identificable de cliente. Así que esto NO escribe el catálogo a
 * menos que se confirme explícitamente que el origen que lo va a servir está
 * detrás de Access, con la misma variable que ya usa
 * `tools/build-cloudflare-pages.sh`:
 *
 *     FACTIUN_PAGES_ACCESS_CONFIRMED=1 node tools/genera_plantas.mjs
 *
 * Sin ella escribe un fichero VÁLIDO pero con el catálogo vacío y el motivo
 * dentro. Las páginas entonces se comportan igual que hoy —selector vacío— en
 * vez de romperse: degradar no es lo mismo que fallar.
 *
 * Uso:
 *     node tools/genera_plantas.mjs [--salida data/plantas.js] [--comprobar]
 *
 *   --comprobar   no escribe: sale 1 si el fichero del disco no es el que
 *                 saldría ahora. Es lo que usa el banco para que no se quede
 *                 viejo respecto a la cartera.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FUENTE = path.join(RAIZ, 'cartera-tabla.html');

/* ── recortar del fuente lo que define el catálogo ───────────────────────── */

/* El literal `const SEED = [...]` se recorta por BALANCE DE CORCHETES y no con
   una expresión regular: lleva comas, llaves y acentos dentro, y una regex
   perezosa lo corta a mitad. */
export function recortaSeed(html) {
  const i = html.indexOf('const SEED');
  const j = html.indexOf('[', i);
  if (i < 0 || j < 0) return null;
  let prof = 0, fin = -1, enTexto = false, esc = false;
  for (let k = j; k < html.length; k++) {
    const c = html[k];
    if (enTexto) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') enTexto = false; continue; }
    if (c === '"') { enTexto = true; continue; }
    if (c === '[') prof++;
    else if (c === ']') { prof--; if (prof === 0) { fin = k; break; } }
  }
  if (fin < 0) return null;
  try { return JSON.parse(html.slice(j, fin + 1)); } catch { return null; }
}

/* UNA FUNCIÓN RECORTADA POR BALANCE DE LLAVES, no por regex.
 *
 * La primera versión usaba `/function firstInt\(v\)\{[\s\S]*?\n\}/` y fallaba:
 * `firstInt` está TODO en una línea, así que el `\n\}` no aparece dentro de
 * ella y la regex se iba de largo hasta el siguiente `}` a principio de línea
 * del fichero, tragándose código ajeno. El resultado no compilaba y el
 * generador decía «no se ha podido recortar» sin decir por qué.
 *
 * Una función de una línea y una de veinte se recortan igual contando llaves,
 * así que se cuentan. Hay que saltarse cuatro cosas donde un contador ingenuo
 * se despista: textos, expresiones regulares literales, y LOS DOS TIPOS DE
 * COMENTARIO.
 *
 * Los comentarios costaron el segundo intento. `publishSpecs()` lleva dentro
 * uno de bloque que empieza por `/* pac/pdc no se publicaban…`, y el escáner
 * —que miraba textos y regex pero no comentarios— tomó ese `/` por el inicio
 * de una expresión regular, la cerró en la barra de «pac/pdc», y a partir de
 * ahí leyó la prosa del comentario como código. El recuento de llaves no
 * volvía a cero nunca y el recorte salía null. */
export function recortaFuncion(html, nombre) {
  const i = html.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  const j = html.indexOf('{', i);
  if (j < 0) return null;
  let prof = 0, enTexto = null, enRegex = false, esc = false, comentario = null;
  for (let k = j; k < html.length; k++) {
    const c = html[k], sig = html[k + 1];
    if (comentario === 'linea') { if (c === '\n') comentario = null; continue; }
    if (comentario === 'bloque') { if (c === '*' && sig === '/') { comentario = null; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (enTexto) { if (c === enTexto) enTexto = null; continue; }
    if (enRegex) { if (c === '/') enRegex = false; continue; }
    /* los comentarios se miran ANTES que la regex: `/*` es las dos cosas a la
       vez para un escáner que no los distingue, y gana el comentario */
    if (c === '/' && sig === '*') { comentario = 'bloque'; k++; continue; }
    if (c === '/' && sig === '/') { comentario = 'linea'; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { enTexto = c; continue; }
    /* `/` abre una regex literal sólo si lo anterior no puede acabar un valor */
    if (c === '/' && /[(=,:[!&|?+\-*%~^<>]\s*$/.test(html.slice(Math.max(0, k - 12), k))) { enRegex = true; continue; }
    if (c === '{') prof++;
    else if (c === '}') { prof--; if (prof === 0) return html.slice(i, k + 1); }
  }
  return null;
}

/* `publishSpecs()` y sus tres ayudantes, tal cual están en la página. Si allí
   cambia qué campos se publican, aquí cambia sin tocar nada. */
export function recortaPublicador(html) {
  const trozos = [];
  for (const nombre of ['firstInt', 'num', 'publishSpecs']) {
    const f = recortaFuncion(html, nombre);
    if (!f) return null;
    trozos.push(f);
  }
  const np = html.match(/const NPROY=\{[^}]*\};/);
  if (!np) return null;
  trozos.push(np[0]);
  /* se sustituye el `localStorage.setItem` por devolver el mapa: aquí no hay
     navegador, y lo que interesa es el mapa, no el efecto */
  const src = trozos.join('\n')
    .replace(/localStorage\.setItem\('factiun_plantas',JSON\.stringify\(map\)\);/, 'return map;')
    .replace(/\}catch\(e\)\{\}/, '}catch(e){throw e;}');
  try {
    return new Function('DATA', src + '\nreturn publishSpecs();');
  } catch { return null; }
}

export function construye(html) {
  const seed = recortaSeed(html);
  const pub = recortaPublicador(html);
  if (!seed || !pub) return null;
  /* las fases se migran igual que al cargar la página, para que el catálogo sea
     el que publicaría la aplicación y no el del literal en bruto */
  const mig = html.match(/function migrateFases\(a\)\{[\s\S]*?return a;\}/);
  let datos = seed;
  if (mig) {
    try {
      const FASE = new Function('return ' + html.match(/FASE=(\[[^\]]*\])/)[1])();
      const FKEYS = new Function('return ' + html.match(/const FKEYS=(\[[^\]]*\])/)[1])();
      datos = new Function('FASE', 'FKEYS', 'a', mig[0] + '\nreturn migrateFases(a);')(FASE, FKEYS, seed);
    } catch { /* si no se puede migrar, se usa el literal: el catálogo no mira las fases */ }
  }
  try { return pub(datos); } catch { return null; }
}

/* ── el fichero ──────────────────────────────────────────────────────────── */

const CONFIRMADO = process.env.FACTIUN_PAGES_ACCESS_CONFIRMED === '1';

export function rinde(mapa, { confirmado = CONFIRMADO, cuando = null } = {}) {
  const sello = cuando || new Date().toISOString().slice(0, 10);
  const cab = [
    '/* EL CATÁLOGO DE PLANTAS, GENERADO. NO SE EDITA A MANO.',
    ' *',
    ' * Lo genera `tools/genera_plantas.mjs` desde `cartera-tabla.html`, con la',
    ' * misma `publishSpecs()` que escribe la clave `factiun_plantas`: si allí',
    ' * cambia qué campos se publican, esto cambia solo.',
    ' *',
    ' * Existe porque `localStorage` es POR ORIGEN y la suite dejó de estar en un',
    ' * solo origen. Las páginas siguen prefiriendo `localStorage` —un navegador',
    ' * con datos más frescos manda— y caen aquí cuando está vacío.',
    ` * Generado: ${sello}`,
    ' */',
  ];
  if (!confirmado) {
    return cab.concat([
      ' /* CATÁLOGO VACÍO A PROPÓSITO.',
      '  *',
      '  * El catálogo lleva nombre de proyecto, coordenadas, potencias, trackers,',
      '  * NCUs y país: dato identificable de cliente. No se escribe sin confirmar',
      '  * que el origen que lo va a servir está detrás de Cloudflare Access, con',
      '  * la misma variable que usa `tools/build-cloudflare-pages.sh`:',
      '  *',
      '  *     FACTIUN_PAGES_ACCESS_CONFIRMED=1 node tools/genera_plantas.mjs',
      '  *',
      '  * Con el catálogo vacío las páginas se comportan igual que hoy —selector',
      '  * sin plantas— en vez de romperse. Degradar no es fallar. */',
      'window.FACTIUN_PLANTAS = {};',
      'window.FACTIUN_PLANTAS_SIN_CONFIRMAR = true;',
      '',
    ]).join('\n');
  }
  const claves = Object.keys(mapa).sort();
  const ordenado = {};
  for (const k of claves) ordenado[k] = mapa[k];
  return cab.concat([
    `/* ${claves.length} plantas */`,
    'window.FACTIUN_PLANTAS = ' + JSON.stringify(ordenado, null, 1) + ';',
    '',
  ]).join('\n');
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const comprobar = argv.includes('--comprobar');
  const iS = argv.indexOf('--salida');
  const salida = path.join(RAIZ, iS >= 0 ? argv[iS + 1] : 'data/plantas.js');

  let html;
  try { html = readFileSync(FUENTE, 'utf8'); }
  catch { console.log('NO COMPROBADO: no se ha podido leer ' + FUENTE); process.exit(2); }

  const mapa = construye(html);
  if (!mapa) {
    console.log('NO COMPROBADO: no se ha podido recortar el catálogo de cartera-tabla.html.');
    console.log('  ¿cambió la forma de `const SEED`, `publishSpecs()`, `firstInt`, `num` o `NPROY`?');
    process.exit(2);
  }

  if (comprobar) {
    if (!existsSync(salida)) {
      console.log('ROJO: falta ' + path.relative(RAIZ, salida) + '. Genéralo:');
      console.log('  FACTIUN_PAGES_ACCESS_CONFIRMED=1 node tools/genera_plantas.mjs');
      process.exit(1);
    }
    const enDisco = readFileSync(salida, 'utf8');
    /* la fecha del sello no cuenta: lo que importa es el catálogo */
    const limpia = (s) => s.replace(/^ \* Generado: .*$/m, '').replace(/\r\n/g, '\n');
    /* se compara contra las DOS formas posibles —confirmada y sin confirmar—
       para que el banco no obligue a declarar Access sólo para pasar */
    const esperadoSi = rinde(mapa, { confirmado: true });
    const esperadoNo = rinde(mapa, { confirmado: false });
    if (limpia(enDisco) === limpia(esperadoSi)) {
      console.log(`MIDE: ${Object.keys(mapa).length} plantas, al día con la cartera (catálogo publicado).`);
      process.exit(0);
    }
    if (limpia(enDisco) === limpia(esperadoNo)) {
      console.log('MIDE: el fichero está al día, con el catálogo VACÍO a propósito.');
      console.log('  Para publicarlo: FACTIUN_PAGES_ACCESS_CONFIRMED=1 node tools/genera_plantas.mjs');
      process.exit(0);
    }
    console.log('ROJO: ' + path.relative(RAIZ, salida) + ' no es el que saldría de la cartera de ahora.');
    console.log('  La cartera ha cambiado y el catálogo servido se ha quedado viejo. Regenéralo.');
    process.exit(1);
  }

  mkdirSync(path.dirname(salida), { recursive: true });
  writeFileSync(salida, rinde(mapa));
  const n = Object.keys(mapa).length;
  console.log(CONFIRMADO
    ? `Escrito ${path.relative(RAIZ, salida)} con ${n} plantas.`
    : `Escrito ${path.relative(RAIZ, salida)} con el catálogo VACÍO (${n} plantas disponibles, sin publicar).\n  Para publicarlas: FACTIUN_PAGES_ACCESS_CONFIRMED=1 node tools/genera_plantas.mjs`);
  process.exit(0);
}
