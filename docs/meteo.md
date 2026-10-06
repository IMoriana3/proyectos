# Análisis meteorológico

### WeatherState v1 · fuente transversal para SolarGPT/Factiun

## Objetivo

Evitar que cada simulador tenga su propia interpretación de la meteorología. La tarjeta **Análisis meteorológico** normaliza fuente, unidades, coordenadas, timestamps y procedencia; publica la serie en un buzón compartido del navegador y permite que las herramientas consumidoras lean el mismo estado meteorológico.

La separación de responsabilidades es deliberada:

- **METEO** describe lo observado o previsto.
- **PHYSICS** calcula geometría, irradiancia sobre plano, sombras y backtracking.
- **CONTROL** decide el target operativo y conserva la autoridad de seguridad.
- **Sensores locales** siguen siendo la referencia de protección en tiempo real.

WeatherNext 3 es una capa predictiva experimental, no una fuente única de safety.

## Fuentes

| Fuente | Uso | Estado |
|---|---|---|
| Open-Meteo forecast | previsión de planta | activo en navegador |
| Open-Meteo ERA5 | replay / histórico | activo en navegador |
| Google WeatherNext 3 | ensemble AI y forecast de hasta 15 días | adapter preparado; requiere acceso y proxy |
| HSU CSV | viento medido de planta | importación local |
| HSU SCADA | medida live | contrato previsto vía collector |
| PVGIS horario | histórico alternativo | ya delegado en SolarGPT engine |
| NASA POWER | histórico alternativo | ya delegado en SolarGPT engine |
| PVSyst CSV | entrada simulada / batería | importación local |
| Sintético / cielo claro | escenarios / adversarial | consumidor específico |

## Variables normalizadas

weather-state.v1 usa UTC y unidades explícitas:

- temperature_c
- dewpoint_c
- relative_humidity_pct
- wind_speed_10m_ms
- wind_direction_10m_deg
- wind_gust_10m_ms
- ghi_wm2
- dni_wm2
- dhi_wm2
- precipitation_mm
- snowfall_cm
- cloud_cover_pct
- cloud_cover_low_pct
- cloud_cover_mid_pct
- cloud_cover_high_pct
- surface_pressure_hpa
- cape_jkg
- freezing_level_m

El adapter de WeatherNext acepta además percentiles/ensemble cuando el proxy los publique.

## WeatherNext 3

WeatherNext 3 expone variables de superficie a paso horario, entre ellas viento a 10/100 m, irradiancia solar descendente y directa, precipitación, nubosidad por capas, temperatura y presión. El acceso se realiza por BigQuery, Earth Engine o Cloud Storage y requiere autorización al dataset experimental.

No se guardan credenciales de Google en GitHub Pages. La UI espera un **adapter/proxy read-only** configurado en factiun_meteo_config_v1.

El adapter puede devolver nombres originales de WeatherNext o nombres ya normalizados. lib/meteo-bus.js transforma:

- K → °C.
- J/m² acumulados en 1 h → W/m² medios.
- m de precipitación → mm.
- fracción de nubosidad 0–1 → %.

## Buzón compartido

Clave: factiun_meteo_bus_v1.

Como las aplicaciones están bajo el mismo origen imoriana3.github.io, el localStorage es compartido entre /proyectos, /cobertura-zigbee, /gemelo-digital, etc.

El buzón **no sustituye la fuente canónica** y no se usa como archivo histórico. Es un cache de intercambio de última serie con provenance.

API navegador:

- FactiunMeteo.fetchOpenMeteo(...)
- FactiunMeteo.fetchWeatherNext(...)
- FactiunMeteo.importCSV(...)
- FactiunMeteo.publish(dataset)
- FactiunMeteo.latest(filter)
- FactiunMeteo.subscribe(callback)
- FactiunMeteo.derive(dataset, thresholds)

## Consumidores

### Viento / granizo / nieve

Consume viento, dirección, ráfagas, precipitación, temperatura, CAPE y cota de congelación. El forecast permite vigilancia/pre-stow; el stow de seguridad sigue dependiendo del lazo local.

### Radiación difusa

Consume GHI, DNI, DHI y nubosidad para clasificar régimen de cielo y estimar si merece la pena mover.

### Batería

Consume irradiancia y temperatura para prever disponibilidad de carga, winter mode y movimientos evitables.

### Tracking / BT

La meteorología **no entra dentro del BT geométrico**. Puede influir en la política de movimiento por valor energético, nunca en la definición de shadow-safe.

### SCADA / Twin

Sirve de contexto externo y sanity check frente a sensores de planta, no de sustitución de medida.

## Derivados actuales

La tarjeta calcula indicadores de 24 h:

- wind_risk: normal / watch / stow según umbrales configurables.
- fracción difusa media DHI/GHI.
- energía GHI acumulada.
- señal winter/hielo combinando temperatura y precipitación.
- ingredientes convectivos heurísticos usando CAPE, precipitación y cota de congelación.

La señal convectiva **no es una predicción de granizo ni un aviso oficial**.

## Próxima integración

1. Configurar adapter WeatherNext con credenciales fuera del navegador.
2. Hacer que Viento, Difusa y Batería consulten primero FactiunMeteo.latest() y publiquen cualquier serie que descarguen.
3. Añadir provenance/version al payload que viaje al engine.
4. Golden dataset común para comparar la misma hora/planta entre tarjetas.
