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

## Igualdad de potencia pico

Arriba del todo, antes que nada, va la **potencia pico de la planta** (MWp). Es el marco de toda la
comparación: comparar por POA por m² contesta «cuál apunta mejor», pero una planta no se proyecta
por m² de módulo — se proyecta por **MWp**, y a igualdad de pico cada estructura pide un número
distinto de estructuras y una parcela distinta.

El pico del **módulo** (Wp) va en cada configurador, no arriba: el pico lo pone el módulo, no la
estructura. De ahí sale todo lo demás:

```
módulos pedidos = MWp × 10⁶ / Wp
filas           = ceil(módulos pedidos / módulos por fila)      ← fila ENTERA, no media mesa
módulos         = filas × módulos por fila
suelo           = filas × pitch × largo de fila
incidente (GWh) = POA (kWh/m²) × m² de módulo / 10⁶
```

Dos cosas que se publican en vez de esconderse: el redondeo a fila entera **sube** el pico
instalado sobre el pedido (10,00 → 10,02 MWp con 660 Wp y 56 módulos por fila), y el suelo es la
**huella del campo** —filas × pitch × largo de fila—, sin viales, sin subestación y sin los
retranqueos de la parcela real.

### La trampa, dicha en voz alta

**El pico dimensiona, no reordena.** Con el mismo módulo en las dos familias, a igualdad de pico
los m² de captación son *idénticos*: el orden por POA de módulo no se mueve ni un decimal y la
energía incidente es la POA escalada por el mismo factor. Lo que cambia —y mucho— es el **suelo** y
**cuántas estructuras** hay que montar. Si las dos familias llevan módulos distintos, la ficha lo
avisa y deja de prometer esa equivalencia.

Sevilla, 10 MWp, módulo de 660 Wp, fija a pitch 4,50 m y tracker a 6,00 m:

| | Estructuras | Suelo | MWp/ha | POA módulo | Incidente |
|---|---|---|---|---|---|
| Fija · tilt óptimo | 271 filas | **7,94 ha** | 1,26 | 2373 kWh/m² | 97,3 GWh/año |
| Tracker N-S · backtracking | 271 filas | 10,58 ha | 0,95 | 2840 kWh/m² | 116,4 GWh/año |
| Tracker de eje inclinado | 271 filas | 10,58 ha | 0,95 | **3011 kWh/m²** | **123,4 GWh/año** |

La fija ocupa un **25 % menos de parcela** para el mismo pico; el TSAT capta un **27 % más** de
energía sobre esos mismos MWp. Ésa es la comparación, y no se puede leer en una sola columna.

## El emplazamiento: buscador, no desplegable

Antes esto era un desplegable con siete presets: para comparar estructuras en un sitio que no fuese
uno de esos siete había que teclear latitud y longitud a mano. Y «¿fija o seguidor **aquí**?» es
justo la pregunta que se hace *antes* de tener proyecto, así que el desplegable estorbaba
precisamente donde más se usa.

Es el mismo buscador que la ficha de Viento, con sus tres caminos y en este orden:

1. la **cartera y los presets**, que se filtran al teclear y funcionan **sin red** — es lo que se
   busca el 90 % de las veces y no puede depender de que haya internet. Filtra por todas las
   palabras en cualquier orden, sin acentos («tunez» encuentra «Túnez») y por código;
2. **coordenadas pegadas** tal cual — `37.3891, -5.9845`, con coma decimal, con `;`, o con N/S/E/O
   (también la **O** de Oeste) —, que es el camino más corto para quien viene de un DWG o de Maps;
3. el **geocodificador de Open-Meteo**, el mismo proveedor del que ya sale la meteo de la ficha, así
   que no añade una dependencia externa nueva ni pide clave.

Si el geocodificador no contesta **se dice en el propio desplegable**: una lista vacía se lee como
«ese sitio no existe» cuando lo que pasa es que no hay red.

Dos detalles que valen más de lo que parecen:

* elegir un sitio **dispara `change`** en latitud y longitud. Poner `.value` a mano no lo dispara, y
  sin eso las lecturas, el sizing y la escena se quedaban en la latitud anterior — con Assú
  (hemisferio **sur**) la fija seguía dibujándose mirando al sur. Hay un test que mide la normal del
  panel después de pegar unas coordenadas del sur.
