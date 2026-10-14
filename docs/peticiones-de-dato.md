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
> **La parte A tiene fecha de caducidad**, y es lo único de las cinco peticiones que la
> tiene: el único histórico de viento que existe hoy vive **dentro de la propia HSU** y
> guarda **siete días** rotando. Lo que no se lea esta semana se pierde.
> La parte B no caduca, pero cada día que no esté encendida es un día que no se recoge.

**De dónde salió esto, en dos correcciones.** El primer planteamiento pedía «el
histórico que ya está en el SCADA», y era **incorrecto**: hoy el SCADA **sólo guarda
diagnósticos y telemetría cuando se los pedimos**, no en continuo — no hay un año
esperando a que alguien lo exporte. Y la segunda corrección es la que salva la
petición: **la telemetría sí se puede recoger desde la NCU y el recolector ya está
preparado**, cada 10–15 s. Así que esto no es «pedir que alguien construya un
histórico»: es **encender lo que ya existe** (B) y **rescatar los siete días que están a
punto de rotar** (A).

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

**Lo que cuesta, medido con el modelo de tráfico de la casa** (no estimado a ojo: el
mismo modelo reproduce al byte la cifra documentada del ciclo completo, 28 transacciones
y 8.346 B). Son 4 registros por minuto × 1.441 minutos = **5.764 registros por día y
HSU**, que en lecturas Modbus de 125 son 47 transacciones y 16.555 B. Para los siete
días de las cuatro HSU:

> **1.316 transacciones y 0,46 MB. Una sola vez.**

No es una carga permanente. Para comparar: el ciclo normal de seguidores de la NCU 1 ya
mueve **24 MB al día**, todos los días. Esto es **el 2 % de un solo día** de lo que ya
circula.

**Nuestro colector hoy NO lee este bloque** — lee el valor corriente, no el datalogger.
Así que lo que pedimos es permiso y ventana para sondearlo, o que nos lo volquéis
vosotros. Nos vale un CSV por HSU:

```
time, wind_speed (km/h), wind_speed_max (km/h), wind_direction (deg)
```

Con la unidad en la cabecera, que el simulador ya la lee de ahí y así no tiene que
adivinarla.

---

### B · Y desde hoy: encender la recogida continua de las cuatro HSU

**Esto no es un proyecto, es una configuración.** La telemetría se recoge desde la NCU y
el recolector ya está preparado. Lo único que falta:

| | Qué | De quién |
|---|---|---|
| 1 | `driver: "simulated"` → `"modbus"` en `config/plants.yml` | nuestro, una línea |
| 2 | **Alcance de red a las dos NCU**: `10.100.1.52:502` y `10.100.1.56:502`, `unit_id 1` — o una máquina dentro de la planta donde correr el recolector | **vuestro, y es lo único que pedimos aquí** |

Todo lo demás ya está escrito y configurado: el colector lee `wind_speed` (f32, m/s) y
`wind_direction` (f32, grados) de los bloques 30200 y 28000, las cuatro HSU están
declaradas (`hsu_count: 2` por NCU, esclavos 230 y 231), el API sirve `/meteo/history`
hasta 8.760 h y el intervalo de meteo ya está puesto a **10 s**.

**Lo que cuesta, medido con el modelo de tráfico de la casa** —el mismo que reproduce la
cifra documentada del ciclo completo, 28 transacciones y 8.346 B, al byte—:

| Sondeo | Las 4 HSU, las 2 NCU | Al año |
|---|---|---|
| cada 10 s | **9,02 MB/día** | 3,29 GB |
| cada 15 s | 6,01 MB/día | 2,19 GB |
| cada 30 s | 3,01 MB/día | 1,10 GB |

Son **2 transacciones y 522 B por ciclo y NCU**. Para comparar: el ciclo normal de
seguidores de **una sola** NCU ya son **24 MB/día**. O sea que vigilar el viento de la
planta entera cada 10 s cuesta **poco más de un tercio** de lo que ya cuesta sondear los
seguidores de una NCU — y es el dato que decide si se abandera.

**Y qué compra.** El registro `30003 WindSpeed_mps` es una media de **como mucho 15 s**
(lo fija `41071`, rango 0..15). Muestreado cada 10–15 s, eso **no es la media horaria de
un reanálisis**: es la escala a la que de verdad se dispara un abanderamiento, y viene
con su **dirección** en cada muestra. En un par de semanas tendríamos para El Burgo lo
que hoy no tenemos de ninguna planta.

