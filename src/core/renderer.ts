/**
 * renderer.ts — Inicialización del renderizador de nueva generación.
 *
 * - THREE.WebGPURenderer con init asíncrono (await renderer.init()).
 * - Fallback automático a WebGL2 (forceWebGL) si WebGPU no está disponible.
 * - logarithmicDepthBuffer: evita Z-fighting con distancias astronómicas.
 */
import * as THREE from 'three/webgpu';

export interface RendererResult {
  renderer: THREE.WebGPURenderer;
  backend: 'webgpu' | 'webgl2';
}

export async function createRenderer(canvas: HTMLCanvasElement): Promise<RendererResult> {
  const common = {
    canvas,
    antialias: true,
    /** Buffer de profundidad logarítmico: esencial a escalas astronómicas. */
    logarithmicDepthBuffer: true
  };

  const hasGPU =
    typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as { gpu?: unknown }).gpu;

  if (hasGPU) {
    try {
      const renderer = new THREE.WebGPURenderer(common);
      await renderer.init();
      return { renderer, backend: 'webgpu' };
    } catch (err) {
      console.warn('[renderer] WebGPU falló en init, usando fallback WebGL2:', err);
    }
  }

  // Fallback universal: mismo pipeline de nodos, backend WebGL2.
  const renderer = new THREE.WebGPURenderer({ ...common, forceWebGL: true });
  await renderer.init();
  return { renderer, backend: 'webgl2' };
}

/** Configuración de tonemapping / espacio de color común. */
export function configureRenderer(renderer: THREE.WebGPURenderer): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x04060d, 1);
}
