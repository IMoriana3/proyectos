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
const NECESARIAS = ['GRZ', 'VDE', 'ladoEspaldaAlViento', 'granizoPlan', 'granizoMatriz',
                    'granizoLiveAmenaza', 'granizoLivePlan',
                    'grzSituaciones', 'grzEscenarios', 'tNecesario', 'recorridoPeor',
                    'ladoMasCercano', 'ladoNieve', 'nieveEstado', 'noonFlip', 'sign',
                    'sirveGranizo', 'CONTRATO'];
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
// LA RACHA VA DECLARADA Y COHERENTE CON SU PROPIO SOSTENIDO, con `rachaMediana`, no
// una calma de conveniencia: estos casos existen para probar la frontera de los 30
// min del SOSTENIDO, y si se les pusiera una racha baja a dedo probarían la frontera
// con un viento que el modelo de la ficha no daría. A 15 km/h sostenidos la racha
// mediana son 30, por debajo del umbral de 40, así que el cruce sigue autorizado y la
// intención del caso se conserva. (Antes no declaraban racha y pasaban porque el
// cruce no la miraba; ahora la mira, y por eso hay que decirla.)
const conViento = (tV) => plan({ theta: -55, tHail: 90, vAhora: 15,
                                 rachaAhora: LOC.rachaMediana(15), tV40: tV, azViento: 270 });
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
  plan({ theta: -55, tHail: 61, vAhora: 5, rachaAhora: LOC.rachaMediana(5), tV40: null, azViento: 270 }).caso === 1);

console.log('── LO QUE LA FICHA AÑADE: si cabe, y qué se cede ──');
// EL CASO QUE MOTIVÓ ESTO: abanderado a un lado y el viento llegando del otro.
p = plan({ theta: -55, tHail: 90, vAhora: 15, rachaAhora: LOC.rachaMediana(15), tV40: 45, azViento: 270 });
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

console.log('── los valores de VDE: lo aplicado y lo declarado ──');
// A PELO, no derivados de LOC.VDE: si el caso se construye desde la constante
// que vigila, se mueve con ella. Tercera vez que lo escribo en un banco hoy.
check('el tamaño son 1,9 cm, que es como se escriben 19 mm en ESE campo',
  LOC.VDE.umbral_tamano_granizo_cm === 1.9, String(LOC.VDE.umbral_tamano_granizo_cm));
check('NO son 19: el campo está en cm y 19 cm no dispararían nunca',
  LOC.VDE.umbral_tamano_granizo_cm < 5);
check('la probabilidad de ESE tamaño son 30 %', LOC.VDE.umbral_probabilidad_pct === 30);
check('el tamaño se APLICA', LOC.VDE._aplicados.indexOf('umbral_tamano_granizo_cm') >= 0);
check('la probabilidad se DECLARA, no se aplica',
  LOC.VDE._declarados.indexOf('umbral_probabilidad_pct') >= 0
  && LOC.VDE._aplicados.indexOf('umbral_probabilidad_pct') < 0);

const JULIO = { umbral_tamano_granizo_cm: 1.0, umbral_prob_tstorm_pct: 40, otro: 7 };
const V = LOC.paramsVDE(JULIO);
check('VDE pisa el tamaño de julio', V.umbral_tamano_granizo_cm === 1.9);
check('y añade la probabilidad que julio no tenía', V.umbral_probabilidad_pct === 30);
check('la probabilidad de TORMENTA se queda en el 40 de julio: VDE no habla de eso',
  V.umbral_prob_tstorm_pct === 40);
check('y no toca nada más', V.otro === 7);
check('paramsVDE no muta el objeto de julio',
  JULIO.umbral_tamano_granizo_cm === 1.0 && JULIO.umbral_probabilidad_pct === undefined);

const alMotor = LOC.sinDeclarados(V);
check('al motor NO le viaja lo declarado-no-aplicado',
  alMotor.umbral_probabilidad_pct === undefined, JSON.stringify(alMotor));
check('pero sí todo lo demás, el tamaño incluido',
  alMotor.umbral_tamano_granizo_cm === 1.9 && alMotor.umbral_prob_tstorm_pct === 40
  && alMotor.otro === 7);
check('y la ficha DICE que el 30 % no es el de tormenta',
  /no es el de tormenta/i.test(html) && /GUARDADO, NO APLICADO/.test(html));

