/**
 * hud.ts — Panel de control tipo HUD científico.
 *
 * Barra superior (fecha simulada, backend, FPS) · Panel izquierdo (escalas,
 * visibilidad, selector de cuerpos) · Barra inferior (control temporal).
 */
import {
  simStore,
  SPEED_PRESETS,
  formatSimDate,
  formatTimeScale,
  type BooleanToggleKey,
  type SpeedPreset
} from '../core/store';
import { icon, ICONS } from './icons';
import { ALL_BODIES, J2000_EPOCH_MS } from '../data/celestialData';
import type { Simulation } from '../core/simulation';

const QUICK_BODY_KEYS = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

export class HUD {
  private dateEl!: HTMLElement;
  private dateInput!: HTMLInputElement;
  private scaleBadge!: HTMLElement;
  private speedEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private pauseBtn!: HTMLButtonElement;
  private reverseBtn!: HTMLButtonElement;
  private presetBtns = new Map<SpeedPreset, HTMLButtonElement>();
  private modeBtns = new Map<string, HTMLButtonElement>();
  private distSlider!: HTMLInputElement;
  private sizeSlider!: HTMLInputElement;
  private distLabel!: HTMLElement;
  private sizeLabel!: HTMLElement;
  private chipEls = new Map<string, HTMLButtonElement>();
  private toggleEls = new Map<BooleanToggleKey, HTMLElement>();
  private panel!: HTMLElement;
  private panelOpenBtn!: HTMLButtonElement;
  private panelCloseBtn!: HTMLButtonElement;
  private interval: number;

  constructor(private sim: Simulation) {
    const root = document.getElementById('hud-root')!;
    root.innerHTML = this.template();
    this.cacheEls();
    this.bindEvents();

    // Refresco periódico de fecha/velocidad/fps + estado inicial
    this.interval = window.setInterval(() => this.refreshDynamic(), 400);
    this.refreshDynamic();
    this.refreshChips();
  }

  /* ---------------- Plantilla ---------------- */

