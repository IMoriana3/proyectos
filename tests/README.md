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

`test_comparador_sitio.js` cubre el **buscador de emplazamiento del Comparador** en dos capas: las
funciones puras extraídas del HTML (normalizar sin acentos, leer coordenadas pegadas, filtrar la
lista local) y la ficha abierta en Chromium — se teclea, se elige, y las coordenadas del formulario
tienen que cambiar. Y una tercera cosa que aquí importa más que en Viento: elegir emplazamiento
tiene que **mover la escena**; el test pega unas coordenadas del hemisferio sur y mide la NORMAL de
la fija, que debe girarse al norte. También que tocar la latitud a mano borra el nombre del sitio,
porque llamar «Túnez» a otras coordenadas es poner nombre de planta a otro emplazamiento.

`test_viento_sitio.js` cubre además las **horas locales**: que la zona IANA gane al desfase por longitud, que el horario de verano entre (Madrid UTC+1 en enero y UTC+2 en julio, Lima UTC-5 todo el año), que la vuelta hora-de-pared → instante aguante los **días del cambio de hora** —es donde una conversión de una sola pasada se desplaza—, y que sin zona declarada NO se finja la civil: se deriva de la longitud, que es hora SOLAR, y va dicho. Su mutante —ignorar la zona— tira 11 comprobaciones.

`test_viento_planta.js` cubre **la planta real con todas las estrategias a la vez**: la comparativa las
enseña juntas pero en bloques sintéticos iguales, y la planta real enseña la geometría de verdad pero movida
por UNA. Esto es lo de en medio. Comprueba que las franjas son disjuntas y equilibradas, que **cada una mueve
sus trackers con SU estrategia leyendo las matrices de instancia** —no el estado interno— y que en la franja
del pasivo solo el borde está suelto. Cubre además que la tarjeta distinga **la consigna de lo ejecutado**: con el viento a 111 km/h y el reloj parado, las cuatro estrategias motorizadas están en `FULL STOW` y a **θ 0°** —la orden está dada, el hierro no ha llegado— mientras el pasivo ya está a −55° porque no lo mueve un motor, **cae**. Sin decirlo, la pantalla se lee como «solo se abanderan dos». Sus mutantes: quitar la consigna del stepper tira 2 comprobaciones, y bajar el umbral de 2° tira la que exige que el seguidor sin abanderar **no** se marque por su retardo natural de un grado al mediodía.

El layout se **inyecta** con `page.route`: los de verdad viven en el
Pages de `cobertura-zigbee` y sin red no hay planta, así que la única prueba de esta pantalla no puede
depender de que un host de terceros esté arriba. Ojo al **régimen**, que aquí mordió dos veces: con el reloj
parado el seguidor no ha llegado a su ángulo y las seis franjas están a 0°; y a 45 km/h el pasivo no se ha
soltado, así que su ángulo coincide con el de la base y «solo el borde suelto» no se puede observar — hacen
falta 100 km/h **y** estar cerca del mediodía.

`test_granizo_traza.mjs` carea el bloque **GRANIZO-FÍSICA** de `sim-viento.html` contra el core Python:
**traza exacta** —qué transición, en qué muestra, por qué condición—, no números con tolerancia. Una máquina
de estados no necesita 1e-9, necesita la misma secuencia. De dónde salen los casos: si está el checkout
**hermano** de `SolarGPTfull` se leen de ahí (fuente única literal, cero copias); si no, del **espejo**
commiteado en `tests/goldens/`, que lleva el SHA-256 de la fuente. Y **cuando los dos están, se carean los
hashes**: un espejo viejo lo caza cualquiera que tenga los dos repos. Los tres ficheros —golden, espejo y
hash— los escribe **un solo comando** desde el core (`python scripts/gen_goldens_hailstow.py --write`), así
que una divergencia solo puede significar vejez, nunca ambigüedad. El arnés **declara siempre en qué modo
corrió**, porque aquí no hay CI que lo imponga.

