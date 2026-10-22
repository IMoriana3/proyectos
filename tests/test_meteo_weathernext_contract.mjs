/** Optional WeatherContract v2 quantile transport; no second forecast model. */
/* `assert` viene del portón: misma superficie, pero publica una línea `OK`
   por comprobación. `tests/correr.sh` saca su veredicto de ese recuento, no
   del código de salida, así que un banco que calla al pasar cuenta cero. */
import {assert, veredicto} from "./porton.mjs";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const code=fs.readFileSync(path.join(here,"../lib/weather-contract.js"),"utf8");
const WC=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));

const base={timestamp:"2026-10-19T07:00:00Z",temp_c:7,wind_ms:5,
    ghi_wm2:100,precip_mm:null,cloud_total:null,
    p10:{temp_c:5,wind_ms:3,ghi_wm2:60},
    p50:{temp_c:7,wind_ms:5,ghi_wm2:100},
    p90:{temp_c:9,wind_ms:7,ghi_wm2:150}};
const options={kind:"forecast",site:{id:"sample",name:"Sample"},
  timezone:"UTC",dataset:{source:"WeatherNext 3",source_id:"weathernext3",rows:[base]}};
const a=await WC.buildWeatherContract(options);
assert.equal(a.schema_version,"2.0.0");
assert.equal(a.rows.length,1);
assert.equal(a.rows[0].precip_mm,null);
assert.equal(a.rows[0].cloud_total,null);
assert.equal(a.rows[0].temp_c,7);
assert.equal(a.forecast_quantiles.version,"1.0.0");
assert.equal(a.forecast_quantiles.rows.length,1);
assert.equal(a.forecast_quantiles.rows[0].p10.wind_ms,3);
assert.equal(a.forecast_quantiles.rows[0].p50.ghi_wm2,100);
assert.equal(a.forecast_quantiles.rows[0].p90.temp_c,9);
assert.equal(a.forecast_quantiles.rows[0].p10.precip_mm,undefined);
assert.ok(a.forecast_quantiles.hash);
assert.match(a.forecast_quantiles.meaning,/marginal/);

const changed=await WC.buildWeatherContract({...options,dataset:{...options.dataset,
  rows:[{...base,p90:{temp_c:10,wind_ms:9,ghi_wm2:180}}]}});
assert.equal(changed.qa.dataset_hash,a.qa.dataset_hash);
assert.notEqual(changed.forecast_quantiles.hash,a.forecast_quantiles.hash);
assert.notEqual(changed.contract_id,a.contract_id);
const legacy=await WC.buildWeatherContract({kind:"historical",site:{id:"test"},
  dataset:{source:"Test",source_id:"test",rows:[{
    t:"2024-01-01T00:00:00Z",temp_c:null,wind_ms:0,ghi_wm2:null
  }]}});
assert.equal(legacy.forecast_quantiles,undefined);
assert.equal(legacy.rows[0].temp_c,null);
assert.equal(legacy.rows[0].ghi_wm2,null);
assert.equal(legacy.rows[0].wind_ms,0);
const snapshot=WC.browserConsumerStamp(a,"example-reader");
assert.equal(snapshot.forecast_quantiles_hash,a.forecast_quantiles.hash);
console.log("PASS: WeatherContract v2 quantiles retained and hashed, missing != zero");

veredicto();
