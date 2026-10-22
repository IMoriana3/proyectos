/* BANCO DE `tools/careo_carteras.mjs`.
 *
 * ═══ QUÉ SE COMPRUEBA CONTRA QUÉ ═══
 *
 * El careo de ESQUEMA se comprueba contra el código real de las dos
 * aplicaciones: `cartera-tabla.html` de este repositorio y el
 * `factiun-cartera/index.html` de al lado. No hay fixture, es la fuente.
 *
 * El careo de DATOS no tiene con qué compararse todavía: la cartera técnica
 * guarda en localStorage y la de Supabase necesita login, así que en este
 * repositorio no hay un volcado de ninguna de las dos. Lo que se comprueba
 * aquí es la MAQUINARIA del careo, y se comprueba con el único dato real que
 * hay a mano: el `SEED` del propio fichero, re-claveado a los nombres de
 * Supabase a través de `MAPA`. Son las mismas 22 plantas con los nombres de
 * campo del otro lado, así que el careo tiene que decir «no falta nada» — y
 * cada mutación tiene que romper eso de una forma concreta.
 *
 * Lo que este banco NO dice, y hay que repetirlo para que nadie lo lea mal:
 * no dice que las dos carteras coincidan. Dice que la herramienta que las va a
 * carear cuenta bien. El careo de verdad necesita los dos volcados.
 *
 * ═══ POR QUÉ LAS MUTACIONES NO SE ESCRIBEN EN DISCO ═══
 *
 * Porque este banco termina con `process.exit()`, y `process.exit()` NO corre
 * los `finally`: un banco que escribe el fichero mutado para cargarlo deja la
 * fuente rota en el árbol en cuanto una mutación falla antes de limpiar. Ya
 * pasó una vez. El módulo mutado se carga desde una URL `data:`.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const RUTA_MOD = path.join(RAIZ, 'tools', 'careo_carteras.mjs');
const RUTA_TEC = path.join(RAIZ, 'cartera-tabla.html');
const RUTA_SB = path.join(RAIZ, '..', 'factiun-cartera', 'index.html');

let ok = 0;
const fallos = [];

/* El formato de línea es el que lee `tests/correr.sh` —`OK   ` y `FAIL `— aunque
   este banco viva fuera del portón: si algún día entra, ya encaja, y mientras
   tanto se lee igual que los demás. */
function chk(nombre, real, esperado) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('OK   ' + nombre); return true; }
  console.log('FAIL ' + nombre + ' -> esperado ' + b + ', medido ' + a);
  fallos.push(`${nombre}\n      esperado: ${b}\n      medido  : ${a}`);
  return false;
}
function chkQue(nombre, cond) { return chk(nombre, !!cond, true); }

/* ═══════════════════════════ LAS MUTACIONES ═══════════════════════════════
 * Cada una es un error plausible —no un disparate— que el careo tiene que
 * pillar. La columna de la derecha dice qué afirmación del careo se cae si la
 * mutación pasara desapercibida. */
