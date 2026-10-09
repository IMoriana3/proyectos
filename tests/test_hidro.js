// Hidrología del Generador · GOLDEN de conservación, estados y contratos.
// node tests/test_hidro.js — sin red, sin navegador, sin ejemplos promocionales.
"use strict";
const fs = require("fs"), path = require("path");
const R = path.join(__dirname, "..");
const H = require("../lib/hydro-risk.js");
let ok = 0, bad = 0;
function check(label, yes, detail) {
  if (yes) { ok++; console.log("OK   " + label); }
  else { bad++; console.log("FAIL " + label + (detail ? " → " + detail : "")); }
}
function close(a, b, tol = 1e-8) { return Math.abs(a-b) < tol; }
function fails(fn, match) {
  try { fn(); return false; }
  catch (err) { return match.test(String(err && err.message || err)); }
}
function grid(n, fn, rev) {
  const lats = [], lons = [], z = [];
  for (let j = 0; j < n; j++) {
    lats.push(41.573 + (rev ? n - 1 - j : j) * 0.0003);
    lons.push(-0.801 + j * .0003);
  }
  for (let r = 0; r < n; r++) {
    z.push(Array.from({ length: n }, (_, c) => fn(r,c)));
  }
  return {lats, lons, z, src: "GOLDEN MDT sintético"};
}
const level = grid(5, () => 100);
const cfg = {rainfallMmH:60, rainMinutes:60, totalMinutes:60,
  runoff:1, openBoundary:false, dtSec:10};
const eq = H.simulate(level, cfg);
check("exporta la API pura", ["simulate","sample","validateDem","analyzeLayout","exclusionRuns"].every(k => typeof H[k] === "function"));
check("contrato: motor de criba, NO estudio hidráulico", eq.status === "PRELIMINAR_NO_CERTIFICADO");
check("entrada 60 mm/h × 60 min × C=1 → 60 mm", close(eq.summary.effectiveRainMm,60));
check("malla 5×5 con 25 celdas", eq.dem.rows === 5 && eq.dem.cols === 5 && eq.peakDepth_m.length === 25);
check("superficie de una celda en m²", eq.dem.cellArea > 1);
check("lluvia en plano cerrado: calado homogéneo 6 cm", [...eq.peakDepth_m].every(v => close(v,.06,1e-7)));
check("volumen entrante igual a lluvia efectiva por área", close(eq.summary.inputM3, .06*25*eq.dem.cellArea,1e-6));
check("dominio cerrado: sin salidas", eq.summary.outletM3 === 0);
check("dominio cerrado: almacenamiento = entradas", close(eq.summary.storedM3,eq.summary.inputM3,1e-6));
check("balance relativo cerrado menor 1e-10", eq.summary.balanceRelative < 1e-10);
check("fotograma inicial totalmente seco", [...eq.frames[0].depth_m].every(v => v === 0));
check("fotograma final 60 min", close(eq.frames.at(-1).minute, 60,1e-6));
check("máximo local ≤ 0.06m (+error numérico)", eq.summary.maxDepthM < .060001);
check("área ≥ 10cm = 0", eq.summary.areaDepth10M2 === 0);
check("0mm de lluvia no inventa agua", H.simulate(level,{...cfg,rainfallMmH:0}).summary.maxDepthM === 0);
check("C=0 no inventa agua", H.simulate(level,{...cfg,runoff:0}).summary.inputM3 === 0);
const tilted = grid(7, (r,c) => 100 + .25*c + .08*r);
const open = H.simulate(tilted,{...cfg,openBoundary:true,totalMinutes:120});
const shut = H.simulate(tilted,{...cfg,openBoundary:false,totalMinutes:120});
check("con borde abierto hay vertido", open.summary.outletM3 > 0);
check("con borde cerrado NO hay vertido", shut.summary.outletM3 === 0);
check("borde cerrado conserva más agua", shut.summary.storedM3 > open.summary.storedM3);
check("balance abierto menor 1e-10", open.summary.balanceRelative < 1e-10, String(open.summary.balanceRelative));
check("balance cerrado menor 1e-10 tras escorrentía", shut.summary.balanceRelative < 1e-10);
check("no hay celdas con calado negativo", [...open.frames.at(-1).depth_m].every(h => h >= 0));
check("no hay NaN en calados", [...open.peakDepth_m].every(Number.isFinite));
check("Manning da proxies finitos de velocidad", [...open.peakVelocity_mps].every(Number.isFinite));
check("genera evolución temporal, no solo foto final", open.frames.length > 5 && open.frames.length <= 61);
const s0 = H.sample(eq, level.lons[2], level.lats[2], 0);
const s1 = H.sample(eq, level.lons[2], level.lats[2], 10000);
check("consulta inicial en seco", close(s0.depth_m,0));
check("consulta final a 6 cm", close(s1.depth_m,.06,1e-6));
check("punto fuera del MDT = desconocido, no 0", H.sample(eq, -10,55) === null);
const poly = {lonlat:[[-.8006,41.5735],[-.8000,41.5735],[-.8000,41.5741],[-.8006,41.5741]],mods:28};
const impact = H.analyzeLayout(eq,[poly],.05,630);
check("muestrea huella completa con esquinas y centro", impact.affected === 1);
check("potencia afectada 28×630Wp", close(impact.affectedKwp,17.64,1e-9));
check("umbral por encima de 6cm → sin expuestas", H.analyzeLayout(eq,[poly],.10,630).affected === 0);
check("estructura sin huella = SIN CLASIFICAR", H.analyzeLayout(eq,[{}],.05,630).unknown === 1);
check("estructura fuera del MDT = SIN CLASIFICAR", H.analyzeLayout(eq,[{
  lonlat:[[5,5],[5.1,5],[5.1,5.1],[5,5.1]]}],.05,630).unknown === 1);