  private template(): string {
    return `
    <div class="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between">

      <!-- ===== Barra superior ===== -->
      <div class="pointer-events-none flex items-start justify-between gap-2 p-3 max-sm:p-2">
        <div class="glass pointer-events-auto flex items-center gap-2.5 rounded-lg px-3 py-2 max-sm:gap-2 max-sm:px-2.5 max-sm:py-1.5">
          <span class="text-lg max-sm:text-base">🪐</span>
          <div>
            <h1 class="text-[13px] font-semibold tracking-wide text-slate-100 max-sm:text-[11px]">SISTEMA SOLAR <span class="text-cyan-300">· INTERACTIVO</span></h1>
            <p class="font-mono text-[10px] tracking-widest text-slate-400 uppercase max-sm:hidden">Three.js WebGPU · Kepler J2000</p>
          </div>
          <span id="hud-backend" class="ml-1 rounded border border-cyan-400/40 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-cyan-300 uppercase">…</span>
          <span id="hud-scale-badge" class="hidden rounded border border-slate-600/50 bg-slate-800/70 px-1.5 py-0.5 font-mono text-[9.5px] text-slate-300 md:inline-block" title="Modo de escala actual">Escala didáctica</span>
        </div>
        <div class="glass pointer-events-auto flex items-center gap-3 rounded-lg px-3.5 py-2 font-mono text-xs max-sm:gap-2 max-sm:px-2.5 max-sm:py-1.5 max-sm:text-[11px]">
          <div class="flex items-center gap-1.5 text-amber-200">${icon(ICONS.clock)}<span id="hud-date">—</span></div>
          <div class="flex items-center gap-1.5 text-slate-400 max-sm:hidden">${icon(ICONS.gauge)}<span id="hud-fps">— fps</span></div>
        </div>
      </div>

      <!-- ===== Panel izquierdo (colapsable) ===== -->
      <button id="panel-open-btn" aria-label="Mostrar controles" class="glass icon-btn panel-hidden pointer-events-auto absolute top-20 left-3 z-20 max-sm:top-14 max-sm:left-2" title="Mostrar controles (H)">${icon(ICONS.panelLeftOpen)}</button>
      <div id="hud-panel" class="glass pointer-events-auto absolute top-20 left-3 z-20 max-h-[calc(100vh-11rem)] w-64 overflow-y-auto rounded-xl p-3 transition-[transform,opacity] duration-300 max-sm:top-14 max-sm:left-2 max-sm:max-h-[calc(100vh-10rem)] max-sm:w-[calc(100vw-16px)] max-sm:max-w-72">
          <div class="mb-3 flex items-center justify-between border-b border-slate-700/50 pb-2">
            <span class="font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">Controles</span>
            <button id="panel-close-btn" aria-label="Ocultar controles" class="icon-btn h-7 w-7" title="Ocultar panel (H)">${icon(ICONS.panelLeftClose, 'w-3.5 h-3.5')}</button>
          </div>
          <!-- Escala -->
          <section class="mb-4">
            <h2 class="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
              ${icon(ICONS.layers, 'w-3.5 h-3.5')} Escala
            </h2>
            <div class="mb-3 grid grid-cols-2 gap-1.5">
              <button id="mode-real" class="hud-btn">1:1 Real</button>
              <button id="mode-didactic" class="hud-btn">Didáctica</button>
            </div>
            <label for="dist-slider" class="mb-1 flex items-center justify-between text-[11px] text-slate-300">
              <span>Distancias</span><span id="dist-val" class="font-mono text-cyan-300">1.0×</span>
            </label>
            <input id="dist-slider" type="range" min="0.3" max="3" step="0.05" value="1" class="mb-3 w-full" />
            <label for="size-slider" class="mb-1 flex items-center justify-between text-[11px] text-slate-300">
              <span>Tamaños</span><span id="size-val" class="font-mono text-cyan-300">1.0×</span>
            </label>
            <input id="size-slider" type="range" min="0.2" max="3" step="0.05" value="1" class="w-full" />
          </section>

          <!-- Visibilidad -->
          <section class="mb-4">
            <h2 class="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
              ${icon(ICONS.orbit, 'w-3.5 h-3.5')} Visibilidad
            </h2>
            <div id="toggles" class="space-y-1"></div>
          </section>

          <!-- Capas educativas -->
          <section class="mb-4">
            <h2 class="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
              ${icon(ICONS.sparkles, 'w-3.5 h-3.5')} Capas educativas
            </h2>
            <div id="didactic-toggles" class="space-y-1"></div>
          </section>

          <!-- Viaje temporal -->
          <section class="mb-4">
            <h2 class="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
              ${icon(ICONS.history, 'w-3.5 h-3.5')} Viaje temporal
            </h2>
            <div class="mb-1.5 flex items-center gap-1.5">
              <input id="date-picker" type="date" aria-label="Fecha simulada" class="w-full rounded-md border border-slate-600/40 bg-slate-800/70 px-2 py-1 font-mono text-[11px] text-slate-200 outline-none focus:border-cyan-400/70" />
              <button id="date-today" class="hud-btn shrink-0 px-2 py-1 text-[11px]" title="Volver a la fecha actual">Hoy</button>
            </div>
            <div class="grid grid-cols-2 gap-1">
              <button data-jump-days="-5074.5" class="hud-btn py-1 text-[10px]" title="Perihelio de 1P/Halley (feb 1986)">Halley 1986</button>
              <button data-jump-days="22489" class="hud-btn py-1 text-[10px]" title="Próximo perihelio de 1P/Halley (jul 2061)">Halley 2061</button>
            </div>
          </section>

          <!-- Cuerpos -->
          <section>
            <h2 class="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
              ${icon(ICONS.telescope, 'w-3.5 h-3.5')} Cuerpos
            </h2>
            <div id="chips" class="flex flex-wrap gap-1"></div>
            <button id="reset-view" class="hud-btn mt-3 w-full">${icon(ICONS.focus)}&nbsp;Vista general (R)</button>
          </section>
      </div>

      <!-- ===== Barra inferior ===== -->
      <div class="pointer-events-none flex justify-center p-3 max-sm:p-2">
        <div class="glass pointer-events-auto fade-in flex flex-wrap items-center justify-center gap-3 rounded-xl px-4 py-2.5 max-sm:gap-1.5 max-sm:px-2.5 max-sm:py-1.5">
          <div class="flex items-center gap-1.5">
            <button id="btn-reverse" aria-label="Invertir sentido del tiempo" class="icon-btn max-sm:h-8 max-sm:w-8" title="Invertir tiempo">${icon(ICONS.rewind)}</button>
            <button id="btn-pause" aria-label="Pausa o reanudar" class="icon-btn max-sm:h-8 max-sm:w-8" title="Pausa / Reproducir (Espacio)">${icon(ICONS.pause)}</button>
          </div>
          <div class="flex flex-wrap items-center justify-center gap-1">
            ${Object.entries(SPEED_PRESETS)
              .map(([k, v]) => `<button data-preset="${k}" class="hud-btn preset-btn max-sm:px-2 max-sm:py-1 max-sm:text-[11px]">${v.label}</button>`)
              .join('')}
          </div>
          <div class="font-mono text-xs text-cyan-200 max-sm:text-[11px]" id="speed-label">1 día/s</div>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- Wiring ---------------- */

  private cacheEls() {
    this.dateEl = document.getElementById('hud-date')!;
    this.dateInput = document.getElementById('date-picker') as HTMLInputElement;
    this.scaleBadge = document.getElementById('hud-scale-badge')!;
    this.fpsEl = document.getElementById('hud-fps')!;
    this.speedEl = document.getElementById('speed-label')!;
    this.pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement;
    this.reverseBtn = document.getElementById('btn-reverse') as HTMLButtonElement;
    this.distSlider = document.getElementById('dist-slider') as HTMLInputElement;
    this.sizeSlider = document.getElementById('size-slider') as HTMLInputElement;
    this.distLabel = document.getElementById('dist-val')!;
    this.sizeLabel = document.getElementById('size-val')!;
    this.panel = document.getElementById('hud-panel')!;
    this.panelOpenBtn = document.getElementById('panel-open-btn') as HTMLButtonElement;
    this.panelCloseBtn = document.getElementById('panel-close-btn') as HTMLButtonElement;
    this.modeBtns.set('real', document.getElementById('mode-real') as HTMLButtonElement);
    this.modeBtns.set('didactic', document.getElementById('mode-didactic') as HTMLButtonElement);
    for (const b of document.querySelectorAll<HTMLButtonElement>('.preset-btn')) {
      this.presetBtns.set(b.dataset.preset as SpeedPreset, b);
    }

    const addSwitch = (host: HTMLElement, key: BooleanToggleKey, label: string, tip?: string) => {
      const row = document.createElement('button');
      row.className = 'toggle-row flex w-full cursor-pointer items-center justify-between rounded-md px-1.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700/30';
      row.setAttribute('role', 'switch');
      row.setAttribute('aria-checked', String(simStore.getState()[key]));
      if (tip) row.title = tip;
      row.innerHTML = `<span>${label}</span><span class="toggle-track"><span class="toggle-knob"></span></span>`;
      row.addEventListener('click', () => simStore.getState().toggle(key));
      host.appendChild(row);
      this.toggleEls.set(key, row);
    };

    // toggles de visibilidad (5 originales)
    const togglesHost = document.getElementById('toggles')!;
    const items: [BooleanToggleKey, string][] = [
      ['showPlanetOrbits', 'Órbitas planetarias'],
      ['showMoonOrbits', 'Órbitas de lunas'],
      ['showBelts', 'Cinturones (GPU)'],
      ['showComets', 'Cometas (colas)'],
      ['showLabels', 'Etiquetas']
    ];
    for (const [key, label] of items) addSwitch(togglesHost, key, label);

    // toggles didácticos
    const didacticHost = document.getElementById('didactic-toggles')!;
    const didacticItems: [BooleanToggleKey, string, string][] = [
      ['showAxes', 'Ejes axiales (estaciones)', 'Muestra el eje de rotación y el ecuador para visualizar estaciones e inclinaciones'],
      ['showZones', 'Zona habitable / Hielo', 'Zona habitable (~1 UA, verde) y línea de hielo (~3 UA, cian)'],
      ['showApsides', 'Perihelio y Afelio', 'Marca los puntos más cercano (verde) y lejano (azul) al Sol del cuerpo seleccionado']
    ];
    for (const [key, label, tip] of didacticItems) addSwitch(didacticHost, key, label, tip);

    // chips
    const chipsHost = document.getElementById('chips')!;
    for (const b of ALL_BODIES) {
      if (b.type === 'moon' || b.type === 'asteroid') continue;
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = b.name;
      chip.addEventListener('click', () => {
        simStore.getState().select(b.id);
        this.sim.focusBody(b.id);
      });
      chipsHost.appendChild(chip);
      this.chipEls.set(b.id, chip);
    }
  }

  private bindEvents() {
    this.pauseBtn.addEventListener('click', () => simStore.getState().togglePause());
    this.reverseBtn.addEventListener('click', () => simStore.getState().reverseTime());
    for (const [preset, btn] of this.presetBtns) {
      btn.addEventListener('click', () => simStore.getState().setSpeedPreset(preset));
    }
    for (const [mode, btn] of this.modeBtns) {
      btn.addEventListener('click', () => {
        simStore.getState().setDistanceMode(mode as 'real' | 'didactic');
        this.refreshModeUI();
      });
    }
    this.distSlider.addEventListener('input', () => {
      simStore.getState().setDistanceScale(parseFloat(this.distSlider.value));
    });
    this.sizeSlider.addEventListener('input', () => {
      simStore.getState().setSizeScale(parseFloat(this.sizeSlider.value));
    });
    document.getElementById('reset-view')!.addEventListener('click', () => this.sim.resetView());

    // Viaje temporal (selector de fecha + presets)
    this.dateInput.addEventListener('change', () => {
      if (!this.dateInput.value) return;
      const ms = Date.parse(this.dateInput.value + 'T12:00:00Z');
      if (!Number.isNaN(ms)) {
        simStore.getState().setSimDays((ms - J2000_EPOCH_MS) / 86_400_000);
      }
    });
    document.getElementById('date-today')!.addEventListener('click', () => simStore.getState().setToday());
    for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-jump-days]')) {
      btn.addEventListener('click', () => {
        const d = parseFloat(btn.dataset.jumpDays!);
        simStore.getState().setSimDays(d);
        simStore.getState().select('halley');
        this.sim.focusBody('halley');
      });
    }

    // Panel de controles colapsable + atajos de teclado
    this.panelCloseBtn.addEventListener('click', () => simStore.getState().toggleLeftPanel());
    this.panelOpenBtn.addEventListener('click', () => {
      if (window.innerWidth < 768 && simStore.getState().selectedId) {
        simStore.getState().select(null);
      }
      simStore.getState().toggleLeftPanel();
    });
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return;
      }
      const st = simStore.getState();
      if (e.key === 'h' || e.key === 'H') {
        st.toggleLeftPanel();
      } else if (e.key === ' ') {
        e.preventDefault();
        st.togglePause();
      } else if (e.key === 'Escape') {
        if (st.cutawayBodyId) st.setCutaway(null);
        else if (st.selectedId) st.select(null);
      } else if (e.key === 'r' || e.key === 'R') {
        this.sim.resetView();
      } else if (e.key === 'c' || e.key === 'C') {
        if (st.selectedId && !st.selectedId.startsWith('belt:')) {
          const b = this.sim.getSelectedData();
          if (b && b.structure.length >= 2 && b.type !== 'comet') {
            st.setCutaway(st.cutawayBodyId === b.id ? null : b.id);
          }
        }
      } else if (e.key >= '0' && e.key <= '8') {
        const id = QUICK_BODY_KEYS[Number(e.key)];
        if (id) {
          st.select(id);
          this.sim.focusBody(id);
        }
      }
    });

    simStore.subscribe((s, prev) => {
      if (s.paused !== prev.paused) this.refreshPause();
      if (s.speedPreset !== prev.speedPreset || s.timeScale !== prev.timeScale) this.refreshPresets();
      if (s.distanceMode !== prev.distanceMode) this.refreshModeUI();
      if (s.distanceScale !== prev.distanceScale) this.distLabel.textContent = `${s.distanceScale.toFixed(2)}×`;
      if (s.sizeScale !== prev.sizeScale || s.distanceMode !== prev.distanceMode) {
        this.sizeLabel.textContent =
          s.distanceMode === 'real'
            ? `${Math.round(s.sizeScale).toLocaleString('es-CL')}×`
            : `${s.sizeScale.toFixed(2)}×`;
      }
      if (s.selectedId !== prev.selectedId) this.refreshChips();
      if (s.leftPanelOpen !== prev.leftPanelOpen) this.refreshPanel();
      for (const key of this.toggleEls.keys()) {
        if (s[key] !== prev[key]) this.refreshToggle(key);
      }
    });

    // estado inicial de todos los controles
    this.refreshPause();
    this.refreshPresets();
    this.refreshModeUI();
    this.refreshDynamic();
    this.refreshPanel();
    for (const key of this.toggleEls.keys()) this.refreshToggle(key);
    const st = simStore.getState();
    this.distLabel.textContent = `${st.distanceScale.toFixed(2)}×`;
    this.sizeLabel.textContent =
      st.distanceMode === 'real'
        ? `${Math.round(st.sizeScale).toLocaleString('es-CL')}×`
        : `${st.sizeScale.toFixed(2)}×`;
    const backendEl = document.getElementById('hud-backend')!;
    backendEl.textContent = st.backend === 'webgpu' ? 'WebGPU' : st.backend === 'webgl2' ? 'WebGL2' : '…';
  }

  setBackendLabel(backend: 'webgpu' | 'webgl2') {
    const el = document.getElementById('hud-backend');
    if (el) el.textContent = backend === 'webgpu' ? 'WebGPU' : 'WebGL2';
  }

  /* ---------------- Refrescos ---------------- */

  private refreshDynamic() {
    const s = simStore.getState();
    this.dateEl.textContent = formatSimDate(s.simDays);
    if (document.activeElement !== this.dateInput) {
      const ms = J2000_EPOCH_MS + s.simDays * 86_400_000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        if (y >= 1000 && y <= 9999) {
          this.dateInput.value = d.toISOString().slice(0, 10);
        }
      }
    }
    this.fpsEl.textContent = `${s.fps} fps`;
    this.speedEl.textContent = formatTimeScale(s.timeScale) + (s.paused ? ' · ⏸' : '');
  }

  private refreshPause() {
    const s = simStore.getState();
    this.pauseBtn.innerHTML = icon(s.paused ? ICONS.play : ICONS.pause);
    this.pauseBtn.classList.toggle('active', s.paused);
  }

  private refreshPresets() {
    const s = simStore.getState();
    for (const [preset, btn] of this.presetBtns) {
      btn.classList.toggle('active', preset === s.speedPreset);
    }
    this.reverseBtn.classList.toggle('active', s.timeScale < 0);
  }

  private refreshModeUI() {
    const s = simStore.getState();
    for (const [mode, btn] of this.modeBtns) {
      btn.classList.toggle('active', mode === s.distanceMode);
    }
    this.scaleBadge.textContent = s.distanceMode === 'real' ? '1:1 Real' : 'Escala didáctica';
    // rangos de sliders según modo
    if (s.distanceMode === 'real') {
      this.distSlider.min = '0.3'; this.distSlider.max = '3';
      this.sizeSlider.min = '1'; this.sizeSlider.max = '300'; this.sizeSlider.step = '1';
    } else {
      this.distSlider.min = '0.3'; this.distSlider.max = '3';
      this.sizeSlider.min = '0.2'; this.sizeSlider.max = '3'; this.sizeSlider.step = '0.05';
    }
    this.distSlider.value = String(s.distanceScale);
    this.sizeSlider.value = String(s.sizeScale);
    this.distLabel.textContent = `${s.distanceScale.toFixed(2)}×`;
    this.sizeLabel.textContent =
      s.distanceMode === 'real' ? `${Math.round(s.sizeScale).toLocaleString('es-CL')}×` : `${s.sizeScale.toFixed(2)}×`;
  }

  private refreshPanel() {
    const open = simStore.getState().leftPanelOpen;
    this.panel.classList.toggle('panel-hidden', !open);
    this.panelOpenBtn.classList.toggle('panel-hidden', open);
  }

  private refreshToggle(key: BooleanToggleKey) {
    const el = this.toggleEls.get(key);
    if (!el) return;
    const on = simStore.getState()[key];
    el.setAttribute('aria-checked', String(on));
    el.querySelector('.toggle-track')?.classList.toggle('on', on);
  }

  private refreshChips() {
    const sel = simStore.getState().selectedId;
    for (const [id, chip] of this.chipEls) chip.classList.toggle('active', id === sel);
  }

  dispose() {
    clearInterval(this.interval);
  }
}
