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
// `unidadCabecera` entra en la extracción porque el parser LA LLAMA: sin ella
// el bloque extraído no es el parser, es un trozo. Lo enseñó este propio banco
// al ponerse rojo entero el día que se añadió —«LOC.unidadCabecera is not a
// function» en catorce comprobaciones— y ese rojo estaba BIEN.
const unidad = saca('LOC.unidadCabecera=function(cab){');
check('la tabla de alias, el lector de unidad y el parser siguen en el HTML',
      !!alias && !!parse && !!unidad,
      (alias ? '' : 'CSV_ALIAS ') + (parse ? '' : 'parseCSV ') + (unidad ? '' : 'unidadCabecera'));
if (!alias || !parse || !unidad) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('lo extraído tiene cuerpo (' + (alias.length + parse.length + unidad.length) + ' chars)',
      alias.length + parse.length + unidad.length > 1500);

const ctx = { console, LOC: {} };
vm.createContext(ctx);
try { vm.runInContext(alias + '\n' + unidad + '\n' + parse, ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;
check('queda expuesto el parser', typeof LOC.parseCSV === 'function');
check('y el lector de unidad de la cabecera', typeof LOC.unidadCabecera === 'function');

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

// ── 5b) LA UNIDAD DECLARADA MANDA SOBRE LA DEDUCIDA ───────────────────
// EL DEFECTO, MEDIDO el 2026-10-03. El heurístico de arriba lleva años
// acertando con los exports de SCADA porque traen rachas y cruzan el 45. Pero
// un año de reanálisis NO lo cruza: se metió en la ficha un año de ERA5 de
// Open-Meteo en km/h —de los que este repo y el hermano ya tienen horneados—
// con p98 de 26, y el parser lo declaró «m/s». 48,2 km/h de máximo anual
// entraron como 48,2 m/s = 173 km/h. Un 3,6x sobre la serie entera, en
// silencio y con cara de viento.
//
// Y EL DATO ESTABA EN EL FICHERO: las cabeceras reales escriben la unidad
// —este mismo banco, más arriba, usa «Velocidad viento (m/s)» como ejemplo de
// cabecera de verdad— y el parser la tiraba. Lo que se cierra aquí es ese
// orden: primero lo declarado, y sólo se deduce si no hay nada declarado.
//
// LO QUE ESTO **NO** HACE, y conviene que conste: no adivina mejor. Un fichero
// SIN declarar sigue leyéndose con el heurístico de siempre —invertirlo
// rompería todos los ficheros en m/s, que son la mayoría—. Lo que cambia es
// que la duda deja de ser invisible.

// a) declarada km/h POR DEBAJO del corte: el caso que falló de verdad.
//    Sin la declaración, 18 a 24 se leerían como m/s y nadie se enteraría.
const decKmh = intenta(csv({ cab: ['time', 'wind_speed (km/h)', 'wind_direction'],
                             ws: i => String(18 + (i % 7)) })).r;
check('la cabecera que declara km/h manda aunque el p98 NO cruce el corte',
      decKmh.unidad === 'km/h' && Math.abs(decKmh.ws[0] - 18 / 3.6) < 1e-6,
      decKmh.unidad + ' · ' + decKmh.ws[0]);

// b) y al revés, que es la prueba de que manda DE VERDAD: declarada m/s POR
//    ENCIMA del corte. Aquí el heurístico diría km/h y se le lleva la contraria.
const decMs = intenta(csv({ cab: ['time', 'Velocidad viento (m/s)', 'wind_direction'],
                            ws: i => String(46 + (i % 5)) })).r;
check('la cabecera que declara m/s manda aunque el p98 SÍ cruce el corte',
      decMs.unidad === 'm/s' && Math.abs(decMs.ws[0] - 46) < 1e-9,
      decMs.unidad + ' · ' + decMs.ws[0]);

// c) de qué camino salió la unidad, porque un número sin procedencia no se
//    puede discutir con nadie.
check('se publica si la unidad vino declarada o deducida',
      decKmh.unidad_como === 'declarada en la cabecera' &&
      rMs.unidad_como === 'deducida del p98',
      decKmh.unidad_como + ' / ' + rMs.unidad_como);
check('y el p98 con el que se decidió', typeof rMs.unidad_p98 === 'number',
      String(rMs.unidad_p98));

// d) LA REGRESIÓN del fichero que falló: sin declarar y con el p98 del ERA5.
//    El número NO cambia —se sigue leyendo m/s— y eso es lo correcto; lo que
//    cambia es que sale marcado como dudoso en vez de pasar callando.
const era5 = intenta(csv({ cab: ['time', 'wind_speed_10m', 'wind_direction'],
                           ws: i => String(20 + (i % 9)) })).r;
check('un año tipo ERA5 sin unidad declarada se marca DUDOSO',
      era5.unidad_dudosa === true && era5.unidad === 'm/s',
      era5.unidad + ' · dudosa=' + era5.unidad_dudosa + ' · p98=' + era5.unidad_p98);

// e) con declaración no hay duda que valga, y f) un año normal en m/s tampoco
//    la levanta: una alarma que salta siempre no es una alarma.
check('declarada la unidad, no se marca duda', decKmh.unidad_dudosa === false);
// Y ESTA FUE LA QUE CORRIGIÓ EL NÚMERO. La franja empezó en p98>=11 y esta
// comprobación se encendió a la primera: el fixture corriente de 5 a 11 m/s
// tiene el p98 en 11 clavado. El suelo subió a 16 por eso, no por gusto.
check('y un año corriente en m/s (p98 = 11) tampoco la levanta',
      rMs.unidad_dudosa === false,
      'p98=' + rMs.unidad_p98);

// g) EL GUIÓN BAJO, que es como viene media planta. Con \b —el borde
//    obvio— «viento_kmh» no casa, porque el guión bajo es carácter de palabra.
check('«viento_kmh» se reconoce (el borde no puede ser \\b)',
      LOC.unidadCabecera('viento_kmh') === 'km/h',
      String(LOC.unidadCabecera('viento_kmh')));
check('y una cabecera sin unidad devuelve null, no una inventada',
      LOC.unidadCabecera('wind_speed_10m') === null &&
      LOC.unidadCabecera('viento') === null);

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
vm.runInContext(alias + '\n' + unidad + '\n' + parse.replace('return b.n-a.n;', 'return a.n-b.n;'), ctxM);
let mut = null;
try { ctxM.LOC.parseCSV(csv({})); } catch (e) { mut = String(e && e.message || e); }
check('MUTANTE: con el separador menos frecuente el fichero deja de leerse',
      mut !== null,
      'lo leyó igual: si fuera así, este banco no distinguiría la detección');

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
