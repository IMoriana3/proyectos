// EL CSV DEL USUARIO — por donde entran sus datos, y nadie lo comprobaba.
//
// `LOC.parseCSV` es la puerta del histórico de planta: separador, cabeceras en
// dos idiomas, fechas de cuatro formas, coma decimal, orden y —lo que más
// pesa— la DETECCIÓN DE UNIDADES. MEDIDO: no aparecía en ningún arnés, y un
// mutante que le hace elegir el separador MENOS frecuente mató CERO contra los
// nueve arneses de viento. No es que estuviera mal cubierto: es que no está en
// el camino que los arneses recorren (cuelga del manejador de subida de
// fichero, que ninguno dispara). Un hueco de camino, no de banco — y se cierra
// igual, porque el código existe y decide.
//
// LA HEURÍSTICA QUE DECIDE LA ESCALA DE TODO
// -------------------------------------------
// Si el percentil 98 del viento pasa de 45, el parser asume km/h y divide por
// 3,6. Es una decisión razonable —nadie mide 60 m/s de media— y es también el
// sitio donde un fallo es más caro: si se equivoca, TODAS las velocidades
// salen 3,6 veces mal y siguen pareciendo viento. No hay ningún número que
// chirríe; lo que cambia es cuántas horas se pasa el seguidor abanderado.
//
// Se extrae del HTML real, no se copia (misma regla que test_viento_ejes.js).
//
//   node tests/test_viento_csv.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const html = fs.readFileSync(path.join(RAIZ, 'sim-viento.html'), 'utf8');
function saca(firma, cierre) {
  const i = html.indexOf(firma);
  if (i < 0) return null;
  const j = html.indexOf(cierre || '\n};', i);
  return j < 0 ? null : html.slice(i, j + (cierre || '\n};').length);
}
const alias = saca('LOC.CSV_ALIAS={', '\n};');
const parse = saca('LOC.parseCSV=function(txt){');
check('la tabla de alias y el parser siguen en el HTML',
      !!alias && !!parse, (alias ? '' : 'CSV_ALIAS ') + (parse ? '' : 'parseCSV'));
if (!alias || !parse) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('lo extraído tiene cuerpo (' + (alias.length + parse.length) + ' chars)',
      alias.length + parse.length > 1500);

