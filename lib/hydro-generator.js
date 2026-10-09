/* Integración en el generador (no aplicación independiente).
   Depende de las variables canónicas DEM, PARCEL, PARCELAS, RES, EXCL, etc.
   Toda física está en hydro-risk.js; este fichero solo conecta UI/visualización. */
"use strict";
var HYDRO=null, HYDRO_SIG=null, HYDRO_FRAME=0, HYDRO_TIMER=null;
var HYDRO_VIEWER=null, HYDRO_EXPOSURE=null;
function hydroOptions(){
  return {rainfallMmH:+$('hydroRain').value,rainMinutes:+$('hydroRainMin').value,
    totalMinutes:+$('hydroTotal').value,runoff:+$('hydroRunoff').value,
    manningN:+$('hydroManning').value,openBoundary:$('hydroOutflow').checked};
}
function hydroSignature(){
  return JSON.stringify({dem:DEM&&{src:DEM.src,lats:DEM.lats,lons:DEM.lons,z:DEM.z},
    parcel:PARCEL,other:PARCELAS,storm:hydroOptions()});
}
function hydroCurrent(){return !!HYDRO && HYDRO_SIG===hydroSignature();}
function hydroStatus(t,cls){$('hydroStatus').className='hydro-state'+(cls?' '+cls:'');$('hydroStatus').textContent=t;}
function hydroStop(){
  if(HYDRO_TIMER){clearInterval(HYDRO_TIMER);HYDRO_TIMER=null;}
  $('hydroPlay').textContent='▶';
}
function hydroFrame(i){
  if(!HYDRO)return;
  HYDRO_FRAME=Math.max(0,Math.min(HYDRO.frames.length-1,i|0));
  $('hydroTime').value=HYDRO_FRAME;
  $('hydroTimeLbl').textContent=HYDRO.frames[HYDRO_FRAME].minute.toFixed(1)+' min';
  if(HYDRO_VIEWER)HYDRO_VIEWER.setFrame(HYDRO_FRAME);
  if(hydroCurrent())draw();
}
function hydroMask(){
  var m=mascaraParcelaDEM();
  return m&&m.dentro||null;
}
/* readCfg llama esto CADA vez que se genera. Prohibido aplicar una
   exclusión de un MDT, parcela o episodio que ya han cambiado. */
