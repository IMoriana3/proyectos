# Careo de las dos carteras · 2026-10-22

Qué tiene cada cartera que la otra no, medido con los dos volcados de ese día, y
qué se decidió. Los volcados **no se suben** —uno sale del `localStorage` de un
navegador y el otro de detrás de un login—; se citan por su huella:

| volcado | sha256 |
|---|---|
| `SEED_20261022.js` (cartera técnica, botón ⬇ SEED) | `c5736f16034563f5c69d091cc27a879871ff146c64ab0c4f6ccc4e9f3bfcdf84` |
| `cartera_2026-10-22.csv` (cartera de Supabase, botón ⬇ CSV) | `99b3c7eaedd1feb9cd4fb7f66e61685be183f22a02112aba9a82e9b222997241` |

Se reproduce con:

```
node tools/careo_carteras.mjs --tecnica SEED_20261022.js --supabase cartera_2026-10-22.csv
```

## Lo que contesta la pregunta: no se pierde ninguna planta

Las **22** plantas de la cartera técnica están todas en Supabase. Supabase tiene
**10 más** que la técnica no conoce, entre ellas **Conselice** (`26094`) — la
planta que el comentario de `cartera-tabla.html` citaba como existente sólo en un
navegador. Ya está en Supabase, así que esa víctima está recuperada.

## Lo único que vive SÓLO en la cartera técnica: tres celdas

| planta | campo | valor en la técnica | en Supabase |
|---|---|---|---|
| `24002` El Burgo I | `garantia` | `true` | el campo no viene en la fila |
| `25004` Benante | `anem_total` | `4` | el campo no viene en la fila |
| `25004.2` Panbianco | `anem_total` | `6` | el campo no viene en la fila |

### Por qué son sólo tres, que es lo que no cuadra a primera vista

De las 21 plantas careadas por 51 campos —1071 celdas—:

| | celdas | |
|---|---|---|
| dicen lo mismo | 570 · 53,2 % | |
| no dicen nada ninguna de las dos | 321 · 30,0 % | vacías, o un «no» que es lo mismo |
| sólo lo dice Supabase | 138 · 12,9 % | se **ganan** al quedarse con ella |
| no coinciden | 39 · 3,6 % | hay que decidir |
| **sólo lo dice la técnica** | **3 · 0,3 %** | lo único en riesgo |

Más las **10 plantas que sólo existen en Supabase**, con sus datos enteros.

La técnica *parece* tener mucho más: `garantia` rellena en 16 plantas y las cinco
fases en unas 15 cada una. Pero esos valores son `false` y «Sin empezar», que
significan lo mismo que vacío — no son información, son la ausencia de ella
escrita. Donde la técnica dice algo de verdad (`true`, `Terminado`), Supabase
dice lo mismo. Así que la técnica es **casi un subconjunto** de la otra.

> Un recuento hecho con «la celda no está vacía» en vez de «la celda dice algo»
> daba **94** celdas en riesgo en lugar de 3, contando cada `false` y cada «Sin
> empezar» como un dato. El careo tenía razón y el recuento no: cuando un
> recuento contradice al instrumento que valida, el sospechoso es el recuento.

**Por qué se perderían:** no es que Supabase tenga otro valor — es que **no tiene
el campo**. Y no lo ha perdido hace poco: el export de la propia cartera de
Supabase del 9 de septiembre (`Gemelo-digital/datos/cartera_20260909.csv`) ya
venía sin ellos. Seis semanas igual.

De Benante y Panbianco, Supabase tampoco tiene `anem_veleta` ni `anem_us`, así
que de los anemómetros de esas dos plantas no sabe nada. Si se borra la técnica
sin copiar estas tres celdas, el dato deja de existir en ningún sitio.

## Decidido: las coordenadas las manda la cartera técnica

En Supabase hay **dos pares de plantas compartiendo un mismo punto**, lo que no
puede ser cierto de las dos a la vez. La técnica les da puntos distintos.

