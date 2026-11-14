/* Public, deliberately small contract. Never send Notion blocks or arbitrary
   properties to the browser. The exporter and the UI use this same allowlist. */
export const FRONTS = [
  { id:'modelos', n:'01', name:'Modelos y generaciones', short:'Modelos', color:'#f09030', title:'Cómo evolucionan los trackers', description:'Nuevos modelos, generaciones y cambios técnicos publicados.', watch:'Nombre y generación, arquitectura 1P/2P, filas, accionamiento, terreno y diferencias frente al modelo anterior. Registrar por separado presentación, oferta comercial e instalación documentada.', icon:'M3 9l10-5 8 4-10 5zM3 14l8 4 10-5M6 11v9m12-9v7' },
  { id:'patentes', n:'02', name:'Patentes y mecanismos', short:'Patentes', color:'#b6a1e1', title:'Qué solución describe cada patente', description:'Mecanismos, reivindicaciones, figuras e inventores con su publicación.', watch:'Buscar por problema: transmisión, cardanes, bloqueo, amortiguación, fijación, montaje, control y protección. Conservar familia, prioridad, jurisdicción, reivindicaciones y dibujos. La relación con un producto y el estado legal requieren evidencia propia.', icon:'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h5M3 7v11' },
  { id:'personas', n:'03', name:'Personas y equipos de diseño', short:'Personas', color:'#84bdc9', title:'Quién contribuye al diseño', description:'Inventores, autores, especialistas y colaboraciones profesionales públicas.', watch:'Relacionar cada persona con aportaciones concretas: patentes, publicaciones, conferencias, proyectos y equipos. Distinguir inventor, autor, contacto técnico y responsable citado; fechar cada vinculación y evitar inferir el cargo actual.', icon:'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 21v-3a7 7 0 0 1 14 0v3M3 12l-1 5m19-5 1 5' },
  { id:'proveedores', n:'04', name:'Proveedores reales', short:'Proveedores', color:'#d4b678', title:'Quién fabrica lo que hay dentro', description:'Relaciones de suministro y componentes identificados en fuentes públicas.', watch:'Buscar fabricantes de actuadores, coronas, motores, amortiguadores, casquillos, electrónica, baterías y radios. Una oferta de catálogo no demuestra suministro: registrar el cliente, componente, periodo y alcance que la fuente identifica.', icon:'M3 21V9l6 3V8l6 3V3h4v18zM6 16h2m3 0h2m3 0h1' },
  { id:'montaje', n:'05', name:'Construcción y montaje', short:'Montaje', color:'#88bba1', title:'Cómo se construye y se monta', description:'Manuales, planos, secuencias de instalación y restricciones publicadas.', watch:'Documentar uniones, fijaciones, materiales, recubrimientos, tolerancias, montaje y mantenimiento. Guardar la revisión del manual y la página, figura o minuto del vídeo donde se ve el detalle.', icon:'M4 19l8-8m3-7a5 5 0 0 0-6 6l5 5a5 5 0 0 0 6-6l-4 3-4-4zM3 17l4 4' },
  { id:'control', n:'06', name:'Estrategias de control', short:'Control', color:'#68c0d8', title:'Cómo decide moverse el seguidor', description:'Algoritmos, sensores, prioridades y respuestas publicadas.', watch:'Seguir backtracking, difusa, viento, granizo, nieve, torsión y fallos de señal. Conservar versión, señales de entrada, condiciones de activación, prioridades y resultados; distinguir patente, descripción comercial y ensayo publicado.', icon:'M3 7h8m4 0h6M3 17h13m4 0h1M11 4v6m5 4v6M6 7v10' },
  { id:'laboratorios', n:'07', name:'Laboratorios y ensayos públicos', short:'Laboratorios', color:'#85bdc8', title:'Qué se ha ensayado y con qué alcance', description:'Laboratorios, revisiones, métodos e informes accesibles.', watch:'Buscar túneles de viento, aeroelasticidad, fatiga, corrosión, granizo y validación de control. Conservar organismo, método, norma, configuración, condiciones, resultados y límites. Una revisión de diseño, un ensayo y una certificación son evidencias distintas.', icon:'M9 3h6m-5 0v7L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 16h10' },
  { id:'investigacion', n:'08', name:'Investigación publicada', short:'Investigación', color:'#aaa6da', title:'Qué está investigando el sector', description:'Artículos, tesis, centros y proyectos con resultados reproducibles.', watch:'Seguir métodos, conjuntos de datos, autores, centros y financiación publicados. Extraer la pregunta, el método, el resultado, su comparador y limitaciones. Relacionar publicaciones por autoría y proyecto acreditados.', icon:'M3 5c4-2 7-1 9 1 2-2 5-3 9-1v15c-4-2-7-1-9 1-2-2-5-3-9-1zM12 6v15' },
  { id:'incidentes', n:'09', name:'Fallos y respuestas', short:'Fallos', color:'#dc9391', title:'Qué falló y qué se aprendió', description:'Incidentes documentados y respuestas técnicas atribuidas.', watch:'Registrar el hecho, configuración conocida, condiciones, daño, fuente y respuesta. Separar causa acreditada, atribución de una fuente e hipótesis. Evitar extrapolar una racha o un fallo a un límite universal de diseño.', icon:'M12 3l10 18H2zM12 9v5m0 3v1' },
  { id:'senales', n:'10', name:'Señales de desarrollo', short:'Señales', color:'#c0be82', title:'Qué puede cambiar el mapa tecnológico', description:'Centros de I+D, colaboraciones, adquisiciones y capacidad anunciada.', watch:'Buscar proyectos de investigación, nuevas fábricas, compra de tecnología, acuerdos con centros y contratación técnica pública. Registrar qué se anunció, cuándo y con quién; comprobar por separado su puesta en marcha y los productos afectados.', icon:'M3 19h18M5 15l5-5 4 2 6-8M15 4h5v5' }
];
export const CLAIMS = { fact:'Hecho documentado', manufacturer_claim:'Declaración del fabricante', inference:'Inferencia', unverified:'Sin verificar' };
export const STAGES = { announced:'Anunciado', commercial:'Comercializado', installed:'Instalación documentada', withdrawn:'Retirada documentada', unknown:'Situación sin verificar', not_applicable:'' };
export const FRONT_MAP = Object.fromEntries(FRONTS.map(f => [f.id, f]));
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const unique = values => [...new Set(values)];
const text = (value, max=3000) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const texts = value => Array.isArray(value) ? unique(value.map(v=>text(v,200)).filter(Boolean)) : [];
const isDate = value => typeof value==='string' && /^\d{4}(?:-\d{2}(?:-\d{2})?)?(?:T[\d:.+Z-]+)?$/.test(value) && !Number.isNaN(Date.parse(value));
const date = value => isDate(value) ? value : null;

