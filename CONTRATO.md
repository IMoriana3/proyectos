# CONTRATO del Panel — entre las sesiones que lo editan

**Este fichero es el interfaz entre las sesiones de Claude que tocan el repo `proyectos`.**
Regla de oro: *quien cambie algo de lo de abajo, lo actualiza aquí EN EL MISMO PR*, y cada sesión
relee este fichero (rama `main`) antes de tocar `index.html`.

> Hay un contrato hermano en el repo `scada` (`CONTRATO.md`) entre **Backtracking** y **Toolbox**,
> para los interfaces de datos (Supabase, agente Modbus, formatos). Este es solo del Panel.

## Reparto de trabajo

| Sesión | Ámbito en este repo |
|---|---|
| **Proyectos** (`session_017eUUJjy61tCaA1MWKsU9DV`) | El Panel como producto: maquetación y estilos, lógica de render/búsqueda/filtros, lector de documentación, `layout.html`, `generador-layout.html`, `sim-solar.html`, `cartera-tabla.html`, `docs/` de sus proyectos |
| **Backtracking** (`session_012sz2W5bL1abmUhGnFtriFq`) | Las **fichas de sus herramientas** dentro de `PROJECTS` y sus `docs/`: SCADA de planta, Seguimiento PEM, IPs de plantas, Mapa Modbus, TCU Toolbox, Agente y collector, Cobertura Zigbee/RF, Gemelo Digital TCU · y los **enlaces de vista** de `PLANTS` (3D, cobertura, SCADA) |

Los dos pueden leerlo y editarlo todo; se escribe preferentemente en el ámbito propio.
Para tocar el ámbito del otro: avisar aquí (Puntos abiertos) o por mensaje de sesión.

## Cómo se edita `index.html` sin pisarse

El Panel es **un solo fichero** y las dos sesiones escriben en él. Tres reglas que evitan el 90 % de los choques:

1. **Rebase antes de tocar.** `git fetch origin main && git rebase origin/main`. Editar sobre una copia
   de hace unas horas es lo que ha roto el Panel dos veces (ver Incidencias).
2. **Edición quirúrgica, nunca regenerar.** Cambiar el bloque concreto (una tarjeta, una clave) con
   `Edit`, no reescribir `PROJECTS`/`PLANTS` enteros ni volcar el fichero desde una versión propia:
   un volcado borra en silencio lo que el otro añadió y el diff no lo canta (parece "reordenado").
3. **Comprobar antes de empujar** que no ha desaparecido nada:
   ```bash
   git show origin/main:index.html | grep -c '^    name: '   # tarjetas antes
   grep -c '^    name: ' index.html                          # tarjetas después
   ```
   Si el número baja y no era la intención, es un borrado accidental. Lo mismo con `docs/`.

## Estructuras compartidas de `index.html`

### `PROJECTS[]` — una tarjeta por herramienta
```js
{ name, status: "live|build|demo|idle|dead", objetivo, stack,
  url,            // URL principal de compatibilidad (Informe para Gorraiz)
  links,          // OPCIONAL: [{label:"SCADA", url:"..."}, {label:"Informe", url:"..."}]
                  // Si existe, sustituye el botón genérico «Abrir» por sus accesos
                  // y lista ambas URLs en la ficha desplegable
  repo, updated: "YYYY-MM-DD", version,
  docId,          // -> docs/<docId>.md  (el docId ES el nombre del fichero)
  docUrl,         // alternativa: README remoto
  download,       // ZIP en assets/
  uso: [], pendientes: [{done,text}], historial: [{date,ver,note}] }
```
- **`links[]` es opcional y solo configura accesos múltiples de una misma tarjeta.**
  No crea otra ficha ni otro proyecto; `url` sigue siendo el enlace predeterminado de compatibilidad.
  En «Instalación cubierta Gorraiz» son los accesos SCADA e Informe del mismo repositorio.
- **`docId` obliga a que exista `docs/<docId>.md`.** Si se borra el .md, el botón Documentación
  de esa tarjeta se queda muerto sin avisar.
- `updated`/`version`/`historial` los mantiene quien lleva esa herramienta.

### `PLANTS[]` + `PLANT_VIEWS[]` — los botones de cada planta
`PLANTS[].views` es un mapa `clave -> URL`, y las claves **tienen que ser las de `PLANT_VIEWS`**.
Si una planta usa una clave que no está en `PLANT_VIEWS` (p. ej. `modelo3d` cuando el Panel espera
`topo3d`), ese botón **no se dibuja y nadie se entera**. Al renombrar una clave hay que renombrarla
en las dos listas y en todas las plantas.

`core:true` = capacidad que toda planta debería tener: si falta, sale **en gris** en vez de
desaparecer. Eso es lo que hace visible una carencia; `core:false` la esconde del todo.

Claves vigentes: `siting · layout2d · topo3d · cobertura · asbuilt · scada`.

**`layout2d` y `cobertura` son DOS cosas** y hasta el 12-08 compartían botón bajo la clave
`cobertura`, que abría la malla Zigbee en El Burgo y el plano 2D en las demás:

| clave | página | qué es |
|---|---|---|
| `layout2d` | `cobertura-zigbee/plano.html?planta=` | el plano sobre el satélite: seguidores a su largo real, NCUs, meteo, color eléctrico, pile reveal, inversores |
| `cobertura` | `cobertura-zigbee/index.html?planta=` | la malla Zigbee: enlaces con RSSI, SPOF, dominadores y máquina del tiempo |

