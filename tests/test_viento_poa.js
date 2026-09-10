// LA TRANSPOSICIÓN — de dónde sale la energía, y nadie la comprobaba.
//
// `LOC.poa` convierte la irradiancia horizontal en irradiancia sobre el plano
// del módulo: haz con su razón geométrica, difusa isótropa y albedo del suelo.
// La ficha la llama CINCO veces y de ella sale toda la POA que el informe
// compara entre estrategias — la pérdida por abanderamiento es una diferencia
// de POA, así que un error aquí no cambia un dato: cambia la conclusión.
//
// MEDIDO: no aparecía en ningún arnés.
//
// EL ANCLA, que no sale del código
// ---------------------------------
// Un plano HORIZONTAL recibe, por definición, la irradiancia global
// horizontal. Con θ=0 el modelo tiene que devolver GHI = BHI + DHI, y el
// término de albedo tiene que desaparecer — el plano tumbado no ve suelo. Eso
// no es una convención de esta implementación: es qué significa GHI, y se
// cumple en cualquier modelo de transposición que no esté roto.
//
// Los demás oráculos son igual de externos:
//
//   · la relación BHI = DNI·sin(elevación), que fija la razón `rb`;
//   · los factores de vista de Liu-Jordan, (1+cos β)/2 al cielo y (1−cos β)/2
//     al suelo, que SUMAN UNO — el plano ve el hemisferio entero;
//   · y la simetría este/oeste, que ningún signo puede romper.
//
// Se extrae del HTML real, no se copia (misma regla que test_viento_ejes.js).
//
//   node tests/test_viento_poa.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const html = fs.readFileSync(path.join(RAIZ, 'sim-viento.html'), 'utf8');
function saca(firma) {
  const i = html.indexOf(firma);
  if (i < 0) return null;
  const j = html.indexOf('\n};', i);
  return j < 0 ? null : html.slice(i, j + 3);
}
// El albedo se LEE del HTML. Tecleado aquí, este banco seguiría verde el día
// que la ficha cambie el suelo y estaría midiendo otro emplazamiento.
const mAlb = html.match(/ALBEDO\s*:\s*([\d.]+)/);
check('el albedo se lee del HTML, no se teclea', !!mAlb, 'no encuentro ALBEDO');
const ALBEDO = mAlb ? Number(mAlb[1]) : 0.20;
const trozo = saca('LOC.poa=function(th,el,az,bh,dh,gh){');
check('la función sigue en el HTML con esa firma', !!trozo);
if (!trozo || !mAlb) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('lo extraído tiene cuerpo (' + trozo.length + ' chars)', trozo.length > 250);

