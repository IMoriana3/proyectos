/* Orientación en meteo.html: pestañas, emplazamiento a la vista y aviso en
 * lugar de las gráficas vacías del histórico.
 *
 * Lo que acredita: siete pestañas; toda tarjeta es de UNA pestaña (o del
 * bloque fijo del emplazamiento, que se ve siempre) y cada pestaña enseña sólo
 * las suyas; granizo, nieve y temperatura viven en Riesgos y la adaptación y
 * el contrato en Avanzado; la pestaña va en el hash y un enlace a un elemento
 * (#mapasPais) abre la suya y lo deja a la vista; una gráfica dibujada con su
 * pestaña oculta se REDIBUJA al ancho real al abrirla (un canvas oculto mide 0
 * y salía a 800 px, estirado); la cabecera dice qué emplazamiento se usa; y
 * antes de analizar años, en «Clima del sitio» hay un aviso con el mismo botón
 * «Analizar años» en lugar de diez tarjetas vacías.
 * Lo que NO acredita: que el análisis de años funcione (eso es de
 * test_meteo_browser.mjs); aquí no hay red.
 */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const {EXEC}=require('./pw_navegador.js');
const BASE=process.env.BASE||process.env.BASE_URL||'http://localhost:8099';
let ok=0,ko=0;
function check(name,cond,detail){
  if(cond){ok++;console.log('OK   '+name);}
  else{ko++;console.log('FAIL '+name+(detail===undefined?'':' → '+JSON.stringify(detail)));}
}
const PESTANAS=['hoy','clima','riesgos','contexto','medidas','exportar','avanzado'];

