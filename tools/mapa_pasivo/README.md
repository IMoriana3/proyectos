# Mapa de ganancia del pasivo — cálculo en lote (NAS)

La pestaña **🗺 Mapa · pasivo vs activo** de `sim-viento.html` calcula en el navegador, pero con el
plan gratuito de Open-Meteo solo llega a unos 400 nodos al día. Esta carpeta calcula el mismo mapa
**a 0,25°** (España: 886 nodos) en el NAS, con ERA5 bajado de Copernicus, y deja un fichero que la
pestaña carga al instante desde el desplegable **«Mapas calculados en el NAS»**.

**Mismo motor, no una copia.** `calcula.js` lee `sim-viento.html` y ejecuta su bloque `LOC` tal cual.
`tests/test_mapa_lote.js` comprueba que cada nodo del lote da, al bit, lo mismo que la corrida de la
pestaña con la misma meteo.

| Fichero | Qué hace |
|---|---|
| `compose.yaml` | El contenedor para Container Manager. Corre una vez y se para. |
| `lanzar.sh` | El lote entero: baja el código, instala, descarga ERA5, calcula y (opcional) abre un PR. |
| `era5.py` | Descarga ERA5 del CDS y lo convierte a la forma de Open-Meteo, nodo a nodo. `python3 era5.py autoprueba` comprueba unidades, DNI y el ZIP del CDS. |
| `calcula.js` | Corre el motor de la ficha en cada nodo, con las cuatro estrategias a la vez, y rehace `data/mapas_pais/pasivo/indice.json`. |
| `config_defecto.json` | La configuración por defecto de la ficha (B2, 15 min, con ráfaga, suelta 90 km/h). |

## Una vez: la cuenta de Copernicus

1. Crea una cuenta gratuita en <https://cds.climate.copernicus.eu>.
2. Abre el conjunto **ERA5 hourly data on single levels**, pestaña *Download*, y acepta la licencia
   (CC-BY 4.0: uso comercial permitido citando la fuente).
3. En tu perfil copia el **Personal Access Token**. Esa es la `CDSAPI_KEY`.

No la pegues en el chat ni en el repositorio: va solo en el campo del contenedor.

## Opcional: que el NAS suba el mapa solo

Crea en GitHub un *fine-grained token* limitado al repositorio `IMoriana3/proyectos`, con permisos
**Contents: Read and write** y **Pull requests: Read and write**. Ese es el `GH_TOKEN`. Con él, al
terminar se abre un PR con el mapa; sin él, el mapa queda en la carpeta del NAS.

## Lanzarlo (interfaz del NAS, sin terminal)

1. **File Station** → crea la carpeta `docker/mapa-pasivo`.
2. Si quieres tu propia configuración (umbrales, suelta, nº de trackers…): pestaña Mapa →
   **Configuración para el NAS (JSON)** → sube ese fichero a `docker/mapa-pasivo` con el nombre
   `config.json`. Si no hay `config.json`, se usa la de por defecto.
3. **Container Manager → Proyecto → Crear**. Nombre `mapa-pasivo`, ruta `docker/mapa-pasivo`,
   «Crear docker-compose.yml» y pega `compose.yaml`. Rellena:
   - `CDSAPI_KEY` (obligatoria) y `GH_TOKEN` (opcional);
   - `PAISES` (`"ESP"`, `"ESP PRT"`…), `ANIOS` (`"2022"`, `"2021 2022 2023"`…), `PASO` (`0.25`);
   - `RAMA`: `main`; mientras el PR del lote no esté fusionado, `claude/mapa-pasivo-lote`.
4. Siguiente → Hecho. El contenedor arranca; lo que va haciendo sale en su **Registro**.

Para repetir con otra configuración o país: edita el proyecto y vuelve a **Iniciar**. ERA5 se queda
en `docker/mapa-pasivo/cache`, así que **cambiar umbrales o suelta no vuelve a descargar nada**: solo
la primera vez de cada país y año.

## Cuánto tarda y cuánto ocupa

- **Descarga**: 12 peticiones (una por mes) a la cola del CDS. Cada una puede esperar de minutos a
  horas según la carga de Copernicus. La caché ocupa del orden de 0,5–1,5 GB por país y año (el
  recuadro de España incluye Canarias, y por tanto mucho mar).
- **Cálculo**: ~0,3 s por nodo con las cuatro estrategias en un portátil; en el NAS, ~2–3 veces
  más. España a 0,25° ≈ 15 min.
- **Resultado**: `ESP_2022_0.25.json`, ~350 KB.

## Sin GH_TOKEN: subirlo a mano

En `docker/mapa-pasivo/resultados` quedan `ESP_2022_0.25.json` e `indice.json`. En GitHub, en
`data/mapas_pais/pasivo/` → *Add file* → *Upload files* → súbelos los dos en una rama nueva y abre el
PR.

## Lo que hay que saber del dato

- **0,25° es el detalle de ERA5.** Por eso el lote solo admite pasos múltiplos de 0,25°. Más fino
  solo interpolaría; para más detalle haría falta otra fuente (reanálisis regional o corrección con
  el Global Wind Atlas).
- La conversión de ERA5 es la de Open-Meteo: radiación media de la hora anterior, ráfaga `fg10`
  (máxima de la hora anterior), DNI con el sol a mitad de la hora y el cenit acotado a 85°. Puede
  diferir un poco de lo que da Open-Meteo para el mismo punto.
- Todo lo demás —suelta no medida, sin relieve fino, POA sin sombreado entre filas— es lo que ya
  declara `docs/viento.md`.
