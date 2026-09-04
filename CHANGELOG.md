# Changelog

Todos los cambios notables de este proyecto se documentan aquí.
El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el versionado sigue [SemVer](https://semver.org/lang/es/).

## [1.3.0] — 2026-09-03

### Added
- **Texturas reales de alta resolución (2K)** para Sol, Mercurio, Venus, Tierra,
  Luna, Marte, Júpiter, Saturno (+ anillos reales PNG con canal alfa), Urano,
  Neptuno y Ceres — basadas en imágenes NASA/USGS distribuidas por
  [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0).
- **Tierra nivel detalle**: mapa diurno 2K + **normal map de relieve** + **capa de
  nubes independiente** (esfera 1.014×) con deriva levemente más rápida que la
  superficie. Continentes, océanos y casquetes polares claramente distinguibles.
- Sistema de fallback automático: si una textura real falla al cargar, se usa la
  procedural original (el repo sigue funcionando sin assets).

### Changed
- El Sol ahora respeta los colores reales de su textura (emissive neutro cálido).
- Lunas sin textura real disponible (galileanas, Titán, Encélado, Mimas, Plutón,
  Vesta…) mantienen sus texturas procedurales.

## [1.2.0] — 2026-09-03

### Fixed
- **Modo escala 1:1 Real**: el Sol y los planetas ya no distorsionan el sistema.
  Las distancias siempre fueron proporcionales reales, pero el multiplicador de
  tamaños por defecto (900×) agrandaba el Sol (109× la Tierra) hasta invadir las
  órbitas de Mercurio a Marte. Ahora el default es **25×**: los cuerpos se ven como
  discos proporcionales reales sin tapar órbitas.

### Changed
- Cámara: al cambiar de modo de escala (Real ↔ Didáctica) se re-encuadra
  automáticamente con una distancia coherente con las nuevas proporciones
  (si no hay un cuerpo bloqueado en seguimiento).
- Slider de tamaños en modo real: rango 1×–300× (1× = proporción total real).
- Plano cercano de cámara 0,05 → 0,01 y zoom mínimo 0,02 unidades: permite
  enfocar cuerpos pequeños a escala real sin clipping.
- Resplandor solar levemente reducido para no invadir la órbita de Mercurio
  en modo real.

## [1.1.1] — 2026-09-03

### Fixed
- **Botón de reapertura del panel de controles**: no respondía al clic porque heredaba
  `pointer-events: none` del contenedor del HUD. Ahora la pestaña flotante es
  directamente clicable (la tecla `H` ya funcionaba).

## [1.1.0] — 2026-09-03

### Added
- **Panel de controles colapsable**: el panel lateral izquierdo (escala, visibilidad,
  cuerpos) ahora puede ocultarse con el botón ✕ de su cabecera y reabrirse con la
  pestaña flotante que queda en la esquina superior izquierda. También responde a la
  tecla `H`. La preferencia se recuerda entre sesiones (`localStorage`).
- Este `CHANGELOG.md` para trackear los cambios del proyecto.

### Workflow
- Desde esta versión, cada cambio se desarrolla en una rama propia
  (`feat/…`, `fix/…`) y se integra a `main` por pasos.

## [1.0.0] — 2026-08-31

### Added
- Simulación interactiva 3D del Sistema Solar con rigor astronómico.
- **Render**: `THREE.WebGPURenderer` con init asíncrono, fallback automático a
  WebGL2 y `logarithmicDepthBuffer` para escalas astronómicas.
- **Física**: órbitas keplerianas con elementos J2000 (Standish/JPL); ecuación de
  Kepler por Newton-Raphson en CPU (cuerpos principales) y en GPU (cinturones).
- **Cinturones GPU**: 105 000 asteroides (Cinturón Principal con huecos de
  Kirkwood + Kuiper) animados por compute shaders TSL/WGSL, 1 draw call por cinturón.
- **Raycasting por instancia**: picking determinista en CPU al hacer clic para
  identificar el `instanceId` exacto; cada asteroide individual es inspeccionable.
- **Escalas**: modos 1:1 Real y Didáctica (`r′ = 10·√r`) con sliders en vivo de
  distancias y tamaños.
- **Tiempo**: pausa, inversión y multiplicadores desde tiempo real hasta 1 año/s,
  con fecha simulada desde J2000.
- **Cuerpos**: Sol, 8 planetas + Plutón, 8 lunas (Luna, galileanas, Titán,
  Encélado, Mimas) con jerarquía de órbitas locales; anillos de Saturno
  procedurales (divisiones de Cassini y Encke); atmósferas con shader Fresnel TSL.
- **HUD científico**: panel de detalles con 5 pestañas (Resumen, Estructura,
  Atmósfera, Física, Exploración), barras de composición, misiones históricas,
  etiquetas HTML proyectadas clickeables, chips de navegación y badge de backend.
- **Arte 100% procedural**: texturas por canvas 2D + fBm, sin assets binarios.
- Stack: TypeScript estricto, Vite, Tailwind CSS v4, Zustand (vanilla), Lucide.
