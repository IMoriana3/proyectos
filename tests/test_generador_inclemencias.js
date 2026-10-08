// Generador de inclemencias y banco de falsación del simulador de abanderamiento.
//
// No comprueba solo que haya botones. Genera fronteras adversariales reproducibles,
// las pasa por EL MISMO LOC.simulaEvento de la escena y exige la respuesta correcta.
// También conduce la batería desde la UI, reproduce un caso y prueba los exports.
//
//   node tests/test_generador_inclemencias.js
const { chromium } = require('playwright');
const fs = require('fs');
const { EXEC } = require('./pw_navegador.js');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok=0,ko=0;
const check=(n,c,x)=>{if(c){ok++;console.log('OK   '+n);}else{ko++;console.log('FAIL '+n+(x?' -> '+x:''));}};

(async()=>{
  const browser=await chromium.launch({executablePath:EXEC});
  const page=await browser.newPage({acceptDownloads:true});
  const errores=[];page.on('pageerror',e=>errores.push(String(e)));
  await page.goto(BASE+'/sim-viento.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.EVENTO&&EVENTO.sim&&EVENTO.sim.frames.length>200,{timeout:30000});

  check('existe el generador con aleatorio, adversarial, seed y batería',
    await page.evaluate(()=>['incGen','incMode','incFamily','incSeverity','incSeed','incN','incOne','incRun']
      .every(id=>!!document.getElementById(id))));
  check('el modo adversarial es el default visible',
    await page.$eval('#incMode',e=>e.value)==='adversarial');
  const hailCfg=await page.evaluate(()=>({
    after:+eHailAfter.value,hold:+eHailHold.value,
    cfgAfter:eventoCfgUI().profile.hail_after_min,cfgHold:eventoCfgUI().profile.hail_exit_hold_min
  }));
  check('granizo expone y cablea señal post-llegada + retención post-all-clear',
    hailCfg.after===15&&hailCfg.hold===60&&hailCfg.cfgAfter===15&&hailCfg.cfgHold===60,JSON.stringify(hailCfg));
  const reUI=await page.evaluate(()=>({
    ids:['eHailR1On','eHailR1At','eHailR1Kind','eHailR1Eta','eHailR1Mm','eHailR1Prob','eHailR1Dir',
      'eHailR2On','eHailR2At','eHailR2Kind','eHailR2Eta','eHailR2Mm','eHailR2Prob','eHailR2Dir']
      .every(id=>!!document.getElementById(id)),
    initial:eventoCfgUI().profile.hail_updates.length
  }));
  check('UI de reforecast expone dos actualizaciones completas y parte vacía',
    reUI.ids&&reUI.initial===0,JSON.stringify(reUI));
  await page.selectOption('#ePreset','hail_reforecast');
  await page.dispatchEvent('#ePreset','change');
  const presetRe=await page.evaluate(()=>eventoCfgUI().profile.hail_updates);
  check('preset de reforecast carga una actualización ETA 90→20 reproducible',
    presetRe.length===1&&presetRe[0].at_min===15&&presetRe[0].eta_min===20&&presetRe[0].prob_pct===80,
    JSON.stringify(presetRe));
  await page.selectOption('#ePreset','manual');

  // Reproducibilidad del generador, independientemente de la simulación.
  const repro=await page.evaluate(()=>{
    const b=incBaseCfg(),o={mode:'random',family:'all',severity:'mixed',seed:99173,n:1};
    const a=LOC.incGenera(o,7,b),c=LOC.incGenera(o,7,b);
    const d=LOC.incGenera({...o,seed:99174},7,b);
    return {igual:JSON.stringify(a)===JSON.stringify(c),distinto:JSON.stringify(a)!==JSON.stringify(d),
      seed:a.seed,perfil:a.profile};
  });
  check('misma seed + índice genera exactamente el mismo caso',repro.igual,JSON.stringify(repro));
  check('cambiar la seed cambia el caso',repro.distinto,JSON.stringify(repro));

  // Los 28 patrones adversariales. Una vuelta entera cubre fronteras + reforecast.
  const adv=await page.evaluate(()=>{
    const b=incBaseCfg(),o={mode:'adversarial',family:'all',severity:'mixed',seed:2601001,n:28};
    const out=[];
    for(let i=0;i<28;i++){
      const c=LOC.incGenera(o,i,b),cfg=incCfgCaso(c,b);
      const s1=LOC.simulaEvento(cfg),s2=LOC.simulaEvento(cfg),v=LOC.incVerifica(c,cfg,s1,s2);
      out.push({id:c.id,tag:c.tag,name:c.name,ok:v.ok,fail:v.fail,total:v.total,
        bad:v.checks.filter(x=>!x.ok).map(x=>x.name+': '+x.detail)});
    }
    return out;
  });
  const tags=adv.map(x=>x.tag);
  check('la vuelta adversarial cubre las 28 fronteras distintas',
    new Set(tags).size===28,JSON.stringify(tags));
  check('las 28 fronteras salen PASS',
    adv.every(x=>x.ok),JSON.stringify(adv.filter(x=>!x.ok)));
  check('cada caso publica invariantes universales + su regla específica',
    adv.every(x=>x.total>=8),adv.map(x=>x.tag+':'+x.total).join(' | '));

  const has=t=>tags.includes(t);
  check('incluye T1 exacto / +ε y T2 exacto / +ε',
    ['wind_t1_equal','wind_t1_plus','wind_t2_equal','wind_t2_plus'].every(has),tags.join(','));
  check('incluye suelta pasiva por racha',has('passive_release'));
  check('incluye granizo base + lifecycle',
    ['hail_size_below','hail_prob_below','hail_watch','hail_boundary','hail_near','hail_lifecycle'].every(has),tags.join(','));
  check('incluye reforecast ETA, retirada, reactivación, sin dato, cruces de gate y segundo episodio',
    ['hail_eta_advance','hail_eta_delay','hail_withdraw_watch','hail_withdraw_active','hail_reactivate_hold',
     'hail_missing_watch','hail_missing_active','hail_prob_reforecast','hail_size_reforecast','hail_second_episode',
     'hail_second_watch_withdraw'].every(has),tags.join(','));
  check('incluye nieve 10 exactos y 10+ε',has('snow_equal')&&has('snow_plus'));
  check('incluye conflicto, acuerdo y arbitraje viento×granizo',
    has('conflict')&&has('agree')&&has('hail_wind')&&has('hail_wind_missing'),tags.join(','));

  // Prueba independiente de algunas respuestas, no sólo del verificador.
  const frontera=await page.evaluate(()=>{
    const b=incBaseCfg(),o={mode:'adversarial',family:'all',severity:'mixed',seed:2601001,n:28};
    const get=tag=>{for(let i=0;i<28;i++){const c=LOC.incGenera(o,i,b);if(c.tag===tag){
      const s=LOC.simulaEvento(incCfgCaso(c,b));return {c,s};}}};
    const w1=get('wind_t1_equal'),w2=get('wind_t1_plus'),hb=get('hail_boundary'),hw=get('hail_watch'),hl=get('hail_lifecycle');
    const ha=get('hail_eta_advance'),hd=get('hail_eta_delay'),ww=get('hail_withdraw_watch'),wa=get('hail_withdraw_active');
    const rh=get('hail_reactivate_hold'),mw=get('hail_missing_watch'),ma=get('hail_missing_active');
    const pr=get('hail_prob_reforecast'),sr=get('hail_size_reforecast'),ep=get('hail_second_episode');
    const sw=get('hail_second_watch_withdraw'),wm=get('hail_wind_missing');
    const se=get('snow_equal'),sp=get('snow_plus'),cf=get('conflict'),ag=get('agree'),pa=get('passive_release');
    const max=f=>f.s.frames.reduce((a,x)=>x.wind_ms>a.wind_ms?x:a,f.s.frames[0]);
    const f0=x=>x.s.frames.find(f=>f.t_min===0),at=(x,t)=>x.s.frames.find(f=>f.t_min===t);
    return {
      t1eq:max(w1).modos,t1plus:max(w2).modos,
      hailBoundary:f0(hb).modos.A1,hailWatch:{m:f0(hw).modos.A1,src:f0(hw).info.A1.fuente},
      lifecycle:{p:hl.c.profile,ph:[0,5,25,31,32,43,44].map(t=>[t,at(hl,t).hail_phase]),
        hold32:at(hl,32).hail_hold_remaining_min,active44:at(hl,44).hail_defense_active,
        marks:hl.s.marks.filter(m=>m.k==='hail').map(m=>[m.t,m.label])},
      reforecast:{
        advance:[at(ha,9).hail_phase,at(ha,10).hail_phase,at(ha,10).hail_eta_min],
        delay:[at(hd,4).orden.A1,at(hd,5).orden.A1,at(hd,5).hail_phase,at(hd,5).hail_eta_min],
        withdrawWatch:[at(ww,9).hail_phase,at(ww,10).hail_phase,ww.s.frames.some(f=>f.hail_phase==='RETENCION')],
        withdrawActive:[at(wa,5).hail_phase,at(wa,17).hail_phase],
        reactivate:[at(rh,4).orden.A1,at(rh,9).hail_phase,at(rh,10).orden.A1,at(rh,10).hail_phase],
        missingWatch:[at(mw,10).hail_phase,at(mw,10).hail_known,at(mw,10).hail_defense_active],
        missingActive:[at(ma,5).hail_phase,at(ma,14).hail_defense_active,at(ma,15).hail_phase,at(ma,27).hail_phase],
        prob:[at(pr,4).hail_defense_active,at(pr,5).hail_phase],
        size:[at(sr,4).hail_defense_active,at(sr,5).hail_phase],
        episode:[at(ep,0).orden.A1,at(ep,24).hail_phase,at(ep,30).orden.A1,at(ep,30).hail_phase],
        secondWatch:[at(sw,29).hail_phase,at(sw,30).hail_phase,at(sw,35).hail_phase,at(sw,35).hail_defense_active],
        windMissing:[at(wm,0).modos.A1,at(wm,10).hail_phase,at(wm,10).hail_defense_active,at(wm,10).modos.A1],
        updateMarks:ha.s.marks.filter(m=>m.k==='hailupd').map(m=>[m.t,m.label])
      },
      snowEq:se.s.frames.some(f=>f.modos.A1==='SNOW_STOW'),snowPlus:sp.s.frames.some(f=>f.modos.A1==='SNOW_STOW'),
      conflict:cf.s.frames.some(f=>f.modos.A1==='CONFLICT'),agree:ag.s.frames.some(f=>f.modos.A1==='MULTI_STOW'),
      passive:pa.s.frames.some(f=>f.modos.PASIVO==='SUELTA')
    };
  });
  const resolver=await page.evaluate(()=>{
    const p={hail_on:true,hail_mm:22,hail_prob_pct:70,hail_eta0_min:90,hail_after_min:15,wind_dir_deg:270,
      hail_updates:[{at_min:10,kind:'update',eta_min:20,mm:25,prob_pct:80,dir_deg:90},
        {at_min:20,kind:'missing'}]};
    return [LOC.hailForecastAt(p,9),LOC.hailForecastAt(p,10),LOC.hailForecastAt(p,19),LOC.hailForecastAt(p,20)];
  });
  check('resolver de reforecast cambia ETA/severidad/dirección justo en T y representa sin dato como unknown',
    resolver[0].update_index===-1&&Math.round(resolver[0].eta_min)===81&&
    resolver[1].update_index===0&&resolver[1].eta_min===20&&resolver[1].mm===25&&resolver[1].prob_pct===80&&resolver[1].dir_deg===90&&
    resolver[2].eta_min===11&&resolver[3].known===false&&resolver[3].eta_min===null,
    JSON.stringify(resolver));
  const sane=await page.evaluate(()=>({
    p0:LOC.hailForecastAt({hail_on:true,hail_prob_pct:180,hail_mm:22,hail_eta0_min:20,hail_updates:{bad:true}},0),
    p1:LOC.granizoLiveAmenaza(true,22,180)
  }));
  check('probabilidad se acota a 0–100 % y hail_updates malformado no tumba el resolver',
    sane.p0.prob_pct===100&&sane.p0.update_index===-1&&sane.p1.prob_pct===100,JSON.stringify(sane));
  const dirs=await page.evaluate(()=>{
    const p={wind_dir_deg:270,hail_on:true,hail_mm:22,hail_prob_pct:70,hail_eta0_min:90,hail_after_min:15,
      hail_updates:[{at_min:10,kind:'update',eta_min:20,mm:22,prob_pct:70,dir_deg:90}]};
    const x=LOC.eventoPerfil(p,10);return {wind:x.dir_deg,hail:x.hail_dir_deg};
  });
  check('reforecast de rumbo cambia solo el viento PREVISTO de granizo, no el viento medido del wind-stow',
    dirs.wind===270&&dirs.hail===90,JSON.stringify(dirs));

  check('T1 exacto no dispara y T1+ε separa A1 FULL / A2 PARTIAL',
    frontera.t1eq.A1==='IDLE'&&frontera.t1eq.A2==='IDLE'&&
    frontera.t1plus.A1==='FULL_STOW'&&frontera.t1plus.A2==='PARTIAL_STOW',
    JSON.stringify(frontera));
  check('ETA=lead activa defensa pero lead+1 sigue en vigilancia',
    frontera.hailBoundary==='HAIL_STOW'&&frontera.hailWatch.m==='IDLE'&&frontera.hailWatch.src==='VIGILANCIA GRANIZO',
    JSON.stringify(frontera));
  check('lifecycle configurable recorre vigilancia → defensa → impacto → retención → liberado',
    JSON.stringify(frontera.lifecycle.ph)===JSON.stringify([[0,'VIGILANCIA'],[5,'DEFENSA'],[25,'IMPACTO'],[31,'IMPACTO'],[32,'RETENCION'],[43,'RETENCION'],[44,'LIBERADO']])&&
    frontera.lifecycle.p.hail_after_min===7&&frontera.lifecycle.p.hail_exit_hold_min===12&&
    Math.abs(frontera.lifecycle.hold32-12)<.02&&!frontera.lifecycle.active44,
    JSON.stringify(frontera.lifecycle));
  check('timeline de granizo marca inicio, llegada, all-clear y fin de retención con los tiempos configurados',
    JSON.stringify(frontera.lifecycle.marks)===JSON.stringify([[5,'inicia defensa granizo'],[25,'llega granizo'],[32,'all-clear granizo'],[44,'fin retención granizo']]),
    JSON.stringify(frontera.lifecycle.marks));
  check('reforecast ETA adelantado entra en defensa; ETA retrasado mantiene target y latch',
    frontera.reforecast.advance[0]==='VIGILANCIA'&&frontera.reforecast.advance[1]==='DEFENSA'&&frontera.reforecast.advance[2]===20&&
    frontera.reforecast.delay[0]===frontera.reforecast.delay[1]&&frontera.reforecast.delay[2]==='DEFENSA'&&frontera.reforecast.delay[3]===90,
    JSON.stringify(frontera.reforecast));
  check('retirada distingue «nunca protegió» de «entra en retención»',
    frontera.reforecast.withdrawWatch[0]==='VIGILANCIA'&&frontera.reforecast.withdrawWatch[1]==='SIN SEÑAL'&&!frontera.reforecast.withdrawWatch[2]&&
    frontera.reforecast.withdrawActive[0]==='RETENCION'&&frontera.reforecast.withdrawActive[1]==='LIBERADO',
    JSON.stringify(frontera.reforecast));
  check('reaparición durante hold cancela salida sin cambiar de lado',
    frontera.reforecast.reactivate[1]==='RETENCION'&&frontera.reforecast.reactivate[3]==='DEFENSA'&&
    frontera.reforecast.reactivate[0]===frontera.reforecast.reactivate[2],JSON.stringify(frontera.reforecast.reactivate));
  check('sin dato no desescala: antes de defensa queda SIN_DATO y con defensa queda protegido',
    frontera.reforecast.missingWatch[0]==='SIN_DATO'&&frontera.reforecast.missingWatch[1]===false&&!frontera.reforecast.missingWatch[2]&&
    frontera.reforecast.missingActive[0]==='SIN_DATO_PROTEGIDO'&&frontera.reforecast.missingActive[1]&&
    frontera.reforecast.missingActive[2]==='RETENCION'&&frontera.reforecast.missingActive[3]==='LIBERADO',
    JSON.stringify(frontera.reforecast));
  check('reforecast puede cruzar hacia arriba probabilidad y tamaño sin activación previa',
    !frontera.reforecast.prob[0]&&frontera.reforecast.prob[1]==='DEFENSA'&&
    !frontera.reforecast.size[0]&&frontera.reforecast.size[1]==='DEFENSA',JSON.stringify(frontera.reforecast));
  check('un segundo episodio después de LIBERADO recalcula el lado',
    frontera.reforecast.episode[0]>0&&frontera.reforecast.episode[1]==='LIBERADO'&&
    frontera.reforecast.episode[2]<0&&frontera.reforecast.episode[3]==='DEFENSA',
    JSON.stringify(frontera.reforecast.episode));
  check('un segundo aviso solo en vigilancia borra LIBERADO y una retirada queda SIN SEÑAL',
    frontera.reforecast.secondWatch[0]==='LIBERADO'&&frontera.reforecast.secondWatch[1]==='VIGILANCIA'&&
    frontera.reforecast.secondWatch[2]==='SIN SEÑAL'&&!frontera.reforecast.secondWatch[3],
    JSON.stringify(frontera.reforecast.secondWatch));
  check('timeline separa el reforecast de las transiciones físicas',
    JSON.stringify(frontera.reforecast.updateMarks)===JSON.stringify([[10,'reforecast granizo #1']]),
    JSON.stringify(frontera.reforecast.updateMarks));
  check('si viento manda al activar, al amainar con dato ausente sigue existiendo defensa',
    frontera.reforecast.windMissing[1]==='SIN_DATO_PROTEGIDO'&&frontera.reforecast.windMissing[2]&&
    ['HAIL_STOW','PARTIAL_STOW','FULL_STOW'].includes(frontera.reforecast.windMissing[3]),
    JSON.stringify(frontera.reforecast.windMissing));
  check('10 cm exactos no activan nieve y 10+ε sí',!frontera.snowEq&&frontera.snowPlus,JSON.stringify(frontera));
  check('conflicto, acuerdo y pasivo aparecen como estados distintos',
    frontera.conflict&&frontera.agree&&frontera.passive,JSON.stringify(frontera));

  // Ahora la misma batería desde la interfaz.
  await page.$eval('#incGen',e=>e.open=true);
  await page.selectOption('#incMode','adversarial');
  await page.selectOption('#incFamily','all');
  await page.fill('#incSeed','2601001');
  await page.fill('#incN','28');
  await page.click('#incRun');
  await page.waitForFunction(()=>window.INC&&!INC.running&&INC.results.length===28,{timeout:180000});
  const ui=await page.evaluate(()=>({
    n:INC.results.length,pass:INC.results.filter(x=>x.verdict.ok).length,
    fail:INC.results.filter(x=>!x.verdict.ok).length,
    rows:document.querySelectorAll('#incTable tbody tr').length,
    summary:incSummary.textContent,jsonOff:incJson.disabled,csvOff:incCsv.disabled
  }));
  check('la batería UI ejecuta los 28 casos',ui.n===28&&ui.rows===28,JSON.stringify(ui));
  check('la batería UI demuestra 28 PASS / 0 FAIL',
    ui.pass===28&&ui.fail===0&&/28/.test(ui.summary),JSON.stringify(ui));
  check('al terminar habilita export JSON y CSV',!ui.jsonOff&&!ui.csvOff);

  // "Ver" carga exactamente el caso en el simulador.
  await page.fill('#t1','77');   // mutamos el contexto después de la batería
  await page.click('#incTable tbody tr:nth-child(8) .incSee');
  const visto=await page.evaluate(()=>{
    const c=INC.results[7].case,p=c.profile;
    return {tag:c.tag,preset:ePreset.value,v:+eV.value,vp:+eVPeak.value,dir:+eD.value,
      hail:eHailOn.checked,eta:+eHailEta.value,lead:+eHailLead.value,snow:eSnowOn.checked,
      updates:eventoCfgUI().profile.hail_updates.length,
      t1:+t1.value,t1Banco:INC.baseCfg.stow.T1*3.6,
      sim:!!(EVENTO.sim&&EVENTO.sim.frames.length===211)};
  });
  check('«Ver» carga el caso exacto en la escena y lo vuelve a simular',
    visto.preset==='manual'&&visto.sim&&visto.tag==='hail_watch'&&visto.hail&&visto.updates===0,
    JSON.stringify(visto));
  check('«Ver» restaura también el contexto físico de la batería',
    Math.abs(visto.t1-visto.t1Banco)<1e-9&&visto.t1!==77,JSON.stringify(visto));
  const reView=await page.evaluate(()=>{
    const i=INC.results.findIndex(x=>x.case.tag==='hail_reactivate_hold');
    document.querySelectorAll('.incSee')[i].click();
    const p=eventoCfgUI().profile;
    return {n:p.hail_updates.length,k:p.hail_updates.map(x=>x.kind),at:p.hail_updates.map(x=>x.at_min)};
  });
  check('«Ver» reproduce también los dos reforecasts del caso adversarial',
    reView.n===2&&reView.k[0]==='withdraw'&&reView.k[1]==='update'&&reView.at[0]===5&&reView.at[1]===10,
    JSON.stringify(reView));

  // Los dos exports deben producir descargas reales.
  const djson=page.waitForEvent('download');await page.click('#incJson');const dj=await djson;
  const dcsv=page.waitForEvent('download');await page.click('#incCsv');const dc=await dcsv;
  check('exporta JSON reproducible',/inclemencias-2601001\.json$/.test(dj.suggestedFilename()),dj.suggestedFilename());
  check('exporta CSV de resultados',/inclemencias-2601001\.csv$/.test(dc.suggestedFilename()),dc.suggestedFilename());
  const jp=await dj.path(),cp=await dc.path();
  const jj=JSON.parse(fs.readFileSync(jp,'utf8')),cc=fs.readFileSync(cp,'utf8').trim().split(/\r?\n/);
  check('el JSON guarda seed, contexto y configuración base',
    jj.schema==='factiun-inclemencias-v1'&&jj.options.seed===2601001&&jj.context&&jj.base_config&&jj.results.length===28,
    JSON.stringify({schema:jj.schema,options:jj.options,context:jj.context,n:jj.results&&jj.results.length}));
  check('el CSV contiene cabecera + los 28 resultados',
    cc.length===29&&/failed_checks/.test(cc[0]),'líneas '+cc.length);

  check('la ficha no lanza errores JS',errores.length===0,errores.join(' | '));
  await browser.close();
  console.log((ko?'FALLA':'OK')+' — '+ok+'/'+(ok+ko)+' comprobaciones');
  process.exit(ko?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
