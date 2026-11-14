import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {engineeringTarget} from '../lib/notion-ingenieria-redirect.mjs';

const archive=JSON.parse(readFileSync(new URL('../docs/audit/notion-ingenieria-snapshot-20261114.json',import.meta.url)));
const destination='https://maps-9rd.pages.dev/herramientas/radar-factiun#ingenieria';
const resolve=query=>new URL(engineeringTarget('https://panel-im3.pages.dev/notion-ingenieria.html'+query));
let passed=0,failed=0;
const check=(name,fn)=>{try{fn();console.log('OK   '+name);passed++;}catch(e){console.error('FAIL '+name+' — '+e.message);failed++;}};

check('sin estado abre la única pantalla canónica de ingeniería',()=>assert.equal(resolve('').href,destination));
check('el origen de una preview o la antigua ruta de Pages no cambia el destino',()=>{
  for(const origin of ['https://preview.panel-im3.pages.dev','https://imoriana3.github.io/proyectos'])assert.equal(engineeringTarget(origin+'/notion-ingenieria.html'),destination);
});
check('los diez frentes guardados llegan a Atlas con su identificador',()=>{
  for(const front of ['modelos','patentes','personas','proveedores','montaje','control','laboratorios','investigacion','incidentes','senales'])assert.equal(resolve('?front='+front).searchParams.get('front'),front);
});
check('se conservan los enlaces a las nueve fichas históricas',()=>{
  assert.equal(archive.records.length,9);
  for(const record of archive.records)assert.equal(resolve('?ficha='+record.id).searchParams.get('ficha'),record.id);
});
check('búsqueda y facetas conservan tildes, espacios y signos sin convertirse en URL',()=>{
  const values={q:'torsión & viento #1 + clip',claim:'manufacturer_claim',company:'I+D / Componentes',technology:'Transmisión & control',person:'José García',product:'Modelo + versión A'};
  const target=resolve('?'+new URLSearchParams(values));
  for(const [key,value] of Object.entries(values))assert.equal(target.searchParams.get(key),value);
  assert.equal(target.hash,'#ingenieria');
});
check('las presentaciones y órdenes guardados se trasladan sin reinterpretarlos',()=>{
  for(const view of ['cards','table','timeline','relations'])for(const sort of ['consulted','event','title']){
    const target=resolve('?view='+view+'&sort='+sort);assert.equal(target.searchParams.get('view'),view);assert.equal(target.searchParams.get('sort'),sort);
  }
});
check('los tres modos de luz llegan al contrato visual de Atlas',()=>{
  for(const luz of ['dia','noche','auto'])assert.equal(resolve('?luz='+luz).searchParams.get('luz'),luz);
});
check('los parámetros ajenos al estado de ingeniería se descartan',()=>{
  const target=resolve('?front=patentes&utm_source=old&token=example&debug=1');
  assert.deepEqual([...target.searchParams],[['front','patentes']]);
});
check('ningún parámetro puede elegir otro origen o ruta de navegación',()=>{
  const target=resolve('?url=https://elsewhere.example&redirect=//elsewhere.example&next=javascript:alert(1)&company=https://elsewhere.example');
  assert.equal(target.origin,'https://maps-9rd.pages.dev');assert.equal(target.pathname,'/herramientas/radar-factiun');assert.equal(target.searchParams.get('company'),'https://elsewhere.example');
});
check('los fragmentos antiguos no sustituyen la pestaña ingeniería',()=>{
  for(const hash of ['#results','#method','#direccion','#https://elsewhere.example'])assert.equal(resolve('?front=control'+hash).hash,'#ingenieria');
});
check('un parámetro repetido conserva el primer valor, como el visor anterior',()=>assert.equal(resolve('?front=patentes&front=control').searchParams.get('front'),'patentes'));
check('los filtros vacíos no introducen un estado diferente al predeterminado',()=>assert.equal(resolve('?q=&company=&ficha=&luz=').href,destination));
check('los límites de longitud siguen el contrato anterior de filtros e IDs',()=>{
  const target=resolve('?q='+'x'.repeat(500)+'&ficha='+'a'.repeat(200));
  assert.equal(target.searchParams.get('q').length,300);assert.equal(target.searchParams.get('ficha').length,160);
});
check('calcular el destino no modifica el enlace original',()=>{
  const source=new URL('https://panel-im3.pages.dev/notion-ingenieria.html?front=patentes#results');
  const before=source.href;engineeringTarget(source);assert.equal(source.href,before);
});

console.log(`\n${passed} comprobaciones correctas; ${failed} fallos.`);
process.exitCode=failed?1:0;
