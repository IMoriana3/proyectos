/* Factiun · WeatherEx Meteo experimental forecast adapter (GET JSON).
   DOCUMENTED endpoint only; no live API response or commercial rights certified.
   WEATHER informs; CONTROL decides.  Never infer absent units or fabricate gusts.
*/
export const WEATHEREX_API_URL = "https://meteo.weatherex.ai/api/forecast";
export const WEATHEREX_MODELS = Object.freeze({
  gfs:"GFS",ecmwf:"ECMWF",icon:"ICON"
});
const exactNumber=value=>{
  if(value==null||value==="")return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
};
const field=(r,...names)=>{
  for(const n of names)if(Object.prototype.hasOwnProperty.call(r,n))return exactNumber(r[n]);
  return null;
};
function utcTimestamp(row){
  const raw=row.timestamp_ist??row.timestamp??row.time;
  if(typeof raw!=="string"||!/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw))
    throw Error("WeatherEx: fecha sin zona horaria explícita; no se supondrá IST/UTC.");
  const ms=Date.parse(raw);
  if(!Number.isFinite(ms))throw Error("WeatherEx: fecha no válida.");
  return new Date(ms).toISOString();
}
function validateModel(model){
  const id=String(model??"").toLowerCase();
  if(!Object.hasOwn(WEATHEREX_MODELS,id))
    throw Error("WeatherEx: modelo no soportado por el adaptador: "+id);
  return id;
}
export function parseWeatherExForecast(payload,{model="gfs",lat,lon,normalizer=x=>x}={}){
  const name=validateModel(model);
  if(!Number.isFinite(Number(lat))||Math.abs(Number(lat))>90||
     !Number.isFinite(Number(lon))||Math.abs(Number(lon))>180)
    throw Error("WeatherEx: coordenadas fuera de rango.");
  if(!payload||payload.success===false||!Array.isArray(payload.models))
    throw Error("WeatherEx: JSON no coincide con el contrato documentado.");
  const selection=payload.models.find(m=>String(m?.model??"").toLowerCase()===name);
  if(!selection||!Array.isArray(selection.rows)||selection.rows.length===0)
    throw Error("WeatherEx: sin filas para modelo "+name+".");
  const retrieved=new Date().toISOString();
  const rows=selection.rows.map(r=>{
    if(!r||typeof r!=="object")throw Error("WeatherEx: fila inválida.");
    const cloudFraction=field(r,"cloud_cover_fraction","cloud_fraction");
    const cloudPercent=field(r,"cloud_cover_pct","cloud_cover_percent");
    return normalizer({
      source:"weatherex",timestamp:utcTimestamp(r),lat:Number(lat),lon:Number(lon),
      temp_c:field(r,"temperature","temperature_c"),
      // Only fields with explicit units in their key are admitted.
      wind_ms:field(r,"wind_ms","wind_speed_ms","wind_speed_10m_ms"),
      wind_dir_deg:field(r,"wind_dir_deg","wind_direction_deg"),
      gust_ms:field(r,"gust_ms","wind_gust_ms","wind_gusts_10m_ms"),
      ghi_wm2:field(r,"ghi_wm2","ghi_w_m2"),
      dni_wm2:field(r,"dni_wm2","dni_w_m2"),
      dhi_wm2:field(r,"dhi_wm2","dhi_w_m2"),
      precip_mm:field(r,"precipitation_mm","precip_mm"),
      cloud_total:cloudFraction??(cloudPercent==null?null:cloudPercent/100),
      pressure_hpa:field(r,"pressure_hpa"),
      provenance:{
        provider:"WeatherEx Meteo",source_id:"weatherex",model:name,
        mode:"forecast",retrieved_at_utc:retrieved,
        validation_level:"documented schema / not live-verified",
        raw_precipitation_without_interval_unit:field(r,"precipitation"),
        notice:"Unlabelled wind/solar/precipitation fields intentionally not used."
      }
    });
  }).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
  // Weather Workbench's 72/360 controls count hours, not observations.
  for(let i=1;i<rows.length;i++){
    const delta=Date.parse(rows[i].timestamp)-Date.parse(rows[i-1].timestamp);
    if(delta!==3600000)
      throw Error("WeatherEx: la serie no es horaria o tiene huecos (intervalo "+(delta/60000)+" min); no se interpolará.");
  }
  return rows;
}
export async function fetchWeatherExForecast({
  lat,lon,model="gfs",forecastDays=3,
  normalizer=x=>x,fetchImpl=globalThis.fetch
}={}){
  const id=validateModel(model),days=Number(forecastDays);
  if(!Number.isInteger(days)||days<1||days>16)
    throw Error("WeatherEx: horizonte de 1 a 16 días.");
  if(!Number.isFinite(Number(lat))||Math.abs(Number(lat))>90||
     !Number.isFinite(Number(lon))||Math.abs(Number(lon))>180)
    throw Error("WeatherEx: coordenadas fuera de rango.");
  if(typeof fetchImpl!=="function")throw Error("WeatherEx: fetch no disponible.");
  const url=new URL(WEATHEREX_API_URL);
  url.searchParams.set("latitude",String(lat));
  url.searchParams.set("longitude",String(lon));
  url.searchParams.set("models",id);
  // The vendor publicly documents these exact two variable identifiers only.
  url.searchParams.set("variables","temperature,precipitation");
  url.searchParams.set("forecast_days",String(days));
  let response;
  try{response=await fetchImpl(url.toString(),{method:"GET",headers:{Accept:"application/json"},cache:"no-store"});}
  catch(e){throw Error("WeatherEx: red o CORS no disponible ("+String(e?.message||e)+").");}
  if(!response?.ok)throw Error("WeatherEx HTTP "+(response?.status??"sin respuesta")+
    "; comprobar plan, autenticación, cuota y CORS.");
  let json;
  try{json=await response.json();}catch(e){throw Error("WeatherEx: respuesta no es JSON.");}
  return parseWeatherExForecast(json,{model:id,lat,lon,normalizer});
}
