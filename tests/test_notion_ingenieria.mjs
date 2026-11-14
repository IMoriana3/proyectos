import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FRONTS,cleanSnapshot,filterRecords,statistics,publicUrl,notionUrl,timelineDate,documentedRelations,formatDate} from '../lib/notion-ingenieria-core.mjs';
import {mergePublicPage,queryApprovedSources,exportSnapshot,pageId} from '../tools/export-notion-ingenieria.mjs';

const source=JSON.parse(await readFile(new URL('../data/notion-ingenieria.json',import.meta.url),'utf8'));
const config=JSON.parse(await readFile(new URL('../tools/notion-ingenieria-config.json',import.meta.url),'utf8'));
const snapshot=cleanSnapshot(source),records=snapshot.records;
let passed=0,failed=0;
const check=async(name,test)=>{try{await test();console.log('OK   '+name);passed++;}catch(e){console.error('FAIL '+name+' — '+e.message);failed++;}};

await check('la selección real cubre los diez frentes con fuentes',()=>{assert.equal(FRONTS.length,10);assert.equal(statistics(records).fronts,10);assert(records.every(r=>r.sources.length));});
await check('una misma fuente puede sustentar varios frentes sin duplicar la fuente',()=>{const copy={...records[0],fronts:['personas','laboratorios']};assert.equal(statistics([copy]).fronts,2);assert.equal(statistics([copy]).sources,copy.sources.length);});
await check('los contadores cuentan URLs únicas y registros, no afirmaciones de censo',()=>{const stats=statistics([...records,records[0]]);assert.equal(stats.records,records.length+1);assert.equal(stats.sources,statistics(records).sources);});
await check('la búsqueda ignora tildes y combina términos',()=>{const custom={...records[0],title:'Torsión y ángulo diferencial',summary:'Sensor angular',companies:[],people:[],products:[],technologies:[],sources:[]};assert.equal(filterRecords([custom],{q:'torsion angulo'}).length,1);assert.equal(filterRecords([custom],{q:'torsion inexistente'}).length,0);});
await check('empresa, persona, producto y frente se cruzan con AND',()=>{const r={...records[0],fronts:['control'],companies:['Empresa A'],people:['Autora B'],products:['Producto C'],technologies:['Sensor D']};assert.equal(filterRecords([r],{front:'control',company:'Empresa A',person:'Autora B',product:'Producto C',technology:'Sensor D'}).length,1);assert.equal(filterRecords([r],{front:'patentes',company:'Empresa A'}).length,0);});
await check('el estado comercial no cambia al cargar la exportación',()=>{for(const r of records)assert.equal(r.market_stage,source.records.find(x=>x.id===r.id).market_stage);});
await check('la fecha de consulta no se usa como fecha del hecho ni publicación',()=>{const r={...records[0],event_date:null,sources:[{...records[0].sources[0],published_at:null}]};assert.deepEqual(timelineDate(r),{date:null,kind:'Fecha no publicada'});});
await check('cronología identifica publicación cuando no existe fecha del hecho',()=>{const r={...records[0],event_date:null,sources:[{...records[0].sources[0],published_at:'2022'}]};assert.deepEqual(timelineDate(r),{date:'2022',kind:'Publicación'});assert.equal(formatDate('2022'),'2022');assert(!formatDate('2024-02').includes('1 de'));});
await check('la whitelist elimina bloques y propiedades no públicas',()=>{const poisoned=structuredClone(source);poisoned.internal_notes='private';poisoned.records[0].blocks=[{text:'private'}];poisoned.records[0].contact_email='private@example.com';const clean=JSON.stringify(cleanSnapshot(poisoned));assert(!clean.includes('private'));assert(!clean.includes('contact_email'));});
await check('fuentes inseguras, credenciales y Notion privado no pasan como fuentes públicas',()=>{for(const url of ['javascript:alert(1)','http://example.com','https://localhost','https://127.0.0.1','https://user:password@example.com','https://example.internal','https://app.notion.com/p/abc'])assert.equal(publicUrl(url),'');assert(publicUrl('https://www.dnv.com/cases/example/'));});
await check('los enlaces de Notion sólo aceptan dominios Notion',()=>{assert(notionUrl(snapshot.notion_hub_url));assert.equal(notionUrl('https://notion.so.evil.example/abc'),'');assert.equal(notionUrl('javascript:alert(1)'),'');});
await check('un tipo de evidencia desconocido impide publicar',()=>{const poisoned=structuredClone(source);poisoned.records[0].claim_type='approved';assert.throws(()=>cleanSnapshot(poisoned),/evidencia/);});
await check('un registro sin fuente o con ID duplicado impide publicar',()=>{const poisoned=structuredClone(source);poisoned.records[0].sources=[];assert.throws(()=>cleanSnapshot(poisoned),/fuentes/);assert.throws(()=>cleanSnapshot({...source,records:[source.records[0],source.records[0]]}),/duplicadas/);});
await check('las relaciones tipadas necesitan una fuente de la propia ficha',()=>{const r={...records[0],relations:[{from:'A',to:'B',label:'Relación explícita',source_url:records[0].sources[0].url},{from:'X',to:'Y',label:'Inventada',source_url:'https://otro.example/doc'}]};const clean=cleanSnapshot({...source,records:[r]});assert.equal(documentedRelations(clean.records).length,1);assert.equal(documentedRelations(clean.records)[0].from,'A');});

