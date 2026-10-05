// Simulador maestro de abanderamiento: timeline minutal + amenazas combinadas.
//
// Este banco no mira solo que existan controles. Conduce la ficha y exige:
// · Evento es la vista principal;
// · el slider T-30..T+180 reconstruye un estado determinista;
// · viento, ráfaga/pasivo, granizo, nieve y combinaciones producen efectos;
// · conflicto nieve+granizo se declara NO MODELADO, no se resuelve inventando;
// · el mismo minuto después de ir hacia atrás da el mismo resultado.
//
//   node tests/test_evento_abanderamiento.js
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok=0,ko=0;
const check=(n,c,x)=>{if(c){ok++;console.log('OK   '+n);}else{ko++;console.log('FAIL '+n+(x?' -> '+x:''));}};

(async()=>{
  const browser=await chromium.launch({executablePath:EXEC});
  const page=await browser.newPage();
  const errores=[];
  page.on('pageerror',e=>errores.push(String(e)));
  await page.goto(BASE+'/sim-viento.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.EVENTO&&EVENTO.sim&&EVENTO.sim.frames&&EVENTO.sim.frames.length>100,{timeout:30000});

  check('Evento es la vista principal al abrir',
    await page.$eval('#eventCtl',e=>e.style.display!=='none') &&
    await page.$eval('#mEvent',e=>e.classList.contains('acc')));
  const rango=await page.$eval('#eTime',e=>({min:+e.min,max:+e.max,step:+e.step}));
  check('slider maestro minutal T−30…T+180',
    rango.min===-30&&rango.max===180&&rango.step===1,JSON.stringify(rango));
  check('la traza se calcula con paso interno de 1 s',
    await page.evaluate(()=>EVENTO.sim.dt_s===1));

  const frame=async t=>page.evaluate(t=>{
    eventoAplica(t);
    const f=EVENTO.current;
    return {t:f.t_min,ang:f.ang,modos:f.modos,orden:f.orden,info:f.info,
      wind:f.wind_ms,gust:f.gust_ms,hail:f.hail_on,snow:f.snow_cm};
  },t);

  // Determinismo de la barra.
  await page.selectOption('#ePreset','wind_ramp');
  await page.waitForTimeout(350);
  const a=await frame(40);
  await frame(-12);
  const b=await frame(40);
  check('volver al mismo minuto reproduce exactamente el mismo estado',
    JSON.stringify(a)===JSON.stringify(b));

  check('preset viento creciente cruza a un modo de stow',
    Object.keys(a.modos).some(k=>k!=='BASE'&&k!=='PASIVO'&&/STOW/.test(a.modos[k])),
    JSON.stringify(a.modos));

  // Las marcas de T1/T2 tienen que existir en la línea.
  const marks=await page.$$eval('#eEventLine .mark b',n=>n.map(x=>x.textContent));
  check('timeline marca los cruces T1 y T2',
    marks.some(x=>/T1/.test(x))&&marks.some(x=>/T2/.test(x)),marks.join(' | '));

  // Pasivo: racha por encima del umbral, sin fingir orden TCU.
  await page.selectOption('#ePreset','passive'); await page.waitForTimeout(300);
  const pas=await frame(0);
  check('preset pasivo suelta la fila de perímetro por racha',
    pas.modos.PASIVO==='SUELTA'&&pas.info.PASIVO.fuente==='PASIVO',
    JSON.stringify(pas.info.PASIVO));

  // Granizo cercano.
  await page.selectOption('#ePreset','hail_near'); await page.waitForTimeout(300);
  const hail=await frame(0);
  const hk=Object.keys(hail.info).filter(k=>/^A|^B/.test(k));
  check('granizo inminente toma el mando de los controlados',
    hk.some(k=>/GRANIZO/.test(hail.info[k].fuente)),
    hk.map(k=>k+':'+hail.info[k].fuente).join(' | '));
  check('granizo muestra consigna y estado de protección',
    hk.every(k=>typeof hail.orden[k]==='number'&&hail.info[k].proteccion),
    JSON.stringify(hail.info));

  // Nieve.
  await page.selectOption('#ePreset','snow'); await page.waitForTimeout(300);
  const snow=await frame(10);
  const sk=Object.keys(snow.info).filter(k=>/^A|^B/.test(k));
  check('nieve activa SNOW_STOW en los controlados',
    sk.some(k=>snow.modos[k]==='SNOW_STOW'&&snow.info[k].fuente==='NIEVE'),
    sk.map(k=>k+':'+snow.modos[k]+'/'+snow.info[k].fuente).join(' | '));

  // Combinación deliberadamente conflictiva.
  await page.selectOption('#ePreset','snow_hail'); await page.waitForTimeout(350);
  const conf=await frame(0);
  const ck=Object.keys(conf.info).filter(k=>/^A|^B/.test(k));
  check('nieve + granizo de lados opuestos se declara NO MODELADO',
    ck.some(k=>conf.info[k].proteccion==='NO MODELADO'&&conf.info[k].fuente==='NO MODELADO'),
    ck.map(k=>k+':'+conf.info[k].fuente+'/'+conf.info[k].proteccion).join(' | '));

  // Combinación con mismo lado.
  await page.selectOption('#ePreset','snow_hail_same'); await page.waitForTimeout(350);
  const same=await frame(0);
  const mk=Object.keys(same.info).filter(k=>/^A|^B/.test(k));
  check('nieve + granizo del mismo lado se combinan sin conflicto',
    mk.some(k=>same.info[k].fuente==='GRANIZO + NIEVE'&&same.modos[k]==='MULTI_STOW'),
    mk.map(k=>k+':'+same.info[k].fuente+'/'+same.modos[k]).join(' | '));

  // El play mueve minutos, no frames arbitrarios.
  await page.selectOption('#ePreset','wind_ramp'); await page.waitForTimeout(250);
  await page.evaluate(()=>{eventoAplica(0);EVENTO.run=false;});
  await page.selectOption('#eSpeed','30');
  await page.click('#ePlay');
  await page.waitForTimeout(650);
  await page.click('#ePlay');
  const pos=await page.evaluate(()=>EVENTO.pos);
  check('Reproducir hace avanzar el tiempo del slider',pos>=10&&pos<=30,'T='+pos);

  // -1/+1.
  await page.evaluate(()=>eventoAplica(12));
  await page.click('#ePrev');
  const p11=await page.evaluate(()=>EVENTO.pos);
  await page.click('#eNext');
  const p12=await page.evaluate(()=>EVENTO.pos);
  check('−1/+1 mueven exactamente un minuto',p11===11&&p12===12,p11+' -> '+p12);

  // Estado visible: las tarjetas tienen fuente y protección.
  const cards=await page.$eval('#tiles',e=>e.textContent);
  check('las tarjetas dicen quién manda y el estado',/VIENTO|SEGUIMIENTO|GRANIZO|NIEVE|PASIVO/.test(cards));

  check('la ficha no lanza errores de JavaScript',errores.length===0,errores.join(' | '));
  await browser.close();
  console.log((ko?'FALLA':'OK')+' — '+ok+'/'+(ok+ko)+' comprobaciones');
  process.exit(ko?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
