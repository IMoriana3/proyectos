# Simulador de Backtracking — BT3D en el navegador

**Página**: `https://imoriana3.github.io/cobertura-zigbee/backtracking.html` · repo `cobertura-zigbee`
**Un único HTML, offline, sin dependencias.** QA integrada (botón «Verificar contra ray-cast bruto»)
y test de Node (`tools/test_backtracking_sim.mjs`) que ejecutan la MISMA batería.

## Qué es (y qué no)

Un espejo JavaScript del motor **BT3D** de SolarGPT (`solargpt_core/tracker3d.py`) para ver y comparar
**políticas de backtracking** sobre terreno irregular, fila a fila y minuto a minuto: corte transversal
animado con las sombras reales, curvas θ(t), POA de planta por política, tabla del día y estimación
anual. Sirve para **entender, comparar y enseñar** el backtracking (y para detectar a ojo un terreno
donde una política pierde), con la física de verdad — no una animación decorativa.

**NO es** el motor bancable: corre con cielo claro (no meteo real), no simula stow/TCU/control ni
night-latch, y el POA no es energía AC. Para números de proyecto: notebook §03 / Streamlit pág. 9,
que ejecutan la ruta oficial del core. La regla de la casa aplica: toda simplificación viaja
**declarada** en la propia página.

> **Justificación óptico-física completa** (régimen de validez, exactitud de la oclusión, penumbra
> acotada, radiometría, validación): [`backtracking-justificacion-optica.md`](backtracking-justificacion-optica.md)

## De dónde sale cada fórmula

Nada reinventado: cada pieza espeja una referencia concreta, con su misma semántica.

| Pieza | Referencia espejada | Notas |
|---|---|---|
| Posición solar | Algoritmo **NOAA** — el mismo de `sim-solar.html` del Panel | ~0,01°, con refracción (cenit APARENTE, como pvlib) |
| Seguimiento + backtracking | `pvlib.tracking.singleaxis` (**Anderson & Mikofski 2020**, Eq. 14) | con `axis_tilt`, `axis_azimuth`, `max_angle`, `gcr`, `cross_axis_tilt`. Noche → NaN → 0, como `nan_to_num` del core |
| Orientación de superficie | `pvlib.tracking.calc_surface_orientation` | tilt/azimut desde θ para el AOI |
| Sombra entre filas | Geometría **exacta de segmentos** en el plano ⊥ eje ≡ `pvlib.shading.shaded_fraction1d` (**Anderson 2023**) | resuelta por proyección (solape ⊥ al rayo / ancho proyectado), no por la fórmula cerrada — y validada contra un **ray-cast bruto** independiente en la QA, que es como el core valida su bisección |
| Pérdida eléctrica | `electrical_shade_loss` (**Martinez** escalonado) | `ceil(n_bypass·f)/n_bypass`, umbral anti-polvo 1e-6 |
| true-3D | `_bt3d_pair_max_magnitude` (bisección 36 iteraciones, borde más alto) + el pipeline de `compute_bt_angles_3d` | margen 0,5° · suelo en la baseline pvlib SOLO donde ella es 3D-safe · deferral EXACTO a baseline con sol rasante (zen ≥ 82°) · **guard de degeneración 2.5D** (|tilt N-S| ≤ 0,5° ⇒ resultado = baseline) |
| Residual de tangencia | `bt3d_tangent_residual_mm` | mm: >0 hueco · ≈0 tangente · <0 auto-sombra 3D. **El árbitro geométrico**, visible en el HUD |
| energy-optimal | `compute_bt_angles_energy_optimal` (whitepaper **PVH Backtracking 3D**, «Deeptrack») | θ_c(f)=θ_bt+f·(θ_full−θ_bt), f∈{0,¼,½,¾,1}, MISMA f para todas las filas, argmax del POA de planta **neto del Martinez**; f=0 primero ⇒ el empate lo gana el conservador ⇒ nunca rinde menos que pairwise bajo el mismo evaluador |
| óptimo libre | extensión propia (no está en el core) | cada **unidad de accionamiento** con SU fracción f_g ∈ rejilla de 9 sobre pairwise→astro; **ascenso coordinado** con evaluación local (filas propias + vecinas) y barridos alternos; arranca en la mejor f común ⇒ **nunca rinde menos que energy-optimal**; interpolar juegos con θ común conserva el θ común ⇒ ejecutable por los motores |
| Cielo claro | **Ineichen-Perrin** (`pvlib.clearsky.ineichen`) + Kasten-Young 1989 | turbidez Linke configurable (slider 2–7) |
| Transposición | **Perez 1990** (`allsitescomposite1990`, la misma tabla que usa el core en `compute_bt3d_poa_per_row`) + albedo isotrópico | |
| Agregación de planta | `compute_bt3d_poa_per_row`: **media del POA por fila** | POA(θ media) ≠ media de POA(θ_r) en terreno irregular — hay un test que exige la agregación correcta |

## Las seis políticas (mismos nombres que el core)

| Política | Semántica exacta | Cuándo diverge |
|---|---|---|
| **Astronómico** | seguimiento pleno sin backtracking (`compute_theta_full_tracking`) | la referencia que auto-sombrea |
| **Global** | un motor, un ángulo: pendiente/tilt/pitch **medios** de la planta | solo en terreno no uniforme |
| **Row** | cada fila con su terreno **local** (media de sus dos parejas), sin acoplar — A&M 2020 | la menos conservadora de las 2.5D; puede dejar sombra residual |
| **Pairwise** | por pareja; filas interiores adoptan **min(\|θ\|)** de sus dos parejas — `compute_bt_angles` | **sombra cero garantizada** (la canónica; hay un test que lo exige) |
| **True-3D** | bisección 3D plena (azimut + tilt N-S + pendiente E-O) | solo gana con tilt N-S ≠ 0; con tilt 0 **ES** la baseline (guard 2.5D) |
| **Energy-optimal** | tolera sombra cuando apuntar mejor la paga (argmax POA neto) | en las ventanas de backtracking; fuera de ellas coincide con pairwise |
| **BT2D plano** | ignora el relieve (pvlib sin pendiente ni tilt), evaluado sobre el terreno real — `bt_audit.theta_bt2d` | un tracker sin configurar: exacto en llano, **sombrea en pendiente** |
| **Min ground light** | sin sombra + mínima luz al suelo — `compute_bt_angles_min_ground_light` | agrivoltaica inversa: ≈pairwise + décimas por los bordes |
| **Óptimo libre** | cada accionamiento con su fracción — ascenso coordinado con vista de planta (NCU) | la que responde a «tenemos infinidad de soluciones»: 427 grados de libertad en Ayora; +1,03 % vs pairwise (misma-f daba +0,71 %, techo +0,77 %) |

