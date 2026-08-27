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
| **Fija · Este-Oeste** | Dos aguas, media de los dos planos (misma superficie de módulo cada uno); su cumbrera corre N-S y sigue el terreno |
| **Tracker N-S · backtracking** | HSAT canónico: eje horizontal norte-sur, backtracking activo |
| **Tracker N-S · sin backtracking** | Seguimiento astronómico puro: apunta mejor y se da sombra |
| **Tracker de eje inclinado (TSAT)** | Eje norte-sur inclinado hacia el ecuador |
| **Tracker quebrado · backtracking** | Rótula en el actuador: la mesa norte y la sur quedan a inclinaciones distintas |
| **Tracker quebrado · sin backtracking** | El mismo quebrado, para aislar qué aporta cada cosa |

Las seis primeras son las mismas claves y las mismas etiquetas que
`solargpt_core.structure_compare.CATALOGO`, y el careo lo comprueba: si el core añade una y la
ficha no, el test se pone rojo.

Los dos **quebrados** nacieron como hueco declarado —sólo existían aquí, así que el careo no podía
cubrirlos— y ese hueco **está cerrado**: desde SolarGPT v1.71.0 el core los tiene (`broken_deg` en
su catálogo corre las dos mesas por separado y promedia, igual que la ficha), entran en el golden y
el motor Python los acepta. El guard de `soloFicha` se queda vacío pero vivo: la próxima estructura
que nazca en la ficha volverá a nacer sin motor Python.

**Y el careo, al enfrentarlos por primera vez, cazó dos cosas.** La primera era de convención y no
de física: el core publica como θ la **media de las dos mesas** y la ficha publicaba el de la
primera —18,38° de diferencia máxima—. Ninguna de las dos es «el» ángulo, así que las dos publican
ahora la media, y queda dicho que **ese ángulo no lo ejecuta ninguna mesa**: los dos reales salen en
la lectura. La segunda es un **empate**: con los quebrados dentro, `tracker_queb_nobt` y
`tracker_hsat` quedan a 0,026 % en el core, cincuenta veces por debajo del hueco medido entre los
dos motores (1,365 %, Perez contra Hay-Davies). Ese par no tiene orden decidible con este
instrumento, y el careo lo **declara** en vez de exigir un orden que decidiría el ruido.

El umbral del empate es el hueco **medido**, no la tolerancia: lo dijo el guard del propio empate,
que saltó cuando lo puse en la tolerancia (2,5 %) y se tragó `fija_optima ≈ fija_proyecto` —2,1 %,
que es justo lo que la ficha existe para enseñar.

### El seguidor quebrado

Un quebrado no es un seguidor con otro número: es el mismo, con una rótula en el actuador
central, de modo que la fila norte y la fila sur se montan a inclinaciones distintas. Es lo que
se compra cuando el terreno quiebra a lo largo del eje.

El parámetro es **la diferencia entre las dos mesas** —`Quiebro N-S °`—, no lo que se aparta
cada una: con 10° sobre un terreno que cae 12° al sur, una mesa queda a 17° y la otra a 7°. El
rígido, en el mismo sitio, se queda en los 12° de la media.

Cada mesa corre **su** física: su ángulo de seguimiento, su retroceso de backtracking y su
sombra, con las mismas funciones que la tabla; el seguidor es la media de las dos. Y en la
escena cada mesa gira lo suyo, porque dibujar las dos al mismo ángulo sería enseñar un seguidor
distinto del que se ha calculado.

**Y aquí la tabla dice lo contrario de lo que parece.** Por POA el rígido sale por delante, y no
por ser mejor estructura: la curva POA-vs-inclinación-de-eje es **cóncava**, así que la media de
dos mesas a 17° y 7° cae por debajo del punto medio a 12°. Es Jensen. Lo que el número no dice
es que ese tubo recto **no se puede montar ahí**: vuela metros sobre el caballón por los dos
extremos —2,97 m con 10° de quiebro sobre 12° de caída, en una fila de 65 m— y hay que sostenerlo con hincas que
pasan de 2,0 a 4,9 m, cuando el quebrado apoya con todas iguales. La ficha publica el vuelo y lo
explica debajo de la tabla; sin eso, la comparación está a medias.

El quiebro es **a lo largo** del eje: no toca la pendiente ⊥ de nadie, y por tanto no cambia el
backtracking por ese lado.

#### Las dos mesas no captan lo mismo, y el promedio se lo calla

Es lo que la tabla no puede decir con una sola cifra. Con 10° de quiebro sobre 12° de caída al sur
en Sevilla, la mesa que mira al ecuador capta **101,6 kWh/m²** y la otra **97,5**: un **4,1 %** entre
ellas. La tabla publica la media, y para POA por m² de módulo eso es **correcto** —la mitad de los
módulos ve un plano y la otra mitad el otro—; la ficha publica además las dos.

Lo que no es una media es la consecuencia **eléctrica**: un string en serie lo manda su módulo peor,
así que un string a caballo de la rótula rinde por la mesa mala y no por el promedio. Eso es
desacoplo **DC** y esta comparación es de **POA**: no está contado en ninguna cifra de la tabla, y
va dicho con esas palabras.

Lo que sí se puede decir con la geometría que hay puesta es **si algún string cruza**. Los strings
se reparten a lo largo de la fila y la rótula está en el centro, así que el corte entre strings cae
justo ahí sólo si hay un número **par** de strings por fila. Con impar, el de en medio queda a
caballo. La nota lo dice en cada caso, con el número que haya puesto en el configurador.

**Y se ve que quiebra.** Dos cosas que faltaban para eso:

* **La rótula**, dibujada: dos bridas —una en cada media viga, así que cada una se inclina con la
  suya— y su bulón, en el actuador. Sin ella las dos medias vigas se juntan sin más y el quiebro se
  lee como un tubo doblado, que es otra cosa: un tubo doblado no existe, una viga articulada sí. El
  test mide el ángulo **entre las dos bridas** sobre la escena y exige que sea el quiebro tecleado.
