# IA y ML en la plataforma — qué hay, qué madurez tiene y qué falta

> Inventario del aprendizaje automático ya implementado en los notebooks y el core, auditoría honesta de su madurez, y hoja de ruta priorizada. La conclusión corta: **no falta ML, falta dato real de planta y falta industrializarlo.**

## Por qué este documento

La plataforma tiene ML repartido en varios sitios y con niveles de madurez muy distintos: modelos oficiales con seis puertas de validación pasadas conviven con prototipos entrenados sobre datos sintéticos. El notebook `SolarGPT_v16_2` ya incluye una **auditoría de IA (2026-04-05)** que clasifica los bloques por madurez; este documento la recoge, la extiende a lo que hay fuera de ese notebook (TrackerGovernor, `factiun_core.rf`, el core) y añade lo que yo haría a continuación.

El criterio que atraviesa todo: **la plataforma es determinista y auditable a propósito** —gates de QA, oráculos, envolvente de mercado que caza ganancias mentirosas, "no se publica física sin validar"—. El ML solo se gana el sitio donde no hay forma cerrada y sí hay dato. Aprender el residuo, nunca sustituir el modelo.

---

## 1. Inventario — lo que ya existe

### 1.1 TrackerGovernor v3.3 — el gobernador híbrido IA-física

`SolarGPTfull/solargpt/TrackerGovernor_official_3.ipynb` · 125 celdas · 2026-04-11

Es el artefacto de IA más maduro de la casa: un motor de decisión por capas que resuelve, hora a hora, si el seguidor debe MOVE o CONSERVE integrando física, difusa, backtracking, winter mode y economía. No es un chatbot, y el propio notebook se renombró para dejarlo claro.

| Componente | Sección | Nivel declarado | Backend |
|---|---|---|---|
| **Value ML v2** | §09z | **OFICIAL — gates 6/6** | RF 150 árboles, dataset mixto horario + 15 min |
| **GDL Hybrid v1.2** | §09d | **OFICIAL — 3/3** | rule + Value ML v2, orquestador L1–L5 |
| **ML3.6** | §08c | **OFICIAL** | GBR 200 árboles, precios OMIE reales 2018–2022 |
| ML3.5 | §08b | Baseline | GBR, 26 sitios (holdout Reykjavik + Helsinki) |
| Winter Learner | §09e–f | Entrenado | 4 clases, teacher = la propia regla v3 |
| BT Learner | §09g | Entrenado | 3 clases, teacher = el propio selector v2.4 |
| POA ML Classifier | §09i | EXPERIMENTAL 2/4 | **−11,0 % vs regla** |
| Value ML v1 | §09j | Superado por v2 | RF 200 árboles, solo horario |
| Uncertainty gate + regret | §09k | Utilidad | Aborta MOVE si dispersa el ensemble |

**Value ML v2 es el único caso de la casa donde el ML gana de verdad y está demostrado**: +2,63 % en validación walk-forward, con las seis puertas pasadas. Y su historia metodológica vale tanto como el resultado, porque v1 fracasó exactamente por *distribution shift*: entrenado en horario, evaluado a 15 min con irradiancia interpolada, pasó de −0,025 % a **−1,12 % frente a la regla**. Se arregló reentrenando con dataset mixto, no parcheando el modelo.

La otra lección, del §09i: **clasificar la política falla (−11 %), regresar el valor físico y quedarse con el argmax funciona (+2 %)**. Ese cambio de formulación es transferible a casi todo lo demás.

### 1.2 SolarGPT v16.2 — IA sobre meteo y detección

