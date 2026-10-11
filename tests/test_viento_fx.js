// METEOROLOGÍA 3D DE sim-viento.html — en el navegador real.
//
// Este banco no decide si una estrategia es correcta: eso ya lo cubren los
// arneses de control. Su contrato es visual y, por tanto, también tiene cosas
// que pueden romperse sin lanzar una excepción: que el viento deje de moverse,
// que la nieve no cubra nada, que la célula de granizo aparezca encima de la
// planta con ETA 90 o que una tormenta oscurezca la escena y no la restaure.
//
//   python3 -m http.server 8099
//   node tests/test_viento_fx.js
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');
const BASE = process.env.BASE_URL || process.env.BASE || 'http://localhost:8099';

let ok=0,ko=0;
const check=(n,c,e)=>{if(c){ok++;console.log('OK   '+n);}
  else{ko++;console.log('FAIL '+n+(e!==undefined?' -> '+e:''));}};

(async()=>{
  const browser=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:820}});
  const errs=[];
  page.on('pageerror',e=>errs.push(e.message));
  await page.goto(BASE+'/sim-viento.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.TD&&TD.rd&&TD.meteoFX&&window.ESC,{timeout:30000});

  check('la capa MeteoFX está cargada dentro del simulador',
    await page.evaluate(()=>typeof MeteoFX==='function'&&!!TD.meteoFX));
  check('y la escena WebGL sigue arrancando',await page.evaluate(()=>!!(TD&&TD.rd&&TD.sc)));

  const wind=await page.evaluate(()=>{
    const f=TD.meteoFX;
    f.setWeather({windKmh:45,gustKmh:82,windDirDeg:270,snowCm:0,
      hailKnown:true,hailOn:false,hailGate:false,hailPhase:'SIN SEÑAL'});
    f.tick(.08);
    const a=Array.from(f.windLines.geometry.getAttribute('position').array.slice(0,6));
    const op=f.windLines.material.opacity,vis=f.windLines.visible;
    f.tick(.08);
    const b=Array.from(f.windLines.geometry.getAttribute('position').array.slice(0,6));
    f.setWeather({windKmh:45,gustKmh:82,windDirDeg:90,snowCm:0,
      hailKnown:true,hailOn:false,hailGate:false,hailPhase:'SIN SEÑAL'});
    f.tick(.08);
    const c=Array.from(f.windLines.geometry.getAttribute('position').array.slice(0,6));
    const vx270=a[3]-a[0],vx90=c[3]-c[0];
    return {op,vis,mueve:Math.hypot(b[0]-a[0],b[2]-a[2]),vx270,vx90};
  });
  check('el viento es un CAMPO visible, no una sola flecha',wind.vis&&wind.op>.1,JSON.stringify(wind));
  check('las trazas avanzan cuando corre el tiempo',wind.mueve>.001,wind.mueve);
  check('cambiar de O a E invierte el sentido del flujo',wind.vx270*wind.vx90<0,
    wind.vx270+' / '+wind.vx90);

  const freeze=await page.evaluate(()=>{
    const f=TD.meteoFX,a=Array.from(f.windLines.geometry.getAttribute('position').array.slice(0,12));
    f.tick(0);
    const b=Array.from(f.windLines.geometry.getAttribute('position').array.slice(0,12));
    return a.every((v,i)=>v===b[i]);
  });
  check('con dt=0 el tiempo visual se congela exactamente',freeze);

  const snow=await page.evaluate(()=>{
    const f=TD.meteoFX;
    const before=(f.panelMats||[]).map(m=>m.userData.meteoFxBase.color.getHex());
    f.setWeather({windKmh:24,gustKmh:38,windDirDeg:315,snowCm:15,
      hailKnown:true,hailOn:false,hailGate:false,hailPhase:'SIN SEÑAL'});
    f.tick(.08);
    const after=(f.panelMats||[]).map(m=>m.color.getHex());
    const p0=Array.from(f.snow.geometry.getAttribute('position').array.slice(0,3));
    f.tick(.08);
    const p1=Array.from(f.snow.geometry.getAttribute('position').array.slice(0,3));
    return {panels:after.length,changed:after.some((v,i)=>v!==before[i]),
      flakes:f.snow.visible,ground:f.snowGround.material.opacity,
      drift:Math.hypot(p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2])};
  });
  check('la nieve crea copos con deriva',snow.flakes&&snow.drift>.001,JSON.stringify(snow));
  check('la acumulación aparece en el suelo',snow.ground>.2,snow.ground);
  check('y blanquea las superficies de módulo',snow.panels>0&&snow.changed,JSON.stringify(snow));

  const restore=await page.evaluate(()=>{
    const f=TD.meteoFX;
    f.setWeather({windKmh:5,gustKmh:5,windDirDeg:315,snowCm:0,
      hailKnown:true,hailOn:false,hailGate:false,hailPhase:'SIN SEÑAL'});
    return (f.panelMats||[]).every(m=>m.color.getHex()===m.userData.meteoFxBase.color.getHex()) &&
      f.snowGround.material.opacity===0;
  });
  check('al despejar, paneles y suelo vuelven a su estado base',restore);

  const hail=await page.evaluate(()=>{
    const f=TD.meteoFX;
    f.setWeather({windKmh:18,gustKmh:32,windDirDeg:270,snowCm:0,
      hailKnown:true,hailOn:true,hailGate:true,hailPhase:'VIGILANCIA',
      hailMm:30,hailProb:85,hailEtaMin:90,hailDirDeg:270});
    f.tick(.05);
    const far=f._cloudCenter(),farD=Math.hypot(far.x-f.center.x,far.z-f.center.z);
    const watch={cloud:f.clouds.visible,hail:f.hail.visible,op:f.hail.material.opacity};
    f.setWeather({windKmh:18,gustKmh:32,windDirDeg:270,snowCm:0,
      hailKnown:true,hailOn:true,hailGate:true,hailPhase:'DEFENSA',
      hailMm:30,hailProb:85,hailEtaMin:20,hailDirDeg:270});
    const near=f._cloudCenter(),nearD=Math.hypot(near.x-f.center.x,near.z-f.center.z);
    f.setWeather({windKmh:45,gustKmh:70,windDirDeg:270,snowCm:0,
      hailKnown:true,hailOn:true,hailGate:true,hailPhase:'IMPACTO',
      hailMm:35,hailProb:90,hailEtaMin:0,hailDirDeg:270});
    f.tick(.08);
    return {farD,nearD,watch,impactOp:f.hail.material.opacity,
      impactSize:f.hail.material.size,cloudX:near.x-f.center.x};
  });
  check('en vigilancia la célula existe pero está lejos de la planta',
    hail.watch.cloud&&hail.watch.hail&&hail.farD>hail.nearD,JSON.stringify(hail));
  check('al bajar el ETA la célula se acerca físicamente',hail.nearD<hail.farD*.6,
    hail.nearD+' / '+hail.farD);
  check('viniendo del oeste, la célula se coloca al OESTE de la planta',
    hail.cloudX<0,hail.cloudX);
  check('en IMPACTO la cortina de granizo gana densidad visual',
    hail.impactOp>hail.watch.op&&hail.impactOp>.5,JSON.stringify(hail));
  check('el tamaño de piedra se escala con la severidad',hail.impactSize>.7,hail.impactSize);

  const light=await page.evaluate(()=>{
    const f=TD.meteoFX;
    // simular que ponSol acaba de reponer la iluminación limpia
    TD.sun.intensity=1.5;TD.hemi.intensity=.55;
    f.setWeather({windKmh:10,gustKmh:15,windDirDeg:270,snowCm:0,
      hailKnown:true,hailOn:false,hailGate:false,hailPhase:'SIN SEÑAL'});
    const clear=TD.sun.intensity;
    // nuevo estado tras otro ponSol
    TD.sun.intensity=1.5;TD.hemi.intensity=.55;
    f.setWeather({windKmh:20,gustKmh:35,windDirDeg:270,snowCm:0,
      hailKnown:true,hailOn:true,hailGate:true,hailPhase:'IMPACTO',
      hailMm:40,hailProb:95,hailEtaMin:0,hailDirDeg:270});
    const storm=TD.sun.intensity;
    // segunda llamada SIN ponSol: no debe multiplicar el oscuro otra vez
    f.setWeather({windKmh:20,gustKmh:35,windDirDeg:270,snowCm:0,
      hailKnown:true,hailOn:true,hailGate:true,hailPhase:'IMPACTO',
      hailMm:40,hailProb:95,hailEtaMin:0,hailDirDeg:270});
    const storm2=TD.sun.intensity;
    f.setWeather({windKmh:10,gustKmh:15,windDirDeg:270,snowCm:0,
      hailKnown:true,hailOn:false,hailGate:false,hailPhase:'SIN SEÑAL'});
    const restored=TD.sun.intensity;
    return {clear,storm,storm2,restored};
  });
  check('la tormenta oscurece la iluminación de la escena',light.storm<light.clear*.8,JSON.stringify(light));
  check('dos repintados no oscurecen dos veces',Math.abs(light.storm-light.storm2)<1e-6,JSON.stringify(light));
  check('y al despejar se recupera la iluminación base',Math.abs(light.restored-light.clear)<1e-6,JSON.stringify(light));

  const hud=await page.evaluate(()=>{
    actualizaMeteo3D({wind_ms:12,gust_ms:20,wind_dir:200,snow_cm:15,
      hail_known:true,hail_on:true,hail_gate:true,hail_phase:'IMPACTO',
      hail_mm:30,hail_prob_pct:80,hail_eta_min:0,hail_dir:270,hail_defense_active:true});
    return {w:TD.windHud.textContent,s:TD.snowHud.textContent,h:TD.hailHud.textContent};
  });
  check('los HUD dicen racha, nieve e impacto sin obligar a interpretar partículas',
    /RACHA/.test(hud.w)&&/NIEVE/.test(hud.s)&&/IMPACTO/.test(hud.h),JSON.stringify(hud));

  check('la mejora no deja errores JavaScript en la página',errs.length===0,errs.join(' | '));

  await browser.close();
  console.log('\n'+(ko?'FALLA':'OK')+' — '+ok+'/'+(ok+ko)+' comprobaciones');
  process.exit(ko?1:0);
})().catch(e=>{console.log('FAIL el banco reventó -> '+e.message);process.exit(1);});
