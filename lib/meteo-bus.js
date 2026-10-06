(function(global){
'use strict';

var VERSION='1.0.0';
var STORAGE_KEY='factiun_meteo_bus_v1';
var CONFIG_KEY='factiun_meteo_config_v1';
var EVENT_NAME='factiun-meteo-update';

var SCHEMA={
  version:'weather-state.v1',
  time:'ISO-8601 UTC',
  units:{
    temperature_c:'degC',dewpoint_c:'degC',relative_humidity_pct:'%',
    wind_speed_10m_ms:'m/s',wind_direction_10m_deg:'deg',wind_gust_10m_ms:'m/s',
    ghi_wm2:'W/m2',dni_wm2:'W/m2',dhi_wm2:'W/m2',
    precipitation_mm:'mm/h',snowfall_cm:'cm/h',cloud_cover_pct:'%',
    cloud_cover_low_pct:'%',cloud_cover_mid_pct:'%',cloud_cover_high_pct:'%',
    surface_pressure_hpa:'hPa',cape_jkg:'J/kg',freezing_level_m:'m'
  }
};

var SOURCES={
  openmeteo_forecast:{id:'openmeteo_forecast',label:'Open-Meteo · previsión',kind:'forecast',browser:true},
  openmeteo_era5:{id:'openmeteo_era5',label:'Open-Meteo · ERA5',kind:'reanalysis',browser:true},
  weathernext3:{id:'weathernext3',label:'Google WeatherNext 3',kind:'ensemble_forecast',browser:false,proxy:true},
  hsu_csv:{id:'hsu_csv',label:'HSU · CSV',kind:'measured',browser:true},
  hsu_scada:{id:'hsu_scada',label:'HSU · SCADA',kind:'measured_live',browser:false},
  pvgis:{id:'pvgis',label:'PVGIS horario',kind:'historical',browser:false,delegated:'SolarGPT engine'},
  nasa_power:{id:'nasa_power',label:'NASA POWER',kind:'historical',browser:false,delegated:'SolarGPT engine'},
  pvsyst_csv:{id:'pvsyst_csv',label:'PVSyst · CSV',kind:'simulation_input',browser:true},
  synthetic:{id:'synthetic',label:'Sintético / cielo claro',kind:'scenario',browser:true}
};

function num(v){
  if(v===null||v===undefined||v==='')return null;
  var n=Number(v); return isFinite(n)?n:null;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function nowIso(){return new Date().toISOString();}
function round(v,n){
  if(v===null||v===undefined||!isFinite(v))return null;
  var p=Math.pow(10,n||0); return Math.round(v*p)/p;
}
function safeJson(s,fallback){try{return JSON.parse(s);}catch(e){return fallback;}}
function getConfig(){return safeJson(localStorage.getItem(CONFIG_KEY)||'{}',{});}
function setConfig(patch){
  var c=getConfig(),k; for(k in patch)c[k]=patch[k];
  localStorage.setItem(CONFIG_KEY,JSON.stringify(c)); return c;
}
function cacheKey(meta){
  var lat=round(meta.lat,3),lon=round(meta.lon,3);
  return String(meta.provider||'unknown')+'|'+lat+'|'+lon+'|'+String(meta.mode||'');
}
function readStore(){return safeJson(localStorage.getItem(STORAGE_KEY)||'{"version":"1.0.0","datasets":{}}',{version:VERSION,datasets:{}});}
function writeStore(store){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(store));}
  catch(e){
    var slim={version:VERSION,datasets:{}},keys=Object.keys(store.datasets||{});
    if(keys.length){
      var last=store.datasets[keys[keys.length-1]];
      if(last){
        var copy=JSON.parse(JSON.stringify(last));
        if(copy.points&&copy.points.length>240)copy.points=copy.points.slice(0,240);
        slim.datasets[keys[keys.length-1]]=copy;
      }
    }
    localStorage.setItem(STORAGE_KEY,JSON.stringify(slim));
  }
}
function publish(dataset){
  if(!dataset||!dataset.meta||!Array.isArray(dataset.points))throw new Error('WeatherState inválido');
  dataset.schema=SCHEMA.version;
  dataset.meta.published_at=nowIso();
  var store=readStore(),key=cacheKey(dataset.meta);
  store.version=VERSION; store.datasets=store.datasets||{}; store.datasets[key]=dataset; store.last_key=key;
  writeStore(store);
  try{global.dispatchEvent(new CustomEvent(EVENT_NAME,{detail:{key:key,dataset:dataset}}));}catch(e){}
  return dataset;
}
function latest(filter){
  var s=readStore(),ds=s.datasets||{},keys=Object.keys(ds),best=null;
  keys.forEach(function(k){
    var d=ds[k]; if(!d||!d.meta)return;
    if(filter){
      if(filter.provider&&d.meta.provider!==filter.provider)return;
      if(filter.lat!=null&&Math.abs(d.meta.lat-filter.lat)>0.02)return;
      if(filter.lon!=null&&Math.abs(d.meta.lon-filter.lon)>0.02)return;
    }
    if(!best||String(d.meta.published_at||'')>String(best.meta.published_at||''))best=d;
  });
  return best;
}
function subscribe(fn){
  function local(e){fn(e.detail&&e.detail.dataset?e.detail.dataset:null,e);}
  function storage(e){if(e.key===STORAGE_KEY)fn(latest(),e);}
  global.addEventListener(EVENT_NAME,local);global.addEventListener('storage',storage);
  return function(){global.removeEventListener(EVENT_NAME,local);global.removeEventListener('storage',storage);};
}

var OM_VARS=[
  'temperature_2m','dew_point_2m','relative_humidity_2m',
  'precipitation_probability','precipitation','rain','showers','snowfall','weather_code',
  'cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high',
  'surface_pressure','shortwave_radiation','direct_normal_irradiance','diffuse_radiation',
  'wind_speed_10m','wind_direction_10m','wind_gusts_10m','cape','freezing_level_height'
].join(',');

function parseOpenMeteo(j,meta){
  var h=j.hourly||{},t=h.time||[],pts=[];
  function at(name,i){return h[name]&&h[name][i]!=null?num(h[name][i]):null;}
  for(var i=0;i<t.length;i++){
    pts.push({
      time:/Z$/.test(t[i])?t[i]:t[i]+'Z',
      temperature_c:at('temperature_2m',i),
      dewpoint_c:at('dew_point_2m',i),
      relative_humidity_pct:at('relative_humidity_2m',i),
      precipitation_probability_pct:at('precipitation_probability',i),
      precipitation_mm:at('precipitation',i),
      rain_mm:at('rain',i),
      showers_mm:at('showers',i),
      snowfall_cm:at('snowfall',i),
      weather_code:at('weather_code',i),
      cloud_cover_pct:at('cloud_cover',i),
      cloud_cover_low_pct:at('cloud_cover_low',i),
      cloud_cover_mid_pct:at('cloud_cover_mid',i),
      cloud_cover_high_pct:at('cloud_cover_high',i),
      surface_pressure_hpa:at('surface_pressure',i),
      ghi_wm2:at('shortwave_radiation',i),
      dni_wm2:at('direct_normal_irradiance',i),
      dhi_wm2:at('diffuse_radiation',i),
      wind_speed_10m_ms:at('wind_speed_10m',i),
      wind_direction_10m_deg:at('wind_direction_10m',i),
      wind_gust_10m_ms:at('wind_gusts_10m',i),
      cape_jkg:at('cape',i),
      freezing_level_m:at('freezing_level_height',i)
    });
  }
  return {schema:SCHEMA.version,meta:meta,points:pts};
}
async function fetchOpenMeteo(opts){
  opts=opts||{};
  var lat=num(opts.lat),lon=num(opts.lon);
  if(lat===null||lon===null)throw new Error('Faltan lat/lon');
  var mode=opts.mode==='archive'?'archive':'forecast';
  var url,provider;
  if(mode==='archive'){
    if(!opts.start_date||!opts.end_date)throw new Error('Faltan start_date/end_date');
    provider='openmeteo_era5';
    url='https://archive-api.open-meteo.com/v1/archive?latitude='+encodeURIComponent(lat)+'&longitude='+encodeURIComponent(lon)+
      '&start_date='+encodeURIComponent(opts.start_date)+'&end_date='+encodeURIComponent(opts.end_date)+
      '&hourly='+encodeURIComponent(OM_VARS)+'&timezone=UTC&wind_speed_unit=ms&models=era5';
  }else{
    provider='openmeteo_forecast';
    var days=clamp(Number(opts.forecast_days||16),1,16);
    url='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(lat)+'&longitude='+encodeURIComponent(lon)+
      '&hourly='+encodeURIComponent(OM_VARS)+'&forecast_days='+days+'&timezone=UTC&wind_speed_unit=ms';
  }
  var r=await fetch(url);
  if(!r.ok)throw new Error('Open-Meteo HTTP '+r.status);
  var j=await r.json();
  var d=parseOpenMeteo(j,{
    provider:provider,mode:mode,lat:lat,lon:lon,
    start_date:opts.start_date||null,end_date:opts.end_date||null,forecast_days:mode==='forecast'?days:null,
    source_url:url,retrieved_at:nowIso(),timezone:'UTC',
    resolution_minutes:60,model:mode==='archive'?'ERA5':'Open-Meteo forecast blend'
  });
  return publish(d);
}

function normalizeWeatherNextPoint(p){
  var o={time:p.time||p.valid_time||p.timestamp||null};
  function take(dst,names,xf){
    for(var i=0;i<names.length;i++){
      if(p[names[i]]!=null){
        var v=num(p[names[i]]); o[dst]=xf&&v!=null?xf(v):v; return;
      }
    }
    o[dst]=null;
  }
  take('temperature_c',['temperature_c','temperature_2m'],function(v){return v>150?v-273.15:v;});
  take('dewpoint_c',['dewpoint_c','dewpoint_temperature_2m'],function(v){return v>150?v-273.15:v;});
  take('wind_speed_10m_ms',['wind_speed_10m_ms','wind_speed_10m']);
  take('wind_speed_100m_ms',['wind_speed_100m_ms','wind_speed_100m']);
  take('u_wind_10m_ms',['u_wind_10m_ms','u_component_of_wind_10m']);
  take('v_wind_10m_ms',['v_wind_10m_ms','v_component_of_wind_10m']);
  take('cloud_cover_pct',['cloud_cover_pct','total_cloud_cover'],function(v){return v<=1?v*100:v;});
  take('cloud_cover_low_pct',['cloud_cover_low_pct','low_cloud_cover'],function(v){return v<=1?v*100:v;});
  take('cloud_cover_mid_pct',['cloud_cover_mid_pct','medium_cloud_cover'],function(v){return v<=1?v*100:v;});
  take('cloud_cover_high_pct',['cloud_cover_high_pct','high_cloud_cover'],function(v){return v<=1?v*100:v;});
  take('precipitation_mm',['precipitation_mm','total_precipitation_1hr'],function(v){return p.precipitation_mm!=null?v:v*1000;});
  take('ghi_wm2',['ghi_wm2','surface_solar_radiation_downwards_1hr'],function(v){return p.ghi_wm2!=null?v:v/3600;});
  take('direct_beam_wm2',['direct_beam_wm2','total_sky_direct_solar_radiation_at_surface_1hr'],function(v){return p.direct_beam_wm2!=null?v:v/3600;});
  if(o.wind_direction_10m_deg==null&&o.u_wind_10m_ms!=null&&o.v_wind_10m_ms!=null){
    o.wind_direction_10m_deg=(Math.atan2(-o.u_wind_10m_ms,-o.v_wind_10m_ms)*180/Math.PI+360)%360;
  }
  ['wind_speed_10m_p10','wind_speed_10m_p50','wind_speed_10m_p90','ghi_p10','ghi_p50','ghi_p90','precipitation_p10_mm','precipitation_p50_mm','precipitation_p90_mm'].forEach(function(k){
    if(p[k]!=null)o[k]=num(p[k]);
  });
  return o;
}
async function fetchWeatherNext(opts){
  opts=opts||{};
  var cfg=getConfig(),base=opts.proxy_url||cfg.weathernext_proxy_url;
  if(!base)throw new Error('WeatherNext 3 necesita el proxy/adapter de Factiun configurado; no se guardan credenciales en GitHub Pages.');
  var lat=num(opts.lat),lon=num(opts.lon);
  if(lat===null||lon===null)throw new Error('Faltan lat/lon');
  var hours=clamp(Number(opts.hours||360),1,360);
  var sep=base.indexOf('?')>=0?'&':'?';
  var url=base+sep+'lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon)+'&hours='+encodeURIComponent(hours);
  var r=await fetch(url,{headers:{'Accept':'application/json'}});
  if(!r.ok)throw new Error('WeatherNext adapter HTTP '+r.status);
  var j=await r.json(),raw=j.points||j.data||j.rows||[];
  var points=raw.map(normalizeWeatherNextPoint).filter(function(p){return !!p.time;});
  var d={
    schema:SCHEMA.version,
    meta:{
      provider:'weathernext3',mode:'forecast',lat:lat,lon:lon,retrieved_at:nowIso(),
      source_url:base,resolution_minutes:60,model:'WeatherNext 3',
      ensemble_members:j.ensemble_members||64,experimental:true,proxy:true,
      init_time:j.init_time||null
    },
    points:points
  };
  return publish(d);
}

function derive(dataset,opts){
  opts=opts||{}; var pts=(dataset&&dataset.points)||[];
  var wind1=num(opts.wind_watch_ms); if(wind1==null)wind1=11.1;
  var wind2=num(opts.wind_stow_ms); if(wind2==null)wind2=16.7;
  var now=Date.now(),end24=now+86400000,win=pts.filter(function(p){var x=Date.parse(p.time);return isFinite(x)&&x>=now&&x<=end24;});
  if(!win.length)win=pts.slice(0,24);
  function vals(k){return win.map(function(p){return num(p[k]);}).filter(function(v){return v!=null;});}
  function mx(a){return a.length?Math.max.apply(null,a):null;}
  function avg(a){return a.length?a.reduce(function(s,v){return s+v;},0)/a.length:null;}
  function sum(a){return a.length?a.reduce(function(s,v){return s+v;},0):null;}
  var winds=vals('wind_speed_10m_ms'),gusts=vals('wind_gust_10m_ms'),cloud=vals('cloud_cover_pct'),
      prec=vals('precipitation_mm'),snow=vals('snowfall_cm'),ghi=vals('ghi_wm2'),dhi=vals('dhi_wm2'),temp=vals('temperature_c'),
      cape=vals('cape_jkg'),freeze=vals('freezing_level_m');
  var diffuse=[];
  for(var i=0;i<win.length;i++){
    var g=num(win[i].ghi_wm2),d=num(win[i].dhi_wm2);
    if(g!=null&&d!=null&&g>50)diffuse.push(clamp(d/g,0,1));
  }
  var maxWind=mx(winds),maxGust=mx(gusts),ref=maxGust!=null?maxGust:maxWind;
  var windRisk=ref==null?'unknown':ref>=wind2?'stow':ref>=wind1?'watch':'normal';
  var freezeRisk=(temp.length&&Math.min.apply(null,temp)<=1&&((sum(prec)||0)>0||(sum(snow)||0)>0))?'watch':'normal';
  var hailIngredients=(mx(cape)||0)>=800&&(sum(prec)||0)>0&&(avg(freeze)||99999)<3500;
  return {
    horizon_hours:win.length,
    wind_risk:windRisk,max_wind_10m_ms:round(maxWind,1),max_gust_10m_ms:round(maxGust,1),
    precipitation_mm_24h:round(sum(prec),1),snowfall_cm_24h:round(sum(snow),1),
    min_temperature_c:temp.length?round(Math.min.apply(null,temp),1):null,
    mean_cloud_cover_pct:round(avg(cloud),0),mean_diffuse_fraction:round(avg(diffuse),2),
    solar_whm2_24h:round(sum(ghi),0),freeze_risk:freezeRisk,
    hail_ingredients_heuristic:hailIngredients,
    note_hail:'Indicador heurístico de ingredientes convectivos; no es un aviso ni una predicción de granizo.'
  };
}

function parseDelimited(text){
  var lines=String(text||'').replace(/\r/g,'').split('\n').filter(function(x){return x.trim();});
  if(!lines.length)return [];
  var sep=lines[0].indexOf(';')>=0?';':lines[0].indexOf('\t')>=0?'\t':',';
  var head=lines[0].split(sep).map(function(x){return x.trim().replace(/^"|"$/g,'');});
  return lines.slice(1).map(function(line){
    var a=line.split(sep),o={};head.forEach(function(h,i){o[h]=(a[i]||'').trim().replace(/^"|"$/g,'');});return o;
  });
}
function importCSV(text,meta){
  var rows=parseDelimited(text),keys=rows.length?Object.keys(rows[0]):[];
  function find(re){for(var i=0;i<keys.length;i++)if(re.test(keys[i].toLowerCase()))return keys[i];return null;}
  var map={
    time:find(/timestamp|fecha|date|time|hora/),
    wind:find(/wind.*speed|windspeed|velocidad.*viento|viento.*(m\/s|kmh|km\/h)|^wind$/),
    gust:find(/gust|rafaga|ráfaga/),dir:find(/wind.*dir|direccion.*viento|dirección.*viento|^wd$/),
    temp:find(/temp|t_amb|tamb/),ghi:find(/ghi|shortwave|globhor|global.*horiz/),
    dhi:find(/dhi|diffhor|diffuse/),dni:find(/dni|direct_normal/)
  };
  var pts=rows.map(function(r){
    var w=num(map.wind?r[map.wind]:null),g=num(map.gust?r[map.gust]:null);
    var wh=(map.wind||'').toLowerCase(),gh=(map.gust||'').toLowerCase();
    if(w!=null&&/(km\s*\/?h|kmh|kph)/.test(wh))w/=3.6;
    if(g!=null&&/(km\s*\/?h|kmh|kph)/.test(gh))g/=3.6;
    var tt=map.time?r[map.time]:null,dt=tt?new Date(tt):null;
    return {
      time:dt&&!isNaN(dt)?dt.toISOString():tt,
      wind_speed_10m_ms:w,wind_gust_10m_ms:g,wind_direction_10m_deg:num(map.dir?r[map.dir]:null),
      temperature_c:num(map.temp?r[map.temp]:null),ghi_wm2:num(map.ghi?r[map.ghi]:null),
      dhi_wm2:num(map.dhi?r[map.dhi]:null),dni_wm2:num(map.dni?r[map.dni]:null)
    };
  }).filter(function(p){return !!p.time;});
  var d={schema:SCHEMA.version,meta:{
    provider:(meta&&meta.provider)||'hsu_csv',mode:'measured',lat:num(meta&&meta.lat),lon:num(meta&&meta.lon),
    retrieved_at:nowIso(),filename:(meta&&meta.filename)||null,resolution_minutes:null
  },points:pts,column_map:map};
  return publish(d);
}

global.FactiunMeteo={
  VERSION:VERSION,SCHEMA:SCHEMA,SOURCES:SOURCES,STORAGE_KEY:STORAGE_KEY,CONFIG_KEY:CONFIG_KEY,
  getConfig:getConfig,setConfig:setConfig,publish:publish,latest:latest,subscribe:subscribe,
  fetchOpenMeteo:fetchOpenMeteo,fetchWeatherNext:fetchWeatherNext,derive:derive,importCSV:importCSV,
  normalizeWeatherNextPoint:normalizeWeatherNextPoint
};
})(window);
