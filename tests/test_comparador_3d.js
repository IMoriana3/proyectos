// La escena 3D del Comparador de estructuras — en un Chromium de verdad.
//
// Un 3D bonito que apunte mal es peor que no tenerlo: se lee como una prueba
// visual de un número que en realidad contradice. Estos tests miden la
// ORIENTACIÓN REAL de cada panel en el mundo (la normal, sacada de la matriz
// del grupo que bascula) y la contrastan con dónde está el sol:
//
//   · un seguidor a mediodía tiene que estar casi plano y mirando al sol;
//   · por la mañana tiene que estar tumbado al ESTE, no al oeste — el error de
//     signo clásico, que a mediodía no se nota porque θ≈0;
//   · una fija tiene que mirar al ECUADOR, en los dos hemisferios;
//   · el eje inclinado tiene que subir hacia el ecuador (la trampa del TSAT);
//   · y el sol tiene que proyectar sombra de verdad: una luz direccional de
//     three.js trae un frustum de ±5 m, así que a escala de planta la sombra
//     no se dibuja en ningún sitio si nadie lo dimensiona.
//
//   python3 -m http.server 8099        (en otra terminal)
//   node tests/test_comparador_3d.js
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://127.0.0.1:8099/comparador-estructuras.html';
const EXEC = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

/* Normal del panel de la primera fila de un bloque, en el mundo, y dirección
   del sol. Todo sale de la ESCENA, no de variables auxiliares: si el render y
   la física se separan, es aquí donde se ve. */
const SONDA = `(() => {
  const out = {sol:null, bloques:{}};
  const s = TD.sun.position.clone().sub(TD.ct.target).normalize();
  out.sol = {x:s.x, y:s.y, z:s.z, sombra: TD.sun.castShadow,
             frustum: TD.sun.shadow.camera.right - TD.sun.shadow.camera.left};
  BLOQUES.forEach(B => {
    const u = B.filas[0];
    const spin = u.spin || (u.spinPair && u.spinPair[0]);
    spin.updateWorldMatrix(true, false);
    const n = new THREE.Vector3(0,1,0).applyQuaternion(
      spin.getWorldQuaternion(new THREE.Quaternion())).normalize();
    // eje del tubo: +X local del grupo que bascula
    const eje = new THREE.Vector3(1,0,0).applyQuaternion(
      spin.getWorldQuaternion(new THREE.Quaternion())).normalize();
    out.bloques[B.key] = {n:{x:n.x,y:n.y,z:n.z}, eje:{x:eje.x,y:eje.y,z:eje.z},
                          aoi: Math.acos(Math.max(-1,Math.min(1,n.dot(s))))*180/Math.PI};
  });
  return out;
})()`;

