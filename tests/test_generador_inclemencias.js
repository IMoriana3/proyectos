// Generador de inclemencias del simulador de abanderamiento.
//
// Demuestra tres cosas distintas:
// 1) el generador es reproducible por seed;
// 2) el catálogo adversarial pisa las fronteras que dice pisar;
// 3) el simulador pasa oráculos INDEPENDIENTES + invariantes de límites y determinismo.
//
//   node tests/test_generador_inclemencias.js
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
  await page.waitForSelector('#incRun',{timeout:15000});
  await page.waitForFunction(()=>window.EVENTO&&EVENTO.sim&&EVENTO.sim.frames.length>200,{timeout:30000});

  check('la UI del generador existe dentro del modo Evento',
    ['incMode','incFam','incSev','incSeed','incN','incOne','incRun','incExport','incSummary','incTable']
      .every(id=>!!document.getElementById(id)));

  const puro=await page.evaluate(()=>{
    const ctx=incCtxUI();
    const a=LOC.generaInclemencias({modo:'aleatorio',familia:'todas',severidad:'mixta',seed:12345,n:8,ctx});
    const b=LOC.generaInclemencias({modo:'aleatorio',familia:'todas',severidad:'mixta',seed:12345,n:8,ctx});
    const c=LOC.generaInclemencias({modo:'aleatorio',familia:'todas',severidad:'mixta',seed:54321,n:8,ctx});
    const cat=LOC.catalogoInclemencias(ctx);
    return {same:JSON.stringify(a)===JSON.stringify(b),different:JSON.stringify(a)!==JSON.stringify(c),
      ids:cat.map(x=>x.id),oracles:cat.map(x=>x.oracle),ctx};
  });
  check('misma seed produce exactamente los mismos casos',puro.same);
  check('otra seed cambia la batería aleatoria',puro.different);
  check('el catálogo adversarial cubre viento, pasivo, granizo, nieve y combinados',
    ['wind_t1_minus','wind_between','wind_t2_plus','gust_passive','hail_watch','hail_lead_plus_1',
     'hail_lead_exact','hail_near','hail_size_below','hail_prob_below','hail_exit_hold',
     'snow_exact','snow_plus','hail_wind','snow_hail_conflict','snow_hail_same']
      .every(x=>puro.ids.includes(x)),puro.ids.join(','));

  // Probar TODO el catálogo, dos veces cada caso.
  const red=await page.evaluate(()=>{
    const ctx=incCtxUI(),base=incBaseCfg(),cat=LOC.catalogoInclemencias(ctx),res=[];
    for(const raw of cat){
      const caso=LOC.resuelveInclemencia(raw,base);
      const cfg=LOC.configInclemencia(base,caso,ctx);
      const s1=LOC.simulaEvento(cfg),s2=LOC.simulaEvento(cfg);
      const ver=LOC.verificaInclemencia(caso,s1,cfg,s2);
      res.push({id:caso.id,oracle:caso.oracle,pass:ver.pass,checks:ver.checks,actual:ver.actual});
    }
    return res;
  });
  const rojos=red.filter(x=>!x.pass);
  check('TODO el catálogo adversarial pasa su oráculo',rojos.length===0,
    rojos.map(x=>x.id+': '+x.checks.filter(c=>!c.ok).map(c=>c.id+' '+c.detalle).join(' | ')).join(' || '));
  check('cada caso comprueba timeline, finitud, límites, determinismo y oráculo',
    red.every(x=>['timeline','finitos','limites','determinismo','oraculo'].every(id=>x.checks.some(c=>c.id===id))),
    JSON.stringify(red.find(x=>x.checks.length<5)));
  check('hay al menos 80 checks efectivos en el red team',red.reduce((a,x)=>a+x.checks.length,0)>=80);

  // Fronteras configurables: lead de granizo 30 min.
  const lead=await page.evaluate(()=>{
    const old=eHailLead.value;eHailLead.value='30';
    const ctx=incCtxUI(),cat=LOC.catalogoInclemencias(ctx);
    const w=cat.find(x=>x.id==='hail_watch'),edge=cat.find(x=>x.id==='hail_lead_exact'),
          plus=cat.find(x=>x.id==='hail_lead_plus_1');
    eHailLead.value=old;
    return {watchEta:w.profile.hail_eta0_min,edgeEta:edge.profile.hail_eta0_min,
            plusEta:plus.profile.hail_eta0_min,lead:ctx.hail_lead};
  });
  check('el generador consume el lead configurable de granizo',
    lead.lead===30&&lead.watchEta===60&&lead.edgeEta===30&&lead.plusEta===31,JSON.stringify(lead));

  // La batería de UI: 12 casos adversariales.
  await page.selectOption('#incMode','adversarial');
  await page.selectOption('#incFam','todas');
  await page.fill('#incSeed','20261005');
  await page.fill('#incN','12');
  await page.click('#incRun');
  await page.waitForFunction(()=>window.INCLEM&&!INCLEM.corriendo&&INCLEM.resultados.length===12,{timeout:60000});
  const ui=await page.evaluate(()=>({
    n:INCLEM.resultados.length,
    pass:INCLEM.resultados.filter(x=>x.ver.pass).length,
    rows:document.querySelectorAll('#incTable tbody tr').length,
    summary:incSummary.textContent,
    exportOff:incExport.disabled,
    first:INCLEM.resultados[0].caso
  }));
  check('Demostrar ejecuta la batería pedida',ui.n===12&&ui.rows===12,JSON.stringify(ui));
  check('la batería UI sale TODO PASS',ui.pass===12&&/TODO PASS/.test(ui.summary),ui.summary);
  check('tras demostrar se habilita exportar JSON',ui.exportOff===false);

  // Replay de un caso: el primer resultado se carga en el Evento.
  await page.click('#incTable tbody tr:first-child .incReplay');
  await page.waitForTimeout(300);
  const replay=await page.evaluate(()=>({
    preset:ePreset.value,
    wind:+eV.value,peak:+eVPeak.value,
    hail:eHailOn.checked,snow:eSnowOn.checked,
    pos:EVENTO.pos
  }));
  check('▶ Ver carga el caso generado como escenario Manual',replay.preset==='manual',JSON.stringify(replay));
  check('▶ Ver coloca el cursor en el minuto de prueba del caso',
    replay.pos===ui.first.probe_t,JSON.stringify({pos:replay.pos,probe:ui.first.probe_t}));

  // Generar un solo caso también lo verifica y lo carga.
  await page.fill('#incSeed','77');
  await page.click('#incOne');
  await page.waitForFunction(()=>window.INCLEM&&!INCLEM.corriendo&&INCLEM.resultados.length===1,{timeout:60000});
  const uno=await page.evaluate(()=>({
    pass:INCLEM.resultados[0].ver.pass,
    uid:INCLEM.resultados[0].caso.uid,
    summary:incSummary.textContent
  }));
  check('Generar un caso lo verifica antes de reproducirlo',uno.pass&&/TODO PASS/.test(uno.summary),JSON.stringify(uno));

  // Familia granizo: no debe colarse viento/nieve.
  await page.selectOption('#incFam','granizo');
  await page.fill('#incN','6');
  await page.click('#incRun');
  await page.waitForFunction(()=>window.INCLEM&&!INCLEM.corriendo&&INCLEM.resultados.length===6,{timeout:60000});
  const fam=await page.evaluate(()=>INCLEM.resultados.map(x=>x.caso.familia));
  check('el filtro de familia limita realmente la generación',fam.every(x=>x==='granizo'),fam.join(','));

  check('la ficha no lanza errores JavaScript',errores.length===0,errores.join(' | '));
  await browser.close();
  console.log((ko?'FALLA':'OK')+' — '+ok+'/'+(ok+ko)+' comprobaciones');
  process.exit(ko?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
