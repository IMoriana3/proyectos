/**
 * Research-only hail trajectory benchmark. NEVER CONNECT TO A STOW CONTROLLER.
 * Hasanpour et al., SETA 95 (2026), 105542: doi:10.1016/j.seta.2026.105542
 * Independent comparison, NOT reproduction of their unavailable full method.
 * Lobed hail reference: Theis et al., Atmosphere 11(5), 494 (2020), CC BY 4.0,
 * https://doi.org/10.3390/atmos11050494 (Tables 1, 2, 4 and 6).
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
function energy(v,mm,axis,theta,massKg=null){const signed=dot(v,normal(axis,theta)),vn=Math.abs(signed),m=massKg===null?hailShape(mm).m:massKg;
  return {face:signed<=0?'FRONTAL':'TRASERA',E:.5*m*mag(v)**2,En:.5*m*vn*vn,
    // Only a relative proxy under fixed number density, not a calibrated W/m2.
    fluxProxy:.5*m*vn**3};}
function rk4({mm,ms,from=270,drag='constant',fixedCd=p.cd,height=2000,dt=.2}){
  if(!Number.isFinite(mm)||!Number.isFinite(ms)||!Number.isFinite(from)||
     !(mm>0&&mm<=100&&ms>=0&&ms<=50&&height>0&&dt>0&&dt<=1&&Number.isFinite(fixedCd)&&fixedCd>=.2&&fixedCd<=1.5)||
     !['constant','morrison'].includes(drag))throw Error('outside explicit research range');
  const s=hailShape(mm),w=wind(ms,from),factor=p.air*s.A/(2*s.m);
  let y=[0,height,0,0,0,0],maxRe=0,seconds=0;
  function deriv(q){const rel=[q[3]-w[0],q[4],q[5]-w[2]],speed=mag(rel);
    if(speed===0)return [q[3],q[4],q[5],0,-p.g,0];
    const re=p.air*speed*s.d/p.mu;maxRe=Math.max(re,maxRe);
    const cd=drag==='constant'?fixedCd:morrison(re),k=-factor*cd*speed;
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
  return {v:y.slice(3),seconds,driftEast:y[0],driftSouth:y[2],maxRe,fixedCd:drag==='constant'?fixedCd:null,
    // Re applicability refers ONLY to Morrison's smooth-sphere fit, never to natural hail.
    withinMorrisonSmoothSphereReDomain:drag==='morrison'?(maxRe<=1e6):null,
    naturalHailCalibrated:false,damageBOMCalibrated:false,controlsAuthorized:false};
}

// Theis et al. Atmosphere 11(5), 494 (2020): corrected wind-tunnel fits.
// D [cm], m [g] = massA * D^massB, A [cm^2] = areaA * D^areaB.
// Cd: their Table 4 (wall-blockage corrected); U=a*D^b: Table 6.
// The prints are artificial and their measured Re range is approx. 25k–85k.
// This is a static terminal reference only, NOT a natural-hail Cd(Re) model.
const LOBED2020=Object.freeze({
  sphere:  {massA:.499,massB:2.975,areaA:.785,areaB:2.000,Cd:.448,dCd:.010,uA:14.84,uB:.50},
  q4short: {massA:.469,massB:2.949,areaA:.741,areaB:1.972,Cd:.518,dCd:.014,uA:13.97,uB:.50},
  q4long:  {massA:.382,massB:2.949,areaA:.664,areaB:2.015,Cd:.575,dCd:.012,uA:12.44,uB:.50},
  q6short: {massA:.395,massB:2.995,areaA:.752,areaB:1.958,Cd:.457,dCd:.008,uA:13.14,uB:.55},
  q6long:  {massA:.337,massB:2.980,areaA:.696,areaB:1.996,Cd:.568,dCd:.016,uA:11.87,uB:.49}
});
function terminal2020(mm,category){
  if(!Number.isFinite(mm)||mm<20||mm>50||!(category in LOBED2020))
    throw Error('Theis2020: outside measured 20–50 mm or unknown category');
  const x=LOBED2020[category],D=mm/10;
  const mass_g=x.massA*D**x.massB,area_cm2=x.areaA*D**x.areaB;
  const mass_kg=mass_g/1000,area_m2=area_cm2/10000;
  const terminal_ms=Math.sqrt((2*mass_kg*p.g)/(p.air*x.Cd*area_m2));
  const Re=p.air*terminal_ms*(mm/1000)/p.mu;
  return {category,mm,mass_g,area_cm2,mass_kg,area_m2,Cd:x.Cd,dCd:x.dCd,
    terminal_ms,Re,table6_ms:x.uA*D**x.uB,
    withinMeasuredReBand:Re>=25000&&Re<=85000,
    artificialGeometry:true,naturalHailCalibrated:false,
    damageBOMCalibrated:false,controlsAuthorized:false};
}
function projected2020(mm,category,windMs,windFrom,axis,theta){
  if(!Number.isFinite(windMs)||windMs<0||windMs>50||!Number.isFinite(windFrom))
    throw Error('Theis2020: wind outside synthetic limits');
  const q=terminal2020(mm,category),w=wind(windMs,windFrom);
  const v=[w[0],-q.terminal_ms,w[2]];
  return {...q,...energy(v,mm,axis,theta,q.mass_kg),
    // Wind aloft and terminal equilibrium are assumed, not measured for hailstorms.
    windProfileMeasured:false,observationCountPerArea:null};
}

let count=0;function check(name,fn){fn();count++;console.log('OK   '+name);}
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
    assert.ok(e.En>=0&&e.En<=e.E+1e-8&&q.withinMorrisonSmoothSphereReDomain===true);}});
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
check('fixed Cd=0.60 remains the default reference',()=>{
  const a=rk4({mm:30,ms:20,from:90}),b=rk4({mm:30,ms:20,from:90,fixedCd:.60});
  assert.ok(a.v.every((x,i)=>Math.abs(x-b.v[i])<1e-12));});
check('fixed-Cd sensitivity changes energy without certifying damage',()=>{
  const e=(cd,th)=>energy(rk4({mm:30,ms:20,from:90,fixedCd:cd}).v,30,0,th).En;
  assert.ok(e(.3,55)>e(1.2,55)&&e(.3,-55)<e(1.2,-55));});
check('normal energy can be non-monotone in Cd at oblique tilt',()=>{
  const e=cd=>energy(rk4({mm:80,ms:20,from:90,fixedCd:cd}).v,80,0,-55).En;
  assert.ok(e(.9)<e(.6)&&e(.9)<e(1.2));});
check('fixed-Cd wind reversal preserves mirrored normal energy',()=>{
  for(const cd of [.3,.45,.6,.9,1.2]){
    const a=rk4({mm:30,ms:20,from:90,fixedCd:cd}).v;
    const b=rk4({mm:30,ms:20,from:270,fixedCd:cd}).v;
    close(energy(a,30,0,-55).En,energy(b,30,0,55).En,1e-8);
  }});
check('applicability flags never certify hail or controller',()=>{
  for(const drag of ['constant','morrison']){
    const x=rk4({mm:80,ms:20,from:90,drag});
    assert.ok(x.naturalHailCalibrated===false&&!x.damageBOMCalibrated&&!x.controlsAuthorized);
  }
  assert.ok(rk4({mm:80,ms:20,from:90,drag:'morrison'}).withinMorrisonSmoothSphereReDomain===true);
  assert.throws(()=>rk4({mm:30,ms:20,fixedCd:0}));
  assert.throws(()=>rk4({mm:30,ms:20,fixedCd:2}));
});

check('Theis2020 table 4 corrected Cd are pinned with source uncertainties',()=>{
  assert.ok(LOBED2020.sphere.Cd===.448&&LOBED2020.sphere.dCd===.010);
  assert.ok(LOBED2020.q4short.Cd===.518&&LOBED2020.q4long.Cd===.575);
  assert.ok(LOBED2020.q6short.Cd===.457&&LOBED2020.q6long.Cd===.568);
});
check('Theis2020 lobes reduce mass and area differently at 35 mm',()=>{
  const a=terminal2020(35,'sphere'),b=terminal2020(35,'q6long');
  assert.ok(b.mass_g/a.mass_g<.75&&b.mass_g/a.mass_g>.60);
  assert.ok(b.area_cm2/a.area_cm2>.80&&b.area_cm2/a.area_cm2<.94);
});
check('Theis2020 terminal velocities independently reproduce Table 6 at 35 mm',()=>{
  for(const key of Object.keys(LOBED2020)){
    const a=terminal2020(35,key);
    assert.ok(Math.abs(a.terminal_ms/a.table6_ms-1)<.04,
      key+' model fit to Table6 exceeds 4%');
  }
});
check('Theis2020 sphere is faster than both long-lobed groups at 35 mm',()=>{
  const a=terminal2020(35,'sphere').terminal_ms;
  assert.ok(a>terminal2020(35,'q4long').terminal_ms);
  assert.ok(a>terminal2020(35,'q6long').terminal_ms);
});
check('Theis2020 approximate 17% and 21% reductions at 35 mm',()=>{
  const v=key=>terminal2020(35,key).terminal_ms,base=v('sphere');
  assert.ok(Math.abs((1-v('q4long')/base)-.17)<.04);
  assert.ok(Math.abs((1-v('q6long')/base)-.21)<.04);
});
check('Theis2020 terminal KE reduction matches published directions',()=>{
  const KE=key=>{const q=terminal2020(35,key);return q.mass_kg*q.terminal_ms**2/2};
  const base=KE('sphere');
  const expected={q4short:.19,q4long:.49,q6short:.33,q6long:.62};
  for(const [key,reduction] of Object.entries(expected))
    assert.ok(Math.abs((1-KE(key)/base)-reduction)<.06,key+' KE differs by >6pp');
});
check('Theis2020 all five 35mm profiles sit within tested Reynolds band',()=>{
  for(const k of Object.keys(LOBED2020))
    assert.ok(terminal2020(35,k).withinMeasuredReBand,k);
});
check('Theis2020 out-of-Re cases are flagged rather than silently certified',()=>{
  assert.ok(terminal2020(20,'q6long').withinMeasuredReBand===false);
  assert.ok(terminal2020(50,'sphere').withinMeasuredReBand===false);
});
check('Theis2020 diameter 80mm and unknown shapes are rejected',()=>{
  assert.throws(()=>terminal2020(80,'sphere'));
  assert.throws(()=>terminal2020(19,'q4short'));
  assert.throws(()=>terminal2020(51,'q6long'));
  assert.throws(()=>terminal2020(35,'unknown'));
});
check('Theis2020 empirical mass is used to project energy',()=>{
  const q=projected2020(35,'q4long',20,90,0,55);
  const w=wind(20,90),v=[w[0],-q.terminal_ms,w[2]];
  const normalSpeed=Math.abs(dot(v,normal(0,55)));
  close(q.En,.5*q.mass_kg*normalSpeed**2,1e-10);
  assert.ok(q.En>=0&&q.En<=q.E);
});
check('Theis2020 east/west wind mirror changes the low-E direction',()=>{
  for(const key of Object.keys(LOBED2020)){
    const a=projected2020(35,key,20,90,0,-55);
    const b=projected2020(35,key,20,270,0,55);
    close(a.En,b.En,1e-9);
  }
});
check('Theis2020 empirical examples cannot authorize controller or damage',()=>{
  for(const key of Object.keys(LOBED2020)){
    const q=projected2020(35,key,20,90,0,55);
    assert.ok(q.artificialGeometry===true&&!q.naturalHailCalibrated);
    assert.ok(!q.controlsAuthorized&&!q.damageBOMCalibrated);
    assert.ok(q.observationCountPerArea===null&&!q.windProfileMeasured);
  }
});
check('Theis2020 rejects missing wind semantics',()=>{
  assert.throws(()=>projected2020(35,'sphere',NaN,90,0,55));
  assert.throws(()=>projected2020(35,'sphere',-1,90,0,55));
});

console.log('RESUMEN '+count+'/27 synthetic self-checks — NOT observational validation.');
for(const mm of [30,80])for(const from of [90,270])for(const drag of ['constant','morrison']){
  const r=rk4({mm,ms:20,from,drag});
  const neg=energy(r.v,mm,0,-55).En,pos=energy(r.v,mm,0,55).En;
  console.log(JSON.stringify({diameter_mm:mm,wind_from_deg:from,drag,impact_ms:+mag(r.v).toFixed(2),
    Eminus55_J:+neg.toFixed(2),Eplus55_J:+pos.toFixed(2),lower_Eperp_side_only_not_a_target:neg<pos?-55:55,
    max_Re:Math.round(r.maxRe),morrison_smooth_sphere_Re_domain:r.withinMorrisonSmoothSphereReDomain,
    natural_hail_calibrated:r.naturalHailCalibrated,authorized_for_control:r.controlsAuthorized}));
}

console.log('SYNTHETIC FIXED-CD SENSITIVITY — NO PROBABILITIES, DAMAGE OR CONTROL');
for(const mm of [30,80]){
  const variants=[.3,.45,.6,.9,1.2].map(fixedCd=>{
    const q=rk4({mm,ms:20,from:90,drag:'constant',fixedCd});
    return {Cd_assumed:fixedCd,impact_ms:+mag(q.v).toFixed(3),
      Eminus55_J:+energy(q.v,mm,0,-55).En.toFixed(4),
      Eplus55_J:+energy(q.v,mm,0,55).En.toFixed(4)};
  });
  const vals=variants.map(x=>x.Eminus55_J);
  console.log(JSON.stringify({diameter_mm:mm,wind_from_deg:90,wind_ms:20,
    Cd_values_are_scenarios_not_probabilities:true,natural_hail_validated:false,
    risk_of_damage_evaluated:false,control_target_evaluated:false,
    Eminus55_min_J:Math.min(...vals),Eminus55_max_J:Math.max(...vals),
    variants}));
}

console.log('THEIS2020 35MM TERMINAL-ONLY — DATA FITS; NOT NATURAL HAIL OR CONTROL');
for(const category of Object.keys(LOBED2020)){
  const q=terminal2020(35,category),ke=.5*q.mass_kg*q.terminal_ms**2;
  const enNeg=projected2020(35,category,20,90,0,-55).En;
  const enPos=projected2020(35,category,20,90,0,55).En;
  console.log(JSON.stringify({category,diameter_mm:35,terminal_ms:+q.terminal_ms.toFixed(3),
    Table6_terminal_ms:+q.table6_ms.toFixed(3),Cd_corrected:q.Cd,
    Reynolds:Math.round(q.Re),withinMeasuredReBand:q.withinMeasuredReBand,
    KE_total_J:+ke.toFixed(3),Eminus55_J:+enNeg.toFixed(3),Eplus55_J:+enPos.toFixed(3),
    artificial_geometry:true,natural_hail_validated:false,damage_BOM_calibrated:false,
    controller_stow_authorized:false}));
}
