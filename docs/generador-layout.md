# Generador de layout

> Entra una parcela y salen las mesas: filas, trackers, kWp y ocupación, con el motor de
> implantación del cuaderno (§02.5a) portado al navegador.

**Abre y genera**: `generador-layout.html` en este repo, sin levantar nada.
El motor SolarGPT es opcional y da el número canónico.

---

## Qué pregunta contesta, y cuál no

| Pregunta | Dónde se contesta |
|---|---|
| «¿Cuántas mesas y cuántos MWp caben **en esta parcela**?» | **aquí** |
| «¿Qué **estructura** monto en este sitio?» (fija vs seguidor) | ficha [Comparador de estructuras](comparador-estructuras.md) |
| «¿Cuánta **energía** produce lo que cabe?» | ficha Sol & Simulación y §03 del cuaderno |
| «¿Cómo queda el **terreno** (desmontes, pendientes)?» | `solargpt_core.earthworks` / MDT, todavía no portado |

Esto es **geometría**: dónde va cada mesa y cuántas son. La potencia sale de multiplicar módulos
por Wp; no hay meteo, ni sombras, ni energía.

## Dónde: el buscador de emplazamiento

El emplazamiento es **lo primero**, se defina luego la parcela como se defina: el buscador y las
coordenadas están fuera del selector de modo. (Estuvieron dentro del panel «por cotas», y al elegir
«dibujarla sobre el lienzo» desaparecían — justo cuando más falta hacen, porque son lo que te lleva
hasta tu finca.) Elegir un sitio en modo dibujo o GeoJSON **vuela** allí sin tocar lo que tengas
dibujado; en modo «por cotas» la parcela se mueve con el centro.

Antes esto era un desplegable con la cartera, así que implantar en un sitio que **todavía no es una
planta** obligaba a teclear latitud y longitud a mano — y una parcela sin proyecto es justo lo que
se dibuja aquí. Es el mismo componente que el de [Viento & Abanderamiento](viento.md), con sus tres
caminos y en este orden:

1. **Cartera y presets.** Se filtran al teclear y funcionan **sin red**, que es lo que se busca el
   90 % de las veces. Sin acentos y en cualquier orden: «tunez» encuentra Gabès, «valencia ayora» y
   «ayora valencia» encuentran lo mismo, y «24019» encuentra por código. Si la planta trae `pitch`
   en la cartera, se aplica también.
2. **Coordenadas pegadas** tal cual: `41.5763, -0.7981`, con coma decimal o con `N/S/E/O`. Es el
   camino más corto para quien viene de un DWG. Un texto que *no* son coordenadas sigue su camino al
   buscador en vez de colarse como un `0,0` en el Golfo de Guinea.
3. **El geocodificador de Open-Meteo**, sin clave y ya declarado en la casa. Si no contesta se
   **dice** en el propio desplegable: una lista vacía se lee como «ese sitio no existe» cuando lo
   que pasa es que no hay internet.

Tocar la latitud o la longitud a mano **suelta el nombre**: decir «Ayora» sobre unas coordenadas
cambiadas sería ponerle nombre de planta a otro emplazamiento — y ese nombre acaba en el fichero que
se exporta (`layout-24025-ayora-valencia-es.geojson`).

## Cómo se define la parcela

Tres caminos, y los tres acaban en el mismo anillo de coordenadas:

1. **Rectángulo por centro y cotas.** Latitud, longitud, ancho, alto y un giro. Es lo rápido para
   tantear, y el giro sirve para ver lo que de verdad hace el motor contra un borde oblicuo.
2. **GeoJSON.** Pegado o cargado de fichero (SIGPAC, Catastro, geojson.io). Coordenadas `[lon, lat]`.
   Los **anillos interiores** entran como exclusión: el motor no coloca ahí, y además respeta el
   setback contra su borde — igual que el `buffer(-d)` de Shapely en el core.

### Exclusiones dibujadas (§02.5c)

Cursos de agua, edificaciones, servidumbres: se dibujan sobre la ortofoto con **⛔ Dibujar
exclusión**, en cualquiera de los tres modos de parcela, y el motor no coloca mesas ahí.

