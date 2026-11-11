/* Recurso del país en la tarjeta de meteo (`lib/mapas-pais.js`), en Chromium.
 *
 * Las láminas y rejillas van SUSTITUIDAS por fixtures sintéticos servidos con
 * `page.route`: lo que se prueba es el código de este repo —qué país elige,
 * dónde pone el marcador, qué valor lee y qué dice cuando no hay lámina—, no
 * el contenido de `data/mapas_pais/`, que cambia cada vez que se regeneran.
 *
 * Lo que acredita: el país sale de la REJILLA (no del nombre), el marcador cae
 * donde dice la caja de la ficha, «sobre/bajo la media» va con su signo, el
 * punto de miles sale en cuatro cifras, un punto sin país lo dice, un índice
 * ausente lo dice, y un cambio rápido de emplazamiento no deja pintado el
 * anterior.
 * Lo que NO acredita: que las láminas reales estén bien hechas (eso es del
 * generador, en el repo siting).
 */
const {chromium}=require('playwright');
const {EXEC}=require('./pw_navegador.js');
const BASE=process.env.BASE||process.env.BASE_URL||'http://localhost:8099';
let ok=0,ko=0;
function check(name,cond,detail){
  if(cond){ok++;console.log('OK   '+name);}
  else{ko++;console.log('FAIL '+name+(detail===undefined?'':' → '+JSON.stringify(detail)));}
}

// Un país de mentira, «Cuadrilandia», que ocupa lon −2..2, lat 40..44. Su
// rejilla de 4×4 tiene la columna oeste vacía (null: fuera del país) y valores
// que crecen hacia el este. La ficha pone el mapa en el 10–60 % de la imagen.
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==','base64');
function ficha(variable,unidad,media){
  return {pais:'Cuadrilandia',iso3:'CUA',iso2:'CU',nombre_en:'Squareland',variable,
    imagen:'CUA_'+variable+'.png',rejilla:'CUA_'+variable+'_rejilla.json',
    caja:[0.1,0.1,0.6,0.9],encuadre:[-2,40,2,44],unidad,fuente:'Fixture',resolucion:'≈250 m',
    media,p10:media*0.8,p50:media,p90:media*1.2};
}
function rejilla(escala,base,paso){
  const fila=[null,base,base+paso,base+2*paso];
  return {extension:[-2,2,40,44],filas:4,columnas:4,escala,valores:[fila,fila,fila,fila]};
}
const DATA={
  'indice.json':{CUA:{iso3:'CUA',iso2:'CU',nombre:'Cuadrilandia',nombre_en:'Squareland',variables:{
    viento:{ficha:'CUA_viento.json',fuente:'Fixture'},irradiancia:{ficha:'CUA_irradiancia.json',fuente:'Fixture'}}}},
  'CUA_viento.json':ficha('viento','m/s',6.0),
  'CUA_irradiancia.json':ficha('irradiancia','kWh/m²·año',2000),
  // viento: 5,0 / 6,0 / 7,0 m/s (escala 10) · GHI: 1800 / 2162 / 2524
  'CUA_viento_rejilla.json':rejilla(10,50,10),
  'CUA_irradiancia_rejilla.json':rejilla(1,1800,362),
};

async function lugar(page,lat,lon){
  await page.fill('#lat',String(lat));await page.fill('#lon',String(lon));
  await page.dispatchEvent('#lon','change');
}
async function estado(page){
  return page.evaluate(()=>({
    estado:document.getElementById('mapasPaisEstado').textContent,
    lect:[...document.querySelectorAll('#mapasPais .mp-lectura')].map(e=>e.textContent),
    marcas:[...document.querySelectorAll('#mapasPais .mp-marca')].map(e=>[parseFloat(e.style.left),parseFloat(e.style.top)]),
    imgs:document.querySelectorAll('#mapasPais img').length,
  }));
}
async function esperar(page,cond){
  await page.waitForFunction(cond,null,{timeout:10000}).catch(()=>{});
}

