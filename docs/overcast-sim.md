# Simulador de radiación difusa — las políticas del core en el navegador · y estudio del diffuse tracking

**Página**: `https://imoriana3.github.io/cobertura-zigbee/overcast.html` · repo `cobertura-zigbee`
**Un único HTML, física offline, sin dependencias de código.** QA integrada (botón «Verificar contra
el contrato del core») y test de Node (`tools/test_overcast_sim.mjs`) que ejecutan la MISMA batería.
Open-Meteo (datos, no código) es el único extra online, opcional.

## Qué es (y qué no)

Un espejo JavaScript del módulo canónico de tracking de SolarGPT (`solargpt_core/tracker.py`,
schema 2.1.0) para ver y comparar **las políticas de difusa del core** en días nublados: qué hace
cada una minuto a minuto, cuánta POA gana o pierde, cuántas veces conmuta y cuánto maniobra —
y, desde v1.20.0, **cuánto cuesta**: arranques de motor, grados y vatios-hora de batería, con el
modelo de motor medido en campo (§ 2.1). El compañero del
[Simulador de Backtracking](backtracking-sim.md): aquel responde a «¿a qué ángulo para no
sombrear?», este a «¿y cuando no hay sol que sombree?».

**NO es** el motor bancable: el generador de nubes es sintético (declarado), el POA no es energía
AC y la estimación anual es una comparativa de políticas, no un P50. Para números de proyecto: el
motor SolarGPT con meteo real. La regla de la casa aplica: toda simplificación viaja **declarada**
en la propia página.

## De dónde sale cada fórmula

Nada reinventado: posición solar NOAA, Ineichen-Perrin, `pvlib.tracking.singleaxis`
(Anderson & Mikofski 2020) y Perez 1990 (`allsitescomposite1990`) son **las mismas funciones,
copiadas literales, que backtracking.html** — una física, dos simuladores. Lo nuevo espeja
`tracker.py`:

| Pieza | Referencia espejada | Notas |
|---|---|---|
| Baseline θ_n | `get_baseline_theta` (pvlib singleaxis + backtracking) | noche → NaN → stow 0°, como el core |
| POA | `compute_poa_perez` (Perez 1990, misma tabla) | **una sola transposición para todas las políticas** — sin sesgo de medida |
| Clamp | `clamp_to_backtrack` | \|θ_out\| ≤ \|θ_n\| **innegociable**: Perez modela superficie aislada; superar θ_n inflaría la POA con energía que la planta pierde en sombra fila a fila |
| `diffuse_flat` | `policy_diffuse_flat` | a 0° si POA(0) > 1,02·POA(θ_n); sin memoria — enseña el chattering |
| `diffuse_limited` | `policy_diffuse_limited` / `limited_hold_path` | retiene θ previo mientras no pierda (hold 1,0), con el clamp defensivo del candidato |
| `diffuse_continuous` | `policy_diffuse_continuous` | barrido α∈{0,¼,½,¾,1} de θ=(1−α)·θ_n, argmax POA. α=0 es candidato ⇒ **techo no-anticipativo garantizado paso a paso** |
| `diffuse_poa_switch` | `policy_diffuse_poa_switch` / `poa_switch_flat_mode` | máquina de estados: confirm 30 min + dwell 90 min **en minutos absolutos** (schema 2.1.0, invariante en resolución); puerta nocturna NaN-safe que resetea estado |
| Lazo de control | `apply_control_loop` | deadband 1,0° + slew 0,17°/s + tope ±55° (canónicos `CANONICAL_*`) |
| Nube → irradiancia | escenario de `test_diffuse_policies.py` | GHI = claro·(1−0,70·cc): a cc=1 queda el **30 % del claro, 100 % difuso** — el overcast canónico del test del core. DNI = claro·(1−cc)³ |
| Meteo real | Open-Meteo (ERA5 / ICON-GFS) | GHI/DNI/DHI y nubosidad **medidas**; radiación horaria = media de la hora precedente → timestamp centrado −30 min |
| Escena 3D | `seguidor.js` (fuente única del modelo, la misma que el gemelo y backtracking.html) | sombras por shadow-map; sol por DNI, hemisferio por DHI (la difusa ES la luz ambiente); nube por zona; sin WebGL cae al corte 2D |
| Coste de maniobra | `motor_energy.py` `AJUSTE_FLOTA` | **E = 0,0901 + 0,0447·\|Δθ\|**, ajustado sobre 14.759 maniobras reales: cada arranque cuesta 0,0901 Wh explícitamente. Un movimiento es un **tramo contiguo** de giro (una rampa de 55° es 1, no 55), con ε = 0,05° de ruido de encoder. El modelo del ENSAYO (misma forma, otro intercepto) **no se usa**: dominio \|Δθ\| ≥ 20°, el core da NaN por debajo. Las **bandas** por amplitud y la **curva I(θ)** del gemelo quedan seleccionables como contraste — ver §2.1 |
| Reposo de la TCU | `tcu.py` `TCU_IDLE_W` | 0,64 W constantes (ni los 5 W viejos ni los 0,45 de `tcu_compare`); igual de día que de noche, y **fuera de las filas** porque no depende de la política |
| Accionamiento de la planta | `<planta>_layout.json` → `geometria.bifila` | **El layout manda, no una tabla en la app.** Bifila = cada unidad son DOS filas a ±filaZ. Bagnarelli figuraba monofila porque el dato se copió del sim de BT, que lo dedujo de un `filaZ 0` que el layout ya había corregido — y había una prueba exigiendo el valor equivocado. La QA ya no fija literales: carea REALMETA contra `geometria.bifila` de cada layout remedido |
| Zonal por NCU | extensión propia (estilo Zonal Diffuse de Nextracker) | el frente cruza la planta con retardo por zona; GLOBAL = un sensor de planta decide un θ común, ZONAL = cada NCU con su señal. Para `continuous`, zonal ≥ global **por construcción** (argmax local paso a paso) — la QA lo exige; para las políticas con histéresis es una medición |

