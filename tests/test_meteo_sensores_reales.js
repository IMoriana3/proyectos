/* Regresión meteo: no confundir placeholders con medidas reales.
 * Ejecutar: node tests/test_meteo_sensores_reales.js
 * Sin red ni credenciales. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const moduleOf = async name =>
  import("data:text/javascript;base64,"+Buffer.from(fs.readFileSync(path.join(root,"lib",name),"utf8")).toString("base64"));
(async()=>{
  const {parseSensorCsv,analyzeSensorRecords,buildSensorChart} = await moduleOf("meteo-sensors.js");
  const {normalizeSupabaseMeteo,fetchSupabaseMeteo} = await moduleOf("meteo-supabase.js");
  let checks=0;
  const check=(name,fn)=>{fn();checks++;console.log("OK "+name)};
  const A="2026-10-01T00:00:00Z", B="2026-10-01T00:01:00Z", C="2026-10-01T00:02:00Z";
  check("CSV: cero verdadero != dato vacío",()=>{
    const x=parseSensorCsv("timestamp;sensor;variable;value;unit\n"+A+";P1;ghi;;W/m2\n"+B+";P1;ghi;0;W/m2",{defaultPlant:"El Burgo I"});
    assert.equal(x.warnings.badValue,1);assert.equal(x.records.length,1);assert.equal(x.records[0].value,0);
  });
  check("viento: km/h -> m/s solo donde procede",()=>{
    const x=parseSensorCsv("timestamp;plant;N1.wind_speed[m/s];N2.wind_speed[km/h]\n"+A+";P;4;14,4");
    const c=analyzeSensorRecords(x.records).comparisons[0];
    assert.ok(Math.abs(c.bias)<1e-10);assert.equal(c.n,1);
  });
  check("no comparar magnitudes diferentes ni plantas",()=>{
    const x=parseSensorCsv("timestamp,plant,ncu,sensor,variable,value,unit\n"+A+",P,1,P1,ghi,500,W/m2\n"+A+",P,1,P2,poa,500,W/m2\n"+A+",Q,1,P3,ghi,500,W/m2");
    assert.equal(analyzeSensorRecords(x.records).comparisons.length,0);
  });
  check("sesgo temporal y coherencia de pares",()=>{
    const csv="timestamp,plant,ncu,sensor,variable,value,unit\n"+
      A+",P,1,HSU 230,wind_speed,5,m/s\n"+B+",P,1,HSU 230,wind_speed,7,m/s\n"+
      A+",P,2,HSU 230,wind_speed,4,m/s\n"+B+",P,2,HSU 230,wind_speed,6,m/s";
    const c=analyzeSensorRecords(parseSensorCsv(csv).records).comparisons[0];
    assert.equal(c.n,2);assert.equal(c.bias,1);assert.equal(c.mae,1);
    assert.ok(c.a.startsWith("1/")||c.a.startsWith("2/"));
  });
  check("dirección del viento circular: 359° / 1°",()=>{
    const csv="timestamp,plant,ncu,sensor,variable,value,unit\n"+
      A+",P,1,V1,wind_direction,359,deg\n"+B+",P,1,V1,wind_direction,1,deg\n"+
      A+",P,1,V2,wind_direction,1,deg\n"+B+",P,1,V2,wind_direction,359,deg";
    const r=analyzeSensorRecords(parseSensorCsv(csv).records);
    assert.ok(r.stats.every(s=>s.mean<2||s.mean>358));
    assert.equal(r.comparisons[0].mae,2);
  });
  check("nieve detectada vs cero sin dato",()=>{
    const csv="timestamp,plant,ncu,sensor,variable,value,unit\n"+
      A+",P,1,N1,snow_alarm,0,boolean\n"+B+",P,1,N1,snow_alarm,1,boolean\n"+
      A+",P,1,N2,snow_alarm,0,boolean\n"+B+",P,1,N2,snow_alarm,0,boolean";
    const z=analyzeSensorRecords(parseSensorCsv(csv).records);
    assert.equal(z.stats.find(s=>s.sensor==="N1").on_pct,50);
    assert.equal(z.comparisons[0].mismatch_pct,50);
  });
  check("irradiancia raw no se integra ni cambia de escala",()=>{
    const p=parseSensorCsv("timestamp,plant,sensor,variable,value,unit\n"+A+",P,Meteo 210,irradiance_raw,-100,raw");
    const s=analyzeSensorRecords(p.records).stats[0];assert.equal(s.mean,-100);assert.equal(s.energy,null);
  });
  check("no integrar irradiancia a través de huecos",()=>{
    const p=parseSensorCsv("timestamp,plant,sensor,variable,value,unit\n"+
      "2026-10-01T10:00:00Z,P,P1,ghi,100,W/m2\n"+
      "2026-10-01T11:00:00Z,P,P1,ghi,200,W/m2\n"+
      "2026-10-01T17:00:00Z,P,P1,ghi,300,W/m2");
    const s=analyzeSensorRecords(p.records).stats[0];
    assert.equal(s.gaps,1);assert.equal(s.energy.coverage_hours,1);
    assert.ok(Math.abs(s.energy.kwh_m2-.15)<1e-10);
  });
  check("Supabase WFU preserva negativos; HSU 0 de relleno se excluye",()=>{
    const wfu={id:1,planta:"El Burgo I",ncu:"2",equipo:"Meteo 210",clase:"wfu",dia:"2026-10-06",tz:"UTC",filas:100,subido:"2026-10-07T00:00:00Z",
      series:{t:[0,60],v:{irradiance:[-100,60000],wind_speed:0}}};
    const hsu={...wfu,id:2,equipo:"HSU 230",clase:"hsu",series:{t:[0,60],v:{wind_speed:[4,5],wind_speed_max:[8,9],irradiance:0}}};
    const out=normalizeSupabaseMeteo([wfu,hsu]);
    assert.equal(out.diagnostics.scalarPlaceholders,2);
    assert.equal(out.diagnostics.negativeIrradiance,1);
    assert.equal(out.records.filter(r=>r.variable==="irradiance_raw").length,2);
    assert.equal(out.records.filter(r=>r.sensor==="HSU 230"&&r.variable==="irradiance_raw").length,0);
  });
  check("duplicados por día conservan solo la última importación",()=>{
    const b={id:1,planta:"P",ncu:"1",equipo:"HSU 231",clase:"hsu",dia:"2026-10-08",tz:"UTC",filas:4,subido:"2026-10-08T10:00:00Z",series:{t:[0,60],v:{wind_speed:[2,3]}}};
    const n={...b,id:2,subido:"2026-10-13T10:00:00Z",series:{t:[0,60],v:{wind_speed:[4,5]}}};
    const p=normalizeSupabaseMeteo([b,n]);assert.equal(p.records.length,2);
    assert.deepEqual(p.records.map(x=>x.value),[4,5]);assert.equal(p.diagnostics.repeatedUploads,1);
  });
  check("gráfica no inventa puntos en intervalos sin datos",()=>{
    const p=parseSensorCsv("timestamp,plant,sensor,variable,value,unit\n"+A+",P,P1,wind_speed,1,m/s\n"+
      "2026-10-01T01:00:00Z,P,P1,wind_speed,2,m/s");
    const g=buildSensorChart(analyzeSensorRecords(p.records),"wind_speed");
    assert.ok(g.series[0].values.some(x=>x===null));
  });
  const fake={id:1,planta:"El Burgo I",ncu:"1",equipo:"HSU 230",clase:"hsu",dia:"2026-10-08",tz:"UTC",filas:2,subido:"2026-10-09T00:00:00Z",
    series:{t:[0,60],v:{wind_speed:[2,3]}}};
  function client(rows){
    const mock={
      select(){return this;},eq(){return this;},in(){return this;},order(){return this;},
      gte(){return this;},lte(){return this;},
      limit(){return Promise.resolve({data:[{dia:"2026-10-08"}],error:null})},
      range(a,b){return Promise.resolve({data:rows.slice(a,b+1),error:null})}
    };
    return {auth:{getUser:async()=>({data:{user:{id:"test-user"}},error:null})},from:()=>Object.create(mock)};
  }
  const found=await fetchSupabaseMeteo(client([fake]),{plant:"El Burgo I"});
  assert.equal(found.from,"2026-10-02");assert.equal(found.to,"2026-10-08");
  assert.equal(found.records.length,2);checks++;console.log("OK Supabase login y últimos 7 días");
  const ui=fs.readFileSync(path.join(root,"meteo.html"),"utf8");
  check("tarjeta existente conectada y sin service_role",()=>{
    assert.ok(ui.includes('fetchSupabaseMeteo('));
    assert.ok(ui.includes('supabase-js@2.118.0'));
    assert.ok(!fs.readFileSync(path.join(root,"lib/meteo-supabase.js"),"utf8").includes("service"+"_"+"role="));
  });
  console.log("PASS "+checks+" verificaciones");
})().catch(e=>{console.error(e);process.exitCode=1;});
