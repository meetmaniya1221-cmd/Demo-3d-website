/**
 * The Sun's stellar neighbourhood: thirteen nearby systems, their stars and
 * every planet around them that a reliable source will vouch for.
 *
 * Where the numbers come from
 * ---------------------------
 *  - Planet parameters: NASA Exoplanet Archive, `pscomppars` (the composite
 *    per-planet table), queried through its TAP service. That table is the
 *    archive's own reconciliation of the published solutions, so it is used
 *    rather than a hand-picked paper wherever it has a value.
 *  - Astrometry (position, parallax, proper motion, radial velocity): SIMBAD,
 *    which serves Gaia DR3 for everything here except the two stars Gaia
 *    saturates on - Sirius and Alpha Centauri AB - where the Hipparcos and
 *    Kervella et al. (2016) solutions are used instead.
 *  - Stellar physical parameters: the archive for planet hosts; published
 *    interferometry for Alpha Centauri (Kervella et al. 2017) and Sirius.
 *
 * What is NOT here
 * ----------------
 * Nothing is filled in by analogy. A field that no source gives is left
 * `undefined` and the UI omits the row rather than printing a guess. Two kinds
 * of value are marked rather than silently mixed in with measurements:
 *
 *  - `radiusEstimated` - for radial-velocity planets the archive publishes a
 *    radius derived from mass through a mass-radius relation. It is a model
 *    output, not an observation, and only the transiting TRAPPIST-1 planets
 *    here have radii that were actually measured.
 *  - `status` - 'confirmed' is an archive-confirmed planet; 'disputed' is in
 *    the archive with its controversy flag set (the Tau Ceti signals);
 *    'candidate' is published and peer-reviewed but not archive-confirmed
 *    (Proxima c). All three are drawn, and all three are labelled.
 *
 * Habitable-zone limits are not stored at all - they are computed from each
 * star's luminosity and temperature by the Kopparapu et al. (2014)
 * parameterisation in sim/habitable.ts, so the same method is applied to every
 * star including the Sun.
 */
import type { SourceRef } from '../types';

/** Planet size/composition class, used for the procedural appearance. */
export type PlanetClass =
  | 'sub-earth'
  | 'earth-sized'
  | 'super-earth'
  | 'sub-neptune'
  | 'ice-giant'
  | 'gas-giant';

export type PlanetStatus = 'confirmed' | 'disputed' | 'candidate';

export interface Exoplanet {
  id: string;
  /** Full designation, e.g. "TRAPPIST-1e". */
  name: string;
  /** Orbital letter, e.g. "e". */
  letter: string;
  status: PlanetStatus;
  /** Orbital period in days. */
  periodDays: number;
  /** Semi-major axis in AU. */
  semiMajorAU: number;
  eccentricity?: number;
  /** Orbital inclination in degrees, where measured (transiting systems). */
  inclinationDeg?: number;
  /** Radius in Earth radii. */
  radiusEarth?: number;
  /** True when `radiusEarth` came from a mass-radius relation, not a transit. */
  radiusEstimated?: boolean;
  /** Mass in Earth masses. */
  massEarth?: number;
  /** 'Mass' = true mass; 'Msini' = minimum mass (inclination unknown). */
  massKind?: 'Mass' | 'Msini';
  /** Bulk density in g/cm³, where measured. */
  densityGcm3?: number;
  /** Equilibrium temperature in K (zero albedo unless the source says otherwise). */
  eqTempK?: number;
  /** Insolation relative to Earth's. */
  insolationEarth?: number;
  discoveryYear: number;
  discoveryMethod: string;
  discoveryFacility?: string;
  /** One or two sentences of context. */
  note: string;
  /** Set when a value here is unusually uncertain and the UI must say so. */
  uncertainty?: string;
}

export interface HostStar {
  id: string;
  name: string;
  /** Morgan-Keenan spectral type. */
  spectral: string;
  /** Distance in light-years - members of a wide multiple differ measurably. */
  distanceLy?: number;
  massSun?: number;
  radiusSun?: number;
  tempK?: number;
  /** Bolometric luminosity relative to the Sun. */
  luminositySun?: number;
  /** Apparent visual magnitude. */
  magV?: number;
  /** Rotation period in days. */
  rotationDays?: number;
  /** Age in gigayears, where a source gives one. */
  ageGyr?: number;
  /** True separation from its companion in AU, for display. */
  companionAU?: number;
  /** Mutual orbital period in years, for a resolved multiple. */
  companionPeriodYears?: number;
  /**
   * Where to draw this star relative to the system's anchor (the star the
   * planets orbit), in AU. Zero for the anchor itself. Kept separate from
   * `companionAU` because they are different quantities: Proxima is 23.3 AU
   * from nothing, but 12,950 AU from the pair it belongs to.
   */
  offsetAU?: number;
  /** Render colour (UI accent + the star's own light). */
  color: number;
  note: string;
}

export interface StarSystem {
  id: string;
  name: string;
  /** Alternate designations, for search. */
  aliases: string[];
  /** Distance to the system anchor in light-years. */
  distanceLy: number;
  /** Parallax in milliarcseconds, and where it came from. */
  parallaxMas: number;
  parallaxSource: string;
  /** ICRS J2000 right ascension in degrees. */
  raDeg: number;
  /** ICRS J2000 declination in degrees. */
  decDeg: number;
  /** Proper motion in mas/yr (RA*cos(dec), Dec). */
  properMotion?: [number, number];
  /** Radial velocity in km/s; negative = approaching. */
  radialVelocityKms?: number;
  /** Constellation the system lies in, as seen from Earth. */
  constellation: string;
  /** Every star in the system, primary first. */
  stars: HostStar[];
  /** Every planet we will draw, innermost first. */
  planets: Exoplanet[];
  /** The star each planet orbits (defaults to stars[0].id). */
  planetHostId?: string;
  /** One-line hook for the system card. */
  tagline: string;
  /** 2-3 sentences of introduction. */
  overview: string;
  /** The single most interesting thing about this system. */
  interestingFact: string;
  /** Non-planetary companions, debris disks, anything else worth stating. */
  extras?: string[];
  sources: SourceRef[];
  /** UI accent colour. */
  color: number;
}

const NASA_ARCHIVE: SourceRef = {
  label: 'NASA Exoplanet Archive',
  url: 'https://exoplanetarchive.ipac.caltech.edu/',
};
const SIMBAD: SourceRef = { label: 'SIMBAD (CDS)', url: 'https://simbad.cds.unistra.fr/simbad/' };
const GAIA: SourceRef = {
  label: 'ESA Gaia DR3',
  url: 'https://www.cosmos.esa.int/web/gaia/dr3',
};

/** Earth masses in one Jupiter mass. */
export const EARTH_MASSES_PER_JUPITER = 317.828;
/** Earth radii in one Jupiter radius. */
export const EARTH_RADII_PER_JUPITER = 11.209;

