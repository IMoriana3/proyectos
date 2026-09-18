// LA FICHA DE LA PLANTA y el acceso al SCADA — en un navegador real.
//
// Dos cosas que el Panel no podía hacer y una que hacía mal:
//
//   1. La tarjeta cerrada solo cabe para el número, el nombre, la potencia y la ubicación. Todo lo
//      demás —potencias, módulos, seguidores, NCU, estado de puesta en marcha— vive en la cartera
//      y había que abrir otra página para verlo. Ahora la tarjeta se despliega.
//   2. La sala de control salía SOLO si la ficha traía el enlace escrito a mano, y esa lista se
//      había descolgado del dato: San José lo tenía con la cartera diciendo «Sin comenzar», y
//      Fayón, Túnez y Bagnarelli no lo tenían estando las tres «En marcha». Ahora lo abre el
//      estado, sin quitar ningún enlace de los que ya había.
//   3. Y lo que este banco vigila por encima de todo: QUE NO SE INVENTE UN ESTADO. El estado lo
//      publica la cartera en `factiun_plantas` (localStorage del mismo origen). Si esa página no
//      se ha abierto en este navegador no hay estado, y entonces no se pinta ninguno ni se abre
//      ninguna sala de control por las bravas: un «En marcha» supuesto es justo lo que no puede
//      pasar cuando lo que se decide con él es entrar a operar una planta.
//
//   python3 -m http.server 8099       # servir el repo (en otra terminal)
//   node tests/test_ficha_planta.js
const { chromium } = require('playwright');
const { EXEC } = require('./pw_navegador.js');   // dónde está el chromium, en un solo sitio
const BASE = process.env.BASE || 'http://localhost:8099';
let ok = 0, ko = 0;
const check = (n, cond, extra) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
};

/* La cartera de mentira lleva los TRES estados que existen y, a propósito, una planta «En marcha»
   que NO tiene enlace escrito a mano (Fayón) y una «Sin comenzar» que SÍ lo tiene (San José): son
   los dos casos donde el estado y la lista escrita discrepan. */
