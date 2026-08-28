/* Service worker del Panel de Proyectos.
   Lo que hace y, sobre todo, lo que NO hace:
   - Precachea el armazón (las cinco páginas del panel + iconos) para que la app
     abra sin red: en obra el móvil va y viene.
   - Navegación/HTML y CONTENIDO EDITORIAL (docs/*.md, los .json de datos): RED
     PRIMERO, con la caché de respaldo si no hay red. Son lo que cambia en cada
     publicación: con «caché y refresca» la Documentación de una tarjeta enseñaba
     la versión ANTERIOR en la primera visita tras publicar (se refrescaba por
     detrás y solo se veía nueva a la segunda), que se lee exactamente como «no
     me salen las actualizaciones».
   - Assets estáticos (iconos, lib/, favicon): esos sí de caché con refresco por
     detrás — no cambian de contenido sin cambiar de nombre.
   - api.github.com y demás orígenes: NI SE TOCAN. Sin red fallan igual que ahora,
     que es lo que el panel ya sabe manejar (mantiene lo escrito a mano).
   Al cambiar CACHE se tira la anterior entera: es la forma de publicar cambios. */
const CACHE = "factiun-panel-v118";

/* Rutas relativas al scope (/proyectos/ en Pages, / al servirlo en local). */
const SHELL = [
  "./",
  "index.html",
  "cartera-tabla.html",
  "layout.html",
  "generador-layout.html",
  "sim-solar.html",
  "sim-viento.html",
  "comparador-estructuras.html",
  "demo-viento.json",
  "manifest.webmanifest",
  "favicon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-maskable-512.png",
  "assets/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  /* ACTIVACIÓN INMEDIATA (2026-08-28, «pero siguen los mismos menús»): sin
     skipWaiting el SW nuevo se quedaba EN ESPERA mientras hubiera cualquier
     pestaña abierta, y recargar servía la versión vieja — cada publicación
     exigía cerrar todas las pestañas sin que nada lo dijera. Con la app
     recién publicada varias veces al día, eso es enseñar versiones viejas
     con cara de nuevas. clients.claim() ya estaba en activate; esta es la
     otra mitad. */
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Una a una: si mañana falta un fichero del armazón, el SW se instala igual
    // en vez de quedarse sin instalar y dejar la app sin offline.
    await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (err) {} }
    await self.clients.claim();
  })());
});

/* El aviso de "nueva versión" de la página pide el relevo por aquí. */
self.addEventListener("message", e => { if (e.data === "skip-waiting") self.skipWaiting(); });

const esHTML = req => req.mode === "navigate" ||
  (req.headers.get("accept") || "").includes("text/html");

/* Contenido que se reescribe al publicar: tiene que ir a la red primero o el
   usuario ve lo de ayer sin saberlo. */
const esContenido = url => /\/docs\/[^/]+\.md$/.test(url.pathname) ||
  /\.json$/.test(url.pathname);

async function redPrimero(e, navegacion) {
  const c = await caches.open(CACHE);
  try {
    const pre = e.preloadResponse ? await e.preloadResponse : null;
    const res = pre || await fetch(e.request);
    if (res && res.ok) c.put(e.request, res.clone());
    return res;
  } catch (err) {
    // El respaldo "index.html" es SOLO para navegaciones: devolvérselo a un
    // .md o a un .json sería servir una página entera donde se espera texto o
    // datos, y el consumidor lo intentaría interpretar sin enterarse.
    const hit = await c.match(e.request) ||
      (navegacion ? (await c.match("index.html") || await c.match("./")) : null);
    if (hit) return hit;
    if (!navegacion) return new Response("", { status: 504 });
    return new Response("<!doctype html><meta charset=utf-8><body style='background:#0B0F14;color:#E7EEF4;font:16px system-ui;padding:2rem'>Sin conexión y sin copia guardada de esta página.</body>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
  }
}

async function cacheYRefresca(e) {
  const c = await caches.open(CACHE);
  const hit = await c.match(e.request);
  const red = fetch(e.request).then(res => {
    if (res && res.ok) c.put(e.request, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { e.waitUntil(red); return hit; }
  const res = await red;
  return res || new Response("", { status: 504 });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // GitHub API, raw, workers.dev: a la red y punto
  const nav = esHTML(req);
  e.respondWith((nav || esContenido(url)) ? redPrimero(e, nav) : cacheYRefresca(e));
});