* **La cumbrera del caballón**, marcada en el suelo. Con las dos aguas simétricas las curvas de
  nivel salen espejadas a los dos lados y la línea de cumbrera es una más entre ellas: se ve un
  terreno ondulado, no el caballón que explica por qué el seguidor quiebra ahí y no en otro sitio.
  Y no bastaba con aclararla: la curva de nivel pasa justo por la cumbrera —es la cota máxima— y la
  oscurece, así que las dos se anulaban (medido: 1,39 contra 1,33 de su alrededor). En la cumbrera
  manda la cumbrera.

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

### Cómo se colocan: en bloques, hasta que el campo queda cuadrado

La pregunta que hay que contestar antes de creerse las hectáreas.

Un parque **no es una tira**. Alineando las N filas una detrás de otra salían campos imposibles: a
100 MWp los seguidores daban **17 km de largo por 65 m de ancho**. En campo se rompe en **bloques**
hasta que el conjunto queda aproximadamente **cuadrado**, que es lo que se busca en una parcela. El
número de bloques sale de igualar los dos lados (`bloques ≈ √área / largo de fila`), y cada uno
aporta un largo de fila al lado correspondiente.

A 100 MWp con el módulo canónico:

| | filas | bloques | campo |
|---|---|---|---|
| **Fija** (1V, pitch 4,5) | 2.706 | 14 × 194 filas | **911 × 873 m** |
| **Tracker** (1V, pitch 6,0) | 2.706 | 16 × 170 filas | **1.020 × 1.041 m** |

Y cada familia se apila en la dirección **contraria** a como corre su fila: la **fija** corre
este-oeste y apila hacia el **sur**; el **tracker** corre norte-sur (su eje) y apila hacia el
**este**.

Las **hectáreas** que se publican siguen siendo la huella de las filas (`filas × pitch × largo de
fila`). El rectángulo que las envuelve es algo mayor, porque el último bloque queda incompleto — se
dice en vez de repartirlo. Y no lleva viales, ni subestación, ni los retranqueos de la parcela real:
para eso está el generador de layout.

**Para la sombra, en cambio, sí son infinitas.** El modelo de sombreado es el de **fila infinita**
—cada fila la tapa otra idéntica a un pitch, en el plano perpendicular al eje—, que es la
simplificación de `pvlib.shading.shaded_fraction1d` y por tanto la del core. Dos consecuencias:

* la **primera fila sale sombreada** aunque en campo no tenga a nadie delante. De N filas hay
  **una** a la que se le cobra una sombra que no tiene, así que la pérdida por sombreado sale
  **1/N** más alta de lo que debería. Y ese porcentaje es **de la pérdida**, no de la energía — con
  la fija a GCR 0,529 la sombra modelada es 1,324 % y la real 1,319 %: **0,005 puntos**. La ficha
  publica la corregida en la nota de la tabla, con el número de filas ya sabido;
* **no hay efectos de borde por los extremos** de la fila, que se supone infinitamente larga.

A escala de planta el error es de décimas. En una implantación de tres filas no lo sería.

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

### Dos mesas por fila, siempre

Es la convención de la casa, en las dos familias: una fila son **dos mesas** con su hueco en medio,
y de ahí sale la fórmula del largo de fila (`FILA = 2 × MESA + hueco`, la del cliente). El campo se
puede tocar, pero la ficha lo dice —para que un «2» en una casilla editable no se lea como «lo que
había puesto»— y avisa si lo bajas a una.

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

### El eje inclinado va sobre terreno en pendiente

Un TSAT gira el eje sobre X, así que media fila quedaba **bajo el suelo** y la otra media volando.
Costó tres versiones dar con la buena:

1. una **cuña** bajo el bloque — se leía como una rampa de hormigón, no como terreno;
2. el suelo **plano** y la hinca alargada hasta el suelo — peor: un tracker con megasoportes a un
   lado no es lo que se construye;
3. **terreno con pendiente**, que es lo que un eje inclinado necesita para existir.

Se hace como en **bt3d**: un *heightfield* subdividido (`PlaneGeometry(w, l, 140, 70)`) con la cota
de cada vértice y `computeVertexNormals()`. Eso es lo que lo hace leerse como una ladera: una malla
de dos triángulos tiene una normal por cara y sale con aristas; con las normales recalculadas la luz
varía de forma continua.

Las hincas miden lo que miden: **2 m, las mismas que el eje horizontal**. Lo que cambia es el
terreno, no la estructura. (Cómo se dibuja hoy ese terreno —un solo plano para todas— está más
abajo.)

### La pendiente del emplazamiento: magnitud y AZIMUT

`Pendiente del terreno °` y `Azimut de la caída °`, en la tarjeta de Emplazamiento porque son una
propiedad del **sitio**. Azimut de la caída desde el norte y en sentido horario: 0 N, 90 E, 180 S,
270 O.

La versión anterior pedía la «pendiente ⊥ filas», y eso era pedirle al terreno que **girase con
cada estructura**. Un emplazamiento no tiene una pendiente perpendicular a nada: tiene **una**, con
su magnitud y su dirección de máxima caída. Lo que gira son las **filas**, y por eso cada familia ve
una **componente** distinta del mismo plano:

* la componente **⊥ a las filas** es la que entra en el sombreado — el `cross_axis_slope` de
  `pvlib.shading.shaded_fraction1d`, el mismo por el que entra en el core;
* la componente **a lo largo** de las filas no sombrea, pero decide si la estructura se puede
  replantear: una fila es rígida, y esa componente hay que absorberla con hincas de distinta
  longitud, con bancales o inclinando el eje.

Con `β` la pendiente y `A` el azimut de la caída, y el mundo con +x al este y +z al sur, la caída
por metro es `gx = tan β · sen A` y `gz = −tan β · cos A`. La fija apila las filas al **sur** (sus
filas corren este-oeste) y el seguidor y las dos aguas al **este** (las suyas corren norte-sur), así
que:

| cae al | fija · ⊥ filas | fija · a lo largo | seguidor · ⊥ filas | seguidor · a lo largo |
|---|---|---|---|---|
| **S** (180°) | **β** | 0 | **0** | β |
| **E** (90°) | 0 | β | **β** | 0 |
| **N** (0°) | **−β** | 0 | 0 | β |
| **SE** (135°) | β/√2 | β/√2 | β/√2 | β/√2 |

