# Los valores del §19 · decisión de ingeniería de Factiun

> **3 de octubre de 2026.** El §19 del Rev01.4 lista 17 parámetros configurables y
> deja 14 en «SIN VALOR». **Eso no es un olvido del informe, es su política**, y
> este documento no la cambia: la tabla del core sigue diciendo lo que dice. Lo que
> hay aquí es otra capa —la de quien decide operar—, con la **regla** con la que se
> eligió cada número, para que mañana se pueda discutir la regla y no sólo la cifra.

## Lo primero, porque importa más que los valores

De los diez que seguían nulos, **hoy nueve no los lee ninguna máquina.** En el core
son campos opcionales declarados; en la ficha no entran en ningún criterio. Sólo
`n_retry` se consume de verdad (la máquina de ejecución lo exige y topa los
reintentos con él).

O sea que publicar estos valores **no cambia ni una transición**, y eso no se afirma
de palabra: `tests/test_granizo_traza.mjs` carea la traza completa —estados,
transiciones y diario— con y sin ellos, sobre los nueve casos del core **más tres
sondas pegadas a los umbrales**. Las sondas están ahí porque los casos del core no
bastaban: su único valor de granizo es 1,6 cm contra un umbral de 1,0, y con ese 60 %
de holgura un acoplamiento que moviera un umbral un 50 % pasaba desapercibido. Se
midió con un mutante y se corrigió.

## Los cinco decididos

| Parámetro | § | Dueño | Valor | Regla |
|---|---|---|---|---|
| `frecuencia_consulta_s` | §7 | Software | **300 s** | Nunca más lento que la mitad del margen más estrecho de la estrategia (30 min → ≤900 s). 300 s acota a 5 min el retraso en **descubrir** una pasada nueva, que el modelo no anuncia: consultar al ritmo del refresco puede dejar el dato nuevo dormido casi una hora. |
| `timeout_api_s` | §12 | Software | **30 s** | ≤1/10 del periodo de consulta, y el presupuesto de reintentos cabe en un ciclo. ~15× la respuesta normal de una API meteo, así que no salta por jitter. **Encadena con `regla_datos_ausentes=conservador`: un timeout escala protección, no es neutro.** |
| `edad_max_dato_s` | §6.5 | Software+Meteo | **5.400 s** *(provisional)* | 1,5 × refresco del modelo. El suelo lo fija el refresco y no el gusto: con «sin dato» en conservador, una caducidad corta deja la planta **en defensa permanente** — no es prudencia, es perder el año. |
| `buffer_espacial_km` | §8.3 | Software+Meteo | **48 km** | Se adopta VDE (48 km preventivo / 8 km directo). |
| `horizonte_vigilancia_h` | §7 | Meteo | **6 h** *(provisional)* | Suelo calculado con la propia estrategia: 60 min de decisión + 10,8 min de maniobra + 15 min de margen ≈ 1,5 h; por debajo, el horizonte no cubre su propia maniobra. El techo lo fija el error con la antelación, que es propiedad del producto —por eso el §19 pone de dueño a Meteo—. 6 h es 4× el suelo. |

### Una contradicción que hay que llevar a la reunión, no esconder

`edad_max_dato_s` tiene **suelo** por el refresco del modelo y **techo** por el
margen de decisión. Si el producto de granizo refresca cada hora, el suelo (5.400 s)
**supera** al techo (1.800 s, la rama de 30 minutos) y **no existe valor válido**.
Significa que, con producto horario, esa rama se decide con dato de hasta una hora.
Es la misma forma del asunto del intervalo: **un producto grueso no resuelve una
frontera fina.** Las salidas honestas son dos: aceptarlo y declararlo, o exigir un
producto más rápido.

### Y una equivalencia que valida la estrategia del email

| | a 40 km/h | a 48 km/h | a 60 km/h |
|---|---|---|---|
| **48 km** (preventivo VDE) | 72 min | **60 min** | 48 min |
| **8 km** (directo VDE) | 12 min | **10 min** | 8 min |

El recorrido completo de extremo a extremo son 110° que a 0,17 °/s dan **10,8 min**.
O sea que los 48 km de VDE son exactamente los **60 min** de `GRZ.hail_min` bajo una
velocidad de célula de 48 km/h, y los 8 km son justo **el tiempo que tarda la
maniobra** — que es por lo que, cerca, se renuncia a cruzar por 0° y se va al extremo
más próximo. Las distancias de VDE y los tiempos del email son **el mismo criterio en
otra unidad**.

