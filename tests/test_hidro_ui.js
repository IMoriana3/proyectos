// Generador + Hidrología de verdad en Chromium. El MDT sintético es SOLO fixture.
// Servir el repo local: python3 -m http.server 8099; node tests/test_hidro_ui.js
"use strict";
const { chromium } = require("playwright");
const { EXEC } = require("./pw_navegador.js");
const BASE = process.env.BASE || "http://localhost:8099";
let ok=0,ko=0;
function ck(label,yes,detail){
  if(yes){ok++;console.log("OK   "+label);}
  else{ko++;console.log("FAIL "+label+(detail?" → "+detail:""));}
}
(async()=>{
  const browser=await chromium.launch({executablePath:EXEC});
  const page=await browser.newPage({viewport:{width:1450,height:900}});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("https://server.arcgisonline.com/**",r=>r.abort());
  await page.route("https://geocoding-api.open-meteo.com/**",r=>r.abort());
  await page.goto(BASE+"/generador-layout.html",{waitUntil:"domcontentloaded"});
  ck("panel de hidrología dentro del generador",await page.evaluate(()=>
    document.getElementById("hydroCard").closest(".col.ctl")!==null));
  ck("escena 3D DENTRO de la columna de implantación",await page.evaluate(()=>
    document.getElementById("hydroScene").closest(".col.map")!==null));
  ck("visor 3D bloqueado sin simulación",await page.locator("#hydro3dBtn").isDisabled());
  await page.click("#hydroRun");
  ck("sin MDT NO inventa cotas",/Falta MDT/.test(await page.textContent("#hydroStatus")));
  ck("sin MDT no habilita 3D",await page.locator("#hydro3dBtn").isDisabled());
  await page.evaluate(()=>{
    const n=13,lats=[],lons=[],z=[];
    for(let i=0;i<n;i++){
      lats.push(41.5725+i*.0006);lons.push(-.802+i*.0006);
    }
    for(let r=0;r<n;r++){
      z.push(Array.from({length:n},(_,c)=>200 + .12*r + .15*c +
        (r>=4&&r<=7&&c>=4&&c<=7?-1:0)));
    }
    DEM={lats,lons,z,src:"TEST MDT (SOLO TEST)"};
    document.getElementById("orto").checked=false;
    draw();
  });
  await page.fill("#hydroRain","140");
  await page.fill("#hydroRainMin","60");
  await page.fill("#hydroTotal","120");
  await page.click("#hydroRun");
  await page.waitForFunction(()=>document.getElementById("hydroStatus").textContent.includes("Criba completada"),null,{timeout:15000});
  ck("simula sobre DEM real del estado de página",await page.evaluate(()=>HYDRO&&HYDRO.dem.source==="TEST MDT (SOLO TEST)"));
  ck("estados hidráulicos temporales",await page.evaluate(()=>HYDRO.frames.length>=10));
  ck("balance de masa verificado",await page.evaluate(()=>HYDRO.summary.balanceRelative<1e-6));
  ck("hay zonas encharcadas",await page.evaluate(()=>HYDRO.summary.maxDepthM>0));
  ck("el 3D se activa solo después de simular",await page.locator("#hydro3dBtn").isEnabled());
  ck("la ficha enseña los indicadores de riesgo",/Calado máximo/.test(await page.textContent("#hydroResults")));
  const before=await page.inputValue("#hydroTime");
  await page.evaluate(()=>{const e=document.getElementById("hydroTime");e.value=0;e.dispatchEvent(new Event("input",{bubbles:true}));});
  ck("el slider cambia el fotograma físico y el texto",await page.evaluate(()=>HYDRO_FRAME===0 && /0\.0 min/.test(document.getElementById("hydroTimeLbl").textContent)));
  ck("el paso inicial está seco",await page.evaluate(()=>HYDRO.frames[HYDRO_FRAME].depth_m.every(h=>h===0)));
  await page.click("#hydro3dBtn");
  const three=await page.evaluate(()=>({visible:!document.getElementById("hydroScene").hidden,
    canvas:!!document.querySelector("#hydroScene canvas"),
    failure:/WebGL no disponible/.test(document.getElementById("hydroStatus").textContent)}));
  ck("la escena 3D abre con Three.js o declara WebGL ausente", (three.visible&&three.canvas)||three.failure,JSON.stringify(three));
  if(three.visible)await page.click("#hydro3dBtn");
  ck("volver del 3D restaura lienzo de implantación",await page.evaluate(()=>
    !document.getElementById("cv").hidden && document.getElementById("cv").style.display!=="none"));
  await page.click("#genBtn");
  await page.waitForFunction(()=>!/calculando/.test(document.getElementById("hint").textContent)
    && /navegador|error/.test(document.getElementById("hint").textContent),null,{timeout:30000});
  const gen=await page.evaluate(()=>({has:!!(RES&&RES.structures),err:document.getElementById("foot").textContent}));
  ck("genera implantación con módulo hídrico presente",gen.has,gen.err.slice(0,180));
  ck("clasifica exposición de las estructuras generadas",await page.evaluate(()=>HYDRO_EXPOSURE && HYDRO_EXPOSURE.assessed>=0));
  await page.fill("#hydroThreshold","0.01"); // umbral GOLDEN controlado: no depende de la posición exacta de un pico
  await page.dispatchEvent("#hydroThreshold","change");
  await page.check("#hydroAvoid");
  const ex=await page.evaluate(()=>hydroExtraExclusions());
  ck("la exclusión hídrica se transforma en zonas de layout",ex.length>0,"polígonos: "+ex.length);
  await page.fill("#hydroRain","170");
  await page.click("#genBtn");
  await page.waitForFunction(()=>document.getElementById("hint").textContent==="error",null,{timeout:10000});
  ck("no permite usar una simulación vieja después de cambiar lluvia",
    /Exclusión hídrica caducada/.test(await page.textContent("#foot")));
  await page.uncheck("#hydroAvoid");
  const official=JSON.stringify({type:"FeatureCollection",features:[{type:"Feature",
    geometry:{type:"Polygon",coordinates:[[[-.799,41.575],[-.798,41.575],[-.798,41.576],[-.799,41.576],[-.799,41.575]]]},properties:{}}]});
  await page.locator("#hydroOfficialFile").setInputFiles({name:"zona.geojson",mimeType:"application/geo+json",buffer:Buffer.from(official)});
  await page.waitForFunction(()=>/1 polígonos/.test(document.getElementById("hydroOfficialStatus").textContent),null,{timeout:5000});
  ck("importa GeoJSON en WGS84 sobre la MISMA parcela",await page.evaluate(()=>HYDRO_OFFICIAL.length===1));
  await page.check("#hydroOfficialAvoid");
  ck("las zonas importadas entran al motor de exclusiones",await page.evaluate(()=>hydroExtraExclusions().length===1));
  const badGeo=JSON.stringify({type:"Feature",geometry:{type:"Polygon",coordinates:[
    [[-1,41],[-.9,41],[-.9,41.1],[-1,41.1],[-1,41]],
    [[-.98,41.02],[-.97,41.02],[-.97,41.03],[-.98,41.03],[-.98,41.02]]]}});
  await page.locator("#hydroOfficialFile").setInputFiles({name:"agujero.geojson",mimeType:"application/json",buffer:Buffer.from(badGeo)});
  await page.waitForFunction(()=>/No importada/.test(document.getElementById("hydroOfficialStatus").textContent),null,{timeout:5000});
  ck("no ignora agujeros de exclusión oficiales",await page.evaluate(()=>HYDRO_OFFICIAL.length===1));
  ck("la advertencia por polígono con agujero es explícita",/agujeros/.test(await page.textContent("#hydroOfficialStatus")));
  await page.click("#hydroOfficialClear");
  ck("quitar capa elimina geometrías y el checkbox de exclusión",await page.evaluate(()=>
    HYDRO_OFFICIAL.length===0&&!document.getElementById("hydroOfficialAvoid").checked));
  ck("sin errores JS no controlados",errors.length===0,errors.slice(0,3).join("; "));
  await browser.close();
  console.log("\n"+(ko?"FALLOS ":"OK · ")+ok+" verdes · "+ko+" rojos");
  process.exitCode=ko?1:0;
})().catch(e=>{console.error("FAIL excepción general: "+(e.stack||e));process.exitCode=1;});
