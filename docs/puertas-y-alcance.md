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

### Un guardia puede ACERTAR EL VEREDICTO Y EQUIVOCAR LA CAUSA

**Y cuesta casi lo mismo que fallar el veredicto.** Manda a mirar donde no es,
gasta la mirada que se le pidió, y —lo peor— **enseña a desconfiar de sus
rojos**, que es cómo muere una guardia sin que nadie la borre.

**El caso (2026-09-24).** Después de mergear `solargptfull` #274, `reconcilia.sh`
sacó **ROJO** listando **diez ficheros** como «la rama aporta esto y no está en
main», y recomendó abrir un PR nuevo con ellos. Comprobado a mano, fichero a
fichero: **cero diferían**. Todo estaba dentro.

El veredicto —«no te fíes, mira»— no era descabellado. La causa que dio era
falsa. Lo que pasaba es que el PR se había actualizado **desde el servidor**
—el botón «Update branch», o la API—, y ese commit de fusión **nace en el
remoto**. El clon local se quedó uno por detrás, y la guardia comparaba una rama
rancia contra un `main` al día.

**Y es el mismo mecanismo que la ref local rancia de hace unos días:**

> **Preguntar a una referencia LOCAL en vez de al remoto.**

En `reconcilia.sh` estaba hecho bien para `main` —`fetch` explícito, y `rc = 2`
si no se puede— y no estaba hecho para **la propia rama**. Media pregunta contra
datos frescos y media contra datos viejos: eso no da media respuesta, da una
respuesta entera y equivocada.

**La regla:**

> Antes de comparar dos referencias, comprobar que **las dos** están al día. Y
> si una no lo está, eso no es un hallazgo sobre el trabajo: es `rc = 2`, porque
> **la pregunta no se puede contestar desde una copia vieja**.

**Y el remedio también hay que acertarlo, que es la segunda mitad.** El primer
arreglo decía «haz `git merge --ff-only`»… que **falla** cuando la local y la
remota han divergido, que es el caso real que apareció en `cobertura-zigbee` al
probarlo (2 commits de cada lado). Acertar el veredicto y equivocar el remedio
es la misma avería un escalón más abajo. Ahora distingue los dos casos, y **el
consejo se probó ejecutándolo** en vez de darlo por bueno.

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

1. **Al empezar**, `bash docs/al_empezar.sh` — **una sola orden**, que corre los
   dos guardias de arranque y da un veredicto junto:
   - `ci_al_dia.sh`: el último CI de la rama principal de cada repo de la suite,
     en una tabla, en voz alta ANTES de tocar nada. Barato a propósito —una
     llamada por repo—, porque una comprobación cara al arrancar se acaba
     saltando. Con los tres estados: rojo es rojo, y un repo que no se ha podido
     consultar sale `NO MIRADO`, no verde.
   - `reconcilia.sh` sobre **todos** los repos: ¿hay trabajo subido que **no
     esté en `main`**? Se añadió cuando se vio que dos commits llevaban tres días
     fuera sin que nada lo dijera (§3 quinquies). **Un hueco que aparece por
     casualidad al tercer día no está cubierto.**

   Los dos leen la MISMA lista de repos (`docs/repos.sh`): dos listas es una
   lista que se queda vieja, y el día que se añada un repo a una sola, el otro
   guardia deja de mirarlo sin que nadie se entere.
2. **Al empujar**, una tarea no está cerrada hasta ver cerrar su corrida. Un
   `git push` que sale bien no dice nada sobre la CI: sólo dice que el objeto
   llegó.

La primera vez que se corrió `ci_al_dia.sh` encontró dos cosas que nadie sabía:
`gemelo-digital` con su despliegue de Pages en rojo desde el 23-09, y el caso
de abajo.

### El repo renombrado: cuando la LISTA de lo vigilado se queda vieja

Todo lo anterior es «esta puerta mira poco de lo que hay». Éste es un escalón
más arriba: **la lista de lo que se vigila puede quedarse vieja y nada avisa**.

`visor-san-jose` pasó a llamarse `visores`. Con el nombre viejo, GitHub
responde `301` y redirige a `/repositories/{id}`, una ruta que el proxy de
estas sesiones no deja pasar. Resultado: el censo lo daba por «no responde», o
sea lo mismo que un repo caído — y un repo caído se persigue, pero uno que
lleva semanas en «no responde» se acaba leyendo como ruido. Su CI dejó de
mirarse sin que nada lo dijera.

Dos arreglos, y el segundo es el que importa:

1. **Distinguir el porqué.** «No responde» tapaba tres cosas distintas, y ahora
   se separan con el código medido, no supuesto:

   | | |
   |---|---|
   | `301` | **RENOMBRADO** — hay que buscar el nombre nuevo y corregir la lista |
   | `403` | sin permiso **o** no existe: el proxy devuelve el mismo código para los dos, y eso se DICE en vez de elegir uno |
   | `404` | no existe (fuera de este proxy) |
   | `000` | **RED** — no se ha llegado a hablar con GitHub |

2. **Exigir que respondan TODOS los declarados.** El piso dice «has mirado
   bastantes»; esto dice otra cosa: «has mirado **todos los que dices
   vigilar**». Si responden 10 de 11, el censo sale con `rc = 2` nombrando cuál
   falta y por qué, aunque los diez estén en verde. Un hueco en la lista no es
   un verde con una nota al pie.

Y una cosa salió de PROBARLO y no de leerlo: con un host inválido, `curl`
imprime `000` por `-w` **y además** sale con código distinto de cero, así que
el `|| echo 000` que parecía prudente producía `HTTP 000000`, que no casaba con
ningún caso y caía al comodín. El caso «sin red» —el más probable de los tres—
era el único que no se reconocía.

### Y una tercera: RESPUESTAS RANCIAS, y una corrección mía

El censo publicó una vez `cobertura-rf-fv#4 failure` cuando su última corrida
era la `#41 success`. **Escribí aquí que el `4` era el número de
`factiun-cartera`, la fila justo anterior, y que parecía un cruce de
variables. Era falso**, y lo desmontó mirar el historial completo del repo en
vez de sus doce últimas corridas:

    #4   bancos  failure  2026-09-09  rama=main   ← existe, y es de ESE repo
    #15  pages   success  2026-08-28  rama=main   ← también, y también salió

No era el número de otro repo: era **una corrida vieja del repo correcto**. Y
volvió a pasar dos veces más en la misma sesión, siempre igual: el endpoint
`actions/runs` devuelve de vez en cuando una **página entera de corridas
antiguas** como si fueran las últimas.

Eso cambia el arreglo por completo:

- **ordenar por fecha no sirve** — la página entera es vieja, así que la más
  nueva de una página rancia sigue siendo rancia;
