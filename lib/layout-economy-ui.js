/* Comparativa económica dentro del Generador.
   Motor matemático puro: lib/layout-economics.js. No energía inventada. */
"use strict";
function finParams(){
  return {energyKwhKwp:$('finYield').value,capexEurKwp:$('finCapex').value,
    opexEurKwpYear:$('finOpex').value,saleEurMwh:$('finPrice').value,
    discountPct:$('finDiscount').value,degradationPct:$('finDeg').value,
    years:$('finYears').value};
}
function finStatus(txt,cls){
  $('finStatus').className='hydro-state'+(cls?' '+cls:'');
  $('finStatus').textContent=txt;
}
function finSample(which){
  if(!RES||!RES.stats||!(RES.stats.kWp>0))
    throw new Error('Genera una implantación con potencia real antes de guardar el caso');
  if(HYDRO&&!hydroCurrent())
    throw new Error('La simulación hídrica ha caducado: simula de nuevo o desactiva el análisis');
  var civil=$('finCivil').value;
  if(civil.trim()==='')throw new Error('El coste civil extra debe declararse expresamente, aunque sea cero');
  var n=Number(civil);
  if(!Number.isFinite(n)||n<0)throw new Error('Coste civil extra no válido');
  return {kwp:RES.stats.kWp,structures:RES.stats.structures,
    trackers:RES.stats.trackers||0,extraCivilEur:n,
    unknownHydro:HYDRO_EXPOSURE?HYDRO_EXPOSURE.unknown:null,
    exposedTables:HYDRO_EXPOSURE?HYDRO_EXPOSURE.affected:null,
    hydroAvoid:$('hydroAvoid').checked,
    externalAvoid:$('hydroOfficialAvoid').checked,
    source:'RESULTADO_REAL_DEL_GENERADOR',name:which,
    sig:hydroSignature(),createdAt:new Date().toISOString()};
}
function finCapture(which){
  try{
    var sample=finSample(which);
    FIN_CASES[which]=sample;
    var title=which==='A'?'A':'B';
    finStatus('Alternativa '+title+' guardada: '+fmt(sample.kwp,1)+' kWp y '+
      fmt(sample.structures)+' mesas. '+(sample.hydroAvoid||sample.externalAvoid?
      'Exclusiones hídricas activas.':'Sin exclusiones hídricas activas.')+
      ' Ahora puedes comparar con la otra alternativa.');
    autoguarda();finCalculate();
  }catch(err){finStatus('No se pudo guardar alternativa: '+(err.message||err),'err');}
}
function finC(v,dec){
  return v==null||!Number.isFinite(v)?'—':fmt(v,dec==null?1:dec);
}
function finCalculate(){
  var table=$('finTable'),a=FIN_CASES.A,b=FIN_CASES.B;
  var current=RES&&RES.stats&&RES.stats.kWp>0?{
    kwp:RES.stats.kWp,extraCivilEur:+$('finCivil').value||0}:null;
  if(!current&&!a&&!b){finStatus('Genera una implantación para calcular o guardar las alternativas.','warn');table.innerHTML='';return null;}
  var inp;
  try{inp=FactiunLayoutEconomics.inputs(finParams());}
  catch(e){finStatus('Introduce las hipótesis económicas: '+e.message,'warn');
    table.innerHTML=ro('Implantación actual',current?finC(current.kwp,1):'—','kWp')+
      ro('Alternativa A',a?finC(a.kwp,1):'—','kWp')+
      ro('Alternativa B',b?finC(b.kwp,1):'—','kWp');
    return null;}
  try{
    var val=finParams(),rCurrent=current?FactiunLayoutEconomics.evaluate(current,val):null;
    if(a&&b){
      if(a.sig!==b.sig || a.sig!==hydroSignature()){
        table.innerHTML='';
        finStatus('A y B no son comparables: cambió la parcela, la lluvia o el MDT. Regenera y captura ambas alternativas con un escenario común.','warn');
        return null;
      }
      var r=FactiunLayoutEconomics.compare(a,b,val);
      function tr(label,va,vb,dec,suffix){
        return '<tr><td>'+label+'</td><td>'+finC(va,dec)+(suffix||'')+'</td><td>'+finC(vb,dec)+(suffix||'')+'</td></tr>';
      }
      table.innerHTML='<b>Alternativa A vs alternativa B</b>'+
        '<p class="note">A: '+(a.hydroAvoid||a.externalAvoid?'exclusión aplicada':'sin exclusión hídrica')+
        ' · B: '+(b.hydroAvoid||b.externalAvoid?'exclusión aplicada':'sin exclusión hídrica')+'</p>'+
        '<table><thead><tr><th>Magnitud</th><th>A</th><th>B</th></tr></thead><tbody>'+
        tr('Potencia',r.base.kwp,r.proposed.kwp,1,' kWp')+
        tr('Producción año 1',r.base.firstYearMwh,r.proposed.firstYearMwh,1,' MWh')+
        tr('CAPEX',r.base.capexEur,r.proposed.capexEur,0,' €')+
        tr('VAN',r.base.npvEur,r.proposed.npvEur,0,' €')+
        tr('TIR',r.base.irrPct,r.proposed.irrPct,2,' %')+
        tr('LCOE',r.base.lcoeEurMwh,r.proposed.lcoeEurMwh,2,' €/MWh')+
        tr('Retorno simple',r.base.paybackYears,r.proposed.paybackYears,0,' años')+
        '</tbody></table>'+
        '<p class="note">Δ B−A: '+finC(r.deltaKwp,1)+' kWp · '+
        finC(r.deltaNpvEur,0)+' € de VAN · '+finC(r.deltaLcoeEurMwh,2)+' €/MWh de LCOE.'+
        ' Son escenarios con hipótesis constantes, no costes de riesgos calculados automáticamente.</p>';
      finStatus('Comparación económica preliminar recalculada con los mismos datos de terreno y emplazamiento.');
      return {type:'compare',result:r,base:a,proposed:b};
    }
    if(rCurrent){
      table.innerHTML=ro('Potencia',finC(rCurrent.kwp,1),'kWp')+
        ro('Energía año 1',finC(rCurrent.firstYearMwh,1),'MWh')+
        ro('CAPEX',finC(rCurrent.capexEur,0),'€')+
        ro('VAN',finC(rCurrent.npvEur,0),'€')+
        ro('TIR',finC(rCurrent.irrPct,2),'%')+
        ro('LCOE',finC(rCurrent.lcoeEurMwh,2),'€/MWh')+
        '<p class="note">Guarda A y B para comparar dos implantaciones calculadas con el mismo emplazamiento/escenario.</p>';
      finStatus('Estimación para la implantación actual. La producción específica y los costes son hipótesis introducidas, no estimaciones de SolarGPT.');
      return {type:'current',result:rCurrent};
    }
    table.innerHTML='';
    finStatus('Se ha guardado una alternativa. Genera una implantación o captura la otra para compararlas.');
    return null;
  }catch(err){finStatus('No se pudo evaluar: '+(err.message||err),'err');return null;}
}
function finLayoutUpdated(){
  if(!$('finTable'))return;
  // No recalcular docenas de VAN durante la generación: solo después de pintar.
  if(RES&&RES.stats)$('finStatus').textContent='Layout actualizado ('+
    fmt(RES.stats.kWp,1)+' kWp). Pulsa Evaluar o guarda la alternativa para comparar.';
}
$('finBase').onclick=function(){finCapture('A');};
$('finRisk').onclick=function(){finCapture('B');};
$('finCalc').onclick=finCalculate;
$('finExport').onclick=function(){
  var snapshot=finCalculate();
  if(!snapshot){finStatus('Completa las hipótesis y genera al menos una implantación para descargar el informe.','warn');return;}
  var report={status:'PRELIMINAR_NO_BANKABLE',model:'factiun-layout-economy-v1',
    createdAt:new Date().toISOString(),
    note:'Datos de energía, coste y venta son hipótesis introducidas manualmente. No es un estudio financiero bankable.',
    assumptions:finParams(),parcel:PARCEL,scenario:hydroOptions(),
    evidence:snapshot,source:'Generador de implantaciones Factiun'};
  bajar(nombreSalida('comparacion-economica.json'),JSON.stringify(report,null,2),'application/json');
};
['finYield','finCapex','finOpex','finPrice','finDiscount','finDeg','finYears','finCivil']
  .forEach(function(id){
    $(id).addEventListener('change',function(){finCalculate();autoguarda();});
  });
/* Restaurar no supone que las capturas sean válidas para la nueva parcela. */
if(FIN_CASES.A||FIN_CASES.B){
  var count=(FIN_CASES.A?1:0)+(FIN_CASES.B?1:0);
  finStatus(count+' alternativa(s) recuperadas de sesión. Revisa sus hipótesis y que parcela/MDT/lluvia coincidan.');
}
