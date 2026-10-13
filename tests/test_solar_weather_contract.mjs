import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as A from "../lib/weather-contract-engine.js";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
let ok=0,ko=0;
function check(name,cond,extra=""){
  if(cond){ok++;console.log("OK   "+name);}
  else{ko++;console.log("FAIL "+name+(extra?" -> "+extra:""));}
}
const rows=Array.from({length:8760},(_,i)=>({
  t:new Date(Date.UTC(2023,0,1)+i*3600000).toISOString(),
  ghi_wm2:i%24===12?500:0,dni_wm2:i%24===12?650:0,dhi_wm2:i%24===12?100:0,
  temp_c:15,wind_ms:4,wind_dir_deg:180
}));
const pkg={schema_version:"2.0.0",contract_id:"wc:tmy:test",kind:"tmy",
  site:{timezone:"Europe/Madrid"},source:{id:"open_meteo"},qa:{dataset_hash:"hash-tmy"},rows};
const z=A.contractToEngineMeteo(pkg);
check("adapter conserva 8760 timestamps",z.meteo.timestamps.length===8760);
check("adapter conserva GHI/DNI/DHI",z.meteo.ghi[12]===500&&z.meteo.dni[12]===650&&z.meteo.dhi[12]===100);
check("adapter conserva temperatura/viento",z.meteo.temp_air[12]===15&&z.meteo.wind_speed[12]===4);
check("adapter conserva rumbo",z.meteo.wind_dir[12]===180);
check("sello conserva contract_id",z.stamp.contract_id==="wc:tmy:test");
check("sello conserva hash",z.stamp.dataset_hash==="hash-tmy");
check("sello conserva TZ",z.stamp.timezone==="Europe/Madrid");
let badKind=false;try{A.contractToEngineMeteo({...pkg,kind:"historical"});}catch(e){badKind=/TMY/.test(e.message);}
check("producción anual rechaza histórico como sustituto silencioso",badKind);
let short=false;try{A.contractToEngineMeteo({...pkg,rows:rows.slice(0,100)});}catch(e){short=/año horario/.test(e.message);}
check("TMY corto se rechaza",short);

const html=fs.readFileSync(path.join(ROOT,"sim-solar.html"),"utf8");
check("sim-solar intenta WeatherContract antes del fallback",html.includes("annualMeteoForEngine")&&html.includes("loadAnnualContract"));
check("bankable acepta meteo inline del contrato",html.includes("meteo_mode:wx.meteo_mode,meteo:wx.meteo"));
check("generación acepta meteo inline del contrato",html.includes("meteo_mode:wx.meteo_mode,meteo:wx.meteo"));
check("fallback Open-Meteo queda declarado",html.includes("Fallback Open-Meteo"));
check("resultado visible lleva contract_id/hash",html.includes("LAST_WEATHER_STAMP.contract_id")&&html.includes("LAST_WEATHER_STAMP.dataset_hash"));

console.log("");
console.log((ko?"FALLA":"TODO OK")+" — "+ok+" comprobaciones"+(ko?" · "+ko+" fallos":""));
process.exit(ko?1:0);