En terreno **uniforme** global = row = pairwise exactamente (degeneración del core, testeada).

### Inventario contra el notebook (¿falta alguna?)

Contraste hecho contra el repo SolarGPT (2026-08-13):

| Dónde vive en el core | Opciones | En el simulador |
|---|---|---|
| Dispatcher oficial `bt3d_policy` (notebook §03.T2 / Streamlit pág. 9) | pairwise · global · row · energy_optimal (alias deeptrack) | ✅ las cuatro |
| Juez neutral `bt_audit` / `control_compare` (motores de ángulo) | true_tracking · BT2D · BT25D · BT3D | ✅ astronómico · BT2D plano · (BT25D ≡ pairwise/global/row) · true-3D |
| Modos extra de `tracker3d.py` | `min_ground_light` · touching `geometric_edge_tangent` · `legacy_min_ground_light` (deprecated) | ✅ min ground light · ✅ touching ≡ true-3D (mismo motor) · ✖ deprecated, a propósito |
| Capas de CONTROL (no son BT) | política de difusa (α continuous), wind/granizo/nieve stow, night-latch, deadband/slew, TCU | ✖ fuera de alcance, declarado (esto simula el backtracking, no el TCU) |

Conclusión: **no falta ninguna política de backtracking**; lo único no portado es el modo legacy
deprecado y las capas de control, que son otra cosa.

## Convenciones de signos (las trampas de siempre)

- **θ > 0 ⇒ borde derecho de la escena ABAJO** (pvlib right-handed; con eje a azimut 0, positivo = mañana/Este).
- **Pendiente transversal positiva = el terreno CAE hacia la derecha de la escena** (convención pvlib de
  `cross_axis_tilt`; idéntica a `_bt3d_pair_max_magnitude`: `z_derecha = z_izquierda − pitch·tan(β)`).
- La escena es el plano ⊥ eje: **+x = azimut del eje + 90°** (con eje N-S a 0°, la derecha es el Este).
  El rótulo de las esquinas lo dice siempre.
- Cotas por fila ↔ pendientes por pareja: `pairsFromElev`/`elevFromPairs`, ida y vuelta exacta (testeado).
- El **GCR es derivado** (= ancho/pitch), campo de solo lectura — regla del core (§03.T0): no es un input.

## Escena 3D (three.js, las libs del repo)

La escena principal es **3D de verdad** — three.js con las **libs locales** de `cobertura-zigbee`
(`lib/three.min.js` + `lib/OrbitControls.js`, las mismas que `terreno.html`; sin CDN, sigue offline):
terreno como heightfield con las DOS pendientes (cotas E-O + tilt N-S por fila), filas largas girando
con la política elegida, transmisión/motor/cardanes por grupo, sol posicionado por az/elevación y
**sombras por shadow-map** — ahí se VE la deflexión de la sombra a lo largo del eje, que es justo lo
que separa true-3D del 2.5D. Detalle que delata a la bifila rígida: los postes crecen/encogen cuando
el tubo (tilt medio del grupo) se separa del terreno real.

Reglas claras:
- Las sombras del render y el tinte salmón de los paneles son **diagnóstico visual**; los números salen
  del motor (`shadeRows` + Martinez), nunca del render.
- El corte 2D sigue ahí como pestaña **«Corte 2D · editor»**: es donde se arrastran los postes.
- Si THREE o WebGL fallan, la página **degrada sola al corte 2D** (patrón de la casa; testeado).
- Desde v1.3 la escena usa el **modelo real del seguidor** (`seguidor.js`, la fuente única que
  comparten el gemelo y Cobertura 3D): cada tramo de la implantación es una fila entera construida con
  `Seguidor.buildBeam` — en bifila la línea motora lleva la viga `west` (motor + TCU) y su pareja la
  viga **gemela** (`west:false`, accionada por el eje de transmisión, la semántica exacta del modelo).
  Los tramos cortos usan el tamaño **medio** real de catálogo. `setModsPerStr` ajusta el largo por
  línea y se restaura al canónico (28) al terminar. Flecha de **Norte** en escena: con azimut de eje
  ≠ 0 la planta se ve girada. Si el modelo no carga, degrada a cajas paramétricas y, sin WebGL, al 2D.

## Terreno — 3D de verdad: este-oeste Y norte-sur

**Transversal (E-O)**: presets (llano · pendiente constante · ondulado · valle · cresta · aleatorio con
semilla reproducible, mulberry32) **y edición directa: arrastra el poste de cualquier fila** en la
escena. Las pendientes se recalculan al vuelo y se acotan a ±30° (más no lo monta ningún tracker).

**Longitudinal (N-S)**: perfil de **tilt del eje POR FILA** — constante · quebrado (dos aguas) ·
senoidal · aleatorio — con su valor/amplitud. El perfil es derivado siempre de (preset, valor, nº
filas): no hay estado que se pueda desfasar. La pareja toma la **media de sus dos filas** (el inverso
exacto de la regla del core en `compute_bt_angles_rowwise`); cada fila conserva su tilt local para su
orientación y su POA. El tilt N-S es lo que activa la ventaja del true-3D.

## Implantación a lo largo del eje (los mil casos reales)

Cada línea puede llevar **varios trackers al norte**: presets alineadas · tresbolillo · **cortos
delante de largos** (la fila «media» ≈ 0,504·larga, el tipo real de San José) · aleatorio
(determinista, semilla fija), con filas por línea (1–3) y módulos por ala (8–32, canónico 28).

Y no es solo dibujo — la física lo usa: la sombra transversal se pondera por el **solape axial real**
entre receptora y emisora, desplazando la emisora por la **deflexión de la sombra a lo largo del eje**
(Δy = pitch·cos(azRel)/|sin(azRel)|; con sol casi paralelo al eje la sombra no cruza al vecino y la
cobertura es 0). Un tracker corto delante de uno largo solo sombrea su tramo; los extremos de línea se
libran; el tresbolillo desplaza la ventana. Exacto para el prisma de sombra. **No** se modela la
sombra punta-a-punta entre trackers de una misma línea (declarado).

## Plantas reales y drapeado (las dos opciones, juntas)

Dos maneras de posar los trackers en el mundo, y las DOS conviven:

