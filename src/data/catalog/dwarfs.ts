/**
 * The five IAU-recognised dwarf planets, plus the largest trans-Neptunian
 * dwarf-planet candidates.
 *
 * Physical values from the NASA Solar System Exploration pages, the NASA
 * Pluto Fact Sheet (nssdc.gsfc.nasa.gov) and the JPL Small-Body Database.
 * Orbits use perihelion-passage elements from JPL SSD, converted with
 * elementsFromPerihelion; positions are approximate, not ephemeris-grade.
 */
import type { CatalogObject } from '../types';
import { elementsFromPerihelion } from './util';

export const DWARF_PLANETS: CatalogObject[] = [
  {
    id: 'ceres',
    aliases: ['1 Ceres'],
    name: 'Ceres',
    type: 'dwarf',
    category: 'Dwarf planet (asteroid belt)',
    parent: 'sun',
    color: 0x9b948b,
    physical: {
      diameterKm: 940,
      massKg: 9.4e20,
      gravity: 0.28,
      density: 2.16,
      rotationHours: 9.07,
      axialTiltDeg: 4,
      tempMeanC: -105,
      albedo: 0.09,
      moons: 0,
    },
    orbit: elementsFromPerihelion({
      a: 2.766,
      e: 0.0785,
      i: 10.59,
      node: 80.3,
      argPeri: 73.6,
      tpJD: 2459920,
      periodDays: 1682,
    }),
    positionAccuracy: 'approximate',
    atmosphere:
      'None to speak of - transient wisps of water vapour have been detected escaping from its surface.',
    composition:
      'A rocky interior under a water-rich crust of ice, clays and salts; roughly 25% of Ceres is water ice.',
    discovery: {
      by: 'Giuseppe Piazzi',
      year: 1801,
      how: 'Palermo Observatory, while charting stars - the first asteroid ever found',
    },
    overview:
      'Ceres is the largest object in the asteroid belt and the only dwarf planet of the inner Solar System - alone among the asteroids, its own gravity has pulled it into a sphere. NASA’s Dawn spacecraft orbited it in 2015-2018 and found a dark, cratered world punctuated by startling bright spots of salt.',
    concept: {
      title: 'Planet, asteroid, dwarf planet',
      text: 'Ceres has been reclassified twice without changing at all. Piazzi announced it as a planet in 1801; once dozens of similar bodies turned up in the same zone, astronomers demoted it to asteroid; in 2006 the IAU promoted it to dwarf planet. Categories are human bookkeeping - the object was always the same round, ice-rich world.',
    },
    quickFacts: [
      'It holds about a third of the asteroid belt’s entire mass, yet is still ~14 times less massive than Pluto.',
      'The bright spots in Occator crater are sodium-carbonate salts left behind by briny water seeping up from below.',
      'Being ~25% water ice, Ceres may contain more fresh water than all of Earth’s rivers, lakes and ice caps.',
    ],
    missionIds: ['dawn'],
    related: ['vesta', 'pallas', 'main-belt'],
    sources: [
      { label: 'NASA Solar System Exploration - Ceres', url: 'https://science.nasa.gov/dwarf-planets/ceres/' },
      { label: 'NASA Dawn mission', url: 'https://science.nasa.gov/mission/dawn/' },
      { label: 'JPL Small-Body Database - 1 Ceres', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Ceres' },
    ],
    texture: {
      file: 'ceres.webp',
      kind: 'photo',
      credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA (Dawn FC)',
    },
  },
  {
    id: 'pluto',
    aliases: ['134340'],
    name: 'Pluto',
    type: 'dwarf',
    category: 'Dwarf planet (Kuiper belt)',
    parent: 'sun',
    color: 0xd9b596,
    physical: {
      diameterKm: 2377,
      massKg: 1.30e22,
      gravity: 0.62,
      density: 1.85,
      rotationHours: -153.3,
      axialTiltDeg: 122.5,
      tempMeanC: -230,
      tempRangeC: [-240, -218],
      albedo: 0.52,
      moons: 5,
    },
    orbit: elementsFromPerihelion({
      a: 39.482,
      e: 0.2488,
      i: 17.16,
      node: 110.30,
      argPeri: 113.76,
      tpJD: 2447763,
      periodDays: 90560,
    }),
    positionAccuracy: 'approximate',
    atmosphere:
      'A thin nitrogen atmosphere with methane and carbon monoxide, ~1/100,000 of Earth’s surface pressure - it may partially freeze out onto the surface as Pluto recedes from the Sun.',
    composition:
      'A rocky core beneath a water-ice mantle; surface ices of nitrogen, methane and carbon monoxide.',
    discovery: {
      by: 'Clyde Tombaugh',
      year: 1930,
      how: 'Blink comparison of photographic plates at Lowell Observatory',
    },
    overview:
      'Pluto is the best-known world of the Kuiper belt: a dwarf planet of nitrogen glaciers, water-ice mountains and blue haze. New Horizons’ 2015 flyby revealed Sputnik Planitia, the bright half of Pluto’s famous “heart” - a thousand-kilometre plain of frozen nitrogen that is still slowly churning today.',
    concept: {
      title: 'Why Pluto is a dwarf planet',
      text: 'In 2006 the IAU defined a planet as a body that orbits the Sun, is round, and has cleared its orbital neighbourhood. Pluto passes the first two tests but honestly fails the third - it shares its zone with thousands of Kuiper belt objects and even crosses Neptune’s orbit. The reclassification was less a demotion than a recognition that Pluto is the brightest member of a vast new family.',
    },
    quickFacts: [
      'Sputnik Planitia’s nitrogen ice slowly overturns in lava-lamp-like cells, keeping parts of the surface younger than 10 million years.',
      'Its largest moon Charon is over half Pluto’s diameter - the pair orbit a point in the space between them.',
      'One Pluto year lasts 248 Earth years; it has not completed a single orbit since its discovery in 1930.',
    ],
    missionIds: ['newhorizons'],
    related: ['charon', 'kuiper-belt', 'eris'],
    sources: [
      { label: 'NASA Solar System Exploration - Pluto', url: 'https://science.nasa.gov/dwarf-planets/pluto/' },
      { label: 'NASA Pluto Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/plutofact.html' },
    ],
    texture: {
      file: 'pluto.webp',
      kind: 'photo',
      credit: 'NASA/JHUAPL/SwRI (New Horizons MVIC global color map)',
      note: 'The south polar region was in winter darkness during the 2015 flyby and is filled.',
    },
  },
  {
    id: 'eris',
    aliases: ['136199', '2003 UB313'],
    name: 'Eris',
    type: 'dwarf',
    category: 'Dwarf planet (scattered disc)',
    parent: 'sun',
    color: 0xe8e8ec,
    physical: {
      diameterKm: 2326,
      massKg: 1.66e22,
      gravity: 0.82,
      density: 2.43,
      tempRangeC: [-243, -217],
      albedo: 0.96,
      moons: 1,
    },
    orbit: elementsFromPerihelion({
      a: 67.86,
      e: 0.4361,
      i: 44.04,
      node: 35.95,
      argPeri: 151.64,
      tpJD: 2545407.7, // JPL SBDB (perihelion ~2257)
      periodDays: 203830,
    }),
    positionAccuracy: 'approximate',
    atmosphere:
      'None at present - any nitrogen or methane air is frozen solid out here; a thin atmosphere may appear near perihelion.',
    composition:
      'A rock-rich interior under a brilliantly reflective veneer of frozen methane and nitrogen.',
    discovery: {
      by: 'Mike Brown, Chad Trujillo & David Rabinowitz',
      year: 2005,
      how: 'Palomar Observatory survey images (taken in 2003, identified in 2005)',
    },
    overview:
      'Eris is a scattered-disc world almost exactly Pluto’s size but 28% more massive, currently nearly 100 AU from the Sun on a steeply tilted 558-year orbit. Its discovery in 2005 - briefly hyped as a “tenth planet” - is what finally forced astronomers to define the word planet.',
    concept: {
      title: 'The object that demoted Pluto',
      text: 'When Eris turned up - Pluto-sized, and more massive - astronomers faced a choice: either call it the tenth planet and accept dozens more to come, or give “planet” a real definition at last. The IAU chose the definition in 2006, and Pluto and Eris entered the new dwarf-planet class together. Eris is fittingly named for the Greek goddess of discord.',
    },
    quickFacts: [
      'At 2326 km across it is within ~2% of Pluto’s diameter, yet 28% more massive - so its interior must be rockier.',
      'Its icy surface reflects ~96% of incoming sunlight, making it one of the most reflective bodies known.',
      'JWST found an isotopic signature in its methane ice that hints at a warm rocky interior - perhaps even a past subsurface ocean.',
    ],
    missionIds: ['jwst'],
    related: ['pluto', 'kuiper-belt'],
    sources: [
      { label: 'NASA Solar System Exploration - Eris', url: 'https://science.nasa.gov/dwarf-planets/eris/' },
      { label: 'JPL Small-Body Database - 136199 Eris', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Eris' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No detailed imagery of Eris exists - even Hubble sees it as a few pixels; this rendering is artistic.',
    },
    uncertainty:
      'Eris’ rotation is uncertain: recent measurements suggest it is tidally locked to its moon Dysnomia, turning once per ~15.8-day orbit.',
  },
  {
    id: 'haumea',
    aliases: ['136108', '2003 EL61'],
    name: 'Haumea',
    type: 'dwarf',
    category: 'Dwarf planet (Kuiper belt)',
    parent: 'sun',
    color: 0xd8d3cc,
    physical: {
      diameterKm: 1560,
      dimensionsKm: '~2100 × 1680 × 1070',
      massKg: 4.0e21,
      rotationHours: 3.92,
      moons: 2,
    },
    orbit: elementsFromPerihelion({
      a: 43.12,
      e: 0.195,
      i: 28.21,
      node: 122.16,
      argPeri: 238.8,
      tpJD: 2500416.6, // JPL SBDB
      periodDays: 103660,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None detected.',
    composition:
      'Mostly rock under a thin shell of crystalline water ice - an ancient collision likely stripped much of its original ice mantle.',
    discovery: {
      by: 'Attribution contested - Mike Brown’s Caltech team and José Luis Ortiz’s Sierra Nevada team',
      year: 2004,
      how: 'Found in 2004 survey images; first announced from Spain in 2005',
    },
    overview:
      'Haumea is the strangest of the dwarf planets: it spins so fast that it has been stretched into a shape like a rugby ball, its long axis roughly twice its short one. It comes with two small moons, a family of icy fragments, and a faint ring - discovered in 2017 when the ring briefly dimmed a background star.',
    concept: {
      title: 'Spin can reshape a world',
      text: 'Haumea rotates once every 3.9 hours - the fastest of any large body in the Solar System. At that rate the centrifugal effect at its equator competes with its own gravity, and the body relaxes into the elongated equilibrium shape a spinning fluid would take. The likely cause is an ancient giant collision that spun it up and blasted off the fragments that became its moons and family.',
    },
    quickFacts: [
      'A day on Haumea lasts just 3.9 hours - the fastest spin of any large body in the Solar System.',
      'It was the first trans-Neptunian object found to have a ring, revealed by a stellar occultation in 2017.',
      'Its moons Hi‘iaka and Namaka are named for daughters of Haumea, the Hawaiian goddess of childbirth.',
    ],
    related: ['makemake', 'pluto', 'kuiper-belt'],
    sources: [
      { label: 'NASA Solar System Exploration - Haumea', url: 'https://science.nasa.gov/dwarf-planets/haumea/' },
      { label: 'JPL Small-Body Database - 136108 Haumea', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Haumea' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No detailed imagery of Haumea exists; this rendering is artistic. The real body is an ellipsoid roughly twice as long as it is tall.',
    },
    uncertainty:
      'Size and shape come from a 2017 stellar occultation combined with its lightcurve; the quoted dimensions carry uncertainties of several percent.',
  },
  {
    id: 'makemake',
    aliases: ['136472', '2005 FY9'],
    name: 'Makemake',
    type: 'dwarf',
    category: 'Dwarf planet (Kuiper belt)',
    parent: 'sun',
    color: 0xc48a5f,
    physical: {
      diameterKm: 1430,
      rotationHours: 22.8,
      tempMeanC: -240,
      albedo: 0.81,
      moons: 1,
    },
    orbit: elementsFromPerihelion({
      a: 45.43,
      e: 0.161,
      i: 28.98,
      node: 79.62,
      argPeri: 294.83,
      tpJD: 2408158.7, // JPL SBDB (last perihelion ~1880)
      periodDays: 111450,
    }),
    positionAccuracy: 'approximate',
    atmosphere:
      'Essentially none - a 2011 stellar occultation showed no global atmosphere, though methane may sublimate locally near perihelion.',
    composition:
      'Bright ices of methane and ethane over a rocky interior, with the reddish tint of radiation-processed organics.',
    discovery: {
      by: 'Mike Brown, Chad Trujillo & David Rabinowitz',
      year: 2005,
      how: 'Palomar Observatory 48-inch Samuel Oschin Telescope',
    },
    overview:
      'Makemake is the second-brightest object in the Kuiper belt after Pluto, a frigid world lacquered with frozen methane. Discovered around Easter 2005 and nicknamed “Easterbunny” by its finders, it was formally named for the creator god of the Rapa Nui people of Easter Island.',
    concept: {
      title: 'Reading a surface no telescope can resolve',
      text: 'Even Hubble sees Makemake as little more than a dot, yet we know its surface is coated in methane ice. Split its faint light into a spectrum and each ice leaves unmistakable fingerprints - absorption bands at precise infrared wavelengths. Spectroscopy turns a single pixel into a chemistry report from nearly 7 billion kilometres away.',
    },
    quickFacts: [
      'Its methane-ice surface reflects ~80% of the sunlight that reaches it.',
      'Its one known moon, nicknamed MK 2, is charcoal-dark and was only spotted by Hubble in 2016.',
      'JWST found an isotopic signature in its methane hinting at a warm, geochemically active interior.',
    ],
    missionIds: ['jwst'],
    related: ['haumea', 'pluto', 'kuiper-belt'],
    sources: [
      { label: 'NASA Solar System Exploration - Makemake', url: 'https://science.nasa.gov/dwarf-planets/makemake/' },
      { label: 'JPL Small-Body Database - 136472 Makemake', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Makemake' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No detailed imagery of Makemake exists; this rendering is artistic, guided by its measured colour and brightness.',
    },
    uncertainty:
      'Mass and density are poorly constrained - the orbit of its small moon has not yet been pinned down.',
  },
];

export const TNOS: CatalogObject[] = [
  {
    id: 'quaoar',
    aliases: ['50000', '2002 LM60'],
    name: 'Quaoar',
    type: 'tno',
    category: 'Dwarf-planet candidate (classical KBO)',
    parent: 'sun',
    color: 0x8f6b52,
    physical: {
      diameterKm: 1090,
      massKg: 1.2e21,
      albedo: 0.12,
      moons: 1,
    },
    orbit: elementsFromPerihelion({
      a: 43.69,
      e: 0.04,
      i: 7.99,
      node: 188.8,
      argPeri: 147.5,
      tpJD: 2480516.4, // JPL SBDB (perihelion ~2078)
      periodDays: 105470,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None detected.',
    composition:
      'Rock and water ice; spectra show crystalline water ice, ammonia hydrate and traces of methane.',
    discovery: {
      by: 'Chad Trujillo & Mike Brown',
      year: 2002,
      how: 'Palomar Observatory 48-inch Samuel Oschin Telescope',
    },
    overview:
      'Quaoar is a classical Kuiper belt object about half the size of Pluto, following one of the most circular orbits in the outer Solar System. In 2023 astronomers announced something baffling around it: a dense ring orbiting far beyond the distance where rings are supposed to be able to survive.',
    concept: {
      title: 'The ring that should be a moon',
      text: 'Inside a body’s Roche limit, tides tear moonlets apart, so debris stays a ring; outside it, ring material should clump into a moon within decades. Quaoar’s ring sits at over seven Quaoar radii - more than twice the classical Roche limit - yet it has not coalesced. Something, perhaps resonances with Quaoar’s spin or its moon Weywot, keeps sweeping the material apart, and the textbooks are being revised.',
    },
    quickFacts: [
      'Its ring, found when Quaoar briefly blotted out background stars, is the first known to defy the Roche limit.',
      'Its nearly circular orbit (e ≈ 0.04) never strays far from 43 AU - a textbook classical Kuiper belt object.',
      'Crystalline water ice and ammonia hydrate on its surface hint at geologically recent cryovolcanism.',
    ],
    related: ['pluto', 'kuiper-belt'],
    sources: [
      { label: 'NASA Kuiper Belt overview', url: 'https://science.nasa.gov/solar-system/kuiper-belt/' },
      { label: 'JPL Small-Body Database - 50000 Quaoar', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Quaoar' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No detailed imagery of Quaoar exists; this rendering is artistic.',
    },
  },
  {
    id: 'sedna',
    aliases: ['90377', '2003 VB12'],
    name: 'Sedna',
    type: 'tno',
    category: 'Dwarf-planet candidate (detached object)',
    parent: 'sun',
    color: 0xb35b3f,
    physical: {
      diameterKm: 1000,
      rotationHours: 10.3,
      albedo: 0.32,
      moons: 0,
    },
    orbit: elementsFromPerihelion({
      a: 506,
      e: 0.8496,
      i: 11.93,
      node: 144.4,
      argPeri: 311.3,
      tpJD: 2479264.8, // JPL SBDB (perihelion 2075-76)
      periodDays: 4157000,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None detected.',
    composition:
      'Uncertain - its intensely red surface suggests organic tholins over ices of water, methane and nitrogen.',
    discovery: {
      by: 'Mike Brown, Chad Trujillo & David Rabinowitz',
      year: 2003,
      how: 'Palomar Observatory 48-inch Samuel Oschin Telescope',
    },
    overview:
      'Sedna is one of the loneliest worlds known: a reddish body roughly 1000 km across on an 11,400-year orbit that never brings it closer to the Sun than about 76 AU - far beyond Neptune’s reach - and carries it out past 900 AU. It is named for the Inuit goddess of the sea, who lives at the bottom of the cold Arctic Ocean.',
    concept: {
      title: 'An orbit nothing present can explain',
      text: 'Every planet, asteroid and comet we know was put on its path by gravity we can point to. Not Sedna: it never comes near Neptune, so Neptune cannot have scattered it, yet it is far too tightly bound for passing stars to stir it today. Its orbit looks like a fossil - imprinted billions of years ago by a star sweeping through the Sun’s birth cluster, or by a distant unseen mass still waiting to be found.',
    },
    quickFacts: [
      'It reaches perihelion in 2076 - the one close approach in 11,400 years, and our one chance to send a probe.',
      'It is among the reddest objects in the Solar System, likely coated in radiation-cooked organic “tholins”.',
      'Near aphelion, over 900 AU out, sunlight is nearly a million times fainter than on Earth.',
    ],
    related: ['kuiper-belt', 'oort-cloud', 'eris'],
    sources: [
      { label: 'NASA Kuiper Belt overview', url: 'https://science.nasa.gov/solar-system/kuiper-belt/' },
      { label: 'JPL Small-Body Database - 90377 Sedna', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Sedna' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No detailed imagery of Sedna exists; this rendering is artistic, guided by its measured deep-red colour.',
    },
    uncertainty:
      'Sedna’s diameter (~1000 km) is a thermal-model estimate - it has never been resolved by any telescope, and its mass is unknown.',
  },
  {
    id: 'gonggong',
    aliases: ['225088', '2007 OR10'],
    name: 'Gonggong',
    type: 'tno',
    category: 'Dwarf-planet candidate (scattered disc)',
    parent: 'sun',
    color: 0xa64b32,
    physical: {
      diameterKm: 1230,
      massKg: 1.75e21,
      rotationHours: 22.4,
      albedo: 0.14,
      moons: 1,
    },
    orbit: elementsFromPerihelion({
      a: 67.33,
      e: 0.503,
      i: 30.87,
      node: 336.8,
      argPeri: 207.7,
      tpJD: 2399252.7, // JPL SBDB (last perihelion ~1857)
      periodDays: 201000,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None detected.',
    composition:
      'Water ice with methane frost, coloured deep red by radiation-processed organics (tholins).',
    discovery: {
      by: 'Megan Schwamb, Mike Brown & David Rabinowitz',
      year: 2007,
      how: 'Palomar Distant Solar System Survey (designated 2007 OR10)',
    },
    overview:
      'Gonggong is a deep-red world of the scattered disc and one of the largest Solar System bodies never visited by a spacecraft. Known for over a decade only as 2007 OR10, it was finally named in 2019 after a public vote, for a Chinese water god with a serpent’s tail who was blamed for floods and for tilting the Earth.',
    concept: {
      title: 'A moon that slowed a world down',
      text: 'Most bodies of Gonggong’s size spin in well under half a day, but Gonggong turns once in about 22 hours - one of the slowest rotations measured in the Kuiper belt region. The likely brake is its small moon Xiangliu: over billions of years, tides raised between the pair drained away spin, the same process that long ago locked our own Moon to Earth.',
    },
    quickFacts: [
      'Its moon Xiangliu is named for the nine-headed serpent minister of the water god Gonggong.',
      'It is among the reddest large objects known, with methane frost on a tholin-stained icy surface.',
      'Its eccentric orbit swings from ~33 AU, inside Pluto’s mean distance, out to just over 100 AU.',
    ],
    related: ['eris', 'kuiper-belt'],
    sources: [
      { label: 'NASA Kuiper Belt overview', url: 'https://science.nasa.gov/solar-system/kuiper-belt/' },
      { label: 'JPL Small-Body Database - 225088 Gonggong', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Gonggong' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No detailed imagery of Gonggong exists; this rendering is artistic, guided by its measured red colour.',
    },
  },
  {
    id: 'orcus',
    aliases: ['90482', '2004 DW'],
    name: 'Orcus',
    type: 'tno',
    category: 'Dwarf-planet candidate (plutino)',
    parent: 'sun',
    color: 0x9aa4ab,
    physical: {
      diameterKm: 910,
      massKg: 6.3e20,
      albedo: 0.23,
      moons: 1,
    },
    orbit: elementsFromPerihelion({
      a: 39.42,
      e: 0.226,
      i: 20.59,
      node: 268.7,
      argPeri: 72.9,
      tpJD: 2504046.1, // JPL SBDB (next perihelion ~2143)
      periodDays: 90370,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None detected.',
    composition:
      'Water ice (partly crystalline) with possible ammonia - hints of past cryovolcanic resurfacing.',
    discovery: {
      by: 'Mike Brown, Chad Trujillo & David Rabinowitz',
      year: 2004,
      how: 'Palomar Observatory 48-inch Samuel Oschin Telescope',
    },
    overview:
      'Orcus is Pluto’s mirror image, nicknamed the “anti-Pluto”: it is locked in the same 2:3 resonance with Neptune, but permanently phased so that it sits on the opposite side of the dance. It even has an outsized moon, Vanth, echoing Pluto and Charon.',
    concept: {
      title: 'The anti-Pluto',
      text: 'A resonance is a rhythm, and rhythms have phases. Orcus and Pluto each complete two orbits for every three of Neptune’s, but half a cycle apart: when Pluto is near perihelion, Orcus is near aphelion, and vice versa. Their orbits are near-twins - about 248 years at ~39 AU - yet Neptune’s clockwork keeps the two worlds forever on opposite sides of it.',
    },
    quickFacts: [
      'Its orbital period of ~247 years is within months of Pluto’s, yet the two can never meet.',
      'Orcus was a Roman-Etruscan god of the underworld - a counterpart of Pluto; its moon Vanth is named for a guide of souls.',
      'Vanth is nearly half Orcus’ diameter, making the pair a smaller echo of the Pluto-Charon double system.',
    ],
    related: ['pluto', 'charon', 'kuiper-belt'],
    sources: [
      { label: 'NASA Kuiper Belt overview', url: 'https://science.nasa.gov/solar-system/kuiper-belt/' },
      { label: 'JPL Small-Body Database - 90482 Orcus', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Orcus' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No detailed imagery of Orcus exists; this rendering is artistic.',
    },
    uncertainty:
      'Mass is measured for the Orcus-Vanth pair together; Vanth may carry close to a tenth of it.',
  },
];