const areas = H.exclusionRuns(eq,.05,null,10);
check("exclusión agrupa por recorridos de fila", areas.length === 5 && areas[0].length === 4);
const mask=Array.from({length:5},(_,r)=>Array.from({length:5},()=>r===2));
check("exclusión respeta máscara territorial", H.exclusionRuns(eq,.05,mask,10).length === 1);
check("más zonas que límite aborta sin excluir a medias", fails(()=>H.exclusionRuns(eq,.05,null,2),/Más de 2/));
check("umbral de exclusión inválido aborta", fails(()=>H.exclusionRuns(eq,0),/Umbral/));
check("lluvia negativa aborta", fails(()=>H.simulate(level,{...cfg,rainfallMmH:-1}),/Intensidad/));
check("Manning n fuera de rango aborta", fails(()=>H.simulate(level,{...cfg,manningN:0}),/Manning/));
check("paso temporal fuera de rango aborta", fails(()=>H.simulate(level,{...cfg,dtSec:0}),/Paso/));
check("horizonte menor que lluvia aborta", fails(()=>H.simulate(level,{...cfg,totalMinutes:30}),/Horizonte/));
check("cota NaN aborta", fails(()=>H.simulate(grid(3,(r,c)=>r===1&&c===1?NaN:100),cfg),/cota/));
check("cota null no se inventa como 0m", fails(()=>H.simulate(grid(3,(r,c)=>r===1&&c===1?null:100),cfg),/cota/));
check("cadena vacía no se inventa como 0m", fails(()=>H.simulate(grid(3,(r,c)=>r===1&&c===1?"":100),cfg),/cota/));
check("filas de MDT malformadas abortan", fails(()=>H.simulate({lats:[41,41.0003,41.0006],lons:[-3,-2.9997,-2.9994],z:[[1],[1],[1]]},cfg),/Filas/));
check("espaciado de coordenadas degenerado aborta", fails(()=>H.simulate({
  lats:[41,41,41],lons:[-1,-.999,-.998],z:[[0,0,0],[0,0,0],[0,0,0]]},cfg),/Separación/));
const rev=H.simulate(grid(4,()=>100,true),cfg);
check("MDT con latitudes descendentes sigue conservando agua", rev.summary.balanceRelative < 1e-10);
const html=fs.readFileSync(path.join(R,"generador-layout.html"),"utf8");
const pageJS=fs.readFileSync(path.join(R,"lib/hydro-generator.js"),"utf8");
const viewer=fs.readFileSync(path.join(R,"lib/hydro-viewer.js"),"utf8");
check("JS del integrador compila",(()=>{try{new Function(pageJS);return true;}catch(e){return false;}})());
check("JS del visor 3D compila",(()=>{try{new Function(viewer);return true;}catch(e){return false;}})());
check("panel de hidro ES parte del generador", html.includes('id="hydroCard"'));
check("mismo MDT y estructuras (sin fixture en producción)", /simulate\(DEM,hydroOptions\(\)\)/.test(pageJS)&&/RES&&RES\.structures/.test(pageJS));
check("layout llama exclusiones solo de simulación vigente", html.includes('hydroExtraExclusions()') && /!hydroCurrent\(\).*?throw new Error/s.test(pageJS));
check("versión de visor 3D local, sin CDN", html.includes('src="lib/hydro-viewer.js"')&&html.includes('src="lib/three.min.js"'));
check("sin datos de MDT no ejecuta solver", /if\(!DEM\).*?return;/s.test(pageJS));
check("no altera EXCL del usuario", /EXCL\.concat\(typeof hydroExtraExclusions/.test(html));
check("guarda capa de usuario pero no volúmenes simulados", /st\.hydroExternal=HYDRO_OFFICIAL/.test(html)&&!/st\.hydroResult=/.test(html));
console.log("\n"+(bad?"FALLOS "+bad:"OK")+" · "+ok+" comprobaciones, "+bad+" errores");
process.exitCode=bad?1:0;