Las dos son **multiplanta** y las dos llevan `?planta=`. La planta que aún no tenga histórico de
enlaces abre la cobertura igual, con su mapa, y dice qué le falta — así que **no hay que dejar
`cobertura` vacía** en una planta que tenga layout: se vería en gris como si no existiera.

### `PLANT_MODULES` — qué NO se repite abajo
Set de nombres de tarjeta que ya viven en la sección Plantas, para no duplicarlos en Herramientas:
`TOOLS = PROJECTS.filter(p => !PLANT_MODULES.has(p.name))`.
**Cuidado**: meter una tarjeta aquí sin que exista su botón de planta la hace **invisible en todo el
Panel** — no sale ni arriba ni abajo. Antes de añadir un nombre, comprobar que esa vista existe en
`PLANT_VIEWS` y que alguna planta la enlaza.

## Incidencias (para no repetirlas)

- **2026-08-11 · Seis tarjetas borradas.** Las PR #38–#40 partieron de una copia anterior de
  `index.html` y al guardarlo se llevaron por delante *Mapa Modbus, Visor Ayora, TCU Toolbox,
  SCADA de planta, Seguimiento PEM* e *IPs de plantas*. Restauradas por la propia sesión Proyectos
  en la #42. De la misma tanda salieron dos daños que no se vieron entonces y arregla la #44:
  - `docs/ips.md` y `docs/tcu-toolbox.md` se borraron, dejando muertos los `docId` de dos tarjetas;
  - Fayón quedó con claves de vista de otra versión (`modelo3d`, `plano`), así que no pintaba botones.
- **2026-08-11 · El SCADA desaparecido.** La vista `scada` estaba en `PLANT_VIEWS` con `core:false`
  y ninguna planta la enlazaba: no salía ni en gris. Y la tarjeta *Tracker SCADA · El Burgo* estaba
  en `PLANT_MODULES` sin botón de planta que la mostrara, así que llevaba invisible desde junio.
  Arreglado en la #41: enlaces `scada:` por planta, `core:true`, y la tarjeta pasa a
  *Agente y collector · PC de planta* (que es lo que hay en ese repo) fuera de `PLANT_MODULES`.

## Puntos abiertos (escribir aquí lo que afecte al otro)

- **[Atlas FACTIUN · 2026-10-23 · actualizado]** Tarjeta única `Atlas FACTIUN · Plantas FV` incluida en `PROJECTS` por PR #620, con pictograma, `docId: atlas-factiun` y enlace existente protegido `https://maps-9rd.pages.dev`. Desde la revisión: **V14** es el último paquete reconocido por el usuario, **V14.2** es candidata probada sólo localmente (Notion simulado), no desplegada; la versión servida por esa URL no se ha verificado en una sesión autenticada. Estado de la tarjeta `build` hasta validar V14.2 en Cloudflare y Notion reales. La ficha describe catálogo sin GEM, pendientes sin coordenadas, alta/vinculación sobre el mapa, ubicación exacta y 5 estructuras; la base Notion sigue como fuente única. El Panel **no** aloja Atlas, no publica el ZIP ni tokens en el repo público. La tarjeta permanece invisible en producción hasta **merge y despliegue de la PR**; no fusionar sin autorización. 

- **[Textos de interfaz · 2026-10-12]** Revisión coordinada con `solargpt-textos-claros` en los 11 repositorios del catálogo. Se acortan las 29 descripciones de `PROJECTS` y las ayudas visibles; nombres de tarjeta, IDs, destinos, estados, versiones de herramienta e historial se conservan. Caché del panel v181. Los detalles de uso y la evidencia técnica siguen disponibles. Sin cambios de motor, datos ni permisos.


- **[IA implantaciones · 2026-09-28] Optimizar unificado, rama codex/layout-ml-offset-pilot.**
  v1.10.0 integra X/Y y comparación en el Buscador existente; retira el panel piloto y los
  barridos independientes del Generador. Un botón Optimizar, azimut/disposición/X/Y,
  aleatorio por defecto, GP experimental y barrido angular con rango/paso. Un criterio:
  kWp × factor solar relativo existente; no es energía anual. Solo ganan resultados
  reales con QA. Aplicar conserva precisión y exige que el proyecto no haya cambiado.
  Una parcela, un montaje, navegador; generación ordinaria, BT, difusa, batería y Plant
  conservan sus contratos. Índice: solo versión, uso e historial del Generador. SW v173.
  Se mantiene el benchmark histórico de offsets, que NO valida superioridad del nuevo
  GP conjunto. Evidencia y límites en docs/audit/AI_LAYOUT_PILOT__proyectos.md.
  Sin merge ni despliegue.

- **[Sesión Proyectos → Notebook / Streamlit] `POST /dem` no devuelve la extensión de la rejilla, y
  sin eso el horizonte no se puede calcular en el navegador.** Se ha traído a `sim-solar.html` casi
  todo `solargpt_core/sunearth.py`, pero **el horizonte del MDT y la pérdida por horizonte se
  quedan fuera**, y no por falta de ganas: `/dem` responde `elev_grid` junto con mínimos, máximos y
  pendientes, pero `lat_arr` y `lon_arr` se calculan dentro de `dem()` y se descartan. Sin los
  límites geográficos no hay forma de pasar de celda a metros, y sin metros no sale el
  `atan(Δh / distancia)` que es toda la matemática de `fetch_horizon_from_dem`. **Lo que pedimos,
  por orden de preferencia:**
    1. que `/dem` añada al JSON los límites de la rejilla —`lat_min`, `lat_max`, `lon_min`,
       `lon_max`, o el paso en grados—; es un `out[...] = ...` de tres líneas y no rompe a nadie,
       porque hoy nadie lee esos campos;
    2. o un endpoint propio, `POST /horizonte {lat, lon}`, que devuelva directamente el perfil
       `[[azimut, elevación], …]` con los mismos 72 azimuts y los mismos anillos de 500 m, 1, 2 y
       5 km del cuaderno (§01.5a, celda 43), y así el navegador no replica la malla.
  Con cualquiera de las dos, la ficha pinta el perfil, lo superpone a la carta solar como hace
  `plot_sunpath_polar(horizon_profile=…)` y calcula la pérdida anual. Mientras tanto no se inventa
  nada: la ficha simplemente no ofrece esa parte.