```
25004    Benante     lat 37.3755148   lon 14.9043744     (Supabase: 37.3728 / 14.8976)
25004.2  Panbianco   lat 37.3710751   lon 14.8910762     (Supabase: 37.3728 / 14.8976)
```

Las dos llevan ese punto compartido desde al menos el 9 de septiembre, y están
separadas ~1,5 km entre sí según la técnica.

**El otro par no se puede resolver así:** `24021` Túnez y `26322` Túnez también
comparten punto, pero `26322` **no existe en la cartera técnica**, así que no hay
de dónde cogerlo. Necesita una coordenada de verdad.

### Pendiente de decidir: dos plantas más que discrepan sin compartir punto

| planta | distancia | técnica | Supabase |
|---|---|---|---|
| `24019` San José | 644 m | `-16.59577 / -71.80644` | `-16.600313 / -71.802688` |
| `24025` Ayora | 587 m | `39.11821 / -1.15985` | `39.121531 / -1.154563` |

No entran en la decisión de arriba porque no es el caso del punto colapsado: aquí
simplemente no coinciden. San José importa para el trabajo de RF del NCU 18.

Otras dos discrepan por debajo de 60 m (`24002` El Burgo I, 50 m; `24007` Fayón,
58 m), que puede ser sólo precisión del origen.

> **Las coordenadas se comparan en METROS, no en relativo.** La primera versión
> del clasificador usó una tolerancia relativa de `1e-4` y metió estas plantas en
> la cesta de «redondeo»: sobre una latitud de 41° eso son ~450 m. Normalizar con
> la magnitud equivocada aquí se paga en que el gemelo y los simuladores apuntan a
> otro sitio.

## Chichaoua: sin Nº y con lat/lon cambiadas

La fila de `Chichaoua` en Supabase trae **26 campos con dato y ningún Nº**, así
que no se puede emparejar con nada. Y sus coordenadas están intercambiadas:

```
como está:   lat -8.7666666666667   lon 31.533333333333     -> cae en Tanzania
cambiadas:   lat 31.533333333333    lon -8.7666666666667    -> cae en Marruecos
```

Confirmado por el usuario. Hacen falta las dos cosas: el Nº y el intercambio.

## Las fechas de PEM de Túnez: RESUELTO — manda Supabase

**La PEM de Túnez duró 4 días** (confirmado por el usuario, 2026-10-22). O sea
que el bueno es `2026-02-06` → `2026-02-10`, el de Supabase, y **la cartera
técnica es la que tiene el día y el mes cambiados**. Como la cartera que se
conserva es la de Supabase, aquí no hay nada que tocar: basta con no arrastrar
la versión de la técnica.

Se deja escrito debajo lo que se intentó para decidirlo con los datos y por qué
no bastó, porque el próximo desacuerdo de fechas se va a parecer a éste.

### Lo que NO sirvió para decidirlo

```
inicio_pem    técnica 2026-06-02     Supabase 2026-02-06
final_pem     técnica 2026-10-02     Supabase 2026-02-10
```

Una es el día y el mes cambiados de la otra. Qué se intentó para decidirlo y por
qué no sirve:

* **`duracion_pem` no arbitra.** Vale `3` en los dos lados, y no cuadra con el
  intervalo en NINGUNA planta bajo ninguna unidad: Fayón intervalo 0 días con
  duración 1, Túnez 4 con 3, Bagnarelli 2 con 3, Ayora 31 con 20. Es un campo
  escrito a mano, independiente de las fechas.
* **El CSV del 9-sep del gemelo no arbitra.** Parecía una tercera fuente, pero
  tiene 53 columnas y las etiquetas de `factiun-cartera` («Potencia DC (MWp)»,
  «Cantidad módulos», «Checklist PEM»): es un export **de la propia cartera de
  Supabase**. Sólo prueba que Supabase lleva con `2026-02-06` sin cambios desde
  entonces, no que sea el bueno.
