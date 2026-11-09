/**
 * Research-only hail trajectory benchmark. NEVER CONNECT TO A STOW CONTROLLER.
 * Hasanpour et al., SETA 95 (2026), 105542: doi:10.1016/j.seta.2026.105542
 * Independent comparison, NOT reproduction of their unavailable full method.
 * Smooth-sphere Cd(Re) from F.A. Morrison, Michigan Tech (2016):
 * https://pages.mtu.edu/~fmorriso/DataCorrelationForSphereDrag2016.pdf
 * Assumptions: spherical solid hail (900 kg/m3); 2 km drop from rest; constant
 * wind/densities/viscosity with altitude; no melting, turbulence or updrafts.
 * Morrison is for SMOOTH spheres, not irregular hail. No damage/BOM model.
 * No connection to NCU/TCU or choice of live stow angle. Research only.
 * Usage: node tests/test_hail_rk4_research.mjs
 */
import assert from 'node:assert/strict';
const p={ice:900,air:1.225,mu:1.81e-5,g:9.80665,cd:0.60};
const rad=d=>d*Math.PI/180;
const mag=v=>Math.hypot(...v);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const add=(a,b,f)=>a.map((x,i)=>x+f*b[i]);
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,a+' vs '+b);
function morrison(re){
  if(!(re>0))return Infinity;
  const r=re/263000,s=re/5,t=re/1e6;
  return 24/re+2.6*s/(1+s**1.52)+0.411*r**0.06/(1+r**8)+0.25*t/(1+t);
}
function wind(ms,from){return [-ms*Math.sin(rad(from)),0,ms*Math.cos(rad(from))];}
function normal(axis,theta){const a=rad(axis),t=rad(theta);
  return [Math.cos(a)*Math.sin(t),Math.cos(t),Math.sin(a)*Math.sin(t)];}
function hailShape(mm){const d=mm/1000;
  return {d,m:p.ice*Math.PI*d**3/6,A:Math.PI*d*d/4};}
function terminal(mm,ms,from){const s=hailShape(mm);
  return {v:[wind(ms,from)[0],-Math.sqrt(4*p.ice*s.d*p.g/(3*p.air*p.cd)),wind(ms,from)[2]]};}
function energy(v,mm,axis,theta){const signed=dot(v,normal(axis,theta)),vn=Math.abs(signed),m=hailShape(mm).m;
  return {face:signed<=0?'FRONTAL':'TRASERA',E:.5*m*mag(v)**2,En:.5*m*vn*vn,
    // Only a relative proxy under fixed number density, not a calibrated W/m2.
    fluxProxy:.5*m*vn**3};}
function rk4({mm,ms,from=270,drag='constant',height=2000,dt=.2}){
  if(!Number.isFinite(mm)||!Number.isFinite(ms)||!Number.isFinite(from)||
     !(mm>0&&mm<=100&&ms>=0&&ms<=50&&height>0&&dt>0&&dt<=1)||
     !['constant','morrison'].includes(drag))throw Error('outside explicit research range');
  const s=hailShape(mm),w=wind(ms,from),factor=p.air*s.A/(2*s.m);
  let y=[0,height,0,0,0,0],maxRe=0,seconds=0;
  function deriv(q){const rel=[q[3]-w[0],q[4],q[5]-w[2]],speed=mag(rel);
    if(speed===0)return [q[3],q[4],q[5],0,-p.g,0];
    const re=p.air*speed*s.d/p.mu;maxRe=Math.max(re,maxRe);
    const cd=drag==='constant'?p.cd:morrison(re),k=-factor*cd*speed;
    return [q[3],q[4],q[5],rel[0]*k,-p.g+rel[1]*k,rel[2]*k];}
  while(y[1]>0&&seconds<1000){
    const a=deriv(y),b=deriv(add(y,a,dt/2)),c=deriv(add(y,b,dt/2)),d=deriv(add(y,c,dt));
    const next=y.map((v,i)=>v+dt*(a[i]+2*b[i]+2*c[i]+d[i])/6);
    if(next.some(v=>!Number.isFinite(v)))throw Error('non-finite trajectory');
    if(next[1]<=0){const frac=y[1]/(y[1]-next[1]);y=add(y,next.map((v,i)=>v-y[i]),frac);
      seconds+=dt*frac;break;}
    y=next;seconds+=dt;
  }
  if(y[1]>0)throw Error('did not reach ground');
  return {v:y.slice(3),seconds,driftEast:y[0],driftSouth:y[2],maxRe,
    // Reject qualitative inference from Cd(Re) outside its stated range.
    rangeOk:drag!=='morrison'||maxRe<=1e6};
}
let count=0;function check(name,fn){fn();count++;console.log('PASS '+name);}
check('no wind: no horizontal drift',()=>{const q=rk4({mm:30,ms:0});close(q.driftEast,0);close(q.driftSouth,0);});
check('horizontal panel/no wind: En equals E',()=>{const q=rk4({mm:30,ms:0}),e=energy(q.v,30,0,0);close(e.En,e.E);});
check('±55 symmetry and cos² scaling for vertical hail',()=>{const q=rk4({mm:30,ms:0});
  const a=energy(q.v,30,0,-55).En,b=energy(q.v,30,0,55).En,e=energy(q.v,30,0,0).En;
  close(a,b);close(a/e,Math.cos(rad(55))**2);});
