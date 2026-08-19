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

## Las cuatro estrategias

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

## Cómo corre

La ficha no reimplementa nada: pide `POST /windstow` al motor y dibuja lo que vuelve. El motor
resuelve la POA con `compute_tracker_poa_v2` (pvlib singleaxis + lazo de control + transposición de
Perez + sombreado entre filas) y el abanderamiento con la máquina de estados canónica; la
contabilidad de episodios y horas vive en `solargpt_core/wind_stow_report.py`.

Arrancar el motor, de las dos formas de siempre:

- **Colab** — cuaderno `Factiun_plataforma.ipynb` → *Ejecutar todo*, y pegar la URL del túnel en el
  indicador del motor de la ficha.
- **En tu máquina** — `cd server && ./run.sh` (escucha en `127.0.0.1:8765`).

Sin motor la ficha no simula y lo dice: reimplementar las estrategias en JS sería una segunda verdad
sobre la misma física, que es justo lo que la plataforma evita.