## Las cinco políticas (mismos nombres que el core)

| Política | Semántica exacta | Carácter |
|---|---|---|
| **pvlib** | singleaxis + backtracking, sin difusa | la referencia contra la que se mide todo |
| **diffuse_flat** | 0° cuando POA(0) > 1,02·POA(θ_n) | greedy sin memoria: máxima señal, máximo chattering |
| **diffuse_limited** | retiene el ángulo previo mientras no pierda POA | mínima maniobra; nunca pierde con hold 1,0 |
| **diffuse_continuous** | argmax del barrido α | el TECHO matemático no-anticipativo; conmutaría a cada paso |
| **diffuse_poa_switch** | confirm 30' + dwell 90' | **la ejecutable en campo**: el dwell también bloquea la re-entrada, a propósito (protege el actuador) |

La QA exige los mismos contratos que `test_diffuse_policies.py`: flat ENTRA (flag y θ=0) en
overcast con el tracker inclinado; continuous ≥ pvlib **en cada paso**; el pulso de 15 min no
conmuta; el dwell bloquea la re-entrada con la señal viva; los bordes de conmutación caen en el
mismo instante físico a 1/5/10/15 min; enter_ratio imposible ⇒ jamás conmuta; ghi_min gigante ⇒
passthrough; NaN en GHI ⇒ passthrough sin NaN en la salida.

## ¿Y el óptimo anisótropo? Medido, y descartado

El core no busca el máximo: barre **cinco** ángulos por paso (α ∈ {0, ¼, ½, ¾, 1}). Con circumsolar
el óptimo no cae en esa rejilla, así que la pregunta legítima era cuánto se deja sobre la mesa.

Se midió con una **cota** —el máximo exacto de la misma Perez sobre θ ∈ [0, θ_n], con semillas en los
propios candidatos α y refino ternario— en 15 días (3 fechas × 5 cielos, decisión 5 min):

| Cielo | Hueco hasta el óptimo |
|---|---|
| Despejado | 0,000 % |
| Canónico (test del core) | 0,000 – 0,001 % |
| Frentes | 0,004 – 0,008 % |
| Tarde nublada | 0,001 – 0,017 % |
| **Overcast total** | **0,000 – 0,049 %** |

El hueco no llega al **0,05 %** y el ángulo difiere **1–2°**, casi siempre por debajo del deadband de
1°: el actuador ni se movería distinto. Es dos órdenes de magnitud menor que la propia ganancia de
difusa (1,2 %) y una décima parte del coste del tránsito (0,42 %/año).

**Conclusión: no hay quinta política.** Lo que la app trae es la cota, en una casilla aparte, apagada
por defecto y rotulada «NO es del core» — con su fila en la tabla y el hueco explícito frente a
`continuous`. Desde v1.22.0 también **se puede elegir en la escena** para ver su curva de θ y su
estado en el HUD: estaba en la tabla pero no en el desplegable, o sea que se podía calcular y no
mirar. Mirarla no es servirla. Lo que no tiene es **diario**, y el panel lo dice en vez de
fabricarle uno: la cota no decide, *resuelve* un argmax sin umbral ni memoria, así que no hay
maniobra que justificar. Sirve para *enseñar* que la política del core está pegada al techo, no para
servirse como consigna. La batería exige que ese hueco siga por debajo del 0,1 %: si algún día creciera, la
prueba lo caza y entonces sí tocaría llevar el barrido fino al core.

## Cómo se lee la tabla del día (y qué NO es comparable entre filas)

Tres columnas se prestan a leerse mal, y las tres llevan el sentido escrito desde v1.22.0:

- **«% del día activa» no es comparable entre políticas.** Cada una activa con su propio criterio,
  así que el número cuenta cosas distintas en cada fila: `flat` y `poa_switch` van a 0° (**PLANO**),
  `limited` **RETIENE** el ángulo previo y `continuous` elige un ángulo **intermedio**. Por eso
  `limited` puede marcar un 59 % sin estar plana ni un minuto. La celda lleva ahora el modo al lado.
- **«% batería gastada» es consumo, no ahorro.** El Δ verde de la columna de motor sí es ahorro
  frente a pvlib; el % de batería es lo que se va.
- **«°/mov» es la relación entre movimientos y recorrido** (amplitud media de cada maniobra), y es
  la que fija el precio: medido en flota, el coste por grado se multiplica por **3,5** al bajar de
  5° a menos de 1°. Dos políticas con el mismo recorrido cuestan distinto si una lo trocea más.

