# Medidor de tráfico

> Qué mete el SCADA en la LAN de planta y cuánto sube a la nube cada planta. Mismo modelo de bytes para lo estimado y lo medido, así que las dos cifras son comparables.

**Visor:** [trafico.html](https://imoriana3.github.io/scada/trafico.html) · **Código:** repo [`scada`](https://github.com/imoriana3/scada) (`collector/traffic.py`, `tools/trafico.py`)

## Qué contesta

Dos preguntas que hasta ahora se contestaban a ojo:

1. **Qué cuesta el SCADA en la LAN de planta.** El enlace a las NCU no siempre es una LAN sana: a veces es un túnel de soporte con 300 ms, a veces un 4G.
2. **Cuánto subiría cada planta a la nube**, para dimensionar el plan de datos antes de contratarlo.

Respuesta corta, con el polling de 30 s de hoy: **la planta mayor sube 8 GB/mes** y las diez juntas 23. Una SIM de 10 GB cubre San José; el problema sigue siendo la cobertura, no los datos.

| Planta | NCU | TCU | LAN MB/día | Nube MB/día | Nube GB/mes |
|---|---:|---:|---:|---:|---:|
| San José 24019 | 21 | 2289 | 501,1 | 269,8 | 8,09 |
| Panbianco 25004.2 | 12 | 1476 | 319,8 | 166,4 | 4,99 |
| Ayora 24025 | 16 | 754 | 182,1 | 131,6 | 3,95 |
| Benante 25004 | 6 | 730 | 158,6 | 82,6 | 2,48 |
| Páramo 25019 | 4 | 396 | 87,7 | 48,3 | 1,45 |
| El Burgo I 23003 | 2 | 215 | 47,9 | 25,5 | 0,76 |
| El Polvorín 25082 | 2 | 119 | 27,9 | 18,4 | 0,55 |
| Fayón 24007 | 1 | 24 | 6,8 | 6,4 | 0,19 |
| Túnez 24021 | 1 | 19 | 5,9 | 6,0 | 0,18 |
| Bagnarelli 24030 | 1 | 17 | 5,9 | 5,8 | 0,17 |
| **Flota** | **66** | **6039** | **1343,6** | **760,7** | **22,8** |

El inventario sale del **plano del propio SCADA** (`index.html`), donde cada TCU declara de qué NCU y de qué gateway cuelga: es el mismo plano que pinta la capa de telemetría, así que lo que sale aquí es lo que se va a pollear de verdad.

Tres cosas que se leen en la tabla:

- En las plantas pequeñas **manda la cabecera, no el dato**: Fayón sube 6,4 MB/día con 24 seguidores y Túnez 6,0 con 19, porque cada escritura HTTP paga sus ~500 B pase lo que pase. Por eso el colector manda NCU y meteo en un solo POST.
- El gzip hace el trabajo: de 2021 MB/día crudos en San José a 270 comprimidos.
- La sensibilidad al ritmo es **lineal**: a 10 s se triplica, a 5 min se divide por diez.

## Leer a un ritmo y subir a otro

El polling manda en seguridad y en el mapa de estados, así que no siempre se puede tocar. Pero **subir no es leer**: se puede seguir sondeando cada 30 s, guardarlo todo en el InfluxDB de planta y mandar a la nube solo el dato minutal. En El Burgo I:

| Sube cada | Campos | De la ventana | MB/día | GB/mes | vs hoy |
|---|---|---|---:|---:|---:|
| 30 s (cada ciclo) | todo (17) | último valor | 25,5 | 0,76 | 100 % |
| 30 s | operación (8) | último valor | 14,0 | 0,42 | 55 % |
| 1 min | todo | último valor | 12,7 | 0,38 | 50 % |
| 1 min | todo | media/mín/máx | 32,9 | 0,99 | **129 %** |
| 1 min | operación | último valor | 7,0 | 0,21 | 27 % |
| 5 min | todo | último valor | 2,5 | 0,08 | 10 % |
| 15 min | mínimo (4) | último valor | 0,4 | 0,01 | 1 % |

La fila en negrita es la que sorprende: **agregar sale caro**. Media, mínimo y máximo triplican los campos numéricos, así que subir minutal agregado cuesta *más* que subir cada 30 s el último valor. Para ahorrar se sube el último valor y el detalle se queda en planta; para no perder los picos de viento o de corriente de motor, se paga.

En flota: 22,8 GB/mes hoy, 11,4 minutal, 6,5 minutal con solo campos de operación, 2,3 a cinco minutos.

## Lo que pesa cada campo

No es su longitud, es su **dispersión** — medido quitándolo y volviendo a comprimir:

| Campo | B crudos/TCU | B gz/TCU |
|---|---:|---:|
| `panel_voltage` | 20,0 | 3,97 |
| `battery_voltage` | 22,0 | 3,44 |
| `comms_age_s` | 16,7 | 3,23 |
| `soc` | 7,0 | 2,01 |
| `target_angle` | 18,0 | 0,29 |

`target_angle` ocupa 18 B crudos y 0,3 comprimidos porque vale lo mismo en los 108 seguidores de la NCU; `panel_voltage`, que baila en cada uno, cuesta trece veces más siendo igual de largo. Cualquier "quitamos campos para ahorrar" hay que decidirlo con la columna comprimida, no con la cruda.

## Cómo se cuenta

No es un sniffer: es una caja registradora. El colector apunta lo que pide y lo que escribe, y el tamaño sale del protocolo, que es rígido:

| Concepto | Bytes |
|---|---|
| Petición Modbus FC03 — MBAP 7 + función 1 + dirección 2 + nº registros 2 | 12 |
| Respuesta de n registros — MBAP 7 + función 1 + byte count 1 + 2n | 9 + 2n |
| Cabecera IPv4 + TCP por segmento | 40 |
| Apertura y cierre de conexión, una vez por ciclo y NCU | 7 segmentos |
| Nube — line protocol comprimido con gzip | medido |
| Cabeceras HTTP + TLS por escritura | 500 |

Un ciclo real (NCU1 de El Burgo, 108 TCU y 2 HSU): 22 lecturas del bloque compat troceadas de 110 en 110, 2 de `lastComm`, 2 de la NCU y 2 de las HSU — **28 transacciones, 8346 B**. Por 2880 ciclos al día son 24 MB/día de una sola NCU.

Queda fuera, y siempre a la baja: los ACK puros (viajan montados en el segmento siguiente), la trama Ethernet (lo que factura un 4G es la carga IP) y el retorno de la nube, porque el colector solo escribe.

## Medido, no solo estimado

El colector publica el coste de **cada ciclo** en una serie propia (`traffic`) y `GET /traffic` lo agrega por NCU y planta. La proyección a día se hace sobre el tiempo **realmente medido**, no sobre la ventana pedida: un colector parado dos horas no infla la media. El chip del SCADA lo enseña en vivo, y el visor pone lo medido al lado de lo estimado.

## La malla Zigbee es otra pregunta

El tráfico NCU ↔ TCU **no se mide: se modela**, y no por pereza:

- **Nadie lo cuenta.** El mapa Modbus R7 da de radio `lastComm`, el canal, el estado de asociación y la alarma `zigbee_fail`. Ni un contador de paquetes ni de bytes. El gateway Digi da RSSI, `ack_failures`, saltos — calidad de enlace, no volumen.
- **No es tráfico del SCADA.** La NCU sirve de su caché; la malla corre a su ritmo. Se puede dejar de pollear una semana y el tráfico de radio será el mismo.
- **Lo que duele allí no son los megas**, son 250 kbps compartidos: por eso el visor saca **ocupación de aire** por malla y no MB/mes.

Con un refresco de 60 s la peor malla de la flota (72 TCU en un gateway de Ayora) ocupa ~2 % del canal. Los parámetros del modelo (saltos medios, reintentos, tamaño de trama) están a la vista y **dos de los tres se pueden calibrar** con lo que ya captura [Cobertura Zigbee](https://imoriana3.github.io/cobertura-zigbee/): las rutas dan los saltos reales y el `ack_failures` del gateway es literalmente un contador de retransmisiones.

## Uso

- **Visor** ([trafico.html](https://imoriana3.github.io/scada/trafico.html)): elige el ritmo de polling, la cadencia de subida, qué campos van y si se agrega la ventana — la tabla entera se recalcula y el KPI dice a qué porcentaje del plan de hoy te quedas. Pincha una planta para el reparto por NCU; la calculadora estima una planta que aún no existe; el panel de abajo consulta la API si tienes el stack levantado.
- **Consola**: `python tools/trafico.py`, con `--intervalo 10,30,60,300` para la sensibilidad, `--planes` para comparar planes de subida, `--campos` para el peso de cada campo y `--zigbee` para la malla.
- **Banco**: `python tools/test_trafico.py`. Comprueba el modelo de bytes, que **lo estimado coincide exactamente con lo que el driver contabiliza** en un ciclo real, que el line protocol de ejemplo es el que genera `influxdb_client`, y que el visor no se ha desviado del modelo ni del inventario.

Los datos del visor los hornea `python tools/gen_trafico.py --write` desde `config/plants.yml` y el inventario de la TCU Toolbox: la página no reimplementa el modelo, lo consume.

---

*Factiun · proyecto interno.*
