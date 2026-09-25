# Auditoría de interfaces y lógica de dominio · `proyectos`

## 1. TASK IDENTIFICATION

| Campo | Valor |
|---|---|
| Task | `10-INTERFACES-PROYECTOS__proyectos` |
| Target chat | `10_INTERFACES` |
| Repository | `proyectos` |
| Mode | `AUDIT_ONLY_THEN_PERSIST_REPORT` |
| Fecha de auditoría | 2026-09-21 UTC |
| Rama base auditada | `work` (el checkout no contiene referencia local ni remoto configurado para `main`) |
| Commit base auditado | `e15a2a8b5641c60c9acf2616836794b98f785f17` |
| Destino solicitado para PR | `main` |

La investigación fue de solo lectura. El único cambio posterior es este informe. Se inspeccionaron las superficies solicitadas, el contrato, los arneses, los generadores de referencias y los fixtures; se ejecutaron los careos que no requerían instalar dependencias. No existe un checkout hermano de `SolarGPTfull`, por lo que ningún resultado basado en un fixture demuestra paridad con el `main` actual de ese repositorio.

### Taxonomía usada

- **CANONICAL**: propietario de la regla y fuente que debe resolver discrepancias.
- **MIRROR**: reimplementación deliberada de una regla canónica externa, con obligación de careo.
- **ADAPTER**: traduce, transporta, presenta o persiste datos sin pretender ser propietario de la física.
- **APPROXIMATION**: modelo local deliberadamente reducido; no es intercambiable con el canónico.
- **LEGACY**: instantánea, compatibilidad o comportamiento retenido que no debe adquirir nuevas responsabilidades.

Una superficie puede tener varias capas: por ejemplo, una UI puede ser ADAPTER hacia `/structures` y contener a la vez una APPROXIMATION local.

## 2. EXECUTIVE FINDINGS

1. **Este repositorio no contiene el motor canónico general de SolarGPT.** Los textos y selectores asignan ese papel al Python de `SolarGPTfull`, accesible por `/layout`, `/structures`, `/windstow`, `/bankable`, `/generation`, `/economy`, `/dem`, `/modules` y `/hailstow`. `layout.html` es el adaptador más limpio: no tiene sustituto físico local.
2. **Sí contiene motores de dominio independientes y ejecutables**: el motor de implantación `LAY`; astronomía/seguimiento de `sim-solar`; `FIS` (transposición, estructuras y sizing); el optimizador del buscador; y `LOC` más las máquinas de amenaza/ejecución de viento y granizo. No son meros componentes visuales.
3. **La etiqueta global correcta para los motores JS no es MIRROR sin matices.** Hay puertos que pretenden exactitud (máquinas de estados, enteros de sizing), pero layout admite diferencias de borde; estructura usa isotropía en lugar de Perez y carece de IAM; viento local omite Perez, sombra entre filas, IAM y lazo. Estas capas son **MIRROR parcial + APPROXIMATION**, aunque la UI sea ADAPTER.
4. **Los careos reales ejecutados son valiosos pero históricos.** `test_layout.js`, `test_comparador.js` y `test_sizing.js` ejecutan código extraído del HTML contra JSON generados por un core. No importan ni ejecutan el core auditado en esta corrida. El fixture de estructuras sí conserva commit, entorno y manifiesto; layout y sizing no conservan SHA del core.
5. **Los goldens de granizo son el mecanismo de procedencia más fuerte**, con SHA-256 y detección del repo hermano. En esta auditoría funcionaron expresamente en modo degradado: auto-consistencia del espejo, no paridad viva.
6. **`careo-pvsyst.html` no carea motores.** Presenta un expediente A/B congelado, siete hallazgos y veredictos persistidos. Su test comprueba UI/persistencia, no recalcula PVsyst ni SolarGPT. Se clasifica ADAPTER de revisión + LEGACY/reference snapshot.
7. **La identidad de planta y proyecto está duplicada.** `factiun_plantas`, presets embebidos, `COORDS_FALLBACK`, `TZ_FIJO`, layouts remotos, `PROJECTS` y `PLANTS` pueden divergir. `CONTRATO.md` reconoce explícitamente la copia de husos y el contrato manual de claves.
8. **`seguidor.js` es una fuente canónica local de geometría de render, no de rendimiento.** Sin embargo, su cabecera dice que se sincroniza idéntico en otros repos: entre repos es MIRROR por copia, sin versión/hash comprobable en este checkout.

