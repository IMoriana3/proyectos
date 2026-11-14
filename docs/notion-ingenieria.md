# Notion ingeniería

**La pantalla de ingeniería está en el Radar de Atlas.** [Abrir Notion ingeniería](https://maps-9rd.pages.dev/herramientas/radar-factiun#ingenieria).

La tarjeta del Panel abre directamente esa pantalla, que reúne el radar existente y la selección de diez frentes: modelos, patentes, personas, proveedores, montaje, control, laboratorios, investigación, fallos y señales de desarrollo. Los hallazgos se pueden explorar mediante filtros, fichas, tabla, evolución y relaciones documentadas.

El [hub de Notion](https://app.notion.com/p/4186931d6436813ab499f73d69e82b04) conserva las fuentes y las fichas de trabajo. Atlas mantiene el visor, los datos y sus herramientas de actualización. Las fechas y el alcance de cada conjunto se indican allí.

## Enlaces guardados

La dirección anterior, `notion-ingenieria.html`, redirige a la pantalla de Atlas. Conserva la ficha seleccionada y los parámetros `front`, `ficha`, `q`, `claim`, `company`, `technology`, `person`, `product`, `view`, `sort` y `luz`. Los nueve identificadores de la selección inicial se mantienen.

El destino de la redirección es fijo. Los parámetros ajenos a ese estado no se trasladan. Al volver atrás se regresa a la página anterior, sin detenerse otra vez en la redirección.

Si JavaScript está desactivado o el módulo de compatibilidad no carga, queda disponible un enlace a la entrada de ingeniería en Atlas. La ruta de compatibilidad no muestra fichas ni carga otra copia del visor.

## Mantenimiento y verificación

El Panel mantiene la tarjeta, esta documentación y la compatibilidad de los enlaces antiguos. La exportación pública original se conserva como archivo histórico de auditoría, fuera del paquete web; el proceso activo de actualización pertenece a Atlas.

Los bancos de este repositorio verifican el traslado de parámetros y la navegación de la tarjeta y del alias. En las pruebas de navegador, Atlas se sustituye por un destino interceptado: comprueban la navegación, no la autenticación ni el funcionamiento del visor de Atlas. Las pruebas funcionales de datos, filtros, fichas y relaciones se mantienen en Atlas junto a la pantalla que utilizan.
