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
  await page.waitForSelector('#lTime',{timeout:15000});
  await page.evaluate(()=>{eventoRebuild(0);});
  await page.waitForFunction(()=>window.EVENTO&&EVENTO.sim&&EVENTO.sim.frames.length>200,{timeout:30000});

  const ui=await page.evaluate(()=>({
    min:+lTime.min,max:+lTime.max,step:+lTime.step,
    presets:[...lPreset.options].map(o=>o.value),
    frames:EVENTO.sim.frames.length,dt:EVENTO.sim.dt_s,
    first:EVENTO.sim.frames[0].t_min,last:EVENTO.sim.frames.at(-1).t_min
  }));
  check('slider maestro es MINUTAL y cubre T−30…T+180',
    ui.min===-30&&ui.max===180&&ui.step===1,JSON.stringify(ui));
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
    eventoAplica(80);
    const a=JSON.stringify({ang:LIVE.ang,modos:LIVE.modos,orden:LIVE.orden,info:LIVE.info});
    eventoAplica(-5);eventoAplica(80);
    const b=JSON.stringify({ang:LIVE.ang,modos:LIVE.modos,orden:LIVE.orden,info:LIVE.info});
    return {igual:a===b,label:lTimeLbl.textContent,clock:lClock.textContent};
  });
  check('ir atrás y volver al mismo minuto da EXACTAMENTE el mismo estado',det.igual,JSON.stringify(det));
  check('el slider dice el T relativo y el reloj absoluto a la vez',
    /T \+80/.test(det.label)&&/T \+80/.test(det.clock),JSON.stringify(det));

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

  // Granizo lejos / inminente.
  const hail=await page.evaluate(()=>{
    aplicaPresetEvento('hail_far');
    const far=EVENTO.sim.frames.find(x=>x.t_min===0);
    aplicaPresetEvento('hail_near');
    const near=EVENTO.sim.frames.find(x=>x.t_min===0);
    const hold=EVENTO.sim.frames.find(x=>x.t_min===50);
    return {
      far:{src:far.info.A1.fuente,mode:far.modos.A1,eta:far.hail_eta_min,caso:far.info.A1.hail_case},
      near:{src:near.info.A1.fuente,mode:near.modos.A1,eta:near.hail_eta_min,caso:near.info.A1.hail_case},
      hold:{src:hold.info.A1.fuente,on:hold.hail_on,caso:hold.info.A1.hail_case}
    };
  });
  check('granizo lejos entra por caso 1 y mueve el MISMO tracker',
    hail.far.src==='GRANIZO'&&hail.far.mode==='HAIL_STOW'&&hail.far.caso===1,JSON.stringify(hail.far));
  check('granizo inminente entra por caso 3',
    hail.near.src==='GRANIZO'&&hail.near.caso===3,JSON.stringify(hail.near));
  check('tras el all-clear NO desabandera de golpe: sigue el hold de salida',
    hail.hold.on===false&&hail.hold.src==='GRANIZO'&&hail.hold.caso===5,JSON.stringify(hail.hold));

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

  // UI: marcas, resumen y detalle por estrategia.
  const pinta=await page.evaluate(()=>{
    aplicaPresetEvento('hail_wind');eventoAplica(25);
    return {
      marks:document.querySelectorAll('#lEventLine .mark').length,
      now:document.querySelector('#lEventNow')?.style.left||'',
      summary:lEventSummary.textContent,
      tiles:tiles?document.getElementById('tiles').textContent:''
    };
  });
  check('timeline dibuja eventos y la aguja del minuto actual',
    pinta.marks>=5&&/%/.test(pinta.now),JSON.stringify(pinta));
  check('resumen enseña viento, racha, granizo, nieve y hora',
    /Viento/.test(pinta.summary)&&/racha/.test(pinta.summary)&&/Granizo/.test(pinta.summary)&&/Nieve/.test(pinta.summary),
    pinta.summary);
  check('las tarjetas dicen quién manda y el estado de protección',
    /VIENTO × GRANIZO|GRANIZO|VIENTO/.test(pinta.tiles)&&/TRÁNSITO|POSICIÓN|MODELADO|SEGUIMIENTO/.test(pinta.tiles),
    pinta.tiles.slice(0,300));

  check('la ficha no lanza errores JS',errores.length===0,errores.join(' | '));
  await browser.close();
  console.log((ko?'FALLA':'OK')+' — '+ok+'/'+(ok+ko)+' comprobaciones');
  process.exit(ko?1:0);
})();