## 3. SURFACE INVENTORY

| Superficie | Purpose / inputs | Lógica y outputs | Clasificación y procedencia |
|---|---|---|---|
| `generador-layout.html` | Crear implantaciones desde rectángulo, dibujo, GeoJSON/KML, exclusiones, MDT/CSV, estructura, viales y objetivo de sizing. Defaults: El Burgo, 600×450 m, setback 5 m, 28 módulos/mesa, módulo 2.382×1.134 m y 630 W, pitch 6 m, GCR 0.397, límite 55°. | `LAY` hace UTM, erosión/setback, barrido de filas, emparejado bífila, multi-talla, carreteras, optimización y estadísticas. Mezcla planta, zonas mixtas y terreno. Exporta GeoJSON, DXF, CSV de mediciones, XYZ PVsyst, sesión JSON, imagen/metadatos y puente 3D; opcionalmente llama `/layout`. | UI **ADAPTER**; `LAY` **MIRROR parcial / APPROXIMATION** de `solargpt_core.layout_v2`. El propio bloque declara refinamientos canónicos ausentes. La ruta `/layout` es **CANONICAL externa**. |
| `layout.html` | Explorador mínimo: planta/coords, rectángulo, pitch, giro y bífila; también importa GeoJSON del notebook. | Solo forma el polígono, POST `/layout`, renderiza GeoJSON y publica `cobertura_layout` en `localStorage`. Sin motor no genera. | **ADAPTER** puro al core; fallbacks de identidad/coordenadas, no de física. |
| `sim-solar.html` | Carta solar y ficha preliminar: lat/lon, fecha, huso, altura de objeto; módulo, kWp, GCR, ángulo, azimut, presupuesto/economía. | NOAA local (Julian day, declinación, ecuación del tiempo, refracción), sombra, carta/heatmaps; carga seguimiento desde su bloque `SEGUIMIENTO`. Adapta `/bankable`, `/generation`, `/economy`, `/dem`, `/modules`; exporta CSV anual. | Geometría solar **APPROXIMATION** (NOAA frente a SPA/pvlib); seguimiento **MIRROR** declarado de `overcast.html`; APIs **ADAPTER**. GHI claro `I0·sin(elev)` es aproximado. |
| `sim-viento.html` | Comparar abanderamiento, pasivo y granizo: planta/sitio, año, Open-Meteo/HSU/demo, ventana, geometría, umbrales, persistencias, ráfaga/cizalladura y parámetros Rev01.4. | `LOC` implementa sol, tracker/backtracking, POA isotropa, meteo/resampling, ráfaga, Gumbel, control A1/A2/B1/B2, pasivo, informes y orquestación. Bloques de granizo calculan amenaza y ejecución. Puede pedir `/windstow`, presets y `/hailstow`; usa `seguidor.js` para 3D. | Estrategias y máquinas de estados: **MIRROR**; POA/sol/control local: **APPROXIMATION**; llamadas al core/SCADA/Open-Meteo: **ADAPTER**. El texto antiguo que dice “NO hay modo offline” contradice el modo local inmediatamente posterior: discrepancia documental **BUG**. |
| `comparador-estructuras.html` | Comparar fija, HSAT/TSAT, backtracking/no-BT/quebrado; sitio, meteo, módulo, inversor y sizing. Defaults de careo: Sevilla 37.3891/-5.9845, 2023, albedo .20; geometrías 2.382×1.134 m, 660 W, pitch 4.5/6 m, 28, 2V, 55°. | `FIS` calcula sol, single-axis/backtracking, transposición isotropa, sombreado aproximado, rankings/energía, estructura rota y dimensionado eléctrico. Consume Open-Meteo, catálogos CEC y `/structures`; exporta resultados/informe. | UI/API **ADAPTER**; energía **MIRROR parcial / APPROXIMATION**; sizing entero **MIRROR** con expectativa exacta. Core Python es la fuente canónica reclamada. |
| `buscador-implantacion.html` | Buscar variantes reproducibles sobre parcela/preset/layout mediante semilla, giro, rejilla, tresbolillo/viales y criterio kWp/energía. Recibe encargo por `localStorage`/query. | Descarga y evalúa en runtime los bloques reales de `generador-layout.html` y `sim-solar.html`; itera candidatos, mantiene récord, pinta y devuelve `buscador_mejor`. | **ADAPTER/orquestador** de `LAY` y **APPROXIMATION** de optimización. Evita una tercera copia, pero depende de marcas textuales y `eval`/extracción como ABI informal. |
| `careo-pvsyst.html` | Registrar adjudicación humana de dos comparaciones SolarGPT↔PVsyst, autor, nota y estado. | Tablas y deltas embebidos; export/import JSON; `localStorage`; no hay cálculo solar, lectura de fichero PVsyst ni llamada al core. | **ADAPTER** de workflow + **LEGACY/reference snapshot**. No es prueba de paridad computacional. |
| `cartera-tabla.html` | Editar cartera/identidad de plantas con búsqueda e importación Excel. | Mantiene esquema/tablas, normaliza y persiste `factiun_cartera`/`factiun_plantas`, importa XLSX y exporta XLSX/JSON. No contiene física. | **CANONICAL local** solo para la cartera del navegador; **ADAPTER** de XLSX y proveedor de identidad para otras fichas. Sin backend ni versión de esquema fuerte. |
| `index.html` | Panel de proyectos y vistas por planta; búsqueda, filtros, docs, enlaces y PWA. | `PROJECTS`, `PLANTS`, `PLANT_VIEWS`, render Markdown y persistencia de cartera. No calcula dominio físico. | **ADAPTER/registry**; identidad y versión editorial duplicadas. `CONTRATO.md` es su contrato operativo, no un schema ejecutable. |
| `seguidor.js` | Geometría visual detallada de tracker, materiales, cotas, piezas, cables y eje de transmisión. Entradas: THREE, detalle, lado, west y overrides por planta. | Devuelve geometrías/partes/grupos Three.js; constantes en metros y marco canónico. No calcula sol, tracking, viento o energía. | **CANONICAL local** de render; **MIRROR copiado** respecto a Gemelo/Cobertura. Es un motor geométrico independiente, no físico/energético. |
| `lib/` | `three.min.js`, `OrbitControls.js`, `xlsx.full.min.js`. | Render 3D, controles e import/export Excel. | **LEGACY/vendor** versionado por copia. No es dominio; la minificación y ausencia de manifiesto hacen opaca la procedencia/versiones. |
| `tools/` | Pruebas visuales/geométricas de ancho, nitidez y DWG/cartera. | Abren superficies con Playwright y verifican presentación o datos. | **ADAPTER de QA**, no producción ni fuente canónica. |
| `data/` | Catálogos CEC de módulos/inversores generados desde CSV. | Datos de entrada para comparador/sizing; incluyen valores derivados y no sustituyen datasheet. | **MIRROR/reference data**; procedencia por generadores de test, pero sin versión legible en nombre de fichero. |
| `tests/` | Contratos puros y browser, mutantes, integridad y paridad congelada. | Extraen el código de producción; comparan invariantes, intermediates, UI y fixtures. | Evidencia, no canon. Muy buena contra regresión local; insuficiente por sí sola para equivalencia con el core actual. |
| `tests/goldens/` | Casos canónicos de amenaza y ejecución de hail stow más hashes. | Careo exacto de trazas/secuencias; fallback al espejo cuando falta hermano. | **MIRROR versionado/hash**. En modo sin hermano prueba integridad y comportamiento contra snapshot, no actualidad. |

