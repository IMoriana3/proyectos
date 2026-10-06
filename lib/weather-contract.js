/* Factiun · Weather Contract browser authority
   ---------------------------------------------------------------
   This module is the browser-side transport for the canonical meteorological
   dataset. It does not calculate CONTROL decisions. It stores normalized
   datasets in origin-wide Cache Storage so every GitHub Pages application
   under imoriana3.github.io can consume the same package/hash without
   downloading its own weather again.

   WEATHER informs; CONTROL decides.
*/
export const WEATHER_CONTRACT_VERSION="2.0.0";
export const WEATHER_ACTIVE_KEY="factiun_weather_contract_active_v2";
export const WEATHER_CACHE_NAME="factiun-weather-contract-v2";
export const WEATHER_CACHE_PREFIX="/__factiun_weather_contract_v2__/";

export const WEATHER_FIELDS=Object.freeze([
  "t","ghi_wm2","dni_wm2","dhi_wm2","temp_c","dewpoint_c",
  "wind_ms","wind_dir_deg","gust_ms","rh_pct","pressure_hpa",
  "precip_mm","rain_mm","snowfall_cm","snow_depth_m","showers_mm",
  "cape_jkg","weather_code"
]);

const finite=v=>Number.isFinite(+v)?+v:null;
const escKey=s=>String(s??"").replace(/[^a-zA-Z0-9_.:-]+/g,"_").slice(0,160);
const nowIso=()=>new Date().toISOString();

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==="object"){
    const out={};
    Object.keys(value).sort().forEach(k=>{if(value[k]!==undefined)out[k]=stable(value[k]);});
    return out;
  }
  if(typeof value==="number"&&!Number.isFinite(value))return null;
  return value;
}
async function sha256Text(text){
  if(globalThis.crypto?.subtle){
    const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
    return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
  }
  // Deterministic non-cryptographic fallback for old/offline browsers.
  let h1=0x811c9dc5,h2=0x01000193;
  for(let i=0;i<text.length;i++){h1^=text.charCodeAt(i);h1=Math.imul(h1,h2)>>>0;}
  return "fnv32-"+h1.toString(16).padStart(8,"0");
}
function normalizedRow(r={}){
  const out={};
  for(const k of WEATHER_FIELDS){
    if(k==="t"){out.t=r.t||r.timestamp||r.time||null;continue;}
    out[k]=finite(r[k]);
  }
  return out;
}
function inferredStepMinutes(rows){
  if(!Array.isArray(rows)||rows.length<2)return null;
  const ds=[];
  for(let i=1;i<Math.min(rows.length,1000);i++){
    const d=(Date.parse(rows[i].t)-Date.parse(rows[i-1].t))/60000;
    if(Number.isFinite(d)&&d>0&&d<1440)ds.push(d);
  }
  if(!ds.length)return null;
  ds.sort((a,b)=>a-b);
  return ds[Math.floor(ds.length/2)];
}
function coverage(rows){
  if(!rows?.length)return {start:null,end:null,rows:0};
  return {start:rows[0].t||null,end:rows.at(-1).t||null,rows:rows.length};
}
function rowCompleteness(rows){
  if(!rows?.length)return {required_pct:0,all_fields_pct:0};
  const req=["ghi_wm2","dni_wm2","dhi_wm2","temp_c","wind_ms"];
  let reqGood=0,allGood=0,total=rows.length;
  for(const r of rows){
    reqGood+=req.every(k=>Number.isFinite(r[k]))?1:0;
    allGood+=WEATHER_FIELDS.filter(k=>k!=="t").every(k=>r[k]==null||Number.isFinite(r[k]))?1:0;
  }
  return {required_pct:100*reqGood/total,all_fields_pct:100*allGood/total};
}

export async function weatherDatasetHash(rows){
  const compact=(rows||[]).map(r=>{
    const x=normalizedRow(r),o={};
    WEATHER_FIELDS.forEach(k=>{if(x[k]!==null&&x[k]!==undefined)o[k]=x[k];});
    return o;
  });
  return (await sha256Text(JSON.stringify(stable(compact)))).slice(0,24);
}