console.log('── el intervalo del producto de granizo ──');
check('el catálogo son los ocho de Meteomatics, con 10min el primero',
  LOC.GRANIZO_INTERVALOS.length === 8 && LOC.GRANIZO_INTERVALOS[0] === '10min'
  && LOC.GRANIZO_INTERVALOS.indexOf('1h') === 3, LOC.GRANIZO_INTERVALOS.join(','));
check('el campo se arma como lo nombra la API', LOC.campoGranizo('10min') === 'hail_10min_cm');
check('y el horario igual', LOC.campoGranizo('1h') === 'hail_1h_cm');
check('los minutos de 10min son 10', LOC.minutosIntervalo('10min') === 10);
check('y los de 1h son 60', LOC.minutosIntervalo('1h') === 60);
check('un intervalo inventado no da minutos', LOC.minutosIntervalo('7x') === null);

// SE OFRECE LO QUE LA SERIE TRAE, no el catálogo. Una serie con solo 1h no puede
// dar 10min, y fingirlo sería leer undefined y llamarlo «sin granizo».
const soloHora = [{ hail_1h_cm: 1.6 }, {}, { hail_1h_cm: null }];
let r = LOC.intervaloDeLaSerie(soloHora);
check('serie con solo 1h: solo 1h disponible', JSON.stringify(r.disponibles) === '["1h"]');
check('…y es el que usa', r.intervalo === '1h' && r.campo === 'hail_1h_cm');
const mixta = [{ hail_1h_cm: 1.6 }, { hail_10min_cm: 1.9 }];
r = LOC.intervaloDeLaSerie(mixta);
check('con 10min y 1h disponibles, gana el MÁS FINO sin pedirlo',
  r.intervalo === '10min', r.intervalo);
check('y los lista de fino a grueso', JSON.stringify(r.disponibles) === '["10min","1h"]');
r = LOC.intervaloDeLaSerie(mixta, '1h');
check('el preferido manda si está', r.intervalo === '1h');
check('…y entonces no se avisa de nada', r.preferido_no_disponible === false);
r = LOC.intervaloDeLaSerie(soloHora, '10min');
check('pedir uno que no está NO lo inventa: cae al que hay',
  r.intervalo === '1h' && r.campo === 'hail_1h_cm');
check('…y lo DICE', r.preferido_no_disponible === true);
// LA CONSECUENCIA, no solo la bandera. Si el preferido ganara aunque no esté, el
// campo resuelto sería `hail_10min_cm`, la máquina leería undefined y diría «sin
// producto de granizo»: perdería la señal ENTERA en silencio. Lo que hay que
// exigir es que el campo devuelto encuentre el dato de verdad en la serie.
check('y el campo devuelto SÍ encuentra el dato en esa serie',
  soloHora.some(m => m[r.campo] !== undefined && m[r.campo] !== null), r.campo);
r = LOC.intervaloDeLaSerie([{ cape_j_kg: 900 }, {}]);
check('serie sin producto de granizo: intervalo null, que no es cero',
  r.intervalo === null && r.campo === null && r.disponibles.length === 0);
check('una serie vacía tampoco se inventa nada',
  LOC.intervaloDeLaSerie([]).intervalo === null);

// EL AVISO, en sus dos lados: un intervalo más largo que el margen que alimenta
// no puede situar la frontera que ese margen define.
check('1h es más grueso que el margen de 30 min: avisa',
  LOC.intervaloGrueso('1h', 30) === true);
check('10min no lo es: no avisa', LOC.intervaloGrueso('10min', 30) === false);
check('30min contra 30 min justo NO avisa: igual no es más grueso',
  LOC.intervaloGrueso('30min', 30) === false);
check('sin margen no hay aviso que dar', LOC.intervaloGrueso('1h', 0) === false);

console.log('── el veto de RACHA sobre la banda de pre-stow ──');
// RESTRICCIÓN DE PLANTA (Iñaki, 3-oct-2026): «no podemos permitir que a 40 km/h o
// más pase entre 0 y 25 grados» — simétrica, y el umbral es de RACHA. Al mirarlo
// resultó que la frontera ya existía: el `pmin` del pre-stow, 30°, que es MÁS
// estricto que los 25 que había dicho. Decidido: se queda el 30 y no se añade
// ninguna constante nueva de ángulo.
//
// LO QUE SÍ FALTABA: `granizoPlan` manejaba UN SOLO viento y comparaba con él tanto
// el 40 como el 60. Si el 40 es de racha, el caso 1 autorizaba cruces que la planta
// prohíbe — con 30 km/h sostenidos la racha mediana ya pasa de 50.
const cruza = (extra) => plan({ theta: -55, tHail: 90, tV40: null, azViento: 270,
                                vAhora: 15, ...extra });
