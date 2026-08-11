/**
 * Asteroids and the great regions of the Solar System: the main belt,
 * the Kuiper Belt and the (hypothesised) Oort Cloud.
 *
 * Physical values from the NASA Planetary Fact Sheets (nssdc.gsfc.nasa.gov),
 * NASA Solar System Exploration (science.nasa.gov) and the JPL Small-Body
 * Database (ssd.jpl.nasa.gov). Orbital elements are perihelion-passage
 * elements in the JPL SBDB style, converted via `elementsFromPerihelion`;
 * rendered positions are approximate.
 */
import type { CatalogObject } from '../types';
import { elementsFromPerihelion } from './util';

export const ASTEROIDS: CatalogObject[] = [
  {
    id: 'vesta',
    name: 'Vesta',
    type: 'asteroid',
    category: 'Main-belt asteroid',
    parent: 'sun',
    color: 0xb8ab97,
    physical: {
      diameterKm: 525,
      dimensionsKm: '573 × 557 × 446',
      massKg: 2.6e20,
      gravity: 0.25,
      density: 3.46,
      rotationHours: 5.34,
      albedo: 0.42,
    },
    orbit: elementsFromPerihelion({
      a: 2.362,
      e: 0.0889,
      i: 7.14,
      node: 103.8,
      argPeri: 150.9,
      tpJD: 2459575,
      periodDays: 1326,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None.',
    composition: 'Differentiated rock: an iron core, olivine mantle and basaltic lava crust - a planet in miniature.',
    discovery: { by: 'Heinrich Wilhelm Olbers', year: 1807, how: 'visual telescope search from Bremen' },
    overview:
      'Vesta is the second-most-massive body in the asteroid belt and a genuine protoplanet: it melted early, separated into an iron core, rocky mantle and basaltic crust, and then simply stopped growing. NASA’s Dawn spacecraft orbited it in 2011-12 and mapped a battered world of ancient lava plains, deep troughs and one colossal impact basin, Rheasilvia, at its south pole.',
    concept: {
      title: 'Meteorites with a return address',
      text: 'The HED meteorites - howardites, eucrites and diogenites - match Vesta’s surface spectrum so closely that scientists were confident of their origin decades before Dawn arrived. They are debris blasted out of the Rheasilvia basin. Vesta is the only asteroid we can study both from orbit and in the laboratory: we literally hold pieces of it.',
    },
    quickFacts: [
      'It is the brightest asteroid in our sky - at its best it is faintly visible to the naked eye.',
      'The central peak of the Rheasilvia basin rises roughly 20 km, rivalling Olympus Mons on Mars.',
      'Roughly 1 in 20 meteorites that fall to Earth is a chip knocked off Vesta.',
    ],
    missionIds: ['dawn'],
    related: ['ceres', 'pallas', 'main-belt'],
    sources: [
      { label: 'NASA Science - 4 Vesta', url: 'https://science.nasa.gov/solar-system/asteroids/4-vesta/' },
      { label: 'JPL Small-Body Database - 4 Vesta', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=4' },
    ],
    texture: {
      file: 'vesta.webp',
      kind: 'photo',
      credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA (Dawn FC)',
    },
  },
  {
    id: 'pallas',
    name: 'Pallas',
    type: 'asteroid',
    category: 'Main-belt asteroid',
    parent: 'sun',
    color: 0x9aa0a6,
    physical: {
      diameterKm: 512,
      massKg: 2.0e20,
      density: 2.9,
      rotationHours: 7.81,
      albedo: 0.16,
    },
    orbit: elementsFromPerihelion({
      a: 2.773,
      e: 0.2299,
      i: 34.93,
      node: 172.9,
      argPeri: 310.7,
      tpJD: 2460382,
      periodDays: 1686,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None.',
    composition: 'B-type: dark, water-altered silicate rock, similar to carbonaceous chondrite meteorites.',
    discovery: { by: 'Heinrich Wilhelm Olbers', year: 1802, how: 'spotted while tracking the newly discovered Ceres' },
    overview:
      'Pallas is the third-largest asteroid, found in 1802 by Olbers while he was following the newly discovered Ceres. Its orbit is tilted almost 35° to the plane of the planets, so it plunges through the asteroid belt at steep angles - and its heavily cratered surface, battered like a golf ball, shows the violent consequences.',
    concept: {
      title: 'An orbit that keeps visitors away',
      text: 'Spacecraft ride the ecliptic - the flat plane where the planets orbit - because changing orbital planes costs enormous amounts of fuel. Pallas spends most of its time far above or below that plane, which is why the third-largest asteroid has never had a visitor while smaller, better-placed bodies have been orbited, sampled and landed on.',
    },
    quickFacts: [
      'Its orbit is inclined nearly 35° - by far the steepest of the large asteroids.',
      'It was the second asteroid ever discovered, and for decades was counted as a planet.',
      'It is the largest asteroid that no spacecraft has ever visited.',
    ],
    related: ['ceres', 'vesta', 'main-belt'],
    sources: [
      { label: 'NASA Asteroid Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/asteroidfact.html' },
      { label: 'JPL Small-Body Database - 2 Pallas', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=2' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No spacecraft has visited Pallas and only blurred telescope images exist; this rendering is artistic.',
    },
  },
  {
    id: 'hygiea',
    name: 'Hygiea',
    type: 'asteroid',
    category: 'Main-belt asteroid',
    parent: 'sun',
    color: 0x7d7469,
    physical: {
      diameterKm: 434,
      massKg: 8.7e19,
      density: 1.9,
      rotationHours: 13.8,
      albedo: 0.07,
    },
    orbit: elementsFromPerihelion({
      a: 3.142,
      e: 0.112,
      i: 3.83,
      node: 283.2,
      argPeri: 312.3,
      tpJD: 2459470,
      periodDays: 2034,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None.',
    composition: 'C-type: primitive, carbon-rich rock with water-bearing minerals.',
    discovery: { by: 'Annibale de Gasparis', year: 1849, how: 'Naples Observatory refractor' },
    overview:
      'Hygiea is the fourth-largest object in the asteroid belt, a dark carbon-rich world that reflects barely 7% of the sunlight falling on it. Sharp adaptive-optics images taken in 2019 revealed a surprisingly round shape, hinting that an ancient impact shattered it completely and the debris re-assembled into a near-sphere.',
    concept: {
      title: 'Round does not make you a planet',
      text: 'A dwarf planet is defined partly by being massive enough for gravity to pull it round - and Hygiea appears nearly as round as Ceres, probably because it re-accreted from rubble after a shattering collision. It is a reminder that our neat categories - asteroid, dwarf planet - are labels stretched over a messy continuum of real objects.',
    },
    quickFacts: [
      'It is the fourth-largest body in the asteroid belt, after Ceres, Vesta and Pallas.',
      'It reflects only about 7% of incoming sunlight - darker than asphalt.',
      'It heads the Hygiea family, thousands of fragments from the same ancient collision.',
    ],
    related: ['ceres', 'vesta', 'main-belt'],
    sources: [
      { label: 'NASA Asteroid Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/asteroidfact.html' },
      { label: 'JPL Small-Body Database - 10 Hygiea', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=10' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No detailed imagery of Hygiea exists - only low-resolution telescope views; this rendering is artistic.',
    },
    uncertainty:
      'Hygiea’s rotation period was revised from 27.6 h to 13.8 h by 2019 adaptive-optics imaging; its mass and density remain approximate.',
  },
  {
    id: 'psyche',
    name: 'Psyche',
    type: 'asteroid',
    category: 'Main-belt asteroid (metallic)',
    parent: 'sun',
    color: 0xb0a79b,
    physical: {
      diameterKm: 226,
      dimensionsKm: '278 × 238 × 171',
      massKg: 2.3e19,
      rotationHours: 4.2,
      albedo: 0.12,
    },
    orbit: elementsFromPerihelion({
      a: 2.924,
      e: 0.134,
      i: 3.1,
      node: 150.0,
      argPeri: 229.7,
      tpJD: 2459772,
      periodDays: 1826,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None.',
    composition: 'Metal-rich: iron and nickel mixed with silicate rock; the exact proportions are unknown.',
    discovery: { by: 'Annibale de Gasparis', year: 1852, how: 'Naples Observatory refractor' },
    overview:
      'Psyche is unlike almost anything else in the belt: a 226-km body whose surface appears rich in bare metal rather than rock or ice. It may be the exposed iron core of a shattered protoplanet whose rocky layers were stripped away by collisions - or a strange metal-rich body that never fit the textbook categories at all.',
    concept: {
      title: 'A planetary core in plain sight?',
      text: 'Earth’s iron core lies beneath 2,900 km of rock, forever out of reach - no mission will ever visit it. If Psyche really is the battered core of a protoplanet, it offers something extraordinary: a chance to orbit and study the kind of metal world that hides at the centre of every rocky planet, including our own.',
    },
    quickFacts: [
      'Radar echoes from Psyche are unusually strong - the fingerprint of a metal-rich surface.',
      'NASA’s Psyche spacecraft launched in 2023 and arrives in 2029, the first mission to a metal world.',
      'It spins once every 4.2 hours - a very short day for so large a body.',
    ],
    missionIds: ['psyche-mission'],
    related: ['vesta', 'main-belt'],
    sources: [
      { label: 'NASA Science - 16 Psyche', url: 'https://science.nasa.gov/solar-system/asteroids/16-psyche/' },
      { label: 'JPL Small-Body Database - 16 Psyche', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=16' },
    ],
    texture: {
      kind: 'procedural',
      note: 'Psyche has never been seen up close; this rendering is artistic until NASA’s Psyche orbiter arrives in 2029.',
    },
    uncertainty:
      'Psyche’s density and metal content are only loosely constrained until NASA’s Psyche orbiter measures them directly.',
  },
  {
    id: 'eros',
    name: 'Eros',
    type: 'asteroid',
    category: 'Near-Earth asteroid (Amor)',
    parent: 'sun',
    color: 0xc2a37e,
    physical: {
      diameterKm: 17,
      dimensionsKm: '34 × 11 × 11',
      massKg: 6.69e15,
      density: 2.67,
      rotationHours: 5.27,
      albedo: 0.25,
    },
    orbit: elementsFromPerihelion({
      a: 1.458,
      e: 0.2227,
      i: 10.83,
      node: 304.3,
      argPeri: 178.9,
      tpJD: 2459873,
      periodDays: 643,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None.',
    composition: 'S-type: stony silicate rock (olivine and pyroxene) laced with metal grains.',
    discovery: { by: 'Gustav Witt', year: 1898, how: 'photographic plates, Urania Observatory, Berlin' },
    overview:
      'Eros is a peanut-shaped rock 34 km long and the first near-Earth asteroid ever discovered. In 2000 NASA’s NEAR Shoemaker probe became the first spacecraft to orbit an asteroid, and in February 2001, though it was never designed to land, it touched down so gently on Eros that it kept transmitting from the surface.',
    concept: {
      title: 'First contact with an asteroid',
      text: 'Orbiting a small, lumpy body is genuinely hard: Eros’ gravity field is so irregular that NEAR Shoemaker’s orbit had to be constantly redesigned around it. The techniques worked out at Eros - navigating, orbiting and finally touching down on a low-gravity world - opened the way for every later asteroid mission, from Hayabusa to OSIRIS-REx.',
    },
    quickFacts: [
      'NEAR Shoemaker orbited Eros for a year, then landed on it in February 2001 - a first, twice over.',
      'It was the first near-Earth asteroid ever found, spotted on photographic plates in 1898.',
      'Escape velocity is only about 10 m/s - a thrown baseball would leave forever.',
    ],
    related: ['bennu', 'ryugu'],
    sources: [
      { label: 'NASA Asteroid Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/asteroidfact.html' },
      { label: 'JPL Small-Body Database - 433 Eros', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=433' },
    ],
    texture: {
      kind: 'procedural',
      note: 'Artistic rendering; NEAR Shoemaker mapped the real, elongated Eros in detail, but no global map is bundled here.',
    },
  },
  {
    id: 'bennu',
    name: 'Bennu',
    type: 'asteroid',
    category: 'Near-Earth asteroid (Apollo)',
    parent: 'sun',
    color: 0x6e6a66,
    physical: {
      diameterKm: 0.49,
      massKg: 7.33e10,
      density: 1.19,
      rotationHours: -4.3,
      albedo: 0.044,
    },
    orbit: elementsFromPerihelion({
      a: 1.126,
      e: 0.2037,
      i: 6.03,
      node: 2.06,
      argPeri: 66.22,
      tpJD: 2459159,
      periodDays: 437,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None.',
    composition: 'B-type carbonaceous rubble: water-bearing clays and carbon compounds, with much of its volume empty space.',
    discovery: { by: 'LINEAR survey', year: 1999, how: 'automated near-Earth-asteroid search telescope' },
    overview:
      'Bennu is a half-kilometre rubble pile - a loose heap of boulders barely held together by its own feeble gravity, on an orbit that brings it near Earth every six years. NASA’s OSIRIS-REx collected a sample from it in 2020 and dropped the capsule into the Utah desert in 2023, delivering pristine material as old as the Solar System itself.',
    concept: {
      title: 'A flying rubble pile',
      text: 'Bennu is not a solid rock. When OSIRIS-REx pressed its sampling arm against the surface, the ground gave way like a ball pit and the arm sank half a metre - the asteroid is a floating heap of 4.6-billion-year-old debris, reassembled from an older shattered body. Most small asteroids are probably built this way, which matters enormously for any future attempt to deflect one.',
    },
    quickFacts: [
      'OSIRIS-REx returned 121.6 g of Bennu to Earth in September 2023.',
      'It has about a 1-in-2,700 chance of hitting Earth on 24 September 2182 - meaning it almost certainly misses.',
      'Its surface is so weak that the sampling arm sank half a metre in, as if into a ball pit.',
    ],
    missionIds: ['osirisrex'],
    related: ['ryugu', 'eros'],
    sources: [
      { label: 'NASA Science - 101955 Bennu', url: 'https://science.nasa.gov/solar-system/asteroids/101955-bennu/' },
      { label: 'JPL Small-Body Database - 101955 Bennu', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=bennu' },
    ],
    texture: {
      file: 'bennu.webp',
      kind: 'photo',
      credit: 'NASA/Goddard/University of Arizona (OSIRIS-REx)',
    },
  },
  {
    id: 'ryugu',
    name: 'Ryugu',
    type: 'asteroid',
    category: 'Near-Earth asteroid (Apollo)',
    parent: 'sun',
    color: 0x5f5a55,
    physical: {
      diameterKm: 0.9,
      massKg: 4.5e11,
      density: 1.19,
      rotationHours: -7.63,
      albedo: 0.045,
    },
    orbit: elementsFromPerihelion({
      a: 1.19,
      e: 0.19,
      i: 5.88,
      node: 251.6,
      argPeri: 211.4,
      tpJD: 2459340,
      periodDays: 474,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None.',
    composition: 'C-type carbonaceous rubble: clays, carbonates and organic molecules; highly porous throughout.',
    discovery: { by: 'LINEAR survey', year: 1999, how: 'automated near-Earth-asteroid search telescope' },
    overview:
      'Ryugu is a kilometre-wide, diamond-shaped rubble pile so dark it reflects less than 5% of the sunlight that hits it. Japan’s Hayabusa2 spacecraft orbited it in 2018-19, fired a copper projectile into it to expose fresh material, and brought samples home that turned out to hold water-bearing minerals and the building blocks of life.',
    concept: {
      title: 'Sunlight can spin an asteroid',
      text: 'Ryugu’s spinning-top shape, with its raised equatorial ridge, is thought to be a relic of a time when it spun much faster and material migrated toward the equator. The likely culprit is sunlight itself: photons absorbed and re-emitted unevenly from a lumpy surface exert a tiny torque - the YORP effect - that over millions of years can spin a small asteroid up or slow it down.',
    },
    quickFacts: [
      'Hayabusa2 returned 5.4 g of Ryugu in December 2020 - the first large sample of a carbon-rich asteroid.',
      'Its samples contain amino acids and even uracil, one of the four building blocks of RNA.',
      'It reflects only ~4.5% of incoming light - about as dark as charcoal.',
    ],
    missionIds: ['hayabusa2'],
    related: ['bennu', 'eros'],
    sources: [
      { label: 'NASA Science - Asteroid Facts', url: 'https://science.nasa.gov/solar-system/asteroids/facts/' },
      { label: 'JPL Small-Body Database - 162173 Ryugu', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=ryugu' },
    ],
    texture: {
      file: 'ryugu.webp',
      kind: 'photo',
      credit:
        'JAXA/University of Tokyo/Kochi U./Rikkyo U./Nagoya U./Chiba Inst. Tech./Meiji U./U. Aizu/AIST (Hayabusa2)',
    },
  },
  {
    id: 'didymos',
    name: 'Didymos',
    type: 'asteroid',
    category: 'Near-Earth asteroid (binary)',
    parent: 'sun',
    color: 0x9a8f80,
    physical: {
      diameterKm: 0.78,
      massKg: 5.3e11,
      rotationHours: 2.26,
      albedo: 0.15,
      moons: 1,
    },
    orbit: elementsFromPerihelion({
      a: 1.643,
      e: 0.384,
      i: 3.41,
      node: 73.2,
      argPeri: 319.3,
      tpJD: 2459900,
      periodDays: 770,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None.',
    composition: 'Silicate rock (S-type); a fast-spinning top shape with a tiny moon, Dimorphos.',
    discovery: { by: 'Spacewatch (Kitt Peak)', year: 1996 },
    overview:
      'Didymos is a 780-metre near-Earth asteroid orbited by a 151-metre moonlet, Dimorphos - and that little moon is now famous: in September 2022 NASA’s DART spacecraft deliberately crashed into it, the first-ever test of deflecting an asteroid.',
    concept: {
      title: 'Planetary defence, tested for real',
      text: 'DART hit Dimorphos at 6.1 km/s and shortened its orbit around Didymos by about 32 minutes - far more than predicted, because the ejected debris acted like a rocket plume. It proved that with enough warning, a small impactor really can nudge an asteroid off a collision course.',
    },
    quickFacts: [
      'Dimorphos is the first celestial body whose orbit humans have measurably changed.',
      'Didymos spins in just 2.26 hours - near the limit before a rubble pile flies apart.',
      'ESA’s Hera spacecraft is en route to survey the aftermath up close in late 2026.',
    ],
    missionIds: ['dart'],
    related: ['bennu', 'ryugu', 'eros'],
    sources: [
      { label: 'NASA Science - DART', url: 'https://science.nasa.gov/mission/dart/' },
      { label: 'JPL Small-Body Database - 65803 Didymos', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=didymos' },
    ],
    texture: {
      kind: 'procedural',
      note: 'Rendered as a generic rocky body; DART and LICIACube imaged Didymos and Dimorphos only briefly during the 2022 encounter.',
    },
  },
];

export const REGIONS: CatalogObject[] = [
  {
    id: 'main-belt',
    name: 'Asteroid Belt',
    type: 'region',
    category: 'Main asteroid belt',
    parent: 'sun',
    color: 0x8a8378,
    physical: {
      diameterKm: 0,
      dimensionsKm: '2.1 – 3.3 AU from the Sun',
    },
    composition: 'Rocky and metallic bodies, from dwarf planet Ceres down to countless pebbles and dust grains.',
    overview:
      'Between the orbits of Mars and Jupiter circles a broad ring of rocky debris - the leftover building blocks of a planet that never formed, because Jupiter’s gravity kept stirring the material too violently for it to clump together. Its largest resident, Ceres, is a dwarf planet in its own right.',
    concept: {
      title: 'Mostly empty space',
      text: 'Movie asteroid fields are a myth. The belt holds over a million known asteroids, but they are spread through a volume so colossal that neighbouring rocks sit on average about a million kilometres apart. Every spacecraft that has crossed the belt has flown through without incident - and everything in it combined adds up to less than 4% of the Moon’s mass.',
    },
    quickFacts: [
      'More than a million asteroids have been catalogued, and the vast majority orbit here.',
      'Ceres alone holds about a third of the entire belt’s mass.',
      'It is not a destroyed planet - Jupiter’s gravity prevented one from ever forming there.',
    ],
    missionIds: ['dawn', 'lucy'],
    related: ['ceres', 'vesta', 'pallas', 'hygiea', 'psyche'],
    sources: [
      { label: 'NASA Science - Asteroids', url: 'https://science.nasa.gov/solar-system/asteroids/' },
      { label: 'NASA Science - Asteroid Facts', url: 'https://science.nasa.gov/solar-system/asteroids/facts/' },
    ],
    uncertainty: 'Listed size is the belt’s radial extent from the Sun, not a body diameter.',
  },
  {
    id: 'kuiper-belt',
    name: 'Kuiper Belt',
    type: 'region',
    category: 'Trans-Neptunian belt',
    parent: 'sun',
    color: 0x7fa3c0,
    physical: {
      diameterKm: 0,
      dimensionsKm: '30 – 50 AU',
    },
    composition: 'Icy bodies of frozen water, methane, ammonia and nitrogen mixed with rock and dark organic material.',
    overview:
      'Beyond Neptune lies a vast doughnut-shaped zone of icy leftovers from the Solar System’s birth - the Kuiper Belt. Pluto is its most famous resident, sharing the region with dwarf planets like Haumea, Makemake and Quaoar, plus hundreds of thousands of smaller frozen worlds that have barely changed in 4.6 billion years.',
    concept: {
      title: 'The comet nursery next door',
      text: 'When Neptune’s gravity nudges a Kuiper Belt object onto a plunging orbit, it can end up as a short-period comet like 67P - one that returns predictably every few years or decades. The belt is a deep-freeze archive: because it is so cold and collisions are rare, its ices preserve the original material of the solar nebula better than anywhere planets exist.',
    },
    quickFacts: [
      'It likely holds hundreds of thousands of icy bodies larger than 100 km across.',
      'It is roughly 20 times as wide as the asteroid belt, and far more massive.',
      'New Horizons flew past Pluto in 2015, then the small belt object Arrokoth in 2019.',
    ],
    missionIds: ['newhorizons'],
    related: ['pluto', 'eris', 'haumea', 'makemake', 'quaoar', 'oort-cloud'],
    sources: [
      { label: 'NASA Science - Kuiper Belt', url: 'https://science.nasa.gov/solar-system/kuiper-belt/' },
      { label: 'NASA Science - Kuiper Belt Facts', url: 'https://science.nasa.gov/solar-system/kuiper-belt/facts/' },
    ],
    uncertainty: 'Listed size is the belt’s radial extent from the Sun, not a body diameter.',
  },
  {
    id: 'oort-cloud',
    name: 'Oort Cloud',
    type: 'region',
    category: 'Hypothesised comet reservoir',
    parent: 'sun',
    color: 0x9aa7b8,
    physical: {
      diameterKm: 0,
      dimensionsKm: '~2,000 – 100,000 AU (hypothesised)',
    },
    composition: 'Believed to be billions of icy bodies - dirty snowballs of frozen water, methane and ammonia.',
    overview:
      'Far beyond the planets, the Solar System is thought to be wrapped in an immense spherical shell of icy bodies - the Oort Cloud. It marks the true edge of the Sun’s domain, its outer reaches extending perhaps halfway to the nearest star, and it is where the great long-period comets like Hale-Bopp come from.',
    concept: {
      title: 'A sphere, not a disc',
      text: 'Everything from the planets to the Kuiper Belt orbits in a flattened disc, yet long-period comets like Hale-Bopp arrive from every direction in the sky. That is the giveaway: their source must be a spherical cloud - icy bodies scattered outward by the giant planets long ago, then puffed into a shell by the tugs of passing stars and the tide of the galaxy itself.',
    },
    quickFacts: [
      'Comets falling in from it can take millions of years to complete a single orbit.',
      'Voyager 1, the fastest outbound spacecraft, will take about 300 years just to reach its inner edge.',
      'Its outer edge may lie 100,000 AU out - a significant fraction of the way to the next star.',
    ],
    related: ['halebopp', 'sedna', 'kuiper-belt'],
    sources: [
      { label: 'NASA Science - Oort Cloud', url: 'https://science.nasa.gov/solar-system/oort-cloud/' },
      { label: 'NASA Science - Oort Cloud Facts', url: 'https://science.nasa.gov/solar-system/oort-cloud/facts/' },
    ],
    uncertainty:
      'The Oort cloud has never been observed directly; its existence is inferred from long-period comet orbits.',
  },
];
