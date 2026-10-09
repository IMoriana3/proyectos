/* Factiun — viabilidad económica exploratoria para layout, v1.
   TODAS las hipótesis monetarias y de energía son entradas del usuario.
   No sustituye el core bankable de SolarGPT ni un PVSyst. */
(function(root,factory){
  var api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  root.FactiunLayoutEconomics=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function required(value,name,lo,hi){
    if(value===null||value===undefined||String(value).trim()==="")
      throw new Error("Indica "+name+"; no se inventa un valor por defecto");
    var n=Number(value);
    if(!Number.isFinite(n)||n<lo||n>hi)
      throw new Error(name+" fuera del rango "+lo+"–"+hi);
    return n;
  }
  function inputs(x){
    x=x||{};
    var years=required(x.years,"vida de análisis (años)",1,50);
    if(!Number.isInteger(years))throw new Error("La vida de análisis (años) debe ser un número entero");
    return {
      energyKwhKwp:required(x.energyKwhKwp,"producción específica (kWh/kWp/año)",1,4000),
      capexEurKwp:required(x.capexEurKwp,"CAPEX (€/kWp)",0,20000),
      opexEurKwpYear:required(x.opexEurKwpYear,"OPEX (€/kWp/año)",0,500),
      saleEurMwh:required(x.saleEurMwh,"precio energía (€/MWh)",0,2000),
      discountRate:required(x.discountPct,"tasa de descuento (%)",-10,50)/100,
      degradationRate:required(x.degradationPct,"degradación anual (%)",0,10)/100,
      years:years
    };
  }
  function npvAt(flows,r){
    if(!(r>-1))return Infinity;
    var out=0;
    for(var t=0;t<flows.length;t++)out+=flows[t]/Math.pow(1+r,t);
    return out;
  }
  function irr(flows) {
    // Cambio de signo convencional: desembolso primero y saldo anual después.
    var hasPlus=flows.some(v=>v>0),hasMinus=flows.some(v=>v<0);
    if(!hasPlus||!hasMinus)return null;
    var nonzero=flows.filter(function(v){return Math.abs(v)>1e-12;});
    var changes=0;
    for(var i=1;i<nonzero.length;i++){
      if(Math.sign(nonzero[i])!==Math.sign(nonzero[i-1]))changes++;
    }
    // Varias inversiones de signo permiten raíces múltiples (TIR ambigua).
    if(changes!==1)return null;
    var lo=-.9,hi=5,a=npvAt(flows,lo),b=npvAt(flows,hi);
    if(!Number.isFinite(a)||!Number.isFinite(b)||a*b>0)return null;
    for(var k=0;k<130;k++){
      var m=(lo+hi)/2,v=npvAt(flows,m);
      if(Math.abs(v)<1e-6)return m;
      if(Math.sign(v)===Math.sign(a)){lo=m;a=v;}
      else {hi=m;b=v;}
    }
    return (lo+hi)/2;
  }
  function evaluate(layout,values){
    if(!layout)throw new Error("Primero genera una implantación");
    var kwp=required(layout.kwp,"potencia implantada (kWp)",.001,1e8);
    var extra=required(layout.extraCivilEur==null?0:layout.extraCivilEur,
      "sobrecoste civil (€)",0,1e10);
    var p=inputs(values);
    var capex=kwp*p.capexEurKwp+extra;
    var annualOpex=kwp*p.opexEurKwpYear;
    var firstEnergy=kwp*p.energyKwhKwp/1000;
    var discountedCost=capex,discountedEnergy=0,year1=firstEnergy;
    var cum=-capex,payback=null,flows=[-capex],yearly=[];
    for(var year=1;year<=p.years;year++){
      var energy=firstEnergy*Math.pow(1-p.degradationRate,year-1);
      var revenue=energy*p.saleEurMwh;
      var margin=revenue-annualOpex;
      flows.push(margin);
      cum+=margin;
      if(payback===null&&cum>=0)payback=year;
      var disc=Math.pow(1+p.discountRate,year);
      discountedCost+=annualOpex/disc;
      discountedEnergy+=energy/disc;
      yearly.push({year:year,mwh:energy,revenueEur:revenue,opexEur:annualOpex,
        cashFlowEur:margin});
    }
    var npv=npvAt(flows,p.discountRate),rate=irr(flows);
    return {status:"ESTIMACION_NO_BANKABLE",model:"factiun-layout-economy-v1",
      kwp:kwp,firstYearMwh:year1,capexEur:capex,annualOpexEur:annualOpex,
      npvEur:npv,irrPct:rate===null?null:rate*100,
      lcoeEurMwh:discountedEnergy>0?discountedCost/discountedEnergy:null,
      paybackYears:payback,
      lifetimeMwh:yearly.reduce((a,y)=>a+y.mwh,0),
      assumptions:p,extraCivilEur:extra,annual:yearly};
  }
  function compare(base,proposed,values){
    var a=evaluate(base,values),b=evaluate(proposed,values);
    return {base:a,proposed:b,deltaKwp:b.kwp-a.kwp,
      deltaNpvEur:b.npvEur-a.npvEur,deltaLcoeEurMwh:b.lcoeEurMwh-a.lcoeEurMwh,
      deltaYear1Mwh:b.firstYearMwh-a.firstYearMwh};
  }
  return {evaluate:evaluate,compare:compare,inputs:inputs,irr:irr,
    version:"1.0.0"};
});
