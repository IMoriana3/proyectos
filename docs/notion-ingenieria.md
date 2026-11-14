# Notion ingeniería

**Inteligencia técnica de fuentes públicas para seguidores solares.** La tarjeta abre un explorador dentro del Panel y enlaza con el [hub nativo de Notion](https://app.notion.com/p/4186931d6436813ab499f73d69e82b04).

La primera exportación, del 14 de noviembre de 2026, contiene nueve fichas canónicas y diez URLs de evidencia. Cubre los diez frentes; una misma ficha puede pertenecer a varios. Es una selección inicial, no un censo del mercado.

## Qué se puede consultar

| Frente | Información que se busca |
|---|---|
| Modelos y generaciones | Nuevos trackers, arquitectura, diferencias entre versiones y situación documentada. |
| Patentes y mecanismos | Problema técnico, reivindicaciones, dibujos, familias e inventores. |
| Personas y equipos de diseño | Aportaciones profesionales: autoría, invención, participación y colaboraciones públicas. |
| Proveedores reales | Componentes y relaciones industriales con cliente, periodo y alcance identificados. |
| Construcción y montaje | Manuales, uniones, materiales, fijaciones, instalación y mantenimiento publicados. |
| Estrategias de control | Algoritmos, señales, condiciones, prioridades, versiones y resultados divulgados. |
| Laboratorios y ensayos públicos | Métodos, revisión de diseño, ensayos, certificación, configuración y límites. |
| Investigación publicada | Artículos, tesis, proyectos, autores, datos y resultados. |
| Fallos y respuestas | Incidente, condiciones conocidas, atribución causal y respuesta técnica publicada. |
| Señales de desarrollo | I+D, fábricas, colaboraciones, adquisiciones de tecnología y capacidades anunciadas. |

La navegación permite filtrar por frente, empresa, tecnología, persona, producto y tipo de evidencia. La búsqueda ignora tildes y combina los términos. La selección se conserva en la URL, que también puede abrir directamente una ficha.

## Cuatro formas de leer la selección

- **Fichas:** hallazgo, atribución y temas técnicos. Al abrir una ficha aparecen las fuentes, localizadores, detalles, alcance y acceso a Notion.
- **Tabla:** comparación de hallazgos, entidades, tecnología, tipo de evidencia y situación pública.
- **Evolución:** orden temporal. Identifica si una fecha corresponde al hecho o a la publicación; las fechas desconocidas quedan en su propio grupo.
- **Relaciones:** vínculos explícitos con fuente. No crea relaciones por la mera presencia de dos empresas o personas en una ficha.

La interfaz se adapta a móvil y escritorio. Sigue el contrato visual del Panel con `?luz=dia`, `?luz=noche` o `?luz=auto`. El selector cambia la apariencia, sin modificar datos técnicos.

## Cómo interpretar una ficha

**Hecho documentado**, **declaración del fabricante**, **inferencia** y **sin verificar** son atribuciones distintas. La ficha conserva el alcance de la afirmación. Que un documento exista no convierte todas sus prestaciones en un ensayo independiente.

Los estados **anunciado**, **comercializado** e **instalación documentada** se registran por separado. Una patente describe una solución; no demuestra por sí sola su uso en un producto. El estado legal de una patente necesita una consulta identificada. Las contribuciones de personas son históricas y profesionales; no se convierten automáticamente en un cargo actual.

La fecha del hecho, de publicación y de consulta se conservan de forma independiente. Si una fuente sólo identifica un año o un mes, la interfaz mantiene esa precisión. Nunca usa la fecha de consulta para completar un hecho desconocido.

## De dónde salen los datos

El navegador lee `data/notion-ingenieria.json`. La cabecera muestra su fecha de exportación; **Recargar** intenta leer la última copia publicada. No consulta Notion en vivo y no contiene credenciales.

La base canónica es **11 · Fuentes y documentos**. Una ficha pública requiere:

1. Título en `Document`, `Hallazgo documentado`, `Source URL` y `Fecha consulta`.
2. Un `Frente de ingeniería` explícito en el campo `Frentes de ingeniería`.
3. La casilla `Incluir en Notion ingeniería` activada.
4. Evidencia pública revisada y campos curados dentro del contrato de exportación.

`Fecha publicación fuente` identifica la publicación cuando se conoce. El exportador no la deduce del campo histórico `Document Date`, que puede reflejar una revisión documental. Los cuerpos de página, notas, contactos privados y propiedades no incluidas en el contrato no se publican.

## Actualización reproducible

### Sin credencial de API

Los radares de investigación mantienen Notion; sus automatizaciones no publican este JSON. Un mantenimiento asistido prepara la selección pública, conserva IDs estables y revisa las fuentes y relaciones. Después se ejecuta:

```sh
node tools/export-notion-ingenieria.mjs --input /ruta/seleccion-publica-curada.json
node tests/test_notion_ingenieria.mjs
```

Se revisa el diff de `data/notion-ingenieria.json` en una rama y se integra mediante el flujo habitual de PR. La exportación local mantiene la fecha del archivo de entrada; no la adelanta por volver a ejecutar el script.

### Relectura opcional de Notion

```sh
node tools/export-notion-ingenieria.mjs --notion \
  --input data/notion-ingenieria.json \
  --output /tmp/notion-ingenieria-candidate.json
```

Este modo requiere `NOTION_TOKEN` disponible **sólo en el entorno de ejecución**. No se ha configurado ni verificado una credencial de Notion en el Panel durante esta entrega. Usa la versión de API `2026-03-11`, consultas paginadas de la base 11 y la selección publicada como lista explícita de páginas autorizadas.

No incorpora automáticamente nuevas páginas ni sigue relaciones hacia otras bases. Las nuevas candidatas se cuentan como pendientes de curación. Si cambia la URL de una fuente, falta un campo obligatorio o la página no pertenece a la base autorizada, cancela el candidato. Una casilla desactivada excluye el registro. Una exportación vacía se detiene para revisar permisos y exclusiones.

**La relectura produce un candidato que debe revisarse.** Si cambian el hallazgo o el texto de una relación, hay que revisar también su clasificación, situación comercial, facetas, relaciones estructuradas y límites. El script no interpreta ni recertifica esas afirmaciones.

El workflow manual **Notion ingeniería · exportación candidata** valida el contrato y entrega un artefacto. La opción de relectura requiere el secreto de Actions `NOTION_TOKEN`. El workflow no crea commits, no fusiona, no despliega y no añade otra programación a los radares existentes.

Referencias de implementación: [consulta de data sources](https://developers.notion.com/reference/query-a-data-source) y [versionado de Notion](https://developers.notion.com/reference/versioning).

## Integración y verificación

La tarjeta se añade a `PROJECTS` y a la familia Diseño y oferta. `lib/indice.js` la incorpora al índice compartido. El build de Cloudflare incluye la página, estilo, módulos y JSON; conserva la puerta `FACTIUN_PAGES_ACCESS_CONFIRMED`. El service worker guarda el armazón y consulta primero la red para las exportaciones JSON.

El banco de datos comprueba el contrato, los filtros cruzados, fechas desconocidas, atribución, relaciones con evidencia, exclusión de propiedades privadas, paginación y reglas de exportación. El banco de navegador recorre fichas reales, diez frentes, tabla, evolución, relaciones, URL directa, móvil, temas y recuperación ante fallo de carga. No usa una conexión simulada para afirmar validación de Notion real.