const CARTERA = {
  '24002': { cod:24002, nproy:'23003', nombre:'El Burgo I', estado_pem:'En marcha',
             pac:11, pdc:13.95856, cantidad:23072, wmod:605, mods:28, pitch:'6',
             trk_total:215, trk_bi:215, trk_mono:0, ncu_eth:1, ncu_fo:1, lat:41.57634, lon:-0.79814 },
  '24025': { cod:24025, nproy:'24025', nombre:'Ayora',    estado_pem:'En proceso',   pdc:52.52296, trk_total:754 },
  '24019': { cod:24019, nproy:'24019', nombre:'San José', estado_pem:'Sin comenzar', pdc:177.984,  trk_total:2289 },
  '24007': { cod:24007, nproy:'24007', nombre:'Fayón',    estado_pem:'En marcha',    pdc:1.25664,  trk_total:24 },
  '25019': { cod:25019, nproy:'25019', nombre:'Paramo',   estado_pem:'Sin comenzar', trk_total:396 },
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC });

  async function panel(conCartera) {
    const page = await browser.newPage({ viewport:{ width:1400, height:1000 } });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    if (conCartera) await page.addInitScript(d => {
      try { localStorage.setItem('factiun_plantas', JSON.stringify(d)); } catch (e) {}
    }, CARTERA);
    await page.goto(BASE + '/index.html');
    await page.waitForSelector('.pcard');
    return { page, errs };
  }
  // lo que enseña la tarjeta de una planta: su estado y su botón de SCADA
  const tarjeta = (page, nombre) => page.evaluate(n => {
    const c = [...document.querySelectorAll('.pcard')].find(x => x.querySelector('.name').textContent.startsWith(n));
    if (!c) return null;
    const sc = [...c.querySelectorAll('.pviews a, .pviews span')].find(x => x.textContent.trim() === 'SCADA');
    const pe = c.querySelector('.pest');
    return { estado: pe ? pe.textContent.trim() : null,
             color: pe ? getComputedStyle(pe).color : null,
             scada: sc ? (sc.tagName === 'A' ? sc.getAttribute('href') : 'APAGADO') : 'NO ESTÁ' };
  }, nombre);

  // ─────────── CON los datos de la cartera ───────────
  {
    const { page, errs } = await panel(true);

    const burgo = await tarjeta(page, 'El Burgo');
    check('la planta en marcha enseña su estado', burgo.estado === 'En marcha', burgo);
    check('y en verde, como el resto del panel', burgo.color === 'rgb(54, 211, 153)', burgo.color);
    check('el enlace de SCADA escrito a mano NO se toca',
      burgo.scada === 'https://factiun-cartera.imoriana3.workers.dev/scada.html?planta=el%20burgo%20i', burgo.scada);

    const ayora = await tarjeta(page, 'Ayora');
    check('la planta en proceso enseña su estado', ayora.estado === 'En proceso', ayora);
    check('y en ámbar', ayora.color === 'rgb(246, 166, 35)', ayora.color);
    check('y tiene sala de control', /^https:.*scada\.html\?planta=ayora$/.test(ayora.scada), ayora.scada);

    // el caso que no existía: en marcha, sin enlace escrito, la abre el ESTADO
    const fayon = await tarjeta(page, 'Fayón');
    check('una planta EN MARCHA sin enlace escrito gana su sala de control',
      /scada\.html\?planta=Fay%C3%B3n$/.test(fayon.scada), fayon.scada);
    check('y la abre con el nombre de la CARTERA, que es con el que ella tiene los registros',
      decodeURIComponent(String(fayon.scada).split('planta=')[1] || '') === 'Fayón', fayon.scada);

    // y el que da sentido al botón: sin comenzar y sin enlace escrito, NO hay sala
    const paramo = await tarjeta(page, 'Páramo');
    check('una planta SIN COMENZAR no gana sala de control', paramo.scada === 'APAGADO', paramo);
    check('pero sí enseña que está sin comenzar', paramo.estado === 'Sin comenzar', paramo);

    // ── la ficha ──
    /* Se leen los PARES de la lista, no el texto pegado: `textContent` junta el <dt> con su <dd>
       («Potencia AC11 MW») y una expresión sobre eso comprueba la concatenación, no el dato. */
    const abre = n => page.evaluate(x => {
      const c = [...document.querySelectorAll('.pcard')].find(y => y.querySelector('.name').textContent.startsWith(x));
      c.querySelector('.pcard-toggle').click();
      const d = c.querySelector('.pdetail'), kv = {};
      const dts = [...d.querySelectorAll('.kv dt')], dds = [...d.querySelectorAll('.kv dd')];
      dts.forEach((t, i) => { kv[t.textContent.trim()] = dds[i] ? dds[i].textContent.trim() : null; });
      return { abierta: !d.hidden, expand: c.querySelector('.pcard-toggle').getAttribute('aria-expanded'),
               kv, txt: d.textContent.replace(/\s+/g, ' ').trim() };
    }, n);
    const f = await abre('El Burgo');
    check('pinchando la planta se abre su ficha', f.abierta && f.expand === 'true', f.abierta);
    // los números son los de la cartera de mentira, no otros
    check('la ficha dice la potencia AC de la cartera', f.kv['Potencia AC'] === '11 MW', f.kv);
    check('y los módulos con su vatiaje', f.kv['Módulos'] === '23.072 × 605 W', f.kv['Módulos']);
    check('y los seguidores con su reparto', f.kv['Seguidores'] === '215 (215 bífilas)', f.kv['Seguidores']);
    check('y las NCU por tipo de enlace', f.kv['NCU'] === '1 Ethernet · 1 fibra', f.kv['NCU']);
    /* El Burgo es 23003 de proyecto y 24002 de cartera: son dos numeraciones y la ficha lo dice. */
    check('y el nº de cartera cuando no es el de proyecto', f.kv['Nº de cartera'] === '24002', f.kv['Nº de cartera']);
    check('el estado también va en la ficha', f.kv['Estado PEM'] === 'En marcha', f.kv['Estado PEM']);
    check('la ficha lleva el acceso a la sala de control', /Sala de control/.test(f.txt), f.txt.slice(-60));

    const f2 = await abre('El Burgo');   // segundo clic
    check('y volviendo a pinchar se cierra', !f2.abierta && f2.expand === 'false', f2);

    check('sin errores de JS', errs.length === 0, errs);
    await page.close();
  }

  // ─────────── SIN los datos de la cartera ───────────
  {
    const { page, errs } = await panel(false);

    for (const n of ['El Burgo', 'Ayora', 'Fayón', 'Páramo', 'Catania']) {
      const t = await tarjeta(page, n);
      check('sin cartera, ' + n + ' no se inventa un estado', t.estado === null, t);
    }
    const fayon = await tarjeta(page, 'Fayón');
    check('sin cartera no se abre ninguna sala de control por las bravas', fayon.scada === 'APAGADO', fayon);
    const burgo = await tarjeta(page, 'El Burgo');
    check('pero los enlaces escritos a mano siguen estando',
      /scada\.html\?planta=el%20burgo%20i$/.test(burgo.scada), burgo.scada);

    const f = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.pcard')].find(y => y.querySelector('.name').textContent.startsWith('El Burgo'));
      c.querySelector('.pcard-toggle').click();
      const d = c.querySelector('.pdetail');
      return { txt: d.textContent.replace(/\s+/g, ' ').trim(), enlace: !!d.querySelector('a[href*="cartera-tabla"]') };
    });
    check('la ficha dice de dónde sale el dato que falta', /Cartera técnica/.test(f.txt), f.txt.slice(0, 140));
    check('y lleva el enlace para abrirla', f.enlace, f.enlace);

    check('sin errores de JS', errs.length === 0, errs);
    await page.close();
  }

  await browser.close();
  console.log('');
  if (ko) { console.log(ko + ' PRUEBAS FALLIDAS (' + ok + ' OK)'); process.exit(1); }
  console.log('TODAS OK (' + ok + ' comprobaciones)');
})().catch(e => { console.error(e); process.exit(1); });
