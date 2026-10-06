/* Factiun · Weather Workbench browser core
   ---------------------------------------------------------------
   Implementación autónoma del dominio meteorológico que puede correr
   directamente en GitHub Pages. La física/control de otras tarjetas NO vive
   aquí: esta capa obtiene, normaliza, audita y prepara meteo.

   Regla: WEATHER informa; CONTROL decide.
*/
export const WORKBENCH_VERSION = "0.4.0";
export const TMY_WEIGHTS = Object.freeze({
  ghi_wm2:0.50, dni_wm2:0.25, dhi_wm2:0.25,
  temp_c:1.00, dewpoint_c:1.00, wind_ms:0.50
});
export const HAIL_HOTSPOTS = Object.freeze([
  [33,48,-105,-90,1.8],
  [43,47.5,7,14,1.2],
  [42,48,18,27,0.9],
  [-35,-29,-66,-58,1.5],
  [-29,-25,26,31,1.2],
  [22,27,88,93,1.0],
  [28,36,103,118,0.8]
]);

const R2D=180/Math.PI, D2R=Math.PI/180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>Number.isFinite(+v)?+v:null;
const bad=v=>v==null||!Number.isFinite(+v)||+v<=-900;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN;
const sum=a=>a.reduce((s,x)=>s+x,0);
const median=a=>{
  if(!a.length)return NaN;
  const b=a.slice().sort((x,y)=>x-y),m=Math.floor(b.length/2);
  return b.length%2?b[m]:(b[m-1]+b[m])/2;
};
const quantile=(a,q)=>{
  const b=a.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if(!b.length)return NaN;
  const p=(b.length-1)*q,i=Math.floor(p),f=p-i;
  return b[i]+(b[Math.min(i+1,b.length-1)]-b[i])*f;
};
const std=a=>{
  if(a.length<2)return 0; const m=mean(a);
  return Math.sqrt(mean(a.map(x=>(x-m)*(x-m))));
};
function pearson(a,b){
  const aa=[],bb=[];
  for(let i=0;i<Math.min(a.length,b.length);i++)if(Number.isFinite(a[i])&&Number.isFinite(b[i])){aa.push(a[i]);bb.push(b[i]);}
  if(aa.length<3)return 0;
  const ma=mean(aa),mb=mean(bb),sa=std(aa),sb=std(bb);
  if(!(sa>0&&sb>0))return 0;
  return mean(aa.map((x,i)=>(x-ma)*(bb[i]-mb)))/(sa*sb);
}
function cleanAngle(x){x%=360;if(x<0)x+=360;return x;}
function isoUtc(v){
  if(v instanceof Date)return v.toISOString();
  if(typeof v==="number")return new Date(v).toISOString();
  const s=String(v||"").trim();
  if(!s)return null;
  if(/[zZ]$|[+-]\d\d:?\d\d$/.test(s)){
    const d=new Date(s);return isNaN(d)?null:d.toISOString();
  }
  let m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2})(?::(\d{1,2}))?/);
  if(m)return new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+(m[5]||0))).toISOString();
  m=s.match(/^(\d{8}):?(\d{2})(\d{2})?/);
  if(m){
    const z=m[1];
    return new Date(Date.UTC(+z.slice(0,4),+z.slice(4,6)-1,+z.slice(6,8),+m[2],+(m[3]||0))).toISOString();
  }
  const d=new Date(s);return isNaN(d)?null:d.toISOString();
}
function doy(d){
  const y=d.getUTCFullYear(),a=Date.UTC(y,0,1);
  return Math.floor((d.getTime()-a)/86400000)+1;
}
function isLeap(y){return y%4===0&&(y%100!==0||y%400===0);}
function deepCopyRow(r){return {...r};}

export function solarPosition(timestamp,lat,lon){
  const d=timestamp instanceof Date?timestamp:new Date(timestamp);
  const jd=d.getTime()/86400000+2440587.5;
  const n=jd-2451545.0;
  const L=cleanAngle(280.460+0.9856474*n)*D2R;
  const g=cleanAngle(357.528+0.9856003*n)*D2R;
  const lam=L+(1.915*Math.sin(g)+0.020*Math.sin(2*g))*D2R;
  const eps=(23.439-0.0000004*n)*D2R;
  const ra=Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam));
  const dec=Math.asin(Math.sin(eps)*Math.sin(lam));
  const gmst=cleanAngle((18.697374558+24.06570982441908*n)*15);
  let ha=cleanAngle(gmst+Number(lon)-ra*R2D);
  if(ha>180)ha-=360;
  const phi=Number(lat)*D2R,h=ha*D2R;
  const cosz=clamp(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(h),-1,1);
  const zen=Math.acos(cosz), el=Math.PI/2-zen;
  const az=Math.atan2(Math.sin(h),Math.cos(h)*Math.sin(phi)-Math.tan(dec)*Math.cos(phi))*R2D+180;
  return {zenith_deg:zen*R2D,elevation_deg:el*R2D,azimuth_deg:cleanAngle(az),cosz:Math.max(0,cosz)};
}
export function extraRadiation(timestamp){
  const d=timestamp instanceof Date?timestamp:new Date(timestamp);
  return 1366.1*(1+0.033*Math.cos(2*Math.PI*doy(d)/365));
}
export function clearSkyProxy(timestamp,lat,lon){
  const sp=solarPosition(timestamp,lat,lon);
  if(sp.cosz<=0)return 0;
  return 1000*Math.pow(sp.cosz,1.15);
}

async function cachedJson(url,{cacheName="factiun-meteo-http-v4",force=false}={}){
  let cache=null;
  try{if(!force&&globalThis.caches)cache=await caches.open(cacheName);}catch(e){}
  if(cache){
    try{
      const hit=await cache.match(url);
      if(hit)return await hit.json();
    }catch(e){}
  }
  const r=await fetch(url,{cache:force?"no-store":"default"});
  if(!r.ok)throw new Error("HTTP "+r.status+" · "+url);
  const clone=r.clone();
  if(cache){try{await cache.put(url,clone);}catch(e){}}
  return r.json();
}
export async function clearHttpCache(){
  if(!globalThis.caches)return false;
  return caches.delete("factiun-meteo-http-v4");
}

