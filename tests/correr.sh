#!/usr/bin/env bash
#
# EL CORREDOR DE LOS ARNESES — y el sitio donde «verde» deja de ser una lectura
# a ojo.
#
# Este repo tenía veintiún arneses de navegador y NINGUNA puerta: el único
# workflow era el de Pages, así que las pruebas corrían cuando alguien se
# acordaba. Un check que no bloquea es decorativo; uno que no existe no es
# nada. Esto es la mitad mecánica de cerrarlo — la otra mitad, marcarlo como
# obligatorio en la protección de rama, es del mantenedor y está escrita en
# tests/README.md.
#
# LA REGLA QUE JUSTIFICA EL FICHERO: el veredicto sale del RECUENTO LEÍDO, no
# del código de salida. Aquí eso no es una costumbre, es el código:
#
#   · `set -o pipefail`, porque `cmd | tee` devuelve el estado de `tee`;
#   · un arnés está verde si SALE con 0 **y** no imprime ninguna línea `FAIL`
#     **y** imprime al menos `PISO` líneas `OK`;
#   · el vacío es ERROR, no PASS: un arnés que revienta antes de comprobar
#     nada, o que cambia su formato de salida, se pone ROJO en vez de colarse
#     como verde silencioso. Es el modo de fallo más barato de sufrir y el más
#     caro de descubrir tarde.
#
# EL PISO no es decoración. Sin él, un `return` temprano que se coma la mitad
# de las comprobaciones deja el arnés en verde con doce checks en vez de
# trescientos, y nadie lo mira. Los números salen de una corrida medida (ver
# tests/README.md) y solo se BAJAN a propósito, con el motivo escrito: si un
# arnés pierde comprobaciones por una razón legítima, se edita aquí y el
# cambio aparece en el diff.
#
#   bash tests/correr.sh                 # todos
#   bash tests/correr.sh viento          # los que casen con el patrón
#   BASE_URL=http://localhost:8099 bash tests/correr.sh
#
# Necesita el repo servido en :8099 (el workflow lo levanta; en local,
# `python3 -m http.server 8099`).

set -o pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 1

BASE="${BASE_URL:-http://localhost:8099}"
export BASE_URL="$BASE" BASE="$BASE"
LOGS="${LOGS_DIR:-$RAIZ/.arneses}"
TIEMPO_MAX="${TIMEOUT_ARNES:-600}"
PATRON="${1:-}"

