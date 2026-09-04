/**
 * simulation.ts — Orquestador central de la escena.
 *
 * Monta: Sol + planetas (keplerianos) + lunas (jerarquía local) +
 * asteroides destacados + cinturones GPU + órbitas + estrellas de fondo.
 * Sincroniza el store (escalas, tiempo, visibilidad) con la escena 3D.
 */
import * as THREE from 'three/webgpu';
import { simStore } from './store';
import type { ScaleSnapshot } from './scales';
import { CameraRig } from './cameraRig';
import { Picker } from './picking';
import { BodyView } from '../scene/Bodies';
import { AsteroidBelt } from '../scene/AsteroidBelt';
import { PlanetOrbitLine } from '../scene/Orbits';
import { LabelManager } from '../scene/Labels';
import {
  SUN, PLANETS, MOONS, NOTABLE_ASTEROIDS,
  type CelestialBody
} from '../data/celestialData';

const BELT_PSEUDO_PREFIX = 'belt:';

export class Simulation {
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly labels = new LabelManager();
  readonly bodies = new Map<string, BodyView>();
  readonly belts: AsteroidBelt[] = [];
  private readonly planetOrbitLines = new Map<string, PlanetOrbitLine>();
  private readonly renderer: THREE.WebGPURenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly picker: Picker;
  private readonly pickables: BodyView[] = [];
  private lastT = 0;
  private fpsEma = 60;
  private fpsAcc = 0;
  private pseudoSelected: CelestialBody | null = null;
  private unsubscribe: () => void;

