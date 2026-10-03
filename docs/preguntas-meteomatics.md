# Preguntas para Meteomatics — granizo y viento previo

> Cada pregunta lleva **por qué** la hacemos. Un proveedor contesta mejor cuando
> sabe qué decisión depende de su respuesta, y nosotros podemos juzgar si la
> respuesta sirve. Los números vienen de la estrategia de defensa ya definida
> (umbrales de 60 y 30 min, 40 y 60 km/h) y del simulador de planta.

---

## 1 · El tamaño del granizo: resolución y error

**El caso que motiva la pregunta.** Nuestro criterio de activación es el de VDE
Americas: granizo severo de **≥19 mm**. El episodio de referencia con el que
trabajamos tiene **16 mm**. Son **3 mm** de diferencia, y toda la decisión
—abanderar o no— cuelga de ellos.

1. ¿Con qué **resolución** entregáis el tamaño máximo previsto? ¿Es un valor
   continuo o viene en intervalos (5 mm, 10 mm)? Si es en intervalos, ¿cuáles?
2. ¿Qué **error de verificación** tiene frente a observación, y **por banda de
   tamaño**? Nos interesa específicamente la banda 10–25 mm, no el error medio
   global: el error medio de una variable que casi siempre vale cero no dice nada
   sobre los casos que importan.
3. **La pregunta decisiva:** ¿podéis distinguir 16 mm de 19 mm? Si el error
   típico es de ±3 mm o más, nuestro umbral de 19 mm está **dentro del ruido** y
   tendríamos que replantearlo —o pasar a decidir por probabilidad en vez de por
   valor central.
4. ¿El tamaño que dais es un **valor central (P50)**, el **máximo del conjunto de
   escenarios**, o el de un único escenario determinista? Cambia por completo
   cómo hay que leer un «19 mm».
5. ¿Sobre qué **área** está definido ese máximo? ¿La celda de malla, un radio
   alrededor del punto, la trayectoria de la célula? Un máximo sobre 10×10 km no
   es lo mismo que sobre la huella de la planta.

## 2 · Probabilidad de superar un tamaño

**Por qué.** VDE no dice «19 mm», dice «**≥30 % de probabilidad** de granizo
severo de al menos 19 mm». Eso es una probabilidad **de ese tamaño**, no de
tormenta. Hoy nuestro sistema sólo tiene probabilidad de tormenta, que es una
magnitud distinta y mucho más frecuente: aplicarle el 30 % de VDE aflojaría el
disparo en vez de apretarlo. Es el hueco declarado que queremos cerrar con
vosotros.

6. ¿Podéis entregar **P(granizo ≥ X mm)** directamente, para X = 10, 19 y 25 mm?
7. ¿Está **calibrada**? Es decir: de los casos en que decís 30 %, ¿ocurre en
   torno al 30 %? Si tenéis diagrama de fiabilidad para esta variable, nos vale.
8. ¿Sobre qué **área y ventana temporal** está definida esa probabilidad?
   Un 30 % en 1 h sobre una celda de malla y un 30 % en 6 h sobre una comarca son
   criterios operativos muy distintos.

## 3 · Antelación, actualización y latencia

**Por qué.** Nuestra estrategia decide por **tiempos**: maniobra completa si el
granizo está a ≥60 min, maniobra reducida si el viento puede pasar de 40 km/h en
<30 min. Esos márgenes sólo valen si el dato llega antes y es fiable a esa
antelación.

9. ¿Con cuánta **antelación** dais una señal utilizable de granizo, y **cómo
    crece el error con la antelación**? Un dato a 3 h con error de ±10 mm no
    sirve para un umbral de 19.
10. ¿Cada cuánto se **actualiza**?
11. ¿Cuánta **latencia** hay entre la observación/pasada del modelo y el momento
    en que podemos leerlo por API? Es tiempo que se come nuestro margen.
12. ¿Dais **trayectoria y tiempo de llegada** de la célula, o nos dais posición y
    velocidad y lo calculamos nosotros a partir de actualizaciones sucesivas?
13. ¿Qué **resolución espacial y temporal** tiene la reflectividad de radar y la
    posición de la célula?

