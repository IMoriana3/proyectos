/* INFORME del optimizador de implantaciones — para entregar al cliente.
 * Mismo formato que el estudio de disponibilidad de batería del Gemelo
 * (gemelo-digital/bateria.html): tema claro, maquetado A4, portada, veredicto
 * en «Objeto y conclusión», tablas, figuras y LÍMITES declarados. El navegador
 * lo imprime o lo guarda como PDF.
 *
 * Los números NO se recalculan aquí: salen de LayoutSearchUI.report(), la
 * misma cosecha que alimenta el panel y el JSON de comparación — dos fuentes
 * para el mismo dato serían dos verdades. Las figuras se RE-DIBUJAN en claro
 * (el lienzo de la app es oscuro y un plano negro en un A4 blanco no es un
 * plano de cliente), con la misma geometría del motor: parcela, mesas por
 * completitud, descartadas, norte y barra de escala. */
(function(){
'use strict';
const F=(n,d=0)=>Number.isFinite(n)?n.toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const SG=(n,d=0)=>(n>0?'+':'')+F(n,d);

const INFORME_CSS=`
@page{size:A4;margin:16mm 14mm}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#1c2733;font:13px/1.5 "IBM Plex Sans","Barlow",system-ui,sans-serif}
.page{max-width:186mm;margin:0 auto;padding:10mm 0}
h1{font-size:26px;margin:0 0 4px;color:#0d5c46;font-weight:600}
h2{font-size:16px;margin:26px 0 8px;color:#0d5c46;border-bottom:2px solid #0d5c46;padding-bottom:4px;page-break-after:avoid}
h3{font-size:13.5px;margin:16px 0 6px;color:#1c2733;page-break-after:avoid}
p{margin:7px 0;text-align:justify}
.cover{min-height:150mm;display:flex;flex-direction:column;justify-content:center;page-break-after:always}
.cover .brand{font:600 15px "IBM Plex Mono",monospace;color:#0d5c46;letter-spacing:.14em;text-transform:uppercase}
.cover h1{font-size:36px;margin:14px 0 6px;line-height:1.15}
.cover .sub{font-size:19px;color:#4a5a6a}
.cover .meta{margin-top:34px;font:12px "IBM Plex Mono",monospace;color:#4a5a6a;line-height:1.9}
.conf{margin-top:auto;padding-top:20mm;font-size:10px;color:#8a97a4;border-top:1px solid #dde3e9}
table{width:100%;border-collapse:collapse;font-size:11.5px;margin:9px 0;page-break-inside:avoid}
th,td{padding:5px 7px;border:1px solid #d5dde4;text-align:right}
th{background:#eef4f2;color:#0d5c46;font-weight:600;text-align:center}
td:first-child,th:first-child{text-align:left}
td.k{background:#f7f9fb;font-weight:500}
td.ok{color:#0a7d55;font-weight:600} td.bad{color:#b3352b;font-weight:600} td.wn{color:#96650d}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:12px 0}
.kpi{border:1px solid #d5dde4;border-radius:7px;padding:8px 10px;background:#f7f9fb}
.kpi .l{font-size:9.5px;color:#6b7b8a;text-transform:uppercase;letter-spacing:.05em}
.kpi .v{font:600 17px "IBM Plex Mono",monospace;color:#0d5c46}
.kpi .s{font-size:9.5px;color:#8a97a4}
img.fig{width:100%;border:1px solid #d5dde4;border-radius:6px;margin:8px 0;page-break-inside:avoid}
.dos{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cap{font-size:10.5px;color:#6b7b8a;text-align:center;margin:-2px 0 12px}
ul{margin:7px 0;padding-left:20px} li{margin:3px 0}
.note{background:#f7f9fb;border-left:3px solid #0d5c46;padding:8px 11px;font-size:11.5px;margin:10px 0}
.brk{page-break-before:always}
@media print{.noprint{display:none}}
.noprint{position:fixed;top:12px;right:12px;background:#0d5c46;color:#fff;border:0;border-radius:8px;padding:9px 16px;font:600 13px sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.2)}
`;

function tbl(rows,head){
  const h=head?'<tr>'+head.map(x=>'<th>'+x+'</th>').join('')+'</tr>':'';
  return '<table>'+h+rows.map(r=>'<tr>'+r.map((c,i)=>{
    const cls=(typeof c==='object')?(c.cls||''):(i===0?'k':'');
    const v=(typeof c==='object')?c.v:c;
    return '<td class="'+cls+'">'+v+'</td>';}).join('')+'</tr>').join('')+'</table>';
}

/* área del polígono (fórmula del agrimensor), con agujeros descontados */
function areaM2(pts,holes){
  const sh=r=>{let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=(r[j][0]+r[i][0])*(r[j][1]-r[i][1]);return Math.abs(s)/2;};
  return sh(pts)-(holes||[]).reduce((s,h)=>s+sh(h),0);
}

/* ── PLANO en claro: parcela + mesas de un resultado, norte arriba, con escala ──
   Las mesas caen donde dice mesaEnLienzo(), la MISMA función del lienzo:
   plano e interfaz no pueden discrepar. */
function figPlano(item,W,H){
  if(!item||!item.r||!item.r.structures)return null;
  const r=item.r,c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,H);
  const loc=q=>PARCELA.aLocal(r.toLonLat(q));
  const xs=PARCELA.pts.map(p=>p[0]),ys=PARCELA.pts.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const m=34,esc=Math.min((W-2*m)/((x1-x0)||1),(H-2*m)/((y1-y0)||1));
  const P=q=>[W/2+(q[0]-(x0+x1)/2)*esc,H/2-(q[1]-(y0+y1)/2)*esc];   // y de mundo = NORTE, pantalla crece hacia abajo
  const traza=(pts,cerrar)=>{g.beginPath();pts.forEach((p,i)=>{const q=P(p);i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]);});if(cerrar)g.closePath();};
  traza(PARCELA.pts,true);g.fillStyle='#f0f4f7';g.fill();g.strokeStyle='#4a5a6a';g.lineWidth=1.4;g.stroke();
  (PARCELA.holes||[]).forEach(h=>{traza(h,true);g.fillStyle='#e2e8ee';g.fill();g.strokeStyle='#8a97a4';g.stroke();});
  (r.roads||[]).forEach(rd=>{if(rd&&rd.length){traza(rd.map(loc),true);g.fillStyle='rgba(138,151,164,.25)';g.fill();}});
  const full=CFGP.mods[0];
  r.structures.forEach(st=>{const f=Math.min(1,(st.mods||full)/full);
    traza(mesaEnLienzo(st,r),true);
    g.fillStyle=f>=1?'rgba(10,125,85,.28)':'rgba(192,127,22,.30)';g.fill();
    g.strokeStyle=f>=1?'#0a7d55':'#c07f16';g.lineWidth=.7;g.stroke();});
  (r.descartadas||[]).forEach(st=>{const p=mesaEnLienzo(st,r);if(!p)return;
    traza(p,true);g.strokeStyle='#b3352b';g.lineWidth=1;g.setLineDash([3,2]);g.stroke();g.setLineDash([]);});
  /* norte y barra de escala, para que el plano se lea solo */
  g.strokeStyle='#4a5a6a';g.fillStyle='#4a5a6a';g.lineWidth=1.4;
  g.beginPath();g.moveTo(22,34);g.lineTo(22,12);g.lineTo(17,20);g.moveTo(22,12);g.lineTo(27,20);g.stroke();
  g.font='600 11px monospace';g.fillText('N',18,46);
  const cand=[10,20,50,100,200,500,1000],obj=(W-2*m)/5/esc;
  const Lm=cand.reduce((a,b)=>Math.abs(b-obj)<Math.abs(a-obj)?b:a);
  const Lx=Lm*esc,bx=14,by=H-14;
  g.beginPath();g.moveTo(bx,by);g.lineTo(bx+Lx,by);g.moveTo(bx,by-4);g.lineTo(bx,by+4);g.moveTo(bx+Lx,by-4);g.lineTo(bx+Lx,by+4);g.stroke();
  g.fillText(Lm+' m',bx+Lx/2-14,by-7);
  return c.toDataURL('image/png');
}

