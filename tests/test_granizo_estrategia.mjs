// LA ESTRATEGIA DE VIENTO × GRANIZO, ejercitada SIN NAVEGADOR.
//
// La decisión vive en funciones puras dentro de `sim-viento.html` —`LOC.GRZ`,
// `LOC.ladoEspaldaAlViento`, `LOC.granizoPlan`, `LOC.granizoMatriz`— y este
// banco las extrae del fichero y las corre en nodo. Es a propósito: los otros
// bancos de la ficha necesitan Chromium, así que su mecanismo no se puede
// ejercitar donde no haya navegador. El de aquí sí.
//
// LA EXTRACCIÓN ES UN RIESGO Y SE VIGILA. Si alguien renombra o mueve ese
// bloque, un `indexOf` que no encuentra nada devolvería un trozo vacío y este
// banco pasaría a probar NADA mientras sale verde. Así que la extracción se
// comprueba antes de comprobar cualquier otra cosa, y si falla este fichero se
// pone rojo por ahí y no por los casos.
//
// QUÉ FIJA, y no es el criterio: el criterio es una PROPUESTA (adapta a tiempos
// los umbrales en distancias de VDE Americas) y no está aprobada. Lo que este
// banco fija es que la máquina haga lo que la propuesta dice, que el orden de
// precedencia sea el que es —el viento que YA sopla manda sobre todo— y que lo
// que la ficha AÑADE a la propuesta (si la maniobra cabe en el margen, y qué se
// cede cuando no se va al lado bueno) sea aritmética y no opinión.
//
//   node tests/test_granizo_estrategia.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FICHA = path.join(AQUI, '..', 'sim-viento.html');

let ok = 0, ko = 0;
const check = (n, cond, extra) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + String(extra) : '')); }
};

/* ── LA EXTRACCIÓN, comprobada antes de usarla ─────────────────────────────
   El corte NO puede ser «hasta la última función que me interesa»: `granizoPlan`
   llama a `ladoNieve`, que llama a `noonFlip` y a `sign`, y ésas viven 200
   líneas MÁS ABAJO en la ficha. Cortar antes daba un `LOC` que evaluaba bien y
   reventaba al usarlo —`LOC.sign is not a function`—, o sea un verde de
   extracción con un rojo escondido dentro. Así que el final es el MÁXIMO de
   todos los marcadores que hacen falta, y después se exige que estén TODAS. */
const html = fs.readFileSync(FICHA, 'utf8');
const NECESARIAS = ['GRZ', 'ladoEspaldaAlViento', 'granizoPlan', 'granizoMatriz',
                    'grzSituaciones', 'grzEscenarios', 'tNecesario', 'recorridoPeor',
                    'ladoMasCercano', 'ladoNieve', 'nieveEstado', 'noonFlip', 'sign'];
const i = html.indexOf('var LOC={');
let k = -1;
for (const n of NECESARIAS) {
  const a0 = html.indexOf('LOC.' + n + '=');
  if (a0 < 0) continue;
  const fin = html.indexOf('\n};', a0);
  const corte = fin < 0 ? html.indexOf('\n', a0) + 1 : fin + 3;
  if (corte > k) k = corte;
}
check('el bloque LOC se encuentra en la ficha', i >= 0, 'indexOf var LOC={ = ' + i);
check('y el corte llega más allá de todas las funciones que hacen falta', k > i, 'k=' + k);
const src = (i >= 0 && k > i) ? html.slice(i, k) : '';
check('el trozo extraído no está vacío ni es minúsculo', src.length > 8000, src.length + ' caracteres');
const LOC = (new Function(src + '; return LOC;'))();
const faltan = NECESARIAS.filter(n => LOC[n] === undefined);
check('están TODAS las piezas que la cadena de llamadas necesita',
  faltan.length === 0, 'faltan: ' + faltan.join(', '));
check('y son del tipo que toca',
  typeof LOC.granizoPlan === 'function' && typeof LOC.granizoMatriz === 'function'
  && typeof LOC.ladoEspaldaAlViento === 'function' && typeof LOC.GRZ === 'object');