1. **Drapeado** (presets): como los render 3D de la casa — el tramo mantiene el tilt que manda el
   accionamiento pero se **eleva hasta volar sobre el terreno** en todo su largo (los postes se
   alargan, que es lo que hace el montaje). Si el drapeado exige postes de más de ~4,5 m, la fila se
   marca **en rojo** con aviso: límite práctico (típico de la rígida en quiebro N-S fuerte). La física
   no cambia: usa las pendientes del terreno, como el core (declarado).
2. **Cotas reales X,Y,Z** (botones ⛰): `ayora_cotas.json` / `sanjose_cotas.json` traen, por cada mesa,
   sus extremos `n=[n0,n1]` con **cotas medidas** `y=[y0,y1]`. El cargador construye la banda de líneas
   con más filas: cotas por línea (editables en el 2D), **tilt N-S por línea medido**, tramos reales y
   las **parejas bifila reales** (con su flag de articulado → rígida/quebrada por mayoría). El terreno
   y cada tubo siguen el **poligonal real por tramo** (z0→z1 de cada mesa): aquí no hay drapeado que
   inventar — el montaje ya lo hizo — y los tilts medidos no se promedian por grupo (los fijó la obra;
   rígida/cardan solo cambia el acople de θ). Azimut de eje ≈ 0 (aprox declarada). El fetch necesita
   http (Pages); en file:// el navegador lo bloquea y la página lo dice.

Y el preset **⛳ Bagnarelli ×3**: la implantación real de Bagnarelli 24030 medida de su layout
(6 líneas a pitch 11,0 m exacto, eje a 23,7°, trackers escalonados +4,8 m con sus «medios»),
replicada ×3 → 18 líneas, 51 trackers. Testeada contra el patrón (51/9 medios/escalón).

## Las vecinas imaginarias (por qué row sombrea y pairwise no)

La fórmula de pvlib asume el campo girando **al unísono**: tus vecinas, en TU mismo ángulo. **Row**
imagina a sus vecinas como clones de sí misma sobre un terreno promediado que no existe — en terreno
irregular la ficción falla y aparece la sombra residual. **Pairwise** hace la suposición dos veces
pero cada vez sobre el hueco real y a su ángulo de tangencia, y el acoplado min(|θ|) garantiza que la
realidad solo se desvía hacia el lado seguro (vecinas más planas, nunca más empinadas que lo asumido
en el hueco común). **Min_ground_light** ya no asume: interroga la escena con los ángulos reales de
todas las filas — por eso rasca las décimas que el acoplado dejó (y por eso su resultado ≈ pairwise:
para una pareja, el ángulo sin sombra que menos luz deja pasar ES el de backtracking; el margen vive
solo en acoplados y bordes, y la equivalencia «más inclinado ⇔ menos luz» se rompe con sol casi
paralelo al eje — de ahí su gate de luz).

## ¿Dónde vive la inteligencia? TCU vs NCU

Para ejecutar el backtracking hay dos arquitecturas, y el panel de Políticas las etiqueta (chip
TCU/NCU + filtro):

**TCU (distribuida)** — cada tracker decide con lo que SABE localmente. Y con Sunner eso es
configurable por tracker: el levantamiento (`config_tcu_sunner_*.csv`, registros BT3D 41098–41104)
carga en cada TCU la **pendiente y el azimut de CADA lado** (`este_pend_transv/azimut`,
`oeste_pend_transv/azimut`) más la longitudinal (`pend_long` = su tilt N-S) — e incluso dice quién es
su `vecina_critica` por lado y si es su hermana de bifila. Con eso una TCU puede ejecutar
**astronómico, BT2D, row, pairwise y hasta true-3D local**: pairwise es un min de sus DOS restricciones
de vano, puramente local. Ventaja: robustez — sin comunicaciones el campo sigue haciendo backtracking
seguro. Límite: no puede optimizar lo que no ve (nada de energy-optimal ni min-ground-light), y la
config es estática (cambiar estrategia = reconfigurar 754 TCUs).

**NCU (central)** — la NCU calcula la posición de cada tracker y se la envía como consigna. Puede
ejecutar TODAS las políticas, incluidas las que necesitan la planta entera (energy-optimal: argmax del
POA de planta; min-ground-light: verificar sombra con los ángulos reales de las vecinas), y cambiar de
estrategia sin tocar firmware. Su coste es la dependencia de la malla — exactamente lo que mide el
proyecto de Cobertura Zigbee: RSSI, SPOF, NCU caída ⇒ los trackers necesitan un fallback local.

**En la práctica, defensa en profundidad**: TCU con su BT3D local configurado como suelo de seguridad
+ NCU que sobreescribe con consignas mejores mientras la malla está sana (el patrón TrueCapture). El
simulador cuantifica lo que compra la inteligencia central: con el filtro «TCU» el techo es pairwise
(sombra cero); con «NCU» entra energy-optimal y su ganancia (~1 % en llano, 2–6 % en terreno roto —
la envolvente de mercado de la tabla anual).

## Accionamientos: monofila · bifila rígida · bifila quebrada

Nomenclatura de la casa (CONTRATO de `scada`): **bifila = UN motor mueve DOS filas unidas por el eje de
transmisión**. El selector cambia la mecánica y el backtracking lo respeta:

| Accionamiento | Motores | θ | Tilt N-S |
|---|---|---|---|
| **Monofila** | 1 por fila | independiente por fila | local de cada fila |
| **Bifila rígida** | 1 por 2 filas | común al grupo | **medio del grupo** — un tubo de transmisión recto no se dobla; en terreno N-S quebrado los paneles quedan desalineados del terreno y el POA lo enseña |
| **Bifila quebrada** | 1 por 2 filas | común al grupo | **local de cada fila** — el cardan transmite el giro y deja que cada fila siga su terreno |

Con nº impar de filas la última va con motor propio (unidad completa, regla del layout). La escena
dibuja la transmisión entre los postes del grupo, el motor (cuadrado ámbar) y los cardanes (puntos) en
la quebrada; el pill de la geometría dice los motores (= `n_motors`, el SSOT de la casa).

**El backtracking de una bifila se resuelve a nivel de ACCIONAMIENTO, no de fila** — y esto lo descubrió
la propia QA: el min(|θ|) del grupo NO basta. Aplanar una fila mueve su borde hacia el vecino y ensancha
su perfil, así que rotaciones desiguales pueden sombrear aunque ambas estén por debajo de su ángulo
pairwise. Y a sol rasante la tangencia vive en **θ ≈ pendiente del par (con signo)** — pvlib alinea el
panel al plano del terreno — no en θ=0: aplanar hacia cero puede EMPEORAR. Por eso `driveCoupleSafe`:

