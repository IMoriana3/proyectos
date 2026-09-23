// EL ÚLTIMO SALTO: ¿LA PÁGINA PUBLICADA TIENE EL CRONÓMETRO, Y FUNCIONA?
//
// Todo lo demás de este repo se prueba sobre el árbol: `tests/correr.sh` sirve
// los ficheros en :8099 y cuarenta y cinco arneses los interrogan. Eso deja un
// tramo sin mirar, y es el único que el usuario toca:
//
//     main verde ──✅──> pages-build-deployment ──✅──> ¿lo sirve Pages?
//                                                        └── NADIE MIRA
//
// No es una pega de rigor. El 2026-09-23, al fusionar el cronómetro (#498), su
// despliegue de Pages salió **`cancelled`**: llevaba seis minutos en cola
// cuando entró la #499 y el suyo lo adelantó. Aquel día no se perdió nada
// —`01c4ab7` es ancestro de `15e7b47` y el fichero es el mismo byte a byte, se
// verificó— pero el modo de fallo quedó a la vista: **el despliegue de un
// commit puede no ocurrir nunca y todos los checks del commit siguen verdes**,
// porque ninguno mira lo publicado.
//
// QUÉ PREGUNTA CONTESTA, que no es la de los otros arneses: lo que se juzga
// aquí no es la física del cronómetro —eso lo hace `tests/test_viento_latencia
// .js` sobre el árbol, con 71 comprobaciones y ocho mutantes— sino la ENTREGA:
// que el fichero que Pages sirve sea ESTE, y que el cronómetro de esa página
// mida de verdad.
//
// POR QUÉ NO ENTRA EN EL PORTÓN, y va declarado en `FUERA_DEL_PORTON`: el
// portón corre en cada empujón y Pages va por detrás de `main` unos minutos
// después de cada merge. Exigírselo ahí lo pondría rojo justo al publicar, por
// un retardo que no es un defecto — el mismo razonamiento que
// `tests/test_versiones_app.mjs` ya escribió para el careo de versiones. Aquí
// el retardo se ESPERA: se sondea hasta `PAGES_ESPERA_S` y solo si al cabo de
// ese plazo Pages sigue sin servir este fichero se pone rojo. Lo lanza
// `.github/workflows/pages.yml`.
//
// EL CAREO ES POR SHA-256 DEL FICHERO, no por número de versión, y eso no es
// comodidad: `sim-viento.html` **no declara ninguna versión legible** —está
// anotado en `tests/README.md`, su tarjeta del Panel dice `1.26` y esa cadena
// no aparece en el fichero— así que no hay número que comparar. El hash del
// cuerpo servido contra el del árbol es exacto y no depende de que nadie se
// acuerde de subir nada.
//
// LO QUE ESTE ARNÉS NO PUDO EJERCITAR DONDE SE ESCRIBIÓ, y va dicho: el proxy
// de salida de esa máquina deniega `imoriana3.github.io:443` con
// `connect_rejected` (403 del gateway a CONNECT), así que la lectura contra
// Pages REAL no se ha corrido nunca allí. Lo que sí se ejercitó es todo lo
// demás, y a propósito: la regla es una función pura con su batería, el sondeo
// corre contra un TRANSPORTE DE MENTIRA, y el navegador se condujo contra los
// bytes que GitHub publica de `main` —traídos por `raw.githubusercontent.com`,
// que sí es alcanzable— servidos desde un directorio limpio. Queda sin
// ejercitar el `fetch` a `github.io` y nada más.
//
//   node tools/test_pages_cronometro.mjs
//   PAGES_BASE=http://localhost:8111 PAGES_ESPERA_S=0 node tools/…   (en local)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');
const require = createRequire(import.meta.url);

const PAGES = (process.env.PAGES_BASE || 'https://imoriana3.github.io/proyectos')
  .replace(/\/+$/, '');
const FICHA = 'sim-viento.html';
const ESPERA_S = process.env.PAGES_ESPERA_S == null ? 600 : +process.env.PAGES_ESPERA_S;
const INTERVALO_S = +(process.env.PAGES_INTERVALO_S || 20);

