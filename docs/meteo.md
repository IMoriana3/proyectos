# Análisis meteorológico — Weather Workbench autónomo

## Objetivo

`meteo.html` es la interfaz meteorológica transversal de Factiun/SolarGPT. Desde v0.4 funciona **directamente en el navegador**: no requiere levantar SolarGPT, Colab ni un servidor local para histórico, TMY, QA, comparación de fuentes, importación, adaptación, descargas o informes.

SolarGPT Python sigue siendo la referencia contra la que se certifica el mirror JS; ya no es una dependencia de ejecución de la interfaz.

## Emplazamientos

El selector reutiliza la misma fuente que el resto de Factiun:

1. `localStorage.factiun_plantas`, publicado por la Cartera;
2. si no existe o está incompleto, la semilla `SEED` de `cartera-tabla.html`.

No hay una tercera lista de plantas mantenida a mano. El valor persistido es el código estable de Cartera/proyecto, no la posición del elemento en el desplegable. Se conserva un modo **Manual / coordenadas libres**.

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
