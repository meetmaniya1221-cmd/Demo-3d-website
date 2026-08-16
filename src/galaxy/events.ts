/**
 * Procedural events around the galactic centre. The scheduling is Poisson
 * (seeded, so a session has its own rhythm but never the same script), and
 * which events are possible depends on where the ship actually is - flares
 * and accretion behaviour only matter near Sagittarius A*; sensor trouble
 * from the crowded, magnetized centre reaches farther out.
 *
 * The event *types* follow the observed phenomenology: X-ray/IR flares
 * (Chandra ~1/day, JWST continuous flicker), G2-style gas-cloud pericenter
 * passages, close stellar flybys in the S cluster, and the navigation/
 * sensor consequences a spacecraft near a 4-million-solar-mass object
 * would plausibly log. Their frequency here is accelerated for gameplay.
 */
import { mulberry32 } from '../scene/noise';

export type GalaxyEventKind =
  | 'flare'
  | 'radiation'
  | 'gas-cloud'
  | 'stellar-flyby'
  | 'nav-disturbance'
  | 'sensor-static';

export interface GalaxyEvent {
  kind: GalaxyEventKind;
  title: string;
  text: string;
  severity: 'notice' | 'warning' | 'danger';
  /** Seconds of lingering effect (nav jitter, sensor static...). */
  effectSeconds: number;
}

interface EventSpec {
  kind: GalaxyEventKind;
  /** Max distance from Sgr A* (ly) at which this event can fire. */
  withinLy: number;
  weight: number;
  make(rnd: () => number): Omit<GalaxyEvent, 'kind'>;
}

const SPECS: EventSpec[] = [
  {
    kind: 'flare',
    withinLy: 400,
    weight: 3,
    make: (rnd) => ({
      title: 'Sgr A* flare detected',
      text:
        rnd() < 0.4
          ? 'X-ray luminosity spiking across the accretion zone. Chandra logged flares up to 400× quiescent - shields to standby.'
          : 'Infrared flare in progress: hot plasma circling near the innermost stable orbit is brightening fast.',
      severity: 'warning',
      effectSeconds: 20 + rnd() * 25,
    }),
  },
  {
    kind: 'radiation',
    withinLy: 120,
    weight: 1.6,
    make: (rnd) => ({
      title: 'Radiation burst',
      text: 'Broadband radiation transient from the inner accretion flow. Dosimeters elevated for the next few minutes.',
      severity: 'danger',
      effectSeconds: 25 + rnd() * 30,
    }),
  },
  {
    kind: 'gas-cloud',
    withinLy: 60,
    weight: 1,
    make: (rnd) => ({
      title: 'Gas cloud on pericenter approach',
      text:
        'A dusty gas clump is swinging through the inner parsec, G2-style. The 2014 G2 passage survived ~260 AU from the horizon - this one is being tracked.',
      severity: 'notice',
      effectSeconds: 15 + rnd() * 15,
    }),
  },
  {
    kind: 'stellar-flyby',
    withinLy: 2,
    weight: 1.4,
    make: (rnd) => ({
      title: 'S-cluster star at high velocity',
      text:
        rnd() < 0.5
          ? 'An S-cluster star is sweeping through pericenter nearby. S2 reaches 7,650 km/s at its closest approach - 2.5% of light speed.'
          : 'Proximity advisory: stellar flyby crossing the navigation corridor at several thousand km/s.',
      severity: 'warning',
      effectSeconds: 12 + rnd() * 10,
    }),
  },
  {
    kind: 'nav-disturbance',
    withinLy: 5,
    weight: 1.6,
    make: (rnd) => ({
      title: 'Gravitational navigation disturbance',
      text: 'Guidance solutions drifting: spacetime curvature gradients exceed the navigation model. Expect attitude wander.',
      severity: 'warning',
      effectSeconds: 10 + rnd() * 18,
    }),
  },
  {
    kind: 'sensor-static',
    withinLy: 900,
    weight: 1.2,
    make: (rnd) => ({
      title: 'Sensor interference',
      text: 'Scattering and synchrotron noise from the magnetized centre are degrading sensor returns.',
      severity: 'notice',
      effectSeconds: 12 + rnd() * 20,
    }),
  },
];

export class EventDirector {
  private rnd: () => number;
  private t = 0;
  private nextAt: number;

  constructor(seed: number, private emit: (e: GalaxyEvent) => void) {
    this.rnd = mulberry32(seed ^ 0x51ab3e1f);
    this.nextAt = 30 + this.rnd() * 50;
  }

  /** `sgraDist` in ly; only fires events that make sense at this range. */
  update(dt: number, sgraDist: number): void {
    this.t += dt;
    if (this.t < this.nextAt) return;
    this.nextAt = this.t + 45 + this.rnd() * 110;

    const candidates = SPECS.filter((s) => sgraDist <= s.withinLy);
    if (candidates.length === 0) return;
    const total = candidates.reduce((s, c) => s + c.weight, 0);
    let pick = this.rnd() * total;
    let spec = candidates[0];
    for (const c of candidates) {
      pick -= c.weight;
      if (pick <= 0) {
        spec = c;
        break;
      }
    }
    this.emit({ kind: spec.kind, ...spec.make(this.rnd) });
  }
}
