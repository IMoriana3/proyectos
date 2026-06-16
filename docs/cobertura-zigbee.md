# Cobertura Zigbee — PSFV El Burgo I
### Herramientas para medir y visualizar la cobertura de la red Zigbee de seguidores (TCU) sobre gateways Digi ConnectPort

Este paquete mide la red Zigbee **que ya está desplegada** en la planta (no instala nada nuevo en campo) y la representa sobre el satélite: nivel de señal, nodos sin respuesta, fiabilidad del enlace, **saltos** de cada paquete y **criticidad** de cada nodo. Todo desde un PC Windows con red al gateway. No requiere instalar software (PowerShell ya viene en Windows).

---

## 1. Cómo funciona (arquitectura)

```
   ┌─────────────────────┐   HTTP (RCI, puerto 80)   ┌──────────────────┐
   │  zigbee_logger.ps1  │ ────────────────────────► │                  │
   │  (RSSI / estado)    │                           │  Digi ConnectPort│
   └─────────┬───────────┘                           │  X2  (coordinador│
             │ zigbee_log.csv                         │  Zigbee 2,4 GHz) │
             │                                        │                  │
   ┌─────────┴────────────────┐  telnet (puerto 23)   │  + 52 TCU + HSU  │
   │ zigbee_routes_logger.ps1 │ ────────────────────► │  (todos routers, │
   │  (rutas / saltos)        │                       │   malla)         │
   └─────────┬────────────────┘                       └──────────────────┘
             │ zigbee_routes.csv
             ▼
   ┌──────────────────────────────────┐
   │  cobertura_maquina_tiempo.html   │  ← cargas los CSV + las coordenadas
   │  (visor: mapa + máquina tiempo)  │
   └──────────────────────────────────┘
```

Dos recolectores escriben CSV; el visor (un solo archivo HTML que se abre en el navegador) los pinta sobre un mapa satélite.

---

## 2. Contenido del paquete

| Archivo | Qué es |
|---|---|
| `zigbee_logger.ps1` | Recolector de **RSSI / estado / ACK fallos** por HTTP (RCI). |
| `zigbee_routes_logger.ps1` | Recolector de **rutas (saltos)** por telnet. Autodescubre los nodos. |
| `cobertura_maquina_tiempo.html` | **Visor**: mapa satélite + línea de tiempo + modos de color. |
| `coords_ElBurgo_NCU1.csv` | Coordenadas de los 108 trackers de NCU-1 (`node_id, lat, lon`). |
| `README.md` | Este documento. |

---

## 3. Requisitos

- **PC con Windows** (PowerShell incluido; no hace falta instalar nada ni ser administrador).
- **Red hasta el gateway**: el PC debe llegar a la IP del ConnectPort (la misma que abres en el navegador para ver la "Network View").
- **Internet** en el PC: solo para que el visor descargue las **teselas del satélite**. Si no hay internet, el visor funciona igual pero sin fondo de mapa (los puntos y las rutas se ven; usa el modo *Local X/Y* si lo necesitas).

---

## 4. Configuración

Toda la configuración está **al principio de cada `.ps1`**, en el bloque `CONFIG`. Ábrelos con el Bloc de notas.

### 4.1 IP del gateway  *(lo más importante)*

- **`zigbee_logger.ps1`** → en `$Gateways`, campo `Host`:
  ```powershell
  $Gateways = @(
    @{ Name = "GW-01"; Host = "10.100.1.54"; User = ""; Pass = "" }
  )
  ```
- **`zigbee_routes_logger.ps1`** → en `$GwHost`:
  ```powershell
  $GwHost = "10.100.1.54"
  ```

### 4.2 Credenciales del gateway

- **RSSI (HTTP/RCI):** en El Burgo la RCI responde **sin login** → deja `User`/`Pass` vacíos. Si tu gateway pidiera login, rellénalos (en Digi antiguos por defecto **root / dbps**).
- **Rutas (telnet):** **siempre** requiere login. Pon en el script el usuario y la clave que usas al entrar por telnet:
  ```powershell
  $User = "root"
  $Pass = "dbps"
  ```

