/* Service worker del Panel de Proyectos.
   Lo que hace y, sobre todo, lo que NO hace:
   - Precachea el armazón (las cuatro páginas del panel + iconos) para que la app
     abra sin red: en obra el móvil va y viene.
   - Navegación/HTML: RED PRIMERO. La caché solo entra si la red falla, porque el
     panel muestra versiones de release y no puede quedarse congelado en una vieja.
   - Resto del mismo origen (docs/*.md, assets, lib): sirve de caché y refresca
     por detrás (stale-while-revalidate).
   - api.github.com y demás orígenes: NI SE TOCAN. Sin red fallan igual que ahora,
     que es lo que el panel ya sabe manejar (mantiene lo escrito a mano).
   Al cambiar CACHE se tira la anterior entera: es la forma de publicar cambios. */
const CACHE = "factiun-panel-v2";

/* Rutas relativas al scope (/proyectos/ en Pages, / al servirlo en local). */
const SHELL = [
  "./",
  "index.html",
  "cartera-tabla.html",
  "layout.html",
  "sim-solar.html",
  "sim-viento.html",
  "manifest.webmanifest",
  "favicon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-maskable-512.png",
  "assets/apple-touch-icon.png"
];

self.addEventListener("install", e => {
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

async function redPrimero(e) {
  const c = await caches.open(CACHE);
  try {
    const pre = e.preloadResponse ? await e.preloadResponse : null;
    const res = pre || await fetch(e.request);
    if (res && res.ok) c.put(e.request, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(e.request) || await c.match("index.html") || await c.match("./");
    if (hit) return hit;
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
  e.respondWith(esHTML(req) ? redPrimero(e) : cacheYRefresca(e));
});
