// LA GEOMETRÍA SOLAR — el sol se podía mover DIEZ GRADOS sin que nadie chistara.
//
// De dónde sale este fichero, con la medición delante porque es el argumento.
// Se hizo una segunda batería de mutación y se le puso un CONTROL POSITIVO:
// cambiar la declinación máxima de 23,45° a 13,45° en `LOC.decl`, que es un
// disparate astronómico y mueve el sol todo el año. Debía morir. Murió CERO,
// contra los NUEVE arneses de viento.
//
// Un cero en el control positivo admite dos lecturas —«no hay cobertura» o «la
// batería no mide»—, así que se descartó la segunda a mano, en los dos
// extremos:
//
//   · ¿llega la mutación al navegador? Se inyectó un ERROR DE SINTAXIS en la
//     ficha y `test_viento_reproductor` murió con rc=1 y cero comprobaciones.
//     El fichero mutado SÍ se lee.
//   · ¿tiene efecto el mutante? Medido sobre las funciones reales: la
//     elevación solar del 21-jun a 40°N pasa de 73,41° a 63,42°, y el ángulo
//     de seguimiento se mueve hasta 13,8°:
//
//         hora    elevación        θ de seguimiento
//         06:00   13,8 → 7,6      24,84 → 12,06     Δθ −12,78
//         09:00   47,8 → 41,6     41,87 → 46,68     Δθ  +4,82
//         12:00   73,4 → 63,4      1,30 →  1,48     Δθ  +0,18
//         15:00   49,9 → 43,5    −39,63 → −44,26    Δθ  −4,63
//         18:00   15,8 → 9,6     −29,29 → −15,51    Δθ +13,78
//
// O sea que el instrumento funciona y el mutante muerde: lo que faltaba era
// que alguien mirase. Ningún arnés fija un valor ABSOLUTO derivado de la
// posición del sol — todos comprueban propiedades relativas o estructurales, y
// por ahí un sol desplazado catorce grados pasa entero.
//
// EL ORÁCULO NO ES EL CÓDIGO
// ---------------------------
// Carear la geometría contra una copia de la fórmula sería una tautología. El
// ancla es ASTRONOMÍA DE MANUAL, que existe fuera de este repo:
//
//     elevación solar al mediodía = 90° − |latitud − declinación|
//
// A 40°N eso da 73,44° en el solsticio de junio, 50,00° en los equinoccios y
// 26,56° en el de diciembre. Son números que se pueden comprobar en cualquier
// efeméride, y el modelo del código —Cooper (1969) para la declinación y la
// ecuación del tiempo clásica— tiene que caer cerca sin haberlos visto.
//
// Se extrae del HTML real, no se copia (misma regla que test_viento_ejes.js).
//
//   node tests/test_viento_sol.js
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
  if (j >= 0 && j - i < 1400) return html.slice(i, j + 3);
  const k = html.indexOf('\n', i);          // las de una línea
  return k < 0 ? null : html.slice(i, k + 1);
}
const FIRMAS = ['LOC.decl=function(N){', 'LOC.eot=function(N){',
                'LOC.sun=function(date,latR,lon){',
                'LOC.theta=function(el,az,gcr,maxang,bt){'];
const trozos = FIRMAS.map(saca);
check('las funciones siguen en el HTML con esa firma', trozos.every(Boolean),
      FIRMAS.filter((f, i) => !trozos[i]).join(' · '));
if (!trozos.every(Boolean)) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('lo extraído tiene cuerpo (' + trozos.join('').length + ' chars)',
      trozos.join('').length > 700);

