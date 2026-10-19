# SCADA fija · Victron VRM

**Acceso al SCADA:** [Abrir sinóptico protegido](https://factiun-vrm.imoriana3.workers.dev/panel#home)  
**Código y seguimiento:** [IMoriana3/scada · PR #316](https://github.com/IMoriana3/scada/pull/316)  
**Fuente de los datos:** API de Victron VRM, a través del Worker privado `factiun-vrm`.

## Qué es

SCADA de la **instalación fotovoltaica fija** integrada con Victron VRM. Es una interfaz de **solo lectura** para consultar flujos energéticos de FV, consumo, batería y red, SOC e históricos por dispositivo. El sinóptico incorpora una única ilustración Landblock sin asignaciones ficticias de aguas o MPPT. La ilustración no es un plano as-built.

Es una instalación **independiente de El Burgo I** y no debe mezclarse con su SCADA de seguidores. La ficha «SCADA seguidores · El Burgo I» abre el SCADA de seguidores (trackers) de El Burgo I, proyecto 23003, desde Cartera Factiun.

## Acceso y privacidad

- La URL protegida se abre en otra pestaña y solicita autorización de Cloudflare Access.
- GitHub Pages **no recibe el token VRM ni las mediciones**. Esta tarjeta solo enlaza a la aplicación.
- No se integra mediante `iframe`, no se replica el SCADA, no se realizan consultas a VRM desde el Panel de Proyectos.
- Sin órdenes de mando: el Worker está diseñado para operar únicamente en lectura.

## Estado verificado el 19/10/2026

- **Desplegado según última verificación:** `v3.4-landblock-hero`, con pestañas Sinóptico, Avanzada y Alarmas.
- **Desarrollado pero no desplegado:** `v3.4.1-hourly-energy`, cambio horario 7 y 30 días y selector horario/diario, disponible en la [PR #316](https://github.com/IMoriana3/scada/pull/316).
- **Sin certificar:** CI remota; las ejecuciones fallaron antes de ejecutar los pasos.
- **Pendiente de campo:** contraste de energía y SOC reales con VRM, validación visual del SOC, históricos por MPPT y sincronización de alarmas. La existencia del código de gráficas no demuestra que la API entregue todas las series.

**Regla:** la versión anunciada en esta ficha indica el último despliegue confirmado; no atribuir a producción prestaciones de la PR pendiente.
