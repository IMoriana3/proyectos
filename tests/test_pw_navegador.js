/* EL RESOLUTOR DEL NAVEGADOR, PROBADO SOBRE MÁQUINAS QUE NO SON ÉSTA.
 *
 * De `resuelve` cuelgan diecinueve arneses. Si se equivoca no cae uno, caen
 * todos a la vez y con un «Failed to launch chromium» que no señala al módulo.
 * Por eso la decisión vive separada del arranque y recibe el `existe`
 * inyectado: así se puede ejercitar el CI (donde no hay ninguna ruta y el
 * acierto es devolver `undefined`) desde una máquina que sí las tiene, y al
 * revés. Sin la inyección, este banco sólo sabría probar el ordenador en el
 * que se ejecuta — que es exactamente el sesgo que causó el defecto.
 *
 *     node tests/test_pw_navegador.js
 */
const { CANDIDATOS, resuelve, EXEC } = require('./pw_navegador.js');

let ok = 0, ko = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('OK   ' + n); }
                             else { ko++; console.log('FAIL ' + n + (d ? ' -> ' + d : '')); } };

// máquinas de mentira: sólo existe lo que cada una lista
const maquina = (...hay) => (p) => hay.includes(p);
const NADA = maquina();
const [CANON, RESPALDO] = CANDIDATOS;

check('CI sin navegador instalado en ruta conocida -> undefined, que es como se le dice a Playwright «usa el tuyo»',
      resuelve(undefined, CANDIDATOS, NADA) === undefined);
check('CI: que la variable venga vacía no cambia nada',
      resuelve('', CANDIDATOS, NADA) === undefined);
check('contenedor de la casa -> la ruta canónica',
      resuelve(undefined, CANDIDATOS, maquina(CANON)) === CANON);
check('sólo el headless_shell -> ése, y no se rinde al primero que falla',
      resuelve(undefined, CANDIDATOS, maquina(RESPALDO)) === RESPALDO);
check('con las dos, gana la canónica (el orden de la lista manda)',
      resuelve(undefined, CANDIDATOS, maquina(RESPALDO, CANON)) === CANON);

/* LO QUE MANDA ES LA VARIABLE, y esto es la mitad que de verdad importa: sin
   ella, una máquina con el chromium de la casa IGNORARÍA lo que le pidan y
   nadie podría probar otro navegador sin desinstalar el suyo. */
check('lo que diga la variable gana a las rutas conocidas',
      resuelve('/otro/chrome', CANDIDATOS, maquina('/otro/chrome', CANON)) === '/otro/chrome');
check('una variable que apunta a lo que NO existe no se usa: se sigue buscando',
      resuelve('/no/existe', CANDIDATOS, maquina(CANON)) === CANON);
check('y si no existe ni ella ni ninguna, undefined (no se inventa una ruta)',
      resuelve('/no/existe', CANDIDATOS, NADA) === undefined);

check('la lista de candidatos no está vacía (si lo estuviera, todo lo de arriba pasaría por vacuidad)',
      Array.isArray(CANDIDATOS) && CANDIDATOS.length >= 2);

/* Y EL VEREDICTO SOBRE ESTA MÁQUINA, que se DECLARA en vez de exigirse: aquí
   tiene valor y en CI es `undefined` a propósito, así que exigir uno u otro
   pondría en rojo a media flota. Se imprime para que quien lea la salida sepa
   con qué navegador corrieron los otros dieciocho arneses. */
console.log('     ── en esta máquina: ' + (EXEC || 'undefined (el que instale Playwright)'));
check('el resolutor devuelve algo utilizable: una ruta o undefined, nunca cadena vacía',
      EXEC === undefined || (typeof EXEC === 'string' && EXEC.length > 0));

console.log(ko ? '\nFALLOS: ' + ko + ' de ' + (ok + ko) : '\nOK — ' + ok + '/' + ok + ' comprobaciones');
process.exit(ko ? 1 : 0);
