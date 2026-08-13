/**
 * Two-body orbital mechanics.
 *
 * Everything here works on a body-centred state vector - position in km,
 * velocity in km/s, gravitational parameter mu in km³/s² - and knows nothing
 * about the scene, the renderer or the ship. That keeps it testable and keeps
 * the precision where it belongs: a state vector around Jupiter is ~5×10⁵ km,
 * which float64 handles with room to spare, whereas the same orbit expressed in
 * scene units is ~3×10⁻¹ and loses digits for nothing.
 *
 * WHY ANALYTIC PROPAGATION RATHER THAN AN INTEGRATOR
 *
 * Spacecraft mode compresses time by up to a million to one. A single frame can
 * therefore advance the simulation by tens of thousands of seconds - more than
 * a full orbit in some cases. No numerical integrator survives that: RK4 or
 * Verlet at dt >> period is not inaccurate, it is meaningless. Universal-
 * variable Kepler propagation solves the two-body problem in closed form, so it
 * is exact for a coast at ANY step size, elliptic or hyperbolic, and it never
 * accumulates energy drift. The only thing that still needs limiting is the
 * thrust, which is handled by splitting the burn around the drift (see
 * `propagateWithThrust`).
 *
 * References: Bate, Mueller & White, "Fundamentals of Astrodynamics", ch. 4;
 * Vallado, "Fundamentals of Astrodynamics and Applications", algorithm 8.
 */
import * as THREE from 'three';

/** Ecliptic north in scene axes: the app's scene XZ plane is the ecliptic. */
export const REFERENCE_NORTH = new THREE.Vector3(0, 1, 0);

/** A body-centred state vector. Position km, velocity km/s. */
export interface StateVector {
  r: THREE.Vector3;
  v: THREE.Vector3;
}

export interface OrbitalElements {
  /** Semi-major axis, km. Negative for hyperbolic orbits. */
  a: number;
  /** Eccentricity. < 1 closed, >= 1 escaping. */
  e: number;
  /** Inclination to the reference plane (the ecliptic), radians. */
  inc: number;
  /** Right ascension of the ascending node, radians. */
  raan: number;
  /** Argument of periapsis, radians. */
  argp: number;
  /** True anomaly at the sampled instant, radians. */
  nu: number;
  /** Periapsis radius, km. */
  rp: number;
  /** Apoapsis radius, km. Infinite when e >= 1. */
  ra: number;
  /** Orbital period, seconds. Infinite when e >= 1. */
  period: number;
  /** Specific orbital energy, km²/s². Negative = bound. */
  energy: number;
  /** Specific angular momentum magnitude, km²/s. */
  h: number;
  /** Semi-latus rectum, km. */
  p: number;
  /** Current radius, km. */
  r: number;
  /** Current speed, km/s. */
  speed: number;
  /** True when the trajectory is unbound. */
  escaping: boolean;
  /** Bound, but only just - used to damp announcements around e = 1. */
  marginallyBound: boolean;
}

/**
 * Where the Stumpff closed forms give way to their series.
 *
 * The closed forms are 0/0 at z = 0 and start shedding significant digits well
 * before they get there: at |z| = 1e-2 the subtraction 1 - cos(√z) has already
 * lost four digits. The five-term series is accurate to ~1e-17 across this
 * window, so it is strictly better everywhere inside it.
 */
const SERIES_Z = 1e-2;

// --------------------------------------------------------------- Stumpff --

/**
 * Stumpff C(z). Series near zero because the closed forms are 0/0 there and
 * lose all their significant digits well before they reach it.
 */
export function stumpffC(z: number): number {
  if (z > SERIES_Z) {
    const s = Math.sqrt(z);
    return (1 - Math.cos(s)) / z;
  }
  if (z < -SERIES_Z) {
    const s = Math.sqrt(-z);
    return (Math.cosh(s) - 1) / -z;
  }
  const z2 = z * z;
  return 0.5 - z / 24 + z2 / 720 - (z2 * z) / 40320 + (z2 * z2) / 3628800;
}

