/** HUD chrome: brand, top actions, time bar. Navigation lives in labels,
 *  search and the atlas; visibility lives in the View panel - the HUD stays
 *  out of the scene's way. */
import { AppState, SPEED_PRESETS } from '../sim/state';
import { fmtSimDate, fmtSimTime } from './format';
import { DatePicker } from './datepicker';
import { sound } from '../audio';

const PLAY_ICON =
  '<svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor" aria-hidden="true"><path d="M0 0l11 6-11 6z"/></svg>';
const PAUSE_ICON =
  '<svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true"><rect width="3.4" height="12" rx="1"/><rect x="6.6" width="3.4" height="12" rx="1"/></svg>';
const REWIND_ICON =
  '<svg width="14" height="12" viewBox="0 0 14 12" fill="currentColor" aria-hidden="true"><path d="M7 0L0 6l7 6V0z"/><path d="M14 0L7 6l7 6V0z"/></svg>';

export interface HudCallbacks {
  onTour: () => void;
  onCompare: () => void;
  onGravity: () => void;
  onSearch: () => void;
  onAtlas: () => void;
  onJourney: () => void;
  onMissions: () => void;
  onMeteors: () => void;
  onObservatory: () => void;
  onSpacecraft: () => void;
  onSystems: () => void;
  onGalaxy: () => void;
}

export class Hud {
  private state: AppState;
  private playBtn!: HTMLButtonElement;
  private speedSlider!: HTMLInputElement;
  private speedLabel!: HTMLElement;
  private dateEl!: HTMLElement;
  readonly datePicker: DatePicker;
  private scaleButtons: { explorer: HTMLButtonElement; true: HTMLButtonElement };

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

    const searchBtn = document.createElement('button');
    searchBtn.className = 'chip search-chip';
    searchBtn.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.7"/><path d="M10.2 10.2L14 14"/></svg>Search<kbd>/</kbd>';
    searchBtn.setAttribute('aria-label', 'Search everything (shortcut: /)');
    // search/atlas play their own open/close tones - skip the generic tick
    searchBtn.dataset.sfx = 'none';
    searchBtn.addEventListener('click', () => cb.onSearch());

    const atlasBtn = this.chip('Atlas', () => cb.onAtlas());
    atlasBtn.dataset.sfx = 'none';
    const tourBtn = this.chip('Tour', () => cb.onTour());
    const journeyBtn = this.chip('Journey', () => cb.onJourney());
    const craftBtn = this.chip('Spacecraft', () => cb.onSpacecraft());
    craftBtn.classList.add('feature');
    craftBtn.title =
      'Board a research vessel and fly the real Solar System from inside its cockpit';
    const systemsBtn = this.chip('Nearby systems', () => cb.onSystems());
    systemsBtn.classList.add('feature');
    systemsBtn.dataset.sfx = 'none';
    systemsBtn.title = 'Travel to the nearest star systems and their planets';
    const galaxyBtn = this.chip('Galaxy', () => cb.onGalaxy());
    galaxyBtn.classList.add('feature');
    galaxyBtn.title =
      'Leave the Solar System: navigate the Milky Way to Sagittarius A*, the central black hole';
    const skyBtn = this.chip('Sky', () => cb.onObservatory());
    skyBtn.title = 'Observatory: night sky, near stars, deep sky';
    const missionsBtn = this.chip('Missions', () => cb.onMissions());
    const meteorsBtn = this.chip('Meteors', () => cb.onMeteors());
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

    const muteBtn = document.createElement('button');
    muteBtn.className = 'chip';
    const syncMute = () => {
      muteBtn.textContent = sound.muted ? '🔇' : '🔊';
      muteBtn.setAttribute('aria-label', sound.muted ? 'Unmute sound' : 'Mute sound');
      muteBtn.setAttribute('aria-pressed', String(!sound.muted));
    };
    muteBtn.addEventListener('click', () => {
      sound.init();
      sound.setMuted(!sound.muted);
      syncMute();
    });
    syncMute();

