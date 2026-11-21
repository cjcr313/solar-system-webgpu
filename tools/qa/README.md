# QA E2E — solar-system-webgpu

Pruebas con Chrome headless (el browser tool bloquea localhost). El servidor
de preview DEBE correr dentro del mismo script (spawn + kill), porque los
procesos background no sobreviven entre ejecuciones.

## Requisitos
- /tmp/pwtest con playwright-core: `mkdir -p /tmp/pwtest && cd /tmp/pwtest && npm init -y && npm i playwright-core`
- Chrome del sistema en /Applications/Google Chrome.app
- python3 + pillow (análisis de píxeles de screenshots)

## Scripts
- qa-full.mjs — QA funcional completo (20 checks: chips, escalas, tiempo, panel, pestañas, focus, cutaway, labels, teclas, cometas). Debe dar 20/20 PASS.
- qa-cutaway.mjs — reproducción visual del corte interior (screenshots a ~/workspace/media/).
- comets-beauty.mjs — cometa en perihelio (viaja con window.__solarSetDate) + screenshots.
- comets-verify.mjs — smoke test general de cometas + vista general.

## Verificación de deploy
```bash
npx gh-pages@6 -d dist
# ojo caché CDN: verificar con cache-buster
curl -s 'https://cjcr313.github.io/solar-system-webgpu/?t='$(date +%s) | grep -o 'index-[A-Za-z0-9_-]*\.js'
grep -o 'index-[A-Za-z0-9_-]*\.js' dist/index.html   # deben coincidir
```

## Lecciones técnicas (no volver a tropezar)
- gl_PointCoord NO existe en WGSL: point-sprites TSL rompen WebGPU → usar meshes/ribbons con canvas alpha.
- alphaNode no es fiable en MeshBasicNodeMaterial entre backends: el fundido va en map (canvas RGBA) + material.opacity.
- CanvasTexture: el gradiente de canvas y=0 queda en v=0 solo con flipY=false en GL; en WebGPU ya muestrea top-down — verificar visualmente tras cambiar flipY.
- Cambiar de celda mata procesos background (nohup incluido): server + test en la MISMA celda.
- Modelos de visión (view_image) alucinan en closeups oscuros: ante duda, analizar píxeles con pillow (perfil longitudinal/transversal del screenshot).
