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
    id: string;
  }[] = [];
  private tmp = new THREE.Vector3();
  visible = true;

  constructor() {
    this.root = document.getElementById('labels-root')!;
  }

  add(id: string, name: string, isMoon: boolean, getWorldPos: (out: THREE.Vector3) => THREE.Vector3) {
    const el = document.createElement('div');
    el.className = `body-label${isMoon ? ' moon-label' : ''}`;
    el.textContent = name;
    el.style.display = 'none';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      el.dispatchEvent(
        new CustomEvent('label-select', { detail: id, bubbles: true })
      );
    });
    this.root.appendChild(el);
    this.items.push({ el, getWorldPos, isMoon, id });
  }

  setSelected(id: string | null) {
    for (const it of this.items) it.el.classList.toggle('selected', it.id === id);
  }

  setMoonsVisible(v: boolean) {
    for (const it of this.items) {
      if (it.isMoon) it.el.style.visibility = v ? 'visible' : 'hidden';
    }
  }

  update(camera: THREE.PerspectiveCamera, w: number, h: number) {
    if (!this.visible) {
      for (const it of this.items) it.el.style.display = 'none';
      return;
    }
    for (const it of this.items) {
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