### 4.3 Nodos  *(no hay que listarlos: se autodescubren)*

Los **dos** recolectores **descubren los nodos solos** (hacen un *discover* Zigbee y se quedan con los que son `router` = los TCU/HSU). **No tienes que mantener ninguna lista de nodos.** Por eso, para apuntar a otro gateway o a otra planta, **basta con cambiar la IP**.

> Si por algún motivo quieres **fijar** nodos concretos en el logger de rutas (en vez de autodescubrir), rellena `$MacsManual` con sus direcciones MAC (con o sin `!` final). Si lo dejas vacío `@()`, autodescubre.

### 4.4 Intervalos

| Parámetro | Por defecto | Significado |
|---|---|---|
| `$IntervalSec` (RSSI) | `600` (10 min) | Cada cuánto se recorren todos los TCU pidiendo señal. |
| `$IntervalSec` (rutas) | `300` (5 min) | Cada cuánto se capturan todas las rutas. |
| `$DiscoverEverySec` | `3600` (1 h) | Cada cuánto se refresca el inventario de nodos. |

> **No bajes mucho los intervalos en producción:** cada ronda son decenas de consultas por radio y compiten con el tráfico de control de la NCU. Para una campaña real, 5–10 min está bien. Para una prueba rápida puedes bajarlo un rato.

### 4.5 Adaptarlo a otro gateway / otra planta

1. Cambia la **IP** (`$GwHost` / `Host`).
2. Pon las **credenciales** de ese gateway.
3. Las **coordenadas** son específicas de la planta: necesitarás un CSV `node_id, lat, lon` de esos trackers (ver §7).

En el logger de RSSI puedes vigilar **varios gateways a la vez** añadiendo filas a `$Gateways`:
```powershell
$Gateways = @(
  @{ Name = "GW-01"; Host = "10.100.1.54"; User = ""; Pass = "" }
  @{ Name = "GW-02"; Host = "10.100.1.55"; User = ""; Pass = "" }
)
```

---

## 5. Puesta en marcha (paso a paso)

1. **Copia los archivos** a una carpeta del PC (p.ej. `Descargas`).
2. **Edita** los dos `.ps1` (IP + credenciales, §4).
3. **Abre PowerShell en esa carpeta**: en el Explorador, sitúate en la carpeta, escribe `powershell` en la barra de direcciones y Enter (así PowerShell arranca ya en esa ruta).
4. **Lanza el recolector de RSSI**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\zigbee_logger.ps1
   ```
   Verás líneas como `GW-01: 53 nodos, 51 online, RSSI medio -72 dBm -> CSV`. Genera `zigbee_log.csv`.
5. **Lanza el recolector de rutas en OTRA ventana** de PowerShell:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\zigbee_routes_logger.ps1
   ```
   Verás `nodos descubiertos: 53` y luego `53/53 rutas, saltos medios 5,4 -> CSV`. Genera `zigbee_routes.csv`.
6. **Déjalos correr** el tiempo que quieras medir (ver §6).
7. **Abre `cobertura_maquina_tiempo.html`** en el navegador y carga los tres archivos (RSSI, coordenadas, rutas).

> Para parar cualquier recolector: **Ctrl+C** en su ventana. Los CSV quedan guardados con todo lo capturado hasta ese momento.

---

## 6. Cuándo y cuánto medir

- **Un día completo** para ver día/noche y distintas posiciones solares (las filas giran → cambia el multitrayecto y las rutas).
- **Captura un *stow*** (paneles en bandera): es el peor caso de cobertura entre filas y el momento más crítico para que llegue la orden. **Anota la hora del stow** para localizarla luego en la línea de tiempo.
- Las **rutas son dinámicas**: la malla se reorganiza sola. Por eso el logger de rutas va en bucle; con varias capturas, el visor te deja ver cómo cambia la topología en el tiempo.

---

## 7. El visor

Ábrelo en el navegador. Para probarlo sin datos reales, pulsa **"Datos de ejemplo"**.

**Carga de archivos** (botones de la izquierda):
- **Cargar registro** → `zigbee_log.csv`
- **Cargar coordenadas** → `coords_ElBurgo_NCU1.csv`
- **Cargar rutas** → `zigbee_routes.csv`

