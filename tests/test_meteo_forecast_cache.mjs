import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"..");
const meteo=fs.readFileSync(path.join(root,"lib/meteo.js"),"utf8");
const mod=fs.readFileSync(path.join(root,"lib/meteo-forecast-cache.js"),"utf8")
  .replace('import {normalizeMeteo} from "./meteo.js";',"");
const js=await import("data:text/javascript;base64,"+Buffer.from(meteo+"\n"+mod.replaceAll("export ","")).toString("base64"));
const {fetchCachedWeatherNext,normalizeCachedWeatherNext}=js;
const init="2026-10-19T06:00:00Z",valid="2026-10-19T07:00:00Z",now=Date.parse("2026-10-19T08:00:00Z");
const plant={id:2,code:"24002",lat:41.575945,lng:-0.798424};
const row={source_id:"weathernext3",init_time:init,valid_time:valid,lead_hour:1,p10:{wind_ms:1},p50:{temp_c:8,wind_ms:3,ghi_wm2:150,cloud_total:.4},p90:{wind_ms:7},provenance:{surface:"GCS",gcs_prefix:"test_run"},ingested_at:valid};
function mock({newest=init,rows=[row],authenticated=true}={}){
 const calls=[];
 const sb={auth:{getUser:async()=>({data:{user:authenticated?{id:"u"}:null},error:null})},
 from(table){calls.push(table);let result=table==="plantas"?[plant]:table==="meteo_pronosticos"?rows:[];return {
  select(){return this;},eq(){return this;},gte(){return this;},order(){return this;},
  limit(n){if(table==="meteo_pronosticos"&&n===1)return Promise.resolve({data:newest?[{init_time:newest}]:[],error:null});
    return Promise.resolve({data:result.slice(0,n),error:null});}
 };}};
 return {sb,calls};
}
const norm=normalizeCachedWeatherNext(row,plant);
assert.equal(norm.temp_c,8);assert.equal(norm.wind_ms,3);
assert.equal(norm.ghi_wm2,150);assert.equal(norm.p10.wind_ms,1);
assert.equal(norm.provenance.measurement,false);
assert.equal(norm.provenance.surface,"GCS");
assert.equal(norm.precip_mm,null);
assert.equal(norm.provenance.run_time_utc,init);
assert.equal(norm.cloud_total,.4);
const x=mock();
const result=await fetchCachedWeatherNext(x.sb,{code:"24002",hours:72,now});
assert.equal(result.status,"ready");assert.equal(result.rows.length,1);
assert.deepEqual(x.calls,["plantas","meteo_pronosticos","meteo_pronosticos"]);
const none=await fetchCachedWeatherNext(mock({newest:null}).sb,{code:"24002",now});
assert.equal(none.status,"empty");
const stale=await fetchCachedWeatherNext(mock().sb,{code:"24002",now:now+25*3600000});
assert.equal(stale.status,"stale");assert.equal(stale.rows.length,0);
await assert.rejects(()=>fetchCachedWeatherNext(mock({authenticated:false}).sb,{code:"24002"}),/Inicia sesión/);
await assert.rejects(()=>fetchCachedWeatherNext(mock().sb,{code:"../../etc/passwd"}),/Selecciona una planta/);
assert.throws(()=>normalizeCachedWeatherNext({...row,lead_hour:3},plant),/incoherentes/);
assert.throws(()=>normalizeCachedWeatherNext({...row,provenance:{surface:"unknown"}},plant),/origen/);
console.log("WeatherNext forecast cache: 12 checks OK");
