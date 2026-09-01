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
import { getBodyTexture, getRingTexture, glowTexture } from './textures';
import { makeUnitCircle } from './Orbits';

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
  /** Carga texturas asíncronamente (una sola vez). */
  async loadAssets(): Promise<void> {
    if (this.asyncDone) return;
    this.asyncDone = true;
    const mat = this.mesh.material as THREE.MeshStandardNodeMaterial;
    if (this.data.type === 'star') {
      const tex = await getBodyTexture('sun');
      (mat as THREE.MeshStandardNodeMaterial).emissiveMap = tex;
      (mat as THREE.MeshStandardNodeMaterial).emissive = new THREE.Color(2.4, 1.7, 0.9);
      (mat as THREE.MeshStandardNodeMaterial).needsUpdate = true;
    } else {
      mat.map = await getBodyTexture(this.data.textureKind);
      mat.needsUpdate = true;
    }
    if (this.ringsMesh) {
      const rt = await getRingTexture();
      const rm = this.ringsMesh.material as THREE.MeshStandardNodeMaterial;
      rm.map = rt;
      rm.alphaMap = rt;
      rm.transparent = true;
      rm.alphaTest = 0.02;
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

  private buildPlanet(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1, 48, 32);
    const mat = new THREE.MeshStandardNodeMaterial({
      roughness: 0.92,
      metalness: 0.0
    });
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
    parent.group.add(this.group);
    if (this.moonOrbitLine) parent.group.add(this.moonOrbitLine);
  }

  get parent(): BodyView | null {
    return this.parentView;
  }

  /** Recalcula radios visuales y órbitas al cambiar la escala. */
  applyScale(s: ScaleSnapshot) {
    this.visualRadius = bodyRadius(this.data.radiusKm, s);
    this.spinGroup.scale.setScalar(this.visualRadius);
    // atmósfera y anillos viven en tiltGroup (fuera del spin): escalar aparte
    if (this.atmoMesh) this.atmoMesh.scale.setScalar(this.visualRadius);
    if (this.ringsMesh) this.ringsMesh.scale.setScalar(this.visualRadius);
    if (this.glowSprite) {
      this.glowSprite.scale.setScalar(
        Math.max(this.visualRadius * 4.6, this.visualRadius + 0.4)
      );
    }
    if (this.data.moonOf && this.parentView) {
      const { radius } = moonOrbitRadius(
        this.data.moonOf.radiusKm,
        this.parentView.visualRadius,
        s
      );
      this.moonOrbitR = radius;
      this.moonOrbitLine?.scale.setScalar(radius);
    }
  }

  /** Actualiza posición y rotación para un instante simulado. */
  update(simDays: number, s: ScaleSnapshot) {
    const d = this.data;
    // Traslación
    if (d.orbital) {
      const p = orbitalPosition(d.orbital, simDays, undefined, {
        distanceTransform: (rAU) => distanceTransform(rAU, s)
      });
      this.group.position.set(p.x, p.y, p.z);
    } else if (d.moonOf && this.parentView) {
      const angle = TAU * (simDays / d.moonOf.periodDays) + this.phaseOffset;
      const r = this.moonOrbitR;
      this.group.position.set(Math.cos(angle) * r, 0, -Math.sin(angle) * r);
    }
    // Rotación axial (negativa = retrógrada)
    const rot = (simDays * 24) / d.rotationHours;
    this.spinGroup.rotation.y = TAU * rot;
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
