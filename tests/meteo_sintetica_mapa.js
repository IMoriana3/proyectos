// METEO DE MENTIRA PARA EL MAPA DE PAÍS, con la forma de la respuesta de
// Open-Meteo. No pretende parecerse a ningún sitio: pretende que el resultado
// sea PREDECIBLE. El viento crece hacia el noroeste (más latitud, más al
// oeste) y hay un temporal cada nueve días cuya ráfaga también crece con él,
// pero SIN llegar a la suelta del pasivo (90 km/h): el activo pierde más cuanto
// más al noroeste y el pasivo no pierde nada, así que un nodo del noroeste
// tiene que dar más ganancia que uno del sureste. Si el mapa no ordena eso, no está mirando el
// viento de cada nodo.
function fuerza(lat, lon) { return Math.max(1, 3 + 0.6 * (lat - 36) - 0.3 * lon); }

function respuesta(url) {
  const u = new URL(url), q = u.searchParams;
  const lat = +q.get('latitude'), lon = +q.get('longitude');
  const y = +q.get('start_date').slice(0, 4), conRafaga = /wind_gusts_10m/.test(q.get('hourly'));
  const n = ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365) * 24, t0 = Date.UTC(y, 0, 1);
  const H = { time: [], shortwave_radiation: [], diffuse_radiation: [], direct_normal_irradiance: [],
    temperature_2m: [], windspeed_10m: [], winddirection_10m: [] };
  if (conRafaga) H.wind_gusts_10m = [];
  const A = fuerza(lat, lon), r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  for (let i = 0; i < n; i++) {
    const d = new Date(t0 + i * 3600e3), h = d.getUTCHours(), dia = Math.floor(i / 24);
    const hs = h + lon / 15, c = Math.cos((hs - 12) * 15 * Math.PI / 180);
    const est = 0.75 + 0.25 * Math.cos(2 * Math.PI * (dia - 172) / 365);
    const g = c > 0 ? r1(950 * c * est) : 0;
    H.time.push(d.toISOString().slice(0, 16));
    H.shortwave_radiation.push(g);
    H.diffuse_radiation.push(r1(g * 0.2));
    H.direct_normal_irradiance.push(c > 0.05 ? r1(g * 0.8 / c) : 0);
    H.temperature_2m.push(r1(15 + 8 * Math.sin(2 * Math.PI * (h - 9) / 24)));
    const ws = r2(A * (0.7 + 0.3 * Math.sin(2 * Math.PI * h / 24)));
    H.windspeed_10m.push(ws);
    H.winddirection_10m.push(300);
    if (conRafaga) H.wind_gusts_10m.push(r1(dia % 9 === 0 && h >= 8 && h <= 15 ? 12 + A * 1.2 : ws * 1.6));
  }
  return { latitude: lat, longitude: lon, hourly: H };
}
module.exports = { respuesta, fuerza };
