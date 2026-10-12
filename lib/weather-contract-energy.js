/* WeatherContract v2 → payloads de producción SolarGPT.
   ----------------------------------------------------
   Selecciona un año meteorológico utilizable sin inventar datos y comprueba
   que el contrato pertenece al mismo emplazamiento que la simulación.

   WEATHER informa; el motor SolarGPT calcula la energía.
*/
export const ENERGY_CONTRACT_VERSION="1.0.0";

const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));

export function haversineKm(lat1,lon1,lat2,lon2){
  const a=[lat1,lon1,lat2,lon2].map(Number);
  if(!a.every(Number.isFinite))return null;
  const R=6371,d2r=Math.PI/180;
  const dlat=(a[2]-a[0])*d2r,dlon=(a[3]-a[1])*d2r;
  const s=Math.sin(dlat/2)**2+Math.cos(a[0]*d2r)*Math.cos(a[2]*d2r)*Math.sin(dlon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}

export function contractSiteDistanceKm(pkg,lat,lon){
  return haversineKm(lat,lon,pkg?.site?.lat,pkg?.site?.lon);
}

function validRows(rows){
  return (rows||[]).filter(r=>r&&r.t&&!Number.isNaN(Date.parse(r.t)));
}

function yearGroups(rows){
  const g=new Map();
  for(const r of validRows(rows)){
    const y=new Date(r.t).getUTCFullYear();
    if(!Number.isFinite(y))continue;
    if(!g.has(y))g.set(y,[]);
    g.get(y).push(r);
  }
  return g;
}

function completeEnergyRows(rows){
  const required=["ghi_wm2","dni_wm2","dhi_wm2","temp_c","wind_ms"];
  return rows.length>=8000&&rows.length<=9000&&rows.every(r=>
    required.every(k=>finite(r[k]))
  );
}

export function selectAnnualWeatherRows(pkg){
  if(!pkg||pkg.schema_version!=="2.0.0"||!Array.isArray(pkg.rows))
    throw new Error("WeatherContract v2 inválido");

  const rows=validRows(pkg.rows).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
  if(pkg.kind==="tmy"){
    if(!completeEnergyRows(rows))
      throw new Error("WeatherContract TMY no trae un año completo con GHI/DNI/DHI/T/WS");
    return {rows,year:new Date(rows[0].t).getUTCFullYear(),kind:"tmy"};
  }

  const groups=[...yearGroups(rows).entries()]
    .sort((a,b)=>b[0]-a[0]);
  const found=groups.find(([,rr])=>completeEnergyRows(rr));
  if(!found)
    throw new Error("WeatherContract histórico no contiene un año horario completo utilizable");
  return {rows:found[1],year:found[0],kind:pkg.kind||"historical"};
}

function fullArray(rows,key){
  return rows.every(r=>finite(r[key]))?rows.map(r=>Number(r[key])):null;
}

export function weatherContractToMeteoInline(pkg,{lat,lon,maxDistanceKm=5}={}){
  const d=contractSiteDistanceKm(pkg,lat,lon);
  if(d==null)throw new Error("WeatherContract sin coordenadas de emplazamiento");
  if(d>maxDistanceKm)
    throw new Error("WeatherContract pertenece a otro emplazamiento ("+d.toFixed(1)+" km)");

  const picked=selectAnnualWeatherRows(pkg),rows=picked.rows;
  const ghi=fullArray(rows,"ghi_wm2"),dni=fullArray(rows,"dni_wm2"),
        dhi=fullArray(rows,"dhi_wm2"),temp=fullArray(rows,"temp_c"),
        wind=fullArray(rows,"wind_ms"),dir=fullArray(rows,"wind_dir_deg");
  if(!ghi||!dni||!dhi||!temp||!wind)
    throw new Error("WeatherContract incompleto para producción energética");

  const meteo={
    timestamps:rows.map(r=>r.t),
    ghi,dni,dhi,temp_air:temp,wind_speed:wind
  };
  if(dir)meteo.wind_dir=dir;

  const dts=rows.length>1?(Date.parse(rows[1].t)-Date.parse(rows[0].t))/60000:null;
  const step=Number(pkg.temporal?.operational_resolution_min);
  return {
    meteo,
    year:picked.year,
    rows:rows.length,
    step_min:Number.isFinite(step)&&step>0?step:(Number.isFinite(dts)&&dts>0?dts:null),
    dt_h:Number.isFinite(step)&&step>0?step/60:(Number.isFinite(dts)&&dts>0?dts/60:null),
    contract_id:pkg.contract_id||null,
    dataset_hash:pkg.qa?.dataset_hash||null,
    source_id:pkg.source?.id||null,
    source_label:pkg.source?.label||pkg.source?.id||"WeatherContract",
    timezone:pkg.site?.timezone||pkg.temporal?.timezone||"UTC",
    distance_km:d,
    kind:picked.kind
  };
}

export async function activeEnergyWeather(api,{lat,lon,maxDistanceKm=5}={}){
  if(!api?.loadActiveWeatherContract)throw new Error("API WeatherContract no disponible");
  const errors=[];
  for(const kind of ["tmy","historical"]){
    try{
      const pkg=await api.loadActiveWeatherContract(kind);
      if(!pkg){errors.push(kind+": no activo");continue;}
      return {...weatherContractToMeteoInline(pkg,{lat,lon,maxDistanceKm}),pkg};
    }catch(e){errors.push(kind+": "+String(e?.message||e));}
  }
  throw new Error(errors.join(" · "));
}

export function weatherContractStampText(x){
  if(!x)return "";
  return "WeatherContract "+(x.kind||"")+" · "+(x.source_id||x.source_label||"?")+
    " · "+x.rows+" filas · hash "+(x.dataset_hash||"—")+
    " · TZ "+(x.timezone||"—");
}