# ── EL PISO DE CADA ARNÉS ────────────────────────────────────────────────
# Comprobaciones mínimas que tiene que publicar. Los números están MEDIDOS
# —corrida completa del 2026-09-09, los 21 en verde, 1.630 comprobaciones en
# 1.030 s— y no copiados de la documentación: al medirlos, seis de los que
# tests/README.md daba por buenos estaban viejos (`test_layout` publica 201 y
# el texto decía 196; `test_index` 18 y decía 13; `test_granizo_pestana` 28 y
# decía 22). Un piso transcrito habría nacido mintiendo.
#
# Se SUBE al añadir cobertura y se BAJA solo a propósito, con el motivo
# escrito: si un arnés pierde comprobaciones por una razón legítima se edita
# aquí y el cambio aparece en el diff, que es justo lo que un recuento que
# nadie fija no consigue.
declare -A PISO=(
  [test_generador_inclemencias.js]=45
  [test_abanderamiento_evento.js]=31
  [test_buscador.js]=59
  [test_careo_pvsyst.js]=11
  # La cartera del usuario NO la probaba nadie: de los 33 arneses, el único que
  # nombraba `cartera-tabla.html` era `test_pwa.js`, y lo que hacía con ella era
  # listarla en la caché. MEDIDO: un mutante que invierte la migración de fases
  # —cada «Terminado» del usuario pasa a «Sin empezar» en su cartera guardada—
  # mató CERO en `test_pwa`, `test_index` y `test_integridad`, y ningún otro
  # arnés abre el fichero, así que ése era el cuadro completo. Lo que hay
  # debajo son datos de verdad y sin vuelta atrás: `migrateFases` reescribe lo
  # guardado en CADA carga, y `publishSpecs` escribe `factiun_plantas`, el
  # registro que LEEN los demás visores.
  [test_cartera.js]=45
  # EL PANEL LEYENDO LA BASE DE LA CARTERA, no su buzón de localStorage. La
  # librería de Supabase va SUSTITUIDA por una de mentira, y eso es a propósito:
  # un banco con credenciales de verdad se pondría rojo el día que cambie una
  # contraseña, y lo que hay que comprobar es el código de este repo. Lo que NO
  # cubre —que la cuenta real vea las filas reales— está dicho en su cabecera.
  #
  # Lo que sujeta: que sin sesión el Panel NO se traiga el CDN (arranca sin red,
  # es un PWA), que la base mande sobre el buzón, y que los tres finales que no
  # son «ha ido bien» digan cuál es: sin sesión, sesión con cero filas, o sin
  # red. Se arreglan de tres maneras distintas y un «no se pudo» genérico no
  # dice cuál.
  [test_cartera_en_vivo.js]=32
  # 304 -> 312: las DOS formas de la dos aguas, su cielo y la diferencia en el año.
  # 312 -> 317: las DOS formas de la dos aguas entraron como entradas del
  # CATÁLOGO (pico y valle) con sus comprobaciones, y el piso se quedó atrás en
  # el mismo commit que las añadió. Lo cazó un repaso, no el banco: un piso que
  # no sube deja que se vayan en silencio, que es justo contra lo que existe.
  [test_comparador.js]=317
  # UNA VARIABLE CSS QUE NO EXISTE NO FALLA: DEJA LA PROPIEDAD COMO ESTABA.
  # `background:var(--panel-2)` con `--panel-2` sin definir no es un error —la
  # declaración se descarta y la propiedad se queda con lo heredado—, así que
  # nadie se entera: ni la consola, ni el validador, ni los cuarenta arneses
  # que ya había.
  #
  # MEDIDO el 2026-09-23 en el navegador, antes de arreglar nada: el
  # desplegable del buscador de emplazamiento salía con `background-color:
  # rgba(0,0,0,0)` —la lista encima de los campos de latitud y longitud— y sus
  # separadores en `rgb(234,244,255)`, que es el color del TEXTO. Eran tres
  # variables copiadas de `sim-solar.html`, que tiene otra paleta.
  #
  # Y una peor, que no se ve: el careo pintaba su columna de diferencia con
  # `var(--live)` si coincide y `var(--build)` si no. Ninguna de las dos existe
  # en esa ficha, así que las dos ramas salían del mismo color heredado — un
  # veredicto codificado en color que no codificaba nada.
  #
  # Seis mutantes, los seis verificados aplicados: quitar `--flota` mata 2,
  # `--flota-hi` 2, el separador 3, devolver el careo a `--live`/`--build` 2,
  # la coordenada 2, y pintar las dos ramas del careo del MISMO color 1 —éste
  # sobrevive al guard estático, porque el color existe, y es el único que lo
  # caza—. Las seis predicciones se escribieron antes y salieron clavadas.
  [test_css_variables.js]=35
  # LA ESCENA, EN CHROMIUM DE VERDAD. Sube de 247 a 266 con el color por
  # producción: 19 comprobaciones nuevas, entre ellas las que sujetan que el
  # color de cada mesa corresponde a SU número. Dejar el piso en 247 las haría
  # desaparecer sin que nada cantase — que es justo lo que un piso existe para
  # impedir. Los pisos se miden, y éste sale de la tirada de este cambio.
  # 266 -> 270: 4 comprobaciones sobre el ESTADO del mando de color (apagado
  # sin comparar, encendido tras comparar). Salen de un fallo reportado —
  # «no se colorea» — en el que el texto decía la verdad y el mando la
  # contradecía; el piso sube para que no puedan volver a irse en silencio.
  # 270 -> 279, de tres cosas reportadas mirando la escena: los soportes de la
  # dos aguas atravesando los módulos (4, con el rayo contra el vidrio), el
  # color del INSTANTE —el mando ya no se apaga porque ya no hace falta— y sus
  # unidades y su noche (5), y que el texto bajo la escena deje de ser un muro
  # (3, contando caracteres; sin ellas el muro vuelve solo). Salen menos de la
  # suma porque las 4 del mando apagado se han reescrito: lo que sujetaban era
  # el apaño, no la propiedad.
  # 279 -> 280: las cabezas de las hincas asomaban sobre los módulos y el banco
  # daba verde porque medía EL EJE del poste, un punto —justo el único bien
  # puesto—. Ahora mide los cuatro vértices de la tapa, y se añade que el margen
  # no crezca con el tilt: si vuelve a crecer, es que alguien ha igualado otra
  # vez un punto en vez del sólido.
  # 280 -> 283: la dos aguas puede ser PICO o VALLE y la escena tiene que
  # dibujar la que se calcula (antes dibujaba valle y calculaba pico).
  # 283 -> 285: el barrido del NÚMERO de estructuras marcadas, que es el que
  # sujeta que las hincas no floten con la rejilla de cumbreras en fase par.
  # Mismo despiste que arriba, mismo commit.
  [test_comparador_3d.js]=285
  [test_comparador_sitio.js]=36
  [test_ejecucion_traza.mjs]=61
  # La ficha de planta y el acceso al SCADA. El piso son las 30 MEDIDAS, y lo
  # que de verdad sujeta son dos: «una planta SIN COMENZAR no gana sala de
  # control» y las cinco de «sin cartera no se inventa un estado». Sin esas, el
  # botón dejaría de significar nada y el Panel podría mandar a alguien a operar
  # una planta apoyándose en un estado que nadie ha publicado.
  #
  # MEDIDO contra los seis mutantes: quitar el distintivo mata 5; devolver el
  # SCADA solo de la lista escrita a mano, 2; abrirlo para cualquier estado, 1;
  # inventarse «En marcha» sin cartera, 6; no abrir la tarjeta, 1; y falsear la
  # potencia de la ficha, 1.
  #
  # La 31 es la ALTURA: el distintivo le partía la línea a Páramo y esa tarjeta
  # crecía 22 px sobre las de su fila. Se compara la misma página con y sin el
  # distintivo —no «que todas midan igual»— porque Dicayagua ya era más alta
  # antes de esto y una comprobación que la incluyera estaría roja por algo
  # ajeno. Sin el recorte de la línea, cae.
  [test_ficha_planta.js]=31
  # 8 y no 9 A PROPÓSITO, y esto es un HUECO DECLARADO, no un listón flojo.
  #
  # CORREGIDO: la primera versión de esta nota decía que la novena
  # comprobación «carea el espejo commiteado contra la FUENTE» y que cerrarla
  # exigía un secreto de solo lectura sobre `SolarGPTfull`. Las dos cosas eran
  # falsas, y se ven leyendo el arnés:
  #
  #   · el careo contra la fuente SÍ ocurre —lo hace «el espejo de este repo
  #     está en orden», con la regla extraída a función pura— y sin el hermano
  #     degrada a auto-consistencia contra el `.sha256` commiteado. El propio
  #     arnés lo dice en su salida: «SIN repo hermano: no se ha podido carear
  #     (modo declarado, no aprobado)». Y las cuatro combinaciones de la regla
  #     —espejo viejo, al día, sin hash, sin espejo— se ejercitan SIEMPRE sobre
  #     la función pura, aquí incluido.
  #   · la que no corre es otra: «el generador del core escribe también el
  #     espejo y su hash», que lee `solargpt/scripts/gen_goldens_hailstow.py`
  #     de `SolarGPTfull`.
  #
  # O sea que lo que falta en CI no es el careo, es comprobar que el generador
  # del core sigue escribiendo el espejo. Y eso NO necesita secreto ninguno:
  # el generador vive en `SolarGPTfull`, así que la comprobación se cierra
  # ALLÍ, en su propia suite, sin clonar nada.
  #
  # HECHO, y esta línea se actualiza porque un hueco declarado también se
  # mantiene: una nota que sigue diciendo «queda por hacer» sobre algo ya
  # hecho miente con la autoridad de estar escrita al lado del código.
  # Está en `solargpt/tests/test_generadores_de_espejo.py`, y cierra MÁS de
  # lo que esta nota pedía:
  #
  #   · no lo GREPEA, lo EJECUTA. La comprobación de aquí exige que el fuente
  #     del generador mencione `hailstow_casos.sha256`, y un grep sigue verde
  #     si la promesa está escrita en un comentario y ha dejado de cumplirse.
  #     Allí se corre `main()` con el destino parcheado y se mira lo escrito.
  #   · y son DOS generadores, no uno: `gen_goldens_ejecucion.py` tenía el
  #     contrato idéntico y no tenía guardián en NINGÚN repo — ni siquiera el
  #     grep que el de granizo sí tenía desde aquí.
  #
  # El piso sigue siendo 8, pero YA NO por lo mismo: no porque falte cerrar
  # nada, sino porque la novena comprobación de este arnés necesita el
  # checkout hermano y en esta CI no está. Eso no se arregla subiendo el
  # listón; se quedaría rojo en cada tirada.
  #
  # Y una advertencia sobre esta nota misma: el nombre del fichero de allí es
  # PROSA, y nada de este repo lo comprueba. Se pensó un careo textual —«que
  # algún test de la suite hermana nombre el generador»— y se descartó al
  # medirlo: `test_stow_machine.py` ya lo nombraba ANTES de que el guardián
  # existiera, así que ese oráculo habría estado verde con el hueco abierto,
  # y un oráculo que pasa con el bug puesto no es un oráculo. Si aquel
  # fichero se renombra, esta línea envejece y solo la caza quien lea los dos
  # repos. Queda dicho aquí en vez de fingir que hay una red debajo.
  [test_granizo_espejo.mjs]=8
  # 28 -> 31: VDE PASA A SER EL DEFAULT, y eso tiene una consecuencia MEDIDA
  # sobre la serie de demostración que conviene no tapar: su granizo son 1,6 cm
  # (16 mm) CONSTANTES en 63 muestras, así que pasa el 1,0 de julio en las 63 y
  # el 1,9 de VDE en NINGUNA. El caso de demostración del informe NO llegaría a
  # defensa con el criterio de VDE — sus 16 mm caen justo entre los dos
  # umbrales, que es la banda donde el criterio decide.
  #
  # Se comprueba en vez de taparse, y la dinámica se sigue probando con los
  # criterios de JULIO —el régimen para el que ese episodio se construyó, y lo
  # dice el nombre de su propia comprobación—, pulsando su botón a propósito.
  #
  # Y SE AFIRMA LO QUE SE SABE: no «no escala», sino «no llega a DEFENSA». La
  # pre-alerta se dispara con `cape >= umbral || prob >= umbral` y ninguno de los
  # dos mira el tamaño, así que puede haber vigilancia igual. Afirmar de más
  # habría puesto este arnés rojo por una frase mía y no por un defecto.
  # 31 -> 36: el selector de intervalo en navegador, y sobre todo LA RAMA QUE EL
  # DEMO NO PISA. El aviso del intervalo renombrado sólo se pinta con una serie
  # que no sea horaria, o sea nunca con los datos de hoy —el demo lo genera el
  # core y el core sólo tiene `hail_1h_cm`—, y yo lo escribí usando `f1()`, que
  # vive DENTRO del bloque de física y no existe en la ficha. Habría reventado el
  # día que llegara el dato bueno sin que ningún arnés lo hubiera visto antes. Así
  # que esa rama se pisa a mano con una serie sintética: sintética para una
  # COMPROBACIÓN es legítimo, sintética para enseñarla como dato sería inventar
  # resolución. Medido 36 con el fichero congelado (md5 dc7bb1d0).
  [test_granizo_pestana.js]=36
  # LA MANIOBRA ANTE UNA AMENAZA, en las dos pestañas que la tienen.
  #
  # EL HUECO QUE CIERRA. La máquina de granizo del §10.1 decide cuándo cruzar, y
  # su reloj de Capa 2 compara el tiempo disponible contra
  # `factor × (T_necesario + margen)`. Ese `T_necesario` es de los que el §9.1
  # deja «PENDIENTE DE MEDIR EN CAMPO»: era un número TECLEADO que nadie careaba
  # con nada. Si se queda corto, el guard entero queda flojo y la máquina cruza
  # creyendo que le da tiempo — sin que el error salga por ninguna parte.
  #
  # MEDIDO con los valores de julio y la cadena declarada (sondeo 15 s, arranque
  # 5 s, carrera ±55°, ángulo de granizo 55°):
  #
  #     sondeo NCU→TCU 15 s + arranque 5 s + recorrido 110° → 11,1 min
  #     declarado: 15 min  →  alcanza, con 3,9 min de aire
  #
  # Lo que entra es el camino de la ORDEN —los mismos cables para viento,
  # granizo y nieve— y NO la media del anemómetro ni su muestreo, que son cómo
  # se entera la máquina de VIENTO; la de granizo se entera por radar y CAPE.
  #
  # Y LA PESTAÑA DE NIEVE, que antes era un botón desactivado. No hay máquina
  # porque no hay documento: en esta casa la nieve solo tiene su sitio en la
  # jerarquía (SP3) y el bit que la publica. La pestaña dice qué sabe, lista los
  # SIETE huecos con su nombre —SIN VALOR, como el §19 con los suyos— y calcula
  # lo único que no depende de ellos. Lo que el banco vigila ahí es que NO
  # INVENTE: sin ángulo tecleado no da número, y el ángulo no nace con el del
  # viento puesto.
  #
  # MUTANTES, predicciones antes de medir. Tres de cuatro:
  #
  #   T1 colar la media en el camino de la orden . predije 2 · mata 2 ✓
  #   T2 el peor recorrido, el más CORTO ........ predije 4 · mata 4 ✓
  #   T3 el ángulo de nieve naciendo con 55° .... predije 2 · mata 2 ✓
  #   T4 que la casilla de latencia anule el poleo predije 2 · mata 3
  #
  # T4: olvidé que el careo del número pintado contra la función también lo caza
  # —10,8 min frente a 11,1—, así que son tres y no dos. Aritmética mía.
  #
  # SUBIDO A 38 con LA MÁQUINA DE NIEVE DE VERDAD. Llegó el criterio de planta
  # —activa por encima de 10 cm, desactiva por debajo de 2, defensa a 55° al
  # lado MÁS CERCANO— y la pestaña pasó de declarar siete huecos a tener
  # máquina. El guard que pedía que NO inventara se puso rojo, que es lo que
  # tenía que hacer; se le cambió la afirmación en vez de borrarlo.
  #
  # LA BANDA DE OCHO CENTÍMETROS ES EL MECANISMO. Entre 2 y 10 el estado lo
  # decide EL ANTERIOR, así que un banco que sólo probara 0 y 12 cm daría verde
  # contra un simple umbral. El recorrido entra en la banda por los DOS lados y
  # exige respuestas DISTINTAS al mismo 5 cm — eso es lo que distingue una
  # histéresis de un umbral, y es la única comprobación que no se puede falsear
  # con un número bien elegido.
  #
  # Y EL LADO MÁS CERCANO NO ES NINGUNA DE LAS CUATRO ESTRATEGIAS de la ficha:
  # las A eligen por el rumbo del viento y las B por el sol. El criterio de
  # planta minimiza el RECORRIDO, y lo que compra se mide: con la mesa en −40°
  # la defensa está a 15° —1,8 min— frente a los 110° del peor caso —11,1 min—.
  # Un factor 6 en tiempo de defensa.
  #
  # MUTANTES, predicciones antes de medir. UNA DE CUATRO:
  #
  #   U1 desactivar también a 10 cm (umbral) .. predije 3 · mata 4
  #   U2 el lado, siempre el positivo ......... predije 3 · mata 4
  #   U3 los dos umbrales invertidos ......... predije 4 · mata 4 ✓
  #   U4 el peor caso en vez del recorrido ... predije 2 · mata 1
  #
  # Las tres fallidas tienen el MISMO vicio y por eso van juntas: no cuento el
  # SOLAPE entre comprobaciones propias. En U1 olvidé que el careo estático de
  # los umbrales contra el fuente también lo caza; en U2, que cambiar el lado
  # cambia el recorrido y tumba también el check del tiempo; y en U4 conté de
  # más porque la línea del peor caso se pinta aparte y no se mueve. Predecir
  # bien pide mirar qué más toca cada mutante, no sólo a qué apunta.
  #
  # SUBIDO A 42: EL LADO DE LA NIEVE NO ES EL DEL DOCUMENTO, y eso hay que
  # vigilarlo con más cuidado que si lo fuera.
  #
  # El documento de planta pide «whichever is closer to the tracker position».
  # La ficha aplica el lado del SOL con la regla de mediodía —la de las
  # estrategias B de viento— porque lo decidió el mantenedor: la nieve debe
  # comportarse como el viento. No es interpretación mía y por eso va escrito en
  # la ficha, en la pestaña y aquí: dentro de un año alguien comparará las dos
  # cosas y encontrará reglas distintas.
  #
  # LO QUE CUESTA, MEDIDO, porque una decisión sin su precio no se puede
  # discutir: la regla de mediodía manda al oeste una mesa casi plana, así que a
  # veces pide más recorrido. A las 11:30 son 63° frente a 47° — 17° de más, o
  # sea 98 s más tarde defendida. La pestaña lo enseña siempre que difieran.
  #
  # MUTANTES, predicciones antes de medir. Dos de cuatro:
  #
  #   V1 quitar la regla de mediodía ......... predije 3 · mata 3 ✓
  #   V2 el lado del sol, invertido .......... predije 4 · mata 8
  #   V3 no enseñar el coste cuando difieren . predije 2 · mata 2 ✓
  #   V4 volver al lado del documento ........ predije 4 · mata 2
  #
  # V4 ES EL HALLAZGO, y no por el número: ignorar la corrección del mantenedor
  # y volver a la regla del documento sólo pone rojas DOS comprobaciones, porque
  # las dos reglas COINCIDEN casi todo el día. La diferencia sólo existe en la
  # ventana de mediodía. Un banco que probara horas al azar la vería una de cada
  # tantas; por eso el fixture conduce las 11:30 a propósito y no una hora
  # bonita. Cuando dos reglas se parecen, el banco tiene que ir A BUSCAR dónde
  # se separan.
  #
  # V2: predije 4 y mata 8 — el mismo vicio de la tanda anterior, no contar el
  # solape. Invertir el lado tumba también todas las comprobaciones de pantalla.
  [test_amenaza_maniobra.js]=42
  # 30 -> 31: una guarda de AUTOCONTENCIÓN. El bloque GRANIZO-FÍSICA se extrae
  # solo, sin la ficha alrededor, así que no puede nombrar nada de fuera —y eso
  # el `compila` no lo ve: `LOC.algo()` dentro de una función compila sin
  # problema y revienta al LLAMARLA, con el careo ya en marcha. Pasó: al meter el
  # intervalo de Meteomatics puse `LOC.intervaloDeLaSerie()` dentro de `simula` y
  # el arnés murió con un ReferenceError en vez de dar un rojo con su nombre. La
  # guarda mira el código sin comentarios y corta ahí mismo. Mutante: devolver
  # `LOC.campoGranizo('1h')` al bloque — 1 baja, limpia y nombrada.
  #
  # 31 -> 35: `LOC.CONTRATO` afirma de sí mismo que HOY NINGUNO de los parámetros
  # del §19 que publica lo lee ninguna máquina. Eso es comprobable, y una
  # afirmación falsa de inocuidad sería peor que callarse: si mañana alguien
  # conecta uno a un criterio, la ficha seguiría prometiendo que no cambia nada.
  # Se carea la traza CON y SIN ellos.
  # Y aquí fallé una predicción de forma instructiva: el primer mutante —que la
  # máquina LEYERA `horizonte_vigilancia_h` para subir el umbral un 50 %— predije
  # 1 baja y dio 0. Los casos del core traen un único valor de granizo, 1,6, contra
  # umbral 1,0: 60 % de holgura, así que un umbral movido a 1,5 sigue disparando y
  # la comparación no veía nada. El fixture debe contener el mecanismo, y uno
  # construido para carear la traza no está construido para medir sensibilidad. Con
  # tres SONDAS pegadas al umbral (en, bajo, sobre) el mismo mutante da 1 baja y
  # nombra la sonda. Hay además una comprobación de que la sonda distingue estar en
  # el umbral de estar bajo él: una sonda insensible no sondea nada.
  [test_granizo_traza.mjs]=35
  # 18 -> 28: el Panel dejo de COPIAR la version de las apps y pasa a LEERLA
  # del fichero de la app, asi que hay tres estados nuevos que pintar y los
  # tres se prueban en navegador: leida, no leida, y ultima lectura marcada.
  # El que justifica el bloque es el segundo: antes el numero estaba escrito
  # y siempre habia algo que pintar aunque fuera mentira, asi que «no he
  # podido leerlo» no era un caso que pudiera ocurrir.
  [test_index.js]=28
  [test_integridad.js]=7
  [test_layout_search.js]=22
  [test_layout_search_ui.js]=32
  [test_layout.js]=201
  [test_layout_ui.js]=182
  # LOS LIENZOS A LA DENSIDAD DE LA PANTALLA. Un `<canvas>` con el búfer más
  # pequeño de lo que ocupa lo AMPLÍA el navegador: letra y trazo gordos y
  # blandos. MEDIDO: con `var dpr=1` en `layout.html`, los cuatro arneses que
  # abren esa ficha dieron 544 comprobaciones VERDES y salida 0 —`test_layout`
  # 201, `test_layout_ui` 182, `test_zonas_mixto` 106 y `test_buscador` 55—.
  # Se miraron las DOS señales, recuento y código de salida.
  #
  # Había una herramienta que medía esto y no votaba: `tools/test_nitidez.mjs`
  # lo hace sobre cinco repos y termina con 0 pase lo que pase. No se toca —es
  # un instrumento para MIRAR, de varios repos— y la parte de este repo entra
  # aquí con veredicto.
  #
  # La ficha de viento se CORRE dentro del banco: ocho de sus nueve lienzos
  # están ocultos hasta que hay simulación, y la primera versión medía uno solo
  # y daba verde. Lo delató su propia batería (el mutante del 2D sobrevivía
  # mientras el del 3D moría). Quedan DOS sin alcanzar, `extCv` y `gTl`, y está
  # dicho en el arnés.
  [test_nitidez.js]=32
  [test_pwa.js]=21
  # El careo que faltaba entre DOS FICHAS: `cartera-tabla.html` escribe
  # `factiun_plantas` con `publishSpecs` y `index.html` lo lee en `SPECS` para
  # poner la potencia junto al nombre. Cada lado tenía ya su banco y ninguno
  # comprobaba que encajaran; aquí se corre el `publishSpecs` DE VERDAD y lo
  # que escribe se le da a la portada.
  #
  # MEDIDO: contra `test_index`, `test_integridad` y `test_pwa` mataron CERO la
  # potencia redondeada siempre a entero, el orden por nombre invertido, la
  # cuenta de estados contando doble y la búsqueda mirando solo el nombre.
  #
  # El CONTROL POSITIVO encontró además un listón flojo: la comprobación
  # llamada «se pintan las tarjetas» cuenta `article.card` SIN DISTINGUIR y
  # pide «más de cinco», y con las de herramienta vacías quedan ONCE de planta,
  # que también son `article.card`. (Primero escribí que `test_index` seguía
  # VERDE con ese mutante: era falso y el fallo era de mi medición — el arnés
  # revienta y da cero comprobaciones leídas, que el portón sí caza. Queda
  # dicho aquí porque una nota equivocada envejece peor que ninguna.)
  [test_portada.js]=42
  # El hueco de `sim-solar.html` NO era «no la abre nadie»: `test_buscador.js`
  # sí corre `solarGeom` y `singleaxis` de esta ficha en el navegador —romper
  # `singleaxis` mata 9 allí, y romper la marca del bloque, 4—. Lo que no había
  # era NINGÚN valor fijado: allí solo se comprueba un ORDEN (el eje N-S vale 1
  # y girarlo cuesta más cada vez), y un orden sobrevive a casi cualquier error
  # de valor. MEDIDO: contra los CINCO arneses que podían verlo, mataron CERO
  # el día juliano corrido un día entero, el backtracking quitado del todo y la
  # refracción anulada. Este banco los mata 4, 5 y 3.
  [test_solar.js]=73
  [test_sizing.js]=115
  # 13, y MEDIDO en los TRES modos —con checkout hermano, por `main` sobre
  # HTTPS y sin ninguno de los dos— porque el recuento no cambia entre ellos:
  # en degradado no desaparecen comprobaciones, cambia lo que dice la etiqueta.
  # Eso es a propósito. Si el modo degradado publicara menos, el piso tendría
  # que bajarse al peor caso y entonces dejaría de vigilar el bueno.
  #
  # Nace de un defecto que ocurrió DOS VECES y que nadie podía cazar: la
  # versión de `backtracking.html` se quedó dos versiones atrás y el informe
  # que exporta el usuario salía firmado con una que ya no era; y el mismo día,
  # la tarjeta de `overcast.html` iba a subir a v1.24.0 con la app en v1.23.0.
  # El Panel vive aquí y las apps en otro repo, así que ningún banco de allí
  # puede carear la tarjeta y aquí no había nada que leyera la app.
  # 13 -> 18: ese careo ya no existe, porque el defecto que cazaba tampoco.
  # Las tarjetas de las dos apps ya no llevan el numero: llevan un puntero
  # (`verEnApp`) y el Panel lo lee de la app. El arnes cambia de pregunta —de
  # «son iguales estos dos numeros» a «sigue resolviendo el puntero»— y gana
  # cinco comprobaciones: que las tarjetas apuntan en vez de copiar (2), y
  # que la regla con la que el Panel lee se extrae de el y funciona (3).
  # 18 -> 19: el hueco que queda —las tarjetas que siguen copiando— pasa de
  # CONTARSE a MEDIRSE. De las 18 publicadas sin puntero, las de este mismo
  # repo tienen su fichero al lado, asi que se mira si el numero de la tarjeta
  # aparece siquiera como texto en la app. Salieron tres respuestas donde antes
  # habia una: 2 con el numero escrito dentro (careables a mano), 2 SIN rastro
  # ninguno —sim-viento.html no contiene «1.26» y comparador-estructuras.html
  # no contiene «1.58»: su tarjeta lleva un libro de versiones propio del
  # Panel, sin contrapartida— y 14 en otros repos, no mirables desde aqui.
  [test_versiones_app.mjs]=19
  # Nace de un hueco MEDIDO: con el `hold` de la histéresis puesto a cero en
  # la llamada real, los diez arneses que abren la ficha —539 comprobaciones—
  # se quedaron verdes. La histéresis se podía borrar y el repo no lo notaba.
  [test_viento_abanderamiento.js]=40
  # De la batería de mutación del 2026-09-10: SIETE mutantes sobre mecanismos
  # que ningún arnés nombraba —Gumbel, lazo de control, denominador del pasivo—
  # mataron CERO comprobaciones contra los 238 de los arneses de viento. Estos
  # dos ficheros los cazan.
  [test_viento_control.js]=28
  # De la SEGUNDA batería, la del control positivo: `parseCSV` con el separador
  # menos frecuente, `rosa` repartiendo por truncamiento y `pasivo` sin
  # reenganche por cruce mataron CERO cada uno. El de CSV no es un hueco de
  # banco sino de CAMINO: cuelga del manejador de subida, que ningún arnés
  # dispara — y se cierra igual, porque el código existe y decide.
  #
  # 2026-10-03, +10: LA UNIDAD DECLARADA. El heurístico «p98>45 ⇒ km/h» leyó un
  # año de ERA5 de Open-Meteo en km/h —p98 de 26, no cruza— como m/s: 48,2 km/h
  # de máximo anual entraron como 48,2 m/s = 173 km/h, y la pantalla declaró
  # «m/s». Un 3,6x sobre toda la serie sin que nada chirríe. El arreglo no
  # adivina mejor: lee la unidad que la cabecera YA traía y, cuando no la trae y
  # las dos lecturas son creíbles, marca la duda en vez de elegir callando.
  # MUTANTES, los cuatro predichos antes de medir y los cuatro acertados: la
  # declaración deja de mandar (2), la declaración invertida (2), la duda nunca
  # se publica (1) y los bordes con \b en vez de [^a-z] (1 — con \b,
  # «viento_kmh», que es como viene media planta, deja de casar).
  [test_viento_csv.js]=41
  [test_viento_ejes.js]=77
  # Las dos fuentes sintéticas INVENTAN datos a propósito, y lo que este arnés
  # vigila sobre todo es que lo DECLAREN: viento cero y rumbo NaN en el cielo
  # claro, y `sin_irradiancia` al completar. Ninguna aparecía en un arnés.
  [test_viento_fuente.js]=28
  [test_viento_gumbel.js]=24
  # `runMulti` produce los MÁXIMOS ANUALES que come Gumbel, así que un error en
  # el troceado por años no da un fallo: da otro viento de diseño. Se prueba la
  # orquestación con un espía en el sitio de `LOC.run`, sin traer el motor.
  # LA PUERTA DE METEO, y el hallazgo que la justifica: NADIE MIRABA LA URL.
  # MEDIDO contra los seis arneses que nombran `fetchYear` o interceptan esa
  # API, con los mutantes verificados aplicados: `windspeed_unit=ms` -> `kmh`
  # mató CERO, el fin de rango con `year` en vez de `year1` mató CERO, y quitar
  # el `if(!r.ok)` mató CERO. El primero es el caro: si el servicio devuelve
  # km/h y la ficha lo trata como m/s, TODO el viento de TODA corrida real sale
  # multiplicado por 3,6. Los arneses no estaban flojos: INTERCEPTAN la API y
  # contestan ellos, así que la URL pedida les da igual — y un contrato con un
  # servicio de fuera solo se vigila mirando lo que se PIDE.
  # LA CADENA DE LATENCIA Y EL CRONÓMETRO. Hasta ahora la ficha modelaba UN
  # retardo, el del hierro a 0,17 °/s, y con ese solo el reloj de una maniobra
  # es `|Δθ|/0,17` — de cabeza—. Lo que faltaba es lo de ANTES: la media del
  # anemómetro, su muestreo, el sondeo NCU→TCU y el arranque del motor.
  #
  # MEDIDO sobre una fixture de tres días (temporal largo + punta de una hora),
  # meteo horaria a 1 min, A2: con media de 7.200 s el coste del abanderamiento
  # pasa de −10,129 % a −4,703 % —LA MITAD— y con umbral a 70 km/h y media de
  # 3.600 s un episodio DESAPARECE (2 → 1). Mientras tanto `hours_over_t1` no
  # se mueve: el viento sopló lo mismo y la máquina no llegó a verlo. Esa es la
  # distinción que el banco vigila — el viento que SOPLA describe el sitio, el
  # que se PUBLICA decide.
  #
  # OCHO MUTANTES, los ocho verificados aplicados, y el recuento predicho antes
  # de medir. Tres acertados y tres fallados, que van dichos porque una
  # predicción ajustada después no es una predicción:
  #
  #   media dividiendo siempre por k ..... predije 3 · mató 3
  #   media acumulada (no causal) ........ predije 9 · mató 4  ← ver abajo
  #   rejilla desfasada un paso .......... predije 5 · mató 8
  #   retardo de k+1 ..................... predije 3 · mató 3
  #   decidir sobre el viento que sopla .. predije 4 · mató 0  ← ver abajo
  #   horas sobre umbral sobre lo visto .. predije 5 · mató 3
  #   el cronómetro para al llegar la orden  predije 2 · mató 2
  #   el motor canónico no se rechaza .... predije 2 · mató 2
  #
  # Los dos marcados eran defectos MÍOS, cada uno de una clase distinta:
  #
  #  · el de la media acumulada sobrevivía a las dos comprobaciones de la rampa
  #    porque en los cuatro índices que miraban, una ventana móvil y un
  #    acumulado dan los MISMOS números. El fixture no contenía el mecanismo
  #    que el test decía vigilar. Se separan en la BAJADA —la ventana suelta lo
  #    viejo, el acumulado se queda arriba— y con esa comprobación añadida mata
  #    5, que era lo predicho para la versión corregida;
  #  · el de «decidir sobre el viento que sopla» lo apliqué sobre `LOC.single`
  #    y el banco corre A2/B2, que van por `LOC.dual`: mutante verificado
  #    aplicado, en una rama que nadie pisa. Eso no es un test flojo, es un
  #    mutante mal puesto. Repetido donde toca mata 4, lo predicho.
  #
  # Y dos cosas que el propio banco encontró mientras se escribía: el careo
  # entre la serie y la cadena incremental cazó un desfase de un paso —la
  # cadena viva avanzaba el reloj ANTES de resolver la muestra, así que
  # publicaba un paso antes que la serie: 22 de diferencia máxima, el salto
  # entero de la señal— y su control positivo cazó que el fixture ponía los
  # escalones justo en los bordes de la rejilla, donde el muestreo es la
  # identidad y dos de los siete careos comparaban dos series sin tocar.
  #
  # SUBIDO A 93 al cerrar dos defectos que REPORTÓ EL USUARIO y uno que encontró
  # el propio banco:
  #
  #   · «pauso pero sigue corriendo el tiempo». El rótulo del botón era una
  #     SEGUNDA COPIA de `LIVE.run`, no una vista suya; remontar la escena o
  #     encender la latencia lo desincronizaban y el clic siguiente —el de
  #     pausar— ARRANCABA el reloj. Medido: 725 → 726,5 min «tras pausar».
  #   · «¿y 9 minutazos???». Con los cuatro parámetros a CERO el cronómetro
  #     daba +9 min 37 s de llegada a la TCU en A1 y B1, y «—» en posición.
  #   · Y EL QUE SALIÓ AL CONDUCIR ESTO: el criterio de «la orden llegó» miraba
  #     si la orden había CAMBIADO. En seguimiento la orden cambia sola, la
  #     mueve el sol, así que un borde de rejilla entre el paso anterior y el de
  #     la decisión daba la llegada por buena antes de tiempo — 180 s en vez de
  #     270 s, según la FASE de la rejilla. Un criterio con carrera. Ahora la
  #     llegada se marca con una MARCA 0/1 que viaja por una cadena gemela.
  #
  # BATERÍA DE MUTANTES, con las predicciones escritas ANTES de medir. Las
  # cuatro fallaron, y se dejan escritas porque el número que uno espera es una
  # afirmación sobre lo que el banco vigila, no un adorno:
  #
  #   M1 borrar la marca del bucle en vivo ..... predije 8 · MATA EL ARNÉS
  #   M2 volver al criterio viejo («cambió») ... predije 9 · mata 3 → 4
  #   M3 adelantar la gemela dos veces por paso  predije 1 · mata 4
  #   M4 quitar el `else return` de la llegada . predije 2 · mata 3 → 4
  #
  # M1 no da recuento: la sección 4 espera la maniobra con un `waitForFunction`
  # pelado y el arnés muere por timeout. La puerta sale ROJA igual, que es lo
  # que importa, pero sin decir cuánto se rompió.
  #
  # Y LAS DOS FLECHAS SON EL VERDADERO HALLAZGO de la batería: dos
  # comprobaciones mías eran VACUAS con la llegada sin marcar, las dos por lo
  # mismo —un nulo colado por una comparación— y ninguna se veía leyendo:
  #
  #   «las cuatro marcan el mismo instante» ... `Set` de cuatro `null`: tamaño 1
  #   «ninguna en posición antes de la orden» . `180 >= null` es CIERTO en JS
  #
  # Exigido que sean números, M2 y M4 pasaron de 3 a 4. El recuento del banco no
  # se mueve: lo que cambia es de qué sirve.
  #
  # SUBIDO A 101 con los números del equipo de verdad: el anemómetro registra
  # CADA SEGUNDO y el poleo NCU→TCU ronda los 12–15 s. Con esos valores la ficha
  # se metía en un silencio caro. El lazo en vivo avanza a saltos, y MEDIDO en
  # este navegador el paso simulado es 0,1 s a ×1 · 6 s a ×60 · 30 s a ×300 ·
  # 90 s a ×900 · 360 s a ×3600. Una rejilla de 1 s con un paso de 30 s publica
  # en TODOS los pasos: es la identidad. El usuario tecleaba 1 s, la ficha no
  # medía 1 s, el cronómetro daba de menos y nadie se enteraba. Ahora la ficha
  # NOMBRA los periodos que no caben en el paso y dice a qué velocidad sí caben.
  #
  # El paso depende de la máquina —el lazo va a la cadencia del navegador, no a
  # la velocidad elegida—, así que ni la ficha ni el banco fijan esos números:
  # la ficha compara contra el paso MEDIDO del último fotograma y el banco fija
  # la PROPIEDAD, con su control positivo a ×1.
  #
  # MUTANTES, predicciones escritas antes de medir. Tres de cuatro, y la que
  # falló fue culpa del mutante:
  #
  #   N1 no pintar el aviso ................... predije 2 · mata 2 ✓
  #   N2 la comparación al revés (>= por <=) .. predije 3 · mata 3 ✓
  #   N3 no guardar el paso medido ............ predije 4 · mata 4 ✓
  #   N4 volver a los valores redondos ........ predije 2 · mata 1
  #
  # N4: predije 2 contando con que cambiaba el muestreo Y el sondeo, y el
  # mutante sólo cambiaba el muestreo. El banco vigila los dos por separado; el
  # que estaba mal medido era yo.
  # Y N1 destapó una comprobación floja: preguntaba por `periodosFinos()`, el
  # estado interno, en vez de por lo que la caja PINTA. Un mutante que calcula
  # bien la lista y no la enseña dejaba al usuario igual de a oscuras.
  #
  # SUBIDO A 112 con el cuarto dato de campo, y es el que más cambia: la NCU
  # decide sobre el viento a UN SEGUNDO, no sobre la media de diez minutos del
  # estándar meteorológico. (Primero se dijo «3 s»; luego llegó la tabla de la
  # planta y dice literal «for anemometer readings >40 km/h (1 sec)». Manda el
  # documento, y queda dicho que el valor cambió.) Con 1 / 1 / 15 / 5 el peor
  # caso son 22 s, y 20 de esos 22 son poleo más arranque: con la ventana IGUAL
  # que el muestreo, la cadena de medida no filtra NADA — la máquina decide
  # sobre la lectura cruda.
  #
  # Y AHÍ SALTÓ EL DEFECTO GORDO, que no estaba en la cadena sino en el informe.
  # La serie anual va a pasos de 1 min. Los cuatro parámetros caen por debajo de
  # ese paso, así que las primitivas devuelven EL MISMO OBJETO —identidad
  # exacta, medido con `===`— y el año sale bit a bit igual que sin cadena. El
  # banner seguía declarando «estos números NO son comparables». Eso no es un
  # aviso de más: es una afirmación FALSA en la dirección cara, porque quien lo
  # lea creerá que está viendo el efecto de la cadena cuando no hay ninguno.
  #
  # `LOC.mudos` no repite los umbrales de las primitivas (`k>1`, `p>dt`, `k>0`):
  # les PREGUNTA con una sonda y mira si devuelven su entrada. Así no puede
  # desincronizarse de ellas el día que cambie un redondeo.
  #
  # MUTANTES, predicciones antes de medir. Tres de cuatro:
  #
  #   Q1 `mudos` no encuentra nunca nada ...... predije 5 · mata 5 ✓
  #   Q2 se cae la rama de «no cambia nada» ... predije 3 · mata 3 ✓
  #   Q3 la sonda de la media, invertida ...... predije 5 · mata 7
  #   Q4 vuelve la media de 600 s ............. predije 1 · mata 1 ✓
  #
  # Q3: razé que la rama «a medias» sobreviviría, y no. Con la sonda invertida,
  # una media de 600 s sobre pasos de 60 pasa a contarse como MUDA, así que ese
  # banner se va también a la rama de «no cambia nada» y caen sus dos. Error de
  # razón mío, no del banco.
  #
  # Y LA PRIMERA TIRADA DE ESA BATERÍA DIO 9, no 7. Las dos de más no eran del
  # mutante: eran dos comprobaciones mías que leían la caja del cronómetro tras
  # una espera FIJA de 900 ms, y `pintaCrono` repinta uno de cada seis
  # fotogramas. Un banco que a veces falla solo no sirve para medir: el primer
  # rojo que sale ya no se sabe de quién es. Ahora esperan a la CONDICIÓN, y se
  # comprobó con tres tiradas seguidas antes de volver a mutar.
  #
  # SUBIDO A 124 con LA COTA. Decir «no cambia nada» era cierto sobre el
  # CÁLCULO y falso sobre el MUNDO: la cadena existe, lo que pasa es que su
  # efecto vive por debajo de la resolución de la serie. Dejarlo ahí cambiaba
  # una afirmación falsa por un SILENCIO, y el silencio también se paga: quien
  # lee no sabe si lo que no se ve es despreciable o es el resultado.
  #
  # Ahora se acota, y la cota es de las que no se discuten: lo más tarde que
  # puede arrancar una maniobra es la suma de los cuatro, eso ocurre DOS veces
  # por episodio, y se compara con las horas de SOL. Con 1/1/15/5 y 31
  # episodios sobre 4.380 h: 24 s por maniobra · 4,1° de eje · 62 maniobras ·
  # 25 min · <b>0,009 %</b> del año. Es un TECHO, no una estimación.
  #
  # Y SU LÍMITE, escrito: la cota cubre el RETRASO, no el cambio de decisión.
  # Una media larga no retrasa, CAMBIA —puede borrar un episodio entero— y eso
  # este techo no lo acota. Por eso se pinta SÓLO en la rama en que los cuatro
  # son mudos, donde la media, por debajo del paso, no puede esconder nada. Hay
  # comprobación de que no aparece en la rama «a medias».
  #
  # MUTANTES, predicciones antes de medir. Tres de cuatro:
  #
  #   R1 una maniobra por episodio, no dos ... predije 4 · mata 3
  #   R2 el peor caso como MÁXIMO, no suma ... predije 5 · mata 5 ✓
  #   R3 dividir por horas y no por segundos . predije 2 · mata 2 ✓
  #   R4 quitar la guarda del sitio sin sol .. predije 1 · mata 1 ✓
  #
  # R1: conté «dos maniobras por episodio» entre las víctimas después de haber
  # razonado que sobrevive —`maniobras` es otro campo y el mutante no lo
  # tocaba—. Aritmética mía, no del banco.
  #
  # Y R4 destapó que MI PROPIO DETALLE DE FALLO mentía: `JSON.stringify` de un
  # `Infinity` devuelve `null`, así que el rojo salía enseñando `frac_sol:null`
  # —justo el valor que la comprobación exige—. Un rojo que se explica con la
  # prueba de que estaba verde es peor que un rojo sin detalle. Va con `String`.
  #
  # SUBIDO A 133 al conducir por fin LA MANIOBRA QUE SE QUEDA A MEDIAS — el
  # viento baja del umbral antes de que el eje llegue. El cronómetro ya la
  # declaraba y nadie la conducía.
  #
  # Y al conducirla apareció un defecto de promesa incumplida: el pie decía
  # «lo que se ve es hasta dónde llegó» y la tabla no enseñaba NINGÚN número
  # —la fila ponía «—» y su columna iba vacía—. Ahora dice los grados hechos
  # sobre los que había por delante, los dos medidos sobre la escena.
  #
  # TRES VECES SE CAYÓ EL FIXTURE ANTES DE MEDIR NADA, y las tres por el mismo
  # vicio —suponer en vez de esperar—, así que quedan escritas:
  #
  #   1. esperar sólo a que las máquinas estén en IDLE se cumplía AL INSTANTE
  #      (venían así de la sección anterior), el viento subía en el mismo
  #      fotograma y `prevV` nacía valiendo 95: sin flanco no hay episodio. Las
  #      siete comprobaciones en rojo con la ficha correcta;
  #   2. a ×900 un fotograma son ~90 s de simulación, o sea 15° de eje, y el
  #      recorrido entero eran 14,4°: la maniobra terminaba en UN paso y no
  #      había nada que cortar. Va a ×60;
  #   3. y leer la caja en el instante del corte devolvía la tabla ANTERIOR,
  #      porque `pintaCrono` repinta uno de cada seis fotogramas. Segunda vez
  #      que ese repintado muerde en este fichero.
  #
  # MUTANTES, predicciones antes de medir. Tres de cuatro:
  #
  #   S1 borrar la rama del corte ............ predije 2 · mata 2 ✓
  #   S2 congelar `thUlt` (recorrido = 0) .... predije 1 · mata 7
  #   S3 decir siempre «lleva» ............... predije 2 · mata 2 ✓
  #   S4 nunca superar la banda muerta ....... predije 2 · mata 2 ✓
  #
  # S2: congelar `thUlt` rompe LA ESPERA DEL PROPIO FIXTURE, que se apoya en ese
  # mismo estado para saber cuándo cortar, así que se cae la sección entera. El
  # rojo es legítimo pero llega por el fixture y no por la afirmación; queda
  # dicho porque un recuento alto por acoplamiento no es un banco más fuerte.
  #
  # SUBIDO A 134 al bajar la ventana del anemómetro de 3 s a 1 s — la tabla de
  # la planta lo dice literal: «for anemometer readings >40 km/h (1 sec)».
  #
  # Y AL CAMBIARLO SE PUSIERON ROJAS TRES COMPROBACIONES MÍAS, cada una con un
  # número distinto y ninguna diciendo por qué: llevaban el peor caso escrito a
  # mano como 24 —los 3+1+15+5 de entonces— repetido en tres sitios. Ahora la
  # suma se hace UNA vez (`PEOR`), sigue siendo un oráculo independiente —se
  # suma a mano, no se le pide a `cotaCadena`, que es lo que se comprueba— y de
  # paso se gana una comprobación: que el peor caso ES la suma de los cuatro
  # declarados. Un literal repetido no es un oráculo más fuerte, es tres sitios
  # donde envejecer.
  [test_viento_latencia.js]=134
  [test_viento_meteo.js]=33
  [test_viento_multi.js]=28
  # LA ORQUESTACIÓN. Los veinte arneses de viento prueban PIEZAS —`theta`,
  # `control`, `poa`, `single`, `dual`, `pasivo`— y ninguno el MONTAJE: en qué
  # orden se llaman y qué sale del conjunto. Ahí viven decisiones que no son de
  # ninguna pieza: que la LÍNEA BASE también pase por el lazo de control (si no,
  # todos los deltas salen inflados), que la consigna se guarde ANTES del lazo,
  # que el límite de mediodía sea de las B, y que las A orienten por el rumbo
  # del viento y las B por el sol.
  #
  # MEDIDO: el mutante que pone las horas por defecto de `LOC.fetchHSU` a 24 en
  # vez de 720 —verificado aplicado en disco— mató CERO contra los VEINTE
  # arneses que abren la ficha. `fetchHSU` no la nombraba ninguno.
  #
  # Corre SIN RED: `cfg.meteoPre` corta la descarga —y el banco comprueba que
  # de verdad la corta— y el SCADA se intercepta en el navegador, que es la
  # única forma de probar un 500 o una respuesta sin muestras.
  [test_viento_orquestacion.js]=90
  [test_viento_pasivo.js]=30
  [test_viento_planta.js]=35
  # De la TERCERA pasada: intercambiar los factores de vista del cielo y el
  # suelo en `LOC.poa` —la transposición de la que sale toda la energía— mató
  # CERO contra los TRECE arneses de viento. Medido con el árbol limpio y nada
  # más corriendo.
  [test_viento_poa.js]=30
  [test_viento_rafaga_medida.js]=39
  [test_viento_reproductor.js]=18
  [test_viento_rosa.js]=23
  # El CONTROL POSITIVO de la segunda batería —declinación de 23,45° a 13,45°,
  # que mueve el ángulo de seguimiento hasta 13,8°— murió CERO contra los nueve
  # arneses de viento. Verificado que el instrumento medía: con un error de
  # sintaxis inyectado, el navegador sí lo ve. Este arnés ancla la geometría a
  # astronomía de manual.
  [test_viento_sol.js]=28
  # El careo de las DOS cabezas del abanderamiento: la de serie (informe) y la
  # de paso a paso (panel en vivo). Encontró que `stepperPasivo` reenganchaba
  # solo por proximidad mientras `pasivo` ya llevaba el criterio de cruce: a
  # paso de una hora, 3 pasos sueltos contra 24.
  [test_viento_steppers.js]=17
  [test_viento_sello.js]=17
  [test_viento_sitio.js]=52
  # LA CONFIGURACIÓN DE LA PUERTA, que hasta hoy era prosa en
  # `docs/puertas-y-alcance.md` §5 bis — y ese apartado declaraba su propia
  # debilidad diciendo que leerla «pide una llamada autenticada de
  # administrador que la CI no tiene».
  #
  # ESO ERA UNA MEDIA VERDAD, Y MI PRIMERA CORRECCIÓN FUE UNA FALSEDAD
  # DISTINTA. Escribí que los dos objetos «dan 200 SIN credencial» porque los
  # leí con `curl` desde el contenedor de desarrollo y salieron. No eran
  # anónimos: el proxy de egreso los AUTENTICA. Se ve en la cabecera
  # —`X-Ratelimit-Limit: 15000`, no 60— y `api.github.com/user` devuelve
  # `login: IMoriana3`. O sea que medí, pero medí otra cosa, y lo di por
  # anónimo porque no había mandado token.
  #
  # LO QUE ES VERDAD, y lo estableció la tirada #1 de este arnés en CI:
  #   · `/rulesets` y `/rulesets/<id>` SÍ se leen anónimos (en CI, sin token,
  #     el ruleset entero llegó bien y pasó la regla);
  #   · `delete_branch_on_merge` y `allow_auto_merge` NO: son de la
  #     representación COMPLETA del repositorio, que GitHub solo da a quien
  #     tiene escritura. Sin token llegaron `undefined`.
  # Así que §5 bis tenía razón PARA ESOS DOS CAMPOS y se equivocaba solo sobre
  # el ruleset. Su ausencia se declara como «no mirado» en vez de suspender; un
  # valor presente y distinto sí es deriva.
  #
  # EL PISO ES EL DE SIN RED (54), no el de con red (57), y es a propósito: si
  # fuera 57, una caída de api.github.com o un 403 por límite de peticiones
  # pondría la puerta entera en rojo por algo que no es un defecto de este
  # repo. Las dos que faltan son «la configuración VIVA no tiene faltas» y «la
  # VIVA no deriva del golden».
  #
  # Y CINCO DE LAS 54 son de una pieza que NO se ha podido probar entera: si
  # alguien pone un `GITHUB_TOKEN` flojo, un 401/403 reintenta en anónimo. El
  # 401 real no se provoca desde el contenedor de desarrollo —el proxy de
  # egreso devuelve 200 incluso con un token inválido, y `curl -v` demuestra
  # que la cabecera sí sale—, así que lo ejercitado es la DECISIÓN, extraída a
  # función pura, en sus cinco combinaciones. El viaje queda sin ejercitar y
  # dicho. (El workflow NO pasa el token, justamente para no depender de eso.)
  #
  # Y ESO SIGNIFICA QUE EL HUECO ES REAL: sin red, una configuración cambiada a
  # mano pasaría. El arnés lo imprime con esas palabras —«HUECO ABIERTO: nadie
  # ha comprobado que lo vivo siga pareciéndose al golden»— en vez de dejar que
  # el verde lo tape. En CI hay red, así que el modo normal es el de 40.
  #
  # Y EL CLON TIENE QUE SER EL REPO: en un fork, leer la API de
  # `IMoriana3/proyectos` y aprobarlo sería un verde falso sobre una puerta que
  # no es la suya. Si el `origin` no es ése, la lectura viva se declina con el
  # motivo. VERIFICADO sobre un clon de verdad con el origin cambiado: 48
  # comprobaciones, lectura declinada, hueco declarado.
  #
  # UN MUTANTE QUE SOLO MUERE EN CI, dicho porque es una ceguera del entorno de
  # desarrollo y no del arnés: quitar la lista de campos solo-con-credencial
  # —justo la regresión que puso roja la tirada #1— mata CERO aquí, porque el
  # proxy autentica y los campos llegan. En CI mata 1. Lo que sí se ejercita
  # localmente es el MECANISMO, por fixture: `separaAusentes` se prueba con un
  # objeto vivo al que le falta el campo. Por eso el fixture tiene que contener
  # el mecanismo y no heredarlo de lo que vigila — aquí es literalmente la
  # diferencia entre cubrirlo y no cubrirlo.
  #
  # MEDIDO con siete mutantes, los siete verificados aplicados y las SIETE
  # predicciones clavadas (10 bajas): renombrar el job del workflow mata 1,
  # darle un `name:` al job 1 —que le cambia el nombre del check run y deja el
  # obligatorio huérfano—, el golden con `delete_branch_on_merge:false` 1, el
  # golden exigiendo «arneses / navegador» 3, el golden con un actor con
  # dispensa 2, y un `normaliza()` que no ordena 2.
  #
  # LA PRIMERA TIRADA NO FUE ASÍ, y queda escrito porque el arreglo salió de
  # ahí: predije 1/3/2 para esos tres y mataron 2/6/5. El exceso no era mala
  # suerte, era un defecto de tres comprobaciones que decían «apagar X NO es
  # falta de la regla» y estaban escritas como `faltas.length === 0`. Eso no
  # comprueba lo que afirma: cualquier falta metida en el golden las ponía
  # rojas las tres sin que lo suyo hubiera cambiado. Ahora comparan contra la
  # LÍNEA BASE del golden. Y la del booleano construía su fixture DESDE el
  # golden, así que un golden mutado le vaciaba el mecanismo: ahora es literal.
  [test_puerta_configurada.mjs]=54
  # LA ESTRATEGIA DE VIENTO × GRANIZO, que es lo que el informe NO cubre: qué se
  # hace cuando las dos amenazas piden lados distintos. Sale de la estrategia
  # operativa propuesta a la empresa (2026-10), que adapta a TIEMPOS los
  # criterios en DISTANCIAS de VDE Americas. NO está aprobada y la ficha lo dice.
  #
  # CORRE EN NODO, SIN NAVEGADOR, y eso es la decisión de diseño: la decisión
  # entera vive en funciones puras dentro de `sim-viento.html` y este banco las
  # EXTRAE del fichero. Los otros tres bancos de la ficha necesitan Chromium, así
  # que su mecanismo no se puede ejercitar donde no haya navegador; el de aquí sí
  # —y de hecho se midió aquí, donde el chromium que pide la versión fijada no se
  # puede bajar.
  #
  # LA EXTRACCIÓN SE VIGILA ANTES DE USARLA, porque es el riesgo del método: un
  # `indexOf` que no encuentra nada devuelve un trozo vacío y el banco pasaría a
  # probar NADA saliendo verde. Y el corte no puede ser «hasta la última función
  # que me interesa»: `granizoPlan` llama a `ladoNieve`, que llama a `noonFlip` y
  # a `sign`, 200 líneas más abajo. La primera versión cortaba antes y daba un
  # `LOC` que evaluaba bien y reventaba al usarlo. Ahora el final es el MÁXIMO de
  # todos los marcadores y se exige que estén las trece.
  #
  # LO QUE AÑADE A LA PROPUESTA, y es lo que un criterio escrito no puede decir:
  # si la maniobra CABE en el margen, y qué se CEDE cuando no se va al lado bueno.
  # De ahí salió un hallazgo para la reunión: con 29 min de margen de viento la
  # regla manda al lado malo, pero el cruce HABRÍA cabido (11,1 min). O sea que
  # los 30 min no son el límite físico —ése son 11— sino colchón para el error de
  # la previsión. El banco fija las dos cosas por separado.
  #
  # MEDIDO con seis mutantes, los seis verificados aplicados (27 bajas), y CUATRO
  # predicciones de seis: el lado al revés mata 9 (predije 10), la precedencia
  # invertida 2, quitar «cabe» 2, el más cercano siempre al este 10 (predije 5),
  # quitar «cede» 3, y una matriz que ignora el theta de su fila 1. Los dos
  # fallos son de recuento mío —uno de más y cinco de menos—, y el de menos es el
  # vicio de siempre: no cuento el solape entre mis propias comprobaciones.
  #
  # Y DOS COMPROBACIONES NACIERON FLOJAS, arregladas antes de medir: una comparaba
  # `plan !== plan` —identidad de objetos, que difiere siempre— así que pasaba
  # igual si la matriz ignoraba el theta de su fila; y dos accedían a `p.cede.x`
  # sin guardia, de modo que un mutante reventaba el banco en vez de ponerlo rojo
  # con mensaje. Los mutantes M4 y M6 matan por esos arreglos.
  #
  # 57 -> 70: LOS VALORES DE VDE, que manda VDE por decisión del mantenedor. Dos
  # números y una trampa de unidades en cada uno:
  #   · 19 mm van al campo como **1,9**, porque está en cm y se compara con
  #     `m.hail_1h_cm`. Un 19 ahí serían 19 CENTÍMETROS y la máquina no
  #     dispararía jamás: no da error, deja de disparar. El mutante que escribe
  #     19 mata 4.
  #   · y el 30 % de VDE NO es el de tormenta. VDE dice «≥30 % de granizo severo
  #     de al menos 19 mm»; `umbral_prob_tstorm_pct` se compara con
  #     `m.prob_tstorm_pct` y entra en un OR con el CAPE. Son magnitudes
  #     distintas: una tormenta al 30 % es mucho más frecuente que un granizo de
  #     19 mm al 30 %, así que bajar ese campo de 40 a 30 AFLOJARÍA el disparo,
  #     al revés de lo que VDE pretende. El 30 va a `umbral_probabilidad_pct`,
  #     el hueco que el core ya tiene reservado y que hoy nadie consume: queda
  #     GUARDADO Y DECLARADO, no aplicado, y es lo que hay que pedirle a
  #     Meteomatics. El mutante que lo pone en la tormenta mata 2.
  # Y lo declarado-no-aplicado NO viaja en el POST al motor: la clave es del core
  # pero allí vale null y no hay motor en este entorno para ver qué hace con un
  # valor puesto. Cuatro mutantes más, las CUATRO predicciones clavadas (8 bajas).
  #
  # 70 -> 94: EL INTERVALO DEL PRODUCTO DE GRANIZO, que estaba clavado a `hail_1h`
  # en cuatro sitios. Meteomatics lo sirve como `hail_<intervalo>:cm` con
  # 10min/20min/30min/1h/3h/6h/12h/24h, y el intervalo NO es formato:
  #   · un máximo de UNA HORA no dice CUÁNDO: un 1,6 cm puede ser dentro de 5
  #     minutos o dentro de 55, y la estrategia decide justo en esa frontera
  #     (≥60 min maniobra completa, <60 reducida). El dato era más grueso que la
  #     decisión que alimenta, y ahora la ficha avisa cuando eso pasa;
  #   · y un máximo de una hora es MÁS PERMISIVO contra el mismo umbral, porque
  #     recoge el pico de toda la ventana. Comparar 1h con 10min sobre 19 mm no
  #     es comparar lo mismo.
  # Se ofrece SOLO lo que la serie trae: ofrecer los ocho del catálogo sobre una
  # serie que tiene uno sería un control que miente. Y de un máximo horario NO se
  # saca el de diez minutos: fingirlo sería inventar resolución que el dato no
  # tiene, y queda dicho en el fuente.
  #
  # CUATRO MUTANTES, y la primera tirada salió 0 DE 4 EN PREDICCIONES —todas
  # estimadas en vez de trazadas check por check—. Lo que esa tirada sí destapó es
  # que el mutante más GRAVE mataba solo 1: «el preferido manda aunque no esté»
  # haría que la máquina leyera `hail_10min_cm` en una serie que solo trae
  # `hail_1h_cm`, o sea undefined reportado como «sin producto de granizo»:
  # perder la señal entera en silencio. Se añadió una comprobación de
  # CONSECUENCIA —que el campo devuelto encuentre el dato de verdad en la serie—
  # y con ella las cuatro predicciones salen clavadas (7 bajas).
  #
  # 94 -> 107: `LOC.sirveGranizo()`. El intervalo salió de DENTRO de la máquina,
  # donde lo había puesto mal, y pasó a servirse antes de entrar: la máquina es
  # espejo del core y el core sólo conoce `hail_1h_cm`; si la máquina resolviera
  # intervalos sabría más que su original y el careo —cuyos casos sólo traen el
  # campo horario— se quedaría ciego a la diferencia. Las 13 nuevas prueban que
  # la casilla única queda alimentada, que el campo de origen NO se queda puesto
  # (el `Muestra` del core es un dataclass), que la serie original no se toca, y
  # la de CONSECUENCIA: que la máquina ENCUENTRA el dato donde lo busca. Y la 13ª:
  # un agujero en el campo fino deja la casilla vacía en vez de rellenarla con el
  # máximo horario, que mezclaría dos resoluciones en la misma serie sin decirlo.
  # Cinco mutantes, predije 5+4+2+1+3=15 bajas y salieron 5+4+2+1+5=17: fallé el
  # último. Mutar la copia a `copia=m` ensucia la muestra EN SITIO, y la suciedad
  # se arrastra a las comprobaciones de abajo que reusan la misma serie mixta.
  # No conté el acoplamiento entre comprobaciones por estado compartido.
  #
  # 107 -> 115: `LOC.CONTRATO`, las decisiones de Factiun sobre los parámetros que
  # el §19 deja «SIN VALOR». No se comprueban los números —un número no se prueba—
  # sino la estructura que impide que mañana se lean como criterio del informe:
  # que cada decidido lleve REGLA escrita, cada nulo lleve MOTIVO escrito, que las
  # dos listas cubran todas las claves (un parámetro sin regla ni motivo es el modo
  # silencioso de este bloque), que NINGUNO esté aplicado, que el suelo de
  # `ttl_orden_s` salga de la cinemática (110°/0,17 °/s) y no de un gusto, y que el
  # buffer de VDE siga siendo coherente con el margen de granizo de la estrategia.
  #
  # 115 -> 135: EL VETO DE RACHA SOBRE LA BANDA DE PRE-STOW. Restricción de planta
  # (Iñaki, 3-oct-2026): «no podemos permitir que a 40 km/h o más pase entre 0 y 25
  # grados», simétrica y de RACHA. Al mirarlo resultó que la frontera YA EXISTÍA —el
  # `pmin` del pre-stow, 30°, más estricto que los 25 que había dicho— así que no se
  # añadió ninguna constante de ángulo: se dejó el 30. Él mismo lo vio antes de que
  # se publicara nada («esto es lo que ya hace el simulador en uno de los casos»), y
  # la propuesta de banda nueva se retiró sin llegar al repo.
  #
  # LO QUE SÍ FALTABA, y es el cambio: `granizoPlan` manejaba UN SOLO viento y
  # comparaba con él tanto el 40 como el 60. Si el 40 es de racha, el caso 1
  # autorizaba cruces que la planta prohíbe —con 30 km/h sostenidos la racha mediana
  # ya pasa de 50—. Ahora la racha va aparte, y el cruce exige que no alcance el
  # umbral mientras dure el tramo DENTRO de la banda: 60° a 0,17 °/s son 5,9 min, el
  # 45 % del recorrido completo, que es lo que un booleano `cruzaCero` escondía.
  #
  # LA ASIMETRÍA DE LOS DOS NULL, que es lo que se puede leer mal: `rachaAhora=null`
  # es CEGUERA y veta (§8-H); `tRacha=null` es AUSENCIA DE PREVISIÓN y no veta, misma
  # convención que `tV40=null` tenía desde antes.
  #
  # Cinco mutantes. Predije 1 baja cada uno y la cuarta salió 0: mutar la guarda
  # `if(cruzaria)` no daba rojo, REVENTABA con «Cannot read properties of null», y mi
  # recuento por líneas FAIL no lo veía. El fallo era de mi código de producción, que
  # dependía de esa guarda para no desreferenciar null; con `enB&&` da rojo limpio.
  # Y la quinta —usar `def` en vez de `pre` como borde— sobrevivía porque ninguna
  # comprobación fijaba qué borde usa `granizoPlan`: ahora lo fija una racha que
  # llega a los 8 min, que cabe con 30° (5,9) y vetaría con 55° (10,8). Tras los dos
  # arreglos: 5/5 y 6 bajas, los cinco llegando a su veredicto.
  [test_granizo_estrategia.mjs]=143
  # Weather Workbench autónomo: 32 contratos puros + 4 de navegador real
  # (cartera, El Burgo, ancho efectivo y sello autónomo). Medido por diseño:
  # si el smoke de navegador no llega, publica menos de 36 y la puerta cae.
  [test_meteo_browser.mjs]=36
  [test_pw_navegador.js]=10
  [test_zonas_mixto.js]=106
)

