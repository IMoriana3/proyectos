# Justificación óptico-física del método de simulación de backtracking

*Simulador de Backtracking v1.5.1 (`backtracking.html`, cobertura-zigbee) — espejo del motor BT3D de
SolarGPT (`tracker3d.py`). 2026-08-13.*

Este documento justifica la validez física del método capa a capa: **qué se resuelve de forma exacta
y por qué, qué se aproxima y con qué cota**, y qué validación numérica lo respalda. Convención: λ es
longitud de onda; ŝ el vector solar unitario; θ el giro del tracker; f_s la fracción sombreada.

---

## 1. Régimen de validez: óptica geométrica

Radiación solar de banda ancha (λ ≈ 0,3–4 µm) frente a geometrías métricas. El número de Fresnel para
una apertura característica a ≈ 1 m a distancia z ≈ 10 m es N_F = a²/(λz) ≈ 10⁵ ≫ 1: la difracción es
despreciable a todos los efectos y la propagación es por rayos. La fuente es térmica e incoherente
(longitud de coherencia ~µm): no hay efectos de interferencia. **El problema de oclusión es
estrictamente de óptica geométrica.**

## 2. La fuente

- **Rayos paralelos**: a 1 UA, la divergencia angular entre dos puntos de una planta de 1 km es
  < 10⁻⁸ rad. La aproximación de fuente direccional es exacta a efectos numéricos.
- **Fuente extensa (penumbra)** — la única aproximación óptica genuina del modelo: el disco solar
  subtiende 0,533° (9,3 mrad). El borde de sombra real no es un escalón sino una rampa de anchura
  w_p = L·9,3 mrad, con L el recorrido emisor→receptor. Para pitch 6 m, L ≈ 6–12 m ⇒ w_p ≈ 56–112 mm
  frente a un colector de 2.382 mm: la fracción sombreada instantánea tiene un difuminado máximo del
  2,3–4,7 % **solo durante la transición**. El modelo usa el escalón centrado en el centro del disco:
  el flujo se sobrecuenta en media penumbra y se infracuenta en la otra media, así que el error
  energético es de **segundo orden**; además la transición completa la cruza el sol en ~2 min
  (0,25°/min), de modo que el sesgo anual es ≪ 0,1 %. Nota de coherencia interna: el «residual de
  tangencia» se reporta en mm — resolución geométrica por debajo de la penumbra física; se usa como
  criterio de contacto, no como afirmación de nitidez del borde.
- **Refracción atmosférica**: incluida — la posición solar es la APARENTE (corrección tipo Bennett
  dentro del algoritmo NOAA), coherente con pvlib (`apparent_zenith`).
- **Circumsolar**: la radiación del halo no se trata geométricamente; la absorbe el término F1 del
  modelo de Perez (§5). Declarado.

## 3. Posición solar

Algoritmo NOAA (Meeus truncado): declinación, ecuación del tiempo, refracción. Error ≲ 0,01–0,03°
frente a SPA — un orden de magnitud por debajo del semiancho de penumbra (0,27°), que es la escala
angular físicamente significativa del problema. Es el mismo algoritmo del resto de herramientas del
Panel (paridad interna).

## 4. Oclusión: solución EXACTA por proyección — por qué no hace falta ray tracing

**Proposición.** Para una fuente direccional ŝ y dos colectores planos rectos (segmentos en el plano
⊥ eje, extruidos a lo largo del eje), la fracción sombreada del receptor es
f_s = |solape de las proyecciones| / |anchura proyectada del receptor|, con proyección sobre el eje
perpendicular a ŝ en el plano de corte. **Demostración**: la sombra de un ocultor convexo bajo fuente
direccional es su imagen por la proyección afín paralela a ŝ; una proyección afín restringida a un
segmento recto es lineal en su longitud de arco, luego la correspondencia entre coordenada del panel
y coordenada proyectada es lineal y la fracción cubierta coincide con el cociente de solapes. ∎

Corolarios usados por el motor:
- Con giros distintos por fila, cotas distintas y offset superficie–eje, la fórmula sigue siendo el
  mismo cociente con los cuatro extremos proyectados — equivalente a la forma cerrada de Anderson
  (2023), Eq. 12 (`pvlib.shading.shaded_fraction1d`), que es la referencia del core.
- **Extensión a tramos finitos y desalineados**: el volumen de sombra de un colector recto es un
  prisma; su traza sobre la línea vecina está desplazada a lo largo del eje por
  Δy = pitch·cos(Δaz)/|sin(Δaz)| (Δaz = azimut solar relativo al eje). La fracción efectiva es
  f_s·(solape axial receptor ∩ emisor desplazado)/(longitud del receptor) — **exacta para el prisma**
  (los extremos de un rectángulo proyectan a un rectángulo). Con sol cuasi-paralelo al eje el prisma
  no cruza al vecino y la cobertura es 0, también exacto.
- Un ray tracer estocástico solo puede **converger** a este resultado añadiendo ruido ~N^(−1/2); se
  usa como VALIDADOR independiente, no como motor (§7).

Límite 3D: la política true-3D no usa la proyección 2D sino la intersección del rayo por el borde
alto del emisor con el plano del receptor en 3D pleno (azimut + tilt N-S + pendiente), resuelta por
bisección (36 iteraciones ⇒ resolución angular 55°/2³⁶ ≈ 10⁻⁹ °, muy por debajo de cualquier escala
física; el criterio de seguridad es geométrico, residual ≥ −1 mm — el del core).

