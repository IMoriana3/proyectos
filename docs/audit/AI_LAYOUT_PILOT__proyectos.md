# Optimizar unificado — v1.10.0 · 2026-09-28

La petición «déjanos solo uno» reúne el piloto y el optimizador anterior en
`buscador-implantacion.html`. El Generador conserva un único botón Optimizar y deja de
lanzar barridos independientes al generar. No cambian las ecuaciones de colocación.

- Búsqueda conjunta de azimut, disposición y origen X/Y. Se pueden bloquear variables.
  Aleatorio por defecto, GP experimental y barrido angular explícito. Los dos primeros
  comparten candidatos iniciales, dominio y objetivo. Semilla visible y reinicio reproducible.
- Un solo criterio: kWp × factor solar de orientación del buscador existente, extraído de
  `sim-solar.html`. Es un índice de cielo claro, no una predicción anual. Fija mantiene
  orientación y compara kWp. Sin solar disponible se bloquea girar y se declara.
- Solo resultados calculados y aceptados por el QA del motor pueden ganar. Referencia
  exacta primero, presupuesto incluyendo esa referencia, pausa y comparación descargable.
- Se comparan azimut del eje y filas/paneles, disposición, pitch, retranqueo, GCR, origen,
  centrado, módulos, mesas, kWp, factor e índice solar. Mapa con norte arriba para parcelas
  reales, referencia/propuesta y controles accesibles en móvil.
- Aplicar mantiene precisión completa del origen y azimut. Un identificador y firma del
  encargo impiden aplicar a un proyecto distinto o cambiado. Generar reproduce las mismas
  geometrías de mesa; origen persiste en sesión y la API lo rechaza si no lo soporta.
- Se conservan restricciones de viales; se retira la antigua gráfica de «coste de cada vial»
  porque comparaba layouts con otras variables cambiadas y no aislaba ese coste.
- `tools/build_layout_preview.cjs` empaqueta generador y optimizador con sus fuentes
  canónicas en un HTML de revisión. Funciona localmente sin red; no apunta al buscador viejo.

El GP sigue experimental. El benchmark histórico de offsets de abajo **no valida la
superioridad de esta nueva búsqueda conjunta**. Su API antigua `LayoutSearch.run` se
conserva para reproducir ese banco; no aparece como un segundo flujo de producto.

Validación v1.10.0: **649 comprobaciones locales correctas**: layout 201, UI del generador
182 (incluye barrido trasladado), mixto 106, buscador 59, búsqueda histórica 22, UI unificada
32, integridad 7, PWA 21 y versiones 19.
El caso de UI unificada comprueba igualdad exacta de todas las mesas tras aplicar/generar,
precisión de offsets, caducidad de proyecto, descarga, pausa, móvil, fija, ausencia de solar
y rechazo de geometría inválida. Revisión visual a 1440×1000 y 390×844.
La copia descargable pasa apertura local sin red, 48 evaluaciones y regeneración exacta,
sin excepciones JavaScript. Ejemplo: 33.264 → 33.292 módulos, 20.956,32 → 20.973,96 kWp;
eje 0° → 3,4°, X 0 → −0,8841542489826679 m, Y 0 → 2,96766060590744 m.
No se extrapola este ejemplo a otras parcelas ni se afirma que sea el óptimo.

PR #528 sigue en borrador; sin merge ni despliegue. El bloqueo previo del preflight global
y el CI rojo de la base descritos al final siguen sin resolverse en este alcance.

---

# Piloto de búsqueda de implantaciones — 2026-09-28

**Decisión: disponible para evaluación, ML experimental. Aleatorio es la opción inicial.**
El aprendizaje no demuestra superioridad consistente con el banco actual. Este piloto
permite medirla dentro del generador antes de promover un modelo. No requiere nuevas
mediciones de campo y no modifica las ecuaciones de colocación.

## Entrega y alcance

- Integrado en `generador-layout.html` v1.9.0, dentro de Implantación: comparar, ver la
  referencia/propuesta, aplicar y descargar el informe JSON de la búsqueda.
