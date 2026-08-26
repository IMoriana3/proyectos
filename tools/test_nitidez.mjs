/* ¿SE DIBUJAN LOS LIENZOS 2D A SU RESOLUCIÓN, O LOS AMPLÍA EL NAVEGADOR? Un `<canvas>` tiene dos
   tamaños: el del BÚFER (`width`/`height`, en píxeles de dibujo) y el que OCUPA (CSS). Si el búfer
   es menor, el navegador amplía lo dibujado —y con ello la letra y el trazo—: se ve gordo y
   blando. Y en una pantalla de densidad 2, dibujar a resolución CSS ya es la mitad de la que hay.

   Se mide con `deviceScaleFactor: 2`, que es donde se nota:

     búfer / CSS ≈ 2   correcto: se dibuja a los píxeles que de verdad tiene la pantalla
     búfer / CSS ≈ 1   se dibuja a resolución CSS: se ve blando en cualquier pantalla Hi-DPI
     búfer / CSS < 1   AMPLIADO: además de blando, la letra y el trazo salen agrandados

       node tools/test_nitidez.mjs                                                                */
import { createRequire } from 'node:module';
const chromium = (() => {
  for (const d of ['./', '../node_modules/', '../../Cobertura-Zigbee/node_modules/', '../../cobertura-zigbee/node_modules/'])
    try { const c = createRequire(new URL(d, import.meta.url))('playwright-core').chromium; if (c && c.launch) return c; } catch (e) { }
  console.error('falta playwright-core'); process.exit(2);
})();
const EXE = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const RAIZ = '/home/user';
import { spawn } from 'node:child_process';
const PAGINAS = [
  ['proyectos', 8401, ['sim-solar.html', 'sim-viento.html', 'generador-layout.html', 'comparador-estructuras.html', 'layout.html']],
  ['Cobertura-Zigbee', 8402, ['index.html', 'plano.html', 'backtracking.html', 'overcast.html', 'crear.html']],
  ['Gemelo-digital', 8403, ['index.html', 'bateria.html', 'simulador.html']],
  ['SCADA', 8404, ['index.html']],
  ['Siting', 8405, ['index.html']],
];
const solo = (process.argv.find(a => a.startsWith('--solo=')) || '').split('=')[1];
const lista = PAGINAS.filter(p => !solo || p[0].toLowerCase() === solo.toLowerCase());
const srv = lista.map(([r, p]) => spawn('python3', ['-m', 'http.server', String(p), '--directory', RAIZ + '/' + r], { stdio: 'ignore' }));
await new Promise(r => setTimeout(r, 1600));
const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
let malos = 0, total = 0;
for (const [repo, puerto, pags] of lista) {
  for (const pag of pags) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.cobertura_offline = '1'; } catch (e) { } });
    const pg = await ctx.newPage();
    let r = null;
    try {
      await pg.goto(`http://localhost:${puerto}/${pag}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      /* ESPERAR A QUE SE ASIENTE, que si no se mide en carrera con la maquetacion y salen falsos
         positivos: en una pasada el comparador dio x1,4 y en la siguiente x1,99, sin tocar nada.
         Se espera a que ni el tamaño del bufer ni el que ocupa cambien en dos vueltas seguidas. */
      let prev = '', estable = 0;
      for (let i = 0; i < 40 && estable < 3; i++) {
        await pg.waitForTimeout(400);
        const ahora = await pg.evaluate(() => [...document.querySelectorAll('canvas')]
          .map(c => c.width + 'x' + c.height + '@' + Math.round(c.getBoundingClientRect().width)).join(','));
        estable = (ahora === prev) ? estable + 1 : 0; prev = ahora;
      }
      r = await pg.evaluate(() => [...document.querySelectorAll('canvas')].map(c => {
        const b = c.getBoundingClientRect();
        let dosD = false; try { dosD = !!(c.getContext('2d', { willReadFrequently: true })); } catch (e) { }
        return { id: c.id || c.className || '(sin id)', css: Math.round(b.width), buf: c.width,
          ratio: b.width > 0 ? +(c.width / b.width).toFixed(2) : null, dosD, dpr: devicePixelRatio };
      }).filter(x => x.css > 40));
    } catch (e) { console.log(`  ??    ${repo}/${pag}  ${e.message.split('\n')[0]}`); continue; }
    r.forEach(c => {
      total++;
      const veredicto = c.ratio >= 1.9 ? 'ok   ' : c.ratio >= 0.98 ? 'BLANDO' : 'AMPLIA';
      if (c.ratio < 1.9) malos++;
      console.log(`  ${veredicto} ${(repo + '/' + pag).padEnd(38)} ${String(c.id).slice(0, 16).padEnd(17)} búfer ${String(c.buf).padStart(5)} · ocupa ${String(c.css).padStart(5)} · ×${c.ratio}`);
    });
    await ctx.close();
  }
}
await b.close(); srv.forEach(s => s.kill());
console.log(`\n${total} lienzos · ${malos} por debajo de la densidad de la pantalla`);
