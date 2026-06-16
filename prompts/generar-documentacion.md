# Plantilla — Generar la documentación de una app para el Panel de Proyectos

Prompt reutilizable para producir, en cada chat, el **README completo** de la app y el **bloque listo para pegar** en `panel-proyectos.html` (entrada de `PROJECTS` + bloque `doc-src`), con la misma estructura y formato que el resto del panel.

## Cómo usarlo

1. Abre el chat de Claude donde desarrollaste (o tienes el contexto de) la app.
2. Copia el bloque de abajo y pégalo **al final** de esa conversación.
3. *(Opcional)* Rellena "Datos del proyecto". Lo que dejes en blanco, Claude lo deduce del chat o lo marca como pendiente.
4. Claude te devuelve **dos cosas**: el `README.md` descargable y el bloque de integración para pegar en el panel.

---

## El prompt

~~~text
A partir de TODO lo tratado en esta conversación sobre la aplicación, genera su
documentación completa y déjala lista para mi Panel de Proyectos.

──────────────────────────────────────────────
DATOS DEL PROYECTO  (rellena lo que sepas; lo que dejes en blanco, dedúcelo del
chat o márcalo como pendiente; no te lo inventes)
  · Nombre:
  · Estado:        (Producción / En desarrollo / Demo-POC / Pausado / Deprecado)
  · Repo (URL):
  · Deploy (URL):
  · Versión:
  · Fichero(s) principal(es):
──────────────────────────────────────────────

Entrégame DOS cosas:

═══ 1) README.md  (archivo descargable, en español, técnico y preciso) ═══

Estructura (incluye SOLO las secciones que apliquen a esta app; no fuerces las
que no tengan sentido):

  1.  Título + una línea: qué es y para quién.
  2.  Qué hace / objetivo.
  3.  Cómo funciona (arquitectura). Si ayuda, añade un diagrama ASCII.
  4.  Contenido del paquete (tabla: archivo → qué es), si son varios ficheros.
  5.  Requisitos.
  6.  Instalación / configuración: dónde se toca cada cosa (rutas, variables,
      puertos, credenciales, proyecto Firebase, IPs…).
  7.  Puesta en marcha (paso a paso).
  8.  Uso: qué hace cada parte, controles, opciones, atajos.
  9.  Cómo interpretar los resultados (si aplica).
  10. Formato de los datos / CSV / API / esquema (si aplica).
  11. Solución de problemas (síntoma → causa → arreglo).
  12. Notas técnicas.
  13. Limitaciones y posibles mejoras.

Reglas del README:
  · Sintetiza lo que YA hemos decidido en este chat. No me preguntes lo que se
    puede deducir de la conversación.
  · Lo que falte de verdad, márcalo con  > TODO: ...  bien visible.
  · Markdown estándar: encabezados #/##/###, tablas, listas, bloques de código,
    citas con >. El primer encabezado es # (título) y el subtítulo va con ###.
  · NO incluyas nunca la cadena literal  </script>  en el texto (rompería el
    visor del panel). Si necesitas referirte a una etiqueta, descríbela.
  · Directo y conciso, sin relleno ni introducciones de relleno.

═══ 2) Bloque de integración para el panel  (en un bloque de código aparte) ═══

Dos partes, en este orden:

  a) Entrada para el array PROJECTS:

     {
       name: "…",
       status: "live | build | demo | idle | dead",
       objetivo: "una frase (la misma idea que la primera línea del README)",
       stack: "Tecnología1 · Tecnología2 · Tecnología3",
       url: "…",                 // "" si no hay deploy
       repo: "…",                // "" si no aplica
       updated: "AAAA-MM-DD",    // la fecha de hoy
       version: "…",             // "" si no aplica
       docId: "slug-en-kebab-case",
       download: "",             // "" salvo que haya un ZIP/release enlazable
       uso: [
         "3–5 bullets TL;DR. El detalle ya está en el README."
       ],
       pendientes: [
         { done:false, text:"…" }
       ],
       historial: [
         { date:"AAAA-MM-DD", ver:"", note:"Documentación generada." }
       ]
     }

  b) Bloque de documentación, con EL MISMO README de arriba dentro:

     <script type="text/plain" class="doc-src" data-id="EL-MISMO-docId-de-arriba">
     …(todo el README en Markdown)…
     </script>

Convenciones (respétalas para mantener la coherencia del panel):
  · El docId del PROJECTS y el data-id del bloque doc-src deben COINCIDIR.
  · status:  live=Producción · build=En desarrollo · demo=Demo/POC ·
             idle=Pausado · dead=Deprecado.
  · Fechas en formato AAAA-MM-DD. Textos en español.

Al final, si te falta algún dato ESENCIAL para el panel (estado, repo, url,
versión), pon un valor por defecto razonable y lístame en 2–3 líneas qué debo
confirmar. Nada más.
~~~

---

## Notas

- El `docId` es el identificador que enlaza la tarjeta con su documentación: ponlo en kebab-case (p. ej. `gemelo-digital-tcu`) y úsalo igual en el `data-id` del bloque `doc-src`.
- Pega la entrada de `PROJECTS` dentro del array (al inicio del archivo) y el bloque `doc-src` junto a los demás, antes del `<script>` del motor Markdown.
- Si el chat de una app es muy largo, puedes anteponer una frase: *"Céntrate en la versión final / el último estado de la app"* para que el README no recoja iteraciones ya descartadas.
