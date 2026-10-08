# QA de la portada del Panel Factiun · pasada 2 (reverificación de las correcciones)

**Objeto evaluado**: `/home/user/proyectos/index.html` (882.974 B, mtime 2026-10-03 21:32 UTC) y `sw.js` (6.180 B, `CACHE = factiun-panel-v176`), repo en HEAD `4e26883` (árbol limpio; `index.html`/`sw.js` idénticos a los de `b0adf9f`, el commit de las correcciones; `4e26883` sólo añade `docs/audit/`).
**Entorno**: Chromium de Playwright (`tests/pw_navegador.js`), servidor `http://127.0.0.1:8099`, red externa abortada con `page.route` salvo donde se indica, Node 22. **Ningún fichero del repo se ha tocado**; los datos alterados se sirvieron con `page.route` o se inyectaron con `page.evaluate`. Mismos selectores de la pasada 1, adaptados a `#reader-wrap[tabindex=0]`, `inert`, `data-planta` y `CACHE v176`.

## 1. Resumen

La tabla de la pasada 1 tenía **29 filas** (5 altos, 11 medios, 13 bajos); se han reverificado las 29 una a una.

| Veredicto | Nº | Cuáles |
|---|---|---|
| **CORREGIDO** | 11 | A1, A2, A3, A4, A5, M2, M3, M4, M8, M9, B3 |
| **PARCIAL** | 9 | M1, M5, M6, M7, M10, M11, B1, B2, B8 |
| **SIGUE** | 9 | B4, B5, B6, B7, B9, B10, B11, B12, B13 (no estaban en la lista de corregidos) |
| **NUEVOS / regresiones** | 4 | N1 (regresión de la corrección de B1, medio), N2 (hueco de M11, medio), N3 (hueco de M5, medio), N4 (hueco de A5, bajo) |

De los 18 que se dieron por corregidos (A1–A5, M1–M11, B1, B2): **10 corregidos del todo y 8 parciales**. Los cinco altos están corregidos. Ninguna corrección ha roto lo que ya funcionaba (ver §3), con una excepción: la guarda del canvas (B1) deja muerto el modo presentación cuando no hay contexto 2D (N1).

## 2. Los 29 de la pasada 1, uno a uno

Valores medidos ahora, con el script que los produce. «Antes» = valor de la pasada 1.

### Altos

| # | Bug | Veredicto | Valor medido ahora |
|---|---|---|---|
| A1 | Lector desborda en móvil | **CORREGIDO** | 360×740, las 19 docs: `#reader-wrap` **360/360** en todas (antes 816/360 en comparador y cartera, 753, 700, 638…); `h1` termina en x=342; 0 elementos fuera; 0 tablas fuera del viewport (comparador tiene 16, backtracking 17); 0 `<pre>` fuera. docUrl con error: 360/360, el `<code>` de la URL termina en 317 (antes 658). A 390: 390/390. Captura `cap2-reader-360.png`. (`qa2_altos.js`) |
| A2 | `#h-out` falso en vivo | **CORREGIDO** | Al cargar: slider 1418 / `#h-out` **23:38** / «Hora en planta» 23:38 (antes 12:00). Slider a 12:00 → 12:00/12:00. «Ahora» → 23:38 = hora = slider; +1,6 s igual. `visibilitychange` con `Date.now`+60 s → 23:39 en los tres. Recorrido 0/360/780/1439 → 00:00/06:00/13:00/23:59 coherentes. (`qa2_altos.js`) |
| A3 | `docUrl` a github.com/blob | **CORREGIDO** | 0 `docUrl` a `github.com` (antes 2), 9 a `raw.githubusercontent.com`. «Núcleo de cálculo SolarGPT» y «Careo SolarGPT ↔ PVSyst» apuntan a `raw…/solargpt/docs/tracker_route_map.md` y `…/auditoria-poa-energia-pvsyst.md`; con un stub de raw con CORS las dos abren («Remoto OK»). (`qa2_altos.js`) |
| A4 | Carrera en `openDoc` | **CORREGIDO** | A lenta (1,5 s) → Esc → B: a los 2,2 s el lector muestra **B** («Generador de implantaciones» / h1 «Generador de layout»), antes mostraba A. Variante sin Esc (openDoc encadenado): B. Cerrar durante la carga: el lector queda cerrado, `inert` fuera, cuerpo sin rellenar («Cargando documentacion...», no «Tarde texto»). A después sin retraso carga bien. (`qa2_altos.js`) |
| A5 | Una planta rota vacía el panel | **CORREGIDO** (ver N4) | `views:{`→`vistas:{` en Ayora servido por `page.route`: **11 plantas, 25 herramientas, 3 chips, 2 medidores, botón «Conectar la cartera»** (antes 0/0/0/0) y 0 `pageerror`; en consola `console.error("planta sin pintar: Ayora …")`. Con `name:null`: 12 plantas, 25 herramientas. Lo que no está corregido: la planta rota desaparece en vez de pintarse sin vistas y el contador dice «· 12» con 11 tarjetas (N4). (`qa2_altos.js`, `cap2-planta-sin-views.png`) |