**Dicho con precisión, para no vender de más:** una muestra cada 10 s de una media de
15 s **no es una racha de 3 s**. La racha medida de verdad sigue siendo el
`WindSpeedMax` por minuto del apartado A. **A y B no se solapan: A es el pasado —siete
días y se van—, B es todo lo que venga a partir de encenderlo.**

**Una pregunta de paso:** las cuatro están declaradas con `hsu_extended: false`, así que
hoy no leeríamos el bloque 28000. ¿Alguna de las cuatro tiene piranómetro? Si lo tiene,
tendríamos también **irradiancia medida**, y el simulador dejaría de rellenarla con
cielo claro (hoy lo hace, y lo declara en pantalla).

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

**Eso no es un resultado sobre vuestras plantas: es la medida de lo que un reanálisis a
30 km de rejilla, promediado a la hora, NO ve.** Es la racha la que abandera, y a esa
escala no hay rachas. Cambiando sólo el criterio —la misma serie disparada con racha de
3 s en vez de con la media— Sevilla 2013 pasa de **0 a 41 episodios** y El Burgo de **1
a 197**.

> **Corrección, 14 de octubre.** La primera versión de este apartado decía que la racha
> «la sintetiza un modelo nuestro» y que **ninguna de nuestras fuentes trae dirección**.
> Lo segundo era **falso** y lo primero, incompleto. La ficha pide a Open-Meteo
> `winddirection_10m` y `wind_gusts_10m`, y cuando el servicio las sirve manda la
> medida, no el modelo: está escrito en su propio código («LA MEDIDA MANDA SOBRE EL
> MODELO»). Lo que no las trae son **los CSV horneados en los repos**, que son sobre los
> que se corrieron esos 24 años, desde una máquina sin salida a Open-Meteo. O sea que la
> síntesis era una propiedad de **aquellas ejecuciones**, no de la herramienta. El
> apartado queda reescrito sobre lo que sí es cierto.

**Entonces, ¿para qué la HSU, si ERA5 ya da racha y dirección?** Porque no son la misma
magnitud, y la diferencia es justo la que decide:

| | ERA5 vía Open-Meteo | HSU de El Burgo |
|---|---|---|
| **qué es** | producto de reanálisis de una celda de **~30 km** | medida de **vuestro** anemómetro, dentro del campo |
| **dónde** | una celda para toda la comarca | cuatro puntos, separados 323–568 m |
| **altura** | 10 m, que la ficha reescala a 4 m con un factor | la que esté instalada, y se puede preguntar |
| **cadencia** | horaria | 10–15 s en vivo; **máximo por minuto** en el datalogger |
| **dispersión en planta** | no existe: un valor para todo | **medible**, con las cuatro a la vez |

Un reanálisis **no ve el relieve local; la HSU sí, porque está dentro** — y eso no lo
decimos aquí para convenceros: está escrito en la ficha desde antes de esta petición.
Para decidir si **estos** seguidores abanderan, una racha promediada sobre 30 km no es
el dato; es lo mejor que hay a falta del dato.

**Y lo que ERA5 no puede dar de ninguna manera: la dispersión.** Si un anemómetro puede
hablar por la planta entera es hoy una **suposición de todo el diseño**, y las cuatro
HSU a la vez son la única forma de comprobarla. Dos de las cuatro estrategias dependen
del lado del que sople; sin saber cuánto difieren cuatro veletas separadas medio
kilómetro, no sabemos qué margen tiene esa decisión.

La HSU tiene las dos cosas y ERA5 no puede tenerlas. Por eso esta petición.

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
- **5A** → siete días de racha medida **en la planta**, minuto a minuto, antes de que
  roten. No sustituye a la racha de ERA5: la carea contra ella, que es lo que hoy nadie
  ha hecho. Y con las cuatro HSU a la vez sabremos por fin si un anemómetro puede hablar
  por la planta.
- **5B** → desde el día que se encienda, viento y dirección reales de las cuatro HSU
  cada 10–15 s, por 9,0 MB/día. En un par de semanas hay con qué comparar las
  estrategias sobre dato de planta, no dentro de un año.
- **5C/5D** → T1 y T2 dejan de ser suposición nuestra, y la dirección pasa a significar
  algo. Sin el offset de veleta, «cara al viento» seguiría siendo un lado fijo
  disfrazado aunque tuviéramos la serie.

## Y lo que seguirá faltando después

Que esto es un **borrador para discusión interna, no apto para uso operativo ni
comercial**, y lo seguirá siendo hasta que alguien lo apruebe como algo más. Ninguna de
estas cuatro respuestas cambia eso por sí sola.
