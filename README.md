# Panel de Proyectos — Factiun

> Centro de control de las herramientas web de seguidores solares Factiun: lista cada app (estado, objetivo, accesos) y abre su documentación con índice navegable.

## Qué es
Una página única (`index.html`) que lista los proyectos desde el array `PROJECTS` y muestra, por tarjeta, estado / objetivo / stack / accesos (deploy, repo, documentación, descargable). El motor Markdown va **incrustado** (sin CDN): el botón **Documentación** carga `docs/<docId>.md` o un `docUrl` remoto (README del repo).

## Cómo se sabe que algo está bien aquí

`docs/puertas-y-alcance.md` — el estándar de puertas y alcance de los ocho
repos de la suite: qué es un verde, por qué el vacío es un error y no un
aprobado, y las cuatro lecciones que salieron de puertas que pasaban la prueba
clásica sin estar mirando lo que decían mirar. Vive aquí porque dos repos ya
clonan éste por pin, así que el enlace es COMPROBABLE desde fuera y no sólo
legible: `docs/enlace_guia.sh` lo verifica en cada repo, con su paso de CI.

Y antes de ponerse a trabajar: `bash docs/ci_al_dia.sh` — el último CI de la
rama principal de cada repo de la suite, en una tabla. Existe porque el CI de
`siting` estuvo cinco corridas seguidas en rojo sin que nadie se enterara.

## La portada

