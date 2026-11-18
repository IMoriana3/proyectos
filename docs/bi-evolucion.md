# BI · Evolución

La tarjeta **BI · Evolución**, en la familia **Cartera**, abre en Atlas la evolución de la cartera
comercial a partir de **cortes diarios**: una foto de las bases de Notion guardada cada día.

[Abrir la evolución en Atlas](https://maps-9rd.pages.dev/herramientas/bi-evolucion.html)

## Para qué sirve

Notion solo guarda cómo están las cosas hoy: cuando una oportunidad cambia de etapa, el valor
anterior se pierde. Con un corte diario se puede contestar lo que antes no:

- **¿Qué cambió desde el lunes?** Permisos que dejan de estar vigentes, oportunidades que avanzan.
- **¿Cuánto tarda cada etapa?** Y en cuál se atascan las oportunidades.
- **Porcentajes de verdad.** «El 49 % de los proyectos tiene permiso vigente» necesita el total;
  las pantallas de Ventas cuentan lo que han cargado, de 25 en 25.

## Cómo leerla

- Arriba, el último corte en cuatro cifras, con el cambio respecto al corte anterior. Si una base
  no se leyó entera ese día, lo dice («parcial»).
- Un día sin base aparece como un **hueco** en la gráfica, nunca como 0 %. El eje va siempre de 0 a
  100 %, para que medio punto no parezca un precipicio.
- En «Etapas», las estancias que siguen abiertas se cuentan aparte: si entraran en la mediana, la
  acortarían.

## Estado

Las tablas existen en Supabase. Falta conectar Atlas con el almacén (`BI_SUPABASE_URL` y
`BI_SUPABASE_KEY` en Cloudflare) y que la tarea diaria tome el primer corte. Mientras tanto, la
pantalla dice qué falta en vez de enseñar ceros.