## 4. LOCAL DOMAIN LOGIC

### Motores independientes detectados

1. **`LAY` (implantación)**: proyección UTM directa/inversa, convergencia de meridiano, operaciones de polígono, banda erosionada, exclusiones, colocación por scanline, emparejado bífila, unidad atómica, carreteras, multi-talla, modos aligned/adaptive y objetivo energético. Es un motor autónomo; `/layout` solo es una alternativa seleccionable.
2. **Solar local**: `solarGeom`, refracción, curvas diarias, amanecer/ocaso discretos, cartas y heatmaps; el bloque de seguimiento aporta `trueTrackAngle`, `singleaxis` y baseline. Corre sin core.
3. **`FIS` (estructuras y sizing)**: genera series, tracker/fija, POA, sombras y comparativas; además contiene reglas discretas de strings/MPPT/planta. La parte de sizing tiene semántica de ingeniería independiente de la visualización.
4. **`LOC` (viento)**: pipeline completo desde fuente meteorológica hasta consignas, estados, POA perdida, episodios, estadística de extremos y reporte. Las máquinas de amenaza y ejecución son motores de dominio discretos separados.
5. **Buscador**: motor de exploración estocástica/reproducible que compone `LAY` y rendimiento solar; no duplica esos motores, pero sí decide objetivo, espacio de búsqueda y aceptación.
6. **`seguidor.js`**: motor de geometría de producto y ensamblaje. Es independiente pero visual: ninguna salida debe usarse como prueba de fuerza, tracking o rendimiento.

