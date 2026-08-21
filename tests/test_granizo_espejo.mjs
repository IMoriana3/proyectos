// El guard del ESPEJO — vive FUERA del arnés que vigila, y a propósito.
//
// `test_granizo_traza.mjs` tiene un fallback: si no encuentra el checkout
// hermano, lee del espejo y sigue. Ese fallback es correcto —sin él, quien no
// tenga los dos repos no podría correr nada— pero significa que el arnés
// **puede correr en modo degradado sin que nadie se entere**. Si la regla que
// vigila ese modo viviera dentro de él, compartiría su condición de salto: se
// saltaría a sí misma. Es la forma más pura del verde falso.
//
// Así que la regla vive aquí, sin fallback, y además EXTRAÍDA A FUNCIÓN PURA
// para poder ejercitar las cuatro combinaciones sin tocar el disco — porque el
// caso que importa (hay hermano y el espejo está viejo) no es reproducible en
// una máquina donde el espejo está al día.
//
//   node tests/test_granizo_espejo.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

/* LA REGLA, pura. `null` = todo en orden; si no, el motivo.
   - sin espejo: mal siempre (es el respaldo de quien no tiene el hermano);
   - espejo que no cuadra con su hash: se ha tocado a mano;
   - hermano presente y espejo distinto: el espejo está VIEJO;
   - sin hermano: no se puede carear, y eso se DECLARA, no se aprueba en
     silencio. */
export function veredictoEspejo({ hayEspejo, hashDeclarado, hashEspejo, hashFuente }) {
  if (!hayEspejo) return 'falta el espejo commiteado';
  if (!hashDeclarado) return 'el espejo no trae su hash';
  if (hashDeclarado !== hashEspejo) return 'el espejo no cuadra con su hash (tocado a mano)';
  if (hashFuente && hashFuente !== hashEspejo) return 'el espejo está VIEJO respecto a la fuente';
  return null;
}

// ── las cuatro combinaciones, sin tocar el disco ─────────────────────────
const A = 'a'.repeat(64), B = 'b'.repeat(64);
check('sin espejo -> mal',
      veredictoEspejo({ hayEspejo: false }) !== null);
check('espejo sin hash -> mal',
      veredictoEspejo({ hayEspejo: true, hashDeclarado: null, hashEspejo: A }) !== null);
check('espejo que no cuadra con su hash -> mal',
      /tocado a mano/.test(veredictoEspejo(
        { hayEspejo: true, hashDeclarado: A, hashEspejo: B })));
check('espejo VIEJO respecto a la fuente -> mal',
      /VIEJO/.test(veredictoEspejo(
        { hayEspejo: true, hashDeclarado: A, hashEspejo: A, hashFuente: B })));
check('espejo al día con la fuente -> bien',
      veredictoEspejo({ hayEspejo: true, hashDeclarado: A, hashEspejo: A, hashFuente: A }) === null);
check('sin fuente, un espejo coherente pasa (y el modo se declara)',
      veredictoEspejo({ hayEspejo: true, hashDeclarado: A, hashEspejo: A, hashFuente: null }) === null);

// ── y ahora sobre el disco de verdad ─────────────────────────────────────
const hayEspejo = fs.existsSync(ESPEJO);
const hayFuente = fs.existsSync(FUENTE);
const v = veredictoEspejo({
  hayEspejo,
  hashDeclarado: fs.existsSync(HASH)
    ? fs.readFileSync(HASH, 'utf8').trim().split(/\s+/)[0] : null,
  hashEspejo: hayEspejo ? sha(fs.readFileSync(ESPEJO, 'utf8')) : null,
  hashFuente: hayFuente ? sha(fs.readFileSync(FUENTE, 'utf8')) : null,
});
check('el espejo de este repo está en orden', v === null, v);
console.log('     ── ' + (hayFuente
  ? 'con repo hermano: espejo CAREADO contra la fuente'
  : 'SIN repo hermano: no se ha podido carear (modo declarado, no aprobado)') + ' ──');

// El generador es UNO SOLO para las tres cosas, y eso es lo que hace que una
// divergencia solo pueda significar vejez y nunca ambigüedad.
if (hayFuente) {
  const gen = path.join(RAIZ, '..', 'SolarGPTfull', 'solargpt', 'scripts',
                        'gen_goldens_hailstow.py');
  check('el generador del core escribe también el espejo y su hash',
        fs.existsSync(gen) && /hailstow_casos\.sha256/.test(fs.readFileSync(gen, 'utf8')));
}
check('la demo local existe y sale del mismo generador',
      fs.existsSync(path.join(RAIZ, 'demo-granizo.json'))
      && /NO editar a mano/.test(fs.readFileSync(path.join(RAIZ, 'demo-granizo.json'), 'utf8')));

console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
process.exit(ko ? 1 : 0);
