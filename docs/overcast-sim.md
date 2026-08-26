# Simulador de radiación difusa — las políticas del core en el navegador · y estudio del diffuse tracking

**Página**: `https://imoriana3.github.io/cobertura-zigbee/overcast.html` · repo `cobertura-zigbee`
**Un único HTML, física offline, sin dependencias de código.** QA integrada (botón «Verificar contra
el contrato del core») y test de Node (`tools/test_overcast_sim.mjs`) que ejecutan la MISMA batería.
Open-Meteo (datos, no código) es el único extra online, opcional.

## Qué es (y qué no)

Un espejo JavaScript del módulo canónico de tracking de SolarGPT (`solargpt_core/tracker.py`,
schema 2.1.0) para ver y comparar **las políticas de difusa del core** en días nublados: qué hace
cada una minuto a minuto, cuánta POA gana o pierde, cuántas veces conmuta y cuánto maniobra. El
compañero del [Simulador de Backtracking](backtracking-sim.md): aquel responde a «¿a qué ángulo
para no sombrear?», este a «¿y cuando no hay sol que sombree?».

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
> El resto del estudio —en particular la tabla de la competencia de §3 y sus fuentes— **no se ha vuelto
> a verificar desde el 14-08**. Antes de enseñarlo a un cliente conviene repasar si alguna de esas
> cifras se ha actualizado.

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

## 3 · La competencia

| Fabricante · producto | Mecanismo | Anual (fuente) | Días cubiertos |
|---|---|---|---|
| **Nextracker · TrueCapture** (Diffuse + Zonal Diffuse 2023) | sensores por fila + ML + previsión; zonal: solo la zona bajo la nube pasa a difuso | paquete «2–6 %» (mkt); **difuso aislado 0,42–0,99 %** (TaiyangNews); ~4 % paquete validado (Quintas, ICF) | — |
| **Array · SmarTrack Diffuse** | GHI en tiempo real + límites anti-chattering explícitos | «hasta 5 %» paquete (mkt, metodología DNV); sin cifra separada del difuso | — |
| **Soltec · Diffuse Booster / TeamTrack** | sensores + previsión | 2,5 % Mediterráneo / 3,8 % Norte (TÜV, vs estándar; mezcla efectos) | **+5,3 % nublados** Mediterráneo, +6,9 % Norte, pico +12,4 % un día (TÜV Rheinland) |
| **TrinaTracker · SuperTrack** (STA+SBA) | modelo bifacial 12 parámetros + deep learning | mkt «3–8 %»; **+3,24 % medido 1 año (SGS)**, +3,06 % (informe independiente) — paquete | — |
| **Arctech · AI tracking** | terreno + nubes + bifacial + inversores | mkt hasta 7 % total; **nubes 0,5–2 %** (white paper propio) | — |
| **GameChange · WeatherSmart** | distingue sombreado aleatorio de día cubierto | **hasta 1,5 % anual** (mkt) | **+6,02 % validado** (Enertis 2024); mkt hasta 13 % |
| **PVH · Diffuse Control** (dic-2024) | side-by-side de dos plantas contiguas | **+1,5 % anual medido** en sitio nublado | hasta +20 % días muy cubiertos |
| **Soltigua · MaxRad** | rota a posición menos inclinada | — | hasta +7 % nublados de verano (mkt) |

**Lectura honesta**: los «hasta 5–8 %» son paquetes completos (terreno + difuso + bifacial) y
marketing. El **modo difuso aislado converge en ~0,4–1,5 % anual** en climas templados y **5–13 %
en días cubiertos**, coherente con la literatura (NREL 0,1–0,4 % típico). La diferenciación del
sector está migrando de la cifra a: control **zonal** (Nextracker), **anticipación**
(nowcasting con all-sky imagers, RMSE 6,9–18,1 % a 1–20 min; Fraunhofer DeepTrack) y
**validación por terceros** (TÜV, SGS, Enertis, DNV, ICF). Hay patentes activas sobre seguimiento
de difusa, detección de cielo cubierto y mitigación de «flutter» (US10935992, US11703887,
US12025349, US11500397, US11823409, US12345447): revisar libertad de operación antes de
industrializar un algoritmo propio.

## 4 · Qué significa para Factiun

1. **El algoritmo ya existe y es defendible**: `diffuse_poa_switch` (umbral POA con Perez +
   confirm/dwell) es la misma arquitectura que la literatura 2026 señala como buen equilibrio
   ganancia/desgaste, y nuestros contratos de test (invarianza de resolución, puerta nocturna,
   gobierno de config) son más estrictos que lo que se publica.
2. **Vender la cifra honesta**: en Iberia, difuso aislado ≈ 0,3–1 % anual según sitio (más en
   Cantábrico/Galicia que en el valle del Ebro); en días cubiertos, +5–12 %. Prometer el «hasta
   5 %» del marketing ajeno nos pondría en la casilla de los que mezclan efectos.
3. **La TCU puede ejecutarlo hoy**: solo necesita GHI (o la POA estimada del propio string como
   proxy) y la máquina confirm/dwell — sin sensórica nueva. El salto siguiente (zonal,
   anticipación por nowcasting) requiere NCU con visión de planta, la misma arquitectura que el
   «óptimo libre» del simulador de BT.
4. **Validación**: la palanca comercial no es la cifra sino el tercero que la firma. El
   side-by-side de PVH (dos plantas contiguas) es el patrón replicable en nuestras plantas
   gemelas (p. ej. dos NCUs comparables de Ayora).

## Fuentes principales

Kelly & Gibson 2009/2011 (*Solar Energy* 83/85) · Anderson & Mikofski 2020 (NREL TP-5K00-76626) ·
Anderson & Aneja 2022 (IEEE PVSC 49, NREL) · *Solar Energy* 2018 (estudio europeo POA nublado) ·
*Solar Energy* 2025 (óptimo analítico bajo cualquier cielo) · Adinolfi Borea et al. 2026
(*Electronics* 15:597, persistencia temporal) · pvlib issue #1694 · PVsyst docs (Engerer2) ·
Nextracker (datasheet TrueCapture, Zonal Diffuse PR, TaiyangNews, Quintas, ICF) · Array
(SmarTrack Diffuse, GlobeNewswire 2020/2025) · Soltec (TÜV Rheinland vía pv magazine / Solar
Builder, whitepaper TeamTrack) · TrinaTracker (SGS vía pv magazine, SolarQuarter) · Arctech
(SolarQuarter 2021) · GameChange (PRNewswire/Enertis 2024) · PVH (Solar Power World / pv magazine
dic-2024) · Soltigua (MaxRad) · patentes USPTO citadas en el texto.

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
