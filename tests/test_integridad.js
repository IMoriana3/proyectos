// Integridad del Panel — SIN navegador, corre en 2 s. Nace de las dos incidencias de la #39:
// un volcado de index.html borró 6 tarjetas y dos docs, y el diff no lo cantaba.
// Comprueba lo que un diff no ve:
//   1) el <script> inline compila           4) toda clave de PLANTS[].views está en PLANT_VIEWS
//   2) no bajan las tarjetas respecto a main 5) todo nombre de PLANT_MODULES tiene su planta
//   3) todo docId tiene su docs/<docId>.md
//   node tests/test_integridad.js            (usa origin/main como referencia si hay git)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

// 1) el script inline compila
const bloques = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let err = null;
for (const b of bloques) { try { new Function(b); } catch (e) { err = e.message; break; } }
check('el script inline compila', !err, err);

// 2) recuento de tarjetas y de plantas frente a main
const nTar = (html.match(/^    name: /gm) || []).length;
const nPla = (html.match(/^  \{ name:"/gm) || []).length;
let base = null;
try { base = cp.execSync('git show origin/main:index.html', { cwd: RAIZ, stdio: ['ignore','pipe','ignore'] }).toString(); } catch (e) {}
if (base) {
  const bTar = (base.match(/^    name: /gm) || []).length, bPla = (base.match(/^  \{ name:"/gm) || []).length;
  check('no se pierden tarjetas (' + nTar + ' vs ' + bTar + ' en main)', nTar >= bTar);
  check('no se pierden plantas (' + nPla + ' vs ' + bPla + ' en main)', nPla >= bPla);
} else console.log('--   sin origin/main: me salto la comparación de recuentos');

// 3) cada docId tiene su fichero
const docIds = [...html.matchAll(/docId:\s*"([^"]+)"/g)].map(m => m[1]).filter(Boolean);
const faltan = [...new Set(docIds)].filter(d => !fs.existsSync(path.join(RAIZ, 'docs', d + '.md')));
check('todo docId tiene docs/<docId>.md (' + docIds.length + ' fichas)', !faltan.length, faltan.join(', '));

// 4) las claves de vista de PLANTS existen en PLANT_VIEWS
const mPV = html.match(/PLANT_VIEWS\s*=\s*\[([\s\S]*?)\n\];/);
if (mPV) {
  const validas = new Set([...mPV[1].matchAll(/key\s*:\s*"([^"]+)"/g)].map(m => m[1]));
  const usadas = new Set();
  for (const b of html.matchAll(/views:\s*\{([\s\S]*?)\n\s*\}\}/g))
    for (const k of b[1].matchAll(/^\s*(\w+)\s*:/gm)) usadas.add(k[1]);
  const malas = [...usadas].filter(k => !validas.has(k));
  check('las claves de PLANTS[].views están en PLANT_VIEWS', !malas.length, malas.join(', '));
} else console.log('--   no encuentro PLANT_VIEWS: me salto la comprobación de claves');

// 5) cada nombre de PLANT_MODULES tiene su planta (si no, la tarjeta se vuelve invisible)
const mPM = html.match(/PLANT_MODULES\s*=\s*new Set\(\[([\s\S]*?)\]\);/);
if (mPM) {
  const fichas = new Set([...html.matchAll(/^    name: "([^"]+)"/gm)].map(m => m[1]));
  const mods = [...mPM[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const huerfanos = mods.filter(n => !fichas.has(n));   // en PLANT_MODULES pero sin ficha: desaparece del Panel entero
  check('todo nombre de PLANT_MODULES tiene su ficha en PROJECTS', !huerfanos.length, huerfanos.join(', '));
} else console.log('--   no encuentro PLANT_MODULES: me salto la comprobación');

console.log('\n' + (ko ? 'FALLOS: ' + ko + ' (de ' + (ok + ko) + ')' : 'OK — ' + ok + '/' + ok + ' comprobaciones'));
process.exit(ko ? 1 : 0);