export function publicUrl(value) {
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || u.port || h === 'localhost' || !h.includes('.') || h.endsWith('.local') || h.endsWith('.internal') || h.includes(':') || /^\d+(?:\.\d+){3}$/.test(h)) return '';
    if (['notion.so','notion.site','notion.com'].some(d=>h===d || h.endsWith('.'+d))) return '';
    return u.href;
  } catch { return ''; }
}
export function notionUrl(value) {
  try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && ['notion.so','notion.site','notion.com'].some(d=>u.hostname===d || u.hostname.endsWith('.'+d)) ? u.href : ''; } catch { return ''; }
}

export function cleanRecord(input) {
  if (!input || typeof input !== 'object') throw Error('Ficha inválida.');
  const id=text(input.id,160), title=text(input.title,300), fronts=texts(input.fronts).filter(v=>FRONT_MAP[v]);
  if (!id || !/^[a-zA-Z0-9_.:-]+$/.test(id) || !title || !fronts.length) throw Error(`Ficha sin identidad o frente válido: ${id || 'desconocida'}`);
  const sources=(Array.isArray(input.sources)?input.sources:[]).map(s=>({title:text(s.title,300),url:publicUrl(s.url),publisher:text(s.publisher,200),published_at:date(s.published_at),locator:text(s.locator,500)}));
  if (!sources.length || sources.some(s=>!s.title || !s.url)) throw Error(`Faltan fuentes públicas válidas en ${id}`);
  if (!CLAIMS[input.claim_type]) throw Error(`Tipo de evidencia no reconocido en ${id}`);
  if (!Object.hasOwn(STAGES,input.market_stage)) throw Error(`Situación pública no reconocida en ${id}`);
  if (!date(input.consulted_at)) throw Error(`Falta fecha de consulta en ${id}`);
  if (input.event_date && !date(input.event_date)) throw Error(`Fecha del hecho no válida en ${id}`);
  const record={id,title,fronts,summary:text(input.summary),companies:texts(input.companies),people:texts(input.people),products:texts(input.products),technologies:texts(input.technologies),event_date:date(input.event_date),consulted_at:date(input.consulted_at),claim_type:input.claim_type,market_stage:input.market_stage,sources,notion_url:notionUrl(input.notion_url)||null,related_ids:texts(input.related_ids)};
  if (!record.summary) throw Error(`Falta hallazgo documentado en ${id}`);
  for (const key of ['contribution_type','locator','relation_statement','limitations','generation','legal_status']) if(text(input[key])) record[key]=text(input[key]);
  if (date(input.legal_checked_at)) record.legal_checked_at=date(input.legal_checked_at);
  if (texts(input.questions).length) record.questions=texts(input.questions);
  if (Array.isArray(input.technical_facts)) record.technical_facts=input.technical_facts.map(f=>({label:text(f.label,120),value:text(f.value,1200)})).filter(f=>f.label&&f.value);
  if (Array.isArray(input.relations)) record.relations=input.relations.map(r=>({from:text(r.from,200),to:text(r.to,200),label:text(r.label,300),source_url:publicUrl(r.source_url)})).filter(r=>r.from&&r.to&&r.label&&sources.some(s=>s.url===r.source_url));
  return record;
}

