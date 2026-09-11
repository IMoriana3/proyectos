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

## Export de consignas: la tabla de apuntamiento, por seguidor y por minuto

`tools/export_consignas.mjs` saca la consigna de una planta real **seguidor a seguidor**, con las
claves del CONTRATO de la casa para que se pueda cruzar con lo que el campo hace de verdad:

    node tools/export_consignas.mjs --planta ayora --fecha 2026-06-21 --pol pairwise --paso 5

**Para qué modelo**, que son dos preguntas:

- **Qué modelo genera la consigna.** Por defecto las políticas **geométricas** (pairwise —la
  canónica de TCU—, true-3D, row, min-ground-light): viven enteras dentro de la misión de este
  módulo (geometría real + sol + límites de hardware) y **no dependen del evaluador energético
  provisional**. Los óptimos se exportan igual pero marcados `asesoria=1`: su elección depende del
  POA/Martinez provisional, así que **son propuesta, no consigna**, hasta que exista el módulo
  energético y la validación contra SCADA.
- **Para qué consumidor.** Las claves son las de `diagnostico_tcu` (`scada/CONTRATO.md`): **NCU +
  TCU**, con el TCU como número dentro de su NCU. Esa fila ya trae del campo lo que el seguidor
  hace (`Tilt`) y lo que su propia TCU quería (`Objetivo`), así que el CSV se cruza por
  (planta, ncu, tcu, fecha) y sale el **modo sombra**: lo que mandaríamos nosotros contra lo que la
  planta hizo — sin tocar un motor.

Columnas: `planta, fecha_local, hora_local, ncu, tcu, tracker, bloque, linea, politica,
theta_sim_deg, theta_tcu_deg, sombra_fila_pct, sombra_estructura_pct, asesoria`, más un
`.meta.json` con versión, huso, convenciones y lo declarado. La consigna sale **ya limitada por la
velocidad del actuador** (slewLimit), y en bifila es la de la línea MOTORA (la gemela va soldada).
La planta se recorre **por bloques** (se parte sola por los huecos de x): en Ayora, 754 de 754
seguidores sobre 295 líneas en 2 bloques.

Pendiente de confirmar **con una lectura real**, y declarado en el propio fichero: (a) que el nº de
TCU del `id` del layout («TK 007-01» → 7) casa con el `TCU` del diagnóstico — comprobación trivial
el día que haya un volcado; (b) **el signo** — se emiten las dos columnas (`theta_sim_deg` del marco
interno y `theta_tcu_deg` con la convención θ<0 = este) y cuál casa con el registro `Objetivo` lo
decide una lectura, no una suposición.

> Trampa que costó 500 seguidores y quedó blindada con test: `plantFromCotas` devuelve `lineX`
> **recentrado a 0 en cada bloque**; la x cruda es `xFrom + lineX`. Comparar `lineX` con la x del
> layout dejaba al 70% de la planta sin consigna, y en silencio.

## Frontera de módulos: este simulador es MOVIMIENTO; el POA/eléctrico será otro módulo

Decisión de arquitectura (2026-08-14): la misión de este módulo es el **movimiento y el
apuntamiento** — geometría real, sol, políticas de consigna y límites de hardware. El cálculo POA
y el modelo eléctrico «oficiales» vivirán en un **módulo energético aparte**; lo que hay aquí
dentro (Perez/Ineichen + Martinez por estación) es un **evaluador provisional**, acotado y
declarado, que se sustituirá por el módulo real cuando exista.

**Qué es misión de este módulo** (todo en los niveles fuertes de justificación — literatura,
construcción o medida):
- geometría: cotas por tramo, pitch reales, cuerda, implantación (tresbolillo, huecos, mesas);
- sol NOAA (verificado contra tránsito);
- apuntamiento: pvlib singleaxis + pairwise/true-3D con residual de tangencia;
- **sombra geométrica**: el contador de cuerda analítica con sus dos oráculos — se queda aquí
  aunque el POA se vaya, porque el backtracking ES gestión de sombra: la justificación de una
  consigna es «con este θ, la sombra geométrica es cero (o esta, pintada en rojo)»;
- hardware: acoplado bifila (gemela≡motora), clamp ±θmáx, slew del actuador.

**El bucle, y cómo se rompe.** El apuntamiento óptimo necesita al módulo energético para elegir
(energy-optimal y óptimo libre maximizan POA), y el módulo energético necesita los ángulos para
calcular. No es circularidad: es el patrón **generador/evaluador** de cualquier optimización —
este módulo GENERA candidatas ejecutables (rejilla de f, acoplado, clamp, slew: solo posiciones
que los motores pueden adoptar) y el módulo energético las EVALÚA como función objetivo; se itera
por instante sobre una rejilla finita y converge. Las políticas geométricas (pairwise, true-3D,
astro, row) ni siquiera entran al bucle: su consigna es geometría pura, sin energía — igual que
una TCU real. Solo la inteligencia de NCU (los óptimos) cierra el lazo con el evaluador.

**El contrato del enchufe** (ya implementado — el evaluador se inyecta, no se llama por nombre):

    evaluar(zen, az, T, θ[porFila], irr, doy, albedo) → { plant, rows[], shade[], elec[] }

Es la firma exacta de `poaPlant` en FÍSICA PURA. El día que exista el módulo energético, se
implementa esta firma con su POA/eléctrico y los optimizadores lo consumen sin tocar una línea
del movimiento. Las dos únicas constantes de nivel débil que SÍ son de este módulo y esperan
dato de planta: el buje (2,0 m — mueve la sombra de terreno, que mueve consignas) y el slew
(0,17 °/s de catálogo Sunner — decide qué consigna es ejecutable).

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

## QA — la misma batería, dos superficies

<!-- El título llevaba «25 comprobaciones» desde que las había: la batería va por 130 y el número
     caducaba en cada sesión. Lo que importa aquí no es cuántas son, sino que la página y Node
     corran EXACTAMENTE las mismas; el recuento lo dice la propia batería al terminar. -->


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

- **2026-09-11 · v1.53.0 · torsión entre vigas vecinas, «de quién viene la sombra» y el haz de sombra** —
  Ignacio, con Arequipa (−16,6°, UTC −5), 21-jun, bifila quebrada, perfil N-S senoidal de 3° y pendiente
  constante 5,14°: *«los algoritmos funcionan mal, ¿qué sentido tiene que el primer tracker no se tumbe?»*,
  *«en pairwise también pasa»*. Con tilts 0°/3° alternos las vigas vecinas **no son paralelas**: la
  vecina está 1,7 m más alta en un extremo que en el centro. El pairwise decidía con la pendiente del
  centro y un tilt medio (lo que pvlib supone) y dejaba **22-30 % de sombra a las 07:00-07:20**. Y el
  peor punto no es el extremo (allí el rayo pasa por delante del final de la vecina) sino a media mesa,
  donde el θ sin sombra es −5°, pasando de cero: la fórmula de pvlib no llega. Ahora el candidato de
  pvlib se comprueba con el ray-cast 3D de la pareja (`shadePair3DBand`, que arrastraba la misma base
  oblicua y la cara en el eje: corregido) y, si sombrea, se barre el ángulo con signo hasta el primer θ
  sin sombra, con una pasada de reparación entre parejas; las filas interiores toman el más
  backtrackeado (min sg·θ), y los evaluadores rápidos (acople, shadeRows25, óptimo libre) miran la peor
  estación. Arequipa 07:20: de 43° con 22 % a −3° con 0 %; 07:00: 3 % (era 30 %). Sin torsión no cambia
  ni un bit (test). El 13 % residual a sol < 10° era en buena parte de las 8 estaciones del contador
  (con 32: 0,4-2,7 %). **De quién viene la sombra**: el contador atribuye la sombra de cada fila a sus
  emisoras y al terreno (`out.de`) y el globo lo dice («sombra 20,5 % de terreno 13 %, fila 3 8 %»),
  que explicaba «la sombra de la fila 4 va en otra dirección»: la mitad era de la loma, que se pinta
  como banda. **Haz de sombra** («▤ haz»): el volumen tenue del objeto que sombrea a su mancha sobre la
  mesa. Barrido desde el sol en Arequipa: 0 rojo visible. Cuatro tests nuevos. Y el desplegable
  «configuración de la TCU» explicado: es lo que la TCU *cree* tener delante (pendiente por pareja /
  la ficha por seguidor / registros a 0); el contador siempre usa el terreno real.
  **Y el «millón de pruebas»** (`tools/barrido_terrenos.mjs`: terrenos E-O × perfiles N-S ×
  accionamientos × implantaciones × latitudes × fechas × políticas, 40 configuraciones × 3 fechas × cada
  20 min, con invariantes y los peores casos). Encontró: **(A)** el contador podaba emisoras por alcance
  con «9 m de altura útil» a fuego, y con torsión hay 13,6 m de desnivel entre extremos de mesa: 5,5 pp
  contra el oráculo sin podas; ahora el alcance usa el desnivel real y la poda axial suma el
  desplazamiento por desnivel → contador ≡ oráculo en 1.424 instantes (0,000 pp). **(B)** 2.520
  instantes-política en que pairwise/true3d/mgl dejaban sombra que un θ uniforme evitaba: filas **no
  adyacentes** (con Bagnarelli o tresbolillo la emisora que solapa está 2-4 filas más allá; en ondulado
  la cresta tapa el valle por encima de la fila de en medio) y torsión. De ahí `repairNoShade` al final
  de las tres: el contador dice de quién viene la sombra de cada fila, se arranca del mejor θ uniforme
  del instante (memorizado, compartido por las tres) y se desciende moviendo 2° a las emisoras
  implicadas; sin sombra de filas no entra (ni un bit en llano). Los cuatro peores: 100/96/100/94 % →
  0/0/3,7/3,1 %; en el barrido, 2.520 → 830 fallos y el peor de 100 % a 25 %, todos a sol < 10° con
  torsión (el resto, 489, es sombra física que ningún θ evita). Energía (optimal ≥ pairwise, optfree ≥
  optimal), acople por motor y rango de θ: 0 violaciones en 4.224 / 11.105 / 21.120 comprobaciones.
  Una versión reducida (seis configuraciones) va en la batería.

- **2026-09-11 · v1.52.1 · en modo sol la rueda no repintaba, y la cámara baja hasta 0,5°** — Ignacio:
  *«¿no puedo hacer zoom?»*. En el modo «👁 sol» la rueda escalaba la cámara ortográfica (×1,12 por golpe)
  pero no marcaba la escena como sucia, y el bucle sólo repinta cuando algo la marca: la cámara cambiaba
  y la pantalla no. Medido con un contador de renders: en reposo 0, tras la rueda 0; ahora 1, con la
  ortográfica. El pan en modo sol repinta también. Y la cámara del sol se clavaba en 1,5° de elevación:
  con el sol a 0,2° (su captura del ocaso, 52 % de sombra real) se miraba desde otro sitio y el rojo se
  veía sin ser un hallazgo. Baja al límite de validez del contador (0,5°) y el pie de la escena dice
  desde dónde se mira («SOL a 4,3° · az 298°») y avisa cuando no es el sol.

- **2026-09-11 · v1.52.0 · el tilt N-S entraba en pvlib con el signo cambiado, y la pala se medía en una
  base oblicua** — Ignacio, con una planta sintética (onda senoidal E-O + pendiente constante N-S):
  *«me ponía en la posición del sol y veía sombras, no debería ver ninguna; había sombras que no se
  ponían rojas»*. Dos fallos, los dos sólo con tilt N-S ≠ 0. **(1)** La app mide el tilt del eje
  norte-arriba-positivo (así lo miden las cotas, lo dibuja el 3D y lo usan contador y oráculo); pvlib
  —y `sol.js`, su port— lo define al revés (axis_tilt positivo baja hacia axis_azimuth). Se le pasaba
  sin cambiar el signo y la política backtrackeaba para el terreno **espejo**: un plano llano E-O a +5°
  amanecía con un **64 % de sombra real**, que el contador y el 3D sí veían. Se convierte ahora en la
  única frontera con pvlib (`pvTilt`, en cada `singleaxis`/`trueTrackAngle`/`surfaceOrient`; sol.js
  sigue siendo pvlib) y `surfaceOrient` pasa a la fórmula exacta de pvlib (la anterior sólo valía con
  tilt ≥ 0: la pala a θ=0 miraba cuesta arriba). **(2)** El contador 3D —y su oráculo, que copiaba el
  mismo álgebra— proyectaba el impacto sobre la cuerda con una base oblicua (uD·vD = −sin θ·sE ≠ 0):
  a 32 m del centro de la mesa y θ=44° sobre 5° de tilt son 1,9 m de error, casi la cuerda entera.
  En un plano uniforme a 5°, donde pvlib es exacto, cobraba un **19 % de sombra a 22° de sol**,
  creciendo con θ; y la silueta roja se pintaba desplazada (la «sombra que no se ponía roja»). Corregido
  en cerrado en el contador, por eliminación en el oráculo, y en la silueta. De propina, el terreno en
  presets: `nMin` se quedaba en +∞ (sólo miraba `PRr.segs`) y el suelo era −∞ siempre; la fila sin
  emisoras del lado del sol se saltaba el marchador; y `gMax` usaba 30 m a fuego en vez del largo
  real de la mesa. Resultado: plano uniforme ±5° → 0 sombra a cualquier elevación, contador ≡ oráculo
  ≡ 2.5D ≡ bruto; senoidal + tilt 5° → contador ≡ oráculo todo el día, terreno y filas de borde
  incluidos. Comprobado en navegador desde el sol en TODAS las posiciones (3 fechas, cada 20 min, 106
  instantes, contando píxeles rojos): antes 47 instantes con rojo visible desde el sol (peor 1.163 px,
  21-jun 18:20, sol a 35°); después 0. Cuatro tests nuevos (guardia de `pvTilt` en toda llamada a pvlib +
  signo en el POA; plano uniforme ±5°/8° ≡ 0 y θ(+5) < θ(0) < θ(−5) con sol en el NE; base oblicua a
  θ=44° ≡ bruto MU=64; senoidal + tilt ≡ oráculo). **Afecta a las plantas reales**: Ayora y San José
  llevan tilts medidos de ±2°, y sus consignas y sombras cambian en consecuencia (poco, pero bien).

- **2026-09-10 · el cizallado medido también en el 3D** — Ignacio: *«aplica lo del cizallado medido
  también al 3D»*. `cotas_asbuilt.py` mide por seguidor el corrimiento del centro de una viga respecto
  del de su hermana a lo largo del eje (`sh`), de las mismas puntas que se dibujan, y la planta declara
  cuántos van corridos (`n_sh`, > 0,5 m) con su reparto (`sh_p50/p95/max`). San José: p50 0,117 ·
  p95 0,232 · máx 1,199, **10 seguidores corridos, los mismos que mide el mapa**; Ayora: 0,027 / 0,090
  / 0,207, ninguno. El globo del 3D lo dice en cada fila («cizallado E/W 0,118 m», y en magenta «vigas
  corridas» si pasa de 0,5). Test nuevo: el cizallado sale de las puntas de cada tracker, la cuenta
  declarada coincide, y San José/Ayora dan 10/0 como el 2D. Las cotas no cambian en nada más.

- **2026-09-10 · las bielas también en Ayora** — Ignacio: *«lo del visor con bielas y tal aplícalo en
  Ayora»*. El visor emparejaba las dos vigas de un seguidor por el sufijo `-E/-W` del id, que es el de
  San José; en Ayora las dos filas se llaman `HD-1-0`/`HD-1-1` y se quedaban sin biela. Ahora el
  seguidor es el id sin su último tramo y la pareja son sus dos filas, una de cada lado: **Ayora 754
  bielas**, San José 2.289 (las mismas). Ayora lleva además el cizallado E/W medido como San José
  (p50 0,027 m · p95 0,090 · máx 0,206: ninguna viga corrida). Su «sector anómalo» es otra cosa
  (desviación de pendiente frente al proyecto) y se conserva; el cizallado va aparte en la ficha.

