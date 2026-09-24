# Puertas y alcance — cómo se comprueba una comprobación

> Documento transversal. No pertenece a ningún proyecto: es el estándar que
> aplicamos en todos, y el sitio donde se apuntan los casos reales que lo han
> ido afilando. Vive aquí porque este repo es el panel y su `docs/` es lo que
> alcanza a todos.

---

## La regla, en una frase

**Una puerta verde afirma dos cosas: «he mirado» y «está bien». Durante mucho
tiempo sólo comprobábamos la segunda.**

El 23 de septiembre de 2026 encontramos **siete** puertas que miraban donde no
debían. Las siete funcionaban sobre lo que miraban: romperles el dato de dentro
las ponía rojas, como debe ser. Ninguna decía **cuánto** había mirado.

Romper una puerta prueba que **reacciona a lo que mira**. No prueba que **mire
donde debe**. Son dos fallos distintos y el segundo es el caro, porque produce
un verde tranquilizador en vez de un rojo.

---

## 1 · Los tres estados

Un código de salida binario no alcanza, porque «no he podido comprobarlo» no es
ni un aprobado ni un suspenso. La convención:

| rc | estado | significa |
|---:|---|---|
| **0** | **MIDE** | ha mirado lo suficiente **y** está bien |
| **1** | **ROJO** | ha mirado y está mal |
| **2** | **NO COMPROBADO** | no ha podido mirar, o no lo suficiente |

Y donde se informe del resultado —resumen de la corrida, anotaciones, cualquier
agregador— los tres tienen que salir **distintos**. Un `rc = 2` pintado del
mismo verde que un `rc = 0` es exactamente el defecto que esto viene a impedir.

**Un `rc = 2` no pone el job en rojo.** Un clonado caído por red no es un
hallazgo. Pero tampoco pasa callando: sale como aviso visible y en el resumen.

### Los dos errores simétricos

Los dos se han dado en esta casa el mismo día, y conviene tener los dos
presentes:

- **«no comprobado» contado como verde** — el caso común, el peligroso;
- **«no comprobado» contado como rojo** — manda a buscar un defecto que no
  existe y, peor, invita a relajar la guardia para «arreglarlo».

---

## 2 · El patrón del piso (de `factiun-cartera/tests/correr.sh`)

El estándar no lo inventamos hoy: estaba escrito en `factiun-cartera` desde
antes y es más fuerte que nada de lo que había alrededor.

> Un banco está verde si **sale con 0**, **y** no imprime ninguna línea de
> fallo, **y** publica al menos `PISO` comprobaciones. **El vacío es ERROR, no
> PASS.**

### Qué lo hace funcionar

- **El piso se MIDE**, corriendo el banco, y se anota **exacto**. Crecer no
  rompe nada —el piso es un mínimo— y así el día que un banco pierda una
  comprobación se entera alguien.
- **Sólo se BAJA a propósito**, con el motivo escrito al lado, para que el
  cambio se vea en el diff.
- **Un banco nuevo sin piso es ROJO**, no «pendiente». Sin esto, un banco entra
  en el repo y no lo vigila nadie.
- **Una exención sobre un fichero borrado es ROJO.** Una exención escrita es lo
  contrario de un banco sin vigilar: tiene dueño y se ve en el diff.
- **Un formato de salida que el lector no reconoce es `rc = 2`, no `rc = 1`.**
  Cero no es el recuento: es que no se ha sabido leer. Y el mensaje tiene que
  decir expresamente que **no se baje el piso** por eso.

### Lo que el piso caza y el código de salida no

Un banco recortado a 3 de 13 comprobaciones sale con 0 e imprime
`TODO OK — 3 comprobaciones`. Verde perfecto. El piso lo para.

---

## 3 · El alcance

Cada puerta publica **cuántos ficheros, casos, plantas, pasos o líneas examina,
de cuántos existen**. Y cuando el alcance es parcial o cero, sale con `rc = 2` o
en rojo, **nunca en verde**.

Ese número es el único que caza el fallo de mirar donde no se debe. Los siete
casos de abajo lo demuestran: **los siete pasaban la prueba de «rómpela y mira
si salta»**.

### Los siete casos reales (2026-09-23)

