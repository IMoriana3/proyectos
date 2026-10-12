export const METEO_SCHEMA_VERSION = "1.1.0";

export const SOURCES = Object.freeze({
  weathernext3:{label:"WeatherNext 3",kind:"forecast",probabilistic:true,role:"forecast/supervisory"},
  openmeteo:{label:"Open-Meteo",kind:"forecast/reanalysis",probabilistic:false,role:"fallback/development"},
  hsu_csv:{label:"HSU CSV",kind:"measured",probabilistic:false,role:"measured/local"},
  hsu_scada:{label:"HSU SCADA",kind:"measured-live",probabilistic:false,role:"measured/local safety"},
  pvgis:{label:"PVGIS",kind:"tmy/reanalysis",probabilistic:false,role:"resource/benchmark"},
  nasa_power:{label:"NASA POWER",kind:"reanalysis",probabilistic:false,role:"resource/benchmark"},
  clearsky:{label:"Clear-sky",kind:"model",probabilistic:false,role:"synthetic/reference"}
});

const n=v=>Number.isFinite(+v)?+v:null;
const clamp=(v,a,b)=>v==null?null:Math.max(a,Math.min(b,v));

export function normalizeMeteo(x={}){
  const o={
    schema_version:METEO_SCHEMA_VERSION,
    source:x.source||"unknown",
    timestamp:x.timestamp||null,
    lat:n(x.lat), lon:n(x.lon),
    ghi_wm2:n(x.ghi_wm2), fdir_wm2:n(x.fdir_wm2), dni_wm2:n(x.dni_wm2), dhi_wm2:n(x.dhi_wm2),
    temp_c:n(x.temp_c), dewpoint_c:n(x.dewpoint_c),
    wind_ms:n(x.wind_ms), wind_dir_deg:n(x.wind_dir_deg), gust_ms:n(x.gust_ms),
    wind100_ms:n(x.wind100_ms),
    cloud_total:clamp(n(x.cloud_total),0,1),
    cloud_low:clamp(n(x.cloud_low),0,1),
    cloud_mid:clamp(n(x.cloud_mid),0,1),
    cloud_high:clamp(n(x.cloud_high),0,1),
    precip_mm:n(x.precip_mm), rain_mm:n(x.rain_mm), showers_mm:n(x.showers_mm),
    snowfall_cm:n(x.snowfall_cm), snow_depth_m:n(x.snow_depth_m),
    cape_jkg:n(x.cape_jkg), weather_code:n(x.weather_code),
    pressure_hpa:n(x.pressure_hpa),
    p10:x.p10||null, p50:x.p50||null, p90:x.p90||null,
    provenance:x.provenance||null
  };
  return Object.assign(o, deriveMeteo(o));
}

export function deriveMeteo(m){
  const ghi=m.ghi_wm2, dni=m.dni_wm2, dhi=m.dhi_wm2;
  const diffuse_fraction = ghi>1 && dhi!=null ? clamp(dhi/ghi,0,1) : null;
  const direct_fraction = ghi>1 && dni!=null ? clamp(dni/Math.max(ghi,1),0,2) : null;
  const cloud = m.cloud_total;
  const overcast_probability = cloud!=null
    ? clamp(0.65*cloud + 0.35*(diffuse_fraction==null?cloud:diffuse_fraction),0,1)
    : diffuse_fraction;
  const wind_watch = m.wind_ms!=null ? m.wind_ms>=12 : null;
  const wind_stow_risk = m.wind_ms!=null ? clamp((m.wind_ms-10)/12,0,1) : null;
  const freeze_risk = m.temp_c!=null && m.dewpoint_c!=null
    ? clamp((4-m.temp_c)/6,0,1)*clamp((m.dewpoint_c-m.temp_c+4)/4,0,1)
    : null;
  const convective_proxy = (m.precip_mm!=null && cloud!=null)
    ? clamp((m.precip_mm/12)*0.55 + cloud*0.25 + ((m.gust_ms||0)/30)*0.20,0,1)
    : null;
  return {
    diffuse_fraction,direct_fraction,overcast_probability,
    wind_watch,wind_stow_risk,freeze_risk,
    hail_risk_proxy:convective_proxy
  };
}