const LAT = { ventana_s: 1, muestreo_s: 1, sondeo_s: 15, arranque_s: 5 };
const BASE = { defensa: 55, preMin: 30, slew: 0.17, lat: LAT };
const plan = (e) => LOC.granizoPlan({ ...BASE, ...e });

console.log('── los umbrales propuestos, a pelo ──');
// A PELO Y NO DERIVADOS de la constante: si el caso se construye desde el
// umbral que vigila, el caso se mueve con él y la comprobación no vigila su
// valor. Es el fallo que los mutantes me cazaron dos veces este mismo día.
check('60 min de granizo', LOC.GRZ.hail_min === 60);
check('30 min de viento', LOC.GRZ.viento_min === 30);
check('40 km/h de pre-stow', LOC.GRZ.v_prestow === 40);
check('60 km/h de stow', LOC.GRZ.v_stow === 60);
check('60 min para salir', LOC.GRZ.salida_min === 60);

console.log('── el lado favorable: la espalda al viento ──');
check('viento del OESTE (270°) -> se tumba al ESTE', LOC.ladoEspaldaAlViento(270) === 1);
check('viento del ESTE (90°) -> se tumba al OESTE', LOC.ladoEspaldaAlViento(90) === -1);
check('viento del NORTE puro: sin componente E/O, no decide', LOC.ladoEspaldaAlViento(0) === null);
check('viento del SUR puro: tampoco', LOC.ladoEspaldaAlViento(180) === null);
check('359° sigue siendo del oeste', LOC.ladoEspaldaAlViento(359) === 1);
check('y 1° del este', LOC.ladoEspaldaAlViento(1) === -1);

console.log('── la precedencia: el viento que YA sopla manda ──');
// Con granizo encima Y viento soplando, decide el viento. Si el orden se
// invirtiera, la máquina mandaría cruzar por 0° con la racha puesta.
let p = plan({ theta: -55, tHail: 5, vAhora: 45, tV40: 0, azViento: 270 });
check('viento >40 manda aunque el granizo esté a 5 min', p.caso === 4, 'caso ' + p.caso);
check('…y NO autoriza cruzar', p.cruceAutorizado === false);
p = plan({ theta: -55, tHail: 5, vAhora: 65, tV40: 0, azViento: 270 });
check('a 65 km/h pasa a mandar la estrategia de viento', p.manda === 'viento');
check('y va al extremo más cercano, el suyo', p.destino === -55, String(p.destino));

console.log('── caso 4: la banda de pre-stow limita el RANGO, no fija posición ──');
p = plan({ theta: 40, tHail: null, vAhora: 45, tV40: 0 });
check('si ya está dentro de la banda, no se mueve', p.destino === 40, String(p.destino));
p = plan({ theta: 5, tHail: null, vAhora: 45, tV40: 0 });
check('si está por debajo, sube al borde de SU lado', p.destino === 30, String(p.destino));
p = plan({ theta: -5, tHail: null, vAhora: 45, tV40: 0 });
check('y del otro lado, al borde de ese', p.destino === -30, String(p.destino));
check('en ningún caso cruza por 0°', p.cruzaCero === false);

console.log('── casos 1 y 2: la frontera de los 30 min, por los dos lados ──');
const conViento = (tV) => plan({ theta: -55, tHail: 90, vAhora: 15, tV40: tV, azViento: 270 });
check('con 31 min de margen de viento: caso 1, cruza al lado bueno',
  conViento(31).caso === 1 && conViento(31).destino === 55 && conViento(31).cruzaCero === true);
check('con 29: caso 2, se queda en su lado y NO cruza',
  conViento(29).caso === 2 && conViento(29).destino === -55 && conViento(29).cruzaCero === false);
check('sin viento previsto (null): caso 1', conViento(null).caso === 1);

console.log('── caso 3: granizo cerca, se prioriza acabar ──');
p = plan({ theta: -55, tHail: 59, vAhora: 5, tV40: null, azViento: 270 });
check('a 59 min manda el granizo: caso 3', p.caso === 3, 'caso ' + p.caso);
check('y va al más cercano aunque el lado bueno fuera el otro', p.destino === -55);
check('a 61 min vuelve a haber margen para elegir',
  plan({ theta: -55, tHail: 61, vAhora: 5, tV40: null, azViento: 270 }).caso === 1);

