/* Real published snapshot, local browser. This does not test authenticated Notion. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {EXEC}=require('./pw_navegador.js');
const BASE=process.env.BASE_URL||'http://localhost:8099';
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/notion-ingenieria.json'),'utf8'));
const shots=path.join(process.env.LOGS_DIR||path.join(__dirname,'../.arneses'),'notion-ingenieria');
let passed=0,failed=0,browser;
const check=async(name,fn)=>{try{await fn();console.log('OK   '+name);passed++;}catch(e){console.error('FAIL '+name+' — '+e.message);failed++;}};
(async()=>{
  browser=await chromium.launch({headless:true,executablePath:EXEC||undefined,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'/notion-ingenieria.html?luz=noche');
  await page.waitForSelector('.record-card');
  await page.evaluate(()=>document.fonts.ready);fs.mkdirSync(shots,{recursive:true});
  await page.screenshot({animations:'disabled',path:path.join(shots,'desktop-night.png'),fullPage:true});
  await check('carga las fichas reales y el enlace al hub Notion',async()=>{assert.equal(await page.locator('.record-card').count(),data.records.length);assert.equal(await page.locator('.top-actions .notion-link').getAttribute('href'),data.notion_hub_url);});
  await check('los diez frentes filtran según el JSON',async()=>{
    for(const id of ['modelos','patentes','personas','proveedores','montaje','control','laboratorios','investigacion','incidentes','senales']){
      await page.locator(`[data-front="${id}"]`).click();
      assert.equal(await page.locator('.record-card').count(),data.records.filter(r=>r.fronts.includes(id)).length);
      assert.equal(await page.locator('#patent-catalog').isVisible(),id==='patentes');
      if(id==='patentes')await page.screenshot({animations:'disabled',path:path.join(shots,'patents-night.png'),fullPage:true});
    }
    await page.locator('[data-front="all"]').click();
    assert.equal(await page.locator('#patent-catalog').isVisible(),false);
  });
  await check('el filtro de empresa cruza con el buscador y se puede limpiar',async()=>{const company=data.records[0].companies[0];await page.selectOption('#company',company);assert.equal(await page.locator('.record-card').count(),data.records.filter(r=>r.companies.includes(company)).length);await page.fill('#query','zzzz-no-such-technical-record');await page.waitForSelector('.empty-state');assert.equal(await page.locator('.record-card').count(),0);await page.locator('#clear-filters').click();assert.equal(await page.locator('.record-card').count(),data.records.length);});
  await check('la tabla conserva atribución y estado sin promoverlos',async()=>{await page.locator('[data-view="table"]').click();assert.equal(await page.locator('.records-table tbody tr').count(),data.records.length);assert.equal(await page.locator('.records-table .manufacturer_claim').count(),data.records.filter(r=>r.claim_type==='manufacturer_claim').length);});
  await check('la cronología distingue fechas publicadas y fechas desconocidas',async()=>{await page.locator('[data-view="timeline"]').click();assert.equal(await page.locator('.timeline-record').count(),data.records.length);const undated=data.records.filter(r=>!r.event_date&&!r.sources.some(s=>s.published_at));assert.equal(await page.getByText('FECHA NO PUBLICADA',{exact:true}).count(),undated.length);});
  await check('relaciones muestran evidencia y no dibujan un grafo de empresas coincidentes',async()=>{await page.locator('[data-view="relations"]').click();assert(await page.locator('.relations-intro').isVisible());assert(await page.locator('.relation-card,.empty-state').count()>0);});
  await check('la ficha abre evidencia, fechas y enlace compartible',async()=>{await page.locator('[data-view="cards"]').click();const first=await page.locator('.record-open').first().getAttribute('data-record');const record=data.records.find(r=>r.id===first);await page.locator('.record-open').first().click();assert.equal(await page.locator('#dialog-title').textContent(),record.title);assert.equal(await page.locator('#record-dialog .source-item a').count(),record.sources.length);assert(new URL(page.url()).searchParams.get('ficha')===first);assert.equal(await page.locator('#record-dialog .source-item a').first().getAttribute('href'),record.sources[0].url);});
  await check('recargar un enlace directo vuelve a abrir la misma ficha y Escape la cierra',async()=>{const id=new URL(page.url()).searchParams.get('ficha');await page.reload();await page.waitForSelector('#record-dialog[open]');assert.equal(await page.locator('#dialog-title').textContent(),data.records.find(r=>r.id===id).title);await page.keyboard.press('Escape');assert.equal(await page.locator('#record-dialog[open]').count(),0);assert.equal(new URL(page.url()).searchParams.get('ficha'),null);});
  await check('día y noche respetan el contrato de URL',async()=>{await page.locator('#light-toggle').click();assert.equal(await page.locator('html').getAttribute('data-luz'),'dia');assert.equal(new URL(page.url()).searchParams.get('luz'),'dia');await page.screenshot({animations:'disabled',path:path.join(shots,'desktop-day.png'),fullPage:true});await page.locator('[data-front="patentes"]').click();await page.screenshot({animations:'disabled',path:path.join(shots,'patents-day.png'),fullPage:true});await page.locator('[data-front="all"]').click();});
  await check('móvil mantiene filtros y fichas sin desbordar la página',async()=>{await page.setViewportSize({width:390,height:844});await page.reload();await page.waitForSelector('.record-card');const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert(sizes.scroll<=sizes.width+1,JSON.stringify(sizes));assert(await page.locator('#company').isVisible());await page.screenshot({animations:'disabled',path:path.join(shots,'mobile-day.png'),fullPage:true});await page.locator('[data-front="patentes"]').click();const patentSizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert(patentSizes.scroll<=patentSizes.width+1,JSON.stringify(patentSizes));await page.screenshot({animations:'disabled',path:path.join(shots,'patents-mobile-day.png'),fullPage:true});await page.locator('[data-front="all"]').click();await page.locator('.record-open').first().click();assert(await page.locator('#record-dialog[open]').isVisible());const dialog=await page.locator('#record-dialog').boundingBox();assert(dialog.width<390);await page.screenshot({animations:'disabled',path:path.join(shots,'mobile-record.png')});await page.locator('#close-dialog').click();});
  await check('error de red se distingue de una selección vacía y permite reintentar',async()=>{const second=await browser.newPage();let fail=true;await second.route('**/data/notion-ingenieria.json',route=>fail?route.fulfill({status:503,body:''}):route.continue());await second.goto(BASE+'/notion-ingenieria.html');await second.waitForSelector('[data-action="retry"]');assert(await second.getByText('La exportación no está disponible',{exact:true}).isVisible());fail=false;await second.locator('[data-action="retry"]').click();await second.waitForSelector('.record-card');assert.equal(await second.locator('.record-card').count(),data.records.length);await second.close();});
  await check('sin errores JavaScript en el recorrido real',()=>assert.deepEqual(errors,[]));
})().catch(e=>{console.error('FAIL navegador — '+e.stack);failed++;}).finally(async()=>{if(browser)await browser.close();console.log(`\n${passed} comprobaciones correctas; ${failed} fallos.`);process.exitCode=failed?1:0;});
