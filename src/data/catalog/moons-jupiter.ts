/**
 * The four Galilean moons of Jupiter: Io, Europa, Ganymede and Callisto.
 *
 * Values from the NASA Jovian Satellite Fact Sheet (nssdc.gsfc.nasa.gov),
 * JPL Solar System Dynamics satellite elements (ssd.jpl.nasa.gov) and the
 * NASA Solar System Exploration pages. Orbits are rendered as circles at
 * the mean orbital distance; real eccentricities are small.
 */
import type { CatalogObject } from '../types';

export const JUPITER_MOONS: CatalogObject[] = [
  {
    id: 'io',
    name: 'Io',
    type: 'moon',
    category: 'Galilean moon',
    parent: 'jupiter',
    color: 0xdcc05a,
    physical: {
      diameterKm: 3643,
      massKg: 8.93e22,
      gravity: 1.8,
      density: 3.53,
      tidallyLocked: true,
      tempMeanC: -130,
      tempRangeC: [-183, 1600],
      albedo: 0.63,
    },
    satOrbit: { distanceKm: 421_800, periodDays: 1.7691 },
    positionAccuracy: 'approximate',
    atmosphere: 'A thin, patchy sulfur-dioxide atmosphere, fed by volcanoes and frost.',
    composition: 'Silicate rock around a molten iron-sulfide core; the surface is coated in sulfur and sulfur-dioxide frost.',
    discovery: { by: 'Galileo Galilei', year: 1610, how: 'one of the first astronomical telescopes' },
    overview:
      'Io is the most volcanically active world in the Solar System - a yellow-orange moon splashed with sulfur, where hundreds of volcanoes erupt lava and launch plumes hundreds of kilometres high. It is the innermost Galilean moon, and Jupiter’s gravity gives it no rest.',
    concept: {
      title: 'Tidal heating: gravity as an oven',
      text: 'Io is caught between Jupiter’s enormous pull and the rhythmic tugs of Europa and Ganymede, which keep its orbit slightly eccentric. As its distance from Jupiter varies, the moon’s solid body flexes by tens of metres every orbit. That constant kneading generates friction heat - enough to melt rock and power all its volcanoes without any sunlight at all.',
    },
    quickFacts: [
      'Over 400 active volcanoes make it the most volcanically active body known.',
      'Volcanic plumes rise as high as 500 km in the weak gravity and near-vacuum.',
      'Its surface repaves itself so fast that Io has essentially no impact craters.',
    ],
    missionIds: ['galileo', 'voyager1', 'voyager2', 'juno'],
    related: ['jupiter', 'europa', 'ganymede', 'callisto'],
    sources: [
      { label: 'NASA Jupiter Moons - Io', url: 'https://science.nasa.gov/jupiter/moons/io/' },
      { label: 'NASA Jovian Satellite Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html' },
    ],
    texture: {
      file: 'io.webp',
      kind: 'photo',
      credit: 'NASA/JPL/USGS (Galileo SSI / Voyager color merge)',
    },
    uncertainty:
      'Volcanic vents reach roughly 1600 °C, while the ordinary surface stays near -130 °C; the upper end of the range applies only at active hot spots.',
  },
  {
    id: 'europa',
    name: 'Europa',
    type: 'moon',
    category: 'Galilean moon',
    parent: 'jupiter',
    color: 0xd6c1a3,
    physical: {
      diameterKm: 3122,
      massKg: 4.8e22,
      gravity: 1.31,
      density: 3.01,
      tidallyLocked: true,
      tempMeanC: -160,
      albedo: 0.67,
    },
    satOrbit: { distanceKm: 671_100, periodDays: 3.5512 },
    positionAccuracy: 'approximate',
    atmosphere: 'A tenuous oxygen exosphere, produced as radiation splits water ice on the surface.',
    composition: 'A rocky interior with an iron core, wrapped in a ~100 km layer of water - an ice shell over a salty liquid ocean.',
    discovery: { by: 'Galileo Galilei', year: 1610, how: 'one of the first astronomical telescopes' },
    overview:
      'Europa is a smooth white-tan ice world criss-crossed by reddish-brown cracks, hiding a global ocean of salty liquid water beneath its frozen shell. That ocean - kept liquid by tidal heating - makes Europa one of the most promising places to look for life beyond Earth.',
    concept: {
      title: 'An ocean you cannot see',
      text: 'How do you find an ocean under kilometres of ice? The Galileo spacecraft noticed that Jupiter’s rotating magnetic field induces a magnetic response in Europa - exactly what a shell of electrically conducting salty water would do. Combined with the moon’s young, cracked, nearly craterless surface, the evidence points to a global liquid ocean beneath the ice.',
    },
    quickFacts: [
      'Its ocean may hold twice as much liquid water as all of Earth’s oceans combined.',
      'The ice shell is thought to be roughly 15-25 km thick, over an ocean tens of kilometres deep.',
      'Its surface is one of the smoothest and youngest in the Solar System - a few tens of millions of years old.',
    ],
    missionIds: ['galileo', 'voyager2', 'juno', 'europaclipper'],
    related: ['jupiter', 'io', 'ganymede', 'callisto', 'enceladus'],
    sources: [
      { label: 'NASA Jupiter Moons - Europa', url: 'https://science.nasa.gov/jupiter/moons/europa/' },
      { label: 'NASA Jovian Satellite Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html' },
    ],
    texture: {
      file: 'europa.webp',
      kind: 'tinted',
      credit: 'NASA/JPL/USGS (Galileo SSI / Voyager)',
      note: 'Grayscale global mosaic, display-tinted to Europa’s pale tan.',
    },
  },
  {
    id: 'ganymede',
    name: 'Ganymede',
    type: 'moon',
    category: 'Galilean moon',
    parent: 'jupiter',
    color: 0x9d8f7c,
    physical: {
      diameterKm: 5268,
      massKg: 1.48e23,
      gravity: 1.43,
      density: 1.94,
      tidallyLocked: true,
      tempMeanC: -160,
      albedo: 0.43,
    },
    satOrbit: { distanceKm: 1_070_400, periodDays: 7.1546 },
    positionAccuracy: 'approximate',
    atmosphere: 'A very thin oxygen exosphere, detected by the Hubble Space Telescope.',
    composition: 'Roughly half rock and half water ice, fully layered: a molten iron core, rocky mantle, and thick shells of ice - likely with a salty ocean sandwiched between them.',
    discovery: { by: 'Galileo Galilei', year: 1610, how: 'one of the first astronomical telescopes' },
    overview:
      'Ganymede is the largest moon in the Solar System - bigger than the planet Mercury - with a surface split between dark, ancient cratered terrain and lighter bands of grooved ice. It is also the only moon known to generate its own magnetic field.',
    concept: {
      title: 'A moon with its own magnetic shield',
      text: 'Deep inside Ganymede, molten iron churns and acts as a dynamo, generating a magnetic field - something no other moon is known to do. That field carves out a small magnetic bubble inside Jupiter’s vast one, complete with its own auroras. The way those auroras rock back and forth, seen by Hubble, revealed a salty ocean buried under the ice.',
    },
    quickFacts: [
      'It is larger than Mercury, yet has less than half of Mercury’s mass.',
      'It is the only moon known to generate its own magnetic field.',
      'Its aurora behaviour points to a salty ocean roughly 150 km beneath the surface.',
    ],
    missionIds: ['galileo', 'voyager1', 'voyager2', 'juno'],
    related: ['jupiter', 'io', 'europa', 'callisto'],
    sources: [
      { label: 'NASA Jupiter Moons - Ganymede', url: 'https://science.nasa.gov/jupiter/moons/ganymede/' },
      { label: 'NASA Jovian Satellite Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html' },
    ],
    texture: {
      file: 'ganymede.webp',
      kind: 'photo',
      credit: 'NASA/JPL/USGS (Voyager / Galileo SSI color mosaic)',
    },
  },
  {
    id: 'callisto',
    name: 'Callisto',
    type: 'moon',
    category: 'Galilean moon',
    parent: 'jupiter',
    color: 0x84776a,
    physical: {
      diameterKm: 4821,
      massKg: 1.08e23,
      gravity: 1.24,
      density: 1.83,
      tidallyLocked: true,
      tempMeanC: -140,
      albedo: 0.22,
    },
    satOrbit: { distanceKm: 1_882_700, periodDays: 16.689 },
    positionAccuracy: 'approximate',
    atmosphere: 'An extremely tenuous exosphere of carbon dioxide and oxygen.',
    composition: 'A jumbled mix of rock and water ice, only partially separated into layers - a sign its interior never fully melted.',
    discovery: { by: 'Galileo Galilei', year: 1610, how: 'one of the first astronomical telescopes' },
    overview:
      'Callisto is the outermost Galilean moon, a dark, battered ball of ice and rock saturated with craters. While its siblings were volcanically or tectonically remade, Callisto has barely changed in four billion years - it is the Solar System’s best-preserved fossil surface.',
    concept: {
      title: 'What a dead world teaches us',
      text: 'Callisto orbits far enough from Jupiter to escape the tidal kneading that heats Io and Europa, so its interior never got the energy to reshape the surface. Every crater since the era of heavy bombardment is still there, one on top of another. When a surface is saturated with craters like this, it is a clock: it records the entire impact history of the outer Solar System.',
    },
    quickFacts: [
      'Its surface is about 4 billion years old - among the oldest terrain in the Solar System.',
      'Valhalla, its largest impact basin, spans roughly 3,800 km of concentric rings.',
      'It orbits outside Jupiter’s harshest radiation belts, making it a candidate site for a future crewed base.',
    ],
    missionIds: ['galileo', 'voyager1', 'voyager2'],
    related: ['jupiter', 'io', 'europa', 'ganymede'],
    sources: [
      { label: 'NASA Jupiter Moons - Callisto', url: 'https://science.nasa.gov/jupiter/moons/callisto/' },
      { label: 'NASA Jovian Satellite Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html' },
    ],
    texture: {
      file: 'callisto.webp',
      kind: 'tinted',
      credit: 'NASA/JPL/USGS (Galileo SSI / Voyager)',
      note: 'Grayscale global mosaic, display-tinted.',
    },
  },
];
