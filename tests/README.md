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

`test_sizing.js` carea el **dimensionado eléctrico** contra el core, y aquí la exigencia es EXACTA
y no «se parece»: no hay dos modelos de transposición discutiendo, hay una cuenta de enteros, y un
string de más o de menos por MPPT es un unifilar equivocado. Extrae el mismo bloque `FÍSICA PURA` y
lo contrasta con una corrida congelada de `solargpt_core.string_sizing` y `plant_config`
(`careo-sizing.json`), caso a caso — con seis casos elegidos para que mande cada vez uno distinto:
la potencia, la corriente de operación del MPPT, la de cortocircuito, el tope del datasheet y el
`Idcmax` del catálogo. Se exige también la etiqueta de **quién limita** y la de **confianza**
(`datasheet` vs `cec_derived`), que es lo que de verdad se lee en pantalla. Incluye el redondeo de
Python (`int(round())` va al PAR en el .5 exacto y `Math.round` no), la ventana de tensión con
cifras calculadas a mano, y un guard de que el factor NEC 690.8 **no** recorta strings. El fixture
se regenera con `python3 tests/gen_careo_sizing.py --core /ruta/a/SolarGPTfull/solargpt`, y el
catálogo CEC con `python3 tests/gen_catalogo_cec.py --core /ruta/a/SolarGPTfull/solargpt`.

`test_viento_sitio.js` cubre además las **horas locales**: que la zona IANA gane al desfase por longitud, que el horario de verano entre (Madrid UTC+1 en enero y UTC+2 en julio, Lima UTC-5 todo el año), que la vuelta hora-de-pared → instante aguante los **días del cambio de hora** —es donde una conversión de una sola pasada se desplaza—, y que sin zona declarada NO se finja la civil: se deriva de la longitud, que es hora SOLAR, y va dicho. Su mutante —ignorar la zona— tira 11 comprobaciones.

`test_viento_sitio.js` cubre el **buscador de emplazamiento** en dos capas: las funciones puras extraídas del HTML (normalizar sin acentos, leer coordenadas pegadas, filtrar la lista local) y la ficha ABIERTA en Chromium — se teclea, se elige, y las coordenadas del formulario tienen que cambiar. Un buscador que filtra pero no rellena está tan roto como uno que no filtra, y ese es su mutante. La búsqueda REMOTA (geocodificador de Open-Meteo) no se exige, porque el banco tiene que correr sin red; lo que sí se exige es que su ausencia se declare.

Comprueban además lo de siempre: que las tarjetas se pintan, que el detalle abre con su
historial, que el botón *Paquete* apunta a `releases/latest` y que el panel de
documentación carga el markdown de `docs/`.

`test_pwa.js` cubre la **app instalable**: manifest válido con iconos que existen de verdad
(un icono 404 la deja no-instalable sin avisar), service worker activo con su scope, armazón
precacheado, botón *Instalar app*, y que **sin red** el panel sigue abriendo y pintando. Incluye la
regresión que salió al escribirlo: el SW **no** debe recargar la página la primera vez que toma el
control.

`test_viento_ejes.js` cubre las funciones puras de dibujo de **Viento & Abanderamiento**, extraídas del HTML real: que un lienzo todavía en `display:none` se DECLARE sin maquetar y no acumule el dpr en llamadas sucesivas —el fallo que hacía salir la comparativa estirada 2,16× en horizontal—, y que ningún eje repita etiquetas. Los rótulos salían de partir el máximo en cuatro y con datos pequeños eso repite: la columna de horas decía «2, 2, 1, 1, 0» y la de POA perdida «0.01, 0.01, 0.01, 0.00, 0.00». Cubre el **acumulador del reproductor**, que es lo que impide que se encolen fotogramas: 10 segundos reales tienen que avanzar lo mismo a 60 fps que a 6, y con un parón de 1 segundo en medio — si dependiera de cómo viene troceado el tiempo, un fotograma lento dejaría veinte llamadas pendientes que se ejecutan seguidas, que es exactamente el «se queda parado y de golpe salta horas». Su mutante cuenta las llamadas que encolaba el `setInterval` anterior.

Cubre también la **velocidad de arranque** del reproductor: la ventana se muestrea a 240 pasos como mucho, así que el factor que la hace mirable depende del paso de la meteo, y se elige el más lento que la reproduzca entera en menos de 45 s. Su mutante es el default fijo anterior, que con el paso habitual de 4 min dejaba la ventana en 192 s — diez veces más lenta que la versión de antes, que se lee como que no avanza. Y la **cadencia**: que el «×N» sea de verdad tiempo simulado por segundo real, con su mutante —el «×1» de antes iba a ×375— y con el suelo de repintado, por debajo del cual se avanzan varios pasos por tirón en vez de quedarse corto en silencio.

Cubre además la regla del **eje de transmisión** de la escena 3D —qué filas empareja un motor bifila y dónde se corta el eje en el caso pasivo—, que vive en una función pura aparte del dibujo justo para poder ejercitarla sin montar una escena. Con sus dos mutantes: se reproduce el cálculo viejo y el criterio tiene que rechazarlo.

```bash
npm install playwright                     # el navegador ya está en /opt/pw-browsers
python3 -m http.server 8099                # servir el repo (en otra terminal)
node tests/test_index.js                   # 13 comprobaciones
node tests/test_pwa.js                     # 21 comprobaciones (PWA)
node tests/test_integridad.js              # 6 comprobaciones, sin navegador
node tests/test_comparador.js              # 53 comprobaciones, careo contra el core
node tests/test_comparador_3d.js           # 68 comprobaciones, escena 3D, equipos y sizing
node tests/test_sizing.js                  # 104 comprobaciones, careo del dimensionado eléctrico
node tests/test_viento_ejes.js             # 60 comprobaciones, lienzos, ejes, transmisión y reproductor
node tests/test_viento_sitio.js            # 47 comprobaciones, emplazamiento y horas locales
```
