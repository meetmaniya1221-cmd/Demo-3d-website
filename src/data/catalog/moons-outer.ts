/**
 * Moons of the outer Solar System: the five major moons of Uranus, Neptune's
 * giant moon Triton, and Pluto's companion Charon.
 *
 * Values from the NASA Uranian / Neptunian Satellite Fact Sheets and the
 * Pluto Fact Sheet (nssdc.gsfc.nasa.gov), JPL Solar System Dynamics satellite
 * elements (ssd.jpl.nasa.gov) and the NASA Solar System Exploration pages.
 * Orbits are rendered as circles at the mean orbital distance; where the real
 * orbit plane is strongly inclined we say so in `simplified`.
 */
import type { CatalogObject } from '../types';

export const URANUS_MOONS: CatalogObject[] = [
  {
    id: 'miranda',
    name: 'Miranda',
    type: 'moon',
    category: 'Major moon of Uranus',
    parent: 'uranus',
    color: 0xb5b5bd,
    physical: {
      diameterKm: 472,
      massKg: 6.6e19,
      gravity: 0.079,
      density: 1.2,
      tidallyLocked: true,
      tempMeanC: -200,
      albedo: 0.32,
    },
    satOrbit: { distanceKm: 129_900, periodDays: 1.4135 },
    positionAccuracy: 'approximate',
    atmosphere: 'None detected.',
    composition: 'Water ice mixed with silicate rock; the least dense of the five major Uranian moons.',
    discovery: { by: 'Gerard Kuiper', year: 1948, how: '82-inch telescope at McDonald Observatory' },
    overview:
      'Miranda is the smallest and innermost of Uranus’ five major moons, and its surface looks stitched together from spare parts - ancient cratered plains butt directly against huge chevron-shaped grooved regions called coronae. When Voyager 2 flew past in 1986, this little moon turned out to be the strangest sight in the whole Uranus system.',
    concept: {
      title: 'The Frankenstein moon',
      text: 'A moon just 472 km across should have frozen solid long ago and stayed geologically dead. Yet Miranda’s jumbled patchwork says otherwise: it was probably caught for a time in an orbital resonance with Umbriel, and the resulting tidal heating sent warm ice welling up from inside, breaking and remaking parts of the crust. Even tiny worlds can be reworked - given the right gravitational choreography.',
    },
    quickFacts: [
      'Verona Rupes, a cliff roughly 20 km high, is the tallest known cliff in the Solar System.',
      'Gravity is so weak that a fall from the top of Verona Rupes would last around 12 minutes.',
      'It was discovered in 1948 - nearly a century after the next of Uranus’ major moons.',
    ],
    missionIds: ['voyager2'],
    related: ['uranus', 'ariel', 'umbriel', 'titania', 'oberon'],
    sources: [
      { label: 'NASA Uranus Moons - Miranda', url: 'https://science.nasa.gov/uranus/moons/miranda/' },
      { label: 'NASA Uranian Satellite Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/uraniansatfact.html' },
    ],
    texture: {
      kind: 'procedural',
      note: 'Voyager 2 imaged only the southern hemisphere in 1986; this rendering is artistic, informed by that imagery.',
    },
  },
  {
    id: 'ariel',
    name: 'Ariel',
    type: 'moon',
    category: 'Major moon of Uranus',
    parent: 'uranus',
    color: 0xd2d2d8,
    physical: {
      diameterKm: 1158,
      massKg: 1.35e21,
      gravity: 0.27,
      density: 1.67,
      tidallyLocked: true,
      tempMeanC: -200,
      albedo: 0.39,
    },
    satOrbit: { distanceKm: 190_900, periodDays: 2.5204 },
    positionAccuracy: 'approximate',
    atmosphere: 'None detected.',
    composition: 'Roughly half water ice and half rock; carbon-dioxide ice has been detected on its surface.',
    discovery: { by: 'William Lassell', year: 1851, how: '24-inch reflector at his private observatory' },
    overview:
      'Ariel is the brightest of Uranus’ major moons, its surface cut by broad rift valleys whose floors look smooth and freshly paved. It has fewer large craters than its siblings - the mark of the youngest surface among the five, resurfaced long after the moon formed.',
    concept: {
      title: 'How an old moon gets a young face',
      text: 'Ariel formed with the rest of the Uranian system over four billion years ago, yet much of its surface is far younger. Ancient orbital resonances with neighbouring moons likely flexed and heated its interior, letting slushy, viscous ice flood the floors of its rift valleys and bury old craters. A young surface never means a young world - it means the world found the energy to repave itself.',
    },
    quickFacts: [
      'Its name fits both naming traditions: Ariel is a sprite in Shakespeare’s The Tempest and in Pope’s The Rape of the Lock - all Uranian moons are named for characters from those authors.',
      'It reflects about 39% of incoming sunlight - the most of any Uranian moon.',
      'William Lassell discovered Ariel and Umbriel on the very same night in 1851.',
    ],
    missionIds: ['voyager2'],
    related: ['uranus', 'miranda', 'umbriel', 'titania', 'oberon'],
    sources: [
      { label: 'NASA Uranus Moons - Ariel', url: 'https://science.nasa.gov/uranus/moons/ariel/' },
      { label: 'NASA Uranian Satellite Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/uraniansatfact.html' },
    ],
    texture: {
      kind: 'procedural',
      note: 'Voyager 2 imaged only the southern hemisphere in 1986; this rendering is artistic, informed by that imagery.',
    },
  },
  {
    id: 'umbriel',
    name: 'Umbriel',
    type: 'moon',
    category: 'Major moon of Uranus',
    parent: 'uranus',
    color: 0x73737b,
    physical: {
      diameterKm: 1169,
      massKg: 1.17e21,
      gravity: 0.23,
      density: 1.4,
      tidallyLocked: true,
      tempMeanC: -200,
      albedo: 0.21,
    },
    satOrbit: { distanceKm: 266_000, periodDays: 4.1442 },
    positionAccuracy: 'approximate',
    atmosphere: 'None detected.',
    composition: 'Water ice and rock beneath an unusually dark, ancient surface layer.',
    discovery: { by: 'William Lassell', year: 1851, how: '24-inch reflector at his private observatory' },
    overview:
      'Umbriel is the darkest of Uranus’ major moons, an ancient, crater-saturated world that reflects only about a fifth of the sunlight falling on it. Its one flash of brilliance is a mystery: a bright ring of material roughly 130 km across on the floor of the crater Wunda.',
    concept: {
      title: 'Why so dark?',
      text: 'Umbriel is nearly the same size as bright Ariel, yet reflects only half as much light. Its surface has sat unchanged for billions of years while radiation and micrometeorites slowly processed its ices into dark, carbon-rich residue - old surfaces in the outer Solar System tend to darken like old snow. Wunda’s bright ring may be the exception that proves the rule: a cold trap where fresh carbon-dioxide frost collects and stays clean.',
    },
    quickFacts: [
      'It reflects only about 21% of incoming sunlight - the darkest of Uranus’ five major moons.',
      'Umbriel and Ariel are nearly twins in size, yet Umbriel is only about half as bright.',
      'The bright ring inside the crater Wunda may be a trap where carbon-dioxide frost accumulates.',
    ],
    missionIds: ['voyager2'],
    related: ['uranus', 'miranda', 'ariel', 'titania', 'oberon'],
    sources: [
      { label: 'NASA Uranus Moons - Umbriel', url: 'https://science.nasa.gov/uranus/moons/umbriel/' },
      { label: 'NASA Uranian Satellite Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/uraniansatfact.html' },
    ],
    texture: {
      kind: 'procedural',
      note: 'Voyager 2 imaged only the southern hemisphere in 1986; this rendering is artistic, informed by that imagery.',
    },
  },
  {
    id: 'titania',
    name: 'Titania',
    type: 'moon',
    category: 'Major moon of Uranus',
    parent: 'uranus',
    color: 0xb3a49a,
    physical: {
      diameterKm: 1577,
      massKg: 3.5e21,
      gravity: 0.38,
      density: 1.71,
      tidallyLocked: true,
      tempMeanC: -200,
      albedo: 0.27,
    },
    satOrbit: { distanceKm: 436_300, periodDays: 8.7059 },
    positionAccuracy: 'approximate',
    atmosphere: 'None detected.',
    composition: 'Roughly half water ice and half rock, likely differentiated into a rocky core and icy mantle.',
    discovery: { by: 'William Herschel', year: 1787, how: 'his own 18.7-inch reflecting telescope' },
    overview:
      'Titania is the largest moon of Uranus, though at 1,577 km across it is still less than half the size of our Moon. Voyager 2 revealed a cratered gray-brown surface torn by enormous fault canyons - evidence that the moon’s interior once expanded and cracked its own crust.',
    concept: {
      title: 'A crust cracked from within',
      text: 'Water does something unusual when it freezes: it expands. As Titania’s interior slowly froze over billions of years, the growing ice pushed outward on the crust, stretching it until it fractured into vast canyon systems like Messina Chasmata. The scars of that ancient freeze are a reminder that ice is not just a surface coating out here - it is the structural rock of the outer Solar System.',
    },
    quickFacts: [
      'Messina Chasmata, its largest canyon system, runs roughly 1,500 km - about a third of the way around the moon.',
      'William Herschel spotted it in 1787, six years after he discovered Uranus itself.',
      'Though it is Uranus’ largest moon, it holds only about 1/20 the mass of our Moon.',
    ],
    missionIds: ['voyager2'],
    related: ['uranus', 'miranda', 'ariel', 'umbriel', 'oberon'],
    sources: [
      { label: 'NASA Uranus Moons - Titania', url: 'https://science.nasa.gov/uranus/moons/titania/' },
      { label: 'NASA Uranian Satellite Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/uraniansatfact.html' },
    ],
    texture: {
      kind: 'procedural',
      note: 'Voyager 2 imaged only the southern hemisphere in 1986; this rendering is artistic, informed by that imagery.',
    },
  },
  {
    id: 'oberon',
    name: 'Oberon',
    type: 'moon',
    category: 'Major moon of Uranus',
    parent: 'uranus',
    color: 0xa5968c,
    physical: {
      diameterKm: 1523,
      massKg: 3.0e21,
      gravity: 0.35,
      density: 1.63,
      tidallyLocked: true,
      tempMeanC: -200,
      albedo: 0.23,
    },
    satOrbit: { distanceKm: 583_500, periodDays: 13.4632 },
    positionAccuracy: 'approximate',
    atmosphere: 'None detected.',
    composition: 'Water ice and rock; dark material coats the floors of some large craters, possibly erupted from the interior.',
    discovery: { by: 'William Herschel', year: 1787, how: 'his own 18.7-inch reflecting telescope' },
    overview:
      'Oberon is the outermost of Uranus’ major moons and the most heavily cratered - an ancient icy surface that has barely changed in four billion years. Dark material pooled on some crater floors hints that muddy ice once seeped up from inside, but on the whole this is a world that switched off early.',
    concept: {
      title: 'Distance decides destiny',
      text: 'Line up Uranus’ moons by distance and a pattern appears: inner Miranda and Ariel show dramatic resurfacing, while outer Umbriel and Oberon keep their oldest faces. The closer a moon orbits, the stronger the tides and the more likely it is to be caught in resonances that flex and heat it. Oberon, orbiting farthest out, escaped that heating almost entirely - so its craters are a preserved record of the early Solar System’s bombardment.',
    },
    quickFacts: [
      'A mountain roughly 6 km high pokes above its edge in Voyager 2’s images - taller than any peak in the Alps.',
      'Herschel discovered Oberon and Titania on the same January night in 1787.',
      'At around -200 °C, its water-ice crust is as rigid as granite.',
    ],
    missionIds: ['voyager2'],
    related: ['uranus', 'miranda', 'ariel', 'umbriel', 'titania'],
    sources: [
      { label: 'NASA Uranus Moons - Oberon', url: 'https://science.nasa.gov/uranus/moons/oberon/' },
      { label: 'NASA Uranian Satellite Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/uraniansatfact.html' },
    ],
    texture: {
      kind: 'procedural',
      note: 'Voyager 2 imaged only the southern hemisphere in 1986; this rendering is artistic, informed by that imagery.',
    },
  },
];

