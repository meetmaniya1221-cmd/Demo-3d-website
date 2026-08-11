/**
 * Comets: six famous visitors, from short-period Encke to long-period
 * Hale-Bopp.
 *
 * Physical values from NASA Solar System Exploration (science.nasa.gov)
 * and the JPL Small-Body Database (ssd.jpl.nasa.gov). Orbital elements are
 * perihelion-passage elements in the JPL SBDB style, converted via
 * `elementsFromPerihelion`; rendered positions are approximate. Retrograde
 * comets (Halley, Tempel-Tuttle) genuinely have inclinations above 90°.
 */
import type { CatalogObject } from '../types';
import { elementsFromPerihelion } from './util';

export const COMETS: CatalogObject[] = [
  {
    id: 'halley',
    name: '1P/Halley',
    type: 'comet',
    category: 'Halley-type comet',
    parent: 'sun',
    color: 0x9fd4e8,
    physical: {
      diameterKm: 11,
      dimensionsKm: '15 × 8',
      massKg: 2.2e14,
      albedo: 0.04,
    },
    orbit: elementsFromPerihelion({
      a: 17.834,
      e: 0.96714,
      i: 162.26,
      node: 58.42,
      argPeri: 111.33,
      tpJD: 2446467.4,
      periodDays: 27509,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None at rest; near the Sun it grows a glowing coma of gas and dust roughly 100,000 km across.',
    composition: 'An “icy dirtball”: water ice, frozen CO and CO₂, and very dark carbon-rich dust.',
    discovery: {
      by: 'Edmond Halley',
      year: 1705,
      how: 'recognised the comets of 1531, 1607 and 1682 as one object and predicted its 1758 return',
    },
    overview:
      'Halley is the most famous comet in history, recorded by astronomers at every return for more than two thousand years. Roughly every 76 years it dives from beyond Neptune to inside Venus’s orbit and lights up Earth’s skies. In 1986 ESA’s Giotto probe flew within about 600 km and returned the first close-up pictures of a comet nucleus: a dark, 15-km peanut venting bright jets of gas.',
    concept: {
      title: 'The comet that proved comets return',
      text: 'In 1705 Edmond Halley used Newton’s new theory of gravity to show that the bright comets of 1531, 1607 and 1682 followed the same orbit - they were one object, and he predicted it would return in 1758. When it appeared on schedule, years after his death, it was the first proof that comets are ordinary members of the Solar System obeying the same laws as planets, not omens drifting through the atmosphere.',
    },
    quickFacts: [
      'Chinese astronomers recorded it as far back as 240 BC.',
      'Its 1066 apparition is stitched into the Bayeux Tapestry.',
      'The nucleus reflects only ~4% of sunlight - darker than charcoal.',
    ],
    missionIds: ['giotto'],
    related: ['encke', 'halebopp', 'kuiper-belt'],
    sources: [
      { label: 'NASA Science - 1P/Halley', url: 'https://science.nasa.gov/solar-system/comets/1p-halley/' },
      { label: 'JPL Small-Body Database - 1P/Halley', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=1P' },
    ],
    texture: {
      kind: 'procedural',
      note: 'Rendered as a generic dark nucleus; Giotto glimpsed the real potato-shaped body only briefly during the 1986 flyby.',
    },
    comet: {
      qAU: 0.586,
      aphelionAU: 35.1,
      origin: 'Halley-type - likely scattered inward from the Kuiper belt long ago',
      lastPerihelion: '9 Feb 1986',
      nextPerihelion: '28 Jul 2061',
      meteorShower: 'Orionids (October) and Eta Aquariids (May)',
    },
  },
  {
    id: 'encke',
    aliases: ['2P'],
    name: '2P/Encke',
    type: 'comet',
    category: 'Jupiter-family comet',
    parent: 'sun',
    color: 0xaab6a0,
    physical: {
      diameterKm: 4.8,
      albedo: 0.05,
      rotationHours: 11.1,
    },
    orbit: elementsFromPerihelion({
      a: 2.215,
      e: 0.8483,
      i: 11.78,
      node: 334.57,
      argPeri: 186.55,
      tpJD: 2460240,
      periodDays: 1204,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'A weak coma near perihelion; after thousands of solar passes there is little ice left to boil off.',
    composition: 'Ice-depleted rock and dust; repeated solar roasting has built a dark crust that chokes off most activity.',
    discovery: {
      by: 'Pierre Méchain',
      year: 1786,
      how: 'its short period was computed in 1819 by Johann Franz Encke, whose name the comet now carries',
    },
    overview:
      'Encke races around the Sun every 3.3 years - the shortest period of any known comet - looping from inside Mercury’s orbit out to the asteroid belt. Thousands of close solar passes have baked away much of its ice, leaving a dim, crusted-over comet that shows us how comets age and fade.',
    concept: {
      title: 'Sunlight switches comets on',
      text: 'Far from the Sun a comet is an inert, frozen rock. Inside roughly 3 AU, sunlight becomes strong enough for water ice to sublimate - to jump straight from solid to gas - and the escaping vapour drags dust off the surface to build the coma and tails. Encke crosses that switch-on line every 3.3 years, and each firing spends a little more of its remaining ice; it is a comet slowly running out of fuel.',
    },
    quickFacts: [
      'Its 3.3-year orbit is the shortest of any known comet.',
      'It has been observed at more returns than any other comet.',
      'Its debris stream produces the slow, fireball-rich Taurid meteors each autumn.',
    ],
    related: ['67p', 'halley', 'main-belt'],
    sources: [
      { label: 'NASA Science - 2P/Encke', url: 'https://science.nasa.gov/solar-system/comets/2p-encke/' },
      { label: 'JPL Small-Body Database - 2P/Encke', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=2P' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No spacecraft has imaged Encke’s nucleus up close; this rendering is artistic.',
    },
    comet: {
      qAU: 0.336,
      aphelionAU: 4.09,
      origin: 'Jupiter-family comet from the Kuiper belt',
      lastPerihelion: '22 Oct 2023',
      nextPerihelion: '~Feb 2027',
      meteorShower: 'Taurids (October-November)',
    },
  },
  {
    id: '67p',
    name: '67P/Churyumov-Gerasimenko',
    type: 'comet',
    category: 'Jupiter-family comet',
    parent: 'sun',
    color: 0xb8b0a6,
    physical: {
      diameterKm: 4,
      dimensionsKm: '4.3 × 4.1',
      massKg: 1.0e13,
      density: 0.53,
      rotationHours: 12.4,
      albedo: 0.06,
    },
    orbit: elementsFromPerihelion({
      a: 3.463,
      e: 0.641,
      i: 7.04,
      node: 50.14,
      argPeri: 12.78,
      tpJD: 2459521,
      periodDays: 2353,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'A coma of water vapour, CO₂ and dust near perihelion; Rosetta flew inside it for two years.',
    composition: 'Roughly 70% empty pore space: fluffy dust, water and CO₂ ices, and complex organics including the amino acid glycine.',
    discovery: {
      by: 'Klim Churyumov & Svetlana Gerasimenko',
      year: 1969,
      how: 'found on photographic plates taken during a comet survey in Alma-Ata',
    },
    overview:
      'Churyumov-Gerasimenko is the best-studied comet in existence: ESA’s Rosetta orbited it from 2014 to 2016 and set the Philae lander down on its surface - the first landing on a comet. The mission mapped a twin-lobed, duck-shaped nucleus so porous that it is fluffier than fresh snow, and watched it wake up as it approached the Sun.',
    concept: {
      title: 'Tails point away from the Sun',
      text: 'A comet’s tail is not a wake trailing behind its motion. Sunlight and the solar wind push escaping gas and dust directly away from the Sun, so the tail always streams anti-sunward - which means that on the outbound half of its orbit a comet travels tail-first. Rosetta saw this from the inside, riding alongside 67P as its jets switched on and bent away from the Sun.',
    },
    quickFacts: [
      'Rosetta was the first spacecraft ever to orbit a comet, escorting it for two years.',
      'Philae touched down on it in November 2014 - the first soft landing on a comet.',
      'Its two lobes were once separate bodies that merged in a gentle ancient collision.',
    ],
    missionIds: ['rosetta'],
    related: ['encke', 'halley', 'kuiper-belt'],
    sources: [
      { label: 'NASA Science - 67P/Churyumov-Gerasimenko', url: 'https://science.nasa.gov/solar-system/comets/67p-churyumov-gerasimenko/' },
      { label: 'JPL Small-Body Database - 67P', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=67P' },
      { label: 'ESA - Rosetta', url: 'https://www.esa.int/Science_Exploration/Space_Science/Rosetta' },
    ],
    texture: {
      kind: 'procedural',
      note: 'Comet nuclei are rendered as generic dark bodies; 67P’s true twin-lobed shape was mapped by Rosetta.',
    },
    comet: {
      qAU: 1.243,
      aphelionAU: 5.68,
      origin: 'Jupiter-family comet from the Kuiper belt',
      lastPerihelion: '2 Nov 2021',
      nextPerihelion: '~Apr 2028',
    },
  },
  {
    id: 'swifttuttle',
    aliases: ['109P'],
    name: '109P/Swift-Tuttle',
    type: 'comet',
    category: 'Halley-type comet',
    parent: 'sun',
    color: 0x9fe0cf,
    physical: {
      diameterKm: 26,
      albedo: 0.04,
    },
    orbit: elementsFromPerihelion({
      a: 26.09,
      e: 0.9632,
      i: 113.45,
      node: 139.38,
      argPeri: 152.98,
      tpJD: 2448968,
      periodDays: 48681,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'None at rest; it grows a bright coma and tails during its rare visits to the inner Solar System.',
    composition: 'Presumed classic mix of water ice, frozen gases and dark dust; its interior has never been probed.',
    discovery: {
      by: 'Lewis Swift & Horace Tuttle',
      year: 1862,
      how: 'independent visual discoveries three days apart',
    },
    overview:
      'Swift-Tuttle is the parent of the Perseids, the most watched meteor shower of the year. Its 26-km nucleus is the largest of any known periodic comet that repeatedly crosses Earth’s orbit, and it swings past only once every 133 years - the next visit comes in 2126.',
    concept: {
      title: 'How a comet makes a meteor shower',
      text: 'Every time Swift-Tuttle rounds the Sun it sheds dust, and over thousands of years that dust spreads out into a river of debris tracing the whole orbit. Every August Earth ploughs through that river; sand-grain-sized particles hit the atmosphere at ~59 km/s and vaporise in streaks of light - the Perseids. A meteor shower is a comet’s orbit made visible.',
    },
    quickFacts: [
      'Its debris causes the Perseid meteor shower every August.',
      'Its 26-km nucleus is roughly twice the size of the impactor that ended the dinosaurs.',
      'It returns in July 2126, when it should be a bright naked-eye comet.',
    ],
    related: ['tempeltuttle', 'halley'],
    sources: [
      { label: 'NASA Science - 109P/Swift-Tuttle', url: 'https://science.nasa.gov/solar-system/comets/109p-swift-tuttle/' },
      { label: 'JPL Small-Body Database - 109P', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=109P' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No spacecraft has visited Swift-Tuttle and its nucleus has never been resolved; this rendering is artistic.',
    },
    comet: {
      qAU: 0.96,
      aphelionAU: 51.2,
      origin: 'Halley-type comet',
      lastPerihelion: '11 Dec 1992',
      nextPerihelion: '12 Jul 2126',
      meteorShower: 'Perseids (August)',
    },
    uncertainty: 'Nucleus albedo is an assumed comet-typical value; only the diameter is reasonably well constrained.',
  },
  {
    id: 'tempeltuttle',
    aliases: ['55P'],
    name: '55P/Tempel-Tuttle',
    type: 'comet',
    category: 'Halley-type comet',
    parent: 'sun',
    color: 0xc9c39a,
    physical: {
      diameterKm: 3.6,
      albedo: 0.06,
    },
    orbit: elementsFromPerihelion({
      a: 10.33,
      e: 0.9056,
      i: 162.49,
      node: 235.27,
      argPeri: 172.5,
      tpJD: 2450873,
      periodDays: 12079,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'A modest coma near perihelion; the comet never becomes bright, only its meteor storms do.',
    composition: 'Water ice and dark dust, typical of Halley-type comets.',
    discovery: {
      by: 'Ernst Tempel & Horace Tuttle',
      year: '1865-66',
      how: 'independent discoveries in December 1865 and January 1866',
    },
    overview:
      'Tempel-Tuttle is a small, faint comet with an outsized reputation: its debris causes the Leonid meteor shower, source of the greatest meteor storms in recorded history. It rounds the Sun every 33 years, and each pass lays down a fresh, dense trail of dust for Earth to cross every November.',
    concept: {
      title: 'Why the Leonids sometimes storm',
      text: 'Freshly shed comet dust stays bunched in narrow, dense trails close to the comet’s position; only over centuries does it spread evenly around the orbit. When Earth crosses a young trail soon after Tempel-Tuttle’s 33-year visit, rates explode from a dozen meteors an hour into a storm of thousands - as in 1833 and 1966. The difference between a shower and a storm is simply how recently the parent comet passed by.',
    },
    quickFacts: [
      'The 1833 Leonid storm rained tens of thousands of meteors per hour and helped found meteor science.',
      'Leonid storms recur roughly every 33 years, matching the comet’s orbital period.',
      'The comet itself never gets bright enough to see with the naked eye.',
    ],
    related: ['swifttuttle', 'halley'],
    sources: [
      { label: 'NASA Science - 55P/Tempel-Tuttle', url: 'https://science.nasa.gov/solar-system/comets/55p-tempel-tuttle/' },
      { label: 'JPL Small-Body Database - 55P', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=55P' },
    ],
    texture: {
      kind: 'procedural',
      note: 'No spacecraft has visited Tempel-Tuttle; this rendering is artistic.',
    },
    comet: {
      qAU: 0.976,
      aphelionAU: 19.7,
      origin: 'Halley-type comet',
      lastPerihelion: '28 Feb 1998',
      nextPerihelion: '20 May 2031',
      meteorShower: 'Leonids (November)',
    },
  },
  {
    id: 'halebopp',
    aliases: ['C/1995 O1'],
    name: 'C/1995 O1 (Hale-Bopp)',
    type: 'comet',
    category: 'Long-period comet',
    parent: 'sun',
    color: 0xcfe3f5,
    physical: {
      diameterKm: 60,
      rotationHours: 11.35,
    },
    orbit: elementsFromPerihelion({
      a: 186,
      e: 0.99512,
      i: 89.43,
      node: 282.47,
      argPeri: 130.59,
      tpJD: 2450539.6,
      periodDays: 926000,
    }),
    positionAccuracy: 'approximate',
    atmosphere: 'In 1997 it wrapped itself in an enormous coma of water, CO and dust, millions of km across.',
    composition: 'Ice-rich and unusually active: water, CO, CO₂ and a rich suite of organic gases were detected in its coma.',
    discovery: {
      by: 'Alan Hale & Thomas Bopp',
      year: 1995,
      how: 'independent same-night discoveries on 23 Jul 1995, while the comet was still beyond Jupiter',
    },
    overview:
      'Hale-Bopp was the great comet of 1997 - intrinsically so bright that it was discovered out beyond Jupiter, nearly two years before perihelion. Powered by an exceptionally large nucleus, perhaps 60 km across, it stayed visible to the naked eye for a record 18 months, even from light-polluted cities.',
    concept: {
      title: 'One comet, two tails',
      text: 'Hale-Bopp showed the classic double tail beautifully. The blue ion tail is gas ionised by sunlight and snapped straight anti-sunward by the magnetised solar wind; the white-yellow dust tail is heavier grains pushed more gently by radiation pressure, so they lag behind and curve along the orbit. Two tails, two different forces - and neither points back along the comet’s path.',
    },
    quickFacts: [
      'It stayed visible to the naked eye for a record ~18 months through 1996-97.',
      'It was found 7 AU from the Sun - farther out than any previous amateur comet discovery.',
      'Besides its two classic tails it sported a rare third tail of glowing sodium atoms.',
    ],
    related: ['oort-cloud', 'halley'],
    sources: [
      { label: 'NASA Science - Comet Hale-Bopp', url: 'https://science.nasa.gov/solar-system/comets/c-1995-o1-hale-bopp/' },
      { label: 'JPL Small-Body Database - C/1995 O1', url: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=Hale-Bopp' },
    ],
    texture: {
      kind: 'procedural',
      note: 'Hale-Bopp’s nucleus has never been resolved by any telescope or spacecraft; this rendering is artistic.',
    },
    comet: {
      qAU: 0.914,
      aphelionAU: 370,
      origin: 'Long-period comet from the Oort cloud',
      lastPerihelion: '1 Apr 1997',
      nextPerihelion: '~4385 AD',
    },
    uncertainty: 'Nucleus diameter estimates range from about 40 to 80 km; 60 km is a mid-range value. The orbital period is likewise approximate.',
  },
];