### Cálculos locales por dominio

- **Geometría**: UTM y polígonos (`LAY`); longitud de mesa/fila y GCR (`LAY`, `FIS`, `seguidor.js`); escenas 3D en generador, comparador y viento.
- **Posición solar**: dos implementaciones locales (sim-solar y `LOC`) con algoritmos y APIs distintas; esta duplicación es una frontera ausente.
- **Tracker/backtracking**: sim-solar, `FIS` y `LOC` contienen implementaciones; `seguidor.js` solo representa el ángulo. No hay un módulo local único.
- **Viento**: Open-Meteo/CSV/HSU, cizalladura, ráfaga sintética o medida, Gumbel, dirección y máquinas de abanderamiento en `sim-viento.html`.
- **Energía**: sim-solar usa un cielo claro simplificado y deriva estimaciones; `FIS` y `LOC` usan transposición local isotropa. El core externo añade Perez/IAM/sombreado/lazo según la superficie.
- **Eléctrico**: strings por potencia/corriente/MPPT, ventana térmica, DC/AC, inversores y planta en `FIS`; catálogos CEC son datos de referencia.
- **Granizo**: amenaza y ejecución se modelan como máquinas de estados con parámetros Rev01.4; varios parámetros siguen marcados “no validados”.

## 5. DEFAULTS / UNITS / IDENTITIES

### Unidades y convenciones

- Coordenadas en grados decimales `[lon, lat]`; cálculo local en UTM metros. Azimut/elevación/tilt/backtracking en grados; `seguidor.js` convierte al marco Three.js.
- Longitudes geométricas en m; áreas en m²/ha; potencia de módulo en W y planta en kWp; irradiancia en W/m² y energía en Wh/kWh por m² o kWp según salida.
- Viento solicitado a Open-Meteo en m/s; UI también presenta km/h en contextos humanos. Los tests vigilan explícitamente que no se intercambien.
- El signo declarado de tracker sigue core/pvlib (`theta > 0` hacia el este); pendiente E-O positiva y convenciones de eje deben viajar con los datos, no inferirse del dibujo.
- Huso en minutos/horas fijos según ficha; sim-solar mantiene una tabla `TZ_FIJO` copiada por código y una regla peninsular. Es identidad operativa, no astronomía.

