import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const code=fs.readFileSync(path.join(__dirname,"../lib/meteo-browser.js"),"utf8");
const M=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const vizCode=fs.readFileSync(path.join(__dirname,"../lib/meteo-viz.js"),"utf8");
const V=await import("data:text/javascript;base64,"+Buffer.from(vizCode).toString("base64"));

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
        wind_dir_deg:(h*17)%360,
        precip_mm:(h%401===0?1:0),
        snowfall_cm:(h<24*20&&h%24===5?0.5:0),
        snow_depth_m:(h<24*20?0.03:0)
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

check("visual layer v1",V.VIZ_VERSION==="1.0.0");
const vm=V.monthlyClimatology(years,"Europe/Madrid");
check("visual mensual tiene 12 meses",vm.length===12);
check("visual mensual GHI positivo",vm.some(x=>x.ghi>0));
const vd=V.dailyMeanSeries(years);
check("visual serie diaria tiene 730 días",vd.length===730,"n="+vd.length);
const vpeak=V.peakDay(years,"ghi_wm2","Europe/Madrid");
check("visual día pico usa fecha local",/^202[12]-\d\d-\d\d$/.test(vpeak),vpeak);
const vprof=V.dayProfile(years,vpeak,"Europe/Madrid");
check("visual perfil local tiene 23-25 puntos",vprof.length>=23&&vprof.length<=25,"n="+vprof.length);
const vcl=V.dailyClimatology(years,"Europe/Madrid");
check("visual climatología DOY tiene 366 puntos",vcl.length===366,"n="+vcl.length);
const vrose=V.windRoseData(years);
check("rosa usa todas las horas con rumbo",vrose.total===years.length,"n="+vrose.total);
check("rosa tiene 16 sectores",vrose.freq.length===16);
check("rosa suma 100%",Math.abs(vrose.freq.flat().reduce((a,b)=>a+b,0)-100)<1e-8);
const vtemp=V.temperatureExtremes(years);
check("histograma térmico tiene 60 bins",vtemp.hist.length===60);
check("extremos térmicos tienen 6 fríos + 4 cálidos",vtemp.cold.length===6&&vtemp.hot.length===4);
const vsnow=V.snowSummary(years,"Europe/Madrid");
check("nieve visual detecta acumulado y manto",vsnow.total>0&&vsnow.maxDepth===3,"snow="+vsnow.total+" depth="+vsnow.maxDepth);
const vcp=V.cockpitMetrics(years,41.5763,"Europe/Madrid");
check("cockpit devuelve 6 familias de 12 meses",["ghi","dni","dhi","tmean","windmean","kt"].every(k=>vcp[k].length===12));
check("kt del cockpit queda entre 0 y 1",vcp.kt.filter(Number.isFinite).every(x=>x>=0&&x<=1));
const vcold=V.coldDaysByMonth(years,"Europe/Madrid");
check("heladas mensuales: 4 umbrales × 12 meses",vcold.length===4&&vcold.every(x=>x.months.length===12));
const vwd=V.windDailyMax(years.slice(0,8784).map(r=>r.wind_ms));
check("viento sintético visual devuelve máximos diarios en km/h",vwd.length===366&&Math.max(...vwd)>10);
const vcmp=V.comparisonMonthly({A:Array.from({length:12},(_,i)=>({month:i+1,GHI:100+i})),B:Array.from({length:12},(_,i)=>({month:i+1,GHI:90+i}))});
check("comparación visual conserva 2 fuentes × 12 meses",vcmp.length===2&&vcmp.every(x=>x.values.length===12));

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
check("HTML importa meteo-viz.js",html.includes("./lib/meteo-viz.js"));
check("HTML contiene rosa de vientos",html.includes('id="vizWindRose"'));
check("HTML contiene cockpit 6 paneles",["vizCockpitGhi","vizCockpitDni","vizCockpitDhi","vizCockpitTemp","vizCockpitWind","vizCockpitKt"].every(id=>html.includes('id="'+id+'"')));
check("informe incrusta visuales como PNG",html.includes("visualReportHtml")&&html.includes('toDataURL("image/png")'));

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
  await page.route("https://archive-api.open-meteo.com/**",route=>{
    const n=24*10,start=Date.UTC(2024,0,1),time=[],ghi=[],temp=[],wind=[],dir=[],snow=[],depth=[];
    for(let i=0;i<n;i++){
      const d=new Date(start+i*3600000),h=i%24;
      time.push(d.toISOString().slice(0,16));
      ghi.push(h>=8&&h<=16?120:0);
      temp.push(6+8*Math.sin(2*Math.PI*(h-8)/24));
      wind.push(4+2*Math.sin(2*Math.PI*h/24));
      dir.push((i*19)%360);
      snow.push(i<48&&h===5?0.5:0);
      depth.push(i<72?0.03:0);
    }
    return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({hourly:{
      time,shortwave_radiation:ghi,temperature_2m:temp,wind_speed_10m:wind,wind_direction_10m:dir,
      snowfall:snow,snow_depth:depth,precipitation:Array(n).fill(0),rain:Array(n).fill(0),
      relative_humidity_2m:Array(n).fill(60),surface_pressure:Array(n).fill(1010),
      showers:Array(n).fill(0),cape:Array(n).fill(0),weather_code:Array(n).fill(1)
    }})});
  });
  await page.goto((process.env.BASE_URL||process.env.BASE||"http://localhost:8099")+"/meteo.html",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelectorAll("#plantSel option").length>5,{timeout:10000});
  const options=await page.locator("#plantSel option").allTextContents();
  check("desplegable carga varias plantas de la cartera",options.length>5,"n="+options.length);
  check("desplegable incluye El Burgo I",options.some(x=>x.includes("El Burgo I")));
  const width=await page.locator(".wrap").evaluate(el=>el.getBoundingClientRect().width);
  check("workbench aprovecha >1800 px a 1920",width>1800,"width="+width);
  const badge=await page.locator(".badge").first().innerText();
  check("cabecera visible dice autónomo",/Autónomo/i.test(badge));

  await page.locator("#y0").fill("2024");await page.locator("#y1").fill("2024");
  await page.locator("#yearsBtn").click();
  await page.waitForFunction(()=>document.querySelector("#workStatus")?.textContent.includes("Histórico listo"),{timeout:20000});
  check("visual mensual pinta 12 filas",await page.locator("#vizMonthlyBody tr").count()===12);
  check("rosa informa horas con dirección",/horas con dirección/.test(await page.locator("#vizWindRoseNote").innerText()));

  async function diversity(id){
    return page.locator("#"+id).evaluate(cv=>{
      const d=cv.getContext("2d").getImageData(0,0,cv.width,cv.height).data,set=new Set(),step=Math.max(4,Math.floor(d.length/6000/4)*4);
      for(let i=0;i<d.length;i+=step)set.add(d[i]+","+d[i+1]+","+d[i+2]+","+d[i+3]);
      return set.size;
    });
  }
  check("cockpit GHI dibuja canvas real",(await diversity("vizCockpitGhi"))>4);
  check("rosa dibuja canvas polar real",(await diversity("vizWindRose"))>6);
  check("histograma térmico dibuja canvas real",(await diversity("vizTempHist"))>5);
  check("zoom diario se actualiza",!/—/.test(await page.locator("#vizDayNote").innerText()));

  await page.locator("#hailBtn").click();
  check("curva acumulada de granizo dibuja",(await diversity("vizHailCurve"))>5);
  await page.locator("#windSynthBtn").click();
  check("máximo diario de viento sintético dibuja",(await diversity("vizWindSynth"))>5);

  await browser.close();
}catch(e){
  check("browser smoke arranca",false,e.message);
}

console.log("");
console.log(oks+" OK · "+fails+" FAIL");
if(fails)process.exit(1);
