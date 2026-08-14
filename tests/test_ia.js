// Pruebas de la Consola de IA (ia.html) en un navegador real.
//
// Lo que comprueba de verdad, y por qué:
//
//   1) Que el ESPEJO JS sigue siendo un espejo. `ia.html` reimplementa
//      solargpt_ml.fleet_health en el navegador (mismo patrón que backtracking.html
//      con el BT3D del core). Si una constante deriva, el diagnóstico deja de ser
//      el mismo según se mire desde la consola o desde el CLI, y eso no se ve en
//      un diff. Aquí se ejecuta el núcleo JS aislado, sin DOM, y se exige que
//      encuentre las CUATRO averías inyectadas del fixture y ninguna más.
//
//   2) Que no inventa averías. Los dos falsos positivos que costó cazar tienen
//      su regresión: la z robusta fabricando sigmas con vecinos idénticos, y el
//      CUSUM disparando "cambió y no ha vuelto" sobre ruido blanco.
//
//   3) Que la página pinta sin errores de consola y con el detalle abierto.
//
//   npm install playwright            # el navegador ya esta en /opt/pw-browsers
//   python3 -m http.server 8099       # servir el repo (en otra terminal)
//   node tests/test_ia.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
function check(nombre, valor, esperado) {
  const bien = String(valor) === String(esperado);
  if (bien) { ok++; console.log('OK   ' + nombre + ' = ' + valor); }
  else { ko++; console.log('FAIL ' + nombre + ' : obtenido ' + JSON.stringify(String(valor)) + ', esperado ' + JSON.stringify(String(esperado))); }
}

