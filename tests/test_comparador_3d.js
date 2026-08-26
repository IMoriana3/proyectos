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
  // el del TSAT, además, SUBE hacia el ecuador
  check('el eje del TSAT sube hacia el ecuador (y=' + md.bloques.tracker_tsat.eje.y.toFixed(3) + ')',
    Math.abs(md.bloques.tracker_tsat.eje.y) > 0.1);

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

  // ── el eje inclinado, sobre TERRENO EN PENDIENTE ──
  // Dos intentos fallidos antes de esto: una cuña bajo el bloque (se leía como
  // una rampa de hormigón) y el suelo plano con la hinca alargada (un tracker
  // con megasoportes a un lado, que no es lo que se construye). Lo que hace
  // falta es terreno, y se hace como en bt3d: heightfield subdividido con
  // `computeVertexNormals()`, que es lo que hace que la luz varíe de forma
  // continua en vez de salir por caras.
  const rel = await p.evaluate(() => {
    const cotas = () => { const pos = TD.suelo.geometry.attributes.position;
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i);
        lo = Math.min(lo, y); hi = Math.max(hi, y); }
      return { lo: +lo.toFixed(2), hi: +hi.toFixed(2), n: pos.count }; };
    // Cuánto sobresale la estructura por DEBAJO del terreno que tiene bajo sus
    // pies. Contra el cero absoluto ya no vale: la bancada baja por un lado, y
    // seguir el terreno hacia abajo es exactamente lo que tiene que hacer.
    const bajo = k => { const B = BLOQUES.find(b => b.key === k); let d = 1e9;
      B.filas.forEach(u => { const c = new THREE.Box3().setFromObject(u);
        // el punto más bajo del TERRENO bajo su huella: un eje inclinado baja
        // por el sur, y ahí es donde su caja toca más abajo
        let t = 1e9;
        for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++)
          t = Math.min(t, cotaTerreno(c.min.x + (c.max.x - c.min.x) * i / 8,
                                      c.min.z + (c.max.z - c.min.z) * j / 8, RAMPAS_3D));
        d = Math.min(d, c.min.y - t); });
      return +d.toFixed(2); };
    const poste = k => { const B = BLOQUES.find(b => b.key === k); let h = 0;
      B.filas[0].children.forEach(o => { if (o.isMesh) {
        const c = new THREE.Box3().setFromObject(o); h = +(c.max.y - c.min.y).toFixed(2); } });
      return h; };
    // con TSAT marcado
    document.querySelectorAll('.st').forEach(c => {
      c.checked = ['tracker_tsat', 'tracker_hsat'].includes(c.value); });
    construyeMundo(); actualiza3D();
    // la pendiente MEDIDA del terreno bajo el bloque del eje inclinado: se
    // sondea la cota a dos alturas de z en su vertical
    const gradZ = () => {
      const B = BLOQUES.find(b => b.key === 'tracker_tsat');
      const x = B.filas[0].parent.position.x;
      const h = z => cotaTerreno(x, z, RAMPAS_3D);
      const dz = 10;
      return +(Math.atan2(h(-dz) - h(dz), 2 * dz) * 180 / Math.PI).toFixed(2);
    };
    const con = { cotas: cotas(), pendMedida: gradZ(),
                  tsat: bajo('tracker_tsat'), hsat: bajo('tracker_hsat'),
                  pT: poste('tracker_tsat'), pH: poste('tracker_hsat'),
                  suave: TD.suelo.geometry.attributes.normal &&
                         TD.suelo.geometry.attributes.normal.count };
    // sin TSAT: el suelo tiene que volver a ser llano
    document.querySelectorAll('.st').forEach(c => { c.checked = c.value === 'tracker_hsat'; });
    construyeMundo(); actualiza3D();
    const sin = cotas();
    const axTilt = +document.getElementById('axtilt').value;
    const largo = cfgActual().tracker.largoFila;
    document.querySelectorAll('.st').forEach(c => {
      c.checked = ['fija_optima', 'fija_proyecto', 'fija_ew',
                   'tracker_hsat', 'tracker_hsat_nobt', 'tracker_tsat'].includes(c.value); });
    construyeMundo(); actualiza3D();
    return { con, sin, axTilt, largo };
  });
  check('el suelo lleva relieve donde hay eje inclinado (' + rel.con.cotas.hi + ' m)',
    rel.con.cotas.hi > 1 && rel.con.cotas.lo < -1, JSON.stringify(rel.con.cotas));
  // La bancada está CENTRADA en el cero: sube por un lado lo mismo que baja por
  // el otro. Cuando se levantaba entera hasta apoyar su punto más bajo en el
  // cero, cada bloque quedaba sobre un cerro de distinta altura — y seis cerros
  // distintos no se leen como «la misma pendiente para todas».
  check('y la bancada está centrada en el cero, no levantada sobre un cerro (' +
    rel.con.cotas.lo + ' … ' + rel.con.cotas.hi + ' m)',
    Math.abs(rel.con.cotas.hi + rel.con.cotas.lo) < Math.abs(rel.con.cotas.hi) * 0.35,
    JSON.stringify(rel.con.cotas));
  check('y la PENDIENTE del terreno bajo el eje inclinado es la del eje (' +
    rel.con.pendMedida + '° vs ' + rel.axTilt + '°)',
    Math.abs(Math.abs(rel.con.pendMedida) - rel.axTilt) < 0.6,
    rel.con.pendMedida + ' vs ' + rel.axTilt);
  check('es un heightfield, no dos triángulos (' + rel.con.cotas.n + ' vértices)',
    rel.con.cotas.n > 5000, String(rel.con.cotas.n));
  check('con las normales recalculadas, que es lo que lo hace parecer terreno',
    rel.con.suave === rel.con.cotas.n, String(rel.con.suave));
  check('sin eje inclinado, el suelo vuelve a ser llano',
    rel.sin.hi === 0 && rel.sin.lo === 0, JSON.stringify(rel.sin));
  check('el eje inclinado no se hunde EN EL TERRENO (' + rel.con.tsat + ' m sobre su cota)',
    rel.con.tsat >= -0.01, String(rel.con.tsat));
  check('y NO lleva megasoportes: su hinca mide lo mismo que la del horizontal (' +
    rel.con.pT + ' vs ' + rel.con.pH + ' m)',
    Math.abs(rel.con.pT - rel.con.pH) < 0.01, JSON.stringify([rel.con.pT, rel.con.pH]));
  // «¿por qué solo esa estructura tiene pendiente?» — porque es la única que
  // la declara. Si hay que preguntarlo, es que no estaba dicho.
  const porQue = await p.evaluate(() => document.getElementById('escNote').textContent);
  const plano = porQue.replace(/\s+/g, ' ');
  check('la escena dice que la pendiente se aplica a las TRES familias',
    /las TRES familias/i.test(plano) && /en igualdad/i.test(plano), plano.slice(-420));
  check('y que cada una la lleva en SU dirección',
    /la fija apila hacia el sur/i.test(plano) && /hacia el este/i.test(plano), plano.slice(-420));
  // «esto no es tener la misma pendiente»: es la pregunta que se hace cualquiera
  // al ver el terreno girado en cada bloque, y tiene respuesta geométrica.
  check('y POR QUÉ no puede ser un plano único: las filas son perpendiculares',
    /no es un plano único/i.test(plano) && /perpendiculares/i.test(plano),
    plano.slice(-520));
  check('y que el eje inclinado lleva además la del eje',
    /un eje no se inclina en el aire/i.test(plano), plano.slice(-420));
  check('y que las hincas son verticales: la fija no se inclina con el terreno',
    /hincas son verticales/i.test(plano) && /se replantea sobre él/i.test(plano),
    plano.slice(-260));

  // ── la pendiente del emplazamiento, para TODAS ──
  // Es lo que hace que la comparación sea en igualdad: la misma pendiente ⊥ a
  // las filas para las tres familias, cada una en SU dirección de pitch.
  const pend = await p.evaluate(() => {
    const set = v => { const e = document.getElementById('pend');
      e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); };
    const grad = (k, eje) => {
      const B = BLOQUES.find(b => b.key === k);
      const x = B.filas[0].parent.position.x;
      const h = (dx, dz) => cotaTerreno(x + dx, dz, RAMPAS_3D);
      const d = 8;
      return eje === 'x' ? +(Math.atan2(h(-d, 0) - h(d, 0), 2 * d) * 180 / Math.PI).toFixed(2)
                         : +(Math.atan2(h(0, -d) - h(0, d), 2 * d) * 180 / Math.PI).toFixed(2);
    };
    document.querySelectorAll('.st').forEach(c => { c.checked = true; });
    set(0); construyeMundo();
    const cero = { fijaZ: grad('fija_optima', 'z'), tkX: grad('tracker_hsat', 'x') };
    set(8); construyeMundo();
    const ocho = { fijaZ: grad('fija_optima', 'z'), fijaX: grad('fija_optima', 'x'),
                   tkX: grad('tracker_hsat', 'x'), tkZ: grad('tracker_hsat', 'z'),
                   nota: document.getElementById('pendNota').textContent };
    set(0); construyeMundo(); actualiza3D();
    return { cero, ocho };
  });
  check('sin pendiente, el terreno de la fija y del seguidor es llano',
    pend.cero.fijaZ === 0 && pend.cero.tkX === 0, JSON.stringify(pend.cero));
  check('con 8°, la FIJA la lleva en su dirección de pitch (N-S): ' + pend.ocho.fijaZ + '°',
    Math.abs(Math.abs(pend.ocho.fijaZ) - 8) < 0.6 && pend.ocho.fijaX === 0,
    JSON.stringify(pend.ocho));
  check('y el SEGUIDOR en la suya (E-O): ' + pend.ocho.tkX + '°',
    Math.abs(Math.abs(pend.ocho.tkX) - 8) < 0.6 && pend.ocho.tkZ === 0,
    JSON.stringify(pend.ocho));
  check('y el campo dice el porcentaje y hacia dónde cae',
    /%/.test(pend.ocho.nota) && /más BAJA|más ALTA/.test(pend.ocho.nota),
    pend.ocho.nota);
  // que la pendiente es UNA y la misma para las tres es el sentido del
  // parámetro; si no se dice, el terreno subiendo en direcciones distintas se
  // lee como tres pendientes distintas
  check('y que es LA MISMA para las tres, que es lo que iguala la comparación',
    /la misma para las tres/i.test(pend.ocho.nota) &&
    /iguala la comparación/i.test(pend.ocho.nota), pend.ocho.nota);

  // ── «esto no es tener la misma pendiente» ──
  // Lo era —cada bancada llevaba los grados tecleados ⊥ a SUS filas— pero no se
  // veía: cada bloque se levantaba entero hasta apoyar su punto más bajo en el
  // cero, así que cada uno quedaba sobre un cerro de distinta altura y con
  // meseta arriba (el `tope`), y la ladera se estiraba hasta el borde del mapa
  // porque solo estaba acotada en X. Lo que se exige ahora es lo que hace que
  // se LEA como una sola pendiente: mismos grados, misma cota central, bancadas
  // acotadas por los cuatro lados y sin solaparse con la vecina.
  const misma = await p.evaluate(() => {
    const e = document.getElementById('pend');
    e.value = '12'; e.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelectorAll('.st').forEach(c => { c.checked = true; });
    construyeMundo(); actualiza3D();
    const d = 6, h = (x, z) => cotaTerreno(x, z, RAMPAS_3D);
    const g = (x, z, eje) => +(Math.atan2(
      eje === 'x' ? h(x - d, z) - h(x + d, z) : h(x, z - d) - h(x, z + d),
      2 * d) * 180 / Math.PI).toFixed(2);
    const xs = BLOQUES.map(B => B.filas[0].parent.position.x);
    const bl = BLOQUES.map((B, i) => ({
      k: B.key, x: +xs[i].toFixed(1), cen: +h(xs[i], 0).toFixed(3),
      // ⊥ a SUS filas: la fija apila al sur (Z), el seguidor y las dos aguas
      // al este (X)
      cruz: B.spec.fam === 'fija' && !/ew$/.test(B.key) ? g(xs[i], 0, 'z')
                                                       : g(xs[i], 0, 'x') }));
    // El terreno NO puede ser en ningún punto más inclinado que lo tecleado:
    // si dos bancadas se solapasen sus pendientes se sumarían, y si el fundido
    // fuese más corto que la bancada la vuelta al llano saldría en escalón.
    let peor = 0, dondeX = 0;
    for (let x = xs[0] - 120; x <= xs[xs.length - 1] + 120; x += 3)
      for (let z = -140; z <= 140; z += 6) {
        const gg = Math.max(Math.abs(g(x, z, 'x')), Math.abs(g(x, z, 'z')));
        if (gg > peor) { peor = gg; dondeX = +x.toFixed(0); }
      }
    const entre = [];
    for (let i = 1; i < xs.length; i++)
      entre.push(+cotaTerreno((xs[i - 1] + xs[i]) / 2, 0, RAMPAS_3D).toFixed(3));
    const medios = { peor: +peor.toFixed(2), dondeX, entre };
    // lejos hacia el norte, fuera de la huella: el terreno tiene que haber
    // vuelto al llano, no seguir subiendo
    const lejos = +h(xs[0], -400).toFixed(2);
    e.value = '0'; e.dispatchEvent(new Event('change', { bubbles: true }));
    return { bl, medios, lejos };
  });
  check('las SEIS estructuras llevan los mismos 12° ⊥ a sus filas',
    misma.bl.length === 6 && misma.bl.every(b => Math.abs(Math.abs(b.cruz) - 12) < 0.6),
    JSON.stringify(misma.bl.map(b => b.k + ':' + b.cruz)));
  check('y las seis arrancan de la MISMA cota: ninguna sobre un cerro más alto',
    misma.bl.every(b => Math.abs(b.cen) < 0.01),
    JSON.stringify(misma.bl.map(b => b.k + ':' + b.cen)));
  // El fundido que devuelve la bancada al llano es la única franja más
  // inclinada que lo tecleado, y por poco: un `smoothstep` de la misma longitud
  // algo más corto que la bancada pica en torno a 1,9× en su punto medio. Lo que NO puede pasar es que
  // dos bancadas se solapen —ahí las pendientes se sumarían y el terreno bajo
  // una estructura ya no sería el tecleado— ni que haya un escalón.
  check('y en ningún punto el terreno se dispara: nada de bancadas solapadas ' +
    'ni escalones (peor: ' + misma.medios.peor + '°, y lo tecleado son 12°)',
    misma.medios.peor <= 12 * 2, JSON.stringify(misma.medios));
  check('a media distancia entre dos bancadas el terreno está en la cota común',
    misma.medios.entre.every(c => Math.abs(c) < 0.01), JSON.stringify(misma.medios.entre));
  check('y la ladera NO se estira hasta el borde del mapa (' + misma.lejos + ' m a 400 m)',
    Math.abs(misma.lejos) < 0.01, String(misma.lejos));

  check('la cuña de la primera versión no ha vuelto',
    (await p.evaluate(() => typeof taludTSAT === 'undefined')) === true);

  // ── bifila: DOS filas que son UN seguidor, con su transmisión ──
  // Monofila y bifila no cambian la mesa —es operativa, no geométrica— pero sí
  // cambian qué es «un seguidor». Sin dibujar el accionamiento compartido, dos
  // filas de una bifila y dos monofilas se ven idénticas: justo la distinción
  // que la palabra nombra.
  const bloque = k => p.evaluate(`(() => {
    const B = BLOQUES.find(b => b.key === ${JSON.stringify(k)});
    const g = B.filas[0].parent;
    const ejes = g.children
      .filter(o => B.filas.indexOf(o) < 0 && o.type === 'Group' && o.children.length === 4)
      .map(e => { const c = new THREE.Box3().setFromObject(e);
                  return { x0: +c.min.x.toFixed(2), x1: +c.max.x.toFixed(2) }; })
      .sort((a, b) => a.x0 - b.x0);
    return { filas: B.filas.length, por: B.porTracker, pitch: +B.pitch.toFixed(2), ejes };
  })()`);
  const mono = await bloque('tracker_hsat');
  check('en monofila hay ' + mono.filas + ' filas y ninguna transmisión',
    mono.por === 1 && mono.ejes.length === 0, JSON.stringify(mono));

  await pon('tkFilas', 2);
  const bi = await bloque('tracker_hsat');
  check('en bifila el bloque dibuja DOS seguidores enteros (4 filas)',
    bi.filas === 4 && bi.por === 2, JSON.stringify(bi));
  check('cada seguidor bifila lleva SU transmisión (' + bi.ejes.length + ')',
    bi.ejes.length === 2, JSON.stringify(bi.ejes));
  const luz = bi.ejes.map(e => e.x1 - e.x0);
  check('la transmisión cruza justo un pitch, de una fila a la otra (' +
    luz.map(v => v.toFixed(2)).join(' / ') + ' con pitch ' + bi.pitch + ')',
    luz.every(v => v > bi.pitch * 0.98 && v < bi.pitch * 1.12));
  // el hueco del medio NO lleva barra: esas dos filas son de seguidores distintos
  check('entre los dos seguidores no hay transmisión (' +
    (bi.ejes[1].x0 - bi.ejes[0].x1).toFixed(2) + ' m de hueco)',
    bi.ejes[1].x0 - bi.ejes[0].x1 > bi.pitch * 0.85);
  const fj = await bloque('fija_optima');
  check('la fija no se agrupa aunque el tracker sea bifila',
    fj.por === 1 && fj.ejes.length === 0 && fj.filas === 3, JSON.stringify(fj));
  await pon('tkFilas', 1);
  const vuelta = await bloque('tracker_hsat');
  check('volver a monofila deshace el par', vuelta.filas === mono.filas &&
    vuelta.por === 1 && vuelta.ejes.length === 0, JSON.stringify(vuelta));

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