- **el careo de identidad tampoco** — la respuesta ES del repo que se preguntó;
- **lo que sí sirve es carearla con la CABEZA DE LA RAMA.** Si el `head_sha` de
  la corrida no es el de la punta de la rama, esa corrida no dice nada sobre el
  código de hoy, venga de donde venga. Y entonces el censo NO da veredicto:
  dice `NO MIRADO` con el sha y la fecha de lo que ha leído.

Sobre la causa: **sigue sin explicar**. No reproduce a demanda —25 consultas
idénticas seguidas devuelven la buena las 25—, y lo único que se puede decir es
que las tres veces llegó una respuesta coherente pero caduca, lo que apunta a
una caché en el camino y no a un fallo del censo.

**Y un reintento, exactamente uno, sólo para esto.** Cuando la corrida no es de
la cabeza, se vuelve a preguntar una vez. Eso separa lo transitorio de lo real
sin tapar nada: `gorraiz-dashboard` dio una corrida de marzo una vez y luego 20
de 20 correctas —transitorio—; `factiun-cartera` da la de junio SIEMPRE, y ahí
no hay nada que reintentar. **Un rojo no se reintenta nunca**: el reintento
sirve para decidir si se ha leído bien, no para buscar otra respuesta.

### Lo que encontró en cuanto se puso

`factiun-cartera` — **el repo de donde sale el patrón del piso**, el que este
documento cita como origen de la regla — lleva desde el **17 de junio** sin una
sola corrida de CI sobre `main`. Y su workflow de bancos, con sus 19 ficheros
de prueba:

- se dispara **sólo con `workflow_dispatch`**: no corre ni al empujar ni en un
  PR, sólo cuando alguien le da a un botón;
- ha corrido **cinco veces en su vida**, las cinco el 2026-09-18, las cinco
  sobre una rama, y **las cinco en rojo**.

O sea que el patrón que le hemos copiado a ese repo —«verde es salir con 0 **y**
sin fallos **y** publicando al menos `PISO` comprobaciones»— nunca ha llegado a
aplicarse allí de forma automática, y la única vez que se corrió no pasó.

Es la cuarta lección aplicándose a su propia fuente: **una puerta que nadie
mira no es una puerta**, y da igual que la puerta esté bien escrita.

## 3 ter · La quinta: apagada A PROPÓSITO no es lo mismo que rota

Las cuatro anteriores son sobre lo que una puerta mira, o sobre que nadie la
mire. Ésta es sobre **confundir un estado con un defecto**.

El censo de CI encontró que `factiun-cartera` no tenía corridas sobre `main`
desde junio y que su flujo de bancos sólo se disparaba a mano, con 19 ficheros
de prueba detrás. Diagnóstico inmediato: descuido. Se abrió un PR de tres
líneas poniendo `push`/`pull_request`, y se fusionó.

**No era un descuido.** Era una decisión medida, tomada seis días antes y
escrita en la cabecera de ese mismo fichero, **doce líneas por encima del
bloque `on:` que se editó**:

> ⚠ ESTE FLUJO NO SE DISPARA SOLO, Y ES A PROPÓSITO.
> Este repo es PRIVADO… no hay minutos y no se van a poner (decisión del dueño,
> 18-09). Medido antes de decidirlo: CINCO tiradas… el trabajo se crea y muere
> en 2 s SIN que se le asigne runner (runner_id 0, cero pasos, logs 404).
> Dejarlo en `push`/`pull_request` significaba una **X roja PERMANENTE** en cada
> PR y en main, de un flujo que no llega a ejecutar una sola comprobación. Eso
> no es una puerta: **es enseñar a ignorar los rojos**.

Con los cinco identificadores de tirada listados. Y la predicción se cumplió en
la primera corrida tras el cambio: cuatro segundos, sin runner, cero pasos.

### Las dos cosas que hay dentro

**Primera: el censo mide ESTADO, no INTENCIÓN.** «Sin CI automática» y «CI
apagada a propósito» dan exactamente la misma lectura, y la diferencia decide
si hay algo que arreglar o no hay nada. Un censo que sólo ve el estado produce
diagnósticos seguros y equivocados — y son peores que no tener censo, porque
llegan con la autoridad de un número.

**Segunda, y es de leer, no de medir:** el fichero se leyó con un `sed` que
empezaba en la línea donde el `grep` había encontrado `on:`. Las doce líneas de
encima —que lo explicaban entero, con sus cinco tiradas— no se miraron. Es la
segunda lección otra vez, «mira donde no debe», aplicada a **leer** en vez de a
comprobar: se miró exactamente la parte que se esperaba que importara.

### Qué NO arregla esto, y por qué conviene decirlo

La reacción natural es proponer una comprobación: *que el PR declare qué
ficheros toca y se caree con lo que entró en `main`*. Es una buena idea para
otro problema —un squash que se traga un cambio— pero **aquí no habría cazado
nada**: no se perdió ningún fichero ni ningún commit. Todo llegó. Lo que falló
fue leer una decisión que estaba escrita.

Contra eso no hay comprobación barata, y decir que la hay sería peor que no
tenerla. Lo que sí queda:

- **una decisión deliberada se declara EN EL SITIO donde se toca**, no sólo en
  el commit — el commit lo lee quien busca, la cabecera la lee quien edita;
- **antes de «arreglar» una puerta apagada, leer el fichero ENTERO.** No desde
  donde casó el patrón: entero;
- y el censo, cuando ve un repo sin corridas automáticas, **lo dice como
  observación y no como defecto**, y recuerda mirar la cabecera del flujo antes
  de tocarlo.

## 3 quater · Una puerta que busca un NOMBRE en el fuente vigila la prosa

**La regla, y va antes que los casos porque es lo que hay que llevarse:**

> Buscar un nombre en el código fuente comprueba que **alguien escribió algo**,
> no que **el código lo haga**. Un comentario, una cadena de texto o una
> variable con ese nombre la satisfacen igual que la llamada de verdad.
>
> La comprobación buena es **ejecutar y ver el efecto**, y son dos, no una:
>
> 1. **sin la dependencia, el código SE PARA** — no sigue a medias;
> 2. **si la dependencia cambia, el resultado CAMBIA CON ELLA.**
>
> La segunda es la que no se puede fingir: una copia local del cálculo pasa la
> primera y falla la segunda.

Es una regla, no una anécdota, y se ha pagado **tres** veces — en las dos
direcciones, y la tercera de la forma más incómoda posible.

### El mejor caso que tiene esta lección: la escribí y la cometí a la vez

En `Cobertura-Zigbee`, el banco `test_hsus_gw.mjs` carea las HSU de los layouts
contra la hoja que escribe la toolbox de `SCADA`. Llevaba desde siempre saliendo
con `0` **sin carear ninguna**, porque la hoja no estaba; el comentario del
propio workflow lo decía en voz alta — *«que conste que hoy no vigila nada»*— y
el código de salida decía lo contrario.

