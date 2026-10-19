# SCADA Victron · FV provisional Landblock

**Instalación:** VRM [493468](https://vrm.victronenergy.com/installation/493468/dashboard), instalación fotovoltaica provisional **independiente** de El Burgo I (14 MWp). No pertenece a la planta Factiun 23003.

**Acceso:** [Abrir SCADA Factiun VRM](https://factiun-vrm.imoriana3.workers.dev/panel). Requiere autenticación Cloudflare Access del usuario autorizado. No publicar tokens, credenciales, series privadas ni accesos sin protección.

## Estado de la integración

- **Conexión API VRM:** verificada por el usuario el 19/10/2026; `/test` devolvió `connected:true` y registros energéticos disponibles.
- **Versión publicada confirmada por el usuario:** `v3.4-landblock-hero` en Cloudflare mediante `/version` (19/10/2026).
- **v3.4 Landblock:** [SCADA PR #316](https://github.com/IMoriana3/scada/pull/316) contiene una imagen panorámica única, sin división Agua A/B. **Publicada por el usuario**; pendiente de comprobar imagen y valores reales en la Home, gráficos y CI.
- **CI:** sin certificado verde; no dar por fusionada ni validada toda la suite.
- **Operación:** solo lectura. Sin funciones de arranque, parada, cambio ESS, escritura Modbus ni control remoto.

## Funciones

El conector consulta la energía diaria/horaria de Victron VRM, batería (SOC, tensión, corriente, temperatura y potencia cuando existe), potencia FV, MPPT individuales, inversor y cargas CA. La interfaz v3.4 organiza la energía temporal arriba, KPIs medidos en columna lateral y un sinóptico Landblock con batería/cargas debajo. Avanzada ofrece curvas por dispositivo cuando VRM publica la serie.

La Home de la v3.4 presenta **una sola imagen Landblock** sin rótulos Agua A/B. La imagen es un **render ilustrativo aprobado**, no un plano as-built ni una fotografía de esta instalación. El detalle técnico conserva los MPPT por instancia, **sin** agruparlos artificialmente por agua ni atribuir producción a El Burgo I.

La imagen hero WebP está guardada en `workers/vrm/assets/landblock_scada_hero.webp` (SCADA #316) e incrustada en el Worker como data URI para poder desplegar con un solo archivo sin exponer el repositorio privado. Los valores de la preview nunca aparecen como constantes en el SCADA.

## Límites de datos y alarmas

Las ventanas `24 h`, `7 días` y `30 días` son **móviles**; no equivalen necesariamente al «Hoy» de Victron. Las medidas faltantes aparecen como guion, no como cero. Las muestras con antigüedad excesiva no se presentan como actuales.

La pestaña de alarmas **no está sincronizada**: consultar los registros en [VRM oficial](https://vrm.victronenergy.com/installation/493468/dashboard), sin inferir estado normal cuando falta la fuente de eventos. Las futuras curvas de irradiancia y límites BMS requieren validación explícita.

## Responsables y evidencias

- [Desarrollo y pruebas del conector: SCADA PR #316](https://github.com/IMoriana3/scada/pull/316).
- [Instrucciones de activación, identidad y pruebas](https://github.com/IMoriana3/scada/blob/feat/vrm-readonly-collector-20261019/docs/VRM_PORTAL.md).
- [Notion · tarea principal WRK-23](https://app.notion.com/p/3fe6931d643681949f07ead48a599fd6).
