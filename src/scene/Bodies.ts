/**
 * Bodies.ts — Jerarquía de cuerpos celestes (Sol, planetas, lunas, asteroides).
 *
 * Estructura por cuerpo:
 *   group (traslación)  →  tiltGroup (inclinación axial)  →  spinGroup (rotación)
 *                                                        →  anillos, atmósfera
 * Las lunas cuelgan del `group` del planeta padre (órbitas locales
 * sincronizadas con la posición del padre en cada frame).
 */
import * as THREE from 'three/webgpu';
import { Fn, float, vec3, vec4, normalView, positionViewDirection } from 'three/tsl';
import type { CelestialBody } from '../data/celestialData';
import { orbitalPosition, TAU } from '../physics/kepler';
import { bodyRadius, distanceTransform, moonOrbitRadius, type ScaleSnapshot } from '../core/scales';
import { getBodyTexture, getRingTexture, getEarthNormal, getEarthClouds, glowTexture } from './textures';
import { makeLayerDiskTexture, computeLayerRadii, layerMidRadii, anchorLocals } from './Cutaway';
import { makeUnitCircle } from './Orbits';
import type { Vec3 } from '../physics/kepler';

export class BodyView {
  readonly data: CelestialBody;
  readonly group = new THREE.Group();
  readonly tiltGroup = new THREE.Group();
  readonly spinGroup = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly atmoMesh: THREE.Mesh | null = null;
  readonly ringsMesh: THREE.Mesh | null = null;
  readonly moonOrbitLine: THREE.Line | null = null;
  readonly glowSprite: THREE.Sprite | null = null;
  private cloudsMesh: THREE.Mesh | null = null;
  private axisGroup: THREE.Group | null = null;
  private readonly tmpOrb: Vec3 = { x: 0, y: 0, z: 0 };

  // Corte interior (octante 3D)
  private cutawayGroup: THREE.Group | null = null;
  private cutawayCap: THREE.Mesh | null = null;
  private cutawayWalls: THREE.Mesh[] = [];
  private cutawayCore: THREE.Mesh | null = null;
  private cutawayHighlight: THREE.Mesh[] = [];
  private cutawayRadii: { inner: number; outer: number; mid: number }[] = [];
  private activeCutawayLayer: number | null = null;
  private cutawayAnchors: THREE.Vector3[] = [];
  cutawayProgress = 0;
  private cutawayTarget = 0;

  /** Radio visual actual (unidades de escena). */
  visualRadius = 1;
  /** Radio orbital de la luna (local al padre). */
  moonOrbitR = 0;
  /** Fase fija por luna para desfasar lunas hermanas. */
  readonly phaseOffset: number;
  readonly worldPos = new THREE.Vector3();
  private parentView: BodyView | null = null;

  get id(): string {
    return this.data.id;
  }

  constructor(data: CelestialBody, phaseSeed = 0) {
    this.data = data;
    this.phaseOffset = phaseSeed;

    this.group.add(this.tiltGroup);
    this.tiltGroup.add(this.spinGroup);
    this.tiltGroup.rotation.z = THREE.MathUtils.degToRad(data.axialTiltDeg);

    if (data.type === 'star') {
      this.mesh = this.buildSun();
      this.glowSprite = this.buildGlow();
      this.group.add(this.glowSprite);
    } else {
      this.mesh = this.buildPlanet();
    }
    this.spinGroup.add(this.mesh);

    if (data.rings) this.ringsMesh = this.buildRings();
    if (data.atmosphereColor && data.type !== 'star') {
      this.atmoMesh = this.buildAtmosphere();
      this.tiltGroup.add(this.atmoMesh);
    }
    if (data.moonOf) {
      this.moonOrbitLine = makeUnitCircle(data.color, 0.2);
      // se agrega al grupo del padre en attachToParent()
    }
  }

