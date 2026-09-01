/**
 * textures.ts — Texturas procedurales generadas en canvas 2D.
 *
 * Todo el arte del repo se genera en runtime (cero assets binarios):
 * planetas rocosos con cráteres, gigantes con bandas turbillonarias,
 * hielos moteados, anillos con divisiones y gradientes de resplandor.
 */
import * as THREE from 'three/webgpu';

/* ---------------- PRNG + ruido ---------------- */

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

function makeNoise2D(seed: number) {
  const perm = new Uint8Array(512);
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad = (hash: number, x: number, y: number) => {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

  return (x: number, y: number): number => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    const x1 = grad(aa, xf, yf) * (1 - u) + grad(ba, xf - 1, yf) * u;
    const x2 = grad(ab, xf, yf - 1) * (1 - u) + grad(bb, xf - 1, yf - 1) * u;
    return x1 * (1 - v) + x2 * v; // ≈ [-1, 1]
  };
}

function fbm(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/* ---------------- helpers ---------------- */

const cache = new Map<string, THREE.CanvasTexture>();

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mixHex(h1: string, h2: string, t: number): string {
  const p = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16)
  ];
  const [r1, g1, b1] = p(h1);
  const [r2, g2, b2] = p(h2);
  return `rgb(${Math.round(lerp(r1, r2, t))},${Math.round(lerp(g1, g2, t))},${Math.round(
    lerp(b1, b2, t)
  )})`;
}

/** Dibuja cráteres con sombreado direccional simple. */
function drawCraters(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  count: number,
  minR: number,
  maxR: number,
  seed: number,
  shade = 'rgba(0,0,0,0.35)'
) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = minR + rnd() * rnd() * (maxR - minR);
    // halo claro
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.stroke();
    // sombra interior (offset)
    ctx.beginPath();
    ctx.arc(x + r * 0.12, y + r * 0.12, r * 0.78, 0, Math.PI * 2);
    ctx.fillStyle = shade;
    ctx.fill();
  }
}

/* ---------------- Generadores por cuerpo ---------------- */