Al arreglarlo escribí esto en el fuente, de mi puño, **dentro del PR que
establece esta lección**:

> `SCADA es PUBLICO: la CI lo clona, asi que esta rama solo salta cuando de`
> `verdad no esta.`

**Era falso.** El job `datos` hacía un `actions/checkout` pelado y no clonaba
nada. Escribí la afirmación en prosa y **no la ejecuté nunca**: exactamente lo
que esta lección prohíbe, cometido por quien la estaba redactando.

No lo cazó ninguna puerta. Lo cazó **correr el banco en un árbol sin hermanos al
lado**, que es como corre la CI, y verlo salir con `rc = 2`.

Y lo que importa es cómo se arregló, porque había dos salidas y sólo una es
buena:

| | qué hace | qué deja |
|---|---|---|
| borrar la frase | el fuente deja de mentir | el banco sigue sin carear nada |
| **hacerla verdad** | la CI clona `SCADA` (público, 2,6 MB) al lado | **22 HSU careadas de verdad, 33 comprobaciones** |

**El arreglo bueno no fue borrar la frase, fue hacerla verdad.** Una afirmación
falsa en un comentario es un síntoma; lo que había debajo era una puerta que no
vigilaba. Quitar el síntoma la habría dejado igual de apagada y con mejor
aspecto.

### Falso verde: el nombre estaba en un comentario (2026-09-24)

Al hacer que los dos puertos de `cobertura-rf-fv` tomaran las primitivas del
canon, la puerta que lo vigilaba miraba si `web/zigbee_pv_model.js` nombraba
`radio_pv_model.js`. **Daba verde con el `require` arrancado**: el nombre seguía
saliendo en la cabecera del fichero y en el texto del mensaje de error.

Lo que la arregló no fue afinar el patrón, fue **cambiar de pregunta**:

```
sin el canon, el puerto SE PARA (no calcula con medio motor)
toca el canon una primitiva: la del puerto CAMBIA CON ELLA
```

La mutación `puertoSinGuardia` —quitar el `if (!RPV) throw`— la caza **sólo** la
primera. Ninguna comprobación de texto la veía.

### Falso rojo, y luego falso verde: `UseBasicParsing`, el mismo defecto al revés

`Cobertura-Zigbee/tools/gate_ps1_planta.py` exige que todo `Invoke-WebRequest`
lleve `-UseBasicParsing` (sin él, PowerShell 5.1 parsea con el motor de Internet
Explorer y en una máquina sin IE revienta). La puerta buscaba los dos nombres en
el texto, y falló por los dos lados:

- **se señaló a sí misma**: el comentario que explica por qué hace falta
  `-UseBasicParsing` nombra `Invoke-WebRequest`, y la puerta lo contó como una
  llamada — un rojo que no era un rojo;
- **y dejó pasar lo que vigilaba**: un fichero cuyo COMENTARIO nombrara
  `UseBasicParsing` pasaba aunque el código no lo pusiera.

Las dos se vieron **probando la puerta en rojo, que para eso se prueba**, y las
dos se arreglaron quitando los comentarios antes de mirar. Ahí no cabía ejecutar
—es un `.ps1` que corre en el PC de una planta, con 5.1 y sin instalar nada— así
que la puerta se quedó en heurística **y lo dice en su propio comentario**, con
el job de Windows detrás como red.

**Y un tercero, de la misma familia:** al mutar `-UseBasicParsing` con un `sed`
que buscaba el guion, la mutación **no casó** —en el splat va
`UseBasicParsing = $true`, sin guion— y la puerta salió verde. Un mutante que no
llega no prueba que el banco vigile: prueba que el mutante no llegó. Por eso
`rc = 2` no es «no cazada», es **«no comprobada»**.

### Cuándo vale mirar el texto, y cómo decirlo

No siempre se puede ejecutar. Cuando no se pueda, la puerta de texto **sigue
valiendo**, con dos condiciones:

- **quitar los comentarios antes de mirar** — las tres averías de arriba son la
  misma línea que falta;
- **decir en la salida que mira la DECLARACIÓN y no el efecto**, para que nadie
  lea «verde» como «funciona». Lo mismo que hace el censo de bancos cuando dice
  que mira si un banco está declarado en la CI, no si la corrida terminó.

## 3 quinquies · Lo que se queda fuera de `main` sin que nadie lo note

Las puertas de arriba vigilan el código. Ésta vigila el **bucle de trabajo**, y
falla igual de callada.

El bucle termina en `git checkout -B <rama> origin/main`. Ese comando **tira en
silencio todo commit de la rama que no esté en main**. Cuando el PR se fusionó
con *squash*, el contenido sí está en main aunque los commits no, y tirarlos es
correcto — por eso el paso existe. Pero si se siguió commiteando **después** de
abrir el PR, o el PR se fusionó con una cabeza anterior, ese trabajo desaparece
sin una palabra.

### El caso, del 2026-09-24, y la ironía que trae dentro

El PR **#511** de `proyectos` se fusionó con la cabeza `19f64fc7`. Después se
empujaron a la **misma rama** dos commits:

| commit | qué traía | ¿entró en main? |
|---|---|---|
| `09069af` | **la quinta lección** (apagada a propósito ≠ rota) | **no** |
| `c81cd9c` | el censo de CI marcando «SIN MINUTOS» | **no** |

Se descubrió **por casualidad**: el PR siguiente salió con conflicto y sin
ninguna corrida de CI —GitHub no arranca los flujos de un PR que no puede
fusionar—, y al mirar por qué apareció el hueco. Nada lo vigilaba.

La ironía, que conviene dejar escrita: uno de los dos commits perdidos era
**justo la lección de leer el fichero entero antes de tocar nada**.

Y el modo de fallo es el mismo de siempre: **el vacío pareció normal**. Cero
corridas de CI en un PR se lee igual que «todavía no han empezado», y el
documento se leía entero y coherente porque lo que faltaba no dejaba hueco
visible — una sección que no está no se echa de menos.

### La comprobación barata, y no es la que yo iba a proponer

Lo primero que se me ocurrió fue que el PR **declarase qué ficheros toca** y
carearlo con lo que entró en main. Es más caro y más frágil: hay que mantener la
declaración, y no cubre el caso de commits empujados después.

**Mirar el CONTENIDO lo cubre entero y cabe en una línea:**

```
git diff origin/main <rama>     vacío  ->  todo lo de la rama está en main
                            no vacío  ->  hay trabajo que NO está publicado
```

No mira commits —que el squash aplana a propósito— sino ficheros. Está en
`docs/reconcilia.sh`, con los tres códigos de siempre: **0** se puede reconciliar
sin perder nada · **1** hay contenido fuera · **2** no se ha podido comprobar
(sin red, comparar contra un `main` viejo daría un verde que no significa nada).

