/* FACTIUN · Lógica de alarma de viento (pre-stow / stow) SIMULADA sobre medidas reales.
 *
 * Qué es: una simulación de cómo FUNCIONARÍA una lógica de control dada sobre el
 * viento que midieron las HSU. No es un estudio de cómo funcionó la planta:
 *   · el viento sale de las medidas (máximo de ráfaga por minuto de cada HSU);
 *   · la posición del seguidor es TEÓRICA — seguimiento astronómico de un eje
 *     N-S con backtracking sobre terreno plano — y no se lee de ninguna TCU.
 *
 * La lógica (parámetros en WIND_LOGIC_DEFAULTS):
 *   · pre-stow: lectura > prestowKmh  → el rango de operación se limita a
 *     prestowMinDeg … stowDeg, a un lado u otro;
 *   · stow:     lectura > stowKmh     → stowDeg al lado más cercano a la
 *     posición del seguidor en el momento de la activación;
 *   · desactivación: holdMin minutos después de la última lectura sobre umbral;
 *   · noche: posición nightDeg al Este; cualquier alarma de noche hace un único
 *     movimiento a stowDeg Este, sin vuelta a la posición de noche.
 *
 * Lo que la lógica NO define se decide con dos opciones a la vista (no escondidas):
 *   · noonRule — pre-stow activo al cruzar el mediodía solar: "hold" mantiene el
 *     lado en prestowMinDeg; "follow" sigue al sol y cruza por horizontal;
 *   · duskRule — alarma activa al anochecer: "east" va a stowDeg Este; "hold" se
 *     queda donde está hasta que la alarma termina.
 *
 * Convención: ángulos en grados, ESTE NEGATIVO y OESTE POSITIVO. Tiempos en UTC.
 * Módulo puro: sin DOM, sin red y sin importaciones. La posición solar se
 * inyecta (la canónica es solarPosition de lib/meteo-browser.js).
 */
export const WIND_LOGIC_VERSION = "1.5.0";

export const WIND_LOGIC_DEFAULTS = Object.freeze({
  prestowKmh: 40, stowKmh: 60, holdMin: 30,
  episodeGapMin: 120,        // activaciones que vuelven a saltar antes de este margen son el mismo episodio de viento (0: no unir)
  prestowMinDeg: 30, stowDeg: 55, maxDeg: 55, nightDeg: 5,
  pitchM: 6, chordM: 2.382, axisAzimuthDeg: 180,
  noonRule: "hold", duskRule: "hold",   // al anochecer con alarma activa el seguidor se queda donde está (confirmado por Posventa, 13/11/2026)
  speedDegPerMin: null,      // null: sin tiempos de tránsito (posición teórica de cada instante)
  toleranceDeg: 0.5,
  zeroRunMin: 10             // lecturas exactamente a cero seguidas que se dan por sensor mudo
});

const D2R = Math.PI / 180, R2D = 180 / Math.PI, MIN = 60000;
/* Es de día mientras el sol se VE sobre el horizonte: la refracción lo levanta unos
 * 0,57° justo ahí, así que el corte no está en la elevación geométrica 0° sino algo
 * por debajo. Es el mismo criterio que la elevación aparente de pvlib. */
export const HORIZON_REFRACTION_DEG = 0.5667;
const WIND_VARIABLES = ["wind_peak", "wind_gust", "wind_speed"];
const fin = x => typeof x === "number" && Number.isFinite(x);
const sgn = (x, fallback) => x < 0 ? -1 : x > 0 ? 1 : fallback;
const round1 = x => Math.round(x * 10) / 10;

const OPTION_LABELS = {
  prestowKmh: "umbral de pre-stow", stowKmh: "umbral de stow", holdMin: "tiempo de desactivación", episodeGapMin: "margen para unir episodios",
  prestowMinDeg: "rango mínimo de pre-stow", stowDeg: "posición de stow", maxDeg: "rango de giro", nightDeg: "posición de noche",
  pitchM: "pitch", chordM: "ancho del módulo", axisAzimuthDeg: "azimut del eje", toleranceDeg: "tolerancia", zeroRunMin: "racha de ceros"
};
export function windLogicOptions(input = {}) {
  const o = { ...WIND_LOGIC_DEFAULTS };
  for (const [k, v] of Object.entries(input || {})) if (k in o && v !== undefined) o[k] = v;
  for (const k of ["prestowKmh", "stowKmh", "holdMin", "episodeGapMin", "prestowMinDeg", "stowDeg", "maxDeg", "nightDeg", "pitchM", "chordM", "axisAzimuthDeg", "toleranceDeg", "zeroRunMin"]) {
    o[k] = Number(o[k]);
    if (!fin(o[k])) throw new Error("Falta un valor numérico: " + (OPTION_LABELS[k] || k) + ".");
  }
  o.speedDegPerMin = o.speedDegPerMin === null || o.speedDegPerMin === "" ? null : Number(o.speedDegPerMin);
  if (o.speedDegPerMin !== null && !(o.speedDegPerMin > 0)) throw new Error("La velocidad de giro debe ser mayor que cero, o quedar vacía.");
  if (!(o.prestowKmh > 0) || !(o.stowKmh > o.prestowKmh)) throw new Error("El umbral de stow debe ser mayor que el de pre-stow, y ambos positivos.");
  if (!(o.holdMin >= 1)) throw new Error("El tiempo de desactivación debe ser de al menos 1 minuto.");
  if (!(o.episodeGapMin >= 0)) throw new Error("El margen para unir episodios no puede ser negativo.");
  o.episodeGapMin = Math.round(o.episodeGapMin);
  if (!(o.stowDeg > 0 && o.stowDeg <= 90) || !(o.maxDeg > 0 && o.maxDeg <= 90)) throw new Error("Posición de stow o rango de giro fuera de 0–90°.");
  if (!(o.prestowMinDeg >= 0 && o.prestowMinDeg <= o.stowDeg)) throw new Error("El rango de pre-stow debe empezar entre 0° y la posición de stow.");
  if (!(o.stowDeg <= o.maxDeg)) throw new Error("La posición de stow no puede superar el rango de giro del seguidor.");
  if (!(o.nightDeg >= 0 && o.nightDeg <= o.maxDeg)) throw new Error("Posición de noche fuera del rango de giro.");
  if (!(o.pitchM > 0) || !(o.chordM > 0) || !(o.chordM < o.pitchM)) throw new Error("Geometría inválida: el ancho del módulo debe ser menor que el pitch.");
  if (!["hold", "follow"].includes(o.noonRule)) throw new Error("noonRule desconocida.");
  if (!["east", "hold"].includes(o.duskRule)) throw new Error("duskRule desconocida.");
  o.holdMin = Math.round(o.holdMin);
  return o;
}

/* Posición TEÓRICA del seguidor con el sol dado. De noche, la posición de noche. */
export function theoreticalTrackerAngle(sun, options) {
  const o = options, el = Number(sun?.elevation_deg), az = Number(sun?.azimuth_deg);
  if (!fin(el) || !fin(az) || !(el > -HORIZON_REFRACTION_DEG)) return { night: true, theta: -o.nightDeg };
  const x = Math.cos(el * D2R) * Math.sin((az - o.axisAzimuthDeg) * D2R), z = Math.sin(el * D2R);
  let w = Math.atan2(x, z) * R2D;                      // seguimiento ideal
  const t = Math.abs(Math.cos(w * D2R)) * o.pitchM / o.chordM;
  if (t < 1) w -= Math.sign(w) * Math.acos(t) * R2D;    // backtracking (Anderson–Mikofski), terreno plano
  return { night: false, theta: Math.max(-o.maxDeg, Math.min(o.maxDeg, w)) };
}

/* Serie minutal por grupo (NCU): el MÁXIMO de sus sensores en cada minuto, en km/h.
 * Una lectura vacía no es un cero: sólo entran valores numéricos. */
export function windSeriesByGroup(records, { plant = "" } = {}) {
  const mine = (records || []).filter(r => r && (!plant || r.plant === plant) && fin(r.value));
  const variable = WIND_VARIABLES.find(v => mine.some(r => r.variable === v && (r.unit === "m/s" || r.unit === "km/h")));
  if (!variable) return { variable: null, groups: [] };
  const groups = new Map(), perSensor = new Map(), dirs = new Map();
  const sensorKey = r => String(r.ncu ?? "") + "\u241f" + String(r.sensor ?? "");
  // La dirección que da cada sensor en cada minuto, si las medidas la traen (grados, de dónde viene el viento).
  for (const r of mine) if (r.variable === "wind_direction" && r.value >= 0 && r.value <= 360) {
    const ms = Date.parse(r.t); if (!Number.isFinite(ms)) continue;
    const k = sensorKey(r); if (!dirs.has(k)) dirs.set(k, new Map());
    dirs.get(k).set(Math.floor(ms / MIN), Math.round(r.value) % 360);
  }
  for (const r of mine) {
    if (r.variable !== variable) continue;
    const factor = r.unit === "m/s" ? 3.6 : r.unit === "km/h" ? 1 : null;
    if (factor === null) continue;
    const ms = Date.parse(r.t); if (!Number.isFinite(ms)) continue;
    const key = String(r.ncu ?? "");
    if (!groups.has(key)) groups.set(key, { key, label: key ? "NCU " + key : "Planta (sin NCU declarada)", sensors: new Set(), byMinute: new Map(), who: new Map() });
    const g = groups.get(key), m = Math.floor(ms / MIN), kmh = r.value * factor, old = g.byMinute.get(m);
    g.sensors.add(String(r.sensor ?? ""));
    if (old === undefined || kmh > old) { g.byMinute.set(m, kmh); g.who.set(m, String(r.sensor ?? "")); }
    const sk = sensorKey(r);
    if (!perSensor.has(sk)) perSensor.set(sk, { ncu: key, name: String(r.sensor ?? ""), byMinute: new Map() });
    const sm = perSensor.get(sk).byMinute, so = sm.get(m);
    if (so === undefined || kmh > so) sm.set(m, kmh);
  }
  const out = [...groups.values()].map(g => {
    const minutes = [...g.byMinute.keys()].sort((a, b) => a - b), names = [...g.sensors].sort();
    const src = minutes.map(m => names.indexOf(g.who.get(m))), dir = minutes.map((m, i) => dirs.get(g.key + "\u241f" + names[src[i]])?.get(m) ?? -1);
    return { key: g.key, label: g.label, sensors: names, minutes, kmh: minutes.map(m => g.byMinute.get(m)), dir: dir.some(d => d >= 0) ? dir : null, src };
  }).sort((a, b) => a.key.localeCompare(b.key, "es", { numeric: true }));
  // Cada sensor por separado, para saber cuál detecta más viento: each(fn) recorre sus lecturas en orden.
  const sensors = [...perSensor.values()].map(x => {
    const minutes = [...x.byMinute.keys()].sort((a, b) => a - b), d = dirs.get(x.ncu + "\u241f" + x.name);
    const give = (fn, a, b) => { for (const m of minutes) if (m >= a && m <= b) fn(m, x.byMinute.get(m), d?.get(m) ?? -1); };
    return { ncu: x.ncu, name: x.name, each(fn) { give(fn, -Infinity, Infinity); }, range(a, b, fn) { give(fn, a, b); } };
  }).sort(bySensor);
  return { variable, groups: out, sensors };
}
const bySensor = (a, b) => a.ncu.localeCompare(b.ncu, "es", { numeric: true }) || a.name.localeCompare(b.name, "es", { numeric: true });

/* Lo mismo que windSeriesByGroup, pero sin pasar por lecturas sueltas: se alimenta
 * página a página con filas «un sensor, un día» tal como las guarda la base
 * (`t` en segundos desde medianoche UTC y `vmax` en m/s, o la serie entera) y guarda
 * 1.440 valores por sensor y día. Un año de una planta cabe en pocos megas, así que
 * no hace falta poner tope al periodo.
 * Mismas reglas que el lector general: una reimportación sustituye a la anterior y
 * nunca se suma; sin UTC no entra; un escalar es un hueco de esquema, no 1.440 ceros. */
