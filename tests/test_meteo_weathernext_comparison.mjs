/** Time-aligned forecast source comparison; neither model is field truth. */
/* `assert` viene del portón: misma superficie, pero publica una línea `OK`
   por comprobación. `tests/correr.sh` saca su veredicto de ese recuento, no
   del código de salida, así que un banco que calla al pasar cuenta cero. */
import {assert, veredicto} from "./porton.mjs";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=fs.readFileSync(path.join(root,"lib/meteo.js"),"utf8");
const W=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const base=Date.parse("2026-10-19T06:00:00Z");
const utc=n=>new Date(base+n*3600000).toISOString();
const wx=[{timestamp:utc(1),wind_ms:5,temp_c:8,ghi_wm2:0},
  {timestamp:utc(2),wind_ms:7,temp_c:null,ghi_wm2:80},
  {timestamp:utc(3),wind_ms:9,temp_c:11,ghi_wm2:null}];
const om=[{timestamp:utc(4),wind_ms:2,temp_c:4,ghi_wm2:60},
  {timestamp:utc(2),wind_ms:4,temp_c:6,ghi_wm2:100},
  {timestamp:utc(1),wind_ms:4,temp_c:7,ghi_wm2:30},
  {timestamp:utc(3),wind_ms:8,temp_c:10,ghi_wm2:40}];
const c=W.compareForecastSources(wx,om,{field:"wind_ms",hours:72});
assert.equal(c.overlapping_hours,3);
assert.equal(c.first_utc,utc(1));
assert.equal(c.last_utc,utc(3));
assert.equal(c.bias,(1+3+1)/3);
assert.equal(c.mae,5/3);
assert.equal(c.pairs[0].weathernext,5);
assert.equal(c.pairs[0].openmeteo,4);
assert.match(c.interpretation,/modelos/);
assert.deepEqual(c.sources,["weathernext3","openmeteo"]);

/* UN CASO CON UNA DIFERENCIA NEGATIVA, PORQUE SIN ÉL `mae` Y `bias` SON EL
 * MISMO NÚMERO Y NINGUNA DE LAS DOS ASERCIONES DE ARRIBA LO NOTARÍA.
 *
 * En el caso de arriba las tres diferencias son +1, +3 y +1: todas positivas,
 * así que el valor absoluto no hace nada y bias = mae = 5/3. MEDIDO: quitarle
 * el `Math.abs` a `mae` en lib/meteo.js dejaba este banco EN VERDE. O sea que
 * no distinguía el error medio del sesgo, que es justo lo que esas dos
 * métricas existen para distinguir.
 *
 * Con +4 y -2 se separan: el sesgo se compensa a 1 y el error medio es 3. */
const wx2=[{timestamp:utc(1),wind_ms:9},{timestamp:utc(2),wind_ms:3}];
const om2=[{timestamp:utc(1),wind_ms:5},{timestamp:utc(2),wind_ms:5}];
const d=W.compareForecastSources(wx2,om2,{field:"wind_ms",hours:72});
assert.equal(d.overlapping_hours,2);
assert.equal(d.bias,(4+(-2))/2);
assert.equal(d.mae,(4+2)/2);
assert.notEqual(d.bias,d.mae);
const solar=W.compareForecastSources(wx,om,{field:"ghi_wm2",hours:360});
assert.equal(solar.overlapping_hours,2);
assert.equal(solar.pairs[0].weathernext,0);
assert.equal(solar.pairs[0].difference,-30);
const temps=W.compareForecastSources(wx,om,{field:"temp_c",hours:72});
assert.equal(temps.overlapping_hours,2); // skip null, not zero
assert.equal(temps.bias,1);
const historical=W.compareForecastSources(wx,[{timestamp:utc(800),wind_ms:5}],{field:"wind_ms"});
assert.equal(historical.overlapping_hours,0);
assert.equal(historical.mae,null);
assert.equal(historical.first_utc,null);
assert.throws(()=>W.compareForecastSources(wx,om,{field:"pressure_hpa"}),/no comparable/);
assert.throws(()=>W.compareForecastSources(wx,om,{hours:361}),/Horizonte/);
const extended=Array.from({length:360},(_,i)=>({timestamp:utc(i+1),wind_ms:4}));
const extendedRef=Array.from({length:360},(_,i)=>({timestamp:utc(i+1),wind_ms:3}));
const long=W.compareForecastSources(extended,extendedRef,{hours:360});
assert.equal(long.overlapping_hours,360);
assert.equal(long.mae,1);
assert.equal(long.last_utc,utc(360));
console.log("PASS: source comparison aligns UTC 1..360 hours, distinguishes missing/zero and reports unbiased model deltas");

veredicto();
