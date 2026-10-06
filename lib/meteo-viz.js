/* Factiun · Weather Workbench visual layer v1
   Canvas HiDPI, sin dependencias externas. Replica las familias visuales de
   SolarGPT Meteo sobre el contrato de lib/meteo-browser.js.
*/
export const VIZ_VERSION="1.0.0";
export const MONTHS=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const C={bg:"#101D30",grid:"#27405F",text:"#DCE3EB",muted:"#8C9AAB",amber:"#F09030",blue:"#68C0D8",red:"#E84858",green:"#62C88A",purple:"#A98AD9",pink:"#E8A0BF",yellow:"#E4C65A",white:"#F1F5F9"};
const COLORS=[C.amber,C.red,C.blue,C.green,C.purple,C.pink,C.yellow,"#6BB7A8"];
const finite=v=>Number.isFinite(+v);
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const sum=a=>a.reduce((s,x)=>s+x,0);
const minv=a=>{let m=Infinity;for(const x of a)if(finite(x)&&+x<m)m=+x;return m===Infinity?null:m};
const maxv=a=>{let m=-Infinity;for(const x of a)if(finite(x)&&+x>m)m=+x;return m===-Infinity?null:m};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fmt=(x,d=1)=>finite(x)?(+x).toFixed(d):"—";
const dayKey=t=>String(t||"").slice(0,10);
const monthOf=t=>new Date(t).getUTCMonth();
const doyOf=t=>{const d=new Date(t),y=d.getUTCFullYear();return Math.floor((d-Date.UTC(y,0,1))/86400000)+1};
const hourOf=t=>new Date(t).getUTCHours();