# ── EL PISO TIENE QUE CUBRIR A TODOS ─────────────────────────────────────
# Un arnés nuevo sin piso caería al `:-1` de más abajo y quedaría vigilado
# por un umbral que no puede fallar: verde con una sola comprobación. Así que
# se exige que la tabla los nombre a todos, y añadir un arnés obliga a medir
# el suyo. Es la lista de exenciones al revés: allí sobra una entrada, aquí
# falta.
for _t in tests/test_*.js tests/test_*.mjs; do
  _n="$(basename "$_t")"
  if [ -z "${PISO[$_n]+x}" ]; then
    echo "ROJO · $_n no tiene piso en tests/correr.sh"
    echo "       córrelo y apunta cuántas comprobaciones publica"
    exit 1
  fi
done

# ── LO QUE NO CORRE AQUÍ, CON DUEÑO Y MOTIVO ─────────────────────────────
# Vacío: ningún arnés está exento. Si alguno deja de poder correr, se apunta
# AQUÍ con su motivo — y el guard de zombis de abajo exige que el fichero siga
# existiendo, para que una exención no sobreviva al arnés que eximía.
#
# CORRECCIÓN, y va escrita porque la versión anterior de este comentario decía
# lo contrario: NO es cierto que los veintiún arneses den lo mismo con red que
# sin ella. Lo escribí midiendo que ninguno NOMBRA un host externo, que es otra
# cosa, y la primera tirada de CI lo desmintió — `test_layout_ui` comprueba que
# la cascada de fuentes de terreno caiga al siguiente peldaño cuando la primera
# falla, y con red DE VERDAD la cascada aterriza en un peldaño que el arnés no
# intercepta. O sea que ese arnés depende de NO tener red, justo al revés de lo
# que yo había afirmado. Se arregla en su sitio (interceptando también ese
# peldaño), no aquí: una exención lo taparía.
declare -A EXCLUIDOS=()