1. acopla el grupo al min(|θ|) (la regla del acoplado interior del core);
2. mientras algún par sombree, busca para el grupo EMISOR el ángulo sin sombra **en todo el rango
   firmado**, eligiendo el más cercano al actual (mínima distorsión de energía);
3. lo que ni así se evita es **IRREDUCIBLE por el accionamiento** (un motor no puede alinear dos filas a
   dos pendientes distintas a sol rasante): el residuo se deja a la vista y el Martinez lo cobra — no se
   maquilla. Es la misma exclusión conceptual que la máscara de reducibilidad del core
   (`_bt3d_active_mask`).

El refinado usa el criterio de cada política: **pairwise** la tangencia geométrica 2.5D; **true-3D** su
residual de tangencia 3D (−1 mm, el criterio del core). `astro` y `row` toleran sombra por diseño
(min(|θ|) simple); `global` ya es un único ángulo. En `energy-optimal` los DOS extremos (pairwise
acoplado y astro acoplado) llevan el θ común antes de interpolar, así toda candidata es físicamente
ejecutable por los motores.

## Supuestos DECLARADOS (los mismos avisos que da la página)

- **Cielo claro Ineichen** con la TL del slider: la comparativa de políticas es válida; el valor absoluto
  de kWh/m² no es un P50.
- La **sombra solo penaliza el beam** (vía Martinez); la difusa no se recorta por sombra — el MISMO
  evaluador que `compute_bt3d_poa_per_row` en el core.
- La columna de sombra de las tablas es el **diagnóstico 2.5D** (`shaded_fraction1d` con tilt por
  pareja): en terreno con tilt N-S es **ciego a la deflexión 3D** y puede sobrestimar la sombra de
  true-3D — exactamente el caveat de `physical_shade_fraction` en el core. El árbitro geométrico es el
  **residual de tangencia** del HUD.
- **Estimación anual = 12 días representativos** (día 21 de cada mes, paso 10 min) × días del mes.
- Sin stow (viento/granizo/nieve), sin TCU, sin control (deadband/slew), sin night-latch: esto simula el
  **backtracking**, no el seguidor completo.
- La ganancia de energy-optimal lleva la **envolvente de mercado** del core (`control_benchmark`):
  TrueCapture en lazo cerrado declara 2–6% (2,2% medido por Black & Veatch); en lazo abierto debe salir
  igual o menor. La página **avisa, nunca corrige**: >8% o ganancia grande en llano = sospecha de
  evaluador, no ventaja. Medido en esta página: llano canónico ≈ **+1,1%** anual (coherente).

## ¿Por qué se elige la política en dos sitios?

Porque son dos preguntas distintas: el panel **Políticas** decide **cuáles se calculan y comparan**
(curvas, tablas, año); el desplegable **ESCENA** junto al slider decide **cuál se anima** en el 3D/2D
y en el HUD. Están rotulados para que no se confundan.

## QA — 25 comprobaciones, dos superficies

`node tools/test_backtracking_sim.mjs` (repo `cobertura-zigbee`) extrae el bloque `FÍSICA PURA` del HTML
y lo ejecuta en Node; el botón de la página corre la **misma** `runPhysicsQA()`. Si tocas la física y no
pasan, no te fíes de los números.

- `singleaxis` == fórmula cerrada de ángulo de perfil (dos derivaciones independientes, todo un día)
- pairwise ⇒ **sombra CERO** (llano, ±8°, ondulado; mañana y tarde)
- terreno uniforme ⇒ global = row = pairwise exactos
- sombra analítica == **ray-cast bruto** (±1/300, 200 casos aleatorios con offset y pendiente)
- true-3D: residual ≥ −1 mm (criterio del core) y nunca más plano que una baseline 3D-safe
- true-3D con tilt N-S 0 ⇒ **exactamente** la baseline pvlib (guard 2.5D)
- energy-optimal ≥ pairwise bajo el mismo evaluador
- óptimo libre ≥ energy-optimal y ≥ pairwise (mono/irregular y bifila) — arranca en la mejor f común y solo mejora
- BT2D plano: = pairwise en llano y SOMBREA en pendiente (evaluado sobre el terreno real)
- min_ground_light: sin sombra, nunca más plano que pairwise, y no más luz al suelo
- solape axial: emisor corto delante del largo ⇒ media sombra; sol paralelo al eje ⇒ cobertura cero
- bifila y quebrada: θ COMÚN por grupo y pairwise acoplado sin sombra en N-S quebrado + E-O irregular
  (hasta zen 80° — más rasante puede ser irreducible, ver Accionamientos)
- accionamientos degeneran en terreno uniforme: monofila = bifila = quebrada exactos
- rígida = tilt N-S medio por grupo · quebrada lo conserva · nº de motores correcto (impar incluido)
- Martinez: escalones exactos, umbral anti-polvo, saturación
- Ineichen en rango (mediodía verano España), noche a cero, GHI ≡ DNI·cosZ + DHI
- Perez: β=0 devuelve exactamente la DHI
- cotas ↔ pendientes ida y vuelta exacta · NOAA vs declinación del solsticio · noche → θ=0
- POA de planta = media por fila (no POA del ángulo medio)
- estáticos: página offline de verdad; defaults = canónicos del core (6.00 · 2.382 · 0.397 · 55°);
  la escena 3D usa las libs LOCALES del repo y degrada a 2D si THREE/WebGL fallan

## Integraciones

- **Plantas de la cartera**: el selector lee `factiun_plantas` de localStorage (el mismo seed que
  `cartera-tabla.html`), con el fallback de coordenadas de `sim-solar.html`.
- La configuración (geometría + terreno + políticas) **persiste** en localStorage (`bt_sim_cfg_v1`).

## Pendiente / ideas

- Botón «cargar pendientes de la planta» desde `config_tcu_sunner_*.csv` (Ayora/San José ya llevan
  pendiente E/O por tracker en este repo).
- Política `min_ground_light` (agrivoltaica) — está en el core, no portada.
- Export CSV de θ(t) por política para alimentar la TCU Toolbox.

## Controles de tiempo

Fecha y velocidad junto al slider: la fecha es el MISMO campo que Emplazamiento (dos vistas), y la
animación corre a ×½ / ×1 / ×2,5 / ×6 (minutos simulados por segundo real, con acumulador — no depende
de los FPS).