const MUTACIONES = {
  /* el mapa se queda corto: alguien añade un campo y no lo mapea */
  mapaIncompleto: (s) => s.replace("  sist_control: 'control',\n", ''),
  /* dos campos de la técnica apuntan al mismo de Supabase: se machacarían */
  mapaColision: (s) => s.replace("  invmodelo: 'inv_modelo',", "  invmodelo: 'inv_fab',"),
  /* el mapa apunta a un campo que Supabase no tiene */
  mapaAlVacio: (s) => s.replace("  sist_control: 'control',", "  sist_control: 'sistema_control',"),
  /* `pem` y `huecos` dejan de estar marcados como calculados: el careo diría
     que Supabase guarda dos datos más de los que guarda */
  calculadosComoCampos: (s) => s.replace(/export const CALCULADOS_SUPABASE = \{[\s\S]*?\};/, 'export const CALCULADOS_SUPABASE = {};'),
  /* no se normaliza: booleano true contra texto "Sí" sale como contradicción */
  sinNormalizar: (s) => s.replace(/export function normaliza\(v, campo\) \{[\s\S]*?\n\}/, 'export function normaliza(v, campo) { return v == null ? "" : String(v); }'),
  /* TODO campo se trata como sí/no: entonces un contador a 0 pasa a valer lo
     mismo que un contador vacío, y se borra la diferencia entre «no lleva
     ninguna» y «no se sabe cuántas lleva». Es el fallo que este banco pilló. */
  /* las cinco fases se tratan como un campo normal: entonces tres estados
     contra dos pasa desapercibido y «En proceso» se da por «No» sin avisar */
  fasesComoCampoNormal: (s) => s.replace('      if (CAMPOS_FASE.has(ct)) {', '      if (false) {'),
  /* el estado intermedio deja de anotarse: el sí/no coincide, así que el careo
     se queda callado justo en el único dato que la otra cartera no sabe pintar */
  degradacionMuda: (s) => s.replace("        } else if (fa === 'En proceso') {", '        } else if (false) {'),
  /* el careo de vocabularios mira sólo un lado: los valores que únicamente
     ofrece la técnica —TracknCO, AiTracker— dejan de salir */
  vocabCiego: (s) => s.replace('    const soloTecnica = lista.filter((v) => !vs[cs].some((w) => igual(v, w)));', '    const soloTecnica = [];'),
  /* no se quitan los comentarios del VOCABULARIO antes de parsearlo: alguno
     lleva comillas dobles y entra como si fuera un campo más */
  vocabConComentarios: (s) => s.replace("  const cuerpo = m[1].replace(/\\/\\*[\\s\\S]*?\\*\\//g, '');", '  const cuerpo = m[1];'),
  ceroEsVacio: (s) => s.replace('  const esSiNo = campo !== undefined && CAMPOS_SINO.has(campo);', '  const esSiNo = true;'),
  /* la clave no se pasa a texto: 24002 y "24002" serían plantas distintas */
  claveLaxa: (s) => s.replace(/export function clave\(v\) \{[\s\S]*?\n\}/, 'export function clave(v) { return v == null ? null : v; }'),
  /* un lado vacío se da por coincidencia: desaparecen los datos que sólo
     tiene la técnica, que es EXACTAMENTE lo que no se quiere perder */
  vacioEsIgual: (s) => s.replace('      if (va === vb) continue;', '      if (va === vb || va === "" || vb === "") continue;'),
  /* el volcado vacío devuelve lista vacía en vez de null: el informe seguiría
     adelante y acabaría diciendo MIDE sin haber mirado nada */
  vacioEsPase: (s) => s.replace('  return Array.isArray(recs) && recs.length ? recs : null;', '  return Array.isArray(recs) ? recs : null;'),
  /* el CSV se parte por `;` sin respetar comillas: cualquier campo con punto y
     coma dentro —un modelo de inversor, una nota— descoloca la fila entera */
  csvSinComillas: (s) => s.replace(/export function leerCsvPuntoYComa\(texto\) \{[\s\S]*?\n\}\n/,
    'export function leerCsvPuntoYComa(texto) {\n  if (typeof texto !== "string" || !texto.trim()) return null;\n  const f = texto.replace(/^\\uFEFF/, "").split(/\\r?\\n/).filter((l) => l !== "").map((l) => l.split(";"));\n  return f.length >= 2 ? f : null;\n}\n'),
};

async function carga(mutacion) {
  let src = fs.readFileSync(RUTA_MOD, 'utf8');
  if (mutacion) {
    const antes = src;
    src = MUTACIONES[mutacion](src);
    if (src === antes) throw new Error(`la mutación «${mutacion}» no ha cambiado nada: el banco no está mordiendo`);
  }
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

/* ═══════════════════════════ LOS DATOS REALES ════════════════════════════ */

function seedDelFichero(html) {
  const i = html.indexOf('const SEED');
  const j = html.indexOf('[', i);
  if (i < 0 || j < 0) return null;
  /* recorte por balance de corchetes, no por regex: el literal lleva comas,
     llaves y acentos dentro y una regex perezosa lo corta a mitad */
  let prof = 0, fin = -1, enTexto = false, esc = false;
  for (let k = j; k < html.length; k++) {
    const c = html[k];
    if (enTexto) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') enTexto = false; continue; }
    if (c === '"') { enTexto = true; continue; }
    if (c === '[') prof++;
    else if (c === ']') { prof--; if (prof === 0) { fin = k; break; } }
  }
  if (fin < 0) return null;
  return JSON.parse(html.slice(j, fin + 1));
}

/* El mismo dato con los nombres de campo de Supabase. Re-claveado, no
   inventado: ni un valor se toca. */
function reClavea(recs, MAPA) {
  return recs.map((r) => {
    const o = {};
    for (const [ct, cs] of Object.entries(MAPA)) if (r[ct] !== undefined) o[cs] = r[ct];
    return o;
  });
}

/* Y el CSV que saldría de ese lado, para probar el lector de CSV con el mismo
   formato que escribe la aplicación: BOM, separador `;`, comillas duplicadas. */
function aCsv(recs, etiquetaDe, columnas) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const cab = columnas.map((c) => esc(etiquetaDe[c] ?? c)).join(';');
  const filas = recs.map((r) => columnas.map((c) => esc(r[c])).join(';'));
  return '﻿' + [cab, ...filas].join('\n');
}

