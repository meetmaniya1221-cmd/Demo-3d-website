/**
 * The compact shell: what the app looks like when it is held in one hand.
 *
 * The desktop chrome is a row of twelve chips across the top. On a phone that
 * row becomes a horizontal scroller with no affordance, so seven of the twelve
 * features are simply invisible - the user has no way to know Missions or the
 * Observatory exist. That is the difference between "responsive" and
 * "designed for the device".
 *
 * So on compact layouts the chip row is replaced by:
 *   - a slim top bar with the two things wanted mid-gesture (search, scale),
 *   - a bottom bar within thumb reach holding the four most-used destinations
 *     plus More,
 *   - a More sheet that shows every remaining feature as a labelled tile, so
 *     nothing is hidden behind a scroll the user cannot see.
 *
 * The bottom bar sits above the home indicator via safe-area insets, and gets
 * out of the way entirely in spacecraft mode, which has its own controls.
 */
import type { AppState } from '../sim/state';
import { isCompact, onDeviceChange } from './device';
import { Sheet } from './sheet';
import { sound } from '../audio';

export interface MobileNavCallbacks {
  onSearch: () => void;
  onAtlas: () => void;
  onTour: () => void;
  onJourney: () => void;
  onObservatory: () => void;
  onMissions: () => void;
  onMeteors: () => void;
  onCompare: () => void;
  onGravity: () => void;
  onSpacecraft: () => void;
  onLayers: () => void;
  onResetView: () => void;
}

interface Entry {
  id: string;
  label: string;
  icon: string;
  hint: string;
  run: () => void;
  primary?: boolean;
}