## Plantas reales: bloques, solapes y alineación bifila (v1.5)

- La planta se carga por **BLOQUES** (se parte sola por los huecos de x, selector si hay varios) con
  posiciones de línea REALES (vanos por pareja medidos, calles incluidas) — hasta 80 líneas; la forma
  es la de verdad, no una loncha rectangular.
- La pendiente de cada pareja se mide **en el solape norte real** de sus dos líneas (la cota media por
  línea fabricaba pendientes absurdas con líneas escalonadas: pairwise llegó a marcar 85 % de sombra
  de artefacto — con el solape, 0,0 %). Sin solape ⇒ no interactúan (cobertura axial 0), y el residual
  del HUD solo mira parejas que interactúan.
- **Bifila alineada**: el eje de transmisión es perpendicular a las vigas, así que las dos filas del
  grupo van ALINEADAS — en presets la gemela copia los tramos de la motora (tresbolillo desplaza
  grupos, no filas de un grupo); en las plantas reales ya vienen alineadas al centímetro.
- Cámara con reencuadre automático al cambiar la extensión, y residual de pareja única en los bucles
  calientes (cargar Ayora pasó de 27 s a ~10-15 s; la mayor parte es energy-optimal sobre 80 líneas).

## Historial

- **2026-08-14 · v1.26.1** — **auditoría, punto 6: GATE de pre-release obligatorio**
  (`tools/release_gate.mjs`, un comando antes de mergear): (1) sintaxis de cada bloque `<script>`
  con `node --check` — la lección del paréntesis suelto; (2) batería completa (45); (3) smoke en
  Chromium real (carga limpia, Ayora real, día computado); (4) invariantes del DAY (θ finito
  ≤θmáx, sombra∈[0,1], POA finita, 3+ políticas); (5) gate VISUAL semántico — el pacto del rojo
  como tripwire: en un alba con sombra >2% deben existir píxeles rojos de silueta en el canvas,
  paneles visibles y escena viva (caza catástrofes tipo «palillos», canvas en blanco o rojo
  desaparecido, que el ojo del agente ya demostró saltarse). La batería comprueba que el gate
  existe con sus 5 pasos. QA 45.

- **2026-08-14 · v1.26** — **auditoría, punto 3: umbrales con dato, no con fe**. Barrido de
  sensibilidad de los 4 umbrales heurísticos del contador (Ayora real, año de 12 días, cada
  variante parchea el fuente y repite el año): las PODAS (dirección + alcance 9·h/tan + ventana
  axial) cuestan **0,0000%** — validadas exactas; el gate de reparación del óptimo libre (<40°)
  cuesta **0,0000%** — validado; la marcha de terreno (4 m + 3 refinos vs 1 m + 6) cuesta
  **−0,028%** — declarado como cota; y el único MATERIAL: el gate «terreno solo con sol <25°»
  costaba **−0,34% anual**. El diagnóstico por bandas mostró decaimiento suave sin escalón
  (−2,9 kWh en 25–30°, −1,9 en 35–40°, −0,6 en 50–55°: en Ayora hay vanos al 36% y las lomas
  muerden hasta ~60° de sol) — el corte era arbitrario y se RETIRA: terreno contado a toda
  elevación (la marcha sale barata con sol alto: el rayo supera el cielo en pocos pasos). Anual
  honesto: pairwise 2760,3 kWh/m²·año (−0,34%: lo que las lomas quitaban sin contarse), true-3D
  −0,09%, óptimo +0,84%, óptimo libre +0,83%. QA 44 (test del cambio + oráculos actualizados).
  Gate de release en verde.

- **2026-08-14 · v1.25** — **auditoría, puntos 1 y 5: cuerda ANALÍTICA y oráculos en CI**. El
  estudio de convergencia del muestreo (Ayora real, año de 12 días) midió que la malla 6×8 del
  contador ray-cast SESGABA el POA anual **+0,52%** (subcontaba sombra), y la atribución por ejes
  señaló al culpable: la cuerda (MU) — a MV fijo, MU 6→48 elimina casi todo el sesgo (2799,7→2774,0
  kWh/m²·año) mientras refinar solo el eje no mueve nada; el error decae como 1/MU (primer orden:
  ni 48 muestras convergen del todo). Arreglo de raíz en vez de «más muestras»: el impacto contra
  cada plano emisor es LINEAL en la coordenada de cuerda u, así que la sombra de cada estación
  axial es una **unión de intervalos en cerrado** — MU desaparece del modelo (y con él su sesgo) a
  coste igual o menor (rasante 425 ms vs 431; sol alto 4 ms vs 7). Solo queda MV como
  discretización: con cuerda analítica, MV=8 queda a **+0,007%** del refinado MV=64 en el anual
  (≤0,52 pp de media de planta en el peor instante rasante) — default justificado con cota, y una
  guarda en la batería (MV=8 vs MV=32 ≤0,7 pp) evita regresiones. Anual honesto recalculado:
  pairwise 2769,7 (−1,07% vs el contador muestreado — lo que el 6×8 no contaba), true-3D −0,09%,
  óptimo +0,84%, óptimo libre +0,83%. Y los ORÁCULOS pasan a CI: (a) oráculo de PODAS — cuerda
  analítica reimplementada SIN ninguna poda (todas las emisoras, sin alcance, sin ventana axial),
  tolerancia 0,1 pp, 4 regímenes (rasante/terreno/torsión/verano); (b) oráculo de MÉTODO —
  discretización independiente (muestreo bruto MU=192): si la unión de intervalos tuviera una
  desigualdad mal derivada, falla. QA 43.

- **2026-08-14 · v1.24** — **«depura todo»**: barrido de auditoría Playwright sobre TODO (5 presets ×
  accionamientos, las 6 plantas, las 9 políticas, minutal, peor momento, modo sol, rayo, luces,
  picking) verificando invariantes físicos — θ finito y ≤θmáx, sombra∈[0,1], POA finita, HUD
  completo, sin excepciones JS: **cero hallazgos**. Y la deuda conocida saldada: la SILUETA usa la
  misma geometría por tramos que el contador (cota por tramo, plano receptor POR MESA, emisoras por
  tramo) — el plano único por fila desplazaba el rojo respecto al gris del shadow-map en terreno
  curvado; verificado en el escenario del reporte: el rojo abraza el gris mesa a mesa. QA 39.