### Medios

| # | Bug | Veredicto | Valor medido ahora |
|---|---|---|---|
| M1 | Anclas bajo la barra fija | **PARCIAL** | `html{scroll-padding-top:72px}`. 1440×900 y 768×1024 (clic real en «Plantas», «Herramientas», «Verificación»): título top **72**, barra bottom 60 → no tapado (antes 0/60). **A 360×740 sigue tapado**: barra de **108 px** (normal) y **145 px** (presentación), título en top 72 → 36 y 73 px bajo la barra. Captura `cap2-ancla-360-pres.png` (el título de «Verificación» no se ve). (`qa2_medios.js`) |
| M2 | Búsqueda sin acentos | **CORREGIDO** | `nucleo` 4 = `núcleo` 4 = `NÚCLEO` 4 (antes 0/4); `simulacion` 2 = `simulación` 2; `diseno` 1 = `diseño` 1; `implantacion` 1 = `implantación` 1. Sin XSS con `<script>`, 5.000 caracteres, `C++`, `.*`, `(`. (`qa2_medios.js`, `qa2_regresiones.js`) |
| M3 | Potencia de cabecera no lee la base | **CORREGIDO** | `DB.filas` con `pdc:55.55` + `renderPlants()`: cabecera «23003 El Burgo I **· 55,55 MWdc**» y ficha «Potencia DC 55,55 MWdc · ▲ de la base de la cartera, en vivo» (antes 13,96 frente a 55,55). Al salir vuelve a «· 13,96 MWdc». (`qa2_medios.js`) |
| M4 | Conectar/salir cierra las fichas de planta | **CORREGIDO** | Abiertas El Burgo I y San José → tras `renderPlants()`: **2 abiertas**; tras `conecta(null,null)` (sin red → `estado=error`): 2; tras `desconecta()`: 2 (antes 0). `open`/`hidden`/`aria-expanded` coherentes en las 12; `plantasAbiertas` = {El Burgo I, San José}; el toggle cierra tras el re-render. Con el lector abierto y Fayón abierta: conecta/desconecta la mantienen. (`qa2_medios.js`, `qa2_regresiones.js`) |
| M5 | Lector sin trampa de foco ni scroll por teclado | **PARCIAL** | `inert` soportado; al abrir: `header.bar`, `main`, `footer.pie` **inert=true**, foco en `#reader-close`, `#reader-wrap tabindex=0` con outline 1 px ámbar al enfocarse. Tab+PageDown: `scrollTop` 0→**729**, ArrowDown →769, End → 28.625 = máximo (antes 0). **Modo normal (pres=false)**: 60 Tab no salen del diálogo (pasan por BODY = barra del navegador y vuelven a cerrar). **Modo presentación**: Tab **sale del diálogo** en la pulsación 54 (1440) / 13 (360) a `INPUT#h-min`; Shift+Tab desde cerrar va a `BUTTON.masinfo «ver detalle»` del hero; con el lector abierto, Home en `#h-min` pone la hora a 00:00. Causa: `FONDO()` = `header.bar, main, footer.pie` y `section.hero#hero` está **fuera de `main`** (línea 554 vs 585). Es N3. Observación: PageDown con el foco en el botón cerrar no desplaza (hay que pulsar Tab una vez). Esc: cierra, `inert` fuera, foco vuelve al botón «Documentación»; cierre con X igual. (`qa2_regresiones.js`, `qa2_extra2.js`) |
| M6 | Contraste de `--muted-2` | **PARCIAL** | `--muted-2` = **#7F8EA1**: sobre void 5,34 / panel 4,79 / panel-2 5,07 (antes 3,67/3,29/3,48). De 27 muestras, 24 ≥ 4,79 (`.clock small` 4,79, `.hero-meters .u` 4,79, `.kv dt` 5,07, `.hero-legend` 5,07, placeholder 5,07, `.sort label` 5,34…). **Siguen por debajo**: `.card .upd`, `.card .ver` y `.ver.pend` («version no leida») a 11,5 px sobre el degradado de la tarjeta (`#1A2D48→#132238`): **4,16** (antes 2,85; mínimo 4,5). La propuesta decía usar `--muted` sobre el degradado. (`qa2_medios.js`) |
| M7 | Textos de la traza ilegibles | **PARCIAL** | `font-size="13"` fill `#7F8EA1`: a 1440 → **14 px** reales (antes 7,4), a 768 → 18 px. **A 360 → 8 px** (antes 3,9) y las dos líneas de la leyenda («- - ideal sin backtracking» en y=14 y «— ejecutado» en y=30) **se solapan** (paso de 6,9 px para glifos de 8 px, `solapanLeyenda:true`). Captura `cap2-traza-360.png`. La propuesta incluía un `viewBox` más estrecho en móvil. (`qa2_medios.js`) |
| M8 | Buscador fuera del SHELL; respaldo index.html para todo | **CORREGIDO** | `SHELL` = **35** entradas, todas en disco, `buscador-implantacion.html` incluida; 0 páginas enlazadas sin precachear. SW v176 activo, `caches` = `factiun-panel-v176` con **35/35** (0 faltan, 0 sobran), botón «armazón v176». Offline: `/buscador-implantacion.html` → **200 «Buscador de implantaciones — Factiun»** (antes el Panel); `/cartera-tabla.html` → 200 su ficha; `/no-existe.html` → **503 «Sin conexión y sin copia guardada de esta página.»**; `/` e `/index.html` → Panel con 25 tarjetas y 12 plantas, 7 fuentes cargadas; `/docs/x.md` por navegación → 503. (`qa2_sw.js`) |
| M9 | Nombre de planta `nowrap` | **CORREGIDO** | `.pcard .name{white-space:normal; overflow-wrap:anywhere}`. Texto 200 %: **0 nombres fuera de tarjeta** (El Burgo I right 346 / tarjeta 375 en 2 líneas; San José 1022/1051; antes 418/375 y 1060/1051), sin overflow horizontal, 0 `fueraCard`. Planta de 88 caracteres a 360: `.name` right **307** / tarjeta 331 (antes 924/360), `.pdc` 243. Capturas `cap2-texto200.png`, `cap2-planta-larga-360.png`. (`qa2_medios.js`) |
| M10 | Tesis sobre el relieve | **PARCIAL** | Velo `linear-gradient(rgba(14,24,38,.88) 0%, .55 70%, transparent 100%)` en `.hero-tesis`. Contraste del texto frente al canvas compuesto con el velo (muestreo de `getImageData`, 13:00): `h2` mínimo **10,5** en los tres anchos. Párrafo: 1440 → mínimo **3,43** (medio 5,85); **1024 → mínimo 1,97** (medio 5,2), con el 58 % de escena bajo el párrafo y alfa del velo 0,24 en su última línea; 360 → 6,45 (la escena no llega). Captura `cap2-hero-1300-1024.png`: las dos últimas líneas del párrafo cruzan el relieve iluminado. El velo acaba donde acaba el bloque; a <1100 px el párrafo baja hasta la zona transparente. (`qa2_medios.js`) |
| M11 | Markdown sin sanear | **PARCIAL** | `marked.use({renderer:{html(){return ''}}})`: doc con `<img onerror>` en bloque, inline, en celda de tabla, `<svg onload>`, `<script>`, `<a href="javascript:">` crudo → **ninguna bandera** (`__xssdoc/__xssinline/__xsssvg/__xss2/__xsstd/__xsstitle` = null), 0 `<script>`, 0 `<svg>`, 0 `onerror` en el DOM; el bloque ```` ```html ```` se muestra escapado. **Hueco**: `[enlace](javascript:window.__xssjs=1)` se pinta como `<a href="javascript:window.__xssjs=1">` y **al hacer clic se ejecuta** (`__xssjs === 1`); igual `data:text/html,<script>…` y `vbscript:`. Es N2. (`qa2_medios.js`, `qa2_extra.js`) |

### Bajos

| # | Bug | Veredicto | Valor medido ahora |
|---|---|---|---|
| B1 | Canvas sin contexto rompe el hero | **PARCIAL** (regresión, ver N1) | `getContext → null`: **0 `pageerror`** (antes uno por render). Pero `if(!ctx) return;` (línea 3016) sale del IIFE del hero **antes** de definir `presenta()` y el `click` de `#btn-pres` (líneas 3163–3173): con `factiun_presenta=1` guardado el `body` no recibe `presenta`, el hero queda `display:none`, lecturas «—°»/«—», y pulsar «Presentación» no hace nada (`localStorage` sigue en 1; control con canvas OK → pasa a 0). (`qa2_extra.js`) |
| B2 | `status` desconocido: «Pausado» sin contar y «Estado» lanza | **PARCIAL** | Fichero con `status:"bulid"` + «Orden: Estado»: **0 `pageerror`**, 25 tarjetas, la rara va la última como «Pausado» (clase `s-bulid`); luego «Nombre» 25. Inyectado: `renderGrid()` sin error. **Sigue**: chips «Todos · 25» con suma 24 (fichero) y 26 tarjetas con «Todos · 25» (inyectado): `countByStatus()` no cuenta el desconocido. (`qa2_medios.js`, `qa2_extra.js`) |
| B3 | Planta sin `loc` pinta «undefined» | **CORREGIDO** | `.ploc` texto `""` y `title=""` (antes «undefined»). (`qa2_medios.js`) |
| B4 | Encabezados dentro de `<button>` | **SIGUE** | 37 `button h2/h3`. (`qa2_bajos.js`) |
| B5 | Semántica incompleta | **SIGUE** | 12 `.pcard-toggle` sin `aria-controls`; chips/medidores sin `aria-pressed` (null); `#q` sin label; SVG sin `aria-hidden` en `.inst`, `.search`, `.btn.docs`, `a.btn.primary`, `a.btn`. (`qa2_bajos.js`) |
| B6 | Formulario: foco y correo perdidos | **SIGUE** | Tras «Cancelar» foco en BODY; tras el error de red foco en BODY y al reabrir `#db-mail` = `""`. (`qa2_bajos.js`) |
| B7 | «Paquete» navega en la misma pestaña | **SIGUE** | `download=""`, `target=""`, `rel=""` a `github.com/IMoriana3/scada/releases/tag/toolbox-v11.93`. (`qa2_bajos.js`) |
| B8 | Palabras largas sin `overflow-wrap` | **PARCIAL** | `.name{overflow-wrap:anywhere}`: nombre de 120 X right 1370 < tarjeta 1389 (antes se salía). `.ver`, `.todo li span`, `.log .ln` siguen `normal`: nota de historial de 500 w → right **4087** con la tarjeta en 1389. (`qa2_bajos.js`) |
| B9 | Barra fija de 15–20 % en móvil | **SIGUE** | 360×740: 108 px normal, **145 px** presentación (antes 148); 768 pres: 114 px. (`qa2_bajos.js`) |
| B10 | Foco en `#q`/`#sort` sólo por color de borde | **SIGUE** | `outline: none 0px` en ambos; borde `#27405F`→`#F09030`. (`qa2_bajos.js`) |
| B11 | «Atrás» no cierra el lector | **SIGUE** | `goBack()` con el lector abierto navega fuera de la página. (`qa2_regresiones.js`) |
| B12 | `potenciaDC` con extremos | **SIGUE** | `pdc:1e21` → «· 1e+21 MWdc»; `estado_pem:123` → chip «123». (`qa2_bajos.js`) |
| B13 | `docUrl` compartido gemelo-digital | **SIGUE** (a confirmar si es intencional) | 2 proyectos con el mismo README. (`qa2_bajos.js`) |

