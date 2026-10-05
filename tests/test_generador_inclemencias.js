// Generador de inclemencias y banco de falsación del simulador de abanderamiento.
//
// No comprueba solo que haya botones. Genera fronteras adversariales reproducibles,
// las pasa por EL MISMO LOC.simulaEvento de la escena y exige la respuesta correcta.
// También conduce la batería desde la UI, reproduce un caso y prueba los exports.
//
//   node tests/test_generador_inclemencias.js
const { chromium } = require('playwright');
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

  // Los 15 patrones adversariales. Una vuelta entera debe cubrir las fronteras.
  const adv=await page.evaluate(()=>{
    const b=incBaseCfg(),o={mode:'adversarial',family:'all',severity:'mixed',seed:2601001,n:15};
    const out=[];
    for(let i=0;i<15;i++){
      const c=LOC.incGenera(o,i,b),cfg=incCfgCaso(c,b);
      const s1=LOC.simulaEvento(cfg),s2=LOC.simulaEvento(cfg),v=LOC.incVerifica(c,cfg,s1,s2);
      out.push({id:c.id,tag:c.tag,name:c.name,ok:v.ok,fail:v.fail,total:v.total,
        bad:v.checks.filter(x=>!x.ok).map(x=>x.name+': '+x.detail)});
    }
    return out;
  });
  const tags=adv.map(x=>x.tag);
  check('la vuelta adversarial cubre las 15 fronteras distintas',
    new Set(tags).size===15,JSON.stringify(tags));
  check('las 15 fronteras salen PASS',
    adv.every(x=>x.ok),JSON.stringify(adv.filter(x=>!x.ok)));
  check('cada caso publica invariantes universales + su regla específica',
    adv.every(x=>x.total>=6),adv.map(x=>x.tag+':'+x.total).join(' | '));

  const has=t=>tags.includes(t);
  check('incluye T1 exacto / +ε y T2 exacto / +ε',
    ['wind_t1_equal','wind_t1_plus','wind_t2_equal','wind_t2_plus'].every(has),tags.join(','));
  check('incluye suelta pasiva por racha',has('passive_release'));
  check('incluye granizo sub-19, prob baja, vigilancia, frontera ETA y granizo cerca',
    ['hail_size_below','hail_prob_below','hail_watch','hail_boundary','hail_near'].every(has),tags.join(','));
  check('incluye nieve 10 exactos y 10+ε',has('snow_equal')&&has('snow_plus'));
  check('incluye conflicto, acuerdo y arbitraje viento×granizo',
    has('conflict')&&has('agree')&&has('hail_wind'),tags.join(','));

  // Prueba independiente de algunas respuestas, no sólo del verificador.
  const frontera=await page.evaluate(()=>{
    const b=incBaseCfg(),o={mode:'adversarial',family:'all',severity:'mixed',seed:2601001,n:15};
    const get=tag=>{for(let i=0;i<15;i++){const c=LOC.incGenera(o,i,b);if(c.tag===tag){
      const s=LOC.simulaEvento(incCfgCaso(c,b));return {c,s};}}};
    const w1=get('wind_t1_equal'),w2=get('wind_t1_plus'),hb=get('hail_boundary'),hw=get('hail_watch');
    const se=get('snow_equal'),sp=get('snow_plus'),cf=get('conflict'),ag=get('agree'),pa=get('passive_release');
    const max=f=>f.s.frames.reduce((a,x)=>x.wind_ms>a.wind_ms?x:a,f.s.frames[0]);
    const f0=x=>x.s.frames.find(f=>f.t_min===0);
    return {
      t1eq:max(w1).modos,t1plus:max(w2).modos,
      hailBoundary:f0(hb).modos.A1,hailWatch:{m:f0(hw).modos.A1,src:f0(hw).info.A1.fuente},
      snowEq:se.s.frames.some(f=>f.modos.A1==='SNOW_STOW'),snowPlus:sp.s.frames.some(f=>f.modos.A1==='SNOW_STOW'),
      conflict:cf.s.frames.some(f=>f.modos.A1==='CONFLICT'),agree:ag.s.frames.some(f=>f.modos.A1==='MULTI_STOW'),
      passive:pa.s.frames.some(f=>f.modos.PASIVO==='SUELTA')
    };
  });
  check('T1 exacto no dispara y T1+ε separa A1 FULL / A2 PARTIAL',
    frontera.t1eq.A1==='IDLE'&&frontera.t1eq.A2==='IDLE'&&
    frontera.t1plus.A1==='FULL_STOW'&&frontera.t1plus.A2==='PARTIAL_STOW',
    JSON.stringify(frontera));
  check('ETA=lead activa defensa pero lead+1 sigue en vigilancia',
    frontera.hailBoundary==='HAIL_STOW'&&frontera.hailWatch.m==='IDLE'&&frontera.hailWatch.src==='VIGILANCIA GRANIZO',
    JSON.stringify(frontera));
  check('10 cm exactos no activan nieve y 10+ε sí',!frontera.snowEq&&frontera.snowPlus,JSON.stringify(frontera));
  check('conflicto, acuerdo y pasivo aparecen como estados distintos',
    frontera.conflict&&frontera.agree&&frontera.passive,JSON.stringify(frontera));

  // Ahora la misma batería desde la interfaz.
  await page.$eval('#incGen',e=>e.open=true);
  await page.selectOption('#incMode','adversarial');
  await page.selectOption('#incFamily','all');
  await page.fill('#incSeed','2601001');
  await page.fill('#incN','15');
  await page.click('#incRun');
  await page.waitForFunction(()=>window.INC&&!INC.running&&INC.results.length===15,{timeout:120000});
  const ui=await page.evaluate(()=>({
    n:INC.results.length,pass:INC.results.filter(x=>x.verdict.ok).length,
    fail:INC.results.filter(x=>!x.verdict.ok).length,
    rows:document.querySelectorAll('#incTable tbody tr').length,
    summary:incSummary.textContent,jsonOff:incJson.disabled,csvOff:incCsv.disabled
  }));
  check('la batería UI ejecuta los 15 casos',ui.n===15&&ui.rows===15,JSON.stringify(ui));
  check('la batería UI demuestra 15 PASS / 0 FAIL',
    ui.pass===15&&ui.fail===0&&/15/.test(ui.summary),JSON.stringify(ui));
  check('al terminar habilita export JSON y CSV',!ui.jsonOff&&!ui.csvOff);

  // "Ver" carga exactamente el caso en el simulador.
  await page.click('#incTable tbody tr:nth-child(8) .incSee');
  const visto=await page.evaluate(()=>{
    const c=INC.results[7].case,p=c.profile;
    return {tag:c.tag,preset:ePreset.value,v:+eV.value,vp:+eVPeak.value,dir:+eD.value,
      hail:eHailOn.checked,eta:+eHailEta.value,lead:+eHailLead.value,snow:eSnowOn.checked,
      sim:!!(EVENTO.sim&&EVENTO.sim.frames.length===211)};
  });
  check('«Ver» carga el caso exacto en la escena y lo vuelve a simular',
    visto.preset==='manual'&&visto.sim&&visto.tag==='hail_watch'&&visto.hail,
    JSON.stringify(visto));

  // Los dos exports deben producir descargas reales.
  const djson=page.waitForEvent('download');await page.click('#incJson');const dj=await djson;
  const dcsv=page.waitForEvent('download');await page.click('#incCsv');const dc=await dcsv;
  check('exporta JSON reproducible',/inclemencias-2601001\.json$/.test(dj.suggestedFilename()),dj.suggestedFilename());
  check('exporta CSV de resultados',/inclemencias-2601001\.csv$/.test(dc.suggestedFilename()),dc.suggestedFilename());

  check('la ficha no lanza errores JS',errores.length===0,errores.join(' | '));
  await browser.close();
  console.log((ko?'FALLA':'OK')+' — '+ok+'/'+(ok+ko)+' comprobaciones');
  process.exit(ko?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