- **2026-08-14 · v1.23** — **el resto de plantas, por LAYOUT**: El Burgo (45 líneas · 215 mesas),
  Páramo (80 · 189) y Fayón (14 · 24) entran como implantación REAL del DWG (líneas, mesas, huecos,
  emplazamiento) sobre terreno PLANO — sin cotas de levantamiento, DECLARADO (Túnez fuera:
  instalación fija). **Pan en modo «👁 sol»** (arrastrar mueve el target; la dirección al sol no
  cambia) — con el zoom ortográfico, cámara de inspección completa. **Rendimiento**: los
  optimizadores muestran la malla de 5 min en el instante minutal (su búsqueda por minuto hacía
  lento el slider, declarado) y la reparación exacta del óptimo libre corre solo con sol <40°.
  De la serie v1.22: disco solar oculto en modo sol y la pegatina roja pegada al cristal (a 0,19 m
  quedaba 2,5 cm en el aire y en tangencia se veía desde el sol como una raya imposible). QA 39.

- **2026-08-14 · v1.22** — **la vista del sol es ORTOGRÁFICA y sigue al sol**: el teorema del
  usuario («si yo soy el sol no puedo ver sombras») solo lo cumple una cámara de rayos exactamente
  paralelos — la perspectiva, por lejos que se ponga, deja paralaje y asomaban rojos imposibles
  (dos iteraciones: 60 m → teleobjetivo a 900 m → OrthographicCamera dedicada). El modo «👁 sol» es
  toggle: sigue al sol con el slider/animación, siempre bocarriba, orbit deshabilitado mientras
  dura, y al salir restaura vista y controles. Verificado: desde el sol, todas las palas iluminadas
  y CERO sombra visible — queda como prueba del contador (un rojo despejado desde el sol = falso
  positivo). Por el camino: v1.21.1-3 — el adelgazado del canto rompió la planta dos veces (cuerda
  aplastada, pivote desplazado) y se REVIRTIÓ entero: el modelo del seguidor (fuente única) no se
  toca; el artefacto del canto en tangencia queda declarado como límite del render. QA 39.

- **2026-08-14 · v1.21** — **pacto del rojo**: el último gris-sin-rojo era el CANTO de los módulos
  (5 cm) — en tangencia el rayo rasante pincha el grosor y el shadow-map pinta bandas de energía ~0
  que la física (palas sin espesor) no cobra; medido con oráculo independiente (raycast three.js del
  render): 12,5% uniforme de «canto» con contador exacto en 0,0%. Canto adelgazado ×0,25 solo en
  esta página ⇒ lo gris que queda es sombra real, con su rojo. **Óptimo libre SIN límites
  algorítmicos**: rejilla hasta f=−0,5 (más plano que pairwise — con el contador honesto pairwise ya
  no es sombra-cero por la torsión) + reparación con el contador exacto; límites restantes solo de
  hardware (±θmáx, slew); energy-optimal fiel al core (f∈[0,1]), declarado. Medido honesto: el anual
  no se mueve (+1,02%) — la libertad está; búsqueda consciente de torsión anotada como siguiente
  paso. QA 39.

- **2026-08-14 · v1.20.1** — **tresbolillo de verdad en bifila**: alternaba por fila (r%2) pero la
  gemela copia a la motora — siempre fila PAR ⇒ desplazamiento 0 para todas y el «tresbolillo»
  salía alineado. La alternancia pasa a ser por unidad de accionamiento (pairStep=2): dentro del
  grupo alineadas (eje perpendicular), entre grupos media mesa. El test exige ambas cosas. QA 39.

- **2026-08-14 · v1.20** — **el TERRENO que sombrea se cuenta y se pinta**: las «sombras sin rojo»
  que quedaban eran de las lomas — el ray-cast marcha ahora también contra el perfil del terreno
  (sol <25°, declarado) con penetración por estación desde el borde bajo, y las franjas rojas salen
  del propio contador (verificado: loma de 4 m a las 21:10 ⇒ filas a sotavento 20–83% con sus rojos
  exactos). Rayo crítico RECTO por construcción (borde emisor + dirección real del sol — fuera el
  codo con eje girado) y anclado a la mesa que PINCHAS. Cámara «👁 sol» (lo no visible desde el sol
  ES la sombra: prueba visual del contador). Eje de transmisión gris visible. Anual con terreno:
  pairwise 2.799,7 · true3d −0,18% · row +0,08% · optimal +1,00% · óptimo libre +1,02%. QA 39.

- **2026-08-14 · v1.19** — **el contador es ray-cast 3D a TODAS horas** (la «vía simétrica» sale del
  cajón, validada): multi-emisora con cotas por tramo a cualquier cénit, poda por alcance y
  desplazamiento axial (63 s/día → 1,8 s). Cazó la sombra que el registro de pareja no ve (fila 32 de
  Ayora, 09:00, sol a 24,6°: 18,8% con DNI plena — torsión del terreno mediana 3,4°/p90 5,5°,
  corroborada por el estudio 2.5D-local independiente). La pieza que faltaba: **Martinez POR ESTACIÓN
  AXIAL** — la sombra 3D es parcheada y aplicar el bypass al promedio de fila fabricaba un −8% anual
  espurio; por estación, el cargo simétrico real a pairwise es **−1,32% anual** (2.853,1→2.815,5),
  en la escala DNV. Optimizadores buscan con el 2.5D rápido (declarado); lo publicado siempre con el
  ray-cast. Convención de PRESENTACIÓN como la TCU: **θ<0 = este** (factor único, física interna
  intacta). El rayo crítico **no atraviesa módulos** (recorte al primer impacto con cualquier mesa).
  Fuera la alfombra del vano; «sombra máx» solo con sol útil (DNI>25). **Anual: pairwise 2.815,5 ·
  true3d −0,20% · row +0,08% · optimal +1,03% · óptimo libre +1,06%** — supersede v1.18. QA 38.

