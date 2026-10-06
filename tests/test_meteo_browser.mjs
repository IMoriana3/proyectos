import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const code=fs.readFileSync(path.join(__dirname,"../lib/meteo-browser.js"),"utf8");
const M=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));

let fails=0,oks=0;
function check(name,cond,detail=""){
  if(cond){oks++;console.log("OK   "+name);}
  else{fails++;console.log("FAIL "+name+(detail?" · "+detail:""));}
}
function near(a,b,tol=1e-9){return Number.isFinite(a)&&Math.abs(a-b)<=tol;}

check("versión browser core 0.4.0",M.WORKBENCH_VERSION==="0.4.0");

function syntheticYears(){
  const rows=[];
  for(const year of [2021,2022]){
    const start=Date.UTC(year,0,1),n=8760;
    const factor=year===2021?0.96:1.04;
    for(let h=0;h<n;h++){
      const t=new Date(start+h*3600000),sp=M.solarPosition(t,40,-3);
      const ghi=sp.cosz>0?900*sp.cosz*factor:0;
      const dni=sp.cosz>0?500*factor:0;
      const dhi=sp.cosz>0?Math.max(0,ghi-dni*sp.cosz):0;
      rows.push({
        t:t.toISOString(),ghi_wm2:ghi,dni_wm2:dni,dhi_wm2:dhi,
        temp_c:14+8*Math.sin(2*Math.PI*(h/24-170)/365),
        dewpoint_c:8,wind_ms:4+Math.sin(2*Math.PI*(h%24)/24),
        precip_mm:(h%401===0?1:0)
      });
    }
  }
  return rows;
}
const years=syntheticYears();
const ast=M.annualStats(years);
check("annualStats devuelve dos años",ast.annual.length===2);
check("screening anual resuelve un año real",[2021,2022].includes(ast.representative_year_screening));
check("GHI anual positivo",ast.annual.every(x=>x.ghi_kwh_m2>0));

const tmy=M.buildTmySandia(years,{baseYear:2023,smooth:false});
check("TMY Sandia tiene 8760 filas",tmy.rows.length===8760,"rows="+tmy.rows.length);
check("TMY selecciona los 12 meses",Object.keys(tmy.info.months_selected).length===12);
check("TMY declara dos años fuente",tmy.info.n_years===2);

// Golden derivado de solargpt_core.meteo.build_tmy_sandia (Python).
// Fixture de 120 h por mes × 2 años; pesos canónicos. Los números se congelan
// para que un refactor JS no cambie el criterio FS en silencio.
const goldenRows=[];
for(const year of [2021,2022]){
  for(let month=1;month<=12;month++){
    const start=Date.UTC(year,month-1,1);
    for(let h=0;h<120;h++){
      const x=h/119,shape=year===2021?x:x*x;
      const off=year===2021?(month%2)*8:((month+1)%2)*8;
      goldenRows.push({
        t:new Date(start+h*3600000).toISOString(),
        ghi_wm2:100+500*shape+off,
        dni_wm2:200+600*shape+off*.8,
        dhi_wm2:50+180*shape+off*.3,
        temp_c:5+20*shape+off*.1,
        dewpoint_c:1+10*shape+off*.05,
        wind_ms:2+5*shape+off*.02
      });
    }
  }
}
const goldenTmy=M.buildTmySandia(goldenRows,{baseYear:2023,smooth:false});
check("golden Python→JS selecciona 2021 en los 12 meses",Object.values(goldenTmy.info.months_selected).every(y=>y===2021));
check("golden FS meses impares coincide con Python",near(goldenTmy.info.fs_scores[1],0.07801785714285715,1e-12));
check("golden FS meses pares coincide con Python",near(goldenTmy.info.fs_scores[2],0.07867857142857144,1e-12));