Corrido sobre el caso de hoy nombra **exactamente los dos commits perdidos**.

**Y un detalle que salió al probarla:** la primera versión se negaba también con
ficheros **sin seguir**, y se disparó con su propio fichero recién escrito.
`checkout -B` no toca lo que no está seguido. Lo peligroso son las
modificaciones de ficheros **seguidos**.

## 3 sexies · La séptima: EL VACÍO SE LEE COMO NORMAL

Las seis lecciones anteriores son sobre puertas que miran mal. Ésta es sobre
**algo que no está**, y por eso es la más difícil de ver: **una ausencia no deja
rastro**. Un valor equivocado chirría; un hueco, no.

> **Cero corridas de CI** parece «todavía no han empezado».
> **Una sección que falta** no se echa de menos.
> **Un commit que no llegó** no deja rastro en ninguna parte.
> **Un dato que no está** se lee igual que uno que nadie ha mirado.

### Los cuatro casos, y son la misma forma

| lo que había | cómo se leyó | lo que era |
|---|---|---|
| un PR con **0 check-runs** | «aún no han arrancado» | **conflicto de fusión**: GitHub no arranca los flujos de un PR que no puede fusionar |
| el documento **sin la quinta lección** | completo y coherente | dos commits que nunca entraron en `main` |
| `09069af` y `c81cd9c` **fuera de main** | nada: no hay dónde mirarlo | `checkout -B` los tiró sin una palabra |
| 568 enlaces con `relieve_perfil_no_cubre_el_vano` | «esos vanos no tienen terreno» | **sí lo tenían**: los rechazaba un déficit de 2,13e-13 m |

El cuarto es el más caro y el que mejor lo explica. `recortaPerfil` comparaba
`largo < D` a secas y dejaba **568 de 6.036 enlaces reales (9,4 %) sin término de
relieve, con el terreno delante**, desde que el terreno entró en la aplicación.
**Los 17 bancos estaban verdes, las 43 mutaciones rojas y la paridad verde.**

Y no por estar mal hechos: **ningún banco tenía un caso donde el perfil llegara
al vano salvo por un último bit**, porque a nadie se le ocurre escribir ese caso
a mano. Lo que lo cazó fue poner una puerta NUEVA y **ver que no disparaba donde
tenía que disparar**: Benante tenía 146 enlaces por debajo de 100 m y la puerta
sólo saltaba en 139. Ir a ver por qué faltaban siete destapó el picómetro.

### El antídoto: que el vacío CUESTE algo

No se arregla mirando más. Se arregla haciendo que la ausencia **no pueda pasar
por normalidad**, y en estos repos eso son tres cosas concretas:

1. **El piso.** Un banco que no publica cuántas comprobaciones ha hecho no puede
   salir verde. «El vacío es ERROR, no PASS» — §2.
2. **El `rc = 2`.** «No he podido mirar» es un estado propio, no un cero amable.
   Y un rojo confirmado **no se degrada** a «no comprobado» (§1).
3. **Que alguien pregunte por el vacío, solo y pronto.** Un hueco que aparece
   por casualidad al tercer día no está cubierto. Por eso `docs/al_empezar.sh`
   corre **al empezar cada sesión** y hace las **tres** preguntas que ninguna CI
   hace: *¿cuál fue el último CI de `main` de cada repo?*, *¿hay trabajo subido
   que no esté en `main`?* y *¿sigue cada copia fijada cuadrando con su
   candado?*

Y una cuarta, de forma: **cuando un número salga redondo o un hueco salga
limpio, preguntar de qué está hecho** — la regla del resultado demasiado bueno
(§4) es esta misma lección mirada desde el otro lado.

### El sha del candado se comprueba DESPUÉS DEL MERGE, no mañana

**Un candado afirma sobre bytes y un merge opera sobre bytes.** Si el squash
normaliza un salto de línea, un `\r\n`, un byte final de fichero, la copia
fijada de otro repo deja de cuadrar — y eso no sale a la luz al mergear: sale
**al día siguiente**, en la CI de un repo distinto, con el rastro ya frío y sin
nada que apunte al merge de ayer.

El 2026-09-24 se mergeó un cambio del canon de radio por squash y el sha se
comprobó **inmediatamente después**, contra la copia fijada y contra lo que el
candado declara. Las tres coincidían, así que no hubo hallazgo — y esa es
justamente la comprobación que se tiende a no hacer: la que casi siempre sale
bien.

> **La regla: el careo del candado va en la misma tanda que el merge, no en la
> siguiente sesión.** Y como acordarse no es un mecanismo, lo pregunta también
> `docs/candados.py`, solo, en cada arranque.

### Y el candado que NO se comprobó: dicho, no contado

El primer cruce de candados que escribí entendía dos formatos —`copias: [...]`
y `copia: {...}}`— y `seguidor.lock.json` usa un tercero (`modelo` + `sha256`
arriba). El bucle **no lo tocaba**, así que el informe decía *«siete de siete
verdes»* y eran **seis**.

Se publicó como **«no comprobado»** en vez de contarlo entre los verificados, y
esa parte está bien: **seis de siete con el séptimo nombrado vale más que un
siete que no lo es**. Pero decirlo no es el arreglo —

> **un cruce que se salta en silencio lo que no entiende es esta misma lección
> con otro traje**: el formato desconocido no deja rastro, y el verde que
> publica es de lo que sí miró.

Así que `docs/candados.py` **sale con `rc = 2` ante un formato que no reconoce**,
lo nombra y dice sus claves. No lo salta. Probado en negativo, con los cinco
casos: candado que cuadra (0) · fichero cambiado y candado viejo (1) · **formato
desconocido (2)** · fichero que el candado nombra y no existe (**1**, no 2: un
rojo confirmado no se degrada) · y cero candados (2, porque el vacío no es
verde).

Ese cuarto caso salió mal a la primera —devolvía 2— por preguntar «¿he careado
alguna?» **antes** que «¿alguna está mal?». Es el mismo defecto de orden que
`copiaQueFalta` tuvo esa misma mañana, cometido otra vez al escribir la
comprobación que lo vigila. Lo cazó su propio control negativo.

## 3 septies · La octava: UNA MEDIDA LLEVA SU ENTORNO DENTRO

**La regla:**

> Un piso, un tiempo o un recuento **medidos en un sitio no valen en otro**. El
> mismo banco **con el repo hermano al lado y sin él son dos bancos distintos**.
>
> El número correcto en el entorno equivocado **se lee como una medida y no lo
> es**.
>
> Quien mide **declara dónde midió**. Quien compara **exige que el alcance
> coincida**. Y un alcance que nadie ha medido **sale `rc = 2`, nunca cae al
> valor por defecto**.

Es la séptima lección con un disfraz nuevo: el hueco no está en los datos, está
en **el contexto de la medida**, y por eso no se ve — el número está ahí,
redondo y con aspecto de dato.

