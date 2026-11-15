# Revisión de las tarjetas Notion compras · Notion ventas · Notion ingeniería

Fecha: **2026-11-15**. Alcance: las tres tarjetas del panel de proyectos (`index.html`, array
`PROJECTS`), sus guías de `docs/` y las pantallas que abren en `IMoriana3/Atlas`.
Repositorio evaluado: `IMoriana3/proyectos`, rama `claude/friendly-bardeen-c5vgah`.

Las tarjetas **no viven en Notion**: están escritas en `index.html` y las pantallas están en
`Atlas/herramientas/`. Notion es la fuente de datos y, en ingeniería, un hub de consulta.

## Lo que está bien

**HECHO** — Las tres guías (`docs/notion-ventas.md`, `docs/notion-compras.md`,
`docs/notion-ingenieria.md`) separan bien lo que en este dominio se confunde: permiso vigente
frente a compra abierta, anuncio frente a cierre, proveedor histórico frente a preferido, y dejan
escrito que un hueco es «sin verificar» o «no documentado», nunca cero. Los precios opcionales sin
generar petición de oferta está cerrado en los dos sitios (tarjeta y guía).

**HECHO** — El alias `notion-ingenieria.html` conserva los once parámetros documentados
(`front`, `ficha`, `q`, `claim`, `company`, `technology`, `person`, `product`, `view`, `sort`,
`luz`), tiene destino fijo y deja un enlace servible sin JavaScript.

## Hallazgos

### 1 · Compras y Ventas siguen siendo la misma pantalla, por archivo · BUG

**HECHO** — En `Atlas/herramientas/`, `notion-compras.html` y `notion-ventas.html` son
byte-idénticos (`md5 c1bbe13892bfd455f591106fe7625094`, 16.007 bytes cada uno) y la pantalla de
compras carga `notion-ventas.css` y `notion-ventas.mjs`.

**INFERENCIA** — El acuerdo de `CONTRATO.md:106` («Compras le abría Ventas y pidió un acceso
propio») se resolvió renombrando la ruta, no separando la pantalla. El efecto queda invertido: un
enlace guardado de *ventas* abre **Compras**. Está documentado como alias de compatibilidad en
`Atlas/docs/NOTION_COMPRAS.md` y `Atlas/herramientas/README.md`, pero el nombre de la ruta
describe lo contrario de lo que sirve. El pie de `notion-ventas-comercial.html:77` enlaza
`./notion-ventas.html` rotulado «Proveedores y componentes».

**PROPUESTA** — Dejar `notion-compras.html` como única pantalla y convertir `notion-ventas.html`
en una redirección de una línea a esa ruta. Afecta a `Atlas/tests/atlas_notion_compras_loading.test.mjs`
(lee `notion-ventas.html` y comprueba que carga el visor) y a
`Atlas/tests/atlas_notion_ventas_core.test.mjs:184`, así que es un cambio en Atlas con su propia
PR. **Pendiente de autorización: toca enlaces guardados y la app protegida.**

### 2 · «Producción» tapaba una comprobación pendiente · APROXIMACIÓN → resuelto

**HECHO** — Las tres tarjetas estaban en `status: "live"` y dos de ellas llevaban abierto
«Comprobar la lectura de datos de Notion con una sesión autorizada en producción», que las propias
guías declaran no acreditado por las pruebas locales.

**DECISIÓN (2026-11-15)** — No se degrada el estado: la publicación de las pantallas está
acreditada (Actions `43640335779`), así que `live` es cierto **como despliegue**. Lo que no está
comprobado es otra cosa —la lectura real de datos—, y conflarlo con el estado del proyecto era el
error. Se añade un eje propio, el campo `verificacion`, que se pinta como sello **siempre visible**
en la cabecera de la tarjeta. Es la lectura literal de la regla de la casa: VALIDATED ≠ MERGED ≠
DEPLOYED.

### 3 · El prefijo «Notion» ya no describe lo que abre la tarjeta · LEGACY

**HECHO** — Ingeniería no lee Notion: abre `radar-factiun#ingenieria` y Notion queda como hub.
Compras y Ventas son pantallas de Atlas que consultan Notion en el servidor; el navegador no recibe
el token.

**INFERENCIA** — Para quien abre el panel, «Notion X» parece prometer que se entra en Notion, y
ninguna de las tres lo hace. Los nombres propios serían **Compras**, **Ventas** e **Ingeniería**,
con «Notion» reservado al botón «Abrir en Notion».

**PROPUESTA** — No aplicado. Renombrar arrastra las claves de `PICTOS`, las listas de `FAMILIAS`,
los `docId` (y por tanto los nombres de `docs/*.md`), los bancos de `tests/` y las referencias
cruzadas de Atlas, además de sustituir dos acuerdos de `CONTRATO.md`. **Pendiente de decisión.**

### 4 · «Notion ingeniería» y «Radar FACTIUN» son la misma pantalla · INTENCIONAL, señalizado