/** Stumpff S(z), with the same near-zero series treatment. */
export function stumpffS(z: number): number {
  if (z > SERIES_Z) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -SERIES_Z) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  const z2 = z * z;
  return 1 / 6 - z / 120 + z2 / 5040 - (z2 * z) / 362880 + (z2 * z2) / 39916800;
}

// ------------------------------------------------------------ propagation --

const _r0 = new THREE.Vector3();
const _v0 = new THREE.Vector3();

/**
 * Advance a state vector by `dt` seconds under a point mass, in closed form.
 *
 * Writes into `out` and returns it. Safe for any dt, including negative, and
 * for elliptic, parabolic and hyperbolic trajectories alike.
 *
 * If the solve does not converge, or the result fails the Lagrange identity,
 * the ORIGINAL state is returned unchanged. That promise is load-bearing: a
 * diverged universal anomaly produces a finite, enormous, entirely wrong
 * position that no magnitude check would reject.
 */
export function propagate(
  r0: THREE.Vector3,
  v0: THREE.Vector3,
  mu: number,
  dt: number,
  out: StateVector,
): StateVector {
  _r0.copy(r0);
  _v0.copy(v0);
  const r0mag = _r0.length();

  if (!(r0mag > 0) || !(mu > 0) || !Number.isFinite(dt)) {
    out.r.copy(_r0);
    out.v.copy(_v0);
    return out;
  }
  if (dt === 0) {
    out.r.copy(_r0);
    out.v.copy(_v0);
    return out;
  }

  const sqrtMu = Math.sqrt(mu);
  const rdotv = _r0.dot(_v0);
  // alpha = 1/a. Positive is an ellipse, negative a hyperbola, zero a parabola.
  const alpha = 2 / r0mag - _v0.lengthSq() / mu;

  // ---- initial guess for the universal anomaly ----
  let chi: number;
  if (alpha > 1e-12) {
    // elliptic: chi ~ sqrt(mu)·dt·alpha, nudged off exact multiples of the
    // period where the derivative vanishes and Newton stalls
    chi = sqrtMu * dt * alpha;
    const period = (2 * Math.PI) / (sqrtMu * Math.pow(alpha, 1.5));
    if (Math.abs(dt) > period) chi *= 0.999;
  } else if (alpha < -1e-12) {
    // hyperbolic: the standard closed-form estimate
    const a = 1 / alpha;
    const sign = dt >= 0 ? 1 : -1;
    const num = -2 * mu * alpha * dt;
    const den = rdotv + sign * Math.sqrt(-mu * a) * (1 - r0mag * alpha);
    chi = sign * Math.sqrt(-a) * Math.log(Math.max(1e-300, num / den));
    if (!Number.isFinite(chi)) chi = sign * Math.sqrt(-a);
  } else {
    // near-parabolic: fall back on the elliptic estimate, which Newton then
    // corrects; the Stumpff series are well behaved through z = 0
    chi = (sqrtMu * dt) / r0mag;
  }

  // ---- Laguerre-Conway iteration on the universal Kepler equation ----
  //
  // Not plain Newton. Newton looks fine on gentle orbits and then diverges on
  // eccentric ones - at e = 0.99, one step short of periapsis, it walks off to a
  // radius of 9e25 km. The lethal part is that the result is FINITE, so an
  // isFinite guard waves it through and the ship's position becomes 6e19 scene
  // units. Laguerre-Conway's cube-root-like step is globally convergent for this
  // function: the same sweep that broke Newton converges in at most five
  // iterations for every eccentricity up to 0.9999.
  const LAGUERRE_N = 5;
  let z = 0;
  let C = 0;
  let S = 0;
  let converged = false;
  for (let i = 0; i < 64; i++) {
    z = alpha * chi * chi;
    C = stumpffC(z);
    S = stumpffS(z);
    const chi2 = chi * chi;
    const chi3 = chi2 * chi;
    const A = rdotv / sqrtMu;
    const B = 1 - alpha * r0mag;
    const F = A * chi2 * C + B * chi3 * S + r0mag * chi - sqrtMu * dt;
    const dF = A * chi * (1 - z * S) + B * chi2 * C + r0mag;
    const ddF = A * (1 - z * C) + B * chi * (1 - z * S);
    if (!Number.isFinite(F) || !Number.isFinite(dF)) break;
    const disc = Math.abs((LAGUERRE_N - 1) * (LAGUERRE_N - 1) * dF * dF -
      LAGUERRE_N * (LAGUERRE_N - 1) * F * ddF);
    const root = Math.sqrt(disc);
    // take whichever sign gives the larger denominator - that is the whole
    // trick, and what stops the step from exploding near a turning point
    const den = Math.abs(dF + root) >= Math.abs(dF - root) ? dF + root : dF - root;
    const step = den !== 0 ? (LAGUERRE_N * F) / den : dF !== 0 ? F / dF : 0;
    if (!Number.isFinite(step)) break;
    chi -= step;
    if (Math.abs(step) < 1e-10 * Math.max(1, Math.abs(chi))) {
      converged = true;
      break;
    }
  }
  if (!converged) {
    // Do NOT build a state from a diverged anomaly. Standing still for one step
    // is a rounding error; teleporting to 1e25 km is the end of the session.
    out.r.copy(_r0);
    out.v.copy(_v0);
    return out;
  }
  z = alpha * chi * chi;
  C = stumpffC(z);
  S = stumpffS(z);

  // ---- rebuild the state from the Lagrange coefficients ----
  const chi2 = chi * chi;
  const chi3 = chi2 * chi;
  const f = 1 - (chi2 / r0mag) * C;
  const g = dt - (chi3 / sqrtMu) * S;
  const rx = f * _r0.x + g * _v0.x;
  const ry = f * _r0.y + g * _v0.y;
  const rz = f * _r0.z + g * _v0.z;
  const rmag = Math.hypot(rx, ry, rz);
  if (!(rmag > 0) || !Number.isFinite(rmag)) {
    out.r.copy(_r0);
    out.v.copy(_v0);
    return out;
  }
  const fdot = (sqrtMu / (r0mag * rmag)) * (alpha * chi3 * S - chi);
  const gdot = 1 - (chi2 / rmag) * C;
  // The Lagrange coefficients satisfy f·ġ − ḟ·g = 1 identically. Checking it
  // costs four multiplies and catches a bad solve that every magnitude test
  // would pass, because a diverged solution is wrong but perfectly finite.
  if (Math.abs(f * gdot - fdot * g - 1) > 1e-9) {
    out.r.copy(_r0);
    out.v.copy(_v0);
    return out;
  }
  const vx = fdot * _r0.x + gdot * _v0.x;
  const vy = fdot * _r0.y + gdot * _v0.y;
  const vz = fdot * _r0.z + gdot * _v0.z;
  if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) {
    out.r.copy(_r0);
    out.v.copy(_v0);
    return out;
  }
  out.r.set(rx, ry, rz);
  out.v.set(vx, vy, vz);
  return out;
}

