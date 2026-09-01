/**
 * main.ts — Punto de entrada: boot asíncrono, loading screen y wiring UI.
 */
import './styles.css';
import { createRenderer, configureRenderer } from './core/renderer';
import { simStore } from './core/store';
import { Simulation } from './core/simulation';
import { HUD } from './ui/hud';
import { DetailsPanel } from './ui/detailsPanel';

function setMsg(m: string) {
  const el = document.getElementById('loading-msg');
  if (el) el.textContent = m;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;

  setMsg('INICIALIZANDO WEBGPU…');
  const { renderer, backend } = await createRenderer(canvas);
  configureRenderer(renderer);
  simStore.getState().setBackend(backend);
  renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);

  setMsg('GENERANDO TEXTURAS PROCEDURALES…');
  const sim = new Simulation(canvas, renderer);

  setMsg('CONSTRUYENDO HUD…');
  const hud = new HUD(sim);
  hud.setBackendLabel(backend);
  const panel = new DetailsPanel(sim);

  await sim.loadAssets();

  setMsg('LANZANDO SIMULACIÓN…');
  const loading = document.getElementById('loading');
  loading?.classList.add('opacity-0');
  setTimeout(() => loading?.remove(), 450);

  renderer.setAnimationLoop(sim.frame);
  console.info(
    `[solar-system] Backend: ${backend.toUpperCase()} · asteroide count: 105 000 · listo ✅`
  );
}

boot().catch((err) => {
  console.error('[solar-system] Error fatal:', err);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.innerHTML = `
      <div class="max-w-md rounded-xl border border-red-500/40 bg-red-950/40 p-5 text-center">
        <p class="mb-2 text-2xl">💥</p>
        <h2 class="mb-1 font-semibold text-red-200">No se pudo iniciar la simulación</h2>
        <p class="font-mono text-xs text-red-300/80">${String(err?.message ?? err)}</p>
        <p class="mt-3 text-xs text-slate-400">Prueba con un navegador con WebGPU o WebGL2 (Chrome / Edge / Firefox / Safari recientes).</p>
      </div>`;
  }
});