- **2026-09-10 · «sector anómalo» se mide de la geometría dibujada** — Ignacio: *«¿qué es sector
  anómalo en San José?»*. Son los seguidores con las dos vigas **corridas entre sí a lo largo del eje**
  más de 0,5 m (cizallado; comparten tubo, debería ser ~0). Y la marca venía de `shear.csv`, calculado
  sobre la **asignación vieja del proveedor**: marcaba **59** seguidores y, medido sobre el reparto
  nuevo, sólo **1** de ellos tiene las vigas corridas de verdad. Ahora el cizallado se calcula en el
  generador, centro de la viga E contra el de la W del mismo seguidor, y va por fila (`sh`). San José:
  p50 0,118 m · p95 0,231 · máx 1,199; **10 seguidores > 0,5 m**, entre ellos TR-10_1-011, TR-09_1-011
  y TR-02_2-057 — justo los que el reparto avisa por largo apartado de su tipo.

- **2026-09-10 · el largo de la viga sale del tipo del plano — preparando El Burgo** — Ignacio:
  *«carga El Burgo como primera planta real»*. No se puede todavía: **no hay levantamiento de El Burgo**
  en ningún repositorio (sólo el plano, las coordenadas de TCU del barrido zigbee y el TMY). Hace falta
  `elburgo_levantamiento.csv` del topógrafo (`id,X,Y,Z`, cuatro puntas por viga, UTM 30N). Lo que sí
  se ha visto al mirar el layout y se deja resuelto: El Burgo **no trae ficha de módulo** y sus tipos no
  son «completo/medio» sino *Interior/Exterior con/sin rótula* y *Medio*, así que el reparto (que
  busca los topes a L/2 del centro) y la reconstrucción del plano no tenían de dónde sacar el largo.

  Ahora el largo nominal por tipo se resuelve en orden: `tipos_largo` del layout (declarado, medido en
  el DWG: El Burgo 64,6 m las mesas y 32,6 la media, con los pilotes reales a ±30,5/30,8 y ±13,6 m),
  `mesa.tipos[<tipo>].largo` si el bloque se llama como el tipo, y la ficha del módulo si la hay
  (San José: 73,87 / 37,20 m, exactamente lo de antes). El largo por defecto es el del tipo más
  frecuente del plano. `cotas_asbuilt.del_plano` reconstruye también sin ficha de módulo, con el largo
  del tipo. San José: 0 de 4.572 filas cambian, cotas idénticas. QA 150.

- **2026-09-10 · el visor 2D dibuja mesas y bielas, no filas enteras** — Ignacio: *«¿podrías dibujar
  la biela entre las filas? Y las mesas, no? Porque aquí representas filas, no mesas»*. El as-built
  trae la junta medida y el generador la tiraba. Ahora cada fila con junta son sus **dos mesas** (sur y
  norte del morro, con el hueco del accionamiento, sus cotas y su pendiente), el **motor** va en el
  morro con su desplazamiento respecto de la recta entre puntas, y hay capa nueva de **bielas**: el eje
  de transmisión entre las dos vigas del mismo seguidor, de morro a morro. San José: 4.517 filas
  articuladas (2.281 seguidores), 9.034 mesas, **2.289 bielas**.

  Regla que hubo que fijar: **el 2D dibuja el levantamiento tal cual** (puntas y junta del as-built,
  la cota contaminada marcada y no corregida) y del modelo sólo toma una decisión, si soltó la junta
  la fila va rígida. Mezclar puntas del as-built con la junta del modelo daba motores «desplazados»
  37 m en las copias de hermana; con la regla, el máximo es 2,81 m, el mismo que el modelo.

- **2026-09-10 · cargar una planta nueva ya no exige sembrar nada a mano** — Ignacio: *«deja listo lo
  de las dos aristas para cargar plantas nuevas»*. Las dos eran de arranque, no de física.

  **1. El reparto exigía un as-built previo.** `reparte_levantamiento.py` heredaba de él la meta y los
  vectores TCU, y para una planta nueva no lo hay. Lo que heredaba de verdad tiene fuente propia: el
  marco local (`cE`, `cN`) y la ficha del módulo (`modW`, `gapMod`, `gapDrive`, pitch, cuerda, gcr,
  límite) están en el **layout**; la base de cotas es la **mediana de la Z del levantamiento**,
  redondeada al metro (un origen, declarado); el huso UTM se lee del `crs` del layout
  (`EPSG:32719 → 19S`); y los vectores TCU no tienen fuente aquí y van a null, como ya pasaba con toda
  fila nueva. Probado quitando el as-built de San José y regenerando desde cero: **4.572 de 4.572 filas
  idénticas** en geometría y cota absoluta.

  **2. El generador del visor estaba escrito para San José.** Rutas, huso 19S, nombre y código clavados,
  en `san-jose/tools/`. Pasa a `asbuilt/tools/generate_asbuilt.py <planta>`: lee de
  `asbuilt/source/<planta>/`, la meta sale del as-built (que la hereda del layout), lo que el plano
  no sabe —el cliente— va en `meta.json`, y escribe `data/<planta>.js` y una entrada en
  `data/plantas.js`. La página deja de conocer plantas: selector y `?planta=` salen del manifiesto.
  San José regenerado por el camino nuevo: `data/sanjose.js` **byte a byte igual** al que servía.

  Cargar una planta: `reparte_levantamiento.py elburgo` → `cotas_asbuilt.py elburgo` → copiar los
  tres JSON → `generate_asbuilt.py elburgo`. Sin tocar ninguna página.

- **2026-09-09 · el globo del 3D dice qué puntos** — Ignacio: *«añade al globo del 3D el desvío y el
  id del punto»*. El 2D ya lo decía en la ficha y la reclamación lo lleva en el CSV; el 3D sólo decía
  «esa cota es del terreno vecino». Ahora cada fila con cota repuesta o copiada lleva en `cotas.json`
  sus puntos `[id, desvío]` (del detector, `pmal`; la copia con los de la fila descartada), la escena
  los publica por mesa (`segRp`) y el globo los escribe bajo la marca de origen: *«puntos con la Z en
  otra referencia: 8437 (+36,9 m) · 8438 (+36,6 m)»*. 46 filas, 92 mesas, 170 entradas. Invariante:
  toda fila repuesta trae sus puntos, ninguna limpia los trae, todos con desvío > 3 m. QA 149 → **150**.

- **2026-09-09 · las bielas, recontadas, y 39 filas que iban naranja** — Ignacio: *«cuenta cuántas
  bielas te salen ahora»*. San José **2.289**, una por tracker: 2.243 entre vigas con cotas medidas,
  35 con alguna cota repuesta, 9 sobre copia de hermana, 2 en los seguidores del plano. Largo p5 6,156 ·
  mediana 6,225 · p95 6,280 · **máx 6,447 m** (antes 6,599: eran las copias fuera de sitio). Ayora 751.

  El recuento cazó un fallo del merge: salían **14 «del plano» con 2 reconstruidos**. La marca por
  tope (`est: f.est||eyS`) pisa la del tracker en la mesa reparada y `segOrig` la leía como
  «reconstruido»: en el 3D las 39 filas con cota repuesta —levantadas, con sus cuatro puntos— iban
  teñidas de naranja como si no se hubieran levantado. Ahora la categoría se lee de `trk.est`, con
  invariante: las mesas «del plano» son exactamente las de los trackers `est`. QA 148 → **149**.

  Y los 99 puntos con la Z en otra referencia, entregados en lista para el cliente (CSV con coma
  decimal): 18.289 puntos en el levantamiento, 18.312 que pide el plano, 23 que faltan (los 3
  trackers), 99 con la Z a +36,6 m (X e Y correctas), 18.190 limpios.

- **2026-09-09 · #626 entra en main: la fusión con el arreglo del bucket, y el CI que se caía por una
  pestaña** — Ignacio: *«mergea cuando esté verde»*. Las cuatro entradas de debajo se fundieron con lo
  que quedaba de la otra rama: el filtro de candidatos del bucket iba contra la x de la **primera** fila
  del cubo y no contra su rango. Son ortogonales —uno decide el lado de la hermana, el otro qué puntos
  entran al cubo— y sobre el reparto por el borde bajaba los puntos sin repartir de 3 a 1; con el borde
  leído en las dos puntas, 0. Los generados de San José no se resolvieron a mano: se regeneraron con la
  cadena entera sobre el reparto fusionado, y `backtracking.html` conserva las dos marcas, `segOrig`
  por mesa y `segEst` por tope. `vigas_sin_enganchar.py`, que quedó pendiente de correr sobre el reparto
  bueno, ya no tiene nada que listar: sus 65 «sin tracker» eran la viga fantasma.

  El CI se puso rojo en `test_bt3d_rot` con el test y `terreno.html` sin cambiar: la primera pestaña
  seguía viva renderizando El Burgo entero en swiftshader mientras la segunda cargaba el mismo HTML, y en
  el runner las dos comparten proceso — en `main` pasaba en 4 min 40 s, al límite. Cerrada la primera
  antes de abrir la segunda: 6 min. Queda dicho que `test_equipos` tarda 40 min en el runner (Ayora sola,
  34) con tope de 45, y 6 en local: un commit a mitad lo cancela y lo reinicia.

  Cifra final en `main`: **2.287 de 2.289** seguidores con sus dos vigas, 0 con una sola, 2
  reconstruidos del plano, 9 copiadas de su hermana, **18.289 de 18.289** puntos. QA 148 · 13 bancos en verde.

- **2026-09-09 · la Z de 99 puntos está mal, y la fila reparada va rígida** — Ignacio: *«para, no
  sustituyas nada, ¿qué quieres decir, que la z está mal?»*. Sí, y se ve en el fichero crudo:
  TR-09_1-044-W tiene la mesa sur a 1531,7–1532,0 y la norte a **1568,7** — 36,7 m de salto en el
  mismo tubo de 74 m, con la viga hermana a 6 m plana a 1532; TR-08_1-001-E entera a 1588,7 con el
  tracker de 12 m al este a 1551. El mismo **+36,6 m** en 99 puntos repartidos por toda la planta,
  dispersión 0,4 m: una cota procesada en otra referencia vertical (la ondulación del geoide en
  Arequipa), no terreno. X e Y intactas.

  Decisión de Ignacio: **dejarlo como está** —marcar, reponer en el modelo, reclamar al topógrafo
  (`reclamacion_sanjose.csv`)— y que **la fila reparada lleve una sola pendiente para sus dos mesas**.
  Con una cota repuesta, el quiebro de la junta ya no es medida (saldría de una punta estimada contra
  la junta medida, que es inventar una articulación): se quita la junta y la fila entra rígida, con la
  pendiente entre sus dos puntas igual para la mesa sur y la norte. 39 filas, 0 con quiebro; en la
  escena, las dos mesas de cada una salen con el mismo tilt.

- **2026-09-09 · lo que no es medida es la COTA, no la viga — y la capa magenta tapaba el origen** —
  Ignacio: *«¿por qué tienes filas no medidas, si tenemos todos los puntos?»*. Tenía razón en la
  pregunta y la etiqueta era mala. De las 52 vigas del filtro, **46 tienen sus cuatro puntos** y se
  dibujan donde el topógrafo las midió: lo que se les repone es la **altura**, porque 99 cotas en 54
  filas vienen en otra referencia vertical (+36,6 m) y como cota son inservibles. Solo 6 vigas
  (3 seguidores) no tienen puntos. Posición y largo: **18.289 de 18.289 puntos, ni una viga inventada**.

  La métrica pasa a llamarse **«Origen de la cota de la viga»** —cotas medidas · una cota repuesta ·
  las dos repuestas · cota copiada de su hermana · sin levantar, geometría del plano— y la casilla
  «Solo cotas no medidas» dice cuántas están además sin sus puntos, **contadas en la nube** (6), no
  sumando categorías (que daba 13: 7 de las 9 copias sí tienen sus puntos).

  Y al cargar `main` en Chromium salió que la capa «cota de otra referencia», encendida por defecto,
  pinta con trazo grueso y **el mismo magenta** que «copiada de su hermana» encima de 46 de las 52
  filas: se veía todo magenta. Coloreando por origen esa capa sobra —el origen ya dice dónde y por
  qué— y no se dibuja. Capturas antes/después en visores#13.

- **2026-09-09 · el borde de la tirada se leía con la viga del vecino: 4 seguidores mal emparejados
  y 2 que faltaban sin saberlo** — Ignacio, sobre el marcado: *«si a algún tracker le falta la hermana
  a otra le sobra»* y *«son 3 trackers enteros los que faltan»*. Las dos cosas eran ciertas y las dos
  apuntaban al mismo sitio.

  Para decidir de qué lado empareja una tirada se cuentan los puntos de la línea de al lado. La
  ventana era la del tracker (`n ± L/2 + 4`), y en la misma línea de x puede haber un tracker
  **«medio»** de 37,6 m cuyo tramo **solapa en n** con el arranque de un «completo» de 74,4: sus
  puntos entraban en la ventana y hacían creer que había viga a ese lado. Con eso el borde se lee al
  revés y **todo el emparejamiento de la tirada se corre un paso**. Lo que distingue a una viga de
  este largo de la intrusa es su **punta norte**, a 37 m de donde estaría la del medio: ahora se
  exige punto en las **dos** puntas.

  | | antes | ahora |
  |---|---|---|
  | vigas emitidas | 4.572 | **4.578** (2.289 × 2, la planta entera) |
  | puntos repartidos | 18.287 | **18.289** (los del topógrafo, todos) |
  | trackers con las dos vigas | 2.284 | **2.287** |
  | seguidores con UNA viga | 4 | **0** |
  | reconstruidos del plano | 3 | **2** |
  | vigas en choque | — | **0** de 4.578 |

  TR-08_2-037 está en el plano a −192,7 y su pareja real es (−192,65 · −186,47), las dos vigas
  medidas de 74,4 m — pero −186,47 se le adjudicaba a 038. Igual con TR-10_1-005, TR-08_1-027 y
  TR-08_1-028. Y los dos reconstruidos que quedan, **TR-09_2-010 y TR-09_2-011**, son los que no se
  levantaron: antes salían con una viga cada uno.

  **Y dos seguidores levantados enteros salían «reconstruidos del plano».** TR-06_1-005 y
  TR-08_1-001 tienen sus ocho puntos, pero sus cuatro puntas vinieron con la otra referencia
  vertical: al perder las dos puntas de las dos vigas se tiraba el seguidor entero —con su posición
  y su largo, que son medida— para rehacerlo del layout. Ahora se conserva la geometría y se
  reponen las dos cotas del terreno vecino, cada punta con la del terreno en **su** n para que la
  pendiente no sea una fila plana supuesta.

  **La marca, por viga.** `inc` era del tracker y no decía cuál de las dos es la copia; ahora cada
  fila lleva `hm`, su `id` de levantamiento, y la escala de origen tiene cinco niveles: medida ·
  una punta repuesta · las dos cotas repuestas (posición y largo medidos) · duplicada de su hermana ·
  reconstruida del plano. San José: **4.526 · 35 · 4 · 9 · 4**. La escena tiñe pala y marco de lo que
  no es medida y el globo dice cuál es cuál; el mapa lo pinta por categoría, con la leyenda contada y
  casilla para aislarlas. Una viga que no se midió no puede parecer una medida. Ayora, cero de las
  cuatro.

  **Y el visor del cliente servía datos de otra época**: `generate_asbuilt.py` escribía en
  `san-jose/js/data_asbuilt.js`, que no lo carga nadie —la página lee `asbuilt/data/sanjose.js`—, así
  que el mapa llevaba desde por la mañana con 4.491 filas mientras el generador decía «OK» sobre el
  fichero muerto. Una sola salida, la de verdad. QA 146 → **148**.

