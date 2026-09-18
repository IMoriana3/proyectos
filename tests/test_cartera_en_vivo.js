// LA CARTERA EN VIVO — el Panel leyendo la base en vez del buzón.
//
// `factiun_plantas` es un BUZÓN: lo escribe `cartera-tabla.html` al guardar, así que solo tiene lo
// que hubiera la última vez que alguien abrió esa página EN ESTE navegador. La fuente es la base de
// la cartera, y para leerla hay que entrar: sus políticas son `to authenticated` y sin sesión la
// consulta no falla, devuelve CERO FILAS.
//
// QUÉ SE PRUEBA AQUÍ Y QUÉ NO. Aquí se prueba MI código: cuándo se carga la librería, qué manda
// sobre qué, y que cada final diga la verdad. La librería de Supabase se sustituye por una de
// mentira —inyectada antes de que corra la página— porque no hay credenciales que meter en un
// banco, y porque un banco que dependiera de una cuenta real se pondría rojo el día que cambie una
// contraseña. Lo que NO se prueba aquí es que la cuenta de verdad vea las filas de verdad: eso solo
// se comprueba entrando, y queda dicho.
//
// Los tres finales van por separado a propósito: se arreglan de tres maneras distintas.
//   sin sesión          → hay que entrar
//   sesión y cero filas → se entró, pero esa cuenta no ve esa tabla
//   sin red             → ni se llegó
//
//   python3 -m http.server 8099       # servir el repo (en otra terminal)
//   node tests/test_cartera_en_vivo.js
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');   // dónde está el chromium, en un solo sitio
const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
};

/* Lo que devolvería la base. OJO a los nombres: en la base son `code`, `proyecto`, `estado`,
   `mwdc`, `lng`… y NO los del buzón (`cod`, `nombre`, `estado_pem`, `pdc`, `lon`). Si la
   traducción se rompiera, el estado saldría vacío y este banco lo vería. */
const FILAS_BASE = [
  { code:24002, proyecto:'El Burgo I', estado:'En marcha', mwac:11, mwdc:13.95856,
    n_modulos:23072, pot_modulo:605, string_cfg:'28', pitch:6, trackers:215,
    trackers_bifila:215, trackers_monofila:0, ncu_eth:1, ncu_fo:1, lat:41.57634, lng:-0.79814, pais:'España' },
  { code:24025, proyecto:'Ayora',  estado:'En marcha',   mwdc:52.52296, trackers:754 },
  { code:24007, proyecto:'Fayón',  estado:'En proceso',  mwdc:1.25664,  trackers:24 },
  { code:25019, proyecto:'Paramo', estado:'Sin comenzar', trackers:396 },
];
/* El buzón dice OTRA COSA de Ayora, a propósito: es como se comprueba quién manda. */
const BUZON = { '24025': { cod:24025, nproy:'24025', nombre:'Ayora', estado_pem:'Sin comenzar', pdc:52.52296 } };

/* La librería de mentira. `modo` decide cómo se comporta el entrar y el leer. Recibe UN objeto:
   addInitScript solo admite un argumento. */