// El nucleo JS de la consola, sin la capa de UI: todo lo anterior al marcador
// de la seccion UI. Se ejecuta en node, asi que no necesita navegador ni DOM.
function nucleo() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'ia.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const core = script.split('/* ═══ UI ')[0];
  const exp = {};
  new Function('exports', core + `
    exports.rankFleet = rankFleet; exports.demoFleet = demoFleet; exports.FAULTS = FAULTS;
    exports.motorEnergyWh = motorEnergyWh; exports.robustZ = robustZ; exports.cusum = cusum;
    exports.checkSample = checkSample; exports.RELIABILITY = RELIABILITY; exports.MIN_EFFECT = MIN_EFFECT;
  `)(exp);
  return exp;
}

(async () => {
  const m = nucleo();

  // ---------- fisica: paridad con solargpt_ml/physics.py ----------
  // Integral en cerrado de dE/dθ = A + B|θ|, con A=0,0503 y B=0,000845.
  check('energia 0→10° (= python)', m.motorEnergyWh(0, 10).toFixed(6), (0.54525).toFixed(6));
  check('simetrica en los dos sentidos',
    Math.abs(m.motorEnergyWh(10, 20) - m.motorEnergyWh(20, 10)) < 1e-12, true);
  // Cruzar el cero SUMA los dos tramos: si se cancelaran, media planta consumiria
  // "cero" cada manana al pasar de este a oeste.
  check('cruzar el cero suma los tramos',
    Math.abs(m.motorEnergyWh(-10, 10) - 2 * m.motorEnergyWh(0, 10)) < 1e-12, true);

  // ---------- no fabricar sigmas con vecinos identicos ----------
  const iguales = Array(10).fill(1);
  check('z robusta sin escala declarada', m.robustZ(5, iguales, 0), 0);
  check('z robusta con relevancia: efecto minimo = 3 sigma',
    Math.abs(m.robustZ(1.9, iguales, 0.9 / 3) - 3) < 1e-9, true);

  // ---------- el CUSUM exige salto RELEVANTE, no solo sostenido ----------
  const escalon = [];
  for (let i = 0; i < 16; i++) escalon.push((i < 8 ? 0 : 0.03) + (i % 3 - 1) * 0.002);
  check('escalon minusculo: dispara sin relevancia', m.cusum(escalon, 0.5, 5, 0).alarm, true);
  check('escalon minusculo: NO dispara con relevancia', m.cusum(escalon, 0.5, 5, 0.12).alarm, false);

  // ---------- deteccion sobre el fixture ----------
  const r = m.rankFleet(m.demoFleet(28, 14));
  const averias = Object.keys(m.FAULTS).map(Number);
  const marcados = r.trackers.filter(t => t.level !== 'ok').map(t => t.tcu);
  check('encuentra las 4 averias inyectadas', averias.every(f => marcados.includes(f)), true);
  check('sin falsos positivos', marcados.filter(t => !averias.includes(t)).length, 0);

  const t7 = r.trackers.find(t => t.tcu === 7);
  const t23 = r.trackers.find(t => t.tcu === 23);
  check('el motor gripado sale por energia', t7.reasons.some(x => x.code === 'motor_energy'), true);
  check('y como salto sostenido', t7.reasons.some(x => x.code.endsWith('_deriva')), true);
  // Regresion del techo de la media ponderada: una causa unica y grave (bateria)
  // tiene que poder escalar sola. Con suma ponderada topaba en su peso (0,20).
  check('una causa unica y grave escala sola', t23.score > 0.25, true);
  check('y no supera la fiabilidad de su indicador', t23.score <= m.RELIABILITY.soh + 1e-9, true);

  // Regresion del falso positivo visto en la consola: cuatro seguidores sanos
  // decian "cambio y no ha vuelto" por ruido blanco.
  const derivaSanos = r.trackers
    .filter(t => !averias.includes(t.tcu))
    .filter(t => t.reasons.some(x => x.code.endsWith('_deriva')))
    .map(t => t.tcu);
  check('no inventa deriva sobre seguidores sanos', derivaSanos.length, 0);

  // ---------- modo comun: lo que le pasa a TODOS no es una averia ----------
  // Una manana fria espesa la grasa y sube el consumo de la planta entera. Un
  // umbral fijo lo marcaria como 108 averias; comparar contra vecinos, no.
  const sanos = m.demoFleet(20, 10).filter(s => !averias.includes(s.tcu));
  sanos.forEach(s => { if (s.motor_current != null) s.motor_current *= 1.7; });
  const rc = m.rankFleet(sanos);
  check('modo comun no marca a nadie', rc.trackers.filter(t => t.level !== 'ok').length, 0);

  // ---------- calidad: la medida rancia no se usa ----------
  check('medida rancia descartada',
    m.checkSample({ ts: 0, ncu: 1, tcu: 1, tilt_angle: 10, comms_age_s: 900 }).usable, false);
  check('valor imposible descartado',
    m.checkSample({ ts: 0, ncu: 1, tcu: 1, tilt_angle: 600 }).usable, false);

  // ---------- la pagina ----------
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errores.push('console: ' + msg.text()); });

  await page.goto(BASE + '/ia.html', { waitUntil: 'domcontentloaded' });
  await page.click('#runBtn');
  await page.waitForSelector('#tableBox tbody tr', { timeout: 15000 });

  check('pinta una fila por seguidor', await page.$$eval('#tableBox tbody tr', rs => rs.length), 28);
  // La celda usa &nbsp; para que "NCU 1" no parta de linea, asi que innerText
  // trae U+00A0 y un includes('TCU 7') con espacio normal falla sin motivo.
  check('el peor sale el primero',
    (await page.$eval('#tableBox tbody tr', r => r.innerText))
      .replace(/ /g, ' ').includes('TCU 7'), true);
  check('abre el detalle del peor', await page.$eval('#detail', e => e.classList.contains('on')), true);
  // El aviso de "sin calibrar" no es decorativo: es lo que impide que el ranking
  // se presente como una probabilidad de fallo.
  check('avisa de que no esta calibrado',
    (await page.$eval('#banner', e => e.innerText)).includes('sin calibrar'), true);
  check('el registro enseña las puertas que NO pasa',
    (await page.$eval('#registry', e => e.innerText)).includes('G3 walk-forward'), true);
  check('sin errores de consola', errores.length ? errores.join(' | ') : 0, 0);

  await browser.close();
  console.log(ko ? '\nFALLAN ' + ko + ' de ' + (ok + ko) : '\nTODAS OK (' + ok + ' comprobaciones)');
  process.exit(ko ? 1 : 0);
})();
