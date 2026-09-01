/**
 * cameraRig.ts — Cámara orbital propia con:
 * - Órbita libre (arrastre), zoom exponencial (rueda), paneo (botón derecho / 2 dedos).
 * - Enfoque cinematográfico (Lerp) sobre cuerpos en movimiento: la cámara
 *   sigue la traslación del cuerpo bloqueado (focus/lock).
 * - Amortiguación (damping) para suavidad.
 */
import * as THREE from 'three/webgpu';

export interface FocusTarget {
  /** Posición mundo del cuerpo a seguir (se consulta cada frame). */
  getPos(out: THREE.Vector3): THREE.Vector3;
  /** Radio visual del cuerpo (para distancia de encuadre). */
  getRadius(): number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private theta = 0.9; // azimut
  private phi = 1.05; // polar (0 = polo norte)
  private radius = 110;
  private tTheta = 0.9;
  private tPhi = 1.05;
  private tRadius = 110;

  private target = new THREE.Vector3(0, 0, 0);
  private tTarget = new THREE.Vector3(0, 0, 0);

  private follow: FocusTarget | null = null;
  private focusBlend = 0; // 0→1 transición
  private baseFollowRadius = 0;

  private dragging: 'orbit' | 'pan' | null = null;
  private lastX = 0;
  private lastY = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.05, 400_000);
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e, canvas));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ---------------- Entrada ---------------- */

  private onPointerDown(e: PointerEvent, canvas: HTMLCanvasElement) {
    canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.dragging = null;
      return;
    }
    this.dragging = e.button === 2 || e.shiftKey ? 'pan' : 'orbit';
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0) {
        const factor = this.pinchDist / Math.max(d, 1);
        this.tRadius = THREE.MathUtils.clamp(this.tRadius * factor, 0.5, 200_000);
      }
      this.pinchDist = d;
      return;
    }

    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (this.dragging === 'orbit') {
      this.tTheta -= dx * 0.005;
      this.tPhi = THREE.MathUtils.clamp(this.tPhi - dy * 0.005, 0.05, Math.PI - 0.05);
    } else {
      // Paneo en el plano de la cámara
      const scale = this.radius * 0.0012;
      const right = this.tmp.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const up = this.tmp2.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.tTarget.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
      this.follow = null; // el paneo libera el seguimiento
    }
  }

  private onPointerUp(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (this.pointers.size === 0) this.dragging = null;
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.0012);
    this.tRadius = THREE.MathUtils.clamp(this.tRadius * factor, 0.5, 200_000);
  }

  /* ---------------- API ---------------- */

  /** Enfoca y bloquea la cámara sobre un cuerpo en movimiento. */
  focusOn(target: FocusTarget, distanceMult = 4.5) {
    this.follow = target;
    this.focusBlend = 0;
    this.baseFollowRadius = target.getRadius() * distanceMult;
    this.tRadius = Math.max(this.baseFollowRadius, target.getRadius() * 2.2);
  }

  releaseFollow() {
    this.follow = null;
  }

  get isFollowing() {
    return this.follow !== null;
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------- Frame ---------------- */

  update(dt: number) {
    const k = 1 - Math.exp(-dt * 7.5); // amortiguación exponencial

    if (this.follow) {
      const p = this.follow.getPos(this.tmp2);
      this.focusBlend = Math.min(1, this.focusBlend + dt * 0.9);
      const blend = 1 - Math.pow(1 - this.focusBlend, 3); // easeOutCubic
      this.tTarget.lerp(p, Math.min(1, blend * 0.6 + 0.12));
      // mantener una distancia razonable si el cuerpo cambió de tamaño
      const want = Math.max(this.baseFollowRadius, this.follow.getRadius() * 2.0);
      this.tRadius = Math.max(this.tRadius, want);
    }

    this.target.lerp(this.tTarget, k);
    this.theta += (this.tTheta - this.theta) * k;
    this.phi += (this.tPhi - this.phi) * k;
    this.radius += (this.tRadius - this.radius) * k;

    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sp * Math.cos(this.theta)
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
}