## 3. Regresiones buscadas (lo que sigue funcionando)

| Zona | Qué se probó | Resultado |
|---|---|---|
| Lector en escritorio (1440, pres on/off) y móvil (360 táctil, pres on/off) | Abrir con Enter desde «Documentación», foco inicial, `inert` del fondo, Tab ×60, Shift+Tab, PageDown/ArrowDown/End, Esc, X, retorno de foco, Tab tras cerrar, `openDoc('')` | Todo correcto en los 4 casos salvo la fuga al hero en presentación (N3). Foco inicial en `#reader-close`; `body overflow:hidden`; Esc y X devuelven el foco a `BUTTON.btn.docs «Comparador de estructuras»` y dejan `inert=false` en los tres; Tab tras cerrar va al siguiente control (`A.btn.primary`). Con `path` vacío: aviso «No hay documento…», `inert` puesto y quitado con Esc. TOC: clic en el 4º ítem deja el encabezado en top 150 con la barra del lector en 66 (no tapado por `scroll-padding-top`). |
| Dos docs seguidas; tres encadenadas | Comparador → Esc → Generador; luego `openDoc` de TCU encima | Doc 2: `scrollTop` 0, led pasa de `rgb(240,144,48)` a `rgb(104,192,216)`, TOC 49→31, `inert` se mantiene; doc 3 pisa a la 2 sin dejar restos; Esc final deja `inert=false` y el foco en el botón original. |
| Cartera con fichas abiertas | `conecta(null,null)` sin red (→ «no se ha podido cargar la librería»), `desconecta()`, con el lector abierto y Fayón abierta | Fichas conservadas (ver M4); `data-planta` correcto en las 12 (incluidos «Páramo», «Túnez», «El Naranjo Dicayagua»). |
| Búsqueda | 16 valores con/sin acento, XSS, 5.000 caracteres, regex, filtro `build` + «simulacion» | Ver M2; 0 XSS, 0 errores; filtro + búsqueda sin coincidencia → «Sin resultados». |
| Orden | `status`, `name`, `recent` | `status`: 20 `live` y luego 5 `build`, rangos no decrecientes; `name` y `recent` correctos. |
| Hero en presentación | En vivo, Home/End/ArrowLeft/PageDown en `#h-min`, «Ahora», 60 `input` seguidos, `visibilitychange`, 5 clics de Presentación, `#h-out` tras cada paso | `#h-out` = hora en planta en todos los casos; 60 inputs 1.045 ms sin error; Presentación on/off coherente (`heroDisplay none`, `factiun_presenta` 0/1). Velo: ver M10. Traza: 8 textos, 2 trazas, aguja. |
| Anclas de la barra | Clic real en Plantas/Herramientas/Verificación a 1440 (pres on/off), 768 y 360 (pres on/off) | 1440/768 correctas (top 72 > 60); 360 tapadas (M1). |
| SW offline | 35 entradas, portada, raíz, buscador, cartera-tabla, página inexistente, doc no visitada, doc visitada antes | Ver M8; doc visitada con red y luego offline → se sirve de caché («Comparador de estructuras»). |

