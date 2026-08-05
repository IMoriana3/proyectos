# TCU Toolbox — configuración y diagnóstico de TCUs Sunner (offline)

> Herramienta de campo para O&M: escribe, lee, respalda y diagnostica los TCU de los seguidores a través del gateway Modbus TCP de la NCU. **100 % offline**: un `.ps1` + un `.bat`, sin instalar nada ni salir de la LAN de planta.

## Qué es

El complemento de **escritura** del SCADA: el SCADA es solo-lectura a propósito; cuando hay que *cambiar* algo en un TCU (configuración, reloj, NVM) se usa esta toolbox desde el portátil conectado a la LAN de planta. Vive en el repo `scada`, carpeta [`tools/tcu-toolbox/`](https://github.com/imoriana3/scada/tree/main/tools/tcu-toolbox); PowerShell viene con Windows, así que no requiere instalación ni permisos de administrador.

## Uso

1. **Descargar**: botón *Descargar* de la tarjeta (ZIP del repo `scada`) o `git clone`.
2. Copiar la carpeta `tools/tcu-toolbox/` al portátil de campo — los ficheros de plantas van dentro (`plantas/`).
3. Doble clic en `TCU_Toolbox.bat`. No requiere admin ni internet.
4. Elegir planta en el desplegable — las entradas **"(auto)"** cubren la NCU completa y resuelven solas el puerto de cada TCU — y trabajar con las pestañas.

Antes de ir a planta, re-descarga la carpeta (o solo `plantas/<planta>.json`) si ha cambiado la topología: se regenera automáticamente desde `config/plants.yml` del SCADA en cada cambio (GitHub Actions).

## Cómo se "alimenta" de plantas

No hay que meterle nada a mano: **el ZIP ya baja alimentado**. Los JSON de plantas viven dentro del repo (`tools/tcu-toolbox/plantas/`) y un workflow los regenera y commitea cada vez que cambia `config/plants.yml` — así que cada descarga lleva la topología al día.

Para refrescar **solo las plantas** sin re-bajar el ZIP entero, descarga el fichero suelto y suéltalo en la carpeta `plantas/` del portátil (o impórtalo con el botón **Cargar...** de la herramienta):

- El Burgo I: <https://raw.githubusercontent.com/IMoriana3/scada/main/tools/tcu-toolbox/plantas/elburgo.json> (clic derecho → *Guardar como…*)
- Futuras plantas: mismo patrón, `plantas/<id_planta>.json` en el repo `scada`.

También se admite un CSV editable desde Excel (`Planta;NCU;IP;Puerto;TCU_ini;TCU_fin`, separado por `;`) para apaños en campo sin tocar la plataforma.

> Prueba de estreno recomendada: planta 4.60, filtro `tilt`, lectura del registro 41111 sobre las 44 TCUs — el resumen de discrepancias dice en dos clics si la tanda quedó homogénea.

## Qué hace

| Pestaña | Función |
|---|---|
| **Escribir** | Todo el mapa 4xxxx con verificación, reintentos, presets JSON, backup-como-preset y NVM. Filtro de variables. Doble confirmación en registros de comando. |
| **Leer variable** | Una variable en un rango de TCUs con resumen de discrepancias. |
| **Volcar TCU** | Backup completo (CSV/JSON con metadatos) y comparación contra un backup anterior. |
| **Diagnóstico** | Salud `OK/AVISO/ALARMA/OFFLINE` por rango, mismo criterio que el SCADA, alarmas decodificadas bit a bit en texto. |
| **Utilidades** | Sincronizar reloj con el PC e identificación (FW, nº de serie, MAC Xbee, fabricación). |

## Sin error de puerto

Las entradas **"(auto)"** del desplegable cubren la NCU completa: la toolbox resuelve sola el puerto (503/504) de cada TCU según los rangos y recorre los gateways en secuencia. En El Burgo: NCU1 = 1–56 (503) y 57–108 (504); NCU2 = 1–45 (503), 46–107 y la **TCU 109** suelta (504) — la 108 no existe.

## Topología de plantas

Un fichero por planta en `plantas/` (JSON generado por la plataforma, o CSV `Planta;NCU;IP;Puerto;TCU_ini;TCU_fin` editable desde Excel). El botón **Cargar...** importa un fichero recién descargado sin reiniciar. Fuente de verdad: `config/plants.yml` del repo `scada`.

## Mapa y versión

Mapa de registros **SUNNER TCU Modbus Map v6.1 (FW v1.4.3)**. Versión actual de la toolbox: **2.3**. Pruebas: 75 casos contra un servidor Modbus TCP simulado.

**Pendiente de confirmar en campo**: la TCU 109 de NCU2 responde por el 504, y el auto-borrado de los bits 0/1 de 40007 al sincronizar el reloj.