- **2026-09-09 · lo que NO se midió, pintado — y el visor servía un fichero muerto** —
  Ignacio: *«márcame por favor lo de hermanas duplicadas y reconstruidos, que se vea claro cuáles
  son»*. Al ir a pintarlos aparecieron tres cosas peores que la falta de color.

  **1. La copia se colocaba un paso fuera.** `cotas_asbuilt.py` decidía el lado de la hermana
  duplicada comparando con la x del plano y suponiendo que ésa era la viga ESTE — la misma regla
  que ya se demostró falsa en el reparto. Ahora el lado lo dice **el id de la viga que sí se
  midió** (el reparto lo resuelve por el borde del bloque), y x(E) − x(W) es el paso siempre:
  mediana 6,22 m, mín 5,93, máx 6,60 sobre las 2.284 bifilas completas.

  Y es **verificable sin creerse nada**: en 7 de los casos la hermana se descartó por cota
  contaminada, así que el topógrafo SÍ la midió y su x es dato. La copia cae a **0,008–0,067 m**
  de esa viga real, 7 de 7. Antes, a un paso entero de distancia.

  **2. Dos copias iban encima de una viga medida.** En dos bandas un «medio» y un «completo»
  arrancan en la misma n y las dos líneas contiguas ya están ocupadas. Se pone guarda: la copia
  **nunca** se dibuja sobre otra viga, y si no cabe por ningún lado no se dibuja. Dos seguidores
  se quedan con una viga (`n_solo`), que es lo único que se sabe de ellos — y un seguidor de una
  viga **no tiene eje de transmisión**, así que tampoco se le pinta uno. Vigas en choque:
  2 → **0** de 4.576. Los dos invariantes de la batería lo exigen ahora explícitamente en vez de
  dar por hecho que toda planta es de parejas.

  **3. El visor del cliente servía datos de otra época.** `generate_asbuilt.py` escribía en
  `san-jose/js/data_asbuilt.js`, que **no lo carga nadie**: la página es `asbuilt/index.html` y
  lee `asbuilt/data/sanjose.js`. Los dos se separaron y el visor llevaba desde por la mañana
  sirviendo **4.491 filas y 2.287 trackers** mientras el generador decía «OK» sobre el fichero
  muerto. Una sola salida, la de verdad; el fichero huérfano, borrado.

  **El marcado.** Cada viga lleva de dónde sale su geometría: `hm` (copia de su hermana) por VIGA
  —`inc` era del tracker y no decía cuál de las dos—, `est` (reconstruido del plano) y `ye` (una
  punta repuesta). En San José, de 4.576 vigas: **9 duplicadas**, **6 reconstruidas** (3
  seguidores) y **35 con una punta repuesta**; Ayora, cero de las tres. En el 3D se tiñen pala y
  marco y el globo dice cuál es cuál; en el mapa hay categoría «Origen del dato de la viga» con su
  leyenda contada y casilla para aislarlas. Una viga que no se midió no puede parecer una medida.

- **2026-09-09 · el emparejamiento E/W lo decide el BORDE del bloque, no una regla fija** —
  Ignacio, sobre el levantamiento: *«faltan 3 trackers, 24 puntos, no se pudieron tomar»*. Con ese
  dato la aritmética cierra: 4.578 vigas × 4 puntas − 24 = **18.288**, y el fichero del topógrafo
  tiene **18.289**. Lo midió todo salvo esos tres. Así que los 129 huecos y los 535 puntos sin
  repartir **no eran del levantamiento: eran nuestros**.

  **La regla estaba al revés.** «El plano marca la viga ESTE y la hermana va un paso al OESTE» es
  falso en la mayor parte de San José. No se veía porque la medida que la sostenía se hizo sobre la
  **asignación vieja del proveedor**, que ya traía esa convención dentro: circular.

  Y no se puede arbitrar de las dos formas que parecen obvias:

  | criterio | por qué no vale |
  |---|---|
  | por **cota** | dos vigas vecinas sobre el mismo terreno se parecen compartan tubo o no: 0,166 m de desfase con la del oeste contra 0,160 con la del este, 1.125 trackers a favor de una y 1.032 de la otra |
  | **contando puntos** a cada lado | en mitad de un bloque hay puntos a los dos lados, porque las vigas embaldosan cada 6,17 m — ese criterio daba 1.702 trackers al este, ruido puro |

  **Lo único que decide es el borde.** Una tirada de *k* trackers contiguos ocupa 2*k* vigas: con la
  hermana al oeste van de `x_primero−6,17` a `x_ultimo`; con la hermana al este, de `x_primero` a
  `x_ultimo+6,17`. Ocupan lo mismo y sólo se distinguen por las **puntas**, así que se mira si hay
  puntos justo fuera. Sale **ESTE en 82 tiradas (1.618 trackers)** y OESTE en 2 (34).

  **Verificado por cuatro caminos**: a mano en la banda más larga (102 trackers, n = −737,6: cero
  puntos en `x_primero−6,2`, cinco en `x_ultimo+6,2`); la predicción que se deriva se cumple entera
  —si la regla vieja inventa una viga fantasma al oeste de cada bloque, las vigas vacías tienen que
  estar todas ahí: son **57, y las 57 son el primer tracker de su tirada**, ninguna en el interior—;
  la cobertura pasa de 4.489 a **4.574** vigas con ≥3 puntos de 4.578, con las vacías de 60 a **1**;
  y el reparto coloca **18.287 de 18.289** puntos, que es el techo del topógrafo.

  | | antes | ahora |
  |---|---|---|
  | filas del as-built | 4.449 | **4.572** |
  | puntos sin repartir | 535 | **3** |
  | filas con sus 4 puntas | 4.426 | **4.569** (99,9 %) |
  | trackers con una sola viga | 132 | **11** |
  | trackers con cota | 2.285 | **2.286** de 2.289 |
  | reconstruidos del plano | 4 | **3** (los del topógrafo) |
  | en el visor, trackers con una sola viga dibujada | 125 | **4** |

  **El careo mueve el 98,6 % de las filas, pero lo que se mueve es la IDENTIDAD, no la geometría**:
  de las 4.433 vigas físicas que ya estaban, **4.422 salen idénticas al centímetro**; 2.254 cambian
  de lado E↔W en su mismo tracker y 2.116 pasan al de al lado, que es exactamente el corrimiento de
  una viga. La etiqueta dice ahora el lado de verdad: si la hermana va al este, la viga que marca el
  plano es la **oeste** del par, y llamarla `-E` sería mentir en el id — que es justo lo que une la
  ficha de registros TCU.

  **Comprobaciones de emparejamiento, antes de mergear**: 0 vigas con dos dueños · 0 trackers cuyo
  par no incluya la x del plano (de 2.284) · paso entre las dos vigas p5 6,151 · mediana 6,218 ·
  p95 6,371 · cizallado mediana **0,150 m** y p95 0,379, igual que antes del cambio · y de los 38
  trackers con desfase > 1 m, **los 38** tienen una viga con otra referencia vertical ya reclamada,
  ninguno sin explicación. El cizallado es la que más pesa porque es **independiente de la regla del
  borde**: si las vigas estuvieran mal casadas, saldrían desfases grandes sin motivo.

  De paso, el careo de la mesa contaminada llevaba el id `TR-09_1-044-E` a pelo y se caía con el
  renombre (la viga es la misma, ahora `-W`). Ahora busca el caso **por el fenómeno** —una mesa
  entera marcada, de dos puntos, que sea una punta y no la junta, porque si lo contaminado es la
  junta los extremos salen limpios y no hay dilución que medir (pasa en 6 filas)— y exige que el
  salto por fila sea la mitad del salto por punto. Un careo que se cae por un renombre no comprueba
  lo que dice comprobar. QA **146** · producción 35 · producción 3D 31 · relieve APTA · Ayora sin
  cambios.

- **2026-09-09 · una punta contaminada ya no se lleva por delante la fila entera** —
  El careo contra la nube llevaba tiempo diciendo `DISCREPA: 6 reconstruidos tienen nube encima`:
  seis seguidores que se reconstruían del plano —geometría nominal y cota del terreno vecino—
  teniendo **nube sana justo encima**. Se pudieron medir y no se engancharon.

  **Dos causas, las dos reales.** La primera, que `cotas_asbuilt.py` volvía a deducir por CERCANÍA
  qué tracker es cada grupo de filas, cuando el as-built ya trae su id: desde que el reparto lo
  genera el propio repositorio, las 4.449 filas de San José llevan un `tk` que existe en el
  layout. Comprobado que las dos vías no se contradicen —de los 2.287 grupos, las dos coinciden en
  los 2.287— así que no es lo que perdía trackers.

  La segunda sí: **una fila con UN punto de otra referencia vertical se tiraba entera**. Y lo que
  se contamina es la COTA — la X,Y del punto sigue donde el topógrafo la puso. Tirando la fila se
  perdían su posición, su largo y las cotas SANAS que tuviera, y su tracker acababa reconstruido
  del plano con TODO estimado en vez de una sola cota. Medida la población de las 52 filas
  señaladas en San José:

  | | filas |
  |---|---|
  | un extremo malo, centro y otro extremo sanos | **31** |
  | todos los puntos malos | 11 |
  | sólo el centro malo (los dos extremos sanos) | **6** |
  | un extremo malo + algo del centro | 4 |

  **Lo que decide es cuántas PUNTAS se pierden**, porque `zs/zn/ys/yn` salen de ahí. La junta es
  aparte: vale por la articulación, no por los extremos, así que si la toca la contaminación se
  pierde la junta (`nm/ym` a null, `art` a 0), no la fila. Con las dos puntas, la fila sí se cae.

  **De dónde sale la cota que se repone, elegido midiendo.** Prueba de dejar-uno-fuera sobre las
  4.375 filas sanas de cuatro puntos: se tapa la cota de cada punta y se estima con cada fuente
  posible (unos 8.400 casos por fuente) para compararla con la que el topógrafo midió de verdad.

  | fuente | mediana | p95 | máx |
  |---|---|---|---|
  | **la hermana, misma punta** | **0,167 m** | **0,474** | **1,65** |
  | mediana del vecindario | 0,418 m | 1,337 | 2,76 |
  | el propio tubo, extrapolado | 0,446 m | 2,201 | 5,66 |

  La hermana gana por el doble, y no por casualidad: las dos vigas de un bifila comparten tubo.
  Extrapolar el propio tubo desde su junta es lo PEOR de las tres, porque el tubo articula justo
  ahí. Así que: la hermana si tiene esa punta sana, y si no el vecindario; sin ninguna de las dos,
  la fila se cae como antes.

  **Y lo derivado se rehace.** `sl` y `pa` salen de las dos cotas de la fila, así que con la punta
  contaminada valían cualquier cosa. Antes daba igual porque la fila se tiraba entera; ahora se
  queda, y **`sl` = 98,8 % con `pa` = [0,83 · 196,8] habría entrado al modelo tal cual**. Se
  recalculan con la misma fórmula del reparto: el peor `|pa|` de la planta pasa de 196,8 % a
  **11,64 %**, que es un talud de verdad.

  **Nada de esto viaja sin decirlo:** cada fila lleva `ye` — 0 las dos cotas medidas, 1 la sur
  repuesta, 2 la norte, 3 las dos del plano (`est=1`) — y el meta declara `n_ye` y el error acotado
  de cada fuente.

  | | antes | ahora |
  |---|---|---|
  | trackers con cota | 2.279 (99,6 %) | **2.285 (99,8 %)** |
  | reconstruidos del plano | 10 | **4** |
  | reconstruidos con nube sana encima | 6 | **0** |
  | trackers con una sola viga medida | 161 | **132** |
  | filas contaminadas descartadas | 52 | **17** (35 se reparan) |
  | veredicto del careo | DISCREPA | **CUADRA** |

  Ayora no tiene ni un punto contaminado, así que no se mueve. QA 143 → **146**, con el careo
  detector/oráculo actualizado (señalar no es tirar) y dos invariantes nuevos: una fila reparada
  conserva su geometría medida y su punta sana intacta, y **`pa` tiene que salir de las cotas que
  la propia fila emite** — que es exactamente la clase de fallo que se acaba de cazar.

- **2026-09-09 · la fase del reparto se resuelve POR LÍNEA, no tracker a tracker** —
  Con el reparto por nodos ya en marcha quedaban **153 seguidores con una sola viga** y algunos
  dibujados a media longitud: en el visor, las barras no llegaban a sus propios puntos. La causa
  no era que faltara levantamiento. El reparto anclaba cada tracker a su nodo de junta más
  cercano con una **ventana de 5 m**, y **hay líneas cuyos tubos están desplazados** respecto de
  lo que el plano declara para ese tracker. Medido en el bloque norte de San José (x 1162→1206,
  ocho líneas):

  | línea x | nodos (n) |
  |---|---|
  | 1162,17 · 1168,37 · 1174,55 · 1180,74 · **1186,95** | −1089,3 · −1052,1 · −1014,6 · −977,1 … |
  | **1193,15** · 1199,35 · 1205,54 | −1082,3 · −1045,2 · −1007,6 · −970,0 … |

  Las ocho líneas cuadran con las vigas del plano **en X hasta 2 cm** (paso medido 6,20 frente a
  6,174 nominal), así que el emparejamiento E/W es bueno; lo que cambia es **dónde empiezan los
  tubos**: la frontera del subbloque cae en campo entre 1186,95 y 1193,15, y en el plano entre los
  trackers 1180,7 y 1193,1 — **una viga de diferencia**. La viga W del tracker 1193,1 está,
  físicamente, con los tubos del subbloque de al lado, 7,0 m al sur. La ventana de 5 m la tiraba
  entera.

  **Una fila sola no puede decidir su fase**: si le falta su nodo de junta, su nodo más cercano es
  un tope y miente en 18,7 o 37,5 m. El vecindario sí. El desfase se estima ahora por línea y en
  local — la **mediana del desvío nodo-centro de las filas del plano a menos de 150 m sobre esa
  misma línea** — y con él se ancla.

  **Y el semipaso lo da el plano, no la línea.** Un intento previo ajustaba una retícula única por
  línea (paso 37,5) y hundía el resultado a 4.228 filas: San José tiene **98 seguidores «medio»**,
  de 37,2 m, cuyos topes están a 18,6 m del centro y no a 37,2. El tipo declarado ya dice cuánto
  mide cada tubo, así que los topes se buscan **en centro ± L/2 de su propio tipo**.

  **Un tope medido con un solo punto es de los DOS tubos.** Con la fase ya resuelta seguían
  cayéndose 18 filas sanas de 74,4 m: en su tope sólo se había medido un punto y la exclusividad
  se lo daba al primero que pasara, dejando al vecino con 3 puntas y 37 m. Ese punto es la
  **frontera**, o sea el extremo de los dos. Se comparte sólo en ese caso: **1 punto de 17.755**.

  Medido ya **fusionado** con el control de largo por tipo de la otra sesión (los módulos salen del
  tipo del plano y el largo pasa a árbitro: `main` en 4.415 filas):

  | | antes | ahora |
  |---|---|---|
  | filas del as-built | 4.415 | **4.449** |
  | trackers con las dos vigas | 2.128 | **2.162** |
  | trackers con una sola viga | 159 | **125** |
  | trackers con cota | 2.273 (99,3 %) | **2.279 (99,6 %)** |
  | reconstruidos del plano | 16 | **10** |
  | reconstruidos con nube sana encima | 17 | **6** |

  De las 4.415 filas que ya existían **no cambia ninguna** (desvío 0,0000 m en x, zs, zn, ys, yn,
  zm, ym y sl). Y tres que el control de largo tiraba por medir la mitad vuelven enteras:
  `TR-05_2-060-W` de 37,74 m a 74,61, `TR-08_1-094-W` de 37,65 a 75,17 y `TR-10_2-002-W` de 55,93 a
  75,06 — exactamente el «los trackers no llegan a sus extremos» que se veía.

  **Barrido de las cuatro ventanas** (D_MAX 8/12/16, radio 80/150/300 m, TOL_J/TOL_T 4-6/5-6/6-8,
  27 combinaciones): el as-built sale entre **4.444 y 4.460 filas**, un 0,4 % de recorrido, y las
  tres filas que cambian son las mismas en todas. `D_MAX` se deja en **12 y no en 16** —que daría
  8 filas más— porque **18,7 m es media mesa**: por encima de eso un tope puede hacerse pasar por
  junta y envenenar la mediana de la línea, y a 20 m el resultado ya se da la vuelta (4.451). El
  límite se pone dentro de la banda donde el discriminante no puede equivocarse, no donde sale el
  número más alto.

  **Y el visor deja de leer la asignación del proveedor.** `visores/san-jose/tools/generate_asbuilt.py`
  seguía derivando su geometría de `final_v2_labeled.csv` —la misma asignación con 93 trackers
  imposibles que ya estaba auditada—, así que la planta que se miraba en pantalla no era la que
  simulaba el modelo. Ahora los dos leen **el mismo reparto**. En el visor: filas de menos de 60 m
  **310 → 184**, y esas 184 son exactamente los 184 «medio» reales; el p5 del largo pasa de 37,74 m
  a **74,14**. Sube en cambio de 83 a 125 los trackers con una sola viga dibujada, y eso es lo
  honesto: **42 de las 45 filas que desaparecen eran «completo» dibujados a 40 o a 20 m** — media
  viga haciéndose pasar por entera. QA 145 · `careo_cotas_nube` de 17 reconstruidos con nube
  encima a 6. Producción 35 · producción 3D 31 · relieve APTA · release gate OK.