### El caso (2026-09-24), y lo que destapó

`Cobertura-Zigbee/tools/test_anual_motor.mjs` tenía un piso de **19**. Lo medí
en mi máquina, donde `SolarGPTfull` está clonado al lado. En CI publicó **14** y
el envoltorio lo puso rojo.

La reacción barata —bajar el piso a 14— habría tapado lo de verdad grave, que
sólo se ve mirando el banco entero:

| sección | qué comprueba | ¿corre en CI? |
|---|---|---|
| maniobras | cómo se segmenta un arranque | sí |
| coste | la aritmética, **con un modelo INVENTADO de números redondos escrito en el propio banco** (`k=0,05`, `e0=1,0`…) | sí |
| **canario cruzado** | que las constantes **reales** medidas (`0,0489` · `1,222` · `0,0615` · `2,425` · `0,0901` · `0,0447` sobre 14.759 maniobras) salen del fuente del core | **no** |

En CI el banco verificaba **que sabe multiplicar**, se saltaba la única sección
que ata esos números al modelo medido de verdad, y remataba con:

```
✓ 14 comprobaciones, todas bien
```

**«Todas bien» sobre el subconjunto que sí corrió.** El piso de 14 lo habría
bendecido para siempre.

Y el hermano no se puede traer: `SolarGPTfull` es **privado y ocupa 820 MB**.
Que no se pueda arreglar trayendo el entorno es justamente por lo que hace falta
la regla; si siempre se pudiera, bastaría con traerlo.

### Cómo se declara, y dónde vive cada cosa

El reparto no es un detalle de implementación, es lo que impide una segunda
copia que se quede vieja:

| | quién lo sabe | dónde vive |
|---|---|---|
| **la condición** (¿está el hermano?) | el banco, que es el único que sabe qué le falta | en el banco, una línea `[alcance] <nombre>` |
| **los números** (14 aquí, 19 allí) | quien los midió | en la tabla de pisos, donde se ven en el diff |

Y la parte que casi se me escapa: **un alcance que la tabla no conozca sale con
`rc = 2`**. Si mañana el banco aprende a correr recortado de otra manera, eso es
un entorno que **nadie ha medido**, y un entorno sin medir no puede pasar por
verde cayendo al piso base. Es el mismo principio que el `rc = 2` de §1, aplicado
al *dónde* en vez de al *qué*.

También cambia lo que el banco puede decir de sí mismo. «Todas bien» tiene que
significar «he mirado **todo** y está bien», así que cuando el alcance encoge lo
dice con las dos mitades:

```
✓ 14 comprobaciones, todas bien — y 5 SIN CORRER (el canario cruzado, sin el core al lado)
```

### Probado en negativo

| prueba | resultado |
|---|---|
| quitar la línea `[alcance]` | piso 19 → **`rc = 1`** |
| declarar un alcance que la tabla no conoce | **`rc = 2`** |
| mover una constante del canario donde SÍ corre | **`rc = 1`** |

La primera es la que sostiene el invento: **la declaración es de carga**. Si
alguien la borra «por limpiar ruido», el banco vuelve a exigir 19 y se pone rojo.

## 3 octies · La novena: UNA MUTACIÓN QUE NO TOCA LO QUE LA PUERTA MIRA NO PRUEBA NADA

**La regla:**

> Ya teníamos «**la mutación que no casa es `rc = 2`, no cazada**» (§3 quater).
> Esto es el escalón siguiente, y es peor porque tiene mejor aspecto: la
> mutación **casa**, **se aplica**, el fichero cambia de verdad — y aun así el
> verde significa **«no has tocado nada»**, no «la puerta aguanta».
>
> Pasa cuando se muta **un campo que el banco no lee**.
>
> El remedio: la mutación se verifica **sobre el campo que el banco lee de
> verdad**, y **si el verde no cambia hay que demostrar por qué antes de darlo
> por bueno**.

### El caso (2026-09-24)

Probando en negativo el careo de HSU contra la hoja de la toolbox, muté
`plantas[0]` del fichero de Ayora **dos veces** —primero el índice de NCU, luego
el puerto del gateway—. Las dos salieron verdes, y estuve a un paso de anotar
«la puerta aguanta».

Lo que pasaba es que el banco sólo mira las entradas de la hoja **que traen
`rsu`**, y `plantas[0]` no la trae:

```js
for (const [k, n] of (p.rsu || []).entries()) { … }   // sin `rsu`, no entra nunca
```

Repetida sobre `plantas[1]`, que sí la trae, la caza a la primera y por los dos
lados:

```
FALLA  HSU 1 (US)   hoja: NCU  7 GW 1   layout: NCU  2 GW 1   ← otra NCU
FALLA  HSU 1 (US)   hoja: NCU  2 GW 2   layout: NCU  2 GW 1   ← otro gateway
```

### Por qué es distinta de la de §3 quater, y por qué engaña más

| | la de §3 quater | ésta |
|---|---|---|
| el `sed` | **no casa**: el fichero no cambia | **casa**: el fichero cambia |
| se nota | sí, si se mira el diff del mutante | **no**: el diff enseña un cambio real |
| lo que sale | verde | verde |
| lo que significa | «el mutante no llegó» | «llegó donde la puerta no mira» |

La primera se detecta comprobando que el `sed` tocó algo. Ésta **no**: hay que
comprobar que tocó **lo que se lee**. Por eso la regla no es «verifica que la
mutación se aplicó», es **«verifica que la mutación cayó en el camino que la
puerta recorre»**.

Y de ahí sale la obligación que la cierra: **un verde que no se mueve es una
afirmación que hay que justificar**, igual que la regla del resultado demasiado
bueno (§4). «Mutó y siguió verde» no es un resultado; es una pregunta sin
contestar.

## 3 nonies · La décima: EL INSTRUMENTO CUANTIZA Y EL LISTÓN LO TAPA

**La regla:**

> Antes de fijar una tolerancia, comprobar **si lo que se compara ya viene
> cuantizado**. Si lo está, la tolerancia **no dice nada de la física: dice el
> tamaño del escalón**.
>
> Dos valores redondeados a 2 decimales **no pueden diferir menos de 0,01**, así
> que un careo sobre ellos es **ciego por debajo del paso** — y su verde no
> significa «coinciden», significa «coinciden hasta donde el instrumento llega».
>
> El careo se hace **ANTES del redondeo, sobre el valor crudo**. Si el redondeo
> es parte de lo que se entrega, se carea **aparte**, como segundo caso, con su
> convenio declarado.

Es una familia nueva y no un caso: las nueve anteriores son sobre puertas que
miran mal o donde no deben. Ésta es sobre una puerta que mira **bien** y cuyo
**instrumento** no tiene resolución para lo que se le pide.

### El caso (2026-09-24)

