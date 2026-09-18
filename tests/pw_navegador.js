/* DÓNDE ESTÁ EL CHROMIUM, EN UN SOLO SITIO.

   Diecisiete arneses lanzaban `chromium.launch({ executablePath:
   process.env.CHROMIUM_PATH || undefined })`. En CI eso está BIEN y tiene que
   seguir estándolo: el flujo corre `npx playwright install chromium` antes, así
   que `undefined` es exactamente cómo se le dice a Playwright «usa el navegador
   que te instalaste tú». El hueco está fuera de CI. En una máquina donde el
   navegador ya viene instalado en otro sitio —un contenedor con
   PLAYWRIGHT_BROWSERS_PATH, que es el caso de los entornos de trabajo de la
   casa— no hay nada que apunte ahí, y los diecisiete mueren a la vez pidiendo
   «npx playwright install».

   Y ESE ERROR SE LEE MAL, que es lo que lo convierte en un defecto y no en una
   molestia: diecisiete rojos de golpe parecen el repo roto. Medido el
   2026-09-17 sobre `main` sin tocar una línea de producto: 17 ROJOS que no lo
   eran; con la ruta puesta a mano, los mismos diecisiete en verde. Un rojo
   falso de ese tamaño, además, enseña a no mirar los rojos.

   ORDEN, y ninguno de los pasos inventa nada: lo que digan PW_CHROMIUM o
   CHROMIUM_PATH (las dos porque las dos estaban ya en uso en este repo), luego
   las rutas conocidas de los contenedores de la casa y, si no hay ninguna,
   `undefined` — que NO es un fallo, es el comportamiento de CI de siempre.

   La resolución va APARTE y con el `existe` inyectado porque de esto cuelgan
   ahora diecinueve arneses: si se equivoca no falla uno, fallan todos a la vez
   y con un error que no señala aquí. Su banco es tests/test_pw_navegador.js.

   Mismo criterio y mismas rutas que `tools/pw_navegador.mjs` del repo hermano
   (cobertura-zigbee), que resolvió esto antes. Se copia el criterio, no se
   importa el fichero: son repos distintos y un `require` que cruce el disco
   funciona en esta máquina y en ninguna otra — que es justo el defecto que
   aquel módulo dice haber venido a arreglar. */
const { existsSync } = require('node:fs');

const CANDIDATOS = [
  '/opt/pw-browsers/chromium',
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
];

function resuelve(env, candidatos = CANDIDATOS, existe = existsSync) {
  return [env, ...candidatos].filter(Boolean).find(p => existe(p));
}

const EXEC = resuelve(process.env.PW_CHROMIUM || process.env.CHROMIUM_PATH);

module.exports = { CANDIDATOS, resuelve, EXEC, EXE: EXEC };