const base=records.find(r=>r.notion_url),map=config.properties;
const property=(type,value)=>({type,[type]:type==='rich_text'||type==='title'?[{plain_text:value}]:type==='date'?{start:value}:value});
const page={id:pageId(base.notion_url),object:'page',parent:{data_source_id:config.data_source_id},properties:{
  [map.include]:property('checkbox',true),[map.fronts]:property('multi_select',[{name:Object.keys(config.front_labels)[0]}]),
  [map.title]:property('title','Documento público'),[map.summary]:property('rich_text','Hallazgo público actualizado'),
  [map.source_url]:property('url',base.sources[0].url),[map.consulted_at]:property('date','2026-11-14'),
  [map.locator]:property('rich_text','Figura 2'),[map.relation_statement]:property('rich_text','Relación explícita en la fuente'),
  'Nota privada':property('rich_text','no publicar')
}};
await check('Notion exporta sólo campos autorizados de base11 y conserva fechas desconocidas',()=>{const merged=mergePublicPage(base,page,config);assert.equal(merged.summary,'Hallazgo público actualizado');assert.equal(merged.event_date,base.event_date);assert.equal(merged.locator,'Figura 2');assert(!JSON.stringify(merged).includes('no publicar'));});
await check('desmarcar publicación excluye la ficha',()=>{const excluded=structuredClone(page);excluded.properties[map.include].checkbox=false;assert.equal(mergePublicPage(base,excluded,config),null);});
await check('cambiar URL exige revisión y no mezcla evidencias',()=>{const changed=structuredClone(page);changed.properties[map.source_url].url='https://other.example/public';assert.throws(()=>mergePublicPage(base,changed,config),/cambió/);});
await check('una base no autorizada o un hallazgo ausente cancelan el candidato',()=>{const wrong=structuredClone(page);wrong.parent.data_source_id='different';assert.throws(()=>mergePublicPage(base,wrong,config),/autorizada/);const missing=structuredClone(page);delete missing.properties[map.summary];assert.throws(()=>mergePublicPage(base,missing,config),/Faltan/);});
await check('la lectura API pagina y filtra por casilla y frentes explícitos',async()=>{const calls=[];const pages=await queryApprovedSources(config,'test-only-token',async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return{ok:true,status:200,json:async()=>calls.length===1?{results:[page],has_more:true,next_cursor:'page-2'}:{results:[{...page,id:'second'}],has_more:false,next_cursor:null}};});assert.equal(calls.length,2);assert.equal(pages.length,2);assert.equal(calls[1].body.start_cursor,'page-2');assert(calls[0].body.filter.and.some(f=>f.property===map.include&&f.checkbox.equals===true));assert(calls[0].url.endsWith(config.data_source_id+'/query'));});
await check('sin token no se consulta Notion ni se simula sincronización',async()=>{await assert.rejects(()=>queryApprovedSources(config,'',async()=>{throw Error('should not fetch');}),/Falta NOTION_TOKEN/);});
await check('exportación local es reproducible y no actualiza la fecha sin consultar datos',async()=>{const folder=await mkdtemp(join(tmpdir(),'engineering-'));try{const path=join(folder,'snapshot.json');await exportSnapshot({input:source,output:path});const roundtrip=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(roundtrip,snapshot);assert.equal(roundtrip.exported_at,source.exported_at);}finally{await rm(folder,{recursive:true,force:true});}});
console.log(`\n${passed} comprobaciones correctas; ${failed} fallos.`);
process.exitCode=failed?1:0;
