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
