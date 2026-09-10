// LA CARTERA: migra los datos del usuario y publica el registro de plantas —
// y no la probaba nadie.
//
// `cartera-tabla.html` es la tabla de plantas de Factiun. Vive en el navegador
// del usuario: sus datos están en `localStorage`, no en un servidor. Tres cosas
// que hace y que nadie comprobaba:
//
//   · `migrateFases` MIGRA lo guardado. Las cinco fases de PEM eran casillas
//     sí/no y ahora son tres estados; cada carga reescribe los registros del
//     usuario para adaptarlos. Una migración mal hecha no da un error: cambia
//     su cartera en silencio y sin vuelta atrás, porque lo que se guarda
//     después es ya el resultado.
//   · `corrigeConocidos` aplica correcciones curadas a mano contra el DWG —la
//     de Ayora está documentada en el propio fichero: la cartera decía 8 HSU y
//     el plano dibuja diez—. Corrige de menos a propósito: solo rellena lo
//     VACÍO, para no pisar lo que el usuario haya tecleado.
//   · `publishSpecs` escribe `factiun_plantas`, el registro compartido del
//     mismo origen que LEEN LOS DEMÁS VISORES. Es un contrato entre fichas sin
//     servidor de por medio.
//
// MEDIDO: de los 33 arneses, el ÚNICO que nombra esta ficha es `test_pwa.js`,
// y lo que hace con ella es listarla en la caché y comprobar que carga. Un
// mutante que invierte la migración —cada fase «Terminado» pasa a «Sin
// empezar»— no mata NADA: ni en `test_pwa`, ni en `test_index`, ni en
// `test_integridad`. Y ningún otro arnés abre el fichero, así que ése es el
// cuadro completo.
//
// Se extrae del HTML real, no se copia. El extractor aquí empareja LLAVES y no
// busca `\n};`, porque estas funciones no siguen ese estilo — y un extractor
// que se traiga media función también compila.
//
//   node tests/test_cartera.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const html = fs.readFileSync(path.join(RAIZ, 'cartera-tabla.html'), 'utf8');
// Extractor por emparejado de llaves: entra en la primera `{` tras la firma y
// sale cuando el nivel vuelve a cero. Ignora llaves dentro de cadenas y de
// expresiones regulares simples, que las hay (`/^(x|s[ií]|1|true)$/`).
function sacaFn(nombre) {
  const firma = 'function ' + nombre + '(';
  const i = html.indexOf(firma);
  if (i < 0) return null;
  let j = html.indexOf('{', i), nivel = 0, cad = null, k = j;
  for (; k < html.length; k++) {
    const c = html[k], p = html[k - 1];
    if (cad) { if (c === cad && p !== '\\') cad = null; continue; }
    if (c === '"' || c === "'") { cad = c; continue; }
    if (c === '{') nivel++;
    else if (c === '}') { nivel--; if (nivel === 0) return html.slice(i, k + 1); }
  }
  return null;
}
// Las constantes vienen de dos maneras: sueltas (`const LSK='…';`) y dentro de
// una declaración múltiple (`const TEC=…, INV=…, FASE=[…];`). La segunda forma
// se le escapaba a la primera versión de este extractor y `FASE` salía sin
// encontrar — lo dijo el propio banco al arrancar.
// Se re-declaran como `var` y no como `const` A PROPÓSITO: en `vm`, un `const`
// de nivel superior es léxico y NO se cuelga del objeto contexto, así que el
// banco no podría leer `FKEYS` para construir sus casos —tendría que teclearlo,
// que es justo lo que este arnés evita—. Las funciones sí se cuelgan, por eso
// `migrateFases` aparecía y la constante no. El valor sigue saliendo del HTML.
function sacaConst(nombre) {
  const suelta = html.match(new RegExp('^const ' + nombre + '\\s*=\\s*([^;]+);', 'm'));
  if (suelta) return 'var ' + nombre + ' = ' + suelta[1] + ';';
  const dentro = html.match(new RegExp('\\b' + nombre + '\\s*=\\s*(\\[[^\\]]*\\]|\\{[^}]*\\})'));
  return dentro ? 'var ' + nombre + ' = ' + dentro[1] + ';' : null;
}
const FNS = ['migrateFases', 'corrigeConocidos', 'firstInt', 'num', 'publishSpecs'];
const CONS = ['FKEYS', 'FASE', 'LSK', 'NPROY'];
const trozosF = FNS.map(sacaFn), trozosC = CONS.map(sacaConst);
check('las cinco funciones siguen en el HTML', trozosF.every(Boolean),
      FNS.filter((f, i) => !trozosF[i]).join(' · '));