Piel «Célula»: el panel está hecho de módulo fotovoltaico. Azul-negro de célula, *fingers* y
busbars de plata en las cabeceras, y los colores del logo de Factiun: naranja (#F09030) como único
color de emisión, azul claro (#68C0D8) para lo que está en desarrollo y rojo coral (#E84858) sólo para
alarma; franja de advertencia eléctrica en las plantas en marcha. Serigrafía en Barlow Condensed,
texto en Barlow y cifras en JetBrains Mono, **autoalojadas** en `assets/fonts/` (OFL) para que la app
siga abriendo sin red. Cada planta enseña su **plano real** de seguidores (`HUELLAS`, generado por
`tools/huellas_plantas.py` desde los layouts de cobertura-zigbee y ligado por el nombre de la planta),
y cada herramienta lleva su **icono** de línea (`PICTOS`, elegido por el nombre de la ficha). Por defecto la portada es trabajo: plantas (con la cartera en
vivo), herramientas y el pie con las reglas de la casa.

Las herramientas (`cartera-tabla`, `comparador-estructuras`, `generador-layout`, `sim-solar`,
`careo-pvsyst`, `buscador-implantacion`, `layout`) llevan la misma piel desde 10-2026: los mismos tokens y
tipografías que la portada. En la tabla de la cartera los estados son **de proyecto**, como en la portada
(en marcha en ámbar, en desarrollo en azul claro, demo en plata, baja en coral); en las demás herramientas
los mismos nombres (`--live`, `--build`, `--dead`, `--demo`) son **resultados** y llevan la paleta fija de
estado (bien en verde, aviso en amarillo, error en coral, información en azul claro). Las codificaciones de
datos de los lienzos —tipos de estructura, sol y sombra, rampas de terreno, mesas— se quedan como estaban:
son colores elegidos a propósito (algunos con comprobación de daltonismo), no piel. `sim-viento.html` sigue
con su piel de herramienta técnica.

**Modo presentación** (botón de la barra; el navegador lo recuerda): despliega el escaparate para
enseñar el panel a un cliente —el **hero** con el relieve real de Ayora y sus 751 seguidores
inclinados según el sol a la hora de la planta (algoritmo NOAA de `sim-solar.html`, backtracking
plano con GCR 0,397 y tope ±55°) y la tira de **careos**—. Los datos del hero (`HERO_AYORA`, al final
de `index.html`) los genera `tools/hero_ayora.py` a partir de `ayora_relieve.json` y
`ayora_layout.json` de cobertura-zigbee, y el propio hero dice de dónde salen.

**La luz la pone el sol** (piel «Célula de día», 2026-11-11; la misma que siting desde b78). La página
tiene la luz del sol en Ayora —o la de la hora que se esté recorriendo en el instrumento—: amanecer,
mañana, pleno sol, tarde, ocaso o **noche**, que es la piel Célula de siempre. De día es clara, la
barra lleva el cielo de esa hora y el relieve del instrumento se pinta en tonos de tierra. El sol es
el `solarGeom` del propio instrumento (copia declarada de `sim-solar.html`), que se publica en
`window.__solarGeom`; antes de que cargue, un tanteo sin ecuación del tiempo decide sólo claro u
oscuro. `?luz=dia`, `?luz=noche` o `?luz=auto` lo fijan, igual que el botón de la barra; **nada se
guarda**. De día, el naranja usado como texto es `#B85A0C`: `#F09030` da 2,4:1 sobre blanco.

**Cada planta con su cielo**: la franja de la huella es el cielo de su hora local, con la hora y la luz
que hay allí («16:45 · ocaso»). A las 16:45 de Madrid, Sicilia ya está en ocaso y Perú a pleno sol. Las
coordenadas y la zona horaria de `SITIO_PLANTA` son sólo para eso; una planta nueva sin entrada
conserva la franja de siempre. Las **herramientas** se filtran además por familia —diseño y oferta,
simulación, obra y puesta en marcha, operación y cartera—; una herramienta nueva sin familia sale en
«Otras» y no se esconde.

**La ficha de herramienta** (11-2026) tiene una cabecera compacta —la célula con el icono, el estado, el
nombre y «versión · fecha»—, el para qué en tres líneas como mucho y una sola fila de acciones:
documentación, repo y paquete como pestañas, y la acción principal (abrir; si no hay nada que abrir, el
paquete) recuadrada en naranja abajo a la derecha, como el SCADA de las plantas. El pie va pegado abajo,
así que en una fila de fichas las acciones quedan a la misma altura. Los iconos son una familia: rejilla
de 24, trazo de 1,6, plata con un solo elemento clave en naranja; los accesos rápidos de la cabecera de
Herramientas llevan los mismos. Una herramienta nueva sin icono sale con la célula genérica.

La célula del icono va del **color de su familia** (el de los puntos del filtro, oscurecido para que el
dibujo en blanco se lea), y al pasar el ratón la ficha se levanta y la célula se inclina como un
seguidor. A la izquierda, la **barra lateral** es un índice de plantas y herramientas por familia, con
un buscador «Ir a…»: el nombre lleva a la ficha (quitando los filtros si la escondían) y la flecha abre
el programa. Por debajo de 1100 px se abre como cajón con el botón ☰ de la barra.

**El mismo índice en cada herramienta** (`lib/indice.js`): junto al «← Panel» de cada página sale
un botón «Índice» con el icono de color de esa herramienta, que abre el cajón con las plantas y las
herramientas por familia (la de la página, marcada). No duplica datos: lee `PROJECTS`, `PICTOS`,
`FAMILIAS` y `PLANTS` del propio `index.html` (sin red, de la copia del service worker); si no puede,
no pinta nada y la página queda como estaba. Para añadirlo a una página nueva basta
`<script src="lib/indice.js" defer></script>`.

**El expediente de homologación** (`homologacion.html`, 11-2026) pone en una pantalla lo que un
homologador de EPC pide al control del tracker: 36 requisitos, la herramienta que demuestra cada uno y
su nivel de evidencia —medido, simulado, declarado o falta, con signo además de color—. Lleva la piel
de las demás herramientas, cambia a inglés y se imprime en claro. Se mantiene editando solo su array
`REQS`; el resumen se recalcula. Ver `docs/homologacion.md`.

## Funcionalidades
- Tarjetas por proyecto con estado (Producción / En desarrollo / Demo / Pausado / Deprecado), búsqueda, filtros y orden.
- Documentación embebida: `docId` → `docs/<docId>.md`, o `docUrl` → README del repo.
- Enlaces limpios a cada app (`https://imoriana3.github.io/<repo>/`) y a su repositorio.

## Uso
- **Editar el panel**: toca solo el array `PROJECTS` en `index.html` (name, status, objetivo, stack, url, repo, docUrl/docId, download…).
- **Doc local**: crea `docs/<docId>.md` y pon ese `docId` en la entrada.
- **Descargable**: deja el ZIP en `assets/` y apunta el campo `download`.

## Stack
HTML/CSS/JS sin framework (un único `index.html`) · motor Markdown (marked) incrustado · fuentes autoalojadas (OFL) · GitHub Pages.

## App instalable (PWA)
El Panel se **instala** como aplicación (escritorio y móvil) y **abre sin red**.

- `manifest.webmanifest` — nombre, iconos (`assets/icon-*.png`), `display: standalone` y
  **`scope: "/"`**: así, una vez instalada, los visores que viven en otras rutas del mismo dominio
  (`imoriana3.github.io/<repo>/`) se abren **dentro** de la app. Lo que está en `*.workers.dev` es
  otro origen y sale al navegador. Incluye accesos directos (Cartera técnica, Layout, Sol).
- `sw.js` — service worker: precachea el armazón (las cinco páginas + iconos), **red primero** para
  el HTML (para que las versiones de release no se congelen) y caché-con-refresco para `docs/` y
  `assets/`. La API de GitHub **no se cachea**. Publicar cambios = subir el número de `CACHE`.
- Instalar: botón **Instalar app** de la barra (Chrome/Edge/Android) · en iPhone, *Compartir →
  Añadir a pantalla de inicio*. Cuando hay versión nueva sale un aviso y decide el usuario.

## Despliegue (URL)
GitHub Pages: https://imoriana3.github.io/proyectos/ · Source: *Deploy from a branch* → `main` / `/ (root)`. `.nojekyll` incluido. En local, sírvelo por HTTP (`python -m http.server`) para que carguen los `docs/*.md`.

## Notas
- Estructura: `index.html` · `docs/` (un README por proyecto) · `assets/` (descargables) · `prompts/` (prompt de documentación).
- El `docId` de un proyecto **es** el nombre de su archivo en `docs/`.

*Factiun · proyecto interno.*
