/**
 * Comets.ts — Efectos cometarios: coma + cola iónica + cola de polvo.
 *
 * Arquitectura basada en MALLAS con texturas degradadas (no point-sprites:
 * gl_PointCoord no existe en WGSL y los sprites de puntos son frágiles entre
 * backends):
 *
 *  - Cola iónica: haz cónico aditivo con textura de estrías, orientado
 *    EXACTAMENTE anti-solar (viento solar barriendo iones: azul-cian).
 *  - Cola de polvo: cinta (ribbon) curvada hacia atrás de la trayectoria,
 *    reconstruida cada frame (25 segmentos) y billboardada a cámara —
 *    los granos pesados quedan rezagados por inercia: dorada y curva.
 *  - Coma: sprite aditivo que crece con la actividad de sublimación.
 *
 * La actividad crece al acercarse al Sol (sublimación de hielos, ~línea de
 * hielo 4,5 UA) y las longitudes se convierten a unidades de escena con la
 * MISMA transformación de distancias que los planetas (coherente en modo
 * real y didáctico).
 */
import * as THREE from 'three/webgpu';
import { uniform, uv, texture, normalView, positionViewDirection } from 'three/tsl';
import { glowTexture } from './textures';
import { distanceTransform, type ScaleSnapshot } from '../core/scales';

/** Parámetros visuales por cometa. */
export interface CometFXOptions {
  colorIon: number;
  colorDust: number;
  /** Multiplicador de actividad (cometas grandes lucen más) */
  boost?: number;
}

