/* ¿COMPARTEN ORIGEN LOS QUE SE PASAN EL CATÁLOGO DE PLANTAS?
 *
 * ═══ EL FALLO QUE ESTO EXISTE PARA NO REPETIR ═══
 *
 * `cartera-tabla.html` publica el catálogo de plantas en `localStorage` bajo
 * `factiun_plantas`, y once páginas lo leen. Su propio comentario justifica el
 * mecanismo: «imoriana3.github.io es un único origen, así que el localStorage es
 * común». Era verdad el día que se escribió.
 *
 * Después, Proyectos se fue a `panel-im3.pages.dev` y Cobertura-Zigbee a
 * `cobertura-zigbee.imoriana3.workers.dev`. Dos dominios. Y `localStorage` es
 * POR ORIGEN, así que las cinco páginas de Cobertura-Zigbee dejaron de ver el
 * catálogo — sin dar error, con el selector de plantas vacío, como si no
 * hubiera plantas. Confirmado el 2026-10-22 abriendo `overcast.html`.
 *
 * Lo que lo hizo invisible no fue la migración: fue que NADA lo comprobaba. Una
 * premisa escrita en un comentario no es una puerta; caduca sin avisar.
 *
 * ═══ QUÉ COMPRUEBA, Y QUÉ NO ═══
 *
 * SÍ: que el censo de participantes de `tests/origenes_catalogo.json` esté
 * completo —que no haya una página que toque la clave y no esté declarada, ni
 * una declarada que ya no la toque— y que todos los orígenes declarados sean el
 * mismo. Eso hace que mover un repo de dominio sea imposible en silencio: hay
 * que editar el censo, y entonces esto canta.
 *
 * NO: que el despliegue real sea el que dice el censo. Eso se mide con red
 * contra producción, y lo hace `tools/test_cloudflare_access.mjs` para lo suyo.
 * Aquí se comprueba la COHERENCIA de lo declarado, que es lo que se puede
 * comprobar sin salir del repositorio y lo que faltaba.
 *
 * Códigos de salida: 0 MIDE · 1 ROJO · 2 NO COMPROBADO.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const HERMANO = path.join(RAIZ, '..', 'Cobertura-Zigbee');
const CENSO = path.join(RAIZ, 'tests', 'origenes_catalogo.json');
const CLAVE = 'factiun_plantas';

let ok = 0;
const fallos = [];
function chk(nombre, real, esperado) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log('OK   ' + nombre); return true; }
  console.log('FAIL ' + nombre + ' -> esperado ' + b + ', medido ' + a);
  fallos.push(nombre);
  return false;
}
const chkQue = (n, c) => chk(n, !!c, true);

/* Quién toca la clave DE VERDAD, leído de los ficheros. El censo se compara
   contra esto, no al contrario: un censo que se cree a sí mismo no mide nada. */
function escanea(dir, repo) {
  if (!fs.existsSync(dir)) return null;
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.html')) continue;
    let src;
    try { src = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    /* se busca la clave en una llamada de verdad a localStorage, no en prosa:
       los comentarios de estos ficheros la nombran mucho al explicarse */
    const escribe = new RegExp(`setItem\\(\\s*['"\`]${CLAVE}['"\`]`).test(src);
    const lee = new RegExp(`getItem\\(\\s*['"\`]${CLAVE}['"\`]`).test(src);
    if (escribe || lee) out.push({ repo, fichero: f, papel: escribe ? 'escribe' : 'lee' });
  }
  return out;
}

const censo = (() => {
  try { return JSON.parse(fs.readFileSync(CENSO, 'utf8')); } catch { return null; }
})();
if (!censo || !Array.isArray(censo.participantes)) {
  console.log('NO COMPROBADO: no se ha podido leer tests/origenes_catalogo.json');
  process.exit(2);
}

const aquí = escanea(RAIZ, 'Proyectos');
const allí = escanea(HERMANO, 'Cobertura-Zigbee');
if (!aquí) { console.log('NO COMPROBADO: no se ha podido escanear este repositorio'); process.exit(2); }
if (!allí) {
  console.log('NO COMPROBADO: falta el repo hermano `Cobertura-Zigbee` al lado de este.');
  console.log('  esperado en: ' + HERMANO);
  console.log('  cinco de los once participantes viven allí: sin el repo, el censo no se');
  console.log('  puede carear y decir que está bien sería afirmar lo que no se ha mirado.');
  process.exit(2);
}

