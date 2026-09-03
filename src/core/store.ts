/**
 * store.ts — Estado reactivo de la simulación (zustand, API vanilla).
 *
 * Sin React: los módulos UI se suscriben con simStore.subscribe() y el
 * motor lee el snapshot con simStore.getState() cada frame.
 */
import { createStore } from 'zustand/vanilla';

export type DistanceMode = 'real' | 'didactic';

export type SpeedPreset = 'realtime' | 'hour' | 'day' | 'month' | 'year';

export const SPEED_PRESETS: Record<SpeedPreset, { label: string; secPerSec: number }> = {
  realtime: { label: 'Real', secPerSec: 1 },
  hour: { label: '1 h/s', secPerSec: 3600 },
  day: { label: '1 día/s', secPerSec: 86_400 },
  month: { label: '1 mes/s', secPerSec: 2_629_800 },
  year: { label: '1 año/s', secPerSec: 31_557_600 }
};

export interface SimState {
  /** Multiplicador temporal (segundos simulados por segundo real; negativo = invertido) */
  timeScale: number;
  paused: boolean;
  speedPreset: SpeedPreset;
  /** Días simulados desde J2000 (lo mantiene el motor) */
  simDays: number;

  distanceMode: DistanceMode;
  distanceScale: number;
  sizeScale: number;

  showPlanetOrbits: boolean;
  showMoonOrbits: boolean;
  showBelts: boolean;
  showLabels: boolean;

  /** Panel izquierdo de controles (colapsable, se recuerda entre sesiones). */
  leftPanelOpen: boolean;

  selectedId: string | null;
  focusedId: string | null;

  backend: 'webgpu' | 'webgl2' | 'init';

  fps: number;
}

export interface SimActions {
  setPaused(v: boolean): void;
  togglePause(): void;
  reverseTime(): void;
  setSpeedPreset(p: SpeedPreset): void;
  setDistanceMode(m: DistanceMode): void;
  setDistanceScale(v: number): void;
  setSizeScale(v: number): void;
  setSimDays(d: number): void;
  toggle(key: 'showPlanetOrbits' | 'showMoonOrbits' | 'showBelts' | 'showLabels'): void;
  toggleLeftPanel(): void;
  select(id: string | null): void;
  focus(id: string | null): void;
  setBackend(b: 'webgpu' | 'webgl2'): void;
  setFps(f: number): void;
}

export type SimStore = SimState & SimActions;

export const MODE_DEFAULTS: Record<DistanceMode, { distanceScale: number; sizeScale: number }> = {
  real: { distanceScale: 1, sizeScale: 900 },
  didactic: { distanceScale: 1, sizeScale: 1 }
};

/** Preferencia persistida del panel de controles (localStorage). */
function readLeftPanelPref(): boolean {
  try {
    return localStorage.getItem('solar:leftPanelOpen') !== '0';
  } catch {
    return true;
  }
}

export const simStore = createStore<SimStore>()((set) => ({
  timeScale: SPEED_PRESETS.day.secPerSec,
  paused: false,
  speedPreset: 'day',
  simDays: 9_760, // ~ago 2026 desde J2000

  distanceMode: 'didactic',
  distanceScale: 1,
  sizeScale: 1,

  showPlanetOrbits: true,
  showMoonOrbits: true,
  showBelts: true,
  showLabels: true,

  leftPanelOpen: readLeftPanelPref(),

  selectedId: null,
  focusedId: null,

  backend: 'init',
  fps: 0,

  setPaused: (v) => set({ paused: v }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  reverseTime: () => set((s) => ({ timeScale: -s.timeScale })),
  setSpeedPreset: (p) =>
    set((s) => ({
      speedPreset: p,
      timeScale: Math.sign(s.timeScale || 1) * SPEED_PRESETS[p].secPerSec
    })),
  setDistanceMode: (m) =>
    set({
      distanceMode: m,
      ...MODE_DEFAULTS[m]
    }),
  setDistanceScale: (v) => set({ distanceScale: v }),
  setSizeScale: (v) => set({ sizeScale: v }),
  setSimDays: (d) => set({ simDays: d }),
  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<SimState>),
  toggleLeftPanel: () =>
    set((s) => {
      const open = !s.leftPanelOpen;
      try {
        localStorage.setItem('solar:leftPanelOpen', open ? '1' : '0');
      } catch {
        /* sin almacenamiento: solo estado en memoria */
      }
      return { leftPanelOpen: open };
    }),
  select: (id) => set({ selectedId: id }),
  focus: (id) => set({ focusedId: id }),
  setBackend: (b) => set({ backend: b }),
  setFps: (f) => set({ fps: f })
}));

/** Utilidad: formatea la fecha simulada en es-CL. */
export function formatSimDate(simDays: number): string {
  const ms = Date.UTC(2000, 0, 1, 12) + simDays * 86_400_000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

/** Etiqueta legible del multiplicador temporal. */
export function formatTimeScale(secPerSec: number): string {
  const a = Math.abs(secPerSec);
  const sign = secPerSec < 0 ? '−' : '';
  if (a < 60) return `${sign}${a.toFixed(0)} s/s`;
  if (a < 3600) return `${sign}${(a / 60).toFixed(1)} min/s`;
  if (a < 86_400) return `${sign}${(a / 3600).toFixed(1)} h/s`;
  if (a < 2_629_800) return `${sign}${(a / 86_400).toFixed(1)} días/s`;
  if (a < 31_557_600) return `${sign}${(a / 2_629_800).toFixed(1)} meses/s`;
  return `${sign}${(a / 31_557_600).toFixed(1)} años/s`;
}
