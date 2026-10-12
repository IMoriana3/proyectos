// Simulador unificado de eventos de abanderamiento.
//
// Comprueba la propiedad que hace útil al nuevo slider: mover T hacia delante,
// atrás y volver al mismo minuto NO cambia el estado. También recorre los
// presets que cubren viento, racha, granizo, nieve, combinaciones y pasivo.
//
//   node tests/test_abanderamiento_evento.js   (necesita servidor en :8099)
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok=0,ko=0;
const check=(n,c,x)=>{if(c){ok++;console.log('OK   '+n);}else{ko++;console.log('FAIL '+n+(x?' -> '+x:''));}};

(async()=>{
  const browser=await chromium.launch({executablePath:EXEC});
  const page=await browser.newPage();
  const errores=[];page.on('pageerror',e=>errores.push(String(e)));
  await page.goto(BASE+'/sim-viento.html',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#mEvent',{timeout:15000});
  check('Evento es la vista principal y los ajustes avanzados nacen plegados',
    await page.$eval('#eventCtl',e=>e.style.display!=='none') &&
    await page.$eval('#mEvent',e=>e.classList.contains('acc')) &&
    await page.$eval('#eAdv',e=>!e.open));
  await page.waitForSelector('#eTime',{state:'visible',timeout:15000});
  await page.evaluate(()=>{eventoRebuild(0);});
  await page.waitForFunction(()=>window.EVENTO&&EVENTO.sim&&EVENTO.sim.frames.length>200,{timeout:30000});

  const ui=await page.evaluate(()=>({
    min:+eTime.min,max:+eTime.max,step:+eTime.step,
    presets:[...ePreset.options].map(o=>o.value),
    frames:EVENTO.sim.frames.length,dt:EVENTO.sim.dt_s,
    first:EVENTO.sim.frames[0].t_min,last:EVENTO.sim.frames.at(-1).t_min
  }));
  check('slider maestro es MINUTAL y cubre T−30…T+180',
    ui.min===-30&&ui.max===180&&ui.step===1,JSON.stringify(ui));
  check('slider y línea temporal comparten el mismo contenedor de referencia',
    await page.evaluate(()=>eTime.parentElement===eEventLine.parentElement &&
      eTime.parentElement.classList.contains('eventtrack')));
  check('la simulación interna es de 1 s aunque el slider sea de 1 min',
    ui.dt===1&&ui.frames===211&&ui.first===-30&&ui.last===180,JSON.stringify(ui));
  check('hay presets de viento, racha, granizo, nieve, combinado y pasivo',
    ['wind_ramp','gust','hail_far','hail_near','hail_wind','snow','snow_hail','snow_hail_same','passive']
      .every(x=>ui.presets.includes(x)),ui.presets.join(','));

  // Viento: cruza T1 y luego T2.
  const viento=await page.evaluate(()=>{
    aplicaPresetEvento('wind_ramp');
    const f12=EVENTO.sim.frames.find(f=>f.t_min===12);
    const f20=EVENTO.sim.frames.find(f=>f.t_min===20);
    return {m12:[f12.modos.A1,f12.modos.A2],m20:[f20.modos.A1,f20.modos.A2],
      w12:f12.wind_ms*3.6,w20:f20.wind_ms*3.6};
  });
  check('viento creciente: entre T1 y T2 A1 está FULL y A2 PARTIAL',
    viento.m12[0]==='FULL_STOW'&&viento.m12[1]==='PARTIAL_STOW',
    JSON.stringify(viento));
  check('y al superar T2 ambos llegan a FULL_STOW',
    viento.m20[0]==='FULL_STOW'&&viento.m20[1]==='FULL_STOW',JSON.stringify(viento));

  // Determinismo del scrub.
  const det=await page.evaluate(()=>{
    const f0=EVENTO.sim.frames.find(x=>x.t_min===0), f80=EVENTO.sim.frames.find(x=>x.t_min===80);
    eventoAplica(80);
    const a=JSON.stringify({ang:LIVE.ang,modos:LIVE.modos,orden:LIVE.orden,info:LIVE.info});
    eventoAplica(-5);eventoAplica(80);
    const b=JSON.stringify({ang:LIVE.ang,modos:LIVE.modos,orden:LIVE.orden,info:LIVE.info});
    return {igual:a===b,label:eTimeLbl.textContent,top:eTimeTop.textContent,clock:eClock.textContent,
      esperado:fechaHoraLocal(f80.iso),origen:fechaHoraLocal(f0.iso),origenCtl:eHlbl.textContent};
  });
  check('ir atrás y volver al mismo minuto da EXACTAMENTE el mismo estado',det.igual,JSON.stringify(det));
  check('T y la HORA ACTUAL avanzan juntos; el control T=0 queda como origen',
    /T \+80/.test(det.label)&&/T \+80/.test(det.top)&&det.clock===det.esperado&&
    det.clock!==det.origen&&det.origenCtl.length>0,JSON.stringify(det));

  // Ráfaga: explícitamente selecciona la hipótesis de T1/T2 contra racha.
  const gust=await page.evaluate(()=>{
    aplicaPresetEvento('gust');
    const f=EVENTO.sim.frames.find(x=>x.t_min===0);
    return {signal:EVENTO.sim.control_signal,g:f.gust_ms*3.6,w:f.wind_ms*3.6,
      a1:f.modos.A1,a2:f.modos.A2};
  });
  check('preset racha separa media y racha, y declara que T1/T2 miran racha',
    gust.signal==='gust'&&gust.g>90&&gust.w<40,JSON.stringify(gust));
  check('esa racha sí dispara las estrategias controladas',
    gust.a1==='FULL_STOW'&&gust.a2==='FULL_STOW',JSON.stringify(gust));

  // Pasivo: la carga de racha suelta la fila exterior.
  const pas=await page.evaluate(()=>{
    aplicaPresetEvento('passive');
    const f=EVENTO.sim.frames.find(x=>x.t_min===0);
    return {modo:f.modos.PASIVO,fuente:f.info.PASIVO&&f.info.PASIVO.fuente,g:f.gust_ms*3.6};
  });
  check('preset pasivo suelta por carga de racha, no por orden TCU',
    pas.modo==='SUELTA'&&pas.fuente==='PASIVO'&&pas.g>90,JSON.stringify(pas));

  // Granizo lejos / inminente. Una señal severa lejana se VIGILA, no se ejecuta.
  const hail=await page.evaluate(()=>{
    aplicaPresetEvento('hail_far');
    const far=EVENTO.sim.frames.find(x=>x.t_min===0);       // ETA 90, lead 60
    const start=EVENTO.sim.frames.find(x=>x.t_min===30);    // ETA 60: arranca defensa
    aplicaPresetEvento('hail_near');
    const near=EVENTO.sim.frames.find(x=>x.t_min===0);
    const hold=EVENTO.sim.frames.find(x=>x.t_min===50);
    return {
      far:{src:far.info.A1.fuente,mode:far.modos.A1,eta:far.hail_eta_min,prot:far.info.A1.proteccion},
      start:{src:start.info.A1.fuente,mode:start.modos.A1,eta:start.hail_eta_min,caso:start.info.A1.hail_case},
      near:{src:near.info.A1.fuente,mode:near.modos.A1,eta:near.hail_eta_min,caso:near.info.A1.hail_case},
      hold:{src:hold.info.A1.fuente,on:hold.hail_on,caso:hold.info.A1.hail_case}
    };
  });
  check('granizo lejos (ETA 90 > lead 60) queda en VIGILANCIA y NO mueve',
    hail.far.src==='VIGILANCIA GRANIZO'&&hail.far.mode==='IDLE'&&hail.far.prot==='VIGILANCIA',
    JSON.stringify(hail.far));
  check('al llegar a ETA 60 empieza la defensa en el MISMO tracker',
    hail.start.src==='GRANIZO'&&hail.start.mode==='HAIL_STOW'&&hail.start.caso===1,
    JSON.stringify(hail.start));
  check('granizo inminente entra por caso 3',
    hail.near.src==='GRANIZO'&&hail.near.caso===3,JSON.stringify(hail.near));
  check('tras el all-clear NO desabandera de golpe: sigue el hold de salida',
    hail.hold.on===false&&hail.hold.src==='GRANIZO'&&hail.hold.caso===5,JSON.stringify(hail.hold));

  const lead=await page.evaluate(()=>{
    aplicaPresetEvento('hail_far');
    eHailLead.value='30'; eventoRebuild(0);
    const t30=EVENTO.sim.frames.find(x=>x.t_min===30); // ETA 60: aún vigilancia
    const t60=EVENTO.sim.frames.find(x=>x.t_min===60); // ETA 30: defensa
    const marks=[...document.querySelectorAll('#eEventLine .mark b')].map(x=>x.textContent);
    return {lead:+eHailLead.value,t30:{src:t30.info.A1.fuente,mode:t30.modos.A1,eta:t30.hail_eta_min},
      t60:{src:t60.info.A1.fuente,mode:t60.modos.A1,eta:t60.hail_eta_min},marks};
  });
  check('la antelación de granizo es CONFIGURABLE y gobierna la orden',
    lead.lead===30&&lead.t30.src==='VIGILANCIA GRANIZO'&&lead.t30.mode==='IDLE'&&
    lead.t60.src==='GRANIZO'&&lead.t60.mode==='HAIL_STOW',JSON.stringify(lead));
  check('esa misma antelación mueve la marca de inicio de defensa en la timeline',
    lead.marks.some(x=>/inicia defensa granizo/.test(x)&&/T\+60/.test(x)),lead.marks.join(' | '));

  const sub=await page.evaluate(()=>{
    aplicaPresetEvento('hail_near');
    eHailMm.value='16';eHailProb.value='80';
    eventoRebuild(50);
    const f=EVENTO.sim.frames.find(x=>x.t_min===50);
    return {src:f.info.A1.fuente,mode:f.modos.A1,caso:f.info.A1.hail_case,on:f.hail_on};
  });
  check('granizo sub-VDE no deja un hold fantasma después de pasar',
    sub.on===false&&sub.src==='SEGUIMIENTO'&&sub.caso===5&&sub.mode==='IDLE',
    JSON.stringify(sub));

  const hw=await page.evaluate(()=>{
    aplicaPresetEvento('hail_wind');
    const f=EVENTO.sim.frames.find(x=>x.info.A1&&x.info.A1.fuente==='VIENTO × GRANIZO');
    return f?{t:f.t_min,src:f.info.A1.fuente,target:f.orden.A1,theta:f.ang.A1,mode:f.modos.A1}:null;
  });
  check('granizo + viento llega al arbitraje conjunto sin cruzar por una estrategia paralela',
    !!hw&&hw.src==='VIENTO × GRANIZO',JSON.stringify(hw));

  // Nieve y los dos arbitrajes nieve/granizo.
  const snow=await page.evaluate(()=>{
    aplicaPresetEvento('snow');
    const n=EVENTO.sim.frames.find(x=>x.t_min===1);
    aplicaPresetEvento('snow_hail');
    const c=EVENTO.sim.frames.find(x=>x.t_min===1);
    aplicaPresetEvento('snow_hail_same');
    const a=EVENTO.sim.frames.find(x=>x.t_min===1);
    return {
      snow:{src:n.info.A1.fuente,mode:n.modos.A1,cm:n.snow_cm},
      conflict:{src:c.info.A1.fuente,mode:c.modos.A1,mot:c.info.A1.motivo},
      agree:{src:a.info.A1.fuente,mode:a.modos.A1,mot:a.info.A1.motivo}
    };
  });
  check('nieve sola entra como SNOW_STOW',
    snow.snow.src==='NIEVE'&&snow.snow.mode==='SNOW_STOW'&&snow.snow.cm>10,JSON.stringify(snow.snow));
  check('nieve + granizo en lados opuestos NO inventa prioridad: sale NO MODELADO',
    snow.conflict.src==='NO MODELADO'&&snow.conflict.mode==='CONFLICT',
    JSON.stringify(snow.conflict));
  check('si nieve y granizo piden el mismo lado, se combinan',
    snow.agree.src==='GRANIZO + NIEVE'&&snow.agree.mode==='MULTI_STOW',
    JSON.stringify(snow.agree));

  // Controles de reproducción: play y paso exacto de un minuto.
  const ctl=await page.evaluate(()=>{
    aplicaPresetEvento('wind_ramp');eventoAplica(0);EVENTO.run=false;EVENTO.acc=0;
    eSpeed.value='30';
    ePlay.click();                 // el botón activa el reproductor
    eventoTick(0.5);              // 0,5 s reales × 30 min/s = 15 min exactos
    ePlay.click();                 // y lo pausa
    const trasPlay=EVENTO.pos;
    eventoAplica(12);ePrev.click();const p11=EVENTO.pos;eNext.click();const p12=EVENTO.pos;
    return {trasPlay,p11,p12};
  });
  check('play hace avanzar el tiempo del slider en minutos simulados',
    ctl.trasPlay===15,JSON.stringify(ctl));
  check('−1/+1 mueven exactamente un minuto',
    ctl.p11===11&&ctl.p12===12,JSON.stringify(ctl));

  // UI: marcas, resumen y detalle por estrategia.
  const pinta=await page.evaluate(()=>{
    aplicaPresetEvento('hail_wind');eventoAplica(25);
    return {
      marks:document.querySelectorAll('#eEventLine .mark').length,
      now:document.querySelector('#eEventNow')?.style.left||'',
      summary:eEventSummary.textContent,
      tiles:document.getElementById('tiles').textContent,
      windHud:TD&&TD.windHud?TD.windHud.textContent:'',
      hailHud:TD&&TD.hailHud?TD.hailHud.textContent:'',
      hailFx:TD&&TD.hailFx?TD.hailFx.className:''
    };
  });
  check('timeline dibuja eventos y la aguja del minuto actual',
    pinta.marks>=5&&/%/.test(pinta.now),JSON.stringify(pinta));
  check('resumen enseña viento, racha, granizo, nieve y hora',
    /Viento/.test(pinta.summary)&&/racha/.test(pinta.summary)&&/Granizo/.test(pinta.summary)&&/Nieve/.test(pinta.summary),
    pinta.summary);
  check('la dirección de viento se lee como VIENE DE y VA HACIA, también en el 3D',
    /VIENE DE/.test(pinta.summary)&&/VA HACIA/.test(pinta.summary)&&
    /VIENTO/.test(pinta.windHud)&&/VIENE DE/.test(pinta.windHud)&&/VA HACIA/.test(pinta.windHud),
    pinta.windHud);
  check('el granizo tiene presencia visual y estado legible en la escena',
    /GRANIZO/.test(pinta.hailHud)&&/VIGILANCIA|DEFENSA ACTIVA|ENCIMA/.test(pinta.hailHud)&&
    /hailfx on/.test(pinta.hailFx),JSON.stringify({hud:pinta.hailHud,fx:pinta.hailFx}));

  // La meteorología nueva no puede ser decoración suelta: vive en el THREE.Scene
  // y consume el MISMO frame que acaba de pintar la máquina de estados.
  const fxWind=await page.evaluate(async()=>{
    aplicaPresetEvento('wind_ramp');eventoAplica(20);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return window.__simVientoMeteoFx&&__simVientoMeteoFx.snapshot();
  });
  check('la capa meteorológica está ligada al THREE.Scene y al frame compartido',
    fxWind&&fxWind.bound&&fxWind.frameSource==='shared'&&fxWind.windVisible,
    JSON.stringify(fxWind));

  const fxHail=await page.evaluate(async()=>{
    aplicaPresetEvento('hail_far');eventoAplica(0);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const antes=__simVientoMeteoFx.snapshot();
    aplicaPresetEvento('hail_near');eventoAplica(20);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const impacto=__simVientoMeteoFx.snapshot();
    return {antes,impacto};
  });
  check('el granizo 3D aparece en IMPACTO, no durante la vigilancia',
    fxHail&&!fxHail.antes.hailVisible&&fxHail.impacto.hailVisible&&fxHail.impacto.state.impact,
    JSON.stringify(fxHail));

  const fxSnow=await page.evaluate(async()=>{
    aplicaPresetEvento('snow');eventoAplica(1);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return __simVientoMeteoFx.snapshot();
  });
  check('la nieve tiene precipitación 3D, manto de suelo y recubrimiento de mesas',
    fxSnow&&fxSnow.snowVisible&&fxSnow.snowGround>0&&(fxSnow.snowCoats>0||fxSnow.instancedSnow),
    JSON.stringify(fxSnow));

  const impact=await page.evaluate(()=> {
    const f=window.__simVientoMeteoFx;
    const flat=f.impact(30,0,270,0,0);
    const tilt=f.impact(30,0,270,0,55);
    const fromWest=f.impact(30,60,270,0,55);
    const fromEast=f.impact(30,60,90,0,55);
    return {flat,tilt,fromWest,fromEast};
  });
  check('modelo impacto: horizontal y sin viento recibe el golpe normal',
    Math.abs(impact.flat.incidence_deg)<.01&&Math.abs(impact.flat.exposure-1)<.001&&
    Math.abs(impact.flat.normal_energy_j-impact.flat.energy_j)<.001,
    JSON.stringify(impact.flat));
  check('modelo impacto: a 55° baja la exposición como cos(55°)',
    Math.abs(impact.tilt.exposure-Math.cos(55*Math.PI/180))<.01,
    JSON.stringify(impact.tilt));
  check('modelo impacto: la energía normal cae con el cuadrado de la exposición sin viento',
    Math.abs(impact.tilt.normal_energy_j/impact.tilt.energy_j-
      Math.pow(Math.cos(55*Math.PI/180),2))<.02,
    JSON.stringify(impact.tilt));
  check('modelo impacto: el mismo tilt distingue viento a favor y en contra de la cara',
    impact.fromEast.normal_energy_j>impact.fromWest.normal_energy_j,
    JSON.stringify({oeste:impact.fromWest.normal_energy_j,este:impact.fromEast.normal_energy_j}));
  check('las tarjetas dicen quién manda y el estado de protección',
    /VIENTO × GRANIZO|GRANIZO|VIENTO/.test(pinta.tiles)&&/TRÁNSITO|POSICIÓN|MODELADO|SEGUIMIENTO/.test(pinta.tiles),
    pinta.tiles.slice(0,300));

  check('la ficha no lanza errores JS',errores.length===0,errores.join(' | '));
  await browser.close();
  console.log((ko?'FALLA':'OK')+' — '+ok+'/'+(ok+ko)+' comprobaciones');
  process.exit(ko?1:0);
})();