  private asyncDone = false;
  /** Carga texturas asíncronamente (una sola vez): reales con fallback procedural. */
  async loadAssets(): Promise<void> {
    if (this.asyncDone) return;
    this.asyncDone = true;
    const mat = this.mesh.material as THREE.MeshStandardNodeMaterial;
    if (this.data.type === 'star') {
      const tex = await getBodyTexture('sun');
      mat.emissiveMap = tex;
      // blanco cálido neutro para respetar los colores reales de la textura
      mat.emissive = new THREE.Color(1.9, 1.7, 1.45);
      mat.needsUpdate = true;
    } else {
      mat.map = await getBodyTexture(this.data.textureKind, this.data.id);
      if (this.data.id === 'earth') {
        const normal = await getEarthNormal();
        if (normal) {
          mat.normalMap = normal;
          mat.normalScale = new THREE.Vector2(0.8, 0.8);
        }
        const clouds = await getEarthClouds();
        if (clouds) this.buildClouds(clouds);
      }
      mat.needsUpdate = true;
      // sincronizar la tapa deslizante del corte con la textura cargada
      if (this.cutawayCap) {
        const rm = this.cutawayCap.material as THREE.MeshStandardNodeMaterial;
        rm.map = mat.map;
        rm.needsUpdate = true;
      }
    }
    if (this.ringsMesh) {
      const rt = await getRingTexture(this.data.id);
      const rm = this.ringsMesh.material as THREE.MeshStandardNodeMaterial;
      rm.map = rt.tex;
      // el PNG real ya trae canal alfa propio; el procedural de Saturno usa alphaMap, el de Urano es RGBA
      if (!rt.isReal && this.data.id !== 'uranus') rm.alphaMap = rt.tex;
      rm.transparent = true;
      if (this.data.id === 'uranus') {
        rm.color = new THREE.Color(0x9cb4c9);
        rm.emissive = new THREE.Color(0x000000);
        rm.opacity = 0.55;
        rm.alphaTest = 0.01;
      } else {
        rm.alphaTest = 0.02;
      }
      rm.needsUpdate = true;
    }
  }