/* evolución del récord (en claro): índice del mejor frente a evaluaciones */
function figSerie(W,H){
  if(SERIE.length<2)return null;
  const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  g.fillStyle='#fff';g.fillRect(0,0,W,H);
  const x0=SERIE[0][0],x1=SERIE[SERIE.length-1][0],kmax=SERIE[SERIE.length-1][1]||1;
  const X=o=>30+(W-40)*(o-x0)/Math.max(1,x1-x0),Y=v=>H-18-(H-34)*(v/kmax);
  if(BASE_REF&&BASE_REF.valid){g.strokeStyle='#8a97a4';g.setLineDash([4,3]);g.beginPath();
    g.moveTo(30,Y(BASE_REF.ener));g.lineTo(W-10,Y(BASE_REF.ener));g.stroke();g.setLineDash([]);
    g.fillStyle='#8a97a4';g.font='10px monospace';g.fillText('referencia',34,Y(BASE_REF.ener)-4);}
  g.strokeStyle='#0a7d55';g.lineWidth=1.6;g.beginPath();
  SERIE.forEach((p,i)=>{i?g.lineTo(X(p[0]),Y(p[1])):g.moveTo(X(p[0]),Y(p[1]));});g.stroke();
  g.fillStyle='#4a5a6a';g.font='10px monospace';g.fillText('evaluaciones →',W-110,H-5);
  return c.toDataURL('image/png');
}