let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };
const sha = txt => crypto.createHash('sha256').update(txt).digest('hex');

// ══════════════════════════════════════════════════════════════════
//  LA REGLA, PURA
// ══════════════════════════════════════════════════════════════════
// Cuatro estados, y los cuatro se tratan distinto. Colapsar dos de ellos es
// justo lo que convierte este arnés en un adorno:
//
//   al_dia        Pages sirve ESTE fichero            -> se conduce y se juzga
//   retardo       sirve OTRO cuerpo (el de antes)     -> se espera; al agotar
//                                                        el plazo, ROJO: el
//                                                        despliegue no llegó
//   no_publicado  responde pero no está el fichero    -> ROJO, y es otro bug
//   sin_respuesta no contesta / error de red          -> ROJO, pero dice que
//                                                        es de red y no del
//                                                        contenido
export function veredicto({ estado, cuerpo, shaLocal }) {
  if (estado === 'red') return 'sin_respuesta';
  if (estado === 404) return 'no_publicado';
  if (estado !== 200) return 'sin_respuesta';
  return sha(cuerpo) === shaLocal ? 'al_dia' : 'retardo';
}

/* EL SONDEO, con el transporte y el reloj INYECTADOS. No es puritanismo: el
   caso que hay que poder ejercitar —«Pages tarda y acaba llegando»— no se
   puede provocar contra el servicio real, y el caso «no llega nunca» tardaría
   diez minutos por ejecución. Con el transporte de mentira los cinco casos
   corren en milisegundos y se pueden poner rojos a mano. */
export async function esperaAlDia({ traer, shaLocal, esperaS, intervaloS, duerme }) {
  const t0 = 0;
  let t = t0, intentos = 0, ultimo = null;
  for (;;) {
    intentos++;
    const r = await traer();
    ultimo = veredicto({ ...r, shaLocal });
    if (ultimo === 'al_dia') return { estado: 'al_dia', intentos, cuerpo: r.cuerpo };
    // Un 404 no mejora esperando: el fichero no está publicado, y reintentar
    // diez minutos sobre eso solo retrasa el diagnóstico.
    if (ultimo === 'no_publicado') return { estado: ultimo, intentos, cuerpo: null };
    if (t + intervaloS > esperaS) return { estado: ultimo, intentos, cuerpo: r.cuerpo || null };
    await duerme(intervaloS);
    t += intervaloS;
  }
}

// ── la batería de la regla, sin red ──
// El control positivo del propio careo va primero: si el hash no distinguiera
// dos cuerpos, los cuatro estados de abajo colapsarían en uno y todo saldría
// «al día» sin mirar nada.
check('control · el careo por sha distingue dos cuerpos distintos',
      sha('<html>a</html>') !== sha('<html>b</html>'));
check('control · y el mismo cuerpo da el mismo sha',
      sha('<html>a</html>') === sha('<html>a</html>'));

const SHA_A = sha('nuevo');
check('regla · sirve ESTE fichero -> al_dia',
      veredicto({ estado: 200, cuerpo: 'nuevo', shaLocal: SHA_A }) === 'al_dia');
check('regla · sirve OTRO cuerpo -> retardo',
      veredicto({ estado: 200, cuerpo: 'viejo', shaLocal: SHA_A }) === 'retardo');
check('regla · 404 -> no_publicado, que NO es lo mismo que un retardo',
      veredicto({ estado: 404, cuerpo: '', shaLocal: SHA_A }) === 'no_publicado');
check('regla · sin respuesta -> sin_respuesta, y se dice que es de red',
      veredicto({ estado: 'red', cuerpo: null, shaLocal: SHA_A }) === 'sin_respuesta');
check('regla · un 500 no se lee como contenido',
      veredicto({ estado: 500, cuerpo: 'boom', shaLocal: SHA_A }) === 'sin_respuesta');

const dormir0 = async () => {};
const guion = respuestas => { let i = 0; return async () => respuestas[Math.min(i++, respuestas.length - 1)]; };

