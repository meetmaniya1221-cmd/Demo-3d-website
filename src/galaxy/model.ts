/**
 * The procedural Milky Way: one deterministic model that everything else
 * samples, so the far view, the in-disk star fields, the HUD's "local star
 * density" readout and the galaxy map are all the same galaxy rather than
 * four artworks that happen to share a name.
 *
 * Structure, scientifically inspired (values and sources in SOURCES.md):
 *  - exponential thin disk, scale length 2.6 kpc, scale height 300 pc,
 *    flaring outward; a thicker, warmer old-disk component under it
 *  - boxy bulge + long bar, half-length ~5 kpc, 28° to the Sun-centre line
 *    (Wegg et al. 2015 long bar; the angle is genuinely uncertain, 25-33°)
 *  - two MAJOR stellar arms (Scutum-Centaurus, Perseus) rooted at the bar
 *    ends and two MINOR, gas-rich arms (Sagittarius-Carina, Norma/Outer),
 *    the Spitzer/GLIMPSE picture; plus the Local (Orion) Spur that actually
 *    contains the Sun - ~20,000 ly long, ~3,500 ly wide
 *  - logarithmic spirals with ~12.5° pitch; the galaxy rotates CLOCKWISE
 *    seen from the north galactic pole, and the arms trail that rotation
 *  - nuclear star cluster: half-light radius 4.2 pc, the densest stellar
 *    environment in the galaxy (10⁵-10⁶ stars/pc³ vs 0.1 near the Sun)
 *  - stellar halo + ~150 globular clusters; LMC/SMC/Sagittarius dwarf
 *
 * Everything is seeded: the same seed regenerates the same galaxy, star for
 * star, which the chunk streamer and the discovery database both rely on.
 */
import { mulberry32 } from '../scene/noise';
import {
  BAR_ANGLE_DEG,
  BAR_HALF_LY,
  DISK_RADIUS_LY,
  DISK_SCALE_HEIGHT_LY,
  DISK_SCALE_LENGTH_LY,
  NSC_RADIUS_LY,
  SUN_POS,
  Vec3d,
  fromGalacticLBD,
} from './units';

export interface GalaxyParams {
  seed: number;
  /** Star-count multipliers for the visual clouds (1 = default). */
  density: number;
  armWidthLy: number;
  bulgeScale: number;
  dustDensity: number;
  nebulaDensity: number;
}

export const DEFAULT_PARAMS: GalaxyParams = {
  seed: 20260815,
  density: 1,
  armWidthLy: 2600,
  bulgeScale: 1,
  dustDensity: 1,
  nebulaDensity: 1,
};

// -------------------------------------------------------------- spiral arms

export interface ArmDef {
  name: string;
  /** Azimuth (rad) where the arm leaves its root radius. */
  phase: number;
  rootLy: number;
  endLy: number;
  /** Relative stellar strength: major arms 1, minor gas arms less. */
  strength: number;
  /** Fraction of the young (O/B, blue) population this arm carries. */
  youth: number;
  pitchDeg: number;
}

/** Bar azimuth in the galactocentric frame: the NEAR end of the bar points
 *  into the first galactic quadrant (l ≈ +27° from the Sun), which with the
 *  Sun on −x puts the bar's major axis at −28° from +x. */
const BAR_ANGLE = (-BAR_ANGLE_DEG * Math.PI) / 180;

/**
 * Four arms + the Local Spur, as trailing logarithmic spirals. Phases are
 * anchored to published geometry: the two major stellar arms spring from
 * the two ends of the bar (Perseus then crosses the Sun's azimuth ~6,600 ly
 * beyond the Sun, matching maser parallaxes), the Sagittarius–Carina arm is
 * fitted through the Lagoon/Eagle/Carina star-forming regions, and the Sun
 * sits inside the Local Spur - matching the annotated Spitzer/GLIMPSE map.
 */
