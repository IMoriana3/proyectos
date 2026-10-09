# Inundaciones 3D · Factiun

**Estado: EN DESARROLLO · Cribado PRELIMINAR, NO estudio hidráulico certificado.**

## Acceso desde nuestras tarjetas

La tarjeta **«Simulador de inundaciones 3D»** del [Panel de Proyectos](../index.html) abre directamente la sección de hidrología de **la misma aplicación «Generador de implantaciones»**:

[🌊 Abrir inundaciones 3D en el Generador](../generador-layout.html?herramienta=agua3d#hydroCard)

La URL añade un acceso focalizado, **no crea una segunda aplicación ni copia el motor**. Desde la tarjeta del Generador sigue siendo posible acceder al mismo cálculo y a las mismas exclusiones.

## Cómo utilizarla

1. Define la parcela y **descarga o importa el MDT con cotas reales** en Terreno. Si no hay MDT, el módulo debe decir *sin dato*; no simula una llanura inventada.
2. En *Hidrología e inundabilidad*, configura intensidad de lluvia, duración, escorrentía, rugosidad de Manning y condición del borde. Son **hipótesis de escenario**, no datos meteorológicos certificados.
3. Pulsa **Simular**. Se genera una evolución de escorrentía preliminar en la misma malla del generador.
4. Con el resultado vigente, usa **💧 Agua 3D** en la barra del mapa. El agua se pinta sobre las mismas cotas MDT y geometrías del layout, con controles temporales y consulta de calado en un punto.
5. Compara mesas y kWp expuestos; el filtro por calado es **reversible**. Revisa la economía A/B solo con costes, producción específica e hipótesis declaradas. Exporta JSON/GeoJSON con la procedencia.

## Una sola física, varias entradas

| Entrada visual | Fuente / función |
|---|---|
| Tarjeta **Inundaciones 3D** | Enlace directo a la sección hidráulica del Generador |
| Tarjeta **Generador de implantaciones** | El mismo motor y las mismas capas hidrológicas |
| Visor 3D de **SolarGPT** | En otra PR: capa de lectura de resultados hidráulicos externos alineados a su MDT; todavía NO compartida automáticamente con el motor JS preliminar |

La hidrología **D8 geométrica** de SolarGPT es otra cosa: identifica concentraciones potenciales y no debe atribuirse a ella calado, velocidad o volumen de avenida.

## Límites — visibles y obligatorios

- El motor del generador es **prediseño de escorrentía superficial en rejilla**, no Iber/HEC-RAS/CFD contrastado ni cartografía oficial de zonas inundables.
- Sin MDT numérico, **no hay simulación**, ni se añade agua ficticia sobre un campo plano de demostración.
- Los resultados son relativos a **la parcela, el MDT y la tormenta concretos**: modificarlos invalida la simulación y la capa 3D; primero hay que recalcular.
- La cota 3D visual puede estar exagerada en pantalla: se distingue de la profundidad hidráulica de cálculo.
- Un fichero externo GeoJSON puede mostrarse como capa, pero su **vigencia, autenticidad y origen no se verifican automáticamente**.
- No existe todavía conversión general y validada entre SWMM/Iber/HEC-RAS, el módulo HTML del generador y el visor del core SolarGPT. No se anuncia integración que no esté demostrada.
- Sin posiciones/cotas verificadas de NCU, HSU, inversores y CT no se cuantifica automáticamente su riesgo operacional.

## Siguientes entregas

**P1:** comprobar despliegue y prueba de navegador de la PR [#574](https://github.com/IMoriana3/proyectos/pull/574), actualizar el Panel y garantizar que la tarjeta abre el panel correcto.

**P2:** incorporar fuentes oficiales georreferenciadas, hidráulica de referencia de solver, asociación por `asset_id`, cuantificación de exposición por equipos y paridad de escenas/reportes con SolarGPT, con ensayos y hashes.

**Fuente técnica:** [Generador integrado](generador-layout.md) · [plan del visor 3D / SolarGPT #401](https://github.com/IMoriana3/SolarGPTfull/issues/401).
