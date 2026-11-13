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

  check("alarma que viene del día y de noche sube a stow: «se queda» va al stow de su lado; «va a stow Este» ya estaba allí",()=>{
    // pre-stow sostenido de 18:30 a 21:10 UTC (el sol se pone hacia las 19:40) y una racha de stow a las 21:00, ya de noche
    const larga=[];for(let t=ms("2026-06-10T18:30");t<=ms("2026-06-10T21:10");t+=20*60000)larga.push([new Date(t).toISOString(),45]);
    const datos=serie("2026-06-10T12:00","2026-06-11T03:00",[...larga,["2026-06-10T21:00",62]]);
    const h=sim(datos,{duskRule:"hold"}),sh=at(h,"stow","2026-06-10T21:00");
    assert.ok(sh.night&&!sh.alreadyOk);assert.ok(sh.posBefore>=30&&sh.posBefore<55,String(sh.posBefore));   // quieto en el Oeste desde el anochecer
    assert.equal(sh.target,55);assert.ok(near(sh.degrees,55-sh.posBefore,0.11)&&sh.degrees<=25,String(sh.degrees));   // al stow Oeste, sin cruzar
    const e=sim(datos,{duskRule:"east"}),se=at(e,"stow","2026-06-10T21:00");
    assert.ok(se.alreadyOk);assert.equal(se.posBefore,-55);
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
    assert.match(lines[0],/^grupo;tipo;id;id_prestow;episodio;inicio_utc;inicio_local;fin_alarma_utc;/);
    assert.match(lines[1],/^NCU 1;pre-stow;1;;1;2026-06-10 10:30;2026-06-10 12:30;2026-06-10 11:00;30;1;45,5;45,5;dia;/);
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
    // Por defecto el seguidor se queda donde está al anochecer con alarma; «va a stow Este» sigue como opción y avisa del cruce
    const x=simulateWindLogic(OCASO,{plant:"P",site:SITE,solarPosition}),rx=W.windLogicSummary(x,x.groups[0]);
    assert.equal(x.options.duskRule,"hold");assert.equal(rx.notes[0],"La alarma sigue activa al anochecer una noche; el seguidor se queda donde está.");
    const xe=simulateWindLogic(OCASO,{plant:"P",site:SITE,solarPosition,options:{duskRule:"east"}}),re=W.windLogicSummary(xe,xe.groups[0]);
    assert.match(re.notes[0],/^La alarma sigue activa al anochecer una noche; en 1 el seguidor está al Oeste y tendría que pasar por horizontal para ir a 55° E\.$/);
  });
  check("planta entera: con dos NCU va primero, y varias HSU en alarma a la vez son una sola activación",()=>{
    // NCU 1 pasa de 40 a las 10:00; NCU 2 pasa de 60 a las 10:10 y de 40 a las 16:00
    const dos=[...serie("2026-06-10T00:00","2026-06-10T23:59",[["2026-06-10T10:00",45]]),
      ...serie("2026-06-10T00:00","2026-06-10T23:59",[["2026-06-10T10:10",63],["2026-06-10T16:00",44]]).map(r=>({...r,ncu:"2"}))];
    const out=simulateWindLogic(dos,{plant:"P",site:SITE,solarPosition}),[p,a,b]=out.groups;
    assert.deepEqual(out.groups.map(g=>g.key),[W.WIND_LOGIC_PLANT_KEY,"1","2"]);assert.equal(p.label,"Planta entera");
    assert.deepEqual(p.sensors,["NCU 1 HSU 230","NCU 2 HSU 230"]);assert.deepEqual(p.parts.map(x=>x.label+":"+x.sensors.join("+")),["NCU 1:HSU 230","NCU 2:HSU 230"]);
    assert.deepEqual([a.prestow.total,a.stow.total],[1,0]);assert.deepEqual([b.prestow.total,b.stow.total],[2,1]);
    assert.deepEqual([p.prestow.total,p.stow.total],[2,1]);          // 10:00 y 10:10 son la misma alarma para la planta: 2, no 1+2
    // las cuatro HSU de dos NCU pasando del umbral en el mismo minuto: una activación, no cuatro
    const cuatro=["1","2"].flatMap(n=>["HSU 230","HSU 231"].flatMap(h=>serie("2026-06-10T00:00","2026-06-10T23:59",[["2026-06-10T10:00",47]]).map(r=>({...r,ncu:n,sensor:h}))));
    const q=simulateWindLogic(cuatro,{plant:"P",site:SITE,solarPosition}).groups[0];
    assert.equal(q.key,W.WIND_LOGIC_PLANT_KEY);assert.deepEqual([q.prestow.total,q.stow.total,q.sensors.length],[1,0,4]);
    const sq=W.windLogicSummary(simulateWindLogic(cuatro,{plant:"P",site:SITE,solarPosition}),q);
    assert.match(sq.notes[0],/varias HSU en alarma a la vez son una sola activación/);
    assert.equal(at(p,"prestow","2026-06-10T10:00").peakKmh,63);assert.ok(at(p,"stow","2026-06-10T10:10")&&at(p,"prestow","2026-06-10T16:00"));
    assert.equal(p.coverage.dataMinutes,1440);
    // una sola NCU: no hay grupo de planta, sería el mismo
    assert.deepEqual(simulateWindLogic(DIA,{plant:"P",site:SITE,solarPosition}).groups.map(g=>g.key),["1"]);
    // el CSV de un grupo no arrastra los demás; sin grupo, van todos
    const filasCsv=k=>windLogicCsv(out,k===undefined?{}:{groupKey:k}).trim().split("\r\n").length-1;
    assert.deepEqual([filasCsv("1"),filasCsv("2"),filasCsv(W.WIND_LOGIC_PLANT_KEY),filasCsv()],[1,3,3,7]);
    const h=W.windLogicReportHtml(out);                               // sin elegir grupo, el informe es el de la planta
    assert.ok(h.includes("<th>Sensores</th><td>todas las HSU de la planta: NCU 1 (HSU 230) y NCU 2 (HSU 230)</td>"));
    // una NCU con menos periodo: se avisa de que hasta esa fecha cuentan las demás
    const corta=[...serie("2026-06-08T00:00","2026-06-10T23:59",[["2026-06-10T10:00",45]]),...serie("2026-06-10T00:00","2026-06-10T23:59",[]).map(r=>({...r,ncu:"2"}))];
    const oc=simulateWindLogic(corta,{plant:"P",site:SITE,solarPosition});
    assert.ok(W.windLogicSummary(oc,oc.groups[0]).notes.includes("De la NCU 2 solo hay dato desde el 10/06/2026: hasta esa fecha el recuento sale de las demás HSU."));
  });
  check("informe: una página con el resumen, la gráfica, las reglas como fórmulas y las notas; sin lista",()=>{
    const out=simulateWindLogic(NOCHES.map(r=>({...r,plant:"P <b>&"})),{plant:"P <b>&",site:SITE,solarPosition});
    const h=W.windLogicReportHtml(out,{generatedAt:"2026-11-12T17:00:00Z"});
    assert.match(h,/^<!doctype html>/);assert.ok(h.includes("P &lt;b&gt;&amp;")&&!h.includes("P <b>&"));
    assert.ok(h.includes("<tr><td>Pre-stow (&gt; 40 km/h)</td><td>2</td><td>3</td><td>1</td><td>2</td><td>2 de noche, 50°</td></tr>")); // 2 episodios, 3 activaciones
    assert.ok(h.includes("<tr><td>Stow (&gt; 60 km/h)</td><td>1</td><td>1</td><td>1</td><td>0</td><td>—</td></tr>"));
    assert.ok(h.includes("Un episodio agrupa las activaciones que vuelven a saltar menos de 2 h después de desactivarse. Activaciones por racha máxima. Pre-stow: 40–50 km/h, 2; más de 60 km/h, 1. Stow: 60–65 km/h, 1."));
    assert.equal((h.match(/<svg /g)||[]).length,1);assert.ok(h.includes("<b>Tabla 2.</b> Reglas simuladas.")&&h.includes("<h2>Observaciones</h2>")&&h.includes("<b>Figura 1.</b>"));
    // se lee como una nota escrita: ficha, dos frases de resumen y fecha con todas sus letras
    assert.ok(h.includes("<th>Planta</th><td>P &lt;b&gt;&amp;</td>")&&h.includes("<th>Sensores</th><td>NCU 1: HSU 230</td>")&&h.includes("<th>Periodo</th><td>del 10/06/2026 al 12/06/2026, 3 días con dato</td>"));
    assert.ok(h.includes("Con el viento registrado por las HSU entre el 10/06/2026 y el 12/06/2026, hay 2 episodios de pre-stow y un episodio de stow; dentro de ellos la alarma salta 3 y 1 veces. En 1 de los pre-stow y en 1 de los stow el seguidor ya está en posición y no hay que moverlo."));
    assert.ok(h.includes("<span>Factiun, 12 de noviembre de 2026</span>")&&!/text-transform|letter-spacing/.test(h)&&!h.includes(" · "));
    assert.match(h,/<body><h1>Lógica de viento: simulación de pre-stow y stow en /); // sin membrete: empieza por el título
    for(const f of ["v &gt; 40 km/h","|θ| ≥ 30°","Δ = max(0, 30° − |θ|)","|θ| = 55°, el lado más cercano","Δ = 55° − |θ|","t − tᵤ &gt; 30 min","Δ = 50°, una vez por noche"])assert.ok(h.includes(f),f);
    assert.ok(!h.includes("Anexo")&&!h.includes("Pre-stow 1</td>")&&!h.includes("Cómo se ha calculado")); // la lista va en el CSV
    assert.ok(h.includes("posición teórica del seguidor, no la de las TCU")&&h.includes("La lista completa de activaciones va en el fichero CSV."));
  });
  check("episodios: las activaciones que vuelven a saltar antes del margen son un mismo episodio de viento",()=>{
    // 10:00 (acaba 10:30), 10:50, 12:40 y 18:00: con 2 h de margen, tres seguidas son un episodio y la de las 18:00, otro
    const g=sim(serie("2026-06-10T00:00","2026-06-10T23:59",[["2026-06-10T10:00",45],["2026-06-10T10:50",47],["2026-06-10T12:40",62],["2026-06-10T18:00",44]]));
    assert.deepEqual([g.prestow.total,g.stow.total],[4,1]);
    const e=W.windLogicEpisodes(g,120);
    assert.deepEqual(e.prestow.map(x=>[x.n,x.activations,x.peakKmh,x.durationMin]),[[1,3,62,190],[2,1,44,30]]);  // de las 10:00 a las 13:10
    assert.deepEqual(e.stow.map(x=>x.activations),[1]);
    assert.equal(W.windLogicEpisodes(g,0).prestow.length,4);assert.equal(W.windLogicEpisodes(g,20).prestow.length,4);   // 10:30→10:50 son 20 min: no es «menos de 20»
    assert.equal(W.windLogicEpisodes(g,21).prestow.length,3);assert.equal(W.windLogicEpisodes(g,600).prestow.length,1);
    // el resumen y el CSV usan el margen de las opciones (2 h por defecto); con 0, episodios = activaciones
    const out=simulateWindLogic(serie("2026-06-10T00:00","2026-06-10T23:59",[["2026-06-10T10:00",45],["2026-06-10T10:50",47],["2026-06-10T12:40",62],["2026-06-10T18:00",44]]),{plant:"P",site:SITE,solarPosition});
    assert.equal(out.options.episodeGapMin,120);
    const r=W.windLogicSummary(out,out.groups[0]);assert.deepEqual(r.rows.map(x=>[x.episodes,x.total]),[[2,4],[1,1]]);assert.match(r.episodeRule,/menos de 2 h después de desactivarse/);
    const csv=windLogicCsv(out).trim().split("\r\n").slice(1).map(l=>l.split(";")).filter(c=>c[1]==="pre-stow").map(c=>c[4]);
    assert.deepEqual(csv,["1","1","1","2"]);
    const sin=simulateWindLogic(DIA,{plant:"P",site:SITE,solarPosition,options:{episodeGapMin:0}}),rs=W.windLogicSummary(sin,sin.groups[0]);
    assert.equal(rs.episodeRule,"");assert.deepEqual(rs.rows.map(x=>x.episodes),rs.rows.map(x=>x.total));
    assert.match(W.windLogicReportHtml(sin),/el pre-stow salta /);                 // sin unir, la frase habla de activaciones
    assert.throws(()=>windLogicOptions({episodeGapMin:-5}),/margen para unir episodios/);
  });
  check("gráficas: cuándo (semana o mes), a qué hora empiezan y cuánto duran, en la hora de la planta",()=>{
    const g=sim(serie("2026-06-10T00:00","2026-06-10T23:59",[["2026-06-10T10:00",45],["2026-06-10T10:50",47],["2026-06-10T12:40",62],["2026-06-10T18:00",44]]));
    const c=W.windLogicCharts(g,{gapMin:120,timeZone:"Europe/Madrid"});
    assert.equal(c.timeline.unit,"semana");assert.deepEqual(c.timeline.labels,["08/06"]);assert.deepEqual([c.timeline.prestow,c.timeline.stow],[[2],[1]]);
    assert.equal(c.hours.prestow[12],1);assert.equal(c.hours.prestow[20],1);assert.equal(c.hours.stow[14],1);       // 10:00, 18:00 y 12:40 UTC son las 12, las 20 y las 14 en la planta
    assert.equal(c.hours.prestow.reduce((a,b)=>a+b,0),2);
    assert.deepEqual(c.durations.labels,["30 min","30–60 min","1–2 h","2–4 h","4–8 h","8–24 h","> 1 día"]);
    assert.deepEqual(c.durations.prestow,[1,0,0,1,0,0,0]);assert.deepEqual(c.durations.stow,[1,0,0,0,0,0,0]);
    // más de 30 semanas: por meses, con el mes y el año de la planta
    const largo=[];for(let d=0;d<300;d+=10){const dia=new Date(Date.parse("2025-09-05T00:00:00Z")+d*86400000).toISOString().slice(0,10);largo.push(...serie(dia+"T00:00",dia+"T23:59",[[dia+"T11:00",46]]));}
    const m=W.windLogicCharts(sim(largo),{gapMin:120,timeZone:"Europe/Madrid"}).timeline;
    assert.equal(m.unit,"mes");assert.equal(m.labels[0],"sep 25");assert.equal(m.labels.at(-1),"jun 26");assert.equal(m.labels.length,10);
    assert.equal(m.prestow.reduce((a,b)=>a+b,0),30);assert.equal(m.prestow[0],3);
  });
  check("calendario de alarmas: tramos partidos en la medianoche de la planta, días sin dato, meses, sol y reloj de 24 h",()=>{
    // tres días con dato (10, 11 y 13 de junio UTC; el 12 falta) y un pre-stow de 21:00 a 23:30 UTC del día 10 = de 23:00 a 01:30 en la planta
    const datos=[...serie("2026-06-10T00:00","2026-06-11T23:59",[["2026-06-10T21:00",45],["2026-06-10T21:25",46],["2026-06-10T21:50",47],["2026-06-10T22:15",44],["2026-06-10T22:40",45],["2026-06-10T23:00",62]]),
      ...serie("2026-06-13T00:00","2026-06-13T23:59",[])];
    const out=simulateWindLogic(datos,{plant:"P",site:SITE,solarPosition}),g=out.groups[0];
    assert.deepEqual([g.prestow.total,g.stow.total],[1,1]);
    const r=W.windLogicRaster(out,g,{solarPosition});
    assert.equal(r.firstDay,"2026-06-10");assert.equal(r.days,5);                    // del 10 (02:00 en la planta) al 14 (01:59)
    const pre=r.segments.filter(x=>x.type==="prestow"),st=r.segments.filter(x=>x.type==="stow");
    assert.deepEqual(pre.map(x=>[x.day,x.from,x.to]),[[0,23,24],[1,0,1.5]]);          // partido en la medianoche local
    assert.deepEqual(st.map(x=>[x.day,x.from,x.to]),[[1,1,1.5]]);                     // 23:00 UTC + 30 min
    assert.deepEqual(r.noData,[]);                                                    // el 12 de la planta tiene dato hasta las 02:00; el 13 desde las 02:00
    assert.equal(r.months.length,0);                                                  // ningún día 1 dentro del periodo
    assert.ok(r.sun.length===5&&r.sun.every(x=>x.rise>5.5&&x.rise<7.5&&x.set>20.5&&x.set<22.5),JSON.stringify(r.sun[0]));   // junio en Zaragoza, hora de verano
    assert.equal(r.clock.prestow[23],20);assert.equal(r.clock.prestow[0],20);assert.equal(r.clock.prestow[1],10);assert.equal(r.clock.stow[1],10);   // 60, 60 y 30 min sobre 5 días
    assert.equal(r.clock.prestow[12],0);
    // un día entero sin dato sí se marca, y los meses llevan su arranque
    const hueco=[...serie("2026-05-30T00:00","2026-05-30T23:59",[]),...serie("2026-06-02T00:00","2026-06-02T23:59",[["2026-06-02T10:00",45]])];
    const oh=simulateWindLogic(hueco,{plant:"P",site:SITE,solarPosition}),rh=W.windLogicRaster(oh,oh.groups[0],{solarPosition});
    assert.deepEqual(rh.noData,[2]);assert.deepEqual(rh.months,[{day:2,label:"jun 26"}]);   // el 1 de junio de la planta no tiene ni una hora de dato
    assert.equal(W.windLogicRaster(out,null).days,0);
  });
  check("qué detecta cada HSU: las alarmas que daría sola y cuándo es ella la que dispara la del grupo",()=>{
    // NCU 1: la 230 pasa de 40 a las 10:00 y la 231 a las 10:05 (misma alarma) y a las 16:00 de 60; NCU 2: su 230 a las 10:02
    const base=(sensor,ncu,gusts)=>serie("2026-06-10T00:00","2026-06-10T23:59",gusts).map(r=>({...r,sensor,ncu}));
    const datos=[...base("HSU 230","1",[["2026-06-10T10:00",45]]),...base("HSU 231","1",[["2026-06-10T10:05",48],["2026-06-10T16:00",66]]),...base("HSU 230","2",[["2026-06-10T10:02",43]])];
    const out=simulateWindLogic(datos,{plant:"P",site:SITE,solarPosition}),[a,b,c]=out.sensors;
    assert.deepEqual(out.sensors.map(x=>x.label),["NCU 1 · HSU 230","NCU 1 · HSU 231","NCU 2 · HSU 230"]);
    assert.deepEqual([a.prestow,a.stow,a.peakKmh,a.minutesOverPrestow,a.days],[1,0,45,1,1]);
    assert.equal(a.hist[45],1);assert.equal(a.hist[18],1439);assert.equal(a.dataMinutes,1440);   // minutos por km/h, para la curva de excedencia
    assert.deepEqual([b.prestow,b.stow,b.peakKmh,b.minutesOverStow],[2,1,66,1]);assert.deepEqual([c.prestow,c.stow],[1,0]);
    // la planta salta a las 10:00 (dispara la 230 de la NCU 1) y a las 16:00 (la 231): cada alarma tiene quien la dispara
    assert.deepEqual([out.groups[0].prestow.total,out.groups[0].stow.total],[2,1]);
    assert.deepEqual(out.sensors.map(x=>[x.firesPrestow,x.firesStow]),[[1,0],[1,1],[0,0]]);
    // lo mismo desde las filas de la base
    const b2=W.createWindSeriesBuilder();
    for(const [h,n,gusts] of [["HSU 230","1",[[600,45]]],["HSU 231","1",[[605,48],[960,66]]],["HSU 230","2",[[602,43]]]]){
      const t=Array.from({length:1440},(_,i)=>i*60),vmax=t.map(()=>5);for(const [k,v] of gusts)vmax[k]=v/3.6;
      b2.add([{id:1,ncu:n,equipo:h,dia:"2026-06-10",tz:"UTC",subido:"x",t,vmax}]);
    }
    const o2=simulateWindLogic(null,{plant:"P",site:SITE,solarPosition,series:b2.finish()});
    assert.deepEqual(o2.sensors.map(x=>[x.label,x.prestow,x.stow,x.firesPrestow,x.firesStow]),out.sensors.map(x=>[x.label,x.prestow,x.stow,x.firesPrestow,x.firesStow]));
  });
  check("informe: las reglas siguen a los parámetros simulados",()=>{
    const out=simulateWindLogic(NOCHES,{plant:"P",site:SITE,solarPosition,options:{prestowKmh:35,stowKmh:50,prestowMinDeg:25,stowDeg:50,maxDeg:60,holdMin:20,nightDeg:10}});
    const h=W.windLogicReportHtml(out);
    for(const f of ["v &gt; 35 km/h","v &gt; 50 km/h","|θ| ≥ 25°","Δ = 50° − |θ|","t − tᵤ &gt; 20 min","Δ = 40°, una vez por noche","de noche, 10° E"])assert.ok(h.includes(f),f);
  });
  check("informe sin activaciones: ceros en el resumen y ninguna gráfica vacía",()=>{
    const h=W.windLogicReportHtml(simulateWindLogic(serie("2026-06-10T00:00","2026-06-10T23:59",[]),{plant:"P",site:SITE,solarPosition}));
    assert.ok(h.includes("<td>Pre-stow (&gt; 40 km/h)</td><td>0</td><td>0</td><td>0</td><td>0</td><td>—</td>"));
    assert.ok(!h.includes("<svg ")&&!h.includes("Por racha máxima")&&!h.includes("Figura 1"));
    assert.ok(h.includes("ninguna de las dos alarmas llega a saltar."));
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