`test_granizo_espejo.mjs` es el guard de esa regla y vive **fuera** del arnés a propósito: si viviera dentro
compartiría su condición de salto y se saltaría a sí mismo. La regla está extraída a función pura para poder
ejercitar las cuatro combinaciones sin tocar el disco — el caso que importa (hay hermano y el espejo está
viejo) no es reproducible en una máquina donde está al día.

`test_granizo_pestana.js` abre la pestaña de granizo en Chromium y comprueba lo que ninguno de los dos
arneses ve: que el **diagrama tiene una arista por transición de la tabla que decide**, que los **tres
contadores** de salida corren al mover el instante, que editar un umbral cambia el resultado sobre la misma
serie, y que el banner **NO VALIDADO está en la UI** y no solo en el JSON.

`test_viento_sitio.js` cubre el **buscador de emplazamiento** en dos capas: las funciones puras extraídas del HTML (normalizar sin acentos, leer coordenadas pegadas, filtrar la lista local) y la ficha ABIERTA en Chromium — se teclea, se elige, y las coordenadas del formulario tienen que cambiar. Un buscador que filtra pero no rellena está tan roto como uno que no filtra, y ese es su mutante. La búsqueda REMOTA (geocodificador de Open-Meteo) no se exige, porque el banco tiene que correr sin red; lo que sí se exige es que su ausencia se declare.

Comprueban además lo de siempre: que las tarjetas se pintan, que el detalle abre con su
historial, que el botón *Paquete* apunta a `releases/latest` y que el panel de
documentación carga el markdown de `docs/`.

`test_layout.js` carea la ficha **Generador de layout** contra el core Python sin navegador: extrae el
bloque `MOTOR DE LAYOUT` del HTML REAL y lo corre sobre las mismas quince parcelas que corrió
`solargpt_core.layout_v2.compute_layout_v2` (`careo-layout.json`) — tres de ellas bifila con
multi-talla sobre borde girado y en L, que es donde el emparejado A/B se rompe, y dos **fincas REALES**
que entran por `tests/parcelas/*.geojson` (la cóncava de nueve vértices y la de Larraga, la del
«deja mil huecos donde entran trackers» — sobre ella se mide que sus mesas salen CLAVADAS al core
(el barrido del origen X/Y del core, portado, con su mutante), que el ancla global AVISA del hueco
que deja, que sin «alinear a rejilla» cada fila ancla en su linde y gana ≥30 % con el Δx=0 bifila
intacto, y que la mejora respeta la unidad atómica) (cualquier GeoJSON exportado desde la propia ficha
vale: el generador del fixture lo convierte en caso de careo). Exige el mismo número de **filas**
(la geometría del campo en un número), las mesas y los kWp dentro del **2,5 %**, el **área útil**
dentro del 0,5 % —el setback se resuelve aquí como erosión exacta, sin Shapely— y las fórmulas
cerradas (largo de mesa, apertura, largo de fila, GCR de tracker) **exactas**. La UTM propia se mide
contra pyproj: por debajo del milímetro. Medido hoy: tres casos clavados, las filas idénticas en 14
de 15 y el peor dentro de la tolerancia global a 1,89 %; el fijo multi-talla sale a 2,59 % y lleva
tolerancia declarada (3 %) con el mecanismo medido escrito en el generador — el core pierde un slot
de mesa en media parcela por su rejilla global × convergencia, así que en fijo el port queda POR
ENCIMA del canónico. Sobre los datos se miden además dos invariantes que fueron quejas
repetidas en planta: en todos los bifila, cero pares descuadrados y **Δx = 0 m** entre sub-filas; en
los multi-talla, **nunca dos trackers de la misma talla seguidos cuando existe la doble** (la
consolidación). Con tres mutantes: si el setback deja de morder, si la banda de erosión se escribe
sin el término del vértice —el fallo que hacía que el setback no recortara nada— o si el GCR se
calcula sobre otro pitch, el careo se pone rojo. El fixture se regenera con
`python3 tests/gen_careo_layout.py --core /ruta/a/SolarGPTfull/solargpt`.