    actions.append(
      searchBtn,
      craftBtn,
      systemsBtn,
      galaxyBtn,
      atlasBtn,
      tourBtn,
      journeyBtn,
      skyBtn,
      missionsBtn,
      meteorsBtn,
      compareBtn,
      gravityBtn,
      scaleSwitch,
      muteBtn,
    );
    parent.appendChild(actions);

    // time bar
    const bar = document.createElement('div');
    bar.className = 'timebar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Time controls');

    const rewindBtn = document.createElement('button');
    rewindBtn.className = 'play rewind';
    rewindBtn.setAttribute('aria-label', 'Run time backwards');
    rewindBtn.setAttribute('aria-pressed', 'false');
    rewindBtn.title = 'Rewind: run the simulation backwards';
    rewindBtn.innerHTML = REWIND_ICON;
    rewindBtn.addEventListener('click', () =>
      state.setDirection(state.direction === 1 ? -1 : 1),
    );

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

    // the date readout doubles as the time machine's date picker
    this.dateEl = document.createElement('button');
    this.dateEl.className = 'sim-date';
    this.dateEl.title = 'Time machine: jump to any date';
    this.dateEl.setAttribute('aria-label', 'Simulation date - activate to pick another date');
    this.dateEl.setAttribute('aria-haspopup', 'dialog');
    // the picker owns its open/close tones (open ticks, dismiss plays back)
    this.dateEl.dataset.sfx = 'none';
    this.dateEl.addEventListener('click', () => this.datePicker.toggle());

    const nowBtn = document.createElement('button');
    nowBtn.className = 'now-btn';
    nowBtn.textContent = 'Today';
    nowBtn.setAttribute('aria-label', 'Reset simulation to today');
    nowBtn.addEventListener('click', () => state.jumpToNow());

    bar.append(rewindBtn, this.playBtn, speedGroup, this.dateEl, nowBtn);
    parent.appendChild(bar);
    this.datePicker = new DatePicker(parent, this.dateEl, state);

    // reactive wiring
    state.on('pause', (p) => {
      this.playBtn.innerHTML = p ? PLAY_ICON : PAUSE_ICON;
      this.playBtn.setAttribute('aria-label', p ? 'Play simulation' : 'Pause simulation');
    });
    state.on('speed', (i) => {
      this.speedSlider.value = String(i);
      this.speedSlider.setAttribute('aria-valuetext', SPEED_PRESETS[i].label);
      this.syncSpeedLabel();
    });
    state.on('direction', (d) => {
      rewindBtn.classList.toggle('active', d === -1);
      rewindBtn.setAttribute('aria-pressed', String(d === -1));
      this.syncSpeedLabel();
      this.updateClock();
    });
    state.on('timejump', () => this.updateClock());
    state.on('scale', () => this.syncScale());

    this.syncSpeedLabel();
    this.syncScale();
  }

  private chip(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  private syncSpeedLabel(): void {
    const label = SPEED_PRESETS[this.state.speedIndex].label;
    this.speedLabel.textContent = this.state.direction === -1 ? `${label} · REWIND` : label;
  }

  private syncScale(): void {
    const mode = this.state.scaleMode;
    this.scaleButtons.explorer.classList.toggle('active', mode === 'explorer');
    this.scaleButtons.explorer.setAttribute('aria-pressed', String(mode === 'explorer'));
    this.scaleButtons.true.classList.toggle('active', mode === 'true');
    this.scaleButtons.true.setAttribute('aria-pressed', String(mode === 'true'));
  }

  /** Called once per second from the app loop. */
  updateClock(): void {
    // at sub-day speeds the date alone would look frozen - show the clock too
    const showTime = Math.abs(this.state.speed.daysPerSec) < 1;
    const date = fmtSimDate(this.state.simDays);
    const text = showTime ? `${date} · ${fmtSimTime(this.state.simDays)}` : date;
    if (this.dateEl.textContent !== text) {
      this.dateEl.textContent = text;
      // keep the live date in the accessible name, not just the visual text
      this.dateEl.setAttribute(
        'aria-label',
        `Simulation date: ${text}. Activate to pick another date`,
      );
    }
  }
}