export function createWindSeriesBuilder() {
  const days = new Map();
  const diagnostics = { rows: 0, repeatedUploads: 0, withoutUtc: 0, invalidSeries: 0, scalarPlaceholders: 0, missingValues: 0 };
  return {
    add(rows) {
      for (const row of rows || []) {
        diagnostics.rows++;
        if (row.tz !== "UTC") { diagnostics.withoutUtc++; continue; }
        const t = row.t ?? row.series?.t, v = row.vmax ?? row.series?.v?.wind_speed_max, d = row.vdir ?? row.series?.v?.wind_direction, start = Date.parse(row.dia + "T00:00:00Z");
        if (!Array.isArray(t) || !Number.isFinite(start)) { diagnostics.invalidSeries++; continue; }
        if (!Array.isArray(v)) { diagnostics.scalarPlaceholders++; continue; }
        if (v.length !== t.length) { diagnostics.invalidSeries++; continue; }
        const key = [row.ncu, row.equipo, row.dia].join("\u241f"), old = days.get(key);
        if (old) {
          diagnostics.repeatedUploads++;
          const newer = String(row.subido || "") > old.subido || (String(row.subido || "") === old.subido && Number(row.id) > old.id);
          if (!newer) continue;
        }
        // La dirección (grados, de dónde viene) es la de la lectura más alta del minuto; -1 si el sensor no la da.
        const values = new Float64Array(1440).fill(NaN), dirs = Array.isArray(d) && d.length === t.length ? new Int16Array(1440).fill(-1) : null;
        for (let i = 0; i < t.length; i++) {
          const second = t[i], value = v[i];
          if (!fin(second) || second < 0 || second >= 86400 || !fin(value)) { diagnostics.missingValues++; continue; }
          const k = Math.floor(second / 60), kmh = value * 3.6;
          if (!(values[k] >= kmh)) { values[k] = kmh; if (dirs && fin(d[i]) && d[i] >= 0 && d[i] <= 360) dirs[k] = Math.round(d[i]) % 360; }
        }
        days.set(key, { ncu: String(row.ncu ?? ""), sensor: String(row.equipo ?? ""), day: start / MIN, subido: String(row.subido || ""), id: Number(row.id), values, dirs });
      }
    },
    finish() {
      const groups = new Map();
      for (const d of days.values()) {
        if (!groups.has(d.ncu)) groups.set(d.ncu, { sensors: new Set(), byDay: new Map() });
        const g = groups.get(d.ncu); g.sensors.add(d.sensor);
        if (!g.byDay.has(d.day)) g.byDay.set(d.day, []);
        g.byDay.get(d.day).push(d);
      }
      const out = [...groups].map(([key, g]) => {
        const names = [...g.sensors].sort(), minutes = [], kmh = [], dir = [], src = []; let anyDir = false;
        for (const day of [...g.byDay.keys()].sort((a, b) => a - b)) {
          const lists = g.byDay.get(day), idx = lists.map(d => names.indexOf(d.sensor));
          for (let k = 0; k < 1440; k++) {
            let max = NaN, who = -1;
            for (let q = 0; q < lists.length; q++) { const x = lists[q].values[k]; if (x === x && !(max >= x)) { max = x; who = q; } }
            if (who < 0) continue;
            const dd = lists[who].dirs ? lists[who].dirs[k] : -1;
            minutes.push(day + k); kmh.push(max); dir.push(dd); src.push(idx[who]); if (dd >= 0) anyDir = true;
          }
        }
        // `dir`: dirección que da, en cada minuto, el sensor con la racha más alta; `src`: cuál es ese sensor.
        return { key, label: key ? "NCU " + key : "Planta (sin NCU declarada)", sensors: names, minutes, kmh, dir: anyDir ? dir : null, src };
      }).filter(g => g.minutes.length).sort((a, b) => a.key.localeCompare(b.key, "es", { numeric: true }));
      // Cada sensor por separado, sin copiar nada: se recorren sus días ya guardados.
      const perSensor = new Map();
      for (const d of days.values()) {
        const sk = d.ncu + "\u241f" + d.sensor;
        if (!perSensor.has(sk)) perSensor.set(sk, { ncu: d.ncu, name: d.sensor, list: [] });
        perSensor.get(sk).list.push(d);
      }
      const sensors = [...perSensor.values()].map(x => {
        x.list.sort((a, b) => a.day - b.day);
        const give = (fn, a, b) => { for (const d of x.list) if (d.day + 1439 >= a && d.day <= b) for (let k = 0; k < 1440; k++) { const v = d.values[k], m = d.day + k; if (v === v && m >= a && m <= b) fn(m, v, d.dirs ? d.dirs[k] : -1); } };
        return { ncu: x.ncu, name: x.name, each(fn) { give(fn, -Infinity, Infinity); }, range(a, b, fn) { give(fn, a, b); } };
      }).sort(bySensor);
      return { variable: out.length ? "wind_peak" : null, groups: out, sensors, diagnostics: { ...diagnostics, sensorDays: days.size } };
    }
  };
}

/* Activaciones: una alarma dura desde la primera lectura sobre umbral hasta holdMin
 * minutos después de la ÚLTIMA; una lectura sobre umbral más tarde es otra activación. */
export function detectActivations(minutes, kmh, thresholdKmh, holdMin, dir = null, src = null) {
  const events = [], span = []; let cur = null, sp = null;
  for (let i = 0; i < minutes.length; i++) {
    if (!(kmh[i] > thresholdKmh)) continue;
    const m = minutes[i];
    if (!cur || m - cur.last > holdMin) { cur = { start: m, last: m, end: m + holdMin, peakKmh: kmh[i], minutesOver: 0 }; events.push(cur); sp = { a: i, b: i, p: i }; span.push(sp); }
    cur.last = m; cur.end = m + holdMin; cur.minutesOver++; sp.b = i;
    if (kmh[i] > cur.peakKmh) { cur.peakKmh = kmh[i]; sp.p = i; }
  }
  // Con dirección: la media (circular) de las lecturas sobre umbral del sensor que da la racha máxima.
  // Así no se mezclan sensores que pueden no estar orientados igual.
  if (dir || src) events.forEach((e, k) => {
    const { a, b, p } = span[k]; let sx = 0, sy = 0;
    e.peakMinute = minutes[p]; e.peakSrc = src ? src[p] : -1; e.dirDeg = null;
    if (dir) for (let i = a; i <= b; i++) if (kmh[i] > thresholdKmh && dir[i] >= 0 && (!src || src[i] === e.peakSrc)) { sx += Math.cos(dir[i] * D2R); sy += Math.sin(dir[i] * D2R); }
    if (sx || sy) e.dirDeg = (Math.round(Math.atan2(sy, sx) * R2D) + 360) % 360;
  });
  return events;
}
/* Cómo pilla el viento al seguidor: «cara» si viene del lado al que mira el módulo, «espalda» si viene
 * del contrario (canto alto a barlovento) y «eje» si viene a menos de 30° de la dirección de las filas. */
export function windExposure(dirDeg, faceSide, axisAzimuthDeg = 180) {
  if (!fin(dirDeg) || !faceSide) return null;
  const c = Math.cos((dirDeg - (axisAzimuthDeg + 90)) * D2R);      // +1: viento del lado positivo (Oeste con el eje N-S)
  return Math.abs(c) < 0.5 ? "eje" : (c > 0) === (faceSide > 0) ? "cara" : "espalda";
}

