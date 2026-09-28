/* Adapter for generador-layout.html. Physics remains in LAY; preview only
 * selects a result for the existing renderer. RES/exports change on Apply.
 */
(function(){
  'use strict';
  var state=null, running=false, cancel=false;
  var api={preview:null,check:check,reset:reset};
  window.LayoutSearchUI=api;
  function signature(){
    return JSON.stringify({config:readCfg(),parcelas:PARCELAS,zones:MIX_ZONAS,
      calc:$('calc').value,optAz:$('optAz').checked,optGrid:$('optGrid').checked});
  }
  function current(){return !!(state&&!state.stale&&state.signature===signature());}
  function status(s){$('aiStatus').textContent=s;}
  function check(){
    if(state&&!state.stale&&state.signature!==signature()){
      state.stale=true;cancel=true;api.preview=null;
      ['aiApply','aiViewBase','aiViewBest'].forEach(function(id){$(id).disabled=true;});
      status('El proyecto ha cambiado. Repite la comparación antes de usar una propuesta.');draw();
    }
  }
  function reset(){
    cancel=true;state=null;api.preview=null;$('aiResults').hidden=true;
    status('Sin comparación vigente · vuelve a comparar cuando lo necesites.');
  }
  function metric(name,a,b,d){return '<tr><td>'+name+'</td><td>'+fmt(a,d)+'</td><td>'+fmt(b,d)+'</td></tr>';}
  async function start(){
    if(running)return;
    reset();buildParcel();
    if(typeof LayoutSearch==='undefined'){status('No se pudo cargar el optimizador. Generar implantación sigue disponible.');return;}
    var cfg=readCfg();
    if(!cfg.coords||cfg.coords.length<3){status('Define primero una parcela.');return;}
    if(PARCELAS.length||cfg.mount==='mixto'){status('Este piloto compara una parcela y un montaje. La generación habitual sigue disponible para el conjunto.');return;}
    if($('calc').value!=='js'){status('Este piloto usa el motor de navegador. Selecciónalo expresamente en Cálculo para comparar.');return;}
    if($('optAz').checked||$('optGrid').checked){status('Desactiva el barrido de orientación para comparar con orientación fija.');return;}
    var mine={signature:signature(),stale:false,applied:false};state=mine;
    running=true;cancel=false;$('aiRun').disabled=true;$('aiStop').disabled=false;$('genBtn').disabled=true;
    $('aiProgress').max=+$('aiBudget').value;$('aiProgress').value=0;$('aiProgress').style.display='';
    try{
      var result=await LayoutSearch.run(cfg,{compute:LAY.compute,score:LAY.puntuaLayout,
        method:$('aiMethod').value,budget:+$('aiBudget').value,seed:20260928,
        shouldStop:function(){check();return cancel||state!==mine;},
        onProgress:async function(p){
          $('aiProgress').value=p.completed;
          if(!mine.stale)status('Evaluación '+p.completed+'/'+p.budget+' · mejor puntuación '+fmt(p.best&&p.best.score,2));
          await new Promise(function(r){setTimeout(r,0);});
        }});
      if(state!==mine)return;
      mine.result=result;check();
      $('aiResults').hidden=false;
      var baselineValid=LayoutSearch.validResult(result.baseline.result);
      var a=baselineValid?result.baseline.result.stats:{}, b=result.best&&result.best.result.stats||{};
      $('aiMetrics').innerHTML=metric('Módulos',a.modules,b.modules)+metric('Mesas',a.structures,b.structures)+
        metric('Potencia (kWp)',a.kWp,b.kWp,2)+metric('Puntuación',result.report.baselineScore,result.report.bestScore,2);
      $('aiApply').disabled=mine.stale||!result.report.improved;
      $('aiViewBest').disabled=mine.stale||!result.best;
      $('aiViewBase').disabled=mine.stale||!baselineValid;
      if(!mine.stale){
        if(baselineValid){RES=result.baseline.result;Object.assign(RES.stats,cfg.decl||{});pintar(RES,'navegador · referencia de comparación');}
        status((result.report.status==='cancelled'?'Detenida · ':'Finalizada · ')+result.report.evaluations+' evaluaciones · '+
          fmt(result.report.elapsedMs/1000,2)+' s · '+(!result.best?'ninguna implantación supera la comprobación geométrica. Revisa los parámetros.':
          (result.report.improved?'hay una propuesta mejor según la puntuación.':'sin mejora; se conserva la actual.')));
      }
      $('aiViewStatus').textContent=baselineValid?'El mapa y las salidas muestran la implantación actual.':
        'No hay referencia aceptada; se mantiene la implantación anterior.';
    }catch(e){status('No se pudo completar la comparación: '+(e&&e.message||e));}
    finally{running=false;$('aiRun').disabled=false;$('aiStop').disabled=true;$('genBtn').disabled=false;}
  }
  function show(which){
    check();if(!current()||!state.result)return;
    var item=which==='best'?state.result.best:state.result.baseline;if(!item)return;
    api.preview=item.result;draw();
    $('aiViewStatus').textContent=which==='best'&&!state.applied
      ?'Vista previa de la propuesta. Aplica para cambiar la implantación y sus salidas.'
      :(which==='best'?'Propuesta aplicada.':'Vista de la referencia original.');
  }
  function apply(){
    check();if(!current()||!state.result||!state.result.report.improved||state.applied)return;
    var best=state.result.best;
    // Recheck the measured result, never trust a surrogate prediction.
    if(!LayoutSearch.validResult(best.result)){status('La propuesta no supera la comprobación del motor.');return;}
    $('originManual').checked=true;$('originX').value=best.config._xOff;$('originY').value=best.config._yOff;
    state.applied=true;state.signature=signature();api.preview=null;
    RES=best.result;Object.assign(RES.stats,best.config.decl||{});pintar(RES,'navegador · propuesta aplicada');
    $('aiApply').disabled=true;$('aiViewStatus').textContent='Propuesta aplicada. Generar y las salidas usan el origen guardado.';
    status('Propuesta aplicada · origen X '+fmt(best.config._xOff,3)+' m · Y '+fmt(best.config._yOff,3)+' m.');
  }
  $('aiRun').onclick=start;$('aiStop').onclick=function(){cancel=true;status('Deteniendo después de la evaluación en curso…');};
  $('aiViewBase').onclick=function(){show('base');};$('aiViewBest').onclick=function(){show('best');};$('aiApply').onclick=apply;
  $('aiExport').onclick=function(){if(state&&state.result)bajar(nombreSalida('comparacion-ia.json'),
    JSON.stringify(Object.assign({},state.result.report,{projectChanged:!!state.stale,applied:!!state.applied}),null,2),'application/json');};
  document.addEventListener('input',check);document.addEventListener('change',check);
})();
