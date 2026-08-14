/**
 * The interstellar frame: where the neighbouring stars actually are, and how
 * far away they are allowed to be drawn.
 *
 * Positions
 * ---------
 * Every system carries an ICRS right ascension, declination and parallax. Those
 * three numbers are a point in space, and this module turns them into one, in
 * the same axes the rest of the scene uses (ecliptic [x, y, z] stored as
 * three.js [x, z, −y], exactly as sim/scale does for the planets). Nothing is
 * placed by eye: Barnard's Star ends up in Ophiuchus because its coordinates
 * put it there.
 *
 * Scale
 * -----
 * True scale is not an option out here. One light-year is 63,241 AU, which at
 * the app's true-scale unit (1 AU = 100 units) is 6.3 million scene units per
 * light-year - Alpha Centauri would sit 27 million units out, past any usable
 * far plane and past the point where a 32-bit float in a vertex buffer means
 * anything. So the interstellar layer has its own scale, and it is honest about
 * it in two ways:
 *
 *   1. The layout is LINEAR in light-years. Relative distances are therefore
 *      exact - TRAPPIST-1 really is 9.3× further away than Alpha Centauri, and
 *      it is drawn 9.3× further away. Stars do not all sit on one shell.
 *   2. The compression factor against true scale is a computed number the UI
 *      displays, rather than a fudge nobody mentions.
 *
 * The units-per-light-year figure still follows the explorer↔true-scale blend,
 * because the rest of the scene changes size underneath it: in explorer view
 * Neptune's orbit is 172 units across, in true scale it is 3,007, and the
 * nearest star has to stay convincingly outside both.
 *
 * Floating origin
 * ---------------
 * The scene's origin is always the system you are currently in. Travelling to
 * another star does not move the star toward you; it moves the origin, and
 * everything - including the Sun, which becomes just another point of light -
 * is re-expressed relative to the new one. That is why the Sun appears in
 * Cassiopeia from Alpha Centauri without anybody having to author it.
 */
import * as THREE from 'three';
import { AU_KM } from '../data/bodies';
import { STAR_SYSTEMS, type StarSystem } from '../data/catalog/starsystems';

/** Astronomical units in one light-year (IAU light-year / IAU au). */
export const AU_PER_LY = 63_241.077;
/** Light-years in one parsec. */
export const LY_PER_PC = 3.261_563_777;
/** Kilometres in one light-year. */
export const KM_PER_LY = AU_PER_LY * AU_KM;
/** Obliquity of the ecliptic at J2000, degrees. */
const OBLIQUITY = 23.439_291_1;

/**
 * Scene units per light-year.
 *
 * This number is not free. The Solar System's own Oort cloud is modelled out
 * to 60,000 AU - 0.95 light-years - and the app draws it, so whatever scale
 * the stars use has to put the nearest of them OUTSIDE that cloud. An earlier
 * figure did not, and the result was a picture in which Alpha Centauri sat
 * inside the Sun's own comet shell: not a rounding error, a contradiction.
 *
 * At true scale the constraint has exactly one solution, and it is the honest
 * one: a light-year is 63,241 AU and an AU is 100 units, so a light-year is
 * 6,324,108 units and interstellar space is drawn at the same scale as
 * everything else. Switch to true scale and the compression factor reads 1.00.
 * The price is a very long way to zoom, which is the point of that mode.
 *
 * Explorer view compresses, like it does for the planets, but only as far as
 * the Oort cloud allows: the cloud's outer edge lands at ~11,000 units under
 * the r^0.55 curve, so Proxima at 4.25 ly has to clear that.
 */
export const UNITS_PER_LY_EXPLORER = 3400;
/** True-scale units in one light-year: 63,241 AU × 100 units per AU. */
export const UNITS_PER_LY_TRUE = AU_PER_LY * 100;

export function unitsPerLy(scaleT: number): number {
  return UNITS_PER_LY_EXPLORER * (1 - scaleT) + UNITS_PER_LY_TRUE * scaleT;
}

/** How much interstellar space is compressed relative to the planetary scale. */
export function compressionFactor(scaleT: number): number {
  return UNITS_PER_LY_TRUE / unitsPerLy(scaleT);
}

/**
 * ICRS (RA, Dec) → a unit direction in scene axes.
 *
 * equatorial → ecliptic is a rotation about the x axis by −ε; ecliptic → scene
 * is the [x, z, −y] swap that sim/scale.mapPositionAU applies to the planets.
 */
