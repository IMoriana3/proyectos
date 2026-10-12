/* sim-viento-meteo-fx.js
 * Capa visual meteorológica para sim-viento.html.
 * No altera física, estados, consignas ni umbrales: solo observa la UI existente
 * y representa viento, nieve y granizo sobre la misma escena 3D.
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
Object.assign(shade.style,{position:'absolute',inset:'0',zIndex:'5',pointerEvents:'none',transition:'background .35s,box-shadow .35s'});
host.appendChild(shade);

var style=document.createElement('style');
style.textContent=
  '#view3d .hailfx{display:none!important}'+
  '#view3d.mfx-storm{box-shadow:inset 0 0 90px rgba(8,13,21,.42)}'+
  '#view3d.mfx-snow{box-shadow:inset 0 -18px 55px rgba(226,237,246,.12)}'+
  '@media(prefers-reduced-motion:reduce){#meteoFxCanvas{opacity:.72}}';
document.head.appendChild(style);

var x=cv.getContext('2d',{alpha:true}), dpr=1,W=0,H=0,last=performance.now(), seed=0x51f15e;
function rnd(){seed^=seed<<13;seed>>>=0;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;return seed/4294967296;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function num(id,d){var e=document.getElementById(id),v=e?parseFloat(e.value):NaN;return isFinite(v)?v:d;}
function on(id){var e=document.getElementById(id);return !!(e&&e.checked);}
function visible(id){var e=document.getElementById(id);return !!(e&&getComputedStyle(e).display!=='none');}

function resize(){
  var r=host.getBoundingClientRect(),nd=Math.min(2,window.devicePixelRatio||1);
  var w=Math.max(1,Math.round(r.width*nd)),h=Math.max(1,Math.round(r.height*nd));
  if(w===cv.width&&h===cv.height)return;
  cv.width=w;cv.height=h;dpr=nd;W=r.width;H=r.height;x.setTransform(nd,0,0,nd,0,0);
}
if(window.ResizeObserver)new ResizeObserver(resize).observe(host);
window.addEventListener('resize',resize,{passive:true});resize();

var wind=[],snow=[],hail=[],clouds=[];
function resetP(p,kind){
  p.x=rnd()*W;p.y=rnd()*H;p.z=.25+rnd()*.75;p.life=rnd();
  if(kind==='wind'){p.len=10+rnd()*36;p.phase=rnd()*6.28;}
  if(kind==='snow'){p.r=.8+rnd()*2.3;p.flutter=(rnd()-.5)*1.8;}
  if(kind==='hail'){p.r=1.2+rnd()*2.8;p.vy=120+rnd()*120;p.bounce=0;}
  return p;
}
for(var i=0;i<260;i++)wind.push(resetP({},'wind'));
for(i=0;i<420;i++)snow.push(resetP({},'snow'));
for(i=0;i<320;i++)hail.push(resetP({},'hail'));
for(i=0;i<13;i++)clouds.push({x:rnd(),y:.02+rnd()*.28,s:.5+rnd()*1.25,a:.06+rnd()*.13,phase:rnd()*6.28});

function parseWindHud(){
  var e=host.querySelector('.meteo3d.wind'); if(!e)return null;
  var t=e.textContent||'';
  var m=t.match(/([0-9]+(?:[.,][0-9]+)?)\s*km\/h/i);
  var d=t.match(/([0-9]{1,3})\s*°/);
  return {v:m?parseFloat(m[1].replace(',','.')):null,dir:d?parseFloat(d[1]):null};
}
function hailHud(){
  var e=host.querySelector('.meteo3d.hail'),t=e?(e.textContent||''):'';
  var mm=t.match(/([0-9]+(?:[.,][0-9]+)?)\s*mm/i);
  var eta=t.match(/ETA\s*([0-9]+(?:[.,][0-9]+)?)/i);
  var impact=/IMPACTO|impact/i.test(t);
  var defense=/DEFENSA|HAIL_STOW|PROTEG/i.test(t);
  return {text:t,mm:mm?parseFloat(mm[1].replace(',','.')):null,eta:eta?parseFloat(eta[1].replace(',','.')):null,impact:impact,defense:defense};
}
function state(){
  var hw=parseWindHud(),v=hw&&hw.v!=null?hw.v:null,dir=hw&&hw.dir!=null?hw.dir:null;
  if(v==null){
    if(visible('liveCtl')){v=num('lV',0);dir=num('lD',270);}
    else {v=num('eV',0);dir=num('eD',270);}
  }
  var gust=0;
  if(!visible('liveCtl')){
    var t=num('eTime',0),ga=num('eGustAt',0),gd=Math.max(0,num('eGustDur',0));
    if(gd>0&&Math.abs(t-ga)<=gd/2)gust=num('eGust',0);
    v=Math.max(v,gust);
  }
  var h=hailHud(),hailOn=false,mm=0,prob=0,impact=false,watch=false;
  if(visible('liveCtl')){
    hailOn=on('lHailOn');mm=num('lHailMm',0);prob=num('lHailProb',0);
    var eta=num('lHailEta',999);impact=h.impact||(hailOn&&eta<=0);watch=hailOn&&!impact;
  }else{
    hailOn=on('eHailOn');mm=num('eHailMm',0);prob=num('eHailProb',0);
    var tt=num('eTime',0),eta0=num('eHailEta',999),after=num('eHailAfter',15);
    impact=h.impact||(hailOn&&tt>=eta0&&tt<=eta0+after);
    watch=(h.defense||hailOn)&&!impact;
  }
  if(h.mm!=null)mm=h.mm;
  var snowOn=on('eSnowOn'),snowCm=0;
  if(snowOn){
    var te=num('eTime',0),ss=num('eSnowStart',0),sc=num('eSnowClear',120);
    if(te>=ss&&te<sc)snowCm=Math.max(0,num('eSnowCm',0));
  }
  /* En la pestaña Nieve, el mismo valor del sensor alimenta la visualización cuando
     la escena sigue montada. No implica que esa nieve exista en el escenario viento. */
  var panelN=document.getElementById('panelNieve');
  if(panelN&&getComputedStyle(panelN).display!=='none')snowCm=Math.max(snowCm,num('nCm',0));
  return {wind:Math.max(0,v||0),dir:isFinite(dir)?dir:270,gust:gust,
          hailOn:hailOn,mm:mm,prob:prob,impact:impact,watch:watch,snow:snowCm};
}
function vec(dir){
  /* Dirección meteorológica = DE dónde viene. En pantalla dibujamos hacia dónde va. */
  var a=(dir+90)*Math.PI/180;
  return {x:Math.cos(a),y:Math.sin(a)*.18};
}
function cloudsDraw(s,t){
  var storm=clamp((s.wind-25)/90,0,.45)+(s.watch?.35:0)+(s.impact?.55:0)+(s.snow>0?.22:0);
  if(storm<=.01)return;
  var v=vec(s.dir),spd=.004+s.wind/25000;
  x.save();
  for(var i=0;i<clouds.length;i++){
    var c=clouds[i],cx=((c.x+t*spd*v.x)%1.35+1.35)%1.35-.17;
    var cy=c.y+Math.sin(t*.00015+c.phase)*.018;
    var px=cx*W,py=cy*H,rr=(60+W*.12)*c.s;
    var g=x.createRadialGradient(px,py,rr*.08,px,py,rr);
    g.addColorStop(0,'rgba(52,62,76,'+(c.a+storm*.22)+')');
    g.addColorStop(.58,'rgba(35,45,58,'+(c.a*.9+storm*.12)+')');
    g.addColorStop(1,'rgba(20,28,38,0)');
    x.fillStyle=g;x.beginPath();x.arc(px,py,rr,0,Math.PI*2);x.fill();
  }
  x.restore();
}
function windDraw(s,dt,t){
  if(s.wind<2)return;
  var v=vec(s.dir),n=Math.round(clamp((s.wind-2)/100,0,1)*220)+25;
  var speed=45+s.wind*4.4,alpha=.05+clamp(s.wind/120,0,.33);
  x.save();x.lineCap='round';
  for(var i=0;i<n;i++){
    var p=wind[i],gust=1+.32*Math.sin(t*.006+p.phase)+.13*Math.sin(t*.017+p.phase*2.1);
    p.x+=v.x*speed*dt*p.z*gust;p.y+=v.y*speed*dt*p.z*gust;
    if(p.x<-80||p.x>W+80||p.y<-50||p.y>H+50)resetP(p,'wind');
    var L=p.len*(.55+p.z)*clamp(s.wind/35,.45,2.3);
    x.strokeStyle='rgba(191,222,242,'+(alpha*(.35+p.z*.65))+')';x.lineWidth=.45+p.z*1.15;
    x.beginPath();x.moveTo(p.x,p.y);x.lineTo(p.x-v.x*L,p.y-v.y*L);x.stroke();
  }
  x.restore();
}
function snowDraw(s,dt,t){
  if(s.snow<=0)return;
  var v=vec(s.dir),rate=clamp(s.snow/15,.18,1),n=Math.round(90+rate*300);
  x.save();
  for(var i=0;i<n;i++){
    var p=snow[i],fall=28+54*p.z,drift=(8+s.wind*1.5)*(.35+p.z);
    p.x+=v.x*drift*dt+Math.sin(t*.002+p.flutter*4+p.y*.01)*8*dt;
    p.y+=fall*dt;
    if(p.y>H+8||p.x<-15||p.x>W+15){resetP(p,'snow');p.y=-8;}
    x.fillStyle='rgba(241,247,252,'+(.35+p.z*.58)+')';
    x.beginPath();x.arc(p.x,p.y,p.r*(.6+p.z*.65),0,Math.PI*2);x.fill();
  }
  /* acumulación visual: una cornisa irregular, no un rectángulo blanco */
  var ah=clamp(s.snow/25,0,1)*(8+H*.045),dr=v.x*clamp(s.wind/80,0,1)*18;
  var g=x.createLinearGradient(0,H-ah*2,0,H);
  g.addColorStop(0,'rgba(235,243,249,0)');g.addColorStop(.5,'rgba(235,243,249,.12)');g.addColorStop(1,'rgba(248,252,255,.40)');
  x.fillStyle=g;x.beginPath();x.moveTo(0,H);
  for(i=0;i<=18;i++){var xx=W*i/18,yy=H-ah*(.55+.35*Math.sin(i*.9+1.2)+.12*Math.sin(i*2.4))-dr*(i/18-.5);x.lineTo(xx,yy);}
  x.lineTo(W,H);x.closePath();x.fill();x.restore();
}
function hailDraw(s,dt,t){
  if(!s.impact)return;
  var v=vec(s.dir),sev=clamp((s.mm-8)/42,0.18,1),n=Math.round(80+sev*220),windPx=s.wind*1.7;
  x.save();
  for(var i=0;i<n;i++){
    var p=hail[i]; p.vy+=190*dt;
    p.x+=v.x*windPx*dt*(.4+p.z);p.y+=p.vy*dt*(.55+p.z*.45);
    if(p.y>H-2){
      if(p.bounce<1&&p.vy>100){p.y=H-2;p.vy=-p.vy*(.10+.10*rnd());p.bounce++;}
      else {resetP(p,'hail');p.y=-10-rnd()*H*.35;p.vy=120+rnd()*150;}
    }
    if(p.x<-20||p.x>W+20){resetP(p,'hail');p.y=-10-rnd()*H*.2;}
    var rr=(1.2+sev*3.2)*(.55+p.z*.7);
    x.fillStyle='rgba(227,240,250,'+(.58+p.z*.36)+')';
    x.beginPath();x.ellipse(p.x,p.y,rr*.72,rr,0,0,Math.PI*2);x.fill();
    if(rr>2.4){x.strokeStyle='rgba(255,255,255,.38)';x.lineWidth=.7;x.stroke();}
  }
  x.restore();
}
function atmosphere(s,t){
  var dark=clamp((s.wind-45)/120,0,.16)+(s.watch?.16:0)+(s.impact?.27:0)+(s.snow>0?.08:0);
  var cold=s.snow>0?.08:0;
  var flash=s.impact&&s.mm>35?(Math.max(0,Math.sin(t*.0047))*Math.max(0,Math.sin(t*.0019))*0.11):0;
  shade.style.background=
    'linear-gradient(180deg,rgba(10,17,27,'+(dark+flash)+') 0%,rgba(16,24,32,'+(dark*.35)+') 58%,rgba(204,223,236,'+cold+') 100%)';
  host.classList.toggle('mfx-storm',dark>.10);host.classList.toggle('mfx-snow',s.snow>0);
}
function frame(now){
  requestAnimationFrame(frame);resize();
  var dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
  x.clearRect(0,0,W,H);
  var s=state();
  atmosphere(s,now);cloudsDraw(s,now);windDraw(s,dt,now);snowDraw(s,dt,now);hailDraw(s,dt,now);
}
requestAnimationFrame(frame);
})();