| Bloque | Sección | Madurez (auditoría 2026-04-05) |
|---|---|---|
| PVUSA energy forecast | §01.10 | **OPERATIVO** — regresión con base física, dato real |
| Meteo ML multi-horizonte | §01.11 | OPERATIVO CON CAUTELA |
| IsolationForest (anomalías) | §09.0, §99.IC.7 | OPERATIVO CON CAUTELA |
| Changepoint detection | §09.1d | OPERATIVO CON CAUTELA |
| GRU / TFT forecast | §12.3, §10.2b | OPERATIVO CON CAUTELA (si corre con dato real) |
| RL Tracker, Fuzzy, PPO | §45–§46, §57–§58 | **RESEARCH — entorno sintético** |
| Economic surrogates | §47, §59 | **RESEARCH — mercado sintético** |

El *ML Validation Hub* (§01.11v1–v3) es metodológicamente impecable y conviene señalarlo como plantilla: split temporal sin barajar, año completo de test en holdout, y **dos baselines duras** —persistencia y climatología— contra las que el modelo tiene que demostrar *skill score* positivo por horizonte, por estación y por franja de irradiancia. Resultado honesto: temperatura R² > 0,99 a h+1, GHI R² > 0,96, y **viento el más difícil de todos**, con ventaja marginal pero positiva.

### 1.3 Physics canonical — BESS y batería

`SolarGPT_physics_canonical.ipynb` §11.3–§11.5: clasificador de modo BESS (etiquetas oracle por hindsight sobre OMIE), agente RL de despacho (Q-learning / DQN) y predictor de SOH por GBM. Los tres llevan la misma cabecera, escrita por vosotros:

> ⚠️ RESEARCH / DEMO ONLY — Trained on synthetic data. Not wired into operational IC pipeline (99.IC).

Está bien etiquetado, y eso es exactamente lo que hay que hacer. Pero conviene no confundir "implementado" con "operativo": son demostradores.

### 1.4 `factiun_core.rf` — la calibración de El Burgo (el patrón a imitar)

`factiun_core/rf/calibration.py` es, con diferencia, **la pieza de aprendizaje-sobre-dato-real mejor hecha de la plataforma**, y no la llamáis ML:

- Dato real: ~3 días de El Burgo I NCU1 (2026-06-16..18), 406 k filas de rutas y 47 k registros de RSSI, 49 enlaces.
- Residuo cuantificado: el modelo idealizado sale **33,6 dB optimista**; sesgo trasladado a potencia efectiva, σ = 6,8 dB.
- Conclusión honesta y contraintuitiva: **n_eff ≈ 0,38** frente al 2,0 del espacio libre — *a escala de seguidores la distancia casi no predice; manda la obstrucción local*.
- Aterrizado: módulo importable, con paridad con el port JS, y consumido por el widget `render_siting()`.

Medir, cuantificar el residuo, declarar el límite y dejarlo en un módulo con paridad web. Ese es el patrón; el resto del documento es aplicarlo a más sitios.

### 1.5 Otros

| Pieza | Qué es | Nota |
|---|---|---|
| `pv_ml_detect.py` | Detección de FV por visión — **CV clásica, sin red neuronal** | Reglas sobre color/textura/FFT, con hook `register_pv_classifier()` para enchufar un modelo externo |
| `nl_scenarios.py` | Lenguaje natural → barridos del motor | **Regex determinista, sin LLM, a propósito**: testeable y reproducible |
| `datasheet_extract.py` | Extracción de parámetros de datasheet | Regex por fabricante + **fallback opcional a la API de Claude** |
| `scripts/retrain_15min_documented.py` | Reentreno del Value ML con 28 sitios × 4 ventanas | Auditoría paso a paso, LKSO 5-fold |

---

## 2. El diagnóstico

Cuatro problemas, en orden de importancia.

### 2.1 Casi nada aprende de la planta real

Todo el ML de la casa se entrena con **meteo de 28 sitios y simulación**. El único sistema que mide seguidores de verdad —el SCADA, con su telemetría por TCU cada 30 s— **no alimenta a ningún modelo**. `plant_feedback.py` ya dice en su cabecera que la señal de error `tilt − target` "hasta ahora no la consumía nadie".

Ese es el cuello de botella real. No es de algoritmo.

### 2.2 El techo del alumno es el maestro

