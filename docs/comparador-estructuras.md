# Comparador de estructuras

> ¿Fija o seguidor **en este sitio**? La ficha simula varias estructuras sobre la misma meteo y las
> pone en la misma tabla, por m² de módulo y por m² de suelo.

**Abre y calcula**: `comparador-estructuras.html` en este repo, sin levantar nada.
El motor SolarGPT es opcional y da el número canónico.

---

## Qué pregunta contesta, y cuál no

Hay dos preguntas parecidas que se confunden todo el rato:

| Pregunta | Dónde se contesta |
|---|---|
| «¿Qué **estructura** monto en este sitio?» | **aquí** |
| «¿Cuánto me cuesta el **control real** del seguidor?» (abanderamiento, banda muerta, TCU) | ficha [Viento](sim-viento.html), y §03.04b del cuaderno |
| «¿Y con el **CAPEX** dentro?» | §06.27 del cuaderno (decisor multicriterio) |

Esta ficha es **irradiación**: kWh/m², no kWh de energía AC ni euros. Dos plantas con la misma POA
pueden producir distinto (módulo, térmico, inversor, pérdidas) y costar muy distinto.

## El catálogo

| Estructura | Qué es |
|---|---|
| **Fija · tilt óptimo** | Monoinclinada al ecuador; el tilt sale de un barrido anual sobre la meteo del sitio |
| **Fija · tilt de proyecto** | La misma, con el tilt y el azimut que se teclean |
| **Fija · Este-Oeste** | Dos aguas, media de los dos planos (misma superficie de módulo cada uno) |
| **Tracker N-S · backtracking** | HSAT canónico: eje horizontal norte-sur, backtracking activo |
| **Tracker N-S · sin backtracking** | Seguimiento astronómico puro: apunta mejor y se da sombra |
| **Tracker de eje inclinado (TSAT)** | Eje norte-sur inclinado hacia el ecuador |

Son las mismas claves y las mismas etiquetas que `solargpt_core.structure_compare.CATALOGO`, y el
careo lo comprueba: si el core añade una y la ficha no, el test se pone rojo.

## El tamaño de la estructura

Se configura igual que en el cuaderno y en Streamlit, y con **las mismas fórmulas**: la tarjeta
**Colector** es el puerto literal de `solargpt_core.layout_engine.compute_size_from_mods`, la misma
función que dimensiona los trackers del layout de planta (§03.F, §03.T0 y la página 6 del
Streamlit). Si la ficha se inventara una fórmula propia, el layout y la ficha dejarían de hablar
del mismo tracker.

| Entrada | Qué es |
|---|---|
| **Módulo · largo / ancho** | Cotas del módulo (2,382 × 1,134 m por defecto — el canónico) |
| **Mesa** | `1V…4V` / `1H…4H`: módulos en cross-axis y su orientación (V = vertical, H = horizontal) |
| **Módulos por string** | Módulos **por string**, no por estructura entera |
| **Strings por fila** | 2 por defecto: uno a cada lado del motor |
| **Gap entre módulos** · **Gap del motor** | Los dos huecos de la fórmula del cliente |
| **Disposición** | Monofila (1 fila por tracker) o bifila (2 filas que comparten motor) |

De ahí salen, y se publican en pantalla:

```
apertura       = n × módulo                        (SIN gaps)   → manda en el GCR
alto colector  = apertura + (n−1) × gap_módulos    (CON gaps)   → manda en el sombreado
largo de fila  = total_mods × módulo_along + intra_gaps × gap_mod + motor_gaps × gap_motor
GCR            = apertura / pitch
```

Tres cosas que conviene no perder de vista, porque están así en su código:

* **La apertura y el alto de colector NO son lo mismo.** El GCR sale de la apertura —§03.T0:
  «GCR = aperture/pitch»— y el sombreado entre filas del alto de colector, que es lo que
  físicamente tapa e incluye los gaps. Con `1V` (el default) coinciden; a partir de `2V` se
  separan, y la ficha publica los dos en vez de elegir uno a escondidas.
* **Monofila / bifila es una diferencia OPERATIVA, no geométrica** (`layout_v2`, auditoría
  2026-05-18): la mesa mide lo mismo en los dos casos, así que **la POA por m² de módulo no
  cambia**. Lo que cambia es cuántas filas son «un tracker» para el layout y el mantenimiento —
  y por eso el contador de módulos por tracker sí se dobla.
* **`Módulos por string` es por string**, no por estructura: la fila lleva 2 strings con el motor
  en medio. Es la convención del cliente: `MESA = ancho × N + (N−1) × gap` y
  `FILA = 2 × MESA + gap_motor`.

La escena 3D dibuja el bloque **a ese tamaño**: el largo de fila y el alto de colector que salen de
aquí, no las cotas por defecto del modelo. Si no, la escena enseñaría una estructura y la tabla
calcularía otra.

El careo lo vigila con las cifras del core: `1V → 65,084 m de fila y 2,382 m de apertura`,
`2H → 134,972 m y 2,268 m`, y que bifila no mueva la mesa pero sí doble los módulos.

