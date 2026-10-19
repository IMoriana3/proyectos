#!/usr/bin/env bash
# Prepara solo los ficheros de la web para Cloudflare Pages.
# Los fuentes privados de CI, herramientas, pruebas y auditorias no se publican.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

OUT="dist"
if [[ ! -s index.html || ! -s manifest.webmanifest || ! -s sw.js ]]; then
  echo "Faltan ficheros obligatorios de la web." >&2
  exit 1
fi

rm -rf -- "$OUT"
mkdir -p "$OUT"

# Fail-closed: durante la primera conexion GitHub -> Pages no se publica
# el panel (ni datos/docs) hasta comprobar Access en el DOMINIO DE PRODUCCION.
# El flag se configura en Variables and Secrets de Pages y solo tras validar
# el login en ventana privada. No comprueba Access por si mismo.
cat > "$OUT/_headers" <<'HEADERS'
/*
  X-Robots-Tag: noindex, nofollow, noarchive
HEADERS

if [[ "${FACTIUN_PAGES_ACCESS_CONFIRMED:-0}" != "1" ]]; then
  cat > "$OUT/index.html" <<'HTML'
<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Sitio en configuración</title>
<body style="font:16px system-ui;background:#0e1826;color:#dce3eb;padding:2rem">
<h1>Sitio en configuración</h1>
<p>La aplicación todavía no se ha publicado.</p>
</body></html>
HTML
  cp "$OUT/index.html" "$OUT/404.html"
  echo "Cloudflare Pages: solo pagina de mantenimiento (sin datos internos)."
  echo "Validar Access y establecer FACTIUN_PAGES_ACCESS_CONFIRMED=1 para publicar."
  exit 0
fi

mkdir -p "$OUT/docs"
shopt -s nullglob

# Publicar únicamente las páginas y scripts necesarios del nivel raíz.
for file in *.html *.js *.mjs *.css *.json *.svg *.webmanifest *.wasm *.csv; do
  cp -- "$file" "$OUT/"
done

# Recursos consumidos por los simuladores y la portada.
for dir in assets data lib; do
  if [[ -d "$dir" ]]; then
    cp -R -- "$dir" "$OUT/"
  fi
done

# El visor interno de documentación solo consulta docs/<docId>.md.
# No se exportan scripts ni docs/audit ni subdirectorios de desarrollo.
for doc in docs/*.md; do
  cp -- "$doc" "$OUT/docs/"
done

# La portada tenía cuatro enlaces a GitHub Pages, ya no disponible.
# Usar rutas relativas permite Pages, dominios propios y vista local.
sed -i 's#https://imoriana3.github.io/proyectos/#./#g' "$OUT/index.html"

# El nuevo origen de Cloudflare tiene raíz / en vez de /proyectos/.
sed -i 's#"id": "/proyectos/"#"id": "/"#' "$OUT/manifest.webmanifest"

# Sin este archivo, Pages puede responder con la portada a URLs inexistentes.
# El portal es multi-HTML, no una SPA con rutas virtuales.
cat > "$OUT/404.html" <<'HTML'
<!doctype html>
<html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>No encontrado · Factiun</title>
<body style="font:16px system-ui;background:#0e1826;color:#dce3eb;padding:2rem">
  <h1>Página no encontrada</h1><p>La ruta solicitada no existe en este portal.</p>
  <p><a href="./" style="color:#f09030">Volver al panel</a></p>
</body></html>
HTML

# Comprobación mínima: los HTML esperados existen y ninguna carpeta
# exclusiva del repositorio acaba sirviéndose como recurso web.
for required in index.html sim-viento.html cartera-tabla.html generador-layout.html                 comparador-estructuras.html manifest.webmanifest sw.js; do
  [[ -s "$OUT/$required" ]] || { echo "Falta $required en $OUT" >&2; exit 1; }
done
for blocked in .github tests tools prompts docs/audit; do
  [[ ! -e "$OUT/$blocked" ]] || { echo "No se debe publicar $blocked" >&2; exit 1; }
done

echo "Cloudflare Pages: salida preparada en $OUT/"
echo "Atencion: proteger el dominio *.pages.dev con Cloudflare Access."
