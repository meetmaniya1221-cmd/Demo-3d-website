/**
 * Stellar neighbourhood + famous bright stars, for the Observatory.
 *
 * Distances: Hipparcos/Gaia parallaxes as published via NASA; the nearest-star
 * list follows the RECONS census. Multi-star systems are listed once at the
 * system's distance. Deneb's distance is genuinely uncertain and says so.
 */

export interface NearStar {
  id: string;
  name: string;
  raH: number;
  decDeg: number;
  distanceLy: number;
  spectral: string;
  /** apparent visual magnitude (combined for close pairs) */
  mag: number;
  /** 'neighbourhood' = nearest stars census; 'bright' = famous naked-eye anchors */
  group: 'neighbourhood' | 'bright';
  note: string;
}

export const NEAR_STARS: NearStar[] = [
  // ---- the Sun's neighbourhood (nearest systems, RECONS census order)
  { id: 'proxima', name: 'Proxima Centauri', raH: 14.495, decDeg: -62.68, distanceLy: 4.25, spectral: 'M5.5V', mag: 11.13, group: 'neighbourhood', note: 'The closest star to the Sun. Hosts Proxima b, an Earth-mass planet in the habitable zone - though flares may scour it.' },
  { id: 'alphacen-ab', name: 'Alpha Centauri A+B', raH: 14.66, decDeg: -60.84, distanceLy: 4.37, spectral: 'G2V + K1V', mag: -0.27, group: 'neighbourhood', note: 'A Sun-like star and an orange companion orbiting each other every 80 years; the brightest of the three-star Alpha Centauri system.' },
  { id: 'barnard', name: "Barnard's Star", raH: 17.96, decDeg: 4.69, distanceLy: 5.96, spectral: 'M4V', mag: 9.51, group: 'neighbourhood', note: 'The fastest-moving star in our sky - it crosses a Moon-width in under 200 years. A sub-Earth planet was reported in 2024.' },
  { id: 'wolf359', name: 'Wolf 359', raH: 10.94, decDeg: 7.01, distanceLy: 7.86, spectral: 'M6V', mag: 13.54, group: 'neighbourhood', note: 'A dim red dwarf with just 9% of the Sun’s mass - 100× too faint for the naked eye despite being a neighbour.' },
  { id: 'lalande21185', name: 'Lalande 21185', raH: 11.06, decDeg: 35.97, distanceLy: 8.31, spectral: 'M2V', mag: 7.52, group: 'neighbourhood', note: 'The brightest red dwarf in the northern sky, still below naked-eye visibility.' },
  { id: 'sirius-ab', name: 'Sirius A+B', raH: 6.75, decDeg: -16.72, distanceLy: 8.66, spectral: 'A1V + DA2', mag: -1.46, group: 'neighbourhood', note: 'The brightest star in our night sky, with a white-dwarf companion - the burnt-out core of a star that died 120 million years ago.' },
  { id: 'luyten726-8', name: 'Luyten 726-8 (UV Ceti)', raH: 1.65, decDeg: -17.95, distanceLy: 8.79, spectral: 'M5.5V + M6V', mag: 12.54, group: 'neighbourhood', note: 'Twin flare stars: UV Ceti can brighten 5× in minutes when magnetic explosions rip its surface.' },
  { id: 'ross154', name: 'Ross 154', raH: 18.83, decDeg: -23.84, distanceLy: 9.71, spectral: 'M3.5V', mag: 10.44, group: 'neighbourhood', note: 'A young, flaring red dwarf in Sagittarius.' },
  { id: 'ross248', name: 'Ross 248', raH: 23.7, decDeg: 44.18, distanceLy: 10.29, spectral: 'M5.5V', mag: 12.29, group: 'neighbourhood', note: 'In ~36,000 years Voyager 2 will pass within 1.7 light-years of it.' },
  { id: 'epsiloneri', name: 'Epsilon Eridani', raH: 3.55, decDeg: -9.46, distanceLy: 10.48, spectral: 'K2V', mag: 3.73, group: 'neighbourhood', note: 'A young orange star with a dusty debris disk and a Jupiter-like planet - a favourite of science fiction.' },
  { id: 'lacaille9352', name: 'Lacaille 9352', raH: 23.1, decDeg: -35.85, distanceLy: 10.72, spectral: 'M0.5V', mag: 7.34, group: 'neighbourhood', note: 'A southern red dwarf with two confirmed super-Earths.' },
  { id: 'ross128', name: 'Ross 128', raH: 11.79, decDeg: 0.8, distanceLy: 11.01, spectral: 'M4V', mag: 11.13, group: 'neighbourhood', note: 'An unusually quiet red dwarf hosting Ross 128 b, a temperate Earth-sized planet.' },
  { id: '61cygni', name: '61 Cygni A+B', raH: 21.115, decDeg: 38.75, distanceLy: 11.4, spectral: 'K5V + K7V', mag: 5.2, group: 'neighbourhood', note: 'The first star whose distance was ever measured - Bessel’s 1838 parallax made the universe suddenly, measurably vast.' },
  { id: 'procyon-ab', name: 'Procyon A+B', raH: 7.655, decDeg: 5.22, distanceLy: 11.46, spectral: 'F5IV + DQZ', mag: 0.34, group: 'neighbourhood', note: 'A slightly evolved star with a faint white-dwarf companion; the 8th brightest star in our sky.' },
  { id: 'struve2398', name: 'Struve 2398 A+B', raH: 18.71, decDeg: 59.63, distanceLy: 11.49, spectral: 'M3V + M3.5V', mag: 8.9, group: 'neighbourhood', note: 'A well-separated pair of red dwarfs in Draco.' },
  { id: 'groombridge34', name: 'Groombridge 34 A+B', raH: 0.31, decDeg: 44.02, distanceLy: 11.62, spectral: 'M1.5V + M3.5V', mag: 8.08, group: 'neighbourhood', note: 'A red-dwarf pair in Andromeda; the primary hosts a super-Earth.' },
  { id: 'epsilonindi', name: 'Epsilon Indi', raH: 22.06, decDeg: -56.78, distanceLy: 11.87, spectral: 'K5V', mag: 4.83, group: 'neighbourhood', note: 'Hosts the coldest directly-imaged giant planet (JWST, 2024) plus a pair of brown dwarfs.' },
  { id: 'tauceti', name: 'Tau Ceti', raH: 1.735, decDeg: -15.94, distanceLy: 11.91, spectral: 'G8V', mag: 3.5, group: 'neighbourhood', note: 'The nearest single Sun-like star, with four candidate super-Earths - long a first stop in SETI searches.' },

  // ---- famous anchors farther out
  { id: 'vega', name: 'Vega', raH: 18.62, decDeg: 38.78, distanceLy: 25.0, spectral: 'A0V', mag: 0.03, group: 'bright', note: 'The northern summer beacon; the first star ever photographed, and the zero-point of the magnitude scale for a century.' },
  { id: 'altair', name: 'Altair', raH: 19.85, decDeg: 8.87, distanceLy: 16.7, spectral: 'A7V', mag: 0.76, group: 'bright', note: 'Spins in ~9 hours - so fast it is visibly flattened.' },
  { id: 'fomalhaut', name: 'Fomalhaut', raH: 22.96, decDeg: -29.62, distanceLy: 25.1, spectral: 'A4V', mag: 1.16, group: 'bright', note: 'Ringed by a spectacular debris disk imaged by Hubble and JWST.' },
  { id: 'pollux', name: 'Pollux', raH: 7.76, decDeg: 28.03, distanceLy: 33.8, spectral: 'K0III', mag: 1.14, group: 'bright', note: 'The nearest giant star, with a confirmed exoplanet.' },
  { id: 'arcturus', name: 'Arcturus', raH: 14.26, decDeg: 19.18, distanceLy: 36.7, spectral: 'K1.5III', mag: -0.05, group: 'bright', note: 'The brightest star of the northern celestial hemisphere - an old orange giant passing through our neighbourhood.' },
  { id: 'capella', name: 'Capella', raH: 5.28, decDeg: 45.99, distanceLy: 42.9, spectral: 'G8III + G0III', mag: 0.08, group: 'bright', note: 'Actually two yellow giants orbiting every 104 days.' },
  { id: 'aldebaran', name: 'Aldebaran', raH: 4.6, decDeg: 16.51, distanceLy: 65.3, spectral: 'K5III', mag: 0.86, group: 'bright', note: 'The Bull’s orange eye, foreground to the Hyades cluster.' },
  { id: 'regulus', name: 'Regulus', raH: 10.14, decDeg: 11.97, distanceLy: 79.3, spectral: 'B8IV', mag: 1.4, group: 'bright', note: 'Spins so fast it is egg-shaped, whirling once in 16 hours.' },
  { id: 'achernar', name: 'Achernar', raH: 1.63, decDeg: -57.24, distanceLy: 139, spectral: 'B6Vep', mag: 0.46, group: 'bright', note: 'The flattest star known - its equator bulges 35% wider than its poles.' },
  { id: 'spica', name: 'Spica', raH: 13.42, decDeg: -11.16, distanceLy: 250, spectral: 'B1V + B4V', mag: 0.97, group: 'bright', note: 'Two hot blue stars orbiting in just four days.' },
  { id: 'canopus', name: 'Canopus', raH: 6.4, decDeg: -52.7, distanceLy: 310, spectral: 'A9II', mag: -0.74, group: 'bright', note: 'The second-brightest star in our sky, ~10,000× the Sun’s luminosity; spacecraft use it as a navigation beacon.' },
  { id: 'polaris', name: 'Polaris', raH: 2.53, decDeg: 89.26, distanceLy: 433, spectral: 'F7Ib', mag: 1.98, group: 'bright', note: 'The North Star - a pulsating supergiant that happens to sit over Earth’s pole (for now; precession will move it on).' },
  { id: 'antares', name: 'Antares', raH: 16.49, decDeg: -26.43, distanceLy: 550, spectral: 'M1.5Iab', mag: 1.0, group: 'bright', note: 'A red supergiant ~700× the Sun’s width - placed at the Sun it would swallow Mars.' },
  { id: 'betelgeuse', name: 'Betelgeuse', raH: 5.92, decDeg: 7.41, distanceLy: 548, spectral: 'M1-2Ia', mag: 0.5, group: 'bright', note: 'A doomed red supergiant that will go supernova within ~100,000 years; its 2019 "Great Dimming" was a dust burp. Distance uncertain by ~90 ly.' },
  { id: 'rigel', name: 'Rigel', raH: 5.24, decDeg: -8.2, distanceLy: 860, spectral: 'B8Ia', mag: 0.13, group: 'bright', note: 'A blue supergiant ~120,000× the Sun’s luminosity, lighting the Witch Head Nebula.' },
  { id: 'deneb', name: 'Deneb', raH: 20.69, decDeg: 45.28, distanceLy: 2600, spectral: 'A2Ia', mag: 1.25, group: 'bright', note: 'Possibly the most distant star you can easily see - so luminous its true distance (1,500-2,600 ly) is still debated.' },
];

export const STAR_SOURCES = [
  { label: 'NASA - The Nearest Stars', url: 'https://science.nasa.gov/universe/stars/' },
  { label: 'RECONS nearest-star census', url: 'http://www.recons.org/' },
];
