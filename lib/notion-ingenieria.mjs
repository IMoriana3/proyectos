import {FRONTS,FRONT_MAP,CLAIMS,STAGES,cleanSnapshot,filterRecords,sortRecords,statistics,formatDate,timelineDate,documentedRelations,unique} from './notion-ingenieria-core.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = front => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${front.icon}"/></svg>`;
const badge = r => `<span class="badge ${r.claim_type}">${CLAIMS[r.claim_type]}</span>`;
const stage = r => STAGES[r.market_stage] ? `<span class="badge market">${STAGES[r.market_stage]}</span>` : '';
const fields = ['q','front','claim','company','technology','person','product','view','sort'];
let dataset = null, state = readState(), lastFocus = null, loading = false;

function readState() {
  const params = new URLSearchParams(location.search);
  const s = Object.fromEntries(fields.map(key=>[key,(params.get(key)||'').slice(0,300)]));
  s.front = FRONT_MAP[s.front] ? s.front : 'all';
  s.view = ['cards','table','timeline','relations'].includes(s.view) ? s.view : 'cards';
  s.sort = ['consulted','event','title'].includes(s.sort) ? s.sort : 'consulted';
  if (!CLAIMS[s.claim]) s.claim = '';
  return s;
}
function writeUrl(recordId) {
  const url = new URL(location.href);
  const defaults={front:'all',view:'cards',sort:'consulted'};
  for (const key of fields) { if (state[key] && state[key]!==defaults[key]) url.searchParams.set(key,state[key]); else url.searchParams.delete(key); }
  if (recordId === null) url.searchParams.delete('ficha');
  else if (recordId) url.searchParams.set('ficha',recordId);
  history.replaceState(null,'',url);
}
function syncControls() {
  for (const key of ['claim','company','technology','person','product','sort']) $(key).value=state[key];
  $('query').value=state.q;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
}
function initFacets() {
  const labels={company:'Todas las empresas',technology:'Todas las tecnologías',person:'Todas las personas',product:'Todos los productos'};
  for (const [key,field] of [['company','companies'],['technology','technologies'],['person','people'],['product','products']]) {
    const values=unique(dataset.records.flatMap(r=>r[field])).sort((a,b)=>a.localeCompare(b,'es'));
    $(key).innerHTML=`<option value="">${labels[key]}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }
  syncControls();
}
function renderFronts() {
  const counts=Object.fromEntries(FRONTS.map(f=>[f.id,dataset.records.filter(r=>r.fronts.includes(f.id)).length]));
  $('fronts').innerHTML=[{id:'all',n:'◈',name:'Todo ingeniería'},...FRONTS].map(f=>`<button class="front ${state.front===f.id?'selected':''}" data-front="${f.id}" ${state.front===f.id?'aria-current="true"':''}><span class="front-number">${f.n}</span><span class="front-label">${f.name}</span><span class="front-count">${f.id==='all'?dataset.records.length:counts[f.id]}</span></button>`).join('');
}
function renderMetrics() {
  const stats=statistics(dataset.records);
  $('metrics').innerHTML=[[stats.records,'fichas documentadas'],[stats.sources,'enlaces de evidencia'],[stats.companies,'empresas citadas'],[`${stats.fronts}<small>/10</small>`,'frentes con evidencia']].map(([n,label])=>`<div class="metric"><span class="metric-value">${n}</span><span>${label}</span></div>`).join('');
  $('export-date').textContent=`Exportación · ${formatDate(dataset.exported_at)}`;
  const days=Math.floor((Date.now()-Date.parse(dataset.exported_at))/86400000);
  $('export-caption').textContent=!navigator.onLine?'Sin conexión · copia disponible':days>14?`${days} días desde esta exportación · selección pública`:'Selección pública · actualización por exportación';
  $('footer-date').textContent=`Datos consultados hasta ${formatDate(dataset.records.map(r=>r.consulted_at).sort().at(-1)||dataset.exported_at)}.`;
  document.querySelectorAll('.notion-link').forEach(a=>{a.href=dataset.notion_hub_url;a.hidden=!dataset.notion_hub_url;});
}
function card(r) {
  const f=FRONT_MAP[r.fronts[0]], d=timelineDate(r);
  return `<article class="record-card" style="--front-color:${f.color}"><div class="card-stripe" aria-hidden="true"></div><div class="card-content"><div class="card-top"><span class="front-tag">${icon(f)}${f.n} / ${f.short}</span><span class="source-count">${r.sources.length} ${r.sources.length===1?'enlace':'enlaces'}</span></div><div class="card-company">${esc(r.companies.slice(0,2).join(' · ')||r.sources[0].publisher)}</div><h3><button class="record-open" data-record="${esc(r.id)}">${esc(r.title)}</button></h3><p class="record-summary">${esc(r.summary)}</p><div class="card-labels">${badge(r)}${stage(r)}</div><div class="tags">${r.technologies.slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></div><div class="card-footer"><span>${d.date?`${d.kind} · ${formatDate(d.date)}`:'Fecha del hecho no publicada'}</span><span class="arrow" aria-hidden="true">↗</span></div></article>`;
}
function table(records) {
  return `<div class="table-wrap" role="region" aria-label="Tabla de fichas, desplazable horizontalmente" tabindex="0"><table class="records-table"><thead><tr><th scope="col">Hallazgo</th><th scope="col">Empresa / producto</th><th scope="col">Tecnología</th><th scope="col">Evidencia / situación</th><th scope="col">Fecha documentada</th><th scope="col">Fuente</th></tr></thead><tbody>${records.map(r=>{const d=timelineDate(r);return `<tr><td><button class="table-title" data-record="${esc(r.id)}">${esc(r.title)}</button><span class="table-front">${r.fronts.map(f=>FRONT_MAP[f].name).join(' · ')}</span></td><td>${r.companies.map(esc).join('<br>')}<span class="table-front">${r.products.map(esc).join(' · ')}</span></td><td class="table-small">${r.technologies.map(esc).join('<br>')}</td><td><div class="card-labels">${badge(r)}${stage(r)}</div></td><td class="table-small">${d.date?formatDate(d.date):'No publicada'}<span class="table-front">${d.date?d.kind:''}</span></td><td><a class="table-source" href="${esc(r.sources[0].url)}" target="_blank" rel="noopener noreferrer">${esc(r.sources[0].publisher||'Abrir fuente')} ↗</a></td></tr>`;}).join('')}</tbody></table></div>`;
}
function timeline(records) {
  const groups=new Map();
  [...records].sort((a,b)=>(timelineDate(b).date||'').localeCompare(timelineDate(a).date||'')).forEach(r=>{const key=timelineDate(r).date?.slice(0,4)||'Sin fecha';if(!groups.has(key)) groups.set(key,[]);groups.get(key).push(r);});
  return `<p class="timeline-intro">Cada hito indica si la fecha corresponde al hecho o a la publicación de la fuente. La fecha de consulta permanece en la ficha.</p>`+[...groups].map(([year,items])=>`<section class="timeline-group" aria-label="${year==='Sin fecha'?'Fichas sin fecha publicada':year}"><h3 class="timeline-year">${year==='Sin fecha'?'s/f':year}</h3><div class="timeline-list">${items.map(r=>{const d=timelineDate(r);return `<article class="timeline-record"><div class="timeline-head"><span class="timeline-date">${d.date?`${d.kind.toUpperCase()} · ${formatDate(d.date)}`:'FECHA NO PUBLICADA'}</span>${badge(r)}</div><h3><button data-record="${esc(r.id)}">${esc(r.title)}</button></h3><p>${esc(r.summary)}</p><div class="tags">${r.products.concat(r.companies.slice(0,1)).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></article>`;}).join('')}</div></section>`).join('');
}
function relations(records) {
  const typed=documentedRelations(records);
  const statements=records.filter(r=>r.relation_statement && !(r.relations||[]).length);
  const pairs=[],seen=new Set();
  for(const r of records) for(const id of r.related_ids){const target=dataset.records.find(x=>x.id===id);const key=[r.id,id].sort().join('|');if(!target||seen.has(key))continue;seen.add(key);pairs.push([r,target]);}
  const intro='<p class="relations-intro">Vínculos que la fuente identifica de forma explícita. Cada relación abre el hallazgo que la respalda.</p>';
  const cards=typed.map(rel=>`<article class="relation-card"><div class="front-tag">RELACIÓN DOCUMENTADA</div><div class="relation-path"><span class="relation-node">${esc(rel.from)}</span><span class="relation-arrow" aria-hidden="true">→</span><span class="relation-node">${esc(rel.to)}</span></div><h3>${esc(rel.label)}</h3><p class="relation-note">${esc(rel.record.sources.find(s=>s.url===rel.source_url)?.publisher||'Fuente pública')}</p><button class="text-button" data-record="${esc(rel.record.id)}">Ver evidencia ↗</button></article>`);
  cards.push(...statements.map(r=>`<article class="relation-card"><div class="front-tag">VÍNCULO EN LA FUENTE</div><h3 style="margin:12px 0 8px">${esc(r.title)}</h3><p>${esc(r.relation_statement)}</p><button class="text-button" data-record="${esc(r.id)}">Ver evidencia ↗</button></article>`));
  cards.push(...pairs.map(([a,b])=>`<article class="relation-card"><div class="front-tag">FICHAS VINCULADAS EN NOTION</div><h3 style="margin:12px 0 8px">${esc(a.title)}</h3><p>${esc(b.title)}</p><p class="relation-note">La relación se conserva en la selección; el alcance se explica en ambas fichas.</p><button class="text-button" data-record="${esc(a.id)}">Abrir ficha y evidencia ↗</button></article>`));
  return intro+(cards.length?`<div class="relation-list">${cards.join('')}</div>`:empty('No hay relaciones explícitas con estos filtros','Puedes explorar las fichas y sus fuentes. Las relaciones se añadirán cuando exista evidencia del vínculo.','cards'));
}
function empty(title,description,action='clear') {
  return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">⌕</span><h3>${esc(title)}</h3><p>${esc(description)}</p><button class="button secondary" data-action="${action}">${action==='cards'?'Ver fichas':'Limpiar filtros'}</button></div>`;
}
function render() {
  if(!dataset)return;
  renderFronts();syncControls();
  const f=FRONT_MAP[state.front];
  $('section-kicker').textContent=f?`FRENTE ${f.n} / INTELIGENCIA TÉCNICA`:'BIBLIOTECA TÉCNICA';
  $('section-title').textContent=f?f.title:'Explorar el conocimiento';
  $('section-description').textContent=f?f.description:'Una selección inicial que crece con cada fuente.';
  const records=sortRecords(filterRecords(dataset.records,state),state.sort);
  const active=['q','claim','company','technology','person','product'].some(k=>state[k])||state.front!=='all';
  $('clear-filters').hidden=!active;
  $('result-count').innerHTML=`<strong>${records.length}</strong> ${records.length===1?'ficha':'fichas'}${active?` de ${dataset.records.length}`:' en esta selección'}`;
  const guide=f?`<details class="front-guide"><summary>Qué buscar en ${f.name.toLowerCase()}</summary><p>${f.watch}</p></details>`:'';
  const content=!records.length?empty('Ninguna ficha coincide','Prueba con otro término o amplía los filtros. Un resultado vacío no significa que no exista información en el sector.'):state.view==='table'?table(records):state.view==='timeline'?timeline(records):state.view==='relations'?relations(records):`<div class="record-grid">${records.map(card).join('')}</div>`;
  $('results').innerHTML=guide+content;
  $('results').setAttribute('aria-busy','false');
  writeUrl();
}
function showRecord(id,{restore=false}={}) {
  const r=dataset?.records.find(record=>record.id===id);
  if(!r)return;
  if(!$('record-dialog').open) lastFocus=document.activeElement;
  const f=FRONT_MAP[r.fronts[0]];
  const facts=r.technical_facts||[];
  const related=r.related_ids.map(id=>dataset.records.find(x=>x.id===id)).filter(Boolean);
  $('dialog-content').innerHTML=`<div class="dialog-header"><div class="front-tag" style="--front-color:${f.color}">${icon(f)}${r.fronts.map(id=>`${FRONT_MAP[id].n} / ${FRONT_MAP[id].short}`).join(' · ')}</div><div class="card-company">${esc(r.companies.join(' · '))}</div><h2 id="dialog-title">${esc(r.title)}</h2><div class="card-labels">${badge(r)}${stage(r)}</div></div><div class="dialog-body"><p class="dialog-summary">${esc(r.summary)}</p><dl class="detail-meta"><div><dt>Fecha del hecho</dt><dd>${formatDate(r.event_date)}</dd></div><div><dt>Consultado</dt><dd>${formatDate(r.consulted_at)}</dd></div><div><dt>Producto / generación</dt><dd>${esc(r.products.join(' · ')||'Producto concreto no identificado')}${r.generation?` · ${esc(r.generation)}`:''}</dd></div><div><dt>Personas citadas en la fuente</dt><dd>${esc(r.people.join(' · ')||'No identificadas en esta ficha')}</dd></div></dl><div class="tags">${r.technologies.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>${facts.length?`<section class="detail-section"><h3>Detalle técnico publicado</h3><dl class="facts">${facts.map(f=>`<dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl></section>`:''}${r.relation_statement?`<section class="detail-section"><h3>Relación técnica documentada</h3><p>${esc(r.relation_statement)}</p></section>`:''}${r.legal_status?`<section class="detail-section"><h3>Estado legal de la patente</h3><p>${esc(r.legal_status)}${r.legal_checked_at?` · Consulta: ${formatDate(r.legal_checked_at)}`:''}</p></section>`:''}<section class="detail-section"><h3>Evidencia y fuentes</h3><ol class="source-list">${r.sources.map((s,i)=>`<li class="source-item"><span class="source-number">${String(i+1).padStart(2,'0')}</span><div><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><small>${esc(s.publisher||new URL(s.url).hostname)} · ${s.published_at?`Publicación: ${formatDate(s.published_at)}`:'Fecha de publicación no indicada'}</small>${s.locator||r.locator?`<p class="source-locator">Localizador: ${esc(s.locator||r.locator)}</p>`:''}</div></li>`).join('')}</ol></section>${r.limitations||r.questions?.length?`<section class="detail-uncertainty"><h3>Alcance y cuestiones abiertas</h3>${r.limitations?`<p>${esc(r.limitations)}</p>`:''}${(r.questions||[]).map(q=>`<p>• ${esc(q)}</p>`).join('')}</section>`:''}${related.length?`<section class="detail-section"><h3>Fichas relacionadas</h3><div class="related-list">${related.map(t=>`<button data-record="${esc(t.id)}">${esc(t.title)} ↗</button>`).join('')}</div></section>`:''}<div class="dialog-actions">${r.notion_url?`<a class="button primary" href="${esc(r.notion_url)}" target="_blank" rel="noopener noreferrer">Abrir ficha en Notion ↗</a>`:''}<a class="button secondary" href="${esc(r.sources[0].url)}" target="_blank" rel="noopener noreferrer">Consultar fuente original ↗</a><button class="text-button" data-action="copy-link">Copiar enlace a esta ficha</button></div></div>`;
  if(!$('record-dialog').open)$('record-dialog').showModal();
  $('record-dialog').scrollTop=0;
  if(!restore)writeUrl(r.id);
  document.body.style.overflow='hidden';
  $('close-dialog').focus({preventScroll:true});
}
async function load() {
  if(loading)return;
  loading=true;$('refresh').disabled=true;$('results').setAttribute('aria-busy','true');
  try {
    const response=await fetch(`data/notion-ingenieria.json`,{cache:'no-cache'});
    if(!response.ok)throw Error('No se ha podido leer la exportación.');
    const candidate=cleanSnapshot(await response.json());
    dataset=candidate;
    initFacets();renderMetrics();render();
    const id=new URLSearchParams(location.search).get('ficha');
    if(id)showRecord(id,{restore:true});
  } catch(err) {
    $('result-count').textContent=dataset?'No se ha podido recargar. Se conserva la selección anterior.':'No se ha podido cargar la selección.';
    if(!dataset){$('results').innerHTML=`<div class="empty-state"><span class="empty-icon" aria-hidden="true">↻</span><h3>La exportación no está disponible</h3><p>Comprueba la conexión y vuelve a intentarlo. Los datos se cargarán cuando pueda leerse la exportación publicada.</p><button class="button secondary" data-action="retry">Volver a cargar</button></div>`;$('export-date').textContent='Exportación no disponible';}
    $('results').setAttribute('aria-busy','false');
    console.error('Notion ingeniería:',err.message);
  } finally {loading=false;$('refresh').disabled=false;}
}
function clearFilters() {for(const key of ['q','claim','company','technology','person','product'])state[key]='';state.front='all';render();}
function closeRecord() {writeUrl(null);$('record-dialog').close();}

document.addEventListener('click',async event=>{
  const front=event.target.closest('[data-front]');
  if(front){state.front=front.dataset.front;render();return;}
  const view=event.target.closest('[data-view]');
  if(view){state.view=view.dataset.view;render();return;}
  const record=event.target.closest('[data-record]');
  if(record){showRecord(record.dataset.record);return;}
  const action=event.target.closest('[data-action]');
  if(action?.dataset.action==='clear')clearFilters();
  if(action?.dataset.action==='cards'){state.view='cards';render();}
  if(action?.dataset.action==='retry')load();
  if(action?.dataset.action==='copy-link') {
    try {await navigator.clipboard.writeText(location.href);action.textContent='Enlace copiado';} catch {action.textContent='Selecciona la dirección del navegador para copiarla';}
  }
});
$('filters').addEventListener('submit',e=>e.preventDefault());
let searchTimer;
$('query').addEventListener('input',event=>{state.q=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(render,120);});
for(const key of ['claim','company','technology','person','product','sort'])$(key).addEventListener('change',event=>{state[key]=event.target.value;render();});
$('clear-filters').addEventListener('click',clearFilters);
$('refresh').addEventListener('click',load);
$('light-toggle').addEventListener('click',()=>{const mode=document.documentElement.dataset.luz==='dia'?'noche':'dia';document.documentElement.dataset.luz=mode;const url=new URL(location.href);url.searchParams.set('luz',mode);history.replaceState(null,'',url);});
$('close-dialog').addEventListener('click',closeRecord);
$('record-dialog').addEventListener('cancel',event=>{event.preventDefault();closeRecord();});
$('record-dialog').addEventListener('close',()=>{document.body.style.overflow='';writeUrl(null);if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});
$('method-link').addEventListener('click',e=>{e.preventDefault();$('method-dialog').showModal();});
$('close-method').addEventListener('click',()=>$('method-dialog').close());
for(const id of ['record-dialog','method-dialog'])$(id).addEventListener('click',event=>{if(event.target!==$(id))return;const rect=$(id).getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom){if(id==='record-dialog')closeRecord();else $(id).close();}});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('record-dialog').open&&!$('method-dialog').open){e.preventDefault();$('query').focus();}});
window.addEventListener('online',()=>dataset&&renderMetrics());
window.addEventListener('offline',()=>dataset&&renderMetrics());
window.addEventListener('popstate',()=>{state=readState();render();const id=new URLSearchParams(location.search).get('ficha');if(id)showRecord(id,{restore:true});else if($('record-dialog').open)$('record-dialog').close();});
load();
