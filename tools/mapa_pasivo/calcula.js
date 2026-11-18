#!/usr/bin/env node
// EL LOTE DEL MAPA DE GANANCIA DEL PASIVO — la mitad «cálculo».
//
// Corre, nodo a nodo, EL MISMO MOTOR que la pestaña «Mapa» de sim-viento.html.
// No lo copia: lee `sim-viento.html` y ejecuta su bloque `LOC` tal cual, así
// que un cambio en la física de la ficha llega al lote sin tocar este fichero.
// Lo que le da de comer es la meteo que deja `era5.py` (ERA5 de Copernicus),
// convertida a la forma de Open-Meteo y leída con el MISMO lector de la ficha
// (`LOC._omParse`).
//
//   node calcula.js nodos   --repo . --pais ESP --anio 2022 --paso 0.25 --salida nodos.json
//   node calcula.js calcula --repo . --nodos nodos.json --meteo meteo.bin \
//                           --config mapa-pasivo_config.json --salida data/mapas_pais/pasivo
//   node calcula.js indice  --salida data/mapas_pais/pasivo
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { o[a.slice(2)] = argv[i + 1]; i++; } else o._.push(a);
  }
  return o;
}
const muere = m => { console.error('ERROR · ' + m); process.exit(1); };

// ── el motor de la ficha ──
function cargaMotor(repo) {
  const ruta = path.join(repo, 'sim-viento.html');
  const H = fs.readFileSync(ruta, 'utf8');
  const a = H.indexOf('var LOC={'), b = H.indexOf('/* ===================== EMPLAZAMIENTOS');
  if (a < 0 || b < a) muere('no encuentro el bloque LOC en ' + ruta);
  const ctx = { console, Math, Date, JSON, Float64Array, Float32Array, Int32Array, Uint8Array, Array,
    Object, Promise, setTimeout, URL, Number, String, isFinite, isNaN, Error, performance };
  ctx.window = ctx;
  ctx.fetch = () => Promise.reject(new Error('el lote no pide nada a la red'));
  vm.createContext(ctx);
  vm.runInContext(H.slice(a, b) + '\n;this.LOC=LOC;', ctx, { filename: 'sim-viento.html#LOC' });
  if (!ctx.LOC.mapaCuerpoLote) muere('este sim-viento.html no tiene el motor del mapa');
  return { LOC: ctx.LOC, sha256: crypto.createHash('sha256').update(H).digest('hex').slice(0, 16) };
}
function cargaPais(repo, iso3) {
  const dir = path.join(repo, 'data', 'mapas_pais');
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'indice.json'), 'utf8'));
  const e = idx[iso3]; if (!e) muere('país sin lámina en data/mapas_pais: ' + iso3);
  const meta = e.variables && (e.variables.viento || e.variables.irradiancia);
  const ficha = JSON.parse(fs.readFileSync(path.join(dir, meta.ficha), 'utf8'));
  const rej = JSON.parse(fs.readFileSync(path.join(dir, ficha.rejilla), 'utf8'));
  const lib = fs.readFileSync(path.join(repo, 'lib', 'mapas-pais.js'), 'utf8');
  const iv = lib.indexOf('function valorEn(rej, lat, lon) {'), jv = lib.indexOf('\n  }', iv);
  if (iv < 0) muere('no encuentro valorEn en lib/mapas-pais.js');
  const valorEn = vm.runInNewContext('(' + lib.slice(iv, jv + 4) + ')');
  return { pais: e.nombre, iso3, rej, valorEn };
}

// ── meteo.bin (lo escribe era5.py) ──
function abreMeteo(ruta) {
  const fd = fs.openSync(ruta, 'r'), b4 = Buffer.alloc(4);
  fs.readSync(fd, b4, 0, 4, 0);
  const L = b4.readUInt32LE(0), bc = Buffer.alloc(L);
  fs.readSync(fd, bc, 0, L, 4);
  const cab = JSON.parse(bc.toString('utf8'));
  if (cab.formato !== 'factiun-meteo-nodos') muere(ruta + ': no es un meteo.bin del lote');
  const nc = cab.columnas.length, nh = cab.n_horas, off = 4 + L, bytesNodo = nc * nh * 4;
  return {
    cab,
    nodo(k) {
      const buf = Buffer.alloc(bytesNodo);
      fs.readSync(fd, buf, 0, bytesNodo, off + k * bytesNodo);
      const f = new Float32Array(buf.buffer, buf.byteOffset, nc * nh), o = {};
      cab.columnas.forEach((c, i) => { o[c] = f.subarray(i * nh, (i + 1) * nh); });
      return o;
    },
    cierra() { fs.closeSync(fd); }
  };
}
/* La meteo de un nodo con la FORMA de la respuesta de Open-Meteo, para que la
   lea `LOC._omParse` — el mismo lector que en la ficha. */
