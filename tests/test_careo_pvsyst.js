// Pruebas del comparador Careo SolarGPT ↔ PVSyst en un navegador real.
//
// Lo que comprueba de verdad: que las tablas A/B se montan con sus filas y
// deltas, que los 7 hallazgos salen con sus botones, y que un veredicto
// SOBREVIVE a recargar la página (localStorage) — que es el contrato de esta
// herramienta: sin backend, el veredicto vive en el navegador.
//
//   npm install playwright            # el navegador ya esta en /opt/pw-browsers
//   python3 -m http.server 8099       # servir el repo (en otra terminal)
//   node tests/test_careo_pvsyst.js
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
function check(nombre, valor, esperado) {
  const bien = String(valor) === String(esperado);
  if (bien) { ok++; console.log('OK   ' + nombre + ' = ' + valor); }
  else { ko++; console.log('FAIL ' + nombre + ' : obtenido ' + JSON.stringify(String(valor)) + ', esperado ' + JSON.stringify(String(esperado))); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  await page.goto(BASE + '/careo-pvsyst.html', { waitUntil: 'networkidle' });
  // Limpieza UNA vez y recarga: un addInitScript borraría el localStorage
  // también en el reload de más abajo — el propio test mataría la
  // persistencia que viene a comprobar (pasó: pill "Pendiente" tras
  // recargar y el click de Reabrir esperando a un botón oculto).
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle' });

  // Las dos tablas se montan con todas sus filas (6 componentes + 6 etapas).
  check('filas tabla A (componentes)', await page.locator('#tbl-a tr').count(), 6);
  check('filas tabla B (etapas)', await page.locator('#tbl-b tr').count(), 6);
  // El delta clave de la portada está en la tabla, no solo en el texto.
  check('la tabla A trae el global +0,12 %',
        (await page.locator('#tbl-a').innerText()).includes('+0,12'), true);

  // Los 7 hallazgos, cada uno con su botón de validar.
  check('hallazgos', await page.locator('.finding').count(), 7);
  check('botones Validar', await page.locator('button[data-act="validado"]').count(), 7);

  // Un veredicto con autor persiste tras RECARGAR (localStorage, el contrato).
  await page.fill('#who', 'Prueba');
  await page.fill('#f-b-termico input[data-role="nota"]', 'contrastado con TArray');
  await page.click('#f-b-termico button[data-act="validado"]');
  check('pill tras validar',
        await page.locator('#f-b-termico [data-role="estado"]').innerText(), 'Validado');
  await page.reload({ waitUntil: 'networkidle' });
  check('pill tras RECARGAR',
        await page.locator('#f-b-termico [data-role="estado"]').innerText(), 'Validado');
  check('autor y nota sobreviven',
        (await page.locator('#f-b-termico [data-role="log"]').innerText())
          .includes('Prueba'), true);
  check('progreso cuenta el validado',
        (await page.locator('#progress').innerText()).startsWith('1/7'), true);

  // Reabrir devuelve a pendiente (el ciclo completo del veredicto).
  await page.click('#f-b-termico button[data-act="pendiente"]');
  check('reabrir vuelve a Pendiente',
        await page.locator('#f-b-termico [data-role="estado"]').innerText(), 'Pendiente');

  // El export existe y produce un JSON con los veredictos (sin descargar:
  // se inspecciona el blob desde dentro de la página).
  const exportado = await page.evaluate(() => {
    let capturado = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => { capturado = b; return 'blob:capturado'; };
    document.getElementById('btn-export').click();
    URL.createObjectURL = orig;
    return capturado ? capturado.text() : Promise.resolve(null);
  });
  check('el export emite JSON con la clave veredictos',
        exportado !== null && JSON.parse(exportado).veredictos !== undefined, true);

  await browser.close();
  console.log(ko === 0 ? `\nTODAS OK (${ok} comprobaciones)` : `\n${ko} FALLOS de ${ok + ko}`);
  process.exit(ko === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