export function normalizeRow(x={}){
  const t=isoUtc(x.t??x.timestamp??x.time??x.datetime??x.date);
  return {
    t,
    ghi_wm2:finite(x.ghi_wm2??x.ghi??x.GHI??x["G(h)"]??x.shortwave_radiation),
    dni_wm2:finite(x.dni_wm2??x.dni??x.DNI??x["Gb(n)"]??x.direct_normal_irradiance),
    dhi_wm2:finite(x.dhi_wm2??x.dhi??x.DHI??x["Gd(h)"]??x.diffuse_radiation),
    temp_c:finite(x.temp_c??x.temp_air??x.T2m??x.T2M??x.temperature_2m),
    dewpoint_c:finite(x.dewpoint_c??x.temp_dew??x.dew_point_2m),
    wind_ms:finite(x.wind_ms??x.wind_speed??x.WS10m??x.WS10M??x.wind_speed_10m),
    wind_dir_deg:finite(x.wind_dir_deg??x.wind_dir??x.WD10M??x.wind_direction_10m),
    gust_ms:finite(x.gust_ms??x.wind_gusts_10m),
    rh_pct:finite(x.rh_pct??x.relative_humidity??x.RH??x.RH2M??x.relative_humidity_2m),
    pressure_hpa:finite(x.pressure_hpa??x.pressure??x.SP??x.PS??x.surface_pressure),
    precip_mm:finite(x.precip_mm??x.precipitation_mm??x.precipitation??x.PRECTOTCORR),
    rain_mm:finite(x.rain_mm??x.rain),
    snowfall_cm:finite(x.snowfall_cm??x.snowfall),
    snow_depth_m:finite(x.snow_depth_m??x.snow_depth),
    showers_mm:finite(x.showers_mm??x.showers),
    cape_jkg:finite(x.cape_jkg??x.cape),
    weather_code:finite(x.weather_code)
  };
}
export function normalizeRows(rows){
  return rows.map(normalizeRow).filter(r=>r.t).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
}

function extractJsonArray(text,marker="const SEED ="){
  const p=text.indexOf(marker); if(p<0)return null;
  const start=text.indexOf("[",p); if(start<0)return null;
  let depth=0,quote=null,esc=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];
    if(quote){
      if(esc){esc=false;continue;}
      if(ch==="\\"){esc=true;continue;}
      if(ch===quote)quote=null;
      continue;
    }
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==="[")depth++;
    else if(ch==="]"){depth--;if(depth===0)return text.slice(start,i+1);}
  }
  return null;
}
const TZ_COUNTRY={
  "España":"Europe/Madrid","Perú":"America/Lima","Italia":"Europe/Rome",
  "Túnez":"Africa/Tunis","República Dominicana":"America/Santo_Domingo"
};
export async function loadFactiunPlants(){
  const byCode=new Map();
  let local={};
  try{local=JSON.parse(localStorage.getItem("factiun_plantas")||"{}")||{};}catch(e){}
  Object.entries(local).forEach(([code,p])=>{
    if(p&&p.lat!=null&&p.lon!=null)byCode.set(String(code),{
      code:String(p.nproy||p.cod||code),carteraCode:String(code),
      name:p.nombre||String(code),lat:+p.lat,lon:+p.lon,pdc:finite(p.pdc),
      country:p.pais||"",location:p.pais||"",tz:TZ_COUNTRY[p.pais]||"UTC",source:"localStorage"
    });
  });
  try{
    const html=await fetch("cartera-tabla.html",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(r.status);return r.text();});
    const raw=extractJsonArray(html);
    const seed=raw?JSON.parse(raw):[];
    seed.forEach(p=>{
      if(p.num==null||p.lat==null||p.lon==null)return;
      const k=String(p.num),prior=byCode.get(k)||{};
      byCode.set(k,{
        code:String(prior.code||p.num),carteraCode:k,name:prior.name||p.proyecto||k,
        lat:prior.lat??+p.lat,lon:prior.lon??+p.lon,pdc:prior.pdc??finite(p.pdc),
        country:prior.country||p.pais||"",location:[p.emplazamiento,p.provincia,p.pais].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(" · "),
        tz:prior.tz&&prior.tz!=="UTC"?prior.tz:(TZ_COUNTRY[p.pais]||"UTC"),source:prior.source||"SEED"
      });
    });
  }catch(e){}
  return [...byCode.values()].sort((a,b)=>a.name.localeCompare(b.name,"es"));
}

function openMeteoUrl(lat,lon,y){
  const vars=[
    "shortwave_radiation","direct_normal_irradiance","diffuse_radiation",
    "temperature_2m","dew_point_2m","wind_speed_10m","wind_direction_10m",
    "relative_humidity_2m","surface_pressure","precipitation","rain",
    "snowfall","snow_depth","showers","cape","weather_code"
  ].join(",");
  return "https://archive-api.open-meteo.com/v1/archive?latitude="+encodeURIComponent(lat)+
    "&longitude="+encodeURIComponent(lon)+"&start_date="+y+"-01-01&end_date="+y+"-12-31"+
    "&hourly="+encodeURIComponent(vars)+"&wind_speed_unit=ms&timezone=UTC";
}
function parseOpenMeteo(j){
  const h=j.hourly||{},t=h.time||[],rows=[];
  for(let i=0;i<t.length;i++)rows.push(normalizeRow({
    t:t[i]+"Z",ghi_wm2:h.shortwave_radiation?.[i],dni_wm2:h.direct_normal_irradiance?.[i],
    dhi_wm2:h.diffuse_radiation?.[i],temp_c:h.temperature_2m?.[i],dewpoint_c:h.dew_point_2m?.[i],
    wind_ms:h.wind_speed_10m?.[i],wind_dir_deg:h.wind_direction_10m?.[i],
    rh_pct:h.relative_humidity_2m?.[i],pressure_hpa:h.surface_pressure?.[i],
    precip_mm:h.precipitation?.[i],rain_mm:h.rain?.[i],snowfall_cm:h.snowfall?.[i],
    snow_depth_m:h.snow_depth?.[i],showers_mm:h.showers?.[i],cape_jkg:h.cape?.[i],
    weather_code:h.weather_code?.[i]
  }));
  return rows;
}
export async function fetchOpenMeteoHistory(lat,lon,y0,y1,{progress}={}){
  const rows=[];
  for(let y=+y0;y<=+y1;y++){
    progress?.(y-y0+1,y1-y0+1,y);
    rows.push(...parseOpenMeteo(await cachedJson(openMeteoUrl(lat,lon,y))));
  }
  return {source:"Open-Meteo / ERA5",source_id:"openmeteo",lat:+lat,lon:+lon,year_start:+y0,year_end:+y1,rows};
}

