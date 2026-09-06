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
 *
 * Modo real: la órbita escala por el MISMO multiplicador de tamaños (sizeScale),
 * de modo que la proporción distancia/radio del planeta sea exactamente la
 * real (la Luna está a ~60 radios terrestres). Sin esto, con cuerpos
 * agrandados ×N la Luna quedaría pegada al planeta (60/N radios visuales).
 * Se aplica un mínimo de 1.45 × radio visual del padre como salvaguarda.
 *
 * Modo didáctico: radio armónico con el planeta (documentado como aproximado).
 */
export function moonOrbitRadius(
  orbitKm: number,
  parentVisualRadius: number,
  s: ScaleSnapshot
): { radius: number; clamped: boolean } {
  const min = parentVisualRadius * 1.45;
  if (s.mode === 'real') {
    const scaled = (orbitKm / AU_KM) * AU_TO_UNITS * s.distanceScale * s.sizeScale;
    return scaled < min ? { radius: min, clamped: true } : { radius: scaled, clamped: false };
  }
  // Didáctico: se escala con el radio visual del padre para armonía visual
  const approx = (orbitKm / AU_KM) * AU_TO_UNITS * s.distanceScale;
  return { radius: Math.max(min, parentVisualRadius * 2 + approx * 0.02), clamped: true };
}