# ── LOS `test_*` QUE VIVEN FUERA DE `tests/` ─────────────────────────────
# Un fichero llamado `test_algo` que no está en `tests/` NO LO CORRE NADIE: no
# entra en el bucle de abajo, no tiene piso, y su veredicto no vota. Eso puede
# estar bien —hay bancos que necesitan un repo hermano que aquí no hay— pero
# tiene que estar DICHO, o el nombre promete una vigilancia que no existe.
#
# MEDIDO el 2026-09-10, corriendo los tres a mano en este contenedor:
#
#   · tools/test_cartera_dwg.mjs  sale 2 sin el repo `cobertura-zigbee` al
#     lado: carea la cartera contra lo MEDIDO en el DWG (seguidores, HSU,
#     pitch, centro) y sin el índice del plano no tiene contra qué carear.
#   · tools/test_ancho.mjs        necesita `playwright-core` de un repo hermano
#     y las páginas de OTROS repos; aquí tarda más de 90 s y avisa de las
#     carpetas que le faltan. Es una MEDIDA de diseño (cuánto ancho aprovecha
#     cada página), no un banco de regresión.
#   · tools/test_nitidez.mjs      corre aquí y sale 0 — pero ese 0 NO ES UN
#     VEREDICTO. Cuenta los lienzos por debajo de la densidad de la pantalla,
#     los imprime, y termina con 0 pase lo que pase: su único `process.exit`
#     cubre el caso de que falte la dependencia. Es un INFORME con nombre de
#     banco. (Corrijo aquí mi propia nota de hace un rato, que decía «corre y
#     PASA»: leí el código de salida como si fuera un veredicto, que es el
#     cuarto corolario y la segunda vez que me pasa el mismo día.)
#     Para entrar en el portón le faltan dos cosas, no una: dar veredicto, y
#     no clavar la ruta `chromium_headless_shell-1194`, que es la de ESTE
#     contenedor y no la del runner. Además sirve cinco repos hermanos, así
#     que aquí solo mide las páginas de éste.
#
# La tabla no es decorativa: el guard de abajo exige que nombre a TODOS los
# `test_*` de fuera de `tests/`, y que cada uno siga existiendo. Así ni aparece
# uno nuevo en silencio ni sobrevive una excusa al fichero que excusaba.
declare -A FUERA_DEL_PORTON=(
  [tools/test_cartera_dwg.mjs]="carea contra el DWG; necesita el repo cobertura-zigbee al lado"
  [tools/test_ancho.mjs]="medida de diseño; necesita playwright-core y páginas de otros repos"
  [tools/test_nitidez.mjs]="informe sin veredicto (sale 0 siempre); además clava la ruta del navegador de este contenedor"
  [tools/test_pages_cronometro.mjs]="juzga la página PUBLICADA, no el árbol: sondea Pages hasta 10 min a que sirva este fichero. Lo lanza .github/workflows/pages.yml, aparte de la puerta, porque esa espera no se le cobra a cada PR"
)

