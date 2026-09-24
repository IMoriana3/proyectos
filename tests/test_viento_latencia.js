// LA CADENA DE LATENCIA Y EL CRONÓMETRO.
//
// Hasta ahora esta ficha modelaba UN retardo: el del hierro, `LOC.control`, que
// recorre la maniobra a 0,17 °/s. Con ese solo, el reloj de un abanderamiento
// es `|Δθ| / 0,17` — un número que se hace de cabeza y que la tarjeta ya
// predice—, así que un cronómetro encima no habría contado nada nuevo. Por eso
// las dos cosas van juntas: sin latencia no hay nada que cronometrar.
//
// LO QUE SE AÑADE son cuatro esperas que ocurren ANTES de que el eje se mueva:
// la media del anemómetro, su muestreo, el sondeo NCU→TCU y el arranque del
// motor. Nada de esto escribe en ninguna NCU ni habla Modbus: son parámetros
// declarados por quien simula.
//
// LO MEDIDO, y es lo que justifica el fichero. Fixture de tres días (temporal
// largo de 4 h el día 2, punta de UNA hora el día 3), meteo horaria
// remuestreada a 1 min, estrategia A2:
//
//   umbral 40 km/h        Δ POA A2      horas abanderado   episodios
//     sin latencia .......... −10,129 %        6,50            2
//     media 600 s ...........  −9,785 %        6,47            2
//     media 3600 s ..........  −7,951 %        7,00            2
//     media 7200 s ..........  −4,703 %        8,00            2
//
//   umbral 70 km/h        Δ POA A2      horas abanderado   episodios
//     sin latencia ..........  −1,161 %        3,83            2
//     media 3600 s ..........  −0,457 %        3,27          ¡1!
//
// Dos lecturas, y la segunda es la importante:
//
//   · con una media de dos horas, el coste del abanderamiento de A2 se queda en
//     LA MITAD (−10,13 % → −4,70 %). Un informe que no diga con qué cadena
//     corrió puede equivocarse en un factor de dos sin que ningún número tenga
//     mala pinta;
//   · y con la punta de una hora bajo una media de una hora, el episodio
//     DESAPARECE: 2 → 1. La media no retrasa la decisión, la CAMBIA. El viento
//     sopló por encima de 70 km/h durante 3,8 h —`hours_over_t1` vale 3,8 en
//     los CUATRO casos, no se mueve— y la máquina no llegó a verlo.
//
// Esa última línea es la distinción que el banco vigila más de cerca: el viento
// que SOPLA y el que la máquina VE son dos series, y solo la segunda decide.
// Todo lo que describe el SITIO —horas sobre umbral, máximo del año, ráfaga de
// cada episodio— se sigue midiendo sobre la primera. Si algún día alguien
// «arregla» eso pasando el viento publicado a las estadísticas, el sitio
// empezará a cambiar según el anemómetro que se le ponga.
//
// Y LA IDENTIDAD A CERO no es un detalle de elegancia: es lo que sostiene el
// careo con el motor canónico, que no tiene cadena de latencia. Las tres
// primitivas devuelven EL MISMO OBJETO cuando su parámetro vale 0 —no uno
// igual: el mismo—, así que con la casilla apagada el año sale bit a bit como
// antes. Hay comprobación de eso con `===`, no con tolerancia.
//
//   python3 -m http.server 8099
//   node tests/test_viento_latencia.js
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');   // dónde está el chromium, en un solo sitio
const BASE = process.env.BASE_URL || process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };
const cerca = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;

// La meteo va HORARIA porque es lo que `LOC.resample` espera: al darle una
// fixture ya minutal la expandió 60 veces y salieron 259 h de viento fuerte en
// una ventana de 72 h. El número imposible lo delató; con una fixture a la
// cadencia de la ficha, el remuestreo a 1 min es el camino real.
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
    // Día 1 en calma · día 2 con temporal LARGO · día 3 con una punta de UNA
    // HORA, que es la que una media larga se come entera.
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
  destow_hold_minutes: 30, partial_park_minutes: 0, partial_stow_min_abs_deg: 0,
  noon_limit_deg: 0, tracker: { max_angle_deg: 55, gcr: 0.397, backtrack: true },
  strategies: ['A2', 'B2'] };
