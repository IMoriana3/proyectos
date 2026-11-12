/* FACTIUN · Previsión frente a medida en una planta.
 *
 * Cruza las medidas reales de los anemómetros (Supabase HSU o CSV del SCADA)
 * con la previsión ARCHIVADA de Open-Meteo para esas mismas horas: la
 * «Historical Forecast API» guarda, hora a hora, lo que daban las primeras
 * horas de cada pasada del modelo. Así se ve cuánto se equivoca la previsión
 * en nuestras plantas, como la serie de una estación frente al modelo.
 *
 * Dos resoluciones, para ver qué aporta el detalle:
 *   gruesa · ECMWF IFS 0,25° (~25 km)
 *   fina   · AROME HD de Météo-France (~1,5 km), o si no cubre el sitio o el
 *            periodo, HARMONIE-AROME Europa (~2 km)
 *
 * Alineación (UTC):
 *   viento medio → media de las muestras en [H−30 min, H+30 min), frente al
 *                  valor instantáneo del modelo a la hora H
 *   racha/máximo → máximo de las muestras en (H−1 h, H], frente a la racha
 *                  máxima de la hora previa que da el modelo
 * El modelo da el viento a 10 m; el anemómetro está a la altura de su
 * montaje, así que un sesgo constante es esperable y no es un error del
 * sensor.
 */
export const VERIFICACION_VERSION = "1.0.0";

export const MODELOS = Object.freeze([
  {id:"ecmwf_ifs025",                 papel:"gruesa", nombre:"ECMWF IFS 0,25° (~25 km)"},
  {id:"meteofrance_arome_france_hd",  papel:"fina",   nombre:"AROME HD (~1,5 km)"},
  {id:"knmi_harmonie_arome_europe",   papel:"fina",   nombre:"HARMONIE-AROME Europa (~2 km)"}
]);

export const MAGNITUDES = Object.freeze({
  wind_speed:{sensor:["wind_speed"],           modelo:"wind_speed_10m", agrega:"media",  etiqueta:"Viento medio", unidad:"m/s"},
  wind_peak: {sensor:["wind_peak","wind_gust"], modelo:"wind_gusts_10m", agrega:"maximo", etiqueta:"Racha / máximo del intervalo", unidad:"m/s"}
});

const H = 3600000;
const finito = v => typeof v === "number" && Number.isFinite(v);

/** Medidas a series horarias UTC (clave ISO «YYYY-MM-DDTHH:00Z»). */
export function horasMedidas(records, {plant = "", magnitud = "wind_speed"} = {}) {
  const m = MAGNITUDES[magnitud];
  if (!m) throw new Error("Magnitud sin previsión equivalente: " + magnitud);
  const cubos = new Map();
  for (const r of records || []) {
    if (plant && r.plant !== plant) continue;
    if (!m.sensor.includes(r.variable) || !finito(r.value)) continue;
    if (r.unit && r.unit !== "m/s") continue;
    const t = Date.parse(r.t);
    if (!Number.isFinite(t)) continue;
    // media: centrada en la hora; máximo: la hora que termina en H
    const hora = m.agrega === "media" ? Math.round(t / H) * H : Math.ceil(t / H) * H;
    const c = cubos.get(hora) || {suma: 0, n: 0, max: -Infinity};
    c.suma += r.value; c.n++; c.max = Math.max(c.max, r.value);
    cubos.set(hora, c);
  }
  return [...cubos.entries()].sort((a, b) => a[0] - b[0])
    .map(([h, c]) => ({t: new Date(h).toISOString().slice(0, 13) + ":00Z", valor: m.agrega === "media" ? c.suma / c.n : c.max, muestras: c.n}));
}

/** Periodo (fechas UTC) que cubren las medidas. */
export function periodoMedidas(horas) {
  if (!horas.length) return null;
  return {inicio: horas[0].t.slice(0, 10), fin: horas[horas.length - 1].t.slice(0, 10)};
}

export function urlPrevisionArchivada({lat, lon, inicio, fin, magnitud = "wind_speed"}) {
  if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) throw new Error("Coordenadas no válidas.");
  const m = MAGNITUDES[magnitud];
  const q = new URLSearchParams({
    latitude: (+lat).toFixed(5), longitude: (+lon).toFixed(5),
    start_date: inicio, end_date: fin, hourly: m.modelo,
    models: MODELOS.map(x => x.id).join(","), wind_speed_unit: "ms", timezone: "GMT"
  });
  return "https://historical-forecast-api.open-meteo.com/v1/forecast?" + q.toString();
}

/** Respuesta de Open-Meteo → {gruesa, fina} con series {t, valor} y su modelo. */
export function leePrevision(json, magnitud = "wind_speed") {
  const m = MAGNITUDES[magnitud], h = json?.hourly || {}, tiempos = h.time || [];
  const serie = id => {
    const v = h[m.modelo + "_" + id] || (MODELOS.length === 1 ? h[m.modelo] : null);
    if (!Array.isArray(v)) return null;
    const s = tiempos.map((t, i) => ({t: t.slice(0, 13) + ":00Z", valor: finito(v[i]) ? v[i] : null}));
    return s.some(x => x.valor != null) ? s : null;
  };
  const out = {gruesa: null, fina: null};
  for (const mod of MODELOS) {
    if (out[mod.papel]) continue;
    const s = serie(mod.id);
    if (s) out[mod.papel] = {modelo: mod, serie: s};
  }
  return out;
}

/** Sesgo (previsto − medido), error absoluto medio, RMSE y correlación. */
export function verifica(medida, prevista) {
  const p = new Map((prevista || []).filter(x => finito(x.valor)).map(x => [x.t, x.valor]));
  const pares = (medida || []).filter(x => finito(x.valor) && p.has(x.t)).map(x => [x.valor, p.get(x.t)]);
  const n = pares.length;
  if (!n) return {n: 0, sesgo: null, mae: null, rmse: null, r: null};
  const d = pares.map(([o, f]) => f - o), media = a => a.reduce((s, x) => s + x, 0) / a.length;
  const mo = media(pares.map(x => x[0])), mf = media(pares.map(x => x[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [o, f] of pares) { sxy += (o - mo) * (f - mf); sxx += (o - mo) ** 2; syy += (f - mf) ** 2; }
  return {
    n, sesgo: media(d), mae: media(d.map(Math.abs)), rmse: Math.sqrt(media(d.map(x => x * x))),
    r: n > 2 && sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null
  };
}

/** Series alineadas para la gráfica: un eje de horas común y huecos como null. */
export function seriesGrafica(medida, prevision) {
  const horas = new Set(medida.map(x => x.t));
  for (const k of ["gruesa", "fina"]) for (const x of prevision[k]?.serie || []) horas.add(x.t);
  const ini = medida.length ? Date.parse(medida[0].t) - 6 * H : -Infinity,
        fin = medida.length ? Date.parse(medida[medida.length - 1].t) + 6 * H : Infinity;
  const eje = [...horas].filter(t => { const v = Date.parse(t); return v >= ini && v <= fin; }).sort();
  const valores = serie => { const m = new Map((serie || []).map(x => [x.t, x.valor])); return eje.map(t => m.has(t) ? m.get(t) : null); };
  return {eje, medida: valores(medida), gruesa: valores(prevision.gruesa?.serie), fina: valores(prevision.fina?.serie)};
}