* tocar la latitud a mano **borra el nombre del sitio**: llamar «Túnez» a unas coordenadas cambiadas
  a mano sería poner nombre de planta a otro emplazamiento.

> De paso queda arreglado algo que estaba mal desde el principio: esta ficha leía la cartera de
> `factiun_cartera` y el resto del Panel la publica en `factiun_plantas`. O sea que el comparador
> **nunca** veía la cartera. Ahora lee la buena, y la vieja se queda como respaldo.

## Barridos

La ficha compara a **una** densidad. El barrido contesta la otra mitad: qué pasa si se aprieta o se
abre. Es el puerto de `solargpt_core.pitch_sweep` y de `poa_report.sweep_tilt_annual`.

Se barre el **pitch en metros**, no el GCR: el GCR es derivado (`apertura / pitch`) y el pitch es lo
que se replantea en campo. La rejilla es la misma que `_generate_step_pitches`, extremo forzado
incluido, y el test la exige punto por punto.

> Las unidades del barrido cambian con lo que se barre, y no es decoración: el **paso del pitch va
> en centímetros** (25 = 25 cm, como en el core) y el **del tilt en grados**. Un «25» sin unidad se
> lee mal en las dos direcciones.

### Lo más importante que se porta no es una fórmula: es una negativa

**En pitch no hay un óptimo.** Más pitch siempre suma POA por m² de módulo y siempre gasta terreno,
así que la curva no tiene máximo interior — tiene dos respuestas a dos preguntas distintas. El core
tampoco marca ninguna fila como óptima, y lo dice en sus propios tests. Así que la ficha publica:

* el **máximo de POA por m² de módulo** (el extremo abierto),
* el **máximo de densidad por m² de suelo** (el extremo apretado),
* el **coste marginal de apretar un metro** — cuánta POA cuesta y cuánta parcela ahorra, que es la
  pregunta de diseño de verdad,
* y, con la potencia pico de arriba, las **hectáreas de cada punto**: es lo que convierte
  «+2,8 % de POA» en «y 2,1 ha más de parcela».

En Sevilla, tracker a 6,00 m: el máximo de POA cae en 9,00 m (+5,0 %) y el de suelo en 4,00 m.
Apretar un metro cuesta **−3,2 % de POA por módulo** y ahorra **17 % de parcela**.

El **tilt se mantiene fijo** a lo largo del barrido — es la convención de §03.F («quitar 1 m
costaría X % *con el mismo tilt*»). Reoptimizarlo en cada punto contesta a otra pregunta, y
mezclar las dos deja una curva que no significa ninguna. Va dicho en pantalla.

### Tres cosas del original que NO se portan

1. El relativo del core es contra un pitch fijo de **6,00 m**, aunque quede fuera del rango barrido.
   Aquí es contra el **pitch configurado**, que es desde donde se decide. Y si el pitch configurado
   cae fuera del rango, el coste marginal **no se publica**: contra un extremo clamado saldría 0, y
   un 0 ahí se lee como «no cuesta nada» cuando lo que pasa es que no se ha barrido ahí.
2. Su `poa_kwh_m2_y` no divide por años, así que con meteo multi-año sale multiplicada pese al
   sufijo `_y`. Aquí se barre el mismo año que se compara.
3. Un pitch con **GCR > 1** no es un punto malo: es geometría imposible (las filas se solaparían).
   Sale marcado en rojo y no puede ganar nada.

### El barrido de tilt sí tiene óptimo

Es lo que lo distingue del de pitch, y por eso uno declara ganador y el otro no. Se barre **con
sombra entre filas** —aquí sale gratis—, así que el óptimo es el **neto** y queda 1-3° por debajo
del que da el cuaderno con transposición pura. Y es el mejor punto **de la rejilla**: con paso 5°
puede caer hasta 2,5° del que da la tabla, que lo busca fino (5° y luego 1°). La curva es plana
cerca del máximo, así que la diferencia de POA es de décimas — pero conviene decirlo o se lee como
una contradicción donde solo hay resolución.

### Una fija no tiene motor

