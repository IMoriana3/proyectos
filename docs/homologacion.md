# Expediente de homologación

*`homologacion.html` — v0.1.0, 2026-11-11. Ficha del Panel; no calcula nada: cuenta.*

## Qué contesta

Lo que le pide al **control** del tracker un homologador de EPC, y con qué se le
contesta hoy. Son 36 requisitos en nueve bloques —viento y stow, fallos y seguridad
funcional, seguimiento y backtracking, alimentación, comunicaciones, SCADA e
integración, ciberseguridad y ciclo de vida, granizo y nieve, puesta en marcha y
fiabilidad— y de cada uno la ficha dice cuatro cosas:

1. **qué herramienta** de la casa lo demuestra, con su enlace;
2. **cómo está hoy**, en una frase;
3. **con qué nivel de evidencia**;
4. **qué lo cierra y quién**: código, medida o ensayo, firmware, estructuras, o
   documentación y cumplimiento.

## Los cuatro niveles

| nivel | qué significa |
|---|---|
| **Medido** | hay dato de campo o de ensayo |
| **Simulado** | lo demuestra un modelo, con sus límites declarados |
| **Declarado** | hay herramienta, parámetro o documento, pero falta la demostración o el entregable |
| **Falta** | no hay evidencia |

La escala es de **evidencia**, no de calidad de la herramienta. Un simulador
excelente deja su requisito en «Simulado»: lo que lo sube a «Medido» es un dato del
producto instalado.

A 11/11/2026: **1 medido, 13 simulados, 10 declarados y 12 sin evidencia**.

## Los tres hallazgos

Van arriba porque son los que frenarían una homologación, y los tres se cierran con
datos de fuera del software:

1. **Se simula la estrategia canónica, no el firmware.** El simulador de
   abanderamiento corre A1/A2/B1/B2 con 40/60 km/h e histéresis de 30 min. El mapa de
   la HSU define otra máquina: hasta 10 niveles de viento, alarma de rachas, un plazo
   de posición segura de 20 min y 16 sectores. Ningún simulador lee esos registros.
2. **La pérdida de comunicación no se demuestra.** La TCU tiene un plazo de pérdida
   de NCU (registro 40022, 10 min por defecto) que ninguna herramienta ejercita.
3. **Los números clave son supuestos.** El tiempo a bandera, la cadena de latencia,
   la suelta del pasivo y la curva de motor están declarados o calculados, no medidos.

Las preguntas que cierran los dos primeros están en `peticiones-de-dato.md`, nº 6 a 8.

## Cómo se lee

- **La barra y las cuatro cifras** son el recuento de la lista. Pulsar un nivel filtra.
- **El mapa de evidencia** lleva una casilla por requisito, por bloque. Pulsar una
  casilla lleva a su requisito; pulsar el nombre de un bloque filtra la lista.
- **Los filtros** de evidencia y de «quién lo cierra» se suman, y el buscador mira
  también dentro de la situación de hoy y de lo que lo cierra («40022», «SAT»).
- **EN / ES** cambia toda la ficha; `?lang=en` la abre en inglés, para pasar el
  enlace a un cliente.
- **Imprimir** la deja en claro y sin controles. En papel los niveles van en gris de
  más a menos evidencia, con su signo y su nombre.

Cada nivel lleva un **signo** además del color (círculo lleno, medio, hueco y aspa):
el color solo no carga con el significado.

## De dónde sale cada nivel, y lo que NO es

Es una **lectura de código y documentos**, fechada en `REVISION`: los repos
`proyectos`, `cobertura-zigbee` y `gemelo-digital`. **No se revisaron** el Panel
publicado, los repos `scada`, `siting` y `SolarGPTfull`, ni ningún equipo real.

O sea que un «Falta» quiere decir «no lo he encontrado en lo que leí», no «no existe».
Quien lleve cada herramienta puede —y debe— corregir el nivel: es una línea de `REQS`.

Y los requisitos salen de lo que hoy piden las normas de trackers (IEC 62817 y UL
3703), la guía de DNV para informes de bancabilidad y la regulación europea de
ciberseguridad (RED, CRA, NIS2). Las fuentes están enlazadas al pie de la ficha. La
aplicabilidad de RED y CRA al producto la confirma quien lleve cumplimiento.

## Cómo se actualiza

Se edita **solo** el array `REQS` de `homologacion.html` y la fecha `REVISION`:

```js
{ n:9, f:'fallos', ev:'falta', w:'firmware', t:[['planta']],
  es:'…', en:'…',      // el requisito
  hes:'…', hen:'…',    // cómo está hoy
  ces:'…', cen:'…' }   // qué lo cierra
```

`ev` es el nivel, `f` el bloque, `w` quién lo cierra y `t` las herramientas (la clave
de `TOOLS`, con una nota opcional: `['toolbox','SAT']`). El veredicto, la barra, las
cifras y el mapa **se recalculan solos**: no hay ningún número escrito a mano arriba.

La versión la declara la ficha (`const VER`) y el Panel la lee de ahí.

## El banco

`tests/test_homologacion.js`, 37 comprobaciones. Saca los recuentos **dos veces**
—del dato, evaluado fuera del navegador, y de lo pintado— y exige que coincidan; y
comprueba filtros, buscador, idioma, impresión y móvil. Se probó con cuatro mutantes
(una cifra que cuenta de menos, un filtro que no filtra, una barra a partes iguales y
los filtros impresos) y los cuatro lo ponen en rojo.

**Lo que el banco no puede saber** es si el nivel de cada requisito es el verdadero.
Eso es una lectura, no una medida.
