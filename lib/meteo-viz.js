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
  return escala(lo,hi);
}
// Escala de 4 tramos con un paso redondo (1, 1,25, 1,5, 2, 2,5, 3, 4, 5, 6, 7,5 u 8 × 10^k). Si el dato no
// baja de cero, el eje empieza en 0: antes se le restaba un 8 % de margen y la
// irradiancia salía con −36 o −79 W/m² en el eje.
export function escala(lo,hi){
  if(!(hi>lo)){const d=Math.abs(lo)||1;hi=lo+d;lo=lo>=0?Math.max(0,lo-d):lo-d;}
  const cero=lo>=0;
  for(const k of [-3,-2,-1,0,1,2,3,4,5,6]){
    for(const m of [1,1.25,1.5,2,2.5,3,4,5,6,7.5,8]){
      const paso=m*Math.pow(10,k),a=cero?0:Math.floor(lo/paso)*paso;
      if(a+4*paso>=hi-1e-9)return [+a.toFixed(6),+(a+4*paso).toFixed(6)];
    }
  }
  return [lo,hi];
}
function frame(ctx,w,h,{title="",xLabels=[],yMin=0,yMax=1,yLabel="",leyenda=[],xCentro=false}={}){
  // Las cifras del eje van alineadas a la derecha, pegadas al gráfico, y el
  // rótulo del eje (girado) tiene su propia franja a la izquierda: antes las
  // dos cosas empezaban en x≈6–13 y una cifra de 2–3 dígitos pisaba el rótulo.
  ctx.font="11px system-ui";
  const paso=(yMax-yMin)/4,dec=Math.min(2,(String(+paso.toFixed(6)).split(".")[1]||"").length),ticks=[0,1,2,3,4].map(i=>fmt(yMax-paso*i,dec));
  const anchoTicks=Math.max(...ticks.map(t=>ctx.measureText(t).width));
  // La leyenda va en la cabecera, a la derecha del título; si no cabe, en una
  // línea propia debajo. Nunca dentro del área de datos, donde las líneas
  // (los umbrales de stow, por ejemplo) le pasaban por encima.
  const L=Math.max(52,Math.ceil((yLabel?24:6)+anchoTicks+8)),R=18,B=36;
  ctx.font="600 12px system-ui";const anchoTit=title?ctx.measureText(title).width:0;
  const anchoLey=anchoLeyenda(ctx,leyenda),enLinea=!leyenda.length||L+anchoTit+24+anchoLey<=w-R;
  const T=enLinea?30:44,pw=w-L-R,ph=h-T-B;ctx.font="11px system-ui";
  ctx.strokeStyle=C.grid;ctx.fillStyle=C.muted;ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=T+ph*i/4;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();ctx.fillText(ticks[i],L-6-ctx.measureText(ticks[i]).width,y+4);}
  // xCentro: cada rótulo bajo el centro de su tramo (barras), no repartidos de borde a borde (líneas).
  if(xLabels.length){const n=xLabels.length;for(let i=0;i<n;i++){const x=L+pw*(xCentro?(i+.5)/n:n===1 ? .5:i/(n-1));ctx.fillText(xLabels[i],x-ctx.measureText(xLabels[i]).width/2,h-12);}}
  ctx.fillStyle=C.text;ctx.font="600 12px system-ui";ctx.fillText(title,L,17);
  if(leyenda.length)legend(ctx,leyenda,enLinea?w-R-anchoLey:L,enLinea?17:33);
  if(yLabel){ctx.save();ctx.translate(12,T+ph/2);ctx.rotate(-Math.PI/2);ctx.fillStyle=C.muted;ctx.fillText(yLabel,-ctx.measureText(yLabel).width/2,0);ctx.restore();}
  return {L,R,T,B,pw,ph,x:v=>L+pw*v,y:v=>T+ph*(1-(v-yMin)/(yMax-yMin))};
}
function anchoLeyenda(ctx,items){
  if(!items.length)return 0;ctx.font="10px system-ui";
  return items.reduce((a,it)=>a+14+ctx.measureText(it.label).width+14,0)-14;
}
function legend(ctx,items,x,y){
  ctx.font="10px system-ui";let dx=x;
  items.forEach((it,i)=>{ctx.fillStyle=it.color;ctx.fillRect(dx,y-8,10,3);dx+=14;ctx.fillStyle=C.muted;ctx.fillText(it.label,dx,y);dx+=ctx.measureText(it.label).width+14;});
}
export function drawLineChart(canvas,series,{title="",yLabel="",xLabels=null,height=260,yMin=null,yMax=null,zero=false,markers=false}={}){
  const p=prep(canvas,height);if(!p)return;const {ctx,w,h}=p;
  const all=series.map(s=>s.values||[]),[lo0,hi0]=bounds(all,zero),lo=yMin??lo0,hi=yMax??hi0,n=Math.max(...series.map(s=>s.values.length),1);
  const labels=xLabels||Array.from({length:n},(_,i)=>i===0?"1":i===n-1?String(n):"");
  const ley=series.map((s,i)=>({label:s.label||("S"+(i+1)),color:s.color||COLORS[i%COLORS.length]}));
  const f=frame(ctx,w,h,{title,xLabels:labels,yMin:lo,yMax:hi,yLabel,leyenda:ley});
  series.forEach((s,si)=>{ctx.strokeStyle=s.color||COLORS[si%COLORS.length];ctx.lineWidth=s.width||1.6;ctx.beginPath();let started=false;(s.values||[]).forEach((v,i)=>{if(!finite(v)){started=false;return;}const x=f.L+f.pw*(n===1 ? .5:i/(n-1)),y=f.y(+v);if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y);});ctx.stroke();if(markers){ctx.fillStyle=s.color||COLORS[si%COLORS.length];(s.values||[]).forEach((v,i)=>{if(!finite(v))return;const x=f.L+f.pw*(n===1?.5:i/(n-1)),y=f.y(+v);ctx.beginPath();ctx.arc(x,y,1.8,0,Math.PI*2);ctx.fill();});}});
}
export function drawBarChart(canvas,series,{title="",yLabel="",labels=MONTHS,height=250,yMin=0,yMax=null,stacked=false,centerLabels=false}={}){
  const p=prep(canvas,height);if(!p)return;const {ctx,w,h}=p,n=labels.length;
  const totals=Array.from({length:n},(_,i)=>stacked?sum(series.map(s=>finite(s.values[i])?+s.values[i]:0)):Math.max(...series.map(s=>finite(s.values[i])?+s.values[i]:0),0));
  const ley=series.map((s,i)=>({label:s.label||("S"+(i+1)),color:s.color||COLORS[i%COLORS.length]}));
  const hi=yMax??escala(yMin,Math.max(maxv(totals)||0,yMin+1e-9))[1],f=frame(ctx,w,h,{title,xLabels:labels,yMin,yMax:hi,yLabel,leyenda:ley,xCentro:centerLabels});
  const groupW=f.pw/n*.78;
  for(let i=0;i<n;i++){
    if(stacked){let bottom=f.y(0);series.forEach((s,si)=>{const v=finite(s.values[i])?+s.values[i]:0,y=f.y(v+(hi-(bottom-f.T)/f.ph*hi));ctx.fillStyle=s.color||COLORS[si%COLORS.length];const hh=bottom-y;ctx.fillRect(f.L+f.pw*(i+.5)/n-groupW/2,y,groupW,hh);bottom=y;});}
    else{const bw=groupW/Math.max(1,series.length);series.forEach((s,si)=>{if(!finite(s.values[i]))return;const v=+s.values[i],y=f.y(v),x=f.L+f.pw*(i+.5)/n-groupW/2+si*bw;ctx.fillStyle=s.color||COLORS[si%COLORS.length];ctx.fillRect(x,y,bw*.9,f.y(0)-y);});}
  }
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
  const p=prep(canvas,430);if(!p)return;const {ctx,w,h}=p,cx=Math.min(w*.46,(w-170)/2+10),cy=h*.52,R=Math.min(w*.34,h*.38,cx-40,w-170-cx-46),n=16,ang=2*Math.PI/n,sectorTotals=data.freq.map(a=>sum(a)),maxPct=Math.max(1,maxv(sectorTotals)||1);
  ctx.strokeStyle=C.grid;ctx.fillStyle=C.muted;ctx.font="10px system-ui";
  for(let q=1;q<=4;q++){ctx.beginPath();ctx.arc(cx,cy,R*q/4,0,Math.PI*2);ctx.stroke();}
  for(let i=0;i<n;i++){const th=i*ang-Math.PI/2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+R*Math.cos(th),cy+R*Math.sin(th));ctx.stroke();}
  const cols=[C.blue,C.green,C.yellow,C.amber,C.red,C.purple];
  for(let d=0;d<n;d++){let base=0;for(let s=0;s<6;s++){const v=data.freq[d][s],r0=R*base/maxPct,r1=R*(base+v)/maxPct,a0=d*ang-ang*.45-Math.PI/2,a1=d*ang+ang*.45-Math.PI/2;ctx.beginPath();ctx.arc(cx,cy,r1,a0,a1);ctx.arc(cx,cy,r0,a1,a0,true);ctx.closePath();ctx.fillStyle=cols[s];ctx.fill();base+=v;}}
  {const th=(101.25-90)*Math.PI/180;ctx.font="10px system-ui";
   for(let q=1;q<=4;q++){const t=fmt(maxPct*q/4,1)+"%",tw=ctx.measureText(t).width,x=cx+R*q/4*Math.cos(th),y=cy+R*q/4*Math.sin(th);
     ctx.fillStyle="rgba(16,29,48,.82)";ctx.fillRect(x-tw/2-3,y-7,tw+6,13);ctx.fillStyle=C.muted;ctx.fillText(t,x-tw/2,y+3);}}
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
  // En horas/año, como la tabla de al lado (antes, horas sumadas de todo el
  // periodo, con un eje de 3610,0 · 2707,5…), y con escala redonda.
  const n=(data.values||[]).length,porAno=n?8760/n:1,vals=(data.hist||[]).map(v=>v*porAno),p=prep(canvas,250);if(!p)return;const {ctx,w,h}=p,hi=escala(0,Math.max(maxv(vals)||0,1e-9))[1],f=frame(ctx,w,h,{title:"Histograma de temperatura · Tmin "+fmt(data.min,1)+"°C · Tmax "+fmt(data.max,1)+"°C · Tmedia "+fmt(data.mean,1)+"°C",xLabels:[fmt(data.lo,0),"",fmt((data.lo+data.hi)/2,0),"",fmt(data.hi,0)],yMin:0,yMax:hi,yLabel:"Horas/año"});
  const bw=f.pw/Math.max(vals.length,1);vals.forEach((v,i)=>{const tc=data.lo+(i+.5)*(data.hi-data.lo)/vals.length;ctx.fillStyle=tc<-10?C.blue:tc<0?"#4F93D1":tc<25?C.muted:tc<35?C.amber:C.red;const y=f.y(v);ctx.fillRect(f.L+i*bw,y,Math.max(1,bw-.5),f.y(0)-y);});
}
export function snowSummary(rows,tz="UTC"){
  const months=Array(12).fill(0),days=new Set();let total=0,maxDepth=0,hasDepth=false;rows.forEach(r=>{if(finite(r.snowfall_cm)&&+r.snowfall_cm>0){months[monthOf(r.t,tz)]+=+r.snowfall_cm;total+=+r.snowfall_cm;if(+r.snowfall_cm>.1)days.add(localDayKey(r.t,tz));}if(finite(r.snow_depth_m)){hasDepth=true;maxDepth=Math.max(maxDepth,+r.snow_depth_m*100);}});
  const span=rows.length?(Date.parse(rows.at(-1).t)-Date.parse(rows[0].t))/864e5:0,years=span/365.25,annualize=years>=.98;return {months:annualize?months.map(x=>x/years):months,total,days:days.size,maxDepth:hasDepth?maxDepth:null,years,annualize};
}
export function drawHailRisk(canvas,risk){
  const p=prep(canvas,245);if(!p)return;const {ctx,w,h}=p,life=Math.max(1,risk.design_life_yr||25),xs=Array.from({length:life+1},(_,i)=>i),mid=xs.map(y=>100*(1-Math.exp(-risk.lambda_yr*y))),lo=xs.map(y=>100*(1-Math.exp(-risk.lambda_lo*y))),hi=xs.map(y=>100*(1-Math.exp(-risk.lambda_hi*y))),f=frame(ctx,w,h,{title:"Probabilidad de ≥1 episodio en "+life+" años",xLabels:["0","","",String(life)],yMin:0,yMax:100,yLabel:"P(≥1) %",leyenda:[{label:"λ central",color:C.red}]});
  ctx.fillStyle="rgba(232,72,88,.13)";ctx.beginPath();xs.forEach((x,i)=>{const px=f.L+f.pw*x/life,py=f.y(hi[i]);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)});for(let i=xs.length-1;i>=0;i--){ctx.lineTo(f.L+f.pw*xs[i]/life,f.y(lo[i]))}ctx.closePath();ctx.fill();
  drawLineChartOnFrame(ctx,f,[{values:mid,color:C.red,label:"λ central"}]);
}
function drawLineChartOnFrame(ctx,f,series){
  const n=Math.max(...series.map(s=>s.values.length),1);series.forEach((s,si)=>{ctx.strokeStyle=s.color||COLORS[si];ctx.lineWidth=2;ctx.beginPath();let on=false;(s.values||[]).forEach((v,i)=>{if(!finite(v))return;const x=f.L+f.pw*(n===1 ? .5:i/(n-1)),y=f.y(v);if(!on){ctx.moveTo(x,y);on=true}else ctx.lineTo(x,y)});ctx.stroke();});
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

/* ───────── Lógica de viento · alarmas en el tiempo ─────────
 * Cuatro gráficas que no son barras: un calendario de alarmas (día × hora), un reloj de 24 h,
 * una nube duración × racha y las curvas de excedencia de cada HSU. Reciben datos ya calculados
 * por lib/meteo-wind-logic.js; aquí solo se dibuja.
 *
 * Dos temas: «oscuro», el de la página, y «claro», para el informe impreso (fondo blanco y la
 * misma letra que el texto). `width` y `dpr` permiten dibujar en un lienzo que no está en la
 * página, al tamaño exacto con que irá en el informe. */
const TEMAS={
  oscuro:{bg:C.bg,grid:C.grid,eje:"rgba(39,64,95,.9)",text:C.text,muted:C.muted,pre:C.amber,stow:C.red,
    dia:"rgba(104,192,216,.13)",noche:null,franja:{label:"De día",color:"rgba(104,192,216,.55)"},
    sinDato:"rgba(140,154,171,.20)",sinDatoLey:"rgba(140,154,171,.6)",puntoPre:"rgba(240,144,48,.62)",puntoStow:"rgba(232,72,88,.78)",
    umbralStow:"rgba(232,72,88,.7)",fondoRotulo:"rgba(16,29,48,.85)",sensores:[C.blue,C.green,C.purple,C.yellow,C.pink,"#6BB7A8",C.white],font:"system-ui"},
  claro:{bg:"#FFFFFF",grid:"#D9DEE3",eje:"#C3CAD2",text:"#1A1D21",muted:"#4F565E",pre:"#E8891C",stow:"#CF3347",
    dia:"#FFFFFF",noche:"#E9EDF2",franja:{label:"De noche",color:"#C5CDD6"},
    sinDato:"rgba(120,128,136,.16)",trama:"rgba(84,92,100,.55)",sinDatoLey:"#8A929B",puntoPre:"rgba(232,137,28,.68)",puntoStow:"rgba(207,51,71,.82)",
    umbralStow:"rgba(207,51,71,.75)",fondoRotulo:"rgba(255,255,255,.9)",sensores:["#1F6FB2","#2E9E62","#7D5BBF","#B8860B","#C2507F","#3A9A8A","#444444"],
    font:"'Iowan Old Style','Palatino Linotype','Book Antiqua',Palatino,'URW Palladio L',P052,Georgia,serif"}
};
function lienzo(canvas,height,{width=null,dpr=null,tema="oscuro"}={}){
  if(!canvas)return null;
  const K=TEMAS[tema]||TEMAS.oscuro,w=Math.max(300,Math.round(width||canvas.clientWidth||canvas.parentElement?.clientWidth||800)),h=height;
  const d=dpr||Math.min(3,(typeof window!=="undefined"&&window.devicePixelRatio)||1);
  if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);}
  if(canvas.style)canvas.style.height=h+"px";
  if(canvas.dataset)canvas.dataset.drawn="1";
  const ctx=canvas.getContext("2d");ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle=K.bg;ctx.fillRect(0,0,w,h);
  return {ctx,w,h,K};
}
/* Título a la izquierda y leyenda a la derecha (o en su línea si no cabe). Devuelve dónde empieza el gráfico. */
function cabecera(ctx,w,K,title,items,L=46,R=16){
  ctx.fillStyle=K.text;ctx.font="600 12px "+K.font;if(title)ctx.fillText(title,L,17);
  const anchoTit=title?ctx.measureText(title).width+24:0;
  ctx.font="10px "+K.font;
  const ancho=items.reduce((t,it)=>t+14+ctx.measureText(it.label).width+14,0)-(items.length?14:0),enLinea=L+anchoTit+ancho<=w-R;
  let dx=enLinea?w-R-ancho:L;const y=enLinea?17:33;
  for(const it of items){ctx.fillStyle=it.color;ctx.fillRect(dx,y-(it.bloque?8:6),10,it.bloque?8:3);dx+=14;ctx.fillStyle=K.muted;ctx.fillText(it.label,dx,y);dx+=ctx.measureText(it.label).width+14;}
  return enLinea?30:46;
}
export function drawAlarmCalendar(canvas,r,{title="Calendario de alarmas",height=340,...lz}={}){
  const p=lienzo(canvas,height,lz);if(!p)return;const {ctx,w,h,K}=p,L=46,R=16,B=30;
  const T=cabecera(ctx,w,K,title,[{label:"Pre-stow",color:K.pre,bloque:true},{label:"Stow",color:K.stow,bloque:true},{...K.franja,bloque:true},{label:"Sin dato",color:K.sinDatoLey,bloque:true}],L,R);
  const pw=w-L-R,ph=h-T-B,n=Math.max(1,r?.days||1),cw=pw/n,X=d=>L+d*cw,Y=hh=>T+ph*hh/24;
  // la noche y el día: en oscuro se aclara el día; en claro se agrisa la noche
  const sun=r?.sun||[];
  if(K.noche&&sun.length){ctx.fillStyle=K.noche;ctx.fillRect(L,T,pw,ph);}
  if(sun.length){
    ctx.fillStyle=K.dia;ctx.beginPath();ctx.moveTo(X(0),Y(sun[0].rise));
    for(const x of sun)ctx.lineTo(X(x.day+.5),Y(x.rise));
    ctx.lineTo(X(n),Y(sun[sun.length-1].rise));ctx.lineTo(X(n),Y(sun[sun.length-1].set));
    for(let i=sun.length-1;i>=0;i--)ctx.lineTo(X(sun[i].day+.5),Y(sun[i].set));
    ctx.lineTo(X(0),Y(sun[0].set));ctx.closePath();ctx.fill();
  }
  // días sin dato, agrupados en tramos seguidos
  ctx.fillStyle=K.sinDato;
  const nd=r?.noData||[];
  for(let i=0;i<nd.length;){
    let j=i;while(j+1<nd.length&&nd[j+1]===nd[j]+1)j++;
    const x0=X(nd[i]),an=(nd[j]-nd[i]+1)*cw;ctx.fillRect(x0,T,an,ph);
    if(K.trama){                                                     // rayado en diagonal, recortado al tramo
      ctx.save();ctx.beginPath();ctx.rect(x0,T,an,ph);ctx.clip();ctx.strokeStyle=K.trama;ctx.lineWidth=.8;ctx.beginPath();
      for(let d=-ph;d<an;d+=5){ctx.moveTo(x0+d,T+ph);ctx.lineTo(x0+d+ph,T);}
      ctx.stroke();ctx.restore();
    }
    i=j+1;
  }
  // horas
  ctx.font="11px "+K.font;ctx.lineWidth=1;
  for(const hh of [0,6,12,18,24]){
    const y=Math.round(Y(hh))+.5;ctx.strokeStyle=K.grid;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();
    const t=hh+" h";ctx.fillStyle=K.muted;ctx.fillText(t,L-7-ctx.measureText(t).width,y+4);
  }
  // meses
  let ultimo=-1e9;
  for(const m of r?.months||[]){
    const x=Math.round(X(m.day))+.5;ctx.strokeStyle=K.eje;ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,T+ph+4);ctx.stroke();
    if(x-ultimo>=46&&x+30<w){ctx.fillStyle=K.muted;ctx.fillText(m.label,x+3,h-11);ultimo=x;}
  }
  // tramos en alarma: primero pre-stow, encima stow
  const ancho=Math.max(cw-(cw>5?1:0),1);
  for(const tipo of ["prestow","stow"]){
    ctx.fillStyle=tipo==="stow"?K.stow:K.pre;
    for(const x of r?.segments||[])if(x.type===tipo){const y=Y(x.from);ctx.fillRect(X(x.day),y,ancho,Math.max(1,Y(x.to)-y));}
  }
  ctx.strokeStyle=K.grid;ctx.strokeRect(L+.5,T+.5,pw-1,ph-1);
}
export function drawAlarmClock(canvas,clock,{title="Reloj de 24 h",height=250,...lz}={}){
  const p=lienzo(canvas,height,lz);if(!p)return;const {ctx,w,h,K}=p;
  const T=cabecera(ctx,w,K,title,[{label:"Pre-stow",color:K.pre,bloque:true},{label:"Stow",color:K.stow,bloque:true}],12,12);
  const cx=w/2,cy=T+(h-T-6)/2,Rm=Math.max(40,Math.min(w/2-30,(h-T-6)/2-16)),r0=Rm*.18;
  const pre=clock?.prestow||[],stw=clock?.stow||[],top=Math.max(.1,...pre,...stw),tope=[1,2,5,10,20,25,50,100].find(v=>v>=top)||100;
  const rad=v=>r0+(Rm-r0)*Math.min(1,v/tope),ang=hh=>-Math.PI/2+hh*Math.PI/12;
  ctx.lineWidth=1;
  for(const v of [tope/2,tope]){ctx.strokeStyle=K.grid;ctx.beginPath();ctx.arc(cx,cy,rad(v),0,Math.PI*2);ctx.stroke();}
  for(let hh=0;hh<24;hh+=3){ctx.strokeStyle=K.eje;ctx.beginPath();ctx.moveTo(cx+r0*Math.cos(ang(hh)),cy+r0*Math.sin(ang(hh)));ctx.lineTo(cx+Rm*Math.cos(ang(hh)),cy+Rm*Math.sin(ang(hh)));ctx.stroke();}
  const cuña=(hh,v,color)=>{
    if(!(v>0))return;const a0=ang(hh)+.012,a1=ang(hh+1)-.012;
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(cx,cy,rad(v),a0,a1);ctx.arc(cx,cy,r0,a1,a0,true);ctx.closePath();ctx.fill();
  };
  for(let hh=0;hh<24;hh++){cuña(hh,pre[hh],K.pre);cuña(hh,stw[hh],K.stow);}
  // escala de los anillos, entre las 4 y las 5 h, sobre un fondo que la separa de las cuñas
  ctx.font="10px "+K.font;
  for(const v of [tope/2,tope]){
    const t=String(v).replace(".",",")+" %",a=ang(4.5),x=cx+rad(v)*Math.cos(a),y=cy+rad(v)*Math.sin(a),an=ctx.measureText(t).width;
    ctx.fillStyle=K.fondoRotulo;ctx.fillRect(x-an/2-3,y-8,an+6,13);ctx.fillStyle=K.muted;ctx.fillText(t,x-an/2,y+2);
  }
  ctx.font="11px "+K.font;ctx.fillStyle=K.muted;
  for(let hh=0;hh<24;hh+=3){const t=hh+" h",a=ang(hh),x=cx+(Rm+13)*Math.cos(a),y=cy+(Rm+13)*Math.sin(a);ctx.fillText(t,x-ctx.measureText(t).width/2,y+4);}
}
export function drawEpisodeScatter(canvas,points,{title="Duración y racha máxima",height=250,stowKmh=60,...lz}={}){
  const p=lienzo(canvas,height,lz);if(!p)return;const {ctx,w,h,K}=p,L=46,R=14,B=34;
  const T=cabecera(ctx,w,K,title,[{label:"Solo pre-stow",color:K.pre,bloque:true},{label:"Llega a stow",color:K.stow,bloque:true}],L,R);
  const pts=(points||[]).filter(e=>e.durationMin>0&&finite(e.peakKmh)),pw=w-L-R,ph=h-T-B;
  // Eje de duración logarítmico, con marcas que se leen de corrido: de 30 min a varios días.
  const MARCAS=[[.5,"30 min"],[1,"1 h"],[2,"2 h"],[4,"4 h"],[8,"8 h"],[16,"16 h"],[24,"1 d"],[48,"2 d"],[96,"4 d"],[192,"8 d"],[384,"16 d"],[768,"32 d"]];
  const maxH=Math.max(8,...pts.map(e=>e.durationMin/60)),fin=(MARCAS.find(m=>m[0]>=maxH)||MARCAS[MARCAS.length-1])[0],k0=-1,k1=Math.log2(fin);
  const lo=Math.floor(Math.min(stowKmh-20,...pts.map(e=>e.peakKmh))/10)*10,hi=Math.max(stowKmh+10,Math.ceil(Math.max(...pts.map(e=>e.peakKmh),0)/10)*10);
  const X=min=>L+pw*(Math.log2(Math.max(min,30)/60)-k0)/(k1-k0),Y=v=>T+ph*(1-(v-lo)/(hi-lo));
  ctx.font="11px "+K.font;ctx.lineWidth=1;
  const paso=(hi-lo)<=40?10:20;
  for(let v=lo;v<=hi;v+=paso){const y=Math.round(Y(v))+.5;ctx.strokeStyle=K.grid;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();const t=String(v);ctx.fillStyle=K.muted;ctx.fillText(t,L-6-ctx.measureText(t).width,y+4);}
  let ultimo=-1e9;
  for(const [hrs,t] of MARCAS){
    if(hrs>fin)break;
    const x=L+pw*(Math.log2(hrs)-k0)/(k1-k0),an=ctx.measureText(t).width,x0=Math.min(Math.max(L,x-an/2),w-R-an);
    ctx.strokeStyle=K.eje;ctx.beginPath();ctx.moveTo(Math.round(x)+.5,T);ctx.lineTo(Math.round(x)+.5,T+ph);ctx.stroke();
    if(x0-ultimo>=8){ctx.fillStyle=K.muted;ctx.fillText(t,x0,h-14);ultimo=x0+an;}
  }
  ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle=K.umbralStow;const ys=Math.round(Y(stowKmh))+.5;ctx.beginPath();ctx.moveTo(L,ys);ctx.lineTo(w-R,ys);ctx.stroke();ctx.restore();
  ctx.save();ctx.translate(12,T+ph/2);ctx.rotate(-Math.PI/2);ctx.fillStyle=K.muted;ctx.fillText("racha máxima (km/h)",-ctx.measureText("racha máxima (km/h)").width/2,0);ctx.restore();
  for(const tipo of [false,true]){
    ctx.fillStyle=tipo?K.puntoStow:K.puntoPre;
    for(const e of pts)if((e.peakKmh>stowKmh)===tipo){ctx.beginPath();ctx.arc(X(e.durationMin),Y(e.peakKmh),tipo?3:2.6,0,Math.PI*2);ctx.fill();}
  }
}
export function drawExceedance(canvas,sensors,{title="Tiempo por encima de cada velocidad",height=250,from=30,marks=[],...lz}={}){
  const p=lienzo(canvas,height,lz);if(!p)return;const {ctx,w,h,K}=p,L=58,R=14,B=34;
  const lista=(sensors||[]).filter(x=>x.hist&&x.dataMinutes>0);
  const T=cabecera(ctx,w,K,title,lista.map((x,i)=>({label:x.label,color:K.sensores[i%K.sensores.length]})),L,R);
  const pw=w-L-R,ph=h-T-B,pico=Math.max(from+30,...lista.map(x=>{let k=x.hist.length-1;while(k>0&&!x.hist[k])k--;return k+1;}));
  const xMax=Math.ceil(pico/10)*10,d0=-3,d1=2;                        // de 0,001 % a 100 % del tiempo
  const X=v=>L+pw*(v-from)/(xMax-from),Y=pct=>T+ph*(1-(Math.log10(pct)-d0)/(d1-d0));
  ctx.font="11px "+K.font;ctx.lineWidth=1;
  for(let d=d0;d<=d1;d++){const y=Math.round(Y(10**d))+.5;ctx.strokeStyle=K.grid;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(w-R,y);ctx.stroke();
    const t=String(+(10**d).toFixed(3)).replace(".",",")+" %";ctx.fillStyle=K.muted;ctx.fillText(t,L-6-ctx.measureText(t).width,y+4);}
  const cada=(xMax-from)/10>Math.floor(pw/40)?20:10;
  for(let v=Math.ceil(from/cada)*cada;v<=xMax;v+=cada){const t=String(v),x=X(v);ctx.fillStyle=K.muted;ctx.fillText(t,x-ctx.measureText(t).width/2,h-14);}
  ctx.fillStyle=K.muted;ctx.fillText("km/h",w-R-ctx.measureText("km/h").width,h-2);
  for(const m of marks){if(!(m.v>from&&m.v<xMax))continue;const x=Math.round(X(m.v))+.5,color=m.tipo==="stow"?K.stow:m.tipo==="prestow"?K.pre:(m.color||K.muted);
    ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle=color;ctx.globalAlpha=.8;ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,T+ph);ctx.stroke();ctx.restore();
    ctx.fillStyle=color;ctx.fillText(m.label,x+4,T+11);}
  lista.forEach((x,i)=>{
    ctx.strokeStyle=K.sensores[i%K.sensores.length];ctx.lineWidth=1.8;ctx.beginPath();
    let sobre=0,empezado=false;const cola=new Float64Array(x.hist.length+1);
    for(let k=x.hist.length-1;k>=0;k--){sobre+=x.hist[k];cola[k]=sobre;}
    for(let v=from;v<=xMax&&v<x.hist.length;v++){
      const pct=100*cola[v]/x.dataMinutes;if(!(pct>0))break;
      const px=X(v),py=Math.min(T+ph,Y(Math.max(pct,10**d0)));if(empezado)ctx.lineTo(px,py);else{ctx.moveTo(px,py);empezado=true;}
    }
    ctx.stroke();
  });
  ctx.lineWidth=1;
}