check('cruzar de −55° a +55° son 60° dentro de la banda de ±30°',
  Math.abs(LOC.tEnBanda(-55, 55, 0.17, 30).grados - 60) < 1e-9,
  LOC.tEnBanda(-55, 55, 0.17, 30).grados + '°');
check('…que a 0,17 °/s son 5,9 min de exposición, no un instante',
  Math.abs(LOC.tEnBanda(-55, 55, 0.17, 30).min - 5.88) < 0.02,
  LOC.tEnBanda(-55, 55, 0.17, 30).min.toFixed(2) + ' min');
check('un recorrido que no toca la banda da CERO, no un mínimo inventado',
  LOC.tEnBanda(35, 55, 0.17, 30).grados === 0);
check('y uno enteramente dentro cuenta todo su recorrido',
  Math.abs(LOC.tEnBanda(-10, 10, 0.17, 30).grados - 20) < 1e-9);

check('con racha mediana de 15 km/h (30) el cruce se autoriza',
  cruza({ rachaAhora: LOC.rachaMediana(15) }).caso === 1);
check('con la racha YA en el umbral, se veta y se va al más cercano',
  cruza({ rachaAhora: LOC.GRZ.racha_cruce }).caso === 2
  && cruza({ rachaAhora: LOC.GRZ.racha_cruce }).destino === -55);
// LA COMPROBACIÓN QUE DE VERDAD PRUEBA EL CRITERIO NUEVO: no es «hay racha», es que
// la racha llegue ANTES de que acabe el tramo dentro de la banda. Dos valores de
// `tRacha` a un lado y al otro de los 5,9 min, con todo lo demás igual.
check('racha que llega en 3 min < los 5,9 de banda: VETADO',
  cruza({ rachaAhora: 20, tRacha: 3 }).caso === 2);
check('…y la misma racha llegando en 20 min: AUTORIZADO',
  cruza({ rachaAhora: 20, tRacha: 20 }).caso === 1);
// Y QUE EL BORDE DE BANDA SEA EL `pmin` DEL PRE-STOW Y NO LA DEFENSA, que es el
// error fácil de cometer y el que ninguna otra comprobación veía: con 30° el tramo
// en banda son 5,9 min y con 55° serían 10,8, así que una racha que llega a los
// 8 min distingue los dos — autoriza con el borde bueno y vetaría con el malo.
check('el borde de la banda es el pmin (30°), no el ángulo de defensa',
  cruza({ rachaAhora: 20, tRacha: 8 }).caso === 1,
  'con 30° el tramo son 5,9 min (8 > 5,9 -> cabe); con 55° serían 10,8 y vetaría');
check('sin dato de racha se veta (§8-H: un dato ausente no concede permiso)',
  cruza({}).caso === 2 && /sin dato de racha/.test(cruza({}).motivo));
// Y LA OTRA MITAD DE LA ASIMETRÍA, que es la que se puede leer mal: no saber QUÉ
// VENDRÁ no inventa amenaza, igual que `tV40 = null` nunca la inventó.
check('pero `tRacha` null NO veta: ausencia de previsión no es amenaza',
  cruza({ rachaAhora: 20, tRacha: null }).caso === 1);
// Si el lado favorable es el que ya ocupa, no hay banda que cruzar y la racha no
// pinta nada: vetar ahí habría sido prohibir por si acaso.
check('con el lado favorable ya ocupado, la racha alta no veta nada',
  plan({ theta: 55, tHail: 90, tV40: null, azViento: 270, vAhora: 15,
         rachaAhora: 70 }).caso === 1);
// CUÁNDO LLEGA LA RACHA, que es lo que permite al explorador razonar sin un campo
// nuevo: invierte `rachaMediana` (racha 40 <- sostenido 22,0) y supone una rampa
// LINEAL del sostenido hasta `v_prestow`. La rampa es inventada y va declarada.
check('la racha de 40 sale de 22,0 km/h sostenidos, y ese es el punto de la rampa',
  Math.abs(LOC.rachaMediana(22.0) - 40) < 0.5, LOC.rachaMediana(22.0).toFixed(2));
