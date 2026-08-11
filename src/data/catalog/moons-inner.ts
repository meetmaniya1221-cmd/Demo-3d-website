/**
 * Moons of the inner Solar System: Earth's Moon and the two moons of Mars.
 *
 * Values from the NASA Planetary Fact Sheets (nssdc.gsfc.nasa.gov) and the
 * NASA Solar System Exploration pages. Orbits are rendered as circles at the
 * mean orbital distance; real eccentricities of these moons are small.
 */
import type { CatalogObject } from '../types';

export const INNER_MOONS: CatalogObject[] = [
  {
    id: 'moon',
    name: 'The Moon',
    type: 'moon',
    category: 'Moon of Earth',
    parent: 'earth',
    color: 0xc9c9c9,
    physical: {
      diameterKm: 3475,
      massKg: 7.35e22,
      gravity: 1.62,
      density: 3.34,
      rotationHours: 655.7,
      tidallyLocked: true,
      axialTiltDeg: 6.7,
      tempMeanC: -23,
      tempRangeC: [-173, 127],
      albedo: 0.12,
    },
    satOrbit: { distanceKm: 384_400, periodDays: 27.322 },
    positionAccuracy: 'approximate',
    atmosphere: 'Essentially none - a vanishingly thin exosphere of argon, helium and sodium.',
    composition: 'Rocky, with a small iron core; the crust is anorthosite highlands and basalt maria.',
    overview:
      'The Moon is Earth’s constant companion, most likely born when a Mars-sized body struck the young Earth and the debris coalesced in orbit. It stabilises Earth’s tilt and raises the ocean tides.',
    concept: {
      title: 'Why we only see one side',
      text: 'The Moon rotates exactly once per orbit - 27.3 days for both. Earth’s gravity slowed its spin until the two locked together. That is why the same face always points at us: it IS rotating, just in perfect sync.',
    },
    quickFacts: [
      'It is drifting away from Earth by ~3.8 cm per year.',
      'Its gravity is 1/6 of Earth’s - you could jump six times higher.',
      '12 people have walked on it, all between 1969 and 1972.',
    ],
    missionIds: ['apollo11', 'lro', 'artemis1'],
    related: ['earth'],
    sources: [
      { label: 'NASA Moon Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html' },
    ],
    texture: {
      file: 'moon.webp',
      kind: 'photo',
      credit: 'NASA mission imagery via Solar System Scope (CC BY 4.0)',
    },
  },
  {
    id: 'phobos',
    name: 'Phobos',
    type: 'moon',
    category: 'Moon of Mars',
    parent: 'mars',
    color: 0xa8968a,
    physical: {
      diameterKm: 22.2,
      dimensionsKm: '27 × 22 × 18',
      massKg: 1.06e16,
      gravity: 0.0057,
      density: 1.86,
      tidallyLocked: true,
      tempMeanC: -40,
      albedo: 0.07,
    },
    satOrbit: { distanceKm: 9_378, periodDays: 0.3189 },
    positionAccuracy: 'approximate',
    atmosphere: 'None.',
    composition: 'Porous carbon-rich rock, similar to a captured asteroid or re-accreted impact debris.',
    discovery: { by: 'Asaph Hall', year: 1877, how: 'US Naval Observatory 26-inch refractor' },
    overview:
      'Phobos is a lumpy, cratered rock just 27 km long that circles Mars three times a day - faster than Mars itself rotates. From the Martian surface it rises in the west and sets in the east, twice a day.',
    concept: {
      title: 'A moon on a countdown',
      text: 'Phobos orbits so close that Mars’ tides are dragging it inward by about 1.8 metres per century. In roughly 50 million years it will either crash into Mars or be torn apart into a short-lived ring.',
    },
    quickFacts: [
      'It orbits closer to its planet than any other known moon - just 6,000 km above the surface.',
      'Its largest crater, Stickney, is 9 km across - nearly half the moon’s width.',
      'Gravity is so weak you could throw a ball into orbit around it.',
    ],
    missionIds: ['viking1', 'marsexpress'],
    related: ['mars', 'deimos'],
    sources: [
      { label: 'NASA Mars Moons - Phobos', url: 'https://science.nasa.gov/mars/moons/phobos/' },
      { label: 'NASA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
    ],
    texture: {
      file: 'phobos.webp',
      kind: 'photo',
      credit: 'ESA/DLR/FU Berlin (Mars Express SRC) / NASA / USGS',
      note: 'Global mosaic wrapped on a sphere; the real Phobos is markedly non-spherical.',
    },
  },
  {
    id: 'deimos',
    name: 'Deimos',
    type: 'moon',
    category: 'Moon of Mars',
    parent: 'mars',
    color: 0xb5a494,
    physical: {
      diameterKm: 12.6,
      dimensionsKm: '15 × 12 × 11',
      massKg: 1.5e15,
      gravity: 0.003,
      density: 1.47,
      tidallyLocked: true,
      tempMeanC: -40,
      albedo: 0.07,
    },
    satOrbit: { distanceKm: 23_459, periodDays: 1.2624 },
    positionAccuracy: 'approximate',
    atmosphere: 'None.',
    composition: 'Carbon-rich rock and regolith; smoother than Phobos, its craters softened by dust.',
    discovery: { by: 'Asaph Hall', year: 1877, how: 'US Naval Observatory 26-inch refractor' },
    overview:
      'Deimos is the smaller and farther of Mars’ two moons, a 12-km rock that takes 30 hours to circle the planet. From Mars it would look like a bright star that takes 2.7 days to cross the sky.',
    concept: {
      title: 'Captured or built in place?',
      text: 'Both Martian moons look like carbon-rich asteroids, yet they orbit neatly in Mars’ equatorial plane - hard to explain by capture. They may instead have re-accreted from debris blasted off Mars by a giant impact.',
    },
    quickFacts: [
      'Escape velocity is ~5.6 m/s - a good sprinter could nearly jump off.',
      'Unlike doomed Phobos, Deimos is slowly spiralling away from Mars.',
      'Its name means "dread"; Phobos means "fear" - the horses of the war god Ares.',
    ],
    missionIds: ['viking1'],
    related: ['mars', 'phobos'],
    sources: [
      { label: 'NASA Mars Moons - Deimos', url: 'https://science.nasa.gov/mars/moons/deimos/' },
      { label: 'NASA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
    ],
    texture: {
      file: 'deimos.webp',
      kind: 'photo',
      credit: 'NASA/JPL/USGS (Viking Orbiter)',
      note: 'Global mosaic wrapped on a sphere; the real Deimos is markedly non-spherical.',
    },
  },
];