- **2026-09-09 · el reparto del levantamiento de San José, rehecho desde el crudo** —
  Ignacio pasa el **CSV original del topógrafo** (18.289 puntos) y el Excel de asignación que
  generó él. La auditoría (`tools/audita_asignacion.py`) separa las dos cosas: **el dato está
  intacto** —coordenadas y cota copiadas bit a bit, |ΔZ| y |ΔXY| máximos de 0,000000 m, cero
  duplicados, cero inventados— y **el reparto no**: 93 trackers con puntos imposibles, hasta
  **1.575 m de dispersión**, y uno con 44 puntos repartidos un kilómetro en Y con sólo 0,5 m
  en X — una **columna entera de un eje** colgada de un solo tracker. Concentrado en TR-07 (30)
  y TR-08 (32). Una cota mala canta contra sus vecinas; una asignación mala **no canta en
  ningún sitio**, porque la cota es normal: lo que está mal es de quién se dice que es.

  **La geometría no se supone, se mide.** Sobre los trackers cuya asignación vieja sí era sana
  sale muy apretada: fila E en la x del tracker (mediana −0,004 m), fila W a **6,174 m** al
  oeste, centro de fila = n del tracker (−0,038 m), largo **74,43 m**.

  **Y hubo que llegar al reparto POR NODOS.** Tres intentos antes, todos medidos:

  | criterio | filas completas | por qué falla |
  |---|---|---|
  | tracker más cercano | 33 % | un tracker mide 74 m: su centro no es buen juez |
  | centro de fila más cercano | 90 % | las puntas se van a la vecina: 222 filas con 5 puntos y 217 con 3 |
  | cupo de 4 por distancia | 98,7 % | **encoge 17 filas sanas a 38 m**: coge los dos puntos del tope norte y deja fuera el sur |
  | **por nodos** | **99,8 %** | de las 4.143 filas que ya existían, sólo **tres** cambian |

  La clave: los puntos no están sueltos, van en **nodos de dos**, y el tipo de nodo se lee en su
  separación — **junta de ~0,9 m** dentro del tubo, **tope de ~0,2 m** entre tubos. El nodo de
  junta cae en la n declarada del tracker y da la **fase**: sus cuatro puntas son ese par más,
  de cada nodo contiguo, el punto más cercano.

  **Lo que gana la cadena:**

  | | antes | ahora |
  |---|---|---|
  | filas del as-built | 4.145 | **4.421** |
  | trackers con cota | 2.182 (95,3 %) | **2.273 (99,3 %)** |
  | sin medir / reconstruidos del plano | 107 | **16** |
  | reconstruidos con medida real debajo | 198 | **17** |
  | filas contaminadas visibles al modelo | 12 de 54 | **51 de 53** |

  Ese último es el bueno: las filas contaminadas que antes **se caían por el camino** ya no se
  pierden — entran, y el control las descarta con su id. Con eso queda cerrado el «qué queda en
  pie» de la entrada anterior.

  **Cuatro fallos destapados al regenerar, tres míos y uno heredado:** heredaba `tp`/`mods` del
  fichero viejo y les colgaba 32 módulos a los 98 seguidores **«medio»** de 37,5 m (ahora se
  derivan del largo medido invirtiendo la fórmula del nominal: unánime, 32 los «completo» y 16
  los «medio», con p25 = p75 en los cuatro grupos); emitía filas de 18,3 m que son **fragmentos**
  de media mesa, y con ellas los 2 accionamientos que caían en mitad de la mesa en vez de en el
  morro; `cotas_asbuilt.py` aprendía el largo típico de los **no levantados**, y al quedar sólo
  16 los tipos «corto» se quedaban sin largo; y el **sesgo de montaje** restaba el nominal de UN
  tipo a la mediana de TODOS los largos — con dos tipos en planta, un reconstruido salió de
  **111,10 m** para 32 módulos.

  **Lo que NO se inventa.** Los vectores transversales `cse/cso/ase/aso` vienen de una derivación
  que no está en el repositorio: ni la pendiente a la fila de al lado a un vano, ni a dos, ni el
  `so/se` del visor los reproducen (error mediano de 0,2 a 4,8 pp). Se **arrastran** por id de
  fila y las 278 filas recuperadas los llevan a `null`, declarado en el meta. Emitirlos con una
  regla adivinada cambiaría en silencio la ficha de registros TCU, que es lo que se entrega al
  cliente.

  **Un reparto, dos ficheros:** `<planta>_puntos.json` sale del mismo sitio que el as-built. Si
  uno dice que un punto es de una fila y el otro que es de otra, el control de referencia
  vertical condena la fila equivocada.

  Y una que casi se cuela: la **reclamación estaba desfasada** respecto al dato final —se generó
  antes de que el largo mínimo tirara los fragmentos, y dos de las filas contaminadas estaban
  entre ellos—. Es el mismo fallo que llevo toda la sesión persiguiendo en otros: un número que
  se queda atrás y sigue pareciendo un dato. QA 143/143 · GATE OK.

- **2026-09-09 · la puerta de relieve, pasada a la cartera entera: 2 de 11** — y el
  resultado no es una tabla de once veredictos, porque **nueve plantas no tienen una sola
  cota**. Dar un veredicto ahí sería contestar una pregunta que no se ha podido hacer, así
  que `tools/gate_relieve_cartera.mjs` es un **censo** con cuatro escalones, no una nota:

  | escalón | plantas | qué significa |
  |---|---|---|
  | **EVALUADA** | Ayora (APTA, 100 %), San José (APTA CON RESERVAS, 95,3 %) | la puerta se ejecuta de verdad |
  | **NO APLICA** | Dicayagua (5.493 uds) | `FixedMount`: sin seguimiento no hay backtracking que corregir |
  | **SIN LEVANTAMIENTO** | 8 plantas, 2.996 seguidores | no hay cotas de ningún tipo |
  | **SIN CASAR** | ninguna hoy | hay as-built pero falta `cotas_asbuilt.py` |

  **La ironía de Dicayagua:** es la planta con MEJOR relieve de toda la cartera —curvas de
  nivel propias del levantamiento, 3.843 curvas y 359.527 vértices, malla IDW de 10 m— y es
  justo la que no lo necesita, porque es de estructura fija. Pedirle un levantamiento de
  seguidores no tiene sentido.

  **Lo que deliberadamente NO se hace.** Sería fácil rellenar el hueco con el DEM global que
  ya usa `terreno.html` (teselas Terrarium, ~30 m) y sacar once veredictos. Sería **teatro**:
  el vano de estas plantas son 6 m, así que un DEM de 30 m no resuelve la diferencia de cota
  **entre filas contiguas**, que es exactamente la magnitud que decide el backtracking. Daría
  un relieve suave, un «APTA» tranquilizador y una configuración basada en nada. Hay un test
  en la batería que falla si alguna planta sin cotas aparece con veredicto.

  **De propina, un agujero que salió al mirar:** seis plantas (bagnarelli, benante, panbianco,
  paramo, polvorin, tunez) **no declaran vano**, que es la base de toda la geometría de
  backtracking — sin él no hay gcr real ni sombra que calcular. El censo publica la separación
  medida entre seguidores contiguos de la misma banda, pero **no la llama vano**: en Ayora y
  San José, las dos que conocemos, sale exactamente el **doble** (12,00 frente a 6,00; 12,40
  frente a 6,20) porque el seguidor del layout es una **bifila** y lleva dos filas. Cuál es
  bifila y cuál no es dato del proyecto: se confirma, no se adivina — y dividir por dos a
  ciegas habría metido un vano inventado en seis plantas.

  Entregable: `censo_relieve_cartera.csv`, con qué falta exactamente en cada planta y las ocho
  sin levantamiento ordenadas por tamaño (panbianco 1.476 · benante 730 · paramo 396 ·
  elburgo 215 · polvorin 119 · fayon 24 · tunez 19 · bagnarelli 17), que es por donde empieza
  a pagar pedirlo. QA 133.

- **2026-09-08 · la referencia vertical se caza en el PUNTO, y la fila condenada deja de votar** —
  el control de cotas entraba por el as-built, que ya es dato **cocinado**: dos cotas por fila. Ahí un
  cambio de referencia vertical solo se ve a medias, y de ese atajo salieron dos fallos, los dos
  medidos en San José.

  **(1) La media diluye.** Lo que cambia de referencia no es un punto suelto: es una **MESA ENTERA**,
  que es tanto como decir una sesión de campo. `TR-09_1-044-E` tiene la mesa sur a 1531,7 m y la norte
  a 1568,7 — **36,7 m de salto en el mismo tubo**, físicamente imposible; su hermana `-W` tiene las
  cuatro cotas a 1531,x. Como el as-built conserva un extremo de cada mesa, la media de la fila sale a
  mitad de camino (**+18,2 m**) y pasaba el umbral de 3 m **de suerte, no por diseño**. Había dos casos
  justo ahí (`TR-09_1-044-E` +18,20 y `TR-06_2-015-W` +18,61).

  **(2) El filtro se mordía la cola.** `TR-08_1-002-E` es una fila **buena** (cero puntos marcados) y se
  descartaba porque la mediana de su vecindario se apoyaba en **su propia hermana** `TR-08_1-002-W`,
  condenada dos líneas antes. Ese seguidor se quedaba sin medir teniendo una fila válida. Ahora la lista
  de vecinas se reconstruye tras condenar y se purga en cada paso. Resultado neto: **coge una fuga que
  el control por fila no veía** (`TR-08_1-001-E`, cuyo seguidor sí se queda sin medir porque no tiene
  otra fila) y **salva** `TR-08_1-002`.

  **Contra qué se compara cada punto, y por qué así.** Contra sus vecinos **laterales a la misma
  coordenada norte**, no contra una bola de radio fijo. La diferencia no es cosmética: el relieve real
  es **solidario** — un talud aparece igual en todos los seguidores de esa estación y al comparar
  lateralmente se cancela —, mientras que una referencia distinta no lo es. Con la bola de 40 m salían
  **7 falsos positivos** en el borde sur de TR-07, que es un escalón real de ~3,5 m idéntico en 067-073.

  **El umbral no es delicado, y eso se vigila.** En San José el reparto de desvíos deja una **banda
  vacía entre 5 y 20 m**: cualquier umbral de 3 a 20 marca exactamente los mismos **98 puntos en 54
  filas**, +36,55 m de media, σ 0,40 m, **los 98 positivos** — la firma de la ondulación del geoide en
  Arequipa. En Ayora ningún punto pasa de 1,7 m. Hay un test que falla si esa banda se cierra: si algún
  día aparece algo entre 3 y 20 m, no es ni ruido ni geoide y hay que mirarlo antes de tocar nada.

  **De dónde sale el dato.** La nube cruda del visor de as-built (`IMoriana3/visores`): 17.839 puntos
  en San José y 3.069 en Ayora, **con Z absoluta** — 4 por fila en San José (los dos extremos de cada
  una de sus dos mesas de 36,74 m, separadas 0,89 m) y 2 en Ayora, donde la fila es una sola mesa. Se
  importa al repo (`tools/importa_puntos.py` → `<planta>_puntos.json`) para que la cadena no dependa de
  un repositorio externo en ejecución.

  **El entregable: `tools/reclama_referencia.py` → `reclamacion_sanjose.csv`.** 98 puntos con **id de
  punto**, coordenada, cota entregada y cota esperada. Salen **las 54 filas, no las 12** que llegan al
  modelo: las otras 42 se caían antes en la asignación por otros motivos, y que no nos estorben hoy no
  las hace buenas — al topógrafo hay que devolvérselas igual.

  **Lo que NO se mueve.** Ayora regenera **byte a byte igual**: la corrección no la toca, que es la
  comprobación de que no hemos cambiado la planta buena para arreglar la mala. San José mantiene APTA
  CON RESERVAS y sus cifras. QA **111 → 130** (con lo del otro hilo), y el detector del test es una
  **reimplementación independiente** — ventana sobre puntos ordenados por *y*, no cubos en *x* — porque
  la lección del terreno fantasma fue que el oráculo no cazó el fallo por llevar dentro una copia del
  código malo.

  **De paso, una contradicción en pantalla:** con el layout de Ayora retirando tres seguidores hay más
  grupos levantados que trackers, y la resta de censos imprimía «**-3 sin medir**». Se cuenta lo que se
  dice que se cuenta.

  **Y un hallazgo que no es nuestro pero conviene apuntar:** el visor `asbuilt` dibuja cada tubo a **la
  mitad de su largo real** (36,75 m declarados frente a 74,43 m que cubren sus propios puntos y 75,12 m
  de separación entre filas de la misma línea). Es fallo de dibujo, no de dato — la pendiente axial que
  publica sí coincide con la media de sus dos mesas —, pero es justo lo que delata el pantallazo: las
  líneas de puntos caen **fuera** de las barras. Vive en `IMoriana3/visores`, fuera de esta rama.

- **2026-08-27 · la cota del optimal, y el matiz que frena el 12,7 %** — la jerarquía completa de
  Ayora sobre la métrica buena (POA anual, escalera incluida): **A 2673,8 → B +0,08 % → OPT +0,18 %
  → C 3D +0,44 %**. El invariante se cumple (OPT ≥ B; C supera a OPT porque el optimal busca en una
  familia restringida de una sola f). Conclusión ACOTADA: del ~7 % que se lleva la mesa rígida sobre
  terreno que ondula, ni el árbitro que ve la escalera delante recupera más de +0,18 %. **Es
  estructural, no de consigna.**

  **Y el matiz antes de que nadie cite el 12,7 % a un cliente:** la escalera del modelo es el peor
  caso POR DISEÑO DECLARADO — cualquier sombra >10⁻⁶ mata media mesa (con n=2). Una fila de células
  son ~8 % de cuerda, así que los mordiscos de 1-5 % que dominan la ventana de backtracking puede que
  ni disparen el diodo en el módulo real. **El 12,7 % es cota superior.** La mejora candidata:
  `elecLoss` con umbral físico de fila de células — necesita el despiece eléctrico del módulo
  (células a lo largo de la cuerda), que es ficha técnica, no campo.

- **2026-08-27 · FE DE ERRATAS: las cifras «netas» contaban la escalera DOS veces** — y el
  invariante fue quien lo cazó. Al acotar lo accionable con `energy-optimal` salió **−0,38 % por
  debajo de pairwise**, que es imposible por construcción (el veto exacto garantiza ≥). La única
  explicación posible era la métrica: y en efecto, **`poaPlant().plant` ya lleva la escalera de
  diodos dentro** (`beam·(1−se)`), así que la «POA neta» calculada aparte la restaba otra vez.

  **Quedan corregidas:** las ganancias de Ayora son **B +0,08 % y C +0,44 %** (las cifras «netas»
  +0,153 %/+0,852 % publicadas en la entrada de v1.39 y en el PR #568 estaban infladas por el doble
  descuento — la cifra simple YA incluía los diodos, no había una «lectura más favorable» escondida).
  La pérdida por sombra de Ayora se expresa mejor sobre el bruto: **389 kWh/m²·año = 12,7 % del POA
  bruto** (el «14,56 %» era la misma cantidad expresada sobre el neto). La ANATOMÍA de esa pérdida
  (46 % tope de diseño · 53 % mesa rígida sobre terreno que ondula · estructura despreciable) no
  cambia: son proporciones. Los números de San José (+0,17 %/+0,20 %) no estaban afectados.

  La lección es vieja y merece repetirse: **cuando un resultado viola un invariante, el error está
  en la medición, no en el invariante** — y tener el invariante escrito es lo que convirtió un doble
  descuento silencioso en una alarma que sonó a la primera.