check('y las cuatro constantes que necesitan', trozosC.every(Boolean),
      CONS.filter((f, i) => !trozosC[i]).join(' · '));
if (!trozosF.every(Boolean) || !trozosC.every(Boolean)) {
  console.log('\nFALLOS: ' + ko); process.exit(1);
}
// El vacío y lo casi vacío son error: un extractor que se traiga la firma y la
// primera llave devolvería algo que compila y no hace nada.
check('lo extraído tiene cuerpo (' + trozosF.join('').length + ' chars)',
      trozosF.join('').length > 900);
check('y `migrateFases` trae su cierre, no media función',
      /return a;\}$/.test(sacaFn('migrateFases').replace(/\s+$/, '')),
      sacaFn('migrateFases').slice(-40));

// `localStorage` de mentira: la ficha vive en el navegador y aquí no hay uno.
// Se le da uno mínimo para poder mirar QUÉ publica, que es el contrato con los
// demás visores.
const almacen = {};
const ctx = { console, JSON, String, Object, Array, Math, parseFloat, parseInt, isFinite,
              localStorage: { getItem: k => (k in almacen ? almacen[k] : null),
                              setItem: (k, v) => { almacen[k] = String(v); } },
              DATA: [] };
vm.createContext(ctx);
try { vm.runInContext(trozosC.join('\n') + '\n' + trozosF.join('\n'), ctx); }
catch (e) { check('el bloque compila en Node', false, e.message); }
check('quedan expuestas las funciones',
      FNS.every(f => typeof ctx[f] === 'function'),
      FNS.filter(f => typeof ctx[f] !== 'function').join(' · '));
// Y las constantes también: sin ellas el banco no puede construir sus casos a
// partir del fichero real, que es la mitad del sentido de extraer.
check('y las constantes, con su valor del HTML',
      CONS.every(c => ctx[c] !== undefined),
      CONS.filter(c => ctx[c] === undefined).join(' · '));

// ══════════════════════════════════════════════════════════════════════
//  1) LA MIGRACIÓN DE LAS FASES
// ══════════════════════════════════════════════════════════════════════
// Las cinco columnas de PEM eran casillas y ahora son tres estados. La tabla
// de equivalencias se ejercita ENTERA: cada forma que pudo quedar guardada
// tiene que caer en su estado, y lo que no se reconozca en «Sin empezar» —que
// es el conservador: no dar por hecho un trabajo que no consta.
const FKEYS = ctx.FKEYS;
const uno = v => ctx.migrateFases([FKEYS.reduce((o, k) => (o[k] = v, o), {})])[0];
const CASOS = [
  [true, 'Terminado'], ['x', 'Terminado'], ['X', 'Terminado'], ['sí', 'Terminado'],
  ['si', 'Terminado'], ['1', 'Terminado'], ['true', 'Terminado'], ['yes', 'Terminado'],
  ['Terminado', 'Terminado'],
  ['En proceso', 'En proceso'], ['en PROCESO', 'En proceso'], ['proceso', 'En proceso'],
  [false, 'Sin empezar'], [null, 'Sin empezar'], ['', 'Sin empezar'],
  [undefined, 'Sin empezar'], ['cualquier cosa', 'Sin empezar'], [0, 'Sin empezar'],
];
CASOS.forEach(function (c) {
  const [dentro, fuera] = c;
  const r = uno(dentro);
  check('la fase guardada como ' + JSON.stringify(dentro) + ' migra a «' + fuera + '»',
        FKEYS.every(k => r[k] === fuera), FKEYS.map(k => r[k]).join('/'));
});
// IDEMPOTENCIA. La migración corre en CADA carga, y lo que se guarda después
// es su resultado: si no fuera idempotente, la segunda carga estropearía lo
// que la primera arregló.
const dosVeces = ctx.migrateFases(ctx.migrateFases([{ cold: 'x', site: false, escaneo: 'proceso',
                                                      offset: 'Terminado', hot: 'bla' }]))[0];
