/**
 * simulation.ts — Orquestador central de la escena.
 *
 * Monta: Sol + planetas (keplerianos) + lunas (jerarquía local) +
 * asteroides destacados + cinturones GPU + órbitas + estrellas de fondo.
 * Sincroniza el store (escalas, tiempo, visibilidad) con la escena 3D.
 */
import * as THREE from 'three/webgpu';
import { simStore } from './store';
import { distanceTransform, type ScaleSnapshot } from './scales';
import { CameraRig } from './cameraRig';
import { Picker } from './picking';
import { BodyView } from '../scene/Bodies';
import { AsteroidBelt } from '../scene/AsteroidBelt';
import { PlanetOrbitLine } from '../scene/Orbits';
import { LabelManager } from '../scene/Labels';
import { CutawayLabels } from '../scene/Cutaway';
import { CometFX } from '../scene/Comets';
import { orbitalPosition, apsidesPositions, type Vec3 } from '../physics/kepler';
import {
  SUN, PLANETS, MOONS, NOTABLE_ASTEROIDS, COMETS,
  type CelestialBody
} from '../data/celestialData';

const BELT_PSEUDO_PREFIX = 'belt:';

export class Simulation {
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly labels = new LabelManager();
  readonly cutawayLabels = new CutawayLabels();
  readonly bodies = new Map<string, BodyView>();
  readonly belts: AsteroidBelt[] = [];
  private readonly planetOrbitLines = new Map<string, PlanetOrbitLine>();
  private readonly cometFX = new Map<string, CometFX>();
  private readonly cometOrbitLines = new Map<string, PlanetOrbitLine>();
  private readonly vTmpA: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly vTmpB: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly vTmpC: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly sAnti = new THREE.Vector3();
  private readonly sVel = new THREE.Vector3();
  private readonly sCam = new THREE.Vector3();
  private readonly headlamp: THREE.DirectionalLight;
  private readonly renderer: THREE.WebGPURenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly picker: Picker;
  private readonly pickables: BodyView[] = [];
  private lastT = 0;
  private fpsEma = 60;
  private fpsAcc = 0;
  private pseudoSelected: CelestialBody | null = null;
  private lastBeltSimDays = Number.NaN;
  private lastBeltScaleKey = '';
  private zonesGroup = new THREE.Group();
  private apsidesGroup = new THREE.Group();
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
    // Luz de acompañamiento (headlamp): ilumina la cara que mira la cámara
    // — el lado noche de un planeta enfocado y el interior de un corte no
    // quedan en negro absoluto (legibilidad didáctica).
    this.headlamp = new THREE.DirectionalLight(0xcfe0ff, 0);
    this.scene.add(this.headlamp);
    this.scene.add(this.headlamp.target);

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

    /* ---------- Cometas (núcleo + coma + colas) ---------- */
    const COMET_FX_COLORS: Record<string, { colorIon: number; colorDust: number; boost: number }> = {
      halley: { colorIon: 0x66b8ff, colorDust: 0xffc27a, boost: 1.25 },
      encke: { colorIon: 0x7fe8d0, colorDust: 0xffbb6e, boost: 0.7 },
      '67p': { colorIon: 0x9fd0ff, colorDust: 0xffb763, boost: 0.75 },
      'swift-tuttle': { colorIon: 0x8ab8ff, colorDust: 0xffae5e, boost: 1.6 }
    };
    for (const c of COMETS) {
      const view = new BodyView(c);
      this.bodies.set(c.id, view);
      this.scene.add(view.group);
      this.pickables.push(view);
      if (c.orbital) {
        const line = new PlanetOrbitLine(c.orbital, c.color, scale);
        line.setOpacity(0.2);
        this.cometOrbitLines.set(c.id, line);
        this.scene.add(line.line);
      }
      const fxConf = COMET_FX_COLORS[c.id] ?? { colorIon: 0x7fc9ff, colorDust: 0xffd9a0, boost: 1 };
      const fx = new CometFX(fxConf);
      fx.attach(view.group);
      this.cometFX.set(c.id, fx);
    }

    /* ---------- Etiquetas HTML ---------- */
    for (const b of this.bodies.values()) {
      const pView = b.data.moonOf ? this.bodies.get(b.data.moonOf.parentId) : undefined;
      this.labels.add(
        b.id,
        b.data.name,
        b.data.type === 'moon',
        (out) => b.getWorldPos(out),
        b.data.type === 'comet',
        pView?.id,
        pView ? (out) => pView.getWorldPos(out) : undefined,
        pView ? () => pView.visualRadius : undefined
      );
    }

