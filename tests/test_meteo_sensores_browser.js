/* Meteo REAL · prueba de interfaz completa en Chromium con Supabase sustituido.
 * No usa credenciales ni datos privados; los registros son fixtures de TEST.
 * Lo que acredita: UI → auth → consulta paginada → análisis → filtros → logout.
 * Lo que NO acredita: permisos de una cuenta real ni salud del endpoint remoto.
 */
const {chromium}=require('playwright');
const {EXEC}=require('./pw_navegador.js');
const BASE=process.env.BASE||process.env.BASE_URL||'http://localhost:8099';
let ok=0,ko=0;
function check(name,cond,detail){
  if(cond){ok++;console.log('OK   '+name);}
  else{ko++;console.log('FAIL '+name+(detail===undefined?'':' → '+JSON.stringify(detail)));}
}
function stub(){
  let logged=false;
  const base={planta:'El Burgo I',dia:'2026-10-08',tz:'UTC',paso_s:60,filas:120,subido:'2026-10-09T10:00:00Z'};
  const data=[
    {...base,id:1,ncu:'1',equipo:'HSU 230',clase:'hsu',fuente:'HSU_230_test.csv',series:{
      t:[0,60,120],v:{wind_speed:[4,6,7],wind_speed_max:[6,8,9],
        wind_direction:[359,1,10],irradiance:0,snow_alarm:0}}},
    {...base,id:2,ncu:'1',equipo:'HSU 231',clase:'hsu',fuente:'HSU_231_test.csv',series:{
      t:[0,60,120],v:{wind_speed:[5,6,8],wind_speed_max:[7,9,10],
        wind_direction:[1,359,15],irradiance:0,snow_alarm:0}}},
    {...base,id:3,ncu:'2',equipo:'Meteo 210',clase:'wfu',fuente:'WFU_210_test.csv',series:{
      t:[0,60,120],v:{irradiance:[-100,90000,0],wind_speed:0}}}
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
        limit(){return Promise.resolve({data:[{dia:'2026-10-08'}],error:null});},
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
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const jsErrors=[];
 page.on('pageerror',e=>jsErrors.push(e.message));
 await page.addInitScript(stub);
 await page.route('**/*',route=>{
   const u=route.request().url();
   if(u.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js@'))return route.fulfill({
     status:200,contentType:'application/javascript',body:'/* Supabase stub inyectado antes */'
   });
   if(u.startsWith(BASE+'/'))return route.continue();
   return route.abort();
 });
 try{
   await page.goto(BASE+'/meteo.html',{waitUntil:'domcontentloaded',timeout:25000});
   await page.waitForFunction(()=>document.getElementById('supLogin')?.onclick!=null,
     null,{timeout:20000});
   check('Meteo carga los mandos de Supabase en móvil',await page.locator('#supLogin').count()===1&&await page.locator('#supLoad').count()===1);
   check('sin sesión no inventa estadísticas',/Carga datos reales|Todavía no hay/.test(await page.locator('#sensorStats').text())||await page.locator('#sensorCount').textContent()==='—');
   await page.locator('#supEmail').fill('test@factiun.example');
   await page.locator('#supPassword').fill('incorrecta');
   await page.locator('#supLogin').click();
   await page.waitForFunction(()=>document.getElementById('supStatus').textContent.includes('Invalid login credentials'));
   check('rechaza contraseña errónea sin leer series',/Invalid login credentials/.test(await page.locator('#supStatus').textContent()));
   await page.locator('#supPassword').fill('clave-prueba');
   await page.locator('#supLogin').click();
   await page.waitForFunction(()=>/3 registros consultados/.test(document.getElementById('supStatus').textContent),null,{timeout:25000});
   const status=await page.locator('#supStatus').textContent();
   check('entra y consulta las tres series privadas simuladas',/3 registros consultados/.test(status),status);
   check('identifica la planta y el periodo',await page.locator('#sensorPlant').inputValue()==='El Burgo I'
       &&await page.locator('#supFrom').inputValue()==='2026-10-02'
       &&await page.locator('#supTo').inputValue()==='2026-10-08');
   const s=await page.locator('#sensorStats').textContent();
   check('pinta estadísticas de HSU 230 y HSU 231',s.includes('HSU 230')&&s.includes('HSU 231'),s.slice(0,400));
   check('no trata la WFU raw como GHI calibrado',s.includes('Meteo 210')&&s.includes('raw')&&!s.includes('kWh/m²'));
   const c=await page.locator('#sensorCoherence').textContent();
   check('compara dos anemómetros de la misma NCU',c.includes('HSU 230')&&c.includes('HSU 231'),c.slice(0,350));
   await page.locator('#sensorVariable').selectOption('irradiance_raw');
   const c2=await page.locator('#sensorCoherence').textContent();
   check('irradiancia sin escala no emite coherencia inventada',/No hay dos sensores comparables/.test(c2),c2.slice(0,240));
   const s2=await page.locator('#sensorStats').textContent();
   check('conserva negativos raw de la WFU',s2.includes('-100.00')||s2.includes('-100,00'),s2.slice(0,260));
   const pwd=await page.locator('#supPassword').inputValue();
   const stored=await page.evaluate(()=>Object.keys(localStorage).map(k=>localStorage.getItem(k)).join('\n'));
   check('la contraseña no persiste en el navegador',!pwd&&!stored.includes('clave-prueba'));
   await page.locator('#supLogout').click();
   check('logout descarta estadísticas privadas',await page.locator('#sensorCount').textContent()==='—'
     &&/Sesión cerrada/.test(await page.locator('#supStatus').textContent()));
   check('sin errores JS en la pantalla de sensores',jsErrors.length===0,jsErrors);
 }finally{await page.close();await browser.close();}
 console.log('PASS '+ok+' comprobaciones');
 if(ko)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1);});
