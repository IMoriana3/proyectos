// LA GEOMETRÍA SOLAR DE `sim-solar.html`: se ejecuta, pero nadie fijaba un valor.
//
// El hueco de esta ficha no era el de la cartera —«no la abre nadie»— sino uno
// más fino, y se estableció MIDIENDO:
//
//   · `test_buscador.js` SÍ llega hasta aquí: `buscador-implantacion.html` se
//     trae por red los bloques MOTOR SOLAR y SEGUIMIENTO de esta ficha y corre
//     `solarGeom` y `singleaxis` de verdad en el navegador. Comprobado con un
//     control positivo: hacer que `singleaxis` devuelva NaN mata 9
//     comprobaciones allí, y romper la marca de fin del bloque mata 4. El
//     instrumento mide.
//   · pero lo único que comprueba es un ORDEN RELATIVO: que el eje N-S vale 1
//     por construcción y que girarlo cuesta cada vez más. Un orden sobrevive a
//     casi cualquier error de valor.
//
// Y se nota: contra los cinco arneses que podían verlo —buscador, pwa, index,
// integridad y careo_pvsyst— MATARON CERO estos tres mutantes, verificados
// aplicados en disco:
//
//     · el día juliano corrido UN DÍA ENTERO (2440587,5 → 2440588,5);
//     · el BACKTRACKING quitado del todo (`if(p.backtrack)` → `if(false)`);
//     · la REFRACCIÓN anulada.
//
// O sea: la astronomía de esta ficha se podía desplazar un día, o dejar de
// esquivar las sombras entre filas, y el repo entero seguía verde.
//
// Este banco fija VALORES, con los dos oráculos de la casa:
//
//   · lo IMPOSIBLE —la declinación no puede pasar de ±23,5°; la refracción no
//     puede crecer con la altura; el backtracking no puede girar MÁS que el
//     seguimiento libre; el ángulo no puede pasar del tope mecánico—, que no
//     necesita tabla de referencia;
//   · lo ESPERADO —la época J2000 es 2451545,0 exacta; el sol del solsticio a
//     mediodía sube a 90−|φ−δ|; el mediodía solar se desvía entre −14 y +17
//     minutos a lo largo del año—, que es astronomía de manual y sí la tiene.
//
// Se EXTRAE del HTML por las MISMAS marcas que usa el buscador, no se copia:
// así este banco también vigila ese contrato entre fichas.
//
//   node tests/test_solar.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
let ok = 0, ko = 0;
const check = (n, cond, extra) => { if (cond) { ok++; console.log('OK   ' + n); }
  else { ko++; console.log('FAIL ' + n + (extra !== undefined ? ' -> ' + extra : '')); } };
const cerca = (a, b, tol) => isFinite(a) && Math.abs(a - b) <= tol;

const html = fs.readFileSync(path.join(RAIZ, 'sim-solar.html'), 'utf8');

// ── LA EXTRACCIÓN ──────────────────────────────────────────────────────
// Las marcas son las del buscador, LITERALMENTE las mismas expresiones. Si
// alguien las renombra, este banco se cae aquí y no diez comprobaciones más
// abajo con números raros.
const MOT = html.match(/MOTOR SOLAR — inicio[\s\S]*?\*\/([\s\S]*?)\/\* ═+ MOTOR SOLAR — fin/);
const SEG = html.match(/SEGUIMIENTO — inicio[\s\S]*?\*\/([\s\S]*?)\/\* ═+ SEGUIMIENTO — fin/);
check('el bloque MOTOR SOLAR sigue marcado como lo busca el buscador', !!MOT);
check('y el bloque SEGUIMIENTO también', !!SEG);
if (!MOT || !SEG) { console.log('\nFALLA — sin los bloques no hay nada que medir'); process.exit(1); }

