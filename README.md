# 🪐 Sistema Solar Interactivo — WebGPU / Three.js

Simulación 3D de alto rendimiento del Sistema Solar con **rigor astronómico** y vocación educativa/científica. Órbitas keplerianas reales (época J2000), **105 000 asteroides animados con compute shaders en GPU** (TSL/WGSL), renderizado con **`THREE.WebGPURenderer`** y *fallback* automático a WebGL2.

![stack](https://img.shields.io/badge/render-WebGPU%20%7C%20WebGL2-22d3ee)
![lang](https://img.shields.io/badge/lang-TypeScript-3178c6)
![build](https://img.shields.io/badge/build-Vite-646cff)
![style](https://img.shields.io/badge/style-Tailwind%20v4-38bdf8)

---

## ✨ Características

### Motor de simulación
- **Órbitas keplerianas reales**: elementos orbitales J2000 (Standish/JPL) para 8 planetas + Plutón y asteroides destacados. La ecuación de Kepler `M = E − e·sin E` se resuelve por Newton-Raphson en CPU (cuerpos principales) y **en GPU** (cinturones).
- **Dos modos de escala**:
  - **1:1 Real** — distancias y tamaños proporcionales (1 UA = 10 unidades de escena).
  - **Didáctica** — compresión de distancias `r′ = 10·√r` y tamaños con progresión suavizada, para encuadrar todo el sistema. Sliders independientes de distancia y tamaño en vivo.
- **Control del tiempo**: pausa, inversión, multiplicadores (tiempo real → 1 h/s → 1 día/s → 1 mes/s → 1 año/s). La fecha simulada se calcula desde J2000.
- **`logarithmicDepthBuffer`** para evitar Z-fighting a escalas astronómicas.

### GPU: compute shaders + instancing
- **Cinturón Principal** (60 000 asteroides) y **Cinturón de Kuiper** (45 000 cuerpos helados): cada roca resuelve su propia órbita (Newton-Raphson en WGSL) dentro de un **compute shader TSL**, con huecos de Kirkwood (resonancias 3:1, 5:2, 7:3, 2:1 con Júpiter) muestreados por rechazo.
- Renderizado en **1 draw call por cinturón** (`InstancedMesh` + `positionNode`): rotación individual y tamaño por instancia aplicados en el vertex shader, sin tocar matrices CPU.
- **Raycasting por instancia**: al hacer clic, se replica la misma matemática orbital en CPU (solo en ese instante) para identificar el `instanceId` exacto bajo el cursor — cada asteroide individual es inspeccionable.

### Cuerpos y detalle visual
- Sol emisivo con resplandor; 8 planetas + Plutón con inclinación axial y rotación (retrógrada donde corresponde).
- **Lunas**: la Luna, las 4 galileanas (Ío, Europa, Ganímedes, Calisto) y Titán, Encélado y Mimas — órbitas locales sincronizadas al planeta padre.
- **Anillos de Saturno** con textura procedural (anillos C/B/A, divisiones de Cassini y Encke) y mapeo radial UV.
- **Atmósferas** con efecto de borde tipo dispersión (Fresnel/Rim shader TSL): Tierra, Venus, Marte, Neptuno, Titán…
- **Texturas 100% procedurales** (canvas 2D + fBm): continentes terrestres, bandas jovianas con Gran Mancha Roja, cráteres mercurianos/lunares… cero assets binarios en el repo.
- Órbitas elípticas trazadas con la misma transformación de escala que las posiciones (siempre coinciden con el cuerpo), conmutables por tipo.

### Interacción y HUD científico
- Cámara orbital libre (rotación/zoom/paneo con amortiguación) + **focus/lock cinematográfico** (lerp) sobre cualquier cuerpo, siguiéndolo en su traslación.
- Panel de detalles con 5 pestañas por cuerpo: **Resumen, Estructura interna** (barras por capas), **Atmósfera** (composición química %, presión, vientos), **Propiedades físicas** y **Exploración** (misiones históricas).
- Etiquetas HTML proyectadas clickeables, chips de navegación rápida, badges de backend (WebGPU/WebGL2) y FPS.

## 🧱 Stack

| Capa | Tecnología |
|---|---|
| Core 3D | `three/webgpu` (WebGPURenderer + fallback WebGL2) |
| Compute / shaders | `three/tsl` (Node Materials, `storage`, `Fn().compute()`) |
| Lenguaje | TypeScript (strict) |
| Build | Vite |
| Estilos | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Iconos | Lucide (`lucide-static`) |
| Estado | Zustand (API vanilla, sin framework) |

## 📦 Estructura del proyecto

```
solar-system-webgpu/
├── index.html                  # Canvas + HUD + loading screen
├── vite.config.ts              # Vite + Tailwind v4
├── tsconfig.json
└── src/
    ├── main.ts                 # Boot asíncrono y wiring
    ├── styles.css              # Tailwind + estilos HUD
    ├── core/
    │   ├── renderer.ts         # WebGPURenderer + fallback WebGL2 + log depth
    │   ├── simulation.ts       # Orquestador: escena, luces, loop, focus
    │   ├── store.ts            # Estado reactivo (zustand vanilla)
    │   ├── cameraRig.ts        # Cámara orbital propia + focus/lock con lerp
    │   ├── picking.ts          # Raycast analítico + picking por instancia
    │   └── scales.ts           # Sistema de escalas real / didáctica
    ├── physics/
    │   └── kepler.ts           # Elementos J2000, Kepler (Newton), muestreo
    ├── data/
    │   └── celestialData.ts    # BD científica: física, atmósferas, misiones…
    ├── scene/
    │   ├── Bodies.ts           # Jerarquía Sol/planetas/lunas + anillos + atmósferas
    │   ├── AsteroidBelt.ts     # InstancedMesh + compute TSL + picking CPU
    │   ├── Orbits.ts           # Líneas orbitales elípticas/circulares
    │   ├── textures.ts         # Texturas procedurales (fBm, cráteres, anillos)
    │   └── Labels.ts           # Etiquetas HTML proyectadas
    └── ui/
        ├── hud.ts              # Panel de control (escalas, tiempo, visibilidad)
        ├── detailsPanel.ts     # Panel científico con pestañas y barras
        └── icons.ts            # Iconos Lucide
```

## 🚀 Instalación y uso

```bash
# Clonar
git clone https://github.com/cjcr313/solar-system-webgpu.git
cd solar-system-webgpu

# Instalar dependencias
npm install

# Levantar el entorno de desarrollo
npm run dev
# → http://localhost:5173

# Build de producción + typecheck
npm run build
npm run preview
```

**Requisitos**: Node 18+. Para el backend WebGPU usa Chrome/Edge 113+, Safari 18+ o Firefox reciente; en cualquier otro caso la app arranca automáticamente en WebGL2 con el mismo pipeline de nodos.

## 🎮 Controles

| Acción | Control |
|---|---|
| Rotar cámara | Arrastrar (clic izquierdo) |
| Zoom | Rueda / pinch |
| Paneo | Clic derecho o Shift + arrastre |
| Seleccionar cuerpo | Clic sobre el cuerpo o su etiqueta |
| Enfocar / seguir cuerpo | Doble clic · botón ⊕ del panel · chips laterales |
| Vista general | Botón «Vista general» |
| Ocultar / mostrar panel de controles | Tecla `H` · botón ✕ del panel · pestaña flotante |
| Tiempo | Barra inferior: pausa, invertir, presets de velocidad |
| Escalas | Panel izquierdo: modo Real/Didáctica + sliders |

## ⚠️ Notas de precisión

- Las posiciones planetarias usan elementos J2000 sin perturbaciones: precisión de ~grados, adecuada para visualización educativa (no efemérides de navegación).
- En modo didáctico, distancias y tamaños se comprimen deliberadamente (solo la geometría orbital kepleriana es fiel). En modo real, las distancias son proporcionales 1:1 y los tamaños conservan las proporciones reales entre cuerpos con un multiplicador común (25× por defecto, ajustable 1×–300×).
- Las lunas orbitan en el plano local del padre con radios visuales armónicos; en modo real con tamaños ampliados se aplica un radio mínimo (marcado en el código) para que no queden dentro del planeta.
- Los asteroides se dibujan con tamaño visual mínimo: a escala 1:1 real serían invisibles.
- A velocidades extremas (>1 año/s sostenidos por horas), la precisión float32 de los buffers GPU puede degradar las posiciones del cinturón.

## 📄 Licencia

MIT — ver [LICENSE](./LICENSE).
