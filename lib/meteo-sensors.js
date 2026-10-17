/* FACTIUN · Análisis de sensores REALES (no modelos ni series sintéticas).
 * Procesa exportaciones SCADA/registrador en el navegador. No envía datos a terceros.
 * Identidad: planta + NCU + sensor + magnitud + unidad + instante observado.
 */
export const SENSOR_ANALYSIS_VERSION = "1.0.0";

const ALIASES = {
  ghi:"ghi",ghi_wm2:"ghi",global_horizontal:"ghi",global_horizontal_irradiance:"ghi",
  poa:"poa",poa_wm2:"poa",plane_of_array:"poa",
  dni:"dni",dni_wm2:"dni",dhi:"dhi",dhi_wm2:"dhi",
  wind_speed:"wind_speed",wind_ms:"wind_speed",wind_speed_ms:"wind_speed",velocidad_viento:"wind_speed",viento:"wind_speed",
  wind_gust:"wind_gust",wind_gust_ms:"wind_gust",gust:"wind_gust",gust_speed:"wind_gust",racha:"wind_gust",racha_viento:"wind_gust",
  wind_direction:"wind_direction",direccion_viento:"wind_direction",
  irradiance:"irradiance_raw",irradiance_raw:"irradiance_raw",wind_speed_max:"wind_peak",
  snow_alarm:"snow_alarm",alarm_snow:"snow_alarm",snow_detected:"snow_alarm",deteccion_nieve:"snow_alarm",alarma_nieve:"snow_alarm",
  snow_depth:"snow_depth",espesor_nieve:"snow_depth",snow_depth_cm:"snow_depth",
  snow_level:"snow_level",nivel_nieve:"snow_level",wind_level:"wind_level"
};
const FAMILIES = {ghi:"Piranómetros",poa:"Piranómetros",dni:"Piranómetros",dhi:"Piranómetros",irradiance_raw:"Irradiancia · escala no validada",
  wind_speed:"Anemómetros",wind_gust:"Anemómetros",wind_peak:"Anemómetros",wind_alarm:"Anemómetros",gusty_wind_alarm:"Anemómetros",
  wind_direction:"Anemómetros",wind_level:"Anemómetros",
  snow_alarm:"Nieve",snow_depth:"Nieve",snow_level:"Nieve"};