// Lo de fuera de las marcas —el día dibujado, el techo de la sombra, la hora
// local— se saca emparejando llaves, porque no lleva marcas.
function sacaFn(nombre) {
  const i = html.indexOf('function ' + nombre + '(');
  if (i < 0) return null;
  let nivel = 0, cad = null;
  for (let k = html.indexOf('{', i); k < html.length; k++) {
    const c = html[k], p = html[k - 1];
    if (cad) { if (c === cad && p !== '\\') cad = null; continue; }
    if (c === '"' || c === "'") { cad = c; continue; }
    if (c === '{') nivel++;
    else if (c === '}') { nivel--; if (nivel === 0) return html.slice(i, k + 1); }
  }
  return null;
}
const FUERA = ['localToUTCms', 'techoSombra', 'thetaDia', 'dayCurve'];
const trozos = FUERA.map(sacaFn);
check('las cuatro funciones de fuera de las marcas siguen ahí',
      trozos.every(Boolean), FUERA.filter((f, i) => !trozos[i]).join(' · '));

// `RAD` y `DEG` se leen del HTML en vez de teclearse: si allí cambiaran de
// valor —o de nombre— este banco estaría midiendo otra cosa sin enterarse.
const cRAD = html.match(/(?:var|const|let)\s+RAD\s*=\s*([^;,]+)/);
const cDEG = html.match(/(?:var|const|let)\s+DEG\s*=\s*([^;,]+)/);
check('`RAD` y `DEG` salen del HTML, no de aquí', !!cRAD && !!cDEG);

const ctx = { Math, Date, console, isFinite, Number, parseFloat, parseInt };
vm.createContext(ctx);
vm.runInContext('var RAD=' + (cRAD ? cRAD[1] : 'Math.PI/180') + ', DEG=' + (cDEG ? cDEG[1] : '180/Math.PI') + ';'
                + MOT[1] + SEG[1] + trozos.filter(Boolean).join('\n'), ctx);
const EXP = ['julianDay', 'refraction', 'solarGeom', 'trueTrackAngle', 'singleaxis'].concat(FUERA);
check('y quedan expuestas las nueve funciones',
      EXP.every(f => typeof ctx[f] === 'function'),
      EXP.filter(f => typeof ctx[f] !== 'function').join(' · '));
const { julianDay: jd, refraction: refr, solarGeom: sg, singleaxis: sa,
        trueTrackAngle: tta, localToUTCms: lu, techoSombra: ts, thetaDia: td, dayCurve: dc } = ctx;

// ══════════════════════════════════════════════════════════════════════
//  1) EL DÍA JULIANO — el mutante que sobrevivía
// ══════════════════════════════════════════════════════════════════════
// La época J2000 es una definición, no una medida: el 1 de enero de 2000 a
// las 12:00 UTC es el día juliano 2451545,0 EXACTO. Aquí no cabe tolerancia,
// y por eso es el ancla: si esto se mueve, todo lo demás se mueve con ello.
check('la época J2000 cae exacta: 2000-01-01T12:00Z = 2451545,0',
      jd(Date.UTC(2000, 0, 1, 12)) === 2451545, jd(Date.UTC(2000, 0, 1, 12)));
check('medianoche es medio día antes, y el .5 no se redondea',
      jd(Date.UTC(2000, 0, 1, 0)) === 2451544.5, jd(Date.UTC(2000, 0, 1, 0)));
check('un día de reloj es un día juliano',
      jd(Date.UTC(2026, 5, 21, 12)) - jd(Date.UTC(2026, 5, 20, 12)) === 1);
// La tolerancia es 1e-8 y no 1e-12 A PROPÓSITO: se restan dos julianos de
// unos 2,46 millones, y a esa magnitud el paso de un `double` ya vale ~5e-10.
// La primera versión pedía 1e-12 y fallaba — no por el código, sino por
// exigirle a la resta una precisión que la representación no tiene.
check('y una hora es 1/24, sin redondear a día',
      cerca(jd(Date.UTC(2026, 5, 21, 13)) - jd(Date.UTC(2026, 5, 21, 12)), 1 / 24, 1e-8));

