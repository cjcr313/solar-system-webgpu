/**
 * detailsPanel.ts — Panel lateral de información científica.
 *
 * Pestañas: Resumen · Estructura · Atmósfera · Física · Exploración.
 * Barras de composición química y desglose de capas internas.
 */
import { simStore } from '../core/store';
import { icon, ICONS } from './icons';
import { BODY_TYPE_LABEL, type CelestialBody } from '../data/celestialData';
import type { Simulation } from '../core/simulation';

type Tab = 'overview' | 'structure' | 'atmosphere' | 'physics' | 'exploration';

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Resumen',
  structure: 'Estructura',
  atmosphere: 'Atmósfera',
  physics: 'Física',
  exploration: 'Exploración'
};

export class DetailsPanel {
  private root!: HTMLElement;
  private current: CelestialBody | null = null;
  private tab: Tab = 'overview';
  private unsub: () => void;

  constructor(private sim: Simulation) {
    this.root = document.createElement('div');
    this.root.id = 'details-panel';
    this.root.className =
      'glass fade-in pointer-events-auto fixed top-16 right-3 z-30 hidden max-h-[calc(100vh-140px)] w-[340px] flex-col overflow-hidden rounded-xl';
    document.getElementById('hud-root')!.appendChild(this.root);

    this.unsub = simStore.subscribe((s, prev) => {
      if (s.selectedId !== prev.selectedId) {
        this.current = this.sim.getSelectedData();
        if (this.current) this.show();
        else this.hide();
      }
    });
  }

  private show() {
    this.root.classList.remove('hidden');
    this.root.classList.add('flex');
    this.render();
  }

  private hide() {
    this.root.classList.add('hidden');
    this.root.classList.remove('flex');
  }

  private close() {
    simStore.getState().select(null);
  }

  setTab(t: Tab) {
    this.tab = t;
    this.render();
  }

  focusCurrent() {
    const id = simStore.getState().selectedId;
    if (id) this.sim.focusBody(id);
  }

  /* ---------------- Render ---------------- */

