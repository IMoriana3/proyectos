// LA CONFIGURACIÓN DE LA PUERTA, QUE HASTA HOY ERA PROSA.
//
// `docs/puertas-y-alcance.md` §5 bis describe el ajuste que hace obligatorio el
// check `navegador` en `main`, y terminaba declarando su propia debilidad:
// «este ajuste NO vive en el repo: no hay fichero que lo contenga ni arnés que
// lo compruebe, porque leerlo pide una llamada autenticada de administrador que
// la CI no tiene». **La segunda mitad de esa frase era falsa.** El repo es
// público y los dos objetos se leen SIN credencial:
//
//   curl https://api.github.com/repos/IMoriana3/proyectos
//   curl https://api.github.com/repos/IMoriana3/proyectos/rulesets
//
// Medido el 2026-10-02: HTTP 200 las dos, con `bypass_actors`, los contextos
// exigidos y `delete_branch_on_merge` dentro. O sea que lo que faltaba no era
// un permiso, era haberlo intentado. Este fichero es la consecuencia.
//
// LAS TRES COSAS QUE HACE, Y SON DISTINTAS:
//
//   A· LA REGLA, pura: qué tiene que cumplir una configuración para que la
//      puerta sea una puerta. Se ejercita SIEMPRE, contra configuraciones
//      sintéticas, con red o sin ella. Aquí vive el mecanismo, no en la
//      lectura: un arnés cuyas únicas comprobaciones fueran «lo que hay ahora
//      está bien» no podría ponerse rojo por una razón entendible.
//
//   B· EL CAREO CONTRA EL GOLDEN `goldens/puerta_main.json`, que es la
//      configuración MEDIDA. Cualquier deriva —incluso una inocente— sale roja
//      nombrando el campo y los dos valores. Si el cambio es a propósito, se
//      actualiza el golden y aparece en el diff; que es justo lo que un ajuste
//      que vive fuera del repo no consigue.
//
//   C· EL NOMBRE, CAREADO POR LAS DOS PUNTAS Y SIN RED. El contexto que el
//      golden exige (`navegador`) tiene que corresponder a un job REAL de
//      `.github/workflows/arneses.yml`. Ésta es la que más vale de las tres y
//      la que menos lo parece: un check obligatorio que no existe NO da error
//      de configuración, deja todas las PR del repo esperando para siempre un
//      «Expected — Waiting for status to be reported» que no nombra la causa.
//      Renombrar el job es la forma fácil de provocarlo, y hasta ahora nada en
//      el repo lo impedía. (Séptima lección del documento: el vacío se lee
//      como normal. No falla, calla.)
//
// EL HUECO, DECLARADO. Sin red, A y C corren enteras y B carea el golden
// contra sí mismo, pero NADIE comprueba que lo vivo siga pareciéndose al
// golden: una configuración cambiada a mano pasaría. La salida lo dice con esas
// palabras y el modo queda contado, como en `test_versiones_app.mjs`. El piso
// de `correr.sh` es el de SIN red a propósito —si fuera el de con red, una
// caída de api.github.com pondría la puerta en rojo por algo que no es un
// defecto de este repo—, y eso significa que el hueco es real y no teórico.
//
//   node tests/test_puerta_configurada.mjs
//   PUERTA_SIN_RED=1 node tests/test_puerta_configurada.mjs   (fuerza el modo degradado)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');

let ok = 0, ko = 0;
const check = (n, cond, extra) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra ? ' -> ' + String(extra) : '')); }
};

const GOLDEN = JSON.parse(fs.readFileSync(path.join(AQUI, 'goldens', 'puerta_main.json'), 'utf8'));

/* ─── A · LA REGLA ────────────────────────────────────────────────────────
   `faltas` son las que descalifican la puerta; `avisos` son hechos que
   conviene leer y NO suspenden. La distinción no es cosmética: exigir
   `allow_auto_merge` sería convertir una comodidad en requisito de
   integridad, y entonces apagarla pondría la puerta en rojo sin que la puerta
   esté peor. */