### Identidad de planta

Hay al menos cinco fuentes: `factiun_plantas`, `factiun_cartera`, presets embebidos, layouts remotos (`plantas_indice.json`/`*_layout.json`) y `PLANTS` de `index.html`. El generador también permite una parcela sin proyecto. Reglas observadas:

- seleccionar planta puede cambiar coordenadas, pitch, geometría, layout, zona/NCU y huso;
- editar lat/lon manualmente debe desprender el nombre de planta para no exportar una identidad falsa;
- faltantes caen a coordenadas embebidas, defaults de El Burgo/Sevilla o entrada manual;
- `localStorage` comparte identidad entre páginas del mismo origen, sin migración central de esquema.

### Identidad de proyecto y versionado

`PROJECTS` es el registro editorial (repo, URL, versión, docs e historial) y `CONTRATO.md` reparte ownership. Versiones también viven dentro de las apps, comentarios e informes. `test_versiones_app.mjs` reduce la deriva, pero no sustituye un manifiesto. Fixtures de estructuras tienen SHA de core; careo-layout y careo-sizing no. Goldens de granizo tienen hash de contenido pero no incorporan por sí solos el SHA del generador en el JSON.

### Fallbacks relevantes

- Motores: URL guardada y puertos 8765/8000/9000; si no hay core, unas superficies se bloquean (`layout.html`) y otras calculan localmente.
- Meteo: Open-Meteo, HSU/CSV, demo o cielo sintético. `clearsky` declara viento cero/rumbo desconocido; completar irradiancia queda marcado.
- Elevación: Open-Meteo, Open-Elevation, CSV y, donde aplica, `/dem`; los fallos se muestran.
- Paridad: repo hermano → espejo+SHA → modo degradado declarado.
- Identidad: cartera/localStorage → presets/fallbacks embebidos → entrada manual.

## 6. MIRROR / PARITY CLAIMS

| Claim | Qué se ejecuta realmente | Veredicto |
|---|---|---|
| `LAY` porta `compute_layout_v2` | Bloque extraído del HTML contra 15 casos congelados; filas, mesas, kWp, área, fórmulas y UTM. | **Paridad parcial demostrada contra fixture**, no equivalencia. Tolerancias y refinamientos ausentes hacen que sea APPROXIMATION intencional. |
| `FIS` equivale a `structure_compare` | Bloque real contra meteo/esperados congelados; ranking, deltas y POA con tolerancias. | **Paridad decisional aproximada**, no paridad física exacta. El propio test acepta 8 % de POA y 2.5 pp. |
| Sizing porta el core | Bloque real contra `careo-sizing.json`, enteros, binding y confidence. | **Paridad exacta para los casos congelados**; sin core actual ni SHA en fixture, no prueba actualidad. |
| Solar local coincide con SolarGPT | Tests fijan astronomía de manual e invariantes, no ejecutan SPA/pvlib. | **No demostrada**. Es APPROXIMATION declarada; segundos de sunrise no fueron medidos en esta corrida frente al core. |
| Viento A1/A2/B1/B2 son puerto exacto | Tests ejercitan funciones, transiciones e invariantes; `/windstow` no fue careado online. | **Fuerte evidencia local**, pero no equivalencia actual completa. POA local es expresamente distinta. |
| Granizo amenaza/ejecución coincide con core | Código real contra secuencias/trazas goldens exactas; hash comprueba espejo. | **Paridad contra snapshot**. Esta corrida declaró ausencia del hermano; por tanto no prueba el core actual. |
| `seguidor.js` es idéntico en repos | Solo lo afirma la cabecera. | **No demostrado aquí**: falta checkout, hash o test cruzado. |
| Careo SolarGPT↔PVsyst | UI muestra deltas fijos y persiste dictamen. | **No es test de paridad**; es evidencia editorial/humana congelada. |

