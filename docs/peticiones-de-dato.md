# Lo que el simulador necesita de fuera, y a quién pedírselo

> **3 de octubre de 2026**, ampliado el **5 de octubre** con la nº 5.
> Cinco peticiones. Cada una dice
> **qué** hace falta, **por qué**, **qué decisión desbloquea** y **qué hemos hecho ya**
> para que nadie tenga que volver a deducirlo. Están escritas para poder copiarse a un
> correo tal cual.
>
> La de Meteomatics ya está en `docs/preguntas-meteomatics.md` y no se repite aquí.
>
> **El orden importa.** La primera es la que convierte el simulador en algo
> conectable; la segunda es la única que el propio informe declara **bloqueante**.
> La **quinta** va al mismo destinatario que la primera y puede viajar en el mismo
> correo: es la que hace que el simulador deje de correr sobre dato inventado.

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

## 5 · A planta / O&M — el viento medido de las cuatro HSU de El Burgo

> Va a los mismos que la nº 1 y puede ir en el mismo correo.
>
> **Esta petición tiene fecha de caducidad**, y es la única de las cinco que la tiene.
> Lo explicamos abajo: el único histórico de viento que existe hoy vive **dentro de la
> propia HSU** y guarda **siete días**. Lo que no se lea esta semana se pierde.

**De dónde salió esto.** Nuestro primer planteamiento era pedir «el histórico que ya
está en el SCADA», y era **incorrecto**: hoy el SCADA **sólo guarda diagnósticos y
telemetría cuando se los pedimos**, no en continuo. No hay un año esperando a que
alguien lo exporte. Rehecha la petición sobre eso.

**Las cuatro HSU.** Las cuatro, no una: están repartidas por el campo y la dispersión
entre ellas es parte de lo que queremos medir.

| | NCU / gateway | esclavo Modbus | coordenadas |
|---|---|---|---|
| HSU 1 | NCU 1 · GW 1 | 230 | 41,57864 · −0,798845 |
| HSU 2 | NCU 1 · GW 2 | 231 | 41,577596 · −0,795232 |
| HSU 3 | NCU 2 · GW 1 | 230 | 41,576396 · −0,801515 |
| HSU 4 | NCU 2 · GW 2 | 231 | 41,573795 · −0,796697 |

Separadas entre **323 y 568 m**. Cuatro anemómetros en ese cuadro es justo lo que hace
falta para saber si **un** anemómetro puede hablar por la planta entera, que hoy es una
suposición de todo el diseño.

---

### A · AHORA, y corre prisa: vaciar el datalogger de las cuatro HSU

La HSU guarda, **minuto a minuto**, un registro propio en el bloque `31000`–`36763`:

| Por cada uno de los 1.441 minutos del día | |
|---|---|
| `WindDirectionPrev` | dirección predominante de ese minuto, grados |
| `WindSpeedAvg` | media de ese minuto, km/h |
| **`WindSpeedMax`** | **máximo de ese minuto, km/h** |
| `SnowLevelMax` · `IrradianceAvg` | nieve e irradiancia |

Se elige el día con `41300 DayDataRequest` (0 = hoy, 1 = ayer…), y **su rango es
`0..6`**: **siete días, y rotando**. Ese `WindSpeedMax` por minuto es **la única racha
medida que existe en todo el sistema** — todo lo demás, en el simulador y en la ficha,
es modelo. Cada día que pasa sin leerlo, se pierde un día de racha real para siempre.

**Lo que cuesta, calculado para que nadie tenga que estimarlo:** son 4 registros por
minuto × 1.441 minutos = **5.764 registros por día y HSU**. En lecturas Modbus de 125,
son 47 por día y HSU → **1.316 lecturas y ~315 kB** para los siete días de las cuatro.
**Una sola vez**, no una carga permanente. Para comparar: un ciclo normal de la NCU 1 de
El Burgo son 28 transacciones y 8,3 kB, y hace 2.880 al día.

**Nuestro colector hoy NO lee este bloque** — lee el valor corriente, no el datalogger.
Así que lo que pedimos es permiso y ventana para sondearlo, o que nos lo volquéis
vosotros. Nos vale un CSV por HSU:

```
time, wind_speed (km/h), wind_speed_max (km/h), wind_direction (deg)
```

Con la unidad en la cabecera, que el simulador ya la lee de ahí y así no tiene que
adivinarla.

---

### B · Y a partir de ahora: que la recogida sea continua

Si el SCADA sólo guarda cuando se le pide, dentro de un año seguiremos sin tener un año.
**Lo que falta no es código**: el colector de `scada` ya lee `wind_speed` (f32, m/s) y
`wind_direction` (f32, grados) de los bloques 30200 y 28000, el API ya sirve
`/meteo/history` hasta 8.760 h, y el intervalo de meteo ya está configurado a **10 s**.
Falta **encenderlo contra El Burgo** y dejarlo correr.

Dicho con franqueza: **esto no nos sirve para la decisión de este mes**, sirve para que
la de dentro de un año se tome sobre dato y no sobre modelo. Las dos cosas valen la
pena, pero A y B no compiten: A es lo urgente, B es lo que evita volver a estar así.

