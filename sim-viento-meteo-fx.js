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

var style=document.createElement('style');
style.textContent=
  '#view3d .hailfx{display:none!important}'+
  '#view3d.mfx-storm{box-shadow:inset 0 0 100px rgba(8,13,21,.46)}'+
  '#view3d.mfx-snow{box-shadow:inset 0 -22px 65px rgba(226,237,246,.16)}'+
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
var F3={td:null,root:null,mundo:null,wind:null,snow:null,hail:null,dust:null,ground:null,
        coats:[],instSnow:null,instSource:null,baseFogNear:null,baseFogFar:null};
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
  F3.dust=makePoints(MAX_DUST,0xb9a27a,1.2,.0);root.add(F3.dust.obj);
  for(i=0;i<MAX_SNOW;i++)F3.snow.p[i]=resetWorldParticle({},'snow',td);
  for(i=0;i<MAX_HAIL;i++)F3.hail.p[i]=resetWorldParticle({},'hail',td);
  for(i=0;i<MAX_DUST;i++)F3.dust.p[i]=resetWorldParticle({},'dust',td);

  /* Manto de nieve en el terreno con textura irregular. */
  var gm=new THREE.MeshBasicMaterial({map:groundSnowTexture(),transparent:true,opacity:0,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  var gg=new THREE.Mesh(new THREE.PlaneGeometry(1,1),gm);gg.rotation.x=-Math.PI/2;gg.position.y=.035;gg.renderOrder=3;
  root.add(gg);F3.ground={obj:gg,mat:gm};

  F3.wind.obj.frustumCulled=F3.snow.obj.frustumCulled=F3.hail.obj.frustumCulled=F3.dust.obj.frustumCulled=false;
}
function disposeInstSnow(){
  if(F3.instSnow&&F3.instSnow.parent)F3.instSnow.parent.remove(F3.instSnow);
  if(F3.instSnow&&F3.instSnow.material)F3.instSnow.material.dispose();
  F3.instSnow=null;F3.instSource=null;
}
function scanCoats(td){
  F3.coats=[];disposeInstSnow();F3.mundo=td.mundo;
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
}
function bind3D(){
  var td=window.TD;
  if(!td||!window.THREE||!td.sc||!td.ct)return null;
  if(F3.td!==td||!F3.root||F3.root.parent!==td.sc){
    if(F3.root&&F3.root.parent)F3.root.parent.remove(F3.root);
    build3D(td);F3.mundo=null;
  }
  if(F3.mundo!==td.mundo||F3.instSource!==(window.ESC&&ESC.mesas?ESC.mesas:null))scanCoats(td);
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
  var active=s.wind>2,n=Math.round(25+clamp(s.wind/110,0,1)*(MAX_WIND-25));
  F.obj.visible=active;F.mat.opacity=.08+clamp(s.wind/120,0,.30);
  if(!active)return;
  var speed=5+s.wind*.20;
  for(var i=0;i<MAX_WIND;i++){
    var p=F.p[i],o=i*6;
    if(i<n){
      var gust=1+.22*Math.sin(t*.005+p.phase)+.08*Math.sin(t*.013+p.phase*2.3);
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
  var active=s.snow>.05,n=Math.round(clamp(.12+s.snow/18,.12,1)*MAX_SNOW);
  F.obj.visible=active;F.mat.opacity=.55+clamp(s.snow/20,0,.35);F.mat.size=clamp(R/240,1.0,2.8);
  if(!active)return;
  for(var i=0;i<MAX_SNOW;i++){
    var p=F.p[i],o=i*3;
    if(i<n){
      var drift=(.6+s.wind*.045)*(0.4+p.depth);
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
  F.obj.visible=active;F.mat.size=clamp(.65+s.mm/18,.9,3.8);F.mat.opacity=.86;
  if(!active)return;
  var windMs=s.wind/3.6;
  for(var i=0;i<MAX_HAIL;i++){
    var p=F.p[i],o=i*3;
    if(i<n){
      /* La componente horizontal viene del aire; la vertical domina. No es un solver
         balístico: solo respeta la dirección y la relación de escalas. */
      p.x+=wv.x*windMs*.50*dt*(.6+p.depth*.4);
      p.z+=wv.z*windMs*.50*dt*(.6+p.depth*.4);
      p.vy+=9.81*dt*.35;p.y-=p.vy*dt;
      if(p.y<.04){
        if(p.bounce<1&&p.vy>24){p.y=.05;p.vy=-p.vy*(.07+.08*rnd());p.bounce++;}
        else {resetWorldParticle(p,'hail',td);p.y=clamp(R*.36,45,210)+rnd()*clamp(R*.15,15,80);}
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
  var strength=clamp((s.wind-38)/70,0,1)*(s.snow>.1?0.12:1)*(s.impact?0.35:1);
  var n=Math.round(strength*MAX_DUST);F.obj.visible=n>4;F.mat.opacity=.28*strength;F.mat.size=clamp(R/360,.8,2.2);
  if(n<=4)return;
  for(var i=0;i<MAX_DUST;i++){
    var p=F.p[i],o=i*3;
    if(i<n){
      p.x+=wv.x*(5+s.wind*.10)*dt;p.z+=wv.z*(5+s.wind*.10)*dt;
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
function update3D(s,dt,t){
  var td=bind3D();if(!td)return;
  syncGround(td,s);updateCoats(s);updateWind3D(td,s,dt,t);updateSnow3D(td,s,dt,t);
  updateHail3D(td,s,dt);updateDust3D(td,s,dt,t);updateFog(td,s);
}

var LAST_STATE=null;
window.__simVientoMeteoFx={
  version:2,
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
  atmosphere(s,now);cloudsDraw(s,now);update3D(s,dt,now);
}
requestAnimationFrame(frame);
})();