// ══════════════════════════════════════════════════════════════════════
//  2) LA DECLINACIÓN — lo imposible y lo esperado
// ══════════════════════════════════════════════════════════════════════
// La inclinación del eje de la Tierra vale 23,44°, así que la declinación no
// puede salirse de ahí NINGÚN día del año. Es el oráculo que no necesita
// tabla: no se compara contra un número copiado, se compara contra un límite
// que la física no deja cruzar.
let dMin = 99, dMax = -99, dMaxDia = null, dMinDia = null;
for (let d = 0; d < 365; d++) {
  const t = Date.UTC(2026, 0, 1 + d, 12);
  const dec = sg(t, 0, 0).declination;
  if (dec > dMax) { dMax = dec; dMaxDia = new Date(t).toISOString().slice(5, 10); }
  if (dec < dMin) { dMin = dec; dMinDia = new Date(t).toISOString().slice(5, 10); }
}
check('la declinación no se sale de ±23,5° en todo el año',
      dMax < 23.5 && dMin > -23.5, dMin.toFixed(3) + ' … ' + dMax.toFixed(3));
check('y llega a los 23,44° del eje terrestre, no se queda corta',
      cerca(dMax, 23.44, 0.02) && cerca(dMin, -23.44, 0.02),
      dMin.toFixed(3) + ' … ' + dMax.toFixed(3));
// El DÓNDE importa tanto como el cuánto: un desfase del calendario —el mutante
// del día juliano— mueve la fecha del máximo sin sacarlo de rango.
check('el máximo cae en el solsticio de junio (día 20, 21 o 22)',
      /^06-2[012]$/.test(dMaxDia), dMaxDia);
check('y el mínimo en el de diciembre',
      /^12-2[012]$/.test(dMinDia), dMinDia);
check('en el equinoccio de marzo la declinación pasa por cero',
      cerca(sg(Date.UTC(2026, 2, 20, 12), 0, 0).declination, 0, 0.4),
      sg(Date.UTC(2026, 2, 20, 12), 0, 0).declination.toFixed(3));
check('y en el de septiembre también',
      cerca(sg(Date.UTC(2026, 8, 22, 12), 0, 0).declination, 0, 0.4),
      sg(Date.UTC(2026, 8, 22, 12), 0, 0).declination.toFixed(3));
// La declinación es del SOL, no del sitio: no puede depender de dónde mires.
const dec40 = sg(Date.UTC(2026, 5, 21, 12), 40, -3).declination;
const decSur = sg(Date.UTC(2026, 5, 21, 12), -33, 151).declination;
check('la declinación no depende del observador (es del Sol, no del sitio)',
      cerca(dec40, decSur, 1e-9), dec40 + ' vs ' + decSur);

