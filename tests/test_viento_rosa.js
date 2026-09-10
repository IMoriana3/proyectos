// LA ROSA DE LOS VIENTOS — la que se dibuja y nadie comprobaba.
//
// `LOC.rosa` reparte las horas del año en 16 sectores × 4 bandas de velocidad,
// y de ahí salen la rosa del informe y la frase «el viento fuerte viene sobre
// todo del <rumbo>». MEDIDO: no aparecía en ningún arnés, y dos mutantes
// —repartir por sector con `floor` en vez de `round`, y mover la banda baja de
// 0,5·T1 a 0,8·T1— mataron CERO contra los nueve arneses de viento.
//
// Lo que hace peligrosa esta función es que su salida es un DIBUJO. Un reparto
// desplazado medio sector gira la rosa 11,25° y sigue pareciendo una rosa: no
// hay ningún número que chirríe, y la conclusión de proyecto —de dónde viene
// el viento que abandera— sale girada sin que nada avise.
//
// Se extrae del HTML real, no se copia (misma regla que test_viento_ejes.js).
//
//   node tests/test_viento_rosa.js
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
// `LOC.SECT` es una constante de una línea: se lee del HTML en vez de
// teclearla, porque un banco que fija 16 a mano seguiría verde el día que la
// ficha pase a 8 sectores y estaría midiendo otra rosa.
const mSect = html.match(/LOC\.SECT\s*=\s*(\d+)/);
check('la constante de sectores se lee del HTML, no se teclea', !!mSect,
      'no encuentro LOC.SECT');
const SECT = mSect ? Number(mSect[1]) : 16;
const trozo = saca('LOC.rosa=function(ws,wd,dtH,t1,t2){');
check('la función sigue en el HTML con esa firma', !!trozo);
if (!trozo || !mSect) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('lo extraído tiene cuerpo (' + trozo.length + ' chars)', trozo.length > 700);

