/* Comparison and controls for the ONE optimizer in buscador-implantacion.html.
 * All values come from measured LAY results; the generator only receives an
 * explicit configuration through the existing, versioned project handshake. */
(function(){
  'use strict';
  const format=(n,d=0)=>Number.isFinite(n)?n.toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const signed=(n,d=0)=>(n>0?'+':'')+format(n,d);
  function describe(item){
    if(!item||!item.valid||!item.r)return {};
    const s=item.r.stats;
    return {modules:s.modules,structures:s.structures,kWp:s.kWp,score:item.ener,factor:item.rend,
      panelAz:s.panel_az_deg,axisAz:s.mount_type==='tracker'?((s.panel_az_deg-90)%360+360)%360:null,
      pitch:s.pitch_m,setback:s.setback_m,gcr:s.GCR,rowOffset:item.offset,
      xOffsetM:item.xOffsetM,yOffsetM:item.yOffsetM,centerX:s.center_shift_m?.[0],centerY:s.center_shift_m?.[1],bySize:s.by_size||{}};
  }
  function row(name,a,b,d,key){
    const changed=a!=null&&b!=null&&a!==b;
    const fmt=v=>typeof v==='string'?v:format(v,d);
    return '<tr data-key="'+key+'"'+(changed?' class="changed"':'')+'><td>'+name+'</td><td>'+fmt(a)+'</td><td>'+fmt(b)+'</td></tr>';
  }
  function report(){
    const best=MEJOR&&MEJOR.valid?Object.assign({},MEJOR.config,{_xOff:MEJOR.xOffsetM,_yOff:MEJOR.yOffsetM}):null;
    return {schema:'factiun.layout-optimizer.v2',version:'1.10.0',model:'layout-joint-gp-v1',method:SEARCH_OPTIONS?.method,seed:SEM.slice(),options:SEARCH_OPTIONS,
      objective:GIRA&&SOL?'kWp * canonical_clear_sky_orientation_factor':'kWp',
      objectiveLimit:'Índice comparativo de cielo claro, no energía anual. GP experimental sin superioridad demostrada.',
      status:PAUSA?'paused_or_complete':'running',elapsedMs:performance.now()-SEARCH_START,budget:+$('searchBudget').value,evaluations:OPC,
      computeMs:TRACE.reduce((t,p)=>t+p.ms,0),source:'existing_browser_layout_and_solar_engines',
      input:CFGP,bestConfig:best,bestIteration:MEJOR?.iteration??null,
      comparison:{reference:describe(BASE_REF),proposal:describe(MEJOR)},trace:TRACE};
  }
  function render(){
    if(!CFGP)return;
    const a=describe(BASE_REF),b=describe(MEJOR),dirty=JSON.stringify(searchOptions())!==JSON.stringify(SEARCH_OPTIONS);
    $('searchProgress').max=+$('searchBudget').value;$('searchProgress').value=OPC;
    $('searchStatus').textContent=SEARCH_ERROR|| (dirty?'Opciones cambiadas: pulsa Buscar para repetir.':
      (PAUSA?(OPC>=+$('searchBudget').value?'Búsqueda terminada':'En pausa'):'Buscando')+' · '+OPC+' evaluaciones'+
      (!MEJOR&&OPC?' · ninguna implantación supera la comprobación geométrica.':
       BASE_REF&&MEJOR&&!puedeAplicar()&&ENCARGO?' · no se ha encontrado mejora.':''));
    $('searchPause').textContent=PAUSA?'Continuar':'Pausar';$('searchPause').disabled=dirty||!SAMPLER||OPC>=+$('searchBudget').value;
    $('searchApply').disabled=!puedeAplicar();$('searchApply').hidden=!ENCARGO;
    $('viewBase').disabled=!BASE_REF?.valid;$('viewBest').disabled=!MEJOR?.valid;$('searchExport').disabled=!OPC;
    $('viewLabel').textContent='Vista: '+(VIEW_RESULT==='base'?'referencia':'propuesta');
    $('searchMetrics').innerHTML=row('Módulos',a.modules,b.modules,0,'modules')+row('Mesas',a.structures,b.structures,0,'structures')+
      row('Potencia (kWp)',a.kWp,b.kWp,2,'kWp')+row('Factor solar',a.factor,b.factor,4,'factor')+
      row(GIRA&&SOL?'Índice solar relativo':'Potencia comparada',a.score,b.score,2,'score');
    $('searchGain').textContent=Number.isFinite(a.kWp)&&Number.isFinite(b.kWp)?
      signed(b.modules-a.modules)+' módulos · '+signed(b.structures-a.structures)+' mesas · '+signed(b.kWp-a.kWp,2)+' kWp ('+
      signed(100*(b.kWp-a.kWp)/a.kWp,2)+' %). '+(GIRA&&SOL?'Índice solar: '+signed(100*(b.score-a.score)/a.score,2)+' %.':''):
      'Sin dos resultados válidos para calcular diferencias.';
    const rows=[['panelAz',GIRA?'Azimut de filas (°)':'Azimut de paneles (°)',2],['pitch','Pitch (m)',3],['setback','Retranqueo (m)',3],
      ['gcr','GCR',3],['rowOffset','Disposición',0],['xOffsetM','Origen X (m)',3],['yOffsetM','Origen Y (m)',3]];
    if(a.axisAz!=null||b.axisAz!=null)rows.unshift(['axisAz','Azimut del eje (°)',2]);
    if([a.centerX,a.centerY,b.centerX,b.centerY].some(v=>Number.isFinite(v)&&Math.abs(v)>1e-9))
      rows.push(['centerX','Centrado extra X (m)',3],['centerY','Centrado extra Y (m)',3]);
    const label=(v,key)=>key==='rowOffset'?(v==null?null:v==='half'?'Tresbolillo':'Alineado'):v;
    $('searchDesign').innerHTML=rows.map(([k,n,d])=>row(n,label(a[k],k),label(b[k],k),d,k)).join('');
    const changed=rows.filter(([k])=>a[k]!=null&&b[k]!=null&&a[k]!==b[k]);
    $('searchChanges').textContent=Number.isFinite(a.kWp)&&Number.isFinite(b.kWp)?
      (changed.length?'Cambian: '+changed.map(r=>r[1]).join(', ')+'.':'Se conserva la configuración de referencia.'):'Comparación geométrica incompleta.';
    const sizes=[...new Set([...Object.keys(a.bySize||{}),...Object.keys(b.bySize||{})])].map(Number).sort((x,y)=>y-x);
    $('searchSizes').innerHTML=sizes.map(n=>row(String(n),a.bySize?.[n]||0,b.bySize?.[n]||0,0,'size-'+n)).join('');
  }
  function optionsChanged(){
    PAUSA=true;
    const grid=$('searchMethod').value==='grid';$('searchGrid').hidden=!grid;$('searchVariables').hidden=grid;
    $('methodNote').textContent=grid?'Barrido con disposición y origen actuales; incluye la referencia. Hasta es exclusivo.':
      $('searchMethod').value==='gp'?'El GP aprende de las evaluaciones de esta parcela. Experimental: aún sin ventaja consistente demostrada.':
        'La referencia entra primero. Se mantienen pitch, tallas, retranqueo, exclusiones y viales.';
    render();
  }
  ['searchMethod','searchAz','searchRows','searchXY','gridFrom','gridTo','gridStep'].forEach(id=>$(id).addEventListener('change',optionsChanged));
  $('searchRun').onclick=()=>{if(!LAY||!CFGP)return;nuevoSite(true);PAUSA=!!SEARCH_ERROR;render();};
  $('searchPause').onclick=()=>{PAUSA=!PAUSA;render();};
  $('viewBase').onclick=()=>{VIEW_RESULT='base';dibuja();render();};
  $('viewBest').onclick=()=>{VIEW_RESULT='best';dibuja();render();};
  $('searchApply').onclick=()=>{aplicaMejor();render();};
  $('searchExport').onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='comparacion-implantacion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  window.LayoutSearchUI={render,report};
})();