const D2R = Math.PI / 180;
const ctx = { console, LOC: { D2R, ALBEDO } };
vm.createContext(ctx);
try { vm.runInContext(trozo, ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;
check('queda expuesta la transposición', typeof LOC.poa === 'function');

// `az` es el azimut solar desde el SUR con el este negativo, en radianes: la
// misma convención que devuelve `LOC.sun` en su campo `az`, que es lo que la
// ficha le pasa.
const P = (thDeg, elDeg, azDeg, bh, dh, gh) =>
  LOC.poa(thDeg, elDeg * D2R, azDeg * D2R, bh, dh, gh);

// ══════════════════════════════════════════════════════════════════════
//  1) EL ANCLA: un plano horizontal recibe la GHI
// ══════════════════════════════════════════════════════════════════════
// Con θ=0 y el sol suficientemente alto (por encima del suelo de la razón),
// POA = BHI + DHI exactamente, y el albedo no aporta nada.
[[60, 700, 150], [40, 500, 200], [20, 250, 120]].forEach(function (c) {
  const [el, bh, dh] = c;
  const ghi = bh + dh;
  const p = P(0, el, 0, bh, dh, ghi);
  check('plano horizontal a ' + el + '° de elevación: POA = GHI (' + ghi + ')',
        Math.abs(p - ghi) < 1e-9, p.toFixed(6));
});
check('y el suelo no aporta con el plano tumbado (albedo × 0)',
      Math.abs(P(0, 60, 0, 0, 0, 1000) - 0) < 1e-12,
      String(P(0, 60, 0, 0, 0, 1000)));

// ══════════════════════════════════════════════════════════════════════
//  2) LA RAZÓN DEL HAZ: BHI = DNI · sin(elevación)
// ══════════════════════════════════════════════════════════════════════
// CORREGIDO al medirlo, y el error es el más instructivo de este fichero: la
// primera versión esperaba que, apuntando al sol, el haz valiera la DNI
// ENTERA. Eso es física de un seguidor de DOS ejes. Éste tiene UNO —el tubo de
// par, horizontal— así que solo puede seguir la PROYECCIÓN del sol sobre el
// plano perpendicular al eje: la componente a lo largo del tubo no se captura
// jamás. El banco marcaba 689 donde yo pedía 900, y el código tenía razón.
//
// El oráculo correcto, que sigue siendo externo: para un seguidor de eje
// horizontal, el haz recogido es `DNI · √(1 − cos²(el)·cos²(az))`, o sea la
// DNI menos lo que se va por el eje. Con el sol EN el meridiano (az=0) el
// seguidor está plano y recibe justo la BHI; cuanto más se aparta el sol del
// eje, más se acerca a la DNI.
const DNI = 900;
[[50, 0], [35, -30], [35, 30], [20, -80], [60, -45]].forEach(function (c) {
  const [el, azDeg] = c;
  const bh = DNI * Math.sin(el * D2R);
  // El ángulo del seguidor que apunta al sol: R = atan2(sx, sz), y θ = −R.
  const sx = Math.cos(el * D2R) * Math.sin(azDeg * D2R), sz = Math.sin(el * D2R);
  const th = -Math.atan2(sx, sz) / D2R;
  // `gh` va a CERO, y esto también lo cazó el banco: pasando `gh = bh` el
  // término de albedo aportaba 9,6 W/m² a una comprobación que dice ser solo
  // de haz, y los 643,93 medidos eran 634,32 de haz más 9,6 de suelo. Una
  // comprobación con dos términos dentro no mide ninguno de los dos.
  const p = P(th, el, azDeg, bh, 0, 0);
  const esperado = DNI * Math.sqrt(1 - Math.pow(Math.cos(el * D2R) * Math.cos(azDeg * D2R), 2));
  check('seguidor de UN eje (el ' + el + '°, az ' + azDeg + '°): el haz es la DNI menos el eje',
        Math.abs(p - esperado) < 1e-6, p.toFixed(4) + ' vs ' + esperado.toFixed(4));
});
// Y el caso límite que separa los dos modelos: con el sol perpendicular al eje
// —az = ±90°— no hay componente que se escape y el haz SÍ vale la DNI entera.
// Sin este caso, el oráculo de arriba no distinguiría un eje de dos.
const elPerp = 40, azPerp = -90, bhPerp = DNI * Math.sin(elPerp * D2R);
const sxP = Math.cos(elPerp * D2R) * Math.sin(azPerp * D2R), szP = Math.sin(elPerp * D2R);
const thPerp = -Math.atan2(sxP, szP) / D2R;
check('y con el sol PERPENDICULAR al eje sí recoge la DNI entera',
      Math.abs(P(thPerp, elPerp, azPerp, bhPerp, 0, 0) - DNI) < 1e-6,
      P(thPerp, elPerp, azPerp, bhPerp, 0, 0).toFixed(4));
// Y apuntar al sol es el MÁXIMO: cualquier otro ángulo recibe menos haz. Sin
// esto, «vale la DNI» se cumpliría también con una fórmula que devolviera DNI
// para todo.
const elM = 45, azM = -20, bhM = DNI * Math.sin(elM * D2R);
const sxM = Math.cos(elM * D2R) * Math.sin(azM * D2R), szM = Math.sin(elM * D2R);
const thOpt = -Math.atan2(sxM, szM) / D2R;
const pOpt = P(thOpt, elM, azM, bhM, 0, bhM);
check('y es el MÁXIMO: ±20° alrededor del óptimo reciben menos',
      P(thOpt - 20, elM, azM, bhM, 0, bhM) < pOpt &&
      P(thOpt + 20, elM, azM, bhM, 0, bhM) < pOpt,
      [thOpt - 20, thOpt, thOpt + 20].map(t => P(t, elM, azM, bhM, 0, bhM).toFixed(1)).join(' < '));

// ══════════════════════════════════════════════════════════════════════
//  3) LOS FACTORES DE VISTA SUMAN UNO
// ══════════════════════════════════════════════════════════════════════
// El plano ve cielo y suelo y nada más. Con difusa y albedo iguales a 1 y sin
// haz, la POA de un plano a cualquier inclinación tiene que valer
// (1+cos)/2 + albedo·(1−cos)/2 — y con albedo = 1 eso es exactamente 1.
[0, 30, 55, 90].forEach(function (b) {
  const cielo = P(b, 60, 0, 0, 1, 0);
  const suelo = P(b, 60, 0, 0, 0, 1) / ALBEDO;
  check('a ' + b + '° de inclinación, cielo + suelo = 1 (ve el hemisferio entero)',
        Math.abs(cielo + suelo - 1) < 1e-9,
        cielo.toFixed(6) + ' + ' + suelo.toFixed(6));
});
check('a 90° el plano ve MEDIO cielo y medio suelo',
      Math.abs(P(90, 60, 0, 0, 1, 0) - 0.5) < 1e-9,
      String(P(90, 60, 0, 0, 1, 0)));
check('y el término de suelo lleva el albedo de la ficha, no otro',
      Math.abs(P(90, 60, 0, 0, 0, 1000) - ALBEDO * 1000 * 0.5) < 1e-9,
      P(90, 60, 0, 0, 0, 1000) + ' con albedo ' + ALBEDO);

// ══════════════════════════════════════════════════════════════════════
//  4) LA SIMETRÍA ESTE/OESTE
// ══════════════════════════════════════════════════════════════════════
// Un signo perdido en el azimut o en la conversión de θ mandaría el plano al
// lado contrario, y la POA seguiría siendo un número plausible.
check('espejar sol y seguidor da exactamente la misma POA',
      Math.abs(P(35, 40, -25, 600, 150, 750) - P(-35, 40, 25, 600, 150, 750)) < 1e-12,
      P(35, 40, -25, 600, 150, 750) + ' vs ' + P(-35, 40, 25, 600, 150, 750));
check('y apuntar al lado CONTRARIO del sol da menos que apuntar bien',
      P(-35, 40, -25, 600, 150, 750) < P(35, 40, -25, 600, 150, 750));

// ══════════════════════════════════════════════════════════════════════
//  5) LOS BORDES
// ══════════════════════════════════════════════════════════════════════
check('bajo el horizonte no hay irradiancia, ni difusa ni albedo',
      P(0, -0.1, 0, 500, 200, 700) === 0 && P(30, 0, 0, 500, 200, 700) === 0);
// El divisor lleva un suelo en sin(el)=0,087 (≈5°) A PROPÓSITO: sin él, con el
// sol rasante la razón del haz se dispara y la POA sale por las nubes. Se
// comprueba que la cota ACTÚA y que el resultado se queda acotado.
// CORREGIDO al medirlo: la primera versión pedía la POA con θ=0, y ahí la
// cota NO actúa — `cosAOI` vale `sin(el)` y los dos se cancelan, así que la
// razón sale 1 con o sin cota. Su mutante sobrevivió, y tenía razón. La cota
// solo muerde cuando el seguidor APUNTA al sol rasante: `cosAOI` cerca de 1
// sobre un `sin(el)` diminuto. Con 0,5° de elevación la razón sin cota valdría
// ~115 y con ella se queda en ~11,5.
const elRas = 0.5, azRas = -60;
const sxR = Math.cos(elRas * D2R) * Math.sin(azRas * D2R), szR = Math.sin(elRas * D2R);
const thRas = -Math.atan2(sxR, szR) / D2R;
const rasante = P(thRas, elRas, azRas, 10, 0, 0);
check('con el sol rasante y el seguidor apuntándolo, la razón está ACOTADA',
      isFinite(rasante) && rasante < 10 / 0.087 + 1e-6,
      rasante.toFixed(2) + ' (sin cota serían ' +
      (10 / Math.sin(elRas * D2R)).toFixed(0) + ')');
// El valor esperado lleva el `cosAOI` del seguidor de UN eje, no un 1. Es la
// TERCERA vez en este fichero que suponer dos ejes da un número equivocado, y
// las tres las cazó el banco: con el sol a 60° del meridiano `cosAOI` vale
// sen(60°) = 0,866, así que la POA acotada son 99,5 y no 114,9.
const cosAOIras = Math.sqrt(1 - Math.pow(Math.cos(elRas * D2R) * Math.cos(azRas * D2R), 2));
check('y la cota es exactamente la declarada (0,087 ≈ 5° de elevación)',
      Math.abs(rasante - 10 * cosAOIras / 0.087) < 1e-6,
      rasante.toFixed(4) + ' vs ' + (10 * cosAOIras / 0.087).toFixed(4));
check('y por encima de ~5° la cota ya no manda (el modelo es el de siempre)',
      Math.abs(P(0, 30, 0, 400, 100, 500) - 500) < 1e-9,
      String(P(0, 30, 0, 400, 100, 500)));
// Entradas negativas: se recortan, no se restan. Una irradiancia negativa en
// un fichero de campo es un defecto de sensor, y restarla inventaría sombra.
check('una irradiancia negativa se recorta a 0, no resta',
      P(0, 60, 0, -100, 200, 100) === 200, String(P(0, 60, 0, -100, 200, 100)));
check('la POA nunca sale negativa', [0, 45, 90, -45].every(
      t => P(t, 60, 0, -50, -50, -50) >= 0));

// ── MUTANTE ───────────────────────────────────────────────────────────
// El defecto reproducido sobre la función real: intercambiar los factores de
// vista, o sea dar al cielo la fracción del suelo. La POA sigue siendo un
// número del orden correcto —por eso nadie lo vería— y el reparto está del
// revés.
const ctxM = { console, LOC: { D2R, ALBEDO } };
vm.createContext(ctxM);
// El intercambio va en TRES pasos con un marcador intermedio, y esto también
// lo enseñó el banco al fallar: encadenar `.replace('(1+cb)/2','(1-cb)/2')` con
// `.replace('(1-cb)/2','(1+cb)/2')` hace que el segundo deshaga lo que el
// primero acaba de escribir, y el «mutante» sale idéntico al original.
vm.runInContext(trozo.replace('(1+cb)/2', '(1@cb)/2')
                     .replace('(1-cb)/2', '(1+cb)/2')
                     .replace('(1@cb)/2', '(1-cb)/2'), ctxM);
const pMut = ctxM.LOC.poa(0, 60 * D2R, 0, 700, 150, 850);
check('MUTANTE: con los factores de vista cambiados, el plano horizontal ya no da la GHI',
      Math.abs(pMut - 850) > 1,
      'da ' + pMut.toFixed(2) + ' en vez de 850: si coincidiera, este banco no ' +
      'distinguiría el reparto cielo/suelo');

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
