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
  check('se ve desde que se abre, sin comparar nada',
    (await p.evaluate(() => BLOQUES.length)) === 2);

  // marcar las seis
  for (const c of await p.$$('.st')) if (!(await c.isChecked())) await c.check();
  await p.waitForTimeout(600);
  check('un bloque por estructura marcada',
    (await p.evaluate(() => BLOQUES.length)) === 6);

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

  check('sin errores de JS', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log('\n' + (ko ? 'FALLOS: ' + ko + ' (de ' + (ok + ko) + ')' : 'OK — ' + ok + '/' + ok + ' comprobaciones'));
  process.exit(ko ? 1 : 0);
})();
