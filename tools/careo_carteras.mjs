/* CAREO DE LAS DOS CARTERAS, PARA NO PERDER NADA AL QUEDARSE CON UNA.
 *
 * ═══ QUÉ HAY QUE CAREAR Y POR QUÉ ═══
 *
 * Hay dos aplicaciones de cartera vivas y sin ninguna referencia entre ellas:
 *
 *   «Cartera técnica»    Proyectos/cartera-tabla.html   panel-im3.pages.dev
 *                        sin login · los datos viven en localStorage
 *   «Cartera de plantas» factiun-cartera/index.html     *.imoriana3.workers.dev
 *                        con login · los datos viven en Supabase
 *
 * Antes de borrar una hay que saber QUÉ TIENE CADA UNA QUE LA OTRA NO. Eso son
 * tres careos distintos, y confundirlos es la forma de perder datos creyendo
 * haber comprobado:
 *
 *   1. ESQUEMA   qué campos tiene cada una. Se puede hacer desde el repositorio
 *                —está en el código— y lo hace este fichero solo.
 *   2. PLANTAS   qué filas tiene cada una. NO se puede hacer desde el
 *                repositorio: hace falta un volcado de cada aplicación.
 *   3. VALORES   para las plantas que están en las dos, en qué celdas difieren.
 *                También necesita los dos volcados.
 *
 * ═══ EL AGUJERO QUE ESTO EXISTE PARA MEDIR ═══
 *
 * La cartera técnica guarda en `localStorage`, y su propio código ya lo avisa
 * (cartera-tabla.html, comentario de `seedBtn`): lo que se teclea allí se queda
 * en UN navegador y no llega nunca al repositorio. El aviso tiene una víctima
 * con nombre: Conselice, que el comentario cita como planta existente en el
 * navegador y en ningún fichero. Se ha comprobado y es cierto — «Conselice»
 * aparece en el fichero UNA vez, y es en el texto de ese comentario.
 *
 * Consecuencia para este careo: el `SEED` del repositorio NO es la cartera
 * técnica. Es lo que ve un navegador que nunca la ha abierto. El dato real está
 * en el navegador de quien la usa, y la única forma de sacarlo es el botón
 * «⬇ SEED» de la propia página. Carear contra el `SEED` del repositorio y
 * concluir «no falta nada» sería mirar el sitio equivocado.
 *
 * ═══ CÓDIGOS DE SALIDA ═══
 *   0  MIDE          el careo se ha hecho y lo que dice es lo que ha medido
 *   1  ROJO          hay diferencias que harían perder información al borrar
 *   2  NO COMPROBADO falta un volcado, o el que hay está vacío o ilegible
 *
 * El vacío es 2, nunca 0: un careo sin datos no afirma que no falte nada.
 */

import { readFileSync } from 'node:fs';

/* ══════════════════════════ 1. LOS DOS ESQUEMAS ══════════════════════════ */

/* Se extraen del código fuente en vez de copiarse aquí, para que no puedan
   divergir de él en silencio: si alguien añade un campo a una de las dos
   aplicaciones, este careo lo ve en el siguiente pase. */

export function esquemaTecnica(html) {
  const m = html.match(/const\s+KEYS\s*=\s*(\[[^\]]*\])/);
  if (!m) return null;
  const claves = [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]);
  return claves.length ? claves : null;
}