Lo que dice la primera fila es lo importante: **con el terreno cayendo al sur, la fija ve toda la
pendiente y el seguidor ninguna** — la ve entera a lo largo del eje. Eso no es un defecto de la
comparación: es la razón por la que en un emplazamiento real una estructura se puede montar y la
otra no. Y el caso en que **todas** ven lo mismo no se impone: sale, y solo en la diagonal.

Lo que consume el motor es `FIS.cruz(cfg, spec)`. Si no hay azimut declarado, `pend` **es** el
cross-axis — que es como lo toma el core, y por eso el careo lo inyecta tal cual; con azimut, se
deriva para cada familia.

### El AZIMUT de la estructura, que no es el del terreno

Ni la fija mira siempre al ecuador ni el eje de un seguidor corre siempre norte-sur: es una decisión
de **proyecto**, y no tiene nada que ver con hacia dónde cae el terreno. Se declara como **desvío**
—`0` = la orientación de manual, positivo hacia el **oeste**— porque así vale igual en los dos
hemisferios y es como se especifica en obra («15° al oeste»). Cada familia lleva el suyo:
`Desvío del azimut °` en el configurador de la fija y `Desvío del eje °` en el del tracker.

Toda la proyección del sol pasa ahora por **una** función, `FIS.psPlano(el, az, pitchAz, …)`: el
ángulo del sol en el plano ⊥ a las filas, para una dirección de pitch cualquiera. Con el pitch al sur
sale la fija de siempre y con el pitch al este, el seguidor N-S — por eso el careo no se mueve.

La pendiente se generaliza igual: la caída por metro en la dirección `A` es `gx·sen A − gz·cos A`;
con `A = 180` sale `gz` y con `A = 90`, `gx`, que son los dos casos de manual. Y girar la estructura
cambia **cuánta pendiente ve**: con el terreno cayendo al sur y 16°, girar la fija 30° le baja la ⊥ a
`16° · cos 30°` = 13,9°, y girar el eje del seguidor 20° se la sube de 0° a 5,6°.

En la escena, el bloque se construye en su marco de siempre —la fija apila en +Z, el seguidor y las
dos aguas en +X— y se **gira entero** a su azimut; la pendiente se pasa entonces al marco del bloque,
porque girado 30° moverse por su +X ya no es ir al este. Dos cosas que esto arrastró:

* el giro de la mesa fija pasa a ser **siempre positivo** sobre su X local. Antes llevaba un signo
  por hemisferio, y con el azimut declarado eso se aplicaba dos veces: en el sur volvía a mirar al
  polo;
* el **tilt y el azimut que entran en el cálculo son los declarados** —como en el core—, mientras que
  la escena además apoya la fila en el suelo, así que la mesa queda algo escorada respecto a ellos.
  Es la diferencia entre el proyecto y el replanteo, y va dicha en la escena porque en pendientes
  fuertes se nota (con 16° y 30° de desvío, la normal del panel se va unos 17°).

### El terreno de la escena: un solo plano

Todas las estructuras se montan sobre **el mismo plano**. Se dibuja como un *heightfield* igual que
en **bt3d** —plano subdividido, cota por vértice y `computeVertexNormals()`— y no como dos
triángulos: una malla de dos caras tiene una normal por cara y sale con aristas.

Los bloques se colocan sobre la **curva de nivel** de ese plano, no en fila este-oeste. Es lo que
hace que todos arranquen de la misma cota estando sobre el mismo plano: alineados este-oeste con el
terreno cayendo al este, el sexto bloque quedaría cien metros por debajo del primero. En campo es lo
mismo: las filas siguen la curva de nivel.

Y la **cámara se pone cuesta abajo**, mirando ladera arriba. No es gusto: la línea de bloques gira
con el azimut, y desde el sur fijo con la caída al este quedaban en fila india — el primero enorme y
el último un punto. En llano no hay cuesta y se mira desde el sur, como siempre.

Y con **un cuarto de vuelta corto, 20°**. Mirar exactamente por la línea de máxima pendiente es el
peor ángulo para leerla: la ladera cae hacia el fondo y en pantalla no se inclina nada — con la
caída al sur salían dos franjas de verde y ni un desnivel. Ni un grado más de 20, eso sí: los
bloques van sobre la curva de nivel, así que cuanto más se gira, más se hunde esa línea en
perspectiva y más desiguales salen (a 28° el primero era el triple que el último). El encuadre pasa
a siete pasadas porque con la cámara girada la caja del mundo entra más torcida y con cuatro se
quedaba a un 6 % de encajar.

Con una condición más, que costó un susto: **siempre por el lado del ecuador**. Las dos direcciones ⊥ a
la línea de bloques encuadran igual de bien, y solo una enseña la cara — una fija mira al ecuador,
así que con la caída al NNE la cámara se plantaba *detrás* de los paneles y la escena salía en negro,
con las mesas de canto. Y cuando la caída es este u oeste no hay componente hacia el ecuador
ninguna, así que se le suma un sesgo: mejor un poco de escorzo en la línea de bloques que mirar seis
estructuras de perfil. (Detalle de JS: `cos(90°)` no es cero sino 6·10⁻¹⁷, y sin épsilon ese ruido
decidía el lado.)

#### Las filas se adaptan al terreno

La pendiente la tiene el **suelo**; la estructura se replantea sobre él. Apoyar cada fila en la cota
de su **centro** y dejarla horizontal a lo largo no vale: con 65 m de fila y 24° de pendiente en esa
dirección, un extremo vuela 14 m y el otro se entierra otros 14 — que es exactamente el «tracker con
megasoportes» que no se construye.

Así que cada fila se inclina **lo que se inclina el terreno en su dirección larga**, ni más ni menos:

* filas que corren este-oeste (la fija): giran en Z, y la caída es `gx`;
* filas que corren norte-sur (seguidor y dos aguas): giran en X, y es `gz`.

Para un seguidor eso es literalmente **un eje que sigue el terreno**, que es lo que es un TSAT. Lo
que **no** cambia es el tilt ni la componente ⊥: en la dirección del pitch las filas se **escalonan**
a distinta cota, no se inclinan.

#### El «eje inclinado °» no se teclea: lo pone el terreno

