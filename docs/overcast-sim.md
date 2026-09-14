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
| Coste de maniobra | `motor_energy.py` (bandas de flota) + `gemelo-digital/sim/fisica.js` (curva I(θ)) | Wh/° por **amplitud** de maniobra, de 14.759 maniobras reales. Un movimiento es un **tramo contiguo** de giro (una rampa de 55° es 1, no 55), con ε = 0,05° de ruido de encoder. El modelo del ensayo (E₀+k·\|Δθ\|) **no se usa**: dominio \|Δθ\| ≥ 20°, el core da NaN por debajo — ver §2.1 |
| Reposo de la TCU | `tcu.py` `TCU_IDLE_W` | 0,64 W constantes (ni los 5 W viejos ni los 0,45 de `tcu_compare`); igual de día que de noche, y **fuera de las filas** porque no depende de la política |
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
mismo instante físico a 5/10/15 min; enter_ratio imposible ⇒ jamás conmuta; ghi_min gigante ⇒
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
`continuous`. Sirve para *enseñar* que la política del core está pegada al techo, no para servirse
como consigna. La batería exige que ese hueco siga por debajo del 0,1 %: si algún día creciera, la
prueba lo caza y entonces sí tocaría llevar el barrido fino al core.

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

La decisión metodológica importa. El modelo más preciso de la casa —el del ensayo,
`E = E₀ + k·|Δθ|` sobre 8 barridos instrumentados de ±55°— **no se usa**, a propósito: su dominio
es `|Δθ| ≥ 20°` y el core devuelve `NaN` por debajo, porque su término fijo sale de barridos de
110° y extrapolarlo a micro-maniobras se equivoca **×27**, medido contra 106 TCUs. Las maniobras
de un tracker en operación son de 1–2°, que las fija la banda muerta. Se usa el modelo que sí
cubre ese régimen: las **bandas de flota**, Wh/° según la amplitud de cada maniobra, ajustadas
sobre **14.759 maniobras reales** (El Burgo, 106 TCUs).

| amplitud | n | Wh/° |
|---|---|---|
| < 1° | 8.335 | 0,2262 |
| 1–2° | 5.171 | 0,0880 |
| 2–5° | 1.177 | 0,0701 |
| > 5° | 76 | 0,0653 |

El coste por grado se **multiplica por 3,5** al achicarse la maniobra: ahí está medido, y no
supuesto, el precio de arrancar el motor. Es lo que convierte el chattering de un argumento
cualitativo en una factura.

Medido sobre 21-jun en Gorraiz con cielo cubierto al 95 % y decisión cada 10 min:

| política | movimientos | recorrido | motor | Δ motor |
|---|---|---|---|---|
| pvlib (baseline) | 79 | 229° | 16,22 Wh | — |
| `diffuse_flat` | 32 | 148° | 10,04 Wh | −38 % |
| `diffuse_poa_switch` | 21 | 110° | 7,47 Wh | −54 % |
| `diffuse_limited` | 28 | 97° | 6,71 Wh | −59 % |
| `diffuse_continuous` | 19 | 95° | 6,45 Wh | −60 % |

O sea que **en cielo cubierto las políticas de difusa ganan energía y ahorran batería a la vez**.
No es un compromiso: tumbarse deja de perseguir un sol que no está, y no perseguirlo es
justamente no gastar motor. Con cielo despejado ninguna interviene y las cinco filas salen
idénticas — la primera comprobación que hay que exigirle a esto.

**Tres cautelas, porque este número se presta a citarse mal.**

1. **«Movimientos» no es una constante del tracker, sino del ciclo de control.** Con el mismo día
   y el mismo recorrido, bajar la decisión de 30′ a 1′ lleva de 28 a 178 arranques y la factura de
   15 a 20 Wh; con banda muerta de 0,5° llega a 277 arranques y 43,5 Wh. Citar un número de
   movimientos sin decir el ciclo de decisión y la banda muerta no significa nada.
2. **El recorrido sí es robusto** (±2 % en todo ese barrido). Es el número que se puede citar
   fuera, y es además el proxy de desgaste que usa el core.
3. **El reposo de la TCU no está en las filas**: 0,64 W = 15,4 Wh/día, del orden del propio
   consumo de motor. Es idéntico para todas las políticas, así que sumarlo aguaría justo la
   columna que existe para separarlas — pero para **dimensionar** batería hay que contarlo.

Un contraste que conviene no vender como validación: a decisión 5′ y banda muerta 1° el simulador
da 145 movimientos y 19,0 Wh/día, y la flota de El Burgo midió 145 maniobras y 19,2 Wh/día. El
recorrido, en cambio, no cuadra (229,8° frente a 112,9°), así que la coincidencia en vatios-hora
es en buena parte casual —el doble de grados a la mitad de coste por grado— y se deja anotada
como tal.

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
   cubierto todas ahorran entre un **38 % y un 60 %** del consumo de motor del día, porque
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
