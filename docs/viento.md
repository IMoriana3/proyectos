# Viento & Abanderamiento

*`sim-viento.html` — v1.0, 2026-08-19. Ficha de la plataforma; el cálculo corre en el motor
SolarGPT (`POST /windstow`), no en el navegador.*

## Qué contesta

Un seguidor que se abandera deja de mirar al sol. Eso tiene un precio, y hasta ahora se hablaba de
él en cualitativo. La ficha lo pone en números, para un emplazamiento y un año concretos:

1. **Cuánta POA cuesta** cada estrategia frente al mismo seguidor **sin abanderar** — en kWh/m²·año,
   en % y mes a mes.
2. **Cuántas veces abandera** al año, separando las que se quedan en el sector parcial de las que
   llegan a abanderamiento total.
3. **Cuánto tiempo** se queda así — horas por modo, en % del año y en % de las horas de sol, que es
   donde la producción se pierde.

Y, para que el número se pueda auditar, los **episodios más caros** del año con la traza del peor:
viento contra umbrales, ángulo de seguimiento frente al ejecutado, y la POA de cada uno.

## Las estrategias

Son las canónicas del core (`solargpt_core/wind_stow_strategies.py`), cruzando dos ejes:

| | **1 umbral** (todo o nada) | **2 umbrales** (parcial + total, histéresis 30 min) |
|---|---|---|
| **A** · cara al **viento** | A1 | A2 |
| **B** · cara al **sol** | B1 | B2 |

- **Orientación**: A usa la dirección del viento (de dónde viene) para elegir a qué lado tumbar el
  seguidor; B usa el azimut solar. B es la que lleva la TCU SUNNER (la antigua «estrategia E» es B2).
- **Umbrales**: por defecto 40 km/h (parcial) y 60 km/h (total). Con un solo umbral el seguidor pasa
  de seguimiento a ±55° de golpe; con dos, entra primero en un sector parcial (±30° mínimo) y solo
  se abandera del todo por encima del segundo umbral.
- **Histéresis**: al bajar del umbral, A2/B2 se quedan quietas 30 min (`DESTOW_HOLD`) antes de
  volver a seguir. Evita el pulsado corto cuando la ráfaga oscila justo en el umbral.

La diferencia de POA entre A y B es el resultado que justifica la ficha: **con el mismo viento y los
mismos umbrales, tumbar hacia el sol pierde bastante menos que tumbar hacia el viento**, porque en
media el sector de defensa coincide con el lado del que viene la radiación directa.

### El límite de mediodía (solo B1/B2)

Las estrategias B abanderan «hacia el sol». Cerca del paso por el meridiano eso tiene un problema:
si el seguidor viene **siguiendo hacia el este** y ya está pegado a la horizontal, seguir al sol lo
manda a cruzar por el cero justo en ese instante. La regla del cliente es que **en esa franja se
abandera al oeste**.

En convención del core (θ > 0 = inclinado al este), la franja es θ ∈ [0, +límite], con el límite
configurable y **10° por defecto**; a 0 la regla no existe. Se aplica igual al parcial que al total,
y **solo a B1/B2** — en las A el lado lo manda el viento y la pregunta no se plantea. En la máquina
de dos umbrales el cambio de lado se decide **antes** que el sector y la parada: corregido después,
el parcial habría aparcado en el lado contrario.

Vive en `wind_stow_strategies._noon_flip` y viaja hasta el motor de POA
(`compute_tracker_poa_v2(stow_noon_limit_deg=…)`), el informe anual, `/windstow` y esta ficha. Los
88 casos de la tabla signo × ángulo × límite se carean entre el JS de la ficha y el core.

## El abanderamiento PASIVO

No es una estrategia de control: es una **respuesta mecánica**. En bifila, la fila exterior del
perímetro a barlovento **se desembraga por carga de viento** —no lo manda la TCU, que se entera
después si acaso— y cae a su posición límite. La fila interior, apantallada por la de delante, sigue
en seguimiento **haya el viento que haya**.

Tres cosas que cambian respecto a las otras cuatro:

1. **La planta deja de tener un solo ángulo.** Conviven dos poblaciones —perímetro clavado y resto
   operando— y cualquier número de planta es una media ponderada, no una serie única.
2. **El coste no es una maniobra, es un turno.** La fila soltada se queda ahí hasta que el
   seguimiento vuelve a pasar por ese ángulo: si cae al oeste, hasta el ocaso del mismo día; si cae
   al este, hasta el amanecer siguiente.
3. **No hay destow por histéresis.** Que el viento amaine no la levanta. Lo único que la recoge es
   el reenganche geométrico.

### Cómo se ve en la escena

El bloque del pasivo es el único que se dibuja con **dos poblaciones**, porque es lo que es: la fila
de perímetro cae al límite y se marca como abanderada, y la interior sigue en seguimiento y **no** se
marca. Cada una lleva su rótulo. Con un material compartido las dos brillaban igual y el caso volvía
a parecer un abanderamiento de planta — que es justo lo que no es.

Su cifra de POA es la de la **planta**, no la de la fila suelta: enseñar la de la fila daría una
pérdida del 50 % en una planta de diez trackers.

### El nº de trackers es el denominador, no un adorno

**La fila suelta pierde siempre lo mismo; lo que cambia es entre cuántas filas se reparte.**

| trackers (bifila) | filas | fracción del campo condenada |
|---|---|---|
| 1 | 2 | **50 %** |
| 5 | 10 | 10 % |
| 10 | 20 | **5 %** |
| 40 | 80 | 1,25 % |

Simular esto con un tracker y reportar el resultado como «lo que cuesta el pasivo» multiplica el
impacto por diez frente a una planta de diez trackers, **sin que la física haya cambiado nada**. Por
eso el dato es obligatorio (el motor rechaza el caso sin él), la fracción se **deriva**
(`wind_stow_passive.fraccion_expuesta`) en vez de teclearse, y la ficha da **los dos números**: lo
que pierde la fila sola —que no depende del reparto— y lo que pierde la planta.

El default del módulo es el caso degenerado (1 tracker, 50 %) a propósito: quien no declare trackers
ve el número más pesimista posible en lugar de un 10 % de aspecto razonable.

### Lo que no se modela, dicho

- **La velocidad de suelta es un sustituto declarado de la carga mecánica de desembrague**, no una
  velocidad medida en ensayo. El par real y su dispersión entre unidades no están.
- El tiempo de caída tampoco: la fila pasa al límite en un paso.
- La fila expuesta se supone **siempre la misma y del mismo lado** (dato de proyecto); no rota con el
  rumbo del viento.
- En el motor Python la POA de la fila suelta lleva sombreado de **dos poblaciones** (la vecina que
  le da sombra sigue en seguimiento). El motor del navegador, como el resto de la ficha, transpone
  sin sombreado entre filas.

## Qué es «un abanderamiento»

Una racha continua fuera de seguimiento. El hold de histéresis cuenta **dentro** del episodio: si el
viento baja del umbral diez minutos y vuelve a subir, la máquina no ha regresado a seguimiento y no
son dos abanderamientos, es uno. Es la definición que usa un operador cuando cuenta maniobras, y la
que hace comparable el recuento entre estrategias con y sin histéresis.

## Entradas

- **Emplazamiento**: plantas de la cartera (`factiun_plantas`, el mismo localStorage que el resto de
  fichas) o presets con las coordenadas de los layouts reales. También lat/lon a mano.
- **Meteo**: año horario del motor — Open-Meteo (ERA5), PVGIS horario o NASA POWER. El motor lo
  cachea a disco, así que toquetear umbrales no vuelve a bajar el año.
- **Seguidor**: ángulo máximo, GCR, pitch, azimut del eje y backtracking. Se aplican **igual** a la
  línea base y a cada estrategia: lo único que cambia entre casos es el abanderamiento.
- **Abanderamiento**: los dos umbrales, el ángulo parcial mínimo, y los tiempos de hold y de park.

## Tres cosas que hay que saber leer