`test_layout_ui.js` mide lo OTRO del generador: que esté cableado. Un motor perfecto detrás de un
botón que no llama a nadie se lee como «no funciona». Comprueba que genera y **pinta** (píxeles de
mesa en el lienzo, no solo números), que los tres caminos de parcela —cotas, GeoJSON y dibujo a
mano— acaban en un layout, que el reparto multi-talla sale en pantalla, que en montaje fijo cambia
el rótulo y se inhabilita bifila, y que las salidas se habilitan solo cuando hay algo que exportar.
Y las piezas del cierre: los **cuatro cuadros del MDT** pintados de verdad y el MDT que **descarta
sin volver a pulsar Generar**; el **3D por modo** (bifila un nodo por par A/B con
`filaZ = pitch/2`, monofila uno por fila, fija uno por estructura); los **módulos dibujados** con
zoom y las mesas en **un solo color**; la **banda del área útil** visible también con el grid
girado (se pintaba como cajas de pantalla y con azimut girado salía una neblina; el mutante —quitar
el fill— se comprobó a mano al escribir el check: 0 px y rojo); el **roundtrip de sesión** a una pestaña limpia (misma cuenta de
mesas y sin monofilas de contrabando), el autoguardado tras recargar —que cazó un bug real: los
gestos de ratón no guardaban— y el **gate layout↔sizing** en sus tres estados (PASS desde
`factiun_sizing`, FAIL con strings desalineados, WARN sin datos).
Cubre también el **buscador de emplazamiento** —cartera y presets sin red, coordenadas pegadas, y que sin red para el geocodificador se DIGA en vez de devolver una lista vacía— y sus funciones puras sobre la copia real que vive en esa ficha, no sobre la de `sim-viento.html`. Y la **ortofoto**: teselas simuladas (el banco no puede depender del servidor de Esri ni de que haya red), que el lienzo no quede TEÑIDO por ellas —si lo quedara, `getImageData` lanza y se caen todas las comprobaciones de pintado—, y que la rueda, el arrastre y «Encajar» muevan la vista. De aquí salieron tres arreglos: el doble clic metía el último vértice tres veces; cada tesela disparaba un repintado entero del campo; el encuadre se recalculaba con el primer vértice sobre una caja de tamaño cero, que es lo que hacía salir la parcela dibujada a «0,00 ha»; y «Encajar» seguía metiendo el BOCETO anterior, así que al pasar de «dibujada» a «por cotas» la vista se abría para incluir los dos —a cientos de kilómetros uno de otro— y lo que dibujaras después caía a decenas de km de la parcela. Cubre también las **exclusiones** dibujadas, exigiendo no que se pinten sino que el motor las OBEDEZCA: una exclusión que se ve pero no quita mesas es peor que no tenerla.

`test_pwa.js` cubre la **app instalable**: manifest válido con iconos que existen de verdad
(un icono 404 la deja no-instalable sin avisar), service worker activo con su scope, armazón
precacheado, botón *Instalar app*, y que **sin red** el panel sigue abriendo y pintando. Incluye la
regresión que salió al escribirlo: el SW **no** debe recargar la página la primera vez que toma el
control.

