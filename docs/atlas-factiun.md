# Atlas FACTIUN · Plantas FV

**URL de acceso:** [https://maps-9rd.pages.dev](https://maps-9rd.pages.dev)  
**Estado conocido a 23-10-2026:** V9 operativa, con Cloudflare Access y consultas/escrituras de coordenadas en Notion. V10 de zoom satélite HD preparada en un ZIP independiente; su despliegue en esta URL **no está confirmado**.

## Para qué sirve

Visor geográfico mundial del catálogo de plantas fotovoltaicas **sobre suelo** de FACTIUN. Combina navegación global en globo con cartografía satélite local; localiza plantas por nombre o identificador de fase GEM, ofrece filtros por equipos y permite comparar fichas. El catálogo geolocalizado procede de un export de Notion y de coincidencias GEM (febrero de 2026), con diversos grados de precisión: no todas las ubicaciones son levantamientos de campo.

## Corrección de coordenadas desde el navegador

1. Abrir Atlas e iniciar sesión mediante **Cloudflare Access** con una identidad autorizada.
2. Buscar la planta y comprobar su **nombre y GEM phase ID** para no confundir fases vecinas.
3. Acceder a la imagen satélite, seleccionar **Corregir ubicación** y marcar visualmente la posición.
4. Confirmar la operación. El servicio valida que el identificador de fase corresponda a una única ficha en Notion antes de guardar.
5. Consultar de nuevo esa planta para verificar la escritura persistida. La prueba inicial se realizó con **Ceclavín**, confirmada por el operador.

Una coordenada situada manualmente en la ortofoto es una **ubicación visual aproximada**, no una coordenada as-built/topográfica. Si la planta tiene levantamiento verificado, se preserva la prioridad de esa fuente.

## Arquitectura y privacidad

- **Interfaz:** Cloudflare Pages, URL `maps-9rd.pages.dev`.
- **Protección:** Cloudflare Access con usuarios autorizados; no exponer la página principal ni las previews sin política de acceso.
- **Escrituras:** función segura de servidor que utiliza `NOTION_TOKEN` almacenado como secreto de Cloudflare; no introducir tokens en el frontend ni en este repositorio.
- **Fuente de verdad:** base Notion **14 · Plantas y proyectos FV**. Las correcciones se guardan en `Latitud`, `Longitud` y propiedades de procedencia autorizadas, sin cambiar identidad ni datos técnicos.
- **Datos precargados:** el globo parte de una fotografía exportada del catálogo; los cambios que se guardan en Notion **todavía no se sincronizan automáticamente** con esa fotografía cuando se vuelve a cargar la aplicación.

## Versiones

| Versión | Estado | Alcance |
| --- | --- | --- |
| V9 | Operativa, comprobada por el operador | Globo, búsqueda y corrección de coordenadas persistida en Notion |
| V10 | Paquete preparado; despliegue **sin verificar** | Zoom globo → satélite por teselas hasta z19 (según cobertura), agrupación de marcadores y rótulos corregidos |

No anunciar V10 como publicada hasta confirmar esa URL en producción.

## Próximos trabajos

- Publicar y comprobar la V10 en `maps-9rd.pages.dev` conservando Access y secretos.
- Implementar **lectura de las coordenadas corregidas de Notion al abrir el Atlas**, sin tener que subir un nuevo ZIP por cada corrección.
- Revisar rendimiento, calidad de las teselas en cada zona, precisión por fuente y separación de fases GEM.
- Documentar verificaciones: lectura, escritura autorizada, protección de fichas con topografía verificada y respuesta ante errores.

## Relación con el Panel de Proyectos

Esta tarjeta es un **acceso a una herramienta externa existente**. El Panel no aloja el Atlas ni duplica la base; no debe almacenar credenciales de Cloudflare o Notion.