**Línea de tiempo (abajo):** ▶ play, paso a paso, barra para arrastrar, velocidad 1–8×, bucle. La **tira roja** muestra *cuándo* hubo nodos sin respuesta; clic en ella para saltar a ese momento. (Teclado: espacio = play, flechas = paso.)

**Modos de color (selector "Colorear por"):**

| Modo | Qué muestra | Para qué sirve |
|---|---|---|
| **RSSI** | Nivel del **último salto** | Referencia. En malla **despista** (ver §8). |
| **Estado** | Online / sin respuesta | **Tu mapa de cobertura real**: puntos muertos. |
| **ACK fallos** | Retransmisiones por intervalo (Δ) | Enlaces frágiles aunque el RSSI parezca bueno. |
| **Saltos** | Profundidad al coordinador | Nodos al final de cadenas largas (frágiles). |
| **Criticidad** | Cuántos nodos dependen de cada uno | **Puntos únicos de fallo** (relés clave). |

**Rutas (topología):**
- Clic en cualquier TCU → dibuja su **cadena completa** de saltos hasta el gateway.
- Casilla **"Dibujar todas las rutas"** → la malla entera.
- Botón **"Situar gateway (NCU)"** → púlsalo y haz **clic en el mapa sobre el sitio real de la NCU**; así las líneas salen de ahí. El marcador se puede arrastrar.

La **lista lateral** se adapta al modo (peores por RSSI, más profundos por saltos, más críticos en criticidad). Clic en un nodo de la lista → vuela a él y resalta su ruta.

---

## 8. Cómo interpretar (importante)

La red es una **malla** donde **todos los TCU son routers** y repiten. Consecuencias:

- **El RSSI NO es el mapa de cobertura.** Es el nivel del *último salto* al vecino, no la distancia al coordinador. Un TCU lejano puede salir "fuerte" porque habla con un router cercano. (Ejemplo real: TCU_063 sale a −61 dBm "excelente", pero está a **9–10 saltos** del coordinador.)
- **La cobertura real la dan:** `Estado` (online/offline = hay ruta o no) y `ACK fallos` (enlace que retransmite mucho = frágil).
- **Los saltos** miden la fragilidad de la ruta (más saltos = más latencia y más probabilidad de fallo en cadena).
- **La criticidad** de un nodo = *cuántos otros TCU dependen de él* para llegar al coordinador (cuántas rutas pasan por él como salto intermedio). Los pocos vecinos directos del coordinador cargan subárboles enteros: **si uno cae, deja sin ruta a todos los que cuelgan detrás**. Son los candidatos a reforzar o a poner un repetidor al lado.

**Flujo de diagnóstico sugerido:** modo **Criticidad** para localizar los relés que sostienen la red → modo **Saltos** para ver qué nodos están peligrosamente profundos → modo **Estado/ACK** a lo largo del tiempo (y durante el stow) para ver dónde y cuándo se pierde cobertura de verdad.

---

## 9. Formato de los CSV

**`zigbee_log.csv`** (una fila por TCU y por ronda):
```
timestamp, gateway, node_id, role, ext_addr, online, rssi_dbm, ack_failures, supply_mv, temp_c, net_addr
```
- `online` = 1/0 (0 = no respondió = enlace caído). `rssi_dbm` ya viene negativo (p.ej. −61).

**`zigbee_routes.csv`** (una fila por TCU y por captura):
```
timestamp, target, hop_count, path_ids, path_addrs
```
- `hop_count` = nº de saltos del coordinador al nodo.
- `path_ids` = cadena de node_id separada por `>` (p.ej. `COORD>TCU_SUNNER_ID_062>...>TCU_SUNNER_ID_063`).
- `path_addrs` = lo mismo con direcciones de red de 16 bits.

**`coords_ElBurgo_NCU1.csv`**:
```
node_id, lat, lon, etiqueta
```
- `etiqueta` = nomenclatura física `1.X.Y` (NCU.string.tracker), para referencia.

---

## 10. Las coordenadas (cómo se generaron y cómo regenerarlas)