export async function fetchOpenMeteo({lat,lon,forecastDays=7}){
  const vars=[
    "temperature_2m","dew_point_2m","precipitation","cloud_cover",
    "cloud_cover_low","cloud_cover_mid","cloud_cover_high",
    "wind_speed_10m","wind_direction_10m","wind_gusts_10m",
    "shortwave_radiation","direct_normal_irradiance","diffuse_radiation",
    "surface_pressure","rain","showers","snowfall","snow_depth","cape","weather_code"
  ].join(",");
  const u=new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude",lat); u.searchParams.set("longitude",lon);
  u.searchParams.set("hourly",vars); u.searchParams.set("wind_speed_unit","ms");
  u.searchParams.set("timezone","UTC"); u.searchParams.set("forecast_days",forecastDays);
  const r=await fetch(u);
  if(!r.ok) throw new Error("Open-Meteo HTTP "+r.status);
  const j=await r.json(), h=j.hourly||{}, out=[];
  for(let i=0;i<(h.time||[]).length;i++){
    out.push(normalizeMeteo({
      source:"openmeteo",timestamp:h.time[i]+"Z",lat:+lat,lon:+lon,
      temp_c:h.temperature_2m?.[i],dewpoint_c:h.dew_point_2m?.[i],
      precip_mm:h.precipitation?.[i],rain_mm:h.rain?.[i],showers_mm:h.showers?.[i],
      snowfall_cm:h.snowfall?.[i],snow_depth_m:h.snow_depth?.[i],cape_jkg:h.cape?.[i],
      weather_code:h.weather_code?.[i],cloud_total:(h.cloud_cover?.[i]??0)/100,
      cloud_low:(h.cloud_cover_low?.[i]??0)/100,cloud_mid:(h.cloud_cover_mid?.[i]??0)/100,
      cloud_high:(h.cloud_cover_high?.[i]??0)/100,
      wind_ms:h.wind_speed_10m?.[i],wind_dir_deg:h.wind_direction_10m?.[i],
      gust_ms:h.wind_gusts_10m?.[i],
      ghi_wm2:h.shortwave_radiation?.[i],dni_wm2:h.direct_normal_irradiance?.[i],
      dhi_wm2:h.diffuse_radiation?.[i],pressure_hpa:h.surface_pressure?.[i],
      provenance:{provider:"Open-Meteo",mode:"forecast",retrieved_at:new Date().toISOString()}
    }));
  }
  return out;
}

export function fromWeatherNextSummary(row={}){
  const pick=(base,suffix="p50")=>n(row[base+"_"+suffix] ?? row[base]);
  const jpm2ToWm2=v=>v==null?null:v/3600;
  return normalizeMeteo({
    source:"weathernext3",timestamp:row.timestamp||row.valid_time||null,
    lat:row.lat,lon:row.lon,
    temp_c:(pick("temperature_2m")??273.15)-273.15,
    dewpoint_c:(pick("dewpoint_temperature_2m")??273.15)-273.15,
    wind_ms:pick("wind_speed_10m"),wind100_ms:pick("wind_speed_100m"),
    ghi_wm2:jpm2ToWm2(pick("surface_solar_radiation_downwards_1hr")),
    fdir_wm2:jpm2ToWm2(pick("total_sky_direct_solar_radiation_at_surface_1hr")),
    precip_mm:(pick("total_precipitation_1hr")??0)*1000,
    cloud_total:pick("total_cloud_cover"),cloud_low:pick("low_cloud_cover"),
    cloud_mid:pick("medium_cloud_cover"),cloud_high:pick("high_cloud_cover"),
    pressure_hpa:(pick("mean_sea_level_pressure")??101325)/100,
    p10:row.p10||null,p50:row.p50||null,p90:row.p90||null,
    provenance:{provider:"Google WeatherNext 3",mode:"ensemble-summary",raw:row.provenance||null}
  });
}


export function forecastOperationalSummary(rows,{hours=72,windWatchMs=12,windStowMs=16.67,heavyRainMmH=5,capeWatchJkg=800,freezeC=0,snowWatchCmH=.2}={}){
  const all=(rows||[]).filter(Boolean).slice().sort((a,b)=>Date.parse(a.timestamp||a.t)-Date.parse(b.timestamp||b.t));
  if(!all.length)return {hours:0,events:[],metrics:{}};
  const t0=Date.parse(all[0].timestamp||all[0].t),limit=t0+Math.max(1,hours)*3600000;
  const s=all.filter(r=>Date.parse(r.timestamp||r.t)<=limit);
  const vals=k=>s.map(r=>Number(r[k])).filter(Number.isFinite);
  const max=a=>a.length?Math.max(...a):null,min=a=>a.length?Math.min(...a):null,sum=a=>a.reduce((x,y)=>x+y,0);
  const events=[];
  const add=(kind,severity,r,value,label)=>{
    if(!r)return;
    events.push({kind,severity,at:r.timestamp||r.t,value,label});
  };
  const first=(fn)=>s.find(fn);
  add("wind","watch",first(r=>Number(r.wind_ms)>=windWatchMs),windWatchMs,"Viento ≥ "+windWatchMs.toFixed(1)+" m/s");
  add("wind","stow-watch",first(r=>Math.max(Number(r.gust_ms)||0,Number(r.wind_ms)||0)>=windStowMs),windStowMs,"Viento/racha ≥ "+windStowMs.toFixed(1)+" m/s");
  add("rain","watch",first(r=>Number(r.precip_mm)>=heavyRainMmH),heavyRainMmH,"Precipitación ≥ "+heavyRainMmH+" mm/h");
  add("freeze","watch",first(r=>Number.isFinite(Number(r.temp_c))&&Number(r.temp_c)<=freezeC),freezeC,"Temperatura ≤ "+freezeC+" °C");
  add("snow","watch",first(r=>Number(r.snowfall_cm)>=snowWatchCmH),snowWatchCmH,"Nieve nueva ≥ "+snowWatchCmH+" cm/h");
  add("convective","watch",first(r=>Number(r.cape_jkg)>=capeWatchJkg),capeWatchJkg,"CAPE ≥ "+capeWatchJkg+" J/kg");
  const g=vals("gust_ms"),w=vals("wind_ms"),p=vals("precip_mm"),t=vals("temp_c"),cap=vals("cape_jkg"),snow=vals("snowfall_cm");
  return {
    hours:s.length?Math.round((Date.parse(s.at(-1).timestamp||s.at(-1).t)-t0)/3600000)+1:0,
    start_utc:new Date(t0).toISOString(),
    end_utc:s.length?new Date(Date.parse(s.at(-1).timestamp||s.at(-1).t)).toISOString():null,
    events:events.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),
    metrics:{
      max_wind_ms:max(w),max_gust_ms:max(g),precip_total_mm:sum(p),
      min_temp_c:min(t),max_cape_jkg:max(cap),snowfall_total_cm:sum(snow),
      max_cloud_pct:max(s.map(r=>Number(r.cloud_total)).filter(Number.isFinite))!=null?
        100*max(s.map(r=>Number(r.cloud_total)).filter(Number.isFinite)):null
    }
  };
}