/* ═════════════════════════════════ PASES ═════════════════════════════════ */

async function main() {
  /* EL REPO HERMANO ES UN REQUISITO, NO UN EXTRA. Sin él no hay con qué carear,
     y lo que toca es decirlo —código 2, NO COMPROBADO— y no reventar con un
     ENOENT, que se lee como avería del banco y no como falta de entrada. */
  if (!fs.existsSync(RUTA_SB)) {
    console.log('NO COMPROBADO: falta el repo hermano `factiun-cartera` al lado de este.');
    console.log('  esperado en: ' + RUTA_SB);
    console.log('  este banco carea las DOS carteras: sin la otra no hay careo que hacer.');
    return 2;
  }
  const htmlTec = fs.readFileSync(RUTA_TEC, 'utf8');
  const htmlSb = fs.readFileSync(RUTA_SB, 'utf8');
  const M = await carga(null);

  /* ── 1. los esquemas salen del código, no de aquí ───────────────────────── */
  const esqT = M.esquemaTecnica(htmlTec);
  const esqS = M.esquemaSupabase(htmlSb);
  chk('esquema técnica: 51 campos', esqT && esqT.length, 51);
  chk('esquema supabase: 54 columnas', esqS && esqS.length, 54);
  chkQue('la técnica tiene `sist_control`', esqT.includes('sist_control'));
  chkQue('supabase tiene `control`', esqS.includes('control'));
  chkQue('supabase tiene `pem` (columna del CSV)', esqS.includes('pem'));

  /* un esquema que no se encuentra devuelve null, no una lista vacía: el
     informe lo convierte en NO COMPROBADO, que no es un pase */
  chk('esquema de un html sin KEYS -> null', M.esquemaTecnica('<html></html>'), null);
  chk('esquema de un html sin LABELS -> null', M.esquemaSupabase('<html></html>'), null);
  chk('esquema de texto vacío -> null', M.esquemaTecnica(''), null);

  const ce = M.careoDeEsquema(esqT, esqS);
  chk('ningún campo de la técnica se queda sin pareja', ce.sinPareja, []);
  chk('el mapa no apunta a campos inexistentes', ce.apuntaAlVacio, []);
  chk('el mapa es inyectivo', ce.colisiones, []);
  chk('sólo `tipo` se guarda en supabase y no en la técnica', ce.soloSupabase, ['tipo']);
  chk('pem y huecos van como calculados', ce.calculados, ['pem', 'huecos']);
  chk('careo de esquema con lista vacía -> null', M.careoDeEsquema([], esqS), null);
  chk('careo de esquema con null -> null', M.careoDeEsquema(null, esqS), null);

  /* ── 2. la maquinaria del careo de datos, sobre el SEED real ───────────── */
  const seed = seedDelFichero(htmlTec);
  chkQue('el SEED del fichero se lee', Array.isArray(seed) && seed.length > 0);
  chk('el SEED trae 22 plantas', seed.length, 22);
  chkQue('el SEED trae `num` numérico en la primera planta', typeof seed[0].num === 'number');

  const etiq = M.etiquetasSupabase(htmlSb);
  /* `etiq` va de etiqueta a clave, que es el sentido que necesita el lector de
     CSV. Para ESCRIBIR el CSV de prueba hace falta el inverso. */
  const etiquetaDe = Object.fromEntries(Object.entries(etiq).map(([lab, k]) => [k, lab]));
  chkQue('las etiquetas de supabase se leen', etiq && Object.keys(etiq).length > 40);
  chk('la etiqueta «Sistema control» vuelve a `control`', etiq['Sistema control'], 'control');
  chk('la etiqueta «Nº» vuelve a `code`', etiq['Nº'], 'code');

  const ladoSb = reClavea(seed, M.MAPA);
  const cd = M.careoDeDatos(seed, ladoSb);
  chk('mismo dato por los dos lados: 22 y 22', [cd.plantasTecnica, cd.plantasSupabase], [22, 22]);
  chk('las 22 están en las dos', cd.enLasDos, 22);
  chk('ninguna sólo en la técnica', cd.soloTecnica, []);
  chk('ninguna sólo en supabase', cd.soloSupabase, []);
  chk('ninguna sin Nº', [cd.sinCodigoTec, cd.sinCodigoSb], [[], []]);
  chk('ni una celda en desacuerdo', cd.discrepancias, []);

  /* y lo mismo pasando por el CSV de verdad, con BOM y comillas */
  const cols = Object.values(M.MAPA);
  const csv = aCsv(ladoSb, etiquetaDe, cols);
  const vs = M.volcadoSupabaseAFilas(csv, etiq);
  chkQue('el CSV con BOM se lee', vs && vs.recs.length === 22);
  chk('no quedan columnas sin reconocer', vs.columnasNoReconocidas, []);
  const cdCsv = M.careoDeDatos(seed, vs.recs);
  chk('vía CSV: ninguna planta sólo en un lado', [cdCsv.soloTecnica, cdCsv.soloSupabase], [[], []]);
  chk('vía CSV: ni una celda en desacuerdo', cdCsv.discrepancias, []);

  /* un campo con punto y coma dentro tiene que sobrevivir al viaje: es el caso
     que distingue un lector de CSV de un `split(";")` */
  const conPuntoYComa = ladoSb.map((r, i) => i === 0 ? { ...r, inv_modelo: 'SUN2000; 185KTL' } : r);
  const vsPyC = M.volcadoSupabaseAFilas(aCsv(conPuntoYComa, etiquetaDe, cols), etiq);
  chk('un `;` dentro de un campo no descoloca la fila', vsPyC.recs[0].inv_modelo, 'SUN2000; 185KTL');
  chk('y no se pierden plantas por el camino', vsPyC.recs.length, 22);

  /* normalización: los dos lados guardan el mismo dato con tipos distintos */
  chk('garantia: booleano true == "Sí"', M.normaliza(true, 'garantia'), M.normaliza('Sí', 'garantia'));
  chk('garantia: booleano true == "x"', M.normaliza(true, 'garantia'), M.normaliza('x', 'garantia'));
  chk('garantia: booleano true == "1"', M.normaliza(true, 'garantia'), M.normaliza('1', 'garantia'));
  chk('garantia: false == vacío', M.normaliza(false, 'garantia'), M.normaliza('', 'garantia'));
  chk('garantia: "0" == vacío', M.normaliza('0', 'garantia'), M.normaliza('', 'garantia'));
  chk('41,57 == 41.57', M.normaliza('41,57', 'lat'), M.normaliza('41.57', 'lat'));
  chk('24002 == "24002"', M.normaliza(24002, 'num'), M.normaliza('24002', 'num'));
  chk('"Sunner" == "sunner"', M.normaliza('Sunner', 'sist_control'), M.normaliza('sunner', 'sist_control'));
  chkQue('"Sunner" != "P4Q"', M.normaliza('Sunner', 'sist_control') !== M.normaliza('P4Q', 'sist_control'));
  /* LA DISTINCIÓN QUE CUESTA DATOS: en un contador, 0 es una medida y vacío es
     una ausencia. El banco pilló que estaban saliendo iguales. */
  chkQue('contador: "0" NO es vacío', M.normaliza('0', 'trk_bi') !== M.normaliza('', 'trk_bi'));
  chk('contador: "0" se queda en "0"', M.normaliza('0', 'trk_bi'), '0');
  chkQue('contador: "1" NO se convierte en «si»', M.normaliza('1', 'trk_bi') === '1');
  /* y la lista de sí/no no puede divergir del fuente de la técnica */
  const checksFuente = (htmlTec.match(/const CHECKS=new Set\(\[([^\]]*)\]/) || [])[1];
  chk('CAMPOS_SINO sigue siendo el CHECKS de la técnica',
      [...M.CAMPOS_SINO], [...(checksFuente || '').matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]));

  /* la clave: número y texto son la misma planta */
  chk('clave(24002) == clave("24002")', M.clave(24002), M.clave(' 24002 '));
  chk('clave de vacío -> null', M.clave('   '), null);
  chk('clave de null -> null', M.clave(null), null);

  /* el vacío es error, no pase */
  chk('volcado de la técnica vacío -> null', M.leerVolcadoTecnica(''), null);
  chk('volcado «const SEED = [];» -> null', M.leerVolcadoTecnica('const SEED = [];'), null);
  chk('volcado ilegible -> null', M.leerVolcadoTecnica('const SEED = [esto no es json];'), null);
  chk('csv de una sola línea -> null', M.leerCsvPuntoYComa('a;b;c'), null);
  chk('csv vacío -> null', M.leerCsvPuntoYComa(''), null);
  chk('careo de datos sin plantas -> null', M.careoDeDatos([], ladoSb), null);
  chk('vocabulario de lista vacía -> null', M.vocabulario([], 'sist_control'), null);
  chk('cabecera de csv no reconocida -> null', M.volcadoSupabaseAFilas('x;y\n1;2', etiq), null);

  /* vocabulario: el dato que abrió todo esto */
  const voc = M.vocabulario(seed, 'sist_control');
  chkQue('el SEED usa algún sistema de control', voc && voc.length > 0);
  chk('y en el SEED del repositorio son todos el mismo', voc.length, 1);
  chk('y es Sunner, 22 veces', [voc[0].valor, voc[0].veces], ['Sunner', 22]);

  /* ── 2 bis. vocabularios cerrados, contra el fuente de las dos ─────────── */
  const vt = M.vocabulariosTecnica(htmlTec);
  const vsb = M.vocabulariosSupabase(htmlSb);
  chkQue('se leen los vocabularios de la técnica', vt && Object.keys(vt).length > 5);
  chkQue('se leen los vocabularios de supabase', vsb && Object.keys(vsb).length > 5);
  chk('CTRL de la técnica', vt.sist_control, ['Sunner', 'P4Q', 'TracknCO', 'AiTracker']);
  chk('control de supabase', vsb.control, ['Sunner', 'P4Q']);
  /* ningún comentario del VOCABULARIO se cuela como campo */
  chkQue('los campos de supabase son todos claves reales', Object.keys(vsb).every((k) => esqS.includes(k)));
  /* ESTA DEFENSA NO LA EJERCITA EL FICHERO REAL: hoy ningún comentario del
     VOCABULARIO tiene la forma `clave:["a","b"]`, así que quitarla no cambiaría
     nada y la mutación que la ataca no moriría. Una defensa que no se ha visto
     fallar no es una defensa, así que se le da la entrada que sí la ejercita:
     un comentario que cita un campo retirado. Sin el filtro, ese campo
     fantasma entra en el vocabulario y el careo lo trataría como real. */
  const conComentario = 'const VOCABULARIO={\n' +
    '  /* ojo: `tipo_retirado:["Viejo","Antiguo"]` se quitó en 2026 */\n' +
    '  control:["Sunner","P4Q"],\n};';
  chk('un campo citado en un comentario NO entra en el vocabulario',
      Object.keys(M.vocabulariosSupabase(conComentario)), ['control']);

  const cv = M.careoDeVocabularios(vt, vsb);
  const porCampo = Object.fromEntries(cv.filas.map((f) => [f.campo, f]));
  chk('sist_control: TracknCO y AiTracker sólo los ofrece la técnica',
      porCampo.sist_control.soloTecnica, ['TracknCO', 'AiTracker']);
  chk('sist_control: supabase no ofrece ninguno que la técnica no tenga',
      porCampo.sist_control.soloSupabase, []);
  chk('panel_fv: «NA» sólo en la técnica', porCampo.panel_fv.soloTecnica, ['NA']);
  chk('bateria_tcu: «NA» en la técnica, «8Ah» en supabase',
      [porCampo.bateria_tcu.soloTecnica, porCampo.bateria_tcu.soloSupabase], [['NA'], ['8Ah']]);
  chk('las cinco fases salen marcadas como fase',
      cv.filas.filter((f) => f.esFase).map((f) => f.campo).sort(),
      ['cold', 'escaneo', 'hot', 'offset', 'site']);
  chk('`tipo` es la única lista que sólo existe en supabase', cv.soloEnSupabase, ['tipo']);
  chk('careo de vocabularios con uno vacío -> null', M.careoDeVocabularios({}, vsb), null);
  chk('vocabularios de un html pelado -> null', M.vocabulariosSupabase('<html></html>'), null);

  /* el vocabulario de fases y la lista de campos de fase no pueden divergir
     del fuente de la técnica, que es quien manda */
  const faseFuente = (htmlTec.match(/FASE=\[([^\]]*)\]/) || [])[1];
  chk('FASES_TECNICA sigue siendo el FASE del fuente', M.FASES_TECNICA,
      [...(faseFuente || '').matchAll(/'([^']*)'/g)].map((x) => x[1]));
  const fkeysFuente = (htmlTec.match(/FKEYS=\[([^\]]*)\]/) || [])[1];
  chk('CAMPOS_FASE sigue siendo el FKEYS del fuente', [...M.CAMPOS_FASE],
      [...(fkeysFuente || '').matchAll(/'([^']*)'/g)].map((x) => x[1]));

  /* la migración de fases, caso por caso, como la hace la aplicación */
  chk('migraFase(true) -> Terminado', M.migraFase(true), 'Terminado');
  chk('migraFase(false) -> Sin empezar', M.migraFase(false), 'Sin empezar');
  chk('migraFase(null) -> Sin empezar', M.migraFase(null), 'Sin empezar');
  chk('migraFase("x") -> Terminado', M.migraFase('x'), 'Terminado');
  chk('migraFase("Sí") -> Terminado', M.migraFase('Sí'), 'Terminado');
  chk('migraFase("En proceso") -> En proceso', M.migraFase('En proceso'), 'En proceso');
  chk('migraFase("en PROCESO") -> En proceso', M.migraFase('en PROCESO'), 'En proceso');
  chk('migraFase("Terminado") -> Terminado', M.migraFase('Terminado'), 'Terminado');
  chk('migraFase de algo que no es fase -> Sin empezar', M.migraFase('cualquier cosa'), 'Sin empezar');
  chk('faseABinario(Terminado) -> si', M.faseABinario('Terminado'), 'si');
  chk('faseABinario(En proceso) -> vacío', M.faseABinario('En proceso'), '');
  chk('faseABinario(Sin empezar) -> vacío', M.faseABinario('Sin empezar'), '');

  /* LA DEGRADACIÓN: la técnica dice «En proceso», supabase dice «No». El sí/no
     coincide —las dos dicen «no terminado»— y aun así hay que avisar. */
  const tecEnProceso = seed.map((r, i) => i === 0 ? { ...r, cold: 'En proceso' } : r);
  const sbNo = ladoSb.map((r, i) => i === 0 ? { ...r, cold_comm: 'No' } : r);
  const cdDeg = M.careoDeDatos(tecEnProceso, sbNo);
  const degs = cdDeg.discrepancias.filter((d) => d.tipo === 'degradacion');
  chk('una fase «En proceso» se anota como degradación', degs.length, 1);
  chk('y dice de qué planta y qué campo', [degs[0].code, degs[0].campo], ['24002', 'cold']);
  chkQue('y no la cuenta como contradicción',
      cdDeg.discrepancias.filter((d) => d.tipo === 'contradiccion').length === 0);

  /* ── 2 ter. LOS TRES VEREDICTOS DEL INFORME ────────────────────────────
   * Incluido el VERDE. Un verde que nunca se ha visto salir no está
   * comprobado: podría ser inalcanzable y el banco seguiría en verde, porque
   * nunca pide el verde.
   *
   * ═══ ESTE BLOQUE SE ESCRIBIÓ AL REVÉS Y HUBO QUE DARLE LA VUELTA ═══
   *
   * La primera versión decía: «el verde HOY es inalcanzable con los dos
   * ficheros de verdad, porque las fases PEM pierden un estado», y probaba el
   * verde contra una copia del fichero de Supabase con el tercer estado
   * añadido —«como quedaría el día que se arregle»—.
   *
   * Ese día llegó el mismo día. Se arregló en `factiun-cartera`
   * (`arreglo/checklist-pem-tercer-estado`): las cinco listas llevan ya los
   * tres estados y `pasosPEM()` tiene su cuarta cesta. Así que la copia
   * «arreglada» pasó a ser idéntica al original y la comprobación de que eran
   * distintas se puso ROJA — que es exactamente lo que tenía que pasar.
   *
   * Es la lección de siempre: al cerrar un hueco, lo primero es buscar todo lo
   * que decía que estaba abierto. Aquí lo decían tres comprobaciones y un
   * fixture, y el banco las cantó en el acto.
   *
   * Lo que se da la vuelta: el fixture ahora deriva la versión ROTA del
   * fichero bueno, no la buena del roto. Hace falta que siga existiendo,
   * porque si no el camino ROJO se quedaría sin probar justo por haberlo
   * arreglado en producción. */
  const callado = () => {};
  const volcadoTec = 'const SEED = ' + JSON.stringify(seed) + ';\n';
  const volcadoSb = aCsv(ladoSb, etiquetaDe, cols);

  /* EL ESTADO BUENO, con los dos ficheros tal cual están. Sin volcados sale 2
     —NO COMPROBADO— porque el careo de plantas no se puede hacer sin ellos, y
     eso NO es un pase: es «falta la mitad». Con volcados que coinciden, 0. */
  chk('con los ficheros de verdad y sin volcados -> 2, no comprobado',
      M.careoCompleto({ htmlTecnica: htmlTec, htmlSupabase: htmlSb, volcadoTecnica: null, volcadoSupabase: null }, callado), 2);
  chk('VERDE: con los ficheros de verdad y los dos volcados coincidiendo -> 0',
      M.careoCompleto({ htmlTecnica: htmlTec, htmlSupabase: htmlSb, volcadoTecnica: volcadoTec, volcadoSupabase: volcadoSb }, callado), 0);
  chk('no comprobado: html de supabase pelado -> 2',
      M.careoCompleto({ htmlTecnica: htmlTec, htmlSupabase: '<html></html>', volcadoTecnica: volcadoTec, volcadoSupabase: volcadoSb }, callado), 2);
  chk('no comprobado: html de la técnica pelado -> 2',
      M.careoCompleto({ htmlTecnica: '<html></html>', htmlSupabase: htmlSb, volcadoTecnica: volcadoTec, volcadoSupabase: volcadoSb }, callado), 2);

  /* Y QUE EL ARREGLO SIGUE PUESTO. Si alguien revierte las cinco listas de
     `factiun-cartera`, esto se pone rojo: es el guard de que el hueco no se
     reabra sin que nadie se entere. */
  const cvReal = M.careoDeVocabularios(M.vocabulariosTecnica(htmlTec), M.vocabulariosSupabase(htmlSb));
  chk('las cinco fases ya NO pierden estados en el fichero de verdad',
      cvReal.filas.filter((f) => f.esFase && f.pierdeEstados), []);
  chk('y las dos distinguen los mismos tres estados',
      [...new Set(cvReal.filas.filter((f) => f.esFase).map((f) => f.estadosSupabase))], [3]);

  /* EL FICHERO ROTO, derivado del bueno. Al revés que antes. */
  const htmlSbRoto = htmlSb.replace(/(cold_comm|site|escaneo|offset_col|hot_comm):\["Sí","En proceso","No"\]/g,
    (_, c) => `${c}:["Sí","No"]`);
  chkQue('la copia rota es distinta del original', htmlSbRoto !== htmlSb);
  const cvRoto = M.careoDeVocabularios(M.vocabulariosTecnica(htmlTec), M.vocabulariosSupabase(htmlSbRoto));
  chk('sin el tercer estado, las cinco fases pierden estados',
      cvRoto.filas.filter((f) => f.esFase && f.pierdeEstados).map((f) => f.campo).sort(),
      ['cold', 'escaneo', 'hot', 'offset', 'site']);
  chk('ROJO: con las fases rotas, aunque los volcados coincidan -> 1',
      M.careoCompleto({ htmlTecnica: htmlTec, htmlSupabase: htmlSbRoto, volcadoTecnica: volcadoTec, volcadoSupabase: volcadoSb }, callado), 1);

  /* y el verde tiene que dejar de serlo en cuanto falte UN dato: si no, el 0
     no afirma nada */
  const sinUnaPlanta = 'const SEED = ' + JSON.stringify(seed.slice(0, -1)) + ';\n';
  chk('quitar una planta del lado de supabase rompe el verde',
      M.careoCompleto({ htmlTecnica: htmlTec, htmlSupabase: htmlSb, volcadoTecnica: volcadoTec,
                        volcadoSupabase: aCsv(ladoSb.slice(0, -1), etiquetaDe, cols) }, callado), 1);
  chk('quitar una planta del lado de la técnica NO rompe el verde (se gana, no se pierde)',
      M.careoCompleto({ htmlTecnica: htmlTec, htmlSupabase: htmlSb, volcadoTecnica: sinUnaPlanta,
                        volcadoSupabase: volcadoSb }, callado), 0);
  const unaEnProceso = 'const SEED = ' + JSON.stringify(tecEnProceso) + ';\n';
  /* Una fase «En proceso» contra un «No» sigue rompiendo el verde, y ahora por
     el motivo bueno: no es que la otra cartera no sepa expresarlo —ya sabe—,
     es que los dos lados DISCREPAN sobre esa planta, y eso hay que decidirlo.
     El aviso sigue siendo conservador a propósito: la herramienta no puede
     comprobar desde aquí si `pasosPEM()` tiene su cuarta cesta, porque eso es
     código y no vocabulario. Equivocarse hacia «revisa» no cuesta datos. */
  chk('una fase «En proceso» contra un «No» rompe el verde',
      M.careoCompleto({ htmlTecnica: htmlTec, htmlSupabase: htmlSb, volcadoTecnica: unaEnProceso,
                        volcadoSupabase: aCsv(sbNo, etiquetaDe, cols) }, callado), 1);

  /* ── 3. LAS MUTACIONES ──────────────────────────────────────────────────
   * Cada una tiene que hacer que el careo CAMBIE DE VEREDICTO. Si una pasa
   * desapercibida, la comprobación de arriba que debería haberla pillado no
   * está comprobando nada. */
  const muertas = [];

  async function muerde(nombre, prueba) {
    const Mm = await carga(nombre);
    let murio = false;
    try { murio = await prueba(Mm); } catch { murio = true; }   // petar también es morder
    if (!murio) muertas.push(nombre);
    return murio;
  }

  await muerde('mapaIncompleto', (Mm) => {
    const c = Mm.careoDeEsquema(esqT, esqS);
    return c.sinPareja.includes('sist_control');
  });
  await muerde('mapaColision', (Mm) => Mm.careoDeEsquema(esqT, esqS).colisiones.length > 0);
  await muerde('mapaAlVacio', (Mm) => Mm.careoDeEsquema(esqT, esqS).apuntaAlVacio.includes('sist_control'));
  await muerde('calculadosComoCampos', (Mm) => {
    const c = Mm.careoDeEsquema(esqT, esqS);
    return c.soloSupabase.includes('pem') || c.soloSupabase.includes('huecos');
  });
  await muerde('sinNormalizar', (Mm) => {
    /* el SEED trae `garantia` booleano; por el lado «supabase» va como texto,
       que es como lo devuelve el CSV de verdad */
    const sbTexto = ladoSb.map((r) => ({ ...r, garantia: r.garantia ? 'Sí' : '' }));
    return Mm.careoDeDatos(seed, sbTexto).discrepancias.length > 0;
  });
  await muerde('fasesComoCampoNormal', (Mm) => {
    /* el SEED trae las fases como booleano viejo; sin la rama de fases el
       careo las compara en bruto y canta donde no hay nada que cantar, o
       deja de ver la degradación: cualquiera de las dos cosas lo delata */
    const c = Mm.careoDeDatos(tecEnProceso, sbNo);
    return c.discrepancias.filter((d) => d.tipo === 'degradacion').length !== 1;
  });
  await muerde('degradacionMuda', (Mm) =>
    Mm.careoDeDatos(tecEnProceso, sbNo).discrepancias.filter((d) => d.tipo === 'degradacion').length === 0);
  await muerde('vocabCiego', (Mm) => {
    const c = Mm.careoDeVocabularios(vt, vsb);
    const f = c.filas.find((x) => x.campo === 'sist_control');
    return !f || f.soloTecnica.length === 0;
  });
  await muerde('vocabConComentarios', (Mm) => {
    const v = Mm.vocabulariosSupabase(conComentario);
    return !v || Object.keys(v).includes('tipo_retirado');
  });
  await muerde('ceroEsVacio', (Mm) => Mm.normaliza('0', 'trk_bi') === Mm.normaliza('', 'trk_bi'));
  await muerde('claveLaxa', (Mm) => {
    /* el CSV devuelve el código como TEXTO; el SEED lo tiene como número */
    const sbTexto = ladoSb.map((r) => ({ ...r, code: String(r.code) }));
    const c = Mm.careoDeDatos(seed, sbTexto);
    return c.soloTecnica.length > 0 || c.soloSupabase.length > 0;
  });
  await muerde('vacioEsIgual', (Mm) => {
    /* se le quita a supabase un dato que la técnica SÍ tiene: el careo bueno
       lo canta como «se perdería», el mutado se lo traga */
    const campo = Object.keys(seed[0]).find((k) => k in M.MAPA && seed[0][k] !== '' && seed[0][k] != null);
    const sbMenos = ladoSb.map((r, i) => { if (i !== 0) return r; const o = { ...r }; delete o[M.MAPA[campo]]; return o; });
    return Mm.careoDeDatos(seed, sbMenos).discrepancias.length === 0;   // mutado: no ve nada
  });
  await muerde('vacioEsPase', (Mm) => {
    const r = Mm.leerVolcadoTecnica('const SEED = [];');
    return Array.isArray(r) && r.length === 0;   // mutado: devuelve [] en vez de null
  });
  await muerde('csvSinComillas', (Mm) => {
    const v = Mm.volcadoSupabaseAFilas(aCsv(conPuntoYComa, etiquetaDe, cols), etiq);
    return !v || v.recs.length !== 22 || v.recs[0].inv_modelo !== 'SUN2000; 185KTL';
  });

  /* y la comprobación de que el propio mutador muerde: una mutación que no
     cambia el fuente tiene que reventar, no pasar en silencio */
  let mutadorCiego = false;
  try {
    MUTACIONES.__inexistente = (s) => s;
    await carga('__inexistente');
  } catch { mutadorCiego = true; }
  chkQue('una mutación que no cambia nada revienta el banco', mutadorCiego);

  chk('todas las mutaciones mueren', muertas, []);

  /* ═════════════════════════════ VEREDICTO ═══════════════════════════════ */
  console.log(`\n  ${ok} comprobaciones pasadas · ${Object.keys(MUTACIONES).length - 1} mutaciones`);
  if (fallos.length) {
    console.log(`\n  ROJO ${fallos.length} fallos:`);
    for (const f of fallos) console.log('    · ' + f);
    return 1;
  }
  console.log('  MIDE: la herramienta de careo cuenta bien.');
  console.log('  Esto NO dice que las dos carteras coincidan: para eso hacen');
  console.log('  falta los dos volcados, que no están en el repositorio.');
  return 0;
}

main().then((rc) => process.exit(rc)).catch((e) => {
  console.log('NO COMPROBADO: ' + (e && e.stack || e));
  process.exit(2);
});