  private render() {
    const b = this.current;
    if (!b) return;
    const typeLabel = BODY_TYPE_LABEL[b.type];
    const ringColor = '#' + b.color.toString(16).padStart(6, '0');

    this.root.innerHTML = `
      <div class="flex items-start justify-between gap-2 border-b border-slate-700/50 p-3">
        <div class="flex items-center gap-2.5">
          <span class="h-3.5 w-3.5 shrink-0 rounded-full" style="background:${ringColor}; box-shadow:0 0 10px ${ringColor}"></span>
          <div>
            <h2 class="text-base leading-tight font-semibold text-slate-100">${b.name}</h2>
            <p class="font-mono text-[10px] tracking-widest text-slate-400 uppercase">${typeLabel}</p>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button id="dp-focus" class="icon-btn" title="Enfocar cámara">${icon(ICONS.focus)}</button>
          <button id="dp-close" class="icon-btn" title="Cerrar">${icon(ICONS.x)}</button>
        </div>
      </div>
      <nav class="flex gap-1 border-b border-slate-700/50 p-2">
        ${(Object.keys(TAB_LABELS) as Tab[])
          .map(
            (t) =>
              `<button data-tab="${t}" class="tab-btn ${t === this.tab ? 'active' : ''}">${TAB_LABELS[t]}</button>`
          )
          .join('')}
      </nav>
      <div class="overflow-y-auto p-3 text-slate-300">
        ${this.tabContent(b)}
      </div>
    `;

    this.root.querySelector('#dp-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('#dp-focus')!.addEventListener('click', () => this.focusCurrent());
    for (const el of this.root.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      el.addEventListener('click', () => this.setTab(el.dataset.tab as Tab));
    }
  }

  private tabContent(b: CelestialBody): string {
    switch (this.tab) {
      case 'overview':
        return this.overviewTab(b);
      case 'structure':
        return this.structureTab(b);
      case 'atmosphere':
        return this.atmosphereTab(b);
      case 'physics':
        return this.physicsTab(b);
      case 'exploration':
        return this.explorationTab(b);
    }
  }

  /* ---------------- Pestañas ---------------- */

  private overviewTab(b: CelestialBody): string {
    const rows: [string, string][] = [
      ['Radio medio', b.radiusKm.toLocaleString('es-CL') + ' km'],
      ['Masa', b.physical.massKg]
    ];
    if (b.orbital) {
      rows.push(['Semieje mayor (a)', b.orbital.a.toFixed(3) + ' UA']);
      rows.push(['Período orbital', this.fmtDays(b.orbital.periodDays)]);
      rows.push(['Excentricidad', b.orbital.e.toFixed(4)]);
      rows.push(['Inclinación', b.orbital.iDeg.toFixed(2) + '°']);
    }
    if (b.moonOf) {
      rows.push(['Distancia al padre', b.moonOf.radiusKm.toLocaleString('es-CL') + ' km']);
      rows.push(['Período orbital', this.fmtDays(b.moonOf.periodDays)]);
    }
    rows.push(['Rotación (día sideral)', this.fmtHours(b.rotationHours)]);
    return `
      <p class="mb-3 text-[12.5px] leading-relaxed text-slate-300">${b.summary}</p>
      <dl class="space-y-1.5">
        ${rows
          .map(
            ([k, v]) =>
              `<div class="flex items-baseline justify-between gap-3 border-b border-slate-700/30 pb-1">
                 <dt class="text-[11px] text-slate-400">${k}</dt>
                 <dd class="font-mono text-[11.5px] text-slate-200">${v}</dd>
               </div>`
          )
          .join('')}
      </dl>`;
  }

  private structureTab(b: CelestialBody): string {
    const total = b.structure.reduce((s, l) => s + l.pct, 0) || 100;
    return `
      <div class="mb-2 flex h-5 w-full overflow-hidden rounded-md border border-slate-600/40">
        ${b.structure
          .map(
            (l) =>
              `<div style="width:${(l.pct / total) * 100}%; background:${l.color}" title="${l.name}"></div>`
          )
          .join('')}
      </div>
      <div class="space-y-2.5">
        ${b.structure
          .map(
            (l) => `
          <div>
            <div class="mb-0.5 flex items-baseline justify-between">
              <span class="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-200">
                <span class="h-2.5 w-2.5 rounded-sm" style="background:${l.color}"></span>${l.name}
              </span>
              <span class="font-mono text-[11px] text-cyan-300">${((l.pct / total) * 100).toFixed(1)}%</span>
            </div>
            <p class="pl-4 text-[11px] leading-snug text-slate-400">${l.note}</p>
          </div>`
          )
          .join('')}
      </div>`;
  }

  private atmosphereTab(b: CelestialBody): string {
    const a = b.atmosphere;
    const comp =
      a.composition.length > 0
        ? `<div class="space-y-2">
            ${a.composition
              .map((g) => {
                const pct = Math.max(g.pct, 0.4);
                return `
                <div>
                  <div class="mb-0.5 flex items-baseline justify-between text-[11px]">
                    <span class="text-slate-300">${g.gas}</span>
                    <span class="font-mono text-cyan-300">${g.pct.toLocaleString('es-CL')}%</span>
                  </div>
                  <div class="bar-track"><div class="bar-fill" style="width:${Math.min(pct, 100)}%; background:linear-gradient(90deg,#22d3ee,#6366f1)"></div></div>
                </div>`;
              })
              .join('')}
          </div>`
        : `<p class="text-[12px] text-slate-400">Sin atmósfera apreciable.</p>`;
    const facts: [string, string][] = [];
    if (a.pressure) facts.push(['Presión', a.pressure]);
    if (a.tempMean) facts.push(['Temp. media', a.tempMean]);
    if (a.tempRange) facts.push(['Extremos', a.tempRange]);
    if (a.winds) facts.push(['Vientos', a.winds]);
    return `
      ${comp}
      ${
        facts.length
          ? `<dl class="mt-3 space-y-1.5">${facts
              .map(
                ([k, v]) =>
                  `<div class="flex items-baseline justify-between gap-3 border-b border-slate-700/30 pb-1">
                     <dt class="text-[11px] text-slate-400">${k}</dt>
                     <dd class="max-w-[62%] text-right font-mono text-[11px] text-slate-200">${v}</dd>
                   </div>`
              )
              .join('')}</dl>`
          : ''
      }
      ${a.notes ? `<p class="mt-3 rounded-md bg-cyan-500/5 p-2 text-[11px] leading-relaxed text-slate-300">${icon(ICONS.info, 'inline w-3 h-3 align-[-2px] mr-1')} ${a.notes}</p>` : ''}`;
  }

  private physicsTab(b: CelestialBody): string {
    const p = b.physical;
    const rows: [string, string][] = [
      ['Masa', p.massKg],
      ['Densidad media', p.densityGcm3.toLocaleString('es-CL') + ' g/cm³'],
      ['Gravedad superficial', p.gravityMs2.toLocaleString('es-CL') + ' m/s²'],
      ['Velocidad de escape', p.escapeKms.toLocaleString('es-CL') + ' km/s'],
      ['Radio medio', b.radiusKm.toLocaleString('es-CL') + ' km'],
      ['Inclinación axial', b.axialTiltDeg.toFixed(2) + '°'],
      ['Rotación', this.fmtHours(b.rotationHours) + (b.rotationHours < 0 ? ' (retrógrada)' : '')],
      ['Temp. media', p.meanTempC ?? '—']
    ];
    if (b.orbital) rows.push(['Año (período orbital)', this.fmtDays(b.orbital.periodDays)]);
    return `<dl class="space-y-1.5">
      ${rows
        .map(
          ([k, v]) =>
            `<div class="flex items-baseline justify-between gap-3 border-b border-slate-700/30 pb-1">
               <dt class="text-[11px] text-slate-400">${k}</dt>
               <dd class="max-w-[62%] text-right font-mono text-[11.5px] text-slate-200">${v}</dd>
             </div>`
        )
        .join('')}
    </dl>`;
  }

  private explorationTab(b: CelestialBody): string {
    return `<div class="space-y-2.5">
      ${b.missions
        .map(
          (m) => `
        <div class="rounded-lg border border-slate-700/40 bg-slate-800/30 p-2.5">
          <div class="flex items-baseline justify-between gap-2">
            <span class="flex items-center gap-1.5 text-[12px] font-semibold text-slate-100">${icon(ICONS.rocket, 'inline w-3.5 h-3.5')}${m.name}</span>
            <span class="font-mono text-[10px] text-cyan-300">${m.year}</span>
          </div>
          <p class="mt-0.5 font-mono text-[9.5px] tracking-wider text-slate-500 uppercase">${m.agency}</p>
          <p class="mt-1 text-[11px] leading-snug text-slate-300">${m.highlight}</p>
        </div>`
        )
        .join('')}
    </div>`;
  }

  /* ---------------- Formato ---------------- */

  private fmtDays(d: number): string {
    if (d < 500) return d.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' días';
    const y = d / 365.25;
    if (y < 1000) return y.toLocaleString('es-CL', { maximumFractionDigits: 2 }) + ' años';
    return y.toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ' años';
  }

  private fmtHours(h: number): string {
    const a = Math.abs(h);
    if (a < 48) return a.toLocaleString('es-CL', { maximumFractionDigits: 2 }) + ' h';
    return (a / 24).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' días';
  }

  dispose() {
    this.unsub();
  }
}
