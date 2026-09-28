/* Layout search v1: online Gaussian-process surrogate, no layout physics.
 * The caller supplies compute + the EXISTING layout score. Only measured
 * results may become incumbents. Posterior variance guides exploration; it
 * is not a calibrated probability of geometric/physical correctness.
 * Browser + Node, dependency-free. Fixed project settings are never searched.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LayoutSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = 'layout-offset-gp-v1';
  var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
  var clock = function () { return typeof performance !== 'undefined' ? performance.now() : Date.now(); };
  function random(seed) {
    var s = seed >>> 0;
    return function () { s += 0x6D2B79F5; var t = s;
      t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function halton(n, base) {
    var f = 1, r = 0;
    while (n > 0) { f /= base; r += f * (n % base); n = Math.floor(n / base); }
    return r;
  }
  function pool(seed) {
    // Same candidate domain and same initial probes in GP and random baseline.
    var out = [[0,0],[1,1],[0,1],[1,0],[0.5,0.5],[0.5,0],[0,0.5],[1,0.5]],
        rng = random(seed), sx = rng(), sy = rng();
    for (var i = 1; i <= 256; i++) out.push([(halton(i,2)+sx)%1,(halton(i,3)+sy)%1]);
    return out;
  }
  function kernel(a, b) {
    var distance=0;
    for(var i=0;i<a.length;i++) distance+=(a[i]-b[i])*(a[i]-b[i]);
    return Math.exp(-0.5*distance/(0.22*0.22));
  }
  function forward(L, b) {
    var x = [];
    for (var i=0;i<b.length;i++) { var v=b[i];
      for (var j=0;j<i;j++) v-=L[i][j]*x[j];
      x[i]=v/L[i][i]; }
    return x;
  }
  function fit(samples) {
    var n=samples.length, mean=samples.reduce(function(s,p){return s+p.y;},0)/n;
    var scale=Math.sqrt(samples.reduce(function(s,p){return s+(p.y-mean)*(p.y-mean);},0)/n)||1;
    var L=[];
    for (var i=0;i<n;i++) {
      L[i]=[];
      for (var j=0;j<=i;j++) {
        var v=kernel(samples[i].x,samples[j].x)+(i===j?1e-6:0);
        for (var k=0;k<j;k++) v-=L[i][k]*L[j][k];
        if (i===j) { if (!(v>0)) throw new Error('GP covariance is not positive definite'); L[i][j]=Math.sqrt(v); }
        else L[i][j]=v/L[j][j];
      }
    }
    var z=forward(L,samples.map(function(p){return (p.y-mean)/scale;})), alpha=[];
    for (var ii=n-1;ii>=0;ii--) { var a=z[ii];
      for (var jj=ii+1;jj<n;jj++) a-=L[jj][ii]*alpha[jj];
      alpha[ii]=a/L[ii][ii]; }
    return function(x) {
      var kv=samples.map(function(p){return kernel(x,p.x);}), w=forward(L,kv), mu=0, variance=1;
      for (var h=0;h<n;h++) { mu+=kv[h]*alpha[h]; variance-=w[h]*w[h]; }
      return {mean:mean+scale*mu, sd:scale*Math.sqrt(Math.max(0,variance))};
    };
  }
  function cdf(x) {
    var a=Math.abs(x), t=1/(1+0.2316419*a);
    var p=0.3989422804014327*Math.exp(-a*a/2)*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
    return x>=0?1-p:p;
  }
  function expectedImprovement(p, best) {
    if (!(p.sd>1e-10)) return Math.max(0,p.mean-best);
    var d=p.mean-best-0.01*p.sd, z=d/p.sd;
    return d*cdf(z)+p.sd*0.3989422804014327*Math.exp(-z*z/2);
  }
  function validResult(r) {
    var s=r&&r.stats;
    return !!(s && s.qa_geometria_ok===true && Number.isFinite(s.modules) && s.modules>0 &&
      Number.isFinite(s.kWp) && s.kWp>0 && !(r.avisos||[]).some(function(a){return a.severidad==='fail';}));
  }
  async function run(input, opts) {
    opts=opts||{};
    if (typeof opts.compute!=='function'||typeof opts.score!=='function') throw new Error('Falta el motor o su puntuación.');
    if (!input||!Number.isFinite(input.pitch)||input.pitch<=0) throw new Error('Pitch no válido.');
    if (!['tracker','fija','fixed'].includes(input.mount)) throw new Error('El piloto requiere un solo montaje.');
    var cfg=clone(input), budget=opts.budget==null?24:Number(opts.budget), seed=opts.seed==null?20260928:opts.seed;
    if (!Number.isInteger(budget)||budget<8||budget>96) throw new Error('El presupuesto debe ser un entero entre 8 y 96.');
    var method=opts.method||'gp';
    if (!['gp','random'].includes(method)) throw new Error('Método desconocido.');
    var candidates=pool(seed), seen=new Set(), samples=[], trace=[], best=null, baseline=null;
    var start=clock(), computeMs=0, fallbackSteps=0, stopped=false, rng=random(seed+1);
    var key=function(p){return p.map(function(v){return v.toFixed(9);}).join(',');};
    function configAt(p) { return Object.assign(clone(cfg),{_xOff:(p[0]-0.5)*cfg.pitch,_yOff:(p[1]-0.5)*cfg.pitch}); }
    async function evaluate(c, p, stage, prediction) {
      var t=clock(), result=null, error=null, score=null;
      try { result=await opts.compute(c); if(validResult(result)) { score=opts.score(result);
        if(!Number.isFinite(score)) { error='Puntuación no finita'; score=null; } }
        else error='La comprobación geométrica del motor no acepta este resultado';
      } catch(e) { error=String(e&&e.message||e); }
      var dt=clock()-t; computeMs+=dt;
      // An automatic origin sweep is one BASELINE evaluation, internally more
      // expensive. Its real wall time is included, never replaced by stats.ms.
      if (!p) { var st=result&&result.stats||{};
        p=[0.5+(c._xOff==null?(st.x_offset_chosen_m||0):c._xOff)/cfg.pitch,
           0.5+(c._yOff==null?(st.y_offset_chosen_m||0):c._yOff)/cfg.pitch]; }
      seen.add(key(p));
      if(score!==null) samples.push({x:p.slice(),y:score});
      var row={iteration:trace.length,stage:stage,x:p[0],y:p[1],xOffsetM:(p[0]-0.5)*cfg.pitch,
        yOffsetM:(p[1]-0.5)*cfg.pitch,score:score,valid:score!==null,
        modules:result&&result.stats.modules||0,kWp:result&&result.stats.kWp||0,
        ms:dt,error:error,predictionBeforeEvaluation:prediction||null};
      trace.push(row);
      if(score!==null&&(!best||score>best.score+1e-8)) best={score:score,result:result,config:clone(c),iteration:row.iteration};
      if(stage==='baseline') baseline={score:score,result:result,config:clone(c),iteration:0};
      if(opts.onProgress) await opts.onProgress({completed:trace.length,budget:budget,best:best,baseline:baseline,row:row});
    }
    await evaluate(clone(cfg),null,'baseline',null);
    while(trace.length<budget) {
      if(opts.shouldStop&&opts.shouldStop()) { stopped=true; break; }
      var todo=candidates.filter(function(p){return !seen.has(key(p));});
      if(!todo.length) break;
      var p=null,prediction=null,stage='initial';
      if(trace.length<=8) p=todo[0];
      else if(method==='random') { p=todo[Math.floor(rng()*todo.length)]; stage='random'; }
      else {
        stage='gp';
        try {
          if(samples.length<3) throw new Error('Insufficient valid observations');
          var predict=fit(samples), value=-Infinity;
          todo.forEach(function(q){var pred=predict(q), acq=expectedImprovement(pred,best.score);
            if(acq>value) {value=acq;p=q;prediction=pred;} });
        } catch(e) { p=todo[Math.floor(rng()*todo.length)]; stage='fallback_random'; fallbackSteps++; }
      }
      await evaluate(configAt(p),p,stage,prediction);
    }
    var report={schema:'factiun.layout-search.v1',model:VERSION,method:method,seed:seed,
      status:stopped?'cancelled':'completed',budget:budget,evaluations:trace.length,
      elapsedMs:clock()-start,computeMs:computeMs,fallbackSteps:fallbackSteps,
      domain:{xOffsetM:[-cfg.pitch/2,cfg.pitch/2],yOffsetM:[-cfg.pitch/2,cfg.pitch/2]},
      objective:'LAY.puntuaLayout',source:'existing_browser_layout_engine',validation:'experimental',
      improved:!!(best&&best.iteration!==0),baselineScore:baseline.score,bestScore:best?best.score:null,
      bestIteration:best?best.iteration:null,input:cfg,bestConfig:best?best.config:null,trace:trace};
    return {baseline:baseline,best:best,report:report};
  }
  /* The single product search: same feasible candidates and objective for both
   * methods. Solar weighting belongs to the caller, never to this surrogate.
   * The historical offset-only run() above remains a reproducible benchmark. */
  function sampler(input, opts) {
    opts=opts||{};
    var cfg=clone(input), az=Number.isFinite(cfg.panelAz)?cfg.panelAz:90;
    if(!(cfg.pitch>0))throw new Error('Pitch no válido.');
    var rotate=opts.rotate!==false&&cfg.mount==='tracker', stagger=opts.stagger!==false,
      xy=opts.xy!==false, method=opts.method||'random', rng=random(opts.seed||20260928),
      candidates=[], samples=[], used=new Set(), count=0, last=null;
    var normalize=a=>((a%360)+360)%360;
    function feature(c,r){
      var s=r&&r.stats||{}, giro=((c.panelAz-az+90)%180+180)%180-90;
      return [giro/180+.5,c.rowOffset==='half'?1:0,
        .5+(c._xOff==null?(s.x_offset_chosen_m||0):c._xOff)/cfg.pitch,
        .5+(c._yOff==null?(s.y_offset_chosen_m||0):c._yOff)/cfg.pitch];
    }
    function key(c){return JSON.stringify([c.panelAz,c.rowOffset,c._xOff??null,c._yOff??null]);}
    function add(giro,off,x,y){
      var c=Object.assign(clone(cfg),{panelAz:rotate?normalize(Math.round((az+giro)*10)/10):az,
        rowOffset:stagger?off:(cfg.rowOffset||'none')});
      if(xy&&x!=null){c._xOff=x*cfg.pitch;c._yOff=y*cfg.pitch;}
      var k=key(c);if(!used.has(k)){used.add(k);candidates.push({config:c,x:feature(c)});}
    }
    used.add(key(cfg));
    if(method==='grid'){
      var from=Number(opts.from),to=Number(opts.to),step=Number(opts.step);
      if(!rotate||!Number.isFinite(from)||!Number.isFinite(to)||!(step>0)||to<=from||Math.ceil((to-from)/step)>360)
        throw new Error('Barrido: usa un rango creciente y un paso positivo, con un máximo de 360 ángulos.');
      // An explicit angular sweep preserves origin and arrangement.
      stagger=false;xy=false;
      for(var a=from;a<to-1e-9;a+=step)add(a-az,cfg.rowOffset);
    }else{
      var north=((90-az+90)%180+180)%180-90;
      [north,0,-60,60,-30,30,-90].forEach(g=>add(g,cfg.rowOffset||'none'));
      if(stagger)add(north,cfg.rowOffset==='half'?'none':'half');
      for(var i=0;i<1024;i++)add(rotate?rng()*180-90:0,rng()<.5?'none':'half',xy?rng()-.5:null,xy?rng()-.5:null);
    }
    used.clear();
    return {
      next:function(){
        if(count++===0)return last={config:clone(cfg),stage:'baseline',prediction:null};
        var todo=candidates.filter(p=>!used.has(key(p.config)));
        if(!todo.length)return null;
        var chosen=todo[0],prediction=null,stage=count<=9?'initial':method;
        if(method==='gp'&&count>9){
          try{
            if(samples.length<3)throw new Error('Faltan observaciones válidas');
            var training=samples.slice(-48), top=samples.slice().sort((a,b)=>b.y-a.y).slice(0,16);
            top.forEach(p=>{if(!training.includes(p))training.push(p);});
            var predict=fit(training), best=Math.max(...samples.map(p=>p.y)), acquisition=-Infinity;
            todo.forEach(p=>{var pred=predict(p.x),v=expectedImprovement(pred,best);
              if(v>acquisition){acquisition=v;chosen=p;prediction=pred;}});
          }catch(e){stage='fallback_random';}
        }
        used.add(key(chosen.config));
        return last={config:clone(chosen.config),stage:stage,prediction:prediction};
      },
      observe:function(result,score){
        if(last&&validResult(result)&&Number.isFinite(score))samples.push({x:feature(last.config,result),y:score});
      },
      domain:{rotate:rotate,stagger:stagger,xy:xy,xOffsetM:xy?[-cfg.pitch/2,cfg.pitch/2]:null,
        yOffsetM:xy?[-cfg.pitch/2,cfg.pitch/2]:null}
    };
  }
  return {VERSION:VERSION,run:run,fit:fit,pool:pool,validResult:validResult,sampler:sampler};
});
