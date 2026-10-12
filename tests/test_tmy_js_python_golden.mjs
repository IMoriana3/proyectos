#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const fixturePath=path.join(HERE,"fixtures","meteo_tmy_js_python_v1.json");
const f=JSON.parse(fs.readFileSync(fixturePath,"utf8"));
const run=spawnSync(process.execPath,[path.join(HERE,"tmy_js_python_golden_runner.mjs"),fixturePath],
  {encoding:"utf8"});
let ok=0,ko=0;
function check(n,v,x=""){if(v){ok++;console.log("OK   "+n)}else{ko++;console.log("FAIL "+n+(x?" -> "+x:""))}}

check("runner JS sale limpio",run.status===0,(run.stderr||"").slice(0,300));
let r={};
try{r=JSON.parse(run.stdout||"{}");}catch(e){check("runner devuelve JSON",false,e.message);}
check("fixture tiene esquema congelado",r.fixture_schema==="1.0.0",r.fixture_schema);
check("TMY tiene 8760 filas",r.rows===f.expected.rows,String(r.rows));
check("TMY conserva tres años candidatos",r.n_years===f.expected.n_years,String(r.n_years));
check("TMY usa el base_year del fixture",r.base_year===f.base_year,String(r.base_year));
check("primer timestamp coincide",r.first_timestamp===f.expected.first_timestamp,r.first_timestamp);
check("último timestamp coincide",r.last_timestamp===f.expected.last_timestamp,r.last_timestamp);
check("selección mensual completa",
  JSON.stringify(r.months_selected)===JSON.stringify(f.expected.months_selected),
  JSON.stringify(r.months_selected));
check("hay 12 FS finitos",
  Object.values(r.fs_scores||{}).length===12&&Object.values(r.fs_scores||{}).every(Number.isFinite));
check("los meses no colapsan al mismo año",
  new Set(Object.values(r.months_selected||{})).size===3,
  JSON.stringify(r.months_selected));
check("GHI queda físico",r.stats?.ghi_wm2?.min>=0&&r.stats?.ghi_wm2?.max<1400,
  JSON.stringify(r.stats?.ghi_wm2));
check("DNI queda físico",r.stats?.dni_wm2?.min>=0&&r.stats?.dni_wm2?.max<1100,
  JSON.stringify(r.stats?.dni_wm2));
check("DHI queda físico",r.stats?.dhi_wm2?.min>=0&&r.stats?.dhi_wm2?.max<900,
  JSON.stringify(r.stats?.dhi_wm2));
check("temperatura queda en rango terrestre",r.stats?.temp_c?.min>-60&&r.stats?.temp_c?.max<60,
  JSON.stringify(r.stats?.temp_c));
check("viento queda no negativo y razonable",r.stats?.wind_ms?.min>=0&&r.stats?.wind_ms?.max<75,
  JSON.stringify(r.stats?.wind_ms));
check("estadísticos no tienen NaN",["ghi_wm2","dni_wm2","dhi_wm2","temp_c","wind_ms"].every(k=>
  ["min","max","mean","p50","p99"].every(q=>Number.isFinite(r.stats?.[k]?.[q]))));
const qaIds=(r.qa_findings||[]).map(x=>x.check).sort();
check("QA compartido detecta exactamente los casos congelados",
  JSON.stringify(qaIds)===JSON.stringify(f.qa_vector.expected_ids.slice().sort()),
  JSON.stringify(qaIds));
check("QA conserva severidades fail/warn",
  (r.qa_findings||[]).filter(x=>x.severity==="fail").length===2&&
  (r.qa_findings||[]).filter(x=>x.severity==="warn").length===3,
  JSON.stringify(r.qa_findings));

console.log("");
console.log((ko?"FALLA":"TODO OK")+" — "+ok+" comprobaciones"+(ko?" · "+ko+" fallos":""));
process.exit(ko?1:0);
