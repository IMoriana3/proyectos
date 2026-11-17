/* Prueba visual del usuario: si hay seis minutos BT no pueden quedar invisibles
 * en la gráfica o relegados debajo de ella. Fixture sintético, nunca logs de planta. */
const {chromium}=require('playwright');
const {EXEC}=require('./pw_navegador.js');
const BASE=process.env.BASE||process.env.BASE_URL||'http://localhost:8099';
let ok=0,fail=0;
function check(name,cond,detail){
 if(cond){ok++;console.log('OK   '+name);}
 else{fail++;console.log('FAIL '+name+(detail?': '+JSON.stringify(detail):''));}
}
(async()=>{
 const browser=await chromium.launch({executablePath:EXEC});
 const page=await browser.newPage({viewport:{width:1500,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:\/\/(?!localhost)/,r=>r.abort());
 await page.goto(BASE+'/sim-apuntamiento.html',{waitUntil:'domcontentloaded'});
 check('versión de la gráfica visible en cabecera',/v0\.3/.test(await page.locator('.app-version').innerText()));
 const head='Fecha;System info[30069];Radiation[30070];Temperature[30071];X deviation filtered[30072];Y deviation filtered[30073];X deviation raw[30074];Y deviation raw[30075];BACKTRACKING ACTIVE';
 const data=[head];
 for(let i=8;i<=22;i++){const minute=String(i).padStart(2,'0');data.push('2026-11-10 16:'+minute+':01;0;850;420;100;-30;100;-30;'+(i>=17?1:0));}
 await page.locator('#files').setInputFiles({name:'Log_Sensor_20261110_160800_NCU6_2.csv',mimeType:'text/csv',buffer:Buffer.from(data.join('\n'),'utf8')});
 await page.click('#cargar');
 // File.text() and CSV parsing are asynchronous: do not inspect a stale placeholder.
 await page.waitForFunction(()=>document.getElementById('n')?.textContent.trim()==='9',{},{timeout:10000});
 const summary=await page.locator('#exclusion-summary').innerText();
 check('cabecera dice 6 minutos descartados',summary.includes('6 min excluidos'),summary);
 check('BT en cabecera con horas exactas',summary.includes('16:17–16:22'),summary);
 const ranges=await page.locator('#exclusion-bar .exclusion-range').count();
 check('franja temporal coloreada incluso sin histórico TCU',ranges===1,{ranges});
 const bars=await page.locator('#exclusion-bar .exclusion-range').first().evaluate(e=>({color:getComputedStyle(e).backgroundColor,width:e.getBoundingClientRect().width}));
 check('franja con color y ancho perceptible',bars.width>=5 && bars.color!=='rgba(0, 0, 0, 0)',bars);
 const rows=await page.locator('#periodos tr[data-key]').count();
 check('tabla cronológica de exclusiones muestra un intervalo',rows===1,{rows});
 const details=await page.locator('#periodos tr[data-key]').first().innerText();
 check('tabla muestra el comienzo, el final y la duración',details.includes('16:17')&&details.includes('16:22')&&details.includes('6'),details);
 check('sin TCU, el simulador dice qué filtros no puede verificar',summary.includes('Sin histórico TCU'),summary);
 check('minutos admitidos = 9', (await page.locator('#n').innerText()).trim()==='9');
 await page.locator('#exclusion-summary button[data-key]').first().click();
 check('selección de periodo se refleja en la gráfica', (await page.locator('#grafica-info').innerText()).includes('16:17–16:22'));
 await page.locator('#bt').uncheck();
 check('sin filtro BT, los 15 minutos quedan admitidos', (await page.locator('#n').innerText()).trim()==='15');
 check('sin filtro BT desaparecen las exclusiones', (await page.locator('#exclusion-bar .exclusion-range').count())===0);
 check('la página no produjo errores JavaScript',errors.length===0,errors);
 await browser.close();
 console.log((fail?'FAIL ':'OK   ')+'test_apuntamiento_exclusiones · '+ok+' comprobaciones'+(fail?' · '+fail+' fallos':''));
 if(fail)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1});