# TCU Toolbox — configuración y diagnóstico de TCUs Sunner (offline)

> Herramienta de campo para O&M: escribe, lee, respalda y diagnostica los TCU de los seguidores a través del gateway Modbus TCP de la NCU. **100 % offline**: un `.ps1` + un `.bat`, sin instalar nada ni salir de la LAN de planta.

## Qué es

El complemento de **escritura** del SCADA: el SCADA es solo-lectura a propósito; cuando hay que *cambiar* algo en un TCU (configuración, reloj, NVM) se usa esta toolbox desde el portátil conectado a la LAN de planta. Vive en el repo `scada`, carpeta [`tools/tcu-toolbox/`](https://github.com/imoriana3/scada/tree/main/tools/tcu-toolbox); PowerShell viene con Windows, así que no requiere instalación ni permisos de administrador.

La versión y la fecha que ves en la tarjeta salen de la **última release de GitHub**, no de este documento: si aquí pone otra cosa, manda la tarjeta.

## Uso

1. **Descargar**: botón *Paquete* de la tarjeta → release con `TCU_Toolbox_vX.Y.zip` (la versión va en el nombre del fichero).
2. Copiar la carpeta `tcu-toolbox/` al portátil de campo — los ficheros de plantas van dentro (`plantas/`).
3. Doble clic en `TCU_Toolbox.bat`. No requiere admin ni internet.
4. Elegir planta en el desplegable — las entradas **"(auto)"** cubren la NCU completa y resuelven solas el puerto de cada TCU, y **"(Planta completa)"** recorre todas sus NCUs en secuencia — y trabajar con las pestañas.

Antes de ir a planta, re-descarga la carpeta (o solo `plantas/<planta>.json`) si ha cambiado la topología.

## Cómo se "alimenta" de plantas

No hay que meterle nada a mano: **el ZIP ya baja alimentado**. Los JSON de plantas viven dentro del repo (`tools/tcu-toolbox/plantas/`) — hoy El Burgo I, Fayón, San José, Túnez, Ayora y Bagnarelli.

Para refrescar la topología sin re-bajar el ZIP entero, exporta el fichero desde la página **[IPs](../ips.html)** de esta plataforma (botones *⬇ JSON toolbox* / *⬇ CSV toolbox*) y suéltalo en la carpeta `plantas/` del portátil, o impórtalo con el botón **Cargar...** de la herramienta. El export lleva **solo topología: nunca credenciales**.

También se admite un CSV editable desde Excel (`Planta;NCU;IP;Puerto;TCU_ini;TCU_fin`, separado por `;`) para apaños en campo sin tocar la plataforma.

## Qué hace

| Pestaña | Función |
|---|---|
| **Escribir** | Todo el mapa 4xxxx con verificación tras escribir, reintentos, "reintentar fallidas" y NVM. Presets JSON y **backup como preset** (excluye comandos, reloj y la identidad de red — esclavo, PAN ID y clave — que son propios de cada TCU). Filtro de variables. **CSV por TCU** (`NCU;TCU;variable;valor`) para dar valores distintos a cada seguidor en una pasada. Doble confirmación en los registros de comando, y el log dice el valor que **había antes** de cada variable. |
| **Leer variable** | Varias variables a la vez en un rango o en la planta completa, una columna por variable, con resumen de discrepancias (cuántos TCU tienen cada valor). Segunda lectura de los anómalos: una respuesta descolocada no se convierte en un falso positivo. |
| **Volcar TCU** | Backup completo (CSV/JSON con metadatos), comparación contra un backup anterior —lo que verifica una TCU recién sustituida— y **BACKUP NCU** masivo, un JSON por TCU. |
| **Diagnóstico** | Salud `OK / AVISO / ALARMA / OFFLINE` con el **mismo criterio que el SCADA**, alarmas decodificadas bit a bit en texto, modo, posición real/objetivo/desviación y una fila por NCU y por HSU. Por defecto **vía NCU**: lee el bloque que la NCU ya cachea de sus TCUs (puerto 502), segundos en vez de minutos. **TEST COMM** es la prueba más rápida de campo: quién habla y quién no, con la antigüedad del último dato. |
| **Baterías** | Todas las variables de batería en una tabla: SoC, SoH, tensión y corriente de batería, tensión de panel, corriente de entrada y las dos temperaturas, con su auditoría (batería desconectada, no carga, panel sin tensión, fuera de la flota…). De noche no mira el panel: todos están a 0 V y marcaría media planta. **LEER CARGA** pregunta al equipo el estado del cargador y sus alarmas en vez de deducirlo de las corrientes. |
| **Auditoría** | Compara un rango contra un *preset de referencia* y lista **solo las desviaciones**, marcando en rojo las que además son valores imposibles. Desde ahí se pasa directo a escribir la corrección (o a un CSV, si las TCUs afectadas no son consecutivas). Incluye el **inventario** de flota: FW, nº de serie, MAC Xbee y fecha de fabricación, con aviso de firmwares mezclados. |
| **PEM** | Puesta en marcha. **Test de motor** por rango (Δángulo y corriente en los dos sentidos, con guardia de viento y parada garantizada), aplicar modo, limpiar alarmas enclavadas, stow y estado de **comisionado** de la planta entera. |
| **Firmware** | Planifica la campaña de actualización: a partir del inventario y de una versión objetivo, agrupa las TCUs pendientes en tramos `desde-hasta` por NCU y gateway —que es justo lo que pide el updater de Sunner— y estima el tiempo en serie y en paralelo. **VERIFICAR TRAS ACTUALIZAR** relee el FW y dice cuáles subieron. |
| **Cierre** | El parte de la campaña: qué TCUs quedaron actualizadas, cuáles siguen pendientes y cuáles no comunicaron. |
| **SAT** | Los ensayos de aceptación del Anexo 4 que se pueden automatizar: registro continuo de la planta durante días (a disco, resistente a reinicios), veredicto de precisión de seguimiento (D.1.1), disponibilidad de TCU/RSU/NCU (D.3.4) y de comunicaciones (D.4) con sus umbrales editables, más el cronómetro de abanderamientos. |
| **HSU** | La estación meteo. **BUSCAR HSUs** dice cuáles hay y de qué NCU cuelga cada una —y **avisa si falta alguna** frente a la topología—; meteo en vivo, umbrales de viento, reloj, calibración del cero de nieve y la caja negra de 24 h. |
| **Utilidades** | Sincronizar el reloj con el PC (con verificación leyendo el reloj real) e identificación: FW principal y de fábrica, MCU secundario, BQ, HW, Xbee, MAC, nº de serie y lote. |

Consola común con colores, botón **CANCELAR** para abortar operaciones largas, barra de avance con estimación, log automático a `logs/`, ventana redimensionable e **informe HTML** con todo lo hecho en la sesión.

## Sin error de puerto

Las entradas **"(auto)"** del desplegable cubren la NCU completa: la toolbox resuelve sola el puerto (503/504) de cada TCU según los rangos y recorre los gateways en secuencia. En El Burgo: NCU1 = 1–56 (503) y 57–108 (504); NCU2 = 1–45 (503), 46–107 y la **TCU 109** suelta (504) — la 108 no existe.

En operaciones de planta completa cada línea del log lleva delante **la NCU** además del TCU: los números de TCU se repiten en cada NCU, y sin eso una línea no dice de qué equipo habla.

## Mapa y pruebas

Mapas de registros **SUNNER TCU v6.1 (FW v1.4.3)**, **NCU R7.1** (salud de la NCU y bloques cacheados: puerto 502, unit 1) y **HSU R23**. La NCU actúa de gateway: el *unit id* Modbus es el número de TCU.

Pruebas: **957 comprobaciones** de la lógica no-GUI contra un servidor Modbus TCP simulado, más una auditoría estática de la maqueta de ventana y una prueba del informe HTML en navegador real. Se ejecutan en cada cambio.

## Pendiente de confirmar en campo

- La **TCU 109 de NCU2** (El Burgo) responde por el 504, y el auto-borrado de los bits 0/1 de 40007 al sincronizar el reloj.
- El **bloque largo de 50 registros por TCU** de la NCU (`50000 + (TCU-1)*50`), del que sale la sección de carga: está en el mapa R7.1, pero no está comprobado contra una NCU real. Si ninguna contesta, la herramienta lo dice en la consola.
- No hay forma documentada de **borrar las alarmas memorizadas** (`Alarms2`) desde la NCU: el `40007` bit 13 solo cubre la de motor.