* **`estado_pem` vale «En marcha» en los dos**, compatible con cualquiera de las
  dos lecturas.

Lo que queda es una pregunta de hecho que no está en ningún fichero: **¿la PEM de
Túnez fue en febrero (4 días) o de junio a octubre (122 días)?**

Como la cartera que se conserva es la de Supabase, si el bueno es febrero no hay
nada que tocar: basta con no arrastrar la versión de la técnica.

> Nota sobre un formato que **no** es un fallo: Ayora tiene las fechas como
> `03/08/2026`, con barras, mientras las demás van en ISO. La aplicación las lee
> bien —`fechaPEM()`, línea 449, toma el primer grupo como DÍA—. Lo que las leía
> al revés era un script de análisis de esta sesión, que usaba `Date.parse` y ésa
> sí aplica el orden americano. El fallo era del análisis, no de la aplicación.

## Lo demás que discrepa, por cestas

De 39 celdas en desacuerdo, la mayoría no es un conflicto:

| cesta | nº | qué es |
|---|---|---|
| redondeo | 16 | `pdc` con menos decimales en Supabase |
| renombrado | 7 | `Stringpowered` → `String`, cambio hecho a propósito el 2026-09-08 y documentado en `factiun-cartera` |
| coordenadas | 6 | arriba |
| cuentas | 7 | abajo |
| fechas | 2 | arriba |
| texto | 1 | un salto de línea de más en el `string` de El polvorin |

### Siete cuentas que no cuadran y hay que decidir

| planta | campo | técnica | Supabase |
|---|---|---|---|
| `24021` Túnez | `pdc` | `0.7448` | `0.9408` |
| `24021` Túnez | `cantidad` | `1064` | `1344` |
| `24025` Ayora | `anem_total` | `10` | `8` |
| `24025` Ayora | `anem_us` | `10` | `8` |
| `25019` Paramo | `pdc` | `0` | `11.48736` |
| `25004` Benante | `trk_total` | `730` | `653` |
| `25004.2` Panbianco | `trk_total` | `1476` | `1311` |

`25019` Paramo es el caso fácil: un `0` no es una medida de potencia, es un hueco
sin rellenar. Los otros seis son dos cuentas distintas del mismo equipo y una de
las dos está mal.

## Un Nº con varias filas no es un duplicado

El `24024` trae **tres filas** en Supabase —`Alconadre · Sodeto`,
`· San Miguel` y `· Peralta de Alcofea`—, cada una con 19 campos y coordenadas
propias. Son tres emplazamientos de un mismo proyecto, no basura.

La primera versión de la herramienta indexaba por código sobrescribiendo, así que
se quedaba con la última fila y comparaba la planta contra una sola: de ahí salían
**seis celdas «vacías en Supabase» que no existían** —el careo decía 9 celdas en
riesgo cuando son 3—. Un colapso silencioso de la clave convierte un «no puedo
comparar esto» en una afirmación falsa, y además en la dirección más cara.

Arreglado: ahora se agrupan, se declaran, y esas plantas no se carean celda a
celda. Lo que haría falta para poder carearlas es una clave que distinga el
emplazamiento, no sólo el proyecto.

## Antes de borrar la cartera técnica

1. Copiar las **tres celdas** de arriba a Supabase.
2. Aplicar las **coordenadas de Benante y Panbianco**.
3. Arreglar **Chichaoua**: Nº y el intercambio de lat/lon.
4. Decidir **San José y Ayora**, las **siete cuentas** y las **fechas de Túnez**.
5. Y lo que no es dato: la técnica hace dos trabajos que nadie más hace —publica
   `factiun_plantas`, que leen diez páginas de dos repositorios, y es la dueña de
   `NPROY`. Quien la sustituya tiene que heredarlos.

Nada de esto lo puede hacer esta sesión: no hay credenciales de escritura en
Supabase.
