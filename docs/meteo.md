# Análisis meteorológico — Weather Workbench autónomo

## Objetivo

`meteo.html` es la interfaz meteorológica transversal de Factiun/SolarGPT. Desde v0.4 funciona **directamente en el navegador**: no requiere levantar SolarGPT, Colab ni un servidor local para histórico, TMY, QA, comparación de fuentes, importación, adaptación, descargas o informes.

SolarGPT Python sigue siendo la referencia contra la que se certifica el mirror JS; ya no es una dependencia de ejecución de la interfaz.

## Emplazamientos

Hay dos rutas de selección, sin duplicar la lista de proyectos:

1. **Nuestros proyectos** reutiliza `localStorage.factiun_plantas`, publicado por la Cartera, y si falta o está incompleto completa desde la semilla `SEED` de `cartera-tabla.html`.
2. **Buscar cualquier emplazamiento** usa Open-Meteo Geocoding sin credenciales. Con dos o más caracteres ofrece hasta 8 coincidencias y, al elegir una, fija nombre, país/región, latitud, longitud, cota y zona horaria. Ejemplos: Helsinki, Montreal o Arequipa.

No hay una tercera lista de plantas mantenida a mano. Los proyectos propios persisten por su código estable; los emplazamientos externos persisten como un registro geocodificado separado. Se conserva además el modo **Manual / coordenadas libres**.

## WeatherContract v2

El workbench publica cada dataset preparado como un paquete **WeatherContract v2** en Cache Storage del origen `imoriana3.github.io`, con una referencia ligera en `localStorage`. Al compartir origen, los simuladores de otros repos publicados bajo GitHub Pages pueden leer exactamente el mismo paquete sin volver a descargar meteo.

El contrato contiene:

- `contract_id` y hash de dataset;
- emplazamiento y zona horaria;
- fuente/proveedor/modelo/run/fallback;
- resolución original y operacional, cobertura e interpolación;
- unidades y campos canónicos;
- QA, completitud y BSRN;
- incertidumbre del recurso;
- resumen espacial cuando existe;
- política explícita: **WEATHER informa; CONTROL decide**.

Hay referencias activas separadas para `forecast`, `historical`, `tmy` y `prepared`, además de una referencia al último paquete activado.

## Supervisión 72 h

El forecast activo genera una ventana operativa de 72 h con máximos de viento/racha, precipitación acumulada, temperatura mínima, nieve y CAPE. Señala cruces de umbral como **avisos meteorológicos**, nunca como órdenes de control.

Cuando se configura un endpoint WeatherNext 3 autenticado, el browser intenta primero WeatherNext. Si no está disponible, el fallback a Open-Meteo queda visible y registrado en el WeatherContract.

## Meteo espacial

La primera capa espacial usa centro + norte/sur/este/oeste a un radio configurable. Calcula spreads de viento, racha, temperatura, GHI, precipitación y nubosidad. Está declarada como aproximación geométrica; no inventa una topología NCU si no dispone de ella.

## Incertidumbre y P50/P90

El browser calcula una sigma de recurso conservadora usando el mayor de:

- preset de la fuente;
- RMS multi-fuente;
- residual de adaptación a medida de sitio;
- override explícito cuando exista.

Se evita sumar en cuadratura estos términos correlacionados para no contar dos veces el mismo error de recurso. La sigma se guarda dentro del WeatherContract y del `manifest.json`.

## Export bankable

Además de CSV/JSON/TMY, la v0.8 exporta:

- CSV compatible con flujo PVSyst;
- `manifest.json` con provenance, hash, QA, incertidumbre, spatial y forecast;
- WeatherContract completo en JSON;
- informe HTML/PDF con el manifest incrustado.

## Arquitectura

```text
Cartera / factiun_plantas
          │
          ▼
      meteo.html
          │
          ▼
  lib/meteo-browser.js
          │
 ┌────────┼─────────┐
 ▼        ▼         ▼
Open-    PVGIS     NASA
Meteo              POWER
 │
 ├─ histórico multi-año
 ├─ QA / BSRN / plausibilidad
 ├─ TMY Sandia-FS
 ├─ comparación de fuentes
 ├─ import CSV / PVSyst
 ├─ adaptación de sitio
 ├─ interpolación
 ├─ granizo / viento sintético
 ├─ descargas
 └─ informes
```

**WEATHER informa; CONTROL decide.** Forecast, reanálisis y riesgo meteorológico no sustituyen HSU/SCADA ni interlocks de seguridad.