export const ARMS: ArmDef[] = [
  { name: 'Scutum–Centaurus Arm', phase: Math.PI + BAR_ANGLE, rootLy: BAR_HALF_LY * 0.92, endLy: 50_000, strength: 1.0, youth: 0.5, pitchDeg: 12.8 },
  { name: 'Perseus Arm', phase: BAR_ANGLE, rootLy: BAR_HALF_LY * 0.92, endLy: 52_000, strength: 1.0, youth: 0.5, pitchDeg: 12.8 },
  { name: 'Sagittarius–Carina Arm', phase: 0.502, rootLy: 11_000, endLy: 46_000, strength: 0.55, youth: 0.75, pitchDeg: 15.5 },
  { name: 'Norma–Outer Arm', phase: 0.502 + Math.PI, rootLy: 11_000, endLy: 55_000, strength: 0.5, youth: 0.7, pitchDeg: 15.5 },
];

/** The Local (Orion) Spur: a short arm segment, not a full spiral. The
 *  phase puts its centre-line exactly through the Sun's position. */
export const SPUR = {
  name: 'Orion–Local Spur',
  phase: 2.475,
  rootLy: 24_000,
  endLy: 30_000,
  strength: 0.42,
  youth: 0.7,
  pitchDeg: 10.0,
};

/**
 * Azimuth of an arm's centre-line at radius r. The galaxy rotates clockwise
 * seen from the north galactic pole, so trailing arms have their azimuth
 * INCREASE with radius in our counterclockwise-positive frame.
 */
export function armTheta(arm: { phase: number; rootLy: number; pitchDeg: number }, rLy: number): number {
  const tanp = Math.tan((arm.pitchDeg * Math.PI) / 180);
  return arm.phase + Math.log(Math.max(rLy, 500) / arm.rootLy) / tanp;
}

interface ArmSample {
  boost: number;
  youth: number;
  nearest: string | null;
}

/**
 * Arm density boost at (r, θ).
 *
 * Distance to a low-pitch spiral is measured RADIALLY: for each winding the
 * arm crosses the point's azimuth at r_k = root·e^((θ−φ+2πk)·tan p), and
 * the perpendicular offset is |r − r_k|·cos p. (The naive r·Δθ metric
 * overestimates by ~1/sin p and starves the arms to threads - measured the
 * hard way.)
 */
export function armBoostAt(rLy: number, theta: number, params: GalaxyParams, out?: ArmSample): number {
  let boost = 0;
  let youth = 0;
  let nearest: string | null = null;
  let best = Infinity;
  const all = [...ARMS, SPUR];
  for (const arm of all) {
    const p = (arm.pitchDeg * Math.PI) / 180;
    const tanp = Math.tan(p);
    const cosp = Math.cos(p);
    const width = params.armWidthLy * (arm === SPUR ? 0.55 : 1);
    for (let k = -1; k <= 2; k++) {
      const rk = arm.rootLy * Math.exp((theta - arm.phase + 2 * Math.PI * k) * tanp);
      if (rk < arm.rootLy * 0.8 || rk > arm.endLy) continue;
      const d = Math.abs(rLy - rk) * cosp;
      if (d > width * 4) continue;
      const g = Math.exp(-(d * d) / (2 * width * width));
      // arms fade in from their root and out toward their end
      const taper =
        Math.min(1, (rk - arm.rootLy * 0.8) / (arm.rootLy * 0.35) + 0.15) *
        Math.min(1, (arm.endLy - rk) / 6000 + 0.2);
      const contribution = arm.strength * g * Math.max(0, taper);
      boost += contribution;
      youth += contribution * arm.youth;
      if (d < best) {
        best = d;
        if (g > 0.25) nearest = arm.name;
      }
    }
  }
  if (out) {
    out.boost = boost;
    out.youth = boost > 1e-6 ? youth / boost : 0;
    out.nearest = nearest;
  }
  return boost;
}

// ---------------------------------------------------------------- density --

const BAR_COS = Math.cos(BAR_ANGLE);
const BAR_SIN = Math.sin(BAR_ANGLE);

/**
 * Relative stellar volume density at a galactocentric point (ly).
 * Calibrated so ρ = 1 at the Sun ≈ 0.1 stars/pc³ (Mamajek census);
 * the central parsec then lands around the observed 10⁵-10⁶ stars/pc³.
 */
