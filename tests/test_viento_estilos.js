// LOS TRES ESTILOS DE LA ESCENA: CAMBIAN QUÉ SE ENSEÑA, NO LO QUE PASA.
//
// `ambiente.js` da a la escena 3D tres estilos —natural, maqueta, energía— y un
// selector. Lo que este banco fija no es «hay tres botones»: es la promesa que
// hace que el selector sea inofensivo, y cada cláusula tiene su comprobación.
//
//   · ningún estilo mueve un seguidor: los ángulos pintados son los mismos en
//     los tres, con la misma entrada;
//   · el color de cada ESTRATEGIA (el pilar de su bloque) es el de la leyenda
//     en los tres — es un color que significa;
//   · el ESTADO manda: en «energía» una mesa abanderada enseña el color de su
//     modo y no el ámbar;
//   · y el ámbar no es decoración: ordena los bloques por la POA que la página
//     le pasa. Con dos bloques a 800 y 200 W/m², el de 200 tiene que brillar
//     menos. Si brillasen igual, el estilo no estaría enseñando nada.
//
// Y la otra mitad: sin `ambiente.js` la ficha se dibuja como antes de existir.
// Es lo que dice su cabecera, y un fichero compartido que al faltar deja la
// escena en blanco sería peor que no tenerlo.
//
// MUTANTES (2026-11-10, aplicados sobre el fichero y restaurados por contenido):
//   brillo fijo en vez de por POA ............ predicho 2 · caen 2
//   el ámbar pisa el color de estado ......... predicho 1 · caen 1
//   el pilar deja de registrarse como señal .. predicho 3 · caen 3
//   corrientes hacia donde VIENE el viento ... predicho 2 · caen 2
//   la maqueta deja sombra también en el suelo predicho 1 · caen 1
//   el estilo no se guarda ................... predicho 1 · caen 1
// El último no fue un invento: `ambiente.js` nació sin poder guardar nada —su
// `root` no existía dentro de la factoría y el try/catch se lo callaba— y la
// comprobación de recarga fue la que lo sacó.
//
// LÍMITE: esto mira materiales, luces y banderas de la escena, no píxeles. Que
// cada estilo se VEA bien se comprobó a ojo sobre capturas (2026-11-10) y
// sigue siendo de quien abre la ficha.
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');

const BASE = process.env.BASE_URL || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (x ? ' -> ' + x : '')); } };