(async()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','meteo.html'),'utf8');
  const cuerpo=html.slice(html.indexOf('function renderCoreVisuals(){'));
  check('renderCoreVisuals marca la página como «con histórico» al pintar',
        /^function renderCoreVisuals\(\)\{\s*if\(!CURRENT\?\.rows\?\.length\)return;\s*document\.body\.classList\.add\("con-historico"\);/.test(cuerpo));

  const browser=await chromium.launch({executablePath:EXEC});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errores=[];page.on('pageerror',e=>errores.push(e.message));
  await page.route(/^https?:\/\/(?!localhost)/,r=>r.abort());
  await page.goto(BASE+'/meteo.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.FactiunPestanas&&window.__meteoRedibujar,null,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(600);

  const botones=await page.$$eval('#pestanas [data-pestana-boton]',bs=>bs.map(b=>[b.dataset.pestanaBoton,b.getAttribute('role'),b.textContent]));
  check('siete pestañas, como botones con rol de pestaña',
        botones.length===7&&botones.every(b=>b[1]==='tab')&&botones.map(b=>b[0]).join()===PESTANAS.join(),botones);
  check('abre en «Hoy»',await page.evaluate(()=>window.FactiunPestanas.activa())==='hoy');

  const reparto=await page.evaluate(()=>[...document.querySelectorAll('main .grid>*')].map(el=>({
    p:el.dataset.pestana||'', h2:((el.querySelector('h2')||el).textContent||'').trim().slice(0,60)})));
  check('toda pieza de la página es de una pestaña o del bloque fijo',
        reparto.every(r=>r.p==='fijo'||PESTANAS.includes(r.p)),reparto.filter(r=>!r.p));
  const de=re=>(reparto.find(r=>re.test(r.h2))||{}).p;
  check('granizo, viento sintético, nieve y temperaturas extremas viven en Riesgos',
        de(/Riesgo de granizo/)==='riesgos'&&de(/Viento sintético/)==='riesgos'&&de(/Análisis de nieve/)==='riesgos'&&de(/Temperaturas extremas/)==='riesgos',
        [de(/Riesgo de granizo/),de(/Viento sintético/),de(/Análisis de nieve/),de(/Temperaturas extremas/)]);
  // una tarjeta por riesgo: los mandos, las cifras y la gráfica juntos
  const unicas=await page.evaluate(()=>{
    const cards=[...document.querySelectorAll('main .grid>.card')];
    const de=re=>cards.filter(c=>re.test((c.querySelector('h2')||{}).textContent||''));
    const g=de(/granizo/i),v=de(/Viento sintético/i);
    return {granizo:g.length,viento:v.length,
      gJunto:g.length===1&&!!g[0].querySelector('#hailBtn')&&!!g[0].querySelector('#vizHailCurve')&&!!g[0].querySelector('#hailTier'),
      vJunto:v.length===1&&!!v[0].querySelector('#windSynthBtn')&&!!v[0].querySelector('#vizWindSynth')&&!!v[0].querySelector('#windP99')};
  });
  check('una sola tarjeta de granizo, con su botón, sus cifras y su curva',unicas.granizo===1&&unicas.gJunto,unicas);
  check('una sola tarjeta de viento sintético, con su botón, sus cifras y su gráfica',unicas.viento===1&&unicas.vJunto,unicas);
  check('la adaptación de sitio y el contrato viven en Avanzado',
        de(/Adaptación de sitio/)==='avanzado'&&de(/Consumidores del mismo contrato/)==='avanzado');
  check('el emplazamiento es fijo',de(/Proyecto \/ emplazamiento/)==='fijo'&&de(/Consultar y preparar datos/)==='fijo');

  for(const id of PESTANAS){
    await page.click(`[data-pestana-boton="${id}"]`);
    const r=await page.evaluate(id=>{
      const vis=[...document.querySelectorAll('main .grid>*')].filter(el=>getComputedStyle(el).display!=='none');
      return {ajenas:vis.filter(el=>el.dataset.pestana!==id&&el.dataset.pestana!=='fijo').length,
        propias:vis.filter(el=>el.dataset.pestana===id).length,hash:location.hash,
        sel:document.querySelector(`[data-pestana-boton="${id}"]`).getAttribute('aria-selected')};
    },id);
    check(`«${id}»: sólo lo suyo y el emplazamiento`,r.ajenas===0&&r.propias>0&&r.hash==='#pestana-'+id&&r.sel==='true',r);
  }

  // una gráfica dibujada con su pestaña oculta se redibuja al ancho real
  await page.click('[data-pestana-boton="hoy"]');
  await page.evaluate(()=>{document.getElementById('hailBtn').click();});
  await page.waitForTimeout(300);
  await page.click('[data-pestana-boton="riesgos"]');
  await page.waitForTimeout(400);
  const lienzo=await page.$eval('#vizHailCurve',cv=>({buffer:cv.width,css:Math.round(cv.clientWidth*Math.min(3,devicePixelRatio||1))}));
  check('al abrir Riesgos, el granizo se redibuja a su ancho (no a 800 px)',
        lienzo.css>0&&Math.abs(lienzo.buffer-lienzo.css)<=2,lienzo);

  // enlace a un elemento: abre su pestaña y lo deja a la vista
  await page.goto(BASE+'/meteo.html#mapasPais',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.FactiunPestanas,null,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(700);
  const m=await page.evaluate(()=>({p:window.FactiunPestanas.activa(),
    top:Math.round(document.getElementById('mapasPais').getBoundingClientRect().top),
    cab:Math.round(document.querySelector('header').getBoundingClientRect().bottom)}));
  check('#mapasPais abre «Contexto» y deja la sección a la vista, bajo la cabecera',
        m.p==='contexto'&&m.top>=m.cab-1&&m.top<900,m);
  await page.goto(BASE+'/meteo.html#pestana-exportar',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.FactiunPestanas,null,{timeout:15000}).catch(()=>{});
  check('#pestana-exportar abre «Exportar»',await page.evaluate(()=>window.FactiunPestanas.activa())==='exportar');

  // emplazamiento a la vista
  await page.goto(BASE+'/meteo.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(800);
  check('la cabecera dice qué emplazamiento se usa',/El Burgo I/.test(await page.textContent('#sitioActual')));
  await page.fill('#lat','-23.65');await page.fill('#lon','-70.40');await page.dispatchEvent('#lon','change');
  await page.waitForTimeout(300);
  const sitio2=await page.textContent('#sitioActual');
  check('y cambia con él (coordenadas a mano)',/Coordenadas manuales · -23\.650, -70\.400/.test(sitio2),sitio2);

  // aviso en lugar de las gráficas vacías
  await page.click('[data-pestana-boton="clima"]');
  const A=await page.evaluate(()=>({
    ocultas:[...document.querySelectorAll('.requiere-historico')].filter(e=>getComputedStyle(e).display==='none').length,
    total:document.querySelectorAll('.requiere-historico').length,
    aviso:getComputedStyle(document.getElementById('avisoHistorico')).display!=='none'}));
  check('sin histórico, las diez tarjetas que dependen de él están ocultas y hay un aviso',A.total===10&&A.ocultas===10&&A.aviso,A);
  await page.evaluate(()=>{window.__pulsado=0;document.getElementById('yearsBtn').onclick=()=>{window.__pulsado++;};});
  await page.click('#avisoAnalizarBtn');
  check('el botón del aviso es el mismo «Analizar años»',await page.evaluate(()=>window.__pulsado)===1);
  await page.evaluate(()=>document.body.classList.add('con-historico'));
  const B=await page.evaluate(()=>({
    visibles:[...document.querySelectorAll('.requiere-historico')].filter(e=>e.dataset.pestana==='clima'&&getComputedStyle(e).display!=='none').length,
    deClima:[...document.querySelectorAll('.requiere-historico')].filter(e=>e.dataset.pestana==='clima').length,
    aviso:getComputedStyle(document.getElementById('avisoHistorico')).display!=='none'}));
  check('con histórico se ven las de «Clima del sitio» y el aviso se va',B.deClima>0&&B.visibles===B.deClima&&!B.aviso,B);

  // Exportar: sin datos, cada descarga dice qué falta, no se puede pulsar
  // y el botón de al lado es el que lo prepara
  await page.goto(BASE+'/meteo.html#pestana-exportar',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__meteoRedibujar,null,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(600);
  const D=await page.evaluate(()=>({
    estados:['dlEstHist','dlEstTmy','dlEstPvsyst','dlEstInforme'].map(i=>[document.getElementById(i).className,document.getElementById(i).textContent]),
    bloqueados:['dlHist','dlTmy','dlPvsyst','reportBtn'].map(i=>document.getElementById(i).disabled),
    preparar:[...document.querySelectorAll('.dl-preparar')].map(b=>[b.dataset.preparar,b.hidden]),
    tecnicos:!!document.querySelector('details.dl-tecnico #dlJson')&&!!document.querySelector('details.dl-tecnico #dlManifest')&&!!document.querySelector('details.dl-tecnico #dlContract')}));
  check('sin datos, las cuatro descargas dicen qué falta',D.estados.every(([c,t])=>/falta/.test(c)&&/Falta|Primero/.test(t)),D.estados);
  check('y sus botones no se pueden pulsar',D.bloqueados.every(Boolean),D.bloqueados);
  check('al lado, el botón que lo prepara: analizar años',D.preparar.length===4&&D.preparar.every(([t,h])=>t==='yearsBtn'&&!h),D.preparar);
  check('los formatos técnicos van plegados aparte',D.tecnicos);
  await page.evaluate(()=>{window.__pulsado=0;document.getElementById('yearsBtn').onclick=()=>{window.__pulsado++;};});
  await page.click('#dlPrepTmy');
  check('«Analizar años» de una descarga pulsa el de arriba',await page.evaluate(()=>window.__pulsado)===1);

  check('sin errores de página',errores.length===0,errores);
  await browser.close();
  console.log('\n'+ok+' OK · '+ko+' FAIL');
  process.exit(ko?1:0);
})().catch(e=>{console.log('FAIL excepción '+e.message);process.exit(1);});