export const NEPTUNE_MOONS: CatalogObject[] = [
  {
    id: 'triton',
    name: 'Triton',
    type: 'moon',
    category: 'Moon of Neptune',
    parent: 'neptune',
    color: 0xd8c9be,
    physical: {
      diameterKm: 2707,
      massKg: 2.14e22,
      gravity: 0.78,
      density: 2.06,
      tidallyLocked: true,
      tempMeanC: -235,
      albedo: 0.76,
    },
    satOrbit: {
      distanceKm: 354_760,
      periodDays: -5.8769,
      simplified: 'Real orbit is retrograde and inclined ~157° to Neptune’s equator; drawn here as an equatorial circle.',
    },
    positionAccuracy: 'approximate',
    atmosphere: 'A thin nitrogen atmosphere with a trace of methane - surface pressure about 1/70,000 of Earth’s.',
    composition: 'A dense rock-and-metal core making up about two-thirds of its mass, under a mantle of water ice frosted with nitrogen, methane and carbon-dioxide ices.',
    discovery: { by: 'William Lassell', year: 1846, how: '24-inch reflector, 17 days after Neptune’s discovery' },
    overview:
      'Triton is Neptune’s giant moon and the only large moon in the Solar System that orbits backwards, against its planet’s spin. Voyager 2 found a young, cantaloupe-textured landscape of nitrogen and methane ices, with dark geysers erupting through the frost even at -235 °C - the coldest surface ever measured on a Solar System body.',
    concept: {
      title: 'A captured Kuiper Belt object',
      text: 'Moons that form alongside their planet orbit in the direction the planet spins - Triton goes the other way. That retrograde orbit is the fingerprint of capture: Triton almost certainly formed in the Kuiper Belt, like Pluto, wandered too close, and was snared by Neptune’s gravity - a violent event that would have wrecked any moons Neptune had before. Its size, density and surface ices are strikingly Pluto-like: Triton may be Pluto’s captured twin.',
    },
    quickFacts: [
      'At -235 °C its surface is the coldest ever measured in the Solar System - yet geysers still erupt through the ice.',
      'William Lassell discovered it just 17 days after Neptune itself was found in 1846.',
      'Its backwards orbit is slowly decaying: in roughly 3.6 billion years Neptune’s tides will tear it apart into a ring.',
    ],
    missionIds: ['voyager2'],
    related: ['neptune', 'pluto'],
    sources: [
      { label: 'NASA Neptune Moons - Triton', url: 'https://science.nasa.gov/neptune/moons/triton/' },
      { label: 'NASA Neptunian Satellite Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptuniansatfact.html' },
    ],
    texture: {
      file: 'triton.webp',
      kind: 'photo',
      credit: 'NASA/JPL/USGS (Voyager 2 color mosaic)',
      note: 'Voyager 2 imaged less than half of Triton; remaining areas are interpolated fill.',
    },
  },
];

