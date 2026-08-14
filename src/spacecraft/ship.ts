/**
 * The vessel: state, flight computer and navigation autopilot.
 *
 * Two quantities are kept rigorously separate here, and the HUD shows both:
 *
 *   PHYSICAL VELOCITY - kilometres per second the hull actually moves through
 *     space. Real numbers, real units, comparable to real probes.
 *   TIME COMPRESSION  - how many simulated seconds elapse per real second.
 *     This is what makes a 4-year cruise to Saturn watchable. It accelerates
 *     the whole simulation, so the planets keep moving along their orbits at
 *     the same compressed rate; nothing about the geometry is faked.
 *
 * Apparent travel rate = physical velocity x time compression, and that
 * product is labelled as such everywhere it appears.
 *
 * Attitude and throttle run through a flight computer (rate-limited slew,
 * bounded acceleration, RCS translation) rather than free-camera teleporting,
 * so the vessel reads as something with mass.
 */
import * as THREE from 'three';
import { catalogObject } from '../data/catalog';
import {
  BURN_AXES,
  BURN_LABEL,
  MAX_BURN_FRACTION,
  type BurnAxis,
  type OrbitalElements,
  burnDirection,
  circularSpeed,
  elementsFrom,
  propagateWithThrust,
} from './orbit';
import {
  KM_PER_UNIT,
  NEIGHBOUR_IDS,
  UNITS_PER_KM,
  arrivalDistance,
  bodyExtentTrue,
  bodyPositionTrue,
  bodyRadiusKm,
  bodyRadiusTrue,
  minSafeDistance,
  nearestBodies,
} from './ephemeris';

/** Gravitational constant in km³ kg⁻¹ s⁻². */
const G_KM = 6.6743e-20;

/** Compact duration for autopilot messages. */
function fmtHours(sec: number): string {
  if (!Number.isFinite(sec)) return 'unbound';
  if (sec < 5400) return `${(sec / 60).toFixed(1)} min`;
  if (sec < 172_800) return `${(sec / 3600).toFixed(1)} h`;
  return `${(sec / 86_400).toFixed(1)} days`;
}

export type FlightMode = 'free' | 'transit' | 'orbit' | 'flyby' | 'follow';

/** Commanded physical velocities, in km/s. */
export const THROTTLE_STEPS = [0, 1, 10, 50, 150, 400, 1000] as const;

/** Simulated seconds per real second. */
export const TIME_STEPS = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000] as const;

/**
 * What the same seven throttle notches mean in orbit: main-engine acceleration
 * in m/s², not a commanded velocity.
 *
 * A velocity setpoint is meaningless on an orbital trajectory - what changes an
 * orbit is delta-v, and delta-v is acceleration times time. The ladder is
 * geometric and spans four orders of magnitude because the useful range genuinely
 * does.
 *
 * With the legibility cap holding one revolution to 22 real seconds, the time to
 * reach escape velocity from a circular orbit is 9.11·v/(a·T) real seconds. At
 * the 20 mm/s² notch that is 11.6 s at Earth (50,000 km), 7.8 s at Mars
 * (20,000 km), 2.8 s at Saturn (1,000,000 km) and 36.7 s at Jupiter
 * (500,000 km) - one notch that works everywhere, with the neighbouring ones for
 * fine trim and for leaving in a hurry. These figures are frame-rate independent
 * by construction; see stepOrbit for why that took substepping to achieve.
 */
export const THRUST_STEPS_MS2 = [0, 0.001, 0.005, 0.02, 0.1, 0.5, 2.0] as const;

/** Attitude the flight computer holds while orbiting. */
export type AttitudeHold = BurnAxis | 'target' | null;

export const DEFAULT_THROTTLE_INDEX = 3; // 50 km/s
export const DEFAULT_TIME_INDEX = 4; // x10,000

/** Fastest object humans have built, for honest context in the UI. */
export const FASTEST_PROBE_KMS = 191; // Parker Solar Probe, Dec 2024 perihelion

/**
 * The pilot's head turns freely all the way round: this is an observation
 * vessel with glass on every side, so there is no direction the seat refuses to
 * face. Yaw is unbounded and simply accumulates - turn left long enough and you
 * come back to the windscreen having passed the port, aft and starboard glass
 * in order. Only pitch is limited, and only to stop the horizon inverting.
 */
const MAX_HEAD_PITCH_UP = THREE.MathUtils.degToRad(88);
const MAX_HEAD_PITCH_DOWN = THREE.MathUtils.degToRad(88);

/** Wall-clock seconds the tail of an approach is stretched over. */
const APPROACH_TAU = 1.4;

/** Half-angle of the clear windscreen; beyond this the attitude assist helps. */
const WINDSCREEN_ARC = THREE.MathUtils.degToRad(32);
/** Base rate the attitude assist swings the hull at, radians per real second. */
const ATTITUDE_ASSIST_RATE = THREE.MathUtils.degToRad(18);

/** Attitude slew rate, radians per real second. */
const SLEW_RATE = THREE.MathUtils.degToRad(75);
/** Manual attitude thruster rate, radians per real second. */
const RCS_ROT_RATE = THREE.MathUtils.degToRad(45);

const FORWARD = new THREE.Vector3(0, 0, -1);
const RIGHT = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
/** Used when the line of travel is within a degree of the pole and WORLD_UP
 *  would be degenerate as a reference. */
const UP_FALLBACK = new THREE.Vector3(0, 0, 1);
const ORIGIN = new THREE.Vector3(0, 0, 0);

export interface OrbitTelemetry {
  bodyName: string;
  radiusKm: number;
  altitudeKm: number;
  speedKms: number;
  periodSec: number;
  eccentricity: number;
  inclinationDeg: number;
  semiMajorKm: number;
  periapsisKm: number;
  apoapsisKm: number;
  periapsisAltKm: number;
  apoapsisAltKm: number;
  trueAnomalyDeg: number;
  escaping: boolean;
  dvSpentKms: number;
  thrustMs2: number;
  hold: AttitudeHold;
  impactPredicted: boolean;
}

export interface ProximityWarning {
  id: string;
  name: string;
  /** 0 = comfortable, 1 = touching the hard limit. */
  severity: number;
}

interface TransitPlan {
  approachDir: THREE.Vector3;
  standoff: number;
}

/**
 * A genuine orbital state, not a scripted circle.
 *
 * The ship carries a body-centred state vector and the trajectory is whatever
 * that vector implies. Burns change the vector; the orbit changes because the
 * physics says so. This is what makes orbit mode manoeuvrable: there is no
 * prescribed path to fight.
 */
interface OrbitPlan {
  /** Body-centred position, km. */
  r: THREE.Vector3;
  /** Body-centred velocity, km/s. */
  v: THREE.Vector3;
  /** Gravitational parameter of the anchor, km³/s². */
  mu: number;
  /** Elements refreshed every step, for the HUD and the trajectory preview. */
  el: OrbitalElements;
  /** Total delta-v spent since insertion, km/s. */
  dvSpent: number;
  /** Whether the escape announcement has already fired. */
  escapeAnnounced: boolean;
  /** Radius the hull may not go below, km. */
  safeRadiusKm: number;
}

interface FlybyPlan {
  phase: 'inbound' | 'pass';
  axis: THREE.Vector3; // direction of travel through the encounter
  offset: THREE.Vector3; // lateral offset at closest approach
  entry: THREE.Vector3; // relative to the body
  exit: THREE.Vector3; // relative to the body
  standoff: number;
  passSpeedKms: number;
}

export class Ship {
  /** Position in true-scale scene units (1 unit = 1,495,978.707 km). */
  readonly pos = new THREE.Vector3();
  /** Hull attitude. -Z is the nose. */
  readonly quat = new THREE.Quaternion();