No se acepta como evidencia el código copiado, una marca `FÍSICA PURA`, comentarios de versión, ni que dos algoritmos compartan una fórmula. La evidencia computable empieza donde un oráculo independiente o un artefacto canónico con procedencia alimenta el código de producción.

## 7. TEST / GOLDEN EVIDENCE

### Careos ejecutados en esta auditoría

- `test_layout.js`: **201/201**. Intermediates: delimitación/export `LAY`, filas, estructuras/mesas, módulos, kWp, área poligonal/útil, fill, geometría cerrada (largo/apertura/fila/GCR), UTM, bífila/multi-talla, setback y barrido.
- `test_solar.js`: **73/73**. Julian day/J2000, declinación, ecuación del tiempo, elevación, refracción, true tracking, backtracking, topes y mutantes.
- `test_comparador.js`: **304/304**. Manifiesto/procedencia, catálogo/baseline, GHI, POA por estructura, ranking, delta porcentual, tracker/backtracking, hemisferios, quebrado y mutantes.
- `test_sizing.js`: **115/115**. `roundPy`, ventana por Voc/Vmp y temperatura, strings por potencia/corriente/MPPT, binding/confidence, DC/AC, número de inversores y viabilidad.
- Viento puro: sol **28/28**, control **28/28**, abanderamiento **33/33**, fuentes **28/28**, ráfaga medida **39/39**, Gumbel **24/24**, POA **30/30**. Comparan, respectivamente, geometría solar; control/pasivo/lado; secuencia/histéresis; provenance flags y cierre GHI; preservación y precedencia de ráfaga; parámetros/extremos; y componentes/factores de vista/no negatividad.
- `test_granizo_espejo.mjs`: **8/8** en modo sin hermano. Verifica cuatro estados de integridad, SHA local y demo, pero no fuente actual.
- `test_ejecucion_traza.mjs`: **61/61** contra espejo. Compara la **secuencia completa de estados**, motivos, timeouts, fallos, reintentos, veto/envolvente y diario; no solo el estado final.

### Pruebas no ejecutadas

Los arneses Playwright (`test_careo_pvsyst.js`, `test_buscador.js`, `test_viento_meteo.js`, `test_viento_orquestacion.js`) no pudieron arrancar porque `playwright` no está instalado. No se instaló para respetar el modo de auditoría sin modificar dependencias/artefactos. La primera prueba falló antes de abrir Chromium; las restantes no se presentaron como ejecutadas.

### Calidad y límites de los fixtures

- `careo-estructuras.json` es el mejor fixture de careo continuo: guarda core commit `0c7cccefb80ad3073218effc442fb8082a9dd064`, descripción, limpieza, fecha, Python/pvlib/numpy/pandas, cadena y manifiesto.
- `careo-layout.json` almacena entradas, esperados y referencias pyproj, pero no commit/entorno de generación.
- `careo-sizing.json` almacena entradas y esperados, pero no procedencia/versionado del core.
- Los generadores Python requieren una ruta a SolarGPT y son el punto correcto para regenerar; la CI del repositorio consumidor no demuestra que se hayan ejecutado contra cada cambio del productor.
- Los goldens de hail stow declaran fuente única, paridad exacta y parámetros no validados. Los `.sha256` impiden edición silenciosa, no obsolescencia si falta el repo hermano.

## 8. DISCREPANCIES

