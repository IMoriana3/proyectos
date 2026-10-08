/* Factiun · Weather Workbench visual layer v1
   Canvas HiDPI, sin dependencias externas. Replica las familias visuales de
   SolarGPT Meteo sobre el contrato de lib/meteo-browser.js.
*/
export const VIZ_VERSION="1.0.0";
export const MONTHS=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const C={bg:"#101D30",grid:"#27405F",text:"#DCE3EB",muted:"#8C9AAB",amber:"#F09030",blue:"#68C0D8",red:"#E84858",green:"#62C88A",purple:"#A98AD9",pink:"#E8A0BF",yellow:"#E4C65A",white:"#F1F5F9"};
const COLORS=[C.amber,C.red,C.blue,C.green,C.purple,C.pink,C.yellow,"#6BB7A8"];
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(+v);
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const sum=a=>a.reduce((s,x)=>s+x,0);
const minv=a=>{let m=Infinity;for(const x of a)if(finite(x)&&+x<m)m=+x;return m===Infinity?null:m};
const maxv=a=>{let m=-Infinity;for(const x of a)if(finite(x)&&+x>m)m=+x;return m===-Infinity?null:m};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fmt=(x,d=1)=>finite(x)?(+x).toFixed(d):"—";
const _fmtCache=new Map();
function localParts(t,tz="UTC"){
  if(tz==="UTC"||!tz){const d=new Date(t);return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:d.getUTCHours()};}
  let f=_fmtCache.get(tz);if(!f){f=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"});_fmtCache.set(tz,f);}
  const p=Object.fromEntries(f.formatToParts(new Date(t)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return {year:+p.year,month:+p.month,day:+p.day,hour:+p.hour};
}
export function localDayKey(t,tz="UTC"){const p=localParts(t,tz);return String(p.year).padStart(4,"0")+"-"+String(p.month).padStart(2,"0")+"-"+String(p.day).padStart(2,"0");}
const monthOf=(t,tz="UTC")=>localParts(t,tz).month-1;
function localDoy(t,tz="UTC"){const p=localParts(t,tz);return Math.floor((Date.UTC(p.year,p.month-1,p.day)-Date.UTC(p.year,0,1))/86400000)+1;}

function prep(canvas,height=260){
  if(!canvas)return null;
  const w=Math.max(300,Math.round(canvas.clientWidth||canvas.parentElement?.clientWidth||800)),h=height,dpr=Math.min(3,window.devicePixelRatio||1);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  canvas.style.height=h+"px";canvas.dataset.drawn="1";
  const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,w,h);
  return {ctx,w,h};
}
function bounds(vals,forceZero=false){
  const v=vals.flat().filter(finite);if(!v.length)return [0,1];
  let lo=Math.min(...v),hi=Math.max(...v);if(forceZero)lo=Math.min(0,lo);
  if(!(hi>lo)){hi=lo+1;}const pad=(hi-lo)*.08;return [lo-pad,hi+pad];
}
function frame(ctx,w,h,{title="",xLabels=[],yMin=0,yMax=1,yLabel=""}={}){
  const L=52,R=18,T=28,B=36,pw=w-L-R,ph=h-T-B;
  ctx.strokeStyle=C.grid;ctx.fillStyle=C.muted;ctx.font="11px system-ui";ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=T+ph*i/4;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();const val=yMax-(yMax-yMin)*i/4;ctx.fillText(fmt(val,Math.abs(yMax-yMin)<10?1:0),6,y+4);}
  if(xLabels.length){const n=xLabels.length;for(let i=0;i<n;i++){const x=L+pw*(n===1 ? .5:i/(n-1));ctx.fillText(xLabels[i],x-ctx.measureText(xLabels[i]).width/2,h-12);}}
  ctx.fillStyle=C.text;ctx.font="600 12px system-ui";ctx.fillText(title,L,17);
  if(yLabel){ctx.save();ctx.translate(13,T+ph/2);ctx.rotate(-Math.PI/2);ctx.fillStyle=C.muted;ctx.fillText(yLabel,-ctx.measureText(yLabel).width/2,0);ctx.restore();}
  return {L,R,T,B,pw,ph,x:v=>L+pw*v,y:v=>T+ph*(1-(v-yMin)/(yMax-yMin))};
}
function legend(ctx,items,x,y){
  ctx.font="10px system-ui";let dx=x;
  items.forEach((it,i)=>{ctx.fillStyle=it.color;ctx.fillRect(dx,y-8,10,3);dx+=14;ctx.fillStyle=C.muted;ctx.fillText(it.label,dx,y);dx+=ctx.measureText(it.label).width+14;});
}
export function drawLineChart(canvas,series,{title="",yLabel="",xLabels=null,height=260,yMin=null,yMax=null,zero=false}={}){
  const p=prep(canvas,height);if(!p)return;const {ctx,w,h}=p;
  const all=series.map(s=>s.values||[]),[lo0,hi0]=bounds(all,zero),lo=yMin??lo0,hi=yMax??hi0,n=Math.max(...series.map(s=>s.values.length),1);
  const labels=xLabels||Array.from({length:n},(_,i)=>i===0?"1":i===n-1?String(n):"");
  const f=frame(ctx,w,h,{title,xLabels:labels,yMin:lo,yMax:hi,yLabel});
  series.forEach((s,si)=>{ctx.strokeStyle=s.color||COLORS[si%COLORS.length];ctx.lineWidth=s.width||1.6;ctx.beginPath();let started=false;(s.values||[]).forEach((v,i)=>{if(!finite(v)){started=false;return;}const x=f.L+f.pw*(n===1 ? .5:i/(n-1)),y=f.y(+v);if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y);});ctx.stroke();});
  legend(ctx,series.map((s,i)=>({label:s.label||("S"+(i+1)),color:s.color||COLORS[i%COLORS.length]})),f.L+6,f.T+12);
}
export function drawBarChart(canvas,series,{title="",yLabel="",labels=MONTHS,height=250,yMin=0,yMax=null,stacked=false}={}){
  const p=prep(canvas,height);if(!p)return;const {ctx,w,h}=p,n=labels.length;
  const totals=Array.from({length:n},(_,i)=>stacked?sum(series.map(s=>finite(s.values[i])?+s.values[i]:0)):Math.max(...series.map(s=>finite(s.values[i])?+s.values[i]:0),0));
  const hi=yMax??Math.max(1,maxv(totals)||1)*1.12,f=frame(ctx,w,h,{title,xLabels:labels,yMin,yMax:hi,yLabel});
  const groupW=f.pw/n*.78;
  for(let i=0;i<n;i++){
    if(stacked){let bottom=f.y(0);series.forEach((s,si)=>{const v=finite(s.values[i])?+s.values[i]:0,y=f.y(v+(hi-(bottom-f.T)/f.ph*hi));ctx.fillStyle=s.color||COLORS[si%COLORS.length];const hh=bottom-y;ctx.fillRect(f.L+f.pw*(i+.5)/n-groupW/2,y,groupW,hh);bottom=y;});}
    else{const bw=groupW/Math.max(1,series.length);series.forEach((s,si)=>{if(!finite(s.values[i]))return;const v=+s.values[i],y=f.y(v),x=f.L+f.pw*(i+.5)/n-groupW/2+si*bw;ctx.fillStyle=s.color||COLORS[si%COLORS.length];ctx.fillRect(x,y,bw*.9,f.y(0)-y);});}
  }
  legend(ctx,series.map((s,i)=>({label:s.label||("S"+(i+1)),color:s.color||COLORS[i%COLORS.length]})),f.L+6,f.T+12);
}
function dtHours(rows){
  if(rows.length<2)return 1;const a=[];for(let i=1;i<Math.min(rows.length,500);i++){const d=(Date.parse(rows[i].t)-Date.parse(rows[i-1].t))/36e5;if(d>0&&d<24)a.push(d)}a.sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:1;
}
export function monthlyClimatology(rows,tz="UTC"){
  const dt=dtHours(rows),out=Array.from({length:12},(_,m)=>({month:m+1,ghiByYear:{},dniByYear:{},dhiByYear:{},snowByYear:{},t:[],wind:[],tmin:Infinity,tmax:-Infinity}));
  rows.forEach(r=>{
    const p=localParts(r.t,tz),a=out[p.month-1],y=p.year,add=(bag,val)=>{bag[y]=(bag[y]||0)+Math.max(0,+val)*dt/1000};
    if(finite(r.ghi_wm2))add(a.ghiByYear,r.ghi_wm2);
    if(finite(r.dni_wm2))add(a.dniByYear,r.dni_wm2);
    if(finite(r.dhi_wm2))add(a.dhiByYear,r.dhi_wm2);
    if(finite(r.temp_c)){a.t.push(+r.temp_c);a.tmin=Math.min(a.tmin,+r.temp_c);a.tmax=Math.max(a.tmax,+r.temp_c)}
    if(finite(r.wind_ms))a.wind.push(+r.wind_ms*3.6);
    if(finite(r.snowfall_cm))a.snowByYear[y]=(a.snowByYear[y]||0)+Math.max(0,+r.snowfall_cm);
  });
  const av=o=>{const x=Object.values(o);return x.length?mean(x):0};
  return out.map(a=>({month:a.month,ghi:av(a.ghiByYear),dni:av(a.dniByYear),dhi:av(a.dhiByYear),snow:av(a.snowByYear),t:a.t,wind:a.wind,tmean:mean(a.t),windmean:mean(a.wind),windmax:maxv(a.wind),tmin:a.tmin===Infinity?null:a.tmin,tmax:a.tmax===-Infinity?null:a.tmax}));
}
export function dailyMeanSeries(rows){
  const by=new Map();rows.forEach(r=>{const k=localDayKey(r.t,"UTC");if(!by.has(k))by.set(k,{ghi:[],dni:[],dhi:[]});const a=by.get(k);if(finite(r.ghi_wm2))a.ghi.push(+r.ghi_wm2);if(finite(r.dni_wm2))a.dni.push(+r.dni_wm2);if(finite(r.dhi_wm2))a.dhi.push(+r.dhi_wm2);});
  return [...by.entries()].sort().map(([date,a])=>({date,ghi:mean(a.ghi),dni:mean(a.dni),dhi:mean(a.dhi)}));
}
export function dayProfile(rows,date,tz="UTC"){
  return rows.filter(r=>localDayKey(r.t,tz)===date).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
}
export function localHour(t,tz="UTC"){return localParts(t,tz).hour;}
export function peakDay(rows,key="ghi_wm2",tz="UTC"){
  const by=new Map();rows.forEach(r=>{if(finite(r[key])){const k=localDayKey(r.t,tz);by.set(k,(by.get(k)||0)+Math.max(0,+r[key]));}});
  let best=null,v=-Infinity;for(const [k,x] of by)if(x>v){best=k;v=x}return best;
}
export function dailyClimatology(rows,tz="UTC"){
  const years=Math.max(1,new Set(rows.map(r=>new Date(r.t).getUTCFullYear())).size),days=Array.from({length:366},()=>({ghi:[],dni:[],dhi:[],tmean:[],tmin:[],tmax:[],windmax:[],windworst:[]}));
  const byDayYear=new Map();
  rows.forEach(r=>{const p=localParts(r.t,tz),dy=localDoy(r.t,tz),k=p.year+"-"+dy;if(!byDayYear.has(k))byDayYear.set(k,{doy:dy,ghi:[],dni:[],dhi:[],t:[],wind:[]});const a=byDayYear.get(k);if(finite(r.ghi_wm2))a.ghi.push(+r.ghi_wm2);if(finite(r.dni_wm2))a.dni.push(+r.dni_wm2);if(finite(r.dhi_wm2))a.dhi.push(+r.dhi_wm2);if(finite(r.temp_c))a.t.push(+r.temp_c);if(finite(r.wind_ms))a.wind.push(+r.wind_ms*3.6);});
  for(const a of byDayYear.values()){const x=days[a.doy-1];x.ghi.push(maxv(a.ghi));x.dni.push(maxv(a.dni));x.dhi.push(maxv(a.dhi));x.tmean.push(mean(a.t));x.tmin.push(minv(a.t));x.tmax.push(maxv(a.t));x.windmax.push(maxv(a.wind));x.windworst.push(maxv(a.wind));}
  return days.map((a,i)=>({doy:i+1,ghi:mean(a.ghi.filter(finite)),dni:mean(a.dni.filter(finite)),dhi:mean(a.dhi.filter(finite)),tmean:mean(a.tmean.filter(finite)),tmin:mean(a.tmin.filter(finite)),tmax:mean(a.tmax.filter(finite)),wind:mean(a.windmax.filter(finite)),windWorst:maxv(a.windworst)}));
}
export function windRoseData(rows){
  const nDir=16,speedBins=[0,5,15,30,50,80,200],labels=["<5","5-15","15-30","30-50","50-80",">80"],counts=Array.from({length:nDir},()=>Array(6).fill(0));let total=0,sumWs=0,maxWs=0;
  rows.forEach(r=>{if(!finite(r.wind_ms)||!finite(r.wind_dir_deg))return;const ws=Math.max(0,+r.wind_ms*3.6),wd=((+r.wind_dir_deg%360)+360)%360,di=Math.floor((wd+11.25)/22.5)%16;let si=5;for(let i=0;i<speedBins.length-1;i++)if(ws>=speedBins[i]&&ws<speedBins[i+1]){si=i;break}counts[di][si]++;total++;sumWs+=ws;maxWs=Math.max(maxWs,ws);});
  return {counts,freq:counts.map(a=>a.map(x=>total?100*x/total:0)),total,meanKmh:total?sumWs/total:null,maxKmh:maxWs,speedBins,labels};
}
export function drawWindRose(canvas,data,{title="Rosa de los vientos"}={}){
  const p=prep(canvas,430);if(!p)return;const {ctx,w,h}=p,cx=w*.46,cy=h*.52,R=Math.min(w*.34,h*.38),n=16,ang=2*Math.PI/n,sectorTotals=data.freq.map(a=>sum(a)),maxPct=Math.max(1,maxv(sectorTotals)||1);
  ctx.strokeStyle=C.grid;ctx.fillStyle=C.muted;ctx.font="10px system-ui";
  for(let q=1;q<=4;q++){ctx.beginPath();ctx.arc(cx,cy,R*q/4,0,Math.PI*2);ctx.stroke();ctx.fillText(fmt(maxPct*q/4,1)+"%",cx+R*q/4+3,cy-3);}
  for(let i=0;i<n;i++){const th=i*ang-Math.PI/2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+R*Math.cos(th),cy+R*Math.sin(th));ctx.stroke();}
  const cols=[C.blue,C.green,C.yellow,C.amber,C.red,C.purple];
  for(let d=0;d<n;d++){let base=0;for(let s=0;s<6;s++){const v=data.freq[d][s],r0=R*base/maxPct,r1=R*(base+v)/maxPct,a0=d*ang-ang*.45-Math.PI/2,a1=d*ang+ang*.45-Math.PI/2;ctx.beginPath();ctx.arc(cx,cy,r1,a0,a1);ctx.arc(cx,cy,r0,a1,a0,true);ctx.closePath();ctx.fillStyle=cols[s];ctx.fill();base+=v;}}
  ctx.fillStyle=C.text;ctx.font="600 12px system-ui";ctx.fillText(title+" · "+data.total.toLocaleString("es-ES")+" h · vmed "+fmt(data.meanKmh,1)+" km/h · vmax "+fmt(data.maxKmh,0)+" km/h",18,18);
  [["N",0,-1],["E",1,0],["S",0,1],["W",-1,0]].forEach(([lab,dx,dy])=>{ctx.fillStyle=C.text;ctx.font="600 12px system-ui";ctx.fillText(lab,cx+dx*(R+18)-4,cy+dy*(R+18)+4);});
  data.labels.forEach((l,i)=>{ctx.fillStyle=cols[i];ctx.fillRect(w-150,50+i*19,11,11);ctx.fillStyle=C.muted;ctx.font="10px system-ui";ctx.fillText(l+" km/h",w-133,59+i*19);});
}
export function temperatureExtremes(rows){
  const v=rows.map(r=>r.temp_c).filter(finite).map(Number),n=v.length,cold=[0,-5,-10,-15,-20,-30].map(t=>({threshold:t,hours:n?Math.round(v.filter(x=>x<t).length*8760/n):0,pct:n?100*v.filter(x=>x<t).length/n:0})),hot=[25,30,35,40].map(t=>({threshold:t,hours:n?Math.round(v.filter(x=>x>t).length*8760/n):0,pct:n?100*v.filter(x=>x>t).length/n:0}));
  const bins=60,lo=minv(v),hi=maxv(v),hist=Array(bins).fill(0);if(finite(lo)&&finite(hi)&&hi>lo)v.forEach(x=>{const i=clamp(Math.floor((x-lo)/(hi-lo)*bins),0,bins-1);hist[i]++;});
  return {values:v,min:lo,max:hi,mean:mean(v),cold,hot,hist,lo,hi};
}
export function drawTemperatureHistogram(canvas,data){
  const vals=data.hist||[],p=prep(canvas,250);if(!p)return;const {ctx,w,h}=p,hi=Math.max(1,maxv(vals)||1),f=frame(ctx,w,h,{title:"Histograma de temperatura · Tmin "+fmt(data.min,1)+"°C · Tmax "+fmt(data.max,1)+"°C · Tmedia "+fmt(data.mean,1)+"°C",xLabels:[fmt(data.lo,0),"",fmt((data.lo+data.hi)/2,0),"",fmt(data.hi,0)],yMin:0,yMax:hi,yLabel:"Horas"});
  const bw=f.pw/Math.max(vals.length,1);vals.forEach((v,i)=>{const tc=data.lo+(i+.5)*(data.hi-data.lo)/vals.length;ctx.fillStyle=tc<-10?C.blue:tc<0?"#4F93D1":tc<25?C.muted:tc<35?C.amber:C.red;const y=f.y(v);ctx.fillRect(f.L+i*bw,y,Math.max(1,bw-.5),f.y(0)-y);});
}
export function snowSummary(rows,tz="UTC"){
  const months=Array(12).fill(0),days=new Set();let total=0,maxDepth=0,hasDepth=false;rows.forEach(r=>{if(finite(r.snowfall_cm)&&+r.snowfall_cm>0){months[monthOf(r.t,tz)]+=+r.snowfall_cm;total+=+r.snowfall_cm;if(+r.snowfall_cm>.1)days.add(localDayKey(r.t,tz));}if(finite(r.snow_depth_m)){hasDepth=true;maxDepth=Math.max(maxDepth,+r.snow_depth_m*100);}});
  const span=rows.length?(Date.parse(rows.at(-1).t)-Date.parse(rows[0].t))/864e5:0,years=span/365.25,annualize=years>=.98;return {months:annualize?months.map(x=>x/years):months,total,days:days.size,maxDepth:hasDepth?maxDepth:null,years,annualize};
}
export function drawHailRisk(canvas,risk){
  const p=prep(canvas,245);if(!p)return;const {ctx,w,h}=p,life=Math.max(1,risk.design_life_yr||25),xs=Array.from({length:life+1},(_,i)=>i),mid=xs.map(y=>100*(1-Math.exp(-risk.lambda_yr*y))),lo=xs.map(y=>100*(1-Math.exp(-risk.lambda_lo*y))),hi=xs.map(y=>100*(1-Math.exp(-risk.lambda_hi*y))),f=frame(ctx,w,h,{title:"Riesgo acumulado de granizo dañino",xLabels:["0","","",String(life)],yMin:0,yMax:100,yLabel:"P(≥1) %"});
  ctx.fillStyle="rgba(232,72,88,.13)";ctx.beginPath();xs.forEach((x,i)=>{const px=f.L+f.pw*x/life,py=f.y(hi[i]);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)});for(let i=xs.length-1;i>=0;i--){ctx.lineTo(f.L+f.pw*xs[i]/life,f.y(lo[i]))}ctx.closePath();ctx.fill();
  drawLineChartOnFrame(ctx,f,[{values:mid,color:C.red,label:"λ central"}]);
}
function drawLineChartOnFrame(ctx,f,series){
  const n=Math.max(...series.map(s=>s.values.length),1);series.forEach((s,si)=>{ctx.strokeStyle=s.color||COLORS[si];ctx.lineWidth=2;ctx.beginPath();let on=false;(s.values||[]).forEach((v,i)=>{if(!finite(v))return;const x=f.L+f.pw*(n===1 ? .5:i/(n-1)),y=f.y(v);if(!on){ctx.moveTo(x,y);on=true}else ctx.lineTo(x,y)});ctx.stroke();});legend(ctx,series.map((s,i)=>({label:s.label,color:s.color||COLORS[i]})),f.L+6,f.T+12);
}
export function windDailyMax(series){
  const days=[];for(let i=0;i<series.length;i+=24){const m=maxv(series.slice(i,i+24));days.push(finite(m)?m*3.6:null);}return days;
}
export function comparisonMonthly(results){
  return Object.entries(results||{}).map(([name,a],i)=>({label:name,color:COLORS[i%COLORS.length],values:Array.from({length:12},(_,m)=>a.find(x=>+x.month===m+1)?.GHI??null)}));
}
export function cockpitMetrics(rows,lat=0,tz="UTC"){
  const m=monthlyClimatology(rows,tz),beam=Array.from({length:12},()=>[]),dif=Array.from({length:12},()=>[]);
  const lr=+lat*Math.PI/180;
  rows.forEach(r=>{
    if(!finite(r.dni_wm2)||!finite(r.dhi_wm2))return;
    const p=localParts(r.t,tz),dy=localDoy(r.t,tz),decl=23.45*Math.sin((360/365*(dy-81))*Math.PI/180)*Math.PI/180;
    const cosz=clamp(Math.sin(lr)*Math.sin(decl)+Math.cos(lr)*Math.cos(decl),.05,1),mo=p.month-1;
    beam[mo].push(+r.dni_wm2*cosz);dif[mo].push(+r.dhi_wm2);
  });
  const kt=beam.map((b,i)=>{const bm=mean(b),dm=mean(dif[i]);return finite(bm)&&finite(dm)?clamp(bm/(bm+dm+1),0,1):null;});
  return {monthly:m,ghi:m.map(x=>x.ghi),dni:m.map(x=>x.dni),dhi:m.map(x=>x.dhi),tmean:m.map(x=>x.tmean),tmin:m.map(x=>x.tmin),tmax:m.map(x=>x.tmax),windmean:m.map(x=>x.windmean),windmax:m.map(x=>x.windmax),kt};
}
export function windSpeedTable(data){
  return data.labels.map((label,i)=>{const h=sum(data.counts.map(r=>r[i]));return {label,hours_per_year:data.total?Math.round(h*8760/data.total):0,pct:data.total?100*h/data.total:0};});
}
export function coldDaysByMonth(rows,tz="UTC",thresholds=[0,-5,-10,-20]){
  const days=new Map();
  rows.forEach(r=>{if(!finite(r.temp_c))return;const k=localDayKey(r.t,tz),p=localParts(r.t,tz);if(!days.has(k))days.set(k,{month:p.month,min:+r.temp_c});else days.get(k).min=Math.min(days.get(k).min,+r.temp_c);});
  const years=Math.max(1,new Set([...days.keys()].map(k=>k.slice(0,4))).size);
  return thresholds.map(th=>({threshold:th,months:Array.from({length:12},(_,m)=>[...days.values()].filter(x=>x.month===m+1&&x.min<th).length/years)}));
}
export function monthlyTable(rows,tz="UTC"){
  const m=monthlyClimatology(rows,tz);return m.map((x,i)=>({month:MONTHS[i],ghi:x.ghi,dni:x.dni,dhi:x.dhi,tmean:x.tmean,tmin:x.tmin,tmax:x.tmax,wind:x.windmean,snow:x.snow}));
}
