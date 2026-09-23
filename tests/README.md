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
de **0,80 pp** y la POA absoluta dentro del **2,5 %**. Incluye un mutante: si se invierte el sentido
del eje inclinado, el careo tiene que ponerse rojo. El fixture se regenera con
`python3 tests/gen_careo_estructuras.py --core /ruta/a/SolarGPTfull/solargpt --motivo "…"`.

### El golden lleva MANIFIESTO, y las tolerancias tienen un número detrás (PORTAL-BUG-01)

`careo-estructuras.json` estuvo **cinco días careando dos físicas distintas** sin que nada lo dijera,
y el mecanismo no fue de cálculo sino de procedencia:

| cuándo | qué |
|---|---|
| 2026-08-20 14:46 | el motor JS de la ficha empieza a sombrear el circunsolar (`dirCirc`, `c84753f`) |
| 2026-08-21 08:36 | el **core** hace lo mismo (SolarGPT v1.64.0, `8c6fbc6`) |
| 2026-08-21 17:43 | se regenera el golden (`9a15dc2`) — **nueve horas después** y con la física vieja dentro |

El clon local de SolarGPT desde el que se generó no tenía ese merge, el golden **no registraba de qué
core salía**, y la tolerancia de entonces (2,5 pp) era **más ancha que la deriva** (1,12 pp), así que
el careo siguió en verde. Verificado: el golden anterior reproduce **dígito a dígito** (Δ = 0,000000
en todos los campos) lo que da el core `bb396ad`, el commit inmediatamente anterior a v1.64.0.

Lo que se cierra:

* **manifiesto** en el golden con commit, versión y fecha del core, si el árbol estaba sucio, la
  fecha de generación y el **motivo** — que `--motivo` exige y que el careo comprueba que tenga
  sustancia;
* **sello sha256** sobre los BYTES del fichero (con el propio campo vacío, y por eso funciona igual
  desde Python y desde Node: hashear el objeto parseado sería carear `json.dumps` contra
  `JSON.stringify`, que no escriben los mismos números);
* **pin del core** en el careo: subir el golden a otro core obliga a tocar `CORE_PIN` y el cambio de
  física aparece en el diff en vez de colarse dentro de un JSON de 30 KB;
* **tolerancias medidas, no redondas**: el hueco real JS↔core (Hay-Davies vs Perez, sin IAM) es
  1,365 % en POA y 0,367 pp en Δ%, así que las tolerancias quedan en ×1,8 y ×2,2 de ese hueco, con
  una comprobación que impide que vuelvan a abrirse;
* **centinela** con los números del golden viejo: la tolerancia de hoy los pone en rojo, y su
  mutante comprueba que la de ayer no.

**Límite declarado**: de las seis estructuras, la tolerancia nueva caza `tracker_hsat_nobt`
(deriva 1,120 pp) y **no** `tracker_hsat` (0,499 pp) ni `tracker_tsat` (0,448 pp) — bajar más el
listón dejaría ×1,3 sobre el hueco irreducible del modelo y el careo se pondría rojo por
Hay-Davies-vs-Perez en vez de por un bug. Con una en rojo basta para parar el merge, que es para lo
que existe; queda escrito para que nadie lea «la tolerancia cubre la deriva».

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

`test_viento_reproductor.js` fija lo que pasa **al pasar de la barra**: el reproductor volvía a su primer instante —`(TPOS+pasos) % t.length`— así que con un año de meteo detrás la escena se quedaba dando vueltas al mismo día. Ahora la ventana se corre y la siguiente empieza justo donde acaba ésta. Lo que se comprueba no es que cambie la fecha, es la **continuidad de la costura**, y por eso el mutante corre **24 h fijas** en vez del ancho de la ventana: también cambia de día —un test que solo mirara el rótulo daría verde con los dos— y deja un **hueco de 42 min** sobre una ventana de 23,3 h (medido: la costura salta de 16:48 a 17:30), o sea tiempo que no se enseña. Mata 2 comprobaciones y no 3: se predijo que también tumbaría la de volver atrás, y no lo hace — correr 24 h de ida y 24 h de vuelta devuelve a los mismos límites, ancho equivocado incluido. Esa comprobación vigila la simetría, no la continuidad, y va dicho en el fichero para que no se lea como una segunda guardia del mismo hueco. Cubre además los dos límites declarados: que la serie del año se retenga **muestreada al paso de la ventana** y no al del cálculo (cien megas retenidos para pintar 240 pasos), y que por el camino del motor —informe por HTTP, sin serie— los botones se apaguen y el rótulo lo diga en vez de dar la vuelta callando.

