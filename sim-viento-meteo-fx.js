/* sim-viento-meteo-fx.js
 * Meteorología visual para sim-viento.html.
 *
 * IMPORTANTE: esta capa NO decide nada. Consume el mismo frame que ya pinta
 * sim-viento.html y representa viento, nieve y granizo en pantalla y, cuando
 * THREE está disponible, dentro de la propia escena 3D.
 */
(function(){
'use strict';
if(typeof document==='undefined')return;
var host=document.getElementById('view3d');
if(!host||document.getElementById('meteoFxCanvas'))return;

var cv=document.createElement('canvas');
cv.id='meteoFxCanvas';
cv.setAttribute('aria-hidden','true');
Object.assign(cv.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'6',pointerEvents:'none'});
host.appendChild(cv);

var shade=document.createElement('div');
shade.id='meteoFxShade';
Object.assign(shade.style,{position:'absolute',inset:'0',zIndex:'5',pointerEvents:'none',transition:'background .28s,box-shadow .28s'});
host.appendChild(shade);

var impactHud=document.createElement('div');
impactHud.id='meteoImpactHud';
impactHud.setAttribute('aria-live','polite');
Object.assign(impactHud.style,{position:'absolute',right:'10px',bottom:'10px',zIndex:'9',pointerEvents:'none',
  maxWidth:'min(520px,58%)',padding:'7px 9px',background:'rgba(9,16,25,.86)',border:'1px solid #4d6a88',
  color:'#dce9f4',font:'11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  boxShadow:'0 8px 24px rgba(0,0,0,.28)',backdropFilter:'blur(4px)',display:'none'});
host.appendChild(impactHud);

var style=document.createElement('style');
style.textContent=
  '#view3d .hailfx{display:none!important}'+
  '#view3d.mfx-storm{box-shadow:inset 0 0 100px rgba(8,13,21,.46)}'+
  '#view3d.mfx-snow{box-shadow:inset 0 -22px 65px rgba(226,237,246,.16)}'+
  '#meteoImpactHud table{border-collapse:collapse;width:100%;margin-top:4px}'+
  '#meteoImpactHud th,#meteoImpactHud td{padding:2px 4px;border-bottom:1px solid rgba(120,150,180,.18);text-align:right;white-space:nowrap}'+
  '#meteoImpactHud th:first-child,#meteoImpactHud td:first-child{text-align:left}'+
  '@media(prefers-reduced-motion:reduce){#meteoFxCanvas{opacity:.62}}';
document.head.appendChild(style);

var x=cv.getContext('2d',{alpha:true}),W=0,H=0,last=performance.now(),seed=0x51f15e;
function rnd(){seed^=seed<<13;seed>>>=0;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;return seed/4294967296;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function num(id,d){var e=document.getElementById(id),v=e?parseFloat(e.value):NaN;return isFinite(v)?v:d;}
function on(id){var e=document.getElementById(id);return !!(e&&e.checked);}
function visible(id){var e=document.getElementById(id);return !!(e&&getComputedStyle(e).display!=='none');}
function resize(){
  var r=host.getBoundingClientRect(),nd=Math.min(2,window.devicePixelRatio||1);
  var w=Math.max(1,Math.round(r.width*nd)),h=Math.max(1,Math.round(r.height*nd));
  if(w===cv.width&&h===cv.height)return;
  cv.width=w;cv.height=h;W=r.width;H=r.height;x.setTransform(nd,0,0,nd,0,0);
}
if(window.ResizeObserver)new ResizeObserver(resize).observe(host);
window.addEventListener('resize',resize,{passive:true});resize();

function parseWindHud(){
  var e=host.querySelector('.meteo3d.wind'); if(!e)return null;
  var t=e.textContent||'',m=t.match(/([0-9]+(?:[.,][0-9]+)?)\s*km\/h/i),d=t.match(/([0-9]{1,3})\s*°/);
  return {v:m?parseFloat(m[1].replace(',','.')):null,dir:d?parseFloat(d[1]):null};
}
function hailHud(){
  var e=host.querySelector('.meteo3d.hail'),t=e?(e.textContent||''):'';
  var mm=t.match(/([0-9]+(?:[.,][0-9]+)?)\s*mm/i);
  return {mm:mm?parseFloat(mm[1].replace(',','.')):null,
          impact:/IMPACTO|impact/i.test(t),defense:/DEFENSA|HAIL_STOW|PROTEG/i.test(t)};
}
function state(){
  /* Camino principal: el MISMO frame que ya usa el HUD. Así las partículas
     no pueden contar una historia distinta de la máquina de estados. */
  var fr=window.__simVientoMeteoFrame;
  if(fr){
    var phase=String(fr.hail_phase||'');
    return {
      wind:Math.max(0,(+fr.wind_ms||0)*3.6),
      gust:Math.max(0,(+fr.gust_ms||0)*3.6),
      dir:isFinite(+fr.wind_dir)?+fr.wind_dir:270,
      hailDir:isFinite(+fr.hail_dir)?+fr.hail_dir:(isFinite(+fr.wind_dir)?+fr.wind_dir:270),
      hailOn:!!fr.hail_on,
      mm:Math.max(0,+fr.hail_mm||0),
      prob:Math.max(0,+fr.hail_prob_pct||0),
      impact:phase==='IMPACTO',
      watch:phase==='VIGILANCIA'||phase==='DEFENSA'||phase==='SIN_DATO_PROTEGIDO'||phase==='RETENCION',
      snow:Math.max(0,+fr.snow_cm||0),
      frame:fr
    };
  }

  /* Fallback para el arranque: antes del primer frame todavía no hay contrato
     publicado, así que se leen los mismos mandos que alimentarán el frame. */
  var hw=parseWindHud(),v=hw&&hw.v!=null?hw.v:null,dir=hw&&hw.dir!=null?hw.dir:null;
  if(v==null){
    if(visible('liveCtl')){v=num('lV',0);dir=num('lD',270);}
    else {v=num('eV',0);dir=num('eD',270);}
  }
  var h=hailHud(),hailOn=false,mm=0,prob=0,impact=false,watch=false;
  if(visible('liveCtl')){
    hailOn=on('lHailOn');mm=num('lHailMm',0);prob=num('lHailProb',0);
    impact=h.impact||(hailOn&&num('lHailEta',999)<=0);watch=hailOn&&!impact;
  }else{
    hailOn=on('eHailOn');mm=num('eHailMm',0);prob=num('eHailProb',0);
    var tt=num('eTime',0),eta0=num('eHailEta',999),after=num('eHailAfter',15);
    impact=h.impact||(hailOn&&tt>=eta0&&tt<=eta0+after);watch=(h.defense||hailOn)&&!impact;
  }
  if(h.mm!=null)mm=h.mm;
  var snowCm=0;
  if(on('eSnowOn')){
    var te=num('eTime',0),ss=num('eSnowStart',0),sc=num('eSnowClear',120);
    if(te>=ss&&te<sc)snowCm=Math.max(0,num('eSnowCm',0));
  }
  var panelN=document.getElementById('panelNieve');
  if(panelN&&getComputedStyle(panelN).display!=='none')snowCm=Math.max(snowCm,num('nCm',0));
  return {wind:Math.max(0,v||0),gust:0,dir:isFinite(dir)?dir:270,hailDir:isFinite(dir)?dir:270,
          hailOn:hailOn,mm:mm,prob:prob,impact:impact,watch:watch,snow:snowCm,frame:null};
}

/* Dirección meteorológica = DE dónde viene. Devuelve el vector hacia donde va. */
function worldWind(dir){
  var a=((+dir||0)%360+360)%360*Math.PI/180;
  return {x:-Math.sin(a),z:Math.cos(a)};
}

/* MODELO DE IMPACTO DE REFERENCIA.
   - piedra esférica;
   - densidad 900 kg/m³ (hielo compacto de referencia);
   - aire 1,225 kg/m³;
   - Cd=0,60 constante;
   - velocidad terminal por equilibrio peso-drag;
   - velocidad horizontal de la piedra = viento del frame.
   Esto da un REFERENTE mecánico coherente, no una predicción de rotura. */
var IMPACT_REF={rhoIce:900,rhoAir:1.225,Cd:.60,g:9.80665};
function panelNormal(thetaDeg,axisAzDeg){
  var t=(+thetaDeg||0)*Math.PI/180,a=(+axisAzDeg||0)*Math.PI/180;
  /* mundo sim-viento: +X este, +Y arriba, +Z sur; azimut 0=N, 90=E. */
  return {x:Math.cos(a)*Math.sin(t),y:Math.cos(t),z:Math.sin(a)*Math.sin(t)};
}
function hailVelocity(mm,windKmh,hailDirDeg){
  var D=Math.max(.001,+mm||0)/1000,r=IMPACT_REF;
  var vt=Math.sqrt((4*r.rhoIce*D*r.g)/(3*r.rhoAir*r.Cd));
  var w=Math.max(0,+windKmh||0)/3.6,h=worldWind(hailDirDeg);
  var vx=h.x*w,vy=-vt,vz=h.z*w;
  return {x:vx,y:vy,z:vz,vt_ms:vt,wind_ms:w,speed_ms:Math.sqrt(vx*vx+vy*vy+vz*vz),
          diameter_mm:+mm||0,hail_dir_deg:+hailDirDeg||0};
}
function impactMetrics(mm,windKmh,hailDirDeg,axisAzDeg,thetaDeg){
  var D=Math.max(.001,+mm||0)/1000,r=IMPACT_REF,m= r.rhoIce*Math.PI*D*D*D/6;
  var hv=hailVelocity(mm,windKmh,hailDirDeg),n=panelNormal(thetaDeg,axisAzDeg);
  var vt=hv.vt_ms,w=hv.wind_ms,vx=hv.x,vy=hv.y,vz=hv.z,v=hv.speed_ms;
  /* El módulo tiene dos caras. El signo del producto escalar dice cuál recibe
     el impacto; el valor absoluto da la componente normal mecánica. No se borra
     una colisión por venir de la trasera. */
  var dot=vx*n.x+vy*n.y+vz*n.z,face=(dot<=0?'FRONTAL':'TRASERA'),vn=Math.abs(dot);
  var exposure=v>1e-9?clamp(vn/v,0,1):0;
  var inc=exposure>0?Math.acos(clamp(exposure,-1,1))*180/Math.PI:90;
  var en=.5*m*vn*vn;
  /* PROXY DE CARGA DE IMPACTO: con concentración volumétrica de piedras C constante,
     el nº de impactos por m²·s es C·v⊥ y la potencia normal es C·v⊥·E⊥.
     Como C NO existe en nuestros datos, no damos W/m²: guardamos E⊥·v⊥ y solo
     comparamos razones entre estrategias bajo la MISMA tormenta. */
  var fluxProxy=en*vn;
  return {diameter_mm:+mm||0,mass_g:m*1000,vt_ms:vt,wind_ms:w,speed_ms:v,normal_ms:vn,
          incidence_deg:inc,exposure:exposure,face:face,energy_j:.5*m*v*v,normal_energy_j:en,
          impact_flux_proxy:fluxProxy,
          theta_deg:+thetaDeg||0,axis_az_deg:+axisAzDeg||0,hail_dir_deg:+hailDirDeg||0};
}
function hailThresholdMm(){
  var v=(window.LOC&&LOC.VDE&&+LOC.VDE.umbral_tamano_granizo_cm>0)?
    10*(+LOC.VDE.umbral_tamano_granizo_cm):19;
  return v;
}
function impactEnvelope(maxMm,windKmh,hailDirDeg,axisAzDeg,thetaDeg){
  var hi=Math.max(0,+maxMm||0),lo=Math.min(hi,hailThresholdMm());
  return {
    threshold_mm:lo,max_mm:hi,
    threshold:impactMetrics(lo,windKmh,hailDirDeg,axisAzDeg,thetaDeg),
    maximum:impactMetrics(hi,windKmh,hailDirDeg,axisAzDeg,thetaDeg)
  };
}
function impactRows(s){
  var fr=s.frame,ang=fr&&fr.ang?fr.ang:null;if(!ang)return [];
  var axis=num('axaz',0),dir=isFinite(s.hailDir)?s.hailDir:s.dir,rows=[];
  Object.keys(ang).forEach(function(k){
    if(k==='PASIVO'&&ang[k]==null)return;
    var q=impactMetrics(s.mm,Math.max(s.wind,s.gust||0),dir,axis,ang[k]);
    q.k=k;rows.push(q);
  });
  return rows;
}
function impactCumulative(frames,axisAzDeg){
  frames=frames||[];var sum={},seconds=0;
  for(var i=0;i<frames.length-1;i++){
    var f=frames[i],n=frames[i+1];
    if(!f||f.hail_phase!=='IMPACTO'||!f.ang)continue;
    var dt=(isFinite(+n.t_min)&&isFinite(+f.t_min))?Math.max(0,(+n.t_min-(+f.t_min))*60):0;
    if(!(dt>0))continue;
    var wk=Math.max(0,+f.wind_ms||0,+f.gust_ms||0)*3.6;
    var dir=isFinite(+f.hail_dir)?+f.hail_dir:(isFinite(+f.wind_dir)?+f.wind_dir:270);
    Object.keys(f.ang).forEach(function(k){
      if(f.ang[k]==null)return;
      var q=impactMetrics(+f.hail_mm||0,wk,dir,axisAzDeg,+f.ang[k]);
      sum[k]=(sum[k]||0)+q.impact_flux_proxy*dt;
    });
    seconds+=dt;
  }
  var base=sum.BASE||0,rows=Object.keys(sum).map(function(k){
    return {k:k,value:sum[k],vs_base:(k==='BASE'||!(base>1e-12)?null:100*(1-sum[k]/base))};
  });
  return {seconds:seconds,rows:rows};
}
function updateImpactHud(s){
  var severe=s.hailOn&&s.mm>0&&(s.watch||s.impact);
  if(!severe){impactHud.style.display='none';return;}
  var rows=impactRows(s);if(!rows.length){impactHud.style.display='none';return;}
  var phase=s.impact?'IMPACTO':'PREVISIÓN · si impactase ahora';
  var base=rows.find(function(q){return q.k==='BASE';})||rows[0],best=Infinity,worst=-Infinity;
  rows.forEach(function(q){best=Math.min(best,q.impact_flux_proxy);worst=Math.max(worst,q.impact_flux_proxy);});
  var thr=Math.min(Math.max(0,s.mm),hailThresholdMm()),windNow=Math.max(s.wind,s.gust||0),
      axis=num('axaz',0),dir=isFinite(s.hailDir)?s.hailDir:s.dir,
      baseLo=impactMetrics(thr,windNow,dir,axis,base.theta_deg);
  var rango=Math.abs(s.mm-thr)>.05?(thr.toFixed(0)+'→'+Math.round(s.mm)+' mm'):(Math.round(s.mm)+' mm');
  var h='<b>GRANIZO · '+phase+'</b> · envolvente mecánica '+rango+'<br>'+
    'piedra máxima: masa '+base.mass_g.toFixed(1)+' g · v<sub>t</sub> '+base.vt_ms.toFixed(1)+' m/s'+
    ' · viento '+windNow.toFixed(0)+' km/h · piel 3D = caso máximo'+
    '<table><thead><tr><th>caso</th><th>θ</th><th>cara</th><th>inc.</th><th>expuesto</th><th>v⊥</th><th>E⊥ max</th><th>Φ* vs BASE</th></tr></thead><tbody>';
  rows.forEach(function(q){
    var redHi=(base.impact_flux_proxy>1e-12)?100*(1-q.impact_flux_proxy/base.impact_flux_proxy):null;
    var qLo=impactMetrics(thr,windNow,dir,axis,q.theta_deg);
    var redLo=(baseLo.impact_flux_proxy>1e-12)?100*(1-qLo.impact_flux_proxy/baseLo.impact_flux_proxy):null;
    var col=Math.abs(q.impact_flux_proxy-best)<1e-9?'#62c88a':(Math.abs(q.impact_flux_proxy-worst)<1e-9?'#e84858':'inherit');
    var rr='—';
    if(q.k!=='BASE'&&redHi!==null&&redLo!==null){
      var a=Math.min(redLo,redHi),b=Math.max(redLo,redHi);
      rr=(a>=0?'−':'+')+Math.abs(a).toFixed(0)+' %';
      if(Math.abs(b-a)>.6)rr+='…'+(b>=0?'−':'+')+Math.abs(b).toFixed(0)+' %';
    }
    h+='<tr style="color:'+col+'"><td>'+q.k+'</td><td>'+q.theta_deg.toFixed(0)+'°</td><td>'+q.face+'</td><td>'+q.incidence_deg.toFixed(0)+'°</td>'+
       '<td>'+Math.round(q.exposure*100)+' %</td><td>'+q.normal_ms.toFixed(1)+' m/s</td>'+
       '<td>'+q.normal_energy_j.toFixed(q.normal_energy_j<10?1:0)+' J</td><td>'+rr+'</td></tr>';
  });
  h+='</tbody></table><span style="opacity:.68">La envolvente usa la piedra umbral ('+thr.toFixed(0)+' mm) y la máxima; la probabilidad del forecast NO es fracción de piedras. Φ* es comparación relativa, no W/m² ni probabilidad de rotura.</span>';
  var ev=(window.EVENTO&&EVENTO.sim&&EVENTO.sim.frames)?impactCumulative(EVENTO.sim.frames,axis):null;
  if(ev&&ev.seconds>0){
    var pieces=ev.rows.filter(function(q){return q.k!=='BASE'&&q.vs_base!==null;}).map(function(q){
      return q.k+' '+(q.vs_base>=0?'−':'+')+Math.abs(q.vs_base).toFixed(0)+' %';
    });
    h+='<br><span style="opacity:.82"><b>Episodio completo simulado · '+(ev.seconds/60).toFixed(0)+' min:</b> carga acumulada Φ*dt vs BASE · '+pieces.join(' · ')+'</span>';
  }
  impactHud.innerHTML=h;impactHud.style.display='block';
}
function screenWind(dir){
  var a=(dir+90)*Math.PI/180;
  return {x:Math.cos(a),y:Math.sin(a)*.18};
}

/* ═════════════════════════ 2D: atmósfera y primer plano ═════════════════ */
var clouds=[];
for(var ci=0;ci<14;ci++)clouds.push({x:rnd(),y:.02+rnd()*.28,s:.5+rnd()*1.35,a:.05+rnd()*.12,phase:rnd()*6.28});

function cloudsDraw(s,t){
  var storm=clamp((s.wind-25)/90,0,.42)+(s.watch?.34:0)+(s.impact?.50:0)+(s.snow>0?.20:0);
  if(storm<=.01)return;
  var v=screenWind(s.dir),spd=.004+s.wind/26000;
  x.save();
  for(var i=0;i<clouds.length;i++){
    var c=clouds[i],cx=((c.x+t*spd*v.x)%1.35+1.35)%1.35-.17;
    var cy=c.y+Math.sin(t*.00015+c.phase)*.018,px=cx*W,py=cy*H,rr=(65+W*.13)*c.s;
    var g=x.createRadialGradient(px,py,rr*.08,px,py,rr);
    g.addColorStop(0,'rgba(48,58,72,'+(c.a+storm*.24)+')');
    g.addColorStop(.58,'rgba(31,41,54,'+(c.a*.9+storm*.13)+')');
    g.addColorStop(1,'rgba(18,26,36,0)');
    x.fillStyle=g;x.beginPath();x.arc(px,py,rr,0,Math.PI*2);x.fill();
  }
  x.restore();
}
function atmosphere(s,t){
  var dark=clamp((s.wind-45)/120,0,.16)+(s.watch?.15:0)+(s.impact?.24:0)+(s.snow>0?.07:0);
  var cold=s.snow>0?.08:0;
  var flash=s.impact&&s.mm>35?(Math.max(0,Math.sin(t*.0047))*Math.max(0,Math.sin(t*.0019))*.12):0;
  shade.style.background='linear-gradient(180deg,rgba(8,14,23,'+(dark+flash)+') 0%,rgba(14,22,31,'+(dark*.36)+') 58%,rgba(207,225,237,'+cold+') 100%)';
  host.classList.toggle('mfx-storm',dark>.10);host.classList.toggle('mfx-snow',s.snow>0);
}

/* ═════════════════════════ 3D: meteorología dentro del mundo ═════════════ */
var F3={td:null,root:null,mundo:null,wind:null,snow:null,hail:null,hailArrow:null,dust:null,clouds:null,ground:null,
        coats:[],instSnow:null,instSource:null,impactSkins:[],instImpact:null,instImpactSource:null,
        baseFogNear:null,baseFogFar:null};
var MAX_WIND=190,MAX_SNOW=900,MAX_HAIL=700,MAX_DUST=280;

function roundTexture(){
  var c=document.createElement('canvas');c.width=c.height=64;var q=c.getContext('2d');
  var g=q.createRadialGradient(32,32,1,32,32,31);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.45,'rgba(245,250,255,.96)');
  g.addColorStop(.8,'rgba(225,238,248,.55)');g.addColorStop(1,'rgba(225,238,248,0)');
  q.fillStyle=g;q.fillRect(0,0,64,64);
  var tx=new THREE.CanvasTexture(c);tx.needsUpdate=true;return tx;
}
function groundSnowTexture(){
  var c=document.createElement('canvas');c.width=c.height=256;var q=c.getContext('2d');
  q.clearRect(0,0,256,256);
  for(var i=0;i<180;i++){
    var px=rnd()*256,py=rnd()*256,r=5+rnd()*28,a=.025+rnd()*.08;
    var g=q.createRadialGradient(px,py,0,px,py,r);
    g.addColorStop(0,'rgba(250,253,255,'+a+')');g.addColorStop(1,'rgba(250,253,255,0)');
    q.fillStyle=g;q.fillRect(px-r,py-r,r*2,r*2);
  }
  var tx=new THREE.CanvasTexture(c);tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.repeat.set(4,4);return tx;
}
function cloudTexture(){
  var c=document.createElement('canvas');c.width=256;c.height=128;var q=c.getContext('2d');
  q.clearRect(0,0,c.width,c.height);
  var blobs=[[55,78,46,.56],[92,57,52,.66],[132,69,60,.72],[174,57,48,.62],[205,78,39,.50],[118,91,70,.62]];
  blobs.forEach(function(b){
    var g=q.createRadialGradient(b[0],b[1],3,b[0],b[1],b[2]);
    g.addColorStop(0,'rgba(90,101,116,'+b[3]+')');
    g.addColorStop(.55,'rgba(60,72,87,'+(b[3]*.72)+')');
    g.addColorStop(1,'rgba(32,42,55,0)');
    q.fillStyle=g;q.fillRect(b[0]-b[2],b[1]-b[2],b[2]*2,b[2]*2);
  });
  var tx=new THREE.CanvasTexture(c);tx.needsUpdate=true;return tx;
}
function resetCloud(sp,td){
  var c=td.ct.target,R=clamp(td.radio||420,80,900);
  sp.position.set(c.x+(rnd()*2-1)*R*1.15,clamp(R*.16,45,150)+rnd()*clamp(R*.24,40,170),
                  c.z+(rnd()*2-1)*R*.85);
  var sc=clamp(R*(.16+rnd()*.17),32,220);
  sp.scale.set(sc*1.8,sc,1);sp.userData.phase=rnd()*6.28;sp.userData.baseY=sp.position.y;return sp;
}
function makePoints(n,col,size,opacity){
  var a=new Float32Array(n*3),g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(a,3));
  var m=new THREE.PointsMaterial({color:col,size:size,transparent:true,opacity:opacity,depthWrite:false,
    sizeAttenuation:true,map:roundTexture(),alphaTest:.02});
  return {obj:new THREE.Points(g,m),arr:a,p:new Array(n),mat:m};
}
function resetWorldParticle(p,kind,td){
  var c=td.ct.target,R=clamp(td.radio||420,80,900),rx=R*1.15,rz=R*.82,h=clamp(R*.40,45,230);
  p.x=c.x+(rnd()*2-1)*rx;p.z=c.z+(rnd()*2-1)*rz;p.y=2+rnd()*h;p.phase=rnd()*6.28;p.depth=.35+rnd()*.65;
  if(kind==='snow'){p.fall=5+rnd()*9;p.flutter=(rnd()*2-1);p.life=rnd();}
  if(kind==='hail'){p.vy=28+rnd()*28;p.bounce=0;p.life=rnd();}
  if(kind==='dust'){p.y=.2+rnd()*2.4;p.life=rnd();p.lift=.3+rnd()*1.5;}
  return p;
}
function build3D(td){
  var root=new THREE.Group();root.name='sim-viento-meteo-fx';td.sc.add(root);F3.root=root;F3.td=td;
  F3.baseFogNear=td.sc.fog?td.sc.fog.near:null;F3.baseFogFar=td.sc.fog?td.sc.fog.far:null;

  /* Viento: segmentos en el volumen real de la planta, no líneas pegadas a la pantalla. */
  var wa=new Float32Array(MAX_WIND*6),wg=new THREE.BufferGeometry();
  wg.setAttribute('position',new THREE.BufferAttribute(wa,3));
  var wm=new THREE.LineBasicMaterial({color:0xb8ddf3,transparent:true,opacity:.26,depthWrite:false});
  F3.wind={obj:new THREE.LineSegments(wg,wm),arr:wa,p:[],mat:wm};root.add(F3.wind.obj);
  for(var i=0;i<MAX_WIND;i++)F3.wind.p.push(resetWorldParticle({},'wind',td));

  F3.snow=makePoints(MAX_SNOW,0xf4f8fb,1.35,.82);root.add(F3.snow.obj);
  F3.hail=makePoints(MAX_HAIL,0xe2eff8,1.8,.92);root.add(F3.hail.obj);
  F3.hailArrow=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(),30,0x9ed8ff,6,3);
  F3.hailArrow.visible=false;
  [F3.hailArrow.line&&F3.hailArrow.line.material,F3.hailArrow.cone&&F3.hailArrow.cone.material].forEach(function(m){
    if(m){m.transparent=true;m.opacity=.45;m.depthWrite=false;}
  });
  root.add(F3.hailArrow);
  F3.dust=makePoints(MAX_DUST,0xb9a27a,1.2,.0);root.add(F3.dust.obj);
  for(i=0;i<MAX_SNOW;i++)F3.snow.p[i]=resetWorldParticle({},'snow',td);
  for(i=0;i<MAX_HAIL;i++)F3.hail.p[i]=resetWorldParticle({},'hail',td);
  for(i=0;i<MAX_DUST;i++)F3.dust.p[i]=resetWorldParticle({},'dust',td);

  /* Manto de nieve en el terreno con textura irregular. */
  var gm=new THREE.MeshBasicMaterial({map:groundSnowTexture(),transparent:true,opacity:0,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  var gg=new THREE.Mesh(new THREE.PlaneGeometry(1,1),gm);gg.rotation.x=-Math.PI/2;gg.position.y=.035;gg.renderOrder=3;
  root.add(gg);F3.ground={obj:gg,mat:gm};

  /* Bancos de nube en el mundo 3D. Son sprites suaves, pero ocupan coordenadas reales:
     al orbitar hay paralaje y ya no se leen como una pegatina sobre el canvas. */
  var cg=new THREE.Group(),ctx=cloudTexture();root.add(cg);F3.clouds={obj:cg,p:[]};
  for(i=0;i<12;i++){
    var cm=new THREE.SpriteMaterial({map:ctx,transparent:true,opacity:0,depthWrite:false,fog:true,
      color:0xffffff});
    var sp=new THREE.Sprite(cm);resetCloud(sp,td);cg.add(sp);F3.clouds.p.push(sp);
  }

  F3.wind.obj.frustumCulled=F3.snow.obj.frustumCulled=F3.hail.obj.frustumCulled=F3.dust.obj.frustumCulled=false;
}
function disposeInstSnow(){
  if(F3.instSnow&&F3.instSnow.parent)F3.instSnow.parent.remove(F3.instSnow);
  if(F3.instSnow&&F3.instSnow.material)F3.instSnow.material.dispose();
  F3.instSnow=null;F3.instSource=null;
}
function disposeImpactSurface(){
  F3.impactSkins.forEach(function(q){
    if(q.front&&q.front.parent)q.front.parent.remove(q.front);
    if(q.rear&&q.rear.parent)q.rear.parent.remove(q.rear);
    if(q.mat)q.mat.dispose();
  });
  F3.impactSkins=[];
  if(F3.instImpact&&F3.instImpact.parent)F3.instImpact.parent.remove(F3.instImpact);
  if(F3.instImpact&&F3.instImpact.material)F3.instImpact.material.dispose();
  F3.instImpact=null;F3.instImpactSource=null;
}
function scanCoats(td){
  F3.coats=[];disposeInstSnow();disposeImpactSurface();F3.mundo=td.mundo;
  /* Cada mundo puede redimensionar la niebla a su extensión. Ésta es la base
     que se restaura cuando pasa el temporal, no la del arranque de la página. */
  if(td.sc.fog){F3.baseFogNear=td.sc.fog.near;F3.baseFogFar=td.sc.fog.far;}
  if(td.mundo){
    td.mundo.traverse(function(o){
      if(!o||!o.spin||!o.spin.isGroup||o.userData.mfxSnowBound)return;
      o.userData.mfxSnowBound=true;
      var D=window.Seguidor&&Seguidor.DIMS;if(!D)return;
      var mat=new THREE.MeshStandardMaterial({color:0xf6fbff,roughness:.98,metalness:0,transparent:true,
        opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
      var group=new THREE.Group();group.name='mfx-snow-coat';group.visible=false;
      var geo=new THREE.BoxGeometry(D.strLen*.985,.018,D.modH*.97);
      var a=new THREE.Mesh(geo,mat),b=new THREE.Mesh(geo.clone(),mat);
      a.position.set(D.mesaC,D.off+.046,0);b.position.set(-D.mesaC,D.off+.046,0);
      group.add(a,b);o.spin.add(group);
      F3.coats.push({spin:o.spin,g:group,mat:mat});
    });
  }

  /* Plantas reales: las mesas son instanciadas. Se duplica solo la piel de la mesa y
     se comparte el BufferAttribute de matrices, de modo que la nieve sigue exactamente
     las mismas transformaciones sin recalcular la planta. */
  var E=window.ESC;
  if(E&&E.mesas&&E.mesas.isInstancedMesh&&E.mesas.parent){
    var sm=new THREE.MeshStandardMaterial({color:0xf7fbff,roughness:.98,metalness:0,transparent:true,
      opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
    var im=new THREE.InstancedMesh(E.mesas.geometry,sm,E.mesas.count);
    im.instanceMatrix=E.mesas.instanceMatrix;im.count=E.mesas.count;im.frustumCulled=E.mesas.frustumCulled;
    im.position.copy(E.mesas.position);im.quaternion.copy(E.mesas.quaternion);im.scale.copy(E.mesas.scale);
    im.name='mfx-snow-instanced';E.mesas.parent.add(im);
    F3.instSnow=im;F3.instSource=E.mesas;
  }

  /* SUPERFICIE DE IMPACTO.
     Comparativa: una piel por estrategia y por mesa, ligada al mismo grupo spin.
     Planta real: una piel instanciada para la estrategia seleccionada; en modo bandas
     se oculta para no pintar toda la planta con un único valor que sería falso. */
  if(E&&E.kind==='cmp'&&E.bloques&&window.Seguidor){
    var D2=Seguidor.DIMS;
    E.bloques.forEach(function(b){
      var matI=new THREE.MeshBasicMaterial({color:0xe84858,transparent:true,opacity:0,
        depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
        polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
      b.segs.forEach(function(t){
        if(!t||!t.spin)return;
        var gf=new THREE.Group(),gr=new THREE.Group();
        gf.name='mfx-hail-impact-front-'+b.k;gr.name='mfx-hail-impact-rear-'+b.k;
        gf.visible=gr.visible=false;
        var geoI=new THREE.BoxGeometry(D2.strLen*.99,.010,D2.modH*.985);
        var fa=new THREE.Mesh(geoI,matI),fb=new THREE.Mesh(geoI.clone(),matI);
        var ra=new THREE.Mesh(geoI.clone(),matI),rb=new THREE.Mesh(geoI.clone(),matI);
        /* El cristal del modelo mide 60 mm y está centrado en D.off. Se coloca la
           piel 8 mm fuera de cada cara para que la propia mesa oculte la opuesta. */
        fa.position.set(D2.mesaC,D2.off+.038,0);fb.position.set(-D2.mesaC,D2.off+.038,0);
        ra.position.set(D2.mesaC,D2.off-.038,0);rb.position.set(-D2.mesaC,D2.off-.038,0);
        gf.add(fa,fb);gr.add(ra,rb);t.spin.add(gf,gr);
        F3.impactSkins.push({k:b.k,front:gf,rear:gr,mat:matI});
      });
    });
  }else if(E&&E.mesas&&E.mesas.isInstancedMesh&&E.mesas.parent){
    var imat=new THREE.MeshBasicMaterial({color:0xe84858,transparent:true,opacity:0,depthWrite:false,
      side:THREE.DoubleSide,blending:THREE.AdditiveBlending,polygonOffset:true,
      polygonOffsetFactor:-4,polygonOffsetUnits:-4});
    var ii=new THREE.InstancedMesh(E.mesas.geometry,imat,E.mesas.count);
    ii.instanceMatrix=E.mesas.instanceMatrix;ii.count=E.mesas.count;ii.frustumCulled=E.mesas.frustumCulled;
    ii.position.copy(E.mesas.position);ii.quaternion.copy(E.mesas.quaternion);ii.scale.copy(E.mesas.scale);
    ii.name='mfx-hail-impact-instanced';E.mesas.parent.add(ii);
    F3.instImpact=ii;F3.instImpactSource=E.mesas;
  }
}
function bind3D(){
  var td=window.TD;
  if(!td||!window.THREE||!td.sc||!td.ct)return null;
  if(F3.td!==td||!F3.root||F3.root.parent!==td.sc){
    if(F3.root&&F3.root.parent)F3.root.parent.remove(F3.root);
    build3D(td);F3.mundo=null;
  }
  var src=(window.ESC&&ESC.mesas?ESC.mesas:null);
  if(F3.mundo!==td.mundo||F3.instSource!==src||F3.instImpactSource!==src)scanCoats(td);
  return td;
}
function frameAngle(s){
  var fr=s.frame;if(!fr||!fr.ang)return 0;
  var k=(window.SEL&&fr.ang[window.SEL]!=null)?window.SEL:(fr.ang.B2!=null?'B2':'BASE');
  return +fr.ang[k]||0;
}
function snowRetention(cm,deg,wind){
  var a=Math.min(89,Math.abs(deg))*Math.PI/180;
  var face=Math.pow(Math.max(0,Math.cos(a)),1.7);
  var slide=1-.78*clamp((Math.abs(deg)-23)/30,0,1);
  var scour=1-.25*clamp((wind-35)/80,0,1);
  return clamp(cm/12,0,1)*face*slide*scour;
}
function updateCoats(s){
  for(var i=0;i<F3.coats.length;i++){
    var q=F3.coats[i],deg=q.spin.rotation.x*180/Math.PI,r=snowRetention(s.snow,deg,s.wind);
    q.g.visible=s.snow>.15&&r>.012;q.mat.opacity=.10+.84*r;
  }
  if(F3.instSnow){
    var r2=snowRetention(s.snow,frameAngle(s),s.wind);
    F3.instSnow.visible=s.snow>.15&&r2>.012;F3.instSnow.material.opacity=.08+.70*r2;
    if(F3.instSource&&F3.instSnow.instanceMatrix!==F3.instSource.instanceMatrix)
      F3.instSnow.instanceMatrix=F3.instSource.instanceMatrix;
  }
}
function impactColour(mat,ratio){
  ratio=clamp(ratio,0,1);
  /* verde -> ámbar -> rojo. Solo codifica comparación geométrica, no daño. */
  var hue=(1-ratio)*.33;
  mat.color.setHSL(hue,.82,.52);
}
function updateImpactSurfaces(s,t){
  var severe=s.hailOn&&s.mm>0&&(s.watch||s.impact),rows=severe?impactRows(s):[];
  var by={},max=0;
  rows.forEach(function(q){by[q.k]=q;max=Math.max(max,q.impact_flux_proxy);});
  var pulse=s.impact?(0.86+0.14*Math.sin(t*.018)):0.48;
  F3.impactSkins.forEach(function(q){
    var r=by[q.k],ratio=(r&&max>1e-12)?r.impact_flux_proxy/max:0;
    var front=!!(r&&r.face==='FRONTAL'),rear=!!(r&&r.face==='TRASERA');
    q.front.visible=front;q.rear.visible=rear;
    if(r){impactColour(q.mat,ratio);q.mat.opacity=(.06+.34*ratio)*pulse;}
  });
  if(F3.instImpact){
    var E=window.ESC,fr=s.frame,k=(window.SEL&&fr&&fr.ang&&fr.ang[window.SEL]!=null)?window.SEL:
      (fr&&fr.ang&&fr.ang.B2!=null?'B2':'BASE');
    var rr=by[k]||rows[0],ratio2=(rr&&max>1e-12)?rr.impact_flux_proxy/max:0;
    var bands=!!(E&&E.bandas&&E.banda);
    F3.instImpact.visible=!!rr&&!bands;
    if(rr){impactColour(F3.instImpact.material,ratio2);F3.instImpact.material.opacity=(.05+.27*ratio2)*pulse;}
    if(F3.instImpactSource&&F3.instImpact.instanceMatrix!==F3.instImpactSource.instanceMatrix)
      F3.instImpact.instanceMatrix=F3.instImpactSource.instanceMatrix;
  }
}
function syncGround(td,s){
  if(!F3.ground)return;
  var g=F3.ground.obj;
  if(td.suelo){
    g.position.x=td.suelo.position.x;g.position.z=td.suelo.position.z;g.scale.copy(td.suelo.scale);
  }else{
    var R=clamp(td.radio||420,80,1200);g.scale.set(R*2.6,R*2.0,1);
  }
  F3.ground.mat.opacity=clamp(s.snow/18,0,.72);
  g.visible=F3.ground.mat.opacity>.01;
}
function updateWind3D(td,s,dt,t){
  var F=F3.wind,wv=worldWind(s.dir),R=clamp(td.radio||420,80,900),c=td.ct.target;
  var vw=Math.max(s.wind,s.gust||0),active=vw>2,n=Math.round(25+clamp(vw/110,0,1)*(MAX_WIND-25));
  F.obj.visible=active;F.mat.opacity=.08+clamp(vw/120,0,.30);
  if(!active)return;
  var speed=5+vw*.20,extraGust=clamp(((s.gust||0)-s.wind)/70,0,.38);
  for(var i=0;i<MAX_WIND;i++){
    var p=F.p[i],o=i*6;
    if(i<n){
      var gust=1+(.22+extraGust)*Math.sin(t*.005+p.phase)+(.08+extraGust*.35)*Math.sin(t*.013+p.phase*2.3);
      p.x+=wv.x*speed*dt*p.depth*gust;p.z+=wv.z*speed*dt*p.depth*gust;
      p.y+=Math.sin(t*.002+p.phase)*.18*dt;
      var dx=p.x-c.x,dz=p.z-c.z;
      if(Math.abs(dx)>R*1.25||Math.abs(dz)>R*.95||p.y<.5||p.y>clamp(R*.42,45,230))
        resetWorldParticle(p,'wind',td);
      var L=(7+s.wind*.18)*(0.5+p.depth);
      F.arr[o]=p.x;F.arr[o+1]=p.y;F.arr[o+2]=p.z;
      F.arr[o+3]=p.x-wv.x*L;F.arr[o+4]=p.y;F.arr[o+5]=p.z-wv.z*L;
    }else{
      F.arr[o]=F.arr[o+3]=1e6;F.arr[o+1]=F.arr[o+4]=1e6;F.arr[o+2]=F.arr[o+5]=1e6;
    }
  }
  F.obj.geometry.attributes.position.needsUpdate=true;
}
function updateSnow3D(td,s,dt,t){
  var F=F3.snow,wv=worldWind(s.dir),c=td.ct.target,R=clamp(td.radio||420,80,900);
  /* El input es ESPESOR, no precipitación. Cuando el espesor aumenta se muestra
     una nevada transitoria; si se mantiene, permanecen manto y nieve sobre la mesa
     pero los copos desaparecen. Así el render no inventa una tasa que no existe. */
  if(F3._lastSnow==null)F3._lastSnow=0;
  if(s.snow>F3._lastSnow+.05)F3._snowBurst=1;
  F3._lastSnow=s.snow;F3._snowBurst=(F3._snowBurst||0)*Math.exp(-dt/5.5);
  var fall=clamp(F3._snowBurst,0,1),active=s.snow>.05&&fall>.035,
      n=Math.round(clamp((.10+s.snow/18)*fall,.04,1)*MAX_SNOW);
  F.obj.visible=active;F.mat.opacity=(.48+clamp(s.snow/20,0,.34))*fall;F.mat.size=clamp(R/240,1.0,2.8);
  if(!active)return;
  for(var i=0;i<MAX_SNOW;i++){
    var p=F.p[i],o=i*3;
    if(i<n){
      var air=Math.max(s.wind,(s.gust||0)*.7),drift=(.6+air*.045)*(0.4+p.depth);
      p.x+=wv.x*drift*dt+Math.sin(t*.0017+p.phase)*.22*dt;
      p.z+=wv.z*drift*dt+Math.cos(t*.0013+p.phase)*.16*dt;
      p.y-=p.fall*dt*(.55+p.depth*.45);
      if(p.y<.05||Math.abs(p.x-c.x)>R*1.3||Math.abs(p.z-c.z)>R){
        resetWorldParticle(p,'snow',td);p.y=clamp(R*.30,35,180)+rnd()*clamp(R*.18,20,100);
      }
      F.arr[o]=p.x;F.arr[o+1]=p.y;F.arr[o+2]=p.z;
    }else F.arr[o]=F.arr[o+1]=F.arr[o+2]=1e6;
  }
  F.obj.geometry.attributes.position.needsUpdate=true;
}
function updateHail3D(td,s,dt){
  var F=F3.hail,wv=worldWind(isFinite(s.hailDir)?s.hailDir:s.dir),c=td.ct.target,R=clamp(td.radio||420,80,900);
  var sev=clamp((s.mm-8)/42,.12,1),active=!!s.impact,n=Math.round((.20+.80*sev)*MAX_HAIL);
  if(F3.hailArrow){
    var show=s.hailOn&&s.mm>0&&(s.watch||s.impact),
        hv=hailVelocity(s.mm,Math.max(s.wind,s.gust||0),isFinite(s.hailDir)?s.hailDir:s.dir);
    F3.hailArrow.visible=show;
    if(show){
      var vd=new THREE.Vector3(hv.x,hv.y,hv.z).normalize();
      F3.hailArrow.position.set(c.x,c.y+clamp(R*.18,28,110),c.z);
      F3.hailArrow.setDirection(vd);
      var L=clamp(22+s.mm*.7,28,70);F3.hailArrow.setLength(L,L*.18,L*.09);
      var op=s.impact?.95:.38;
      if(F3.hailArrow.line&&F3.hailArrow.line.material)F3.hailArrow.line.material.opacity=op;
      if(F3.hailArrow.cone&&F3.hailArrow.cone.material)F3.hailArrow.cone.material.opacity=op;
    }
  }
  F.obj.visible=active;F.mat.size=clamp(.65+s.mm/18,.9,3.8);F.mat.opacity=.86;
  if(!active)return;
  var hvNow=hailVelocity(s.mm,Math.max(s.wind,s.gust||0),isFinite(s.hailDir)?s.hailDir:s.dir);
  for(var i=0;i<MAX_HAIL;i++){
    var p=F.p[i],o=i*3;
    if(i<n){
      /* La partícula visual usa EXACTAMENTE el mismo vector que el cálculo de
         incidencia y la flecha: velocidad terminal vertical + viento horizontal.
         Se supone ya en régimen terminal; no se integra una segunda gravedad. */
      p.x+=hvNow.x*dt;
      p.z+=hvNow.z*dt;
      p.y+=hvNow.y*dt;
      if(p.y<.04){
        resetWorldParticle(p,'hail',td);p.y=clamp(R*.36,45,210)+rnd()*clamp(R*.15,15,80);
      }
      if(Math.abs(p.x-c.x)>R*1.35||Math.abs(p.z-c.z)>R)
        resetWorldParticle(p,'hail',td);
      F.arr[o]=p.x;F.arr[o+1]=p.y;F.arr[o+2]=p.z;
    }else F.arr[o]=F.arr[o+1]=F.arr[o+2]=1e6;
  }
  F.obj.geometry.attributes.position.needsUpdate=true;
}
function updateDust3D(td,s,dt,t){
  var F=F3.dust,wv=worldWind(s.dir),c=td.ct.target,R=clamp(td.radio||420,80,900);
  var vw=Math.max(s.wind,s.gust||0),strength=clamp((vw-38)/70,0,1)*(s.snow>.1?0.12:1)*(s.impact?0.35:1);
  var n=Math.round(strength*MAX_DUST);F.obj.visible=n>4;F.mat.opacity=.28*strength;F.mat.size=clamp(R/360,.8,2.2);
  if(n<=4)return;
  for(var i=0;i<MAX_DUST;i++){
    var p=F.p[i],o=i*3;
    if(i<n){
      p.x+=wv.x*(5+vw*.10)*dt;p.z+=wv.z*(5+vw*.10)*dt;
      p.y+=Math.sin(t*.002+p.phase)*p.lift*dt*.35;
      if(p.y<.15)p.y=.15;
      if(Math.abs(p.x-c.x)>R*1.2||Math.abs(p.z-c.z)>R*.9)resetWorldParticle(p,'dust',td);
      F.arr[o]=p.x;F.arr[o+1]=p.y;F.arr[o+2]=p.z;
    }else F.arr[o]=F.arr[o+1]=F.arr[o+2]=1e6;
  }
  F.obj.geometry.attributes.position.needsUpdate=true;
}
function updateFog(td,s){
  if(!td.sc.fog||F3.baseFogFar==null)return;
  var storm=clamp((s.wind-45)/100,0,.35)+(s.watch?.22:0)+(s.impact?.42:0)+(s.snow>0?.12:0);
  td.sc.fog.near=F3.baseFogNear*(1-.30*clamp(storm,0,.7));
  td.sc.fog.far=F3.baseFogFar*(1-.52*clamp(storm,0,.85));
}
function updateCloud3D(td,s,dt,t){
  if(!F3.clouds)return;
  var severity=clamp((Math.max(s.wind,s.gust||0)-30)/100,0,.28)+(s.watch?.38:0)+(s.impact?.48:0)+(s.snow>0?.22:0);
  severity=clamp(severity,0,.88);F3.clouds.obj.visible=severity>.025;
  if(severity<=.025)return;
  var wv=worldWind(s.dir),R=clamp(td.radio||420,80,900),cen=td.ct.target,spd=.6+Math.max(s.wind,s.gust||0)*.018;
  F3.clouds.p.forEach(function(sp,i){
    sp.material.opacity=clamp(.10+severity*(.34+.05*(i%4)),.08,.72);
    sp.position.x+=wv.x*spd*dt;sp.position.z+=wv.z*spd*dt;
    sp.position.y=sp.userData.baseY+Math.sin(t*.00022+sp.userData.phase)*clamp(R*.012,1.5,7);
    if(Math.abs(sp.position.x-cen.x)>R*1.45||Math.abs(sp.position.z-cen.z)>R*1.08)resetCloud(sp,td);
  });
}
function update3D(s,dt,t){
  var td=bind3D();if(!td)return;
  syncGround(td,s);updateCoats(s);updateImpactSurfaces(s,t);updateCloud3D(td,s,dt,t);updateWind3D(td,s,dt,t);updateSnow3D(td,s,dt,t);
  updateHail3D(td,s,dt);updateDust3D(td,s,dt,t);updateFog(td,s);
}

var LAST_STATE=null;
window.__simVientoMeteoFx={
  version:8,
  impact:impactMetrics,
  trajectory:hailVelocity,
  cumulativeImpact:impactCumulative,
  impactEnvelope:impactEnvelope,
  reference:Object.assign({},IMPACT_REF),
  snapshot:function(){
    return {
      bound:!!(F3.td&&F3.root&&F3.root.parent),
      frameSource:window.__simVientoMeteoFrame?'shared':'fallback',
      windVisible:!!(F3.wind&&F3.wind.obj.visible),
      snowVisible:!!(F3.snow&&F3.snow.obj.visible),
      hailVisible:!!(F3.hail&&F3.hail.obj.visible),
      dustVisible:!!(F3.dust&&F3.dust.obj.visible),
      snowGround:F3.ground?+F3.ground.mat.opacity.toFixed(3):0,
      snowCoats:F3.coats.length,
      instancedSnow:!!F3.instSnow,
      impactSkins:F3.impactSkins.length,
      impactSurfaceVisible:F3.impactSkins.some(function(q){return q.front.visible||q.rear.visible;})||!!(F3.instImpact&&F3.instImpact.visible),
      impactFaces:F3.impactSkins.reduce(function(o,q){
        if(q.front.visible)o[q.k]='FRONTAL';else if(q.rear.visible)o[q.k]='TRASERA';return o;
      },{}),
      state:LAST_STATE?{wind:LAST_STATE.wind,dir:LAST_STATE.dir,snow:LAST_STATE.snow,
        impact:LAST_STATE.impact,mm:LAST_STATE.mm,watch:LAST_STATE.watch}:null
    };
  }
};

function frame(now){
  requestAnimationFrame(frame);resize();
  var dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
  x.clearRect(0,0,W,H);
  var s=state();LAST_STATE=s;
  atmosphere(s,now);cloudsDraw(s,now);update3D(s,dt,now);updateImpactHud(s);
}
requestAnimationFrame(frame);
})();