check('migrar dos veces da lo mismo que migrar una (se ejecuta en cada carga)',
      dosVeces.cold === 'Terminado' && dosVeces.site === 'Sin empezar'
      && dosVeces.escaneo === 'En proceso' && dosVeces.offset === 'Terminado'
      && dosVeces.hot === 'Sin empezar', JSON.stringify(dosVeces));
// Y no toca NADA más del registro: una migración que se lleve por delante otra
// columna sería peor que no migrar.
const otras = ctx.migrateFases([{ cold: true, proyecto: 'El Burgo I', trk_total: 215,
                                  estado_pem: 'En marcha' }])[0];
check('y no toca ninguna otra columna del registro',
      otras.proyecto === 'El Burgo I' && otras.trk_total === 215
      && otras.estado_pem === 'En marcha');

// ══════════════════════════════════════════════════════════════════════
//  2) LAS CORRECCIONES CURADAS
// ══════════════════════════════════════════════════════════════════════
// Ayora: la cartera decía 8 HSU y el DWG dibuja diez. La corrección lleva su
// guarda —solo si el valor guardado es el viejo— para no reescribir una
// cartera ya corregida ni una que diga otra cosa a propósito.
const ayoraVieja = ctx.corrigeConocidos([{ num: 24025, anem_total: 8, anem_us: 8 }])[0];
check('Ayora con los 8 HSU viejos se corrige a los 10 del DWG',
      ayoraVieja.anem_total === 10 && ayoraVieja.anem_us === 10,
      ayoraVieja.anem_total + '/' + ayoraVieja.anem_us);
const ayoraOtra = ctx.corrigeConocidos([{ num: 24025, anem_total: 12, anem_us: 12 }])[0];
check('pero si dice otra cosa, no se toca (la guarda mira el valor viejo)',
      ayoraOtra.anem_total === 12, String(ayoraOtra.anem_total));
check('y la corrección no alcanza a otras plantas',
      ctx.corrigeConocidos([{ num: 24002, anem_total: 8, anem_us: 8 }])[0].anem_total === 8);

// RELLENAR NO ES CORREGIR, y es la regla que hace segura esta función: de las
// dos plantas del DWG solo se escribe lo que está VACÍO. Si el usuario tecleó
// un número, se queda — aunque el plano diga otra cosa.
const vacia = ctx.corrigeConocidos([{ num: 25004 }])[0];
check('una planta sin datos recibe los del DWG',
      vacia.trk_total === 730 && vacia.anem_total === 4
      && Math.abs(vacia.lat - 37.3755148) < 1e-9,
      JSON.stringify(vacia));
const tecleada = ctx.corrigeConocidos([{ num: 25004, trk_total: 999, lat: '' }])[0];
check('lo que el usuario ya tecleó NO se pisa, aunque el DWG diga otra cosa',
      tecleada.trk_total === 999, String(tecleada.trk_total));
check('y el hueco que dejó sí se rellena',
      Math.abs(tecleada.lat - 37.3755148) < 1e-9, String(tecleada.lat));
check('la segunda planta del DWG también, con SUS números',
      ctx.corrigeConocidos([{ num: '25004.2' }])[0].trk_total === 1476);
// El código de planta viaja a veces como número y a veces como texto —«25004.2»
// es texto por narices—, así que la búsqueda va por `String`. Un `===` sobre
// tipos mezclados dejaría media tabla sin corregir.
check('el código se compara como TEXTO (los hay con decimal)',
      ctx.corrigeConocidos([{ num: 25004 }])[0].trk_total === 730
      && ctx.corrigeConocidos([{ num: '25004' }])[0].trk_total === 730);