## Fuentes sin credenciales

### Open-Meteo / ERA5

- forecast inmediato;
- histórico horario multi-año;
- irradiancia, temperatura, rocío, viento, dirección, humedad, presión, precipitación, nieve, CAPE y weather code;
- caché HTTP del navegador por año.

### PVGIS

- histórico horario;
- TMY;
- TMY SARAH3 / ERA5 para comparación climatológica.

### NASA POWER

- histórico horario;
- climatología mensual para comparación.

### Identidad cross-language y cross-origin

El `dataset_hash` del WeatherContract se calcula con un payload JSON
canónico común a JavaScript y Python: timestamp UTC ISO con milisegundos,
nombres de campo del contrato, `null`/NaN omitidos y SHA-256 truncado a 24
hex. El hash heredado de pandas se conserva en el core Python como
`source_data_hash`, pero **no** identifica el contrato entre superficies.

Cache Storage y localStorage son por origen. Por ello, un consumidor servido
desde `*.imoriana3.workers.dev` no puede leer directamente el contrato activo
de `imoriana3.github.io`. `weather-contract-bridge.html` resuelve esa frontera
con un iframe del origen meteorológico y `postMessage`, limitado a orígenes
Factiun explícitos. No introduce una segunda copia persistente: transporta el
mismo paquete `contract_id + dataset_hash`.

El workbench publica cada dataset preparado como un paquete **WeatherContract v2** en Cache Storage del origen `imoriana3.github.io`, con una referencia ligera en `localStorage`. Al compartir origen, los simuladores de otros repos publicados bajo GitHub Pages pueden leer exactamente el mismo paquete sin volver a descargar meteo.

El contrato contiene:

- `contract_id` y hash de dataset;
- emplazamiento y zona horaria;
- fuente/proveedor/modelo/run/fallback;
- resolución original y operacional, cobertura e interpolación;
- unidades y campos canónicos;
- QA, completitud y BSRN;
- incertidumbre del recurso;
- resumen espacial cuando existe;
- política explícita: **WEATHER informa; CONTROL decide**.

Hay referencias activas separadas para `forecast`, `historical`, `tmy` y `prepared`, además de una referencia al último paquete activado.

## Supervisión 72 h

El forecast activo genera una ventana operativa de 72 h con máximos de viento/racha, precipitación acumulada, temperatura mínima, nieve y CAPE. Señala cruces de umbral como **avisos meteorológicos**, nunca como órdenes de control.

Cuando se configura un endpoint WeatherNext 3 autenticado, el browser intenta primero WeatherNext. Si no está disponible, el fallback a Open-Meteo queda visible y registrado en el WeatherContract.

## Meteo espacial

La primera capa espacial usa centro + norte/sur/este/oeste a un radio configurable. Calcula spreads de viento, racha, temperatura, GHI, precipitación y nubosidad. Está declarada como aproximación geométrica; no inventa una topología NCU si no dispone de ella.

## Incertidumbre y P50/P90

El browser calcula una sigma de recurso conservadora usando el mayor de:

- preset de la fuente;
- RMS multi-fuente;
- residual de adaptación a medida de sitio;
- override explícito cuando exista.

Se evita sumar en cuadratura estos términos correlacionados para no contar dos veces el mismo error de recurso. La sigma se guarda dentro del WeatherContract y del `manifest.json`.

## Export bankable

Además de CSV/JSON/TMY, la v0.8 exporta:

- CSV compatible con flujo PVSyst;
- `manifest.json` con provenance, hash, QA, incertidumbre, spatial y forecast;
- WeatherContract completo en JSON;
- informe HTML/PDF con el manifest incrustado.

## Arquitectura

```text
Cartera / factiun_plantas
          │
          ▼
      meteo.html
          │
          ▼
  lib/meteo-browser.js
          │
 ┌────────┼─────────┐
 ▼        ▼         ▼
Open-    PVGIS     NASA
Meteo              POWER
 │
 ├─ histórico multi-año
 ├─ QA / BSRN / plausibilidad
 ├─ TMY Sandia-FS
 ├─ comparación de fuentes
 ├─ import CSV / PVSyst
 ├─ adaptación de sitio
 ├─ interpolación
 ├─ granizo / viento sintético
 ├─ descargas
 └─ informes
```

**WEATHER informa; CONTROL decide.** Forecast, reanálisis y riesgo meteorológico no sustituyen HSU/SCADA ni interlocks de seguridad.

