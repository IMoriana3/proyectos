// EL MOTOR DEL MAPA DE PAÍS, sin navegador.
//
// El mapa pinta «cuánta energía más capta la planta con el pasivo que con el
// activo» en cada nodo de una rejilla. Las corridas son de `LOC.run` y eso lo
// carea `test_viento_mapa.js` en Chromium; aquí va lo que el mapa añade por su
// cuenta y que, mal hecho, da un mapa verosímil y falso:
//
//   · qué nodos caen DENTRO del país (y cuándo se relaja la regla);
//   · el signo y el denominador de la ganancia;
//   · que la meteo guardada vuelve BIT A BIT como se bajó;
//   · que rellenar e interpolar para pintar no inventa donde no hay nodos;
//   · la escala y la banda, incluida la del pasivo que pierde más.
//
// Las funciones se extraen del HTML real por firma (misma regla que
// `test_viento_pasivo.js`): una copia seguiría verde con el original roto.
//
//   node tests/test_viento_mapa_motor.js
const fs = require('fs'), path = require('path'), vm = require('vm');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

const html = fs.readFileSync(path.join(__dirname, '..', 'sim-viento.html'), 'utf8');
function saca(firma) {
  const i = html.indexOf(firma);
  if (i < 0) return null;
  const j = html.indexOf('\n};', i);
  return j < 0 ? null : html.slice(i, j + 3);
}
const FIRMAS = ['LOC.MAPA={', 'LOC.mapaNodos=function(rej,paso,valorEn){',
  'LOC.mapaClave=function(lat,lon,year){', 'LOC.mapaCuerpo=function(base,nodo,opt,M){',
  'LOC.mapaGanancia=function(rep,ref){', 'LOC.mapaEmpaqueta=function(M){',
  'LOC.mapaDesempaqueta=function(P){', 'LOC.mapaRellena=function(G,nx,ny,pasadas){',
  'LOC.mapaInterp=function(F,nx,ny,fx,fy){', 'LOC.mapaEscala=function(vals,fija){',
  'LOC.mapaBanda=function(v,esc){', 'LOC.mapaResumen=function(lista){'];
const trozos = FIRMAS.map(saca);
check('las funciones siguen en el HTML con esa firma', trozos.every(Boolean),
      FIRMAS.filter((f, i) => !trozos[i]).join(' · '));
if (!trozos.every(Boolean)) { console.log('\nFALLOS: ' + ko); process.exit(1); }
check('lo extraído tiene cuerpo (' + trozos.join('').length + ' chars)', trozos.join('').length > 6000);
const ctx = { console, LOC: {} };
vm.createContext(ctx);
try { vm.runInContext(trozos.join('\n'), ctx); } catch (e) { check('el bloque compila en Node', false, e.message); }
const LOC = ctx.LOC;

// ── la regla de `valorEn` es la de lib/mapas-pais.js, extraída de allí ──
const lib = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mapas-pais.js'), 'utf8');
const iv = lib.indexOf('function valorEn(rej, lat, lon) {'), jv = lib.indexOf('\n  }', iv);
const valorEn = vm.runInNewContext('(' + lib.slice(iv, jv + 4) + ')');
check('lib/mapas-pais.js exporta también paisDe y json (el mapa no copia la regla del país)',
      /FactiunMapasPais = \{[^}]*paisDe[^}]*json[^}]*\}/.test(lib));

// Un «país» de juguete: 8°×6° desde (0°E, 40°N), tierra solo en la mitad oeste.
const rej = { extension: [0, 8, 40, 46], filas: 60, columnas: 80, escala: 1, valores: [] };
for (let f = 0; f < 60; f++) rej.valores.push(Array.from({ length: 80 }, (_, c) => c < 40 ? 1 : null));

