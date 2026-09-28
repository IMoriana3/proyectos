/* Generate a self-contained review copy from the SAME generator, optimizer,
 * libraries and canonical solar/layout blocks. Never a second maintained UI. */
'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const output=process.argv[2];if(!output)throw Error('Usage: node tools/build_layout_preview.cjs /absolute/output.html');
const js=x=>JSON.stringify(x).replace(/</g,'\\u003c');
const generator=read('generador-layout.html'),solar=read('sim-solar.html');
function block(html,name){
 // Start at the specific marker's containing comment, without earlier page scripts.
 const at=html.indexOf(name+' — inicio'),start=html.lastIndexOf('/*',at),endMarker=html.indexOf(name+' — fin',at);
 if(at<0||endMarker<0)throw Error('Missing canonical block '+name);
 return html.slice(start,html.indexOf('*/',endMarker)+2);
}
let optimizer=read('buscador-implantacion.html');
optimizer=optimizer.replace('new URLSearchParams(location.search)','new URLSearchParams("encargo=1&semilla=20260928-42")');
optimizer=optimizer.replace('const html=await (await fetch("generador-layout.html")).text();','const html='+js(block(generator,'MOTOR DE LAYOUT'))+';');
optimizer=optimizer.replace('const hs=await (await fetch("sim-solar.html")).text();','const hs='+js(block(solar,'MOTOR SOLAR')+'\n'+block(solar,'SEGUIMIENTO'))+';');
for(const name of ['lib/layout-search.js','lib/layout-search-ui.js'])optimizer=optimizer.replace('<script src="'+name+'"></script>','<script>\n'+read(name)+'\n</script>');
const {cases}=require('../tests/layout_search_cases.cjs');
const config=cases().find(c=>c.name.includes('Finca dibujada')).config;
const startup=`
<script>
/* Review build: a real example from the existing geometry corpus. */
(async function(){
 const optimizer=${js(optimizer)};
 const nativeOpen=window.open;
 window.open=function(url,target){
   if(!String(url).includes('buscador-implantacion.html'))return nativeOpen.call(window,url,target);
   const w=nativeOpen.call(window,'about:blank',target);
   if(!w){$('hint').textContent='Permite abrir la pestaña para ver el optimizador.';return null;}
   w.document.open();w.document.write(optimizer);w.document.close();return w;
 };
 const c=${js(config)};
 $('parcelMode').value='geojson';PARCEL=c.coords;HOLES=c.holes;EXCL=c.exclusions;PARCELAS=[];MIX_ZONAS=[];
 $('parcelName').value='Ejemplo · Finca dibujada';
 const fields={mount:c.mount,table:c.table,mods:c.mods.join(','),modLen:c.modLen,modWid:c.modWid,modWp:c.moduleWp,
   pitchTrk:c.pitch,setback:c.setback,panelAz:c.panelAz,bifila:c.bifila?'1':'0',gapMod:c.gapModules,
   gapMotor:c.gapMotor,gapNs:c.gapNs,roadEvery:c.roadEvery,roadW:c.roadW,roadNsEvery:c.roadNsEvery,
   roadNsW:c.roadNsW,mode:c.mode,minStructs:c.minStructs,rowOffset:c.rowOffset};
 Object.entries(fields).forEach(([k,v])=>$(k).value=v);
 $('alignGrid').checked=c.alignGrid;$('center').checked=c.center;$('orto').checked=false;$('calc').value='js';
 $('originManual').checked=false;$('axis').value=0;
 $('paneRect').style.display='none';$('paneGeo').style.display='';
 $('geotxt').value=JSON.stringify({type:'Polygon',coordinates:[c.coords.concat([c.coords[0]])]});
 encaja();await generar();$('optBtn').scrollIntoView({block:'center'});
 $('hint').textContent='Vista previa v1.10.0 · pulsa Optimizar para comparar alternativas.';
 window.PILOT_PREVIEW_READY=true;
})().catch(e=>console.error(e));
</script>`;
let html=generator.replace('<head>','<head>\n<base href="https://imoriana3.github.io/proyectos/">');
html=html.replace("SES_KEY='genlayout_sesion'","SES_KEY='genlayout_preview_pr528'");
html=html.replace('</body>',startup+'\n</body>');
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,html);
console.log(output+' · '+Buffer.byteLength(html)+' bytes');