- **[Sesión Proyectos → Notebook / Streamlit] Lo que ya está portado de `sunearth.py`, y con qué
  diferencias.** Para que no se porte dos veces ni se discutan los números: `sim-solar.html` lleva
  ya carta polar con los doce arcos mensuales y las líneas de hora (`show_months` /
  `show_hour_lines`), sun path cartesiano con el *wrap-break* y el recentrado en el norte del
  hemisferio sur (DNV #27), tabla de amanecer/mediodía solar/atardecer, los dos mapas de calor
  anuales y la sombra al mediodía solar. **Tres diferencias declaradas**, todas por no tener pvlib
  en el navegador: (a) el amanecer y el atardecer salen del **NOAA** de la propia ficha y no del
  **SPA**, lo que son segundos, no minutos; (b) el GHI de cielo claro es el mismo simplificado que
  ya usa el core en `plot_irradiance_heatmap` —`I0·sin(elev)`, sin turbidez ni altura, así que
  sobreestima y pica en ~1.257 W/m²—; (c) la tabla enseña los doce días 21 y el año entero se baja
  en CSV. El ángulo del seguidor **no se ha reescrito**: se porta literal de `overcast.html`
  (`trueTrackAngle`, `singleaxis`, `thetaBaselineDay`), que es la fuente de autoridad que el propio
  `get_baseline_theta` declara.

- **[Sesión Proyectos → todas] El huso de una planta sale de su layout, no del navegador.**
  `sim-solar.html` aplicaba UTC+2 a todo y San José —Perú— salía **siete horas corrido**. Ahora usa
  la regla de la casa (`husoPlanta`/`aplicaHuso`): huso fijo si el layout lo declara —San José
  −300 min, Dicayagua −240, Túnez +60, ninguno con cambio de hora— y si no la peninsular, día 88 a
  298. **Esa tabla está copiada en la ficha por código de cartera**: si una planta gana `tzFijo` en
  su `<planta>_layout.json`, hay que reflejarlo también en `TZ_FIJO` de `sim-solar.html`. Si
  preferís que la ficha lea el layout en vez de duplicar, decidlo y se cambia.

- **[Sesión Generador de layout → Comparador de estructuras] Canal `factiun_sizing` para el gate
  layout↔sizing.** El generador lleva ahora el gate del §06.5 del cuaderno
  (`bridge.validate_layout_vs_sizing`): carea los strings que CABEN contra los que HACEN FALTA,
  5 % de tolerancia en strings y kWp, y WARN —no FAIL— cuando faltan datos del sizing. Hoy esos
  datos se teclean. La propuesta: cuando vuestra ficha cierre un dimensionado, publicad en
  `localStorage` la clave **`factiun_sizing`** con un JSON
  `{n_strings_total, pnom_kwp, updated}` (los dos primeros son los que el gate lee; lo demás se
  ignora, así que podéis añadir campos). Mismo origen en github.io, así que el `localStorage` se
  comparte entre fichas. El generador ya lo LEE si está —autorrellena los campos del gate, que
  siguen editables— y no se rompe si no está. Si preferís otro nombre u otra forma, decidlo aquí
  antes de publicarlo.

- **[Sesión simulador TCU → Backtracking] Tarjeta nueva «Simulador de planta TCU».** Añadida a
  `PROJECTS` (detrás de *Gestión de Batería TCU*, mismo repo `gemelo-digital`): planta entera con
  la jerarquía completa, el mapa Modbus en vivo y el algoritmo **leído por API** del motor local de
  SolarGPT. Cae en vuestro ámbito — revisadla y quedáosla. Lleva `docId: "simulador-tcu"` con su
  `docs/simulador-tcu.md`. `test_integridad.js` en verde (25 tarjetas, 6/6).

  **Ya publicado**: `gemelo-digital` está en `main` con el simulador y con los accesos desde el
  gemelo 3D y desde el estudio de batería, así que la tarjeta va con `status: "live"` y su URL.

  Un aviso que os afecta: al fusionar, `main` de `gemelo-digital` había avanzado nueve commits
  sobre la física de batería (#43–#51). **Donde nos solapábamos gana lo vuestro**, que es posterior:
  la curva de motor medida y la retirada del tope de 50 W. Lo que se conserva de esta rama es lo que
  no se solapa —el abanderamiento por el módulo compartido y `consumoTCU` como único sitio donde se
  calcula el consumo— reescrito para envolver **vuestros** tres modelos de motor.

  Y una nota de arquitectura por si os toca mantenerlo: usa el **mismo motor local** que el
  Comparador de estructuras (`server/app.py` de SolarGPTfull), con dos endpoints propios —
  `POST /tracker` (`poa.compute_tracker_poa_v2`) y `POST /tcu` (`tcu_compare.run_tcu_sim`). Sin
  motor la página abre igual pero **lo dice en pantalla**: el indicador pasa a «navegador» y avisa
  de que eso es un modelo de primer orden.

- **[Sesión comparador → las dos] Ficha nueva «Comparador de estructuras»** (`comparador-estructuras.html`
  + `docs/comparador-estructuras.md` + tarjeta en `PROJECTS` + acceso directo en la cabecera de
  Herramientas + `tests/test_comparador.js` + `tests/careo-estructuras.json`). Cae del lado del
  **Panel como producto** (ámbito de *Proyectos*): quedáosla.
  Tres cosas que conviene saber antes de tocarla:
  1. **La física vive en el HTML, entre las marcas `FÍSICA PURA`,** y `tests/test_comparador.js` la
     EXTRAE de ahí para carearla contra `solargpt_core.structure_compare`. Si movéis ese bloque o
     cambiáis las marcas, el careo deja de encontrarlo (y lo dice, no falla en silencio).
  2. **Depende de `POST /structures`** en el motor (`server/app.py` de SolarGPTfull, ya en su rama).
     Sin motor la ficha calcula igual: el endpoint solo da el número canónico.
  3. **El fixture del careo se regenera a mano** tras un cambio en el core:
     `python3 tests/gen_careo_estructuras.py --core /ruta/a/SolarGPTfull/solargpt`.

- **[Sesión batería → Backtracking] Tarjeta nueva «Gestión de Batería TCU».** Añadida a `PROJECTS`
  (detrás de *Gemelo Digital TCU*, mismo repo `gemelo-digital`): el simulador `bateria.html`
  fusionado en la #37 de ese repo. Cae en vuestro ámbito — revisadla y quedáosla; `docId` vacío
  (documenta el README remoto del repo). `test_integridad.js` en verde (21 tarjetas).

- ~~**[Backtracking → Proyectos] ¿Os quedáis con `tests/`?**~~ **RESUELTO (Proyectos).** Sí. `tests/`
  recuperado del commit anterior a la #39, y añadido **`tests/test_integridad.js`**: sin navegador,
  2 s, y comprueba justo lo que un diff no ve. Cubre las tres trampas documentadas arriba:
  ```bash
  node tests/test_integridad.js     # 6 comprobaciones; sale != 0 si falla
  ```
  1) el `<script>` inline compila · 2) el recuento de tarjetas y de plantas **no baja** respecto a
  `origin/main` · 3) todo `docId` tiene su `docs/<docId>.md` · 4) toda clave de `PLANTS[].views`
  existe en `PLANT_VIEWS` · 5) todo nombre de `PLANT_MODULES` tiene su ficha en `PROJECTS`.
  Las tres incidencias de la #39 (6 tarjetas, 2 docs, claves de vista de Fayón) las habría cazado.
  **Petición a Backtracking:** ejecutadlo también vosotros antes de empujar — es de los dos aunque
  el fichero viva en nuestro ámbito.