// ── nodos ──
const P1 = LOC.mapaNodos(rej, 1, valorEn);
check('a 1° salen los nodos de la mitad oeste y ninguno del mar (' + P1.nodos.length + ')',
      P1.nodos.length > 0 && P1.nodos.every(o => o.lon >= 0 && o.lon < 4 && o.lat > 40 && o.lat <= 46));
check('la regla usada es la del PUNTO', P1.regla === 'punto');
check('cada nodo cae dentro según la MISMA regla de la lámina',
      P1.nodos.every(o => valorEn(rej, o.lat, o.lon) != null));
check('los nodos son múltiplos del paso desde 0° (clave de caché estable entre países)',
      LOC.mapaNodos(rej, 0.75, valorEn).nodos.every(o =>
        Math.abs(o.lat / 0.75 - Math.round(o.lat / 0.75)) < 1e-6 && Math.abs(o.lon / 0.75 - Math.round(o.lon / 0.75)) < 1e-6));
check('ix/iy indexan la rejilla que se declara (nx·ny)',
      P1.nodos.every(o => o.ix >= 0 && o.ix < P1.nx && o.iy >= 0 && o.iy < P1.ny &&
        Math.abs(P1.lon0 + o.ix * 1 - o.lon) < 1e-6 && Math.abs(P1.lat0 + o.iy * 1 - o.lat) < 1e-6));
const fino = LOC.mapaNodos(rej, 0.5, valorEn).nodos.length;
check('a mitad de paso salen ~4× nodos (' + P1.nodos.length + ' → ' + fino + ')',
      fino > 3 * P1.nodos.length && fino < 5 * P1.nodos.length);
// país más pequeño que el paso: ningún punto cae dentro
const isla = { extension: [10.2, 10.6, 40.2, 40.6], filas: 4, columnas: 4, escala: 1,
  valores: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]] };
const PI = LOC.mapaNodos(isla, 1, valorEn);
check('un país menor que el paso cae a la regla del RECUADRO y lo DICE (' + PI.nodos.length + ' nodos)',
      PI.regla === 'recuadro' && PI.nodos.length >= 1);
check('la clave lleva lat, lon y año', LOC.mapaClave(41.5, -0.5, 2022) === '41.5000,-0.5000,2022');

// ── cuerpo de la corrida ──
const base = { lat: 1, lon: 2, name: 'x', year: 2023, strategies: ['A1', 'B2'], threshold_1_kmh: 40,
  passive: { enabled: true, n_trackers: 10 }, timeline: { hours: 16 }, wind_scenario: { base: 'synthetic' } };
const C = LOC.mapaCuerpo(base, { lat: 41, lon: -3 }, { year: 2022, ref: 'B2', step: 15, rafaga: true }, { t: [] });
check('el cuerpo del nodo cambia sitio, año y deja UNA estrategia',
      C.lat === 41 && C.lon === -3 && C.year === 2022 && C.year1 === 2022 &&
      C.strategies.length === 1 && C.strategies[0] === 'B2');
check('lo demás viaja tal cual (umbrales, pasivo)', C.threshold_1_kmh === 40 && C.passive === base.passive);
check('del laboratorio solo entra la ráfaga: nada de fondo sintético en el mapa',
      C.wind_scenario.base === 'meteo' && C.wind_scenario.use_gust === true);
check('sin ráfaga no hay escenario',
      LOC.mapaCuerpo(base, { lat: 1, lon: 1 }, { year: 2022, ref: 'A1', step: null, rafaga: false }, {}).wind_scenario === null);
check('no retiene serie (sin ventana) y no toca el cuerpo base',
      C.timeline === null && base.timeline.hours === 16 && base.lat === 1);

// ── ganancia ──
const rep = (eA, eP) => ({ baseline: { poa_kwh_m2: 2000 }, wind: { max_ms: 25, hours_over_t1: 9, scenario: { gust_origen: 'medida' } },
  cases: { B2: { poa_kwh_m2: eA, poa_delta_pct: 100 * (eA - 2000) / 2000, n_events: 7, hours_engaged: 30, hours_stow_daylight: 12 },
    PASIVO: { poa_kwh_m2: eP, poa_delta_pct: 100 * (eP - 2000) / 2000, n_events: 1, hours_engaged: 5,
      passive: { row_poa_delta_pct: -2 } } } });