function simulateGroup(series, o, solarPosition, site) {
  const { minutes, kmh } = series, n = minutes.length;
  const pre = detectActivations(minutes, kmh, o.prestowKmh, o.holdMin, series.dir || null, series.src || null);
  const stw = detectActivations(minutes, kmh, o.stowKmh, o.holdMin, series.dir || null, series.src || null);
  pre.forEach((e, i) => { e.id = i + 1; }); stw.forEach((e, i) => { e.id = i + 1; });
  const angleAt = m => theoreticalTrackerAngle(solarPosition(new Date(m * MIN), site.lat, site.lon), o);
  const tol = o.toleranceDeg, east = -o.stowDeg;
  // Cadencia mediana de la serie: con datos más espaciados que medio rearme no se
  // puede juzgar si antes del cruce había dato, y no se marca nada como dudoso.
  const steps = []; for (let i = 1; i < n; i++) steps.push(minutes[i] - minutes[i - 1]);
  steps.sort((a, b) => a - b);
  const cadenceMin = steps.length ? steps[steps.length >> 1] : 1, coarse = cadenceMin > o.holdMin / 2;
  const expected = Math.max(1, Math.floor(o.holdMin / cadenceMin));
  const activations = [], dusk = [];
  let pos = n ? angleAt(minutes[0]).theta : 0, latched = false, side = null, stowTarget = null;
  let held = false, heldStow = null;         // de noche, con una alarma que viene del día y el seguidor quieto donde estaba
  let ip = 0, is = 0, j = 0;                 // punteros a pre-stow, stow y lecturas
  let dayData = 0, preDay = 0, stowDay = 0, wasNight = null;
  const lastMinute = n ? minutes[n - 1] : -1, m0 = n ? minutes[0] : 0;
  // Posición simulada minuto a minuto, en décimas de grado (-32768: tramo sin simular), para el detalle de un episodio.
  const trace = new Int16Array(n ? lastMinute - m0 + 1 : 0).fill(-32768);
  for (let m = m0; m <= lastMinute; m++) {
    while (ip < pre.length && pre[ip].end < m) ip++;
    while (is < stw.length && stw[is].end < m) is++;
    while (j < n && minutes[j] < m) j++;
    const P = ip < pre.length && pre[ip].start <= m, A = is < stw.length && stw[is].start <= m;
    // Hueco largo sin alarma: no hay nada que simular hasta el siguiente dato.
    if (!P && !A && j < n && minutes[j] - m > 2880) { m = minutes[j] - 1; latched = false; held = false; heldStow = null; side = null; stowTarget = null; wasNight = null; pos = angleAt(m).theta; continue; }
    const hasData = j < n && minutes[j] === m;
    const startP = P && pre[ip].start === m, startS = A && stw[is].start === m;
    const { night: N, theta: th } = angleAt(m), before = pos;
    let target;
    if (N) {
      side = null; stowTarget = null;
      if (latched) target = east;
      else if (P || A) {
        if ((startP || startS) && !held) { latched = true; target = east; }
        else if (o.duskRule === "east") {
          latched = true; target = east;
          if (wasNight === false) dusk.push({ t: m * MIN, posBefore: round1(before), target: round1(target), degrees: round1(Math.abs(target - before)) });
        } else {
          // La alarma viene del día: el seguidor se queda donde está. Si ya de noche sube a stow, va a la
          // posición de stow del lado en que ya está (la más cercana), no a cruzar por horizontal hasta el Este.
          held = true;
          if (A) { if (heldStow === null) heldStow = o.stowDeg * sgn(pos, -1); target = heldStow; } else target = pos;
          if (wasNight === false) dusk.push({ t: m * MIN, posBefore: round1(before), target: round1(target), degrees: round1(Math.abs(target - before)) });
        }
      } else { target = -o.nightDeg; held = false; heldStow = null; }
    } else {
      latched = false; held = false; heldStow = null;
      if (A) {
        if (stowTarget === null) stowTarget = o.stowDeg * sgn(pos, sgn(th, -1));
        target = stowTarget; side = sgn(stowTarget, -1);
      } else if (P) {
        stowTarget = null;
        if (side === null) side = sgn(pos, sgn(th, -1));
        if (o.noonRule === "follow") { side = sgn(th, side); target = side * Math.max(Math.abs(th), o.prestowMinDeg); }
        else target = side * (sgn(th, side) === side && Math.abs(th) >= o.prestowMinDeg ? Math.abs(th) : o.prestowMinDeg);
      } else { side = null; stowTarget = null; target = th; }
    }
    // Si las dos alarmas saltan en el mismo minuto el seguidor hace un solo movimiento. Se reparte:
    // al pre-stow, el tramo hasta su posición; al stow, el resto. Así ninguna cuenta el recorrido de la otra.
    let from = before;
    for (const [type, on, ev] of [["prestow", startP, pre[ip]], ["stow", startS, stw[is]]]) {
      if (!on) continue;
      const goal = type === "prestow" && !N && A ? sgn(target, -1) * Math.max(o.prestowMinDeg, Math.abs(from)) : target;
      const ok = type === "prestow" && !N ? Math.abs(from) >= o.prestowMinDeg - tol : Math.abs(from - goal) <= tol;
      // lecturas válidas y no nulas en la ventana anterior: si faltan, la activación es la vuelta del dato
      let valid = 0;
      for (let k = j - 1; k >= 0 && minutes[k] >= m - o.holdMin; k--) if (kmh[k] > 0) valid++;
      activations.push({
        type, id: ev.id, parentId: type === "stow" && P ? pre[ip].id : null,
        t: m * MIN, tLast: ev.last * MIN, tEnd: ev.end * MIN, durationMin: ev.end - ev.start,
        minutesOver: ev.minutesOver, peakKmh: round1(ev.peakKmh), crossKmh: round1(kmh[j]),
        night: N, thetaTheory: round1(th), posBefore: round1(from), target: round1(goal),
        alreadyOk: ok, degrees: ok ? 0 : round1(Math.abs(goal - from)),
        sameMinuteAsPrestow: type === "stow" && startP,
        doubtful: !coarse && valid < expected / 2,
        tPeak: (ev.peakMinute ?? m) * MIN, sensor: ev.peakSrc >= 0 ? series.sensors[ev.peakSrc] ?? null : null,
        dirDeg: ev.dirDeg ?? null, exposure: windExposure(ev.dirDeg, sgn(ok ? from : goal, 0), o.axisAzimuthDeg)
      });
      if (!ok) from = goal;
    }
    pos = o.speedDegPerMin === null ? target : pos + Math.max(-o.speedDegPerMin, Math.min(o.speedDegPerMin, target - pos));
    trace[m - m0] = Math.round(pos * 10);
    if (hasData && !N) { dayData++; if (P) preDay++; if (A) stowDay++; }
    wasNight = N;
  }
  // calidad del dato: rachas de ceros exactos (sensor mudo) y huecos mayores que el rearme
  const zeroRuns = []; let runStart = -1, runPrev = -1, gaps = 0;
  const closeRun = () => {
    if (runStart >= 0 && runPrev - runStart + 1 >= o.zeroRunMin) zeroRuns.push({ t: runStart * MIN, tEnd: runPrev * MIN, minutes: runPrev - runStart + 1 });
    runStart = -1; runPrev = -1;
  };
  for (let i = 0; i < n; i++) {
    if (i && minutes[i] - minutes[i - 1] > o.holdMin) gaps++;
    if (kmh[i] === 0) {
      if (runStart >= 0 && minutes[i] - runPrev === 1) runPrev = minutes[i];
      else { closeRun(); runStart = runPrev = minutes[i]; }
    } else closeRun();
  }
  closeRun();
  const dayOf = m => Math.floor(m / 1440), days = new Set(), daysPre = new Set(), daysStow = new Set();
  const dataHours = []; let lastHour = null;
  let peak = null, overPre = 0, overStow = 0;
  for (let i = 0; i < n; i++) {
    days.add(dayOf(minutes[i]));
    const hr = Math.floor(minutes[i] / 60); if (hr !== lastHour) { dataHours.push(hr); lastHour = hr; }   // horas UTC con algún dato, en orden
    if (peak === null || kmh[i] > peak) peak = kmh[i];
    if (kmh[i] > o.prestowKmh) { overPre++; daysPre.add(dayOf(minutes[i])); }
    if (kmh[i] > o.stowKmh) { overStow++; daysStow.add(dayOf(minutes[i])); }
  }
  const stat = type => {
    const a = activations.filter(x => x.type === type), mv = a.filter(x => !x.alreadyOk);
    const dayMv = mv.filter(x => !x.night), nightMv = mv.filter(x => x.night), deg = l => l.map(x => x.degrees);
    const mean = l => l.length ? round1(l.reduce((s, x) => s + x, 0) / l.length) : null;
    return {
      total: a.length, day: a.filter(x => !x.night).length, night: a.filter(x => x.night).length,
      alreadyOk: a.length - mv.length, move: mv.length,
      dayMove: { n: dayMv.length, meanDeg: mean(deg(dayMv)), maxDeg: dayMv.length ? Math.max(...deg(dayMv)) : null },
      nightMove: { n: nightMv.length, meanDeg: mean(deg(nightMv)), maxDeg: nightMv.length ? Math.max(...deg(nightMv)) : null },
      doubtful: a.filter(x => x.doubtful).length
    };
  };
  const toStow = activations.filter(x => !x.alreadyOk && Math.abs(Math.abs(x.target) - o.stowDeg) <= tol);
  const exposure = type => {
    const e = { cara: 0, espalda: 0, eje: 0, unknown: 0, night: { cara: 0, espalda: 0, eje: 0 } };
    for (const a of activations) if (a.type === type) { if (!a.exposure) e.unknown++; else { e[a.exposure]++; if (a.night) e.night[a.exposure]++; } }
    return e;
  };
  return {
    key: series.key, label: series.label, sensors: series.sensors,
    coverage: { first: n ? minutes[0] * MIN : null, last: n ? lastMinute * MIN : null, dataMinutes: n, days: days.size, gaps, cadenceMin, coarse, dataHours },
    wind: { peakKmh: peak === null ? null : round1(peak), minutesOverPrestow: overPre, minutesOverStow: overStow, daysOverPrestow: daysPre.size, daysOverStow: daysStow.size },
    prestow: stat("prestow"), stow: stat("stow"),
    movementsToStow: { total: toStow.length, day: toStow.filter(x => !x.night).length, night: toStow.filter(x => x.night).length },
    daylight: { dataMinutes: dayData, prestowPct: dayData ? round1(100 * preDay / dayData) : null, stowPct: dayData ? round1(100 * stowDay / dayData) : null },
    dusk: { rule: o.duskRule, total: dusk.length, crossingHorizontal: dusk.filter(d => d.posBefore > 0).length, events: dusk },
    quality: { zeroRuns, zeroMinutes: zeroRuns.reduce((s, r) => s + r.minutes, 0) },
    hasDirection: !!series.dir, exposure: { prestow: exposure("prestow"), stow: exposure("stow") },
    trace: { m0, pos: trace },
    activations
  };
}

/* Tabla «rango de viento × posición en que pilla al seguidor». */
export function windLogicMatrix(group, options) {
  const o = options, mid = (o.prestowKmh + o.stowKmh) / 2, f = x => String(Math.round(x * 10) / 10).replace(".", ",");
  const preBands = [
    { label: f(o.prestowKmh) + "–" + f(mid) + " km/h", test: p => p < mid },
    { label: f(mid) + "–" + f(o.stowKmh) + " km/h", test: p => p >= mid && p <= o.stowKmh },
    { label: "> " + f(o.stowKmh) + " km/h (acaba en stow)", test: p => p > o.stowKmh }];
  const s = o.stowKmh, stowBands = [
    { label: f(s) + "–" + f(s + 5) + " km/h", test: p => p < s + 5 },
    { label: f(s + 5) + "–" + f(s + 10) + " km/h", test: p => p >= s + 5 && p < s + 10 },
    { label: f(s + 10) + "–" + f(s + 15) + " km/h", test: p => p >= s + 10 && p < s + 15 },
    { label: "> " + f(s + 15) + " km/h", test: p => p >= s + 15 }];
  const cell = a => a.night ? (a.alreadyOk ? 3 : 2) : (a.alreadyOk ? 0 : 1);
  const build = (type, bands) => {
    const rows = bands.map(b => ({ label: b.label, total: 0, cells: [0, 0, 0, 0] }));
    for (const a of group.activations) {
      if (a.type !== type) continue;
      const r = rows[Math.max(0, bands.findIndex(b => b.test(a.peakKmh)))];
      r.total++; r.cells[cell(a)]++;
    }
    const total = { label: "Total", total: rows.reduce((x, r) => x + r.total, 0), cells: [0, 1, 2, 3].map(i => rows.reduce((x, r) => x + r.cells[i], 0)) };
    return [...rows, total];
  };
  return {
    prestow: { columns: ["Día · ya en rango", "Día · hay que mover", "Noche · hay que mover", "Noche · ya en defensa"], rows: build("prestow", preBands) },
    stow: { columns: ["Día · ya en stow", "Día · hay que mover", "Noche · hay que mover", "Noche · ya en defensa"], rows: build("stow", stowBands) }
  };
}

/* Qué detecta cada HSU por separado: las alarmas que daría ella sola con la misma regla, los minutos
 * por encima de cada umbral y cuántas veces es ella la que está por encima del umbral en el minuto en
 * que salta la alarma del grupo de referencia (la planta entera, o la única NCU). */
const SENSOR_HIST_MAX = 200;
function sensorStats(sensors, o, ref) {
  const startsP = new Set(), startsS = new Set();
  for (const a of ref?.activations || []) (a.type === "prestow" ? startsP : startsS).add(Math.round(a.t / MIN));
  const out = (sensors || []).map(x => {
    let lastP = -Infinity, lastS = -Infinity, prestow = 0, stow = 0, overP = 0, overS = 0, peak = null, firesP = 0, firesS = 0, n = 0;
    const days = new Set(), hist = new Uint32Array(SENSOR_HIST_MAX + 1);   // minutos por km/h entero, para la curva de excedencia
    // Rosa: minutos sobre cada umbral por sector de 22,5° (0: N, 4: E, 8: S, 12: O), con la dirección que da el propio sensor.
    const rose = { prestow: new Uint32Array(16), stow: new Uint32Array(16) }, alarm = new Map(); let sx = 0, sy = 0, tPeak = null;
    x.each((m, v, d) => {
      n++; days.add(Math.floor(m / 1440)); if (peak === null || v > peak) { peak = v; tPeak = m * MIN; }
      hist[v >= SENSOR_HIST_MAX ? SENSOR_HIST_MAX : v > 0 ? Math.floor(v) : 0]++;
      if (v > o.prestowKmh) { overP++; if (m - lastP > o.holdMin) prestow++; lastP = m; if (startsP.has(m)) firesP++; }
      if (v > o.stowKmh) { overS++; if (m - lastS > o.holdMin) stow++; lastS = m; if (startsS.has(m)) firesS++; }
      if (d >= 0 && v > o.prestowKmh) {
        const k = Math.round(d / 22.5) % 16; rose.prestow[k]++; if (v > o.stowKmh) rose.stow[k]++;
        sx += Math.cos(d * D2R); sy += Math.sin(d * D2R); alarm.set(m, d);
      }
    });
    const withDir = rose.prestow.reduce((a, b) => a + b, 0);
    return { ncu: x.ncu, name: x.name, label: (x.ncu ? "NCU " + x.ncu + " · " : "") + x.name, plain: (x.ncu ? "NCU " + x.ncu + " " : "") + x.name, days: days.size, dataMinutes: n, peakKmh: peak === null ? null : round1(peak), tPeak,
      minutesOverPrestow: overP, minutesOverStow: overS, prestow, stow, firesPrestow: firesP, firesStow: firesS, hist,
      rose: withDir ? rose : null, dirMinutes: withDir, dirDeg: withDir && (sx || sy) ? (Math.round(Math.atan2(sy, sx) * R2D) + 360) % 360 : null, alarm };
  });
  // Desfase de dirección de cada sensor respecto al que más minutos de alarma tiene, en los minutos en que los dos
  // están sobre el umbral de pre-stow. Dos sensores bien orientados dan casi lo mismo; si no, alguno no mira al norte.
  const lead = out.filter(x => x.dirMinutes).sort((a, b) => b.dirMinutes - a.dirMinutes)[0] || null;
  for (const x of out) {
    x.dirOffsetDeg = null; x.dirOffsetRef = null;
    if (lead && x !== lead && x.dirMinutes) {
      let cx = 0, cy = 0, c = 0;
      for (const [m, d] of x.alarm) { const r = lead.alarm.get(m); if (r !== undefined) { cx += Math.cos((d - r) * D2R); cy += Math.sin((d - r) * D2R); c++; } }
      if (c >= 30 && (cx || cy)) { x.dirOffsetDeg = Math.round(Math.atan2(cy, cx) * R2D); x.dirOffsetRef = lead.plain; x.dirOffsetMinutes = c; }
    }
  }
  // La referencia es el sensor del medio: así el que desentona es el que se señala, no todos los demás.
  const withOff = out.filter(x => x === lead || x.dirOffsetDeg !== null).sort((a, b) => (a.dirOffsetDeg ?? 0) - (b.dirOffsetDeg ?? 0));
  if (withOff.length > 1) {
    const mid = withOff[(withOff.length - 1) >> 1], shift = mid.dirOffsetDeg ?? 0;
    for (const x of withOff) { x.dirOffsetDeg = x === mid ? null : ((((x.dirOffsetDeg ?? 0) - shift) % 360 + 540) % 360) - 180; x.dirOffsetRef = x === mid ? null : mid.plain; }
  }
  for (const x of out) delete x.alarm;
  return out;
}

