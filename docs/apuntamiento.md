# Simulador de apuntamiento · ISS-D60

**Estado:** herramienta web en desarrollo. Sin datos de planta precargados ni servidor para recibir CSV.

## Objetivo

Auditar el error angular medido por sensores solares ISS-D60 y contrastarlo con el seguimiento SUNNER. Permite probar filtros y exportar, por minuto, **qué se incluye y qué se excluye**. No modifica los registros originales ni sustituye una certificación de ensayo.

## Cómo abrirlo

Desde la tarjeta del Panel de proyectos o desde `sim-apuntamiento.html`.

1. Cargar uno o varios `Log_Sensor_*.csv` del sensor. Las continuaciones con la misma marca inicial de hora se unen cuando están acompañadas de su tramo con NCU/TCU.
2. Cargar opcionalmente los históricos `[NCU-N]_TCU_NNN_YYYY-MM-DD.csv` del **mismo** equipo.
3. Seleccionar seguidor y fecha. Si un CSV no identifica NCU/TCU, asignarlo expresamente: **nunca se infiere a partir de la similitud de curvas**.
4. Ajustar el desfase **reloj TCU − reloj sensor** antes de confiar en los filtros de posición. La herramienta no convierte automáticamente las fechas a UTC.
5. Activar/desactivar filtros y examinar media, P95 y muestras. Los minutos excluidos aparecen como franjas de color en la gráfica y se pueden seleccionar en la tabla de periodos.
6. Descargar el CSV minutal de auditoría y, por separado, el CSV de intervalos de exclusión (inicio, último minuto, duración, motivo, origen).

## Magnitudes

- Sensor ISS-D60: registros 30072/73 (X/Y filtrados), 30074/75 (X/Y sin filtrar), entero firmado de 16 bits; escala nativa **0,01° por unidad**, confirmada por SUNNER. El factor es editable para diagnóstico, no como vía para forzar cumplimiento.
- **X filtrada, 30072**: canal principal del ensayo según la orientación física indicada para estos seguidores. **Y**: componente perpendicular/diagnóstico.
- Radiación estimada del sensor, registro 30070; mínimo **> 600 W/m²**.
- Históricos TCU: `angle` y `target_angle` ya expresados en grados, **sin aplicarles la escala ISS-D60**.
- Media y percentil 95 calculados sobre valores absolutos del canal elegido, utilizando una muestra instantánea por minuto.

## Reglas de exclusión

- Sensor inválido: `System info[30069] != 0`.
- Backtracking: flag del sensor **o** `backtracking` del histórico TCU, cuando está emparejado.
- Seguridad: `active_security_position != 0` en histórico TCU, si está disponible.
- Límite mecánico: `target_angle` próximo a **±55°**, con margen configurable.
- Parada sostenida: objetivo próximo a **+30°** durante al menos el número de minutos configurado. **Un paso instantáneo por +30° no se excluye por sí solo.**
- Recuperación: desde el fin de la meseta a +30° hasta encontrar tres minutos consecutivos con `|Real - Target| <= 0,3°` (configurable). Esta heurística es **diagnóstica**, no un criterio contractual acordado.
- Intervalos externos confirmados de stow: franjas `HH:MM-HH:MM` aportadas a partir de SCADA u otra evidencia. **No se descartan puntos por tener un error elevado.**

## Cronología de exclusiones (v0.2)

La tabla **Periodos de exclusión** identifica, para cada motivo activado, inicio y último minuto excluido, número de muestras y origen (sensor, TCU o intervalo externo). El gráfico superpone franjas de color y permite destacar un tramo haciendo clic en la tabla. **No se asumen intervalos continuos a través de huecos de adquisición**: solo se agrupan minutos consecutivos. Los motivos pueden solaparse y un minuto descartado puede aparecer en varios motivos; el total de minutos excluidos se cuenta una sola vez. La exportación de intervalos conserva esos solapamientos.

Si no hay CSV de seguimiento TCU, únicamente pueden visualizarse los motivos acreditados por el CSV del sensor (DNI, sensor, BT) o franjas externas introducidas expresamente. **No se inventan intervalos de ±55°, +30°, recuperación ni stow de la TCU.** La hora de cada intervalo es la marcada por el CSV del sensor; no garantiza que sea UTC ni hora civil sincronizada.

Los filtros de estado o consigna que dependen de la TCU **no pueden verificarse** cuando falta el histórico o el reloj no está emparejado correctamente. Un `active_security_position = 0` no demuestra ausencia de cualquier otro abanderamiento.

## Requisitos del cliente / límites

Se muestran como referencia: **al menos 360 muestras**, **media absoluta < 1,5°** y **P95 absoluto < 2,5°**, en condiciones del ensayo. El resultado de pantalla es solo **numérico y provisional**: la validez contractual necesita identificación del eje y plano del sensor, estados completos, condiciones meteorológicas y exclusiones justificadas.

## Privacidad y trazabilidad

Los CSV se leen mediante la API File del navegador y no se envían al repositorio ni a servicios externos. El repositorio público **contiene únicamente el código del simulador**, sin datos de plantas. La exportación incluye fecha de cada lectura, DNI, X/Y, Real, Target, flags de seguimiento y motivos de exclusión. Conservar el CSV original y una copia de la configuración aplicada.

## Pendientes de validación

- Probar en navegador publicado con varias continuaciones, fechas y CSV sin identificador.
- Validar la sincronización contra transiciones de backtracking del histórico real.
- Revisar con ingeniería el procedimiento contractual de exclusión de límites y transitorios.
- Añadir una exportación de informe Word FACTIUN al mismo flujo cuando el motor documental esté validado.