function pvgisSeriesUrl(lat,lon,y){
  return "https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?lat="+encodeURIComponent(lat)+
    "&lon="+encodeURIComponent(lon)+"&startyear="+y+"&endyear="+y+
    "&angle=0&aspect=0&components=1&pvcalculation=0&usehorizon=1&outputformat=json";
}
function parsePvgisHourly(j,lat,lon){
  const h=j?.outputs?.hourly||[],rows=[];
  for(const x of h){
    const t=isoUtc(x.time||x["time(UTC)"]);
    if(!t)continue;
    const ghi=finite(x["G(i)"]??x["G(h)"]??x.GHI);
    const dhi=finite(x["Gd(i)"]??x["Gd(h)"]??x.DHI);
    let dni=finite(x["Gb(n)"]??x.DNI);
    if(dni==null){
      const bhi=finite(x["Gb(i)"]??x.BHI);
      if(bhi!=null){
        const c=solarPosition(t,lat,lon).cosz;
        dni=c>Math.sin(3*D2R)?clamp(bhi/c,0,1500):0;
      }
    }
    rows.push(normalizeRow({t,ghi_wm2:ghi,dni_wm2:dni,dhi_wm2:dhi,temp_c:x.T2m,wind_ms:x.WS10m}));
  }
  return rows;
}
export async function fetchPvgisHistory(lat,lon,y0,y1,{progress}={}){
  const rows=[];
  for(let y=+y0;y<=+y1;y++){
    progress?.(y-y0+1,y1-y0+1,y);
    rows.push(...parsePvgisHourly(await cachedJson(pvgisSeriesUrl(lat,lon,y)),lat,lon));
  }
  return {source:"PVGIS hourly",source_id:"pvgis",lat:+lat,lon:+lon,year_start:+y0,year_end:+y1,rows};
}
function nasaUrl(lat,lon,y){
  const pars="ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_SW_DIFF,T2M,WS10M,WD10M,RH2M,PS,PRECTOTCORR";
  return "https://power.larc.nasa.gov/api/temporal/hourly/point?parameters="+pars+
    "&community=RE&longitude="+encodeURIComponent(lon)+"&latitude="+encodeURIComponent(lat)+
    "&start="+y+"0101&end="+y+"1231&format=JSON&time-standard=UTC";
}
function parseNasa(j){
  const p=j?.properties?.parameter||{};
  const keys=Object.keys(p.ALLSKY_SFC_SW_DWN||{}).sort(),rows=[];
  for(const k of keys){
    const m=k.match(/^(\d{4})(\d{2})(\d{2})(\d{2})$/);if(!m)continue;
    const val=n=>{const v=p[n]?.[k];return bad(v)?null:+v;};
    rows.push(normalizeRow({
      t:new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4])).toISOString(),
      ghi_wm2:val("ALLSKY_SFC_SW_DWN"),dni_wm2:val("ALLSKY_SFC_SW_DNI"),dhi_wm2:val("ALLSKY_SFC_SW_DIFF"),
      temp_c:val("T2M"),wind_ms:val("WS10M"),wind_dir_deg:val("WD10M"),rh_pct:val("RH2M"),
      pressure_hpa:val("PS"),precip_mm:val("PRECTOTCORR")
    }));
  }
  return rows;
}
export async function fetchNasaHistory(lat,lon,y0,y1,{progress}={}){
  if(+y0<2001)throw new Error("NASA POWER horario solar está disponible desde 2001; ajusta el inicio.");
  const rows=[];
  for(let y=+y0;y<=+y1;y++){
    progress?.(y-y0+1,y1-y0+1,y);
    rows.push(...parseNasa(await cachedJson(nasaUrl(lat,lon,y))));
  }
  return {source:"NASA POWER",source_id:"nasa",lat:+lat,lon:+lon,year_start:+y0,year_end:+y1,rows};
}
export async function fetchHistorical({source,lat,lon,year_start,year_end,progress}){
  if(+year_end<+year_start)throw new Error("Hasta debe ser ≥ desde.");
  if(+year_end-+year_start>30)throw new Error("Limita el análisis a 31 años por corrida.");
  if(source==="pvgis")return fetchPvgisHistory(lat,lon,year_start,year_end,{progress});
  if(source==="nasa")return fetchNasaHistory(lat,lon,year_start,year_end,{progress});
  return fetchOpenMeteoHistory(lat,lon,year_start,year_end,{progress});
}

export function intervalHours(rows){
  if(rows.length<2)return 1;
  const ds=[];
  for(let i=1;i<Math.min(rows.length,1000);i++){
    const d=(Date.parse(rows[i].t)-Date.parse(rows[i-1].t))/3600000;
    if(d>0&&d<24)ds.push(d);
  }
  return median(ds)||1;
}
export function annualStats(rows){
  const by=new Map();
  for(const r of rows){
    const y=new Date(r.t).getUTCFullYear();
    if(!by.has(y))by.set(y,[]);by.get(y).push(r);
  }
  const out=[];
  for(const [year,a] of [...by.entries()].sort((x,y)=>x[0]-y[0])){
    const dt=intervalHours(a);
    const vals=k=>a.map(r=>r[k]).filter(Number.isFinite);
    const energy=k=>sum(vals(k).map(x=>Math.max(0,x)))*dt/1000;
    const precip=sum(vals("precip_mm").map(x=>Math.max(0,x)));
    const expected=(isLeap(year)?8784:8760)/dt;
    out.push({
      year,rows:a.length,completeness_pct:Math.min(100,100*a.length/expected),
      ghi_kwh_m2:energy("ghi_wm2"),dni_kwh_m2:energy("dni_wm2"),dhi_kwh_m2:energy("dhi_wm2"),
      temp_mean_c:mean(vals("temp_c")),wind_mean_ms:mean(vals("wind_ms")),
      precip_mm:precip
    });
  }
  const keys=["ghi_kwh_m2","temp_mean_c","wind_mean_ms","precip_mm"];
  const med={}; keys.forEach(k=>med[k]=median(out.map(r=>r[k]).filter(Number.isFinite)));
  out.forEach(r=>{
    const ds=[];
    for(const k of keys){
      const m=med[k],v=r[k];if(!Number.isFinite(m)||!Number.isFinite(v))continue;
      const floor=k==="temp_mean_c"?5:Math.max(Math.abs(m)*0.10,1);
      ds.push(Math.abs(v-m)/Math.max(Math.abs(m),floor));
    }
    r.annual_closeness_score=ds.length?mean(ds):null;
  });
  const valid=out.filter(r=>Number.isFinite(r.annual_closeness_score));
  return {annual:out,representative_year_screening:valid.length?valid.slice().sort((a,b)=>a.annual_closeness_score-b.annual_closeness_score)[0].year:null};
}