| # | puerta | miraba | de cuántos |
|---|---|---|---|
| 1 | la regex de la HSU | se paraba en el paréntesis de `projX(glon)` | — |
| 2 | `auditoria_verdes.mjs` (Siting) | 3 ficheros | de 17 pasos |
| 3 | `careo_terreno_3d.mjs` (Siting) | 1 planta | de 11 |
| 4 | `gate_ps1_planta.py` (Cobertura-Zigbee) | **0 ficheros `.ps1`**, y decía «ninguno se rompería» | de 6 |
| 5 | `test_una_holgura.js` (Siting) | 2 ficheros | de 7 |
| 6 | el corredor de mutaciones (Siting) | 136 mutaciones | de 140 |
| 7 | `alcance_mutaciones.mjs` (Siting) | 1 aparición del nombre en el YAML | de todas |

Merece detenerse en tres:

- **El nº 4 lo decía en su propio nombre.** El paso se llamaba «se salta sin la
  toolbox de scada» y su comentario remataba «que conste que hoy no vigila
  nada». Salía verde igual. **El agregador lee el código de salida, no el
  comentario.**
- **El nº 5 afirmaba algo de todo el repo** —«el despeje de una fila lo da UNA
  sola función»— y miraba dos ficheros. Metiendo una segunda en otro fichero
  seguía dando `TODO OK — 13 comprobaciones`.
- **El nº 7 es el comprobador de alcance**, y tenía el defecto que busca: tomaba
  la primera aparición del nombre del banco en el YAML, que estaba en un
  comentario 170 líneas por encima de la invocación real. Daba «0 de 24
  mutaciones corridas» — un titular falso.

### Y los guardias nuevos son puertas también

Al aplicarles la misma pregunta, **dos de los cuatro** la fallaban, y uno de
ellos era el comprobador de alcance por segunda vez:

| guardia | tenía | ahora |
|---|---|---|
| corredor con pisos | ✅ un banco nuevo sin piso ya salía rojo | + publica alcance y se para si hay bancos fuera del barrido |
| envoltorio de recuentos | ❌ formato ilegible salía **ROJO** | `rc = 2`, y el mensaje prohíbe bajar el piso por eso |
| censo MIDE/NO COMPROBADO/ROJO | ❌ no sabía **cuántos esperaba** | lleva `ESPERADOS` y se para en 3 de 4 |
| `alcance_mutaciones` | ❌ **100 % sobre un conjunto que podía encoger** | publica el denominador, con piso de bancos con tabla |

El último es el más ilustrativo del documento entero: decía «140 de 140
mutaciones» y, borrando un bloque `MUTACIONES` completo, pasaba a «134 de 134»
—**100 % igualmente**— y seguía verde.

*(Y una más, del propio proceso de medirlos: la comprobación de si el censo
sabía cuántos esperaba buscó el «4» en su bloque y lo encontró dentro de un
`%-44s`. Respondió «sí» cuando era «no». Nueve en un día.)*

### Los TRES tipos de fallo de una puerta

Hasta aquí van dos. Hay un tercero, y no se encuentra mirando la puerta.

| | qué pasa | cómo se caza |
|---|---|---|
| **no reacciona** | la puerta no salta cuando debía | rómpela a propósito |
| **mira donde no debe** | salta bien sobre lo poco que mira | publica su **alcance** |
| **reacciona de más** | salta también donde NO debía | **otro banco**, en otra parte del sistema |

El tercero es distinto de los dos primeros porque **la puerta está bien en su
propio caso**. Es correcta, dispara cuando toca, tiene su negativa probada — y
además rompe algo que nadie le había preguntado.

**El caso, de este mismo día.** Al meter la NCU en el careo, el motor le puso
la altura de antena de un seguidor (0,505 m en vez de 3,15) y tres enlaces
salieron «acierto» calculados mal. El arreglo trajo una puerta:

> un nodo que **no es un seguidor** y no declara su antena, no se evalúa.

Correcta en su caso, con su banco y su negativa. Y el mapa de cobertura pasa
puntos `{x, y}` **pelados** a propósito: son receptores hipotéticos del raster,
no equipos. La puerta los mataba a todos — **0 de 500 enlaces con margen en las
cuatro plantas**.

No lo vio el banco de la puerta, que estaba verde. Lo vio `test_rf_panel.js`,
que mide otra cosa en otro sitio. La regla buena resultó ser más estrecha: *«se
declara equipo y no dice su antena»*, y entonces el raster sigue igual.

**Lo que se lleva de aquí:**

- una puerta nueva no está probada con su propio banco en verde: hay que correr
  **los del resto del sistema**, y el corredor con piso es lo que lo hace
  barato;