Un TSAT no es un seguidor con un parámetro más: es un seguidor **sobre una pendiente que corre a lo
largo de su eje**. Un eje no se inclina en el aire. Así que el campo es de **solo lectura** y se
rellena con la componente a lo largo del eje del mismo plano del sitio:

| cae al | eje inclinado (lat > 0) |
|---|---|
| **S** (180°) | **+β** — el eje mira al ecuador, el TSAT de manual |
| **N** (0°) | **−β** — mira al polo, y eso también existe |
| **E**/**O** | **0** — esa pendiente es ⊥ al eje, no a lo largo |
| llano | **0** — sin pendiente no hay TSAT que valga |

Eso obligó a que `FIS.psTSAT` acepte el **signo**: antes tomaba `Math.abs(axis_tilt)` y orientaba el
eje hacia el ecuador por definición, así que con el terreno cayendo hacia el polo se dibujaba un eje
y se calculaba el contrario. En el hemisferio sur el signo se da la vuelta, porque el ecuador está
al norte.

Y lo lleva **todo** seguidor, no solo el que el catálogo llama TSAT. Mientras esto era solo del
TSAT, la escena dibujaba el eje del HSAT siguiendo el terreno y la física lo calculaba **plano**: una
cosa dibujada y otra calculada. Con 12° al sur en Sevilla eran **158 kWh/m²** de diferencia sin que
la tabla se moviera. La proyección con eje inclinado la decide ahora el **ángulo**, no la etiqueta
del catálogo.

Consecuencia: **el «eje inclinado (TSAT)» deja de ofrecerse**. Con la inclinación del eje puesta por
el terreno es la misma estructura que el N-S — coinciden en llano (no hay eje que inclinar) y
coinciden con pendiente a lo largo del eje (los dos la toman). La ficha pasa a comparar **cinco**
estructuras. La entrada sigue en `FIS.CATALOGO` marcada `soloCareo`, porque el fixture del core la
corrió por separado (`axis_tilt` 10, y el HSAT con 0) y ese camino sigue vivo mientras no haya azimut
de terreno declarado.

Sin azimut declarado se respeta el valor recibido: el core toma `axis_tilt` y `cross_axis_slope` por
separado —son las dos componentes del mismo plano— y por ahí entra el careo (el HSAT con `axis_tilt`
0 y el TSAT con 10).

#### El horizonte también lleva la pendiente

El suelo va en dos piezas: el de **trabajo**, que recibe sombras y se dimensiona con la escena, y el
de **horizonte**, enorme, que llega hasta la cúpula — sin él el de trabajo se acaba en un borde recto
con el cielo detrás y los bloques parecen estar sobre una mesa flotando en el vacío.

Con el terreno inclinado, el de horizonte tenía que inclinarse **con él**: plano y horizontal, el
cuadrado del suelo de trabajo acababa contra él en un canto recto que cruzaba la escena. Una ladera
que se corta en línea y sigue en llano no es un horizonte, es un error de dibujo. Va en el mismo
plano y metro y medio por debajo, y **dimensionado con la escena**: inclinado, un plano de 12 km sube
1.700 m por un lado y tapa el cielo entero; basta con que llegue más lejos que la niebla. (Detalle:
su geometría se pre-rota tumbada, para que la rotación del objeto quede libre para la pendiente — con
`rotation.x = −π/2` en el objeto, inclinarlo lo ponía de canto y salía un muro.)

Y la **altura de la cámara** se mide contra el suelo, no contra la horizontal: mirando ladera arriba
con la cámara a 25° y el terreno a 16° quedan 9° de nada y la escena entera es cuesta, ni cielo ni
fuga. Se le suma la pendiente para conservar el mismo ángulo de vista sobre el plano del sitio, que
en llano es el de siempre.

#### Lo que esta tabla NO puede decidir: backtracking sí o no

Dos cosas que hay que decir en cuanto aparecen las dos filas de seguidor, porque el número invita a
leer justo lo contrario de lo que dice:

1. La comparación es de **POA**, y la pérdida por sombra entra como **fracción sombreada del plano,
   lineal**. En un string real una sombra parcial cuesta mucho más que su fracción —el módulo tapado
   arrastra a la serie— y eso aquí no se ve. Así que **por POA el backtracking casi nunca gana**:
   renuncia a apuntar para quitarse una sombra que este modelo cobra barata. Lo que lo decide es la
   energía DC/AC, y eso es otra ficha.
2. El ángulo de backtracking se calcula **en llano**, que es lo que hace el core (y por eso el careo
   cuadra). Con pendiente ⊥ a las filas deja de evitar la sombra: la fila de al lado está más alta y
   sigue tapando. `pvlib` sabe hacerlo con la pendiente (`cross_axis_tilt`); el core no lo usa, y la
   ficha no se lo va a inventar por su cuenta — lo dice y ya.

Va en la nota de la tabla, y la segunda parte solo cuando hay pendiente ⊥ que la justifique.

#### La fija sigue el terreno A LO LARGO, y su pendiente ⊥ es la tecleada

Las dos cosas a la vez. Una fila de 65 m no se monta horizontal sobre una ladera: se replanta sobre
ella, igual que un seguidor y que unas dos aguas. Antes se quedaba horizontal y quien compensaba era
la hinca, y con 12° a lo largo de sus filas eso pedía hincas de **0,25 a 8,74 m** — con la mesa
**cinco metros dentro del terreno** por un extremo y volando siete por el otro. Eso no es una fija
sobre una cuesta, es una fija que no existe.

Lo que **no** cambia es la pendiente que se teclea, que es la de la dirección ⊥ a las filas
(norte-sur en una monoinclinada). Y ahí hay un detalle que hay que hacer bien, porque la intuición
falla: rodar la fila **sí** mueve esa pendiente. Medido, 25° tumbados sobre una fila con 12° a lo
largo dan **25,49°** de pendiente norte-sur. La relación es

```
pendiente ⊥ = atan( tan(giro sobre la fila) / cos(inclinación de la fila) )
```

así que el giro que se le da a la mesa sobre su propia fila es el de la inversa —`FIS.thMesa`—:
**24,51°** para que la pendiente norte-sur salga los 25 de proyecto. Con la fila horizontal es el
mismo número, que es el camino del careo.

La inclinación **total** de la superficie sí cambia, y es la otra mitad de la verdad:
acos(cos 24,51° · cos 12°) = **27,13°**. Es `FIS.tiltSup` sobre `FIS.thMesa`, las dos funciones que
usa la tabla — lo dibujado y lo calculado son lo mismo.

Un **seguidor** no lleva esta corrección, y no es una excepción caprichosa: su θ es un ángulo de
motor sobre su eje, no una pendiente de proyecto.

#### Las hincas pisan el suelo, y eso se mide

Todas, en todas las familias: **0,00 m** de vuelo con la caída llana, ⊥, a lo largo, en diagonal y
con caballón. No es un detalle de dibujo — la lectura publica el rango de hinca y con él se decide
si la estructura se puede montar ahí.

Dos cosas hubo que arreglar para poder decir eso:

* Las del **seguidor** se calculaban en el marco local con `tan(quiebro/2)` por metro, que no es
  exactamente el caballón que se dibuja —las dos aguas quedan a eje±quiebro/2—: dejaba los pies del
  rígido a 14 cm del suelo sobre el caballón. Ahora se pregunta la cota **de verdad** bajo la cabeza
  de cada poste y se mide la vertical, como ya hacía la mesa fija.
* Y con la caída **no ⊥ a las filas** más quiebro, la línea de bloques —que va sobre la curva de
  nivel— se separa de una cumbrera única: con 25° al 120° y 16° de quiebro había bloques a **treinta
  metros** del suelo, con hincas de 32 m. La cumbrera **se repite** con el paso de los bloques
  proyectado sobre el eje, así que cada bloque cae sobre la suya. Es lo mismo que la ficha ya hace
  con la pendiente: el mismo terreno para todas, girado a sus filas. Va dicho bajo el campo —cuántos
  metros mide ese paso— y, si es más corto que la fila, que ahí una fila cruza más de una cumbrera y
  el quebrado modela **una** rótula.

Y un detalle que sólo aparece al apoyarlas en el terreno de verdad: las hincas del **quebrado** no
salen exactamente iguales, sino **2,01 y 2,09 m** con 12° de caída y 10° de quiebro. No es ruido: son
verticales, y las dos aguas están a **7° y 17°**, así que para dejar el tubo a la misma distancia
*perpendicular* del suelo la hinca bajo el agua más tumbada mide un poco más — 2/cos 7° = 2,015
contra 2/cos 17° = 2,091. Siete centímetros. El modelo viejo, que medía en el marco local, no los
veía. Lo que se exige en el banco es lo que decide: que **no crezcan con el terreno**, que es lo que
sí le pasa al rígido (2,7 → 5,0 m).

#### Los soportes de una fija: DOS líneas, y no miden lo mismo

Una mesa fija no gira: se apoya en la línea de postes de delante y en la de detrás, y el propio tilt
las hace distintas — con 25° hay cerca de un metro entre una y otra. Con una sola línea bajo el eje
la mesa parecía un balancín y el rango de hinca que publicaba la lectura no era el de la estructura.

Cada poste se apoya en el **terreno de verdad**: se lleva su cabeza al mundo, se pregunta la cota
ahí y se mide la vertical. Cualquier cuenta hecha en el marco local se queda corta en cuanto la fila
va rodada — a 30° dejaba los pies a 39 cm del suelo. Y sale **vertical en el mundo** aunque su fila
vaya inclinada.

Con eso, la pendiente a lo largo ya no estira las hincas (12° y 30° dan el mismo rango que el llano)
y desaparece el caso de «hay que bancalear», que era consecuencia del modelo viejo. La pendiente ⊥
sí las mueve, y en el sentido correcto: **acerca** las dos líneas, porque el suelo cae hacia el
mismo lado que la mesa.

#### Y las DOS AGUAS sí, igual que el seguidor

La diferencia no es de familia, es de **dirección**. Las filas de una monoinclinada corren
este-oeste y su tilt **es** la dirección norte-sur: ahí la pendiente no se puede seguir sin cambiar
el tilt de proyecto, así que la absorbe la hinca. Las filas de unas **dos aguas** corren norte-sur
—igual que el eje de un seguidor— y lo que corre por su cumbrera es una recta apoyada en el suelo:
sobre una caída norte-sur **no queda horizontal**, se inclina con ella. Una cumbrera de 65 m
horizontal sobre una ladera es el mismo «megasoporte» que ya no se dibuja en ninguna otra familia.

E inclinar la cumbrera **no cambia el tilt**: los dos paños siguen a ±tiltEO sobre ella, igual que
inclinar el eje de un seguidor no cambia su ángulo de seguimiento. Geométricamente son el mismo
marco girado, así que comparten `FIS.ejeTilt` y la misma proyección (`psTSAT`) — y el test lo exige
midiendo el ángulo **entre los dos paños**, que es 2 × tiltEO se mire desde donde se mire.

Y tiene consecuencia en la cifra, que es lo que lo hace física y no dibujo. En Sevilla, cielo claro:

| caída | POA dos aguas |
|---|---|
| llano | 65,5 kWh/m² |
| **12° al sur** | **72,4** (+10,5 %) |
| 20° al sur | 75,6 |
| 12° al este | 65,5 (sin cambio: esa pendiente es la ⊥, y entra por el sombreado) |

Mientras la cumbrera se dibujaba horizontal y se calculaba horizontal no había contradicción, pero
sí una estructura que no se monta así. Ahora la lectura de las dos aguas dice cuánto se inclina su
cumbrera con el terreno, igual que la del seguidor dice lo del eje.

**Hueco CERRADO (2026-08-27)**: el core la sabe inclinar desde SolarGPT #185 y el careo la mira
desde que el golden declara `along_axis_slope_deg` (6°, distinto del 8° de la ⊥ a propósito: dos
números iguales harían invisible confundir una componente con la otra).

**Y no era un puerto: son dos derivaciones independientes.** La ficha rota el marco de proyección
—`psTSAT` con la inclinación de la cumbrera, y `tiltSup` para la superficie— y el core compone el
plano: calcula la inclinación y el azimut resultantes y transpone normal. Dos caminos escritos con
horas de diferencia, y **coinciden al 0,00 %** de POA (0,005 pp en Δ), dentro del 0,1 % que exige el
careo. Con la cumbrera a 6°, la E-O sube de 69,08 a 73,20 kWh/m² en los doce días del fixture.

**Lo que se rompió al cerrarlo, y es el hallazgo**: el centinela de PORTAL-BUG-01 marcó `fija_ew`
como deriva del core. No lo era — es **otro escenario**: sus números congelados son de una corrida
con cumbrera plana. A ese centinela le faltaba una condición que ahora está escrita: sus cifras son
evidencia de una deriva de FÍSICA y sólo se pueden comparar contra una corrida de la MISMA
configuración. La exención va con motivo, fecha, test de zombis y un mínimo de estructuras — un
centinela que se queda sin sujetos deja de ser evidencia de nada. Sigue testificando sobre cinco.

#### Lo que se sale del encuadre, dicho

Los bloques van en línea sobre la curva de nivel y el campo mide cientos de metros, así que
orbitando bajo el más cercano se cae por debajo del borde: **una estructura de la comparación
desaparece de la escena sin decir nada**, y se lee como que no se ha dibujado. No es culling —está
ahí, con sus mallas; medido, 24 de sus 26 mallas quedan fuera del frustum— sino encuadre, y pasa
desde que los bloques se alinean. Se comprobó que no es una regresión corriendo el mismo barrido
sobre la versión anterior: mismos ángulos, mismos ceros.

Ahora se nombra sobre el lienzo —«fuera del encuadre: tilt óptimo»— y pulsando se recentra. La
prueba es por las **ocho esquinas** de la caja de cada bloque, no por su esfera envolvente: una fila
mide 65 m, así que su esfera roza el encuadre casi siempre y el aviso no saltaba nunca. Detrás de la
cámara la proyección se da la vuelta, así que se trata aparte: entero detrás es estar fuera, a
caballo del plano de la cámara se da por visible.

#### El backtracking, con la pendiente

`FIS.theta` acepta la pendiente ⊥ a las filas y backtrackea **con ella**, que es lo que hace
`pvlib.tracking.singleaxis` con `cross_axis_tilt`:

```
d = 1 / (GCR · cos x)        separación entre ejes, corregida
t = |d · cos(ψ − x)|         y si t ≥ 1 no hay sombra que evitar
θ = ψ − signo(ψ) · acos(t)
```

Con `x = 0` sale la de siempre, cifra a cifra. Con la pendiente metida, la sombra residual del
seguidor con backtracking se va a **0,0000**: era 4,3 % a 8° sin ella.

El core lleva `cross_axis_tilt` desde **SolarGPT v1.70.0** (mismo día, `solargpt_core/poa.py` — la
llamada a `pvlib.tracking.singleaxis` iba sin él mientras el sombreado sí llevaba el
`cross_axis_slope`). Hay **un solo modelo** y el careo entra por él: a 8° el core da **0,16 %** de
sombra residual y la ficha **0,20 %**, contra los 3,74 / 4,11 de antes.

Queda un `backtracking en llano` **desmarcado**, y es un **diagnóstico**, no una alternativa:
calcula el ángulo como si el campo fuese llano —lo que hacía el core hasta ese día— para poder ver
de un vistazo lo que cuesta backtrackear mal en un campo en cuesta, que es un número que quiere
cualquiera que herede uno. La tabla lo grita cuando está puesto, porque si no alguien lo deja
marcado y compara contra el modelo viejo sin saberlo.

El aviso sale del modelo con el que se **corrió** la tabla (`REP.btLlano`), no del interruptor vivo:
marcarlo sin volver a comparar cambiaría el texto dejando debajo los números de la tirada anterior.

#### Las hincas de la fija

Dos, una en cada punta, era lo que había — y desde casi cualquier ángulo se veía **una**. Una mesa de
65 m sobre dos postes no es una estructura, es un puente. En campo la hinca va cada **4-6 m**, que es
lo que aguanta el viento y lo que da el perfil, así que se reparten a paso ≤ 6 m entre las dos
puntas. Todas miden lo mismo, porque la fila ya se ha inclinado con el terreno: lo que absorbe la
pendiente es el **replanteo**, no una hinca más larga.

#### La bifila, con el render de la casa

Qué distingue una bifila de dos monofilas no me lo invento: lo resuelve el propio modelo de la casa
—`Seguidor.buildBeam`, el mismo que usa el **bt3d**—. `west:true` da la viga del **motor**, con su
slew completo, TCU, abarcones y antena; `west:false` la viga **gemela**, la del eje de transmisión,
que lleva módulos y correas pero del slew solo las piezas `twin`: corona, bracket y soporte. En un
par bifila, la primera viga es la motriz y la otra la gemela; en monofila todas llevan el suyo.

Antes de esto había una barra dibujada a mano entre filas, con **una caja en medio a modo de motor**.
No era el render de la casa, y en pendiente además quedaba colgando entre una fila y otra porque se
dibujaba a altura fija.

Lo que sí hace falta —y al quitar la barra se quedó sin dibujar— es el **eje** que une las dos vigas:
la gemela no tiene motor, la mueve la motriz. Va de **corona a corona** (en `seguidor.js` la corona
está en el centro del tubo), es un tubo del mismo acero con su brida en cada extremo, y **nada en
medio**: el motor ya está donde tiene que estar, en el slew de la viga motriz. Se le pasan las cotas
de las dos filas, porque en pendiente no están a la misma altura.

#### Lo que esta tabla NO puede decidir: backtracking sí o no

Dos cosas que hay que decir en cuanto aparecen las dos filas de seguidor, porque el número invita a
leer justo lo contrario de lo que dice:

1. La comparación es de **POA**, y la pérdida por sombra entra como **fracción sombreada del plano,
   lineal**. En un string real una sombra parcial cuesta mucho más que su fracción —el módulo tapado
   arrastra a la serie— y eso aquí no se ve. Así que **por POA el backtracking casi nunca gana**:
   renuncia a apuntar para quitarse una sombra que este modelo cobra barata. Lo que lo decide es la
   energía DC/AC, y eso es otra ficha.
2. El ángulo de backtracking se calcula **en llano**, que es lo que hace el core (y por eso el careo
   cuadra). Con pendiente ⊥ a las filas deja de evitar la sombra: la fila de al lado está más alta y
   sigue tapando. `pvlib` sabe hacerlo con la pendiente (`cross_axis_tilt`); el core no lo usa, y la
   ficha no se lo va a inventar por su cuenta — lo dice y ya.

Va en la nota de la tabla, y la segunda parte solo cuando hay pendiente ⊥ que la justifique.

#### Una fija monoinclinada NO sigue el terreno: lo compensan las hincas

Un seguidor sí sigue el terreno a lo largo de su eje —eso *es* un eje inclinado—. Una **fija
monoinclinada no**: se monta al **tilt de proyecto** y lo que compensa la pendiente a lo largo de sus
filas es la **longitud de las hincas**. Con 12° de cuesta la mesa sigue a 25°.

Antes se escoraba la mesa entera con el suelo, que es lo que hace un seguidor: el tilt dibujado
dejaba de ser el tecleado, y hubo que poner un aviso diciéndolo. Ese aviso sobra ahora — el tilt del
cálculo y el del dibujo vuelven a ser el mismo.

Cada lectura de fija dice el **rango de hinca** que sale, porque es lo que dice si la estructura se
puede montar: con 12° a lo largo de una fila de 65 m van de **0,3 a 8,8 m**. Y cuando la hinca
saldría **negativa** —el terreno se ha comido la mesa por ese lado— se declara: `hay que bancalear`.
Con la pendiente ⊥ a las filas, en cambio, las hincas ni se enteran: todas iguales, y las filas se
escalonan.

#### El backtracking, con la pendiente

`FIS.theta` acepta la pendiente ⊥ a las filas y backtrackea **con ella**, que es lo que hace
`pvlib.tracking.singleaxis` con `cross_axis_tilt`:

```
d = 1 / (GCR · cos x)        separación entre ejes, corregida
t = |d · cos(ψ − x)|         y si t ≥ 1 no hay sombra que evitar
θ = ψ − signo(ψ) · acos(t)
```

Con `x = 0` sale la de siempre, cifra a cifra. Con la pendiente metida, la sombra residual del
seguidor con backtracking se va a **0,0000**: era 4,3 % a 8° sin ella.

El core lleva `cross_axis_tilt` desde **SolarGPT v1.70.0** (mismo día, `solargpt_core/poa.py` — la
llamada a `pvlib.tracking.singleaxis` iba sin él mientras el sombreado sí llevaba el
`cross_axis_slope`). Hay **un solo modelo** y el careo entra por él: a 8° el core da **0,16 %** de
sombra residual y la ficha **0,20 %**, contra los 3,74 / 4,11 de antes.

Queda un `backtracking en llano` **desmarcado**, y es un **diagnóstico**, no una alternativa:
calcula el ángulo como si el campo fuese llano —lo que hacía el core hasta ese día— para poder ver
de un vistazo lo que cuesta backtrackear mal en un campo en cuesta, que es un número que quiere
cualquiera que herede uno. La tabla lo grita cuando está puesto, porque si no alguien lo deja
marcado y compara contra el modelo viejo sin saberlo.

El aviso sale del modelo con el que se **corrió** la tabla (`REP.btLlano`), no del interruptor vivo:
marcarlo sin volver a comparar cambiaría el texto dejando debajo los números de la tirada anterior.

#### Las hincas

Una fila de 65 m sobre uno o dos postes no es una estructura: es un puente, o un balancín. La fija
llevaba **dos**, una en cada punta; el seguidor, **una**, la del accionamiento. En campo la hinca va
cada 4-6 m en una fija y cada 6-9 m en un seguidor —es lo que fija el vano entre rodamientos, y con
él el momento y la sección del tubo—, así que se reparten a ese paso a lo largo de la fila. En el
seguidor no se repite la del accionamiento: esa la pone el propio modelo (`soporte`, y en la gemela
también, que es pieza `twin`).

#### Los lienzos 2D, nítidos

Los `width`/`height` de un `<canvas>` son el **búfer en píxeles**, y el CSS lo estira. Estaban fijos
en 1.100 px de ancho y el CSS los ponía al 100 % de la tarjeta, así que el navegador **ampliaba** el
dibujo: en una tarjeta más ancha, o en cualquier pantalla a 2×, las letras salían pixeladas. No era
la fuente, era el lienzo.

`lienzo(c, altoCss)` dimensiona el búfer al tamaño real **por `devicePixelRatio`** y escala el
contexto, así que el resto del código sigue dibujando en píxeles lógicos y no se entera. El alto
lógico se conserva —el del atributo— para que las proporciones no dependan del ancho de la ventana.

Dos consecuencias que hubo que atender:

* el búfer ya no se estira solo, así que al cambiar el ancho hay que **repintar**. No basta con el
  `resize` de la ventana: la tarjeta de resultados aparece cuando ya se ha dibujado, y al maquetarse
  cambia el ancho de sus lienzos — el primer dibujo salía a 960 px y la tarjeta se quedaba en 626.
  Va con un `ResizeObserver` que repinta solo si cambió el **ancho** respecto al último pintado, que
  es lo que evita realimentarse con el alto que fija `lienzo`;
* al pasar a la anchura real, lo que se dibujaba a tamaño fijo ocupa más fracción: la columna de
  rótulos del ranking pasa a ser un tercio del ancho en vez de 250 px, los rótulos se recortan por lo
  que **miden** y no por número de letras, y la leyenda tiene una versión corta para cuando la larga
  no cabe.

#### Brújula, y la cámara donde uno quiera

Con **tres azimutes** en juego —el del terreno, el de la fija y el del eje— y la cámara orbitando, no
había forma de saber dónde cae el norte, así que ninguno de los tres se podía leer en la escena. Va
una rosa 2D encima del lienzo, que es lo que se lee de un vistazo a cualquier ángulo, con:

* **N/S/E/O** girando con la cámara;
* la **flecha de máxima pendiente** — hacia dónde cae el terreno — cuando la hay;
* el **sol**, que es lo que dice hacia dónde van las sombras.

El truco es pasar una dirección del mundo a un ángulo de pantalla: la cámara mira en la dirección `v`
(del ojo al objetivo), así que en planta «arriba» en pantalla es `v` y «derecha» es `v` girado −90°;
el ángulo horario de cualquier dirección `w` es entonces `atan2(w·derecha, w·arriba)`. (La flecha de
pendiente se dibuja hacia **arriba** como la aguja, porque ese ángulo se mide desde arriba: dibujada
hacia abajo, rotarla 180° la dejaba apuntando al norte con el terreno cayendo al sur.)

Y **ni la cámara ni el objetivo bajan del suelo**. `maxPolarAngle` solo impide bajar del plano
horizontal que pasa por el objetivo, y eso no basta en cuanto hay pendiente o se desplaza la vista:
con la ladera subiendo, el suelo bajo la cámara puede estar por encima de ella y la escena se ve
desde dentro de la tierra. Se acota contra el terreno de verdad —que con un plano cuesta dos
multiplicaciones—: la cámara a 1,5 m del suelo, el objetivo a 0,5.

Y la **cámara es libre**. El botón derecho ya desplazaba, pero cada reconstrucción —y se reconstruye
al tocar cualquier campo— devolvía la vista a su sitio, así que en la práctica no se podía mirar a
otro lado. En cuanto el usuario la toca, la escena deja de recolocarla: manda él hasta que pulse
**recentrar**. El tope de zoom se estira además con la escena, porque con seis bloques en pendiente
el límite fijo de 1.200 m dejaba la rueda muerta antes de ver el campo entero.

#### Y que se VEA: sombreado por cota y CURVAS DE NIVEL

Con el terreno bien hecho la pendiente seguía sin verse, y no era el modelo: a mediodía de junio el
sol está a **76°** —casi cenital— y una ladera de 16° recibe casi la misma luz que el llano, así que
el suelo salía de un verde plano y uniforme. El terreno lleva un **tinte por altura** (claro arriba,
oscuro abajo, como un mapa hipsométrico), en color de vértice sobre el mismo material. Hace legible
el relieve a cualquier hora.

Y **curvas de nivel**, porque el tinte solo no basta: se normaliza sobre todo el suelo —que es mucho
más grande que la parcela— así que junto a las estructuras apenas varía y la ladera se lee plana. Una
banda cada `paso` metros de cota da la pendiente de un vistazo a cualquier zoom, y es la convención
de cualquier plano topográfico. El paso se elige para que salgan una decena de curvas en la zona de
trabajo, redondeado a 1-2-5. La malla del suelo sube a 220×220: las curvas se interpolan entre
vértices y con celdas de seis metros salían con dientes de sierra.

Cada lectura de la escena dice además **cuánta pendiente ⊥ ve esa estructura**: sin eso, dos bloques
sobre el mismo plano con sombras distintas parecen un error del dibujo.

#### Es UN terreno, y mueve el resultado

Que la pendiente entra en la **física** y no solo en el dibujo se exige con un test. A 12° en
Sevilla, con la pendiente entrando como cross-axis en las tres familias:

| | sin pendiente | con 12° |
|---|---|---|
| Fija · tilt de proyecto | 0,17 % | **0,00 %** |
| Tracker N-S · backtracking | 0,00 % | **6,44 %** |
| Tracker N-S · sin backtracking | 6,37 % | **9,18 %** |

La pendiente **le quita** sombra a la fija —las filas se escalonan y dejan de taparse— y **se la
pone** al seguidor. O sea que cambia el resultado de la comparación, que es justo para lo que está.

#### Lo que destapa: con pendiente, el backtracking deja sombra

El ángulo de backtracking se calcula **en llano**. Con el terreno inclinado, la fila de al lado no
está donde ese cálculo supone, así que **deja de evitar la sombra**:

| | sombra con backtracking |
|---|---|
| terreno llano | **0,00 %** |
| pendiente 8° | **4,11 %** |

Y no es un artefacto de la ficha: el core da 3,74 % en el mismo caso. El careo se genera ahora con
**8° de pendiente** precisamente para que el signo y la fórmula no puedan pasar por casualidad — la
POA queda dentro del 0,8–2,1 % del canónico y los Δ% dentro de 1,4 pp, con el orden idéntico.

### Dónde cae la sombra de cada familia

La fija **sí** proyecta sombra —todas sus mallas la proyectan y el suelo la recibe—, pero mira al
ecuador y por tanto la tira **hacia el polo**: al fondo desde la cámara por defecto, y detrás de
sus propias filas. Con seis bloques marcados el encuadre está tan lejos que además mide cuatro
píxeles. Hay que orbitar al otro lado, o dejar menos estructuras marcadas para que el encuadre se
acerque. Las del seguidor caen de lado y se ven de frente — de ahí la impresión de que la fija no
tiene.

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

### Una mesa que no cabe en el pitch: plano, y dicho

Con **3V a pitch 6** la apertura son 7,146 m y no caben en 6: **GCR 1,19**. La tarjeta ya lo
rechazaba en rojo y desactivaba el botón, pero la **escena seguía dibujando**, y lo que dibujaba
era un disparate: el seguidor salía a **−32,6° a mediodía** y girando al revés.

No era el render: era la fórmula del backtracking. `θ = ps − signo(ps)·acos(cos ps / GCR)` — con
GCR ≤ 1 el retroceso nunca llega a `|ps|`, pero con GCR > 1 **pide retroceder más de lo que ha
avanzado**, cruza el cero y devuelve el ángulo con el signo cambiado.

El arreglo es la regla física: **el backtracking solo reduce |θ|, nunca lo invierte**. Retroceder es
aplanarse para no taparse; pasarse del cero sería tumbarse hacia el otro lado, que no evita ninguna
sombra — la crea. Con GCR ≤ 1 la cota **no actúa nunca** (el careo lo confirma: sigue idéntico), y
con GCR > 1 el seguidor se queda **plano**, que es lo único honesto cuando la geometría no existe.
La escena lo dice: `— · GCR 1,19: no cabe`.

Abriendo el pitch a 9 m la misma mesa 3V vuelve a girar con normalidad.

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
node tests/test_comparador.js       # 143 comprobaciones · careo contra el core, sin navegador
python3 -m http.server 8099         # (en otra terminal, para el 3D)
node tests/test_comparador_sitio.js # 36 comprobaciones · el buscador de emplazamiento
node tests/test_comparador_3d.js    # 138 comprobaciones · escena, equipos y sizing
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
