/* Compatibility in a real browser. Atlas is an intercepted destination fixture:
   this verifies navigation, not Atlas rendering, authentication or live Notion. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {EXEC}=require('./pw_navegador.js');
const BASE=process.env.BASE_URL||'http://localhost:8099';
const ORIGIN='https://maps-9rd.pages.dev';
const PATH='/herramientas/radar-factiun';
const fixture='<!doctype html><html lang="es"><meta charset="utf-8"><title>Atlas destination fixture</title><main id="atlas-destination">Destino de navegación interceptado; no es el visor de Atlas.</main></html>';
let passed=0,failed=0,browser;
const check=async(name,fn)=>{try{await fn();console.log('OK   '+name);passed++;}catch(e){console.error('FAIL '+name+' — '+e.message);failed++;}};
async function context(options={}){
  const ctx=await browser.newContext({serviceWorkers:'block',javaScriptEnabled:options.javascript!==false,viewport:{width:390,height:844}}),requests=[];
  await ctx.route('**/*',route=>{
    const url=new URL(route.request().url());requests.push(url.href);
    if(url.origin===ORIGIN)return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fixture});
    if(url.origin!==new URL(BASE).origin)return route.abort();
    if(url.pathname==='/engineering-history-fixture.html')return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>Página anterior</title><h1>Página anterior</h1>'});
    if(options.blockModule&&url.pathname.endsWith('/lib/notion-ingenieria-redirect.mjs'))return route.abort();
    return route.continue();
  });
  return {ctx,page:await ctx.newPage(),requests};
}
async function arrived(page){
  await page.waitForURL(url=>url.origin===ORIGIN&&url.pathname===PATH&&url.hash==='#ingenieria');
  await page.waitForSelector('#atlas-destination');
  return new URL(page.url());
}
async function follow(page,query=''){
  await page.goto(BASE+'/notion-ingenieria.html'+query,{waitUntil:'commit'});
  return arrived(page);
}
(async()=>{
  browser=await chromium.launch({headless:true,executablePath:EXEC||undefined,args:['--no-sandbox']});
  await check('la URL anterior navega a una sola pantalla de ingeniería',async()=>{
    const {ctx,page}=await context();try{const url=await follow(page);assert.equal(url.search,'');assert.equal(await page.locator('#atlas-destination').count(),1);}finally{await ctx.close();}
  });
  await check('la navegación conserva ficha, filtros, vista, orden y luz guardados',async()=>{
    const {ctx,page}=await context();try{
      const state={front:'patentes',ficha:'nextpower-rail-coupling-us12794401',q:'torsión & viento #1',claim:'fact',company:'Nextpower LLC',technology:'Clip elástico',person:'José García',product:'Modelo + A',view:'table',sort:'event',luz:'noche'};
      const url=await follow(page,'?'+new URLSearchParams(state));
      assert.deepEqual(Object.fromEntries(url.searchParams),state);
    }finally{await ctx.close();}
  });
  await check('una URL manipulada no cambia el origen ni la pestaña de destino',async()=>{
    const {ctx,page}=await context();try{const url=await follow(page,'?redirect=https://elsewhere.example&token=example&front=control#direccion');assert.deepEqual([...url.searchParams],[['front','control']]);}finally{await ctx.close();}
  });
  await check('volver atrás regresa a la página anterior sin un bucle de redirección',async()=>{
    const {ctx,page}=await context();try{await page.goto(BASE+'/engineering-history-fixture.html');await follow(page,'?front=personas');await page.goBack();assert.equal(new URL(page.url()).pathname,'/engineering-history-fixture.html');assert(await page.getByRole('heading',{name:'Página anterior'}).isVisible(),'Contenido recibido: '+await page.locator('body').innerText());}finally{await ctx.close();}
  });
  await check('sin JavaScript queda un acceso legible y utilizable en móvil',async()=>{
    const {ctx,page}=await context({javascript:false});try{await page.goto(BASE+'/notion-ingenieria.html');const link=page.getByRole('link',{name:'Abrir Notion ingeniería',exact:true});assert(await link.isVisible());const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert(size.scroll<=size.width+1);await link.click();await arrived(page);}finally{await ctx.close();}
  });
  await check('si el módulo no carga, el enlace alternativo funciona con teclado',async()=>{
    const {ctx,page}=await context({blockModule:true});try{await page.goto(BASE+'/notion-ingenieria.html');await page.locator('#open-engineering').focus();await page.keyboard.press('Enter');await arrived(page);}finally{await ctx.close();}
  });
  await check('la ruta de compatibilidad no carga el visor ni el snapshot retirados',async()=>{
    const {ctx,page,requests}=await context();try{await follow(page,'?front=patentes');const legacy=['/assets/notion-ingenieria.css','/lib/notion-ingenieria.mjs','/lib/notion-ingenieria-core.mjs','/data/notion-ingenieria.json'];assert.equal(requests.filter(url=>legacy.includes(new URL(url).pathname)).length,0);}finally{await ctx.close();}
  });
  await check('la tarjeta del Panel abre directamente la pantalla canónica',async()=>{
    const {ctx,page,requests}=await context();try{await page.goto(BASE+'/index.html');const card=page.locator('article.card.tool').filter({has:page.getByRole('heading',{name:'Notion ingeniería',exact:true})});await card.waitFor();const popupPromise=page.waitForEvent('popup');await card.locator('.foot a.primary').click();const popup=await popupPromise;await arrived(popup);assert.equal(requests.filter(url=>new URL(url).pathname==='/notion-ingenieria.html').length,0);}finally{await ctx.close();}
  });
})().catch(e=>{console.error('FAIL navegador — '+e.stack);failed++;}).finally(async()=>{if(browser)await browser.close();console.log(`\n${passed} comprobaciones correctas; ${failed} fallos.`);process.exitCode=failed?1:0;});