function cdfEmpirical(a,bins=50){
  const x=a.filter(Number.isFinite);
  if(x.length<2)return Array(bins).fill(1);
  const lo=Math.min(...x),hi=Math.max(...x),out=[];
  for(let i=0;i<bins;i++){
    const v=lo+(hi-lo)*(i/(bins-1));
    let n=0;for(const q of x)if(q<=v)n++;
    out.push(n/x.length);
  }
  return out;
}
function fsScore(obs,ref){
  const a=cdfEmpirical(obs),b=cdfEmpirical(ref);
  return mean(a.map((x,i)=>Math.abs(x-b[i])));
}
export function buildTmySandia(rows,{baseYear=2023,weights=TMY_WEIGHTS,minMonthRows=100,smooth=true,smoothWindowH=6}={}){
  const clean=rows.filter(r=>{
    const d=new Date(r.t);return !(d.getUTCMonth()===1&&d.getUTCDate()===29);
  });
  const years=[...new Set(clean.map(r=>new Date(r.t).getUTCFullYear()))].sort();
  if(years.length<2)throw new Error("TMY necesita al menos 2 años.");
  const months_selected={},fs_scores={};
  for(let m=0;m<12;m++){
    const all=clean.filter(r=>new Date(r.t).getUTCMonth()===m);
    let best=null,bestScore=Infinity;
    for(const y of years){
      const cand=all.filter(r=>new Date(r.t).getUTCFullYear()===y);
      if(cand.length<minMonthRows)continue;
      let st=0,sw=0;
      for(const [k,w] of Object.entries(weights)){
        const ref=all.map(r=>r[k]).filter(Number.isFinite),obs=cand.map(r=>r[k]).filter(Number.isFinite);
        if(ref.length<2||obs.length<2)continue;
        st+=w*fsScore(obs,ref);sw+=w;
      }
      const s=sw?st/sw:Infinity;
      if(s<bestScore){bestScore=s;best=y;}
    }
    if(best==null)best=years[0];
    months_selected[m+1]=best;fs_scores[m+1]=Number.isFinite(bestScore)?bestScore:null;
  }
  let out=[];
  for(let m=0;m<12;m++){
    const y=months_selected[m+1];
    for(const r of clean){
      const d=new Date(r.t);
      if(d.getUTCFullYear()!==y||d.getUTCMonth()!==m)continue;
      const rr=deepCopyRow(r);
      const nd=new Date(Date.UTC(baseYear,m,d.getUTCDate(),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds()));
      rr.t=nd.toISOString();out.push(rr);
    }
  }
  out.sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
  if(smooth)out=smoothMonthTransitions(out,smoothWindowH);
  return {rows:out,info:{method:"Sandia / Finkelstein-Schafer",months_selected,fs_scores,years,n_years:years.length,base_year:baseYear,rows:out.length}};
}
function smoothMonthTransitions(rows,windowH=6){
  if(!rows.length||windowH<=0)return rows;
  const out=rows.map(deepCopyRow);
  const trans=[];
  for(let i=1;i<out.length;i++)if(new Date(out[i].t).getUTCMonth()!==new Date(out[i-1].t).getUTCMonth())trans.push(i);
  for(const ci of trans){
    for(const key of ["temp_c","wind_ms"]){
      const ids=[];
      for(let j=Math.max(0,ci-windowH);j<=Math.min(out.length-1,ci+windowH);j++)if(Number.isFinite(out[j][key]))ids.push(j);
      if(ids.length<4)continue;
      const vals=ids.map(i=>out[i][key]),n=vals.length,w=vals.map((_,i)=>Math.exp(-0.5*Math.pow((i-n/2)/(n/4),2)));
      for(let z=0;z<ids.length;z++){
        let num=0,den=0;
        for(let k=0;k<vals.length;k++){
          const off=Math.abs(k-z),ww=w[Math.min(off,w.length-1)]||0;
          num+=vals[k]*ww;den+=ww;
        }
        if(den>0)out[ids[z]][key]=num/den;
      }
    }
  }
  return out;
}

export function applyBsrn(rows,lat,lon,{tier2=true}={}){
  const clean=[],removed=[],diag={closure_bad:0,erl_ghi:0,erl_dhi:0};
  for(const r of rows){
    const sp=solarPosition(r.t,lat,lon),z=sp.zenith_deg,c=Math.max(sp.cosz,0.01),night=z>90;
    let ok=true;
    if(Number.isFinite(r.ghi_wm2)){
      const lim=1361*1.5*Math.pow(c,1.2)+100;if(!night&&r.ghi_wm2>lim)ok=false;
    }
    if(Number.isFinite(r.dni_wm2)&&!night&&r.dni_wm2>1361)ok=false;
    if(Number.isFinite(r.dhi_wm2)){
      const lim=1361*.95*Math.pow(c,1.2)+50;if(!night&&r.dhi_wm2>lim)ok=false;
    }
    if(z<85&&[r.ghi_wm2,r.dni_wm2,r.dhi_wm2].every(Number.isFinite)){
      const calc=r.dni_wm2*c+r.dhi_wm2,ratio=r.ghi_wm2/Math.max(calc,1);
      if(ratio<.5||ratio>2){ok=false;diag.closure_bad++;}
    }
    if(tier2&&!night){
      const e0=extraRadiation(r.t);
      if(Number.isFinite(r.ghi_wm2)&&r.ghi_wm2>e0*1.2*Math.pow(c,1.2)+50){ok=false;diag.erl_ghi++;}
      if(Number.isFinite(r.dhi_wm2)&&r.dhi_wm2>e0*.75*Math.pow(c,1.2)+30){ok=false;diag.erl_dhi++;}
    }
    (ok?clean:removed).push(r);
  }
  return {rows:clean,removed_count:removed.length,diagnostic:diag};
}
export function plausibility(rows,lat,lon){
  const findings=[];
  if(!rows.length)return [{check:"meteo.vacia",severity:"fail",message:"serie meteo vacía"}];
  for(const [key,label,max] of [["ghi_wm2","GHI",1400],["dni_wm2","DNI",1100],["dhi_wm2","DHI",900]]){
    const v=rows.map(r=>r[key]).filter(Number.isFinite);
    if(!v.length){findings.push({check:"meteo.falta_"+label.toLowerCase(),severity:"fail",message:"columna "+label+" ausente"});continue;}
    if(Math.min(...v)<-1)findings.push({check:"meteo."+label.toLowerCase()+"_negativo",severity:"fail",message:label+" negativo",value:Math.min(...v),expected:"≥ 0"});
    if(Math.max(...v)>max)findings.push({check:"meteo."+label.toLowerCase()+"_absurdo",severity:"fail",message:label+" supera máximo físico",value:Math.max(...v),expected:"≤ "+max});
    const nan=1-v.length/rows.length;if(nan>.05)findings.push({check:"meteo."+label.toLowerCase()+"_huecos",severity:"warn",message:label+" con muchos huecos",value:(nan*100).toFixed(1)+"%",expected:"< 5%"});
  }
  const tv=rows.map(r=>r.temp_c).filter(Number.isFinite);if(tv.length&&(Math.min(...tv)<-60||Math.max(...tv)>60))findings.push({check:"meteo.temp_air_rango",severity:"warn",message:"temperatura fuera de rango terrestre"});
  const ws=rows.map(r=>r.wind_ms).filter(Number.isFinite);if(ws.length&&(Math.min(...ws)<0||Math.max(...ws)>75))findings.push({check:"meteo.wind_speed_rango",severity:"warn",message:"viento fuera de rango terrestre"});
  let ncl=0,nd=0;
  for(const r of rows){
    if(![r.ghi_wm2,r.dni_wm2,r.dhi_wm2].every(Number.isFinite))continue;
    const sp=solarPosition(r.t,lat,lon);
    if(sp.cosz<=.3||r.ghi_wm2<=50)continue;nd++;
    const res=Math.abs(r.ghi_wm2-(r.dni_wm2*sp.cosz+r.dhi_wm2));
    if(res>.15*r.ghi_wm2)ncl++;
  }
  if(nd>20&&ncl/nd>.20)findings.push({check:"meteo.cierre_componentes",severity:"warn",message:"GHI ≉ DNI·cos(z)+DHI con sol alto",value:(100*ncl/nd).toFixed(0)+"%",expected:"<20%"});
  return findings;
}
export function statsTable(rows){
  const out={};
  for(const k of ["ghi_wm2","dni_wm2","dhi_wm2","temp_c","wind_ms"]){
    const v=rows.map(r=>r[k]).filter(Number.isFinite);if(!v.length)continue;
    out[k]={min:Math.min(...v),max:Math.max(...v),mean:mean(v),p50:quantile(v,.5),p99:quantile(v,.99),nan_pct:100*(1-v.length/rows.length),zeros_pct:100*v.filter(x=>x===0).length/v.length};
  }
  return out;
}
export async function sha256Rows(rows){
  const enc=new TextEncoder();
  const s=rows.map(r=>[r.t,r.ghi_wm2,r.dni_wm2,r.dhi_wm2,r.temp_c,r.wind_ms].join("|")).join("\n");
  if(globalThis.crypto?.subtle){
    const b=await crypto.subtle.digest("SHA-256",enc.encode(s));
    return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,16);
  }
  let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);
}
export async function prepareDataset(dataset,{tier2=true}={}){
  const q=applyBsrn(dataset.rows,dataset.lat,dataset.lon,{tier2});
  const screen=annualStats(q.rows),findings=plausibility(q.rows,dataset.lat,dataset.lon);
  const hash=await sha256Rows(q.rows);
  return {...dataset,rows:q.rows,qa:{bsrn_outliers_removed:q.removed_count,bsrn_diagnostic:q.diagnostic,findings,status:findings.some(x=>x.severity==="fail")?"FAIL":findings.some(x=>x.severity==="warn")?"WARN":"PASS",hash},...screen};
}

