// EL PUNTERO DE LA TARJETA A LA APP — que siga resolviendo.
//
// ESTE ARNÉS HACÍA OTRA PREGUNTA, Y LA PREGUNTA ERA EL SÍNTOMA. Nació para
// carear DOS números: el escrito a mano en la tarjeta del Panel y el que
// declara la app (`const VER`). Cazó deriva real CINCO veces en una semana
// —v1.63, v1.64, v1.68, el salto de v1.70 a v1.76, y la v1.77.0— y las cinco
// DESPUÉS de que ocurriera. Un número copiado a mano solo puede envejecer: un
// careo acorta la ventana, no la cierra.
//
// La quinta ocurrió con este arnés ya reescrito y su PR abierto: hubo que
// subir la tarjeta a mano a v1.77.0 para devolver el careo a verde, y ese
// commit dio CONFLICTO con la línea que lo elimina.
//
// Así que el Panel dejó de copiarlo. Las tarjetas de las apps que declaran su
// versión de forma legible por máquina ya no llevan `version:`, llevan
// `verEnApp: true`, y el número lo LEE la página de la app al pintarse. Con
// eso desaparece la clase entera de defecto: no hay dos números que puedan
// discrepar porque solo hay uno.
//
// LO QUE QUEDA POR VIGILAR, QUE NO ES LO MISMO Y ES MENOS. Un puntero también
// se rompe, solo que de otras maneras:
//
//   · la app deja de declarar `VER` donde la regla lo busca (se renombra, se
//     mueve fuera del bloque, cambia de comillas) -> el Panel se queda sin
//     numero y NADIE se entera, porque no hay nada que discrepe;
//   · la tarjeta apunta a una url que ya no sirve ese fichero;
//   · alguien vuelve a escribir `version:` al lado del puntero «por si acaso»
//     y la copia entra por la puerta de atrás.
//
// UNA SOLA DEFINICIÓN DE LA REGLA, Y ES LA DEL PANEL. La expresión que busca
// `VER` se EXTRAE de `index.html`, no se copia aquí. Si se copiara, el día que
// cambie el formato de la declaración este arnés seguiría verde leyendo con la
// regla vieja mientras el Panel se queda a oscuras — que es exactamente el
// defecto que este fichero existe para impedir, cometido por el fichero mismo.
//
// QUÉ MANDA, Y POR QUÉ NO ES PAGES. El careo se hace contra el fichero en
// `main`. Pages va por detrás de `main` unos minutos después de cada merge,
// así que exigirle a Pages pondría esto en ROJO justo al publicar por un
// retardo que no es un defecto. El retardo SE INFORMA aparte.
//
// (El Panel, en cambio, lee PAGES a propósito: el número que enseña describe
// la app que el usuario va a abrir al pulsar, y ésa es la publicada. Las dos
// elecciones son distintas porque las preguntas son distintas.)
//
// DE DÓNDE SALE LA APP, por orden: checkout hermano —leyendo su ref
// `origin/main`, NO su árbol de trabajo— y luego `main` por HTTPS. Si no hay
// ninguna, NO se aprueba en silencio: la regla se ejercita igual sobre sus
// combinaciones y la salida DECLARA que el careo no ocurrió.
//
//   node tests/test_versiones_app.mjs
//   CAREO_SIN_RED=1 node tests/test_versiones_app.mjs   (solo hermano)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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
   - puntero Y copia: sobra la copia, es la vía de vuelta del defecto;
   - ni puntero ni copia: la tarjeta no dice nada de su version;
   - solo copia: legítimo — hay apps que no declaran version legible, y
     fingir que entran aquí sería peor que dejar el hueco a la vista;
   - puntero sin poder leer main: NO se aprueba, se declara (lo hace el que
     llama);
   - puntero y la app no declara VER: mal, el puntero no resuelve y el Panel
     se queda sin número. */
export function veredictoTarjeta({ copia, puntero, enMain }) {
  if (puntero && copia) return `la tarjeta apunta a la app Y guarda una copia (${copia}): sobra la copia`;
  if (!puntero && !copia) return 'la tarjeta no declara version ni de donde leerla';
  if (!puntero) return null;                                  // copia legítima
  if (enMain === null || enMain === undefined) return null;    // careo no hecho
  if (!enMain) return 'la app no declara VER donde la regla del Panel lo busca: el puntero no resuelve';
  return null;
}

/* El retardo de publicación NO es un defecto del repo, así que va por un canal
   distinto: informa, no suspende. */
