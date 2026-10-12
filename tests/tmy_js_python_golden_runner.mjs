#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const fixturePath=process.argv[2]||path.join(HERE,"fixtures","meteo_tmy_js_python_v1.json");
const fixture=JSON.parse(fs.readFileSync(fixturePath,"utf8"));
const browserCode=fs.readFileSync(path.join(HERE,"..","lib","meteo-browser.js"),"utf8");
const M=await import("data:text/javascript;base64,"+Buffer.from(browserCode).toString("base64"));

function leap(y){return y%4===0&&(y%100!==0||y%400===0);}
function doyUTC(d){
  return Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-
    Date.UTC(d.getUTCFullYear(),0,1))/86400000)+1;
}
function rowsFromFixture(f){
  const rows=[],years=f.years.slice().sort((a,b)=>a-b),g=f.generator;
  for(const y of years){
    const end=Date.UTC(y+1,0,1);
    for(let ms=Date.UTC(y,0,1);ms<end;ms+=3600000){
      const d=new Date(ms);
      if(d.getUTCMonth()===1&&d.getUTCDate()===29)continue;
      const month=d.getUTCMonth()+1,h=d.getUTCHours(),dy=doyUTC(d);
      const target=+f.target_year_by_month[String(month)];
      const others=years.filter(v=>v!==target);
      const power=y===target?1:(y===others[0]?g.low_shape_power:g.high_shape_power);
      const amp=y===target?1:(y===others[0]?g.low_diurnal_amplitude:g.high_diurnal_amplitude);
      const sun=Math.max(0,Math.sin(Math.PI*(h-6)/12));
      const season=.75+.25*Math.sin(2*Math.PI*(dy-80)/365);
      const ghi=900*Math.pow(sun,power)*season;
      const dni=700*Math.pow(sun,power*1.05)*(.85+.15*season);
      const dhi=Math.max(0,ghi-dni*.55);
      const tempBase=12+10*Math.sin(2*Math.PI*(dy-172)/365);
      const temp=tempBase+(3*amp)*Math.sin(2*Math.PI*(h-14)/24);
      const wind=3+(1.2*amp)*Math.sin(2*Math.PI*h/24+.4*month);
      rows.push({
        t:d.toISOString(),ghi_wm2:ghi,dni_wm2:dni,dhi_wm2:dhi,
        temp_c:temp,wind_ms:wind
      });
    }
  }
  return rows;
}

function qaRowsFromFixture(f){
  const q=f.qa_vector,m=q.mutations,rows=[];
  for(let i=0;i<q.rows;i++){
    rows.push({
      t:new Date(Date.UTC(2025,0,1)+i*3600000).toISOString(),
      ghi_wm2:i===m.ghi_negative_row?-5:500,
      dni_wm2:i===m.dni_absurd_row?1200:700,
      dhi_wm2:i<m.dhi_null_rows?null:100,
      temp_c:i===m.temp_outlier_row?70:15,
      wind_ms:i===m.wind_outlier_row?80:4
    });
  }
  return rows;
}

const sourceRows=rowsFromFixture(fixture);
const qaRows=qaRowsFromFixture(fixture);
const qa=M.plausibility(qaRows,NaN,NaN);
const tmy=M.buildTmySandia(sourceRows,{baseYear:fixture.base_year,smooth:true});
const stats=M.statsTable(tmy.rows);
const result={
  fixture_schema:fixture.schema_version,
  workbench_version:M.WORKBENCH_VERSION,
  source_rows:sourceRows.length,
  rows:tmy.rows.length,
  n_years:tmy.info.n_years,
  base_year:tmy.info.base_year,
  months_selected:tmy.info.months_selected,
  fs_scores:tmy.info.fs_scores,
  first_timestamp:tmy.rows[0]?.t||null,
  last_timestamp:tmy.rows.at(-1)?.t||null,
  qa_findings:qa.map(x=>({check:x.check,severity:x.severity})),
  stats:{
    ghi_wm2:stats.ghi_wm2,
    dni_wm2:stats.dni_wm2,
    dhi_wm2:stats.dhi_wm2,
    temp_c:stats.temp_c,
    wind_ms:stats.wind_ms
  }
};
process.stdout.write(JSON.stringify(result));
