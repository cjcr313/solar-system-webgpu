/**
 * Orbits.ts — Trazado de trayectorias orbitales.
 *
 * - Planetas: elipses keplerianas muestreadas por anomalía excéntrica,
 *   atravesadas por la misma transformación de distancia que la posición
 *   (para que la órbita toque exactamente al planeta en cualquier escala).
 * - Lunas: círculos unitarios escalables (regeneración cero).
 */
import * as THREE from 'three/webgpu';
import { sampleOrbit, type OrbitalElements } from '../physics/kepler';
import { distanceTransform, type ScaleSnapshot } from '../core/scales';

export class PlanetOrbitLine {
  readonly line: THREE.Line;
  private el: OrbitalElements;
  private scale: ScaleSnapshot;
  private readonly SEGMENTS = 320;

  constructor(el: OrbitalElements, color: number, scale: ScaleSnapshot) {
    this.el = el;
    this.scale = scale;
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicNodeMaterial({
      color,
      transparent: true,
      opacity: 0.32
    });
    this.line = new THREE.Line(geom, mat);
    this.line.frustumCulled = false;
    this.rebuild(scale);
  }

  rebuild(scale: ScaleSnapshot) {
    this.scale = scale;
    const pts = sampleOrbit(this.el, this.SEGMENTS, {
      distanceTransform: (rAU) => distanceTransform(rAU, this.scale)
    });
    // cerrar la polilínea (Line no cierra solo, LineLoop no está soportado)
    pts.push({ ...pts[0] });
    const arr = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => {
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    });
    this.line.geometry.dispose();
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.line.geometry = geom;
  }

  setOpacity(o: number) {
    (this.line.material as THREE.LineBasicNodeMaterial).opacity = o;
  }

  dispose() {
    this.line.geometry.dispose();
  }
}

/** Círculo unitario (radio 1) que se escala según la órbita lunar visual. */
export function makeUnitCircle(color: number, opacity = 0.22): THREE.Line {
  const SEG = 160;
  const pts: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    pts.push(Math.cos(a), 0, Math.sin(a));
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  const mat = new THREE.LineBasicNodeMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geom, mat);
  line.frustumCulled = false;
  return line;
}