function genSun(): HTMLCanvasElement {
  const W = 1024,
    H = 512;
  const { c, ctx } = makeCanvas(W, H);
  const n = makeNoise2D(777);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = fbm(n, (x / W) * 18, (y / H) * 9, 5) * 0.5 + 0.5;
      const cell = Math.pow(v, 1.6);
      const r = Math.round(255 * Math.min(1, 0.75 + cell * 0.35));
      const g = Math.round(lerp(150, 220, cell));
      const b = Math.round(lerp(30, 90, cell * cell));
      const i = (y * W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function genRocky(
  base: string,
  dark: string,
  light: string,
  seed: number,
  craters: number,
  polarCaps = false
): HTMLCanvasElement {
  const W = 1024,
    H = 512;
  const { c, ctx } = makeCanvas(W, H);
  const n = makeNoise2D(seed);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const lat = Math.abs(y / H - 0.5) * 2; // 0 ecuador → 1 polos
    for (let x = 0; x < W; x++) {
      const v = fbm(n, (x / W) * 10, (y / H) * 5, 5) * 0.5 + 0.5;
      let col = v < 0.45 ? mixHex(dark, base, v / 0.45) : mixHex(base, light, (v - 0.45) / 0.55);
      if (polarCaps && lat > 0.78) {
        const capT = Math.min(1, (lat - 0.78) / 0.18) * (0.65 + v * 0.35);
        col = mixHex(col, '#e8f2f8', capT);
      }
      const m = col.match(/\d+/g)!;
      const i = (y * W + x) * 4;
      img.data[i] = +m[0];
      img.data[i + 1] = +m[1];
      img.data[i + 2] = +m[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (craters > 0) drawCraters(ctx, W, H, craters, 2, 26, seed + 9);
  return c;
}

function genBanded(
  palette: string[],
  seed: number,
  bandFreq = 26,
  turbulence = 0.35,
  spot?: { x: number; y: number; rx: number; ry: number; color: string }
): HTMLCanvasElement {
  const W = 1024,
    H = 512;
  const { c, ctx } = makeCanvas(W, H);
  const n = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 55);
  const img = ctx.createImageData(W, H);
  const P = palette.length;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const warp = fbm(n, (x / W) * 6, (y / H) * 3, 4) * turbulence;
      const t = (y / H) * bandFreq + warp * bandFreq * 0.35;
      const idx = Math.floor(((t % P) + P) % P);
      const idx2 = (idx + 1) % P;
      const frac = t - Math.floor(t);
      let col = mixHex(palette[idx], palette[idx2], Math.min(1, frac * 1.6));
      const fine = fbm(n2, (x / W) * 14, (y / H) * 7, 3) * 0.5 + 0.5;
      col = mixHex(col, fine > 0.62 ? '#ffffff' : '#000000', Math.abs(fine - 0.5) * 0.12);
      if (spot) {
        const dx = (x / W - spot.x) * 2; // elipse
        const dy = (y / H - spot.y) * 2;
        const d = Math.sqrt((dx / spot.rx) ** 2 + (dy / spot.ry) ** 2);
        if (d < 1.25) col = mixHex(spot.color, col, Math.max(0, (d - 0.75) / 0.5));
      }
      const m = col.match(/\d+/g)!;
      const i = (y * W + x) * 4;
      img.data[i] = +m[0];
      img.data[i + 1] = +m[1];
      img.data[i + 2] = +m[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function genEarth(): HTMLCanvasElement {
  const W = 1024,
    H = 512;
  const { c, ctx } = makeCanvas(W, H);
  const n = makeNoise2D(42);
  const n2 = makeNoise2D(1337);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const lat = Math.abs(y / H - 0.5) * 2;
    for (let x = 0; x < W; x++) {
      // continentes: fbm umbralizado (equirect)
      const e = fbm(n, (x / W) * 8, (y / H) * 4, 6) * 0.5 + 0.5;
      const detail = fbm(n2, (x / W) * 16, (y / H) * 8, 4) * 0.5 + 0.5;
      const elev = e * 0.75 + detail * 0.25;
      let col: string;
      if (elev < 0.47) {
        // océano con profundidad
        col = mixHex('#0a2d5c', '#155a8a', elev / 0.47);
      } else if (elev < 0.5) {
        col = '#2d7a5a'; // costa
      } else if (elev < 0.62) {
        col = mixHex('#2f7a3f', '#6a8f3f', (elev - 0.5) / 0.12);
      } else if (elev < 0.72) {
        col = mixHex('#6a8f3f', '#8f7a4f', (elev - 0.62) / 0.1);
      } else {
        col = mixHex('#8f7a4f', '#b5a878', (elev - 0.72) / 0.28);
      }
      // hielo polar
      if (lat > 0.82) {
        col = mixHex(col, '#f0f6fa', Math.min(1, (lat - 0.82) / 0.14));
      }
      // nubes
      const cl = fbm(n2, (x / W) * 7 + 40, (y / H) * 3.5, 4) * 0.5 + 0.5;
      if (cl > 0.58) col = mixHex(col, '#ffffff', Math.min(1, (cl - 0.58) / 0.18) * 0.85);
      const m = col.match(/\d+/g)!;
      const i = (y * W + x) * 4;
      img.data[i] = +m[0];
      img.data[i + 1] = +m[1];
      img.data[i + 2] = +m[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function genVenus(): HTMLCanvasElement {
  return genBanded(
    ['#d8b06a', '#e8cc8c', '#c99a4f', '#e0bb75', '#d0a75e', '#edd9a8'],
    909,
    9,
    0.55,
    undefined
  );
}

/** Textura radial de anillos: 1D → canvas 1024×2 (uv.x = radio). */
function genRings(): HTMLCanvasElement {
  const W = 1024;
  const { c, ctx } = makeCanvas(W, 2);
  const n = makeNoise2D(31415);
  const img = ctx.createImageData(W, 2);
  for (let x = 0; x < W; x++) {
    const t = x / W;
    const grain = fbm(n, t * 60, 0.5, 4) * 0.5 + 0.5;
    let alpha: number;
    let col: string;
    // estructura de anillos de Saturno (C→B→división Cassini→A→F tenue)
    if (t < 0.12) {
      alpha = 0.12 + t * 1.2; // anillo C tenue
      col = '#a89880';
    } else if (t < 0.5) {
      alpha = 0.85 + grain * 0.15; // anillo B denso
      col = mixHex('#d8c8a8', '#efe4c8', grain);
    } else if (t < 0.56) {
      alpha = 0.12; // división de Cassini
      col = '#887860';
    } else if (t < 0.86) {
      alpha = 0.65 + grain * 0.2; // anillo A
      col = mixHex('#c8b890', '#e8dcc0', grain);
    } else if (t < 0.895) {
      alpha = 0.05; // división de Encke
      col = '#887860';
    } else {
      alpha = Math.max(0, 0.35 - (t - 0.9) * 2.5); // borde exterior / F
      col = '#b8a888';
    }
    const m = col.match(/\d+/g)!;
    for (const row of [0, 1]) {
      const i = (row * W + x) * 4;
      img.data[i] = +m[0];
      img.data[i + 1] = +m[1];
      img.data[i + 2] = +m[2];
      img.data[i + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Sprite de resplandor (gradiente radial). */
export function glowTexture(inner: string, outer: string, size = 256): THREE.CanvasTexture {
  const { c, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- API pública ---------------- */

export type TextureKind =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'moon'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto'
  | 'ice'
  | 'rock';

export async function getBodyTexture(kind: TextureKind): Promise<THREE.CanvasTexture> {
  const hit = cache.get(kind);
  if (hit) return hit;
  // ceder el hilo para que el loading respire
  await new Promise((r) => requestAnimationFrame(r));
  let canvas: HTMLCanvasElement;
  switch (kind) {
    case 'sun':
      canvas = genSun();
      break;
    case 'mercury':
      canvas = genRocky('#8a8a8a', '#4a4a4e', '#b8b8b8', 11, 340);
      break;
    case 'venus':
      canvas = genVenus();
      break;
    case 'earth':
      canvas = genEarth();
      break;
    case 'moon':
      canvas = genRocky('#9a9a98', '#5c5c5a', '#c8c8c4', 22, 420);
      break;
    case 'mars':
      canvas = genRocky('#b5673a', '#6e3a20', '#d8905f', 33, 160, true);
      break;
    case 'jupiter':
      canvas = genBanded(
        [
          '#c9a06b', '#e8d5b0', '#a8784f', '#e0c898', '#8f6242',
          '#decba4', '#b08858', '#e8dcb8', '#9a7048', '#d0b088',
          '#c9a06b', '#e8d5b0'
        ],
        44,
        30,
        0.4,
        { x: 0.68, y: 0.63, rx: 0.09, ry: 0.05, color: '#c06848' }
      );
      break;
    case 'saturn':
      canvas = genBanded(
        ['#d8c496', '#e8dab0', '#c8b080', '#e0d0a0', '#d0bc8c', '#eddfb8'],
        55,
        16,
        0.18
      );
      break;
    case 'uranus':
      canvas = genBanded(['#a8dde3', '#b8e4e8', '#9cd4dc', '#b0dfe4'], 66, 6, 0.1);
      break;
    case 'neptune':
      canvas = genBanded(
        ['#3d68c4', '#4f7bd9', '#3558a8', '#4a72cc', '#5d8ae0'],
        77,
        8,
        0.22,
        { x: 0.3, y: 0.66, rx: 0.08, ry: 0.045, color: '#28407a' }
      );
      break;
    case 'pluto':
      canvas = genRocky('#c9b295', '#7a6448', '#e8dcc8', 88, 90, true);
      break;
    case 'ice':
      canvas = genRocky('#dce8ee', '#a8bcc8', '#f4fafc', 99, 120);
      break;
    case 'rock':
    default:
      canvas = genRocky('#8a7d6e', '#4f463c', '#b8ac9c', 111, 260);
      break;
  }
  const tex = toTexture(canvas);
  cache.set(kind, tex);
  return tex;
}

let ringTex: THREE.CanvasTexture | null = null;
export async function getRingTexture(): Promise<THREE.CanvasTexture> {
  if (ringTex) return ringTex;
  await new Promise((r) => requestAnimationFrame(r));
  ringTex = toTexture(genRings());
  return ringTex;
}