const g1 = LOC.mapaGanancia(rep(1960, 1998), 'B2');
check('el pasivo capta MÁS → ganancia positiva, y el denominador es el activo (' + g1.ganancia_pct.toFixed(4) + ')',
      Math.abs(g1.ganancia_pct - 100 * 38 / 1960) < 1e-12);
check('el pasivo capta MENOS → negativa', LOC.mapaGanancia(rep(1998, 1960), 'B2').ganancia_pct < 0);
check('arrastra lo que explica el número', g1.activo_pct === -2 && g1.n_activo === 7 &&
      Math.abs(g1.pasivo_pct + 0.1) < 1e-9 && g1.fila_pct === -2 && g1.viento_max_kmh === 90 && g1.rafaga === 'medida');
check('sin el caso de referencia no hay número, hay null', LOC.mapaGanancia(rep(1960, 1998), 'A1') === null);

// ── empaquetar ──
const N = 500, M = { t: [], source: 'open_meteo', tiene_rafaga: true };
['ghi', 'dhi', 'dni', 'temp', 'ws', 'wd', 'gust'].forEach(c => { M[c] = new Float64Array(N); });
for (let i = 0; i < N; i++) {
  M.t.push(new Date(Date.UTC(2022, 0, 1) + i * 3600e3));
  M.ghi[i] = Math.round(i * 7.3 * 10) / 10; M.dhi[i] = Math.round(i * 1.1 * 10) / 10; M.dni[i] = i;
  M.temp[i] = Math.round((-5 + i * 0.07) * 10) / 10; M.ws[i] = Math.round(i * 0.0313 * 100) / 100;
  M.wd[i] = i % 7 === 0 ? NaN : i % 360; M.gust[i] = i % 11 === 0 ? NaN : Math.round(i * 0.05 * 10) / 10;
}
const igual = (a, b) => a.length === b.length && Array.prototype.every.call(a, (v, i) => Object.is(v, b[i]) || (v === 0 && b[i] === 0));
const Pk = LOC.mapaEmpaqueta(M), U = LOC.mapaDesempaqueta(Pk);
check('lo que vuelve de la caché es BIT A BIT lo que se guardó (7 columnas, con sus NaN)',
      ['ghi', 'dhi', 'dni', 'temp', 'ws', 'wd', 'gust'].every(c => igual(M[c], U[c])));
check('y el eje de tiempos, la fuente y si traía ráfaga',
      U.t.every((d, i) => d.getTime() === M.t[i].getTime()) && U.source === 'open_meteo' && U.tiene_rafaga === true);
check('con decimales de fuente viaja en centésimas enteras (la mitad de sitio)',
      Pk.cols.ws.e === 100 && Pk.cols.ws.q.BYTES_PER_ELEMENT === 4);
const M2 = Object.assign({}, M, { ws: Float64Array.from(M.ws, v => v + Math.PI / 1e6) });
const P2 = LOC.mapaEmpaqueta(M2);
check('una columna que NO cabe exacta en centésimas se guarda entera, no redondeada',
      P2.cols.ws.e === 0 && igual(LOC.mapaDesempaqueta(P2).ws, M2.ws));
const M3 = Object.assign({}, M); delete M3.gust; M3.tiene_rafaga = false;
check('sin ráfaga no se inventa la columna', LOC.mapaDesempaqueta(LOC.mapaEmpaqueta(M3)).gust === undefined);
check('desempaquetar da arrays NUEVOS cada vez (la corrida escala el viento en sitio)',
      LOC.mapaDesempaqueta(Pk).ws !== LOC.mapaDesempaqueta(Pk).ws);