Van **aparte de los agujeros del GeoJSON**, y no es cosmético: el core también las trata distinto y
se ve en el número. Los agujeros del polígono son **borde** —el setback se mide también contra
ellos, como hace `buffer(-d)`— y las exclusiones se restan **después** del setback, igual que el
`excl_utm` del core. Meterlas en el mismo saco daría un área útil distinta de la del cuaderno.
3. **Dibujada sobre el lienzo.** Clic por vértice, doble clic para cerrar.

## El lienzo: ortofoto y navegación

Dibujar la parcela sobre un fondo negro es dibujar a ciegas — nadie sabe dónde está el linde de su
finca sin ver el terreno. Igual que el cuaderno y Streamlit, la ficha dibuja sobre la **ortofoto de
Esri World Imagery**, y con eso vienen dos consecuencias:

- **La vista es Web Mercator.** El encuadre anterior era lon/lat lineal con un `cos(lat)` a mano:
  suficiente para una parcela, pero las teselas no están en esa proyección y encajarían torcidas —
  el error crece con la latitud. Con Mercator, la tesela y la parcela hablan el mismo idioma.
- **Se navega.** Arrastrar mueve, la rueda acerca sobre el cursor, `⤢ Encajar` vuelve a la parcela.
  Un clic solo pone vértice si **no** ha sido un arrastre: mover el mapa mientras dibujas plantaba
  antes un vértice en cada parada.

Si las teselas no llegan —sin red, o bloqueadas por una política de empresa— se **dice** en la
leyenda y se cae a una **retícula de 50 m**: dibujar a ciegas sin saber por qué es peor que dibujar
sobre una cuadrícula. La ortofoto se puede apagar con su casilla.

**Las teselas se piden con `crossOrigin`, y si eso falla se reintentan sin él.** No es un detalle:
con `crossOrigin` puesto, una respuesta sin cabecera CORS no es una imagen que se vea mal, es una
imagen que **no carga** — y el usuario se queda sin fondo justo cuando lo necesita. El reintento sin
CORS trae la imagen a costa de «teñir» el lienzo (deja de poder leerse con `getImageData`), que es
una consecuencia que solo le importa a las pruebas. La prioridad es que se vea, y la leyenda lo
declara con un «(sin CORS)».

> Esto arregla de paso una regresión que se veía en producción: al poner el **primer** vértice, el
> encuadre se recalculaba sobre una caja de tamaño cero y la parcela salía de «0,00 ha» con una
> escala de milímetros. La vista ya no se reencuadra mientras dibujas.

## La estructura, como en el cuaderno

Los mismos campos, las mismas fórmulas y los mismos avisos que la página **Layout** de Streamlit
(§03.F para fija, §03.T para tracker):

| | |
|---|---|
| **Derivados, en vivo** | apertura, alto del colector, GCR y módulos por fila |
| **Tracker** | tilt del eje (TSAT), ángulo máximo, backtracking |
| **Fija** | tilt fijo, azimut de módulos |
| **Pitch desde GCR** | `pitch = apertura / GCR`. Con la apertura canónica de 2,382 m, el GCR 0,397 da 6,00 m — las constantes de `solargpt_core.tracker` |
| **Avisos** | GCR > 0,7 «es alto, se sombrean»; GCR < 0,2 «terreno espacioso, menos potencia por hectárea» |

**Apertura y alto del colector no son lo mismo**, y confundirlos mueve el GCR: la apertura es
`n × lado del módulo` **sin** gaps (convención de industria, y lo que usa el motor para colocar); el
alto físico sí suma los gaps entre módulos apilados. Streamlit enseña los dos justo por eso, y aquí
también.

## Bifila: si es bifila, es bifila

La sub-fila **B es el espejo en Y de su A**, no una colocación independiente — la «Opción C» del
cuaderno. Colocarla por su cuenta daba, en multi-talla y en borde irregular, unas X distintas en A y
en B: el emparejado posterior no casaba, caían huérfanas y el campo salía lleno de **mesas sueltas
con pinta de monofila**. Espejando, A y B comparten exactamente las mismas X por construcción.

