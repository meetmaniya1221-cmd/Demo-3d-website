/**
 * Deep-sky highlights: famous Messier objects + the galactic centre.
 *
 * Positions are J2000; distances and classifications follow the NASA/ESA
 * Hubble Messier Catalog. These render as markers on the celestial sphere
 * (directions are real; the sphere is a visualization - the objects are
 * hundreds to millions of light-years beyond it).
 */

export type DsoType =
  | 'spiral galaxy'
  | 'elliptical galaxy'
  | 'emission nebula'
  | 'planetary nebula'
  | 'supernova remnant'
  | 'open cluster'
  | 'globular cluster'
  | 'galactic centre';

export interface DeepSkyObject {
  id: string;
  /** Messier designation, e.g. "M31" (empty for non-Messier entries). */
  m: string;
  name: string;
  type: DsoType;
  raH: number;
  decDeg: number;
  distanceLy: number;
  mag?: number;
  constellation: string;
  note: string;
}

export const DEEP_SKY: DeepSkyObject[] = [
  { id: 'm31', m: 'M31', name: 'Andromeda Galaxy', type: 'spiral galaxy', raH: 0.712, decDeg: 41.27, distanceLy: 2.5e6, mag: 3.4, constellation: 'Andromeda', note: 'The nearest large galaxy - a trillion stars, visible to the naked eye from a dark site. It and the Milky Way will merge in ~4.5 billion years.' },
  { id: 'm33', m: 'M33', name: 'Triangulum Galaxy', type: 'spiral galaxy', raH: 1.564, decDeg: 30.66, distanceLy: 2.73e6, mag: 5.7, constellation: 'Triangulum', note: 'The third-largest galaxy of our Local Group, face-on and full of star-forming regions.' },
  { id: 'm42', m: 'M42', name: 'Orion Nebula', type: 'emission nebula', raH: 5.588, decDeg: -5.39, distanceLy: 1344, mag: 4.0, constellation: 'Orion', note: 'The nearest massive star factory - the fuzzy "star" in Orion’s sword. Hundreds of infant stars with planet-forming disks live inside.' },
  { id: 'm45', m: 'M45', name: 'Pleiades', type: 'open cluster', raH: 3.79, decDeg: 24.12, distanceLy: 444, mag: 1.6, constellation: 'Taurus', note: 'The Seven Sisters - a young cluster ~100 million years old, drifting through a wisp of interstellar dust.' },
  { id: 'm44', m: 'M44', name: 'Beehive Cluster', type: 'open cluster', raH: 8.67, decDeg: 19.98, distanceLy: 577, mag: 3.7, constellation: 'Cancer', note: 'Known since antiquity as a naked-eye "little cloud"; Galileo’s telescope resolved it into stars in 1609.' },
  { id: 'm13', m: 'M13', name: 'Great Hercules Cluster', type: 'globular cluster', raH: 16.695, decDeg: 36.46, distanceLy: 22200, mag: 5.8, constellation: 'Hercules', note: 'A ball of several hundred thousand ancient stars - target of the 1974 Arecibo message.' },
  { id: 'm22', m: 'M22', name: 'Sagittarius Cluster', type: 'globular cluster', raH: 18.61, decDeg: -23.9, distanceLy: 10600, mag: 5.1, constellation: 'Sagittarius', note: 'One of the nearest and brightest globulars, seen toward the galactic bulge.' },
  { id: 'm8', m: 'M8', name: 'Lagoon Nebula', type: 'emission nebula', raH: 18.06, decDeg: -24.38, distanceLy: 4100, mag: 6.0, constellation: 'Sagittarius', note: 'A glowing stellar nursery a hundred light-years across, faintly visible to the naked eye.' },
  { id: 'm16', m: 'M16', name: 'Eagle Nebula', type: 'emission nebula', raH: 18.31, decDeg: -13.81, distanceLy: 7000, mag: 6.4, constellation: 'Serpens', note: 'Home of the "Pillars of Creation" made famous by Hubble - towers of gas where stars are being born.' },
  { id: 'm1', m: 'M1', name: 'Crab Nebula', type: 'supernova remnant', raH: 5.575, decDeg: 22.01, distanceLy: 6500, mag: 8.4, constellation: 'Taurus', note: 'Wreckage of a supernova Chinese astronomers watched in 1054 AD; a pulsar spinning 30 times a second powers its glow.' },
  { id: 'm27', m: 'M27', name: 'Dumbbell Nebula', type: 'planetary nebula', raH: 19.99, decDeg: 22.72, distanceLy: 1360, mag: 7.4, constellation: 'Vulpecula', note: 'The shed outer layers of a dying Sun-like star - a preview of our Sun’s fate in ~5 billion years.' },
  { id: 'm57', m: 'M57', name: 'Ring Nebula', type: 'planetary nebula', raH: 18.895, decDeg: 33.03, distanceLy: 2570, mag: 8.8, constellation: 'Lyra', note: 'The classic smoke-ring of a dying star, glowing around a white-dwarf ember.' },
  { id: 'm51', m: 'M51', name: 'Whirlpool Galaxy', type: 'spiral galaxy', raH: 13.5, decDeg: 47.19, distanceLy: 3.1e7, mag: 8.4, constellation: 'Canes Venatici', note: 'The first "spiral nebula" ever recognised (1845) - now seen mid-collision with a smaller companion galaxy.' },
  { id: 'm81', m: 'M81', name: "Bode's Galaxy", type: 'spiral galaxy', raH: 9.93, decDeg: 69.07, distanceLy: 1.18e7, mag: 6.9, constellation: 'Ursa Major', note: 'A grand-design spiral bright enough for binoculars, gravitationally sparring with the Cigar Galaxy next door.' },
  { id: 'm87', m: 'M87', name: 'Virgo A', type: 'elliptical galaxy', raH: 12.514, decDeg: 12.39, distanceLy: 5.3e7, mag: 8.6, constellation: 'Virgo', note: 'A giant elliptical whose central black hole starred in the first-ever black hole image (Event Horizon Telescope, 2019).' },
  { id: 'm104', m: 'M104', name: 'Sombrero Galaxy', type: 'spiral galaxy', raH: 12.67, decDeg: -11.62, distanceLy: 3.0e7, mag: 8.0, constellation: 'Virgo', note: 'A galaxy seen edge-on, its dark dust lane rimming a brilliant bulge like a hat brim.' },
  { id: 'sgra', m: '', name: 'Sagittarius A*', type: 'galactic centre', raH: 17.761, decDeg: -29.01, distanceLy: 26000, constellation: 'Sagittarius', note: 'The Milky Way’s own supermassive black hole - 4 million solar masses - imaged by the Event Horizon Telescope in 2022. When you look here, you look at the centre of our galaxy.' },
];

export const DEEP_SKY_SOURCES = [
  {
    label: 'NASA/ESA Hubble Messier Catalog',
    url: 'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/',
  },
];