export const PLUTO_MOONS: CatalogObject[] = [
  {
    id: 'charon',
    name: 'Charon',
    type: 'moon',
    category: 'Moon of Pluto',
    parent: 'pluto',
    color: 0xa89f9a,
    physical: {
      diameterKm: 1212,
      massKg: 1.59e21,
      gravity: 0.29,
      density: 1.7,
      tidallyLocked: true,
      tempMeanC: -220,
    },
    satOrbit: { distanceKm: 19_591, periodDays: 6.3872 },
    positionAccuracy: 'approximate',
    atmosphere: 'None detected - New Horizons set very strict upper limits.',
    composition: 'A water-ice crust over a rocky interior; ammonia compounds on the surface hint at ancient cryovolcanism.',
    discovery: { by: 'James Christy', year: 1978, how: 'photographic plates at the US Naval Observatory' },
    overview:
      'Charon is fully half the diameter of Pluto itself - so large in proportion that the pair are best described as a double world. New Horizons revealed a gray, canyon-torn surface capped by a dark red north pole, informally named Mordor Macula.',
    concept: {
      title: 'A true binary',
      text: 'Every planet and moon really orbit a shared balance point, the barycentre - normally buried deep inside the bigger body. Charon is so massive relative to Pluto that their barycentre sits in open space between them, so both worlds visibly circle it every 6.4 days. They are also mutually tidally locked: each permanently shows the same face to the other, hanging motionless in the other’s sky.',
    },
    quickFacts: [
      'Relative to its parent, it is the largest moon in the Solar System - half of Pluto’s diameter.',
      'Its dark red pole is painted by methane that escapes Pluto, freezes onto Charon, and is reddened by radiation.',
      'James Christy spotted it in 1978 as a bump on blurry photographic plates - and named it partly after his wife Charlene.',
    ],
    missionIds: ['newhorizons'],
    related: ['pluto', 'triton'],
    sources: [
      { label: 'NASA Pluto Moons - Charon', url: 'https://science.nasa.gov/dwarf-planets/pluto/moons/charon/' },
      { label: 'NASA Pluto Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/plutofact.html' },
    ],
    texture: {
      file: 'charon.webp',
      kind: 'photo',
      credit: 'NASA/JHUAPL/SwRI/USGS (New Horizons LORRI/MVIC mosaic)',
      note: 'Areas unseen during the flyby are filled.',
    },
  },
];