## Qué hace legítima la comparación

1. **Misma meteo, mismo albedo, mismo motor.** Se eligen una vez y valen para todas las filas.
2. **Mismo suelo, por defecto.** Todas comparten GCR —y por tanto pitch, que sale de
   `ancho / GCR`—. Comparar una fija a GCR 0,50 contra un seguidor a 0,35 no dice qué estructura es
   mejor: dice qué densidad se eligió. El desplegable **Uso del suelo** levanta esa restricción a
   propósito (cada tipo con su densidad de mercado) para hacer la *otra* pregunta, la de la parcela.
3. **Los seguidores van en modo IDEAL**: sin abanderamiento, sin night latch, sin banda muerta ni
   velocidad de giro, sin política de difusa. Es la misma receta que `run_tracker_ideal` del core.
   Mezclar el control aquí escondería el efecto de la estructura detrás del de la estrategia.
4. **Dos denominadores.** `POA módulo` es lo que ve el panel; `POA suelo` = POA × GCR es lo que ve
   la parcela. A GCR común el segundo es el primero escalado y no reordena nada; con densidades
   reales el ganador **puede darse la vuelta** —la fija se monta más apretada, así que por hectárea
   recorta la ventaja del seguidor—.

## Lo que NO se modela, y va dicho en pantalla

* La **fija Este-Oeste** corre **sin sombreado entre filas**: el modelo de fila 1D supone todas las
  filas igual orientadas y no vale para aguas enfrentadas. Su POA es un techo, no un número
  comparable al pie de la letra con las demás. Sale como aviso en la propia ficha.
* El **tilt óptimo** del navegador se barre CON sombra (es el óptimo neto); el del cuaderno sale de
  un barrido de transposición sin sombra y queda 1-3° por encima. También sale como aviso.
* No hay bifacialidad, ni suciedad, ni terreno: campo plano y monofacial.

## La escena 3D

Un bloque por estructura, **todos al mismo sol y sobre el mismo suelo**, con tres filas al pitch
real de cada una. Es la otra mitad de la tabla: los números dicen cuánta POA pierde cada
estructura y la escena dice **por qué**.

Lo que se ve moviendo el deslizador de la hora (y la fecha):

* el seguidor **abriendo el ángulo al amanecer** para no taparse — y el que no lleva backtracking
  clavado en el tope de ±55° con las filas de delante sombreando a las de detrás. En Sevilla, el
  21 de diciembre a las 08:20: 22,6° contra 55,0°. Esa imagen es la columna «pérdida sombra».
* la fija quieta mientras el seguidor gira, y las **dos aguas** mirando a lados opuestos;
* el **eje inclinado** subiendo hacia el ecuador.

Los ángulos **no se inventan en el render**: salen de las mismas funciones que calculan la tabla
(`FIS.psTracker` / `psFija` / `psTSAT` + `FIS.theta`). Si la escena y la tabla se contradijeran, una
de las dos estaría mintiendo — hay un test que compara el tilt dibujado con el de la tabla.

La estética es la de la casa (overcast · bt3d · sim-viento), y no de oído: cúpula de cielo con
degradado por altura que se repinta con la elevación del sol, doble suelo (uno de trabajo que
recibe sombras y uno de horizonte que llega hasta la cúpula) cosidos con **niebla del color del
horizonte** —sin ella el suelo acaba en una línea recta y los bloques parecen estar sobre una mesa
flotando en el vacío—, y el sol como sprite con halo dimensionado con la escena. El seguidor es el
modelo **real** de `seguidor.js`, el mismo que pintan el Gemelo Digital y la Cobertura 3D.

### Tres cosas que hubo que dimensionar con la escena, no a ojo

1. **El frustum de sombra.** Una luz direccional de three.js trae una cámara ortográfica de ±5 m:
   a escala de planta la sombra sencillamente **no se dibuja en ningún sitio**. Y esta ficha
   existe en buena parte para enseñar la sombra entre filas.
2. **El encuadre.** La fórmula «distancia = medio ancho / tan(fov/2)» encuadra un objeto plano;
   aquí los bloques tienen profundidad y los rótulos sobresalen. Medido, se pasaba un **26 %** y
   cortaba los bloques de los extremos. Ahora `encuadra()` proyecta la caja del mundo a
   coordenadas de pantalla y corrige la distancia hasta que cabe, con dos bloques o con seis.
3. **El hueco entre bloques** (16 m). De él sale la elevación a la que se apagan las sombras
   —una sombra mide `altura / tan(elev)`, así que por debajo de cierta altura cruza al bloque
   vecino y contamina la comparación—. Con 10 m se apagaban a 13°, justo por encima del amanecer
   de invierno que la escena existe para enseñar; con 16 m aguantan hasta 8,5°.

### El error que cazó el test del 3D

