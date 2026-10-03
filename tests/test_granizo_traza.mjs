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

// NI NADA DE FUERA DEL BLOQUE, que es un modo de romperlo que el `compila` no ve:
// `LOC.algo()` dentro de una función no falla al compilar, falla al LLAMAR, y en
// este arnés eso salía como un ReferenceError que mataba el proceso —no como un
// rojo— porque el careo ya iba corriendo. Pasó de verdad: al meter el intervalo
// de Meteomatics puse `LOC.intervaloDeLaSerie()` dentro de `simula`. Se comprueba
// sobre el código SIN COMENTARIOS, porque el bloque sí nombra a `LOC` al explicar
// que el intervalo se resuelve fuera, y esa mención es correcta.
const sinCom = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FUERA = ['LOC', 'ENGINE', 'GRZ_IV_PREF', 'GJULIO', 'GDEMO', 'CORE'];
const colados = FUERA.filter((n) => new RegExp('\\b' + n + '\\s*[.(\\[]').test(sinCom));
check('ni usa nada definido FUERA del bloque', colados.length === 0,
      colados.length ? 'se ha colado: ' + colados.join(', ') : 'autocontenido');
// Y se corta aquí, como con la extracción: si algo de fuera se ha colado, el
// careo de abajo va a morir con un ReferenceError a mitad y el diagnóstico se
// perdería debajo de la pila. Mejor el rojo con su nombre.
if (colados.length) { console.log('\nFALLOS: ' + ko); process.exit(1); }

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

// ── LOS DEL CONTRATO NO MUEVEN LA MÁQUINA ────────────────────────────────
// `LOC.CONTRATO` publica las decisiones de Factiun sobre los parámetros que el
// §19 deja «SIN VALOR», y el bloque afirma de sí mismo que HOY NINGUNO LO LEE
// NINGUNA MÁQUINA. Eso es una afirmación comprobable, y una afirmación falsa de
// inocuidad sería peor que no decir nada: si mañana alguien conecta uno de estos
// a un criterio, la ficha seguiría prometiendo que no cambian nada. Así que se
// carea la traza CON y SIN ellos, sobre los mismos casos del core.
const mc = html.match(/LOC\.CONTRATO=\{[\s\S]*?\n\};/);
check('el bloque CONTRATO se encuentra en la ficha', !!mc);
if (mc) {
  let C = null;
  try { C = (new Function('var LOC={};' + mc[0] + ' return LOC.CONTRATO;'))(); }
  catch (e) { check('y se puede evaluar', false, e.message); }
  if (C) {
    const puestos = C._decididos.filter((k) => C[k] !== null && C[k] !== undefined);
    check('hay valores decididos que meter en la máquina (' + puestos.length + ')',
          puestos.length >= 5, puestos.join(','));
    const conContrato = Object.assign({}, D.parametros);
    for (const k of puestos) conContrato[k] = C[k];
    // LOS CASOS DEL CORE NO BASTAN PARA ESTO, y conviene que quede escrito por
    // qué: su único valor de granizo es 1,6 contra un umbral de 1,0, o sea 60 % de
    // holgura. Una comparación sobre ellos deja pasar cualquier acoplamiento que
    // mueva un umbral menos de eso — lo medí: un mutante que multiplicaba el
    // umbral por 1,5 al leer `horizonte_vigilancia_h` NO lo detectaba. El fixture
    // tiene que contener el mecanismo, y un fixture construido para carear la
    // traza no está construido para medir sensibilidad.
    // Así que se añaden SONDAS pegadas a los umbrales: con el dato justo en el
    // umbral, cualquier perturbación —arriba o abajo— cambia el resultado.
    const sonda = (f) => {
      const ms = [];
      for (let i = 0; i < 6; i++) ms.push({
        hail_1h_cm: +(D.parametros.umbral_tamano_granizo_cm * f).toFixed(4),
        cape_j_kg: D.parametros.umbral_cape_j_kg,
        prob_tstorm_pct: D.parametros.umbral_prob_tstorm_pct,
        viento_sostenido_ms: 2, viento_racha_ms: 3, precipitacion: false,
        soc_pct: 90
      });
      return ms;
    };
    const lotes = D.casos.map((c) => ({ nombre: c.nombre, muestras: c.muestras, dt_min: c.dt_min }))
      .concat([{ nombre: 'sonda · justo EN el umbral', muestras: sonda(1), dt_min: 1 },
               { nombre: 'sonda · justo BAJO el umbral', muestras: sonda(0.99), dt_min: 1 },
               { nombre: 'sonda · justo SOBRE el umbral', muestras: sonda(1.01), dt_min: 1 }]);
    let movidos = [];
    for (const c of lotes) {
      const a = H.simula(c.muestras, D.parametros, { dt_min: c.dt_min });
      const b = H.simula(c.muestras, conContrato, { dt_min: c.dt_min });
      if (JSON.stringify([a.estados, a.transiciones, a.diario]) !==
          JSON.stringify([b.estados, b.transiciones, b.diario])) movidos.push(c.nombre);
    }
    check('y NINGUNO mueve la traza en ' + lotes.length + ' lotes (casos del core + 3 sondas)',
          movidos.length === 0,
          movidos.length ? 'mueven: ' + movidos.join(', ')
                         : 'estados, transiciones y diario idénticos');
    // Y la sonda tiene que ser SENSIBLE de verdad: si estar en el umbral o bajo él
    // diera la misma traza, la sonda no estaría sondeando nada.
    const sEn = H.simula(sonda(1), D.parametros, { dt_min: 1 });
    const sBajo = H.simula(sonda(0.99), D.parametros, { dt_min: 1 });
    check('…y la sonda DISTINGUE estar en el umbral de estar bajo él (si no, no sondea)',
          JSON.stringify(sEn.transiciones) !== JSON.stringify(sBajo.transiciones),
          'en=' + sEn.transiciones.length + ' bajo=' + sBajo.transiciones.length);
  }
}

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