- cuando una puerta nueva pone algo en rojo, la primera pregunta no es «¿qué
  hay que arreglar?» sino **«¿es la puerta la que está mal?»**;
- y las reglas formuladas en negativo —«todo lo que no sea X»— son las que más
  se pasan de frenada: barren casos legítimos que nadie tenía en la cabeza al
  escribirlas.

### Un aviso que sale de probarlas

Una **mutación que no casa con el código** es `rc = 2`, no «no cazada». Al mutar
`-UseBasicParsing` con un `sed` que buscaba el guion, la mutación no casó —en el
splat va `UseBasicParsing = $true`, sin él— y la puerta salió verde. Estuvo a un
segundo de apuntarse como «regla dormida».

Y al revés: **un mutante que no modela lo que dice modelar no prueba que el
banco vigile; prueba que el mutante no llegó.**

---

## 3 bis · Una puerta que nadie mira no es una puerta

Los tres tipos de arriba son fallos DE la puerta. Éste no: la puerta puede
estar perfecta —bien construida, con su piso, su alcance publicado y su
negativa probada— y no servir para nada, porque nadie está mirando lo que dice.

**El caso, del 2026-09-24.** Al añadir cuatro mutaciones al corredor de
`siting`, se partió una línea de continuación: `py_refl_pol \ \` y la
siguiente sin barra. Bash leyó los diecisiete nombres que venían detrás como
ÓRDENES, no como argumentos:

    py_sin_guarda: command not found
    Process completed with exit code 127

Consecuencias, medidas:

| | |
|---|---|
| mutaciones declaradas que dejaron de correrse | **17** |
| corridas de CI seguidas en rojo | **5** (288 a 292) |
| tiempo con el CI rojo | un día entero |
| lo que decía el auditor de alcance | «140 de 140» |

Y el auditor no mentía por estar mal escrito: comprobaba que las claves
**aparecieran** en el YAML. Aparecer no es correrse. El útil escrito
precisamente para cazar alcances parciales tenía dentro el defecto que caza.

**Los dos defectos, que no son el mismo.** La línea partida es un error de
edición: se arregla en un minuto y no vuelve a pasar igual. Que pasaran CINCO
corridas sin que nada avisara es otra cosa, y es peor, porque no depende de
ese error concreto: cualquier otro habría durado lo mismo.

### Lo mínimo que lo cierra

Dos costumbres, y una de ellas es un comando para que no dependa de acordarse:

1. **Al empezar**, `bash docs/ci_al_dia.sh`: el último CI de la rama principal
   de cada repo de la suite, en una tabla, y se dice en voz alta ANTES de tocar
   nada. Es barato a propósito —una llamada por repo—, porque una comprobación
   cara al arrancar se acaba saltando. Tiene los tres estados: rojo es rojo, y
   un repo que no se ha podido consultar sale `NO MIRADO`, no verde.
2. **Al empujar**, una tarea no está cerrada hasta ver cerrar su corrida. Un
   `git push` que sale bien no dice nada sobre la CI: sólo dice que el objeto
   llegó.

La primera vez que se corrió `ci_al_dia.sh` encontró dos cosas que nadie sabía:
`gemelo-digital` con su despliegue de Pages en rojo, y un repo que salía como
«no responde» porque **lo habían renombrado** —`visor-san-jose` → `visores`— y
GitHub redirige el nombre viejo a una ruta que el proxy no deja pasar. Un repo
renombrado desaparecía del radar en silencio, que es la misma avería otra vez a
otra escala.

### Y una comprobación de mutaciones que sí ejecuta

`alcance_mutaciones.mjs` ya no busca los nombres en el texto del workflow:
extrae el script del paso, sustituye el corredor por un registrador y lo
EJECUTA. Lo que salga de ahí son los pares (banco, mutación) que la CI pasa de
verdad. Probado en negativo por tres vías —continuación rota (rc = 127),
argumento vacío, y una clave quitada del paso—, las tres rojas.

Y como `tests/correr.sh` corre bancos pero NO mutaciones, un cambio en el motor
puede dejar el ANCLA de una mutación apuntando a código que ya no existe con
todos los bancos en verde. Pasó el mismo día con `terrenoDeygout`. Por eso hay
`tools/correr_mutaciones.sh`, que extrae y ejecuta el mismo paso de la CI —no
una segunda lista, que se separaría de la primera en una semana—.

## 4 · El mismo mecanismo fuera de la CI: los agregados

Esto no es una manía de la integración continua. **Un número correcto calculado
sobre el conjunto equivocado** es el mismo fallo, y hace el mismo daño: produce
una cifra tranquilizadora, con todos sus decimales bien, sobre algo que nadie ha
mirado.

La pregunta es idéntica a la del alcance: **¿sobre qué se ha calculado esto, y de
cuánto?**

### Cuatro que estuvieron a punto de publicarse

| el número | parecía decir | lo que pasaba de verdad |
|---|---|---|
| **p50 = 0,00 m** de error del DEM | «el DEM es perfecto» | promediado sobre toda la malla, donde los dos ficheros son **el mismo DEM por construcción**: el empalme sólo actúa cerca de las filas. Restringido a ≤30 m de un seguidor: **0,78 m** en Ayora y **1,20** en San José |
| **media +1,1 dB** del careo de El Burgo | «el motor está centrado» | esconde **+27,1 dB** con 0 filas cruzadas y **−28,4** con 24. Los dos errores se compensan en la media y la media no valida nada |
| **el relieve, agregado** | un dB de relieve «de la planta» | las bandas van de **0,000 a 8,438 de mediana** y hasta 23,8 de máximo: promediarlas da el número que uno quiera según cuántos vanos cortos tenga la muestra, y la muestra la elige la malla, no la física |
| **100 % de mutaciones corridas** | «todas vigiladas» | 100 % **de los bancos que tienen tabla**. Borrando un bloque entero pasa de «140 de 140» a «134 de 134» — 100 % igualmente — y sigue verde |

El cuarto es de la propia CI y los tres primeros son de física, y por eso vale la
pena tenerlos juntos: **es el mismo mecanismo**. La media, el percentil y el
porcentaje son todos agregados, y un agregado sin su denominador y sin decir
sobre qué población se ha tomado no es un resultado — es una impresión con
decimales.

### La regla

> Un agregado se publica **con su n y con su población**, y **separado por la
> variable que tenga estructura fuerte** (banda de vano, filas cruzadas, zona
> donde el dato es distinto). Si hace falta un solo número, que sea por
> categoría y con su n; nunca uno solo.

Y el aviso que acompaña a los tres primeros, escrito en su sitio
(`Siting/TERRENO_FUENTE.md`): **ESTA TABLA NO SE AGREGA. NUNCA.**

### La regla del resultado demasiado bueno

> **Un resultado demasiado bueno es un defecto hasta que se demuestre lo
> contrario.** Cero exacto, 100 %, error nulo, perfecto: antes de publicarlos,
> **comprobar el denominador y la población**. En los cuatro casos el número era
> correcto; lo que estaba mal era **sobre qué se calculó**.

Ninguno se cazó revisando el cálculo: **careándolo con lo que uno acababa de
afirmar**. Un p50 de 0,00 m dicho en voz alta suena a «el DEM es perfecto», y
eso es increíble para un DEM de 7 m de píxel — ir a ver por qué salía cero fue
lo que destapó que el denominador estaba mal.

Por eso la regla se aplica **antes de publicar**, no después: el momento en que
el número suena demasiado bien es el único aviso que va a haber.

### Y fuera de los números: la fuente equivocada

El mismo mecanismo se da sin ningún agregado de por medio. Comprobando si ocho
repos habían subido sus cambios, la comprobación fue:

```
git log --oneline origin/<rama>..HEAD     # «1 commit sin empujar»
```

La pregunta era **la correcta**. La fuente, no: `origin/<rama>` es una **ref
local de seguimiento**, y en un clon superficial puede no actualizarse nunca. El
commit estaba en el remoto desde el principio. La fuente buena es la que
pregunta al remoto:

```
git ls-remote origin <rama>               # la verdad
```

Falso positivo esta vez —hacer ruido sobre algo que estaba bien— pero el fallo
simétrico es el que importa: **con la ref local adelantada, la misma
comprobación habría dicho «todo subido» sobre algo que no lo estaba.**

> Antes de creerse una comprobación, preguntar de dónde saca el dato. Una caché,
> una ref local, un fichero generado y un comentario son fuentes que **pueden
> haber dejado de ser ciertas** sin que nada avise.

---

## 5 · La puerta agregadora

Un repo con varios jobs necesita **un solo check** que mire a todos, con `needs`
de cada uno:

```yaml
if: always() && !cancelled()
# y la condición, con != success y NO == failure:
#   «cancelled» y «skipped» tampoco son un verde
```

Así la protección de rama exige **una sola cosa** y un job nuevo entra vigilado
el día que se escribe, sin tocar ajustes.

Un job declarado como informativo (`continue-on-error` a nivel de job) se deja
**fuera de la condición** pero **con su estado publicado**: un aviso que nadie ve
no es un aviso. Y meterlo en el `if` sería una puerta de mentira, porque su
`result` es `success` aunque falle.

---

## 6 · Inventario (2026-09-23)

| repo | puerta agregadora | corredor con piso | alcance de la CI |
|---|---|---|---|
| **factiun-cartera** | — | ✅ **la referencia** · 17/17 | 17 de 17 bancos |
| **Proyectos** | — | ✅ 43/43 | 43 de 46 · **3 en `tools/`, fuera del barrido** |
| **Siting** | — | ✅ 19/19 + alcance publicado | 19 de 19 |
| **Cobertura-Zigbee** | ✅ `bancos en verde` | ⚠ 30 con piso, 3 sin recuento, **36 del visor sin medir** | 62 de 63 |
| **Gemelo-digital** | ✅ `arneses en verde` | — (sus útiles no son bancos `test_*`) | — |
| **cobertura-rf-fv** | ✅ `bancos en verde` | ❌ **sin pisos** | 9 de 10 |
| **SolarGPTfull** | — | ✅ suelo por suite (5.800 / 275 / 275) | 27 de 28 |
| **SCADA** | ❌ **sin puerta** | ❌ **sin pisos** | **1 de 9** |

### Lo que le falta a cada uno, en orden de hueco

1. **SCADA** — ni puerta agregadora ni pisos, y su CI alcanza 1 de 9 bancos.
2. **cobertura-rf-fv** — tiene puerta, le faltan los pisos.
3. **Cobertura-Zigbee** — los 36 bancos del job del visor sin piso medido
   (necesitan Chromium y el repo servido; medirlos es el trabajo, no una
   exención permanente), y 3 que no publican recuento.
4. **Proyectos** — 3 bancos en `tools/` que su corredor no barre.
5. **SolarGPTfull** — 1 banco de 28 fuera del alcance de la CI.

---

## 7 · El enlace a este documento, comprobado

Un original y enlaces desde cada repo; dos copias divergen. Pero **un enlace
roto a la guía de puertas sería el chiste final**, así que el enlace también es
una puerta: `docs/enlace_guia.sh`, en cada repo, con una línea en su CI.

Y se rige por lo que dice este documento:

- **publica su alcance** — cuántos `.md` ha mirado, cuántos traen el enlace;
- resuelve el fichero en el clon de `proyectos` que haya al lado, **el del pin**
  si el repo lo fija: eso lo hace verificable desde fuera y no sólo legible;
- si no hay clon, lo trae con `--depth 1` (proyectos es público, 2 s);
- **sin enlace es ROJO** —el repo debería tenerlo— y el enlace apuntando a algo
  que no está, también;
- **sin red y sin clon es `rc = 2`**, no verde: el enlace puede estar bien o
  roto y no se ha podido saber.

Probado por los tres caminos: documento ausente del clon → rojo; repo sin
enlace → rojo; sin clon y sin red → `rc = 2`.

---

## 8 · La lista de comprobación, para un repo nuevo

- [ ] ¿Hay una **puerta agregadora** con `needs` de todos los jobs, y `!= success`?
- [ ] ¿Cada banco tiene un **piso medido**, y un banco nuevo sin él sale rojo?
- [ ] ¿El **vacío es ERROR**, no PASS?
- [ ] ¿Cada puerta **publica su alcance**, y el alcance parcial sale `rc = 2`?
- [ ] ¿«No comprobado» sale **distinto** de «comprobado y pasa» en todos los sitios donde se informa?
- [ ] ¿Un formato de salida ilegible sale **`rc = 2`** y no rojo?
- [ ] ¿El **agregador sabe cuántos** debería haber contado?
- [ ] Y de cada puerta: **rómpela** (¿reacciona?) **y deprívala** (¿se entera de que no ha mirado?). Las dos, no una.

---

*Los casos de este documento están medidos, no razonados. Cada uno se encontró
corriendo la cosa contra datos reales y careando el resultado con lo que
acabábamos de afirmar — no revisando código.*