El careo JS↔Python del modelo de radio tenía **un** listón, `0,01 dB`, con este
argumento en el fuente:

> *el JS redondea a 2 decimales en `predictLink`; se compara con esa granularidad
> para no acusar al port de un `toFixed()`*

**El motivo era falso.** Redondean **los dos**:

```js
marginDb: +margin.toFixed(2)     // JS
```
```python
"margin_db": round(margin, 2)    # Python
```

No hay asimetría que perdonar. Lo que hay es que el careo compara **dos valores
ya redondeados**.

Y debajo había una asimetría **de verdad**, que ese comentario no vio: `toFixed`
redondea **medio hacia arriba** y el `round()` de Python es **bancario**. Medido:

| valor | Python | JS |
|---|---|---|
| `0,125` | **0,12** | **0,13** |

En un empate exacto son **0,01 dB de diferencia real** en un número publicado.

### Lo que lo destapó fue un resultado demasiado bueno

Nadie fue a buscarlo. El careo daba **`0,000e+00` exacto** donde, con un solo
lado redondeando, tocarían ~0,005. **Un cero exacto ahí es sospechoso antes de
ser una buena noticia** — es la regla del resultado demasiado bueno (§4),
aplicada al **instrumento** en vez de al dato.

### Y lo que escondía, medido

Quitado el redondeo y careando el margen crudo, sobre los mismos 400 casos:

| | casos que difieren | peor diferencia |
|---|---|---|
| margen **publicado** (redondeado) | **0 de 400** | 0,000e+00 |
| margen **crudo** | **294 de 400** | 2,827e-10 |

No es que la física cambiara: **el instrumento estaba ciego por debajo del
escalón y lo daba por igualdad exacta**. Y la diferencia cruda resultó ser
*exactamente* el suelo de la pérdida de dos rayos —el término que domina el
margen—, o sea que ni siquiera era deriva: era ruido de plataforma que no se
podía ver.

**El listón viejo, además, estaba ocho órdenes de magnitud por encima** de las
diferencias reales de las demás funciones (1e-15 a 1e-10 frente a 1e-2). Un
listón así no es un guard, es un adorno — y aquí venía con dos defectos
encadenados: demasiado alto, y sobre un valor que no podía bajar de él.

### Probado en negativo

| mutante | careo viejo | careo nuevo |
|---|---|---|
| `+1e-6 dB` en `fspl_db` | **lo dejaba pasar** | **`rc = 1`** |
| `+0,001 dB` en el margen | **invisible**: por debajo del paso | **`rc = 1`** |

El segundo es el que da la regla: una deriva de una milésima de dB era
**estructuralmente indetectable**, no porque el listón fuera generoso sino
porque el instrumento no llegaba.

## 3 decies · La undécima: UN ARREGLO QUE NADIE HA VISTO FUNCIONAR NO ES UN ARREGLO

**La regla:**

> Un arreglo propuesto y no visto funcionar es **una hipótesis con forma de
> solución**, y se entrega diciéndolo.
>
> Y antes de escribir «esto no se puede probar aquí», hay que **intentar
> reproducir el entorno**. Casi siempre se puede. Si de verdad no se puede, se
> dice **qué lo impide** — no que no se puede.

Las diez anteriores son sobre puertas. Ésta es sobre el **remedio**: es la
cuarta —«una puerta que nadie mira no es una puerta»— vista del otro lado. Allí,
el guard que nadie ejecuta. Aquí, el **arreglo** que nadie ejecuta.

Y el fallo no es el que parece. No fue proponer un parche sin probarlo: eso,
dicho, es honesto y a veces es lo único que hay. Fue **afirmar que no se podía
probar** cuando sí se podía, y usar esa afirmación como permiso para no
intentarlo. Una frase que cierra la puerta por la que iba a entrar la
comprobación.

### El caso (2026-09-24)

`solargptfull #274` salía rojo en un paso **previo y ajeno**, `Check committed
diff whitespace`. Diagnosticado: `actions/checkout@v4` sin `fetch-depth` saca la
merge ref a profundidad 1, y `A...B` no pide las dos puntas sino **el ancestro
común**, que en un clon superficial no existe. Se propusieron dos parches, y con
el segundo escribí esto:

> *la **B** no la he podido probar —exige empujarla y ver una corrida— y depende
> de que el servidor admita `fetch` por SHA suelto.*

**Reproducir ese entorno eran treinta segundos**, sin empujar nada:

```
git init && git remote add origin … && git fetch --depth=1 origin $HEAD && git checkout FETCH_HEAD
  fatal: Invalid symmetric difference expression a11ab1a4…39290d0d
  rc = 128
```

El mismo `fatal` y el mismo `rc` que la corrida, **clavados**. Y sobre ese banco,
la opción B:

```
git fetch --no-tags --depth=1 origin $BASE $HEAD
  * branch  a11ab1a4… -> FETCH_HEAD      ← el fetch FUNCIONA
  * branch  39290d0d… -> FETCH_HEAD      ← las dos puntas llegan de verdad
git diff --check "$BASE...$HEAD"
  fatal: …: no merge base
  rc = 128
```

**No funciona.** Y ahí está lo que la hacía plausible: el `fetch` no se queja y
las dos puntas llegan. Pero el clon sigue superficial, así que los dos commits
existen **como objetos sin historia detrás**. La opción B **cambia el mensaje de
error y nada más** —de «no sé resolver la expresión» a «no hay base común»—:
mismo rojo, mismo `rc`, cero espacios comprobados. Un parche que **parece haber
hecho su trabajo**, porque su primer comando sale bien.

Medidas las cuatro variantes en el mismo banco (el clon completo ve **10**
ficheros):

| variante | `diff --check` | ficheros |
|---|---|---|
| `fetch-depth: 0` | **rc 0** | **10** ✔ |
| `--deepen=200` + `fetch` de la base | rc 0 | 10 ✔ |
| `fetch` de las dos puntas, **a tres puntos** *(la propuesta)* | rc 128, `no merge base` | 0 ✗ |
| `--unshallow` sólo de la rama base | rc 128 | 0 ✗ |

**Ojo con leer esa tercera fila de más**, que es el remate de abajo: dice que
falla *traer las dos puntas y comparar a **tres** puntos*. Traer **sólo la base**
y comparar **a dos puntos contra HEAD** es otra cosa, y **sí funciona**.

### Y el remate, que llegó después y es el que cierra la lección

Todo lo de arriba es verdad y **no bastaba**, porque el banco donde lo medí
**no reproducía la CI**. Saqué a profundidad 1 el *sha de la cabeza*, cuando lo
que `actions/checkout` saca en un `pull_request` es **la merge ref**. Sale el
mismo `fatal`, así que el banco parecía fiel. No lo era.

Y la diferencia importa, porque en la merge ref **HEAD ya es el merge commit**
—base + PR—, o sea que la base **es un ancestro de HEAD**. Entonces:

| forma | qué pide | en la merge ref |
|---|---|---|
| `git diff --check "$base...$head"` | el **ancestro común** de dos puntas sueltas | falla: no lo hay |
| `git diff --check "$base" HEAD` | nada: compara dos árboles | **rc 0**, y saca justo lo que el PR añade |

Traer **sólo el commit base** y comparar **a dos puntos contra HEAD** funciona,
cuesta un commit en vez de la historia entera, y es lo que acabó entrando. Mi
tabla de cuatro variantes lo había descartado **sin haberlo probado**: yo medí
`$base...$head` a *tres* puntos. **No es la misma variante.** Un «no funciona»
sobre algo parecido no es un «no funciona».

Así que la misma lección se cumplió dos veces seguidas y la segunda contra mí:
primero por no probar el arreglo, y después **probando el arreglo en un entorno
que no era el de verdad** y no darme cuenta. Reproducir el entorno no es
invocarlo: es comprobar que lo que se reprodujo **es lo que allí hay**. Un banco
que da el mismo error por otro camino es un banco que miente con la respuesta
correcta.

Y hay un tercer fallo del mismo día que **no cabe aquí**, porque no va de probar:
el argumento con el que justifiqué `fetch-depth: 0` frente al `--deepen=N`
—«en este workflow ya se clona entero en otros jobs»— **era falso**. Ése tiene su
propia lección, la duodécima (§3 undecies), y su raíz es otra: que el parche
competía con uno ajeno.

### La segunda mitad: UN AVISO SIN NÚMERO NO PROTEGE DE NADA

En el mismo comentario avisé de que, al arreglarlo, el paso *«puede sacar
espacios acumulados que nadie ha visto nunca»*. Sonaba prudente. Era **prudencia
sin medir**, que es otra cosa.

Medido después, el paso compara `base...head`: mira **sólo las líneas que el PR
toca**, no el árbol. La suciedad parada en ficheros que nadie edita no sale.

| | |
|---|---:|
| squashes recientes que habrían salido rojo con el arreglo | **0 de 25** |
| hallazgos reales en el árbol | 448.909 |
| ficheros donde viven | **36** — 19 de dato, más un CSS de terceros |

**La regla:**

> Un aviso sin número **no protege de nada y estorba la decisión**: pone un
> riesgo sobre la mesa sin su tamaño, y quien decide no puede pesarlo. Si el
> aviso se puede medir, se mide **antes** de darlo. Si no se puede, se dice qué
> falta para medirlo.

Un «puede pasar algo malo» no acotado se parece mucho a haber mirado, y no lo es.

### Y la novena, otra vez, en el control de la propia puerta

Al negativar el arreglo —porque esa puerta **nunca se había visto morder**— el
cuarto control pretendía probar que la suciedad heredada **no** sale. Añadí una
línea sucia a un fichero *«que el PR no toca»*… con lo cual el PR **sí** lo
tocaba. Salió rojo, que es lo correcto, y **no probaba nada de lo que quería
probar**: es la novena, cometida mientras se comprobaba otra cosa.

Rehecho como debía —fichero con **3 hallazgos ya presentes en `main`**, tocando
una línea limpia— dio `rc 0` **comparando 1 fichero, no el vacío**. Sin esa
segunda parte, un `rc 0` por no haber mirado nada habría pasado por confirmación.

## 3 undecies · La duodécima: COMPROBAR SI ALGUIEN YA LO HA HECHO ES PARTE DE HACERLO

**La regla:**

> Antes de escribir un parche, **mirar si ya está escrito**. Con dos sesiones
> trabajando el mismo repo —que aquí es lo normal, no la excepción— listar los
> PR abiertos cuesta **una llamada**: tan barato como reproducir un entorno, y
> por la misma razón obligatorio.

La undécima va de **probar**. Ésta va de **mirar antes**, y son dos cosas
distintas: se puede probar impecablemente un trabajo que no había que hacer.

### El caso (2026-09-24)

Diagnosticado el paso roto, escribí el parche y abrí `solargptfull` **#276** a
las **19:09**. Ya existía:

| | | |
|---|---|---|
| **#275** | mismo arreglo, borrador | abierto a las **14:55** — cuatro horas antes |
| **#263** | lo lleva dentro, **no borrador, `clean`** | esperando que su dueño lo fusione |

No miré. Una llamada —listar los PR abiertos del repo— habría bastado, y la
hice por casualidad **después**, mirando por qué otra sesión tenía un aviso
sobre este repo.

Y el suyo era mejor: traer sólo el commit base y comparar **a dos puntos** contra
`HEAD`, que en un `pull_request` ya es el merge commit. Un commit en vez de la
historia entera, en cada corrida. Encima **#263 endurece el guard** con
`assert "..." not in diff_check`, que mi parche habría puesto rojo: los dos no
cabían.

### Pero el trabajo duplicado no fue lo caro

Cuatro horas de trabajo repetido y un parche peor se tiran y no duele. Lo caro
es lo otro:

> Para justificar mi parche me inventé un argumento —*«en este workflow ya se
> clona entero en otros jobs»*— **que era falso**, y además lo usé para
> **descartar la alternativa**.

El otro job hace `checkout@v4` sin `fetch-depth`: nadie clona entero ahí. Y
fíjese qué dato salió inventado, entre todos los posibles: **exactamente el que
hacía barato lo mío y caro lo otro**. No fue un desliz al azar.

**La regla de verdad:**

> **Un parche que compite con otro invita a argumentar hacia atrás.** En cuanto
> hay un candidato propio, el razonamiento deja de ir de los hechos a la
> conclusión y empieza a ir de la conclusión a los hechos — y lo que aparece
> primero es el dato que falta para que la propia opción gane.

Y no se quedó en el papel: ese dato falso **llegó a la decisión del usuario**,
que eligió entre dos opciones teniéndolo delante. Su argumento propio se
sostenía solo y él lo dijo; pero el insumo estaba contaminado y lo puse yo.

De ahí que mirar antes no sea sólo ahorro de esfuerzo. **Mirar antes es lo que
impide llegar a la mesa con algo que defender**, que es el estado en el que se
argumenta hacia atrás.

## 3 duodecies · La decimotercera: LO QUE TU PROPIO ERROR TE ESTÁ DICIENDO

Las doce anteriores son sobre puertas y sobre remedios. Ésta es sobre **la barra
de error**: dos maneras de equivocarla que no se ven mirando el número de en
medio, y que salieron las dos del mismo sitio —un banco **sintético**, donde la
respuesta se conoce y por eso se puede carear el error contra la verdad.

### Primera · EL ERROR MEDIO IGUAL AL ERROR ABSOLUTO MEDIO DELATA SESGO PURO

**La regla:**

