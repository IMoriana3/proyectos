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

/* ── QUIÉN DEFINE EL CATÁLOGO: AHORA ESTE FICHERO ────────────────────────────
 *
 * Hasta el 2026-10-22 esto se recortaba de `cartera-tabla.html` con
 * `recortaPublicador()`, y era lo correcto MIENTRAS la técnica fuera la dueña:
 * una sola definición, y si allí cambiaban los campos, aquí cambiaban solos.
 *
 * Pero la decisión es dejar UNA sola cartera, la de Supabase, y borrar la
 * técnica. Un generador que recorta su propia lógica del fichero que va a
 * desaparecer no se puede quedar así: el día del borrado dejaría de saber qué
 * publicar. Así que la definición se muda aquí, que es donde va a vivir.
 *
 * LA MUDANZA NO SE DA POR BUENA SOLA. Mientras la técnica exista, la otra
 * implementación sigue recortándose y `careaPublicador()` las compara sobre el
 * SEED de verdad: si difieren en una sola celda, la puerta canta. Copiar código
 * de un sitio a otro es justo donde se cuelan las diferencias de una coma, y
 * «lo he copiado con cuidado» no es una comprobación.
 *
 * El día que se borre `cartera-tabla.html`, se van con ella `recortaFuncion`,
 * `recortaPublicador` y el careo. Lo que queda es esto. */

export const NPROY = { '24002': '23003' };

export function firstInt(v) {
  const m = String(v == null ? '' : v).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

export function num(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : 0;
}

/* LOS 18 CAMPOS DEL CATÁLOGO. Transcrito de `publishSpecs()` de la técnica, con
   sus rarezas intactas porque son deliberadas:
     · `cod` va TAL CUAL —número o cadena—, que es como distingue `26126.1` de
       `"26126.2"`: los tres códigos repetidos de la cartera son emplazamientos
       distintos y colapsarlos sería mentir sobre los datos;
     · `mods` sale de `firstInt(r.string)`, porque ahí hay cosas como `"24/27"`
       o `"42/14"` y lo que se publica es el primer entero;
     · `lat`/`lon`/`wmod` distinguen VACÍO (null) de cero, y `pac`/`pdc` no: un
       cero en potencia es un dato —Páramo está a 0— y un `lat` vacío no lo es;
     · `pac`/`pdc` se publican desde el 2026-10: antes no, y por eso ninguna
       otra página podía decir la potencia de una planta aunque la cartera la
       tuviera. */
export function publicaSpecs(datos) {
  const map = {};
  for (const r of datos) {
    const cod = r.num;
    if (cod == null || String(cod).trim() === '') continue;
    map[String(cod)] = {
      cod: cod,
      nproy: (NPROY[String(cod)] || String(cod)),
      nombre: r.proyecto || '',
      mods: firstInt(r.string),
      pitch: (r.pitch == null ? '' : String(r.pitch)),
      lat: (r.lat === '' || r.lat == null) ? null : num(r.lat),
      lon: (r.lon === '' || r.lon == null) ? null : num(r.lon),
      wmod: (r.wmod === '' || r.wmod == null) ? null : num(r.wmod),
      pac: num(r.pac),
      pdc: num(r.pdc),
      trk_total: num(r.trk_total),
      trk_bi: num(r.trk_bi),
      trk_mono: num(r.trk_mono),
      cantidad: num(r.cantidad),
      ncu_eth: num(r.ncu_eth),
      ncu_fo: num(r.ncu_fo),
      estado_pem: r.estado_pem || '',
      pais: r.pais || '',
    };
  }
  return map;
}

/* ── EL CONTROL, QUE VIVE LO QUE VIVA LA TÉCNICA ─────────────────────────────
 *
 * `publishSpecs()` y sus tres ayudantes, tal cual están en la página. Ya no se
 * usa para generar: se usa para CAREAR contra `publicaSpecs()` de arriba. */
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

/* CAREO DE LAS DOS IMPLEMENTACIONES, sobre el SEED de verdad y no sobre un
   ejemplo: una diferencia de una coma sólo sale con los datos reales, que son
   los que llevan `"24/27"`, el `26126.1` numérico y el `"26126.2"` en texto.
   Devuelve la lista de diferencias; vacía es que la mudanza no perdió nada.
   `null` es NO COMPROBADO —no se pudo recortar la técnica—, que no es lo
   mismo que «iguales» y no se cuenta como verde. */
export function careaPublicador(html) {
  const seed = recortaSeed(html);
  const extraido = recortaPublicador(html);
  if (!seed || !extraido) return null;
  let deLaTecnica;
  try { deLaTecnica = extraido(migraFasesDelHtml(html, seed)); } catch { return null; }
  const propio = publicaSpecs(migraFasesDelHtml(html, seed));
  const difs = [];
  const claves = new Set([...Object.keys(deLaTecnica), ...Object.keys(propio)]);
  for (const k of claves) {
    const a = JSON.stringify(deLaTecnica[k]), b = JSON.stringify(propio[k]);
    if (a !== b) difs.push({ planta: k, tecnica: a, propio: b });
  }
  return difs;
}

/* Las fases se migran igual que al cargar la página, para que lo que se carea
   —y lo que se genera— sea lo que publicaría la aplicación y no el literal en
   bruto. Si no se puede migrar se usa el literal: el catálogo no mira las
   fases, así que no cambia el resultado. */
function migraFasesDelHtml(html, seed) {
  const mig = html.match(/function migrateFases\(a\)\{[\s\S]*?return a;\}/);
  if (!mig) return seed;
  try {
    const FASE = new Function('return ' + html.match(/FASE=(\[[^\]]*\])/)[1])();
    const FKEYS = new Function('return ' + html.match(/const FKEYS=(\[[^\]]*\])/)[1])();
    return new Function('FASE', 'FKEYS', 'a', mig[0] + '\nreturn migrateFases(a);')(FASE, FKEYS, seed);
  } catch { return seed; }
}