    /* ---------- Capas didácticas (Zona habitable / Línea de hielo + Ápsides) ---------- */
    this.zonesGroup.visible = st.showZones;
    this.scene.add(this.zonesGroup);
    this.apsidesGroup.visible = st.showApsides;
    this.scene.add(this.apsidesGroup);

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
    // Encuadre inicial coherente: ver el sistema con el Sol iluminando de frente
    this.rig.aimOrbit(Math.PI * 0.85, 1.05);
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
        this.refreshCometVisibility(state);
      }
      if (state.showComets !== prev.showComets) {
        this.refreshCometVisibility(state);
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
      if (state.showAxes !== prev.showAxes) {
        for (const b of this.bodies.values()) b.setAxisVisible(state.showAxes);
      }
      if (state.showZones !== prev.showZones) {
        this.zonesGroup.visible = state.showZones;
        if (state.showZones) this.rebuildZones(this.currentScale(state));
      }
      if (state.showApsides !== prev.showApsides) {
        this.apsidesGroup.visible = state.showApsides;
        this.rebuildApsides(state.selectedId, this.currentScale(state));
      }
      // El corte interior es MODAL a la inspección: al seleccionar otro
      // cuerpo (o cerrar el panel), el corte del cuerpo anterior se cierra
      // solo — antes quedaba "pegado" abierto para siempre.
      if (state.selectedId !== prev.selectedId) {
        const cut = simStore.getState().cutawayBodyId;
        if (cut && cut !== state.selectedId) {
          simStore.getState().setCutaway(null);
        }
        if (state.showApsides) this.rebuildApsides(state.selectedId, this.currentScale(state));
      }
      if (state.selectedId !== prev.selectedId) this.labels.setSelected(state.selectedId);
      if (state.cutawayBodyId !== prev.cutawayBodyId) {
        for (const [id, b] of this.bodies) {
          b.setCutaway(state.cutawayBodyId === id);
          if (state.cutawayBodyId !== id) b.setHighlightedLayer(null);
        }
        const active = state.cutawayBodyId ? this.bodies.get(state.cutawayBodyId) : null;
        if (active) {
          // Enfocar automáticamente cerca del cuerpo para ver el interior con claridad
          const closeMult = active.data.rings ? 3.8 : active.data.type === 'star' ? 3.6 : 3.15;
          this.focusBody(active.id, closeMult);
          const d = active.getCutawayOpenDir(this.sAnti);
          const phi = Math.acos(THREE.MathUtils.clamp(d.y, -0.78, 0.78));
          this.rig.aimOrbit(Math.atan2(d.x, d.z), phi);

          this.cutawayLabels.build(active.data, (i, o) => active.getCutawayAnchor(i, o));
          this.cutawayLabels.onSelectLayer = (idx) => {
            active.setHighlightedLayer(idx);
            this.refreshCutawayBar();
          };
          this.cutawayLabels.visible = true;
          this.cutawayLabels.setActiveLayer(0);
        } else {
          this.cutawayLabels.onSelectLayer = undefined;
          this.cutawayLabels.visible = false;
        }
        this.refreshCutawayBar();
      }
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
      const hit = this.picker.pick(e.clientX, e.clientY, this.canvas);
      const st = simStore.getState();
      if (hit === 'body' && st.selectedId) this.focusBody(st.selectedId);
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
    // Clic al vacío: mantiene la selección (para no perder el panel por
    // accidente), pero cierra el corte interior si estaba abierto.
    const st = simStore.getState();
    if (st.cutawayBodyId) st.setCutaway(null);
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

  focusBody(id: string | null, distanceMultOverride?: number) {
    if (!id || id.startsWith(BELT_PSEUDO_PREFIX)) return;
    const b = this.bodies.get(id);
    if (!b) return;
    // Cometas: el núcleo real (2–26 km) es sub-píxel; se encuadra la región
    // de coma + colas para que la cámara no quede pegada al puntito.
    const st = simStore.getState();
    const cometFloor = (st.distanceMode === 'real' ? 3.0 : 0.8) * st.distanceScale;
    const isComet = b.data.type === 'comet';
    const radius = isComet ? Math.max(b.visualRadius, cometFloor) : b.visualRadius;
    const distMult = distanceMultOverride ?? (b.data.type === 'star' ? 9 : isComet ? 5.5 : 4.5);
    this.rig.focusOn(
      { getPos: (o) => b.getWorldPos(o), getRadius: () => radius },
      distMult
    );
    // Encuadre guiado según tipo de cuerpo:
    // - Planetas: cámara del LADO DEL SOL (cara iluminada, nunca lado noche).
    // - Cometas: PERPENDICULAR al radio solar — las colas (anti-solares)
    //   cruzan el encuadre de LADO; de frente se leen como cuñas sin forma.
    const p = b.getWorldPos(this.sAnti);
    if (p.lengthSq() > 1e-9) {
      const sunTheta = Math.atan2(-p.x, -p.z);
      this.rig.aimOrbit(isComet ? sunTheta + Math.PI / 2 : sunTheta, 1.12);
    }
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
    for (const line of this.cometOrbitLines.values()) {
      line.rebuild(s);
      line.setOpacity(0.2);
    }
    for (const b of this.belts) b.applyScale(s);
    if (simStore.getState().showZones) this.rebuildZones(s);
    if (simStore.getState().showApsides) this.rebuildApsides(simStore.getState().selectedId, s);
  }

  private currentScale(st: { distanceMode: 'real' | 'didactic'; distanceScale: number; sizeScale: number }): ScaleSnapshot {
    return { mode: st.distanceMode, distanceScale: st.distanceScale, sizeScale: st.sizeScale };
  }

  private rebuildZones(s: ScaleSnapshot) {
    while (this.zonesGroup.children.length > 0) {
      const obj = this.zonesGroup.children.pop() as THREE.Mesh;
      obj.geometry.dispose();
    }
    const addRing = (rMinAU: number, rMaxAU: number, color: number, opacity: number) => {
      const inner = distanceTransform(rMinAU, s);
      const outer = distanceTransform(rMaxAU, s);
      const geo = new THREE.RingGeometry(inner, outer, 128, 1);
      const mat = new THREE.MeshBasicNodeMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = -0.02;
      this.zonesGroup.add(m);
    };
    addRing(0.95, 1.67, 0x22c55e, 0.13); // Zona habitable
    addRing(2.7, 4.5, 0x38bdf8, 0.08);   // Línea de hielo (frost line)
  }

  private rebuildApsides(selectedId: string | null, s: ScaleSnapshot) {
    while (this.apsidesGroup.children.length > 0) {
      const obj = this.apsidesGroup.children.pop() as THREE.Mesh | THREE.Line;
      obj.geometry.dispose();
    }
    if (!selectedId || selectedId.startsWith(BELT_PSEUDO_PREFIX)) return;
    const body = this.bodies.get(selectedId)?.data;
    if (!body?.orbital) return;
    const { perihelion, aphelion } = apsidesPositions(body.orbital, {
      distanceTransform: (rAU) => distanceTransform(rAU, s)
    });
    const dotSize = Math.max((s.mode === 'real' ? 0.45 : 0.24) * s.distanceScale, 0.14);
    const mkMarker = (p: Vec3, color: number) => {
      const geo = new THREE.SphereGeometry(dotSize, 16, 12);
      const mat = new THREE.MeshBasicNodeMaterial({ color });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, p.y, p.z);
      this.apsidesGroup.add(m);
    };
    mkMarker(perihelion, 0x34d399); // Perihelio
    mkMarker(aphelion, 0x60a5fa);   // Afelio
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(perihelion.x, perihelion.y, perihelion.z),
      new THREE.Vector3(aphelion.x, aphelion.y, aphelion.z)
    ]);
    const lineMat = new THREE.LineBasicNodeMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.35
    });
    this.apsidesGroup.add(new THREE.Line(lineGeo, lineMat));
  }

  private updateBodies(simDays: number, s: ScaleSnapshot) {
    for (const b of this.bodies.values()) b.update(simDays, s);
  }

  private onResize() {
    const w = Math.max(this.canvas.clientWidth, 1);
    const h = Math.max(this.canvas.clientHeight, 1);
    this.rig.resize(w / h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
  }

  async loadAssets() {
    const all = [...this.bodies.values()];
    await Promise.all(all.map((b) => b.loadAssets()));
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
    for (const b of this.bodies.values()) b.updateCutaway(dt);
    this.updateCometFX(simDays, scale, t);

    const scaleKey = `${scale.mode}:${scale.distanceScale}`;
    if (!st.paused || simDays !== this.lastBeltSimDays || scaleKey !== this.lastBeltScaleKey) {
      for (const b of this.belts) {
        if (b.mesh.visible) b.tick(this.renderer, simDays);
      }
      this.lastBeltSimDays = simDays;
      this.lastBeltScaleKey = scaleKey;
    }

    this.rig.update(dt);

    // Headlamp: sigue a la cámara e ilumina lo que se mira
    this.headlamp.position.copy(this.rig.camera.position);
    this.headlamp.target.position.copy(this.rig.focusPoint);
    this.headlamp.intensity = st.cutawayBodyId ? 0.85 : this.rig.isFollowing ? 0.25 : 0.08;

    const w = Math.max(this.canvas.clientWidth, 1);
    const h = Math.max(this.canvas.clientHeight, 1);
    this.labels.update(this.rig.camera, w, h, st.focusedId, st.selectedId);

    const cutBody = st.cutawayBodyId ? this.bodies.get(st.cutawayBodyId) : null;
    this.cutawayLabels.update(this.rig.camera, w, h, cutBody?.cutawayProgress ?? 0);
    this.updateCutawayHint(st);

    this.renderer.render(this.scene, this.rig.camera);

    // FPS
    if (dt > 0) this.fpsEma = this.fpsEma * 0.92 + (1 / dt) * 0.08;
    this.fpsAcc += dt;
    if (this.fpsAcc > 0.5) {
      this.fpsAcc = 0;
      simStore.getState().setFps(Math.round(this.fpsEma));
    }
  };

  /** Visibilidad agrupada de cometas: cuerpos + FX + etiquetas + órbitas. */
  private refreshCometVisibility(state: { showComets: boolean; showPlanetOrbits: boolean }) {
    for (const c of COMETS) {
      const view = this.bodies.get(c.id);
      if (view) view.group.visible = state.showComets;
      const fx = this.cometFX.get(c.id);
      if (fx) fx.setVisible(state.showComets);
      const line = this.cometOrbitLines.get(c.id);
      if (line) line.line.visible = state.showComets && state.showPlanetOrbits;
    }
    this.labels.setCometsVisible(state.showComets);
  }

  /**
   * Colas cometarias por frame: dirección anti-solar (Sol en el origen),
   * velocidad escena por diferencia finita de la MISMA transformación
   * kepleriana, y r físico en UA para la actividad de sublimación.
   */
  private updateCometFX(simDays: number, s: ScaleSnapshot, timeSec: number) {
    const dtDays = 0.5;
    for (const c of COMETS) {
      const el = c.orbital;
      if (!el) continue;
      const fx = this.cometFX.get(c.id);
      const view = this.bodies.get(c.id);
      if (!fx || !view || !view.group.visible) continue;

      const dT = (rAU: number) => distanceTransform(rAU, s);
      orbitalPosition(el, simDays - dtDays, this.vTmpA, { distanceTransform: dT });
      orbitalPosition(el, simDays + dtDays, this.vTmpB, { distanceTransform: dT });
      const velX = this.vTmpB.x - this.vTmpA.x;
      const velY = this.vTmpB.y - this.vTmpA.y;
      const velZ = this.vTmpB.z - this.vTmpA.z;

      // posición física real (UA) para la actividad
      orbitalPosition(el, simDays, this.vTmpC);
      const rAU = Math.hypot(this.vTmpC.x, this.vTmpC.y, this.vTmpC.z);

      // anti-solar: Sol está en el origen de escena
      const head = view.group.position;
      const anti = this.sAnti.set(head.x, head.y, head.z);
      if (anti.lengthSq() > 1e-12) anti.normalize();
      else anti.set(0, 0, 1);

      const vel = this.sVel.set(velX, velY, velZ);
      if (vel.lengthSq() > 1e-12) vel.normalize();
      else vel.set(anti.x, anti.y, anti.z).multiplyScalar(-1);

      // cámara relativa al cometa (espacio local del grupo, ejes = mundo)
      const camRel = this.sCam.copy(this.rig.camera.position).sub(head);
      fx.update(camRel, anti, vel, rAU, s, timeSec);
    }
  }

  dispose() {
    this.unsubscribe();
    this.cutawayLabels.clear();
    for (const l of this.planetOrbitLines.values()) l.dispose();
    for (const l of this.cometOrbitLines.values()) l.dispose();
    for (const fx of this.cometFX.values()) fx.dispose();
  }

  /* ---------------- Hint y barra de exploración del interior ---------------- */

  private hintEl: HTMLButtonElement | null = null;
  private barEl: HTMLDivElement | null = null;
  private barTitleEl: HTMLElement | null = null;
  private barLayerEl: HTMLElement | null = null;
  private hintFor: string | null = null;

  private ensureHint(): HTMLButtonElement {
    if (this.hintEl) return this.hintEl;
    const el = document.createElement('button');
    el.id = 'cutaway-hint';
    el.className = 'glass';
    el.innerHTML = '🔬 <span>Explorar interior (C)</span>';
    el.style.display = 'none';
    el.addEventListener('click', () => {
      if (this.hintFor) simStore.getState().setCutaway(this.hintFor);
    });
    document.getElementById('hud-root')!.appendChild(el);
    this.hintEl = el;
    return el;
  }

  private ensureCutawayBar(): HTMLDivElement {
    if (this.barEl) return this.barEl;
    const el = document.createElement('div');
    el.id = 'cutaway-bar';
    el.className = 'glass';
    el.style.display = 'none';
    el.innerHTML = `
      <span id="cb-title" class="font-mono text-[10px] tracking-wider text-cyan-300 uppercase"></span>
      <div class="flex items-center gap-1">
        <button id="cb-prev" class="hud-btn px-2 py-1 text-[11px]" title="Capa anterior">◀</button>
        <span id="cb-layer" class="min-w-[130px] text-center font-mono text-[11px] text-slate-200"></span>
        <button id="cb-next" class="hud-btn px-2 py-1 text-[11px]" title="Siguiente capa">▶</button>
      </div>
      <button id="cb-exit" class="hud-btn border-red-400/40 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-200 hover:border-red-400/70 hover:bg-red-500/20" title="Cerrar corte interior (Esc)">✕ Salir</button>`;
    document.getElementById('hud-root')!.appendChild(el);
    this.barEl = el;
    this.barTitleEl = el.querySelector('#cb-title');
    this.barLayerEl = el.querySelector('#cb-layer');
    el.querySelector('#cb-prev')!.addEventListener('click', () => this.stepCutawayLayer(-1));
    el.querySelector('#cb-next')!.addEventListener('click', () => this.stepCutawayLayer(1));
    el.querySelector('#cb-exit')!.addEventListener('click', () => simStore.getState().setCutaway(null));
    return el;
  }

  private stepCutawayLayer(delta: number) {
    const cutId = simStore.getState().cutawayBodyId;
    if (!cutId) return;
    const b = this.bodies.get(cutId);
    if (!b || b.data.structure.length === 0) return;
    const n = b.data.structure.length;
    const cur = this.cutawayLabels.getActiveLayer();
    const next = cur === null ? (delta > 0 ? 0 : n - 1) : (cur + delta + n) % n;
    this.cutawayLabels.setActiveLayer(next);
  }

  private refreshCutawayBar() {
    const bar = this.ensureCutawayBar();
    const cutId = simStore.getState().cutawayBodyId;
    const b = cutId ? this.bodies.get(cutId) : null;
    if (!b) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    const n = b.data.structure.length;
    const idx = this.cutawayLabels.getActiveLayer();
    if (this.barTitleEl) this.barTitleEl.textContent = `Interior · ${b.data.name}`;
    if (this.barLayerEl) {
      this.barLayerEl.textContent =
        idx !== null && b.data.structure[idx]
          ? `${idx + 1}/${n} · ${b.data.structure[idx].name}`
          : `${n} capas (clic para abrir)`;
    }
  }

  private updateCutawayHint(st: {
    cutawayBodyId: string | null;
    focusedId: string | null;
    selectedId: string | null;
  }) {
    const el = this.ensureHint();
    let show = false;
    const targetId = st.focusedId || st.selectedId;
    if (!st.cutawayBodyId && targetId && !targetId.startsWith(BELT_PSEUDO_PREFIX)) {
      const b = this.bodies.get(targetId);
      if (b && b.data.type !== 'comet' && b.data.structure.length >= 2) {
        show = true;
        this.hintFor = targetId;
      }
    }
    if (!show) this.hintFor = null;
    el.style.display = show ? 'inline-flex' : 'none';
  }
}
