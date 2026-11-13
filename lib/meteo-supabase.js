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
        const second=t[i],value=(cfg.variable==="snow_alarm"||cfg.unit==="boolean") && typeof data[i]==="boolean"?(data[i]?1:0):data[i];
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
const METEO_CLASSES=["hsu","wfu","sensores"];

/* Plantas que tienen medidas en la base, por orden alfabético.
 * La API no ofrece DISTINCT: se salta de nombre en nombre («la primera planta
 * posterior a la última vista»), una consulta corta por planta. */
export async function fetchSupabasePlants(sb,{max=60}={}){
  if(!sb?.auth||!sb?.from)throw new Error("Conecta primero con Supabase.");
  const out=[];
  for(let last="";out.length<max;){
    let q=sb.from("telemetria").select("planta").in("clase",METEO_CLASSES);
    if(last)q=q.gt("planta",last);
    const {data,error}=await q.order("planta",{ascending:true}).limit(1);
    if(error)throw error;
    const name=data?.[0]?.planta;
    if(typeof name!=="string"||!name||name<=last)break;
    out.push(name);last=name;
  }
  return out;
}

/* Primer y último día con medidas de una planta, para decir qué periodo se puede pedir. */
export async function fetchSupabasePlantRange(sb,plant){
  if(!sb?.auth||!sb?.from)throw new Error("Conecta primero con Supabase.");
  const edge=async ascending=>{
    const {data,error}=await sb.from("telemetria").select("dia").eq("planta",plant)
      .in("clase",METEO_CLASSES).order("dia",{ascending}).limit(1);
    if(error)throw error;
    return data?.[0]?.dia||"";
  };
  const [from,to]=[await edge(true),await edge(false)];
  return isoDate(from)&&isoDate(to)?{from,to}:null;
}

/* Casa el nombre que trae la página (el del proyecto abierto) con los de la base.
 *   exact — el mismo nombre, salvo mayúsculas, tildes o espacios: se puede usar sin preguntar.
 *   near  — único nombre que contiene al otro por palabras enteras («Ayora I» ↔ «Ayora»):
 *           solo se sugiere, porque puede ser otra planta. */
const plantKey=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function matchSupabasePlant(name,plants){
  const list=[...(plants||[])],key=plantKey(name);
  if(!key)return {exact:"",near:""};
  if(list.includes(name))return {exact:name,near:""};
  const same=list.filter(p=>plantKey(p)===key);
  if(same.length===1)return {exact:same[0],near:""};
  const mine=" "+key+" ";
  const near=same.length?[]:list.filter(p=>{const k=" "+plantKey(p)+" ";return k.trim()&&(mine.includes(k)||k.includes(mine));});
  return {exact:"",near:near.length===1?near[0]:""};
}

