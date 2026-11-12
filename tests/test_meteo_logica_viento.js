/* Meteo · motor de la LÓGICA DE VIENTO (lib/meteo-wind-logic.js).
 * Ejecutar: node tests/test_meteo_logica_viento.js
 * Sin red, sin credenciales y sin datos de planta: las series son sintéticas y
 * cada una pone una racha donde hace falta para un caso concreto de la lógica.
 * El sol sale de la solarPosition canónica (lib/meteo-browser.js), la misma que
 * usa la página; los ángulos esperados se calculan con ella, no se copian. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const moduleOf = async name =>
  import("data:text/javascript;base64,"+Buffer.from(fs.readFileSync(path.join(root,"lib",name),"utf8")).toString("base64"));
(async()=>{
  const W = await moduleOf("meteo-wind-logic.js");
  const {solarPosition} = await moduleOf("meteo-browser.js");
  const {simulateWindLogic,detectActivations,windSeriesByGroup,theoreticalTrackerAngle,windLogicOptions,windLogicCsv,windLogicMatrix} = W;
  let checks=0;
  const check=(name,fn)=>{fn();checks++;console.log("OK   "+name)};
  const SITE={lat:41.576,lon:-0.798,tz:"Europe/Madrid"}, O=windLogicOptions({});
  const ms=iso=>Date.parse(iso.length===16?iso+":00Z":iso);
  const theta=iso=>theoreticalTrackerAngle(solarPosition(new Date(ms(iso)),SITE.lat,SITE.lon),O);
  const rec=(iso,kmh,sensor="HSU 230",ncu="1",plant="P")=>({t:new Date(ms(iso)).toISOString(),plant,ncu,sensor,variable:"wind_peak",unit:"m/s",value:kmh/3.6});
  /* Un día (o varios) en calma a 18 km/h, minuto a minuto, con las rachas dadas encima. */
  const serie=(from,to,gusts,zeros=[])=>{
    const by=new Map();
    for(let t=ms(from);t<=ms(to);t+=60000)by.set(t,18);
    for(const [a,b] of zeros)for(let t=ms(a);t<=ms(b);t+=60000)by.set(t,0);
    for(const [iso,kmh] of gusts)by.set(ms(iso),kmh);
    return [...by].map(([t,kmh])=>rec(new Date(t).toISOString(),kmh));
  };
  const sim=(records,options)=>simulateWindLogic(records,{plant:"P",site:SITE,options,solarPosition}).groups[0];
  const at=(g,type,iso)=>g.activations.find(a=>a.type===type&&a.t===ms(iso));
  const near=(a,b,tol=0.2)=>Math.abs(a-b)<=tol;

  check("rearme: una lectura a los 30 min sigue siendo la misma alarma; a los 31, otra",()=>{
    const same=detectActivations([0,30],[45,45],40,30),two=detectActivations([0,31],[45,45],40,30);
    assert.equal(same.length,1);assert.equal(same[0].end,60);assert.equal(same[0].minutesOver,2);
    assert.equal(two.length,2);assert.equal(two[0].end,30);assert.equal(two[1].start,31);
  });
  check("umbral estricto y pico del evento",()=>{
    assert.equal(detectActivations([0,1],[40,39.9],40,30).length,0);
    const e=detectActivations([0,1,2],[41,58,43],40,30);
    assert.equal(e.length,1);assert.equal(e[0].peakKmh,58);assert.equal(e[0].start,0);assert.equal(e[0].last,2);
  });
  check("serie por NCU: manda el máximo de sus HSU, en km/h, y cada NCU va aparte",()=>{
    const r=[rec("2026-06-10T10:00",36,"HSU 230"),rec("2026-06-10T10:00",50.4,"HSU 231"),rec("2026-06-10T10:00",72,"HSU 230","2"),
      rec("2026-06-10T10:00",90,"HSU 230","1","OTRA"),{...rec("2026-06-10T10:01",50),value:null}];
    const s=windSeriesByGroup(r,{plant:"P"});
    assert.equal(s.variable,"wind_peak");assert.deepEqual(s.groups.map(g=>g.key),["1","2"]);
    assert.ok(near(s.groups[0].kmh[0],50.4,1e-9));assert.deepEqual(s.groups[0].sensors,["HSU 230","HSU 231"]);
    assert.equal(s.groups[0].minutes.length,1);assert.ok(near(s.groups[1].kmh[0],72,1e-9));
  });
  check("sin máximo de ráfaga se usa la velocidad media, y se dice",()=>{
    const r=[{...rec("2026-06-10T10:00",45),variable:"wind_speed"}];
    const out=simulateWindLogic(r,{plant:"P",site:SITE,solarPosition});
    assert.equal(out.variable,"wind_speed");assert.match(out.notice,/velocidad media/);
  });
  check("posición teórica: Este por la mañana, Oeste por la tarde, horizontal a mediodía",()=>{
    const m=theta("2026-06-10T08:30"),n=theta("2026-06-10T12:02"),e=theta("2026-06-10T15:30");
    assert.ok(!m.night&&m.theta<-30,String(m.theta));assert.ok(e.theta>30,String(e.theta));assert.ok(Math.abs(n.theta)<1.5,String(n.theta));
    assert.ok(near(m.theta,-e.theta,3),m.theta+" / "+e.theta);
  });
  check("backtracking: con el sol bajo el seguidor se tumba, y nunca pasa del rango",()=>{
    const low=theta("2026-06-10T05:00"),mid=theta("2026-06-10T07:30");
    assert.ok(!low.night&&Math.abs(low.theta)<25,String(low.theta));assert.equal(mid.theta,-55);
    const sinBt=theoreticalTrackerAngle(solarPosition(new Date(ms("2026-06-10T05:00")),SITE.lat,SITE.lon),windLogicOptions({pitchM:60}));
    assert.equal(sinBt.theta,-55); // con las filas muy separadas no hay sombra que evitar
  });
  check("noche: posición de noche al Este; el día dura mientras el sol se ve sobre el horizonte",()=>{
    const n=theta("2026-06-10T23:00");assert.ok(n.night);assert.equal(n.theta,-5);
    assert.ok(theoreticalTrackerAngle({elevation_deg:-0.3,azimuth_deg:60},O).night===false);
    assert.ok(theoreticalTrackerAngle({elevation_deg:-0.6,azimuth_deg:60},O).night===true);
  });

  const DIA=serie("2026-06-10T00:00","2026-06-10T23:59",[["2026-06-10T07:30",45],["2026-06-10T10:30",45],["2026-06-10T10:50",63],["2026-06-10T15:00",70]]);
  const g=sim(DIA);
  check("pre-stow de día ya en rango: no se mueve",()=>{
    const a=at(g,"prestow","2026-06-10T07:30");
    assert.ok(a&&!a.night&&a.alreadyOk);assert.equal(a.degrees,0);assert.ok(near(a.posBefore,-55,0.6));
  });
  check("pre-stow de día fuera de rango: al mínimo por el lado más cercano",()=>{
    const a=at(g,"prestow","2026-06-10T10:30"),th=theta("2026-06-10T10:29").theta;
    assert.ok(th<0&&th>-30,String(th));assert.ok(!a.alreadyOk);
    assert.equal(a.target,-30);assert.ok(near(a.degrees,30+th,0.2),a.degrees+" vs "+(30+th));
  });
  check("stow dentro de un pre-stow: de 30° a 55° por el mismo lado, 25°",()=>{
    const a=at(g,"stow","2026-06-10T10:50");
    assert.ok(a);assert.equal(a.posBefore,-30);assert.equal(a.target,-55);assert.equal(a.degrees,25);
    assert.equal(a.parentId,at(g,"prestow","2026-06-10T10:30").id);assert.equal(a.sameMinuteAsPrestow,false);
  });
  check("stow que salta a la vez que el pre-stow: desde la posición de seguimiento",()=>{
    const p=at(g,"prestow","2026-06-10T15:00"),s=at(g,"stow","2026-06-10T15:00"),th=theta("2026-06-10T14:59").theta;
    assert.ok(p&&s&&s.sameMinuteAsPrestow);assert.ok(th>30&&th<55,String(th));
    assert.ok(p.alreadyOk);assert.equal(s.target,55);assert.ok(near(s.degrees,55-th,0.2));
  });

  const NOCHES=serie("2026-06-10T12:00","2026-06-12T03:00",[["2026-06-10T22:00",45],["2026-06-10T23:10",48],["2026-06-10T23:40",64],["2026-06-11T22:30",45]]);
  const gn=sim(NOCHES);
  check("noche: la primera alarma hace el único movimiento, 5° E → 55° E",()=>{
    const a=at(gn,"prestow","2026-06-10T22:00");
    assert.ok(a.night&&!a.alreadyOk);assert.equal(a.posBefore,-5);assert.equal(a.target,-55);assert.equal(a.degrees,50);
  });
  check("noche: sin vuelta a la posición de noche — las siguientes ya están en defensa",()=>{
    const p=at(gn,"prestow","2026-06-10T23:10"),s=at(gn,"stow","2026-06-10T23:40");
    assert.ok(p.alreadyOk&&s.alreadyOk);assert.equal(p.posBefore,-55);assert.equal(s.degrees,0);
  });
  check("la noche siguiente empieza de nuevo en la posición de noche",()=>{
    const a=at(gn,"prestow","2026-06-11T22:30");assert.equal(a.posBefore,-5);assert.equal(a.degrees,50);
    assert.deepEqual([gn.movementsToStow.total,gn.movementsToStow.night,gn.movementsToStow.day],[2,2,0]);
  });

  /* Pre-stow continuo desde antes del mediodía solar hasta la tarde, y stow por la tarde. */
  const mediodia=[];for(let t=ms("2026-06-10T11:30");t<=ms("2026-06-10T14:30");t+=20*60000)mediodia.push([new Date(t).toISOString(),45]);
  const MED=serie("2026-06-10T00:00","2026-06-10T23:59",[...mediodia,["2026-06-10T14:40",65]]);
  check("mediodía con «mantiene el lado»: sigue al Este con el sol ya al Oeste",()=>{
    const s=at(sim(MED,{noonRule:"hold"}),"stow","2026-06-10T14:40");
    assert.ok(theta("2026-06-10T14:39").theta>30);assert.equal(s.posBefore,-30);assert.equal(s.target,-55);assert.equal(s.degrees,25);
  });
  check("mediodía con «sigue al sol»: cruza y el stow le pilla al Oeste",()=>{
    const s=at(sim(MED,{noonRule:"follow"}),"stow","2026-06-10T14:40"),th=theta("2026-06-10T14:39").theta;
    assert.ok(near(s.posBefore,th,0.2));assert.equal(s.target,55);assert.ok(near(s.degrees,55-th,0.2));
  });

  /* Pre-stow activo al anochecer (el sol se pone hacia las 19:40 UTC) y otra racha ya de noche. */
  const tarde=[];for(let t=ms("2026-06-10T18:30");t<=ms("2026-06-10T20:10");t+=20*60000)tarde.push([new Date(t).toISOString(),45]);
  const OCASO=serie("2026-06-10T12:00","2026-06-11T03:00",[...tarde,["2026-06-10T21:30",46]]);
  check("anochecer con alarma, «va a stow Este»: cruza por horizontal y se queda en defensa",()=>{
    const x=sim(OCASO,{duskRule:"east"}),a=at(x,"prestow","2026-06-10T21:30");
    assert.equal(x.dusk.total,1);assert.equal(x.dusk.crossingHorizontal,1);
    assert.ok(x.dusk.events[0].posBefore>=30&&x.dusk.events[0].degrees>=85,JSON.stringify(x.dusk.events[0]));
    assert.ok(a.night&&a.alreadyOk);assert.equal(a.posBefore,-55);
  });
  check("anochecer con alarma, «se queda»: no se mueve al caer la noche; la siguiente alarma sí",()=>{
    const x=sim(OCASO,{duskRule:"hold"}),a=at(x,"prestow","2026-06-10T21:30");
    assert.equal(x.dusk.total,1);assert.equal(x.dusk.events[0].degrees,0);
    assert.ok(!a.alreadyOk);assert.equal(a.posBefore,-5);assert.equal(a.target,-55); // la alarma del ocaso terminó y volvió a noche
  });

  check("sensor a cero antes del cruce: activación dudosa y racha de ceros declarada",()=>{
    const z=sim(serie("2026-06-10T00:00","2026-06-10T23:59",[["2026-06-10T09:00",45],["2026-06-10T15:01",62]],[["2026-06-10T13:00","2026-06-10T15:00"]]));
    assert.equal(at(z,"prestow","2026-06-10T09:00").doubtful,false);
    assert.equal(at(z,"prestow","2026-06-10T15:01").doubtful,true);assert.equal(at(z,"stow","2026-06-10T15:01").doubtful,true);
    assert.equal(z.quality.zeroRuns.length,1);assert.equal(z.quality.zeroRuns[0].minutes,121);assert.equal(z.prestow.doubtful,1);
  });
  check("hueco de dato antes del cruce: también dudosa; un hueco largo no rompe la cuenta",()=>{
    const a=serie("2026-06-10T00:00","2026-06-10T12:00",[["2026-06-10T09:00",45]]),b=serie("2026-06-20T08:00","2026-06-20T12:00",[["2026-06-20T08:00",45],["2026-06-20T11:00",45]]);
    const x=sim([...a,...b]);
    assert.equal(x.prestow.total,3);assert.equal(at(x,"prestow","2026-06-20T08:00").doubtful,true);
    assert.equal(at(x,"prestow","2026-06-20T11:00").doubtful,false);assert.equal(x.coverage.days,2);assert.equal(x.coverage.gaps,1);
  });
  check("datos más espaciados que medio rearme: se avisa y no se marca nada como dudoso",()=>{
    const r=[];for(let t=ms("2026-06-10T00:00");t<=ms("2026-06-10T23:00");t+=3600000)r.push(rec(new Date(t).toISOString(),t===ms("2026-06-10T09:00")?45:18));
    const x=sim(r);assert.equal(x.coverage.coarse,true);assert.equal(x.coverage.cadenceMin,60);assert.equal(x.prestow.doubtful,0);
  });
  check("resumen y tablas cuadran con la lista de activaciones",()=>{
    for(const x of [g,gn]){
      const m=windLogicMatrix(x,O);
      for(const type of ["prestow","stow"]){
        const list=x.activations.filter(a=>a.type===type),tot=m[type].rows.at(-1);
        assert.equal(tot.total,list.length);assert.equal(tot.cells.reduce((s,c)=>s+c,0),list.length);
        assert.equal(x[type].total,list.length);assert.equal(x[type].alreadyOk+x[type].move,list.length);
        assert.equal(tot.cells[0]+tot.cells[3],x[type].alreadyOk);
      }
    }
    assert.deepEqual([g.prestow.total,g.stow.total,g.movementsToStow.total],[3,2,2]);
    assert.equal(g.wind.daysOverStow,1);assert.equal(g.wind.peakKmh,70);assert.ok(g.daylight.prestowPct>0&&g.daylight.stowPct>0);
  });
  check("con velocidad de giro, el stow puede pillar al seguidor a medio camino",()=>{
    const r=serie("2026-06-10T20:00","2026-06-11T02:00",[["2026-06-10T22:00",45],["2026-06-10T22:01",65]]);
    const lento=at(sim(r,{speedDegPerMin:10}),"stow","2026-06-10T22:01"),ya=at(sim(r),"stow","2026-06-10T22:01");
    assert.equal(lento.posBefore,-15);assert.equal(lento.degrees,40);assert.equal(ya.alreadyOk,true);
  });
  check("parámetros incoherentes y entradas incompletas se rechazan con un motivo",()=>{
    assert.throws(()=>windLogicOptions({prestowKmh:60,stowKmh:60}),/mayor que el de pre-stow/);
    assert.throws(()=>windLogicOptions({chordM:6,pitchM:6}),/menor que el pitch/);
    assert.throws(()=>windLogicOptions({stowDeg:60,maxDeg:55}),/rango de giro/);
    assert.throws(()=>windLogicOptions({holdMin:NaN}),/tiempo de desactivación/);
    assert.throws(()=>simulateWindLogic(DIA,{plant:"P",site:{lat:null,lon:-1},solarPosition}),/coordenadas/);
    assert.throws(()=>simulateWindLogic([],{plant:"P",site:SITE,solarPosition}),/No hay lecturas de viento/);
    assert.throws(()=>simulateWindLogic(DIA,{plant:"P",site:SITE}),/posición solar/);
  });
  check("CSV: una fila por activación, coma decimal, hora local y nota de dudosa",()=>{
    const out=simulateWindLogic(serie("2026-06-10T00:00","2026-06-10T23:59",[["2026-06-10T10:30",45.5],["2026-06-10T15:01",62]],[["2026-06-10T13:00","2026-06-10T15:00"]]),{plant:"P",site:SITE,solarPosition});
    const lines=windLogicCsv(out,{timeZone:"Europe/Madrid"}).replace(/^﻿/,"").trim().split("\r\n");
    assert.equal(lines.length,1+out.groups[0].activations.length);
    assert.match(lines[0],/^grupo;tipo;id;id_prestow;inicio_utc;inicio_local;fin_alarma_utc;/);
    assert.match(lines[1],/^NCU 1;pre-stow;1;;2026-06-10 10:30;2026-06-10 12:30;2026-06-10 11:00;30;1;45,5;45,5;dia;/);
    assert.equal(lines.filter(l=>/DUDOSO/.test(l)).length,2);
    assert.ok(!/inicio_local/.test(windLogicCsv(out)));
  });
  check("resumen: por alarma, veces que salta, sin mover, a mover y cuánto",()=>{
    const out=simulateWindLogic(NOCHES,{plant:"P",site:SITE,solarPosition}),r=W.windLogicSummary(out,out.groups[0]);
    assert.deepEqual(r.rows.map(x=>[x.label,x.total,x.ok,x.move,x.how]),
      [["Pre-stow (> 40 km/h)",3,1,2,"2 de noche, 50°"],["Stow (> 60 km/h)",1,1,0,"—"]]);
    assert.equal(r.bands.prestow,"40–50 km/h: 2 · > 60 km/h: 1");assert.equal(r.bands.stow,"60–65 km/h: 1");
    assert.equal(r.period,"10/06/2026 – 12/06/2026 · 3 días con dato");
    assert.deepEqual(r.notes,["El recuento es un mínimo: el registro no guarda todas las lecturas de 1 s."]);
    const d=simulateWindLogic(DIA,{plant:"P",site:SITE,solarPosition}),rd=W.windLogicSummary(d,d.groups[0]);
    assert.match(rd.rows[0].how,/^1 de día, \d+(,\d)?°$/);assert.match(rd.rows[1].how,/^2 de día, \d+(,\d)?° de media \(hasta 25°\)$/);
    const x=simulateWindLogic(OCASO,{plant:"P",site:SITE,solarPosition}),rx=W.windLogicSummary(x,x.groups[0]);
    assert.match(rx.notes[0],/^La alarma sigue activa al anochecer una noche; en 1 el seguidor está al Oeste y tendría que pasar por horizontal para ir a 55° E\.$/);
  });
  check("informe: una página con el resumen, la gráfica, las reglas como fórmulas y las notas; sin lista",()=>{
    const out=simulateWindLogic(NOCHES.map(r=>({...r,plant:"P <b>&"})),{plant:"P <b>&",site:SITE,solarPosition});
    const h=W.windLogicReportHtml(out,{generatedAt:"2026-11-12T17:00:00Z"});
    assert.match(h,/^<!doctype html>/);assert.ok(h.includes("P &lt;b&gt;&amp;")&&!h.includes("P <b>&"));
    assert.ok(h.includes("<tr><td>Pre-stow (&gt; 40 km/h)</td><td>3</td><td>1</td><td>2</td><td>2 de noche, 50°</td></tr>"));
    assert.ok(h.includes("<tr><td>Stow (&gt; 60 km/h)</td><td>1</td><td>1</td><td>0</td><td>—</td></tr>"));
    assert.ok(h.includes("Pre-stow: 40–50 km/h: 2 · &gt; 60 km/h: 1. Stow: 60–65 km/h: 1."));
    assert.equal((h.match(/<svg /g)||[]).length,1);assert.ok(h.includes("<h2>Reglas</h2>")&&h.includes("<h2>Notas</h2>"));
    for(const f of ["v &gt; 40 km/h","|θ| ≥ 30°","Δ = max(0, 30° − |θ|)","|θ| = 55°, el lado más cercano","Δ = 55° − |θ|","t − tᵤ &gt; 30 min","Δ = 50°, una vez por noche"])assert.ok(h.includes(f),f);
    assert.ok(!h.includes("Anexo")&&!h.includes("Pre-stow 1</td>")&&!h.includes("Cómo se ha calculado")); // la lista va en el CSV
    assert.ok(h.includes("10/06/2026 – 12/06/2026 · 3 días con dato")&&h.includes("12/11/2026")&&h.includes("posición teórica del seguidor"));
  });
  check("informe: las reglas siguen a los parámetros simulados",()=>{
    const out=simulateWindLogic(NOCHES,{plant:"P",site:SITE,solarPosition,options:{prestowKmh:35,stowKmh:50,prestowMinDeg:25,stowDeg:50,maxDeg:60,holdMin:20,nightDeg:10}});
    const h=W.windLogicReportHtml(out);
    for(const f of ["v &gt; 35 km/h","v &gt; 50 km/h","|θ| ≥ 25°","Δ = 50° − |θ|","t − tᵤ &gt; 20 min","Δ = 40°, una vez por noche","de noche, 10° E"])assert.ok(h.includes(f),f);
  });
  check("informe sin activaciones: ceros en el resumen y ninguna gráfica vacía",()=>{
    const h=W.windLogicReportHtml(simulateWindLogic(serie("2026-06-10T00:00","2026-06-10T23:59",[]),{plant:"P",site:SITE,solarPosition}));
    assert.ok(h.includes("<td>Pre-stow (&gt; 40 km/h)</td><td>0</td><td>0</td><td>0</td><td>—</td>"));
    assert.ok(!h.includes("<svg ")&&!h.includes("Por racha máxima"));
  });
  /* Filas «un sensor, un día», como las guarda la base: t en segundos y viento máximo en m/s. */
  const filas=(records,equipo="HSU 230",ncu="1")=>{
    const by=new Map();
    for(const r of records){const d=r.t.slice(0,10);if(!by.has(d))by.set(d,{t:[],vmax:[]});
      by.get(d).t.push((Date.parse(r.t)-Date.parse(d+"T00:00:00Z"))/1000);by.get(d).vmax.push(r.value);}
    return [...by].map(([dia,x],k)=>({id:k+1,planta:"P",ncu,equipo,clase:"hsu",dia,tz:"UTC",subido:"2026-01-01",t:x.t,vmax:x.vmax}));
  };
  check("series desde filas de la base: máximo por NCU y minuto; lo reimportado sustituye, no suma",()=>{
    const b=W.createWindSeriesBuilder();
    b.add([{id:1,ncu:"1",equipo:"HSU 230",dia:"2026-06-10",tz:"UTC",subido:"a",t:[0,60,120],vmax:[5,12,null]},
      {id:2,ncu:"1",equipo:"HSU 231",dia:"2026-06-10",tz:"UTC",subido:"a",t:[0,60],vmax:[6,11]},
      {id:3,ncu:"1",equipo:"HSU 231",dia:"2026-06-10",tz:"UTC",subido:"b",series:{t:[0,60],v:{wind_speed_max:[7,10]}}}, // reimportado, con la serie entera
      {id:4,ncu:"2",equipo:"HSU 230",dia:"2026-06-10",tz:"UTC",t:[0],vmax:0},                // escalar: hueco de esquema
      {id:5,ncu:"2",equipo:"HSU 230",dia:"2026-06-11",tz:"Europe/Madrid",t:[0],vmax:[9]},   // sin UTC
      {id:6,ncu:"3",equipo:"HSU 230",dia:"2026-06-10",tz:"UTC",t:[0,60],vmax:[9]}]);         // longitudes que no casan
    const s=b.finish();
    assert.deepEqual(s.groups.map(g=>g.key),["1"]);assert.deepEqual(s.groups[0].sensors,["HSU 230","HSU 231"]);
    assert.deepEqual(s.groups[0].minutes.map(m=>m-Date.parse("2026-06-10T00:00:00Z")/60000),[0,1]);
    assert.ok(near(s.groups[0].kmh[0],25.2,1e-9)&&near(s.groups[0].kmh[1],43.2,1e-9)); // 7 m/s (el 6 quedó sustituido) y 12 m/s
    assert.deepEqual([s.diagnostics.repeatedUploads,s.diagnostics.scalarPlaceholders,s.diagnostics.withoutUtc,s.diagnostics.invalidSeries,s.diagnostics.missingValues],[1,1,1,1,1]);
  });
  check("da lo mismo simular desde las lecturas cargadas que desde las filas de viento máximo",()=>{
    for(const datos of [DIA,NOCHES,OCASO]){
      const b=W.createWindSeriesBuilder();b.add(filas(datos));
      const a=sim(datos),c=simulateWindLogic(null,{plant:"P",site:SITE,solarPosition,series:b.finish()}).groups[0];
      assert.deepEqual(c.activations,a.activations);assert.deepEqual(c.coverage,a.coverage);assert.deepEqual(c.dusk,a.dusk);
    }
  });
  check("sin tope de periodo: 420 días seguidos se simulan de una vez",()=>{
    const b=W.createWindSeriesBuilder(),t=Array.from({length:1440},(_,i)=>i*60),d0=Date.parse("2025-06-01T00:00:00Z");
    for(let d=0;d<420;d++){
      const vmax=t.map(()=>5);if(d%10===0)vmax[600]=12;                      // una racha de 43 km/h cada diez días, a las 10:00 UTC
      b.add([{id:d+1,ncu:"1",equipo:"HSU 230",dia:new Date(d0+d*86400000).toISOString().slice(0,10),tz:"UTC",subido:"x",t,vmax}]);
    }
    const g=simulateWindLogic(null,{plant:"P",site:SITE,solarPosition,series:b.finish()}).groups[0];
    assert.equal(g.coverage.days,420);assert.equal(g.coverage.dataMinutes,420*1440);assert.equal(g.prestow.total,42);assert.equal(g.stow.total,0);
  });
  const SUP=await moduleOf("meteo-supabase.js");
  /* Supabase de mentira: registra qué se le pide y sirve páginas de filas HSU-día. */
  const fakeSb=(rows,{logged=true,failPartial=false,timeoutOver=Infinity}={})=>{
    const calls=[];
    return {calls,auth:{async getUser(){return {data:{user:logged?{id:"u"}:null},error:null};}},
      from(table){const q={table,columns:"",eq:{},classes:null,gt:null,gte:null,lte:null,range:null};calls.push(q);
        return {select(c){q.columns=c;return this;},eq(k,v){q.eq[k]=v;return this;},in(k,v){q.classes=v;return this;},
          gt(k,v){q.gt=v;return this;},gte(k,v){q.gte=v;return this;},lte(k,v){q.lte=v;return this;},order(){return this;},
          async range(a,b){q.range=[a,b];
            if(failPartial&&q.columns.includes("series->"))return {data:null,error:{message:"failed to parse select parameter"}};
            if(b-a+1>timeoutOver)return {data:null,error:{code:"57014",message:"canceling statement due to statement timeout"}};
            return {data:rows.filter(r=>(!q.eq.dia||r.dia===q.eq.dia)&&(!q.gt||r.dia>q.gt)&&(!q.gte||r.dia>=q.gte)&&(!q.lte||r.dia<=q.lte)).slice(a,b+1),error:null};}};}};
  };
  const diaN=d=>new Date(Date.parse("2025-06-01T00:00:00Z")+d*86400000).toISOString().slice(0,10);
  const HIST=[];for(let d=0;d<450;d++)for(const e of ["HSU 230","HSU 231"])HIST.push({id:HIST.length+1,ncu:"1",equipo:e,clase:"hsu",dia:diaN(d),tz:"UTC",t:[0],vmax:[5]});
  const unaVez=ids=>ids.length===new Set(ids).size;
  await (async()=>{
    const sb=fakeSb(HIST),ids=[],progress=[];
    const out=await SUP.fetchSupabaseWindPeak(sb,{plant:"P",onRows:r=>ids.push(...r.map(x=>x.id)),onProgress:(n,d)=>progress.push([n,d])});
    check("la base: 450 días de dos HSU sin tope, solo el viento máximo de las HSU y avanzando por fecha",()=>{
      assert.equal(ids.length,900);assert.ok(unaVez(ids));assert.equal(out.databaseRows,900);
      assert.equal(out.from,"2025-06-01");assert.equal(out.to,"2026-08-24");assert.equal(out.partialSelect,true);
      // 80 por página; el último día de cada página llena se vuelve a pedir: 39 días por página
      assert.equal(sb.calls.length,12);assert.deepEqual(sb.calls.map(c=>c.gt),[null,...Array.from({length:11},(_,k)=>diaN(39*(k+1)-1))]);
      for(const c of sb.calls){assert.equal(c.table,"telemetria");assert.equal(c.columns,SUP.SUPABASE_WIND_PEAK_SELECT);assert.deepEqual(c.classes,["hsu"]);
        assert.equal(c.eq.planta,"P");assert.deepEqual(c.range,[0,79]);assert.equal(c.gte,null);assert.equal(c.lte,null);}  // nunca por desplazamiento
      assert.ok(SUP.SUPABASE_WIND_PEAK_SELECT.includes("vmax:series->v->wind_speed_max")&&!/(^|,)series(,|$)/.test(SUP.SUPABASE_WIND_PEAK_SELECT));
      assert.deepEqual(progress.at(-1),[900,"2026-08-24"]);
    });
    const acotado=fakeSb(HIST);let n=0;
    await SUP.fetchSupabaseWindPeak(acotado,{plant:"P",from:"2026-01-01",to:"2026-01-10",onRows:r=>{n+=r.length}});
    const viejo=fakeSb(HIST.slice(0,90),{failPartial:true}),idsViejo=[];
    const rep=await SUP.fetchSupabaseWindPeak(viejo,{plant:"P",onRows:r=>idsViejo.push(...r.map(x=>x.id))});
    let sinSesion="",malPeriodo="";
    try{await SUP.fetchSupabaseWindPeak(fakeSb(HIST,{logged:false}),{plant:"P"});}catch(e){sinSesion=e.message;}
    try{await SUP.fetchSupabaseWindPeak(fakeSb(HIST),{plant:"P",from:"2026-02-01",to:"2026-01-01"});}catch(e){malPeriodo=e.message;}
    check("la base: fechas opcionales, sesión obligatoria y repliegue a la serie entera si falla la selección parcial",()=>{
      assert.equal(n,20);assert.equal(acotado.calls[0].gte,"2026-01-01");assert.equal(acotado.calls[0].lte,"2026-01-10");
      assert.equal(idsViejo.length,90);assert.ok(unaVez(idsViejo));assert.equal(rep.partialSelect,false);
      assert.ok(viejo.calls[1].columns.endsWith(",series"));assert.deepEqual(viejo.calls[1].range,[0,39]);
      assert.match(sinSesion,/iniciar sesión/);assert.match(malPeriodo,/Periodo de fechas inválido/);
    });
    /* Un día con más sensores que la página (50 con páginas de 20), entre dos días normales. */
    const ANCHO=[{id:1,dia:"2026-03-01"},{id:2,dia:"2026-03-01"},...Array.from({length:50},(_,k)=>({id:10+k,dia:"2026-03-02"})),{id:90,dia:"2026-03-03"},{id:91,dia:"2026-03-03"}]
      .map(r=>({...r,ncu:"1",equipo:"HSU "+r.id,clase:"hsu",tz:"UTC",t:[0],vmax:[5]}));
    const ancho=fakeSb(ANCHO),idsAncho=[];
    await SUP.fetchSupabaseWindPeak(ancho,{plant:"P",pageSize:20,onRows:r=>idsAncho.push(...r.map(x=>x.id))});
    const lenta=fakeSb(HIST.slice(0,400),{timeoutOver:50}),idsLenta=[];
    await SUP.fetchSupabaseWindPeak(lenta,{plant:"P",onRows:r=>idsLenta.push(...r.map(x=>x.id))});
    let corta="";
    const imposible=fakeSb(HIST,{timeoutOver:10});
    try{await SUP.fetchSupabaseWindPeak(imposible,{plant:"P"});}catch(e){corta=e.message;}
    check("la base: un día que llena la página no se pierde ni se repite; si corta por tiempo, media página",()=>{
      assert.deepEqual(idsAncho,ANCHO.map(r=>r.id));
      assert.ok(ancho.calls.some(c=>c.eq.dia==="2026-03-02"&&c.range[0]===20)&&ancho.calls.some(c=>c.eq.dia==="2026-03-02"&&c.range[0]===40));
      assert.equal(idsLenta.length,400);assert.ok(unaVez(idsLenta));
      assert.deepEqual(lenta.calls.slice(0,2).map(c=>c.range[1]+1),[80,40]);assert.ok(lenta.calls.every(c=>c.columns===SUP.SUPABASE_WIND_PEAK_SELECT));
      assert.match(corta,/statement timeout/);assert.deepEqual(imposible.calls.map(c=>c.range[1]+1),[80,40,20]);
      assert.ok(imposible.calls.every(c=>c.columns===SUP.SUPABASE_WIND_PEAK_SELECT)); // un corte por tiempo no es motivo para pedir la serie entera
    });
  })();
  check("la página usa este motor, la solarPosition canónica y solo sensores de viento",()=>{
    const ui=fs.readFileSync(path.join(root,"meteo.html"),"utf8"),sup=fs.readFileSync(path.join(root,"lib/meteo-supabase.js"),"utf8");
    const motor=fs.readFileSync(path.join(root,"lib/meteo-wind-logic.js"),"utf8");
    assert.ok(ui.includes('from "./lib/meteo-wind-logic.js"'));assert.ok(ui.includes('import {solarPosition} from "./lib/meteo-browser.js"'));
    assert.ok(ui.includes('id="windLogicCard"'));assert.ok(!/^import /m.test(motor));
    assert.ok(!/["']tcu["']/.test(sup),"la tarjeta no debe leer las TCU: la posición es teórica");
    assert.ok(ui.includes("fetchSupabaseWindPeak(supClient()")&&ui.includes("createWindSeriesBuilder()"));
    assert.ok(ui.indexOf('id="windLogicCard"')>ui.indexOf("Mediciones reales · sensores de nuestras plantas")&&
      ui.indexOf('id="windLogicCard"')<ui.indexOf("Previsión horaria · supervisión meteorológica"));
  });
  console.log("PASS "+checks+" verificaciones");
})().catch(e=>{console.error(e);process.exitCode=1;});
