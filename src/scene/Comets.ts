/**
 * Comets.ts — Efectos cometarios: coma + cola iónica + cola de polvo.
 *
 * Render 100% por pipeline clásico de NodeMaterial (map con degradado de
 * ALFA en canvas + material.opacity escalar + AdditiveBlending): sin nodos
 * por-fragmento (alphaNode/colorNode) que MeshBasicNodeMaterial no garantiza
 * entre backends, y sin point-sprites (gl_PointCoord no existe en WGSL).
 *
 *  - Cola iónica: envoltura cónica tenue + NÚCLEO interior brillante y fino,
 *    orientadas EXACTAMENTE anti-solar (viento solar: azul-cian).
 *  - Cola de polvo: 3 cintas (ribbons) curvadas hacia atrás de la
 *    trayectoria, billboardadas a cámara — abanico dorado con grosor.
 *  - Coma: doble sprite aditivo que crece con la actividad de sublimación.
 *
 * La actividad crece al acercarse al Sol (~línea de hielo 4,5 UA); las
 * longitudes usan la MISMA transformación de distancias que los planetas.
 */
import * as THREE from 'three/webgpu';
import { glowTexture } from './textures';
import { distanceTransform, type ScaleSnapshot } from '../core/scales';

/** Parámetros visuales por cometa. */
export interface CometFXOptions {
  colorIon: number;
  colorDust: number;
  /** Multiplicador de actividad (cometas grandes lucen más) */
  boost?: number;
}

/** Textura con fundido a lo largo (v=0 cabeza → v=1 punta) + estrías suaves. */
function tailTexture(streaky: boolean, w = 64, h = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const p1 = Math.random() * 10,
    p2 = Math.random() * 10,
    p3 = Math.random() * 10;
  for (let x = 0; x < w; x++) {
    const u = x / w;
    // variación transversal (rayos/estrías suaves)
    const colNoise = streaky
      ? 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(u * 31 + p1) * Math.cos(u * 13 + p2))
      : 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(u * 23 + p3));
    for (let y = 0; y < h; y++) {
      const v = y / h;
      // brillo en la cabeza, fundido hacia la punta; arranque suave junto al coma
      const lenFade = Math.pow(1 - v, 1.35) * Math.min(1, v * 6 + 0.3);
      // bordes transversales suaves (solo cintas)
      const edge = streaky ? 1 : Math.pow(Math.sin(Math.PI * u), 2.0);
      const a = Math.min(1, colNoise * lenFade * edge) * 255;
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false; // canvas y=0 → v=0 (cabeza)
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter; // sin mips: evita banding en ángulo
  return tex;
}

const DUST_SEG = 24;

