// LA TARJETA CONTRA LA APP — el careo que cruza repositorios y que no existía.
//
// La versión de `backtracking.html` se quedó DOS versiones atrás (v1.61.0 con
// la v1.62 y la v1.63 dentro) y nadie lo notó: la etiqueta de la página y el
// informe del emplazamiento que exporta el usuario anunciaban una versión que
// el fichero ya no era. Se destapó de casualidad, al ir a subir la tarjeta.
// Y volvió a pasar el mismo día con `overcast.html`: la tarjeta iba a subir a
// v1.24.0 con la app diciendo v1.23.0.
//
// Dos veces el mismo defecto porque NADIE lo vigilaba: el Panel vive en este
// repo y las apps en otro, así que ningún banco de allí puede carear la
// tarjeta, y aquí no había nada que leyera la app.
//
// QUÉ MANDA, Y POR QUÉ NO ES PAGES. El careo se hace contra el fichero en
// `main`, no contra la página publicada. Pages va por detrás de `main` unos
// minutos después de cada merge, así que carear contra él pondría esto en
// ROJO justo al publicar —el momento en que más se mira— por un retardo que
// no es un defecto. El retardo SE INFORMA aparte, que es donde vale algo:
// dice lo que el usuario está viendo ahora mismo.
//
// DE DÓNDE SALE LA APP, por orden: checkout hermano (gratis y sin red), luego
// `main` por HTTPS. Si no hay ninguno, NO se aprueba en silencio: la regla se
// ejercita igual sobre sus combinaciones y la salida DECLARA que el careo no
// ocurrió — el patrón de `test_granizo_espejo.mjs`, por la misma razón.
//
//   node tests/test_versiones_app.mjs
//   CAREO_SIN_RED=1 node tests/test_versiones_app.mjs   (solo hermano)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');

let ok = 0, ko = 0;
const check = (n, cond, extra) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); }
};

/* LA REGLA, pura. `null` = en orden; si no, el motivo.
   - tarjeta sin version: mal, no hay nada que carear y la tarjeta lo calla;
   - sin poder leer main: NO se aprueba, se declara (lo hace el que llama);
   - app sin VER: mal, esa tarjeta no se puede sostener;
   - distintas: mal, y el mensaje lleva LAS DOS para no tener que ir a mirar. */
export function veredictoVersion({ tarjeta, enMain }) {
  if (!tarjeta) return 'la tarjeta no declara version';
  if (enMain === null || enMain === undefined) return null;   // careo no hecho
  if (!enMain) return 'la app no declara VER: la tarjeta no se puede carear';
  if (tarjeta !== enMain) return `la tarjeta dice ${tarjeta} y el fichero en main dice ${enMain}`;
  return null;
}

/* El retardo de publicación NO es un defecto del repo, así que va por un canal
   distinto: informa, no suspende. Separarlo de la regla de arriba es lo que
   evita el rojo falso de los minutos siguientes a cada merge. */
export function veredictoPages({ enMain, enPages }) {
  if (!enMain || !enPages) return 'no comprobado';
  if (enMain === enPages) return 'al día';
  return `Pages sirve ${enPages} y main tiene ${enMain} (retardo de publicación)`;
}

// ── las combinaciones, sin disco ni red ──────────────────────────────────
check('tarjeta sin version -> mal',
      veredictoVersion({ tarjeta: null, enMain: 'v1.0.0' }) !== null);
check('sin poder leer main -> no se aprueba ni se suspende: se declara',
      veredictoVersion({ tarjeta: 'v1.0.0', enMain: null }) === null);
check('app sin VER -> mal',
      /no declara VER/.test(veredictoVersion({ tarjeta: 'v1.0.0', enMain: '' })));
check('tarjeta por DELANTE de la app -> mal (el defecto que pasó dos veces)',
      /v1\.24\.0.*v1\.23\.0/.test(veredictoVersion(
        { tarjeta: 'v1.24.0', enMain: 'v1.23.0' })));
check('tarjeta por DETRÁS de la app -> también mal',
      veredictoVersion({ tarjeta: 'v1.62', enMain: 'v1.63.0' }) !== null);
check('iguales -> bien',
      veredictoVersion({ tarjeta: 'v1.24.0', enMain: 'v1.24.0' }) === null);
check('Pages por detrás de main NO es rojo, se informa',
      /retardo de publicación/.test(veredictoPages(
        { enMain: 'v1.24.0', enPages: 'v1.23.0' })));