const D2R = Math.PI / 180, NIGHT = -5.0;
const ctx = { console, LOC: { D2R, NIGHT } };
vm.createContext(ctx);
try { vm.runInContext(trozos.join('\n'), ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;
check('quedan expuestas las cuatro',
      ['decl', 'eot', 'sun', 'theta'].every(f => typeof LOC[f] === 'function'));

const grados = r => r / D2R;
const DIA = (m, d) => Math.floor((Date.UTC(2023, m, d) - Date.UTC(2023, 0, 0)) / 864e5);

// ══════════════════════════════════════════════════════════════════════
//  1) LA DECLINACIÓN
// ══════════════════════════════════════════════════════════════════════
// La inclinación del eje terrestre es 23,44°, así que la declinación oscila
// entre ±ese valor y pasa por cero en los equinoccios. Eso no es una
// convención del código: es la Tierra.
const dJun = grados(LOC.decl(DIA(5, 21)));   // 21 de junio
const dDic = grados(LOC.decl(DIA(11, 21)));  // 21 de diciembre
const dMar = grados(LOC.decl(DIA(2, 21)));   // 21 de marzo
const dSep = grados(LOC.decl(DIA(8, 23)));   // 23 de septiembre
check('en el solsticio de junio la declinación es +23,4°, no otra cosa',
      Math.abs(dJun - 23.44) < 0.35, dJun.toFixed(3));
check('en el de diciembre, −23,4°', Math.abs(dDic + 23.44) < 0.35, dDic.toFixed(3));
check('y en los equinoccios pasa por cero',
      Math.abs(dMar) < 1.2 && Math.abs(dSep) < 1.2,
      dMar.toFixed(2) + ' / ' + dSep.toFixed(2));
// El módulo nunca puede salirse: una declinación de 30° no existe.
let maxDecl = 0;
for (let N = 1; N <= 365; N++) maxDecl = Math.max(maxDecl, Math.abs(grados(LOC.decl(N))));
check('en todo el año |declinación| nunca supera 23,45°',
      maxDecl <= 23.4501, maxDecl.toFixed(4));

// ══════════════════════════════════════════════════════════════════════
//  2) LA ECUACIÓN DEL TIEMPO
// ══════════════════════════════════════════════════════════════════════
// El reloj de sol adelanta y atrasa respecto al reloj civil, entre unos −14 y
// +16 minutos, y a lo largo del año la corrección promedia casi cero.
let minE = 1e9, maxE = -1e9, suma = 0;
for (let N = 1; N <= 365; N++) { const e = LOC.eot(N); minE = Math.min(minE, e); maxE = Math.max(maxE, e); suma += e; }
check('la ecuación del tiempo se queda en su rango real (−17 a +17 min)',
      minE > -17 && maxE < 17, minE.toFixed(2) + ' … ' + maxE.toFixed(2));
check('y a lo largo del año promedia casi cero',
      Math.abs(suma / 365) < 1.0, (suma / 365).toFixed(3));
// Las dos de arriba las pasaría una función que devolviera CERO siempre: un
// rango y una media no distinguen «corrige poco» de «no corrige». Hace falta
// exigir que la corrección EXISTA — el reloj de sol llega a adelantar más de
// un cuarto de hora en noviembre y a atrasar un cuarto en febrero.
check('y de verdad corrige: llega a ±14 min, no es una función plana',
      maxE > 14 && minE < -12, minE.toFixed(2) + ' … ' + maxE.toFixed(2));

// ══════════════════════════════════════════════════════════════════════
//  3) EL ANCLA DE MANUAL — elevación al mediodía = 90 − |lat − decl|
// ══════════════════════════════════════════════════════════════════════
// Este es el oráculo que no sale del código. Se busca el máximo del día por
// barrido, que es la definición operativa del mediodía solar y no depende de
// la corrección horaria que el propio código aplica.
const LAT = 40, latR = LAT * D2R, LON = 0;
function elevMax(m, d) {
  let mejor = -90;
  for (let min = 0; min < 24 * 60; min += 2) {
    const t = new Date(Date.UTC(2023, m, d, 0, min, 0));
    mejor = Math.max(mejor, grados(LOC.sun(t, latR, LON).el));
  }
  return mejor;
}
// LAS TOLERANCIAS NO SON IGUALES, y el motivo está medido, no tanteado.
// El código usa la declinación de COOPER (1969), `23,45·sin(2π(284+N)/365)`:
// una aproximación de una sola armónica, exacta en los solsticios y con su
// error máximo cerca de los EQUINOCCIOS, que es donde la declinación cruza
// cero deprisa. Ensanchar la tolerancia hasta que pase sería un rango que
// admite el defecto; lo que se hace abajo es ATRIBUIR la diferencia.
const CASOS = [
  ['solsticio de junio', 5, 21, 90 - Math.abs(LAT - 23.44), 0.5],
  ['equinoccio de marzo', 2, 21, 90 - LAT, 1.5],
  ['equinoccio de septiembre', 8, 23, 90 - LAT, 1.5],
  ['solsticio de diciembre', 11, 21, 90 - Math.abs(LAT + 23.44), 0.5],
];
CASOS.forEach(function (c) {
  const [nombre, m, d, esperado, tol] = c;
  const medido = elevMax(m, d);
  check('a 40°N, ' + nombre + ': el mediodía da ' + esperado.toFixed(2) +
        '° de manual (±' + tol + ')',
        Math.abs(medido - esperado) < tol,
        'medido ' + medido.toFixed(3) + ' · esperado ' + esperado.toFixed(2));
});

// LA ATRIBUCIÓN. Se escribe aparte la declinación de SPENCER (1971) —serie de
// Fourier de tres armónicas, bastante más fina que Cooper y de otra familia— y
// se comprueba que el hueco del equinoccio de septiembre es EXACTAMENTE la
// diferencia entre los dos modelos. Si lo fuera por otra causa —un desfase de
// día, un signo— los dos números no cuadrarían.
function declSpencer(N) {
  const B = 2 * Math.PI * (N - 1) / 365;
  return (0.006918 - 0.399912 * Math.cos(B) + 0.070257 * Math.sin(B)
          - 0.006758 * Math.cos(2 * B) + 0.000907 * Math.sin(2 * B)
          - 0.002697 * Math.cos(3 * B) + 0.00148 * Math.sin(3 * B)) / D2R;
}
const NSep = DIA(8, 23);
const huecoElev = elevMax(8, 23) - (90 - LAT);
const huecoDecl = grados(LOC.decl(NSep)) - declSpencer(NSep);
check('el hueco del equinoccio es el modelo (Cooper), no un bug: cuadra con Spencer',
      Math.abs(huecoElev - huecoDecl) < 0.25,
      'hueco en elevación ' + huecoElev.toFixed(3) +
      '° · Cooper−Spencer ' + huecoDecl.toFixed(3) + '°');
check('y en los solsticios los dos modelos SÍ coinciden (ahí Cooper es buena)',
      Math.abs(grados(LOC.decl(DIA(5, 21))) - declSpencer(DIA(5, 21))) < 0.4,
      (grados(LOC.decl(DIA(5, 21))) - declSpencer(DIA(5, 21))).toFixed(3));
// Y en el hemisferio sur el orden se invierte. Un signo perdido en la
// declinación pasaría desapercibido mirando solo el norte.
const sur = -35 * D2R;
function elevMaxLat(m, d, lr) {
  let mejor = -90;
  for (let min = 0; min < 24 * 60; min += 2)
    mejor = Math.max(mejor, grados(LOC.sun(new Date(Date.UTC(2023, m, d, 0, min, 0)), lr, LON).el));
  return mejor;
}
check('a 35°S el sol está MÁS ALTO en diciembre que en junio (hemisferio sur)',
      elevMaxLat(11, 21, sur) > elevMaxLat(5, 21, sur) + 30,
      elevMaxLat(11, 21, sur).toFixed(1) + ' vs ' + elevMaxLat(5, 21, sur).toFixed(1));

// ══════════════════════════════════════════════════════════════════════
//  4) EL AZIMUT Y SU CONVENCIÓN
// ══════════════════════════════════════════════════════════════════════
// `azp` va en convención pvlib: 0 = norte, 90 = este, 180 = sur, 270 = oeste.
// Es la que miran las estrategias de abanderamiento, así que un giro de 180°
// aquí manda el seguidor al lado contrario.
const manana = LOC.sun(new Date(Date.UTC(2023, 5, 21, 7, 0, 0)), latR, LON);
const medio = LOC.sun(new Date(Date.UTC(2023, 5, 21, 12, 0, 0)), latR, LON);
const tarde = LOC.sun(new Date(Date.UTC(2023, 5, 21, 17, 0, 0)), latR, LON);
check('por la mañana el sol está al ESTE (azp < 180)', manana.azp < 180,
      manana.azp.toFixed(1));
check('al mediodía solar, al SUR (azp ≈ 180)', Math.abs(medio.azp - 180) < 6,
      medio.azp.toFixed(1));
check('por la tarde al OESTE (azp > 180)', tarde.azp > 180, tarde.azp.toFixed(1));
check('el azimut se queda en [0, 360)',
      [manana, medio, tarde].every(s => s.azp >= 0 && s.azp < 360));

// ══════════════════════════════════════════════════════════════════════
//  5) EL ÁNGULO DE SEGUIMIENTO
// ══════════════════════════════════════════════════════════════════════
const GCR = 0.397, MAX = 55;
const th = (h, bt) => LOC.theta(
  LOC.sun(new Date(Date.UTC(2023, 5, 21, h, 0, 0)), latR, LON).el,
  LOC.sun(new Date(Date.UTC(2023, 5, 21, h, 0, 0)), latR, LON).az, GCR, MAX, bt);
check('de noche devuelve la posición nocturna declarada, no un ángulo',
      LOC.theta(-0.5, 0, GCR, MAX, true) === NIGHT, String(LOC.theta(-0.5, 0, GCR, MAX, true)));
check('nunca supera el tope mecánico', [6, 8, 10, 12, 14, 16, 18].every(
      h => Math.abs(th(h, true)) <= MAX));
check('al mediodía el seguidor está casi plano', Math.abs(th(12, true)) < 5,
      th(12, true).toFixed(2));
check('por la mañana mira al ESTE y por la tarde al OESTE (signos opuestos)',
      th(8, true) > 0 && th(16, true) < 0,
      th(8, true).toFixed(1) + ' / ' + th(16, true).toFixed(1));
// El backtracking solo puede RETRAER: nunca inclina más que el seguimiento
// astronómico, porque su razón de ser es no darse sombra.
check('el backtracking nunca inclina MÁS que el seguimiento puro',
      [6, 7, 8, 17, 18].every(h => Math.abs(th(h, true)) <= Math.abs(th(h, false)) + 1e-9),
      [6, 7, 8, 17, 18].map(h => th(h, true).toFixed(1) + '≤' + th(h, false).toFixed(1)).join(' '));
check('y con el sol bajo lo retrae de verdad (si no, no estaría actuando)',
      Math.abs(th(6, true)) < Math.abs(th(6, false)) - 1,
      th(6, true).toFixed(2) + ' vs ' + th(6, false).toFixed(2));

// ── MUTANTE ───────────────────────────────────────────────────────────
// El control positivo que murió cero, reproducido aquí sobre las funciones
// reales: si este banco no distinguiera 23,45 de 13,45, no estaría midiendo lo
// que dice medir — y es exactamente lo que pasaba con los nueve arneses.
const ctxM = { console, LOC: { D2R, NIGHT } };
vm.createContext(ctxM);
vm.runInContext(trozos.join('\n').replace('23.45', '13.45'), ctxM);
const elMut = grados(ctxM.LOC.sun(new Date(Date.UTC(2023, 5, 21, 12, 0, 0)), latR, LON).el);
const elBien = grados(LOC.sun(new Date(Date.UTC(2023, 5, 21, 12, 0, 0)), latR, LON).el);
check('MUTANTE: con 13,45° de declinación el mediodía de junio se hunde ~10°',
      Math.abs(elMut - elBien) > 9,
      'bueno ' + elBien.toFixed(2) + '° · mutado ' + elMut.toFixed(2) +
      '°: si coincidieran, este banco no distinguiría la geometría');

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