El Winter Learner (§09e–f) usa `run_winter_mode_policy()` como *teacher*. El BT Learner (§09g) usa `recommend_operational_bt_strategy()`. Un modelo entrenado con las etiquetas de su propia regla **puede, como mucho, replicar la regla** — nunca superarla, porque no ve ninguna información que la regla no viera.

Eso no los hace inútiles: como **compresión y portabilidad** son valiosos (una regla de cinco capas convertida en un modelo pequeño que corre en el navegador, o en un ESP32). Pero deben venderse como surrogate, no como mejora. Hoy la nomenclatura ("Learner") sugiere lo segundo.

Síntoma revelador, en el propio §09c: `_GAIN_MODEL` no está entrenado en el notebook oficial, así que el selector cae a la heurística — y el notebook lo declara *"el comportamiento oficial correcto: no hay modelo ML de terreno disponible"*. Es la respuesta honesta, y también la prueba de que esa rama del ML no ha llegado a producción.

### 2.3 El ML vive en notebooks, no en el core

`solargpt_core` —los 71 módulos certificados para bankability— **no importa scikit-learn en ninguna parte**. El ML está en notebooks de entre 125 y 1.127 celdas. Consecuencias: Value ML v2 es OFICIAL con 6/6 gates y aun así **no es alcanzable desde la web, ni desde el CLI, ni desde `bt_service`**; y nada de eso entra en la suite de tests de regresión.

Que el core esté limpio es una decisión defendible ante un due diligence. Pero entonces hace falta la frontera explícita: un `solargpt_core/ml/` con modelos serializados y versionados, importable, opcional (degradando a la regla si falta el artefacto), y fuera del contrato bankable estricto.

### 2.4 Sintético etiquetado como sintético… y luego usado igual

Está bien marcado, no hay engaño. El riesgo es de uso: una tabla de resultados de un modelo entrenado sobre `fade = a·n^b + c·throughput^d` mide lo bien que el GBM aproxima esa fórmula, no la degradación de una batería. Sirve para enseñar el andamiaje; no para decidir una campaña de sustitución.

---

## 3. Hoja de ruta

Priorizada por (valor × dato disponible) ÷ riesgo.

### P1 · Convertir el SCADA en dataset  🔴 bloqueante de casi todo

Sin esto, los cuatro puntos siguientes no existen. No es un proyecto de ML: es un exportador y un contrato de datos.

- Volcado histórico de InfluxDB a Parquet particionado por planta/NCU/día, con las mismas unidades que sirve la API (grados, mV, mA, °C — sin deshacer escalas de registro).
- Campos por TCU ya disponibles: `tilt_angle`, `target_angle`, `motor_current`, `motor_peak`, `panel_voltage`, `soc`, `soh`, `battery_voltage`, `battery_current`, `temp_pcb`, `temp_battery`, los bits de `alarms1`/`alarms2`, `comms_age_s` y `health`. Por HSU: `wind_speed`, nieve, alarmas.
- Reglas de calidad heredadas de `plant_feedback.py`: medida rancia, no parseable o malformada se marca **NO UTILIZABLE**; nunca se rellena un hueco con la última lectura buena.
- Alinear con la meteo de la planta y con el ángulo teórico del core, para que cada fila lleve ya su residuo físico.

> TODO: confirmar la **retención de InfluxDB** en producción. Determina cuántos meses de historia hay realmente y, con ello, si P2 es viable ya o hay que empezar a acumular.

### P2 · Salud de flota y mantenimiento predictivo  ⭐ el que yo haría primero

Es la capa **"Postventa"** que el README de `SolarGPTfull` declara *"aún sin código"*, y el único sitio donde hay dato real **y etiquetas reales**.

Modelar el residuo sobre la física que ya tenéis, no entrenar un clasificador a pelo:

- **Energía de motor por grado.** El gemelo ya usa el consumo canónico `Wh/° = 0,0503 + 0,000845·|θ|`. Residuo medido − predicho, normalizado por temperatura y ángulo. Un seguidor cuyo residuo sube 3σ durante dos semanas tiene un rodamiento agarrotándose, semanas antes de que salte `axis_blocked`.
- **Error de seguimiento** `tilt − target` en régimen estacionario, descartando el slew (0,17 °/s): sesgo persistente = encoder descalibrado o holgura; varianza creciente = juego mecánico.
- **Batería.** Ya existe rainflow + Arrhenius + `Nf = 6000/DoD^1,2` en el simulador. SOH medido frente a esa curva modelada → ranking por vida remanente. Esto sí es el §11.5 (SOH ML) **con dato real en vez de sintético**.

**Etiquetas, que es lo que suele faltar y aquí no falta:** los `inventario_*.json` del Seguimiento PEM detectan **cambios de número de serie** — es decir, la fecha en que una TCU fue sustituida. Con eso se supervisa hacia atrás. Los `diagnostico_*.json` dan además la salud por visita.

**Modelo:** gradient boosting sobre features de ventana móvil, más un detector de cambio de régimen (CUSUM o similar) sobre el residuo. Nada profundo. Reutilizad IsolationForest y el changepoint de §09.0/§09.1d, que ya están escritos.

**Validación:** back-test temporal. Entrenar hasta el mes M, predecir M+1, y medir *cuántas intervenciones reales anticipó, con cuántos días de antelación, y cuántos falsos positivos por 100 seguidores y mes*. Baseline obligatoria, en la línea del ML Validation Hub: **la regla "avisa cuando hay alarma"**. Si no le gana, se tira.

**Salida:** endpoint `/salud` en el SCADA y columna de riesgo en el sinóptico y en el Seguimiento PEM.

### P3 · Sacar Value ML v2 del notebook

Es OFICIAL, tiene 6/6 gates y **no lo puede llamar nadie**. Portarlo a `solargpt_core/ml/` con el modelo serializado y versionado, degradación automática a la regla POA-aware si falta el artefacto (que es la baseline validada, +5,77 % POA y 100 % de win rate), y el *uncertainty gate* de §09k activo en inferencia.

Coste bajo, valor alto: convierte el mejor resultado de IA de la casa en algo que el motor de la plataforma y `bt_service` pueden consumir.

### P4 · Reentrenar los learners sintéticos con SOC real

Winter Learner es hoy un surrogate de su propia regla sobre una TCU simulada. Con P1 hecho, el mismo notebook se reentrena con **SOC, temperatura de batería y corriente de panel medidos**, y el target deja de ser la etiqueta del teacher para pasar a ser observable: *¿bajó de verdad el SOC del umbral de supervivencia en las 48 h siguientes?*

Eso convierte RESEARCH en OPERATIVO sin escribir un modelo nuevo. **El entregable es el dataset, no el algoritmo.**

Aplica igual al SOH ML (§11.5) y al winter mode ML de 6 targets.

### P5 · Extender la calibración RF más allá de El Burgo

`factiun_core.rf` ya tiene el patrón y una planta calibrada. Falta:

- **Más plantas** — Ayora y San José tienen geometría y despliegue; repetir la campaña de los recolectores PowerShell y ajustar sus propios `bias/σ/n_eff`. Con dos o tres plantas se puede empezar a predecir el sesgo de una planta nueva desde su geometría, que es lo que hace falta para el siting predictivo.
- **Dependencia del ángulo.** `n_eff ≈ 0,38` dice que la distancia no explica el enlace y manda la obstrucción. La obstrucción, en una planta de seguidores, **cambia a lo largo del día**: las mesas rotan. Con un `zigbee_log.csv` de un día completo (incluido un stow) frente al θ que el SCADA registra en ese mismo instante, eso se mide directamente. Sería un resultado nuevo y publicable.
- **Predicción de nodo mudo:** tendencia de RSSI + saltos + criticidad → qué TCU se cae la semana que viene. El grafo de rutas ya está construido; features de grafo + boosting sobran, no hace falta GNN.