export function veredictoPages({ enMain, enPages }) {
  if (!enMain || !enPages) return 'no comprobado';
  if (enMain === enPages) return 'al día';
  return `Pages sirve ${enPages} y main tiene ${enMain} (retardo de publicación)`;
}

// ── las combinaciones, sin disco ni red ──────────────────────────────────
check('puntero + copia -> mal, sobra la copia (la vía de vuelta del defecto)',
      /sobra la copia/.test(veredictoTarjeta(
        { copia: 'v1.76.0', puntero: true, enMain: 'v1.76.0' })));
check('ni puntero ni copia -> mal',
      veredictoTarjeta({ copia: null, puntero: false, enMain: null }) !== null);
check('solo copia -> legitimo: hay apps sin version legible',
      veredictoTarjeta({ copia: '1.26', puntero: false, enMain: null }) === null);
check('puntero sin poder leer main -> no se aprueba ni se suspende: se declara',
      veredictoTarjeta({ copia: null, puntero: true, enMain: null }) === null);
check('puntero y la app NO declara VER -> mal, el puntero no resuelve',
      /no resuelve/.test(veredictoTarjeta(
        { copia: null, puntero: true, enMain: '' })));
check('puntero y la app declara VER -> bien',
      veredictoTarjeta({ copia: null, puntero: true, enMain: 'v1.76.0' }) === null);
check('Pages por detrás de main NO es rojo, se informa',
      /retardo de publicación/.test(veredictoPages(
        { enMain: 'v1.24.0', enPages: 'v1.23.0' })));