**HECHO** — `Notion ingeniería` abre `https://maps-9rd.pages.dev/herramientas/radar-factiun#ingenieria`
y `Radar FACTIUN` abre `https://maps-9rd.pages.dev/herramientas/radar-factiun.html`: el mismo
visor, dos tarjetas y, hasta hoy, dos familias distintas (*Diseño y oferta* y *Cartera*).

**DECISIÓN (2026-11-15)** — No se fusionan las tarjetas: cada una tiene su guía, sus enlaces
guardados y su `docId`. Se hacen dos cosas más baratas y reversibles: `Notion ingeniería` pasa a la
familia **Cartera**, con lo que las tres pantallas de Notion quedan juntas, y las dos tarjetas se
declaran **relacionadas** entre sí, de modo que la rejilla dice que comparten visor en vez de
disimularlo.

### 5 · Los accesos a Notion eran desiguales · BUG → resuelto

**HECHO** — Ingeniería tenía «Abrir en Notion»; Ventas lo tenía apuntando a una página titulada
**«🔎 Mercado · oportunidades y transacciones»** (no «Ventas»); Compras no tenía ninguno, aunque su
guía promete que «los enlaces a las fuentes y a Notion permiten comprobar el contexto original» y
la página existe: **«Compras · Referencias y proveedores»**
(`4186931d643681329d43d60567331758`, bajo *Componentes y BOM de la TCU*).

**DECISIÓN (2026-11-15)** — Compras estrena su enlace a Notion y el de Ventas se rotula con el
nombre real del destino, «Abrir Notion · Mercado». Ninguno de los dos cambia de página.

### 6 · Versiones descuadradas entre tarjeta y pantalla · BUG → resuelto

**HECHO** — La tarjeta de Compras decía `1.0` y `notion-compras.html` declara
`application-version 1.1`. Ventas: `1.1`. Ingeniería: «Atlas · ingeniería unificada», que es un
rótulo, no una versión. `notion-ventas-comercial.html` no declara versión.

**DECISIÓN (2026-11-15)** — La tarjeta de Compras pasa a `1.1`, el número que sirve la pantalla.
El rótulo de ingeniería se conserva a propósito: esa tarjeta no versiona un paquete propio, abre
una pantalla de Atlas. Que `notion-ventas-comercial.html` no declare versión es un pendiente de
Atlas, anotado aquí y no corregido desde este repositorio.

## Mejoras añadidas en esta revisión

Van en `index.html` y son genéricas: cualquier tarjeta puede usarlas.

1. **Campo `verificacion: {estado, texto}` y su sello.** `estado` sólo distingue `pendiente` de
   `hecha`; `texto` dice qué falta. Se pinta en la cabecera, junto a la versión y la fecha, con la
   tarjeta **cerrada** —lo que está sin comprobar tiene que verse sin abrir nada— y se repite
   entero en el detalle, en la fila «Verificación». Borde de puntos en azul claro para lo
   pendiente; borde continuo y gris para lo comprobado.
2. **Filtro «Sin verificar».** Un chip más en la fila de estados, con su recuento, que deja en
   pantalla sólo las tarjetas con una comprobación pendiente escrita en su propia ficha. Responde
   de un clic a «¿de qué no me puedo fiar todavía?».
3. **Campo `relacionadas: []` y sus accesos.** En el detalle, las tarjetas hermanas se abren con
   un botón: reutiliza `irAHerramienta`, así que si el filtro de estado o de familia la escondía,
   los quita, la despliega, la centra y la resalta. Compras ↔ Ventas ↔ Ingeniería, e Ingeniería ↔
   Radar FACTIUN.
4. **Las tres tarjetas juntas en la familia Cartera**, con el enlace a Notion de Compras, el
   rótulo real del de Ventas y la versión de Compras cuadrada con la pantalla.

Caché del armazón: **v208** (publica el cambio de `index.html`).

## Lo que queda abierto

| # | Qué | Dónde | Por qué no se ha hecho |
|---|-----|-------|------------------------|
| 1 | Pantalla duplicada de Compras/Ventas | `Atlas/herramientas/` | Toca enlaces guardados y dos bancos de Atlas: PR aparte y autorización |
| 3 | Renombrar el trío sin el prefijo «Notion» | `index.html`, `docs/`, `tests/`, Atlas | Arrastra `PICTOS`, `FAMILIAS`, `docId`, bancos y dos acuerdos de `CONTRATO.md` |
| 6 | `notion-ventas-comercial.html` sin `application-version` | Atlas | Fuera de este repositorio |
| — | Lectura de datos de Notion con sesión autorizada en producción | Atlas | Sigue pendiente; es justo lo que declara el sello nuevo |

## Ejecución

| Comprobación | Resultado |
|---|---|
| `md5sum notion-compras.html notion-ventas.html` | PASSED · idénticos, hallazgo 1 |
| Lectura de las páginas Notion enlazadas | PASSED · títulos reales verificados, hallazgo 5 |
| Bancos del panel tras el cambio | ver el registro de la PR |

Lo verificado aquí es el contenido de las tarjetas, sus enlaces y los archivos del repositorio. **No**
se ha abierto una sesión autenticada de Atlas ni se ha comprobado la lectura real de Notion desde
las pantallas; esa comprobación sigue pendiente y es la que declara el sello.
