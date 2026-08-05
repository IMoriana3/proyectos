# IPs de plantas — la hoja de IPs del Excel, editable y con login

> Tabla editable interna con la topología de comunicaciones de cada planta: NCUs, IPs, gateways, rangos de esclavos, versiones de firmware y accesos remotos. Misma app y mismo login que la Cartera (Supabase, RLS). Es la **fuente de verdad** que alimenta a la TCU Toolbox.

## Qué es

La segunda pestaña del Excel maestro ("Direcciones IP") convertida en tabla web (`ips.html` en el proyecto `factiun-cartera`): una fila por NCU, con búsqueda, filtro por planta, orden y CRUD. Las contraseñas van **enmascaradas** en la tabla y solo se ven al editar. Sembrada desde el Excel (42 NCUs, 6 plantas: Burgo I, Fayón, San José, Túnez, Ayora y Bagnarelli).

## Uso

1. Entra desde esta ficha (botón *Abrir*) o desde la Cartera (botón **IPs →** en la cabecera), con tu misma cuenta.
2. Edita ahí cualquier cambio de topología: IPs, rangos de esclavos por gateway, versiones, accesos. Se guarda al instante en Supabase.
3. Para llevarlo al campo: **⬇ JSON toolbox** descarga un fichero de plantas por planta (respeta el filtro activo) en el formato exacto de la **TCU Toolbox** — se suelta en la carpeta `plantas/` del portátil o se importa con el botón **Cargar...** de la herramienta. **⬇ CSV toolbox** hace lo mismo en formato `Planta;NCU;IP;Puerto;TCU_ini;TCU_fin`.

Los exportes llevan **solo topología** (nombre, IP, puerto, rangos): las credenciales nunca salen de la tabla.

## Regla de mapeo

GW1 = puerto 503, GW2 = puerto 504 (passthrough Modbus de la NCU); los rangos de TCU salen de las columnas "Esclavos". Con esa información la toolbox resuelve sola el puerto de cada TCU (entradas "(auto)").

## Pendiente de campo

- Confirmar la **TCU 109 de Burgo I NCU2**: el Excel dice esclavos `46-107`, pero los `.bat` de Sunner incluían la 109.