  private buildSun(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1, 48, 32);
    const mat = new THREE.MeshStandardNodeMaterial({
      emissive: new THREE.Color(2.2, 1.5, 0.7),
      roughness: 1
    });
    return new THREE.Mesh(geo, mat);
  }

  private buildGlow(): THREE.Sprite {
    const mat = new THREE.SpriteNodeMaterial({
      map: glowTexture('rgba(255,214,140,0.9)', 'rgba(255,140,40,0)'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(5.2);
    return s;
  }

  /** Capa de nubes de la Tierra (esfera 1.014× con alphaMap por luminancia). */
  private buildClouds(tex: THREE.Texture) {
    const geo = new THREE.SphereGeometry(1.014, 48, 32);
    const alpha = tex.clone();
    alpha.needsUpdate = true;
    alpha.colorSpace = THREE.NoColorSpace;
    const mat = new THREE.MeshStandardNodeMaterial({
      map: tex,
      alphaMap: alpha,
      transparent: true,
      depthWrite: false,
      roughness: 1
    });
    this.cloudsMesh = new THREE.Mesh(geo, mat);
    this.tiltGroup.add(this.cloudsMesh);
    if (this.visualRadius > 0) this.cloudsMesh.scale.setScalar(this.visualRadius);
  }

  private buildPlanet(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1, 48, 32);
    const mat = new THREE.MeshStandardNodeMaterial({
      roughness: 0.92,
      metalness: 0.0
    });
    // núcleos cometarios: leve brillo propio para no verlos como puntos negros
    if (this.data.type === 'comet') {
      mat.emissive = new THREE.Color(0.28, 0.34, 0.42);
    }
    return new THREE.Mesh(geo, mat);
  }

  /** Atmósfera: dispersión tipo rim (Fresnel) con TSL. */
  private buildAtmosphere(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1.035, 48, 32);
    const mat = new THREE.NodeMaterial();
    const color = new THREE.Color(
      this.data.atmosphereColor ?? 0x88bbff
    );
    const intensity = this.data.atmosphereIntensity ?? 1.0;

    const fresnel = Fn(() => {
      const v = positionViewDirection.normalize();
      const n = normalView.normalize();
      const f = float(1.0).sub(n.dot(v).abs()).pow(2.6).mul(float(intensity));
      return vec4(vec3(color.r, color.g, color.b).mul(f.add(f.mul(f))), f.mul(0.9));
    })();

    mat.outputNode = fresnel;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    return new THREE.Mesh(geo, mat);
  }

  private buildRings(): THREE.Mesh {
    const d = this.data.rings!;
    const inner = d.innerKm / this.data.radiusKm;
    const outer = d.outerKm / this.data.radiusKm;
    const geo = new THREE.RingGeometry(inner, outer, 160, 1);
    // uv.x → fracción radial para la textura de anillos
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const r = v.length();
      const t = (r - inner) / (outer - inner);
      uv.setXY(i, t, 0.5);
    }
    uv.needsUpdate = true;
    const mat = new THREE.MeshStandardNodeMaterial({
      color: 0xf0e6d0,
      roughness: 1,
      side: THREE.DoubleSide,
      transparent: true,
      emissive: new THREE.Color(0x30281c)
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    this.tiltGroup.add(m);
    return m;
  }

  attachToParent(parent: BodyView) {
    this.parentView = parent;
    const useEqPlane = parent.data.id === 'jupiter' || parent.data.id === 'saturn';
    const host = useEqPlane ? parent.tiltGroup : parent.group;
    host.add(this.group);
    if (this.moonOrbitLine) {
      host.add(this.moonOrbitLine);
      if (!useEqPlane && this.data.moonOf) {
        this.moonOrbitLine.rotation.x = THREE.MathUtils.degToRad(this.data.moonOf.iDeg);
      }
    }
  }

  /* ---------------- Corte interior (cutaway) ---------------- */

  /** Activa/desactiva el corte animado del cuerpo. */
  setCutaway(on: boolean) {
    this.cutawayTarget = on ? 1 : 0;
    if (on && !this.cutawayGroup) this.buildCutaway();
  }

  get cutawayActive(): boolean {
    return this.cutawayTarget === 1;
  }

  private makeSphereSlice(
    radius: number,
    ws: number,
    hs: number,
    phiStart: number,
    phiLen: number,
    thetaStart: number,
    thetaLen: number
  ): THREE.SphereGeometry {
    const geo = new THREE.SphereGeometry(radius, ws, hs, phiStart, phiLen, thetaStart, thetaLen);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let iy = 0; iy <= hs; iy++) {
      const theta = thetaStart + (iy / hs) * thetaLen;
      const vCoord = 1 - theta / Math.PI;
      for (let ix = 0; ix <= ws; ix++) {
        const idx = iy * (ws + 1) + ix;
        const phi = phiStart + (ix / ws) * phiLen;
        const uOff = uv.getX(idx) - ix / ws;
        uv.setXY(idx, phi / (Math.PI * 2) + uOff * (phiLen / (Math.PI * 2)), vCoord);
      }
    }
    uv.needsUpdate = true;
    return geo;
  }

  private buildCutaway() {
    const g = new THREE.Group();
    const baseMat = this.mesh.material as THREE.MeshStandardNodeMaterial;
    const matCap = baseMat.clone();
    matCap.transparent = true;

    // 1) Cáscara 7/8 fija (deja abierto el octante +X, +Y, +Z correspondiente a φ∈[π/2, π], θ∈[0, π/2])
    const southHalf = new THREE.Mesh(
      this.makeSphereSlice(1, 48, 18, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      baseMat
    );
    const north34 = new THREE.Mesh(
      this.makeSphereSlice(1, 36, 18, Math.PI, Math.PI * 1.5, 0, Math.PI / 2),
      baseMat
    );

    // 2) Tapa octante deslizante que se retira en diagonal al abrir
    this.cutawayCap = new THREE.Mesh(
      this.makeSphereSlice(1, 18, 18, Math.PI / 2, Math.PI / 2, 0, Math.PI / 2),
      matCap
    );

    // 3) Tres paredes ortogonales de corte con textura geológica e iluminación cálida
    this.cutawayRadii = computeLayerRadii(this.data);
    this.cutawayAnchors = anchorLocals(
      this.data.structure,
      layerMidRadii(this.data)
    );
    const diskTex = makeLayerDiskTexture(this.data);
    const wallMat = new THREE.MeshStandardNodeMaterial({
      map: diskTex,
      emissiveMap: diskTex,
      emissive: new THREE.Color(0.58, 0.58, 0.58),
      roughness: 0.72,
      metalness: 0.04,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });

    const wallXY = new THREE.Mesh(new THREE.CircleGeometry(0.998, 64, 0, Math.PI / 2), wallMat);
    const wallYZ = new THREE.Mesh(new THREE.CircleGeometry(0.998, 64, 0, Math.PI / 2), wallMat);
    wallYZ.rotation.y = -Math.PI / 2;
    const wallXZ = new THREE.Mesh(new THREE.CircleGeometry(0.998, 64, -Math.PI / 2, Math.PI / 2), wallMat);
    wallXZ.rotation.x = -Math.PI / 2;
    this.cutawayWalls = [wallXY, wallYZ, wallXZ];

    // 4) Núcleo 3D volumétrico sobresaliente en el vértice central
    const coreR = Math.min(this.cutawayRadii[0]?.outer ?? 0.18, 0.42);
    const coreColor = new THREE.Color(this.data.structure[0]?.color ?? '#ffe066');
    const coreMat = new THREE.MeshStandardNodeMaterial({
      color: coreColor,
      emissive: coreColor.clone().multiplyScalar(0.55),
      roughness: 0.48,
      transparent: true,
      opacity: 0
    });
    this.cutawayCore = new THREE.Mesh(new THREE.SphereGeometry(coreR, 36, 24), coreMat);

    // 5) Anillos de resaltado 3D para destacar la capa seleccionada
    const hlMat = new THREE.MeshBasicNodeMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const hlXY = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.2, 48, 1, 0, Math.PI / 2), hlMat);
    hlXY.position.z = 0.005;
    const hlYZ = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.2, 48, 1, 0, Math.PI / 2), hlMat);
    hlYZ.rotation.y = -Math.PI / 2;
    hlYZ.position.x = 0.005;
    const hlXZ = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.2, 48, 1, -Math.PI / 2, Math.PI / 2), hlMat);
    hlXZ.rotation.x = -Math.PI / 2;
    hlXZ.position.y = 0.005;
    this.cutawayHighlight = [hlXY, hlYZ, hlXZ];
    for (const h of this.cutawayHighlight) h.visible = false;

    g.add(
      southHalf,
      north34,
      this.cutawayCap,
      wallXY,
      wallYZ,
      wallXZ,
      this.cutawayCore,
      hlXY,
      hlYZ,
      hlXZ
    );
    g.visible = false;
    g.scale.setScalar(this.visualRadius);
    this.cutawayGroup = g;
    this.tiltGroup.add(g);
  }

  /** Resalta en 3D la capa seleccionada del corte interior. */
  setHighlightedLayer(idx: number | null) {
    this.activeCutawayLayer = idx;
    if (!this.cutawayGroup || this.cutawayHighlight.length !== 3) return;
    if (idx === null || !this.cutawayRadii[idx]) {
      for (const h of this.cutawayHighlight) h.visible = false;
      return;
    }
    const { inner, outer } = this.cutawayRadii[idx];
    const rIn = Math.max(inner, 0.002);
    const rOut = Math.max(outer, rIn + 0.01);
    const angles: [number, number][] = [
      [0, Math.PI / 2],
      [0, Math.PI / 2],
      [-Math.PI / 2, Math.PI / 2]
    ];
    this.cutawayHighlight.forEach((h, wi) => {
      h.geometry.dispose();
      h.geometry = new THREE.RingGeometry(rIn, rOut, 48, 1, angles[wi][0], angles[wi][1]);
      h.visible = true;
    });
  }

  /** Posición world del anclaje de la etiqueta de la capa i. */
  getCutawayAnchor(i: number, out: THREE.Vector3): THREE.Vector3 {
    if (!this.cutawayGroup || !this.cutawayAnchors[i]) return out.set(0, 0, 0);
    this.cutawayGroup.updateWorldMatrix(true, false);
    return this.cutawayGroup.localToWorld(out.copy(this.cutawayAnchors[i]));
  }

  /** Anima la apertura/cierre del corte (lerp exponencial, ~0.6 s). */
  updateCutaway(dt: number) {
    if (!this.cutawayGroup) return;
    const k = 1 - Math.exp(-dt * 4.6);
    this.cutawayProgress += (this.cutawayTarget - this.cutawayProgress) * k;
    if (Math.abs(this.cutawayTarget - this.cutawayProgress) < 0.002) {
      this.cutawayProgress = this.cutawayTarget;
    }
    const p = this.cutawayProgress;
    this.cutawayGroup.visible = p > 0.001;
    // la esfera completa solo aparece completamente cerrada
    this.mesh.visible = p < 0.02;
    // tapa octante: se desliza hacia (+X, +Y, +Z) mientras se desvanece
    const rm = this.cutawayCap!.material as THREE.MeshStandardNodeMaterial;
    rm.opacity = 1 - p;
    const slide = 0.52 * p * p;
    this.cutawayCap!.position.set(slide, slide * 0.85, slide);
    this.cutawayCap!.rotation.y = 0.16 * p;

    const wallOp = Math.min(1, p * 1.45);
    for (const w of this.cutawayWalls) {
      (w.material as THREE.MeshStandardNodeMaterial).opacity = wallOp;
    }
    if (this.cutawayCore) {
      (this.cutawayCore.material as THREE.MeshStandardNodeMaterial).opacity = wallOp;
    }
    if (this.cutawayHighlight.length > 0 && this.activeCutawayLayer !== null) {
      const hlMat = this.cutawayHighlight[0].material as THREE.MeshBasicNodeMaterial;
      hlMat.opacity = 0.42 * Math.min(1, p * 1.5);
    }

    // las nubes y la atmósfera tapan o flotan sobre el corte: ocultarlas al abrir
    if (this.cloudsMesh) this.cloudsMesh.visible = p < 0.4;
    if (this.atmoMesh) this.atmoMesh.visible = p < 0.15;
  }

  get parent(): BodyView | null {
    return this.parentView;
  }

  /** Dirección MUNDO óptima hacia el octante abierto (+X, +Y, +Z locales). */
  getCutawayOpenDir(out: THREE.Vector3): THREE.Vector3 {
    if (!this.cutawayGroup) return out.set(1, 0.62, 1).normalize();
    this.cutawayGroup.updateWorldMatrix(true, false);
    const q = new THREE.Quaternion();
    this.cutawayGroup.getWorldQuaternion(q);
    return out.set(1, 0.62, 1).normalize().applyQuaternion(q).normalize();
  }

  /** Recalcula radios visuales y órbitas al cambiar la escala. */
  applyScale(s: ScaleSnapshot) {
    this.visualRadius = bodyRadius(this.data.radiusKm, s);
    this.spinGroup.scale.setScalar(this.visualRadius);
    // atmósfera y anillos viven en tiltGroup (fuera del spin): escalar aparte
    if (this.atmoMesh) this.atmoMesh.scale.setScalar(this.visualRadius);
    if (this.ringsMesh) this.ringsMesh.scale.setScalar(this.visualRadius);
    if (this.cloudsMesh) this.cloudsMesh.scale.setScalar(this.visualRadius);
    if (this.cutawayGroup) this.cutawayGroup.scale.setScalar(this.visualRadius);
    if (this.axisGroup) this.axisGroup.scale.setScalar(this.visualRadius);
    if (this.glowSprite) {
      // En modo real el resplandor es compacto: el disco solar es ~30% del radio
      // de la órbita de Mercurio (con tamaños ×25) y el halo no debe invadirla.
      // En didáctico se permite lucir más grande.
      const glowFactor = s.mode === 'real' ? 2.1 : 3.8;
      this.glowSprite.scale.setScalar(
        Math.max(this.visualRadius * glowFactor, this.visualRadius + 0.25)
      );
      (this.glowSprite.material as THREE.SpriteNodeMaterial).opacity =
        s.mode === 'real' ? 0.55 : 1.0;
    }
    if (this.data.moonOf && this.parentView) {
      const ringsOuterRatio = this.parentView.data.rings
        ? this.parentView.data.rings.outerKm / this.parentView.data.radiusKm
        : 0;
      const { radius } = moonOrbitRadius(
        this.data.moonOf.radiusKm,
        this.parentView.visualRadius,
        s,
        ringsOuterRatio
      );
      this.moonOrbitR = radius;
      this.moonOrbitLine?.scale.setScalar(radius);
    }
  }

  /** Muestra/oculta el eje de rotación y anillo ecuatorial (capa didáctica). */
  setAxisVisible(v: boolean) {
    if (v && !this.axisGroup) {
      const g = new THREE.Group();
      const axisGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -1.65, 0),
        new THREE.Vector3(0, 1.65, 0)
      ]);
      const axisMat = new THREE.LineBasicNodeMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85
      });
      g.add(new THREE.Line(axisGeo, axisMat));

      const tipGeo = new THREE.ConeGeometry(0.06, 0.16, 10);
      const tipMat = new THREE.MeshBasicNodeMaterial({ color: 0x38bdf8 });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.set(0, 1.68, 0);
      g.add(tip);

      const eqLine = makeUnitCircle(0xfbbf24, 0.45);
      eqLine.scale.setScalar(1.06);
      g.add(eqLine);

      g.scale.setScalar(this.visualRadius);
      this.axisGroup = g;
      this.tiltGroup.add(g);
    }
    if (this.axisGroup) this.axisGroup.visible = v;
  }

  /** Actualiza posición y rotación para un instante simulado. */
  update(simDays: number, s: ScaleSnapshot) {
    const d = this.data;
    // Traslación
    if (d.orbital) {
      const p = orbitalPosition(d.orbital, simDays, this.tmpOrb, {
        distanceTransform: (rAU) => distanceTransform(rAU, s)
      });
      this.group.position.set(p.x, p.y, p.z);
    } else if (d.moonOf && this.parentView) {
      const angle = TAU * (simDays / d.moonOf.periodDays) + this.phaseOffset;
      const r = this.moonOrbitR;
      const useEqPlane =
        this.parentView.data.id === 'jupiter' || this.parentView.data.id === 'saturn';
      const inc = useEqPlane ? 0 : THREE.MathUtils.degToRad(d.moonOf.iDeg);
      const sinA = Math.sin(angle);
      this.group.position.set(
        Math.cos(angle) * r,
        sinA * Math.sin(inc) * r,
        -sinA * Math.cos(inc) * r
      );
    }
    // Rotación axial: si axialTiltDeg > 90°, el eje ya está invertido por la UAI;
    // usar Math.abs evita la doble negación que volvía prógrado a Venus/Urano/Plutón.
    const rotHours = d.axialTiltDeg > 90 ? Math.abs(d.rotationHours) : d.rotationHours;
    const rot = (simDays * 24) / rotHours;
    this.spinGroup.rotation.y = TAU * rot;
    // Nubes: deriva levemente más rápida que la superficie
    if (this.cloudsMesh) this.cloudsMesh.rotation.y = TAU * rot * 1.07;
    // cachear posición mundo para picking/labels/cámara
    this.group.getWorldPosition(this.worldPos);
  }

  getWorldPos(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.worldPos);
  }
  getVisualRadius(): number {
    return this.visualRadius;
  }
}