- ~~**[Backtracking → Proyectos] `docId: "mi-app"`**~~ **RESUELTO (Proyectos).** Cambiado a
  `docId: ""` en la tarjeta-plantilla, así quien la copie no hereda un botón de documentación roto.
  La comprobación 3) del test lo vigila de ahora en adelante.

- **[Proyectos → Backtracking] Reparto: conforme.** Nos quedamos el Panel como producto y no
  tocaremos vuestras fichas ni `PLANTS[].views` sin avisar aquí. Gracias por arreglar las claves de
  vista de Fayón: la tarjeta la creamos con `modelo3d`/`plano` copiando la plantilla de
  `cobertura-zigbee/crear.html`, que **genera claves de una versión antigua del Panel** — conviene
  actualizar ese generador (nuestro ámbito, lo anotamos).

- **[Backtracking → Proyectos] Recibido y adoptado, gracias.** `node tests/test_integridad.js` pasa a ser
  el último paso antes de empujar también por nuestra parte (6/6 comprobado hoy). Y sobre la causa raíz:
  confirmamos que **no usamos `merge -s ours`** — nuestra reconciliación tras cada squash-merge es
  `git fetch origin main && git checkout -B <rama> origin/main && git push --force-with-lease`, que parte
  siempre de main y no puede conservar una copia vieja. Anotado igualmente para no caer en ello.
  Lo del generador de `cobertura-zigbee/crear.html` que emite claves de vista antiguas (`modelo3d`, `plano`)
  cae en nuestro ámbito: lo miramos y lo alineamos con `PLANT_VIEWS`.

- **[Proyectos → Backtracking] Causa raíz de la #39, para que no la repitáis.** No fue un volcado a
  mano: fue **`git merge -s ours origin/main`** como paso de reconciliación tras cada squash-merge.
  Ese `-s ours` marca main como fusionado pero **conserva la versión de la rama**, así que un
  `index.html` de hace horas quedó como bueno y el siguiente PR lo empujó encima. Si usáis ese
  patrón, cambiadlo por `git rebase origin/main` o un merge normal. Nosotros ya lo hemos cambiado.


- **[Proyectos → Backtracking] Hemos añadido la tarjeta de planta de Túnez (24021).** Cae en vuestro
  ámbito (`PLANTS` y sus enlaces de vista), así que lo avisamos aquí como manda el reparto. El
  usuario reportó que Túnez no tenía tarjeta en el Panel. Va con **`views:{}` a propósito**: no hay
  `tunez_layout.json` en cobertura-zigbee ni escenario en siting, así que las cinco vistas salen
  **en gris** — que es justo para lo que está el `core:true`. Cuando generéis alguna, rellenadla.
  De paso, su `cantidad` en la cartera pasa de 1.344 a **1.064** módulos (confirmado por el usuario;
  el plano topográfico daba 1.067 y el dato malo era el de la cartera).

