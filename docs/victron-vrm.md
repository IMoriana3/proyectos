# SCADA Victron · FV provisional Landblock

**Instalación:** VRM [493468](https://vrm.victronenergy.com/installation/493468/dashboard), instalación fotovoltaica provisional **independiente** de El Burgo I (14 MWp). No pertenece a la planta Factiun 23003.

**Acceso:** [Abrir SCADA Factiun VRM](https://factiun-vrm.imoriana3.workers.dev/panel). Requiere autenticación Cloudflare Access del usuario autorizado. No publicar tokens, credenciales, series privadas ni accesos sin protección.

## Estado de la integración

- **Conexión API VRM:** verificada por el usuario el 19/10/2026; `/test` devolvió `connected:true` y registros energéticos disponibles.
- **Versión confirmada en Cloudflare:** `v3.2-landblock` mediante `/version`, comprobada por el usuario.
- **v3.3 visual:** implementada en la rama de [SCADA PR #316](https://github.com/IMoriana3/scada/pull/316), **pendiente de despliegue y validación con usuario**.
- **CI:** sin certificado verde; no dar por fusionada ni validada toda la suite.
- **Operación:** solo lectura. Sin funciones de arranque, parada, cambio ESS, escritura Modbus ni control remoto.

## Funciones

El conector consulta la energía diaria/horaria de Victron VRM, batería (SOC, tensión, corriente, temperatura y potencia cuando existe), potencia FV, MPPT individuales, inversor y cargas CA. La nueva interfaz v3.3 organiza la energía temporal arriba, KPIs medidos en columna lateral y un sinóptico Landblock con batería/cargas debajo. Avanzada ofrece curvas por dispositivo cuando VRM publica la serie.

Las **dos aguas** de los módulos sobre apoyos Landblock corresponden a una descripción visual, no a un plano as-built. El reparto MPPT ↔ Agua A/B no está verificado y únicamente se puede asignar provisionalmente en el navegador, sin guardar cambios. Ningún dato de esta FV debe atribuirse a El Burgo I.

## Límites de datos y alarmas

Las ventanas `24 h`, `7 días` y `30 días` son **móviles**; no equivalen necesariamente al «Hoy» de Victron. Las medidas faltantes aparecen como guion, no como cero. Las muestras con antigüedad excesiva no se presentan como actuales.

La pestaña de alarmas **no está sincronizada**: consultar los registros en [VRM oficial](https://vrm.victronenergy.com/installation/493468/dashboard), sin inferir estado normal cuando falta la fuente de eventos. Las futuras curvas de irradiancia y límites BMS requieren validación explícita.

## Responsables y evidencias

- [Desarrollo y pruebas del conector: SCADA PR #316](https://github.com/IMoriana3/scada/pull/316).
- [Instrucciones de activación, identidad y pruebas](https://github.com/IMoriana3/scada/blob/feat/vrm-readonly-collector-20261019/docs/VRM_PORTAL.md).
- [Notion · tarea principal WRK-23](https://app.notion.com/p/3fe6931d643681949f07ead48a599fd6).