function monthlyAggregate(rows){
  const dt=intervalHours(rows),acc=Array.from({length:12},()=>({ghi:0,dni:0,dhi:0,temp:[],wind:[],n:0}));
  for(const r of rows){
    const m=new Date(r.t).getUTCMonth(),a=acc[m];a.n++;
    if(Number.isFinite(r.ghi_wm2))a.ghi+=Math.max(0,r.ghi_wm2)*dt/1000;
    if(Number.isFinite(r.dni_wm2))a.dni+=Math.max(0,r.dni_wm2)*dt/1000;
    if(Number.isFinite(r.dhi_wm2))a.dhi+=Math.max(0,r.dhi_wm2)*dt/1000;
    if(Number.isFinite(r.temp_c))a.temp.push(r.temp_c);
    if(Number.isFinite(r.wind_ms))a.wind.push(r.wind_ms);
  }
  const years=Math.max(1,new Set(rows.map(r=>new Date(r.t).getUTCFullYear())).size);
  return acc.map((a,i)=>({month:i+1,GHI:a.ghi/years,DNI:a.dni/years,DHI:a.dhi/years,Tamb:mean(a.temp),Wind:mean(a.wind)}));
}
function pvgisTmyUrl(lat,lon,db){
  return "https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat="+encodeURIComponent(lat)+"&lon="+encodeURIComponent(lon)+(db?"&raddatabase="+encodeURIComponent(db):"")+"&outputformat=json&usehorizon=1";
}
export async function fetchPvgisTmy(lat,lon,db=""){
  let j;
  try{j=await cachedJson(pvgisTmyUrl(lat,lon,db));}
  catch(e){
    const u=pvgisTmyUrl(lat,lon,db).replace("/v5_3/","/v5_2/");
    j=await cachedJson(u);
  }
  const o=j?.outputs||{},data=o.tmy_hourly||(Array.isArray(o.tmy)?o.tmy:o.tmy?.data||o.tmy?.hourly)||[];
  return parsePvgisHourly({outputs:{hourly:data}},lat,lon);
}
async function fetchNasaClimatology(lat,lon){
  const p="ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_SW_DIFF,T2M,WS10M,RH2M";
  const u="https://power.larc.nasa.gov/api/temporal/climatology/point?parameters="+p+"&community=RE&longitude="+encodeURIComponent(lon)+"&latitude="+encodeURIComponent(lat)+"&format=JSON";
  const j=await cachedJson(u),d=j?.properties?.parameter||{},names=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"],days=[31,28,31,30,31,30,31,31,30,31,30,31];
  const get=(k,i)=>finite(d[k]?.[names[i]]??d[k]?.[String(i+1)]);
  return names.map((_,i)=>({month:i+1,GHI:(get("ALLSKY_SFC_SW_DWN",i)||0)*days[i],DNI:(get("ALLSKY_SFC_SW_DNI",i)||0)*days[i],DHI:(get("ALLSKY_SFC_SW_DIFF",i)||0)*days[i],Tamb:get("T2M",i),Wind:get("WS10M",i)}));
}
function rmsMulti(monthlyBySource,key){
  const src=Object.values(monthlyBySource).filter(a=>a?.length===12&&a.every(x=>Number.isFinite(x[key])));
  if(src.length<2)return null;
  const dif=[];
  for(let m=0;m<12;m++){
    const vals=src.map(a=>a[m][key]),mu=mean(vals);for(const v of vals)dif.push((v-mu)*(v-mu));
  }
  return Math.sqrt(mean(dif));
}
export async function compareSources(lat,lon,{openStart=2015,openEnd=2023,sources=["PVGIS-SARAH3","NASA-POWER","Open-Meteo ERA5"]}={}){
  const results={},failed=[];
  for(const name of sources){
    try{
      if(name==="PVGIS-SARAH3")results[name]=monthlyAggregate(await fetchPvgisTmy(lat,lon,"PVGIS-SARAH3"));
      else if(name==="PVGIS-ERA5")results[name]=monthlyAggregate(await fetchPvgisTmy(lat,lon,"PVGIS-ERA5"));
      else if(name==="NASA-POWER")results[name]=await fetchNasaClimatology(lat,lon);
      else if(name==="Open-Meteo ERA5")results[name]=monthlyAggregate((await fetchOpenMeteoHistory(lat,lon,openStart,openEnd)).rows);
      else throw new Error("fuente desconocida");
    }catch(e){failed.push(name+": "+e.message);}
  }
  const rg=rmsMulti(results,"GHI"),rt=rmsMulti(results,"Tamb"),rw=rmsMulti(results,"Wind");
  const allG=Object.values(results).flat().map(x=>x.GHI).filter(Number.isFinite),gMean=mean(allG);
  return {results,failed,rms:{ghi_kwh_m2:rg,ghi_pct:Number.isFinite(rg)?100*rg/Math.max(gMean,1e-9):null,tamb_c:rt,wind_ms:rw}};
}

