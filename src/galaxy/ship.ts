/**
 * The galactic vessel: double-precision navigation over 25 orders of
 * magnitude, from AU-scale approaches to crossing the whole disk.
 *
 * The throttle ladder is openly superluminal - a real ship at c would need
 * 27,000 years to reach the centre, which is not a game. Speeds are shown
 * with their light-speed multiples and the HUD labels warp as a gameplay
 * device; nothing pretends this is physics. What IS physics: the position
 * integration is exact double precision, the arrival envelope decelerates
 * with distance so you cannot overshoot a landmark, and near Sagittarius A*
 * the flight computer's speed ceiling collapses with distance - the last
 * few hundred AU are deliberately slow, because arriving at an event
 * horizon should feel like a descent, not a fly-by.
 */
import * as THREE from 'three';
import { SUN_POS, Vec3d, C_LY_PER_S } from './units';

/** Commanded-speed ladder, ly/s. Index 0 is full stop. */
export const WARP_STEPS: number[] = [
  0,
  1e-7, // ≈ 3.2 c
  1e-6,
  1e-5,
  1e-4,
  1e-3,
  0.01,
  0.1,
  1,
  8,
  40,
  160,
  520,
];

export type NavMode = 'manual' | 'route';

export interface RouteInfo {
  label: string;
  target: Vec3d;
  /** Stop this far from the target, ly. */
  standoff: number;
}

export class GalaxyShip {
  /** Galactocentric position, light-years, double precision. */
  readonly pos = new Vec3d(SUN_POS.x, SUN_POS.y - 0.4, SUN_POS.z + 0.1);
  readonly quat = new THREE.Quaternion();
  mode: NavMode = 'manual';
  throttleIndex = 0;
  /** Actual speed, ly/s - eases toward the command. */
  speed = 0;
  route: RouteInfo | null = null;
  /** Ship proper time since boarding, seconds. */
  properTime = 0;
  /** Set by the mode when navigation is being disturbed (BH proximity). */
  navJitter = 0;
  event: string | null = null;

  private yawRate = 0;
  private pitchRate = 0;
  private rollRate = 0;
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private dir = new Vec3d();

  /** Forward direction (scene axes) - the nose looks down -z. */
  forwardScene(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, -1).applyQuaternion(this.quat);
  }

  look(dYaw: number, dPitch: number): void {
    this.tmpQ.setFromAxisAngle(this.tmpV.set(0, 1, 0), dYaw);
    this.quat.multiply(this.tmpQ);
    this.tmpQ.setFromAxisAngle(this.tmpV.set(1, 0, 0), dPitch);
    this.quat.multiply(this.tmpQ);
    this.quat.normalize();
  }

  setRates(yaw: number, pitch: number, roll: number): void {
    this.yawRate = yaw;
    this.pitchRate = pitch;
    this.rollRate = roll;
  }

  nudgeThrottle(delta: number): void {
    const next = THREE.MathUtils.clamp(this.throttleIndex + delta, 0, WARP_STEPS.length - 1);
    if (next === this.throttleIndex) return;
    this.throttleIndex = next;
    this.mode = 'manual';
    this.route = null;
    const v = WARP_STEPS[next];
    this.event =
      next === 0
        ? 'All stop.'
        : `Throttle: ${v >= 1 ? `${v.toFixed(0)} ly/s` : `${(v / C_LY_PER_S).toFixed(v > 1e-5 ? 0 : 1)} c`}.`;
  }

  fullStop(): void {
    this.throttleIndex = 0;
    this.mode = 'manual';
    this.route = null;
    this.event = 'All stop.';
  }

  /** Engage an arrival autopilot toward a point. */
  engageRoute(label: string, target: Vec3d, standoff: number): void {
    this.route = { label, target: target.clone(), standoff };
    this.mode = 'route';
    this.event = `Route engaged: ${label}.`;
  }

  disengage(): void {
    if (this.mode !== 'route') return;
    this.mode = 'manual';
    this.route = null;
    this.throttleIndex = 0;
    this.event = 'Route disengaged.';
  }

  routeDistance(): number | null {
    if (!this.route) return null;
    return Math.max(0, this.pos.distanceTo(this.route.target) - this.route.standoff);
  }

  /** Estimated arrival, seconds, from the deceleration envelope. */
  routeEta(): number | null {
    const d = this.routeDistance();
    if (d === null) return null;
    if (d <= 0.001) return 0;
    const cruise = Math.min(WARP_STEPS[WARP_STEPS.length - 1], Math.max(d * 0.28, 1e-6));
    // decel phase is ~1/k · ln terms; a flat estimate reads better on a HUD
    return d / Math.max(cruise * 0.55, 1e-9) + 4;
  }

  /**
   * Advance one frame. `speedCeiling` (ly/s) is the flight computer's local
   * limit - the mode collapses it near massive objects. Returns distance
   * travelled in ly.
   */
  update(dt: number, speedCeiling: number): number {
    // attitude
    const rot = dt * 1.35;
    if (this.yawRate !== 0 || this.pitchRate !== 0 || this.rollRate !== 0) {
      this.look(this.yawRate * rot, this.pitchRate * rot);
      if (this.rollRate !== 0) {
        this.tmpQ.setFromAxisAngle(this.tmpV.set(0, 0, 1), this.rollRate * rot);
        this.quat.multiply(this.tmpQ).normalize();
      }
    }
    if (this.navJitter > 0) {
      // gravitational navigation disturbance: seeded-free wander is fine
      // here, it is deliberately erratic
      const j = this.navJitter * dt;
      this.look((Math.random() - 0.5) * j, (Math.random() - 0.5) * j);
    }

    // commanded speed
    let cmd: number;
    if (this.mode === 'route' && this.route) {
      const d = this.routeDistance() ?? 0;
      if (d <= 1e-7) {
        this.mode = 'manual';
        this.route = null;
        this.speed = 0;
        this.throttleIndex = 0;
        this.event = 'Arrived. Autopilot released.';
        cmd = 0;
      } else {
        // arrival envelope: speed proportional to remaining distance
        cmd = THREE.MathUtils.clamp(d * 0.28, 1e-7, WARP_STEPS[WARP_STEPS.length - 1]);
        // steer the nose toward the target
        this.dir.copy(this.route.target).sub(this.pos);
        const gx = this.dir.x;
        const gy = this.dir.y;
        const gz = this.dir.z;
        this.tmpV.set(gx, gz, -gy).normalize();
        const want = this.tmpQ.setFromUnitVectors(
          new THREE.Vector3(0, 0, -1),
          this.tmpV,
        );
        this.quat.slerp(want, Math.min(1, dt * 2.2));
      }
    } else {
      cmd = WARP_STEPS[this.throttleIndex];
    }
    cmd = Math.min(cmd, speedCeiling);

    // ease actual speed toward command over ~0.6 s, faster when braking
    const k = cmd < this.speed ? 5.0 : 2.6;
    this.speed += (cmd - this.speed) * Math.min(1, dt * k);
    if (this.speed < 1e-12) this.speed = 0;

    // integrate in double precision along the nose
    if (this.speed > 0) {
      this.forwardScene(this.tmpV);
      // scene → galactic axes: (sx, sy, sz) → (sx, -sz, sy)
      this.dir.set(this.tmpV.x, -this.tmpV.z, this.tmpV.y);
      const step = this.speed * dt;
      this.pos.addScaled(this.dir, step);
      this.properTime += dt;
      return step;
    }
    this.properTime += dt;
    return 0;
  }
}