// ══════════════════════════════════════════════════════════════════════
//  3) EL SOL A MEDIODÍA — la fórmula de manual
// ══════════════════════════════════════════════════════════════════════
// A mediodía solar la elevación es 90 − |φ − δ|. Es trigonometría de libro y
// vale para cualquier sitio y cualquier día, así que sirve de careo sin tener
// que traer una tabla de efemérides.
// El pico se busca en DOS pasadas, y la segunda no es cosmética. En el ecuador
// y en el equinoccio el sol pasa por el cenit: ahí la elevación no hace una
// parábola suave sino un PICO EN PUNTA que sube y baja a 0,25° por minuto, así
// que una rejilla de un minuto se puede dejar 0,125° por el camino. La primera
// versión de este banco muestreaba a un minuto y ese caso fallaba por 0,075° —
// el fallo era de la rejilla, no del motor. Se afina a un segundo alrededor del
// máximo grueso y el artefacto desaparece.
function pico(anio, mes, dia, lat, lon) {
  const base = Date.UTC(anio, mes, dia);
  let b = { el: -99, ms: base };
  for (let m = 0; m < 1440; m++) {
    const t = base + m * 60000, g = sg(t, lat, lon);
    if (g.elevation > b.el) b = { el: g.elevation, ms: t, az: g.azimuth, dec: g.declination };
  }
  for (let s = -120000; s <= 120000; s += 1000) {
    const t = b.ms + s, g = sg(t, lat, lon);
    if (g.elevation > b.el) b = { el: g.elevation, ms: t, az: g.azimuth, dec: g.declination };
  }
  b.m = (b.ms - base) / 60000;
  return b;
}
[[2026, 5, 21, 40, 0, 'lat 40 N, solsticio de junio'],
 [2026, 11, 21, 40, 0, 'lat 40 N, solsticio de diciembre'],
 [2026, 2, 20, 0, 0, 'ecuador, equinoccio'],
 [2026, 11, 21, -30, 0, 'lat 30 S, verano austral'],
 [2026, 5, 21, 60, 0, 'lat 60 N, sol muy alto de día largo']
].forEach(function (c) {
  const p = pico(c[0], c[1], c[2], c[3], c[4]);
  const esperado = 90 - Math.abs(c[3] - p.dec);
  check('a mediodía el sol sube a 90−|φ−δ| — ' + c[5],
        cerca(p.el, esperado, 0.05), p.el.toFixed(3) + ' vs ' + esperado.toFixed(3));
});
// El azimut a mediodía delata el hemisferio: al sur si estás al norte del sol,
// al norte si estás al sur. Cerca del cenit el azimut es indeterminado —el
// denominador se va a cero— así que ahí NO se comprueba: sería un oráculo
// exigiendo precisión donde la geometría no la tiene.
const pN = pico(2026, 11, 21, 40, 0), pS = pico(2026, 11, 21, -30, 0);
check('al norte del sol, el mediodía mira al sur', cerca(pN.az, 180, 1), pN.az.toFixed(2));
check('y al sur del sol, mira al norte', cerca(pS.az % 360, 0, 1) || cerca(pS.az, 360, 1), pS.az.toFixed(2));
// Simetría alrededor del mediodía: el sol sube y baja igual. Un error en la
// ecuación del tiempo desplaza el mediodía pero conserva la simetría; un error
// en el ángulo horario la rompe.
const pm = pico(2026, 5, 21, 40, 0);
[30, 60, 120].forEach(function (dt) {
  const a = sg(pm.ms - dt * 60000, 40, 0).elevation;
  const b = sg(pm.ms + dt * 60000, 40, 0).elevation;
  check('el sol sube y baja simétrico alrededor del mediodía (±' + dt + ' min)',
        cerca(a, b, 0.1), a.toFixed(3) + ' vs ' + b.toFixed(3));
});

// ══════════════════════════════════════════════════════════════════════
//  4) LA ECUACIÓN DEL TIEMPO
// ══════════════════════════════════════════════════════════════════════
// El mediodía solar no cae a las 12:00 ni siquiera en el meridiano cero: se
// adelanta y se atrasa a lo largo del año, entre unos −14 y +17 minutos. Es
// el término que más se parece a «un desfase de calendario» y por tanto el
// que más directamente contradice al mutante del día juliano.
let eMin = 999, eMax = -999;
for (let d = 0; d < 365; d += 5) {
  const p = pico(2026, 0, 1 + d, 0, 0);
  const e = 720 - p.m;
  if (e < eMin) eMin = e; if (e > eMax) eMax = e;
}
check('el mediodía solar se atrasa hasta unos 14 min', cerca(eMin, -14, 1.5), eMin.toFixed(2));
check('y se adelanta hasta unos 17', cerca(eMax, 17, 1.5), eMax.toFixed(2));
// La longitud entra a 4 min por grado: es una definición, no un ajuste.
const p0 = pico(2026, 5, 21, 40, 0), p15 = pico(2026, 5, 21, 40, -15);
check('quince grados al oeste son sesenta minutos de reloj',
      cerca(p15.m - p0.m, 60, 1), (p15.m - p0.m) + ' min');

// ══════════════════════════════════════════════════════════════════════
//  5) LA REFRACCIÓN — el tercer mutante que sobrevivía
// ══════════════════════════════════════════════════════════════════════
// La atmósfera levanta al sol, y lo levanta MÁS cuanto más bajo está: en el
// horizonte medio grado —de ahí que el sol se vea cuando geométricamente ya
// se puso—, y nada arriba del todo. Que decrezca es lo imposible de violar.
check('en el horizonte la refracción levanta ~0,48° (medio disco solar)',
      cerca(refr(0), 0.482, 0.005), refr(0).toFixed(4));
