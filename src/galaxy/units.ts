/**
 * Galactic-scale units and the double-precision arithmetic they require.
 *
 * The solar-system half of the app lives happily in float32 scene units
 * because nothing there is more than a few thousand AU from the origin. The
 * galaxy is 6×10⁹ AU across; a float32 galactocentric position is wrong by
 * hundreds of AU before you leave the Local Spur. So galactic positions are
 * kept in double precision (Vec3d below) and only ever reach the GPU as
 * *camera-relative* offsets, which are small enough for float32 again. That
 * is the entire floating-origin strategy: the camera never moves in the
 * render scene - the galaxy is re-expressed around it each frame.
 *
 * One galaxy-scene unit = one light-year, everywhere in src/galaxy.
 *
 * Reference values (recorded in SOURCES.md):
 *  - Sun-to-centre distance R0 = 8.277 kpc = 26,996 ly
 *    (GRAVITY Collaboration 2022, A&A; ±0.4%)
 *  - Sun's height above the midplane: +68 ly (20.8 pc, Bennett & Bovy 2019)
 *  - Sgr A* mass 4.297×10⁶ M☉ (GRAVITY 2022/2023; Keck's independent value
 *    is 3.984×10⁶ - the spread is systematics, and the app quotes GRAVITY)
 *  - Schwarzschild radius 2GM/c² = 1.27×10⁷ km = 0.085 AU = 1.342×10⁻⁶ ly
 */

// ---------------------------------------------------------------- constants

export const LY_KM = 9.4607e12;
export const PC_LY = 3.26156;
export const KPC_LY = 3261.56;
export const AU_PER_LY = 63_241.077;
export const C_LY_PER_S = 1 / (365.25 * 86_400); // light-years per second

/** Sun's galactocentric distance, light-years (GRAVITY 2022: 8.277 kpc). */
export const R0_LY = 26_996;
/** Sun's height above the galactic midplane, ly (Bennett & Bovy 2019). */
export const SUN_Z_LY = 68;

/** Sgr A* mass in solar masses (GRAVITY Collaboration 2022/2023). */
export const SGRA_MASS_MSUN = 4.297e6;
/** Schwarzschild radius of Sgr A*, in km and in light-years. */
export const SGRA_RS_KM = 1.27e7;
export const SGRA_RS_LY = SGRA_RS_KM / LY_KM; // ≈ 1.342e-6 ly
export const SGRA_RS_AU = 0.085;
/** Photon-capture (shadow) radius: √27/2 · Rs ≈ 2.598 Rs. */
export const SGRA_CAPTURE_RS = Math.sqrt(27) / 2;
/** Innermost stable circular orbit for a non-spinning hole: 3 Rs. */
export const SGRA_ISCO_RS = 3;

/** Stellar disk: NASA's canonical ~100,000 ly diameter. */
export const DISK_RADIUS_LY = 52_000;
/** Thin-disk scale height ≈ 300 pc (Bland-Hawthorn & Gerhard 2016). */
export const DISK_SCALE_HEIGHT_LY = 980;
/** Radial scale length of the exponential disk ≈ 2.6 kpc. */
export const DISK_SCALE_LENGTH_LY = 8_500;
/** Long-bar half length ≈ 5 kpc (Wegg et al. 2015). */
export const BAR_HALF_LY = 16_000;
/** Bar angle to the Sun-centre line ≈ 28° (25-33° in the literature). */
export const BAR_ANGLE_DEG = 28;
/** Nuclear star cluster half-light radius 4.2 pc (Schödel et al. 2014). */
export const NSC_RADIUS_LY = 13.7;

// ------------------------------------------------------- double precision --