---

### C · La configuración que ya tenéis puesta (una lectura, sin histórico)

Lo que más barato os sale y más nos cambia: **los umbrales de viento que la planta usa
hoy**, por HSU. Nosotros simulamos con **T1 = 40 km/h** y **T2 = 60 km/h**, y son
**suposiciones nuestras**, no vuestras.

| Registro | Qué es |
|---|---|
| `41076`–`41108` `WindLevel1..10Thr_mps` + sus `OnTime_s` / `OffTime_s` | los diez niveles de viento |
| `41011` `WindSpeedLow_mps` · `41013` `WindSpeedMid_mps` · `41017`/`41018` sus tiempos | alarma 1 |
| `41200`–`41211` | alarmas 2 y 3 |
| `41214` `SafePosTimeout` | cuánto tarda en soltarse |

Una captura de la toolbox vale. No hace falta documento.

---

### D · Cinco números de configuración sin los cuales el dato se lee mal

1. **`41071 WindSpeedAVGperiod_s` — ¿a cuánto está?** El rango del R23 es **0..15 s**.
   Nuestros T1 y T2 están definidos **sobre la velocidad media**, y una media de 15 s no
   es una media de 10 minutos. Si está en 15, lo que nosotros llamamos «media» y lo que
   la HSU llama «media» son dos cosas distintas, y hay que decirlo **antes** de comparar
   nada.
2. **`41020 WindVaneOffset_deg`, por HSU.** Es el offset de instalación de la veleta.
   Sin él la dirección no significa nada, y con cuatro veletas puede ser distinto en
   cada una.
3. **`41008 HasSonicAnemoSensor` — ¿de copas o sónico?** Responden distinto a la racha,
   que es justo lo que venimos a medir.
4. **`41300 DayDataRequest` — ¿confirmáis los 7 días?** El R23 le declara rango `0..6`.
   Si en planta fueran menos, A corre todavía más prisa.
5. **El rango `0..42 km/h` del datalogger.** `WindSpeedAvg` y `WindSpeedMax` son `U8` y
   el R23 les declara rango **0..42 km/h**. Si eso es una **saturación real**, el
   registro por minuto **no puede grabar nuestro T2 de 60 km/h** — ni los 47,5 km/h que
   el año típico de El Burgo ya tiene. ¿Satura a 42, o son unidades escaladas? No lo
   damos por supuesto porque cambia qué se puede concluir del histórico.

---

### Por qué todo esto, medido

Hemos corrido el simulador sobre **24 años-emplazamiento** de dato real o típico, todos
ya horneados en los repos de la casa. En los 24 años salen **dos episodios en total**:

| | episodios en todo el año |
|---|---|
| El Burgo, año típico PVGIS | 1 |
| Ayora, año típico PVGIS | 0 |
| Madrid, 2 años reales de ERA5 (2019 y 2024) | 1 (sólo 2024) |
| Sevilla, **los 20 años reales de ERA5** | **0** |

**Eso no es un resultado sobre vuestras plantas: es la medida de lo que el reanálisis NO
ve.** Una celda de ~30 km promediada a la hora no tiene rachas, y es la racha la que
abandera. Cambiando sólo el criterio —la misma serie disparada con racha de 3 s en vez
de con la media— Sevilla 2013 pasa de **0 a 41 episodios** y El Burgo de **1 a 197**.
Esa racha hoy **la sintetiza un modelo nuestro**, y mientras la sintetice, las cuatro
estrategias se comparan sobre un número que nos hemos inventado.

**Y la dirección, que es peor.** Ninguna de las fuentes que tenemos la trae. El
simulador lo declara en pantalla —sin dirección, la estrategia «cara al viento» es **un
lado fijo disfrazado**— pero declararlo no lo arregla: con dos de las cuatro estrategias
dependiendo del lado del que sople, media comparativa está hoy apagada.

La HSU tiene las dos cosas. Por eso esta petición.

---

### Lo que NO estamos pidiendo

**Ningún permiso de escritura, y no vamos a escribir nada.** Todo esto es lectura. Lo
del repo sigue siendo **simulación y explicación**, y las escrituras que hay van contra
una **NCU simulada** en banco. Si mandáis un CSV, además, **no sale del navegador**: la
ficha lo lee en local y no lo sube a ninguna parte.

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
- **5A** → siete días de racha MEDIDA, minuto a minuto, antes de que roten. El criterio
  de disparo deja de ser una elección nuestra, y con las cuatro HSU a la vez sabremos
  por fin si un anemómetro puede hablar por la planta.
- **5B** → dentro de un año habrá un año. Hoy no lo habría.
- **5C/5D** → T1 y T2 dejan de ser suposición nuestra, y la dirección pasa a significar
  algo. Sin el offset de veleta, «cara al viento» seguiría siendo un lado fijo
  disfrazado aunque tuviéramos la serie.

## Y lo que seguirá faltando después

Que esto es un **borrador para discusión interna, no apto para uso operativo ni
comercial**, y lo seguirá siendo hasta que alguien lo apruebe como algo más. Ninguna de
estas cuatro respuestas cambia eso por sí sola.