export const STAR_SYSTEMS: StarSystem[] = [
  // ---------------------------------------------------------------------- 1 --
  {
    id: 'alpha-centauri',
    name: 'Alpha Centauri',
    aliases: ['Rigil Kentaurus', 'Toliman', 'Proxima Centauri', 'Alpha Cen', 'GJ 559', 'GJ 551', 'Alpha Centauri C'],
    distanceLy: 4.365,
    parallaxMas: 747.17,
    parallaxSource: 'Kervella et al. (2016) - Gaia saturates on stars this bright',
    raDeg: 219.90206,
    decDeg: -60.83399,
    properMotion: [-3679.25, 473.67],
    radialVelocityKms: -22.3,
    constellation: 'Centaurus',
    color: 0xffd9a0,
    stars: [
      {
        id: 'alpha-cen-a',
        name: 'Alpha Centauri A',
        spectral: 'G2 V',
        distanceLy: 4.365,
        massSun: 1.0788,
        radiusSun: 1.2234,
        tempK: 5795,
        luminositySun: 1.521,
        magV: 0.01,
        ageGyr: 5.3,
        companionAU: 23.3,
        companionPeriodYears: 79.91,
        offsetAU: 12_950,
        color: 0xfff4e0,
        note: 'The closest thing to a solar twin in the sky - slightly larger, slightly brighter, and about the same colour as the Sun.',
      },
      {
        id: 'alpha-cen-b',
        name: 'Alpha Centauri B',
        spectral: 'K1 V',
        distanceLy: 4.365,
        massSun: 0.9092,
        radiusSun: 0.8632,
        tempK: 5231,
        luminositySun: 0.503,
        magV: 1.33,
        ageGyr: 5.3,
        companionAU: 23.3,
        companionPeriodYears: 79.91,
        offsetAU: 12_973,
        color: 0xffd9a8,
        note: 'An orange dwarf that swings between 11 and 36 AU from its partner every eighty years - Saturn-distance at closest, Neptune-distance at furthest.',
      },
      {
        id: 'proxima',
        name: 'Proxima Centauri',
        spectral: 'M5.5 Ve',
        distanceLy: 4.2465,
        massSun: 0.1221,
        radiusSun: 0.1542,
        tempK: 2900,
        luminositySun: 0.00151,
        magV: 11.13,
        rotationDays: 83.2,
        companionAU: 12_950,
        companionPeriodYears: 547_000,
        offsetAU: 0,
        color: 0xff8a60,
        note: 'The nearest star to the Sun, and a flare star: it can brighten many times over in minutes. Bound to the AB pair at roughly 13,000 AU - a fifth of a light-year out.',
      },
    ],
    planetHostId: 'proxima',
    planets: [
      {
        id: 'proxima-d',
        name: 'Proxima Centauri d',
        letter: 'd',
        status: 'confirmed',
        periodDays: 5.12338,
        semiMajorAU: 0.02881,
        eccentricity: 0,
        radiusEarth: 0.692,
        radiusEstimated: true,
        massEarth: 0.26,
        massKind: 'Msini',
        eqTempK: 282,
        insolationEarth: 1.814,
        discoveryYear: 2025,
        discoveryMethod: 'Radial Velocity',
        discoveryFacility: 'ESO VLT / ESPRESSO',
        note: 'A quarter of an Earth mass - one of the lightest planets ever detected around any star. Found as a candidate in 2022 and confirmed in 2025.',
      },
      {
        id: 'proxima-b',
        name: 'Proxima Centauri b',
        letter: 'b',
        status: 'confirmed',
        periodDays: 11.18465,
        semiMajorAU: 0.04848,
        eccentricity: 0,
        radiusEarth: 1.02,
        radiusEstimated: true,
        massEarth: 1.055,
        massKind: 'Msini',
        eqTempK: 218,
        insolationEarth: 0.641,
        discoveryYear: 2016,
        discoveryMethod: 'Radial Velocity',
        discoveryFacility: 'ESO La Silla / HARPS + UVES',
        note: 'The nearest exoplanet to Earth, and it sits inside its star’s habitable zone. Whether it kept an atmosphere under Proxima’s flares is unknown - no one has measured one.',
        uncertainty:
          'Only a minimum mass is known; the orbit’s tilt has never been measured, so the true mass could be larger.',
      },
      {
        id: 'proxima-c',
        name: 'Proxima Centauri c',
        letter: 'c',
        status: 'candidate',
        periodDays: 1928,
        semiMajorAU: 1.489,
        eccentricity: 0.04,
        massEarth: 7.0,
        massKind: 'Msini',
        discoveryYear: 2020,
        discoveryMethod: 'Radial Velocity',
        discoveryFacility: 'ESO La Silla / HARPS',
        note: 'A long-period super-Earth candidate from a 5-year radial-velocity signal. The NASA Exoplanet Archive has never listed it as confirmed, and it may be an artefact of the star’s magnetic cycle.',
        uncertainty: 'Unconfirmed. Drawn here so the candidate is visible, not because it is established.',
      },
    ],
    tagline: 'The nearest system - three stars, two confirmed planets',
    overview:
      'Alpha Centauri is not one star but three: a Sun-like pair orbiting each other at roughly Saturn-to-Neptune distances, and a faint red dwarf called Proxima wandering a fifth of a light-year further out. Proxima is currently the closest star to the Sun, and it carries the closest exoplanets we know of.',
    interestingFact:
      'Proxima b is the nearest planet outside the Solar System - a target of 4.24 light-years. Even at the 0.06% of light speed Voyager 1 manages, the crossing would take about 73,000 years.',
    extras: [
      'A candidate gas giant near Alpha Centauri A was reported from JWST/MIRI imaging in 2025 and then not recovered in two follow-up attempts. Its orbit is not determined, so nothing is drawn for it here.',
      'Alpha Centauri A and B are separated by 11.2 AU at closest and 35.6 AU at furthest over their 79.91-year orbit.',
    ],
    sources: [
      NASA_ARCHIVE,
      { label: 'Kervella et al. 2017 - radii of α Cen A and B (A&A)', url: 'https://www.aanda.org/articles/aa/full_html/2017/01/aa29505-16/aa29505-16.html' },
      { label: 'ESO - Proxima b discovery', url: 'https://www.eso.org/public/news/eso1629/' },
      { label: 'NASA - Proxima Centauri b', url: 'https://science.nasa.gov/exoplanet-catalog/proxima-centauri-b/' },
      SIMBAD,
    ],
  },

  // ---------------------------------------------------------------------- 2 --
  {
    id: 'barnards-star',
    name: "Barnard's Star",
    aliases: ['GJ 699', 'HIP 87937', 'V2500 Ophiuchi', 'Barnard'],
    distanceLy: 5.9629,
    parallaxMas: 546.9759,
    parallaxSource: 'Gaia DR3 via SIMBAD',
    raDeg: 269.45208,
    decDeg: 4.69336,
    properMotion: [-801.55, 10362.39],
    radialVelocityKms: -110.11,
    constellation: 'Ophiuchus',
    color: 0xff9a6a,
    stars: [
      {
        id: 'barnard',
        name: "Barnard's Star",
        spectral: 'M4 V',
        massSun: 0.162,
        radiusSun: 0.185,
        tempK: 3195,
        luminositySun: 0.00355,
        magV: 9.51,
        rotationDays: 142,
        ageGyr: 10,
        color: 0xff8a55,
        note: 'An ancient, metal-poor red dwarf and the nearest single star to the Sun. It crosses the sky faster than any other star - a full Moon-width every 180 years.',
      },
    ],
    planets: [
      {
        id: 'barnard-d', name: "Barnard's Star d", letter: 'd', status: 'confirmed',
        periodDays: 2.3402, semiMajorAU: 0.0188, eccentricity: 0.04,
        radiusEarth: 0.694, radiusEstimated: true, massEarth: 0.263, massKind: 'Msini',
        eqTempK: 483, insolationEarth: 10.04,
        discoveryYear: 2025, discoveryMethod: 'Radial Velocity', discoveryFacility: 'Gemini North / MAROON-X + ESO VLT / ESPRESSO',
        note: 'The innermost of four, whipping around its star in 56 hours.',
      },
      {
        id: 'barnard-b', name: "Barnard's Star b", letter: 'b', status: 'confirmed',
        periodDays: 3.1542, semiMajorAU: 0.0229, eccentricity: 0.03,
        radiusEarth: 0.720, radiusEstimated: true, massEarth: 0.299, massKind: 'Msini',
        eqTempK: 438, insolationEarth: 6.76,
        discoveryYear: 2024, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO VLT / ESPRESSO',
        note: 'The first planet confirmed here, after a century of false alarms around this star.',
      },
      {
        id: 'barnard-c', name: "Barnard's Star c", letter: 'c', status: 'confirmed',
        periodDays: 4.1244, semiMajorAU: 0.0274, eccentricity: 0.08,
        radiusEarth: 0.743, radiusEstimated: true, massEarth: 0.335, massKind: 'Msini',
        eqTempK: 400, insolationEarth: 4.73,
        discoveryYear: 2025, discoveryMethod: 'Radial Velocity', discoveryFacility: 'Gemini North / MAROON-X',
        note: 'The heaviest of the four, and still only a third of an Earth.',
      },
      {
        id: 'barnard-e', name: "Barnard's Star e", letter: 'e', status: 'confirmed',
        periodDays: 6.7392, semiMajorAU: 0.0381, eccentricity: 0.04,
        radiusEarth: 0.637, radiusEstimated: true, massEarth: 0.193, massKind: 'Msini',
        eqTempK: 340, insolationEarth: 2.45,
        discoveryYear: 2025, discoveryMethod: 'Radial Velocity', discoveryFacility: 'Gemini North / MAROON-X + ESO VLT / ESPRESSO',
        note: 'The outermost and lightest - under a fifth of an Earth mass. Its signal moves the star by 20 centimetres per second.',
      },
    ],
    tagline: 'Four sub-Earths around the fastest-moving star',
    overview:
      'Barnard\'s Star is the nearest single star to the Sun and the fastest-moving star in our sky. Astronomers claimed planets here in the 1960s and were wrong; it took until 2024-2025, and two of the most precise spectrographs ever built, to find the real ones - four planets, every one lighter than Earth.',
    interestingFact:
      'All four planets together weigh about the same as Mercury and Mars combined. Detecting them meant measuring a wobble of roughly 20-50 centimetres per second in a star six light-years away - slower than walking pace.',
    extras: [
      'Every one of the four orbits closer to its star than Mercury does to the Sun, and all sit well inside the habitable zone’s hot edge.',
      'The star is around 10 billion years old - roughly twice the Sun’s age - and unusually poor in heavy elements.',
    ],
    sources: [
      NASA_ARCHIVE,
      { label: 'Basant et al. 2025 - four sub-Earths (ApJL)', url: 'https://iopscience.iop.org/article/10.3847/2041-8213/adb8d5' },
      { label: 'ESO - Barnard b discovery', url: 'https://www.eso.org/public/news/eso2417/' },
      GAIA,
    ],
  },

  // ---------------------------------------------------------------------- 3 --
  {
    id: 'lalande-21185',
    name: 'Lalande 21185',
    aliases: ['GJ 411', 'HD 95735', 'BD+36 2147', 'HIP 54035'],
    distanceLy: 8.3049,
    parallaxMas: 392.7529,
    parallaxSource: 'Gaia DR3 via SIMBAD',
    raDeg: 165.83415,
    decDeg: 35.96988,
    properMotion: [-580.06, -4776.59],
    radialVelocityKms: -84.64,
    constellation: 'Ursa Major',
    color: 0xffb27a,
    stars: [
      {
        id: 'lalande-21185',
        name: 'Lalande 21185',
        spectral: 'M2 V',
        massSun: 0.3899,
        radiusSun: 0.3685,
        tempK: 3719,
        luminositySun: 0.0195,
        magV: 7.49,
        rotationDays: 56.2,
        ageGyr: 8.0,
        color: 0xffab72,
        note: 'The brightest red dwarf in the northern sky - and still four times too faint for the naked eye. The fourth-nearest system to the Sun.',
      },
    ],
    planets: [
      {
        id: 'lalande-21185-b', name: 'Lalande 21185 b', letter: 'b', status: 'confirmed',
        periodDays: 12.9394, semiMajorAU: 0.07879, eccentricity: 0.063,
        radiusEarth: 1.45, radiusEstimated: true, massEarth: 2.69, massKind: 'Msini',
        eqTempK: 350, insolationEarth: 3.13,
        discoveryYear: 2019, discoveryMethod: 'Radial Velocity', discoveryFacility: 'OHP / SOPHIE',
        note: 'A hot super-Earth just inside the habitable zone’s inner edge.',
      },
      {
        id: 'lalande-21185-c', name: 'Lalande 21185 c', letter: 'c', status: 'confirmed',
        periodDays: 2946, semiMajorAU: 2.94, eccentricity: 0.132,
        radiusEarth: 3.76, radiusEstimated: true, massEarth: 13.6, massKind: 'Msini',
        eqTempK: 63, insolationEarth: 0.0023,
        discoveryYear: 2021, discoveryMethod: 'Radial Velocity', discoveryFacility: 'OHP / SOPHIE',
        note: 'A cold Neptune-class world on an eight-year orbit, far beyond the reach of its star’s warmth.',
      },
    ],
    tagline: 'The northern sky’s brightest red dwarf, with two planets',
    overview:
      'Lalande 21185 is the fourth-nearest stellar system and the brightest red dwarf visible from the northern hemisphere. Two planets have been confirmed around it: a warm super-Earth on a 13-day orbit, and a cold Neptune-mass world nearly 3 AU out.',
    interestingFact:
      'The star is hurtling across the sky at nearly 4.8 arcseconds a year and closing on us at 85 km/s. In about 19,900 years it will pass within 4.65 light-years - closer than Alpha Centauri is today.',
    sources: [
      NASA_ARCHIVE,
      { label: 'Díaz et al. 2019 - SOPHIE detection (A&A)', url: 'https://www.aanda.org/articles/aa/full_html/2019/05/aa34767-18/aa34767-18.html' },
      GAIA,
    ],
  },

  // ---------------------------------------------------------------------- 4 --
  {
    id: 'sirius',
    name: 'Sirius',
    aliases: ['Alpha Canis Majoris', 'Alpha CMa', 'GJ 244', 'Dog Star', 'Sirius A', 'Sirius B'],
    distanceLy: 8.6014,
    parallaxMas: 379.21,
    parallaxSource: 'Hipparcos - Gaia saturates on a star this bright',
    raDeg: 101.28716,
    decDeg: -16.71612,
    properMotion: [-546.01, -1223.07],
    radialVelocityKms: -5.5,
    constellation: 'Canis Major',
    color: 0xcfe0ff,
    stars: [
      {
        id: 'sirius-a',
        name: 'Sirius A',
        spectral: 'A1 V',
        massSun: 2.063,
        radiusSun: 1.711,
        tempK: 9940,
        luminositySun: 25.4,
        magV: -1.46,
        ageGyr: 0.24,
        companionAU: 19.8,
        companionPeriodYears: 50.09,
        offsetAU: 0,
        color: 0xdce7ff,
        note: 'The brightest star in Earth’s night sky - not because it is exceptional, but because it is close and 25 times more luminous than the Sun.',
      },
      {
        id: 'sirius-b',
        name: 'Sirius B',
        spectral: 'DA2 (white dwarf)',
        massSun: 1.018,
        radiusSun: 0.008098,
        tempK: 25_000,
        luminositySun: 0.0245,
        magV: 8.44,
        companionAU: 19.8,
        companionPeriodYears: 50.09,
        offsetAU: 19.8,
        color: 0xc9dcff,
        note: 'A white dwarf the size of Earth carrying the mass of the Sun. A teaspoon of it would weigh several tonnes.',
      },
    ],
    planets: [],
    tagline: 'The brightest star in our sky - and no planets found',
    overview:
      'Sirius is two stars: a hot blue-white main-sequence star and the burnt-out core of a heavier star that died first. Sirius B was once several times the Sun’s mass; it exhausted its fuel, shed its outer layers and collapsed into a sphere roughly Earth’s size.',
    interestingFact:
      'No planet has been confirmed around either star, and searches have been thorough. The white dwarf is proof the system was violently rearranged: whatever orbited Sirius B before it swelled into a red giant did not survive intact.',
    extras: [
      'The pair orbit every 50.09 years on a markedly elliptical path, ranging from about 8 to 32 AU apart.',
      'Sirius B is the nearest white dwarf to the Sun, and the first ever discovered - Alvan Clark saw it in 1862, eighteen years after Bessel predicted it from Sirius A’s wobble.',
    ],
    sources: [
      SIMBAD,
      { label: 'NASA - Sirius', url: 'https://science.nasa.gov/asset/hubble/sirius-a-and-b/' },
      { label: 'Bond et al. 2017 - Sirius B dynamical mass (ApJ)', url: 'https://iopscience.iop.org/article/10.3847/1538-4357/aa6af8' },
    ],
  },

  // ---------------------------------------------------------------------- 5 --
  {
    id: 'epsilon-eridani',
    name: 'Epsilon Eridani',
    aliases: ['GJ 144', 'HD 22049', 'HIP 16537', 'Ran', 'Eps Eri'],
    distanceLy: 10.5013,
    parallaxMas: 310.5773,
    parallaxSource: 'Gaia DR3 via SIMBAD',
    raDeg: 53.23269,
    decDeg: -9.45826,
    properMotion: [-974.76, 20.88],
    radialVelocityKms: 16.38,
    constellation: 'Eridanus',
    color: 0xffcf95,
    stars: [
      {
        id: 'epsilon-eridani',
        name: 'Epsilon Eridani',
        spectral: 'K2 V',
        massSun: 0.82,
        radiusSun: 0.759,
        tempK: 5020,
        luminositySun: 0.381,
        magV: 3.73,
        rotationDays: 11.1,
        ageGyr: 0.6,
        color: 0xffc98a,
        note: 'A young orange dwarf, perhaps 600 million years old - an eighth of the Sun’s age - still spinning fast and still magnetically noisy.',
      },
    ],
    planets: [
      {
        id: 'epsilon-eridani-b', name: 'Epsilon Eridani b', letter: 'b', status: 'confirmed',
        periodDays: 2680, semiMajorAU: 3.53, eccentricity: 0.06,
        radiusEarth: 13.8, radiusEstimated: true, massEarth: 317.83, massKind: 'Mass',
        eqTempK: 112, insolationEarth: 0.031,
        discoveryYear: 2000, discoveryMethod: 'Radial Velocity', discoveryFacility: 'Lick / McDonald / CTIO',
        note: 'A Jupiter-mass planet on a 7.3-year orbit - one of the nearest giant planets known, and one of the longest-argued-over detections in the field.',
        uncertainty:
          'The star’s magnetic activity mimics planetary signals; the orbit was contested for two decades before Gaia and long-baseline radial velocities settled it.',
      },
    ],
    tagline: 'A young star wrapped in debris belts',
    overview:
      'Epsilon Eridani is the nearest star known to host both a giant planet and a dusty debris disk - a system that looks like the young Solar System, caught 600 million years in. The dust is the ground-up remains of collisions between planetesimals that never finished assembling.',
    interestingFact:
      'It has an asteroid belt at roughly 3 AU, a second belt near 20 AU, and an outer ring of icy debris at about 70 AU - the same three-tier architecture the Solar System has, around a star an eighth our age.',
    extras: [
      'Spitzer and Herschel resolved the debris structure; the outer ring alone is comparable to a much heavier Kuiper belt.',
      'Its proximity and Sun-like character made it a target of Project Ozma, the first modern SETI search, in 1960.',
    ],
    sources: [
      NASA_ARCHIVE,
      { label: 'NASA - Epsilon Eridani debris disk', url: 'https://science.nasa.gov/mission/spitzer/' },
      { label: 'Mawet et al. 2019 - Eps Eri b orbit (AJ)', url: 'https://iopscience.iop.org/article/10.3847/1538-3881/aaef8a' },
      GAIA,
    ],
  },

  // ---------------------------------------------------------------------- 6 --
  {
    id: 'ross-128',
    name: 'Ross 128',
    aliases: ['GJ 447', 'FI Virginis', 'HIP 57548'],
    distanceLy: 11.0071,
    parallaxMas: 296.3053,
    parallaxSource: 'Gaia DR3 via SIMBAD',
    raDeg: 176.93499,
    decDeg: 0.80456,
    properMotion: [607.30, -1223.03],
    radialVelocityKms: -30.66,
    constellation: 'Virgo',
    color: 0xff9f70,
    stars: [
      {
        id: 'ross-128',
        name: 'Ross 128',
        spectral: 'M4 V',
        massSun: 0.168,
        radiusSun: 0.197,
        tempK: 3192,
        luminositySun: 0.00362,
        magV: 11.15,
        rotationDays: 123,
        ageGyr: 5.0,
        color: 0xff9060,
        note: 'An unusually calm red dwarf. Most M dwarfs flare violently; this one barely does, which makes its planet a far better bet for keeping an atmosphere.',
      },
    ],
    planets: [
      {
        id: 'ross-128-b', name: 'Ross 128 b', letter: 'b', status: 'confirmed',
        periodDays: 9.8658, semiMajorAU: 0.0496, eccentricity: 0.116,
        radiusEarth: 1.11, radiusEstimated: true, massEarth: 1.40, massKind: 'Msini',
        eqTempK: 301, insolationEarth: 1.38,
        discoveryYear: 2017, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO La Silla / HARPS',
        note: 'An Earth-mass planet receiving about 38% more starlight than Earth does - temperate, and orbiting one of the quietest red dwarfs known.',
        uncertainty:
          'Only a minimum mass is measured. It sits just inside the conservative habitable zone’s hot edge, so "temperate" is a statement about starlight received, not about the surface.',
      },
    ],
    tagline: 'A temperate Earth-mass world around a quiet red dwarf',
    overview:
      'Ross 128 is a small, old, remarkably placid red dwarf - and that placidity is the point. Its single known planet gets a little more starlight than Earth, and unlike planets around flare stars such as Proxima, it has not been repeatedly blasted by X-rays for billions of years.',
    interestingFact:
      'Ross 128 is drifting toward us and will become the closest star to the Sun in roughly 71,000 years, taking the title from Proxima Centauri.',
    sources: [
      NASA_ARCHIVE,
      { label: 'ESO - Ross 128 b discovery', url: 'https://www.eso.org/public/news/eso1736/' },
      { label: 'NASA - Ross 128 b', url: 'https://science.nasa.gov/exoplanet-catalog/ross-128-b/' },
      GAIA,
    ],
  },

  // ---------------------------------------------------------------------- 7 --
  {
    id: 'epsilon-indi',
    name: 'Epsilon Indi',
    aliases: ['GJ 845', 'HD 209100', 'HIP 108870', 'Eps Ind'],
    distanceLy: 11.8666,
    parallaxMas: 274.8431,
    parallaxSource: 'Gaia DR3 via SIMBAD',
    raDeg: 330.84022,
    decDeg: -56.78598,
    properMotion: [3966.66, -2536.19],
    radialVelocityKms: -40.04,
    constellation: 'Indus',
    color: 0xffc286,
    stars: [
      {
        id: 'epsilon-indi-a',
        name: 'Epsilon Indi A',
        spectral: 'K5 V',
        massSun: 0.80,
        radiusSun: 0.713,
        tempK: 4700,
        luminositySun: 0.239,
        magV: 4.69,
        rotationDays: 18.3,
        ageGyr: 3.5,
        color: 0xffb877,
        note: 'A quiet orange dwarf, easily visible to the naked eye from the southern hemisphere.',
      },
    ],
    planetHostId: 'epsilon-indi-a',
    planets: [
      {
        id: 'epsilon-indi-ab', name: 'Epsilon Indi Ab', letter: 'b', status: 'confirmed',
        periodDays: 25_450, semiMajorAU: 15.76, eccentricity: 0.25,
        radiusEarth: 12.7, radiusEstimated: true, massEarth: 2065.9, massKind: 'Mass',
        eqTempK: 275, insolationEarth: 0.001,
        discoveryYear: 2019, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO La Silla / HARPS + Gaia astrometry',
        note: 'A cold super-Jupiter about 6.5 times Jupiter’s mass, roughly 16 AU out - and one of the coldest exoplanets ever directly photographed, by JWST in 2024.',
        uncertainty:
          'The orbit is only partly covered: published solutions put the semi-major axis anywhere from 11 to 28 AU and the period from 45 to 108 years. The archive default is drawn here.',
      },
    ],
    tagline: 'A cold super-Jupiter, photographed by JWST',
    overview:
      'Epsilon Indi is a K dwarf with two very different kinds of companion: a giant planet on a decades-long orbit, and - 1,459 AU away - a pair of brown dwarfs orbiting each other. It is one of the very few exoplanets we have an actual photograph of rather than an inference.',
    interestingFact:
      'JWST’s mid-infrared camera imaged Epsilon Indi Ab in 2024 at a temperature near 0 °C. Almost every directly-imaged planet before it was a young, self-luminous furnace; this one is genuinely cold, which is why it took a telescope of JWST’s class to see at all.',
    extras: [
      'Epsilon Indi Ba and Bb are the nearest known brown dwarfs - spectral types T1 and T6 - orbiting each other 1,459 AU from the primary star.',
      'The planet was found through a slow radial-velocity drift plus a Hipparcos-to-Gaia astrometric wobble, then confirmed by direct imaging.',
    ],
    sources: [
      NASA_ARCHIVE,
      { label: 'Matthews et al. 2024 - JWST imaging (Nature)', url: 'https://www.nature.com/articles/s41586-024-07837-8' },
      { label: 'ESA/Webb - Epsilon Indi Ab', url: 'https://esawebb.org/news/weic2419/' },
      GAIA,
    ],
  },

  // ---------------------------------------------------------------------- 8 --
  {
    id: 'tau-ceti',
    name: 'Tau Ceti',
    aliases: ['GJ 71', 'HD 10700', 'HIP 8102', 'Tau Cet'],
    distanceLy: 11.9114,
    parallaxMas: 273.8097,
    parallaxSource: 'Gaia DR3 via SIMBAD',
    raDeg: 26.01701,
    decDeg: -15.93748,
    properMotion: [-1721.73, 854.96],
    radialVelocityKms: -16.60,
    constellation: 'Cetus',
    color: 0xffe6b8,
    stars: [
      {
        id: 'tau-ceti',
        name: 'Tau Ceti',
        spectral: 'G8.5 V',
        massSun: 0.783,
        radiusSun: 0.83,
        tempK: 5310,
        luminositySun: 0.495,
        magV: 3.50,
        rotationDays: 34.5,
        color: 0xffe0ab,
        note: 'The nearest single Sun-like star. Older than the Sun and notably poor in heavy elements, which may be why nothing large has been found here.',
      },
    ],
    planets: [
      {
        id: 'tau-ceti-g', name: 'Tau Ceti g', letter: 'g', status: 'disputed',
        periodDays: 20.0, semiMajorAU: 0.133, eccentricity: 0.06,
        radiusEarth: 1.18, radiusEstimated: true, massEarth: 1.75, massKind: 'Msini',
        eqTempK: 640, insolationEarth: 27.98,
        discoveryYear: 2017, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO La Silla / HARPS + Keck / HIRES',
        note: 'A candidate hot super-Earth signal.',
        uncertainty: 'Flagged as controversial by the NASA Exoplanet Archive - the signal may be stellar activity rather than a planet.',
      },
      {
        id: 'tau-ceti-h', name: 'Tau Ceti h', letter: 'h', status: 'disputed',
        periodDays: 49.41, semiMajorAU: 0.243, eccentricity: 0.23,
        radiusEarth: 1.19, radiusEstimated: true, massEarth: 1.83, massKind: 'Msini',
        eqTempK: 473, insolationEarth: 8.38,
        discoveryYear: 2017, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO La Silla / HARPS + Keck / HIRES',
        note: 'A candidate warm super-Earth signal.',
        uncertainty: 'Flagged as controversial by the NASA Exoplanet Archive.',
      },
      {
        id: 'tau-ceti-f', name: 'Tau Ceti f', letter: 'f', status: 'disputed',
        periodDays: 636.13, semiMajorAU: 1.334, eccentricity: 0.16,
        radiusEarth: 1.81, radiusEstimated: true, massEarth: 3.93, massKind: 'Msini',
        eqTempK: 202, insolationEarth: 0.278,
        discoveryYear: 2017, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO La Silla / HARPS + Keck / HIRES',
        note: 'The most interesting of the three: a super-Earth candidate sitting just beyond the outer edge of the habitable zone.',
        uncertainty: 'Flagged as controversial by the NASA Exoplanet Archive.',
      },
    ],
    tagline: 'The nearest Sun-like star - and a cautionary tale',
    overview:
      'Tau Ceti is the closest single star that genuinely resembles the Sun, and it has been a fixture of the search for other Earths since 1960. Its planets, however, are a lesson in how hard that search is: an earlier claim of five planets has been whittled down, and the signals still on the books are all flagged as disputed.',
    interestingFact:
      'Every planet signal at Tau Ceti carries the NASA Exoplanet Archive’s controversy flag. The star is quiet by G-dwarf standards, but the wobbles involved are under a metre per second - the level at which starspots and convection start to look exactly like planets.',
    extras: [
      'A debris disk ten times more massive than the Solar System’s Kuiper belt surrounds the star, extending from about 1 to 55 AU.',
      'Tau Ceti and Epsilon Eridani were the two targets of Frank Drake’s Project Ozma in 1960 - the first deliberate search for radio signals from another civilisation.',
    ],
    sources: [
      NASA_ARCHIVE,
      { label: 'Feng et al. 2017 - Tau Ceti signals (AJ)', url: 'https://iopscience.iop.org/article/10.3847/1538-3881/aa5f5' },
      GAIA,
      SIMBAD,
    ],
  },

  // ---------------------------------------------------------------------- 9 --
  {
    id: 'gj-1061',
    name: 'GJ 1061',
    aliases: ['L 372-58', 'LHS 1565', 'Gliese 1061'],
    distanceLy: 11.9836,
    parallaxMas: 272.1615,
    parallaxSource: 'Gaia DR3 via SIMBAD',
    raDeg: 53.99875,
    decDeg: -44.51270,
    properMotion: [745.65, -373.32],
    radialVelocityKms: 1.04,
    constellation: 'Horologium',
    color: 0xff8f5e,
    stars: [
      {
        id: 'gj-1061',
        name: 'GJ 1061',
        spectral: 'M5.5 V',
        massSun: 0.12,
        radiusSun: 0.156,
        tempK: 2953,
        luminositySun: 0.0017,
        magV: 13.07,
        rotationDays: 125,
        ageGyr: 7.0,
        color: 0xff8552,
        note: 'A tiny, slow-rotating red dwarf with about a tenth of the Sun’s mass. Its long rotation period marks it as old and magnetically settled.',
      },
    ],
    planets: [
      {
        id: 'gj-1061-b', name: 'GJ 1061 b', letter: 'b', status: 'confirmed',
        periodDays: 3.2073, semiMajorAU: 0.021, eccentricity: 0.05,
        radiusEarth: 1.04, radiusEstimated: true, massEarth: 1.11, massKind: 'Mass',
        eqTempK: 388, insolationEarth: 3.80,
        discoveryYear: 2020, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO La Silla / HARPS',
        note: 'A hot Earth-mass world well inside the habitable zone’s inner edge.',
      },
      {
        id: 'gj-1061-c', name: 'GJ 1061 c', letter: 'c', status: 'confirmed',
        periodDays: 6.6821, semiMajorAU: 0.0342, eccentricity: 0.02,
        radiusEarth: 1.19, radiusEstimated: true, massEarth: 1.81, massKind: 'Mass',
        eqTempK: 304, insolationEarth: 1.40,
        discoveryYear: 2020, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO La Silla / HARPS',
        note: 'Right at the hot edge of the habitable zone, receiving about 40% more light than Earth.',
      },
      {
        id: 'gj-1061-d', name: 'GJ 1061 d', letter: 'd', status: 'confirmed',
        periodDays: 13.066, semiMajorAU: 0.054, eccentricity: 0.04,
        radiusEarth: 1.16, radiusEstimated: true, massEarth: 1.67, massKind: 'Mass',
        eqTempK: 242, insolationEarth: 0.60,
        discoveryYear: 2020, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO La Silla / HARPS',
        note: 'Inside the conservative habitable zone, taking about 60% of Earth’s starlight - comparable to Mars in the Solar System.',
      },
    ],
    tagline: 'Three low-mass planets, one in the habitable zone',
    overview:
      'GJ 1061 is a small, old red dwarf twelve light-years away with three planets packed into orbits shorter than a fortnight. The outermost, GJ 1061 d, receives about as much starlight as Mars gets from the Sun - which places it inside the conservative habitable zone.',
    interestingFact:
      'All three planets orbit closer to their star than Mercury does to the Sun, yet the outer one is a temperate world. That is what a star radiating 0.17% of the Sun’s output does to the geometry: the habitable zone moves in to a few hundredths of an AU.',
    sources: [
      NASA_ARCHIVE,
      { label: 'Dreizler et al. 2020 - GJ 1061 planets (MNRAS)', url: 'https://academic.oup.com/mnras/article/493/1/536/5695718' },
      GAIA,
    ],
  },

  // --------------------------------------------------------------------- 10 --
  {
    id: 'teegardens-star',
    name: "Teegarden's Star",
    aliases: ['GAT 1370', 'SO J025300.5+165258', 'Teegarden'],
    distanceLy: 12.4966,
    parallaxMas: 260.9884,
    parallaxSource: 'Gaia DR3 via SIMBAD',
    raDeg: 43.25372,
    decDeg: 16.88129,
    properMotion: [3429.08, -3805.54],
    radialVelocityKms: 63.0,
    constellation: 'Aries',
    color: 0xff7f52,
    stars: [
      {
        id: 'teegardens-star',
        name: "Teegarden's Star",
        spectral: 'M7 V',
        massSun: 0.097,
        radiusSun: 0.12,
        tempK: 3034,
        luminositySun: 0.000722,
        magV: 15.13,
        rotationDays: 96.2,
        ageGyr: 8.0,
        color: 0xff7847,
        note: 'One of the smallest stars known - barely above the mass where hydrogen fusion can start at all. It was only discovered in 2003, despite being twelve light-years away.',
      },
    ],
    planets: [
      {
        id: 'teegarden-b', name: "Teegarden's Star b", letter: 'b', status: 'confirmed',
        periodDays: 4.90634, semiMajorAU: 0.0259, eccentricity: 0.03,
        radiusEarth: 1.05, radiusEstimated: true, massEarth: 1.16, massKind: 'Msini',
        eqTempK: 277, insolationEarth: 1.08,
        discoveryYear: 2019, discoveryMethod: 'Radial Velocity', discoveryFacility: 'Calar Alto / CARMENES',
        note: 'Receives almost exactly Earth’s dose of starlight, and has one of the highest Earth Similarity Index scores of any known planet.',
      },
      {
        id: 'teegarden-c', name: "Teegarden's Star c", letter: 'c', status: 'confirmed',
        periodDays: 11.416, semiMajorAU: 0.0455, eccentricity: 0.04,
        radiusEarth: 1.02, radiusEstimated: true, massEarth: 1.05, massKind: 'Msini',
        eqTempK: 209, insolationEarth: 0.35,
        discoveryYear: 2019, discoveryMethod: 'Radial Velocity', discoveryFacility: 'Calar Alto / CARMENES',
        note: 'An Earth-mass planet inside the habitable zone, receiving about a third of Earth’s starlight.',
      },
      {
        id: 'teegarden-d', name: "Teegarden's Star d", letter: 'd', status: 'confirmed',
        periodDays: 26.13, semiMajorAU: 0.0791, eccentricity: 0.07,
        radiusEarth: 0.954, radiusEstimated: true, massEarth: 0.82, massKind: 'Msini',
        eqTempK: 159, insolationEarth: 0.12,
        discoveryYear: 2024, discoveryMethod: 'Radial Velocity', discoveryFacility: 'Calar Alto / CARMENES',
        note: 'A cold sub-Earth beyond the outer edge of the habitable zone, added to the system in 2024.',
      },
    ],
    tagline: 'Three Earth-mass planets around a barely-a-star',
    overview:
      'Teegarden\'s Star is close to the smallest a star can be and still fuse hydrogen: a tenth of the Sun’s mass, radiating less than a thousandth of its light. It was missed by every survey until 2003. Three planets, all around an Earth mass, have since been found around it.',
    interestingFact:
      'Teegarden b and c are the two highest-scoring planets on the Earth Similarity Index of anything found so far. That index compares size, density and temperature only - it says nothing about whether either has air, water, or a magnetic field, none of which has been measured.',
    extras: [
      'Seen from Teegarden’s Star, the Solar System lies almost exactly edge-on: an observer there would watch Earth transit the Sun.',
    ],
    sources: [
      NASA_ARCHIVE,
      { label: 'Zechmeister et al. 2019 - CARMENES discovery (A&A)', url: 'https://www.aanda.org/articles/aa/full_html/2019/07/aa35460-19/aa35460-19.html' },
      GAIA,
    ],
  },

  // --------------------------------------------------------------------- 11 --
  {
    id: 'wolf-1061',
    name: 'Wolf 1061',
    aliases: ['GJ 628', 'BD-12 4523', 'HIP 80824', 'V2306 Ophiuchi'],
    distanceLy: 14.0500,
    parallaxMas: 232.139,
    parallaxSource: 'Gaia DR3 via SIMBAD',
    raDeg: 247.57524,
    decDeg: -12.66259,
    properMotion: [-94.21, -1183.92],
    radialVelocityKms: -21.17,
    constellation: 'Ophiuchus',
    color: 0xff9d68,
    stars: [
      {
        id: 'wolf-1061',
        name: 'Wolf 1061',
        spectral: 'M3 V',
        massSun: 0.294,
        radiusSun: 0.307,
        tempK: 3342,
        luminositySun: 0.0102,
        magV: 10.07,
        rotationDays: 95,
        color: 0xff9660,
        note: 'A quiet mid-M dwarf about a third of the Sun’s mass, with a slow 95-day rotation that marks it as magnetically calm.',
      },
    ],
    planets: [
      {
        id: 'wolf-1061-b', name: 'Wolf 1061 b', letter: 'b', status: 'confirmed',
        periodDays: 4.8869, semiMajorAU: 0.0375, eccentricity: 0.15,
        radiusEarth: 1.21, radiusEstimated: true, massEarth: 1.91, massKind: 'Msini',
        eqTempK: 461, insolationEarth: 7.34,
        discoveryYear: 2015, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO La Silla / HARPS',
        note: 'A hot super-Earth on a five-day orbit.',
      },
      {
        id: 'wolf-1061-c', name: 'Wolf 1061 c', letter: 'c', status: 'confirmed',
        periodDays: 17.8719, semiMajorAU: 0.089, eccentricity: 0.11,
        radiusEarth: 1.66, radiusEstimated: true, massEarth: 3.41, massKind: 'Msini',
        eqTempK: 299, insolationEarth: 1.30,
        discoveryYear: 2015, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO La Silla / HARPS',
        note: 'A super-Earth sitting right at the hot edge of the habitable zone - the system’s most-studied planet.',
        uncertainty:
          'It straddles the inner boundary: whether it is temperate or a runaway greenhouse depends on an atmosphere nobody has measured.',
      },
      {
        id: 'wolf-1061-d', name: 'Wolf 1061 d', letter: 'd', status: 'confirmed',
        periodDays: 217.21, semiMajorAU: 0.47, eccentricity: 0.55,
        radiusEarth: 2.69, radiusEstimated: true, massEarth: 7.70, massKind: 'Msini',
        eqTempK: 130, insolationEarth: 0.06,
        discoveryYear: 2015, discoveryMethod: 'Radial Velocity', discoveryFacility: 'ESO La Silla / HARPS',
        note: 'A cold mini-Neptune on a markedly elliptical orbit - its distance from the star more than triples over each seven-month year.',
      },
    ],
    tagline: 'Three planets, one straddling the habitable zone',
    overview:
      'Wolf 1061 is a calm red dwarf fourteen light-years away with three planets of increasing size and decreasing temperature. The middle one, Wolf 1061 c, sits almost exactly on the inner boundary of its star’s habitable zone.',
    interestingFact:
      'Wolf 1061 c is the closest planet to us that sits on the habitable zone’s edge rather than safely inside it. That makes it a natural test case: whether a world there stays temperate or boils depends entirely on its atmosphere - which is precisely what we cannot yet measure.',
    sources: [
      NASA_ARCHIVE,
      { label: 'Wright et al. 2016 - Wolf 1061 planets (ApJ)', url: 'https://iopscience.iop.org/article/10.3847/0004-637X/817/1/L20' },
      GAIA,
    ],
  },

  // --------------------------------------------------------------------- 12 --
  {
    id: 'gj-876',
    name: 'GJ 876',
    aliases: ['Gliese 876', 'IL Aquarii', 'BD-15 6290', 'HIP 113020', 'Ross 780'],
    distanceLy: 15.2385,
    parallaxMas: 214.038,
    parallaxSource: 'Gaia DR3 via SIMBAD',
    raDeg: 343.31972,
    decDeg: -14.26370,
    properMotion: [957.72, -673.60],
    radialVelocityKms: -1.47,
    constellation: 'Aquarius',
    color: 0xffa878,
    stars: [
      {
        id: 'gj-876',
        name: 'GJ 876',
        spectral: 'M3.5 V',
        massSun: 0.32,
        radiusSun: 0.30,
        tempK: 3294,
        luminositySun: 0.0124,
        magV: 10.19,
        color: 0xffa06c,
        note: 'A red dwarf a third of the Sun’s mass carrying two gas giants - an architecture that was not supposed to exist around stars this small.',
      },
    ],
    planets: [
      {
        id: 'gj-876-d', name: 'GJ 876 d', letter: 'd', status: 'confirmed',
        periodDays: 1.93778, semiMajorAU: 0.02081, eccentricity: 0.207,
        radiusEarth: 2.51, radiusEstimated: true, massEarth: 6.83, massKind: 'Mass',
        eqTempK: 603, insolationEarth: 28.64,
        discoveryYear: 2005, discoveryMethod: 'Radial Velocity', discoveryFacility: 'Keck / HIRES',
        note: 'A scorched super-Earth completing a year every 46 hours. When found in 2005 it was the lowest-mass planet known around a normal star.',
      },
      {
        id: 'gj-876-c', name: 'GJ 876 c', letter: 'c', status: 'confirmed',
        periodDays: 30.0881, semiMajorAU: 0.12959, eccentricity: 0.256,
        radiusEarth: 14.0, radiusEstimated: true, massEarth: 226.98, massKind: 'Mass',
        eqTempK: 242, insolationEarth: 0.738,
        discoveryYear: 2000, discoveryMethod: 'Radial Velocity', discoveryFacility: 'Keck / HIRES',
        note: 'A 0.71-Jupiter-mass giant, and the inner member of the resonant chain. It sits inside the habitable zone - as a gas giant, which is not the same thing as being habitable.',
      },
      {
        id: 'gj-876-b', name: 'GJ 876 b', letter: 'b', status: 'confirmed',
        periodDays: 61.1166, semiMajorAU: 0.20832, eccentricity: 0.032,
        radiusEarth: 13.3, radiusEstimated: true, massEarth: 723.22, massKind: 'Mass',
        eqTempK: 191, insolationEarth: 0.286,
        discoveryYear: 1998, discoveryMethod: 'Radial Velocity', discoveryFacility: 'Keck / HIRES + ESO CAT',
        note: 'The system’s heavyweight at 2.3 Jupiter masses, and the first giant planet ever found around a red dwarf.',
      },
      {
        id: 'gj-876-e', name: 'GJ 876 e', letter: 'e', status: 'confirmed',
        periodDays: 124.26, semiMajorAU: 0.3343, eccentricity: 0.055,
        radiusEarth: 3.92, radiusEstimated: true, massEarth: 14.6, massKind: 'Mass',
        eqTempK: 150, insolationEarth: 0.111,
        discoveryYear: 2010, discoveryMethod: 'Radial Velocity', discoveryFacility: 'Keck / HIRES',
        note: 'A cold Uranus-mass planet, and the outermost link in the resonance.',
      },
    ],
    tagline: 'Two gas giants locked in a Laplace resonance',
    overview:
      'GJ 876 was the first red dwarf found to host a giant planet, and it turned out to host two. Three of its four planets - c, b and e - are locked in a 1:2:4 Laplace resonance, the same kind of gravitational lockstep that binds Io, Europa and Ganymede at Jupiter.',
    interestingFact:
      'The resonance here is not a static coincidence: the three planets actively exchange angular momentum, and the pattern librates on a decade timescale. It is the only extrasolar Laplace resonance close enough that we have watched it evolve over a full cycle.',
    extras: [
      'The two giants both orbit within the star’s habitable zone. Neither has a surface; whether either has a large moon is entirely unknown.',
    ],
    sources: [
      NASA_ARCHIVE,
      { label: 'Rivera et al. 2010 - the Laplace resonance (ApJ)', url: 'https://iopscience.iop.org/article/10.1088/0004-637X/719/1/890' },
      GAIA,
    ],
  },

  // --------------------------------------------------------------------- 13 --
  {
    id: 'trappist-1',
    name: 'TRAPPIST-1',
    aliases: ['2MASS J23062928-0502285', '2MASSW J2306292-050227', 'Trappist'],
    distanceLy: 40.6605,
    parallaxMas: 80.2123,
    parallaxSource: 'Gaia DR3 via SIMBAD',
    raDeg: 346.62237,
    decDeg: -5.04140,
    properMotion: [930.79, -479.04],
    radialVelocityKms: -52.0,
    constellation: 'Aquarius',
    color: 0xff7a4a,
    stars: [
      {
        id: 'trappist-1',
        name: 'TRAPPIST-1',
        spectral: 'M8 V',
        massSun: 0.0898,
        radiusSun: 0.1192,
        tempK: 2566,
        luminositySun: 0.000553,
        magV: 18.8,
        rotationDays: 3.3,
        ageGyr: 7.6,
        color: 0xff6f3c,
        note: 'An ultracool dwarf barely larger than Jupiter, radiating about 0.05% of the Sun’s light. Its whole planetary system would fit inside Mercury’s orbit.',
      },
    ],
    planets: [
      {
        id: 'trappist-1b', name: 'TRAPPIST-1b', letter: 'b', status: 'confirmed',
        periodDays: 1.510826, semiMajorAU: 0.01154, eccentricity: 0.00622, inclinationDeg: 89.728,
        radiusEarth: 1.116, massEarth: 1.374, massKind: 'Mass', densityGcm3: 5.442,
        eqTempK: 397.6, insolationEarth: 4.153,
        discoveryYear: 2016, discoveryMethod: 'Transit', discoveryFacility: 'TRAPPIST (La Silla)',
        note: 'JWST measured its dayside in 2023 and found no thick atmosphere - the surface appears to be bare rock at about 230 °C.',
      },
      {
        id: 'trappist-1c', name: 'TRAPPIST-1c', letter: 'c', status: 'confirmed',
        periodDays: 2.421937, semiMajorAU: 0.0158, eccentricity: 0.00654, inclinationDeg: 89.778,
        radiusEarth: 1.097, massEarth: 1.308, massKind: 'Mass', densityGcm3: 5.464,
        eqTempK: 339.7, insolationEarth: 2.214,
        discoveryYear: 2016, discoveryMethod: 'Transit', discoveryFacility: 'TRAPPIST (La Silla)',
        note: 'JWST ruled out a thick Venus-like CO₂ atmosphere here in 2023.',
      },
      {
        id: 'trappist-1d', name: 'TRAPPIST-1d', letter: 'd', status: 'confirmed',
        periodDays: 4.049219, semiMajorAU: 0.02227, eccentricity: 0.00837, inclinationDeg: 89.896,
        radiusEarth: 0.788, massEarth: 0.388, massKind: 'Mass', densityGcm3: 4.367,
        eqTempK: 286.2, insolationEarth: 1.115,
        discoveryYear: 2016, discoveryMethod: 'Transit', discoveryFacility: 'TRAPPIST (La Silla)',
        note: 'The lightest of the seven, sitting just inside the hot edge of the habitable zone.',
      },
      {
        id: 'trappist-1e', name: 'TRAPPIST-1e', letter: 'e', status: 'confirmed',
        periodDays: 6.101013, semiMajorAU: 0.02925, eccentricity: 0.0051, inclinationDeg: 89.793,
        radiusEarth: 0.920, massEarth: 0.692, massKind: 'Mass', densityGcm3: 4.902,
        eqTempK: 249.7, insolationEarth: 0.646,
        discoveryYear: 2017, discoveryMethod: 'Transit', discoveryFacility: 'Spitzer + TRAPPIST',
        note: 'The most Earth-like of the seven by size, density and starlight received - and squarely inside the conservative habitable zone. It is JWST’s highest-priority target in the system.',
        uncertainty:
          'Being in the habitable zone means it receives the right amount of starlight. It does not mean the planet has water, air, or is habitable - none of that has been measured.',
      },
      {
        id: 'trappist-1f', name: 'TRAPPIST-1f', letter: 'f', status: 'confirmed',
        periodDays: 9.20754, semiMajorAU: 0.03849, eccentricity: 0.01007, inclinationDeg: 89.740,
        radiusEarth: 1.045, massEarth: 1.039, massKind: 'Mass', densityGcm3: 5.023,
        eqTempK: 217.7, insolationEarth: 0.373,
        discoveryYear: 2017, discoveryMethod: 'Transit', discoveryFacility: 'Spitzer + TRAPPIST',
        note: 'Inside the habitable zone, with a density low enough to suggest a substantial water content.',
      },
      {
        id: 'trappist-1g', name: 'TRAPPIST-1g', letter: 'g', status: 'confirmed',
        periodDays: 12.352446, semiMajorAU: 0.04683, eccentricity: 0.00208, inclinationDeg: 89.742,
        radiusEarth: 1.129, massEarth: 1.321, massKind: 'Mass', densityGcm3: 5.056,
        eqTempK: 197.3, insolationEarth: 0.252,
        discoveryYear: 2017, discoveryMethod: 'Transit', discoveryFacility: 'Spitzer + TRAPPIST',
        note: 'The largest of the seven, at the cold edge of the habitable zone.',
      },
      {
        id: 'trappist-1h', name: 'TRAPPIST-1h', letter: 'h', status: 'confirmed',
        periodDays: 18.772866, semiMajorAU: 0.06189, eccentricity: 0.00567, inclinationDeg: 89.805,
        radiusEarth: 0.755, massEarth: 0.326, massKind: 'Mass', densityGcm3: 4.163,
        eqTempK: 171.7, insolationEarth: 0.144,
        discoveryYear: 2017, discoveryMethod: 'Transit', discoveryFacility: 'Spitzer (K2 confirmation)',
        note: 'The outermost planet, colder than any of the others and beyond the habitable zone.',
      },
    ],
    tagline: 'Seven Earth-sized planets, three in the habitable zone',
    overview:
      'TRAPPIST-1 is the most thoroughly characterised planetary system outside our own. Seven roughly Earth-sized planets transit an ultracool dwarf star, which means their sizes were measured directly and their masses were extracted from the way they tug each other off schedule. Three - e, f and g - lie inside the conservative habitable zone.',
    interestingFact:
      'All seven planets are locked into a resonant chain: for every two orbits of h, g completes three, f four, e six, d nine, c fifteen and b twenty-four. Such a chain can only survive if the planets migrated inward together through a gas disk, and the pattern has held for billions of years since.',
    extras: [
      'The whole system is more compact than Jupiter’s moons: every orbit fits inside 0.07 AU, about a sixth of Mercury’s distance from the Sun.',
      'Standing on TRAPPIST-1e, the neighbouring planets would appear larger in the sky than our Moon does from Earth.',
      'JWST has so far found no thick atmosphere on b or c. The habitable-zone planets are harder to measure and the results are not yet in.',
    ],
    sources: [
      NASA_ARCHIVE,
      { label: 'NASA - TRAPPIST-1 system', url: 'https://science.nasa.gov/mission/webb/trappist-1/' },
      { label: 'Agol et al. 2021 - masses from transit timing (PSJ)', url: 'https://iopscience.iop.org/article/10.3847/PSJ/abd022' },
      { label: 'Gillon et al. 2017 - seven planets (Nature)', url: 'https://www.nature.com/articles/nature21360' },
      GAIA,
    ],
  },
];

