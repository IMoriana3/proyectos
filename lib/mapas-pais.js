/* lib/mapas-pais.js — RECURSO DEL PAÍS en la tarjeta de meteo.
 *
 * Enseña las dos láminas de país del emplazamiento elegido —viento medio a
 * 100 m e irradiación global horizontal— con un marcador en la planta y el
 * valor en ese punto frente a la media del país.
 *
 * Las láminas NO se hacen aquí: las genera `tools/mapa_pais.py` del repo
 * `siting` (workflow «mapas-pais») y se copian a `data/mapas_pais/` con su
 * ficha JSON, su rejilla ligera de valores y un `indice.json`. Este fichero
 * sólo las lee.
 *
 * El país NO se adivina por el nombre: es el de la lámina cuya rejilla tiene
 * dato en esas coordenadas (la rejilla sólo tiene valores DENTRO del país).
 * Así vale igual para una planta de la cartera, un emplazamiento buscado o
 * coordenadas puestas a mano, y no depende de cómo se escriba «Perú».
 *
 * Es contexto climático de largo plazo, no la meteo del emplazamiento: el
 * dataset canónico sigue siendo el de la tarjeta; esto no entra en el
 * WeatherContract ni en ningún cálculo.
 */
(function () {
  "use strict";
  const BASE = "data/mapas_pais/";
  const VARS = [
    { clave: "viento", titulo: "Viento medio a 100 m", dec: 1 },
    { clave: "irradiancia", titulo: "Irradiación global horizontal (GHI)", dec: 0 },
  ];
  const cache = new Map();
  let turno = 0;

  function json(url) {
    if (!cache.has(url)) {
      cache.set(url, fetch(url, { cache: "no-cache" }).then(r => {
        if (!r.ok) throw new Error(url + " → HTTP " + r.status);
        return r.json();
      }).catch(e => { cache.delete(url); throw e; }));
    }
    return cache.get(url);
  }
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // «always»: en es-ES el punto de miles no sale con cuatro cifras (2162)
  const num = (v, d) => Number(v).toLocaleString("es-ES",
    { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" });

  /* El valor de la rejilla en (lat, lon), o null fuera del país. */
  function valorEn(rej, lat, lon) {
    const [l0, l1, b0, b1] = rej.extension;
    if (!(lon >= l0 && lon < l1 && lat > b0 && lat <= b1)) return null;
    const c = Math.floor((lon - l0) / (l1 - l0) * rej.columnas);
    const f = Math.floor((b1 - lat) / (b1 - b0) * rej.filas);
    const v = rej.valores[f] && rej.valores[f][c];
    return v == null ? null : v / rej.escala;
  }

  /* Posición del punto en la imagen, en % (la lámina es lon/lat lineal). */
  function posicion(ficha, lat, lon) {
    const [x0, y0, x1, y1] = ficha.caja, [l0, b0, l1, b1] = ficha.encuadre;
    const x = x0 + (lon - l0) / (l1 - l0) * (x1 - x0);
    const y = y0 + (b1 - lat) / (b1 - b0) * (y1 - y0);
    return (x >= x0 && x <= x1 && y >= y0 && y <= y1) ? { x: 100 * x, y: 100 * y } : null;
  }

  /* El país del punto: la primera lámina con dato en esas coordenadas. */
  async function paisDe(indice, lat, lon) {
    for (const e of Object.values(indice)) {
      for (const v of VARS) {
        const meta = e.variables && e.variables[v.clave];
        if (!meta) continue;
        try {
          const ficha = await json(BASE + meta.ficha);
          const [l0, b0, l1, b1] = ficha.encuadre;
          if (lon < l0 || lon > l1 || lat < b0 || lat > b1) break;
          const rej = await json(BASE + ficha.rejilla);
          if (valorEn(rej, lat, lon) != null) return e;
        } catch (err) { /* ficha rota: se prueba con la siguiente */ }
        break; // basta con una variable para decidir el país
      }
    }
    return null;
  }

  function tarjeta(v, ficha, valor, pos) {
    const d = v.dec, u = esc(ficha.unidad);
    let lectura;
    if (valor == null) {
      lectura = '<span class="mp-sin">Sin dato en el punto (borde o costa)</span>';
    } else {
      const dif = ficha.media ? (valor - ficha.media) / ficha.media * 100 : 0;
      lectura = '<b>' + num(valor, d) + ' ' + u + '</b> en la planta · ' +
        (Math.abs(dif) < 1 ? "en la media del país" :
          num(Math.abs(dif), 0) + (dif > 0 ? " % sobre" : " % bajo") + " la media (" + num(ficha.media, d) + ")");
    }
    const marca = pos ? '<i class="mp-marca" style="left:' + pos.x.toFixed(2) + '%;top:' + pos.y.toFixed(2) +
      '%" title="Planta"></i>' : "";
    return '<div class="external-map-card mp-card">' +
      '<div class="external-map-head"><b>' + esc(v.titulo) + '</b><span>' + esc(ficha.pais) + '</span></div>' +
      '<div class="mp-lectura">' + lectura + '</div>' +
      '<div class="mp-figura"><a href="' + esc(BASE + ficha.imagen) + '" target="_blank" rel="noopener">' +
      '<img src="' + esc(BASE + ficha.imagen) + '" alt="' + esc(ficha.pais + " · " + v.titulo) + '" loading="lazy"></a>' +
      marca + '</div>' +
      '<div class="external-map-note">P10 ' + num(ficha.p10, d) + ' · P50 ' + num(ficha.p50, d) + ' · P90 ' +
      num(ficha.p90, d) + ' ' + u + ' · Fuente: ' + esc(ficha.fuente) + ' (' + esc(ficha.resolucion) + ')</div>' +
      '</div>';
  }

  async function actualizar(lat, lon) {
    const caja = $("mapasPais"), estado = $("mapasPaisEstado");
    if (!caja) return;
    lat = Number(lat); lon = Number(lon);
    const mio = ++turno;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      caja.innerHTML = ""; estado.textContent = "Sin coordenadas: elige un proyecto o un emplazamiento.";
      return;
    }
    let indice;
    try { indice = await json(BASE + "indice.json"); }
    catch (e) {
      if (mio !== turno) return;
      caja.innerHTML = ""; estado.className = "statusline";
      estado.textContent = "No hay láminas de país publicadas en este despliegue (" + e.message + ").";
      return;
    }
    const pais = await paisDe(indice, lat, lon);
    if (mio !== turno) return; // el usuario ya ha cambiado de emplazamiento
    if (!pais) {
      caja.innerHTML = ""; estado.className = "statusline";
      estado.textContent = "Todavía no hay lámina del país de este emplazamiento. Disponibles: " +
        Object.values(indice).map(e => e.nombre).join(", ") +
        ". Se generan con el workflow «mapas-pais» del repo siting.";
      return;
    }
    const partes = [];
    for (const v of VARS) {
      const meta = pais.variables[v.clave];
      if (!meta) continue;
      try {
        const ficha = await json(BASE + meta.ficha);
        const rej = await json(BASE + ficha.rejilla);
        partes.push(tarjeta(v, ficha, valorEn(rej, lat, lon), posicion(ficha, lat, lon)));
      } catch (e) {
        partes.push('<div class="external-map-card"><div class="external-map-note">' +
          esc(v.titulo) + ': no se ha podido leer (' + esc(e.message) + ').</div></div>');
      }
    }
    if (mio !== turno) return;
    caja.innerHTML = partes.join("");
    estado.className = "statusline";
    estado.textContent = "Contexto climático de largo plazo del país (" + pais.nombre +
      "). No es la meteo del emplazamiento ni entra en el WeatherContract.";
  }

  // `paisDe` y `json` salen también: el mapa de país de `sim-viento.html` decide
  // el país con la MISMA regla y lee las mismas láminas, en vez de copiarla.
  window.FactiunMapasPais = { actualizar, valorEn, posicion, paisDe, json };
  // por si `meteo.html` ya pidió la actualización antes de que esto cargase
  const la = $("lat"), lo = $("lon");
  if (la && lo) actualizar(la.value, lo.value);
})();