function prep(canvas,height=260){
  if(!canvas)return null;
  const w=Math.max(300,Math.round(canvas.clientWidth||canvas.parentElement?.clientWidth||800)),h=height,dpr=Math.min(3,window.devicePixelRatio||1);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  canvas.style.height=h+"px";
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
  if(xLabels.length){const n=xLabels.length;for(let i=0;i<n;i++){const x=L+pw*(n===1?.5:i/(n-1));ctx.fillText(xLabels[i],x-ctx.measureText(xLabels[i]).width/2,h-12);}}
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
  series.forEach((s,si)=>{ctx.strokeStyle=s.color||COLORS[si%COLORS.length];ctx.lineWidth=s.width||1.6;ctx.beginPath();let started=false;(s.values||[]).forEach((v,i)=>{if(!finite(v)){started=false;return;}const x=f.L+f.pw*(n===1?.5:i/(n-1)),y=f.y(+v);if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y);});ctx.stroke();});
  legend(ctx,series.map((s,i)=>({label:s.label||("S"+(i+1)),color:s.color||COLORS[i%COLORS.length]})),f.L+6,f.T+12);
}
export function drawBarChart(canvas,series,{title="",yLabel="",labels=MONTHS,height=250,yMin=0,yMax=null,stacked=false}={}){
  const p=prep(canvas,height);if(!p)return;const {ctx,w,h}=p,n=labels.length;
  const totals=Array.from({length:n},(_,i)=>stacked?sum(series.map(s=>finite(s.values[i])?+s.values[i]:0)):Math.max(...series.map(s=>finite(s.values[i])?+s.values[i]:0),0));
  const hi=yMax??Math.max(1,maxv(totals)||1)*1.12,f=frame(ctx,w,h,{title,xLabels:labels,yMin,yMax:hi,yLabel});
  const groupW=f.pw/n*.78;
  for(let i=0;i<n;i++){
    if(stacked){let bottom=f.y(0);series.forEach((s,si)=>{const v=finite(s.values[i])?+s.values[i]:0,y=f.y(v+(hi-(bottom-f.T)/f.ph*hi));ctx.fillStyle=s.color||COLORS[si%COLORS.length];const hh=bottom-y;ctx.fillRect(f.L+f.pw*(i+.5)/n-groupW/2,y,groupW,hh);bottom=y;});}
    else{const bw=groupW/Math.max(1,series.length);series.forEach((s,si)=>{const v=finite(s.values[i])?+s.values[i]:0,y=f.y(v),x=f.L+f.pw*(i+.5)/n-groupW/2+si*bw;ctx.fillStyle=s.color||COLORS[si%COLORS.length];ctx.fillRect(x,y,bw*.9,f.y(0)-y);});}
  }
  legend(ctx,series.map((s,i)=>({label:s.label||("S"+(i+1)),color:s.color||COLORS[i%COLORS.length]})),f.L+6,f.T+12);
}
function dtHours(rows){
  if(rows.length<2)return 1;const a=[];for(let i=1;i<Math.min(rows.length,500);i++){const d=(Date.parse(rows[i].t)-Date.parse(rows[i-1].t))/36e5;if(d>0&&d<24)a.push(d)}a.sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:1;
}
export function monthlyClimatology(rows){
  const dt=dtHours(rows),years=Math.max(1,new Set(rows.map(r=>new Date(r.t).getUTCFullYear())).size),out=Array.from({length:12},(_,m)=>({month:m+1,ghi:0,dni:0,dhi:0,t:[],wind:[],tmin:Infinity,tmax:-Infinity,snow:0}));
  rows.forEach(r=>{const a=out[monthOf(r.t)];if(finite(r.ghi_wm2))a.ghi+=Math.max(0,+r.ghi_wm2)*dt/1000/years;if(finite(r.dni_wm2))a.dni+=Math.max(0,+r.dni_wm2)*dt/1000/years;if(finite(r.dhi_wm2))a.dhi+=Math.max(0,+r.dhi_wm2)*dt/1000/years;if(finite(r.temp_c)){a.t.push(+r.temp_c);a.tmin=Math.min(a.tmin,+r.temp_c);a.tmax=Math.max(a.tmax,+r.temp_c)}if(finite(r.wind_ms))a.wind.push(+r.wind_ms*3.6);if(finite(r.snowfall_cm))a.snow+=Math.max(0,+r.snowfall_cm)/years;});
  return out.map(a=>({...a,tmean:mean(a.t),windmean:mean(a.wind),windmax:maxv(a.wind),tmin:a.tmin===Infinity?null:a.tmin,tmax:a.tmax===-Infinity?null:a.tmax}));
}
export function dailyMeanSeries(rows){
  const by=new Map();rows.forEach(r=>{const k=dayKey(r.t);if(!by.has(k))by.set(k,{ghi:[],dni:[],dhi:[]});const a=by.get(k);if(finite(r.ghi_wm2))a.ghi.push(+r.ghi_wm2);if(finite(r.dni_wm2))a.dni.push(+r.dni_wm2);if(finite(r.dhi_wm2))a.dhi.push(+r.dhi_wm2);});
  return [...by.entries()].sort().map(([date,a])=>({date,ghi:mean(a.ghi),dni:mean(a.dni),dhi:mean(a.dhi)}));
}
export function dayProfile(rows,date){
  return rows.filter(r=>dayKey(r.t)===date).sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
}
export function peakDay(rows,key="ghi_wm2"){
  const by=new Map();rows.forEach(r=>{if(finite(r[key]))by.set(dayKey(r.t),(by.get(dayKey(r.t))||0)+Math.max(0,+r[key]));});
  let best=null,v=-Infinity;for(const [k,x] of by)if(x>v){best=k;v=x}return best;
}
export function dailyClimatology(rows){
  const years=Math.max(1,new Set(rows.map(r=>new Date(r.t).getUTCFullYear())).size),days=Array.from({length:366},()=>({ghi:[],dni:[],dhi:[],tmean:[],tmin:[],tmax:[],windmax:[],windworst:[]}));
  const byDayYear=new Map();
  rows.forEach(r=>{const d=new Date(r.t),k=d.getUTCFullYear()+"-"+doyOf(r.t);if(!byDayYear.has(k))byDayYear.set(k,{doy:doyOf(r.t),ghi:[],dni:[],dhi:[],t:[],wind:[]});const a=byDayYear.get(k);if(finite(r.ghi_wm2))a.ghi.push(+r.ghi_wm2);if(finite(r.dni_wm2))a.dni.push(+r.dni_wm2);if(finite(r.dhi_wm2))a.dhi.push(+r.dhi_wm2);if(finite(r.temp_c))a.t.push(+r.temp_c);if(finite(r.wind_ms))a.wind.push(+r.wind_ms*3.6);});
  for(const a of byDayYear.values()){const x=days[a.doy-1];x.ghi.push(maxv(a.ghi));x.dni.push(maxv(a.dni));x.dhi.push(maxv(a.dhi));x.tmean.push(mean(a.t));x.tmin.push(minv(a.t));x.tmax.push(maxv(a.t));x.windmax.push(maxv(a.wind));x.windworst.push(maxv(a.wind));}
  return days.map((a,i)=>({doy:i+1,ghi:mean(a.ghi),dni:mean(a.dni),dhi:mean(a.dhi),tmean:mean(a.tmean.filter(finite)),tmin:mean(a.tmin.filter(finite)),tmax:mean(a.tmax.filter(finite)),wind:mean(a.windmax.filter(finite)),windWorst:maxv(a.windworst)}));
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
export function snowSummary(rows){
  const months=Array(12).fill(0),days=new Set();let total=0,maxDepth=0,hasDepth=false;rows.forEach(r=>{if(finite(r.snowfall_cm)&&+r.snowfall_cm>0){months[monthOf(r.t)]+=+r.snowfall_cm;total+=+r.snowfall_cm;if(+r.snowfall_cm>.1)days.add(dayKey(r.t));}if(finite(r.snow_depth_m)){hasDepth=true;maxDepth=Math.max(maxDepth,+r.snow_depth_m*100);}});
  const span=rows.length?(Date.parse(rows.at(-1).t)-Date.parse(rows[0].t))/864e5:0,years=span/365.25,annualize=years>=.98;return {months:annualize?months.map(x=>x/years):months,total,days:days.size,maxDepth:hasDepth?maxDepth:null,years,annualize};
}
export function drawHailRisk(canvas,risk){
  const p=prep(canvas,245);if(!p)return;const {ctx,w,h}=p,life=Math.max(1,risk.design_life_yr||25),xs=Array.from({length:life+1},(_,i)=>i),mid=xs.map(y=>100*(1-Math.exp(-risk.lambda_yr*y))),lo=xs.map(y=>100*(1-Math.exp(-risk.lambda_lo*y))),hi=xs.map(y=>100*(1-Math.exp(-risk.lambda_hi*y))),f=frame(ctx,w,h,{title:"Riesgo acumulado de granizo dañino",xLabels:["0","","",String(life)],yMin:0,yMax:100,yLabel:"P(≥1) %"});
  ctx.fillStyle="rgba(232,72,88,.13)";ctx.beginPath();xs.forEach((x,i)=>{const px=f.L+f.pw*x/life,py=f.y(hi[i]);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)});for(let i=xs.length-1;i>=0;i--){ctx.lineTo(f.L+f.pw*xs[i]/life,f.y(lo[i]))}ctx.closePath();ctx.fill();
  drawLineChartOnFrame(ctx,f,[{values:mid,color:C.red,label:"λ central"}]);
}
function drawLineChartOnFrame(ctx,f,series){
  const n=Math.max(...series.map(s=>s.values.length),1);series.forEach((s,si)=>{ctx.strokeStyle=s.color||COLORS[si];ctx.lineWidth=2;ctx.beginPath();let on=false;(s.values||[]).forEach((v,i)=>{if(!finite(v))return;const x=f.L+f.pw*(n===1?.5:i/(n-1)),y=f.y(v);if(!on){ctx.moveTo(x,y);on=true}else ctx.lineTo(x,y)});ctx.stroke();});legend(ctx,series.map((s,i)=>({label:s.label,color:s.color||COLORS[i]})),f.L+6,f.T+12);
}
export function windDailyMax(series,year){
  const days=[];for(let i=0;i<series.length;i+=24)days.push(maxv(series.slice(i,i+24)));return days;
}
export function comparisonMonthly(results){
  return Object.entries(results||{}).map(([name,a],i)=>({label:name,color:COLORS[i%COLORS.length],values:Array.from({length:12},(_,m)=>a.find(x=>+x.month===m+1)?.GHI??null)}));
}
export function cockpitMetrics(rows){
  const m=monthlyClimatology(rows);
  const kt=m.map(x=>{const beam=finite(x.dni)?x.dni:null;if(!finite(beam)||!finite(x.dhi))return null;return clamp(beam/(beam+x.dhi+1),0,1);});
  return {
    monthly:m,
    ghi:m.map(x=>x.ghi),dni:m.map(x=>x.dni),dhi:m.map(x=>x.dhi),
    tmean:m.map(x=>x.tmean),tmin:m.map(x=>x.tmin),tmax:m.map(x=>x.tmax),
    windmean:m.map(x=>x.windmean),windmax:m.map(x=>x.windmax),kt
  };
}
export function windSpeedTable(data){
  return data.labels.map((label,i)=>{const h=sum(data.counts.map(r=>r[i]));return {label,hours_per_year:data.total?Math.round(h*8760/data.total):0,pct:data.total?100*h/data.total:0};});
}
export function monthlyTable(rows){
  const m=monthlyClimatology(rows);return m.map((x,i)=>({month:MONTHS[i],ghi:x.ghi,dni:x.dni,dhi:x.dhi,tmean:x.tmean,tmin:x.tmin,tmax:x.tmax,wind:x.windmean,snow:x.snow}));
}