  constructor(canvas: HTMLCanvasElement, renderer: THREE.WebGPURenderer) {
    this.canvas = canvas;
    this.renderer = renderer;

    const st = simStore.getState();
    const scale: ScaleSnapshot = {
      mode: st.distanceMode,
      distanceScale: st.distanceScale,
      sizeScale: st.sizeScale
    };

    /* ---------- Iluminación ---------- */
    const sunLight = new THREE.PointLight(0xfff2dd, 3.2, 0, 0); // decay 0
    this.scene.add(sunLight);
    this.scene.add(new THREE.AmbientLight(0x28324a, 0.42));

    /* ---------- Estrellas de fondo ---------- */
    this.scene.add(this.buildStarfield());

    /* ---------- Sol ---------- */
    const sun = new BodyView(SUN);
    this.bodies.set('sun', sun);
    this.scene.add(sun.group);
    this.pickables.push(sun);

    /* ---------- Planetas + asteroides destacados ---------- */
    for (const p of [...PLANETS, ...NOTABLE_ASTEROIDS]) {
      const view = new BodyView(p);
      this.bodies.set(p.id, view);
      this.scene.add(view.group);
      this.pickables.push(view);
      if (p.orbital) {
        const line = new PlanetOrbitLine(
          p.orbital,
          p.color,
          scale
        );
        if (p.type === 'asteroid' || p.type === 'dwarf-planet') line.setOpacity(0.16);
        this.planetOrbitLines.set(p.id, line);
        this.scene.add(line.line);
      }
    }

    /* ---------- Lunas (jerarquía) ---------- */
    MOONS.forEach((m, idx) => {
      const view = new BodyView(m, idx * 1.83 + 0.7);
      const parent = this.bodies.get(m.moonOf!.parentId);
      if (!parent) return;
      view.attachToParent(parent);
      this.bodies.set(m.id, view);
      this.pickables.push(view);
    });

    /* ---------- Etiquetas HTML ---------- */
    for (const b of this.bodies.values()) {
      this.labels.add(
        b.id,
        b.data.name,
        b.data.type === 'moon',
        (out) => b.getWorldPos(out)
      );
    }

    /* ---------- Cinturones (compute GPU) ---------- */
    const mainBelt = new AsteroidBelt(
      {
        name: 'Cinturón Principal',
        count: 60_000,
        aRange: [2.06, 3.38],
        eMax: 0.22,
        inclMaxDeg: 18,
        sizeRange: [0.012, 0.17],
        colorA: 0x9a8b76,
        colorB: 0x5f5346,
        kirkwoodGaps: true,
        seed: 1234
      },
      scale
    );
    const kuiperBelt = new AsteroidBelt(
      {
        name: 'Cinturón de Kuiper',
        count: 45_000,
        aRange: [36.5, 49.5],
        eMax: 0.25,
        inclMaxDeg: 26,
        sizeRange: [0.02, 0.15],
        colorA: 0xacc4d8,
        colorB: 0x7c94ab,
        seed: 99_031
      },
      scale
    );
    this.belts.push(mainBelt, kuiperBelt);
    for (const b of this.belts) {
      this.scene.add(b.mesh);
      b.registerCompute(renderer); // primer pase: evita flash en el origen
    }

    /* ---------- Escalas iniciales + posiciones ---------- */
    this.applyScales(scale);
    this.updateBodies(st.simDays, scale);

    /* ---------- Cámara + picking ---------- */
    this.rig = new CameraRig(canvas, canvas.clientWidth / Math.max(canvas.clientHeight, 1));
    this.picker = new Picker(
      this.rig.camera,
      this.pickables,
      this.belts,
      (id, source) => this.onSelect(id, source),
      () => this.onDeselect()
    );
    this.bindPointerEvents();

    /* ---------- Suscripción al store ---------- */
    this.unsubscribe = simStore.subscribe((state, prev) => {
      const scaleChanged =
        state.distanceMode !== prev.distanceMode ||
        state.distanceScale !== prev.distanceScale ||
        state.sizeScale !== prev.sizeScale;
      if (scaleChanged) {
        const s: ScaleSnapshot = {
          mode: state.distanceMode,
          distanceScale: state.distanceScale,
          sizeScale: state.sizeScale
        };
        this.applyScales(s);
        // Re-encuadre coherente al cambiar de MODO (real ↔ didáctica):
        // si no se está siguiendo un cuerpo, animar a una vista que abarque
        // el sistema con las nuevas distancias.
        if (state.distanceMode !== prev.distanceMode && !this.rig.isFollowing) {
          this.rig.frameSystem(state.distanceMode === 'real' ? 760 : 120);
        }
      }
      if (state.showPlanetOrbits !== prev.showPlanetOrbits) {
        for (const l of this.planetOrbitLines.values()) l.line.visible = state.showPlanetOrbits;
      }
      if (state.showMoonOrbits !== prev.showMoonOrbits) {
        for (const b of this.bodies.values()) {
          if (b.moonOrbitLine) b.moonOrbitLine.visible = state.showMoonOrbits;
        }
      }
      if (state.showBelts !== prev.showBelts) {
        for (const b of this.belts) b.setVisible(state.showBelts);
      }
      if (state.showLabels !== prev.showLabels) {
        this.labels.visible = state.showLabels;
      }
      if (state.selectedId !== prev.selectedId) this.labels.setSelected(state.selectedId);
    });

    /* ---------- Etiquetas clickeables ---------- */
    document.getElementById('labels-root')!.addEventListener('label-select', (e) => {
      const id = (e as CustomEvent<string>).detail;
      simStore.getState().select(id);
    });

    window.addEventListener('resize', () => this.onResize());
  }

  /* ================================================================ */