> Si el error medio y el error **absoluto** medio salen (casi) iguales, no hay
> dispersión: **todos los casos fallan en el mismo sentido**. Eso es un sesgo, y
> un sesgo **no se corrige inflando la barra de error** — se corrige
> **encontrando qué falta en el modelo**.

Es un diagnóstico de una línea y separa dos averías que se parecen en la salida
y no tienen nada que ver:

| | error medio | |err| medio | qué es |
|---|---:|---:|---|
| dispersión | ~0 | grande | ruido: la barra de error **es** la respuesta |
| **sesgo** | **grande** | **igual de grande** | falta física: la barra **tapa** la respuesta |

**El caso (2026-09-24).** El útil que saca el arranque de cada TCU en un stow
daba `sesgo medio = 0,520 s` y `|err| medio = 0,520 s`. Idénticos. No era ruido
de muestreo: **faltaba algo en el modelo**.

Y lo que faltaba se lee solo en cuanto se acepta que es sesgo: se extrapolaba la
rampa de giro hasta el ángulo de **la última muestra quieta**, y ese ángulo está
**viejo** — entre esa muestra y el arranque, la TCU **seguía siguiendo al sol**.
Extrapolar hasta un ángulo estancado lleva la rampa demasiado lejos, y como la
rampa baja, «demasiado lejos» es **siempre** «demasiado tarde». Siempre en el
mismo sentido: eso es un sesgo.

El arreglo no fue una corrección ni una tolerancia mayor: **el arranque es el
cruce de dos rectas**, la de seguimiento y la de giro. Así el seguimiento deja
de ser un error y pasa a ser parte del modelo. Medido: **0,520 s → 0,008 s**.

### Segunda · UN ERROR DE CUANTIZACIÓN NO SE PROMEDIA COMO RUIDO

**La regla:**

> Las muestras consecutivas de una señal cuantizada caen en el **mismo escalón o
> en el de al lado**, así que su error **no es independiente**: desplaza el
> ajuste **en bloque**. Dividirlo por `n` —como se hace con el ruido— es
> **atribuirse una precisión que no se tiene**.

La fórmula de mínimos cuadrados de toda la vida supone residuos independientes.
Los de una escalera no lo son: son **estructura**, no ruido. Y la consecuencia
va en la dirección peligrosa — el ajuste sale **demasiado seguro de sí mismo**.

**Medido, en el mismo útil:** con la sigma de mínimos cuadrados a secas, sólo
**32 de 40** casos caían dentro de 2 sigma, cuando 2 sigma tiene que cubrir
~95 %. El útil acertaba y **se atribuía diez veces menos error del que tenía**.

Y el arreglo tuvo su propia versión equivocada, que es la que da la regla: el
primer suelo de cuantización se escribió como `q²/12 · (1/n₁ + 1/n₂)`, o sea
**promediando**. No mordió. Sin el `1/n` —una recta entera desplazada un escalón
completo, que es la hipótesis conservadora— la cobertura vuelve a donde debe.

Es hermana de la décima (§3 nonies): allí el instrumento cuantiza y **el listón
lo tapa**; aquí el instrumento cuantiza y **la barra de error lo tapa**.

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
- [ ] ¿Cada piso está **medido en el mismo entorno en que corre**? Y si el alcance encoge según lo que haya en la máquina, ¿lo **declara** el banco, y un alcance sin medir sale `rc = 2` en vez de caer al valor por defecto? (§3 septies)
- [ ] Y de cada puerta: **rómpela** (¿reacciona?) **y deprívala** (¿se entera de que no ha mirado?). Las dos, no una.
- [ ] Y de cada mutación: ¿**casó**, y además **cayó en el camino que la puerta recorre**? Un verde que no se mueve es una pregunta sin contestar, no un resultado. (§3 octies)
- [ ] Antes de fijar una tolerancia: ¿lo que se compara **ya viene cuantizado** (redondeado, truncado, discretizado)? Si lo está, el careo va **sobre el valor crudo**, y el publicado se carea aparte con su convenio declarado. Una tolerancia sobre un valor cuantizado mide el escalón, no la física. (§3 nonies)
- [ ] ¿Se comprueba el **sha de cada copia fijada JUSTO DESPUÉS de mergear** lo que ese candado vigila? Un merge opera sobre bytes; si normaliza uno, el rojo sale mañana en otro repo con el rastro frío. (§3)
- [ ] Y el cruce que lo comprueba: ¿**falla** ante un formato que no conoce, o se lo salta? Saltárselo publica un verde de lo que sí miró. (§3)
- [ ] De cada arreglo que se propone: ¿se ha **visto funcionar**, o se da por bueno por construcción? Y si se escribió «aquí no se puede probar», ¿se **intentó reproducir el entorno** antes de escribirlo? Casi siempre se puede; si no, se dice **qué lo impide**. (§3 decies)
- [ ] Y del banco donde se probó: ¿es **el entorno de verdad**, o uno parecido? Que dé el mismo error no lo demuestra — puede darlo por otro camino. Comprobar **qué ref, qué profundidad, qué está presente**, no sólo que el síntoma coincide. (§3 decies)
- [ ] Antes de escribir un parche: ¿se ha mirado si **alguien ya lo arregló**? Listar los PR abiertos del repo cuesta una llamada. (§3 undecies)
- [ ] Y si el parche propio **compite** con otro: releer los argumentos con los que se defiende. ¿Alguno es un dato que **no se ha comprobado** y que justo hace ganar al propio? Ahí es donde aparece el razonamiento hacia atrás. (§3 undecies)
- [ ] De cada guardia que saca un rojo: ¿la **causa** que da es la de verdad, o sólo acertó el veredicto? Y antes de comparar dos referencias, ¿están **las dos** al día? Una local rancia contra una remota fresca da hallazgos fantasma, y eso es `rc = 2`, no un hallazgo. (§3)
- [ ] Y el **remedio** que propone el guardia: ¿se ha ejecutado? Un consejo que falla en el caso real (`--ff-only` sobre ramas divergidas) es la misma avería un escalón más abajo. (§3)
- [ ] Al mirar el error de una medida: ¿el error medio y el **absoluto** medio son iguales? Entonces es **sesgo**, y se arregla buscando qué falta en el modelo, **no** ensanchando la barra. (§3 duodecies)
- [ ] Y si lo que se mide viene **cuantizado**: ¿la incertidumbre se está dividiendo por `n`? Los errores de una escalera **no se promedian**: desplazan el ajuste en bloque. (§3 duodecies)
- [ ] De cada aviso que se da: ¿lleva **número**? Un riesgo sin tamaño no se puede pesar, se parece a haber mirado y no lo es. Si se puede medir, se mide antes de avisar. (§3 decies)

---

*Los casos de este documento están medidos, no razonados. Cada uno se encontró
corriendo la cosa contra datos reales y careando el resultado con lo que
acabábamos de afirmar — no revisando código.*
