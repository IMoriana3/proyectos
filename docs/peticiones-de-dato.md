# Lo que el simulador necesita de fuera, y a quién pedírselo

> **3 de octubre de 2026.** Cuatro peticiones, una por destinatario. Cada una dice
> **qué** hace falta, **por qué**, **qué decisión desbloquea** y **qué hemos hecho ya**
> para que nadie tenga que volver a deducirlo. Están escritas para poder copiarse a un
> correo tal cual.
>
> La quinta, la de Meteomatics, ya está en `docs/preguntas-meteomatics.md` y no se
> repite aquí.
>
> **El orden importa.** La primera es la que convierte el simulador en algo
> conectable; la segunda es la única que el propio informe declara **bloqueante**.

---

## 1 · A planta / O&M — la señal de activación y desactivación

**Qué pedimos.** El punto concreto que levanta y baja el abanderamiento:

- **nombre del punto** en la NCU (o registro Modbus, si es por ahí);
- **tipo**: ¿nivel mantenido o pulso?
- **quién lo escribe hoy**, si alguien;
- y **qué pasa si se pierde la comunicación** con él a mitad de un evento.

**Por qué.** Todo lo que hemos construido produce **una orden y su urgencia**. Hoy esa
orden no tiene dónde ir: el simulador decide perfectamente y no hay un punto declarado
al que escribirla. **Esta es la pieza que convierte el simulador en algo conectable**, y
hasta que exista, cualquier otra cosa que hagamos sigue siendo explicación.

**Qué nos vale como respuesta.** Una línea del mapa Modbus o el nombre del punto en la
NCU. No hace falta documento.

**Y lo que NO estamos pidiendo, para que quede claro:** no pedimos permiso de escritura
ni vamos a escribir nada. Todo lo de este repo es **simulación y explicación**, y las
escrituras que hay son contra una **NCU simulada** en banco de pruebas.

---

## 2 · A campo / comisionado — medir `T_necesario` (BLOQUEANTE)

**Qué pedimos.** Cronometrar, en varios seguidores:

> desde que se emite la orden **hasta que la TCU reporta posición alcanzada**,

con el eje **viniendo del extremo contrario** (el peor caso), y si se puede, a
**distintas temperaturas**. Nos interesa el valor **y su dispersión**.

**Por qué es bloqueante y lo dice el informe.** El §9.1 declara `T_necesario`
**pendiente de medición en campo**. Hoy el simulador usa **15,0 min** y es una
**suposición**, no una medida.

**Qué decide ese número.** El §9.1 compara `T_necesario` con el tiempo disponible y de
ahí sale **qué maniobra se ordena**:

| Margen | Maniobra |
|---|---|
| `T_disp ≥ 2 · T_nec` | completa: se puede cruzar y elegir el lado bueno |
| `T_nec ≤ T_disp < 2 · T_nec` | reactiva: al extremo más cercano, sin cruzar |
| `T_disp < T_nec` | no llega — y eso hay que saberlo antes, no después |

**O sea que `T_necesario` es el número que decide entre cruzar por 0° o no cruzar.**

**Lo que ya hemos calculado**, para que la medida se compare contra algo:

- recorrido completo **110°** a **0,17 °/s** (dato de proyecto) = **10,8 min**;
- más la cadena declarada en el simulador: **sondeo NCU→TCU 15 s** y **arranque de
  motor 5 s**, que son **valores de trabajo, no medidos**;
- total ≈ 11,1 min, contra los 15,0 que usamos. Plausible, pero plausible no es medido.

**Y el error es asimétrico, que es lo que lo hace urgente:**

- si el real es **mayor** que 15 → el sistema cree que le cabe la maniobra completa,
  empieza a cruzar y **le pilla el granizo a mitad, con la mesa plana**. El peor sitio
  posible;
- si es **menor** → abanderamos antes de lo necesario y perdemos algo de producción.
  Molesto, no grave.

Equivocarse por lo bajo es precisamente el fallo que toda la estrategia existe para
evitar.

