/* Factiun · WeatherContract -> SolarGPT engine inline meteo
   ---------------------------------------------------------
   Annual production simulations prefer the shared TMY WeatherContract.
   Open-Meteo remains a declared fallback in sim-solar.html when no valid
   annual contract is available.
*/
export function contractStamp(pkg){
  return {
    schema_version:pkg?.schema_version||null,
    contract_id:pkg?.contract_id||null,
    dataset_hash:pkg?.qa?.dataset_hash||null,
    source_id:pkg?.source?.id||null,
    timezone:pkg?.site?.timezone||pkg?.temporal?.timezone||null,
    rows:pkg?.rows?.length||0,
    kind:pkg?.kind||null
  };
}
const finite=v=>v===null||v===undefined||v===""?null:(Number.isFinite(+v)?+v:null);

export function contractToEngineMeteo(pkg){
  if(!pkg||pkg.schema_version!=="2.0.0"||!Array.isArray(pkg.rows))
    throw new Error("WeatherContract v2 inválido");
  if(pkg.kind!=="tmy")
    throw new Error("Producción anual requiere WeatherContract TMY");
  if(pkg.rows.length<8000||pkg.rows.length>9000)
    throw new Error("WeatherContract TMY debe contener aproximadamente un año horario");
  const rows=pkg.rows.filter(r=>r&&r.t);
  if(rows.length!==pkg.rows.length)throw new Error("WeatherContract TMY contiene filas sin timestamp");
  const meteo={
    timestamps:[],ghi:[],dni:[],dhi:[],temp_air:[],wind_speed:[],wind_dir:[]
  };
  for(const r of rows){
    meteo.timestamps.push(r.t);
    meteo.ghi.push(finite(r.ghi_wm2));
    meteo.dni.push(finite(r.dni_wm2));
    meteo.dhi.push(finite(r.dhi_wm2));
    meteo.temp_air.push(finite(r.temp_c));
    meteo.wind_speed.push(finite(r.wind_ms));
    meteo.wind_dir.push(finite(r.wind_dir_deg));
  }
  if(meteo.ghi.every(v=>v===null))throw new Error("WeatherContract TMY sin GHI");
  return {meteo,stamp:contractStamp(pkg)};
}

export async function loadAnnualContract(){
  const api=await import("./weather-contract.js");
  const pkg=await api.loadActiveWeatherContract("tmy");
  if(!pkg)throw new Error("sin WeatherContract TMY activo");
  return {pkg,...contractToEngineMeteo(pkg)};
}