(async () => {
  const b = await chromium.launch({ executablePath: EXEC,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);

  check('la escena arranca con WebGL', await p.evaluate(() => !!(window.TD && TD.rd)));
  // El bloque «Fija · tilt óptimo» se dibujaba con el tilt DE PROYECTO hasta que
  // comparabas, con el rótulo diciendo «óptimo»: enseñaba 25° bajo un nombre
  // que promete otra cosa. Ahora se estima con doce días de cielo claro —
  // instantáneo — y se marca con «≈» hasta que la tabla dé el del año.
  const est = await p.evaluate(() => {
    const B = BLOQUES.find(b => b.key === 'fija_optima');
    const lbl = [...document.querySelectorAll('#escRead .ro')]
      .find(d => /ÓPTIM/i.test(d.querySelector('.k').textContent));
    return { estimado: !!(B && B.estimado), tiltProyecto: +document.getElementById('tilt').value,
             txt: lbl ? lbl.textContent.replace(/\s+/g, ' ') : '',
             cache: TILT_EST };
  });
  check('sin haber comparado, el tilt óptimo se ESTIMA (' + est.cache + '°) en vez de ' +
    'dibujar el de proyecto (' + est.tiltProyecto + '°)',
    est.estimado && est.cache > 0 && est.cache !== est.tiltProyecto,
    JSON.stringify(est));
  check('y se marca con «≈» y «tilt estimado», que no es lo mismo que el del año',
    /≈/.test(est.txt) && /estimado/i.test(est.txt), est.txt);
  check('la estimación es plausible a 37°N (' + est.cache + '°)',
    est.cache > 15 && est.cache < 45, String(est.cache));

  check('se ve desde que se abre, sin comparar nada',
    (await p.evaluate(() => BLOQUES.length)) === 2);

  // marcar las seis
  for (const c of await p.$$('.st')) if (!(await c.isChecked())) await c.check();
  await p.waitForTimeout(600);
  check('un bloque por estructura marcada',
    (await p.evaluate(() => BLOQUES.length)) === 6);

  // ── el box de la potencia pico: ARRIBA DEL TODO ──
  // La comparación es a igualdad de MWp, así que el pico no es un campo más
  // escondido entre la geometría: es el marco, y va antes que nada.
  const orden = await p.evaluate(() => {
    const ids = ['picoCard', 'sitioQ', 'fxModL', 'tkModL', 'tbl'];
    const pos = {}; ids.forEach(i => {
      const el = document.getElementById(i);
      pos[i] = el ? el.getBoundingClientRect().top + window.scrollY : null; });
    return pos;
  });
  check('el box de la potencia pico existe', orden.picoCard !== null);
  check('está por encima del emplazamiento y de los dos configuradores',
    orden.picoCard < orden.sitioQ && orden.picoCard < orden.fxModL &&
    orden.picoCard < orden.tkModL, JSON.stringify(orden));

  const pico = async () => p.evaluate(`(() => {
    const c = cfgActual(), mwp = +document.getElementById('mwp').value;
    return { mwp, fija: FIS.planta(c.fija, mwp), tk: FIS.planta(c.tracker, mwp),
             texto: document.getElementById('picoRead').textContent };
  })()`);
  const p10 = await pico();
  check('a 10 MWp el box dice cuántas estructuras y cuánta parcela (' +
    p10.fija.filas + ' filas · ' + p10.fija.ha.toFixed(2) + ' ha)',
    p10.fija.filas > 0 && p10.fija.ha > 0 &&
    p10.texto.includes(String(p10.fija.filas)));
  // «¿cómo las pone, una detrás de otra o infinitas? ¿al norte o al este?» —
  // si hay que preguntarlo, es que no estaba dicho.
  const campo = await p.evaluate(() => ({
    read: document.getElementById('picoRead').textContent,
    nota: document.getElementById('picoNota').textContent }));
  check('el box publica el CAMPO de cada familia, con sus dos lados',
    /CAMPO · FIJA/i.test(campo.read) && /CAMPO · TRACKER/i.test(campo.read) &&
    /E-O × N-S/.test(campo.read), campo.read.slice(-160));
  check('y dice hacia dónde apila cada una (la fija al sur, el seguidor al este)',
    /apila hacia el .*sur/i.test(campo.nota) && /apila hacia el .*este/i.test(campo.nota),
    campo.nota.slice(0, 300));
  // un parque no es una tira: se rompe en bloques hasta quedar cuadrado
  check('el box dice en cuántos BLOQUES se rompe cada campo',
    /bloques de \d+ filas/i.test(campo.read), campo.read.slice(-200));
  check('y la nota dice por qué: para que el campo quede cuadrado',
    /cuadrado/i.test(campo.nota) && /tiras imposibles/i.test(campo.nota),
    campo.nota.slice(0, 300));
  const cuadra = await p.evaluate(() => {
    const c = cfgActual(), mwp = +document.getElementById('mwp').value;
    const F = FIS.planta(c.fija, mwp), K = FIS.planta(c.tracker, mwp);
    return [F.ladoFila / F.ladoPitch, K.ladoFila / K.ladoPitch];
  });
  check('y los dos campos salen aproximadamente cuadrados (' +
    cuadra.map(r => r.toFixed(2)).join(' / ') + ')',
    cuadra.every(r => Math.abs(r - 1) < 0.25), JSON.stringify(cuadra));
  check('y que para la SOMBRA sí son filas infinitas, con su 1/N',
    /fila infinita/i.test(campo.nota) && /1\/\d+/.test(campo.nota), campo.nota.slice(-320));
  check('y aclara que ese % es DE LA PÉRDIDA, no de la energía',
    /de la p[ée]rdida/i.test(campo.nota) && /no de la energía/i.test(campo.nota),
    campo.nota.slice(-320));

  check('a igualdad de pico los módulos son los MISMOS en las dos familias',
    p10.fija.mods === p10.tk.mods, p10.fija.mods + ' vs ' + p10.tk.mods);

  await p.evaluate(() => { const e = document.getElementById('mwp');
    e.value = '20'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(250);
  const p20 = await pico();
  check('doblar el pico dobla las estructuras (' + p10.fija.filas + ' → ' +
    p20.fija.filas + ')', Math.abs(p20.fija.filas / p10.fija.filas - 2) < 0.02);
  check('y el box lo dice en pantalla', p20.texto.includes(String(p20.fija.filas)));
  await p.evaluate(() => { const e = document.getElementById('mwp');
    e.value = '10'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(250);

  const enHora = async (min) => {
    await p.evaluate(m => { document.getElementById('hora').value = m; actualiza3D(); }, min);
    await p.waitForTimeout(250);
    return p.evaluate(SONDA);
  };

  // ── mediodía: seguidores casi planos y apuntando al sol ──
  const md = await enHora(720);
  check('a mediodía el sol está alto (' + (Math.asin(md.sol.y) * 180 / Math.PI).toFixed(0) + '°)',
    md.sol.y > 0.9);
  for (const k of ['tracker_hsat', 'tracker_hsat_nobt', 'tracker_tsat']) {
    check('a mediodía ' + k + ' apunta al sol (AOI ' + md.bloques[k].aoi.toFixed(1) + '°)',
      md.bloques[k].aoi < 15);
  }
  for (const k of ['fija_optima', 'fija_proyecto']) {
    check('a mediodía la fija ' + k + ' mira al sol (AOI ' + md.bloques[k].aoi.toFixed(1) + '°)',
      md.bloques[k].aoi < 35);
    // hemisferio norte: el ecuador es el SUR, y en el mundo el sur es +z
    check('la fija ' + k + ' mira al ECUADOR (z=' + md.bloques[k].n.z.toFixed(2) + ')',
      md.bloques[k].n.z > 0.15);
  }
  // el eje del seguidor corre NORTE-SUR: su componente este debe ser ~0
  check('el eje del seguidor corre N-S (|este|=' + Math.abs(md.bloques.tracker_hsat.eje.x).toFixed(3) + ')',
    Math.abs(md.bloques.tracker_hsat.eje.x) < 0.02);
  // Y el del TSAT, en LLANO, también está horizontal: un eje no se inclina en
  // el aire. Antes se dibujaba inclinado por el campo «eje inclinado °» aunque
  // el suelo fuese plano, y eso era media fila enterrada o media volando.
  // Cuánto se inclina de verdad se comprueba más abajo, con terreno.
  check('en LLANO el eje del TSAT también está horizontal (y=' +
    md.bloques.tracker_tsat.eje.y.toFixed(3) + ')',
    Math.abs(md.bloques.tracker_tsat.eje.y) < 0.02);

  // ── mañana: tumbado al ESTE. El error de signo no se ve a mediodía ──
  const am = await enHora(480);
  check('por la mañana el sol está al ESTE (x=' + am.sol.x.toFixed(2) + ')', am.sol.x > 0.3);
  for (const k of ['tracker_hsat', 'tracker_hsat_nobt', 'tracker_tsat']) {
    check('por la mañana ' + k + ' se tumba al ESTE (nx=' + am.bloques[k].n.x.toFixed(2) + ')',
      am.bloques[k].n.x > 0.2);
    check('por la mañana ' + k + ' sigue apuntando al sol (AOI ' + am.bloques[k].aoi.toFixed(1) + '°)',
      am.bloques[k].aoi < 25);
  }
  // ── tarde: al OESTE, el espejo de lo anterior ──
  const pm = await enHora(1020);
  check('por la tarde el sol está al OESTE (x=' + pm.sol.x.toFixed(2) + ')', pm.sol.x < -0.3);
  check('por la tarde el seguidor se tumba al OESTE (nx=' + pm.bloques.tracker_hsat.n.x.toFixed(2) + ')',
    pm.bloques.tracker_hsat.n.x < -0.2);

  // ── las dos aguas miran a lados opuestos ──
  const aguas = await p.evaluate(`(() => {
    const B = BLOQUES.find(b => b.key === 'fija_ew'), u = B.filas[0];
    return u.spinPair.map(sp => { sp.updateWorldMatrix(true,false);
      const n = new THREE.Vector3(0,1,0).applyQuaternion(sp.getWorldQuaternion(new THREE.Quaternion()));
      return n.x; });
  })()`);
  check('las dos aguas miran a lados opuestos (' + aguas.map(v => v.toFixed(2)).join(' / ') + ')',
    aguas[0] * aguas[1] < 0);

  // ── la sombra: sin frustum dimensionado no se dibuja en ningún sitio ──
  // «La fija no tiene sombra ni en el terreno»: sí la tiene —todas sus mallas
  // proyectan— pero una fija mira al ecuador y tira la sombra hacia el POLO,
  // o sea al fondo desde la cámara y detrás de sus propias filas. Se comprueba
  // que proyecta de verdad, y que la ficha avisa de dónde hay que buscarla.
  const proy = await p.evaluate(() => {
    const out = {};
    BLOQUES.forEach(B => { let c = 0, t = 0;
      B.filas[0].traverse(o => { if (o.isMesh) { t++; if (o.castShadow) c++; } });
      out[B.key] = [c, t]; });
    return { out, suelo: TD.suelo.receiveShadow,
             nota: document.getElementById('escNote').textContent };
  });
  check('todas las mallas de la fija proyectan sombra (' + proy.out.fija_optima.join('/') + ')',
    proy.out.fija_optima[0] === proy.out.fija_optima[1] && proy.out.fija_optima[0] > 0,
    JSON.stringify(proy.out));
  check('y el suelo la recibe', proy.suelo === true);
  check('la ficha dice que la sombra de la fija cae hacia el polo, al fondo',
    /hacia el polo/i.test(proy.nota) && /al fondo/i.test(proy.nota), proy.nota.slice(-220));

  check('el sol proyecta sombra a mediodía', md.sol.sombra === true);
  check('el frustum de sombra cubre la escena (' + md.sol.frustum.toFixed(0) + ' m)',
    md.sol.frustum > 60);
  const noche = await enHora(60);
  check('de noche se apaga la sombra', noche.sol.sombra === false);

  // ── y la escena no contradice a la tabla ──
  await p.evaluate(() => { document.getElementById('source').value = 'clearsky'; });
  await p.click('#run');
  await p.waitForSelector('#tbl tbody tr', { timeout: 120000 });
  await p.evaluate(() => { document.getElementById('hora').value = 720; actualiza3D(); });
  const coherente = await p.evaluate(`(() => {
    const fila = REP.filas.find(f => f.key === 'fija_optima');
    const lbl = [...document.querySelectorAll('#escRead .ro')]
      .find(d => /ÓPTIMO/i.test(d.querySelector('.k').textContent));
    return {tabla: fila.tilt, escena: parseFloat(lbl.querySelector('.v').textContent)};
  })()`);
  check('la fija óptima se DIBUJA con el tilt que dice la tabla (' +
    coherente.escena + '° vs ' + coherente.tabla + '°)',
    Math.abs(coherente.escena - coherente.tabla) < 1.01,
    JSON.stringify(coherente));

  // y la nota de la tabla, con el nº de filas ya sabido, da la corrección MEDIDA
  // en vez de una regla de tres genérica
  const notaTbl = await p.evaluate(() => document.getElementById('tblNote').textContent);
  check('la nota de la tabla corrige la sombra de borde con cifras',
    /fila INFINITA/i.test(notaTbl) && /sería en realidad/i.test(notaTbl) &&
    /puntos de diferencia/i.test(notaTbl), notaTbl.slice(0, 260));

  // ── la tabla trae el dimensionado a igualdad de pico ──
  const tabla = await p.evaluate(`(() => {
    const th = [...document.querySelectorAll('#tbl thead th')].map(t => t.textContent);
    const fila = [...document.querySelectorAll('#tbl tbody tr')].find(
      tr => /óptim/i.test(tr.cells[0].textContent));
    const q = REP.pico && REP.pico.por['fija_optima'];
    return { th, celdas: [...fila.cells].map(c => c.textContent.trim()),
             ha: q ? +q.ha.toFixed(2) : null, filas: q ? q.filas : null,
             mwp: REP.pico ? REP.pico.mwp : null };
  })()`);
  check('la tabla tiene columna de estructuras, suelo (ha) e incidente',
    tabla.th.some(t => /Estructuras/.test(t)) && tabla.th.some(t => /Suelo/.test(t)) &&
    tabla.th.some(t => /Incidente/.test(t)), tabla.th.join(' | '));
  check('el suelo de la tabla es el del dimensionado (' + tabla.ha + ' ha)',
    tabla.celdas.some(c => c === tabla.ha.toFixed(2).replace('.', ',') ||
                           c === String(tabla.ha) || c.includes(String(tabla.ha))),
    JSON.stringify(tabla.celdas));
  check('el dimensionado se congela con la corrida (' + tabla.mwp + ' MWp)',
    tabla.mwp === 10 && tabla.filas > 0);
  const resumen = await p.evaluate(() => document.getElementById('out').textContent);
  check('el resumen corona a la que menos suelo pide a igualdad de pico',
    /Menos suelo/.test(resumen) && /ha/.test(resumen), resumen.slice(0, 200));

  // ── el encuadre: nada puede quedar fuera de cuadro ──
  // El primer intento (distancia por fórmula) se pasaba un 26 % y cortaba los
  // bloques de los extremos; ahora `encuadra()` lo mide y corrige.
  for (const n of [2, 4, 6]) {
    const fit = await p.evaluate(k => {
      const c = [...document.querySelectorAll('.st')];
      c.forEach((x, i) => { x.checked = i < k; });
      construyeMundo(); actualiza3D();
      const caja = new THREE.Box3().setFromObject(MUNDO);
      TD.cam.updateMatrixWorld(); TD.cam.updateProjectionMatrix();
      let m = 0;
      for (let i = 0; i < 8; i++) {
        const v = new THREE.Vector3(i & 1 ? caja.max.x : caja.min.x,
                                    i & 2 ? caja.max.y : caja.min.y,
                                    i & 4 ? caja.max.z : caja.min.z).project(TD.cam);
        m = Math.max(m, Math.abs(v.x), Math.abs(v.y));
      }
      return +m.toFixed(3);
    }, n);
    check('con ' + n + ' bloques cabe todo en el encuadre (' + fit + ' ≤ 1)', fit <= 1.0);
  }

  // ── la escena OBEDECE a los dos configuradores ──
  // El 3D se quedó mudo: la lista que rehacía el mundo conservaba los ids de
  // antes de partir la configuración en `fx*`/`tk*` ('pitch','modL','tabla'…),
  // `if(!el)return` se los tragó en silencio y podías cambiar el pitch, la mesa
  // o el módulo y ver siempre la geometría del arranque — la ficha enseñando
  // una estructura y calculando otra, justo lo que el 3D existe para evitar.
  // Estos checks miden la ESCENA antes y después de tocar cada campo.
  const MEDIDA = k => `(() => {
    const B = BLOQUES.find(b => b.key === ${JSON.stringify(k)});
    if (!B) return null;
    const caja = new THREE.Box3().setFromObject(B.filas[0]);
    return { sep: +B.filas[0].position.distanceTo(B.filas[1].position).toFixed(3),
             pitch: +B.pitch.toFixed(3),
             dx: +(caja.max.x - caja.min.x).toFixed(2),
             dz: +(caja.max.z - caja.min.z).toFixed(2),
             dy: +(caja.max.y - caja.min.y).toFixed(2) };
  })()`;
  const pon = async (id, v) => {
    await p.evaluate(([i, x]) => { const el = document.getElementById(i);
      el.value = x; el.dispatchEvent(new Event('change', { bubbles: true })); }, [id, String(v)]);
    await p.waitForTimeout(250);
  };
  await p.evaluate(() => { document.getElementById('hora').value = 720; actualiza3D(); });

  const antesFx = await p.evaluate(MEDIDA('fija_proyecto'));
  await pon('fxPitch', 9.5);
  const trasPitch = await p.evaluate(MEDIDA('fija_proyecto'));
  check('el pitch de la FIJA separa las filas en la escena (' +
    antesFx.sep + ' → ' + trasPitch.sep + ' m)',
    Math.abs(trasPitch.sep - 9.5) < 0.01 && trasPitch.sep !== antesFx.sep);

  await pon('fxTabla', '2V');
  const tras2V = await p.evaluate(MEDIDA('fija_proyecto'));
  check('la mesa de la FIJA (1V → 2V) crece en la escena (' +
    trasPitch.dz + ' → ' + tras2V.dz + ' m de fondo)', tras2V.dz > trasPitch.dz * 1.6);

  const antesTk = await p.evaluate(MEDIDA('tracker_hsat'));
  await pon('tkModsStr', 14);
  const trasTk = await p.evaluate(MEDIDA('tracker_hsat'));
  check('menos módulos por string acorta el TRACKER en la escena (' +
    Math.max(antesTk.dx, antesTk.dz) + ' → ' + Math.max(trasTk.dx, trasTk.dz) + ' m)',
    Math.max(trasTk.dx, trasTk.dz) < Math.max(antesTk.dx, antesTk.dz) * 0.75);
  check('tocar el configurador de la FIJA no movió al TRACKER',
    antesTk.pitch === trasTk.pitch);

  // y el largo dibujado ES el de la lectura: el modelo de seguidor.js se genera
  // con sus propias cotas canónicas, así que si nadie se las pasa la escena
  // enseña un tracker de catálogo mientras la tabla calcula el configurado.
  await pon('tkModsStr', 28);
  const largoTk = await p.evaluate(`(() => {
    const B = BLOQUES.find(b => b.key === 'tracker_hsat');
    const c = new THREE.Box3().setFromObject(B.filas[0]);
    return { escena: +Math.max(c.max.x-c.min.x, c.max.z-c.min.z).toFixed(2),
             lectura: +cfgActual().tracker.largoFila.toFixed(2) };
  })()`);
  check('el TRACKER se dibuja al largo que dice su lectura (' + largoTk.escena +
    ' vs ' + largoTk.lectura + ' m)', Math.abs(largoTk.escena - largoTk.lectura) < 0.5,
    JSON.stringify(largoTk));

  const antesAp = await p.evaluate(MEDIDA('tracker_hsat'));
  await pon('tkTabla', '2V');
  const trasAp = await p.evaluate(MEDIDA('tracker_hsat'));
  check('la mesa del TRACKER (1V → 2V) dobla la apertura dibujada (' +
    antesAp.dx + ' → ' + trasAp.dx + ' m, a mediodía y plano)',
    Math.abs(trasAp.dx / antesAp.dx - 2) < 0.05 && trasAp.dz === antesAp.dz,
    JSON.stringify([antesAp, trasAp]));
  await pon('tkTabla', '1V');

  await pon('tkPitch', 11);
  const trasTkP = await p.evaluate(MEDIDA('tracker_hsat'));
  check('el pitch del TRACKER separa SUS filas, no las de la fija (' +
    trasTkP.sep + ' m)', Math.abs(trasTkP.sep - 11) < 0.01 &&
    Math.abs((await p.evaluate(MEDIDA('fija_proyecto'))).sep - 9.5) < 0.01);

  // el emplazamiento: `.value` puesto a mano no dispara 'change', así que
  // elegir Assú (hemisferio SUR) dejaba la fija mirando al sur.
  await p.evaluate(() => { const e = document.getElementById('sitioQ');
    e.value = 'Assú'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#sitioRes .it')
    .dispatchEvent(new MouseEvent('mousedown')));
  await p.waitForTimeout(400);
  const sur = await p.evaluate(SONDA);
  check('elegir un emplazamiento del SUR gira la fija al NORTE (z=' +
    sur.bloques.fija_proyecto.n.z.toFixed(2) + ')', sur.bloques.fija_proyecto.n.z < -0.15);

  // ── una mesa que no cabe en el pitch: plano y DICHO ──
  // Con 3V a pitch 6 la apertura (7,146 m) no cabe (GCR 1,19) y el
  // backtracking pedía retroceder más de lo que había avanzado: el seguidor
  // salía a −32,6° A MEDIODÍA y girando al revés. Ahora se queda plano y la
  // escena dice por qué en vez de enseñar un ángulo inventado.
  const nocabe = await p.evaluate(() => {
    const set = (t, pi) => {
      const e = document.getElementById('tkTabla'), q = document.getElementById('tkPitch');
      e.value = t; q.value = pi;
      e.dispatchEvent(new Event('change', { bubbles: true }));
      q.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const lee = () => {
      const B = BLOQUES.find(b => b.key === 'tracker_hsat');
      const th = m => { document.getElementById('hora').value = m; actualiza3D();
        return +(B.filas[0].spin.rotation.x * 180 / Math.PI).toFixed(1); };
      const r = { th08: th(480), th12: th(720), th17: th(1020), gcr: +B.gcr.toFixed(3) };
      r.txt = [...document.querySelectorAll('#escRead .ro')]
        .map(d => d.textContent.replace(/\s+/g, ' ')).join(' | ');
      return r;
    };
    document.querySelectorAll('.st').forEach(c => { c.checked = c.value === 'tracker_hsat'; });
    set('3V', '6.00'); construyeMundo();
    const mal = lee();
    set('3V', '9.00'); construyeMundo();
    const bien = lee();
    set('1V', '6.00'); construyeMundo(); actualiza3D();
    return { mal, bien };
  });
  check('con la mesa que no cabe (GCR ' + nocabe.mal.gcr + ') el seguidor se queda PLANO ' +
    'a todas horas', [nocabe.mal.th08, nocabe.mal.th12, nocabe.mal.th17]
      .every(t => Math.abs(t) < 0.01), JSON.stringify(nocabe.mal));
  check('y la escena DICE que no cabe, en vez de enseñar un ángulo inventado',
    /no cabe/i.test(nocabe.mal.txt), nocabe.mal.txt.slice(0, 200));
  check('abriendo el pitch a 9 m la misma mesa vuelve a girar (' + nocabe.bien.th08 +
    '° / ' + nocabe.bien.th12 + '° / ' + nocabe.bien.th17 + '°)',
    nocabe.bien.th08 > 1 && Math.abs(nocabe.bien.th12) < 2 && nocabe.bien.th17 < -1,
    JSON.stringify(nocabe.bien));
  check('y por la mañana al ESTE y por la tarde al OESTE, no al revés',
    nocabe.bien.th08 > 0 && nocabe.bien.th17 < 0);

  // ── EL TERRENO: UN SOLO PLANO, EL DEL SITIO ──
  // La pendiente es del emplazamiento —magnitud y AZIMUT— y todas las
  // estructuras se montan sobre ese mismo plano. Lo que cambia con la
  // estructura es la COMPONENTE que ve: la ⊥ a sus filas sombrea, la que corre
  // a lo largo no. Las versiones anteriores dibujaban una bancada por bloque,
  // girada a las filas de cada familia, que era la consecuencia de teclear la
  // pendiente «⊥ filas» y le pedía al terreno girar con cada estructura.
  const suelo = await p.evaluate(() => {
    const set = (b, a) => {
      const e = document.getElementById('pend'); e.value = String(b);
      e.dispatchEvent(new Event('change', { bubbles: true }));
      const q = document.getElementById('pendAz'); q.value = String(a);
      q.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const cotas = () => { const pos = TD.suelo.geometry.attributes.position;
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i);
        lo = Math.min(lo, y); hi = Math.max(hi, y); }
      return { lo: +lo.toFixed(2), hi: +hi.toFixed(2), n: pos.count,
               normales: TD.suelo.geometry.attributes.normal.count,
               color: !!TD.suelo.geometry.attributes.color }; };
    // gradiente del terreno medido en un punto cualquiera
    const d = 7, h = (x, z) => cotaTerreno(x, z, TERRENO_3D);
    const grad = (x, z) => ({
      gx: +(Math.atan2(h(x - d, z) - h(x + d, z), 2 * d) * 180 / Math.PI).toFixed(2),
      gz: +(Math.atan2(h(x, z - d) - h(x, z + d), 2 * d) * 180 / Math.PI).toFixed(2) });
    const foto = () => ({
      bloques: BLOQUES.map(B => {
        const g = B.filas[0].parent;
        return { k: B.key, y: +g.position.y.toFixed(3),
                 suelo: +h(g.position.x, g.position.z).toFixed(3),
                 cruz: +B.cruz.toFixed(2) };
      }),
      // el MISMO gradiente en cuatro puntos alejados: eso es un plano
      lejos: [grad(-300, -200), grad(300, -200), grad(-300, 200), grad(300, 200)],
      cotas: cotas() });
    document.querySelectorAll('.st').forEach(c => { c.checked = true; });
    // el hemisferio decide hacia dónde apila la fija, así que se fija aquí:
    // pruebas anteriores dejan la ficha en el sur
    const lat = document.getElementById('lat'); lat.value = '37.3891';
    lat.dispatchEvent(new Event('change', { bubbles: true }));
    set(0, 180); construyeMundo(); actualiza3D();
    const llano = foto();
    set(16, 180); construyeMundo(); actualiza3D();
    const alSur = foto();
    set(16, 90); construyeMundo(); actualiza3D();
    const alEste = foto();
    set(16, 135); construyeMundo(); actualiza3D();
    const diagonal = foto();
    const lect = document.getElementById('escRead').textContent.replace(/\s+/g, ' ');
    set(0, 180); construyeMundo(); actualiza3D();
    return { llano, alSur, alEste, diagonal, lect };
  });

  check('en llano el suelo es llano', suelo.llano.cotas.lo === 0 && suelo.llano.cotas.hi === 0,
    JSON.stringify(suelo.llano.cotas));
  check('con pendiente hay relieve, y baja tanto como sube (' +
    suelo.alSur.cotas.lo + ' … ' + suelo.alSur.cotas.hi + ' m)',
    suelo.alSur.cotas.hi > 5 && Math.abs(suelo.alSur.cotas.hi + suelo.alSur.cotas.lo) < 0.5,
    JSON.stringify(suelo.alSur.cotas));
  check('es un heightfield, no dos triángulos (' + suelo.alSur.cotas.n + ' vértices)',
    suelo.alSur.cotas.n > 5000, String(suelo.alSur.cotas.n));
  check('con las normales recalculadas, que es lo que lo hace parecer terreno',
    suelo.alSur.cotas.normales === suelo.alSur.cotas.n, String(suelo.alSur.cotas.normales));
  // Con el sol a 76° casi cenital, una ladera de 16° recibe casi la misma luz
  // que el llano: sin tinte por cota el relieve no se ve por muy bien hecho
  // que esté.
  check('y con tinte por cota, o a mediodía no se vería la ladera',
    suelo.alSur.cotas.color === true);

  // Lo que hace que sea UN plano y no seis bancadas: el gradiente es el mismo
  // en puntos separados cientos de metros.
  [['al sur', suelo.alSur, 0, 16], ['al este', suelo.alEste, 16, 0]].forEach(([nom, f, gx, gz]) => {
    check('cayendo ' + nom + ', el terreno tiene el MISMO gradiente en todo el mapa',
      f.lejos.every(g => Math.abs(g.gx - gx) < 0.3 && Math.abs(g.gz - gz) < 0.3),
      JSON.stringify(f.lejos));
  });
  check('y las seis estructuras se apoyan en él a la misma cota (curva de nivel)',
    suelo.diagonal.bloques.length === 6 &&
    suelo.diagonal.bloques.every(b => Math.abs(b.y) < 1e-6 && Math.abs(b.suelo) < 1e-6),
    JSON.stringify(suelo.diagonal.bloques.map(b => b.k + ':' + b.suelo)));

  // Y la consecuencia que el usuario tiene que poder leer: con el terreno
  // cayendo al SUR, la fija ve toda la pendiente ⊥ a sus filas y el seguidor
  // NINGUNA — la ve a lo largo del eje. Al este, al revés.
  const cruzDe = (f, k) => f.bloques.find(b => b.k === k).cruz;
  check('cayendo al SUR la fija ve 16° ⊥ a sus filas y el seguidor 0°',
    Math.abs(cruzDe(suelo.alSur, 'fija_proyecto') - 16) < 0.01 &&
    Math.abs(cruzDe(suelo.alSur, 'tracker_hsat')) < 0.01,
    JSON.stringify(suelo.alSur.bloques.map(b => b.k + ':' + b.cruz)));
  check('cayendo al ESTE se cambian las tornas: 0° la fija y 16° el seguidor',
    Math.abs(cruzDe(suelo.alEste, 'fija_proyecto')) < 0.01 &&
    Math.abs(cruzDe(suelo.alEste, 'tracker_hsat') - 16) < 0.01,
    JSON.stringify(suelo.alEste.bloques.map(b => b.k + ':' + b.cruz)));
  check('y en diagonal (135°) las seis ven lo mismo, que ya no se impone: sale',
    suelo.diagonal.bloques.every(b =>
      Math.abs(Math.abs(b.cruz) - Math.abs(cruzDe(suelo.diagonal, 'fija_proyecto'))) < 0.01),
    JSON.stringify(suelo.diagonal.bloques.map(b => b.k + ':' + b.cruz)));
  // Sin decirlo en pantalla, dos bloques sobre el MISMO plano con sombras
  // distintas parecen un error de la escena.
  check('cada lectura dice cuánta pendiente ⊥ ve esa estructura',
    /⊥ filas/.test(suelo.lect), suelo.lect.slice(0, 260));

  // ── LAS FILAS SE ADAPTAN AL TERRENO ──
  // La pendiente la tiene el SUELO; la estructura se replantea sobre él. Cada
  // fila apoyada en la cota de su CENTRO y horizontal a lo largo no vale: con
  // 65 m de fila y 24° en esa dirección, un extremo vuela 14 m y el otro se
  // entierra otros 14 — el «tracker con megasoportes» que no se construye.
  const sigue = await p.evaluate(() => {
    const mide = (b, a) => {
      const e = document.getElementById('pend'); e.value = String(b);
      e.dispatchEvent(new Event('change', { bubbles: true }));
      const q = document.getElementById('pendAz'); q.value = String(a);
      q.dispatchEvent(new Event('change', { bubbles: true }));
      return BLOQUES.map(B => {
        const u = B.filas[0]; u.updateWorldMatrix(true, true);
        const L = cfgActual().geomDe(B.spec).largoFila / 2;
        // eje largo EN LOCAL: la fija y las dos aguas lo llevan en X (la mesa);
        // el seguidor en Z, porque el modelo entra girado 90° en Y por dentro
        const ej = (B.spec.fam === 'tracker') ? new THREE.Vector3(0, 0, 1)
                                              : new THREE.Vector3(1, 0, 0);
        const vuelo = [-L, L].map(t => {
          const v = ej.clone().multiplyScalar(t).applyMatrix4(u.matrixWorld);
          return +(v.y - cotaTerreno(v.x, v.z, TERRENO_3D)).toFixed(2);
        });
        return { k: B.key, vuelo, largo: +B.largoPend.toFixed(1),
                 cruz: +B.cruz.toFixed(1),
                 ejeY: +new THREE.Vector3(0, 0, 1).transformDirection(u.matrixWorld).y.toFixed(3) };
      });
    };
    document.querySelectorAll('.st').forEach(c => { c.checked = true; });
    const lat = document.getElementById('lat'); lat.value = '37.3891';
    lat.dispatchEvent(new Event('change', { bubbles: true }));
    const r = { nne: mide(26, 23), este: mide(26, 90), sur: mide(26, 180) };
    r.lect = document.getElementById('escRead').textContent.replace(/\s+/g, ' ');
    mide(0, 180);
    return r;
  });
  ['nne', 'este', 'sur'].forEach(caso => {
    check('con la caída ' + caso + ', NINGUNA fila vuela ni se entierra en sus extremos',
      sigue[caso].every(b => b.vuelo.every(v => Math.abs(v) < 0.02)),
      JSON.stringify(sigue[caso].map(b => b.k + ':' + b.vuelo.join('/'))));
  });
  // Y adaptarse es inclinarse LO QUE SE INCLINA EL SUELO, ni más ni menos: el
  // eje del seguidor sube exactamente la componente a lo largo del eje.
  const tk = c => sigue[c].find(b => b.k === 'tracker_hsat');
  check('el eje del seguidor se inclina con el terreno: sen(24,2°) = ' +
    Math.abs(tk('nne').ejeY).toFixed(3),
    Math.abs(Math.abs(tk('nne').ejeY) - Math.sin(Math.abs(tk('nne').largo) * Math.PI / 180)) < 0.01,
    JSON.stringify({ ejeY: tk('nne').ejeY, largo: tk('nne').largo }));
  check('y con la caída al ESTE, que corre ⊥ a su eje, el eje se queda horizontal',
    Math.abs(tk('este').ejeY) < 0.01 && Math.abs(tk('este').cruz - 26) < 0.1,
    JSON.stringify({ ejeY: tk('este').ejeY, cruz: tk('este').cruz }));
  check('y la lectura del seguidor dice cuánto se inclina su eje con el terreno',
    /eje [\d,]+° con el terreno/.test(sigue.lect), sigue.lect.slice(0, 300));

  // El «eje inclinado °» ya no es una entrada: se rellena con lo que da el
  // terreno a lo largo del eje. Dejarlo a mano permitía teclear un eje que el
  // emplazamiento no sostiene, y entonces se dibuja una cosa y se calcula otra.
  const eje = await p.evaluate(() => {
    const campo = document.getElementById('axtilt');
    const set = (b, a) => {
      const e = document.getElementById('pend'); e.value = String(b);
      e.dispatchEvent(new Event('change', { bubbles: true }));
      const q = document.getElementById('pendAz'); q.value = String(a);
      q.dispatchEvent(new Event('change', { bubbles: true }));
      const B = BLOQUES.find(x => x.key === 'tracker_tsat');
      const u = B.filas[0]; u.updateWorldMatrix(true, true);
      return { campo: +campo.value,
               dibujado: +(new THREE.Vector3(0, 0, 1).transformDirection(u.matrixWorld).y
                           .toFixed(4)) };
    };
    const r = { ro: campo.readOnly, sur: set(26, 180), norte: set(26, 0),
                este: set(26, 90), llano: set(0, 180) };
    return r;
  });
  check('el campo del eje inclinado es de solo lectura: lo pone el terreno',
    eje.ro === true, String(eje.ro));
  check('cayendo al SUR marca +26° (el eje mira al ecuador)',
    Math.abs(eje.sur.campo - 26) < 0.1, String(eje.sur.campo));
  check('cayendo al NORTE marca −26°: un eje puede caer hacia el polo',
    Math.abs(eje.norte.campo + 26) < 0.1, String(eje.norte.campo));
  check('cayendo al ESTE, 0°: esa pendiente es ⊥ al eje, no a lo largo',
    Math.abs(eje.este.campo) < 0.1, String(eje.este.campo));
  check('y en LLANO, 0°: sin pendiente no hay TSAT que valga',
    Math.abs(eje.llano.campo) < 0.01, String(eje.llano.campo));
  // y lo dibujado coincide con lo declarado, que es de lo que iba todo esto
  check('el eje DIBUJADO es el mismo que marca el campo (sen 26° = ' +
    Math.sin(26 * Math.PI / 180).toFixed(3) + ')',
    Math.abs(Math.abs(eje.sur.dibujado) - Math.sin(26 * Math.PI / 180)) < 0.01,
    String(eje.sur.dibujado));

  // ── EL AZIMUT DE LA ESTRUCTURA, QUE NO ES EL DEL TERRENO ──
  // Ni la fija mira siempre al ecuador ni el eje corre siempre norte-sur: es
  // decisión de proyecto. Se declara como desvío (0 = lo de manual, positivo al
  // oeste) y tiene que mover la ESCENA, no solo la nota.
  const azim = await p.evaluate(() => {
    const grados = v => (v * 180 / Math.PI + 360) % 360;
    const set = (df, de) => {
      const a = document.getElementById('desvFija'); a.value = String(df);
      a.dispatchEvent(new Event('change', { bubbles: true }));
      const b = document.getElementById('desvEje'); b.value = String(de);
      b.dispatchEvent(new Event('change', { bubbles: true }));
      const F = BLOQUES.find(x => x.key === 'fija_proyecto');
      const T = BLOQUES.find(x => x.key === 'tracker_hsat');
      // Azimut al que APILA la fija, que es al que mira. Se mide sobre el marco
      // del bloque y no sobre la normal del panel: la fila se apoya además en
      // el terreno, y ese escorado mueve la normal unos grados — el azimut de
      // proyecto es el del marco.
      const g = F.filas[0].parent; g.updateWorldMatrix(true, false);
      const d = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld);
      const azPanel = grados(Math.atan2(d.x, -d.z));
      // dirección del EJE del seguidor en el mundo (su +Z local es el tubo)
      const u = T.filas[0]; u.updateWorldMatrix(true, true);
      const e = new THREE.Vector3(0, 0, 1).transformDirection(u.matrixWorld);
      const azEje = grados(Math.atan2(e.x, -e.z));
      return { azPanel: +azPanel.toFixed(1), azEje: +azEje.toFixed(1),
               cruzF: +F.cruz.toFixed(2), cruzT: +T.cruz.toFixed(2) };
    };
    document.querySelectorAll('.st').forEach(c => { c.checked = true; });
    const lat = document.getElementById('lat'); lat.value = '37.3891';
    lat.dispatchEvent(new Event('change', { bubbles: true }));
    const e = document.getElementById('pend'); e.value = '16';
    e.dispatchEvent(new Event('change', { bubbles: true }));
    const q = document.getElementById('pendAz'); q.value = '180';
    q.dispatchEvent(new Event('change', { bubbles: true }));
    const r = { base: set(0, 0), fija30: set(30, 0), eje20: set(0, 20) };
    r.nota = document.getElementById('azFijaNota').textContent.replace(/\s+/g, ' ');
    set(0, 0);
    return r;
  });
  check('sin desvíos el panel mira al sur (' + azim.base.azPanel + '°) y el eje ' +
    'corre norte-sur (' + azim.base.azEje + '°)',
    Math.abs(azim.base.azPanel - 180) < 1.5 &&
    Math.min(azim.base.azEje, Math.abs(azim.base.azEje - 180)) < 1.5,
    JSON.stringify(azim.base));
  check('con 30° de desvío la fija mira a 210° en la ESCENA, no solo en la nota',
    Math.abs(azim.fija30.azPanel - 210) < 1.5, String(azim.fija30.azPanel));
  check('y el seguidor no se entera: su eje sigue norte-sur',
    Math.min(azim.fija30.azEje, Math.abs(azim.fija30.azEje - 180)) < 1.5,
    String(azim.fija30.azEje));
  check('con 20° de desvío el EJE gira a 20° y la fija no se entera',
    Math.min(Math.abs(azim.eje20.azEje - 20), Math.abs(azim.eje20.azEje - 200)) < 1.5 &&
    Math.abs(azim.eje20.azPanel - 180) < 1.5, JSON.stringify(azim.eje20));
  // y lo que de verdad importa: girar la estructura cambia CUÁNTA pendiente ve
  check('girar la fija 30° le baja la pendiente ⊥ de 16° a ' + azim.fija30.cruzF + '° ' +
    '(16° · cos 30°)', Math.abs(Math.tan(azim.fija30.cruzF * Math.PI / 180) -
      Math.tan(16 * Math.PI / 180) * Math.cos(30 * Math.PI / 180)) < 0.002,
    JSON.stringify([azim.base.cruzF, azim.fija30.cruzF]));
  check('y girar el eje 20° le SUBE la del seguidor de 0° a ' + azim.eje20.cruzT + '°',
    Math.abs(azim.base.cruzT) < 0.01 && Math.abs(azim.eje20.cruzT) > 5,
    JSON.stringify([azim.base.cruzT, azim.eje20.cruzT]));
  check('y el campo lo dice con su rumbo',
    /210/.test(azim.nota) === false || /oeste|este/.test(azim.nota), azim.nota);

  // ── BRÚJULA Y CÁMARA LIBRE ──
  // Con tres azimutes en juego —terreno, fija y eje— y la cámara orbitando, sin
  // una rosa no hay forma de leer ninguno. Y la cámara se podía desplazar desde
  // siempre, pero cada reconstrucción la devolvía a su sitio: como no se podía
  // tocar un campo sin perder la vista, en la práctica no se podía mirar a otro
  // lado.
  const rosa = async (pend, az) => {
    await p.evaluate(v => {
      const s = (id, x) => { const el = document.getElementById(id);
        el.value = String(x); el.dispatchEvent(new Event('change', { bubbles: true })); };
      s('pend', v[0]); s('pendAz', v[1]);
    }, [pend, az]);
    await p.waitForTimeout(350);
    return p.evaluate(() => {
      const g = id => document.querySelector('#' + id);
      const gr = id => { const t = g(id).getAttribute('transform');
        return t ? +/-?[\d.]+/.exec(t)[0] : null; };
      return { norte: gr('brjRosa'), pend: gr('brjPend'),
               pendVis: g('brjPend').style.display, solVis: g('brjSol').style.display,
               sol: gr('brjSol') };
    });
  };
  const bLlano = await rosa(0, 180), bSur = await rosa(16, 180), bEste = await rosa(16, 90);
  check('hay brújula, y el norte gira con la cámara',
    bLlano.norte !== null && Math.abs(bLlano.norte - bEste.norte) > 20,
    JSON.stringify([bLlano.norte, bEste.norte]));
  check('en llano no enseña flecha de pendiente: no hay ninguna',
    bLlano.pendVis === 'none', bLlano.pendVis);
  // La flecha apunta a donde CAE el terreno. Con la cámara cuesta abajo, cae
  // hacia el que mira: abajo en pantalla, o sea cerca de 180°.
  [['al sur', bSur], ['al este', bEste]].forEach(([nom, b]) => {
    check('cayendo ' + nom + ' la flecha apunta cuesta abajo (' + b.pend + '°)',
      b.pendVis === '' && Math.abs(Math.abs(b.pend) - 180) < 35, JSON.stringify(b));
  });
  check('y el sol también sale en la rosa, que es lo que dice adónde van las sombras',
    bSur.solVis === '' && bSur.sol !== null, JSON.stringify(bSur));

  const libre = await p.evaluate(async () => {
    const antes = [TD.cam.position.x, TD.cam.position.z];
    // el usuario orbita: OrbitControls dispara 'start'
    TD.ct.dispatchEvent({ type: 'start' });
    TD.cam.position.set(-90, 60, 20); TD.ct.update();
    const mov = [TD.cam.position.x, TD.cam.position.z], flag = TD.libre;
    // y ahora toca un campo, que reconstruye la escena
    const e = document.getElementById('pend'); e.value = '20';
    e.dispatchEvent(new Event('change', { bubbles: true }));
    const tras = [TD.cam.position.x, TD.cam.position.z];
    document.querySelector('.recentrar').click();
    const rec = [TD.cam.position.x, TD.cam.position.z];
    return { antes, mov, flag, tras, rec, libreTrasRec: TD.libre };
  });
  check('mover la cámara la marca como del USUARIO', libre.flag === true);
  check('y reconstruir la escena ya no se la quita de las manos',
    Math.hypot(libre.tras[0] - libre.mov[0], libre.tras[1] - libre.mov[1]) < 1,
    JSON.stringify([libre.mov, libre.tras]));
  check('«recentrar» la devuelve al encuadre de la escena',
    libre.libreTrasRec === false &&
    Math.hypot(libre.rec[0] - libre.mov[0], libre.rec[1] - libre.mov[1]) > 20,
    JSON.stringify([libre.mov, libre.rec]));
  await p.evaluate(() => { const e = document.getElementById('pend'); e.value = '0';
    e.dispatchEvent(new Event('change', { bubbles: true })); });

  // ── LA CÁMARA, POR EL LADO DEL ECUADOR ──
  // La cámara se pone cuesta abajo para ver los bloques en línea y la ladera
  // subiendo por detrás. Pero cuesta abajo puede ser el NORTE, y una fija mira
  // al ecuador: con la caída al NNE la cámara se plantaba detrás de los paneles
  // y la escena salía en negro, con las mesas de canto. Las dos direcciones ⊥ a
  // la línea de bloques encuadran igual; solo una enseña la cara.
  const mira = await p.evaluate(() => {
    const out = [];
    // el hemisferio manda de qué lado está el ecuador, así que se fija aquí:
    // pruebas anteriores dejan la ficha en el sur y el lado bueno es el otro
    const lat = document.getElementById('lat'); lat.value = '37.3891';
    lat.dispatchEvent(new Event('change', { bubbles: true }));
    [0, 23, 90, 135, 180, 270, 340].forEach(az => {
      const e = document.getElementById('pend'); e.value = '26';
      e.dispatchEvent(new Event('change', { bubbles: true }));
      const q = document.getElementById('pendAz'); q.value = String(az);
      q.dispatchEvent(new Event('change', { bubbles: true }));
      const B = BLOQUES.find(b => b.key === 'fija_optima');
      const sp = B.filas[0].spin; sp.updateWorldMatrix(true, false);
      const n = new THREE.Vector3(0, 1, 0).applyQuaternion(
        sp.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const v = new THREE.Vector3().subVectors(TD.cam.position,
        B.filas[0].getWorldPosition(new THREE.Vector3())).normalize();
      out.push({ az, cara: +n.dot(v).toFixed(3),
                 camZ: +TD.cam.position.z.toFixed(0) });
    });
    const e = document.getElementById('pend'); e.value = '0';
    e.dispatchEvent(new Event('change', { bubbles: true }));
    return out;
  });
  check('la cámara mira la CARA de los paneles, caiga el terreno hacia donde caiga',
    mira.every(m => m.cara > 0.12), JSON.stringify(mira));
  check('y en el hemisferio norte se queda al sur del campo, nunca detrás',
    mira.every(m => m.camZ > 0), JSON.stringify(mira.map(m => m.az + ':' + m.camZ)));
  // cos(90°) en JS es 6e-17, no 0: sin épsilon ese ruido decidía el lado
  check('con la caída al este y al oeste el lado se elige por la pendiente, no por el ruido',
    mira.find(m => m.az === 90) && mira.find(m => m.az === 270) &&
    Math.sign(mira.find(m => m.az === 90).cara) === 1, JSON.stringify(mira));

  // ── el texto: por qué el terreno es uno y las componentes no ──
  const porQue = await p.evaluate(() => document.getElementById('escNote').textContent);
  const plano = porQue.replace(/\s+/g, ' ');
  check('la escena dice que el terreno es UNO, con su azimut',
    /uno solo/i.test(plano) && /azimut/i.test(plano), plano.slice(-520));
  check('y que lo que cambia con la estructura es la COMPONENTE que ve',
    /componente/i.test(plano) && /cross_axis_slope/i.test(plano), plano.slice(-520));
  check('y lo dice con el caso que lo demuestra: cayendo al sur, el seguidor no ve nada',
    /cayendo al sur/i.test(plano) && /el seguidor ninguna/i.test(plano), plano.slice(-520));
  check('y que las filas se adaptan al terreno a lo largo y se escalonan en el pitch',
    /se adaptan al terreno/i.test(plano) && /escalonan/i.test(plano),
    plano.slice(-260));
  check('y que el eje inclinado de un TSAT debería ser esa misma componente',
    /un eje no se inclina en el aire/i.test(plano), plano.slice(-320));

  check('la cuña de la primera versión no ha vuelto',
    (await p.evaluate(() => typeof taludTSAT === 'undefined')) === true);

  // ── bifila: DOS filas que son UN seguidor ──
  // Monofila y bifila no cambian la mesa —es operativa, no geométrica— pero sí
  // cambian qué es «un seguidor». La distinción la resuelve el modelo de la
  // casa, el mismo que usa el bt3d: en una bifila solo UNA de las dos vigas
  // lleva el accionamiento (`buildBeam` con west:true — slew completo, TCU,
  // abarcones, antena) y la otra es la GEMELA, la del eje de transmisión, que
  // del slew solo lleva las piezas twin (corona, bracket, soporte).
  const bloque = k => p.evaluate(`(() => {
    const B = BLOQUES.find(b => b.key === ${JSON.stringify(k)});
    const piezas = B.filas.map(u => { let n = 0; u.traverse(o => { if (o.isMesh) n++; }); return n; });
    return { filas: B.filas.length, por: B.porTracker, pitch: +B.pitch.toFixed(2), piezas };
  })()`);
  const mono = await bloque('tracker_hsat');
  check('en monofila cada fila lleva SU accionamiento: todas iguales (' +
    mono.piezas.join('/') + ')',
    mono.por === 1 && mono.piezas.every(n => n === mono.piezas[0]),
    JSON.stringify(mono));

  await pon('tkFilas', 2);
  const bi = await bloque('tracker_hsat');
  check('en bifila el bloque dibuja DOS seguidores enteros (4 filas)',
    bi.filas === 4 && bi.por === 2, JSON.stringify(bi));
  check('y las vigas se alternan motriz/gemela (' + bi.piezas.join('/') + ')',
    bi.piezas[0] === bi.piezas[2] && bi.piezas[1] === bi.piezas[3] &&
    bi.piezas[0] > bi.piezas[1], JSON.stringify(bi.piezas));
  check('la viga MOTRIZ es la misma que la de una monofila: no se le quita nada',
    bi.piezas[0] === mono.piezas[0], JSON.stringify([mono.piezas[0], bi.piezas[0]]));
  // La gemela no es media viga: lleva sus módulos y sus correas, y del slew solo
  // corona, bracket y soporte. Si saliera casi vacía sería otro error.
  check('y la GEMELA conserva módulos y correas, solo pierde el accionamiento',
    bi.piezas[1] > bi.piezas[0] * 0.4 && bi.piezas[1] < bi.piezas[0] * 0.9,
    JSON.stringify(bi.piezas));

  // Y EL EJE que une cada par: la gemela no tiene motor, la mueve la motriz. Va
  // de corona a corona —en el modelo de la casa la corona está en el centro del
  // tubo— y en pendiente tiene que llegar a las DOS cotas, que no son la misma.
  const trans = await p.evaluate(() => {
    const s = (id, v) => { const el = document.getElementById(id); el.value = String(v);
      el.dispatchEvent(new Event('change', { bubbles: true })); };
    const antes = [...document.querySelectorAll('.st')].map(c => c.checked);
    document.querySelectorAll('.st').forEach(c => { c.checked = c.value === 'tracker_hsat'; });
    s('tkFilas', 2); s('pend', 16); s('pendAz', 90);
    const B = BLOQUES[0], g = B.filas[0].parent;
    const ejes = g.children.filter(o => B.filas.indexOf(o) < 0 && o.type === 'Group');
    const out = ejes.map(ej => { ej.updateWorldMatrix(true, true);
      const c = new THREE.Box3().setFromObject(ej);
      /* ¿Llega a las dos coronas? Se mide la distancia de cada corona a la
         CAJA del eje: cero si la toca. Comparar esquina con esquina no vale —
         en pendiente el eje baja, así que su esquina de x mínima es la de y
         MÁXIMA y el emparejamiento depende del signo. */
      const alCorona = B.filas.map(u => {
        const w = u.getWorldPosition(new THREE.Vector3());
        const y = w.y + Seguidor.DIMS.postH;
        const dx = Math.max(c.min.x - w.x, 0, w.x - c.max.x);
        const dy = Math.max(c.min.y - y, 0, y - c.max.y);
        return +Math.hypot(dx, dy).toFixed(2);
      }).sort((a, b) => a - b);
      return { luz: +(c.max.x - c.min.x).toFixed(2), extremos: alCorona.slice(0, 2) };
    });
    document.querySelectorAll('.st').forEach((c, i) => { c.checked = antes[i]; });
    s('tkFilas', 2); s('pend', 0);
    return { n: ejes.length, ejes: out, pitch: +B.pitch.toFixed(2) };
  });
  check('cada par bifila lleva SU eje de transmisión (' + trans.n + ')', trans.n === 2,
    JSON.stringify(eje));
  check('el eje cruza justo un pitch, de una corona a la de al lado (' +
    trans.ejes.map(e => e.luz).join(' / ') + ' con pitch ' + trans.pitch + ')',
    trans.ejes.every(e => e.luz > trans.pitch * 0.9 && e.luz < trans.pitch * 1.1),
    JSON.stringify(trans.ejes));
  check('y en PENDIENTE llega a las dos cotas: sus extremos caen en los tubos',
    trans.ejes.every(e => e.extremos.every(d => d < 0.7)),
    JSON.stringify(trans.ejes.map(e => e.extremos)));

  await pon('tkFilas', 2);
  const fj = await bloque('fija_optima');
  check('la fija no se agrupa aunque el tracker sea bifila',
    fj.por === 1 && fj.filas === 3, JSON.stringify(fj));
  await pon('tkFilas', 1);
  const vuelta = await bloque('tracker_hsat');
  check('volver a monofila deshace el par y devuelve el accionamiento a todas',
    vuelta.filas === mono.filas && vuelta.por === 1 &&
    vuelta.piezas.every(n => n === mono.piezas[0]), JSON.stringify(vuelta));

  // ── una fija no tiene motor ──
  // El hueco entre las mesas de una fila es el MISMO parámetro geométrico en
  // las dos familias, pero no la misma cosa: en un seguidor es el vano del
  // accionamiento y en una fija es separación estructural. Llamarlo «gap
  // motor» en la fija era ponerle a una mesa un motor que no tiene.
  const rotulos = await p.evaluate(() => {
    const lbl = id => document.querySelector(`label[for="${id}"]`) ||
      document.getElementById(id).closest('.field').querySelector('label');
    return { fx: lbl('fxGapMot').textContent, tk: lbl('tkGapMot').textContent,
             notaFx: document.getElementById('fxNota').textContent,
             notaTk: document.getElementById('tkNota').textContent,
             nStrFx: +document.getElementById('fxNStr').value };
  });
  check('el gap de la FIJA no se llama «motor» (' + rotulos.fx.trim() + ')',
    !/motor/i.test(rotulos.fx), rotulos.fx);
  check('el del TRACKER sí, porque ahí va el accionamiento (' + rotulos.tk.trim() + ')',
    /motor/i.test(rotulos.tk), rotulos.tk);
  check('la nota de la FIJA no le pone un motor en medio',
    !/motor en medio/i.test(rotulos.notaFx), rotulos.notaFx.slice(0, 160));
  check('y con más de una mesa dice que ese hueco NO es un vano de motor',
    rotulos.nStrFx <= 1 || /no lleva accionamiento/i.test(rotulos.notaFx),
    rotulos.notaFx.slice(0, 220));
  check('la del TRACKER sí nombra el vano del motor',
    /motor/i.test(rotulos.notaTk), rotulos.notaTk.slice(0, 160));

  // dos mesas por fila es la convención de la casa, no un valor de relleno: un
  // 2 en una casilla editable se lee como «lo que había puesto»
  const conv = await p.evaluate(() => {
    const set = (i, v) => { const e = document.getElementById(i);
      e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
    set('fxNStr', '2');
    const dos = document.getElementById('fxNota').textContent;
    set('fxNStr', '1');
    const una = document.getElementById('fxNota').textContent;
    set('fxNStr', '2');
    return { dos, una };
  });
  check('con dos mesas por fila, la ficha dice que es la convención de la casa',
    /convención de la casa/i.test(conv.dos), conv.dos.slice(-160));
  check('y con una avisa de que lo normal son dos',
    /lo normal en la casa son dos/i.test(conv.una), conv.una.slice(-160));

  // guard anti-podredumbre: la lista de campos es única y tiene que existir
  const huerfanos = await p.evaluate(() =>
    CAMPOS_GEOM.filter(i => !document.getElementById(i)));
  check('ningún campo de geometría apunta a un id que ya no existe',
    huerfanos.length === 0, huerfanos.join(','));

  // ── el catálogo CEC: 16.758 módulos y 4.910 inversores, dentro de la ficha ──
  // Y sobre todo: NO se baja al abrir. Son 2,4 MB + 656 KB, y quien viene a
  // comparar estructuras no tiene por qué pagarlos.
  // el módulo da el tamaño y el pico de las dos familias, así que elegirlo va
  // ANTES: si va después, se teclean unas medidas a mano y el catálogo llega
  // tarde a pisarlas
  const ordenEq = await p.evaluate(() => {
    const top = id => document.getElementById(id).getBoundingClientRect().top + window.scrollY;
    return { sitio: top('sitioQ'), eq: top('eqCard'), fx: top('fxModL'), tk: top('tkModL') };
  });
  check('la tarjeta de Equipos va ANTES que los dos configuradores',
    ordenEq.eq > ordenEq.sitio && ordenEq.eq < ordenEq.fx && ordenEq.eq < ordenEq.tk,
    JSON.stringify(ordenEq));

  check('el catálogo NO se baja al abrir la ficha',
    (await p.evaluate(() => CAT.mod === null && CAT.inv === null)) === true);
  await p.click('#eqCard');
  await p.waitForFunction(() => CAT.mod && CAT.inv, null, { timeout: 90000 });
  await p.waitForTimeout(500);
  const cat = await p.evaluate(() => ({
    mods: CAT.mod.n, invs: CAT.inv.n,
    colsM: CAT.mod.cols.join(','), colsI: CAT.inv.cols.join(','),
    mod: MODSEL && { name: MODSEL.name, wp: MODSEL.wp, L: MODSEL.L, W: MODSEL.W },
    inv: INVSEL && { name: INVSEL.name, paco: INVSEL.paco } }));
  check('el catálogo trae ' + cat.mods + ' módulos y ' + cat.invs + ' inversores',
    cat.mods > 16000 && cat.invs > 4000, JSON.stringify([cat.mods, cat.invs]));
  check('las columnas del catálogo son las que la ficha lee',
    cat.colsM.startsWith('name,mfr,wp,L,W,ns,voc,vmp,isc,imp,beta,gamma') &&
    cat.colsI.startsWith('name,mfr,paco,pdco,vdco,vdcmax,idcmax,mlow,mhigh'),
    cat.colsM + ' | ' + cat.colsI);
  check('se preselecciona un módulo y un inversor viables (' +
    (cat.mod && cat.mod.wp) + ' W)', !!(cat.mod && cat.inv && cat.mod.wp > 0));

  // el filtro de compatibilidad: elegir parejas imposibles no es ayudar
  const compat = await p.evaluate(() => {
    const con = listaModulos().length;
    document.getElementById('mfSoloOk').checked = false;
    const sin = listaModulos().length;
    document.getElementById('mfSoloOk').checked = true;
    return { con, sin };
  });
  check('«solo los que encajan» deja fuera las parejas imposibles (' +
    compat.con + ' de ' + compat.sin + ')',
    compat.con > 0 && compat.con < compat.sin, JSON.stringify(compat));

  // el sizing sale de los dos, y dice QUIÉN limita
  const sz = await p.evaluate(() => ({
    n: +document.getElementById('szN').value,
    txt: document.getElementById('szRead').textContent,
    nota: document.getElementById('szNota').textContent,
    W: FIS.ventana({ voc: MODSEL.voc, vmp: MODSEL.vmp,
      betaVocPct: +document.getElementById('szBeta').value,
      tMin: +document.getElementById('szTmin').value,
      tMax: +document.getElementById('szTmax').value,
      mpptLow: INVSEL.mlow, mpptHigh: INVSEL.mhigh, vdcMax: INVSEL.vdcmax }) }));
  check('el nº de módulos por string cae DENTRO de la ventana (' +
    sz.W.nMin + ' ≤ ' + sz.n + ' ≤ ' + sz.W.nMax + ')',
    sz.n >= sz.W.nMin && sz.n <= sz.W.nMax, JSON.stringify(sz.W));
  check('el sizing publica strings por MPPT y DC/AC',
    /Strings \/ MPPT/.test(sz.txt) && /DC\/AC/.test(sz.txt), sz.txt.slice(0, 160));
  check('y dice QUIÉN limita', /Manda\s+la\s+\w+/i.test(sz.nota), sz.nota.slice(0, 120));

  // elegir un módulo de verdad mueve la comparación de estructuras
  const antesMod = await p.evaluate(() => ({
    wp: +document.getElementById('fxWp').value,
    L: +document.getElementById('fxModL').value }));
  await p.click('#mfAplFx');
  await p.waitForTimeout(400);
  const trasMod = await p.evaluate(() => ({
    wp: +document.getElementById('fxWp').value,
    L: +document.getElementById('fxModL').value,
    tk: +document.getElementById('tkWp').value,
    modsFija: (() => { const B = BLOQUES.find(b => b.key === 'fija_optima');
      return B ? +B.filas[0].position.z.toFixed(2) : null; })() }));
  check('«Usar en la FIJA» trae el pico del módulo del catálogo (' +
    antesMod.wp + ' → ' + trasMod.wp + ' Wp)', trasMod.wp === cat.mod.wp);
  check('y sus dimensiones', Math.abs(trasMod.L - cat.mod.L) < 1e-6,
    trasMod.L + ' vs ' + cat.mod.L);
  check('sin tocar el TRACKER, que tiene su propio módulo', trasMod.tk !== trasMod.wp ||
    cat.mod.wp === 660, String(trasMod.tk));

  // ── los BARRIDOS ──
  // La ficha compara a UNA densidad; el barrido contesta la otra mitad. Lo que
  // se comprueba aquí no es que salga una curva bonita, sino que la curva DICE
  // lo que la geometría obliga y que la ficha no se inventa un ganador donde no
  // lo hay.
  await p.evaluate(() => { document.getElementById('source').value = 'clearsky';
    // los checks de geometría de más arriba dejaron el tracker a pitch 11: se
    // devuelve a 6 para barrer alrededor de donde está configurado
    const tp = document.getElementById('tkPitch');
    tp.value = '6.00'; tp.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('barMin').value = '4.0';
    document.getElementById('barMax').value = '9.0';
    document.getElementById('barPaso').value = '50'; });
  await p.click('#barRun');
  await p.waitForFunction(() => window.BAR !== null, null, { timeout: 240000 });
  await p.waitForTimeout(400);
  const bar = await p.evaluate(() => ({
    tipo: BAR.tipo, n: BAR.puntos.length,
    poas: BAR.puntos.map(q => +q.poa.toFixed(1)),
    suelos: BAR.puntos.map(q => +q.suelo.toFixed(1)),
    has: BAR.puntos.map(q => q.ha && +q.ha.toFixed(2)),
    maxPoa: BAR.maxPoa.pitch, maxSuelo: BAR.maxSuelo.pitch,
    actual: BAR.actual, coste: BAR.costeM1, ahorro: BAR.sueloM1,
    read: document.getElementById('barRead').textContent,
    nota: document.getElementById('barNota').textContent }));
  // las unidades del barrido cambian con lo que se barre: el paso del pitch va
  // en CENTÍMETROS y el del tilt en GRADOS, y un «25» sin unidad se lee mal en
  // las dos direcciones
  const uni = await p.evaluate(() => {
    const leer = () => ['barUniMin', 'barUniMax', 'barUniPaso']
      .map(i => document.getElementById(i).textContent).join('/');
    const q = document.getElementById('barQue');
    q.value = 'pitch:tracker'; q.dispatchEvent(new Event('change', { bubbles: true }));
    const p1 = leer();
    q.value = 'tilt:fija'; q.dispatchEvent(new Event('change', { bubbles: true }));
    const t1 = leer();
    q.value = 'pitch:tracker'; q.dispatchEvent(new Event('change', { bubbles: true }));
    return { pitch: p1, tilt: t1 };
  });
  check('el barrido de pitch dice m/m/cm', uni.pitch === 'm/m/cm', uni.pitch);
  check('y el de tilt °/°/°', uni.tilt === '°/°/°', uni.tilt);

  check('el barrido de pitch corre en el navegador (' + bar.n + ' puntos)',
    bar.tipo === 'pitch' && bar.n === 11, JSON.stringify([bar.tipo, bar.n]));
  check('la POA por módulo sube monótona con el pitch',
    bar.poas.every((v, i) => i === 0 || v >= bar.poas[i - 1] - 1e-6), bar.poas.join(','));
  check('la densidad de suelo baja monótona con el pitch',
    bar.suelos.every((v, i) => i === 0 || v <= bar.suelos[i - 1] + 1e-6), bar.suelos.join(','));
  check('los dos máximos caen en extremos OPUESTOS (' + bar.maxPoa + ' m / ' +
    bar.maxSuelo + ' m)', bar.maxPoa === 9 && bar.maxSuelo === 4);
  check('cada punto trae sus hectáreas a la potencia pico de arriba (' +
    bar.has[0] + ' → ' + bar.has[bar.has.length - 1] + ' ha)',
    bar.has.every(h => h > 0) && bar.has[bar.has.length - 1] > bar.has[0]);
  check('apretar 1 m cuesta POA y ahorra parcela (' + bar.coste.toFixed(2) + ' % / ' +
    bar.ahorro.toFixed(0) + ' %)', bar.coste < 0 && bar.ahorro > 0);
  // y si el pitch configurado cae FUERA del rango barrido, el coste marginal no
  // se publica: contra un extremo clavado saldría 0, que se lee como «gratis»
  const fuera = await p.evaluate(async () => {
    document.getElementById('barMin').value = '7.0';
    document.getElementById('barMax').value = '9.0';
    await barre();
    return { fuera: BAR.fueraDeRango, coste: BAR.costeM1,
             read: document.getElementById('barRead').textContent,
             nota: document.getElementById('barNota').textContent };
  });
  check('con el pitch configurado fuera del rango, el coste marginal no se inventa',
    fuera.fuera === true && !isFinite(fuera.coste) &&
    /FUERA del rango/.test(fuera.read + fuera.nota), JSON.stringify(fuera.coste));

  check('la ficha NO declara un óptimo de pitch, y lo dice',
    /no hay un óptimo/i.test(bar.nota) && !/óptimo de pitch/i.test(bar.read),
    bar.nota.slice(0, 100));
  check('y declara que el tilt se mantiene fijo a lo largo del barrido',
    /tilt se mantiene fijo/i.test(bar.nota));

  // el de tilt SÍ tiene óptimo interior: es lo que lo distingue
  await p.evaluate(() => { const q = document.getElementById('barQue');
    q.value = 'tilt:fija'; q.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('barPaso').value = '10'; });
  await p.click('#barRun');
  await p.waitForFunction(() => window.BAR && BAR.tipo === 'tilt', null, { timeout: 240000 });
  await p.waitForTimeout(400);
  const bt2 = await p.evaluate(() => ({
    n: BAR.puntos.length, opt: BAR.optimo.tilt,
    rels: BAR.puntos.map(q => +q.rel.toFixed(3)),
    read: document.getElementById('barRead').textContent }));
  check('el barrido de tilt corre y da óptimo INTERIOR (' + bt2.opt + '°)',
    bt2.opt > 0 && bt2.opt < 60, JSON.stringify(bt2.opt));
  check('ningún tilt bate al óptimo', bt2.rels.every(r => r <= 1e-9));
  check('y se declara que el óptimo es el de la REJILLA, no el fino',
    /rejilla/i.test(bt2.read), bt2.read.slice(0, 120));

  // ── LAS HINCAS ──
  // Una fila de 65 m sobre uno o dos postes no es una estructura: es un puente,
  // o un balancín. En campo la hinca va cada 4-6 m en una fija y cada 6-9 m en
  // un seguidor —es lo que fija el vano entre rodamientos, y con él el momento y
  // la sección del tubo—. La fija llevaba DOS, una en cada punta; el seguidor,
  // UNA, la del accionamiento.
  const hincas = await p.evaluate(() => {
    document.querySelectorAll('.st').forEach(c => {
      c.checked = ['fija_proyecto', 'tracker_hsat'].includes(c.value); });
    const e = document.getElementById('pend'); e.value = '0';
    e.dispatchEvent(new Event('change', { bubbles: true }));
    const mide = (k, eje) => {
      const B = BLOQUES.find(b => b.key === k), u = B.filas[0];
      const zs = [];
      u.traverse(o => { if (o.isMesh && o.geometry.parameters &&
        Math.abs(o.geometry.parameters.width - 0.18) < 1e-6 &&
        Math.abs(o.geometry.parameters.height - Seguidor.DIMS.postH) < 1e-6)
          zs.push(eje === 'z' ? o.position.z : o.position.x); });
      // la fija las lleva dentro de la mesa: se buscan por su caja
      if (!zs.length) u.traverse(o => { if (o.isMesh && o.geometry.parameters &&
        Math.abs(o.geometry.parameters.width - 0.16) < 1e-6) zs.push(o.position.x); });
      // el seguidor tiene además la hinca del accionamiento en el centro, que la
      // pone el propio modelo (`soporte`): cuenta para el vano
      if (eje === 'z') zs.push(0);
      zs.sort((a, b) => a - b);
      const pasos = zs.slice(1).map((v, i) => +(v - zs[i]).toFixed(2));
      return { n: zs.length, largo: +cfgActual().geomDe(B.spec).largoFila.toFixed(2),
               span: +(zs[zs.length - 1] - zs[0]).toFixed(2), pasos };
    };
    return { fija: mide('fija_proyecto', 'x'), tk: mide('tracker_hsat', 'z') };
  });
  check('la mesa fija lleva hinca cada 4-6 m, no dos en las puntas (' +
    hincas.fija.n + ' en ' + hincas.fija.largo + ' m)',
    hincas.fija.n >= 8 && hincas.fija.pasos.every(d => d <= 6.5),
    JSON.stringify(hincas.fija));
  check('y cubren la fila entera, no un trozo',
    hincas.fija.span > hincas.fija.largo * 0.9, JSON.stringify(hincas.fija.span));
  check('el seguidor lleva hinca cada 6-9 m, no solo la del accionamiento (' +
    hincas.tk.n + ' en ' + hincas.tk.largo + ' m)',
    hincas.tk.n >= 7 && hincas.tk.pasos.every(d => d <= 9),
    JSON.stringify(hincas.tk));
  check('y también de punta a punta del tubo',
    hincas.tk.span > hincas.tk.largo * 0.9, JSON.stringify(hincas.tk.span));

  // ── LOS LIENZOS 2D, NÍTIDOS ──
  // Los width/height de un <canvas> son el BÚFER en píxeles y el CSS lo estira.
  // Estaban fijos en 1.100 y el CSS los ponía al 100 % de la tarjeta, así que en
  // una tarjeta más ancha —o en cualquier pantalla a 2×— el navegador AMPLIABA
  // el dibujo y las letras salían pixeladas. El búfer tiene que ser el tamaño
  // real por el `devicePixelRatio`, ni más ni menos.
  const nitido = await p.evaluate(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return ['cvVent', 'cvBar', 'cvMes', 'cvRank'].map(id => {
      const c = document.getElementById(id);
      return { id, buf: c.width, css: Math.round(c.clientWidth),
               debe: Math.round(Math.round(c.clientWidth) * dpr) };
    });
  });
  check('cada lienzo 2D tiene el búfer que le toca: ni ampliado ni reducido',
    nitido.every(c => c.css > 0 && Math.abs(c.buf - c.debe) <= 1),
    JSON.stringify(nitido));
  // y que no se salgan del lienzo: al pasar a la anchura real, la leyenda del
  // ranking se iba por el borde derecho
  const leyenda = await p.evaluate(() => {
    const c = document.getElementById('cvRank'), g = c.getContext('2d');
    g.font = '11px ui-monospace,monospace';
    const L = Math.min(250, Math.round(c.clientWidth * 0.34));
    const larga = 'sólido: por m² de módulo   ·   translúcido: por m² de suelo (× GCR)';
    const corta = 'sólido: módulo · translúcido: suelo';
    const usa = g.measureText(larga).width > c.clientWidth - L - 6 ? corta : larga;
    return { cabe: L + g.measureText(usa).width <= c.clientWidth, ancho: c.clientWidth };
  });
  check('y la leyenda del ranking cabe en el lienzo (' + leyenda.ancho + ' px)',
    leyenda.cabe === true, JSON.stringify(leyenda));

  // ── las temperaturas del emplazamiento ──
  // El string se dimensiona por los dos extremos térmicos del SITIO. Aquí no
  // hay red al archivo de Open-Meteo, así que se sustituye la bajada por una
  // serie conocida: lo que se comprueba es el CABLEADO —que el botón rellena
  // los dos campos con la convención bankable y lo explica— no la red.
  const temps = await p.evaluate(async () => {
    const real = FIS.fetchYear;
    // 0..100 °C: P0,5 = 0,5 y P99,5 = 99,5, así que célula = 0,5 y 124,5
    FIS.fetchYear = async () => ({ t: [], ghi: [], dhi: [], dni: [],
      tair: Array.from({ length: 101 }, (_, i) => i), source: 'stub' });
    await traeTemps();
    FIS.fetchYear = real;
    return { tmin: +document.getElementById('szTmin').value,
             tmax: +document.getElementById('szTmax').value,
             nota: document.getElementById('szTempsNota').textContent };
  });
  check('el botón trae T mín = P0,5 del aire (' + temps.tmin + ' °C)', temps.tmin === 0.5,
    String(temps.tmin));
  check('y T máx = P99,5 + 25 °C de delta de célula (' + temps.tmax + ' °C)',
    temps.tmax === 124.5, String(temps.tmax));
  check('y explica de dónde salen (percentiles y delta, no extremos absolutos)',
    /P0,5/.test(temps.nota) && /P99,5/.test(temps.nota) && /25 °C/.test(temps.nota),
    temps.nota.slice(0, 200));

  // cambiar de sitio invalida lo traído: seguir enseñando las de antes es peor
  // que no enseñar nada
  const inval = await p.evaluate(() => {
    const e = document.getElementById('lat');
    e.value = '60.0'; e.dispatchEvent(new Event('change', { bubbles: true }));
    return document.getElementById('szTempsNota').textContent;
  });
  check('cambiar el emplazamiento avisa de que las temperaturas son las de antes',
    /las de/i.test(inval) && /antes/i.test(inval), inval.slice(0, 160));

  // ── que se NOTE que los botones han hecho algo ──
  // Cambiaban un campo de 660 a 645 y nada más: con un módulo cuyas medidas
  // caen en las canónicas, la pantalla no se movía y el botón parecía muerto.
  const modAntes = await p.evaluate(() => document.getElementById('tkMod').textContent);
  check('una familia sin módulo del catálogo dice que está tecleado a mano',
    /a mano/i.test(modAntes), modAntes.slice(0, 120));
  await p.click('#mfAplFx');
  await p.waitForTimeout(400);
  const modTras = await p.evaluate(() => ({
    fx: document.getElementById('fxMod').textContent,
    tk: document.getElementById('tkMod').textContent,
    nombre: MODSEL.name }));
  check('tras «Usar en la FIJA», la fija DICE qué módulo lleva',
    modTras.fx.indexOf(modTras.nombre) >= 0 && /Wp/.test(modTras.fx), modTras.fx.slice(0, 140));
  check('y declara si las medidas son del catálogo o las canónicas',
    /catálogo|canónicas/i.test(modTras.fx), modTras.fx.slice(0, 140));
  check('el TRACKER sigue diciendo que el suyo es a mano', /a mano/i.test(modTras.tk),
    modTras.tk.slice(0, 120));
  const modMano = await p.evaluate(() => {
    const e = document.getElementById('fxModL');
    e.value = '2.100'; e.dispatchEvent(new Event('input', { bubbles: true }));
    return document.getElementById('fxMod').textContent;
  });
  check('tocar las medidas a mano deshace la marca (no se llama «AEG» a otro módulo)',
    /a mano/i.test(modMano), modMano.slice(0, 120));

  // ── el string del sizing baja a los configuradores ──
  // «Módulos por string» está en dos sitios y significa lo mismo: si dicen
  // cosas distintas, hay una fila dibujada que no se puede conectar.
  const coh = await p.evaluate(() => {
    const lat = document.getElementById('lat');
    lat.value = '37.3891'; lat.dispatchEvent(new Event('change', { bubbles: true }));
    const ml = document.getElementById('fxModL');
    ml.value = '2.382'; ml.dispatchEvent(new Event('change', { bubbles: true }));
    [['szTmin', '-10'], ['szTmax', '70']].forEach(([i, v]) => {
      const e = document.getElementById(i);
      e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); });
    document.getElementById('fxModsStr').value = '28';
    document.getElementById('fxModsStr').dispatchEvent(new Event('change', { bubbles: true }));
    return { n: +document.getElementById('szN').value,
             fx: +document.getElementById('fxModsStr').value,
             txt: document.getElementById('szCoherencia').textContent };
  });
  check('con el configurador y el sizing en desacuerdo, la ficha lo DICE (' +
    coh.fx + ' vs ' + coh.n + ')', coh.n !== coh.fx && /sizing dice/i.test(coh.txt),
    coh.txt.slice(0, 180));
  const tras = await p.evaluate(() => {
    document.getElementById('szAplFx').click();
    return { fx: +document.getElementById('fxModsStr').value,
             n: +document.getElementById('szN').value,
             txt: document.getElementById('szCoherencia').textContent };
  });
  check('el botón baja el string del sizing a la FIJA (' + coh.fx + ' → ' + tras.fx + ')',
    tras.fx === tras.n, JSON.stringify(tras));
  const ok2 = await p.evaluate(() => {
    document.getElementById('szAplTk').click();
    return { tk: +document.getElementById('tkModsStr').value,
             fx: +document.getElementById('fxModsStr').value,
             n: +document.getElementById('szN').value,
             txt: document.getElementById('szCoherencia').textContent };
  });
  check('y al TRACKER', ok2.tk === ok2.n, JSON.stringify(ok2));
  check('con los dos de acuerdo, lo dice en verde', /✓/.test(ok2.txt), ok2.txt.slice(0, 120));

  check('sin errores de JS', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log('\n' + (ko ? 'FALLOS: ' + ko + ' (de ' + (ok + ko) + ')' : 'OK — ' + ok + '/' + ok + ' comprobaciones'));
  process.exit(ko ? 1 : 0);
})();