- **El viento del reanálisis es a 10 m.** El seguidor está más abajo. La ficha corrige con ley
  potencial 1/7 (`v(h) = v₁₀·(h/10)^0,14`): a 4 m, factor 0,88. Con umbrales de 40 y 60 km/h esa
  diferencia mueve el recuento de episodios, así que el factor aplicado se imprime siempre.
- **Es viento medio, no ráfaga.** ERA5 da media horaria y la TCU dispara con la ráfaga: el recuento
  de abanderamientos que sale aquí es un **suelo**, no un techo.
- **El paso importa.** Con dato horario un episodio solo puede durar 1, 2, 3… horas y la histéresis
  de 30 min se redondea a un paso entero, así que el tiempo abanderado sale al alza — en una prueba
  sintética, 202 h horarias contra 88 h a 15 min. Interpolar a 15 min no inventa ráfagas (el dato
  sigue siendo horario) pero deja que la máquina de estados resuelva sus propios tiempos. Por eso el
  paso por defecto es 15 min y el usado se imprime en la cabecera del resultado.

## El laboratorio de rachas

El año medido contesta «qué pasó». El laboratorio contesta **«qué pasaría si»**: provoca a la
máquina de estados con viento que el año real no trae. Tres capas, y el orden importa.

**1 · Viento de fondo**

| opción | qué es |
|---|---|
| Meteo del emplazamiento | el año descargado, tal cual (lo normal) |
| Sintético · Weibull + AR(1) | el generador canónico del core (`wind_synth`, el mismo que usa la página 🌦️ Meteo de Streamlit y el notebook §04.2f): Weibull(k, A) + AR(1) ρ=0,85 para dar persistencia horaria, modulación diurna ±20 % y estacional ±15 %, y cola ciclónica opcional |
| En calma | cero, para ver una racha aislada sin ruido de fondo |

La persistencia AR(1) no es un adorno: sin autocorrelación los episodios salen troceados en horas
sueltas y se subestima su duración, que es justo lo que cuesta energía.

**2 · Ráfaga de 3 s**

Con el interruptor de ráfaga, la base pasa por el factor de pico de Cook/IEC
(`GUST_PEAK_FACTOR = 3,5`, turbulencia de referencia 0,14). Es lo que dispara de verdad una TCU, y
por eso el recuento que sale del reanálisis a secas es un suelo: en la misma prueba sintética, pasar
de media horaria a ráfaga multiplica por cuatro los episodios.

**3 · Rachas inyectadas**

Cada racha lleva instante, pico en km/h, duración, forma (**gaussiana**, donde la duración es la
anchura a media altura, o **meseta** con rampas del 15 %), dirección y repetición. Hay rachas tipo
servidas por el motor (`GET /windstow/presets`) para no discutir números: racha seca 80 km/h/20 min,
borrasca 100 km/h/3 h, temporal 120 km/h/12 h, y una «justo en el umbral» de 62 km/h que sirve para
ver cómo se comporta la histéresis cuando el viento ronda el disparo. Y un generador de **tormentas
al azar**: N al año, pico y duración por rango, reproducibles por semilla.

Tres cosas que hay que tener claras al leer un resultado del laboratorio:

- Las rachas se superponen **por máximo, no se suman**: pedir 90 km/h da 90 km/h.
- La corrección de altura y la escala se aplican al fondo **antes** de inyectar, así que el pico que
  escribes es el que ve la máquina de estados, no un número que el 0,88 rebaje por la espalda.
- **La dirección viaja con la racha** y manda en los pasos donde la racha domina. Sin ella, A1/A2
  (que abanderan cara al viento) tumban siempre al mismo lado y su comparación con B pierde sentido.

Nada de esto lleva detrás un cambio de irradiancia, de temperatura ni de dirección de fondo: es un
banco de pruebas, no un año meteorológico. La ficha lo dice en pantalla cada vez que el escenario
deja de ser la meteo tal cual, y el motor lo devuelve en `wind.scenario.not_modeled`.