**Un hueco declarado, con su tamaño real.** `test_granizo_espejo.mjs` publica 9 comprobaciones donde está el repo hermano y **8 en CI**, y el piso de `tests/correr.sh` lo recoge. La primera versión de esta nota decía que la que falta es el careo del espejo contra la fuente y que cerrarla exigía un secreto de solo lectura sobre `SolarGPTfull`: **las dos cosas eran falsas**. El careo sí ocurre —con la regla extraída a función pura, y sus cuatro combinaciones se ejercitan siempre— y sin el hermano degrada a auto-consistencia contra el `.sha256` commiteado, cosa que el arnés declara en su propia salida. La que no corre es «el generador del core escribe también el espejo y su hash», que lee un script de `SolarGPTfull`. Y ésa **no necesita secreto**: el generador vive allí, así que la comprobación se cierra en la suite de aquel repo sin clonar nada.

Cubre el **acumulador del reproductor**, que es lo que impide que se encolen fotogramas: 10 segundos reales tienen que avanzar lo mismo a 60 fps que a 6, y con un parón de 1 segundo en medio — si dependiera de cómo viene troceado el tiempo, un fotograma lento dejaría veinte llamadas pendientes que se ejecutan seguidas, que es exactamente el «se queda parado y de golpe salta horas». Su mutante cuenta las llamadas que encolaba el `setInterval` anterior.

Cubre también la **velocidad de arranque** del reproductor: la ventana se muestrea a 240 pasos como mucho, así que el factor que la hace mirable depende del paso de la meteo, y se elige el más lento que la reproduzca entera en menos de 45 s. Su mutante es el default fijo anterior, que con el paso habitual de 4 min dejaba la ventana en 192 s — diez veces más lenta que la versión de antes, que se lee como que no avanza. Y la **cadencia**: que el «×N» sea de verdad tiempo simulado por segundo real, con su mutante —el «×1» de antes iba a ×375— y con el suelo de repintado, por debajo del cual se avanzan varios pasos por tirón en vez de quedarse corto en silencio.

Cubre además la regla del **eje de transmisión** de la escena 3D —qué filas empareja un motor bifila y dónde se corta el eje en el caso pasivo—, que vive en una función pura aparte del dibujo justo para poder ejercitarla sin montar una escena. Con sus dos mutantes: se reproduce el cálculo viejo y el criterio tiene que rechazarlo.

## La puerta: `tests/correr.sh` y el workflow `arneses`

Hasta el 2026-09-09 este repo tenía **veintiún arneses y ninguna puerta**. Verificado por API,
no supuesto: el único workflow era `pages-build-deployment`, el del despliegue del sitio. O sea
que las 1.630 comprobaciones —con sus mutantes y sus careos contra el core— corrían **cuando
alguien se acordaba**, y nada impedía fusionar con cualquiera de ellas en rojo. Es el
decimocuarto corolario del `CLAUDE.md` de SolarGPT, literal y en el otro repo: toda la
disciplina vale lo que valga la puerta.

```bash
python3 -m http.server 8099                # servir el repo (en otra terminal)
bash tests/correr.sh                       # los 45 · 2.588 comprobaciones · ~17 min en el runner
bash tests/correr.sh viento                # solo los que casen con el patrón
```

