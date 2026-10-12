#!/usr/bin/env node
/* WeatherContract v2 → Sol & Simulación.
   Banco puro: no necesita motor Python ni red.
*/
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const code=fs.readFileSync(path.join(ROOT,"lib/weather-contract-energy.js"),"utf8");
const W=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const html=fs.readFileSync(path.join(ROOT,"sim-solar.html"),"utf8");
let ok=0,ko=0;
function check(n,v,x=""){
  if(v){ok++;console.log("OK   "+n);}
  else{ko++;console.log("FAIL "+n+(x?" -> "+x:""));}
}

function rows(year=2024,n=8760){
  return Array.from({length:n},(_,i)=>({
    t:new Date(Date.UTC(year,0,1)+i*3600000).toISOString(),
    ghi_wm2:i%24>6&&i%24<19?500:0,
    dni_wm2:i%24>6&&i%24<19?650:0,
    dhi_wm2:i%24>6&&i%24<19?100:0,
    temp_c:15,wind_ms:4,wind_dir_deg:180
  }));
}
const base={
  schema_version:"2.0.0",kind:"tmy",contract_id:"wc:tmy:test",
  site:{lat:42.82,lon:-1.65,timezone:"Europe/Madrid"},
  source:{id:"pvgis_hourly",label:"PVGIS TMY"},
  temporal:{operational_resolution_min:60},
  qa:{dataset_hash:"hash-tmy"},rows:rows()
};

check("distancia cero para el mismo sitio",W.contractSiteDistanceKm(base,42.82,-1.65)<1e-6);
check("haversine detecta sitios distintos",W.haversineKm(42.82,-1.65,60.17,24.94)>2000);

const tmy=W.selectAnnualWeatherRows(base);
check("TMY conserva sus 8760 filas",tmy.rows.length===8760,String(tmy.rows.length));
check("TMY conserva el tipo",tmy.kind==="tmy");
check("TMY conserva el año base",tmy.year===2024,String(tmy.year));

const multi={...base,kind:"historical",rows:[...rows(2023),...rows(2024)]};
const hist=W.selectAnnualWeatherRows(multi);
check("histórico elige el año completo más reciente",hist.year===2024,String(hist.year));
check("histórico devuelve solo un año",hist.rows.length===8760,String(hist.rows.length));

const out=W.weatherContractToMeteoInline(base,{lat:42.82,lon:-1.65});
check("payload tiene 8760 timestamps",out.meteo.timestamps.length===8760);
check("payload conserva GHI/DNI/DHI",out.meteo.ghi[12]===500&&out.meteo.dni[12]===650&&out.meteo.dhi[12]===100);
check("payload conserva temperatura y viento",out.meteo.temp_air[0]===15&&out.meteo.wind_speed[0]===4);
check("payload conserva dirección cuando está completa",out.meteo.wind_dir[0]===180);
check("payload propaga dt_h horario",out.dt_h===1,String(out.dt_h));
check("payload propaga contract_id/hash",out.contract_id==="wc:tmy:test"&&out.dataset_hash==="hash-tmy");
check("payload propaga TZ",out.timezone==="Europe/Madrid");

let wrong=false;
try{W.weatherContractToMeteoInline(base,{lat:60.17,lon:24.94,maxDistanceKm:5});}
catch(e){wrong=/otro emplazamiento/.test(e.message);}
check("contrato de otro emplazamiento se rechaza",wrong);

let incomplete=false;
const bad={...base,rows:rows().map((r,i)=>i===10?{...r,dni_wm2:null}:r)};
try{W.weatherContractToMeteoInline(bad,{lat:42.82,lon:-1.65});}
catch(e){incomplete=/completo|incompleto/.test(e.message);}
check("un hueco requerido no se rellena con cero",incomplete);

const noDir={...base,rows:rows().map(r=>({...r,wind_dir_deg:null}))};
const noDirOut=W.weatherContractToMeteoInline(noDir,{lat:42.82,lon:-1.65});
check("dirección incompleta se omite en vez de inventarse",!("wind_dir" in noDirOut.meteo));

check("sim-solar muestra procedencia meteorológica",html.includes('id="prodMeteo"'));
check("sim-solar busca TMY/historical activos",html.includes("activeEnergyWeather"));
check("Rápida puede mandar meteo inline",html.includes("body.meteo_mode='inline'")&&html.includes("ENGINE+'/generation'"));
check("Bancable usa el mismo payload meteorológico",html.includes("aplicaMeteoBody({lat:lat,lon:lon,policy:'pvlib'")&&html.includes("ENGINE+'/bankable'"));
check("Bancable propaga dt_h del contrato",html.includes("body.dt_h=wx"));
check("Open-Meteo queda rotulado como fallback",html.includes("Open-Meteo <b>fallback</b>")&&html.includes("Open-Meteo fallback"));
check("resultado visible lleva contract_id y hash",html.includes("wx.contract_id")&&html.includes("wx.dataset_hash"));

console.log("");
console.log((ko?"FALLA":"TODO OK")+" — "+ok+" comprobaciones"+(ko?" · "+ko+" fallos":""));
process.exit(ko?1:0);
