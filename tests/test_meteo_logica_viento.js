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
  check("informe: las mismas cifras que el resumen, contado en claro, con anexo completo y nada sin escapar",()=>{
    const out=simulateWindLogic(NOCHES.map(r=>({...r,plant:"P <b>&"})),{plant:"P <b>&",site:SITE,solarPosition});
    const h=W.windLogicReportHtml(out,{generatedAt:"2026-11-12T17:00:00Z"}),x=out.groups[0];
    assert.match(h,/^<!doctype html>/);assert.ok(h.includes("P &lt;b&gt;&amp;")&&!h.includes("P <b>&"));
    assert.ok(h.includes("<span>Activaciones de pre-stow</span><b>"+x.prestow.total+"</b>"));
    assert.ok(h.includes("<span>Movimientos a posición de stow</span><b>2</b>"));
    assert.ok(h.includes("habría saltado 3 veces y el stow (más de 60 km/h), una vez."));
    assert.ok(h.includes("En 2 de esas 4 el seguidor ya estaba en posición"));
    assert.ok(h.includes("2 primeras alarmas de la noche, con 50° de recorrido"));
    assert.equal((h.split("Anexo: todas las activaciones")[1].match(/<tr/g)||[]).length,1+x.activations.length);
    for(const s of ["Reglas simuladas","En qué posición pilla al seguidor","Cuándo","Lo que la lógica no dice","Sobre los datos"])assert.ok(h.includes("<h2>"+s+"</h2>"),s);
    for(const f of ["v &gt; 40 km/h","θ* = sgn(θ) · max(|θ|, 30°)","Δ = max(0, 30° − |θ|)","Δ = 55° − |θ|","v &gt; 40 km/h ∧ noche","θ* = −55° (Este)","t − tᵤ &gt; 30 min","θₜ = atan2("])assert.ok(h.includes(f),f); // las reglas van como fórmulas, con los valores simulados
    assert.ok(h.includes("posición del seguidor teórica")&&!h.includes("Cómo se ha calculado")); // se dice de dónde sale, sin explicar el cálculo
    assert.equal((h.match(/<svg /g)||[]).length,3); // dos barras de posición y la gráfica semanal
    assert.ok(h.includes("11/06/2026 00:00")&&h.includes("hora local de la planta (Europe/Madrid)")); // 22:00 UTC del día 10
    assert.ok(h.includes("12/11/2026"));
  });
  check("informe: las reglas cambian con los parámetros y con las dos opciones",()=>{
    const out=simulateWindLogic(NOCHES,{plant:"P",site:SITE,solarPosition,options:{prestowKmh:35,stowKmh:50,prestowMinDeg:25,stowDeg:50,maxDeg:60,holdMin:20,noonRule:"follow",duskRule:"hold"}});
    const h=W.windLogicReportHtml(out);
    for(const f of ["v &gt; 35 km/h","v &gt; 50 km/h","max(|θ|, 25°)","Δ = 50° − |θ|","&gt; 20 min","θ* = sgn(θₛ) · max(|θₛ|, 25°)","|θₛ| ≤ 60°"])assert.ok(h.includes(f),f);
    assert.ok(/Supuesto: anochecer<\/td><td class='f'>alarma ∧ anochece<\/td><td class='f'>θ\* = θ<\/td>/.test(h));
  });
  check("informe sin activaciones: lo dice y no dibuja gráficas vacías",()=>{
    const h=W.windLogicReportHtml(simulateWindLogic(serie("2026-06-10T00:00","2026-06-10T23:59",[]),{plant:"P",site:SITE,solarPosition}));
    assert.ok(h.includes("habría saltado ninguna vez y el stow (más de 60 km/h), ninguna vez."));
    assert.ok(!h.includes("<svg ")&&!h.includes("En qué posición pilla al seguidor")&&h.includes("Sin activaciones en el periodo."));
  });
  check("la página usa este motor, la solarPosition canónica y solo sensores de viento",()=>{
    const ui=fs.readFileSync(path.join(root,"meteo.html"),"utf8"),sup=fs.readFileSync(path.join(root,"lib/meteo-supabase.js"),"utf8");
    const motor=fs.readFileSync(path.join(root,"lib/meteo-wind-logic.js"),"utf8");
    assert.ok(ui.includes('from "./lib/meteo-wind-logic.js"'));assert.ok(ui.includes('import {solarPosition} from "./lib/meteo-browser.js"'));
    assert.ok(ui.includes('id="windLogicCard"'));assert.ok(!/^import /m.test(motor));
    assert.ok(!/["']tcu["']/.test(sup),"la tarjeta no debe leer las TCU: la posición es teórica");
    assert.ok(ui.indexOf('id="windLogicCard"')>ui.indexOf("Mediciones reales · sensores de nuestras plantas")&&
      ui.indexOf('id="windLogicCard"')<ui.indexOf("Previsión horaria · supervisión meteorológica"));
  });
  console.log("PASS "+checks+" verificaciones");
})().catch(e=>{console.error(e);process.exitCode=1;});