**El veredicto sale del RECUENTO LEÍDO, no del código de salida**, y aquí eso no es una
costumbre sino el código: un arnés está verde si sale con 0 **y** no imprime ninguna línea
`FAIL` **y** publica al menos su **piso** de comprobaciones. Ese tercer requisito es el que
impide el verde vacío — un arnés que revienta antes de comprobar nada, o cuyo formato de salida
cambia, se pone rojo en vez de colarse. Lo demás son guards de los que ya se ha pagado aquí: se
comprueba que el servidor esté vivo ANTES (un puerto muerto se lee como regresión), la lista de
exenciones lleva su guard de zombis, y un arnés nuevo **sin piso** para la tirada en vez de
quedar vigilado por un umbral que no puede fallar.

**Los pisos están medidos, no copiados.** Al medirlos, seis de los que este mismo fichero daba
por buenos estaban viejos: `test_layout` publica **201** y el texto decía 196, `test_index`
**18** y decía 13, `test_granizo_pestana` **28** y decía 22. Un piso transcrito habría nacido
mintiendo, que es justo lo que un recuento sin mecanismo acaba haciendo.

Cuatro mutantes sobre el propio corredor, **verificados aplicados** antes de juzgarlo:

| mutante | qué pasa |
|---|---|
| un arnés imprime una línea `FAIL` | ROJO — y lo caza aunque el arnés se autoproclame «7/7» |
| un arnés sale con 0 sin comprobar nada | ROJO por el piso (el vacío es error, no PASS) |
| un arnés pierde comprobaciones y sale con 0 | ROJO por el piso |
| un arnés nuevo sin piso | ROJO antes de correr nada |

El primero **sobrevivió en el primer intento y no porque el corredor fallara**: lo había añadido
detrás del `process.exit` del arnés, así que nunca se ejecutaba. Verificar el mutante APLICADO
—imprimir la línea mutada— es lo que lo separó de un test débil.

**La red no hace falta**, y va medido: ningún arnés sin `page.route` nombra un host externo, y
ninguno de los que no interceptan dispara una simulación. Los 21 pasan en un entorno con la
salida bloqueada por el proxy, así que el verde ES la evidencia. *Límite declarado*: eso dice
que ningún arnés PIDE la red, no que un runner con red abierta no pueda dejar que una página
salga por su cuenta.

**Lo que este mecanismo NO hace, y es la mitad que falta:** el workflow `arneses` corre en cada
PR pero **no bloquea** mientras nadie lo marque como check obligatorio en la protección de rama
de `main`. Eso es gobernanza y es del mantenedor. Hasta entonces esto INFORMA, que es mejor que
nada y peor que una puerta — y conviene no confundirlo, porque un check que no bloquea es
decorativo.

La versión de Playwright se ancla **en el workflow** (`playwright@1.62.1`) y no en un manifiesto:
este repo ignora `package.json` a propósito y su `.gitignore` escribe el motivo. Sin anclar, el
veredicto de la puerta dependería de lo que npm publicase esa mañana — no mediría el repo,
mediría el reloj, que es el fallo que ya costó tres PR atascados con el pin del bloque JS.

## El último tramo: el workflow `pages`

Todo lo de arriba prueba **el árbol**. Lo que el usuario abre es otra cosa, y hasta el
2026-09-23 no lo miraba nadie:

```
main verde ──✅──> pages-build-deployment ──✅──> ¿lo sirve Pages?
                                                   └── NADIE MIRA
```