export function cleanSnapshot(input) {
  if (input?.schema_version !== 1 || !date(input.exported_at) || !Array.isArray(input.records)) throw Error('La exportación no tiene el formato esperado.');
  const records=input.records.map(cleanRecord), ids=new Set(records.map(r=>r.id));
  if (ids.size !== records.length) throw Error('La exportación contiene fichas duplicadas.');
  for (const r of records) r.related_ids=r.related_ids.filter(id=>id!==r.id && ids.has(id));
  return {schema_version:1,exported_at:input.exported_at,notion_hub_url:notionUrl(input.notion_hub_url),scope:'Inteligencia técnica de fuentes públicas',export_kind:'curated_public_snapshot',records};
}

export function filterRecords(records, state={}) {
  const tokens=normalize(state.q).split(/\s+/).filter(Boolean);
  return records.filter(r=>{
    if(state.front && state.front!=='all' && !r.fronts.includes(state.front)) return false;
    if(state.claim && r.claim_type!==state.claim) return false;
    for (const [key,field] of [['company','companies'],['person','people'],['product','products'],['technology','technologies']]) if(state[key] && !r[field].includes(state[key])) return false;
    const haystack=normalize([r.title,r.summary,...r.companies,...r.people,...r.products,...r.technologies,...r.sources.map(s=>`${s.title} ${s.publisher}`)].join(' '));
    return tokens.every(t=>haystack.includes(t));
  });
}
export function sortRecords(records, sort='consulted') {
  return [...records].sort((a,b)=>sort==='title' ? a.title.localeCompare(b.title,'es') : (String(sort==='event'?b.event_date||'':b.consulted_at).localeCompare(String(sort==='event'?a.event_date||'':a.consulted_at)) || a.title.localeCompare(b.title,'es')));
}
export function statistics(records) {
  return {records:records.length,sources:unique(records.flatMap(r=>r.sources.map(s=>s.url))).length,companies:unique(records.flatMap(r=>r.companies)).length,fronts:unique(records.flatMap(r=>r.fronts)).length};
}
export function timelineDate(record) {
  if(record.event_date) return {date:record.event_date,kind:'Hecho'};
  const published=record.sources.map(s=>s.published_at).filter(Boolean).sort()[0];
  return published ? {date:published,kind:'Publicación'} : {date:null,kind:'Fecha no publicada'};
}
export function formatDate(value, {long=false}={}) {
  if(!date(value)) return 'Sin fecha publicada';
  if(/^\d{4}$/.test(value)) return value;
  const opts={year:'numeric',month:long?'long':'short',timeZone:'UTC'};
  if(!/^\d{4}-\d{2}$/.test(value)) opts.day='numeric';
  return new Intl.DateTimeFormat('es-ES',opts).format(new Date(value));
}
export function documentedRelations(records) {
  return records.flatMap(r=>(r.relations||[]).map(rel=>({...rel,record:r}))).filter((rel,i,list)=>list.findIndex(other=>other.from===rel.from&&other.to===rel.to&&other.label===rel.label&&other.source_url===rel.source_url)===i);
}