function additiveTailMat(color: number, tex: THREE.Texture): THREE.MeshBasicNodeMaterial {
  return new THREE.MeshBasicNodeMaterial({
    color,
    map: tex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

export class CometFX {
  readonly coma: THREE.Sprite;
  readonly comaCore: THREE.Sprite;
  readonly ionBeam: THREE.Mesh;
  readonly ionBeamCore: THREE.Mesh;
  readonly dustRibbon: THREE.Mesh;
  readonly dustRibbon2: THREE.Mesh;
  readonly dustRibbon3: THREE.Mesh;
  private readonly dustPos: THREE.BufferAttribute;
  private readonly dustPos2: THREE.BufferAttribute;
  private readonly dustPos3: THREE.BufferAttribute;
  private readonly boost: number;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly p2 = new THREE.Vector3();
  private readonly curveV = new THREE.Vector3();

  constructor(opts: CometFXOptions) {
    this.boost = opts.boost ?? 1;

    // Haz iónico: envoltura + núcleo brillante
    const beamTex = tailTexture(true);
    this.ionBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 1, 1, 20, 1, true),
      additiveTailMat(opts.colorIon, beamTex)
    );
    this.ionBeamCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.45, 1, 14, 1, true),
      additiveTailMat(opts.colorIon, beamTex)
    );
    for (const m of [this.ionBeam, this.ionBeamCore]) {
      m.frustumCulled = false;
      m.visible = false;
    }

    // Cintas de polvo (3 capas) — geometría de strip dinámico compartida en forma
    const dustTex = tailTexture(false, 128, 256);
    const mkRibbon = (): [THREE.Mesh, THREE.BufferAttribute] => {
      const nVerts = (DUST_SEG + 1) * 2;
      const geo = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3);
      pos.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', pos);
      const uvs = new Float32Array(nVerts * 2);
      for (let i = 0; i <= DUST_SEG; i++) {
        const t = i / DUST_SEG;
        uvs[(i * 2) * 2] = 0;
        uvs[(i * 2) * 2 + 1] = t;
        uvs[(i * 2 + 1) * 2] = 1;
        uvs[(i * 2 + 1) * 2 + 1] = t;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      const idx: number[] = [];
      for (let i = 0; i < DUST_SEG; i++) {
        const a = i * 2,
          b = i * 2 + 1,
          c = i * 2 + 2,
          d = i * 2 + 3;
        idx.push(a, b, c, b, d, c);
      }
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, additiveTailMat(opts.colorDust, dustTex));
      mesh.frustumCulled = false;
      mesh.visible = false;
      return [mesh, pos];
    };
    [this.dustRibbon, this.dustPos] = mkRibbon();
    [this.dustRibbon2, this.dustPos2] = mkRibbon();
    [this.dustRibbon3, this.dustPos3] = mkRibbon();

    // Coma doble capa
    const comaMat = new THREE.SpriteNodeMaterial({
      map: glowTexture('rgba(206,236,255,0.55)', 'rgba(120,180,255,0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.coma = new THREE.Sprite(comaMat);
    this.coma.scale.setScalar(0.05);

    const comaCoreMat = new THREE.SpriteNodeMaterial({
      map: glowTexture('rgba(235,248,255,0.85)', 'rgba(160,210,255,0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.comaCore = new THREE.Sprite(comaCoreMat);
    this.comaCore.scale.setScalar(0.03);
  }

  /** Adjunta todos los efectos al grupo del cometa (local == mundo: el grupo solo se traslada). */
  attach(group: THREE.Group) {
    group.add(
      this.coma, this.comaCore, this.ionBeam, this.ionBeamCore,
      this.dustRibbon, this.dustRibbon2, this.dustRibbon3
    );
  }

  setVisible(v: boolean) {
    this.coma.visible = v;
    this.comaCore.visible = v;
    this.ionBeam.visible = v;
    this.ionBeamCore.visible = v;
    this.dustRibbon.visible = v;
    this.dustRibbon2.visible = v;
    this.dustRibbon3.visible = v;
  }

  /**
   * @param cameraRelPos  posición de la cámara RELATIVA al cometa (para billboard del polvo)
   * @param antiSolar     dirección unitaria Sol→cometa (la cola apunta así)
   * @param velocity      dirección unitaria de movimiento en escena
   * @param rAU           distancia heliocéntrica física real (UA)
   * @param timeSec       tiempo real transcurrido (respiración de las colas)
   */
  update(
    cameraRelPos: THREE.Vector3,
    antiSolar: THREE.Vector3,
    velocity: THREE.Vector3,
    rAU: number,
    s: ScaleSnapshot,
    timeSec: number
  ) {
    const act = Math.min(Math.pow(4.5 / Math.max(rAU, 0.05), 1.6) / 4.5, 1);
    const breathe = 0.9 + 0.1 * Math.sin(timeSec * 1.7 + this.phase);

    const tailAU = 0.9 * act * this.boost;
    const lenScene = Math.max(
      distanceTransform(rAU + tailAU, s) - distanceTransform(rAU, s),
      0
    );
    const showTails = act > 0.02 && lenScene > 0.001;

    const ionDir = this.tmp.copy(antiSolar).normalize();

    // --- Haz iónico: envoltura tenue + núcleo brillante ---
    this.ionBeam.visible = showTails;
    this.ionBeamCore.visible = showTails;
    if (showTails) {
      this.ionBeam.quaternion.setFromUnitVectors(this.yAxis, ionDir);
      this.ionBeam.position.copy(ionDir).multiplyScalar(lenScene * 0.5);
      const rHead = 0.032 * lenScene + 0.015;
      this.ionBeam.scale.set(rHead, lenScene, rHead);
      (this.ionBeam.material as THREE.MeshBasicNodeMaterial).opacity =
        Math.min(0.55, act * 0.7) * breathe;

      this.ionBeamCore.quaternion.copy(this.ionBeam.quaternion);
      this.ionBeamCore.position.copy(ionDir).multiplyScalar(lenScene * 0.46);
      const rCore = rHead * 0.42;
      this.ionBeamCore.scale.set(rCore, lenScene * 0.92, rCore);
      (this.ionBeamCore.material as THREE.MeshBasicNodeMaterial).opacity =
        Math.min(0.95, act * 1.15) * breathe;
    }

    // --- Abanico de polvo: 3 cintas curvadas y billboardadas ---
    for (const m of [this.dustRibbon, this.dustRibbon2, this.dustRibbon3]) m.visible = showTails;
    if (showTails) {
      const len = lenScene * 0.82;
      this.curveV.copy(velocity).multiplyScalar(-0.6);
      const dustDir = this.p1.copy(ionDir).addScaledVector(velocity, -0.72).normalize();
      const perp = this.p2.copy(cameraRelPos).cross(dustDir);
      if (perp.lengthSq() < 1e-6) perp.set(0, 1, 0).cross(dustDir);
      perp.normalize();

      const cA = Math.cos(0.45),
        sA = Math.sin(0.45);
      const crX = dustDir.y * perp.z - dustDir.z * perp.y;
      const crY = dustDir.z * perp.x - dustDir.x * perp.z;
      const crZ = dustDir.x * perp.y - dustDir.y * perp.x;

      const arrs = [
        this.dustPos.array as Float32Array,
        this.dustPos2.array as Float32Array,
        this.dustPos3.array as Float32Array
      ];
      // ejes y anchos por capa: central, +26° estrecha, −26° ancha y tenue
      const axes = [
        [perp.x, perp.y, perp.z],
        [perp.x * cA + crX * sA, perp.y * cA + crY * sA, perp.z * cA + crZ * sA],
        [perp.x * cA - crX * sA, perp.y * cA - crY * sA, perp.z * cA - crZ * sA]
      ];
      const widths = [1, 0.85, 1.3];

      for (let li = 0; li < 3; li++) {
        const [ax, ay, az] = axes[li];
        const wf = widths[li];
        const arr = arrs[li];
        for (let i = 0; i <= DUST_SEG; i++) {
          const t = i / DUST_SEG;
          const px = dustDir.x * (t * len) + this.curveV.x * (t * t * len * 0.75);
          const py = dustDir.y * (t * len) + this.curveV.y * (t * t * len * 0.75);
          const pz = dustDir.z * (t * len) + this.curveV.z * (t * t * len * 0.75);
          const halfW = (0.05 + 0.75 * t) * len * 0.11 * wf * breathe;
          const o = i * 6;
          arr[o] = px + ax * halfW;
          arr[o + 1] = py + ay * halfW;
          arr[o + 2] = pz + az * halfW;
          arr[o + 3] = px - ax * halfW;
          arr[o + 4] = py - ay * halfW;
          arr[o + 5] = pz - az * halfW;
        }
      }
      this.dustPos.needsUpdate = true;
      this.dustPos2.needsUpdate = true;
      this.dustPos3.needsUpdate = true;
      (this.dustRibbon.material as THREE.MeshBasicNodeMaterial).opacity = Math.min(0.6, act * 0.85) * breathe;
      (this.dustRibbon2.material as THREE.MeshBasicNodeMaterial).opacity = Math.min(0.42, act * 0.6) * breathe;
      (this.dustRibbon3.material as THREE.MeshBasicNodeMaterial).opacity = Math.min(0.28, act * 0.38) * breathe;
    }

    // Coma: crece con la actividad; nunca desaparece del todo
    const comaScale = (0.06 + 0.62 * act) * s.distanceScale;
    this.coma.scale.setScalar(Math.max(comaScale, 0.05));
    (this.coma.material as THREE.SpriteNodeMaterial).opacity = 0.22 + 0.68 * Math.min(act, 1);
    this.comaCore.scale.setScalar(Math.max(comaScale * 0.42, 0.03));
    (this.comaCore.material as THREE.SpriteNodeMaterial).opacity =
      (0.15 + 0.75 * Math.min(act, 1)) * breathe;
  }

  dispose() {
    this.ionBeam.geometry.dispose();
    this.ionBeamCore.geometry.dispose();
    this.dustRibbon.geometry.dispose();
    this.dustRibbon2.geometry.dispose();
    this.dustRibbon3.geometry.dispose();
  }
}
