// CUÁNTO TARDA LA MANIOBRA, EN LAS DOS PESTAÑAS DE AMENAZA.
//
// LO QUE SE CERRÓ Y POR QUÉ IMPORTA. La máquina de granizo del §10.1 decide
// cuándo cruzar, y su reloj de Capa 2 compara el tiempo disponible contra
// `factor × (T_necesario + margen)`. Ese `T_necesario` es uno de los que el
// §9.1 deja «PENDIENTE DE MEDIR EN CAMPO», así que hasta hoy era un número
// TECLEADO que nadie careaba con nada. Si se queda corto, el guard entero queda
// flojo y la máquina cruza creyendo que le da tiempo — y el error no sale por
// ninguna parte.
//
// MEDIDO con los valores de julio y la cadena declarada (sondeo 15 s, arranque
// 5 s, carrera ±55°, ángulo de granizo 55°):
//
//     sondeo NCU→TCU .............    15 s
//     arranque del motor .........     5 s
//     recorrido 110° a 0,17 °/s ...  647 s
//     ─────────────────────────────────────
//     T_necesario, peor caso .....  11,1 min   ·   declarado: 15 min
//
// Alcanza, con 3,9 min de aire. Pero el número que lo dice ya no es una
// suposición, y si alguien baja el T_necesario tecleado o alarga el poleo, la
// ficha lo canta en vez de callarse.
//
// LO QUE ENTRA Y LO QUE NO, que es la mitad del asunto: entran el sondeo, el
// arranque y el recorrido —el camino de la ORDEN, los mismos cables para las
// tres amenazas—; NO entran la media del anemómetro ni su muestreo, que son
// cómo se entera la máquina de VIENTO. La de granizo se entera por radar, CAPE
// y célula, que son sus capas 1 y 2.
//
// Y LA PESTAÑA DE NIEVE. No hay máquina: en esta casa la nieve sólo tiene su
// sitio en la jerarquía (SP3) y el bit que la publica. Lo que la pestaña hace
// es decir qué sabe, listar con su nombre los siete que faltan —SIN VALOR, como
// el §19 con los suyos— y calcular lo único que no depende de ellos. Lo que el
// banco vigila ahí es que NO INVENTE: sin ángulo tecleado no da número, y el
// ángulo no nace con el del viento por defecto.
//
//   python3 -m http.server 8099
//   node tests/test_amenaza_maniobra.js
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');
const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };
const cerca = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.route('**://*/**', r => r.request().url().startsWith(BASE)
    ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tabGranizo', { timeout: 20000 });

  // ══════════════════════════════════════════════════════════════════
  //  1) LA CUENTA, SIN NAVEGAR
  // ══════════════════════════════════════════════════════════════════
  const P = await page.evaluate(() => {
    const lat = { sondeo_s: 15, arranque_s: 5, ventana_s: 600, muestreo_s: 60 };
    return {
      t: LOC.tNecesario(lat, 110, 0.17),
      // LA MEDIA Y EL MUESTREO NO ENTRAN, y se comprueba cambiándolos: si el
      // total se moviera, la cuenta estaría metiendo el camino de ENTERARSE
      // dentro del camino de MANDAR.
      conMediaEnorme: LOC.tNecesario(
        { sondeo_s: 15, arranque_s: 5, ventana_s: 99999, muestreo_s: 99999 }, 110, 0.17).total_s,
      peor: LOC.recorridoPeor(55, 55),
      peorNeg: LOC.recorridoPeor(-55, 55),
      peorCentro: LOC.recorridoPeor(0, 55),
      peorAsim: LOC.recorridoPeor(30, 55),
      // degenerados: un informe no puede enseñar un NaN
      cero: LOC.tNecesario({ sondeo_s: 0, arranque_s: 0 }, 0, 0.17),
      sinSlew: LOC.tNecesario({ sondeo_s: 15, arranque_s: 5 }, 110, 0).total_s,
    };
  });
  check('el total es la suma de los tres tramos',
        cerca(P.t.total_s, 15 + 5 + 110 / 0.17, 1e-9), P.t.total_s);
  check('y los minutos son los segundos entre sesenta',
        cerca(P.t.total_min, P.t.total_s / 60, 1e-12));
  check('la media del anemómetro NO entra en el camino de la orden',
        P.conMediaEnorme === P.t.total_s, P.conMediaEnorme + ' vs ' + P.t.total_s);
  check('el peor recorrido hasta un extremo es la carrera ENTERA',
        P.peor === 110 && P.peorNeg === 110, P.peor + '/' + P.peorNeg);
  check('hasta el centro es media carrera, no cero',
        P.peorCentro === 55, P.peorCentro);
  check('y a un ángulo intermedio, el lado largo',
        P.peorAsim === 85, P.peorAsim);
  check('todo a cero no da NaN', P.cero.total_s === 0 && P.cero.total_min === 0,
        JSON.stringify(P.cero));
  check('sin velocidad de eje se cae a la de proyecto, no a un infinito',
        Number.isFinite(P.sinSlew) && P.sinSlew > 0, String(P.sinSlew));

  // ══════════════════════════════════════════════════════════════════
  //  2) GRANIZO: EL CAREO CONTRA EL NÚMERO TECLEADO
  // ══════════════════════════════════════════════════════════════════
  await page.click('#tabGranizo');
  await page.waitForFunction(() => document.getElementById('gTnec') &&
    /T_necesario/.test(document.getElementById('gTnec').textContent), null, { timeout: 20000 });

  const G = await page.evaluate(() => ({
    txt: document.getElementById('gTnec').textContent.replace(/\s+/g, ' '),
    decl: gLeeParams().t_necesario_min,
    ang: +document.getElementById('gAng').value,
    car: +document.getElementById('gCarrera').value,
  }));
  check('la pestaña de granizo enseña el T_necesario calculado',
        /T_necesario, peor caso/.test(G.txt), G.txt.slice(0, 120));
  check('con los tres tramos nombrados, no un número suelto',
        /sondeo NCU/.test(G.txt) && /arranque del motor/.test(G.txt) && /recorrido/.test(G.txt));
  // EL NÚMERO PINTADO ES EL DE LA FUNCIÓN, no otro parecido.
  const esperado = await page.evaluate(([a, c]) =>
    LOC.tNecesario({ sondeo_s: +document.getElementById('latSond').value,
                     arranque_s: +document.getElementById('latArr').value },
                   LOC.recorridoPeor(a, c), LOC.SLEW).total_min, [G.ang, G.car]);
  const pintado = (G.txt.match(/T_necesario, peor caso\s*([\d.,]+)\s*min/) || [])[1];
  check('y el número pintado es el que da la función',
        pintado != null && cerca(+String(pintado).replace(',', '.'), esperado, 0.06),
        pintado + ' vs ' + esperado);
  check('dice si el número tecleado alcanza o se queda corto',
        /alcanza|se queda corto/.test(G.txt), G.txt.slice(-160));
  // MEDIDO: los de julio declaran 15 min y la maniobra pide 11,1. Alcanza — y
  // la comprobación es que lo DIGA, no que el valor sea uno u otro.
  check('con los valores de julio, alcanza', G.decl > esperado && /alcanza/.test(G.txt),
        G.decl + ' vs ' + esperado);
  check('y recuerda que «alcanza» no es «medido»: el §9.1 sigue pidiendo el ensayo',
        /no es .*medido|sigue pidiendo el ensayo/.test(G.txt));

  // LO QUE DE VERDAD TIENE QUE CAZAR: que alguien baje el tecleado por debajo
  // de la maniobra. Si esto no se pusiera rojo, la tarjeta sería un adorno.
  const corto = await page.evaluate(() => {
    const e = document.querySelector('.gp[data-k="t_necesario_min"]');
    e.value = '3'; e.dispatchEvent(new Event('input', { bubbles: true }));
    return document.getElementById('gTnec').textContent.replace(/\s+/g, ' ');
  });
  check('si el tecleado baja de la maniobra, lo CANTA',
        /se queda corto/.test(corto) && !/alcanza/.test(corto), corto.slice(-200));
  check('y explica por qué importa: el guard de la Capa 2 queda flojo',
        /Capa 2/.test(corto) && /factor/.test(corto), corto.slice(-160));

  // Y QUE REACCIONE AL POLEO, que es el otro lado del careo: alargar el sondeo
  // alarga la maniobra aunque nadie toque el número tecleado.
  const conPoleoLargo = await page.evaluate(() => {
    const e = document.querySelector('.gp[data-k="t_necesario_min"]');
    e.value = '15'; e.dispatchEvent(new Event('input', { bubbles: true }));
    const s = document.getElementById('latSond');
    s.value = '900'; s.dispatchEvent(new Event('input', { bubbles: true }));
    const t = document.getElementById('gTnec').textContent.replace(/\s+/g, ' ');
    s.value = '15'; s.dispatchEvent(new Event('input', { bubbles: true }));
    return t;
  });
  check('un poleo de 15 min vuelve corto un T_necesario que antes alcanzaba',
        /se queda corto/.test(conPoleoLargo), conPoleoLargo.slice(-180));

  // Y LA CASILLA DE LATENCIA NO MANDA AQUÍ: apaga el año de viento, no el poleo.
  const apagada = await page.evaluate(() => {
    const c = document.getElementById('lat_on');
    const antes = c.checked;
    c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true }));
    const t = document.getElementById('gTnec').textContent.replace(/\s+/g, ' ');
    c.checked = antes; c.dispatchEvent(new Event('change', { bubbles: true }));
    return t;
  });
  check('con la casilla de latencia apagada, el sondeo SIGUE contando',
        /sondeo NCU→TCU\s*15 s/.test(apagada), apagada.slice(0, 220));
  check('y se dice que esa casilla es del año de viento, no del equipo',
        /no que el equipo no tenga poleo/.test(apagada));

  // ══════════════════════════════════════════════════════════════════
  //  3) NIEVE: QUE NO INVENTE
  // ══════════════════════════════════════════════════════════════════
  await page.click('#tabNieve');
  await page.waitForTimeout(300);
  const N = await page.evaluate(() => ({
    visible: document.getElementById('panelNieve').style.display !== 'none',
    nParams: [].map.call(document.querySelectorAll('.np'), e => e.dataset.k),
    vacios: [].filter.call(document.querySelectorAll('.np'), e => e.value.trim() === '').length,
    ang: document.getElementById('nAng').value,
    tnec: document.getElementById('nTnec').textContent.replace(/\s+/g, ' '),
    faltan: document.getElementById('nFaltan').textContent.replace(/\s+/g, ' '),
    noval: document.querySelector('#panelNieve .noval').textContent.replace(/\s+/g, ' '),
  }));
  check('la pestaña de nieve existe y se abre', N.visible);
  check('y lo primero que dice es que NO hay máquina',
        /NO HAY MÁQUINA DE NIEVE/.test(N.noval), N.noval.slice(0, 120));
  check('nombra los siete huecos en vez de dejarlos sin nombre',
        N.nParams.length === 7 && N.nParams.includes('angulo_nieve_deg') &&
        N.nParams.includes('umbral_espesor_cm'), N.nParams.join(','));
  check('y nacen los siete SIN VALOR', N.vacios === 7, N.vacios);
  check('el contador lo dice con número, no con un adjetivo',
        /Siete sin valor de siete/.test(N.faltan), N.faltan);
  // LO QUE NO PUEDE HACER: nacer con el ángulo del viento puesto. Sería
  // inventar el dato que falta y enseñarlo con pinta de bueno.
  check('el ángulo de nieve nace VACÍO, no con los 55° del viento',
        N.ang === '', JSON.stringify(N.ang));
  check('y sin ángulo NO da un número: lo dice y explica por qué',
        !/T_necesario, peor caso/.test(N.tnec) && /Sin ángulo de nieve/.test(N.tnec),
        N.tnec.slice(0, 140));

  const N2 = await page.evaluate(() => {
    const a = document.getElementById('nAng');
    a.value = '30'; a.dispatchEvent(new Event('input', { bubbles: true }));
    const uno = document.querySelector('.np');
    uno.value = '5'; uno.dispatchEvent(new Event('input', { bubbles: true }));
    return { tnec: document.getElementById('nTnec').textContent.replace(/\s+/g, ' '),
             faltan: document.getElementById('nFaltan').textContent.replace(/\s+/g, ' '),
             esperado: LOC.tNecesario(
               { sondeo_s: +document.getElementById('latSond').value,
                 arranque_s: +document.getElementById('latArr').value },
               LOC.recorridoPeor(30, +document.getElementById('nCarrera').value),
               LOC.SLEW).total_min };
  });
  const pintadoN = (N2.tnec.match(/T_necesario, peor caso\s*([\d.,]+)\s*min/) || [])[1];
  check('con un ángulo tecleado SÍ da la maniobra',
        pintadoN != null && cerca(+String(pintadoN).replace(',', '.'), N2.esperado, 0.06),
        pintadoN + ' vs ' + N2.esperado);
  check('y sigue diciendo que el CUÁNDO no lo sabe',
        /no lo sabe esta ficha/.test(N2.tnec), N2.tnec.slice(-120));
  check('un parámetro relleno se marca como supuesto TUYO, no como validado',
        /supuesto tuyo/.test(N2.faltan) && !/validad/.test(N2.faltan), N2.faltan);

  check('ninguna excepción en la página durante todo el banco',
        errores.length === 0, errores.join(' · '));

  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FAIL');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