Validación: dejar NCUs fuera (leave-one-NCU-out) y, sobre todo, predecir una planta entrenando con las otras.

### P6 · Nowcast de racha para stow anticipativo

Es el hueco más claro que **no** tiene nada hecho. La estrategia de abanderamiento es enteramente reactiva —umbral e histéresis, B2: parcial ≥ 40 km/h, full ≥ 60— y un seguidor tarda minutos en llegar a defensa.

Un nowcast a 15–30 min con la serie de las HSU (viento real de planta, cada 30 s) más Open-Meteo permite salir antes ante rachas que se consolidan y —lo que más vale— **no salir ante picos que no se consolidan**, que es donde se pierde producción.

Dos cosas lo hacen atractivo aquí:

1. **El banco de pruebas ya está montado.** El comparador de controles del simulador de batería mide `% tiempo no disponible` y `% producción perdida` contra el seguimiento ideal. Una política con nowcast se evalúa exactamente igual que B2, sobre la misma meteo, con la misma métrica.
2. **El ML Validation Hub ya dice que el viento es lo más difícil** (§01.11): R² bajo a h+24, skill positivo pero marginal. Eso *acota la ambición*: no se trata de predecir la velocidad, sino la **probabilidad de superar el umbral en los próximos 20 minutos** — clasificación con clases desbalanceadas, no regresión.

La decisión sigue siendo del supervisor: el modelo solo puede **adelantar** una entrada en defensa, nunca retrasarla. La seguridad no se aprende.

### P7 · Surrogate anual para las simulaciones del navegador

El simulador de backtracking estima el año con 12 días representativos porque no hay más presupuesto en el navegador, y en §05.5c ya hay un surrogate de BT3D en modo research. Uniendo ambos: un emulador `f(lat, GCR, geometría, política, estadísticos del terreno, clima) → ΔPOA anual`, destilado a unos cientos de KB de árboles exportados a JSON, corriendo offline en la página.

El error es medible por construcción, porque la etiqueta la genera el motor completo. **Cuidado con la trampa que vosotros mismos detectasteis en la v1.25 del simulador**: la malla 6×8 sesgaba el POA anual +0,52 %. Un surrogate entrenado contra un motor sesgado hereda el sesgo — hay que entrenarlo contra la cuerda analítica exacta.

### P8 · Capa conversacional sobre O&M (aquí sí, LLM)

El único sitio donde un LLM aporta más que un regex — y no es dentro de la física, que es donde `nl_scenarios.py` decidió, con razón, no meterlo.

Un agente **de solo lectura** con herramientas sobre lo que ya está expuesto: `/live`, `/history`, `/meteo` del SCADA, el histórico PEM de Supabase y los `docs/*.md` del panel. Preguntas como *"¿por qué la TCU 143 de El Burgo consume el doble de motor que sus vecinas?"* o *"¿qué cambió en Ayora entre la visita de mayo y la de julio?"* hoy exigen abrir cuatro herramientas y cruzarlas a mano.

Dos condiciones: **nunca escribe Modbus** (`bt_service` sigue siendo el único escritor) y **toda cifra trazada a su fuente**, nunca a la generación del modelo. El patrón de `datasheet_extract.py` —LLM como fallback de un extractor determinista— es el correcto y se puede extender a los `.PAN`/`.OND` y a los informes de PVSyst.

---

## 4. Lo que no haría