// Una escena de comparativa pintada a mano: no depende de la meteo ni del reloj.
// El último bloque va a 200 W/m² y el segundo, abanderado.
const PINTA = `(() => {
  const ks = ESC.bloques.map(b => b.k), ang = {}, modos = {}, poa = {};
  ks.forEach((k, i) => { ang[k] = -20 + 7 * i; modos[k] = 'IDLE'; poa[k] = 800; });
  modos[ks[1]] = 'FULL_STOW'; poa[ks[ks.length - 1]] = 200;
  pintaEscena(ang, modos, poa, 800);
  return ks;
})()`;
const LEE = `(() => ({
  estilo: TD.est ? TD.est.nombre() : null,
  estado: TD.est ? TD.est.estado() : null,
  suelo: { tipo: TD.suelo.material.type, mapa: !!TD.suelo.material.map, sombra: TD.suelo.receiveShadow },
  tinta: (() => { let v = false; TD.sc.traverse(o => { if (o.material && o.material.type === 'ShadowMaterial' && o.visible) v = true; }); return v; })(),
  mapaMesa: (() => { const m = ESC.bloques[0].mats.glass.map; return m ? m.uuid : null; })(),
  cielo: (() => { const d = TD.skyCv.getContext('2d').getImageData(1, 2, 1, 1).data; return (d[0] + d[1] + d[2]) / 3; })(),
  bloques: ESC.bloques.map(b => ({ k: b.k,
    ang: b.segs.map(t => +t.spin.rotation.x.toFixed(6)),
    em: b.mats.glass.emissive.getHex(), ei: +b.mats.glass.emissiveIntensity.toFixed(4),
    mapa: !!b.mats.glass.map, col: b.mats.glass.color.getHex(),
    pilar: b.barra.material.color.getHex(), pilarEm: b.barra.material.emissiveIntensity,
    pilarEnv: b.barra.material.envMapIntensity })),
}))()`;

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.TD && window.ESC && ESC.kind === 'cmp' && ESC.bloques.length >= 3, null, { timeout: 120000 });
  const estilo = async n => { await page.click('[data-ambiente="selector"] [data-estilo="' + n + '"]'); await page.evaluate(PINTA); return page.evaluate(LEE); };

  // ── el selector ──────────────────────────────────────────────────────────
  const botones = await page.$$eval('[data-ambiente="selector"] [data-estilo]', bs => bs.map(b => b.getAttribute('data-estilo')));
  check('la escena trae el selector con los TRES estilos', botones.join(',') === 'natural,maqueta,energia', botones.join(','));
  await page.evaluate(PINTA);
  const ini = await page.evaluate(LEE);
  check('sin elección guardada, arranca en «natural»', ini.estilo === 'natural', ini.estilo);

  // ── natural ──────────────────────────────────────────────────────────────
  const nat = await estilo('natural');
  check('natural: el suelo lleva grano y recibe la sombra', nat.suelo.mapa && nat.suelo.sombra, JSON.stringify(nat.suelo));
  check('natural: la mesa del modelo lleva células', nat.bloques.every(b => b.mapa), JSON.stringify(nat.bloques.map(b => b.mapa)));
  check('natural: no hay plano de tinta', nat.tinta === false);

  // ── maqueta ──────────────────────────────────────────────────────────────
  const maq = await estilo('maqueta');
  check('maqueta: el botón cambia el estilo', maq.estilo === 'maqueta', maq.estilo);
  check('maqueta: el suelo es papel (sin luz ni grano) y la sombra NO se dibuja en él', maq.suelo.tipo === 'MeshBasicMaterial' && !maq.suelo.mapa && maq.suelo.sombra === false, JSON.stringify(maq.suelo));
  check('maqueta: la sombra va en su plano de tinta', maq.tinta === true);
  // v0.3.0 de ambiente.js: la maqueta DIBUJA cada módulo (grafito con el marco a lápiz), así que la mesa
  // lleva textura —la suya, no la de células del natural— sobre material blanco
  check('maqueta: mesas de grafito con el módulo dibujado (textura propia, distinta de las células del natural)',
        maq.bloques.every(b => b.mapa && b.col === 0xffffff) && maq.mapaMesa !== nat.mapaMesa, JSON.stringify({ maq: maq.mapaMesa, nat: nat.mapaMesa }));
  check('maqueta: el cielo es claro', maq.cielo > 190, 'luminancia ' + maq.cielo);

  // ── energía ──────────────────────────────────────────────────────────────
  const ene = await estilo('energia');
  const ks = ene.bloques.map(b => b.k), ult = ene.bloques[ene.bloques.length - 1], pri = ene.bloques[0], aban = ene.bloques[1];
  // ámbar = (1 · 0,62 · 0,10): se compara por canal, que el redondeo del último bit no es el asunto
  const esAmbar = h => (h >> 16) === 0xff && Math.abs(((h >> 8) & 0xff) - 158) <= 1 && Math.abs((h & 0xff) - 25) <= 1;
  check('energía: el cielo es oscuro', ene.cielo < 40, 'luminancia ' + ene.cielo);
  check('energía: una mesa en seguimiento BRILLA en ámbar', esAmbar(pri.em) && pri.ei > 0.5, pri.em.toString(16) + ' · ' + pri.ei);
  check('energía: el bloque a 200 W/m² brilla MENOS que el de 800', ult.ei < pri.ei - 0.3, ult.ei + ' vs ' + pri.ei);
  check('energía: y su brillo es el que toca a su POA relativa (200/800)', Math.abs(ult.ei - (0.08 + 0.92 * 0.25)) < 0.002, String(ult.ei));
  const modo = await page.evaluate(() => ({ col: MODO_COL.FULL_STOW, int: MODO_INT.FULL_STOW }));
  check('energía: la mesa ABANDERADA enseña el color de su modo, no el ámbar', aban.em === modo.col && Math.abs(aban.ei - modo.int) < 1e-6, aban.em.toString(16) + ' · ' + aban.ei);

  // ── lo que ningún estilo toca ────────────────────────────────────────────
  const A = x => JSON.stringify(x.bloques.map(b => b.ang));
  check('los ángulos pintados son LOS MISMOS en los tres estilos', A(nat) === A(maq) && A(maq) === A(ene), A(nat).slice(0, 80));
  check('y no son triviales: los bloques tienen ángulos distintos', new Set(nat.bloques.map(b => b.ang[0])).size >= 3);
  const P = x => x.bloques.map(b => b.pilar).join(',');
  check('el color de cada estrategia es el mismo en los tres', P(nat) === P(maq) && P(maq) === P(ene), P(nat));
  check('los pilares no reflejan el cielo en ningún estilo', [nat, maq, ene].every(x => x.bloques.every(b => b.pilarEnv === 0)));
  check('en «energía» el pilar se sostiene con su propia luz', ene.bloques.every((b, i) => b.pilarEm > nat.bloques[i].pilarEm));
  check('los pilares están registrados como señal, uno por bloque', ene.estado.senales === ks.length, ene.estado.senales + ' vs ' + ks.length);

  // ── volver a natural no deja rastro ──────────────────────────────────────
  const vuelta = await estilo('natural');
  check('de vuelta en «natural», ninguna mesa en seguimiento conserva el ámbar', vuelta.bloques.filter((b, i) => i !== 1).every(b => b.ei === 0), JSON.stringify(vuelta.bloques.map(b => b.ei)));
  check('y la abanderada sigue con su color de modo', vuelta.bloques[1].em === modo.col);

  // ── el viento que se ve es el que se simula ──────────────────────────────
  const v1 = await page.evaluate(() => { ponSol(35, 180, 10, 270); return TD.est.estado(); });
  check('con 10 m/s del oeste hay corrientes y van HACIA el este', v1.corrientes && v1.viento.dx > 0.99 && Math.abs(v1.viento.dz) < 0.01 && v1.viento.ms === 10, JSON.stringify(v1.viento));
  const v2 = await page.evaluate(() => { ponSol(35, 180, 10, 0); return TD.est.estado(); });
  check('del norte: van hacia el sur (+Z)', v2.viento.dz > 0.99 && Math.abs(v2.viento.dx) < 0.01, JSON.stringify(v2.viento));
  const v3 = await page.evaluate(() => { ponSol(35, 180, 0, 270); return TD.est.estado(); });
  check('en calma no se dibuja ninguna', v3.corrientes === false);

  // ── el estilo se recuerda ────────────────────────────────────────────────
  await page.click('[data-ambiente="selector"] [data-estilo="maqueta"]');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.TD && TD.est, null, { timeout: 120000 });
  check('al recargar, la escena vuelve en el estilo elegido', await page.evaluate(() => TD.est.nombre()) === 'maqueta');
  check('ninguna excepción con el fichero cargado', errores.length === 0, errores.join(' | '));

  // ── en pantalla táctil, sin reflejos ─────────────────────────────────────
  check('en escritorio los reflejos de cielo están encendidos', (await page.evaluate(() => [Ambiente.enMovil(), TD.est.estado().entorno.ok])).join() === 'false,true');
  const ctxM = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 420, height: 800 } }), pm = await ctxM.newPage();
  await pm.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await pm.waitForFunction(() => window.TD && TD.est, null, { timeout: 120000 });
  const mov = await pm.evaluate(() => ({ movil: Ambiente.enMovil(), ent: TD.est.estado().entorno, env: !!TD.sc.environment }));
  check('en táctil se apagan, y la escena lo dice', mov.movil === true && mov.ent.ok === false && mov.ent.motivo === 'apagado' && mov.env === false, JSON.stringify(mov));
  await ctxM.close();

  // ── sin ambiente.js: como antes de existir ───────────────────────────────
  const ctx2 = await browser.newContext(), p2 = await ctx2.newPage(), err2 = [];
  p2.on('pageerror', e => err2.push(String(e)));
  await p2.route('**/ambiente.js', r => r.abort());
  await p2.goto(BASE + '/sim-viento.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => window.TD && window.ESC && ESC.kind === 'cmp' && ESC.bloques.length >= 3, null, { timeout: 120000 });
  const sin = await p2.evaluate(() => ({ est: TD.est, sel: !!document.querySelector('[data-ambiente="selector"]'),
    col: ESC.bloques[0].mats.glass.color.getHex(), pala: PALA, suelo: TD.suelo.material.color.getHex() }));
  check('sin ambiente.js la escena se monta igual', sin.est === null && sin.sel === false, JSON.stringify(sin));
  check('y con los materiales de siempre', sin.col === sin.pala && sin.suelo === 0x24301d, sin.col.toString(16) + ' · ' + sin.suelo.toString(16));
  check('sin una sola excepción', err2.length === 0, err2.join(' | '));

  await browser.close();
  console.log((ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
  process.exit(ko ? 1 : 0);
})();
