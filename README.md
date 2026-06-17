# Panel de Proyectos — Factiun

> Centro de control de las herramientas web de seguidores solares Factiun: lista cada app (estado, objetivo, accesos) y abre su documentación con índice navegable.

## Qué es
Una página única (`index.html`) que lista los proyectos desde el array `PROJECTS` y muestra, por tarjeta, estado / objetivo / stack / accesos (deploy, repo, documentación, descargable). El motor Markdown va **incrustado** (sin CDN): el botón **Documentación** carga `docs/<docId>.md` o un `docUrl` remoto (README del repo).

## Funcionalidades
- Tarjetas por proyecto con estado (Producción / En desarrollo / Demo / Pausado / Deprecado), búsqueda, filtros y orden.
- Documentación embebida: `docId` → `docs/<docId>.md`, o `docUrl` → README del repo.
- Enlaces limpios a cada app (`https://imoriana3.github.io/<repo>/`) y a su repositorio.

## Uso
- **Editar el panel**: toca solo el array `PROJECTS` en `index.html` (name, status, objetivo, stack, url, repo, docUrl/docId, download…).
- **Doc local**: crea `docs/<docId>.md` y pon ese `docId` en la entrada.
- **Descargable**: deja el ZIP en `assets/` y apunta el campo `download`.

## Stack
HTML/CSS/JS sin framework (un único `index.html`) · motor Markdown (marked) incrustado · GitHub Pages.

## Despliegue (URL)
GitHub Pages: https://imoriana3.github.io/proyectos/ · Source: *Deploy from a branch* → `main` / `/ (root)`. `.nojekyll` incluido. En local, sírvelo por HTTP (`python -m http.server`) para que carguen los `docs/*.md`.

## Notas
- Estructura: `index.html` · `docs/` (un README por proyecto) · `assets/` (descargables) · `prompts/` (prompt de documentación).
- El `docId` de un proyecto **es** el nombre de su archivo en `docs/`.

*Factiun · proyecto interno.*
