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

### Un aviso que sale de probarlas

Una **mutación que no casa con el código** es `rc = 2`, no «no cazada». Al mutar
`-UseBasicParsing` con un `sed` que buscaba el guion, la mutación no casó —en el
splat va `UseBasicParsing = $true`, sin él— y la puerta salió verde. Estuvo a un
segundo de apuntarse como «regla dormida».

Y al revés: **un mutante que no modela lo que dice modelar no prueba que el
banco vigile; prueba que el mutante no llegó.**

---

## 4 · La puerta agregadora

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

## 5 · Inventario (2026-09-23)

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

## 6 · La lista de comprobación, para un repo nuevo

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