export function densityAt(gx: number, gy: number, gz: number, params: GalaxyParams = DEFAULT_PARAMS): number {
  const r = Math.hypot(gx, gy);
  const theta = Math.atan2(gy, gx);

  // thin disk with a flare: scale height grows past the solar circle
  const hz = DISK_SCALE_HEIGHT_LY * (1 + Math.max(0, (r - 30_000) / 22_000) * 1.4);
  const thin = Math.exp(-r / DISK_SCALE_LENGTH_LY) * Math.exp(-Math.abs(gz) / hz);
  const thick = 0.09 * Math.exp(-r / (DISK_SCALE_LENGTH_LY * 1.25)) * Math.exp(-Math.abs(gz) / (hz * 3));
  const edge = r > DISK_RADIUS_LY ? Math.exp(-(r - DISK_RADIUS_LY) / 4000) : 1;

  // arms modulate the disk (density-wave crowding, roughly a 1+2·boost contrast)
  const arms = 1 + 2.0 * armBoostAt(r, theta, params);

  // bar: coordinates along/across the major axis, boxy exponential
  const bx = gx * BAR_COS + gy * BAR_SIN;
  const by = -gx * BAR_SIN + gy * BAR_COS;
  const barS =
    Math.pow(Math.abs(bx) / BAR_HALF_LY, 2.2) +
    Math.pow(Math.abs(by) / (BAR_HALF_LY * 0.36), 2.2) +
    Math.pow(Math.abs(gz) / (BAR_HALF_LY * 0.26), 2.2);
  const bar = 34 * params.bulgeScale * Math.exp(-Math.pow(barS, 1 / 2.2) * 2.4);

  // inner spheroidal bulge on top of the bar
  const s3 = Math.hypot(gx, gy, gz * 1.9);
  const bulge = 90 * params.bulgeScale * Math.exp(-Math.pow(s3 / 2600, 1.35));

  // nuclear star cluster: a steep cusp calibrated so the central parsec
  // reads a few ×10⁵-10⁶ stars/pc³ (Schödel et al.), softened inside the
  // S-star zone where a smooth density stops being meaningful anyway
  const rc = Math.hypot(gx, gy, gz);
  const nsc = rc < 500 ? 1.5e4 * Math.pow(Math.max(rc, 0.65) / NSC_RADIUS_LY, -1.9) : 0;

  // faint stellar halo
  const halo = 0.012 * Math.pow(Math.max(rc, 3000) / 26_000, -3.0);

  const sunRef = Math.exp(-26_996 / DISK_SCALE_LENGTH_LY); // thin-disk value at the Sun
  return ((thin * arms + thick) * edge + bar + bulge + nsc + halo) / (sunRef * 1.45);
}

/** Approximate stars per cubic parsec at a point (0.1 near the Sun). */
export function starsPerPc3(pos: Vec3d, params: GalaxyParams = DEFAULT_PARAMS): number {
  return 0.1 * densityAt(pos.x, pos.y, pos.z, params);
}

/** Human region label for the HUD, coarsest first. */
export function regionAt(pos: Vec3d, params: GalaxyParams = DEFAULT_PARAMS): string {
  const rc = pos.length();
  const r = Math.hypot(pos.x, pos.y);
  if (rc < 0.05) return 'Sagittarius A* — event-horizon region';
  if (rc < NSC_RADIUS_LY * 2.5) return 'Nuclear star cluster';
  if (rc < 2600) return 'Galactic bulge';
  const bx = pos.x * BAR_COS + pos.y * BAR_SIN;
  const by = -pos.x * BAR_SIN + pos.y * BAR_COS;
  if (Math.abs(bx) < BAR_HALF_LY && Math.abs(by) < BAR_HALF_LY * 0.4 && Math.abs(pos.z) < 4200) {
    return 'Galactic bar';
  }
  if (r > DISK_RADIUS_LY * 1.25 || Math.abs(pos.z) > 9000) {
    return rc > 90_000 ? 'Intergalactic space' : 'Galactic halo';
  }
  const sample: ArmSample = { boost: 0, youth: 0, nearest: null };
  armBoostAt(r, Math.atan2(pos.y, pos.x), params, sample);
  if (sample.nearest) return sample.nearest;
  if (Math.abs(pos.z) > 3200) return 'Thick disk';
  return 'Interarm disk';
}

