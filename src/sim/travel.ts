/**
 * How far is far, and what the trip should look like.
 *
 * The app now has three ways to get somewhere, and the only thing that decides
 * between them is the distance actually being covered - not which button was
 * pressed, not whether the destination is a planet or a star. A hop to a moon
 * and a hop to Saturn are the same kind of instruction; they are 3,000 times
 * apart in length, and they should not look the same.
 *
 *   short   - under a third of an AU. Earth to the Moon is 0.0026 AU, a low
 *             orbit is nothing at all. The existing fly-to already handles
 *             these well and is left completely alone.
 *   medium  - out to a few AU: Earth to Mars, Mars to the belt. The autopilot
 *             cruises and the simulation clock is compressed to keep it
 *             watchable, which is what it has always done.
 *   long    - beyond that, including everything interstellar. Here the honest
 *             picture is that the trip takes months to millennia and there is
 *             nothing to see for almost all of it, so the app plays a wormhole
 *             sequence over the top while the real flight runs underneath.
 *
 * The wormhole is a piece of cinema and the app says so wherever it appears.
 * It does not move the ship, spend its fuel, or bend its clock: the distance
 * covered, the velocity and the elapsed simulation time are all still the ones
 * the flight computer produces, and all three stay on the HUD throughout.
 */

/** Distance below which travel is an ordinary fly-to, in AU. */
export const SHORT_TRAVEL_AU = 0.35;
/** Distance above which travel earns the wormhole sequence, in AU. */
export const LONG_TRAVEL_AU = 3.0;

export type TravelKind = 'short' | 'medium' | 'long';

/** Visual quality of the long-distance transition. */
export type TravelEffects = 'cinematic' | 'reduced' | 'off';

export const TRAVEL_EFFECT_LABEL: Record<TravelEffects, string> = {
  cinematic: 'Cinematic',
  reduced: 'Reduced',
  off: 'Off',
};

export const TRAVEL_EFFECT_HINT: Record<TravelEffects, string> = {
  cinematic:
    'The full six-stage crossing: the real Milky Way lensed around an open throat, layered walls, curved star trails.',
  // Reduced keeps every stage and thins what is inside them, rather than
  // playing a different, cheaper-looking effect on slower hardware.
  reduced: 'Same sequence, lighter to draw: fewer wall layers, one lensed image, less noise detail.',
  off: 'No transition; long jumps and interstellar cruises run as a plain flight.',
};

/** Classify a jump by the distance it covers, in AU. */
export function travelKind(distanceAU: number): TravelKind {
  if (!Number.isFinite(distanceAU) || distanceAU < SHORT_TRAVEL_AU) return 'short';
  if (distanceAU < LONG_TRAVEL_AU) return 'medium';
  return 'long';
}

/**
 * Should this jump get the wormhole?
 *
 * Anything interstellar qualifies whatever the number says - the shortest
 * crossing on offer is 4.2 light-years, which is 268,000 AU - but the check is
 * still written as a distance so there is one rule rather than two.
 */
export function usesWormhole(distanceAU: number, effects: TravelEffects): boolean {
  return effects !== 'off' && travelKind(distanceAU) === 'long';
}

/**
 * Seconds the sequence runs for, by quality.
 *
 * Six acts need room to be six acts. At the old 5.6 the departure and the
 * distortion were over before they had registered and the thing read as a cut;
 * the extra time goes almost entirely into the front half, where the sky is
 * still recognisable and the bending is the whole point.
 */
export function wormholeDuration(effects: TravelEffects): number {
  return effects === 'reduced' ? 5.0 : 8.5;
}