export async function buildWeatherContract({
  dataset,
  kind="historical",
  site={},
  timezone="UTC",
  provenance={},
  uncertainty={},
  spatial=null,
  consumer_policy=null,
  created_at=null
}={}){
  if(!dataset||!Array.isArray(dataset.rows))throw new Error("WeatherContract requires dataset.rows");
  const rows=dataset.rows.map(normalizedRow).filter(r=>r.t).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
  const hash=dataset.qa?.hash||await weatherDatasetHash(rows);
  const step=inferredStepMinutes(rows);
  const cov=coverage(rows);
  const source_id=String(dataset.source_id||dataset.source||provenance.source_id||"unknown");
  const contract_id=escKey([
    site.id||site.code||site.name||"site",
    kind,source_id,hash
  ].join(":"));
  const pkg={
    schema_version:WEATHER_CONTRACT_VERSION,
    contract_id,
    kind,
    site:{
      id:site.id||site.code||null,
      name:site.name||null,
      lat:finite(dataset.lat??site.lat),
      lon:finite(dataset.lon??site.lon),
      elevation_m:finite(site.elevation_m),
      timezone:timezone||site.tz||"UTC"
    },
    source:{
      id:source_id,
      label:String(dataset.source||provenance.provider||source_id),
      provider:String(provenance.provider||dataset.source||source_id),
      model:provenance.model||null,
      dataset_id:provenance.dataset_id||null,
      run_time_utc:provenance.run_time_utc||null,
      retrieved_at_utc:provenance.retrieved_at_utc||provenance.retrieved_at||created_at||nowIso(),
      fallback_level:Number.isFinite(+provenance.fallback_level)?+provenance.fallback_level:0,
      fallback_reason:provenance.fallback_reason||null
    },
    temporal:{
      timezone:timezone||site.tz||"UTC",
      original_resolution_min:finite(provenance.original_resolution_min??step),
      operational_resolution_min:finite(provenance.operational_resolution_min??step),
      interpolated:!!(dataset.interpolation||provenance.interpolated),
      coverage_start_utc:cov.start,
      coverage_end_utc:cov.end,
      valid_from_utc:provenance.valid_from_utc||cov.start,
      valid_to_utc:provenance.valid_to_utc||cov.end
    },
    variables:{
      fields:WEATHER_FIELDS.slice(),
      units:{
        ghi_wm2:"W/m2",dni_wm2:"W/m2",dhi_wm2:"W/m2",
        temp_c:"degC",dewpoint_c:"degC",wind_ms:"m/s",
        wind_dir_deg:"deg",gust_ms:"m/s",rh_pct:"%",
        pressure_hpa:"hPa",precip_mm:"mm",rain_mm:"mm",
        snowfall_cm:"cm",snow_depth_m:"m",showers_mm:"mm",
        cape_jkg:"J/kg",weather_code:"WMO"
      }
    },
    qa:{
      status:dataset.qa?.status||provenance.qa_status||"UNASSESSED",
      dataset_hash:hash,
      rows:rows.length,
      completeness:rowCompleteness(rows),
      bsrn_outliers_removed:dataset.qa?.bsrn_outliers_removed??null,
      findings:dataset.qa?.findings||[],
      interpolation:dataset.interpolation?.report||dataset.interpolation||null
    },
    uncertainty:{
      resource_sigma:finite(uncertainty.resource_sigma??uncertainty.irradiance_sigma),
      cross_source_rms_pct:finite(uncertainty.cross_source_rms_pct),
      adaptation_sigma:finite(uncertainty.adaptation_sigma??uncertainty.irradiance_sigma),
      basis:uncertainty.basis||null,
      components:uncertainty.components||null
    },
    spatial:spatial||null,
    consumer_policy:consumer_policy||{
      role:"meteorological-input",
      weather_informs_control:true,
      control_decides:true,
      consumers:[
        "wind_hail","diffuse","production3d","battery","winter_mode",
        "backtracking_energy","digital_twin","scada","p50_p90"
      ]
    },
    rows
  };
  return pkg;
}