export const WIND_LOGIC_PLANT_KEY = "*";
function plantGroup(groups) {
  const max = new Map(), from = new Map(), base = []; let count = 0;
  for (const g of groups) { base.push(count); count += g.sensors.length; }
  groups.forEach((g, gi) => {
    for (let i = 0; i < g.minutes.length; i++) {
      const m = g.minutes[i], v = g.kmh[i];
      if (!(max.get(m) >= v)) { max.set(m, v); from.set(m, ((g.dir ? g.dir[i] : -1) + 1) * 1024 + (g.src ? base[gi] + g.src[i] : -1) + 1); }
    }
  });
  const minutes = [...max.keys()].sort((a, b) => a - b), anyDir = groups.some(g => g.dir);
  return { key: WIND_LOGIC_PLANT_KEY, label: "Planta entera", sensors: groups.flatMap(g => g.sensors.map(s => g.label + " " + s)), minutes, kmh: minutes.map(m => max.get(m)),
    dir: anyDir ? minutes.map(m => Math.floor(from.get(m) / 1024) - 1) : null, src: minutes.map(m => from.get(m) % 1024 - 1) };
}

export function simulateWindLogic(records, { plant = "", site, options, solarPosition, series: given = null } = {}) {
  if (typeof solarPosition !== "function") throw new Error("Falta la función de posición solar.");
  // null o vacío NO es la latitud 0: sin coordenadas no hay posición teórica que calcular
  const coord = v => v === null || v === undefined || v === "" ? NaN : Number(v);
  const lat = coord(site?.lat), lon = coord(site?.lon);
  if (!fin(lat) || !fin(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("Faltan las coordenadas del emplazamiento para calcular la posición teórica.");
  // `series` ya construidas (createWindSeriesBuilder) o, si no, las lecturas cargadas
  const o = windLogicOptions(options), series = given || windSeriesByGroup(records, { plant });
  if (!series.variable || !series.groups.length) throw new Error("No hay lecturas de viento (máximo, ráfaga o velocidad) en las medidas cargadas.");
  // Con más de una NCU va primero la planta entera: en cada minuto manda la racha más alta de cualquier
  // HSU, así que varias HSU en alarma a la vez son UNA activación. Las NCU sueltas quedan como detalle:
  // sus recuentos no se suman, porque repiten las mismas alarmas.
  const sets = series.groups.length > 1 ? [plantGroup(series.groups), ...series.groups] : series.groups;
  const groups = sets.map(g => { const r = simulateGroup(g, o, solarPosition, { lat, lon }); r.matrix = windLogicMatrix(r, o); return r; });
  if (series.groups.length > 1) groups[0].parts = groups.slice(1).map(g => ({ label: g.label, sensors: g.sensors, first: g.coverage.first, last: g.coverage.last }));
  return {
    schema: "factiun_wind_logic_simulation_v1", version: WIND_LOGIC_VERSION, plant,
    site: { lat, lon, timezone: site?.tz || site?.timezone || "UTC" }, variable: series.variable, options: o, groups,
    sensors: sensorStats(series.sensors, o, groups[0]), sensorSeries: series.sensors || [],
    discardedRows: series.diagnostics ? series.diagnostics.withoutUtc + series.diagnostics.invalidSeries : 0,
    notice: "Simulación: viento medido por las HSU y posición TEÓRICA del seguidor (seguimiento con backtracking, terreno plano). " +
      "No describe cómo se movió la planta." +
      (series.variable === "wind_speed" ? " Sin máximo de ráfaga en los datos: se usa la velocidad media del intervalo y el recuento queda por debajo." : "")
  };
}

/* CSV de activaciones para hoja de cálculo en español (separador «;», coma decimal). */
export function windLogicCsv(result, { timeZone = "", groupKey = null } = {}) {
  const num = x => x === null || x === undefined ? "" : String(x).replace(".", ",");
  const utc = ms => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  let local = null;
  if (timeZone && timeZone !== "UTC") {
    try {
      const f = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      local = ms => f.format(new Date(ms));
    } catch (e) { local = null; }
  }
  const side = x => x < 0 ? "E" : x > 0 ? "O" : "";
  const head = ["grupo", "tipo", "id", "id_prestow", "episodio", "inicio_utc", ...(local ? ["inicio_local"] : []), "fin_alarma_utc", "duracion_min",
    "min_sobre_umbral", "racha_cruce_kmh", "pico_kmh", "periodo", "angulo_teorico_seguimiento_deg", "posicion_antes_deg", "destino_deg",
    "lado_destino", "ya_en_posicion", "grados_a_mover", "nota"];
  const lines = [head.join(";")];
  // Con groupKey, solo ese grupo: la planta entera repite las activaciones de sus NCU y no deben sumarse.
  const gap = (result.options?.episodeGapMin || 0) * MIN;
  for (const g of result.groups) if (groupKey === null || g.key === groupKey) {
   const epi = { prestow: 0, stow: 0 }, end = { prestow: -Infinity, stow: -Infinity };   // nº de episodio de cada activación, por tipo
   for (const a of g.activations) {
    if (!(a.t - end[a.type] < gap)) epi[a.type]++;
    end[a.type] = Math.max(end[a.type], a.tEnd);
    lines.push([g.label, a.type === "prestow" ? "pre-stow" : "stow", a.id, a.parentId ?? "", epi[a.type], utc(a.t), ...(local ? [local(a.t)] : []), utc(a.tEnd),
      a.durationMin, a.minutesOver, num(a.crossKmh), num(a.peakKmh), a.night ? "noche" : "dia", num(a.thetaTheory), num(a.posBefore), num(a.target),
      side(a.target), a.alreadyOk ? "si" : "no", num(a.degrees),
      a.doubtful ? "DUDOSO: sin lecturas validas antes del cruce (hueco de dato o sensor a cero); puede ser la vuelta del dato y no una racha nueva" : ""].join(";"));
   }
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/* Activaciones por semana (lunes a domingo, UTC). Una sola cuenta para la gráfica
 * de la página y para la del informe. */
/* Episodios de viento: en una misma ventolera la alarma cae y vuelve a saltar. Las activaciones del
 * mismo tipo que saltan menos de gapMin después de que la anterior se desactivara se cuentan como un
 * solo episodio. Con gapMin = 0 cada activación es su propio episodio. */
export function windLogicEpisodes(group, gapMin = 0) {
  const out = { prestow: [], stow: [] }, gap = Math.max(0, Number(gapMin) || 0) * MIN;
  for (const a of group?.activations || []) {
    const list = out[a.type], last = list[list.length - 1];
    if (last && a.t - last.tEnd < gap) {
      last.tEnd = Math.max(last.tEnd, a.tEnd); last.activations++; last.minutesOver += a.minutesOver;
      if (a.peakKmh > last.peakKmh) { last.peakKmh = a.peakKmh; last.tPeak = a.tPeak; last.dirDeg = a.dirDeg; last.sensor = a.sensor; }
      if (!a.alreadyOk) last.moves++;
    } else list.push({ n: list.length + 1, t: a.t, tEnd: a.tEnd, activations: 1, peakKmh: a.peakKmh, minutesOver: a.minutesOver, moves: a.alreadyOk ? 0 : 1, night: a.night,
      tPeak: a.tPeak, dirDeg: a.dirDeg, sensor: a.sensor });
  }
  for (const list of [out.prestow, out.stow]) for (const e of list) e.durationMin = Math.round((e.tEnd - e.t) / MIN);
  return out;
}
/* Datos de las gráficas de la tarjeta: cuándo (por semana si el periodo es corto, por mes si es largo),
 * a qué hora del día empiezan y cuánto duran los episodios. Horas y meses, en la hora de la planta. */
const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const WIND_LOGIC_DURATION_BINS = Object.freeze([[30, "30 min"], [60, "30–60 min"], [120, "1–2 h"], [240, "2–4 h"], [480, "4–8 h"], [1440, "8–24 h"], [Infinity, "> 1 día"]]);
export function windLogicCharts(group, { gapMin = 0, timeZone = "UTC" } = {}) {
  const ep = windLogicEpisodes(group, gapMin), zeros = n => Array(n).fill(0);
  let parts = ms => { const d = new Date(ms); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), h: d.getUTCHours() }; };
  try {
    const f = new Intl.DateTimeFormat("sv-SE", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    parts = ms => { const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value; return { y: +p.year, m: +p.month - 1, h: +p.hour % 24 }; };
  } catch (e) { /* zona horaria desconocida: UTC */ }
  const hours = { labels: Array.from({ length: 24 }, (_, h) => String(h)), prestow: zeros(24), stow: zeros(24) };
  const durations = { labels: WIND_LOGIC_DURATION_BINS.map(b => b[1]), prestow: zeros(WIND_LOGIC_DURATION_BINS.length), stow: zeros(WIND_LOGIC_DURATION_BINS.length) };
  const wk = windLogicWeekly(group), monthly = wk.weeks > 30;
  let timeline = { unit: "semana", labels: [], prestow: [], stow: [] };
  if (group && group.coverage.first !== null) {
    if (monthly) {
      const a = parts(group.coverage.first), b = parts(group.coverage.last), n = (b.y - a.y) * 12 + (b.m - a.m) + 1, i0 = a.y * 12 + a.m;
      timeline = { unit: "mes", labels: Array.from({ length: n }, (_, k) => MES3[(i0 + k) % 12] + " " + String(Math.floor((i0 + k) / 12)).slice(2)), prestow: zeros(n), stow: zeros(n) };
      timeline.index = ms => { const p = parts(ms); return p.y * 12 + p.m - i0; };
    } else {
      timeline = { unit: "semana", labels: Array.from({ length: wk.weeks }, (_, k) => esDay(wk.start + k * wk.weekMs).slice(0, 5)), prestow: zeros(wk.weeks), stow: zeros(wk.weeks) };
      timeline.index = ms => Math.floor((ms - wk.start) / wk.weekMs);
    }
  }
  const byMonth = [];
  if (group && group.coverage.first !== null) {
    const a = parts(group.coverage.first), b = parts(group.coverage.last);
    for (let k = a.y * 12 + a.m; k <= b.y * 12 + b.m; k++) byMonth.push({ y: Math.floor(k / 12), m: k % 12, prestow: 0, stow: 0 });
  }
  for (const type of ["prestow", "stow"]) for (const e of ep[type]) {
    const pm = parts(e.t), mk = byMonth.length ? pm.y * 12 + pm.m - (byMonth[0].y * 12 + byMonth[0].m) : -1;
    if (mk >= 0 && mk < byMonth.length) byMonth[mk][type]++;
    hours[type][parts(e.t).h]++;
    durations[type][WIND_LOGIC_DURATION_BINS.findIndex(b => e.durationMin <= b[0])]++;
    const k = timeline.index ? timeline.index(e.t) : -1;
    if (k >= 0 && k < timeline.labels.length) timeline[type][k]++;
  }
  delete timeline.index;
  return { episodes: ep, timeline, hours, durations, monthly: byMonth };
}
/* Calendario de alarmas: cada día de la planta es una columna de 0 a 24 h y cada activación, un tramo
 * pintado en ella (partido en la medianoche local). Devuelve también los días sin dato, el arranque de
 * cada mes, el orto y el ocaso para sombrear la noche y, para el reloj de 24 h, qué parte del tiempo
 * con dato está activa cada alarma a cada hora. */
export function windLogicRaster(result, group, { solarPosition = null, sunSamples = 180 } = {}) {
  const empty = { days: 0, firstDay: "", months: [], segments: [], noData: [], sun: [], clock: { prestow: Array(24).fill(0), stow: Array(24).fill(0) } };
  if (!group || group.coverage.first === null) return empty;
  const timeZone = result.site?.timezone || "UTC";
  let lp = ms => { const d = new Date(ms); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
  try {
    const f = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    lp = ms => { const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value; return { y: +p.year, m: +p.month - 1, d: +p.day, min: (+p.hour % 24) * 60 + +p.minute }; };
  } catch (e) { /* zona horaria desconocida: UTC */ }
  const DAY = 86400000, p0 = lp(group.coverage.first), d0 = Date.UTC(p0.y, p0.m, p0.d) / DAY;
  const dayOf = p => Date.UTC(p.y, p.m, p.d) / DAY - d0, pl = lp(group.coverage.last), days = dayOf(pl) + 1;
  const segments = [], minutesBy = { prestow: Array(24).fill(0), stow: Array(24).fill(0) };
  for (const a of group.activations) {
    for (let t = a.t, guard = 0; t < a.tEnd && guard < 4000; guard++) {
      const p = lp(t), e = Math.min(a.tEnd, t + (1440 - p.min) * MIN), from = p.min / 60, to = Math.min(24, (p.min + (e - t) / MIN) / 60);
      const day = dayOf(p);
      if (day >= 0 && day < days && to > from) {
        segments.push({ type: a.type, day, from, to });
        for (let h = Math.floor(from); h < Math.ceil(to) && h < 24; h++) minutesBy[a.type][h] += (Math.min(to, h + 1) - Math.max(from, h)) * 60;
      }
      t = e;
    }
  }
  // Un día de la planta tiene dato si alguna de sus 24 horas lo tiene.
  const withData = new Set(group.coverage.dataHours || []), noData = [], midnight = group.coverage.first - p0.min * MIN;
  for (let k = 0; k < days; k++) {
    const start = midnight + k * DAY - (lp(midnight + k * DAY + 12 * 3600000).min - 720) * MIN;   // corrige el cambio de hora
    let any = false;
    for (let q = 0; q < 24 && !any; q++) any = withData.has(Math.floor((start + q * 3600000) / 3600000));
    if (!any) noData.push(k);
  }
  const dataDays = Math.max(1, days - noData.length), pct = type => minutesBy[type].map(m => Math.round(1000 * m / (dataDays * 60)) / 10);
  const months = [];
  for (let y = p0.y, m = p0.m; ; m++) {
    if (m > 11) { m = 0; y++; }
    const k = Date.UTC(y, m, 1) / DAY - d0;
    if (k >= days) break;
    if (k >= 0) months.push({ day: k, label: MES3[m] + " " + String(y).slice(2) });
  }
  const sun = [];
  if (solarPosition && fin(result.site?.lat) && fin(result.site?.lon)) {
    const step = Math.max(1, Math.ceil(days / sunSamples)), midnight0 = group.coverage.first - p0.min * MIN;
    const up = ms => Number(solarPosition(new Date(ms), result.site.lat, result.site.lon)?.elevation_deg) > -HORIZON_REFRACTION_DEG;
    for (let k = 0; k < days; k += step) {
      const noon = midnight0 + k * DAY + 12 * 3600000, shift = lp(noon).min - 720, base = midnight0 + k * DAY - shift * MIN;   // corrige el cambio de hora
      let rise = null, set = null;
      for (let q = 0; q < 144; q++) if (up(base + q * 600000)) { if (rise === null) rise = q / 6; set = (q + 1) / 6; }
      if (rise !== null) sun.push({ day: k, rise, set });
    }
  }
  return { days, firstDay: p0.y + "-" + String(p0.m + 1).padStart(2, "0") + "-" + String(p0.d).padStart(2, "0"), months, segments, noData, sun,
    clock: { prestow: pct("prestow"), stow: pct("stow") } };
}
export function windLogicWeekly(group) {
  if (!group || group.coverage.first === null) return { start: null, weeks: 0, prestow: [], stow: [] };
  const WEEK = 7 * 86400000, d0 = new Date(group.coverage.first);
  const start = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()) - ((d0.getUTCDay() + 6) % 7) * 86400000;
  const weeks = Math.max(1, Math.floor((group.coverage.last - start) / WEEK) + 1), prestow = Array(weeks).fill(0), stow = Array(weeks).fill(0);
  for (const a of group.activations) { const k = Math.floor((a.t - start) / WEEK); if (k >= 0 && k < weeks) (a.type === "prestow" ? prestow : stow)[k]++; }
  return { start, weeks, weekMs: WEEK, prestow, stow };
}

const esInt = v => v === null || v === undefined ? "—" : Number(v).toLocaleString("es-ES");
const esNum = (v, d = 1) => v === null || v === undefined || !Number.isFinite(+v) ? "—" : Number(v).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
const esDeg = v => esNum(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1) + "°";
const esDay = ms => new Date(ms).toISOString().slice(0, 10).split("-").reverse().join("/");
const esGap = min => min % 60 === 0 ? esInt(min / 60) + " h" : esInt(min) + " min";
const esList = xs => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1];
/* Duración legible: 45 min, 2 h 10 min, 1 d 3 h. */
export const esDuration = min => { const m = Math.round(min); return m < 60 ? m + " min" : m < 1440 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : "") : Math.floor(m / 1440) + " d" + (Math.floor(m % 1440 / 60) ? " " + Math.floor(m % 1440 / 60) + " h" : ""); };
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
export const windCompass = deg => fin(deg) ? COMPASS[Math.round(deg / 22.5) % 16] : "";

/* Lo que un ingeniero de estructuras busca además del recuento: uso por año (movimientos, grados y horas en
 * alarma), los episodios con la racha más alta, la racha esperada para un periodo de retorno, cómo pilla el
 * viento al seguidor en cada stow y, minuto a minuto, el episodio con la racha más alta.
 * Periodo de retorno: picos sobre umbral con cola exponencial, v_T = u + σ·ln(λT), con u el umbral de stow,
 * σ el exceso medio de los episodios que lo pasan y λ cuántos hay al año. Con uno o dos años de datos es
 * una extrapolación, y así se dice. */
export function windLogicInsights(result, group, { solarPosition = null, top = 5 } = {}) {
  const o = result.options, g = group, years = g.coverage.days / 365.25, ep = windLogicEpisodes(g, o.episodeGapMin);
  const use = type => {
    const a = g.activations.filter(x => x.type === type), mv = a.filter(x => !x.alreadyOk);
    return { episodes: ep[type].length, activations: a.length, moves: mv.length, degrees: mv.reduce((t, x) => t + x.degrees, 0), hours: a.reduce((t, x) => t + x.durationMin, 0) / 60 };
  };
  const totals = { prestow: use("prestow"), stow: use("stow") }, annual = { prestow: {}, stow: {} };
  for (const t of ["prestow", "stow"]) for (const k in totals[t]) annual[t][k] = years > 0 ? totals[t][k] / years : null;
  const ranked = [...ep.prestow].sort((a, b) => b.peakKmh - a.peakKmh || a.t - b.t).slice(0, top).map((e, i) => ({ rank: i + 1, ...e }));
  const u = o.stowKmh, excess = ep.prestow.filter(e => e.peakKmh > u).map(e => e.peakKmh - u);
  let returnLevels = null;
  if (excess.length >= 10 && years > 0) {
    const sigma = excess.reduce((t, x) => t + x, 0) / excess.length, rate = excess.length / years;
    returnLevels = { u, n: excess.length, sigma, rate, levels: [1, 10, 50].filter(T => rate * T > 1).map(T => ({ years: T, kmh: round1(u + sigma * Math.log(rate * T)) })) };
  }
  const durations = ep.prestow.map(e => e.durationMin).sort((a, b) => a - b);
  let detail = null; const worst = ranked[0];
  if (worst && g.trace && g.trace.pos.length) {
    const mp = Math.round(worst.tPeak / MIN), a = Math.max(g.trace.m0, mp - 180), b = Math.min(g.trace.m0 + g.trace.pos.length - 1, mp + 180), n = b - a + 1;
    const sens = (result.sensorSeries || []).filter(x => g.key === WIND_LOGIC_PLANT_KEY || result.groups.length === 1 || x.ncu === g.key);
    const pos = new Float32Array(n), theta = new Float32Array(n).fill(NaN), night = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const p = g.trace.pos[a + i - g.trace.m0]; pos[i] = p === -32768 ? NaN : p / 10;
      if (solarPosition) { const t = theoreticalTrackerAngle(solarPosition(new Date((a + i) * MIN), result.site.lat, result.site.lon), o); theta[i] = t.theta; night[i] = t.night ? 1 : 0; }
    }
    detail = { t0: a * MIN, minutes: n, tPeak: worst.tPeak, peakKmh: worst.peakKmh, pos, theta, night, prestowKmh: o.prestowKmh, stowKmh: o.stowKmh, maxDeg: o.maxDeg,
      sensors: sens.map(x => { const v = new Float32Array(n).fill(NaN); x.range?.(a, b, (m, kmh) => { v[m - a] = kmh; }); return { ncu: x.ncu, name: x.name, kmh: v }; }).filter(x => x.kmh.some(v => v === v)) };
  }
  return { years, totals, annual, top: ranked, returnLevels, detail, hasDirection: !!g.hasDirection, exposure: g.exposure?.stow || null,
    medianDurationMin: durations.length ? durations[durations.length >> 1] : null, reachStow: ep.prestow.filter(e => e.peakKmh > u).length, episodes: ep.prestow.length };
}