export async function validateMonthlyVsPvgis(rows,lat,lon,{tolPct=15}={}){
  const local=monthlyAggregate(rows),pvg=monthlyAggregate(await fetchPvgisTmy(lat,lon,""));
  const dif=local.map((x,i)=>100*(x.GHI-pvg[i].GHI)/Math.max(pvg[i].GHI,1e-9));
  const outside=dif.map((x,i)=>Math.abs(x)>tolPct?i+1:null).filter(Boolean);
  const al=sum(local.map(x=>x.GHI)),ap=sum(pvg.map(x=>x.GHI)),ad=100*(al-ap)/Math.max(ap,1e-9);
  const status=!outside.length?"OK":(outside.length<=2&&Math.abs(ad)<=tolPct?"WARN":"FAIL");
  return {status,tol_pct:tolPct,monthly_local_kwh_m2:local.map(x=>x.GHI),monthly_pvgis_kwh_m2:pvg.map(x=>x.GHI),monthly_diff_pct:dif,annual_local_kwh_m2:al,annual_pvgis_kwh_m2:ap,annual_diff_pct:ad,months_outside_tol:outside,pvgis_source:"PVGIS TMY"};
}
export function estimateTimestampShift(rows,lat,lon,{stepMin=10,maxShiftMin=60,minClearCorr=.90}={}){
  const sample=rows.filter(r=>Number.isFinite(r.ghi_wm2));
  if(sample.length<24*10)return {reliable:false,reason:"GHI insuficiente (<10 días)"};
  const curve=[];
  for(let d=-maxShiftMin;d<=maxShiftMin;d+=stepMin){
    const a=[],b=[];
    for(const r of sample){
      const ts=new Date(Date.parse(r.t)+d*60000),cs=clearSkyProxy(ts,lat,lon);
      if(cs<=50)continue;
      const kt=r.ghi_wm2/cs;if(kt>.75){a.push(r.ghi_wm2);b.push(cs);}
    }
    if(a.length<30){curve.push([d,0]);continue;}
    curve.push([d,pearson(a,b)]);
  }
  let k=0;for(let i=1;i<curve.length;i++)if(curve[i][1]>curve[k][1])k=i;
  let bestD=curve[k][0],bestC=curve[k][1];
  if(k>0&&k<curve.length-1){
    const y0=curve[k-1][1],y1=curve[k][1],y2=curve[k+1][1],den=y0-2*y1+y2;
    if(Math.abs(den)>1e-12)bestD=bestD-stepMin*.5*(y2-y0)/den;
  }
  const corr0=(curve.find(x=>x[0]===0)||[0,0])[1],minC=Math.min(...curve.map(x=>x[1]));
  return {shift_min:bestD,recommended_frac:bestD/60,corr_at_zero:corr0,corr_best:bestC,reliable:bestC>=minClearCorr&&(bestC-minC)>.002,curve,method:"clear-sky proxy browser"};
}

function offsetForZone(date,tz){
  try{
    const f=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
    const p=Object.fromEntries(f.formatToParts(date).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
    return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-date.getTime();
  }catch(e){return 0;}
}
function localStringToUtc(s,tz="UTC"){
  if(s instanceof Date)return s.toISOString();
  if(typeof s==="number")return new Date((s-25569)*86400000).toISOString();
  const z=String(s||"").trim();
  if(/[zZ]$|[+-]\d\d:?\d\d$/.test(z))return isoUtc(z);
  const m=z.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?/);
  if(!m)return isoUtc(z);
  let guess=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+(m[5]||0),+(m[6]||0));
  if(tz!=="UTC")guess-=offsetForZone(new Date(guess),tz);
  return new Date(guess).toISOString();
}
const ALIASES={
  time:["timestamp","datetime","date","fecha","time","time_utc","hora"],
  ghi:["globhor","globhor.","glob_hor","glob.hor","ghi","h_global","horizontal_global","globalhor","shortwave_radiation"],
  dhi:["diffhor","diffhor.","diff_hor","diff.hor","dhi","h_diffuse","horizontal_diffuse","diffushor","diffuse_radiation"],
  bhi:["beamhor","beam_hor","beam.hor","b_hor"],
  dni:["dni","beamnorm","dirnorm","beam_normal","directnormal","direct_normal_irradiance"],
  temp:["t_amb","tamb","t_air","temperature","temp_2m","temperature_2m","air_temp","tair","temp_air"],
  wind:["windvel","wind_vel","wind_speed","wind_speed_10m","ws_10m","ws","windspeed"],
  wd:["wind_direction","wind_dir","direccion","dirección","dir","wd","winddir"]
};
const normKey=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\s._-]+/g,"");
function findCol(headers,arr){
  const targets=new Set(arr.map(normKey));
  return headers.findIndex(h=>targets.has(normKey(h)));
}
export function tableToMeteo(table,{lat,lon,tz="UTC"}={}){
  if(!Array.isArray(table)||table.length<2)throw new Error("tabla vacía");
  let best=0,bscore=-1;
  for(let r=0;r<Math.min(30,table.length);r++){
    const h=table[r].map(x=>String(x??""));let s=0;
    for(const a of Object.values(ALIASES))if(findCol(h,a)>=0)s++;
    if(s>bscore){bscore=s;best=r;}
  }
  const h=table[best].map(x=>String(x??""));
  const ci={};for(const [k,a] of Object.entries(ALIASES))ci[k]=findCol(h,a);
  if(ci.time<0||ci.ghi<0||ci.dhi<0)throw new Error("faltan timestamp/GHI/DHI en el fichero");
  const rows=[];
  for(let i=best+1;i<table.length;i++){
    const x=table[i];if(!x||!x.length)continue;
    const t=localStringToUtc(x[ci.time],tz);if(!t)continue;
    const num=j=>j>=0&&x[j]!==""&&x[j]!=null?finite(String(x[j]).replace(",",".")):null;
    const ghi=num(ci.ghi),dhi=num(ci.dhi),bhi=num(ci.bhi);let dni=num(ci.dni);
    if(dni==null&&ghi!=null&&dhi!=null){
      const c=solarPosition(t,lat,lon).cosz;
      const direct=bhi!=null?bhi:Math.max(0,ghi-dhi);
      dni=c>1e-3?clamp(direct/c,0,1500):0;
    }
    rows.push(normalizeRow({t,ghi_wm2:ghi,dni_wm2:dni,dhi_wm2:dhi,temp_c:num(ci.temp),wind_ms:num(ci.wind),wind_dir_deg:num(ci.wd)}));
  }
  return rows.sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
}
export function workbookToMeteo(XLSX,arrayBuffer,opts={}){
  const wb=XLSX.read(arrayBuffer,{type:"array",cellDates:true});
  let table=null,max=0,sheetName="";
  for(const name of wb.SheetNames){
    const a=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});
    if(a.length>max){max=a.length;table=a;sheetName=name;}
  }
  if(!table)throw new Error("Excel sin hojas legibles");
  return {rows:tableToMeteo(table,opts),sheet:sheetName};
}
export function csvToTable(text){
  const lines=String(text).replace(/\r/g,"").split("\n").filter(x=>x.trim()!=="");
  if(!lines.length)return [];
  const candidates=[";","\t",","];
  const sep=candidates.map(s=>[s,(lines[0].match(new RegExp("\\"+s,"g"))||[]).length]).sort((a,b)=>b[1]-a[1])[0][0];
  return lines.map(line=>{
    const out=[],re=new RegExp('(?:^|'+(sep==="\t"?"\\t":"\\"+sep)+')(?:"([^"]*(?:""[^"]*)*)"|([^"'+(sep==="\t"?"\\t":"\\"+sep)+']*))','g');
    let m;while((m=re.exec(line))){out.push((m[1]!=null?m[1].replace(/""/g,'"'):m[2]||"").trim());}
    return out;
  });
}
export function csvToMeteo(text,opts={}){return tableToMeteo(csvToTable(text),opts);}