/** Minimal double-precision 3-vector for galactocentric positions (ly). */
export class Vec3d {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v: Vec3d): this {
    return this.set(v.x, v.y, v.z);
  }

  clone(): Vec3d {
    return new Vec3d(this.x, this.y, this.z);
  }

  add(v: Vec3d): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v: Vec3d): this {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  addScaled(v: Vec3d, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  distanceTo(v: Vec3d): number {
    return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  normalize(): this {
    const l = this.length();
    return l > 0 ? this.scale(1 / l) : this;
  }

  lerp(v: Vec3d, t: number): this {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }

  dot(v: Vec3d): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  /** Rotate by a quaternion (components may come from three.js). */
  applyQuat(q: { x: number; y: number; z: number; w: number }): this {
    const { x, y, z } = this;
    const { x: qx, y: qy, z: qz, w: qw } = q;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  }
}

/**
 * The Sun's galactocentric position. Frame: right-handed, origin at Sgr A*,
 * +x from the centre *away* through the Sun's meridian (so the Sun sits on
 * -x and "toward the centre" from the Sun is +x, matching heliocentric
 * galactic longitude l = 0), +z toward the north galactic pole, +y toward
 * l = 90° (roughly Cygnus, the direction of galactic rotation at the Sun).
 */
export const SUN_POS = new Vec3d(-R0_LY, 0, SUN_Z_LY);

/**
 * Galactocentric (gx, gy, gz) → galaxy-scene three.js axes.
 * Scene y is up (north galactic pole); the map from a right-handed galactic
 * frame is (gx, gz, -gy), the same swap the solar-system scene applies to
 * ecliptic coordinates - one convention, two frames.
 */
export function galToScene(
  gx: number,
  gy: number,
  gz: number,
  out: { x: number; y: number; z: number },
): void {
  out.x = gx;
  out.y = gz;
  out.z = -gy;
}

/** Inverse of galToScene. */
export function sceneToGal(
  sx: number,
  sy: number,
  sz: number,
  out: { x: number; y: number; z: number },
): void {
  out.x = sx;
  out.y = -sz;
  out.z = sy;
}

/** Heliocentric galactic (l, b) in degrees + distance → galactocentric ly. */
export function fromGalacticLBD(lDeg: number, bDeg: number, distLy: number): Vec3d {
  const l = (lDeg * Math.PI) / 180;
  const b = (bDeg * Math.PI) / 180;
  const cb = Math.cos(b);
  return new Vec3d(
    SUN_POS.x + distLy * cb * Math.cos(l),
    SUN_POS.y + distLy * cb * Math.sin(l),
    SUN_POS.z + distLy * Math.sin(b),
  );
}

// ------------------------------------------------------------- formatting --

/** Distance in light-years → readable string with unit escalation. */
export function fmtLy(ly: number): string {
  const abs = Math.abs(ly);
  if (abs < 1 / AU_PER_LY / 100) {
    return `${Math.round(ly * LY_KM).toLocaleString('en-US')} km`;
  }
  if (abs < 0.1) {
    const au = ly * AU_PER_LY;
    return `${au.toFixed(au < 10 ? 2 : 0)} AU`;
  }
  if (abs < 1000) return `${ly.toFixed(abs < 10 ? 2 : 1)} ly`;
  if (abs < 100_000) {
    return `${Math.round(ly).toLocaleString('en-US')} ly`;
  }
  return `${(ly / 1000).toFixed(0)} kly`;
}

/** Distance in ly formatted as parsecs, for the coordinate readouts. */
export function fmtPc(ly: number): string {
  const pc = ly / PC_LY;
  if (Math.abs(pc) < 1000) return `${pc.toFixed(pc < 10 ? 2 : 1)} pc`;
  return `${(pc / 1000).toFixed(2)} kpc`;
}

/** Speed in ly/s → readable string, always with the light-speed multiple. */
export function fmtWarp(lyPerSec: number): string {
  const c = lyPerSec / C_LY_PER_S;
  if (c < 0.001) return `${Math.round(lyPerSec * LY_KM).toLocaleString('en-US')} km/s`;
  if (c < 10_000) return `${c.toFixed(c < 10 ? 2 : 0)} c`;
  const exp = Math.floor(Math.log10(c));
  return `${(c / 10 ** exp).toFixed(1)}×10^${exp} c`;
}

/** Seconds → short duration. */
export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  if (sec < 90) return `${Math.max(1, Math.round(sec))} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  if (sec < 172_800) return `${(sec / 3600).toFixed(1)} h`;
  return `${(sec / 86_400).toFixed(1)} d`;
}

/**
 * Static-observer gravitational time dilation √(1 − Rs/r).
 * Returns dτ/dt: proper seconds per far-away coordinate second (≤ 1).
 * Clamped just above the horizon so the HUD shows a large finite ratio
 * rather than the (real) divergence to zero.
 */
export function gravitationalDilation(rLy: number): number {
  const x = SGRA_RS_LY / Math.max(rLy, SGRA_RS_LY * 1.0001);
  return Math.sqrt(Math.max(1e-8, 1 - x));
}
