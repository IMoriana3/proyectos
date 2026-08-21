/* ¿APROVECHAN EL ANCHO DE LA PANTALLA? Mide, en píxeles y en una pantalla ancha de verdad, cuánto
   del ancho usa cada página y cuánto se queda en márgenes muertos. No mira el CSS: mira lo pintado.
   De cada página informa del contenedor de contenido más ancho y de quién le pone el techo.

       node tools/test_ancho.mjs                      todas, a 1920 y a 2560
       node tools/test_ancho.mjs --ancho=1920         solo una anchura
       node tools/test_ancho.mjs --solo=proyectos     solo las páginas de un repo                */
import { createRequire } from 'node:module';
const chromium = (() => {
  for (const d of ['./', '../node_modules/', '../../Cobertura-Zigbee/node_modules/', '../../cobertura-zigbee/node_modules/'])
    try { const c = createRequire(new URL(d, import.meta.url))('playwright-core').chromium; if (c && c.launch) return c; } catch (e) { }
  console.error('falta playwright-core: ten al lado el repo cobertura-zigbee'); process.exit(2);
})();
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const RAIZ = '/home/user';
const arg = n => (process.argv.find(a => a.startsWith('--' + n + '=')) || '').split('=')[1];
const ANCHOS = arg('ancho') ? [+arg('ancho')] : [1920, 2560];
const SOLO = arg('solo');

/* Un servidor por repo: las páginas piden ficheros del suyo por ruta relativa. */
const PAGINAS = [
  ['proyectos', 8201, ['index.html', 'cartera-tabla.html', 'layout.html', 'sim-solar.html',
    'generador-layout.html', 'comparador-estructuras.html', 'sim-viento.html']],
  ['Cobertura-Zigbee', 8202, ['index.html', 'informe.html', 'modbus.html', 'crear.html', 'topografico.html',
    'backtracking.html', 'overcast.html', 'plano.html', 'terreno.html']],
  ['Siting', 8203, ['index.html']],
  ['SCADA', 8204, ['index.html', 'trafico.html']],
  ['Gemelo-digital', 8205, ['index.html', 'bateria.html', 'simulador.html', 'juegos/index.html']],
  ['Visor-San-Jose', 8206, ['index.html', 'san-jose/index.html', 'ayora/index.html', 'asbuilt/index.html']],
  ['checklist-solar-v2', 8207, ['index.html', 'dashboard.html', 'import.html']],
  ['gorraiz-dashboard', 8208, ['index.html']],
  ['SolarGPTfull', 8209, ['viewers/dtwin-viewer.html', 'viewers/dtwin-seguidor-tcu.html',
    'viewers/tcu-detalle-electrico.html', 'siting/demo-siting.html']],
  ['factiun-cartera', 8210, ['index.html', 'ips.html', 'seguimiento-pem.html', 'scada.html', 'importar-logs.html']],
  ['cobertura-rf-fv', 8211, ['index.html']],
].filter(p => !SOLO || p[0].toLowerCase() === SOLO.toLowerCase());

/* Cada cual clona los repos con el nombre que quiere (Cobertura-Zigbee aquí, cobertura-zigbee en un
   contenedor): la carpeta se busca sin mirar mayúsculas, y con un alias para el visor, que ni se
   llama igual. Si aun así no está, se dice y no se levanta un servidor sobre una carpeta vacía. */
import { readdirSync } from 'node:fs';
const ALIAS = { 'visor-san-jose': 'visores', 'visores': 'visor-san-jose' };
const carpeta = nombre => {
  const quiere = [nombre.toLowerCase(), ALIAS[nombre.toLowerCase()] || ''];
  const hay = readdirSync(RAIZ).find(d => quiere.includes(d.toLowerCase()));
  if (!hay) console.error(`no encuentro la carpeta de ${nombre} en ${RAIZ}: sus páginas saldrán como error`);
  return hay || nombre;
};

import { spawn } from 'node:child_process';
const servidores = PAGINAS.map(([repo, puerto]) =>
  spawn('python3', ['-m', 'http.server', String(puerto), '--directory', RAIZ + '/' + carpeta(repo)], { stdio: 'ignore' }));
await new Promise(r => setTimeout(r, 1500));

/* Qué se mide: la CAJA QUE OCUPA EL CONTENIDO, de su borde izquierdo pintado al derecho. Medir
   "el elemento más ancho" engañaba: la cabecera va a todo lo ancho y tapaba que el contenido de
   debajo se quedaba en la mitad. Se ignora lo fijo (barras flotantes) y lo que no pinta nada. */
