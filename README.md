# Panel de Proyectos

Centro de control de mis herramientas web: una página que lista cada proyecto
(estado, objetivo, accesos) y abre su documentación completa con índice navegable.

**En línea:** https://imoriana3.github.io/proyectos/  *(tras activar GitHub Pages)*

## Estructura

```
index.html                       El panel (página principal)
docs/                            Un README por proyecto, en Markdown
  cobertura-zigbee.md
assets/                          Descargables que enlaza el panel (campo `download`)
  README.md                      (suelta aquí tus ZIP, p. ej. ElBurgo-Cobertura-Zigbee.zip)
prompts/
  generar-documentacion.md       Prompt para generar la doc de una app con Claude
.nojekyll                        Sirve los archivos tal cual (sin Jekyll)
```

## Cómo funciona

- El panel lee la lista de proyectos del array `PROJECTS` dentro de `index.html`.
- El botón **Documentación** de cada tarjeta carga `docs/<docId>.md` y lo muestra.
  El motor Markdown va incrustado en `index.html` (no depende de ningún CDN).
- Regla simple: el `docId` de un proyecto **es** el nombre de su archivo en `docs/`.

## Añadir un proyecto

1. Añade una entrada al array `PROJECTS` en `index.html`.
2. Si tiene documentación: crea `docs/<docId>.md` y pon ese `docId` en la entrada.
   Para generar el README, usa `prompts/generar-documentacion.md` en el chat de esa app.
3. Si la herramienta tiene un paquete descargable, déjalo en `assets/` y apunta el
   campo `download` a su ruta (p. ej. `assets/mi-herramienta.zip`).

## Desplegar (GitHub Pages)

Settings → Pages → Source: **Deploy from a branch** → rama `main`, carpeta `/ (root)`.
En ~1 minuto queda publicado en la URL de arriba. Cada `git push` lo actualiza.

## Probar en local

Por seguridad, los navegadores **no** cargan los `docs/*.md` con doble clic (`file://`).
Sírvelo por HTTP:

```
python -m http.server      # luego abre http://localhost:8000
```
