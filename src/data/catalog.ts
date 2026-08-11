/**
 * The assembled catalog: one uniform CatalogObject per Solar System object,
 * plus the mission registry. Planets and the Sun are adapted from the render
 * data in bodies.ts and enriched from planet-extras, so numeric facts live in
 * exactly one place.
 */
import { SUN, PLANETS, type BodyDef } from './bodies';
import type { CatalogObject, Mission } from './types';
import { PLANET_EXTRAS } from './catalog/planet-extras';
import { INNER_MOONS } from './catalog/moons-inner';
import { JUPITER_MOONS } from './catalog/moons-jupiter';
import { SATURN_MOONS } from './catalog/moons-saturn';
import { URANUS_MOONS, NEPTUNE_MOONS, PLUTO_MOONS } from './catalog/moons-outer';
import { DWARF_PLANETS, TNOS } from './catalog/dwarfs';
import { ASTEROIDS, REGIONS } from './catalog/asteroids';
import { COMETS } from './catalog/comets';
import { MISSIONS } from './catalog/missions';
import { INTERIORS } from './catalog/interiors';

/** Attribution for the classic planet surfaces shipped since v1. */
const PLANET_TEXTURE_CREDIT =
  'Mission imagery via Solar System Scope texture pack (CC BY 4.0, based on NASA data)';

function adaptPlanet(def: BodyDef, parent: string | null): CatalogObject {
  const extras = PLANET_EXTRAS[def.id] ?? {};
  const isSun = def.id === 'sun';
  const { sources: extraSources, ...restExtras } = extras;
  return {
    id: def.id,
    name: def.name,
    type: isSun ? 'star' : 'planet',
    parent,
    color: def.color,
    physical: {
      diameterKm: def.facts.diameterKm,
      massKg: def.facts.massKg,
      gravity: def.facts.gravity,
      density: def.facts.density,
      albedo: def.facts.albedo,
      rotationHours: def.facts.rotationHours,
      axialTiltDeg: def.facts.axialTiltDeg,
      tempMeanC: def.facts.tempMeanC,
      tempRangeC: def.facts.tempRangeC,
      moons: def.facts.moons,
    },
    orbit: def.orbit,
    positionAccuracy: 'ephemeris',
    overview: def.overview,
    concept: def.concept,
    quickFacts: def.quickFacts,
    texture:
      def.id === 'earth'
        ? {
            file: 'earth.webp',
            kind: 'procedural',
            credit: 'AI-generated map (Higgsfield)',
            note: 'Earth’s map here is an AI-generated rendering in the style of satellite imagery, not a NASA product.',
          }
        : isSun
          ? {
              file: 'sun.webp',
              kind: 'procedural',
              credit: PLANET_TEXTURE_CREDIT,
              note: 'A stylised solar surface - real photographs of the Sun are taken in narrow filter bands, not visible-light color.',
            }
          : {
              file: `${def.id}.webp`,
              kind: 'photo',
              credit: PLANET_TEXTURE_CREDIT,
            },
    ...restExtras,
    sources: [
      { label: 'NASA Planetary Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/' },
      ...(extraSources ?? []),
    ],
  };
}

export const MOONS: CatalogObject[] = [
  ...INNER_MOONS,
  ...JUPITER_MOONS,
  ...SATURN_MOONS,
  ...URANUS_MOONS,
  ...NEPTUNE_MOONS,
  ...PLUTO_MOONS,
];

/** All heliocentric small bodies that get real rendered orbits. */
export const SMALL_BODIES: CatalogObject[] = [
  ...DWARF_PLANETS,
  ...TNOS,
  ...ASTEROIDS,
  ...COMETS,
];

export const ALL_OBJECTS: CatalogObject[] = [
  adaptPlanet(SUN, null),
  ...PLANETS.map((p) => adaptPlanet(p, 'sun')),
  ...MOONS,
  ...SMALL_BODIES,
  ...REGIONS,
];

// attach interior models to their bodies (kept in a separate file so the
// cross-section data has one home instead of being spread over six files)
for (const o of ALL_OBJECTS) {
  const interior = INTERIORS[o.id];
  if (interior) o.interior = interior;
}

const byId = new Map<string, CatalogObject>(ALL_OBJECTS.map((o) => [o.id, o]));

export function catalogObject(id: string): CatalogObject | undefined {
  return byId.get(id);
}

export function requireObject(id: string): CatalogObject {
  const o = byId.get(id);
  if (!o) throw new Error(`unknown catalog object: ${id}`);
  return o;
}

/** Moons grouped by parent planet id. */
export const MOONS_BY_PARENT = new Map<string, CatalogObject[]>();
for (const m of MOONS) {
  if (!m.parent) continue;
  const list = MOONS_BY_PARENT.get(m.parent) ?? [];
  list.push(m);
  MOONS_BY_PARENT.set(m.parent, list);
}
// keep each system sorted by orbital distance
for (const list of MOONS_BY_PARENT.values()) {
  list.sort((a, b) => (a.satOrbit?.distanceKm ?? 0) - (b.satOrbit?.distanceKm ?? 0));
}

export const MISSIONS_SORTED: Mission[] = [...MISSIONS].sort(
  (a, b) => a.launched - b.launched,
);

const missionById = new Map(MISSIONS.map((m) => [m.id, m]));

export function missionOf(id: string): Mission | undefined {
  return missionById.get(id);
}

/** Missions that studied a given object. */
export function missionsFor(objectId: string): Mission[] {
  return MISSIONS_SORTED.filter(
    (m) =>
      m.targets.includes(objectId) ||
      (catalogObject(objectId)?.missionIds ?? []).includes(m.id),
  );
}

/** Objects a mission is linked to (union of both directions). */
export function targetsOf(mission: Mission): CatalogObject[] {
  const ids = new Set(mission.targets);
  for (const o of ALL_OBJECTS) {
    if (o.missionIds?.includes(mission.id)) ids.add(o.id);
  }
  return [...ids].map((id) => byId.get(id)).filter((o): o is CatalogObject => !!o);
}