- Una parcela, un montaje, motor de navegador y orientación fija. Busca únicamente
  el origen X/Y de la rejilla en ±pitch/2. Conserva pitch, tallas, orientación, setback,
  exclusiones y parámetros de viales. Los viales automáticos conservan su regla de
  distribución; deben revisarse en el mapa, no son corredores georreferenciados fijos.
- Cada candidato se evalúa con el `LAY.compute` existente y se puntúa con la misma
  función `LAY.puntuaLayout` que ya utilizaba el motor. Solo un resultado observado,
  con QA geométrico aceptado, puede convertirse en propuesta. Se conserva la referencia
  si ningún candidato mejora la puntuación; no se aplica una predicción del modelo.
- El proceso gaussiano aprende durante cada búsqueda con los resultados de esa parcela.
  No es un modelo preentrenado de producción ni existe todavía un registro central nuevo.
  La varianza posterior sirve para explorar, no es una probabilidad calibrada de seguridad.
- La vista previa utiliza el renderer existente sin sustituir el resultado exportable.
  Aplicar guarda los offsets en los controles y la sesión; Generar reproduce el resultado.
  Un cambio en el proyecto invalida la propuesta. La API rechaza explícitamente el origen
  manual, que aún no forma parte de su contrato, en vez de ignorarlo silenciosamente.
- Las cifras son módulos, mesas, kWp instalados y puntuación geométrica. No son ganancia
  energética, POA, viabilidad de obra civil ni prueba de óptimo global. Se mantienen las
  tolerancias documentadas del port al navegador; no se certifica paridad Python para
  todos los candidatos nuevos.

## Comparación reproducible

Base: `01466722ac8745d79cf7827fc9b1cabb871a6186` de `IMoriana3/proyectos`.
Datos: los 15 casos ya existentes de `tests/careo-layout.json`, sin seleccionar solo
casos favorables. Node v24.19.0, Linux. Semillas: 20260929, 20260930 y 20260931.

Cada método recibe 24 evaluaciones externas por caso, incluida la referencia, y comparte
dominio, pool de candidatos y sondas iniciales. La referencia puede ejecutar el barrido
interno de offsets del motor; su tiempo real se incluye. El tiempo total incluye también
el ajuste del modelo. Igual presupuesto de llamadas externas no significa igual número
de colocaciones internas ni igual tiempo de ejecución.

| Resultado | GP | Aleatorio |
|---|---:|---:|
| Ejecuciones (15 casos × 3 semillas) | 45 | 45 |
| Ejecuciones con geometría válida | 42 | 42 |
| Mejora de la referencia del motor | 9 | 11 |
| Victoria frente al otro método | 1 | 3 |
| Empates comparables | 38 | 38 |
| Mediana de tiempo total por ejecución | 1.091,11 ms | 1.059,75 ms |
| Tiempo total del banco | 51.708,30 ms | 51.352,98 ms |

Un caso de estructura fija con pitch de 4 m no produce geometría válida en las tres
semillas: esas tres ejecuciones se excluyen de las 42 comparaciones válidas y no se
cuentan como empates. Cada método registra 72 evaluaciones inválidas. En esas ejecuciones
el GP recurre a 45 pasos aleatorios en total porque no dispone de observaciones válidas.

No hay evidencia aquí para promover ML por encima de aleatorio. Las tres semillas sobre
las mismas parcelas no constituyen 45 parcelas independientes ni una validación de
generalización a emplazamientos nuevos. El banco inicial con una sola semilla sirvió para
desarrollo; los resultados de esta tabla corresponden a las tres semillas posteriores.

Datos por caso y hashes del corpus/optimizador: [layout-search-benchmark.json](layout-search-benchmark.json).

```bash
LAYOUT_SEEDS=20260929,20260930,20260931 node tools/benchmark_layout_search.cjs /tmp/layout-search-benchmark.json
```

Antes de promover ML: ampliar el banco con parcelas ya disponibles y separadas de las de
desarrollo; comparar contra aleatorio a igual presupuesto y tiempo; exigir mejora repetida
en calidad o tiempo sin regresión geométrica. Si no aparece esa ventaja, conservar la
búsqueda simple. Winter, difusa y BT siguen siendo entregas posteriores dentro de sus HTML.

