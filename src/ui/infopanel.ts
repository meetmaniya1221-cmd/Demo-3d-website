/** The right-hand (bottom sheet on mobile) information panel - one renderer
 *  for every catalog object type, from the Sun to a comet nucleus. */
import { EARTH_GRAVITY, heliocentricDistance } from '../data/bodies';
import { catalogObject, missionsFor } from '../data/catalog';
import { TYPE_LABEL, type CatalogObject } from '../data/types';
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

export interface InfoPanelHost {
  onCompare: () => void;
  openMission: (missionId: string) => void;
  /** Live heliocentric distance for small bodies rendered by the scene. */
  liveAU: (id: string) => number | null;
  cometActivity: (id: string) => number;
}

const TEXTURE_BADGE: Record<string, string> = {
  photo: 'Mission imagery',
  tinted: 'Mission imagery · display-tinted',
  procedural: 'Artistic rendering',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export class InfoPanel {
  private root: HTMLElement;
  private title: HTMLElement;
  private kind: HTMLElement;
  private body: HTMLElement;
  private distValue: HTMLElement | null = null;
  private lightValue: HTMLElement | null = null;
  private activityValue: HTMLElement | null = null;
  private currentId: string | null = null;
  private state: AppState;
  private host: InfoPanelHost;

  constructor(parent: HTMLElement, state: AppState, host: InfoPanelHost) {
    this.state = state;
    this.host = host;
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

    state.on('select', (id) => (id ? this.show(id) : this.hide()));
  }

  private cell(k: string, v: string): string {
    return `<div class="data-cell"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  }

  private buildCells(def: CatalogObject): string[] {
    const f = def.physical;
    const cells: string[] = [];
    const isSun = def.id === 'sun';

    if (f.dimensionsKm) {
      cells.push(this.cell('Size', `${f.dimensionsKm} km`));
    } else if (f.diameterKm > 0) {
      cells.push(this.cell('Diameter', fmtKm(f.diameterKm)));
    }
    if (f.massKg) cells.push(this.cell('Mass', fmtMass(f.massKg)));
    if (f.gravity !== undefined) {
      const rel = f.gravity / EARTH_GRAVITY;
      const relTxt = rel >= 0.01 ? `${rel.toFixed(2)}×⊕` : `${(rel * 1000).toFixed(1)}‰ of ⊕`;
      cells.push(
        this.cell('Surface gravity', `${f.gravity >= 0.01 ? f.gravity.toFixed(f.gravity < 1 ? 2 : 1) : f.gravity.toExponential(1)} m/s² <small>(${relTxt})</small>`),
      );
    }
    if (f.density) cells.push(this.cell('Density', `${f.density.toFixed(2)} g/cm³`));
    if (f.rotationHours !== undefined) {
      const retro = f.rotationHours < 0 ? ' <small>retrograde</small>' : '';
      cells.push(this.cell(isSun ? 'Rotation period' : 'Rotation', `${fmtHours(f.rotationHours)}${retro}`));
    } else if (f.tidallyLocked) {
      cells.push(this.cell('Rotation', 'Tidally locked'));
    }

    if (def.satOrbit) {
      const parentName = def.parent ? (catalogObject(def.parent)?.name ?? def.parent) : '?';
      cells.push(
        this.cell(`Orbit around ${esc(parentName)}`, fmtDays(Math.abs(def.satOrbit.periodDays))),
        this.cell(`Distance from ${esc(parentName)}`, fmtKm(def.satOrbit.distanceKm)),
      );
      if (def.satOrbit.periodDays < 0) {
        cells.push(this.cell('Orbit direction', 'Retrograde <small>(backwards)</small>'));
      }
    } else if (def.orbit) {
      cells.push(
        this.cell('Orbital period', fmtDays(def.orbit.periodDays)),
        this.cell('Distance from Sun', `<span class="dist-now">${fmtAU(def.orbit.a)}</span>`),
        this.cell('Sunlight delay', `<span class="light-now">${fmtLightTime(def.orbit.a)}</span>`),
      );
    }

    if (f.tempMeanC !== undefined) {
      cells.push(
        this.cell(
          isSun ? 'Surface temp' : 'Mean temp',
          `${fmtTempC(f.tempMeanC)}${f.tempRangeC ? ` <small>(${Math.round(f.tempRangeC[0])}…${Math.round(f.tempRangeC[1])})</small>` : ''}`,
        ),
      );
    }
    if (isSun) cells.push(this.cell('Planets', '8'));
    else if (f.moons !== undefined) cells.push(this.cell('Known moons', fmtInt(f.moons)));
    if (f.axialTiltDeg !== undefined && !isSun) {
      cells.push(this.cell('Axial tilt', `${f.axialTiltDeg.toFixed(1)}°`));
    }
    if (f.albedo !== undefined) {
      cells.push(this.cell('Albedo', `${f.albedo}<small> (reflects ${Math.round(f.albedo * 100)}% of light)</small>`));
    }
    return cells;
  }

  private cometBlock(def: CatalogObject): string {
    const c = def.comet;
    if (!c) return '';
    const act = this.host.cometActivity(def.id);
    const pct = Math.round(Math.min(1, act / 4) * 100);
    return `
      <div class="comet-card">
        <div class="k">Comet activity right now</div>
        <div class="activity-row">
          <div class="activity-bar"><i class="activity-fill" style="width:${pct}%"></i></div>
          <span class="activity-label">${
            act < 0.05 ? 'Frozen - too far from the Sun' : act < 1 ? 'Waking up' : act < 2.5 ? 'Active - tails growing' : 'Highly active'
          }</span>
        </div>
        <div class="data-grid" style="margin-top:10px">
          ${this.cell('Perihelion (closest)', fmtAU(c.qAU))}
          ${this.cell('Aphelion (farthest)', fmtAU(c.aphelionAU, 1))}
          ${this.cell('Last perihelion', c.lastPerihelion)}
          ${c.nextPerihelion ? this.cell('Next perihelion', c.nextPerihelion) : ''}
        </div>
        <p style="margin:10px 0 0">${esc(c.origin)}.${
          c.meteorShower
            ? ` Debris shed along this orbit burns up in Earth’s atmosphere as the <b>${esc(c.meteorShower)}</b> meteor shower.`
            : ''
        }</p>
      </div>
    `;
  }

  private show(id: string): void {
    const def = catalogObject(id);
    if (!def) return;
    this.currentId = id;
    this.title.textContent = def.name;
    this.kind.textContent = def.category ?? TYPE_LABEL[def.type];

    const badge = def.texture ? TEXTURE_BADGE[def.texture.kind] : null;
    const missions = missionsFor(id);

    const sections: string[] = [
      `<p class="infopanel-overview">${def.overview}</p>`,
      `<div class="data-grid">${this.buildCells(def).join('')}</div>`,
      this.cometBlock(def),
    ];

    if (def.atmosphere || def.composition) {
      sections.push(`
        <div class="composition-block">
          ${def.atmosphere ? `<div class="data-line"><span class="k">Atmosphere</span><p>${def.atmosphere}</p></div>` : ''}
          ${def.composition ? `<div class="data-line"><span class="k">Made of</span><p>${def.composition}</p></div>` : ''}
        </div>
      `);
    }

    if (def.discovery) {
      sections.push(
        `<div class="data-line"><span class="k">Discovered</span><p>${esc(String(def.discovery.year))} by ${esc(def.discovery.by)}${def.discovery.how ? ` <small>(${esc(def.discovery.how)})</small>` : ''}</p></div>`,
      );
    }

    if (def.concept) {
      sections.push(`
        <div class="concept-card">
          <div class="k">${def.concept.title}</div>
          <p>${def.concept.text}</p>
        </div>
      `);
    }

    sections.push(`
      <div>
        <div class="u-label" style="margin-bottom:8px">Worth knowing</div>
        <ul class="fact-list">${def.quickFacts.map((q) => `<li>${q}</li>`).join('')}</ul>
      </div>
    `);

    if (missions.length) {
      sections.push(`
        <div>
          <div class="u-label" style="margin-bottom:8px">Missions that came here</div>
          <div class="chip-row mission-chips">${missions
            .map(
              (m) =>
                `<button class="chip mission-chip" data-mission="${m.id}">${esc(m.name)} <small>${m.launched}</small></button>`,
            )
            .join('')}</div>
        </div>
      `);
    }

    if (def.related?.length) {
      const rel = def.related
        .map((rid) => catalogObject(rid))
        .filter((r): r is CatalogObject => !!r);
      if (rel.length) {
        sections.push(`
          <div>
            <div class="u-label" style="margin-bottom:8px">Related worlds</div>
            <div class="chip-row">${rel
              .map((r) => `<button class="chip related-chip" data-related="${r.id}">${esc(r.name)}</button>`)
              .join('')}</div>
          </div>
        `);
      }
    }

    if (def.uncertainty) {
      sections.push(`<p class="fine-print">⚠ ${esc(def.uncertainty)}</p>`);
    }

    const sourceLinks = def.sources
      .map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a>`)
      .join(' · ');
    sections.push(`
      <div class="sources-block">
        ${badge ? `<div class="texture-badge${def.texture!.kind === 'procedural' ? ' artistic' : ''}">${badge}</div>` : ''}
        ${def.texture?.credit ? `<p class="fine-print">Surface map: ${esc(def.texture.credit)}${def.texture.note ? ` - ${esc(def.texture.note)}` : ''}</p>` : ''}
        <p class="fine-print">Data: ${sourceLinks}</p>
        ${def.positionAccuracy === 'approximate' ? '<p class="fine-print">Orbit shape and orientation are real; the position along the orbit is approximate.</p>' : ''}
      </div>
    `);

    sections.push('<div class="panel-actions"></div>');
    this.body.innerHTML = sections.join('');

    const actionsEl = this.body.querySelector('.panel-actions')!;
    const mkAction = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = label;
      b.addEventListener('click', fn);
      actionsEl.appendChild(b);
    };
    mkAction('Compare sizes', this.host.onCompare);
    if (def.parent && def.type === 'moon') {
      const parentName = catalogObject(def.parent)?.name ?? def.parent;
      mkAction(`Back to ${parentName}`, () => this.state.select(def.parent));
    }

    this.body.querySelectorAll<HTMLButtonElement>('.mission-chip').forEach((b) =>
      b.addEventListener('click', () => this.host.openMission(b.dataset.mission!)),
    );
    this.body.querySelectorAll<HTMLButtonElement>('.related-chip').forEach((b) =>
      b.addEventListener('click', () => this.state.select(b.dataset.related!)),
    );

    this.distValue = this.body.querySelector('.dist-now');
    this.lightValue = this.body.querySelector('.light-now');
    this.activityValue = this.body.querySelector('.activity-label');
    this.body.scrollTop = 0;
    this.root.classList.add('open');
  }

  private hide(): void {
    this.currentId = null;
    this.root.classList.remove('open');
  }

  /** Refresh the live distance readouts (called ~1 Hz). */
  updateLive(): void {
    if (!this.currentId) return;
    const def = catalogObject(this.currentId);
    if (!def?.orbit) return;
    const au = this.host.liveAU(this.currentId) ?? heliocentricDistance(def.orbit, this.state.simDays);
    if (this.distValue) this.distValue.textContent = `${fmtAU(au, au > 50 ? 1 : 3)} now`;
    if (this.lightValue) this.lightValue.textContent = fmtLightTime(au);
    void this.activityValue;
  }
}