`test_viento_ejes.js` cubre las funciones puras de dibujo de **Viento & Abanderamiento**, extraídas del HTML real: que un lienzo todavía en `display:none` se DECLARE sin maquetar y no acumule el dpr en llamadas sucesivas —el fallo que hacía salir la comparativa estirada 2,16× en horizontal—, y que ningún eje repita etiquetas. Los rótulos salían de partir el máximo en cuatro y con datos pequeños eso repite: la columna de horas decía «2, 2, 1, 1, 0» y la de POA perdida «0.01, 0.01, 0.01, 0.00, 0.00». Cubre la **caja de sombras**: se reproduce lo que hace three.js y se barren 612 direcciones de sol exigiendo que ninguna deje geometría fuera. Su mutante es la caja anterior, dimensionada con el ancho y el largo del MUNDO cuando sus ejes son los de la LUZ: dejaba fuera el 78 % de las direcciones, y lo que queda fuera ni proyecta ni recibe sombra — unos bloques salían sombreados y los de al lado no, por el encuadre y no por la física.

Cubre también que **ninguna velocidad ofrecida deje la escena congelada**: la ventana viene muestreada, así que las opciones se construyen con ella delante y ninguna baja de un paso por segundo.

Cubre el **acumulador del reproductor**, que es lo que impide que se encolen fotogramas: 10 segundos reales tienen que avanzar lo mismo a 60 fps que a 6, y con un parón de 1 segundo en medio — si dependiera de cómo viene troceado el tiempo, un fotograma lento dejaría veinte llamadas pendientes que se ejecutan seguidas, que es exactamente el «se queda parado y de golpe salta horas». Su mutante cuenta las llamadas que encolaba el `setInterval` anterior.

Cubre también la **velocidad de arranque** del reproductor: la ventana se muestrea a 240 pasos como mucho, así que el factor que la hace mirable depende del paso de la meteo, y se elige el más lento que la reproduzca entera en menos de 45 s. Su mutante es el default fijo anterior, que con el paso habitual de 4 min dejaba la ventana en 192 s — diez veces más lenta que la versión de antes, que se lee como que no avanza. Y la **cadencia**: que el «×N» sea de verdad tiempo simulado por segundo real, con su mutante —el «×1» de antes iba a ×375— y con el suelo de repintado, por debajo del cual se avanzan varios pasos por tirón en vez de quedarse corto en silencio.

Cubre además la regla del **eje de transmisión** de la escena 3D —qué filas empareja un motor bifila y dónde se corta el eje en el caso pasivo—, que vive en una función pura aparte del dibujo justo para poder ejercitarla sin montar una escena. Con sus dos mutantes: se reproduce el cálculo viejo y el criterio tiene que rechazarlo.

```bash
npm install playwright                     # el navegador ya está en /opt/pw-browsers
python3 -m http.server 8099                # servir el repo (en otra terminal)
node tests/test_index.js                   # 13 comprobaciones
node tests/test_pwa.js                     # 21 comprobaciones (PWA)
node tests/test_integridad.js              # 6 comprobaciones, sin navegador
node tests/test_comparador.js              # 143 comprobaciones, careo contra el core y barridos
node tests/test_comparador_3d.js           # 145 comprobaciones, escena 3D, equipos, sizing y barridos
node tests/test_sizing.js                  # 115 comprobaciones, careo del dimensionado eléctrico
node tests/test_comparador_sitio.js        # 36 comprobaciones, el buscador de emplazamiento
node tests/test_viento_ejes.js             # 77 comprobaciones, lienzos, ejes, transmisión, reproductor, sombras y franjas
node tests/test_viento_sitio.js            # 51 comprobaciones, emplazamiento, horas y laboratorio
node tests/test_viento_planta.js           # 20 comprobaciones, la planta en franjas y consigna vs ejecutado
node tests/test_viento_sello.js     # el informe declara con qué coordenadas se calculó
node tests/test_granizo_traza.mjs          # 30 comprobaciones, traza exacta JS vs core
node tests/test_granizo_espejo.mjs         # 9 comprobaciones, el guard del espejo
node tests/test_granizo_pestana.js         # 22 comprobaciones, la pestaña de granizo en Chromium
node tests/test_layout.js                  # 196 comprobaciones, careo del generador de layout
node tests/test_layout_ui.js               # 182 comprobaciones, el generador en Chromium
```