El hueco entre las mesas de una fila es el **mismo parámetro geométrico** en las dos familias —lo
que separa las `nStr` mesas, y entra igual en la fórmula del largo de fila— pero **no es la misma
cosa**: en un seguidor es el **vano del accionamiento** (el motor tiene que ir ahí) y en una fija es
separación estructural y punto. Llamarlo «gap motor» en el configurador de la fija era ponerle a
una mesa un motor que no tiene.

Ahora la fija lo llama **«gap entre mesas»**, el tracker **«gap del motor»**, y la nota de cada
familia dice lo suyo. Hay guards en el test del navegador para que no vuelva.

## Equipos: el catálogo CEC, dentro de la ficha

La tarjeta va **antes que los dos configuradores**, y no es cosmético: el módulo da el **tamaño** y
el **pico** con los que se configuran las dos familias. Si fuese después, se teclean unas medidas a
mano y el catálogo llega tarde a pisarlas.

El pico del módulo dejó de ser un número que se teclea a ojo. La ficha lleva el **catálogo CEC
entero**: 16 758 módulos de la lista 2024 (Pmax ≥ 300 Wp) y 4 910 inversores con sus parámetros
Sandia. Son los mismos CSV que mantiene el core (`solargpt/data/`), recortados a JSON con
`tests/gen_catalogo_cec.py` — no se descarga nada de internet ni en la ficha ni en el core.

Se bajan **bajo demanda**, la primera vez que se toca la tarjeta de Equipos: 2,4 MB y 656 KB
(287 y 90 KB comprimidos por Pages). Quien viene a comparar estructuras no tiene por qué pagarlos,
y hay un test que lo comprueba.

Del módulo se busca por **fabricante** y por **texto multi-palabra** (todas las palabras tienen que
estar: «610 bifacial» encuentra el que lleve las dos cosas, no el que lleve cualquiera). Del
inversor, además, por **categoría** — micro (<1 kW), comercial (≤100 kW), string (100-400 kW),
industrial (>400 kW): son las bandas del cliente, no una escala inventada aquí.

### Un buscador que no deja elegir parejas imposibles

Por defecto la lista de módulos sale ya filtrada por el inversor elegido: **solo los que encajan**,
es decir, aquellos cuya ventana de tensión cabe en la del inversor a las temperaturas del proyecto.
De 16 758 quedan unos 6 700 con un inversor típico. Se puede quitar el filtro, porque a veces lo
que se quiere es justamente ver *por qué* no cabe — y entonces la ficha lo dice con nombres y
números, no con un «no válido».

### Tres trampas del catálogo, respetadas

* **`A_c` es área de CÉLULAS**, no del módulo. Deducir el largo con ella da 2,328 m para un módulo
  de 2,382, así que no se hace: si el catálogo no trae `Length`/`Width` —y la mayoría no las
  trae— se cae al módulo canónico de la casa (2,382 × 1,134 m) y **va dicho en pantalla**.
* **`Idcmax` del CEC es un valor DERIVADO** (≈Pdco/Vdco), no el límite de entradas del datasheet.
  Se usa como **cota** y el resultado se marca con confianza `cec_derived`. Metiendo las corrientes
  por MPPT del datasheet, la confianza pasa a `datasheet`.
* **Los duplicados se marcan, no se borran** (dos fabricantes venden el mismo módulo). Van todos y
  el que busca decide.

### Que se note que el botón ha hecho algo

«Usar en la FIJA» cambiaba un campo de 660 a 645 Wp y poco más. Con un módulo cuyas medidas caen en
las canónicas —la mayoría, porque la CEC no publica `Length`/`Width`— la pantalla no se movía y el
botón parecía muerto. Ahora **cada familia dice qué módulo lleva puesto**, con su pico, sus medidas
y si vienen del catálogo o son las canónicas. Y tocar las medidas a mano **deshace la marca**:
llamar «AEG 645» a unas cotas cambiadas a mano sería ponerle a otro módulo el nombre del que
viniste a elegir — el mismo criterio que con el emplazamiento.

## Sizing: la ventana de tensión y los strings

Puerto **literal** de `solargpt_core.string_sizing` y `solargpt_core.plant_config`, las dos
funciones puras que ya usan el cuaderno (§02.0e) y el Streamlit. La ventana de tensión no estaba en
el core —vivía dentro de la página 5— y aquí queda por fin como función pura y testeable.

