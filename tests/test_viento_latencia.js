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

  const banners = await page.evaluate(() => {
    const hacer = lat => { REP = { config: { latencia: lat } }; return bannerLatencia(); };
    return { cero: hacer({ ventana_s: 0, muestreo_s: 0, sondeo_s: 0, arranque_s: 0 }),
             viva: hacer({ ventana_s: 600, muestreo_s: 60, sondeo_s: 30, arranque_s: 5 }) };
  });
  check('el año declara la cadena TAMBIÉN cuando está apagada',
        /apagada/i.test(banners.cero) && /comparables/i.test(banners.cero),
        banners.cero.slice(0, 90));
  check('y con ella puesta avisa de que los números no son comparables',
        /no.{0,4}son.{0,4}comparables/i.test(banners.viva.replace(/<[^>]*>/g, '')),
        banners.viva.replace(/<[^>]*>/g, '').slice(0, 140));
  check('el aviso repite los cuatro números, no dice «con latencia» y ya',
        /600/.test(banners.viva) && /60/.test(banners.viva) &&
        /30/.test(banners.viva) && /5/.test(banners.viva));
  check('y recuerda que las horas sobre umbral siguen siendo del viento que sopla',
        /sopla/i.test(banners.viva));

  check('ninguna excepción en la página durante todo el banco',
        errores.length === 0, errores.join(' · '));

  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FAIL');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });

function fmtN(x) { return (Math.round(x * 10) / 10).toString(); }
