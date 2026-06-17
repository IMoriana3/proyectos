# Cartera de plantas — Factiun

> Dashboard **interno** de los proyectos de seguidores adjudicados: KPIs, gráficas, mapa y tabla editable, con login. Datos en Supabase.

## Qué es
App web de un solo fichero (`index.html`) que muestra la cartera de plantas FV adjudicadas de Factiun como **dashboard** (KPIs + gráficas + mapa) y **tabla editable** (añadir / editar / borrar). Los datos viven en **Supabase** (Postgres) con **login** y reglas de seguridad (RLS): solo usuarios autenticados ven/editan. No incluye la hoja de IPs/credenciales del Excel.

## Funcionalidades
- **KPIs**: nº de plantas, potencia DC (MWp), trackers, países y estado del pipeline.
- **Gráficas** (Chart.js, reaccionan a los filtros): estado del pipeline por MWp (donut), MWp por país, MWp por **EPC** y Top 10 plantas.
- **Mapa mundi** (Leaflet): una burbuja por país dimensionada por MWp; clic en un país = filtra el dashboard.
- **Tabla** con todas las columnas (toggle "Todas las columnas"), búsqueda, filtros (país/estado/promotor) y orden.
- **CRUD**: añadir/editar/borrar plantas; se guarda en Supabase al instante. Columnas auto-detectadas del esquema.

## Stack
HTML/CSS/JS sin framework (un único `index.html`) · **Supabase** (Postgres + Auth + RLS) · **Chart.js** · **Leaflet** · `@supabase/supabase-js`. Sin build.

## Puesta en marcha
Paso a paso completo (Supabase + hosting en Cloudflare) en **[`INSTRUCCIONES.md`](INSTRUCCIONES.md)**. Resumen:
1. **Supabase**: crear proyecto → SQL Editor → ejecutar `cartera_supabase.sql` → crear usuarios (Authentication) → copiar *Project URL* + *anon key* en `index.html`.
2. **Hosting**: quitar el SQL del repo → renombrar la app a `index.html` → **Cloudflare Workers** (*Connect to Git* + `wrangler.toml` con `[assets]`, deploy `npx wrangler deploy`) → URL `*.workers.dev`. Cada `git push` redespliega.
3. Poner esa URL en la tarjeta del Panel de Proyectos.

## Seguridad
- Repo **privado**. El **shell** (`index.html`) **no contiene datos**; los datos viven en **Supabase** con **RLS** (solo usuarios autenticados leen/escriben) + login.
- La **anon key** es **pública por diseño**; no da acceso a los datos sin login.
- ⚠️ **`cartera_supabase.sql` NO debe servirse en un hosting público** (lleva los datos): mantenlo **fuera** del directorio que se publica.
- **No** incluye la hoja de **IPs/credenciales** del Excel (se trata aparte).

## Despliegue (URL)
**https://factiun-cartera.imoriana3.workers.dev** · interno · requiere login (Supabase). Hospedado en **Cloudflare Workers** (static assets, gratis, desde repo privado). Detalle en `INSTRUCCIONES.md`.

## Notas
- Para regenerar esquema/datos desde el Excel: `gen_sql.py` → `cartera_supabase.sql`.
- Las columnas se auto-detectan: si añades una columna en Supabase, aparece sola en la app.

*Factiun · proyecto interno.*

---

# Cartera de plantas — Instrucciones (montaje, despliegue y operación)

Guía completa y detallada para montar, desplegar y mantener la **Cartera de plantas**.
Cubre **Supabase** (base de datos + login) y **Cloudflare Workers** (hosting).
Primera puesta en marcha: ~20-25 min. Este documento describe **el montaje real que está en producción**.

URL en producción: **https://factiun-cartera.imoriana3.workers.dev**

---

## 0. Arquitectura en 30 segundos

```
  Navegador               Cloudflare Workers              Supabase
  ┌─────────┐  HTTPS   ┌──────────────────────┐   API   ┌──────────────────┐
  │ index.  │ ───────► │ static assets:       │ ◄─────► │ Postgres + Auth  │
  │ html    │          │ sirve index.html     │  login  │ tabla `plantas`  │
  │ (shell) │ ◄─────── │ (el "shell", sin     │   +     │ + RLS (reglas)   │
  └─────────┘          │  datos)              │   RLS   │ 49 cols · 22 filas│
       │               └──────────────────────┘         └──────────────────┘
       │                                                          ▲
       └───────────  login email+contraseña + lectura/escritura  ┘
                     (el navegador habla directo con Supabase)
```