Y al colocar la A se exige que la estructura quepa **también** en la banda de su B (el
`_DualBandPrep` del core): sin eso, el greedy planta en A una talla que en B no cabe, B la pierde y
A se queda viuda.

Medido sobre parcela girada 35°, multi-talla y parcela en L: **0 pares descuadrados y Δx = 0 m**.

El **eje de transmisión** (la biela que une las dos sub-filas) se dibuja con su casilla: es lo que
hace visible que es bifila y no dos monofilas juntas.

## Barridos de orientación

Las dos casillas que el cuaderno ofrece por separado —**«Optimizar azimuth (90–270)»** y
**«Optimizar ángulo de grid»** con su rango y paso— son aquí el mismo motor, igual que en el core
(`optimize_grid_angle` se llama a sí mismo con cada ángulo y se queda con el de más kWp).

Cuesta lo que cuesta: son **N layouts completos**, no una fórmula. 36 ángulos ≈ 3 s, con barra de
progreso y cediendo el hilo cada dos pasos para que la ficha no se congele. Al terminar, el azimut
ganador **se escribe en el formulario** —enseñar un layout que no se corresponde con lo que dicen
las casillas sería mentir— y el pie dice cuánto se gana frente al que tenías.

## Exclusiones de línea

Zanjas, líneas eléctricas, caminos existentes: no son polígonos y pedirles que se cierren sería
inventarles un lado. Se dibujan como **polilínea + buffer (m)** —bastan dos puntos— y el motor resta
la banda exacta alrededor, con la misma matemática del setback. Es el `excl_utm_line` del core.

El desglose por fuente se cuenta **aparte** (área de solape ÷ área por estructura, la misma
aproximación que `estimate_drops_by_source`): sumarlas escondería cuál de las dos te está costando
el campo.

## Forzar strings completos

Descarta las estructuras de talla **menor** que la principal, que son las que dejan un string a
medias. Con talla única no hay nada que descartar; en bifila, si una sub-fila se queda desparejada
tras el recorte, cae su pareja.

> **Hallazgo de la auditoría (2026-08-20).** En el cuaderno esta casilla **hoy no hace nada**:
> `force_complete_strings` se pasa por las llamadas recursivas de `compute_layout_v2` y entra en la
> clave de caché (`fcs`), pero no toca la colocación en ningún punto. Aquí se implementa con el
> significado que promete su etiqueta, y queda dicho en la propia ficha.

## Cómo se pintan las mesas

- **Render: auto / polígonos / líneas.** A partir de unos miles de mesas los polígonos van a tirones
  y encima no se distinguen; la línea sobre el eje largo es lo que el cuaderno llama «ultra-ligero».
  En *auto* se cambia solo por encima de 2.500 mesas.
- **Mostrar descartadas**: las que el motor tiró, en gris punteado. Ver *dónde* se pierden dice más
  que el número.
- **Mostrar eje bifila**: la biela que une las dos sub-filas de un mismo tracker. Es lo que hace
  visible que es bifila y no dos monofilas juntas.

## El terreno y sus pendientes

Pendiente N-S y E-O, más el albedo. Con ellas la ficha deriva lo que **sí** es geometría pura:

- **cross-axis**: la pendiente que cruza las filas (con filas a lo largo del eje N-S, la E-O).
- **Δz entre filas**: `pitch · tan(cross)` — el desnivel real entre filas consecutivas.
- **pitch en planta vs pitch en terreno**: `pitch / cos(cross)`. El proyecto mide uno; el layout
  dibuja el otro.

### El MDT

De toda la auditoría, el filtro de pendiente es **lo único que hace que la ficha y el cuaderno den
números distintos sobre la misma parcela**. Por eso está.

| | |
|---|---|
| **Fuente** | **Teselas de terreno** (por defecto), **Open-Meteo Elevation** o **CSV propio** `lon,lat,z` (el §02.5b-2 del cuaderno) |
| **Resolución** | malla n×n, de 6 a 48. El campo dice lo que cuesta (puntos y llamadas) y, si te pasas, **recorta a la vista** en vez de en silencio |
| **Margen alrededor** | en metros, sobre el bbox de la parcela |
| **Pendiente máx. (°)** | las celdas que la pasan se **excluyen**, y se pintan en morado |
| **Desactivar el filtro** | mide pendientes pero no excluye |
| **Umbral de fracción** | si el MDT se lleva más del **35 %** de la parcela, se avisa (`_layout_mdt_excl_frac_th_035`) |