check('y por encima de 85° ya no corrige nada', refr(86) === 0 && refr(89) === 0);
let decrece = true, ant = Infinity;
for (let e = 0; e <= 85; e += 0.5) { const r = refr(e); if (r > ant + 1e-12) decrece = false; ant = r; }
check('nunca crece con la altura: el sol bajo se levanta más que el alto', decrece);
check('y nunca es negativa entre 0° y 85° (no hunde al sol)',
      (function () { for (let e = 0; e <= 85; e += 0.5) if (refr(e) < 0) return false; return true; })());
// Los tres tramos de la fórmula existen porque el modelo cambia de régimen;
// se ejercitan los tres, con el de abajo del horizonte incluido.
check('el tramo alto (>5°) da correcciones pequeñas', refr(45) > 0 && refr(45) < 0.05, refr(45).toFixed(4));
check('el tramo bajo (0…5°) da correcciones grandes', refr(1) > 0.2 && refr(1) < 0.5, refr(1).toFixed(4));
check('y por debajo del horizonte sigue definida, no NaN', isFinite(refr(-2)), refr(-2));

// ══════════════════════════════════════════════════════════════════════
//  6) EL SEGUIDOR — y el BACKTRACKING, el segundo mutante que sobrevivía
// ══════════════════════════════════════════════════════════════════════
// `singleaxis` es el port literal de pvlib, y la ficha lo dice: es la fuente
// de autoridad. Se le exige lo que pvlib promete.
const P = (bt, gcr, mx) => ({ axisTilt: 0, axisAz: 0, maxAngle: mx === undefined ? 60 : mx,
                              backtrack: bt, gcr: gcr === undefined ? 0.3 : gcr, crossAxisTilt: 0 });
check('de noche no hay ángulo: devuelve NaN, como pvlib', isNaN(sa(95, 180, P(false))));
check('y justo en el horizonte tampoco (90° no es «de día»)', isNaN(sa(90, 180, P(false))));
// Con eje horizontal N-S, el sol justo al este pone el seguidor al ángulo de
// su cenit: es la comprobación que ata el convenio de signos.
check('sol justo al este: el giro iguala al ángulo cenital',
      cerca(sa(60, 90, P(false)), 60, 1e-6), sa(60, 90, P(false)));
check('y justo al oeste, el mismo giro cambiado de signo',
      cerca(sa(60, 270, P(false)), -60, 1e-6), sa(60, 270, P(false)));
check('el seguimiento es antisimétrico este-oeste a cualquier altura',
      [20, 35, 50].every(z => cerca(sa(z, 90, P(false)) + sa(z, 270, P(false)), 0, 1e-9)));
check('el tope mecánico se respeta: con 45° no sale un grado más',
      cerca(sa(80, 90, P(false, 0.3, 45)), 45, 1e-9), sa(80, 90, P(false, 0.3, 45)));
check('y por el otro lado también', cerca(sa(80, 270, P(false, 0.3, 45)), -45, 1e-9));
// EL BACKTRACKING. Esto es lo que el mutante borraba entero sin que nadie se
// enterara: cuando el sol baja, las filas se hacen sombra y el seguidor tiene
// que RETROCEDER. Nunca puede girar más que el libre, y con las filas más
// juntas tiene que retroceder más.
let btNuncaMayor = true, btAlgunaVezMenor = false;
for (let z = 10; z < 90; z += 2) {
  const lib = sa(z, 90, P(false)), bt = sa(z, 90, P(true, 0.4));
  if (Math.abs(bt) > Math.abs(lib) + 1e-9) btNuncaMayor = false;
  if (Math.abs(bt) < Math.abs(lib) - 1e-6) btAlgunaVezMenor = true;
}
check('el backtracking NUNCA gira más que el seguimiento libre', btNuncaMayor);
check('y alguna vez gira menos — o no estaría haciendo nada', btAlgunaVezMenor);
check('con el sol alto no hace falta retroceder: coincide con el libre',
      cerca(sa(50, 90, P(true, 0.3)), sa(50, 90, P(false)), 1e-9),
      sa(50, 90, P(true, 0.3)) + ' vs ' + sa(50, 90, P(false)));