function stub({ modo: m, filas }) {
  window.__pedidas = [];
  window.supabase = {
    createClient() {
      let dentro = m === 'con-sesion';
      return {
        auth: {
          async signInWithPassword({ email, password }) {
            window.__pedidas.push('login');
            window.__clave_vista = password;          // para comprobar que NO se guarda en ningún sitio
            if (m === 'clave-mala') return { error: { message: 'Invalid login credentials' } };
            if (m === 'sin-red') return { error: { message: 'Failed to fetch' } };
            dentro = true; return { error: null };
          },
          async getSession() { return { data: { session: dentro ? { user: { id: 'x' } } : null } }; },
          async signOut() { dentro = false; return {}; },
        },
        from(tabla) {
          window.__pedidas.push('from:' + tabla);
          return { select(cols) { window.__pedidas.push('select:' + cols.split(',').length);
            if (m === 'cero-filas') return Promise.resolve({ data: [], error: null });
            if (m === 'sin-red') return Promise.resolve({ data: null, error: { message: 'Failed to fetch' } });
            return Promise.resolve({ data: filas, error: null }); } };
        },
      };
    },
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });

  /* `modo`: cómo se porta la librería. `sesionGuardada`: si el navegador ya trae el testigo que
     escribe supabase-js, que es lo que hace que el Panel se conecte solo. `buzon`: si hay dato
     viejo en localStorage. */
  async function panel({ modo = 'ok', sesionGuardada = false, buzon = false, sinStub = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    const cdn = []; page.on('request', r => { if (/supabase-js/.test(r.url())) cdn.push(r.url()); });
    if (!sinStub) await page.addInitScript(stub, { modo, filas: FILAS_BASE });
    await page.addInitScript(({ ses, buz, B }) => {
      try {
        if (ses) localStorage.setItem('sb-icqiwmbbeoeswbcbgflc-auth-token', '{"access_token":"x"}');
        else localStorage.removeItem('sb-icqiwmbbeoeswbcbgflc-auth-token');
        if (buz) localStorage.setItem('factiun_plantas', JSON.stringify(B));
        else localStorage.removeItem('factiun_plantas');
      } catch (e) {}
    }, { ses: sesionGuardada, buz: buzon, B: BUZON });
    await page.goto(BASE + '/index.html');
    await page.waitForSelector('.pcard');
    return { page, errs, cdn };
  }
  const tarjeta = (page, nombre) => page.evaluate(n => {
    const c = [...document.querySelectorAll('.pcard')].find(x => x.querySelector('.name').textContent.startsWith(n));
    if (!c) return null;
    const sc = [...c.querySelectorAll('.pviews a, .pviews span')].find(x => x.textContent.trim() === 'SCADA');
    const pe = c.querySelector('.pest');
    return { estado: pe ? pe.textContent.trim() : null, scada: sc ? (sc.tagName === 'A' ? 'ENLACE' : 'APAGADO') : 'NO ESTÁ' };
  }, nombre);
  const acceso = page => page.evaluate(() => (document.getElementById('db-acceso') || {}).textContent || '');
  /* Esperar y que el plantón sea un FALLO, no una excepción: si el Panel deja de conectarse solo,
     un `waitForFunction` pelado revienta el banco y se pierden las comprobaciones que vienen
     detrás. Rojo con nombre vale más que rojo con traza. */
  const esperaA = async (page, re, cuanto) => {
    try { await page.waitForFunction(p => new RegExp(p).test(document.getElementById('db-acceso').textContent),
                                     re.source, { timeout: cuanto || 8000 }); return true; }
    catch (e) { return false; }
  };
  const entra = async (page, mail, clave) => {
    await page.click('#db-entrar');
    await page.fill('#db-mail', mail); await page.fill('#db-pass', clave);
    await page.click('#db-form button[type=submit]');
    return esperaA(page, /^(?!.*conectando)/s, 8000) || true;
  };

  // ─── 1. sin sesión: el Panel arranca igual y NO se trae el CDN ───
  {
    const { page, errs, cdn } = await panel({ sinStub: true });
    check('sin sesión, el Panel no se trae la librería de la cartera', cdn.length === 0, cdn);
    check('y las tarjetas están ahí igual', (await page.locator('.pcard').count()) === 12, await page.locator('.pcard').count());
    check('con el botón para conectarla', /Conectar la cartera/.test(await acceso(page)), await acceso(page));
    const b = await tarjeta(page, 'El Burgo');
    check('y sin inventarse ningún estado', b.estado === null, b);
    check('sin errores de JS', errs.length === 0, errs);
    await page.close();
  }

  // ─── 2. con sesión guardada: se conecta solo y lee la BASE ───
  {
    const { page, errs } = await panel({ modo: 'con-sesion', sesionGuardada: true, buzon: true });
    const solo = await esperaA(page, /en vivo/);
    check('con sesión guardada se conecta solo, sin preguntar', solo, await acceso(page));
    check('y dice cuántas plantas ha leído', /4 plantas/.test(await acceso(page)), await acceso(page));
    const b = await tarjeta(page, 'El Burgo');
    check('el estado sale de la base', b.estado === 'En marcha', b);
    check('y enciende su sala de control', b.scada === 'ENLACE', b);
    // Ayora: la base dice «En marcha» y el buzón «Sin comenzar». Manda la base.
    const a = await tarjeta(page, 'Ayora');
    check('la BASE manda sobre el buzón guardado', a.estado === 'En marcha', a);
    const f = await tarjeta(page, 'Fayón');
    check('«En proceso» también enciende la sala', f.estado === 'En proceso' && f.scada === 'ENLACE', f);
    const p = await tarjeta(page, 'Páramo');
    check('y «Sin comenzar» no la enciende', p.estado === 'Sin comenzar' && p.scada === 'APAGADO', p);

    const ficha = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.pcard')].find(y => y.querySelector('.name').textContent.startsWith('El Burgo'));
      c.querySelector('.pcard-toggle').click();
      const d = c.querySelector('.pdetail'), kv = {};
      const dt = [...d.querySelectorAll('.kv dt')], dd = [...d.querySelectorAll('.kv dd')];
      dt.forEach((t, i) => { kv[t.textContent.trim()] = dd[i] ? dd[i].textContent.trim() : null; });
      return { kv, fuente: (d.querySelector('.dfuente') || {}).textContent || '' };
    });
    // los nombres de la base son otros: si la traducción fallara, estos saldrían vacíos
    check('la ficha traduce los nombres de la base', ficha.kv['Potencia AC'] === '11 MW' && ficha.kv['Módulos'] === '23.072 × 605 W', ficha.kv);
    check('y las coordenadas, que allí se llaman lng', ficha.kv['Coordenadas'] === '41.57634, -0.79814', ficha.kv['Coordenadas']);
    check('y la ficha dice que el dato es de la base, en vivo', /en vivo/.test(ficha.fuente), ficha.fuente);

    // la contraseña no se guarda en ningún sitio del Panel
    const rastro = await page.evaluate(() => { let t = ''; for (let i = 0; i < localStorage.length; i++) t += localStorage.getItem(localStorage.key(i)); return t; });
    check('la contraseña no queda guardada en el navegador', !/secreta/.test(rastro), rastro.length);

    // salir devuelve el Panel al buzón, sin dejarlo en blanco
    const haySalir = await page.locator('#db-salir').count();
    check('estando dentro se puede salir', haySalir === 1, haySalir);
    if (haySalir) {
      await page.click('#db-salir');
      await esperaA(page, /Conectar la cartera/);
      const a2 = await tarjeta(page, 'Ayora');
      check('al salir vuelve a mandar el buzón, no se queda en blanco', a2.estado === 'Sin comenzar', a2);
    }
    check('sin errores de JS', errs.length === 0, errs);
    await page.close();
  }

  // ─── 3. entrando a mano ───
  {
    const { page, errs } = await panel({ modo: 'ok' });
    await entra(page, 'quien@factiun.com', 'secreta');
    check('entrando a mano se lee la base', /en vivo/.test(await acceso(page)), await acceso(page));
    const b = await tarjeta(page, 'El Burgo');
    check('y las tarjetas se repintan con su estado', b.estado === 'En marcha', b);
    const cols = await page.evaluate(() => window.__pedidas.filter(x => /^select:/.test(x))[0]);
    check('se piden solo las columnas que se usan, no la tabla entera', cols === 'select:17', cols);
    check('sin errores de JS', errs.length === 0, errs);
    await page.close();
  }

  // ─── 4. los tres finales que NO son «ha ido bien» ───
  for (const [modo, nombre, patron] of [
    ['clave-mala', 'con la contraseña mal, lo dice y no se queda colgado', /no reconoce/],
    ['cero-filas', 'con sesión válida y cero filas, dice que es la cuenta y no la conexión', /no ve ninguna planta/],
    ['sin-red',    'sin red lo dice, y el Panel sigue en pie',              /Failed to fetch/],
  ]) {
    const { page, errs } = await panel({ modo });
    await entra(page, 'quien@factiun.com', 'secreta');
    const txt = await acceso(page);
    check(nombre, patron.test(txt), txt);
    check('  · y el Panel sigue con sus 12 tarjetas', (await page.locator('.pcard').count()) === 12);
    check('  · sin errores de JS', errs.length === 0, errs);
    await page.close();
  }

  await browser.close();
  console.log('');
  if (ko) { console.log(ko + ' PRUEBAS FALLIDAS (' + ok + ' OK)'); process.exit(1); }
  console.log('TODAS OK (' + ok + ' comprobaciones)');
})().catch(e => { console.error(e); process.exit(1); });
