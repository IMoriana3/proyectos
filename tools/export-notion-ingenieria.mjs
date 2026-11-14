#!/usr/bin/env node
/* Produces a reviewable PUBLIC snapshot, never a raw workspace dump.
 * Local: node tools/export-notion-ingenieria.mjs --input curated.json
 * API:   NOTION_TOKEN=<server-side only> node tools/export-notion-ingenieria.mjs
 *        --notion --input data/notion-ingenieria.json --output candidate.json
 * An input record is an explicit publication allowlist entry. API mode cannot
 * add records, change source URLs or traverse entities without editorial review.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanSnapshot,publicUrl,FRONT_MAP} from '../lib/notion-ingenieria-core.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const compactId=value=>String(value||'').replace(/-/g,'').toLowerCase();
export const pageId=url=>String(url||'').match(/([0-9a-f]{32})(?:[?#/]|$)/i)?.[1].toLowerCase()||'';
const plain=property=>{
  if(!property)return '';
  if(property.type==='url')return property.url||'';
  if(property.type==='select')return property.select?.name||'';
  if(property.type==='date')return property.date?.start||'';
  if(['title','rich_text'].includes(property.type))return(property[property.type]||[]).map(t=>t.plain_text??t.text?.content??'').join('');
  return '';
};

export function mergePublicPage(base,page,config) {
  const p=page.properties||{}, map=config.properties;
  if(page.archived||page.in_trash||p[map.include]?.checkbox!==true)return null;
  const parent=page.parent?.data_source_id;
  if(compactId(parent)!==compactId(config.data_source_id))throw Error(`La página de ${base.id} no pertenece a la base pública autorizada.`);
  const fronts=(p[map.fronts]?.multi_select||[]).map(f=>config.front_labels[f.name]);
  if(!fronts.length||fronts.some(f=>!FRONT_MAP[f]))throw Error(`Frentes ausentes o desconocidos en ${base.id}.`);
  const url=publicUrl(plain(p[map.source_url]));
  if(!url||!base.sources.some(s=>s.url===url))throw Error(`La URL de ${base.id} cambió: revisar y curar la fuente antes de exportar.`);
  const summary=plain(p[map.summary]), title=plain(p[map.title]), consulted=plain(p[map.consulted_at]);
  if(!summary||!title||!consulted)throw Error(`Faltan título, hallazgo o fecha de consulta en ${base.id}.`);
  // Document Date is legacy and can mean a revision or import date. Only the
  // explicit publication field may refine a curated source date. If absent,
  // preserve a known year/month; never manufacture a first day of the period.
  const published=plain(p[map.published_at])||null;
  return {...base,fronts,summary,consulted_at:consulted,contribution_type:plain(p[map.contribution_type]),locator:plain(p[map.locator]),relation_statement:plain(p[map.relation_statement]),sources:base.sources.map(s=>s.url===url?{...s,title,published_at:published||s.published_at}:s)};
}

export async function queryApprovedSources(config,token,fetcher=fetch) {
  if(!token)throw Error('Falta NOTION_TOKEN en el entorno. La interfaz seguirá usando la exportación publicada.');
  const pages=[],seen=new Set();let cursor;
  do {
    const body={page_size:100,filter:{and:[{property:config.properties.include,checkbox:{equals:true}},{property:config.properties.fronts,multi_select:{is_not_empty:true}}]}};
    if(cursor)body.start_cursor=cursor;
    let response;
    for(let attempt=0;attempt<4;attempt++) {
      response=await fetcher(`https://api.notion.com/v1/data_sources/${encodeURIComponent(config.data_source_id)}/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Notion-Version':config.notion_version},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
      if(response.status!==429)break;
      const wait=Math.min(30,Math.max(1,Number(response.headers.get('retry-after'))||2));
      await new Promise(done=>setTimeout(done,wait*1000));
    }
    if(!response.ok)throw Error(`La consulta de Notion devolvió HTTP ${response.status}; no se ha escrito ninguna exportación.`);
    const data=await response.json();
    if(!Array.isArray(data.results))throw Error('Respuesta de Notion no reconocida.');
    pages.push(...data.results.filter(p=>p.object==='page'));
    cursor=data.has_more?data.next_cursor:null;
    if(data.has_more&&!cursor)throw Error('Notion indicó más resultados sin cursor.');
    if(cursor&&seen.has(cursor))throw Error('Notion repitió un cursor: exportación interrumpida.');
    if(cursor){seen.add(cursor);await new Promise(done=>setTimeout(done,400));}
  } while(cursor);
  return pages;
}

export async function exportSnapshot({input,output,notion=false,token,config,asOf}) {
  const seed=cleanSnapshot(input);
  let result=seed,counts={input:seed.records.length,exported:seed.records.length,excluded:0,awaiting_curation:0};
  if(notion) {
    const pages=await queryApprovedSources(config,token),byId=new Map(pages.map(p=>[compactId(p.id),p]));
    const allowed=new Set(seed.records.map(r=>pageId(r.notion_url)).filter(Boolean));
    if(allowed.size!==seed.records.length)throw Error('Cada ficha autorizada debe tener una página Notion distinta y válida.');
    const records=seed.records.map(r=>{const p=byId.get(pageId(r.notion_url));return p?mergePublicPage(r,p,config):null;}).filter(Boolean);
    counts={input:seed.records.length,exported:records.length,excluded:seed.records.length-records.length,awaiting_curation:pages.filter(p=>!allowed.has(compactId(p.id))).length};
    result=cleanSnapshot({...seed,records,exported_at:asOf||new Date().toISOString(),notion_hub_url:config.notion_hub_url});
  }
  if(!result.records.length)throw Error('La exportación quedaría vacía. Revisar permisos y casillas de publicación antes de sustituirla.');
  if(output){await mkdir(dirname(output),{recursive:true});const temporary=`${output}.tmp`;await writeFile(temporary,JSON.stringify(result,null,2)+'\n');await rename(temporary,output);}
  return {snapshot:result,counts};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined;};
    if(args.includes('--help')){
      console.log('Uso: node tools/export-notion-ingenieria.mjs --input <JSON curado> [--output <JSON público>] [--notion]');
      console.log('--notion lee únicamente registros autorizados del seed, la casilla pública y campos de la base 11. Requiere NOTION_TOKEN; no añade registros ni publica una rama.');
    }else{
      const inputPath=value('--input');if(!inputPath)throw Error('Indica --input con una exportación curada y explícitamente pública.');
      const output=resolve(value('--output')||resolve(ROOT,'data/notion-ingenieria.json'));
      const result=await exportSnapshot({input:await json(resolve(inputPath)),output,notion:args.includes('--notion'),token:process.env.NOTION_TOKEN,config:await json(resolve(ROOT,'tools/notion-ingenieria-config.json'))});
      console.log(JSON.stringify({output,exported_at:result.snapshot.exported_at,...result.counts}));
    }
  }catch(error){console.error(`Exportación cancelada: ${error.message}`);process.exitCode=1;}
}
