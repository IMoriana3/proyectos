// LA EXPOSICIÓN — lo que el abanderamiento deja SIN CUBRIR.
//
// Todo lo que medía `sim-viento.html` era lo que el abanderamiento CUESTA: POA
// perdida y horas fuera de seguimiento. `LOC.exposicion` mide lo contrario:
// los minutos en que el viento que SOPLA está por encima del umbral y el eje
// todavía no está en la posición que ese umbral pide. Es la pregunta de quien
// tiene que aprobar el control, y hasta ahora la ficha no la contestaba.
//
// LO QUE ESTE BANCO VIGILA, por orden de lo caro que sale equivocarse:
//
//   1. QUE MIRE EL VIENTO QUE SOPLA Y NO EL QUE LA MÁQUINA VE. Con la cadena
//      de latencia puesta, una punta de una hora bajo una media de una hora
//      no dispara nada: la máquina sigue en IDLE mientras sopla a 79 km/h. Esos
//      minutos son exposición «sin orden», la peor clase, y si alguien pasa a
//      la función el viento publicado desaparecen sin que ningún otro número
//      se mueva. Es el mutante 1.
//   2. QUE UN CERO QUE NO SE PUEDE VER NO SE ENSEÑE COMO UN CERO. Con el paso
//      por defecto de la ficha (15 min) el eje llega al límite dentro de un
//      solo paso y la exposición sale 0 por construcción. La pantalla tiene que
//      decir «no se ve», no pintar una fila de ceros.
//   3. QUE LEA Y NO DECIDA: con ella o sin ella, el resto del informe sale bit
//      a bit igual. Es lo que mantiene en pie el careo con el motor canónico.
//   4. La aritmética, contra casos hechos a mano donde la cuenta sale de cabeza.
//
// LO QUE NO COMPRUEBA, dicho: que la exposición simulada se parezca a la de una
// planta. La serie de viento es la de la fuente meteo —horaria interpolada si
// no se mete otra cosa— y la cadena de latencia son números declarados, no
// medidos. Tampoco es una comprobación de cargas.
//
//   python3 -m http.server 8099
//   node tests/test_viento_exposicion.js
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');   // dónde está el chromium, en un solo sitio
const BASE = process.env.BASE_URL || process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };
const cerca = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;

// La misma meteo del banco de latencia, horaria (es lo que `LOC.resample`
// espera): día 1 en calma · día 2 con un temporal de cuatro horas · día 3 con
// una punta de UNA hora, que es la que una media larga se come entera.
const FIXTURE = `(function(){
  var dias=3, n=dias*24, t=new Array(n);
  var ghi=new Float64Array(n),dhi=new Float64Array(n),dni=new Float64Array(n);
  var temp=new Float64Array(n),ws=new Float64Array(n),wd=new Float64Array(n),gust=new Float64Array(n);
  var t0=Date.UTC(2024,2,1,0,0,0);
  for(var i=0;i<n;i++){
    t[i]=new Date(t0+i*3600e3);
    var h=i%24, d=Math.floor(i/24);
    var el=Math.max(0,Math.sin((h-6)/12*Math.PI));
    ghi[i]=el*850; dhi[i]=ghi[i]*0.16;
    dni[i]=el>0?(ghi[i]-dhi[i])/Math.max(el,0.087):0;
    temp[i]=14;
    var v=9.5;
    if(d===1 && h>=10 && h<14) v=22;
    if(d===2 && h===11) v=22;
    ws[i]=v; wd[i]=225; gust[i]=v*1.3;
  }
  return {t:t,ghi:ghi,dhi:dhi,dni:dni,temp:temp,ws:ws,wd:wd,gust:gust,
          source:'banco',unidad:'m/s',tiene_rafaga:true};
})()`;