Para probar sin red hay además una meteo de **cielo claro** (pvlib Ineichen con la climatología de
turbidez que trae el paquete): sol sin nubes, temperatura sinusoidal declarada. Sirve para comparar
estrategias entre sí, nunca en absoluto — la POA sale por encima de cualquier año real.

## La escena 3D

Va **la primera** de la columna de resultados y **se ve desde que abres la ficha**, sin simular
nada: antes solo aparecía al terminar un año entero de cálculo, y hasta entonces no había nada que
mirar. Toma de `overcast.html` y `backtracking.html` los tokens de color, las etiquetas en
monoespaciada y el tratamiento de la escena: si allí se afina el lenguaje visual, aquí se copia, no
se inventa otro.

### Dos modos

**En vivo** (el de arranque). El viento sale de los deslizadores —velocidad, dirección, hora y fecha—
y los seguidores reaccionan **ahora**, con su máquina de estados y su velocidad de giro real. Es
para entender la lógica: subes a 45 km/h y ves entrar el parcial, a 65 el total, bajas y ves la
histéresis retener la posición 30 min. La POA de este modo es de **cielo claro** (no hay meteo
detrás): sirve para comparar los casos entre sí en el instante que elijas, no para sacar un número
anual.

**Episodio**. Tras simular, recorre la ventana común del año — un solo viento, un solo sol, un θ por
estrategia — centrada en el episodio más caro. Es la que permite comparar sin trampa: sin ventana
común, cada estrategia enseñaría su peor momento y no el mismo.

El **cielo responde al sol**, como en `backtracking.html`: degradado por altura con el cénit oscuro y
el horizonte encendido, que vira a naranja al alba y al ocaso y se apaga en el crepúsculo; la luz
pierde fuerza y se va al rojo con el sol bajo. El disco solar va como sprite con halo y se dimensiona
con la escena — una esfera de radio fijo a 700 m es un píxel, y sin él la escena no dice ni la hora.

### Qué se dibuja

- **Comparativa** — un bloque por caso con el modelo real del seguidor (`seguidor.js`), su barra de
  POA y el fantasma gris de la línea base. Para mirar de cerca.
- **Planta real** — el layout de verdad (`<planta>_layout.json` del repo `cobertura-zigbee`, servido
  por su GitHub Pages): El Burgo, Ayora, Páramo, Fayón, Bagnarelli, Túnez, San José. Se pinta el
  campo entero con la geometría simplificada a mesa y poste —con 754 o 2.289 seguidores no caben
  mallas sueltas: van en `InstancedMesh`— y se mueve con la estrategia seleccionada. Al cargarla fija
  también lat/lon de la planta. Sin red no hay layout, y la ficha lo dice y cae a la comparativa.

### El tamaño de cada seguidor sale del layout

Las cotas de `seguidor.js` son las de El Burgo: 28 módulos por ala de 1,134 m, 64,73 m de fila.
Dibujar todas las plantas con ellas no es una aproximación —es otra planta—. En Ayora el módulo es
un Risen de 1,303 m y el completo mide **74,758 m**; sus medios miden **37,854**. Con la cota fija,
los completos salían diez metros cortos y **los medios veintisiete de más, metidos dentro del
seguidor de al lado**.

El largo se toma, por orden de calidad del dato:

1. el **medido en el DWG** (`mesa.tipos[bloque].largo`) — Ayora, Fayón y San José lo traen;
2. los **módulos por ala** del layout, con `2·(m·modW+(m−1)·gapMod)+gapDrive` — que reproduce al
   milímetro los `largo` medidos de esas tres, así que no es otra geometría;
3. la **razón de largo** `mr` del propio seguidor;
4. el tipo **«Medio»**, que es como lo declara El Burgo (no trae `mr` ni bloques).

### Bifila: un motor mueve DOS filas

El seguidor canónico es **bífilo**: dos filas separadas el paso entre filas —6 m en El Burgo y
Ayora, 6,25 en Túnez, 5,50 en Bagnarelli— unidas por el eje de transmisión, con **un** motor. Se
dibujaba **una sola**, así que la planta salía con la mitad de filas de las que tiene y el doble de
pasillo entre ellas. Con `filaZ` 0 —Páramo, que es monofila— las dos coinciden y sale una, que es lo
correcto.