const IRRADIANCE = new Set(["ghi","poa","dni","dhi"]);
const WIND = new Set(["wind_speed","wind_gust","wind_peak"]);
const headerKey = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g,"");
const varKey = s => ALIASES[headerKey(s)] || headerKey(s);
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
const median = a => { if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y),i=b.length>>1;return b.length%2?b[i]:(b[i-1]+b[i])/2; };
const quantile = (a,p) => {if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y),x=(b.length-1)*p,i=Math.floor(x);return b[i]+(b[Math.min(i+1,b.length-1)]-b[i])*(x-i);};
const num = v => {
  if(typeof v === "number")return Number.isFinite(v)?v:null;
  const s=String(v??"").trim();if(!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(s))return null;
  const n=Number(s.replace(",","."));return Number.isFinite(n)?n:null;
};
function unitName(v) {
  const k=String(v||"").trim().toLowerCase().replace(/\s+/g,"").replace(/²/g,"2");
  return ({"w/m2":"W/m²","wm-2":"W/m²","kw/m2":"kW/m²","m/s":"m/s","ms-1":"m/s","km/h":"km/h","kmh":"km/h",
    "cm":"cm","mm":"mm","°":"°","deg":"°","degrees":"°","bool":"boolean","boolean":"boolean","0/1":"boolean"})[k] || String(v||"").trim();
}
function normalizedValue(variable, value, unit) {
  if(WIND.has(variable) && unit==="km/h")return {value:value/3.6,unit:"m/s"};
  if(IRRADIANCE.has(variable) && unit==="kW/m²")return {value:value*1000,unit:"W/m²"};
  if(variable==="snow_depth" && unit==="mm")return {value:value/10,unit:"cm"};
  return {value,unit};
}
function parseTime(value, undatedUtc) {
  const s=String(value??"").trim();
  if(!s)return null;
  const timeZoned = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  if(!timeZoned && undatedUtc!=="UTC")return null;
  const normalized = s.replace(" ","T")+(timeZoned?"":"Z");
  const ms=Date.parse(normalized);
  return Number.isFinite(ms)?new Date(ms).toISOString():null;
}
export function csvRows(text) {
  const str=String(text||"").replace(/^\uFEFF/,"");
  const header=(str.split(/\r?\n/,1)[0]||""); let delimiter=",";
  const scores=[",",";","\t"].map(c=>[c,header.split(c).length-1]);scores.sort((a,b)=>b[1]-a[1]);if(scores[0][1]>0)delimiter=scores[0][0];
  const out=[], row=[];let cur="",quoted=false;
  for(let i=0;i<str.length;i++){
    const c=str[i];
    if(c==='"'){if(quoted&&str[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;}
    else if(c===delimiter&&!quoted){row.push(cur);cur="";}
    else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&str[i+1]==="\n")i++;row.push(cur);cur="";if(row.some(x=>x.trim()!==""))out.push(row.splice(0));else row.length=0;}
    else cur+=c;
  }
  if(quoted)throw new Error("CSV con comillas sin cerrar.");
  row.push(cur);if(row.some(x=>x.trim()!==""))out.push(row);
  return out;
}
function column(hs,...names){return hs.findIndex(x=>names.includes(x));}
export function parseSensorCsv(text,{defaultPlant="",filename="",naiveTimezone="reject"}={}) {
  const csv=csvRows(text);if(csv.length<2)throw new Error("CSV sin filas medidas.");
  const headers=csv[0].map(headerKey),cols=csv[0];
  const tix=column(headers,"timestamp","time","datetime","fecha_hora","fecha","observed_at_utc","time_utc","date");
  if(tix<0)throw new Error("Falta timestamp/observed_at_utc; no se puede reconstruir el tiempo.");
  const pix=column(headers,"plant","planta","site","site_id","plant_id");
  const nix=column(headers,"ncu","ncu_id");
  const six=column(headers,"sensor","sensor_id","device","device_id","equipo","hsu","rsu");
  const vix=column(headers,"variable","field","metric","magnitud","parametro","tag");
  const xix=column(headers,"value","valor","measurement_value","_value");
  const uix=column(headers,"unit","unidad","units");
  const gix=column(headers,"comparison_group","grupo_comparacion","group");
  const qix=column(headers,"quality","calidad");
  const fix=column(headers,"mounting","orientacion","plane","plano","height_m","altura_m");
  const wix=column(headers,"averaging_window","ventana_media","window");
  const isLong=six>=0&&vix>=0&&xix>=0;
  const wide=[];
  if(!isLong){
    cols.forEach((name,i)=>{
      if(i===tix||i===pix||i===nix||i===gix||i===qix||i===fix||i===wix)return;
      const m=String(name).trim().match(/^(.+?)(?:\.|__|:)([a-zA-Z][a-zA-Z0-9_-]*)(?:\s*\[([^\]]+)\])?$/);
      if(!m)return;
      const variable=varKey(m[2]);
      if(!FAMILIES[variable])return;
      const implied=/_(?:wm2)$/.test(headerKey(m[2]))?"W/m²":"";
      wide.push({i,sensor:m[1].trim(),variable,unit:unitName(m[3]||implied)});
    });
    if(!wide.length)throw new Error("Formato no reconocido. Usa formato largo timestamp,plant,ncu,sensor,variable,value,unit o ancho PIR01.ghi[W/m2].");
  }
  const out=[], warnings={badTime:0,badValue:0,badQuality:0,badIdentity:0,assignedPlant:0};
  for(const r of csv.slice(1)){
    const t=parseTime(r[tix],naiveTimezone);
    if(!t){warnings.badTime++;continue;}
    const plant=String(pix>=0?r[pix]||"":defaultPlant).trim();
    if(!plant){warnings.badIdentity++;continue;}
    if(pix<0)warnings.assignedPlant++;
    const ncu=String(nix>=0?r[nix]||"":"").trim();
    const group=String(gix>=0?r[gix]||"":"").trim();
    const mounting=String(fix>=0?r[fix]||"":"").trim();
    const window=String(wix>=0?r[wix]||"":"").trim();
    const quality=String(qix>=0?r[qix]||"":"").toLowerCase().trim();
    if(["missing","stale","clock_error","invalid","bad"].includes(quality)){warnings.badQuality++;continue;}
    const fields=isLong?[{sensor:r[six],variable:varKey(r[vix]),value:r[xix],unit:unitName(uix>=0?r[uix]:"")}]:wide.map(w=>({...w,value:r[w.i]}));
    for(const f of fields){
      const sensor=String(f.sensor||"").trim(),variable=f.variable;
      if(!sensor||!variable){warnings.badIdentity++;continue;}
      let value=num(f.value);
      if(variable==="snow_alarm"&&value===null){
        const bit=headerKey(f.value);
        if(["on","true","yes","si","active","activo"].includes(bit))value=1;
        if(["off","false","no","inactive","inactivo"].includes(bit))value=0;
      }
      if(value===null||(variable==="snow_alarm"&&value!==0&&value!==1)){warnings.badValue++;continue;}
      const normalized=normalizedValue(variable,value,f.unit||"");
      out.push({t,plant,ncu,sensor,variable,unit:normalized.unit,value:normalized.value,
        group,mounting,window,source:filename||"archivo medido",family:FAMILIES[variable]||"Otros"});
    }
  }
  if(!out.length)throw new Error("No hay muestras válidas. Comprueba zona horaria, IDs y columnas; los vacíos nunca se convierten en cero.");
  return {records:out,warnings,format:isLong?"largo":"ancho",totalRows:csv.length-1};
}
function circularMeanDegrees(v){
  const s=mean(v.map(x=>Math.sin(x*Math.PI/180))),c=mean(v.map(x=>Math.cos(x*Math.PI/180)));
  if(Math.hypot(s,c)<1e-12)return null;
  return (Math.atan2(s,c)*180/Math.PI+360)%360;
}
function standardDeviation(v){if(v.length<2)return null;const m=mean(v);return Math.sqrt(mean(v.map(x=>(x-m)**2)));}
function energyValid(rows,unit,metric){
  if(!IRRADIANCE.has(metric)||unit!=="W/m²"||rows.length<2)return null;
  const intervals=rows.slice(1).map((r,i)=>Date.parse(r.t)-Date.parse(rows[i].t)).filter(dt=>dt>0);
  const base=quantile(intervals,.25);if(!(base>0))return null;
  let sum=0,hours=0;
  for(let i=1;i<rows.length;i++){
    const dt=Date.parse(rows[i].t)-Date.parse(rows[i-1].t);
    if(dt<=0||dt>base*2.5)continue; // no integración a través de huecos
    const h=dt/3600000;
    sum+=((rows[i].value+rows[i-1].value)/2)*h/1000;hours+=h;
  }
  return {kwh_m2:sum,coverage_hours:hours};
}
function sensorStatistics(rows,key){
  const vals=rows.map(r=>r.value),ts=rows.map(r=>Date.parse(r.t));
  const diffs=ts.slice(1).map((t,i)=>(t-ts[i])/1000).filter(x=>x>0),cadence=quantile(diffs,.25);
  const gapList=cadence?diffs.filter(d=>d>cadence*2.5):[];
  const on=key.variable==="snow_alarm"?vals.filter(v=>v===1).length:null;
  let transitions=0;
  if(key.variable==="snow_alarm")for(let i=1;i<vals.length;i++)if(vals[i-1]===0&&vals[i]===1)transitions++;
  return {...key,count:vals.length,min:vals.reduce((a,b)=>Math.min(a,b),Infinity),max:vals.reduce((a,b)=>Math.max(a,b),-Infinity),mean:key.variable==="wind_direction"?circularMeanDegrees(vals):mean(vals),
    p50:median(vals),p95:quantile(vals,.95),p99:quantile(vals,.99),std:standardDeviation(vals),
    first:rows[0]?.t,last:rows.at(-1)?.t,cadence_s:cadence,gaps:gapList.length,
    largest_gap_s:gapList.length?Math.max(...gapList):null,
    on_pct:on===null?null:100*on/vals.length,transitions:transitions,
    energy:energyValid(rows,key.unit,key.variable)};
}
function matchPair(a,b,tolerance){
  const out=[];let i=0,j=0;
  while(i<a.length&&j<b.length){
    const ta=Date.parse(a[i].t),tb=Date.parse(b[j].t),d=ta-tb;
    if(Math.abs(d)<=tolerance){out.push([a[i].value,b[j].value,Math.abs(d)/1000]);i++;j++;}
    else if(d<0)i++;else j++;
  }
  return out;
}
function comparePair(a,b,toleranceMs){
  const overlap=matchPair(a.rows,b.rows,toleranceMs),n=overlap.length;
  if(!n)return {a:(a.key.ncu?a.key.ncu+"/":"")+a.key.sensor,b:(b.key.ncu?b.key.ncu+"/":"")+b.key.sensor,variable:a.key.variable,unit:a.key.unit,
    plant:a.key.plant,n:0,reason:"Sin puntos coincidentes"};
  const angle=a.key.variable==="wind_direction";
  const d=overlap.map(x=>angle?((x[0]-x[1]+540)%360)-180:x[0]-x[1]),ab=d.map(x=>Math.abs(x));
  const ma=mean(overlap.map(x=>x[0])),mb=mean(overlap.map(x=>x[1]));
  const sa=Math.sqrt(mean(overlap.map(x=>(x[0]-ma)**2))),sb=Math.sqrt(mean(overlap.map(x=>(x[1]-mb)**2)));
  const cov=mean(overlap.map(x=>(x[0]-ma)*(x[1]-mb)));
  const den=overlap.reduce((s,x)=>s+(Math.abs(x[0])+Math.abs(x[1]))/2,0);
  const metadataKnown=!!(a.key.group&&b.key.group||a.key.mounting&&b.key.mounting||a.key.window&&b.key.window);
  return {a:(a.key.ncu?a.key.ncu+"/":"")+a.key.sensor,b:(b.key.ncu?b.key.ncu+"/":"")+b.key.sensor,variable:a.key.variable,unit:a.key.unit,plant:a.key.plant,
    n,bias:mean(d),mae:mean(ab),rmse:Math.sqrt(mean(d.map(x=>x*x))),
    relative_difference_pct:!angle&&den>0?100*ab.reduce((s,x)=>s+x,0)/den:null,
    correlation:!angle&&n>=3&&sa>0&&sb>0?cov/(sa*sb):null,
    mismatch_pct:a.key.variable==="snow_alarm"?100*ab.filter(x=>x!==0).length/n:null,
    max_offset_s:overlap.reduce((m,x)=>Math.max(m,x[2]),0),metadataKnown,verdict:"Sin umbral de aceptación"};
}
export function analyzeSensorRecords(records,{plant="",variable="",start="",end="",toleranceSeconds=60}={}){
  const startMs=start?Date.parse(start+"T00:00:00Z"):-Infinity;
  const endMs=end?Date.parse(end+"T00:00:00Z")+86400000:Infinity;
  if(!(startMs<endMs))throw new Error("Periodo inválido.");
  const chosen=records.filter(r=>(!plant||r.plant===plant)&&(!variable||r.variable===variable)
    &&Date.parse(r.t)>=startMs&&Date.parse(r.t)<endMs);
  const groups=new Map(),dup={identical:0,conflicts:0};
  for(const r of chosen){
    const id=JSON.stringify([r.plant,r.ncu,r.sensor,r.variable,r.unit]);
    if(!groups.has(id))groups.set(id,{key:{plant:r.plant,ncu:r.ncu,sensor:r.sensor,variable:r.variable,
      unit:r.unit,group:r.group,mounting:r.mounting,window:r.window,family:r.family},records:new Map()});
    const g=groups.get(id),old=g.records.get(r.t);
    if(old===undefined)g.records.set(r.t,r);
    else if(old===null){dup.conflicts++;}
    else if(old.value===r.value){dup.identical++;}
    else {g.records.set(r.t,null);dup.conflicts++;}
  }
  const entries=Array.from(groups.values()).map(g=>({...g,rows:Array.from(g.records.values()).filter(Boolean)
    .sort((a,b)=>a.t.localeCompare(b.t))})).filter(x=>x.rows.length>0);
  const stats=entries.map(e=>sensorStatistics(e.rows,e.key)).sort((a,b)=>a.plant.localeCompare(b.plant)||a.variable.localeCompare(b.variable)||a.sensor.localeCompare(b.sensor));
  const comparisons=[];
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
    const a=entries[i],b=entries[j],ka=a.key,kb=b.key;
    if(ka.plant!==kb.plant||ka.variable!==kb.variable||ka.unit!==kb.unit||!ka.unit)continue;
    if(ka.sensor===kb.sensor&&ka.ncu===kb.ncu)continue;
    if(ka.group&&kb.group&&ka.group!==kb.group)continue;
    if(ka.mounting&&kb.mounting&&ka.mounting!==kb.mounting)continue;
    if(ka.window&&kb.window&&ka.window!==kb.window)continue;
    comparisons.push(comparePair(a,b,Math.max(0,Number(toleranceSeconds)||0)*1000));
  }
  return {stats,comparisons,entries,duplicates:dup,records_used:entries.reduce((s,x)=>s+x.rows.length,0),
    plant,variable,period:{start,end},toleranceSeconds,
    notice:"Observaciones reales importadas; diferencias orientativas, sin tolerancia ni veredicto de calibración."};
}
export function buildSensorChart(analysis,metric,maxBins=360){
  const entries=analysis.entries.filter(x=>x.key.variable===metric),all=entries.flatMap(x=>x.rows);
  if(!all.length)return {series:[],labels:[]};
  const times=all.map(x=>Date.parse(x.t)),lo=times.reduce((a,b)=>Math.min(a,b),Infinity),hi=times.reduce((a,b)=>Math.max(a,b),-Infinity);
  const count=Math.max(2,Math.min(maxBins,all.length)),span=Math.max(1,hi-lo);
  const series=entries.slice(0,8).map(e=>{
    const sums=Array(count).fill(0),ns=Array(count).fill(0);
    e.rows.forEach(r=>{const i=Math.min(count-1,Math.floor((Date.parse(r.t)-lo)/span*(count-1)));sums[i]+=r.value;ns[i]++;});
    return {label:(e.key.ncu?e.key.ncu+"/":"")+e.key.sensor,values:sums.map((x,i)=>ns[i]?x/ns[i]:null)};
  });
  const labels=Array(count).fill("");const fmt=t=>new Date(t).toISOString().slice(5,16).replace("T"," ");
  labels[0]=fmt(lo);labels[Math.floor((count-1)/2)]=fmt((lo+hi)/2);labels[count-1]=fmt(hi);
  return {series,labels,unit:entries[0]?.key.unit||"",note:"Gráfica: medias por intervalo, sin interpolar. Mínimos y máximos de la tabla proceden de lecturas originales."};
}
