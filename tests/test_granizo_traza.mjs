// Careo de la máquina de AMENAZA de hail stow: el bloque GRANIZO-FÍSICA de
// `sim-viento.html` contra el core Python — SIN navegador.
//
// PARIDAD DE TRAZA, no numérica: misma serie → misma secuencia de
// transiciones, en las mismas muestras y por las mismas condiciones, o rojo.
// Una máquina de estados no necesita tolerancia 1e-9; necesita la traza.
//
// DE DÓNDE SALEN LOS CASOS, que es la parte delicada — el golden vive en
// `SolarGPTfull` y este arnés vive aquí:
//
//   1. si está el checkout HERMANO, se lee de ahí: la fuente única LITERAL,
//      cero copias;
//   2. si no, se cae al ESPEJO commiteado en `tests/goldens/`, que lleva el
//      SHA-256 de la fuente;
//   3. y CUANDO LOS DOS ESTÁN, se carean los hashes y se falla si divergen —
//      un espejo viejo lo caza cualquiera que tenga los dos repos, que es
//      quien va a tocar esto.
//
// Los tres se regeneran con UN comando desde el core
// (`scripts/gen_goldens_hailstow.py --write`), así que una divergencia solo
// puede significar vejez, nunca «cuál de los dos es el bueno».
//
// Y como en `proyectos` no hay CI, la única defensa contra el modo degradado
// es DECLARARLO: la salida dice siempre en qué modo corrió.
//
//   node tests/test_granizo_traza.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');
const ESPEJO = path.join(AQUI, 'goldens', 'hailstow_casos.json');
const HASH = path.join(AQUI, 'goldens', 'hailstow_casos.sha256');
const FUENTE = process.env.GOLDEN_HAILSTOW || path.join(
  RAIZ, '..', 'SolarGPTfull', 'solargpt', 'tests', 'goldens', 'hailstow_casos.json');

let ok = 0, ko = 0;
const check = (n, cond, extra) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); }
};
const sha = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

// ── de dónde leemos, y se DICE ───────────────────────────────────────────
const hayFuente = fs.existsSync(FUENTE);
const hayEspejo = fs.existsSync(ESPEJO);
check('hay casos que carear (fuente hermana o espejo)', hayFuente || hayEspejo,
      `ni ${FUENTE} ni ${ESPEJO}`);
if (!hayFuente && !hayEspejo) { console.log('\nFALLOS: ' + ko); process.exit(1); }

let modo, textoCasos;
if (hayFuente) {
  textoCasos = fs.readFileSync(FUENTE, 'utf8');
  modo = 'fuente hermana (' + path.relative(RAIZ, FUENTE) + ')';
  // El careo de hashes solo es posible aquí, y por eso se hace aquí.
  if (hayEspejo) {
    const esperado = fs.existsSync(HASH)
      ? fs.readFileSync(HASH, 'utf8').trim().split(/\s+/)[0] : null;
    const real = sha(textoCasos);
    check('el espejo commiteado está AL DÍA con la fuente',
          esperado === real && sha(fs.readFileSync(ESPEJO, 'utf8')) === real,
          `esperado ${String(esperado).slice(0, 16)}… · fuente ${real.slice(0, 16)}… ` +
          '· regenera con `python scripts/gen_goldens_hailstow.py --write` en SolarGPTfull');
    modo += ' + espejo careado';
  } else {
    check('falta el espejo, que es el respaldo sin repo hermano', false,
          'regenera con `python scripts/gen_goldens_hailstow.py --write`');
  }
} else {
  textoCasos = fs.readFileSync(ESPEJO, 'utf8');
  const esperado = fs.existsSync(HASH)
    ? fs.readFileSync(HASH, 'utf8').trim().split(/\s+/)[0] : null;
  check('el espejo cuadra con su propio hash', esperado === sha(textoCasos),
        'el espejo o su hash se han tocado a mano');
  modo = 'ESPEJO (sin repo hermano: no se ha podido carear contra la fuente)';
}
console.log('     ── casos leídos de: ' + modo + ' ──');

const D = JSON.parse(textoCasos);

