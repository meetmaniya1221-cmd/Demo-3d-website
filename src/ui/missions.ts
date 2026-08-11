/** Mission Explorer: six decades of Solar System exploration on a timeline,
 *  every mission linked to the worlds it studied. */
import { MISSIONS_SORTED, targetsOf, missionOf } from '../data/catalog';
import type { Mission } from '../data/types';
import { Overlay } from './overlays';

type Filter = 'all' | 'active' | 'inner' | 'outer' | 'small';

const INNER = new Set(['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'phobos', 'deimos']);
const SMALL = new Set([
  'ceres', 'vesta', 'pallas', 'hygiea', 'psyche', 'eros', 'bennu', 'ryugu',
  'halley', 'encke', '67p', 'swifttuttle', 'tempeltuttle', 'halebopp',
  'main-belt', 'kuiper-belt', 'pluto', 'charon',
]);

const STATUS_LABEL: Record<Mission['status'], string> = {
  active: 'Active',
  'en route': 'En route',
  completed: 'Completed',
};

export interface MissionsHost {
  selectObject: (id: string) => void;
}

export class MissionsOverlay extends Overlay {
  private filter: Filter = 'all';
  private filterButtons = new Map<Filter, HTMLButtonElement>();
  private pendingFocus: string | null = null;
  private host: MissionsHost;

  constructor(parent: HTMLElement, host: MissionsHost) {
    super(parent, 'Mission explorer', 'missions-title');
    this.host = host;
    const slot = this.root.querySelector('.overlay-head-slot')!;
    const tabs = document.createElement('div');
    tabs.className = 'overlay-tabs';
    const defs: Array<[Filter, string]> = [
      ['all', 'All'],
      ['active', 'Flying now'],
      ['inner', 'Inner system'],
      ['outer', 'Outer system'],
      ['small', 'Small bodies'],
    ];
    for (const [f, label] of defs) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => {
        this.filter = f;
        this.render();
      });
      tabs.appendChild(b);
      this.filterButtons.set(f, b);
    }
    slot.appendChild(tabs);
  }

  /** Open scrolled to one particular mission. */
  openAt(missionId: string): void {
    this.pendingFocus = missionId;
    this.filter = 'all';
    this.open();
  }

  protected onOpen(): void {
    this.render();
  }

  private matches(m: Mission): boolean {
    switch (this.filter) {
      case 'all':
        return true;
      case 'active':
        return m.status === 'active' || m.status === 'en route';
      case 'inner':
        return m.targets.some((t) => INNER.has(t));
      case 'outer':
        return m.targets.some((t) => !INNER.has(t) && !SMALL.has(t));
      case 'small':
        return m.targets.some((t) => SMALL.has(t));
    }
  }

  private render(): void {
    for (const [f, b] of this.filterButtons) b.classList.toggle('active', f === this.filter);
    const missions = MISSIONS_SORTED.filter((m) => this.matches(m));

    const decades = new Map<number, Mission[]>();
    for (const m of missions) {
      const d = Math.floor(m.launched / 10) * 10;
      (decades.get(d) ?? decades.set(d, []).get(d)!).push(m);
    }

    const intro = `
      <p class="overlay-note">
        Every robotic explorer here left Earth on a rocket and coasted for years on gravity and
        mathematics. Click a mission’s <b>target chips</b> to fly to the worlds it visited.
      </p>
    `;
    const groups = [...decades.entries()]
      .map(
        ([decade, list]) => `
        <div class="mission-decade">
          <div class="mission-decade-label">${decade}s</div>
          <div class="mission-cards">${list.map((m) => this.card(m)).join('')}</div>
        </div>`,
      )
      .join('');

    this.bodyEl.innerHTML = intro + (groups || '<p class="overlay-note">No missions match this filter.</p>');

    this.bodyEl.querySelectorAll<HTMLButtonElement>('[data-target]').forEach((b) =>
      b.addEventListener('click', () => {
        this.close();
        this.host.selectObject(b.dataset.target!);
      }),
    );

    if (this.pendingFocus) {
      const el = this.bodyEl.querySelector(`[data-mission-card="${this.pendingFocus}"]`);
      if (el instanceof HTMLElement) {
        el.classList.add('highlight');
        el.scrollIntoView({ block: 'center' });
      }
      this.pendingFocus = null;
    }
  }

  private card(m: Mission): string {
    const targets = targetsOf(m);
    const years = m.ended && m.ended !== m.launched ? `${m.launched}–${m.ended}` : `${m.launched}`;
    return `
      <article class="mission-card" data-mission-card="${m.id}">
        <div class="mission-head">
          <h3>${m.name}</h3>
          <span class="status-chip ${m.status.replace(' ', '-')}">${STATUS_LABEL[m.status]}</span>
        </div>
        <div class="mission-meta">${m.agency} · ${m.craft} · ${years}</div>
        <p class="mission-summary">${m.summary}</p>
        <ul class="mission-highlights">${m.highlights.map((hl) => `<li>${hl}</li>`).join('')}</ul>
        ${
          targets.length
            ? `<div class="chip-row">${targets
                .slice(0, 10)
                .map(
                  (t) =>
                    `<button class="chip mini" data-target="${t.id}"><i class="dot" style="background:#${t.color
                      .toString(16)
                      .padStart(6, '0')}"></i>${t.name}</button>`,
                )
                .join('')}</div>`
            : ''
        }
        <a class="mission-link" href="${m.url}" target="_blank" rel="noopener">Official mission page ↗</a>
      </article>
    `;
  }
}

export { missionOf };
