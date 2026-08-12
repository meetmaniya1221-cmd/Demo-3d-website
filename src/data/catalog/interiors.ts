/**
 * Interior structure models for the cross-section view.
 *
 * Layer radii are fractions of each body's mean radius, from published
 * NASA / mission results. Every layer carries a knowledge tag: only Earth,
 * the Moon, Mars and the Sun have been probed directly (seismometers /
 * helioseismology); everything else is inferred from bulk density, gravity
 * fields, rotation and magnetic data - and is labelled as modelled.
 */
import type { Interior } from '../types';

const NASA = (label: string, url: string) => ({ label, url });

export const INTERIORS: Record<string, Interior> = {
  sun: {
    layers: [
      {
        name: 'Core',
        tagline: 'Fusion reactions · ~15 million °C',
        outerRadiusFraction: 0.25,
        color: 0xfff3c4,
        note: 'Hydrogen fuses into helium at ~15 million °C - the engine of the Solar System.',
        knowledge: 'observed',
      },
      {
        name: 'Radiative zone',
        tagline: 'Heat radiates outward',
        outerRadiusFraction: 0.7,
        color: 0xffc069,
        note: 'Photons random-walk outward for tens of thousands of years.',
        knowledge: 'observed',
      },
      {
        name: 'Convective zone',
        tagline: 'Heat circles in thermal columns',
        outerRadiusFraction: 0.99,
        color: 0xf08b3c,
        note: 'Hot plasma rises and sinks like water boiling in a pot.',
        knowledge: 'observed',
      },
      {
        name: 'Photosphere',
        tagline: 'Visible surface · ~5,500 °C',
        outerRadiusFraction: 1,
        thicknessKm: 400, // drawn thicker than true scale so it stays visible
        color: 0xffe9b8,
        note: 'The visible "surface": a ~400 km-thin layer at 5,500 °C.',
        knowledge: 'observed',
      },
    ],
    evidence:
      'Helioseismology - reading the Sun’s surface oscillations - has mapped these zones directly; the core’s fusion is confirmed by detected solar neutrinos.',
    sources: [NASA('NASA - Sun facts', 'https://science.nasa.gov/sun/facts/')],
  },

  mercury: {
    layers: [
      {
        name: 'Solid inner core',
        outerRadiusFraction: 0.41,
        color: 0xffd9a0,
        note: 'A solid iron centre, suggested by MESSENGER spin and gravity data.',
        knowledge: 'modelled',
      },
      {
        name: 'Molten outer core',
        outerRadiusFraction: 0.83,
        color: 0xe8a25c,
        note: 'Enormous for the planet’s size - 83% of the radius is metal.',
        knowledge: 'modelled',
      },
      {
        name: 'Mantle',
        outerRadiusFraction: 0.99,
        color: 0x9b7f68,
        note: 'A comparatively thin rocky shell.',
        knowledge: 'modelled',
      },
      {
        name: 'Crust',
        outerRadiusFraction: 1,
        color: 0xb5a99a,
        note: 'Ancient, cratered, and laced with shrinkage scarps.',
        knowledge: 'modelled',
      },
    ],
    evidence:
      'MESSENGER measured Mercury’s libration (a tiny rotational wobble) and gravity field; both demand a huge, partly molten metallic core.',
    sources: [NASA('NASA - Mercury facts', 'https://science.nasa.gov/mercury/facts/')],
  },

  venus: {
    layers: [
      {
        name: 'Iron core',
        outerRadiusFraction: 0.5,
        color: 0xffcf94,
        note: 'Probably similar to Earth’s; whether any of it is solid is unknown.',
        knowledge: 'modelled',
      },
      {
        name: 'Rocky mantle',
        outerRadiusFraction: 0.99,
        color: 0xc27b4e,
        note: 'Hot silicate rock; sluggish convection may drive the volcanism.',
        knowledge: 'modelled',
      },
      {
        name: 'Basalt crust',
        outerRadiusFraction: 1,
        color: 0xe6c689,
        note: 'No plate tectonics - the whole surface seems to renew in rare global episodes.',
        knowledge: 'modelled',
      },
    ],
    evidence:
      'No seismometer has survived on Venus, so its interior is inferred from its Earth-like size and density. The absence of a magnetic field hints its core stirs differently than Earth’s.',
    sources: [NASA('NASA - Venus facts', 'https://science.nasa.gov/venus/facts/')],
  },

  earth: {
    layers: [
      {
        name: 'Inner core',
        outerRadiusFraction: 0.19,
        color: 0xfff1b8,
        note: 'Solid iron-nickel, about the size of Pluto, at ~5,400 °C.',
        knowledge: 'observed',
      },
      {
        name: 'Outer core',
        outerRadiusFraction: 0.55,
        color: 0xffb35c,
        note: 'Flowing liquid metal - the dynamo that makes the magnetic field.',
        knowledge: 'observed',
      },
      {
        name: 'Mantle',
        outerRadiusFraction: 0.99,
        color: 0xc06a3e,
        note: 'Slowly convecting solid rock, driving plate tectonics above.',
        knowledge: 'observed',
      },
      {
        name: 'Crust',
        outerRadiusFraction: 1,
        color: 0x6fa8dc,
        note: 'A skin 5-70 km thick - proportionally thinner than an apple’s peel.',
        knowledge: 'observed',
      },
    ],
    evidence:
      'Earthquake waves crossing the planet reveal each boundary directly - seismology gives Earth the best-known interior of any world.',
    sources: [NASA('NASA - Earth facts', 'https://science.nasa.gov/earth/facts/')],
  },

  moon: {
    layers: [
      {
        name: 'Solid inner core',
        outerRadiusFraction: 0.14,
        color: 0xffe9c0,
        note: 'A small iron heart, ~480 km across.',
        knowledge: 'observed',
      },
      {
        name: 'Fluid outer core',
        outerRadiusFraction: 0.19,
        color: 0xe0a86e,
        note: 'A thin molten shell - too small to power a magnetic field today.',
        knowledge: 'observed',
      },
      {
        name: 'Mantle',
        outerRadiusFraction: 0.977,
        color: 0x8d8177,
        note: 'Solid rock, source of the ancient mare basalts.',
        knowledge: 'observed',
      },
      {
        name: 'Crust',
        outerRadiusFraction: 1,
        color: 0xc9c9c9,
        note: '~40 km thick on the near side, thicker on the far side.',
        knowledge: 'observed',
      },
    ],
    evidence:
      'Apollo seismometers recorded moonquakes for eight years, and NASA’s GRAIL mission mapped the gravity field - together they resolved the core, mantle and crust.',
    sources: [NASA('NASA - Moon facts', 'https://science.nasa.gov/moon/facts/')],
  },

  mars: {
    layers: [
      {
        name: 'Liquid core',
        outerRadiusFraction: 0.54,
        color: 0xffcf94,
        note: 'Molten iron-nickel-sulfur, larger and lighter than models expected.',
        knowledge: 'observed',
      },
      {
        name: 'Mantle',
        outerRadiusFraction: 0.985,
        color: 0xa85a35,
        note: 'A single rocky shell; its dying convection once fed the giant volcanoes.',
        knowledge: 'observed',
      },
      {
        name: 'Crust',
        outerRadiusFraction: 1,
        color: 0xd88a5e,
        note: '24-72 km thick, thicker in the southern highlands.',
        knowledge: 'observed',
      },
    ],
    evidence:
      'NASA’s InSight lander listened to marsquakes from 2018-2022; the waves passing through the planet measured the core, mantle and crust directly.',
    sources: [NASA('NASA - InSight', 'https://science.nasa.gov/mission/insight/')],
  },

  jupiter: {
    layers: [
      {
        name: 'Dilute core',
        outerRadiusFraction: 0.4,
        color: 0xffe3ae,
        note: 'Not a solid ball: heavy elements smeared through hydrogen - a "fuzzy" core.',
        knowledge: 'modelled',
      },
      {
        name: 'Metallic hydrogen',
        outerRadiusFraction: 0.8,
        color: 0xd9a06a,
        note: 'Hydrogen crushed until it conducts like a metal; source of the giant magnetic field.',
        knowledge: 'modelled',
      },
      {
        name: 'Molecular hydrogen envelope',
        outerRadiusFraction: 1,
        color: 0xc9a67c,
        note: 'The visible clouds are just the top of this bottomless atmosphere.',
        knowledge: 'modelled',
      },
    ],
    evidence:
      'Juno’s precise gravity measurements reshaped this model - the dilute core was a surprise. No probe can survive below the outer atmosphere.',
    sources: [NASA('NASA - Juno', 'https://science.nasa.gov/mission/juno/')],
  },

  saturn: {
    layers: [
      {
        name: 'Dilute core',
        outerRadiusFraction: 0.6,
        color: 0xffe9bd,
        note: 'Rock and ice mixed through hydrogen across 60% of the radius.',
        knowledge: 'modelled',
      },
      {
        name: 'Metallic hydrogen',
        outerRadiusFraction: 0.75,
        color: 0xdcb078,
        note: 'A conducting layer that generates the strikingly axis-aligned magnetic field.',
        knowledge: 'modelled',
      },
      {
        name: 'Molecular hydrogen envelope',
        outerRadiusFraction: 1,
        color: 0xe3ce9e,
        note: 'The least dense planet - it would float, if you could find the bathtub.',
        knowledge: 'modelled',
      },
    ],
    evidence:
      'Cassini’s final orbits measured the gravity field, and waves in Saturn’s own rings act as a natural seismometer - both point to a huge fuzzy core.',
    sources: [NASA('NASA - Cassini', 'https://science.nasa.gov/mission/cassini/')],
  },

  uranus: {
    layers: [
      {
        name: 'Rocky core',
        outerRadiusFraction: 0.2,
        color: 0xd8c39a,
        note: 'Roughly Earth-sized, under crushing pressure.',
        knowledge: 'modelled',
      },
      {
        name: 'Icy mantle',
        outerRadiusFraction: 0.8,
        color: 0x6fb2c9,
        note: 'A hot, dense fluid of water, ammonia and methane - "ice" only to astronomers.',
        knowledge: 'modelled',
      },
      {
        name: 'Hydrogen-helium atmosphere',
        outerRadiusFraction: 1,
        color: 0x9fd6dc,
        note: 'Methane up here absorbs red light - hence the blue-green color.',
        knowledge: 'modelled',
      },
    ],
    evidence:
      'Only Voyager 2 has visited. The model rests on its flyby data plus bulk density; Uranus’s strange tilted magnetic field hints the mantle fluid is where it is generated.',
    sources: [NASA('NASA - Uranus facts', 'https://science.nasa.gov/uranus/facts/')],
  },

  neptune: {
    layers: [
      {
        name: 'Rocky core',
        outerRadiusFraction: 0.25,
        color: 0xd8c39a,
        note: 'About one Earth mass of rock and metal.',
        knowledge: 'modelled',
      },
      {
        name: 'Icy mantle',
        outerRadiusFraction: 0.8,
        color: 0x4f7ec9,
        note: 'Superionic water may form here - solid and liquid at once.',
        knowledge: 'modelled',
      },
      {
        name: 'Hydrogen-helium atmosphere',
        outerRadiusFraction: 1,
        color: 0x7ba7e8,
        note: 'Home to the fastest winds measured on any planet.',
        knowledge: 'modelled',
      },
    ],
    evidence:
      'Like Uranus: one Voyager 2 flyby plus density and magnetic data. The interior has never been probed.',
    sources: [NASA('NASA - Neptune facts', 'https://science.nasa.gov/neptune/facts/')],
  },

  pluto: {
    layers: [
      {
        name: 'Rocky core',
        outerRadiusFraction: 0.7,
        color: 0xb59a76,
        note: 'Dense rock making up most of Pluto’s mass.',
        knowledge: 'modelled',
      },
      {
        name: 'Possible liquid ocean',
        outerRadiusFraction: 0.78,
        color: 0x4f7ec9,
        note: 'Sputnik Planitia’s position hints at liquid water under the ice - still debated.',
        knowledge: 'modelled',
      },
      {
        name: 'Water-ice mantle',
        outerRadiusFraction: 0.97,
        color: 0x9db8cc,
        note: 'At Pluto’s temperatures, water ice is as rigid as rock.',
        knowledge: 'modelled',
      },
      {
        name: 'Volatile ice surface',
        outerRadiusFraction: 1,
        color: 0xd9c7ad,
        note: 'Nitrogen and methane ices that sublime into the thin atmosphere.',
        knowledge: 'modelled',
      },
    ],
    evidence:
      'New Horizons imaged the surface and measured the shape; the layering - and especially the ocean - is inference from that single 2015 flyby.',
    sources: [NASA('NASA - New Horizons', 'https://science.nasa.gov/mission/new-horizons/')],
  },

  europa: {
    layers: [
      {
        name: 'Metallic core',
        outerRadiusFraction: 0.3,
        color: 0xd9b98c,
        note: 'An iron centre, size only loosely constrained.',
        knowledge: 'modelled',
      },
      {
        name: 'Rocky mantle',
        outerRadiusFraction: 0.85,
        color: 0x9b7a5c,
        note: 'Seafloor rock in contact with the ocean - interesting chemistry for life.',
        knowledge: 'modelled',
      },
      {
        name: 'Salt-water ocean',
        outerRadiusFraction: 0.97,
        color: 0x3f7ecf,
        note: 'Likely holds twice the water of all Earth’s oceans combined.',
        knowledge: 'modelled',
      },
      {
        name: 'Ice shell',
        outerRadiusFraction: 1,
        thicknessKm: 20, // midpoint of the 15-25 km estimate; drawing exaggerates
        color: 0xcfe0ea,
        note: '15-25 km of cracked, shifting ice.',
        knowledge: 'modelled',
      },
    ],
    evidence:
      'Galileo detected an induced magnetic field that almost certainly requires a conducting salt-water layer; Europa Clipper is on its way to confirm the ocean.',
    sources: [NASA('NASA - Europa Clipper', 'https://science.nasa.gov/mission/europa-clipper/')],
  },

  ganymede: {
    layers: [
      {
        name: 'Iron core',
        outerRadiusFraction: 0.25,
        color: 0xe0b98a,
        note: 'Molten enough to run a dynamo - Ganymede is the only moon with its own magnetic field.',
        knowledge: 'modelled',
      },
      {
        name: 'Rocky mantle',
        outerRadiusFraction: 0.5,
        color: 0x8d7156,
        note: 'Silicate rock between metal below and ice above.',
        knowledge: 'modelled',
      },
      {
        name: 'Ocean and high-pressure ice',
        outerRadiusFraction: 0.97,
        color: 0x4a7fc0,
        note: 'Possibly several stacked oceans sandwiched between exotic ice phases.',
        knowledge: 'modelled',
      },
      {
        name: 'Ice crust',
        outerRadiusFraction: 1,
        color: 0xbeccd6,
        note: 'Old dark terrain and younger grooved bright terrain.',
        knowledge: 'modelled',
      },
    ],
    evidence:
      'Galileo found the magnetic field; Hubble’s aurora observations and gravity data support the buried ocean. ESA’s JUICE arrives in the 2030s to map it.',
    sources: [NASA('NASA - Ganymede', 'https://science.nasa.gov/jupiter/jupiter-moons/ganymede/')],
  },

  titan: {
    layers: [
      {
        name: 'Rocky core',
        outerRadiusFraction: 0.8,
        color: 0xa08260,
        note: 'Hydrated silicate rock.',
        knowledge: 'modelled',
      },
      {
        name: 'High-pressure ice',
        outerRadiusFraction: 0.87,
        color: 0x7d95ad,
        note: 'Ice compressed into dense crystal forms that sink rather than float.',
        knowledge: 'modelled',
      },
      {
        name: 'Water-ammonia ocean',
        outerRadiusFraction: 0.95,
        color: 0x3f6fc0,
        note: 'A buried global ocean, salty and possibly ammonia-rich.',
        knowledge: 'modelled',
      },
      {
        name: 'Ice crust',
        outerRadiusFraction: 1,
        color: 0xc9a25c,
        note: 'Beneath the orange haze: ice bedrock, methane rivers and dunes.',
        knowledge: 'modelled',
      },
    ],
    evidence:
      'Cassini measured how Titan flexes in Saturn’s tides - far too much for a solid interior. The ocean is inferred from that flex plus the electric field Huygens measured.',
    sources: [NASA('NASA - Titan', 'https://science.nasa.gov/saturn/moons/titan/')],
  },

  enceladus: {
    layers: [
      {
        name: 'Porous rocky core',
        outerRadiusFraction: 0.75,
        color: 0xa38d6d,
        note: 'Water likely circulates through the hot porous rock - hydrothermal vents.',
        knowledge: 'modelled',
      },
      {
        name: 'Global water ocean',
        outerRadiusFraction: 0.87,
        color: 0x3f8fd0,
        note: 'Confirmed by the moon’s measured wobble - the shell floats free of the core.',
        knowledge: 'observed',
      },
      {
        name: 'Ice shell',
        outerRadiusFraction: 1,
        color: 0xe8f2f5,
        note: 'A few km thin at the south pole, where geysers vent the ocean to space.',
        knowledge: 'observed',
      },
    ],
    evidence:
      'Cassini flew through the south-polar geysers and tasted salty ocean water directly; the libration measurement proved the ocean is global. The core structure is modelled.',
    sources: [NASA('NASA - Enceladus', 'https://science.nasa.gov/saturn/moons/enceladus/')],
  },

  ceres: {
    layers: [
      {
        name: 'Rocky core',
        outerRadiusFraction: 0.6,
        color: 0x9a8468,
        note: 'Hydrated rock - water has altered it through and through.',
        knowledge: 'modelled',
      },
      {
        name: 'Briny ice-rock mantle',
        outerRadiusFraction: 0.96,
        color: 0x7791a8,
        note: 'Pockets of salty brine survive here - the source of the bright spots.',
        knowledge: 'modelled',
      },
      {
        name: 'Dusty crust',
        outerRadiusFraction: 1,
        color: 0x8d8478,
        note: 'A mix of clays, salts and ice, darkened by carbon-rich dust.',
        knowledge: 'modelled',
      },
    ],
    evidence:
      'Dawn orbited Ceres for three years; its gravity mapping and the salty bright spots in Occator crater drive this partially differentiated model.',
    sources: [NASA('NASA - Dawn', 'https://science.nasa.gov/mission/dawn/')],
  },
};