export function veredictoPuerta({ repo, ruleset, contextoEsperado }) {
  const faltas = [], avisos = [];
  const ctx = contextoEsperado || 'navegador';

  if (!ruleset) {
    faltas.push('no hay ningún ruleset sobre la rama por defecto');
    return { faltas, avisos };
  }
  if (ruleset.enforcement !== 'active') {
    faltas.push(`el ruleset está en "${ruleset.enforcement}" y no en "active"`);
  }
  if (ruleset.target !== 'branch') {
    faltas.push(`el ruleset apunta a "${ruleset.target}" y no a ramas`);
  }

  // ¿cubre la rama por defecto? `~DEFAULT_BRANCH` la sigue aunque se renombre;
  // nombrarla a pelo también vale, pero entonces tiene que ser la de verdad.
  const inc = ((ruleset.conditions || {}).ref_name || {}).include || [];
  const rama = (repo || {}).default_branch;
  const cubre = inc.includes('~DEFAULT_BRANCH') || inc.includes('~ALL') ||
                (rama && (inc.includes(rama) || inc.includes('refs/heads/' + rama)));
  if (!cubre) {
    faltas.push(`el ruleset no cubre la rama por defecto (${rama || '?'}): incluye ${JSON.stringify(inc)}`);
  }

  // LA DISPENSA. Un actor con bypass convierte el check obligatorio en una
  // sugerencia, y además lo hace en silencio: la PR enseña el check igual.
  const by = ruleset.bypass_actors || [];
  if (by.length) {
    faltas.push(`hay ${by.length} actor(es) con dispensa: ` +
                JSON.stringify(by.map(a => a.actor_type || a.actor_id)));
  }

  const regla = t => (ruleset.rules || []).find(r => r.type === t);
  if (!regla('deletion'))        faltas.push('la rama por defecto se puede BORRAR (falta la regla deletion)');
  if (!regla('non_fast_forward')) faltas.push('se puede reescribir la historia (falta la regla non_fast_forward)');

  const rsc = regla('required_status_checks');
  if (!rsc) {
    faltas.push('no hay ningún check obligatorio (falta la regla required_status_checks)');
  } else {
    const p = rsc.parameters || {};
    const ctxs = (p.required_status_checks || []).map(c => c.context);
    if (!ctxs.includes(ctx)) {
      faltas.push(`el check "${ctx}" no es obligatorio; los que hay: ${JSON.stringify(ctxs)}`);
    }
    // El nombre de la WEB (`workflow / job`) no existe como check run, y
    // escribirlo deja las PR esperando para siempre. §5 bis.
    for (const c of ctxs) {
      if (c.includes(' / ')) {
        faltas.push(`el contexto "${c}" tiene la forma «workflow / job» de la web, que NO existe como check run`);
      }
    }
    if (p.strict_required_status_checks_policy && (repo || {}).allow_auto_merge) {
      avisos.push('con el check en modo estricto, el auto-merge nativo NO actualiza la rama: ' +
                  'si se fusiona otra PR antes, la que tenga auto-merge armado se queda parada');
    }
  }

  const pr = regla('pull_request');
  if (pr && (pr.parameters || {}).required_approving_review_count === 0) {
    avisos.push('0 aprobaciones exigidas: quien revisa es el arnés, no una persona');
  }

  return { faltas, avisos };
}

/* ─── B · EL CAREO CONTRA EL GOLDEN ───────────────────────────────────────
   Carea SOLO los campos que el golden nombra. Un campo nuevo que GitHub
   añada mañana no es deriva —si no, este arnés se pondría rojo cada vez que
   GitHub amplíe su API, que no es un defecto de este repo—, pero un campo
   declarado que cambie de valor sí. */