const CERO = { ventana_s: 0, muestreo_s: 0, sondeo_s: 0, arranque_s: 0 };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // La ficha SONDEA un motor local al arrancar y eso no es meteo; se corta todo
  // lo de fuera y la simulación entra por `meteoPre`, que es entrada de
  // primera clase de `LOC.run`.
  await ctx.route('**://*/**', r => r.request().url().startsWith(BASE)
    ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#run', { timeout: 20000 });

  check('la ficha expone la cadena entera', await page.evaluate(() =>
    ['mediaMovil', 'rejilla', 'retardo', 'vientoVisto', 'ordenEnElEje',
     'cadenaViva', 'latenciaViva'].every(k => typeof LOC[k] === 'function')));

  // ══════════════════════════════════════════════════════════════════
  //  1) LAS TRES PRIMITIVAS
  // ══════════════════════════════════════════════════════════════════
  const P = await page.evaluate(() => {
    const a = Float64Array.from([0, 0, 10, 10, 10, 10, 10, 10, 0, 0, 0, 0]);
    const o = {};
    // IDENTIDAD a cero, por IDENTIDAD DE OBJETO y no por valor. Es lo que
    // garantiza que con la casilla apagada no se toca ni un bit.
    o.idMedia = LOC.mediaMovil(a, 60, 0) === a;
    o.idRejilla = LOC.rejilla(a, 60, 0) === a;
    o.idRetardo = LOC.retardo(a, 60, 0) === a;
    o.idVisto = LOC.vientoVisto(a, 60, { ventana_s: 0, muestreo_s: 0 }) === a;
    o.idOrden = LOC.ordenEnElEje(a, 60, { sondeo_s: 0, arranque_s: 0 }) === a;
    // Y también cuando el parámetro es MENOR que el paso: media de 30 s sobre
    // pasos de 60 s no promedia nada, y una rejilla más fina que el paso no
    // retiene nada. Un `k` redondeado a 1 y una rejilla a 0 son identidades.
    o.idSub = LOC.mediaMovil(a, 60, 20) === a && LOC.rejilla(a, 60, 30) === a;

    // MEDIA MÓVIL: escalón 0→10 con ventana de 4 pasos → rampa de 4 pasos.
    o.media = Array.from(LOC.mediaMovil(a, 60, 240));
    // CAUSAL: cambiar el FUTURO no toca el pasado. Un promedio centrado sí lo
    // tocaría, y un anemómetro no tiene futuro.
    const b = Float64Array.from(a); b[9] = 99;
    const m1 = LOC.mediaMovil(a, 60, 240), m2 = LOC.mediaMovil(b, 60, 240);
    o.causal = m1.slice(0, 9).every((v, i) => v === m2[i]) && m1[9] !== m2[9];

    // REJILLA: retiene entre bordes. Con paso 60 s y periodo 300 s, publica
    // uno de cada cinco.
    const c = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    o.rejilla = Array.from(LOC.rejilla(c, 60, 300));
    // Y UNA PUNTA ENTRE BORDES NO SE PUBLICA NUNCA. No es un retardo: es dato
    // que no existe para la máquina.
    const d = Float64Array.from([0, 0, 0, 99, 0, 0, 0, 0, 0, 0]);
    o.punta = Array.from(LOC.rejilla(d, 60, 300));

    // RETARDO: desplaza k pasos y sostiene el inicial mientras no llega nada.
    o.retardo = Array.from(LOC.retardo(c, 60, 180));

    // EL ORDEN DE LA COMPOSICIÓN IMPORTA: promediar-y-publicar no es
    // publicar-y-promediar. Si diera igual, la nota del código estaría de más.
    const e = Float64Array.from([0, 0, 12, 12, 12, 0, 0, 0, 0, 0]);
    const AB = LOC.rejilla(LOC.mediaMovil(e, 60, 180), 60, 180);
    const BA = LOC.mediaMovil(LOC.rejilla(e, 60, 180), 60, 180);
    o.orden = !AB.every((v, i) => v === BA[i]);
    return o;
  });

  check('a cero, la media devuelve EL MISMO objeto', P.idMedia);
  check('a cero, la rejilla también', P.idRejilla);
  check('a cero, el retardo también', P.idRetardo);
  check('a cero, el viento visto es la misma serie', P.idVisto);
  check('a cero, la orden en el eje es la misma serie', P.idOrden);
  check('y también cuando el parámetro no llega a un paso', P.idSub);

  // Al principio de la serie la ventana está a medias y se promedia LO QUE
  // HAY, no se divide siempre por `k`: en i=2 hay tres muestras (0,0,10) y sale
  // 10/3, no 10/4. Escribí 2,5 de memoria y el banco me corrigió — la
  // alternativa habría sido dividir por 4 desde el primer paso, que es
  // inventar dos muestras de viento en calma que nadie midió.
  check('la media sube en RAMPA, no de golpe',
        cerca(P.media[2], 10 / 3, 1e-12) && P.media[3] === 5 &&
        P.media[4] === 7.5 && P.media[5] === 10,
        P.media.slice(0, 7).join(' '));
  check('y tarda la ventana entera en llegar arriba',
        P.media[4] < 10 && P.media[5] === 10, P.media.slice(2, 6).join(' '));
  // Y LA BAJADA, que es donde una VENTANA se distingue de un ACUMULADO. Las
  // dos suben igual en los primeros pasos —con la fixture de aquí dan los
  // MISMOS cuatro números—, así que la rampa sola no separa una de otra: el
  // mutante de la media acumulada sobrevivía a las dos comprobaciones de
  // arriba y lo cazaron los careos, no ellas. Una ventana SUELTA lo viejo y
  // vuelve a cero cuando amaina; un acumulado se queda arriba para siempre, y
  // entonces el seguidor no destowea nunca.
  check('y BAJA cuando amaina: la ventana suelta lo viejo',
        P.media[8] === 7.5 && P.media[11] === 0, P.media.slice(8).join(' '));
  check('la media es CAUSAL: el futuro no toca el pasado', P.causal);

  check('la rejilla retiene el valor entre bordes',
        P.rejilla.slice(0, 5).every(v => v === 1) && P.rejilla[5] === 6,
        P.rejilla.join(' '));
  check('y publica uno de cada cinco pasos con periodo 5×',
        new Set(P.rejilla).size === 2, JSON.stringify([...new Set(P.rejilla)]));
  check('una punta entre bordes NO se publica NUNCA',
        P.punta.every(v => v === 0), P.punta.join(' '));

  check('el retardo desplaza exactamente los pasos pedidos',
        P.retardo[5] === 3 && P.retardo[9] === 7, P.retardo.join(' '));
  check('y sostiene el inicial mientras no ha llegado nada',
        P.retardo.slice(0, 3).every(v => v === 1), P.retardo.slice(0, 4).join(' '));

  check('promediar-y-publicar NO es publicar-y-promediar', P.orden);

  // ══════════════════════════════════════════════════════════════════
  //  2) EL CAREO ENTRE LAS DOS IMPLEMENTACIONES
  // ══════════════════════════════════════════════════════════════════
  // La serie decide la ENERGÍA DEL AÑO y la incremental decide LO QUE SE VE en
  // el panel en vivo. Dos implementaciones de la misma regla es la forma más
  // fácil de que se separen — ya pasó en este repo con el rumbo del viento,
  // ocho copias— y aquí la divergencia no daría error: daría otro cronómetro.
  //
  // Se exige igualdad EXACTA, no `approx`: las dos hacen las mismas
  // operaciones sobre los mismos números, así que no hay nada que tolerar y
  // una diferencia en el último bit ya es otra ventana.
  const CAREOS = [
    { ventana_s: 0, muestreo_s: 0, sondeo_s: 0, arranque_s: 0 },
    { ventana_s: 300, muestreo_s: 0, sondeo_s: 0, arranque_s: 0 },
    { ventana_s: 0, muestreo_s: 300, sondeo_s: 0, arranque_s: 0 },
    { ventana_s: 600, muestreo_s: 120, sondeo_s: 0, arranque_s: 0 },
    { ventana_s: 0, muestreo_s: 0, sondeo_s: 300, arranque_s: 0 },
    { ventana_s: 0, muestreo_s: 0, sondeo_s: 0, arranque_s: 180 },
    { ventana_s: 0, muestreo_s: 0, sondeo_s: 240, arranque_s: 120 },
  ];
  const C = await page.evaluate((casos) => {
    // Una serie con escalones, mesetas y bajadas: si fuera monótona, una
    // implementación que se comiera una muestra daría lo mismo que la otra.
    // LOS ESCALONES VAN FUERA DE LOS BORDES DE LA REJILLA, y no es un capricho
    // de números feos: la primera versión los puso en 10, 25, 30 y 45 —todos
    // múltiplos de 5, que es el periodo en pasos— así que la rejilla publicaba
    // justo donde la señal cambiaba y era la IDENTIDAD. Dos de los siete
    // careos comparaban entonces dos series sin tocar, y el control positivo
    // lo cantó (4 de 7 en vez de 6). El fixture tiene que contener el
    // mecanismo, también cuando el mecanismo es una rejilla.
    const n = 60, dt = 60, a = new Float64Array(n);
    for (let i = 0; i < n; i++)
      a[i] = (i < 11) ? 3 : (i < 26) ? 18 : (i < 31) ? 3 : (i < 47) ? 25 : 5;
    return casos.map(lat => {
      const serieV = Array.from(LOC.vientoVisto(a, dt, lat));
      const serieO = Array.from(LOC.ordenEnElEje(a, dt, lat));
      // Cada cadena lleva su propio reloj y lo avanza ella: desde fuera no hay
      // orden que equivocar, que es justo el fallo que este careo encontró.
      const cv = LOC.cadenaViva(lat), co = LOC.cadenaViva(lat);
      const vivaV = [], vivaO = [];
      for (let i = 0; i < n; i++) { vivaV.push(cv.ve(a[i], dt)); vivaO.push(co.llega(a[i], dt)); }
      return {
        medida: serieV.every((v, i) => v === vivaV[i]),
        orden: serieO.every((v, i) => v === vivaO[i]),
        difV: serieV.map((v, i) => Math.abs(v - vivaV[i])).reduce((x, y) => Math.max(x, y), 0),
        difO: serieO.map((v, i) => Math.abs(v - vivaO[i])).reduce((x, y) => Math.max(x, y), 0),
        // el control positivo del propio careo: la serie tiene que MOVERSE con
        // el parámetro, o el careo estaría comparando dos identidades
        mueve: !serieV.every((v, i) => v === a[i]) || !serieO.every((v, i) => v === a[i]),
      };
    });
  }, CAREOS);

  CAREOS.forEach((lat, i) => {
    const et = 'v' + lat.ventana_s + ' m' + lat.muestreo_s + ' s' + lat.sondeo_s + ' a' + lat.arranque_s;
    check('careo serie↔viva · medida · ' + et, C[i].medida, 'máx dif ' + C[i].difV);
    check('careo serie↔viva · orden · ' + et, C[i].orden, 'máx dif ' + C[i].difO);
  });
  // Sin esto, siete careos verdes y «las dos implementaciones son la
  // identidad» se leerían igual.
  check('y el careo no compara dos identidades: seis de los siete mueven la serie',
        C.filter(x => x.mueve).length === 6, C.filter(x => x.mueve).length);

  // ══════════════════════════════════════════════════════════════════
  //  3) EL AÑO
  // ══════════════════════════════════════════════════════════════════
  const corre = (lat, extra) => page.evaluate(async a => {
    const cfg = Object.assign({}, a.cfg, a.extra || {}, { meteoPre: eval(a.fix) });
    if (a.lat) cfg.latencia = a.lat;
    const R = await LOC.run(cfg);
    return { rows: R.meteo.rows,
      t1: R.wind.hours_over_t1, t2: R.wind.hours_over_t2, max: R.wind.max_ms,
      A2: { d: R.cases.A2.poa_delta_pct, ev: R.cases.A2.n_events, hs: R.cases.A2.hours_stow },
      B2: { d: R.cases.B2.poa_delta_pct, ev: R.cases.B2.n_events, hs: R.cases.B2.hours_stow },
      base: R.baseline.poa_kwh_m2,
      cfgLat: R.config.latencia, viva: R.config.latencia_activa };
  }, { fix: FIXTURE, cfg: CFG, lat, extra });

  const SIN = await corre(null);
  const CERO_R = await corre(CERO);
  check('el año corre sobre la fixture', SIN.rows > 4000 && SIN.A2.ev > 0,
        SIN.rows + ' filas · ' + SIN.A2.ev + ' episodios');

  // LA PROPIEDAD QUE SOSTIENE EL CAREO CANÓNICO. Todo, con `===`.
  check('con la latencia a CERO el año sale idéntico al de siempre · POA base',
        CERO_R.base === SIN.base, CERO_R.base + ' vs ' + SIN.base);
  check('… · Δ POA A2', CERO_R.A2.d === SIN.A2.d, CERO_R.A2.d + ' vs ' + SIN.A2.d);
  check('… · Δ POA B2', CERO_R.B2.d === SIN.B2.d, CERO_R.B2.d + ' vs ' + SIN.B2.d);
  check('… · episodios y horas',
        CERO_R.A2.ev === SIN.A2.ev && CERO_R.A2.hs === SIN.A2.hs,
        CERO_R.A2.ev + '/' + CERO_R.A2.hs);
  check('la latencia viaja en el resultado TAMBIÉN cuando está apagada',
        CERO_R.cfgLat && CERO_R.cfgLat.ventana_s === 0 && CERO_R.viva === false,
        JSON.stringify(CERO_R.cfgLat));

  const V600 = await corre({ ventana_s: 600, muestreo_s: 60, sondeo_s: 0, arranque_s: 0 });
  const V3600 = await corre({ ventana_s: 3600, muestreo_s: 60, sondeo_s: 0, arranque_s: 0 });
  const V7200 = await corre({ ventana_s: 7200, muestreo_s: 600, sondeo_s: 0, arranque_s: 0 });
  const SOND = await corre({ ventana_s: 0, muestreo_s: 0, sondeo_s: 300, arranque_s: 60 });

  check('con latencia, el resultado se declara vivo', V600.viva === true);

  // LA DISTINCIÓN. El viento que sopla describe el SITIO y no lo toca ningún
  // anemómetro: si esto se pusiera rojo, alguien habría pasado el viento
  // publicado a las estadísticas y el sitio cambiaría según el instrumento.
  [['media 600 s', V600], ['media 3600 s', V3600], ['media 7200 s', V7200],
   ['sondeo + arranque', SOND]].forEach(([et, R]) => {
    check('las horas sobre umbral NO se mueven · ' + et,
          R.t1 === SIN.t1 && R.t2 === SIN.t2, R.t1 + ' vs ' + SIN.t1);
    check('ni el máximo del año · ' + et, R.max === SIN.max, R.max + ' vs ' + SIN.max);
  });
  check('ni la POA de la línea base, que no pasa por ninguna máquina',
        V7200.base === SIN.base, V7200.base + ' vs ' + SIN.base);

  // EL EFECTO, con los números MEDIDOS. La banda es estrecha a propósito: un
  // rango ancho admitiría el defecto y no sería un guard, sería un adorno.
  check('la media ABARATA el abanderamiento de A2, y cuanto más larga, más',
        V600.A2.d > SIN.A2.d && V3600.A2.d > V600.A2.d && V7200.A2.d > V3600.A2.d,
        [SIN.A2.d, V600.A2.d, V3600.A2.d, V7200.A2.d].join(' → '));
  check('con dos horas de media, el coste de A2 se queda casi en la MITAD',
        cerca(SIN.A2.d, -10.129, 0.02) && cerca(V7200.A2.d, -4.703, 0.05),
        SIN.A2.d + ' → ' + V7200.A2.d);
  check('y las horas abanderado SUBEN: la media también ensancha el episodio',
        V7200.A2.hs > SIN.A2.hs, SIN.A2.hs + ' → ' + V7200.A2.hs);
  check('el sondeo y el arranque, en cambio, lo ENCARECEN',
        SOND.A2.d < SIN.A2.d, SIN.A2.d + ' → ' + SOND.A2.d);

  // EL HALLAZGO: el episodio que desaparece.
  const T70 = await corre(null, { threshold_1_kmh: 70, threshold_2_kmh: 90 });
  const T70v = await corre({ ventana_s: 3600, muestreo_s: 60, sondeo_s: 0, arranque_s: 0 },
                           { threshold_1_kmh: 70, threshold_2_kmh: 90 });
  check('sin latencia, la punta de una hora SÍ abandera', T70.A2.ev === 2, T70.A2.ev);
  check('con una media de una hora, ese episodio DESAPARECE', T70v.A2.ev === 1, T70v.A2.ev);
  check('y aun así el viento sopló lo mismo: `hours_over_t1` no se mueve',
        T70v.t1 === T70.t1, T70v.t1 + ' vs ' + T70.t1);

  // ══════════════════════════════════════════════════════════════════
  //  4) EL CRONÓMETRO
  // ══════════════════════════════════════════════════════════════════
  check('el cronómetro tiene su sitio en el panel en vivo',
        await page.evaluate(() => !!document.getElementById('cronoBox')));
  check('y el interruptor de latencia NO pisa a la latitud',
        await page.evaluate(() =>
          document.getElementById('lat').type === 'number' &&
          document.getElementById('lat_on').type === 'checkbox'));

  // Apagada: el cronómetro dice que no hay nada que contar en vez de enseñar
  // una tabla de ceros, que se leería como una maniobra instantánea.
  const apagado = await page.evaluate(() => {
    document.getElementById('lat_on').checked = false;
    latUI();
    const c = document.getElementById('cronoBox');
    return { visible: c.style.display !== 'none', txt: c.textContent };
  });
  check('con la latencia apagada, el cronómetro lo DICE', apagado.visible &&
        /latencia.*apagada|apagada/i.test(apagado.txt), apagado.txt.slice(0, 90));

  // Encendida y con el reloj corriendo: se mide una maniobra de verdad.
  await page.evaluate(() => {
    document.getElementById('lat_on').checked = true;
    document.getElementById('latVent').value = '300';
    document.getElementById('latMues').value = '60';
    document.getElementById('latSond').value = '60';
    document.getElementById('latArr').value = '30';
    latUI();
    document.getElementById('lSpeed').value = '900';
    const v = document.getElementById('lV');
    v.value = '20'; v.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const txtVacio = await page.evaluate(() => document.getElementById('cronoBox').textContent);
  check('en calma, el cronómetro está a la espera y no inventa una medida',
        !/en posición/i.test(txtVacio) || /Sube el viento/i.test(txtVacio),
        txtVacio.slice(0, 80));

  await page.click('#lPlay');
  await page.waitForTimeout(400);
  // El viento sube POR ENCIMA del umbral con el reloj ya corriendo: ése es el
  // flanco que arranca el cronómetro.
  await page.evaluate(() => {
    const v = document.getElementById('lV');
    v.value = '95'; v.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Se espera al ESTADO, no al rótulo: «en posición» es el nombre de la fila y
  // está escrito desde el primer fotograma, así que esperarlo devolvía el
  // control con la maniobra todavía en vuelo y `tFin` a null. Un rótulo no es
  // una medida.
  await page.waitForFunction(() =>
    window.LIVE && LIVE.crono && LIVE.crono.fase === 'hecha',
    null, { timeout: 30000 });
  const CR = await page.evaluate(() => {
    const C = LIVE.crono, D = C.ultima || { t0: C.t0, tVe: C.tVe, por: C.por };
    const S = Object.keys(D.por || {})[0];
    const p = (D.por || {})[S] || {};
    return { txt: document.getElementById('cronoBox').textContent,
      t0: D.t0, tVe: D.tVe, S: S,
      det: (D.tVe != null && D.t0 != null) ? D.tVe - D.t0 : null,
      lle: (p.tLle != null && D.t0 != null) ? p.tLle - D.t0 : null,
      fin: (p.tFin != null && D.t0 != null) ? p.tFin - D.t0 : null,
      recorridoPuro: Math.abs(LIVE.ordenEje[S] || 0) / LOC.SLEW };
  });
  await page.click('#lPlay');

  check('el cronómetro MIDE una maniobra entera', CR.fin != null && CR.fin > 0,
        JSON.stringify({ det: CR.det, lle: CR.lle, fin: CR.fin }));
  check('los instantes van EN ORDEN: se ve, llega, para',
        CR.det >= 0 && CR.lle > CR.det && CR.fin > CR.lle,
        [CR.det, CR.lle, CR.fin].join(' < '));
  // LA RAZÓN DE SER DEL CRONÓMETRO: el total es MAYOR que el recorrido del eje,
  // que es lo único que se sabía antes. Si fueran iguales, la cadena no estaría
  // entrando y el cronómetro sería la calculadora de `|Δθ|/0,17`.
  check('y el total es MAYOR que el recorrido del hierro a 0,17 °/s',
        CR.fin > CR.recorridoPuro * 1.05,
        fmtN(CR.fin) + ' s vs ' + fmtN(CR.recorridoPuro) + ' s de puro recorrido');
  check('la detección no es instantánea: la media y el muestreo cuestan',
        CR.det > 0, CR.det);
  check('el cronómetro nombra al pasivo para decir que NO espera a nadie',
        /pasivo/i.test(CR.txt), CR.txt.slice(-120));

  // ══════════════════════════════════════════════════════════════════
  //  4bis) EL BOTÓN NO PUEDE MENTIR SOBRE EL RELOJ
  // ══════════════════════════════════════════════════════════════════
  // REPORTADO: «pauso pero sigue corriendo el tiempo». Y era literal.
  //
  // El rótulo del botón se escribía SOLO en el manejador del clic, así que era
  // una SEGUNDA COPIA de `LIVE.run` y no una vista suya. Cualquier otro camino
  // que tocara el estado lo dejaba desincronizado, y había dos: montar la
  // escena (planta, nº de trackers, filas, pasivo) y encender la latencia —
  // los dos llaman a `liveInit`, que ponía `run:false`.
  //
  // MEDIDO antes de arreglarlo, con el reloj corriendo:
  //
  //   tras cambiar el nº de trackers ... LIVE.run=false · botón «❚❚ Pausa»
  //   tras pulsar el botón (¡a pausar!) . LIVE.run=true  · el reloj ARRANCA
  //   el reloj tras «pausar» ........... 725 -> 726,5 min
  //
  // Y por el otro camino, al revés y igual de malo: encender la latencia
  // PARABA el reloj en silencio dejando el botón en «❚❚ Pausa».
  //
  // Esto no es cosmética y por eso vive en el banco del cronómetro: lo que el
  // cronómetro mide son SEGUNDOS DE RELOJ SIMULADO, y su propio pie dice
  // «reloj parado: el cronómetro no avanza». Con el botón mintiendo, esa línea
  // miente con él.
  //
  // Se prueba la PROPIEDAD —el rótulo se deduce del estado— en los caminos que
  // la rompieron, no la implementación.
  // UN SOLO DUEÑO DEL RÓTULO, y se comprueba en el FUENTE porque es ahí donde
  // se rompe. Las comprobaciones de comportamiento de abajo recorren los dos
  // caminos que fallaron; ésta prohíbe que nazca un tercero — que es como
  // apareció éste. Sin ella, el día que alguien vuelva a escribir el rótulo en
  // un manejador nuevo, el banco solo lo vería si ese camino concreto está
  // entre los que recorre.
  const fuenteViento = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'sim-viento.html'), 'utf8');
  const escritores = (fuenteViento.match(/lPlay'\)[^;\n]*\.textContent\s*=|b\.textContent\s*=/g) || []);
  check('el rótulo del botón lo escribe UN SOLO sitio', escritores.length === 1,
        escritores.length + ': ' + escritores.join(' · '));
  check('y ese sitio es `pintaPlay`, que lo DEDUCE de LIVE.run',
        /function pintaPlay\(\)\s*\{[\s\S]{0,300}?LIVE\.run\s*\?/.test(fuenteViento));

  // MUTANTE QUE SOBREVIVE, DECLARADO. Quitar la llamada a `pintaPlay()` de
  // DENTRO de `liveInit` no pone rojo nada de este banco, y es correcto que no
  // lo ponga: desde que `liveInit` PRESERVA el reloj (`run:corria`), el estado
  // no cambia al remontar, así que no hay rótulo que refrescar. Esa llamada es
  // hoy un cinturón sobre los tirantes.
  //
  // No se quita, y el motivo va escrito para que no se lea como descuido: es
  // lo que hace cierta la frase «el botón es una vista del estado» el día que
  // alguien vuelva a tocar `run` dentro de `liveInit` — que es exactamente lo
  // que hacía la versión con el defecto. Lo que SÍ puede ponerse rojo hoy es
  // la propiedad de arriba (un solo dueño del rótulo) y el comportamiento de
  // abajo por los dos caminos que fallaron.
  //
  // Medido: de cuatro mutantes, éste es el único que sobrevive. Los otros tres
  // matan 5, 2 y 7.

  const lee = () => page.evaluate(() => ({
    run: LIVE.run,
    dicePausa: /Pausa/.test(document.getElementById('lPlay').textContent),
    minF: LIVE.minF,
  }));
  const coherente = m => m.run === m.dicePausa;

  await page.evaluate(() => { document.getElementById('lat_on').checked = false; latUI(); });
  check('al abrir, el botón ofrece CORRER y el reloj está parado',
        await lee().then(m => coherente(m) && m.run === false));

  await page.click('#lPlay');
  check('al pulsarlo, corre y el botón ofrece PAUSAR',
        await lee().then(m => coherente(m) && m.run === true));

  // PUERTA 1: remontar la escena. El nº de trackers es un parámetro de la
  // PLANTA, no una orden de parar el tiempo.
  await page.evaluate(() => {
    const e = document.getElementById('nTrk');
    e.value = String((+e.value || 10) + 2);
    e.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  const trasTrk = await lee();
  check('cambiar el nº de trackers NO desincroniza el botón', coherente(trasTrk),
        'run=' + trasTrk.run + ' botón dice Pausa=' + trasTrk.dicePausa);
  check('y no para el reloj: tocar un parámetro no es pedir una pausa',
        trasTrk.run === true, String(trasTrk.run));

  // PUERTA 2: encender la latencia. Es la que el propio autor abrió al añadir
  // el cronómetro, así que la vigila el banco del cronómetro.
  await page.evaluate(() => { document.getElementById('lat_on').checked = true; latUI(); });
  await page.waitForTimeout(400);
  const trasLat = await lee();
  check('encender la latencia tampoco desincroniza el botón', coherente(trasLat),
        'run=' + trasLat.run + ' botón dice Pausa=' + trasLat.dicePausa);
  check('ni para el reloj en silencio', trasLat.run === true, String(trasLat.run));

  // Y LO QUE EL USUARIO PULSA: que PAUSAR pare de verdad. Se mide el reloj
  // simulado antes y después, no el rótulo — el rótulo es justo lo que mentía.
  await page.click('#lPlay');
  const paradoA = (await lee()).minF;
  await page.waitForTimeout(900);
  const paradoB = await lee();
  check('pulsar PAUSA para el reloj de verdad', paradoB.minF === paradoA,
        paradoA + ' -> ' + paradoB.minF);
  check('y el botón vuelve a ofrecer correr', coherente(paradoB) && paradoB.run === false);

  // CONTROL POSITIVO: si el reloj no avanzara NUNCA, la comprobación de arriba
  // saldría verde sin medir nada.
  await page.click('#lPlay');
  const corriendoA = (await lee()).minF;
  await page.waitForTimeout(900);
  check('control · con el reloj suelto, el tiempo SÍ avanza',
        (await lee()).minF > corriendoA, corriendoA);
  await page.click('#lPlay');

  // ══════════════════════════════════════════════════════════════════
  //  4ter) LA CADENA A EN_CERO: EL RÉGIMEN QUE ESTE BANCO NO CONDUCÍA
  // ══════════════════════════════════════════════════════════════════
  // REPORTADO: «¿Y 9 minutazos???». Con los cuatro parámetros a EN_CERO, el
  // cronómetro decía que la orden tardaba +9 min 37 s en llegar a la TCU en A1
  // y B1 —y «en posición —»—, mientras A2 y B2, en el mismo tirón, daban
  // +1,0 s. Nueve minutos de retardo en una cadena que no retarda nada.
  //
  // EL MECANISMO: `tLle` se marca cuando la orden en la TCU CAMBIA respecto de
  // la que había en seguimiento. La referencia se tomaba en el mismo paso en
  // que la máquina decide, y con la cadena a cero ese paso YA TRAE la orden de
  // abanderamiento: la referencia nacía igual a lo que se esperaba ver cambiar,
  // así que el instante no se marcaba nunca. A2 y B2 se salvaban por un motivo
  // que no era mérito suyo — en abanderamiento PARCIAL la consigna persigue al
  // sol y se mueve sola al paso siguiente.
  //
  // EL HUECO DEL BANCO, que es lo que se cierra aquí y no el defecto: la
  // sección 4 conduce el cronómetro SIEMPRE con la cadena puesta (300/60/60/30)
  // y lee UNA estrategia, la primera. Las dos mitades del defecto caían justo
  // fuera de lo que se conducía: el régimen a cero, y la diferencia ENTRE
  // estrategias. Un banco que solo visita un régimen no dice nada del otro.
  //
  // Se conduce la página de verdad porque el defecto vivía en el acoplamiento
  // entre el bucle en vivo y el cronómetro —quién mueve a quién antes de quién—
  // y eso no aparece llamando a `cronoTick` con números a mano.
  const episodio = async (L) => {
    await page.evaluate((L) => {
      // EL VIENTO BAJA PRIMERO, y el orden importa: `latUI` remonta la escena y
      // da un paso de simulación con el viento QUE HAYA en el deslizador. Si
      // queda el del episodio anterior, la escena nace ya abanderada — medido:
      // A1..B2 aparecían en FULL_STOW antes de empezar a cronometrar nada.
      document.getElementById('lSpeed').value = '900';
      const v = document.getElementById('lV');
      v.value = '20'; v.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('lat_on').checked = true;
      document.getElementById('latVent').value = String(L[0]);
      document.getElementById('latMues').value = String(L[1]);
      document.getElementById('latSond').value = String(L[2]);
      document.getElementById('latArr').value = String(L[3]);
      latUI();
      if (!LIVE.run) document.getElementById('lPlay').click();
    }, L);
    // SE CRONOMETRA DESDE SEGUIMIENTO, y hay que esperarlo, no suponerlo: las
    // de dos umbrales no vuelven de un abanderamiento en cuanto amaina —
    // sostienen el pliegue (DESTOW_HOLD). Si el viento se sube antes de que
    // bajen, no hay maniobra que medir y las filas salen en «—», que es cierto
    // pero no es lo que se quiere probar aquí. Medido: sin esta espera, A2 y B2
    // llegaban a la sección todavía plegadas de la sección 4.
    const desdeSeguimiento = await page.waitForFunction(
      () => vivos().filter(S => S !== 'PASIVO').every(S => LIVE.modos[S] === 'IDLE'),
      null, { timeout: 25000 }).then(() => true).catch(() => false);
    await page.evaluate(() => {
      const v = document.getElementById('lV');
      v.value = '95'; v.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Se espera con red: si un mutante deja una estrategia sin marcar nunca, la
    // fase no llega a `hecha` y un `waitForFunction` pelado reventaría el banco
    // entero — un arnés que muere no dice CUÁNTO se rompió. Se recoge lo que
    // haya y que fallen las comprobaciones, que es lo que se está midiendo.
    const cerro = await page.waitForFunction(
      () => window.LIVE && LIVE.crono && LIVE.crono.fase === 'hecha',
      null, { timeout: 25000 }).then(() => true).catch(() => false);
    const R = await page.evaluate(() => {
      const C = LIVE.crono, D = C.ultima || { t0: C.t0, tVe: C.tVe, por: C.por };
      const o = { det: (D.tVe != null && D.t0 != null) ? D.tVe - D.t0 : null, por: {} };
      Object.keys(D.por || {}).forEach(S => {
        const p = D.por[S] || {};
        o.por[S] = { lle: p.tLle == null ? null : p.tLle - D.t0,
                     fin: p.tFin == null ? null : p.tFin - D.t0 };
      });
      return o;
    });
    await page.evaluate(() => { if (LIVE.run) document.getElementById('lPlay').click(); });
    R.cerro = cerro; R.desdeSeguimiento = desdeSeguimiento;
    return R;
  };
  const resumen = R => Object.keys(R.por).sort().map(
    S => S + ' ' + R.por[S].lle + '/' + R.por[S].fin).join(' · ');

  const EN_CERO = await episodio([0, 0, 0, 0]);
  const nombres = Object.keys(EN_CERO.por).sort();
  // SIN ESTO, TODO LO DE ABAJO ES VACUO: `every` sobre una lista vacía es
  // verde, y `every` sobre una sola estrategia no puede ver una diferencia
  // ENTRE estrategias — que es justo lo que se escapó.
  check('se conducen las CUATRO estrategias, no una', nombres.length === 4,
        nombres.join(','));
  check('y las cuatro arrancan desde SEGUIMIENTO, no ya plegadas',
        EN_CERO.desdeSeguimiento);
  check('a cero, el episodio se cierra solo: todas llegan a posición', EN_CERO.cerro,
        resumen(EN_CERO));
  check('a cero, el anemómetro ve el viento en el mismo paso', EN_CERO.det === 0,
        EN_CERO.det);
  check('a cero, la orden llega a la TCU en el mismo paso EN TODAS',
        nombres.length === 4 && nombres.every(S => EN_CERO.por[S].lle === 0),
        resumen(EN_CERO));
  check('y ninguna se queda sin «en posición»',
        nombres.length === 4 && nombres.every(S => EN_CERO.por[S].fin > 0),
        resumen(EN_CERO));
  // LA COMPROBACIÓN QUE HABRÍA CAZADO EL DEFECTO TAL COMO SE VIO: no que el
  // número sea 0, sino que las cuatro digan LO MISMO. Con el defecto, A1 y B1
  // decían 577 s y A2 y B2 decían 1 s — y esa discrepancia es visible aunque
  // uno no sepa cuál de los dos números es el bueno.
  const lles = nombres.map(S => EN_CERO.por[S].lle);
  // `every` sobre nulos y `Set` de un solo nulo son verdes: el mutante que
  // reintroduce el defecto deja las CUATRO sin marcar, y «todas iguales» lo
  // aprobaba. Lo dijo la batería, no la lectura. Por eso se exige además que
  // sean números: no hay acuerdo entre cuatro silencios.
  check('a cero, las cuatro marcan el MISMO instante de llegada',
        lles.every(v => typeof v === 'number') && new Set(lles).size === 1,
        lles.join(' · '));

  // CONTROL POSITIVO. Sin él, «llega en el mismo paso» lo aprueba también un
  // cronómetro que escriba `tLle = tOrd` sin mirar nada: hay que enseñar que
  // con la cadena puesta el mismo camino da un número DISTINTO de cero.
  const CONLAT = await episodio([300, 60, 60, 30]);
  const nomL = Object.keys(CONLAT.por).sort();
  check('control · con la cadena puesta, ver el viento ya cuesta', CONLAT.det > 0,
        CONLAT.det);
  check('control · y la orden tarda en llegar a la TCU EN LAS CUATRO',
        nomL.length === 4 && nomL.every(S => CONLAT.por[S].lle - CONLAT.det >= 30),
        'det ' + CONLAT.det + ' · ' + resumen(CONLAT));
  // NUNCA ANTES: el eje no puede estar en posición antes de que la orden entre.
  // Es la desigualdad que siempre tiene que valer, y por eso va con `>=`.
  // Y CON LOS DOS NÚMEROS EXIGIDOS: `180 >= null` es CIERTO en JavaScript, así
  // que sin esto un mutante que dejaba la llegada sin marcar pasaba por aquí
  // tan tranquilo. Es la segunda vez en esta misma sección que un nulo se cuela
  // por una comparación; la primera fue un `Set` de cuatro nulos.
  check('control · ninguna llega a posición ANTES de que la orden entre',
        nomL.length === 4 && nomL.every(S =>
          typeof CONLAT.por[S].fin === 'number' && typeof CONLAT.por[S].lle === 'number' &&
          CONLAT.por[S].fin >= CONLAT.por[S].lle),
        resumen(CONLAT));
  // Y LA QUE NO ES VACUA: alguna tiene que TARDAR en recorrer, o el cronómetro
  // estaría midiendo una maniobra instantánea y no se notaría.
  check('control · y al menos una tarda de verdad en recorrer',
        nomL.some(S => CONLAT.por[S].fin - CONLAT.por[S].lle > 60),
        resumen(CONLAT));
  // HALLAZGO, y fue este banco el que lo dijo al exigir de más: A2 y B2 marcan
  // «en posición» EN EL MISMO INSTANTE en que la orden entra — 270/270 frente a
  // 270/450 de A1 y B1. No es un cero sospechoso: es que la media móvil cruza
  // T1 bastante antes que T2, así que las de DOS umbrales ya habían plegado con
  // el abanderamiento parcial y no les quedaba recorrido cuando llegó el pleno.
  // Dicho de otro modo, y es el argumento operativo del segundo umbral: el
  // recorrido caro se hace ANTES, con tiempo, y no contra el reloj de la racha.
  // La comprobación de arriba pedía `fin > lle` en las cuatro y salía roja con
  // la ficha correcta; queda como aviso de que una desigualdad estricta de más
  // es una afirmación sobre el mundo, no una formalidad.


  // ══════════════════════════════════════════════════════════════════
  //  4quater) UN PERIODO MÁS CORTO QUE EL PASO NO SE PUEDE MEDIR
  // ══════════════════════════════════════════════════════════════════
  // DATO DE CAMPO: el anemómetro registra cada segundo y el poleo NCU→TCU ronda
  // los 12–15 s. Con esos números la ficha se metía en un silencio caro: el
  // lazo en vivo avanza el reloj a saltos, y MEDIDO en este navegador el paso
  // simulado es 0,1 s a ×1 · 6 s a ×60 · 30 s a ×300 · 90 s a ×900 · 360 s a
  // ×3600. Una rejilla de 1 s con un paso de 30 s publica en TODOS los pasos:
  // es la identidad. El usuario teclea 1 s, la ficha no mide 1 s y nadie se
  // entera — el cronómetro da de menos y parece que la cadena no cuesta nada.
  //
  // (El paso depende de la máquina: el lazo va a la cadencia del navegador, no
  // a la velocidad elegida. Por eso la ficha compara contra el paso MEDIDO del
  // último fotograma y no contra uno calculado del factor, y por eso este banco
  // tampoco fija los números de la tabla de arriba: fija la PROPIEDAD.)
  const vientoFuente = fuenteViento;
  check('los valores de partida son los del equipo: 1 s de muestreo',
        /id="latMues"[^>]*value="1"/.test(vientoFuente));
  check('… y 15 s de poleo NCU→TCU, el extremo largo del 12–15',
        /id="latSond"[^>]*value="15"/.test(vientoFuente));
  // LA VENTANA DE LA RÁFAGA, que es el cuarto dato de campo: la NCU decide sobre
  // el viento a TRES SEGUNDOS, no sobre la media de diez minutos del estándar
  // meteorológico. Cambia quién manda en la cadena: con 3 s la medida casi no
  // filtra, y los 20 s de poleo más arranque son casi toda la espera.
  check('… y 3 s de media: la NCU decide sobre la RÁFAGA, no sobre diez minutos',
        /id="latVent"[^>]*value="3"/.test(vientoFuente));

  // LA AFIRMACIÓN QUE HACE EL AVISO, comprobada aparte y sin navegar: con un
  // paso mayor o igual que el periodo, la rejilla ES la identidad. Si esto no
  // valiera, el aviso estaría mintiendo aunque saliera cuando toca.
  const identidad = await page.evaluate(() => {
    const c = LOC.cadenaViva({ ventana_s: 0, muestreo_s: 1, sondeo_s: 0, arranque_s: 0 });
    const ent = [3, 11, 4, 19, 7], sal = ent.map(v => c.ve(v, 30));
    return { ent, sal };
  });
  check('con el paso por encima del periodo, la rejilla es la IDENTIDAD',
        identidad.sal.join(',') === identidad.ent.join(','),
        identidad.ent + ' -> ' + identidad.sal);

  const aPaso = async (vel) => page.evaluate(async (vel) => {
    document.getElementById('lat_on').checked = true;
    document.getElementById('latVent').value = '600';
    document.getElementById('latMues').value = '1';
    document.getElementById('latSond').value = '15';
    document.getElementById('latArr').value = '5';
    latUI();
    document.getElementById('lSpeed').value = vel;
    if (!LIVE.run) document.getElementById('lPlay').click();
    // SE ESPERA A LA CONDICIÓN, no un rato fijo: `pintaCrono` repinta uno de
    // cada seis fotogramas, así que 900 ms era una apuesta — y la perdí. Una
    // batería de mutantes dio 9 muertos donde había 5, y las cuatro de más eran
    // esta espera, no el mutante. Un banco que a veces falla solo no sirve para
    // medir nada: el primer rojo que sale ya no se sabe de quién es.
    const listo = async (cond, ms) => { const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (cond()) return true;
        await new Promise(r => setTimeout(r, 50)); } return cond(); };
    await listo(() => LIVE.dtPaso > 0, 3000);
    // y a que la caja haya repintado con ESTE paso ya medido
    await listo(() => {
      const hay = periodosFinos().length > 0;
      return hay === /no se resuelve/.test(document.getElementById('cronoBox').textContent);
    }, 3000);
    const t = document.getElementById('cronoBox').textContent;
    const o = { paso: LIVE.dtPaso, finos: periodosFinos(), dice: /no se resuelve/.test(t), txt: t };
    if (LIVE.run) document.getElementById('lPlay').click();
    return o;
  }, vel);

  const rapido = await aPaso('3600');
  check('a ×3600 el paso se come el muestreo de 1 s', rapido.paso > 1, rapido.paso);
  check('y la ficha lo DICE en vez de tragárselo',
        rapido.dice && rapido.finos.some(f => /muestreo/.test(f)),
        JSON.stringify(rapido.finos));
  // SE LEE EL TEXTO RENDERIZADO, no `periodosFinos()`: lo que le importa al que
  // mira la ficha es lo que la caja DICE. Preguntarle al estado interno dejaba
  // pasar un mutante que calculaba bien la lista y no la pintaba.
  check('y lo dice del sondeo de 15 s también, que a esa velocidad tampoco cabe',
        rapido.dice && /sondeo/.test(rapido.txt.split('no se resuelve')[1] || ''),
        JSON.stringify(rapido.finos));

  // CONTROL POSITIVO: un aviso que saliera SIEMPRE no avisaría de nada.
  const lento = await aPaso('1');
  check('control · a ×1 el paso baja por debajo del periodo', lento.paso < 1, lento.paso);
  check('control · y entonces NO avisa de nada',
        !lento.dice && lento.finos.length === 0, JSON.stringify(lento.finos));


  // ══════════════════════════════════════════════════════════════════
  //  4quinquies) LA MANIOBRA QUE SE QUEDA A MEDIAS
  // ══════════════════════════════════════════════════════════════════
  // El caso que el propio cronómetro declaraba y nadie conducía: el viento baja
  // del umbral ANTES de que el eje llegue. No es un fallo del reloj, es el caso
  // — y es justo el que una media larga produce.
  //
  // Y al conducirlo apareció un defecto de los de promesa incumplida: el pie
  // decía «lo que se ve es hasta dónde llegó» y la tabla no enseñaba NINGÚN
  // número — la fila ponía «—» y su columna iba vacía. Ahora dice los grados
  // hechos sobre los que había por delante, los dos MEDIDOS sobre la escena.
  const corte = await page.evaluate(async () => {
    const esperar = async (cond, ms) => { const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (cond()) return true;
        await new Promise(r => setTimeout(r, 40)); } return cond(); };
    const v = document.getElementById('lV');
    const pon = x => { v.value = String(x); v.dispatchEvent(new Event('input', { bubbles: true })); };
    pon(20);
    document.getElementById('lat_on').checked = true;
    document.getElementById('latVent').value = '300';
    document.getElementById('latMues').value = '60';
    document.getElementById('latSond').value = '60';
    document.getElementById('latArr').value = '30';
    latUI();
    // ×60 Y NO ×900: a ×900 un fotograma son ~90 s de simulación, o sea 15° de
    // eje a 0,17 °/s, y el recorrido entero de esta escena eran 14,4° — la
    // maniobra terminaba en UN paso y no había nada que cortar. Medido: las
    // cinco comprobaciones del corte en rojo con la ficha correcta y `lle/fin`
    // valiendo 270/360, o sea una maniobra completa. Para cronometrar un corte
    // hace falta que el paso sea mucho menor que el recorrido.
    document.getElementById('lSpeed').value = '60';
    if (!LIVE.run) document.getElementById('lPlay').click();
    // NO BASTA CON QUE LAS MÁQUINAS ESTÉN EN SEGUIMIENTO: el cronómetro arranca
    // con un FLANCO, y para que haya flanco tiene que haber visto antes un paso
    // POR DEBAJO del umbral. Al esperar sólo los modos, la condición ya se
    // cumplía —venían en IDLE de la sección anterior— y el viento subía en el
    // mismo fotograma: `prevV` nacía valiendo 95 y el episodio no empezaba
    // nunca. Medido: las siete comprobaciones de abajo en rojo con la ficha
    // correcta, y el diagnóstico decía `fase: 'espera'` con todo en su sitio.
    const desdeSeg = await esperar(() =>
      vivos().filter(S => S !== 'PASIVO').every(S => LIVE.modos[S] === 'IDLE') &&
      LIVE.crono.prevV != null && LIVE.crono.prevV <= (+document.getElementById('t1').value) / 3.6,
      25000);
    pon(95);
    // SE ESPERA A QUE EL EJE HAYA RECORRIDO ALGO antes de cortar. Cortar en el
    // mismo paso en que entra la orden da «0° de 39°»: cierto, pero no contiene
    // el mecanismo — un fixture que no lo contiene no valida nada.
    const anduvo = await esperar(() => {
      const C = LIVE.crono; if (!C || !C.por) return false;
      return Object.keys(C.por).some(S => C.por[S].thLle != null &&
        Math.abs((C.por[S].thUlt || 0) - C.por[S].thLle) > 3);
    }, 40000);
    pon(5);
    const cerro = await esperar(() => LIVE.crono.ultima && LIVE.crono.ultima.cortada, 25000);
    // Y A QUE LA CAJA LO HAYA PINTADO: `pintaCrono` repinta uno de cada seis
    // fotogramas, así que leer el texto en el instante del corte devolvía la
    // tabla ANTERIOR, con la maniobra todavía en vuelo. Es la segunda vez en
    // este fichero que ese repintado muerde; la primera fue en la sección del
    // aviso de resolución. Se espera al TEXTO, que es lo que se va a afirmar.
    const pintado = await esperar(
      () => /baj\u00f3 del umbral/.test(document.getElementById('cronoBox').textContent), 8000);
    const D = LIVE.crono.ultima || {};
    const por = {};
    Object.keys(D.por || {}).forEach(S => { const q = D.por[S];
      por[S] = { lle: q.tLle == null ? null : q.tLle - D.t0,
                 fin: q.tFin == null ? null : q.tFin - D.t0,
                 hecho: (q.thLle != null && q.thUlt != null) ? Math.abs(q.thUlt - q.thLle) : null,
                 total: (q.thLle != null && q.ejeUlt != null) ? Math.abs(q.ejeUlt - q.thLle) : null };
    });
    if (LIVE.run) document.getElementById('lPlay').click();
    return { desdeSeg, anduvo, cerro, pintado, cortada: !!D.cortada, por,
             _dbg: { minF: LIVE.minF, run: LIVE.run, v: LIVE.v, vVisto: LIVE.vVisto,
                     modos: JSON.parse(JSON.stringify(LIVE.modos)), fase: LIVE.crono.fase,
                     vel: document.getElementById('lSpeed').value },
             txt: document.getElementById('cronoBox').textContent.replace(/\s+/g, ' ') };
  });
  const nomC = Object.keys(corte.por).sort();

  console.log('     ── corte MEDIDO · ' + nomC.map(S =>
    S + ' ' + fmtN(corte.por[S].hecho) + '° de ' + fmtN(corte.por[S].total)).join(' · '));
  check('el fixture arranca desde seguimiento, el eje se mueve y la caja repinta',
        corte.desdeSeg && corte.anduvo && corte.pintado,
        JSON.stringify({ desdeSeg: corte.desdeSeg, anduvo: corte.anduvo, pintado: corte.pintado }));
  check('el episodio se cierra como CORTADO, no como hecho',
        corte.cerro && corte.cortada, JSON.stringify({ cerro: corte.cerro, cortada: corte.cortada }));
  check('la orden SÍ había llegado a la TCU antes del corte',
        nomC.length === 4 && nomC.every(S => typeof corte.por[S].lle === 'number'),
        JSON.stringify(nomC.map(S => corte.por[S].lle)));
  check('y ninguna marca «en posición»: el eje no llegó',
        nomC.length === 4 && nomC.every(S => corte.por[S].fin === null),
        JSON.stringify(nomC.map(S => corte.por[S].fin)));
  // LO QUE HIZO EL EJE, que es la promesa que el pie hacía y la tabla no
  // cumplía. Estrictamente entre 0 y el total: si fuera 0 no habría recorrido
  // nada y si fuera el total habría llegado — y entonces no estaría cortada.
  check('se sabe CUÁNTO recorrió: ni cero ni el total',
        nomC.length === 4 && nomC.every(S => corte.por[S].hecho > 0 &&
          corte.por[S].hecho < corte.por[S].total),
        JSON.stringify(nomC.map(S => fmtN(corte.por[S].hecho) + '/' + fmtN(corte.por[S].total))));
  check('y la tabla lo DICE, no deja el guión solo',
        /se quedó en \d+° de \d+°/.test(corte.txt),
        corte.txt.slice(0, 160));
  // Y LOS NÚMEROS DE LA TABLA SON LOS MEDIDOS, no dos dígitos cualesquiera.
  // Sin esto, un cronómetro que pintara siempre «0° de 25°» pasaba: la forma
  // de la frase es lo fácil de acertar, el valor es lo que cuesta.
  const pares = [...corte.txt.matchAll(/se quedó en (\d+)° de (\d+)°/g)]
    .map(m => [+m[1], +m[2]]);
  const esperados = nomC.map(S => [Math.round(corte.por[S].hecho), Math.round(corte.por[S].total)]);
  check('y los grados que pinta son los que midió la escena',
        pares.length === 4 &&
        esperados.every(e => pares.some(v => v[0] === e[0] && v[1] === e[1])),
        JSON.stringify({ tabla: pares, medido: esperados }));
  check('el pie explica que fue el viento al bajar, no el reloj',
        /bajó del umbral/.test(corte.txt) && /No es un fallo del reloj/.test(corte.txt));
  // CONTROL POSITIVO: en la maniobra ENTERA esa columna dice otra cosa. Sin
  // esto, un «se quedó en» pegado siempre pasaría por bueno.
  check('control · en una maniobra entera la columna dice el RECORRIDO, no un «se quedó»',
        /recorrido .* a 0,17/.test(CR.txt) && !/se quedó en/.test(CR.txt),
        CR.txt.slice(0, 140));

  // ══════════════════════════════════════════════════════════════════
  //  5) LAS DECLARACIONES
  // ══════════════════════════════════════════════════════════════════
  // El motor canónico no tiene cadena: ignoraría los cuatro parámetros y
  // devolvería el resultado de siempre CON EL SELLO DE CANÓNICO. Es el silencio
  // más caro de los dos posibles, y por eso se para antes de pedir nada.
  const rechazo = await page.evaluate(async () => {
    document.getElementById('lat_on').checked = true; latUI();
    document.getElementById('calc').value = 'engine';
    window.ENGINE = 'http://motor-de-mentira.invalid';
    let pedido = false;
    const f = window.fetch;
    window.fetch = function (u) { if (String(u).indexOf('windstow') >= 0) pedido = true; return f.apply(this, arguments); };
    await run();
    window.fetch = f;
    return { pedido: pedido, txt: document.getElementById('out').textContent };
  });
  check('con latencia puesta, el motor canónico se RECHAZA', !rechazo.pedido);
  check('y se dice por qué, nombrando lo que ese motor no tiene',
        /no la simula el motor/i.test(rechazo.txt) && /sondeo/i.test(rechazo.txt),
        rechazo.txt.slice(0, 130));

  // EL PASO DE LA SERIE FORMA PARTE DEL BANNER, así que se le pasa: sin `meteo`
  // el banner no puede saber contra qué comparar y cae a la rama de siempre.
  // Antes se le pasaba sin él y la comprobación de abajo aprobaba un camino que
  // en la ficha no ocurre nunca.
  const banners = await page.evaluate(() => {
    const hacer = (lat, dtH) => { REP = { config: { latencia: lat }, meteo: { dt_h: dtH } };
      return bannerLatencia(); };
    return {
      cero: hacer({ ventana_s: 0, muestreo_s: 0, sondeo_s: 0, arranque_s: 0 }, 1 / 60),
      viva: hacer({ ventana_s: 1800, muestreo_s: 300, sondeo_s: 300, arranque_s: 120 }, 1 / 60),
      // LOS NÚMEROS DEL EQUIPO sobre la serie minutal: los cuatro por debajo del paso.
      real: hacer({ ventana_s: 3, muestreo_s: 1, sondeo_s: 15, arranque_s: 5 }, 1 / 60),
      // Y a medias: la media de 10 min sí se resuelve, el resto no.
      medias: hacer({ ventana_s: 600, muestreo_s: 1, sondeo_s: 15, arranque_s: 5 }, 1 / 60),
    };
  });
  check('el año declara la cadena TAMBIÉN cuando está apagada',
        /apagada/i.test(banners.cero) && /comparables/i.test(banners.cero),
        banners.cero.slice(0, 90));
  check('y con ella puesta avisa de que los números no son comparables',
        /no.{0,4}son.{0,4}comparables/i.test(banners.viva.replace(/<[^>]*>/g, '')),
        banners.viva.replace(/<[^>]*>/g, '').slice(0, 140));
  check('el aviso repite los cuatro números, no dice «con latencia» y ya',
        /1800/.test(banners.viva) && /300/.test(banners.viva) && /120/.test(banners.viva));
  check('y recuerda que las horas sobre umbral siguen siendo del viento que sopla',
        /sopla/i.test(banners.viva));

  // ══════════════════════════════════════════════════════════════════
  //  5bis) LA CADENA QUE NO CABE EN EL PASO DE LA SERIE
  // ══════════════════════════════════════════════════════════════════
  // DATO DE CAMPO, el último de los cuatro: la NCU decide sobre el viento a
  // TRES SEGUNDOS — la ráfaga, no la media de diez minutos. Con 3 / 1 / 15 / 5
  // y la serie anual a pasos de 1 min, LOS CUATRO caen por debajo del paso y las
  // primitivas devuelven EL MISMO OBJETO: la cadena es la identidad exacta.
  //
  // Y el año seguía declarando «estos números NO son comparables». Eso no es un
  // aviso de más: es una afirmación FALSA en el informe, y en la dirección
  // cara — quien lo lea creerá que está viendo el efecto de la cadena cuando no
  // hay ninguno. Una afirmación falsa de éxito es peor que un silencio.
  const dtMin = 60;
  const mudez = await page.evaluate((dtS) => {
    const real = { ventana_s: 3, muestreo_s: 1, sondeo_s: 15, arranque_s: 5 };
    const gorda = { ventana_s: 1800, muestreo_s: 300, sondeo_s: 300, arranque_s: 120 };
    const a = new Float64Array(64); for (let i = 0; i < 64; i++) a[i] = (i < 20 ? 4 : 28) + (i % 5);
    return {
      real: LOC.mudos(real, dtS), gorda: LOC.mudos(gorda, dtS),
      // LA AFIRMACIÓN, medida aparte: con esos cuatro la serie sale INTACTA.
      mismaMedida: LOC.vientoVisto(a, dtS, real) === a,
      mismaOrden: LOC.ordenEnElEje(a, dtS, real) === a,
      // Y con la cadena gorda NO sale intacta, o lo de arriba no diría nada.
      gordaCambia: LOC.vientoVisto(a, dtS, gorda) !== a,
      // A un paso fino, los mismos cuatro números SÍ hacen algo.
      finoHabla: LOC.mudos(real, 1).length,
    };
  }, dtMin);
  check('a paso de 1 min, los cuatro números del equipo son MUDOS',
        mudez.real.length === 4, JSON.stringify(mudez.real));
  check('y la serie sale intacta: el mismo objeto, no una copia parecida',
        mudez.mismaMedida && mudez.mismaOrden);
  check('control · una cadena gruesa SÍ mueve la serie', mudez.gordaCambia);
  check('control · y a paso de 1 s esos mismos cuatro ya no son todos mudos',
        mudez.finoHabla < 4, mudez.finoHabla);
  check('control · de la cadena gruesa no es mudo NINGUNO a 1 min',
        mudez.gorda.length === 0, JSON.stringify(mudez.gorda));

  const limpio = t => t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
  check('el año DICE que esa cadena no cambia nada',
        /no cambia NADA/.test(limpio(banners.real)), limpio(banners.real).slice(0, 120));
  check('y se desdice de lo contrario: dice que SÍ es comparable',
        /SÍ es comparable/.test(limpio(banners.real)) &&
        !/no.{0,4}son.{0,4}comparables/i.test(limpio(banners.real)),
        limpio(banners.real).slice(0, 200));
  check('y manda a mirarlo donde sí ocurre: el cronómetro, a ×1',
        /cronómetro/.test(limpio(banners.real)) && /×1/.test(limpio(banners.real)));
  check('con la cadena a medias, nombra SOLO lo que no llega al paso',
        /pero no entera/.test(limpio(banners.medias)) &&
        /muestreo/.test(limpio(banners.medias)) &&
        !/la media del an/.test(limpio(banners.medias).split('No llega a ese paso')[1] || ''),
        limpio(banners.medias).slice(0, 220));
  check('y con la cadena a medias sigue diciendo que NO son comparables',
        /no.{0,4}son.{0,4}comparables/i.test(limpio(banners.medias)));

  // ══════════════════════════════════════════════════════════════════
  //  5ter) LA COTA: NO PODER VERLO NO ES LO MISMO QUE NO SABER CUÁNTO ES
  // ══════════════════════════════════════════════════════════════════
  // Decir «no cambia nada» es cierto sobre el CÁLCULO y falso sobre el MUNDO.
  // Dejarlo ahí cambiaba una afirmación falsa por un silencio, y el silencio
  // también se paga: quien lee no sabe si lo que no se ve es despreciable o es
  // el resultado. Así que se acota.
  //
  // LA COTA SÓLO ES VÁLIDA DONDE SE ENSEÑA, y eso hay que dejarlo escrito: cubre
  // el RETRASO de la maniobra, no el cambio de decisión. Una media larga no
  // retrasa, CAMBIA —puede borrar un episodio entero, y eso no lo acota este
  // techo—. Se pinta únicamente en la rama en que los cuatro son mudos, donde la
  // media, por debajo del paso, no puede esconder nada.
  const COTA = await page.evaluate(() => {
    const L = { ventana_s: 3, muestreo_s: 1, sondeo_s: 15, arranque_s: 5 };
    return {
      normal: LOC.cotaCadena(L, 31, 4380, 0.17),
      sinEpisodios: LOC.cotaCadena(L, 0, 4380, 0.17),
      sinSol: LOC.cotaCadena(L, 31, 0, 0.17),
      // el peor caso es la SUMA de los cuatro, no el mayor de ellos
      suma: LOC.cotaCadena({ ventana_s: 10, muestreo_s: 20, sondeo_s: 30, arranque_s: 40 },
                           1, 1, 0.17).peor_s,
    };
  });
  check('la cota suma los CUATRO, no se queda con el mayor', COTA.suma === 100, COTA.suma);
  check('y son dos maniobras por episodio, no una', COTA.normal.maniobras === 62, COTA.normal.maniobras);
  check('los segundos son maniobras × peor caso', COTA.normal.segundos === 62 * 24, COTA.normal.segundos);
  check('y los grados, peor caso × velocidad del hierro',
        cerca(COTA.normal.grados, 24 * 0.17, 1e-9), COTA.normal.grados);
  check('la fracción del año sale contra las horas de SOL, no contra las 8760',
        cerca(COTA.normal.frac_sol, (62 * 24) / (4380 * 3600), 1e-12), COTA.normal.frac_sol);
  // DEGENERADOS: un año sin episodios y un sitio sin sol no pueden dar NaN ni
  // infinito en un informe. Un `0/0` impreso es peor que no imprimir nada.
  check('sin episodios, la cota es cero y no un NaN',
        COTA.sinEpisodios.segundos === 0 && COTA.sinEpisodios.frac_sol === 0,
        JSON.stringify(COTA.sinEpisodios));
  // EL DETALLE NO PUEDE MENTIR SOBRE LO QUE MIDIÓ: `JSON.stringify(Infinity)`
  // devuelve `null`, así que el mutante que quitaba la guarda salía rojo
  // enseñando `"frac_sol":null` — exactamente el valor que la comprobación
  // exige. Un rojo que se explica con la prueba de que estaba verde es peor que
  // un rojo sin detalle. Se imprime con `String`, que sí dice "Infinity".
  check('sin horas de sol, la fracción es null y no un infinito',
        COTA.sinSol.frac_sol === null, String(COTA.sinSol.frac_sol));

  const conCota = await page.evaluate(() => {
    const L = { ventana_s: 3, muestreo_s: 1, sondeo_s: 15, arranque_s: 5 };
    const hacer = cases => { REP = { config: { latencia: L, slew_deg_s: 0.17 },
      meteo: { dt_h: 1 / 60, daylight_hours: 4380 }, cases: cases };
      return bannerLatencia().replace(/<[^>]*>/g, '').replace(/\s+/g, ' '); };
    return {
      muchos: hacer({ A1: { n_events: 12 }, A2: { n_events: 31 }, B1: { n_events: 9 } }),
      // el mismo informe con el caso gordo QUITADO: la cota tiene que bajar
      pocos: hacer({ A1: { n_events: 12 }, B1: { n_events: 9 } }),
      // y sin `cases` no se inventa una cota
      sinCasos: (() => { REP = { config: { latencia: L }, meteo: { dt_h: 1 / 60 } };
        return bannerLatencia().replace(/<[^>]*>/g, '').replace(/\s+/g, ' '); })(),
    };
  });
  check('el año pone la cota con un número, no con un adjetivo',
        /como mucho el 0[.,]009 %/.test(conCota.muchos), conCota.muchos.slice(-200));
  check('y la saca del caso con MÁS episodios, no del primero que pilla',
        /62 maniobras/.test(conCota.muchos) && /24 maniobras/.test(conCota.pocos),
        conCota.pocos.slice(-140));
  check('dice que es un TECHO y no una estimación',
        /TECHO/.test(conCota.muchos) && /efecto real es menor/.test(conCota.muchos));
  check('sin informe del que sacarla, no se inventa una cota',
        !/como mucho el/.test(conCota.sinCasos) && /no cambia NADA/.test(conCota.sinCasos),
        conCota.sinCasos.slice(-120));
  check('y la cota NO aparece donde no vale: con la cadena a medias, no se pinta',
        !/como mucho el/.test(limpio(banners.medias)));

  check('ninguna excepción en la página durante todo el banco',
        errores.length === 0, errores.join(' · '));

  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FAIL');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });

function fmtN(x) { return (Math.round(x * 10) / 10).toString(); }