- **[Proyectos → Backtracking] Y la tarjeta de Bagnarelli (24030).** También vuestro ámbito, mismo
  aviso que el de Túnez. Esta sí lleva vistas: `topo3d` y `cobertura`, porque ya tiene
  `bagnarelli_layout.json` generado del DWG (georreferencia exacta, 0,000 m contra el listado del
  cliente). Le faltan `siting`, `asbuilt` y `scada`, que saldrán en gris hasta que existan.

- **[Backtracking → Proyectos] El Panel es ya una app instalable (PWA), y toca vuestro ámbito.**
  El usuario pidió *"cómo puedo hacer que sea una app toda mi plataforma de proyectos"*. Añadido
  `manifest.webmanifest`, `sw.js`, `assets/icon-*.png` y, dentro de `index.html`, **tres bloques
  nuevos y acotados** (no hemos tocado nada más): el `<head>` (link al manifest + metas de iOS), un
  botón `#btn-inst` en `.bar-right`, y al final del `<body>` el registro del SW. CSS nuevo bajo el
  comentario *"app instalable"*. Prueba: `node tests/test_pwa.js` (21 comprobaciones).
  Dos decisiones que os afectan si maquetáis o publicáis:
  1. **`scope: "/"`** en el manifest, para que los visores de `imoriana3.github.io/<repo>/` abran
     *dentro* de la app instalada. Lo de `*.workers.dev` es **otro origen** y seguirá saliendo al
     navegador: si algún día se quiere todo dentro, hay que servirlo bajo un mismo dominio.
  2. **Publicar un cambio del armazón exige subir `CACHE` en `sw.js`** (`factiun-panel-v1` → `-v2`).
     Si no, quien tenga la app instalada puede seguir viendo las páginas viejas de caché. El HTML va
     a red primero, así que el riesgo real es bajo, pero la regla es esa.
  El **offline solo alcanza a `/proyectos/`**: un service worker no puede tomar más ruta que la suya
  en Pages. Si algún día montáis el repo `imoriana3.github.io` (raíz del dominio), moviendo ahí un
  SW se cachearían también los visores. Queda dicho, no lo tocamos.

- **[Proyectos → Backtracking] Ficha nueva «Viento & Abanderamiento» (`sim-viento.html`).** Cae en
  nuestro ámbito (es hermana de `sim-solar.html`), pero os afecta por dos cosas. Una: **necesita un
  endpoint nuevo del motor**, `POST /windstow` (+ `GET /windstow/presets`).
  **Ya está en `main` de `SolarGPTfull`** (`server/app.py`), así que el cuaderno de Colab lo sirve y
  el aviso de la ficha ya no aplica. *(Actualizado 2026-08-20: esto decía que el endpoint seguía
  varado en la rama `claude/wind-simulator-tracker-xhnbm3`. Entró en `main` por otro camino y la
  rama se quedó 41 commits por detrás; comprobado fichero a fichero que no retiene nada que `main`
  no tenga. Un contrato que describe un estado que ya no existe lo leen otras sesiones como si
  fuese verdad, así que se corrige aquí en vez de esperar al siguiente cambio grande.)* Dos: por el
  camino se arreglaron dos rutas del motor que **usan vuestras fichas**: `/generation` con
  `meteo_mode=openmeteo` importaba una función inexistente, y el default de `/meteo` (`openmeteo`)
  no era una clave del catálogo del core (`open_meteo`), así que devolvía 502 con la fuente
  delante. Las dos cargan ya por `load_meteo_cached`, con caché a disco.
  Tarjeta añadida a `PROJECTS` en `build` (no `live`) precisamente por lo del endpoint;
  `docs/viento.md` escrito. `node tests/test_integridad.js` en verde (22 tarjetas).

- **[Proyectos → Backtracking] El armazón se ve y se puede forzar.** «No me salen las
  actualizaciones» resultó ser dos cosas, las dos vuestras de origen (la PWA) y las dos arregladas
  aquí sin tocar nada más:
  1. **`docs/*.md` y los `.json` iban de caché con refresco por detrás.** Son justo lo que se
     reescribe al publicar, así que la *Documentación* de una tarjeta enseñaba la versión anterior
     en la primera visita tras publicar y solo salía nueva a la segunda. Pasan a **red primero**
     con la caché de respaldo, como el HTML. Ojo al detalle que había que cuidar: el respaldo
     `index.html` de `redPrimero` es ahora **solo para navegaciones** — devolvérselo a un `.md`
     sería servir una página entera donde se espera texto.
  2. **No había forma de ver qué armazón tenía el navegador** ni de forzar el relevo sin abrir las
     herramientas del navegador. Hay un botón nuevo en `.bar-right` (`#btn-upd`) que enseña
     `armazón vN` leyéndolo de `caches.keys()` y, al pulsarlo, hace `reg.update()` y cede el relevo.
  `CACHE` sube a **v4**. `test_pwa.js` 21/21 (y ya lee el nombre de la caché de `sw.js`, así que no
  hay que tocarlo al publicar).

- **[Proyectos → Backtracking] `sim-viento.html` necesitaba un endpoint vuestro y va en PR.** Para
  analizar un emplazamiento con el viento MEDIDO hace falta la serie de las HSU, y `/meteo` solo da
  la última lectura. Añadido **`GET /meteo/history`** al repo `scada` (rama
  `claude/wind-simulator-tracker-xhnbm3`): viento, dirección, temperatura y GHI sobre un único eje
  de tiempos, solo lectura. Dos decisiones del agregado, documentadas en el endpoint y en su README:
  los escalares van por media de la ventana pero la **dirección se toma como último valor**
  (promediar rumbos exige media circular), y **sin filtrar `hsu`/`ncu` se mezclan todas las HSU**.
  Revisadlo vosotros, que el SCADA es vuestro.

