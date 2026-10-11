/* ==========================================================================
   sim-viento-meteo.js
   Capa VISUAL de meteorología para sim-viento.html.

   No decide ninguna estrategia y no modifica el motor. Recibe el estado que ya
   calculó el simulador y lo hace visible como un campo meteorológico espacial:
   viento con rachas, nieve con deriva/acumulación y célula de granizo que se
   aproxima e impacta. Si esta capa falla, la simulación sigue funcionando.
   ========================================================================== */
(function(global){
'use strict';

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function mix(a,b,t){ return a+(b-a)*t; }
function mod(v,m){ return ((v%m)+m)%m; }
function finite(v,d){ v=+v; return isFinite(v)?v:d; }

function rng(seed){
  var x=(seed>>>0)||0x51f15e5d;
  return function(){
    x^=x<<13; x>>>=0; x^=x>>>17; x^=x<<5; x>>>=0;
    return x/4294967296;
  };
}
function roundTexture(T,inner,outer){
  var cv=document.createElement('canvas'); cv.width=cv.height=96;
  var c=cv.getContext('2d'),g=c.createRadialGradient(48,48,2,48,48,46);
  g.addColorStop(0,inner); g.addColorStop(.34,inner);
  g.addColorStop(.72,outer); g.addColorStop(1,'rgba(255,255,255,0)');
  c.fillStyle=g;c.fillRect(0,0,96,96);
  var tx=new T.CanvasTexture(cv);tx.minFilter=T.LinearFilter;tx.magFilter=T.LinearFilter;
  return tx;
}
function cloudTexture(T){
  var cv=document.createElement('canvas');cv.width=256;cv.height=160;
  var c=cv.getContext('2d'),r=rng(0xC10D5);
  c.clearRect(0,0,cv.width,cv.height);
  for(var i=0;i<28;i++){
    var x=32+r()*192,y=45+r()*75,rx=22+r()*50,ry=14+r()*30;
    var g=c.createRadialGradient(x,y,2,x,y,rx);
    g.addColorStop(0,'rgba(255,255,255,'+(0.22+r()*.30).toFixed(2)+')');
    g.addColorStop(.55,'rgba(235,241,246,'+(0.12+r()*.17).toFixed(2)+')');
    g.addColorStop(1,'rgba(255,255,255,0)');
    c.save();c.translate(x,y);c.scale(1,ry/rx);c.translate(-x,-y);
    c.fillStyle=g;c.fillRect(x-rx,y-rx,rx*2,rx*2);c.restore();
  }
  var tx=new T.CanvasTexture(cv);tx.minFilter=T.LinearFilter;tx.magFilter=T.LinearFilter;
  return tx;
}
function snowGroundTexture(T){
  var cv=document.createElement('canvas');cv.width=cv.height=256;
  var c=cv.getContext('2d'),im=c.createImageData(256,256),r=rng(0x5A0A);
  for(var y=0;y<256;y++)for(var x=0;x<256;x++){
    var i=(y*256+x)*4;
    var wave=.5+.18*Math.sin(x*.075)+.13*Math.sin(y*.049)+.08*Math.sin((x+y)*.031);
    var n=clamp(wave+(r()-.5)*.34,0,1);
    im.data[i]=238;im.data[i+1]=244;im.data[i+2]=248;im.data[i+3]=Math.round(255*n);
  }
  c.putImageData(im,0,0);
  var tx=new T.CanvasTexture(cv);
  tx.wrapS=tx.wrapT=T.RepeatWrapping;tx.repeat.set(5,5);
  tx.minFilter=T.LinearMipMapLinearFilter;tx.magFilter=T.LinearFilter;
  return tx;
}

function MeteoFX(opt){
  opt=opt||{};
  this.T=opt.THREE;
  this.scene=opt.scene;
  this.renderer=opt.renderer;
  this.camera=opt.camera;
  this.sun=opt.sun||null;
  this.hemi=opt.hemi||null;
  if(!this.T||!this.scene)throw new Error('MeteoFX necesita THREE y scene');

  this.center=new this.T.Vector3();
  this.radius=220;
  this.height=70;
  this.time=0;
  this.lightFactor=1;
  this.hemiFactor=1;
  this.state={
    windKmh:0,gustKmh:0,windDirDeg:270,
    snowCm:0,
    hailKnown:true,hailOn:false,hailGate:false,hailPhase:'SIN SEÑAL',
    hailMm:0,hailProb:0,hailEtaMin:null,hailDirDeg:270
  };
  this.root=new this.T.Group();
  this.root.name='meteo-fx';
  this.scene.add(this.root);
  this.reduced=!!(global.matchMedia&&global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  this.quality=(global.innerWidth&&global.innerWidth<650)?0.62:1;

  this._buildWind();
  this._buildDust();
  this._buildSnow();
  this._buildClouds();
  this._buildHail();
  this._buildGround();
  this.setBounds(this.center,this.radius);
}
MeteoFX.prototype._buildWind=function(){
  var T=this.T,N=Math.round((this.reduced?90:340)*this.quality),r=rng(0xA11CE);
  this.windSeed=new Float32Array(N*4);
  for(var i=0;i<N;i++){
    this.windSeed[i*4]=r()*2.4-1.2;
    this.windSeed[i*4+1]=r()*2-1;
    this.windSeed[i*4+2]=r();
    this.windSeed[i*4+3]=r()*Math.PI*2;
  }
  var pos=new Float32Array(N*6);
  var g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));
  var m=new T.LineBasicMaterial({color:0x99cfff,transparent:true,opacity:0,depthWrite:false});
  this.windLines=new T.LineSegments(g,m);this.windLines.frustumCulled=false;
  this.windLines.renderOrder=5;this.root.add(this.windLines);
};
MeteoFX.prototype._buildDust=function(){
  var T=this.T,N=Math.round((this.reduced?35:130)*this.quality),r=rng(0xD057);
  this.dustSeed=new Float32Array(N*4);
  for(var i=0;i<N;i++){
    this.dustSeed[i*4]=r()*2.2-1.1;
    this.dustSeed[i*4+1]=r()*2-1;
    this.dustSeed[i*4+2]=r();
    this.dustSeed[i*4+3]=r()*Math.PI*2;
  }
  var g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(N*3),3));
  var m=new T.PointsMaterial({color:0xb9aa92,size:1.4,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true});
  this.dust=new T.Points(g,m);this.dust.frustumCulled=false;this.dust.renderOrder=4;this.root.add(this.dust);
};
MeteoFX.prototype._buildSnow=function(){
  var T=this.T,N=Math.round((this.reduced?120:520)*this.quality),r=rng(0x5A0F);
  this.snowSeed=new Float32Array(N*5);
  for(var i=0;i<N;i++){
    this.snowSeed[i*5]=r()*2-1;
    this.snowSeed[i*5+1]=r()*2-1;
    this.snowSeed[i*5+2]=r();
    this.snowSeed[i*5+3]=.55+r()*.9;
    this.snowSeed[i*5+4]=r()*Math.PI*2;
  }
  var g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(N*3),3));
  var m=new T.PointsMaterial({map:roundTexture(T,'rgba(255,255,255,1)','rgba(235,245,255,.38)'),
    color:0xf4f9ff,size:1.35,transparent:true,opacity:0,depthWrite:false,alphaTest:.03,sizeAttenuation:true});
  this.snow=new T.Points(g,m);this.snow.frustumCulled=false;this.snow.renderOrder=8;this.root.add(this.snow);
};
MeteoFX.prototype._buildClouds=function(){
  var T=this.T,r=rng(0xC10DD);
  this.cloudMat=new T.SpriteMaterial({map:cloudTexture(T),color:0x657180,transparent:true,opacity:0,depthWrite:false,depthTest:true});
  this.clouds=new T.Group();
  this.cloudSprites=[];
  for(var i=0;i<22;i++){
    var sp=new T.Sprite(this.cloudMat);
    sp.position.set((r()-.5)*1.45,(r()-.5)*.26,(r()-.5)*.85);
    sp.userData.scale=.55+r()*.95;
    this.clouds.add(sp);this.cloudSprites.push(sp);
  }
  this.clouds.visible=false;this.root.add(this.clouds);
};
MeteoFX.prototype._buildHail=function(){
  var T=this.T,N=Math.round((this.reduced?140:560)*this.quality),r=rng(0xA411);
  this.hailSeed=new Float32Array(N*5);
  for(var i=0;i<N;i++){
    this.hailSeed[i*5]=r()*2-1;
    this.hailSeed[i*5+1]=r()*2-1;
    this.hailSeed[i*5+2]=r();
    this.hailSeed[i*5+3]=.75+r()*.7;
    this.hailSeed[i*5+4]=r()*Math.PI*2;
  }
  var g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(N*3),3));
  var m=new T.PointsMaterial({map:roundTexture(T,'rgba(238,249,255,1)','rgba(188,220,240,.45)'),
    color:0xeaf6ff,size:1.1,transparent:true,opacity:0,depthWrite:false,alphaTest:.06,sizeAttenuation:true});
  this.hail=new T.Points(g,m);this.hail.frustumCulled=false;this.hail.renderOrder=9;this.root.add(this.hail);
};
MeteoFX.prototype._buildGround=function(){
  var T=this.T,geo=new T.PlaneGeometry(2,2);
  var mat=new T.MeshLambertMaterial({map:snowGroundTexture(T),color:0xf3f7f9,transparent:true,opacity:0,
    depthWrite:false,side:T.DoubleSide});
  this.snowGround=new T.Mesh(geo,mat);this.snowGround.rotation.x=-Math.PI/2;
  this.snowGround.position.y=.025;this.snowGround.renderOrder=2;this.root.add(this.snowGround);
};
MeteoFX.prototype.setBounds=function(center,radius){
  if(center&&center.isVector3)this.center.copy(center);
  else if(center&&center.length>=3)this.center.set(+center[0]||0,+center[1]||0,+center[2]||0);
  this.radius=clamp(finite(radius,220),70,1800);
  this.height=clamp(this.radius*.24,55,300);
  this.snowGround.position.x=this.center.x;this.snowGround.position.z=this.center.z;
  this.snowGround.scale.set(this.radius*1.25,this.radius*1.25,1);
  var cloudW=clamp(this.radius*.36,70,470),cloudH=clamp(this.radius*.16,32,210);
  for(var i=0;i<this.cloudSprites.length;i++){
    var q=this.cloudSprites[i],s=q.userData.scale||1;
    q.scale.set(cloudW*s,cloudH*s,1);
  }
  if(this.scene.fog){
    this.fogBaseNear=this.scene.fog.near;
    this.fogBaseFar=this.scene.fog.far;
  }
  this._collectPanels();
  this._applyPanelSnow(clamp(this.state.snowCm/22,0,1));
};
MeteoFX.prototype._collectPanels=function(){
  var out=[],seen={};
  this.scene.traverse(function(o){
    var ms=[];
    if(o.material)ms=Array.isArray(o.material)?o.material:[o.material];
    ms.forEach(function(m){
      if(!m||!m.isMeshStandardMaterial||seen[m.uuid])return;
      var rough=finite(m.roughness,-9),metal=finite(m.metalness,-9);
      if(Math.abs(rough-.35)>.065||Math.abs(metal-.25)>.09)return;
      seen[m.uuid]=1;
      if(!m.userData)m.userData={};
      if(!m.userData.meteoFxBase)m.userData.meteoFxBase={
        color:m.color.clone(),roughness:m.roughness,metalness:m.metalness
      };
      out.push(m);
    });
  });
  this.panelMats=out;
};
MeteoFX.prototype._applyPanelSnow=function(frac){
  var T=this.T,w=new T.Color(0xe9f0f3),f=clamp(frac,0,1);
  (this.panelMats||[]).forEach(function(m){
    var b=m.userData&&m.userData.meteoFxBase;if(!b)return;
    m.color.copy(b.color).lerp(w,f*.82);
    m.roughness=mix(b.roughness,.82,f*.70);
    m.metalness=mix(b.metalness,.04,f*.72);
    m.needsUpdate=true;
  });
};
MeteoFX.prototype._applyLight=function(storm){
  var fac=clamp(1-.42*storm,.50,1),hfac=mix(1,.78,storm);
  if(this.sun){
    var raw=this.sun.intensity/(this.lightFactor||1);
    this.sun.intensity=raw*fac;
  }
  if(this.hemi){
    var rawH=this.hemi.intensity/(this.hemiFactor||1);
    this.hemi.intensity=rawH*hfac;
  }
  this.lightFactor=fac;this.hemiFactor=hfac;
};
MeteoFX.prototype.setWeather=function(s){
  s=s||{};var q=this.state;
  q.windKmh=Math.max(0,finite(s.windKmh,q.windKmh));
  q.gustKmh=Math.max(q.windKmh,finite(s.gustKmh,q.windKmh));
  q.windDirDeg=mod(finite(s.windDirDeg,q.windDirDeg),360);
  q.snowCm=Math.max(0,finite(s.snowCm,0));
  q.hailKnown=s.hailKnown!==false;
  q.hailOn=!!s.hailOn;q.hailGate=!!s.hailGate;
  q.hailPhase=s.hailPhase||'SIN SEÑAL';
  q.hailMm=Math.max(0,finite(s.hailMm,0));
  q.hailProb=clamp(finite(s.hailProb,0),0,100);
  q.hailEtaMin=(s.hailEtaMin==null?null:Math.max(0,finite(s.hailEtaMin,0)));
  q.hailDirDeg=mod(finite(s.hailDirDeg,q.windDirDeg),360);

  var snowI=clamp(q.snowCm/22,0,1);
  var hailI=(q.hailKnown&&q.hailOn&&q.hailGate)?clamp((q.hailMm-12)/38*.65+q.hailProb/100*.55,0,1):0;
  if(q.hailPhase==='IMPACTO')hailI=clamp(hailI+.28,0,1);
  if(q.hailPhase==='RETENCION')hailI*=.35;
  this.snowI=snowI;this.hailI=hailI;
  this._applyPanelSnow(snowI);

  this.snow.material.opacity=snowI?mix(.32,.92,snowI):0;
  this.snow.visible=snowI>.01;
  this.snow.material.size=clamp(this.radius*.0042,1.0,5.0)*mix(.72,1.15,snowI);
  this.snowGround.material.opacity=snowI*.62;
  this.snowGround.visible=snowI>.015;

  var impact=q.hailPhase==='IMPACTO';
  var distant=hailI>.01&&(q.hailPhase==='VIGILANCIA'||q.hailPhase==='DEFENSA');
  this.hail.visible=impact||distant;
  this.hail.material.opacity=impact?mix(.55,.97,hailI):mix(.12,.32,hailI);
  this.hail.material.size=clamp(this.radius*.0028*(.55+q.hailMm/22),.7,6.5);

  var cloudI=Math.max(snowI*.72,hailI);
  this.clouds.visible=cloudI>.015;
  this.cloudMat.opacity=clamp(.16+cloudI*.68,0,.86);
  this.cloudMat.color.setHex(hailI>snowI?0x4c5665:0x7d8996);

  var storm=clamp(Math.max(hailI,snowI*.72),0,1);
  this._applyLight(storm);
  if(this.scene.fog&&this.fogBaseFar){
    this.scene.fog.near=mix(this.fogBaseNear,this.fogBaseNear*.66,storm);
    this.scene.fog.far=mix(this.fogBaseFar,this.fogBaseFar*.58,storm);
  }
};
MeteoFX.prototype._basis=function(deg){
  var a=deg*Math.PI/180;
  return {dx:-Math.sin(a),dz:Math.cos(a),cx:-Math.cos(a),cz:-Math.sin(a)};
};
MeteoFX.prototype._tickWind=function(){
  var q=this.state,spd=q.windKmh,g=Math.max(0,q.gustKmh-q.windKmh);
  var I=clamp(spd/75,0,1),G=clamp(g/55,0,1),b=this._basis(q.windDirDeg);
  this.windLines.visible=spd>1.5;
  this.windLines.material.opacity=this.windLines.visible?(.10+.58*I):0;
  this.windLines.material.color.setHex(spd>=60?0xc8e7ff:0x8ecbff);
  var a=this.windLines.geometry.getAttribute('position').array,N=this.windSeed.length/4;
  var adv=this.time*(.08+.18*I),R=this.radius,H=clamp(R*.095,18,85);
  for(var i=0;i<N;i++){
    var u=mod(this.windSeed[i*4]+adv*(.72+.5*Math.sin(this.windSeed[i*4+3])),2.4)-1.2;
    var v=this.windSeed[i*4+1],yy=this.windSeed[i*4+2];
    var pulse=.60+.40*Math.sin(this.time*(1.1+G*2.2)+this.windSeed[i*4+3]+v*4);
    var len=R*(.018+.055*I)*(.55+.75*pulse);
    var turb=R*.018*G*Math.sin(this.time*2.1+this.windSeed[i*4+3]);
    var x=this.center.x+b.dx*u*R+b.cx*(v*R*.95+turb);
    var z=this.center.z+b.dz*u*R+b.cz*(v*R*.95+turb);
    var y=.8+yy*H+2*Math.sin(this.time*1.7+this.windSeed[i*4+3]);
    var k=i*6;
    a[k]=x;a[k+1]=y;a[k+2]=z;
    a[k+3]=x-b.dx*len;a[k+4]=y-.08*len/R*H;a[k+5]=z-b.dz*len;
  }
  this.windLines.geometry.getAttribute('position').needsUpdate=true;
};
MeteoFX.prototype._tickDust=function(){
  var q=this.state,show=q.windKmh>28&&this.snowI<.08&&this.hailI<.65;
  this.dust.visible=show;if(!show)return;
  var I=clamp((q.windKmh-28)/65,0,1),b=this._basis(q.windDirDeg);
  this.dust.material.opacity=.08+.32*I;this.dust.material.size=clamp(this.radius*.003,1.1,5);
  var a=this.dust.geometry.getAttribute('position').array,N=this.dustSeed.length/4,R=this.radius;
  for(var i=0;i<N;i++){
    var u=mod(this.dustSeed[i*4]+this.time*(.16+.26*I),2.2)-1.1;
    var v=this.dustSeed[i*4+1],lift=this.dustSeed[i*4+2];
    var x=this.center.x+b.dx*u*R+b.cx*v*R*.9;
    var z=this.center.z+b.dz*u*R+b.cz*v*R*.9;
    var y=.25+lift*(1.4+5*I)*(.4+.6*Math.abs(Math.sin(this.time*1.9+this.dustSeed[i*4+3])));
    a[i*3]=x;a[i*3+1]=y;a[i*3+2]=z;
  }
  this.dust.geometry.getAttribute('position').needsUpdate=true;
};
MeteoFX.prototype._tickSnow=function(){
  if(!this.snow.visible)return;
  var q=this.state,b=this._basis(q.windDirDeg),a=this.snow.geometry.getAttribute('position').array;
  var N=this.snowSeed.length/5,R=this.radius,H=this.height,drift=clamp(q.windKmh/55,0,1);
  for(var i=0;i<N;i++){
    var sx=this.snowSeed[i*5],sz=this.snowSeed[i*5+1],sy=this.snowSeed[i*5+2],
        fall=this.snowSeed[i*5+3],ph=this.snowSeed[i*5+4];
    var y=2+mod(sy*H-this.time*(5.2+5.5*this.snowI)*fall,H);
    var travelled=(H-(y-2))/H;
    var sway=Math.sin(this.time*(.7+fall*.3)+ph)*R*.016;
    var x=this.center.x+sx*R*.98+b.dx*travelled*R*.30*drift+b.cx*sway;
    var z=this.center.z+sz*R*.98+b.dz*travelled*R*.30*drift+b.cz*sway;
    a[i*3]=x;a[i*3+1]=y;a[i*3+2]=z;
  }
  this.snow.geometry.getAttribute('position').needsUpdate=true;
};
MeteoFX.prototype._cloudCenter=function(){
  var q=this.state,dir=(this.hailI>.01?q.hailDirDeg:q.windDirDeg),a=dir*Math.PI/180;
  var eta=q.hailEtaMin==null?0:q.hailEtaMin;
  var dist=this.hailI>.01?this.radius*clamp(eta/55,0,1.75):0;
  return {
    x:this.center.x+Math.sin(a)*dist,
    z:this.center.z-Math.cos(a)*dist,
    y:clamp(this.radius*.20,45,260)
  };
};
MeteoFX.prototype._tickClouds=function(){
  if(!this.clouds.visible)return;
  var c=this._cloudCenter();
  this.clouds.position.set(c.x,c.y,c.z);
  var drift=this.radius*.014*Math.sin(this.time*.16);
  this.clouds.position.x+=drift;
  this.clouds.rotation.y=.05*Math.sin(this.time*.09);
};
MeteoFX.prototype._tickHail=function(){
  if(!this.hail.visible)return;
  var q=this.state,b=this._basis(q.hailDirDeg),a=this.hail.geometry.getAttribute('position').array;
  var N=this.hailSeed.length/5,R=this.radius,H=this.height;
  var impact=q.hailPhase==='IMPACTO',c=impact?{x:this.center.x,z:this.center.z}:this._cloudCenter();
  var spread=impact?R*.95:R*.34,fallSpeed=impact?mix(30,62,clamp(q.hailMm/55,0,1)):24;
  var windDrift=clamp(q.windKmh/80,0,1);
  for(var i=0;i<N;i++){
    var sx=this.hailSeed[i*5],sz=this.hailSeed[i*5+1],sy=this.hailSeed[i*5+2],
        fall=this.hailSeed[i*5+3],ph=this.hailSeed[i*5+4];
    var y=1.3+mod(sy*H-this.time*fallSpeed*fall,H);
    var travelled=(H-(y-1.3))/H;
    var jitter=Math.sin(this.time*4.0+ph)*spread*.012;
    var x=c.x+sx*spread+b.dx*travelled*R*.22*windDrift+b.cx*jitter;
    var z=c.z+sz*spread+b.dz*travelled*R*.22*windDrift+b.cz*jitter;
    a[i*3]=x;a[i*3+1]=y;a[i*3+2]=z;
  }
  this.hail.geometry.getAttribute('position').needsUpdate=true;
};
MeteoFX.prototype.tick=function(dt){
  dt=Math.max(0,Math.min(.12,finite(dt,0)));
  this.time+=dt;
  this._tickWind();this._tickDust();this._tickSnow();this._tickClouds();this._tickHail();
};
MeteoFX.prototype.dispose=function(){
  this._applyPanelSnow(0);
  if(this.root&&this.root.parent)this.root.parent.remove(this.root);
  this.root.traverse(function(o){
    if(o.geometry&&o.geometry.dispose)o.geometry.dispose();
    if(o.material){
      var a=Array.isArray(o.material)?o.material:[o.material];
      a.forEach(function(m){if(m&&m.dispose)m.dispose();});
    }
  });
};
global.MeteoFX=MeteoFX;
})(typeof window!=='undefined'?window:this);
