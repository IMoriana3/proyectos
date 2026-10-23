# Atlas FACTIUN · Plantas FV

**Acceso existente:** [Atlas protegido por Cloudflare Access](https://maps-9rd.pages.dev).  
**Fuente de verdad:** [Notion · 14 · Plantas y proyectos FV](https://app.notion.com/p/537b7f89eba14a81acae2f5969d5b64e).  
**Estado a 23/10/2026:** V14 es la última versión que tiene el usuario. V14.2 está preparada como paquete y ha pasado pruebas locales, pero **no se ha desplegado ni validado contra Cloudflare y Notion reales**. La versión exacta servida actualmente en `maps-9rd.pages.dev` no se ha confirmado en una sesión autenticada. La tarjeta se clasifica **En desarrollo**, sin presentar la candidata como versión operativa.

## Qué es

Visor mundial de plantas solares **sobre suelo**, con globo, satélite/ortofoto y fichas de ingeniería. Debe usar Notion como catálogo canónico, sin exigir GEM phase ID. Una coordenada visual seleccionada sobre la ortofoto no equivale a un levantamiento topográfico.

## Flujo de catálogo y edición exigido

1. **Catálogo completo:** incluir todas las fichas de Notion con o sin GEM ID. Sólo se dibujan en el mapa las que tienen coordenadas de la instalación; las demás se listan como **Pendientes de ubicar**. La paginación de Notion usa cursores opacos; cualquier lectura parcial se declara y bloquea la deduplicación de altas.
2. **Ubicar una ficha existente:** buscarla en pendientes, pulsar **Ubicar**, navegar sobre la ortofoto al recinto real y guardar latitud, longitud y procedencia **sobre su page ID exacto de Notion**. No copiar el centro del pueblo, una SET ni la instalación más cercana.
3. **Nueva planta detectada en el mapa:** al escribir su nombre, buscar primero entre fichas **sin coordenadas** y después comprobar posibles duplicados en el resto del catálogo. Si existe, vincular esa ficha al punto seleccionado; si no existe, crear una ficha nueva en Notion y releerla para confirmar el alta. No inventar GEM ID, potencia ni fabricante.
4. **Identidad de la planta:** mostrar **Emplazamiento**, **Ciudad / municipio**, **Provincia**, **Región / estado**, **País**, coordenadas y fuente. En Notion ya existe el campo `Emplazamiento`. No confundir plantas individuales con lotes agregados ni fases vecinas.
5. **Ir al emplazamiento:** centrar la vista en las coordenadas o geometría **del objeto seleccionado**; nunca buscar la planta más cercana como sustituto. Si no existen coordenadas, avisar y abrir la asignación manual.
6. **Cambio de planta:** cerrar y reiniciar el editor anterior; sus acciones, coordenadas y resultados asíncronos no deben contaminar la nueva selección.
7. **Estructuras:** Fija, Fija dos aguas, Marquesina, Seguidor y Mixta. El esquema de Notion ya recoge las cinco. Los campos de fabricante/controlador pueden quedar vacíos cuando no apliquen.

## Versiones y evidencia

| Entrega | Estado | Comprobación |
| --- | --- | --- |
| V9 | Referencia histórica recogida en la primera versión de esta tarjeta | Uso protegido por Cloudflare documentado previamente; la versión actualmente desplegada debe verificarse |
| V14 | Última versión en poder del usuario | ZIP original disponible; no afirmar que esté desplegada |
| V14.2 | Candidata derivada de V14 | 12/12 pruebas del servicio y prueba funcional con Notion simulado; sin ensayo autorizado con Notion real y sin despliegue certificado |

**No fusionar versión de Atlas con versión del Panel**: esta tarjeta vive en el repositorio `proyectos`; el Atlas se despliega por separado en Cloudflare. Añadir una tarjeta al Panel no publica ni actualiza Atlas.

## Publicación segura

- El Panel sólo enlaza al Atlas existente, no replica su frontend ni publica un ZIP con la base de plantas en un repositorio público.
- Mantener Cloudflare Access tanto en el dominio principal como en previews; las credenciales de Notion pertenecen a secretos del Worker, jamás a HTML/JS público.
- Tras desplegar V14.2, comprobar: recuento completo de Notion, alta y relectura, vínculo de una ficha sin coordenadas, cambio de editor, coordenadas exactas, no duplicación y conservación de todas las capas de V14.
- Conciliar las notas históricas con las fichas existentes: Quemadas, Giuncaggio, Assú, Fuente Álamo, Borja, Fayón, Puerto Libertad, Fuentes de Almadrones y el **lote BOS de Fuentes de la Alcarria**, que no es automáticamente una planta individual nueva.
- El acceso y la validación siguen registrados en [Atlas · entrega V14.2 en Notion](https://app.notion.com/p/4026931d643681169a4eda751319d603).

## Situación de la tarjeta del Panel

La tarjeta fue preparada en la [PR #620 de `IMoriana3/proyectos`](https://github.com/IMoriana3/proyectos/pull/620). Hasta que la PR se fusione y Cloudflare publique `main`, **no aparece en el Panel de producción**. Las previews de la PR permiten comprobar la tarjeta sin fusionar.