/**
 * Advance a state vector by `dt` under gravity plus a constant thrust
 * acceleration, using Strang splitting: half the burn, the exact coast, then
 * the other half. Second-order accurate, and unlike a plain "add the burn then
 * coast" it does not systematically bias the resulting orbit.
 *
 * The caller is responsible for keeping |accel·dt| small against the local
 * orbital speed - see MAX_BURN_FRACTION - because the drift is only exact for
 * an unpowered arc.
 */
export function propagateWithThrust(
  r0: THREE.Vector3,
  v0: THREE.Vector3,
  mu: number,
  dt: number,
  accel: THREE.Vector3,
  out: StateVector,
): StateVector {
  const half = dt * 0.5;
  _kickA.copy(v0).addScaledVector(accel, half);
  propagate(r0, _kickA, mu, dt, out);
  out.v.addScaledVector(accel, half);
  return out;
}

const _kickA = new THREE.Vector3();

/**
 * Largest fraction of the local orbital speed a single frame's burn may add
 * before the split-step scheme visibly degrades. Used to cap time compression
 * while the engine is lit.
 */
export const MAX_BURN_FRACTION = 0.02;

// -------------------------------------------------------------- elements --

const _h = new THREE.Vector3();
const _e = new THREE.Vector3();
const _n = new THREE.Vector3();
/** Reference directions in the ecliptic plane, hoisted out of the hot path. */
const REF_PLUS_X = new THREE.Vector3(1, 0, 0);
const REF_MINUS_Z = new THREE.Vector3(0, 0, -1);

