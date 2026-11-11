/* EL ÍNDICE DE PLANTAS Y HERRAMIENTAS EN CADA HERRAMIENTA (11-2026).
   La misma barra lateral de la portada, como cajón: un botón con el icono de la herramienta en la que
   estás, junto al «← Panel», abre el índice de plantas y herramientas por familia, con buscador.
   Pulsar un nombre abre esa herramienta; si no tiene dirección, su ficha en el Panel.

   NO DUPLICA NADA: lee la lista de herramientas (`PROJECTS`), los iconos (`PICTOS`) y las familias
   (`FAMILIAS`) del propio index.html, que es donde se mantienen. Sin red, el service worker lo sirve
   de su copia. Si no puede leerlo, no pinta el botón y la página sigue igual que antes.

   Para ponerlo en una página: <script src="lib/indice.js" defer></script> antes de </body>. */
(function () {
  'use strict';
  if (window.__indiceFx) return; window.__indiceFx = true;

  const CSS = `
.fx-btn{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 10px 0 4px;margin-right:10px;border:1px solid #27405F;
  background:#101D30;color:#DCE3EB;font:500 12px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;vertical-align:middle}
.fx-btn:hover{border-color:#F09030}
.fx-btn .fx-mini{width:22px;height:22px;border-radius:6px}
.fx-btn .fx-mini .picto{width:15px;height:15px}
.fx-btn.fx-suelto{position:fixed;left:14px;bottom:14px;z-index:2147483000;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.fx-velo{position:fixed;inset:0;z-index:2147483001;background:rgba(14,24,38,.5);display:none}
.fx-lado{position:fixed;left:0;top:0;bottom:0;width:min(86vw,330px);z-index:2147483002;display:none;flex-direction:column;
  background:#132238;color:#DCE3EB;border-right:1px solid #27405F;box-shadow:0 0 40px rgba(0,0,0,.4);font:14px/1.3 system-ui,sans-serif}
.fx-abierto .fx-velo{display:block}.fx-abierto .fx-lado{display:flex}
.fx-cab{display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid #1E3250}
.fx-cab a{color:#F09030;text-decoration:none;font-weight:600;font-size:13px;white-space:nowrap}
.fx-cab input{flex:1;min-width:0;font:13px ui-monospace,monospace;color:#DCE3EB;background:#101D30;border:1px solid #27405F;padding:7px 9px;outline:none}
.fx-cab input:focus{border-color:#F09030}
.fx-lista{overflow:auto;padding-bottom:12px;overscroll-behavior:contain}
.fx-lista details{border-bottom:1px solid #1E3250}
.fx-lista summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;padding:11px 14px 9px;font-size:11px;font-weight:600;
  letter-spacing:.14em;text-transform:uppercase;color:#8C9AAB}
.fx-lista summary::-webkit-details-marker{display:none}
.fx-lista summary::after{content:"▾";margin-left:auto}
.fx-lista details:not([open]) summary::after{transform:rotate(-90deg)}
.fx-lista summary i{width:8px;height:8px;border-radius:50%;background:var(--t)}
.fx-lista summary .n{font-family:ui-monospace,monospace;letter-spacing:0;font-weight:400;color:#7F8EA1}
.fx-it{display:flex;align-items:center;gap:10px;padding:5px 12px;color:#DCE3EB;text-decoration:none}
.fx-it:hover{background:#1A2D48}
.fx-it.fx-aqui{background:#1A2D48;box-shadow:inset 3px 0 0 #F09030}
.fx-it span:last-child{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.fx-pin{flex:none;width:8px;height:8px;margin:0 9px;background:#F09030}.fx-pin.oferta{background:#68C0D8}
.fx-mini{flex:none;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:var(--t);color:#fff;--ico-bg:var(--t);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 -2px 0 rgba(0,0,0,.08)}
.fx-mini .picto{width:17px;height:17px;display:block;overflow:visible}
.fx-mini .picto .f{fill:currentColor;fill-opacity:.2}.fx-mini .picto .a{stroke:#fff}
.fx-mini .picto .ad{stroke:#fff;fill:#fff;fill-opacity:.28}.fx-mini .picto .af{fill:#fff;stroke:none}
.fx-mini .picto .ko{stroke:var(--ico-bg);stroke-width:4;fill:var(--ico-bg)}.fx-mini .picto .bg{fill:var(--ico-bg)}.fx-mini .picto .t{opacity:.7}
.fx-vacio{padding:14px;color:#7F8EA1}
[data-fx-fam]{--t:#6A7889}[data-fx-fam="diseno"]{--t:#2797C0}[data-fx-fam="simulacion"]{--t:#C98508}
[data-fx-fam="obra"]{--t:#D9661A}[data-fx-fam="operacion"]{--t:#2E9E62}[data-fx-fam="cartera"]{--t:#D63B50}`;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fichero = u => { try { return new URL(u, location.href).pathname.split('/').pop() || 'index.html'; } catch (e) { return ''; } };

  /* Saca de index.html los bloques de datos y los evalúa aparte: son literales, no tocan la página. */
  function leeDatos(html) {
    const corta = (ini, fin) => { const a = html.indexOf(ini); if (a < 0) return null; const b = html.indexOf(fin, a); return b < 0 ? null : html.slice(a, b); };
    const iconos = corta('const PICTOS = {', '/* los accesos rápidos de la cabecera de Herramientas, con el dibujo');
    const proyectos = corta('const PROJECTS = [', '\n];');
    const modulos = corta('const PLANT_MODULES = new Set([', ']);');
    const plantas = corta('const PLANTS = [', '\n];');
    if (!iconos || !proyectos) return null;
    const ic = new Function(iconos + '\nreturn { PICTO, FAMILIAS, familiaDe };')();
    const PROJECTS = new Function(proyectos + '\n];\nreturn PROJECTS;')();
    const mods = modulos ? new Function('return ' + modulos.slice(modulos.indexOf('new Set')) + ']);')() : new Set();
    let PLANTS = [];
    /* las plantas usan constantes (SITE, COB…) que se definen justo antes: si no salen, se omiten */
    try { const pre = corta('const SITE = ', 'const PLANTS = ['); if (plantas && pre) PLANTS = new Function(pre + plantas + '\n];\nreturn PLANTS;')(); } catch (e) { PLANTS = []; }
    /* qué icono lleva cada página de este repo: el de su acceso rápido en la cabecera de Herramientas
       del Panel (data-picto), más las dos que no tienen acceso rápido */
    const PAGINA = { 'cartera-tabla.html': 'Cartera de proyectos', 'careo-pvsyst.html': 'Careo SolarGPT ↔ PVSyst' };
    html.replace(/data-picto="([^"]+)"\s+href="([^"]+)"/g, (m, n, h) => { PAGINA[h] = n.replace(/&amp;/g, '&'); return m; });
    return { ...ic, TOOLS: PROJECTS.filter(p => !mods.has(p.name)), PLANTS, PAGINA };
  }

  function monta(D) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const aqui = fichero(location.href);
    const urlDe = p => { const l = Array.isArray(p.links) ? p.links.find(x => x.label && x.url) : null; return l ? l.url : (p.url || ''); };
    const esAqui = p => { const u = urlDe(p); return !!u && fichero(u) === aqui && new URL(u, location.href).origin === location.origin; };
    const actual = D.TOOLS.find(esAqui) || D.TOOLS.find(p => p.name === D.PAGINA[aqui]);
    /* los accesos que no son una ficha (Buscador, Explorador, Sol) llevan el color de su familia natural */
    const FAM_PAGINA = { 'Buscador de implantaciones': 'diseno', 'Explorador': 'diseno', 'Sol & Simulación': 'simulacion' };
    const propio = actual || (D.PAGINA[aqui] ? { name: D.PAGINA[aqui] } : null);
    const famDe = p => FAM_PAGINA[p.name] || D.familiaDe(p);
    const mini = p => `<span class="fx-mini" data-fx-fam="${famDe(p)}">${D.PICTO(p)}</span>`;

    const raiz = document.createElement('div');
    raiz.innerHTML = `<div class="fx-velo"></div><aside class="fx-lado" aria-label="Índice de plantas y herramientas">
      <div class="fx-cab"><a href="index.html">← Panel</a><input type="search" placeholder="Ir a…" aria-label="Buscar en el índice" autocomplete="off"></div>
      <nav class="fx-lista"></nav></aside>`;
    document.body.appendChild(raiz);
    const lista = raiz.querySelector('.fx-lista'), q = raiz.querySelector('input');

    function pinta() {
      const t = norm(q.value).trim(), casa = n => !t || norm(n).includes(t);
      const grupo = (k, titulo, color, filas, abierto) => filas.length ? `<details ${abierto ? 'open' : ''} data-fx-fam="${k}"><summary>${color ? '<i></i>' : ''}${esc(titulo)}<span class="n">${filas.length}</span></summary>${filas.join('')}</details>` : '';
      let html = '';
      const pl = D.PLANTS.filter(p => casa(p.name)).map(p => `<a class="fx-it" href="index.html#plantas"><i class="fx-pin ${p.oferta ? 'oferta' : ''}"></i><span>${esc(p.name)}</span></a>`);
      html += grupo('plantas', 'Plantas', false, pl, !!t);
      const fams = D.FAMILIAS.concat(D.TOOLS.some(p => D.familiaDe(p) === 'otras') ? [{ k: 'otras', n: 'Otras' }] : []);
      fams.forEach(f => {
        const filas = D.TOOLS.filter(p => famDe(p) === f.k && casa(p.name)).sort((a, b) => a.name.localeCompare(b.name, 'es')).map(p => {
          const u = urlDe(p), href = u || ('index.html#t-' + slug(p.name)), fuera = u && new URL(u, location.href).origin !== location.origin;
          return `<a class="fx-it ${p === actual ? 'fx-aqui' : ''}" href="${esc(href)}" ${fuera ? 'target="_blank" rel="noopener"' : ''} ${p === actual ? 'aria-current="page"' : ''}>${mini(p)}<span>${esc(p.name)}</span></a>`;
        });
        html += grupo(f.k, f.n, true, filas, true);
      });
      lista.innerHTML = html || '<div class="fx-vacio">Nada con ese nombre.</div>';
    }
    pinta(); q.addEventListener('input', pinta);

    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'fx-btn'; btn.setAttribute('aria-label', 'Índice de plantas y herramientas');
    btn.innerHTML = (propio ? mini(propio) : '<span aria-hidden="true" style="padding-left:6px">☰</span>') + '<span>Índice</span>';
    /* junto al «← Panel» de la página; si no lo tiene, flotando abajo a la izquierda */
    const volver = [...document.querySelectorAll('a[href="index.html"],a[href="./"]')].find(a => !raiz.contains(a));
    if (volver) volver.parentNode.insertBefore(btn, volver); else { btn.classList.add('fx-suelto'); document.body.appendChild(btn); }

    const abre = si => { document.documentElement.classList.toggle('fx-abierto', si); if (si) setTimeout(() => q.focus(), 30); };
    btn.addEventListener('click', () => abre(true));
    raiz.querySelector('.fx-velo').addEventListener('click', () => abre(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') abre(false); });
    lista.addEventListener('click', e => { if (e.target.closest('a')) abre(false); });
  }

  fetch('index.html').then(r => r.ok ? r.text() : Promise.reject(r.status)).then(html => {
    const D = leeDatos(html); if (!D) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => monta(D)); else monta(D);
  }).catch(e => console.warn('índice de herramientas: no se ha podido leer el Panel', e));
})();