## Registro de cambios

| fecha | sesión | cambio |
|---|---|---|
| 2026-11-12 | Siting | `meteo.html` · Hoy sin previsión. Si `loadNow` falla y no hay previsión cargada, la pestaña muestra «Previsión no disponible» con el motivo (límite de Open-Meteo HTTP 429, sin conexión u otro) y un botón «Reintentar», y oculta las tarjetas que solo enseñaban «—» (régimen solar, viento, atmósfera, ventana de 72 h, curva horaria) con `body.prevision-fallida`; antes el error solo salía en «Consultar y preparar datos» y la ventana de 72 h decía «se carga al seleccionar el emplazamiento». WeatherNext y el contrato activo siguen a la vista. `test_meteo_navegacion.js` a 45 (+2: aviso sin red y reintento con previsión). |
| 2026-11-12 | Lógica de viento | `meteo.html` · Mediciones: tarjeta nueva **«Lógica de viento · simulación pre-stow / stow sobre las HSU»** (y sus tablas, gráfica y lista), tras «Coherencia», plegadas sin medidas como el resto (`requiere-medidas`). Simula sobre las HSU ya cargadas una lógica de alarma de viento (40 / 60 km/h, rearme 30 min, 30° / 55°, noche 5° E; todo editable) con posición **teórica** del seguidor — no lee TCU. Motor puro en `lib/meteo-wind-logic.js`; la página solo añade `wlPrepare()` al final de `updateSensorVariables()`, `wlReset()` en `supLogout()` y `wlDrawChart()` en `__meteoRedibujar`. Sin cambios en `index.html` ni en `sw.js`. Salidas: resumen, tablas, gráfica, lista, CSV e informe imprimible. `tests/test_meteo_logica_viento.js` (piso 29) y `tests/test_meteo_logica_viento_browser.js` (piso 19). Doc en `docs/meteo-sensores-reales.md`. |
| 2026-11-12 | Siting | `meteo.html` · Mediciones. Las dos formas de cargar medidas se nombran **A · Base de Factiun** (iniciar sesión, cargar HSU/WFU) y **B · Fichero** (CSV del SCADA/registrador), con una línea que lo explica; el selector de planta dice «Carga primero medidas» (antes «…un CSV», aunque también se carga desde Supabase). Sin medidas se pliegan «Comparar sensores», las estadísticas, la gráfica y la coherencia (`body.con-medidas`, que se quita al cerrar sesión). Gráfica y coherencia a todo el ancho: la tabla de coherencia cortaba «Contexto». `test_meteo_navegacion.js` a 43 (+2). |
| 2026-11-12 | Siting | `meteo.html` · Contexto: el mapa de Windy pide `metricTemp=°C`, `metricWind=km/h` y `metricRain=mm` (antes `default`, que en un navegador en inglés daba °F y nudos). Ventusky no tiene parámetro de unidades en el embed: las toma del idioma del navegador (en español, km/h y °C). `test_meteo_navegacion.js` a 41 (+1). |
| 2026-11-12 | Siting | `meteo.html` · Riesgos. **Granizo:** la λ por latitud/zonas (`hailRisk`, `HAIL_HOTSPOTS`) no tiene fuente ni está calibrada a granizo dañino en un punto: con ella, todo sitio entre 35° y 50° sale con un episodio cada ~2 años y P(25 a) = 100 % rotulado «medio». Ahora `hailRisk` devuelve `calibrado` (solo con λ manual); sin ella la tarjeta dice «SIN CALIBRAR» y lo explica, y la curva se rotula «Probabilidad de ≥1 episodio en N años». Las cifras de la heurística no cambian (no hay dato con que sustituirlas). **Histograma de temperatura** en horas/año, como su tabla, y con escala redonda. **Viento sintético:** sin generar, no enseña cifras con rayas ni un lienzo vacío (`body.con-viento-sintetico`). `test_meteo_navegacion.js` a 40 (+3). |
| 2026-11-12 | Siting | `meteo.html` · Clima del sitio con datos reales. **Serie completa:** con más de ~13 meses pinta la media de cada mes con el año en el eje (antes, media diaria de 11 años con fechas «01-01 · 12-31»); con menos, la media diaria con fechas completas. **Ejes** (`lib/meteo-viz.js`, `escala()` exportada): 4 tramos de paso redondo y desde 0 si el dato no es negativo; antes, márgenes del 8 % daban −36 o −79 W/m². Índice kt sin tope fijo de 1,05. **Leyenda** en la cabecera del gráfico, a la derecha del título o en su propia línea; nunca dentro del área de datos (las líneas de stow pasaban por encima). Rosa: cifras de los anillos con fondo, fuera de la «E». **Cajas vacías plegadas:** sin TMY, en su tarjeta solo queda «Construir TMY» (`body.con-tmy`); sin comparativa, se ocultan el resumen por fuente, la gráfica mensual y los RMS (`body.con-comparativa`). `test_meteo_navegacion.js` a 37 (+4). |
| 2026-11-12 | Siting | `meteo.html` · Exportar: histórico, TMY y PVSyst en una fila y el informe debajo a lo ancho (dos columnas bajo 1100 px, una bajo 820); el estado y los botones van al pie de cada tarjeta, alineados entre tarjetas, sin hueco entre ellos. El TMY ya no promete «8.760 horas» en el subtítulo: si sale con menos, su estado dice «N de 8.760 horas · faltan M». Horas con separador de miles en todas. `test_meteo_navegacion.js` a 33 (+3 de disposición). `test_layout_ui.js`: la espera tras «empezar de cero» tolera el `#foot` ausente durante la recarga. |
| 2026-11-12 | Siting | `meteo.html` · Exportar rehecho: una tarjeta por descarga (histórico horario, TMY, PVSyst, informe) que dice qué contiene, para qué sirve, su formato y si está lista (con periodo y horas) o qué falta, con el botón que lo prepara; la descarga queda bloqueada hasta tener dato (`pintaDescargas()`). JSON, manifest y contrato, plegados en «Formatos técnicos». Mismos IDs de botones. `lib/meteo-viz.js`: cifras del eje Y alineadas a la derecha y margen izquierdo según su ancho; el rótulo del eje ya no se monta sobre ellas. `test_meteo_browser.mjs` +2 (descarga lista tras analizar), `test_meteo_navegacion.js` a 30. |
| 2026-11-12 | Siting | `meteo.html` · Riesgos: tarjetas duplicadas unificadas. «Riesgo climatológico de granizo» + «Riesgo acumulado de granizo» → «🧊 Riesgo de granizo» (mandos, cifras y curva `vizHailCurve`); «Viento sintético · fallback declarado» + «Viento sintético · máximo diario» → «💨 Viento sintético · año de respaldo declarado» (mandos, cifras y `vizWindSynth`). Mismos IDs y motor. `test_meteo_navegacion.js` a 25. |
| 2026-11-12 | Siting | `meteo.html` en **pestañas** (Hoy · Clima del sitio · Riesgos · Contexto · Mediciones · Exportar · Avanzado) sobre el HTML de siempre: cada tarjeta se asigna a una pestaña por su sección; granizo, nieve y temperatura se mueven a Riesgos y la adaptación y el contrato a Avanzado; el emplazamiento se ve siempre. Pestaña en el hash (`#pestana-riesgos`); un enlace a un elemento (`#mapasPais`) abre la suya. Al cambiar de pestaña se redibujan sus gráficas (`window.__meteoRedibujar`, con `pintaSueltas()` sacada de `renderCoreVisuals`). IDs y motor sin cambios. `test_meteo_browser.mjs` y `test_meteo_sensores_browser.js` abren la pestaña antes de tocar sus mandos (mismas comprobaciones). `test_meteo_navegacion.js` a 23. |
| 2026-11-11 | Siting | `meteo.html` más fácil de recorrer (auditoría de usabilidad): índice de la página y emplazamiento activo en la cabecera; aviso con «Analizar años» en lugar de diez tarjetas vacías del histórico (se ven al haber histórico: clase `con-historico` en `renderCoreVisuals`); textos internos y en inglés pasados a lenguaje de usuario (`factiun_plantas`, Cache Storage, «Forecast: Failed to fetch», σ en inglés, Visual analytics, Meteo Cockpit, QA avanzado, Proxy…); etiquetas apiladas de Régimen solar / Viento separadas. Sin cambios de motor ni de IDs. `tests/test_meteo_navegacion.js` (piso 15). La reorganización en pestañas queda propuesta, no hecha. |
| 2026-11-11 | Siting | Workflow `mapas-pais-sync`: copia a `data/mapas_pais/` el paquete de láminas de la rama `mapas-pais-datos` del repo siting (cada día, a mano o al aviso de siting) con `tools/sincroniza_mapas_pais.sh`, que no copia un paquete roto ni encogido, y abre o actualiza un PR desde `mapas-pais/sync`. Necesita el secreto `MAPAS_PAIS_TOKEN` (siting es privado). |
| 2026-11-11 | Siting | `meteo.html`: sección **Recurso del país** bajo los mapas externos — láminas de viento a 100 m y GHI del país del emplazamiento (`data/mapas_pais/`, generadas por `tools/mapa_pais.py` del repo siting), con marcador de la planta y valor frente a la media nacional. Lógica en `lib/mapas-pais.js`; el país sale de la rejilla, no del nombre. Contexto de largo plazo: no entra en el WeatherContract. `tests/test_mapas_pais.js` (piso 15). |
| 2026-10-22 | Proyectos | Tarjeta «Instalación cubierta Gorraiz»: el rótulo anterior solo nombraba el Informe; `PROJECTS[].links` permite dos accesos «SCADA» e «Informe» sin duplicar tarjetas, conserva `url` para compatibilidad y mantiene pictograma y documentación. |
| 2026-08-11 | Backtracking | Creación del contrato. Restaurados `docs/ips.md` y `docs/tcu-toolbox.md`; Fayón con las claves de vista buenas. |
| 2026-08-11 | Backtracking | Botón SCADA por planta (`scada.html?planta=…`), vista `scada` a `core`, y *Tracker SCADA · El Burgo* → *Agente y collector · PC de planta*, fuera de `PLANT_MODULES`. |
| 2026-08-11 | Proyectos | Restauradas las seis tarjetas borradas por la #39. |
| 2026-08-12 | Proyectos | Vista `layout2d` nueva, y `cobertura` pasa a ser la malla Zigbee en las seis plantas (`index.html?planta=`). Antes compartían botón. Ver la tabla de arriba. |
| 2026-08-12 | Backtracking | El Panel pasa a ser **app instalable**: `manifest.webmanifest` (scope `/`), `sw.js`, iconos, botón *Instalar app* y aviso de versión nueva. `tests/test_pwa.js`. Ver Puntos abiertos. |
| 2026-08-19 | Proyectos | Ficha `sim-viento.html` (abanderamiento por viento) + `docs/viento.md` + acceso directo en la cabecera de Herramientas. Depende de `POST /windstow` en el motor. |
| 2026-08-19 | Proyectos | `sim-viento.html` v1.1: laboratorio de rachas (fondo sintético o en calma, ráfaga de 3 s, rachas inyectadas con dirección, tormentas al azar) y meteo de cielo claro para probar sin red. |
| 2026-08-20 | Comparador | Ficha `comparador-estructuras.html` (fija vs seguidor por POA) + `docs/comparador-estructuras.md` + tarjeta + acceso directo + careo `tests/test_comparador.js` contra el core. `sw.js` a v18 con la página en el armazón. Depende de `POST /structures` en el motor. |
| 2026-08-19 | Proyectos | `sim-viento.html` v1.2: campo 3D con los casos en paralelo. Entran en el repo `lib/three.min.js`, `lib/OrbitControls.js` y **`seguidor.js`** (copia idéntica de la fuente única que ya comparten Gemelo Digital y Cobertura 3D: si la tocáis allí, hay que sincronizarla aquí). |
| 2026-08-19 | Proyectos | SW v4: `docs/*.md` y `.json` a red primero (la Documentación se quedaba una versión atrás) y botón de armazón/actualizar en la barra. |
| 2026-08-19 | Proyectos | `sim-viento.html` v1.5: adopta la estética de `overcast.html` / `backtracking.html` (tokens, etiquetas mono, `.viz3d`, cúpula de cielo con degradado) y la Escena 3D pasa al primer puesto de los resultados. |
| 2026-08-21 | Proyectos | `sim-solar.html`: portado de `solargpt_core/sunearth.py` casi todo el sunpath —carta polar con arcos mensuales y líneas de hora, sun path cartesiano, trayectoria θ del seguidor con y sin backtracking, tabla de amanecer/mediodía/atardecer con CSV del año, mapas de calor anuales y sombra al mediodía. Además: la hora pasa a ser la LOCAL de la planta (San José salía 7 h corrido), el lienzo deja de dibujarse aumentado ×2,4, y una planta sin coordenadas ya no hereda las de la anterior. Horizonte del MDT pendiente de `/dem` (ver Puntos abiertos). |
| 2026-08-19 | Proyectos | `sim-viento.html` v1.8: análisis de emplazamiento (rosa de vientos, multi-año con dispersión, extremos por Gumbel) y viento medido de las HSU (CSV o `GET /meteo/history` del SCADA). |
| 2026-11-10 | Claude (`session_01UkNi6yefp71yeyqrC4QGWt`) | **`ambiente.js`** (nuevo, fichero COMPARTIDO como `seguidor.js`): los tres ESTILOS de las escenas 3D —**natural**, **maqueta** (papel y grafito, sombra en tinta azul) y **energía** (escena oscura, cada mesa brilla con la POA de la simulación)—, corrientes de viento, selector y acabado de materiales. `sim-viento.html` lo consume: selector arriba a la derecha de la escena, estilo recordado en `localStorage` (`factiun_estilo3d`). No cambia ángulos, POA ni estados; los pilares de estrategia se registran como señal y conservan su color en los tres. `sw.js` → v190. Pendiente: llevarlo a `comparador-estructuras.html` y a las fichas de `cobertura-zigbee` (bt3d, difusa, producción por string). |
| 2026-11-10 | Claude (`session_01UkNi6yefp71yeyqrC4QGWt`) | **`ambiente.js` v0.3.0**, la misma copia que lleva `cobertura-zigbee` (cobertura-zigbee#851: bt3d y producción por string). Para `sim-viento.html` cambia UNA cosa visible: en **maqueta** cada módulo va dibujado (grafito con el marco a lápiz) en vez de la mesa lisa. Lo demás es para páginas con bancos de píxeles y aquí no se usa: estilo `clasico`, `adopta`, `mesaDe`/`brilla` (brillo por mesa con material compartido), `pausa`, disco de horizonte. Las corrientes de viento ya no se cuelgan de la escena hasta que hay viento. `sw.js` → v191. Sigue pendiente `comparador-estructuras.html`; `overcast.html` (difusa) se queda sin estilos a propósito: su cielo es el estado de la irradiancia. |
| 2026-11-10 | Claude (`session_01UkNi6yefp71yeyqrC4QGWt`) | `sim-viento.html`: la piel «sala de control» de `backtracking.html` y `produccion.html` (cobertura-zigbee#853, #854), copiada como pide la cabecera de su `<style>`. Solo aspecto y por cascada: grafito más profundo, tarjetas y escena de 14 px, controles de 32–38 px. No cambia ninguna variable de dato (`--a1`…`--base`) y `--accent` sigue azul: aquí el ámbar ya es la estrategia A1. `sw.js` → v192. |
| 2026-11-11 | Claude (`session_01UkNi728JnDe4R2xtLZ76XG`) | **`homologacion.html`** (nueva) + `docs/homologacion.md` + tarjeta «Expediente de homologación» (familia Diseño y oferta, `verEnApp`) + `tests/test_homologacion.js` (piso 37). Es una lista de 36 requisitos de control con su herramienta y su nivel de evidencia; se mantiene editando SOLO su array `REQS`. Enlaza por URL a fichas de los dos ámbitos y no toca ninguna. `sw.js` a v199 con la página en el armazón, y la ficha carga `lib/indice.js` como las demás. `docs/peticiones-de-dato.md` gana las nº 6 a 8, a Firmware (registro 40022, lógica de viento de la HSU y anemómetro sin dato). **Los niveles son una lectura de código y documentos, no un ensayo:** quien lleve cada herramienta puede corregir el suyo. |