function cacheUrl(id){
  const base=globalThis.location?.origin||"https://imoriana3.github.io";
  return base+WEATHER_CACHE_PREFIX+encodeURIComponent(id)+".json";
}
export async function publishWeatherContract(pkg,{activate=true}={}){
  if(!pkg||pkg.schema_version!==WEATHER_CONTRACT_VERSION)throw new Error("WeatherContract v2 package required");
  const body=JSON.stringify(pkg);
  if(globalThis.caches){
    const cache=await caches.open(WEATHER_CACHE_NAME);
    await cache.put(cacheUrl(pkg.contract_id),new Response(body,{headers:{"content-type":"application/json"}}));
  }else{
    // Small-package fallback only; normal browsers have Cache Storage.
    if(body.length>1500000)throw new Error("Cache Storage unavailable and contract is too large for localStorage");
    localStorage.setItem("factiun_weather_contract_inline_v2:"+pkg.contract_id,body);
  }
  const ref={
    schema_version:WEATHER_CONTRACT_VERSION,
    contract_id:pkg.contract_id,
    dataset_hash:pkg.qa?.dataset_hash||null,
    kind:pkg.kind,
    site:pkg.site,
    source:pkg.source,
    temporal:pkg.temporal,
    qa:pkg.qa,
    uncertainty:pkg.uncertainty,
    activated_at_utc:nowIso()
  };
  if(activate)localStorage.setItem(WEATHER_ACTIVE_KEY,JSON.stringify(ref));
  return ref;
}
export function activeWeatherRef(){
  try{return JSON.parse(localStorage.getItem(WEATHER_ACTIVE_KEY)||"null");}
  catch(e){return null;}
}
export async function loadWeatherContract(contractId){
  if(!contractId)return null;
  if(globalThis.caches){
    try{
      const cache=await caches.open(WEATHER_CACHE_NAME),r=await cache.match(cacheUrl(contractId));
      if(r)return await r.json();
    }catch(e){}
  }
  try{return JSON.parse(localStorage.getItem("factiun_weather_contract_inline_v2:"+contractId)||"null");}
  catch(e){return null;}
}
export async function loadActiveWeatherContract(){
  const ref=activeWeatherRef();
  if(!ref?.contract_id)return null;
  const pkg=await loadWeatherContract(ref.contract_id);
  if(!pkg)return null;
  if(pkg.schema_version!==WEATHER_CONTRACT_VERSION)throw new Error("Unsupported WeatherContract schema "+pkg.schema_version);
  return pkg;
}
export async function clearActiveWeatherContract(){
  const ref=activeWeatherRef();
  localStorage.removeItem(WEATHER_ACTIVE_KEY);
  if(ref?.contract_id&&globalThis.caches){
    try{const cache=await caches.open(WEATHER_CACHE_NAME);await cache.delete(cacheUrl(ref.contract_id));}catch(e){}
  }
}
export function rowsForConsumer(pkg,{start=null,end=null,fields=null}={}){
  if(!pkg?.rows)return [];
  const a=start?Date.parse(start):-Infinity,b=end?Date.parse(end):Infinity;
  const wanted=fields?.length?new Set(["t",...fields]):null;
  return pkg.rows.filter(r=>{
    const t=Date.parse(r.t);return t>=a&&t<=b;
  }).map(r=>{
    if(!wanted)return {...r};
    const o={};for(const k of wanted)if(k in r)o[k]=r[k];return o;
  });
}
export function weatherManifest(pkg){
  if(!pkg)return null;
  const {rows,...manifest}=pkg;
  return {...manifest,rows_count:rows?.length||0};
}
export function browserConsumerStamp(pkg,consumer){
  return {
    consumer,
    contract_version:pkg?.schema_version||null,
    contract_id:pkg?.contract_id||null,
    dataset_hash:pkg?.qa?.dataset_hash||null,
    source_id:pkg?.source?.id||null,
    timezone:pkg?.site?.timezone||pkg?.temporal?.timezone||null,
    rows:pkg?.rows?.length||0
  };
}