check('sondeo · si ya está al día, un solo intento',
      (await esperaAlDia({ traer: guion([{ estado: 200, cuerpo: 'nuevo' }]),
        shaLocal: SHA_A, esperaS: 600, intervaloS: 20, duerme: dormir0 })).intentos === 1);

const tarde = await esperaAlDia({
  traer: guion([{ estado: 200, cuerpo: 'viejo' }, { estado: 200, cuerpo: 'viejo' },
                { estado: 200, cuerpo: 'nuevo' }]),
  shaLocal: SHA_A, esperaS: 600, intervaloS: 20, duerme: dormir0 });
check('sondeo · si Pages tarda y acaba llegando, se espera y sale al_dia',
      tarde.estado === 'al_dia' && tarde.intentos === 3,
      tarde.estado + ' en ' + tarde.intentos);

const nunca = await esperaAlDia({
  traer: guion([{ estado: 200, cuerpo: 'viejo' }]),
  shaLocal: SHA_A, esperaS: 60, intervaloS: 20, duerme: dormir0 });
check('sondeo · si NO llega en el plazo, se agota y queda en retardo',
      nunca.estado === 'retardo' && nunca.intentos === 4,
      nunca.estado + ' en ' + nunca.intentos);

check('sondeo · un 404 NO se reintenta: no mejora esperando',
      (await esperaAlDia({ traer: guion([{ estado: 404, cuerpo: '' }]),
        shaLocal: SHA_A, esperaS: 600, intervaloS: 20, duerme: dormir0 })).intentos === 1);

check('sondeo · con plazo CERO se mira una vez y se contesta',
      (await esperaAlDia({ traer: guion([{ estado: 200, cuerpo: 'viejo' }]),
        shaLocal: SHA_A, esperaS: 0, intervaloS: 20, duerme: dormir0 })).intentos === 1);

// ══════════════════════════════════════════════════════════════════
//  CONTRA PAGES DE VERDAD
// ══════════════════════════════════════════════════════════════════
const local = fs.readFileSync(path.join(RAIZ, FICHA), 'utf8');
const shaLocal = sha(local);
// `local.length` son CARACTERES, no bytes: el fichero tiene acentos y
// `readFileSync(…, 'utf8')` devuelve una cadena. Se rotula como lo que es —
// 337.242 caracteres y 341.487 bytes no son el mismo número, y poner «B» al
// lado del primero es una afirmación falsa en la traza de un banco. El careo
// no se ve afectado: las dos partes se comparan YA DECODIFICADAS.
console.log('     ── el fichero de este árbol: ' + shaLocal.slice(0, 12) +
            ' · ' + local.length + ' caracteres');
console.log('     ── se sondea ' + PAGES + '/' + FICHA +
            ' hasta ' + ESPERA_S + ' s, cada ' + INTERVALO_S + ' s');

async function traeDePages() {
  try {
    const r = await fetch(PAGES + '/' + FICHA, { cache: 'no-store' });
    if (!r.ok) return { estado: r.status, cuerpo: null };
    return { estado: 200, cuerpo: await r.text() };
  } catch (e) {
    console.log('     ── no responde: ' + String(e.message || e));
    return { estado: 'red', cuerpo: null };
  }
}

const R = await esperaAlDia({
  traer: traeDePages, shaLocal, esperaS: ESPERA_S, intervaloS: INTERVALO_S,
  duerme: s => new Promise(res => setTimeout(res, s * 1000)),
});
console.log('     ── ' + R.estado + ' tras ' + R.intentos +
            (R.intentos === 1 ? ' intento' : ' intentos') +
            (R.cuerpo ? ' · publicado ' + sha(R.cuerpo).slice(0, 12) : ''));

check('Pages sirve el MISMO fichero que este árbol', R.estado === 'al_dia',
      R.estado === 'retardo'
        ? 'sigue sirviendo otro cuerpo tras ' + ESPERA_S + ' s: el despliegue no llegó'
        : R.estado === 'no_publicado'
          ? 'responde pero no publica ' + FICHA
          : 'no contesta (red o política de salida de esta máquina)');