**Y de paso, si se puede en la misma visita:** el **sondeo** y el **arranque** por
separado, porque hoy los 15 y los 5 son de trabajo. El sondeo depende de cuántas TCU
cuelgan de cada NCU y del aire Zigbee; el arranque, del motor y la temperatura.

---

## 3 · A Estructuras — el ángulo de la posición de defensa

**Qué pedimos.** El **ángulo de defensa** frente a granizo, y si procede, si depende de
la tipología de mesa. En El Burgo hay cuatro, medidas sobre el
`Template Burgo I_01.xlsx` y recogidas en
[`scada/docs/elburgo-adquisicion/ARRANQUE.md`](https://github.com/IMoriana3/scada/blob/main/docs/elburgo-adquisicion/ARRANQUE.md):
**112** interior sin rótula · **67** interior con rótula · **8+10** exterior · **18
CORTO**. Las CORTO son las que más dudas dan en todo el proyecto, así que si el ángulo
depende de la tipología, ésa es la que conviene mirar primero.

**Por qué os lo pedimos a vosotros.** Porque el **§9.3 os lo asigna**. La máquina de
amenaza del §10.1 **no decide ángulos**: emite la orden y su urgencia, y lo dice en su
propia cabecera.

**Lo que estamos usando mientras tanto.** 55°, que es **compatible** con la banda de
pre-stow de viento (30–55°), así que ir al 55° del lado en que ya está satisface los dos
criterios a la vez. **Si el vuestro se saliera de esa banda, dejarían de ser
compatibles** — y hay una comprobación en el banco que lo vigila, precisamente para que
eso no pase desapercibido.

**Una pregunta de más, que ha salido hoy.** La planta nos ha fijado que **a 40 km/h de
racha no se puede atravesar la banda de ±30°**. Atravesarla cuesta **5,9 minutos** a
0,17 °/s. ¿Ese ±30° es vuestro criterio y lo confirmáis, o viene de otro sitio?

---

## 4 · A Firmware (y Electrónica) — tres parámetros del §19

El §19 deja estos tres en «SIN VALOR» con vosotros como dueños. La máquina de ejecución
**se niega a arrancar** sin ellos, a propósito: preferimos que no corra antes que correr
sobre cifras inventadas.

| Parámetro | § | Qué es |
|---|---|---|
| `n_retry` | §10.2 | reintentos antes de dar una fila por fallida |
| `ventana_recuperacion_s` | §12, §13 | ventana de recuperación |
| `ttl_orden_s` | §13 | caducidad de la orden (con Electrónica) |

**De los tres, `n_retry` es el que más corre**: es el único que una máquina **lee de
verdad** hoy, y topa los reintentos del estado 6 (HAIL_PARTIAL_PROTECTION).

**Y para `ttl_orden_s` os damos un suelo ya calculado**, que es lo único que podemos
aportar desde aquí:

> **`ttl_orden_s` ≥ 648 s.**
>
> Una orden no puede caducar antes de poder cumplirse, y el recorrido completo son
> **110°** a **0,17 °/s** = **648 s**. Por debajo de eso, una orden legítima moriría a
> mitad de camino.

El valor es vuestro; la restricción es nuestra y la dejamos dicha.

---

## Lo que haremos con cada respuesta

El hueco donde va cada dato **ya está declarado en el código con su regla**, así que no
hay que rediseñar nada: es poner el número y correr el banco.

- **1** → la orden pasa a tener destino y el simulador deja de ser sólo explicación.
- **2** → `T_necesario` deja de ser una suposición y el reparto entre cruzar y no cruzar
  se apoya en una medida. Y su **dispersión** nos dice si el factor 2 del §9.1 sobra o
  falta, en vez de aceptarlo por defecto.
- **3** → se fija el ángulo y se comprueba que siga siendo compatible con la banda de
  viento.
- **4** → la máquina de ejecución arranca, y `ttl_orden_s` se fija por encima del suelo.

## Y lo que seguirá faltando después

Que esto es un **borrador para discusión interna, no apto para uso operativo ni
comercial**, y lo seguirá siendo hasta que alguien lo apruebe como algo más. Ninguna de
estas cuatro respuestas cambia eso por sí sola.
