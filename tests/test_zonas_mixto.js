/* Banco de las ZONAS DE MONTAJE del generador — fija y tracker a la vez.
 *
 * Regla del cliente (2026-08-26): «el html debe ser igual que notebook y
 * streamlit». Lo que se vigila aquí no es la geometría —el motor de layout
 * del generador ya está careado contra `compute_layout_v2`— sino el
 * CONTRATO, que es donde una tercera implementación se desvía sin que nadie
 * lo note: qué se suma, qué no tiene valor único, y de dónde salen los
 * motores.
 *
 * El gemelo Python de estas mismas reglas está en
 * `SolarGPTfull/solargpt/tests/test_layout_mixto.py`.
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + extra : '')); } };

// Dos cuadrados que COMPARTEN LINDE, en Aragón. Pegados a propósito: es el
// caso normal, y una comprobación que lo prohibiera dejaría la función inútil.
const CUAD_A = [[-0.8035, 41.5743], [-0.7980, 41.5743], [-0.7980, 41.5790], [-0.8035, 41.5790]];
const CUAD_B = [[-0.7980, 41.5743], [-0.7925, 41.5743], [-0.7925, 41.5790], [-0.7980, 41.5790]];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  await page.goto(BASE + '/generador-layout.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.computaMixto === 'function', null, { timeout: 15000 });

  const r = await page.evaluate(({ A, B }) => {
    // cfg mínimo del motor, con la parcela grande que engloba las dos zonas
    const cfg = {
      coords: A.concat(B), holes: [], mount: 'tracker', pitch: 6,
      setback: 5, tableType: '1V', modsPerStruct: 30, modLen: 2.382, modWid: 1.134,
      gapModules: 0.02, gapMotor: 0.5, gapNs: 0.5, panelAz: 180, decl: {}
    };
    const zonas = [
      { nombre: 'norte', coords: A, holes: [], mount: 'tracker', pitch: 6 },
      { nombre: 'sur', coords: B, holes: [], mount: 'fixed', pitch: 4 }
    ];
    const mix = window.computaMixto(cfg, zonas);
    // y cada zona por separado, para poder juzgar la fusión
    const solo = zonas.map(z => window.LAY.compute(
      Object.assign({}, cfg, { coords: z.coords, holes: [], mount: z.mount, pitch: z.pitch })));
    return {
      st: mix.stats,
      nStructs: mix.structures.length,
      montajesDeMesas: Array.from(new Set(mix.structures.map(e => e.mount))).sort(),
      zonasDeMesas: Array.from(new Set(mix.structures.map(e => e.zona))).sort(),
      solo: solo.map(s => ({ structures: s.stats.structures, trackers: s.stats.trackers, kWp: s.stats.kWp })),
      sinValorUnico: mix.stats.sin_valor_unico
    };
  }, { A: CUAD_A, B: CUAD_B });

  // ── LA trampa: en fija el motor emite 1 «tracker» por MESA ──
  check('las mesas FIJAS no se cuentan como motores',
    r.st.n_motors === r.solo[0].trackers,
    'n_motors=' + r.st.n_motors + ' y el tracker solo da ' + r.solo[0].trackers +
    ' (la zona fija aporta ' + r.solo[1].trackers + ' «trackers» que son mesas)');
  check('y la zona fija aporta CERO motores en el desglose',
    r.st.motores_por_zona && r.st.motores_por_zona.sur === 0,
    JSON.stringify(r.st.motores_por_zona));
  check('el desglose de motores suma el total',
    Object.values(r.st.motores_por_zona || {}).reduce((a, b) => a + b, 0) === r.st.n_motors);

  // ── lo que SÍ se suma ──
  check('las estructuras se SUMAN entre zonas',
    r.st.structures === r.solo[0].structures + r.solo[1].structures,
    r.st.structures + ' vs ' + (r.solo[0].structures + r.solo[1].structures));
  check('y la lista de mesas tiene tantas como dice el recuento',
    r.nStructs === r.st.structures, r.nStructs + ' vs ' + r.st.structures);
  check('los kWp se SUMAN', Math.abs(r.st.kWp - (r.solo[0].kWp + r.solo[1].kWp)) < 1e-6);

  // ── lo que NO tiene valor único ──
  ['pitch', 'GCR', 'table_type', 'mesa_len_m', 'fila_len_m'].forEach(k => {
    check('«' + k + '» sale null con dos montajes (antes que un escalar que miente)',
      r.st[k] === null, String(r.st[k]));
    check('  …y con su MOTIVO escrito',
      r.sinValorUnico && typeof r.sinValorUnico[k] === 'string' && r.sinValorUnico[k].length > 20,
      JSON.stringify(r.sinValorUnico && r.sinValorUnico[k]));
  });

  // ── el reparto, que es el denominador de todo lo de aguas abajo ──
  check('se publica el reparto de kWp por MONTAJE',
    r.st.kwp_por_montaje && r.st.kwp_por_montaje.tracker > 0 && r.st.kwp_por_montaje.fixed > 0,
    JSON.stringify(r.st.kwp_por_montaje));
  check('y las fracciones suman 1',
    Math.abs(Object.values(r.st.fraccion_kwp_por_montaje).reduce((a, b) => a + b, 0) - 1) < 1e-9,
    JSON.stringify(r.st.fraccion_kwp_por_montaje));

  // ── cada mesa sabe de qué es ──
  check('cada mesa viaja con su MONTAJE (o el 3D dibujaría seguidores en la fija)',
    r.montajesDeMesas.join(',') === 'fixed,tracker', r.montajesDeMesas.join(','));
  check('y con su ZONA', r.zonasDeMesas.join(',') === 'norte,sur', r.zonasDeMesas.join(','));
  check('el layout se declara MIXTO', r.st.es_mixto === true);

  // ── nombres repetidos: el desglose se indexa por nombre ──
  const dup = await page.evaluate(({ A, B }) => {
    try {
      window.computaMixto({ coords: A, holes: [], mount: 'tracker', pitch: 6, setback: 5,
        tableType: '1V', modsPerStruct: 30, modLen: 2.382, modWid: 1.134, decl: {} },
        [{ nombre: 'z', coords: A, mount: 'tracker', pitch: 6 },
         { nombre: 'z', coords: B, mount: 'fixed', pitch: 4 }]);
      return 'no lanzó';
    } catch (e) { return e.message; }
  }, { A: CUAD_A, B: CUAD_B });
  check('nombres de zona repetidos se rechazan', /repetidos/.test(dup), dup);

  // ── LA MÁSCARA DE LA PARCELA: el MDT cubre el bbox MÁS margen ──
  // Sin ella la propuesta reparte terreno que el usuario no ha dibujado, y
  // aquí no se queda en marcarlo: se colocarían MESAS ahí. Es la queja que ya
  // costó escribir `mascaraParcelaDEM`.
  const mask = await page.evaluate(() => {
    // MDT sintético 24×24 sobre un bbox MUCHO mayor que la parcela, con
    // pendiente creciente hacia el este para que haya tres bandas.
    const n = 24, lat0 = 41.560, lon0 = -0.820, paso = 0.0020;
    const lats = [], lons = [], z = [];
    for (let i = 0; i < n; i++) { lats.push(lat0 + i * paso); lons.push(lon0 + i * paso); }
    for (let r = 0; r < n; r++) { const f = [];
      for (let c = 0; c < n; c++) f.push(c * c * 0.9); z.push(f); }
    window.DEM = { lats, lons, z };
    // la parcela ocupa solo el cuadrante central
    window.PARCEL = [[lon0 + 8 * paso, lat0 + 8 * paso], [lon0 + 15 * paso, lat0 + 8 * paso],
                     [lon0 + 15 * paso, lat0 + 15 * paso], [lon0 + 8 * paso, lat0 + 15 * paso]];
    window.HOLES = [];
    const pend = window.pendientesDEM();
    const p = window.zonasPorPendiente(pend,
      { trkEw: 6, trkNs: 30, fijaEw: 12, fijaNs: 30, pitchTrk: 6, pitchFija: 4 }, 1);
    const lonMin = lon0 + 8 * paso, lonMax = lon0 + 15 * paso;
    const latMin = lat0 + 8 * paso, latMax = lat0 + 15 * paso;
    const tol = paso * 1.01;   // una celda de holgura: el contorno va por celdas
    let fuera = 0, vert = 0;
    p.zonas.forEach(zz => zz.coords.forEach(q => { vert++;
      if (q[0] < lonMin - tol || q[0] > lonMax + tol || q[1] < latMin - tol || q[1] > latMax + tol) fuera++; }));
    return { nZonas: p.zonas.length, vertices: vert, fuera,
             montajes: Array.from(new Set(p.zonas.map(zz => zz.mount))).sort(),
             noDesarrollable: p.areaNoDesarrollable };
  });
  check('la propuesta NO sale de la parcela dibujada',
    mask.fuera === 0, mask.fuera + ' de ' + mask.vertices + ' vértices fuera');
  check('  …y aun así propone zonas dentro', mask.nZonas > 0, JSON.stringify(mask));
  check('  …con los dos montajes, que es el régimen que distingue',
    mask.montajes.length === 2, mask.montajes.join(','));

  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
  process.exit(ko ? 1 : 0);
})();