- **2026-08-14 · v1.18** — **la sombra rasante cruza varias filas — se cuenta Y se pinta entera**:
  el contador de la banda rasante y la silueta roja pasan a MULTI-EMISORA (todas las filas del lado
  del sol dentro del alcance, planos por tramo con cotas reales); la silueta además ya no se
  descarta entera cuando una esquina del emisor no proyecta (recorte previo al semiespacio que
  proyecta — el motivo principal de «mesas sombreadas sin rojo»). Verificado: ray-cast completo ≡
  contador publicado (2,16 % ≡ 2,16 % al alba, 0 discrepancias); horizontales θ=0 tendrían 0,73 %
  (donde el terreno sube contra el sol más que tan(elev), ni planos se libran). **Paso MINUTAL**
  honesto: escena y HUD calculan la física exacta del minuto bajo demanda; malla de 5 min para
  curvas/tablas, declarado. Indicador **BT OFF/ON fijo** + HUD con tarjetas estables; la referencia
  astro de las horas de BT se acopla como el accionamiento (dos tramos reales en Ayora: 06:41–09:13
  y 19:04–21:33). **Cúpula de cielo** con degradado por altura real (ocaso naranja con el disco en
  el horizonte). Audit de espaldas al sol: pairwise/true3d/astro 0 min; energy-optimal 40 min al
  alba en gemelas bifila (hardware real, el argmax global compensa). Anual re-medido: pairwise
  2.853,1 · true3d −0,48% · row −0,50% · optimal +0,88% · óptimo libre +1,10% — supersede v1.16.
  QA 37.

- **2026-08-14 · v1.17** — **el tiempo enseña el backtracking**: el slider de hora se pinta por
  tramos desde la física (oscuro = noche · ámbar = horas de BT de la política de la escena, consigna
  a >0,5° de la posición astronómica con la misma referencia limitada a slew) y el aviso «BT ON» se
  enciende junto al reloj en esas horas. Sombra del render sin SIERRA: el frustum de sombra fijo de
  140 m estiraba cada texel 1/sin(elev) por el suelo con sol rasante (~2 m a 2° de elevación — los
  dientes y la sombra «clavada» que avanzaba a saltos); frustum ANISÓTROPO (alto ceñido a
  patch·sin(el)+alturas·cos(el), near/far pegados, normalBias) ⇒ texel en centímetros a cualquier
  hora. «☀ rayo» se apaga al desmarcar (no tenía listener). Cielo rojizo con el sol bajo en luz real
  + crepúsculo (0…−8°). QA 36.
- **2026-08-14 · v1.16** — **la sombra pintada es la SILUETA real** (cada mesa emisora proyectada
  por el rayo solar sobre el plano de la receptora, polígono recortado a la mesa — ya no sobresale ni
  exagera anchura), suelo honesto (banda pálida del vano + cintas de sombra inclinadas por fila
  siguiendo el terreno real) y **selector de luz** real (amanecer/atardecer rojizos ligados a la
  elevación solar) / a tope (plana brillante para inspeccionar sombras). Y el **contador honesto se
  hace bidireccional a medias, con honestidad**: en la banda rasante el ray-cast 3D usa las COTAS
  REALES POR TRAMO (la extrapolación lineal del tilt axial en líneas de km creaba mesas fantasma a
  60 m bajo tierra y cobraba sombra masiva falsa); fuera de la banda el 2.5D se filtra con el
  residual de tangencia (sombra Martinez fantasma con el 3D certificando «sin contacto» ⇒ no se
  cobra). La vía simétrica (cobrar contactos 3D que el 2.5D no ve a todos los cenit) queda **EN
  ESTUDIO**, documentada en código: el prototipo sobrecargaba 0,5–1,6% a pleno sol con holguras
  métricas sin explicación y no se publica física sin validar (su magnitud real medida: 0,15–0,24
  %/día). Óptimo libre con arranque exacto (argmax de poaPlant) y salvaguarda: por construcción
  ≥ óptimo común. **Anual honesto (Ayora, 12 días): pairwise 2.852,8 · true3d −0,48% · row −0,50% ·
  optimal +0,95% · óptimo libre +1,16%** — supersede el +1,43% de v1.15, que mezclaba fantasma 2.5D
  en la referencia. QA 35.
- **2026-08-14 · v1.15** — **evaluador rasante 3D**: con 80°<zen<89,5° el término temp≥1 de pvlib
  declara «sin sombra» mientras la geometría 3D real sombrea hasta un 27% de módulo (medido en
  Bagnarelli: azimut de eje 23,7° + tilt N-S; 3D 16-23% donde el 2.5D ve 0-7%). En esa franja
  shadeRows cuenta con ray-cast 3D sobre tramos finitos para TODAS las políticas — las decisiones de
  las TCU no cambian; el contador ya no puede mentir. QA doble (34): el 3D reproduce al 2.5D donde el
  2.5D es exacto y ve lo que el 2.5D no. **Impacto anual en Ayora**: pairwise 2.862,4 → 2.853,0
  kWh/m²·año (−0,33%, la sombra rasante real que no se contaba) y energy-optimal pasa de +0,71% a
  **+1,43%** — su argmax, con el contador honesto, esquiva la sombra del alba/ocaso que las TCU con
  registros no pueden ver: el valor de la inteligencia central se dobla. (El PDF/informe anteriores
  quedan como foto del evaluador con paridad-core 2.5D, declarado.) Además: sombras del render
  nítidas (mapa 4096 + frustum ceñido a 140 m siguiendo la cámara) y el rayo crítico corta por la
  mesa que estás mirando.
- **2026-08-14 · v1.14** — el corte 2D de plantas reales corta DE VERDAD (cota de cada mesa
  interpolada en la banda con más mesas — el mismo plano de corte del rayo/alfombra/etiquetas —
  en vez de medias de línea); la alfombra del haz cubre el solape axial completo y SIGUE el terreno;
  el globo explica el residual negativo con 2.5D limpio («contacto 3D a nivel de línea, la mesa se
  libra por el solape» / «contacto 3D que el 2.5D no ve — true-3D lo evitaría»: la deflexión axial
  también juega en contra, la otra mitad del trabajo del true-3D).
- **2026-08-14 · v1.13** — coherencia por construcción del rayo crítico: criticalRayPair pasa al
  bloque FÍSICA en el marco exacto de shadeFracPair (QA de 200 casos: la frontera dibujada reproduce
  fs con error < 1e-6); el render se ancla a la geometría del montaje y el color del marcador sale
  del mismo número que el HUD (rojo en la pala / verde al suelo / ámbar si el corte 2D cortaría pero
  el solape axial la libra). Bug cazado: el gating por residual del true-3D miraba la pareja
  equivocada (índice invertido). Medición nueva: sombra de filas NO adyacentes bajo pairwise en
  Ayora = 0,0% todo el día (ray-cast bruto multifila — la cadena de tangencias cubre también a las
  de más allá). QA 33.