// Golden del suavizado de frontera mensual del core Python:
// np.convolve(vals,w,"same") / convolve(ones,w,"same"), ventana ±6 h.
const smoothRows=[];
for(const year of [2021,2022]){
  const start=Date.UTC(year,0,1);
  for(let h=0;h<8760;h++){
    const t=new Date(start+h*3600000),d=Math.floor(h/24)+1,hour=h%24;
    const sun=Math.max(0,Math.sin(Math.PI*(hour-6)/12));
    const season=.75+.25*Math.max(0,Math.sin(2*Math.PI*(d-80)/365));
    const ghi=800*sun*season,dni=500*sun*season;
    smoothRows.push({
      t:t.toISOString(),ghi_wm2:ghi,dni_wm2:dni,
      dhi_wm2:Math.max(0,ghi-dni*Math.max(0,Math.sin(Math.PI*(hour-6)/12))),
      temp_c:14+8*Math.sin(2*Math.PI*(h/24-170)/365),
      dewpoint_c:8,wind_ms:4+Math.sin(2*Math.PI*(h%24)/24)
    });
  }
}
const smoothTmy=M.buildTmySandia(smoothRows,{baseYear:2023,smooth:true});
const byT=new Map(smoothTmy.rows.map(r=>[r.t,r]));
check("golden smoothing selecciona 2021 en los 12 meses",Object.values(smoothTmy.info.months_selected).every(y=>y===2021));
check("golden smoothing temperatura Jan31 18h",near(byT.get("2023-01-31T18:00:00.000Z")?.temp_c,8.570961793523486,1e-12));
check("golden smoothing viento Feb01 00h",near(byT.get("2023-02-01T00:00:00.000Z")?.wind_ms,3.919254128517461,1e-12));
check("golden smoothing viento Feb01 06h",near(byT.get("2023-02-01T06:00:00.000Z")?.wind_ms,4.755285718095659,1e-12));

const bad=years.slice(0,48).map(x=>({...x}));
bad[12].ghi_wm2=5000;bad[12].dni_wm2=5000;bad[12].dhi_wm2=2000;
const filtered=M.applyBsrn(bad,40,-3);
check("BSRN elimina el imposible",filtered.removed_count>=1);
check("BSRN no deja GHI de 5000",!filtered.rows.some(x=>x.ghi_wm2===5000));

const huge=Array.from({length:150000},(_,i)=>({
  t:new Date(Date.UTC(2024,0,1)+i*60000).toISOString(),
  ghi_wm2:i%1000,dni_wm2:(i%800),dhi_wm2:(i%200),temp_c:20,wind_ms:5
}));
let hugeStats=null,hugeErr=null;
try{hugeStats=M.statsTable(huge);}catch(e){hugeErr=e;}
check("estadística aguanta 150.000 filas sin spread overflow",!hugeErr,hugeErr?.message);
check("estadística grande conserva máximo",hugeStats?.ghi_wm2?.max===999);

const hail=M.hailRisk(42.8,-1.6,{life:25,lambdaOverride:.2});
check("granizo respeta lambda override",near(hail.lambda_yr,.2));
check("granizo calcula P vida útil",near(hail.p_lifetime,1-Math.exp(-5),1e-12));
check("granizo clasifica lambda 0,2 como medio",hail.tier==="medio");

const w1=M.syntheticWindYear({year:2024,k:2,A:6.5,lat:42,seed:123,withGust:true});
const w2=M.syntheticWindYear({year:2024,k:2,A:6.5,lat:42,seed:123,withGust:true});
check("viento sintético reproducible · media",near(w1.mean_ms,w2.mean_ms));
check("viento sintético reproducible · P99",near(w1.p99_ms,w2.p99_ms));
check("viento sintético bisiesto tiene 8784 horas",w1.wind_speed.length===8784);
check("viento sintético se declara NO medido",/NO es viento medido/.test(w1.not_modeled));

const long=years.slice(0,24*20);
const measured=long.map(r=>({...r,ghi_wm2:r.ghi_wm2*1.10}));
const ad=M.adaptSite(long,measured,{method:"bias",monthly:false});
check("site adaptation tiene solapamiento",ad.result.overlap_points===long.length);
check("site adaptation reduce |MBE|",Math.abs(ad.result.after.mbe_pct)<Math.abs(ad.result.before.mbe_pct));
check("site adaptation mantiene suelo de incertidumbre",ad.uncertainty.irradiance_sigma>=.01);