  /** Head rotation inside the cockpit, relative to the hull. */
  headYaw = 0;
  headPitch = 0;
  private headYawTarget = 0;
  private headPitchTarget = 0;

  /** Physical velocity along the nose, km/s. */
  speedKms = 0;
  /** Commanded physical velocity, km/s. */
  throttleIndex: number = DEFAULT_THROTTLE_INDEX;
  cmdKms: number = THROTTLE_STEPS[DEFAULT_THROTTLE_INDEX];
  /** User-requested simulated seconds per real second. */
  timeIndex: number = DEFAULT_TIME_INDEX;
  timeScale: number = TIME_STEPS[DEFAULT_TIME_INDEX];
  /** What the flight computer actually used this frame (auto-limited). */
  effectiveTimeScale = 1;

  paused = false;
  mode: FlightMode = 'free';
  /**
   * What the NAVIGATION panel is pointed at: distances, bearings, the reticle
   * bracket and gaze lock all follow this, and picking a new one is free.
   */
  targetId: string | null = null;
  /**
   * What the current FLIGHT MODE is attached to. Separate from `targetId` on
   * purpose - orbiting Saturn while lining up Titan as the next hop is a
   * perfectly reasonable thing to want, and tying the two together made
   * selecting a new destination yank the hull across the Solar System.
   */
  anchorId: string | null = null;
  /** Auto-swivel the pilot's head to keep the target in a window. */
  gazeLock = true;

  distanceTravelledKm = 0;

  /** Set by the autopilot when it finishes something worth announcing. */
  event: string | null = null;
  warning: ProximityWarning | null = null;

  /** Manual input, refreshed by the controller each frame. */
  readonly input = { yaw: 0, pitch: 0, roll: 0, strafeX: 0, strafeY: 0 };

  /**
   * Local reference frame.
   *
   * Space has no fixed floor, and at 10,000x compression Earth crosses
   * 300,000 km every real second - a vessel "parked" in a heliocentric
   * inertial frame is left behind before you can look up. A real spacecraft in
   * Earth's neighbourhood shares Earth's ~30 km/s heliocentric velocity, so
   * the flight computer does the same: inside a body's neighbourhood the hull
   * inherits that body's motion, faded in over the outer part of the
   * neighbourhood so there is no step at the boundary.
   *
   * Consequence for the HUD, and it is stated there: the physical velocity
   * shown is velocity RELATIVE TO THE LOCAL FRAME, which is the number mission
   * planners quote anyway ("2.4 km/s relative to Titan").
   */
  frameId: string | null = null;
  private frameVel = new THREE.Vector3();
  private frameWeight = 0;
  private frameDist = Infinity;
  private frameA = new THREE.Vector3();
  private frameB = new THREE.Vector3();

  /** Attitude the flight computer holds while orbiting. */
  hold: AttitudeHold = null;
  /** Scratch state for the propagator, so a step allocates nothing. */
  private orbitOut = { r: new THREE.Vector3(), v: new THREE.Vector3() };
  private orbitUp = new THREE.Vector3();

  private transit: TransitPlan | null = null;
  private orbit: OrbitPlan | null = null;
  private flyby: FlybyPlan | null = null;
  private followOffset = new THREE.Vector3();

  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpM = new THREE.Matrix4();
  private prevPos = new THREE.Vector3();

  // ------------------------------------------------------------ placement --

  /** Park the ship in a body's vicinity, engines idle and holding station. */
  placeNear(id: string, simDays: number, distanceFactor = 2.2): void {
    const target = bodyPositionTrue(id, simDays, this.tmpA).clone();
    const standoff = arrivalDistance(id) * distanceFactor;
    // approach from the sunward side and a little above the ecliptic so the
    // body shows a lit disc rather than a silhouette
    const sunward = target.lengthSq() > 1e-9 ? target.clone().negate().normalize() : new THREE.Vector3(0, 0, 1);
    const dir = sunward.clone().multiplyScalar(0.72).addScaledVector(WORLD_UP, 0.28).normalize();
    this.pos.copy(target).addScaledVector(dir, standoff);
    this.lookAtPoint(target);
    this.idle();
    this.startFollow(id, simDays);
  }

  /** Cut the engine and zero the commanded velocity. */
  idle(): void {
    this.speedKms = 0;
    this.cmdKms = 0;
    this.throttleIndex = 0;
  }

  /** Point the nose at a world position immediately. */
  lookAtPoint(point: THREE.Vector3): void {
    this.tmpM.lookAt(this.pos, point, WORLD_UP);
    this.quat.setFromRotationMatrix(this.tmpM);
  }

  // ------------------------------------------------------------- controls --

  setThrottleIndex(i: number): void {
    this.throttleIndex = THREE.MathUtils.clamp(i, 0, THROTTLE_STEPS.length - 1);
    this.cmdKms = THROTTLE_STEPS[this.throttleIndex];
    // A throttle change means the pilot is flying, not the autopilot - except in
    // orbit, where the throttle IS the pilot's control over the trajectory and
    // aborting would be exactly the lock-out this mode is meant not to have.
    if (this.mode === 'transit' || this.mode === 'flyby') this.abort('Autopilot released - manual throttle.');
  }

  /** Main-engine acceleration at the current notch, m/s² (orbit mode). */
  get thrustMs2(): number {
    return THRUST_STEPS_MS2[this.throttleIndex] ?? 0;
  }

  /** Set the attitude the flight computer holds. */
  setHold(hold: AttitudeHold): void {
    this.hold = hold;
    this.event = hold
      ? `Attitude hold: ${hold === 'target' ? 'target' : BURN_LABEL[hold].toLowerCase()}.`
      : 'Attitude hold released - manual control.';
  }

  /** Step through the manoeuvre axes; used by the keyboard. */
  cycleHold(): void {
    const order: AttitudeHold[] = [...BURN_AXES, 'target', null];
    const i = order.indexOf(this.hold);
    this.setHold(order[(i + 1) % order.length]);
  }

  /**
   * Leave the orbit for free flight, keeping the state vector intact.
   *
   * Position is untouched and the velocity is preserved by pointing the nose
   * along it and commanding exactly the speed the ship already had, so the hull
   * carries straight on out of the orbit instead of being teleported or having
   * its motion quietly zeroed.
   */
  releaseOrbit(): void {
    if (this.mode !== 'orbit' || !this.orbit) return;
    const name = this.nameOf(this.anchorId);
    const speed = this.handOverToFreeFlight();
    this.event =
      `Orbit released at ${name} - free flight, holding ${speed.toFixed(2)} km/s along the ` +
      `velocity vector. Position and velocity unchanged.`;
  }

  /**
   * Move from an orbital state into free flight without disturbing the hull.
   *
   * Position is not touched at all. Velocity is preserved by pointing the nose
   * along the current velocity vector and commanding exactly the speed the ship
   * already has, so the velocity-hold computer takes over holding what physics
   * had it doing rather than braking it to a stop or snapping it somewhere new.
   * Returns the preserved speed in km/s.
   */
  private handOverToFreeFlight(): number {
    const plan = this.orbit;
    const speed = plan ? plan.v.length() : this.speedKms;
    if (plan && speed > 1e-9) {
      this.lookAtPoint(this.tmpC.copy(this.pos).addScaledVector(plan.v, UNITS_PER_KM));
    }
    this.speedKms = speed;
    this.cmdKms = speed;
    // the chip ladder no longer describes this value, so no chip is lit
    this.throttleIndex = -1;
    this.orbit = null;
    this.hold = null;
    // Gaze lock has to go too. In free flight it drives the attitude assist,
    // which would immediately swing the nose off the velocity vector and back
    // onto the body - and since free flight travels along the nose, "continue
    // naturally out of the orbit" would become "fly into the planet".
    this.gazeLock = false;
    this.mode = 'free';
    return speed;
  }