export function toCsv(rows){
  const cols=["t","ghi_wm2","dni_wm2","dhi_wm2","temp_c","dewpoint_c","wind_ms","wind_dir_deg","gust_ms","rh_pct","pressure_hpa","precip_mm","rain_mm","snowfall_cm","snow_depth_m","showers_mm","cape_jkg","weather_code"];
  const esc=x=>x==null?"":('"'+String(x).replace(/"/g,'""')+'"');
  return cols.join(",")+"\n"+rows.map(r=>cols.map(c=>esc(r[c])).join(",")).join("\n");
}
export function downloadText(text,name,type="text/plain;charset=utf-8"){
  const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");
  a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(u);a.remove();},500);
}
export function reportHtml({title="Informe meteorológico Factiun",dataset,tmy=null,siteName=""}){
  const a=dataset.annual||annualStats(dataset.rows).annual,q=dataset.qa||{},info=tmy?.info||{};
  const e=s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
  const f=(v,d=1)=>Number.isFinite(+v)?(+v).toFixed(d):"—";
  const trs=a.map(r=>"<tr><td>"+r.year+"</td><td>"+f(r.ghi_kwh_m2,0)+"</td><td>"+f(r.dni_kwh_m2,0)+"</td><td>"+f(r.dhi_kwh_m2,0)+"</td><td>"+f(r.temp_mean_c,1)+"</td><td>"+f(r.wind_mean_ms,2)+"</td><td>"+f(r.precip_mm,0)+"</td><td>"+f(r.completeness_pct,1)+"%</td></tr>").join("");
  let tm="";
  if(info.months_selected)tm="<table><thead><tr><th>Mes</th><th>Año</th><th>FS</th></tr></thead><tbody>"+Array.from({length:12},(_,i)=>"<tr><td>"+(i+1)+"</td><td>"+e(info.months_selected[i+1])+"</td><td>"+f(info.fs_scores?.[i+1],4)+"</td></tr>").join("")+"</tbody></table>";
  return "<!doctype html><html lang='es'><head><meta charset='utf-8'><title>"+e(title)+"</title><style>body{font-family:Arial,sans-serif;color:#172033;max-width:1100px;margin:35px auto;padding:0 24px}h1{border-bottom:3px solid #e58a27;padding-bottom:10px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d8dee8;padding:6px;text-align:right}th:first-child,td:first-child{text-align:left}th{background:#eef2f7}pre{background:#f5f7fa;padding:12px;white-space:pre-wrap;font-size:10px}.note{color:#5c687a;font-size:12px}@media print{body{margin:0;max-width:none}}</style></head><body><h1>"+e(title)+"</h1><p><b>Emplazamiento:</b> "+e(siteName)+" · "+dataset.lat.toFixed(5)+", "+dataset.lon.toFixed(5)+" · <b>Fuente:</b> "+e(dataset.source)+" · <b>Periodo:</b> "+dataset.year_start+"–"+dataset.year_end+"</p><p><b>QA:</b> "+e(q.status||"—")+" · BSRN retiradas: "+e(q.bsrn_outliers_removed??"—")+" · hash: "+e(q.hash||"—")+"</p><h2>Serie histórica anual</h2><table><thead><tr><th>Año</th><th>GHI</th><th>DNI</th><th>DHI</th><th>T media</th><th>Viento</th><th>Precip.</th><th>Completitud</th></tr></thead><tbody>"+trs+"</tbody></table><h2>TMY</h2>"+(tm||"<p>Sin TMY adjunto.</p>")+"<h2>QA / provenance</h2><pre>"+e(JSON.stringify(q,null,2))+"</pre><p class='note'>Generado en navegador por Factiun Weather Workbench "+WORKBENCH_VERSION+". WEATHER informa; CONTROL decide.</p></body></html>";
}

export function hailRisk(lat,lon,{life=25,lambdaOverride=null,uncertaintyFactor=2.5}={}){
  let lam=lambdaOverride!=null&&lambdaOverride>=0?+lambdaOverride:null,source=lam!=null?"override":"heuristica";
  if(lam==null){
    for(const [a,b,c,d,v] of HAIL_HOTSPOTS)if(lat>=a&&lat<=b&&lon>=c&&lon<=d){lam=v;break;}
    if(lam==null){const x=Math.abs(+lat);lam=x>=60?.03:x>=50?.20:x>=35?.45:x>=23?.20:.08;}
  }
  const tier=lam<.10?"bajo":lam<.50?"medio":"alto",f=Math.max(1,+uncertaintyFactor),lo=lam/f,hi=lam*f;
  return {lambda_yr:lam,p_annual:1-Math.exp(-lam),p_lifetime:1-Math.exp(-lam*life),expected_lifetime:lam*life,return_period_yr:lam>0?1/lam:Infinity,design_life_yr:life,tier,source,lambda_lo:lo,lambda_hi:hi,p_lifetime_lo:1-Math.exp(-lo*life),p_lifetime_hi:1-Math.exp(-hi*life)};
}

function rngFactory(seed=42){
  let s=(seed>>>0)||1;
  const u=()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return (s+.5)/4294967296;};
  let spare=null;
  const normal=()=>{if(spare!=null){const x=spare;spare=null;return x;}let a=Math.max(u(),1e-12),b=u(),r=Math.sqrt(-2*Math.log(a));spare=r*Math.sin(2*Math.PI*b);return r*Math.cos(2*Math.PI*b);};
  const weibull=k=>Math.pow(-Math.log(Math.max(1-u(),1e-12)),1/k);
  const lognormal=(mu=0,sigma=.1)=>Math.exp(mu+sigma*normal());
  const poisson=lambda=>{let L=Math.exp(-lambda),p=1,k=0;do{k++;p*=u();}while(p>L);return k-1;};
  return {u,normal,weibull,lognormal,poisson,int:(a,b)=>Math.floor(a+u()*(b-a)),uniform:(a,b)=>a+u()*(b-a)};
}
export function syntheticWindYear({year=2024,k=2,A=6.5,lat=0,seed=42,withCyclone=false,withGust=true}={}){
  const n=isLeap(year)?8784:8760,rng=rngFactory(seed),rho=.85;
  const raw=Array.from({length:n},()=>A*rng.weibull(k));
  const z=Array(n),eps=Array.from({length:n},()=>rng.normal()*Math.sqrt(1-rho*rho));z[0]=eps[0];
  for(let i=1;i<n;i++)z[i]=rho*z[i-1]+eps[i];
  const su=raw.slice().sort((a,b)=>a-b),order=z.map((v,i)=>[v,i]).sort((a,b)=>a[0]-b[0]);
  const ar=Array(n);order.forEach((x,rank)=>ar[x[1]]=su[rank]);
  const ws=Array(n),sign=lat>=0?1:-1;
  for(let h=0;h<n;h++){
    const d=Math.floor(h/24)%365,di=1+.20*Math.sin(((h%24)-6)*Math.PI/12),se=1+.15*sign*Math.cos((d-15)*2*Math.PI/365);
    ws[h]=clamp(ar[h]*di*se,.05,80);
  }
  if(withCyclone){
    const ne=rng.poisson(1.5*n/8760);
    for(let e=0;e<ne;e++){
      const t0=rng.int(0,n),peak=rng.uniform(40,65),width=rng.int(8,24);
      for(let t=Math.max(0,t0-2*width);t<Math.min(n,t0+2*width);t++)ws[t]=Math.max(ws[t],peak*Math.exp(-Math.pow((t-t0)/width,2)));
    }
  }
  let gust=null;
  if(withGust){
    gust=ws.map(u=>{
      const us=Math.max(u,.5),ti=.14*(.75+5.6/us),gf=1+3.5*ti*rng.lognormal(0,.10);return us*gf;
    });
  }
  return {wind_speed:ws,gust,mean_ms:mean(ws),p99_ms:quantile(ws,.99),max_ms:Math.max(...ws),gust_max_ms:gust?Math.max(...gust):null,params:{k,A,lat,seed,with_cyclone:withCyclone,ar1_rho:.85},not_modeled:"NO es viento medido: Weibull(k,A) + AR(1) ρ=0,85 + modulación diurna/estacional. Fallback de simulación, NO bankable."};
}

