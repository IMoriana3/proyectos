/* Meteo · LÓGICA DE VIENTO en pantalla: Chromium con Supabase sustituido.
 * No usa credenciales ni datos de planta: las series son fixtures de TEST con
 * cinco rachas puestas a mano, una por cada caso que la tarjeta tiene que distinguir:
 *   01/06 12:00 UTC  pre-stow de día junto al mediodía solar → hay que ir a 30°
 *   01/06 12:10 UTC  stow dentro de ese pre-stow            → de 30° a 55°, 25°
 *   01/06 22:30 UTC  primera alarma de la noche             → 5° E a 55° E, 50°
 *   01/06 23:30 UTC  otra alarma la misma noche             → ya en defensa
 *   02/06 07:00 UTC  pre-stow de mañana                     → ya en rango
 *   03/06 04:01 UTC  racha tras dos horas de sensores a cero → dudosa
 * Lo que acredita: medidas cargadas → parámetros de la Cartera → simulación →
 * resumen, lista plegada, filtro, CSV, informe → cierre de sesión. Y que la
 * simulación NO depende del periodo cargado arriba: aquí se carga solo el 04/06
 * (un día en calma) y la tarjeta pide a la base todo el histórico de viento máximo.
 * Lo que NO acredita: el motor (eso es tests/test_meteo_logica_viento.js) ni una
 * cuenta real de Supabase.
 */