check('con el sol bajo sí: a 75° de cenit el retroceso ya se nota',
      Math.abs(sa(75, 90, P(true, 0.3))) < Math.abs(sa(75, 90, P(false))) - 5,
      sa(75, 90, P(true, 0.3)).toFixed(2) + ' vs ' + sa(75, 90, P(false)).toFixed(2));
check('filas más juntas (gcr mayor) obligan a retroceder más',
      Math.abs(sa(75, 90, P(true, 0.5))) < Math.abs(sa(75, 90, P(true, 0.3))),
      sa(75, 90, P(true, 0.5)).toFixed(2) + ' < ' + sa(75, 90, P(true, 0.3)).toFixed(2));
check('y el retroceso crece de forma monótona con el gcr',
      [0.2, 0.3, 0.4, 0.5, 0.6].map(g => Math.abs(sa(78, 90, P(true, g))))
        .every((v, i, A) => i === 0 || v <= A[i - 1] + 1e-9),
      [0.2, 0.3, 0.4, 0.5, 0.6].map(g => +sa(78, 90, P(true, g)).toFixed(2)).join(' '));
// El eje también se puede girar, y esa es la variable que el buscador ordena.
check('girar el eje cambia el ángulo pedido al seguidor',
      Math.abs(tta(60, 90, 0, 0) - tta(60, 90, 0, 30)) > 1,
      tta(60, 90, 0, 0).toFixed(2) + ' vs ' + tta(60, 90, 0, 30).toFixed(2));
check('un eje inclinado no da el mismo ángulo que uno horizontal',
      Math.abs(tta(60, 90, 20, 0) - tta(60, 90, 0, 0)) > 0.5,
      tta(60, 90, 20, 0).toFixed(2) + ' vs ' + tta(60, 90, 0, 0).toFixed(2));

// ══════════════════════════════════════════════════════════════════════
//  7) LA HORA LOCAL Y EL DÍA DIBUJADO
// ══════════════════════════════════════════════════════════════════════
check('las 12:00 locales con huso +2 son las 10:00 UTC',
      lu('2026-06-21', 720, 2) === Date.UTC(2026, 5, 21, 10), new Date(lu('2026-06-21', 720, 2)).toISOString());
check('y con huso 0, las 12:00 UTC', lu('2026-06-21', 720, 0) === Date.UTC(2026, 5, 21, 12));
check('un huso negativo va al otro lado, no al mismo',
      lu('2026-06-21', 720, -5) === Date.UTC(2026, 5, 21, 17));
check('el mes se lee en base 1 (junio es 06, no 07)',
      new Date(lu('2026-06-21', 0, 0)).getUTCMonth() === 5);

const dia = td(40, -3, '2026-06-21', 2, 0.3, 60, 180);
check('el día de seguimiento va de 0 a 1440 a paso de 5 min', dia.length === 289, dia.length);
check('y en el solsticio de lat 40 hay sol en la mayor parte',
      dia.filter(p => p.sol).length > 150 && dia.filter(p => p.sol).length < 200,
      dia.filter(p => p.sol).length);
check('de noche no da ángulo ni con backtracking ni sin él',
      dia.filter(p => !p.sol).every(p => p.bt === null || isFinite(p.bt)));
check('al amanecer el backtracking deja las filas casi planas mientras el libre está al tope',
      (function () { const p = dia.filter(x => x.sol && x.bt !== null && x.libre !== null)[0];
        return p && Math.abs(p.bt) < 5 && Math.abs(p.libre) > 50; })(),
      (function () { const p = dia.filter(x => x.sol && x.bt !== null && x.libre !== null)[0];
        return p ? 'bt ' + p.bt.toFixed(1) + ' / libre ' + p.libre.toFixed(1) : 'sin punto'; })());
check('y a lo largo del día las dos series se separan en unas decenas de puntos',
      dia.filter(p => p.bt !== null && p.libre !== null && Math.abs(p.bt - p.libre) > 0.01).length > 20,
      dia.filter(p => p.bt !== null && p.libre !== null && Math.abs(p.bt - p.libre) > 0.01).length);