/** Classical elements from a body-centred state vector. */
export function elementsFrom(r: THREE.Vector3, v: THREE.Vector3, mu: number): OrbitalElements {
  const rmag = r.length();
  const speed = v.length();
  _h.crossVectors(r, v);
  const hmag = _h.length();
  const energy = (speed * speed) / 2 - mu / Math.max(rmag, 1e-9);

  // eccentricity vector: ((v² - mu/r)·r - (r·v)·v) / mu
  const rdotv = r.dot(v);
  _e.copy(r)
    .multiplyScalar(speed * speed - mu / Math.max(rmag, 1e-9))
    .addScaledVector(v, -rdotv)
    .divideScalar(mu);
  const ecc = _e.length();

  // a from energy; parabolic (energy ~ 0) is reported as infinite rather than
  // as a division blow-up
  const a = Math.abs(energy) < 1e-14 ? Infinity : -mu / (2 * energy);
  const p = (hmag * hmag) / mu;
  const rp = p / (1 + ecc);
  const ra = ecc < 1 && Number.isFinite(a) ? p / (1 - ecc) : Infinity;
  const period =
    ecc < 1 && Number.isFinite(a) && a > 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity;

  // inclination against the reference plane
  const inc = hmag > 0 ? Math.acos(THREE.MathUtils.clamp(_h.dot(REFERENCE_NORTH) / hmag, -1, 1)) : 0;

  // node vector = north × h. Degenerate for an equatorial orbit, where RAAN is
  // undefined by convention and reported as zero.
  _n.crossVectors(REFERENCE_NORTH, _h);
  const nmag = _n.length();
  let raan = 0;
  if (nmag > 1e-9) {
    // measured in the reference plane; scene +X is the reference direction
    raan = Math.atan2(_n.dot(REF_MINUS_Z), _n.dot(REF_PLUS_X));
    if (raan < 0) raan += Math.PI * 2;
  }

  let argp = 0;
  if (nmag > 1e-9 && ecc > 1e-8) {
    argp = Math.acos(THREE.MathUtils.clamp(_n.dot(_e) / (nmag * ecc), -1, 1));
    if (_e.dot(REFERENCE_NORTH) < 0) argp = Math.PI * 2 - argp;
  }

  let nu = 0;
  if (ecc > 1e-8) {
    nu = Math.acos(THREE.MathUtils.clamp(_e.dot(r) / (ecc * Math.max(rmag, 1e-9)), -1, 1));
    if (rdotv < 0) nu = Math.PI * 2 - nu;
  } else if (nmag > 1e-9) {
    // circular: measure from the ascending node instead
    nu = Math.acos(THREE.MathUtils.clamp(_n.dot(r) / (nmag * Math.max(rmag, 1e-9)), -1, 1));
    if (r.dot(REFERENCE_NORTH) < 0) nu = Math.PI * 2 - nu;
  }

  return {
    a,
    e: ecc,
    inc,
    raan,
    argp,
    nu,
    rp,
    ra,
    period,
    energy,
    h: hmag,
    p,
    r: rmag,
    speed,
    escaping: energy >= 0 || ecc >= 1,
    /** Just inside the boundary, so a state hovering at e ~ 1 does not flap. */
    marginallyBound: energy < 0 && ecc > 0.999,
  };
}