export async function fetchSupabaseMeteo(sb,{plant,from="",to="",pageSize=30,maxDays=370,onProgress}={}){
  if(!sb?.auth||!sb?.from)throw new Error("Conecta primero con Supabase.");
  if(!plant?.trim())throw new Error("Selecciona una planta.");
  const {data:user,error:userError}=await sb.auth.getUser();
  if(userError||!user?.user)throw new Error("Necesitas iniciar sesión para acceder al histórico.");
  const classes=METEO_CLASSES;
  if(!to){
    const {data:latest,error}=await sb.from("telemetria").select("dia").eq("planta",plant)
      .in("clase",classes).order("dia",{ascending:false}).limit(1);
    if(error)throw error;
    to=latest?.[0]?.dia||"";
    // Sin ninguna fila no hay «últimos días» que proponer: el problema es la planta, no las fechas.
    if(!to)throw new Error("La base no tiene medidas de «"+plant+"». Revisa el nombre exacto de la planta.");
  }
  if(!from&&isoDate(to))from=isoUtc(dateMs(to)-6*86400000);
  if(!isoDate(from)||!isoDate(to)||!Number.isFinite(dateMs(from))||!Number.isFinite(dateMs(to))||dateMs(from)>dateMs(to))throw new Error("Periodo de fechas inválido.");
  const days=Math.round((dateMs(to)-dateMs(from))/86400000)+1;
  if(days>maxDays)throw new Error("Has pedido "+days+" días y aquí se cargan como máximo "+maxDays+" de una vez: acorta «Desde» o «Hasta». "+
    "La lógica de viento no necesita esta carga: «Simular lógica» lee todo el histórico de la base.");
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

/* Sólo el VIENTO MÁXIMO de las HSU, para la lógica de viento (pre-stow / stow).
 *
 * fetchSupabaseMeteo trae todas las magnitudes y las convierte en lecturas sueltas
 * en memoria: por eso tiene tope de días. Aquí se pide a la base únicamente el eje
 * de tiempos y `wind_speed_max` de cada HSU-día, y cada página se entrega a quien
 * llama (onRows) en vez de acumularse. Así NO hace falta tope de periodo: sin
 * fechas se recorre todo el histórico de la planta.
 *
 * Se avanza POR FECHA (dia > último día completo), no por desplazamiento: con
 * `range(offset)` la base vuelve a leer y a abrir el JSON de todo lo anterior en
 * cada página, y a partir de unos cientos de días se va al tiempo máximo de consulta.
 * Como una página llena puede cortar su último día, ese día se descarta y se vuelve
 * a pedir entero; si un solo día llena la página, ese día se termina por desplazamiento.
 *
 * Medido en la base de Factiun (12/11/2026): abrir el JSON de un HSU-día cuesta entre
 * 10 y 30 ms y el rol `authenticated` corta a los 8 s; de ahí las 80 filas por página.
 * Si aun así la base corta por tiempo, se repite con media página. Si no admite la
 * selección parcial del JSON, se pide la serie entera en páginas pequeñas: mismo
 * resultado, más lento.
 */
export const SUPABASE_WIND_PEAK_SELECT = "id,planta,ncu,equipo,clase,dia,tz,subido,t:series->t,vmax:series->v->wind_speed_max";
const WIND_PEAK_FULL_SELECT = "id,planta,ncu,equipo,clase,dia,tz,subido,series";
const statementTimeout=e=>e?.code==="57014"||/statement timeout/i.test(String(e?.message||""));
export async function fetchSupabaseWindPeak(sb,{plant,from="",to="",pageSize=80,onRows,onProgress}={}){
  if(!sb?.auth||!sb?.from)throw new Error("Conecta primero con Supabase.");
  if(!plant?.trim())throw new Error("Selecciona una planta.");
  const {data:user,error:userError}=await sb.auth.getUser();
  if(userError||!user?.user)throw new Error("Necesitas iniciar sesión para acceder al histórico.");
  if((from&&!isoDate(from))||(to&&!isoDate(to))||(from&&to&&dateMs(from)>dateMs(to)))throw new Error("Periodo de fechas inválido.");
  let columns=SUPABASE_WIND_PEAK_SELECT,limit=Math.max(20,Math.min(500,pageSize)),rows=0,first="",last="";
  /* Una página: después del día `after`, o el día `day` a partir de `offset`. Devuelve también el tamaño pedido. */
  const ask=async({after="",day="",offset=0})=>{
    for(;;){
      let q=sb.from("telemetria").select(columns).eq("planta",plant).in("clase",["hsu"]);
      if(day)q=q.eq("dia",day);
      else{
        if(after)q=q.gt("dia",after);else if(from)q=q.gte("dia",from);
        if(to)q=q.lte("dia",to);
      }
      const {data,error}=await q.order("dia",{ascending:true}).order("id",{ascending:true}).range(offset,offset+limit-1);
      if(!error){
        if(!Array.isArray(data))throw Error("Respuesta de Supabase incompleta.");
        return {data,limit};
      }
      if(statementTimeout(error)){
        if(limit<=20)throw error;
        limit=Math.max(20,Math.floor(limit/2));continue;
      }
      if(columns===SUPABASE_WIND_PEAK_SELECT&&!rows){columns=WIND_PEAK_FULL_SELECT;limit=Math.min(limit,40);continue;}
      throw error;
    }
  };
  const give=data=>{
    if(!data.length)return;
    first=first||data[0].dia;last=data[data.length-1].dia;rows+=data.length;
    onRows?.(data);onProgress?.(rows,last);
  };
  for(let after="";;){
    const {data,limit:asked}=await ask({after});
    if(!data.length)break;
    const full=data.length>=asked,lastDay=data[data.length-1].dia,cut=full?data.findIndex(r=>r.dia===lastDay):-1;
    if(!full){give(data);break;}
    if(cut>0){give(data.slice(0,cut));after=data[cut-1].dia;continue;}   // el último día puede venir cortado
    give(data);                                                          // un solo día llena la página
    for(let offset=data.length;;){
      const more=await ask({day:lastDay,offset});
      give(more.data);offset+=more.data.length;
      if(more.data.length<more.limit)break;
    }
    after=lastDay;
  }
  return {plant,from:from||first,to:to||last,databaseRows:rows,partialSelect:columns===SUPABASE_WIND_PEAK_SELECT};
}
