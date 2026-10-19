/* Factiun · WeatherNext 3 cache reader (forecast only).
 * Authenticated browser reads from RLS public.meteo_pronosticos.
 * One canonical plant identity: public.plantas.code. This is NOT telemetria.
 * p10/p50/p90 in the cache are already in consumer units (°C, W/m², mm).
 * Never send credentials to Google or double-convert units in the browser.
 */
import {normalizeMeteo} from "./meteo.js";

export const FORECAST_CACHE_ADAPTER_VERSION="1.0.0";
const SOURCE="weathernext3";
const validIso=s=>typeof s==="string"&&Number.isFinite(Date.parse(s));
const value=v=>typeof v==="number"&&Number.isFinite(v)?v:null;
const validCode=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,50}$/.test(v.trim());

export function normalizeCachedWeatherNext(row,site){
  if(!row||row.source_id!==SOURCE||!validIso(row.init_time)||!validIso(row.valid_time))
    throw Error("Fila de caché WeatherNext sin identidad/fecha válidas.");
  const p=row.p50||{},q10=row.p10||{},q90=row.p90||{};
  if((value(p.temp_c)===null&&value(p.wind_ms)===null)||
     !Number.isInteger(row.lead_hour)||row.lead_hour<1||row.lead_hour>360)
    throw Error("Pronóstico WeatherNext sin valores P50 ni horizonte válido.");
  const expected=Date.parse(row.init_time)+row.lead_hour*3600000;
  if(Math.abs(expected-Date.parse(row.valid_time))>1000)
    throw Error("Pronóstico WeatherNext con horas de inicialización incoherentes.");
  const provenance=row.provenance||{};
  if(!["GCS","BigQuery"].includes(provenance.surface))
    throw Error("Pronóstico sin origen de Google verificable.");
  return normalizeMeteo({
    source:SOURCE,timestamp:new Date(row.valid_time).toISOString(),
    lat:site.lat,lon:site.lng,
    temp_c:value(p.temp_c),dewpoint_c:value(p.dewpoint_c),
    wind_ms:value(p.wind_ms),wind100_ms:value(p.wind100_ms),
    wind_dir_deg:value(p.wind_dir_deg),
    ghi_wm2:value(p.ghi_wm2),fdir_wm2:value(p.fdir_wm2),
    cloud_total:value(p.cloud_total),cloud_low:value(p.cloud_low),
    cloud_mid:value(p.cloud_mid),cloud_high:value(p.cloud_high),
    precip_mm:value(p.precip_mm),pressure_hpa:value(p.pressure_hpa),
    p10:Object.keys(q10).length?q10:null,
    p50:Object.keys(p).length?p:null,
    p90:Object.keys(q90).length?q90:null,
    provenance:{
      ...provenance,provider:"Google WeatherNext 3",model:"WeatherNext 3",
      mode:"supabase-forecast-cache",source_id:SOURCE,
      run_time_utc:new Date(row.init_time).toISOString(),
      forecast_hour:row.lead_hour,
      cached_at_utc:row.ingested_at||null,
      plant_code:site.code,measurement:false
    }
  });
}

export async function fetchCachedWeatherNext(sb,{
  code,hours=72,maxAgeHours=18,now=Date.now()
}={}){
  if(!validCode(code))throw Error("Selecciona una planta de la Cartera con código válido.");
  if(!sb?.auth||!sb?.from)throw Error("Inicia sesión en Supabase para leer previsiones.");
  const user=await sb.auth.getUser();
  if(user.error||!user.data?.user)throw Error("Inicia sesión en Supabase para consultar WeatherNext.");
  const plantQuery=await sb.from("plantas").select("id,code,lat,lng")
    .eq("code",code.trim()).limit(2);
  if(plantQuery.error)throw plantQuery.error;
  if(plantQuery.data?.length!==1)throw Error("La planta no tiene identidad única en Supabase.");
  const site=plantQuery.data[0];
  if(!Number.isFinite(Number(site.lat))||!Number.isFinite(Number(site.lng)))
    throw Error("La planta carece de coordenadas oficiales.");
  const limit=Math.max(1,Math.min(72,Number(hours)||72));
  const newest=await sb.from("meteo_pronosticos").select("init_time")
    .eq("planta_id",site.id).eq("source_id",SOURCE)
    .order("init_time",{ascending:false}).limit(1);
  if(newest.error)throw newest.error;
  const init=newest.data?.[0]?.init_time;
  if(!validIso(init))return {status:"empty",rows:[],site,init_time:null};
  const ageHours=(Number(now)-Date.parse(init))/3600000;
  if(!Number.isFinite(ageHours)||ageHours< -1||ageHours>maxAgeHours)
    return {status:"stale",rows:[],site,init_time:init,ageHours};
  const from=new Date(Number(now)-3600000).toISOString();
  const data=await sb.from("meteo_pronosticos")
    .select("source_id,init_time,valid_time,lead_hour,p10,p50,p90,provenance,ingested_at")
    .eq("planta_id",site.id).eq("source_id",SOURCE)
    .eq("init_time",init)
    .gte("valid_time",from)
    .order("valid_time",{ascending:true}).limit(limit);
  if(data.error)throw data.error;
  const rows=(data.data||[]).map(row=>normalizeCachedWeatherNext(row,site));
  if(!rows.length)return {status:"empty",rows:[],site,init_time:init};
  return {status:"ready",rows,site,init_time:init,ageHours};
}
