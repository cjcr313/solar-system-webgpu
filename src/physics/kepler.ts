/**
 * Mecánica orbital kepleriana.
 *
 * Posiciones planetarias calculadas a partir de elementos orbitales keplerianos
 * reales (época J2000.0, aproximación de la tabla de E.V. Standish / JPL).
 * La ecuación de Kepler M = E - e·sin(E) se resuelve por iteración de
 * Newton-Raphson, y las coordenadas perifocales se rotan al plano eclíptico
 * mediante las matrices clásicas (ω, i, Ω).
 */

export interface OrbitalElements {
  /** Semieje mayor (UA) */
  a: number;
  /** Excentricidad */
  e: number;
  /** Inclinación (grados) */
  iDeg: number;
  /** Longitud del nodo ascendente Ω (grados) */
  OmegaDeg: number;
  /** Argumento del perihelio ω (grados) */
  omegaDeg: number;
  /** Anomalía media en J2000 (grados) */
  M0Deg: number;
  /** Período orbital (días) */
  periodDays: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;
/** Constante gravitacional gaussiana (rad/día) para a en UA: n = k · a^(-3/2) */
export const GAUSS_K = 0.01720209895;

export function solveKepler(M: number, e: number): number {
  // Inicializador E0 = π: convergencia global robusta para e < 0.8.
  // Para excentricidades cometarias (e > 0.8) Newton puede oscilar:
  // como f(E) = E − e·sinE − M es monótona creciente (f' ≥ 1−e > 0),
  // se verifica el residuo y se cae a bisección garantizada en [M−e, M+e].
  let E = Math.PI;
  for (let k = 0; k < 12; k++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  if (Math.abs(E - e * Math.sin(E) - M) > 1e-9) {
    // Bisección a prueba de todo: la raíz siempre está en [M−e, M+e]
    let lo = M - e;
    let hi = M + e;
    for (let k = 0; k < 64; k++) {
      const mid = (lo + hi) * 0.5;
      const f = mid - e * Math.sin(mid) - M;
      if (f < 0) lo = mid;
      else hi = mid;
    }
    E = (lo + hi) * 0.5;
  }
  return E;
}

export interface OrbitSampleOptions {
  /**
   * Transformación de distancia: recibe el radio en UA y devuelve el radio
   * de despliegue en unidades de escena (permite escalas real / didáctica).
   */
  distanceTransform?: (rAU: number) => number;
}

/** Coordenadas eclípticas → escena three.js (Y-up). */
function eclToScene(xE: number, yE: number, zE: number, out: Vec3): void {
  out.x = xE;
  out.y = zE;
  out.z = -yE;
}

/**
 * Posición heliocéntrica de un cuerpo en una fecha simulada.
 * @param days  Días transcurridos desde J2000.0 (1 ene 2000 12:00 TT). Puede ser negativo.
 */
export function orbitalPosition(
  el: OrbitalElements,
  days: number,
  out: Vec3 = { x: 0, y: 0, z: 0 },
  opt: OrbitSampleOptions = {}
): Vec3 {
  const M = el.M0Deg * DEG + TAU * (days / el.periodDays);
  const E = solveKepler(((M % TAU) + TAU) % TAU, el.e);

  const cosE = Math.cos(E);
  const sinE = Math.sin(E);

  // Coordenadas perifocales (plano orbital, foco en el Sol)
  const xp = el.a * (cosE - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * sinE;
  const rAU = Math.hypot(xp, yp);

  // Rotación ω (perifocal) → i → Ω (eclíptico)
  const w = el.omegaDeg * DEG;
  const i = el.iDeg * DEG;
  const O = el.OmegaDeg * DEG;
  const cw = Math.cos(w),
    sw = Math.sin(w);
  const ci = Math.cos(i),
    si = Math.sin(i);
  const cO = Math.cos(O),
    sO = Math.sin(O);

  const x1 = cw * xp - sw * yp;
  const y1 = sw * xp + cw * yp;

  const xE = cO * x1 - sO * ci * y1;
  const yE = sO * x1 + cO * ci * y1;
  const zE = si * y1;

  // Aplicar transformación de escala de distancia (modo real / didáctico)
  const f = opt.distanceTransform ? opt.distanceTransform(rAU) / (rAU || 1e-9) : 1;

  eclToScene(xE * f, yE * f, zE * f, out);
  return out;
}

/**
 * Muestrea la elipse orbital completa (para el trazado de órbitas).
 * Recorre la anomalía excéntrica de forma uniforme.
 */
export function sampleOrbit(
  el: OrbitalElements,
  segments = 256,
  opt: OrbitSampleOptions = {}
): Vec3[] {
  const pts: Vec3[] = [];
  const cw = Math.cos(el.omegaDeg * DEG),
    sw = Math.sin(el.omegaDeg * DEG);
  const ci = Math.cos(el.iDeg * DEG),
    si = Math.sin(el.iDeg * DEG);
  const cO = Math.cos(el.OmegaDeg * DEG),
    sO = Math.sin(el.OmegaDeg * DEG);
  const b = el.a * Math.sqrt(1 - el.e * el.e);

  for (let s = 0; s < segments; s++) {
    const E = (s / segments) * TAU;
    const xp = el.a * (Math.cos(E) - el.e);
    const yp = b * Math.sin(E);
    const rAU = Math.hypot(xp, yp);
    const f = opt.distanceTransform ? opt.distanceTransform(rAU) / (rAU || 1e-9) : 1;

    const x1 = cw * xp - sw * yp;
    const y1 = sw * xp + cw * yp;

    pts.push({
      x: (cO * x1 - sO * ci * y1) * f,
      y: si * y1 * f,
      z: -(sO * x1 + cO * ci * y1) * f
    });
  }
  return pts;
}

const AU_KM = 149_597_870.7;
const MU_SUN_KM3_S2 = 1.3271244e11;
const C_KM_S = 299_792.458;

export interface OrbitalTelemetry {
  rAU: number;
  distMKm: number;
  lightTimeSec: number;
  speedKmS: number;
}

/** Telemetría instantánea heliocéntrica (distancia, tiempo-luz y velocidad vis-viva). */
export function orbitalTelemetry(el: OrbitalElements, days: number): OrbitalTelemetry {
  const M = el.M0Deg * DEG + TAU * (days / el.periodDays);
  const E = solveKepler(((M % TAU) + TAU) % TAU, el.e);
  const xp = el.a * (Math.cos(E) - el.e);
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const rAU = Math.hypot(xp, yp);
  const rKm = rAU * AU_KM;
  const aKm = el.a * AU_KM;
  const speedKmS = Math.sqrt(Math.max(0, MU_SUN_KM3_S2 * (2 / rKm - 1 / aKm)));
  return {
    rAU,
    distMKm: rKm / 1e6,
    lightTimeSec: rKm / C_KM_S,
    speedKmS
  };
}

/** Posiciones de perihelio (E=0) y afelio (E=π) en coordenadas de escena. */
export function apsidesPositions(
  el: OrbitalElements,
  opt: OrbitSampleOptions = {}
): { perihelion: Vec3; aphelion: Vec3 } {
  const cw = Math.cos(el.omegaDeg * DEG),
    sw = Math.sin(el.omegaDeg * DEG);
  const ci = Math.cos(el.iDeg * DEG),
    si = Math.sin(el.iDeg * DEG);
  const cO = Math.cos(el.OmegaDeg * DEG),
    sO = Math.sin(el.OmegaDeg * DEG);

  const evalAt = (E: number): Vec3 => {
    const xp = el.a * (Math.cos(E) - el.e);
    const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const rAU = Math.hypot(xp, yp);
    const f = opt.distanceTransform ? opt.distanceTransform(rAU) / (rAU || 1e-9) : 1;
    const x1 = cw * xp - sw * yp;
    const y1 = sw * xp + cw * yp;
    const out: Vec3 = { x: 0, y: 0, z: 0 };
    eclToScene((cO * x1 - sO * ci * y1) * f, (sO * x1 + cO * ci * y1) * f, si * y1 * f, out);
    return out;
  };

  return {
    perihelion: evalAt(0),
    aphelion: evalAt(Math.PI)
  };
}