const svg = (paths: string, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths}</svg>`;

const ICONS = {
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4L21 21"/>'),
  atlas: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>'),
  craft: svg('<path d="M12 2c2.6 2.6 4 6.2 4 10l2.6 3.4v2.2L14 16h-4l-4.6 1.6v-2.2L8 12c0-3.8 1.4-7.4 4-10z"/><circle cx="12" cy="10" r="1.6"/>'),
  sky: svg('<path d="M12 3l1.9 4.6L18.7 9l-3.6 3.2 1 5-4.1-2.5L7.9 17l1-5L5.3 9l4.8-1.4z"/>'),
  missions: svg('<path d="M4 20c3-1 5-3 6-6"/><path d="M14 4c4 0 6 2 6 6-3 5-8 7-12 8 1-4 3-9 6-12z"/><circle cx="14.5" cy="9.5" r="1.6"/>'),
  meteors: svg('<path d="M3 14L10 7"/><path d="M7 19l6-6"/><circle cx="16.5" cy="7.5" r="3.5"/>'),
  compare: svg('<circle cx="8" cy="12" r="4"/><circle cx="17" cy="12" r="6"/>'),
  gravity: svg('<ellipse cx="12" cy="12" rx="9" ry="4"/><circle cx="12" cy="12" r="2.6"/>'),
  tour: svg('<path d="M5 4v16l14-8z"/>'),
  journey: svg('<path d="M4 18c6 0 6-12 12-12"/><circle cx="4" cy="18" r="1.8"/><circle cx="16" cy="6" r="1.8"/>'),
  layers: svg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  reset: svg('<path d="M4 10a8 8 0 1 1 1.2 6"/><path d="M3.4 16.6L5.2 16l.6 1.8"/><circle cx="12" cy="12" r="1.6"/>'),
  more: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  close: svg('<path d="M5 5l14 14M19 5L5 19"/>'),
};

export class MobileNav {
  private topBar: HTMLElement;
  private bottomBar: HTMLElement;
  private moreSheet: HTMLElement;
  private moreBackdrop: HTMLElement;
  private sheet: Sheet;
  private scaleBtn: HTMLButtonElement;
  private moreBtn!: HTMLButtonElement;
  private entries: Entry[];
  private state: AppState;
  private open = false;

  constructor(parent: HTMLElement, state: AppState, cb: MobileNavCallbacks) {
    this.state = state;
    this.entries = [
      { id: 'spacecraft', label: 'Fly', icon: ICONS.craft, hint: 'Board the research vessel', run: cb.onSpacecraft, primary: true },
      { id: 'atlas', label: 'Atlas', icon: ICONS.atlas, hint: 'Every world, catalogued', run: cb.onAtlas, primary: true },
      { id: 'sky', label: 'Sky', icon: ICONS.sky, hint: 'Night sky, stars, deep sky', run: cb.onObservatory, primary: true },
      { id: 'tour', label: 'Tour', icon: ICONS.tour, hint: 'Guided walk through the system', run: cb.onTour },
      { id: 'journey', label: 'Journey', icon: ICONS.journey, hint: 'Ride a probe to the outer planets', run: cb.onJourney },
      { id: 'missions', label: 'Missions', icon: ICONS.missions, hint: 'Real spacecraft and where they went', run: cb.onMissions },
      { id: 'meteors', label: 'Meteors', icon: ICONS.meteors, hint: 'Showers and their parent comets', run: cb.onMeteors },
      { id: 'compare', label: 'Compare', icon: ICONS.compare, hint: 'Sizes and distances side by side', run: cb.onCompare },
      { id: 'gravity', label: 'Gravity', icon: ICONS.gravity, hint: 'Your weight on every world', run: cb.onGravity },
      { id: 'layers', label: 'View', icon: ICONS.layers, hint: 'Orbits, labels, belts, grid', run: cb.onLayers },
      { id: 'reset', label: 'Recentre', icon: ICONS.reset, hint: 'Back to the whole system', run: cb.onResetView },
    ];

    // ---- top bar ----
    this.topBar = document.createElement('div');
    this.topBar.className = 'mnav-top';
    const searchBtn = document.createElement('button');
    searchBtn.className = 'mnav-search';
    searchBtn.dataset.sfx = 'none';
    searchBtn.innerHTML = `${ICONS.search}<span>Search worlds</span>`;
    searchBtn.setAttribute('aria-label', 'Search worlds, moons and comets');
    searchBtn.addEventListener('click', () => cb.onSearch());

    this.scaleBtn = document.createElement('button');
    this.scaleBtn.className = 'mnav-scale';
    this.scaleBtn.addEventListener('click', () =>
      state.setScaleMode(state.scaleMode === 'explorer' ? 'true' : 'explorer'),
    );
    this.topBar.append(searchBtn, this.scaleBtn);

    // ---- bottom bar ----
    this.bottomBar = document.createElement('nav');
    this.bottomBar.className = 'mnav-bottom';
    this.bottomBar.setAttribute('aria-label', 'Main');
    for (const e of this.entries.filter((x) => x.primary)) {
      this.bottomBar.appendChild(this.tabButton(e));
    }
    this.moreBtn = document.createElement('button');
    this.moreBtn.className = 'mnav-tab';
    this.moreBtn.dataset.sfx = 'none';
    this.moreBtn.innerHTML = `${ICONS.more}<span>More</span>`;
    this.moreBtn.setAttribute('aria-haspopup', 'dialog');
    this.moreBtn.setAttribute('aria-expanded', 'false');
    this.moreBtn.addEventListener('click', () => this.toggleMore());
    this.bottomBar.appendChild(this.moreBtn);

    // ---- more sheet ----
    this.moreBackdrop = document.createElement('div');
    this.moreBackdrop.className = 'mnav-backdrop';
    this.moreBackdrop.hidden = true;
    this.moreBackdrop.addEventListener('click', () => this.closeMore());

    this.moreSheet = document.createElement('div');
    this.moreSheet.className = 'mnav-sheet';
    this.moreSheet.hidden = true;
    this.moreSheet.setAttribute('role', 'dialog');
    this.moreSheet.setAttribute('aria-modal', 'true');
    this.moreSheet.setAttribute('aria-label', 'All features');
    const head = document.createElement('div');
    head.className = 'mnav-sheet-head';
    head.innerHTML = '<div class="mnav-sheet-title">Explore</div>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'mnav-sheet-close';
    closeBtn.dataset.sfx = 'none';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = ICONS.close;
    closeBtn.addEventListener('click', () => this.closeMore());
    head.appendChild(closeBtn);
    const grid = document.createElement('div');
    grid.className = 'mnav-grid';
    for (const e of this.entries) grid.appendChild(this.tile(e));
    this.moreSheet.append(head, grid);

    parent.append(this.topBar, this.bottomBar, this.moreBackdrop, this.moreSheet);

    this.sheet = new Sheet(this.moreSheet, {
      scroller: grid,
      onDismiss: () => this.closeMore(),
      handles: [head],
    });

    state.on('scale', () => this.syncScale());
    this.syncScale();
    this.applyLayout();
    onDeviceChange(() => this.applyLayout());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) {
        e.stopPropagation();
        this.closeMore();
      }
    });
  }

  private tabButton(e: Entry): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'mnav-tab';
    b.dataset.nav = e.id;
    b.innerHTML = `${e.icon}<span>${e.label}</span>`;
    b.addEventListener('click', () => e.run());
    return b;
  }

  private tile(e: Entry): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'mnav-tile';
    b.dataset.nav = e.id;
    b.innerHTML = `<i>${e.icon}</i><b>${e.label}</b><em>${e.hint}</em>`;
    b.addEventListener('click', () => {
      this.closeMore();
      // let the sheet start closing before the next view takes the stage
      window.setTimeout(() => e.run(), 90);
    });
    return b;
  }

  private syncScale(): void {
    const explorer = this.state.scaleMode === 'explorer';
    this.scaleBtn.textContent = explorer ? 'Explorer' : 'True scale';
    this.scaleBtn.classList.toggle('true-scale', !explorer);
    this.scaleBtn.setAttribute(
      'aria-label',
      explorer ? 'Scale: Explorer. Switch to true scale' : 'Scale: True. Switch to explorer view',
    );
  }

  private toggleMore(): void {
    if (this.open) this.closeMore();
    else this.openMore();
  }

  private openMore(): void {
    this.open = true;
    sound.play('click', 0.22);
    this.moreBackdrop.hidden = false;
    this.moreSheet.hidden = false;
    this.moreBtn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      this.moreBackdrop.classList.add('open');
      this.moreSheet.classList.add('open');
      this.sheet.present();
    });
    document.body.classList.add('mnav-open');
    (this.moreSheet.querySelector('.mnav-tile') as HTMLElement | null)?.focus();
  }

  private closeMore(): void {
    if (!this.open) return;
    this.open = false;
    sound.play('back', 0.3);
    this.moreBackdrop.classList.remove('open');
    this.moreSheet.classList.remove('open');
    this.moreBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('mnav-open');
    window.setTimeout(() => {
      if (this.open) return;
      this.moreBackdrop.hidden = true;
      this.moreSheet.hidden = true;
      this.sheet.reset();
    }, 300);
    this.moreBtn.focus();
  }

  /** Present only on compact layouts; the desktop chrome owns the rest. */
  private applyLayout(): void {
    const compact = isCompact();
    document.body.classList.toggle('compact-shell', compact);
    for (const el of [this.topBar, this.bottomBar]) el.classList.toggle('on', compact);
    if (!compact && this.open) this.closeMore();
  }
}