function comoOpenMeteo(cab, c) {
  const nh = cab.n_horas, t0 = Date.parse(cab.t0), time = new Array(nh);
  for (let i = 0; i < nh; i++) time[i] = new Date(t0 + i * cab.dt_s * 1000).toISOString().slice(0, 16);
  const a = x => Array.from(x, v => (v === v ? v : null));
  return { hourly: { time, shortwave_radiation: a(c.ghi), diffuse_radiation: a(c.dhi),
    direct_normal_irradiance: a(c.dni), temperature_2m: a(c.temp), windspeed_10m: a(c.ws),
    winddirection_10m: a(c.wd), wind_gusts_10m: a(c.gust) } };
}

// ── órdenes ──
function ordenNodos(o) {
  const paso = +o.paso, anio = +o.anio;
  if (!(paso > 0) || Math.abs(paso / 0.25 - Math.round(paso / 0.25)) > 1e-9)
    muere('el lote usa ERA5, cuya rejilla es de 0,25°: el paso tiene que ser múltiplo de 0,25 (0.25, 0.5, 0.75, 1, 2)');
  if (!(anio >= 1940 && anio <= new Date().getUTCFullYear())) muere('año fuera de ERA5: ' + o.anio);
  const { LOC } = cargaMotor(o.repo || '.');
  const P = cargaPais(o.repo || '.', o.pais);
  const plan = LOC.mapaNodos(P.rej, paso, P.valorEn);
  if (plan.regla !== 'punto') muere(P.pais + ' es pequeño para ' + paso + '°: baja el paso');
  const out = { iso3: P.iso3, pais: P.pais, year: anio, paso, regla: plan.regla,
    nodos: plan.nodos.map(n => [n.lat, n.lon]) };
  fs.writeFileSync(o.salida, JSON.stringify(out));
  console.log(P.pais + ' · ' + anio + ' · ' + paso + '° → ' + out.nodos.length + ' nodos');
}

