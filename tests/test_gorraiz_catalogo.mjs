// Verificación sin red del catálogo que aparece en la captura del usuario.
// No confundir la tarjeta lanzadora con los controles internos de Informe/SCADA.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const cards=[
  ['Informe de producción FV · Gorraiz','https://imoriana3.github.io/gorraiz-dashboard/','hasta 14 días'],
  ['SCADA FV · Gorraiz','https://imoriana3.github.io/gorraiz-dashboard/scada.html','rango']
];
for(const [name,url] of cards){
  assert.equal(index.split('name: "'+name+'"').length-1,1,'Ficha única de '+name);
  const mark=index.indexOf('    name: "'+name+'"');
  const next=index.indexOf('\n  {',mark+20);
  const card=index.slice(mark,next>mark?next:mark+1900);
  assert.ok(card.includes('url: "'+url+'"'),'Ruta de apertura de '+name);
  assert.ok(card.includes('updated: "2026-10-23"'),'Actualización visible '+name);
  assert.ok(card.includes('status: "live"'),'Tarjeta visible '+name);
}
assert.ok(index.includes('"SCADA FV · Gorraiz": '),'pictograma propio de SCADA');
assert.ok(index.includes('1 a 14 días cerrados'),'El usuario ve el alcance real del rango SPC');
assert.match(sw,/factiun-panel-v189/,'Nueva versión de la caché PWA');
console.log('OK: entradas Informe y SCADA Gorraiz, enlaces, fecha y caché del catálogo');