function compareMetrics(ref,test){
  const n=Math.min(ref.length,test.length),a=[],b=[];
  for(let i=0;i<n;i++)if(Number.isFinite(ref[i])&&Number.isFinite(test[i])){a.push(ref[i]);b.push(test[i]);}
  if(a.length<2)throw new Error("menos de 2 puntos pareados");
  const mr=mean(a),mt=mean(b),d=b.map((x,i)=>x-a[i]),mbe=mean(d),mae=mean(d.map(Math.abs)),rmse=Math.sqrt(mean(d.map(x=>x*x)));
  const den=sum(a.map(x=>(x-mr)*(x-mr))),r2=den>0?1-sum(d.map(x=>x*x))/den:NaN;
  return {n:a.length,mean_ref:mr,mean_test:mt,mbe,mbe_pct:100*mbe/mr,mae,mae_pct:100*mae/mr,rmse,rmse_pct:100*rmse/mr,r2};
}
function factorFit(x,y,method){
  if(method==="bias")return {scale:mean(y)/Math.max(mean(x),1e-9),offset:0};
  if(method==="regression"){
    const mx=mean(x),my=mean(y),den=sum(x.map(v=>(v-mx)*(v-mx))),s=den?sum(x.map((v,i)=>(v-mx)*(y[i]-my)))/den:1;
    return {scale:s,offset:my-s*mx};
  }
  return {quantile:true,x:x.slice().sort((a,b)=>a-b),y:y.slice().sort((a,b)=>a-b)};
}
function applyFactor(v,f){
  if(f.quantile){
    const x=f.x,y=f.y;if(!x.length)return v;
    let lo=0,hi=x.length-1;if(v<=x[0])return y[0];if(v>=x[hi])return y[hi];
    while(hi-lo>1){const m=(lo+hi)>>1;if(x[m]<=v)lo=m;else hi=m;}
    const q=(v-x[lo])/Math.max(x[hi]-x[lo],1e-9);return y[lo]+q*(y[hi]-y[lo]);
  }
  return v*f.scale+f.offset;
}
export function adaptSite(longRows,measuredRows,{longKey="ghi_wm2",measuredKey="ghi_wm2",method="bias",monthly=true}={}){
  const mm=new Map(measuredRows.filter(r=>r.t&&Number.isFinite(r[measuredKey])).map(r=>[r.t,r[measuredKey]]));
  const pairs=longRows.filter(r=>r.t&&Number.isFinite(r[longKey])&&mm.has(r.t)).map(r=>({t:r.t,x:r[longKey],y:mm.get(r.t),m:new Date(r.t).getUTCMonth()+1}));
  if(pairs.length<2)throw new Error("sin solapamiento suficiente entre serie larga y medida");
  const global=factorFit(pairs.map(p=>p.x),pairs.map(p=>p.y),method),factors={global},months_with_data=[],months_missing=[];
  if(monthly){
    for(let m=1;m<=12;m++){
      const p=pairs.filter(x=>x.m===m);
      if(p.length>=100){factors[m]=factorFit(p.map(x=>x.x),p.map(x=>x.y),method);months_with_data.push(m);}else months_missing.push(m);
    }
  }
  const corrected=longRows.map(r=>{
    if(!Number.isFinite(r[longKey]))return {...r};
    const m=new Date(r.t).getUTCMonth()+1,f=factors[m]||global;
    return {...r,[longKey]:Math.max(0,applyFactor(r[longKey],f))};
  });
  const before=compareMetrics(pairs.map(p=>p.y),pairs.map(p=>p.x));
  const corrMap=new Map(corrected.map(r=>[r.t,r[longKey]]));
  const after=compareMetrics(pairs.map(p=>p.y),pairs.map(p=>corrMap.get(p.t)));
  const months=[...new Set(pairs.map(p=>p.m))],seasonal=months.length>=12,extrapolated=monthly&&months_missing.length>0;
  const base=Math.max(Math.abs(after.mbe_pct)/100,.01),pen=seasonal?1:1.5,sigma=Math.max(.01,base*pen);
  return {rows:corrected,result:{method,monthly,before,after,factors,overlap_months:months.length,overlap_points:pairs.length,months_with_data,months_missing,extrapolated,seasonal_coverage_ok:seasonal},uncertainty:{irradiance_sigma:sigma,base_sigma:base,penalty_applied:pen,floor:.01,overlap_months:months.length,seasonal_coverage_ok:seasonal}};
}

export function interpolateRows(rows,{stepMin=1,maxRows=650000}={}){
  if(rows.length<2)return {rows:rows.slice(),report:{}};
  const est=Math.round((Date.parse(rows.at(-1).t)-Date.parse(rows[0].t))/(stepMin*60000))+1;
  if(est>maxRows)throw new Error("La interpolación generaría "+est.toLocaleString("es-ES")+" filas; usa un TMY o un periodo más corto.");
  const out=[],keys=["ghi_wm2","dni_wm2","dhi_wm2","temp_c","dewpoint_c","wind_ms","rh_pct","pressure_hpa","precip_mm"];
  for(let i=0;i<rows.length-1;i++){
    const a=rows[i],b=rows[i+1],ta=Date.parse(a.t),tb=Date.parse(b.t),gap=(tb-ta)/60000;
    out.push({...a});
    if(gap<=stepMin||gap>180)continue;
    for(let t=ta+stepMin*60000;t<tb;t+=stepMin*60000){
      const f=(t-ta)/(tb-ta),r={...a,t:new Date(t).toISOString()};
      for(const k of keys){
        const x=a[k],y=b[k];r[k]=Number.isFinite(x)&&Number.isFinite(y)?x+(y-x)*f:(Number.isFinite(x)?x:null);
      }
      r.wind_dir_deg=a.wind_dir_deg;r.weather_code=a.weather_code;out.push(r);
    }
  }
  out.push({...rows.at(-1)});
  const energy=rr=>{
    const dt=intervalHours(rr);return sum(rr.map(x=>Math.max(0,x.ghi_wm2||0)))*dt/1000;
  };
  const e0=energy(rows),e1=energy(out);
  return {rows:out,report:{rows_before:rows.length,rows_after:out.length,step_min:stepMin,ghi_before_kwh_m2:e0,ghi_after_kwh_m2:e1,deviation_pct:e0?100*(e1-e0)/e0:null}};
}