// ── extraer el bloque del HTML REAL, no una copia ────────────────────────
const html = fs.readFileSync(path.join(RAIZ, 'sim-viento.html'), 'utf8');
const m = html.match(/GRANIZO-FÍSICA — inicio[\s\S]*?\*\/([\s\S]*?)\/\* ═+ GRANIZO-FÍSICA — fin/);
check('el bloque GRANIZO-FÍSICA está delimitado en el HTML', !!m);
if (!m) { console.log('\nFALLOS: ' + ko); process.exit(1); }
// Un extractor que se traiga dos líneas también «compila»: el vacío y lo casi
// vacío son error, no PASS.
check('lo extraído tiene cuerpo (' + m[1].length + ' chars)', m[1].length > 6000);
check('y NO lleva una línea de DOM dentro',
      !/document\.|window\.|getElementById|querySelector/.test(m[1]),
      'la física tiene que poder correr sin página');

const ctx = { console };
vm.createContext(ctx);
try { vm.runInContext(m[1], ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const H = ctx.HAIL;
check('el bloque compila y expone HAIL', !!(H && H.simula));
if (!H) { console.log('\nFALLOS: ' + ko); process.exit(1); }

// ── la tabla y los estados son los del core ──────────────────────────────
check('los doce estados, en el orden del informe (' + H.ORDEN_ESTADOS.length + ')',
      H.ORDEN_ESTADOS.length === 12);
check('los requeridos son los mismos que exige el core',
      JSON.stringify([...H.REQUERIDOS].sort()) ===
      JSON.stringify(Object.keys(D.parametros).filter(k => H.REQUERIDOS.includes(k)).sort()),
      H.REQUERIDOS.join(','));

// ── sin parámetros NO corre, igual que el core ───────────────────────────
(() => {
  let lanzó = false;
  try { H.simula(D.casos[0].muestras, {}); } catch (e) { lanzó = /no arranca/.test(e.message); }
  check('sin parámetros se niega a correr, y dice cuáles faltan', lanzó);
})();

// ── LA TRAZA, caso por caso ──────────────────────────────────────────────
for (const c of D.casos) {
  const r = H.simula(c.muestras, D.parametros, { dt_min: c.dt_min });
  const traza = r.transiciones.map(t => [t.i, t.de, t.a, t.condicion]);
  const igual = JSON.stringify(traza) === JSON.stringify(c.esperado.traza);
  check(`traza exacta · ${c.nombre} (${c.esperado.n_transiciones} transiciones)`,
        igual, igual ? '' : JSON.stringify(traza).slice(0, 160));
  check(`estado final · ${c.nombre} = ${c.esperado.estado_final}`,
        r.estados[r.estados.length - 1] === c.esperado.estado_final,
        r.estados[r.estados.length - 1]);
}

// ── y el DIARIO, que es el entregable ────────────────────────────────────
(() => {
  const c = D.casos.find(x => x.nombre === 'redfield');
  const r = H.simula(c.muestras, D.parametros, { dt_min: c.dt_min });
  const noacc = r.diario.filter(l => l.includes('NO-ACCIÓN'));
  check('el caso Redfield registra la NO-ACCIÓN con su veto',
        noacc.length > 0 && noacc.some(l => l.includes('WIND_MOVEMENT_LOCKOUT')));
  check('y las seguidas se colapsan, como en el core (' + noacc.length + ' líneas)',
        noacc.length <= 4 && noacc.some(l => l.includes('muestras)')));
})();

// ── MUTANTE: si el JS fundiera los tres criterios de salida, esto muere ──
(() => {
  const c = D.casos.find(x => x.nombre === 'salida_seco_corto');
  const p = Object.assign({}, D.parametros, { t_sin_precipitacion_min: 0 });
  const r = H.simula(c.muestras, p, { dt_min: c.dt_min });
  const fin = r.estados[r.estados.length - 1];
  check('MUTANTE: sin el criterio de los 15 min secos, la salida cambia (' + fin + ')',
        fin !== c.esperado.estado_final);
})();

console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko)
                : '\nOK — ' + ok + '/' + ok + ' comprobaciones · ' + modo);
process.exit(ko ? 1 : 0);