export async function fetchSpatialForecast({lat,lon,radiusKm=2,forecastDays=3}={}){
  lat=Number(lat);lon=Number(lon);radiusKm=Math.max(.1,Math.min(50,Number(radiusKm)||2));
  if(!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error("coordenadas inválidas");
  const dLat=radiusKm/111.32,dLon=radiusKm/(111.32*Math.max(.2,Math.cos(lat*Math.PI/180)));
  const pts=[
    {id:"C",label:"Centro",lat,lon},
    {id:"N",label:"Norte",lat:lat+dLat,lon},
    {id:"S",label:"Sur",lat:lat-dLat,lon},
    {id:"E",label:"Este",lat,lon:lon+dLon},
    {id:"W",label:"Oeste",lat,lon:lon-dLon}
  ];
  const out=await Promise.all(pts.map(async p=>({...p,rows:await fetchOpenMeteo({lat:p.lat,lon:p.lon,forecastDays})})));
  const hourly=[];
  const n=Math.min(...out.map(p=>p.rows.length));
  for(let i=0;i<n;i++){
    const rr=out.map(p=>p.rows[i]),values=k=>rr.map(r=>Number(r[k])).filter(Number.isFinite);
    const spread=k=>{const a=values(k);return a.length?Math.max(...a)-Math.min(...a):null;};
    hourly.push({
      t:rr[0]?.timestamp||null,
      wind_spread_ms:spread("wind_ms"),gust_spread_ms:spread("gust_ms"),
      temp_spread_c:spread("temp_c"),ghi_spread_wm2:spread("ghi_wm2"),
      precip_spread_mm:spread("precip_mm"),cloud_spread:spread("cloud_total")
    });
  }
  const maxOf=k=>{const a=hourly.map(x=>x[k]).filter(Number.isFinite);return a.length?Math.max(...a):null;};
  return {
    radius_km:radiusKm,points:out.map(({rows,...p})=>p),hourly,
    maxima:{
      wind_spread_ms:maxOf("wind_spread_ms"),gust_spread_ms:maxOf("gust_spread_ms"),
      temp_spread_c:maxOf("temp_spread_c"),ghi_spread_wm2:maxOf("ghi_spread_wm2"),
      precip_spread_mm:maxOf("precip_spread_mm"),cloud_spread:maxOf("cloud_spread")
    },
    semantics:"5-point cross sample around site centroid; approximation, not plant-topology sampling"
  };
}

export async function fetchWeatherNextProxy({endpoint,lat,lon,hours=72}={}){
  const base=String(endpoint||"").trim().replace(/\/+$/,"");
  if(!base)throw new Error("WeatherNext 3 live endpoint no configurado");
  const u=new URL(base+"/forecast");
  u.searchParams.set("lat",lat);u.searchParams.set("lon",lon);u.searchParams.set("hours",hours);
  const r=await fetch(u,{cache:"no-store"});
  if(!r.ok)throw new Error("WeatherNext proxy HTTP "+r.status);
  const j=await r.json(),rows=Array.isArray(j)?j:(j.rows||j.forecast||j.data||[]);
  if(!rows.length)throw new Error("WeatherNext proxy sin filas");
  return rows.map(fromWeatherNextSummary);
}