Y una del HUD: **GHI, DNI y DHI no suman como parece**. El cierre es `GHI = DNI·cos z + DHI` —el haz
llega inclinado y solo aporta su proyección horizontal—, así que 850 + 117 ≠ 855 no es un descuadre.
El HUD muestra el término `DNI·cos z` explícito para que los dos sumandos se lean. El cierre se
verifica a 2,8e-17 W/m² en la batería, junto con que la difusa **suba** al nublarse (114 → 466 W/m²
a cc 0,6): si no subiera, el modelo de nubes estaría perdiendo energía en vez de dispersarla.

## El cielo del día

Tres fuentes: **pintar** la nubosidad con el ratón (tira de 288 bines de 5 min), **presets**
(despejado, overcast total, mañana/tarde nublada, frentes, el escenario canónico del test del core,
aleatorio con semilla) y **Open-Meteo**: histórico ERA5 desde 1940 o previsión, con modo **EN
VIVO** (fecha de hoy, reloj en AHORA, refresco cada 10 min). Con día real, la irradiancia del paso
es la **medida** interpolada — el modelo de nubes solo rellena huecos.

---

# Estudio: diffuse optimization / overcast en trackers

*Elaborado 2026-08-14 · revisado 2026-08-26. Cifras de fabricante separadas de cifras medidas/publicadas.*

> **Revisión 2026-08-26.** El punto de §1 «el óptimo no es exactamente 0° con cielo anisótropo» ha
> dejado de ser una cita para pasar a ser una **medida propia**: el barrido de cinco α del core deja
> como mucho **0,049 %** frente al óptimo exacto, con 1–2° de diferencia que casi siempre caen por
> debajo del deadband de 1°. Está desarrollado en **«¿Y el óptimo anisótropo? Medido, y descartado»**,
> arriba en este mismo documento, y es la razón por la que **no** se implementó la quinta política que
> §1 sugería.
>
> La tabla de la competencia de §3 **sí se ha repasado el 26-08**, con dos avisos: la revisión se hizo
> solo con buscador —el entorno no dejó abrir ninguna fuente primaria— y el «+1,5 % anual» de PVH
> **no se pudo re-verificar**. El detalle, fila a fila, está en la nota de método al final de §3.

## 1 · La física

Con cielo cubierto la radiación es mayoritariamente **difusa** y cuasi-isótropa: un plano
horizontal «ve» todo el domo celeste (factor de vista 1) y capta más que un plano inclinado
persiguiendo un sol que no está. El clásico que lo midió es **Kelly & Gibson (2009)**, *Solar
Energy* 83: en cubierto, la horizontal capta **~50 % más** que el seguimiento a 2 ejes; su secuela
de 2011 derivó el algoritmo combinado (al sol en despejado, plana en cubierto) que GM patentó
(US8101848). Matices que importan al diseño:

- **El óptimo no es exactamente 0°** con cielo anisótropo: la componente circumsolar (Perez,
  Hay-Davies) desplaza el óptimo ligeramente hacia el sol, y decrece de despejado a cubierto.
  Elegir Perez frente a isotrópico cambia la consigna varios grados — por eso el core (y este
  simulador) barren candidatos con **Perez** en vez de fijar 0° a ciegas (`diffuse_continuous`).
  En 2025 se publicaron las primeras expresiones analíticas del ángulo óptimo bajo cualquier
  cielo (*Solar Energy*, «On the calculation of the optimum position of a horizontal single axis
  tracker…»), incluyendo el apantallamiento de difusa por filas vecinas.
- **Con solo GHI hay que descomponer**: Erbs/Boland (correlaciones kt), DISC/DIRINT, Engerer2
  (estándar subhorario de facto, PVsyst ≥ 8.1). Un controlador con piranómetro GHI y sin DHI vive
  de estas correlaciones y hereda su error.
- **El techo depende del clima**: NREL (**Anderson & Aneja 2022**, IEEE PVSC 49) malló EEUU a
  0,25° y acotó la ganancia anual de optimizar irradiancia total en **0,1–0,4 % típico, ~1 % solo
  en sitios de alta fracción difusa**. El estudio europeo de *Solar Energy* (2018) da lo mismo
  cualitativamente: ganancias serias en el norte nublado, modestas en España.

## 2 · El problema de control (donde se gana o se pierde de verdad)