(async()=>{
  const browser=await chromium.launch({executablePath:EXEC});
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  const errores=[];page.on('pageerror',e=>errores.push(e.message));
  let indiceAusente=false;
  await page.route('**/data/mapas_pais/**',route=>{
    const nombre=route.request().url().split('/data/mapas_pais/')[1].split('?')[0];
    if(nombre==='indice.json'&&indiceAusente)return route.fulfill({status:404,body:'no'});
    if(nombre.endsWith('.png'))return route.fulfill({status:200,contentType:'image/png',body:PNG});
    if(DATA[nombre])return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(DATA[nombre])});
    return route.fulfill({status:404,body:'no'});
  });
  // nada de red de verdad para lo demás: la tarjeta tiene que aguantarlo
  await page.route(/^https?:\/\/(?!localhost)/,route=>route.abort());
  await page.goto(BASE+'/meteo.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.FactiunMapasPais,null,{timeout:15000}).catch(()=>{});
  check('la librería se publica en window',await page.evaluate(()=>!!window.FactiunMapasPais));

  // funciones puras
  const puras=await page.evaluate(([rv,rg,f])=>{
    const M=window.FactiunMapasPais;
    return {dentro:M.valorEn(rv,42,1.5),oeste:M.valorEn(rv,42,-1.5),fuera:M.valorEn(rv,30,0),
      centro:M.posicion(f,42,0),lejos:M.posicion(f,0,0)};
  },[DATA['CUA_viento_rejilla.json'],DATA['CUA_irradiancia_rejilla.json'],DATA['CUA_viento.json']]);
  check('valorEn lee la celda del punto',puras.dentro===7,puras);
  check('valorEn: celda vacía = fuera del país',puras.oeste===null,puras);
  check('valorEn: fuera de la rejilla = null',puras.fuera===null,puras);
  check('posicion: el centro del encuadre cae en el centro de la caja',
    puras.centro&&Math.abs(puras.centro.x-35)<1e-6&&Math.abs(puras.centro.y-50)<1e-6,puras.centro);
  check('posicion: fuera del encuadre no hay marcador',puras.lejos===null,puras.lejos);

  // un punto en Cuadrilandia (columna de 6,0 m/s, igual que la media)
  await lugar(page,42,0.5);
  await esperar(page,()=>document.querySelectorAll('#mapasPais .mp-lectura').length===2);
  let e=await estado(page);
  check('el país sale de la rejilla: dos láminas',e.imgs===2&&/Cuadrilandia/.test(e.estado),e);
  check('viento en la media se dice así',/6,0 m\/s en la planta · en la media del país/.test(e.lect[0]||''),e.lect);
  check('marcador en su sitio (x = 10 + 62,5 % de 50; y = 50 %)',
    e.marcas.length===2&&Math.abs(e.marcas[0][0]-41.25)<0.01&&Math.abs(e.marcas[0][1]-50)<0.01,e.marcas);
  check('GHI con punto de miles y «sobre la media»',/2\.162 kWh\/m²·año en la planta · 8 % sobre la media \(2\.000\)/.test(e.lect[1]||''),e.lect);

  // la columna de 5,0 m/s: bajo la media, sin signo menos colgando
  await lugar(page,42,-0.5);
  await esperar(page,()=>/5,0 m\/s/.test(document.querySelector('#mapasPais .mp-lectura')?.textContent||''));
  e=await estado(page);
  check('por debajo dice «bajo la media», sin «−… sobre»',/17 % bajo la media \(6,0\)/.test(e.lect[0]||'')&&!/−/.test(e.lect[0]||''),e.lect);

  // la franja oeste está dentro del encuadre pero FUERA del país (null)
  await lugar(page,42,-1.5);
  await esperar(page,()=>/Todavía no hay lámina/.test(document.getElementById('mapasPaisEstado').textContent));
  e=await estado(page);
  check('dentro del encuadre pero sin dato = sin país, sin láminas',e.imgs===0&&/Disponibles: Cuadrilandia/.test(e.estado),e);

  // cambio rápido: el último emplazamiento manda
  await lugar(page,10,10);await lugar(page,42,1.5);
  await esperar(page,()=>/7,0 m\/s/.test(document.querySelector('#mapasPais .mp-lectura')?.textContent||''));
  await page.waitForTimeout(400);
  e=await estado(page);
  check('dos cambios seguidos: queda pintado el último',e.imgs===2&&/7,0 m\/s/.test(e.lect[0]||''),e);

  // sin índice publicado
  indiceAusente=true;
  await page.evaluate(()=>window.FactiunMapasPais.actualizar(42,1.5).catch(()=>{}));
  await page.reload({waitUntil:'domcontentloaded'});
  await esperar(page,()=>/No hay láminas de país/.test(document.getElementById('mapasPaisEstado')?.textContent||''));
  e=await estado(page);
  check('sin indice.json lo dice y no pinta nada',e.imgs===0&&/No hay láminas de país publicadas/.test(e.estado),e);

  check('sin errores de página',errores.length===0,errores);
  await browser.close();
  console.log('\n'+ok+' OK · '+ko+' FAIL');
  process.exit(ko?1:0);
})().catch(e=>{console.log('FAIL excepción '+e.message);process.exit(1);});
