/**
 * Spacecraft mode's instrument panel.
 *
 * Compact by design: the windows are the point, so every panel hugs an edge
 * and the middle of the screen stays glass. Numbers are the real ones - the
 * physical velocity and the time compression are shown as separate quantities
 * throughout, never multiplied together into a single misleading "speed".
 */
import * as THREE from 'three';
import { TYPE_LABEL, type CatalogObject } from '../data/types';
import { catalogObject } from '../data/catalog';
import { isCompact, onDeviceChange } from './device';
import { fmtInt, fmtSimDate, fmtSimTime } from './format';
import { magnitudeNote } from '../scene/nakedeye';
import {
  THROTTLE_STEPS,
  THRUST_STEPS_MS2,
  TIME_STEPS,
  FASTEST_PROBE_KMS,
  type AttitudeHold,
  type FlightMode,
  type OrbitTelemetry,
} from '../spacecraft/ship';
import { BURN_AXES, BURN_EFFECT, BURN_LABEL } from '../spacecraft/orbit';
import {
  KM_PER_UNIT,
  targetableObjects,
  type Neighbour,
  type RegionInfo,
} from '../spacecraft/ephemeris';

export interface Telemetry {
  mode: FlightMode;
  paused: boolean;
  targetId: string | null;
  speedKms: number;
  cmdKms: number;
  throttleIndex: number;
  timeIndex: number;
  effectiveTimeScale: number;
  simDays: number;
  posAU: THREE.Vector3;
  sunDistAU: number;
  earthDistAU: number;
  region: RegionInfo;
  neighbours: Neighbour[];
  distanceTravelledKm: number;
  targetDistKm: number | null;
  targetAngularDeg: number | null;
  /** Height above the target's surface. */
  targetAltitudeKm: number | null;
  targetEtaSec: number | null;
  targetBearing: { yaw: number; pitch: number } | null;
  targetMag: number | null;
  /** Body whose motion the hull is riding, if any. */
  frameName: string | null;
  /** Body the active flight mode is attached to. */
  anchorName: string | null;
  /** Velocity the transit-time estimate is quoted at. */
  etaVelocityKms: number;
  orbit: OrbitTelemetry | null;
  /** Attitude the flight computer is holding. */
  hold: AttitudeHold;
  /** Main-engine acceleration at the current notch, m/s². */
  thrustMs2: number;
  warning: { name: string; severity: number } | null;
  sunRadii: number;
  /** Screen position of the target, and whether it is in front of the camera. */
  targetScreen: { x: number; y: number; front: boolean } | null;
  fov: number;
  navOverlay: boolean;
  gazeLock: boolean;
}

export interface SpacecraftUiCallbacks {
  onExit: () => void;
  onSelectTarget: (id: string) => void;
  onTravel: (closeness: number) => void;
  onOrbit: () => void;
  onFlyby: () => void;
  onFollow: () => void;
  onAbort: () => void;
  onThrottle: (index: number) => void;
  onBrake: () => void;
  onAccel: () => void;
  onTime: (index: number) => void;
  onStop: () => void;
  onPause: () => void;
  onFov: (deg: number) => void;
  onNavOverlay: (on: boolean) => void;
  onLookPreset: (yawDeg: number, pitchDeg: number) => void;
  onGazeLock: (on: boolean) => void;
  onAlign: () => void;
  onHold: (hold: AttitudeHold) => void;
  onReleaseOrbit: () => void;
}

const MODE_LABEL: Record<FlightMode, string> = {
  free: 'Free flight',
  transit: 'Target transit',
  orbit: 'Orbit',
  flyby: 'Fly-by',
  follow: 'Station-keeping',
};

const AU_KM = 149_597_870.7;
const tmpAU = new THREE.Vector3();