**Cuidado con la falsa equivalencia:** esos ~48 km/h son **traslación de célula**,
gobernada por el flujo en altura, y los 40 / 60 km/h de la estrategia son **viento en
superficie a 8 m**. Magnitudes distintas; que los números cuadren es sugerente, no es
prueba, y no debe citarse como si lo fuera. Consecuencia de diseño: el radio es un
**sustituto del tiempo** — si hay ETA de célula, manda el ETA.

## El declarado y no aplicado

`umbral_probabilidad_pct` = **30 %** (VDE), §8-A, dueño Meteo. **Guardado, no
aplicado**, y no por pereza: el campo que existe hoy es probabilidad de **tormenta**
(40 %, en OR con CAPE). Meter el 30 ahí bajaría un umbral sobre una magnitud mucho
más frecuente: **aflojaría** el disparo creyendo apretarlo.

**Regla para cuando llegue P(granizo ≥19 mm):** *sustituye* al umbral de tamaño, **no
se le pone AND**. La frase de VDE —«≥30 % de probabilidad de granizo de al menos
19 mm»— ya lleva el tamaño dentro. Con un AND, un caso con 35 % de escenarios por
encima de 1,9 cm pero mediana por debajo **no** abanderaría, y VDE sí: el AND es más
estricto que VDE y se come los casos de cola, que son los que VDE existe para coger.

**Y hay camino:** el ECMWF-ENS de Meteomatics son 50 escenarios y `ens_select` acepta
miembros individuales, así que **P(≥1,9 cm) la podemos calcular nosotros** como la
fracción de miembros que superan el umbral. No hace falta un producto nuevo: hace
falta saber si `hail` existe sobre modelo de conjunto.

## Los cuatro que se quedan nulos, y por qué cada uno

| Parámetro | § | Dueño | Por qué sigue nulo |
|---|---|---|---|
| `calidad_minima` | §6.5 | Software | **Falta el vocabulario, no el número.** Es el único enum de los 17, y no consta que el proveedor entregue indicador de calidad por muestra; el §19 lo pide sin enumerar valores. Poner `"buena"` sería inventar un enum contra el que alguien escribiría código. |
| `n_retry` | §10.2 | Firmware | **El único de los diez que una máquina lee.** La de ejecución lo exige y topa los reintentos con él. Darle número lo haría correr sobre una cifra inventada, que es justo lo que su negativa a arrancar protege. Pendiente de ensayo. |
| `ventana_recuperacion_s` | §12, §13 | Firmware | Sin ensayo no hay de dónde sacarlo, y no se deduce de la cinemática. |
| `ttl_orden_s` | §13 | Firmware + Electrónica | No lo fijamos, pero **aportamos un suelo** que sale de la cinemática: una orden no puede caducar antes de poder cumplirse, y el recorrido completo son **648 s** (110° / 0,17 °/s). Luego `ttl_orden_s ≥ 648 s`, y se entrega a Firmware como restricción. |

### Mientras `calidad_minima` siga nulo

La admisión de la muestra se apoya en lo que **sí** es comprobable por nosotros: que
el campo exista, que sea numérico, que esté en rango físico y que la edad no pase de
`edad_max_dato_s`. Lo que no pase ese filtro es «sin dato», y «sin dato» ya escala en
conservador por el §8-H. Eso cubre el riesgo real sin fabricar un enum.

## Qué hace falta de quién

- **De Meteomatics** (reunión pendiente): refresco y latencia —fijan
  `edad_max_dato_s`—, error con la antelación —fija `horizonte_vigilancia_h`—, si
  `hail` existe sobre conjunto —habilita el 30 % de VDE— y si hay indicador de
  calidad por muestra —habilita o entierra `calidad_minima`—.
- **De Firmware**: `n_retry`, `ventana_recuperacion_s` y `ttl_orden_s` (con el suelo
  de 648 s ya dado).
- **De Estructuras**: el ángulo de la posición de defensa. El §9.3 se lo asigna a
  ellos y la máquina de amenaza no lo decide — aquí sale la orden y su urgencia.
- **De campo**: `t_necesario_min`. Está puesto a 15,0 **pero es una suposición**, y
  el §9.1 lo declara bloqueante y pendiente de medición. Los 10,8 min calculados lo
  hacen plausible; plausible no es medido.
- **De la planta**: la señal de activación y desactivación del abanderamiento
  (nombre del punto, tipo, nivel o pulso). Es la que convierte esto en algo
  conectable.