  setTimeIndex(i: number): void {
    this.timeIndex = THREE.MathUtils.clamp(i, 0, TIME_STEPS.length - 1);
    this.timeScale = TIME_STEPS[this.timeIndex];
  }

  nudgeThrottle(dir: 1 | -1): void {
    // after a hand-over the throttle holds a custom value with no chip lit;
    // stepping from there picks the nearest notch in the requested direction
    if (this.throttleIndex < 0) {
      let i = THROTTLE_STEPS.findIndex((v) => v > this.cmdKms);
      if (i < 0) i = THROTTLE_STEPS.length - 1;
      this.setThrottleIndex(dir > 0 ? i : Math.max(0, i - 1));
      return;
    }
    this.setThrottleIndex(this.throttleIndex + dir);
  }

  fullStop(): void {
    // In orbit "all stop" can only mean cutting the engine: you cannot stop
    // dead on a trajectory, and pretending otherwise would be the same lie the
    // kinematic version told.
    if (this.mode === 'orbit') {
      this.idle();
      this.event = 'Main engine cut. Coasting on the current trajectory.';
      return;
    }
    this.idle();
    // an all-stop while station-keeping keeps the station: that IS stopped
    if (this.mode !== 'follow' || !this.anchorId) {
      this.mode = 'free';
      this.anchorId = null;
    }
    this.transit = this.orbit = this.flyby = null;
    this.event = 'All stop. Relative velocity zeroed.';
  }

  abort(reason = 'Autopilot disengaged.'): void {
    if (this.mode === 'free') return;
    this.mode = 'free';
    this.anchorId = null;
    this.transit = this.orbit = this.flyby = null;
    this.event = reason;
  }

  /** Drag input from the pointer, in radians. Yaw accumulates without limit;
   *  only pitch is clamped, and only to keep the horizon the right way up. */
  look(dYaw: number, dPitch: number): void {
    this.gazeLock = false;
    this.headYawTarget += dYaw;
    this.headPitchTarget = THREE.MathUtils.clamp(
      this.headPitchTarget + dPitch,
      -MAX_HEAD_PITCH_DOWN,
      MAX_HEAD_PITCH_UP,
    );
  }

  /** Snap the pilot's head to a preset window. */
  lookPreset(yawDeg: number, pitchDeg: number): void {
    this.gazeLock = false;
    // presets are shortcuts, not the only reachable directions - take the
    // shortest way round from wherever the head currently is
    const want = THREE.MathUtils.degToRad(yawDeg);
    const turns = Math.round((this.headYawTarget - want) / (Math.PI * 2));
    this.headYawTarget = want + turns * Math.PI * 2;
    this.headPitchTarget = THREE.MathUtils.clamp(
      THREE.MathUtils.degToRad(pitchDeg),
      -MAX_HEAD_PITCH_DOWN,
      MAX_HEAD_PITCH_UP,
    );
  }

  /** Swing the hull so the nose points where the pilot is looking. */
  /**
   * Point the hull's nose down a given direction, keeping "up" as close to the
   * ecliptic north as the geometry allows. Used on an interstellar crossing,
   * where there is no body to orient against and the only meaningful bearing is
   * the line of travel itself.
   */
  faceDirection(dir: THREE.Vector3): void {
    if (dir.lengthSq() < 1e-12) return;
    const forward = dir.clone().normalize();
    const up = Math.abs(forward.y) > 0.98 ? UP_FALLBACK : WORLD_UP;
    // three.js cameras and this hull both look down −z
    this.tmpM.lookAt(new THREE.Vector3(0, 0, 0), forward.negate(), up);
    this.quat.setFromRotationMatrix(this.tmpM);
    this.headYaw = 0;
    this.headPitch = 0;
    this.headYawTarget = this.headPitchTarget = 0;
  }

  alignHullToGaze(): void {
    const q = this.headQuaternion(this.tmpQ);
    this.quat.multiply(q);
    // fold the accumulated turns away with the hull, so the head does not
    // spin back through everything it just travelled
    this.headYaw = 0;
    this.headPitch = 0;
    this.headYawTarget = this.headPitchTarget = 0;
    this.event = 'Hull aligned to line of sight.';
  }

  headQuaternion(out: THREE.Quaternion): THREE.Quaternion {
    return out.setFromEuler(new THREE.Euler(this.headPitch, this.headYaw, 0, 'YXZ'));
  }

  // --------------------------------------------------------- flight plans --

  /** Cruise to a body and park in its vicinity. `closeness` < 1 flies closer. */
  startTransit(id: string, simDays: number, closeness = 1): void {
    const target = bodyPositionTrue(id, simDays, this.tmpA);
    const standoff = Math.max(arrivalDistance(id) * closeness, minSafeDistance(id) * 1.35);
    this.targetId = id;
    const rel = this.tmpB.copy(this.pos).sub(target);
    if (rel.length() <= standoff * 1.06) {
      // already inside the arrival shell - hold station instead of backing off
      this.startFollow(id, simDays);
      this.event = `Already in ${this.nameOf(id)} vicinity - holding station.`;
      return;
    }
    const sunward =
      target.lengthSq() > 1e-9 ? this.tmpC.copy(target).negate().normalize() : this.tmpC.set(0, 0, 1);
    // keep most of the current approach direction (so the flight reads as a
    // straight run) but bias toward the lit side and lift off the ecliptic
    const dir = rel.normalize().multiplyScalar(0.62).addScaledVector(sunward, 0.38);
    if (Math.abs(dir.y) < 0.12) dir.y += 0.2;
    dir.normalize();
    this.transit = { approachDir: dir.clone(), standoff };
    this.orbit = this.flyby = null;
    this.anchorId = id;
    this.mode = 'transit';
    this.gazeLock = true;
    if (this.cmdKms < 10) this.setThrottleIndexQuiet(DEFAULT_THROTTLE_INDEX);
    // Pick a compression that makes the trip watchable. The physical velocity
    // is untouched - only how fast the simulation clock runs - and the HUD keeps
    // showing both, so the honesty of the distance survives the convenience.
    const runKm = Math.max(0, rel.length() - standoff) * KM_PER_UNIT;
    const simSeconds = runKm / Math.max(this.cmdKms, 1);
    while (
      this.timeIndex < TIME_STEPS.length - 1 &&
      simSeconds / TIME_STEPS[this.timeIndex] > 60
    ) {
      this.setTimeIndex(this.timeIndex + 1);
    }
    this.event =
      `Cruise to ${this.nameOf(id)} engaged - ` +
      `${(simSeconds / 86_400).toFixed(simSeconds > 8.64e6 ? 0 : 1)} days of flight ` +
      `at ${Math.round(this.cmdKms)} km/s, compressed ${TIME_STEPS[this.timeIndex].toLocaleString('en-US')}x.`;
  }

  private setThrottleIndexQuiet(i: number): void {
    this.throttleIndex = THREE.MathUtils.clamp(i, 0, THROTTLE_STEPS.length - 1);
    this.cmdKms = THROTTLE_STEPS[this.throttleIndex];
  }