| ID | Clasificación | Discrepancia / impacto |
|---|---|---|
| D-01 | **INTENTIONAL** | Layout JS omite refinamientos de borde del core y tolera 2.5 %; es disponibilidad offline, no equivalencia. |
| D-02 | **APPROXIMATION** | Estructuras/viento usan isotropía local donde el core usa Perez; faltan IAM, sombreado entre filas y/o lazo. POA absoluta no es intercambiable. |
| D-03 | **APPROXIMATION** | sim-solar usa NOAA y GHI claro simplificado, no SPA/pvlib ni modelo de cielo bancable; tampoco hay horizonte DEM por falta de extensión geográfica del endpoint. |
| D-04 | **LEGACY** | `careo-pvsyst.html` conserva resultados/hallazgos embebidos; su test valida expediente y persistencia, no los números desde fuentes. |
| D-05 | **UNKNOWN** | Identidad de planta, huso, pitch y geometría se duplican en presets, cartera, layouts e HTML. No hay regla ejecutable general de precedencia ni versión de schema. |
| D-06 | **UNKNOWN** | `seguidor.js` dice estar copiado idéntico en repos, pero este repo no guarda hash/procedencia/versión cruzada verificable. |
| D-07 | **BUG** | En `sim-viento.html`, el comentario de arquitectura anuncia “NO hay modo offline” y que la ficha solo dibuja, mientras el comportamiento actual activa un motor local. Puede inducir una frontera de ownership incorrecta. |
| D-08 | **LEGACY** | Librerías minificadas se versionan por copia y no hay lockfile/manifiesto que identifique claramente upstream/licencia/build. |
| D-09 | **UNKNOWN** | Fixtures layout/sizing carecen de SHA del core; un verde no permite saber contra qué revisión se obtuvo el oráculo. |
| D-10 | **INTENTIONAL** | Goldens permiten modo degradado sin checkout hermano para que la suite sea ejecutable. Se declara, pero no debe agregarse como “paridad verde”. |
| D-11 | **APPROXIMATION** | Buscador optimiza sobre el motor/ponderación local y puede elegir una variante distinta del core bancable aun si mantiene determinismo/monotonía. |
| D-12 | **UNKNOWN** | Catálogos CEC contienen límites derivados; sin datasheet por MPPT la `confidence` baja correctamente, pero consumidores futuros pueden ignorarla. |

## 9. REQUIRED ADAPTER BOUNDARIES

1. **`SolarEngineClient` único**: discovery, `/health`, capacidades, timeouts, schema/version del core, URL/túnel y errores. Cada respuesta debe incluir `engine_version`, `core_commit`, `model_id` y unidades.
2. **`PlantIdentity` versionado**: `{plant_id, project_id, name, lat, lon, timezone, crs, layout_revision, geometry_source}`. Eliminar tablas `TZ_FIJO`, coordenadas y presets duplicados o tratarlos como caché con procedencia.
3. **`LayoutModel` estable**: schema JSON versionado para parcela/huecos/zonas/estructuras/caminos/terreno/stats; separar inputs de proyecto de resultados calculados y nombrar `calculation_engine` (`core`/`local`) y `model_version`.
4. **`SolarGeometry` compartido**: una sola implementación local importable por sim-solar, comparador y viento, con convención de tiempo/azimut/signo. Si sigue siendo NOAA, nombrarla `noaa_approx`, no `canonical`.
5. **`TrackerPolicy` compartido**: true tracking, backtracking, topes, control loop y signo como paquete versionado; separar consigna geométrica de ejecución mecánica.
6. **`WeatherSeries`**: timestamps UTC, paso, campos, unidades, fuente, flags medido/sintético/relleno, calidad y resampling. Evitar objetos ad hoc entre Open-Meteo, HSU, CSV y core.
7. **`EnergyResult`**: modelo de transposición, sombra, IAM, horizonte, intervalo, normalización y provenance obligatorios. No comparar dos columnas `poa` sin estos metadatos.
8. **`GoldenManifest`**: para cada fixture, repo, SHA, dirty flag, comando, dependencias, timestamp, schema y hash de inputs/output. Fallar o marcar `STALE/DEGRADED`, nunca resumirlo como paridad actual.
9. **`TrackerGeometry`**: convertir `seguidor.js` en paquete o artefacto generado con versión/hash; las copias de otros repos deben validarse automáticamente.
10. **`PortfolioStore`**: migraciones y schema versionado para `factiun_cartera`/`factiun_plantas`; separar identidad maestra de preferencias locales y sesiones de herramientas.

## 10. OWNERSHIP / DUPLICATION IMPLICATIONS

