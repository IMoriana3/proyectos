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
 * resumen, tablas, filtro, CSV → cierre de sesión.
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
    day('2026-06-04','1','HSU 231',8,[])
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
      const filter={plant:null,from:null,to:null};
      return {
        select(){return this;},
        eq(k,v){if(k==='planta')filter.plant=v;return this;},
        in(){return this;},order(){return this;},
        gte(k,v){if(k==='dia')filter.from=v;return this;},
        lte(k,v){if(k==='dia')filter.to=v;return this;},
        limit(){return Promise.resolve({data:[{dia:'2026-06-04'}],error:null});},
        range(a,b){
          const result=data.filter(x=>(!filter.plant||x.planta===filter.plant)
            &&(!filter.from||x.dia>=filter.from)&&(!filter.to||x.dia<=filter.to)).slice(a,b+1);
          return Promise.resolve({data:result,error:null});
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
     [...document.querySelectorAll('#wlPreBody,#wlStowBody,#wlChart,#wlEvents')].every(e=>!e.checkVisibility())&&document.getElementById('wlRun').disabled;
 }));

 await page.fill('#supEmail','test@factiun.example');
 await page.fill('#supPassword','clave-prueba');
 await page.click('#supLogin');
 await page.waitForFunction(()=>!document.getElementById('wlRun').disabled,null,{timeout:20000});
 const pre=await page.evaluate(()=>({lat:+document.getElementById('wlLat').value,lon:+document.getElementById('wlLon').value,
   pitch:+document.getElementById('wlPitch').value,tz:document.getElementById('wlTz').value,
   group:document.getElementById('wlGroup').value}));
 check('con medidas, la tarjeta se despliega',await page.evaluate(()=>document.getElementById('windLogicCard').checkVisibility()&&document.getElementById('wlChart').checkVisibility()));
 check('coordenadas, pitch y zona horaria salen de la Cartera',Math.abs(pre.lat-41.576)<0.01&&Math.abs(pre.lon+0.798)<0.01&&pre.pitch===6&&pre.tz==='Europe/Madrid'&&pre.group==='1',pre);

 await page.click('#wlRun');
 await page.waitForFunction(()=>document.getElementById('wlKpiPre').textContent.trim()!=='—',null,{timeout:20000});
 check('cinco pre-stow y un stow: el máximo de las dos HSU manda',await txt('wlKpiPre')==='5'&&await txt('wlKpiStow')==='1',
   [await txt('wlKpiPre'),await txt('wlKpiStow')]);
 check('tres movimientos a stow: uno de día y dos de noche',await txt('wlKpiMoves')==='3'&&(await txt('wlKpiMovesSub'))==='1 de día · 2 de noche',
   [await txt('wlKpiMoves'),await txt('wlKpiMovesSub')]);
 const total=await page.evaluate(()=>[...document.querySelectorAll('#wlPreBody tr.wl-total td')].map(x=>x.textContent.trim()));
 check('tabla de pre-stow: día en rango 1, día mover 1, noche mover 2, noche en defensa 1',total.join('|')==='Total|5|1|1|2|1',total);
 const rows=await page.evaluate(()=>[...document.querySelectorAll('#wlEvents tr')].map(r=>[...r.children].map(c=>c.textContent.trim())));
 check('lista con las seis activaciones',rows.length===6,rows.length);
 const first=rows[0]||[],stow=rows.find(r=>/^Stow/.test(r[0]))||[];
 check('mediodía solar: del horizontal a 30°, y hora local de la planta',
   /^Pre-stow/.test(first[0])&&/14:00/.test(first[1])&&/^30° [EO]$/.test(first[8])&&parseFloat(first[9].replace(',','.'))>29&&first[6]==='Día',first);
 check('stow desde pre-stow: de 30° a 55° son 25°',/^30° [EO]$/.test(stow[7])&&/^55° [EO]$/.test(stow[8])&&stow[9]==='25°',stow);
 const noche=rows.filter(r=>r[6]==='Noche');
 check('noche: la primera alarma mueve 50° a 55° E y la segunda se queda',
   noche.length===3&&noche[0][7]==='5° E'&&noche[0][8]==='55° E'&&noche[0][9]==='50°'&&noche[1][8]==='se queda'&&noche[1][9]==='0°',noche);
 const dud=await page.evaluate(()=>({n:document.querySelectorAll('#wlEvents tr.wl-dudoso').length,
   notes:document.getElementById('wlNotes').textContent}));
 check('la racha tras los sensores a cero sale como dudosa y se avisa',dud.n===1&&/Sensores a cero/.test(dud.notes)&&/dudosa/.test(dud.notes),dud);

 await page.selectOption('#wlFilter','stow');
 check('filtro: solo stow',await page.evaluate(()=>document.querySelectorAll('#wlEvents tr').length)===1);
 await page.selectOption('#wlFilter','');

 const [download]=await Promise.all([page.waitForEvent('download',{timeout:15000}),page.click('#wlCsv')]);
 const csv=fs.readFileSync(await download.path(),'utf8').replace(/^﻿/,'').trim().split(/\r?\n/);
 check('CSV: cabecera, seis filas, hora local y la dudosa anotada',
   download.suggestedFilename()==='logica_viento_El_Burgo_I.csv'&&csv.length===7&&/inicio_local/.test(csv[0])&&
   csv.filter(l=>/DUDOSO/.test(l)).length===1&&/;pre-stow;1;;2026-06-01 12:00;2026-06-01 14:00;/.test(csv[1]),[download.suggestedFilename(),csv.length,csv[1]]);

 const [informe]=await Promise.all([page.waitForEvent('download',{timeout:15000}),page.click('#wlReport')]);
 const html=fs.readFileSync(await informe.path(),'utf8');
 check('informe: HTML imprimible con resumen, gráficas y las seis activaciones en el anexo',
   informe.suggestedFilename()==='informe_logica_viento_El_Burgo_I.html'&&/^<!doctype html>/.test(html)&&
   html.includes('<span>Activaciones de pre-stow</span><b>5</b>')&&html.includes('<svg ')&&html.includes('<h2>Cuándo</h2>')&&
   (html.split('Anexo: todas las activaciones')[1].match(/<tr/g)||[]).length===7&&html.includes('01/06/2026 14:00'),[informe.suggestedFilename(),html.length]);

 await page.fill('#wlStow','70');
 await page.dispatchEvent('#wlStow','change');
 check('cambiar un parámetro avisa de que el resultado es el anterior',/vuelve|Parámetros cambiados/.test(await txt('wlStatus')),await txt('wlStatus'));
 await page.click('#wlRun');
 await page.waitForFunction(()=>document.getElementById('wlKpiStow').textContent.trim()==='0',null,{timeout:20000}).catch(()=>{});
 check('umbral de stow a 70 km/h: ninguna racha lo cruza',await txt('wlKpiStow')==='0'&&await txt('wlKpiPre')==='5',[await txt('wlKpiPre'),await txt('wlKpiStow')]);
 await page.fill('#wlPre','80');
 await page.click('#wlRun');
 check('umbrales incoherentes: se dice y no queda un resultado viejo en pantalla',
   /mayor que el de pre-stow/.test(await txt('wlStatus'))&&await txt('wlKpiPre')==='—',[await txt('wlStatus'),await txt('wlKpiPre')]);

 if(process.env.CAPTURA){
   await page.fill('#wlPre','40');await page.fill('#wlStow','60');await page.click('#wlRun');
   await page.waitForTimeout(400);
   await (await page.$('#windLogicCard')).scrollIntoViewIfNeeded();
   await page.screenshot({path:process.env.CAPTURA,fullPage:true});
 }

 await page.click('#supLogout');
 await page.waitForFunction(()=>document.getElementById('wlRun').disabled,null,{timeout:15000}).catch(()=>{});
 check('cerrar sesión se lleva la simulación y vuelve a plegar la tarjeta',await txt('wlKpiPre')==='—'&&(await page.evaluate(()=>document.getElementById('wlRun').disabled&&document.getElementById('wlCsv').disabled&&document.getElementById('wlReport').disabled))&&
   /Pulsa/.test(await txt('wlEvents'))&&!(await page.evaluate(()=>document.getElementById('windLogicCard').checkVisibility())),[await txt('wlKpiPre'),await txt('wlEvents')]);
 check('sin errores JS en la tarjeta de lógica de viento',jsErrors.length===0,jsErrors);

 await browser.close();
 console.log((ko?'FAIL ':'PASS ')+ok+' comprobaciones'+(ko?' · '+ko+' rojas':''));
 process.exit(ko?1:0);
})().catch(e=>{console.error('FAIL arnés: '+(e&&e.stack||e));process.exit(1);});
