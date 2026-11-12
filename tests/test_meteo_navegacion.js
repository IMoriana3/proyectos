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
  // A 1440 px: histórico, TMY y PVSyst en una fila, el informe debajo a lo
  // ancho, y en ninguna tarjeta queda hueco entre el estado y los botones
  const L=await page.evaluate(()=>{
    const g=document.querySelector('.dl-grid').getBoundingClientRect();
    const it=[...document.querySelectorAll('.dl-item')].map(e=>e.getBoundingClientRect());
    const huecos=[...document.querySelectorAll('.dl-item')].map(e=>Math.round(e.querySelector('.dl-acciones').getBoundingClientRect().top-e.querySelector('.dl-estado').getBoundingClientRect().bottom));
    return {tops:it.slice(0,3).map(r=>Math.round(r.top)),informe:[Math.round(it[3].top),Math.round(it[3].width),Math.round(g.width)],abajo:Math.round(it[0].bottom),huecos};});
  check('histórico, TMY y PVSyst comparten fila',new Set(L.tops).size===1,L.tops);
  check('el informe va debajo, a todo el ancho',L.informe[0]>=L.abajo&&Math.abs(L.informe[1]-L.informe[2])<2,L.informe);
  check('sin hueco entre el estado y los botones',L.huecos.every(h=>h>=0&&h<=12),L.huecos);
  await page.evaluate(()=>{window.__pulsado=0;document.getElementById('yearsBtn').onclick=()=>{window.__pulsado++;};});
  await page.click('#dlPrepTmy');
  check('«Analizar años» de una descarga pulsa el de arriba',await page.evaluate(()=>window.__pulsado)===1);

  // Clima del sitio sin datos: TMY y comparativa no dejan cajas vacías
  await page.goto(BASE+'/meteo.html#pestana-clima',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(600);
  const V=await page.evaluate(()=>{const vis=e=>!!e&&getComputedStyle(e).display!=='none'&&!e.closest('[data-fuera]');
    return {tmyTabla:vis(document.querySelector('.tmy-table')),tmyVacio:vis(document.querySelector('.tmy-vacio')),
      resumen:vis(document.getElementById('cmpBody')?.closest('.card')),grafica:vis(document.getElementById('vizCompareSources')?.closest('.card')),
      rms:vis(document.getElementById('rmsGhi')?.closest('.metricgrid'))};});
  check('sin TMY: la tabla vacía se pliega y queda «Construir TMY»',!V.tmyTabla&&V.tmyVacio,V);
  check('sin comparativa: ni resumen, ni gráfica, ni RMS con rayas',!V.resumen&&!V.grafica&&!V.rms,V);
  // Escala de los ejes: pasos redondos y desde 0 si el dato no es negativo
  const E=await page.evaluate(async()=>{const m=await import('./lib/meteo-viz.js');return [[0,487],[-2.9,43.7],[0,0.84],[3,1066]].map(([a,b])=>m.escala(a,b));});
  check('ejes con cifras redondas (0–500, −15–45, 0–1, 0–1200)',JSON.stringify(E)==='[[0,500],[-15,45],[0,1],[0,1200]]',E);
  // La leyenda va en la cabecera: con una línea horizontal en lo alto del
  // área de datos (como los umbrales de stow), no hay texto de leyenda debajo
  const Lg=await page.evaluate(async()=>{const m=await import('./lib/meteo-viz.js');const c=document.createElement('canvas');c.style.width='600px';document.body.appendChild(c);
    m.drawLineChart(c,[{label:'Serie',values:[0,10,20]},{label:'stow T2',values:[60,60,60]}],{title:'Prueba',height:255,zero:true});
    const ctx=c.getContext('2d'),dpr=c.width/600,ambar=y=>{const d=ctx.getImageData(0,Math.round(y*dpr),c.width,1).data;let n=0;for(let k=0;k<d.length;k+=4)if(d[k]>200&&d[k+1]>120&&d[k+1]<170&&d[k+2]<90)n++;return n;};
    const r={cabecera:ambar(10.5)};c.remove();return r;});
  check('la leyenda se pinta en la cabecera, no dentro del gráfico',Lg.cabecera>0,Lg);
  // Riesgos sin datos: el viento sintético no deja cifras con rayas ni un
  // lienzo vacío; el granizo por latitud dice que no está calibrado
  await page.goto(BASE+'/meteo.html#pestana-riesgos',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>/[0-9]/.test(document.getElementById('hailLamOut')?.textContent||''),null,{timeout:15000}).catch(()=>{});
  const R=await page.evaluate(async()=>{const vis=e=>!!e&&getComputedStyle(e).display!=='none';const m=await import('./lib/meteo-browser.js');
    return {cifras:vis(document.getElementById('windMean')?.closest('.metricgrid')),lienzo:vis(document.getElementById('vizWindSynth')),
      nivel:document.getElementById('hailTier').textContent,aviso:document.getElementById('hailStatus').textContent,
      heur:m.hailRisk(41.6,-0.8).calibrado,manual:m.hailRisk(41.6,-0.8,{lambdaOverride:.02}).calibrado};});
  check('sin generar, el viento sintético no enseña cifras ni gráfica vacías',!R.cifras&&!R.lienzo,R);
  check('el granizo por latitud sale «SIN CALIBRAR» y lo explica',R.nivel==='SIN CALIBRAR'&&/sin fuente ni calibrar/.test(R.aviso),R);
  check('solo una λ del sitio cuenta como calibrada',R.heur===false&&R.manual===true,R);
  // Windy en unidades métricas fijas: con «default» las elegía por el idioma
  // del navegador y en uno en inglés salían °F y nudos
  const wsrc=new URL(await page.getAttribute('#windyMap','src'));
  check('Windy pide °C, km/h y mm',wsrc.searchParams.get('metricTemp')==='°C'&&wsrc.searchParams.get('metricWind')==='km/h'&&wsrc.searchParams.get('metricRain')==='mm',wsrc.search);
  check('sin errores de página',errores.length===0,errores);
  await browser.close();
  console.log('\n'+ok+' OK · '+ko+' FAIL');
  process.exit(ko?1:0);
})().catch(e=>{console.log('FAIL excepción '+e.message);process.exit(1);});
