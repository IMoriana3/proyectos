// Careo de la máquina de EJECUCIÓN de hail stow: el bloque GRANIZO-EJECUCIÓN
// de `sim-viento.html` contra el core Python — SIN navegador.
//
// Hermano de `test_granizo_traza.mjs` y con sus mismas reglas de procedencia
// (fuente hermana → espejo con SHA-256 → careo de hashes cuando están los dos,
// y el modo se DECLARA porque en `proyectos` no hay CI). Lo que cambia es QUÉ
// se carea, y ahí hay una diferencia que no es de estilo:
//
// SE CAREA LA SECUENCIA COMPLETA DE ESTADOS, no solo la traza de transiciones
// ni el estado final. Motivo medido en el core: la rama de «fallo declarado» y
// la de «timeout» CONVERGEN en el mismo estado —una fila con fallo tampoco
// confirma, así que el plazo acabaría venciendo igual—, así que un careo por
// el final dejaría al espejo perder la rama entera sin ponerse rojo. El primer
// mutante de esa rama sobrevivió exactamente así.
//
//   node tests/test_ejecucion_traza.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');
const ESPEJO = path.join(AQUI, 'goldens', 'ejecucion_casos.json');
const HASH = path.join(AQUI, 'goldens', 'ejecucion_casos.sha256');
const FUENTE = process.env.GOLDEN_EJECUCION || path.join(
  RAIZ, '..', 'SolarGPTfull', 'solargpt', 'tests', 'goldens', 'ejecucion_casos.json');

