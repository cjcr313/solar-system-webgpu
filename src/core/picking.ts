/**
 * picking.ts — Selección de cuerpos celestes por clic.
 *
 * Estrategia de raycasting en dos niveles:
 * 1. Cuerpos principales (planetas, lunas, Sol, asteroides destacados):
 *    intersección analítica rayo-esfera sobre posiciones mundo cacheadas,
 *    con radio efectivo mínimo (los planetas lejanos siguen siendo clickeables).
 * 2. Cinturones de asteroides (InstancedMesh animado en GPU): réplica CPU
 *    determinista de la misma matemática orbital del compute shader para
 *    encontrar la instancia más cercana al rayo en el momento del clic
 *    (resuelve el problema del raycasting clásico sobre buffers que viven
 *    en la GPU) → devuelve el instanceId real.
 */
import * as THREE from 'three/webgpu';

export interface PickableBody {
  id: string;
  getWorldPos(out: THREE.Vector3): THREE.Vector3;
  getVisualRadius(): number;
}

export interface PickableBelt {
  /** Devuelve {instanceId, distance} de la instancia más cercana al rayo, o null. */
  raycast(ray: THREE.Ray): { instanceId: number; distAlongRay: number } | null;
  bodyIdForInstance(instanceId: number): string | null;
}

export class Picker {
  private ray = new THREE.Ray();
  private ndc = new THREE.Vector2();
  private tmp = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private bodies: PickableBody[],
    private belts: PickableBelt[],
    private onSelect: (id: string, source: 'body' | 'belt') => void,
    private onDeselect: () => void
  ) {}

  pick(clientX: number, clientY: number, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.ray.origin.setFromMatrixPosition(this.camera.matrixWorld);
    this.ray.direction
      .set(this.ndc.x, this.ndc.y, 0.5)
      .unproject(this.camera)
      .sub(this.ray.origin)
      .normalize();

    // 1) Cuerpos principales (rayo-esfera con radio efectivo)
    let bestId: string | null = null;
    let bestT = Infinity;

    for (const b of this.bodies) {
      const c = b.getWorldPos(this.tmp);
      const t = this.raySphereT(this.ray, c, this.effectiveRadius(b, c));
      if (t !== null && t < bestT) {
        bestT = t;
        bestId = b.id;
      }
    }
    if (bestId) {
      this.onSelect(bestId, 'body');
      return;
    }

    // 2) Cinturones (picking por instancia en CPU)
    let bestBelt: PickableBelt | null = null;
    let bestInst = -1;
    let bestBeltT = Infinity;
    for (const belt of this.belts) {
      const hit = belt.raycast(this.ray);
      if (hit && hit.distAlongRay < bestBeltT) {
        bestBeltT = hit.distAlongRay;
        bestBelt = belt;
        bestInst = hit.instanceId;
      }
    }
    if (bestBelt) {
      const id = bestBelt.bodyIdForInstance(bestInst);
      if (id) {
        this.onSelect(id, 'belt');
        return;
      }
    }

    this.onDeselect();
  }

  private effectiveRadius(b: PickableBody, center: THREE.Vector3): number {
    const r = b.getVisualRadius();
    const dist = this.ray.origin.distanceTo(center);
    // Radio mínimo angular ~0.8° para clickear planetas lejanos/sub-píxel
    return Math.max(r, dist * 0.014);
  }

  /** Parámetro t de la primera intersección rayo-esfera, o null. */
  private raySphereT(ray: THREE.Ray, center: THREE.Vector3, radius: number): number | null {
    const oc = this.tmp2.set(0, 0, 0).copy(ray.origin).sub(center);
    const b = oc.dot(ray.direction);
    const c = oc.dot(oc) - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = -b - sq;
    const t2 = -b + sq;
    if (t1 > 0) return t1;
    if (t2 > 0) return t2;
    return null;
  }

  private tmp2 = new THREE.Vector3();
}