```
βVmp     = 1,15 · βVoc                         ← convención bankable (IEC 62548)
Voc_frío = Voc · (1 + βVoc/100 · (T_min − 25))
Vmp_cal  = Vmp · (1 + βVmp/100 · (T_max − 25))
N_min    = ceil(MPPT_bajo / Vmp_cal)           ← el módulo caliente tiene que llegar al suelo
N_maxV   = floor(Vdc_máx  / Voc_frío)          ← el módulo frío no puede pasarse
N_maxM   = floor(MPPT_alto / Vmp_frío)
N_max    = min(N_maxV, N_maxM)                 ← manda el más restrictivo, y se DICE cuál
```

Y los strings, con el criterio del core: manda el **más restrictivo** entre potencia y corriente, y
la ficha dice **quién** — la potencia (el DC/AC objetivo), la corriente de operación del MPPT, la
de cortocircuito (protección) o el tope de strings del datasheet. Un número de strings sin saber
quién lo limita no se puede discutir con nadie.

> El factor **NEC 690.8 (Isc × 1,25) NO entra** en el conteo de strings: dimensiona cableado y
> protecciones, no la capacidad de entrada del inversor. Aplicarlo recortaba ~22 % de planta sin
> razón física. Es la decisión declarada del core, y hay un guard que se pone rojo si alguien la
> revierte.

### El string del sizing baja a los configuradores

«Módulos por string» está en **dos sitios** y significa lo mismo: en el sizing es lo que cabe entre
la tensión máxima del inversor y el suelo de la ventana MPPT, y en el configurador es lo que mide la
fila. Que dijeran cosas distintas era tener **una fila dibujada que no se puede conectar**, y no lo
avisaba nadie.

Ahora hay dos botones para bajarlo —a la fija, al tracker— y, mientras no coincidan, la ficha lo
dice: cuántos tiene cada familia, y si ese número **entra siquiera** en la ventana de tensión.

### Las temperaturas, del emplazamiento

Teclear −10/70 a ojo es dimensionar **otro sitio**. El botón *«Temperaturas del emplazamiento»* las
baja del archivo de Open-Meteo —el mismo proveedor de la meteo de la ficha— para el año elegido y
aplica la convención bankable (IEC 62548, la de la página 5 del Streamlit):

```
T_min de célula = P0,5  del aire del año           ← sin sumar nada
T_max de célula = P99,5 del aire + 25 °C de delta
```

Percentiles y no extremos absolutos, porque un pico de una hora no dimensiona una planta. Y en frío
no se suma delta: el peor caso de Voc es el amanecer despejado, con la célula todavía a la
temperatura del aire.

Se bajan **siempre de Open-Meteo**, aunque la comparativa vaya en cielo claro: el cielo claro es un
modelo de irradiancia, no tiene temperatura, y fingir una sería peor que no traerla. Va dicho al
lado. Y cambiar de emplazamiento o de año **invalida lo traído**: seguir enseñando «Túnez · 2023»
sobre las temperaturas de otro sitio sería peor que no enseñar nada.

El percentil se interpola linealmente entre las dos muestras que lo rodean, que es lo que hace
`pandas.Series.quantile` por defecto — o sea, la cifra contra la que se compara.

### El careo es EXACTO, no «se parece»

`node tests/test_sizing.js` — 104 comprobaciones. Aquí no hay dos modelos de transposición
discutiendo: hay una cuenta de enteros, y un string de más o de menos por MPPT es un unifilar
equivocado. Se exige cifra a cifra contra una corrida congelada del core, con seis casos elegidos
para que mande cada vez uno distinto, **más la etiqueta de quién limita y la de confianza**.

Una trampa de portabilidad que no es teórica: `int(round(x))` de Python redondea **al par** en el
.5 exacto y `Math.round` de JavaScript redondea hacia arriba. Los dos sitios donde el core usa
`round()` para contar strings caen justo en esa cuenta, así que se porta el redondeo — y se testea.

Y una incoherencia del original que aquí **no** se porta: su gráfico de la ventana pintaba la curva
de Vmp con γPmax (coeficiente de POTENCIA) mientras el cálculo usaba βVmp. El dibujo y la cuenta no
coincidían; aquí los dos usan βVmp.