// ══════════════════════════════════════════════════════════════════════
//  3) EL REGISTRO COMPARTIDO
// ══════════════════════════════════════════════════════════════════════
// `publishSpecs` escribe `factiun_plantas`, que leen los demás visores del
// mismo origen. Es un contrato entre fichas: lo que no se publique aquí, allí
// no existe.
ctx.DATA = [
  { num: 24002, proyecto: 'El Burgo I', string: '28', pitch: 6, lat: 41.57634,
    lon: -0.79814, wmod: 605, pac: 11, pdc: 13.95856, trk_total: 215, trk_bi: 215,
    trk_mono: 0, cantidad: 23072, ncu_eth: 1, ncu_fo: 1, estado_pem: 'En marcha',
    pais: 'España' },
  { num: '', proyecto: 'sin código' },
  { num: 25082, proyecto: 'Polvorín', string: '31\n16+15', pitch: 4.5, lat: '', lon: '' }
];
ctx.publishSpecs();
const reg = JSON.parse(almacen['factiun_plantas'] || '{}');
check('publica en la clave compartida `factiun_plantas`',
      almacen['factiun_plantas'] != null);
check('una planta SIN código no se publica (no tendría cómo referenciarse)',
      Object.keys(reg).length === 2, Object.keys(reg).join(','));
check('y el número de PROYECTO se traduce cuando difiere del de cartera',
      reg['24002'].nproy === '23003', reg['24002'].nproy);
check('los módulos por string salen del PRIMER entero de un campo libre',
      reg['25082'].mods === 31, String(reg['25082'].mods));
check('las coordenadas vacías se publican como null, no como cero',
      reg['25082'].lat === null && reg['25082'].lon === null,
      JSON.stringify([reg['25082'].lat, reg['25082'].lon]));
check('y las que hay, como número',
      Math.abs(reg['24002'].lat - 41.57634) < 1e-9);
check('la potencia viaja (el Panel la pinta junto al nombre)',
      reg['24002'].pac === 11 && Math.abs(reg['24002'].pdc - 13.95856) < 1e-9,
      JSON.stringify([reg['24002'].pac, reg['24002'].pdc]));

// `firstInt` y `num`, que son quienes hacen ese trabajo sucio.
check('`firstInt` saca el primer entero de un texto libre',
      ctx.firstInt('24/27') === 24 && ctx.firstInt('28') === 28
      && ctx.firstInt('42/14') === 42);
check('y devuelve null cuando no hay ninguno, no cero',
      ctx.firstInt('') === null && ctx.firstInt(null) === null
      && ctx.firstInt('abc') === null,
      JSON.stringify([ctx.firstInt(''), ctx.firstInt(null), ctx.firstInt('abc')]));
check('`num` entiende la coma decimal y cae a 0 con basura',
      ctx.num('5,5') === 5.5 && ctx.num('6') === 6 && ctx.num('abc') === 0
      && ctx.num(null) === 0, JSON.stringify([ctx.num('5,5'), ctx.num('abc')]));

// ── MUTANTE ───────────────────────────────────────────────────────────
// El defecto medido, reproducido sobre la función real: invertir la migración.
// Cada fase terminada del usuario pasaría a «Sin empezar» y se guardaría así.
// Si este banco no lo distinguiera, no estaría midiendo lo que dice medir — y
// es exactamente lo que pasaba con los 33 arneses.
const ctxM = { console, JSON, String, Object, Array, Math };
vm.createContext(ctxM);
vm.runInContext(trozosC.join('\n') + '\n' +
                sacaFn('migrateFases').replace("if(v===true)r[k]='Terminado';",
                                               "if(v===true)r[k]='Sin empezar';"), ctxM);
const mut = ctxM.migrateFases([{ cold: true, site: true, escaneo: true, offset: true, hot: true }])[0];
check('MUTANTE: con la migración invertida, una fase terminada se pierde',
      mut.cold === 'Sin empezar' && uno(true).cold === 'Terminado',
      'mutado «' + mut.cold + '» · bueno «' + uno(true).cold +
      '»: si coincidieran, este banco no distinguiría la migración');

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