const systemById = new Map(STAR_SYSTEMS.map((s) => [s.id, s]));
const systemByPlanetId = new Map<string, StarSystem>();
const planetById = new Map<string, Exoplanet>();
const systemByStarId = new Map<string, StarSystem>();
const starById = new Map<string, HostStar>();

for (const sys of STAR_SYSTEMS) {
  for (const p of sys.planets) {
    systemByPlanetId.set(p.id, sys);
    planetById.set(p.id, p);
  }
  for (const s of sys.stars) {
    systemByStarId.set(s.id, sys);
    starById.set(s.id, s);
  }
}

export function starSystem(id: string): StarSystem | undefined {
  return systemById.get(id);
}

export function exoplanet(id: string): Exoplanet | undefined {
  return planetById.get(id);
}

export function systemOfPlanet(id: string): StarSystem | undefined {
  return systemByPlanetId.get(id);
}

export function hostStar(id: string): HostStar | undefined {
  return starById.get(id);
}

export function systemOfStar(id: string): StarSystem | undefined {
  return systemByStarId.get(id);
}

/** The star a system's planets orbit. */
export function primaryStar(sys: StarSystem): HostStar {
  if (sys.planetHostId) {
    const s = sys.stars.find((x) => x.id === sys.planetHostId);
    if (s) return s;
  }
  return sys.stars[0];
}

