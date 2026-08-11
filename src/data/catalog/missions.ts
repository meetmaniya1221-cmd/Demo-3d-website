/**
 * Spacecraft missions referenced throughout the catalog.
 *
 * Ordered by launch year. Statuses are current as of 2026. Values from the
 * NASA Solar System Exploration mission pages, the NSSDCA Master Catalog and
 * the ESA / JAXA mission sites.
 */
import type { Mission } from '../types';

export const MISSIONS: Mission[] = [
  {
    id: 'apollo11',
    name: 'Apollo 11',
    agency: 'NASA',
    launched: 1969,
    ended: 1969,
    status: 'completed',
    craft: 'Crewed lander',
    targets: ['moon'],
    summary:
      'The first crewed landing on another world. On 20 July 1969 Neil Armstrong and Buzz Aldrin walked on the Moon’s Sea of Tranquility while Michael Collins orbited above.',
    highlights: [
      'First humans on another world - 20 July 1969.',
      'Returned 21.5 kg of lunar rock and soil.',
      'Armstrong and Aldrin spent about 21.5 hours on the surface.',
    ],
    url: 'https://www.nasa.gov/mission/apollo-11/',
    sources: [
      { label: 'NASA - Apollo 11', url: 'https://www.nasa.gov/mission/apollo-11/' },
      { label: 'NSSDCA - Apollo 11', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-059A' },
    ],
  },
  {
    id: 'pioneer10',
    name: 'Pioneer 10',
    agency: 'NASA',
    launched: 1972,
    ended: 2003,
    status: 'completed',
    craft: 'Flyby probe',
    targets: ['jupiter', 'main-belt'],
    summary:
      'The trailblazer of the outer Solar System: first spacecraft through the asteroid belt and first to fly past Jupiter, in December 1973. Its last faint signal was heard in January 2003, from roughly 12 billion km away.',
    highlights: [
      'First spacecraft to cross the asteroid belt.',
      'First close-up images of Jupiter (December 1973).',
      'Carries a gold plaque showing humans and Earth’s location.',
    ],
    url: 'https://science.nasa.gov/mission/pioneer-10/',
    sources: [
      { label: 'NASA Science - Pioneer 10', url: 'https://science.nasa.gov/mission/pioneer-10/' },
      { label: 'NSSDCA - Pioneer 10', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1972-012A' },
    ],
  },
  {
    id: 'mariner10',
    name: 'Mariner 10',
    agency: 'NASA',
    launched: 1973,
    ended: 1975,
    status: 'completed',
    craft: 'Flyby probe',
    targets: ['mercury', 'venus'],
    summary:
      'The first spacecraft to visit Mercury, and the first ever to use one planet’s gravity (Venus) to slingshot to another. Its three flybys in 1974-75 mapped about 45% of Mercury’s surface.',
    highlights: [
      'First gravity-assist manoeuvre in history, at Venus.',
      'Three Mercury flybys; mapped ~45% of the surface.',
      'Discovered Mercury’s surprising magnetic field.',
    ],
    url: 'https://science.nasa.gov/mission/mariner-10/',
    sources: [
      { label: 'NASA Science - Mariner 10', url: 'https://science.nasa.gov/mission/mariner-10/' },
      { label: 'NSSDCA - Mariner 10', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1973-085A' },
    ],
  },
  {
    id: 'viking1',
    name: 'Viking 1',
    agency: 'NASA',
    launched: 1975,
    ended: 1982,
    status: 'completed',
    craft: 'Orbiter + lander',
    targets: ['mars', 'phobos', 'deimos'],
    summary:
      'Viking 1 achieved the first fully successful landing on Mars on 20 July 1976 and sent back the first photographs ever taken from the Martian surface. Its lander kept working until November 1982.',
    highlights: [
      'First successful Mars landing (20 July 1976).',
      'First photos from the surface of Mars.',
      'Ran the first life-detection experiments on another planet.',
    ],
    url: 'https://science.nasa.gov/mission/viking-1/',
    sources: [
      { label: 'NASA Science - Viking 1', url: 'https://science.nasa.gov/mission/viking-1/' },
      { label: 'NSSDCA - Viking 1 Orbiter', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1975-075A' },
    ],
  },
  {
    id: 'voyager2',
    name: 'Voyager 2',
    agency: 'NASA',
    launched: 1977,
    status: 'active',
    craft: 'Flyby probe',
    targets: ['jupiter', 'saturn', 'uranus', 'neptune', 'triton', 'io', 'europa', 'ganymede', 'callisto', 'miranda'],
    summary:
      'Launched 16 days before its twin, Voyager 2 is the only spacecraft ever to visit all four giant planets - Jupiter, Saturn, Uranus and Neptune. It entered interstellar space in 2018 and is still returning data.',
    highlights: [
      'Only spacecraft to visit Uranus (1986) and Neptune (1989).',
      'Grand Tour of all four giant planets.',
      'Crossed into interstellar space in 2018.',
    ],
    url: 'https://science.nasa.gov/mission/voyager-2/',
    sources: [
      { label: 'NASA Science - Voyager 2', url: 'https://science.nasa.gov/mission/voyager-2/' },
      { label: 'NSSDCA - Voyager 2', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1977-076A' },
    ],
  },
  {
    id: 'voyager1',
    name: 'Voyager 1',
    agency: 'NASA',
    launched: 1977,
    status: 'active',
    craft: 'Flyby probe',
    targets: ['jupiter', 'saturn', 'titan', 'io', 'europa', 'ganymede', 'callisto'],
    summary:
      'The most distant human-made object, now roughly 25 billion km from the Sun. After historic flybys of Jupiter, Saturn and Titan, Voyager 1 became the first spacecraft to enter interstellar space in 2012.',
    highlights: [
      'First spacecraft in interstellar space (2012).',
      'Discovered active volcanoes on Io.',
      'Took the famous “Pale Blue Dot” photo of Earth in 1990.',
    ],
    url: 'https://science.nasa.gov/mission/voyager-1/',
    sources: [
      { label: 'NASA Science - Voyager 1', url: 'https://science.nasa.gov/mission/voyager-1/' },
      { label: 'NSSDCA - Voyager 1', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1977-084A' },
    ],
  },
  {
    id: 'giotto',
    name: 'Giotto',
    agency: 'ESA',
    launched: 1985,
    ended: 1992,
    status: 'completed',
    craft: 'Flyby probe',
    targets: ['halley'],
    summary:
      'ESA’s first deep-space mission dived to within 596 km of Halley’s Comet in March 1986, returning the first close-up images of a comet nucleus - a dark, peanut-shaped body venting jets of gas and dust.',
    highlights: [
      'First close-up images of a comet nucleus.',
      'Passed just 596 km from Halley’s nucleus.',
      'Went on to fly by comet Grigg-Skjellerup in 1992.',
    ],
    url: 'https://www.esa.int/Science_Exploration/Space_Science/Giotto_overview',
    sources: [
      { label: 'ESA - Giotto', url: 'https://www.esa.int/Science_Exploration/Space_Science/Giotto_overview' },
      { label: 'NSSDCA - Giotto', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1985-056A' },
    ],
  },
  {
    id: 'magellan',
    name: 'Magellan',
    agency: 'NASA',
    launched: 1989,
    ended: 1994,
    status: 'completed',
    craft: 'Orbiter',
    targets: ['venus'],
    summary:
      'Magellan used radar to see through Venus’ permanent clouds, mapping 98% of the surface and revealing a young volcanic world with remarkably few impact craters. It burned up in the atmosphere it studied in 1994.',
    highlights: [
      'Radar-mapped 98% of Venus’ hidden surface.',
      'Revealed a volcanically resurfaced, geologically young world.',
      'Pioneered aerobraking before its final plunge in 1994.',
    ],
    url: 'https://science.nasa.gov/mission/magellan/',
    sources: [
      { label: 'NASA Science - Magellan', url: 'https://science.nasa.gov/mission/magellan/' },
      { label: 'NSSDCA - Magellan', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1989-033B' },
    ],
  },
  {
    id: 'galileo',
    name: 'Galileo',
    agency: 'NASA',
    launched: 1989,
    ended: 2003,
    status: 'completed',
    craft: 'Orbiter',
    targets: ['jupiter', 'io', 'europa', 'ganymede', 'callisto'],
    summary:
      'The first spacecraft to orbit an outer planet, Galileo circled Jupiter from 1995 to 2003 and dropped a probe into its atmosphere. In 2003 it was deliberately flown into Jupiter so it could never crash into - and contaminate - Europa’s possible ocean.',
    highlights: [
      'First orbiter of an outer planet.',
      'Found strong evidence for a salty ocean under Europa’s ice.',
      'Dropped a probe into Jupiter’s atmosphere in 1995.',
      'Ended with a deliberate plunge to protect Europa.',
    ],
    url: 'https://science.nasa.gov/mission/galileo/',
    sources: [
      { label: 'NASA Science - Galileo', url: 'https://science.nasa.gov/mission/galileo/' },
      { label: 'NSSDCA - Galileo', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1989-084B' },
    ],
  },
  {
    id: 'cassini',
    name: 'Cassini-Huygens',
    agency: 'NASA/ESA/ASI',
    launched: 1997,
    ended: 2017,
    status: 'completed',
    craft: 'Orbiter + lander',
    targets: ['saturn', 'titan', 'enceladus', 'iapetus', 'rhea', 'dione', 'tethys', 'mimas', 'hyperion', 'phoebe'],
    summary:
      'Cassini orbited Saturn for 13 years, delivering ESA’s Huygens probe to the surface of Titan in January 2005 - the first landing in the outer Solar System. It ended with a deliberate plunge into Saturn in 2017 to protect the potentially habitable moons Enceladus and Titan.',
    highlights: [
      'Huygens landed on Titan on 14 January 2005.',
      'Discovered water-ice plumes erupting from Enceladus.',
      'Revealed Titan’s methane lakes and seas.',
      'Grand Finale: 22 dives between Saturn and its rings.',
    ],
    url: 'https://science.nasa.gov/mission/cassini/',
    sources: [
      { label: 'NASA Science - Cassini', url: 'https://science.nasa.gov/mission/cassini/' },
      { label: 'NSSDCA - Cassini', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1997-061A' },
    ],
  },
  {
    id: 'marsexpress',
    name: 'Mars Express',
    agency: 'ESA',
    launched: 2003,
    status: 'active',
    craft: 'Orbiter',
    targets: ['mars', 'phobos', 'deimos'],
    summary:
      'ESA’s first mission to another planet has been orbiting Mars since December 2003. Its cameras and radar have mapped buried water ice, ancient water-carved terrain, and made the closest-ever flybys of Phobos.',
    highlights: [
      'ESA’s first planetary orbiter - still working after 20+ years.',
      'Radar found water ice buried beneath the surface.',
      'Made the closest flybys of the moon Phobos.',
    ],
    url: 'https://www.esa.int/Science_Exploration/Space_Science/Mars_Express',
    sources: [
      { label: 'ESA - Mars Express', url: 'https://www.esa.int/Science_Exploration/Space_Science/Mars_Express' },
      { label: 'NSSDCA - Mars Express', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2003-022A' },
    ],
  },
  {
    id: 'rosetta',
    name: 'Rosetta',
    agency: 'ESA',
    launched: 2004,
    ended: 2016,
    status: 'completed',
    craft: 'Orbiter + lander',
    targets: ['67p'],
    summary:
      'After a 10-year chase, Rosetta became the first spacecraft to orbit a comet, escorting 67P/Churyumov-Gerasimenko around the Sun. Its lander Philae made the first-ever touchdown on a comet in November 2014.',
    highlights: [
      'First spacecraft to orbit a comet (August 2014).',
      'Philae made the first landing on a comet nucleus.',
      'Watched 67P wake up as it approached the Sun.',
      'Ended with a controlled descent onto the comet in 2016.',
    ],
    url: 'https://www.esa.int/Science_Exploration/Space_Science/Rosetta',
    sources: [
      { label: 'ESA - Rosetta', url: 'https://www.esa.int/Science_Exploration/Space_Science/Rosetta' },
      { label: 'NSSDCA - Rosetta', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2004-006A' },
    ],
  },
  {
    id: 'messenger',
    name: 'MESSENGER',
    agency: 'NASA',
    launched: 2004,
    ended: 2015,
    status: 'completed',
    craft: 'Orbiter',
    targets: ['mercury'],
    summary:
      'The first spacecraft to orbit Mercury (2011-2015), MESSENGER mapped the entire planet and confirmed something remarkable: water ice hiding in permanently shadowed craters at the poles of the Sun’s closest planet.',
    highlights: [
      'First Mercury orbiter; mapped 100% of the planet.',
      'Confirmed water ice in shadowed polar craters.',
      'Ended by impacting Mercury in April 2015.',
    ],
    url: 'https://science.nasa.gov/mission/messenger/',
    sources: [
      { label: 'NASA Science - MESSENGER', url: 'https://science.nasa.gov/mission/messenger/' },
      { label: 'NSSDCA - MESSENGER', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2004-030A' },
    ],
  },
  {
    id: 'newhorizons',
    name: 'New Horizons',
    agency: 'NASA',
    launched: 2006,
    status: 'active',
    craft: 'Flyby probe',
    targets: ['pluto', 'charon', 'kuiper-belt', 'jupiter'],
    summary:
      'New Horizons gave humanity its first close look at Pluto in July 2015, revealing nitrogen-ice glaciers and towering water-ice mountains. It then flew past the Kuiper belt object Arrokoth in 2019 - the most distant world ever explored - and continues outward on an extended Kuiper belt mission.',
    highlights: [
      'First flyby of Pluto and Charon (14 July 2015).',
      'Explored Arrokoth, the most distant object ever visited.',
      'Fastest launch from Earth: ~58,500 km/h.',
    ],
    url: 'https://science.nasa.gov/mission/new-horizons/',
    sources: [
      { label: 'NASA Science - New Horizons', url: 'https://science.nasa.gov/mission/new-horizons/' },
      { label: 'NSSDCA - New Horizons', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2006-001A' },
    ],
  },
  {
    id: 'dawn',
    name: 'Dawn',
    agency: 'NASA',
    launched: 2007,
    ended: 2018,
    status: 'completed',
    craft: 'Orbiter',
    targets: ['vesta', 'ceres'],
    summary:
      'Powered by gentle ion engines, Dawn became the only spacecraft ever to orbit two different deep-space worlds: the asteroid Vesta (2011-2012) and the dwarf planet Ceres (2015-2018). It ran out of fuel in 2018 and remains in a stable orbit around Ceres.',
    highlights: [
      'Only spacecraft to orbit two extraterrestrial worlds.',
      'Found bright salt deposits in Ceres’ Occator crater.',
      'Proved ion propulsion for deep-space exploration.',
    ],
    url: 'https://science.nasa.gov/mission/dawn/',
    sources: [
      { label: 'NASA Science - Dawn', url: 'https://science.nasa.gov/mission/dawn/' },
      { label: 'NSSDCA - Dawn', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2007-043A' },
    ],
  },
  {
    id: 'lro',
    name: 'Lunar Reconnaissance Orbiter',
    agency: 'NASA',
    launched: 2009,
    status: 'active',
    craft: 'Orbiter',
    targets: ['moon'],
    summary:
      'LRO has been mapping the Moon in extraordinary detail since 2009, measuring some of the coldest temperatures known in the Solar System inside permanently shadowed polar craters. Its maps guide the Artemis programme’s choice of landing sites.',
    highlights: [
      'Sharpest global maps of the Moon ever made.',
      'Found evidence of water ice in shadowed polar craters.',
      'Photographed the Apollo landing sites from orbit.',
    ],
    url: 'https://science.nasa.gov/mission/lro/',
    sources: [
      { label: 'NASA Science - LRO', url: 'https://science.nasa.gov/mission/lro/' },
      { label: 'NSSDCA - LRO', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2009-031A' },
    ],
  },
  {
    id: 'juno',
    name: 'Juno',
    agency: 'NASA',
    launched: 2011,
    ended: 2025,
    status: 'completed',
    craft: 'Orbiter',
    targets: ['jupiter', 'io', 'europa', 'ganymede'],
    summary:
      'Juno looped over Jupiter’s poles from 2016 to 2025, peering beneath the clouds to map the planet’s interior, gravity and magnetic field. Its extended mission added daring close flybys of Ganymede, Europa and volcanic Io.',
    highlights: [
      'Revealed geometric clusters of cyclones at Jupiter’s poles.',
      'Found Jupiter’s core is “fuzzy” - dilute, not compact.',
      'First solar-powered spacecraft at Jupiter.',
      'Closest Io flybys in over 20 years.',
    ],
    url: 'https://science.nasa.gov/mission/juno/',
    sources: [
      { label: 'NASA Science - Juno', url: 'https://science.nasa.gov/mission/juno/' },
      { label: 'NSSDCA - Juno', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2011-040A' },
    ],
  },
  {
    id: 'curiosity',
    name: 'Curiosity (Mars Science Laboratory)',
    agency: 'NASA',
    launched: 2011,
    status: 'active',
    craft: 'Rover',
    targets: ['mars'],
    summary:
      'The car-sized Curiosity rover was lowered into Gale Crater by a rocket-powered “sky crane” in August 2012. It proved the crater once held a long-lived freshwater lake - an environment that could have supported microbial life - and is still climbing Mount Sharp today.',
    highlights: [
      'Landed with the audacious sky-crane manoeuvre.',
      'Proved Gale Crater once hosted a habitable lake.',
      'Detected organic molecules in ancient mudstone.',
    ],
    url: 'https://science.nasa.gov/mission/msl-curiosity/',
    sources: [
      { label: 'NASA Science - Curiosity', url: 'https://science.nasa.gov/mission/msl-curiosity/' },
      { label: 'NSSDCA - Mars Science Laboratory', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2011-070A' },
    ],
  },
  {
    id: 'hayabusa2',
    name: 'Hayabusa2',
    agency: 'JAXA',
    launched: 2014,
    status: 'active',
    craft: 'Sample return',
    targets: ['ryugu'],
    summary:
      'Hayabusa2 touched down twice on the carbon-rich asteroid Ryugu, even firing an impactor to blast open a crater and grab pristine subsurface material. It parachuted 5.4 g of asteroid to Earth in December 2020 and is now cruising toward the tiny fast-spinning asteroid 1998 KY26, arriving in 2031.',
    highlights: [
      'Returned 5.4 g of Ryugu to Earth in 2020.',
      'First mission to collect subsurface asteroid material.',
      'Extended mission targets asteroid 1998 KY26 in 2031.',
    ],
    url: 'https://www.hayabusa2.jaxa.jp/en/',
    sources: [
      { label: 'JAXA - Hayabusa2', url: 'https://www.hayabusa2.jaxa.jp/en/' },
      { label: 'NSSDCA - Hayabusa 2', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2014-076A' },
    ],
  },
  {
    id: 'osirisrex',
    name: 'OSIRIS-REx',
    agency: 'NASA',
    launched: 2016,
    ended: 2023,
    status: 'completed',
    craft: 'Sample return',
    targets: ['bennu'],
    summary:
      'OSIRIS-REx collected a generous sample from the rubble-pile asteroid Bennu and delivered 121.6 g to the Utah desert in September 2023 - NASA’s first asteroid sample return. The spacecraft flew on as OSIRIS-APEX, bound for the asteroid Apophis in 2029.',
    highlights: [
      'Returned 121.6 g of Bennu - NASA’s first asteroid sample.',
      'Found Bennu’s surface was loose rubble, not solid rock.',
      'Continues to asteroid Apophis as OSIRIS-APEX.',
    ],
    url: 'https://science.nasa.gov/mission/osiris-rex/',
    sources: [
      { label: 'NASA Science - OSIRIS-REx', url: 'https://science.nasa.gov/mission/osiris-rex/' },
      { label: 'NSSDCA - OSIRIS-REx', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2016-055A' },
    ],
  },
  {
    id: 'parker',
    name: 'Parker Solar Probe',
    agency: 'NASA',
    launched: 2018,
    status: 'active',
    craft: 'Solar probe',
    targets: ['sun'],
    summary:
      'Parker Solar Probe is the first spacecraft to fly through the Sun’s corona, protected by a carbon heat shield. In December 2024 it skimmed just 6.1 million km above the solar surface at about 690,000 km/h - the fastest any human-made object has ever moved.',
    highlights: [
      'First spacecraft to touch the Sun’s corona (2021).',
      'Fastest human-made object: ~690,000 km/h.',
      'Closest solar approach: ~6.1 million km.',
    ],
    url: 'https://science.nasa.gov/mission/parker-solar-probe/',
    sources: [
      { label: 'NASA Science - Parker Solar Probe', url: 'https://science.nasa.gov/mission/parker-solar-probe/' },
      { label: 'NSSDCA - Parker Solar Probe', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2018-065A' },
    ],
  },
  {
    id: 'bepicolombo',
    name: 'BepiColombo',
    agency: 'ESA/JAXA',
    launched: 2018,
    status: 'en route',
    craft: 'Orbiter',
    targets: ['mercury'],
    summary:
      'BepiColombo carries two orbiters stacked together - ESA’s Mercury Planetary Orbiter and JAXA’s Mio - on a long spiral inward using nine planetary flybys. Mercury orbit insertion is expected in late 2026, when the pair will separate to study the planet and its magnetosphere.',
    highlights: [
      'Two orbiters in one: ESA’s MPO and JAXA’s Mio.',
      'Completed six Mercury flybys during its cruise.',
      'Mercury orbit insertion expected late 2026.',
    ],
    url: 'https://www.esa.int/Science_Exploration/Space_Science/BepiColombo',
    sources: [
      { label: 'ESA - BepiColombo', url: 'https://www.esa.int/Science_Exploration/Space_Science/BepiColombo' },
      { label: 'NSSDCA - BepiColombo', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2018-080A' },
    ],
  },
  {
    id: 'perseverance',
    name: 'Perseverance',
    agency: 'NASA',
    launched: 2020,
    status: 'active',
    craft: 'Rover',
    targets: ['mars'],
    summary:
      'Perseverance landed in Jezero Crater in February 2021 to explore an ancient river delta and cache rock samples for a future return to Earth. It carried the Ingenuity helicopter, which made the first powered flight on another planet and went on to fly 72 times.',
    highlights: [
      'Ingenuity: first powered flight on another planet.',
      'Caching samples for a future Mars Sample Return.',
      'MOXIE made oxygen from the Martian atmosphere.',
    ],
    url: 'https://science.nasa.gov/mission/mars-2020-perseverance/',
    sources: [
      { label: 'NASA Science - Perseverance', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/' },
      { label: 'NSSDCA - Mars 2020', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2020-052A' },
    ],
  },
  {
    id: 'lucy',
    name: 'Lucy',
    agency: 'NASA',
    launched: 2021,
    status: 'en route',
    craft: 'Flyby probe',
    targets: ['main-belt'],
    summary:
      'Lucy is on a 12-year tour of the Jupiter Trojan asteroids - primitive leftovers trapped in Jupiter’s orbit - with its main tour beginning in 2027. Practice flybys of the main-belt asteroids Dinkinesh and Donaldjohanson have already delivered surprises.',
    highlights: [
      'Will visit more asteroids than any previous mission.',
      'Discovered Dinkinesh’s contact-binary moon, Selam.',
      'First Trojan encounter, Eurybates, comes in August 2027.',
    ],
    url: 'https://science.nasa.gov/mission/lucy/',
    sources: [
      { label: 'NASA Science - Lucy', url: 'https://science.nasa.gov/mission/lucy/' },
      { label: 'NSSDCA - Lucy', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2021-093A' },
    ],
  },
  {
    id: 'dart',
    name: 'DART',
    agency: 'NASA',
    launched: 2021,
    ended: 2022,
    status: 'completed',
    craft: 'Impactor',
    targets: [],
    summary:
      'The first planetary-defence test: DART deliberately crashed into the small asteroid moon Dimorphos in September 2022 and shortened its orbit around Didymos by 32 minutes. Humanity has now demonstrably changed the motion of a celestial body.',
    highlights: [
      'First test of asteroid deflection by kinetic impact.',
      'Shortened Dimorphos’ orbit by 32 minutes.',
      'Struck its 160 m target at ~22,500 km/h.',
    ],
    url: 'https://science.nasa.gov/mission/dart/',
    sources: [
      { label: 'NASA Science - DART', url: 'https://science.nasa.gov/mission/dart/' },
      { label: 'NSSDCA - DART', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2021-110A' },
    ],
  },
  {
    id: 'jwst',
    name: 'James Webb Space Telescope',
    agency: 'NASA/ESA/CSA',
    launched: 2021,
    status: 'active',
    craft: 'Space telescope',
    targets: ['jupiter', 'mars', 'kuiper-belt'],
    summary:
      'The most powerful space telescope ever built, JWST observes the infrared universe with a 6.5 m gold-coated mirror from a point 1.5 million km beyond Earth. Alongside the distant cosmos it studies Solar System targets, from Jupiter’s auroras to the surfaces of Kuiper belt worlds.',
    highlights: [
      '6.5 m segmented mirror - largest ever flown.',
      'Orbits the Sun-Earth L2 point, 1.5 million km away.',
      'Imaged Jupiter’s auroras and faint rings in infrared.',
    ],
    url: 'https://science.nasa.gov/mission/webb/',
    sources: [
      { label: 'NASA Science - James Webb Space Telescope', url: 'https://science.nasa.gov/mission/webb/' },
      { label: 'NSSDCA - JWST', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2021-130A' },
    ],
  },
  {
    id: 'artemis1',
    name: 'Artemis I',
    agency: 'NASA',
    launched: 2022,
    ended: 2022,
    status: 'completed',
    craft: 'Uncrewed test flight',
    targets: ['moon'],
    summary:
      'The first flight of NASA’s giant SLS rocket sent an uncrewed Orion capsule around the Moon in late 2022, reaching about 432,000 km from Earth - farther than any spacecraft built for humans has ever gone. It cleared the way for crewed Artemis flights.',
    highlights: [
      'First launch of the Space Launch System.',
      'Orion travelled ~432,000 km from Earth - a record for a human-rated craft.',
      '25.5-day shakedown flight around the Moon.',
    ],
    url: 'https://www.nasa.gov/mission/artemis-i/',
    sources: [
      { label: 'NASA - Artemis I', url: 'https://www.nasa.gov/mission/artemis-i/' },
      { label: 'NSSDCA - Artemis 1 (Orion)', url: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=2022-156A' },
    ],
  },
  {
    id: 'psyche-mission',
    name: 'Psyche',
    agency: 'NASA',
    launched: 2023,
    status: 'en route',
    craft: 'Orbiter',
    targets: ['psyche'],
    summary:
      'Psyche is cruising on solar-electric propulsion toward the metal-rich asteroid of the same name, arriving in 2029. The asteroid may be the exposed nickel-iron core of a shattered planetesimal - a chance to study a planetary core without digging.',
    highlights: [
      'First mission to a metal-rich asteroid.',
      'Arrives at asteroid Psyche in 2029.',
      'Demonstrated laser communications from deep space.',
    ],
    url: 'https://science.nasa.gov/mission/psyche/',
    sources: [
      { label: 'NASA Science - Psyche', url: 'https://science.nasa.gov/mission/psyche/' },
      { label: 'NASA JPL - Psyche', url: 'https://www.jpl.nasa.gov/missions/psyche/' },
    ],
  },
  {
    id: 'europaclipper',
    name: 'Europa Clipper',
    agency: 'NASA',
    launched: 2024,
    status: 'en route',
    craft: 'Orbiter',
    targets: ['europa', 'jupiter'],
    summary:
      'The largest spacecraft NASA has ever built for a planetary mission is on its way to Jupiter, arriving in 2030. From Jupiter orbit it will make dozens of close Europa flybys, using ice-penetrating radar to probe the ocean hiding beneath the moon’s frozen shell.',
    highlights: [
      'Solar arrays span more than 30 m tip to tip.',
      'Plans roughly 49 close flybys of Europa.',
      'Will sound Europa’s ice shell and ocean with radar.',
    ],
    url: 'https://science.nasa.gov/mission/europa-clipper/',
    sources: [
      { label: 'NASA Science - Europa Clipper', url: 'https://science.nasa.gov/mission/europa-clipper/' },
      { label: 'NASA - Europa Clipper mission site', url: 'https://europa.nasa.gov/' },
    ],
  },
];
