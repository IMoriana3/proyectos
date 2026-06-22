# 🎮 Arena Solar — Juegos internos

Plataforma de **juegos web** para **formación, team building y ferias** (Intersolar),
construida sobre el **Gemelo Digital** y datos de planta reales del SCADA.

**Jugar:** https://imoriana3.github.io/gemelo-digital/juegos/
**Repo:** https://github.com/imoriana3/gemelo-digital (carpeta `juegos/`)

---

## Juegos disponibles

- **☀ Solar Tycoon** — Simulador de operación de **temporada** sobre una planta REAL
  (El Burgo, 219 seguidores). Gestionas mercado eléctrico, clima, contratos, cuadrillas
  (con desplazamiento, repuestos y mantenimiento preventivo) y economía entre días.
  *Render con césped, sombras y una fila de seguidores en detalle.*
- **🧠 Trivial Solar** — Concurso por equipos (estilo Kahoot) con banco de preguntas
  (FV, seguidores, PRL, O&M, sostenibilidad, mercado). *Hook listo para SolarGPT.*
- **🧩 Ensambla el Tracker** — Montaje 3D del seguidor en el orden real, contrarreloj.
- **🔍 Caza-fallos** — Dado un síntoma, identifica el componente averiado.
- **📱 Tracker en AR** — El render completo del gemelo + Realidad Aumentada.
- **🛠️ Mantenimiento AR** — Guía de O&M sobre el CAD real de la TCU, con AR.
- **🔓 Escape Room Solar** — Acertijos técnicos encadenados.

## Para qué sirve

| Uso | Juegos recomendados |
|-----|---------------------|
| **Formación / onboarding** | Ensambla, Caza-fallos, Mantenimiento AR, Trivial |
| **Team building** | Trivial (equipos), Solar Tycoon, Escape Room |
| **Stand / ferias** | Tracker AR, Solar Tycoon, Mantenimiento AR |

## Notas técnicas

- **Sin instalación:** HTML + JavaScript vanilla + Three.js (CDN). Se publica en
  GitHub Pages directamente.
- **Realidad Aumentada:** requiere **HTTPS** y funciona en **Android/Chrome** (WebXR /
  Scene Viewer). En iPhone se ve en 3D (el AR pleno necesitaría un `.usdz`).
- **Datos reales:** los layouts del Tycoon (El Burgo / Páramo) se extraen del SCADA;
  el render reutiliza la fuente única `seguidor.js` del Gemelo y el CAD `tcu.glb`.
- **Cómo replicar/extender:** ver `juegos/README.md` en el repo del Gemelo Digital
  (estructura, ejecución local, despliegue, empaquetado de un solo archivo y cómo
  añadir preguntas, plantas o pasos).

---

Hecho con el Gemelo Digital · Factiun.