El archivo de coordenadas se obtuvo a partir del listado de la planta (UTM huso 30N, ETRS89) **convertido a lat/lon**, asociando cada posición a su `TCU_SUNNER_ID`.

> **Hipótesis del mapeo:** el número SUNNER (057…108) se asignó siguiendo el orden de los strings de la nomenclatura `1.X.Y`. Validado parcialmente: este gateway cubre la mitad **este** de NCU-1 (strings 10-18, IDs 57-108) y el otro gateway la oeste. Si en el mapa ves un TCU concreto que **no** cae donde debe, el mapeo necesita corregirse con la tabla real `TCU_SUNNER_ID ↔ 1.X.Y` (hoja de comisionado / config de la NCU / listado del SCADA).

El visor empareja por `node_id` exacto **y** por el número de tracker extraído del `node_id` (`TCU_SUNNER_ID_063` → 63), así que admite también un CSV cuya columna de ID sea solo el número.

---

## 11. Solución de problemas

**"...no existe. Proporcione la ruta de acceso a un archivo .ps1 existente"**
PowerShell no está en la carpeta del script. Haz `cd $HOME\Downloads` (o donde lo tengas) antes de lanzarlo, o abre PowerShell desde la barra de direcciones del Explorador en esa carpeta.

**El archivo se llama `...ps1.txt`**
El navegador añadió `.txt`. Renómbralo: `Rename-Item .\zigbee_logger.ps1.txt zigbee_logger.ps1`.

**El logger de rutas no logra entrar (telnet)**
Pon `$Debug = $true`, relánzalo y mira lo que imprime tras `[prompt login]` / `[prompt pass]`. Ajusta `$User`, `$Pass`, y si hace falta `$Prompt`, `$LoginRe`, `$PassRe` a lo que muestre tu gateway.

**SSH no conecta ("No supported authentication methods")**
Es normal: el SSH viejo del ConnectPort no se entiende con clientes modernos. Usa **telnet** (que es lo que hace el script).

**El satélite no carga (mapa gris) pero los puntos sí**
El PC no llega a las teselas (firewall). El visor sigue siendo útil; los puntos, rutas y colores se ven igual.

**No aparece el CSV nada más arrancar**
Se escribe **al terminar cada ronda completa**, no al instante. La primera ronda puede tardar 1–2 min (y más si algún nodo no responde, porque cada timeout son varios segundos). Espera a ver la línea `-> CSV`.

**Copiar/pegar en una consola telnet (PuTTY) no va con Ctrl+V**
En PuTTY se pega con **clic derecho** (o Shift+Insert). (Nota: para la captura automática **no necesitas PuTTY**; el logger de rutas hace el telnet solo.)

---

## 12. Notas técnicas

- **Gateway:** Digi **ConnectPort X2**, XBee ZB **2,4 GHz, canal 14**. Coordinador + 52 TCU + 1 HSU (todos `router` → malla pura).
- **RSSI/estado:** vía **RCI** (API XML de Digi por HTTP, `POST /UE/rci`): `discover` (inventario) + `query_state` (radio: rssi, ack_failures, etc.).
- **Rutas:** vía **CLI por telnet** (`xbee source_route <MAC>`), porque la RCI por HTTP **no** expone las rutas. El gateway las conoce gracias al **source routing / many-to-one** activo en la malla.
- A 2,4 GHz el alcance es menor y la penetración peor que en sub-GHz; le afectan el WiFi y el metal de las filas. Por eso la topología y los saltos importan tanto.

---

## 13. Limitaciones y posibles mejoras

- Las **rutas son una foto** del momento de cada captura; el bucle continuo permite verlas evolucionar, pero entre capturas pueden cambiar.
- La RCI por HTTP no da los saltos; se obtienen por la CLI (telnet). No hay forma sencilla de leerlos sin la consola del gateway.
- El **mapeo de IDs** lleva una hipótesis (§10). Conviene validarla con un TCU conocido antes de sacar conclusiones de la posición exacta.
- Posible siguiente paso: marcar en el visor qué rutas son **estables** y cuáles **bailan** entre capturas (fiabilidad de la topología).
```
