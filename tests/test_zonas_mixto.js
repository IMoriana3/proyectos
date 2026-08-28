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
      setback: 0,  /* SUSTITUCIÓN DECLARADA (2026-08-27): esta escena prueba la
        SEMÁNTICA DE SUMA del mixto, y su «parcela» (A.concat(B)) es un ocho
        autocruzado que no es linde de nada — con el setback-solo-linde
        nuevo, un retranqueo aquí filtraría contra esa basura. La banda de
        la linde tiene su banco propio más abajo, con parcela de verdad. */
        _setback_anulado: 5, tableType: '1V', modsPerStruct: 30, modLen: 2.382, modWid: 1.134,
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
    const _prev = { DEM: window.DEM, PARCEL: window.PARCEL, HOLES: window.HOLES };
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
    window.DEM = _prev.DEM; window.PARCEL = _prev.PARCEL; window.HOLES = _prev.HOLES;
    return { nZonas: p.zonas.length, vertices: vert, fuera,
             montajes: Array.from(new Set(p.zonas.map(zz => zz.mount))).sort(),
             noDesarrollable: p.areaNoDesarrollable };
  });
  check('la propuesta NO sale de la parcela dibujada',
    mask.fuera === 0, mask.fuera + ' de ' + mask.vertices + ' vértices fuera');
  check('  …y aun así propone zonas dentro', mask.nZonas > 0, JSON.stringify(mask));
  check('  …con los dos montajes, que es el régimen que distingue',
    mask.montajes.length === 2, mask.montajes.join(','));

  // ── UNA fuente por montaje: el guard de la NO duplicación ──
  // Reportado por el cliente: «tenemos duplicado lo de pitch y pendiente
  // máxima, ¿para qué? Debería estar únicamente en su cuadro de config de
  // fija o de tracker». El síntoma ya había mordido: un filtro global de
  // pendiente en 2° convivía con límites de zona en 15/25 sobre terreno de
  // 16,3°, ganaba el más estricto EN SILENCIO y el layout salía «no
  // implantable» sin decir por qué.
  const uni = await page.evaluate(() => {
    const q = sel => document.querySelectorAll(sel).length;
    return {
      // los que ya no deben existir
      pitchGlobal: q('#pitch'), slopeGlobal: q('#slopeMax'),
      mixPitch: q('#mixPitchTrk') + q('#mixPitchFija'),
      mixLims: q('#mixTrkEw') + q('#mixTrkNs') + q('#mixFijaEw') + q('#mixFijaNs'),
      // exactamente UNO de cada, y dentro del pane de su montaje
      pitchTrk: q('#paneTracker #pitchTrk'), pitchFija: q('#paneFija #pitchFija'),
      limsTrk: q('#paneTracker #slopeTrkEw') + q('#paneTracker #slopeTrkNs'),
      limsFija: q('#paneFija #slopeFijaEw') + q('#paneFija #slopeFijaNs'),
      // y las puertas únicas existen
      puertas: ['pitchAct', 'pitchDe', 'limPendAct', 'limPendDe', 'admiteMontaje']
        .filter(f => typeof window[f] === 'function').length
    };
  });
  check('NO queda un pitch global (era el duplicado del de cada montaje)',
    uni.pitchGlobal === 0, String(uni.pitchGlobal));
  check('NO queda una pendiente máxima global (era el que ganaba en silencio)',
    uni.slopeGlobal === 0, String(uni.slopeGlobal));
  check('el panel de zonas NO repite pitch ni límites',
    uni.mixPitch === 0 && uni.mixLims === 0, uni.mixPitch + '/' + uni.mixLims);
  check('cada montaje tiene UN pitch, en SU cuadro',
    uni.pitchTrk === 1 && uni.pitchFija === 1, uni.pitchTrk + '/' + uni.pitchFija);
  check('cada montaje tiene DOS pendientes máximas, en SU cuadro',
    uni.limsTrk === 2 && uni.limsFija === 2, uni.limsTrk + '/' + uni.limsFija);
  check('y existen las puertas únicas para leerlos', uni.puertas === 5, String(uni.puertas));

  // el pitch que usa el motor es el DEL MONTAJE ACTIVO, no uno fijo
  const porMontaje = await page.evaluate(() => {
    const set = (id, v) => { document.querySelector('#' + id).value = String(v); };
    set('pitchTrk', 7.5); set('pitchFija', 3.5);
    const sel = document.querySelector('#mount');
    sel.value = 'tracker'; sel.dispatchEvent(new Event('change'));
    const t = window.pitchAct();
    sel.value = 'fija'; sel.dispatchEvent(new Event('change'));
    const f = window.pitchAct();
    sel.value = 'tracker'; sel.dispatchEvent(new Event('change'));
    return { t, f };
  });
  check('el pitch que lee el motor cambia CON el montaje',
    porMontaje.t === 7.5 && porMontaje.f === 3.5, JSON.stringify(porMontaje));

  /* ── SIN PARCELA NO SE PROPONE ────────────────────────────────────────
   * El MDT se descarga sobre el BBOX de la parcela MÁS margen. Sin linde,
   * recorrer la rejilla entera propone zonas sobre el terreno del vecino —y
   * ahí se colocarían mesas—. `mascaraParcelaDEM` ya lo cubría… salvo en el
   * único caso que importa: sin ningún anillo devolvía «todo dentro», así
   * que el guard se desactivaba solo justo cuando hacía falta.
   * Lo destapó portar el recorte a Python (SolarGPTfull#166), donde la linde
   * es argumento OBLIGATORIO. */
  const sinLinde = await page.evaluate(() => {
    const PARCEL_prev = window.PARCEL, PARCELAS_prev = window.PARCELAS,
          DEM_prev = window.DEM;   // el stub sin `z` reventaría a los bancos de después
    window.PARCEL = null; window.PARCELAS = [];
    // DEM sintético mínimo: 4×4 celdas, llano — con parcela saldría zona.
    window.DEM = { lats: [41.570, 41.572, 41.574, 41.576],
                   lons: [-0.800, -0.798, -0.796, -0.794] };
    const msk = window.mascaraParcelaDEM();
    const pend = { n: 4, ew: [], ns: [] };
    for (let r = 0; r < 4; r++) { pend.ew.push([0, 0, 0, 0]); pend.ns.push([0, 0, 0, 0]); }
    const prop = window.zonasPorPendiente(
      pend, { trkEw: 10, trkNs: 15, fijaEw: 12, fijaNs: 12 }, 1);
    window.PARCEL = PARCEL_prev; window.PARCELAS = PARCELAS_prev;
    window.DEM = DEM_prev;
    return { msk: msk, sinParcela: !!(prop && prop.sinParcela),
             nZonas: prop && prop.zonas ? prop.zonas.length : -1 };
  });
  check('sin ningún anillo, la máscara es NULL y no «todo dentro»',
    sinLinde.msk === null, JSON.stringify(sinLinde.msk));
  check('y el reparto se NIEGA a proponer en vez de repartir el BBOX',
    sinLinde.sinParcela === true && sinLinde.nZonas === 0,
    JSON.stringify(sinLinde));

  const dice = await page.evaluate(() => {
    window.MIX_PROP = { sinParcela: true, zonas: [] }; window.MIX_ZONAS = [];
    window.mixPinta();
    return { out: document.getElementById('mixOut').textContent,
             tag: document.getElementById('mixTag').textContent };
  });
  check('y lo DICE, en vez de quedarse mudo como si no hubiera salido nada',
    /parcela/i.test(dice.out) && /sin parcela/i.test(dice.tag),
    JSON.stringify(dice));


  /* ── LOS DOS PANES, A LA VISTA (reporte 2026-08-27) ────────────────────
   * «Si quiero llenarlo de trackers y fija no tengo dónde seleccionar las
   * pendientes máximas de cada uno»: los límites existían pero el pane del
   * montaje no seleccionado iba con display:none — escondido justo lo que
   * el reparto mixto necesita. Ahora los dos son visibles siempre (el no
   * seleccionado, atenuado) y EDITABLES. Sin duplicar casillas: mismos ids. */
  const panes = await page.evaluate(() => {
    const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
    const sel = document.getElementById('mount');
    sel.value = 'tracker'; sel.dispatchEvent(new Event('change'));
    const conTracker = { trk: vis('paneTracker'), fija: vis('paneFija'),
      opTrk: getComputedStyle(document.getElementById('paneTracker')).opacity,
      opFija: getComputedStyle(document.getElementById('paneFija')).opacity };
    const f = document.getElementById('slopeFijaEw'); f.value = '11.5';
    f.dispatchEvent(new Event('change'));
    const leido = document.getElementById('slopeFijaEw').value;
    sel.value = 'fija'; sel.dispatchEvent(new Event('change'));
    const conFija = { trk: vis('paneTracker'), fija: vis('paneFija') };
    sel.value = 'tracker'; sel.dispatchEvent(new Event('change'));
    return { conTracker, conFija, leido };
  });
  check('con Tracker seleccionado, el pane de FIJA sigue visible',
    panes.conTracker.trk && panes.conTracker.fija, JSON.stringify(panes.conTracker));
  check('…atenuado, no escondido (se ve cuál manda en el layout de un montaje)',
    parseFloat(panes.conTracker.opFija) < parseFloat(panes.conTracker.opTrk));
  check('con Fija seleccionada, el de TRACKER también sigue visible',
    panes.conFija.trk && panes.conFija.fija);
  check('los límites de la fija se editan SIN cambiar el selector',
    panes.leido === '11.5', panes.leido);


  /* ── EL SETBACK MUERDE LA LINDE, NO LAS RAYAS INTERNAS (2026-08-27) ────
   * «¿Por qué no me dibuja la fija?»: una tira de fija con bordes internos
   * quedaba «área útil vacía» porque el setback se aplicaba al borde de la
   * ZONA. Escena calibrada como la del banco Python: tira de ~11 m pegada a
   * la linde este — el retranqueo doble la mataba; con el post-filtro vive
   * y SOLO pierde lo que toca la linde real. */
  const linde = await page.evaluate(() => {
    /* SUSTITUCIÓN DECLARADA (v1.6.9): la fija ya no hereda el azimut del
       tracker — usa su propio «Azimut de filas (fija)». Esta tira corre N-S,
       así que el proyectista orienta las filas a lo largo (90): con el
       default 180 las filas serían de 11 m y la mesa de 28 módulos no cabe. */
    const _azFijaAntes = $('azRowsFija').value; $('azRowsFija').value = '90';
    const PAR = [[-0.800, 41.570], [-0.7920, 41.570], [-0.7920, 41.5745], [-0.800, 41.5745]];
    const BORDE = -0.79213;                       // tira de ~11 m
    const ZT = [[-0.800, 41.570], [BORDE, 41.570], [BORDE, 41.5745], [-0.800, 41.5745]];
    const ZF = [[BORDE, 41.570], [-0.7920, 41.570], [-0.7920, 41.5745], [BORDE, 41.5745]];
    const cfg = { coords: PAR, holes: [], exclusions: [], mount: 'tracker', table: '1V',
      mods: [28], modLen: 2.382, modWid: 1.134, moduleWp: 590, pitch: 6, setback: 5,
      panelAz: 90, bifila: true, gapModules: 0.02, gapMotor: 0.5, gapNs: 0.5,
      roadEvery: 0, roadW: 4, roadNsEvery: 0, roadNsW: 4, mode: 'adaptive',
      minStructs: 1, rowOffset: 'none', alignGrid: false, center: true };
    const R = computaMixto(cfg, [
      { nombre: 'trk', coords: ZT, holes: [], mount: 'tracker', pitch: 6 },
      { nombre: 'fija', coords: ZF, holes: [], mount: 'fixed', pitch: 4 }]);
    const pz = {}; R.porZona.forEach(p => pz[p.nombre] = p.structures);
    // distancia de cada mesa a la linde REAL, con la utm de la mesa
    const r0 = R.structures[0] ? null : null;
    let minD = 1/0, filasImpares = 0;
    const P = R.structures.length ? R.structures.map(e => e.utm) : [];
    // reconstruir la linde en UTM con toUtm del resultado base no está
    // exportado en R: se comprueba vía los avisos + el recuento por filas.
    const filas = {};
    R.structures.forEach(e => { if (e.mount === 'tracker')
      filas[e.row] = (filas[e.row] || 0) + 1; });
    const pares = Object.keys(filas).sort((a,b)=>a-b);
    for (let k = 0; k + 1 <= pares.length - 1; k += 2)
      if (filas[pares[k]] !== filas[pares[k+1]]) filasImpares++;
    const avisoLinde = R.avisos.some(a => /LINDE real/.test(a.mensaje || ''));
    $('azRowsFija').value = _azFijaAntes;
    return { fija: pz.fija || 0, trk: pz.trk || 0, filasImpares, avisoLinde,
             kwpFija: (R.stats.kwp_por_montaje || {}).fixed || 0 };
  });
  check('setback-linde · la tira de FIJA con bordes internos VIVE',
    linde.fija > 0, JSON.stringify(linde));
  check('setback-linde · la zona grande no se hunde', linde.trk > 500, String(linde.trk));
  check('setback-linde · en bifila NO quedan viudas (parejas con igual conteo)',
    linde.filasImpares === 0, linde.filasImpares + ' pareja(s) descompensadas');
  check('setback-linde · lo retirado junto a la linde real se AVISA',
    linde.avisoLinde);
  check('setback-linde · la fija aporta kWp al reparto por montaje',
    linde.kwpFija > 0);


  /* ── EL FILTRO DE PENDIENTE JUZGA CON EL MONTAJE DE LA ZONA ────────────
   * «El filtro de pendiente excluye el 100 % de la parcela» sobre una zona
   * FIJA que el propio reparto declaró apta a 25°: el mixto congelaba un
   * solo exclTopo en el cfg —el del montaje DEL SELECTOR— y todas las zonas
   * lo heredaban. DEM sintético: rampa de ~10° N-S, entre el límite del
   * tracker (5°) y el de la fija (25°). */
  const filtro = await page.evaluate(() => {
    const antes = { dem: window.DEM, par: window.PARCEL, hol: window.HOLES,
      te: $('slopeTrkEw').value, tn: $('slopeTrkNs').value,
      fe: $('slopeFijaEw').value, fn: $('slopeFijaNs').value,
      off: $('demOff').checked, sel: $('mount').value };
    try {
      $('slopeTrkEw').value = '5'; $('slopeTrkNs').value = '5';
      $('slopeFijaEw').value = '25'; $('slopeFijaNs').value = '25';
      $('demOff').checked = false;
      $('mount').value = 'tracker';                 // el selector, en TRACKER
      const n = 8, lats = [], lons = [], z = [];
      for (let i = 0; i < n; i++) { lats.push(41.570 + i * 0.0008); lons.push(-0.800 + i * 0.0008); }
      const dyM = 0.0008 * 110540;                   // ~88 m por celda
      for (let r = 0; r < n; r++) { const f = [];
        for (let c = 0; c < n; c++) f.push(r * dyM * Math.tan(10 * Math.PI / 180));
        z.push(f); }                                  // rampa 10° hacia el norte
      window.DEM = { lats, lons, z };
      // la parcela manda: celdasExcluidas solo juzga celdas DENTRO de ella
      window.PARCEL = [[-0.801, 41.569], [-0.794, 41.569], [-0.794, 41.576], [-0.801, 41.576]];
      window.HOLES = [];
      const trk = celdasExcluidas('tracker').length;
      const fija = celdasExcluidas('fixed').length;
      const porDefecto = celdasExcluidas().length;   // sin arg: el selector
      return { trk, fija, porDefecto };
    } finally {
      window.DEM = antes.dem; window.PARCEL = antes.par; window.HOLES = antes.hol;
      $('slopeTrkEw').value = antes.te; $('slopeTrkNs').value = antes.tn;
      $('slopeFijaEw').value = antes.fe; $('slopeFijaNs').value = antes.fn;
      $('demOff').checked = antes.off; $('mount').value = antes.sel;
    }
  });
  check('filtro · a 10° el TRACKER (lim 5°) excluye celdas', filtro.trk > 0,
    JSON.stringify(filtro));
  check('filtro · la FIJA (lim 25°) NO pierde ni una', filtro.fija === 0,
    filtro.fija + ' celdas excluidas con limite de sobra');
  check('filtro · sin argumento sigue mandando el selector (camino de un montaje)',
    filtro.porDefecto === filtro.trk);
  // y computaMixto se lo pasa POR ZONA, no congelado del cfg
  const src = await page.evaluate(() => computaMixto.toString());
  check('filtro · computaMixto pide celdasExcluidas(z.mount)',
    src.indexOf('celdasExcluidas(z.mount)') !== -1);

  /* La escena de la captura: el cfg llega con el exclTopo CONGELADO del
   * selector (tracker a 5°) y una zona entera es FIJA sobre 10°. Con el bug,
   * la zona hereda esas exclusiones y muere «100 % excluida»; arreglado,
   * planta mesas. */
  const vive = await page.evaluate(() => {
    const antes = { dem: window.DEM, par: window.PARCEL, hol: window.HOLES,
      te: $('slopeTrkEw').value, tn: $('slopeTrkNs').value,
      fe: $('slopeFijaEw').value, fn: $('slopeFijaNs').value,
      off: $('demOff').checked, sel: $('mount').value };
    try {
      $('slopeTrkEw').value = '5'; $('slopeTrkNs').value = '5';
      $('slopeFijaEw').value = '25'; $('slopeFijaNs').value = '25';
      $('demOff').checked = false; $('mount').value = 'tracker';
      const n = 8, lats = [], lons = [], z = [];
      for (let i = 0; i < n; i++) { lats.push(41.570 + i * 0.0008); lons.push(-0.800 + i * 0.0008); }
      const dyM = 0.0008 * 110540;
      for (let r = 0; r < n; r++) { const f = [];
        for (let c = 0; c < n; c++) f.push(r * dyM * Math.tan(10 * Math.PI / 180));
        z.push(f); }
      window.DEM = { lats, lons, z };
      const PAR = [[-0.7995, 41.5705], [-0.7950, 41.5705],
                   [-0.7950, 41.5750], [-0.7995, 41.5750]];
      window.PARCEL = PAR; window.HOLES = [];   // el filtro juzga DENTRO de la parcela
      const cfg = { coords: PAR, holes: [], exclusions: [], mount: 'tracker', table: '1V',
        mods: [28], modLen: 2.382, modWid: 1.134, moduleWp: 590, pitch: 6, setback: 0,
        panelAz: 90, bifila: false, gapModules: 0.02, gapMotor: 0.5, gapNs: 0.5,
        roadEvery: 0, roadW: 4, roadNsEvery: 0, roadNsW: 4, mode: 'adaptive',
        minStructs: 1, rowOffset: 'none', alignGrid: false, center: true,
        exclTopo: celdasExcluidas(), mdtFracTh: 0.35 };   // congelado del SELECTOR
      const R = computaMixto(cfg, [
        { nombre: 'fija', coords: PAR, holes: [], mount: 'fixed', pitch: 4 }]);
      return { frozen: cfg.exclTopo.length,
               mesas: R.porZona[0] ? R.porZona[0].structures : -1 };
    } finally {
      window.DEM = antes.dem; window.PARCEL = antes.par; window.HOLES = antes.hol;
      $('slopeTrkEw').value = antes.te; $('slopeTrkNs').value = antes.tn;
      $('slopeFijaEw').value = antes.fe; $('slopeFijaNs').value = antes.fn;
      $('demOff').checked = antes.off; $('mount').value = antes.sel;
    }
  });
  check('filtro · el cfg congelado del selector SÍ excluía terreno', vive.frozen > 0,
    JSON.stringify(vive));
  check('filtro · …y aun así la zona FIJA planta mesas (la captura del bug)',
    vive.mesas > 0, vive.mesas + ' mesas');


  /* ── LOS CONTORNOS DEL REPARTO SALEN SIMPLES (2026-08-28) ──────────────
   * «[fija-1] La parcela se cruza a sí misma en varios puntos y la
   * reparación no llega … No cabe ninguna estructura»: una isla PELLIZCADA
   * (dos lóbulos unidos por una celda — el caso típico de la fija, banda
   * alrededor del tracker) hace que el paseo del contorno pase dos veces
   * por la misma celda y el anillo salga cruzado. El core Python lo repara
   * con make_valid y devuelve TODAS las piezas; el generador empujaba el
   * anillo cruzado tal cual. Escena: MANCUERNA — dos bloques unidos por UNA
   * celda puente, que el paseo del contorno visita DOS veces (medido: el
   * reloj de arena en diagonal NO reproduce, el paseo corta la esquina). */
  const lazos = await page.evaluate(() => {
    const antes = { dem: window.DEM, par: window.PARCEL, hol: window.HOLES };
    try {
      const n = 8, lats = [], lons = [];
      for (let i = 0; i < n; i++) { lats.push(41.570 + i * 0.0008); lons.push(-0.800 + i * 0.0008); }
      window.DEM = { lats, lons, z: lats.map(() => lons.map(() => 0)) };
      window.PARCEL = [[-0.801, 41.569], [-0.793, 41.569], [-0.793, 41.577], [-0.801, 41.577]];
      window.HOLES = [];
      // pend a mano: fija apta SOLO en el reloj de arena, tracker en ninguna
      const ew = [], ns = [];
      const enMancuerna = (r, c) => ((r <= 1 && c >= 1 && c <= 3) || (r === 2 && c === 2)
                                     || (r >= 3 && r <= 4 && c >= 1 && c <= 3));
      for (let r = 0; r < n; r++) { const fe = [], fn = [];
        for (let c = 0; c < n; c++) { fe.push(0); fn.push(enMancuerna(r, c) ? 10 : 50); }
        ew.push(fe); ns.push(fn); }
      const prop = zonasPorPendiente({ n, ew, ns },
        { trkEw: 5, trkNs: 5, fijaEw: 25, fijaNs: 25, pitchTrk: 6, pitchFija: 4 }, 1000);
      // checker de simplicidad: mismo criterio que la particion
      function orient(p, q, t) { return (q[0]-p[0])*(t[1]-p[1])-(q[1]-p[1])*(t[0]-p[0]); }
      function seCruzan(a, b, c, d) {
        const d1 = orient(c,d,a), d2 = orient(c,d,b), d3 = orient(a,b,c), d4 = orient(a,b,d);
        return ((d1>0)!==(d2>0))&&((d3>0)!==(d4>0));
      }
      function esSimple(r) {
        const m = r.length;
        for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
          const dx = r[i][0]-r[j][0], dy = r[i][1]-r[j][1];
          if (dx*dx + dy*dy < 1e-18) return false;              // vertice repetido
        }
        for (let i = 0; i < m; i++) for (let j = i + 2; j < m; j++) {
          if (i === 0 && j === m - 1) continue;
          if (seCruzan(r[i], r[(i+1)%m], r[j], r[(j+1)%m])) return false;
        }
        return true;
      }
      // y la particion en directo, con una pajarita de manual
      const pajarita = mixPartesSimples([[0,0],[4,4],[4,0],[0,4]]);
      const tocada  = mixPartesSimples([[0,0],[4,0],[4,4],[2,2],[0,4],[0,0],[-2,2]]);
      return { nZonas: prop.zonas.length,
               montajes: prop.zonas.map(z => z.mount),
               simples: prop.zonas.map(z => esSimple(z.coords)),
               avisoPellizco: prop.avisos.some(a => /pellizcad/.test(a)),
               pajaritaN: pajarita.length, pajaritaSimples: pajarita.every(esSimple),
               tocadaSimples: tocada.every(esSimple) };
    } finally {
      window.DEM = antes.dem; window.PARCEL = antes.par; window.HOLES = antes.hol;
    }
  });
  // v1.6.7: con el contorno por ARISTAS la mancuerna es UNA zona — su
  // cintura es una celda REAL (~88 m), no un pellizco de área cero. Las dos
  // zonas de v1.6.5 eran el sintoma del trazado por centros, no la fisica.
  check('lazos · la mancuerna es UNA zona de fija con su cintura real',
    lazos.nZonas === 1 && lazos.montajes.every(m => m === 'fixed'), JSON.stringify(lazos));
  check('lazos · TODOS los contornos del reparto son anillos SIMPLES',
    lazos.simples.length > 0 && lazos.simples.every(Boolean), JSON.stringify(lazos.simples));
  check('lazos · la pajarita se parte en 2 lazos simples',
    lazos.pajaritaN === 2 && lazos.pajaritaSimples, JSON.stringify(lazos));
  check('lazos · el anillo con vertice repetido tambien queda simple', lazos.tocadaSimples);


  /* ── «EN ESOS HUECOS LA FIJA ENTRARÍA» (2026-08-28) ────────────────────
   * Los huecos del campo de tracker que SÍ admiten fija caían como islas
   * pequeñas y el umbral ÚNICO (calibrado a tracker) se las comía — 75
   * islas, ~3 ha en el parte real. Umbral POR MONTAJE + el 0 explícito
   * VALE (el ||2000 se lo tragaba: falsy no es ausente). */
  const hueco = await page.evaluate(() => {
    const antes = { dem: window.DEM, par: window.PARCEL, hol: window.HOLES };
    try {
      const n = 8, lats = [], lons = [];
      for (let i = 0; i < n; i++) { lats.push(41.570 + i * 0.0008); lons.push(-0.800 + i * 0.0008); }
      window.DEM = { lats, lons, z: lats.map(() => lons.map(() => 0)) };
      window.PARCEL = [[-0.801, 41.569], [-0.793, 41.569], [-0.793, 41.577], [-0.801, 41.577]];
      window.HOLES = [];
      // mar de tracker con un HUECO 2x2 que solo admite fija
      const enHueco = (r, c) => (r >= 3 && r <= 4 && c >= 3 && c <= 4);
      const ew = [], ns = [];
      for (let r = 0; r < n; r++) { const fe = [], fn = [];
        for (let c = 0; c < n; c++) { fe.push(0); fn.push(enHueco(r, c) ? 10 : 2); }
        ew.push(fe); ns.push(fn); }
      const lims = { trkEw: 5, trkNs: 5, fijaEw: 25, fijaNs: 25, pitchTrk: 6, pitchFija: 4 };
      const conUmbrales = zonasPorPendiente({ n, ew, ns }, lims, 50000, 5000);
      const sinMinimo   = zonasPorPendiente({ n, ew, ns }, lims, 0, 0);
      const cuenta = p => ({ trk: p.zonas.filter(z => z.mount === 'tracker').length,
                             fija: p.zonas.filter(z => z.mount === 'fixed').length });
      return { conUmbrales: cuenta(conUmbrales), sinMinimo: cuenta(sinMinimo) };
    } finally {
      window.DEM = antes.dem; window.PARCEL = antes.par; window.HOLES = antes.hol;
    }
  });
  check('hueco · la isla de FIJA se juzga con SU umbral, no con el del tracker',
    hueco.conUmbrales.fija >= 1 && hueco.conUmbrales.trk >= 1, JSON.stringify(hueco));
  check('hueco · sin mínimo (0) se conserva todo', hueco.sinMinimo.fija >= 1);

  // el CERO EXPLÍCITO llega al reparto (falsy != ausente)
  const cero = await page.evaluate(() => {
    const orig = window.zonasPorPendiente, origDem = window.DEM;
    const antes = { t: $('mixMinArea').value, f: $('mixMinAreaFija').value };
    let capturado = null;
    try {
      window.DEM = { lats: [41.57, 41.571], lons: [-0.8, -0.799], z: [[0, 0], [0, 0]] };
      window.zonasPorPendiente = function (pend, lims, mT, mF) {
        capturado = [mT, mF];
        return { sinParcela: false, zonas: [], avisos: [], areaTracker: 0, areaFija: 0,
                 areaNoDesarrollable: 0, islasDescartadas: 0, areaDescartada: 0, limites: lims };
      };
      $('mixMinArea').value = '0'; $('mixMinAreaFija').value = '0';
      $('mixProponer').onclick();
      return capturado;
    } finally {
      window.zonasPorPendiente = orig; window.DEM = origDem;
      $('mixMinArea').value = antes.t; $('mixMinAreaFija').value = antes.f;
    }
  });
  check('cero · «área mínima 0» llega como 0, no como el default',
    Array.isArray(cero) && cero[0] === 0 && cero[1] === 0, JSON.stringify(cero));

  // la TABLA de cada zona es la de SU montaje
  const tabla = await page.evaluate(() => {
    const orig = LAY.compute, antes = { t: $('table').value, f: $('tableFija').value };
    const vistas = [];
    try {
      $('table').value = '1V'; $('tableFija').value = '2V';
      LAY.compute = function (cfg) { vistas.push(cfg.mount + ':' + cfg.table); return orig(cfg); };
      const Z1 = [[-0.800, 41.570], [-0.798, 41.570], [-0.798, 41.572], [-0.800, 41.572]];
      const Z2 = [[-0.798, 41.570], [-0.796, 41.570], [-0.796, 41.572], [-0.798, 41.572]];
      const cfg = { coords: [[-0.800, 41.570], [-0.796, 41.570], [-0.796, 41.572], [-0.800, 41.572]],
        holes: [], exclusions: [], mount: 'tracker', table: '1V',
        mods: [28], modLen: 2.382, modWid: 1.134, moduleWp: 590, pitch: 6, setback: 0,
        panelAz: 90, bifila: false, gapModules: 0.02, gapMotor: 0.5, gapNs: 0.5,
        roadEvery: 0, roadW: 4, roadNsEvery: 0, roadNsW: 4, mode: 'adaptive',
        minStructs: 1, rowOffset: 'none', alignGrid: false, center: true };
      computaMixto(cfg, [
        { nombre: 'trk', coords: Z1, holes: [], mount: 'tracker', pitch: 6 },
        { nombre: 'fija', coords: Z2, holes: [], mount: 'fixed', pitch: 4 }]);
      return vistas;
    } finally {
      LAY.compute = orig; $('table').value = antes.t; $('tableFija').value = antes.f;
    }
  });
  check('tabla · la zona de tracker computa con la tabla global (1V)',
    tabla.some(v => v === 'tracker:1V'), JSON.stringify(tabla));
  check('tabla · la zona de FIJA computa con SU tabla (2V), no con la del selector',
    tabla.some(v => v === 'fixed:2V'), JSON.stringify(tabla));

  // un color por montaje, y la leyenda los nombra
  const color = await page.evaluate(() => ({
    trk: colorExclDe('tracker').f, fija: colorExclDe('fixed').f,
    leyenda: document.body.innerHTML.indexOf('pendiente &gt; máx. tracker') !== -1
          && document.body.innerHTML.indexOf('pendiente &gt; máx. fija') !== -1 }));
  check('color · tracker y fija llevan colores DISTINTOS en la capa de pendiente',
    color.trk !== color.fija, JSON.stringify(color));
  check('color · la leyenda nombra los dos', color.leyenda);


  /* ── LA CINTA DE 1 CELDA TIENE ANCHURA (2026-08-28, «no entiendo») ─────
   * El paseo por CENTROS convertia una cinta de 1 celda de ancho (90 m x
   * medio km de terreno real) en una linea de area CERO: la zona llegaba al
   * motor sin anchura y soltaba «no cabe ninguna estructura» — la pared de
   * ✗ de la captura. Por ARISTAS la cinta mide lo que mide y se planta. */
  const cinta = await page.evaluate(() => {
    const antes = { dem: window.DEM, par: window.PARCEL, hol: window.HOLES };
    try {
      const n = 10, lats = [], lons = [];
      for (let i = 0; i < n; i++) { lats.push(41.570 + i * 0.0008); lons.push(-0.800 + i * 0.0008); }
      window.DEM = { lats, lons, z: lats.map(() => lons.map(() => 0)) };
      window.PARCEL = [[-0.801, 41.569], [-0.791, 41.569], [-0.791, 41.579], [-0.801, 41.579]];
      window.HOLES = [];
      const ew = [], ns = [];
      for (let r = 0; r < n; r++) { const fe = [], fn = [];
        for (let c = 0; c < n; c++) { fe.push(0); fn.push((r === 4 && c >= 2 && c <= 7) ? 10 : 50); }
        ew.push(fe); ns.push(fn); }
      const prop = zonasPorPendiente({ n, ew, ns },
        { trkEw: 5, trkNs: 5, fijaEw: 25, fijaNs: 25, pitchTrk: 6, pitchFija: 4 }, 0, 0);
      if (prop.zonas.length !== 1) return { nZonas: prop.zonas.length };
      const z = prop.zonas[0];
      const cfg = { coords: window.PARCEL, holes: [], exclusions: [], mount: 'tracker',
        table: '1V', mods: [8], modLen: 2.382, modWid: 1.134, moduleWp: 590, pitch: 6,
        setback: 0, panelAz: 90, bifila: false, gapModules: 0.02, gapMotor: 0.5,
        gapNs: 0.5, roadEvery: 0, roadW: 4, roadNsEvery: 0, roadNsW: 4,
        mode: 'adaptive', minStructs: 1, rowOffset: 'none', alignGrid: false, center: true };
      const R = computaMixto(cfg, [{ nombre: z.nombre, coords: z.coords, holes: [],
                                     mount: z.mount, pitch: 4 }]);
      return { nZonas: 1, mount: z.mount, mesas: R.porZona[0].structures,
               avisos: R.avisos.map(a => a.codigo) };
    } finally {
      window.DEM = antes.dem; window.PARCEL = antes.par; window.HOLES = antes.hol;
    }
  });
  check('cinta · la banda de 1 celda es UNA zona de fija', cinta.nZonas === 1
    && cinta.mount === 'fixed', JSON.stringify(cinta));
  check('cinta · …con ANCHURA: el motor le planta mesas (antes «no cabe ninguna»)',
    (cinta.mesas || 0) > 0, JSON.stringify(cinta));

  /* ── la pared de ✗ se agrupa en UN aviso ─────────────────────────────── */
  const pared = await page.evaluate(() => {
    // dos zonas minusculas donde NO cabe nada + una grande que si se planta
    const G  = [[-0.800, 41.570], [-0.796, 41.570], [-0.796, 41.574], [-0.800, 41.574]];
    const P1 = [[-0.7959, 41.570], [-0.79585, 41.570], [-0.79585, 41.57005], [-0.7959, 41.57005]];
    const P2 = [[-0.7958, 41.571], [-0.79575, 41.571], [-0.79575, 41.57105], [-0.7958, 41.57105]];
    const cfg = { coords: [[-0.800, 41.570], [-0.795, 41.570], [-0.795, 41.574], [-0.800, 41.574]],
      holes: [], exclusions: [], mount: 'tracker', table: '1V', mods: [28],
      modLen: 2.382, modWid: 1.134, moduleWp: 590, pitch: 6, setback: 0, panelAz: 90,
      bifila: false, gapModules: 0.02, gapMotor: 0.5, gapNs: 0.5, roadEvery: 0, roadW: 4,
      roadNsEvery: 0, roadNsW: 4, mode: 'adaptive', minStructs: 1, rowOffset: 'none',
      alignGrid: false, center: true };
    const R = computaMixto(cfg, [
      { nombre: 'grande', coords: G, holes: [], mount: 'tracker', pitch: 6 },
      { nombre: 'mini-1', coords: P1, holes: [], mount: 'fixed', pitch: 4 },
      { nombre: 'mini-2', coords: P2, holes: [], mount: 'fixed', pitch: 4 }]);
    const agrupado = R.avisos.filter(a => a.codigo === 'zonas_sin_estructuras');
    const sueltos = R.avisos.filter(a => a.codigo === 'layout_vacio');
    return { mesas: R.structures.length, nAgrupados: agrupado.length,
             nSueltos: sueltos.length, sev: agrupado[0] && agrupado[0].sev,
             nombra: !!(agrupado[0] && /mini-1/.test(agrupado[0].mensaje)
                                    && /mini-2/.test(agrupado[0].mensaje)) };
  });
  check('pared · los «no cabe» se agrupan en UN aviso que NOMBRA las zonas',
    pared.nAgrupados === 1 && pared.nSueltos === 0 && pared.nombra, JSON.stringify(pared));
  check('pared · con el resto del layout plantado es WARN, no fail',
    pared.mesas > 0 && pared.sev === 'warn');


  /* ── «FIXED» ES FIJA (2026-08-28, «ahí entran fijas, tú lo estás viendo») ─
   * El motor normalizaba el montaje con `cfg.mount === 'fija'` y TODO lo
   * demás —incluido 'fixed', que es lo que emiten el reparto y computaMixto—
   * corría como TRACKER: unidad de 2 mesas + gap motor (18,9 m con talla 8),
   * y una isla donde cabe una mesa suelta de 9,2 m salía «no cabe ninguna
   * estructura». Lo cazó el cliente a ojo. */
  const fixedFija = await page.evaluate(() => {
    const L = 15, dLon = L / 111320 / Math.cos(41.57 * Math.PI / 180), dLat = L / 110540;
    const Z = [[-0.798, 41.572], [-0.798 + dLon, 41.572],
               [-0.798 + dLon, 41.572 + dLat], [-0.798, 41.572 + dLat]];
    const PAR = [[-0.800, 41.570], [-0.795, 41.570], [-0.795, 41.575], [-0.800, 41.575]];
    const cfg = { coords: PAR, holes: [], exclusions: [], mount: 'tracker', table: '1V',
      mods: [21, 12, 8], modLen: 2.382, modWid: 1.134, moduleWp: 630, pitch: 6, setback: 5,
      panelAz: 270, bifila: true, gapModules: 0.02, gapMotor: 0.5, gapNs: 0.5,
      roadEvery: 0, roadW: 4, roadNsEvery: 0, roadNsW: 4, mode: 'adaptive',
      minStructs: 1, rowOffset: 'none', alignGrid: false, center: true };
    const R = computaMixto(cfg, [{ nombre: 'isla', coords: Z, holes: [],
                                   mount: 'fixed', pitch: 4 }]);
    return { mesas: R.porZona[0].structures, avisos: R.avisos.map(a => a.codigo) };
  });
  check('fixed-es-fija · una isla de 15 m planta mesas SUELTAS de fija (con '
      + 'geometria de tracker salia 0: exige la unidad de 2 mesas + gap motor)',
    fixedFija.mesas >= 3, JSON.stringify(fixedFija));
  /* SUSTITUCIÓN DECLARADA (v1.6.9): computaMixto pasa bifila:false a las
     zonas de fija — 15 zonas eran 15 avisos idénticos que se leían como «tu
     bifila no funciona». El camino de fija se delata ahora en DIRECTO contra
     el motor (que conserva el aviso para quien le pase bifila a una fija),
     y el mixto se exige LIMPIO de esa pared. */
  const avisoDirecto = await page.evaluate(() => {
    const Z = [[-0.798, 41.572], [-0.7978, 41.572], [-0.7978, 41.5722], [-0.798, 41.5722]];
    const R = LAY.compute({ coords: Z, holes: [], exclusions: [], mount: 'fixed',
      table: '1V', mods: [8], modLen: 2.382, modWid: 1.134, moduleWp: 630, pitch: 4,
      setback: 0, panelAz: 180, bifila: true, gapModules: 0.02, gapMotor: 0.5,
      gapNs: 0.5, roadEvery: 0, roadW: 4, roadNsEvery: 0, roadNsW: 4,
      mode: 'adaptive', minStructs: 1, rowOffset: 'none', alignGrid: false, center: true });
    return (R.avisos || []).map(a => a.codigo);
  });
  check('fixed-es-fija · el motor en DIRECTO avisa «bifila ignorada» con mount fixed',
    avisoDirecto.indexOf('bifila_ignorada_en_fija') !== -1, JSON.stringify(avisoDirecto));
  check('fixed-es-fija · el MIXTO no emite la pared de «bifila ignorada» (bifila:false por zona)',
    fixedFija.avisos.indexOf('bifila_ignorada_en_fija') === -1, JSON.stringify(fixedFija.avisos));


  /* ── «Y LA FIJA... NADA» (2026-08-28): az, mínimo y bifila POR MONTAJE ── */
  const fijaViva = await page.evaluate(() => {
    const PAR = [[-0.800, 41.570], [-0.794, 41.570], [-0.794, 41.576], [-0.800, 41.576]];
    function cinta(anchoM, largoM, vertical) {
      const dW = anchoM / 111320 / Math.cos(41.57 * Math.PI / 180), dH = largoM / 110540;
      const w = vertical ? dW * (anchoM / anchoM) : (largoM / 111320 / Math.cos(41.57 * Math.PI / 180));
      const h = vertical ? dH : (anchoM / 110540);
      const x0 = -0.798, y0 = 41.5715;
      const dx = vertical ? (anchoM / 111320 / Math.cos(41.57 * Math.PI / 180)) : w;
      return [[x0, y0], [x0 + dx, y0], [x0 + dx, y0 + h], [x0, y0 + h]];
    }
    const cfg = { coords: PAR, holes: [], exclusions: [], mount: 'tracker', table: '1V',
      mods: [21, 12, 8], modLen: 2.382, modWid: 1.134, moduleWp: 630, pitch: 6, setback: 5,
      panelAz: 270, bifila: true, gapModules: 0.02, gapMotor: 0.5, gapNs: 0.5,
      roadEvery: 0, roadW: 4, roadNsEvery: 0, roadNsW: 4, mode: 'adaptive',
      minStructs: 2, rowOffset: 'none', alignGrid: false, center: true };
    // cinta HORIZONTAL (11 m alto x 120 m): con az y minimo heredados del
    // tracker salia 0 — la escena del «nada»
    const H = computaMixto(cfg, [{ nombre: 'h', coords: cinta(11, 120, false),
                                   holes: [], mount: 'fixed', pitch: 4 }]);
    // cinta VERTICAL (11 m ancho x 120 m): filas E-O de una mesa — decide el
    // minimo de 1 por fila en fija
    const V = computaMixto(cfg, [{ nombre: 'v', coords: cinta(11, 120, true),
                                   holes: [], mount: 'fixed', pitch: 4 }]);
    // espia del azimut por zona
    const orig = LAY.compute, vistos = [];
    let T;
    try {
      LAY.compute = function (c) { vistos.push(c.mount + ':' + c.panelAz + ':min' + c.minStructs + ':bif' + c.bifila); return orig(c); };
      T = computaMixto(cfg, [
        { nombre: 'trk', coords: cinta(60, 120, false), holes: [], mount: 'tracker', pitch: 6 },
        { nombre: 'fij', coords: [[-0.797, 41.574], [-0.796, 41.574], [-0.796, 41.575], [-0.797, 41.575]], holes: [], mount: 'fixed', pitch: 4 }]);
    } finally { LAY.compute = orig; }
    return { mesasH: H.porZona[0].structures, mesasV: V.porZona[0].structures,
             vistos, partes: (T.partesTracker || []).map(v => ({ bifila: v.bifila, filas: v.rows.length })),
             ejes: (typeof ejesBifila === 'function' && T.partesTracker && T.partesTracker[0])
               ? ejesBifila(T.partesTracker[0]).length : -1 };
  });
  check('fija-viva · la cinta HORIZONTAL planta (az de fija propio, no el del tracker)',
    fijaViva.mesasH > 0, JSON.stringify({ mesasH: fijaViva.mesasH }));
  check('fija-viva · la cinta VERTICAL planta (minimo 1 mesa/fila en fija)',
    fijaViva.mesasV > 0, JSON.stringify({ mesasV: fijaViva.mesasV }));
  check('fija-viva · el espia lo confirma: tracker az 270 y fija az 180 / min1 / sin bifila',
    fijaViva.vistos.some(v => v === 'tracker:270:min2:biftrue')
      && fijaViva.vistos.some(v => v === 'fixed:180:min1:biffalse'), JSON.stringify(fijaViva.vistos));
  check('ejes · el mixto publica la vista de TRACKER con sus filas y su bifila',
    fijaViva.partes.length === 1 && fijaViva.partes[0].bifila === true
      && fijaViva.partes[0].filas > 0, JSON.stringify(fijaViva.partes));
  check('ejes · ejesBifila(vista) traza bielas en la zona de tracker del mixto',
    fijaViva.ejes > 0, JSON.stringify({ ejes: fijaViva.ejes }));


  /* ── las DOS capas de pendiente se pintan SIEMPRE (2026-08-28) ────────── */
  const capas = await page.evaluate(() => {
    // el pintor decide los montajes en el bloque de celdasExcluidas: se
    // inspecciona el codigo del pintor por el marcador de la decision
    const src = document.documentElement.innerHTML;
    return { siempreAmbas: src.indexOf("var msEx=['tracker','fixed']") !== -1 };
  });
  check('capas · el mapa pinta la capa de pendiente de LOS DOS montajes siempre',
    capas.siempreAmbas);


  /* ── LA SESIÓN GUARDA EL REPARTO (2026-08-28, «las zonas de fija por qué
   * no salen»): tras recargar, MIX_ZONAS volvía vacío y el layout se
   * calculaba de un solo montaje; y media configuración por montaje
   * (pitchFija, tableFija, azRowsFija, límites, mínimos) volvía a defaults
   * porque la lista de campos de sesión se quedó vieja. */
  const sesion = await page.evaluate(() => {
    const antes = { z: MIX_ZONAS, p: MIX_PROP,
      pf: $('pitchFija').value, tf: $('tableFija').value, az: $('azRowsFija').value };
    try {
      MIX_ZONAS = [{ nombre: 'fija-1', mount: 'fixed', pitch: 4,
                     coords: [[-0.798, 41.572], [-0.797, 41.572], [-0.797, 41.573]], holes: [] }];
      MIX_PROP = null;
      $('pitchFija').value = '3.7'; $('tableFija').value = '2V'; $('azRowsFija').value = '135';
      const st = estadoSesion();
      MIX_ZONAS = []; $('pitchFija').value = '4'; $('tableFija').value = '1V'; $('azRowsFija').value = '180';
      aplicaSesion(JSON.parse(JSON.stringify(st)));
      return { zonas: MIX_ZONAS.length, nombre: MIX_ZONAS[0] && MIX_ZONAS[0].nombre,
               pf: $('pitchFija').value, tf: $('tableFija').value, az: $('azRowsFija').value };
    } finally {
      MIX_ZONAS = antes.z; MIX_PROP = antes.p;
      $('pitchFija').value = antes.pf; $('tableFija').value = antes.tf; $('azRowsFija').value = antes.az;
      mixPinta();
    }
  });
  check('sesion · el reparto SOBREVIVE a guardar y restaurar',
    sesion.zonas === 1 && sesion.nombre === 'fija-1', JSON.stringify(sesion));
  check('sesion · los campos por montaje (pitch/tabla/azimut de la fija) sobreviven',
    sesion.pf === '3.7' && sesion.tf === '2V' && sesion.az === '135', JSON.stringify(sesion));


  /* ── RELLENO DE FIJA en el sobrante del tracker (2026-08-28, «no
   * aprovecha los huecos donde no entra tracker... mal pensado») ───────── */
  const relleno = await page.evaluate(() => {
    const k = 111320 * Math.cos(41.57 * Math.PI / 180), ky = 110540;
    const X = m => -0.800 + m / k, Y = m => 41.570 + m / ky;
    // L: brazo grande 200x150 + brazo chico 30x60 — la fila de tracker (64 m)
    // NO cabe en el brazo chico; una mesa fija de talla 7 (8,1 m) sí
    const L = [[X(0),Y(0)],[X(200),Y(0)],[X(200),Y(150)],[X(30),Y(150)],[X(30),Y(210)],[X(0),Y(210)]];
    const cfg = { coords: L, holes: [], exclusions: [], mount: 'tracker', table: '1V',
      mods: [28, 14, 7], modLen: 2.382, modWid: 1.134, moduleWp: 630, pitch: 6, setback: 0,
      panelAz: 270, bifila: true, gapModules: 0.02, gapMotor: 0.5, gapNs: 0.5,
      roadEvery: 0, roadW: 4, roadNsEvery: 0, roadNsW: 4, mode: 'adaptive',
      minStructs: 2, rowOffset: 'none', alignGrid: false, center: true, rellenoFija: true };
    const Z = [{ nombre: 'trk', coords: L, holes: [], mount: 'tracker', pitch: 6 }];
    const R = computaMixto(cfg, Z);
    const sin = computaMixto(Object.assign({}, cfg, { rellenoFija: false }), Z);
    return { mesasRelleno: R.structures.filter(e => /^relleno/.test(e.zona)).length,
             aviso: R.avisos.some(a => a.codigo === 'relleno_fija'),
             sinRelleno: sin.structures.filter(e => /^relleno/.test(e.zona)).length,
             vacias: R.porZona.filter(p => /^relleno/.test(p.nombre) && !p.structures).length };
  });
  check('relleno · el brazo donde no cabe fila de tracker se planta con FIJA',
    relleno.mesasRelleno > 0, JSON.stringify(relleno));
  check('relleno · con aviso que lo cuenta, sin zonas de relleno vacías, y apagable',
    relleno.aviso && relleno.vacias === 0 && relleno.sinRelleno === 0, JSON.stringify(relleno));

  /* ── SELECTOR Fija / Tracker / Mixto con panes en gris ────────────────── */
  const modos = await page.evaluate(() => {
    const antes = $('mount').value, out = {};
    function estado() {
      return { trkDis: $('pitchTrk').disabled, fijaDis: $('pitchFija').disabled,
               opTrk: $('paneTracker').style.opacity, opFija: $('paneFija').style.opacity };
    }
    try {
      $('mount').value = 'fija'; syncAz(); out.fija = estado();
      $('mount').value = 'tracker'; syncAz(); out.tracker = estado();
      $('mount').value = 'mixto'; syncAz(); out.mixto = estado();
      // y readCfg en modo FIJA: mandan las casillas del pane de la fija
      $('mount').value = 'fija'; syncAz();
      const g = { az: $('azRowsFija').value, tf: $('tableFija').value, pf: $('pitchFija').value };
      $('azRowsFija').value = '135'; $('tableFija').value = '2V'; $('pitchFija').value = '3.5';
      window.PARCEL = window.PARCEL || [[-0.800, 41.570], [-0.795, 41.570], [-0.795, 41.575], [-0.800, 41.575]];
      const cfg = readCfg();
      out.cfgFija = { panelAz: cfg.panelAz, table: cfg.table, pitch: cfg.pitch, mount: cfg.mount };
      $('azRowsFija').value = g.az; $('tableFija').value = g.tf; $('pitchFija').value = g.pf;
      return out;
    } finally { $('mount').value = antes; syncAz(); }
  });
  check('modos · en FIJA el pane del tracker queda BLOQUEADO (gris y sin tocar)',
    modos.fija.trkDis === true && modos.fija.fijaDis === false
      && parseFloat(modos.fija.opTrk) < 1, JSON.stringify(modos.fija));
  check('modos · en TRACKER el pane de la fija queda bloqueado',
    modos.tracker.fijaDis === true && modos.tracker.trkDis === false, JSON.stringify(modos.tracker));
  check('modos · en MIXTO los dos panes quedan plenos y editables',
    modos.mixto.trkDis === false && modos.mixto.fijaDis === false
      && modos.mixto.opTrk === '1' && modos.mixto.opFija === '1', JSON.stringify(modos.mixto));
  check('modos · en FIJA mandan las casillas de SU pane (azimut 135, tabla 2V, pitch 3.5)',
    modos.cfgFija.panelAz === 135 && modos.cfgFija.table === '2V'
      && Math.abs(modos.cfgFija.pitch - 3.5) < 1e-9, JSON.stringify(modos.cfgFija));

  // el modo MIXTO sin zonas se NIEGA con el motivo, no calcula otra cosa
  const gate = await page.evaluate(async () => {
    const antes = { m: $('mount').value, z: MIX_ZONAS, par: window.PARCEL };
    try {
      window.PARCEL = [[-0.800, 41.570], [-0.795, 41.570], [-0.795, 41.575], [-0.800, 41.575]];
      MIX_ZONAS = [];
      $('mount').value = 'mixto'; syncAz();
      await generar();
      return $('foot').textContent;
    } finally {
      $('mount').value = antes.m; MIX_ZONAS = antes.z; window.PARCEL = antes.par; syncAz();
    }
  });
  check('modos · MIXTO sin zonas se niega con el motivo («necesita zonas»)',
    /MIXTO necesita zonas/.test(gate), JSON.stringify(gate).slice(0, 160));


  /* ── UN solo albedo, en Terreno (2026-08-28, «el albedo está duplicado») ── */
  const albedo = await page.evaluate(() => {
    const antes = $('mount').value, vis = el => el.offsetParent !== null, out = {};
    try {
      ['fija', 'tracker', 'mixto'].forEach(m => {
        $('mount').value = m; syncAz();
        out[m] = { terreno: vis($('albedoT')), pane: vis($('albedo')) };
      });
      $('albedoT').value = '0.31'; $('albedoT').dispatchEvent(new Event('input'));
      out.sync = $('albedo').value;
      return out;
    } finally { $('mount').value = antes; syncAz(); }
  });
  check('albedo · UNO solo en pantalla (Terreno) en los tres modos, y sincronizado',
    ['fija', 'tracker', 'mixto'].every(m => albedo[m].terreno && !albedo[m].pane)
      && albedo.sync === '0.31', JSON.stringify(albedo));

  await browser.close();
  console.log('\n' + ok + ' OK · ' + ko + ' FALLOS');
  process.exit(ko ? 1 : 0);
})();