## 5. Radiometría (dónde terminan las matemáticas exactas y empiezan los modelos empíricos)

| Componente | Modelo | Estatus físico |
|---|---|---|
| Directa en el plano | DNI·max(0, cos θ_i), cos θ_i por producto escalar con la normal | Exacto (ley del coseno para colector plano) |
| Sombra → potencia | Martinez escalonado: pérdida = ceil(n_diodos·f_s)/n_diodos sobre la directa | Modelo eléctrico AGREGADO de diodos bypass (no óptico); el mismo evaluador del core bancable; conservador por construcción (escalón ≥ pérdida lineal) |
| Difusa de cielo | Perez 1990 (allsitescomposite1990): circumsolar F1 + brillo de horizonte F2 | Modelo EMPÍRICO estándar de la industria (ajustado sobre >10⁴ medidas); la misma tabla de coeficientes del core. El cielo NO se asume isótropo |
| Reflejada del suelo | albedo·GHI·(1−cos β)/2 | Factor de vista exacto para suelo lambertiano infinito e isótropo (aproximación estándar) |
| Cielo claro | Ineichen–Perrin (turbidez de Linke, masa de aire Kasten–Young 1989, presión por altitud) | Modelo empírico validado; usado como CONDICIÓN DE COMPARACIÓN entre políticas, no como P50 |
| Cierre energético | GHI ≡ DNI·cos z + DHI | Impuesto por construcción y verificado en test |

## 6. Aproximaciones declaradas, con cota u orden de magnitud

1. **Penumbra** (§2): sesgo instantáneo ≤ ~5 % de f_s solo en transiciones de ~2 min; anual ≪ 0,1 %.
2. **Obstrucción de difusa entre filas NO aplicada por fila**: cada fila ve el cielo de Perez completo
   según su inclinación; la reducción de factor de vista por las vecinas (∝ GCR) se omite — sobrestima
   la difusa de filas interiores en O(10 %) de la DHI ⇒ O(1 %) del POA con cielo claro (DHI ~10–20 %
   del global). Es la MISMA simplificación del evaluador del core (comparabilidad interna); afecta por
   igual a todas las políticas comparadas, así que los Δ% entre políticas son más robustos que los
   valores absolutos.
3. **Horizonte lejano / relieve exterior**: no modelado (la planta no se auto-oculta con cerros
   externos). Declarado.
4. **Sombra punta-a-punta dentro de una línea**: no modelada (solo relevante con sol casi paralelo al
   eje, cuando la directa es ya rasante y pequeña).
5. **Detalle intra-módulo** (tubo de par, marcos, huecos): agregado en el escalón Martinez; no se
   resuelve célula a célula.
6. **Espectro**: irrelevante para la geometría (la oclusión es acromática); el resultado es POA de
   banda ancha, no corriente del módulo (la respuesta espectral queda fuera del alcance, igual que en
   el core para esta capa).
7. **Bifacial**: cara trasera no modelada.

## 7. Validación numérica (reproducible: `tools/test_backtracking_sim.mjs`, 28 comprobaciones + demo)

- **Concordancia entre derivaciones independientes**: el port de pvlib Eq. 14 coincide con la
  formulación cerrada por ángulo de perfil (derivación distinta) a < 0,01° a lo largo de un día
  completo.
- **Proyección analítica vs ray-cast bruto independiente**: 200 configuraciones aleatorias (cenit
  proyectado ±80°, giros ±55°, pendientes ±10°, offsets), 600 rayos por caso: acuerdo ≤ 1/300 — que
  es la cota de MUESTREO del validador, no del modelo (el modelo es exacto; el ray-cast converge a él).
- **Degeneraciones exactas**: terreno uniforme ⇒ global = row = pairwise a 10⁻⁹; terreno llano ⇒
  BT2D ≡ pairwise; tilt N-S = 0 ⇒ true-3D ≡ baseline pvlib (guard del core).
- **Invariantes definitorios sobre la planta REAL de Ayora** (854 filas, dos días completos a 15 min,
  cada paso): pairwise y min-ground-light con sombra estrictamente nula; energy-optimal ≥ pairwise
  punto a punto bajo el mismo evaluador (garantía por construcción del argmax con f=0 en el grid);
  residual de tangencia ≥ −1 mm en parejas que interactúan; θ común por grupo de accionamiento;
  cierre nocturno.
- **Coherencia con la referencia bancable**: misma formulación (pvlib/Anderson/Perez/Martinez) que el
  motor SolarGPT validado contra PVSyst (transposición +0,18 % anual sobre 235 MWp en la suite del
  core), y envolvente de mercado para la ganancia del control avanzado (aviso si excede lo publicado
  por Black & Veatch para lazo cerrado).

## 8. Conclusión

La capa de oclusión es **óptica geométrica exacta** para su geometría (fuente direccional + colectores
rectos), con la penumbra como única aproximación óptica y cota anual ≪ 0,1 %; la capa radiométrica usa
los modelos empíricos estándar de la industria (Perez, Ineichen), idénticos a los del motor bancable
de la casa; la conversión sombra→potencia es un modelo eléctrico agregado conservador (Martinez), no
óptico, y así se declara. Toda simplificación viaja declarada con su cota u orden de magnitud, y el
conjunto está validado por derivaciones independientes, ray-cast de contraste e invariantes sobre
topografía real. Para el uso previsto — **comparar políticas de backtracking sobre geometría real** —
el método es físicamente correcto y sus Δ son más robustos que sus valores absolutos, que es
exactamente lo que se reporta.