Las pendientes medias medidas **sobrescriben** las que teclees y esos campos quedan bloqueados:
tener dos verdades sobre la misma pendiente es peor que no tener ninguna. La casilla «usar las del
MDT» las devuelve a mano.

Las exclusiones por terreno se cuentan **aparte** de las tuyas (`drop_topo_mask` frente a
`drop_user_poly` y `drop_line_buffer`): saber si el campo lo recorta el terreno o un dibujo tuyo no
es el mismo problema.

**La cascada, que es lo que hace el cuaderno.** §02.5b no tiene *una* fuente: tiene una **lista
priorizada por país** (`detect_country` → `sources_for_country`) y va cayendo a la siguiente cuando
una falla. Su primera opción global es Copernicus GLO-30 en AWS **sin token**, y detrás vienen
OpenTopography (token gratuito), Open Topo Data y Open-Elevation, más las regionales (IGN España y
Francia, TINITALY, Bhuvan, Topodata, USGS 3DEP).

**Lo que aquí no se puede tener, y conviene saberlo antes de fiarse:** esa cascada incluye fuentes
regionales muy por encima de los 30 m — **IGN MDT05 a 5 m** en España, RGE ALTI en Francia,
TINITALY a 10 m en Italia, USGS 3DEP a 10 m en EE. UU. Son servicios WCS que devuelven GeoTIFF, y
eso no se abre desde un navegador, como tampoco se guarda un token de OpenTopography. Para
**replanteo**, el MDT bueno sigue estando en el cuaderno.

Aquí se replica el **patrón**, no la lista: desde un navegador no se puede abrir un GeoTIFF de
COP30 de 100 MB ni guardar un token. La cascada es **teselas de terreno → Open Topo Data →
Open-Elevation → Open-Meteo**, y dice cuál ha servido. Las dos del medio son exactamente las que el
core usa sin token (`dl_opentopodata`, `dl_open_elevation`); las teselas van primero porque
resuelven la parcela en 1-4 peticiones. Si caen todas, se dice **con el porqué de cada una** en vez
de quedarse a medias.

**Por qué el orden.** Open-Meteo va punto a punto: 100 por llamada, así que una malla de
48×48 son **24 peticiones seguidas** y el servicio contesta 429 — con reintento y todo, porque el
problema no es el ritmo, es el número. Las **teselas de terreno** traen la cota codificada en el
color de un PNG (formato *terrarium*, `z = R·256 + G + B/256 − 32768`): una imagen de 256×256 son
**65.536 cotas en una petición**, y una parcela entera cabe en 1-4. Por eso son la fuente por
defecto; Open-Meteo se queda para mallas pequeñas o como segunda opinión.

Leer el color obliga a `crossOrigin`, y aquí **no hay reintento sin CORS que valga**: sin poder leer
los píxeles la tesela no sirve de nada. Si eso falla, se dice y se ofrece la otra fuente.

Con Open-Meteo, el servicio es gratis y sin clave, así que el trato es ir despacio: las llamadas van **con ritmo**
(220 ms entre lotes) y un **429 se espera y se reintenta** —respetando el `Retry-After` si viene— en
vez de insistir. A la cuarta se rinde diciendo que es el límite de peticiones y cuántas llamadas
suponía tu resolución. Los lotes ya pedidos quedan cacheados.

> **Es otra fuente, no el mismo dato.** El cuaderno usa COP30 vía OpenTopography, que exige clave;
> Open-Meteo sirve elevación sin clave y con CORS, que es lo que permite pedirla desde el navegador.
> Sirve para ver la forma del terreno y filtrar por pendiente — **no para replanteo**. Va dicho en
> la propia ficha.

### Qué hace cada cosa (que no es lo mismo)

Aquí hay dos cosas distintas y conviene no mezclarlas:

- Las **pendientes medias** N-S/E-O **no son un parámetro del motor**: `compute_layout_v2` no las
  recibe e implanta en planta. Por sí solas no mueven ni quitan una mesa. Lo que hacen es viajar con
  el layout al **backtracking** (`cross_axis_slope_deg`, lo que consume `bt_audit`) y a la sombra
  entre filas, en vez de quedarse muertas en un campo de la pantalla.
- **El terreno sí entra en la colocación**, por la otra puerta y la misma que en el cuaderno: el
  **filtro de pendiente máxima** del MDT excluye las celdas que se pasan, y eso **quita mesas**. Es
  el `excl_utm_topo` del core, y se cuenta como fuente propia (`drop_topo_mask`).

## Los parámetros son los del cuaderno

Los mismos nombres y los mismos defaults que la página **Layout** de Streamlit y que
`compute_layout_v2`:

| Grupo | Campos |
|---|---|
| Estructura | montaje (tracker/fija), tabla `1V…4V` / `1H…4H`, mods/string, largo y ancho de módulo, Wp |
| Implantación | pitch, setback, azimut del eje → azimut de filas, modo `aligned`/`adaptive`, monofila/bifila |
| Avanzados | gap entre módulos, gap del motor, gap N-S, viales E-O y N-S, mín. estructuras por fila, offset de filas, alinear a rejilla, centrar |

Dos cosas que conviene saber porque no son intuitivas:

- **Mods/string admite varias tallas** separadas por coma (`28, 14, 7`). Entonces el motor coloca la
  mayor que entra en cada punto y rellena la cola con las pequeñas. Es lo que sube el relleno en las
  puntas convergentes de una parcela irregular.
- **Mín. estructuras por fila no es monótono.** El cuaderno usa `2`. Bajarlo a `1` *no* rellena más:
  activa la poda mediana-relativa (quita las líneas por debajo del 30 % de la mediana) y suele salir
  peor. Para rellenar las puntas, multi-talla.
- **Bifila es un concepto de tracker.** Un motor mueve dos filas unidas por el eje de transmisión.
  En montaje fijo no hay motor, así que el flag se ignora — y la ficha lo dice en pantalla en vez de
  aplicar una poda de parejas que vaciaría el layout.

## Qué está portado, y con qué

| Pieza del core | Aquí |
|---|---|
| `pyproj` → UTM | Series clásicas de Transverse Mercator (WGS84, k0 = 0,9996). El careo las mide contra pyproj: **por debajo del milímetro** |
| `poly.buffer(-setback)` de Shapely | **Erosión exacta**: el área útil es el conjunto de puntos interiores a distancia ≥ setback del borde, resuelto en forma cerrada sobre cada línea de barrido (a cada arista le corresponde un «estadio» —dos discos y un rectángulo— cuya intersección con la línea es un intervalo) |
| `poly.intersection(box(...))` por fila | La franja se muestrea en varias líneas (paso ≤ 0,4 m) y se **intersecan** sus intervalos: queda el tramo donde cabe la mesa entera de alto, que es lo que el core comprueba después con `contains(rect)` |
| `place_row_aligned` / `place_row_adaptive` | Port literal, incluido el arranque por fases del modo adaptive |
| `place_row_aligned_multi` | Port literal: greedy largest-first sobre rejilla común, mirada-adelante («¿por qué dos de 5 y no uno de 10?») y segunda pasada de paso fino |
| `match_rows_by_x` + paridad bifila | Port literal, con el espejo de la sub-fila B sobre la A y el recorte a conteo par |
| `_centered_road_positions` | Port literal |
| `contains` contra `poly_r.buffer(0.05)` | Misma holgura de 5 cm. **No es cosmética**: sin ella, un borde que se desvía dos centímetros a lo largo de la parcela tira la primera mesa de cada fila y se pierde un tracker por fila |

**Lo que NO está portado**, y por eso sale escrito en la propia ficha: relleno por columna y
edge-fill, consolidación N-S de trackers contiguos, barrido del ángulo de grid
(`optimize_grid_angle`), barrido del origen Y cuando hay exclusiones y filtro por pendiente del MDT.
Son refinamientos de borde: mueven unidades sobre parcelas irregulares, no el orden de magnitud.

