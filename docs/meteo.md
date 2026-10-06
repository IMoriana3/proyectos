# Análisis meteorológico — contrato transversal

## Objetivo

Una sola capa meteorológica para todo Factiun/SolarGPT. Los simuladores y visores no deben mantener parsers, unidades o semánticas meteorológicas incompatibles entre sí.

## Fuentes

- **WeatherNext 3**: forecast probabilístico y escenarios. No es autoridad de safety.
- **Open-Meteo**: fuente gratuita inmediata para desarrollo, forecast y reanálisis.
- **HSU CSV / HSU SCADA**: medida local. Autoridad para lógica de seguridad según el contrato de CONTROL.
- **PVGIS / NASA POWER**: recurso, TMY y contraste.
- **Clear-sky**: referencia física/sintética, nunca dato meteorológico observado.

## Contrato v1

`lib/meteo.js` normaliza: GHI, FDIR, DNI, DHI, temperatura, punto de rocío, viento, dirección, racha, viento 100 m, nubosidad por capas, precipitación y presión. Mantiene provenance y permite P10/P50/P90.

Derivados iniciales: fracción difusa, probabilidad de overcast, wind watch, riesgo predictivo de stow, freeze risk y proxy convectivo/granizo.

## Regla de arquitectura

**WEATHER informa. CONTROL decide.**

WeatherNext puede anticipar viento, cielo cubierto, precipitación o riesgo convectivo, pero no sustituye sensores locales ni interlocks.

## Consumidores

- Simulador de radiación difusa
- Comparador de estrategias de abanderamiento / granizo
- Producción 3D
- Sol & Simulación
- Simulador de batería
- Gemelo digital
- SCADA / plausibilidad de sensores
- futuros winter mode y forecast de producción

## Migración

1. La nueva tarjeta usa ya `lib/meteo.js`.
2. Migrar `sim-viento.html` para que su loader Open-Meteo use el adaptador común sin alterar su física ni máquinas de estado.
3. Migrar radiación difusa al mismo contrato.
4. Migrar producción/batería.
5. Añadir adapter WeatherNext real en backend/ETL gratuito; el navegador solo consumirá el JSON normalizado/cacheado.
6. Certificar parity de unidades y timestamps entre consumidores.

## WeatherNext 3

Las variables de superficie útiles para FV incluyen viento 10/100 m, cobertura de nubes, irradiancia solar descendente y FDIR, precipitación, temperatura, punto de rocío y presión. Para análisis geoespacial Google expone estadísticas de ensemble precalculadas P10/P25/P50/P75/P90.

El forecast se usa como capa predictiva. La instrumentación de planta conserva la función de protección.