// ── el Panel, leído de su propio index.html ──────────────────────────────
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
function bloquesInline() {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m; const src = [];
  while ((m = re.exec(idx))) src.push(m[1]);
  return src;
}
function tarjetas() {
  const blk = bloquesInline().find(c => /const PROJECTS\s*=\s*\[/.test(c));
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

/* LA REGLA DEL PANEL, EXTRAÍDA — no copiada. Si mañana `VER_RE_APP` deja de
   existir o cambia de nombre, esto se pone rojo aquí mismo en vez de dejar al
   arnés leyendo con una regla que el Panel ya no usa. */
function reglaDelPanel() {
  const blk = bloquesInline().find(c => /const VER_RE_APP\s*=/.test(c));
  if (!blk) return null;
  const m = blk.match(/const VER_RE_APP\s*=\s*(\/(?:\\.|\[(?:\\.|[^\]])*\]|[^/\\])+\/[a-z]*)/);
  if (!m) return null;
  try { return eval(m[1]); } catch { return null; }   // eslint-disable-line no-eval
}
const VER_RE = reglaDelPanel();
check('el Panel publica la regla con la que lee la version, y se extrae de ahí',
      VER_RE instanceof RegExp, 'no se encontró VER_RE_APP en index.html');
check('esa regla, ejercitada: saca el número de una declaración como la real',
      VER_RE && (("x\nconst VER='v1.76.0';\n").match(VER_RE) || [])[1] === 'v1.76.0');
check('y NO se lo inventa cuando la declaración no está',
      VER_RE && !("const OTRA='v1.0.0';").match(VER_RE));

/* LO QUE ESTE ARNÉS CUBRE, DECLARADO. Solo puede resolverse un puntero a una
   app que declare su version de forma legible por máquina, y hoy eso son los
   dos simuladores —que son, no por casualidad, donde el defecto ocurrió las
   cinco veces—. Las demás tarjetas publicadas escriben su version en prosa o
   no la escriben. */
const CAREABLES = [
  { url: 'https://imoriana3.github.io/cobertura-zigbee/overcast.html',
    repo: 'cobertura-zigbee', fichero: 'overcast.html' },
  { url: 'https://imoriana3.github.io/cobertura-zigbee/backtracking.html',
    repo: 'cobertura-zigbee', fichero: 'backtracking.html' },
];

const publicadas = (CARDS || []).filter(p => p.url && /imoriana3\.github\.io/.test(p.url));
for (const c of CAREABLES)
  check('la tarjeta de ' + c.fichero + ' sigue en el Panel',
        publicadas.some(p => p.url === c.url), 'nadie publica esa url');

/* Y QUE APUNTEN, que es lo que este cambio compra. Sin esta línea se podría
   volver a la copia tarjeta a tarjeta sin que nada se queje. */
for (const c of CAREABLES) {
  const card = publicadas.find(p => p.url === c.url);
  check('la tarjeta de ' + c.fichero + ' LEE la version de la app, no la copia',
        !!(card && card.verEnApp),
        card ? 'verEnApp=' + JSON.stringify(card.verEnApp) : 'sin tarjeta');
}

const sinCarear = publicadas.filter(p => !CAREABLES.some(c => c.url === p.url));
console.log('     ── cobertura: ' + CAREABLES.length + ' de ' + publicadas.length +
            ' tarjetas publicadas leen su version de la app. Las otras ' +
            sinCarear.length + ' no declaran una version legible por máquina:');
for (const p of sinCarear)
  console.log('        · ' + p.url.replace('https://imoriana3.github.io/', '') +
              (p.version ? ' (tarjeta: ' + p.version + ', escrita a mano)' : ' (tarjeta sin version)'));

// ── de dónde sale la app: hermano primero, main después ──────────────────
const SIN_RED = process.env.CAREO_SIN_RED === '1';
async function bajar(url) {
  if (SIN_RED) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}
const verDe = txt => { const m = txt && VER_RE && txt.match(VER_RE); return m ? m[1] : ''; };

let resueltos = 0, conHermano = 0, conRed = 0;
for (const c of CAREABLES) {
  const card = publicadas.find(p => p.url === c.url);
  const copia = card ? card.version : null;
  const puntero = !!(card && card.verEnApp);

  /* DEL HERMANO SE LEE `origin/main`, NO SU ÁRBOL DE TRABAJO. La primera
     versión leía el fichero del disco y eso NO es lo que este arnés dice
     comparar: el árbol de trabajo es la rama que el desarrollador tenga
     puesta. Lo cazó él mismo a los diez minutos de existir, y el modo de fallo
     peligroso es el contrario: una rama que ya lleva el bump daría VERDE con
     main todavía sin él.
     El interruptor existe para poder EJERCITAR la vía de red en una máquina
     que tiene el hermano al lado: sin él, la ruta que de verdad corre en CI no
     se prueba nunca y se descubre rota el día que hace falta. */
  const hermano = path.join(RAIZ, '..', c.repo);
  let enMain = null, via = null;
  const delHermano = () => {
    if (process.env.CAREO_SIN_HERMANO === '1') return null;
    if (!fs.existsSync(path.join(hermano, '.git'))) return null;
    try {
      return execFileSync('git', ['-C', hermano, 'show', 'origin/main:' + c.fichero],
                          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return null; }
  };
  const txtHermano = delHermano();
  if (txtHermano !== null) {
    enMain = verDe(txtHermano); via = 'hermano, ref origin/main'; conHermano++;
  } else {
    const txt = await bajar(`https://raw.githubusercontent.com/IMoriana3/${c.repo}/main/${c.fichero}`);
    if (txt !== null) { enMain = verDe(txt); via = 'main por HTTPS'; conRed++; }
  }
  if (enMain !== null) resueltos++;

  /* EL NOMBRE DE LA COMPROBACIÓN LLEVA EL MODO. En degradado esta línea decía
     «OK ...» SIN haber leído nada: leída por encima —que es como se leen 1.600
     líneas de arnés— pasa por comprobación hecha. Un verde que miente sobre lo
     que hizo es peor que un hueco. */
  const v = veredictoTarjeta({ copia, puntero, enMain });
  check(enMain === null
          ? 'el puntero de ' + c.fichero + ' NO SE HA RESUELTO (sin fuente): solo se exige que la tarjeta no guarde copia'
          : 'el puntero de ' + c.fichero + ' resuelve: la app declara su version donde el Panel la busca',
        v === null, v);
  console.log('     ── ' + c.fichero + ': tarjeta ' + (puntero ? 'apunta a la app' : 'copia ' + (copia || '—')) +
              (enMain === null
                ? ' · SIN fuente: no se ha podido resolver (modo declarado, no aprobado)'
                : ' · main declara ' + (enMain || '—') + ' (' + via + ')'));

  // y lo que el usuario ve AHORA, que es de donde lee el Panel y no suspende
  const pag = await bajar(c.url);
  console.log('        Pages (de donde lee el Panel): ' + (pag === null
    ? 'no alcanzable desde aquí (no suspende: el puntero lo decide main)'
    : veredictoPages({ enMain, enPages: verDe(pag) })));
}

/* El modo degradado se DECLARA y además se cuenta, para que «no se pudo
   resolver» no pueda pasar por «resuelto y bien» al leer la salida por encima. */
console.log('     ── puntero resuelto en ' + resueltos + ' de ' + CAREABLES.length +
            ' apps (' + conHermano + ' por checkout hermano, ' + conRed + ' por main) ──');
check('el modo de la resolución queda declarado en la salida', true);

console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
process.exit(ko ? 1 : 0);