## El careo

`node tests/test_layout.js` — 151 comprobaciones, sin navegador.

Extrae el bloque `MOTOR DE LAYOUT` del `generador-layout.html` **real** (no una copia en un `.js`,
que se quedaría careando una versión vieja) y lo corre sobre las mismas doce parcelas que corrió
`solargpt_core.layout_v2.compute_layout_v2` (`tests/careo-layout.json`).

Lo que se exige, y por qué eso y no la igualdad:

| Magnitud | Tolerancia | Por qué |
|---|---|---|
| Nº de **filas** | idéntico | Es la geometría del campo (pitch, setback, orientación) en un número. Con exclusiones, ±1: el barrido de Y del core no está portado |
| **Mesas** y **kWp** | 2,5 % | El core lleva los refinamientos de borde de arriba |
| **Área útil** | 0,5 % | La erosión contra el `buffer(-d)` de Shapely; el 0,5 % es la discretización del barrido |
| Largo de mesa, apertura, largo de fila | exacto | Son fórmulas cerradas: no admiten tolerancia |
| GCR de tracker | exacto | `apertura / pitch`. En fija el core lo define por área, así que arrastra la diferencia del conteo |
| UTM contra pyproj | < 1 mm | Tres órdenes de magnitud menos que el gap entre módulos |

Medido hoy sobre los doce casos: **tres clavados** (parcela girada 35° bifila, parcela en L
monofila, setback de 15 m), el peor a **1,89 %** (montaje fijo 2V) y las **filas idénticas en 11 de
12**.

Tres de los doce son **bifila con multi-talla** —sobre rectángulo girado 35°, sobre parcela en L y
sobre rectángulo recto—, y están ahí a propósito: es la combinación donde el emparejado A/B se
rompe, es lo que se vio fallando en planta, y el careo no la cubría. Un banco que solo carea
rectángulos limpios y monofila no puede cazar lo que el uso real caza a la primera.

Y en **todos** los casos bifila del fixture se mide el invariante sobre los datos: cero pares
descuadrados, **Δx = 0 m** entre sub-filas y conteo par en todas las líneas. Si alguien vuelve a
colocar la sub-fila B por su cuenta, esto se pone rojo. Con mutantes: si el setback deja de
morder, si la banda de erosión se escribe sin el término del vértice, o si el GCR se calcula sobre
otro pitch, el careo se pone rojo.

El fixture se regenera con:

```bash
python3 tests/gen_careo_layout.py --core /ruta/a/SolarGPTfull/solargpt
```

## Varias parcelas

El **➕ Añadir parcela** del cuaderno. Una planta rara vez es un solo recinto: se dibuja o se pega
cada uno, se le pone nombre y el layout se calcula sobre **todos**, sumando.

Cada parcela va **por su cuenta** al motor: implantar sobre la unión daría filas cruzando el hueco
entre recintos, que es justo lo que no existe. Los resultados se agregan y las áreas y porcentajes
se recalculan sobre el total (no se promedian, que sería otra cosa). Las exclusiones y el MDT se
aplican a todas por igual, y el reparto por parcela sale en su tabla.

En multi-parcela **no se dibujan** ni el eje bifila ni la banda de área útil: son por parcela, y
pintar los de la primera sobre todas mentiría.

## Importar KML / KMZ

El polígono desde Google Earth. **KML** es XML y se lee directo; **KMZ** es un ZIP y se abre con
`DecompressionStream`, que el navegador ya trae — arrastrar una librería de descompresión a una
ficha que presume de no tener dependencias no valía la pena.

Un KML con varios polígonos son **varias parcelas**, no una: quedarse con el primero en silencio
sería tirar la mitad del fichero.

## Civil & exports (§02.5g)

Port de las fórmulas canónicas, no de una versión propia:

| | Fórmula del core |
|---|---|
| **Hincas** | `earthworks.pile_setout_table`: equiespaciadas 7 m por el eje, ambos extremos incluidos, con la cota del MDT si lo hay |
| **Mediciones (BoQ)** | potencia, módulos, mesas, trackers, filas, hincas, metros de tubo de par, superficies y viales |
| **Terreno PVsyst** | `pvsyst_export.terrain_to_pvsyst_xyz`: `X;Y;Z` en metros locales, origen en el centroide del grid |
| **COLLADA** | malla de dos triángulos por mesa, ENU en metros, con cota del MDT si lo hay |
| **Pitch por banda** | `pitch_terrain.pitch_required_on_slope` — la «dynamic distance» de PVX: `p = c·cosθ + c·senθ / (tanα + s)`, con el lado desfavorable `s = −|tan β|` y el sol al límite de 15° |

El XYZ de PVsyst es **terreno**, no layout: sin MDT se **niega** y dice por qué, en vez de escribir
un plano a cota 0 que se leería como que el terreno es llano.

El pitch por banda **recomienda**: no mueve una sola estructura, y el árbitro sigue siendo el sweep
de LCOE del cuaderno (§04.4).

## Checklist antes de congelar (§02.5i)

Los ocho puntos del cierre de la página Workflow. Los cinco que la ficha **sabe** se marcan solos:
dejarte marcar a mano que el MDT está aplicado cuando no lo está sería firmar algo falso. Los tres
que dependen del cuaderno o de otras fichas salen listados como lo que son — pendientes de mirar
fuera.

> El checklist **regulatorio** (permisos, EIA, grid code) es otro y vive en §08.R1: no confundirlos.

## Salidas

- **GeoJSON** en el mismo formato que lee el [Explorador de layout](../layout.html): `{stats, geojson}`.
- **DXF** de polilíneas cerradas en coordenadas UTM (capa `MESAS`), para meterlo en el proyecto.
- **KML** para abrirlo sobre la ortofoto en Google Earth.
- **Ver en 3D**: escribe la planta `custom` en `localStorage` (`cobertura_layout`) y abre el visor de
  terreno de `cobertura-zigbee`.

  El 3D dibujaba **todo del mismo tamaño y todo «completo»**, porque se le mandaba una talla global y
  ninguna razón de largo: un campo multi-talla salía uniforme y no se parecía al 2D. El visor sí sabe
  hacerlo —lee `mesa.tipos[blk].largo` y el `mr` por seguidor, que es como dibuja las tres tallas de
  Ayora—, lo que faltaba era mandárselo. Ahora va la geometría de mesa completa (`modW`, `modH`,
  `gapMod`, `gapDrive`, `pasoFila`), **un tipo por talla con su largo real**, y cada tracker con su
  `mods`, su `mr` y su `t`.

  Un nodo del visor es **un tracker**: las dos mesas que comparten tubo y motor, agrupadas como en
  `group_mesas_into_trackers`. `filaZ: 0` porque aquí cada fila es su propia línea — en el canónico
  la geometría bifila es idéntica a la monofila, y «bifila» es qué dos filas comparten motor, no una
  separación distinta; un `filaZ` ≠ 0 duplicaría filas que ya van una por una.

Los tres ficheros se llaman como el emplazamiento elegido: tres exports seguidos de tres sitios
distintos y todos `layout.geojson` acaban siendo un misterio en la carpeta de descargas.

## Notas

- **El picker de catastro no está, y no es un olvido.** El cuaderno y Streamlit ofrecen traer la
  parcela real de los proveedores oficiales (`/parcels` del motor: OSM y Catastro ES por bbox). Aquí
  no se ha portado porque en la práctica **nunca ha funcionado** (decisión del 2026-08-20). La
  parcela entra por GeoJSON —que sí se puede exportar a mano desde SIGPAC, Catastro o geojson.io— o
  dibujada. Si algún día el proveedor es fiable, esto se reabre; mientras tanto, no volver a
  intentarlo.
- El motor SolarGPT se detecta solo en `127.0.0.1:8765/8000/9000`, o se le fija la URL con un clic en
  el indicador de la barra (el túnel de Colab). Con él conectado aparece la opción **Motor SolarGPT**
  en el desplegable *Cálculo* y la ficha pide el layout canónico por `POST /layout`.
- El cálculo del navegador tarda entre 30 ms y 200 ms para parcelas de 10-30 ha. No hay barra de
  progreso porque no hace falta.

*Factiun · proyecto interno.*