function hydroExtraExclusions(){
  var extra=HYDRO_OFFICIAL.length&&$('hydroOfficialAvoid').checked?HYDRO_OFFICIAL.slice():[];
  if($('hydroAvoid').checked){
    if(!hydroCurrent())throw new Error('Exclusión hídrica caducada: cambió el MDT, la parcela o la tormenta. Vuelve a simular o desmarca la exclusión.');
    var mask=hydroMask();
    extra=extra.concat(FactiunHydro.exclusionRuns(
      HYDRO,+$('hydroThreshold').value,mask,300));
  }
  return extra;
}
function hydroPointInRing(lo,la,poly){
  var inside=false;
  for(var j=poly.length-1,i=0;i<poly.length;j=i++){
    var a=poly[i],b=poly[j];
    if((a[1]>la)!==(b[1]>la)&&lo<(b[0]-a[0])*(la-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
function hydroExternalCount(structures){
  if(!HYDRO_OFFICIAL.length||!structures)return 0;
  var count=0;structures.forEach(function(s){
    if(!s.lonlat||!s.lonlat.length)return;
    var lo=0,la=0;
    s.lonlat.forEach(function(p){lo+=p[0];la+=p[1];});
    lo/=s.lonlat.length;la/=s.lonlat.length;
    if(HYDRO_OFFICIAL.some(function(r){return hydroPointInRing(lo,la,r);}))count++;
  });return count;
}
function hydroLayoutUpdated(){
  if(!HYDRO){
    if(HYDRO_OFFICIAL.length&&RES&&RES.structures)
      $('hydroResults').innerHTML=ro('Mesas en capa externa',fmt(hydroExternalCount(RES.structures)))+
        ro('Fuente','importada','sin verificar');
    return;
  }
  if(!hydroCurrent()){
    HYDRO_EXPOSURE=null;$('hydroResults').innerHTML='';
    hydroStatus('MDT, parcela o escenario modificados. Repite la simulación antes de utilizar el riesgo anterior.','warn');
    return;
  }
  HYDRO_EXPOSURE=RES&&RES.structures?FactiunHydro.analyzeLayout(
    HYDRO,RES.structures,+$('hydroThreshold').value,+$('modWp').value):null;
  var sm=HYDRO.summary;
  $('hydroResults').innerHTML=ro('Calado máximo',fmt(sm.maxDepthM,2),'m')+
    ro('Lluvia efectiva',fmt(sm.effectiveRainMm,1),'mm')+
    ro('Área en rejilla ≥10 cm',fmt(sm.areaDepth10M2/1e4,2),'ha')+
    ro('Error balance',fmt(sm.balanceRelative*100,5),'%')+
    (HYDRO_EXPOSURE
      ? ro('Mesas expuestas',fmt(HYDRO_EXPOSURE.affected))+
        ro('Potencia afectada',fmt(HYDRO_EXPOSURE.affectedKwp,1),'kWp')
      : ro('Mesas expuestas','—','genera layout'))+
    (HYDRO_OFFICIAL.length&&RES?ro('Mesas en capa externa',fmt(hydroExternalCount(RES.structures))):'');
  if(HYDRO_EXPOSURE&&HYDRO_EXPOSURE.unknown)
    hydroStatus(HYDRO_EXPOSURE.unknown+' mesas fuera del MDT: SIN CLASIFICAR. No deben considerarse seguras.','warn');
  if(HYDRO_VIEWER&&RES)HYDRO_VIEWER.setStructures(RES.structures);
}
function hydroDraw2D(ctx,ring){
  if(HYDRO&&hydroCurrent()&&$('hydroOverlay').checked){
    var f=HYDRO.frames[HYDRO_FRAME],g=HYDRO.dem;
    var dl=Math.abs(g.lons[1]-g.lons[0])/2,da=Math.abs(g.lats[1]-g.lats[0])/2;
    for(var r=0;r<g.rows;r++)for(var c=0;c<g.cols;c++){
      var h=f.depth_m[r*g.cols+c];if(h<.008)continue;
      var lo=g.lons[c],la=g.lats[r],alpha=Math.min(.76,.17+.50*Math.sqrt(h/.5));
      ring([[lo-dl,la-da],[lo+dl,la-da],[lo+dl,la+da],[lo-dl,la+da]],
        'rgba(16,123,255,'+alpha.toFixed(3)+')',null,0);
    }
  }
  if(HYDRO_OFFICIAL.length&&$('hydroOfficialOverlay').checked)
    HYDRO_OFFICIAL.forEach(function(poly){ring(poly,'rgba(0,200,239,.18)','#00c8ef',1.15,[4,3]);});
}
function hydroOfficialTag(){
  $('hydroOfficialStatus').textContent=HYDRO_OFFICIAL.length
    ? HYDRO_OFFICIAL.length+' polígonos WGS84 aportados por usuario: autenticidad, procedencia y vigencia sin verificar.'
    : 'Sin capa externa importada.';
}
function hydroReadGeoJSON(raw){
  var doc=JSON.parse(raw),g=[];
  if(doc.type==='FeatureCollection')g=(doc.features||[]).map(function(f){return f.geometry;});
  else if(doc.type==='Feature')g=[doc.geometry];
  else g=[doc];
  if(g.length>1000)throw new Error('Más de 1.000 entidades: recorta a la parcela');
  var poly=[],total=0;
  g.forEach(function(geom){
    if(!geom)return;
    var arr=geom.type==='Polygon'?[geom.coordinates]:geom.type==='MultiPolygon'?geom.coordinates:null;
    if(!arr)throw new Error('Solo Polygon y MultiPolygon en WGS84');
    arr.forEach(function(rings){
      if(rings.length!==1)throw new Error('Hay polígonos con agujeros: no se permite excluirlos sin preservar esas zonas libres');
      var q=rings[0].map(function(p){
        var lo=+p[0],la=+p[1];
        if(!Number.isFinite(lo)||!Number.isFinite(la)||Math.abs(lo)>180||Math.abs(la)>90)
          throw new Error('Coordenadas no compatibles con WGS84 [lon,lat]');
        return [lo,la];
      });
      if(q.length<4)throw new Error('Anillo incompleto');
      if(Math.abs(q[0][0]-q[q.length-1][0])<1e-9&&
         Math.abs(q[0][1]-q[q.length-1][1])<1e-9)q.pop();
      total+=q.length;
      if(total>50000)throw new Error('Capa muy grande: recorta a la parcela');
      poly.push(q);
    });
  });
  if(!poly.length)throw new Error('No hay polígonos válidos');
  return poly;
}
$('hydroOfficialBtn').onclick=function(){$('hydroOfficialFile').click();};
$('hydroOfficialFile').onchange=function(e){
  var file=e.target.files[0];this.value='';if(!file)return;
  if(file.size>6*1024*1024){$('hydroOfficialStatus').textContent='Máximo 6 MB. Recorta la capa.';return;}
  var rd=new FileReader();
  rd.onload=function(evt){
    try{
      HYDRO_OFFICIAL=hydroReadGeoJSON(evt.target.result);
      hydroOfficialTag();draw();hydroLayoutUpdated();autoguarda();
    }catch(err){$('hydroOfficialStatus').textContent='No importada: '+(err.message||err);}
  };rd.readAsText(file);
};
$('hydroOfficialClear').onclick=function(){
  HYDRO_OFFICIAL=[];$('hydroOfficialAvoid').checked=false;
  hydroOfficialTag();hydroLayoutUpdated();draw();autoguarda();
};
['hydroOfficialOverlay','hydroOfficialAvoid'].forEach(function(id){
  $(id).addEventListener('change',function(){draw();autoguarda();});
});
$('hydroRun').onclick=async function(){
  if(!DEM){hydroStatus('Falta MDT: descarga terreno o importa CSV con cotas reales.','err');return;}
  hydroStop();$('hydroRun').disabled=true;
  hydroStatus('Resolviendo balance de agua en la malla MDT…');
  await new Promise(function(done){setTimeout(done,25);});
  try{
    var output=FactiunHydro.simulate(DEM,hydroOptions());
    if(output.summary.balanceRelative>1e-6)
      throw new Error('Balance de agua fuera de tolerancia: '+output.summary.balanceRelative);
    HYDRO=output;HYDRO_SIG=hydroSignature();
    $('hydroPlayback').style.display='';
    $('hydroTime').max=HYDRO.frames.length-1;
    $('hydroMax').textContent=fmt(HYDRO.summary.maxDepthM,3)+' m';
    $('hydro3dBtn').disabled=false;
    var frameIdx=0,gap=Infinity;
    HYDRO.frames.forEach(function(f,i){
      var delta=Math.abs(f.minute-HYDRO.options.rainMinutes);
      if(delta<gap){gap=delta;frameIdx=i;}
    });
    hydroFrame(frameIdx);hydroLayoutUpdated();
    hydroStatus('Criba completada: '+HYDRO.frames.length+' instantes · '+
      HYDRO.dem.dx.toFixed(1)+' × '+HYDRO.dem.dy.toFixed(1)+
      ' m/celda · MDT: '+HYDRO.dem.source+' · error de balance '+
      fmt(HYDRO.summary.balanceRelative*100,6)+' %. NO certificado.');
    if(HYDRO_VIEWER){
      HYDRO_VIEWER.setTerrain(HYDRO);
      HYDRO_VIEWER.setStructures(RES&&RES.structures||[]);
      HYDRO_VIEWER.setFrame(HYDRO_FRAME);
    }
    draw();autoguarda();
  }catch(err){hydroStatus('Simulación no disponible: '+(err.message||err),'err');}
  $('hydroRun').disabled=false;
};
$('hydroTime').oninput=function(){hydroStop();hydroFrame(+this.value);};
$('hydroPlay').onclick=function(){
  if(!HYDRO)return;
  if(HYDRO_TIMER){hydroStop();return;}
  if(HYDRO_FRAME>=HYDRO.frames.length-1)hydroFrame(0);
  $('hydroPlay').textContent='Ⅱ';
  HYDRO_TIMER=setInterval(function(){
    if(HYDRO_FRAME>=HYDRO.frames.length-1){hydroStop();return;}
    hydroFrame(HYDRO_FRAME+1);
  },420);
};
$('hydroOverlay').onchange=function(){draw();};
$('hydroThreshold').onchange=function(){
  if(hydroCurrent())hydroLayoutUpdated();
  draw();autoguarda();
};
$('hydroAvoid').onchange=function(){
  if(this.checked&&!hydroCurrent()){
    this.checked=false;hydroStatus('Para excluir por escorrentía simula antes el escenario actual.','warn');
  }
  autoguarda();
};
$('hydro3dBtn').onclick=function(){
  if(!hydroCurrent()){hydroStatus('Repite la simulación antes de abrir el visor 3D.','warn');return;}
  var host=$('hydroScene'),open=host.hidden;
  host.hidden=!open;$('cv').style.display=open?'none':'';
  this.textContent=open?'▣ Ver mapa 2D':'💧 Agua 3D';
  this.setAttribute('aria-pressed',open?'true':'false');
  if(open){
    try{
      if(!HYDRO_VIEWER)HYDRO_VIEWER=FactiunHydroViewer.create(host,function(pos){
        var d=FactiunHydro.sample(HYDRO,pos.lon,pos.lat,HYDRO_FRAME);
        hydroStatus(d?'Punto '+pos.lat.toFixed(6)+', '+pos.lon.toFixed(6)+
          ' · calado ahora '+fmt(d.depth_m,3)+' m, máximo '+fmt(d.peakDepth_m,3)+
          ' m · cota '+fmt(d.elevation_m,1)+' m':
          'Punto fuera del MDT.','');
      });
      HYDRO_VIEWER.setTerrain(HYDRO);HYDRO_VIEWER.setStructures(RES&&RES.structures||[]);
      HYDRO_VIEWER.setFrame(HYDRO_FRAME);HYDRO_VIEWER.render();
    }catch(err){
      host.hidden=true;$('cv').style.display='';this.textContent='💧 Agua 3D';
      hydroStatus('WebGL no disponible: '+(err.message||err),'err');
    }
  }else draw();
};
function hydroReportHeader(){
  return {model:HYDRO.model,status:HYDRO.status,
    limits:'Criba no calibrada. No sustituye normativa, estudio hidrológico ni análisis hidráulico 2D validado.',
    dem:{source:HYDRO.dem.source,rows:HYDRO.dem.rows,cols:HYDRO.dem.cols,
      dx_m:HYDRO.dem.dx,dy_m:HYDRO.dem.dy},
    scenario:HYDRO.options,summary:HYDRO.summary,exposure:HYDRO_EXPOSURE,
    imported_polygons:HYDRO_OFFICIAL.length,
    provenance:'Polígonos externos importados por el usuario; no verificados'};
}
$('hydroReport').onclick=function(){
  if(!hydroCurrent()){hydroStatus('Vuelve a simular el escenario antes de exportar.','warn');return;}
  bajar(nombreSalida('cribado-hidrico.json'),JSON.stringify(hydroReportHeader(),null,2),'application/json');
};
$('hydroGeoExport').onclick=function(){
  if(!hydroCurrent()){hydroStatus('Vuelve a simular el escenario antes de exportar.','warn');return;}
  var g=HYDRO.dem,dl=Math.abs(g.lons[1]-g.lons[0])/2,da=Math.abs(g.lats[1]-g.lats[0])/2;
  var features=[];
  for(var r=0;r<g.rows;r++)for(var c=0;c<g.cols;c++){
    var i=r*g.cols+c,h=HYDRO.peakDepth_m[i];if(h<.01)continue;
    var lo=g.lons[c],la=g.lats[r];
    var polygon=[[lo-dl,la-da],[lo+dl,la-da],[lo+dl,la+da],[lo-dl,la+da],[lo-dl,la-da]];
    features.push({type:'Feature',properties:{max_depth_m:+h.toFixed(4),
      max_local_velocity_mps:+HYDRO.peakVelocity_mps[i].toFixed(3),
      status:'PRELIMINAR_NO_CERTIFICADO'},
      geometry:{type:'Polygon',coordinates:[polygon]}});
  }
  bajar(nombreSalida('riesgo-hidrico.geojson'),JSON.stringify({
    type:'FeatureCollection',name:'Factiun · criba hídrica NO CERTIFICADA',
    metadata:hydroReportHeader(),features:features}),'application/geo+json');
};
/* Aparece el panel DESPUÉS de restaurar la sesión del Generador.
   Los resultados hidráulicos no se guardan: una nueva sesión exige simular. */
hydroOfficialTag();
if(HYDRO_OFFICIAL.length)hydroLayoutUpdated();
draw();