// ------------------------------------------------------------ populations --

export interface StarClassDef {
  cls: string;
  /** Number fraction in the present-day field population (Mamajek census). */
  frac: number;
  color: [number, number, number];
  /** Relative visual luminosity used for point size/brightness. */
  lum: number;
}

/**
 * Present-day field mix. O stars are so rare (~1 in 3 million) that a fair
 * draw would show none; they appear via the separate young population that
 * lives only in arms and star-forming regions - which is also where they
 * live in the real galaxy.
 */
export const STAR_CLASSES: StarClassDef[] = [
  { cls: 'M', frac: 0.755, color: [1.0, 0.72, 0.52], lum: 0.05 },
  { cls: 'K', frac: 0.125, color: [1.0, 0.83, 0.63], lum: 0.35 },
  { cls: 'G', frac: 0.072, color: [1.0, 0.96, 0.88], lum: 1.0 },
  { cls: 'F', frac: 0.03, color: [0.98, 0.98, 1.0], lum: 2.8 },
  { cls: 'A', frac: 0.012, color: [0.85, 0.90, 1.0], lum: 14 },
  { cls: 'B', frac: 0.005, color: [0.72, 0.80, 1.0], lum: 120 },
  { cls: 'WD', frac: 0.001, color: [0.88, 0.92, 1.0], lum: 0.01 },
];

/** Young population used inside arms/star-forming knots only. */
export const YOUNG_CLASSES: StarClassDef[] = [
  { cls: 'O', frac: 0.04, color: [0.64, 0.74, 1.0], lum: 4000 },
  { cls: 'B', frac: 0.5, color: [0.70, 0.79, 1.0], lum: 300 },
  { cls: 'A', frac: 0.3, color: [0.82, 0.88, 1.0], lum: 30 },
  { cls: 'F', frac: 0.16, color: [0.95, 0.97, 1.0], lum: 4 },
];

export function drawClass(rnd: () => number, table: StarClassDef[]): StarClassDef {
  const t = rnd();
  let acc = 0;
  for (const c of table) {
    acc += c.frac;
    if (t < acc) return c;
  }
  return table[0];
}

// -------------------------------------------------------------- landmarks --

export type LandmarkKind =
  | 'black-hole'
  | 'star'
  | 'nebula'
  | 'cluster'
  | 'galaxy'
  | 'region';

export interface Landmark {
  id: string;
  name: string;
  kind: LandmarkKind;
  pos: Vec3d;
  /** Radius used for map dots and arrival standoff, ly. */
  radiusLy: number;
  note: string;
  /** True where the position is a published measurement, not procedural. */
  real: boolean;
}

/** Star-forming regions / nebulae with published (l, b, d) positions. */
const NEBULAE: Array<[string, string, number, number, number, string]> = [
  ['orion-nebula', 'Orion Nebula (M42)', 209.0, -19.4, 1_344, 'The nearest massive star-forming region to the Sun, in the Local Spur.'],
  ['carina-nebula', 'Carina Nebula', 287.6, -0.6, 7_500, 'Home of Eta Carinae, along the Sagittarius–Carina arm.'],
  ['lagoon-nebula', 'Lagoon Nebula (M8)', 6.0, -1.2, 4_100, 'A naked-eye stellar nursery toward the galactic centre.'],
  ['eagle-nebula', 'Eagle Nebula (M16)', 17.0, 0.8, 5_700, 'The Pillars of Creation live here.'],
  ['heart-soul', 'Heart & Soul (W3/W4/W5)', 134.7, 0.9, 6_500, 'A chain of star factories in the Perseus arm.'],
  ['cygnus-x', 'Cygnus X complex', 79.9, 0.9, 4_600, 'One of the richest known star-forming complexes, in the Local Spur.'],
  ['w49', 'W49 star-forming region', 43.2, 0.0, 36_000, 'Among the most luminous star factories in the galaxy.'],
  ['w51', 'W51 star-forming region', 49.5, -0.4, 17_000, 'A giant molecular cloud complex in the Sagittarius arm.'],
];