const interp=M.interpolateRows([
  {t:"2024-01-01T00:00:00.000Z",ghi_wm2:0,dni_wm2:0,dhi_wm2:0,temp_c:10,wind_ms:2,precip_mm:10},
  {t:"2024-01-01T01:00:00.000Z",ghi_wm2:100,dni_wm2:120,dhi_wm2:20,temp_c:14,wind_ms:4,precip_mm:0}
],{stepMin:15});
check("interpolación 15 min crea 5 puntos",interp.rows.length===5);
check("acumulado NO se inventa en subpasos",interp.rows[1].precip_mm===null);
check("acumulado original se conserva",interp.rows[0].precip_mm===10);
check("informe declara acumulados no interpolados",interp.report.accumulated_fields_not_interpolated.includes("precip_mm"));

const csv="timestamp;GHI;DHI;DNI;temperature_2m;wind_speed_10m\n2024-01-01 12:00;500;100;600;15;4\n";
const table=M.csvToTable(csv);
check("parser CSV detecta separador ;",table.length===2&&table[0].length===6);
const parsed=M.csvToMeteo(csv,{lat:40,lon:-3,tz:"UTC"});
check("CSV normaliza GHI",parsed.length===1&&parsed[0].ghi_wm2===500);

const sp=M.solarPosition("2024-03-20T12:00:00Z",0,0);
check("posición solar ecuatorial de equinoccio alta",sp.elevation_deg>85,"el="+sp.elevation_deg);

const impossible=M.plausibility([{t:"2024-06-21T12:00:00Z",ghi_wm2:2000,dni_wm2:500,dhi_wm2:100,temp_c:20,wind_ms:5}],40,-3);
check("plausibilidad marca GHI imposible",impossible.some(x=>x.severity==="fail"));

const html=fs.readFileSync(path.join(__dirname,"../meteo.html"),"utf8");
check("HTML ya no ofrece Motor SolarGPT",!html.includes("Motor SolarGPT"));
check("HTML declara modo autónomo",html.includes("Autónomo"));
check("HTML importa meteo-browser.js",html.includes("./lib/meteo-browser.js"));

try{
  const {chromium}=await import("playwright");
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  await page.route("https://api.open-meteo.com/**",route=>route.fulfill({
    status:200,contentType:"application/json",
    body:JSON.stringify({hourly:{
      time:["2026-10-06T10:00"],temperature_2m:[20],dew_point_2m:[10],
      precipitation:[0],cloud_cover:[25],cloud_cover_low:[10],cloud_cover_mid:[10],cloud_cover_high:[5],
      wind_speed_10m:[4],wind_direction_10m:[180],wind_gusts_10m:[7],
      shortwave_radiation:[500],direct_normal_irradiance:[650],diffuse_radiation:[100],surface_pressure:[1010]
    }})
  }));
  await page.goto((process.env.BASE_URL||process.env.BASE||"http://localhost:8099")+"/meteo.html",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelectorAll("#plantSel option").length>5,{timeout:10000});
  const options=await page.locator("#plantSel option").allTextContents();
  check("desplegable carga varias plantas de la cartera",options.length>5,"n="+options.length);
  check("desplegable incluye El Burgo I",options.some(x=>x.includes("El Burgo I")));
  const width=await page.locator(".wrap").evaluate(el=>el.getBoundingClientRect().width);
  check("workbench aprovecha >1800 px a 1920",width>1800,"width="+width);
  const badge=await page.locator(".badge").first().innerText();
  check("cabecera visible dice autónomo",/Autónomo/i.test(badge));
  await browser.close();
}catch(e){
  check("browser smoke arranca",false,e.message);
}

console.log("");
console.log(oks+" OK · "+fails+" FAIL");
if(fails)process.exit(1);