check('con 15 km/h y el viento llegando a 40 en 30 min, la racha llega en 8,4',
  Math.abs(LOC.tRachaUmbral(15, 30, 40) - 8.4) < 0.2, LOC.tRachaUmbral(15, 30, 40).toFixed(1));
// Y AQUÍ ESTÁ LA GRACIA DEL NÚMERO: 8,4 min contra los 5,9 que cuesta la banda. Cabe
// por 2,5 minutos, o sea que el criterio decide de verdad en ese margen y no por
// goleada — si la rampa fuera algo más rápida, vetaría.
check('…y 8,4 min deja pasar los 5,9 de banda, por poco',
  LOC.tRachaUmbral(15, 30, 40) > LOC.tEnBanda(-55, 55, 0.17, 30).min);
check('si la racha ya está en el umbral, el tiempo es 0 y no un null permisivo',
  LOC.tRachaUmbral(30, null, 40) === 0);
check('sin previsión de viento y con calma, no se inventa llegada (null)',
  LOC.tRachaUmbral(5, null, 40) === null);
check('el umbral de racha está declarado y comparte el 40 con v_prestow a propósito',
  LOC.GRZ.racha_cruce === 40 && LOC.GRZ.v_prestow === 40);
// La conversión sostenido→racha sale del MISMO modelo que genera la serie del año,
// y su factor es el dato incómodo que no se esconde.
check('la racha mediana de 22 km/h sostenidos roza el umbral de 40',
  Math.abs(LOC.rachaMediana(22) - 40) < 0.5, LOC.rachaMediana(22).toFixed(1));
check('y su factor a viento flojo es alto, que es lo que hay que vigilar',
  LOC.rachaMediana(25) / 25 > 1.7, (LOC.rachaMediana(25) / 25).toFixed(2));

console.log('── los del contrato de vigilancia (decisión de Factiun) ──');
// El §19 deja 14 de 17 en «SIN VALOR» por política. Este bloque NO cambia esa
// tabla: es la capa de quien decide operar. Y lo que se comprueba aquí no son los
// números por sí mismos —un número no se puede «probar»— sino la ESTRUCTURA que
// impide que mañana se lean como criterio del informe: que cada decidido tenga
// regla escrita, que cada nulo tenga motivo escrito, y que NINGUNO esté aplicado.
const C = LOC.CONTRATO;
check('los cinco decididos son los acordados',
  C.frecuencia_consulta_s === 300 && C.timeout_api_s === 30
  && C.edad_max_dato_s === 5400 && C.buffer_espacial_km === 48
  && C.horizonte_vigilancia_h === 6,
  [C.frecuencia_consulta_s, C.timeout_api_s, C.edad_max_dato_s,
   C.buffer_espacial_km, C.horizonte_vigilancia_h].join(' · '));
check('y los cuatro nulos son nulos de verdad, no cero ni cadena vacía',
  C._nulos.every((k) => C[k] === null), JSON.stringify(C._nulos.map((k) => C[k])));
check('NINGUNO está aplicado, que es lo que hace honesto al bloque',
  Array.isArray(C._aplicados) && C._aplicados.length === 0,
  JSON.stringify(C._aplicados));
// Las dos listas tienen que cubrir exactamente las claves de valor, o un parámetro
// podría colarse sin regla ni motivo — el modo silencioso de este bloque.
const clavesValor = Object.keys(C).filter((k) => k.charAt(0) !== '_');
check('las listas cubren TODAS las claves de valor, sin colarse ninguna',
  clavesValor.length === C._decididos.length + C._nulos.length
  && clavesValor.every((k) => C._decididos.indexOf(k) >= 0 || C._nulos.indexOf(k) >= 0),
  clavesValor.length + ' claves vs ' + (C._decididos.length + C._nulos.length));
check('cada decidido lleva su REGLA escrita, no sólo el número',
  C._decididos.every((k) => typeof C._reglas[k] === 'string' && C._reglas[k].length > 80),
  C._decididos.filter((k) => !C._reglas[k] || C._reglas[k].length <= 80).join(','));
check('cada nulo lleva su MOTIVO escrito',
  C._nulos.every((k) => typeof C._porque[k] === 'string' && C._porque[k].length > 60),
  C._nulos.filter((k) => !C._porque[k] || C._porque[k].length <= 60).join(','));