// ── las tarjetas del Panel, leídas del propio index.html ─────────────────
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
function tarjetas() {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m; const src = [];
  while ((m = re.exec(idx))) src.push(m[1]);
  const blk = src.find(c => /const PROJECTS\s*=\s*\[/.test(c));
  if (!blk) return null;
  const i = blk.indexOf('const PROJECTS');
  let d = 0, j = blk.indexOf('[', i), k = j;
  for (; k < blk.length; k++) {
    const ch = blk[k];
    if (ch === '[') d++;
    else if (ch === ']' && --d === 0) break;
  }
  return eval(blk.slice(j, k + 1));   // eslint-disable-line no-eval
}
const CARDS = tarjetas();
check('index.html publica su lista de tarjetas', Array.isArray(CARDS) && CARDS.length > 0);

/* LO QUE ESTE ARNÉS CUBRE, DECLARADO. Solo se puede carear una app que declare
   su version de forma legible por máquina, y hoy eso son los dos simuladores
   —que son, no por casualidad, donde el defecto ocurrió las dos veces—. Las
   demás tarjetas publicadas escriben su version en prosa o no la escriben, y
   fingir que entran aquí seria peor que dejar el hueco a la vista. */
const CAREABLES = [
  { url: 'https://imoriana3.github.io/cobertura-zigbee/overcast.html',
    repo: 'cobertura-zigbee', fichero: 'overcast.html' },
  { url: 'https://imoriana3.github.io/cobertura-zigbee/backtracking.html',
    repo: 'cobertura-zigbee', fichero: 'backtracking.html' },
];
const VER_RE = /^const VER\s*=\s*['"]([^'"]+)['"]/m;

const publicadas = (CARDS || []).filter(p => p.url && /imoriana3\.github\.io/.test(p.url));
for (const c of CAREABLES)
  check('la tarjeta de ' + c.fichero + ' sigue en el Panel',
        publicadas.some(p => p.url === c.url), 'nadie publica esa url');

const sinCarear = publicadas.filter(p => !CAREABLES.some(c => c.url === p.url));
console.log('     ── cobertura: ' + CAREABLES.length + ' de ' + publicadas.length +
            ' tarjetas publicadas se carean. Las otras ' + sinCarear.length +
            ' no declaran su version legible por máquina:');
for (const p of sinCarear)
  console.log('        · ' + p.url.replace('https://imoriana3.github.io/', '') +
              (p.version ? ' (tarjeta: ' + p.version + ')' : ' (tarjeta sin version)'));

// ── de dónde sale la app: hermano primero, main después ──────────────────
const SIN_RED = process.env.CAREO_SIN_RED === '1';
async function bajar(url) {
  if (SIN_RED) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}
const verDe = txt => { const m = txt && txt.match(VER_RE); return m ? m[1] : ''; };

let careadas = 0, conHermano = 0, conRed = 0;
for (const c of CAREABLES) {
  const card = publicadas.find(p => p.url === c.url);
  const tarjeta = card ? card.version : null;

  // el interruptor existe para poder EJERCITAR la vía de red en una máquina que
  // tiene el hermano al lado: sin él, la ruta que de verdad corre en CI no se
  // prueba nunca y se descubre rota el día que hace falta
  const hermano = path.join(RAIZ, '..', c.repo, c.fichero);
  let enMain = null, via = null;
  if (process.env.CAREO_SIN_HERMANO !== '1' && fs.existsSync(hermano)) {
    enMain = verDe(fs.readFileSync(hermano, 'utf8')); via = 'checkout hermano'; conHermano++;
  } else {
    const txt = await bajar(`https://raw.githubusercontent.com/IMoriana3/${c.repo}/main/${c.fichero}`);
    if (txt !== null) { enMain = verDe(txt); via = 'main por HTTPS'; conRed++; }
  }
  if (enMain !== null) careadas++;

  /* EL NOMBRE DE LA COMPROBACIÓN LLEVA EL MODO. En degradado esta línea decía
     «OK la tarjeta dice lo mismo que la app» SIN haber comparado nada: leída
     por encima —que es como se leen 1.600 líneas de arnés— pasa por careo
     hecho. Un verde que miente sobre lo que hizo es peor que un hueco. */
  const v = veredictoVersion({ tarjeta, enMain });
  check(enMain === null
          ? 'la tarjeta de ' + c.fichero + ' NO SE HA CAREADO (sin fuente): solo se exige que declare version'
          : 'la tarjeta de ' + c.fichero + ' dice lo mismo que la app',
        v === null, v);
  console.log('     ── ' + c.fichero + ': tarjeta ' + (tarjeta || '—') +
              (enMain === null
                ? ' · SIN fuente: no se ha podido carear (modo declarado, no aprobado)'
                : ' · app ' + (enMain || '—') + ' (' + via + ')'));

  // y lo que el usuario ve AHORA, que no suspende a nadie
  const pag = await bajar(c.url);
  console.log('        Pages: ' + (pag === null
    ? 'no alcanzable desde aquí (no suspende: el careo lo decide main)'
    : veredictoPages({ enMain, enPages: verDe(pag) })));
}

/* El modo degradado se DECLARA y además se cuenta, para que «no se pudo
   carear» no pueda pasar por «careado y bien» al leer la salida por encima. */
console.log('     ── careo real en ' + careadas + ' de ' + CAREABLES.length +
            ' apps (' + conHermano + ' por checkout hermano, ' + conRed + ' por main) ──');
check('el modo del careo queda declarado en la salida', true);

console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
process.exit(ko ? 1 : 0);