El primer render tenía el **signo de la basculación cambiado**: por la mañana los seguidores se
tumbaban al **oeste**, con el sol al este — 106° de ángulo de incidencia, apuntando justo al lado
contrario. A mediodía no se notaba nada, porque θ≈0. Por eso `tests/test_comparador_3d.js` mide la
normal del panel **a las 8 y a las 17**, y no solo al mediodía.

## Los dos motores

La ficha calcula **en el navegador** para poder abrirse en el Panel sin depender de que alguien
levante un Python. Eso abre la puerta a la segunda verdad —dos motores que dicen cosas distintas y
nadie mirando—, y la puerta se cierra con un careo automático.

| | navegador | motor SolarGPT |
|---|---|---|
| posición solar | declinación + ecuación del tiempo | pvlib |
| seguimiento | backtracking Anderson-Mikofski | pvlib `singleaxis` |
| sombra entre filas | geométrica exacta en el plano ⊥ al eje | `pvlib.shading.shaded_fraction1d` |
| transposición | **Hay-Davies** (circunsolar + fondo isotrópico) | **Perez** `allsitescomposite1990` |
| IAM | no | sí (Fresnel) |

**Careo medido** (`node tests/test_comparador.js`, doce días típicos en Sevilla): la POA absoluta
queda dentro del **0,8–2,2 %** del canónico, los Δ% contra la referencia dentro de **1,4 pp**, y el
**orden entre estructuras es el mismo**. Eso último es lo que importa: la ficha existe para
ordenar, no para dar un anual bancable — para el anual, el número canónico.

> El circunsolar **no** estaba al principio: la difusa iba isotrópica y el careo lo tumbó. Con
> isotrópica el seguidor *sin* backtracking perdía contra el que backtrackea, y con Perez gana,
> porque apuntar mejor cobra el halo del sol. Estaban a 1,1 % y el modelo no los distinguía: el
> orden salía cambiado justo en el par que más se parece. Con Hay-Davies dentro, los dos motores
> ordenan igual. Es el ejemplo de para qué sirve el careo.

### Conectar el motor

1. **Colab** (lo normal): abre `Factiun_plataforma.ipynb` → *Entorno de ejecución* → *Ejecutar
   todo*; al final imprime una URL `https://…trycloudflare.com`. Clic en el indicador **«motor»**
   de la barra y pégala. (La URL cambia en cada reejecución.)
2. **En tu máquina**: `cd server && ./run.sh` en el repo del motor — escucha en `127.0.0.1:8765` y
   la ficha lo encuentra sola.

El endpoint es `POST /structures` y se anuncia en `/health`. Si el motor está pero es antiguo y no
lo trae, la ficha lo dice en el indicador y deja la opción deshabilitada en vez de fallar al pulsar.

## La trampa del eje inclinado

Un seguidor de eje inclinado (TSAT) sube el eje **hacia el ecuador**. La forma natural de pedírselo
a pvlib es `axis_tilt=+10, axis_azimuth=180`, y ahí está la trampa: `compute_tracker_poa_v2` del
core **auto-corrige** todo azimut de eje entre 135° y 225° restándole 180°. Para un eje
**horizontal** es correcto (norte-sur es norte-sur y solo cambia el signo del giro); para uno
**inclinado** lo tumba al lado contrario, el TSAT acaba mirando al norte y rinde **menos** que el
horizontal —medido: −8,5 % en Sevilla, cuando debe ganar ~+6 %—.

El core lo esquiva sin tocar el motor, con `axis_tilt` **negativo** y azimut 0, que es
geométricamente idéntico. La ficha no tiene auto-corrección que esquivar, pero elige el sentido
igual y el test lo vigila con un **mutante**: si se invierte el sentido del eje, el TSAT tiene que
dejar de ganar. Un guard que nunca se pone rojo es decoración.

## Pruebas

```bash
node tests/test_comparador.js       # 27 comprobaciones · careo contra el core, sin navegador
python3 -m http.server 8099         # (en otra terminal, para el 3D)
node tests/test_comparador_3d.js    # 31 comprobaciones · la escena en un Chromium de verdad
```

El test **extrae el bloque `FÍSICA PURA` del HTML real**, no una copia: una copia se quedaría
careando una versión vieja mientras la ficha evoluciona. Alimenta al motor del navegador con la
misma meteo que corrió el core (`tests/careo-estructuras.json`) y compara orden, Δ% y magnitudes,
más las señales de que la física está viva (el backtracking quita la sombra, el eje inclinado gana,
la fija apunta al ecuador también en el hemisferio sur).

Para regenerar el fixture tras un cambio en el core:

```bash
python3 tests/gen_careo_estructuras.py --core /ruta/a/SolarGPTfull/solargpt
```

## Origen

Sale de **§03.04c** del cuaderno canónico (`SolarGPT_physics_canonical.ipynb`) y de
`solargpt_core/structure_compare.py`, que es donde vive la verdad. Las tres superficies —cuaderno,
página 11 de Streamlit y esta ficha— llaman al mismo entry point cuando hay motor.
