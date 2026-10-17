/* FACTIUN · Lectura de sensores reales desde Supabase.
 * SOLO LECTURA: cliente browser con clave publicable y sesión autenticada.
 * RLS del proyecto exige authenticated para public.telemetria.
 * Sin service_role, sin credenciales privadas en GitHub.
 */
export const SUPABASE_URL = "https://icqiwmbbeoeswbcbgflc.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lOmQfLA1rv7Jg0N3vjzcOA_qnbatn2p";
export const SUPABASE_METEO_ADAPTER_VERSION = "1.0.0";

const TYPES = Object.freeze({
  wind_speed:      {variable:"wind_speed", unit:"m/s", family:"Anemómetros"},
  wind_speed_max:  {variable:"wind_peak", unit:"m/s", family:"Anemómetros"},
  wind_direction:  {variable:"wind_direction", unit:"°", family:"Anemómetros"},
  irradiance:      {variable:"irradiance_raw", unit:"raw", family:"Irradiancia · escala no validada"},
  snow_level:      {variable:"snow_level", unit:"raw", family:"Nieve"},
  snow_alarm:      {variable:"snow_alarm", unit:"boolean", family:"Nieve"},
  wind_alarm:      {variable:"wind_alarm", unit:"boolean", family:"Anemómetros"},
  gusty_wind_alarm:{variable:"gusty_wind_alarm",unit:"boolean",family:"Anemómetros"},
  snow_sensor_com_error:{variable:"snow_sensor_com_error",unit:"boolean",family:"Nieve"}
});
const isoDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||""));
const dateMs=d=>Date.parse(d+"T00:00:00Z");
const isoUtc=d=>new Date(d).toISOString().slice(0,10);
const validNumber=x=>typeof x==="number"&&Number.isFinite(x);
const identity=row=>[row.planta,row.ncu,row.equipo,row.clase,row.dia].join("\u241f");

export function newSupabaseMeteoClient(){
  if(!globalThis.supabase?.createClient)throw new Error("No se ha cargado el cliente de Supabase.");
  return globalThis.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
    auth:{storageKey:"factiun_meteo_auth_v1",persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
  });
}
export function normalizeSupabaseMeteo(rows){
  // La misma identidad/día puede importarse de nuevo; elegir último upload.
  // No sumar nunca ambas versiones.
  const byKey=new Map(),diagnostics={
    repeatedUploads:0,withoutUtc:0,invalidSeries:0,missingValues:0,scalarPlaceholders:0,
    unknownTypes:new Set(),byClass:{},rawCsvRows:0,minuteSeriesPoints:0,negativeIrradiance:0
  };
  for(const row of rows||[]){
    const key=identity(row),old=byKey.get(key);
    if(old){
      diagnostics.repeatedUploads++;
      const newer=String(row.subido||"")>String(old.subido||"") ||
        (String(row.subido||"")===String(old.subido||"") && Number(row.id)>Number(old.id));
      if(newer)byKey.set(key,row);
    }else byKey.set(key,row);
  }
  const records=[],sources=[];
  for(const row of byKey.values()){
    if(row.tz!=="UTC"){diagnostics.withoutUtc++;continue;}
    const t=row.series?.t,v=row.series?.v;
    if(!Array.isArray(t)||typeof v!=="object"||!v){diagnostics.invalidSeries++;continue;}
    diagnostics.byClass[row.clase]=(diagnostics.byClass[row.clase]||0)+1;
    if(Number.isFinite(+row.filas))diagnostics.rawCsvRows+=Number(row.filas);
    diagnostics.minuteSeriesPoints+=t.length;
    sources.push({planta:row.planta,ncu:row.ncu,equipo:row.equipo,clase:row.clase,dia:row.dia,
      paso_s:row.paso_s,filas:row.filas,minute_points:t.length,fuente:row.fuente});
    const start=dateMs(row.dia);
    if(!Number.isFinite(start)){diagnostics.invalidSeries++;continue;}
    for(const [field,data] of Object.entries(v)){
      const cfg=TYPES[field];
      if(!cfg){diagnostics.unknownTypes.add(field);continue;}
      // IMPORTANTE: escalares como irradiance=0 en HSU son placeholders de
      // esquema, NO 1.440 mediciones reales de cero.
      if(!Array.isArray(data)){diagnostics.scalarPlaceholders++;continue;}
      if(data.length!==t.length){diagnostics.invalidSeries++;continue;}
      for(let i=0;i<t.length;i++){
        const second=t[i],value=data[i];
        if(!validNumber(second)||second<0||second>=86400||!validNumber(value)){
          diagnostics.missingValues++;continue;
        }
        if(cfg.variable==="irradiance_raw"&&value<0)diagnostics.negativeIrradiance++;
        if(cfg.variable==="snow_alarm"&&value!==0&&value!==1){diagnostics.missingValues++;continue;}
        records.push({t:new Date(start+second*1000).toISOString(),plant:row.planta,ncu:row.ncu,
          sensor:row.equipo,variable:cfg.variable,unit:cfg.unit,value,group:"",mounting:"",window:"",
          source:"Supabase · "+row.clase+" · "+row.fuente,family:cfg.family});
      }
    }
  }
  diagnostics.unknownTypes=[...diagnostics.unknownTypes].sort();
  return {records,diagnostics,sources};
}
export async function fetchSupabaseMeteo(sb,{plant,from="",to="",pageSize=30,maxDays=370,onProgress}={}){
  if(!sb?.auth||!sb?.from)throw new Error("Conecta primero con Supabase.");
  if(!plant?.trim())throw new Error("Selecciona una planta.");
  const {data:user,error:userError}=await sb.auth.getUser();
  if(userError||!user?.user)throw new Error("Necesitas iniciar sesión para acceder al histórico.");
  const classes=["hsu","wfu","sensores"];
  if(!to){
    const {data:latest,error}=await sb.from("telemetria").select("dia").eq("planta",plant)
      .in("clase",classes).order("dia",{ascending:false}).limit(1);
    if(error)throw error;
    to=latest?.[0]?.dia||"";
  }
  if(!from&&isoDate(to))from=isoUtc(dateMs(to)-6*86400000);
  if(!isoDate(from)||!isoDate(to)||dateMs(from)>dateMs(to))throw new Error("Periodo de fechas inválido.");
  const days=Math.round((dateMs(to)-dateMs(from))/86400000)+1;
  if(days>maxDays)throw new Error("Selecciona un periodo de como máximo "+maxDays+" días.");
  const out=[];const limit=Math.max(10,Math.min(75,pageSize));
  for(let offset=0;offset<6000;offset+=limit){
    const {data,error}=await sb.from("telemetria")
      .select("id,planta,ncu,equipo,clase,dia,tz,paso_s,filas,cobertura,fuente,hash,subido,series")
      .eq("planta",plant).in("clase",classes)
      .gte("dia",from).lte("dia",to)
      .order("dia",{ascending:true}).order("id",{ascending:true})
      .range(offset,offset+limit-1);
    if(error)throw error;
    if(!Array.isArray(data))throw Error("Respuesta de Supabase incompleta.");
    out.push(...data);onProgress?.(out.length);
    if(data.length<limit)break;
    if(offset+limit>=6000)throw Error("El periodo supera el límite seguro de carga; acorta las fechas.");
  }
  const normalized=normalizeSupabaseMeteo(out);
  return {...normalized,plant,from,to,databaseRows:out.length};
}
