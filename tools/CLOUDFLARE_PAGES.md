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

## 5. CI pendiente al terminar la conexión

`.github/workflows/pages.yml` y `tools/test_pages_cronometro.mjs` siguen
probando `https://imoriana3.github.io/proyectos`, que dejó de publicarse
al poner el repo en privado. Actualizarlos a la URL real cuando esté creada.

Si la URL Cloudflare está protegida con Access, la prueba HTTP/Playwright
tendrá que autenticarse con un token de servicio de Cloudflare Access,
guardado como secretos GitHub. No usar tokens en el código, archivos estáticos
ni enlaces públicos.

## 6. Referencias

- https://developers.cloudflare.com/pages/get-started/git-integration/
- https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain
