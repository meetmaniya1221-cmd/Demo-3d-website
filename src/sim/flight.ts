/**
 * Ship flight model for the observation-craft cockpit.
 *
 * The ship's speed is a *physical* speed, quoted in AU per second, and it has
 * nothing whatsoever to do with time compression. Time compression winds the
 * simulation clock - it makes the planets move. The throttle moves the ship.
 * The two are deliberately kept as separate systems with separate controls and
 * separate readouts, because conflating them is the single easiest way to make
 * a solar-system flier incomprehensible: at 1 year/second the planets blur, and
 * you are still crawling; at full throttle with the clock stopped you cross the
 * system while nothing else moves at all. Both are true, and both are useful.
 *
 * The scene does not use AU as its unit, and in explorer view it does not even
 * use a linear map of them (radius is compressed by a power law). So the model
 * carries velocity in AU/s and converts to scene units per second through the
 * *local* derivative of that mapping at the ship's current heliocentric radius.
 * The upshot is that the AU/s on the HUD is the real thing in both scale modes:
 * at true scale it is exactly 100 units per AU, and in explorer view a second at
 * 0.5 AU/s covers half an AU of real distance even though the scene squeezes it.
 */
import { EXPLORER_A, EXPLORER_GAMMA, TRUE_UNITS_PER_AU, mapDistanceAU } from './scale';
import { AU_KM } from '../data/bodies';

/** Hard ceiling on physical speed, with boost engaged. */
export const MAX_SPEED_AU_S = 0.5;
/** Cruise ceiling without boost - boost is what buys the top half. */
export const CRUISE_SPEED_AU_S = 0.25;

const THRUST_AU_S2 = 0.42; // how hard the main drive pushes
const BRAKE_AU_S2 = 0.85; // retro thrusters bite harder than the main drive
const ASSIST_LATERAL = 3.2; // 1/s: how fast assist bleeds off sideways drift

/** Scene units per AU at a given heliocentric radius, for the current blend. */
export function unitsPerAU(rAU: number, t: number): number {
  const r = Math.max(rAU, 1e-4);
  const explorer = EXPLORER_A * EXPLORER_GAMMA * Math.pow(r, EXPLORER_GAMMA - 1);
  return explorer * (1 - t) + TRUE_UNITS_PER_AU * t;
}

/**
 * Heliocentric radius in AU for a scene radius. The forward map is monotonic
 * but, blended, has no closed-form inverse - so bisect it. Forty iterations is
 * far past double precision on this range and costs nothing once a frame.
 */
export function auFromSceneRadius(sceneR: number, t: number): number {
  if (sceneR <= 0) return 0;
  let lo = 0;
  let hi = 1;
  while (mapDistanceAU(hi, t) < sceneR && hi < 1e7) hi *= 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) * 0.5;
    if (mapDistanceAU(mid, t) < sceneR) lo = mid;
    else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/**
 * Scene position → heliocentric AU position, direction preserved.
 *
 * The scene map only ever rescales radius, so inverting it per-vector and then
 * measuring gives the true straight-line separation in AU. Differencing the two
 * radii instead - which is the tempting shortcut - is only right when both
 * bodies happen to lie on the same ray from the Sun.
 */
export function sceneToAU(p: Vec3, t: number, out: Vec3): void {
  const r = Math.hypot(p.x, p.y, p.z);
  if (r === 0) {
    out.x = out.y = out.z = 0;
    return;
  }
  const k = auFromSceneRadius(r, t) / r;
  out.x = p.x * k;
  out.y = p.y * k;
  out.z = p.z * k;
}

export interface FlightInput {
  /** Commanded throttle, 0..1. */
  throttle: number;
  brake: boolean;
  boost: boolean;
  assist: boolean;
}

/** A minimal 3-vector, so this module stays independent of the renderer. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);

export class FlightModel {
  /** Velocity in AU/s, in scene *directions* (magnitude is physical). */
  readonly velocity: Vec3 = { x: 0, y: 0, z: 0 };
  throttle = 0;
  assist = true;
  private boosting = false;

  /** Commanded speed for the current throttle and boost state, in AU/s. */
  get commandedSpeed(): number {
    return this.throttle * (this.boosting ? MAX_SPEED_AU_S : CRUISE_SPEED_AU_S);
  }

  /** Current physical speed, AU/s. */
  get speedAUs(): number {
    return len(this.velocity);
  }

  /** Current physical speed, km/s - the unit spacecraft are actually quoted in. */
  get speedKmS(): number {
    return this.speedAUs * AU_KM;
  }

  get boostActive(): boolean {
    return this.boosting;
  }

  /**
   * Advance one step.
   *
   * With flight assist on, the drive holds the commanded speed along the nose
   * and actively bleeds off sideways drift, so the ship goes where it points.
   * With assist off nothing damps anything: thrust only ever adds to velocity
   * and you keep whatever you built up, which is how a real spacecraft behaves
   * and how you end up drifting sideways past Jupiter wondering what happened.
   */
  step(dt: number, forward: Vec3, input: FlightInput): void {
    this.throttle = Math.max(0, Math.min(1, input.throttle));
    this.assist = input.assist;
    this.boosting = input.boost;
    const v = this.velocity;

    if (input.brake) {
      const s = len(v);
      if (s > 1e-9) {
        const drop = Math.min(s, BRAKE_AU_S2 * dt);
        const k = (s - drop) / s;
        v.x *= k;
        v.y *= k;
        v.z *= k;
      }
      return;
    }

    const want = this.commandedSpeed;

    if (this.assist) {
      // split velocity into "along the nose" and "everything else"
      const along = dot(v, forward);
      const lat = { x: v.x - forward.x * along, y: v.y - forward.y * along, z: v.z - forward.z * along };
      // approach the commanded speed at the drive's acceleration limit
      const step = THRUST_AU_S2 * dt;
      const next = along < want ? Math.min(want, along + step) : Math.max(want, along - step);
      // sideways drift decays exponentially - frame-rate independent
      const decay = Math.exp(-ASSIST_LATERAL * dt);
      v.x = forward.x * next + lat.x * decay;
      v.y = forward.y * next + lat.y * decay;
      v.z = forward.z * next + lat.z * decay;
    } else {
      // Newtonian: the drive adds along the nose, and that is all it does
      const a = THRUST_AU_S2 * this.throttle * dt;
      v.x += forward.x * a;
      v.y += forward.y * a;
      v.z += forward.z * a;
      // still clamp to the ship's structural limit
      const s = len(v);
      const cap = this.boosting ? MAX_SPEED_AU_S : CRUISE_SPEED_AU_S;
      if (s > cap) {
        const k = cap / s;
        v.x *= k;
        v.y *= k;
        v.z *= k;
      }
    }
  }

  /** Kill all motion - used on entering the cockpit and on a full stop. */
  halt(): void {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.throttle = 0;
  }

  /**
   * Scene-unit displacement for this step, given where the ship is now.
   * The conversion uses the local scale at the ship's radius, which is what
   * keeps the quoted AU/s honest in explorer view as well as at true scale.
   */
  sceneStep(dt: number, sceneRadius: number, scaleT: number, out: Vec3): void {
    const rAU = auFromSceneRadius(sceneRadius, scaleT);
    const k = unitsPerAU(rAU, scaleT) * dt;
    out.x = this.velocity.x * k;
    out.y = this.velocity.y * k;
    out.z = this.velocity.z * k;
  }
}
