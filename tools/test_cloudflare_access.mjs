// Control EXTERNO sin credenciales: una web privada nunca debe servir
// HTML, scripts ni datos a un visitante que no haya pasado Cloudflare Access.
//
// Esto comprueba una condición NECESARIA de seguridad, no toda la política:
// un 403 genérico puede venir de otro firewall y no se acepta como prueba de
// Access. Un 200 indica exposición; un 302 al login de Access es el esperado.
// Para comprobar el contenido y la física hay que entrar con identidad propia
// o configurar un token de servicio explícito para un banco autenticado.
import assert from 'node:assert/strict';

const BASE = process.env.PAGES_BASE || 'https://panel-im3.pages.dev';
const PREVIEW = process.env.PAGES_PREVIEW_BASE || '';
const RUTAS = [
  '/', '/index.html', '/sim-viento.html', '/generador-layout.html',
  '/comparador-estructuras.html', '/cartera-tabla.html', '/meteo.html',
  '/docs/viento.md', '/lib/three.min.js', '/data/cec-modulos.json',
];

export function redirigeAAccess(estado, location, urlSolicitada) {
  if (![301, 302, 303, 307, 308].includes(estado) || !location) return false;
  let destino;
  try { destino = new URL(location, urlSolicitada); }
  catch { return false; }
  return destino.protocol === 'https:' && (
    destino.hostname.endsWith('.cloudflareaccess.com') ||
    (destino.origin === new URL(urlSolicitada).origin &&
     destino.pathname.startsWith('/cdn-cgi/access/'))
  );
}

// La pequeña batería de control evita falsos verdes por una detección trivial.
function comprobarRegla() {
  const u = 'https://panel-im3.pages.dev/sim-viento.html';
  assert.equal(redirigeAAccess(302, 'https://equipo.cloudflareaccess.com/cdn-cgi/access/login/a', u), true);
  assert.equal(redirigeAAccess(302, '/cdn-cgi/access/login/a', u), true);
  assert.equal(redirigeAAccess(200, '', u), false);
  assert.equal(redirigeAAccess(302, 'https://otro.example/login', u), false);
  assert.equal(redirigeAAccess(403, '', u), false);
  console.log('OK  regla de detección del login Access');
}

async function revisar(base, rutas) {
  const host = new URL(base);
  if (host.protocol !== 'https:') throw new Error('Solo se admiten URLs HTTPS');
  const raiz = host.href.endsWith('/') ? host.href : host.href + '/';
  let errores = 0;
  for (const ruta of rutas) {
    const url = new URL(ruta.replace(/^\/+/, ''), raiz);
    try {
      const r = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'cache-control': 'no-store' },
        signal: AbortSignal.timeout(15000),
      });
      const location = r.headers.get('location') || '';
      const correcto = redirigeAAccess(r.status, location, url);
      console.log((correcto ? 'OK  ' : 'FAIL') + ' ' + r.status + ' ' + url.pathname
        + (correcto ? ' → login Access' : ' → sin prueba válida de Access'));
      if (!correcto) errores++;
    } catch (e) {
      console.log('FAIL red ' + url.pathname + ': ' + (e.message || e));
      errores++;
    }
  }
  return errores;
}

comprobarRegla();
if (process.argv.includes('--self-test')) {
  console.log('Autocomprobaciones correctas.');
} else {
  let errores = await revisar(BASE, RUTAS);
  if (PREVIEW) {
    // Una preview concreta se obtiene de Cloudflare Deployments.
    // No se inventa una URL ni se da por protegida sin una prueba.
    errores += await revisar(PREVIEW, ['/','/sim-viento.html']);
  } else {
    console.log('PENDIENTE: preview no verificada (PAGES_PREVIEW_BASE sin configurar).');
  }
  console.log(errores ? 'FAIL: ' + errores + ' accesos sin protección comprobable.'
                      : 'OK: producción exige login en todas las rutas sondeadas.');
  process.exitCode = errores ? 1 : 0;
}