## Fuentes sin credenciales


### WeatherNext 3

El contrato distingue **FDIR de DNI**. Puede importarse un resumen JSON y el workbench incorpora un **hook por proxy autenticado**: las credenciales nunca se exponen en GitHub Pages y, si el endpoint falla/no existe, el fallback a Open-Meteo queda declarado.

El contrato del proxy live queda fijado como:

- base configurable en la UI;
- ruta final `GET <base>/forecast?lat=<lat>&lon=<lon>&hours=72`;
- en el bridge local SolarGPT, la base prevista es `http://127.0.0.1:8765/meteo/weathernext`, que expone `/meteo/weathernext/forecast`;
- p50 alimenta la serie operativa; p10/p50/p90 se conservan como bandas probabilísticas;
- temperatura K → °C, energía solar horaria J/m² → W/m², precipitación m → mm y presión Pa → hPa se convierten una sola vez en el adapter browser;
- `wind_direction_10m_p50` se conserva en el WeatherContract cuando el proxy la deriva de los componentes u/v;
- `init_time`, hora de forecast, superficie de acceso y demás provenance viajan con el dataset.

La solicitud de acceso de Google fue **aprobada** (correo facilitado por el propietario, 18/10/2026), pero **BigQuery Analytics Hub quedó bloqueado por el límite global de 1.000 datasets enlazados**, no por un error del navegador. La alternativa oficial seleccionada es **Cloud Storage Statistics Zarr**: el usuario confirmó navegación por el bucket `weathernext3_statistics_spatial` y un run `predictions.zarr`. La exploración inicial acreditó sólo el listado, pero **el 19/10/2026 se ha validado lectura numérica real desde Cloud Shell**, dos veces con `GCS_NUMERIC_POINT_READ_OK`: El Burgo I (`24002`), 3 horas de una ejecución histórica de 01/01/2026 y 12/12 valores P50 finitos para temperatura, viento, SSRD/GHI y nubosidad. Rejilla efectiva 41,6° / 359,2° (aprox. 2,68 km respecto al emplazamiento). Esta comprobación pertenece al lector piloto público de sólo lectura; **no** verifica el backend canónico de SolarGPT ni implica predicciones LIVE operativas.

`SolarGPTfull#416` contiene el lector de GCS y mantiene el **mismo JSON** del proxy `/meteo/weathernext/forecast`; `provenance.surface` distingue `GCS` de `BigQuery` sin variar unidades ni contrato. La ejecución piloto será **manual desde Google Cloud Shell** porque GitHub Actions se quedó sin minutos y el NAS está saturado. El comprobador público de solo lectura está en `tools/weathernext_gcs_probe.py`, con launcher `tools/weathernext_gcs_cloudshell.sh`. Se limita a un punto, 3 horas y 4 variables; no ejecuta cron ni escribe a Supabase. La futura ejecución automática se plantea como Cloud Run Jobs, condicionada a validar lectura numérica, términos y costes. La eventual caché de pronósticos en Supabase deberá residir en una tabla RLS **distinta** de la telemetría medida y consumirse mediante WeatherContract v2.