// ------------------------------------------------------------ directions --

/** The six manoeuvre directions, as unit vectors in the body-centred frame. */
export type BurnAxis =
  | 'prograde'
  | 'retrograde'
  | 'radial-out'
  | 'radial-in'
  | 'normal'
  | 'anti-normal';

export const BURN_AXES: BurnAxis[] = [
  'prograde',
  'retrograde',
  'radial-out',
  'radial-in',
  'normal',
  'anti-normal',
];

export const BURN_LABEL: Record<BurnAxis, string> = {
  prograde: 'Prograde',
  retrograde: 'Retrograde',
  'radial-out': 'Radial out',
  'radial-in': 'Radial in',
  normal: 'Normal',
  'anti-normal': 'Anti-normal',
};

export const BURN_EFFECT: Record<BurnAxis, string> = {
  prograde: 'Adds orbital energy - raises the opposite side of the orbit',
  retrograde: 'Removes orbital energy - lowers the opposite side of the orbit',
  'radial-out': 'Rotates the orbit and changes its eccentricity',
  'radial-in': 'Rotates the orbit the other way',
  normal: 'Tilts the orbital plane one way - changes inclination',
  'anti-normal': 'Tilts the orbital plane the other way',
};

const _dirH = new THREE.Vector3();

/**
 * Unit vector for a manoeuvre axis at the given state. Falls back sanely when
 * the state is degenerate (zero velocity, radial trajectory) so an attitude
 * hold can never produce a NaN heading.
 */
export function burnDirection(
  axis: BurnAxis,
  r: THREE.Vector3,
  v: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  switch (axis) {
    case 'prograde':
    case 'retrograde': {
      out.copy(v);
      if (out.lengthSq() < 1e-18) out.copy(r).cross(REFERENCE_NORTH);
      if (out.lengthSq() < 1e-18) out.set(1, 0, 0);
      out.normalize();
      return axis === 'retrograde' ? out.negate() : out;
    }
    case 'radial-out':
    case 'radial-in': {
      out.copy(r);
      if (out.lengthSq() < 1e-18) out.set(1, 0, 0);
      out.normalize();
      return axis === 'radial-in' ? out.negate() : out;
    }
    default: {
      _dirH.crossVectors(r, v);
      if (_dirH.lengthSq() < 1e-18) _dirH.copy(REFERENCE_NORTH);
      out.copy(_dirH).normalize();
      return axis === 'anti-normal' ? out.negate() : out;
    }
  }
}

// -------------------------------------------------------- conic sampling --

const _pHat = new THREE.Vector3();
const _qHat = new THREE.Vector3();
const _wHat = new THREE.Vector3();
/** Reused sample vectors; sampleConic runs every frame during a burn. */
const pool: THREE.Vector3[] = [];

/**
 * Points along the trajectory, in the body-centred frame, for drawing a
 * prediction.
 *
 * The perifocal basis is built straight from the state vector rather than from
 * the angular elements, which sidesteps every quadrant and degeneracy problem:
 * P̂ points at periapsis, Ŵ along the angular momentum, Q̂ completes the set.
 * A circular orbit has no periapsis, so P̂ is taken from the current radius -
 * the drawn circle is identical either way.
 *
 * Ellipses are sampled over a full revolution. Hyperbolas are sampled over the
 * true-anomaly range that stays inside `maxRadiusKm`, so the drawn arc covers
 * the part of the escape the pilot can actually see rather than running off to
 * infinity.
 */
