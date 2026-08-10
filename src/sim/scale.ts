/**
 * The two coordinate scales the app can render, and the blend between them.
 *
 * Explorer view (t = 0): distances compressed with a power law and planet
 * sizes exaggerated so the whole system is browsable at once.
 * True scale (t = 1): 1 AU = 100 scene units and every body has its real
 * proportional size - which makes planets nearly invisible. That emptiness
 * is deliberate and is called out in the UI.
 */
import { AU_KM } from '../data/bodies';

export const TRUE_UNITS_PER_AU = 100;
export const EXPLORER_A = 26;
export const EXPLORER_GAMMA = 0.55;

export const SUN_RADIUS_KM = 695_700;
const EARTH_RADIUS_KM = 6378;

/** Display distance (scene units) for a heliocentric distance in AU. */
export function mapDistanceAU(rAU: number, t: number): number {
  if (rAU <= 0) return 0;
  const explorer = EXPLORER_A * Math.pow(rAU, EXPLORER_GAMMA);
  const trueScale = rAU * TRUE_UNITS_PER_AU;
  return explorer * (1 - t) + trueScale * t;
}

/**
 * Map a heliocentric position (AU, ecliptic frame) into scene units,
 * preserving direction while remapping radius.
 * Ecliptic [x, y, z] → three.js [x, z(up), −y].
 */
export function mapPositionAU(
  x: number,
  y: number,
  z: number,
  t: number,
  out: { x: number; y: number; z: number },
): void {
  const r = Math.hypot(x, y, z);
  if (r === 0) {
    out.x = out.y = out.z = 0;
    return;
  }
  const k = mapDistanceAU(r, t) / r;
  out.x = x * k;
  out.y = z * k;
  out.z = -y * k;
}

/** Exaggerated display radius (scene units) used in explorer view. */
export function explorerRadius(id: string, diameterKm: number): number {
  if (id === 'sun') return 5.0;
  if (id === 'moon') return 0.30;
  const rel = diameterKm / 2 / EARTH_RADIUS_KM;
  return Math.max(0.34, 0.92 * Math.pow(rel, 0.45));
}

/** Physically proportional display radius (scene units) for true scale. */
export function trueRadius(id: string, diameterKm: number): number {
  const km = id === 'sun' ? SUN_RADIUS_KM : diameterKm / 2;
  return (km / AU_KM) * TRUE_UNITS_PER_AU;
}

/** Blended display radius. */
export function displayRadius(id: string, diameterKm: number, t: number): number {
  return explorerRadius(id, diameterKm) * (1 - t) + trueRadius(id, diameterKm) * t;
}

/** Explorer-view distance of the Moon from Earth's centre (scene units). */
export const MOON_EXPLORER_DIST = 1.9;