/** Distance with a sensible unit: km → million km → AU. */
export function fmtSpaceDist(km: number): string {
  const au = km / AU_KM;
  if (au >= 0.02) return `${au.toFixed(au >= 10 ? 2 : 3)} AU`;
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)} million km`;
  if (km >= 1000) return `${fmtInt(km)} km`;
  return `${km.toFixed(km < 10 ? 2 : 0)} km`;
}

/** Duration in seconds, at whatever unit reads best. */
export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  if (sec < 1) return '<1 s';
  if (sec < 90) return `${sec.toFixed(0)} s`;
  if (sec < 5400) return `${(sec / 60).toFixed(1)} min`;
  if (sec < 172_800) return `${(sec / 3600).toFixed(1)} h`;
  const days = sec / 86_400;
  if (days < 730) return `${days.toFixed(days < 10 ? 1 : 0)} days`;
  return `${(days / 365.25).toFixed(1)} years`;
}

/** Physical velocity, in the units a mission report would use. */
function fmtSpeed(kms: number): string {
  if (kms === 0) return '0 km/s';
  if (kms < 1) return `${(kms * 1000).toFixed(0)} m/s`;
  return `${kms.toFixed(kms < 10 ? 1 : 0)} km/s`;
}

/** Apparent travel rate = physical velocity x time compression. */
function fmtRate(kms: number): string {
  const auPerSec = kms / AU_KM;
  if (auPerSec >= 0.01) return `${auPerSec.toFixed(2)} AU / s`;
  if (kms >= 1e6) return `${(kms / 1e6).toFixed(2)} million km / s`;
  if (kms >= 1000) return `${fmtInt(kms)} km / s`;
  return `${kms.toFixed(1)} km / s`;
}

/** Engine acceleration, in the units a spacecraft engineer would use. */
function fmtAccel(ms2: number): string {
  if (ms2 === 0) return 'off';
  if (ms2 < 0.01) return `${(ms2 * 1000).toFixed(1)} mm/s²`;
  if (ms2 < 1) return `${(ms2 * 1000).toFixed(0)} mm/s²`;
  return `${ms2.toFixed(2)} m/s²`;
}

/** What kind of conic this eccentricity describes. */
function conicName(e: number): string {
  if (e < 0.01) return 'circular';
  if (e < 0.2) return 'near-circular';
  if (e < 0.9) return 'elliptical';
  if (e < 1) return 'highly elliptical';
  if (e < 1.02) return 'parabolic - escaping';
  return 'hyperbolic - escaping';
}

function fmtTimeScale(t: number): string {
  if (t >= 1e6) return `${(t / 1e6).toFixed(t % 1e6 === 0 ? 0 : 1)}M×`;
  if (t >= 1000) return `${fmtInt(t / 1000)}k×`;
  return `${fmtInt(t)}×`;
}

/**
 * Narrow enough that instrument panels and a usable window cannot coexist.
 *
 * This used to ask `innerWidth <= 760`, which is true of a phone held upright
 * and false of the same phone turned on its side - so landscape fell through
 * to the desktop layout and drew the navigation panel, the location panel and
 * the control deck on top of one another. Height is just as scarce as width;
 * the device module weighs both.
 */
function isPhone(): boolean {
  return isCompact();
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

type DockGroup = 'engine' | 'time' | 'view' | 'ship';

export class SpacecraftUI {
  private root: HTMLElement;
  private cb: SpacecraftUiCallbacks;
  private textTimer = 0;
  private mapTimer = 0;
  private lastTargetId: string | null = null;

  // control deck
  private topBar!: HTMLElement;
  private topRight!: HTMLElement;
  private exitBtn!: HTMLElement;
  private shipGroup!: HTMLElement;
  private deckEl!: HTMLElement;
  private dockGroup: DockGroup | null = null;
  private dockTabs: Partial<Record<DockGroup, HTMLButtonElement>> = {};
  private deviceUnsub?: () => void;

  // top strip
  private velEl!: HTMLElement;
  private rateEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private dateEl!: HTMLElement;
  private modeEl!: HTMLElement;

  // navigation panel
  private searchInput!: HTMLInputElement;
  private listEl!: HTMLElement;
  private targetTitle!: HTMLElement;
  private targetStats!: HTMLElement;
  private actionsEl!: HTMLElement;
  private abortBtn!: HTMLButtonElement;

  // location panel
  private regionEl!: HTMLElement;
  private locStats!: HTMLElement;
  private nearEl!: HTMLElement;

  // throttle deck
  private throttleChips: HTMLButtonElement[] = [];
  private timeChips: HTMLButtonElement[] = [];
  private pauseBtn!: HTMLButtonElement;
  private throttleReadout!: HTMLElement;
  private propulsionLabel!: HTMLElement;
  private throttleInOrbit = false;

  // reticle / target bracket
  private reticle!: HTMLElement;
  private bracket!: HTMLElement;
  private bracketLabel!: HTMLElement;

  // nav map
  private mapCanvas!: HTMLCanvasElement;
  private mapCtx!: CanvasRenderingContext2D;
  private mapSpanAU = 0; // 0 = auto-fit to where the ship is

  // orbit panel
  private orbitPanel!: HTMLElement;
  private orbitTitle!: HTMLElement;
  private orbitBanner!: HTMLElement;
  private orbitStats!: HTMLElement;
  private holdButtons: HTMLButtonElement[] = [];

  private warnEl!: HTMLElement;
  private eventEl!: HTMLElement;
  private eventTimer = 0;
  private solarEl!: HTMLElement;
  private gazeBtn!: HTMLButtonElement;
  private navBtn!: HTMLButtonElement;
  private fovInput!: HTMLInputElement;
  private fovValue!: HTMLElement;
  private helpEl!: HTMLElement;
  private panelBtn!: HTMLButtonElement;
  /** 0 = both panels (desktop) / none (phone), 1 = navigation, 2 = location,
   *  3 = orbit (phone only, and only while there is an orbit to show). */
  private panelMode = 0;
  private orbiting = false;

  constructor(parent: HTMLElement, cb: SpacecraftUiCallbacks) {
    this.cb = cb;
    this.root = el('div', 'sc-hud');
    this.root.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.root);

    this.buildTop();
    this.buildReticle();
    this.buildNavPanel();
    this.buildLocationPanel();
    this.buildOrbitPanel();
    this.buildThrottle();
    this.buildMap();
    this.buildHelp();
    this.renderList('');
  }

  // ----------------------------------------------------------------- build --

  private buildTop(): void {
    const bar = el('div', 'sc-top');

    const badge = el('div', 'sc-badge');
    badge.innerHTML =
      '<b>ORRERY EVA</b><span>Research vessel · first-person</span>';
    // the label is replaced by an icon on compact layouts (CSS), so the text
    // lives in a span the stylesheet can hide without losing the accessible
    // name on the button itself
    const exit = el(
      'button',
      'sc-exit',
      '<svg class="sc-exit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 8l-4 4 4 4M5 12h10"/></svg><span>Exit spacecraft</span>',
    );
    exit.setAttribute('aria-label', 'Exit spacecraft mode and return to the Solar System explorer');
    exit.addEventListener('click', () => this.cb.onExit());

    const strip = el('div', 'sc-strip');
    const stat = (label: string): HTMLElement => {
      const w = el('div', 'sc-stat');
      w.innerHTML = `<i>${label}</i><b>—</b>`;
      strip.appendChild(w);
      return w.querySelector('b')!;
    };
    this.velEl = stat('Physical velocity');
    this.timeEl = stat('Time compression');
    this.rateEl = stat('Apparent rate');
    this.dateEl = stat('Simulation date');
    this.modeEl = stat('Flight mode');

    const right = el('div', 'sc-top-right');
    this.navBtn = el('button', 'sc-chip', 'Nav overlay');
    this.navBtn.title = 'Show orbit lines and the reference grid through the glass';
    this.navBtn.addEventListener('click', () => {
      const on = !this.navBtn.classList.contains('active');
      this.cb.onNavOverlay(on);
    });
    this.gazeBtn = el('button', 'sc-chip', 'Gaze lock');
    this.gazeBtn.title = 'Keep the pilot’s head turned toward the target';
    this.gazeBtn.addEventListener('click', () => {
      this.cb.onGazeLock(!this.gazeBtn.classList.contains('active'));
    });

    const fovWrap = el('label', 'sc-fov');
    fovWrap.innerHTML = '<i>FOV</i>';
    this.fovInput = el('input') as HTMLInputElement;
    this.fovInput.type = 'range';
    this.fovInput.min = '38';
    this.fovInput.max = '72';
    this.fovInput.step = '1';
    this.fovInput.value = '52';
    this.fovInput.setAttribute('aria-label', 'Window field of view in degrees');
    const fovVal = el('b', undefined, '52°');
    this.fovInput.addEventListener('input', () => {
      fovVal.textContent = `${this.fovInput.value}°`;
      this.cb.onFov(Number(this.fovInput.value));
    });
    this.fovValue = fovVal;
    fovWrap.append(this.fovInput, fovVal);

    const helpBtn = el('button', 'sc-chip', 'Controls');
    helpBtn.addEventListener('click', () => this.helpEl.classList.toggle('open'));

    // On a phone there is no room for both instrument panels and a usable
    // window, so this cycles: nothing → navigation → location. On a desktop it
    // is a plain on/off for the pair.
    this.panelBtn = el('button', 'sc-chip sc-panels-toggle', 'Panels');
    this.panelBtn.addEventListener('click', () => {
      const states = isPhone() ? (this.orbiting ? 4 : 3) : 2;
      this.panelMode = (this.panelMode + 1) % states;
      this.syncPanels();
    });

    right.append(this.navBtn, this.gazeBtn, fovWrap, helpBtn, this.panelBtn);
    bar.append(badge, strip, right, exit);
    this.topBar = bar;
    this.topRight = right;
    this.exitBtn = exit;
    this.root.appendChild(bar);

    this.eventEl = el('div', 'sc-event');
    this.eventEl.setAttribute('role', 'status');
    this.root.appendChild(this.eventEl);

    this.warnEl = el('div', 'sc-warn');
    this.root.appendChild(this.warnEl);
  }

  private buildReticle(): void {
    this.reticle = el('div', 'sc-reticle');
    this.reticle.innerHTML =
      '<svg viewBox="0 0 60 60" aria-hidden="true">' +
      '<circle cx="30" cy="30" r="9" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>' +
      '<path d="M30 14v6M30 40v6M14 30h6M40 30h6" stroke="currentColor" stroke-width="0.9" opacity="0.6"/>' +
      '<circle cx="30" cy="30" r="1" fill="currentColor" opacity="0.8"/></svg>';
    this.root.appendChild(this.reticle);

    this.bracket = el('div', 'sc-bracket');
    this.bracket.innerHTML =
      '<svg viewBox="0 0 40 40" aria-hidden="true">' +
      '<path d="M4 13V4h9M27 4h9v9M36 27v9h-9M13 36H4v-9" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '</svg>';
    this.bracketLabel = el('span', 'sc-bracket-label');
    this.bracket.appendChild(this.bracketLabel);
    this.root.appendChild(this.bracket);
  }

  private buildNavPanel(): void {
    const p = el('aside', 'sc-panel sc-nav');
    p.setAttribute('aria-label', 'Navigation');
    p.appendChild(el('h2', undefined, 'Navigation'));

    this.searchInput = el('input', 'sc-search') as HTMLInputElement;
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Search worlds, moons, comets…';
    this.searchInput.setAttribute('aria-label', 'Search for a navigation target');
    this.searchInput.addEventListener('input', () => this.renderList(this.searchInput.value));
    p.appendChild(this.searchInput);

    this.listEl = el('div', 'sc-list');
    this.listEl.setAttribute('role', 'listbox');
    p.appendChild(this.listEl);

    const t = el('div', 'sc-target');
    this.targetTitle = el('div', 'sc-target-title', '<b>No target</b><i>Pick a destination above</i>');
    this.targetStats = el('dl', 'sc-kv');
    t.append(this.targetTitle, this.targetStats);

    this.actionsEl = el('div', 'sc-actions');
    const act = (label: string, title: string, fn: () => void, primary = false) => {
      const b = el('button', `sc-act${primary ? ' primary' : ''}`, label);
      b.title = title;
      b.addEventListener('click', fn);
      this.actionsEl.appendChild(b);
      return b;
    };
    act('Travel', 'Cruise to the target and hold station in its vicinity', () => this.cb.onTravel(1), true);
    act('Approach', 'Close in much nearer than the standard arrival distance', () => this.cb.onTravel(0.32));
    act('Orbit', 'Enter a real circular orbit around the target', () => this.cb.onOrbit());
    act('Fly-by', 'Plot a cinematic pass and run it', () => this.cb.onFlyby());
    act('Follow', 'Hold the current relative position', () => this.cb.onFollow());
    this.abortBtn = act('Abort', 'Release the autopilot', () => this.cb.onAbort());
    this.abortBtn.classList.add('danger');
    t.appendChild(this.actionsEl);
    p.appendChild(t);
    this.root.appendChild(p);
  }

  private buildLocationPanel(): void {
    const p = el('aside', 'sc-panel sc-loc');
    p.setAttribute('aria-label', 'Location');
    p.appendChild(el('h2', undefined, 'Location'));
    this.regionEl = el('div', 'sc-region', '<b>—</b><i></i>');
    p.appendChild(this.regionEl);
    this.locStats = el('dl', 'sc-kv');
    p.appendChild(this.locStats);
    this.solarEl = el('div', 'sc-solar');
    p.appendChild(this.solarEl);
    p.appendChild(el('h3', undefined, 'Nearest objects'));
    this.nearEl = el('div', 'sc-near');
    p.appendChild(this.nearEl);
    this.root.appendChild(p);
  }

  /**
   * Flight-deck panel for orbital work. Hidden entirely unless the ship is on an
   * orbital trajectory, so it costs the window nothing the rest of the time.
   */
  private buildOrbitPanel(): void {
    const p = el('aside', 'sc-panel sc-orbit');
    p.setAttribute('aria-label', 'Orbit');
    this.orbitTitle = el('h2', undefined, 'Orbit');
    p.appendChild(this.orbitTitle);

    this.orbitBanner = el('div', 'sc-orbit-banner');
    p.appendChild(this.orbitBanner);

    // The manoeuvre axes sit directly under the banner: they are the primary
    // control in this mode, and burying them under a dozen readouts would put
    // them below the fold on a laptop.
    p.appendChild(el('h3', undefined, 'Attitude hold · burn direction'));
    const holds = el('div', 'sc-holds');
    const holdKey: Partial<Record<string, string>> = {
      prograde: '6',
      retrograde: '7',
      'radial-out': '8',
      'radial-in': '9',
      normal: '0',
    };
    for (const axis of BURN_AXES) {
      const b = el('button', 'sc-hold', BURN_LABEL[axis]);
      const k = holdKey[axis];
      b.title = `${BURN_EFFECT[axis]}${k ? ` · key ${k}` : ''}`;
      b.dataset.hold = axis;
      b.addEventListener('click', () => this.cb.onHold(axis));
      holds.appendChild(b);
      this.holdButtons.push(b);
    }
    const manual = el('button', 'sc-hold', 'Manual attitude');
    manual.title = 'Release the attitude hold and fly the nose yourself · key C cycles';
    manual.dataset.hold = 'manual';
    manual.addEventListener('click', () => this.cb.onHold(null));
    holds.appendChild(manual);
    this.holdButtons.push(manual);
    p.appendChild(holds);

    const release = el('button', 'sc-act danger', 'Release orbit → free flight');
    release.title =
      'Leave the orbital trajectory keeping your exact position and velocity · key O';
    release.addEventListener('click', () => this.cb.onReleaseOrbit());
    p.appendChild(release);

    this.orbitStats = el('dl', 'sc-kv');
    p.appendChild(this.orbitStats);

    p.appendChild(
      el(
        'p',
        'sc-note',
        'The throttle is engine acceleration here, not a speed setting. Burn prograde to raise ' +
          'the far side of the orbit, retrograde to lower it, normal to tilt the plane. The ' +
          'curve outside updates as you burn.',
      ),
    );
    this.orbitPanel = p;
    this.root.appendChild(p);
  }

  private buildThrottle(): void {
    const deck = el('div', 'sc-deck');
    deck.setAttribute('aria-label', 'Propulsion and time controls');

    const propulsion = el('div', 'sc-deck-group');
    propulsion.dataset.group = 'engine';
    this.propulsionLabel = el('i', 'sc-deck-label', 'Main engine · physical velocity');
    propulsion.appendChild(this.propulsionLabel);
    const row = el('div', 'sc-deck-row');
    THROTTLE_STEPS.forEach((v, i) => {
      const b = el('button', 'sc-step', v === 0 ? 'STOP' : fmtSpeed(v));
      b.title =
        v === 0
          ? 'Cut the main engine'
          : v > FASTEST_PROBE_KMS
            ? `${fmtSpeed(v)} — faster than any vehicle humans have built (record: ${FASTEST_PROBE_KMS} km/s)`
            : `${fmtSpeed(v)} — within the range of real deep-space probes`;
      b.addEventListener('click', () => this.cb.onThrottle(i));
      this.throttleChips.push(b);
      row.appendChild(b);
    });
    propulsion.appendChild(row);
    const controls = el('div', 'sc-deck-row');
    const brake = el('button', 'sc-cmd', '− Brake');
    brake.title = 'Step the main engine down one notch';
    brake.addEventListener('click', () => this.cb.onBrake());
    const accel = el('button', 'sc-cmd', 'Accelerate +');
    accel.title = 'Step the main engine up one notch';
    accel.addEventListener('click', () => this.cb.onAccel());
    const stop = el('button', 'sc-cmd', 'All stop');
    stop.addEventListener('click', () => this.cb.onStop());
    this.pauseBtn = el('button', 'sc-cmd', 'Pause');
    this.pauseBtn.addEventListener('click', () => this.cb.onPause());
    controls.append(brake, accel, stop, this.pauseBtn);
    propulsion.appendChild(controls);

    // Window presets. The keyboard has 1-5 for these, but touch has no
    // keyboard, and "look out of the left window" is a thing people want to do
    // without learning a drag gesture first.
    const viewGroup = el('div', 'sc-deck-group');
    viewGroup.dataset.group = 'view';
    viewGroup.appendChild(el('i', 'sc-deck-label', 'Windows'));
    const vrow = el('div', 'sc-deck-row');
    const presets: Array<[string, number, number, string]> = [
      ['Front', 0, 0, 'Look straight ahead through the windscreen'],
      ['Left', 78, 0, 'Look out of the port window'],
      ['Right', -78, 0, 'Look out of the starboard window'],
      ['Up', 0, 62, 'Look up through the overhead port'],
      ['Down', 0, -48, 'Look down over the console'],
    ];
    for (const [label, yaw, pitch, title] of presets) {
      const b = el('button', 'sc-step', label);
      b.title = title;
      b.addEventListener('click', () => this.cb.onLookPreset(yaw, pitch));
      vrow.appendChild(b);
    }
    const alignBtn = el('button', 'sc-cmd', 'Align hull');
    alignBtn.title = 'Swing the nose round to where you are looking';
    alignBtn.addEventListener('click', () => this.cb.onAlign());
    vrow.appendChild(alignBtn);
    viewGroup.appendChild(vrow);

    const timeGroup = el('div', 'sc-deck-group');
    timeGroup.dataset.group = 'time';
    timeGroup.appendChild(
      el('i', 'sc-deck-label', 'Time compression · simulated seconds per real second'),
    );
    const trow = el('div', 'sc-deck-row');
    TIME_STEPS.forEach((v, i) => {
      const b = el('button', 'sc-step', fmtTimeScale(v));
      b.title = `${fmtInt(v)} simulated seconds pass every real second`;
      b.addEventListener('click', () => this.cb.onTime(i));
      this.timeChips.push(b);
      trow.appendChild(b);
    });
    timeGroup.appendChild(trow);
    this.throttleReadout = el('div', 'sc-rate');
    timeGroup.appendChild(this.throttleReadout);

    // On a phone all three groups stacked came to 314 px - nearly half the
    // screen, permanently, in a mode whose entire point is looking out of the
    // window. Compact layouts get a dock instead: one row of tabs, one group
    // open at a time, and nothing open by default.
    const dock = el('div', 'sc-dock');
    dock.setAttribute('role', 'tablist');
    dock.setAttribute('aria-label', 'Flight controls');
    // A fourth group holds the chips that live in the top bar on desktop.
    // Three rows of chrome across the top of a phone is most of the window.
    this.shipGroup = el('div', 'sc-deck-group');
    this.shipGroup.dataset.group = 'ship';
    this.shipGroup.appendChild(el('i', 'sc-deck-label', 'Ship systems'));

    const tabs: Array<[DockGroup, string]> = [
      ['engine', 'Engine'],
      ['time', 'Time'],
      ['view', 'Windows'],
      ['ship', 'Ship'],
    ];
    for (const [key, label] of tabs) {
      const b = el('button', 'sc-dock-tab', label);
      b.setAttribute('role', 'tab');
      b.dataset.dock = key;
      b.addEventListener('click', () => this.setDock(this.dockGroup === key ? null : key));
      dock.appendChild(b);
      this.dockTabs[key] = b;
    }
    this.deckEl = deck;
    deck.append(dock, propulsion, timeGroup, viewGroup, this.shipGroup);
    this.root.appendChild(deck);
    this.setDock(null);
  }

  /**
   * Move the ship chips between the top bar and the dock.
   *
   * Same buttons, same handlers - only the parent changes, so there is one set
   * of controls rather than a mobile copy that can drift out of step with the
   * desktop one.
   */
  private relayoutChrome(): void {
    const compact = isCompact();
    if (compact) {
      if (this.topRight.parentElement !== this.shipGroup) this.shipGroup.appendChild(this.topRight);
    } else if (this.topRight.parentElement !== this.topBar) {
      this.topBar.insertBefore(this.topRight, this.exitBtn);
    }
  }

  /** Reflect a field of view set from outside - a pinch on the glass. */
  setFov(deg: number): void {
    const v = Math.round(deg);
    this.fovInput.value = String(v);
    this.fovValue.textContent = `${v}°`;
  }

  /** Show one deck group, or none. Compact layouts only; desktop shows all. */
  private setDock(group: DockGroup | null): void {
    this.dockGroup = group;
    this.deckEl.dataset.dock = group ?? 'none';
    for (const [key, btn] of Object.entries(this.dockTabs)) {
      const on = key === group;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
    }
  }

  private buildMap(): void {
    const wrap = el('div', 'sc-map');
    wrap.appendChild(el('i', 'sc-map-label', 'Schematic navigation · ecliptic plane'));
    this.mapCanvas = el('canvas') as HTMLCanvasElement;
    this.mapCanvas.width = 340;
    this.mapCanvas.height = 340;
    this.mapCanvas.setAttribute('role', 'img');
    this.mapCanvas.setAttribute(
      'aria-label',
      'Top-down schematic of the Solar System showing the vessel, the Sun, the planets and the current target',
    );
    this.mapCtx = this.mapCanvas.getContext('2d')!;
    wrap.appendChild(this.mapCanvas);

    const zoom = el('div', 'sc-map-zoom');
    const buttons: HTMLButtonElement[] = [];
    const mk = (label: string, span: number) => {
      const b = el('button', 'sc-step', label);
      b.addEventListener('click', () => {
        this.mapSpanAU = span;
        this.mapTimer = 99;
        for (const other of buttons) other.classList.toggle('active', other === b);
      });
      buttons.push(b);
      zoom.appendChild(b);
    };
    mk('Auto', 0);
    mk('0.05 AU', 0.05);
    mk('3 AU', 3);
    mk('40 AU', 40);
    buttons[0].classList.add('active');
    wrap.appendChild(zoom);
    this.root.appendChild(wrap);
  }

  private buildHelp(): void {
    this.helpEl = el('div', 'sc-help');
    this.helpEl.innerHTML = `
      <h3>Flying the vessel</h3>
      <ul>
        <li><kbd>Drag</kbd> Look around the cockpit</li>
        <li><kbd>1</kbd>–<kbd>5</kbd> Snap to front / left / right / up / down window</li>
        <li><kbd>W</kbd><kbd>S</kbd> Main engine: throttle up / down</li>
        <li><kbd>A</kbd><kbd>D</kbd> RCS translation: slide left / right</li>
        <li><kbd>R</kbd><kbd>F</kbd> RCS translation: slide up / down</li>
        <li><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> Attitude thrusters: yaw and pitch</li>
        <li><kbd>Q</kbd><kbd>E</kbd> Roll the hull</li>
        <li><kbd>Z</kbd> Swing the nose to where you are looking</li>
        <li><kbd>X</kbd> All stop &nbsp;·&nbsp; <kbd>Space</kbd> Pause</li>
        <li><kbd>[</kbd><kbd>]</kbd> Time compression down / up</li>
        <li><kbd>G</kbd> Gaze lock &nbsp;·&nbsp; <kbd>Esc</kbd> Exit the spacecraft</li>
      </ul>
      <h3>In orbit</h3>
      <ul>
        <li><kbd>6</kbd> Hold prograde &nbsp;·&nbsp; <kbd>7</kbd> retrograde</li>
        <li><kbd>8</kbd> Radial out &nbsp;·&nbsp; <kbd>9</kbd> radial in &nbsp;·&nbsp; <kbd>0</kbd> normal</li>
        <li><kbd>C</kbd> Cycle the attitude hold, including anti-normal and manual</li>
        <li><kbd>O</kbd> Release the orbit into free flight</li>
        <li>The throttle becomes engine <b>acceleration</b>. The engine burns
          whenever it is above CUT, along whichever way the nose points.</li>
      </ul>
      <p>Orbit mode is a real trajectory, not a fixed path. The ship carries a
      position and a velocity around the body and every control changes them:
      burn prograde and the far side of the orbit rises, retrograde and it
      falls, normal and the plane tilts. Burn hard enough and you escape. The
      curve drawn outside the window is your actual predicted path.</p>
      <p>The engine moves the hull at a real physical velocity. Time compression
      speeds up the whole simulation - planets included - so an interplanetary
      cruise fits in a coffee break without faking the distances.</p>
      <p>Inside a planet or moon's neighbourhood the hull rides that body's
      motion, exactly as a real spacecraft there would. Velocities are then
      quoted relative to it - the Location panel names the frame in use.</p>`;
    this.root.appendChild(this.helpEl);
  }

  // ------------------------------------------------------------ target list --

  private renderList(query: string): void {
    const q = query.trim().toLowerCase();
    let items: CatalogObject[] = targetableObjects();
    if (q) {
      items = items.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.id.includes(q) ||
          (o.aliases ?? []).some((a) => a.toLowerCase().includes(q)),
      );
    } else {
      // default shortlist: the Sun, the planets, and the headline moons
      const shortlist = new Set([
        'sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'io', 'europa',
        'ganymede', 'callisto', 'saturn', 'titan', 'enceladus', 'rhea', 'iapetus',
        'uranus', 'titania', 'neptune', 'triton', 'pluto', 'charon', 'ceres', 'vesta',
        'eris', 'haumea', 'makemake', 'halley', 'encke',
      ]);
      items = items.filter((o) => shortlist.has(o.id));
    }
    this.listEl.innerHTML = '';
    for (const o of items.slice(0, 60)) {
      const b = el('button', 'sc-list-row');
      b.dataset.id = o.id;
      b.innerHTML = `<span class="dot" style="background:#${o.color
        .toString(16)
        .padStart(6, '0')}"></span><b>${o.name}</b><i>${o.category ?? TYPE_LABEL[o.type]}</i>`;
      b.addEventListener('click', () => {
        this.cb.onSelectTarget(o.id);
        this.searchInput.value = '';
        this.renderList('');
      });
      this.listEl.appendChild(b);
    }
    if (!items.length) {
      this.listEl.appendChild(el('div', 'sc-empty', 'Nothing matches that name.'));
    }
    this.syncListSelection();
  }

  private syncListSelection(): void {
    for (const row of Array.from(this.listEl.children)) {
      if (row instanceof HTMLElement && row.dataset.id) {
        row.classList.toggle('active', row.dataset.id === this.lastTargetId);
      }
    }
  }

  // ---------------------------------------------------------------- update --

  show(): void {
    this.root.classList.add('on');
    this.deviceUnsub?.();
    // a rotation swaps which layout is legal, so re-evaluate rather than
    // leaving a portrait panel arrangement on a landscape screen
    this.deviceUnsub = onDeviceChange(() => {
      this.syncPanels();
      this.relayoutChrome();
      if (!isCompact()) this.setDock(null);
    });
    this.relayoutChrome();
    this.root.setAttribute('aria-hidden', 'false');
    // phones start with the glass clear; desktops have room for both panels
    this.panelMode = isPhone() ? 0 : 1;
    this.syncPanels();
    this.textTimer = 99;
    this.mapTimer = 99;
  }

  /** Re-evaluate which panels are on screen (also called on resize). */
  syncPanels(): void {
    // rotating the phone changes which layout applies, so a panel that was
    // legal in portrait has to be re-checked rather than left where it was
    const phone = isPhone();
    if (!phone && this.panelMode > 1) this.panelMode = 1;
    if (phone && this.panelMode === 3 && !this.orbiting) this.panelMode = 0;
    const showNav = this.panelMode === 1;
    const showLoc = phone ? this.panelMode === 2 : this.panelMode === 1;
    // on a desktop the orbit panel shares the left column with navigation; on a
    // phone it takes its own turn in the single bottom sheet
    const showOrbit = phone ? this.panelMode === 3 : true;
    this.root.classList.toggle('nav-hidden', !showNav);
    this.root.classList.toggle('loc-hidden', !showLoc);
    this.root.classList.toggle('orbit-hidden', !showOrbit);
    this.panelBtn.classList.toggle('active', this.panelMode !== 0);
    this.panelBtn.textContent = phone
      ? ['Panels', 'Navigation', 'Location', 'Orbit'][this.panelMode]
      : 'Panels';
  }

  hide(): void {
    this.deviceUnsub?.();
    this.deviceUnsub = undefined;
    this.root.classList.remove('on');
    this.root.setAttribute('aria-hidden', 'true');
    this.helpEl.classList.remove('open');
  }

  announce(text: string): void {
    this.eventEl.textContent = text;
    this.eventEl.classList.add('show');
    this.eventTimer = 4.5;
  }

  update(dt: number, t: Telemetry): void {
    this.updateBracket(t);
    this.reticle.classList.toggle('hidden', t.mode === 'transit' || t.mode === 'flyby');

    if (this.eventTimer > 0) {
      this.eventTimer -= dt;
      if (this.eventTimer <= 0) this.eventEl.classList.remove('show');
    }

    // proximity warning has to be live; everything else can tick at 8 Hz
    if (t.warning && t.warning.severity > 0.02) {
      this.warnEl.textContent = `Proximity: ${t.warning.name}`;
      this.warnEl.style.opacity = String(Math.min(1, 0.35 + t.warning.severity));
      this.warnEl.classList.add('show');
      this.warnEl.classList.toggle('critical', t.warning.severity > 0.75);
    } else {
      // the inline opacity above beats the stylesheet, so it has to be cleared
      // here too or one transient warning sticks on screen for the whole flight
      this.warnEl.style.opacity = '0';
      this.warnEl.classList.remove('show');
      this.warnEl.classList.remove('critical');
    }

    this.textTimer += dt;
    if (this.textTimer > 0.125) {
      this.textTimer = 0;
      this.updateText(t);
    }
    this.mapTimer += dt;
    if (this.mapTimer > 0.2) {
      this.mapTimer = 0;
      this.drawMap(t);
    }
  }

  private updateText(t: Telemetry): void {
    this.velEl.textContent = fmtSpeed(t.speedKms);
    this.velEl.title = t.frameName
      ? `Velocity relative to ${t.frameName}, whose motion the hull is riding`
      : 'Velocity relative to the Sun';
    this.timeEl.textContent = `${fmtTimeScale(t.effectiveTimeScale)}${
      t.effectiveTimeScale < TIME_STEPS[t.timeIndex] ? ' (auto)' : ''
    }`;
    this.rateEl.textContent = fmtRate(t.speedKms * t.effectiveTimeScale);
    this.dateEl.textContent = `${fmtSimDate(t.simDays)} · ${fmtSimTime(t.simDays)}`;
    this.modeEl.textContent = t.paused
      ? 'Paused'
      : t.anchorName && t.mode !== 'free'
        ? `${MODE_LABEL[t.mode]} · ${t.anchorName}`
        : MODE_LABEL[t.mode];

    // In orbit the same seven notches mean acceleration, not velocity - a
    // velocity setpoint is meaningless on a trajectory. Relabel rather than
    // build a second control, so there is only ever one throttle to learn.
    const orbiting = t.mode === 'orbit';
    if (orbiting !== this.throttleInOrbit) {
      this.throttleInOrbit = orbiting;
      this.propulsionLabel.textContent = orbiting
        ? 'Main engine · thrust'
        : 'Main engine · physical velocity';
      for (let i = 0; i < this.throttleChips.length; i++) {
        const b = this.throttleChips[i];
        if (orbiting) {
          b.textContent = i === 0 ? 'CUT' : fmtAccel(THRUST_STEPS_MS2[i]);
          b.title = `${fmtAccel(THRUST_STEPS_MS2[i])} of main-engine acceleration`;
        } else {
          b.textContent = THROTTLE_STEPS[i] === 0 ? 'STOP' : fmtSpeed(THROTTLE_STEPS[i]);
          b.title =
            THROTTLE_STEPS[i] === 0
              ? 'Cut the main engine'
              : THROTTLE_STEPS[i] > FASTEST_PROBE_KMS
                ? `${fmtSpeed(THROTTLE_STEPS[i])} — faster than any vehicle humans have built (record: ${FASTEST_PROBE_KMS} km/s)`
                : `${fmtSpeed(THROTTLE_STEPS[i])} — within the range of real deep-space probes`;
        }
      }
    }
    for (let i = 0; i < this.throttleChips.length; i++) {
      this.throttleChips[i].classList.toggle('active', i === t.throttleIndex);
    }
    for (let i = 0; i < this.timeChips.length; i++) {
      this.timeChips[i].classList.toggle('active', i === t.timeIndex);
    }
    this.pauseBtn.textContent = t.paused ? 'Resume' : 'Pause';
    this.pauseBtn.classList.toggle('active', t.paused);
    this.navBtn.classList.toggle('active', t.navOverlay);
    this.gazeBtn.classList.toggle('active', t.gazeLock);
    this.abortBtn.disabled = t.mode === 'free';

    const rate = t.speedKms * t.effectiveTimeScale;
    this.throttleReadout.innerHTML = orbiting
      ? `<span><i>Thrust</i><b>${fmtAccel(t.thrustMs2)}</b></span>` +
        `<span><i>Orbital speed</i><b>${fmtSpeed(t.speedKms)}</b></span>` +
        `<span><i>×</i><b>${fmtTimeScale(t.effectiveTimeScale)}</b></span>` +
        `<span><i>Δv spent</i><b>${(t.orbit?.dvSpentKms ?? 0).toFixed(3)} km/s</b></span>`
      : `<span><i>Physical</i><b>${fmtSpeed(t.speedKms)}</b></span>` +
      `<span><i>×</i><b>${fmtTimeScale(t.effectiveTimeScale)}</b></span>` +
      `<span><i>Apparent</i><b>${fmtRate(rate)}</b></span>` +
      `<span><i>Travelled</i><b>${fmtSpaceDist(t.distanceTravelledKm)}</b></span>`;

    // ---- target block ----
    if (t.targetId !== this.lastTargetId) {
      this.lastTargetId = t.targetId;
      this.syncListSelection();
    }
    const def = t.targetId ? catalogObject(t.targetId) : undefined;
    if (def) {
      this.targetTitle.innerHTML = `<b>${def.name}</b><i>${def.category ?? TYPE_LABEL[def.type]}</i>`;
      const rows: Array<[string, string]> = [];
      if (t.targetDistKm !== null) rows.push(['Distance', fmtSpaceDist(t.targetDistKm)]);
      if (t.targetAngularDeg !== null) {
        rows.push(['Apparent size', fmtAngle(t.targetAngularDeg)]);
      }
      // altitude only means anything once you are actually near the surface
      if (t.targetAltitudeKm !== null && t.targetAngularDeg !== null && t.targetAngularDeg > 3) {
        rows.push(['Altitude', fmtSpaceDist(t.targetAltitudeKm)]);
      }
      if (t.targetBearing) {
        rows.push(['Bearing', `${bearingWord(t.targetBearing)}`]);
      }
      if (t.targetEtaSec !== null && t.mode !== 'orbit') {
        rows.push([
          'Transit time',
          `${fmtDuration(t.targetEtaSec)} at ${fmtSpeed(t.etaVelocityKms)}`,
        ]);
        const real =
          t.effectiveTimeScale > 0 ? t.targetEtaSec / t.effectiveTimeScale : Infinity;
        rows.push(['At current compression', fmtDuration(real)]);
      }
      if (t.targetMag !== null && Number.isFinite(t.targetMag)) {
        rows.push(['Brightness', `mag ${t.targetMag.toFixed(1)} · ${magnitudeNote(t.targetMag)}`]);
      }

      this.targetStats.innerHTML = rows
        .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
        .join('');
      this.actionsEl.classList.remove('disabled');
    } else {
      this.targetTitle.innerHTML = '<b>No target</b><i>Pick a destination above</i>';
      this.targetStats.innerHTML = '';
      this.actionsEl.classList.add('disabled');
    }

    this.updateOrbitPanel(t);

    // ---- location block ----
    this.regionEl.innerHTML = `<b>${t.region.label}</b><i>${t.region.detail}</i>`;
    const loc: Array<[string, string]> = [
      ['Distance from the Sun', fmtSpaceDist(t.sunDistAU * AU_KM)],
      ['Distance from Earth', fmtSpaceDist(t.earthDistAU * AU_KM)],
      [
        'Ecliptic coordinates',
        `X ${t.posAU.x.toFixed(3)} · Y ${t.posAU.y.toFixed(3)} · Z ${t.posAU.z.toFixed(3)} AU`,
      ],
      ['Light delay to Earth', fmtDuration((t.earthDistAU * AU_KM) / 299_792.458)],
      ['Distance travelled', fmtSpaceDist(t.distanceTravelledKm)],
      ['Reference frame', t.frameName ? `Riding ${t.frameName}` : 'Heliocentric (inertial)'],
    ];
    this.locStats.innerHTML = loc.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    // solar environment - only interesting when the Sun is genuinely close
    if (t.sunRadii < 60) {
      // inverse-square from the 1361 W/m² solar constant at 1 AU
      const flux = 1361 / Math.max(t.sunDistAU * t.sunDistAU, 1e-6);
      this.solarEl.innerHTML =
        `<h3>Solar environment</h3><dl class="sc-kv">` +
        `<dt>Distance</dt><dd>${t.sunRadii.toFixed(1)} solar radii</dd>` +
        `<dt>Irradiance</dt><dd>${fmtInt(flux)} W/m² (${(flux / 1361).toFixed(0)}× Earth)</dd>` +
        `<dt>Photosphere</dt><dd>5,505 °C · corona over 1,000,000 °C</dd>` +
        `</dl><p class="sc-note">Corona and prominence structure here is procedural -
         informed by coronagraph imagery, not derived from it.</p>`;
      this.solarEl.classList.add('show');
    } else {
      this.solarEl.classList.remove('show');
    }

    this.nearEl.innerHTML = t.neighbours
      .slice(0, 5)
      .map(
        (n) =>
          `<button data-id="${n.id}"><b>${n.name}</b><i>${fmtSpaceDist(
            n.dist * KM_PER_UNIT,
          )}</i><span>${fmtAngle(n.angularDeg)}</span></button>`,
      )
      .join('');
    for (const b of Array.from(this.nearEl.querySelectorAll('button'))) {
      b.addEventListener('click', () => this.cb.onSelectTarget((b as HTMLElement).dataset.id!));
    }
  }

  /** The orbital instrument panel. Only on screen while actually orbiting. */
  private updateOrbitPanel(t: Telemetry): void {
    const o = t.orbit;
    this.orbitPanel.classList.toggle('show', !!o);
    // the left column now carries two panels; tell the stylesheet so the
    // navigation panel gives up the height rather than overlapping this one
    if (!!o !== this.orbiting) {
      this.orbiting = !!o;
      this.root.classList.toggle('orbiting', this.orbiting);
      this.syncPanels();
    }
    if (!o) return;

    this.orbitTitle.textContent = `Orbit · ${o.bodyName}`;

    if (o.impactPredicted) {
      this.orbitBanner.className = 'sc-orbit-banner danger';
      this.orbitBanner.innerHTML =
        `<b>Impact predicted</b><i>Periapsis is below the surface. Burn prograde at periapsis, ` +
        `or radial out, to raise it.</i>`;
    } else if (o.escaping) {
      this.orbitBanner.className = 'sc-orbit-banner warn';
      this.orbitBanner.innerHTML =
        `<b>Escape trajectory</b><i>${conicName(o.eccentricity)} — you are no longer bound to ` +
        `${o.bodyName}. Burn retrograde to recapture.</i>`;
    } else {
      this.orbitBanner.className = 'sc-orbit-banner';
      this.orbitBanner.innerHTML =
        `<b>${conicName(o.eccentricity)} orbit</b><i>Period ${fmtDuration(o.periodSec)} · ` +
        `${o.hold ? `holding ${o.hold === 'target' ? 'target' : BURN_LABEL[o.hold].toLowerCase()}` : 'manual attitude'}</i>`;
    }

    const rows: Array<[string, string]> = [
      ['Altitude', fmtSpaceDist(o.altitudeKm)],
      ['Orbital velocity', fmtSpeed(o.speedKms)],
      ['Apoapsis', o.escaping ? '—' : `${fmtSpaceDist(o.apoapsisAltKm)} alt`],
      ['Periapsis', `${fmtSpaceDist(o.periapsisAltKm)} alt`],
      ['Eccentricity', o.eccentricity.toFixed(4)],
      ['Inclination', `${o.inclinationDeg.toFixed(2)}° to the ecliptic`],
      ['Semi-major axis', o.escaping ? '—' : fmtSpaceDist(o.semiMajorKm)],
      ['Period', fmtDuration(o.periodSec)],
      ['Position in orbit', `${o.trueAnomalyDeg.toFixed(0)}° true anomaly`],
      ['Distance to centre', fmtSpaceDist(o.radiusKm)],
      ['Engine', fmtAccel(o.thrustMs2)],
      ['Δv spent', `${o.dvSpentKms.toFixed(3)} km/s`],
    ];
    this.orbitStats.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    for (const b of this.holdButtons) {
      const want = b.dataset.hold === 'manual' ? null : (b.dataset.hold as AttitudeHold);
      b.classList.toggle('active', (t.hold ?? null) === want);
    }
  }

  private updateBracket(t: Telemetry): void {
    if (!t.targetScreen || !t.targetId) {
      this.bracket.classList.remove('show');
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 46;
    let { x, y } = t.targetScreen;
    const off =
      !t.targetScreen.front || x < margin || x > w - margin || y < margin || y > h - margin;
    if (off) {
      // clamp to the viewport edge and point at it, so the pilot knows where
      // to turn even when the target is out of the windows entirely
      if (!t.targetScreen.front) {
        x = w - x;
        y = h - y;
      }
      x = THREE.MathUtils.clamp(x, margin, w - margin);
      y = THREE.MathUtils.clamp(y, margin, h - margin);
    }
    this.bracket.classList.add('show');
    this.bracket.classList.toggle('offscreen', off);
    this.bracket.style.transform = `translate(${x}px, ${y}px)`;
    const name = catalogObject(t.targetId)?.name ?? '';
    this.bracketLabel.textContent = off ? `${name} ↗` : name;
  }

  // -------------------------------------------------------------- nav map --

  private drawMap(t: Telemetry): void {
    const c = this.mapCtx;
    const size = this.mapCanvas.width;
    const mid = size / 2;
    c.clearRect(0, 0, size, size);
    c.fillStyle = 'rgba(5,9,18,0.72)';
    c.fillRect(0, 0, size, size);

    // auto: frame the ship's own heliocentric distance, so the map is useful
    // from low Earth orbit to the Kuiper belt without touching a control
    const span =
      this.mapSpanAU > 0
        ? this.mapSpanAU
        : THREE.MathUtils.clamp(Math.hypot(t.posAU.x, t.posAU.z) * 1.9, 0.03, 60);
    const k = (mid - 16) / span;
    // ship-centred, locked to the ecliptic plane: +x right, +ecliptic-y up.
    // Scene z is ecliptic -y, hence the sign flip.
    const cx = t.posAU.x;
    const cy = -t.posAU.z; // scene z is ecliptic -y
    const proj = (au: THREE.Vector3): [number, number] => [
      mid + (au.x - cx) * k,
      mid + (-au.z - cy) * k,
    ];

    // range rings
    c.strokeStyle = 'rgba(127,212,255,0.14)';
    c.lineWidth = 1;
    for (const frac of [0.33, 0.66, 1]) {
      c.beginPath();
      c.arc(mid, mid, (mid - 16) * frac, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = 'rgba(150,190,235,0.5)';
    c.font = '11px ui-monospace, monospace';
    c.fillText(
      `${(span * 0.66).toFixed(span < 1 ? 3 : 1)} AU`,
      mid + 4,
      mid - (mid - 16) * 0.66 - 4,
    );

    // planet orbits as circles about the Sun
    const sun = proj(new THREE.Vector3(0, 0, 0));
    const orbits: Array<[number, string]> = [
      [0.387, 'rgba(181,169,154,0.30)'],
      [0.723, 'rgba(230,198,137,0.30)'],
      [1.0, 'rgba(111,168,220,0.34)'],
      [1.524, 'rgba(216,138,94,0.30)'],
      [5.203, 'rgba(217,168,120,0.28)'],
      [9.537, 'rgba(224,201,160,0.28)'],
      [19.19, 'rgba(159,216,220,0.26)'],
      [30.07, 'rgba(95,140,224,0.26)'],
    ];
    for (const [a, color] of orbits) {
      const r = a * k;
      if (r < 4 || r > size * 2.2) continue;
      c.strokeStyle = color;
      c.beginPath();
      c.arc(sun[0], sun[1], r, 0, Math.PI * 2);
      c.stroke();
    }

    // the Sun
    const sunR = Math.max(3, Math.min(9, 4 + 40 / span));
    c.fillStyle = '#ffc46b';
    c.beginPath();
    c.arc(sun[0], sun[1], sunR, 0, Math.PI * 2);
    c.fill();

    // neighbours
    c.font = '11px ui-monospace, monospace';
    for (const n of t.neighbours.slice(0, 7)) {
      if (n.id === 'sun') continue;
      const def = catalogObject(n.id);
      const au = tmpAU.copy(n.scenePos).multiplyScalar(0.01);
      const [px, py] = proj(au);
      if (px < -20 || px > size + 20 || py < -20 || py > size + 20) continue;
      c.fillStyle = def ? `#${def.color.toString(16).padStart(6, '0')}` : '#9ab';
      c.beginPath();
      c.arc(px, py, n.id === t.targetId ? 5 : 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(200,220,245,0.72)';
      c.fillText(n.name, px + 7, py + 4);
    }

    // the ship, with its nose direction
    c.save();
    c.translate(mid, mid);
    c.strokeStyle = '#7fd4ff';
    c.fillStyle = 'rgba(127,212,255,0.9)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(0, 0, 4.5, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, 1.6, 0, Math.PI * 2);
    c.fill();
    c.restore();

    c.strokeStyle = 'rgba(127,212,255,0.28)';
    c.strokeRect(0.5, 0.5, size - 1, size - 1);
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Angular size in the unit an observer would actually quote. */
export function fmtAngle(deg: number): string {
  if (deg >= 1) return `${deg.toFixed(deg >= 10 ? 0 : 1)}°`;
  const arcmin = deg * 60;
  if (arcmin >= 1) return `${arcmin.toFixed(1)}′`;
  return `${(arcmin * 60).toFixed(1)}″`;
}

function bearingWord(b: { yaw: number; pitch: number }): string {
  const yaw = b.yaw;
  const pitch = b.pitch;
  let h: string;
  const a = Math.abs(yaw);
  if (a < 12) h = 'dead ahead';
  else if (a < 60) h = yaw > 0 ? 'forward left' : 'forward right';
  else if (a < 120) h = yaw > 0 ? 'port beam' : 'starboard beam';
  else h = 'astern';
  const v = pitch > 22 ? ', high' : pitch < -22 ? ', low' : '';
  return `${h}${v} (${yaw.toFixed(0)}° / ${pitch.toFixed(0)}°)`;
}