export function deriva(esperado, vivo, ruta = '') {
  const salidas = [];
  if (Array.isArray(esperado)) {
    if (!Array.isArray(vivo)) return [`${ruta}: se esperaba una lista y hay ${typeof vivo}`];
    if (esperado.length !== vivo.length) {
      return [`${ruta}: la lista tiene ${vivo.length} elemento(s) y el golden declara ${esperado.length}`];
    }
    esperado.forEach((e, i) => salidas.push(...deriva(e, vivo[i], `${ruta}[${i}]`)));
    return salidas;
  }
  if (esperado && typeof esperado === 'object') {
    if (!vivo || typeof vivo !== 'object') return [`${ruta}: se esperaba un objeto y hay ${JSON.stringify(vivo)}`];
    for (const k of Object.keys(esperado)) {
      salidas.push(...deriva(esperado[k], vivo[k], ruta ? `${ruta}.${k}` : k));
    }
    return salidas;
  }
  if (esperado !== vivo) salidas.push(`${ruta}: vale ${JSON.stringify(vivo)} y el golden declara ${JSON.stringify(esperado)}`);
  return salidas;
}

/* EL ORDEN DE LAS REGLAS NO ES PARTE DEL AJUSTE. GitHub las devuelve en el
   orden que quiere, y comparar listas por índice convertiría una reordenación
   suya en un rojo de este repo. Se ordenan por tipo en las dos puntas. */
export function normaliza(rs) {
  if (!rs) return rs;
  return {
    ...rs,
    rules: (rs.rules || []).slice().sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0)),
    bypass_actors: (rs.bypass_actors || []).slice()
      .sort((a, b) => String(a.actor_id) < String(b.actor_id) ? -1 : 1),
  };
}

/* ─── C · LOS JOBS DEL WORKFLOW, SIN RED ──────────────────────────────────
   El nombre del check run es `jobs.<id>.name` si está, y el `<id>` si no.
   Esa precedencia es la trampa: añadir un `name:` a un job RENOMBRA su check
   y deja el obligatorio huérfano sin tocar el ajuste. */
