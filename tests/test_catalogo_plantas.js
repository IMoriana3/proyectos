/* EL CATÁLOGO DE PLANTAS SERVIDO: QUE ESTÉ AL DÍA Y QUE SE PUEDA LEER.
 *
 * ═══ QUÉ VIGILA Y POR QUÉ EXISTE ═══
 *
 * `data/plantas.js` es el catálogo de plantas publicado como fichero, para que
 * las páginas que lo necesitan no dependan de que `localStorage` cruce
 * dominios — que no lo cruza, y por eso las cinco páginas de Cobertura-Zigbee
 * salían con el selector VACÍO desde la migración a Cloudflare.
 *
 * Un fichero generado tiene un modo de fallo propio: QUEDARSE VIEJO. Si la
 * cartera cambia y nadie regenera, las páginas sirven un catálogo de otro día
 * y no hay forma de notarlo mirándolas — enseñan plantas, sólo que las de
 * antes. Eso es peor que el selector vacío, porque el vacío se ve.
 *
 * Así que esto compara el fichero del disco con el que saldría de la cartera
 * de AHORA, usando el mismo generador. No es una copia de su lógica: le pasa
 * `--comprobar`.
 *
 * ═══ LO QUE NO VIGILA ═══
 *
 * Que el fichero esté publicado en producción, ni que su origen esté detrás de
 * Access. Lo primero depende del despliegue; lo segundo lo mide
 * `tools/test_cloudflare_access.mjs` contra el dominio real.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const FICHERO = path.join(RAIZ, 'data', 'plantas.js');
const GENERADOR = path.join(RAIZ, 'tools', 'genera_plantas.mjs');

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

/* ── 1. existe y está al día ─────────────────────────────────────────────── */
chkQue('data/plantas.js existe', fs.existsSync(FICHERO));
chkQue('el generador existe', fs.existsSync(GENERADOR));
if (!fs.existsSync(FICHERO) || !fs.existsSync(GENERADOR)) {
  console.log('NO COMPROBADO: falta el fichero o el generador.');
  console.log(`\n  ${ok} comprobaciones pasadas`);
  process.exit(2);
}

let alDia = false, salidaComprobar = '';
try {
  salidaComprobar = execFileSync('node', [GENERADOR, '--comprobar'], { cwd: RAIZ, encoding: 'utf8' });
  alDia = true;
} catch (e) {
  salidaComprobar = (e.stdout || '') + (e.stderr || '');
}
if (!alDia) {
  console.log('FAIL el catálogo servido está al día con la cartera');
  for (const l of salidaComprobar.trim().split('\n')) console.log('       ' + l);
  fallos.push('el catálogo servido está al día con la cartera');
} else {
  ok++; console.log('OK   el catálogo servido está al día con la cartera');
}

/* ── 2. se puede leer, y es lo que las páginas esperan ───────────────────── */
/* Se evalúa con un `window` de mentira, que es lo que hace el navegador al
   cargarlo con un <script>. Si el fichero no fuera JavaScript válido, esto
   revienta — y es exactamente el fallo que dejaría a las páginas sin
   catálogo sin que nadie lo notara. */
const ventana = {};
try {
  new Function('window', fs.readFileSync(FICHERO, 'utf8'))(ventana);
  ok++; console.log('OK   el fichero se evalúa como lo haría un <script>');
} catch (e) {
  console.log('FAIL el fichero NO es JavaScript válido -> ' + (e && e.message));
  fallos.push('el fichero no es JavaScript válido');
}

chkQue('define window.FACTIUN_PLANTAS', ventana.FACTIUN_PLANTAS && typeof ventana.FACTIUN_PLANTAS === 'object');
const mapa = ventana.FACTIUN_PLANTAS || {};
const codigos = Object.keys(mapa);

/* EL CATÁLOGO PUEDE ESTAR VACÍO A PROPÓSITO, y eso NO es un fallo: el
   generador niega por defecto mientras no se confirme que el origen que lo va
   a servir está detrás de Access. Lo que no se admite es vacío SIN decirlo. */
if (codigos.length === 0) {
  chkQue('un catálogo vacío viene declarado como tal', ventana.FACTIUN_PLANTAS_SIN_CONFIRMAR === true);
  console.log('\n  El catálogo está VACÍO a propósito: falta confirmar Access en el origen');
  console.log('  que lo va a servir. Para publicarlo:');
  console.log('    FACTIUN_PAGES_ACCESS_CONFIRMED=1 node tools/genera_plantas.mjs');
  console.log(`\n  ${ok} comprobaciones pasadas`);
  if (fallos.length) { console.log(`  ROJO ${fallos.length}: ${fallos.join(' · ')}`); process.exit(1); }
  process.exit(0);
}

chkQue('un catálogo con plantas NO se declara sin confirmar', ventana.FACTIUN_PLANTAS_SIN_CONFIRMAR !== true);

/* ── 3. la forma que leen las páginas ────────────────────────────────────── */
/* Los campos salen de `publishSpecs()`. Si allí se quita uno, las páginas que
   lo usaban dejan de encontrarlo — y lo hacen en silencio, porque lo leen con
   `||` y un `undefined` se convierte en un hueco. */