- **2026-08-27 · «A por ellos»: los tres pendientes, cerrados en una tarde** — San José evaluable,
  la anatomía completa del 14,56 % de Ayora, y el protocolo de campo. Tres investigaciones que
  merecen quedar contadas enteras, porque en las tres el camino importó tanto como el destino.

  **1 · San José: el 36,6 m era OTRA REFERENCIA VERTICAL, y no hizo falta topógrafo.** La pista
  decisiva estaba en el asbuilt crudo: **8 seguidores cuyas dos filas del mismo tubo difieren
  ~36,6 m** — seis entre 36,59 y 36,70 m, en puntas del parque separadas kilómetros, todas las
  desviaciones positivas. Una constante repetida en sitios sin relación no es terreno ni error de
  campo puntual: es una fila procesada con otra referencia vertical (36,6 m es además la ondulación
  del geoide en Arequipa: huele a cota elipsoidal WGS84 colada entre ortométricas). Antes se probó y
  descartó la hipótesis del cruce de asignación: solo 3 de 16 casaban con cotas de otras líneas, pero
  el trío de x=360/373/385 en cadena llevó al asbuilt, y ahí estaba la firma con los ids del
  proveedor (`TR-06_1-005-E` y compañía), listos para reclamar. **La corrección vive en
  `cotas_asbuilt.py` y es declarada, nunca silenciosa**: bifila con filas a >3 m → se descarta la que
  se aparta de los vecinos y se duplica la hermana (inc=1); fila suelta con el mismo síntoma → el
  seguidor queda SIN MEDIR, porque mejor un hueco declarado que una cota con otra referencia
  duplicada dos veces. Y el vano ancho dejó de ser rechazo — otro umbral afinado equivocándose:
  `pairwise` usa el vano real por pareja, así que un par al doble de vano simula interacción casi
  nula, que es la verdad si en medio hay un vial. **Resultado: APTA CON RESERVAS**, y el primer
  número honesto: **B +0,17 % · C 3D +0,20 %** (POA, 4 días). Saneada, San José es mansa (desnivel
  mediana 1,29°): el «máx 64°» era el dato con otra referencia. Los dos tests que exigían que San
  José FALLARA cumplieron su función —eran el recordatorio de revisar el informe al corregir— y se
  les dio la vuelta: ahora vigilan que la corrección no se deshaga.

  **2 · Ayora: la anatomía del 14,56 %, con CUATRO hipótesis muertas y una que cuadra al decimal.**
  Muertas, cada una con su test: pendientes sin configurar (B no lo recupera); emisores al tope
  (0,09 %); residuo de tangencia del escalón (las sombras son reales: mediana 7-8 % de cuerda en 98
  de 107 filas); y **la torsión axial como culpable — al revés: es PROTECTORA** (mesas rectas
  sombrean 16-30 % contra 5-8 % de las reales, porque dos vecinas que siguen el mismo terreno local
  mantienen su Δz pequeño; de paso, la primera versión del test rectificaba anclando la recta en s=0
  y desplazaba mesas metros — el ancla va en el centro de masas de los tramos). **El mecanismo:** la
  variación del desnivel local A LO LARGO del solape — mediana p5-p95 de Δz(n) dentro de cada
  pareja: **0,27 m** — sobre una mesa RÍGIDA con un solo θ. Sombra esperada ≈ 0,27/(2·2,382·cos 45°)
  = **8,0 % de cuerda**: lo medido. La anatomía final: **6,73 % receptor en tope (diseño) · 0,09 %
  emisor en tope · 0,01 % estructura · 7,74 % mesa rígida sobre terreno que ondula** — irreducible
  por consigna de un solo θ: la mesa no puede doblarse. La única palanca es retraerse de más donde
  la escalera de diodos lo pague (lo que arbitra `energy-optimal`, cuya cota anual quedó corriendo).

  **3 · El protocolo de la prueba de un seguidor** (`tools/protocolo_prueba_pendiente.mjs`) — un
  protocolo que CALCULA, no un documento: elige el seguidor de más pendiente transversal de la NCU
  con volcado de referencia (TCU 26 de NCU12, oeste −6,91 % / este +7,82 %), imprime los cuatro
  registros exactos, predice la firma horaria (separación de **hasta 21,3°** solo en las ventanas de
  backtracking — 213 veces la resolución del registro) y deja escrita la vuelta atrás (cuatro
  ceros; riesgo mecánico nulo: los topes duros no se tocan). Cierra la última suposición sobre el
  firmware: qué hace con 41098-41104 cuando no están a cero. QA 103.

- **2026-08-27 · v1.39.3–v1.39.5 · la tarde en que «no va nada fluido», y las TRES causas** — con una
  presentación delante y la página inusable en el navegador del usuario mientras aquí todo estaba en
  verde. Tres arreglos encadenados, y una lección de diagnóstico que vale más que los tres.

  **v1.39.3 — recálculo por fragmentos.** `computeDay` pasa a ser UN generador con dos caudales: el
  arranque y los tests lo drenan en síncrono (semántica idéntica) y `recompute()` lo drena en
  fragmentos de ~40 ms con `setTimeout(0)` — no `requestAnimationFrame`, que se pausa en pestañas en
  segundo plano. Mientras se cocina el DAY nuevo, el VIEJO sigue vivo: la página responde con los
  datos de antes, el testigo dice «calculando… N %», y si llega otro cambio a mitad un token invalida
  la pasada — el último gana, como en un editor. Y la cota exacta `gMax` del terreno: el terreno
  fantasma de v1.39 actuaba por accidente de salida rápida del marchador de rayos; al quitarlo, el
  caso común pasó a ser «caminar el rayo entero (160 pasos) para concluir que no choca». El suelo
  nunca supera la cota medida más alta, así que el rayo se corta ahí — corte exacto, no heurística,
  y el oráculo de podas lo confirma.

  **v1.39.4 — el 3D renderizaba en bucle SIEMPRE.** `loop3D` renderizaba la escena entera en cada
  frame, incondicionalmente: 854 mesas con sombras PCF suaves y antialias, sesenta veces por segundo,
  aunque nadie tocara nada. En una gráfica integrada eso arrastra la página COMPLETA — menús,
  teclado, todo. Llevaba así desde v1.2. Ahora renderiza bajo demanda (`R3_DIRTY`): medido, de ~90
  renders/1,5 s en reposo a 4 y silencio. Y blindaje del recálculo: si algo revienta a mitad, el
  error se enseña EN PANTALLA en vez de dejar «calculando…» girando para siempre — que es
  indistinguible de un cuelgue y no se puede diagnosticar por teléfono.

  **v1.39.5 — la causa de verdad, y la encontró el usuario.** «Pon que de base no cargue la
  configuración que tiene ahora de topografía, por probar.» La página guardaba TODO el estado en
  `localStorage` y lo restauraba al abrir — incluida una implantación de 80 filas y los
  OPTIMIZADORES ENCENDIDOS si así quedó la última sesión. El primer cálculo del arranque es síncrono
  (aún no hay DAY), así que la página se congelaba decenas de segundos antes de poder tocar nada:
  «falla en la base, no me deja ni simular». E invisible para el diagnóstico, porque dependía del
  navegador de CADA uno — a quien probaba en limpio le iba bien. Ahora el arranque parte SIEMPRE de
  la implantación por defecto y las políticas de fábrica; sólo se restauran las preferencias ligeras
  (emplazamiento, fecha, atmósfera). `?limpio` en la URL borra el estado guardado. Verificado
  envenenando el localStorage a propósito con ese mismo escenario: arranque en 1,2 s hasta en el
  banco (~20× más lento que un portátil).

  **La lección, para la próxima vez:** cuando «aquí verde, allí roto», la diferencia suele ser el
  ESTADO PERSISTIDO del cliente — el banco de pruebas nace limpio y el navegador del usuario arrastra
  meses. Tres arreglos reales pero secundarios se hicieron persiguiendo un síntoma cuya causa era un
  `localStorage` envenenado; la hipótesis correcta la trajo el usuario. QA 102.

- **2026-08-27 · v1.39** — **el contador se inventaba TERRENO donde no había mesa que lo midiera.**
  Sale de perseguir una pregunta del cliente —«¿sobre qué estás midiendo, cuál es la base?»— hasta
  el fondo. Al desglosar la pérdida por sombra apareció que Ayora tenía **sombra de terreno con el sol
  a 44°**, en un bloque con **0,61 % de pendiente**. Con el sol a 44° el rayo sube 97 cm por metro y
  ese terreno sube 0,6 cm: es geométricamente imposible.

  **El fallo.** Cuando el marchador de rayos preguntaba la cota del suelo en un punto, `cot(fila,
  norte)` se pegaba al extremo del tramo más cercano **si esa fila no tenía mesa en esa coordenada
  norte**. En Ayora ese tramo llegaba a estar **a 376 m**, y con inclinación N-S real eso son metros
  de cota inventada:

  ```
  en norte −543,4 m:
    fila 34  tiene tramo ahí        →  cota  6,60 m   (real)
    fila 33  su tramo está a 376 m  →  cota 15,99 m   (fabricada)
    gzOf interpola                  →  «suelo» a 10,30 m
  ```

  El suelo salía **5,7 m por encima del módulo del que partía el rayo** y `terrBlocked` lo daba por
  bloqueado. Pasa en toda planta con las filas escalonadas en norte, que son casi todas.

  **El arreglo.** `cotD` devuelve también a qué distancia de un tramo REAL está la consulta, y `gzOf`
  sólo deja votar a las filas que de verdad miden ese norte (tolerancia 5 m). Si ninguna lo mide, **no
  se inventa suelo**: devuelve −∞ y el rayo pasa. La cota de los PLANOS no cambia — ahí el norte cae
  dentro del tramo por construcción.

  **Efecto medido** (Ayora, 21-mar, true3d): el aporte del terreno a la sombra pasa de **+2,05 pp a
  +0,003 pp**, y la sombra media del día de **3,81 % a 1,77 %**. **Estaba inflada 2,2×.**

  **Por qué el oráculo no lo cazó: porque llevaba SU PROPIA COPIA del mismo `cot`.** Un oráculo que
  duplica el defecto no puede detectarlo. Ésa es la lección que se lleva la casa, y no es de este bug:
  es de cómo se escriben los oráculos. Arreglado también en la batería, escrito aparte — lo que tiene
  que coincidir es el RESULTADO, no el código. Los dos vuelven a casar.

  **Y la base, contestada como debía haberse contestado desde el principio.** El titular era «+0,05 %»
  sobre POA, que es la lectura menos favorable de las disponibles. Sobre **POA de planta 2 676
  kWh/m²·año** (12 días tipo ponderados por días del mes) y **neta tras la escalera de diodos 2 286**:
  escribir las pendientes vale **+0,153 %** y calcular en la NCU **+0,852 %** — se triplica y se dobla,
  porque el escalón de subcadena amplifica toda mejora de sombra. Los porcentajes apenas se movieron
  con el arreglo del terreno (el fantasma afectaba a las tres configuraciones por igual y se cancelaba
  en la división); lo que estaba mal era el absoluto. **Y ninguna de las dos cifras es energía**: son
  irradiancia efectiva de plano, les falta rendimiento de módulo y BOS.

- **2026-08-27 · v1.39 · el volcado real de una NCU entera** — `tools/cruce_ncu_dia.mjs`. NCU12 de
  Ayora, 7-ago-2026, 50 seguidores, **409 234 muestras a 10 s**. Cierra la objeción que llevaba
  semanas abierta: *«¿podemos sacar pendientes para una política que no podemos simular?»*.

  **(a) La TCU SÍ hace backtracking**: de 17:30 a 19:00 UTC la bandera se levanta y el objetivo se
  aplana 55 → 30,8 → 18,7 → 9,2 → 0,9, apartándose del astronómico, que se quedaría clavado en el tope.
  **(b) Pero lo hace PLANO**: apertura p95−p5 entre seguidores **0,08°**, y el modelo con los 50 TCU
  llevando la misma plantilla predice **0,000° exacto** (con las pendientes configuradas predeciría
  6-13°). **(c) El vano sí está bien**: ajustando cuál explica los ángulos sale **6,00 m**, el medido.
  **(d) La política que explica la planta es `pairwise` con pendientes a cero, a 0,59°** de desviación
  mediana en los 25 instantes que discriminan, ganando por 1,82° a la siguiente.

  **Tres errores propios, los tres cazados y con prueba:**
  · **Un «desfase de reloj de 4 minutos» que era MI BINNING.** La rejilla se quedaba con la última
  muestra del tramo, así que lo que el informe llamaba «12:00» era el dato de las 12:04:50. Ese
  desplazamiento se disfrazaba de física —1,15° de sesgo constante, parecidísimo a la convergencia de
  meridianos de Ayora (1,161°), o sea con una explicación física plausible esperando a que la
  adoptara—. Leyendo al instante exacto el residuo cae a **0,034° RMS** y no queda desfase ninguno.
  · **El veredicto promediaba sobre TODAS las horas**, y con sol alto las cuatro políticas mandan el
  mismo ángulo: la diferencia quedaba enterrada. Es el mismo vicio que el informe lleva advirtiendo
  desde el primer volcado, aplicado a sí mismo. Ahora sólo votan los instantes con abanico ≥ 1°.
  · **El veredicto de dispersión era una RAZÓN a secas.** Con 6 seguidores salía ×9 y declaraba
  «backtracking COORDINADO» en una planta que reparte el mismo ángulo a todos — una conclusión FALSA
  sobre la planta. El registro se cuantiza a 0,1°: una razón entre dos números en el suelo de
  resolución no dice nada. Ahora hay suelo absoluto de 1°.

  **Y una lección que costó un susto:** la mañana del 7-ago los seguidores apuntaban al tope OESTE con
  el sol saliendo por el ESTE, tres horas. Parecía un defecto de control grave. El log de eventos dice
  que era `admin` desde la interfaz web: posición de seguridad 7 a las 06:28, posición 1 a las 07:23,
  liberada a las 07:47. Mantenimiento. **Una herramienta que juzga el comportamiento de una planta sin
  leer su log de eventos acaba culpando a la planta de lo que hizo una persona.** Ahora lo lee, lo
  publica, y si el volcado no trae log lo DICE en vez de callárselo.

- **2026-08-27 · v1.39 · la página moría EN BLANCO si `sol.js` no llegaba** — «no me deja entrar al
  html, no carga», y era una pantalla en blanco sin un solo mensaje. El fichero estaba bien (rama y
  `main` cargan las dos limpias, 288 pasos, cero errores; Pages desplegando en verde) y resultó ser
  caché del navegador. Pero **un visor que se queda mudo cuando le falta una dependencia no se puede
  diagnosticar desde el otro lado del teléfono**, y eso sí es nuestro: desde que el sol salió a
  `sol.js` la página tiene una dependencia externa. Ahora sale un aviso con la causa y los tres pasos
  (recarga forzando caché · abrir `sol.js` a pelo para ver si da 404 · servir por HTTP si se abrió con
  `file://`).

  **Y una sutileza de JavaScript que merece quedar escrita: el primer aviso SE MATABA A SÍ MISMO.**
  Usaba `typeof VER` para mostrar la versión, y `const VER` vive en el ámbito léxico global: la
  ligadura existe desde antes de ejecutarse el script. Si ese script muere antes de inicializarla
  —que es EXACTAMENTE el caso que el aviso cubre— la variable queda en zona muerta temporal y **hasta
  `typeof` lanza ReferenceError**. El guard reventaba justo en el escenario para el que se escribió.
  Ahora lee `VER` dentro de un `try`. De paso, `backtracking.html` pedía `sol.js?v=0.1.0` y
  `overcast.html` `?v=0.2.0` siendo el mismo fichero: alineadas, con test que falla si divergen. QA 98.

