# Pruebas del panel

Pruebas de integración de `index.html` en un navegador real (Chromium vía Playwright),
con la API de releases de GitHub simulada.

Lo que comprueban de verdad: que la **versión y la fecha** de cada tarjeta salen de la
**última release** y no del texto escrito a mano — que es justo lo que se quedaba viejo
(la ficha de la toolbox decía `2.3 / 5-ago` con el ZIP ya por la 11.4) — y que si la API
falla (sin internet, 403 por límite, repo sin releases) la tarjeta **mantiene** el valor
escrito a mano en vez de quedarse en blanco.

`test_comparador.js` carea la ficha **Comparador de estructuras** contra el core Python sin
navegador: extrae el bloque `FÍSICA PURA` del HTML REAL —no una copia, que se quedaría careando una
versión vieja— lo corre sobre la misma meteo que corrió `solargpt_core.structure_compare`
(`careo-estructuras.json`) y exige que el ORDEN entre estructuras sea idéntico, los Δ% queden dentro
de 2,5 pp y la POA absoluta dentro del 8 %. Incluye un mutante: si se invierte el sentido del eje
inclinado, el careo tiene que ponerse rojo. El fixture se regenera con
`python3 tests/gen_careo_estructuras.py --core /ruta/a/SolarGPTfull/solargpt`.

`test_comparador_3d.js` mide la ORIENTACIÓN real de cada panel en la escena (la normal, sacada de
la matriz del grupo que bascula) y la contrasta con dónde está el sol: un 3D bonito que apunte mal
es peor que no tenerlo, porque se lee como una prueba visual de un número que contradice. Cazó el
signo de basculación cambiado —por la mañana los seguidores miraban al oeste, 106° de AOI— que a
mediodía no se nota porque θ≈0; por eso mide a las 8 y a las 17. Comprueba también que el sol
proyecta sombra de verdad (una luz direccional trae un frustum de ±5 m) y que nada queda fuera de
cuadro con dos, cuatro o seis bloques.

Comprueban además lo de siempre: que las tarjetas se pintan, que el detalle abre con su
historial, que el botón *Paquete* apunta a `releases/latest` y que el panel de
documentación carga el markdown de `docs/`.

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
node tests/test_integridad.js              # 6 comprobaciones, sin navegador
node tests/test_comparador.js              # 27 comprobaciones, careo contra el core
node tests/test_comparador_3d.js           # 31 comprobaciones, la escena 3D en Chromium
```