- **SolarGPTfull debe ser owner** de modelos bancables: layout canónico, transposición/sombra/IAM, tracker/backtracking canónico, viento/abanderamiento, granizo y sizing. Este repo debe consumir contratos y mostrar procedencia.
- **`proyectos` debe ser owner** de workflows/UI, visualización, persistencia de sesión, import/export y aproximaciones offline claramente etiquetadas; no debe promover una aproximación a canon por acumulación de tests.
- **Cartera/identidad necesita owner explícito**. Hoy `index.html`/`cartera-tabla.html` parecen maestros en navegador, pero layouts y otros repos aportan campos de mayor autoridad técnica.
- **La duplicación más riesgosa es semántica**, no textual: tres soles, varios backtrackings, varias longitudes/GCR, husos copiados y POA con igual nombre pero distinto modelo.
- **La extracción de bloques HTML en tests y en el buscador es mejor que copiar**, pero convierte comentarios-marca y firmas JS en una API sin schema. Mover código puede romper integración aunque la función siga correcta.
- **Los fallbacks honestos son una fortaleza**: varias superficies declaran motor ausente, fuente sintética o modo degradado. Debe preservarse esa honestidad en exports, no solo en la UI.
- **No hay justificación para llamar CANONICAL a un resultado local de energía**. Lo canónico local se limita razonablemente al registro editorial, geometría visual y estado de sesión; incluso estos necesitan versionado.

## 11. QUESTIONS TO 10_INTERFACES / 11_REPOS / 00_MASTER

### Para `10_INTERFACES`

1. ¿Se aprueba un envelope común de resultados con `engine`, `core_commit`, `model_id`, `schema_version`, unidades, fuente meteorológica y flags de aproximación?
2. ¿Qué campos forman la identidad inmutable de planta/proyecto y cuál es la precedencia cartera ↔ layout ↔ as-built ↔ entrada manual?
3. ¿Deben los modos locales llamarse explícitamente `offline_approx` y prohibir la etiqueta “canónico” salvo respuesta firmada/versionada del motor?
4. ¿Se formalizan como API los bloques hoy extraídos por marcas (`LAY`, solar, seguimiento, `FIS`) o se acepta esa ABI textual?

### Para `11_REPOS`

1. ¿Qué repositorio publicará paquetes compartidos de solar/tracker/geometría e identidad, y cómo se consumirán en GitHub Pages sin bundler?
2. ¿Puede CI obtener `SolarGPTfull` en SHA fijado y regenerar/verificar fixtures, en vez de depender de un checkout hermano opcional?
3. ¿Quién posee `seguidor.js`? ¿Se elimina la copia mediante paquete/submódulo/generación o se impone un hash cruzado?
4. ¿Se conservan las librerías vendorizadas? En tal caso, ¿se añade un manifiesto de versión, origen, licencia y hash sin alterar su contenido?

### Para `00_MASTER`

1. ¿SolarGPTfull es formalmente la autoridad de toda física, o hay dominios cuya autoridad debe residir aquí (p. ej. máquinas Rev01.4 o sizing)?
2. ¿Cuál es el criterio de release para una afirmación de paridad: fixture al SHA, ejecución cross-repo en CI, tolerancias aprobadas y caducidad máxima?
3. ¿Quién valida los parámetros Rev01.4 todavía marcados como pendientes de ensayo y quién puede cambiarlos?
4. ¿Se acepta que una PR a `main` quede bloqueada si los fixtures apuntan a un core anterior al mínimo compatible?
5. ¿Debe el careo PVsyst evolucionar a importación/recomputación reproducible, o se declara definitivamente expediente histórico humano?

---

### Conclusión operativa

Mantener las superficies, pero hacer explícita la frontera: **core externo = canon; navegador = adaptador y, donde sea necesario, espejo/aproximación identificada**. El siguiente trabajo no debería ser portar más física: debería ser versionar contratos, identidad y procedencia, y convertir los careos congelados en verificaciones cross-repo fijadas a SHA.