export function directionFromRaDec(raDeg: number, decDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const ra = THREE.MathUtils.degToRad(raDeg);
  const dec = THREE.MathUtils.degToRad(decDeg);
  const xEq = Math.cos(dec) * Math.cos(ra);
  const yEq = Math.cos(dec) * Math.sin(ra);
  const zEq = Math.sin(dec);
  const e = THREE.MathUtils.degToRad(OBLIQUITY);
  const ce = Math.cos(e);
  const se = Math.sin(e);
  const xEcl = xEq;
  const yEcl = yEq * ce + zEq * se;
  const zEcl = -yEq * se + zEq * ce;
  return out.set(xEcl, zEcl, -yEcl);
}

/** Position in light-years, scene axes, with the Sun at the origin. */
export function systemPositionLy(sys: StarSystem, out = new THREE.Vector3()): THREE.Vector3 {
  return directionFromRaDec(sys.raDeg, sys.decDeg, out).multiplyScalar(sys.distanceLy);
}

/** Parallax in milliarcseconds → distance in light-years. */
export function parallaxToLy(mas: number): number {
  return (1000 / mas) * LY_PER_PC;
}

/** The Solar System's own entry in the neighbourhood: the origin, by definition. */
export const SOL_ID = 'sol';

const positions = new Map<string, THREE.Vector3>([[SOL_ID, new THREE.Vector3(0, 0, 0)]]);
for (const sys of STAR_SYSTEMS) positions.set(sys.id, systemPositionLy(sys));

/** Position of a system in light-years from the Sun, scene axes. */
export function positionLyOf(systemId: string): THREE.Vector3 {
  return positions.get(systemId) ?? positions.get(SOL_ID)!;
}

/** Straight-line distance between two systems, in light-years. */
export function separationLy(aId: string, bId: string): number {
  return positionLyOf(aId).distanceTo(positionLyOf(bId));
}

/**
 * Scene position of a system when the camera's frame is anchored on `originId`.
 * This is the whole floating-origin mechanism: one subtraction.
 */
export function scenePositionOf(
  systemId: string,
  originId: string,
  scaleT: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  return out
    .copy(positionLyOf(systemId))
    .sub(positionLyOf(originId))
    .multiplyScalar(unitsPerLy(scaleT));
}

/** Every system id, Sun first, ordered outward from the Sun. */
export const NEIGHBOURHOOD_IDS: string[] = [
  SOL_ID,
  ...[...STAR_SYSTEMS].sort((a, b) => a.distanceLy - b.distanceLy).map((s) => s.id),
];

/** The furthest system from the Sun, in light-years - drives the zoom limit. */
export const NEIGHBOURHOOD_RADIUS_LY = STAR_SYSTEMS.reduce(
  (m, s) => Math.max(m, s.distanceLy),
  1,
);

// ---------------------------------------------------------------- formatting --

/**
 * A distance readout that changes units as the number changes magnitude, so
 * one label can carry a reader from a planet's surface to another star: km
 * below a hundredth of an AU, AU out to a tenth of a light-year, light-years
 * beyond that, with parsecs alongside once the number is large enough for
 * parsecs to be the unit an astronomer would actually reach for.
 */
export function fmtSpan(km: number): string {
  if (!Number.isFinite(km)) return '—';
  const au = km / AU_KM;
  const ly = km / KM_PER_LY;
  if (ly >= 0.1) {
    const pc = ly / LY_PER_PC;
    return `${ly < 10 ? ly.toFixed(3) : ly.toFixed(2)} ly · ${pc.toFixed(2)} pc`;
  }
  if (au >= 0.01) {
    return au >= 1000
      ? `${Math.round(au).toLocaleString('en-US')} AU`
      : `${au.toFixed(au < 10 ? 3 : 1)} AU`;
  }
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)} million km`;
  if (km >= 1000) return `${Math.round(km).toLocaleString('en-US')} km`;
  return `${km.toFixed(1)} km`;
}

/** Light-years, plus the parsec and AU equivalents, for a system card. */
export function fmtInterstellar(ly: number): string {
  const pc = ly / LY_PER_PC;
  return `${ly.toFixed(2)} ly · ${pc.toFixed(2)} pc`;
}

/** How long light takes to cross a distance given in light-years. */
export function fmtLightTravel(ly: number): string {
  if (ly >= 1) return `${ly.toFixed(2)} years`;
  const days = ly * 365.25;
  if (days >= 1) return `${days.toFixed(1)} days`;
  const hours = days * 24;
  if (hours >= 1) return `${hours.toFixed(1)} hours`;
  return `${(hours * 60).toFixed(1)} minutes`;
}
