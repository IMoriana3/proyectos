# Migración de `IMoriana3/proyectos` a Cloudflare Pages

La fuente de verdad sigue siendo el repositorio privado GitHub (`main`).
Esta receta NO cambia la visibilidad del código.

## 1. Crear Pages con repositorio privado

1. Abrir https://dash.cloudflare.com/ → **Workers & Pages**.
2. **Create application** → **Pages** → **Connect to Git**.
3. Autorizar GitHub para **Only select repositories** y seleccionar `IMoriana3/proyectos` (si no está ya autorizado).
4. Elegir `IMoriana3/proyectos`, rama de producción `main`.
5. Nombre de proyecto: `panel-im3` (o uno disponible; la URL final depende del nombre realmente elegido). Evitar nombres corporativos si no quieres aparecer en búsquedas.
6. Framework: **None**.
7. **Build command**: `bash tools/build-cloudflare-pages.sh`
8. **Build output directory**: `dist`.
9. Root directory: raíz (sin subcarpeta).
10. **Save and Deploy**. El primer despliegue enseña únicamente «Sitio en configuración», sin contenido del proyecto. Esto es intencionado hasta proteger la URL con Access.

La integración GitHub→Pages permite repositorios privados y recompone la web automáticamente
cuando `main` cambia. No configurar `.` o `/` como directorio a publicar:
eso incluiría documentación interna, scripts y pruebas ajenos a la web.

## 2. Bloquear también la URL de PRODUCCIÓN

**Ojo:** tener privado el repo no vuelve privada la web Pages.
El interruptor inicial «Enable access policy» normalmente protege **previews**, NO la
URL de producción `<nombre>.pages.dev` por sí sola.

Según la [documentación de Cloudflare](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain):

1. En Pages → proyecto → Settings → **Enable access policy**.
2. **Manage** en la aplicación Access creada.
3. Zero Trust → Access → Applications → proyecto → **Configure**.
4. **Public hostname**: quitar el comodín `*` en **Subdomain**; guardar.
5. Volver a Pages → Settings → General y activar **Enable access policy**
   otra vez para regenerar la política de previews.
6. Verificar que hay una aplicación para `<nombre>.pages.dev` y otra para
   `*.<nombre>.pages.dev`, ambas con política **Allow** exclusiva para los
   correos autorizados.
7. Probar con una ventana privada: antes de abrir el panel debe exigir login
   con Cloudflare Access; también en enlaces de previews.

Si se agrega dominio propio, crear además su propia app Access.
La alternativa más sencilla es autenticar por correo con código de un solo uso.

**No compartir el enlace de Pages ni publicar datos sensibles hasta que el acceso
de producción esté comprobado.** El HTML que se sirve en la web puede descargarse
por cualquier visitante autorizado, igual que en cualquier web estática.

## 3. Activar los contenidos tras verificar Access

1. Abrir la URL de producción en una **ventana privada sin sesión**: debe
   solicitar inicio de sesión de Cloudflare Access antes de mostrar incluso
   la página de configuración.
2. Confirmar que un correo NO autorizado no puede entrar.
3. En Pages → proyecto → Settings → **Variables and Secrets** añadir
   `FACTIUN_PAGES_ACCESS_CONFIRMED` con valor `1` para **Production**.
   Para previews, usar valor `1` solo si sus dominios están igualmente
   protegidos; si no, mantener la página de mantenimiento en previews.
4. Lanzar un nuevo despliegue de la rama `main` con esta configuración.
   El script publicará entonces el panel real, simuladores y documentación.
5. Repetir la prueba desde una ventana privada y verificar que no se puede
   obtener `/index.html` ni `/docs/viento.md` sin autenticación.

Esta variable es un **candado operativo**, no detecta automáticamente si
Access está correctamente configurado; no activarla antes de esa comprobación.

## 4. Comprobar que funciona

- `/` — portada.
- `/sim-viento.html` — abanderamiento.
- `/generador-layout.html` — layout.
- `/cartera-tabla.html` — cartera.
- `/manifest.webmanifest` y `/sw.js` — instalación/offline.
- `/docs/viento.md` — lector de documentos.
- `/tools/build-cloudflare-pages.sh` y `/tests/` deben responder 404,
  no revelar contenidos.

Los enlaces internos del índice que apuntaban a
`https://imoriana3.github.io/proyectos/*.html` se convierten automáticamente
a rutas relativas durante el build. Los enlaces a **otros repositorios**
GitHub Pages no cambian y pueden necesitar otra migración.

## 5. Comprobaciones automáticas y pendientes

`.github/workflows/pages.yml` ya comprueba el artefacto de Cloudflare y
`https://panel-im3.pages.dev` (la URL actual), no el GitHub Pages antiguo.

- **Paquete estático**: las páginas, librerías y documentos necesarios
  existen; `.github`, `tests`, `tools`, `prompts` y `docs/audit`
  no aparecen en `dist`.
- **Acceso anónimo**: `tools/test_cloudflare_access.mjs` intenta abrir
  portada, simuladores y ficheros de datos SIN credenciales. Requiere un
  redireccionamiento reconocible a Cloudflare Access. Un 200, un error de
  red o un 403 genérico no cuentan como prueba de Access.
- **Preview**: comprobación opcional mediante `PAGES_PREVIEW_BASE`.
  La URL concreta debe tomarse del desplegable de Cloudflare, sin inventarla.
- **Comprobación funcional autenticada**: PENDIENTE. El antiguo
  `tools/test_pages_cronometro.mjs` sigue siendo útil en un navegador
  autenticado, pero no debe usarse contra la web privada como si fuese
  pública. Si se automatiza, crear un token de servicio Access con política
  `Service Auth` dedicada y secretos GitHub. Nunca incluir claves en HTML,
  JavaScript público, URLs ni los logs.

**Importante:** en la revisión del 19/10/2026 GitHub Actions de este
repositorio devolvía fallos antes de asignar un runner (jobs sin pasos).
Hay que revisar el mensaje del job en la interfaz de Actions: puede
ser facturación, límites o permisos al pasar el repositorio a privado.
No dar por ejecutadas ni aprobadas pruebas que no han arrancado.

**Caché PWA:** `sw.js` conserva recursos HTML y datos en el dispositivo
después de una sesión autorizada, incluso sin conexión. Cloudflare Access
protege las solicitudes de red, no borra la caché local al cerrar sesión.
En equipos compartidos, cerrar sesión y borrar los datos del sitio.

## 6. Referencias

- https://developers.cloudflare.com/pages/get-started/git-integration/
- https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain
