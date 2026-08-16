/**
 * Astronomical data. Sources: NASA Planetary Fact Sheet (nssdc.gsfc.nasa.gov)
 * and JPL "Approximate Positions of the Planets" (J2000 mean orbital elements).
 *
 * Units: km, kg, m/s², hours (rotation), days (orbit), °C, AU.
 * Rotation period is sidereal; negative = retrograde spin.
 */

export interface OrbitalElements {
  a: number; // semi-major axis, AU
  e: number; // eccentricity
  i: number; // inclination to ecliptic, deg
  omega: number; // longitude of ascending node, deg
  wBar: number; // longitude of perihelion, deg
  L0: number; // mean longitude at J2000, deg
  periodDays: number;
}

export interface BodyFacts {
  diameterKm: number;
  massKg: number;
  gravity: number; // m/s² at surface (or 1-bar level for giants)
  /**
   * Sidereal rotation; negative = retrograde. NOTE for renderers: axialTiltDeg
   * > 90° ALSO encodes retrograde (the NASA fact-sheet convention stores
   * both). Orient the axis from the tilt and spin with |rotationHours|, or
   * the two negatives cancel into a wrong prograde spin.
   */
  rotationHours: number;
  dayLengthHours: number; // solar day (sunrise to sunrise)
  orbitDays: number;
  distanceAU: number; // mean distance from Sun (from parent for moons)
  tempMeanC: number;
  tempRangeC?: [number, number];
  density?: number; // g/cm3 (NASA Planetary Fact Sheet)
  albedo?: number; // geometric albedo (NASA Planetary Fact Sheet)
  moons: number;
  axialTiltDeg: number;
  /**
   * Spin-phase angle at J2000 in degrees, measured from the vernal equinox
   * (the scene's +x axis). For Earth this is GMST at J2000 (280.46°), which
   * makes the rendered day/night track UTC. Other planets store the IAU
   * WGCCRE 2015 prime-meridian angle W0, which is referenced to the ICRF
   * node rather than the equinox - a constant per-planet meridian offset
   * that is unobservable at this app's fidelity and disclosed as
   * approximate.
   */
  w0Deg?: number;
  /** Cloud-deck rotation period in hours when it differs dramatically from
   *  the surface (Venus's ~4-day super-rotation). Signed like rotationHours. */
  cloudPeriodHours?: number;
}

export type BodyKind = 'star' | 'rocky' | 'gas giant' | 'ice giant' | 'moon';

export interface BodyDef {
  id: string;
  name: string;
  kind: BodyKind;
  color: number; // UI accent + orbit line color
  facts: BodyFacts;
  orbit?: OrbitalElements;
  overview: string;
  concept: { title: string; text: string };
  quickFacts: string[];
}

export const AU_KM = 149_597_870.7;
export const LIGHT_KM_PER_S = 299_792.458;
export const EARTH_GRAVITY = 9.8;

export const SUN: BodyDef = {
  id: 'sun',
  name: 'Sun',
  kind: 'star',
  color: 0xffc46b,
  facts: {
    diameterKm: 1_391_400,
    massKg: 1.989e30,
    gravity: 274,
    rotationHours: 609.1,
    dayLengthHours: 609.1,
    orbitDays: 0,
    distanceAU: 0,
    tempMeanC: 5505,
    density: 1.408,
    moons: 0,
    axialTiltDeg: 7.25,
  },
  overview:
    'The Sun is an ordinary star - a ball of hydrogen and helium plasma so massive that its core fuses hydrogen into helium, releasing the light that powers everything here. It holds 99.8% of the Solar System’s mass, and that mass is why everything else orbits it.',
  concept: {
    title: 'Why everything orbits the Sun',
    text: 'Planets are not held up by anything - they are falling toward the Sun constantly. But they also move sideways so fast that they keep missing it. That endless sideways fall is what an orbit is.',
  },
  quickFacts: [
    '1.3 million Earths would fit inside the Sun.',
    'Light from its surface takes 8.3 minutes to reach Earth.',
    'It converts ~4 million tonnes of matter into energy every second.',
  ],
};

export const PLANETS: BodyDef[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    kind: 'rocky',
    color: 0xb5a99a,
    orbit: { a: 0.38710, e: 0.20563, i: 7.005, omega: 48.331, wBar: 77.457, L0: 252.251, periodDays: 87.969 },
    facts: {
      diameterKm: 4879,
      massKg: 3.30e23,
      gravity: 3.7,
      rotationHours: 1407.6,
      dayLengthHours: 4222.6,
      orbitDays: 88.0,
      distanceAU: 0.387,
      tempMeanC: 167,
      tempRangeC: [-173, 427],
      moons: 0,
      axialTiltDeg: 0.03,
      w0Deg: 329.5988,
      density: 5.427,
      albedo: 0.142,
    },
    overview:
      'Mercury is the smallest planet and the closest to the Sun - a cratered, airless world that looks a lot like our Moon. With almost no atmosphere to trap heat, it swings between scorching days and freezing nights more than any other planet.',
    concept: {
      title: 'Close means fast',
      text: 'The closer a planet is to the Sun, the stronger the pull of gravity - and the faster it must move to stay in orbit. Mercury races around the Sun in just 88 days; Neptune takes 165 years.',
    },
    quickFacts: [
      'A single Mercury day (sunrise to sunrise) lasts 176 Earth days - two of its years.',
      'Its temperature swings ~600 °C between day and night.',
      'Despite being closest to the Sun, it is not the hottest planet - Venus is.',
    ],
  },
  {
    id: 'venus',
    name: 'Venus',
    kind: 'rocky',
    color: 0xe6c689,
    orbit: { a: 0.72333, e: 0.00677, i: 3.395, omega: 76.680, wBar: 131.602, L0: 181.980, periodDays: 224.701 },
    facts: {
      diameterKm: 12_104,
      massKg: 4.87e24,
      gravity: 8.9,
      rotationHours: -5832.5,
      dayLengthHours: 2802.0,
      orbitDays: 224.7,
      distanceAU: 0.723,
      tempMeanC: 464,
      moons: 0,
      axialTiltDeg: 177.4,
      w0Deg: 160.2,
      density: 5.243,
      albedo: 0.689,
      cloudPeriodHours: -96,
    },
    overview:
      'Venus is almost Earth’s twin in size - and utterly unlike it in every other way. A crushing carbon-dioxide atmosphere traps the Sun’s heat so effectively that its surface stays hot enough to melt lead, day and night, pole to pole.',
    concept: {
      title: 'The greenhouse effect, at full power',
      text: 'Sunlight gets in, but heat cannot get back out through Venus’s thick CO₂ atmosphere. The result: 464 °C everywhere. Venus is the Solar System’s warning about what a runaway greenhouse effect can do.',
    },
    quickFacts: [
      'It spins backwards - on Venus, the Sun rises in the west.',
      'One rotation takes 243 Earth days, longer than its year.',
      'Surface pressure is ~92× Earth’s - like being 900 m underwater.',
    ],
  },
  {
    id: 'earth',
    name: 'Earth',
    kind: 'rocky',
    color: 0x6fa8dc,
    orbit: { a: 1.00000, e: 0.01671, i: 0.0, omega: 0.0, wBar: 102.947, L0: 100.464, periodDays: 365.256 },
    facts: {
      diameterKm: 12_756,
      massKg: 5.97e24,
      gravity: 9.8,
      // full-precision sidereal day: the derived spin rate must match the
      // GMST rate (360.9856°/day) or the terminator drifts ~2.6°/year
      rotationHours: 23.93447,
      dayLengthHours: 24.0,
      orbitDays: 365.25,
      distanceAU: 1.0,
      tempMeanC: 15,
      tempRangeC: [-89, 57],
      moons: 1,
      axialTiltDeg: 23.4,
      // GMST at J2000 (equinox-referenced), NOT the node-referenced IAU W0:
      // this is what makes the rendered day/night follow UTC
      w0Deg: 280.4606,
      density: 5.514,
      albedo: 0.434,
    },
    overview:
      'Earth is the only place we know of where liquid water pools on the surface - and the only place we know of with life. It sits in the Sun’s habitable zone: close enough that water doesn’t freeze solid, far enough that it doesn’t boil away.',
    concept: {
      title: 'Rotation vs. revolution',
      text: 'Earth does two things at once: it spins on its axis once every 24 hours (that’s a day) and it travels around the Sun once every 365¼ days (that’s a year). The leftover quarter-day is why we add a leap day every four years.',
    },
    quickFacts: [
      '71% of the surface is ocean - from space, Earth is a blue planet.',
      'Its 23.4° axial tilt, not its distance from the Sun, causes the seasons.',
      'The atmosphere burns up most incoming meteoroids before they land.',
    ],
  },
  {
    id: 'mars',
    name: 'Mars',
    kind: 'rocky',
    color: 0xd88a5e,
    orbit: { a: 1.52371, e: 0.09339, i: 1.850, omega: 49.559, wBar: 336.041, L0: 355.447, periodDays: 686.980 },
    facts: {
      diameterKm: 6792,
      massKg: 6.42e23,
      gravity: 3.7,
      rotationHours: 24.62,
      dayLengthHours: 24.66,
      orbitDays: 687.0,
      distanceAU: 1.524,
      tempMeanC: -65,
      tempRangeC: [-153, 20],
      moons: 2,
      axialTiltDeg: 25.2,
      w0Deg: 176.63,
      density: 3.934,
      albedo: 0.17,
    },
    overview:
      'Mars is a cold desert world with the largest volcano and the deepest canyon in the Solar System. Dry riverbeds and minerals that only form in water tell us it was once warmer and wetter - which is why it is the prime target in the search for past life.',
    concept: {
      title: 'A world that lost its air',
      text: 'Mars is small, so its gravity is weak and its interior cooled early, shutting down its magnetic field. Without that shield, the solar wind stripped most of its atmosphere away - and with it went the pressure needed for liquid water.',
    },
    quickFacts: [
      'Olympus Mons is ~22 km tall - two and a half times Mount Everest.',
      'A Mars day (sol) is 24 h 40 m - just slightly longer than ours.',
      'Its red colour is iron oxide: the planet is literally rusty.',
    ],
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    kind: 'gas giant',
    color: 0xd9a878,
    orbit: { a: 5.20289, e: 0.04839, i: 1.304, omega: 100.474, wBar: 14.728, L0: 34.396, periodDays: 4332.59 },
    facts: {
      diameterKm: 142_984,
      massKg: 1.898e27,
      gravity: 23.1,
      rotationHours: 9.925,
      dayLengthHours: 9.9,
      orbitDays: 4333,
      distanceAU: 5.204,
      tempMeanC: -110,
      moons: 97, // IAU-recognised as of 2025
      axialTiltDeg: 3.1,
      w0Deg: 284.95,
      density: 1.326,
      albedo: 0.538,
    },
    overview:
      'Jupiter is more massive than all the other planets combined - a giant ball of hydrogen and helium with no solid surface to stand on. Its Great Red Spot is a storm wider than Earth that has raged for at least 190 years.',
    concept: {
      title: 'Gas giants have no ground',
      text: 'Descend into Jupiter and the air just gets thicker and hotter until it becomes liquid metallic hydrogen. There is no surface - “diameter” here means the level where the pressure matches Earth’s at sea level.',
    },
    quickFacts: [
      '1,300 Earths would fit inside it.',
      'It spins fastest of all planets: one day lasts under 10 hours.',
      'Its four largest moons were discovered by Galileo in 1610.',
    ],
  },
  {
    id: 'saturn',
    name: 'Saturn',
    kind: 'gas giant',
    color: 0xe0c9a0,
    orbit: { a: 9.53668, e: 0.05386, i: 2.486, omega: 113.662, wBar: 92.599, L0: 49.954, periodDays: 10_759.22 },
    facts: {
      diameterKm: 120_536,
      massKg: 5.68e26,
      gravity: 9.0,
      rotationHours: 10.656,
      dayLengthHours: 10.7,
      orbitDays: 10_759,
      distanceAU: 9.573,
      tempMeanC: -140,
      moons: 274, // IAU-recognised as of early 2026
      axialTiltDeg: 26.7,
      w0Deg: 38.9,
      density: 0.687,
      albedo: 0.499,
    },
    overview:
      'Saturn’s rings are made of countless chunks of nearly pure water ice - from dust grains to house-sized boulders - spanning 280,000 km yet averaging only about 10 metres thick. The planet itself is so light for its size that it would float in a big enough ocean.',
    concept: {
      title: 'Rings are rubble, not solid',
      text: 'Every ring particle is a tiny moon on its own orbit. Inner particles orbit faster than outer ones, and small shepherd moons sculpt the gaps - the rings are gravity made visible.',
    },
    quickFacts: [
      'With 274 known moons, Saturn has more than every other planet combined.',
      'Its average density is less than water’s.',
      'The rings may be young - perhaps only a few hundred million years old.',
    ],
  },
  {
    id: 'uranus',
    name: 'Uranus',
    kind: 'ice giant',
    color: 0x9fd8dc,
    orbit: { a: 19.18916, e: 0.04726, i: 0.773, omega: 74.017, wBar: 170.954, L0: 313.238, periodDays: 30_688.5 },
    facts: {
      diameterKm: 51_118,
      massKg: 8.68e25,
      gravity: 8.7,
      rotationHours: -17.24,
      dayLengthHours: 17.2,
      orbitDays: 30_689,
      distanceAU: 19.191,
      tempMeanC: -195,
      moons: 29,
      axialTiltDeg: 97.8,
      w0Deg: 203.81,
      density: 1.27,
      albedo: 0.488,
    },
    overview:
      'Uranus rolls around the Sun on its side - its axis is tipped almost 98°, probably from a colossal ancient collision. Each pole gets 42 years of continuous sunlight followed by 42 years of darkness.',
    concept: {
      title: 'Ice giants are a different species',
      text: 'Unlike Jupiter and Saturn, Uranus and Neptune are mostly water, methane and ammonia “ices” around a rocky core, wrapped in hydrogen air. Methane absorbs red light, which is why both planets look blue-green.',
    },
    quickFacts: [
      'It was the first planet found with a telescope (William Herschel, 1781).',
      'At −224 °C it has the coldest atmosphere ever measured on a planet.',
      'It has 13 faint rings, discovered before Neptune’s.',
    ],
  },
  {
    id: 'neptune',
    name: 'Neptune',
    kind: 'ice giant',
    color: 0x5f8ce0,
    orbit: { a: 30.06992, e: 0.00859, i: 1.770, omega: 131.784, wBar: 44.965, L0: 304.880, periodDays: 60_182 },
    facts: {
      diameterKm: 49_528,
      massKg: 1.02e26,
      gravity: 11.0,
      rotationHours: 16.11,
      dayLengthHours: 16.1,
      orbitDays: 60_182,
      distanceAU: 30.07,
      tempMeanC: -200,
      moons: 16,
      axialTiltDeg: 28.3,
      w0Deg: 249.978,
      density: 1.638,
      albedo: 0.442,
    },
    overview:
      'Neptune is the most distant planet - so far out that the Sun looks like a very bright star and one orbit takes 165 Earth years. Despite receiving 900× less sunlight than Earth, it hosts the fastest winds in the Solar System.',
    concept: {
      title: 'Found with mathematics',
      text: 'Uranus kept drifting off its predicted path, so astronomers computed where an unseen planet’s gravity must be pulling from. In 1846 Neptune was found within 1° of the predicted spot - gravity’s laws, proven by prediction.',
    },
    quickFacts: [
      'Winds reach 2,100 km/h - faster than the speed of sound on Earth.',
      'It has completed only one orbit since its discovery in 1846.',
      'Sunlight takes over 4 hours to reach it.',
    ],
  },
];

export const MOON: BodyDef = {
  id: 'moon',
  name: 'The Moon',
  kind: 'moon',
  color: 0xc9c9c9,
  facts: {
    diameterKm: 3475,
    massKg: 7.35e22,
    gravity: 1.62,
    rotationHours: 655.7,
    dayLengthHours: 708.7,
    orbitDays: 27.32,
    distanceAU: 384_400 / AU_KM,
    tempMeanC: -23,
    tempRangeC: [-173, 127],
    density: 3.34,
    albedo: 0.12,
    moons: 0,
    axialTiltDeg: 6.7,
  },
  overview:
    'The Moon is Earth’s constant companion, most likely born when a Mars-sized body struck the young Earth and the debris coalesced in orbit. It stabilises Earth’s tilt and raises the ocean tides.',
  concept: {
    title: 'Why we only see one side',
    text: 'The Moon rotates exactly once per orbit - 27.3 days for both. Earth’s gravity slowed its spin until the two locked together. That is why the same face always points at us: it IS rotating, just in perfect sync.',
  },
  quickFacts: [
    'It is drifting away from Earth by ~3.8 cm per year.',
    'Its gravity is 1/6 of Earth’s - you could jump six times higher.',
    'The Moon causes two high tides on Earth every day.',
  ],
};

/** Moon orbital distance in km (mean). */
export const MOON_DIST_KM = 384_400;
export const MOON_PERIOD_DAYS = 27.322;

/** Conservative habitable-zone bounds (Kasting 1993 / Kopparapu et al. 2013), AU. */
export const HZ_INNER_AU = 0.95;
export const HZ_OUTER_AU = 1.67;

export const ALL_BODIES: BodyDef[] = [SUN, ...PLANETS, MOON];

export function bodyById(id: string): BodyDef {
  const b = ALL_BODIES.find((x) => x.id === id);
  if (!b) throw new Error(`unknown body: ${id}`);
  return b;
}

/** Days since the J2000 epoch (2000-01-01 12:00 UTC) for a JS timestamp. */
export function daysSinceJ2000(ms: number): number {
  return (ms - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
}

const DEG = Math.PI / 180;

/**
 * Heliocentric ecliptic position from Keplerian elements at time t
 * (days since J2000). Returns AU in ecliptic coords [x, y, z] where the
 * x–y plane is the ecliptic and orbits run counterclockwise seen from +z.
 */
export function keplerPosition(el: OrbitalElements, tDays: number): [number, number, number] {
  const n = 360 / el.periodDays; // mean motion, deg/day
  const L = el.L0 + n * tDays;
  let M = ((L - el.wBar) % 360) * DEG;
  // normalize to (−π, π] so the solver starts near the right branch
  M = M % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI;
  else if (M < -Math.PI) M += 2 * Math.PI;
  // Newton–Raphson solve of Kepler's equation E − e·sinE = M.
  // Starting at E = M diverges for near-parabolic orbits (Hale-Bopp,
  // e ≈ 0.995), so high-e orbits start from ±π instead.
  let E = el.e < 0.8 ? M : Math.PI * (M >= 0 ? 1 : -1);
  for (let k = 0; k < 24; k++) {
    const d = (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-9) break;
  }
  const xOrb = el.a * (Math.cos(E) - el.e);
  const yOrb = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);

  const w = (el.wBar - el.omega) * DEG; // argument of perihelion
  const om = el.omega * DEG;
  const inc = el.i * DEG;
  const cosW = Math.cos(w), sinW = Math.sin(w);
  const cosO = Math.cos(om), sinO = Math.sin(om);
  const cosI = Math.cos(inc), sinI = Math.sin(inc);

  const x =
    (cosW * cosO - sinW * sinO * cosI) * xOrb + (-sinW * cosO - cosW * sinO * cosI) * yOrb;
  const y =
    (cosW * sinO + sinW * cosO * cosI) * xOrb + (-sinW * sinO + cosW * cosO * cosI) * yOrb;
  const z = sinW * sinI * xOrb + cosW * sinI * yOrb;
  return [x, y, z];
}

/** Current heliocentric distance in AU. */
export function heliocentricDistance(el: OrbitalElements, tDays: number): number {
  const [x, y, z] = keplerPosition(el, tDays);
  return Math.hypot(x, y, z);
}
