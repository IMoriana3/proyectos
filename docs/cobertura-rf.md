# Cobertura RF — Zigbee 2.4 GHz en plantas FV con seguidores
### Modelo físico de propagación y herramienta de visualización para los enlaces Zigbee / 802.15.4 (Digi XBee RR) entre las TCU de los seguidores y las NCU

Un solo motor físico, tres usos: **siting predictivo**, **diagnóstico** de una malla real (predicho vs. RSSI medido → grafo → punto único de fallo) y **base** para validar contra ray tracing.

---

## 1. Qué incluye

- `index.html` — render 3D interactivo (WebGL, todo vendorizado: se abre sin servidor y sin internet) con el **modelo real del seguidor**: patrón de la antena sobre el suelo y enlace coloreado por margen real, con la geometría bifila parametrizable. Es el "programita" que se abre en el navegador / GitHub Pages.
- `seguidor.js` — la **fuente única** del seguidor solar (cotas, piezas y materiales) que comparten el gemelo digital, Cobertura 3D y el simulador de backtracking. Copia idéntica: mejorarla en un repo mejora todos.
- `python/` — núcleo físico + driver de diagnóstico para correr sobre tus datos.
- `web/` — port JS del núcleo (para integrar el cálculo en cualquier HTML) y una demo de mapa de cobertura.
- `docs/` — ficha para el panel de proyectos.

---

## 2. Estructura

```
cobertura-rf-fv/
├── index.html                  # render interactivo (GitHub Pages sirve esto)
├── seguidor.js                 # modelo del seguidor (idéntico en todos los repos)
├── lib/                        # three.js r128 + OrbitControls (vendorizados)
├── tests/
│   └── test_visor_3d.js        # QA del visor en Chromium (28 comprobaciones)
├── README.md
├── INSTRUCCIONES.md            # cómo usarlo paso a paso
├── elburgo_real_rssi.csv       # dataset real El Burgo (RSSI por enlace)
├── elburgo_real.geojson        # topología observada (SPOF + dominadores)
├── python/
│   ├── zigbee_pv_model.py      # núcleo físico (FSPL + dos rayos + difracción + balance)
│   ├── diagnostico_elburgo.py  # coords + RSSI → grafo → SPOF → GeoJSON
│   ├── adaptador_elburgo.py    # routes + log → RSSI por enlace + topología
│   ├── requirements.txt
│   ├── coords_ejemplo.csv      # plantilla de coordenadas
│   └── rssi_ejemplo.csv        # plantilla de RSSI medido
├── web/
│   ├── zigbee_pv_model.js      # port JS del núcleo (sin dependencias)
│   └── demo-cobertura.html     # mapa de calor de cobertura (autónomo)
├── assets/
│   └── antena_patron.png       # patrón del dipolo (referencia)
└── docs/
    └── cobertura-rf.md         # ficha para el panel
```

---

## 3. El render interactivo (`index.html`)

Ábrelo en cualquier navegador (doble clic) o publícalo en GitHub Pages. No necesita servidor ni internet: three.js y el modelo del seguidor van dentro del repo.

Lo que ves son **tres seguidores bifila** montados con `seguidor.js`, el modelo de la casa (el mismo del gemelo digital y de Cobertura 3D): viga de torsión partida, correas omega con su abarcón, módulos de 1.134 × 2.382 con textura de células y sus cajas de conexión, cableado leapfrog, slew drive con reductora y motor, TCU con chapas y abarcones, seccionador DC, pilas y amortiguadores. De cada pareja, solo la viga del motor lleva TCU y antena, y un eje de transmisión Ø 60 con sus dos cardanes la une con la gemela.

Que sea el modelo de la casa no es estética: obliga a que el dibujo y la física hablen del mismo seguidor. Dos cotas que esta página se inventaba y que ahora salen del modelo:

