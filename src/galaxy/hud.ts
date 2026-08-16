/**
 * Galaxy-mode HUD: the astronomical instrument panel.
 *
 * DOM, not canvas, matching the app's UI conventions - and like the rest of
 * the app, no innerHTML writes per frame: every readout caches its last
 * string and only touches the DOM on change.
 */
import type { Vec3d } from './units';
import { SGRA_MASS_MSUN, SGRA_RS_KM, SGRA_RS_LY, fmtDuration, fmtLy, fmtPc, fmtWarp } from './units';
import { WARP_STEPS } from './ship';
import { fmtSimDate } from '../ui/format';

export interface HudMarker {
  label: string;
  x: number;
  y: number;
  front: boolean;
  kind: 'sgra' | 'sol' | 'waypoint';
}

export interface GalaxyTelemetry {
  pos: Vec3d;
  region: string;
  starsPc3: number;
  speed: number;
  throttleIndex: number;
  routeLabel: string | null;
  routeDist: number | null;
  routeEta: number | null;
  sgraDist: number;
  solDist: number;
  stage: number;
  stageLabel: string;
  dilation: number;
  properTime: number;
  simDays: number;
  radiation: number;
  warning: string | null;
  markers: HudMarker[];
}

export interface GalaxyHudCallbacks {
  onExit: () => void;
  onMap: () => void;
  onScan: () => void;
  onLog: () => void;
  onEnterSol: () => void;
}

export class GalaxyHud {
  readonly root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private markerEls: HTMLElement[] = [];
  private cache = new Map<string, string>();
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private scanEl: HTMLElement;
  private solBtn: HTMLButtonElement;
  private textTimer = 0;

