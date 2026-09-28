'use strict';
const {chromium}=require('playwright');
const {EXEC}=require('./pw_navegador.js');
const {cases}=require('./layout_search_cases.cjs');
const assert=require('assert/strict'),fs=require('fs');
const BASE=process.env.BASE||'http://localhost:8099';
let ok=0;function check(n,v){assert.ok(v,n);ok++;console.log('OK   '+n);}
(async()=>{
 const browser=await chromium.launch({executablePath:EXEC});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.route('**/*',r=>r.request().url().startsWith(BASE)?r.continue():r.abort());
  const gen=await context.newPage();await gen.goto(BASE+'/generador-layout.html');
  const cfg=cases().find(c=>c.name.includes('Finca dibujada')).config;
  await gen.evaluate(c=>{
   $('parcelMode').value='geojson';PARCEL=c.coords;HOLES=c.holes;EXCL=c.exclusions;
   const f={mount:c.mount,table:c.table,mods:c.mods.join(','),modLen:c.modLen,modWid:c.modWid,modWp:c.moduleWp,
    pitchTrk:c.pitch,setback:c.setback,panelAz:c.panelAz,bifila:c.bifila?'1':'0',gapMod:c.gapModules,
    gapMotor:c.gapMotor,gapNs:c.gapNs,roadEvery:c.roadEvery,roadW:c.roadW,roadNsEvery:c.roadNsEvery,
    roadNsW:c.roadNsW,mode:c.mode,minStructs:c.minStructs,rowOffset:c.rowOffset};
   Object.entries(f).forEach(([k,v])=>$(k).value=v);$('alignGrid').checked=c.alignGrid;
   $('center').checked=c.center;$('orto').checked=false;
   $('axis').value=27.5;syncAz();$('originManual').checked=true;$('originX').value=1.125;$('originY').value=-.375;
   const open=window.open;window.open=(url,target)=>open.call(window,url+'&quieto=1&semilla=42-42',target);
  },cfg);
  await gen.click('#genBtn');await gen.waitForFunction(()=>!$('genBtn').disabled);
  const baseline=await gen.evaluate(()=>JSON.stringify(RES.structures.map(s=>[s.utm,s.mods])));
  const before=await gen.evaluate(()=>JSON.stringify(readCfg()));
  check('hay un único punto de optimización en el generador',await gen.locator('#optBtn').count()===1&&await gen.locator('#aiPanel,#optAz,#optGrid').count()===0);
  const [page]=await Promise.all([gen.waitForEvent('popup'),gen.click('#optBtn')]);
  await page.waitForFunction(()=>typeof CFGP!=='undefined'&&CFGP&&window.LayoutSearchUI);
  check('el botón abre el optimizador existente con el proyecto completo',await page.evaluate(()=>ENCARGO.coords.length>3&&CFGP._xOff===1.125));
  check('el aprendizaje experimental no se activa por defecto',await page.inputValue('#searchMethod')==='random');
  await page.selectOption('#searchMethod','gp');await page.click('#searchRun');
  await page.waitForFunction(()=>PAUSA&&OPC===48,null,{timeout:60000});
  let report=await page.evaluate(()=>LayoutSearchUI.report());
  check('el presupuesto incluye la referencia y se respeta',report.evaluations===48&&report.trace[0].stage==='baseline');
  check('el GP aprende del mismo objetivo que compara la interfaz',report.objective==='kWp * canonical_clear_sky_orientation_factor'&&report.trace.some(t=>t.stage==='gp'&&t.predictionBeforeEvaluation));
  check('la mejor propuesta es real, válida y nunca empeora la referencia',report.trace[report.bestIteration].valid&&report.comparison.proposal.score>=report.comparison.reference.score);
  check('comparar no cambia el proyecto ni su layout aceptado',await gen.evaluate(()=>JSON.stringify(readCfg()))===before&&await gen.evaluate(()=>JSON.stringify(RES.structures.map(s=>[s.utm,s.mods])))===baseline);
  const row=key=>page.locator('#searchDesign tr[data-key="'+key+'"] td').allTextContents();
  check('la referencia enseña su eje, azimut y origen reales',(await row('axisAz'))[1]==='27,50'&&(await row('panelAz'))[1]==='117,50'&&(await row('xOffsetM'))[1]==='1,125');
  const best=report.trace[report.bestIteration];
  check('se muestran los valores del candidato que realmente ganó',report.comparison.proposal.panelAz===best.panelAz&&report.comparison.proposal.xOffsetM===best.xOffsetM&&report.comparison.proposal.yOffsetM===best.yOffsetM);
  check('el desglose por tallas explica módulos y mesas',[report.comparison.reference,report.comparison.proposal].every(s=>Object.entries(s.bySize).reduce((n,[size,count])=>n+Number(size)*count,0)===s.modules&&Object.values(s.bySize).reduce((n,v)=>n+v,0)===s.structures));
  check('los porcentajes distinguen capacidad e índice solar',/kWp/.test(await page.textContent('#searchGain'))&&/Índice solar/.test(await page.textContent('#searchGain'))&&/no es una previsión/.test(await page.textContent('#objective')));
  await page.click('#viewBase');check('se puede ver la referencia',await page.evaluate(()=>VIEW_RESULT==='base'));
  await page.click('#viewBest');check('se puede ver la propuesta',await page.evaluate(()=>VIEW_RESULT==='best'));
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('#searchExport')]);
  const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  check('el informe descarga la comparación y la traza completas',exported.bestIteration===report.bestIteration&&exported.trace.length===48&&exported.input.panelAz===117.5);
  const expected=await page.evaluate(()=>JSON.stringify(MEJOR.r.structures.map(s=>[s.utm,s.mods])));
  check('la mejora permite aplicar el resultado',await page.isEnabled('#searchApply'));
  await page.click('#searchApply');await gen.evaluate(()=>window.dispatchEvent(new Event('focus')));
  check('aplicar conserva toda la precisión del origen',await gen.isChecked('#originManual')&&Number(await gen.inputValue('#originX'))===best.xOffsetM&&Number(await gen.inputValue('#originY'))===best.yOffsetM);
  await gen.click('#genBtn');await gen.waitForFunction(()=>!$('genBtn').disabled);
  check('Generar reproduce exactamente las mesas calculadas',await gen.evaluate(()=>JSON.stringify(RES.structures.map(s=>[s.utm,s.mods])))===expected);
  check('la orientación declarada coincide con la aplicada',await gen.evaluate(()=>Math.abs(RES.stats.axis_azimuth_deg-(RES.stats.panel_az_deg-90))<1e-8));
  const session=await gen.evaluate(()=>estadoSesion()),old=JSON.parse(JSON.stringify(session));
  delete old.checks.originManual;delete old.campos.originX;delete old.campos.originY;
  await gen.evaluate(st=>aplicaSesion(st),old);check('una sesión antigua conserva el origen automático',!await gen.isChecked('#originManual'));
  await gen.evaluate(st=>aplicaSesion(st),session);check('la sesión actual conserva los offsets aplicados',await gen.isChecked('#originManual')&&Number(await gen.inputValue('#originX'))===best.xOffsetM);
  await gen.evaluate(()=>{$('calc').querySelector('[value="core"]').disabled=false;$('calc').value='core';});
  await gen.click('#genBtn');await gen.waitForFunction(()=>!$('genBtn').disabled);
  check('la API no descarta silenciosamente el origen explícito',/no admite el origen explícito/.test(await gen.textContent('#foot')));
  await gen.evaluate(()=>{$('calc').value='js';$('axis').value=48;syncAz();});
  const [stale]=await Promise.all([gen.waitForEvent('popup'),gen.click('#optBtn')]);
  await stale.waitForFunction(()=>typeof CFGP!=='undefined'&&CFGP&&window.LayoutSearchUI);
  await stale.evaluate(()=>PASO(48));
  await gen.fill('#setback','8');await stale.click('#searchApply');await gen.evaluate(()=>window.dispatchEvent(new Event('focus')));
  check('un proyecto modificado rechaza una propuesta antigua',/proyecto ha cambiado/.test(await gen.textContent('#hint'))&&await gen.inputValue('#setback')==='8');
  await stale.close();
  await page.selectOption('#searchMethod','random');
  check('cambiar el método pausa e invalida la aplicación pendiente',await page.isDisabled('#searchApply')&&/Opciones cambiadas/.test(await page.textContent('#searchStatus')));
  await page.selectOption('#searchBudget','256');await page.click('#searchRun');await page.click('#searchPause');
  check('Pausar devuelve el control conservando lo ya evaluado',await page.evaluate(()=>PAUSA&&OPC>0&&OPC<256));
  await page.setViewportSize({width:390,height:844});
  check('en móvil los controles siguen accesibles',await page.locator('#searchRun').isVisible()&&await page.locator('#searchMethod').isVisible());
  check('el mapa móvil conserva una escala positiva y uniforme',await page.evaluate(()=>{const o=pV([TR.cx,TR.cy]),e=pV([TR.cx+10,TR.cy]),n=pV([TR.cx,TR.cy+10]);return e[0]>o[0]&&o[1]>n[1]&&Math.abs(e[0]-o[0]-(o[1]-n[1]))<1e-8;}));
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{CFGP.pitch=1;ENCARGO=Object.assign({},CFGP);nuevoSite(true);PASO(12);});
  check('ninguna geometría inválida puede aplicarse',await page.evaluate(()=>!MEJOR)&&await page.isDisabled('#searchApply'));
  check('sin resultados válidos no se inventan ganancias ni ángulos',(await row('panelAz')).slice(1).join('|')==='—|—'&&/Sin dos resultados válidos/.test(await page.textContent('#searchGain')));
  await page.evaluate(c=>{ENCARGO=Object.assign({},c,{mount:'fija',panelAz:201.25,pitch:6});nuevoSite(true);PASO(12);},cfg);
  check('en fija se conserva el azimut de paneles y no se inventa un eje',await page.evaluate(()=>TRACE.every(t=>t.panelAz===201.25))&&await page.locator('#searchDesign tr[data-key="axisAz"]').count()===0);
  await page.evaluate(c=>{ENCARGO=c;SOL=null;nuevoSite(true);PASO(12);},cfg);
  check('sin modelo solar se bloquea girar y se declara el criterio disponible',await page.isDisabled('#searchAz')&&await page.evaluate(()=>TRACE.every(t=>t.panelAz===AZ0))&&/azimut bloqueado/.test(await page.textContent('#objective')));
  await gen.evaluate(()=>{PARCELAS.push({ext:PARCEL,holes:[]});$('optBtn').click();});
  check('el alcance de una parcela y un montaje es visible',/una parcela y un montaje/.test(await gen.textContent('#hint')));
  check('la UI no provoca excepciones JavaScript',errors.length===0);
  if(process.env.LAYOUT_SCREENSHOT){await page.screenshot({path:process.env.LAYOUT_SCREENSHOT});}
  console.log('\n'+ok+' OK · 0 FALLOS');
 }finally{await browser.close();}
})().catch(e=>{console.error('FAIL '+e.stack);process.exitCode=1;});