let ok = 0, ko = 0;
const check = (n, cond, extra) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); }
};
const sha = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const J = x => JSON.stringify(x);

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
  if (hayEspejo) {
    const esperado = fs.existsSync(HASH)
      ? fs.readFileSync(HASH, 'utf8').trim().split(/\s+/)[0] : null;
    const real = sha(textoCasos);
    check('el espejo commiteado está AL DÍA con la fuente',
          esperado === real && sha(fs.readFileSync(ESPEJO, 'utf8')) === real,
          `esperado ${String(esperado).slice(0, 16)}… · fuente ${real.slice(0, 16)}… ` +
          '· regenera con `python scripts/gen_goldens_ejecucion.py --write` en SolarGPTfull');
    modo += ' + espejo careado';
  } else {
    check('falta el espejo, que es el respaldo sin repo hermano', false,
          'regenera con `python scripts/gen_goldens_ejecucion.py --write`');
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
const m = html.match(/GRANIZO-EJECUCIÓN — inicio[\s\S]*?\*\/([\s\S]*?)\/\* ═+ GRANIZO-EJECUCIÓN — fin/);
check('el bloque GRANIZO-EJECUCIÓN está delimitado en el HTML', !!m);
if (!m) { console.log('\nFALLOS: ' + ko); process.exit(1); }
// Un extractor que se traiga dos líneas también «compila»: el vacío y lo casi
// vacío son error, no PASS. Y la cabecera del bloque menciona su propio
// marcador de cierre en la prosa — ya mordió una vez en `overcast`.
check('lo extraído tiene cuerpo (' + m[1].length + ' chars)', m[1].length > 5000);
check('y NO lleva una línea de DOM dentro',
      !/document\.|window\.|getElementById|querySelector/.test(m[1]),
      'la física tiene que poder correr sin página');

const ctx = { console };
vm.createContext(ctx);
try { vm.runInContext(m[1], ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const X = ctx.EJEC;
check('el bloque compila y expone EJEC', !!(X && X.simula));
if (!X) { console.log('\nFALLOS: ' + ko); process.exit(1); }

// ── la tabla y los parámetros son los del core ───────────────────────────
check('los TRES estados del §10.2 que cubre C2 (' + X.ORDEN_ESTADOS.length + ')',
      X.ORDEN_ESTADOS.length === 3);
check('y con el nombre del informe',
      J(X.ORDEN_ESTADOS) === J(['HAIL_STOW_TRANSIT', 'HAIL_SAFE_POSITION',
                                'HAIL_PARTIAL_PROTECTION']),
      X.ORDEN_ESTADOS.join(','));
check('los requeridos son los mismos cuatro que exige el core',
      J([...X.REQUERIDOS].sort()) === J(Object.keys(D.responsables).sort()),
      X.REQUERIDOS.join(','));
check('y cada uno dice su apartado y su dueño',
      X.REQUERIDOS.every(n => /§/.test(X.APARTADO[n]) && /dueño/.test(X.APARTADO[n])));
check('el hueco declarado es el mismo que el del core',
      J(X.FUERA_DE_C2) === J(D.fuera_de_alcance));

// ── sin parámetros NO corre, igual que el core ───────────────────────────
(() => {
  let lanzó = false, dice = false;
  try { X.simula(D.casos[0].flota, {}, D.casos[0].dt_s); }
  catch (e) { lanzó = /no arranca/.test(e.message); dice = D.responsables &&
    Object.keys(D.responsables).every(n => e.message.includes(n)); }
  check('sin parámetros se niega a correr', lanzó);
  check('y NOMBRA los cuatro que faltan', dice);
})();
(() => {
  // El régimen que importa: con tres de cuatro puestos PARECE configurada.
  const p = Object.assign({}, D.parametros); p.n_retry = null;
  let lanzó = false;
  try { X.simula(D.casos[0].flota, p, D.casos[0].dt_s); }
  catch (e) { lanzó = /n_retry/.test(e.message); }
  check('uno solo a null ya bloquea', lanzó);
})();

// ── LOS CASOS, uno por uno ───────────────────────────────────────────────
for (const c of D.casos) {
  const env = (c.envolvente_ok === null || c.envolvente_ok === undefined)
    ? null : c.flota.map(() => c.envolvente_ok);
  const r = X.simula(c.flota, D.parametros, c.dt_s, env);
  const e = c.esperado;

  const igualEst = J(r.estados) === J(e.estados);
  check(`secuencia de estados · ${c.nombre}`, igualEst,
        igualEst ? '' : J(r.estados).slice(0, 200));

  const traza = r.transiciones.map(t => [t.i, t.de, t.a, t.motivo]);
  const igualTr = J(traza) === J(e.traza);
  check(`traza exacta · ${c.nombre} (${e.n_transiciones} transiciones)`,
        igualTr, igualTr ? '' : J(traza).slice(0, 240));

  check(`% protegido · ${c.nombre}`, J(r.pct_protegido) === J(e.pct_protegido),
        J(r.pct_protegido).slice(0, 160));

  const rint = {};
  Object.keys(r.reintentos).forEach(k => { rint[String(k)] = r.reintentos[k]; });
  check(`reintentos · ${c.nombre}`, J(rint) === J(e.reintentos),
        J(rint) + ' vs ' + J(e.reintentos));
}

// ── EL INVARIANTE, comprobado sobre lo que produce el JS ─────────────────
// No basta con que coincida con el golden: si algún día una regeneración
// moviera una transición «timeout» hacia posición segura, el espejo la
// copiaría obedientemente y los dos lados estarían de acuerdo — en el error.
(() => {
  let malas = 0, safes = 0;
  for (const c of D.casos) {
    const env = (c.envolvente_ok === null || c.envolvente_ok === undefined)
      ? null : c.flota.map(() => c.envolvente_ok);
    const r = X.simula(c.flota, D.parametros, c.dt_s, env);
    for (const t of r.transiciones) {
      if (/^timeout/.test(t.motivo) && t.a === 'HAIL_SAFE_POSITION') malas++;
    }
    if (r.estados.includes('HAIL_SAFE_POSITION')) safes++;
  }
  check('NUNCA «planta protegida» por timeout (0 transiciones)', malas === 0, malas);
  // Y su par: si NINGÚN caso llegara nunca a posición segura, lo de arriba
  // pasaría por no haber nada que promover. El régimen tiene que existir.
  check('…y hay casos que SÍ llegan a posición segura (' + safes + ')', safes >= 3);
})();

// ── MUTANTES sobre el propio espejo, no sobre el core ────────────────────
// Cada uno reproduce una desviación que un espejo puede tener sin que la
// coincidencia de estado final la vea.
(() => {
  const c = D.casos.find(x => x.nombre === 'excluida_no_bloquea');
  // «todas las filas» en vez de «todas las DISPONIBLES»: se marca la excluida
  // como disponible y el caso tiene que dejar de llegar a segura.
  const flota = c.flota.map(paso => paso.map(f => Object.assign({}, f, { disponible: true })));
  const r = X.simula(flota, D.parametros, c.dt_s, null);
  check('MUTANTE: si la excluida contase, ya no habría posición segura',
        !r.estados.includes('HAIL_SAFE_POSITION'), r.estados[r.estados.length - 1]);
})();
(() => {
  const c = D.casos.find(x => x.nombre === 'sin_telemetria');
  // Si «sin dato» se leyera como confirmada, este caso llegaría a segura.
  const flota = c.flota.map(paso => paso.map(f => Object.assign({}, f, { error_deg: 0.2 })));
  const r = X.simula(flota, D.parametros, c.dt_s, null);
  check('MUTANTE: con telemetría, el mismo caso SÍ llega a segura',
        r.estados.includes('HAIL_SAFE_POSITION'), r.estados[r.estados.length - 1]);
})();
(() => {
  const c = D.casos.find(x => x.nombre === 'fallo_degrada_ya');
  // Sin el fallo, la misma flota (ángulo CORRECTO) llega a segura. Es lo que
  // vuelve no-trivial al caso: lo que degrada es el campo `fallo`, no el
  // ángulo. Y prueba que el caso mide el CUÁNDO y no un desenlace distinto.
  const flota = c.flota.map(paso => paso.map(f => {
    const g = Object.assign({}, f); delete g.fallo; return g;
  }));
  const r = X.simula(flota, D.parametros, c.dt_s, null);
  check('MUTANTE: quitando SOLO el fallo, la misma flota llega a segura',
        r.estados[0] === 'HAIL_SAFE_POSITION', r.estados[0]);
})();
(() => {
  const c = D.casos.find(x => x.nombre === 'reintentos_vetados');
  // El par del veto: la MISMA flota dentro de envolvente sí reintenta. Sin
  // esto, «0 reintentos fuera de envolvente» podría pasar por no haber
  // reintentos que prohibir.
  const dentro = X.simula(c.flota, D.parametros, c.dt_s, c.flota.map(() => true));
  const fuera = X.simula(c.flota, D.parametros, c.dt_s, c.flota.map(() => false));
  check('MUTANTE: el veto del §11 DECIDE (dentro reintenta, fuera no)',
        Object.keys(dentro.reintentos).length > 0 &&
        Object.keys(fuera.reintentos).length === 0,
        J(dentro.reintentos) + ' vs ' + J(fuera.reintentos));
  check('y fuera de envolvente queda ESCRITO en el diario',
        fuera.diario.some(l => /NO autorizado/.test(l) && /§11/.test(l)));
})();

console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
process.exit(ko ? 1 : 0);