## Verificación de la entrega inicial v1.9.0

| Arnés | Comprobaciones correctas |
|---|---:|
| `test_layout.js` | 201 |
| `test_layout_ui.js` | 182 |
| `test_zonas_mixto.js` | 106 |
| `test_layout_search.js` | 22 |
| `test_layout_search_ui.js` | 21 |
| `test_integridad.js` | 7 |
| `test_pwa.js` | 21 |
| `test_versiones_app.mjs` | 19 |
| **Total ejecutado** | **579** |

Pruebas de navegador en Chromium 140.0.7339.16 servido por HTTP local. Incluyen la
reproducción geométrica exacta tras aplicar y regenerar, compatibilidad con sesiones
anteriores, invalidación de propuestas, cancelación entre evaluaciones, rechazo de
geometría inválida y del origen explícito por API. Revisión visual de la tabla en la
columna de 320 px, sin solapamientos. `node --check` de ambos módulos y `git diff --check`
correctos. No se afirma haber ejecutado todos los arneses del repositorio.

El CI de la base ya estaba rojo: [run 36314000920](https://github.com/IMoriana3/proyectos/actions/runs/36314000920)
falla en `test_index.js`, con 3 comprobaciones frente al piso de 28, al esperar la
referencia antigua a Toolbox v11.89. No se modifica ese fallo ajeno al piloto. El estado
del CI de esta rama debe consultarse en la PR; las pruebas locales no lo sustituyen.

El preflight `docs/al_empezar.sh` devuelve `ENVIRONMENT_BLOCKED` en este entorno por falta
del token en shell y del conjunto de clones/candados esperado. Se verificaron la base,
el árbol, las ramas y el CI de proyectos con la conexión GitHub disponible. Ese resultado
no acredita el censo global de otros repositorios. Entrega aislada para revisión, sin
merge ni despliegue.

## Revisión v1.9.1 — datos de la comparación

La captura del usuario mostraba únicamente módulos, mesas, kWp y puntuación. Se
reprodujo con el ejemplo Finca dibujada, método GP, 48 evaluaciones y semilla 20260928:

| Parámetro | Referencia | Propuesta |
|---|---:|---:|
| Azimut del eje | 0° | 0° |
| Azimut de filas | 90° | 90° |
| Pitch | 6 m | 6 m |
| Retranqueo | 5 m | 5 m |
| Origen X | 0 m | +1,990095279 m |
| Origen Y | 0 m | −0,727437145 m |
| Mesas de 28 módulos | 1116 | 1124 |
| Mesas de 14 módulos | 104 | 100 |
| Mesas de 7 módulos | 80 | 72 |

No cambia la orientación. El desplazamiento mejora la colocación: +112 módulos,
−4 mesas y +70,56 kWp (+0,34 % de capacidad instalada). La tabla ampliada muestra
azimuts, pitch, retranqueo, GCR y offsets evaluados; añade el centrado adicional
cuando existe, destaca cambios y desglosa mesas por talla. Los mismos valores
se incluyen en `report.comparison`. En fija no se muestra un eje de tracker.

El origen de la referencia se obtiene de la evaluación, incluyendo el barrido
automático o un origen manual previo; no se supone que siempre sea cero. El
azimut se lee del resultado geométrico del motor, no de un campo declarado que
pueda diferir de la colocación. No hay cambios en el optimizador ni en la física.

El arnés de la UI pasa de 21 a **28 comprobaciones correctas**, incluyendo orientación
no cardinal, origen manual, JSON descargado, desglose por talla, fija y ausencia de
datos válidos. La validación de la búsqueda de v1.9.0 sigue siendo la de arriba;
esta revisión no repite el benchmark porque el optimizador no se ha modificado.
Además, integridad (7) y versiones (19) correctas: **54 comprobaciones ejecutadas
en esta revisión**. Copia descargable v1.9.1 comprobada abriéndola como fichero
local sin red: comparar 48 evaluaciones, mostrar parámetros, aplicar y regenerar
la misma geometría, sin excepciones JavaScript. Tabla revisada visualmente a 320 px.
