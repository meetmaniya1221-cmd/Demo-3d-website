/** HUD chrome: brand, top actions, planet rail, view toggles, time bar. */
import { SUN, PLANETS } from '../data/bodies';
import { AppState, SPEED_PRESETS } from '../sim/state';
import { fmtSimDate } from './format';

const PLAY_ICON =
  '<svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor" aria-hidden="true"><path d="M0 0l11 6-11 6z"/></svg>';
const PAUSE_ICON =
  '<svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true"><rect width="3.4" height="12" rx="1"/><rect x="6.6" width="3.4" height="12" rx="1"/></svg>';

export interface HudCallbacks {
  onTour: () => void;
  onCompare: () => void;
  onGravity: () => void;
}

export class Hud {
  private state: AppState;
  private playBtn!: HTMLButtonElement;
  private speedSlider!: HTMLInputElement;
  private speedLabel!: HTMLElement;
  private dateEl!: HTMLElement;
  private railButtons = new Map<string, HTMLButtonElement>();
  private scaleButtons: { explorer: HTMLButtonElement; true: HTMLButtonElement };
  private toggleChips = new Map<string, HTMLButtonElement>();

  constructor(parent: HTMLElement, state: AppState, cb: HudCallbacks) {
    this.state = state;

    // brand
    const brand = document.createElement('header');
    brand.className = 'brand';
    brand.innerHTML =
      '<div class="brand-name">ORRERY</div><div class="brand-tag">Interactive Solar System</div>';
    parent.appendChild(brand);

    // top actions
    const actions = document.createElement('nav');
    actions.className = 'top-actions';
    actions.setAttribute('aria-label', 'Main actions');

    const tourBtn = this.chip('Tour', () => cb.onTour());
    const compareBtn = this.chip('Compare', () => cb.onCompare());
    const gravityBtn = this.chip('Gravity', () => cb.onGravity());

    const scaleSwitch = document.createElement('div');
    scaleSwitch.className = 'scale-switch';
    scaleSwitch.setAttribute('role', 'group');
    scaleSwitch.setAttribute('aria-label', 'Scale mode');
    const mkScale = (label: string, mode: 'explorer' | 'true') => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => state.setScaleMode(mode));
      scaleSwitch.appendChild(b);
      return b;
    };
    this.scaleButtons = {
      explorer: mkScale('Explorer', 'explorer'),
      true: mkScale('True scale', 'true'),
    };
    actions.append(tourBtn, compareBtn, gravityBtn, scaleSwitch);
    parent.appendChild(actions);

    // planet rail
    const rail = document.createElement('nav');
    rail.className = 'rail';
    rail.setAttribute('aria-label', 'Bodies');
    for (const def of [SUN, ...PLANETS]) {
      const b = document.createElement('button');
      b.innerHTML = `<i class="dot" style="background:#${def.color
        .toString(16)
        .padStart(6, '0')}"></i><span class="txt">${def.name}</span>`;
      b.setAttribute('aria-label', `Fly to ${def.name}`);
      b.addEventListener('click', () => state.select(def.id));
      rail.appendChild(b);
      this.railButtons.set(def.id, b);
    }
    parent.appendChild(rail);

    // view toggles
    const toggles = document.createElement('div');
    toggles.className = 'view-toggles';
    const mkToggle = (label: string, key: 'showOrbits' | 'showLabels' | 'showHZ') => {
      const b = this.chip(label, () => state.setToggle(key, !state[key]));
      b.setAttribute('aria-pressed', String(state[key]));
      toggles.appendChild(b);
      this.toggleChips.set(key, b);
    };
    mkToggle('Orbits', 'showOrbits');
    mkToggle('Labels', 'showLabels');
    mkToggle('Habitable zone', 'showHZ');
    parent.appendChild(toggles);

    // time bar
    const bar = document.createElement('div');
    bar.className = 'timebar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Time controls');

    this.playBtn = document.createElement('button');
    this.playBtn.className = 'play';
    this.playBtn.setAttribute('aria-label', 'Pause simulation');
    this.playBtn.innerHTML = PAUSE_ICON;
    this.playBtn.addEventListener('click', () => state.setPaused(!state.paused));

    const speedGroup = document.createElement('div');
    speedGroup.className = 'speed-group';
    const labelRow = document.createElement('div');
    labelRow.className = 'speed-label';
    labelRow.innerHTML = '<span>Time speed</span><b></b>';
    this.speedLabel = labelRow.querySelector('b')!;
    this.speedSlider = document.createElement('input');
    this.speedSlider.type = 'range';
    this.speedSlider.min = '0';
    this.speedSlider.max = String(SPEED_PRESETS.length - 1);
    this.speedSlider.step = '1';
    this.speedSlider.value = String(state.speedIndex);
    this.speedSlider.setAttribute('aria-label', 'Simulation speed');
    this.speedSlider.setAttribute('aria-valuetext', SPEED_PRESETS[state.speedIndex].label);
    this.speedSlider.addEventListener('input', () =>
      state.setSpeedIndex(Number(this.speedSlider.value)),
    );
    speedGroup.append(labelRow, this.speedSlider);

    this.dateEl = document.createElement('div');
    this.dateEl.className = 'sim-date';

    const nowBtn = document.createElement('button');
    nowBtn.className = 'now-btn';
    nowBtn.textContent = 'Today';
    nowBtn.setAttribute('aria-label', 'Reset simulation to today');
    nowBtn.addEventListener('click', () => state.jumpToNow());

    bar.append(this.playBtn, speedGroup, this.dateEl, nowBtn);
    parent.appendChild(bar);

    // reactive wiring
    state.on('pause', (p) => {
      this.playBtn.innerHTML = p ? PLAY_ICON : PAUSE_ICON;
      this.playBtn.setAttribute('aria-label', p ? 'Play simulation' : 'Pause simulation');
    });
    state.on('speed', (i) => {
      this.speedSlider.value = String(i);
      this.speedSlider.setAttribute('aria-valuetext', SPEED_PRESETS[i].label);
      this.speedLabel.textContent = SPEED_PRESETS[i].label;
    });
    state.on('select', (id) => this.syncSelection(id));
    state.on('scale', () => this.syncScale());
    state.on('toggles', () => this.syncToggles());

    this.speedLabel.textContent = SPEED_PRESETS[state.speedIndex].label;
    this.syncScale();
    this.syncToggles();
  }

  private chip(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  private syncSelection(id: string | null): void {
    for (const [bid, btn] of this.railButtons) {
      const active = bid === id;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    }
  }

  private syncScale(): void {
    const mode = this.state.scaleMode;
    this.scaleButtons.explorer.classList.toggle('active', mode === 'explorer');
    this.scaleButtons.explorer.setAttribute('aria-pressed', String(mode === 'explorer'));
    this.scaleButtons.true.classList.toggle('active', mode === 'true');
    this.scaleButtons.true.setAttribute('aria-pressed', String(mode === 'true'));
  }

  private syncToggles(): void {
    const map: Array<['showOrbits' | 'showLabels' | 'showHZ']> = [
      ['showOrbits'],
      ['showLabels'],
      ['showHZ'],
    ];
    for (const [key] of map) {
      const chipEl = this.toggleChips.get(key)!;
      chipEl.classList.toggle('active', this.state[key]);
      chipEl.setAttribute('aria-pressed', String(this.state[key]));
    }
  }

  /** Called once per second from the app loop. */
  updateClock(): void {
    this.dateEl.textContent = fmtSimDate(this.state.simDays);
  }
}