/** Textura de estrías (columnas de ruido × fundido a lo largo) para el haz. */
function streakTexture(w = 64, h = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  // ruido de columna suave (dos senos de fases aleatorias)
  const p1 = Math.random() * 10,
    p2 = Math.random() * 10;
  for (let x = 0; x < w; x++) {
    const u = x / w;
    // rayos iónicos sutiles alrededor de la circunferencia (u = ángulo)
    const colNoise =
      0.6 + 0.4 * (0.5 + 0.5 * Math.sin(u * 37 + p1) * Math.cos(u * 17 + p2));
    for (let y = 0; y < h; y++) {
      const v = y / h; // v=0 base (cabeza) → v=1 punta
      const lenFade = Math.pow(1 - v, 1.4) * Math.min(1, v * 6 + 0.25);
      const a = Math.min(1, colNoise * lenFade) * 255;
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false; // canvas y=0 → v=0 (cabeza) sin voltear
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Textura de abanico de polvo: estrías anchas + fundido radial. */
function dustTexture(w = 128, h = 256): THREE.CanvasTexture {
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
    const colNoise =
      0.4 +
      0.6 *
        (0.5 + 0.5 * Math.sin(u * 23 + p1) * Math.cos(u * 11 + p2)) *
        (0.6 + 0.4 * Math.sin(u * 53 + p3));
    for (let y = 0; y < h; y++) {
      const v = y / h;
      const lenFade = Math.pow(1 - v, 1.2) * Math.min(1, v * 10 + 0.2);
      const edgeFade = Math.pow(Math.sin(Math.PI * u), 1.4); // bordes suaves
      const a = Math.min(1, colNoise * lenFade * edgeFade) * 255;
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

const DUST_SEG = 24;

export class CometFX {
  readonly coma: THREE.Sprite;
  readonly comaCore: THREE.Sprite;
  readonly ionBeam: THREE.Mesh;
  readonly dustRibbon: THREE.Mesh;
  readonly dustRibbon2: THREE.Mesh;
  private readonly dustPos: THREE.BufferAttribute;
  private readonly dustPos2: THREE.BufferAttribute;
  private readonly uBeamOp = uniform(0);
  private readonly uDustOp = uniform(0);
  private readonly uDustOp2 = uniform(0);
  private readonly boost: number;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly tmp = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly p2 = new THREE.Vector3();
  private readonly curveV = new THREE.Vector3();

  constructor(opts: CometFXOptions) {
    this.boost = opts.boost ?? 1;

    // Haz iónico: cono con estrías + fresnel volumétrico
    // (alfa ∝ |dot(N,V)|: centro luminoso, silueta desvanecida = columna de gas)
    const beamGeo = new THREE.CylinderGeometry(0.012, 1, 1, 20, 1, true);
    const beamTex = streakTexture();
    const beamMat = new THREE.MeshBasicNodeMaterial({
      color: opts.colorIon,
      map: beamTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const fresnel = normalView
      .normalize()
      .dot(positionViewDirection.normalize())
      .abs()
      .pow(1.7);
    // alphaNode existe en runtime (NodeMaterial base) pero no en todos los typings
    (beamMat as unknown as { alphaNode: unknown }).alphaNode = texture(beamTex, uv())
      .a.mul(fresnel)
      .mul(this.uBeamOp);
    this.ionBeam = new THREE.Mesh(beamGeo, beamMat);
    this.ionBeam.frustumCulled = false;
    this.ionBeam.visible = false;

    // Cinta de polvo: strip dinámico billboardado
    const nVerts = (DUST_SEG + 1) * 2;
    const geo = new THREE.BufferGeometry();
    this.dustPos = new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3);
    this.dustPos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.dustPos);
    const uvs = new Float32Array(nVerts * 2);
    for (let i = 0; i <= DUST_SEG; i++) {
      const t = i / DUST_SEG;
      uvs[(i * 2) * 2 + 0] = 0;
      uvs[(i * 2) * 2 + 1] = t;
      uvs[(i * 2 + 1) * 2 + 0] = 1;
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
    const dustTex = dustTexture();
    const dustMat = new THREE.MeshBasicNodeMaterial({
      color: opts.colorDust,
      map: dustTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    (dustMat as unknown as { alphaNode: unknown }).alphaNode = texture(dustTex, uv()).a.mul(
      this.uDustOp
    );
    this.dustRibbon = new THREE.Mesh(geo, dustMat);
    this.dustRibbon.frustumCulled = false;
    this.dustRibbon.visible = false;

    // segunda capa torcida: abanico con "grosor" (volumen fake)
    const geo2 = geo.clone();
    this.dustPos2 = geo2.getAttribute('position') as THREE.BufferAttribute;
    this.dustPos2.setUsage(THREE.DynamicDrawUsage);
    const dustMat2 = new THREE.MeshBasicNodeMaterial({
      color: opts.colorDust,
      map: dustTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    (dustMat2 as unknown as { alphaNode: unknown }).alphaNode = texture(dustTex, uv()).a.mul(
      this.uDustOp2
    );
    this.dustRibbon2 = new THREE.Mesh(geo2, dustMat2);
    this.dustRibbon2.frustumCulled = false;
    this.dustRibbon2.visible = false;

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
    group.add(this.coma, this.comaCore, this.ionBeam, this.dustRibbon, this.dustRibbon2);
  }

  setVisible(v: boolean) {
    this.coma.visible = v;
    this.comaCore.visible = v;
    this.ionBeam.visible = v;
    this.dustRibbon.visible = v;
    this.dustRibbon2.visible = v;
  }

  /**
   * @param cameraRelPos  posición de la cámara RELATIVA al cometa (espacio local del grupo; para el billboard del polvo)
   * @param antiSolar     dirección unitaria Sol→cometa en escena (la cola apunta así)
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
    // Actividad por sublimación: se enciende dentro de ~4,5 UA (línea de
    // hielo), plena potencia cerca del perihelio.
    const act = Math.min(Math.pow(4.5 / Math.max(rAU, 0.05), 1.6) / 4.5, 1);
    const breathe = 0.9 + 0.1 * Math.sin(timeSec * 1.7 + this.phase);

    // Longitud física de cola (UA) → unidades de escena con la MISMA
    // transformación de distancias del resto de la simulación.
    const tailAU = 0.9 * act * this.boost;
    const lenScene = Math.max(
      distanceTransform(rAU + tailAU, s) - distanceTransform(rAU, s),
      0
    );
    const showTails = act > 0.02 && lenScene > 0.001;

    const ionDir = this.tmp.copy(antiSolar).normalize();

    // --- Haz iónico (suave, continuo, exactamente anti-solar) ---
    this.ionBeam.visible = showTails;
    if (showTails) {
      this.ionBeam.quaternion.setFromUnitVectors(this.yAxis, ionDir);
      this.ionBeam.position.copy(ionDir).multiplyScalar(lenScene * 0.5);
      const rHead = 0.032 * lenScene + 0.015;
      this.ionBeam.scale.set(rHead, lenScene, rHead);
      this.uBeamOp.value = Math.min(0.9, act * 1.05) * breathe;
    }

    // --- Cinta de polvo (curvada contra la trayectoria, billboardada) ---
    this.dustRibbon.visible = showTails;
    this.dustRibbon2.visible = showTails;
    if (showTails) {
      const len = lenScene * 0.8;
      this.curveV.copy(velocity).multiplyScalar(-0.5); // deriva hacia atrás
      const dustDir = this.p1.copy(ionDir).addScaledVector(velocity, -0.5).normalize();
      // billboard: eje perpendicular a (dirección de la cinta, línea de visión)
      // en espacio local el cometa está en el origen → cámaraRelPos es el vector de vista
      const perp = this.p2.copy(cameraRelPos).cross(dustDir);
      if (perp.lengthSq() < 1e-6) perp.set(0, 1, 0).cross(dustDir);
      perp.normalize();

      // eje de la 2ª capa: perp rotado 26° alrededor de la dirección del polvo
      const cA = Math.cos(0.45),
        sA = Math.sin(0.45);
      const perp2x = perp.x * cA + (dustDir.y * perp.z - dustDir.z * perp.y) * sA;
      const perp2y = perp.y * cA + (dustDir.z * perp.x - dustDir.x * perp.z) * sA;
      const perp2z = perp.z * cA + (dustDir.x * perp.y - dustDir.y * perp.x) * sA;

      const arr = this.dustPos.array as Float32Array;
      const arr2 = this.dustPos2.array as Float32Array;
      for (let i = 0; i <= DUST_SEG; i++) {
        const t = i / DUST_SEG;
        // curva cuadrática: recta + deriva inercial creciente
        const px = dustDir.x * (t * len) + this.curveV.x * (t * t * len * 0.6);
        const py = dustDir.y * (t * len) + this.curveV.y * (t * t * len * 0.6);
        const pz = dustDir.z * (t * len) + this.curveV.z * (t * t * len * 0.6);
        const halfW = (0.05 + 0.75 * t) * len * 0.11 * breathe;
        const o = i * 6;
        arr[o] = px + perp.x * halfW;
        arr[o + 1] = py + perp.y * halfW;
        arr[o + 2] = pz + perp.z * halfW;
        arr[o + 3] = px - perp.x * halfW;
        arr[o + 4] = py - perp.y * halfW;
        arr[o + 5] = pz - perp.z * halfW;
        const w2 = halfW * 0.85;
        arr2[o] = px + perp2x * w2;
        arr2[o + 1] = py + perp2y * w2;
        arr2[o + 2] = pz + perp2z * w2;
        arr2[o + 3] = px - perp2x * w2;
        arr2[o + 4] = py - perp2y * w2;
        arr2[o + 5] = pz - perp2z * w2;
      }
      this.dustPos.needsUpdate = true;
      this.dustPos2.needsUpdate = true;
      this.uDustOp.value = Math.min(0.62, act * 0.9) * breathe;
      this.uDustOp2.value = Math.min(0.45, act * 0.65) * breathe;
    }

    // Coma: brillo y tamaño crecen con la actividad; nunca desaparece del
    // todo (el cometa inactivo se ve como un punto tenue).
    const comaScale = (0.06 + 0.62 * act) * s.distanceScale;
    this.coma.scale.setScalar(Math.max(comaScale, 0.05));
    (this.coma.material as THREE.SpriteNodeMaterial).opacity = 0.22 + 0.68 * Math.min(act, 1);
    this.comaCore.scale.setScalar(Math.max(comaScale * 0.42, 0.03));
    (this.comaCore.material as THREE.SpriteNodeMaterial).opacity =
      (0.15 + 0.75 * Math.min(act, 1)) * breathe;
  }

  dispose() {
    this.ionBeam.geometry.dispose();
    this.dustRibbon.geometry.dispose();
    this.dustRibbon2.geometry.dispose();
  }
}
