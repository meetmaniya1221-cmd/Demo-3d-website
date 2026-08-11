/**
 * Distance journey: a continuous camera ride from the Sun's doorstep out past
 * the Kuiper belt, at TRUE scale, with a live odometer. The point is visceral:
 * even moving dozens of times faster than light, the outer Solar System takes
 * a long time to reach - and almost everything on the way is empty space.
 */
import * as THREE from 'three';
import type { AppState } from '../sim/state';
import { fmtLightTime } from './format';
import { sound } from '../audio';

const R_START = 0.08; // AU - just outside the Sun's corona glow
const R_END = 55; // AU - through the Kuiper belt
const DURATION = 95; // seconds, exponential progression

interface Milestone {
  r: number;
  title: string;
  text: string;
}

const MILESTONES: Milestone[] = [
  { r: 0.39, title: 'Mercury’s orbit - 0.39 AU', text: 'Three weeks in the fastest spacecraft ever flown. We crossed it in seconds.' },
  { r: 0.72, title: 'Venus’s orbit - 0.72 AU', text: 'Sunlight is still twice as strong here as at Earth.' },
  { r: 1.0, title: 'Earth’s orbit - 1 AU', text: 'One astronomical unit: 149.6 million km. Everything you have ever known happened this close to the Sun.' },
  { r: 1.52, title: 'Mars’s orbit - 1.5 AU', text: 'The current rockets take about seven months to get here from Earth.' },
  { r: 2.5, title: 'The asteroid belt - 2.1 to 3.3 AU', text: 'Millions of rocks, yet so spread out that spacecraft fly through without aiming.' },
  { r: 5.2, title: 'Jupiter’s orbit - 5.2 AU', text: 'Sunlight here is 27× weaker than at Earth. Solar panels start to struggle.' },
  { r: 9.57, title: 'Saturn’s orbit - 9.6 AU', text: 'Cassini needed almost seven years to get here.' },
  { r: 19.2, title: 'Uranus’s orbit - 19.2 AU', text: 'Only one spacecraft has ever passed this way: Voyager 2, in 1986.' },
  { r: 30.1, title: 'Neptune’s orbit - 30 AU', text: 'Sunlight takes over four hours to reach this far. It is 900× dimmer than at Earth.' },
  { r: 39.5, title: 'The Kuiper belt - 30 to 50 AU', text: 'Pluto and thousands of icy worlds drift here in the deep cold.' },
];

export interface JourneyHost {
  state: AppState;
  camera: THREE.PerspectiveCamera;
  setControlsEnabled: (v: boolean) => void;
  onEnd: () => void;
}

export class Journey {
  active = false;
  private host: JourneyHost;
  private t = 0;
  private root: HTMLElement;
  private auEl!: HTMLElement;
  private auB!: HTMLElement;
  private kmEl!: HTMLElement;
  private lightEl!: HTMLElement;
  private speedEl!: HTMLElement;
  private calloutEl!: HTMLElement;
  private progressFill!: HTMLElement;
  private nextMilestone = 0;
  private calloutTimer = 0;
  private ended = false;
  private prevScale: 'explorer' | 'true' = 'explorer';

  constructor(parent: HTMLElement, host: JourneyHost) {
    this.host = host;
    this.root = document.createElement('section');
    this.root.className = 'journey-hud';
    this.root.inert = true;
    this.root.setAttribute('aria-label', 'Distance journey');
    const ticks = MILESTONES.filter((m) => ![2.5, 39.5].includes(m.r))
      .map((m) => {
        const p = Math.log(m.r / R_START) / Math.log(R_END / R_START);
        return `<i style="left:${(p * 100).toFixed(1)}%"></i>`;
      })
      .join('');
    this.root.innerHTML = `
      <div class="journey-callout" aria-live="polite"></div>
      <div class="journey-card">
        <div class="journey-readout">
          <div class="journey-au"><b>0.08</b> AU from the Sun</div>
          <div class="journey-sub"><span class="journey-km"></span> · light takes <span class="journey-light"></span></div>
          <div class="journey-speed"></div>
        </div>
        <div class="journey-progress">${ticks}<i class="fill"></i></div>
        <div class="journey-actions">
          <button class="chip exit">End journey</button>
        </div>
      </div>
    `;
    this.auEl = this.root.querySelector('.journey-au')!;
    this.auB = this.auEl.querySelector('b')!;
    this.kmEl = this.root.querySelector('.journey-km')!;
    this.lightEl = this.root.querySelector('.journey-light')!;
    this.speedEl = this.root.querySelector('.journey-speed')!;
    this.calloutEl = this.root.querySelector('.journey-callout')!;
    this.progressFill = this.root.querySelector('.fill')!;
    this.root.querySelector('.exit')!.addEventListener('click', () => this.end());
    parent.appendChild(this.root);
  }

