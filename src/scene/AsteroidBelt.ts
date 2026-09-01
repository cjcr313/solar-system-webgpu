/**
 * AsteroidBelt.ts — Cinturones con computación 100% en GPU.
 *
 * Arquitectura:
 * - Parámetros orbitales por asteroide (a, e, i, Ω, fase, tamaño, spin)
 *   generados en CPU (deterministas, con PRNG con semilla) y subidos como
 *   storage buffers instanciados.
 * - Un compute shader TSL/WGSL resuelve la ecuación de Kepler por instancia
 *   (Newton-Raphson, 5 iteraciones) cada frame y escribe la posición 3D.
 * - El InstancedMesh renderiza N rocas en 1 solo draw call; la rotación
 *   individual y el tamaño se aplican en el vértice (TSL) sin tocar matrices.
 * - Picking: raycast manual por instancia replicando la MISMA matemática
 *   en CPU solo en el instante del clic (cero coste por frame).
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  instanceIndex,
  storage,
  uniform,
  float,
  vec3,
  color,
  mix,
  fract,
  positionLocal,
  atan
} from 'three/tsl';
import { GAUSS_K, TAU as TAU_JS } from '../physics/kepler';
import { distanceTransform, type ScaleSnapshot } from '../core/scales';
import type { PickableBelt } from '../core/picking';

export const BELT_ID_PREFIX = 'belt:';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BeltConfig {
  name: string;
  count: number;
  aRange: [number, number];
  eMax: number;
  inclMaxDeg: number;
  sizeRange: [number, number];
  colorA: number;
  colorB: number;
  /** Huecos de Kirkwood (resonancias con Júpiter) */
  kirkwoodGaps?: boolean;
  seed: number;
}

export class AsteroidBelt implements PickableBelt {
  readonly mesh: THREE.InstancedMesh;
  readonly name: string;

  // uniforms compartidos con el compute
  private uSimDays = uniform(0);
  private uMode = uniform(0); // 0 = real, 1 = didáctico
  private uDistScale = uniform(1);
  private computeNode: THREE.ComputeNode | null = null;

  // parámetros CPU (espejo de los buffers, para picking)
  private pA: Float32Array;
  private pE: Float32Array;
  private pI: Float32Array;
  private pO: Float32Array;
  private pPhase: Float32Array;
  private pSize: Float32Array;
  private readonly cfg: BeltConfig;
  private scale: ScaleSnapshot;

  /** Callback opcional: instancia → id de cuerpo destacado. */
  notableForInstance: ((i: number) => string | null) | null = null;

