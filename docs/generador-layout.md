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
3. **Dibujada sobre el lienzo.** Clic por vértice, doble clic para cerrar.

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

`node tests/test_layout.js` — 119 comprobaciones, sin navegador.

Extrae el bloque `MOTOR DE LAYOUT` del `generador-layout.html` **real** (no una copia en un `.js`,
que se quedaría careando una versión vieja) y lo corre sobre las mismas nueve parcelas que corrió
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

Medido hoy sobre los nueve casos: **cuatro clavados** (parcela girada 35°, parcela en L, setback de
15 m, hueco central) y el peor a **1,89 %** (montaje fijo 2V). Con mutantes: si el setback deja de
morder, si la banda de erosión se escribe sin el término del vértice, o si el GCR se calcula sobre
otro pitch, el careo se pone rojo.

El fixture se regenera con:

```bash
python3 tests/gen_careo_layout.py --core /ruta/a/SolarGPTfull/solargpt
```

## Salidas

- **GeoJSON** en el mismo formato que lee el [Explorador de layout](../layout.html): `{stats, geojson}`.
- **DXF** de polilíneas cerradas en coordenadas UTM (capa `MESAS`), para meterlo en el proyecto.
- **KML** para abrirlo sobre la ortofoto en Google Earth.
- **Ver en 3D**: escribe la planta `custom` en `localStorage` (`cobertura_layout`) y abre el visor de
  terreno de `cobertura-zigbee` — el mismo contrato que ya usaba el Explorador.

Los tres ficheros se llaman como el emplazamiento elegido: tres exports seguidos de tres sitios
distintos y todos `layout.geojson` acaban siendo un misterio en la carpeta de descargas.

## Notas

- El motor SolarGPT se detecta solo en `127.0.0.1:8765/8000/9000`, o se le fija la URL con un clic en
  el indicador de la barra (el túnel de Colab). Con él conectado aparece la opción **Motor SolarGPT**
  en el desplegable *Cálculo* y la ficha pide el layout canónico por `POST /layout`.
- El cálculo del navegador tarda entre 30 ms y 200 ms para parcelas de 10-30 ha. No hay barra de
  progreso porque no hace falta.

*Factiun · proyecto interno.*