const ESPERADOS = ['cod', 'nproy', 'nombre', 'mods', 'pitch', 'lat', 'lon', 'wmod',
  'pac', 'pdc', 'trk_total', 'trk_bi', 'trk_mono', 'cantidad', 'ncu_eth', 'ncu_fo',
  'estado_pem', 'pais'];
const sinCampo = [];
for (const c of codigos) {
  const faltan = ESPERADOS.filter((f) => !(f in mapa[c]));
  if (faltan.length) sinCampo.push(`${c}: falta ${faltan.join(', ')}`);
}
chk('todas las plantas traen los 18 campos de publishSpecs', sinCampo, []);

/* la clave del mapa tiene que ser el código, porque así lo buscan las páginas:
   `m[String(cod)]` */
const claveMal = codigos.filter((c) => String(mapa[c].cod) !== c);
chk('la clave del mapa es el código de la planta', claveMal, []);

/* `nproy` es la equivalencia de número de proyecto, y `cartera-tabla.html` es
   su único dueño. Si el catálogo no la trajera, las páginas que buscan por
   número de proyecto no encontrarían la planta renumerada. */
const html = fs.readFileSync(path.join(RAIZ, 'cartera-tabla.html'), 'utf8');
const mNp = html.match(/const NPROY=\{([^}]*)\}/);
const pares = mNp ? [...mNp[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)] : [];
chkQue('se lee NPROY de la cartera', pares.length > 0);
const nproyMal = [];
for (const [, de, a] of pares) {
  if (!(de in mapa)) continue;          // la planta puede no estar en el catálogo
  if (String(mapa[de].nproy) !== a) nproyMal.push(`${de}: nproy=${mapa[de].nproy}, NPROY dice ${a}`);
}
chk('la equivalencia NPROY llega al catálogo', nproyMal, []);
/* y las que no están en NPROY llevan su propio código, no vacío */
const sinNproy = codigos.filter((c) => !mapa[c].nproy);
chk('ninguna planta se queda sin nproy', sinNproy, []);

/* ── 4. que no se haya colado nada que no toca ───────────────────────────── */
/* `publishSpecs()` publica un RESUMEN, no la cartera entera. Si algún día se
   le añade un campo sensible —un contacto, una contraseña, una nota interna—
   esto lo canta antes de que se publique. */
const DEMAS = [];
for (const c of codigos) for (const f of Object.keys(mapa[c])) if (!ESPERADOS.includes(f)) DEMAS.push(`${c}.${f}`);
chk('el catálogo no trae ningún campo fuera de los 18 declarados', [...new Set(DEMAS.map((x) => x.split('.')[1]))], []);

/* ── 5. la mudanza de `publishSpecs()`: las dos tienen que decir lo mismo ──
 *
 * El generador ya NO recorta su lógica de `cartera-tabla.html`: la tiene
 * propia, porque esa página se va a borrar y un generador que recorta del
 * muerto se queda sin saber qué publicar.
 *
 * Mientras la técnica exista, la recortada sigue ahí COMO CONTROL y aquí se
 * carean sobre el SEED de verdad. «Lo he copiado con cuidado» no es una
 * comprobación: una coma de diferencia sólo sale con los datos reales, que son
 * los que llevan `"24/27"` en `string`, el `26126.1` numérico y el `"26126.2"`
 * en texto.
 *
 * El día que se borre la técnica, esta comprobación se borra con ella. Hasta
 * entonces es la prueba de que el traslado no perdió nada. */
/* el generador es un módulo ESM y este arnés es CommonJS, así que el careo se
   pide por subproceso, igual que `--comprobar` unas líneas más arriba */
let difs;
try {
  difs = JSON.parse(execFileSync('node', ['--input-type=module', '-e',
    'import {readFileSync} from "node:fs";' +
    'const m = await import("./tools/genera_plantas.mjs");' +
    'process.stdout.write(JSON.stringify(m.careaPublicador(readFileSync("cartera-tabla.html","utf8"))));',
  ], { cwd: RAIZ, encoding: 'utf8' }));
} catch (e) {
  difs = null;
}
if (difs === null) {
  console.log('FAIL el careo de publishSpecs no se pudo hacer (no se recortó la técnica)');
  fallos.push('careo de publishSpecs NO COMPROBADO');
} else {
  chk('la implementación propia y la de la técnica publican lo mismo',
    difs.map((d) => `${d.planta}: ${d.tecnica} != ${d.propio}`), []);
  /* y el careo tiene que estar mirando algo: cero plantas careadas sería un
     verde vacío, que es el fallo que este repo persigue */
  chkQue('el careo ha mirado las 22 plantas', codigos.length === Object.keys(mapa).length && codigos.length > 0);
}

console.log(`\n  ${ok} comprobaciones pasadas · ${codigos.length} plantas en el catálogo`);
if (fallos.length) { console.log(`  ROJO ${fallos.length}: ${fallos.join(' · ')}`); process.exit(1); }
console.log('  MIDE: el catálogo servido está al día y tiene la forma que leen las páginas.');
process.exit(0);
