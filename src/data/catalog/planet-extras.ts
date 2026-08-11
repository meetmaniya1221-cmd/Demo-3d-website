/**
 * Enrichment fields for the Sun and the eight planets.
 *
 * `bodies.ts` already carries their facts and prose; this file layers on the
 * catalog-only fields (atmosphere, composition, discovery, missions, related
 * objects, categories, sources). Values from the NASA Planetary Fact Sheets
 * (nssdc.gsfc.nasa.gov) and the NASA Science solar-system pages.
 */
import type { CatalogObject } from '../types';

export type PlanetExtras = Pick<
  CatalogObject,
  'atmosphere' | 'composition' | 'discovery' | 'missionIds' | 'related' | 'sources' | 'category'
>;

export const PLANET_EXTRAS: Record<string, PlanetExtras> = {
  sun: {
    category: 'G-type main-sequence star',
    atmosphere:
      'The corona - a 1,000,000 °C plasma halo far hotter than the 5,500 °C surface below it, streaming outward as the solar wind.',
    composition:
      'Hydrogen (~74% by mass) and helium (~24%) plasma; the core fuses hydrogen into helium at about 15,000,000 °C.',
    missionIds: ['parker'],
    related: [],
    sources: [
      { label: 'NASA Sun Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html' },
      { label: 'NASA Science - Sun', url: 'https://science.nasa.gov/sun/' },
    ],
  },
  mercury: {
    category: 'Rocky planet',
    atmosphere:
      'A vanishingly thin exosphere of oxygen, sodium, hydrogen, helium and potassium - atoms knocked off the surface that rarely ever collide.',
    composition:
      'An outsized iron core - about 85% of the planet’s radius - wrapped in a thin silicate mantle and crust.',
    missionIds: ['mariner10', 'messenger', 'bepicolombo'],
    related: [],
    sources: [
      { label: 'NASA Mercury Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/mercuryfact.html' },
      { label: 'NASA Science - Mercury', url: 'https://science.nasa.gov/mercury/' },
    ],
  },
  venus: {
    category: 'Rocky planet',
    atmosphere:
      '96.5% CO₂ and 3.5% N₂ beneath sulfuric-acid clouds; surface pressure is a crushing 92 bar.',
    composition:
      'An iron core and rocky silicate mantle beneath a basaltic crust repaved by volcanism.',
    missionIds: ['magellan'],
    related: [],
    sources: [
      { label: 'NASA Venus Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html' },
      { label: 'NASA Science - Venus', url: 'https://science.nasa.gov/venus/' },
    ],
  },
  earth: {
    category: 'Rocky planet',
    atmosphere:
      '78% N₂, 21% O₂ and 1% argon at 1 bar - the only known atmosphere whose free oxygen is continuously made by life.',
    composition:
      'An iron-nickel core (solid inner, molten outer), a silicate mantle, and a thin crust broken into drifting tectonic plates.',
    missionIds: [],
    related: ['moon'],
    sources: [
      { label: 'NASA Earth Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html' },
      { label: 'NASA Science - Earth', url: 'https://science.nasa.gov/earth/' },
    ],
  },
  mars: {
    category: 'Rocky planet',
    atmosphere:
      '95% CO₂ with nitrogen and argon at ~0.006 bar - so thin that liquid water is unstable: exposed water either freezes or boils away, even in the cold.',
    composition:
      'An iron-sulfur core and silicate mantle beneath a basaltic crust dusted with rust-red iron oxide.',
    missionIds: ['viking1', 'marsexpress', 'curiosity', 'perseverance'],
    related: ['phobos', 'deimos'],
    sources: [
      { label: 'NASA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
      { label: 'NASA Science - Mars', url: 'https://science.nasa.gov/mars/' },
    ],
  },
  jupiter: {
    category: 'Gas giant',
    atmosphere:
      'About 90% H₂ and 10% He with traces of methane, ammonia and water; ammonia clouds paint its banded belts and zones.',
    composition:
      'Hydrogen and helium compressed into a vast shell of liquid metallic hydrogen around a dense, possibly diffuse core.',
    missionIds: ['pioneer10', 'voyager1', 'voyager2', 'galileo', 'juno', 'europaclipper'],
    related: ['io', 'europa', 'ganymede', 'callisto'],
    sources: [
      { label: 'NASA Jupiter Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/jupiterfact.html' },
      { label: 'NASA Science - Jupiter', url: 'https://science.nasa.gov/jupiter/' },
    ],
  },
  saturn: {
    category: 'Gas giant',
    atmosphere:
      'About 96% H₂ and 3% He with traces of methane and ammonia, veiled by a high haze that softens its bands.',
    composition:
      'Hydrogen and helium around a rocky-icy core; the whole planet averages less dense than water.',
    missionIds: ['cassini', 'voyager1', 'voyager2'],
    related: ['titan', 'enceladus', 'rhea', 'iapetus'],
    sources: [
      { label: 'NASA Saturn Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturnfact.html' },
      { label: 'NASA Science - Saturn', url: 'https://science.nasa.gov/saturn/' },
    ],
  },
  uranus: {
    category: 'Ice giant',
    atmosphere:
      'About 83% H₂, 15% He and 2% methane; the methane absorbs red light, giving the planet its pale cyan colour.',
    composition:
      'A hot, dense fluid of water, methane and ammonia “ices” around a small rocky core, under a hydrogen-helium envelope.',
    discovery: {
      by: 'William Herschel',
      year: 1781,
      how: 'First planet ever found with a telescope, from his garden in Bath, England',
    },
    missionIds: ['voyager2'],
    related: ['titania', 'oberon', 'miranda'],
    sources: [
      { label: 'NASA Uranus Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/uranusfact.html' },
      { label: 'NASA Science - Uranus', url: 'https://science.nasa.gov/uranus/' },
    ],
  },
  neptune: {
    category: 'Ice giant',
    atmosphere:
      'About 80% H₂, 19% He and 1.5% methane, whipped into the fastest winds in the Solar System.',
    composition:
      'A dense fluid of water, ammonia and methane ices around a rocky core, beneath a hydrogen-helium envelope.',
    discovery: {
      by: 'Johann Galle, from the predictions of Urbain Le Verrier (and independently John Couch Adams)',
      year: 1846,
      how: 'Found by mathematics - computed from Uranus’ orbital wobbles, then spotted within 1° of the predicted position',
    },
    missionIds: ['voyager2'],
    related: ['triton'],
    sources: [
      { label: 'NASA Neptune Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptunefact.html' },
      { label: 'NASA Science - Neptune', url: 'https://science.nasa.gov/neptune/' },
    ],
  },
};