export function construye(html) {
  const seed = recortaSeed(html);
  if (!seed) return null;
  /* Genera con la implementación PROPIA, no con la recortada: ésta es la que
     va a sobrevivir al borrado de la técnica. La recortada sigue existiendo
     como control, y `careaPublicador()` prueba que dicen lo mismo. */
  try { return publicaSpecs(migraFasesDelHtml(html, seed)); } catch { return null; }
}

/* ── el fichero ──────────────────────────────────────────────────────────── */

const AYUDANTE = `
/* EL AYUDANTE QUE LEEN LAS PÁGINAS.
 *
 * Devuelve el catálogo como CADENA JSON, no como objeto, para que la línea de
 * cada página cambie lo mínimo: todas hacían
 * \`JSON.parse(localStorage.getItem('factiun_plantas')||...)\` y ahora hacen
 * \`JSON.parse((window.FACTIUN_CATALOGO_JSON&&window.FACTIUN_CATALOGO_JSON()||localStorage.getItem('factiun_plantas'))||...)\`.
 * Una sustitución, idéntica en las cinco, y el resto de su flujo intacto.
 *
 * \`localStorage\` VA PRIMERO a propósito: un navegador que acaba de usar la
 * cartera tiene datos más frescos que este fichero, y no se le va a servir algo
 * más viejo de lo que ya tiene. Esto es la red de abajo, no el sustituto.
 *
 * Y si el fichero no llegó a cargar, el \`&&\` deja la expresión en el
 * \`localStorage\` de siempre: las páginas se comportan como antes en vez de
 * petar con un \`undefined is not a function\`. */
window.FACTIUN_CATALOGO_JSON = function () {
  try {
    var s = localStorage.getItem('factiun_plantas');
    if (s && s !== '{}' && s !== 'null') return s;
  } catch (e) { /* localStorage puede estar bloqueado; se sigue al fichero */ }
  try { return JSON.stringify(window.FACTIUN_PLANTAS || {}); } catch (e) { return null; }
};
`;

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
      AYUDANTE,
      '',
    ]).join('\n');
  }
  const claves = Object.keys(mapa).sort();
  const ordenado = {};
  for (const k of claves) ordenado[k] = mapa[k];
  return cab.concat([
    `/* ${claves.length} plantas */`,
    'window.FACTIUN_PLANTAS = ' + JSON.stringify(ordenado, null, 1) + ';',
    AYUDANTE,
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