## El tamaño de la estructura

**Fija y tracker se configuran POR SEPARADO**, cada una con su tarjeta y su pitch — que es como
se hace de verdad: §03.F tiene su `fix_pitch_m` y su mesa, §03.T0 los suyos (`trk_pitch_m`,
`trk_table_type`), y CLAUDE.md avisa expresamente de que «la FIJA no debe machacar el GCR del
tracker». Obligarlas al mismo suelo no era neutral: era una hipótesis metida de tapadillo. Una
fija se monta más apretada porque no tiene que abrirse para no darse sombra al bascular, y eso
es justo lo que decide la comparación por hectárea.

El interruptor **«igualar el suelo»** sigue estando, porque la otra pregunta también vale: con él
la fija adopta el GCR del tracker (conservando su apertura, así que lo que se mueve es su pitch) y
la comparación aísla la estructura de la densidad.

> Con la fija a pitch 4,5 m (GCR 0,529) y el tracker a 6,0 (GCR 0,397) en Sevilla: por m² de
> **módulo** gana el tracker (+19,7 %), y por m² de **suelo** gana la fija — 1256 contra 1128
> kWh/m². Ese vuelco es la razón de que la ficha publique los dos denominadores.

Dentro de cada familia, las cotas salen con **las mismas fórmulas** que el core: la tarjeta
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

**Un GCR mayor que 1 se rechaza**, no se calcula: significa que la apertura no cabe en el pitch y
las filas se solaparían. El core lanza `ValueError` ahí; la ficha lo dice en rojo y desactiva el
botón. Dejarlo pasar daba un resultado con toda la pinta de un número —tilt óptimo de 0° y
transposición NEGATIVA—, que es la firma de una geometría imposible, no de un mal emplazamiento.

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

### El tilt óptimo de la escena, sin simular el año

El bloque «Fija · tilt óptimo» se dibujaba con el **tilt de proyecto** hasta que dabas a *Comparar*,
con el rótulo diciendo «óptimo»: enseñaba 25° bajo un nombre que promete otra cosa, y para verlo de
verdad había que simular el año entero.

Ahora se **estima** con doce días de cielo claro —el 15 de cada mes, horario: 288 pasos en vez de
8 760, así que el barrido de 22 tilts es instantáneo— y se marca con **«≈ 32° · tilt estimado»**.
En cuanto comparas, la tabla lo sustituye por el óptimo del año y el «≈» desaparece. La estimación
se cachea y solo se rehace al cambiar la geometría o el emplazamiento, porque `actualiza3D()` corre
en cada tirón del deslizador de la hora.

Que la estimación es física de verdad se ve al pegar unas coordenadas de Assú (5,6° de latitud
sur): el óptimo baja a **6°** y la mesa sale casi plana, mirando al norte. Hay un test que lo mide.

### El aviso del tilt óptimo decía un número de memoria

Decía «el del cuaderno queda **1-3°** por encima». Eso solo vale a GCR flojo. Con las filas
apretadas un tilt alto se tapa la fila de detrás y el óptimo **neto** se desploma: en Sevilla, a
GCR 0,68, el neto sale **25°** y el de transposición pura **36°** — once grados. Decir «1-3°» ahí
se lee como «casi coinciden» cuando no coinciden en absoluto.

Ahora el segundo óptimo **se calcula** (mismo barrido, con el sombreado apagado) y el aviso publica
la diferencia **medida**, con el GCR al que pasa y por qué pasa. No es que los dos motores
discrepen: es que responden a preguntas distintas.

| GCR | óptimo neto | sin sombra | diferencia |
|---|---|---|---|
| 0,40 | 35° | 36° | 1° |
| 0,53 | 32° | 36° | 4° |
| 0,68 | 25° | 36° | **11°** |
| 0,75 | 21° | 36° | 15° |

### La escena tiene que OBEDECER a los dos configuradores

Un 3D que no se mueve con lo que configuras es peor que no tenerlo: se lee como una prueba visual
de un número que en realidad no representa. Tres fallos, los tres del mismo tipo —la escena
enseñando una estructura mientras la tabla calculaba otra—:

1. **La lista de campos que rehacen el mundo se quedó vieja.** Al partir la configuración en dos
   familias (`fx*` para la fija, `tk*` para el tracker), la lista conservó los ids de antes
   (`'pitch'`, `'modL'`, `'tabla'`, `'filas'`…), que ya no existen. El `if(!el)return` que la
   protege de un id ausente se los tragó **en silencio**: cambiabas el pitch, la mesa o el módulo
   y la escena seguía dibujando la geometría del arranque. Ahora la lista es **una sola**
   (`CAMPOS_GEOM`), la misma que refresca las lecturas — duplicarla fue exactamente el fallo.
2. **El modelo del seguidor era de catálogo.** `seguidor.js` no dibuja un tracker parametrizado:
   lo **genera** a partir de sus cotas canónicas (`Seguidor.DIMS`: 28 módulos, 1V, 64,7 m). Como
   nadie se las pasaba, el bloque del seguidor salía siempre igual, mientras la fija sí se
   dibujaba a su tamaño (`mesaFija3D` lo recibe por argumento). Ahora `cotasSeguidor()` le pone el
   módulo, la apertura, los gaps y los módulos por string antes de generarlo. El modelo tiene dos
   alas con el motor en medio —la topología real, la de `FIS.tamano` con `nStr = 2`—, así que con
   otro número de strings por fila el largo se ajusta estirando el tubo: la fila mide lo que dice
   la tabla aunque el modelo no sepa dibujar tres alas.
3. **Elegir emplazamiento no refrescaba nada.** Poner `.value` a mano no dispara `change`, así que
   con Assú (hemisferio **sur**) la fija se quedaba mirando al sur.

Los tests miden la escena **campo por campo**: el pitch de cada familia separando *sus* filas y no
las de la otra, la mesa 1V→2V doblando la apertura dibujada (2,38 → 4,76 m), los módulos por
string acortando la fila (65,09 → 32,78 m), el largo dibujado contra el de la lectura (65,09 vs
65,08 m) y la fija girando al norte al elegir un sitio del hemisferio sur. Más un guard
anti-podredumbre: ningún id de `CAMPOS_GEOM` puede apuntar a un elemento que no existe.

### Bifila: dos filas que son un seguidor

Monofila y bifila **no cambian la mesa** —es una diferencia operativa, no geométrica, y por eso la
POA por m² de módulo es exactamente la misma—, pero sí cambian **qué es «un seguidor»**: en bifila
son dos filas a un pitch de distancia movidas por el **mismo accionamiento**.

En la escena eso no se puede dejar implícito, porque sin dibujarlo dos filas de una bifila y dos
monofilas se ven idénticas: justo la distinción que la palabra nombra. Así que un bloque de
seguidores bifila dibuja **cuatro filas —dos seguidores enteros, no tres— con la transmisión
compartida** (barra a la altura del tubo, acoplamiento en cada eje y el motor en medio) cruzando de
una fila a la otra. Entre los dos seguidores, en cambio, **no hay barra**: esas dos filas están al
mismo pitch pero no son el mismo tracker, y ésa es toda la diferencia. El rótulo del bloque lo dice
también (`N-S · backtracking · bifila`).

Con tres filas el par no se vería como par —quedaría un seguidor entero y medio—, y por eso el
bloque pasa a cuatro cuando hay bifila. La fija nunca se agrupa, aunque el tracker sea bifila.

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

El **dimensionado a igualdad de pico** no es de ninguno de los dos motores: es aritmética de la
ficha (`FIS.planta`), y sale igual vengan las POA del navegador o del core. Se congela **con la
corrida**, así que si luego tocas el pitch la tabla que estás mirando sigue siendo coherente
consigo misma hasta que vuelvas a comparar.

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
node tests/test_comparador.js       # 82 comprobaciones · careo contra el core, sin navegador
python3 -m http.server 8099         # (en otra terminal, para el 3D)
node tests/test_comparador_sitio.js # 36 comprobaciones · el buscador de emplazamiento
node tests/test_comparador_3d.js    # 104 comprobaciones · escena, equipos y sizing
node tests/test_sizing.js           # 115 comprobaciones · careo del dimensionado eléctrico · la escena en un Chromium de verdad
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