/** Globular clusters with approximate published (l, b, d). */
const GLOBULARS: Array<[string, string, number, number, number]> = [
  ['omega-centauri', 'Omega Centauri', 309.1, 15.0, 17_090],
  ['47-tucanae', '47 Tucanae', 305.9, -44.9, 14_800],
  ['m13-hercules', 'M13 Hercules Cluster', 59.0, 40.9, 22_200],
  ['m22-cluster', 'M22', 9.9, -7.6, 10_600],
  ['m4-cluster', 'M4', 351.0, 16.0, 7_200],
  ['ngc-6397', 'NGC 6397', 338.2, -12.0, 7_800],
  ['m15-cluster', 'M15', 65.0, -27.3, 33_600],
  ['m92-cluster', 'M92', 68.3, 34.9, 26_700],
];

export function buildLandmarks(): Landmark[] {
  const list: Landmark[] = [
    {
      id: 'sgra',
      name: 'Sagittarius A*',
      kind: 'black-hole',
      pos: new Vec3d(0, 0, 0),
      radiusLy: 0.002,
      note: 'The Milky Way’s central supermassive black hole. 4.30 million solar masses (GRAVITY 2022); imaged by the Event Horizon Telescope in 2022.',
      real: true,
    },
    {
      id: 'sol',
      name: 'Sol — the Solar System',
      kind: 'star',
      pos: SUN_POS.clone(),
      radiusLy: 0.02,
      note: 'Home. 26,996 ly from the galactic centre, 68 ly above the midplane, inside the Orion–Local Spur.',
      real: true,
    },
    {
      id: 'galactic-centre',
      name: 'Galactic centre region',
      kind: 'region',
      pos: new Vec3d(0, 0, 0),
      radiusLy: 600,
      note: 'The inner bulge: the nuclear star cluster packs stars a million times denser than the solar neighbourhood.',
      real: true,
    },
  ];
  for (const [id, name, l, b, d, note] of NEBULAE) {
    list.push({ id, name, kind: 'nebula', pos: fromGalacticLBD(l, b, d), radiusLy: 90, note, real: true });
  }
  for (const [id, name, l, b, d] of GLOBULARS) {
    list.push({
      id,
      name,
      kind: 'cluster',
      pos: fromGalacticLBD(l, b, d),
      radiusLy: 60,
      note: 'Globular cluster: an ancient, gravitationally bound swarm of a few hundred thousand stars in the galactic halo.',
      real: true,
    });
  }
  list.push(
    {
      id: 'lmc',
      name: 'Large Magellanic Cloud',
      kind: 'galaxy',
      pos: fromGalacticLBD(280.5, -32.9, 163_000),
      radiusLy: 7_000,
      note: 'The Milky Way’s largest satellite galaxy, 163,000 ly away (distance measured to 1%).',
      real: true,
    },
    {
      id: 'smc',
      name: 'Small Magellanic Cloud',
      kind: 'galaxy',
      pos: fromGalacticLBD(302.8, -44.3, 200_000),
      radiusLy: 3_500,
      note: 'A dwarf satellite galaxy about 200,000 ly away.',
      real: true,
    },
    {
      id: 'sgr-dwarf',
      name: 'Sagittarius Dwarf Spheroidal',
      kind: 'galaxy',
      pos: fromGalacticLBD(5.6, -14.2, 65_000),
      radiusLy: 5_000,
      note: 'A satellite galaxy on the far side of the galactic centre, currently being tidally shredded by the Milky Way.',
      real: true,
    },
  );
  return list;
}

// -------------------------------------------------- procedural star names --

/**
 * Deterministic catalog designation for a procedural star, derived from its
 * chunk cell and index so the same star always gets the same name.
 */
export function starDesignation(cx: number, cy: number, cz: number, i: number): string {
  const h = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(cz, 83492791) ^ i) >>> 0;
  return `GSC ${(h % 9000) + 1000}-${((h >>> 12) % 900) + 100}`;
}

/** Seeded RNG for a chunk cell, stable across sessions. */
export function chunkRng(seed: number, cx: number, cy: number, cz: number): () => number {
  const h =
    (Math.imul(cx, 374761393) ^ Math.imul(cy, 668265263) ^ Math.imul(cz, 2147483647) ^ seed) >>> 0;
  return mulberry32(h);
}