// ── rellenar e interpolar ──
const G = new Float64Array(25).fill(NaN); G[12] = 4;            // 5×5, un solo dato en el centro
const F1 = LOC.mapaRellena(G, 5, 5, 1);
check('una pasada llega a los 8 vecinos y no más', [6, 7, 8, 11, 13, 16, 17, 18].every(i => F1[i] === 4) && isNaN(F1[0]));
check('y no toca la rejilla original ni el dato', isNaN(G[6]) && F1[12] === 4);
const F0 = new Float64Array([0, 10, 20, 30]);                    // 2×2
check('bilineal en el centro de cuatro nodos', Math.abs(LOC.mapaInterp(F0, 2, 2, 0.5, 0.5) - 15) < 1e-12);
check('en un nodo, el valor del nodo', LOC.mapaInterp(F0, 2, 2, 1, 0) === 10);
check('con esquinas sin dato reparte entre las que hay',
      LOC.mapaInterp(new Float64Array([8, NaN, NaN, NaN]), 2, 2, 0.4, 0.4) === 8);
check('sin ninguna esquina con dato devuelve NaN, no un cero',
      isNaN(LOC.mapaInterp(new Float64Array(4).fill(NaN), 2, 2, 0.5, 0.5)) && isNaN(LOC.mapaInterp(F0, 2, 2, 7, 7)));

// ── escala y banda ──
const E = LOC.mapaEscala([0.1, 0.63, NaN], 0);
check('escala ajustada: diez bandas redondas que cubren el máximo (' + E.max + ' / ' + E.paso + ')',
      Math.abs(E.max - 1) < 1e-9 && Math.abs(E.paso - 0.1) < 1e-9 && E.dec === 1);
const E5 = LOC.mapaEscala([0.1], 5);
check('escala fija 0–5 %, la del mapa de ARRAY', E5.max === 5 && E5.paso === 0.5 && E5.dec === 1);
check('sin datos positivos no divide por cero', LOC.mapaEscala([NaN, -1], 0).max > 0);
check('banda: 0 abajo, 9 arriba y lo que pasa del tope se queda en 9',
      LOC.mapaBanda(0, E5) === 0 && LOC.mapaBanda(0.49, E5) === 0 && LOC.mapaBanda(0.5, E5) === 1 &&
      LOC.mapaBanda(4.99, E5) === 9 && LOC.mapaBanda(12, E5) === 9);
check('el pasivo que pierde MÁS tiene su banda aparte (−1) y el redondeo no cae en ella',
      LOC.mapaBanda(-0.01, E5) === -1 && LOC.mapaBanda(-0.00004, E5) === 0);
check('sin dato no hay banda', LOC.mapaBanda(NaN, E5) === null);
check('la rampa tiene diez colores y el de «pierde más» no es ninguno de ellos',
      LOC.MAPA.RAMPA.length === 10 && LOC.MAPA.RAMPA.indexOf(LOC.MAPA.BAJO) < 0);

// ── resumen ──
const S = LOC.mapaResumen([{ lat: 0, g: { ganancia_pct: 1, activo_pct: -1, pasivo_pct: 0 } },
  { lat: 60, g: { ganancia_pct: 4, activo_pct: -4, pasivo_pct: 0 } }, { lat: 30, g: null }]);
check('la media va ponderada por cos(lat): 1 y 4 con pesos 1 y 0,5 dan 2 (' + S.media.toFixed(4) + ')',
      Math.abs(S.media - 2) < 1e-9 && S.n === 2 && S.min === 1 && S.max === 4);
check('sin nodos calculados no hay resumen', LOC.mapaResumen([{ lat: 1, g: null }]) === null);

console.log('\n' + (ko ? 'FALLOS: ' + ko : 'OK — ' + ok + '/' + ok + ' comprobaciones'));
process.exit(ko ? 1 : 0);