- **2026-08-26 · v1.38** — **la FICHA que se escribe en la TCU, por fin cargable en el simulador.**
  Tercera posición del mando: *«La FICHA que se escribe en la TCU (por seguidor, vecina crítica)»*.
  Cierra la incoherencia de v1.37 — se entregaban números que nunca habían entrado en el simulador —
  y de paso corrige una etiqueta que mentía: *«según levantamiento»* prometía la ficha y entregaba la
  pendiente que la página deduce **por pareja de líneas**; ahora se llama por su nombre.

  **El emparejamiento era lo difícil, y es donde estaba el riesgo.** Son **dos rejillas distintas**:
  la ficha agrupa con tolerancia `pitch/4` sobre **trackers** (221 líneas en Ayora) y
  `plantFromCotas` con `pitch/2` sobre **filas** (295); y los marcos de x tampoco coinciden — la
  ficha va de −1238 a +1238 m y el simulador de 0 a 477, recentrado al bloque cargado. **Emparejar
  por índice habría repetido exactamente el fallo que costó 157 consignas mal dirigidas.** Se
  empareja por la **x MEDIDA**, y para eso `plantFromCotas` devuelve ahora `lineXAbs`, la x sin
  recentrar: una magnitud física que las dos partes calculan igual y que no depende de qué bloque se
  cargue.

  **El signo no se supone: se DETERMINA, y tiene que ganar con margen** — la misma regla que el huso
  horario en `cruce_diagnostico`. Medido sobre las 107 líneas de Ayora, el hueco entre la línea *i* y
  la *i+1*: `+oeste(i+1)` acierta el **92 %** (error mediano 0,32°) · `−este(i)` el 84 % (0,31°) ·
  `+este(i)` el 16 % · `−oeste(i+1)` el 8 %. La elección no está reñida. Se usa el oeste y el este
  queda de reserva cuando falta. Hay comprobación que **falla si el acuerdo baja del 85 %**: si la
  ficha cambiara de convenio hay que volver a decidirlo, no seguir dibujando pendientes al revés.

  **Cobertura declarada, no supuesta.** En Ayora casan **66 de 80 líneas** por x, y con la reserva
  del este se cubren las **79 parejas**. Las que no casan **se quedan con la pendiente de las cotas** y
  se cuentan en la nota de la planta: rellenarlas con cero sería fabricar un llano donde sólo falta un
  dato. Si la planta no tiene ficha publicada, la opción sale **deshabilitada** y la nota lo dice.

  **El resultado, que confirma que son dos cosas distintas:** la ficha da |pendiente| mediana
  **0,72°** contra **0,50°** de las cotas — la vecina crítica es por definición la peor. Hay
  comprobación que falla si saliera la MISMA, porque eso significaría que no se cargó o que se está
  leyendo la columna equivocada.

  **Y dos comprobaciones REPARADAS, que es lo que más conviene recordar.** Buscar el cuerpo de una
  función «hasta el siguiente `function`» ha fallado **dos veces**: primero se tragaba `terrain()`
  entera y saltaba por un `pitch:` que no era suyo, y luego el comentario de `aplicaFicha`. Ahora hay
  un `cuerpoFn()` que cuenta llaves. Y la de v1.33 fijaba el **texto vecino** de `avisoCaras` en vez
  de la propiedad, así que fallaba cada vez que se insertaba otro aviso — ruido, no regresión: ahora
  comprueba que el aviso acabe dentro de la nota, que es lo que importa. **Un test que analiza el
  trozo equivocado del fichero no protege nada.** QA 86.

- **2026-08-26 · v1.37** — **el simulador ya enseña la planta COMO ESTÁ CONFIGURADA, no solo como
  debería estar.** Hasta ahora la página ofrecía `pairwise` —que usa las pendientes medidas, o sea la
  planta *bien* configurada— y `bt2d`, que es otra política distinta; no había forma de ver lo que de
  verdad hace un seguidor con los registros a cero. Mando nuevo **«Configuración de la TCU»** con dos
  posiciones: *según levantamiento* (41098/41100 y 41102/41104 con la pendiente medida) y *sin
  configurar* (registros de fábrica, 0) — que es el estado real de Ayora.

  **La distinción que lo hace correcto: el terreno NO cambia con este mando.** `terrain()` sigue
  devolviendo la geometría real y es la que ve el contador de sombra; `terrainTCU()` solo falsea la
  *creencia* con la que el seguidor calcula su ángulo. Si el contador usara la creencia, con el
  registro a cero la sombra desaparecería por arte de magia — y sería un simulador que demuestra que
  no configurar es gratis. Cableado en los **cuatro** sitios que calculan ángulo (el día, la tabla
  anual y los dos caminos de instante del slider): si el arrastre entre pasos de malla usara otra
  creencia, saltaría entre dos políticas a mitad de gesto. `terrainTCU` no hace trigonometría, es un
  DATO para la misma física, igual que `careoTerreno`.

  **UNA INCOHERENCIA DESTAPADA POR IÑAKI, y que sigue abierta.** «¿Podemos sacar las pendientes para
  evitar sombras con una política que no podemos simular?» La respuesta honesta es que había **dos
  reglas distintas y no las habíamos cruzado nunca**: la ficha del levantamiento da la pendiente **por
  seguidor a su VECINA CRÍTICA** (a veces la hermana del mismo accionamiento, a menos distancia — el
  fichero lo trae explícito en `este_vecina_critica`/`oeste_vecina_critica` y `n_candidatas`),
  mientras que nuestro `pairwise` empareja **líneas geométricas** promediando el solape norte. Medido:
  difieren **~1,8× en la mediana** (1,76 % contra 0,98 %; p95 4,79 contra 3,59; máx 8,80 contra 5,53).
  No es que una esté mal —la crítica es por definición la peor, tiene que salir mayor—, y la prueba de
  que las dos describen la misma planta es que **la longitudinal coincide exacta: 1,48° las dos**. Pero
  significa que `export_config_tcu.mjs` **entregaba números que nunca habían entrado en nuestro
  simulador**: validábamos con unos y enviábamos otros.

  **Metidos por fin, y el resultado tranquiliza a medias:** con las pendientes de la ficha sale
  **+0,112 %** y con las nuestras **+0,118 %** (mismo día, misma política, contador sobre la geometría
  real). Con pendientes que difieren un 80 %, el resultado se mueve seis milésimas de punto — así que
  **cuál de los dos juegos se escriba no es el riesgo**.

  **Lo que SÍ sigue sin verificar** es qué hace el firmware con ellos. La única comprobación de campo
  fue a mediodía, y el propio informe declara que a mediodía **ninguna política se distingue de otra**.
  Que la TCU haga un backtracking tipo `pairwise` es una suposición nuestra, no una medida. Se cierra
  con dos pruebas baratas y en este orden: **(1)** un volcado con **sol bajo** ahora, con los registros
  a cero, que discrimina la política *base* —cuándo entra en backtracking, cómo usa el vano, cómo se
  comporta en el tope— sin tocar nada; **(2)** escribir los registros en **UN** seguidor y leer su
  `Objetivo`, que aísla el término de pendiente. Hasta que pasen las dos, la ficha es una propuesta
  bien fundada, **no un entregable verificado**, y así debe decirlo el documento de cliente.
  Pendiente: tercera posición del mando, «según la ficha (vecina crítica)». QA 84.

- **2026-08-26 · AYORA, DIAGNÓSTICO CON IMPORTE** — confirmado en planta que **Ayora no tiene
  configurada ninguna pendiente ni ningún azimut**. Eso la sitúa en la columna «sin configurar» de
  todas las tablas y convierte el ejercicio en un diagnóstico con precio. El precio es incómodo y por
  eso conviene tenerlo escrito.

  **Careo A→B con la base correcta** (misma política, lo único que cambia es el contenido del
  registro; el careo anterior usaba `bt2d` de referencia, que ya se estableció que es otra política):
  21-mar 7,477 → 7,476 (**−0,01 %**) · 21-jun 11,030 → 11,053 (**+0,21 %**) · 21-sep 7,433 → 7,432
  (**−0,00 %**) · 21-dic 2,978 → 2,972 (**−0,19 %**) · **media 7,229 → 7,233 = +0,05 %**. Frente a
  eso, el 3D completo da **+0,48 %**.

  **Escribir las pendientes en las 754 TCU de Ayora no merece la pena**: cinco centésimas de punto,
  dentro del ruido de cualquier medida de campo, y negativo en tres de los cuatro días de referencia.
  La razón es la planta, no el método — con 0,56° de desnivel mediano entre filas contiguas no hay
  relieve que corregir. El valor está en el 3D, y **el 3D no se consigue escribiendo registros: pide
  NCU**, que es lo que El Burgo tiene y Ayora no. Decirlo tiene un coste comercial evidente y es la
  única versión que aguanta que el cliente mire su curva de producción dentro de un año.

  **`tools/sensib_azimut.mjs` — la otra mitad de la pregunta, cerrada.** Los planos van en UTM y **el
  norte de la cuadrícula UTM no es el norte verdadero**: la diferencia es la convergencia de
  meridianos, γ = atan(tan(λ−λ₀)·sin φ). En Ayora (EPSG:25830, huso 30N, meridiano central −3°) vale
  **1,161°**, y como los 754 seguidores llevan `rot = 0` están replanteados paralelos a la cuadrícula,
  así que su azimut verdadero es ese y la TCU tiene 0. **Medido lo que cuesta no saberlo:** 0,000° →
  +0,000 % (control del método, exacto) · **1,161° → −0,025 %** · 3° → −0,090 % · 5° → −0,183 %. **No
  importa**, y por tanto **no compensa mandar a nadie a comprobar el replanteo con GPS**. Un resultado
  negativo medido vale tanto como uno positivo: éste ahorra el viaje.

  **Y una explicación cómoda que era falsa.** Se escribió primero que el error «entra por un coseno,
  así que va con el cuadrado del desvío». Lo desmiente la propia tabla que tenía encima: de 1° a 5° la
  pérdida se multiplica por **7,6**, no por 25 — exponente ≈1,26, **casi lineal**. Es pequeño por una
  razón más simple: un grado sobre un eje que barre ±55° perturba la geometría un 2 %. La versión
  cuadrática llegó a colarse en el documento de cliente **contradiciendo la tabla de arriba**, que es
  justo el tipo de contradicción en pantalla que la casa considera un fallo. Corregida en la
  herramienta y en el documento.

- **2026-08-26 · v1.36 · herramientas** — **`tools/careo_sombra.mjs`: la pregunta que el cliente hace
  ANTES que los kWh.** «¿Mi planta se hace sombra, y de quién es la culpa?» no se contesta con un
  porcentaje de energía. Se contesta hora a hora y separando dos cosas que en una gráfica parecen la
  misma: la **sombra EVITABLE** —la que desaparece si la TCU lleva configurada la pendiente real de su
  vecina, y es la que justifica la intervención— y la **sombra INEVITABLE** —la que queda con el
  seguidor ya contra su tope mecánico, que no la quita ninguna configuración porque sale del binomio
  vano/límite de giro, o sea del diseño de la planta—. Prometer «cero sombras» es falso en cualquier
  planta con topes finitos; lo que sí se sostiene es la **VENTANA LIMPIA**: el intervalo sin sombra en
  **ningún** seguidor (el peor de los 754, no la media).

  **El error que estuvo aquí y se deja escrito.** La primera versión usaba `bt2d` como configuración
  «sin configurar». Está mal: `bt2d` **no es «pairwise con pendiente 0»**, es otra política (un ángulo
  para toda la planta con el vano medio, sin el mínimo por pareja). Al medir política y registro a la
  vez, el 21-dic salía que **configurar el levantamiento EMPEORA la sombra** —14,15 % contra 12,88 %—,
  que es lo contrario de la verdad y lo que habría ido a una propuesta de cliente. Comparando lo
  comparable —misma política, registro a cero contra registro medido— sale **14,31 % → 14,15 %**: la
  configuración mejora. La regla que queda es que **una comparación tiene que aislar UNA variable**, y
  hay comprobación que falla si alguien vuelve a cambiar dos. Por el camino quedó descartada la
  hipótesis de signo invertido en la pendiente: negarla **mejora por la mañana y empeora por la
  tarde**, que es precisamente la firma de un signo CORRECTO.

  **La ponderación por irradiancia, sin la cual el número engaña.** La media temporal da el mismo peso
  al 84 % de sombra de las 21:30 que al mediodía, y a esa hora la DNI son 1,2 W/m². Sin ponderar,
  Ayora «tiene» un 6 % de sombra; ponderada, un 2,2 %. Las dos cifras son correctas y **sólo la segunda
  tiene que ver con los kWh** — es la que reconcilia la sombra con el +0,50 % de energía.

  **Ayora, sombra ponderada (sin configurar → configurada → 3D) y ventana limpia:** 21-mar 3,38 → 3,23
  → 2,85 (13:00–14:30) · 21-jun 2,28 → 2,20 → 2,40 (11:50–16:25) · 21-sep 3,36 → 3,21 → 2,84
  (12:45–14:15) · 21-dic 5,52 → 5,40 → 3,43 (13:15–14:00). **Configurar el registro aporta 0,08–0,15
  puntos**: real y pequeño. **El 3D aporta bastante más** —más de dos puntos en diciembre— pero **no se
  consigue escribiendo registros: pide NCU**, y Ayora hoy no tiene esa arquitectura. Y la ventana
  limpia es estrecha fuera del verano: hora y media en los equinoccios, tres cuartos en diciembre —
  hecho del diseño (vano 6 m, tope ±55°), no defecto de operación. QA 81.

- **2026-08-26 · v1.36** — **el control de entrada del relieve, y un cero que mentía al ocaso.**
  Dos cosas, y las dos salen de intentar contestar a un cliente.

  **a) `tools/valida_relieve.mjs` — la puerta antes del número.** El careo 3D-contra-2D compara dos
  formas de apuntar sobre LA MISMA geometría; si la geometría está mal, la comparación sigue saliendo,
  con un número perfectamente formateado y perfectamente falso. San José lo destapó: su bloque 0 daba
  **−0,08 % de «ganancia»** sobre una geometría que contiene **tres líneas hundidas 4,8 m, 12,2 m y
  12,5 m respecto a SUS DOS VECINAS a la vez**. Una fila de seguidores en un pozo de 12 m de hondo y
  6 m de ancho no existe: es un error de cota. Ahora la planta pasa un control con veredicto
  **APTA / APTA CON RESERVAS / NO EVALUABLE**, y en NO EVALUABLE **no se emite ganancia**
  (`process.exit(1)`, sirve de gate en CI).

  **Lo que se aprendió equivocándose, y por eso queda escrito:** la primera versión rechazaba por
  «pendiente entre líneas > 20°, imposible de montar». Está mal, y era el error caro: la inclinación
  que limita el fabricante es la del **eje** (N-S, de montaje — 3,6° máx en Ayora, 2,7° en San José:
  sanas las dos), mientras que el desnivel entre **líneas contiguas** es justamente la geometría que
  el backtracking necesita conocer, y **un bancal lo produce legítimamente**. En San José las líneas
  7 y 36 bajan 2 m y **se quedan abajo**: eso es terreno real. Rechazar por el valor del salto era
  rechazar precisamente las plantas donde corregir el relieve más vale la pena. El control que de
  verdad decide es **la línea aislada**: una que se separa de sus dos vecinas a la vez, baja y vuelve
  a subir, más de medio vano. Eso no es ladera ni bancal. Umbral atado al hardware: no cabe entre
  ellas, la cuerda del seguidor son 2,38 m. Los otros controles son cobertura del levantamiento
  (< 95 % → reserva), eje de montaje (8,5° reserva / 11,3° rechazo), vano contra el pitch declarado
  (fuera de [0,75 · 1,25]·pitch reserva, > 1,5·pitch rechazo: ahí hay un vial, no una fila vecina) y
  solape norte. Cinco comprobaciones nuevas en la batería, **con cotas sintéticas** — es la única
  forma de probar que el control distingue un bancal de una línea suelta: el bancal que baja y se
  queda tiene que salir APTA, y esa comprobación es la que impide repetir el error de arriba.

  **b) La sombra al ocaso era CERO, con la planta tapada entera.** `shadeRows` devolvía un array de
  ceros en toda la banda `zen ≥ 89,5°` porque el ray-cast 3D deja de ser fiable ahí. Pero devolver
  cero no es decir «no lo sé»: es **afirmar que no hay sombra**, justo cuando a 0,35° de sol la
  sombra de una fila mide 6/tan(0,35°) ≈ 980 m. En la tabla de consignas de Ayora del 21-jun salía
  como un salto de **76,6 % a 0,00 % en un paso de 10 min**. Ahora se **clava al borde de validez**
  (`zen = 89,5°`) en vez de inventar un cero: conserva qué fila tapa a cuál, mantiene sin sombra las
  5 filas del borde por donde entra el sol, y la serie sale monótona — 58 → 67 → 77 → **87 %**, y
  cero solo cuando el sol se pone de verdad. La energía en juego está acotada por la DNI de ese tramo
  (**1,2 W/m²**): el careo de Ayora no se mueve ni en el tercer decimal. No se arregló por la
  energía, se arregló porque **la tabla publicaba un número falso**. Regresión en la batería que
  exige monotonía en la última media hora.

  **Y el resultado honesto de Ayora, ya sobre geometría validada: +0,50 %** (media de 4 días
  representativos, POA de planta, contador 3D con estructura, IAM b₀=0,05, paso 5 min, limitado por
  actuador) — 21-mar +0,70 %, 21-jun +0,16 %, 21-sep +0,68 %, 21-dic +0,80 %. **No es el 2,66 % que
  se venía citando**: aquel salía del preset de demostración de 9 % de pendiente, no de Ayora. Ayora
  es suave (|pendiente| entre líneas: mediana 0,56°, p95 2,06°, máx 3,17°) y la ganancia va con el
  relieve. La consecuencia comercial es que **la propuesta no es un porcentaje, es una medición**.
  La tabla del 21-jun (754 seguidores × 178 pasos = 134 212 filas) se valida sola contra la firma de
  los dos regímenes: **apertura p95−p5 de 0,10° de media en seguimiento puro y 7,99° en backtracking
  — ×77**, con los topes mecánicos de ±55° saliendo donde tienen que salir (09:00–09:30 y 18:30–19:00).
  QA 78.