mkdir -p "$LOGS"
rojo=0; verdes=0; total_checks=0; lista_rojos=""

# ── el servidor tiene que estar de verdad ────────────────────────────────
# Un arnés contra un puerto muerto falla por el entorno y se lee como
# regresión. Se comprueba ANTES y se declara.
if ! curl -sf -o /dev/null --max-time 5 "$BASE/index.html"; then
  echo "ROJO · no hay nada sirviendo en $BASE"
  echo "       levanta el repo:  python3 -m http.server 8099"
  exit 1
fi

# ── guard de los `test_*` de fuera del portón ────────────────────────────
# Las dos direcciones, como en la tabla de pisos: que no falte ninguno (uno sin
# declarar es un banco que nadie corre y nadie sabe que nadie corre) y que no
# sobre ninguno (una excusa que sobrevive a su fichero miente con autoridad).
for f in $(find . -name 'test_*.js' -o -name 'test_*.mjs' | sed 's|^\./||' | grep -v '^tests/' | grep -v node_modules | sort); do
  if [ -z "${FUERA_DEL_PORTON[$f]+x}" ]; then
    echo "ROJO · $f se llama test_* y NO lo corre el portón, y no está declarado"
    echo "       o lo mueves a tests/ con su piso, o lo apuntas en FUERA_DEL_PORTON con el motivo"
    exit 1
  fi