const curva = dc(40, -3, '2026-06-21', 2);
check('la curva del día encuentra su orto y su ocaso', curva.rise !== null && curva.set !== null,
      curva.rise + ' … ' + curva.set);
check('y el pico cae entre los dos', curva.peak.min > curva.rise && curva.peak.min < curva.set,
      curva.peak.min);
check('la sombra se guarda POR METRO de altura, así que de noche no hay',
      curva.pts.filter(p => p.el <= 0).every(p => p.sh === null));
check('y con el sol alto la sombra por metro es corta',
      curva.pts[Math.round(curva.peak.min / 4)].sh < 1,
      curva.pts[Math.round(curva.peak.min / 4)].sh);

// ══════════════════════════════════════════════════════════════════════
//  8) EL TECHO DE LA SOMBRA
// ══════════════════════════════════════════════════════════════════════
// Redondea hacia arriba a un paso «bonito» (1-1,5-2-2,5-3-4-5-6-8-10 por
// década) para que la escala del dibujo no baile. Lo que NO puede es quedarse
// corto: el techo tiene que cubrir la sombra que va a pintar.
[[2, 0], [2, 70], [10, 70], [0.5, 30], [25, 15]].forEach(function (c) {
  const v = ts(c[0], c[1]), suelo = c[0] / Math.tan(10 * Math.PI / 180);
  check('el techo cubre la sombra de 10° — obj ' + c[0] + ' m, pico ' + c[1] + '°',
        v >= suelo - 1e-9, v.toFixed(2) + ' >= ' + suelo.toFixed(2));
});
check('y es un paso de escala, no un número cualquiera',
      [[2, 0], [10, 70], [25, 15]].every(function (c) {
        const v = ts(c[0], c[1]), e = Math.pow(10, Math.floor(Math.log10(v)));
        return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].some(p => Math.abs(v / e - p) < 1e-9);
      }), [[2, 0], [10, 70], [25, 15]].map(c => ts(c[0], c[1])).join(' · '));
check('un objeto más alto nunca da un techo más bajo',
      [1, 2, 5, 10, 20, 50].map(o => ts(o, 40)).every((v, i, A) => i === 0 || v >= A[i - 1]),
      [1, 2, 5, 10, 20, 50].map(o => ts(o, 40)).join(' '));

// ══════════════════════════════════════════════════════════════════════
//  9) CONTROL POSITIVO
// ══════════════════════════════════════════════════════════════════════
// Una batería donde todo sobrevive puede querer decir que la batería está
// rota, y hoy ya pasó una vez. Aquí se recompila el motor con la época
// corrida UN DÍA —el mutante que los cinco arneses no mataban— y se exige que
// este banco SÍ lo distinga. Si los dos dieran lo mismo, todo lo de arriba
// estaría midiendo el aire.
const ctxM = { Math, Date, console, isFinite, Number };
vm.createContext(ctxM);
const motMut = MOT[1].replace('2440587.5', '2440588.5');
check('el mutante de control queda APLICADO en el texto recompilado',
      motMut !== MOT[1] && motMut.indexOf('2440588.5') >= 0);
vm.runInContext('var RAD=' + (cRAD ? cRAD[1] : 'Math.PI/180') + ', DEG=' + (cDEG ? cDEG[1] : '180/Math.PI') + ';'
                + motMut + SEG[1], ctxM);
const decBuena = sg(Date.UTC(2026, 2, 20, 12), 0, 0).declination;
const decMut = ctxM.solarGeom(Date.UTC(2026, 2, 20, 12), 0, 0).declination;
check('CONTROL: con la época corrida un día, la declinación se mueve y aquí se ve',
      Math.abs(decMut - decBuena) > 0.2,
      'buena ' + decBuena.toFixed(3) + ' · mutada ' + decMut.toFixed(3) +
      ': si coincidieran, este banco no distinguiría el calendario');

console.log('\n' + (ko ? 'FALLA' : 'OK') + ' — ' + ok + '/' + (ok + ko) + ' comprobaciones');
process.exit(ko ? 1 : 0);