- **2026-08-26 · v1.35** — **las consignas iban al seguidor equivocado en 157 de 748, y el primer
  volcado real lo destapó.** El id del layout **no codifica la NCU** —`TK 045-06` tiene `ncu=9`— y su
  número **no reinicia en 1** en todas ellas (en Ayora, NCU9 va de 45 a 85, NCU10 de 66 a 105). El
  nº de TCU que entiende la planta es el **rango del seguidor dentro de su NCU**. `export_consignas`
  lo tomaba del número del id: con Ayora eso apareja mal **157 de 748** seguidores repartidos en cinco
  NCUs, y **una consigna con el TCU equivocado no es una consigna inútil, es la consigna de OTRO
  seguidor**. En un exportador que existe precisamente para mandar ángulos a una planta. Corregido y
  verificado contra el volcado: **16 de 16 NCUs con todas sus consignas, cero huérfanos**; guard que
  exige que dentro de cada NCU los TCU sean 1..n sin huecos ni repeticiones.
  **Dos «pendientes» que el volcado permite tachar**: el **signo** queda confirmado —**θ<0 = ESTE**,
  o sea que la columna que casa con `Objetivo` es `theta_tcu_deg`—; y **la arquitectura importa**, lo
  que ahora está escrito en la cabecera del exportador. Hay **dos**, y cada una tiene su entregable:
  si la inteligencia vive en la **TCU**, lo que hace falta es la **ficha de registros**
  (41098/41100/41102/41104 y los vanos); si vive en la **NCU**, lo que hace falta es la **tabla de
  consignas**. El Burgo es el segundo caso, y por eso su plantilla de TCU lleva `slope = 0`: la TCU no
  calcula nada. Confundirlas no es un matiz — escribir pendientes en una planta que no las usa no hace
  nada, y mandar consignas a una que las calcula sola, tampoco.
  **Y una página nueva, `telemetria.html`**, para contestar sin depender de nadie la pregunta que
  llevaba días abierta: **¿esta planta corrige el relieve o manda un ángulo único?** Lee la tabla
  `telemetria` de Supabase —donde `importar-logs.html` deja los CSV diarios de las NCU, con `series =
  {t, v:{angle, target_angle, …}}`— y mide **cuánto se abren entre sí los objetivos** a lo largo del
  día. **No compara contra ningún modelo**, así que no necesita levantamiento: vale para El Burgo,
  que no tiene cotas en el repo. Tres decisiones que la hacen fiable: la apertura es **p95 − p5** y no
  máx − mín (un solo seguidor en tope falsearía el máximo todos los días, y siempre hay alguno); los
  que están en **posición segura** se excluyen; y el remuestreo a malla común **descarta** la muestra
  que cae a más de media malla en vez de arrastrar un valor viejo —los logs de TCU pierden ~7% del día
  en decenas de huecos de radio, y rellenarlos en silencio **inventaría apertura donde no la hay**—.
  Probada en Chromium **en las dos direcciones**, con una planta de ángulo único y otra que abre:
  una página probada solo con el caso bueno no distinguiría nada. QA 72 + 8 de la página.

- **2026-08-26 · v1.34** — **el primer cruce contra la planta REAL, y la cadena valida.** Volcado de
  Ayora (782 filas: 751 seguidores + 16 NCU + 5 repetidores + 10 HSU) cruzado contra las consignas del
  simulador con `tools/cruce_diagnostico.mjs`. Quedan cerradas tres cosas que llevaban semanas
  declaradas como pendientes de una lectura: el **huso** es **UTC+2** (mediana 0,33° frente a 17° con
  +1 y 33° con UTC; el tool lo deduce y **exige que gane con holgura**, si no aborta y pide `--huso`),
  el **convenio de signos** y la **identidad**.
  **Medido: 743 seguidores en seguimiento, mediana −0,33°, p95 0,46°, máximo 0,55°, cero atípicos.**
  Eso valida de extremo a extremo identidad → línea → geometría del levantamiento → posición solar →
  convenio.
  **Lo que un volcado de mediodía NO puede hacer, y el informe lo dice en cada ejecución**: discriminar
  la política. A 60° de elevación no hay sombra y astro, bt2d, pairwise y bt3d dan lo mismo —
  separación **0,000°**. Es el **control**, no la prueba, y se avisa para que nadie lo cite al revés.
  De ahí salió la **firma de dispersión**, que sí es binaria y no necesita interpretar medianas: con
  eje N-S el astronómico manda **el mismo ángulo a toda la planta** a cualquier hora, y el bt3d **abre**
  porque cada pareja tiene su pendiente. Medido sobre Ayora: **0,41° de apertura a mediodía y 11,66° al
  ocaso**. Basta contar cuántos ángulos distintos manda la planta.
  **NCU7 queda SIN VERIFICAR** —layout 25 seguidores, diagnóstico 22, con un hueco en el TCU 14—: el
  rango deja de ser fiable tras el hueco, y con sol alto un desfase de una línea ni se nota. Se marca
  en vez de darlo por bueno.
  **Hallazgo de mantenimiento, no de modelo:** 6 seguidores en posición segura por `SoC insuficiente
  (L3)`, **cinco mudos entre 4,5 y 14,4 días**; el peor, `NCU1/TCU62`, parado en el **tope contrario**
  al que se le pide. Comprobación cruzada con un segundo volcado ocho días anterior: las fechas de
  caída **cuadran** (6,4+8 = 14,4 días, 1,7+8 = 9,7…), o sea que llevan muertos desde antes y nadie
  los ha tocado. Y ahí salió un fallo de clasificación del propio tool: filtrar por `Modo` antes que
  por batería escondía el peor caso en «no-AUTO». QA 71.
  **Un sesgo que sigue sin explicar, y se dice:** −0,33° en un volcado y −1,24° en otro. Ni ángulo
  constante (varía ×3,8) ni retraso de reloj constante (1,22 vs 4,73 min, con velocidades de giro casi
  idénticas). Descartado el tiempo de barrido con la edad de cada lectura (0–14 s). Hipótesis viva:
  que la TCU recalcule `Objetivo` **a escalones** de T minutos, lo que da un retraso uniforme en [0,T]
  según dónde caiga el volcado; con dos muestras solo se acota **T ≥ 4,7 min**. Es falsable.

- **2026-08-26 · v1.33** — **arranque en 0,9 s, la ficha de configuración por seguidor, y el 41106.**
  Reportado que el simulador cargaba lento con planta real. Medido, día completo a paso de 5 min: a 80
  líneas los dos **optimizadores** se llevan **1,6 s + 3,0 s de los 5,5 s** —el **84%**— y `optfree`
  escala **peor que lineal** (×13 cuando las filas van ×10). Y son justo los dos que la página ya marca
  como **asesoría**. Al cargar planta real se apagan **y la nota dice cuáles y por qué**: apagarlos en
  silencio habría sido peor que la lentitud. Un testigo evita repetirlo. El **gate** pasa a declarar su
  precondición —reenciende las dos que valida— en vez de heredar el default de la pantalla.
  **`tools/export_config_tcu.mjs`**: la ficha de qué lleva cada TCU, con su registro. Y aquí la lección
  fue **mirar antes de construir**: la configuración por TCU del levantamiento **ya existía publicada**
  en `modbus.html` (`config_tcu_sunner_<planta>.csv`), con lo difícil dentro —la vecina crítica y el
  vector de pendiente con su azimut—. Lo que faltaba no era calcularla, era **poder usarla**: viene en
  su orden, con identidad de zona («HD-1»), sin los vanos y sin decir a qué registro va cada número. El
  tool **une**, sin recalcular ni una pendiente, por la terna medida —**754 de 754 sin un empate**, y si
  deja de ser unívoca **aborta**—. Autocomprobación: `|transv| = |vector·cos(az−90°)|` en las **1.508
  parejas**, peor desvío **0,0068 pp**, lo que confirma **medido** que el par (vector, azimut) es lo que
  piden 41098/41100. **Hallazgo:** San José **no casa con su propio levantamiento** (pendiente máxima
  25,0% en el fichero publicado, 49,6% en las cotas): el exportador aborta y lo dice.
  **El 41106** aparecía en radianes mientras su gemelo 41033 va en metros. Comprobado contra la
  extracción del documento de fabricante: **el volcado es fiel, la errata es de origen**, y se ve la
  causa — hereda unidad, defecto y rango **idénticos** a los del 41102, cuatro direcciones más arriba.
  Ya estaba **resuelto en campo** sin que hiciera falta pedirlo: la TCU Toolbox lo tenía anotado con la
  lectura real (**Ayora lee 6**, y su levantamiento mide **6,002 m**). La unidad pasa a `m (doc: rad,
  errata)`: dice lo que el equipo usa **y** lo que el documento afirma. Y al añadir esa curación salió
  un **fallo latente** del generador: `CURADO` se consultaba **ciego al dispositivo**, y como los tres
  mapas comparten rangos, la entrada de la TCU pisó el `meters/second` de la HSU. Nunca había mordido
  porque las dos curaciones existentes eran de la NCU. QA 70.

- **2026-08-21 · v1.32** — **el CAREO: el clásico deja de ser una degradación a la que se cae y
  pasa a ser una comparación que se enseña.** El simulador ya traía los dos modelos —`bt2d`
  («ignora el relieve: un tracker sin configurar») y `true3d`— pero solo se podían mirar de uno en
  uno. La casilla **CAREO** los enfrenta **sobre el mismo corte, el mismo día y el mismo seguidor**:
  enciende las dos políticas, apaga el resto (con cinco curvas encima no se lee), pinta **los dos
  fantasmas en el corte 2D** —bt3d sólido, clásico a trazos, cada uno con su sombra— y saca una
  **cajita en formato captura** con el Δ del día. Apagada, la página se comporta **exactamente**
  igual que antes. Tres presets de un clic (**pendiente 9 %, vaguada 2 m, cresta 2 m**) para
  demostrar sin dibujar a mano.
  **Ni una fórmula nueva en JS**: verificado que el diff no toca **ni un hunk** dentro del bloque
  `FÍSICA PURA`. La integral del día se **re-derivó** del `dayKpis` de la v1.31 en vez de parchear la
  extracción vieja, así el careo hereda gratis la banda del circunsolar, la sombra ponderada por DNI
  y el Martinez con y sin estructura — una maquinaria, dos puntos de entrada.
  **Medido** (pendiente 9 %, 21-jun, 8 filas, monofila; reproducido contra el motor antes de
  publicarlo): bt3d **11,256** · clásico **10,964** · libro **11,340** kWh/m²·d, o sea **+2,66 %**
  [+2,37 … +2,97] a favor del bt3d. Con el circunsolar sin tapar esto daba +1,62 %: **el clásico
  pierde más ahora porque su sombra también se come el circunsolar**, que es la v1.31 pagando
  intereses.
  **Y la casilla «+ modelo de libro»** (apagada por defecto) **descompone** la diferencia contra lo
  que asumiría una simulación de fila infinita y terreno plano: **+0,00 % axial · −3,32 % relieve ·
  +2,57 % control**, con **denominador común declarado** (el kWh del libro) para que la suma **cierre
  por construcción** y no quede resto sin atribuir. De ahí sale la frase de oferta:
  *«el terreno os cuesta 3,3 puntos; nuestro control recupera 2,6»*.
  Detalle que conviene decir en vez de esconder: el término axial sale **exactamente 0,00 %** porque
  con una mesa por línea y filas largas la implantación real y la fila infinita ven la misma sombra;
  despertará en plantas con tramos cortos o escalonados.
  El «libro» **no es una tercera curva**: el mando de `bt2d` no mira el relieve, así que su θ(t) es
  idéntica y pintarla sería una raya sobre otra — lo que cambia es **dónde se mide**, y por eso vive
  en los números. La banda de la cajita usa **la misma convención que la tabla del día** (misma cota
  arriba y abajo, ámbar si cruza el cero): un careo que afirmara en seco lo que la tabla matiza tres
  centímetros más abajo sería una incoherencia de interfaz. Comprobado que en **llano** las tres
  evaluaciones convergen: **Δ = 0,00 %**, banda **[0,00 … 0,00]**. QA 67 y gate en verde.

- **2026-08-21 · v1.31.1** — **el veto exacto vale a TODAS las horas, no solo con sol bajo.**
  Regresión de la v1.31 cazada por el barrido de invariantes (14.256 comprobaciones de
  política-instante): en **pendiente 8° · monofila · 21-jun** el energy-optimal salía **0,47 % por
  DEBAJO de pairwise**, imposible porque f=0 **es** pairwise y está en su propia rejilla. En la v1.30
  el mismo caso daba +0,21 %, así que era regresión y no deuda vieja.
  La causa es **un comentario que nadie volvió a leer**: el veto estaba limitado a `zen>65` porque
  «con sol alto no hay sombra para ninguna f y más beam siempre gana». Ese argumento **murió dos
  veces** sin que nadie lo revisara — la v1.28 metió la **estructura** de la mesa, que sombrea a
  todas horas, y la v1.31 hizo que esa sombra cueste también **circunsolar**. El evaluador rápido de
  la búsqueda sigue siendo ciego a las dos cosas, así que con sol alto elegía f>0 creyendo que salía
  gratis. Ahora el veto se evalúa **siempre**, y solo contra los extremos que no son el candidato: 2
  evaluaciones exactas extra, 3 si la f ganadora es interior. Medido tras el arreglo: óptimo
  **+0,186 %** y libre **+0,232 %** sobre pairwise. Batería 64 (la regresión concreta reproducida
  día completo, y un estático que veta que el cenit vuelva a condicionar el veto), y el barrido
  completo relanzado **sin hallazgos**.
  **Y el mismo hallazgo se portó al core** (`SolarGPTfull` v1.64.0): allí `POA_Global` sumaba la
  difusa entera con el mismo razonamiento, así que los informes bancables con sombreado entre filas
  iban optimistas **+0,906 %** en el caso con sombra y **0,000 %** sin ella —un sesgo asimétrico, que
  es lo peligroso—. La validación contra PVSyst en Fleming lo confirma desde fuera: la capa
  **GlobEff pasa de −0,7 % a ≈0,0 %** anual, mes a mes (julio −1,0 % → −0,2 %, agosto −1,1 % →
  −0,3 %), al dar al circunsolar el **IAM del haz** en vez del integrado de bóveda. PVSyst lo reparte
  igual: no es ajuste, es coincidir con la referencia.