  private buildStarfield(): THREE.Points {
    const N = 9_000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 26_000 + Math.random() * 16_000;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      const t = Math.random();
      const c =
        t < 0.12
          ? [1, 0.82, 0.66]
          : t < 0.3
            ? [0.72, 0.82, 1]
            : [0.95, 0.96, 1];
      const b = 0.35 + Math.random() * 0.65;
      col[i * 3] = c[0] * b;
      col[i * 3 + 1] = c[1] * b;
      col[i * 3 + 2] = c[2] * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.5,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  private bindPointerEvents() {
    let downX = 0,
      downY = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });
    this.canvas.addEventListener('click', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return; // fue drag
      this.picker.pick(e.clientX, e.clientY, this.canvas);
    });
    this.canvas.addEventListener('dblclick', (e) => {
      const st = simStore.getState();
      if (st.selectedId) this.focusBody(st.selectedId);
    });
  }

  private onSelect(id: string, source: 'body' | 'belt') {
    if (source === 'belt') {
      // Astereroide individual del cinturón → pseudo-cuerpo dinámico
      const [beltName, idxStr] = id.slice(BELT_PSEUDO_PREFIX.length).split(':');
      const belt = this.belts.find((b) => b.name === beltName);
      if (!belt) return;
      const i = parseInt(idxStr, 10);
      this.pseudoSelected = belt.describeInstanceAsBody(i);
      simStore.getState().select(id);
    } else {
      this.pseudoSelected = null;
      simStore.getState().select(id);
    }
  }

  private onDeselect() {
    // clic al vacío: mantiene la selección (para no perder el panel por accidente)
  }

  /** Cuerpo actualmente seleccionado (real o pseudo del cinturón). */
  getSelectedData(): CelestialBody | null {
    const id = simStore.getState().selectedId;
    if (!id) return null;
    if (id.startsWith(BELT_PSEUDO_PREFIX)) return this.pseudoSelected;
    return this.bodies.get(id)?.data ?? null;
  }

  /** ID seleccionado actualmente. */
  getSelectedId(): string | null {
    return simStore.getState().selectedId;
  }

  focusBody(id: string | null) {
    if (!id || id.startsWith(BELT_PSEUDO_PREFIX)) return;
    const b = this.bodies.get(id);
    if (!b) return;
    this.rig.focusOn(
      { getPos: (o) => b.getWorldPos(o), getRadius: () => b.visualRadius },
      b.data.type === 'star' ? 9 : 4.5
    );
    simStore.getState().focus(id);
  }

  resetView() {
    this.rig.releaseFollow();
    this.rig.focusOn(
      { getPos: (o) => o.set(0, 0, 0), getRadius: () => 14 },
      11
    );
    simStore.getState().focus(null);
  }

  private applyScales(s: ScaleSnapshot) {
    // primero planetas (las lunas dependen del radio visual del padre)
    for (const b of this.bodies.values()) {
      if (!b.data.moonOf) b.applyScale(s);
    }
    for (const b of this.bodies.values()) {
      if (b.data.moonOf) b.applyScale(s);
    }
    for (const [id, line] of this.planetOrbitLines) {
      line.rebuild(s);
      const body = this.bodies.get(id);
      if (body && (body.data.type === 'asteroid' || body.data.type === 'dwarf-planet')) {
        line.setOpacity(0.16);
      }
    }
    for (const b of this.belts) b.applyScale(s);
  }

  private updateBodies(simDays: number, s: ScaleSnapshot) {
    for (const b of this.bodies.values()) b.update(simDays, s);
  }

  private onResize() {
    const w = this.canvas.clientWidth;
    const h = Math.max(this.canvas.clientHeight, 1);
    this.rig.resize(w / h);
    this.renderer.setSize(w, h, false);
  }

  async loadAssets() {
    const all = [...this.bodies.values()];
    for (const b of all) {
      await b.loadAssets();
    }
  }

  /** Loop de render (renderer.setAnimationLoop). */
  readonly frame = (timeMs: number) => {
    const t = timeMs / 1000;
    const dt = Math.min(Math.max(t - this.lastT, 0), 0.1);
    this.lastT = t;
    const st = simStore.getState();
    const scale: ScaleSnapshot = {
      mode: st.distanceMode,
      distanceScale: st.distanceScale,
      sizeScale: st.sizeScale
    };

    if (!st.paused && st.timeScale !== 0) {
      const d = st.simDays + (dt * st.timeScale) / 86_400;
      simStore.setState({ simDays: d });
    }

    const simDays = simStore.getState().simDays;
    this.updateBodies(simDays, scale);

    for (const b of this.belts) {
      if (b.mesh.visible) b.tick(this.renderer, simDays);
    }

    this.rig.update(dt);

    const w = this.canvas.clientWidth;
    const h = Math.max(this.canvas.clientHeight, 1);
    this.labels.update(this.rig.camera, w, h);

    this.renderer.render(this.scene, this.rig.camera);

    // FPS
    if (dt > 0) this.fpsEma = this.fpsEma * 0.92 + (1 / dt) * 0.08;
    this.fpsAcc += dt;
    if (this.fpsAcc > 0.5) {
      this.fpsAcc = 0;
      simStore.getState().setFps(Math.round(this.fpsEma));
    }
  };

  dispose() {
    this.unsubscribe();
    for (const l of this.planetOrbitLines.values()) l.dispose();
  }
}