| Descartado | Motivo |
|---|---|
| **RL para el despacho BESS o para el seguidor** (§11.4, §45, §57) | Entorno sintético, sin exposición real a mercado ni a planta. La superficie de riesgo es enorme y no hay nada que enseñar a un revisor. Si hace falta control óptimo: MPC con un modelo de perturbación aprendido, con la parte aprendida acotada y auditada aparte. |
| **Redes neuronales para POA, ángulo o sombra** | pvlib + el BT3D con ray-cast son exactos y auditables. Una red sería peor y además indefendible en un due diligence. |
| **Más learners con teacher = la propia regla** | El techo es la regla. Solo se justifican como surrogate declarado (compresión, portabilidad), nunca como mejora. |
| **GRU/TFT antes de tener P1** | Están escritos y marcados "si corre con datos reales". Sin el dataset del SCADA, es capacidad ociosa. |
| **Visión sobre fotos de obra** (`checklist-solar`) | Volumen de imágenes etiquetadas insuficiente. Lo útil ahí es más barato: detección de duplicados en el punchlist y entrada en lenguaje natural. |
| **Estimación de soiling desde datos** | Bloqueada por dato, no por modelo: el SCADA lee telemetría de seguidor, no producción por string. Sin producción no hay señal que ajustar. |

---

## 5. Las reglas del ML en Factiun

No hay que inventarlas: ya las aplicáis. Conviene escribirlas para que valgan igual en el próximo modelo.

1. **Baseline o no hay resultado.** Persistencia y climatología para meteo; la regla física para todo lo demás. Un modelo sin baseline es una anécdota (§09z congela precisamente el "antes").
2. **Split temporal, nunca aleatorio.** Y validación dejando sitios fuera (LKSO) o NCUs fuera cuando la unidad de generalización es el emplazamiento.
3. **Walk-forward antes de declarar OFICIAL.** Es lo que separa Value ML v2 (6/6) de v1.
4. **Entrenar y evaluar a la misma resolución.** La lección de los −1,12 % a 15 min: el *distribution shift* se arregla en el dataset, no con parches.
5. **Regresar el valor físico, no clasificar la etiqueta.** −11 % vs +2 %, misma información de entrada.
6. **Gate de incertidumbre en inferencia.** Si el ensemble dispersa, se aborta la acción y manda la regla (§09k).
7. **El supervisor no se aprende.** Viento, batería, noche y maniobras de evento anulan cualquier corrección del modelo, y ninguna corrección supera su tope (±2° en `closed_loop`). La energía es siempre el último criterio.
8. **Etiquetar el origen del dato en la propia celda.** Sintético es sintético aunque el R² sea 0,999. Ya lo hacéis; no se relaja.

---

## 6. Por dónde empezar

**P1 + el residuo de energía de motor por grado de P2**, sobre el histórico de InfluxDB de El Burgo.

Es la ruta más corta a un resultado real: no toca el core certificado, no escribe nada en planta, se valida contra los cambios de número de serie que ya están en el histórico PEM, y desemboca en la única pieza del árbol que el README marca como inexistente. Si funciona, la salida cabe en una columna del sinóptico del SCADA y en la ficha de Seguimiento PEM sin rediseñar nada.

Y de paso arregla el problema de fondo: a partir de ahí, todos los modelos que hoy corren sobre simulación tienen contra qué contrastarse.

---

## Referencias en el repositorio

| Qué | Dónde |
|---|---|
| Gobernador híbrido, Value ML v2, learners | `SolarGPTfull/solargpt/TrackerGovernor_official_3.ipynb` |
| Auditoría de IA y ML Validation Hub | `SolarGPTfull/solargpt/SolarGPT_v16_2_surgical_fix.ipynb` §01.11v, celda 7 |
| BESS ML / RL / SOH (research) | `SolarGPTfull/solargpt/SolarGPT_physics_canonical.ipynb` §11.3–§11.5 |
| Calibración RF real | `SolarGPTfull/factiun_core/rf/calibration.py` |
| Reentreno documentado 15 min | `SolarGPTfull/solargpt/scripts/retrain_15min_documented.py` |
| Ingesta de medida y lazo cerrado | `solargpt_core/plant_feedback.py`, `closed_loop.py`, `setpoint_service.py` |
| Telemetría disponible | `scada/config/modbus_map.yml`, `scada/api/main.py` |
| Etiquetas de sustitución de TCU | Seguimiento PEM (`factiun-cartera`), `inventario_*.json` |

*Factiun · proyecto interno.*