El dato sale del layout (`mesa.filaZ`, o `filaZ` en la raíz), no de una lista a mano, y eso corrige
a los otros visores: `overcast.html` tiene Páramo como bifila y Bagnarelli como monofila, y sus
propios layouts dicen lo contrario —el de Bagnarelli con el porqué escrito: *«El layout decía filaZ
0 (una sola fila) y por eso salían monofilares. filaZ = 5,50/2 = 2,75»*.

**El oráculo que cierra tamaño y filas a la vez**: con el largo y el número de filas que se dibujan,
el recuento de módulos tiene que dar el de la cartera. Da exacto en las cuatro plantas que declaran
la cifra — Túnez 1.064, Bagnarelli 1.296, Páramo 18.528 y Fayón 2.112.

Y el visor **comprueba que cabe**: la separación entre seguidores consecutivos del mismo pasillo es
el largo más la calle, así que si lo dibujado la supera, se están metiendo unos dentro de otros. No
se recorta —el dato del layout manda— pero se dice en el rótulo. Medido sobre las siete plantas, el
solape máximo pasa de 26,4 m a 0,3.

| planta | tallas dibujadas (m) | solape antes | ahora |
|---|---|---|---|
| El Burgo | 64,7 · 32,6 | 15,7 m | 0 |
| Ayora | 74,8 · 56,3 · 37,9 | 17,5 m | 0 |
| Páramo | 55,5 · 53,2 | 2,6 m | 0 |
| Fayón | 55,2 · 46,0 | 16,2 m | 0 |
| San José | 74,2 · 39,7 · 38,6 · 37,4 | 26,4 m | 0,3 m |

## El seguidor se mueve a 0,17 °/s

El eje no teletransporta. La ficha aplica el lazo de control canónico —banda muerta de 1° y
**0,17 °/s** de velocidad de giro, los mismos de `tracker.apply_control_loop`— tanto al seguimiento
como a la orden de abanderar. Consecuencia: ir de 0 a ±55° son **5,4 minutos**, y una maniobra
completa desde el ángulo de seguimiento puede pasar de 10. Eso cambia cuánto tiempo pasa el seguidor
fuera de seguimiento y cuánta POA se pierde **durante** la maniobra, no solo al final.

Por eso el paso por defecto de la simulación es **minutal**: con 15 min, la maniobra cabía entera
dentro de un paso y salía como un escalón instantáneo — medido, la misma rampa daba 0 min a paso
cuarto-horario y 10 min a paso minutal. Un año a 1 min son 525.541 pasos y las cuatro estrategias
más la base se resuelven en unos **4 segundos** en el navegador.

## Analizar un emplazamiento

Además de comparar estrategias, la ficha contesta «cómo es este sitio de viento». La tarjeta
**Recurso de viento** sale con cada simulación.

### Rosa de vientos

Horas por sector (16) y por **banda de velocidad**, y las bandas no son decorativas: son los
umbrales de la máquina. Así la rosa no dice solo de dónde sopla — dice **de dónde vienen los
abanderamientos**. Importa porque el sol recorre el este-oeste y el viento no tiene por qué: si el
que dispara la defensa viene del oeste, A (cara al viento) y B (cara al sol) se pelean por la mañana
y coinciden por la tarde, y ahí está casi toda la diferencia entre las dos familias.

### Varios años

Poniendo un rango en *Año · desde / hasta* se descarga el periodo entero de una vez y se corre **año
a año**. Sale la tabla con viento medio, máximo, horas sobre umbral, maniobras, horas abanderado y
Δ POA de cada año, más **media ± σ** y **peor / mejor año**. Es la pregunta que un solo año no puede
contestar: cuánto de lo que ves es el sitio y cuánto es que ese año vino raro. Doce años a paso
cuarto-horario tardan unos 6 s; a paso minutal, del orden de un minuto.