- **2026-08-20 · v1.31** — **la difusa también la tapa la sombra, y el IAM existe: con la óptica
  completa GANA EL BACKTRACKING.** La v1.30 arregló el parámetro eléctrico; quedaba el otro lado de
  la comparación, la irradiancia. Faltaban dos términos, y van en sentidos opuestos:
  **(1) el circunsolar entraba ENTERO.** En Perez 1990 el circunsolar es una fuente **puntual en la
  posición del sol** —por eso su POA se calcula con el mismo `cos AOI` del haz—, así que **la sombra
  que tapa el haz lo tapa a él**. Hasta la v1.30 se sumaba sin tocar: energía regalada justo en las
  horas de backtracking, que es donde el circunsolar más pesa y donde se decide todo. No era una
  elección de modelo, era una incoherencia interna. Ahora se tapa **en proporción al área sombreada**
  (óptica pura: sin la amplificación de subcadena, que es electricidad).
  **(2) faltaba el IAM, y este juega EN CONTRA del backtracking.** ASHRAE `1 − b₀·(1/cos AOI − 1)`
  con b₀=0,05 al haz y al circunsolar, y ángulos equivalentes de Duffie-Beckman a la isótropa y al
  albedo. El astronómico apunta al sol (AOI≈0, el vidrio transmite casi todo) y el backtracking se
  gira **deliberadamente fuera**, así que trabaja oblicuo y refleja más: es el **único sesgo conocido
  que empuja hacia astro**, y entra igual. Cuesta −1,65% del POA anual de Ayora, que es transmisión
  que el vidrio nunca dio y le estábamos apuntando al BT.
  **La respuesta, en banda y no en número** (`tools/banda_astro_bt.mjs`, Ayora 12 días, astro frente
  a pairwise; − = gana el backtracking):

  | n | b₀ | circunsolar tapado (v1.31) | pesimista (subcadena muerta) | SIN tapar (≤v1.30) |
  |---|----|---------------------------|------------------------------|--------------------|
  | 1 | 0    | −2,972% | −3,590% | −1,541% |
  | 1 | 0,05 | −2,807% | −3,461% | −1,352% |
  | **2** | 0    | −1,248% | −1,549% | **+0,110%** |
  | **2** | **0,05** | **−1,005%** | −1,321% | +0,376% |
  | 3 | 0    | −0,917% | −1,129% | +0,421% |
  | 3 | 0,05 | −0,653% | −0,875% | +0,707% |

  **Toda la banda del modelo tiene el mismo signo: −3,59% … −0,65%, gana el backtracking.** En Ayora,
  con la n ya conocida (mesa 1V en retrato, n=2): **−1,55% … −1,01%**. El único punto donde astro
  ganaba era el circunsolar sin tapar — y esa columna **no es un valor plausible del parámetro, es la
  ausencia del término**. Comprobación que lo cierra: la celda n=2 · b₀=0 · «sin tapar» da **2705,5
  kWh/m²·año y +0,110%**, que es **exactamente** el anual publicado en la v1.30 — el techo de la
  banda ES el modelo viejo, al decimal. Publicado hoy (n=2, b₀=0,05): pairwise **2650,4 kWh/m²·año**,
  astro **−1,005%**.
  **Y la tabla del día publica la banda, no solo el número**: cada Δ vs pairwise lleva entre
  corchetes `[cota baja … cota alta]`, y si la banda **cruza el cero** sale en **ámbar** — el
  simulador dice «no lo decido» en vez de fingir un ganador con dos decimales.
  **Lo que sigue fuera, y por tanto qué falta para cerrarlo sin asteriscos**: el **cono real de ~25°**
  del circunsolar (Perez lo trata puntual; resolverlo suavizaría el bloqueo, y con ese techo la banda
  sí cruzaría el cero), el **factor de vista** de bóveda bloqueada por la fila de delante, el
  **mismatch entre módulos en serie** del mismo string, los **puntos calientes y la garantía**, y que
  todo esto es **cielo claro**. Los dos que más pesan de esa lista —mismatch y puntos calientes—
  penalizan **a quien deja sombra**, o sea a astro: el signo es robusto, el margen no. QA 62 y gate
  de pre-release en verde.

- **2026-08-20 · v1.30** — **«pero si fuese así nadie haría backtracking, todo el mundo
  astronómico, ¿no?»** — y la objeción tenía razón: había un fallo de modelado. La v1.29.2 dio por
  bueno que astro ganase a pairwise sin preguntarse por qué entonces la industria entera hace lo
  contrario. El culpable es un solo parámetro del Martinez escalonado, que estaba **mal
  interpretado**: el campo se llamaba «Diodos bypass» y valía **3** —el número de diodos de un
  módulo típico—, pero lo que el modelo necesita **no es cuántos diodos tiene el módulo**, sino
  **cuántas subcadenas atraviesa la sombra al subir por la cuerda**, y eso depende de **cómo esté
  montado**:
  · **tumbado** → las subcadenas se apilan cruzando la cuerda y la sombra las mata de una en una: n=3;
  · **retrato de media célula** → las dos mitades van en paralelo, la de abajo muere y la de arriba
  sigue: n=2;
  · **retrato de célula entera** → las tres corren A LO LARGO de la cuerda, la sombra las cruza a la
  vez y se lleva el módulo entero: n=1.
  **Ayora es 1V en RETRATO** (módulo de 2,384 m sobre la cuerda, 1,303 de ancho, tipos 1V14/1V21/
  1V28): estábamos aplicando geometría de módulo TUMBADO a una planta en retrato. Y ese parámetro
  **decide el signo** de la comparación —medido, astro frente a pairwise, junio / diciembre—:
  n=3 → **+0,40% / +4,93%**; n=2 → **+0,10% / +3,32%**; n=1 → **−1,76% / −2,80%**, es decir **gana
  el backtracking**. Con la geometría correcta el mundo vuelve a tener sentido: cuanto más «de
  golpe» se lleva la sombra el módulo, más cara sale y más paga esquivarla. Hecho: defecto **3 → 2**,
  campo renombrado a **«Subcadenas en la cuerda»** con el tooltip explicando los tres montajes, y el
  comentario de `elecLoss` reescrito para que nadie vuelva a leerlo como «diodos». Anual de Ayora
  recalculado con n=2 (12 días, contador honesto bidireccional): **pairwise 2705,5 kWh/m²·año** (ref)
  · astro **+0,11%** · óptimo **+0,61%** · libre **+0,82%** — el margen de astro se encoge de un
  0,4-4,9% estacional a un 0,11% anual, y los óptimos siguen mandando. QA 54.
  **Lo que sigue sin estar, y por tanto lo que este número aún no puede decidir**: el modelo es **por
  módulo**, y una planta real pone módulos **en serie** dentro de un string —el mismatch entre
  módulos desiguales del mismo string no está modelado, y penaliza a quien deja sombra—; no hay
  **puntos calientes ni garantía** (parte de por qué se hace backtracking es no freír células, no
  solo kWh); es **cielo claro**; y a sol bajo la difusa circunsolar del modelo es **optimista**,
  justo en las horas donde se decide todo. Conclusión honesta: el simulador **todavía no cierra**
  «astro vs BT» —lo acota, y ya avisa en pantalla de que el signo cuelga de este parámetro—; cerrarlo
  es trabajo del módulo energético.

- **2026-08-20 · v1.29.2** — **«¿astronómico mejor que pairwise?»**, y la respuesta trajo un fallo.
  Que astro gane a pairwise es CORRECTO: la descomposición hora a hora enseña que de 09:00 a 18:00
  las dos son **idénticas** —con sol alto no hace falta backtracking— y que toda la diferencia sale
  de **las horas de BT**, donde astro capta más beam y más difusa circunsolar de lo que paga en
  sombra. Y es **robusto al modelo eléctrico**, que es la parte provisional y justo la más sensible
  a este resultado: gana en las tres cotas del sándwich (solo área +1,29% · publicado +0,40% ·
  banda uniforme +0,86% en junio; +7,8/+4,9/+4,3% en diciembre). Pero el mismo barrido destapó lo
  que sí era un fallo: **el energy-optimal salía 0,3% por DEBAJO de astro en diciembre**, imposible
  porque **f=1 ES astro** y está en su rejilla — la misma clase de error que el veto de v1.29
  arregló contra pairwise, por el otro extremo (el evaluador de búsqueda es 2.5D y ciego a la
  estructura). El veto exacto pasa a comparar contra **los dos extremos** de la rejilla, así que el
  óptimo no puede quedar por debajo de ninguno bajo el contador publicado (diciembre: óptimo +4,95%
  ≥ astro +4,93%). Invariante `óptimo ≥ max(pairwise, astro)` añadido a la batería y al barrido de
  auditoría. QA 54.

- **2026-08-20 · v1.29** — **KPIs que distinguen políticas + UNA fuente para la cara colectora**
  (reportado con captura: las nueve políticas mostraban «sombra máx 100%» y los mismos minutos).
  Verificado que era real y no un artefacto de la v1.28: con terreno roto la columna calculada
  SOLO con planos también da 99–100%, porque en terreno roto siempre hay un minuto de sol bajo con
  una fila entera tapada; el máximo de una fila respondía a «¿hay terreno roto?», no a «¿qué
  política gestiona mejor la sombra?». Sustituidas por: **sombra media de planta ponderada por la
  DNI** del instante (dice cuánta sombra te comes DONDE HAY ENERGÍA) y **minutos con sombra media
  >1%**; y la pérdida Martinez se desglosa entre paréntesis con **la parte estructural** —la que
  ninguna consigna evita— aprovechando que el contador ya sabe separar planos de hierro
  (`out.pl`, cuesta una segunda unión de intervalos sobre los mismos datos). En Ayora las columnas
  ya separan: pairwise 2,48% vs óptimos 4,56–4,75%; en llano, 0 minutos vs 160.
  **Y la auditoría encontró lo gordo**: la v1.28 metió la cara colectora (0,17 m) A FUEGO en el
  contador 3D mientras el corte 2D, el rayo crítico, el vano y `shadeFracPair` seguían usando el
  campo «Offset sup–eje», que valía **0** — dos verdades para el mismo número, con el visor del
  vano midiendo el haz desde 17 cm más abajo (a sol rasante, metros de error). Unificado: el campo
  pasa a llamarse **«cara sup–eje»** con el valor real 0,17 (de `seguidor.js`: 0,14 de cara sobre
  el tubo + medio canto) y **el contador 3D lo lee de ahí** (`T.z0`); si lo cambias, cambian todos.
  Comprobado que el invariante de planos sigue dando **0,000% exacto** con la cara a 0,17 (llano,
  pendiente uniforme y ondulado). Corregidos también los textos que ya no eran ciertos («pairwise
  garantiza sombra cero» → cero **entre planos**; la estructura deja residuo). Nuevo
  `tools/audit_sweep.mjs`: barrido de invariantes (θ, sombra∈[0,1], planos≤total, Martinez≥óptica,
  POA=media por fila, acoplado bifila, slew, óptimo≥pairwise, libre≥óptimo, degeneraciones) sobre
  10 configuraciones × 9 políticas × días de invierno/verano/equinoccio. Rendimiento medido:
  el contador con estructura cuesta ×1,4–1,9 respecto a v1.27 (poda exacta de cajas que quedan
  detrás del plano receptor, unión hoisted y salto de la segunda unión cuando no hay estructura).
  **Y el barrido cazó un segundo fallo**: el energy-optimal rendía MENOS que pairwise bajo el
  contador exacto en llano (23239,9 vs 23302,7 el 21-jun) — el evaluador de búsqueda es 2.5D y
  devuelve cero sombra por encima de zen 87, así que elegía f=1 creyendo que salía gratis. Veto
  con el contador exacto acotado al sol bajo (donde el rápido es ciego): optimal ≥ pairwise por
  construcción, el mismo arreglo que la v1.27 hizo para el óptimo libre y que a `anglesOptimal`
  se le quedó pendiente. Anual: óptimo +0,54% · libre +0,66%. Resultado del barrido tras los
  arreglos: **9.720 comprobaciones de política-instante, sin hallazgos**; y el barrido de interfaz
  (6 plantas, 9 políticas, slider minutal, rayo, POV del sol) sin errores de consola ni hallazgos,
  con la QA de la página en 24/24. QA 53.

- **2026-08-20 · v1.28** — **la ESTRUCTURA de la mesa entra en la física**. Reportado con captura
  («¿por qué sigo viendo alguna sombra?») y resuelto midiendo, no opinando: clasificados por
  raycast los 4.361 píxeles oscuros del render — **83,5% suelo** (lo que el propio visor del vano
  mide: «haz 3,11 m = 52% del vano»), **8% módulos al sol con incidencia rasante** (coseno
  0,03–0,15: negros por Lambert, no sombreados), 0,9% silueta roja y un **0,2% realmente ocluido
  sin rojo**. Desde el POV del sol, **cero de 4.361**: el teorema aguantaba. Y el residuo no era
  desfase de la silueta — render y física coinciden EXACTAMENTE (desfase X y axial 0, cota
  constante con desviación 0) — sino **modelo**: la física ponía el plano del módulo pasando por el
  eje del tubo, 14 cm por debajo de donde está, y con sol a 0,65° eso desplaza la sombra 12 m.
  Ahora la mesa se modela como es, con las cotas de `seguidor.js` (no inventadas): **cara colectora
  en el vidrio** (0,17 m sobre el eje), **laminado de 6 cm** y **viga de torsión cuadrada de 120
  mm**, los dos como EMISORES; el intervalo de cuerda que tapa una caja convexa se resuelve en
  cerrado (`boxChordIv`), igual de exacto que la cuerda analítica, y la silueta proyecta las mismas
  cajas. **El resultado tiene fondo**: como el backtracking se calcula con PLANOS (pvlib), viga y
  canto dejan un residuo que ninguna consigna cancela — **−0,60% anual en Ayora** (pairwise 2743,6
  kWh/m²·año) y hasta un tercio de cuerda con sol rasante en pendiente; en llano la viga no alcanza
  nunca a la vecina (está por debajo de la cara que recibe). El modelo de planos sigue dando CERO
  exacto (opción `noStruct`), que es como se enuncian ahora los invariantes del core. Anual: true-3D
  +0,12% · row −0,05% · óptimo +0,53% · óptimo libre +0,66%. Verificación: los dos oráculos
  replican el modelo por vías independientes (la viga por sección de la caja con el plano de los
  rayos) y coinciden en **0,000 pp sobre las 107 filas**; `boxChordIv` validado contra barrido fino
  en 4.000 configuraciones (peor desviación 0,76 mm); y un test nuevo compara las cotas del contador
  **contra `seguidor.js`** para que no diverjan en silencio. QA 49, gate en verde (el rojo pintado
  sube de 1.327 a 1.649 px). Declarados fuera: correas, cables, TCU, motor y seccionador — piezas
  cortas que además no proyectan en el render.

- **2026-08-14 · v1.27** — **auditoría, puntos 4 y 2 — la auditoría queda CERRADA (6/6)**.
  **Punto 4 (torsión)**: la reparación iterada se midió (+0,0003%) y no se adopta; el hallazgo real
  era otro — bajo el contador exacto el óptimo libre rendía MENOS que el común (2783,2 vs 2783,5:
  ganaba en la métrica rápida ciega, perdía en la publicada). Arreglo: **elección exacta por
  instante** (el libre evalúa con el ray-cast su resultado y el del común y se queda el mejor) —
  libre ≥ común POR CONSTRUCCIÓN. Anual: libre 2785,2 (+0,90%) ≥ óptimo 2783,5 (+0,84%). **Punto 2
  (hipótesis eléctrica)**: acotada y declarada — granularidad estación≈módulo validada por la
  convergencia MV (9,3 m→1,2 m: +0,007%); sándwich medido en el año: solo área 2806,0 (cota
  inferior) · publicado 2760,3 (−1,63% de amplificación eléctrica, al 20% del recorrido) · banda
  uniforme 2582,0 (−7,98%, el modelo del −8% espurio retirado en v1.19); nota declarativa en la
  página (strings axiales, bypass ideal, MPPT sin mismatch; pendiente: validación IV/SCADA).
  Tests: libre ≥ común exacto en 2 regímenes · elec ≥ óptica por fila. QA 47, gate en verde.

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
