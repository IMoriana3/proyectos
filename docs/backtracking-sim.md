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

En terreno **uniforme** global = row = pairwise exactamente (degeneración del core, testeada).

## Convenciones de signos (las trampas de siempre)

- **θ > 0 ⇒ borde derecho de la escena ABAJO** (pvlib right-handed; con eje a azimut 0, positivo = mañana/Este).
- **Pendiente transversal positiva = el terreno CAE hacia la derecha de la escena** (convención pvlib de
  `cross_axis_tilt`; idéntica a `_bt3d_pair_max_magnitude`: `z_derecha = z_izquierda − pitch·tan(β)`).
- La escena es el plano ⊥ eje: **+x = azimut del eje + 90°** (con eje N-S a 0°, la derecha es el Este).
  El rótulo de las esquinas lo dice siempre.
- Cotas por fila ↔ pendientes por pareja: `pairsFromElev`/`elevFromPairs`, ida y vuelta exacta (testeado).
- El **GCR es derivado** (= ancho/pitch), campo de solo lectura — regla del core (§03.T0): no es un input.

## Terreno

Presets (llano · pendiente constante · ondulado · valle · cresta · aleatorio con semilla reproducible,
mulberry32) **y edición directa: arrastra el poste de cualquier fila** en la escena. Las pendientes se
recalculan al vuelo y se acotan a ±30° (más no lo monta ningún tracker). El tilt N-S del eje es global
(input aparte) y es lo que activa la ventaja del true-3D.

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

## QA — 17 comprobaciones, dos superficies

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
- Martinez: escalones exactos, umbral anti-polvo, saturación
- Ineichen en rango (mediodía verano España), noche a cero, GHI ≡ DNI·cosZ + DHI
- Perez: β=0 devuelve exactamente la DHI
- cotas ↔ pendientes ida y vuelta exacta · NOAA vs declinación del solsticio · noche → θ=0
- POA de planta = media por fila (no POA del ángulo medio)
- estáticos: página offline de verdad; defaults = canónicos del core (6.00 · 2.382 · 0.397 · 55°)

## Integraciones

- **Plantas de la cartera**: el selector lee `factiun_plantas` de localStorage (el mismo seed que
  `cartera-tabla.html`), con el fallback de coordenadas de `sim-solar.html`.
- La configuración (geometría + terreno + políticas) **persiste** en localStorage (`bt_sim_cfg_v1`).

## Pendiente / ideas

- Botón «cargar pendientes de la planta» desde `config_tcu_sunner_*.csv` (Ayora/San José ya llevan
  pendiente E/O por tracker en este repo).
- Política `min_ground_light` (agrivoltaica) — está en el core, no portada.
- Export CSV de θ(t) por política para alimentar la TCU Toolbox.

## Historial

- **2026-08-13 · v1.0** — primera versión: 6 políticas, terreno editable, escena + curvas + tablas,
  QA 17/17 en Node y navegador, envolvente de mercado en la tabla anual.
