/* Orientación en meteo.html: índice de la página, emplazamiento a la vista y
 * aviso en lugar de las gráficas vacías del histórico.
 *
 * Lo que acredita: hay un enlace por sección y cada uno lleva a su título; al
 * saltar, el título NO queda tapado por la cabecera fija (pasó: se medía la
 * cabecera antes de que el «Índice» compartido entrase en ella); la cabecera
 * dice qué emplazamiento se está usando y cambia con él; antes de analizar
 * años las diez tarjetas que dependen del histórico están ocultas y en su
 * lugar hay un aviso cuyo botón es el mismo «Analizar años» de arriba; y con
 * histórico (clase `con-historico`, la que pone renderCoreVisuals) se ven y el
 * aviso se va.
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
  await page.waitForFunction(()=>document.querySelectorAll('#paginaIndice a').length>0,null,{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(800);

  const I=await page.evaluate(()=>{
    const enlaces=[...document.querySelectorAll('#paginaIndice a')];
    return {n:enlaces.length,secciones:document.querySelectorAll('.sectiontitle').length,
      destinos:enlaces.every(a=>{const t=document.querySelector(a.getAttribute('href'));return t&&t.classList.contains('sectiontitle');}),
      textos:enlaces.map(a=>a.textContent)};
  });
  check('un enlace del índice por cada sección',I.n>0&&I.n===I.secciones,I);
  check('cada enlace lleva al título de su sección',I.destinos,I.textos);
  check('los enlaces tienen nombre corto (Recurso del país, Gráficas…)',
        I.textos.includes('Recurso del país')&&I.textos.includes('Gráficas')&&I.textos.every(t=>t.length<=22),I.textos);

  // saltar no deja el título bajo la cabecera fija
  for(const nombre of ['Gráficas','Recurso del país','Descargas e informe']){
    await page.click(`#paginaIndice a:text-is("${nombre}")`);
    await page.waitForTimeout(400);
    const r=await page.evaluate(n=>{
      const a=[...document.querySelectorAll('#paginaIndice a')].find(x=>x.textContent===n);
      const t=document.querySelector(a.getAttribute('href')).getBoundingClientRect();
      const cab=document.querySelector('header').getBoundingClientRect();
      return {titulo:Math.round(t.top),cabecera:Math.round(cab.bottom),alto:innerHeight,fin:Math.round(scrollY+innerHeight)>=document.documentElement.scrollHeight-2};
    },nombre);
    // al final de la página el navegador no puede subir más el título: basta con que se vea
    check(`«${nombre}»: el título queda a la vista, bajo la cabecera`,
          r.titulo>=r.cabecera-1&&r.titulo<r.alto,r);
  }

  const sitio=await page.textContent('#sitioActual');
  check('la cabecera dice qué emplazamiento se usa',/El Burgo I/.test(sitio),sitio);
  await page.fill('#lat','-23.65');await page.fill('#lon','-70.40');await page.dispatchEvent('#lon','change');
  await page.waitForTimeout(300);
  const sitio2=await page.textContent('#sitioActual');
  check('y cambia con él (coordenadas a mano)',/Coordenadas manuales · -23\.650, -70\.400/.test(sitio2),sitio2);

  const A=await page.evaluate(()=>({
    ocultas:[...document.querySelectorAll('.requiere-historico')].filter(e=>getComputedStyle(e).display==='none').length,
    total:document.querySelectorAll('.requiere-historico').length,
    aviso:getComputedStyle(document.getElementById('avisoHistorico')).display!=='none',
    granizo:[...document.querySelectorAll('.card')].some(c=>/Riesgo acumulado de granizo/.test(c.textContent)&&getComputedStyle(c).display!=='none'),
  }));
  check('sin histórico, las diez tarjetas que dependen de él están ocultas',A.total===10&&A.ocultas===10,A);
  check('y en su lugar hay un aviso',A.aviso,A);
  check('lo que no depende del histórico (granizo) sigue a la vista',A.granizo,A);

  await page.evaluate(()=>{window.__pulsado=0;document.getElementById('yearsBtn').onclick=()=>{window.__pulsado++;};});
  await page.click('#avisoAnalizarBtn');
  check('el botón del aviso es el mismo «Analizar años»',await page.evaluate(()=>window.__pulsado)===1);

  await page.evaluate(()=>document.body.classList.add('con-historico'));
  const B=await page.evaluate(()=>({
    visibles:[...document.querySelectorAll('.requiere-historico')].filter(e=>getComputedStyle(e).display!=='none').length,
    aviso:getComputedStyle(document.getElementById('avisoHistorico')).display!=='none'}));
  check('con histórico se ven las diez y el aviso se va',B.visibles===10&&!B.aviso,B);

  check('sin errores de página',errores.length===0,errores);
  await browser.close();
  console.log('\n'+ok+' OK · '+ko+' FAIL');
  process.exit(ko?1:0);
})().catch(e=>{console.log('FAIL excepción '+e.message);process.exit(1);});
