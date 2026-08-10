/** The right-hand (bottom sheet on mobile) planet information panel. */
import { bodyById, heliocentricDistance, SUN, EARTH_GRAVITY, type BodyDef } from '../data/bodies';
import type { AppState } from '../sim/state';
import {
  fmtAU,
  fmtDays,
  fmtHours,
  fmtInt,
  fmtKm,
  fmtLightTime,
  fmtMass,
  fmtTempC,
} from './format';

const KIND_LABEL: Record<string, string> = {
  star: 'G-type star',
  rocky: 'Rocky planet',
  'gas giant': 'Gas giant',
  'ice giant': 'Ice giant',
  moon: 'Natural satellite',
};

export class InfoPanel {
  private root: HTMLElement;
  private title: HTMLElement;
  private kind: HTMLElement;
  private body: HTMLElement;
  private distValue: HTMLElement | null = null;
  private lightValue: HTMLElement | null = null;
  private currentId: string | null = null;
  private state: AppState;

  constructor(parent: HTMLElement, state: AppState, onCompare: () => void) {
    this.state = state;
    this.root = document.createElement('aside');
    this.root.className = 'infopanel';
    this.root.setAttribute('aria-label', 'Body information');
    this.root.innerHTML = `
      <div class="infopanel-head">
        <div>
          <h2 class="infopanel-title"></h2>
          <span class="infopanel-kind"></span>
        </div>
        <button class="icon-btn close" aria-label="Close panel">
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11"/></svg>
        </button>
      </div>
      <div class="infopanel-body"></div>
    `;
    this.title = this.root.querySelector('.infopanel-title')!;
    this.kind = this.root.querySelector('.infopanel-kind')!;
    this.body = this.root.querySelector('.infopanel-body')!;
    this.root.querySelector('.close')!.addEventListener('click', () => state.select(null));
    parent.appendChild(this.root);

    state.on('select', (id) => (id ? this.show(id, onCompare) : this.hide()));
  }

  private cell(k: string, v: string): string {
    return `<div class="data-cell"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  }

  private show(id: string, onCompare: () => void): void {
    const def: BodyDef = id === 'sun' ? SUN : bodyById(id);
    this.currentId = id;
    this.title.textContent = def.name;
    this.kind.textContent = KIND_LABEL[def.kind] ?? def.kind;

    const f = def.facts;
    const isSun = id === 'sun';
    const isMoon = id === 'moon';

    const cells: string[] = [
      this.cell('Diameter', fmtKm(f.diameterKm)),
      this.cell('Mass', fmtMass(f.massKg)),
      this.cell('Surface gravity', `${f.gravity.toFixed(1)} m/s² <small>(${(f.gravity / EARTH_GRAVITY).toFixed(2)}×⊕)</small>`),
      this.cell(isSun ? 'Rotation period' : 'Day length', fmtHours(f.dayLengthHours)),
    ];
    if (!isSun) {
      cells.push(
        this.cell(isMoon ? 'Orbit (around Earth)' : 'Year length', fmtDays(f.orbitDays)),
        isMoon
          ? this.cell('Distance from Earth', fmtKm(384_400))
          : this.cell('Distance from Sun', `<span class="dist-now">${fmtAU(f.distanceAU)}</span>`),
      );
    }
    cells.push(
      this.cell(
        isSun ? 'Surface temp' : 'Mean temp',
        `${fmtTempC(f.tempMeanC)}${f.tempRangeC ? ` <small>(${Math.round(f.tempRangeC[0])}…${Math.round(f.tempRangeC[1])})</small>` : ''}`,
      ),
      isSun
        ? this.cell('Planets', '8')
        : this.cell('Known moons', fmtInt(f.moons)),
    );
    if (!isSun && !isMoon) {
      cells.push(
        this.cell('Axial tilt', `${f.axialTiltDeg.toFixed(1)}°`),
        this.cell('Sunlight delay', `<span class="light-now">${fmtLightTime(f.distanceAU)}</span>`),
      );
    }

    this.body.innerHTML = `
      <p class="infopanel-overview">${def.overview}</p>
      <div class="data-grid">${cells.join('')}</div>
      <div class="concept-card">
        <div class="k">${def.concept.title}</div>
        <p>${def.concept.text}</p>
      </div>
      <div>
        <div class="u-label" style="margin-bottom:8px">Worth knowing</div>
        <ul class="fact-list">${def.quickFacts.map((q) => `<li>${q}</li>`).join('')}</ul>
      </div>
      <div class="panel-actions"></div>
    `;

    const actionsEl = this.body.querySelector('.panel-actions')!;
    const mkAction = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = label;
      b.addEventListener('click', fn);
      actionsEl.appendChild(b);
    };
    mkAction('Compare sizes', onCompare);
    if (id === 'earth') mkAction('Visit the Moon', () => this.state.select('moon'));
    if (id === 'moon') mkAction('Back to Earth', () => this.state.select('earth'));

    this.distValue = this.body.querySelector('.dist-now');
    this.lightValue = this.body.querySelector('.light-now');
    this.body.scrollTop = 0;
    this.root.classList.add('open');
  }

  private hide(): void {
    this.currentId = null;
    this.root.classList.remove('open');
  }

  /** Refresh the live distance readouts (called ~1 Hz). */
  updateLive(): void {
    if (!this.currentId || this.currentId === 'sun' || this.currentId === 'moon') return;
    const def = bodyById(this.currentId);
    if (!def.orbit) return;
    const au = heliocentricDistance(def.orbit, this.state.simDays);
    if (this.distValue) this.distValue.textContent = `${fmtAU(au, 3)} now`;
    if (this.lightValue) this.lightValue.textContent = fmtLightTime(au);
  }
}