La señal «POA(0) > POA(θ_n)» parpadea con nubosidad variable. Un controlador greedy conmuta
decenas de veces al día: desgaste de actuador con ganancia marginal, y además **decidir tarde +
llegar tarde** (slew 0,17°/s ≈ 6 min para 60°) se come parte de la ganancia — la propuesta de
optimización difusa de PlantPredict para pvlib (issue #1694) pondera explícitamente por velocidad
de rotación y «hesitation factor» por lo mismo. La referencia de diseño reciente es **Adinolfi
Borea et al. (2026)**, *Electronics* 15(3):597: un criterio de **persistencia temporal** antes de
ir a diffuse-stow reduce el movimiento extra del 114 % al 0,16 % sacrificando ~0,17 pp de una
ganancia de ~0,37 % — la histéresis casi elimina el chattering perdiendo menos de la mitad de la
ganancia. Es exactamente la arquitectura del `diffuse_poa_switch` del core (confirm 30' + dwell
90'), que ya estaba ahí: el paper valida la decisión. El simulador lo enseña en vivo: comparar
`diffuse_flat` (conmutaciones) contra `diffuse_poa_switch` (recorrido en grados, columna «coste
del lazo») en el preset «frentes».

### 2.1 · Lo que cuesta la ganancia, en vatios-hora medidos

Desde v1.20.0 la tabla no solo dice lo que cada política **gana**, sino lo que hay que pagar:
**arranques de motor**, **grados de maniobra** y **vatios-hora de batería**. El modelo de motor no
se estima: es medida de campo, espejada de `solargpt_core/motor_energy.py`.

La decisión metodológica importa, y hubo que corregirla una vez. **El modelo del ensayo**
(`E = E₀ + k·|Δθ|` sobre 8 barridos instrumentados de ±55°) es el más preciso de la casa y **no se
usa**, a propósito: su dominio es `|Δθ| ≥ 20°` y el core devuelve `NaN` por debajo, porque su
término fijo sale de barridos de 110° y extrapolarlo a micro-maniobras se equivoca **×27**, medido
contra 106 TCUs. Las maniobras de un tracker en operación son de 1–2°, que las fija la banda
muerta.

Se usa el modelo que sí cubre ese régimen: **el mismo modelo de dos términos, pero ajustado sobre
las 14.759 maniobras reales** de flota (El Burgo, 106 TCUs), que el core publica como
`AJUSTE_FLOTA`:

> **E = 0,0901 + 0,0447·|Δθ|**  [Wh]

Su intercepto es **27 veces menor** que el del ensayo, y esa distancia es precisamente la medida
de cuánto se separan los dos regímenes. Cada arranque cuesta **0,0901 Wh explícitamente**, así que
dos políticas con el mismo recorrido se separan *exactamente* en `(nº de arranques) × 0,0901`. Eso
es lo que convierte el chattering de un argumento cualitativo en una factura, y lo que hace que
«movimientos» sea una columna y no un adorno.

**Por qué NO las bandas, aunque salgan del mismo sitio.** La primera versión usaba la medida en
bruto agrupada por amplitud (0,2262 Wh/° por debajo de 1° · 0,0880 de 1–2° · 0,0701 de 2–5° ·
0,0653 por encima). Reproduce el día de flota por construcción, pero es una **función escalón**:
*dentro* de una banda el coste es estrictamente proporcional a los grados, así que duplicar los
arranques no cuesta nada. Medido: 240° troceados en maniobras de 20° y de 10° dan **15,67 Wh los
dos** —el doble de arranques, cero coste extra—, y 0,8° frente a 0,5° dan 54,29 los dos. Con ese
modelo la columna de movimientos podía doblarse sin que la de energía moviera un dígito, que era
exactamente lo que la tabla existía para evitar. Las bandas se quedan como contraste seleccionable
y declarado, no como modelo por defecto.

Medido sobre 21-jun en Gorraiz con cielo cubierto al 95 %, **ciclo de decisión de 1 min**, que es
el que usa la TCU en campo (desde v1.21.0 es el valor por defecto de la aplicación; el 10 min del
core legacy sigue seleccionable para carear):

| política | movimientos | recorrido | arranque | giro | motor | Δ motor |
|---|---|---|---|---|---|---|
| pvlib (baseline) | 178 | 228° | 16,04 Wh | 10,19 Wh | 26,23 Wh | — |
| `diffuse_flat` | 69 | 159° | 6,22 | 7,12 | 13,33 Wh | −49 % |
| `diffuse_limited` | 64 | 104° | 5,77 | 4,64 | 10,40 Wh | −60 % |
| `diffuse_poa_switch` | 54 | 128° | 4,87 | 5,73 | 10,60 Wh | −60 % |
| `diffuse_continuous` | 44 | 104° | 3,96 | 4,64 | 8,60 Wh | −67 % |

A 10 min de ciclo los **ahorros** salen −47/−61/−60/−66 %: la comparación entre políticas se mueve
entre uno y cuatro puntos, que es lo que la hace citable. Los **vatios-hora absolutos**, en cambio,
casi se duplican al pasar de 10 min a 1 min, y por eso nunca se citan sin decir el ciclo.

O sea que **en cielo cubierto las políticas de difusa ganan energía y ahorran batería a la vez**.
No es un compromiso: tumbarse deja de perseguir un sol que no está, y no perseguirlo es
justamente no gastar motor. Con cielo despejado ninguna interviene y las cinco filas salen
idénticas — la primera comprobación que hay que exigirle a esto.

**Tres cautelas, porque este número se presta a citarse mal.**

1. **«Movimientos» no es una constante del tracker, sino del ciclo de control.** Con el mismo día
   y el mismo recorrido, bajar la decisión de 30′ a 1′ lleva de **28 a 178 arranques** y la factura
   de **12,80 a 26,23 Wh**. El desglose enseña por qué, y es la ventaja de tener dos términos: el
   de **giro se queda clavado en 10,25 Wh** —el recorrido no cambia— y **toda** la diferencia está
   en el de arranque, que va de 2,52 a 16,04 Wh. Citar un número de movimientos sin decir el ciclo
   de decisión y la banda muerta no significa nada.
2. **El recorrido sí es robusto** (±2 % en todo ese barrido). Es el número que se puede citar
   fuera, y es además el proxy de desgaste que usa el core.
3. **El reposo de la TCU no está en las filas**: 0,64 W = 15,4 Wh/día, del orden del propio
   consumo de motor. Es idéntico para todas las políticas, así que sumarlo aguaría justo la
   columna que existe para separarlas — pero para **dimensionar** batería hay que contarlo.

### 2.2 · Careo contra campo: qué queda avalado y qué no

El día de referencia es El Burgo, 2026-08-16, 106 TCUs (`scripts/audit/careo_motor_flota.py`).
Auditado magnitud a magnitud, **las tres cifras de campo no tienen el mismo estatus**, y esto
cambia la conclusión que figuraba aquí en v1.20.1:

| magnitud de campo | cómo se calcula | ¿sirve de referencia? |
|---|---|---|
| **19,2 Wh/día** | `Σ V·I·dt` sobre **todo** el día, sin máscara | **Sí.** Es una integral directa |
| 145 maniobras | rachas de `motor_state` a 11 s | **No como tal.** Ver abajo |
| 112,9° de recorrido | `Σ|Δang|` **enmascarado** por `motor_state` | **No.** No es el recorrido |
| 0,1699 Wh/° | 19,2 ÷ 112,9 | **No.** Numerador completo, denominador incompleto |

**Los 112,9° no pueden ser el recorrido del seguidor.** Es un argumento de geometría, sin modelo
de motor ni definición de maniobra de por medio: ese día el seguidor va de −54,4° a +54,3° y aparca
a +5° (rango ±55° confirmado en `elburgo_tcu.json`), luego recorre **como mínimo**
`108,6 + 49,3 + 59,4 = 217,3°`. El log da 112,9°, **la mitad del suelo**. La causa está en el
script: `trav = Σ|diff(ang)|[on]` aplica la máscara de `motor_state` al vector de diferencias, así
que el desplazamiento ocurrido en intervalos cuya muestra de cierre no viene marcada ON **se
descarta**. Con rachas de 1,1 muestras de media, eso es la mayor parte.

*Consecuencia para la casa, más allá de este simulador*: el «coste real por grado» de
`docs/fase-2l-motor-energia.md` (0,1699 Wh/°) está **inflado ~2×** por el denominador. La cifra
defendible es 19,2 ÷ ~220° ≈ **0,087 Wh/°**. Conviene llevarlo a quien mantiene ese análisis.

**El recuento de maniobras abarca un factor 45 según la definición**, y las tres están en uso en
casa: 19/TCU (episodios de movimiento, del auditor de campo) · 145/TCU (rachas de `motor_state`) ·
864/TCU (variación de ángulo, que cuenta ruido de encoder). El simulador cuenta **episodios**, la
misma definición que el auditor. El intercepto `0,0901 Wh` se ajustó bajo la definición de
**rachas**. Multiplicar uno por otro es mezclar unidades, y se nota en el reparto:

| | arranque | giro | total |
|---|---:|---:|---:|
| campo, base rachas (145 man., 112,9°) | 13,06 Wh · 72 % | 5,05 Wh · 28 % | 18,11 Wh |
| modelo, base episodios (73 man., 226,7°) | 6,58 Wh · 39 % | 10,14 Wh · 61 % | 16,71 Wh |

**El total cuadra; el reparto está invertido.** Los dos errores se compensan en parte —menos
arranques contra más grados—, así que el total es utilizable y el desglose no. En la aplicación el
desglose se muestra etiquetado como interno del modelo.

**El careo que sí vale**, mismo sitio y misma fecha, por el total:

| ciclo de decisión | movs | recorrido | arranque | giro | motor | vs 19,2 Wh |
|---|---:|---:|---:|---:|---:|---:|
| **1′ (la TCU real)** | **177** | **226,9°** | **15,95** | **10,14** | **26,09 Wh** | **+36 %** |
| 5′ | 143 | 229,2° | 12,88 | 10,24 | 23,13 Wh | +20 % |
| 10′ | 73 | 226,7° | 6,58 | 10,14 | 16,71 Wh | −13 % |
| 15′ | 51 | 229,6° | 4,60 | 10,27 | 14,86 Wh | −23 % |
| 30′ | 27 | 222,1° | 2,43 | 9,93 | 12,36 Wh | −36 % |

**Al ciclo real, el modelo SOBREESTIMA un 36 %**, y conviene decirlo así en vez de elegir el ciclo
que mejor cuadra. Hasta v1.21.0 la aplicación venía por defecto a 10 min y este careo salía −13 %,
que era un acuerdo cómodo y engañoso: no se elige la física para que encaje el número.

La desviación es además **trazable**, y sale de las dos mitades del modelo:

- **Arranques**: 15,95 Wh contra los 13,06 del ajuste sobre 145 rachas. El simulador cuenta **177**
  episodios donde el log marcó 145: el término fijo se cobra más veces de las que el ajuste vio.
- **Giro**: 10,14 Wh contra 5,05. Aquí no falla el modelo sino el dato de campo — los 112,9° están
  enmascarados y el recorrido real del día ronda los 227° (ver el suelo geométrico, arriba).

Corrigiendo solo el denominador enmascarado, el propio ajuste sobre el recorrido verdadero daría
`145 × 0,0901 + 227 × 0,0447 = 23,2 Wh` contra los 19,2 integrados: el ajuste ya sobreestima un
**21 %** por sí mismo cuando se le da el recorrido real. Es decir que buena parte del +36 % **no es
del simulador**, sino de aplicar un ajuste construido sobre trayectorias enmascaradas a una
trayectoria completa.

**Conclusión operativa**: los vatios-hora absolutos de la tabla son una **cota superior**, no una
predicción calibrada. Lo que se compara entre filas sí es sólido: entre 1 min y 10 min de ciclo, el
ahorro de cada política se mueve **uno a cuatro puntos**.

**Banda de incertidumbre de la comparación entre políticas** (overcast, 10′). Según se pondere el
recorrido o los arranques, el ahorro de cada política se mueve así:

| política | solo giro | total | solo arranques |
|---|---:|---:|---:|
| `diffuse_flat` | −38 % | **−47 %** | −60 % |
| `diffuse_poa_switch` | −52 % | **−60 %** | −73 % |
| `diffuse_continuous` | −59 % | **−66 %** | −75 % |

**El signo y el orden son robustos; la magnitud tiene una banda de aproximadamente un tercio.**
Fuera de casa conviene citar «las políticas de difusa reducen el consumo de motor entre un 40 % y
un 70 % en días cubiertos», no un número con dos decimales.

### 2.3 · Lo que este simulador NO responde (y dónde vive)

Tres cosas que un director de O&M preguntaría y que esta herramienta no puede contestar:

1. **Desgaste mecánico.** `travel_deg` es un *proxy* y no hay en toda la casa un modelo que lo
   convierta en intervalo de servicio: ni curva L10, ni horas-motor a fallo, ni ciclos nominales
   del reductor. A 145 maniobras/día son ~53.000/año y ~1,3 M en 25 años, sin nada con qué
   compararlo. «Menos movimientos, menos desgaste» es direccionalmente cierto y **cuantitativamente
   no sostenido**.
2. **Balance energético, no consumo.** Aquí se mide lo que el motor gasta. La pregunta que decide
   es si el SoC se mantiene sobre el 30 % que dispara la defensa a 55°, y eso depende también de la
   carga —panel de 45 W, ~40,5 W tras rendimientos, y en día cubierto un tercio—. Vive en
   `gemelo-digital/bateria.html`, con serie horaria 2013-2024.
3. **Tiempo de motor encendido.** El campo registra 2.011 s con 1.094 mA de mediana, **por debajo**
   de la corriente de régimen del ensayo (1.471-1.525 mA): el motor pasa buena parte del tiempo
   fuera de punto de trabajo, con `motor_pwm` mediano al 66,4 %. El modelo deriva el tiempo de
   `recorrido / 0,17 °/s` (1.334 s) y **no representa ese régimen**. La columna «minutos de motor»
   es optimista y no sirve para cálculos térmicos ni de ciclo de trabajo.

**Reproducibilidad.** Los logs de flota no están versionados (son dato de planta), así que la cifra
de campo no se puede recalcular desde el repositorio: se toma del informe. Para un expediente de
auditoría eso es una dependencia externa que hay que declarar.

## 3 · La competencia

*Cifras repasadas el **2026-08-26**. Ver la nota de método al final de la sección: esta pasada se
hizo con buscador, sin poder abrir las fuentes primarias.*


| Fabricante · producto | Mecanismo | Anual (fuente) | Días cubiertos |
|---|---|---|---|
| **Nextracker · TrueCapture** (Diffuse + Zonal Diffuse 2023) | sensores por fila + ML + previsión; zonal: solo la zona bajo la nube pasa a difuso | paquete «2–6 %» (mkt); **difuso aislado 0,42–0,99 %** (TaiyangNews); ~4 % paquete validado (Quintas, ICF) | — |
| **Array · SmarTrack Diffuse** | GHI en tiempo real + límites anti-chattering explícitos | «hasta 5 %» paquete (mkt, metodología DNV); sin cifra separada del difuso | — |
| **Soltec · Diffuse Booster / TeamTrack** | sensores + previsión | 2,5 % Mediterráneo / **1,3 % ecuatorial** / 3,8 % Norte (TÜV, vs estándar; mezcla efectos) | **+5,3 % nublados** Mediterráneo, +6,9 % Norte, pico +12,4 % un día (TÜV Rheinland, 2021) |
| **TrinaTracker · SuperTrack** (STA+SBA) | modelo bifacial 12 parámetros + deep learning | mkt «3–8 %»; **+3,24 % medido 1 año (SGS/CGC)**, +3,06 % (informe independiente); **media anual +2,21 %** — paquete | **hasta +9,15 % en cubierto**; +3,84 % con alta difusa (Nangong, Hebei) |
| **Arctech · AI tracking** | terreno + nubes + bifacial + inversores | mkt hasta 7 % total; **nubes 0,5–2 %** (white paper propio) | — |
| **GameChange · WeatherSmart** | distingue sombreado aleatorio de día cubierto | **hasta 1,5 % anual** (mkt) | **+6,02 % validado** (Enertis 2024); mkt hasta 13 % |
| **PVH · Diffuse Control** (dic-2024) | side-by-side de dos plantas contiguas | +1,5 % anual medido en sitio nublado ⚠ *no re-verificado en 2026-08* | hasta +20 % días muy cubiertos (PVH) |
| **Soltigua · MaxRad** | rota a posición menos inclinada, con el beneficio recalculado y enviado a cada controlador | **> 1 % en Centroeuropa** (fabricante, sitios con nublado frecuente) | hasta +7 % nublados de verano (fabricante) |

**Lectura honesta**: los «hasta 5–8 %» son paquetes completos (terreno + difuso + bifacial) y
marketing. El **modo difuso aislado converge en ~0,4–1,5 % anual** en climas templados y **5–13 %
en días cubiertos**, coherente con la literatura (NREL 0,1–0,4 % típico). La diferenciación del
sector está migrando de la cifra a: control **zonal** (Nextracker), **anticipación**
(nowcasting con all-sky imagers, RMSE 6,9–18,1 % a 1–20 min; Fraunhofer DeepTrack) y
**validación por terceros** (TÜV, SGS, Enertis, DNV, ICF). Hay patentes activas sobre seguimiento
de difusa, detección de cielo cubierto y mitigación de «flutter» (US10935992, US11703887,
US12025349, US11500397, US11823409, US12345447): revisar libertad de operación antes de
industrializar un algoritmo propio.

**Lo que ha aparecido desde agosto de 2025 — y va a favor de la cifra honesta.** Dos trabajos
revisados por pares, ninguno de un fabricante:

- **Electronics 15(3):597 (29-ene-2026)**, «Solar-Tracker Diffuse-Response Algorithm for Balancing
  Energy Gain and Mechanical Wear»: es el paper que §2 ya citaba, y ahora se sabe que está
  **validado con medidas de campo de marzo de 2025**, con exactitud global < 3 % e incertidumbre de
  potencia < 1 %, en cadenas monofaciales **y bifaciales**. Su criterio es exactamente el nuestro:
  exigir que el cubierto **persista** un mínimo antes de ir a la posición de difusa.
- **Sensors 24(12):3890**, seguimiento con IA sobre bifacial en el nordeste de Brasil: **hasta
  +7,83 % en un día nublado y ~+1,2 % de media** frente a un algoritmo comercial. Es la
  corroboración independiente más directa de nuestro rango: un punto y pico de media, no un 5 %.

- **Solar RRL 8:2300507 (2024)**, Muñoz *et al.* (UPM): compara tres algoritmos contra el
  astronómico en **ocho emplazamientos**, midiendo irradiancia en plano, potencia DC monofacial y
  —esto es lo interesante— el **número de movimientos**. Dos de los tres optimizan la difusa; el
  tercero, «Analytical», calcula el ángulo óptimo con **todas** las componentes: es la forma cerrada
  que §1 mencionaba. Resultado: el Analytical gana a los otros dos y llega a **+3 % sobre el
  astronómico en sitios de alta fracción difusa**.

  **Matiz, porque el número invita a confundirse**: ese +3 % es *contra el astronómico puro* y en
  emplazamientos muy nublados. Nuestra medida de la cota (≤ 0,049 %) es *contra el barrido de cinco
  α del core*, que ya es un optimizador de difusa — no contra el astronómico. Las dos cosas pueden
  ser ciertas a la vez, y de hecho lo son: el salto grande es pasar de **no optimizar a optimizar**;
  el salto de **optimizar bien a optimizar perfecto** es despreciable. Es la conclusión de §4 vista
  desde fuera.

**Nota de método (2026-08-26).** Esta revisión se hizo **solo con buscador**: el entorno no permitió
abrir ninguna de las fuentes primarias (pv-magazine, pv-tech, MDPI, OSTI, webs de fabricante
estaban todas bloqueadas), así que las cifras nuevas provienen de resúmenes de resultados y **no se
han contrastado contra el documento original**. Lo que sí cambió respecto a agosto de 2025:

| Fila | Estado tras la revisión |
|---|---|
| Nextracker · 0,42–0,99 % | confirmada |
| Soltec · 5,3 / 6,9 / 12,4 % | confirmada; se añade el 1,3 % ecuatorial que faltaba |
| GameChange · 6,02 % (Enertis) | confirmada, validación de marzo de 2024 |
| Array · «hasta 5 %» (DNV GL) | confirmada; **sigue sin publicar cifra separada del difuso** |
| Arctech · hasta 7 % total | confirmada; DNV·GL avala la fiabilidad de los datos publicados |
| TrinaTracker | **ampliada** con +2,21 % media anual, +9,15 % cubierto y +3,84 % en Nangong |
| Soltigua · sin cifra anual | **cerrada**: > 1 % en Centroeuropa, dato de fabricante, sin tercero |
| PVH · +1,5 % anual | ⚠ **no re-verificada**: en las fuentes accesibles solo aparece el «hasta 20 % en días nublados». Tratarla como dato de fabricante hasta poder abrir el original |

Antes de usar cualquiera de estas cifras delante de un cliente, conviene abrir la fuente primaria
desde una red sin restricciones. Ninguna conclusión del estudio depende de ellas: el rango honesto
de §4 se sostiene sobre NREL y sobre los dos papers de arriba.

## 4 · Qué significa para Factiun

1. **El algoritmo ya existe y es defendible**: `diffuse_poa_switch` (umbral POA con Perez +
   confirm/dwell) es la misma arquitectura que la literatura 2026 señala como buen equilibrio
   ganancia/desgaste, y nuestros contratos de test (invarianza de resolución, puerta nocturna,
   gobierno de config) son más estrictos que lo que se publica.
2. **Vender la cifra honesta**: en Iberia, difuso aislado ≈ 0,3–1 % anual según sitio (más en
   Cantábrico/Galicia que en el valle del Ebro); en días cubiertos, +5–12 %. Prometer el «hasta
   5 %» del marketing ajeno nos pondría en la casilla de los que mezclan efectos.
   *Contrastado (2026-08)*: la horquilla aguanta. Muñoz *et al.* llegan a +3 % **frente al
   astronómico** en sitios de alta fracción difusa —no frente a un optimizador de difusa, que es
   nuestra referencia—, el estudio brasileño mide ~+1,2 % de media contra un algoritmo comercial y
   Soltigua declara «> 1 %» en Centroeuropa. Todo apunta al mismo sitio: un punto y pico donde
   llueve.
3. **El argumento de O&M va con la energía, no contra ella.** La objeción natural a cualquier
   política de difusa es «me mueves el tracker más». Medido (§ 2.1), es al revés: en cielo
   cubierto todas ahorran entre un **40 % y un 70 %** del consumo de motor del día (banda, no cifra
   exacta: ver §2.2), porque
   tumbarse es dejar de perseguir. Con cielo despejado no intervienen y el coste es idéntico al
   de no hacer nada. Para un tracker autónomo —45 W de panel y 153,6 Wh de batería— eso no es un
   detalle: es la diferencia entre una función que cabe en el balance energético y una que no.
   El número que se cita fuera debe ser el **recorrido en grados**, que es robusto; los
   «movimientos» dependen del ciclo de control de la TCU tanto como del tracker.
4. **La TCU puede ejecutarlo hoy**: solo necesita GHI (o la POA estimada del propio string como
   proxy) y la máquina confirm/dwell — sin sensórica nueva. El salto siguiente (zonal,
   anticipación por nowcasting) requiere NCU con visión de planta, la misma arquitectura que el
   «óptimo libre» del simulador de BT.
5. **Validación**: la palanca comercial no es la cifra sino el tercero que la firma. El
   side-by-side de PVH (dos plantas contiguas) es el patrón replicable en nuestras plantas
   gemelas (p. ej. dos NCUs comparables de Ayora).

## Fuentes principales

*Repasadas 2026-08-26; ver la nota de método de §3.*

Kelly & Gibson 2009/2011 (*Solar Energy* 83/85) · Anderson & Mikofski 2020 (NREL TP-5K00-76626) ·
Anderson & Aneja 2022 (IEEE PVSC 49, NREL) · *Solar Energy* 2018 (estudio europeo POA nublado) ·
*Solar Energy* 2025 (óptimo analítico bajo cualquier cielo) · Adinolfi Borea et al. 2026
(*Electronics* 15:597, 29-ene-2026, persistencia temporal; medidas de campo de marzo de 2025,
mono y bifacial; copia en OSTI) · *Sensors* 24(12):3890 (IA sobre bifacial, NE de Brasil:
+7,83 % un día nublado, ~+1,2 % de media frente a un algoritmo comercial) · *Solar RRL* 8:2300507 (2024), Muñoz et al., UPM
(tres algoritmos frente al astronómico en 8 sitios, con número de movimientos) · pvlib issue #1694 ·
PVsyst docs (Engerer2) ·
Nextracker (datasheet TrueCapture, Zonal Diffuse PR, TaiyangNews, Quintas, ICF) · Array
(SmarTrack Diffuse, GlobeNewswire 2020/2025) · Soltec (TÜV Rheinland vía pv magazine / Solar
Builder, whitepaper TeamTrack) · TrinaTracker (SGS vía pv magazine, SolarQuarter) · Arctech
(SolarQuarter 2021) · GameChange (PRNewswire/Enertis 2024) · PVH (Solar Power World / pv magazine
dic-2024) · Soltigua (web de MaxRad) · patentes USPTO citadas en el texto.

## Uso

- Elige planta (o lat/lon), fecha y resolución; el GCR es derivado (ancho/pitch), como en el core.
- Pinta el cielo o trae un día real de Open-Meteo (histórico/previsión/EN VIVO).
- Activa políticas y compáralas: escena 3D (o corte 2D), curvas θ/POA, tabla del día (Δ POA, % en
  flat, conmutaciones, recorrido, coste del lazo).
- Activa el **zonal por NCU**: nº de NCUs y minutos del frente; la escena pinta cada zona con su
  nube y su θ, y la tabla compara global vs zonal (en el día de frentes: flat +0,37 % → +1,15 %).
- «Calcular año» estima la ganancia anual por mezcla de cielos (preset de clima editable).
- «Verificar contra el contrato del core» corre la QA en el navegador; en repo:
  `node tools/test_overcast_sim.mjs`.