check('reversing wind reverses preferred side',()=>{
  const a=rk4({mm:30,ms:20,from:90}).v,b=rk4({mm:30,ms:20,from:270}).v;
  const aN=energy(a,30,0,-55).En,aP=energy(a,30,0,55).En;
  const bN=energy(b,30,0,-55).En,bP=energy(b,30,0,55).En;
  assert.ok(aN<aP&&bN>bP);close(aN,bP);close(aP,bN);});
check('projected energy never exceeds kinetic energy',()=>{
  for(const dir of [0,90,180,270,359])for(const theta of [-75,-55,0,55,75]){
    const q=rk4({mm:80,ms:30,from:dir,drag:'morrison'}),e=energy(q.v,80,0,theta);
    assert.ok(e.En>=0&&e.En<=e.E+1e-8&&q.rangeOk);}});
check('RK4 step refinement converges',()=>{const x={mm:80,ms:22,from:350,drag:'morrison'};
  const a=rk4({...x,dt:.2}),b=rk4({...x,dt:.1});
  assert.ok(Math.abs(a.v[1]-b.v[1])/Math.abs(b.v[1])<.002);
  assert.ok(Math.abs(a.seconds-b.seconds)<.1);});
check('Cd(Re) actually varies; smooth sphere only',()=>{
  for(const re of [100,1000,10000,100000,300000,500000])assert.ok(morrison(re)>0);
  assert.ok(Math.abs(morrison(100)-morrison(300000))>.2);});
check('terminal reference exact equality to existing formula',()=>{
  const vt=terminal(30,0,270).v[1];close(vt**2,4*p.ice*.03*p.g/(3*p.air*.60));});
check('invalid inputs rejected',()=>{
  assert.throws(()=>rk4({mm:110,ms:10}));assert.throws(()=>rk4({mm:30,ms:51}));
  assert.throws(()=>rk4({mm:30,ms:10,drag:'other'}));});
console.log('PASS '+count+'/9 synthetic self-checks — NOT observational validation.');
for(const mm of [30,80])for(const from of [90,270])for(const drag of ['constant','morrison']){
  const r=rk4({mm,ms:20,from,drag});
  const neg=energy(r.v,mm,0,-55).En,pos=energy(r.v,mm,0,55).En;
  console.log(JSON.stringify({diameter_mm:mm,wind_from_deg:from,drag,impact_ms:+mag(r.v).toFixed(2),
    Eminus55_J:+neg.toFixed(2),Eplus55_J:+pos.toFixed(2),preferred_by_Eonly:neg<pos?-55:55,
    max_Re:Math.round(r.maxRe),morrison_valid_range:r.rangeOk}));
}