**No es una pega de rigor.** Al fusionar el cronómetro (#498) su despliegue de Pages salió
**`cancelled`**: llevaba seis minutos en cola cuando entró la #499 y el suyo lo adelantó. Aquel
día no se perdió nada —se verificó que `01c4ab7` es ancestro de `15e7b47` y que el fichero es el
mismo byte a byte— pero quedó demostrado que **el despliegue de un commit puede no ocurrir nunca
con todos sus checks en verde**, porque ninguno mira lo publicado.

`tools/test_pages_cronometro.mjs` lo cierra: sondea la URL publicada hasta que sirva **este**
fichero y solo entonces conduce el cronómetro en esa página. El careo es por **sha-256 del
cuerpo servido** y no por número de versión, porque `sim-viento.html` no declara ninguno legible
(lo mismo que ya está anotado sobre su tarjeta).

```bash
node tools/test_pages_cronometro.mjs                              # contra Pages
PAGES_BASE=http://localhost:8111 PAGES_ESPERA_S=0 node tools/…    # contra un servidor propio
```

**Va FUERA del portón, declarado en `FUERA_DEL_PORTON`, y por un motivo concreto:** Pages va por
detrás de `main` unos minutos tras cada merge, así que el arnés **espera** hasta diez minutos.
Cobrarle esa espera a cada PR sería un peaje por un retardo que no es un defecto — el mismo
razonamiento que `test_versiones_app.mjs` ya escribió para el careo de versiones. Lo lanza
`.github/workflows/pages.yml` en `push` a `main` (que es cuando importa si el despliegue llegó)
y dos veces al día (que es cuando ya no mira nadie).

**Cuatro estados y los cuatro distintos**, porque colapsar dos es lo que lo convertiría en
adorno: `al_dia` → se conduce y se juzga · `retardo` → se espera, y al agotar el plazo ROJO ·
`no_publicado` (404) → ROJO y **no se reintenta**, que no mejora esperando · `sin_respuesta` →
ROJO diciendo que es de red y no del contenido.

Cuatro mutantes, los cuatro verificados aplicados y con el recuento predicho antes de medir:
`veredicto` siempre «al día» mata **6**, el sondeo que no reintenta **2**, el 404 reintentado
**1**, y carear por **longitud** en vez de por sha **3**. Ese último es el que justifica que los
cuerpos sintéticos de la batería —`nuevo` y `viejo`— midan **lo mismo**: si midieran distinto,
un careo por longitud pasaría y el mutante sobreviviría.

> *Límite declarado.* El `fetch` contra `imoriana3.github.io` **no se ha ejercitado nunca** en la
> máquina donde se escribió: su proxy de salida lo deniega con `connect_rejected` (403 del
> gateway a CONNECT). Lo que sí se ejercitó, y a propósito: la regla es una función pura con su
> batería, el sondeo corre contra un **transporte de mentira** (los cinco casos, incluido «tarda
> y acaba llegando», que contra el servicio real no se puede provocar), y el navegador se condujo
> contra los bytes que GitHub publica de `main` —traídos por `raw.githubusercontent.com`, que sí
> es alcanzable— servidos desde un directorio limpio: **21 de 21**. Queda sin ejercitar el
> `fetch` a `github.io` y nada más. En CI sí es alcanzable, y la primera tirada lo dirá.

### Los arneses, uno a uno (comprobaciones medidas el 2026-09-09)

> **De dónde sale el 2.588, y cinco números equivocados por el camino.** Este sale de una
> **corrida completa y verde del 2026-09-23** sobre el árbol de esta rama ya con `main` dentro
> (`3dbca1c` + la cadena que no cabe en el paso): `45 arneses verdes · 2588 comprobaciones
> leídas`. Las 11 últimas son de `test_viento_latencia.js` (101→112), al meter el cuarto dato
> de campo —la NCU decide sobre el viento a **3 s**, la ráfaga— y descubrir que con los cuatro
> valores reales la cadena entera es la **identidad exacta** sobre una serie minutal, mientras
> el informe declaraba que sus números «no son comparables».
>
> **Y aquí se cruzaron dos ramas, que es justo lo que esta caja documenta.** La línea de `main`
> decía `2568`, y **2569 por aritmética** tras subir `test_versiones_app.mjs` de 18 a 19 —lo dijo
> ella misma: se corrió ese arnés solo, no la suite—. Ésta no suma nada a nada: se midió la
> suite entera sobre el árbol fusionado, así que se queda el número medido y desaparece el
> sumado. Del tramo de esta rama, 8 son de `test_viento_latencia.js` (93→101), al meter los
> valores del equipo real —1 s de muestreo, 12–15 s de poleo— y el aviso de cuando el paso de
> la simulación es más largo que ellos.
>
> Del tramo anterior, de las 29 que subieron, **22 son mías**
> —`test_viento_latencia.js`, de 71 a 93, al cubrir el régimen SIN latencia (el que dejó pasar
> el «¿y 9 minutazos???») y el botón de pausa— y **7 entraron con el #502**, en
> `test_comparador.js` (312→317) y `test_comparador_3d.js` (283→285). Se separan porque
> atribuirse las siete ajenas sería la misma clase de número inventado que esta caja persigue.
>
> **La quinta vez que esta línea envejeció fue la mía, y sin excusa:** el PR #498 añadió DOS
> arneses —`test_css_variables.js` y `test_viento_latencia.js`, 35 y 71 comprobaciones— y les
> puso su piso en `correr.sh` sin tocar este número, que se quedó en `43 · 2408`. Los pisos son
> mecanismo y esta línea es prosa, así que la prosa es la que se cae: es exactamente el defecto
> que el propio repo acaba de cerrar quitándole a las tarjetas del Panel la copia de la versión.
> Aquí no hay mecanismo que lo impida y por eso vuelve a pasar — queda dicho en vez de tapado.
>
> **Y sale de una tirada LOCAL, no de CI, que es peor procedencia y por eso se dice.** La línea
> anterior venía de un run de CI. Ésta no: se midió en el contenedor donde se escribió el cambio.
> Sigue valiendo la regla de abajo —**manda CI**— y esta línea se corrige con el número del
> primer run de CI que cierre entero en verde.
>
> **La corrida que la precede también enseña algo, y no es del repo.** La tirada anterior en esta
> misma máquina dio `42 arneses verdes` con `test_viento_sitio.js` en rojo por un
> `waitForSelector: Timeout 5000ms`. No era el arnés ni el cambio: había **otro Chromium con
> WebGL corriendo en paralelo** en otro repo, y el control a solas dio 52/52. Un banco de
> navegador midiendo contra un reloj de 5 s mide también con quién comparte la CPU — por eso el
> total sale de una tirada **con nada más en marcha**, y por eso conviene no fiarse de un rojo
> de navegador sin repetirlo solo.
>
> Los tres intentos anteriores, porque el recorrido es el aviso:
>
> 1. **«los 21 · 1.630»**, de la corrida del 2026-09-09. La suite había pasado a 40 arneses sin
>    que esta línea se enterara: casi el doble, y nadie lo vio.
> 2. **«22 · 1.643»** — las 1.630 de entonces más las 13 del arnés nuevo. Aritmética sobre un
>    número viejo. Iba con el aviso de que heredaba cualquier deriva y que mandaba CI.
> 3. **«40 · 2.308»** — las 2.295 que leyó la tirada del run 35115559513 más 13. También
>    aritmética: en esa tirada el arnés nuevo salió **rojo publicando 12**, así que el total
>    verde no era 2.295 + 13. Lo desmintió la primera tirada que corrió entera en verde.
> 4. **«40 · 2.296»**, la línea que esto sustituye: correcta el día que se escribió y **dos
>    arneses vieja** al leerla hoy. No se equivocó nadie al ponerla — envejeció, que es lo que
>    le pasa a un número copiado, y es exactamente el defecto por el que el Panel acaba de dejar
>    de copiar la versión de sus apps en este mismo cambio.
>
> Cuatro veces el mismo fallo **en esta línea**, y es **el que vigilaba `test_versiones_app.mjs`**, aquí en la
> documentación: **un número transcrito —o calculado sobre uno transcrito— envejece en
> silencio**. Éste sale de una tirada completa y verde, que es la única que puede darlo. Si CI
> vuelve a no cuadrar con esta línea, **manda CI**.

```bash
npm install playwright                     # el navegador ya está en /opt/pw-browsers
python3 -m http.server 8099                # servir el repo (en otra terminal)
node tests/test_index.js                   # 28 comprobaciones
node tests/test_pwa.js                     # 21 comprobaciones (PWA)
node tests/test_integridad.js              # 7 comprobaciones, sin navegador
node tests/test_comparador.js              # 317 comprobaciones, careo contra el core (quebrado incluido) y barridos
node tests/test_comparador_3d.js           # 285 comprobaciones, escena 3D, color por producción, equipos, sizing y barridos
node tests/test_sizing.js                  # 115 comprobaciones, careo del dimensionado eléctrico
node tests/test_comparador_sitio.js        # 36 comprobaciones, el buscador de emplazamiento
node tests/test_buscador.js                # 55 comprobaciones, el buscador de implantaciones
node tests/test_careo_pvsyst.js            # 11 comprobaciones, el careo contra PVsyst
node tests/test_viento_ejes.js             # 77 comprobaciones, lienzos, ejes, transmisión, reproductor, sombras y franjas
node tests/test_viento_sitio.js            # 52 comprobaciones, emplazamiento, horas y laboratorio
node tests/test_viento_planta.js           # 35 comprobaciones, la planta en franjas y consigna vs ejecutado
node tests/test_viento_sello.js            # 17 comprobaciones, el informe declara con qué coordenadas se calculó
node tests/test_viento_reproductor.js      # 18 comprobaciones, pasar de la barra sigue en el tiempo
node tests/test_viento_rafaga_medida.js    # 29 comprobaciones, la ráfaga MEDIDA manda, y Open-Meteo la pide sin riesgo
node tests/test_viento_latencia.js         # 112 comprobaciones, la cadena de latencia y el cronómetro (con y SIN cadena)
node tests/test_css_variables.js           # 35 comprobaciones, ninguna ficha usa una variable CSS que no define
node tests/test_granizo_traza.mjs          # 30 comprobaciones, traza exacta JS vs core
node tests/test_granizo_espejo.mjs         # 9 comprobaciones, el guard del espejo
node tests/test_granizo_pestana.js         # 28 comprobaciones, la pestaña de granizo en Chromium
node tests/test_ejecucion_traza.mjs        # 61 comprobaciones, la máquina de ejecución del §10.2
node tests/test_layout.js                  # 201 comprobaciones, careo del generador de layout
node tests/test_layout_ui.js               # 182 comprobaciones, el generador en Chromium
node tests/test_zonas_mixto.js             # 106 comprobaciones, el reparto por zonas
node tests/test_versiones_app.mjs          # 19 comprobaciones, el puntero de la tarjeta a la app (cruza repos)
```

### El puntero de la tarjeta a la app, y por qué el Panel lee Pages y el arnés `main`

**Este arnés hacía otra pregunta, y la pregunta era el síntoma.** Nació para carear dos números:
el escrito a mano en la tarjeta del Panel y el que declara la app (`const VER`). Cazó deriva real
**cinco veces en una semana** —v1.63, v1.64, v1.68, el salto de v1.70 a v1.76, y la v1.77.0— y las cinco
**después** de que ocurriera, no antes. Un número copiado a mano solo puede envejecer: un careo
acorta la ventana, no la cierra.

**Así que el Panel dejó de copiarlo.** Las tarjetas de las dos apps que declaran su versión de
forma legible por máquina ya no llevan `version:`, llevan `verEnApp: true`, y el número lo **lee**
la página del fichero de la app al pintarse. Con eso desaparece la clase entera de defecto: no
hay dos números que puedan discrepar porque solo hay uno.

**El Panel lee Pages; el arnés, `main`. Y es a propósito.** Son preguntas distintas:

| | lee | por qué |
|---|---|---|
| el Panel | Pages | el número describe la app que el usuario va a **abrir al pulsar**, y ésa es la publicada. Si Pages va retrasada, lo honesto es decir la versión retrasada |
| el arnés | `main` | Pages va unos minutos por detrás tras cada merge; exigírselo pondría esto en rojo **justo al publicar**, por un retardo que no es un defecto. El retardo se informa aparte |

Un rojo falso recurrente se acaba ignorando, y un check que se ignora ya no es una puerta.

**Es mismo origen, no hay CORS.** El Panel se sirve en `imoriana3.github.io/proyectos/` y las apps
en `imoriana3.github.io/<repo>/`: mismo esquema, mismo host, mismo puerto — la ruta no entra en el
origen.

**Lo que cuesta, medido.** No hay endpoint barato, así que se baja el fichero entero:
`backtracking.html` 588.485 B y `overcast.html` 299.483 B, **887.968 B entre las dos**, con caché
de 6 h en `localStorage`. Una petición de rango sería más barata, pero `const VER` está en el byte
47.073 de una y en el 145.363 de la otra y ese desplazamiento se mueve con cada edición; y **no
está medido** si Pages sirve `206`, así que no se hace.

**Y si no se puede leer, no se inventa.** Las tarjetas con `release:` guardan a propósito el valor
escrito a mano como respaldo; aquí no, porque el valor escrito a mano es justo lo que se está
quitando. El respaldo es la **última lectura de ese navegador**, marcada como tal, y si no hay
ninguna la tarjeta dice que no la ha podido leer. Una casilla vacía que lo declara es mejor que un
número que quizá miente — y ese tercer estado **antes no podía ocurrir**, porque el número estaba
escrito y siempre había algo que pintar aunque fuera falso.

**Una sola definición de la regla, y es la del Panel.** La expresión que busca `VER` se **extrae**
de `index.html`; no se copia al arnés. Si se copiara, el día que cambie el formato de la
declaración el arnés seguiría verde leyendo con la regla vieja mientras el Panel se queda a
oscuras — que es exactamente el defecto que este fichero existe para impedir, cometido por el
fichero mismo.

**Lo que queda por vigilar, que no es lo mismo y es menos.** Un puntero también se rompe, solo que
de otras maneras: que la app deje de declarar `VER` donde la regla lo busca (y entonces nadie se
entera, porque ya no hay nada que discrepe), que la url deje de servir ese fichero, o que alguien
vuelva a escribir `version:` al lado del puntero «por si acaso». Las tres se comprueban, y las
cuatro comprobaciones nuevas se **vieron en rojo con mutantes** antes de darlas por buenas.

**De dónde sale la app**, por orden: checkout hermano —leyendo su ref **`origin/main`**, no su
árbol de trabajo— y, si no está, `raw.githubusercontent` sobre `main`. Esa distinción no es
teórica: la primera versión leía el fichero del disco y **el propio arnés se cazó a los diez
minutos de existir**, con rojo en local (el hermano en una rama vieja) y verde por red. El modo
de fallo peligroso es el contrario — una rama que ya lleva el bump daría **verde** con `main`
todavía sin él. Sin ninguno de los dos **no se aprueba en silencio**: la regla se ejercita igual
sobre sus combinaciones y la salida declara que la resolución no ocurrió — el patrón de
`test_granizo_espejo.mjs`, por la misma razón. Y **el nombre de la comprobación lleva el modo**:
en degradado dice «NO SE HA RESUELTO (sin fuente)», porque la primera versión publicaba un «OK»
sin haber comparado nada, y leída por encima pasaba por comprobación hecha. Las dos rutas se
ejercitan con `CAREO_SIN_HERMANO=1` y `CAREO_SIN_RED=1`.

**Que el Panel lo pinta, se prueba en navegador.** `test_index.js` monta la app simulada y
comprueba los tres estados: leída, no leída, y última lectura marcada. El control que hace que eso
pruebe algo es que el número de la prueba —`v9.9.9`— **no está escrito en `index.html`**, y el
arnés lo verifica leyendo el fichero: si apareciera copiado, la comprobación pasaría sin que la
lectura funcionase.

**El hueco que queda, con su tamaño.** Solo puede resolverse un puntero a una app que declare su
versión de forma legible por máquina, y hoy eso son **2 de las 20 tarjetas publicadas** —
precisamente los dos simuladores, que es donde el defecto ocurrió las cinco veces. El arnés
**imprime las otras 18 por su nombre** en cada tirada, marcando cuáles llevan el número escrito a
mano, para que la cobertura sea un dato a la vista y no una suposición. Y dos de esas copias son
ya **afirmaciones que nadie puede comprobar**: `sim-viento.html` no contiene la cadena `1.26` en
ninguna parte y `comparador-estructuras.html` no contiene `1.58`, así que sus tarjetas declaran
una versión que la app no dice en ningún sitio. Cerrarlo del todo no es trabajo de aquí: pasa por
que cada app publique su versión en un sitio fijo, y entonces su tarjeta pasa a apuntar como estas
dos.
