/* Factiun · motor de criba hídrica v1.
   No es Iber/HEC-RAS: precipitación uniforme y flujo laminar/superficial
   2D por balance de volúmenes y fórmula de Manning local entre celdas.
   Sin alcantarillado, cauces, infiltración espacial, subgrid ni calibración.
   Los límites son vertido libre OPCIONAL; nunca se finge precisión de proyecto.
   Unidad interna: m, s, m3. Sin red ni dependencias. */
(function (root, build) {
  var api = build();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FactiunHydro = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var DEG = Math.PI / 180;

  function saneNumber(v, label, lo, hi) {
    var n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi)
      throw new Error(label + " fuera del rango " + lo + "–" + hi);
    return n;
  }
  function validateDem(dem) {
    if (!dem || !Array.isArray(dem.lats) || !Array.isArray(dem.lons) || !Array.isArray(dem.z))
      throw new Error("Falta una malla MDT de latitudes, longitudes y cotas");
    var rows = dem.lats.length, cols = dem.lons.length;
    if (rows < 3 || cols < 3 || rows > 100 || cols > 100 || dem.z.length !== rows)
      throw new Error("La malla MDT debe tener entre 3 y 100 puntos por eje");
    var latStep = (+dem.lats[rows - 1] - +dem.lats[0]) / (rows - 1);
    var lonStep = (+dem.lons[cols - 1] - +dem.lons[0]) / (cols - 1);
    var latMid = (+dem.lats[0] + +dem.lats[rows - 1]) / 2;
    var dy = Math.abs(latStep) * 111195;
    var dx = Math.abs(lonStep) * 111320 * Math.cos(latMid * DEG);
    if (!(dx > 0.05 && dy > 0.05) || dx > 2000 || dy > 2000)
      throw new Error("Separación de puntos MDT no válida para escorrentía local");
    var z = new Float64Array(rows * cols);
    for (var r = 0; r < rows; r++) {
      if (!Array.isArray(dem.z[r]) || dem.z[r].length !== cols)
        throw new Error("Filas del MDT incoherentes");
      if (Math.abs((+dem.lats[r] - (+dem.lats[0] + r * latStep)) * 111195) > dy * 0.05)
        throw new Error("Latitudes MDT no regulares");
      for (var c = 0; c < cols; c++) {
        if (r === 0 && Math.abs((+dem.lons[c] - (+dem.lons[0] + c * lonStep)) *
          111320 * Math.cos(latMid * DEG)) > dx * 0.05)
          throw new Error("Longitudes MDT no regulares");
        var v = Number(dem.z[r][c]);
        if (!Number.isFinite(v)) throw new Error("MDT con cota vacía o no numérica en " + r + "," + c);
        z[r * cols + c] = v;
      }
    }
    return { rows: rows, cols: cols, dx: dx, dy: dy, cellArea: dx * dy, z: z,
      lats: dem.lats.slice(), lons: dem.lons.slice(), source: String(dem.src || "MDT sin fuente") };
  }
  function config(options) {
    options = options || {};
    var rainMinutes = saneNumber(options.rainMinutes == null ? 60 : options.rainMinutes,
      "Duración de lluvia (min)", 1, 240);
    var totalMinutes = saneNumber(options.totalMinutes == null ? 120 : options.totalMinutes,
      "Horizonte (min)", rainMinutes, 360);
    return {
      rainfallMmH: saneNumber(options.rainfallMmH == null ? 60 : options.rainfallMmH,
        "Intensidad (mm/h)", 0, 500),
      rainMinutes: rainMinutes, totalMinutes: totalMinutes,
      runoff: saneNumber(options.runoff == null ? 0.7 : options.runoff, "Coeficiente de escorrentía", 0, 1),
      manningN: saneNumber(options.manningN == null ? 0.06 : options.manningN, "Manning n", 0.015, 0.25),
      dtSec: saneNumber(options.dtSec == null ? 10 : options.dtSec, "Paso (s)", 1, 30),
      openBoundary: options.openBoundary !== false,
      maxFrames: Math.floor(saneNumber(options.maxFrames == null ? 61 : options.maxFrames, "Fotogramas", 3, 121))
    };
  }
  function simulate(dem, options) {
    var g = validateDem(dem), p = config(options), n = g.rows * g.cols, cellArea = g.cellArea;
    var depth = new Float64Array(n), maxDepth = new Float64Array(n), maxVelocity = new Float64Array(n);
    var frames = [], inputM3 = 0, outletM3 = 0, steps = Math.ceil(p.totalMinutes * 60 / p.dtSec);
    var frameEvery = Math.max(1, Math.ceil(steps / (p.maxFrames - 1)));
    var rainSec = p.rainMinutes * 60, totalSec = p.totalMinutes * 60;
    function frame(minute) {
      frames.push({ minute: +minute.toFixed(4), depth_m: Float32Array.from(depth) });
    }
    frame(0);
    var nrows = g.rows, ncols = g.cols, dx = g.dx, dy = g.dy;
    var moves = new Float64Array(n), spent = new Float64Array(n);
    function transfer(a, b, dist, faceWidth, dt) {
      var head = g.z[a] + depth[a] - g.z[b] - depth[b];
      if (Math.abs(head) < 1e-10) return;
      var from = head > 0 ? a : b, to = head > 0 ? b : a;
      var h = depth[from];
      // Flujo sobre el umbral local, no sobre la cota absoluta.
      var wet = Math.min(h, Math.abs(head));
      if (wet <= 1e-7) return;
      var slope = Math.abs(head) / dist;
      var qPerWidth = Math.pow(wet, 5 / 3) * Math.sqrt(slope) / p.manningN;
      var sent = Math.min(Math.max(0, h - spent[from]), qPerWidth * faceWidth * dt / cellArea);
      if (sent <= 0) return;
      spent[from] += sent;
      moves[from] -= sent;
      moves[to] += sent;
      if (wet > 0.01) {
        var speed = qPerWidth / wet;
        if (speed > maxVelocity[from]) maxVelocity[from] = speed;
        if (speed > maxVelocity[to]) maxVelocity[to] = speed;
      }
    }
    function freeOutfall(a, faceWidth, dist, dt) {
      var h = depth[a], available = Math.max(0, h - spent[a]);
      if (available <= 0) return;
      // Pendiente equivalente a vertido libre por el borde. HIPÓTESIS, no cauce real.
      var q = Math.pow(h, 5 / 3) * Math.sqrt(h / dist) / p.manningN * faceWidth;
      var sent = Math.min(available, q * dt / cellArea);
      spent[a] += sent;
      moves[a] -= sent;
      outletM3 += sent * cellArea;
    }
    for (var step = 0; step < steps; step++) {
      var t0 = step * p.dtSec, dt = Math.min(p.dtSec, totalSec - t0);
      if (dt <= 0) break;
      var activeRain = Math.max(0, Math.min(t0 + dt, rainSec) - t0);
      var add = p.rainfallMmH * p.runoff * activeRain / 3600000;
      if (add) {
        for (var k = 0; k < n; k++) depth[k] += add;
        inputM3 += add * n * cellArea;
      }
      moves.fill(0); spent.fill(0);
      for (var r = 0; r < nrows; r++) for (var c = 0; c < ncols; c++) {
        var i = r * ncols + c;
        if (c + 1 < ncols) transfer(i, i + 1, dx, dy, dt);
        if (r + 1 < nrows) transfer(i, i + ncols, dy, dx, dt);
      }
      if (p.openBoundary) {
        for (var row = 0; row < nrows; row++) {
          freeOutfall(row * ncols, dy, dx / 2, dt);
          freeOutfall(row * ncols + ncols - 1, dy, dx / 2, dt);
        }
        for (var col = 0; col < ncols; col++) {
          freeOutfall(col, dx, dy / 2, dt);
          freeOutfall((nrows - 1) * ncols + col, dx, dy / 2, dt);
        }
      }
      for (var j = 0; j < n; j++) {
        depth[j] = Math.max(0, depth[j] + moves[j]);
        if (depth[j] > maxDepth[j]) maxDepth[j] = depth[j];
      }
      if ((step + 1) % frameEvery === 0 || step === steps - 1) frame(Math.min(totalSec, t0 + dt) / 60);
    }
    var storageM3 = 0, peak = 0, wetCells = 0, criticalCells = 0, maxSpeed = 0;
    for (var i2 = 0; i2 < n; i2++) {
      storageM3 += depth[i2] * cellArea;
      if (maxDepth[i2] > peak) peak = maxDepth[i2];
      if (maxDepth[i2] >= 0.10) wetCells++;
      if (maxDepth[i2] >= 0.30) criticalCells++;
      if (maxVelocity[i2] > maxSpeed) maxSpeed = maxVelocity[i2];
    }
    var mismatch = inputM3 - outletM3 - storageM3;
    return {
      model: "factiun-screening-manning-grid-v1", status: "PRELIMINAR_NO_CERTIFICADO",
      dem: g, options: p, frames: frames, peakDepth_m: maxDepth,
      peakVelocity_mps: maxVelocity,
      summary: {
        maxDepthM: peak, maxLocalVelocityMps: maxSpeed,
        areaDepth10M2: wetCells * cellArea, areaDepth30M2: criticalCells * cellArea,
        inputM3: inputM3, outletM3: outletM3, storedM3: storageM3,
        balanceErrorM3: mismatch,
        balanceRelative: inputM3 > 0 ? Math.abs(mismatch) / inputM3 : Math.abs(mismatch),
        effectiveRainMm: p.rainfallMmH * p.rainMinutes / 60 * p.runoff,
        frameCount: frames.length
      }
    };
  }
  function indexAt(g, lon, lat) {
    var cf = (lon - g.lons[0]) / (g.lons[1] - g.lons[0]);
    var rf = (lat - g.lats[0]) / (g.lats[1] - g.lats[0]);
    if (!Number.isFinite(cf) || !Number.isFinite(rf) || cf < 0 || rf < 0 ||
        cf > g.cols - 1 || rf > g.rows - 1) return -1;
    var c = Math.max(0, Math.min(g.cols - 1, Math.round(cf)));
    var r = Math.max(0, Math.min(g.rows - 1, Math.round(rf)));
    return r * g.cols + c;
  }
  function sample(result, lon, lat, frameIndex) {
    var i = indexAt(result.dem, lon, lat);
    if (i < 0) return null;
    var frame = result.frames[Math.max(0, Math.min(result.frames.length - 1,
      frameIndex == null ? result.frames.length - 1 : frameIndex | 0))];
    return {
      depth_m: frame.depth_m[i], peakDepth_m: result.peakDepth_m[i],
      maxLocalVelocity_mps: result.peakVelocity_mps[i],
      elevation_m: result.dem.z[i], row: Math.floor(i / result.dem.cols), col: i % result.dem.cols
    };
  }
  function analyzeLayout(result, structures, thresholdM, moduleWp) {
    thresholdM = saneNumber(thresholdM == null ? 0.10 : thresholdM, "Umbral (m)", 0.01, 5);
    structures = structures || [];
    var exposed = [], unknown = 0, exposedKwp = 0, max = 0;
    for (var j = 0; j < structures.length; j++) {
      var st = structures[j], ring = st.lonlat;
      if (!ring || ring.length < 3) { unknown++; continue; }
      var coords = ring.slice(), lonC = 0, latC = 0;
      for (var k = 0; k < ring.length; k++) { lonC += +ring[k][0]; latC += +ring[k][1]; }
      coords.push([lonC / ring.length, latC / ring.length]);
      for (var v = 0; v < ring.length; v++) {
        var nxt = ring[(v + 1) % ring.length];
        coords.push([(+ring[v][0] + +nxt[0]) / 2, (+ring[v][1] + +nxt[1]) / 2]);
      }
      var worst = 0, covered = false;
      coords.forEach(function (point) {
        var s = sample(result, point[0], point[1]);
        if (s) { covered = true; if (s.peakDepth_m > worst) worst = s.peakDepth_m; }
      });
      if (!covered) { unknown++; continue; }
      if (worst > max) max = worst;
      if (worst >= thresholdM) {
        var kwp = Math.max(0, (+st.mods || 0) * (+moduleWp || 0) / 1000);
        exposedKwp += kwp;
        exposed.push({ index: j, depthM: worst, severe: worst >= 0.30, kwp: kwp });
      }
    }
    return {
      thresholdM: thresholdM, assessed: structures.length - unknown, unknown: unknown,
      affected: exposed.length, severe: exposed.filter(function (s) { return s.severe; }).length,
      affectedKwp: exposedKwp, worstDepthM: max, exposed: exposed
    };
  }
  function exclusionRuns(result, thresholdM, mask, maxRuns) {
    thresholdM = saneNumber(thresholdM, "Umbral de exclusión (m)", 0.01, 5);
    maxRuns = maxRuns == null ? 300 : maxRuns;
    var g = result.dem, rows = g.rows, cols = g.cols, polygons = [];
    var dx = (g.lons[1] - g.lons[0]) / 2, dy = (g.lats[1] - g.lats[0]) / 2;
    for (var r = 0; r < rows; r++) {
      var run = -1;
      for (var c = 0; c <= cols; c++) {
        var yes = c < cols && result.peakDepth_m[r * cols + c] >= thresholdM &&
          (!mask || !!(mask[r] && mask[r][c]));
        if (yes && run < 0) run = c;
        if (!yes && run >= 0) {
          var a = g.lons[run] - dx, b = g.lons[c - 1] + dx;
          var d = g.lats[r] - dy, e = g.lats[r] + dy;
          polygons.push([[Math.min(a,b), Math.min(d,e)], [Math.max(a,b), Math.min(d,e)],
            [Math.max(a,b), Math.max(d,e)], [Math.min(a,b), Math.max(d,e)]]);
          if (polygons.length > maxRuns)
            throw new Error("Más de " + maxRuns + " zonas de exclusión: sube el umbral o reduce la resolución");
          run = -1;
        }
      }
    }
    return polygons;
  }
  return { validateDem: validateDem, simulate: simulate, sample: sample,
    analyzeLayout: analyzeLayout, exclusionRuns: exclusionRuns, version: "1.0.0" };
});