console.log('── LO QUE LA FICHA AÑADE: si cabe, y qué se cede ──');
// EL CASO QUE MOTIVÓ ESTO: abanderado a un lado y el viento llegando del otro.
p = plan({ theta: -55, tHail: 90, vAhora: 15, tV40: 45, azViento: 270 });
check('cruzar 110° tarda 11,1 min', Math.abs(p.T.total_min - 11.1) < 0.1, p.T.total_min);
check('y con 45 min de margen, cabe', p.cabe === true);
p = plan({ theta: -55, tHail: 90, vAhora: 15, tV40: 29, azViento: 270 });
check('con 29 min la regla lo manda al lado malo…', p.caso === 2 && p.destino === -55);
check('…cediendo 110° y 10,8 min', p.cede && p.cede.grados === 110
  && Math.abs(p.cede.min_extra - 10.8) < 0.1, p.cede && p.cede.min_extra);
// LA DISTINCIÓN QUE NO PUEDE HACER UN CRITERIO ESCRITO, y que es el hallazgo:
// los 30 min no son el límite físico (11,1), son colchón para el error de la
// previsión. Con 29 de margen el cruce HABRÍA cabido y la regla lo prohíbe igual.
check('y habría CABIDO: los 30 min no son el límite físico, son colchón',
  !!p.cede && p.cede.cabria === true, 'cede=' + JSON.stringify(p.cede));
p = plan({ theta: -55, tHail: 90, vAhora: 15, tV40: 8, azViento: 270 });
check('con 8 min de margen, el cruce NO habría cabido: regla y aritmética coinciden',
  !!p.cede && p.cede.cabria === false, 'cede=' + JSON.stringify(p.cede));
check('cuando ya está en el lado bueno, no se cede nada',
  plan({ theta: 55, tHail: 90, vAhora: 15, tV40: 45, azViento: 270 }).cede === null);

console.log('── caso 3 y caso 4 no se pelean, y el guard de que siga así ──');
// La defensa de granizo (55°) está DENTRO de la banda de pre-stow (30–55°), así
// que el 55° del lado propio satisface los dos. Si la defensa saliera de la
// banda dejarían de ser compatibles, y esto lo caza.
check('la defensa de granizo cae dentro de la banda de pre-stow',
  BASE.defensa <= 55 && BASE.defensa >= BASE.preMin,
  `defensa ${BASE.defensa} banda ${BASE.preMin}–55`);
const c3 = plan({ theta: -55, tHail: 30, vAhora: 5, tV40: null, azViento: 270 });
const c4 = plan({ theta: -55, tHail: 30, vAhora: 45, tV40: 0, azViento: 270 });
check('y con el eje ya en el extremo, los dos casos ordenan lo MISMO',
  c3.destino === c4.destino, `c3 ${c3.destino} c4 ${c4.destino}`);

console.log('── caso 5: la salida no es inmediata ──');
p = plan({ theta: -55, tHail: null, vAhora: 5, minDesdeAviso: 20 });
check('20 min desde el último aviso: sigue abanderado', p.caso === 5 && p.destino === -55);
check('y dice cuántos faltan', /faltan 40 min/.test(p.motivo), p.motivo);
p = plan({ theta: -55, tHail: null, vAhora: 5, minDesdeAviso: 61 });
check('pasados los 60, puede desabanderar si el viento lo permite',
  p.destino === null && /si el viento lo permite/i.test(p.motivo), p.motivo);
check('sin amenaza y sin aviso previo, nada que decidir',
  /nada que decidir/.test(plan({ theta: 0, tHail: null, vAhora: 5 }).motivo));

console.log('── la nieve, cuando también opina ──');
// Las tres máquinas pueden pedir lados distintos y el documento no fija
// prioridad. La ficha lo DICE y no se la inventa: `deAcuerdo` es el dato.
p = plan({ theta: -55, tHail: 90, vAhora: 15, tV40: 45, azViento: 270, nieveCm: 15, azSolar: 90 });
check('con 15 cm el estado es NIEVE', p.nieve && p.nieve.estado === 'NIEVE');
check('y pide un lado concreto', typeof p.nieve.destino === 'number', p.nieve && p.nieve.destino);
check('con 1 cm no hay nieve que opine',
  plan({ theta: -55, tHail: 90, vAhora: 15, nieveCm: 1, azSolar: 90 }).nieve.estado === 'SEGUIMIENTO');