/* nube giro × índice (en claro), con el mejor señalado — solo tiene sentido si se gira */
function figNube(W,H){
  if(!GIRA||!NUBE.length||!MEJOR)return null;
  const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  g.fillStyle='#fff';g.fillRect(0,0,W,H);
  const kb=MEJOR.ener||1,X=gr=>14+(W-28)*((gr+90)/180),Y=v=>H-16-(H-30)*Math.max(0,Math.min(1,v/kb));
  g.strokeStyle='#dde3e9';g.beginPath();g.moveTo(X(0),8);g.lineTo(X(0),H-16);g.stroke();
  NUBE.forEach(p=>{const q=p[2]/kb;
    g.fillStyle=q>.995?'#0a7d55':q>.97?'rgba(10,125,85,.55)':'rgba(107,123,138,.3)';
    g.fillRect(X(p[0]),Y(p[2]),q>.995?3.5:2.2,q>.995?3.5:2.2);});
  g.fillStyle='#4a5a6a';g.font='10px monospace';
  g.fillText('-90°',6,H-4);g.fillText('0°',X(0)-6,H-4);g.fillText('+90°',W-30,H-4);
  return c.toDataURL('image/png');
}

/* ── el documento. Devuelve el HTML completo, o null si aún no hay nada que contar. ── */
function informeHTML(){
  if(!CFGP||!OPC||!(BASE_REF&&BASE_REF.valid)&&!(MEJOR&&MEJOR.valid))return null;
  const R=LayoutSearchUI.report(),a=R.comparison.reference,b=R.comparison.proposal;
  const hayBase=Number.isFinite(a.kWp),hayMejor=Number.isFinite(b.kWp);
  const d=hayBase&&hayMejor?100*(b.score-a.score)/(a.score||1):null;
  const mejora=d!=null&&d>0.05;
  const paraCliente=!!($('repCliente')&&$('repCliente').checked);
  const hoy=new Date(),fHoy=('0'+hoy.getDate()).slice(-2)+'/'+('0'+(hoy.getMonth()+1)).slice(-2)+'/'+hoy.getFullYear();
  const nombre=PARCELA.nombre||('parcela sintética · site '+SITE);
  const ha=areaM2(PARCELA.pts,PARCELA.holes)/1e4;
  const mesa=(CFGP.table||'1V')+' · '+(CFGP.mods||[]).join('/')+' módulos de '+F(CFGP.moduleWp)+' Wp'+(CFGP.bifila?' · bifila':'');
  const metodo=R.method==='gp'?'aprendizaje GP (experimental)':R.method==='grid'?'barrido de ángulos':'muestreo aleatorio';
  const hayTilt=a.tilt!=null||b.tilt!=null;
  const criterio=GIRA&&SOL?'kWp × factor solar de orientación (índice de cielo claro)'
    :hayTilt?'kWp × factor de inclinación (cielo claro con sombra entre filas)':'potencia instalada (kWp)';
  const cambios=[];
  if(hayBase&&hayMejor){
    if(a.panelAz!==b.panelAz)cambios.push('azimut de filas '+F(a.panelAz,1)+'° → '+F(b.panelAz,1)+'°'+(a.axisAz!=null?' (eje '+F(b.axisAz,1)+'°)':''));
    if(a.rowOffset!==b.rowOffset)cambios.push('disposición '+(a.rowOffset==='half'?'tresbolillo':'alineado')+' → '+(b.rowOffset==='half'?'tresbolillo':'alineado'));
    if(Math.abs((a.xOffsetM||0)-(b.xOffsetM||0))>1e-6||Math.abs((a.yOffsetM||0)-(b.yOffsetM||0))>1e-6)
      cambios.push('origen de la retícula ('+SG(b.xOffsetM-(a.xOffsetM||0),2)+' m X, '+SG(b.yOffsetM-(a.yOffsetM||0),2)+' m Y)');
    if(a.tilt!=null&&b.tilt!=null&&a.tilt!==b.tilt)
      cambios.push('inclinación '+F(a.tilt,0)+'° → '+F(b.tilt,0)+'°');
  }

  let H='<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Informe de implantación — '+nombre+'</title>'+
    '<style>'+INFORME_CSS+'</style></head><body>'+
    '<button class="noprint" onclick="print()">🖨 Imprimir / PDF</button><div class="page">';

  /* PORTADA */
  H+='<div class="cover"><div class="brand">Factiun · Ingeniería de implantaciones solares</div>'+
    '<h1>Estudio de optimización<br>de implantación</h1>'+
    '<div class="sub">'+nombre+'</div>'+
    '<div class="meta">Parcela: '+F(ha,2)+' ha · '+PARCELA.pts.length+' vértices'+(PARCELA.holes&&PARCELA.holes.length?' · '+PARCELA.holes.length+' exclusión(es) interior(es)':'')+'<br>'+
    'Mesa del proyecto: '+mesa+' · pitch '+F(CFGP.pitch,2)+' m · retranqueo '+F(CFGP.setback,1)+' m<br>'+
    'Búsqueda: '+metodo+' · '+R.evaluations+' de '+R.budget+' evaluaciones · criterio: '+criterio+'<br>'+
    'Semilla de reproducción: '+SEM.join('-')+' · Fecha de emisión: '+fHoy+'</div>'+
    '<div class="conf">Documento generado automáticamente por el Buscador de implantaciones Factiun '+
    '(repositorio <b>proyectos</b>, <i>buscador-implantacion.html</i> v'+R.version+'). Reproducible: la misma parcela, '+
    'la misma mesa y la misma semilla devuelven la misma propuesta. '+
    (paraCliente?'Documento elaborado por Factiun para el cliente.':'Uso interno de Factiun.')+'</div></div>';

  /* 1. OBJETO Y CONCLUSIÓN */
  H+='<h2>1. Objeto y conclusión</h2>';
  H+='<p>Este informe recoge la búsqueda de la mejor variante de implantación fotovoltaica sobre la parcela '+
    '<b>'+nombre+'</b> manteniendo las condiciones del encargo (mesa, pitch, retranqueo, tallas, exclusiones y viales) '+
    'y variando '+(GIRA?'la orientación de las filas, la disposición y el origen de la retícula':'la disposición y el origen de la retícula (montaje fijo: la orientación es la de los paneles y no se gira)')+'. '+
    'Se han evaluado <b>'+R.evaluations+' variantes</b> con el mismo motor de cálculo que genera la implantación, '+
    'ordenadas por '+criterio+'.</p>';
  H+='<div class="note"><b>Conclusión.</b> '+(mejora
    ? 'La búsqueda encuentra una variante <b>mejor que la de referencia</b>: <b>'+SG(d,1)+' % de índice solar</b>'+
      (b.kWp<a.kWp?' — con <b>'+SG(100*(b.kWp-a.kWp)/a.kWp,1)+' % de potencia</b>: se sueltan unos kWp y se cobran en orientación':'')+
      '. Cambia'+(cambios.length>1?'n':'')+': '+(cambios.join('; ')||'—')+'.'
    : hayBase
    ? 'Tras '+R.evaluations+' variantes, <b>la implantación de referencia se mantiene como la mejor</b>: '+
      'ninguna alternativa evaluada la supera con el criterio declarado. Eso también es un resultado: la geometría de partida está bien orientada.'
    : 'La implantación de referencia <b>no supera la comprobación geométrica del motor</b>; se presenta la mejor variante válida encontrada entre las '+R.evaluations+' evaluadas.')+
    '</div>';
  H+='<p class="lim">'+R.objectiveLimit+' La energía anual de proyecto se calcula aparte, con la meteorología del emplazamiento.</p>';

  /* 2. RESULTADO */
  H+='<h2>2. Resultado</h2>';
  const best=hayMejor?b:a;
  H+='<div class="kpis">'+
    '<div class="kpi"><div class="l">Potencia propuesta</div><div class="v">'+F(best.kWp/1000,2)+'</div><div class="s">MWp</div></div>'+
    '<div class="kpi"><div class="l">Módulos</div><div class="v">'+F(best.modules)+'</div><div class="s">de '+F(CFGP.moduleWp)+' Wp</div></div>'+
    '<div class="kpi"><div class="l">Mesas</div><div class="v">'+F(best.structures)+'</div><div class="s">'+(CFGP.bifila?'bifila':'')+'</div></div>'+
    '<div class="kpi"><div class="l">Factor solar</div><div class="v">'+(GIRA&&SOL||hayTilt?F(best.factor*100,1)+' %':'—')+'</div><div class="s">'+(GIRA&&SOL?'orientación del eje':hayTilt?'inclinación de la fija':'montaje fijo')+'</div></div>'+
    '<div class="kpi"><div class="l">Frente a referencia</div><div class="v">'+(d!=null?SG(d,1)+' %':'—')+'</div><div class="s">índice solar</div></div></div>';
  const fil=(n,va,vb,dd,inv)=>{const delta=Number.isFinite(va)&&Number.isFinite(vb)?vb-va:null;
    return [n,F(va,dd),F(vb,dd),delta==null?'—':{v:SG(delta,dd),cls:delta===0?'':(delta>0)!==!!inv?'ok':'bad'}];};
  H+=tbl([
    fil('Módulos',a.modules,b.modules,0),
    fil('Mesas',a.structures,b.structures,0),
    fil('Potencia (kWp)',a.kWp,b.kWp,2),
    GIRA&&SOL?fil('Factor solar de orientación',a.factor,b.factor,4):null,
    fil(GIRA&&SOL?'Índice solar relativo':'Potencia comparada',a.score,b.score,2),
  ].filter(Boolean),['','Referencia','Propuesta','Δ']);
  H+=tbl([
    ...(a.axisAz!=null||b.axisAz!=null?[['Azimut del eje (°)',F(a.axisAz,2),F(b.axisAz,2)]]:[]),
    ...(hayTilt?[['Inclinación (°)',F(a.tilt,0),F(b.tilt,0)]]:[]),
    [GIRA?'Azimut de filas (°)':'Azimut de paneles (°)',F(a.panelAz,2),F(b.panelAz,2)],
    ['Disposición',a.rowOffset==='half'?'Tresbolillo':'Alineado',b.rowOffset==='half'?'Tresbolillo':'Alineado'],
    ['Origen X (m)',F(a.xOffsetM,3),F(b.xOffsetM,3)],
    ['Origen Y (m)',F(a.yOffsetM,3),F(b.yOffsetM,3)],
    ['Pitch (m)',F(a.pitch,3),F(b.pitch,3)],
    ['GCR',F(a.gcr,3),F(b.gcr,3)],
  ],['Parámetro','Referencia','Propuesta']);
  const tallas=[...new Set([...Object.keys(a.bySize||{}),...Object.keys(b.bySize||{})])].map(Number).sort((x,y)=>y-x);
  if(tallas.length>1)H+='<h3>Mesas por talla</h3>'+tbl(tallas.map(n=>[n+' módulos',F((a.bySize||{})[n]||0),F((b.bySize||{})[n]||0)]),['Talla','Referencia','Propuesta']);

  /* PLANOS */
  const pA=hayBase?figPlano(BASE_REF,1000,700):null,pB=hayMejor?figPlano(MEJOR,1000,700):null;
  if(pA||pB){
    H+='<h3>Planos de implantación</h3><div class="dos">'+
      (pA?'<div><img class="fig" src="'+pA+'"><div class="cap">Referencia — '+F(a.kWp,0)+' kWp</div></div>':'')+
      (pB?'<div><img class="fig" src="'+pB+'"><div class="cap">Propuesta — '+F(b.kWp,0)+' kWp</div></div>':'')+'</div>'+
      '<p class="cap">Verde: mesas completas · ámbar: mesas recortadas (menos módulos que la talla principal) · '+
      'rojo discontinuo: posiciones evaluadas y descartadas por el motor. Norte arriba; la barra da la escala.</p>';
  }

  /* 3. LA BÚSQUEDA */
  H+='<h2 class="brk">3. La búsqueda</h2>';
  H+='<p>Método: <b>'+metodo+'</b>, con presupuesto de '+R.budget+' evaluaciones ('+R.evaluations+' ejecutadas, '+
    F(R.computeMs/1000,1)+' s de motor). La primera evaluación es siempre la implantación de referencia, exactamente '+
    'como entra del encargo; solo una geometría validada por el motor puede proponerse. '+
    (MEJOR&&R.bestIteration!=null?'La mejor apareció en la evaluación '+(R.bestIteration+1)+'.':'')+'</p>';
  const sS=figSerie(1000,260),sN=figNube(1000,260);
  if(sS)H+='<img class="fig" src="'+sS+'"><div class="cap">Evolución del mejor índice frente al número de evaluaciones. La línea discontinua es la referencia.</div>';
  if(sN)H+='<img class="fig" src="'+sN+'"><div class="cap">Variantes evaluadas por giro de filas (−90°…+90° sobre el azimut del encargo). Los puntos oscuros rozan el máximo.</div>';
  H+='<p>Reproducibilidad: la misma semilla (<b>'+SEM.join('-')+'</b>), la misma parcela y la misma mesa devuelven '+
    'exactamente las mismas '+R.evaluations+' variantes y la misma propuesta.</p>';

  /* 4. METODOLOGÍA Y LÍMITES */
  H+='<h2>4. Metodología y límites</h2>';
  H+='<p>El cálculo de cada variante lo hace el <b>mismo motor de implantación</b> del Generador Factiun '+
    '(retícula, erosión exacta del retranqueo, exclusiones, viales y tallas), sin réplicas. '+
    (GIRA&&SOL?'El criterio de ordenación es <b>kWp × f(eje)</b>, donde f es la integral anual de DNI·cos(AOI) '+
    'con el seguidor gobernado por el modelo de seguimiento canónico (backtracking y tope mecánico incluidos) '+
    'sobre un cielo claro de referencia, normalizada al eje N-S. Es un factor RELATIVO entre orientaciones.'
    :hayTilt?'En montaje fijo la orientación de los paneles se conserva y la <b>inclinación se barre</b> con '+
    '<b>kWp × f(tilt)</b>: transposición Perez de cielo claro sobre doce días típicos, con la <b>sombra entre '+
    'filas al pitch del proyecto</b> y el cielo enmascarado por la fila vecina — la física del comparador de '+
    'estructuras de Factiun, careada contra el motor canónico, extraída sin réplica. Normalizado a la '+
    'inclinación del encargo: un factor mayor que 1 significa que esa inclinación capta más que la de partida.'
    :'En montaje fijo la orientación de los paneles se conserva y el criterio es la potencia instalada.')+'</p>';
  H+='<ul>'+
    '<li><b>Lo que este índice NO incluye</b>, y por eso no es una previsión de energía anual: irradiación difusa, '+
    'meteorología del emplazamiento (TMY), terreno y pendientes, temperatura, suciedad, ni sombras entre filas más '+
    'allá del backtracking. La producción de proyecto se calcula en el estudio energético, con la meteo del sitio.</li>'+
    '<li>Las restricciones del encargo (pitch, retranqueo, tallas, exclusiones y viales) se <b>conservan</b>: la búsqueda '+
    'no las relaja para ganar.</li>'+
    (R.method==='gp'?'<li>El método GP es <b>experimental</b>: aprende de las evaluaciones de esta parcela, sin superioridad demostrada sobre el muestreo aleatorio.</li>':'')+
    (ENCARGO?'':'<li>Esta parcela '+(REAL?'procede de un vallado real cargado en la herramienta.':'es sintética (demostración): el estudio de una parcela de proyecto se lanza desde el Generador con «Optimizar».')+'</li>')+
    '</ul>';

  H+='</div></body></html>';
  return H;
}

function abreInforme(){
  const html=informeHTML();
  if(!html){pon('Ejecuta primero una búsqueda: sin evaluaciones no hay nada que informar.',7000);return;}
  const w=window.open('','_blank');
  if(!w){alert('El navegador ha bloqueado la ventana emergente. Permítela para ver el informe.');return;}
  w.document.write(html);w.document.close();
}

$('searchInforme').addEventListener('click',abreInforme);
window.LayoutInforme={html:informeHTML,abre:abreInforme};
})();