export function sampleConic(
  r: THREE.Vector3,
  v: THREE.Vector3,
  mu: number,
  segments: number,
  maxRadiusKm: number,
  out: THREE.Vector3[] = [],
): THREE.Vector3[] {
  out.length = 0;
  const el = elementsFrom(r, v, mu);
  if (!(el.h > 0) || !Number.isFinite(el.p)) return out;

  _wHat.crossVectors(r, v).normalize();
  _e.copy(r)
    .multiplyScalar(v.lengthSq() - mu / Math.max(r.length(), 1e-9))
    .addScaledVector(v, -r.dot(v))
    .divideScalar(mu);
  if (_e.lengthSq() > 1e-16) _pHat.copy(_e).normalize();
  else _pHat.copy(r).normalize();
  _qHat.crossVectors(_wHat, _pHat).normalize();

  let nuMin = -Math.PI;
  let nuMax = Math.PI;
  if (el.e >= 1) {
    // asymptote: cos(nu) -> -1/e. Stop short of it, and short of maxRadius.
    const nuInf = Math.acos(THREE.MathUtils.clamp(-1 / el.e, -1, 1));
    let limit = nuInf * 0.995;
    // the true anomaly at which the radius reaches maxRadiusKm, if it does
    const cosAtMax = (el.p / maxRadiusKm - 1) / el.e;
    if (cosAtMax >= -1 && cosAtMax <= 1) limit = Math.min(limit, Math.acos(cosAtMax));
    nuMin = -limit;
    nuMax = limit;
  }

  // The caller hands the same array back every frame and this runs at frame
  // rate, so vectors are reused in place rather than reallocated - 220 fresh
  // Vector3 per frame is a garbage collector pause waiting to happen.
  const n = Math.max(8, segments);
  let w = 0;
  for (let i = 0; i <= n; i++) {
    const nu = nuMin + ((nuMax - nuMin) * i) / n;
    const denom = 1 + el.e * Math.cos(nu);
    if (Math.abs(denom) < 1e-9) continue;
    const rad = el.p / denom;
    if (!(rad > 0) || rad > maxRadiusKm * 1.02) continue;
    const c = Math.cos(nu) * rad;
    const sn = Math.sin(nu) * rad;
    if (!pool[w]) pool[w] = new THREE.Vector3();
    pool[w].set(
      _pHat.x * c + _qHat.x * sn,
      _pHat.y * c + _qHat.y * sn,
      _pHat.z * c + _qHat.z * sn,
    );
    out.push(pool[w]);
    w++;
  }
  return out;
}

/** Position of periapsis (and apoapsis, when the orbit is closed), km. */
const _apoOut = new THREE.Vector3();
const _periOut = new THREE.Vector3();

/** Periapsis and apoapsis positions, km. Vectors are reused between calls. */
export function apsides(
  r: THREE.Vector3,
  v: THREE.Vector3,
  mu: number,
): { periapsis: THREE.Vector3; apoapsis: THREE.Vector3 | null } {
  const el = elementsFrom(r, v, mu);
  _wHat.crossVectors(r, v).normalize();
  _e.copy(r)
    .multiplyScalar(v.lengthSq() - mu / Math.max(r.length(), 1e-9))
    .addScaledVector(v, -r.dot(v))
    .divideScalar(mu);
  if (_e.lengthSq() > 1e-16) _pHat.copy(_e).normalize();
  else _pHat.copy(r).normalize();
  return {
    periapsis: _periOut.copy(_pHat).multiplyScalar(el.rp),
    apoapsis: Number.isFinite(el.ra) ? _apoOut.copy(_pHat).multiplyScalar(-el.ra) : null,
  };
}

/** Circular orbital speed at radius r, km/s. */
export function circularSpeed(mu: number, rKm: number): number {
  return Math.sqrt(mu / Math.max(rKm, 1e-9));
}

/** Escape speed at radius r, km/s. */
export function escapeSpeed(mu: number, rKm: number): number {
  return Math.SQRT2 * circularSpeed(mu, rKm);
}