/* El resumen que se lee de un vistazo: por alarma, cuántas veces salta, en cuántas no
 * hay que mover el seguidor, en cuántas sí y cuánto. Lo usan la tarjeta y el informe,
 * para que digan lo mismo con las mismas palabras. */
export function windLogicSummary(result, group) {
  const o = result.options, g = group;
  // Grados de recorrido, no posición: «máx. 25°» y no «hasta 25°», que se leía como si el stow fuese a 25°.
  const travel = s => s.meanDeg === s.maxDeg ? esDeg(s.maxDeg) : esDeg(s.meanDeg) + " de media, máx.\u00a0" + esDeg(s.maxDeg);
  const how = st => [st.dayMove.n ? esInt(st.dayMove.n) + " de día: " + travel(st.dayMove) : "", st.nightMove.n ? esInt(st.nightMove.n) + " de noche: " + travel(st.nightMove) : ""].filter(Boolean).join("; ") || "—";
  // Días (hora de la planta) en que salta cada alarma: en un mismo día de viento la alarma cae y vuelve a saltar.
  let dayOf = ms => new Date(ms).toISOString().slice(0, 10);
  try {
    const f = new Intl.DateTimeFormat("sv-SE", { timeZone: result.site?.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
    dayOf = ms => f.format(new Date(ms));
  } catch (e) { /* zona horaria desconocida: días UTC */ }
  const days = type => new Set(g.activations.filter(a => a.type === type).map(a => dayOf(a.t))).size;
  const ep = windLogicEpisodes(g, o.episodeGapMin);
  const row = (name, kmh, type) => ({ label: name + " (> " + esNum(kmh, 0) + " km/h)", name, kmh, ms: kmh / 3.6, episodes: ep[type].length, total: g[type].total, days: days(type),
    ok: g[type].alreadyOk, move: g[type].move, dayMove: g[type].dayMove, nightMove: g[type].nightMove, how: how(g[type]) });
  const rows = [row("Pre-stow", o.prestowKmh, "prestow"), row("Stow", o.stowKmh, "stow")];
  // Veces que salta cada alarma según su racha máxima, con los mismos tramos para las dos.
  const S = o.stowKmh, edges = [o.prestowKmh, (o.prestowKmh + S) / 2, S, S + 5, S + 10, S + 15], f0 = x => esNum(x, Math.abs(x - Math.round(x)) < 0.05 ? 0 : 1);
  const bin = (p, from) => { let k = from; while (k < 5 && (k === 1 ? p > edges[2] : p >= edges[k + 1])) k++; return k; };
  const gust = { bins: edges.map((a, k) => ({ kmh: k < 5 ? f0(a) + "–" + f0(edges[k + 1]) : "> " + f0(a), ms: k < 5 ? esNum(a / 3.6, 1) + "–" + esNum(edges[k + 1] / 3.6, 1) : "> " + esNum(a / 3.6, 1) })),
    prestow: Array(6).fill(0), stow: [null, null, 0, 0, 0, 0] };
  for (const a of g.activations) gust[a.type][bin(a.peakKmh, a.type === "stow" ? 2 : 0)]++;
  const bands = m => m.rows.slice(0, -1).filter(r => r.total).map(r => r.label.replace(/ \(.*\)$/, "") + ": " + esInt(r.total)).join(" · ");
  const doubtful = g.prestow.doubtful + g.stow.doubtful, notes = [];
  if (g.parts) {
    notes.push("Cuenta la racha más alta de cualquier HSU de la planta: varias HSU en alarma a la vez son una sola activación.");
    for (const p of g.parts) if (p.first !== null && g.coverage.first !== null && p.first - g.coverage.first >= 86400000)
      notes.push("De la " + p.label + " solo hay dato desde el " + esDay(p.first) + ": hasta esa fecha el recuento sale de las demás HSU.");
  }
  if (g.dusk.total) notes.push("La alarma sigue activa al anochecer " + (g.dusk.total === 1 ? "una noche" : esInt(g.dusk.total) + " noches") + (o.duskRule === "east"
    ? (g.dusk.crossingHorizontal ? "; en " + esInt(g.dusk.crossingHorizontal) + " el seguidor está al Oeste y tendría que pasar por horizontal para ir a " + esDeg(o.stowDeg) + " E." : "; el seguidor va a " + esDeg(o.stowDeg) + " E.")
    : "; el seguidor se queda donde está."));
  if (doubtful) notes.push((doubtful === 1 ? "Una activación dudosa: salta" : esInt(doubtful) + " activaciones dudosas: saltan") + " tras un hueco de dato o con los sensores a cero.");
  if (g.coverage.coarse) notes.push("Lecturas cada " + g.coverage.cadenceMin + " min: resultado orientativo.");
  if (result.discardedRows) notes.push(esInt(result.discardedRows) + (result.discardedRows === 1 ? " día de sensor descartado" : " días de sensor descartados") + " por venir sin serie válida o sin hora UTC.");
  if (result.variable === "wind_speed") notes.push("Sin máximo de ráfaga en los datos: se ha usado la velocidad media, que se queda corta.");
  // Sensores que no dan la misma dirección con viento de alarma: alguno no está orientado al norte.
  const mine = (result.sensors || []).filter(x => g.key === WIND_LOGIC_PLANT_KEY || result.groups.length === 1 || x.ncu === g.key);
  const off = mine.filter(x => Math.abs(x.dirOffsetDeg ?? 0) >= 20);
  if (off.length) notes.push("Las HSU no dan la misma dirección de viento: " + esList(off.map(x => x.plain + " marca " + esInt(Math.abs(x.dirOffsetDeg)) + "° " + (x.dirOffsetDeg > 0 ? "más" : "menos") + " que " + x.dirOffsetRef)) +
    ". Alguna no está orientada al norte; la dirección de este informe es la que da cada una, sin corregir.");
  notes.push("El recuento es un mínimo: el registro no guarda todas las lecturas de 1 s.");
  return {
    period: g.coverage.first === null ? "" : esDay(g.coverage.first) + " – " + esDay(g.coverage.last) + " · " + esInt(g.coverage.days) + (g.coverage.days === 1 ? " día con dato" : " días con dato"),
    rows, bands: { prestow: bands(g.matrix.prestow), stow: bands(g.matrix.stow) }, gust, notes,
    // Qué es un episodio, dicho para quien lee el resumen
    episodeRule: o.episodeGapMin > 0 ? "Un episodio agrupa las activaciones que vuelven a saltar menos de " + esGap(o.episodeGapMin) + " después de desactivarse." : ""
  };
}

/* Informe de UN grupo, HTML autónomo pensado para «Imprimir → PDF» y para leerse como una nota escrita
 * a mano: título, ficha, dos frases de resumen, tablas con su pie y figuras cuyo pie dice la conclusión.
 * Sin membrete, sin tarjetas, sin cifras gigantes y sin tipografía de aplicación. La lista completa de
 * activaciones va en el CSV, no aquí. */
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const REPORT_COLORS = { pre: "#6da7ec", stow: "#104281" };   // un solo tono, de claro a oscuro: stow es el grado siguiente
/* `figures` son las gráficas de la página dibujadas en claro (PNG en data URL): `calendar`, `clock`,
 * `scatter`, `detail`, `rose` y `exceedance`. Las pinta quien tiene un lienzo, la página; sin ellas
 * (en Node, o si el navegador no deja leer el lienzo) el informe lleva la figura de barras. */
export function windLogicReportHtml(result, { groupKey = null, generatedAt = new Date(), figures = null, fonts = null } = {}) {
  const g = result.groups.find(x => x.key === groupKey) || result.groups[0];
  if (!g) throw new Error("No hay simulación que informar.");
  const o = result.options, sum = windLogicSummary(result, g), total = g.prestow.total + g.stow.total;
  const ins = windLogicInsights(result, g), ch = windLogicCharts(g, { gapMin: o.episodeGapMin, timeZone: result.site?.timezone }), clock = windLogicRaster(result, g).clock;
  const e = s => String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const made = new Date(generatedAt), fecha = made.getUTCDate() + " de " + MESES[made.getUTCMonth()] + " de " + made.getUTCFullYear();
  const P = esNum(o.prestowKmh, 0), S = esNum(o.stowKmh, 0), pm = esDeg(o.prestowMinDeg), sd = esDeg(o.stowDeg);
  // Fecha y hora de la planta
  let local = ms => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  try {
    const f = new Intl.DateTimeFormat("sv-SE", { timeZone: result.site?.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    local = ms => f.format(new Date(ms));
  } catch (err) { /* zona horaria desconocida: UTC */ }
  const dia = ms => local(ms).slice(0, 10).split("-").reverse().join("/"), diaHora = ms => dia(ms) + " " + local(ms).slice(11, 16);
  const n1 = v => v === null || !Number.isFinite(v) ? "—" : v === 0 ? "0" : esNum(v, v < 10 ? 1 : 0);

  // Dos frases que digan el resultado, como lo contaría quien ha hecho el estudio.
  const veces = n => n === 0 ? "ninguna vez" : n === 1 ? "una vez" : esInt(n) + " veces", de = n => n === 0 ? "ninguno" : esInt(n);
  const episodios = n => n === 1 ? "un episodio" : esInt(n) + " episodios";
  const pre = g.prestow, st = g.stow, [rp0, rs0] = sum.rows, unidos = o.episodeGapMin > 0, que = unidos ? "episodio" : "activación";
  const lead = g.coverage.first === null ? "" :
    "Con el viento registrado por las HSU entre el " + esDay(g.coverage.first) + " y el " + esDay(g.coverage.last) + ", " +
    (total === 0 ? "ninguna de las dos alarmas llega a saltar."
      : (unidos
          ? "hay " + episodios(rp0.episodes) + " de pre-stow" + (st.total ? " y " + episodios(rs0.episodes) + " de stow" : "") + "; dentro de ellos la alarma salta " +
            (st.total ? esInt(pre.total) + " y " + esInt(st.total) + " veces." : veces(pre.total) + ".")
          : "el pre-stow salta " + veces(pre.total) + (st.total ? " y el stow, " + veces(st.total) + "." : " y el stow no llega a saltar.")) +
        " En " + de(pre.alreadyOk) + " de los pre-stow" + (st.total ? " y en " + de(st.alreadyOk) + " de los stow" : "") +
        " el seguidor ya está en posición y no hay que moverlo.");

  // ── piezas del documento ──
  const AMBAR = "#E8891C", ROJO = "#CF3347", TINTA = "#132238";
  const img = k => { const u = figures && figures[k]; return typeof u === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : ""; };
  const pic = (k, alt) => '<img src="' + img(k) + '" alt="' + e(alt) + '">';
  const tabla = (cls, head, body) => "<table class='tabla " + cls + "'><thead>" + head + "</thead><tbody>" + body + "</tbody></table>";
  const nota = t => t ? '<p class="nota">' + t + "</p>" : "";
  const figura = (inner, pie) => "<figure>" + inner + (pie ? "<figcaption>" + pie + "</figcaption>" : "") + "</figure>";
  // Cada apartado es la pregunta que haría un compañero, y debajo la respuesta en una frase; luego, lo que la sostiene.
  const apartado = (pregunta, respuesta, contenido) => {
    if (!contenido && !respuesta) return "";
    const corte = contenido.search(/<\/(table|figure|ul)>/), fin = corte < 0 ? contenido.length : contenido.indexOf(">", corte) + 1;   // el primer bloque entero
    return '<section><div class="junto"><h2>' + pregunta + "</h2>" + (respuesta ? '<p class="respuesta">' + respuesta + "</p>" : "") + contenido.slice(0, fin) + "</div>" + contenido.slice(fin) + "</section>";
  };
  // La mesa del seguidor vista de canto, con su inclinación: es la forma más corta de decir qué pide cada alarma.
  const mesa = (deg, color) => {
    const a = deg * D2R, dx = 10 * Math.cos(a), dy = 10 * Math.sin(a), f = v => v.toFixed(1);
    return '<svg class="mesa" viewBox="0 0 26 20" aria-hidden="true"><path d="M13 19V10" stroke="#9aa4b0" stroke-width="1.5"/><path d="M' + f(13 - dx) + " " + f(10 + dy) + "L" + f(13 + dx) + " " + f(10 - dy) + '" stroke="' + color + '" stroke-width="3" stroke-linecap="round"/></svg>';
  };
  const tilt = { "Pre-stow": mesa(o.prestowMinDeg, AMBAR), "Stow": mesa(o.stowDeg, ROJO) }, hueco = '<span class="mesa"></span>';
  const alarma = r => '<div class="al">' + (tilt[r.name] || hueco) + "<div><b>" + e(r.name) + '</b><br><span class="umbral">&gt; ' + esNum(r.kmh, 0) + " km/h (" + esNum(r.ms, 1) + " m/s)</span></div></div>";
  const sens = (result.sensors || []).filter(x => g.key === WIND_LOGIC_PLANT_KEY || result.groups.length === 1 || x.ncu === g.key);
  const ha = (x, min) => x.dataMinutes ? 8766 * min / x.dataMinutes : null, rumbo = x => { if (!x.rose) return ""; let k = 0; for (let i = 1; i < 16; i++) if (x.rose.prestow[i] > x.rose.prestow[k]) k = i; return COMPASS[k]; };
  const plural = que.replace("ón", "one") + "s", peor = ins.top[0];

  // 1 · Cuántas veces: el recuento y el movimiento que pide cada alarma, en columnas.
  const mov = m => "<td>" + esInt(m.n) + "</td><td>" + (m.n ? esDeg(m.meanDeg) : "—") + "</td><td>" + (m.n ? esDeg(m.maxDeg) : "—") + "</td>";
  let cuerpo = apartado("¿Cuántas veces salta cada alarma?", e(lead), tabla("datos",
    "<tr><th rowspan='2'>Alarma</th><th rowspan='2'>Episodios</th><th rowspan='2'>Veces<br>que salta</th><th rowspan='2'>Sin<br>mover</th><th colspan='3' class='grupo'>Hay que mover, de día</th><th colspan='3' class='grupo'>Hay que mover, de noche</th></tr>" +
    "<tr><th>Veces</th><th>Media</th><th>Máx.</th><th>Veces</th><th>Media</th><th>Máx.</th></tr>",
    sum.rows.map(r => "<tr><td>" + alarma(r) + "</td><td class='n'>" + esInt(r.episodes) + "</td><td class='n'>" + esInt(r.total) + "</td><td>" + esInt(r.ok) + "</td>" + mov(r.dayMove) + mov(r.nightMove) + "</tr>").join("")) +
    nota(total && sum.episodeRule ? e(sum.episodeRule) + " Media y máximo, en grados de recorrido." : ""));

  if (total) {
    // 2 · Lo mismo por año, que es como se dimensiona el accionamiento.
    const an = ins.annual, fila = (t, name) => "<tr><td>" + tilt[name] + "<b>" + name + "</b></td><td>" + n1(an[t].episodes) + "</td><td>" + n1(an[t].activations) + "</td><td class='n'>" + n1(an[t].moves) + "</td><td class='n'>" + n1(an[t].degrees) + "°</td><td class='n'>" + n1(an[t].hours) + " h</td></tr>";
    cuerpo += apartado("¿Cuánto trabaja el seguidor al año?",
      "El pre-stow lo mueve " + n1(an.prestow.moves) + " veces al año y el stow, " + n1(an.stow.moves) + ": entre los dos, " + n1(an.prestow.degrees + an.stow.degrees) + "° de recorrido. Pasa " + n1(an.prestow.hours) + " h al año en alarma, " + n1(an.stow.hours) + " de ellas en stow.",
      tabla("datos", "<tr><th>Al año</th><th>Episodios</th><th>Veces<br>que salta</th><th>Movimientos</th><th>Recorrido</th><th>Tiempo<br>en alarma</th></tr>", fila("prestow", "Pre-stow") + fila("stow", "Stow")) +
      nota("Con " + esNum(ins.years, 2) + " años de dato."));

    // 3 · Cuándo y cuánto dura: calendario, reloj y nube; sin lienzo, la figura de barras.
    const mejor = [...ch.monthly].sort((a, b) => b.prestow - a.prestow)[0];
    const arg = (l, f) => { let k = 0; for (let i = 1; i < 24; i++) if (f(l[i], l[k])) k = i; return k; }, hi = arg(clock.prestow, (a, b) => a > b);
    const barras = () => {
      const tl = ch.timeline, N = tl.labels.length;
      if (!N) return "";
      const W = 760, H = 236, L = 32, R = 4, T = 30, B = 28, top = Math.max(1, ...tl.prestow, ...tl.stow);
      const step = top <= 5 ? 1 : top <= 10 ? 2 : top <= 25 ? 5 : top <= 50 ? 10 : Math.ceil(top / 50) * 10, yMax = Math.ceil(top / step) * step;
      const slot = (W - L - R) / N, bw = Math.max(1.2, Math.min(11, (slot - 4) / 2)), gap = Math.min(2, bw / 3), y = v => T + (H - T - B) * (1 - v / yMax);
      const every = Math.max(1, Math.ceil(N / (tl.unit === "mes" ? 19 : 11)));
      const rotulo = k => tl.unit === "mes" ? tl.labels[k] : (() => { const [d, m] = tl.labels[k].split("/"); return +d + " " + MES3[+m - 1]; })();
      const bar = (x, v, color, what, k) => {
        const h = y(0) - y(v), r = Math.min(2, bw / 2, h);
        return '<path d="M' + x.toFixed(1) + " " + y(0).toFixed(1) + "v-" + (h - r).toFixed(1) + "a" + r + " " + r + " 0 0 1 " + r + " -" + r + "h" + (bw - 2 * r).toFixed(1) +
          "a" + r + " " + r + " 0 0 1 " + r + " " + r + "v" + (h - r).toFixed(1) + 'z" fill="' + color + '"><title>' + (tl.unit === "mes" ? rotulo(k) : "Semana del " + tl.labels[k]) + ": " + esInt(v) + " de " + what + "</title></path>";
      };
      let body = "";
      for (let v = 0; v <= yMax; v += step) body += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="' + (v ? "#e4e7ea" : "#8b939b") + '" stroke-width="' + (v ? 0.8 : 1) + '"/>' +
        '<text x="' + (L - 7) + '" y="' + (y(v) + 4.2).toFixed(1) + '" text-anchor="end">' + v + "</text>";
      for (let k = 0; k < N; k++) {
        const cx = L + slot * (k + 0.5);
        if (tl.prestow[k]) body += bar(cx - bw - gap / 2, tl.prestow[k], REPORT_COLORS.pre, "pre-stow", k);
        if (tl.stow[k]) body += bar(cx + gap / 2, tl.stow[k], REPORT_COLORS.stow, "stow", k);
        if (k % every === 0) body += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + rotulo(k) + "</text>";
      }
      body += '<rect x="' + L + '" y="5" width="10" height="10" rx="1.5" fill="' + REPORT_COLORS.pre + '"/><text x="' + (L + 15) + '" y="14.5">pre-stow</text>' +
        '<rect x="' + (L + 84) + '" y="5" width="10" height="10" rx="1.5" fill="' + REPORT_COLORS.stow + '"/><text x="' + (L + 99) + '" y="14.5">stow</text>';
      const Que = unidos ? "Episodios" : "Activaciones";
      return figura('<svg class="barras" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + Que + " por " + tl.unit + '">' + body + "</svg>", Que + " por " + tl.unit + "." + (tl.unit === "semana" ? " Cada semana se rotula con su primer día." : ""));
    };
    cuerpo += apartado("¿Cuándo salta y cuánto dura?",
      (mejor && mejor.prestow ? "El mes con más " + plural + " es " + MESES[mejor.m] + " de " + mejor.y + ", con " + esInt(mejor.prestow) + ". " : "") +
      "A lo largo del día el pre-stow es más frecuente de " + hi + " a " + (hi + 1) + " h, con la alarma activa el " + esNum(clock.prestow[hi], 1) + " % del tiempo." +
      (ins.medianDurationMin !== null ? " La mitad de los " + plural + " dura menos de " + esDuration(ins.medianDurationMin) + "." : ""),
      (img("calendar") ? figura(pic("calendar", "Calendario de alarmas"), "Una fila por año; cada día es una columna de 0 a 24 h, en hora local. Sobre cada mes, sus " + plural + " de pre-stow y de stow.") : "") +
      (img("clock") && img("scatter") ? figura('<div class="par">' + pic("clock", "Alarma activa por hora del día") + pic("scatter", "Duración y racha máxima de cada " + que) + "</div>",
        "Izquierda: parte del tiempo con cada alarma activa a cada hora, cada una con su escala. Derecha: un punto por " + que + " de pre-stow; con fecha, los de racha más alta.") : "") +
      (img("calendar") || img("clock") ? "" : barras()));

    // 4 · Hasta dónde llega la racha: por tramos, los peores y la racha esperada.
    const gu = sum.gust, rl = ins.returnLevels, conDir = ins.top.some(x => x.dirDeg !== null);
    cuerpo += apartado("¿Hasta dónde llega la racha?",
      esInt(ins.reachStow) + " de los " + esInt(ins.episodes) + " " + plural + (ins.reachStow === 1 ? " pasa de " : " pasan de ") + S + " km/h." +
      (peor ? " La racha más alta, " + esNum(peor.peakKmh, 1) + " km/h, es del " + dia(peor.tPeak) + "." : "") +
      (rl && rl.levels.length ? " Se espera " + rl.levels.map(l => esNum(l.kmh, 0) + " km/h " + (l.years === 1 ? "una vez al año" : "cada " + l.years + " años")).join(", ").replace(/, ([^,]*)$/, " y $1") + "." : ""),
      tabla("datos rachas", "<tr><th>Racha máxima, km/h</th>" + gu.bins.map(x => "<th>" + e(x.kmh) + "</th>").join("") + "</tr><tr class='sub'><th>m/s</th>" + gu.bins.map(x => "<th>" + e(x.ms) + "</th>").join("") + "</tr>",
        "<tr><td>" + tilt["Pre-stow"] + "<b>Pre-stow</b></td>" + gu.prestow.map(v => "<td>" + esInt(v) + "</td>").join("") + "</tr><tr><td>" + tilt["Stow"] + "<b>Stow</b></td>" + gu.stow.map(v => "<td>" + (v === null ? "" : esInt(v)) + "</td>").join("") + "</tr>") +
      nota("Veces que salta cada alarma, según la racha máxima que alcanza.") +
      (ins.top.length ? tabla("datos top",
        "<tr><th>" + (ins.top.length === 1 ? "El peor" : "Los " + ["", "", "dos", "tres", "cuatro", "cinco"][ins.top.length] + " peores") + ", inicio</th><th>Duración</th><th>Racha máxima</th><th>m/s</th>" + (conDir ? "<th>Dirección</th>" : "") + "<th>HSU que la mide</th></tr>",
        ins.top.map(x => "<tr><td>" + e(diaHora(x.t)) + "</td><td>" + e(esDuration(x.durationMin)) + "</td><td class='n'>" + esNum(x.peakKmh, 1) + " km/h</td><td>" + esNum(x.peakKmh / 3.6, 1) + "</td>" +
          (conDir ? "<td>" + (x.dirDeg === null ? "—" : e(windCompass(x.dirDeg)) + " (" + esInt(x.dirDeg) + "°)") + "</td>" : "") + "<td>" + e(x.sensor || "—") + "</td></tr>").join("")) : "") +
      (rl && rl.levels.length ? nota('Racha esperada: <span class="f">v<sub>T</sub> = ' + esNum(rl.u, 0) + " + " + esNum(rl.sigma, 1) + " ln(" + esNum(rl.rate, 1) + " T)</span>, ajustada a los " + esInt(rl.n) + " " + plural + " de más de " + esNum(rl.u, 0) +
        " km/h en " + esNum(ins.years, 1) + " años de dato. Es una extrapolación.") : "") +
      (img("detail") && peor ? figura(pic("detail", "El " + que + " con la racha más alta, minuto a minuto"), "El del " + dia(peor.tPeak) + ", minuto a minuto: racha de cada HSU (arriba) y posición simulada del seguidor (abajo).") : ""));

    // 5 · De dónde viene: rosas y cómo pilla el viento al seguidor en los stow.
    const ex = ins.exposure, desfase = sum.notes.find(x => x.startsWith("Las HSU no dan la misma dirección"));
    if (ins.hasDirection) cuerpo += apartado("¿De dónde viene el viento?",
      st.total && ex ? "En los stow, el viento pilla al seguidor de cara " + veces(ex.cara) + ", de espalda " + veces(ex.espalda) + " y a menos de 30° del eje de las filas " + veces(ex.eje) + "." : "",
      (img("rose") ? figura(pic("rose", "Dirección del viento en alarma, según cada HSU"), "Parte del tiempo de alarma de cada HSU en que el viento llega de cada rumbo. De espalda: con el canto alto a barlovento.") : "") +
      (desfase ? '<p class="aviso">' + e(desfase) + "</p>" : ""));

    // 6 · Qué ve cada HSU.
    const mas = [...sens].sort((a, b) => (ha(b, b.minutesOverPrestow) || 0) - (ha(a, a.minutesOverPrestow) || 0))[0], hayDir = sens.some(x => x.rose);
    if (sens.length) cuerpo += apartado("¿Qué ve cada HSU?",
      mas && sens.length > 1 && mas.minutesOverPrestow ? "La que más viento ve es " + e(mas.plain) + ": " + n1(ha(mas, mas.minutesOverPrestow)) + " h al año por encima de " + P + " km/h." : "",
      (img("exceedance") ? figura(pic("exceedance", "Horas al año de cada HSU por encima de cada velocidad"), "Horas al año de cada HSU por encima de cada velocidad.") : "") +
      tabla("datos top", "<tr><th>HSU</th><th>Días<br>con dato</th><th>Racha máxima<br>km/h</th><th><br>m/s</th><th>Horas al año<br>sobre " + P + " km/h</th><th>Horas al año<br>sobre " + S + " km/h</th>" + (hayDir ? "<th>Dirección<br>en alarma</th>" : "") + "</tr>",
        sens.map(x => "<tr><td><b>" + e(x.plain) + "</b></td><td>" + esInt(x.days) + "</td><td class='n'>" + esNum(x.peakKmh, 1) + "</td><td>" + esNum(x.peakKmh / 3.6, 1) + "</td><td>" + n1(ha(x, x.minutesOverPrestow)) + "</td><td>" + n1(ha(x, x.minutesOverStow)) + "</td>" +
          (hayDir ? "<td>" + (x.rose ? e(rumbo(x)) + (x.dirDeg !== null ? ", " + esInt(x.dirDeg) + "°" : "") : "—") + "</td>" : "") + "</tr>").join("")) +
      nota(hayDir ? "Dirección: el rumbo más frecuente y la media, con el viento sobre " + P + " km/h y según la propia HSU." : ""));
  }

  const rules = [
    ["Pre-stow", "v > " + P + " km/h", "|θ| ≥ " + pm, "Δ = max(0, " + pm + " − |θ|)"],
    ["Stow", "v > " + S + " km/h", "|θ| = " + sd + ", el lado más cercano", "Δ = " + sd + " − |θ|"],
    ["Noche", "v > " + P + " km/h", "θ = " + sd + " E hasta el amanecer", "Δ = " + esDeg(o.stowDeg - o.nightDeg) + ", una vez por noche"],
    ["Fin de alarma", "t − tᵤ > " + o.holdMin + " min", "seguimiento; de noche, " + esDeg(o.nightDeg) + " E", "—"]
  ];
  const sensores = g.parts ? "todas las HSU de la planta: " + esList(g.parts.map(p => p.label + " (" + esList(p.sensors) + ")"))
    : g.sensors.length ? g.label + ": " + esList(g.sensors) : g.label;
  const periodo = g.coverage.first === null ? "sin datos" : "del " + esDay(g.coverage.first) + " al " + esDay(g.coverage.last) + ", " + esInt(g.coverage.days) + (g.coverage.days === 1 ? " día con dato" : " días con dato");
  // El croquis de cabecera: la mesa en seguimiento, en pre-stow y en stow. Lo que se simula, de un vistazo.
  const croquis = (() => {
    const cx = 128, cy = 74, L = 64, linea = (deg, color, w, dash) => { const a = deg * D2R, dx = L * Math.cos(a), dy = L * Math.sin(a);
      return '<path d="M' + (cx - dx).toFixed(1) + " " + (cy + dy).toFixed(1) + "L" + (cx + dx).toFixed(1) + " " + (cy - dy).toFixed(1) + '" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : "") + "/>"; };
    const arco = (deg, r, color) => { const a = deg * D2R; return '<path d="M' + (cx + r) + " " + cy + "A" + r + " " + r + " 0 0 0 " + (cx + r * Math.cos(a)).toFixed(1) + " " + (cy - r * Math.sin(a)).toFixed(1) + '" fill="none" stroke="' + color + '" stroke-width="1.2"/>'; };
    return '<svg class="croquis" viewBox="0 0 272 150" role="img" aria-label="Posiciones del seguidor: seguimiento, pre-stow y stow">' +
      '<path d="M22 134H232" stroke="#b9c2cc" stroke-width="1.5" stroke-linecap="round"/><path d="M' + cx + " 134V" + cy + '" stroke="#7d8793" stroke-width="3" stroke-linecap="round"/>' +
      '<g fill="none" stroke="#9ec3d6" stroke-width="1.6" stroke-linecap="round"><path d="M8 30q11-7 22 0t22 0"/><path d="M4 50q11-7 22 0t22 0"/><path d="M12 70q11-7 22 0t22 0"/></g>' +
      linea(0, "#c3cbd4", 3, "5 6") + arco(o.prestowMinDeg, 30, AMBAR) + arco(o.stowDeg, 44, ROJO) + linea(o.prestowMinDeg, AMBAR, 5) + linea(o.stowDeg, ROJO, 5) +
      '<circle cx="' + cx + '" cy="' + cy + '" r="4.5" fill="#fff" stroke="#7d8793" stroke-width="2"/>' +
      '<text x="190" y="43" fill="#5e6875">pre-stow, ' + pm + '</text><text x="171" y="18" fill="#5e6875">stow, ' + sd + '</text><text x="6" y="94" fill="#5e6875">viento</text></svg>';
  })();
  const face = (k, family, weight) => { const u = fonts && fonts[k]; return typeof u === "string" && /^data:font\/woff2;base64,[A-Za-z0-9+/=]+$/.test(u) ? "@font-face{font-family:'" + family + "';font-weight:" + weight + ";font-style:normal;src:url(" + u + ") format('woff2')}" : ""; };
  const sans = "'Barlow','Segoe UI','Helvetica Neue',Arial,sans-serif", display = "'Barlow Condensed','Arial Narrow','Roboto Condensed'," + sans;
  const otras = sum.notes.filter(x => !x.startsWith("Las HSU no dan la misma dirección") || !ins.hasDirection || !total);
  return "<!doctype html><html lang='es'><head><meta charset='utf-8'><meta name='generator' content='Factiun, lógica de viento " + e(result.version) + "'><title>Lógica de viento, " + e(result.plant) + "</title><style>" +
    face("b400", "Barlow", 400) + face("b500", "Barlow", 500) + face("b600", "Barlow", 600) + face("c600", "Barlow Condensed", 600) +
    "@page{size:A4;margin:17mm 18mm}*{box-sizing:border-box}html{background:#fff}" +
    "body{font-family:" + sans + ";color:#222b36;max-width:740px;margin:40px auto 60px;padding:0 24px;font-size:15.5px;line-height:1.5}" +
    ".cab{display:grid;grid-template-columns:minmax(0,1fr) 262px;gap:16px;align-items:end;border-bottom:3px solid " + TINTA + ";padding-bottom:14px}" +
    "h1{font-family:" + display + ";font-weight:600;font-size:66px;line-height:.92;color:" + TINTA + ";margin:0;text-wrap:balance}" +
    ".sub{font-size:18px;font-weight:500;color:" + TINTA + ";margin:8px 0 14px}" +
    ".ficha{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1px 16px;margin:0;font-size:14px;line-height:1.4}.ficha dt{color:#5e6875}.ficha dd{margin:0}" +
    ".croquis{display:block;width:262px;height:auto}.croquis text{font-family:" + sans + ";font-size:12.5px;font-weight:500}" +
    "h2{font-family:" + display + ";font-weight:600;font-size:28px;line-height:1.1;color:" + TINTA + ";margin:0 0 6px}section{margin-top:32px}" +
    ".respuesta{font-size:17.5px;line-height:1.42;font-weight:500;color:" + TINTA + ";margin:0 0 14px;max-width:64ch}p{margin:0 0 12px}b{font-weight:600}" +
    ".tabla{border-collapse:collapse;width:100%;font-size:14.5px;font-variant-numeric:tabular-nums lining-nums;margin-top:12px}" +
    ".tabla th{background:#edf1f5;color:" + TINTA + ";font-weight:600;font-size:13.5px;line-height:1.25;text-align:right;padding:6px 7px;vertical-align:bottom;white-space:nowrap}" +
    ".tabla td{text-align:right;padding:7px 7px;border-bottom:1px solid #dde3ea;vertical-align:middle;white-space:nowrap}.tabla td.n{font-weight:600;color:" + TINTA + "}" +
    ".tabla th:first-child,.tabla td:first-child{text-align:left}.tabla th.grupo{text-align:center;border-left:3px solid #fff}.tabla tr.sub th{font-weight:400;color:#5e6875;padding-top:0}" +
    ".tabla.top th:last-child,.tabla.top td:last-child{text-align:left;padding-left:18px}.tabla.reglas th,.tabla.reglas td{text-align:left;white-space:normal}" +
    ".umbral{color:#5e6875;font-size:.92em}.mesa{display:inline-block;width:26px;height:20px;vertical-align:-5px;margin-right:6px}.al{display:flex;align-items:center;line-height:1.3}" +
    ".f{font-family:'Cambria Math','STIX Two Math','Times New Roman',serif;white-space:nowrap}" +
    ".nota,figcaption{font-size:13px;line-height:1.4;color:#5e6875;margin:6px 0 0}.aviso{border-left:4px solid " + AMBAR + ";padding:2px 0 2px 12px;margin:14px 0 0;font-weight:500;color:" + TINTA + "}" +
    "figure{margin:16px 0 0}svg.barras,figure img{display:block;width:100%;height:auto}.par{display:grid;grid-template-columns:1fr 1fr;gap:20px}.par img{min-width:0}svg.barras text{font-family:" + sans + ";font-size:13px;fill:#5e6875}" +
    "ul{margin:0;padding-left:19px}li{margin:0 0 5px}" +
    ".cierre{margin-top:34px;border-top:1px solid #c9d1da;padding-top:8px;font-size:13px;color:#5e6875;display:flex;justify-content:space-between;gap:20px}" +
    "@media print{body{margin:0;max-width:none;padding:0;font-size:10.5pt}h1{font-size:44pt}h2{font-size:19pt}section{margin-top:15pt}figure{margin-top:10pt}.cierre{margin-top:14pt}li{margin-bottom:2pt}.respuesta{font-size:12pt}.tabla td{padding-top:5px;padding-bottom:5px}.junto,tr,figure,.tabla,.cab,.aviso{break-inside:avoid}}</style></head><body>" +
    '<header class="cab"><div><h1>' + e(result.plant) + '</h1><p class="sub">Lógica de viento: simulación de pre-stow y stow</p>' +
    '<dl class="ficha"><dt>Sensores</dt><dd>' + e(sensores) + "</dd><dt>Periodo</dt><dd>" + e(periodo) + "</dd>" +
    (g.wind.peakKmh !== null ? "<dt>Racha máxima</dt><dd>" + esNum(g.wind.peakKmh, 1) + " km/h (" + esNum(g.wind.peakKmh / 3.6, 1) + " m/s)" + (peor ? ", el " + e(dia(peor.tPeak)) + (peor.sensor ? ", en " + e(peor.sensor) : "") : "") + "</dd>" : "") + "</dl></div>" + croquis + "</header>" +
    cuerpo +
    apartado("Qué se ha simulado", "", tabla("reglas", "<tr><th>Regla</th><th>Condición</th><th>Posición</th><th>Grados a mover</th></tr>", rules.map(r =>
      "<tr><td>" + (tilt[r[0]] || hueco) + "<b>" + e(r[0]) + "</b></td><td class='f'>" + e(r[1]) + "</td><td class='f'>" + e(r[2]) + "</td><td class='f'>" + e(r[3]) + "</td></tr>").join("")) +
      nota('<span class="f">v</span>, racha medida por las HSU (el máximo de cada minuto); <span class="f">θ</span>, posición teórica del seguidor, no la de las TCU; ' +
      '<span class="f">tᵤ</span>, última lectura por encima del umbral; <span class="f">Δ</span>, grados que hay que mover.')) +
    '<div class="junto">' + apartado("A tener en cuenta", "", otras.length ? "<ul>" + otras.map(x => "<li>" + e(x) + "</li>").join("") + "</ul>" : "") +
    '<div class="cierre"><span>La lista completa de activaciones va en el fichero CSV.</span><span>Factiun, ' + fecha + "</span></div></div></body></html>";
}