const MIDE = () => {
  const vw = document.documentElement.clientWidth;
  let izq = Infinity, der = -Infinity, ancho = null;
  const pinta = e => {
    if (e.tagName === 'CANVAS' || e.tagName === 'IMG' || e.tagName === 'SVG' || e.tagName === 'TABLE'
        || e.tagName === 'INPUT' || e.tagName === 'BUTTON' || e.tagName === 'SELECT') return true;
    for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
    return false;
  };
  for (const e of document.querySelectorAll('body *')) {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) continue;
    let fijo = false;
    for (let p = e; p && p !== document.body; p = p.parentElement)
      if (getComputedStyle(p).position === 'fixed') { fijo = true; break; }
    /* Fuera la cabecera, la navegación y el pie: van a todo lo ancho por diseño y tapaban que el
       CONTENIDO de debajo se quedara en la mitad, que es lo que se quiere ver. */
    if (fijo || e.closest('header,nav,footer,[role=banner],[role=contentinfo]') || !pinta(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0) continue;
    if (r.left < izq) izq = r.left;
    if (r.right > der) { der = r.right; ancho = e; }
  }
  const dime = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')
    + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) : '(nada)';
  /* quién le pone el techo al contenido: el primer ancestro con max-width por debajo del hueco */
  let techo = null;
  for (let e = ancho; e && e !== document.body; e = e.parentElement) {
    const mw = getComputedStyle(e).maxWidth;
    if (mw !== 'none' && parseFloat(mw) < vw - 4) { techo = dime(e) + ' max-width:' + mw; break; }
  }
  return { vw, izq: Math.round(izq), der: Math.round(der), usa: Math.round(der - izq),
    quien: dime(ancho), techo, armazon: !!document.getElementById('login'),
    scroll: document.documentElement.scrollWidth > vw + 1 };
};

/* COLUMNA DE LECTURA A PROPOSITO. Estas tres no aprovechan el ancho porque no deben: se decidio
   dejarlas asi. Un banco que grita en cada ejecucion por algo ya decidido acaba ignorandose, asi
   que salen como «adrede» con su motivo y no cuentan como fallo. Quitando la razon de aqui, la
   pagina vuelve a medirse como las demas. */
const ADREDE = {
  'Cobertura-Zigbee/informe.html': 'informe sobre folio blanco, con su @media print: ensancharlo rompe la hoja y estira la prosa',
  'Cobertura-Zigbee/crear.html': 'asistente de tres pasos en vertical: ponerlos en paralelo cambia como se usa',
  'checklist-solar-v2/import.html': 'formulario de subir fichero: un input file a 1800 px no mejora nada',
};

const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const flojas = [];
for (const ancho of ANCHOS) {
  console.log(`\n=== ${ancho} px de ancho ===`);
  for (const [repo, puerto, pags] of PAGINAS) {
    for (const p of pags) {
      const ctx = await b.newContext({ viewport: { width: ancho, height: 1080 } });
      await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) { } });
      const pg = await ctx.newPage();
      let m = null;
      try {
        await pg.goto(`http://localhost:${puerto}/${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        /* Las herramientas con cuenta (la cartera de Factiun) enseñan sin sesión un formulario de
           entrada estrecho a propósito, y este navegador nunca tiene sesión. Medir la puerta y
           cantar «FLOJA» sería mentir, así que se aparta (los ids pesan más que la clase .hidden)
           y se mide el ARMAZÓN: barra de filtros y tabla pintan a lo ancho del contenedor real.
           La medición sale marcada con «armazón» para que se sepa qué se ha medido. */
        await pg.addStyleTag({ content: '#login{display:none!important}#app{display:block!important}#configWarn{display:none!important}' }).catch(() => { });
        await pg.waitForTimeout(2500);
        m = await pg.evaluate(MIDE);
      } catch (e) { m = { err: e.message.split('\n')[0] }; }
      await ctx.close();
      if (m.err) { console.log(`  ??    ${repo}/${p}  ${m.err}`); continue; }
      /* Si no se ha medido nada es que la pagina no ha pintado, no que sea estrecha: aqui pasa con
         las que cargan Firebase por CDN, que este contenedor no deja salir. Se dice, y no cuenta
         como fallo de ancho, que seria mentir sobre lo que se ha medido. */
      if (!isFinite(m.usa)) { console.log(`  ??    ${(repo + '/' + p).padEnd(38)} ${m.armazon ? 'sin sesión no pinta nada (su panel vive en un modal tras entrar): mídelo entrando a mano' : 'no ha pintado nada (¿dependencia externa bloqueada?)'}`); continue; }
      const uso = m.usa / m.vw;
      const razon = ADREDE[repo + '/' + p];
      const marca = razon ? 'adrede' : uso >= 0.90 ? 'ok   ' : uso >= 0.75 ? 'justo' : 'FLOJA';
      if (uso < 0.90 && !razon) flojas.push({ repo, p, ancho, uso, m });
      console.log(`  ${marca} ${(repo + '/' + p).padEnd(38)} usa ${String(m.usa).padStart(5)} de ${m.vw} (${(uso * 100).toFixed(0)} %) · margenes ${m.izq}|${m.vw - m.der}  ${m.techo ? '← ' + m.techo : m.quien}${m.armazon ? '  · armazón (sin sesión)' : ''}${m.scroll ? '  ⚠ scroll horizontal' : ''}${razon ? '\n           adrede: ' + razon : ''}`);
    }
  }
}
await b.close();
servidores.forEach(s => s.kill());
console.log('\n' + (flojas.length ? flojas.length + ' medición(es) por debajo del 90 % del ancho' : 'todas por encima del 90 %'));