Estado: **GCS NUMÉRICO VERIFICADO; NO LIVE en SolarGPT**. El acceso desde el runtime canónico, CI del backend, política de costes, caché RLS y despliegue siguen pendientes. Google confirma las unidades nativas K, m/s, J/m² acumulado 1h y fracción nubosa (https://developers.google.com/weathernext/guides/models). Los históricos de más de 1 hora son CC BY 4.0; la previsión reciente/futura está sujeta a términos específicos. La medición HSU conserva autoridad operacional; WeatherNext sólo sirve como forecast experimental.

### Integración WeatherNext ↔ Supabase (19/10/2026)

**HECHO / BASE DE DATOS:** migración `weathernext3_forecast_cache_rls_v1` aplicada
en `icqiwmbbeoeswbcbgflc`. Existe `public.meteo_pronosticos` con
RLS activa, 0 filas iniciales, SELECT exclusivamente para `authenticated`
y escritura de `service_role` en backend. `public.telemetria` no se toca.
La tabla contiene `planta_id` referenciada a `public.plantas`, `init_time`,
`valid_time`, `lead_hour`, `p10`, `p50`, `p90` y `provenance`.

**HECHO / CÓDIGO EN RAMA, NO PUBLICADO:** `lib/meteo-forecast-cache.js`
consulta la identidad oficial desde `plantas.code` con la sesión Supabase de
`meteo.html`, lee únicamente la última ejecución del modelo, rechaza
pronósticos de más de 18 h y no hace doble conversión de unidades (los cuantiles
del cache ya están en °C, W/m², mm). `meteo.html` intenta el cache primero,
conserva el fallback Open-Meteo y etiqueta explícitamente el origen. Al cerrar
la sesión descarta el forecast autenticado del WeatherContract en navegador.
Ninguna lectura del browser accede a la clave `service_role`.

**PENDIENTE:** publicación de filas reales en la tabla desde entorno backend,
validación de tests locales y navegador, completar integración de identidad
Google en Cloud Run y costes. La fuente WeatherNext 3 **NO está live en la
tarjeta** y la prueba Cloud Shell anterior, aunque numérica, fue del lector
piloto, no del backend canónico. CI de GitHub sin minutos, PR se mantiene
Draft. El forecast no es medida HSU ni autoridad de CONTROL/STOW.

### Coste adicional obligatorio: 0 € (decisión 19/10/2026)

**DECISIÓN INTENCIONAL:** no habilitar facturación en Google Cloud;
no usar Cloud Run ni Cloud Scheduler, no cargar el NAS y no gastar minutos
del repositorio privado `SolarGPTfull`.

**Prueba de alternativa gratuita:** en `IMoriana3/proyectos`, que es público,
GitHub Actions usa runners estándar gratuitos. Se creó un test efímero sin
secretos sobre el bucket GCS de WeatherNext 3 y se ejecutó realmente:
`39250731829` detectó que obstore intentaba obtener ADC del servidor
Google de metadatos inexistente; `39250901753` usando explícitamente
`GOOGLE_SKIP_SIGNATURE=true` devolvió **403 AccessDenied** para el
objeto `predictions.zarr/.zmetadata`: no existe lectura anónima.
El workflow efímero se eliminó tras recoger evidencia.

**Consecuencia:** no se garantiza extracción automática gratuita con los
permisos presentes. La cuenta personal aprobada sí puede ejecutar
`tools/weathernext_gcs_cloudshell.sh` de forma interactiva en Cloud Shell,
sin activación de billing. Para usar el pronóstico en SolarGPT, debe existir
un mecanismo seguro de exportación/carga al contrato canónico; el acceso
al bucket **no** debe confundirse con pronóstico publicado.

**PROPUESTA pendiente de validación:** identidad técnica autorizada por Google
con autenticación gratuita y sin token persistente en el repositorio público.
No activar cron hasta demostrar autenticación, coste 0 y uso permitido de los
pronósticos experimentales. No usar contraseñas personales ni claves
`service_role` de Supabase en ficheros públicos.

### Integración Zarr nativa en la pantalla Meteo (19/10/2026)

**HECHO EN RAMA `#591`, NO PUBLICADO:** `meteo.html` importa directamente
el JSON `weathernext3-zarr-point-v2` generado por
`IMoriana3/weathernext`. El usuario descarga el fichero desde su
Google Cloud Shell autorizado y lo selecciona en **WeatherNext 3 >
Importar JSON**. El archivo se procesa enteramente en el navegador,
sin introducir Google ADC ni enviar datos a servidores públicos.
La pantalla comprueba esquema, horas 1..N completas, run class, fecha,
coordenadas de emplazamiento (desviación <=0,05°), cantidades en escala
original y preservación de P10/P50/P90.

**ÚNICA NORMALIZACIÓN:** `lib/meteo.js` contiene
`fromWeatherNextTransport()`, que llama al mismo
`fromWeatherNextSummary()` usado por el proxy GCS/BigQuery. Convierte
Kelvin a °C y energía solar J/m² por hora a W/m² **una sola vez**.
No genera DNI/FDIR, precipitación, rachas, dirección ni granizo cuando
WeatherNext no proporciona esos campos: quedan `null`.
Los percentiles se conservan por **variable marginal**, no como
escenarios físicos coherentes de viento+radiación+nubes.

**PANTALLA:** un único bloque Meteo con ventana seleccionable
**72 horas / 360 horas**, curva horaria por variable con P10/P50/P90,
deslizador por hora, datos de cada instante y advertencia explícita
cuando el archivo sea histórico o tenga un horizonte menor que el
solicitado. Se mantiene el resumen operacional y el fallback Open-Meteo.
Un `weatherNext` histórico no se presenta como tiempo actual.

**WeatherContract v2 — EXTENSIÓN COMPATIBLE, PENDIENTE MASTER:**
`lib/weather-contract.js` conserva el dataset meteorológico central,
pero incorpora opcionalmente `forecast_quantiles.rows` y un hash
propio. `contract_id` incluye el hash de bandas para impedir
colisiones con el mismo P50. `browserConsumerStamp` transporta ese
hash. La normalización `finite(null)` se corrigió porque convertía
faltantes en ceros; incidencia **BUG** de calidad. Esta extensión
cross-domain debe contrastarse con consumidores y contratos de
SolarGPT antes de certificar o fusionar. **No presume** que otros
simuladores ya consuman estos cuantiles automáticamente.

**HECHO DE TESTS AISLADOS:** validación de parser y
`WeatherContract v2` en runtime JS: 360 valores horarios conservados,
resumen exacto 72 horas, cuantiles completos, ausencia de precipitación
como `null`, hash independiente, y sintaxis de la interfaz.
Se han añadido los tests
`tests/test_meteo_weathernext_transport.mjs` y
`tests/test_meteo_weathernext_contract.mjs`.
El workflow GitHub Actions de pruebas focalizadas está actualmente
bloqueado por infraestructura (job sin pasos); **no declararlo CI verde**.

**PENDIENTE:** resolver la divergencia de PR `#591` respecto a
`main`, ejecutar arneses de navegador y regresiones
cross-domain, fusionar/publicar, validar importación real de una
predicción reciente y conseguir carga automática a coste adicional 0 €
con identidad Google expresamente autorizada. La caché Supabase
`public.meteo_pronosticos` existe pero sigue sin filas, de modo que
no hay ingestión LIVE.

### Windy y Ventusky

`meteo.html` incorpora ambos como **mapas operativos externos de contraste**, sincronizados con el emplazamiento seleccionado.

- **Windy** usa el embed oficial de mapa, centrado en la latitud/longitud activa.
- **Ventusky** usa su embed oficial con la misma posición y pin de emplazamiento.
- Se cargan de forma diferida (`loading="lazy"`) para no penalizar el arranque del workbench.
- No se consideran proveedores del contrato meteorológico canónico y sus valores no alimentan Batería, Winter mode, Producción, P50/P90 ni CONTROL.
- Su función es inspección visual rápida de frentes, viento, rachas, precipitación, temperatura y otros campos del proveedor.

CAMS, NSRDB y Solcast se mantienen como fuentes opcionales futuras: sus credenciales nunca deben quedar embebidas en GitHub Pages.

## Histórico y screening anual

El histórico activo se normaliza a un objeto horario canónico y se analiza año a año:

- GHI / DNI / DHI anual;
- temperatura media;
- viento medio;
- precipitación;
- completitud;
- distancia a las medianas multi-año.

El «año screening» es solo un atajo para localizar un año cercano a la climatología. **No es el TMY.**

## TMY

### Sandia / Finkelstein-Schafer

`buildTmySandia` selecciona el año más típico **mes a mes** mediante CDF empírica y estadístico FS, usando los pesos contractuales del dominio meteo. La interfaz muestra año elegido y FS para los 12 meses.

### PVGIS TMY

Puede descargarse y usarse directamente como alternativa externa.

## Paridad visual con Meteo de SolarGPT

La v0.5 incorpora `lib/meteo-viz.js`, una capa Canvas HiDPI sin dependencias externas. El objetivo es que el workbench autónomo no sea visualmente más pobre que la página Meteo de SolarGPT.

Se portan estas familias:

1. **Resumen mensual climatológico**: GHI/DNI/DHI, T media/mín/máx, viento y nieve.
2. **Serie completa**: media diaria GHI/DNI/DHI.
3. **Zoom diario**: perfil horario con día pico GHI/DNI y solsticios/equinoccio; usa la hora local del emplazamiento.
4. **Meteo Cockpit de 6 paneles**:
   - GHI mensual;
   - DNI mensual;
   - DHI mensual;
   - temperatura mensual media/mín/máx;
   - viento mensual media/máxima;
   - índice de claridad `kt = haz_horiz / (haz_horiz + DHI)`.
5. **Climatología diaria DOY**:
   - picos GHI/DNI/DHI;
   - banda térmica;
   - viento típico y máximo absoluto, con T1=40 km/h y T2=60 km/h.
6. **Rosa de los vientos**:
   - 16 sectores;
   - bins de velocidad `<5`, `5–15`, `15–30`, `30–50`, `50–80`, `>80 km/h`;
   - tabla de horas/año y porcentaje por banda.
7. **Temperaturas extremas**:
   - histograma;
   - horas/año bajo 0/-5/-10/-15/-20/-30 °C;
   - horas/año sobre 25/30/35/40 °C;
   - climatología mensual de días con Tmin bajo 0/-5/-10/-20 °C.
8. **Nieve**:
   - nieve nueva mensual;
   - acumulado del periodo;
   - días con nieve;
   - manto máximo cuando `snow_depth` existe.
9. **Granizo**: curva acumulada de `P(≥1)` con banda λ÷2,5 … λ×2,5.
10. **Viento sintético**: máximo diario en km/h y umbrales T1/T2.
11. **Comparación de fuentes**: GHI mensual de cada proveedor en una misma gráfica.

Las agrupaciones mensuales/diarias que dependen del calendario usan la **zona horaria del emplazamiento**, no UTC, cuando SolarGPT también lo hace.

### Informes

El informe HTML incrusta las visualizaciones disponibles como PNG base64. El fichero descargado queda autocontenido y puede imprimirse a PDF sin red.

### Guard de regresión

`tests/test_meteo_browser.mjs` comprueba:

- agregados de las familias visuales;
- rosa de 16 sectores y suma 100 %;
- unidades km/h;
- TZ local;
- nieve, extremos, `kt` y heladas;
- presencia de todos los canvas;
- render real en Chromium mediante diversidad de píxeles;
- curva de granizo y viento sintético;
- exportación de visuales en el informe.

## QA

El navegador ejecuta:

- filtro BSRN de dos niveles;
- negativos y máximos físicos;
- NaN y completitud;
- cierre `GHI ≈ DNI·cos(z)+DHI`;
- rangos de temperatura/viento;
- climatología mensual contra PVGIS;
- estimación de desfase horario frente a un clear-sky browser;
- estadísticas min/max/media/P50/P99;
- hash SHA-256 corto del dataset preparado.

Las rutinas están escritas para series de cientos de miles de filas sin usar spreads que desborden el stack de JavaScript.

## Importación

### CSV

Se detecta delimitador y aliases de timestamp, GHI/DHI/DNI, temperatura y viento. La zona horaria declarada se transforma a UTC.

### Excel / PVSyst

Se usa SheetJS local (`lib/xlsx.full.min.js`). Se elige la hoja con más datos, se detecta la fila de cabecera y se mapean aliases PVSyst. Si no hay DNI pero sí GHI/DHI o BeamHor, se reconstruye con la geometría solar del sitio.

El fichero permanece en el navegador.

## Adaptación de sitio

Una serie medida puede corregir la serie larga mediante:

- bias;
- regresión;
- quantile mapping;
- coeficientes globales o mensuales.

Se muestran MBE, RMSE, R², meses/puntos de solapamiento, meses extrapolados y una sigma residual para el presupuesto P90.

## Interpolación

Puede preparar una serie a 1, 5, 10 o 15 minutos con guardrail de 650.000 filas.

Se interpolan variables continuas (irradiancia, temperatura, viento, humedad, presión). **No se fabrica resolución subhoraria de acumulados**: precipitación, lluvia, nieve nueva y showers permanecen solo en sus timestamps originales y el informe lo declara.

## Riesgos y sintéticos

- Granizo: riesgo climatológico Poisson de diseño con override de lambda y banda de incertidumbre. No es detector operativo.
- Viento sintético: Weibull + AR(1) + modulación diurna/estacional + cola ciclónica opcional. Siempre se declara como sintético y no bankable.

## Descargas e informe

Se descarga exactamente el dataset activo en memoria:

- histórico;
- TMY;
- preparado/interpolado;
- JSON.

El informe HTML incorpora emplazamiento, fuente, periodo, tabla anual, QA/hash y selección de meses del TMY. Puede imprimirse a PDF desde el navegador.

## Paridad y certificación

El browser core es un **mirror** del dominio Python, no una nueva autoridad física. El CI de `proyectos` vigila contratos puros y el comportamiento real de la página. Queda como P0 de certificación cerrar golden datasets diferenciales JS↔Python para TMY, QA y extremos antes de declarar equivalencia numérica completa.

## Consumidores pendientes de migración

El objetivo es que consuman el mismo contrato meteorológico:

- radiación difusa;
- viento / granizo;
- winter mode;
- batería;
- producción 3D;
- backtracking energético;
- gemelo digital;
- SCADA;
- P50/P90;
- QA/certificación.