## 4. Comprobaciones generales (360, 768, 1440, 1920 × normal y presentación)

| Caso | `scrollWidth` | Fuera de viewport | Fuera de tarjeta | Solapes | Consola |
|---|---|---|---|---|---|
| 8 casos, página recién cargada | = viewport en los 8 | 0 | 0 | 0 | 0 errores / 0 `pageerror` |
| 8 casos con una herramienta y una planta abiertas, y el historial `<details>` desplegado | = viewport | 0 | 0 | 0 reales | 0 |

Rejillas 1/2/4/5 columnas; barra 108/60/60/60 (normal) y 145/114/60/60 (presentación); nombres de planta en una línea salvo «El Naranjo Dicayagua · 18 MWdc» a 360 (2 líneas, sin recorte, que es lo que arregla M9). Nota metodológica: `overflow()` cuenta el contenido del `<details class="dlog">` cerrado (Chromium lo deja con caja por `content-visibility`) y los `span` inline que saltan de línea en `.log li`; filtrados, quedan 0 (cifras «reales» de la tabla; detalle en `viewports2.log` y `bajos2.log`). La única entrada de consola de toda la pasada es el aviso `willReadFrequently` que provoca el propio `getImageData` del script de M10.

## 5. Bugs NUEVOS o regresiones