  constructor(parent: HTMLElement, cb: GalaxyHudCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'gx-hud';
    this.root.innerHTML = `
      <div class="gx-topline">
        <div class="gx-block gx-location">
          <div class="gx-kicker">GALACTIC POSITION</div>
          <div class="gx-region" data-f="region"></div>
          <div class="gx-mono" data-f="coords"></div>
          <div class="gx-mono gx-dim" data-f="dists"></div>
          <div class="gx-mono gx-dim" data-f="density"></div>
        </div>
        <div class="gx-actions">
          <button class="gx-btn" data-act="map">Map <kbd>M</kbd></button>
          <button class="gx-btn" data-act="scan">Scan <kbd>V</kbd></button>
          <button class="gx-btn" data-act="log">Log <kbd>B</kbd></button>
          <button class="gx-btn gx-sol-btn" data-act="sol">Enter Solar System</button>
          <button class="gx-btn" data-act="exit">Exit <kbd>Esc</kbd></button>
        </div>
      </div>
      <div class="gx-stagebanner" data-f="stage"></div>
      <div class="gx-warnstrip" data-f="warn"></div>
      <div class="gx-scanline"></div>
      <div class="gx-bottomline">
        <div class="gx-block gx-flight">
          <div class="gx-kicker">FLIGHT</div>
          <div class="gx-speed" data-f="speed"></div>
          <div class="gx-throttle" data-f="throttle"></div>
          <div class="gx-mono gx-dim" data-f="route"></div>
        </div>
        <div class="gx-block gx-time">
          <div class="gx-kicker">RELATIVISTIC CLOCKS</div>
          <div class="gx-mono" data-f="dilation"></div>
          <div class="gx-mono gx-dim" data-f="clocks"></div>
        </div>
        <div class="gx-block gx-target">
          <div class="gx-kicker">SAGITTARIUS A*</div>
          <div class="gx-mono" data-f="sgra"></div>
          <div class="gx-radbar"><div class="gx-radfill" data-f="rad"></div></div>
          <div class="gx-mono gx-dim" data-f="sgra2"></div>
        </div>
      </div>
      <div class="gx-toast" role="status"></div>
    `;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-f]')) {
      this.els[el.dataset.f!] = el;
    }
    this.toastEl = this.root.querySelector('.gx-toast')!;
    this.scanEl = this.root.querySelector('.gx-scanline')!;
    this.solBtn = this.root.querySelector('.gx-sol-btn')!;
    const act = (name: string, fn: () => void) => {
      this.root
        .querySelector(`[data-act="${name}"]`)!
        .addEventListener('click', fn);
    };
    act('map', cb.onMap);
    act('scan', cb.onScan);
    act('log', cb.onLog);
    act('exit', cb.onExit);
    act('sol', cb.onEnterSol);

    // screen-space markers for the three anchors of the journey
    for (let i = 0; i < 3; i++) {
      const m = document.createElement('div');
      m.className = 'gx-marker';
      m.innerHTML = '<div class="gx-marker-ring"></div><div class="gx-marker-label"></div>';
      this.root.appendChild(m);
      this.markerEls.push(m);
    }
    parent.appendChild(this.root);
  }

  show(): void {
    this.root.classList.add('on');
  }

  hide(): void {
    this.root.classList.remove('on');
  }

  toast(title: string, text: string, severity: 'notice' | 'warning' | 'danger' = 'notice'): void {
    this.toastEl.innerHTML = `<b>${title}</b>${text}`;
    this.toastEl.className = `gx-toast show ${severity}`;
    this.toastTimer = 7;
  }

  /** Scan feedback line under the banner. */
  scanStatus(text: string | null): void {
    this.scanEl.textContent = text ?? '';
    this.scanEl.classList.toggle('on', !!text);
  }

  private set(key: string, value: string): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    const el = this.els[key];
    if (el) el.textContent = value;
  }

  update(dt: number, t: GalaxyTelemetry): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }

    // markers move every frame (they track the 3D scene)
    for (let i = 0; i < this.markerEls.length; i++) {
      const el = this.markerEls[i];
      const m = t.markers[i];
      if (!m || !m.front) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = 'block';
      el.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`;
      el.dataset.kind = m.kind;
      (el.querySelector('.gx-marker-label') as HTMLElement).textContent = m.label;
    }

    // text readouts at 5 Hz is plenty
    this.textTimer += dt;
    if (this.textTimer < 0.2) return;
    this.textTimer = 0;

    this.set('region', t.region);
    this.set(
      'coords',
      `X ${Math.round(t.pos.x).toLocaleString('en-US')}  Y ${Math.round(t.pos.y).toLocaleString('en-US')}  Z ${Math.round(t.pos.z).toLocaleString('en-US')} ly`,
    );
    this.set(
      'dists',
      `Sgr A* ${fmtLy(t.sgraDist)} · Sol ${fmtLy(t.solDist)} · plane ${fmtLy(Math.abs(t.pos.z))} ${t.pos.z >= 0 ? 'N' : 'S'}`,
    );
    this.set(
      'density',
      `local density ≈ ${t.starsPc3 >= 100 ? Math.round(t.starsPc3).toLocaleString('en-US') : t.starsPc3.toPrecision(2)} stars/pc³`,
    );

    this.set('speed', t.speed > 0 ? fmtWarp(t.speed) : 'STATION-KEEPING');
    const steps = WARP_STEPS.length - 1;
    const bars = '▮'.repeat(t.throttleIndex) + '▯'.repeat(steps - t.throttleIndex);
    this.set('throttle', bars);
    this.set(
      'route',
      t.routeLabel
        ? `route: ${t.routeLabel} · ${t.routeDist !== null ? fmtLy(t.routeDist) : ''} · ETA ${t.routeEta !== null ? fmtDuration(t.routeEta) : '—'}`
        : 'manual flight · W/S throttle · T route to Sgr A*',
    );

    const gamma = 1 / Math.max(t.dilation, 1e-8);
    this.set(
      'dilation',
      gamma < 1.001
        ? 'time dilation: negligible'
        : `1 s aboard = ${gamma < 100 ? gamma.toFixed(2) : Math.round(gamma).toLocaleString('en-US')} s for Earth`,
    );
    this.set(
      'clocks',
      `ship ${fmtDuration(t.properTime)} aboard · Earth date ${fmtSimDate(t.simDays)}`,
    );

    const rsMultiple = t.sgraDist / SGRA_RS_LY;
    this.set(
      'sgra',
      t.sgraDist > 2000
        ? `${fmtLy(t.sgraDist)} · ${fmtPc(t.sgraDist)} to centre`
        : rsMultiple > 5000
          ? `${fmtLy(t.sgraDist)} · ${Math.round(rsMultiple).toLocaleString('en-US')} Rs from centre`
          : `${fmtLy(t.sgraDist)} · ${rsMultiple.toFixed(rsMultiple < 20 ? 1 : 0)} Rs — horizon at 1 Rs`,
    );
    this.set(
      'sgra2',
      `mass ${SGRA_MASS_MSUN.toExponential(2).replace('e+6', '×10⁶')} M☉ (GRAVITY) · Rs ${(SGRA_RS_KM / 1e6).toFixed(1)}M km`,
    );
    const radEl = this.els.rad;
    if (radEl) radEl.style.width = `${Math.round(t.radiation * 100)}%`;

    const stageEl = this.els.stage;
    if (stageEl) {
      this.set('stage', t.stageLabel);
      stageEl.className = `gx-stagebanner s${t.stage}${t.stageLabel ? ' on' : ''}`;
    }
    const warnEl = this.els.warn;
    if (warnEl) {
      this.set('warn', t.warning ?? '');
      warnEl.classList.toggle('on', !!t.warning);
    }

    // the Sol door only opens when you are actually at Sol
    this.solBtn.classList.toggle('available', t.solDist < 6);
  }

  dispose(): void {
    this.root.remove();
  }
}