// El suelo de ttl_orden_s no es un gusto: sale de la cinemática, y si alguien
// cambia el recorrido o la velocidad sin recalcularlo, esto se pone rojo.
check('el suelo de ttl_orden_s es el recorrido completo, calculado y no puesto a mano',
  Math.abs(C._suelo_ttl_orden_s - 110 / 0.17) < 1,
  C._suelo_ttl_orden_s + ' vs ' + (110 / 0.17).toFixed(1));
check('y el buffer de VDE es coherente con el margen de granizo de la estrategia',
  Math.abs(C.buffer_espacial_km / (LOC.GRZ.hail_min / 60) - 48) < 0.5,
  'velocidad de célula implícita: ' +
  (C.buffer_espacial_km / (LOC.GRZ.hail_min / 60)).toFixed(1) + ' km/h');

console.log('── servir el granizo a la máquina (la casilla es UNA) ──');
// POR QUÉ ESTO EXISTE. La máquina es espejo del core y el core sólo conoce
// `hail_1h_cm`. Darle intervalos a la máquina la haría saber más que su original
// y el careo de `test_granizo_traza.mjs` —cuyos casos sólo traen el campo
// horario— se quedaría ciego a la diferencia. Así que el intervalo se resuelve
// aquí, FUERA, y lo que entra en la máquina ya viene servido.
// Esto NO es hipotético: la primera versión metió `LOC.intervaloDeLaSerie()`
// dentro de `simula`, y el careo murió con un ReferenceError.
let sv = LOC.sirveGranizo(soloHora, null);
check('serie ya horaria: no renombra nada', sv.renombrada === false && sv.intervalo === '1h');
check('…y devuelve las MISMAS muestras, sin copiarlas por gusto',
  sv.muestras[0] === soloHora[0], 'identidad de objeto');

const soloDiez = [{ hail_10min_cm: 1.6, cape_j_kg: 900 }, { hail_10min_cm: 0.4 }];
sv = LOC.sirveGranizo(soloDiez, null);
check('serie de 10min: la casilla del core queda alimentada',
  sv.muestras[0].hail_1h_cm === 1.6 && sv.muestras[1].hail_1h_cm === 0.4);
check('…y lo dice (renombrada), que es lo que la ficha escribe junto a la traza',
  sv.renombrada === true && sv.intervalo === '10min' && sv.campo === 'hail_10min_cm');
check('…sin dejar el campo de origen puesto: el `Muestra` del core es un dataclass',
  sv.muestras[0].hail_10min_cm === undefined);
check('…y sin perder el resto de la muestra', sv.muestras[0].cape_j_kg === 900);
// LA COMPROBACIÓN DE CONSECUENCIA: que el nombre esté bien no basta, lo que
// importa es que la máquina ENCUENTRE el dato donde lo busca. Se mide con la
// misma función que resuelve la serie, sobre la serie ya servida.
check('…y la máquina, que sólo mira hail_1h_cm, lo encuentra',
  LOC.intervaloDeLaSerie(sv.muestras).intervalo === '1h');
check('…sin tocar la serie original, que la ficha reusa para pintar el selector',
  soloDiez[0].hail_1h_cm === undefined && soloDiez[0].hail_10min_cm === 1.6);

// SERIE MIXTA: aquí se ve que el selector manda de verdad. El mismo dato, dos
// intervalos, dos valores distintos en la casilla única.
const mix2 = [{ hail_1h_cm: 2.4, hail_10min_cm: 1.1 }];
check('mixta pidiendo 10min: la casilla lleva el de 10min, NO el horario',
  LOC.sirveGranizo(mix2, '10min').muestras[0].hail_1h_cm === 1.1);
check('mixta pidiendo 1h: la casilla lleva el horario y no se renombra nada',
  LOC.sirveGranizo(mix2, '1h').muestras[0].hail_1h_cm === 2.4
  && LOC.sirveGranizo(mix2, '1h').renombrada === false);
// Y el sentido del cambio, que es el que hay que tener en la cabeza: el máximo de
// la hora es el mayor de sus tramos, luego afinar el intervalo baja el valor que
// se compara contra el umbral y hace el disparo MÁS difícil, no más fácil.
check('afinar el intervalo NO afloja el umbral: el valor servido es menor',
  LOC.sirveGranizo(mix2, '10min').muestras[0].hail_1h_cm
  < LOC.sirveGranizo(mix2, '1h').muestras[0].hail_1h_cm);

