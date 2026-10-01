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
  //  3) NIEVE: LA MÁQUINA DE VERDAD
  // ══════════════════════════════════════════════════════════════════
  // AQUÍ HABÍA OTRO GUARD Y TAMBIÉN CUMPLIÓ. Esta sección exigía que la pestaña
  // de nieve NO inventara una máquina: siete parámetros SIN VALOR y ningún
  // número sin que el usuario pusiera el ángulo. El 2026-10-01 llegó el
  // criterio de planta y la pestaña pasó a tener máquina; el guard se puso rojo
  // —error duro, `#nAng` ya no existe— que es lo que tenía que hacer.
  //
  // Lo que se vigila ahora es OTRA cosa, y por eso no se borra: que la máquina
  // sea LA DEL DOCUMENTO y no una parecida, y que lo que sigue sin saberse siga
  // dicho.
  //
  // EL CRITERIO, literal: activa por encima de 10 cm, desactiva por debajo de
  // 2 cm, defensa a 55° al lado MÁS CERCANO a donde esté la mesa al activarse.
  //
  // LA BANDA DE OCHO CENTÍMETROS ES EL MECANISMO, no un detalle: entre 2 y 10
  // el estado lo decide EL ANTERIOR. Un banco que sólo probara 0 y 12 cm daría
  // verde contra un simple umbral y no habría comprobado nada de lo que hace
  // distinta a esta máquina. Por eso el recorrido de abajo entra en la banda
  // por los DOS lados y exige respuestas DISTINTAS al mismo número.
  await page.click('#tabNieve');
  await page.waitForTimeout(300);

  const fuenteV = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'sim-viento.html'), 'utf8');
  check('los umbrales del criterio están en el fuente, no en un comentario',
        /LOC\.NIEVE_ON_CM\s*=\s*10\b/.test(fuenteV) &&
        /LOC\.NIEVE_OFF_CM\s*=\s*2\b/.test(fuenteV));

  const N = await page.evaluate(() => ({
    visible: document.getElementById('panelNieve').style.display !== 'none',
    noval: document.querySelector('#panelNieve .noval').textContent.replace(/\s+/g, ' '),
    sinSaber: document.getElementById('panelNieve').textContent.replace(/\s+/g, ' '),
  }));
  check('la pestaña de nieve existe y se abre', N.visible);
  // LA PROCEDENCIA ES PARTE DEL DATO. Estos números vienen de un documento de
  // planta que esta ficha no ha careado contra nada; decirlo no es cortesía.
  check('dice de dónde salen los números y que no se han careado',
        /documento de planta/i.test(N.noval) && /no se han medido en campo/i.test(N.noval),
        N.noval.slice(0, 130));
  check('y sigue listando lo que el criterio NO fija',
        /cadencia del sensor/i.test(N.sinSaber) && /suelo o el del m\u00f3dulo/i.test(N.sinSaber) &&
        /calibra el cero/i.test(N.sinSaber));

  // EL RECORRIDO DE LA HISTÉRESIS, que es la comprobación central.
  const paso = (cm, th) => page.evaluate(([cm, th]) => {
    const c = document.getElementById('nCm'), t = document.getElementById('nTh');
    if (th != null) { t.value = String(th); t.dispatchEvent(new Event('input', { bubbles: true })); }
    c.value = String(cm); c.dispatchEvent(new Event('input', { bubbles: true }));
    return { est: document.getElementById('nEstadoVivo').textContent.trim(),
             txt: document.getElementById('nSalida').textContent.replace(/\s+/g, ' '),
             tnec: document.getElementById('nTnec').textContent.replace(/\s+/g, ' ') };
  }, [cm, th]);

  const h0 = await paso(0, 20);
  const h5sube = await paso(5);
  const h12 = await paso(12);
  const h5baja = await paso(5);
  const h1 = await paso(1);

  check('en seco, sigue el sol', h0.est === 'SEGUIMIENTO', h0.est);
  check('a 5 cm SUBIENDO todavía no se pliega', h5sube.est === 'SEGUIMIENTO', h5sube.est);
  check('pasando de 10 cm, se pliega', h12.est === 'NIEVE', h12.est);
  // ÉSTA ES LA QUE DISTINGUE UNA HISTÉRESIS DE UN UMBRAL: el MISMO 5 cm, y la
  // respuesta contraria, porque viene de arriba.
  check('a 5 cm BAJANDO sigue plegada: la banda sostiene',
        h5baja.est === 'NIEVE', h5baja.est);
  check('y el mismo espesor da estados DISTINTOS según de dónde venga',
        h5sube.est !== h5baja.est, h5sube.est + ' vs ' + h5baja.est);
  check('por debajo de 2 cm vuelve a seguir el sol', h1.est === 'SEGUIMIENTO', h1.est);
  check('y la pantalla explica la banda en vez de dejarla como rareza',
        /Dentro de la banda/.test(h5baja.txt) && /lo decide el que hab\u00eda antes/.test(h5baja.txt),
        h5baja.txt.slice(0, 140));

  // EL LADO MÁS CERCANO, que no es el de ninguna estrategia de la ficha.
  const L = await page.evaluate(() => ({
    pos: LOC.ladoMasCercano(20, 55), neg: LOC.ladoMasCercano(-3, 55),
    cero: LOC.ladoMasCercano(0, 55), lejos: LOC.ladoMasCercano(-54, 55),
  }));
  check('desde el lado positivo se pliega al positivo', L.pos === 55, L.pos);
  check('y desde el negativo al negativo, aunque sea por 3°', L.neg === -55, L.neg);
  check('a 54° del borde negativo, sigue siendo el negativo', L.lejos === -55, L.lejos);
  check('el empate en 0° lo resuelve el convenio declarado, no un azar',
        L.cero === 55, L.cero);

  const izq = await paso(15, -40);
  check('con la mesa a la izquierda, la defensa es la izquierda',
        /-55/.test(izq.txt), izq.txt.slice(0, 120));
  // Y LO QUE ESA REGLA COMPRA, que es el motivo de que exista: el recorrido es
  // el REAL y no el peor, y la ficha enseña los dos para que se vea la
  // diferencia.
  check('el tiempo sale del recorrido REAL, no del peor caso',
        /recorrido 15\u00b0/.test(izq.tnec), izq.tnec.slice(0, 200));
  check('y enseña el peor caso al lado, que es contra lo que se compara',
        /110\u00b0/.test(izq.tnec) && /lado m\u00e1s cercano existe/.test(izq.tnec),
        izq.tnec.slice(-170));

  check('ninguna excepción en la página durante todo el banco',
        errores.length === 0, errores.join(' · '));

  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FAIL');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
