# Simulador de planta TCU

> Una planta entera de seguidores simulada equipo a equipo —NCU, TCUs, HSUs y repetidores— con la jerarquía de control real y el mapa Modbus de los tres dispositivos actualizándose en vivo. Los números y el algoritmo no son suyos: los lee de SolarGPT.

**Visor:** [simulador.html](https://imoriana3.github.io/gemelo-digital/simulador.html) · **Código:** repo [`gemelo-digital`](https://github.com/imoriana3/gemelo-digital), carpeta `sim/`

## Qué contesta

El gemelo de `index.html` ya tenía seguimiento solar y los modos manual/auto de **un** seguidor. Lo que faltaba para que sirviera de banco de pruebas es la **planta**: un TCU no decide solo. Le llegan el viento de una HSU que no es la suya, un interruptor de limpieza del armario de la NCU, un forzado por Modbus a su grupo, una seta que le corta el motor. Y todo eso se ve, desde fuera, como registros concretos.

Aquí están las dos cosas a la vez: **el comportamiento y su reflejo en el mapa**.

## Jerarquía de control

De más a menos prioritaria. La regla que gana fija el ángulo objetivo; el detalle del equipo la pinta en verde y en ámbar las que están activas pero pierden.

| # | Regla | Qué la dispara | Dónde se ve |
|---|---|---|---|
| — | **Seta de emergencia** | pulsador local, seta del armario o cable cortado | no decide el objetivo: **corta el motor**. 30002.4 · NCU 30100.13 |
| 1 | **SP1 viento** | nivel de viento de cualquier HSU o `force_sp_1` | 30001 bits 15:13 = 1 |
| 2 | **SP3 nieve** | alarma de nieve o `force_sp_3` | 30001 bits 15:13 = 3 |
| 3 | **SP4 limpieza** | interruptor del grupo (NCU 30100 bits 12:3) | 30001 bits 15:13 = 4 |
| 4 | **SP2/5/6/7** | forzados genéricos de la NCU | 30001 bits 15:13 |
| 5 | **Batería** | SOC bajo el crítico → defensa 55°; bajo L2 del firmware → congela | 30001 bits 2:1 · 30002 bits 13/12/11 |
| 6 | **Manual** | modo 1, consigna del operador | 30001 bits 9:8 = 1 |
| 7 | **Auto** | seguimiento con backtracking; de noche, posición nocturna | 30001 bits 9:8 = 2, bit 0 |

El viento manda sobre manual, que es como se comporta el equipo real.

## Lo que lo diferencia de un simulador «parecido»

**El TCU no sabe dónde está la mesa: sabe lo que mide.** La simulación mantiene las dos cosas separadas —el ángulo real y el medido, con su desajuste de montaje, su offset de 41058, su deriva térmica, su ruido y su cuantización a 34,7 pulsos/°— y **el lazo se cierra sobre la medida**. De ahí sale el defecto que no se ve en pantalla: 3° de desajuste sin compensar y el TCU publica que está clavado en su objetivo mientras la mesa está torcida, con el SCADA en verde y la producción sin aparecer. Es justo lo que persigue el ensayo **D.1.1** del Anexo 4, y por eso ese ensayo necesita instrumento externo.

**La seta es una línea de contacto, no una regla.** Antirrebote, normalmente cerrada (un cable cortado se lee como pulsada), **enclavada** (soltarla no rearma: hay que limpiar con 40007.13, y como la del armario alcanza a toda la planta, hay que limpiar la flota entera). El algoritmo sigue calculando por debajo, así que la diferencia de 30110 se va abriendo — que es lo que ve el operario.

**Las averías de eje son físicas y la alarma se deduce.** Eje calado: no gira, el motor pega corriente de calado y salta la sobrecorriente software (41040) casi al instante. Eje duro: gira arrastrándose sin llegar al disparo, y se detecta por la vía lenta —ventana de 41039, tres reintentos de 41065— hasta el bit de eje bloqueado. Dos averías, dos caminos, como el firmware.

## De dónde salen los números

Ninguna constante se escribe a mano. `sim/fisica.js` y `sim/modbus-map.js` los **genera** un script desde sus fuentes, y el generador **coteja lo que aparece en más de un sitio y se niega a escribir si divergen**:

| Fuente | Qué aporta |
|---|---|
| `solargpt_core/tcu.py` | perfiles de hardware, motor medido, políticas verano/invierno |
| `solargpt_core/tracker.py` | canónicos de control: ±55°, banda muerta, 0,17 °/s, política de difusa |
| `solargpt_core/tcu_compare.py` | se coteja: es el motor con el que SolarGPT compara variantes |
| `scripts/tfm_constants.py` | constantes del TFM |
| `cobertura-zigbee/modbus.html` | el mapa: NCU 94 · TCU 181 · HSU 240 direcciones |

Eso ya ha cazado dos divergencias reales que llevaban tiempo: el consumo de reposo (0,45 W frente a los 0,64 medidos, ~2 puntos de SOC al año) y la velocidad del actuador (0,16 frente a 0,17 °/s, un 6,3 % más de energía de motor en **cada** movimiento del año).

## El algoritmo se lee, no se copia

El backtracking, la política de cielo cubierto y la gestión de batería **son módulos de SolarGPT** y se desarrollan allí. El simulador los **llama como API** contra el motor local:

```bash
cd SolarGPTfull/server && ./run.sh      # http://127.0.0.1:8765
```

| endpoint | módulo que ejecuta |
|---|---|
| `POST /tracker` | `poa.compute_tracker_poa_v2` — trayectoria del día con backtracking y difusa dentro |
| `POST /tcu` | `tcu_compare.run_tcu_sim` — SOC, carga, consumo, JEITA, calefactor |

El reparto es: **el motor dice adónde ir; el equipo simulado pone cuánto tarda, cuánto cuesta y qué publica.** Las maniobras de protección se quedan del lado del equipo a propósito — el motor calcula el día por adelantado y no sabe lo que va a medir una HSU dentro de diez minutos, así que con viento fuerte manda el abanderamiento, no la trayectoria.

Sin el servicio la página sigue abriendo, pero **lo dice**: el indicador pasa de `SolarGPT ✓` a `navegador` y avisa de que eso es un modelo de primer orden. Un resultado degradado que parece canónico es peor que no tener resultado.

## Lo que hay que saber antes de fiarse

- **No habla Modbus por la red.** Genera la *imagen* de registros que el equipo serviría. Para el transporte de verdad está `scada/tools/ncu_simulada.py`, que es un esclavo Modbus TCP real.
- **La escritura del mapa no está.** Lo que el equipo publica está entero (13/13 estado y alarmas, 24/24 medidas, 12/12 calculados); lo que **recibe** no: 0/31 comandos del TCU, 0/11 de la HSU, 19/69 configuración. Hoy la toolbox puede leerlo pero no ejercitarlo.
- **Dos registros llevan codificación inventada.** 30113 y 30114 los nombra el documento pero no transcribe su enumerado; el visor los pinta en violeta.
- **No es un modelo bancable.** Es un banco de pruebas de control y de lectura de mapas, no un PVsyst.