check('sin dato de nieve, el plan no se inventa un estado',
  plan({ theta: -55, tHail: 90, vAhora: 15 }).nieve === null);
// El desacuerdo tiene que poder DARSE: si `deAcuerdo` fuera siempre true, el
// aviso no informaría de nada. Se busca un caso de cada.
const sol = [0, 45, 90, 135, 180, 225, 270, 315];
const acuerdos = new Set(sol.map(a => {
  const q = plan({ theta: -55, tHail: 90, vAhora: 15, tV40: 45, azViento: 270, nieveCm: 15, azSolar: a });
  return q.nieve.deAcuerdo;
}));
check('hay escenarios de acuerdo Y de desacuerdo: el aviso puede ponerse rojo',
  acuerdos.has(true) && acuerdos.has(false), [...acuerdos].join(','));

console.log('── la matriz ──');
const M = LOC.granizoMatriz({ ...BASE, tHail: 90, vAhora: 15 },
  LOC.grzSituaciones(55), LOC.grzEscenarios());
check('4 situaciones × 6 escenarios', M.length === 4 && M[0].celdas.length === 6,
  `${M.length}×${M[0] && M[0].celdas.length}`);
check('cada celda trae su plan', M.every(f => f.celdas.every(c => c.plan && c.plan.caso >= 1)));
// LA PRIMERA VERSIÓN DE ESTA ERA VACÍA: comparaba `plan !== plan`, identidad de
// objetos, que difiere siempre. Pasaba igual si la matriz ignoraba el theta de la
// fila. Ahora se mira la columna 3 —viento del oeste en 15 min, caso 2, que manda
// al lado MÁS CERCANO— donde el theta de la fila sí decide el destino.
check('la matriz usa el theta de SU fila y no el de la base',
  M[0].celdas[3].plan.destino === 55 && M[3].celdas[3].plan.destino === -55,
  `fila+55 -> ${M[0].celdas[3].plan.destino} · fila−55 -> ${M[3].celdas[3].plan.destino}`);
// El escenario de una fila tiene que llegar al plan: si la matriz ignorara los
// escenarios, todas las columnas saldrían iguales.
const casosFila0 = new Set(M[0].celdas.map(c => c.plan.caso));
check('las columnas NO salen todas iguales: el escenario entra en el plan',
  casosFila0.size > 1, [...casosFila0].join(','));
// Y con el granizo encima, el espacio cambia: caso 3 aparece.
const Mcerca = LOC.granizoMatriz({ ...BASE, tHail: 20, vAhora: 5 },
  LOC.grzSituaciones(55), LOC.grzEscenarios());
check('con el granizo a 20 min aparece el caso 3',
  Mcerca.some(f => f.celdas.some(c => c.plan.caso === 3)));
// Y alguna celda tiene que poder NO caber, o la columna «cabe» no vigila nada.
const Mapurado = LOC.granizoMatriz({ ...BASE, tHail: 3, vAhora: 5 },
  LOC.grzSituaciones(55), LOC.grzEscenarios());
check('con el granizo a 3 min hay celdas que NO caben',
  Mapurado.some(f => f.celdas.some(c => c.plan.cabe === false)));

console.log('── la posición nocturna, declarada y no corregida ──');
// Queda fijado a propósito: la ficha espeja el −5,0 del core, que es la posición
// ESPEJO de la real (5° al ESTE) y está pendiente de la Fase 2.I allí. Si alguien
// lo cambia aquí sin cambiarlo allí, esto se pone rojo y le recuerda por qué.
check('LOC.NIGHT sigue valiendo −5 (espejo del core, no el dato de planta)',
  LOC.NIGHT === -5, String(LOC.NIGHT));
check('y la ficha lo DICE en su propio fuente',
  /lado contrario al de la planta/i.test(html) && /Fase 2\.I/.test(html));
check('nombrando el dato real, 5° al ESTE', /5° al ESTE/.test(html));

console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
process.exit(ko ? 1 : 0);