if (R.estado === 'al_dia') {
  // EL CRONÓMETRO, CONDUCIDO EN LA PÁGINA PUBLICADA. Lo que se exige aquí es
  // lo mismo que `tests/test_viento_latencia.js` exige sobre el árbol, pero
  // reducido a lo que de verdad demuestra que la pieza LLEGÓ viva: que los
  // instantes vayan en orden y que el total sea MAYOR que el recorrido del
  // hierro. Si fueran iguales, la cadena no estaría entrando y el cronómetro
  // sería la calculadora de `|Δθ|/0,17` que la tarjeta ya hacía antes.
  const { chromium } = require('playwright');
  const { EXEC } = require('../tests/pw_navegador.js');
  const browser = await chromium.launch({ executablePath: EXEC });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  try {
    await page.goto(PAGES + '/' + FICHA, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#run', { timeout: 30000 });

    check('la página publicada trae la cadena de latencia entera',
          await page.evaluate(() =>
            ['mediaMovil', 'rejilla', 'retardo', 'vientoVisto', 'ordenEnElEje',
             'cadenaViva', 'latenciaViva'].every(k => typeof LOC[k] === 'function')));
    check('y el cronómetro tiene su sitio en el panel en vivo',
          await page.evaluate(() => !!document.getElementById('cronoBox')));
    check('y los cuatro parámetros de la cadena se pueden teclear',
          await page.evaluate(() =>
            ['lat_on', 'latVent', 'latMues', 'latSond', 'latArr']
              .every(i => !!document.getElementById(i))));

    await page.evaluate(() => {
      document.getElementById('lat_on').checked = true;
      document.getElementById('latVent').value = '300';
      document.getElementById('latMues').value = '60';
      document.getElementById('latSond').value = '60';
      document.getElementById('latArr').value = '30';
      latUI();
      document.getElementById('lSpeed').value = '900';
    });
    await page.click('#lPlay');
    await page.evaluate(() => {
      const v = document.getElementById('lV');
      v.value = '95'; v.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Se espera al ESTADO y no al rótulo: «en posición» es el nombre de la
    // fila y está escrito desde el primer fotograma. Esperarlo devolvería el
    // control con la maniobra en vuelo — el mismo error que ya costó una
    // vuelta escribiendo el banco del árbol.
    await page.waitForFunction(() =>
      window.LIVE && LIVE.crono && LIVE.crono.fase === 'hecha', null, { timeout: 60000 });
    const C = await page.evaluate(() => {
      const D = LIVE.crono.ultima;
      const S = Object.keys(D.por)[0], p = D.por[S];
      return { S, det: D.tVe - D.t0, lle: p.tLle - D.t0, fin: p.tFin - D.t0,
               recorrido: Math.abs(LIVE.ordenEje[S] || 0) / LOC.SLEW,
               txt: document.getElementById('cronoBox').innerText };
    });
    console.log('     ── medido EN PAGES · ve +' + C.det + ' s · orden +' + C.lle +
                ' s · en posición +' + C.fin + ' s (recorrido puro ' +
                Math.round(C.recorrido) + ' s)');

    check('el cronómetro de la página publicada MIDE una maniobra entera',
          C.fin > 0, JSON.stringify(C));
    check('los instantes van en orden: se ve, llega, para',
          C.det >= 0 && C.lle > C.det && C.fin > C.lle,
          [C.det, C.lle, C.fin].join(' < '));
    check('y el total es MAYOR que el recorrido del hierro a 0,17 °/s',
          C.fin > C.recorrido * 1.05,
          C.fin + ' s vs ' + Math.round(C.recorrido) + ' s');
    check('la detección no es instantánea: la media y el muestreo cuestan',
          C.det > 0, C.det);
    check('ninguna excepción en la página publicada', errores.length === 0,
          errores.join(' · '));
  } finally {
    await browser.close();
  }
}

console.log('\n' + ok + ' OK · ' + ko + ' FAIL');
process.exit(ko ? 1 : 0);