### Viento extremo

Con cinco años o más se ajusta un **Gumbel por momentos sobre los máximos anuales** y se dibuja la
velocidad esperable a 2, 5, 10, 25, 50 y 100 años.

**No es el viento de proyecto, y la ficha lo dice en pantalla.** Sale de reanálisis a 10 m y media
horaria, no de la norma ni de una torre en el sitio: la velocidad básica de Eurocódigo o ASCE lleva
su categoría de terreno, su factor de ráfaga y su periodo de referencia, y esto no los tiene. Sirve
para comparar emplazamientos entre sí y para ver si los umbrales de 40/60 km/h se quedan cortos aquí.

### Con el viento medido de la planta

Un reanálisis no ve el relieve local; la HSU sí, porque está dentro de la planta. Dos vías:

- **CSV de la HSU** — cualquier fichero con fecha, viento y, si lo tiene, dirección y ráfaga.
  Detecta el separador y las unidades (si el p98 pasa de 45 asume km/h) y **no sale del navegador**.
  Si el fichero no trae irradiancia, el sol lo pone el cielo claro y se declara: la ficha compara
  estrategias, y para eso el dato que manda es el viento.
- **SCADA de planta en vivo** — `GET /meteo/history` del repo `scada`, añadido para esto: `/meteo`
  solo daba la última lectura. Se pide la URL del SCADA y las horas.

Con dato de HSU el análisis deja de ser reanálisis y pasa a ser el sitio. Lo que sigue sin ser es un
estudio de cargas: aquí no hay presiones, ni momentos, ni verificación de estructura.

## Quién calcula

**El navegador, por defecto.** Como `bateria.html` del gemelo o `backtracking.html` de cobertura:
se abre y funciona, sin levantar nada. Baja el año de Open-Meteo directamente, resuelve la posición
solar (declinación + ecuación del tiempo), el seguimiento con backtracking (Anderson-Mikofski) y la
POA por transposición **isotrópica**, y aplica las cuatro máquinas de estado, que son el **puerto
exacto** de `solargpt_core.wind_stow_strategies`.

**El motor SolarGPT, si lo tienes.** En el desplegable *Cálculo* aparece la opción *Motor SolarGPT
(canónico)* en cuanto la ficha lo detecta. Ahí la POA sale de `compute_tracker_poa_v2`: Perez,
sombreado entre filas, IAM y lazo de control (banda muerta y velocidad de giro). Arrancarlo:
cuaderno `Factiun_plataforma.ipynb` en Colab → *Ejecutar todo* → pegar la URL del túnel en el
indicador **«motor»** de la barra; o `cd server && ./run.sh` en local.

### El careo, para no tener que fiarse

«Espejo declarado» es una promesa hasta que alguien la mide. El repo lleva **`demo-viento.json`**:
una corrida **real del motor Python**, congelada, con el cuerpo exacto de la petición que la produjo
guardado dentro. El botón *Carear con el motor canónico* la repite en el navegador y pone los dos
números uno al lado del otro. No hace falta tener el motor levantado.

El escenario del careo lleva viento **determinista** a propósito (fondo en calma + doce rachas
inyectadas de distinto pico, duración, forma y lado): sin números aleatorios, las dos
implementaciones ven exactamente la misma serie y lo que quede es física, no azar. Resultado hoy:

| | Motor Python | Navegador |
|---|---|---|
| POA sin abanderar | 2644,5 kWh/m² | 2638,4 kWh/m² (**−0,23 %**) |
| Abanderamientos (A1/A2/B1/B2) | 12 / 12 / 12 / 12 | **idénticos** |
| Horas abanderado | 41,5 / 47,5 h | **idénticas** |
| Δ POA por estrategia | −0,368 … −0,041 % | dentro de **0,04 pp** |

O sea: **las maniobras y el tiempo salen exactos** —las máquinas de estado son las mismas— y la POA
absoluta se separa dos décimas por el modelo de transposición. Que es justo el reparto que uno
querría: la ficha existe para comparar estrategias, y eso es lo que aguanta.