const ctx = { console, LOC: {} };
vm.createContext(ctx);
try { vm.runInContext(alias + '\n' + parse, ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;
check('queda expuesto el parser', typeof LOC.parseCSV === 'function');

// ── el generador de ficheros de mentira ───────────────────────────────
// Con 30 filas: el parser exige al menos 24 con fecha válida, así que un
// fixture más corto probaría el rechazo y no el parseo.
const N = 30;
function csv(o) {
  o = o || {};
  const sep = o.sep === undefined ? ',' : o.sep;
  const cab = o.cab || ['time', 'wind_speed', 'wind_direction'];
  const filas = [cab.join(sep)];
  for (let i = 0; i < (o.n === undefined ? N : o.n); i++) {
    const h = String(i % 24).padStart(2, '0');
    const dia = 1 + Math.floor(i / 24);
    const t = o.fecha ? o.fecha(i, dia, h) : '2023-01-' + String(dia).padStart(2, '0') + 'T' + h + ':00';
    const v = o.ws ? o.ws(i) : String(5 + (i % 7));
    const d = o.wd ? o.wd(i) : String((i * 13) % 360);
    filas.push([t, v, d].join(sep));
  }
  return (o.orden ? o.orden(filas) : filas).join('\n');
}
const intenta = txt => { try { return { r: LOC.parseCSV(txt) }; }
                         catch (e) { return { e: String(e && e.message || e) }; } };

// ── 1) LO BÁSICO, EN LOS TRES SEPARADORES ─────────────────────────────
// El separador se elige por el que MÁS aparece en la cabecera. Con el menos
// frecuente, una cabecera de tres columnas se lee como una sola y no se
// encuentra ninguna: el fichero del usuario se rechaza entero.
[[',', 'coma'], [';', 'punto y coma'], ['\t', 'tabulador']].forEach(function (s) {
  const [sep, nombre] = s;
  const { r, e } = intenta(csv({ sep }));
  check('lee un CSV separado por ' + nombre, !!r && r.t.length === N, e || (r && r.t.length));
});

// ── 2) LAS CABECERAS, EN DOS IDIOMAS ──────────────────────────────────
// La tabla de alias existe para que el usuario no tenga que renombrar su
// export. Se prueban las dos familias, y por SUBCADENA —«Velocidad viento
// (m/s)» tiene que casar— porque es como vienen los ficheros de verdad.
const { r: rEs } = intenta(csv({ cab: ['Fecha', 'Velocidad viento (m/s)', 'Dirección'] }));
check('cabeceras en español, con unidades pegadas, se reconocen',
      !!rEs && rEs.t.length === N);
const { r: rEn } = intenta(csv({ cab: ['Timestamp', 'WindSpeed', 'WindDir'] }));
check('y en inglés, con mayúsculas', !!rEn && rEn.t.length === N);
// Lo que NO se reconoce se dice, y se dice CUÁL falta: un «no puedo leerlo» a
// secas deja al usuario adivinando.
const sinT = intenta(csv({ cab: ['x', 'wind_speed', 'wd'] }));
check('sin columna de fecha, se explica qué falta',
      !!sinT.e && /fecha/i.test(sinT.e), sinT.e);
const sinV = intenta(csv({ cab: ['time', 'x', 'wd'] }));
check('sin columna de viento, también', !!sinV.e && /viento/i.test(sinV.e), sinV.e);

// ── 3) LAS FECHAS, EN SUS CUATRO FORMAS ───────────────────────────────
const FORMATOS = [
  ['ISO sin zona', (i, d, h) => '2023-01-' + String(d).padStart(2, '0') + 'T' + h + ':00'],
  ['ISO con Z', (i, d, h) => '2023-01-' + String(d).padStart(2, '0') + 'T' + h + ':00:00Z'],
  ['con espacio', (i, d, h) => '2023-01-' + String(d).padStart(2, '0') + ' ' + h + ':00:00'],
  ['con desfase', (i, d, h) => '2023-01-' + String(d).padStart(2, '0') + 'T' + h + ':00:00+01:00'],
];
FORMATOS.forEach(function (f) {
  const [nombre, fn] = f;
  const { r, e } = intenta(csv({ fecha: fn }));
  check('acepta fechas ' + nombre, !!r && r.t.length === N, e);
});
// Una fila con fecha ilegible se SALTA, no tumba el fichero ni se cuela con
// una fecha inventada.
const conBasura = intenta(csv({ n: 30, fecha: (i, d, h) =>
  i === 5 ? 'no-es-una-fecha' : '2023-01-' + String(d).padStart(2, '0') + 'T' + h + ':00' }));
check('una fila con fecha ilegible se salta y las demás entran',
      !!conBasura.r && conBasura.r.t.length === N - 1,
      conBasura.e || (conBasura.r && conBasura.r.t.length));

// ── 4) EL ORDEN LO PONE EL PARSER ─────────────────────────────────────
// Un export puede venir del revés o desordenado. Si el parser no ordenara, el
// remuestreo y las ventanas del reproductor trabajarían sobre un eje que
// retrocede, y eso no falla: da resultados raros.
const alReves = intenta(csv({ orden: f => [f[0]].concat(f.slice(1).reverse()) }));
check('un fichero del revés sale ORDENADO en el tiempo',
      !!alReves.r && alReves.r.t.every((v, i) => i === 0 || v >= alReves.r.t[i - 1]),
      alReves.e);

// ── 5) LA DETECCIÓN DE UNIDADES — lo que decide la escala de todo ─────
// Con vientos de 5 a 11 nadie duda: son m/s y no se toca nada.
const { r: rMs } = intenta(csv({ ws: i => String(5 + (i % 7)) }));
check('con vientos de 5 a 11 se lee como m/s y no se convierte',
      rMs.unidad === 'm/s' && Math.abs(rMs.ws[0] - 5) < 1e-9,
      rMs.unidad + ' · ' + rMs.ws[0]);
// El mismo fichero en km/h: se detecta y se convierte, y la unidad se DECLARA.
// Sin la declaración, el informe diría m/s sobre números divididos.
//
// La base es 13 y no 5 A PROPÓSITO, y esto lo enseñó el propio banco al fallar:
// con 5 m/s el fichero en km/h vale 18, que NO cruza el corte de 45, así que
// el parser lo leía como m/s y tenía razón. Un fixture que no cruza el umbral
// no prueba la detección — prueba que no se dispara. Con 13 a 19 m/s el mismo
// viento son 47 a 68 km/h y la heurística tiene algo que decidir.
const BASE = i => 13 + (i % 7);
const { r: rMsA } = intenta(csv({ ws: i => String(BASE(i)) }));
const { r: rKmh } = intenta(csv({ ws: i => String(BASE(i) * 3.6) }));
check('el mismo viento en km/h se detecta y se convierte a m/s',
      rKmh.unidad === 'km/h' && Math.abs(rKmh.ws[0] - 13) < 1e-6,
      rKmh.unidad + ' · ' + rKmh.ws[0]);
check('y las dos lecturas coinciden tras convertir',
      rMsA.ws.every((v, i) => Math.abs(v - rKmh.ws[i]) < 1e-6),
      rMsA.ws[0] + ' vs ' + rKmh.ws[0]);
// LA FRONTERA, que es donde la heurística decide. Se prueba a los dos lados
// del corte: por debajo no convierte, por encima sí. Un banco que solo mirase
// 5 y 60 no distinguiría dónde está el umbral.
const bajo = intenta(csv({ ws: () => '44' })).r;
const alto = intenta(csv({ ws: () => '46' })).r;
check('justo por debajo del corte sigue siendo m/s', bajo.unidad === 'm/s',
      bajo.unidad + ' · ' + bajo.ws[0]);
check('y justo por encima pasa a km/h', alto.unidad === 'km/h',
      alto.unidad + ' · ' + alto.ws[0]);

// ── 6) NÚMEROS Y RANGOS ───────────────────────────────────────────────
// El separador es PUNTO Y COMA, y no es un detalle: un fichero con coma
// decimal no puede usar la coma de separador, se partiría el campo en dos. Mi
// primera versión lo hacía y leía 5 donde había escrito 5,5 — el banco tenía
// razón y el fixture estaba mal. Los exports españoles vienen así.
const { r: rComa } = intenta(csv({ sep: ';', ws: () => '5,5' }));
check('la coma decimal se entiende (ficheros en español, separados por ;)',
      !!rComa && Math.abs(rComa.ws[0] - 5.5) < 1e-9, rComa && rComa.ws[0]);
const { r: rNeg } = intenta(csv({ ws: i => i === 3 ? '-4' : '5' }));
check('un viento negativo se recorta a 0, no se propaga',
      rNeg.ws[3] === 0, String(rNeg.ws[3]));
const { r: rDir } = intenta(csv({ wd: i => i === 2 ? '-90' : (i === 3 ? '450' : '180') }));
check('las direcciones se normalizan a [0, 360)',
      rDir.wd[2] === 270 && rDir.wd[3] === 90,
      rDir.wd[2] + ' / ' + rDir.wd[3]);
const { r: rVacio } = intenta(csv({ ws: i => i === 4 ? '' : '5' }));
check('un hueco en el viento entra como 0, no como texto ni NaN',
      rVacio.ws[4] === 0, String(rVacio.ws[4]));

// ── 7) LA RÁFAGA SE DECLARA SI VIENE ──────────────────────────────────
// `tiene_rafaga` es lo que decide si el criterio usa la medida o el modelo, así
// que decirlo mal cambia la procedencia del número sin cambiar su aspecto.
const conRafaga = 'time,wind_speed,gust\n' + Array.from({ length: N }, (_, i) =>
  '2023-01-0' + (1 + Math.floor(i / 24)) + 'T' + String(i % 24).padStart(2, '0') +
  ':00,5,12').join('\n');
check('con columna de ráfaga, se declara que la trae',
      intenta(conRafaga).r.tiene_rafaga === true);
check('y sin ella, que no', rMs.tiene_rafaga === false);

// ── 8) LOS RECHAZOS ───────────────────────────────────────────────────
// Rechazar es un resultado, y tiene que llegar con su motivo. El parser lanza
// en vez de devolver algo vacío que aguas abajo parecería un año sin viento.
check('menos de tres líneas se rechaza diciendo por qué',
      /tres líneas/i.test(intenta('a,b\n1,2').e || ''), intenta('a,b\n1,2').e);
check('una cabecera sin separador reconocible, también',
      /separador/i.test(intenta('unacolumna\n1\n2\n3').e || ''),
      intenta('unacolumna\n1\n2\n3').e);
const pocas = intenta(csv({ n: 10 }));
check('y menos de 24 filas válidas se rechaza con el recuento',
      /24|10/.test(pocas.e || ''), pocas.e);

// ── MUTANTE ───────────────────────────────────────────────────────────
// El defecto medido, reproducido sobre la función real: elegir el separador
// MENOS frecuente. Con una cabecera de tres columnas separadas por coma, el
// fichero entero deja de leerse. Si este banco no lo distinguiera, no estaría
// midiendo lo que dice medir.
const ctxM = { console, LOC: {} };
vm.createContext(ctxM);
vm.runInContext(alias + '\n' + parse.replace('return b.n-a.n;', 'return a.n-b.n;'), ctxM);
let mut = null;
try { ctxM.LOC.parseCSV(csv({})); } catch (e) { mut = String(e && e.message || e); }
check('MUTANTE: con el separador menos frecuente el fichero deja de leerse',
      mut !== null,
      'lo leyó igual: si fuera así, este banco no distinguiría la detección');

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