- **2026-08-14 · v1.12** — eje de transmisión bifila con calidad de render (barra de acero a la
  altura del tubo con copas en los extremos, entrando en el slew del modelo; el cubo amarillo solo
  sin modelo) y banda de sombra a ras del cristal (la elevación anti z-fighting sobraba en la caja
  opaca — era el «raíl rojo» sobresaliendo).
- **2026-08-14 · v1.11** — banda de sombra como lomo OPACO con volumen (fuera la sierra del
  aliasing) y proporcional de verdad (mínimo 3% → 0,8%); true-3D arbitrado por el residual en el
  render (si la tangencia confirma que no hay contacto 3D, no se pinta — medido al alba: 78 parejas
  con «sombra» 2.5D del 10-16% y residuales +39…+206 mm ⇒ contacto real cero); globo v2 con los
  REGISTROS de cada vano (pitch · pendiente resultante · azimut del vector, estilo TCU Sunner),
  residual en mm y veredicto de evitabilidad (evitable / inevitable a este sol / sin contacto 3D).
- **2026-08-14 · v1.10** — «☀ rayo»: el rayo crítico de la fila seleccionada (por el borde alto del
  emisor, 3D pleno con deflexión axial; marcador verde al suelo / rojo si pincha a la vecina) y el
  HAZ DE LUZ del vano medido — franjas de sombra por unión de las proyecciones de TODAS las filas
  del corte y etiqueta «haz X,XX m · YY% del vano». Verificación física: tangencia pairwise ⇒ haz
  0,00 m (persiana continua); mediodía ⇒ 60% (cuerda 2,38 sobre vano 6). Postes/tubo despreciados
  (declarado).
- **2026-08-14 · v1.9** — globo por mesa (pincha y sale fila, θ, tilt, sombra, POA y el peor momento
  de esa fila con salto), botones «⚠ ahora / ⚠ día» (fila con más sombra del instante / peor momento
  del día). Y TRES bugs cazados al estrenarlos: clampSlopes corrompía las parejas de las plantas
  reales (capaba medias de línea legítimas entre bandas destresbolilladas ⇒ pendientes de −52° donde
  el solape mide −0,8° y sombras masivas espurias en el tránsito — con cotas medidas ya no aplica);
  anglesTrue3d usaba un signo global (el de la última pareja) para todas las filas ⇒ bandazos en el
  tránsito (ahora signo por fila con la baseline de árbitro + QA de continuidad); y loadRealPlant no
  fijaba el emplazamiento (Ayora se simulaba con la lat/lon por defecto — ahora clat/clon del layout
  + altitud de cotas). Los anuales publicados salieron del motor Node (pairDz directo): intactos.
  QA 32.
- **2026-08-13 · v1.8** — el render enseña la física: banda ROJA de sombra CALCULADA sobre cada pala
  (fracción exacta de shadeRows, por el borde por el que entra) y etiquetas por fila conmutables
  (θ · % sombra · POA de la política de la ESCENA). Astro sangra rojo; pairwise queda limpio.
- **2026-08-13 · v1.7.2** — motores y bielas a la cota MEDIDA del tramo (hubAt interpolaba el plano
  de la línea y la ferretería levitaba donde el terreno real se aparta de él).
- **2026-08-13 · v1.7.1** — bielas bifila solo entre vigas enfrentadas (≤ 1,5 m de desalineación,
  ≤ 9 m — fuera las diagonales imposibles del render) y **velocidad real del actuador**: el día se
  simula con la consigna limitada a 0,17 °/s (rampas reales en amanecer/ocaso y cambios de f; en el
  año a paso 20 min no muerde, omitido y declarado). QA 31.
- **2026-08-13 · v1.7** — **ámbito por NCU**: en plantas reales se elige simular la planta entera
  (por bloques) o el parque de UNA NCU (topología NCU→TCU de `<planta>_layout.json`, orden 1:1 con
  las cotas, verificado en test; Ayora 16 · San José 21; frontera = bordes, declarado). Encuadre por
  defecto de plantas «cinta» sobre la banda con más mesas. QA 30.
- **2026-08-13 · v1.6** — **Óptimo libre (NCU)**: novena política, cada unidad de accionamiento con su
  propia fracción de backtracking por ascenso coordinado (427 grados de libertad en Ayora). En la
  planta real: +1,03 % vs pairwise frente al +0,71 % del energy-optimal de misma-f (techo de esa
  familia: +0,77 % con 33 candidatos). Verificación del muestreo anual: 365 días vs 12 representativos
  difieren ≤ 0,03 pp en los Δ% de todas las políticas. QA 29.
- **2026-08-13 · v1.5** — plantas reales por bloques con forma real (vanos y pendientes por solape),
  bifila alineada (eje perpendicular), arquitectura TCU/NCU en el panel (chips + filtro) y su sección
  de doc, cámara con reencuadre, residual filtrado a parejas que interactúan. QA 28.
- **2026-08-13 · v1.4** — plantas reales por cotas X,Y,Z (Ayora / San José: banda densa, tilts
  medidos, parejas bifila reales, terreno por poligonal de tramo) + drapeado en presets con aviso de
  postes desproporcionados + preset Bagnarelli ×3 medido + hub 2,0 m (postH del modelo) + fecha y
  velocidad junto al slider + sección «vecinas imaginarias». QA 27.
- **2026-08-13 · v1.3** — inventario COMPLETO de políticas (+BT2D plano, +min_ground_light — contraste
  contra el notebook documentado arriba), implantación a lo largo del eje con solape axial en la
  física, render con el MODELO real del seguidor (buildBeam west/gemela, tamaño medio), flecha de
  Norte, selector de escena rotulado. QA 25.
- **2026-08-13 · v1.2** — escena principal en 3D real (three.js local + OrbitControls, shadow-map,
  terreno heightfield E-O+N-S, postes que delatan a la rígida); el corte 2D queda como pestaña-editor.
  Degradación automática a 2D sin WebGL. QA 22.
- **2026-08-13 · v1.1** — 3D N-S + E-O completo y accionamientos: perfil de tilt N-S por fila
  (constante/quebrado/senoidal/aleatorio), monofila · bifila rígida · bifila quebrada con backtracking
  a nivel de accionamiento (`driveCoupleSafe`, residuo irreducible a la vista), transmisión/motores/
  cardanes en la escena, tilt N-S por fila en el HUD. QA 20 comprobaciones.
- **2026-08-13 · v1.0** — primera versión: 6 políticas, terreno editable, escena + curvas + tablas,
  QA 17/17 en Node y navegador, envolvente de mercado en la tabla anual.