// SERIE CON AGUJEROS en el campo fino: la casilla se queda vacía en esa muestra,
// y vacía incluso si esa muestra traía el valor horario. Rellenar el hueco con el
// máximo de la hora mezclaría dos resoluciones en la misma serie sin decirlo; un
// hueco el core sí sabe tratarlo (§8-H: ausente no es cero y no desescala).
sv = LOC.sirveGranizo([{ hail_10min_cm: 1.1, hail_1h_cm: 2.4 }, { hail_1h_cm: 2.4 }], '10min');
check('agujero en el campo fino: la casilla queda vacía, no se rellena con la hora',
  sv.muestras[0].hail_1h_cm === 1.1 && sv.muestras[1].hail_1h_cm === undefined,
  JSON.stringify(sv.muestras));

sv = LOC.sirveGranizo([{ cape_j_kg: 900 }, null], null);
check('sin producto de granizo no inventa casilla ni revienta con un hueco',
  sv.renombrada === false && sv.intervalo === null
  && sv.muestras[0].hail_1h_cm === undefined && sv.muestras[1] === null);
check('y el margen del que se avisa es el de la estrategia, 30 min',
  LOC.GRZ.viento_min === 30);
// Y QUE LA FICHA LO DIGA, no solo lo calcule.
check('la ficha dice que un máximo horario no sitúa el granizo dentro de la hora',
  /NO DICE CU\u00c1NDO|no dice cu\u00e1ndo/i.test(html) || /dentro de 5 minutos o dentro de 55/.test(html));
check('y que de un máximo horario no se saca el de diez minutos',
  /inventar\s+resoluci\u00f3n que el dato no tiene/.test(html));

console.log('── el granizo sintético entra en el MISMO control en vivo ──');
let ga = LOC.granizoLiveAmenaza(true, 16, 80);
check('16 mm NO activa el gate VDE aunque la probabilidad sea alta',
  ga.activa === false && ga.umbral_mm === 19, JSON.stringify(ga));
ga = LOC.granizoLiveAmenaza(true, 22, 20);
check('22 mm con sólo 20 % tampoco activa: faltan los dos criterios',
  ga.activa === false && ga.umbral_prob_pct === 30, JSON.stringify(ga));
ga = LOC.granizoLiveAmenaza(true, 22, 70);
check('22 mm y 70 % sí activan la amenaza sintética',
  ga.activa === true, JSON.stringify(ga));
check('apagado significa apagado aunque el episodio sea severo',
  LOC.granizoLiveAmenaza(false, 40, 100).activa === false);

let gl = LOC.granizoLivePlan({ hailOn:true, hailMm:22, hailProb:70,
  theta:-55, tHail:20, vAhora:5, tV40:null, azViento:270,
  rachaAhora:LOC.rachaMediana(5), tRacha:null, defensa:55, preMin:30,
  slew:0.17, lat:LAT });
check('granizo a 20 min entra por el caso 3 y NO cruza: va al extremo cercano',
  gl.amenaza.activa && gl.caso === 3 && gl.destino === -55 && !gl.cruzaCero,
  JSON.stringify(gl));

gl = LOC.granizoLivePlan({ hailOn:true, hailMm:22, hailProb:70,
  theta:-55, tHail:90, vAhora:15, tV40:null, azViento:270,
  rachaAhora:LOC.rachaMediana(15), tRacha:null, defensa:55, preMin:30,
  slew:0.17, lat:LAT });
check('con 90 min y viento tranquilo puede elegir el lado favorable',
  gl.caso === 1 && gl.destino === 55 && gl.cruceAutorizado === true,
  JSON.stringify(gl));

gl = LOC.granizoLivePlan({ hailOn:true, hailMm:16, hailProb:80,
  theta:-20, tHail:20, vAhora:5, tV40:null, azViento:270,
  rachaAhora:LOC.rachaMediana(5), defensa:55, preMin:30, slew:0.17, lat:LAT });
check('un episodio sub-19 mm no se cuela al plan como amenaza',
  gl.amenaza.activa === false && gl.destino === null, JSON.stringify(gl));

gl = LOC.granizoLivePlan({ hailOn:false, hailMm:22, hailProb:70,
  theta:-40, tHail:20, minDesdeAviso:20, vAhora:5, tV40:null, azViento:270,
  rachaAhora:LOC.rachaMediana(5), defensa:55, preMin:30, slew:0.17, lat:LAT });
check('al quitar la amenaza, el hold de salida se conserva y no desabandera de golpe',
  gl.caso === 5 && gl.destino === -55 && /faltan 40 min/.test(gl.motivo),
  JSON.stringify(gl));

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
