/**
 * Labels.ts — Etiquetas HTML proyectadas (sin CSS2DRenderer).
 *
 * Cada cuerpo tiene un <div> posicionado por proyección manual de su
 * posición mundo al espacio de pantalla; oclusión básica por profundidad.
 */
import * as THREE from 'three/webgpu';

export class LabelManager {
  private root: HTMLElement;
  private items: {
    el: HTMLDivElement;
    getWorldPos: (out: THREE.Vector3) => THREE.Vector3;
    isMoon: boolean;
    isComet: boolean;
    id: string;
    parentId?: string;
    parentGetPos?: (out: THREE.Vector3) => THREE.Vector3;
    parentGetRadius?: () => number;
  }[] = [];
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  visible = true;

  constructor() {
    this.root = document.getElementById('labels-root')!;
  }

  add(
    id: string,
    name: string,
    isMoon: boolean,
    getWorldPos: (out: THREE.Vector3) => THREE.Vector3,
    isComet = false,
    parentId?: string,
    parentGetPos?: (out: THREE.Vector3) => THREE.Vector3,
    parentGetRadius?: () => number
  ) {
    const el = document.createElement('div');
    el.className = `body-label${isMoon ? ' moon-label' : ''}${isComet ? ' comet-label' : ''}`;
    el.textContent = isComet ? `☄️ ${name}` : name;
    el.style.display = 'none';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      el.dispatchEvent(
        new CustomEvent('label-select', { detail: id, bubbles: true })
      );
    });
    this.root.appendChild(el);
    this.items.push({ el, getWorldPos, isMoon, isComet, id, parentId, parentGetPos, parentGetRadius });
  }

  setSelected(id: string | null) {
    for (const it of this.items) it.el.classList.toggle('selected', it.id === id);
  }

  setMoonsVisible(v: boolean) {
    for (const it of this.items) {
      if (it.isMoon) it.el.style.visibility = v ? 'visible' : 'hidden';
    }
  }

  setCometsVisible(v: boolean) {
    for (const it of this.items) {
      if (it.isComet) it.el.style.visibility = v ? 'visible' : 'hidden';
    }
  }

  update(
    camera: THREE.PerspectiveCamera,
    w: number,
    h: number,
    focusedId: string | null = null,
    selectedId: string | null = null
  ) {
    if (!this.visible) {
      for (const it of this.items) it.el.style.display = 'none';
      return;
    }
    for (const it of this.items) {
      if (it.isMoon && it.id !== focusedId && it.id !== selectedId) {
        const parentFocused =
          it.parentId !== undefined && (focusedId === it.parentId || selectedId === it.parentId);
        if (!parentFocused && it.parentGetPos) {
          const pPos = it.parentGetPos(this.tmp2);
          const distParent = pPos.distanceTo(camera.position);
          const thresh = Math.max((it.parentGetRadius?.() ?? 1) * 18, 12);
          if (distParent > thresh) {
            it.el.style.display = 'none';
            continue;
          }
        }
      }
      const p = it.getWorldPos(this.tmp);
      const dist = p.distanceTo(camera.position);
      this.tmp.project(camera);
      const behind = this.tmp.z > 1 || this.tmp.z < -1;
      const x = (this.tmp.x * 0.5 + 0.5) * w;
      const y = (-this.tmp.y * 0.5 + 0.5) * h;
      // fuera de pantalla o demasiado lejos (evita ruido de etiquetas)
      const maxDist = it.isMoon ? 900 : 60000;
      if (behind || x < -60 || x > w + 60 || y < -30 || y > h + 30 || dist > maxDist) {
        it.el.style.display = 'none';
        continue;
      }
      it.el.style.display = 'block';
      it.el.style.left = `${x.toFixed(1)}px`;
      it.el.style.top = `${y.toFixed(1)}px`;
    }
  }
}