async function ordenCalcula(o) {
  const repo = o.repo || '.';
  const { LOC, sha256 } = cargaMotor(repo);
  const N = JSON.parse(fs.readFileSync(o.nodos, 'utf8'));
  const C = JSON.parse(fs.readFileSync(o.config, 'utf8'));
  if (C.formato !== LOC.MAPA.LAMINA_FORMATO + '-config') muere(o.config + ': no es la configuración del mapa (botón «Configuración para el NAS» de la pestaña Mapa)');
  const refs = (C.refs && C.refs.length ? C.refs : LOC.MAPA.REFS).filter(r => LOC.MAPA.REFS.indexOf(r) >= 0);
  const opc = { year: N.year, step: C.opciones.step, rafaga: !!C.opciones.rafaga };
  const conf = C.configuracion;
  if (!conf.passive || !(conf.passive.n_trackers >= 1)) muere('la configuración no trae el caso pasivo con nº de trackers');
  const MT = abreMeteo(o.meteo);
  if (MT.cab.year !== N.year || MT.cab.nodos.length !== N.nodos.length) muere('meteo.bin no es de estos nodos/año');
  const nodos = [], fallos = [], t0 = Date.now();
  for (let k = 0; k < N.nodos.length; k++) {
    const [lat, lon] = N.nodos[k], [mlat, mlon] = MT.cab.nodos[k];
    if (Math.abs(lat - mlat) > 1e-6 || Math.abs(lon - mlon) > 1e-6) muere('el nodo ' + k + ' no coincide con meteo.bin');
    try {
      const M = await LOC._omParse(comoOpenMeteo(MT.cab, MT.nodo(k)), false);
      M.source = 'era5_cds';
      if (opc.rafaga && !M.tiene_rafaga) throw new Error('el nodo no tiene ráfaga');
      const rep = await LOC.run(LOC.mapaCuerpoLote(conf, { lat, lon }, opc, refs, M));
      const n = LOC.mapaNodoLamina(rep, refs);
      if (!n) throw new Error('la corrida no ha devuelto los casos');
      nodos.push([lat, lon, n]);
    } catch (e) { fallos.push([lat, lon, String(e && e.message || e)]); }
    if ((k + 1) % 25 === 0 || k === N.nodos.length - 1) {
      const s = (Date.now() - t0) / 1000, eta = s / (k + 1) * (N.nodos.length - k - 1);
      console.log('  ' + (k + 1) + '/' + N.nodos.length + ' nodos · ' + s.toFixed(0) + ' s · faltan ~' + Math.ceil(eta / 60) + ' min' + (fallos.length ? ' · ' + fallos.length + ' sin dato' : ''));
    }
  }
  MT.cierra();
  if (!nodos.length) muere('ningún nodo calculado: ' + (fallos[0] || [])[2]);
  const resumen = {};
  refs.forEach(r => { resumen[r] = LOC.mapaResumen(nodos.map(n => ({ lat: n[0], g: LOC.mapaDeLamina(n[2], r) }))); });
  const doc = { formato: LOC.MAPA.LAMINA_FORMATO, v: 1, iso3: N.iso3, pais: N.pais, year: N.year, paso: N.paso,
    regla: N.regla, refs, opciones: { step: opc.step, rafaga: opc.rafaga }, configuracion: conf,
    fuente: MT.cab.fuente, generado: new Date().toISOString(),
    motor: { sim_viento_sha256: sha256, commit: process.env.GIT_SHA || null },
    definicion: '100·(POA planta con pasivo − POA planta con activo)/POA planta con activo',
    resumen, n_nodos: nodos.length, nodos, fallos };
  fs.mkdirSync(o.salida, { recursive: true });
  const fich = N.iso3 + '_' + N.year + '_' + String(N.paso) + '.json';
  fs.writeFileSync(path.join(o.salida, fich), JSON.stringify(doc));
  console.log('→ ' + path.join(o.salida, fich) + ' · ' + nodos.length + ' nodos' + (fallos.length ? ' · ' + fallos.length + ' sin dato' : '') +
    ' · ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  refs.forEach(r => { const S = resumen[r]; console.log('   ' + r + ': ganancia media ' + S.media.toFixed(3) + ' % (mín ' + S.min.toFixed(3) + ', máx ' + S.max.toFixed(3) + ')'); });
  ordenIndice(o);
}

/* El índice se REHACE leyendo lo que hay en la carpeta, no se edita: así no
   puede quedar apuntando a un fichero que no está. */
function ordenIndice(o) {
  const dir = o.salida, L = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.json') || f === 'indice.json') continue;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (d.formato !== 'factiun-mapa-pasivo') continue;
      L.push({ fichero: f, iso3: d.iso3, pais: d.pais, year: d.year, paso: d.paso, n_nodos: d.n_nodos,
        refs: d.refs, suelta_kmh: d.configuracion.passive && d.configuracion.passive.release_kmh,
        fuente: d.fuente, generado: d.generado });
    } catch (e) { console.error('  (ignoro ' + f + ': ' + e.message + ')'); }
  }
  L.sort((a, b) => a.pais.localeCompare(b.pais, 'es') || b.year - a.year || a.paso - b.paso);
  fs.writeFileSync(path.join(dir, 'indice.json'), JSON.stringify({ formato: 'factiun-mapa-pasivo-indice', laminas: L }, null, 1));
  console.log('→ ' + path.join(dir, 'indice.json') + ' · ' + L.length + ' mapa(s)');
}

const o = args(process.argv.slice(2)), orden = o._[0];
if (orden === 'nodos') ordenNodos(o);
else if (orden === 'calcula') ordenCalcula(o).catch(e => muere(e.stack || e));
else if (orden === 'indice') ordenIndice(o);
else muere('orden: nodos | calcula | indice');