export function esquemaSupabase(html) {
  const m = html.match(/const\s+LABELS\s*=\s*\{([\s\S]*?)\};/);
  if (!m) return null;
  const claves = [...m[1].matchAll(/([a-z_0-9]+)\s*:\s*"/g)].map((x) => x[1]);
  return claves.length ? claves : null;
}

/* LA CORRESPONDENCIA ENTRE LOS DOS ESQUEMAS.
 *
 * Hecha a mano, campo a campo, leyendo las etiquetas visibles de las dos
 * aplicaciones —no por parecido de nombre: `concentradores` y `ncu_total` se
 * llaman distinto y son el mismo dato, y `inversor` y `inv_tipo` también. Cada
 * línea es una AFIRMACIÓN comprobable, y el banco comprueba que la tabla es
 * total por el lado de la técnica e inyectiva: ningún campo de la técnica se
 * queda sin pareja y ninguno de Supabase recibe dos.
 */
export const MAPA = {
  num: 'code',
  proyecto: 'proyecto',
  emplazamiento: 'empl',
  provincia: 'prov',
  pais: 'pais',
  promotor: 'promotor',
  epc: 'epc',
  responsable: 'responsable',
  pac: 'mwac',
  pdc: 'mwdc',
  modulista: 'modulista',
  modulo: 'modulo',
  wmod: 'pot_modulo',
  cantidad: 'n_modulos',
  string: 'string_cfg',
  pitch: 'pitch',
  tecnologia: 'tech',
  inversor: 'inv_tipo',
  invfab: 'inv_fab',
  invmodelo: 'inv_modelo',
  trk_total: 'trackers',
  trk_bi: 'trackers_bifila',
  trk_mono: 'trackers_monofila',
  concentradores: 'ncu_total',
  ncu_eth: 'ncu_eth',
  ncu_fo: 'ncu_fo',
  anem_total: 'anem_total',
  anem_vel: 'anem_veleta',
  anem_us: 'anem_us',
  sensor_nieve: 'sensor_nieve',
  alim_rsu: 'alim_rsu',
  alim_tcu: 'alim_tcu',
  panel_fv: 'panel_fv',
  panel_modelo: 'panel_fv_modelo',
  bateria_tcu: 'bateria_tcu',
  repetidores: 'repetidores',
  sist_control: 'control',
  comunicaciones: 'comms',
  cold: 'cold_comm',
  site: 'site',
  escaneo: 'escaneo',
  offset: 'offset_col',
  hot: 'hot_comm',
  estado_pem: 'estado',
  garantia: 'garantia',
  inicio_pem: 'inicio_pem',
  final_pem: 'final_pem',
  duracion_pem: 'duracion_pem',
  acceso: 'acceso_remoto',
  lat: 'lat',
  lon: 'lng',
};

/* COLUMNAS CALCULADAS, NO GUARDADAS.
 *
 * `pem` y `huecos` salen en el CSV de la cartera de Supabase, pero no son
 * campos: el exportador los calcula al vuelo (`pasosPEM(p)` cuenta pasos del
 * checklist, `huecosDe(p)` cuenta celdas vacías). Si se cuentan como «campos
 * que la técnica no tiene», el careo dice que Supabase guarda dos datos más de
 * los que guarda. Van aparte y con su motivo. */
export const CALCULADOS_SUPABASE = {
  pem: 'calculado por pasosPEM(): pasos hechos del checklist, no se guarda',
  huecos: 'calculado por huecosDe(): celdas vacías de la fila, no se guarda',
};

export function careoDeEsquema(tec, sb, mapa = MAPA) {
  if (!Array.isArray(tec) || !tec.length || !Array.isArray(sb) || !sb.length) return null;
  const sinPareja = tec.filter((k) => !(k in mapa));
  const apuntaAlVacio = tec.filter((k) => k in mapa && !sb.includes(mapa[k]));
  const usados = new Set(Object.values(mapa));
  const soloSupabase = sb.filter((k) => !usados.has(k) && !(k in CALCULADOS_SUPABASE));
  /* inyectividad: dos campos de la técnica no pueden ir al mismo de Supabase */
  const cuenta = {};
  for (const v of Object.values(mapa)) cuenta[v] = (cuenta[v] || 0) + 1;
  const colisiones = Object.keys(cuenta).filter((v) => cuenta[v] > 1);
  return {
    camposTecnica: tec.length,
    camposSupabase: sb.length,
    sinPareja,
    apuntaAlVacio,
    soloSupabase,
    colisiones,
    calculados: Object.keys(CALCULADOS_SUPABASE),
  };
}

/* ════════════════ 1 bis. CAREO DE VOCABULARIOS CERRADOS ══════════════════
 *
 * Esto NO necesita volcados: las dos listas están en el código. Y es el careo
 * que contesta la pregunta de la que salió todo —«¿puedo meter un sistema de
 * control nuevo?»— generalizada a todas las columnas de desplegable.
 *
 * ═══ LAS DOS LISTAS NO SON LA MISMA CLASE DE LISTA ═══
 *
 * En la técnica, `sist_control` es un `<select>` cerrado: sólo se puede elegir
 * de `CTRL`. Un valor que ya estuviera en la celda se conserva (la línea que
 * hace `if(vv&&opts.indexOf(vv)<0)opts.unshift(vv)`), pero no se puede ESTRENAR
 * uno nuevo desde la interfaz.
 *
 * En la de Supabase, `opciones()` ofrece lo guardado MÁS el vocabulario oficial,
 * y el campo es texto libre: lo que se escriba se guarda tal cual, esté o no en
 * la lista. Su propio comentario lo dice.
 *
 * Así que para la pregunta «¿cabe el dato?» la de Supabase gana en todas las
 * columnas: es texto libre. Lo que estas listas miden es otra cosa, igual de
 * importante: qué OFRECE cada una, y por tanto qué se va a teclear mal o no se
 * va a teclear.
 *
 * ═══ LA EXCEPCIÓN: NO ES PÉRDIDA, ES UN REQUISITO PREVIO ═══
 *
 * Las cinco fases PEM. En la técnica son TRES estados —`FASE=['Sin empezar',
 * 'En proceso','Terminado']`, y su comentario dice «antes checkbox sí/no», o sea
 * que el tercer estado se añadió a propósito. En la de Supabase son dos:
 * `["Sí","No"]`.
 *
 * Y aquí hay que tener cuidado con la palabra. NO se pierde nada: el campo de
 * allí es un <input type="text"> con desplegable propio —no un <select>— y su
 * única normalización es SI_VIEJO={"x":"Sí"}, que sólo reescribe la equis, así
 * que «En proceso» se guarda tal cual hoy y sin tocar nada. Lo que falla es una
 * función de DIBUJO, y eso tiene arreglo, no duelo: `pasosPEM()` clasifica «sí» -> ●, «no» -> ○ y CUALQUIER OTRA COSA ->
 * · , que su propio comentario define como VACÍO («que no es No»). Es decir: una
 * planta con `cold_comm = "En proceso"` se dibujaría como planta SIN DATO. No se
 * perdería el texto, se perdería su significado, que es peor: el checklist
 * diría «no se sabe» de algo que sí se sabe.
 *
 * Por eso esto se reporta como DEGRADACIÓN y no como diferencia de lista.
 */

export const FASES_TECNICA = ['Sin empezar', 'En proceso', 'Terminado'];
export const CAMPOS_FASE = new Set(['cold', 'site', 'escaneo', 'offset', 'hot']);

/* Los vocabularios de la técnica: las listas van en constantes sueltas
   (`CTRL=[...]`) y las columnas las referencian por nombre (`opts:CTRL`). Hay
   que leer las dos cosas y juntarlas. */
export function vocabulariosTecnica(html) {
  const listas = {};
  for (const m of html.matchAll(/\b([A-Z][A-Z0-9]{1,})\s*=\s*\[((?:\s*'[^']*'\s*,?)+)\]/g)) {
    listas[m[1]] = [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  }
  const porCampo = {};
  for (const m of html.matchAll(/([a-z_0-9]+)\s*:\s*\{label:'[^']*',type:'select',opts:([A-Z][A-Z0-9]*)/g)) {
    if (listas[m[2]]) porCampo[m[1]] = listas[m[2]];
  }
  return Object.keys(porCampo).length ? porCampo : null;
}

export function vocabulariosSupabase(html) {
  const m = html.match(/const\s+VOCABULARIO\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return null;
  /* los comentarios de dentro llevan comillas y palabras con dos puntos, así
     que se quitan antes de buscar los pares; si no, uno de ellos se parsea
     como si fuera un campo */
  const cuerpo = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const porCampo = {};
  for (const p of cuerpo.matchAll(/([a-z_0-9]+)\s*:\s*\[((?:\s*"[^"]*"\s*,?)+)\]/g)) {
    porCampo[p[1]] = [...p[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  }
  return Object.keys(porCampo).length ? porCampo : null;
}

export function careoDeVocabularios(vt, vs, mapa = MAPA) {
  if (!vt || !vs || !Object.keys(vt).length || !Object.keys(vs).length) return null;
  const filas = [];
  const sinListaEnSupabase = [];
  for (const [ct, lista] of Object.entries(vt)) {
    const cs = mapa[ct];
    if (!cs) continue;
    if (!vs[cs]) { sinListaEnSupabase.push(`${ct} -> ${cs}`); continue; }
    const igual = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const soloTecnica = lista.filter((v) => !vs[cs].some((w) => igual(v, w)));
    const soloSupabase = vs[cs].filter((w) => !lista.some((v) => igual(v, w)));
    /* EN LAS FASES NO SE COMPARAN LAS ETIQUETAS, SE CUENTAN LOS ESTADOS.
     *
     * «Terminado» y «Sí» se escriben distinto y quieren decir lo mismo, así que
     * una diferencia de nombres no es una pérdida. Lo que se pierde es PODER
     * DISTINGUIR: si la técnica ofrece tres estados y la otra dos, hay un
     * estado de la técnica que no tiene a dónde ir, se llame como se llame. Y
     * si la otra ofrece tres o más, existe una correspondencia y no se pierde
     * nada —habrá que escribirla, pero el dato cabe. */
    const esFase = CAMPOS_FASE.has(ct);
    if (esFase) {
      const pierdeEstados = lista.length > vs[cs].length;
      filas.push({ campo: ct, campoSb: cs, soloTecnica, soloSupabase, esFase: true,
                   estadosTecnica: lista.length, estadosSupabase: vs[cs].length, pierdeEstados });
      continue;
    }
    if (!soloTecnica.length && !soloSupabase.length) continue;
    filas.push({ campo: ct, campoSb: cs, soloTecnica, soloSupabase, esFase: false });
  }
  const soloEnSupabase = Object.keys(vs).filter((cs) => !Object.values(mapa).includes(cs));
  return { filas, sinListaEnSupabase, soloEnSupabase };
}

/* ═══════════════════════ 2. LEER LOS DOS VOLCADOS ═══════════════════════ */

/* El volcado de la técnica es el fichero del botón «⬇ SEED»: un literal
   JavaScript `const SEED = [...]`. Se parsea sacando el JSON de dentro, no
   evaluándolo: un fichero que llega de un navegador no se ejecuta aquí. */
export function leerVolcadoTecnica(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return null;
  const i = texto.indexOf('[');
  const j = texto.lastIndexOf(']');
  if (i < 0 || j < i) return null;
  let recs;
  try {
    recs = JSON.parse(texto.slice(i, j + 1));
  } catch {
    return null;
  }
  return Array.isArray(recs) && recs.length ? recs : null;
}

/* El volcado de Supabase es el CSV del botón «⬇ CSV»: separador `;`, BOM
   delante, comillas dobles escapadas duplicando. La cabecera lleva las
   ETIQUETAS visibles, no las claves, así que hace falta la tabla de etiquetas
   para volver a las claves. */
export function leerCsvPuntoYComa(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return null;
  const t = texto.replace(/^﻿/, '');
  const filas = [];
  let campo = '';
  let fila = [];
  let enComillas = false;
  for (let k = 0; k < t.length; k++) {
    const c = t[k];
    if (enComillas) {
      if (c === '"') {
        if (t[k + 1] === '"') { campo += '"'; k++; } else enComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { enComillas = true; continue; }
    if (c === ';') { fila.push(campo); campo = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && t[k + 1] === '\n') k++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
      continue;
    }
    campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.length >= 2 ? filas : null;
}

export function etiquetasSupabase(html) {
  const m = html.match(/const\s+LABELS\s*=\s*\{([\s\S]*?)\};/);
  if (!m) return null;
  const pares = [...m[1].matchAll(/([a-z_0-9]+)\s*:\s*"([^"]*)"/g)];
  if (!pares.length) return null;
  const porEtiqueta = {};
  for (const [, k, lab] of pares) porEtiqueta[lab] = k;
  return porEtiqueta;
}

export function volcadoSupabaseAFilas(csvTexto, porEtiqueta) {
  const filas = leerCsvPuntoYComa(csvTexto);
  if (!filas || !porEtiqueta) return null;
  const cab = filas[0].map((lab) => porEtiqueta[lab.trim()] ?? null);
  if (cab.every((k) => k === null)) return null;   // cabecera no reconocida
  const recs = [];
  for (const f of filas.slice(1)) {
    const r = {};
    cab.forEach((k, i) => { if (k !== null && f[i] !== undefined && f[i] !== '') r[k] = f[i]; });
    if (Object.keys(r).length) recs.push(r);
  }
  return recs.length ? { recs, columnasNoReconocidas: filas[0].filter((lab) => !(lab.trim() in porEtiqueta)) } : null;
}

/* ═══════════════════════ 3. CAREO DE PLANTAS Y VALORES ═══════════════════ */

/* LA CLAVE ES EL CÓDIGO, NO EL NOMBRE.
 *
 * `num` en la técnica y `code` en Supabase. Se normaliza a texto sin espacios
 * porque uno puede traerlo como número («24002») y el otro como texto: comparar
 * 24002 con "24002" los daría por plantas distintas y el careo inventaría una
 * planta que falta en cada lado. */
export function clave(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/* LOS ÚNICOS CAMPOS DE SÍ/NO.
 *
 * La técnica los declara en su propio fuente: `const CHECKS=new Set(['garantia'])`.
 * Uno solo. Importa saber CUÁLES son porque la normalización de un sí/no y la de
 * un contador son incompatibles: en un sí/no, «1» y «x» y «Sí» son lo mismo y
 * «0» es lo mismo que vacío; en un contador, 0 es una MEDIDA («esta planta no
 * lleva ninguna bífila») y vacío es una AUSENCIA («no se sabe cuántas lleva»), y
 * darlos por iguales borra la diferencia entre un dato y un hueco.
 *
 * El banco comprueba que esta lista sigue siendo la del fuente de la técnica,
 * para que no se queden desincronizadas en silencio. */
export const CAMPOS_SINO = new Set(['garantia']);

/* NORMALIZACIÓN DE UN VALOR PARA COMPARARLO, SEGÚN SU CAMPO.
 *
 * Las dos aplicaciones guardan el mismo dato en tipos distintos: la técnica
 * tiene `garantia` como booleano y el CSV lo trae como texto; los números pueden
 * venir con coma o con punto, y el código de planta como número o como texto.
 * Comparar en bruto daría por distinto lo que es igual, y un careo que grita por
 * todo no se lee: acaba en «ya, eso siempre sale». */
export function normaliza(v, campo) {
  if (v == null) return '';
  const esSiNo = campo !== undefined && CAMPOS_SINO.has(campo);
  if (typeof v === 'boolean') return v ? 'si' : '';
  const s = String(v).trim();
  if (s === '') return '';
  const low = s.toLowerCase();
  if (esSiNo) {
    if (['x', 'si', 'sí', '1', 'true', 'yes'].includes(low)) return 'si';
    if (['no', 'false', '0'].includes(low)) return '';
  }
  const num = low.replace(/\s/g, '').replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(num)) {
    const n = Number(num);
    if (Number.isFinite(n)) return String(n);
  }
  return low;
}

/* LA MIGRACIÓN DE LAS FASES, TRANSCRITA DE LA PROPIA APLICACIÓN.
 *
 * `cartera-tabla.html` lleva su `migrateFases()`, que convierte el formato viejo
 * —las fases eran una casilla sí/no— al de tres estados. El `SEED` del
 * repositorio está en formato VIEJO: trae `cold: true`. Si se carea sin migrar,
 * los cinco campos de las cinco fases salen en desacuerdo en todas las plantas,
 * y un careo que grita en 110 celdas por construcción no se lee.
 *
 * Esto es una transcripción, no una reinvención: misma cadena de casos y mismo
 * vocabulario. Si allí cambia, aquí hay que cambiarlo, y el banco comprueba que
 * el vocabulario sigue siendo el mismo que el del fuente. */
export function migraFase(v) {
  if (v === true) return 'Terminado';
  if (v === false || v == null || v === '') return 'Sin empezar';
  const s = String(v).trim().toLowerCase();
  if (/^(x|s[ií]|1|true|yes|terminado)$/.test(s)) return 'Terminado';
  if (/proceso/.test(s)) return 'En proceso';
  return FASES_TECNICA.includes(String(v).trim()) ? String(v).trim() : 'Sin empezar';
}

/* Y la fase pasada al sí/no que es lo único que la otra cartera sabe dibujar.
 *
 * AVISO SOBRE LA DEGRADACIÓN, QUE ES DELIBERADAMENTE CONSERVADORA: se anota
 * SIEMPRE que la técnica tiene una fase en el estado intermedio, sin mirar si
 * la otra cartera ya lo admite. No es pereza: para que deje de ser una pérdida
 * hacen falta DOS cambios allí —un tercer valor en las cinco listas Y un caso
 * más en `pasosPEM()`, que hoy manda a «vacío» todo lo que no sea sí o no— y
 * el segundo es código, no vocabulario, así que esta herramienta no lo puede
 * dar por hecho. Equivocarse hacia «ojo, revisa» no cuesta datos; equivocarse
 * hacia «ya está» sí. */
export function faseABinario(fase) {
  return fase === 'Terminado' ? 'si' : '';
}

export function careoDeDatos(recsTec, recsSb, mapa = MAPA) {
  if (!Array.isArray(recsTec) || !recsTec.length) return null;
  if (!Array.isArray(recsSb) || !recsSb.length) return null;
  /* UN Nº CON VARIAS FILAS NO ES UN DUPLICADO QUE SE PUEDA TIRAR.
   *
   * La primera versión hacía `porSb.set(k, r)` en bucle, así que un código
   * repetido se quedaba con la ÚLTIMA fila y las otras desaparecían sin
   * ruido. Con los volcados de verdad eso pasó: el 24024 trae TRES filas en
   * Supabase —«Alconadre · Sodeto», «· San Miguel» y «· Peralta de Alcofea»,
   * con 19 campos y coordenadas propias cada una—. No son basura: son tres
   * emplazamientos de un mismo proyecto. Y el careo las colapsó y comparó la
   * planta contra una sola, que es de dónde salían seis «celdas con dato en la
   * técnica y vacías en Supabase» que no existían.
   *
   * Un colapso silencioso de la clave es peor que un rojo: convierte un
   * «no puedo comparar esto» en una afirmación falsa sobre los datos. Así que
   * ahora se agrupan, se reportan, y esas plantas NO se carean celda a celda
   * —no hay forma de saber contra cuál de las filas—. */
  function agrupa(recs, campoClave) {
    const por = new Map(), sinCodigo = [];
    for (const r of recs) {
      const k = clave(r[campoClave]);
      if (k === null) { sinCodigo.push(r.proyecto ?? '(sin proyecto)'); continue; }
      (por.get(k) ?? por.set(k, []).get(k)).push(r);
    }
    const repetidos = [...por.entries()].filter(([, l]) => l.length > 1)
      .map(([code, l]) => ({ code, filas: l.length, proyectos: l.map((r) => r.proyecto ?? '') }));
    return { por, sinCodigo, repetidos };
  }
  const gT = agrupa(recsTec, 'num'), gS = agrupa(recsSb, 'code');
  const porTec = gT.por, porSb = gS.por;
  const sinCodigoTec = gT.sinCodigo, sinCodigoSb = gS.sinCodigo;
  const codigosRepetidos = { tecnica: gT.repetidos, supabase: gS.repetidos };
  const repetidoEnAlguno = new Set([...gT.repetidos, ...gS.repetidos].map((x) => x.code));

  const soloTecnica = [...porTec.keys()].filter((k) => !porSb.has(k))
    .map((k) => ({ code: k, proyecto: porTec.get(k)[0].proyecto ?? '' }));
  const soloSupabase = [...porSb.keys()].filter((k) => !porTec.has(k))
    .map((k) => ({ code: k, proyecto: porSb.get(k)[0].proyecto ?? '' }));
  /* las que están en las dos Y tienen una sola fila en cada lado: las únicas
     que se pueden carear celda a celda sin inventarse contra cuál */
  const enLasDos = [...porTec.keys()].filter((k) => porSb.has(k) && !repetidoEnAlguno.has(k));
  const noCareables = [...porTec.keys()].filter((k) => porSb.has(k) && repetidoEnAlguno.has(k))
    .map((k) => ({ code: k, proyecto: porTec.get(k)[0].proyecto ?? '' }));

  const discrepancias = [];
  for (const k of enLasDos) {
    const a = porTec.get(k)[0], b = porSb.get(k)[0];
    for (const [ct, cs] of Object.entries(mapa)) {
      /* LAS CINCO FASES VAN POR OTRO CAMINO: tres estados contra dos. Se migra
         el lado de la técnica a su vocabulario de tres, se baja a sí/no para
         poder comparar con el otro, y si el estado migrado era el intermedio se
         anota como DEGRADACIÓN aunque el sí/no coincida: el dato cabe en el
         otro campo —es texto libre— pero `pasosPEM()` lo dibujaría como vacío. */
      if (CAMPOS_FASE.has(ct)) {
        const fa = migraFase(a[ct]);
        const vbF = normaliza(b[cs], 'garantia');
        if (faseABinario(fa) !== vbF) {
          const tipo = faseABinario(fa) === '' ? 'soloSupabase' : 'soloTecnica';
          discrepancias.push({ code: k, proyecto: a.proyecto ?? '', campo: ct, campoSb: cs, tecnica: fa, supabase: b[cs] ?? '', tipo });
        } else if (fa === 'En proceso') {
          discrepancias.push({ code: k, proyecto: a.proyecto ?? '', campo: ct, campoSb: cs, tecnica: fa, supabase: b[cs] ?? '', tipo: 'degradacion' });
        }
        continue;
      }
      /* el campo se pasa con su nombre de la TÉCNICA en los dos lados: es
         como está escrito `CAMPOS_SINO`, y es un sí/no el DATO, no el lado */
      const va = normaliza(a[ct], ct), vb = normaliza(b[cs], ct);
      if (va === vb) continue;
      /* un lado vacío no es un desacuerdo, es un dato que sólo tiene uno: se
         clasifica aparte porque la acción es distinta —copiarlo, no decidir */
      const tipo = va === '' ? 'soloSupabase' : vb === '' ? 'soloTecnica' : 'contradiccion';
      discrepancias.push({ code: k, proyecto: a.proyecto ?? '', campo: ct, campoSb: cs, tecnica: a[ct] ?? '', supabase: b[cs] ?? '', tipo });
    }
  }
  return {
    codigosRepetidos,
    noCareables,
    plantasTecnica: porTec.size,
    plantasSupabase: porSb.size,
    enLasDos: enLasDos.length,
    soloTecnica,
    soloSupabase,
    sinCodigoTec,
    sinCodigoSb,
    discrepancias,
  };
}

/* El vocabulario realmente usado de un campo, que es lo que decide si una lista
   cerrada se puede cerrar sin perder valores. Es la pregunta que abrió todo
   esto: la técnica conoce `TracknCO` y `AiTracker`, Supabase conoce `KaiRi`. */
export function vocabulario(recs, campo) {
  if (!Array.isArray(recs) || !recs.length) return null;
  const vistos = new Map();
  for (const r of recs) {
    const v = r[campo];
    if (v == null || String(v).trim() === '') continue;
    const s = String(v).trim();
    vistos.set(s, (vistos.get(s) || 0) + 1);
  }
  return [...vistos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([valor, veces]) => ({ valor, veces }));
}

/* ═══════════════════════════════ INFORME ═════════════════════════════════ */

/* EL CAREO COMPLETO, SOBRE CONTENIDOS Y NO SOBRE RUTAS.
 *
 * Recibe los textos ya leídos y a dónde escribir, para que el banco pueda
 * ejercitar los TRES veredictos —incluido el verde— sin tocar el disco ni
 * lanzar procesos. Un veredicto verde que nunca se ha visto salir no está
 * comprobado: podría ser inalcanzable y nadie se enteraría. Hoy, de hecho, con
 * los dos ficheros de verdad el verde ES inalcanzable, porque las fases PEM
 * pierden un estado; el banco lo comprueba contra una copia con «En proceso»
 * añadido, que es como quedaría el fichero el día que se arregle. */
export function careoCompleto(ent, log = console.log) {
  const htmlTec = ent.htmlTecnica, htmlSb = ent.htmlSupabase;
  const volTec = ent.volcadoTecnica, volSb = ent.volcadoSupabase;

  const esqT = esquemaTecnica(htmlTec);
  const esqS = esquemaSupabase(htmlSb);
  if (!esqT || !esqS) {
    log('NO COMPROBADO: no se han podido extraer los esquemas del código.');
    log('  técnica:', esqT ? esqT.length + ' campos' : 'no encontrado (¿cambió `const KEYS=`?)');
    log('  supabase:', esqS ? esqS.length + ' campos' : 'no encontrado (¿cambió `const LABELS=`?)');
    return 2;
  }
  const ce = careoDeEsquema(esqT, esqS);
  log('═══ 1. ESQUEMA ═══');
  log(`  técnica ${ce.camposTecnica} campos · supabase ${ce.camposSupabase} columnas`);
  log(`  calculadas en el CSV de supabase, no guardadas: ${ce.calculados.join(', ')}`);
  let rc = 0;
  if (ce.sinPareja.length) { log(`  ROJO campos de la técnica sin pareja en el mapa: ${ce.sinPareja.join(', ')}`); rc = 1; }
  if (ce.apuntaAlVacio.length) { log(`  ROJO el mapa apunta a campos que supabase no tiene: ${ce.apuntaAlVacio.join(', ')}`); rc = 1; }
  if (ce.colisiones.length) { log(`  ROJO dos campos de la técnica van al mismo de supabase: ${ce.colisiones.join(', ')}`); rc = 1; }
  if (!ce.sinPareja.length && !ce.apuntaAlVacio.length && !ce.colisiones.length) {
    log('  todos los campos de la técnica tienen su sitio en supabase');
  }
  log(ce.soloSupabase.length
    ? `  sólo en supabase (se GANAN, no se pierden): ${ce.soloSupabase.join(', ')}`
    : '  supabase no guarda ningún campo que la técnica no tenga');

  const cv = careoDeVocabularios(vocabulariosTecnica(htmlTec), vocabulariosSupabase(htmlSb));
  log('\n═══ 1 bis. VOCABULARIOS CERRADOS ═══');
  if (!cv) {
    log('  NO COMPROBADO: no se han podido leer las listas de una de las dos.');
    rc = Math.max(rc, 2);
  } else {
    const fases = cv.filas.filter((f) => f.esFase);
    const resto = cv.filas.filter((f) => !f.esFase);
    for (const f of resto) {
      log(`  ${f.campo} -> ${f.campoSb}`);
      if (f.soloTecnica.length) log(`      sólo ofrece la técnica : ${f.soloTecnica.join(', ')}`);
      if (f.soloSupabase.length) log(`      sólo ofrece supabase   : ${f.soloSupabase.join(', ')}`);
    }
    const pierden = fases.filter((f) => f.pierdeEstados);
    if (pierden.length) {
      const f0 = pierden[0];
      log(`  AVISO las ${pierden.length} fases PEM (${pierden.map((f) => f.campo).join(', ')})`);
      log(`       ofrecen ${f0.estadosTecnica} estados en la técnica y ${f0.estadosSupabase} en supabase.`);
      log('       NO ES UNA PÉRDIDA, y conviene no llamarlo así: el campo de allí es');
      log('       un <input type="text"> con desplegable propio —no un <select>— y la');
      log('       única normalización que tiene es SI_VIEJO={"x":"Sí"}, que sólo');
      log('       reescribe la equis. O sea que «En proceso» SE GUARDA tal cual hoy,');
      log('       sin tocar nada, y `opciones()` lo ofrecerá en todas las plantas en');
      log('       cuanto esté guardado en una.');
      log('       Lo que falla es UNA FUNCIÓN DE DIBUJO: `pasosPEM()` reparte en tres');
      log('       cestas —«sí»->● «no»->○ y CUALQUIER OTRA COSA->· — y su propio');
      log('       comentario define esa tercera como VACÍO «que no es No». Así que la');
      log('       planta a medias se vería como planta SIN MEDIR y el checklist');
      log('       contaría de menos. El dato está; la casilla miente.');
      log('       Arreglo: una cesta más en `pasosPEM()` y «En proceso» en las cinco');
      log('       listas para que el desplegable lo ofrezca de salida. No hacen falta');
      log('       columnas nuevas: es un tercer VALOR de las cinco que ya hay, no');
      log('       cinco pasos más.');
      log('       Se marca en rojo porque es un requisito ANTES de borrar, no porque');
      log('       se pierda nada.');
      rc = 1;
    } else if (fases.length) {
      log(`  las ${fases.length} fases PEM se llaman distinto en las dos, pero las dos`);
      log(`  distinguen ${fases[0].estadosSupabase} estados: hay correspondencia y no se pierde ninguno.`);
    }
    if (cv.sinListaEnSupabase.length) log(`  campos con lista en la técnica y texto sin lista en supabase: ${cv.sinListaEnSupabase.join(', ')}`);
    if (cv.soloEnSupabase.length) log(`  listas que sólo existen en supabase: ${cv.soloEnSupabase.join(', ')}`);
    log('  AVISO esto mide lo que cada una OFRECE, no lo que puede guardar:');
    log('        en supabase los campos son texto libre y `opciones()` suma lo');
    log('        guardado al vocabulario, así que cabe cualquier valor nuevo.');
    log('        En la técnica `sist_control` es un <select> CERRADO: un valor');
    log('        nuevo no se puede estrenar desde la interfaz.');
  }

  if (!volTec || !volSb) {
    log('\n═══ 2 y 3. PLANTAS Y VALORES ═══');
    log('  NO COMPROBADO: falta un volcado.');
    log('  El esquema está en el código; las plantas NO. La cartera técnica');
    log('  guarda en localStorage, así que su dato real está en el navegador');
    log('  que la usa y no en este repositorio.');
    log('  técnica  -> botón «⬇ SEED» de cartera-tabla.html  (fichero SEED_*.js)');
    log('  supabase -> botón «⬇ CSV» de la cartera de plantas (fichero *.csv)');
    log('  y después:  node tools/careo_carteras.mjs --tecnica SEED_*.js --supabase *.csv');
    /* SI YA HAY ROJO, EL ROJO MANDA. Un `2` aquí se tragaría lo que sí se ha
       medido: que las fases PEM pierden un estado es verdad con volcados y sin
       ellos. El 2 es para «no he podido mirar», no para «he mirado la mitad y
       la mitad que miré está mal». */
    return rc === 1 ? 1 : 2;
  }

  const recsT = leerVolcadoTecnica(volTec);
  const etiq = etiquetasSupabase(htmlSb);
  const vS = volcadoSupabaseAFilas(volSb, etiq);
  if (!recsT || !vS) {
    log('\nNO COMPROBADO: un volcado está vacío o no se ha podido leer.');
    log('  técnica:', recsT ? recsT.length + ' plantas' : 'ilegible o vacío');
    log('  supabase:', vS ? vS.recs.length + ' plantas' : 'ilegible o vacío');
    return rc === 1 ? 1 : 2;   // el rojo ya medido manda sobre el «no he podido mirar»
  }
  if (vS.columnasNoReconocidas.length) {
    log(`\n  AVISO columnas del CSV que no se han reconocido: ${vS.columnasNoReconocidas.join(', ')}`);
  }

  const cd = careoDeDatos(recsT, vS.recs);
  log('\n═══ 2. PLANTAS ═══');
  log(`  técnica ${cd.plantasTecnica} · supabase ${cd.plantasSupabase} · en las dos ${cd.enLasDos}`);
  /* SIN Nº NO ES «SE PIERDE INFORMACIÓN», ES «NO PUEDO COMPARARLO». Son dos
     cosas distintas y mezclarlas hace que el rojo deje de significar nada: una
     planta sin código tiene sus datos enteros, lo que no tiene es con qué
     emparejarla. Va a NO COMPROBADO, y se dice por su nombre. */
  const sinNumero = cd.sinCodigoTec.length + cd.sinCodigoSb.length;
  if (cd.sinCodigoTec.length) log(`  NO COMPROBADO plantas sin Nº en la técnica: ${cd.sinCodigoTec.join(', ')}`);
  if (cd.sinCodigoSb.length) log(`  NO COMPROBADO plantas sin Nº en supabase: ${cd.sinCodigoSb.join(', ')}`);
  /* UN Nº CON VARIAS FILAS TAMPOCO ES UN DUPLICADO. Puede ser un proyecto con
     varios emplazamientos, y de hecho lo es: el 24024 son tres. Se dicen y no
     se carean celda a celda, porque no hay forma de saber contra cuál. */
  for (const lado of ['tecnica', 'supabase']) {
    for (const r of cd.codigosRepetidos[lado]) {
      log(`  NO COMPROBADO el Nº ${r.code} tiene ${r.filas} filas en ${lado}: ${r.proyectos.filter(Boolean).join(' · ')}`);
      log('                 un Nº repetido puede ser un proyecto con varios emplazamientos,');
      log('                 así que no se tira ninguna fila ni se carea la planta celda a');
      log('                 celda: haría falta una clave que distinga el emplazamiento.');
    }
  }
  if (cd.noCareables.length) {
    log(`  ${cd.noCareables.length} plantas quedan sin carear por eso: ${cd.noCareables.map((p) => p.code).join(', ')}`);
  }
  if (cd.soloTecnica.length) {
    log(`  ROJO ${cd.soloTecnica.length} plantas SÓLO en la técnica — se perderían al borrarla:`);
    for (const p of cd.soloTecnica) log(`        ${p.code}  ${p.proyecto}`);
    rc = 1;
  } else log('  ninguna planta está sólo en la técnica');
  if (cd.soloSupabase.length) {
    log(`  ${cd.soloSupabase.length} plantas sólo en supabase (no se pierden, pero la técnica está vieja):`);
    for (const p of cd.soloSupabase) log(`        ${p.code}  ${p.proyecto}`);
  }

  log('\n═══ 3. VALORES ═══');
  const porTipo = { soloTecnica: [], soloSupabase: [], contradiccion: [], degradacion: [] };
  for (const d of cd.discrepancias) porTipo[d.tipo].push(d);
  if (porTipo.soloTecnica.length) {
    log(`  ROJO ${porTipo.soloTecnica.length} celdas con dato en la técnica y VACÍAS en supabase:`);
    for (const d of porTipo.soloTecnica) log(`        ${d.code} ${d.proyecto} · ${d.campo} = «${d.tecnica}»`);
    rc = 1;
  }
  if (porTipo.contradiccion.length) {
    log(`  ROJO ${porTipo.contradiccion.length} celdas que NO coinciden (hay que decidir cuál vale):`);
    for (const d of porTipo.contradiccion) log(`        ${d.code} ${d.proyecto} · ${d.campo}: técnica «${d.tecnica}» / supabase «${d.supabase}»`);
    rc = 1;
  }
  if (porTipo.degradacion.length) {
    log(`  ROJO ${porTipo.degradacion.length} fases «En proceso» que supabase dibujaría como VACÍO:`);
    for (const d of porTipo.degradacion) log(`        ${d.code} ${d.proyecto} · ${d.campo} = «En proceso»`);
    rc = 1;
  }
  log(`  ${porTipo.soloSupabase.length} celdas que sólo tiene supabase (la técnica las tiene vacías)`);
  if (!porTipo.soloTecnica.length && !porTipo.contradiccion.length) {
    log('  la técnica no tiene ni un dato que supabase no tenga');
  }

  const vT = vocabulario(recsT, 'sist_control');
  const vSb = vocabulario(vS.recs, 'control');
  log('\n═══ SISTEMAS DE CONTROL USADOS ═══');
  log('  técnica :', vT ? vT.map((x) => `${x.valor}(${x.veces})`).join(' ') : '(ninguno)');
  log('  supabase:', vSb ? vSb.map((x) => `${x.valor}(${x.veces})`).join(' ') : '(ninguno)');
  const soloEnTec = (vT || []).map((x) => x.valor).filter((v) => !(vSb || []).some((y) => y.valor.toLowerCase() === v.toLowerCase()));
  if (soloEnTec.length) { log(`  ROJO valores de control que sólo existen en la técnica: ${soloEnTec.join(', ')}`); rc = 1; }

  /* Y si ha habido algo que NO SE HA PODIDO carear, el veredicto no puede ser
     un 0 limpio aunque todo lo demás cuadre: quedan plantas sin mirar. */
  const incompleto = sinNumero > 0 || cd.noCareables.length > 0;
  if (rc === 1) log('\nROJO: hay información que sólo vive en la cartera técnica. Arriba está cuál.');
  else if (incompleto) {
    log('\nNO COMPROBADO: lo careado cuadra, pero quedan plantas que no se han');
    log('podido emparejar —sin Nº, o con un Nº que lleva varias filas—. Hasta');
    log('resolver eso, «no se pierde nada» no está medido para todas.');
    rc = 2;
  } else log('\nMIDE: borrar la cartera técnica no perdería ninguna planta ni ningún valor.');
  return rc;
}

/* ════════════════════════════════ CLI ════════════════════════════════════ */

function parsea(argv) {
  const a = { htmlTecnica: 'cartera-tabla.html', htmlSupabase: '../factiun-cartera/index.html' };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--tecnica') a.tecnica = v;
    else if (k === '--supabase') a.supabase = v;
    else if (k === '--html-tecnica') a.htmlTecnica = v;
    else if (k === '--html-supabase') a.htmlSupabase = v;
  }
  return a;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let rc;
  try {
    const a = parsea(process.argv.slice(2));
    rc = careoCompleto({
      htmlTecnica: readFileSync(a.htmlTecnica, 'utf8'),
      htmlSupabase: readFileSync(a.htmlSupabase, 'utf8'),
      volcadoTecnica: a.tecnica ? readFileSync(a.tecnica, 'utf8') : null,
      volcadoSupabase: a.supabase ? readFileSync(a.supabase, 'utf8') : null,
    });
  } catch (e) {
    console.log('NO COMPROBADO: ' + (e && e.message ? e.message : e));
    rc = 2;
  }
  process.exit(rc);
}
