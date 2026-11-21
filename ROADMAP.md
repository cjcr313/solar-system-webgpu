# 🗺️ ROADMAP — hacia la versión profesional científica

Backlog priorizado del cronjob semanal de mejora. El agente toma el primer
ítem **pendiente** completable, lo implementa con el workflow del repo y lo
marca. Regla: máximo 1 feature por semana, nunca romper main.

| # | Estado | Versión objetivo | Ítem | Notas |
|---|--------|------------------|------|-------|
| 1 | pendiente | 1.6.0 | **Volumetría de colas de cometas** | Instanced quads con texturas suaves + ruido animado en shader (los point-sprites TSL NO sirven: gl_PointCoord no existe en WGSL). Objetivo: bordes difusos AAA en macro. Verificar con análisis de píxeles (python3 + pillow), no confiar solo en modelos de visión. |
| 2 | pendiente | 1.7.0 | **Selector de fecha (viaje temporal)** | Input date en HUD → simStore.setSimDays. Ya existe window.__solarSetDate para pruebas. Presets: perihelios de Halley (feb 1986 / jul 2061), eclipses conocidos. |
| 3 | pendiente | 1.8.0 | **Tour guiado cinematográfico** | Secuencia: Sol → planetas → cometas con paneo automático + ficha narrada por parada. Botón ▶ Tour, saltar/parar. |
| 4 | pendiente | 1.9.0 | **Captura de imagen compartible** | Botón 📷 → PNG del canvas (render extra con preserveDrawingBuffer o copyTextureToTexture→canvas) + marca "solar-system-webgpu · fecha simulada". Descarga directa. |
| 5 | pendiente | 2.0.0 | **Modo científico pro** | Panel con datos observacionales: magnitud aparente, distancia a la Tierra en vivo (AU + min-luz), tamaño angular desde la Tierra. Efemérides aproximadas desde los propios elementos keplerianos. |
| 6 | pendiente | 2.1.0 | **Comparador de cuerpos** | Vista dividida: 2 cuerpos lado a lado a escala real relativa con barras de datos (gravedad, densidad, temperatura…). |
| 7 | pendiente | 2.2.0 | **Sistema de anillos para todos** | Urano/Júpiter/Neptuno con anillos tenues reales (ya existen datos) + mejorar Saturno con iluminación trasera. |
| 8 | pendiente | 2.3.0 | **PWA + offline** | Service worker + manifest: installable, funciona sin red (texturas ya viven en el bundle). |
| 9 | pendiente | 2.4.0 | **i18n EN/ES** | Toggle de idioma en HUD. Textos de datos ya estructurados en celestialData. |
| 10 | pendiente | 3.0.0 | **Modo WebXR/VR** | Inmersión básica con three WebXR (controladores opcional). |

## Hechos
- v1.5.1 (2026-11-21): corte interior visible + encuadres guiados + colas legibles + QA E2E 20/20.
- v1.5.0 (2026-11-20): cometas Halley/Encke/67P/Swift-Tuttle con colas dinámicas.
