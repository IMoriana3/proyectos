export const METEO_SCHEMA_VERSION = "1.0.0";

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
    precip_mm:n(x.precip_mm), pressure_hpa:n(x.pressure_hpa),
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
    "surface_pressure"
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
      precip_mm:h.precipitation?.[i],cloud_total:(h.cloud_cover?.[i]??0)/100,
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
