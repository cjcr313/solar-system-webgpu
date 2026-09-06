/**
 * Cutaway.ts — Corte transversal animado del interior de los cuerpos.
 *
 * El efecto: la esfera del planeta se “abre” — una mitad texturizada permanece,
 * la otra se desvanece deslizándose, y en el plano central aparece un disco con
 * los anillos concéntricos de las capas internas (generados desde los datos
 * científicos de `structure`). Cada capa tiene una etiqueta con flecha que se
 * puede expandir para leer su descripción.
 */
import * as THREE from 'three/webgpu';
import type { CelestialBody, LayerInfo } from '../data/celestialData';

/* ---------------------------------------------------------------
 * Textura del disco de corte: anillos concéntricos por capa
 * -------------------------------------------------------------- */

export function makeLayerDiskTexture(body: CelestialBody): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const cx = S / 2,
    cy = S / 2,
    R = S / 2 - 6;

  // structure viene del centro (núcleo) a la superficie: pintar de afuera hacia adentro
  const layers = [...body.structure].reverse();
  const total = layers.reduce((s, l) => s + l.pct, 0) || 100;

  ctx.clearRect(0, 0, S, S);
  let rOuter = R;
  for (const l of layers) {
    const frac = l.pct / total;
    const rInner = Math.sqrt(Math.max(rOuter * rOuter - frac * R * R, 0));
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
    ctx.arc(cx, cy, rInner, 0, Math.PI * 2, true);
    ctx.fillStyle = l.color;
    ctx.fill();
    if (rInner > 3) {
      // línea divisoria sutil entre capas
      ctx.beginPath();
      ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.30)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    rOuter = rInner;
  }
  // brillo radial del núcleo (lo que queda al centro)
  if (rOuter > 2) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
    g.addColorStop(0, 'rgba(255,255,245,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Radio medio (0..1) de cada anillo, en orden centro→superficie. */
export function layerMidRadii(body: CelestialBody): number[] {
  const layers = body.structure;
  const total = layers.reduce((s, l) => s + l.pct, 0) || 100;
  let rOuter = 1;
  const mids: number[] = new Array(layers.length);
  for (let i = layers.length - 1; i >= 0; i--) {
    const rInner = Math.sqrt(Math.max(rOuter * rOuter - layers[i].pct / total, 0));
    mids[i] = (rInner + rOuter) / 2;
    rOuter = rInner;
  }
  return mids;
}

/** Puntos de anclaje locales (espacio unitario del disco) para las etiquetas. */
export function anchorLocals(layers: LayerInfo[], mids: number[]): THREE.Vector3[] {
  const n = layers.length;
  return layers.map((_, i) => {
    // abanico escalonado sobre el borde real del semicírculo (z ≤ 0):
    // de abajo (−80°) a casi horizontal-arriba (−10°), separación vertical por capa
    const ang = (Math.PI / 180) * -(80 - (i * 70) / Math.max(n - 1, 1));
    return new THREE.Vector3(
      0.04,
      Math.cos(ang) * mids[i] * 0.97,
      Math.sin(ang) * mids[i] * 0.97
    );
  });
}

/* ---------------------------------------------------------------
 * Etiquetas de capas (HTML proyectado, expandibles)
 * -------------------------------------------------------------- */

interface CutawayItem {
  el: HTMLDivElement;
  getWorldPos: (out: THREE.Vector3) => THREE.Vector3;
}

export class CutawayLabels {
  private root: HTMLElement;
  private items: CutawayItem[] = [];
  private tmp = new THREE.Vector3();
  visible = false;

  constructor() {
    let el = document.getElementById('cutaway-labels-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cutaway-labels-root';
      document.body.appendChild(el);
    }
    this.root = el;
  }

  build(
    body: CelestialBody,
    getAnchorWorld: (layerIndex: number, out: THREE.Vector3) => THREE.Vector3
  ) {
    this.clear();
    const total = body.structure.reduce((s, l) => s + l.pct, 0) || 100;
    body.structure.forEach((layer, i) => {
      const el = document.createElement('div');
      el.className = 'cutaway-box';
      el.style.display = 'none';
      const pct = (layer.pct / total) * 100;
      const pctStr = pct < 0.1 ? '&lt;0,1' : pct.toFixed(1).replace('.', ',');
      el.innerHTML = `
        <button class="cutaway-head" title="Ver detalle de la capa">
          <span class="cutaway-dot" style="background:${layer.color}"></span>
          <span class="cutaway-name">${layer.name}</span>
          <span class="cutaway-pct">${pctStr}%</span>
          <span class="cutaway-chev">▾</span>
        </button>
        <div class="cutaway-detail"><p>${layer.note}</p></div>`;
      this.root.appendChild(el);
      el.querySelector('.cutaway-head')!.addEventListener('click', () => {
        el.classList.toggle('open');
      });
      this.items.push({ el, getWorldPos: (o) => getAnchorWorld(i, o) });
    });
  }

  update(camera: THREE.PerspectiveCamera, w: number, h: number, progress: number) {
    const show = this.visible && progress > 0.72;
    if (!show) {
      for (const it of this.items) it.el.style.display = 'none';
      return;
    }
    const op = Math.min(1, (progress - 0.72) / 0.25);
    for (const it of this.items) {
      const p = it.getWorldPos(this.tmp);
      this.tmp.project(camera);
      if (this.tmp.z > 1) {
        it.el.style.display = 'none';
        continue;
      }
      const x = (this.tmp.x * 0.5 + 0.5) * w;
      const y = (-this.tmp.y * 0.5 + 0.5) * h;
      it.el.style.display = 'block';
      it.el.style.opacity = String(op);
      it.el.style.left = `${x.toFixed(1)}px`;
      it.el.style.top = `${y.toFixed(1)}px`;
    }
  }

  clear() {
    for (const it of this.items) it.el.remove();
    this.items = [];
  }
}
