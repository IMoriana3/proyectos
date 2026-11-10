/* ============================================================================
   ambiente.js — EL ASPECTO de las escenas 3D de la casa, en un solo sitio.

   Fichero COMPARTIDO entre repos, mismo criterio que `seguidor.js` y
   `viento.js`: vive igual en `proyectos`, `cobertura-zigbee` y
   `gemelo-digital`. Si se toca en uno, se copia a los otros.

   Por qué existe. Las escenas compartían el MODELO del seguidor y nada más:
   cada página montaba su luz y sus materiales, y todas tenían los mismos tres
   defectos de imagen —

     · el vidrio y el acero no tenían nada que REFLEJAR. Son
       MeshStandardMaterial, y uno metálico sin entorno devuelve solo el
       destello de la luz direccional: el acero salía casi negro y el módulo,
       un azul liso;
     · los módulos no tenían CÉLULAS. `seguidor.js` ya prepara las UV de la
       mesa con un tile por módulo real, pero el mapa lo pone la página, y
       varias no lo ponían;
     · el SUELO era tan oscuro que las sombras —que es lo que estas escenas
       existen para enseñar— no se leían contra él.

   Lo que hay aquí es ILUMINACIÓN Y ACABADO, no dato. Nada de este fichero
   mueve un ángulo o cambia una cifra, ni añade un solo objeto de PLANTA: lo
   que cuelga de la escena es decorado y va marcado (`userData.ambiente`:
   tinta, horizonte, halo), para que quien cuente o mida lo pueda apartar. Y
   en el estilo «clásico» no cuelga nada. Tampoco toca los colores
   que SIGNIFICAN algo: el tinte de cada estrategia y el brillo de una mesa
   abanderada siguen siendo del `emissive` y del color por instancia de cada
   página. Por eso tampoco hay curva de tono: desplazaría esos colores.

   Escrito contra three r128 (el vendorizado en `lib/`) y sin nada que r160 no
   tenga. No depende de ninguna página: recibe THREE, el renderer y la escena.
   ============================================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ambiente = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* `root` NO es el parámetro del envoltorio de arriba: aquí dentro no existe.
     Sin esta línea, `root.localStorage` y `root.matchMedia` lanzaban dentro de
     su try/catch y el fichero «funcionaba»: no recordaba el estilo y daba a
     todo el mundo por escritorio. Lo cazó test_viento_estilos.js. */
  var root = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined' ? window : {});
  var A = { VERSION: '0.3.0' };

  /* En pantalla táctil el prefiltrado del entorno va apagado de serie: es el
     mismo criterio que Cobertura 3D (`terreno.html`), donde los reflejos son
     de escritorio. La escena se ve igual que antes de existir este fichero. */
  A.enMovil = function () {
    try { return !!(root.matchMedia && root.matchMedia('(pointer:coarse)').matches); }
    catch (e) { return false; }
  };

  function c01(v) { return Math.max(0, Math.min(1, +v || 0)); }
  function rgb(c) {
    return 'rgb(' + Math.round(c01(c[0]) * 255) + ',' + Math.round(c01(c[1]) * 255) + ',' +
           Math.round(c01(c[2]) * 255) + ')';
  }
  /* Los colores del cielo cambian un pelo en cada fotograma de una
     reproducción. Cuantizados a 1/24, el entorno se rehace cuando el cielo ha
     cambiado de verdad y no sesenta veces por segundo. */
  function clave(a, b, c) {
    return a.concat(b, c).map(function (v) { return Math.round(c01(v) * 24); }).join(',');
  }

  /* ── SUELO ──────────────────────────────────────────────────────────────
     Dos tonos de tierra seca, en RGB 0-1: el de TRABAJO (donde caen las
     sombras) y el de HORIZONTE (el plano lejano, un 10 % más apagado: lo justo
     para que no se vea la costura entre los dos). Con la luz de mediodía de
     estas escenas el de trabajo queda en torno a 0,55 y su sombra en 0,17:
     tres a uno, que es lo que hace falta para leer la sombra de una fila. El
     anterior (0,14 · 0,19 · 0,11) daba 0,32 contra 0,08, los dos en negro. */
  A.SUELO = { trabajo: [0.300, 0.305, 0.235], horizonte: [0.270, 0.275, 0.212] };

  /* Grano de tierra para ese suelo: una textura que MULTIPLICA el color (va de
     0,86 a 1,00), con mota fina y manchas anchas que envuelven en los bordes
     para que el mosaico no enseñe la junta. Es acabado de material, como las
     células del módulo: no dibuja relieve, surcos ni vegetación, porque en
     estas escenas el suelo es un plano y no hay nada medido que enseñar.
     La semilla es fija: dos cargas de la página dan la misma imagen. */
  A.granoSuelo = function (THREE, opts) {
    opts = opts || {};
    var N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
    var g = cv.getContext('2d'), seed = 20261109;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, N, N);
    var i, k;
    for (i = 0; i < 70; i++) {                       // manchas anchas, claras y oscuras
      var x = rnd() * N, y = rnd() * N, r = 28 + rnd() * 110, osc = rnd() < 0.55;
      for (k = 0; k < 9; k++) {                      // nueve copias: envuelve en los cuatro bordes
        var X = x + ((k % 3) - 1) * N, Y = y + (Math.floor(k / 3) - 1) * N;
        if (X + r < 0 || X - r > N || Y + r < 0 || Y - r > N) continue;
        var gr = g.createRadialGradient(X, Y, 0, X, Y, r);
        gr.addColorStop(0, osc ? 'rgba(150,150,150,0.20)' : 'rgba(255,255,255,0.22)');
        gr.addColorStop(1, osc ? 'rgba(150,150,150,0)' : 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(X - r, Y - r, 2 * r, 2 * r);
      }
    }
    var im = g.getImageData(0, 0, N, N), d = im.data;
    for (i = 0; i < d.length; i += 4) {              // mota fina
      var m = 1 - 0.10 * rnd();
      d[i] = d[i] * m; d[i + 1] = d[i + 1] * m; d[i + 2] = d[i + 2] * m;
    }
    g.putImageData(im, 0, 0);
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (opts.anisotropia) t.anisotropy = Math.max(1, Math.min(8, opts.anisotropia));
    return t;
  };
  /* Metros de suelo que cubre una repetición del grano. */
  A.METROS_POR_GRANO = 140;

  /* ── CIELO ──────────────────────────────────────────────────────────────
     La paleta del cielo según la altura del sol, y cómo se pinta en la cúpula.
     Antes cada página llevaba su fórmula y todas daban un cénit casi negro con
     un horizonte gris: de día la escena parecía un anochecer. Y la cúpula
     repartía el degradado de polo a polo, así que el color «de horizonte» caía
     en el polo SUR, debajo del suelo, y lo que se veía en la línea del
     horizonte era un tono intermedio y oscuro.

       var c = Ambiente.cielo(elevacionDeg);        // {cenit:[r,g,b], horiz:[r,g,b]}
       Ambiente.pintaCielo(lienzo, c.cenit, c.horiz);

     De día: azul arriba y bruma clara abajo. Con el sol por debajo de 12° el
     horizonte se calienta; de noche, casi negro con un resto de crepúsculo. */
  A.cielo = function (elDeg) {
    if (elDeg > 0) {
      var up = Math.min(1, Math.max(0, elDeg / 35));
      var warm = Math.max(0, Math.min(1, (12 - elDeg) / 12));
      var w = warm * (1 - 0.5 * up);
      return {
        cenit: [0.05 + 0.10 * up, 0.10 + 0.25 * up, 0.22 + 0.46 * up],
        horiz: [0.30 + 0.34 * up + 0.55 * w, 0.38 + 0.40 * up + 0.12 * w, 0.52 + 0.38 * up - 0.22 * warm]
      };
    }
    var tw = Math.max(0, (elDeg + 8) / 8);
    return { cenit: [0.028, 0.038, 0.065], horiz: [0.05 + 0.55 * tw, 0.055 + 0.19 * tw, 0.08 + 0.03 * tw] };
  };
  A.pintaCielo = function (lienzo, cenit, horiz) {
    var H = lienzo.height, g = lienzo.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, H);
    var medio = [(cenit[0] + horiz[0]) / 2, (cenit[1] + horiz[1]) / 2, (cenit[2] + horiz[2]) / 2];
    gr.addColorStop(0.00, rgb(cenit));
    gr.addColorStop(0.32, rgb(medio));
    gr.addColorStop(0.50, rgb(horiz));     // el ecuador de la esfera ES el horizonte
    gr.addColorStop(1.00, rgb(horiz));
    g.fillStyle = gr; g.fillRect(0, 0, lienzo.width, H);
  };

  /* ── CÉLULAS ────────────────────────────────────────────────────────────
     Un módulo por tile: marco de aluminio, 6 columnas de medias células y la
     línea de corte en el centro. Va como `map` de un material BLANCO: así el
     azul es el de la textura y el `emissive` de la página sigue marcando el
     estado encima. Solo para geometría cuyas UV repiten una vez por módulo
     REAL (la mesa 'mass' de `seguidor.js`). Sobre una caja estirada a ojo
     pintaría un número de módulos que nadie ha contado: ahí no se pone. */
  A.celulas = function (THREE, opts) {
    opts = opts || {};
    var W = 128, H = 256, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    g.fillStyle = opts.celda || '#10254c'; g.fillRect(0, 0, W, H);
    // medias células: 6 columnas × 24 filas, con la separación más clara
    g.strokeStyle = opts.junta || '#1d3a6e'; g.lineWidth = 1.5;
    var i;
    for (i = 1; i < 6; i++) { g.beginPath(); g.moveTo(i * W / 6, 0); g.lineTo(i * W / 6, H); g.stroke(); }
    for (i = 1; i < 24; i++) { g.beginPath(); g.moveTo(0, i * H / 24); g.lineTo(W, i * H / 24); g.stroke(); }
    // línea de corte entre las dos mitades del módulo
    g.strokeStyle = opts.corte || '#2f4f86'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    // marco
    g.strokeStyle = opts.marco || '#aeb7c2'; g.lineWidth = 7; g.strokeRect(0, 0, W, H);
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (opts.anisotropia) t.anisotropy = Math.max(1, Math.min(8, opts.anisotropia));
    return t;
  };

  /* ── ENTORNO ────────────────────────────────────────────────────────────
     Una cúpula con el MISMO degradado que pinta la página (cénit → horizonte)
     y el suelo por debajo, prefiltrada y puesta como `scene.environment`.
     Desde ahí la recogen solos todos los MeshStandardMaterial de la escena.

       var amb = Ambiente.entorno(THREE, renderer, scene);
       amb.pide(cenit, horizonte);      // cada vez que la página repinta su cielo
       amb.refresca(now);               // una vez por fotograma

     `pide` solo apunta; `refresca` rehace el entorno como mucho cada 250 ms.
     Si la GPU no da el prefiltrado, `estado().ok` es false con su motivo y la
     escena sigue sin reflejos en vez de quedarse sin escena. */
  A.entorno = function (THREE, renderer, scene, opts) {
    opts = opts || {};
    var st = { ok: false, motivo: '', rehechos: 0 };
    var pm = null, esc = null, cv = null, tx = null, rt = null;
    var pedida = '', puesta = '', pend = null, t0 = -1e9;
    var suelo = opts.suelo || A.SUELO.horizonte;
    if (opts.activo === false) st.motivo = 'apagado';
    else if (!THREE.PMREMGenerator) st.motivo = 'three sin PMREMGenerator';
    else st.ok = true;
    /* El prefiltrado se monta la PRIMERA vez que hace falta, no al crear: una
       escena que se queda en «clásico» no compila ni reserva nada en la GPU. */
    function monta() {
      pm = new THREE.PMREMGenerator(renderer);
      cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
      tx = new THREE.CanvasTexture(cv);
      esc = new THREE.Scene();
      esc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 32),
        new THREE.MeshBasicMaterial({ map: tx, side: THREE.BackSide, depthWrite: false, fog: false })));
    }
    function pinta(cenit, horiz) {
      // la textura envuelve la esfera de polo a polo: el ecuador (el horizonte)
      // cae en la mitad del lienzo, y de ahí para abajo es suelo
      var g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0.00, rgb(cenit));
      gr.addColorStop(0.36, rgb([(cenit[0] + horiz[0]) / 2, (cenit[1] + horiz[1]) / 2, (cenit[2] + horiz[2]) / 2]));
      gr.addColorStop(0.50, rgb(horiz));
      gr.addColorStop(0.54, rgb(suelo));
      gr.addColorStop(1.00, rgb([suelo[0] * 0.7, suelo[1] * 0.7, suelo[2] * 0.7]));
      g.fillStyle = gr; g.fillRect(0, 0, 4, 256); tx.needsUpdate = true;
    }
    return {
      estado: function () { return { ok: st.ok, motivo: st.motivo, rehechos: st.rehechos }; },
      pide: function (cenit, horiz) {
        if (!st.ok) return;
        pedida = clave(cenit, horiz, suelo);
        pend = [cenit.slice(0, 3), horiz.slice(0, 3)];
      },
      refresca: function (now) {
        if (!st.ok || !pend || pedida === puesta) return false;
        if (now - t0 < 250) return false;
        t0 = now;
        try {
          if (!pm) monta();
          pinta(pend[0], pend[1]);
          var nuevo = pm.fromScene(esc, 0, 0.1, 200);
          scene.environment = nuevo.texture;
          if (rt) rt.dispose();
          rt = nuevo; puesta = pedida; st.rehechos++;
          return true;
        } catch (e) {
          st.ok = false; st.motivo = String((e && e.message) || e);
          scene.environment = null;
          return false;
        }
      },
      /* «clásico»: fuera el entorno, sin perder lo prefiltrado; `sigue` lo devuelve */
      pausa: function () { scene.environment = null; },
      sigue: function () { if (st.ok && rt) scene.environment = rt.texture; },
      pendiente: function () { return st.ok && !!pend && pedida !== puesta; },
      apaga: function () {
        scene.environment = null;
        if (rt) { rt.dispose(); rt = null; }
        st.ok = false; st.motivo = 'apagado';
      }
    };
  };

  /* ══ ESTILOS ════════════════════════════════════════════════════════════
     Tres maneras de ver LA MISMA escena, elegibles con un selector y
     recordadas entre visitas. Ninguna cambia un ángulo ni una cifra: cambian
     qué se enseña.

       clasico  · la escena tal como la monta la página, sin tocar. Solo en
                  las páginas que lo piden (las que tienen bancos de píxeles).
       natural  · cielo, tierra, células y reflejos. Lo que se vería allí.
       maqueta  · papel y grafito, como una maqueta de arquitecto, con la
                  SOMBRA en color: aquí la sombra es el dato y no un gris.
       energia  · escena oscura donde cada mesa BRILLA con la irradiancia que
                  le da la simulación (la POA de la página, no una estimación
                  de este fichero) y se apaga cuando no recibe.

     En las tres el viento se ve: corrientes que cruzan la planta en el rumbo
     y a un ritmo proporcional a la velocidad que la página está simulando. Son
     trazos rectos — NO son un cálculo de flujo: no se desvían en las filas ni
     enseñan abrigo. Dicen de dónde sopla y cuánto.

     La página entrega lo que ya tiene y se queda con un objeto:

       var est = Ambiente.escena(THREE, { renderer, scene, suelo, horizonte,
                                          hemi, sol, cupula:{lienzo,textura} });
       est.cielo(elevDeg)            → {cenit, horiz} ya pintado en la cúpula
       est.luces(elevDeg)            después de que la página ponga las suyas
       est.vidrio(colorLiso)         → material de mesa, restilizado al cambiar
       est.mesa(material, k, conEstado)   k = irradiancia relativa 0..1 (o null);
                                     conEstado = la página ya la marca con un color de estado
       est.senal(material)           un color que significa: se conserva en los tres
       est.viento(centro, radio, rumboDeg, ms)
       est.tick(now, dt)             una vez por fotograma
       est.suelo(malla)              si el suelo llega después o se rehace
       est.estilo('maqueta')         cambia; est.nombre() dice cuál hay

     Y para las páginas con escena propia y bancos que la miden (v0.3.0):

       { estilos:['clasico',…], porDefecto:'clasico' }   qué ofrece la página
       { relieve:true }              el suelo es un terreno: se pinta con luz
       { horizonteAuto:true }        en «natural», el campo sigue hasta el horizonte
       { relleno:0.08 }              la luz ambiente que la página ya lleva
       est.adopta(material)          la pala de la página sigue al estilo (y vuelve)
       est.reinicia()                la página rehace su mundo con materiales nuevos
       est.repasa()                  la página ha restaurado sus materiales por su cuenta
       est.mesaDe(mallas, {padre, rect, y, celulas})  → asa de UNA mesa
       est.brilla(asa, k)            en «energía» esa mesa brilla con SU k (0..1 o null)
       est.pausa(si) / enPausa()     clásico mientras dure, sin olvidar el elegido
       est.tinta()                   color de rótulo para el estilo (null = el de la página)
       est.pendiente()               ¿hace falta otro fotograma? (pintado bajo demanda)
     ══════════════════════════════════════════════════════════════════════ */
  A.ESTILOS = ['natural', 'maqueta', 'energia'];
  A.ROTULOS = { clasico: 'Clásico', natural: 'Natural', maqueta: 'Maqueta', energia: 'Energía' };
  var CLAVE = 'factiun_estilo3d';
  A.estiloGuardado = function (lista, defecto) {
    lista = lista || A.ESTILOS; defecto = defecto || lista[0];
    try { var v = root.localStorage.getItem(CLAVE); return lista.indexOf(v) >= 0 ? v : defecto; }
    catch (e) { return defecto; }
  };
  var PAPEL = [0.937, 0.914, 0.863], TINTA = 0x2b3fd6;
  var NOCHE = [0.043, 0.086, 0.150], AMBAR = [1.0, 0.62, 0.10], APAGADA = [0.063, 0.100, 0.170];

  /* `o.estilos` y `o.porDefecto` deciden qué ofrece cada página. Una página con
     bancos que LEEN PÍXELES de la escena (bt3d, producción, difusa) pide
     ['clasico', …] con 'clasico' por defecto: en ese estilo este fichero NO
     TOCA NADA —ni suelo, ni vidrio, ni luces, ni entorno— y la escena es, bit a
     bit, la de antes de existir. Los otros tres son elección de quien mira.

     El suelo puede llegar después y cambiar (`est.suelo(malla)`): bt3d rehace
     su terreno en cada `build3D`. Con `o.relieve` el suelo es un terreno y la
     maqueta lo pinta con luz, para que el relieve se lea; sin él, es papel liso. */
  A.escena = function (THREE, o) {
    var sc = o.scene, rd = o.renderer, alCambiar = [];
    var LISTA = o.estilos || A.ESTILOS, nombre = A.estiloGuardado(LISTA, o.porDefecto), elegido = null;
    var aniso = rd.capabilities.getMaxAnisotropy ? rd.capabilities.getMaxAnisotropy() : 1;
    var cel = A.celulas(THREE, { anisotropia: aniso });
    var granoS = A.granoSuelo(THREE, { anisotropia: aniso }), granoH = A.granoSuelo(THREE, { anisotropia: aniso });
    var amb = A.entorno(THREE, rd, sc, { activo: !A.enMovil() });
    function col(c) { return new THREE.Color(c[0], c[1], c[2]); }
    var Papel = o.relieve ? THREE.MeshLambertMaterial : THREE.MeshBasicMaterial;
    var mat = {
      natural: [new THREE.MeshLambertMaterial({ color: col(A.SUELO.trabajo), map: granoS }),
                new THREE.MeshLambertMaterial({ color: col(A.SUELO.horizonte), map: granoH })],
      maqueta: [new Papel({ color: col(PAPEL) }), new Papel({ color: col(PAPEL) })],
      energia: [new THREE.MeshLambertMaterial({ color: col(NOCHE) }), new THREE.MeshLambertMaterial({ color: col(NOCHE) })]
    };
    /* la sombra de la maqueta: una malla que SOLO dibuja sombra, en tinta azul.
       Comparte la geometría del suelo, así que sigue el relieve si lo hay. */
    if (o.relieve) {
      /* Un terreno con relieve se pinta con luz (Lambert) y con el sol rasante
         se queda casi negro: la luz del cielo que rebota no está en el modelo.
         Se le da un fondo propio, del mismo tono, para que la tierra siga
         siendo tierra a las ocho de la mañana. */
      mat.natural.forEach(function (m, i) {
        m.emissive = col(i ? A.SUELO.horizonte : A.SUELO.trabajo); m.emissiveMap = m.map; m.emissiveIntensity = 0.42;
      });
    }
    var tintaM = new THREE.ShadowMaterial({ color: TINTA, opacity: 0.40, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    var disco = null, RADIO_DISCO = 2300;
    var suelo = null, horizonte = o.horizonte || null, tinta = null, sueloM = null, horizM = horizonte ? horizonte.material : null, metros = [1, 1];
    var rejP = new THREE.GridHelper(2400, 240, 0xcabfa9, 0xddd5c3), rejE = new THREE.GridHelper(2400, 240, 0x1d6fa8, 0x123a5c);
    rejP.material.transparent = true; rejP.material.opacity = 0.9;
    rejE.material.transparent = true; rejE.material.opacity = 0.42; rejE.material.blending = THREE.AdditiveBlending; rejE.material.depthWrite = false;
    rejP.visible = rejE.visible = false;
    if (!o.relieve) sc.add(rejP, rejE);      // sobre un terreno la rejilla plana lo atravesaría

    /* ── corrientes de viento ── */
    var NV = 520, pos = new Float32Array(NV * 6), colr = new Float32Array(NV * 6), tr = [], seed = 9173;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (var i = 0; i < NV; i++) tr.push({ u: rnd() * 2 - 1, v: rnd() * 2 - 1, y: 0.8 + rnd() * rnd() * 7.5, f: 0.6 + rnd() * 0.8, fase: rnd() * 6.28 });
    var gv = new THREE.BufferGeometry();
    gv.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gv.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    var mv = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false });
    var corr = new THREE.LineSegments(gv, mv); corr.frustumCulled = false; corr.visible = false;   // a la escena, cuando haya viento
    var W = { c: new THREE.Vector3(), r: 300, dx: 1, dz: 0, ms: 0, hay: false };
    var TINTE = { clasico: [0.92, 0.95, 1.0], natural: [0.92, 0.95, 1.0], maqueta: [0.17, 0.25, 0.84], energia: [0.10, 0.62, 0.95] };
    function pintaCorrientes() {
      var t = TINTE[nombre];
      for (var i = 0; i < NV; i++) {      // cola transparente → cabeza del color del estilo
        var k = i * 6;
        if (nombre === 'energia') { colr[k] = colr[k + 1] = colr[k + 2] = 0; }
        else { colr[k] = t[0]; colr[k + 1] = t[1]; colr[k + 2] = t[2]; }
        colr[k + 3] = t[0]; colr[k + 4] = t[1]; colr[k + 5] = t[2];
      }
      gv.attributes.color.needsUpdate = true;
      mv.blending = nombre === 'energia' ? THREE.AdditiveBlending : THREE.NormalBlending;
      mv.opacity = nombre === 'energia' ? 0.85 : (nombre === 'maqueta' ? 0.50 : 0.38);
      mv.needsUpdate = true;
      corr.visible = W.hay && nombre !== 'clasico';
    }
    function mueveCorrientes(dt) {
      if (!corr.visible) return;
      var R = W.r, L0 = Math.max(10, Math.min(60, 8 + W.ms * 2.2)), paso = W.ms * dt / R;
      for (var i = 0; i < NV; i++) {
        var q = tr[i]; q.u += paso * q.f; if (q.u > 1) { q.u -= 2; q.v = rnd() * 2 - 1; }
        var L = L0 * q.f, a = q.u * R, y = q.y + 0.22 * Math.sin(q.u * 9 + q.fase), k = i * 6;
        // u a lo largo del viento (hacia donde VA), v de través
        var x0 = W.c.x + W.dx * (a - L) - W.dz * q.v * R, z0 = W.c.z + W.dz * (a - L) + W.dx * q.v * R;
        var x1 = W.c.x + W.dx * a - W.dz * q.v * R, z1 = W.c.z + W.dz * a + W.dx * q.v * R;
        pos[k] = x0; pos[k + 1] = y; pos[k + 2] = z0; pos[k + 3] = x1; pos[k + 4] = y; pos[k + 5] = z1;
      }
      gv.attributes.position.needsUpdate = true;
    }

    /* SEÑALES: materiales cuyo color SIGNIFICA (el pilar de cada estrategia, la
       pala de una viga que no se midió). No reflejan el cielo, y en «energía»
       —donde la luz de escena es tenue y ámbar— se sostienen con su propio
       emissive para que el color siga siendo el de la leyenda. */
    var senales = [];
    function visteSenal(m) {
      var u = m.userData;
      m.envMapIntensity = nombre === 'clasico' ? u.envBase : 0;
      m.emissiveIntensity = nombre === 'energia' ? Math.max(0.95, u.emBase) : u.emBase;
    }
    /* VIDRIOS: la mesa. Cada uno guarda cómo era en la página, y «clásico» se lo devuelve entero. */
    var vidrios = [], celMaq = null;
    function celMaqueta() {       // la maqueta dibuja cada módulo: grafito con el marco a lápiz claro
      if (!celMaq) celMaq = A.celulas(THREE, { celda: '#1f2a3a', junta: '#1f2a3a', corte: '#283447', marco: '#7d8796', anisotropia: aniso });
      return celMaq;
    }
    function visteVidrio(m) {
      var u = m.userData.amb0;
      if (nombre === 'clasico') { m.color.setHex(u.color); m.map = u.map; m.roughness = u.roughness; m.envMapIntensity = u.env; }
      else if (nombre === 'natural') { m.color.setRGB(1, 1, 1); m.map = cel; m.roughness = 0.18; m.envMapIntensity = 0.75; }
      else if (nombre === 'maqueta') { m.color.setRGB(1, 1, 1); m.map = celMaqueta(); m.roughness = 0.36; m.envMapIntensity = 0.35; }
      else { m.color.setRGB(APAGADA[0], APAGADA[1], APAGADA[2]); m.map = null; m.roughness = 0.30; m.envMapIntensity = 0.5; }
      if (nombre !== 'energia' && m.userData.ambar) { m.emissive.setHex(u.emissive); m.emissiveIntensity = u.emInt; m.userData.ambar = false; }
      m.needsUpdate = true;
    }
    function adopta(m) {
      if (vidrios.indexOf(m) >= 0) return m;      // dos veces el mismo: la segunda apuntaría como «de la página» lo que ya es del estilo
      m.userData.amb0 = { color: m.color.getHex(), map: m.map || null, roughness: m.roughness, env: m.envMapIntensity,
                          emissive: m.emissive.getHex(), emInt: m.emissiveIntensity };
      vidrios.push(m); visteVidrio(m); return m;
    }
    function visteSuelo() {
      if (suelo) {
        suelo.material = nombre === 'clasico' ? sueloM : mat[nombre][0];
        suelo.receiveShadow = nombre !== 'maqueta';
        /* la tinta existe SOLO en «maqueta»: fuera de ella no hay ni una malla
           de más colgada del mundo de la página */
        if (nombre === 'maqueta' && !tinta) {
          tinta = new THREE.Mesh(suelo.geometry, tintaM); tinta.receiveShadow = true; tinta.renderOrder = 1;
          tinta.userData.ambiente = 'tinta'; (suelo.parent || sc).add(tinta);
          tinta.position.copy(suelo.position); tinta.quaternion.copy(suelo.quaternion); tinta.scale.copy(suelo.scale);
        } else if (nombre !== 'maqueta' && tinta) { if (tinta.parent) tinta.parent.remove(tinta); tinta = null; }
      }
      if (horizonte) horizonte.material = nombre === 'clasico' ? horizM : mat[nombre][1];
      /* El terreno de la página es un RECORTE alrededor de la planta. En
         «natural» se le pone debajo el resto del campo, hasta el horizonte;
         en los demás el recorte es lo que se quiere ver (una hoja, una mesa
         de luz) y en clásico no hay nada que no sea de la página. */
      if (o.horizonteAuto) {
        var quiere = nombre === 'natural' && !!suelo;
        if (quiere && !disco) {
          granoH.repeat.set(2 * RADIO_DISCO / A.METROS_POR_GRANO, 2 * RADIO_DISCO / A.METROS_POR_GRANO);
          disco = new THREE.Mesh(new THREE.CircleGeometry(RADIO_DISCO, 72), mat.natural[1]);
          disco.rotation.x = -Math.PI / 2; disco.userData.ambiente = 'horizonte'; disco.raycast = function () {};
          sc.add(disco);
        } else if (!quiere && disco) { sc.remove(disco); disco.geometry.dispose(); disco = null; }
        if (disco) {
          var caja = new THREE.Box3().setFromObject(suelo);
          disco.position.set((caja.min.x + caja.max.x) / 2, caja.min.y - 0.35, (caja.min.z + caja.max.z) / 2);
        }
      }
    }
    /* ── MESAS QUE BRILLAN CADA UNA LO SUYO ─────────────────────────────
       En las páginas donde TODAS las mesas se pintan con un mismo material no
       se puede dar a cada una su brillo tocando ese material. `mesaDe` apunta
       las mallas de vidrio de UNA mesa y `brilla` les pone, solo en «energía»,
       un material propio (clon del de la página) encendido en ámbar por k, con
       las células en el emissive. Fuera de «energía» devuelve el de la página.
       Y alrededor de la mesa, un HALO: un marco de luz que cae a cero a 1,1 m,
       para que la mesa parezca fuente de luz y no una pegatina naranja. */
    var mesasH = [], celLuz = null, haloM = null;
    function luzCelulas() {
      if (!celLuz) celLuz = A.celulas(THREE, { celda: '#ffffff', junta: '#a4a4a4', corte: '#6e6e6e', marco: '#262626', anisotropia: aniso });
      return celLuz;
    }
    function haloDe(h) {
      var r = h.o.rect, m = 1.1, x0 = r[0], x1 = r[1], z0 = r[2], z1 = r[3], y = 0;
      // tres anillos: el borde de la mesa, a 0,35·m y a m. Color por vértice; el de fuera, negro (aditivo = nada)
      var an = [0, 0.35 * m, m], P = [], I = [], i, a;
      for (i = 0; i < 3; i++) { a = an[i]; P.push(x0 - a, y, z0 - a, x1 + a, y, z0 - a, x1 + a, y, z1 + a, x0 - a, y, z1 + a); }
      for (i = 0; i < 2; i++) for (a = 0; a < 4; a++) {
        var p0 = i * 4 + a, p1 = i * 4 + (a + 1) % 4, q0 = p0 + 4, q1 = p1 + 4;
        I.push(p0, q0, p1, p1, q0, q1);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(36), 3));
      g.setIndex(I);
      if (!haloM) haloM = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
                                                         depthWrite: false, side: THREE.DoubleSide, fog: false });
      var malla = new THREE.Mesh(g, haloM);
      malla.position.y = h.o.y || 0; malla.renderOrder = 1; malla.userData.ambiente = 'halo'; malla.raycast = function () {};
      return malla;
    }
    function apagaMesa(h) {
      for (var i = 0; i < h.mallas.length; i++) if (h.mallas[i].material === h.mat) h.mallas[i].material = h.base;
      if (h.halo && h.halo.parent) h.halo.parent.remove(h.halo);
    }

    function aplica() {
      visteSuelo();
      rejP.visible = nombre === 'maqueta'; rejE.visible = nombre === 'energia';
      if (nombre === 'clasico') { amb.pausa(); } else amb.sigue();
      vidrios.forEach(visteVidrio); senales.forEach(visteSenal); pintaCorrientes();
      if (nombre !== 'energia') mesasH.forEach(apagaMesa);
    }
    var api = {
      nombre: function () { return nombre; },
      lista: function () { return LISTA.slice(); },
      estado: function () { return { estilo: nombre, entorno: amb.estado(), vidrios: vidrios.length, senales: senales.length,
                                     corrientes: corr.visible, viento: { dx: W.dx, dz: W.dz, ms: W.ms }, tinta: !!(tinta && tinta.visible) }; },
      alCambiar: function (f) { alCambiar.push(f); },
      estilo: function (n) {
        if (LISTA.indexOf(n) < 0) return;
        if (elegido !== null) { elegido = n; try { root.localStorage.setItem(CLAVE, n); } catch (e) {} return; }   // en pausa: se apunta y ya
        if (n === nombre) return;
        nombre = n; try { root.localStorage.setItem(CLAVE, n); } catch (e) {}
        aplica(); alCambiar.forEach(function (f) { f(n); });
      },
      /* El suelo de la escena (una malla). Se puede llamar cada vez que la página
         rehace su mundo: la tinta se cuelga del mismo padre y se va con él. */
      suelo: function (malla) {
        if (tinta && tinta.parent) tinta.parent.remove(tinta);
        suelo = malla; tinta = null; sueloM = malla ? malla.material : null;
        if (!malla) return;
        for (var e in mat) mat[e][0].side = sueloM.side;      // la misma cara que pinta la página (hay suelos a dos caras)
        tintaM.side = sueloM.side;
        malla.geometry.computeBoundingBox();
        var bb = malla.geometry.boundingBox;
        metros = [Math.max(1, bb.max.x - bb.min.x), Math.max(1, Math.max(bb.max.z - bb.min.z, bb.max.y - bb.min.y))];
        visteSuelo();
      },
      /* vacía los registros de materiales: la página que rehace su mundo crea materiales nuevos */
      reinicia: function () {
        vidrios.length = 0; senales.length = 0;
        mesasH.forEach(function (h) { if (h.mat) h.mat.dispose(); if (h.halo) h.halo.geometry.dispose(); });
        mesasH.length = 0;
      },
      /* Mientras dure la pausa la escena va en «clásico» y el estilo elegido se
         guarda sin tocar lo que hay en localStorage. Para la vista que compara
         dos mundos y solo uno de ellos es de este fichero. No avisa a `alCambiar`:
         quien pausa está ya repintando. */
      pausa: function (si) {
        if (!!si === (elegido !== null)) return;
        if (si) { elegido = nombre; nombre = LISTA.indexOf('clasico') >= 0 ? 'clasico' : nombre; }
        else { nombre = elegido; elegido = null; }
        aplica();
      },
      enPausa: function () { return elegido !== null; },
      /* tinta de los rótulos que la página dibuja DENTRO de la escena (la flecha
         de norte): solo la maqueta, que es clara, pide una oscura */
      tinta: function () { return nombre === 'maqueta' ? '#1f2a39' : null; },
      mesaDe: function (mallas, opc) {
        var h = { mallas: mallas || [], o: opc || {}, base: mallas && mallas.length ? mallas[0].material : null, mat: null, halo: null };
        mesasH.push(h); return h;
      },
      brilla: function (h, k) {
        if (!h || !h.base) return;
        if (nombre !== 'energia' || k == null) { apagaMesa(h); return; }
        var q = Math.max(0, Math.min(1, k)), i;
        if (!h.mat) {
          h.mat = h.base.clone();
          h.mat.color.setRGB(APAGADA[0], APAGADA[1], APAGADA[2]); h.mat.map = null;
          h.mat.emissive.setRGB(AMBAR[0], AMBAR[1], AMBAR[2]);
          if (h.o.celulas) h.mat.emissiveMap = luzCelulas();
          h.mat.userData = { ambiente: 'mesa' };
        }
        h.mat.emissiveIntensity = 0.06 + 0.94 * q;
        for (i = 0; i < h.mallas.length; i++) h.mallas[i].material = h.mat;
        if (h.o.padre && h.o.rect) {
          if (!h.halo) h.halo = haloDe(h);
          if (h.halo.parent !== h.o.padre) h.o.padre.add(h.halo);
          var c = h.halo.geometry.attributes.color, f = [0.55 * q, 0.16 * q, 0];
          for (i = 0; i < 12; i++) { var w = f[i >> 2]; c.setXYZ(i, AMBAR[0] * w, AMBAR[1] * w, AMBAR[2] * w); }
          c.needsUpdate = true;
        }
      },
      /* vuelve a poner el suelo del estilo: para la página que restaura los
         materiales de su mundo por su cuenta (los modos de diagnóstico de bt3d) */
      repasa: function () { visteSuelo(); },
      /* La paleta del cielo del estilo. En «clásico» devuelve null: el cielo es
         el de la página. Si la página entregó su cúpula, además la pinta. */
      cielo: function (elDeg) {
        var c;
        if (nombre === 'clasico') return null;
        if (nombre === 'natural') c = A.cielo(elDeg);
        else if (nombre === 'maqueta') { var k = elDeg > 0 ? 1 : 0.5; c = { cenit: [0.90 * k, 0.88 * k, 0.84 * k], horiz: [0.95 * k, 0.93 * k, 0.89 * k] }; }
        else { var w = elDeg > 0 ? Math.max(0, Math.min(1, (14 - elDeg) / 14)) : 0;
               c = { cenit: [0.016, 0.027, 0.055], horiz: [0.035 + 0.30 * w, 0.070 + 0.10 * w, 0.130] }; }
        if (o.cupula) { A.pintaCielo(o.cupula.lienzo, c.cenit, c.horiz); o.cupula.textura.needsUpdate = true; }
        if (nombre === 'maqueta') { var p = elDeg > 0 ? 1 : 0.5; mat.maqueta[0].color.setRGB(PAPEL[0] * p, PAPEL[1] * p, PAPEL[2] * p); mat.maqueta[1].color.copy(mat.maqueta[0].color); }
        amb.pide(c.cenit, c.horiz);
        return c;
      },
      /* después de que la página ponga sus luces: la maqueta y la escena de energía llevan las suyas */
      luces: function (elDeg) {
        if (nombre === 'clasico') return;
        if (nombre === 'natural') {       // la bóveda vuelve a los colores de la página
          if (o.hemi && o.hemiBase) { o.hemi.color.setHex(o.hemiBase[0]); o.hemi.groundColor.setHex(o.hemiBase[1]); }
          return;
        }
        var dia = elDeg > 0;
        if (nombre === 'maqueta') {
          if (o.sol) { o.sol.color.setRGB(1, 0.96, 0.88); o.sol.intensity = dia ? 0.85 : 0.02; }
          if (o.hemi) { o.hemi.color.setRGB(1, 1, 1); o.hemi.groundColor.setRGB(0.91, 0.88, 0.82); o.hemi.intensity = dia ? 0.62 : 0.30; }
          /* sobre un terreno el papel recibe luz (para que el relieve se lea):
             la bóveda completa lo que el sol no da, y el papel en llano queda
             igual de claro a mediodía que a las ocho */
          if (o.relieve && o.hemi && dia) o.hemi.intensity = Math.max(0.20, Math.min(1, 1 - (o.relleno || 0) - 0.85 * Math.sin(elDeg * Math.PI / 180)));   // `relleno`: la luz ambiente que la página ya lleva
        } else {
          if (o.sol) { o.sol.color.setRGB(1, 0.77, 0.42); o.sol.intensity = dia ? 0.60 : 0.02; }
          if (o.hemi) { o.hemi.color.setRGB(0.36, 0.50, 0.71); o.hemi.groundColor.setRGB(0.02, 0.03, 0.06); o.hemi.intensity = 0.55; }
        }
      },
      luzClasica: function () {           // al volver a «clásico»: la bóveda, a los colores de la página
        if (o.hemi && o.hemiBase) { o.hemi.color.setHex(o.hemiBase[0]); o.hemi.groundColor.setHex(o.hemiBase[1]); }
      },
      vidrio: function (liso) {
        var m = new THREE.MeshStandardMaterial({ color: liso == null ? 0xffffff : liso, metalness: 0.25, roughness: 0.35,
          emissive: new THREE.Color(0x000000), emissiveIntensity: 0 });
        return adopta(m);
      },
      adopta: adopta,
      senal: function (m) {
        m.userData.emBase = m.emissiveIntensity; m.userData.envBase = m.envMapIntensity;
        senales.push(m); visteSenal(m); return m;
      },
      /* En «energía» la mesa brilla en ámbar con su irradiancia relativa. Solo si
         la página no la está marcando ya con un color de ESTADO (abanderada,
         suelta…): ese emissive es suyo y manda. */
      mesa: function (m, k, conEstado) {
        if (nombre !== 'energia' || k == null) return;
        if (conEstado) { m.userData.ambar = false; return; }
        var q = Math.max(0, Math.min(1, k));
        m.emissive.setRGB(AMBAR[0], AMBAR[1], AMBAR[2]); m.emissiveIntensity = 0.08 + 0.92 * q; m.userData.ambar = true;
      },
      viento: function (centro, radio, rumboDeg, ms) {
        W.c.copy(centro); W.r = Math.max(90, radio * 0.62); W.ms = ms || 0;
        if (rumboDeg != null) { var a = rumboDeg * Math.PI / 180; W.dx = -Math.sin(a); W.dz = Math.cos(a); }   // de dónde VIENE → hacia dónde va
        W.hay = W.ms > 0.3 && rumboDeg != null;
        if (W.hay && !corr.parent) sc.add(corr);
        corr.visible = W.hay && nombre !== 'clasico';
      },
      /* ¿hace falta otro fotograma? Para las páginas que pintan bajo demanda. */
      pendiente: function () { return nombre !== 'clasico' && (corr.visible || amb.pendiente()); },
      tick: function (now, dt) {
        var rehecho = nombre !== 'clasico' && amb.refresca(now);
        if (suelo) {
          var e = suelo.scale, c = suelo.position;
          granoS.repeat.set(metros[0] * e.x / A.METROS_POR_GRANO, metros[1] * e.y / A.METROS_POR_GRANO);
          if (tinta) { tinta.position.copy(c); tinta.quaternion.copy(suelo.quaternion); tinta.scale.copy(e); }
          rejP.position.set(Math.round(c.x / 10) * 10, c.y + 0.02, Math.round(c.z / 10) * 10); rejE.position.copy(rejP.position);
        }
        mueveCorrientes(dt || 0);
        return rehecho;
      }
    };
    granoH.repeat.set(12000 / A.METROS_POR_GRANO, 12000 / A.METROS_POR_GRANO);
    if (o.suelo) api.suelo(o.suelo);
    aplica();
    return api;
  };

  /* El selector de estilo: el mismo en todas las páginas. `opts.abajo` lo lleva
     a la esquina inferior derecha, para las escenas que ya tienen mandos arriba. */
  A.selector = function (contenedor, est, opts) {
    opts = opts || {};
    var caja = document.createElement('div');
    caja.setAttribute('data-ambiente', 'selector');
    caja.style.cssText = 'position:absolute;right:10px;' + (opts.abajo ? 'bottom:10px;' : 'top:10px;') +
      'z-index:5;display:flex;gap:0;border-radius:6px;overflow:hidden;' +
      'border:1px solid rgba(140,160,190,.45);font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em';
    var bot = {}, lista = est.lista();
    function pinta() {
      lista.forEach(function (n) {
        var on = est.nombre() === n;
        bot[n].style.background = on ? '#f5a524' : 'rgba(14,24,38,.82)';
        bot[n].style.color = on ? '#0e1826' : '#dce3eb';
        bot[n].setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    lista.forEach(function (n) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = A.ROTULOS[n].toUpperCase();
      b.setAttribute('data-estilo', n); b.title = 'Estilo de la escena: ' + A.ROTULOS[n];
      b.style.cssText = 'border:0;padding:7px 10px;cursor:pointer;font:inherit;letter-spacing:inherit';
      b.onclick = function () { est.estilo(n); pinta(); };
      bot[n] = b; caja.appendChild(b);
    });
    contenedor.appendChild(caja); pinta();
    return caja;
  };

  return A;
});
