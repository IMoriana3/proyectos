// LAS DOS FUENTES SINTÉTICAS — y lo que declaran de sí mismas.
//
// `LOC.clearsky` fabrica un año de cielo claro cuando no hay meteo, y
// `LOC.completaHSU` rellena la irradiancia que el fichero del usuario no trae.
// Las dos INVENTAN datos, a propósito y con motivo, y las dos tienen que decir
// que lo han hecho. MEDIDO: ninguna aparecía en ningún arnés.
//
// LO QUE MÁS PESA NO SON SUS NÚMEROS, ES SU DECLARACIÓN
// ------------------------------------------------------
// La regla de la casa es que lo no medido se muestra como no medido. Aquí eso
// se concreta en dos campos:
//
//   · `clearsky` pone el viento a CERO y el rumbo a NaN. Un año de cielo claro
//     no trae viento, y rellenarlo con un valor plausible daría horas de
//     abanderamiento sobre un viento que nadie midió — el modo de fallo más
//     caro de esta ficha, porque el número resultante tiene buena pinta.
//   · `completaHSU` marca `sin_irradiancia` cuando ha tenido que rellenar. Ese
//     flag es lo único que separa «la planta trae irradiancia» de «se la hemos
//     puesto nosotros», y de él cuelga que el informe no presente una POA
//     sintética como si viniera del emplazamiento.
//
// Un banco que solo comprobara las fórmulas dejaría las dos declaraciones sin
// vigilar, que es justo la mitad que importa.
//
// Se extrae del HTML real, no se copia (misma regla que test_viento_ejes.js).
//
//   node tests/test_viento_fuente.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };
process.on('unhandledRejection', e => {
  console.log('FAIL una promesa se rompió sin capturar -> ' + (e && e.message || e));
  console.log('\nFALLA — promesa sin capturar'); process.exit(1);
});

const html = fs.readFileSync(path.join(RAIZ, 'sim-viento.html'), 'utf8');
function saca(firma) {
  const i = html.indexOf(firma);
  if (i < 0) return null;
  const j = html.indexOf('\n};', i);
  if (j >= 0 && j - i < 2000) return html.slice(i, j + 3);
  const k = html.indexOf('\n', i);
  return k < 0 ? null : html.slice(i, k + 1);
}
const FIRMAS = ['LOC.decl=function(N){', 'LOC.eot=function(N){',
                'LOC.sun=function(date,latR,lon){',
                'LOC.clearsky=function(lat,lon,year){',
                'LOC.completaHSU=function(M,lat,lon){'];
const trozos = FIRMAS.map(saca);
check('las funciones siguen en el HTML con esa firma', trozos.every(Boolean),
      FIRMAS.filter((f, i) => !trozos[i]).join(' · '));
if (!trozos.every(Boolean)) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('lo extraído tiene cuerpo (' + trozos.join('').length + ' chars)',
      trozos.join('').length > 1200);