  /**
   * Insert into orbit around a body.
   *
   * The insertion burn is implied: station-keeping means ~zero velocity
   * relative to the body, so entering orbit has to hand the hull the orbital
   * velocity it needs. From there nothing is scripted - the trajectory is
   * whatever the state vector says, and every control still works.
   */
  startOrbit(id: string, simDays: number): void {
    const target = bodyPositionTrue(id, simDays, this.tmpA);
    const mu = this.gmOf(id);
    const safeKm = minSafeDistance(id) * KM_PER_UNIT;

    // orbit where the ship already is when that is sensible, otherwise at the
    // standard arrival shell - either way it never teleports across the sky
    const rel = this.tmpB.copy(this.pos).sub(target);
    let radius = Math.max(arrivalDistance(id) * 0.8, minSafeDistance(id) * 1.5);
    if (rel.length() > minSafeDistance(id) * 1.2 && rel.length() < radius * 2.5) {
      radius = rel.length();
    }
    let u = rel.clone();
    if (u.lengthSq() < 1e-16) u.set(1, 0, 0);
    u.normalize();

    // Plane: tilted off the pole so a ring system is seen at an angle rather
    // than edge-on. The ship joins at its own current bearing.
    let n = new THREE.Vector3().crossVectors(u, WORLD_UP);
    if (n.lengthSq() < 1e-8) n.set(1, 0, 0).cross(u);
    n.normalize().applyAxisAngle(u, THREE.MathUtils.degToRad(42)).normalize();
    const w = new THREE.Vector3().crossVectors(n, u).normalize();

    const rKm = radius * KM_PER_UNIT;
    const speed = circularSpeed(mu, rKm);
    const r = u.clone().multiplyScalar(rKm);
    const v = w.clone().multiplyScalar(speed);

    this.orbit = {
      r,
      v,
      mu,
      el: elementsFrom(r, v, mu),
      dvSpent: 0,
      escapeAnnounced: false,
      safeRadiusKm: safeKm,
    };
    this.transit = this.flyby = null;
    this.targetId = id;
    this.anchorId = id;
    this.mode = 'orbit';
    this.gazeLock = true;
    this.hold = 'prograde';
    this.idle(); // engine off: the pilot decides when to change the orbit
    this.pos.copy(target).addScaledVector(u, radius);
    // start in the orbital attitude straight away rather than slewing into it
    this.tmpM.lookAt(ORIGIN, w, n);
    this.quat.setFromRotationMatrix(this.tmpM);
    this.event =
      `Orbit insertion at ${this.nameOf(id)} complete - ` +
      `${speed.toFixed(2)} km/s circular, period ${fmtHours(this.orbit.el.period)}. ` +
      `Throttle up to change it.`;
  }

  /** Set up and run a cinematic pass. */
  startFlyby(id: string, simDays: number): void {
    const target = bodyPositionTrue(id, simDays, this.tmpA);
    const standoff = arrivalDistance(id);
    const rel = this.tmpB.copy(this.pos).sub(target);
    // travel roughly the way we already face the body, so the pass feels like
    // a continuation of the cruise rather than a teleport-and-restart
    const axis = rel.lengthSq() > 1e-14 ? rel.clone().negate().normalize() : new THREE.Vector3(0, 0, -1);
    const sunward = target.lengthSq() > 1e-9 ? target.clone().negate().normalize() : new THREE.Vector3(0, 0, 1);
    // offset sideways, perpendicular to the run and biased toward the lit side
    let lateral = new THREE.Vector3().crossVectors(axis, sunward);
    if (lateral.lengthSq() < 1e-8) lateral = new THREE.Vector3().crossVectors(axis, WORLD_UP);
    if (lateral.lengthSq() < 1e-8) lateral.set(1, 0, 0);
    lateral.normalize().addScaledVector(WORLD_UP, 0.45).normalize();
    lateral.addScaledVector(axis, -lateral.dot(axis)).normalize();

    const b = standoff * 0.75;
    const L = standoff * 18;
    const offset = lateral.multiplyScalar(b);
    const entry = offset.clone().addScaledVector(axis, -L);
    const exit = offset.clone().addScaledVector(axis, L);
    // ~26 s of real time for the encounter itself
    this.flyby = {
      phase: 'inbound',
      axis,
      offset,
      entry,
      exit,
      standoff,
      passSpeedKms: Math.max(this.cmdKms, 60),
    };
    this.transit = this.orbit = null;
    this.targetId = id;
    this.anchorId = id;
    this.mode = 'flyby';
    this.gazeLock = true;
    this.event = `Fly-by trajectory plotted for ${this.nameOf(id)}.`;
  }

  /** Hold a fixed position relative to a body. */
  startFollow(id: string, simDays: number): void {
    const target = bodyPositionTrue(id, simDays, this.tmpA);
    this.followOffset.copy(this.pos).sub(target);
    const minD = minSafeDistance(id) * 1.15;
    if (this.followOffset.length() < minD) this.followOffset.setLength(minD);
    this.targetId = id;
    this.anchorId = id;
    this.transit = this.orbit = this.flyby = null;
    this.mode = 'follow';
    this.event = `Station-keeping with ${this.nameOf(id)}.`;
  }

  // ---------------------------------------------------------------- frame --

  /**
   * Advance the vessel. `dt` is real seconds; returns the number of SIMULATED
   * seconds that elapsed, which the caller folds into the simulation clock.
   *
   * Long frames are split. Several of the flight computer's loops are closed on
   * real time - the attitude slew, the throttle ramp, and above all the orbital
   * time-compression limiter, which is a function of the very orbit the burn is
   * changing. Sampling that feedback once per frame makes the outcome depend on
   * the frame rate: the same burn under-delivers by roughly a fifth at 2 fps
   * against 60. Capping the sub-step at 50 ms costs a handful of extra
   * evaluations on a struggling machine and makes the physics the pilot's, not
   * the GPU's.
   */
  update(dt: number, simDays: number): number {
    const parts = Math.min(12, Math.max(1, Math.ceil(dt / 0.05)));
    if (parts === 1) return this.step(dt, simDays);
    let total = 0;
    const h = dt / parts;
    for (let i = 0; i < parts; i++) total += this.step(h, simDays + total / 86_400);
    return total;
  }

  private step(dt: number, simDays: number): number {
    this.prevPos.copy(this.pos);
    this.applyManualAttitude(dt);
    this.updateLocalFrame(simDays);

    // ---- how fast should simulated time run this frame? ----
    let effT = this.paused ? 0 : this.timeScale;
    if (!this.paused) {
      if (this.mode === 'transit' && this.transit) {
        effT = Math.min(effT, this.transitTimeLimit(simDays));
      } else if (this.mode === 'orbit' && this.orbit) {
        effT = Math.min(effT, this.orbitTimeLimit(dt));
      } else if (this.mode === 'flyby' && this.flyby) {
        effT = Math.min(effT, this.flybyTimeLimit(simDays));
      }
      // never let the local frame's own motion outrun the ship's distance from
      // it in a single frame - that is what makes a 1,000,000x cruise stable
      // when it ends up inside a moon system
      // only the modes that integrate the carry need this - orbit and
      // station-keeping place the hull from the target's exact position, so
      // they stay correct at any compression
      const carries = this.mode === 'free' || this.mode === 'transit' || this.mode === 'flyby';
      const fv = this.frameVel.length();
      if (carries && this.frameWeight > 0.01 && fv > 1e-12 && dt > 1e-6) {
        effT = Math.min(effT, Math.max(1, (this.frameDist * 0.2) / fv / dt));
      }
      effT = Math.max(1, effT);
    }
    this.effectiveTimeScale = effT;
    const simDt = effT * dt;

    // the caller advances the clock BEFORE bodies move, so read positions at
    // the new time to keep the autopilot chasing where things actually are
    const newSimDays = simDays + simDt / 86_400;

    switch (this.mode) {
      case 'transit':
        this.stepTransit(dt, simDt, newSimDays);
        break;
      case 'orbit':
        this.stepOrbit(dt, simDt, newSimDays);
        break;
      case 'flyby':
        this.stepFlyby(dt, simDt, newSimDays);
        break;
      case 'follow':
        this.stepFollow(dt, simDt, newSimDays);
        break;
      default:
        this.stepFree(dt, simDt);
    }

    this.enforceProximity(newSimDays);
    this.distanceTravelledKm += this.prevPos.distanceTo(this.pos) * KM_PER_UNIT;
    this.updateHead(dt, newSimDays);
    return simDt;
  }

  /** Pick the body whose neighbourhood the ship is deepest inside, and measure
   *  its velocity by finite difference of the same ephemeris the renderer uses. */
  private updateLocalFrame(simDays: number): void {
    let bestId: string | null = null;
    let bestScore = Infinity;
    let bestDist = Infinity;
    for (const id of NEIGHBOUR_IDS) {
      if (id === 'sun') continue;
      const def = catalogObject(id);
      if (!def) continue;
      bodyPositionTrue(id, simDays, this.frameA);
      const d = this.pos.distanceTo(this.frameA);
      const reach = bodyRadiusTrue(id) * (def.type === 'planet' ? 260 : 90);
      if (d > reach) continue;
      const score = d / reach;
      if (score < bestScore) {
        bestScore = score;
        bestId = id;
        bestDist = d;
      }
    }
    if (!bestId) {
      this.frameId = null;
      this.frameWeight = 0;
      this.frameDist = Infinity;
      this.frameVel.set(0, 0, 0);
      return;
    }
    this.frameId = bestId;
    this.frameDist = bestDist;
    this.frameWeight = 1 - THREE.MathUtils.smoothstep(bestScore, 0.72, 1);
    const hSec = 120;
    const hDays = hSec / 86_400;
    bodyPositionTrue(bestId, simDays + hDays / 2, this.frameA);
    bodyPositionTrue(bestId, simDays - hDays / 2, this.frameB);
    this.frameVel.copy(this.frameA).sub(this.frameB).divideScalar(hSec);
  }

  /** Displacement contributed by riding the local frame this step. */
  private carryFrame(simDt: number): void {
    if (this.frameWeight <= 0.001) return;
    this.pos.addScaledVector(this.frameVel, simDt * this.frameWeight);
  }

  // ------------------------------------------------------------- steering --

  private applyManualAttitude(dt: number): void {
    const { yaw, pitch, roll } = this.input;
    if (yaw === 0 && pitch === 0 && roll === 0) return;
    // manual attitude input takes the ship off autopilot heading control. In
    // orbit that means dropping the attitude hold, not dropping the orbit.
    if (this.mode === 'transit' || this.mode === 'flyby') this.abort('Manual attitude - autopilot released.');
    else if (this.mode === 'orbit' && this.hold) this.hold = null;
    const e = new THREE.Euler(pitch * RCS_ROT_RATE * dt, yaw * RCS_ROT_RATE * dt, roll * RCS_ROT_RATE * dt, 'YXZ');
    this.quat.multiply(this.tmpQ.setFromEuler(e));
  }

  /**
   * Rate-limited slew of the nose toward a world direction.
   *
   * `up` picks the roll. It matters in orbit: pointing the nose prograde with
   * the orbit normal as "up" puts the body squarely out of the port window,
   * which is how an orbiting spacecraft is actually flown and the only way the
   * planet ends up somewhere the pilot can see it.
   */
  private slewTo(
    dir: THREE.Vector3,
    dt: number,
    rate = SLEW_RATE,
    up: THREE.Vector3 = WORLD_UP,
  ): number {
    if (dir.lengthSq() < 1e-20) return 0;
    this.tmpM.lookAt(ORIGIN, dir, up);
    this.tmpQ.setFromRotationMatrix(this.tmpM);
    const before = this.quat.angleTo(this.tmpQ);
    this.quat.rotateTowards(this.tmpQ, rate * dt);
    return before;
  }

  private forward(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(FORWARD).applyQuaternion(this.quat);
  }

  /** Move `km` along `dir`, never further than a fraction of the range left.
   *  A single frame at a million-fold compression is a very long way; without
   *  this cap a lag in attitude or a slow frame becomes an overshoot. */
  private stepAlong(dir: THREE.Vector3, km: number, remaining: number): void {
    const units = Math.min(km * UNITS_PER_KM, remaining * 0.35);
    this.pos.addScaledVector(dir, units);
  }

  // ---------------------------------------------------------------- modes --

  private stepFree(dt: number, simDt: number): void {
    this.rampSpeed(dt);
    const v = this.forward(this.tmpA).multiplyScalar(this.speedKms);
    // RCS translation scales with the commanded cruise so it stays useful at
    // any throttle setting; it is a real sideways burn, not a camera pan
    const rcs = Math.max(1, Math.abs(this.cmdKms) * 0.3);
    if (this.input.strafeX !== 0) {
      v.addScaledVector(this.tmpB.copy(RIGHT).applyQuaternion(this.quat), this.input.strafeX * rcs);
    }
    if (this.input.strafeY !== 0) {
      v.addScaledVector(this.tmpB.copy(UP).applyQuaternion(this.quat), this.input.strafeY * rcs);
    }
    this.pos.addScaledVector(v, simDt * UNITS_PER_KM);
    this.carryFrame(simDt);
  }

  private rampSpeed(dt: number): void {
    const accel = Math.max(4, Math.abs(this.cmdKms) * 1.6); // km/s per real second
    const d = THREE.MathUtils.clamp(this.cmdKms - this.speedKms, -accel * dt, accel * dt);
    this.speedKms += d;
    if (Math.abs(this.speedKms - this.cmdKms) < 1e-4) this.speedKms = this.cmdKms;
  }

  /** Distance (scene units) still to run on the current transit. */
  private transitRemaining(simDays: number): number {
    if (!this.transit || !this.anchorId) return 0;
    const target = bodyPositionTrue(this.anchorId, simDays, this.tmpA);
    const aim = this.tmpB.copy(target).addScaledVector(this.transit.approachDir, this.transit.standoff);
    return aim.distanceTo(this.pos);
  }

  /**
   * Velocity the braking profile wants at a given range: full cruise until the
   * braking distance, then v = sqrt(2·a·d) so the hull arrives at rest.
   */
  private profileSpeed(dKm: number, standoffUnits: number): number {
    const cruise = Math.max(this.cmdKms, 1);
    const brakeKm = Math.max(standoffUnits * KM_PER_UNIT * 25, 2e5);
    const accel = (cruise * cruise) / (2 * brakeKm);
    return Math.min(cruise, Math.sqrt(Math.max(0, 2 * accel * dKm)));
  }

  /**
   * Time compression cap for a run in progress.
   *
   * Sized from the velocity the profile INTENDS to fly, not the commanded
   * cruise: once the ship is braking it is doing 90 km/s, not 1000, and pacing
   * the clock off the commanded figure would stretch the last stretch of every
   * approach into a minute of watching a planet not get closer. Pacing it off
   * the intended velocity makes the remaining distance decay by a fixed
   * fraction per frame, so an approach takes the same wall time at 5 fps and at
   * 144 fps.
   */
  private transitTimeLimit(simDays: number): number {
    if (!this.transit) return this.timeScale;
    const dKm = this.transitRemaining(simDays) * KM_PER_UNIT;
    const v = Math.max(this.speedKms, this.profileSpeed(dKm, this.transit.standoff), 0.5);
    return Math.max(1, dKm / v / APPROACH_TAU);
  }

  private stepTransit(dt: number, simDt: number, simDays: number): void {
    const plan = this.transit;
    if (!plan || !this.anchorId) {
      this.mode = 'free';
      return;
    }
    const target = bodyPositionTrue(this.anchorId, simDays, this.tmpA).clone();
    const aim = target.clone().addScaledVector(plan.approachDir, plan.standoff);
    const toAim = aim.clone().sub(this.pos);
    const d = toAim.length();
    const dKm = d * KM_PER_UNIT;

    this.slewTo(toAim, dt);

    const want = this.profileSpeed(dKm, plan.standoff);
    // Turn first, then burn. Without a firm gate the first frame of a run - when
    // the nose is still swinging round - fires the engine along the old heading
    // at full compression, which can hurl the hull into whatever it was parked
    // beside before the attitude ever catches up.
    const fwd = this.forward(this.tmpB);
    const align = Math.max(0, fwd.dot(toAim.clone().normalize()));
    const gate = THREE.MathUtils.smoothstep(align, 0.5, 0.92);
    this.speedKms = THREE.MathUtils.lerp(this.speedKms, want * gate, 1 - Math.exp(-dt * 3));

    this.stepAlong(fwd, this.speedKms * simDt, d);
    this.carryFrame(simDt);

    if (d < plan.standoff * 0.1 || d < 1e-7) {
      const name = this.nameOf(this.anchorId);
      this.startFollow(this.anchorId, simDays);
      this.idle();
      this.event = `Arrived: ${name}. Station-keeping - fly manually to close in.`;
    }
  }

  /**
   * One orbital step: burn, coast, burn.
   *
   * The coast is an exact closed-form Kepler propagation, so it is correct at
   * any step size - which matters, because a single frame here can cover more
   * than a whole orbit. Thrust is split around it (Strang splitting) so a burn
   * does not systematically bias the resulting trajectory.
   */
  private stepOrbit(dt: number, simDt: number, simDays: number): void {
    const plan = this.orbit;
    if (!plan || !this.anchorId) {
      this.mode = 'free';
      return;
    }

    // ---- attitude: hold an orbital axis, or leave the nose to the pilot ----
    this.applyAttitudeHold(dt, simDays, plan);

    // ---- thrust: the nose direction, at the throttle's acceleration --------
    const accel = this.tmpC.set(0, 0, 0);
    const mainMs2 = THRUST_STEPS_MS2[this.throttleIndex] ?? 0;
    if (mainMs2 > 0) {
      accel.addScaledVector(this.forward(this.tmpB), mainMs2 * 1e-3); // m/s² → km/s²
    }
    // RCS translation gives fine control at a fraction of main-engine authority
    const rcs = Math.max(mainMs2, 0.005) * 0.35 * 1e-3;
    if (this.input.strafeX !== 0) {
      accel.addScaledVector(this.tmpB.copy(RIGHT).applyQuaternion(this.quat), this.input.strafeX * rcs);
    }
    if (this.input.strafeY !== 0) {
      accel.addScaledVector(this.tmpB.copy(UP).applyQuaternion(this.quat), this.input.strafeY * rcs);
    }

    if (simDt !== 0) {
      // Split the frame until each sub-burn is small against the local orbital
      // speed. The alternative - capping time compression so one frame's delta-v
      // stays small - would tie how fast the orbit responds to the frame rate:
      // the same notch held for the same wall-clock time would deliver 72x more
      // delta-v at 144 fps than at 2 fps. Substepping keeps the integration
      // honest while the delivered delta-v per REAL second stays a property of
      // the engine and the orbit, which is what the pilot is entitled to assume.
      const dvTotal = accel.length() * Math.abs(simDt);
      const speed = Math.max(plan.v.length(), 1e-9);
      const sub = Math.min(64, Math.max(1, Math.ceil(dvTotal / (MAX_BURN_FRACTION * speed))));
      const h = simDt / sub;
      for (let i = 0; i < sub; i++) {
        propagateWithThrust(plan.r, plan.v, plan.mu, h, accel, this.orbitOut);
        plan.r.copy(this.orbitOut.r);
        plan.v.copy(this.orbitOut.v);
      }
      plan.dvSpent += dvTotal;
    }

    // ---- the floor: never inside the body -------------------------------
    const rMag = plan.r.length();
    if (rMag < plan.safeRadiusKm) {
      plan.r.setLength(plan.safeRadiusKm);
      // shed the inward radial component so the hull skims rather than digs in
      const radial = this.tmpB.copy(plan.r).normalize();
      const vr = plan.v.dot(radial);
      if (vr < 0) plan.v.addScaledVector(radial, -vr);
      this.event = `Proximity limit at ${this.nameOf(this.anchorId)}. Trajectory held at the safe radius.`;
    }

    plan.el = elementsFrom(plan.r, plan.v, plan.mu);

    // ---- escape detection -------------------------------------------------
    if (plan.el.escaping && !plan.escapeAnnounced) {
      plan.escapeAnnounced = true;
      this.event =
        `ESCAPE TRAJECTORY - eccentricity ${plan.el.e.toFixed(2)}. ` +
        `You are no longer bound to ${this.nameOf(this.anchorId)}.`;
    } else if (!plan.el.escaping && !plan.el.marginallyBound && plan.escapeAnnounced) {
      plan.escapeAnnounced = false;
      this.event = `Recaptured - closed orbit around ${this.nameOf(this.anchorId)} restored.`;
    }

    // ---- place the hull ---------------------------------------------------
    const target = bodyPositionTrue(this.anchorId, simDays, this.tmpA);
    this.pos.copy(target).addScaledVector(plan.r, UNITS_PER_KM);
    // NOTE: no carryFrame here. The anchor's own heliocentric motion is already
    // in `target`; adding it again would double-count it and fling the ship out.

    this.speedKms = plan.v.length();

    // Once an unbound trajectory has genuinely left the body's neighbourhood,
    // two-body maths about that body stops meaning anything - hand the state
    // vector over to free flight, untouched.
    if (plan.el.escaping) {
      const def = catalogObject(this.anchorId);
      const reachKm = bodyRadiusKm(this.anchorId) * (def?.type === 'planet' ? 260 : 90);
      if (plan.el.r > reachKm) {
        const name = this.nameOf(this.anchorId);
        const speed = this.handOverToFreeFlight();
        this.event =
          `Left ${name}'s neighbourhood on the escape trajectory - ` +
          `free flight at ${speed.toFixed(2)} km/s.`;
      }
    }
  }

  /**
   * Point the nose where the flight computer is told to hold it, and roll the
   * hull so the body being orbited stays in a window.
   *
   * The reference "up" is the orbit normal. With the nose prograde that puts
   * the planet exactly abeam to port - the classic orbital attitude, and the
   * reason the view out of the side glass is of the planet rather than of a
   * bulkhead. For a normal/anti-normal hold the normal IS the nose, so the
   * velocity vector takes over as the roll reference instead.
   */
  private applyAttitudeHold(dt: number, simDays: number, plan: OrbitPlan): void {
    if (!this.hold) return;
    const normalHold = this.hold === 'normal' || this.hold === 'anti-normal';
    const up = this.orbitUp;
    if (normalHold) up.copy(plan.v);
    else up.crossVectors(plan.r, plan.v);
    if (up.lengthSq() < 1e-18) up.copy(WORLD_UP);
    else up.normalize();

    if (this.hold === 'target') {
      if (!this.targetId) return;
      const t = bodyPositionTrue(this.targetId, simDays, this.tmpA);
      this.slewTo(this.tmpB.copy(t).sub(this.pos), dt, SLEW_RATE, up);
      return;
    }
    burnDirection(this.hold, plan.r, plan.v, this.tmpB);
    this.slewTo(this.tmpB, dt, SLEW_RATE, up);
  }

  /**
   * How fast simulated time may run while orbiting.
   *
   * Analytic propagation is exact at any step size, so none of these caps are
   * about the coast being wrong. They are about the three things a big step
   * still breaks:
   *
   *  - LEGIBILITY: an orbit that completes in under ~22 s of real time is not
   *    something a person can watch or fly.
   *  - TUNNELLING: the hull is a point sample once per frame. Moving a large
   *    fraction of the orbital radius in one step can carry it clean through a
   *    planet between samples, so the step is capped at a fifth of the current
   *    radius. Near periapsis the radius is small and the speed high, so this
   *    tightens exactly where it needs to.
   * Burn accuracy is deliberately NOT handled here. Capping the clock to keep
   * one frame's delta-v small would make orbital authority proportional to
   * frame rate; stepOrbit substeps the burn instead, which keeps the
   * integration accurate without touching how fast the orbit may evolve.
   */
  private orbitTimeLimit(dt: number): number {
    const plan = this.orbit;
    if (!plan) return this.timeScale;
    const speed = Math.max(plan.v.length(), 1e-9);
    const step = Math.max(dt, 1e-4);

    // legibility (closed orbits only - a hyperbola has no period)
    let limit = Number.isFinite(plan.el.period) ? plan.el.period / 22 : Infinity;

    // tunnelling: never cross more than a fifth of the current radius per frame
    limit = Math.min(limit, (0.2 * plan.r.length()) / speed / step);

    return Math.max(1, limit);
  }

  private flybyTimeLimit(simDays: number): number {
    const plan = this.flyby;
    if (!plan || !this.anchorId) return this.timeScale;
    const target = bodyPositionTrue(this.anchorId, simDays, this.tmpA);
    if (plan.phase === 'inbound') {
      const entry = this.tmpB.copy(target).add(plan.entry);
      const dKm = entry.distanceTo(this.pos) * KM_PER_UNIT;
      const v = Math.max(this.speedKms, plan.passSpeedKms, 0.5);
      return Math.max(1, dKm / v / APPROACH_TAU);
    }
    // the encounter itself: stretch the whole pass over ~26 s of real time
    const passKm = plan.entry.distanceTo(plan.exit) * KM_PER_UNIT;
    return Math.max(1, passKm / Math.max(plan.passSpeedKms, 1) / 26);
  }

  private stepFlyby(dt: number, simDt: number, simDays: number): void {
    const plan = this.flyby;
    if (!plan || !this.anchorId) {
      this.mode = 'free';
      return;
    }
    const target = bodyPositionTrue(this.anchorId, simDays, this.tmpA).clone();
    if (plan.phase === 'inbound') {
      const entry = target.clone().add(plan.entry);
      const toEntry = entry.clone().sub(this.pos);
      const d = toEntry.length();
      this.slewTo(toEntry, dt);
      const cruise = Math.max(this.cmdKms, 60);
      const dKm = d * KM_PER_UNIT;
      const brakeKm = Math.max(plan.standoff * KM_PER_UNIT * 12, 2e5);
      const accel = (cruise * cruise) / (2 * brakeKm);
      const want = Math.max(plan.passSpeedKms, Math.min(cruise, Math.sqrt(Math.max(0, 2 * accel * dKm))));
      const fwd = this.forward(this.tmpB);
      const align = Math.max(0, fwd.dot(toEntry.clone().normalize()));
      const gate = THREE.MathUtils.smoothstep(align, 0.5, 0.92);
      this.speedKms = THREE.MathUtils.lerp(this.speedKms, want * gate, 1 - Math.exp(-dt * 3));
      this.stepAlong(fwd, this.speedKms * simDt, d);
      this.carryFrame(simDt);
      if (d < plan.standoff * 0.6) {
        plan.phase = 'pass';
        this.speedKms = plan.passSpeedKms;
        this.event = `Encounter: ${this.nameOf(this.anchorId)}. Look through the windows.`;
      }
      return;
    }

    // pass: hold the trajectory, let the body sweep past the windows
    const exit = target.clone().add(plan.exit);
    const toExit = exit.clone().sub(this.pos);
    this.slewTo(toExit, dt, SLEW_RATE * 0.6);
    this.speedKms = plan.passSpeedKms;
    this.pos.addScaledVector(this.forward(this.tmpB), this.speedKms * simDt * UNITS_PER_KM);
    this.carryFrame(simDt);
    if (toExit.length() < plan.standoff * 0.8) {
      const name = this.nameOf(this.anchorId);
      this.mode = 'free';
      this.flyby = null;
      this.event = `Fly-by of ${name} complete - it is shrinking behind you now.`;
    }
  }

  private stepFollow(dt: number, simDt: number, simDays: number): void {
    if (!this.anchorId) {
      this.mode = 'free';
      return;
    }
    const anchor = this.anchorId;
    const target = bodyPositionTrue(anchor, simDays, this.tmpA);
    // manual flying while station-keeping edits the held offset, so the pilot
    // can close in by hand after the autopilot parks the ship
    this.rampSpeed(dt);
    const v = this.forward(this.tmpB).multiplyScalar(this.speedKms);
    const rcs = Math.max(1, Math.abs(this.cmdKms) * 0.3);
    if (this.input.strafeX !== 0) {
      v.addScaledVector(this.tmpC.copy(RIGHT).applyQuaternion(this.quat), this.input.strafeX * rcs);
    }
    if (this.input.strafeY !== 0) {
      v.addScaledVector(this.tmpC.copy(UP).applyQuaternion(this.quat), this.input.strafeY * rcs);
    }
    this.followOffset.addScaledVector(v, simDt * UNITS_PER_KM);
    const minD = minSafeDistance(anchor) * 1.02;
    if (this.followOffset.length() < minD) this.followOffset.setLength(minD);
    this.pos.copy(target).add(this.followOffset);
  }

  // ------------------------------------------------------------ proximity --

  private enforceProximity(simDays: number): void {
    this.warning = null;
    const near = nearestBodies(this.pos, simDays, 4);
    // In orbit the trajectory owns the hull's position, and stepOrbit already
    // holds it at the safe radius. Snapping this.pos here would desynchronise
    // the state vector from the rendered position, and cutting the throttle on
    // every low periapsis pass would take the controls away exactly when the
    // pilot is using them - so orbit keeps the warning and skips the grab.
    const advisoryOnly = this.mode === 'orbit';
    for (const n of near) {
      const limit = minSafeDistance(n.id);
      if (n.dist > limit * 4) continue;
      const sev = THREE.MathUtils.clamp(1 - (n.dist - limit) / (limit * 3), 0, 1);
      if (!this.warning || sev > this.warning.severity) {
        this.warning = { id: n.id, name: n.name, severity: sev };
      }
      if (!advisoryOnly && n.dist < limit) {
        // hard stop: slide the hull back out along the radial direction
        const body = bodyPositionTrue(n.id, simDays, this.tmpA);
        const out = this.tmpB.copy(this.pos).sub(body);
        if (out.lengthSq() < 1e-20) out.set(0, 0, 1);
        out.setLength(limit);
        this.pos.copy(body).add(out);
        if (this.mode === 'follow' && this.anchorId === n.id) this.followOffset.copy(out);
        if (this.mode === 'transit' || this.mode === 'flyby') this.abort('Proximity limit - autopilot held.');
        this.idle();
        this.event = `Proximity limit at ${n.name}. Hull held at a safe standoff.`;
      }
    }
  }

  // ----------------------------------------------------------------- head --

  private updateHead(dt: number, simDays: number): void {
    if (this.gazeLock && this.targetId) {
      const target = bodyPositionTrue(this.targetId, simDays, this.tmpA);
      const rel = this.tmpB.copy(target).sub(this.pos).applyQuaternion(this.tmpQ.copy(this.quat).invert());
      const yaw = Math.atan2(-rel.x, -rel.z);
      const pitch = Math.atan2(rel.y, Math.hypot(rel.x, rel.z));
      // yaw accumulates without limit now, so fold the tracked bearing onto
      // whichever turn the head is actually on - otherwise locking onto a body
      // astern unwinds every revolution the pilot has made
      const turns = Math.round((this.headYawTarget - yaw) / (Math.PI * 2));
      this.headYawTarget = yaw + turns * Math.PI * 2;
      this.headPitchTarget = THREE.MathUtils.clamp(pitch, -MAX_HEAD_PITCH_DOWN, MAX_HEAD_PITCH_UP);
      // Structural members are real, and a head locked hard over can end up
      // staring straight at an A-pillar. Whenever the pilot is not committed to
      // a trajectory, the attitude computer answers the way a crew would: it
      // swings the hull round until the target is back in the windscreen.
      // During a fly-by or an orbit it stays out of the way - watching the
      // target sweep across the side glass is the whole point of those.
      const loose = this.mode === 'free' || this.mode === 'follow';
      const off = Math.max(Math.abs(yaw), Math.abs(pitch));
      if (loose && off > WINDSCREEN_ARC) {
        // swing faster the further round the target is, so picking something
        // directly astern does not leave the pilot facing the rear bulkhead
        const rate = ATTITUDE_ASSIST_RATE * (1 + 2.6 * (off / Math.PI));
        this.slewTo(this.tmpC.copy(target).sub(this.pos), dt, rate);
      }
    }
    const k = 1 - Math.exp(-dt * 9);
    this.headYaw += (this.headYawTarget - this.headYaw) * k;
    this.headPitch += (this.headPitchTarget - this.headPitch) * k;
  }

  // ---------------------------------------------------------------- utils --

  private nameOf(id: string | null): string {
    if (!id) return 'the body';
    return catalogObject(id)?.name ?? id;
  }

  /** GM in km³/s², from catalog mass where known, else from size and density. */
  private gmOf(id: string): number {
    const def = catalogObject(id);
    const mass = def?.physical.massKg;
    if (mass) return G_KM * mass;
    // fall back to a 2.0 g/cm³ sphere - stated as an estimate in the HUD
    const rKm = bodyRadiusKm(id);
    const volumeKm3 = (4 / 3) * Math.PI * rKm ** 3;
    return G_KM * volumeKm3 * 2.0e12;
  }

  /** Name of the body the active flight mode is attached to. */
  get anchorName(): string | null {
    return this.anchorId ? this.nameOf(this.anchorId) : null;
  }

  /** Name of the body whose frame the hull is riding, if any. */
  get frameName(): string | null {
    return this.frameId && this.frameWeight > 0.25 ? this.nameOf(this.frameId) : null;
  }

  /** Everything the HUD needs about the current trajectory. */
  get orbitInfo(): OrbitTelemetry | null {
    if (this.mode !== 'orbit' || !this.orbit) return null;
    const p = this.orbit;
    const el = p.el;
    const bodyR = this.anchorId ? bodyRadiusKm(this.anchorId) : 0;
    return {
      bodyName: this.nameOf(this.anchorId),
      radiusKm: el.r,
      altitudeKm: el.r - bodyR,
      speedKms: el.speed,
      periodSec: el.period,
      eccentricity: el.e,
      inclinationDeg: THREE.MathUtils.radToDeg(el.inc),
      semiMajorKm: el.a,
      periapsisKm: el.rp,
      apoapsisKm: el.ra,
      periapsisAltKm: el.rp - bodyR,
      apoapsisAltKm: Number.isFinite(el.ra) ? el.ra - bodyR : Infinity,
      trueAnomalyDeg: THREE.MathUtils.radToDeg(el.nu),
      escaping: el.escaping,
      dvSpentKms: p.dvSpent,
      thrustMs2: this.thrustMs2,
      hold: this.hold,
      /** True when the predicted periapsis would hit the body. */
      impactPredicted: el.rp < p.safeRadiusKm && el.r > p.safeRadiusKm * 1.001,
    };
  }

  /** Body-centred state, for the trajectory preview. Returns null off-orbit. */
  get orbitState(): { r: THREE.Vector3; v: THREE.Vector3; mu: number; anchorId: string } | null {
    if (this.mode !== 'orbit' || !this.orbit || !this.anchorId) return null;
    return { r: this.orbit.r, v: this.orbit.v, mu: this.orbit.mu, anchorId: this.anchorId };
  }

  /** Apparent travel rate: physical velocity multiplied by time compression. */
  get apparentKmPerSec(): number {
    return this.speedKms * this.effectiveTimeScale;
  }

  /** Distance to the current target, in scene units (null when untargeted). */
  targetDistance(simDays: number): number | null {
    if (!this.targetId) return null;
    return this.pos.distanceTo(bodyPositionTrue(this.targetId, simDays, this.tmpA));
  }

  /** Height above the target's surface, in km (negative is impossible - the
   *  proximity limit stops the hull well before that). */
  targetAltitudeKm(simDays: number): number | null {
    if (!this.targetId) return null;
    const d = this.targetDistance(simDays);
    if (d === null) return null;
    return (d - bodyRadiusTrue(this.targetId)) * KM_PER_UNIT;
  }

  /** Angular diameter of the target as seen right now, in degrees. */
  targetAngularDeg(simDays: number): number | null {
    if (!this.targetId) return null;
    const d = this.targetDistance(simDays);
    if (d === null) return null;
    const r = bodyExtentTrue(this.targetId);
    if (d <= r) return 180;
    return 2 * Math.asin(Math.min(1, r / d)) * (180 / Math.PI);
  }

  /** Physical (uncompressed) seconds to reach the target at current velocity. */
  targetEtaSec(simDays: number): number | null {
    if (!this.targetId) return null;
    const d = this.targetDistance(simDays);
    if (d === null) return null;
    const standoff = arrivalDistance(this.targetId);
    const runKm = Math.max(0, d - standoff) * KM_PER_UNIT;
    return runKm / this.etaVelocityKms;
  }

  /** Velocity the transit-time estimate assumes: the commanded one, or a
   *  nominal cruise when the engine is idle so the readout still means
   *  something before you throttle up. */
  get etaVelocityKms(): number {
    return this.cmdKms > 0 ? this.cmdKms : THROTTLE_STEPS[DEFAULT_THROTTLE_INDEX];
  }

  /** Bearing to the target in the hull frame: yaw/pitch in degrees. */
  targetBearing(simDays: number, out: { yaw: number; pitch: number }): boolean {
    if (!this.targetId) return false;
    const target = bodyPositionTrue(this.targetId, simDays, this.tmpA);
    const rel = this.tmpB.copy(target).sub(this.pos).applyQuaternion(this.tmpQ.copy(this.quat).invert());
    if (rel.lengthSq() < 1e-20) return false;
    out.yaw = THREE.MathUtils.radToDeg(Math.atan2(-rel.x, -rel.z));
    out.pitch = THREE.MathUtils.radToDeg(Math.atan2(rel.y, Math.hypot(rel.x, rel.z)));
    return true;
  }

  /** Serialise just enough to restore the ship on re-entry. */
  snapshot(): {
    pos: [number, number, number];
    quat: [number, number, number, number];
    throttleIndex: number;
    timeIndex: number;
    targetId: string | null;
    distanceTravelledKm: number;
  } {
    return {
      pos: [this.pos.x, this.pos.y, this.pos.z],
      quat: [this.quat.x, this.quat.y, this.quat.z, this.quat.w],
      throttleIndex: this.throttleIndex,
      timeIndex: this.timeIndex,
      targetId: this.targetId,
      distanceTravelledKm: this.distanceTravelledKm,
    };
  }

  /** True when the ship has never been placed. */
  get unplaced(): boolean {
    return this.pos.lengthSq() === 0;
  }

  /** Distance travelled expressed in AU. */
  get distanceTravelledAU(): number {
    return (this.distanceTravelledKm / KM_PER_UNIT) / 100;
  }

  /** Radius of the currently targeted body in scene units (0 when none). */
  get targetRadius(): number {
    return this.targetId ? bodyRadiusTrue(this.targetId) : 0;
  }
}
