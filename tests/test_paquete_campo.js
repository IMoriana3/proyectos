/* El PAQUETE DE CAMPO de la tarjeta de Cobertura Zigbee, sin navegador.
 *
 * La tarjeta arma el ZIP en el propio panel, sin librería y sin servidor: si el
 * ZIP sale mal, quien lo descubre es el que está en la planta con el portátil.
 * Así que aquí se extrae el bloque del HTML —igual que hacen los bancos de
 * Cobertura Zigbee con su física—, se arma un ZIP y se abre con el `unzip` del
 * sistema. Que lo lea OTRO programa es la única prueba que vale.
 *
 *   node tests/test_paquete_campo.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const RAIZ = path.dirname(__dirname);
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };

const i0 = html.indexOf('/* PAQUETE-INI');
const i1 = html.indexOf('/* PAQUETE-FIN');
if (i0 < 0 || i1 < 0) { console.error('no encuentro los delimitadores PAQUETE-INI / PAQUETE-FIN'); process.exit(1); }
const src = html.slice(i0, html.indexOf('*/', i1) + 2);
const F = new Function(src + ';return {crc32, zipStore, dosFecha, paqueteDe, leemeDe};')();

/* CRC32 contra el valor canónico: es el número que hace que un ZIP se acepte o
   se rechace, y lo tenemos escrito a mano. */
check('el CRC32 da el valor canónico de "123456789"',
      F.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926,
      '0x' + F.crc32(new TextEncoder().encode('123456789')).toString(16));

const FICHEROS = [
  { nombre: 'ayora/LEEME.txt', datos: 'paquete de campo\nsegunda línea con acentos: ñ á\n' },
  { nombre: 'ayora/coords_ayora_NCU01.csv', datos: 'node_id,lat,lon\nTCU_1,39.1,-1.1\n' },
  { nombre: 'ayora/manifiesto_ayora.json', datos: JSON.stringify({ planta: 'ayora', nodos: 769 }) },
];
const zip = F.zipStore(FICHEROS, new Date(Date.UTC(2026, 8, 3, 9, 30, 0)));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paq-'));
const fzip = path.join(dir, 'cobertura_ayora.zip');
fs.writeFileSync(fzip, Buffer.from(zip));

/* La prueba que de verdad importa: que lo lea otro programa. Y hay que mirar
   TAMBIÉN el stderr: con el directorio central apuntando mal, `unzip -t` avisa
   por stderr («NULL central directory offset») y sigue diciendo que no hay
   errores. Mirando solo stdout, ese ZIP roto pasaba por bueno. */
const corre = (args) => {
  try { const r = execFileSync('unzip', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
        return { out: r, err: '', roto: false }; }
  catch (e) { return { out: String(e.stdout || ''), err: String(e.stderr || e.message || ''), roto: true }; }
};
const t = corre(['-t', fzip]);
check('`unzip -t` da el ZIP por bueno', /No errors detected/.test(t.out) && !t.err.trim(),
      (t.err.trim() || t.out.trim()).split('\n').pop());

const l = corre(['-Z1', fzip]);
const lista = l.roto ? [] : l.out.trim().split('\n');
check('y trae los tres ficheros con su ruta dentro de la carpeta de la planta',
      JSON.stringify(lista) === JSON.stringify(FICHEROS.map(q => q.nombre)), JSON.stringify(lista));

for (const q of FICHEROS) {
  const r = corre(['-p', fzip, q.nombre]);
  check('el contenido de ' + path.basename(q.nombre) + ' sale intacto', !r.roto && r.out === q.datos,
        JSON.stringify((r.err || r.out).slice(0, 60)));
}

/* Un ZIP vacío también tiene que ser un ZIP: si la planta no tuviera ficheros,
   más vale un archivo válido y vacío que uno corrupto. */
const vacio = path.join(dir, 'vacio.zip');
fs.writeFileSync(vacio, Buffer.from(F.zipStore([], new Date(Date.UTC(2026, 0, 1)))));
const v = corre(['-t', vacio]);
check('un paquete sin ficheros sigue siendo un ZIP válido',
      /empty|No errors/i.test(v.out + v.err), (v.err || v.out).trim().split('\n').pop());

/* La fecha DOS: el ZIP la guarda con los segundos en pasos de dos y el año
   desde 1980. Puesta al revés, unzip enseña fechas de 1980 en todo. */
const f = F.dosFecha(new Date(2026, 8, 3, 9, 30, 0));
check('la fecha va en formato DOS (año desde 1980, segundos en pasos de dos)',
      (f.dia >> 9) === 46 && ((f.dia >> 5) & 15) === 9 && (f.dia & 31) === 3 && (f.hora >> 11) === 9,
      JSON.stringify(f));

/* El paquete y su LÉEME salen del índice, no de una lista escrita a mano. */
const IDX = { plantas: [{
  planta: 'ayora', titulo: 'Ayora 24025', nodos: 769, ncus: 16,
  gateways_declarados_en_scada: true, manifiesto: 'manifiesto_ayora.json',
  ficheros: [
    { fichero: 'coords_ayora.csv', ambito: 'planta', tcus: 769 },
    { fichero: 'coords_ayora_NCU01_GW1.csv', ambito: 'gateway', ncu: 1, gw: 1, tcus: 63, ip: '10.0.0.1', puerto: 503 },
    { fichero: 'ncus_ayora.csv', ambito: 'coordinadores' },
  ] }] };
const p = F.paqueteDe(IDX, 'ayora');
check('el paquete se arma desde el índice, con el manifiesto dentro',
      p.ficheros.length === 4 && p.ficheros.includes('manifiesto_ayora.json'), JSON.stringify(p.ficheros));
check('y una planta que no está en el índice no inventa un paquete',
      F.paqueteDe(IDX, 'noexiste') === null);
const leeme = F.leemeDe(p);
check('el LÉEME dice CUÁL lanzar y con qué IP:puerto',
      /coords_\*_NCU<nn>_GW<n>\.csv/.test(leeme) && /10\.0\.0\.1:503/.test(leeme) &&
      /NCU 1 GW 1/.test(leeme), leeme.split('\n').find(l => /10\.0\.0\.1/.test(l)));
check('y qué hacer al volver', /diagnostico_elburgo\.py/.test(leeme) && /ayora_real\.geojson/.test(leeme));

console.log('\n' + ok + ' OK, ' + ko + ' FAIL');
process.exit(ko ? 1 : 0);
