# Meteo FACTIUN · análisis de mediciones reales de Supabase

## Dónde se utiliza

Misma tarjeta existente `meteo.html`, sección **Mediciones reales · sensores de nuestras plantas**.
No crear una tarjeta independiente. Se mantienen separados los datos medidos de los datos
estimados y sintéticos de PVGIS, NASA, Open-Meteo, TMY y simuladores.

## Origen comprobado

Proyecto Supabase actual: `icqiwmbbeoeswbcbgflc`. Fuente interna:
`public.telemetria` con RLS autenticada. CSV originales comprimidos en el bucket
**privado** `logs-ncu` de Storage. El navegador no accede a los CSV privados; consulta
las series de resolución minutal ya guardadas en `telemetria.series = { t:[], v:{} }`
mediante sesión autenticada de Supabase y clave publicable, nunca `service_role`.

Ningún dato de sensores se publica en GitHub.

## Inventario de El Burgo I verificado el 17/10/2026

| Origen / identidad | Días únicos | Filas del CSV original, tras deduplicar | Instantes minutales | Primera / última fecha |
|---|---:|---:|---:|---|
| NCU1 / HSU 230 | 113 | 1.896.214 | 161.148 | 26/05–08/10/2026 |
| NCU1 / HSU 231 | 118 | 1.992.870 | 168.643 | 26/05–13/10/2026 |
| NCU2 / HSU 230 | 3 | 41.451 | 4.124 | 06/10–08/10/2026 |
| NCU2 / HSU 231 | 3 | 49.743 | 4.167 | 06/10–08/10/2026 |
| NCU2 / WFU Meteo 210 | 3 | 45.405 | 4.167 | 06/10–08/10/2026 |

**No sumar de forma ciega:** `telemetria` tenía dos versiones del fichero
NCU1/HSU231 de 08/10, con `hash` diferentes (16.496 y 14.667 muestras). En
esta tarjeta se conserva solo la versión más reciente de `subido` para cada
`planta+ncu+clase+equipo+dia`. También existe duplicado de `sensores` NCU1
en esa fecha. Total HSU tras deduplicar = **3.980.278** filas declaradas.
Estas no equivalen a 3.980.278 valores minutales.

**Metrología:**
- HSU: `wind_speed`, `wind_speed_max`, `wind_direction` contienen arrays reales.
  `wind_speed_max` es el máximo entregado por la serie, NO se certifica como racha a 3 s.
- WFU Meteo 210: `irradiance` contiene arrays solo los días 06–08/10/2026;
  la escala es desconocida; datos negativos nocturnos se conservan para QA.
  No afirmar W/m², ni GHI, ni piranómetro calibrado sin hoja de registro y conversión.
- HSU y NCU/SENSORES tienen `irradiance=0` como escalar de esquema:
  no son muestras medidas de cero. `snow_level` / `snow_alarm` también son
  escalares en los días revisados: no existe serie temporal real de nieve accesible
  en estos registros, aunque la ficha de planta indica un sensor de nieve.
- `NCU/SENSORES` aporta principalmente `internal_temp` y placeholders;
  no equivale a una serie de piranómetro. No se mezclan temperaturas internas
  con ambientales.

## Funcionalidades entregadas en rama

- Iniciar sesión con credenciales Supabase existentes; sin contraseñas en código.
  Son las de **Factiun Cartera** (usuario del proyecto, correo y contraseña), no la
  cuenta de GitHub con la que se administra supabase.com: los rótulos y el mensaje de
  contraseña errónea lo dicen así desde el 12/11/2026.
- Planta, fechas, selección de magnitudes y tolerancia de alineación. Con la sesión
  iniciada, **«Planta» es un desplegable con las plantas que tienen medidas en la base**:
  si el proyecto abierto en el Panel no tiene, se dice y se pide elegir una (no se carga
  otra a escondidas); al elegir se indican las fechas con medidas. El estado de la carga
  sale bajo «Cargar y comparar»; el de la sesión, en su tarjeta.
- Lectura paginada con rango por defecto de los últimos siete días disponibles.
- Datos multi-archivo, deduplicación y exclusión de placeholders.
- Estadísticas por equipo: mín, máx, media, P95, lagunas, muestras y series.
- Comparación entre pares: sesgo, error absoluto medio, diferencia relativa y
  correlación. Viento-dirección usa medias y errores angulares circulares.