export function jobsDe(yml) {
  const lineas = yml.split('\n');
  const jobs = [];
  let dentro = false, idActual = null, sangria = null;
  for (const l of lineas) {
    if (/^jobs:\s*$/.test(l)) { dentro = true; continue; }
    if (!dentro) continue;
    if (/^\S/.test(l) && l.trim() !== '') { dentro = false; continue; }   // otra clave de nivel 0
    const m = l.match(/^(\s+)([A-Za-z0-9_.-]+):\s*$/);
    if (m && (sangria === null || m[1].length === sangria)) {
      sangria = m[1].length;
      idActual = { id: m[2], nombre: null };
      jobs.push(idActual);
      continue;
    }
    if (idActual && sangria !== null) {
      const n = l.match(/^(\s+)name:\s*(.+?)\s*$/);
      if (n && n[1].length === sangria + 2) {
        idActual.nombre = n[2].replace(/^['"]|['"]$/g, '');
      }
    }
  }
  return jobs.map(j => j.nombre || j.id);
}

// ══════════════════════════════════════════════════════════════════════════
/* ─── EL CLON TIENE QUE SER EL REPO ──────────────────────────────────────
   El golden describe la puerta de UN repo. En un fork, leer la API del
   original y aprobarlo sería un verde falso sobre una puerta que no es la
   suya: el fork tendría su propia configuración, probablemente ninguna. Así
   que el careo vivo solo ocurre si el `origin` de este clon ES ese repo. */
export function slugDe(url) {
  if (!url) return null;
  const m = String(url).trim()
    .replace(/\.git$/, '')
    .match(/(?:github\.com[:/])([^/]+\/[^/]+)$/);
  return m ? m[1] : null;
}

console.log('── A · la regla, sobre configuraciones sintéticas ──');

const vivoGolden = { repo: GOLDEN.repositorio, ruleset: GOLDEN.ruleset };
const base = veredictoPuerta(vivoGolden);
check('el golden declarado no tiene ninguna falta', base.faltas.length === 0, JSON.stringify(base.faltas));
check('el golden sí levanta el aviso del estricto + auto-merge',
      base.avisos.some(a => a.includes('estricto')), JSON.stringify(base.avisos));
check('el golden sí levanta el aviso de las 0 aprobaciones',
      base.avisos.some(a => a.includes('0 aprobaciones')), JSON.stringify(base.avisos));

// clon profundo para mutar sin tocar el golden leído
const muta = f => { const c = JSON.parse(JSON.stringify(vivoGolden)); f(c); return veredictoPuerta(c); };
const falta = (v, frag) => v.faltas.some(x => x.includes(frag));

let m;
m = muta(c => { c.ruleset.enforcement = 'evaluate'; });
check('un ruleset en "evaluate" es una falta que nombra el estado', falta(m, 'evaluate'), JSON.stringify(m.faltas));
m = muta(c => { c.ruleset.enforcement = 'disabled'; });
check('un ruleset desactivado es una falta', falta(m, 'disabled'), JSON.stringify(m.faltas));
m = muta(c => { c.ruleset.target = 'tag'; });
check('un ruleset de etiquetas no protege una rama', falta(m, 'y no a ramas'), JSON.stringify(m.faltas));
m = muta(c => { c.ruleset.bypass_actors = [{ actor_id: 5, actor_type: 'RepositoryRole' }]; });
check('UN SOLO actor con dispensa es una falta', falta(m, 'dispensa'), JSON.stringify(m.faltas));
m = muta(c => { c.ruleset.conditions.ref_name.include = ['refs/heads/develop']; });
check('un ruleset sobre otra rama no cubre main', falta(m, 'no cubre la rama por defecto'), JSON.stringify(m.faltas));
m = muta(c => { c.ruleset.rules = c.ruleset.rules.filter(r => r.type !== 'deletion'); });
check('sin la regla deletion, main se puede borrar', falta(m, 'se puede BORRAR'), JSON.stringify(m.faltas));
m = muta(c => { c.ruleset.rules = c.ruleset.rules.filter(r => r.type !== 'non_fast_forward'); });
check('sin non_fast_forward, se puede reescribir la historia', falta(m, 'reescribir la historia'), JSON.stringify(m.faltas));
m = muta(c => { c.ruleset.rules = c.ruleset.rules.filter(r => r.type !== 'required_status_checks'); });
check('sin checks obligatorios, la puerta no es una puerta', falta(m, 'ningún check obligatorio'), JSON.stringify(m.faltas));
m = muta(c => {
  const r = c.ruleset.rules.find(x => x.type === 'required_status_checks');
  r.parameters.required_status_checks = [{ context: 'otro', integration_id: 15368 }];
});
check('si el check obligatorio es otro, lo dice nombrando los que hay', falta(m, '"navegador" no es obligatorio'), JSON.stringify(m.faltas));
m = muta(c => {
  const r = c.ruleset.rules.find(x => x.type === 'required_status_checks');
  r.parameters.required_status_checks = [{ context: 'arneses / navegador', integration_id: 15368 }];
});
check('el nombre de la WEB («arneses / navegador») se caza como forma inválida',
      falta(m, 'NO existe como check run'), JSON.stringify(m.faltas));
m = muta(c => {
  const r = c.ruleset.rules.find(x => x.type === 'required_status_checks');
  r.parameters.required_status_checks = [{ context: 'Navegador', integration_id: 15368 }];
});
check('el contexto distingue mayúsculas: «Navegador» no vale', falta(m, '"navegador" no es obligatorio'), JSON.stringify(m.faltas));
check('sin ruleset ninguno, una falta y una sola',
      veredictoPuerta({ repo: GOLDEN.repositorio, ruleset: null }).faltas.length === 1);

// La separación entre A y B, probada: la regla NO opina de las comodidades.
/* CONTRA LA LÍNEA BASE, no contra el vacío. La primera versión de estas tres
   decía `faltas.length === 0`, que NO es lo que afirman: cualquier falta
   metida en el golden las ponía rojas las tres a la vez sin que lo que
   vigilan hubiera cambiado. Lo cazaron los mutantes M4 y M5 —seis bajas
   donde predije tres—, y el exceso era esto. «No añade ninguna falta» es la
   afirmación de verdad. */
const mismasFaltas = v => JSON.stringify(v.faltas) === JSON.stringify(base.faltas);
m = muta(c => { c.repo.delete_branch_on_merge = false; });
check('apagar el borrado de ramas NO añade falta a la REGLA (lo caza el careo)', mismasFaltas(m), JSON.stringify(m.faltas));
m = muta(c => { c.repo.allow_auto_merge = false; });
check('apagar el auto-merge NO añade falta a la regla', mismasFaltas(m), JSON.stringify(m.faltas));
check('…y entonces el aviso del estricto desaparece',
      !m.avisos.some(a => a.includes('estricto')), JSON.stringify(m.avisos));
m = muta(c => {
  c.ruleset.rules.find(x => x.type === 'required_status_checks').parameters.strict_required_status_checks_policy = false;
});
check('sin modo estricto, tampoco hay aviso de parada', !m.avisos.some(a => a.includes('estricto')), JSON.stringify(m.avisos));
check('…y quitar el estricto no añade falta: tiene coste, no es integridad', mismasFaltas(m), JSON.stringify(m.faltas));
m = muta(c => {
  c.ruleset.rules.find(x => x.type === 'pull_request').parameters.required_approving_review_count = 1;
});
check('con 1 aprobación exigida, el aviso de las 0 desaparece',
      !m.avisos.some(a => a.includes('0 aprobaciones')), JSON.stringify(m.avisos));

console.log('── B · el careo contra el golden ──');
check('el golden no deriva de sí mismo', deriva(GOLDEN.repositorio, GOLDEN.repositorio).length === 0);
/* FIXTURE LITERAL a propósito: la primera versión lo construía desde el
   golden, y entonces un golden con `delete_branch_on_merge:false` dejaba el
   fixture sin diferencia que encontrar. El mecanismo tiene que estar en el
   fixture, no heredado de lo que el fixture vigila. */
check('un booleano cambiado se nombra con los DOS valores',
      deriva({ delete_branch_on_merge: true }, { delete_branch_on_merge: false })
        .some(d => d.includes('delete_branch_on_merge') && d.includes('false') && d.includes('true')));
check('un campo que falta en lo vivo también es deriva',
      deriva(GOLDEN.repositorio, {}).length > 0);
check('un campo NUEVO en lo vivo no es deriva (el golden manda lo que mira)',
      deriva(GOLDEN.repositorio, { ...GOLDEN.repositorio, campo_que_github_añada: 1 }).length === 0);
check('una regla menos en lo vivo es deriva por longitud de lista',
      deriva(GOLDEN.ruleset, { ...GOLDEN.ruleset, rules: GOLDEN.ruleset.rules.slice(1) })
        .some(d => d.includes('rules') && d.includes('golden declara')));
check('un actor con dispensa aparecido de la nada es deriva',
      deriva(GOLDEN.ruleset, { ...GOLDEN.ruleset, bypass_actors: [{ actor_id: 1 }] }).length > 0);

check('reordenar las reglas NO es deriva (lo normaliza antes de carear)',
      deriva(normaliza(GOLDEN.ruleset),
             normaliza({ ...GOLDEN.ruleset, rules: GOLDEN.ruleset.rules.slice().reverse() })).length === 0);
check('…y el normalizador no se come ninguna regla',
      normaliza(GOLDEN.ruleset).rules.length === GOLDEN.ruleset.rules.length);
check('sin normalizar, el orden SÍ se notaría (prueba de que el normalizador hace algo)',
      GOLDEN.ruleset.rules.length > 1 &&
      deriva(GOLDEN.ruleset, { ...GOLDEN.ruleset, rules: GOLDEN.ruleset.rules.slice().reverse() }).length > 0);

console.log('── C · el nombre, careado contra el workflow (sin red) ──');
const YML = path.join(RAIZ, '.github', 'workflows', 'arneses.yml');
const jobs = jobsDe(fs.readFileSync(YML, 'utf8'));
const CTX = (GOLDEN.ruleset.rules.find(r => r.type === 'required_status_checks')
  .parameters.required_status_checks).map(c => c.context);
console.log('     ── jobs de arneses.yml: ' + JSON.stringify(jobs) +
            ' · contextos exigidos: ' + JSON.stringify(CTX) + ' ──');
check('el lector de jobs encuentra al menos uno', jobs.length > 0, JSON.stringify(jobs));
for (const c of CTX) {
  check(`el check obligatorio "${c}" corresponde a un job real del workflow`,
        jobs.includes(c), 'jobs: ' + JSON.stringify(jobs));
}
check('un `name:` dentro del job RENOMBRA su check run',
      jobsDe('jobs:\n  navegador:\n    name: otra cosa\n    runs-on: x\n')[0] === 'otra cosa');
check('sin `name:`, el nombre del check es el id del job',
      jobsDe('jobs:\n  navegador:\n    runs-on: x\n')[0] === 'navegador');
check('un `name:` de un PASO no se confunde con el del job',
      JSON.stringify(jobsDe('jobs:\n  navegador:\n    steps:\n      - name: correr\n')) === '["navegador"]');
check('el lector ve los DOS jobs cuando hay dos',
      JSON.stringify(jobsDe('jobs:\n  uno:\n    runs-on: x\n  dos:\n    name: Dos\n')) === '["uno","Dos"]');
check('lo que viene DESPUÉS del bloque jobs no cuenta como job',
      JSON.stringify(jobsDe('jobs:\n  uno:\n    runs-on: x\nconcurrency:\n  group: g\n')) === '["uno"]');

check('el slug sale de una url https', slugDe('https://github.com/IMoriana3/proyectos.git') === 'IMoriana3/proyectos');
check('…y de una ssh', slugDe('git@github.com:IMoriana3/proyectos.git') === 'IMoriana3/proyectos');
check('…y sin el .git', slugDe('https://github.com/IMoriana3/proyectos') === 'IMoriana3/proyectos');
check('un fork da OTRO slug, que es el punto de la comprobación',
      slugDe('https://github.com/otra-persona/proyectos.git') === 'otra-persona/proyectos');
check('lo que no es una url de GitHub no da slug', slugDe('/ruta/local/proyectos') === null);

console.log('── D · la lectura en vivo ──');
check('con token y 401, se reintenta en anónimo', reintentaEnAnonimo('HTTP 401', 'tok'));
check('con token y 403, también', reintentaEnAnonimo('HTTP 403', 'tok'));
check('SIN token no se reintenta: no hay nada que quitar', !reintentaEnAnonimo('HTTP 401', undefined));
check('con token y un 404, NO se reintenta: eso no lo arregla quitar la credencial',
      !reintentaEnAnonimo('HTTP 404', 'tok'));
check('con token y sin error, no se reintenta', !reintentaEnAnonimo(undefined, 'tok'));
const API = 'https://api.github.com/repos/' + GOLDEN.repo;

/* SE LEE CON `curl`, NO CON `fetch`, y la razón está medida. El `fetch` de Node
   22 NO honra `HTTPS_PROXY`: en este contenedor sale directo y el proxy de
   egreso le devuelve 403, mientras `curl` a la misma URL da 200. (Con
   `NODE_USE_ENV_PROXY=1` también funciona, pero es experimental y no estaría
   puesto en el runner.) `correr.sh` ya depende de `curl` para comprobar el
   servidor, así que no añade dependencia.
   El token, si está, va por la ENTRADA ESTÁNDAR —`-K -`— y no por argv: en
   argv lo vería cualquiera que liste los procesos del runner. */
function leerCon(url, token) {
  const cfg = ['header = "accept: application/vnd.github+json"',
               'header = "user-agent: factiun-arneses"'];
  if (token) cfg.push(`header = "authorization: Bearer ${token}"`);
  try {
    const salida = execFileSync('curl', ['-sS', '-K', '-', '--max-time', '20',
                                         '-w', '\n%{http_code}', url],
                                { input: cfg.join('\n') + '\n', encoding: 'utf8', maxBuffer: 8e6 });
    const corte = salida.lastIndexOf('\n');
    const codigo = salida.slice(corte + 1).trim();
    if (codigo !== '200') return { err: 'HTTP ' + codigo };
    return { dato: JSON.parse(salida.slice(0, corte)) };
  } catch (e) { return { err: String((e && e.message) || e).split('\n')[0] }; }
}

/* UN TOKEN FLOJO ES PEOR QUE NINGUNO, y de ahí esta caída. Estos dos objetos
   se leen SIN credencial porque el repo es público; un token con permisos
   insuficientes devuelve 401/403 donde el anónimo devuelve 200, así que
   mandarlo puede EMPEORAR la lectura. Por eso el workflow NO lo pasa y, si
   alguien lo pone a mano, un 401/403 reintenta en anónimo y lo DECLARA.

   EL 401 REAL NO SE HA PODIDO PROVOCAR DESDE ESTE CONTENEDOR, y lo digo en vez
   de dejarlo parecer probado: con `GITHUB_TOKEN=noesuntokenvalido` la API
   responde 200. La cabecera SÍ sale —`curl -v` imprime
   `> authorization: Bearer ZZZ`—, así que no es que no se envíe: el proxy de
   egreso de este entorno la intercepta. Lo que SÍ se ejercita es la DECISIÓN,
   extraída a función pura justo debajo y probada en sus cuatro combinaciones.
   Lo que queda sin ejercitar es el viaje, no el criterio. */
export function reintentaEnAnonimo(err, hayToken) {
  return Boolean(hayToken && err && /HTTP 40[13]/.test(err));
}

let caidaDeToken = null;
function leer(url) {
  const tok = process.env.GITHUB_TOKEN;
  const r = leerCon(url, tok);
  if (reintentaEnAnonimo(r.err, tok)) {
    const anon = leerCon(url, null);
    if (!anon.err) { caidaDeToken = r.err; return anon; }
  }
  return r;
}

let modo = 'DECLARADO: no se ha podido leer la configuración viva';
let origen = null;
try {
  origen = slugDe(execFileSync('git', ['-C', RAIZ, 'remote', 'get-url', 'origin'],
                               { encoding: 'utf8' }).trim());
} catch { /* sin git o sin origin: se declara abajo */ }

if (process.env.PUERTA_SIN_RED) {
  modo = 'DECLARADO: modo sin red forzado (PUERTA_SIN_RED)';
} else if (origen !== GOLDEN.repo) {
  modo = `DECLARADO: este clon es ${origen || 'sin origin'} y el golden describe ${GOLDEN.repo}` +
         ' — no se lee nada: aprobar la puerta de OTRO repo sería un verde falso';
} else {
  const rRepo = leer(API);
  const rSets = leer(API + '/rulesets');
  if (rRepo.err || rSets.err) {
    modo = 'DECLARADO: no alcanzable (' + (rRepo.err || rSets.err) + ')';
  } else {
    const cab = (rSets.dato || []).find(s => s.name === GOLDEN.ruleset.name);
    if (!cab) {
      modo = 'LEÍDO';
      check(`existe un ruleset llamado "${GOLDEN.ruleset.name}"`, false,
            'los que hay: ' + JSON.stringify((rSets.dato || []).map(s => s.name)));
    } else {
      const rDet = leer(API + '/rulesets/' + cab.id);
      if (rDet.err) {
        modo = 'DECLARADO: el ruleset se lista pero no se detalla (' + rDet.err + ')';
      } else {
        modo = 'LEÍDO de api.github.com';
        const vivo = { repo: rRepo.dato, ruleset: rDet.dato };
        const v = veredictoPuerta(vivo);
        check('la configuración VIVA no tiene ninguna falta', v.faltas.length === 0, JSON.stringify(v.faltas));
        const d = [
          ...deriva(GOLDEN.repositorio, rRepo.dato, 'repo'),
          ...deriva(normaliza(GOLDEN.ruleset), normaliza(rDet.dato), 'ruleset'),
        ];
        check('la configuración VIVA no deriva del golden', d.length === 0,
              d.join(' · ') + '  (si el cambio es a propósito, actualiza tests/goldens/puerta_main.json)');
        for (const a of v.avisos) console.log('     ── aviso: ' + a);
      }
    }
  }
}
if (caidaDeToken) console.log('     ── el GITHUB_TOKEN dio ' + caidaDeToken +
                             ' y se ha leído en ANÓNIMO (un token flojo es peor que ninguno) ──');
console.log('     ── modo de la lectura viva: ' + modo + ' ──');
if (!modo.startsWith('LEÍDO')) {
  console.log('     ── HUECO ABIERTO: nadie ha comprobado que lo vivo siga pareciéndose al golden ──');
}
check('el modo de la lectura viva queda declarado en la salida', true);

console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
process.exit(ko ? 1 : 0);
