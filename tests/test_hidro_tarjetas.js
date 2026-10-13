"use strict";
// Card smoke: the separate entry never becomes a separate hydraulic simulator.
const {chromium} = require('playwright');
const {EXEC} = require('./pw_navegador.js');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8099';
const ROOT = path.resolve(__dirname, '..');
let ok=0, bad=0;
function check(name, yes, context='') {
  if (yes) {ok++; console.log('OK   '+name);}
  else {bad++; console.log('FAIL '+name+(context?' → '+context:''));}
}
(async()=>{
  const browser = await chromium.launch({executablePath:EXEC});
  try {
    const page = await browser.newPage({viewport:{width:1380,height:900}});
    await page.route('https://api.github.com/**', r=>r.fulfill({status:403,body:'{}'}));
    await page.goto(BASE+'/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#grid article.card');
    const cards = page.locator('#grid article.card').filter({has:page.locator('h2.name',{hasText:'Simulador de inundaciones 3D'})});
    check('tarjeta Inundaciones 3D única en Herramientas',await cards.count()===1);
    const card = cards.first();
    check('estado En desarrollo en lugar de Producción',await card.locator('.status').innerText()==='En desarrollo');
    check('se declara prediseño, no cálculo certificado',/preliminar|criba/i.test(await card.locator('.obj').innerText()));
    check('tiene icono propio',await card.locator('.pic svg.picto').count()===1);
    check('el buscador del Panel la encuentra',await page.evaluate(()=>TOOLS.some(p=>p.name==='Simulador de inundaciones 3D')));
    await card.locator('.card-toggle').click();
    check('la tarjeta se puede desplegar',await card.locator('.detail').isVisible());
    check('botón Documentación disponible',await card.locator('button.docs').count()===1);
    const app = card.locator('a.btn.primary');
    check('botón Abrir disponible',await app.count()===1);
    const href = await app.getAttribute('href');
    const url = new URL(href, BASE+'/index.html');
    check('abre el generador EXISTENTE, no un nuevo HTML',/\/proyectos\/generador-layout\.html$/.test(url.pathname));
    check('acceso con selección explícita agua3d',url.searchParams.get('herramienta')==='agua3d');
    check('ancla la sección hidráulica',url.hash==='#hydroCard');
    check('la documentación existe y se mantiene en el repositorio',fs.existsSync(path.join(ROOT,'docs/inundaciones-3d.md')));
    const doc=fs.readFileSync(path.join(ROOT,'docs/inundaciones-3d.md'),'utf8');
    check('la documentación aclara que NO es certificado',/NO.*certificado|no.*certificable/i.test(doc));
    const index = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
    check('acceso rápido visible al lado de otras tarjetas',index.includes('💧 Inundaciones 3D</a>'));
    const sw=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
    check('PWA precachea documentación de la tarjeta',sw.includes('"docs/inundaciones-3d.md"'));
    // In CI the same branch is served locally: strip only deployment prefix.
    await page.goto(BASE+'/generador-layout.html'+url.search+url.hash,{waitUntil:'domcontentloaded'});
    check('llega exactamente al panel hidráulico del generador',await page.locator('#hydroCard.hydro-target').count()===1);
    check('muestra guía para entrar desde tarjeta',await page.locator('#hydroCardEntryNote').isVisible());
    check('el título contextual indica el generador compartido',/Inundaciones 3D.*Generador/.test(await page.locator('header.bar h1').innerText()));
    check('sin MDT la app no inventa una simulación',await page.locator('#hydro3dBtn').isDisabled());
    check('conserva controles existentes de hidrología',await page.locator('#hydroRun').count()===1);
    const clean = await browser.newPage();
    await clean.goto(BASE+'/generador-layout.html',{waitUntil:'domcontentloaded'});
    check('el acceso normal al generador no se ve alterado',await clean.locator('#hydroCard.hydro-target').count()===0);
    await clean.close();
  } finally {await browser.close();}
  console.log('\n'+ok+' pruebas OK, '+bad+' fallos');
  process.exitCode = bad?1:0;
})().catch(err=>{console.log('FAIL '+(err.stack||err));process.exitCode=1;});