'use strict';
const {chromium}=require('playwright');
const {EXEC}=require('./pw_navegador.js');
const {cases}=require('./layout_search_cases.cjs');
const assert=require('assert/strict');
const BASE=process.env.BASE||'http://localhost:8099';
let ok=0;
function check(n,v){assert.ok(v,n);ok++;console.log('OK   '+n);}
(async()=>{
  const browser=await chromium.launch({executablePath:EXEC});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith(BASE)?route.continue():route.abort());
    await page.goto(BASE+'/generador-layout.html');
    await page.locator('#aiPanel').evaluate(el=>el.open=true);
    check('el piloto está integrado en el generador existente',await page.locator('#aiRun').isVisible());
    check('el ML sin ventaja consistente no se activa por defecto',await page.inputValue('#aiMethod')==='random');
    await page.selectOption('#aiMethod','gp');
    const cfg=cases().find(c=>c.name.includes('Finca dibujada')).config;
    await page.evaluate(c=>{
      $('parcelMode').value='geojson';PARCEL=c.coords;HOLES=c.holes;EXCL=c.exclusions;
      const fields={mount:c.mount,table:c.table,mods:c.mods.join(','),modLen:c.modLen,modWid:c.modWid,modWp:c.moduleWp,
        pitchTrk:c.pitch,setback:c.setback,panelAz:c.panelAz,bifila:c.bifila?'1':'0',gapMod:c.gapModules,
        gapMotor:c.gapMotor,gapNs:c.gapNs,roadEvery:c.roadEvery,roadW:c.roadW,roadNsEvery:c.roadNsEvery,
        roadNsW:c.roadNsW,mode:c.mode,minStructs:c.minStructs,rowOffset:c.rowOffset};
      Object.entries(fields).forEach(([k,v])=>$(k).value=v);
      $('alignGrid').checked=c.alignGrid;$('center').checked=c.center;$('orto').checked=false;encaja();
    },cfg);
    const fixed=await page.evaluate(()=>JSON.stringify(readCfg()));
    await page.click('#aiRun');
    await page.waitForFunction(()=>!$('aiRun').disabled,{timeout:30000});
    check('la búsqueda produce una comparación de resultados reales',await page.locator('#aiResults').isVisible()&&await page.locator('#aiMetrics tr').count()===4);
    check('comparar no cambia los parámetros del proyecto',await page.evaluate(()=>JSON.stringify(readCfg()))===fixed);
    check('el caso de parcela existente encuentra una mejora',!(await page.locator('#aiApply').isDisabled()));
    const baseline=await page.evaluate(()=>JSON.stringify(LAY.toGeoJSON(RES)));
    await page.click('#aiViewBest');
    check('la vista previa no cambia el layout exportable',await page.evaluate(()=>JSON.stringify(LAY.toGeoJSON(RES)))===baseline);
    check('la propuesta se dibuja mediante el renderer existente',await page.evaluate(()=>LayoutSearchUI.preview&&LayoutSearchUI.preview.stats.modules>=RES.stats.modules));
    await page.click('#aiViewBase');
    check('se puede volver a la referencia',/referencia original/.test(await page.textContent('#aiViewStatus')));
    await page.click('#aiApply');
    const applied=await page.evaluate(()=>JSON.stringify(LAY.toGeoJSON(RES)));
    check('aplicar cambia el layout y guarda el origen explícito',applied!==baseline&&await page.isChecked('#originManual'));
    check('no se modifica orientación, pitch, talla ni exclusiones',await page.evaluate(before=>{
      const now=readCfg();delete now._xOff;delete now._yOff;return JSON.stringify(now)===before;
    },fixed));
    const session=await page.evaluate(()=>estadoSesion());
    const oldSession=JSON.parse(JSON.stringify(session));
    delete oldSession.checks.originManual;delete oldSession.campos.originX;delete oldSession.campos.originY;
    await page.evaluate(st=>aplicaSesion(st),oldSession);
    check('una sesión antigua conserva el origen automático',!(await page.isChecked('#originManual')));
    await page.evaluate(st=>aplicaSesion(st),session);
    await page.click('#genBtn');
    await page.waitForFunction(()=>!$('genBtn').disabled);
    check('Generar reproduce exactamente la propuesta aplicada',await page.evaluate(()=>JSON.stringify(LAY.toGeoJSON(RES)))===applied);
    await page.evaluate(st=>aplicaSesion(st),session);
    check('el guardado de sesión conserva el origen',await page.isChecked('#originManual')&&await page.inputValue('#originX')===session.campos.originX);
    await page.evaluate(()=>{$('calc').querySelector('[value="core"]').disabled=false;$('calc').value='core';});
    await page.click('#genBtn');await page.waitForFunction(()=>!$('genBtn').disabled);
    check('la API no descarta silenciosamente el origen aplicado',/no admite el origen explícito/.test(await page.textContent('#foot')));
    await page.evaluate(()=>{$('calc').value='js';});
    await page.evaluate(()=>{$('originManual').checked=false;});
    await page.click('#aiRun');await page.waitForFunction(()=>!$('aiRun').disabled,{timeout:30000});
    await page.fill('#setback','8');
    check('cambiar el proyecto invalida la propuesta anterior',await page.isDisabled('#aiApply')&&/ha cambiado/.test(await page.textContent('#aiStatus')));
    check('una propuesta caducada no permanece en el mapa',await page.evaluate(()=>LayoutSearchUI.preview===null));
    await page.click('#aiRun');await page.click('#aiStop');
    await page.waitForFunction(()=>!$('aiRun').disabled,{timeout:30000});
    check('Detener devuelve el control de la interfaz',await page.isEnabled('#genBtn')&&/Detenida/.test(await page.textContent('#aiStatus')));
    await page.evaluate(()=>{$('optAz').checked=true;});await page.click('#aiRun');
    check('se respeta el límite de orientación fija',/Desactiva el barrido/.test(await page.textContent('#aiStatus')));
    await page.evaluate(()=>{$('optAz').checked=false;PARCELAS.push({ext:PARCEL,holes:[]});});await page.click('#aiRun');
    check('varias parcelas quedan fuera del piloto de forma visible',/una parcela y un montaje/.test(await page.textContent('#aiStatus')));
    check('la nueva UI no provoca excepciones JavaScript',errors.length===0);
    await page.evaluate(()=>{PARCELAS=[];$('setback').value=5;});await page.click('#aiRun');
    await page.waitForFunction(()=>!$('aiRun').disabled,{timeout:30000});
    if(process.env.LAYOUT_SCREENSHOT){await page.locator('#aiPanel').screenshot({path:process.env.LAYOUT_SCREENSHOT});}
    const accepted=await page.evaluate(()=>JSON.stringify(LAY.toGeoJSON(RES)));
    await page.evaluate(()=>{$('pitchTrk').value='1';});await page.click('#aiRun');
    await page.waitForFunction(()=>!$('aiRun').disabled,{timeout:30000});
    check('ninguna geometría válida se declara y no sustituye el layout aceptado',
      /ninguna implantación supera/.test(await page.textContent('#aiStatus'))&&await page.isDisabled('#aiApply')&&
      await page.isDisabled('#aiViewBase')&&await page.evaluate(()=>JSON.stringify(LAY.toGeoJSON(RES)))===accepted);
    console.log('\n'+ok+' OK · 0 FALLOS');
  }finally{await browser.close();}
})().catch(e=>{console.error('FAIL '+e.stack);process.exitCode=1;});
