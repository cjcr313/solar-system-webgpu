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

/** Radios normalizados (inner, outer, mid) en orden centro→superficie, consistentes entre paredes 3D, núcleo y anclas. */
export function computeLayerRadii(body: CelestialBody): { inner: number; outer: number; mid: number }[] {
  const layers = body.structure;
  const total = layers.reduce((s, l) => s + l.pct, 0) || 100;
  const MIN_FRAC = 0.022;
  const MIN_CORE = layers.length >= 2 ? 0.17 : 0;
  const res: { inner: number; outer: number; mid: number }[] = new Array(layers.length);
  let rOuter = 1;
  for (let i = layers.length - 1; i >= 1; i--) {
    const frac = layers[i].pct / total;
    const minReserve = MIN_CORE + (i - 1) * MIN_FRAC;
    let rInner = Math.sqrt(Math.max(rOuter * rOuter - frac, 0));
    rInner = Math.min(rInner, rOuter - MIN_FRAC);
    rInner = Math.max(rInner, minReserve);
    res[i] = { inner: rInner, outer: rOuter, mid: (rInner + rOuter) * 0.5 };
    rOuter = rInner;
  }
  if (layers.length > 0) {
    res[0] = { inner: 0, outer: rOuter, mid: rOuter * 0.55 };
  }
  return res;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeLayerDiskTexture(body: CelestialBody): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const cx = S / 2,
    cy = S / 2,
    R = S / 2 - 4;

  const radii = computeLayerRadii(body);
  let seed = hashSeed(body.id);
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  ctx.clearRect(0, 0, S, S);
  let innermost = R;
  for (let i = body.structure.length - 1; i >= 0; i--) {
    const l = body.structure[i];
    const rOuter = radii[i].outer * R;
    const rInner = Math.max(radii[i].inner * R, 0);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
    if (rInner > 0) ctx.arc(cx, cy, rInner, 0, Math.PI * 2, true);
    ctx.clip();

    // Base + gradiente radial para dar volumen y relieve geológico a cada estrato
    ctx.fillStyle = l.color;
    ctx.fillRect(0, 0, S, S);

    const shade = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
    if (i === 0) {
      shade.addColorStop(0, 'rgba(255,255,245,0.65)');
      shade.addColorStop(0.55, 'rgba(255,235,190,0.18)');
      shade.addColorStop(1, 'rgba(0,0,0,0.18)');
    } else {
      shade.addColorStop(0, 'rgba(0,0,0,0.22)');
      shade.addColorStop(0.18, 'rgba(255,255,255,0.06)');
      shade.addColorStop(0.85, 'rgba(255,255,255,0.08)');
      shade.addColorStop(1, 'rgba(0,0,0,0.16)');
    }
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, S, S);

    // Vetas convectivas / grano estratigráfico dentro de la capa
    const span = rOuter - rInner;
    if (span > 10) {
      const arcs = Math.min(70, Math.max(18, Math.round(span * 0.4)));
      for (let a = 0; a < arcs; a++) {
        const rr = rInner + (0.12 + 0.76 * rnd()) * span;
        const th0 = rnd() * Math.PI * 2;
        const th1 = th0 + 0.25 + rnd() * 0.85;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, th0, th1);
        ctx.strokeStyle = rnd() > 0.45 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1.5 + rnd() * Math.min(5, span * 0.14);
        ctx.stroke();
      }
    }
    ctx.restore();

    if (rInner > 2) {
      ctx.beginPath();
      ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.36)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    innermost = Math.min(innermost, rInner || rOuter);
  }

  // Brillo incandescente suave en el núcleo central
  if (innermost > 4) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, innermost * 0.9);
    g.addColorStop(0, 'rgba(255,255,250,0.72)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, innermost * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Radio medio (0..1) de cada anillo, en orden centro→superficie. */
export function layerMidRadii(body: CelestialBody): number[] {
  return computeLayerRadii(body).map((r) => r.mid);
}

/** Frontera EXTERNA (0..1) de cada capa, en orden centro→superficie (la última = 1). */
export function layerBoundaries(body: CelestialBody): number[] {
  return computeLayerRadii(body).map((r) => r.outer);
}

/** Puntos de anclaje locales sobre la cara XY abierta (+X, +Y, z=0.02) del octante. */
export function anchorLocals(layers: LayerInfo[], mids: number[]): THREE.Vector3[] {
  const n = layers.length;
  return layers.map((_, i) => {
    // Abanico de 16° (cerca del eje +X en núcleo) a 74° (cerca de +Y en corteza)
    const ang = (Math.PI / 180) * (16 + (i * 58) / Math.max(n - 1, 1));
    return new THREE.Vector3(
      Math.cos(ang) * mids[i],
      Math.sin(ang) * mids[i],
      0.025
    );
  });
}

/* ---------------------------------------------------------------
 * Etiquetas de capas (HTML proyectado, expandibles)
 * -------------------------------------------------------------- */

interface CutawayItem {
  el: HTMLDivElement;
  link: HTMLDivElement;
  getWorldPos: (out: THREE.Vector3) => THREE.Vector3;
}

export class CutawayLabels {
  private root: HTMLElement;
  private items: CutawayItem[] = [];
  private tmp = new THREE.Vector3();
  private activeIndex: number | null = null;
  onSelectLayer?: (index: number | null) => void;
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
    this.activeIndex = null;
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
      // línea conectora entre el ancla 3D y la caja
      const link = document.createElement('div');
      link.className = 'cutaway-link';
      link.style.display = 'none';
      this.root.appendChild(link);
      el.querySelector('.cutaway-head')!.addEventListener('click', () => {
        this.setActiveLayer(this.activeIndex === i ? null : i);
      });
      this.items.push({ el, link, getWorldPos: (o) => getAnchorWorld(i, o) });
    });
  }

  setActiveLayer(index: number | null) {
    this.activeIndex = index;
    this.items.forEach((it, idx) => {
      const active = index === idx;
      it.el.classList.toggle('open', active);
      it.el.classList.toggle('active-layer', active);
      it.link.classList.toggle('active-layer', active);
    });
    this.onSelectLayer?.(index);
  }

  getActiveLayer(): number | null {
    return this.activeIndex;
  }

  update(camera: THREE.PerspectiveCamera, w: number, h: number, progress: number) {
    const show = this.visible && progress > 0.72;
    if (!show) {
      for (const it of this.items) {
        it.el.style.display = 'none';
        it.link.style.display = 'none';
      }
      return;
    }
    const op = Math.min(1, (progress - 0.72) / 0.25);

    // 1) proyectar anclas
    const projected: { it: CutawayItem; ax: number; ay: number; by: number; h: number }[] = [];
    for (const it of this.items) {
      it.getWorldPos(this.tmp);
      this.tmp.project(camera);
      if (this.tmp.z > 1) {
        it.el.style.display = 'none';
        it.link.style.display = 'none';
        continue;
      }
      // Mostrar antes de medir para obtener offsetHeight real (incluyendo si está abierta)
      it.el.style.display = 'block';
      projected.push({
        it,
        ax: (this.tmp.x * 0.5 + 0.5) * w,
        ay: (-this.tmp.y * 0.5 + 0.5) * h,
        by: 0,
        h: Math.max(it.el.offsetHeight, 36)
      });
    }
    if (projected.length === 0) return;

    // 2) anti-solape vertical dinámico usando la altura real de cada caja
    const GAP = 8;
    const minTop = 76;
    const maxBot = h - 134;
    projected.sort((a, b) => a.ay - b.ay);
    for (let i = 0; i < projected.length; i++) {
      const pr = projected[i];
      const desired = Math.max(minTop + pr.h * 0.5, pr.ay);
      if (i === 0) {
        pr.by = desired;
      } else {
        const prev = projected[i - 1];
        const minCenter = prev.by + prev.h * 0.5 + GAP + pr.h * 0.5;
        pr.by = Math.max(desired, minCenter);
      }
    }
    // Empujar hacia arriba si la última caja desborda el borde inferior
    const last = projected[projected.length - 1];
    const overflow = last.by + last.h * 0.5 - maxBot;
    if (overflow > 0) {
      last.by -= overflow;
      for (let i = projected.length - 2; i >= 0; i--) {
        const cur = projected[i];
        const next = projected[i + 1];
        const maxCenter = next.by - next.h * 0.5 - GAP - cur.h * 0.5;
        if (cur.by > maxCenter) cur.by = maxCenter;
      }
    }

    // Respetar el ancho de #details-panel a la derecha en desktop
    const dp = document.getElementById('details-panel');
    const dpVisible = dp && !dp.classList.contains('hidden') && w >= 640;
    const boxW = 218;
    const rightLimit = dpVisible ? Math.max(250, w - 365 - boxW) : w - boxW - 10;

    // 3) posicionar cajas y dibujar conectores
    for (let i = 0; i < projected.length; i++) {
      const { it, ax, ay, by } = projected[i];
      const placeLeft = ax + 34 > rightLimit && ax - 34 - boxW >= 10;
      const bx = placeLeft ? ax - 34 - boxW : Math.min(ax + 34, rightLimit);
      it.el.classList.toggle('left-side', placeLeft);
      it.el.style.opacity = String(op);
      it.el.style.left = `${bx.toFixed(1)}px`;
      it.el.style.top = `${by.toFixed(1)}px`;

      const anchorEndX = placeLeft ? bx + boxW : bx;
      const dx = anchorEndX - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      it.link.style.display = 'block';
      it.link.style.opacity = String(op);
      it.link.style.left = `${ax.toFixed(1)}px`;
      it.link.style.top = `${ay.toFixed(1)}px`;
      it.link.style.width = `${len.toFixed(1)}px`;
      it.link.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`;
    }
  }

  clear() {
    for (const it of this.items) {
      it.el.remove();
      it.link.remove();
    }
    this.items = [];
  }
}
