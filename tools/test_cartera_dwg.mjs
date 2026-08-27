/* LA CARTERA CONTRA EL DWG. La cartera se escribe a mano y el layout se mide del plano; cuando el
   mismo hecho está en los dos, tarde o temprano divergen y nadie se entera. Este banco los carea.

   NO CORRIGE NADA. La cartera es un documento de la casa, con campos que el DWG no sabe (promotor,
   EPC, estado de PEM). Aquí solo se dice dónde los dos no cuentan lo mismo, y con qué evidencia.

       node tools/test_cartera_dwg.mjs                      usa el repo cobertura-zigbee de al lado
       node tools/test_cartera_dwg.mjs --indice=/ruta.json  si el índice está en otro sitio

   Lo que se carea es lo que ESTÁ MEDIDO en el plano:

       trk_total     contra el número de seguidores del layout
       anem_total    contra los puntos meteo del layout — en El Burgo, `anem_total` son
                     exactamente las 4 HSU del DWG, así que ése es el criterio
       pitch         contra el paso entre filas del bloque `montaje`
       lat / lon     contra el centro del layout, en metros de distancia

   Devuelve 1 si algo no cuadra.                                                                  */
import { readFileSync, existsSync } from 'node:fs';

const arg = (process.argv.find(a => a.startsWith('--indice=')) || '').split('=')[1];
const CAND = arg ? [arg] : [
  '/home/user/Cobertura-Zigbee/plantas_indice.json',
  new URL('../../Cobertura-Zigbee/plantas_indice.json', import.meta.url).pathname,
  new URL('../../cobertura-zigbee/plantas_indice.json', import.meta.url).pathname,
];
const RUTA = CAND.find(p => { try { return existsSync(p); } catch (e) { return false; } });
if (!RUTA) { console.error('no encuentro plantas_indice.json. Ten al lado el repo cobertura-zigbee o pasa --indice='); process.exit(2); }
const IDX = JSON.parse(readFileSync(RUTA, 'utf8')).plantas;
const DIR = RUTA.replace(/plantas_indice\.json$/, '');

const html = readFileSync(new URL('../cartera-tabla.html', import.meta.url).pathname, 'utf8');
const i = html.indexOf('const SEED = ['); const j = html.indexOf('\n', i);
const SEED = JSON.parse(html.slice(i + 13, html.lastIndexOf(']', j) + 1));

const metros = (a, b) => {
  const R = 6371000, dl = (b[0] - a[0]) * Math.PI / 180, dg = (b[1] - a[1]) * Math.PI / 180;
  const q = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
};

let malo = 0, sinCartera = [];
const di = (ok, txt) => { if (!ok) malo++; console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${txt}`); };

for (const p of IDX) {
  if (!p.codigo) continue;
  const c = SEED.find(x => String(x.num) === String(p.codigo));
  if (!c) { sinCartera.push(`${p.planta} (${p.codigo})`); continue; }
  console.log(`· ${p.planta} · ${c.proyecto} · ${p.codigo}`);

  if (c.trk_total != null) di(+c.trk_total === p.unidades,
    `unidades   cartera ${c.trk_total}  ·  DWG ${p.unidades}`);
  else console.log(`  ··    unidades   la cartera no lo trae  ·  DWG ${p.unidades}`);

  let meteo = null;
  try { meteo = (JSON.parse(readFileSync(DIR + p.planta + '_layout.json', 'utf8')).meteo || []).length; } catch (e) { }
  if (meteo != null && c.anem_total != null) di(+c.anem_total === meteo,
    `HSU        cartera ${c.anem_total}  ·  DWG ${meteo}`);

  const pitch = p.montaje && p.montaje.pitch;
  if (pitch != null && c.pitch != null) di(Math.abs(+c.pitch - pitch) < 0.01,
    `paso       cartera ${c.pitch}  ·  DWG ${pitch}`);

  if (c.lat != null && p.lat != null) {
    const d = metros([c.lat, c.lon], [p.lat, p.lon]);
    di(d < 200, `coordenada a ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'} del centro del layout`);
  } else if (p.lat != null) {
    console.log(`  ··    coordenada la cartera no la trae  ·  el DWG sí: ${p.lat}, ${p.lon}`);
  }
}
if (sinCartera.length) console.log(`\ncon layout y sin ficha en la cartera: ${sinCartera.join(', ')}`);
console.log(`\n${malo ? malo + ' divergencia(s). El plano está medido; la cartera se teclea — mirar cuál de los dos hay que corregir' : 'la cartera cuadra con el DWG en todo lo medible'}`);
process.exit(malo ? 1 : 0);