- Irradiancia raw sin transformación de unidades, integración energética **ni comparación directa entre dispositivos** sin confirmar escala.
- Informe JSON de análisis y CSV local alternativo si no hay sesión Supabase.
- Mantiene segregados los históricos privados y los modelos meteorológicos.

## Lógica de viento · simulación pre-stow / stow (12/11/2026)

Tarjeta **«Lógica de viento · simulación pre-stow / stow sobre las HSU»**, en la misma
sección y pestaña (Mediciones). Responde a una pregunta de diseño de control: con el
viento que midieron las HSU, **cuántas veces saltaría cada alarma, en qué posición
pillaría al seguidor y cuántos grados tendría que mover**.

Es una **simulación de cómo funcionaría la lógica, no un estudio de cómo funcionó la
planta**:

- el viento es **medido**: máximo por minuto (`wind_speed_max`) de las HSU, tomando en
  cada minuto el mayor de las HSU de una misma NCU;
- la posición del seguidor es **teórica**: seguimiento astronómico de un eje N-S con
  backtracking sobre terreno plano (pitch y ancho de módulo editables), noche en la
  posición de noche. **No se lee ninguna TCU.**

### De dónde sale el viento: todo el histórico, sin tope de fechas

La simulación **no depende del periodo cargado arriba**. En «Más parámetros» se elige:

- **Todo el histórico de la base** (por defecto cuando las medidas vienen de Supabase).
  La tarjeta pide a `telemetria` únicamente el eje de tiempos y `wind_speed_max` de las
  filas `hsu` de la planta —`fetchSupabaseWindPeak`, en `lib/meteo-supabase.js`— y las
  va volcando página a página en 1.440 valores por sensor y día
  (`createWindSeriesBuilder`). No se convierten en lecturas sueltas, así que **no hay
  tope de días**: un año o tres se simulan de una vez. «Desde» y «Hasta» son
  opcionales, para acotar.
- **Solo las medidas cargadas arriba**: lo que haya en memoria (un CSV, o el periodo
  cargado de la base).

El cargador general de la sección (`fetchSupabaseMeteo`, todas las magnitudes) conserva
su tope de 370 días: ese sí monta cada lectura en memoria.

Cómo se recorre la base, y por qué:

- **Por fecha** (`dia` mayor que el último día completo), no por desplazamiento: con
  `range(offset)` la base vuelve a abrir el JSON de todo lo anterior en cada página.
  El último día de una página llena se descarta y se vuelve a pedir entero.
- **80 HSU-día por página.** Medido el 12/11/2026 en la base de Factiun: abrir el JSON
  de un HSU-día cuesta entre 10 y 30 ms y el rol `authenticated` corta a los 8 s. Si la
  base corta por tiempo, se repite con media página.
- Mismas reglas que el lector general: una reimportación sustituye a la anterior y
  nunca se suma; sin UTC no entra; un escalar es un hueco de esquema.

**Sin contrastar con una sesión real**: la selección parcial del JSON
(`t:series->t,vmax:series->v->wind_speed_max`) está probada como SQL contra la base,
pero no a través de la API con un usuario autenticado. Si la API la rechazara, la
tarjeta pide la serie entera en páginas pequeñas: mismo resultado, más lento.

### La lógica simulada

| Parámetro | Valor por defecto |
|---|---|
| Pre-stow: racha mayor de | 40 km/h → rango de operación limitado a 30°–55° E/O |
| Stow: racha mayor de | 60 km/h → 55° E u O, el lado más cercano a la posición del seguidor |
| Desactivación | 30 min después de la última lectura sobre umbral |
| Noche | 5° E; cualquier alarma de noche hace un único movimiento a 55° E, sin vuelta |
| Geometría | pitch 6 m, módulo de 2,382 m en el giro (GCR 0,397), ±55° |

Una **activación** es el salto de la alarma: dura hasta 30 min después de la última
lectura sobre umbral, y una lectura posterior es otra activación. De cada una se da el
instante, la racha al cruzar, el pico del evento, la posición inicial, la posición
objetivo y los grados a mover (0° si ya está en posición).

### Lo que la lógica no define, a la vista

Dos huecos de la especificación se resuelven con un desplegable, no a escondidas:

- **Pre-stow al cruzar el mediodía solar** — «mantiene el lado en el mínimo» (por
  defecto) o «sigue al sol y cruza por horizontal».
- **Alarma activa al anochecer** — «va a stow Este» (por defecto: si el seguidor está
  al Oeste llega cruzando por horizontal con la alarma activa, y la tarjeta cuenta
  cuántas noches pasa) o «se queda donde está».

La velocidad de giro es opcional: vacía, el seguidor está siempre en la posición que
le marca la lógica; con un valor, una alarma puede pillarlo a medio camino.

### Calidad del dato

- **Sin dato no hay alarma**: los huecos no se rellenan y se cuentan.
- **Sensores a cero**: una racha de lecturas exactamente a cero no es calma, es un
  anemómetro mudo. Se declara, y lo que salte justo después se marca **dudoso** (puede
  ser la vuelta del dato y no una racha nueva).
- El log muestrea cada pocos segundos y la lógica habla de lecturas de 1 s: el
  recuento es un **suelo**.
- Con datos más espaciados que medio rearme el resultado es orientativo y se avisa.

### Salidas

Cortas a propósito, para que se lean de un vistazo:

- **Resumen**, una fila por alarma: veces que salta, en cuántas no hay que mover el
  seguidor, en cuántas sí y cuánto (de día y de noche).
- **Recuento por racha máxima**, en una línea.
- **Activaciones por semana**.
- **Lista completa**, plegada, con filtro; y su **CSV** (separador «;», coma decimal,
  hora UTC y hora local de la planta).
- **Informe** de una página, imprimible a PDF: el resumen, la gráfica, las reglas como
  fórmulas (condición, posición y grados a mover, con los valores simulados) y las
  notas. No lleva la lista de activaciones ni explica el cálculo en prosa.

Los parámetros de detalle (origen y periodo de los datos, posiciones, geometría,
coordenadas y los dos supuestos) van plegados en «Más parámetros».

Ningún resultado de planta se guarda en el repositorio: la simulación corre en el
navegador sobre el viento de la sesión y se descarta al cerrarla.

### Motor y pruebas

`lib/meteo-wind-logic.js` — módulo puro, sin DOM, sin red y sin importaciones; la
posición solar se inyecta (`solarPosition` de `lib/meteo-browser.js`).

- `node tests/test_meteo_logica_viento.js` — 36 verificaciones del motor con series
  sintéticas y del lector de histórico con una base de mentira (450 días sin tope,
  avance por fecha, un día que llena la página, corte por tiempo, repliegue).
- `node tests/test_meteo_logica_viento_browser.js` — 23 comprobaciones de la tarjeta
  en Chromium con Supabase simulado; arriba se carga un solo día en calma y la
  simulación sale del histórico entero.

Careo externo (no versionado, con medidas reales de una planta): el motor reproduce,
activación por activación, una simulación independiente hecha en Python con pvlib
sobre los mismos eventos; la mayor diferencia de ángulo es 0,6°, por el algoritmo de
posición solar.

## Seguridad y limitaciones

La RLS vigente de `telemetria` permite `SELECT` a usuarios autenticados.
Esta funcionalidad no amplía permisos ni publica nuevas políticas. La sesión
de Supabase reside en el almacenamiento del navegador; cerrar sesión descarta
las lecturas de la memoria de la tarjeta.

Pendiente de contrastar en navegador autenticado: inicio de sesión desde GitHub
Pages, alcance de la CORS/API de Supabase, carga del histórico completo y
calibración de WFU. No integrar `irradiance` en kWh/m² ni alimentar control
STOW sin validar la escala y la autoridad de la señal.

## Pruebas

`node tests/test_meteo_sensores_reales.js` (sin conexión a base de datos).

Se debe comprobar adicionalmente el flujo autenticado real antes de fusionar.
No se modifica ninguna fila en Supabase ni se abre RLS a `anon`.

## Verificación de pantalla completa

`node tests/test_meteo_sensores_browser.js` usa Chromium y Supabase simulado (sin credenciales). Comprueba inicio de sesión, rechazo de contraseña, lectura HSU/WFU, estadísticas, comparación entre equipos, exclusión de irradiancia raw en coherencia y limpieza al cerrar sesión. La prueba no puede acreditar una cuenta autenticada real en Supabase.