Tres piezas, cada una con un papel claro:

| Pieza | Qué hace | Qué NO hace |
|---|---|---|
| **`index.html`** (Cloudflare) | La interfaz: tablas, gráficas, mapa, formularios. Es el "shell". | **No guarda datos.** Solo pinta lo que Supabase le devuelve. |
| **Supabase** | Base de datos (Postgres), **login** (email+contraseña) y **RLS** (reglas que solo dejan ver/editar a usuarios con sesión). | No sirve la web. |
| **Cloudflare Workers** | Hosting estático gratis: publica `index.html` y da la URL `*.workers.dev`. Cada `git push` redespliega. | No ve los datos (van cifrados navegador↔Supabase). |

**Idea clave:** el shell puede ser público porque **sin iniciar sesión en Supabase no se ve ni un dato**. La seguridad la dan el **login + las reglas RLS**, no esconder el HTML.

---

## 1. Supabase — base de datos + login

### 1.1. Crear el proyecto
1. Entra en **[supabase.com](https://supabase.com)** → *Start your project* (plan gratis) → **New project**.
2. Rellena:
   - **Name**: p. ej. `factiun-cartera`.
   - **Database Password**: genera una y **guárdala** (la usarás si conectas por SQL externo; no va en la app).
   - **Region**: **Europe (West) · eu-west-1** (más cerca = más rápido).
3. **Create new project**. Tarda ~2 min en aprovisionar.

### 1.2. Cargar esquema + datos
1. Menú izquierdo → **SQL Editor** → **+ New query**.
2. Abre `cartera_supabase.sql` en tu PC, copia **todo** el contenido y pégalo en el editor.
3. Pulsa **Run** (▶ o `Ctrl/Cmd+Enter`).
4. Resultado esperado: **`Success. No rows returned`** ← es lo correcto (la última sentencia es un `INSERT`, no un `SELECT`, por eso no devuelve filas).

Esto crea de una vez:
- la tabla **`plantas`** con sus **49 columnas** (code, proyecto, empl, prov, país, promotor, **epc**, responsable, mwac, mwdc, trackers, tech, inversor, estado, …),
- las **4 reglas RLS** (ver 1.6),
- las **22 plantas** adjudicadas.

> Para comprobarlo: menú → **Table Editor** → tabla `plantas` → deberías ver 22 filas.

### 1.3. Crear usuarios (login)
El login **email + contraseña** ya viene activo por defecto. Solo hay que dar de alta a la gente:
1. Menú → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Pon **email** + **contraseña** + marca **Auto Confirm User** (para que no haga falta verificar por correo).
3. Repite por cada persona del equipo.

> Para quitarle el acceso a alguien: **Authentication → Users →** los tres puntos → **Delete user**.

### 1.4. Copiar las credenciales (Project URL + anon key)
La app necesita **2 valores** de Supabase. Dónde están exactamente (la UI ha cambiado de sitio alguna vez):

- **Project URL** → **Project Settings (⚙️, abajo izq.)** → **API** → campo **Project URL**
  (formato `https://xxxxxxxx.supabase.co`).
  *Atajo si no lo encuentras:* también aparece en **Settings → Data API → Project URL**.
- **anon / public key** → mismo sitio, **Project Settings → API** → sección **Project API keys** → clave **`anon` `public`**
  (en proyectos nuevos se llama **Publishable key** y empieza por `sb_publishable_…`; es la equivalente).

> ⚠️ **Copia solo la `anon`/`Publishable`.** **NUNCA** copies la `service_role` ni ninguna `sb_secret_…`: esas saltan la seguridad y **no deben ir jamás en el navegador**.

### 1.5. Pegar las credenciales en `index.html`
Abre `index.html` con un editor de texto y rellena estas dos líneas (están al principio del `<script>`):
```js
const SUPABASE_URL      = "https://xxxxxxxx.supabase.co";   // ← tu Project URL
const SUPABASE_ANON_KEY = "sb_publishable_xxx...";          // ← tu anon / Publishable key
```
Guarda. (Comprobación local: abre `index.html` con doble clic, inicia sesión y deberías ver el dashboard — funciona en local porque el login es email+contraseña, sin redirecciones.)

### 1.6. Qué hace la seguridad (RLS) — para entenderlo
El SQL deja la tabla con **RLS activado** (Row Level Security) y **4 políticas**, todas con la misma regla: *"solo si hay usuario autenticado"*.

| Política | Operación | Quién puede |
|---|---|---|
| `auth_select` | leer (SELECT) | usuarios con sesión |
| `auth_insert` | crear (INSERT) | usuarios con sesión |
| `auth_update` | editar (UPDATE) | usuarios con sesión |
| `auth_delete` | borrar (DELETE) | usuarios con sesión |

Consecuencia: alguien sin login que llame a la API con la `anon key` **no obtiene ninguna fila**. Por eso la clave `anon` puede ir en el HTML público sin riesgo.

---

## 2. Cloudflare Workers — hosting (el montaje real)

> Cloudflare unificó *Pages* dentro de *Workers*. Esta cartera se sirve como **"Workers static assets"**: un Worker que, gracias a `wrangler.toml`, publica los ficheros estáticos del repo. **Así es como está montado y funcionando.**

### 2.1. Seguridad ANTES de publicar (imprescindible)
Con la configuración `directory = "./"` (ver 2.2), **Cloudflare sirve TODO lo que haya en la raíz del repo**. Por tanto, en el repo solo debe haber ficheros públicos:

- ✅ **Renombra** la app a **`index.html`** (si la subiste como `cartera-editable.html`). Sin un `index.html` en la raíz, la URL da **404**.
- ✅ **Borra del repo** **`cartera_supabase.sql`**: lleva los datos comerciales y, al estar en la raíz, se serviría en `…/cartera_supabase.sql`. Guárdalo en tu PC (ya lo ejecutaste en Supabase). *(Ya está hecho.)*
- ✅ En la raíz deja solo: **`index.html`**, **`favicon.svg`**, **`wrangler.toml`**. (`README.md` / `INSTRUCCIONES.md` también son públicos si están en la raíz; no llevan secretos, pero ver el recuadro de abajo si prefieres que no se sirvan.)

> 💡 **Patrón más limpio (recomendado):** mete solo `index.html` + `favicon.svg` en una subcarpeta `public/` y pon `directory = "./public"` en `wrangler.toml`. Así **solo** se publican esos dos ficheros y el resto (SQL guardado aparte, docs, scripts) **nunca** se sirve, aunque estén en el repo. El montaje actual `directory = "./"` también es seguro **siempre que en la raíz solo haya ficheros públicos**.

### 2.2. `wrangler.toml` (qué es y qué contiene)
Es el fichero que le dice a Cloudflare *"esto no es un Worker con código, es un sitio estático"*. Está en la raíz del repo:
```toml
name = "factiun-cartera"            # nombre del Worker → subdominio factiun-cartera.*.workers.dev
compatibility_date = "2025-01-01"

[assets]
directory = "./"                    # carpeta a publicar (./ = raíz). Recomendado: "./public"
```
Sin el bloque `[assets]`, Cloudflare esperaría código de Worker y fallaría.

### 2.3. Crear el Worker conectado a GitHub
1. Entra en **[dash.cloudflare.com](https://dash.cloudflare.com)** (cuenta gratis).
2. Izquierda → **Workers & Pages** → **Create** → **Workers** → **Import a repository** / **Connect to Git**.
3. Autoriza **GitHub** y elige el repo **`factiun-cartera`** (privado, no pasa nada).
4. En la configuración de build:
   - **Build command**: *(vacío)* — no hay que compilar nada.
   - **Deploy command**: **`npx wrangler deploy`** ← este es el que publica.
   - (Branch de producción: `main` o la que uses.)
5. **Save and Deploy**.

### 2.4. Resultado
- En ~1 min tienes la URL pública: **https://factiun-cartera.imoriana3.workers.dev**
- **Cada `git push`** al repo dispara un **redeploy automático** (build → `npx wrangler deploy`). No hay que tocar nada más.
- Para ver despliegues/logs: **Workers & Pages → factiun-cartera → Deployments**.

> 🔁 **Despliegue manual desde tu PC** (alternativa sin Git): instala Node, en la carpeta del repo ejecuta `npx wrangler login` una vez y luego `npx wrangler deploy`. Sube exactamente lo mismo.

---

## 3. Enlazar desde el Panel de Proyectos

**Ya está hecho.** En el repo `proyectos` → `index.html` → array `PROJECTS` → tarjeta **"Cartera de plantas"**:
```js
url: "https://factiun-cartera.imoriana3.workers.dev",
```
Resultado: Panel → tarjeta **"Cartera de plantas"** → **Abrir** → login de Supabase → dashboard.

---

## 4. Seguridad — cómo queda protegido (resumen)

- **Repo `factiun-cartera` privado.**
- El **SQL con datos NO se sirve** (lo quitaste del repo; vive en tu PC + dentro de Supabase).
- Los **datos viven en Supabase con RLS**: sin login no se lee/escribe nada. El shell público solo enseña la pantalla de acceso.
- La **`anon`/Publishable key es pública por diseño** (va en apps de navegador). La seguridad la dan **login + RLS**, no ocultar la clave. La `service_role` **nunca** se usa aquí.
- Con `directory="./"`, **todo lo de la raíz del repo es público** → mantener ahí solo ficheros sin secretos (o usar `./public`, ver 2.1).
- **No** se incluye la hoja de **IPs/credenciales** del Excel (Anydesk/VPN/etc.): es operativa interna y **nunca** va a web ni a repo.
- *(Capa extra opcional)* **Cloudflare Access** (login por email/PIN) delante de toda la plataforma: envolvería también esta cartera con un segundo control de acceso.

---

## 5. Operación y mantenimiento

| Tarea | Cómo |
|---|---|
| Editar / añadir / borrar plantas | En la app (botón **Editar** / **＋ Nueva planta**), o en Supabase → **Table Editor** (como una hoja de cálculo). Se guarda al instante. |
| Añadir usuarios | Supabase → **Authentication → Users → Add user**. |
| Quitar acceso a alguien | Supabase → **Authentication → Users → Delete user**. |
| Añadir una columna | Supabase → **Table Editor → +**. La app la **auto-detecta** (aparece sola con el toggle "Todas las columnas"). |
| Cambiar / rotar la anon key | Supabase → **Project Settings → API** → actualizar el valor en `index.html` y `git push` (redespliega solo). |
| Regenerar todo desde el Excel | `python3 gen_sql.py` → nuevo `cartera_supabase.sql` → re-ejecutar en SQL Editor. **Ojo: hace `drop + recreate`, borra ediciones hechas a mano en Supabase.** |
| Publicar un cambio del HTML | `git push` al repo → Cloudflare redespliega en ~1 min. (O `npx wrangler deploy` en local.) |

---

## 6. Resolución de problemas (lo que ya nos pasó)

| Síntoma | Causa | Solución |
|---|---|---|
| La URL raíz da **404** | No hay `index.html` en la raíz del repo (estaba como `cartera-editable.html`). | Renombrar el fichero a **`index.html`** y `git push`. |
| `…/cartera_supabase.sql` se descargaba | Con `directory="./"` se sirve **todo** lo de la raíz. | **Borrar el SQL del repo** (o mover los ficheros públicos a `./public`). |
| En el SQL Editor sale "Success. No rows returned" | Normal: la última sentencia es un `INSERT`. | No es error. Comprobar en **Table Editor** que hay 22 filas. |
| "No encuentro la Project URL" | Supabase la movió de sitio. | **Project Settings → API → Project URL** (o **Settings → Data API**). |
| Inicio sesión y no veo datos / "permission denied" | El usuario no existe en **Auth**, o RLS sin sesión. | Crear el usuario en **Authentication → Users**; asegurarse de iniciar sesión en la app. |
| "Faltan columnas" en la tabla | La vista por defecto muestra un subconjunto. | Activar el toggle **"Todas las columnas"** (muestra las 49). |

---

## 7. Ficheros del proyecto

| Fichero | Para qué | ¿Se publica? |
|---|---|---|
| **`index.html`** | La app (dashboard editable). | **Sí** (es lo único imprescindible servir). |
| **`favicon.svg`** | Icono Factiun. | Sí. |
| **`wrangler.toml`** | Config de Cloudflare (sirve los estáticos). | Lo lee Cloudflare; inocuo. |
| **`cartera_supabase.sql`** | Esquema (49 cols) + RLS + 22 plantas. | **NO** — lleva datos. Guardar en local/privado, fuera del directorio servido. |
| **`gen_sql.py`** | Regenera el SQL desde `Plantas_fotovoltaicas_trackers.xlsx`. | No (mantener fuera del directorio servido). |
| **`README.md`** | Visión general. | Opcional. |
| **`INSTRUCCIONES.md`** | Este documento. | Opcional. |

*Factiun · proyecto interno.*