| # | BUG | SEVERIDAD | CÓMO REPRODUCIRLO | SOLUCIÓN |
|---|---|---|---|---|
| N1 | **La guarda del canvas (corrección de B1) deja muerto el modo presentación cuando no hay contexto 2D** | medio | `page.addInitScript(() => HTMLCanvasElement.prototype.getContext = () => null)` con `factiun_presenta=1` en localStorage: `body` sin clase `presenta`, hero `display:none`, `#h-theta` «—°», `#h-time» «—»`, `aria-pressed=false`. Pulsar «Presentación»: nada cambia (localStorage sigue en 1; con canvas normal pasa a 0). Antes (pasada 1) el modo funcionaba y sólo había un `pageerror` por render. Causa: `const ctx=cv.getContext('2d'); if(!ctx) return;` (línea 3016) está al principio del IIFE del hero y `presenta()`/el `click` de `#btn-pres` (3163–3173) se definen después del `return`. Lo mismo pasa con la sección «Verificación», que sólo existe en presentación. | Mover la guarda al interior de `escena()` (`if(!ctx) return;` al empezar a dibujar) o definir `presenta()` y el listener de `#btn-pres` antes del `return`; que sin canvas se pierda la escena pero no el modo, las lecturas ni la traza. (`qa2_extra.js`) |
| N2 | **Los enlaces `javascript:`/`data:`/`vbscript:` del markdown se ejecutan al hacer clic** (hueco de M11) | medio | Servir un .md con `[enlace js](javascript:window.__xssjs=1)`; abrir la doc; clic real en el enlace → `window.__xssjs === 1`, el lector sigue abierto. También se pintan `href="data:text/html,%3Cscript%3E…"` y `href="vbscript:msgbox"`. El descarte de HTML crudo no cubre los `href` de los enlaces de markdown (marked v12 no filtra el esquema). Siete docs son README remotos. | En el renderer: `link({href,…})` que devuelva sólo texto si `href` no empieza por `https?:`, `mailto:`, `#` o es relativo (o, tras `renderMd`, recorrer `#reader-body a[href]` y quitar los que no pasen `new URL(href, location).protocol ∈ {http:, https:, mailto:}`); de paso `target="_blank" rel="noopener"` a los externos. (`qa2_extra.js`) |
| N3 | **En modo presentación el lector no deja inerte el hero: Tab sale del diálogo y el slider sigue vivo** (hueco de M5) | medio | 1440×900 o 360×740 con `factiun_presenta=1`; abrir una doc con Enter; Tab repetido: en la pulsación 54 (1440) / 13 (360) el foco está en `INPUT#h-min` (fuera de `#reader`); Shift+Tab desde cerrar va a `BUTTON.masinfo «ver detalle»`; con el lector abierto, Home en `#h-min` cambia la hora a 00:00. En modo normal no pasa (el hero está `display:none`). Causa: `FONDO()` = `header.bar, main, footer.pie` y `section.hero#hero` está entre `</header>` y `<main>` (líneas 554–585). | `FONDO = () => document.querySelectorAll('header.bar, section.hero, main, footer.pie')` (o `body > :not(#reader)`). (`qa2_regresiones.js`, `qa2_extra2.js`) |
| N4 | **Una planta sin `views` sigue sin pintarse y el contador miente** (hueco de A5) | bajo | `views:{`→`vistas:{` en Ayora: `console.error("planta sin pintar: Ayora TypeError: Cannot read properties of undefined (reading 'scada') at fichaPlanta (index.html:2738)")`; 11 tarjetas y `#plants-cnt` «· 12». `fichaPlanta` hace `pl.views.scada` sin guarda (la guarda sólo se puso en `urlScada` y `plantCardHTML`). | `fichaPlanta`: `const V = pl.views || {}; const salaTxt = V.scada ? …`; y `plants-cnt` con el número de tarjetas pintadas (o `PLANTS.length` sólo si no hubo fallos). (`qa2_altos.js`) |

