/**
 * scales.ts — Sistema de escalas real / didáctica.
 *
 * Unidades de escena: 1 UA = 10 unidades (modo real).
 * En modo didáctico la distancia se comprime con raíz cuadrada
 * (r' = 10·√r) y los tamaños usan una progresión comprimida, para
 * encuadrar todo el sistema sin perder visibilidad.
 */
import type { DistanceMode } from './store';

export const AU_KM = 149_597_870.7;
export const AU_TO_UNITS = 10;

export interface ScaleSnapshot {
  mode: DistanceMode;
  distanceScale: number;
  sizeScale: number;
}

/** Radio orbital (UA) → unidades de escena. */
export function distanceTransform(rAU: number, s: ScaleSnapshot): number {
  if (s.mode === 'real') return rAU * AU_TO_UNITS * s.distanceScale;
  return 10 * Math.sqrt(rAU) * s.distanceScale;
}

/** Radio de un cuerpo (km) → unidades de escena. */
export function bodyRadius(radiusKm: number, s: ScaleSnapshot): number {
  const realUnits = (radiusKm / AU_KM) * AU_TO_UNITS;
  if (s.mode === 'real') {
    return realUnits * s.sizeScale;
  }
  // Didáctico: progresión comprimida (la Tierra ≈ 0.32 unidades × sizeScale)
  const rel = radiusKm / 6371;
  return 0.32 * Math.pow(rel, 0.42) * s.sizeScale;
}

/**
 * Radio orbital de una luna alrededor de su planeta (unidades de escena).
 * En modo real respeta la distancia real, pero garantiza un mínimo de
 * 1.45 × radio visual del padre (si no, las lunas quedan dentro del
 * planeta agrandado). Se marca como "aprox" en la órbita cuando aplica el clamp.
 */
export function moonOrbitRadius(
  orbitKm: number,
  parentVisualRadius: number,
  s: ScaleSnapshot
): { radius: number; clamped: boolean } {
  const real = (orbitKm / AU_KM) * AU_TO_UNITS * s.distanceScale;
  const min = parentVisualRadius * 1.45;
  if (s.mode === 'didactic') {
    // En didáctico se escala con el radio visual del padre para armonía visual
    return { radius: Math.max(min, parentVisualRadius * 2 + real * 0.02), clamped: true };
  }
  return real < min ? { radius: min, clamped: true } : { radius: real, clamped: false };
}