done
for f in "${!FUERA_DEL_PORTON[@]}"; do
  if [ ! -f "$f" ]; then
    echo "ROJO · declaración huérfana: $f ya no existe, borra su entrada"
    exit 1
  fi
  if [ -z "${FUERA_DEL_PORTON[$f]}" ]; then
    echo "ROJO · declarado sin motivo: $f"
    exit 1
  fi
done

# ── guard de zombis de la lista de exenciones (corolario 6) ──────────────
for e in "${!EXCLUIDOS[@]}"; do
  if [ ! -f "tests/$e" ]; then
    echo "ROJO · exención huérfana: tests/$e ya no existe, borra su entrada"
    exit 1
  fi
  if [ -z "${EXCLUIDOS[$e]}" ]; then
    echo "ROJO · exención sin motivo: $e"
    exit 1
  fi
done

for t in tests/test_*.js tests/test_*.mjs; do
  n="$(basename "$t")"
  [ -n "$PATRON" ] && [[ "$n" != *"$PATRON"* ]] && continue
  if [ -n "${EXCLUIDOS[$n]+x}" ]; then
    echo "EXENTO $n — ${EXCLUIDOS[$n]}"
    continue
  fi

  log="$LOGS/$n.log"
  ini=$(date +%s)
  timeout "$TIEMPO_MAX" node "$t" > "$log" 2>&1
  rc=$?
  seg=$(( $(date +%s) - ini ))

  # El veredicto se LEE. `|| true` porque grep -c devuelve 1 con cero líneas y
  # eso no es un fallo del arnés, es la ausencia de fallos.
  oks=$(grep -c '^OK   ' "$log" || true)
  fallos=$(grep -c '^FAIL ' "$log" || true)
  piso="${PISO[$n]:-1}"

  motivo=""
  [ "$rc" -ne 0 ] && motivo="salió con $rc"
  [ "$rc" -eq 124 ] && motivo="se pasó de $TIEMPO_MAX s"
  [ "$fallos" -gt 0 ] && motivo="${motivo:+$motivo · }$fallos comprobaciones en rojo"
  [ "$oks" -lt "$piso" ] && motivo="${motivo:+$motivo · }publicó $oks comprobaciones y el piso es $piso"

  total_checks=$(( total_checks + oks ))
  if [ -z "$motivo" ]; then
    verdes=$(( verdes + 1 ))
    printf 'OK   %-30s %4d comprobaciones · %ss\n' "$n" "$oks" "$seg"
  else
    rojo=1; lista_rojos="$lista_rojos $n"
    printf 'ROJO %-30s %s · %ss\n' "$n" "$motivo" "$seg"
    echo "     ── últimas líneas de $log ──"
    grep '^FAIL ' "$log" | head -5 | sed 's/^/     /'
    # 25 y no 3. Con 3 líneas, un arnés que revienta enseña el pie de la traza
    # —«}», vacío, «Node.js v22»— y ni una palabra del error: medido en la
    # tirada #2 de esta puerta, que dejó cuatro rojos ilegibles. El log entero
    # va en el artefacto, pero el que lee la consola tiene que poder empezar
    # por aquí.
    tail -25 "$log" | sed 's/^/     /'
  fi
done

echo
echo "$verdes arneses verdes · $total_checks comprobaciones leídas"
if [ "$rojo" -ne 0 ]; then
  echo "ROJOS:$lista_rojos"
  echo "(el veredicto sale del recuento leído, no del código de salida)"
  exit 1
fi
exit 0
