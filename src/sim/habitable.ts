/**
 * Habitable-zone limits, computed rather than tabulated.
 *
 * Every star in the app - the Sun included - gets its zone from the same
 * parameterisation, Kopparapu et al. (2014, ApJL 787, L29), so no system is
 * quietly using a different definition than its neighbour. The zone is a
 * statement about one thing only: how much starlight reaches a given orbit.
 * It says nothing about whether a planet there has water, air, a magnetic
 * field, or life, and the UI is required to say so wherever it draws one.
 *
 *   S_eff = S_eff☉ + a·T★ + b·T★² + c·T★³ + d·T★⁴,   T★ = T_eff − 5780 K
 *   d_AU  = √( (L/L☉) / S_eff )
 *
 * Conservative zone = runaway greenhouse → maximum greenhouse.
 * Optimistic zone   = recent Venus → early Mars (empirical, from the histories
 * of Venus and Mars rather than from climate models).
 *
 * For the Sun this yields 0.95 - 1.68 AU, which is where the app's solar
 * habitable-zone ring has always been drawn.
 */

interface HzCoefficients {
  seffSun: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Kopparapu et al. (2014), Table 1, for a 1 M⊕ planet. */
const RECENT_VENUS: HzCoefficients = { seffSun: 1.776, a: 2.136e-4, b: 2.533e-8, c: -1.332e-11, d: -3.097e-15 };
const RUNAWAY_GREENHOUSE: HzCoefficients = { seffSun: 1.107, a: 1.332e-4, b: 1.58e-8, c: -8.308e-12, d: -1.931e-15 };
const MAXIMUM_GREENHOUSE: HzCoefficients = { seffSun: 0.356, a: 6.171e-5, b: 1.698e-9, c: -3.198e-12, d: -5.575e-16 };
const EARLY_MARS: HzCoefficients = { seffSun: 0.32, a: 5.547e-5, b: 1.526e-9, c: -2.874e-12, d: -5.011e-16 };

/** The parameterisation was fitted over this range of effective temperature. */
export const HZ_TEMP_MIN_K = 2600;
export const HZ_TEMP_MAX_K = 7200;

export interface HabitableZone {
  /** Conservative inner edge (runaway greenhouse), AU. */
  innerAU: number;
  /** Conservative outer edge (maximum greenhouse), AU. */
  outerAU: number;
  /** Optimistic inner edge (recent Venus), AU. */
  optimisticInnerAU: number;
  /** Optimistic outer edge (early Mars), AU. */
  optimisticOuterAU: number;
  /** True when the star's temperature falls outside the fit's valid range. */
  extrapolated: boolean;
}

function seff(k: HzCoefficients, tempK: number): number {
  const t = tempK - 5780;
  return k.seffSun + k.a * t + k.b * t * t + k.c * t * t * t + k.d * t * t * t * t;
}

function edgeAU(k: HzCoefficients, luminositySun: number, tempK: number): number {
  const s = seff(k, tempK);
  return s > 0 ? Math.sqrt(luminositySun / s) : Number.NaN;
}

/**
 * Habitable-zone edges for a star, or null when the inputs cannot support one.
 *
 * Returns null rather than a number for stars the fit does not cover at all -
 * Sirius A at 9,940 K is nearly 3,000 K past the top of the range, and
 * extrapolating a quartic that far would produce a confident-looking fiction.
 * Mild extrapolation (TRAPPIST-1 sits 34 K below the floor) is allowed but
 * flagged, so the UI can say the edges are approximate.
 */
export function habitableZone(
  luminositySun: number | undefined,
  tempK: number | undefined,
): HabitableZone | null {
  if (!luminositySun || !tempK || luminositySun <= 0) return null;
  // allow a little slack past each end of the fit, but not an extrapolation
  // so long that the polynomial stops meaning anything
  if (tempK < HZ_TEMP_MIN_K - 200 || tempK > HZ_TEMP_MAX_K + 300) return null;
  const innerAU = edgeAU(RUNAWAY_GREENHOUSE, luminositySun, tempK);
  const outerAU = edgeAU(MAXIMUM_GREENHOUSE, luminositySun, tempK);
  if (!Number.isFinite(innerAU) || !Number.isFinite(outerAU) || outerAU <= innerAU) return null;
  return {
    innerAU,
    outerAU,
    optimisticInnerAU: edgeAU(RECENT_VENUS, luminositySun, tempK),
    optimisticOuterAU: edgeAU(EARLY_MARS, luminositySun, tempK),
    extrapolated: tempK < HZ_TEMP_MIN_K || tempK > HZ_TEMP_MAX_K,
  };
}

/** The Sun's own zone, from the same function every other star uses. */
export const SOLAR_HZ = habitableZone(1, 5772)!;

/** Where an orbit sits relative to a zone. */
export type HzPlacement = 'inside' | 'too-hot' | 'too-cold';

export function hzPlacement(semiMajorAU: number, hz: HabitableZone | null): HzPlacement | null {
  if (!hz) return null;
  if (semiMajorAU < hz.innerAU) return 'too-hot';
  if (semiMajorAU > hz.outerAU) return 'too-cold';
  return 'inside';
}

export const HZ_METHOD_NOTE =
  'Habitable-zone edges are computed from each star’s luminosity and temperature using Kopparapu et al. (2014). The zone marks where liquid water could persist on a rocky planet with the right atmosphere - it is not a claim that any planet inside it is habitable.';