Observaciones que no se cuentan como defecto: PageDown con el foco en `#reader-close` no desplaza el lector (hay que pulsar Tab una vez para enfocar `#reader-wrap`; con `tabindex=0` es el comportamiento pedido en la propuesta). El clic en el fondo del lector no cierra (el lector cubre toda la pantalla; igual que en la pasada 1). `.ver.pend` y `.upd` sobre el degradado son el único texto <4,5 que queda (M6).

## 6. Scripts (en `/tmp/claude-0/-home-user/7c843de2-b880-59cd-b920-ae10e6c9eb1e/scratchpad/`, `node <script>` con el servidor en 8099)

| Script | Qué cubre | Salida |
|---|---|---|
| `qa_lib.js` (de la pasada 1) | `abrir()`, `overflow()`, `solapes()` | — |
| `qa2_altos.js` | A1 (19 docs a 360 y 390 + docUrl con error), A2 (en vivo, Ahora, visibilitychange, recorrido), A3 (docUrl + stub raw con CORS), A4 (tres variantes de carrera), A5 (typo `views` y `name:null` servidos) | `altos2.log`, `cap2-reader-360.png`, `cap2-planta-sin-views.png` |
| `qa2_medios.js` | M1 (5 casos, clic real), M2, M3, M4, M6 (27 muestras + pares), M7 (1440/768/360), M9 (texto 200 %, 88 caracteres), M10 (contraste compuesto con el velo, 1440/1024/360), M11 (10 vectores), B2 inyectado, B3, B8 estilos | `medios2.log`, `cap2-ancla-*.png`, `cap2-traza-*.png`, `cap2-hero-1300-*.png`, `cap2-texto200.png`, `cap2-planta-larga-360.png` |
| `qa2_regresiones.js` | Lector en 4 combinaciones (Tab/Shift+Tab/PageDown/End/Esc/X/sin path), dos y tres docs, cartera con fichas abiertas, búsqueda ×16, orden, hero (teclado, 60 inputs, presentación ×5), B11 | `regresiones2.log` |
| `qa2_sw.js` | SHELL vs disco vs caché, SW v176, offline en 6 rutas, doc no visitada / visitada | `sw2.log` |
| `qa2_viewports.js` | 4 viewports × 2 modos, cerrado y con fichas abiertas, consola | `viewports2.log`, `cap2-<w>x<h>[-pres].png` |
| `qa2_extra.js` | Tarjetas abiertas tras la transición, N1 (canvas → presentación, con control), B2 en fichero, N2 (clic real en `javascript:`), orden name/recent | `extra2.log`, `cap2-log-abierto-1440.png` |
| `qa2_extra2.js` | `<details>` del historial, TOC del lector con `scroll-padding-top`, N3 (Shift+Tab y Home en `#h-min` con el lector abierto) | `extra2b.log` |
| `qa2_bajos.js` | B4–B13 y barrido de 8 casos con fichas abiertas e historial desplegado, filtrando los artefactos de `<details>` cerrado y `span` inline | `bajos2.log` |
