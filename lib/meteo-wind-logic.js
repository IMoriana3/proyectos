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
export const WIND_LOGIC_VERSION = "1.0.0";

export const WIND_LOGIC_DEFAULTS = Object.freeze({
  prestowKmh: 40, stowKmh: 60, holdMin: 30,
  prestowMinDeg: 30, stowDeg: 55, maxDeg: 55, nightDeg: 5,
  pitchM: 6, chordM: 2.382, axisAzimuthDeg: 180,
  noonRule: "hold", duskRule: "east",
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
  prestowKmh: "umbral de pre-stow", stowKmh: "umbral de stow", holdMin: "tiempo de desactivación",
  prestowMinDeg: "rango mínimo de pre-stow", stowDeg: "posición de stow", maxDeg: "rango de giro", nightDeg: "posición de noche",
  pitchM: "pitch", chordM: "ancho del módulo", axisAzimuthDeg: "azimut del eje", toleranceDeg: "tolerancia", zeroRunMin: "racha de ceros"
};
export function windLogicOptions(input = {}) {
  const o = { ...WIND_LOGIC_DEFAULTS };
  for (const [k, v] of Object.entries(input || {})) if (k in o && v !== undefined) o[k] = v;
  for (const k of ["prestowKmh", "stowKmh", "holdMin", "prestowMinDeg", "stowDeg", "maxDeg", "nightDeg", "pitchM", "chordM", "axisAzimuthDeg", "toleranceDeg", "zeroRunMin"]) {
    o[k] = Number(o[k]);
    if (!fin(o[k])) throw new Error("Falta un valor numérico: " + (OPTION_LABELS[k] || k) + ".");
  }
  o.speedDegPerMin = o.speedDegPerMin === null || o.speedDegPerMin === "" ? null : Number(o.speedDegPerMin);
  if (o.speedDegPerMin !== null && !(o.speedDegPerMin > 0)) throw new Error("La velocidad de giro debe ser mayor que cero, o quedar vacía.");
  if (!(o.prestowKmh > 0) || !(o.stowKmh > o.prestowKmh)) throw new Error("El umbral de stow debe ser mayor que el de pre-stow, y ambos positivos.");
  if (!(o.holdMin >= 1)) throw new Error("El tiempo de desactivación debe ser de al menos 1 minuto.");
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
  const groups = new Map();
  for (const r of mine) {
    if (r.variable !== variable) continue;
    const factor = r.unit === "m/s" ? 3.6 : r.unit === "km/h" ? 1 : null;
    if (factor === null) continue;
    const ms = Date.parse(r.t); if (!Number.isFinite(ms)) continue;
    const key = String(r.ncu ?? "");
    if (!groups.has(key)) groups.set(key, { key, label: key ? "NCU " + key : "Planta (sin NCU declarada)", sensors: new Set(), byMinute: new Map() });
    const g = groups.get(key), m = Math.floor(ms / MIN), kmh = r.value * factor, old = g.byMinute.get(m);
    g.sensors.add(String(r.sensor ?? ""));
    if (old === undefined || kmh > old) g.byMinute.set(m, kmh);
  }
  const out = [...groups.values()].map(g => {
    const minutes = [...g.byMinute.keys()].sort((a, b) => a - b);
    return { key: g.key, label: g.label, sensors: [...g.sensors].sort(), minutes, kmh: minutes.map(m => g.byMinute.get(m)) };
  }).sort((a, b) => a.key.localeCompare(b.key, "es", { numeric: true }));
  return { variable, groups: out };
}

/* Activaciones: una alarma dura desde la primera lectura sobre umbral hasta holdMin
 * minutos después de la ÚLTIMA; una lectura sobre umbral más tarde es otra activación. */
export function detectActivations(minutes, kmh, thresholdKmh, holdMin) {
  const events = []; let cur = null;
  for (let i = 0; i < minutes.length; i++) {
    if (!(kmh[i] > thresholdKmh)) continue;
    const m = minutes[i];
    if (!cur || m - cur.last > holdMin) { cur = { start: m, last: m, end: m + holdMin, peakKmh: kmh[i], minutesOver: 0 }; events.push(cur); }
    cur.last = m; cur.end = m + holdMin; cur.minutesOver++;
    if (kmh[i] > cur.peakKmh) cur.peakKmh = kmh[i];
  }
  return events;
}

function simulateGroup(series, o, solarPosition, site) {
  const { minutes, kmh } = series, n = minutes.length;
  const pre = detectActivations(minutes, kmh, o.prestowKmh, o.holdMin);
  const stw = detectActivations(minutes, kmh, o.stowKmh, o.holdMin);
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
  let ip = 0, is = 0, j = 0;                 // punteros a pre-stow, stow y lecturas
  let dayData = 0, preDay = 0, stowDay = 0, wasNight = null;
  const lastMinute = n ? minutes[n - 1] : -1;
  for (let m = n ? minutes[0] : 0; m <= lastMinute; m++) {
    while (ip < pre.length && pre[ip].end < m) ip++;
    while (is < stw.length && stw[is].end < m) is++;
    while (j < n && minutes[j] < m) j++;
    const P = ip < pre.length && pre[ip].start <= m, A = is < stw.length && stw[is].start <= m;
    // Hueco largo sin alarma: no hay nada que simular hasta el siguiente dato.
    if (!P && !A && j < n && minutes[j] - m > 2880) { m = minutes[j] - 1; latched = false; side = null; stowTarget = null; wasNight = null; pos = angleAt(m).theta; continue; }
    const hasData = j < n && minutes[j] === m;
    const startP = P && pre[ip].start === m, startS = A && stw[is].start === m;
    const { night: N, theta: th } = angleAt(m), before = pos;
    let target;
    if (N) {
      side = null; stowTarget = null;
      if (latched) target = east;
      else if (P || A) {
        if (startP || startS) { latched = true; target = east; }
        else {
          if (o.duskRule === "east") { latched = true; target = east; } else target = pos;
          if (wasNight === false) dusk.push({ t: m * MIN, posBefore: round1(before), target: round1(target), degrees: round1(Math.abs(target - before)) });
        }
      } else target = -o.nightDeg;
    } else {
      latched = false;
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
    for (const [type, on, ev] of [["prestow", startP, pre[ip]], ["stow", startS, stw[is]]]) {
      if (!on) continue;
      const ok = type === "prestow" && !N ? Math.abs(before) >= o.prestowMinDeg - tol : Math.abs(before - target) <= tol;
      // lecturas válidas y no nulas en la ventana anterior: si faltan, la activación es la vuelta del dato
      let valid = 0;
      for (let k = j - 1; k >= 0 && minutes[k] >= m - o.holdMin; k--) if (kmh[k] > 0) valid++;
      activations.push({
        type, id: ev.id, parentId: type === "stow" && P ? pre[ip].id : null,
        t: m * MIN, tLast: ev.last * MIN, tEnd: ev.end * MIN, durationMin: ev.end - ev.start,
        minutesOver: ev.minutesOver, peakKmh: round1(ev.peakKmh), crossKmh: round1(kmh[j]),
        night: N, thetaTheory: round1(th), posBefore: round1(before), target: round1(target),
        alreadyOk: ok, degrees: ok ? 0 : round1(Math.abs(target - before)),
        sameMinuteAsPrestow: type === "stow" && startP,
        doubtful: !coarse && valid < expected / 2
      });
    }
    pos = o.speedDegPerMin === null ? target : pos + Math.max(-o.speedDegPerMin, Math.min(o.speedDegPerMin, target - pos));
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
  let peak = null, overPre = 0, overStow = 0;
  for (let i = 0; i < n; i++) {
    days.add(dayOf(minutes[i]));
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
  return {
    key: series.key, label: series.label, sensors: series.sensors,
    coverage: { first: n ? minutes[0] * MIN : null, last: n ? lastMinute * MIN : null, dataMinutes: n, days: days.size, gaps, cadenceMin, coarse },
    wind: { peakKmh: peak === null ? null : round1(peak), minutesOverPrestow: overPre, minutesOverStow: overStow, daysOverPrestow: daysPre.size, daysOverStow: daysStow.size },
    prestow: stat("prestow"), stow: stat("stow"),
    movementsToStow: { total: toStow.length, day: toStow.filter(x => !x.night).length, night: toStow.filter(x => x.night).length },
    daylight: { dataMinutes: dayData, prestowPct: dayData ? round1(100 * preDay / dayData) : null, stowPct: dayData ? round1(100 * stowDay / dayData) : null },
    dusk: { rule: o.duskRule, total: dusk.length, crossingHorizontal: dusk.filter(d => d.posBefore > 0).length, events: dusk },
    quality: { zeroRuns, zeroMinutes: zeroRuns.reduce((s, r) => s + r.minutes, 0) },
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

export function simulateWindLogic(records, { plant = "", site, options, solarPosition } = {}) {
  if (typeof solarPosition !== "function") throw new Error("Falta la función de posición solar.");
  // null o vacío NO es la latitud 0: sin coordenadas no hay posición teórica que calcular
  const coord = v => v === null || v === undefined || v === "" ? NaN : Number(v);
  const lat = coord(site?.lat), lon = coord(site?.lon);
  if (!fin(lat) || !fin(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("Faltan las coordenadas del emplazamiento para calcular la posición teórica.");
  const o = windLogicOptions(options), series = windSeriesByGroup(records, { plant });
  if (!series.variable) throw new Error("No hay lecturas de viento (máximo, ráfaga o velocidad) en las medidas cargadas.");
  const groups = series.groups.map(g => { const r = simulateGroup(g, o, solarPosition, { lat, lon }); r.matrix = windLogicMatrix(r, o); return r; });
  return {
    schema: "factiun_wind_logic_simulation_v1", version: WIND_LOGIC_VERSION, plant,
    site: { lat, lon, timezone: site?.tz || site?.timezone || "UTC" }, variable: series.variable, options: o, groups,
    notice: "Simulación: viento medido por las HSU y posición TEÓRICA del seguidor (seguimiento con backtracking, terreno plano). " +
      "No describe cómo se movió la planta." +
      (series.variable === "wind_speed" ? " Sin máximo de ráfaga en los datos: se usa la velocidad media del intervalo y el recuento queda por debajo." : "")
  };
}

/* CSV de activaciones para hoja de cálculo en español (separador «;», coma decimal). */
export function windLogicCsv(result, { timeZone = "" } = {}) {
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
  const head = ["grupo", "tipo", "id", "id_prestow", "inicio_utc", ...(local ? ["inicio_local"] : []), "fin_alarma_utc", "duracion_min",
    "min_sobre_umbral", "racha_cruce_kmh", "pico_kmh", "periodo", "angulo_teorico_seguimiento_deg", "posicion_antes_deg", "destino_deg",
    "lado_destino", "ya_en_posicion", "grados_a_mover", "nota"];
  const lines = [head.join(";")];
  for (const g of result.groups) for (const a of g.activations) {
    lines.push([g.label, a.type === "prestow" ? "pre-stow" : "stow", a.id, a.parentId ?? "", utc(a.t), ...(local ? [local(a.t)] : []), utc(a.tEnd),
      a.durationMin, a.minutesOver, num(a.crossKmh), num(a.peakKmh), a.night ? "noche" : "dia", num(a.thetaTheory), num(a.posBefore), num(a.target),
      side(a.target), a.alreadyOk ? "si" : "no", num(a.degrees),
      a.doubtful ? "DUDOSO: sin lecturas validas antes del cruce (hueco de dato o sensor a cero); puede ser la vuelta del dato y no una racha nueva" : ""].join(";"));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/* Activaciones por semana (lunes a domingo, UTC). Una sola cuenta para la gráfica
 * de la página y para la del informe. */
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

/* El resumen que se lee de un vistazo: por alarma, cuántas veces salta, en cuántas no
 * hay que mover el seguidor, en cuántas sí y cuánto. Lo usan la tarjeta y el informe,
 * para que digan lo mismo con las mismas palabras. */
export function windLogicSummary(result, group) {
  const o = result.options, g = group;
  const travel = s => s.meanDeg === s.maxDeg ? esDeg(s.maxDeg) : esDeg(s.meanDeg) + " de media (hasta " + esDeg(s.maxDeg) + ")";
  const how = st => [st.dayMove.n ? esInt(st.dayMove.n) + " de día, " + travel(st.dayMove) : "", st.nightMove.n ? esInt(st.nightMove.n) + " de noche, " + travel(st.nightMove) : ""].filter(Boolean).join("; ") || "—";
  const rows = [
    { label: "Pre-stow (> " + esNum(o.prestowKmh, 0) + " km/h)", total: g.prestow.total, ok: g.prestow.alreadyOk, move: g.prestow.move, how: how(g.prestow) },
    { label: "Stow (> " + esNum(o.stowKmh, 0) + " km/h)", total: g.stow.total, ok: g.stow.alreadyOk, move: g.stow.move, how: how(g.stow) }];
  const bands = m => m.rows.slice(0, -1).filter(r => r.total).map(r => r.label.replace(/ \(.*\)$/, "") + ": " + esInt(r.total)).join(" · ");
  const doubtful = g.prestow.doubtful + g.stow.doubtful, notes = [];
  if (g.dusk.total) notes.push("La alarma sigue activa al anochecer " + (g.dusk.total === 1 ? "una noche" : esInt(g.dusk.total) + " noches") + (o.duskRule === "east"
    ? (g.dusk.crossingHorizontal ? "; en " + esInt(g.dusk.crossingHorizontal) + " el seguidor está al Oeste y tendría que pasar por horizontal para ir a " + esDeg(o.stowDeg) + " E." : "; el seguidor va a " + esDeg(o.stowDeg) + " E.")
    : "; el seguidor se queda donde está."));
  if (doubtful) notes.push((doubtful === 1 ? "Una activación dudosa: salta" : esInt(doubtful) + " activaciones dudosas: saltan") + " tras un hueco de dato o con los sensores a cero.");
  if (g.coverage.coarse) notes.push("Lecturas cada " + g.coverage.cadenceMin + " min: resultado orientativo.");
  if (result.variable === "wind_speed") notes.push("Sin máximo de ráfaga en los datos: se ha usado la velocidad media, que se queda corta.");
  notes.push("El recuento es un mínimo: el registro no guarda todas las lecturas de 1 s.");
  return {
    period: g.coverage.first === null ? "" : esDay(g.coverage.first) + " – " + esDay(g.coverage.last) + " · " + esInt(g.coverage.days) + (g.coverage.days === 1 ? " día con dato" : " días con dato"),
    rows, bands: { prestow: bands(g.matrix.prestow), stow: bands(g.matrix.stow) }, notes
  };
}

/* Informe de UN grupo: una página, HTML autónomo, pensado para «Imprimir → PDF».
 * Corto a propósito: el resumen, la gráfica, las reglas como fórmulas y las notas.
 * La lista completa de activaciones va en el CSV, no aquí. */
export function windLogicReportHtml(result, { groupKey = null, generatedAt = new Date() } = {}) {
  const g = result.groups.find(x => x.key === groupKey) || result.groups[0];
  if (!g) throw new Error("No hay simulación que informar.");
  const o = result.options, sum = windLogicSummary(result, g), total = g.prestow.total + g.stow.total;
  const e = s => String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const C = { pre: "#e58a27", stow: "#23405f" };
  const wk = windLogicWeekly(g);
  let weekly = "";
  if (wk.weeks && total) {
    const W = 1000, H = 200, L = 34, B = 26, T = 8, top = Math.max(1, ...wk.prestow, ...wk.stow), step = top <= 5 ? 1 : top <= 10 ? 2 : top <= 25 ? 5 : top <= 50 ? 10 : Math.ceil(top / 50) * 10;
    const yMax = Math.ceil(top / step) * step, slot = (W - L) / wk.weeks, bw = Math.max(1.5, Math.min(18, slot * 0.38)), y = v => T + (H - T - B) * (1 - v / yMax);
    const every = Math.max(1, Math.ceil(wk.weeks / 13));
    let body = "";
    for (let v = 0; v <= yMax; v += step) body += '<line x1="' + L + '" x2="' + W + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="#e3e8ee"/><text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#5c687a">' + v + "</text>";
    for (let k = 0; k < wk.weeks; k++) {
      const cx = L + slot * (k + 0.5);
      if (wk.prestow[k]) body += '<rect x="' + (cx - bw).toFixed(1) + '" y="' + y(wk.prestow[k]).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (y(0) - y(wk.prestow[k])).toFixed(1) + '" fill="' + C.pre + '"/>';
      if (wk.stow[k]) body += '<rect x="' + cx.toFixed(1) + '" y="' + y(wk.stow[k]).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (y(0) - y(wk.stow[k])).toFixed(1) + '" fill="' + C.stow + '"/>';
      if (k % every === 0) body += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#5c687a">' + esDay(wk.start + k * wk.weekMs).slice(0, 5) + "</text>";
    }
    weekly = "<h2>Activaciones por semana</h2><svg class=\"semanas\" viewBox=\"0 0 " + W + " " + H + "\" role=\"img\" aria-label=\"Activaciones por semana\">" + body + "</svg>" +
      '<p class="leyenda"><i style="background:' + C.pre + '"></i>pre-stow <i style="background:' + C.stow + '"></i>stow</p>';
  }
  const P = esNum(o.prestowKmh, 0), S = esNum(o.stowKmh, 0), pm = esDeg(o.prestowMinDeg), sd = esDeg(o.stowDeg);
  const rules = [
    ["Pre-stow", "v > " + P + " km/h", "|θ| ≥ " + pm, "Δ = max(0, " + pm + " − |θ|)"],
    ["Stow", "v > " + S + " km/h", "|θ| = " + sd + ", el lado más cercano", "Δ = " + sd + " − |θ|"],
    ["Noche", "v > " + P + " km/h", "θ = " + sd + " E hasta el amanecer", "Δ = " + esDeg(o.stowDeg - o.nightDeg) + ", una vez por noche"],
    ["Fin de alarma", "t − tᵤ > " + o.holdMin + " min", "seguimiento; de noche, " + esDeg(o.nightDeg) + " E", "—"]
  ];
  const made = new Date(generatedAt);
  return "<!doctype html><html lang='es'><head><meta charset='utf-8'><title>Lógica de viento — " + e(result.plant) + "</title><style>" +
    "@page{margin:16mm}*{box-sizing:border-box}body{font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c2733;max-width:900px;margin:36px auto;padding:0 26px;font-size:13.5px;line-height:1.5}" +
    ".sobre{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5c687a;margin:0}h1{font-size:26px;line-height:1.15;margin:4px 0 6px;color:#0e1826}" +
    ".sub{color:#5c687a;margin:0 0 22px;padding-bottom:14px;border-bottom:2px solid #e58a27}h2{font-size:14px;margin:26px 0 8px;color:#0e1826}" +
    "table{border-collapse:collapse;width:100%}th,td{padding:7px 10px;text-align:right;border-bottom:1px solid #e3e8ee}th{font-weight:600;color:#5c687a;font-size:11.5px;border-bottom:1.5px solid #1c2733}" +
    "th:first-child,td:first-child,th:last-child,td:last-child{text-align:left}.resumen td{font-size:15px}.resumen td:nth-child(2),.resumen td:nth-child(3),.resumen td:nth-child(4){font-size:22px;font-weight:600;color:#0e1826}" +
    ".resumen td:last-child{font-size:13px;color:#1c2733}.resumen td:first-child{white-space:nowrap}.rangos{color:#5c687a;font-size:12.5px;margin:12px 0 0}.rangos b{color:#1c2733;font-weight:600}" +
    ".semanas{width:100%;height:auto;display:block}.leyenda{font-size:11.5px;color:#5c687a;margin:6px 0 0}.leyenda i{display:inline-block;width:10px;height:10px;margin:0 5px 0 10px;vertical-align:-1px}.leyenda i:first-child{margin-left:0}" +
    ".reglas{font-size:12.5px}.reglas th,.reglas td{text-align:left;padding:5px 10px}.reglas td:first-child{color:#5c687a;white-space:nowrap}.f{font-family:'Cambria Math','STIX Two Math',Cambria,Georgia,serif;font-size:13.5px}" +
    "ul{padding-left:18px;margin:6px 0;font-size:12.5px}li{margin:3px 0}.pie{color:#5c687a;font-size:11px;margin-top:26px;border-top:1px solid #e3e8ee;padding-top:8px}" +
    "@media print{body{margin:0;max-width:none;padding:0}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>" +
    '<p class="sobre">Factiun · Análisis meteorológico</p><h1>Lógica de viento · simulación pre-stow / stow</h1>' +
    '<p class="sub">' + e(result.plant) + " · " + e(g.label + " (" + g.sensors.join(", ") + ")") + " · " + e(sum.period) + "</p>" +
    "<table class='resumen'><thead><tr><th>Alarma</th><th>Veces que salta</th><th>No hay que mover</th><th>Hay que mover</th><th>Cuánto</th></tr></thead><tbody>" +
    sum.rows.map(r => "<tr><td>" + e(r.label) + "</td><td>" + esInt(r.total) + "</td><td>" + esInt(r.ok) + "</td><td>" + esInt(r.move) + "</td><td>" + e(r.how) + "</td></tr>").join("") + "</tbody></table>" +
    (total ? '<p class="rangos"><b>Por racha máxima.</b> Pre-stow: ' + e(sum.bands.prestow || "—") + (sum.bands.stow ? ". Stow: " + e(sum.bands.stow) : "") + ".</p>" : "") +
    weekly +
    "<h2>Reglas</h2><table class='reglas'><thead><tr><th>Regla</th><th>Condición</th><th>Posición</th><th>Grados a mover</th></tr></thead><tbody>" + rules.map(r =>
      "<tr><td>" + e(r[0]) + "</td><td class='f'>" + e(r[1]) + "</td><td class='f'>" + e(r[2]) + "</td><td class='f'>" + e(r[3]) + "</td></tr>").join("") + "</tbody></table>" +
    "<h2>Notas</h2><ul>" + sum.notes.map(x => "<li>" + e(x) + "</li>").join("") + "</ul>" +
    '<p class="pie">v: racha medida por las HSU, el máximo de cada minuto · θ: posición teórica del seguidor, no la de las TCU · tᵤ: última lectura sobre el umbral.<br>Factiun · ' +
    ("0" + made.getUTCDate()).slice(-2) + "/" + ("0" + (made.getUTCMonth() + 1)).slice(-2) + "/" + made.getUTCFullYear() + " · la lista de activaciones está en el CSV · simulación " + e(result.version) + "</p></body></html>";
}