- la **cara del módulo** está a `DIMS.off` = 0,14 m sobre el eje del tubo (antes, 0,25 a ojo). Es la cota que entra en `lowerEdge()`, el canto que apantalla el enlace: con una en el dibujo y otra en la difracción, la imagen se leía como la prueba visual de un número que la contradecía;
- la **antena** cuelga donde dice el catálogo: el coax sale del conector de la TCU (0,225 m bajo el eje del tubo) y baja los 0,50 m de `antHang`, así que la caída de partida son 0,725 m, no 0,15. Con 0,15 el elemento radiante quedaba *dentro* de la caja de la TCU — imposible de ver mientras el seguidor era un rectángulo. A 0,72 m la antena queda por debajo del canto bajo del módulo y el salto pasa por debajo de las mesas, que es lo que se ve en planta.

Controles:

- **Inclinación** — ángulo de los seguidores (−55° a 55°).
- **Caída de la antena bajo la viga** — cuánto cuelga el látigo por debajo del tubo de torsión. Arranca en la cota del modelo (0,725 m); el recorrido 0,25–1,50 m queda para explorar otros montajes.
- **Distancia entre filas** — paso entre filas. Las antenas van en las filas pares, así que cada salto es 2× este valor y cruza la fila intermedia.
- **Altura de la viga de torsión** — cota del eje de giro.
- **Altura de módulo** — dimensión del módulo a lo largo de la pendiente.
- **Suelo** — conductor perfecto / tierra real (húmeda).
- **Radio** — XBee RR (+8 dBm) / XBee-PRO RR (+19 dBm).
- **Tramo dibujado** — 7 módulos por ala (16,6 m), 14 (32,7 m) o los 28 de la fila real (64,7 m). Solo afecta al encuadre: la física es una sección transversal y no depende del largo.
- **Encuadre** — Conjunto / Antena / Accionamiento, tres posiciones de cámara.
- **Patrón de la antena** — apaga el toroide para ver el seguidor limpio.

La línea entre antenas se colorea por el margen real (verde holgado → ámbar al límite → rojo sin enlace) y muestra el valor en dB. Gira la escena con el ratón/dedo y haz zoom con la rueda.

---

## 4. Física del modelo

Cada enlace se evalúa con pérdida en espacio libre (FSPL), rebote en el suelo (modelo de dos rayos con coeficiente de reflexión de Fresnel y suelo de `eps_r`/`sigma` — reproduce los nulos de interferencia y la pendiente d⁴ lejana), apantallamiento por filas de módulos y topografía (difracción multiobstáculo de filo de cuchillo, ITU-R P.526, método Deygout) y un margen log-normal calibrable. De ahí salen el RSSI predicho, el margen sobre sensibilidad y la probabilidad de enlace; sobre el grafo NetworkX se obtienen los puntos de articulación (SPOF) y el nodo dominador de rutas.

---

## 5. Parámetros reales

- **Radio:** Digi XBee RR Zigbee — Tx +8 dBm (estándar) o +19 dBm (PRO), sensibilidad −103 dBm (modo normal, 1% PER). En **canal 26** la potencia se limita a +3 dBm en ambas variantes.
- **Antena:** Jinchang JCW435700RA — dipolo lineal ≈ λ/2, 3 dBi, 2400–2483,5 MHz. Su diagrama (H-plane omnidireccional, E-plane en ocho) confirma el patrón de toroide del modelo.
- **Por defecto:** PRO (+19 dBm), 3 dBi en cada extremo, −103 dBm. El cable LMR195 de 0,7 m resta ~0,4 dB/extremo (despreciable).

---

## 6. Diagnóstico de tu malla real (Python)

Necesitas dos CSV.

Coordenadas (`coords.csv`) — cabecera flexible, se auto-detecta:

```
id,x,y,cota          # UTM o metros locales (cota opcional)
id,lon,lat,cota      # o geográficas
```

RSSI medido (`rssi.csv`):

```
origen,destino,rssi_dbm
```

Ejecuta:

```bash
cd python
pip install -r requirements.txt
python3 diagnostico_elburgo.py coords.csv rssi.csv salida.geojson
```

Para probar el flujo con las plantillas incluidas:

```bash
python3 diagnostico_elburgo.py coords_ejemplo.csv rssi_ejemplo.csv salida.geojson
```

Qué hace: calibra un sesgo global predicho-vs-medido, construye la malla (arista si el margen ≥ 8 dB), detecta los puntos de articulación (SPOF) y el nodo por el que pasan más rutas, y escribe un GeoJSON con nodos (flag SPOF, rutas que pasan) y aristas (margen predicho, RSSI medido, probabilidad de enlace).