/* ── 1. el censo está completo por los dos lados ─────────────────────────── */
const medidos = [...aquí, ...allí];
const clave = (x) => `${x.repo}/${x.fichero}`;
const porMedido = new Map(medidos.map((x) => [clave(x), x]));
const porCensado = new Map(censo.participantes.map((x) => [clave(x), x]));

const sinDeclarar = [...porMedido.keys()].filter((k) => !porCensado.has(k));
const sobran = [...porCensado.keys()].filter((k) => !porMedido.has(k));
chk('ninguna página toca la clave sin estar declarada', sinDeclarar, []);
chk('ninguna declarada ha dejado de tocarla', sobran, []);

/* y el papel declarado tiene que ser el que hace */
const papelMal = [...porMedido.entries()]
  .filter(([k, v]) => porCensado.has(k) && porCensado.get(k).papel !== v.papel)
  .map(([k, v]) => `${k}: hace «${v.papel}», declarado «${porCensado.get(k).papel}»`);
chk('el papel declarado coincide con el que hace', papelMal, []);

chkQue('hay al menos un escritor', medidos.some((x) => x.papel === 'escribe'));
chkQue('hay lectores', medidos.filter((x) => x.papel === 'lee').length > 1);

/* ── 2. LA COMPROBACIÓN QUE FALTABA: un solo origen ──────────────────────── */
const origenes = [...new Set(censo.participantes.map((p) => p.origen))].sort();
console.log(`\n  orígenes declarados: ${origenes.length}`);
for (const o of origenes) {
  const quienes = censo.participantes.filter((p) => p.origen === o);
  const papeles = [...new Set(quienes.map((q) => q.papel))].join('+');
  console.log(`    ${o}   ${quienes.length} páginas (${papeles})`);
}

const unSoloOrigen = origenes.length === 1;
if (!unSoloOrigen) {
  /* ROTO, Y DECLARADO COMO TAL. Mientras el censo lo reconozca en
     `roto_conocido`, esto no es una regresión nueva: es el estado que ya se
     midió, y el banco lo recuerda en voz alta en vez de callarlo. Lo que no se
     permite es que esté roto SIN estar declarado. */
  const r = censo.roto_conocido;
  const declarado = r && Array.isArray(r.a_quien_afecta) && r.a_quien_afecta.length > 0;
  chkQue('si hay más de un origen, está declarado en `roto_conocido`', declarado);
  if (declarado) {
    const afectadas = censo.participantes
      .filter((p) => p.origen !== censo.origen_esperado && p.papel === 'lee')
      .map((p) => p.fichero).sort();
    chk('y la lista de afectadas es exactamente la que sale del censo',
      afectadas, [...r.a_quien_afecta].sort());
    chkQue('con fecha de cuándo se confirmó', typeof r.confirmado === 'string' && r.confirmado.length >= 10);
    chkQue('con cómo se confirmó', typeof r.como_se_confirmo === 'string' && r.como_se_confirmo.length > 10);
    chkQue('y con qué se decidió hacer', typeof r.decidido === 'string' && r.decidido.length > 10);
  }
  console.log('\n  ROJO · el catálogo de plantas NO se reparte: hay ' + origenes.length + ' orígenes.');
  console.log('         `localStorage` es por origen, así que las páginas de los demás');
  console.log('         orígenes leen su propio almacén, donde nadie escribe la clave.');
  console.log('         No dan error: salen con el selector de plantas VACÍO.');
  console.log(`\n  ${ok} comprobaciones pasadas`);
  if (fallos.length) { console.log(`  y ${fallos.length} fallos además del origen partido`); }
  process.exit(1);
}

/* ── 3. el origen único tiene que ser el que escribe ─────────────────────── */
chk('el origen único es el declarado como esperado', origenes[0], censo.origen_esperado);
const escritores = censo.participantes.filter((p) => p.papel === 'escribe');
chk('todos los escritores están en el origen esperado',
  escritores.filter((e) => e.origen !== censo.origen_esperado).map((e) => e.fichero), []);

console.log(`\n  ${ok} comprobaciones pasadas`);
if (fallos.length) {
  console.log(`  ROJO ${fallos.length} fallos: ${fallos.join(' · ')}`);
  process.exit(1);
}
console.log('  MIDE: los once se pasan el catálogo en un solo origen.');
process.exit(0);