const {chromium}=require('playwright');
const {EXEC}=require('./pw_navegador.js');
const fs=require('node:fs');
const BASE=process.env.BASE||process.env.BASE_URL||'http://localhost:8099';
let ok=0,ko=0;
function check(name,cond,detail){
  if(cond){ok++;console.log('OK   '+name);}
  else{ko++;console.log('FAIL '+name+(detail===undefined?'':' → '+JSON.stringify(detail)));}
}
function stub(){
  let logged=false;
  const t=Array.from({length:1440},(_,i)=>i*60);
  const calm=()=>t.map((_,i)=>5+((i*7)%10)/10);          // 5,0–5,9 m/s: nunca cruza
  const day=(dia,ncu,equipo,id,gusts,zero)=>{
    const max=calm();
    for(const [minute,ms] of gusts||[])max[minute]=ms;
    if(zero)for(let i=zero[0];i<=zero[1];i++)max[i]=0;
    return {id,planta:'El Burgo I',ncu,equipo,clase:'hsu',dia,tz:'UTC',paso_s:60,filas:17000,
      subido:'2026-06-05T10:00:00Z',fuente:equipo.replace(' ','_')+'_'+dia+'_test.csv',
      series:{t,v:{wind_speed:max.map(x=>Math.max(0,x-1)),wind_speed_max:max,
        wind_direction:t.map(()=>270),irradiance:0,snow_alarm:0}}};
  };
  const data=[
    day('2026-06-01','1','HSU 230',1,[[720,12],[1350,12],[1410,12]]),
    day('2026-06-01','1','HSU 231',2,[[730,17.5],[731,17.5],[732,17.5]]),
    day('2026-06-02','1','HSU 230',3,[[420,12]]),
    day('2026-06-02','1','HSU 231',4,[]),
    day('2026-06-03','1','HSU 230',5,[[241,12]],[120,240]),
    day('2026-06-03','1','HSU 231',6,[],[120,240]),
    day('2026-06-04','1','HSU 230',7,[]),
    day('2026-06-04','1','HSU 231',8,[]),
    // Una segunda NCU, un solo día y con una racha propia: sirve para la planta entera
    day('2026-06-02','2','HSU 230',9,[[900,12]])
  ];
  window.supabase={createClient:()=>({
    auth:{
      async getUser(){return {data:{user:logged?{id:'test-user'}:null},error:null};},
      async signInWithPassword({email,password}){
        if(email==='test@factiun.example'&&password==='clave-prueba'){logged=true;return {error:null};}
        return {error:{message:'Invalid login credentials'}};
      },
      async signOut(){logged=false;return {error:null};}
    },
    from(table){
      if(table!=='telemetria')throw Error('La tarjeta ha consultado '+table);
      const filter={cols:'',plant:null,classes:null,day:null,after:null,from:null,to:null};
      (window.__consultas=window.__consultas||[]).push(filter);
      return {
        select(cols){filter.cols=String(cols||'');return this;},
        eq(k,v){if(k==='planta')filter.plant=v;if(k==='dia')filter.day=v;return this;},
        in(k,v){if(k==='clase')filter.classes=v;return this;},order(){return this;},
        gt(k,v){if(k==='dia')filter.after=v;return this;},
        gte(k,v){if(k==='dia')filter.from=v;return this;},
        lte(k,v){if(k==='dia')filter.to=v;return this;},
        limit(){return Promise.resolve({data:[{dia:'2026-06-04'}],error:null});},
        range(a,b){
          const result=data.filter(x=>(!filter.plant||x.planta===filter.plant)&&(!filter.classes||filter.classes.includes(x.clase))
            &&(!filter.day||x.dia===filter.day)&&(!filter.after||x.dia>filter.after)
            &&(!filter.from||x.dia>=filter.from)&&(!filter.to||x.dia<=filter.to)).slice(a,b+1);
          // La selección ligera de la lógica de viento: solo el eje de tiempos y el viento máximo.
          const ligera=/(^|,)vmax:series->v->wind_speed_max(,|$)/.test(filter.cols);
          return Promise.resolve({data:ligera?result.map(({series,...row})=>({...row,t:series.t,vmax:series.v.wind_speed_max})):result,error:null});
        }
      };
    }
  })};
}
(async()=>{
 const browser=await chromium.launch({executablePath:EXEC});
 const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});
 const jsErrors=[];
 page.on('pageerror',e=>jsErrors.push(e.message));
 await page.addInitScript(stub);
 /* Sin esto el arnés depende de NO tener red: con red, la página carga el
    supabase-js de verdad desde la CDN, que pisa el sustituto, y el inicio de
    sesión de prueba va contra el Supabase real y falla. Mismo corte que
    test_meteo_sensores_browser.js: la librería se sirve vacía y nada sale de BASE. */
 await page.route('**/*',route=>{
   const u=route.request().url();
   if(u.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@'))return route.fulfill({
     status:200,contentType:'application/javascript',body:'/* Supabase stub inyectado antes */'
   });
   if(u.startsWith(BASE+'/'))return route.continue();
   return route.abort();
 });
 await page.goto(BASE+'/meteo.html#pestana-medidas',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#plantSel')&&document.querySelector('#plantSel').options.length>1,null,{timeout:20000});
 const txt=async id=>((await page.textContent('#'+id))||'').trim();

 check('la tarjeta vive en la pestaña Mediciones y, sin medidas, queda plegada como el resto',await page.evaluate(()=>{
   const c=document.getElementById('windLogicCard');
   return !!c&&c.dataset.pestana==='medidas'&&!c.hasAttribute('data-fuera')&&!c.checkVisibility()&&
     [...document.querySelectorAll('#wlSummary,#wlChart,#wlEvents')].every(e=>!e.checkVisibility())&&document.getElementById('wlRun').disabled;
 }));

 /* Arriba se carga un único día, y en calma: lo que salga después lo ha pedido la tarjeta. */
 await page.fill('#supFrom','2026-06-04');
 await page.fill('#supTo','2026-06-04');
 await page.fill('#supEmail','test@factiun.example');
 await page.fill('#supPassword','clave-prueba');
 await page.click('#supLogin');
 await page.waitForFunction(()=>!document.getElementById('wlRun').disabled,null,{timeout:20000});
 const pre=await page.evaluate(()=>({lat:+document.getElementById('wlLat').value,lon:+document.getElementById('wlLon').value,
   pitch:+document.getElementById('wlPitch').value,tz:document.getElementById('wlTz').value,
   group:document.getElementById('wlGroup').value}));
 check('con medidas se despliega lo esencial; los parámetros de detalle y la lista quedan plegados',await page.evaluate(()=>document.getElementById('windLogicCard').checkVisibility()&&
   document.getElementById('wlSummary').checkVisibility()&&document.getElementById('wlPre').checkVisibility()&&!document.getElementById('wlPitch').checkVisibility()&&!document.getElementById('wlEvents').checkVisibility()));
 check('arriba hay cargado un solo día; la tarjeta propone todo el histórico de la base',await page.evaluate(()=>
   /2026-06-04 → 2026-06-04/.test(document.getElementById('supLoadStatus').textContent)&&document.getElementById('wlSource').value==='supabase'&&
   !document.getElementById('wlSource').options[0].disabled&&document.getElementById('wlFrom').value===''&&document.getElementById('wlTo').value===''),await txt('supLoadStatus'));
 check('coordenadas, pitch y zona horaria salen de la Cartera',Math.abs(pre.lat-41.576)<0.01&&Math.abs(pre.lon+0.798)<0.01&&pre.pitch===6&&pre.tz==='Europe/Madrid'&&pre.group==='1',pre);

 const resumen=()=>page.evaluate(()=>[...document.querySelectorAll('#wlSummary tr')].map(r=>[...r.children].map(c=>c.textContent.trim())));
 await page.click('#wlRun');
 await page.waitForFunction(()=>document.querySelectorAll('#wlSummary tr').length===2,null,{timeout:20000});
 /* Con dos NCU en la base, lo que sale sin tocar nada es la planta entera: es lo que cuenta para la alarma. */
 const porDefecto=await page.evaluate(()=>({valor:document.getElementById('wlGroup').value,opciones:[...document.getElementById('wlGroup').options].map(o=>o.value+'='+o.textContent)}));
 const Rd=await resumen();
 check('con varias NCU, por defecto sale la planta entera; cada NCU queda como detalle',
   porDefecto.valor==='*'&&porDefecto.opciones.join('|')==='*=Planta entera (todas las NCU)|1=NCU 1 · HSU 230, HSU 231|2=NCU 2 · HSU 230'&&
   Rd[0][0]==='Pre-stow (> 40 km/h)'&&Rd[0][2]==='6'&&/Planta entera/.test(await txt('wlStatus')),[porDefecto,Rd]);
 await page.selectOption('#wlGroup','1');
 await page.waitForFunction(()=>/^NCU 1/.test(document.getElementById('wlStatus').textContent),null,{timeout:15000});
 const R=await resumen();
 const pedido=await page.evaluate(()=>window.__consultas.filter(q=>/vmax:/.test(q.cols)));
 check('la simulación pide a la base solo el viento máximo de las HSU, sin fechas ni la serie entera',
   pedido.length>=1&&pedido.every(q=>!/(^|,)series(,|$)/.test(q.cols)&&/(^|,)t:series->t(,|$)/.test(q.cols)&&JSON.stringify(q.classes)==='["hsu"]'&&q.plant==='El Burgo I'&&!q.from&&!q.to)&&
   /01\/06\/2026.*04\/06\/2026/.test(await txt('wlStatus'))&&/todo el histórico de la base/.test(await txt('wlStatus')),[pedido,await txt('wlStatus')]);
 check('resumen: cuatro episodios y cinco pre-stow (dos sin mover, tres a mover) y un stow; el máximo de las dos HSU manda',
   R[0].slice(0,5).join('|')==='Pre-stow (> 40 km/h)|4|5|2|3'&&R[1].slice(0,5).join('|')==='Stow (> 60 km/h)|1|1|0|1',R);
 check('cuánto: uno de día casi 30°, dos de noche 50°; el stow, 25°',/^1 de día, (29,\d|30)°; 2 de noche, 50°$/.test(R[0][5])&&R[1][5]==='1 de día, 25°',[R[0][5],R[1][5]]);
 check('recuento por racha máxima en una línea',(await txt('wlBands'))==='Un episodio agrupa las activaciones que vuelven a saltar menos de 2 h después de desactivarse. Activaciones por racha máxima. Pre-stow: 40–50 km/h: 4 · > 60 km/h: 1. Stow: 60–65 km/h: 1.',await txt('wlBands'));
 /* Gráficas: cuándo, a qué hora, cuánto duran y qué detecta cada HSU. */
 const graf=await page.evaluate(()=>{
   const pintado=id=>{const c=document.getElementById(id),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n>500;};
   return {ok:['wlChart','wlChartHour','wlChartDur','wlChartHsu'].map(pintado),titulo:document.getElementById('wlChartTitle').textContent,
     nota:document.getElementById('wlChartsNote').textContent,visibles:['wlChartHour','wlChartDur','wlChartHsu'].every(id=>document.getElementById(id).checkVisibility())};});
 check('gráficas de episodios: cuándo, hora del día, duración y qué detecta cada HSU',
   graf.ok.every(Boolean)&&graf.visibles&&graf.titulo==='Episodios de viento: cuándo'&&/Racha máxima: NCU 1 · HSU 230, [\d,]+ km\/h; NCU 1 · HSU 231, [\d,]+ km\/h\./.test(graf.nota),graf);
 /* El margen para unir solo cambia cómo se cuenta: sin él, cada activación es su episodio, y no se vuelve a descargar nada. */
 const antes=await page.evaluate(()=>window.__consultas.filter(q=>/vmax:/.test(q.cols)).length);
 await page.fill('#wlMerge','0');await page.dispatchEvent('#wlMerge','change');
 const R0=await resumen(),tras=await page.evaluate(()=>window.__consultas.filter(q=>/vmax:/.test(q.cols)).length);
 check('margen a 0: episodios = activaciones, sin volver a simular ni descargar',
   R0[0].slice(1,3).join('|')==='5|5'&&tras===antes&&(await page.evaluate(()=>document.getElementById('wlChartTitle').textContent))==='Activaciones de viento: cuándo'&&
   !/episodio agrupa/.test(await txt('wlBands')),[R0,antes,tras]);
 await page.fill('#wlMerge','120');await page.dispatchEvent('#wlMerge','change');
 const rows=await page.evaluate(()=>[...document.querySelectorAll('#wlEvents tr')].map(r=>[...r.children].map(c=>c.textContent.trim())));
 check('la lista está completa pero plegada, con su recuento en el título',rows.length===6&&(await txt('wlListTitle'))==='Todas las activaciones (6)',[rows.length,await txt('wlListTitle')]);
 const first=rows[0]||[],stow=rows.find(r=>/^Stow/.test(r[0]))||[];
 check('mediodía solar: del horizontal a 30°, y hora local de la planta',
   /^Pre-stow/.test(first[0])&&/14:00/.test(first[1])&&/^30° [EO]$/.test(first[8])&&parseFloat(first[9].replace(',','.'))>29&&first[6]==='Día',first);
 check('stow desde pre-stow: de 30° a 55° son 25°',/^30° [EO]$/.test(stow[7])&&/^55° [EO]$/.test(stow[8])&&stow[9]==='25°',stow);
 const noche=rows.filter(r=>r[6]==='Noche');
 check('noche: la primera alarma mueve 50° a 55° E y la segunda se queda',
   noche.length===3&&noche[0][7]==='5° E'&&noche[0][8]==='55° E'&&noche[0][9]==='50°'&&noche[1][8]==='se queda'&&noche[1][9]==='0°',noche);
 const dud=await page.evaluate(()=>({n:document.querySelectorAll('#wlEvents tr.wl-dudoso').length,
   notes:document.getElementById('wlNotes').textContent}));
 check('la racha tras los sensores a cero sale como dudosa y se avisa',dud.n===1&&/Una activación dudosa/.test(dud.notes)&&/sensores a cero/.test(dud.notes),dud);

 await page.click('#wlListTitle');
 await page.selectOption('#wlFilter','stow');
 check('al abrir la lista se ve, y el filtro deja solo el stow',await page.evaluate(()=>document.getElementById('wlEvents').checkVisibility()&&document.querySelectorAll('#wlEvents tr').length===1));
 await page.selectOption('#wlFilter','');

 const [download]=await Promise.all([page.waitForEvent('download',{timeout:15000}),page.click('#wlCsv')]);
 const csv=fs.readFileSync(await download.path(),'utf8').replace(/^﻿/,'').trim().split(/\r?\n/);
 check('CSV: cabecera, seis filas, hora local y la dudosa anotada',
   download.suggestedFilename()==='logica_viento_El_Burgo_I.csv'&&csv.length===7&&/inicio_local/.test(csv[0])&&
   csv.filter(l=>/DUDOSO/.test(l)).length===1&&/;pre-stow;1;;1;2026-06-01 12:00;2026-06-01 14:00;/.test(csv[1]),[download.suggestedFilename(),csv.length,csv[1]]);

 const [informe]=await Promise.all([page.waitForEvent('download',{timeout:15000}),page.click('#wlReport')]);
 const html=fs.readFileSync(await informe.path(),'utf8');
 check('informe: una página con el resumen, la gráfica y las reglas; la lista no va',
   informe.suggestedFilename()==='informe_logica_viento_El_Burgo_I.html'&&/^<!doctype html>/.test(html)&&
   html.includes('<td>Pre-stow (&gt; 40 km/h)</td><td>4</td><td>5</td><td>2</td><td>3</td>')&&(html.match(/<svg /g)||[]).length===1&&
   html.includes('<b>Tabla 2.</b> Reglas simuladas.')&&html.includes('<b>Tabla 1.</b>')&&!html.includes('Anexo'),[informe.suggestedFilename(),html.length]);

 /* Con dos NCU en la base hay un tercer grupo: la planta entera, donde cuenta la racha de cualquier HSU. */
 const grupos=await page.evaluate(()=>[...document.getElementById('wlGroup').options].map(o=>o.value+'='+o.textContent));
 await page.selectOption('#wlGroup','*');
 await page.waitForFunction(()=>/Planta entera/.test(document.getElementById('wlStatus').textContent),null,{timeout:15000});
 const Rt=await resumen();
 const [csvPlanta]=await Promise.all([page.waitForEvent('download',{timeout:15000}),page.click('#wlCsv')]);
 const filasPlanta=fs.readFileSync(await csvPlanta.path(),'utf8').trim().split(/\r?\n/);
 check('planta entera: grupo aparte que suma la racha de la NCU 2, y su CSV solo lleva ese grupo',
   grupos[0]==='*=Planta entera (todas las NCU)'&&
   Rt[0][2]==='6'&&Rt[1][2]==='1'&&filasPlanta.length===8&&filasPlanta.slice(1).every(l=>/^Planta entera;/.test(l)),[grupos,Rt,filasPlanta.length]);
 await page.selectOption('#wlGroup','1');
 await page.waitForFunction(()=>/^NCU 1/.test(document.getElementById('wlStatus').textContent),null,{timeout:15000});

 /* El periodo y el origen se eligen en «Más parámetros». */
 const simular=async()=>{await page.click('#wlRun');await page.waitForFunction(()=>document.querySelectorAll('#wlSummary tr').length===2&&/ · /.test(document.getElementById('wlStatus').textContent),null,{timeout:20000});};
 await page.click('#windLogicCard details.wl-plegado summary');
 await page.selectOption('#wlSource','loaded');
 await simular();
 const Rc=await resumen();
 check('con «solo las medidas cargadas» se simula el día de arriba: en calma, ninguna activación',
   Rc[0][1]==='0'&&Rc[1][1]==='0'&&/medidas cargadas/.test(await txt('wlStatus'))&&/04\/06\/2026/.test(await txt('wlStatus')),[Rc,await txt('wlStatus')]);
 await page.selectOption('#wlSource','supabase');
 await page.fill('#wlFrom','2026-06-02');
 await simular();
 const Rp=await resumen(),acotada=await page.evaluate(()=>window.__consultas.filter(q=>/vmax:/.test(q.cols)).pop());
 check('«Desde» acota lo que se pide a la base: desde el 02/06 quedan dos pre-stow',
   Rp[0].slice(2,5).join('|')==='2|1|1'&&Rp[1][2]==='0'&&acotada.from==='2026-06-02'&&!acotada.to&&/periodo acotado/.test(await txt('wlStatus')),[Rp,acotada,await txt('wlStatus')]);
 await page.fill('#wlFrom','');
 await simular();

 await page.fill('#wlStow','70');
 await page.dispatchEvent('#wlStow','change');
 check('cambiar un parámetro avisa de que el resultado es el anterior',/vuelve|Parámetros cambiados/.test(await txt('wlStatus')),await txt('wlStatus'));
 await page.click('#wlRun');
 await page.waitForFunction(()=>/70 km\/h/.test(document.getElementById('wlSummary').textContent),null,{timeout:20000}).catch(()=>{});
 const R70=await resumen();
 check('umbral de stow a 70 km/h: ninguna racha lo cruza',R70[1].slice(0,3).join('|')==='Stow (> 70 km/h)|0|0'&&R70[0][2]==='5',R70);
 await page.fill('#wlPre','80');
 await page.click('#wlRun');
 check('umbrales incoherentes: se dice y no queda un resultado viejo en pantalla',
   /mayor que el de pre-stow/.test(await txt('wlStatus'))&&/Pulsa/.test(await txt('wlSummary')),[await txt('wlStatus'),await txt('wlSummary')]);

 if(process.env.CAPTURA){
   await page.fill('#wlPre','40');await page.fill('#wlStow','60');await page.click('#wlRun');
   await page.waitForTimeout(400);
   await (await page.$('#windLogicCard')).scrollIntoViewIfNeeded();
   await page.screenshot({path:process.env.CAPTURA,fullPage:true});
 }

 await page.click('#supLogout');
 await page.waitForFunction(()=>document.getElementById('wlRun').disabled,null,{timeout:15000}).catch(()=>{});
 check('cerrar sesión se lleva la simulación y vuelve a plegar la tarjeta',/Pulsa/.test(await txt('wlSummary'))&&(await page.evaluate(()=>document.getElementById('wlRun').disabled&&document.getElementById('wlCsv').disabled&&document.getElementById('wlReport').disabled))&&
   /Pulsa/.test(await txt('wlEvents'))&&!(await page.evaluate(()=>document.getElementById('windLogicCard').checkVisibility())),[await txt('wlSummary'),await txt('wlEvents')]);
 check('sin errores JS en la tarjeta de lógica de viento',jsErrors.length===0,jsErrors);

 await browser.close();
 console.log((ko?'FAIL ':'PASS ')+ok+' comprobaciones'+(ko?' · '+ko+' rojas':''));
 process.exit(ko?1:0);
})().catch(e=>{console.error('FAIL arnés: '+(e&&e.stack||e));process.exit(1);});