  start(): void {
    if (this.active) return;
    this.ended = false;
    this.t = 0;
    this.nextMilestone = 0;
    const st = this.host.state;
    this.prevScale = st.scaleMode;
    // deselect BEFORE arming: the app's select handler ends any active
    // journey, and mid-start that would leave the HUD half-initialised
    st.select(null);
    this.active = true;
    st.setScaleMode('true');
    if (!st.showOrbits) st.setToggle('showOrbits', true);
    if (!st.showLabels) st.setToggle('showLabels', true);
    this.host.setControlsEnabled(false);
    document.body.classList.add('journey-active');
    this.root.inert = false;
    this.root.classList.add('open');
    this.showCallout(
      'Leaving the Sun',
      'Distances are now TRUE scale. We will accelerate continuously - watch how long even that takes.',
    );
    sound.play('select', 0.4);
  }

  end(): void {
    if (!this.active) return;
    this.active = false;
    this.root.classList.remove('open');
    this.root.inert = true;
    document.body.classList.remove('journey-active');
    this.host.setControlsEnabled(true);
    this.host.state.setScaleMode(this.prevScale);
    this.host.onEnd();
  }

  private showCallout(title: string, text: string): void {
    this.calloutEl.innerHTML = `<b>${title}</b>${text}`;
    this.calloutEl.classList.add('show');
    this.calloutTimer = this.t + 6;
  }

  /** Current heliocentric distance in AU along the exponential ride. */
  private rOf(t: number): number {
    const p = Math.min(1, t / DURATION);
    return R_START * Math.pow(R_END / R_START, p);
  }

  update(dt: number): void {
    if (!this.active) return;
    // hold at the end until the user exits
    if (this.t < DURATION) this.t = Math.min(DURATION, this.t + dt);
    const r = this.rOf(this.t);
    const mapped = r * 100; // true scale: 1 AU = 100 units

    // camera rides above the ecliptic. For the first stretch it looks BACK at
    // the shrinking Sun - the most honest "we are leaving" shot there is -
    // then swings forward into the dark.
    const cam = this.host.camera;
    const elev = 2 + mapped * 0.16;
    cam.position.set(mapped, elev, mapped * 0.02);
    const swing = THREE.MathUtils.smoothstep(this.t, 9, 14);
    const lookX = (-mapped) * (1 - swing) + (mapped * 1.25 + 4) * swing;
    cam.lookAt(lookX, elev * 0.2 * swing, 0);

    // readouts (text nodes only - no per-frame innerHTML re-parse)
    const km = r * 149_597_871;
    this.auB.textContent = r < 10 ? r.toFixed(2) : r.toFixed(1);
    this.kmEl.textContent = `${km >= 1e9 ? `${(km / 1e9).toFixed(2)} billion` : `${Math.round(km / 1e6).toLocaleString()} million`} km`;
    this.lightEl.textContent = fmtLightTime(r);
    const speedC = ((r * Math.log(R_END / R_START)) / DURATION) * 499; // × light speed
    this.speedEl.textContent =
      this.t >= DURATION
        ? 'You have reached the Kuiper belt. Almost everything you crossed was empty.'
        : `Current speed ≈ ${speedC < 100 ? speedC.toFixed(0) : Math.round(speedC / 10) * 10}× the speed of light - nothing real can do this`;
    const p = Math.log(r / R_START) / Math.log(R_END / R_START);
    this.progressFill.style.width = `${(p * 100).toFixed(2)}%`;

    // milestone callouts
    while (this.nextMilestone < MILESTONES.length && r >= MILESTONES[this.nextMilestone].r) {
      const m = MILESTONES[this.nextMilestone++];
      this.showCallout(m.title, m.text);
      sound.play('click', 0.25);
    }
    if (this.calloutTimer && this.t > this.calloutTimer) {
      this.calloutEl.classList.remove('show');
      this.calloutTimer = 0;
    }

    if (this.t >= DURATION && !this.ended) {
      this.ended = true;
      this.showCallout(
        '55 AU - beyond the Kuiper belt’s main band',
        'Voyager 1, our fastest outbound craft, took about 16 years to get this far. Light does it in 7.6 hours. Press End journey to fly back.',
      );
    }
  }
}