const CFG = { lat: 41.5, lon: -1.0, year: 2024, resample_minutes: 1, wind_height_m: 10,
  threshold_1_kmh: 40, threshold_2_kmh: 60, slew_deg_s: 0.17, deadband_deg: 1.0,
  destow_hold_minutes: 30, partial_park_minutes: 0, partial_stow_min_abs_deg: 30,
  noon_limit_deg: 0, tracker: { max_angle_deg: 55, gcr: 0.397, backtrack: true },
  strategies: ['A1', 'A2', 'B1', 'B2'] };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // La ficha sondea un motor local al arrancar; se corta todo lo de fuera y la
  // simulación entra por `meteoPre`, que es entrada de primera clase de `LOC.run`.
  await ctx.route('**://*/**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.LOC && typeof LOC.run === 'function' && typeof LOC.exposicion === 'function',
    null, { timeout: 60000 });

  // ══ 1 · LA ARITMÉTICA, con series hechas a mano ════════════════════════
  // Paso de 60 s, T1 = 40 km/h, T2 = 60 km/h, límite 55°, parcial 30°, banda
  // muerta 1°. El eje gira 10,2° por paso (0,17 °/s × 60 s).
  const mano = await page.evaluate(() => {
    const T1 = 40 / 3.6, T2 = 60 / 3.6, base = { T1, T2, full: 55, pmin: 30, noon: 0, dtS: 60, dead: 1, slew: 0.17 };
    const t0 = Date.UTC(2024, 0, 1);
    const hazT = n => Array.from({ length: n }, (_, i) => new Date(t0 + i * 60e3));
    const rep = (v, n) => new Array(n).fill(v);
    const caso = (o) => LOC.exposicion(Object.assign({}, base, o, { t: hazT(o.theta.length) }));
    const rampa = [0, 10.2, 20.4, 30.6, 40.8, 51, 55, 55, 55, 55];
    const out = {};
    // a) temporal sobre T2, la máquina ordena al instante y el hierro tarda
    out.a = caso({ dual: true, ws: rep(10, 5).concat(rep(20, 10)), az: rep(90, 15), thB: rep(0, 15),
      theta: rep(0, 5).concat(rampa), mode: rep('IDLE', 5).concat(rep('FULL_STOW', 10)) });
    // b) sopla sobre T1 y la máquina NO se entera (un umbral): todo «sin orden»
    out.b = caso({ dual: false, ws: rep(10, 3).concat(rep(13, 5), rep(10, 3)), az: rep(90, 11), thB: rep(0, 11),
      theta: rep(0, 11), mode: rep('IDLE', 11) });
    // c) dos umbrales, viento ENTRE los dos: basta con entrar al sector parcial (30°)
    out.c = caso({ dual: true, ws: rep(13, 8), az: rep(90, 8), thB: rep(0, 8),
      theta: [0, 10.2, 20.4, 30.6, 40.8, 40.8, 40.8, 40.8], mode: rep('PARTIAL_STOW', 8) });
    // d) el lado manda: viento del oeste (270°) pide −55, y el eje está en +55
    const baja = Array.from({ length: 14 }, (_, k) => Math.max(-55, 55 - 10.2 * k));
    out.d = caso({ dual: true, ws: rep(20, 14), az: rep(270, 14), thB: rep(0, 14), theta: baja, mode: rep('FULL_STOW', 14) });
    // e) la banda muerta: a 54,5° ya ha llegado; a 53,9° todavía no
    out.e1 = caso({ dual: true, ws: rep(20, 4), az: rep(90, 4), thB: rep(0, 4), theta: rep(54.5, 4), mode: rep('FULL_STOW', 4) });
    out.e2 = caso({ dual: true, ws: rep(20, 4), az: rep(90, 4), thB: rep(0, 4), theta: rep(53.9, 4), mode: rep('FULL_STOW', 4) });
    // f) el umbral es estricto, como en la máquina: EXACTAMENTE en T1 no pide nada
    out.f = caso({ dual: false, ws: rep(T1, 6), az: rep(90, 6), thB: rep(0, 6), theta: rep(0, 6), mode: rep('IDLE', 6) });
    // g) el límite de mediodía de las B: con la consigna entre 0 y el límite, el lado se invierte
    const g = { dual: false, ws: rep(20, 4), az: rep(120, 4), thB: rep(5, 4), theta: rep(55, 4), mode: rep('FULL_STOW', 4) };
    out.g0 = caso(Object.assign({}, g, { noon: 0 }));
    out.g10 = caso(Object.assign({}, g, { noon: 10 }));
    // h) dos tramos separados: cuenta dos y se queda con el más largo
    out.h = caso({ dual: false, ws: rep(13, 2).concat(rep(10, 3), rep(13, 4), rep(10, 2)), az: rep(90, 11), thB: rep(0, 11),
      theta: rep(0, 11), mode: rep('IDLE', 11) });
    out.hT = hazT(11)[5].toISOString();
    // i) qué paso deja verla
    out.i60 = caso({ dual: true, ws: rep(1, 2), az: rep(90, 2), thB: rep(0, 2), theta: rep(0, 2), mode: rep('IDLE', 2) });
    out.i900 = caso({ dual: true, ws: rep(1, 2), az: rep(90, 2), thB: rep(0, 2), theta: rep(0, 2), mode: rep('IDLE', 2), dtS: 900 });
    return out;
  });
  check('a) temporal sobre T2: 6 min expuesto, lo que tarda el hierro de 0° a ±55°', mano.a.minutes === 6, JSON.stringify(mano.a));
  check('a) …todo en tránsito, todo sobre T2, un tramo y un abanderamiento',
    mano.a.minutes_in_transit === 6 && mano.a.minutes_no_order === 0 && mano.a.minutes_over_t2 === 6 &&
    mano.a.n_stretches === 1 && mano.a.n_events_exposed === 1 && mano.a.worst_minutes === 6, JSON.stringify(mano.a));
  check('a) el viento máximo expuesto lleva el ángulo del eje y el pedido (72 km/h · 0° → 55°)',
    mano.a.wind_max_kmh === 72 && mano.a.angle_at_wind_max_deg === 0 && mano.a.required_at_wind_max_deg === 55, JSON.stringify(mano.a));
  check('b) la máquina no se entera: 5 min, todos «sin orden», ningún abanderamiento',
    mano.b.minutes === 5 && mano.b.minutes_no_order === 5 && mano.b.minutes_in_transit === 0 && mano.b.n_events_exposed === 0, JSON.stringify(mano.b));
  check('b) …y ninguno sobre T2, porque sopla entre los dos umbrales', mano.b.minutes_over_t2 === 0, mano.b.minutes_over_t2);
  check('c) entre T1 y T2 basta el sector parcial: 3 min hasta pasar de 29°', mano.c.minutes === 3 && mano.c.minutes_over_t2 === 0, JSON.stringify(mano.c));
  check('d) el lado manda: en +55° con viento que pide −55° son 11 min de travesía', mano.d.minutes === 11 && mano.d.required_at_wind_max_deg === -55, JSON.stringify(mano.d));
  check('e) dentro de la banda muerta ya está en posición (54,5° de 55°)', mano.e1.minutes === 0, mano.e1.minutes);
  check('e) …y fuera de ella no (53,9°)', mano.e2.minutes === 4, mano.e2.minutes);
  check('f) exactamente en el umbral no hay exposición: es «>» como en la máquina', mano.f.minutes === 0, mano.f.minutes);
  check('g) sin límite de mediodía, en +55° con sol al este está en posición', mano.g0.minutes === 0, mano.g0.minutes);
  check('g) con límite de mediodía el lado se invierte y +55° pasa a estar expuesto', mano.g10.minutes === 4 && mano.g10.required_at_wind_max_deg === -55, JSON.stringify(mano.g10));
  check('h) dos tramos separados: cuenta 2, total 6 min y el peor son 4', mano.h.n_stretches === 2 && mano.h.minutes === 6 && mano.h.worst_minutes === 4, JSON.stringify(mano.h));
  check('h) …y dice cuándo empezó el peor', mano.h.worst_start === mano.hT, mano.h.worst_start + ' vs ' + mano.hT);
  check('i) a 60 s se puede ver (10,2° por paso < 55°) y a 900 s no', mano.i60.resoluble === true && mano.i900.resoluble === false);
  check('i) el recorrido de plano al límite son 323,5 s', mano.i60.travel_s === 323.5, mano.i60.travel_s);
  check('i) sin exposición no inventa viento máximo', mano.i60.wind_max_kmh === null && mano.i60.worst_start === null);

  // ══ 2 · DENTRO DE LA CORRIDA, sin latencia ═════════════════════════════
  const corre = (extra) => page.evaluate(([fx, cfg, ex]) => {
    const M = eval(fx);
    return LOC.run(Object.assign({}, cfg, ex, { meteoPre: M })).then(R => {
      const o = {}; Object.keys(R.cases).forEach(k => { o[k] = { exp: R.cases[k].exposure, n_events: R.cases[k].n_events,
        hours_engaged: R.cases[k].hours_engaged, poa: R.cases[k].poa_delta_pct }; });
      return { casos: o, dt_h: R.meteo.dt_h, over1: R.wind.hours_over_t1, over2: R.wind.hours_over_t2 };
    });
  }, [FIXTURE, CFG, extra || {}]);
  const sin = await corre();
  const E = k => sin.casos[k].exp;
  check('las cuatro estrategias traen su exposición', ['A1', 'A2', 'B1', 'B2'].every(k => E(k) && typeof E(k).minutes === 'number'),
    Object.keys(sin.casos).join(','));
  check('a 1 min la exposición se puede ver', ['A1', 'A2', 'B1', 'B2'].every(k => E(k).resoluble && E(k).step_s === 60), E('A1').step_s);
  check('hay exposición en el temporal: el hierro tarda', ['A1', 'A2', 'B1', 'B2'].every(k => E(k).minutes > 0),
    ['A1', 'A2', 'B1', 'B2'].map(k => k + '=' + E(k).minutes).join(' '));
  check('sin latencia NADA es «sin orden»: la máquina ve el viento que sopla', ['A1', 'A2', 'B1', 'B2'].every(k => E(k).minutes_no_order === 0),
    ['A1', 'A2', 'B1', 'B2'].map(k => k + '=' + E(k).minutes_no_order).join(' '));
  check('…así que todo es tránsito', ['A1', 'A2', 'B1', 'B2'].every(k => cerca(E(k).minutes_in_transit, E(k).minutes, 0.05)));
  check('las partes suman el todo', ['A1', 'A2', 'B1', 'B2'].every(k => cerca(E(k).minutes_in_transit + E(k).minutes_no_order, E(k).minutes, 0.11)));
  // el techo físico: de un extremo a otro son 110° a 0,17 °/s = 10,8 min; con el paso, 11
  check('ningún tramo dura más que la travesía completa (≤ 11 min)', ['A1', 'A2', 'B1', 'B2'].every(k => E(k).worst_minutes <= 11),
    ['A1', 'A2', 'B1', 'B2'].map(k => k + '=' + E(k).worst_minutes).join(' '));
  check('la exposición no supera el tiempo que sopló sobre T1', ['A1', 'A2', 'B1', 'B2'].every(k => E(k).minutes <= sin.over1 * 60 + 0.5),
    'sobre T1: ' + sin.over1 * 60 + ' min');
  check('sobre T2 no puede haber más que el total', ['A1', 'A2', 'B1', 'B2'].every(k => E(k).minutes_over_t2 <= E(k).minutes + 1e-9));
  check('el viento máximo expuesto está sobre T1 y por debajo del máximo de la serie',
    ['A1', 'A2', 'B1', 'B2'].every(k => E(k).wind_max_kmh > 40 && E(k).wind_max_kmh <= 22 * 3.6 + 0.1),
    ['A1', 'A2', 'B1', 'B2'].map(k => k + '=' + E(k).wind_max_kmh).join(' '));
  check('los abanderamientos con exposición no pasan del total', ['A1', 'A2', 'B1', 'B2'].every(k => E(k).n_events_exposed <= sin.casos[k].n_events));

  // ══ 3 · LEE Y NO DECIDE: el resto del informe, bit a bit igual ═════════
  const igual = await page.evaluate(([fx, cfg]) => {
    const sinExpo = j => JSON.stringify(j, (k, v) => (k === 'exposure' ? undefined : v));
    const original = LOC.exposicion;
    return LOC.run(Object.assign({}, cfg, { meteoPre: eval(fx) })).then(A => {
      LOC.exposicion = function () { return null; };
      return LOC.run(Object.assign({}, cfg, { meteoPre: eval(fx) })).then(B => {
        LOC.exposicion = original;
        return { igual: sinExpo(A) === sinExpo(B), bytes: sinExpo(A).length, nula: B.cases.A1.exposure === null };
      });
    });
  }, [FIXTURE, CFG]);
  check('con la exposición anulada el resto del informe sale idéntico (' + igual.bytes + ' bytes)', igual.igual && igual.nula);

  // ══ 4 · CON LA CADENA DE LATENCIA: lo que la máquina no ve ═════════════
  // Umbral a 70 km/h y media de una hora: la punta del día 3 no dispara.
  const U70 = { threshold_1_kmh: 70, threshold_2_kmh: 200, strategies: ['A1', 'B1'] };
  const off = await corre(U70);
  const on = await corre(Object.assign({}, U70, { latencia: { ventana_s: 3600, muestreo_s: 0, sondeo_s: 0, arranque_s: 0 } }));
  const punta = await page.evaluate(([fx]) => {
    const M = LOC.resample(eval(fx), 1), T = 70 / 3.6; let m = 0;
    for (let i = 0; i < M.t.length; i++) if (M.t[i].getUTCDate() === 3 && M.ws[i] > T) m++;
    return m;
  }, [FIXTURE]);
  check('la media de una hora se come la punta del día 3: un abanderamiento menos (' + off.casos.A1.n_events + ' → ' + on.casos.A1.n_events + ')',
    off.casos.A1.n_events === 2 && on.casos.A1.n_events === 1, off.casos.A1.n_events + ' → ' + on.casos.A1.n_events);
  check('sin latencia sigue sin haber minutos «sin orden»', off.casos.A1.exp.minutes_no_order === 0 && off.casos.B1.exp.minutes_no_order === 0);
  check('con latencia aparecen: la máquina no se entera de la punta (' + on.casos.A1.exp.minutes_no_order + ' min)',
    on.casos.A1.exp.minutes_no_order > 0 && on.casos.B1.exp.minutes_no_order > 0, JSON.stringify(on.casos.A1.exp));
  check('…y son al menos los ' + punta + ' min que sopló sobre el umbral ese día',
    punta > 10 && on.casos.A1.exp.minutes_no_order >= punta - 0.5, on.casos.A1.exp.minutes_no_order + ' vs ' + punta);
  check('con latencia hay más exposición que sin ella', on.casos.A1.exp.minutes > off.casos.A1.exp.minutes,
    on.casos.A1.exp.minutes + ' vs ' + off.casos.A1.exp.minutes);
  check('el viento que SOPLA no depende del anemómetro: las horas sobre umbral no se mueven', on.over1 === off.over1, on.over1 + ' vs ' + off.over1);
  check('un tramo «sin orden» sí puede durar más que la travesía: nadie movía nada', on.casos.A1.exp.worst_minutes > 11, on.casos.A1.exp.worst_minutes);

  // ══ 5 · LA PANTALLA ════════════════════════════════════════════════════
  const pinta = (extra) => page.evaluate(([fx, cfg, ex]) =>
    LOC.run(Object.assign({}, cfg, ex, { meteoPre: eval(fx) })).then(R => {
      window.REP = R; window.drawExpo();
      const el = document.getElementById('expo');
      return { noVe: !!document.getElementById('expoNoVe'), tabla: !!document.getElementById('expoTbl'),
        filas: [...el.querySelectorAll('tbody tr')].map(tr => [tr.dataset.s].concat([...tr.children].map(td => td.textContent))),
        texto: el.textContent, exp: Object.fromEntries(Object.keys(R.cases).map(k => [k, R.cases[k].exposure || null])),
        n: Object.fromEntries(Object.keys(R.cases).map(k => [k, R.cases[k].n_events])) };
    }), [FIXTURE, CFG, extra || {}]);
  const p15 = await pinta({ resample_minutes: 15 });
  check('con el paso por defecto (15 min) la exposición sale 0 por construcción', ['A1', 'A2', 'B1', 'B2'].every(k => p15.exp[k].minutes === 0 && !p15.exp[k].resoluble),
    ['A1', 'A2', 'B1', 'B2'].map(k => k + '=' + p15.exp[k].minutes).join(' '));
  check('…y la pantalla dice «no se puede ver» en vez de pintar ceros', p15.noVe && !p15.tabla && /no se puede ver/.test(p15.texto) && /No es un cero/.test(p15.texto),
    p15.texto.slice(0, 160));
  const p1 = await pinta();
  check('a 1 min pinta la tabla, una fila por estrategia', p1.tabla && !p1.noVe && p1.filas.length === 4 && p1.filas.map(f => f[0]).join(',') === 'A1,A2,B1,B2',
    p1.filas.map(f => f[0]).join(','));
  check('cada celda es el dato del informe, no otra cuenta', p1.filas.every(f => {
    const e = p1.exp[f[0]];
    return f[2] === e.minutes.toFixed(1) && f[3] === e.minutes_in_transit.toFixed(1) && f[4] === e.minutes_no_order.toFixed(1) &&
      f[5] === e.minutes_over_t2.toFixed(1) && f[6] === e.n_events_exposed + ' de ' + p1.n[f[0]] && f[7] === e.worst_minutes.toFixed(1);
  }), JSON.stringify(p1.filas[0]));
  check('la nota dice qué es, con qué tolerancia y qué NO es', /viento que sopla/.test(p1.texto) && /banda muerta/.test(p1.texto) && /No es una comprobación de cargas/.test(p1.texto));
  const pP = await pinta({ strategies: ['A1'], passive: { enabled: true, n_trackers: 10, filas_por_tracker: 2, filas_sueltas: 1, release_kmh: 50 } });
  check('el pasivo no entra en la tabla, y se dice por qué', pP.exp.PASIVO === null && pP.filas.length === 1 && pP.filas[0][0] === 'A1' && /pasivo/i.test(pP.texto),
    JSON.stringify(pP.filas.map(f => f[0])));
  const remoto = await page.evaluate(() => {
    const R = JSON.parse(JSON.stringify(window.REP)); R.local = false; Object.keys(R.cases).forEach(k => { delete R.cases[k].exposure; });
    window.REP = R; window.drawExpo(); return document.getElementById('expo').textContent;
  });
  check('un informe del motor remoto, que no la trae, lo dice y no rompe', /el motor remoto no la calcula/.test(remoto), remoto.slice(0, 120));

  check('sin errores de página', !errores.length, errores.slice(0, 3).join(' | '));
  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FAIL');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.log('FAIL el arnés reventó -> ' + (e && e.stack || e)); process.exit(1); });
