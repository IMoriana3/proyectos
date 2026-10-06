# Análisis meteorológico — Weather Workbench autónomo

## Objetivo

`meteo.html` es la interfaz meteorológica transversal de Factiun/SolarGPT. Desde v0.4 funciona **directamente en el navegador**: no requiere levantar SolarGPT, Colab ni un servidor local para histórico, TMY, QA, comparación de fuentes, importación, adaptación, descargas o informes.

SolarGPT Python sigue siendo la referencia contra la que se certifica el mirror JS; ya no es una dependencia de ejecución de la interfaz.

## Emplazamientos

Hay dos rutas de selección, sin duplicar la lista de proyectos:

1. **Nuestros proyectos** reutiliza `localStorage.factiun_plantas`, publicado por la Cartera, y si falta o está incompleto completa desde la semilla `SEED` de `cartera-tabla.html`.
2. **Buscar cualquier emplazamiento** usa Open-Meteo Geocoding sin credenciales. Con dos o más caracteres ofrece hasta 8 coincidencias y, al elegir una, fija nombre, país/región, latitud, longitud, cota y zona horaria. Ejemplos: Helsinki, Montreal o Arequipa.

No hay una tercera lista de plantas mantenida a mano. Los proyectos propios persisten por su código estable; los emplazamientos externos persisten como un registro geocodificado separado. Se conserva además el modo **Manual / coordenadas libres**.

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

### WeatherNext 3

El contrato distingue **FDIR de DNI**. Hoy puede importarse un resumen JSON. La conexión live queda pendiente de credenciales/acceso Google y no bloquea ninguna otra función.

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