const D2R = Math.PI / 180;
const ctx = { console, Promise, Date, Math, Float64Array, Array, LOC: { D2R } };
vm.createContext(ctx);
try { vm.runInContext(trozos.join('\n'), ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;
check('quedan expuestas las dos fuentes',
      typeof LOC.clearsky === 'function' && typeof LOC.completaHSU === 'function');

const LAT = 40, LON = 0, YEAR = 2023;

(async function () {
  // ══════════════════════════════════════════════════════════════════
  //  1) EL AÑO DE CIELO CLARO
  // ══════════════════════════════════════════════════════════════════
  const CS = await LOC.clearsky(LAT, LON, YEAR);
  check('devuelve un año horario completo (8760 pasos)', CS.t.length === 8760,
        String(CS.t.length));
  check('empieza el 1 de enero a las 00:00 UTC del año pedido',
        CS.t[0].getTime() === Date.UTC(YEAR, 0, 1), CS.t[0].toISOString());
  check('y el paso es de una hora exacta',
        CS.t[1] - CS.t[0] === 3600e3 && CS.t[8759] - CS.t[8758] === 3600e3);
  check('declara su procedencia en `source`', CS.source === 'clearsky',
        String(CS.source));

  // LA DECLARACIÓN QUE IMPORTA. Sin viento no hay abanderamiento: cero y NaN
  // son el resultado honesto. Un viento inventado aquí produciría horas
  // abanderadas sobre un dato que nadie midió.
  check('el viento es CERO en las 8760 horas, no un valor plausible',
        CS.ws.every(v => v === 0));
  check('y el rumbo es NaN, no un sur por defecto',
        CS.wd.every(v => Number.isNaN(v)));

  // La irradiancia: de noche nada, de día acotada, y las componentes cierran.
  const noche = [], dia = [];
  for (let i = 0; i < 8760; i++) {
    const el = LOC.sun(CS.t[i], LAT * D2R, LON).el;
    (el > 0 ? dia : noche).push(i);
  }
  check('de noche no hay irradiancia de ninguna clase',
        noche.every(i => CS.ghi[i] === 0 && CS.dhi[i] === 0 && CS.dni[i] === 0),
        noche.length + ' horas de noche');
  check('y de día la global nunca pasa de la constante del modelo (1000)',
        dia.every(i => CS.ghi[i] > 0 && CS.ghi[i] <= 1000),
        'máx ' + Math.max.apply(null, dia.map(i => CS.ghi[i])).toFixed(1));
  // EL CIERRE DE COMPONENTES, que es el oráculo: GHI = DHI + DNI·sen(el). No
  // sale del código, sale de qué significan las tres. Se comprueba por encima
  // de 5°, que es donde la cota del divisor no manda.
  const altas = dia.filter(i => Math.sin(LOC.sun(CS.t[i], LAT * D2R, LON).el) > 0.087);
  check('las tres componentes CIERRAN: GHI = DHI + DNI·sen(elevación)',
        altas.every(i => {
          const el = LOC.sun(CS.t[i], LAT * D2R, LON).el;
          return Math.abs(CS.ghi[i] - (CS.dhi[i] + CS.dni[i] * Math.sin(el))) < 1e-9;
        }), altas.length + ' horas por encima de 5°');
  check('la fracción difusa del modelo es el 14 % declarado',
        dia.every(i => Math.abs(CS.dhi[i] / CS.ghi[i] - 0.14) < 1e-12));

  // Estacionalidad: el sol de junio da más que el de diciembre a 40°N, y al
  // revés en el sur. Un signo perdido en la declinación daría un año dado la
  // vuelta con todas las fórmulas correctas.
  const sumaMes = (M, m) => {
    let s = 0;
    for (let i = 0; i < 8760; i++) if (M.t[i].getUTCMonth() === m) s += M.ghi[i];
    return s;
  };
  check('a 40°N junio recibe bastante más que diciembre',
        sumaMes(CS, 5) > sumaMes(CS, 11) * 2,
        Math.round(sumaMes(CS, 5)) + ' vs ' + Math.round(sumaMes(CS, 11)));
  const SUR = await LOC.clearsky(-35, LON, YEAR);
  check('y en el hemisferio sur se da la vuelta',
        sumaMes(SUR, 11) > sumaMes(SUR, 5),
        Math.round(sumaMes(SUR, 11)) + ' vs ' + Math.round(sumaMes(SUR, 5)));

  // La temperatura es sintética y también tiene forma: media, ciclo anual y
  // ciclo diario. Se comprueba la FORMA, no el valor de cada hora.
  const media = Array.from(CS.temp).reduce((a, b) => a + b, 0) / 8760;
  check('la temperatura sintética promedia lo declarado (~14 °C)',
        Math.abs(media - 14) < 0.6, media.toFixed(3));
  check('y tiene ciclo anual (verano más cálido que invierno)',
        CS.temp[24 * 180] > CS.temp[24 * 10] + 8,
        CS.temp[24 * 180].toFixed(1) + ' vs ' + CS.temp[24 * 10].toFixed(1));

  // ══════════════════════════════════════════════════════════════════
  //  2) EL RELLENO DEL FICHERO DEL USUARIO
  // ══════════════════════════════════════════════════════════════════
  const N = 48;
  function fuente(o) {
    o = o || {};
    const M = { t: [], ghi: new Float64Array(N), dhi: new Float64Array(N),
                dni: new Float64Array(N), ws: new Float64Array(N) };
    for (let i = 0; i < N; i++) {
      M.t.push(new Date(Date.UTC(YEAR, 5, 21, i % 24)));
      M.ghi[i] = o.ghi ? o.ghi(i) : 0;
    }
    return M;
  }
  // CASO A: el fichero NO trae irradiancia. Se rellena con cielo claro y se
  // DICE. Sin el flag, esa POA sintética viajaría al informe indistinguible
  // de una medida.
  const A = LOC.completaHSU(fuente({}), LAT, LON);
  check('sin irradiancia en el fichero, se declara `sin_irradiancia`',
        A.sin_irradiancia === true, String(A.sin_irradiancia));
  check('y se ha rellenado de verdad (hay irradiancia de día)',
        Array.from(A.ghi).some(v => v > 100),
        'máx ' + Math.max.apply(null, Array.from(A.ghi)).toFixed(1));
  check('de noche el relleno deja cero, no un valor de fondo',
        Array.from(A.ghi).filter((_, i) =>
          LOC.sun(A.t[i], LAT * D2R, LON).el <= 0).every(v => v === 0));

  // CASO B: el fichero SÍ la trae. No se toca, y se declara que no se ha
  // rellenado. Pisar el dato del usuario con un modelo sería lo contrario de
  // lo que esta función existe para hacer.
  const B = LOC.completaHSU(fuente({ ghi: i => (i % 24 >= 6 && i % 24 <= 18) ? 500 : 0 }), LAT, LON);
  check('con irradiancia en el fichero, NO se declara relleno',
        B.sin_irradiancia === false, String(B.sin_irradiancia));
  check('y el dato del usuario se respeta, no se pisa con el modelo',
        B.ghi[12] === 500, String(B.ghi[12]));

  // CASO C: la trae pero con huecos. Los huecos se rellenan y el resto no.
  const C = LOC.completaHSU(fuente({ ghi: i => i === 12 ? NaN : ((i % 24 >= 6 && i % 24 <= 18) ? 500 : 0) }),
                            LAT, LON);
  check('un hueco suelto se rellena aunque el fichero traiga irradiancia',
        isFinite(C.ghi[12]) && C.ghi[12] > 0, String(C.ghi[12]));
  check('y eso NO se declara como fichero sin irradiancia',
        C.sin_irradiancia === false, String(C.sin_irradiancia));
  check('las horas buenas siguen intactas', C.ghi[11] === 500 && C.ghi[13] === 500);

  // El cierre de componentes también aquí, con SU fracción. Son dos constantes
  // distintas —0,14 en el cielo claro y 0,16 al completar— y eso es una
  // decisión, no un descuido: se fija para que un cambio en una no se copie
  // sin querer a la otra.
  const dias = [];
  for (let i = 0; i < N; i++) if (Math.sin(LOC.sun(B.t[i], LAT * D2R, LON).el) > 0.087) dias.push(i);
  check('al completar, la fracción difusa es el 16 % (distinta del cielo claro)',
        dias.every(i => Math.abs(B.dhi[i] / B.ghi[i] - 0.16) < 1e-12),
        dias.length ? String(B.dhi[dias[0]] / B.ghi[dias[0]]) : 'sin horas altas');
  check('y las tres componentes cierran igual',
        dias.every(i => {
          const el = LOC.sun(B.t[i], LAT * D2R, LON).el;
          return Math.abs(B.ghi[i] - (B.dhi[i] + B.dni[i] * Math.sin(el))) < 1e-9;
        }));

  // ── MUTANTE ─────────────────────────────────────────────────────────
  // El defecto que más caro saldría, reproducido sobre la función real: que el
  // año de cielo claro traiga viento. Ese viento no lo ha medido nadie y sin
  // embargo produciría horas de abanderamiento con toda la pinta de un
  // resultado.
  const ctxM = { console, Promise, Date, Math, Float64Array, Array, LOC: { D2R } };
  vm.createContext(ctxM);
  vm.runInContext(trozos.join('\n').replace('o.ws[i]=0;', 'o.ws[i]=8;'), ctxM);
  const CSM = await ctxM.LOC.clearsky(LAT, LON, YEAR);
  check('MUTANTE: un cielo claro con viento inventado se distingue del honesto',
        CSM.ws.some(v => v !== 0) && CS.ws.every(v => v === 0),
        'mutado ws[0]=' + CSM.ws[0] + ' · bueno ws[0]=' + CS.ws[0] +
        ': si coincidieran, este banco no distinguiría el dato inventado');

  console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();