  constructor(cfg: BeltConfig, scale: ScaleSnapshot) {
    this.cfg = cfg;
    this.scale = scale;
    this.name = cfg.name;
    const N = cfg.count;
    const rnd = mulberry32(cfg.seed);

    // ---- 1) Generación determinista de parámetros (CPU) ----
    this.pA = new Float32Array(N);
    this.pE = new Float32Array(N);
    this.pI = new Float32Array(N);
    this.pO = new Float32Array(N);
    this.pPhase = new Float32Array(N);
    this.pSize = new Float32Array(N);

    const gaps = [2.502, 2.825, 2.958, 3.279]; // resonancias 3:1, 5:2, 7:3, 2:1
    for (let i = 0; i < N; i++) {
      let a = 0;
      for (let tries = 0; tries < 24; tries++) {
        a = cfg.aRange[0] + rnd() * (cfg.aRange[1] - cfg.aRange[0]);
        if (!cfg.kirkwoodGaps) break;
        const nearGap = gaps.some((g) => Math.abs(a - g) < 0.035 + rnd() * 0.02);
        if (!nearGap) break;
      }
      this.pA[i] = a;
      this.pE[i] = rnd() * rnd() * cfg.eMax;
      // inclinaciones ~ Rayleigh
      this.pI[i] = (cfg.inclMaxDeg * (rnd() * rnd()) * Math.PI) / 180;
      this.pO[i] = rnd() * TAU_JS;
      this.pPhase[i] = rnd() * TAU_JS;
      // ley de potencias: muchas chicas, pocas grandes
      this.pSize[i] = cfg.sizeRange[0] * Math.pow(cfg.sizeRange[1] / cfg.sizeRange[0], rnd() * rnd());
    }

    // ---- 2) Storage buffers instanciados ----
    const aBuf = storage(new THREE.StorageInstancedBufferAttribute(this.pA, 1), 'float', N);
    const eBuf = storage(new THREE.StorageInstancedBufferAttribute(this.pE, 1), 'float', N);
    const iBuf = storage(new THREE.StorageInstancedBufferAttribute(this.pI, 1), 'float', N);
    const oBuf = storage(new THREE.StorageInstancedBufferAttribute(this.pO, 1), 'float', N);
    const phBuf = storage(new THREE.StorageInstancedBufferAttribute(this.pPhase, 1), 'float', N);
    const szBuf = storage(new THREE.StorageInstancedBufferAttribute(this.pSize, 1), 'float', N);
    const posBuf = storage(
      new THREE.StorageInstancedBufferAttribute(new Float32Array(N * 3), 3),
      'vec3',
      N
    );

    // ---- 3) Compute shader: Kepler en GPU ----
    const uSimDays = this.uSimDays;
    const uMode = this.uMode;
    const uDistScale = this.uDistScale;

    const computeUpdate = Fn(() => {
      const a = aBuf.element(instanceIndex);
      const e = eBuf.element(instanceIndex);
      const inc = iBuf.element(instanceIndex);
      const node = oBuf.element(instanceIndex);
      const phase = phBuf.element(instanceIndex);

      // anomalía media
      const n = float(GAUSS_K).mul(a.pow(float(-1.5)));
      const M = fract(phase.add(uSimDays.mul(n)).div(float(TAU_JS))).mul(float(TAU_JS));

      // Kepler: Newton-Raphson (E0 = π → convergencia global para e < 0.8)
      const E = float(Math.PI).toVar();
      for (let k = 0; k < 5; k++) {
        const f = E.sub(M).sub(e.mul(E.sin()));
        const fp = float(1).sub(e.mul(E.cos()));
        E.assign(E.sub(f.div(fp)));
      }
      const sinE = E.sin();
      const cosE = E.cos();

      // anomalía verdadera y radio
      const nu = atan(
        float(1).sub(e.mul(e)).sqrt().mul(sinE),
        cosE.sub(e)
      );
      const rAU = a.mul(float(1).sub(e.mul(cosE)));

      // transformación de distancia (real: lineal · didáctica: √r)
      // exponente = 1 − 0.5·mode
      const rDisp = float(10)
        .mul(rAU.pow(float(1).sub(uMode.mul(float(0.5)))))
        .mul(uDistScale);
      const f = rDisp.div(rAU);

      // plano orbital (ω = 0) → eclíptico → escena (Y-up)
      const cosn = nu.cos();
      const sinn = nu.sin();
      const cosO = node.cos();
      const sinO = node.sin();
      const cosi = inc.cos();
      const sini = inc.sin();

      const x = rDisp.mul(cosO.mul(cosn).sub(sinO.mul(sinn).mul(cosi)));
      const y = rDisp.mul(sinO.mul(cosn).add(cosO.mul(sinn).mul(cosi)));
      const z = rDisp.mul(sinn.mul(sini));

      posBuf.element(instanceIndex).assign(vec3(x, z, y.negate()));
    })().compute(N);
    this.computeNode = computeUpdate;

    // ---- 4) Material: roca giratoria + color por instancia ----
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });

    const uSpinTime = this.uSimDays;
    const size = szBuf.element(instanceIndex);
    const hash = fract(float(12.9898).mul(instanceIndex.toFloat()).sin().mul(float(43758.5453)));
    const angle = uSpinTime.mul(hash.mul(float(40)).add(float(2))).mul(float(0.05));

    const p = positionLocal.toVar();
    const ca = angle.cos();
    const sa = angle.sin();
    const rotated = vec3(
      p.x.mul(ca).sub(p.z.mul(sa)),
      p.y,
      p.x.mul(sa).add(p.z.mul(ca))
    );

    mat.positionNode = rotated.mul(size).add(posBuf.element(instanceIndex));
    mat.colorNode = mix(color(cfg.colorA), color(cfg.colorB), hash.mul(hash));

    // ---- 5) Geometría de roca low-poly compartida ----
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const rnd2 = mulberry32(cfg.seed + 7);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = 0.72 + rnd2() * 0.55;
      pos.setXYZ(i, v.x * d, v.y * d * 0.82, v.z * d);
    }
    geo.computeVertexNormals();

    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;

    this.applyScale(scale);
  }

  /** Registra el compute en el renderer (una vez). */
  registerCompute(renderer: THREE.WebGPURenderer) {
    if (this.computeNode) renderer.compute(this.computeNode);
  }

  applyScale(s: ScaleSnapshot) {
    this.scale = s;
    this.uMode.value = s.mode === 'didactic' ? 1 : 0;
    this.uDistScale.value = s.distanceScale;
  }

  tick(renderer: THREE.WebGPURenderer, simDays: number) {
    this.uSimDays.value = simDays;
    if (this.computeNode) renderer.compute(this.computeNode);
  }

  setVisible(v: boolean) {
    this.mesh.visible = v;
  }

  /* ---------------- Picking (CPU, solo en clic) ---------------- */

  raycast(ray: THREE.Ray): { instanceId: number; distAlongRay: number } | null {
    const s = this.scale;
    const mode = s.mode === 'didactic' ? 1 : 0;
    const o = ray.origin;
    const dir = ray.direction;
    let best = -1;
    let bestT = Infinity;
    const N = this.cfg.count;

    const ox = o.x, oy = o.y, oz = o.z;
    const dx = dir.x, dy = dir.y, dz = dir.z;

    for (let i = 0; i < N; i++) {
      const p = this.instancePosition(i, mode, s.distanceScale);
      if (!p) continue;
      const px = p[0] - ox, py = p[1] - oy, pz = p[2] - oz;
      const t = px * dx + py * dy + pz * dz; // distancia a lo largo del rayo
      if (t <= 0.1) continue;
      const cx = px - dx * t, cy = py - dy * t, cz = pz - dz * t;
      const d2 = cx * cx + cy * cy + cz * cz;
      const thr = Math.max(t * 0.008, 0.05); // radio angular ≈ 0.46°
      if (d2 < thr * thr && t < bestT) {
        bestT = t;
        best = i;
      }
    }
    return best >= 0 ? { instanceId: best, distAlongRay: bestT } : null;
  }

  /** Misma matemática del compute (JS) para una instancia. */
  private instancePosition(i: number, mode: number, distScale: number): number[] | null {
    const a = this.pA[i];
    const e = this.pE[i];
    const n = GAUSS_K * Math.pow(a, -1.5);
    const M = (((this.pPhase[i] + this.uSimDays.value * n) % TAU_JS) + TAU_JS) % TAU_JS;

    let E = Math.PI;
    for (let k = 0; k < 5; k++) {
      const f = E - M - e * Math.sin(E);
      const fp = 1 - e * Math.cos(E);
      E -= f / fp;
    }
    const sinE = Math.sin(E), cosE = Math.cos(E);
    const nu = Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e);
    const rAU = a * (1 - e * cosE);
    if (!Number.isFinite(rAU) || rAU <= 0) return null;
    const rDisp = 10 * Math.pow(rAU, 1 - 0.5 * mode) * distScale;

    const cosn = Math.cos(nu), sinn = Math.sin(nu);
    const cosO = Math.cos(this.pO[i]), sinO = Math.sin(this.pO[i]);
    const cosi = Math.cos(this.pI[i]), sini = Math.sin(this.pI[i]);

    const x = rDisp * (cosO * cosn - sinO * sinn * cosi);
    const y = rDisp * (sinO * cosn + cosO * sinn * cosi);
    const z = rDisp * sinn * sini;
    return [x, z, -y]; // Y-up
  }

  bodyIdForInstance(instanceId: number): string | null {
    return this.notableForInstance ? this.notableForInstance(instanceId) : null;
  }

  /**
   * Convierte una instancia en un CelestialBody “pseudo” para el panel
   * científico (datos orbitales reales de esa roca concreta).
   */
  describeInstanceAsBody(i: number): import('../data/celestialData').CelestialBody {
    const a = this.pA[i];
    const e = this.pE[i];
    const periodDays = 365.25 * Math.pow(a, 1.5);
    const inclDeg = (this.pI[i] * 180) / Math.PI;
    const sizeUnits = this.pSize[i];
    // estimación de radio físico asumiendo ~150 km por unidad de tamaño visual
    const estRadiusKm = Math.max(0.5, Math.round(sizeUnits * 150));
    return {
      id: `${BELT_ID_PREFIX}${this.name}:${i}`,
      name: `Asteroide #${i.toLocaleString('es-CL')}`,
      type: 'asteroid',
      color: this.cfg.colorA,
      textureKind: 'rock',
      radiusKm: estRadiusKm,
      axialTiltDeg: 0,
      rotationHours: 6 + (i % 13),
      orbital: {
        a,
        e,
        iDeg: inclDeg,
        OmegaDeg: (this.pO[i] * 180) / Math.PI,
        omegaDeg: 0,
        M0Deg: (this.pPhase[i] * 180) / Math.PI,
        periodDays
      },
      physical: {
        massKg: `${(4 / 3) * Math.PI * Math.pow(estRadiusKm * 1000, 3) * 2500 > 1e21
          ? ((4 / 3) * Math.PI * Math.pow(estRadiusKm * 1000, 3) * 2500).toExponential(2).replace('e+', ' × 10^') + ' kg'
          : '≈ ' + Math.round(((4 / 3) * Math.PI * Math.pow(estRadiusKm * 1000, 3) * 2500) / 1e12) + ' × 10¹² kg (est.)'}`,
        densityGcm3: 2.5,
        gravityMs2: 1e-4,
        escapeKms: 0.001
      },
      structure: [
        { name: 'Roca / metal primitivo', pct: 100, color: '#8a7d6e', note: `Miembro del ${this.name}. Los asteroides del cinturón principal son restos de planetesimales que nunca se acrecionaron en un planeta por la resonancia de Júpiter.` }
      ],
      atmosphere: {
        composition: [],
        pressure: 'Sin atmósfera',
        tempMean: this.name.includes('Kuiper') ? '−220 °C' : '−108 °C',
        winds: '—',
        notes: `Órbita individual calculada en GPU (compute shader): a = ${a.toFixed(3)} UA · e = ${e.toFixed(3)} · i = ${inclDeg.toFixed(1)}° · P ≈ ${periodDays.toFixed(0)} días.`
      },
      missions: this.name.includes('Kuiper')
        ? [{ name: 'New Horizons', agency: 'NASA', year: '2015–19', highlight: 'Cruzó el cinturón de Kuiper tras visitar Plutón y Arrokoth (2019).' }]
        : [
            { name: 'Dawn', agency: 'NASA', year: '2011–18', highlight: 'Visitó Vesta y Ceres, los dos mayores cuerpos del cinturón.' },
            { name: 'Lucy', agency: 'NASA', year: '2021–33', highlight: 'En ruta hacia los troyanos de Júpiter, cruzando el cinturón.' }
          ],
      summary: `Un asteroide individual del ${this.name}: cuerpo rocoso primitivo de ~${estRadiusKm} km de radio que orbita el Sol a ${(a * 149.6).toFixed(1)} millones de km.`
    };
  }
}