## 4 · El viento previo, que es lo que puede impedir la maniobra

**Por qué.** El reparto entre «maniobra completa cruzando por 0°» y «al extremo
más cercano» depende de si el viento pasa de 40 km/h antes o después de 30 min.
Y el recorrido completo de extremo a extremo son **110°**, que a 0,17 °/s son
**11,1 minutos** incluyendo el sondeo y el arranque del motor. O sea que el
margen real que necesitamos es de ese orden, y los 30 min son colchón para el
error de la previsión: cuánto colchón hace falta **lo dice vuestro error**.

14. ¿Con qué antelación y con qué error predecís el **cruce de un umbral de
    viento** (40 y 60 km/h en nuestro caso), tanto sostenido como **racha**?
15. ¿A qué **altura** está referido el viento que entregáis, y con qué perfil se
    lleva a la altura del anemómetro de planta (8,0 m)?
16. ¿Hay **sesgo conocido** en rachas? Un sesgo bajo en rachas es peligroso para
    nosotros en un sentido concreto: nos haría empezar a cruzar por 0° creyendo
    que tenemos margen.

## 5 · P50 / P90 y escenarios

17. ¿La previsión sale de **un escenario** o de un **conjunto** de escenarios?
18. Si dais percentiles, ¿cómo definís exactamente P50 y P90, y sobre qué
    distribución —escenarios del conjunto, climatología, error de verificación?
19. ¿Podéis dar valor **central y conservador** para las variables que nos
    importan (tamaño de granizo, viento sostenido, racha)?

## 6 · El indicador de calidad del dato

**Por qué.** El §19 del informe pide un parámetro `calidad_minima` —el único enum de
los diecisiete— para descartar muestras por debajo de un nivel de calidad. No hemos
encontrado que publiquéis un indicador así, y sin vocabulario definido no podemos
ponerle valor: inventarnos un `"buena"` sería crear un enum contra el que luego se
escribe código.

20. ¿Entregáis algún **indicador de calidad, confianza o disponibilidad por muestra**
    —no del producto en general, sino de cada dato devuelto—? Si sí, ¿con qué
    **valores posibles** y qué significa cada uno?
21. Si no existe tal indicador, ¿hay alguna otra forma de distinguir un dato
    **modelado con confianza** de uno **rellenado o interpolado**? Nos sirve incluso
    una marca binaria.

Si la respuesta es que no existe, para nosotros no es un problema: la admisión de la
muestra se apoya en lo comprobable por nuestra parte (que el campo exista, sea
numérico, esté en rango físico y no pase de la edad máxima) y lo que no pase es «sin
dato», que ya escala de forma conservadora. Pero entonces `calidad_minima` pasa a ser
un **parámetro que el informe pide y el proveedor no puede alimentar**, y eso tiene
que constar como hueco del informe y no como tarea pendiente nuestra.

---

## Lo que haremos con las respuestas

- Con **1 y 2** fijamos el umbral de activación: si el error en la banda 10–25 mm
  lo permite, se queda en 19 mm; si no, pasamos a decidir por P(≥19 mm) con el
  30 % de VDE.
- Con **3** comprobamos que la antelación cubre los 60 y 30 minutos de la
  estrategia, y cuánta latencia hay que descontarles.
- Con **4** decidimos si los 30 minutos de colchón sobran o faltan, contra los
  11,1 minutos que tarda la maniobra completa.
- Con **5** decidimos si operamos sobre el valor central o sobre el conservador.
- Con **6** cerramos o enterramos `calidad_minima`, que hoy es el único de los
  diecisiete parámetros del §19 que no está esperando un número sino un vocabulario.

## Lo que ya hemos decidido por nuestra parte

Para que la reunión no empiece en blanco: `frecuencia_consulta_s` = 300 s,
`timeout_api_s` = 30 s, `buffer_espacial_km` = 48 km (adoptando VDE), y
provisionalmente `edad_max_dato_s` = 5.400 s y `horizonte_vigilancia_h` = 6 h. Los dos
provisionales **se recalculan con vuestras respuestas**: el primero es 1,5 × vuestro
refresco, y el segundo lo acota vuestro error con la antelación. Están razonados en
`docs/valores-planta.md`.