const ctx = { console, LOC: { SECT } };
vm.createContext(ctx);
try { vm.runInContext(trozo, ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;
check('queda expuesta la rosa', typeof LOC.rosa === 'function');

const T1 = 10, T2 = 20, DT = 1;          // umbrales en m/s, paso de 1 h
// La llamada va envuelta A PROPÓSITO: un rumbo que se saliera de la rosa
// —quitar la vuelta módulo, por ejemplo— hace que la función indexe un sector
// que no existe y REVIENTE. Medido: sin esto el arnés muere con una traza y
// cero comprobaciones. El corredor lo cazaría igual (código ≠ 0 y recuento
// bajo el piso), pero un arnés tiene que REPORTAR, no explotar: lo que se lee
// entonces es «no arranca», que se confunde con un problema de entorno.
const ROTO = { sectores: [], bandas: [], horas_total: NaN, horas_sin_direccion: NaN,
               _error: null };
const R = (ws, wd, o) => {
  o = o || {};
  try {
    return LOC.rosa(Float64Array.from(ws), wd === null ? null : Float64Array.from(wd),
                    o.dtH === undefined ? DT : o.dtH,
                    o.t1 === undefined ? T1 : o.t1,
                    o.t2 === undefined ? T2 : o.t2);
  } catch (e) {
    return Object.assign({}, ROTO, { _error: String(e && e.message || e) });
  }
};
const total = s => s.reduce((a, b) => a + b, 0);
const sectorDe = r => r.sectores.findIndex(s => total(s) > 0);
const ANCHO = 360 / SECT;

// ── 1) LOS PUNTOS CARDINALES CAEN DONDE TIENEN QUE CAER ───────────────
// El sector 0 es el NORTE y los demás van en sentido horario. Si esto se
// desplaza, la rosa entera gira y la frase del informe nombra otro rumbo.
const CARDINALES = [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'O']];
CARDINALES.forEach(function (c) {
  const [g, nombre] = c;
  const r = R([5], [g]);
  const esperado = Math.round(g / ANCHO) % SECT;
  check('viento del ' + nombre + ' (' + g + '°) cae en el sector ' + esperado,
        sectorDe(r) === esperado, 'cayó en ' + sectorDe(r));
});
check('hay exactamente ' + SECT + ' sectores', R([5], [0]).sectores.length === SECT);

// ── 2) EL REPARTO ES POR REDONDEO, NO POR TRUNCAMIENTO ────────────────
// Cada sector está CENTRADO en su rumbo, así que la frontera está a medio
// ancho. Con truncamiento el sector empezaría en el rumbo en vez de centrarse
// y toda la rosa saldría girada medio sector — 11,25° con 16 sectores.
const casi = ANCHO / 2 - 0.01, justo = ANCHO / 2 + 0.01;
check('un rumbo a menos de medio sector del norte sigue siendo NORTE',
      sectorDe(R([5], [casi])) === 0, 'cayó en ' + sectorDe(R([5], [casi])));
check('y pasada la frontera ya es el sector siguiente',
      sectorDe(R([5], [justo])) === 1, 'cayó en ' + sectorDe(R([5], [justo])));
// La vuelta al norte por arriba: 359° no es un sector 16 que no existe.
check('359° vuelve al sector 0, no se sale de la rosa',
      sectorDe(R([5], [359])) === 0, 'cayó en ' + sectorDe(R([5], [359])));
check('y un rumbo negativo o mayor de 360 se normaliza igual',
      sectorDe(R([5], [-1])) === 0 && sectorDe(R([5], [721])) === 0,
      sectorDe(R([5], [-1])) + ' / ' + sectorDe(R([5], [721])));

// ── 3) LAS BANDAS SALEN DE LOS UMBRALES ───────────────────────────────
// No son cortes arbitrarios: son 0, medio T1, T1 y T2 — o sea, la rosa habla
// el mismo idioma que el criterio de abanderamiento. Se publican en km/h
// porque es lo que se lee en pantalla.
const r3 = R([5], [0]);
check('hay cuatro bandas y la última es abierta',
      r3.bandas.length === 4 && r3.bandas[3].max_kmh === null,
      JSON.stringify(r3.bandas));
check('los cortes son 0, T1/2, T1 y T2, en km/h',
      r3.bandas.map(b => b.min_kmh).join(',') ===
      [0, T1 * 0.5, T1, T2].map(v => Math.round(v * 3.6)).join(','),
      r3.bandas.map(b => b.min_kmh).join(','));
// El reparto por banda, con un valor en cada una. El corte es estricto por
// arriba: un viento igual al corte sube a la banda siguiente.
const r4 = R([T1 * 0.5 - 0.1, T1 * 0.5, T1, T2], [0, 0, 0, 0]);
check('cada velocidad cae en su banda, con el corte por arriba estricto',
      Array.from(r4.sectores[0]).join(',') === '1,1,1,1',
      Array.from(r4.sectores[0]).join(','));

// ── 4) LA DIRECCIÓN QUE FALTA SE CUENTA, NO SE TIRA ───────────────────
// Es la propiedad que más cuesta si se pierde: descartar las horas sin rumbo
// encogería el total en silencio, y asignarlas a un sector inventaría un
// viento que no se midió. Se cuentan aparte y se publican.
const r5 = R([5, 5, 5], [NaN, 0, NaN]);
check('las horas sin rumbo NO entran en ningún sector',
      total(r5.sectores.flat()) === 1, String(total(r5.sectores.flat())));
check('pero se publican aparte, no se pierden',
      r5.horas_sin_direccion === 2, String(r5.horas_sin_direccion));
check('y el total con rumbo las excluye', r5.horas_total === 1,
      String(r5.horas_total));
// Sin serie de rumbo NINGUNA hora tiene dirección: la rosa no se dibuja con
// un rumbo por defecto.
const r6 = R([5, 5], null);
check('sin serie de rumbo, todas las horas van a «sin dirección»',
      r6.horas_sin_direccion === 2 && r6.horas_total === 0,
      r6.horas_sin_direccion + ' / ' + r6.horas_total);

// ── 5) LAS HORAS SON HORAS ────────────────────────────────────────────
// El paso entra como argumento: a 10 min, seis muestras son una hora. Un
// reparto que contara MUESTRAS daría una rosa con la forma correcta y la
// escala equivocada, que es peor que una rosa mal formada.
const r7 = R(new Array(6).fill(5), new Array(6).fill(0), { dtH: 1 / 6 });
check('el paso de tiempo escala las horas (6 muestras de 10 min = 1 h)',
      Math.abs(r7.horas_total - 1) < 1e-9, String(r7.horas_total));
check('y el total cuadra con la suma de los sectores',
      Math.abs(total(r7.sectores.flat()) - r7.horas_total) < 0.05,
      total(r7.sectores.flat()) + ' vs ' + r7.horas_total);

// ── MUTANTE ───────────────────────────────────────────────────────────
// El defecto medido, reproducido sobre la función real: repartir con `floor`
// en vez de `round`. La rosa sigue siendo una rosa —mismas horas, mismo
// total— y está girada medio sector. Si este banco no lo distinguiera, no
// estaría midiendo lo que dice medir.
const ctxM = { console, LOC: { SECT } };
vm.createContext(ctxM);
vm.runInContext(trozo.replace('Math.round(((d%360)+360)%360/(360/S))',
                              'Math.floor(((d%360)+360)%360/(360/S))'), ctxM);
const norteMut = ctxM.LOC.rosa(Float64Array.from([5]), Float64Array.from([359]),
                               DT, T1, T2).sectores.findIndex(s => total(s) > 0);
check('MUTANTE: con truncamiento un viento de 359° deja de ser del norte',
      norteMut !== 0,
      'cae en el sector ' + norteMut + ': si fuera 0, este banco no ' +
      'distinguiría el reparto');

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
