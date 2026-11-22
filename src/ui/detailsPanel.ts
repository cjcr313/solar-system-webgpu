/**
 * detailsPanel.ts — Panel lateral de información científica.
 *
 * Pestañas: Resumen · Estructura · Atmósfera · Física · Exploración.
 * Barras de composición química y desglose de capas internas.
 */
import { simStore } from '../core/store';
import { icon, ICONS } from './icons';
import { BODY_TYPE_LABEL, BODIES_BY_ID, MOONS, type CelestialBody } from '../data/celestialData';
import { orbitalTelemetry } from '../physics/kepler';
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
  private liveTimer: number;

  constructor(private sim: Simulation) {
    this.root = document.createElement('div');
    this.root.id = 'details-panel';
    this.root.className =
      'glass fade-in pointer-events-auto fixed top-16 right-3 z-30 hidden max-h-[calc(100vh-140px)] w-[340px] flex-col overflow-hidden rounded-xl max-sm:inset-x-2 max-sm:top-auto max-sm:right-auto max-sm:bottom-24 max-sm:w-auto max-sm:max-h-[46vh]';
    document.getElementById('hud-root')!.appendChild(this.root);

    this.liveTimer = window.setInterval(() => this.refreshLiveTelemetry(), 400);

    this.unsub = simStore.subscribe((s, prev) => {
      if (s.selectedId !== prev.selectedId) {
        this.current = this.sim.getSelectedData();
        if (this.current) this.show();
        else this.hide();
      }
      if (s.cutawayBodyId !== prev.cutawayBodyId && this.current) this.render();
    });
  }

  private show() {
    if (window.innerWidth < 768 && simStore.getState().leftPanelOpen) {
      simStore.getState().setLeftPanelOpen(false);
    }
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
    const canCut = b.structure.length >= 2 && !b.id.startsWith('belt:') && b.type !== 'comet';
    const cutOn = simStore.getState().cutawayBodyId === b.id;

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
          <button id="dp-cutaway" class="icon-btn ${cutOn ? 'active' : ''}" style="${canCut ? '' : 'display:none'}" title="Ver interior (corte animado)" aria-label="Ver corte interior 3D">${icon(ICONS.layers)}</button>
          <button id="dp-focus" class="icon-btn" title="Enfocar cámara" aria-label="Enfocar cámara en el cuerpo">${icon(ICONS.focus)}</button>
          <button id="dp-close" class="icon-btn" title="Cerrar" aria-label="Cerrar panel de detalles">${icon(ICONS.x)}</button>
        </div>
      </div>
      <nav role="tablist" aria-label="Secciones científicas" class="flex gap-0.5 overflow-x-auto border-b border-slate-700/50 px-1.5 py-1.5">
        ${(Object.keys(TAB_LABELS) as Tab[])
          .map(
            (t) =>
              `<button data-tab="${t}" role="tab" aria-selected="${t === this.tab}" class="tab-btn ${t === this.tab ? 'active' : ''}">${TAB_LABELS[t]}</button>`
          )
          .join('')}
      </nav>
      <div class="overflow-y-auto p-3 text-slate-300">
        ${this.tabContent(b)}
      </div>
    `;

    this.root.querySelector('#dp-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('#dp-focus')!.addEventListener('click', () => this.focusCurrent());
    const toggleCut = () => {
      if (!this.current) return;
      const cur = simStore.getState().cutawayBodyId;
      simStore.getState().setCutaway(cur === this.current.id ? null : this.current.id);
    };
    this.root.querySelector('#dp-cutaway')?.addEventListener('click', toggleCut);
    this.root.querySelector('[data-cut]')?.addEventListener('click', toggleCut);
    for (const el of this.root.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      el.addEventListener('click', () => this.setTab(el.dataset.tab as Tab));
    }
    for (const el of this.root.querySelectorAll<HTMLButtonElement>('[data-jump-id]')) {
      el.addEventListener('click', () => {
        const targetId = el.dataset.jumpId!;
        simStore.getState().select(targetId);
        this.sim.focusBody(targetId);
      });
    }
    this.refreshLiveTelemetry();
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
    const rows: [string, string, string?][] = [
      ['Radio medio', b.radiusKm.toLocaleString('es-CL') + ' km'],
      ['Masa', b.physical.massKg]
    ];
    if (b.orbital) {
      rows.push(['Semieje mayor (a)', b.orbital.a.toFixed(3) + ' UA', 'Distancia media al Sol (1 UA ≈ 149,6 millones de km).']);
      rows.push(['Período orbital', this.fmtDays(b.orbital.periodDays), 'Tiempo que tarda en completar una órbita alrededor del Sol.']);
      rows.push(['Excentricidad', b.orbital.e.toFixed(4), 'Qué tan elíptica es la órbita (0 = círculo perfecto, cercano a 1 = muy alargada).']);
      rows.push(['Inclinación', b.orbital.iDeg.toFixed(2) + '°', 'Ángulo del plano orbital respecto al plano de la órbita terrestre (eclíptica).']);
    }
    if (b.moonOf) {
      rows.push(['Distancia al padre', b.moonOf.radiusKm.toLocaleString('es-CL') + ' km']);
      rows.push(['Período orbital', this.fmtDays(b.moonOf.periodDays)]);
    }
    if (b.comet) {
      rows.push(['Perihelio (q)', b.comet.perihelionAU.toFixed(3) + ' UA', 'Punto de la órbita más cercano al Sol.']);
      rows.push(['Afelio (Q)', b.comet.aphelionAU.toFixed(2) + ' UA', 'Punto de la órbita más lejano al Sol.']);
      rows.push(['Último perihelio', b.comet.lastPerihelion]);
      rows.push(['Próximo perihelio', b.comet.nextPerihelion]);
      if (b.comet.retrograde) rows.push(['Sentido orbital', 'Retrógrado (i > 90°)', 'Orbita en sentido opuesto al movimiento de los planetas.']);
    }
    rows.push(['Rotación (día sideral)', this.fmtHours(b.rotationHours), 'Tiempo que tarda en dar una vuelta completa sobre su eje respecto a las estrellas.']);

    const childMoons = MOONS.filter((m) => m.moonOf?.parentId === b.id);
    const parentBody = b.moonOf ? BODIES_BY_ID[b.moonOf.parentId] : undefined;

    const liveBox = b.orbital
      ? `<div class="mb-3 grid grid-cols-3 gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2 text-center" title="Calculado en vivo desde la ecuación de Kepler y vis-viva">
          <div>
            <div class="font-mono text-[9px] tracking-wider text-slate-400 uppercase">Dist. Sol</div>
            <div id="dp-live-dist" class="font-mono text-[11px] font-semibold text-cyan-200">—</div>
          </div>
          <div>
            <div class="font-mono text-[9px] tracking-wider text-slate-400 uppercase">Tiempo-luz</div>
            <div id="dp-live-light" class="font-mono text-[11px] font-semibold text-amber-200">—</div>
          </div>
          <div>
            <div class="font-mono text-[9px] tracking-wider text-slate-400 uppercase">Vel. orbital</div>
            <div id="dp-live-speed" class="font-mono text-[11px] font-semibold text-emerald-300">—</div>
          </div>
        </div>`
      : '';

    const moonsHtml =
      childMoons.length > 0
        ? `<div class="mt-3 border-t border-slate-700/40 pt-2.5">
            <p class="mb-1.5 font-mono text-[10px] tracking-wider text-slate-400 uppercase">Lunas principales (${childMoons.length})</p>
            <div class="flex flex-wrap gap-1">
              ${childMoons.map((m) => `<button data-jump-id="${m.id}" class="chip">${m.name}</button>`).join('')}
            </div>
          </div>`
        : '';

    const parentHtml = parentBody
      ? `<button data-jump-id="${parentBody.id}" class="hud-btn mt-3 w-full">← Volver a ${parentBody.name}</button>`
      : '';

    return `
      <p class="mb-3 text-[12.5px] leading-relaxed text-slate-300">${b.summary}</p>
      ${liveBox}
      <dl class="space-y-1.5">
        ${rows
          .map(
            ([k, v, tip]) =>
              `<div class="flex items-baseline justify-between gap-3 border-b border-slate-700/30 pb-1" ${tip ? `title="${tip}"` : ''}>
                 <dt class="text-[11px] text-slate-400 ${tip ? 'cursor-help underline decoration-slate-600 decoration-dotted underline-offset-2' : ''}">${k}</dt>
                 <dd class="font-mono text-[11.5px] text-slate-200">${v}</dd>
               </div>`
          )
          .join('')}
      </dl>
      ${moonsHtml}
      ${parentHtml}
      ${b.comet ? `<p class="mt-3 rounded-md bg-amber-500/5 p-2 text-[11px] leading-relaxed text-slate-300">${icon(ICONS.info, 'inline w-3 h-3 align-[-2px] mr-1')} ${b.comet.tailNote}</p>` : ''}`;
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
      </div>
      ${b.structure.length >= 2 && !b.id.startsWith('belt:') && b.type !== 'comet'
        ? `<button class="hud-btn mt-3 w-full" data-cut="1">${icon(ICONS.layers)}&nbsp;Ver corte 3D animado</button>`
        : ''}`;
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
    const rows: [string, string, string?][] = [
      ['Masa', p.massKg],
      ['Densidad media', p.densityGcm3.toLocaleString('es-CL') + ' g/cm³'],
      ['Gravedad superficial', p.gravityMs2.toLocaleString('es-CL') + ' m/s²'],
      ['Velocidad de escape', p.escapeKms.toLocaleString('es-CL') + ' km/s', 'Velocidad mínima para escapar de la gravedad de este cuerpo sin impulso adicional.'],
      ['Radio medio', b.radiusKm.toLocaleString('es-CL') + ' km'],
      ['Inclinación axial', b.axialTiltDeg.toFixed(2) + '°', 'Ángulo del eje de rotación respecto a la perpendicular de su órbita (causa las estaciones).'],
      ['Rotación', this.fmtHours(b.rotationHours) + (b.rotationHours < 0 ? ' (retrógrada)' : '')],
      ['Temp. media', p.meanTempC ?? '—']
    ];
    if (b.orbital) rows.push(['Año (período orbital)', this.fmtDays(b.orbital.periodDays)]);
    const gRatio = p.gravityMs2 / 9.81;
    const weight70 = 70 * gRatio;
    const weightFmt =
      weight70 < 0.1
        ? weight70.toFixed(3).replace('.', ',')
        : weight70 < 10
          ? weight70.toFixed(1).replace('.', ',')
          : Math.round(weight70).toLocaleString('es-CL');

    return `<dl class="space-y-1.5">
      ${rows
        .map(
          ([k, v, tip]) =>
            `<div class="flex items-baseline justify-between gap-3 border-b border-slate-700/30 pb-1" ${tip ? `title="${tip}"` : ''}>
               <dt class="text-[11px] text-slate-400 ${tip ? 'cursor-help underline decoration-slate-600 decoration-dotted underline-offset-2' : ''}">${k}</dt>
               <dd class="max-w-[62%] text-right font-mono text-[11.5px] text-slate-200">${v}</dd>
             </div>`
        )
        .join('')}
    </dl>
    <div class="mt-3 rounded-lg border border-slate-700/40 bg-slate-800/40 p-2.5 text-[11px] leading-snug text-slate-300">
      <span class="font-semibold text-cyan-200">Comparativa de gravedad:</span> una persona de <strong>70 kg</strong> en la Tierra pesaría aquí <strong class="font-mono text-amber-200">${weightFmt} kg</strong> (${gRatio.toFixed(2).replace('.', ',')}× g).
    </div>`;
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
          <p class="mt-0.5 font-mono text-[9.5px] tracking-wider text-slate-400 uppercase">${m.agency}</p>
          <p class="mt-1 text-[11px] leading-snug text-slate-300">${m.highlight}</p>
        </div>`
        )
        .join('')}
    </div>`;
  }

  /* ---------------- Telemetría en vivo + Formato ---------------- */

  private refreshLiveTelemetry() {
    if (!this.current?.orbital || this.tab !== 'overview') return;
    const distEl = this.root.querySelector('#dp-live-dist');
    const lightEl = this.root.querySelector('#dp-live-light');
    const speedEl = this.root.querySelector('#dp-live-speed');
    if (!distEl || !lightEl || !speedEl) return;

    const tel = orbitalTelemetry(this.current.orbital, simStore.getState().simDays);
    distEl.textContent = `${tel.rAU.toFixed(2)} UA`;
    (distEl as HTMLElement).title = `${tel.distMKm.toFixed(1)} millones de km`;
    lightEl.textContent = this.fmtLightTime(tel.lightTimeSec);
    speedEl.textContent = `${tel.speedKmS.toFixed(1)} km/s`;
  }

  private fmtLightTime(sec: number): string {
    if (sec < 60) return `${sec.toFixed(0)} s`;
    if (sec < 3600) {
      const m = Math.floor(sec / 60);
      const s = Math.round(sec % 60);
      return `${m}m ${String(s).padStart(2, '0')}s`;
    }
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
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
    clearInterval(this.liveTimer);
    this.unsub();
  }
}