Para fijar la variante de radio o el gateway, edita `LinkParams` o la llamada `run(...)` en `diagnostico_elburgo.py`. Por ejemplo, RR estándar y NCU como gateway:

```python
run("coords.csv", "rssi.csv", "salida.geojson",
    gateway="NCU_01", p=LinkParams(ptx_dbm=8.0))
```

---

## 7. Datos reales tipo El Burgo (routes + log)

Si en vez de RSSI por enlace tienes el RSSI por nodo (`zigbee_log.csv`) y la tabla de rutas (`zigbee_routes.csv`), usa el adaptador: deriva el RSSI por enlace cruzando cada nodo con su padre en la ruta, y de paso construye la topología observada.

```bash
python3 adaptador_elburgo.py coords.csv zigbee_routes.csv zigbee_log.csv elburgo_real
```

Genera `elburgo_real_rssi.csv` (por enlace, listo para `diagnostico_elburgo.py`), `elburgo_real.geojson` (topología observada con SPOF y dominadores) y un informe en pantalla: comprobación de la semántica del RSSI, sesgo / sigma / n_eff de la calibración, dominadores y enlaces más débiles.

Estos dos artefactos van incluidos en el repo como ejemplo real (El Burgo I, NCU-1 este, 49 enlaces, calibración bias −33,63 dB / sigma 6,82 dB).

---

## 8. Formato de los datos

**`elburgo_real_rssi.csv`** (una fila por enlace dirigido):

```
origen,destino,rssi_dbm
```

**`elburgo_real.geojson`** (FeatureCollection EPSG:4326):
- Nodos `Point` con `id`, `etiqueta` (`1.X.Y`), `role` (TCU/COORD), `is_spof`, `descendientes`, `rutas`, `rssi_med_dbm`, `ack_failures`, `hop_tipico`, `padres_distintos`, `padre_dominante`.
- Aristas `LineString` con `origen`, `destino`, `distancia_m`, `rssi_medido_dbm`, `freq`.
- Cabecera de calibración (`bias_db`, `sigma_db`, `n_eff`, `n_enlaces`) y conteos de snapshots/filas.

---

## 9. Publicar en GitHub Pages

1. Crea el repo en la cuenta `imoriana3` (p.ej. `cobertura-rf-fv`) y sube el contenido.
2. Settings → Pages → Deploy from branch → `main` / `/ (root)`.
3. La herramienta queda en `https://imoriana3.github.io/cobertura-rf-fv/`.

(`index.html` está en la raíz, así que Pages lo sirve directamente.)

---

## 10. Supuestos y límites

El render asume un plano de módulos por fila, suelo plano y dipolo vertical (el látigo cuelga hacia abajo, pero al ser el eje vertical radia de costado: nulos arriba y abajo, máximo en horizontal). El bloqueo del enlace en el render se modela con la fila intermedia en el punto medio; el núcleo Python encadena todas las filas reales del salto (Deygout). No incluye curvatura terrestre (despreciable < 1 km) ni dispersión por vegetación.

Un módulo difracta poco a 2,4 GHz: la onda bordea el borde y el vidrio es casi transparente; bloquean de verdad el marco de aluminio, el tubo de acero y la metalización de las células. Por eso los saltos cortos aguantan aunque estén apantallados, y los fallos de malla aparecen en los saltos largos que cruzan muchas filas. Los valores absolutos dependen de la calibración: hasta tener el dataset completo de El Burgo I, el driver ajusta un sesgo global contra el RSSI medido.

---

## 11. Relación con "Cobertura Zigbee · El Burgo"

Son complementarios. **Cobertura Zigbee** mide y visualiza la malla **ya desplegada** (recolectores PowerShell + visor Leaflet sobre satélite). **Cobertura RF** es el **modelo físico**: predice el margen de cada enlace antes de instalar (siting) y, cruzando predicho vs. medido, diagnostica la malla real y localiza el punto único de fallo. El GeoJSON que produce el diagnóstico se puede cargar en el visor de Cobertura Zigbee como modo de coloreado predicho / SPOF.
