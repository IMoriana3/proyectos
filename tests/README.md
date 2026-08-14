# Pruebas del panel

Pruebas de integración de `index.html` en un navegador real (Chromium vía Playwright),
con la API de releases de GitHub simulada.

Lo que comprueban de verdad: que la **versión y la fecha** de cada tarjeta salen de la
**última release** y no del texto escrito a mano — que es justo lo que se quedaba viejo
(la ficha de la toolbox decía `2.3 / 5-ago` con el ZIP ya por la 11.4) — y que si la API
falla (sin internet, 403 por límite, repo sin releases) la tarjeta **mantiene** el valor
escrito a mano en vez de quedarse en blanco.

Comprueban además lo de siempre: que las tarjetas se pintan, que el detalle abre con su
historial, que el botón *Paquete* apunta a `releases/latest` y que el panel de
documentación carga el markdown de `docs/`.

`test_ia.js` cubre la **Consola de IA** (`ia.html`), que es un espejo JS de `solargpt_ml`:
ejecuta su núcleo aislado —sin navegador ni DOM— y exige que encuentre las cuatro averías
inyectadas del fixture **y ninguna más**, más las dos regresiones de falso positivo que costó
cazar (la z robusta fabricando sigmas con vecinos idénticos, y el CUSUM disparando «cambió y
no ha vuelto» sobre ruido blanco). Si una constante del espejo deriva del Python, el
diagnóstico deja de ser el mismo según se mire desde la consola o desde el CLI, y eso un diff
no lo ve.

`test_pwa.js` cubre la **app instalable**: manifest válido con iconos que existen de verdad
(un icono 404 la deja no-instalable sin avisar), service worker activo con su scope, armazón
precacheado, botón *Instalar app*, y que **sin red** el panel sigue abriendo y pintando. Incluye la
regresión que salió al escribirlo: el SW **no** debe recargar la página la primera vez que toma el
control.

```bash
npm install playwright                     # el navegador ya está en /opt/pw-browsers
python3 -m http.server 8099                # servir el repo (en otra terminal)
node tests/test_index.js                   # 13 comprobaciones
node tests/test_pwa.js                     # 21 comprobaciones (PWA)
node tests/test_ia.js                      # 23 comprobaciones (consola de IA)
node tests/test_integridad.js              # 6 comprobaciones, sin navegador
```