/** Planets that are archive-confirmed, as opposed to disputed or candidate. */
export function confirmedPlanets(sys: StarSystem): Exoplanet[] {
  return sys.planets.filter((p) => p.status === 'confirmed');
}

/**
 * Size class from measured (or, for RV planets, estimated) radius. The
 * boundaries follow the conventional exoplanet vocabulary: the radius valley
 * near 1.8 R⊕ separates rocky planets from those that kept a hydrogen envelope,
 * and 4 R⊕ is roughly where Neptune-class worlds begin.
 */
export function planetClass(p: Exoplanet): PlanetClass {
  const r = p.radiusEarth ?? estimateRadiusEarth(p.massEarth ?? 1);
  if (r >= 8) return 'gas-giant';
  if (r >= 3.5) return 'ice-giant';
  if (r >= 1.8) return 'sub-neptune';
  if (r >= 1.25) return 'super-earth';
  if (r >= 0.8) return 'earth-sized';
  return 'sub-earth';
}

export const PLANET_CLASS_LABEL: Record<PlanetClass, string> = {
  'sub-earth': 'Sub-Earth',
  'earth-sized': 'Earth-sized',
  'super-earth': 'Super-Earth',
  'sub-neptune': 'Sub-Neptune',
  'ice-giant': 'Ice giant',
  'gas-giant': 'Gas giant',
};

/** Chen & Kipping (2017)-style broken power law, only used as a last resort. */
function estimateRadiusEarth(massEarth: number): number {
  if (massEarth < 2.04) return Math.pow(massEarth, 0.279);
  if (massEarth < 131.6) return 0.808 * Math.pow(massEarth, 0.589);
  return 17.7 * Math.pow(massEarth, -0.044);
}

export const STAR_SYSTEM_SOURCES: SourceRef[] = [
  NASA_ARCHIVE,
  { label: 'NASA Exoplanet Exploration', url: 'https://science.nasa.gov/exoplanets/' },
  GAIA,
  SIMBAD,
  { label: 'Kopparapu et al. 2014 - habitable zone limits', url: 'https://iopscience.iop.org/article/10.1088/2041-8205/787/2/L29' },
];
