# Análisis meteorológico — Weather Workbench transversal

## Objetivo

La tarjeta **Análisis meteorológico** es la interfaz única del dominio Meteo de SolarGPT/Factiun.

No es un visor aislado. Debe cubrir el ciclo completo:

1. localizar/definir emplazamiento;
2. obtener forecast, históricos y TMY;
3. comparar fuentes;
4. validar/normalizar datos;
5. buscar años representativos;
6. construir TMY propio;
7. importar ficheros de cliente/PVSyst;
8. descargar datasets canónicos;
9. generar informes trazables;
10. alimentar al resto de herramientas SolarGPT.

## Regla de arquitectura

**WEATHER informa. CONTROL decide.**

La capa meteorológica puede anticipar viento, radiación, nubosidad, precipitación o riesgo convectivo, pero no sustituye sensores locales, HSU/SCADA ni interlocks.

La interfaz no debe reimplementar la física ni los algoritmos meteorológicos del core. Cuando el motor SolarGPT está conectado, la tarjeta llama a sus endpoints; sin motor solo quedan disponibles las funciones que pueden funcionar de manera segura en navegador (forecast Open-Meteo e import de resumen WeatherNext JSON).

## Motor SolarGPT

La ampliación de server/app.py expone:

- POST /meteo/years: histórico multi-año + KPIs por año + screening de representatividad.
- POST /meteo/tmy: TMY propio Sandia/Finkelstein-Schafer o TMY PVGIS.
- POST /meteo/compare: comparación PVGIS/NASA/Open-Meteo + RMS.
- POST /meteo/download: CSV histórico o TMY.
- POST /meteo/report: informe HTML trazable e imprimible a PDF.
- POST /meteo/import: normalización de CSV y Excel PVSyst.

La descarga multi-año usa la caché de solargpt_core.meteo.load_meteo_cached; el TMY propio usa build_tmy_sandia; el TMY PVGIS usa solargpt_core.pvgis.fetch_pvgis_tmy.

## Años y TMY

### Screening de año completo

La tabla anual calcula GHI/DNI/DHI, temperatura media, viento, precipitación, completitud y una distancia a las medianas multi-año.

El año con menor distancia se presenta como **screening** para localizar rápidamente un año representativo.

**No es el TMY.**

### TMY canónico

El TMY propio usa el método Sandia/Finkelstein-Schafer del core y selecciona el año más típico **mes a mes**. La interfaz muestra los 12 años/meses elegidos y el estadístico FS.

También puede pedirse el TMY publicado por PVGIS.

## Fuentes

| Fuente | Rol | Credenciales | TMY/multianual |
|---|---|---|---|
| Open-Meteo / ERA5 | histórico + forecast + fallback | no | sí / TMY propio |
| PVGIS | TMY + hourly + recurso solar | no | sí |
| NASA POWER | histórico/climatología + fallback | no | histórico |
| WeatherNext 3 | forecast ensemble probabilístico | acceso Google | forecast Pxx |
| CAMS Radiation | irradiancia satélite | credencial en motor | histórico |
| NSRDB / NREL | TMY + años de validación | key gratuita en motor | sí |
| Solcast | live/forecast corto | key en motor | no multianual |
| PVSyst Excel / CSV | fichero de referencia | no | importación |

Las credenciales nunca se guardan en GitHub Pages.

## Contrato v1

lib/meteo.js representa la capa ligera del navegador. Normaliza:

- GHI
- FDIR
- DNI
- DHI
- temperatura
- punto de rocío
- viento 10 m
- viento 100 m
- dirección
- ráfaga
- nubosidad por capas
- precipitación
- presión
- P10/P50/P90
- provenance

Derivados iniciales:

- fracción difusa
- probabilidad de overcast
- wind watch
- riesgo predictivo de stow
- freeze risk
- proxy convectivo/granizo

FDIR y DNI se mantienen separados. WeatherNext FDIR no se renombra a DNI.

## Importación

### Excel PVSyst

Se procesa mediante solargpt_core.pvsyst_meteo.load_pvsyst_meteo_xlsx, incluida la detección de hoja/cabecera, aliases, timestamp y reconstrucción de DNI cuando corresponde.

### CSV

Se admite un CSV con columna temporal y columnas canónicas/aliases reconocidos por SolarGPT. El backend normaliza mediante el core.

## Comparativa multi-fuente

Reutiliza solargpt_core.meteo_compare.compare_meteo_sources.

Muestra:

- GHI/DNI/DHI anual por fuente;
- temperatura y viento;
- RMS de GHI;
- RMS térmico;
- RMS de viento;
- fuentes fallidas explícitamente.

El RMS de GHI conserva su papel como input de incertidumbre meteo para P50/P90.

## Descarga e informes

La tarjeta permite descargar:

- histórico multi-año canónico CSV;
- TMY Sandia CSV;
- TMY PVGIS CSV.

El informe meteorológico incluye:

- emplazamiento y periodo;
- KPIs año a año;
- screening anual;
- TMY y meses seleccionados;
- FS;
- provenance/QA;
- metodología y advertencia forecast ≠ safety.

## Consumidores

El mismo dominio meteo debe alimentar:

- simulador de radiación difusa;
- viento / abanderamiento;
- granizo;
- winter mode;
- batería;
- producción 3D;
- POA / generación;
- backtracking energético;
- gemelo digital;
- SCADA y plausibilidad de sensores;
- P50/P90;
- bankable runs;
- QA/certificación.

## Migración pendiente

1. Migrar sim-viento.html al contrato común sin cambiar máquinas de estado.
2. Migrar radiación difusa.
3. Migrar producción 3D y batería.
4. Hacer que gemelo y SCADA consuman el mismo objeto normalizado.
5. Conectar WeatherNext 3 live mediante backend/ETL gratuito y caché por planta.
6. Exponer CAMS/NSRDB/Solcast desde el workbench cuando estén configurados en el motor.
7. Añadir tests de parity de unidades, timestamps, provenance y fallos de fuente.