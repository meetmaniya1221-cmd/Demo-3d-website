/**
 * True-scale ephemeris for the spacecraft.
 *
 * Spacecraft mode pins the world to TRUE scale (1 AU = 100 scene units, every
 * body at its real proportional radius), so a scene unit is a fixed number of
 * kilometres and apparent size is nothing but `radius / distance`. This module
 * is the single place that converts a catalog id into that true-scale frame.
 *
 * It deliberately re-uses the exact formulas the renderer uses - the same
 * Kepler solver from data/bodies, the same mapping from sim/scale, the same
 * satellite phase/period model from scene/satellites - so a position computed
 * here is bit-for-bit where the mesh is drawn. Nothing here is a second,
 * parallel universe; it is an analytic read of the one the app already renders.
 *
 * Why analytic rather than reading the scene graph: the renderer collapses
 * satellite systems and disabled layers when the camera is far away, so a
 * moon's mesh position is stale until you are close to it. Navigation has to
 * work at 30 AU, so it asks the maths, not the meshes.
 */
import * as THREE from 'three';
import { AU_KM, PLANETS, SUN, keplerPosition } from '../data/bodies';
import { ALL_OBJECTS, catalogObject } from '../data/catalog';
import type { CatalogObject } from '../data/types';
import { TRUE_UNITS_PER_AU, mapPositionAU, moonTrueDist, trueRadius } from '../sim/scale';

/** Kilometres in one scene unit at true scale. */
export const KM_PER_UNIT = AU_KM / TRUE_UNITS_PER_AU;
/** Scene units in one kilometre at true scale. */
export const UNITS_PER_KM = 1 / KM_PER_UNIT;
/** Scene units in one astronomical unit at true scale. */
export const UNITS_PER_AU = TRUE_UNITS_PER_AU;

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const tmpMap = { x: 0, y: 0, z: 0 };
const tmpKep: [number, number, number] = [0, 0, 0];
const tmpParent = new THREE.Vector3();

/** Axial tilt (radians) of every parent whose moons ride its equatorial plane. */
const PARENT_TILT = new Map<string, number>();
for (const p of PLANETS) {
  PARENT_TILT.set(p.id, THREE.MathUtils.degToRad(p.facts.axialTiltDeg));
}

/**
 * Satellite phase at J2000 - mirrors scene/satellites.ts exactly: Earth's Moon
 * gets its real mean longitude, every other moon a stable hash (their
 * longitudes are disclosed as approximate throughout the app).
 */
function satPhase(id: string): number {
  if (id === 'moon') return THREE.MathUtils.degToRad(218.316);
  return (id.charCodeAt(0) * 1.37 + id.length) % (Math.PI * 2);
}

/** Heliocentric true-scale position of anything carrying Kepler elements. */
function heliocentric(def: CatalogObject, simDays: number, out: THREE.Vector3): THREE.Vector3 {
  const [x, y, z] = keplerPosition(def.orbit!, simDays, tmpKep);
  mapPositionAU(x, y, z, 1, tmpMap);
  return out.set(tmpMap.x, tmpMap.y, tmpMap.z);
}

/**
 * True-scale scene position of any catalog object at a given simulation time.
 * Returns the origin for ids the app cannot place (regions, unknown ids).
 */
export function bodyPositionTrue(id: string, simDays: number, out: THREE.Vector3): THREE.Vector3 {
  if (id === 'sun') return out.set(0, 0, 0);
  const def = catalogObject(id);
  if (!def) return out.set(0, 0, 0);
  if (def.orbit) return heliocentric(def, simDays, out);

  if (def.satOrbit && def.parent) {
    const parentDef = catalogObject(def.parent);
    if (!parentDef) return out.set(0, 0, 0);
    if (def.parent === 'sun') tmpParent.set(0, 0, 0);
    else if (parentDef.orbit) heliocentric(parentDef, simDays, tmpParent);
    else tmpParent.set(0, 0, 0);

    const orbit = def.satOrbit;
    const pR = trueRadius(def.parent, parentDef.physical.diameterKm);
    const r = trueRadius(id, def.physical.diameterKm);
    // same floor the renderer applies so a moon never sinks into its parent
    const dist = Math.max(moonTrueDist(orbit.distanceKm), pR * 1.15 + r * 2);
    const ang = (simDays / orbit.periodDays) * Math.PI * 2 + satPhase(id);
    out.set(Math.cos(ang) * dist, 0, -Math.sin(ang) * dist);
    // regular moons ride the parent's equatorial plane; Earth's Moon is mounted
    // on the ecliptic group instead, exactly as scene/system.ts wires it up
    const tilt = id === 'moon' ? 0 : (PARENT_TILT.get(def.parent) ?? 0);
    if (tilt !== 0) out.applyAxisAngle(Z_AXIS, -tilt);
    return out.add(tmpParent);
  }
  return out.set(0, 0, 0);
}

/** True-scale display radius (scene units) of any catalog object. */
export function bodyRadiusTrue(id: string): number {
  if (id === 'sun') return trueRadius('sun', SUN.facts.diameterKm);
  const def = catalogObject(id);
  if (!def) return 1e-4;
  return trueRadius(id, def.physical.diameterKm);
}

/** Physical radius in km. */
export function bodyRadiusKm(id: string): number {
  if (id === 'sun') return SUN.facts.diameterKm / 2;
  const def = catalogObject(id);
  return def ? def.physical.diameterKm / 2 : 1;
}

/** Outer ring radius in body radii, for the two ringed planets we draw. */
export const RING_OUTER: Record<string, number> = { saturn: 2.33, uranus: 2.0 };

/**
 * Radius of the whole visual system around a body (rings included). This is
 * what "approach Saturn" has to clear - stopping at 7 Saturn radii would put
 * the ship inside the C ring.
 */
export function bodyExtentTrue(id: string): number {
  return bodyRadiusTrue(id) * (RING_OUTER[id] ?? 1);
}

/**
 * Where a "travel to X" run parks the ship: far enough out that the whole
 * object (with its rings) sits comfortably in the window, close enough that it
 * dominates it. Expressed as a distance from the body's centre, in scene units.
 */
export function arrivalDistance(id: string): number {
  const extent = bodyExtentTrue(id);
  if (id === 'sun') return Math.max(extent * 9, 2.5); // ~13° across, thermally silly but visually safe
  const def = catalogObject(id);
  const factor = def?.type === 'planet' ? 7 : 8;
  // small bodies would otherwise park a few km out, where floating point and
  // the near plane both give up - hold everything at least 150 km away
  return Math.max(extent * factor, 150 * UNITS_PER_KM);
}

/**
 * Hard proximity limit. Nothing may cross this: it keeps the ship out of the
 * corona, off the cloud tops, and away from the depth precision cliff you hit
 * when the near plane has to go below a metre.
 */
export function minSafeDistance(id: string): number {
  const r = bodyRadiusTrue(id);
  if (id === 'sun') return r * 2.0; // ~1.4 million km above the photosphere
  return Math.max(r * 1.02, 30 * UNITS_PER_KM);
}

/** Ids the navigation computer will let you target. */
export function targetableObjects(): CatalogObject[] {
  return ALL_OBJECTS.filter((o) => o.type !== 'region' && (o.id === 'sun' || o.orbit || o.satOrbit));
}

/** Bodies worth scanning for "what is near me" - cheap enough to run per frame. */
export const NEIGHBOUR_IDS: string[] = [
  'sun',
  ...PLANETS.map((p) => p.id),
  'moon',
  'phobos',
  'deimos',
  'io',
  'europa',
  'ganymede',
  'callisto',
  'mimas',
  'enceladus',
  'tethys',
  'dione',
  'rhea',
  'titan',
  'iapetus',
  'miranda',
  'ariel',
  'umbriel',
  'titania',
  'oberon',
  'triton',
  'ceres',
  'vesta',
  'pallas',
  'pluto',
  'charon',
  'eris',
  'haumea',
  'makemake',
];

export interface Neighbour {
  id: string;
  name: string;
  /** Distance from the ship in scene units. */
  dist: number;
  /** Distance to the body's surface, in scene units. */
  altitude: number;
  /** Apparent angular diameter in degrees. */
  angularDeg: number;
  /** Visual radius including rings, in scene units. */
  radius: number;
  /** True-scale scene position, for the navigation map. */
  scenePos: THREE.Vector3;
}

const scan = new THREE.Vector3();

/** The n nearest catalog bodies to a point, nearest first. */
export function nearestBodies(
  pos: THREE.Vector3,
  simDays: number,
  n: number,
  ids: string[] = NEIGHBOUR_IDS,
): Neighbour[] {
  const out: Neighbour[] = [];
  for (const id of ids) {
    bodyPositionTrue(id, simDays, scan);
    const dist = pos.distanceTo(scan);
    const radius = bodyExtentTrue(id);
    out.push({
      id,
      name: catalogObject(id)?.name ?? id,
      dist,
      altitude: dist - bodyRadiusTrue(id),
      angularDeg: angularDiameterDeg(radius, dist),
      radius,
      scenePos: scan.clone(),
    });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, n);
}

/** Apparent angular diameter (degrees) of a sphere of radius r seen from d. */
export function angularDiameterDeg(radius: number, distance: number): number {
  if (distance <= radius) return 180;
  return 2 * Math.asin(Math.min(1, radius / distance)) * (180 / Math.PI);
}

export interface RegionInfo {
  /** Short label, e.g. "Saturn system". */
  label: string;
  /** One line of context for the location panel. */
  detail: string;
}

/**
 * Where am I? Local systems win over heliocentric bands - being 400,000 km
 * from Saturn is "Saturn system", not "outer Solar System".
 */
export function regionOf(pos: THREE.Vector3, simDays: number): RegionInfo {
  const rAU = pos.length() / UNITS_PER_AU;

  // local systems first, ranked by how deep inside them we are
  let best: { label: string; detail: string; score: number } | null = null;
  for (const id of NEIGHBOUR_IDS) {
    if (id === 'sun') continue;
    const def = catalogObject(id);
    if (!def) continue;
    bodyPositionTrue(id, simDays, scan);
    const d = pos.distanceTo(scan);
    const r = bodyRadiusTrue(id);
    // "system" reach: generous for the giants, tight for a 20 km moon
    const reach = r * (def.type === 'planet' ? 260 : 90);
    if (d > reach) continue;
    const score = d / reach;
    const close = d < r * 12;
    const label = close ? `Near ${def.name}` : `${def.name} system`;
    const detail = close
      ? `${def.name} vicinity - ${(d / r).toFixed(1)} body radii from its centre.`
      : `Inside ${def.name}'s neighbourhood, ${(d / r).toFixed(0)} radii out.`;
    if (!best || score < best.score) best = { label, detail, score };
  }
  if (best) return { label: best.label, detail: best.detail };

  if (rAU < 0.02) {
    return { label: 'Solar corona', detail: 'Inside the Sun’s outer atmosphere. Nothing built by humans has been here.' };
  }
  if (rAU < 0.4) return { label: 'Innermost Solar System', detail: 'Inside Mercury’s orbit - the hottest, fastest neighbourhood there is.' };
  if (rAU < 1.4) return { label: 'Inner Solar System', detail: 'Among the rocky planets, where sunlight is still strong.' };
  if (rAU < 2.0) return { label: 'Beyond Mars', detail: 'Past the last rocky planet, approaching the asteroid belt.' };
  if (rAU < 3.4) return { label: 'Main asteroid belt', detail: 'The belt between Mars and Jupiter - vast, and almost entirely empty.' };
  if (rAU < 6.5) return { label: 'Jovian region', detail: 'Jupiter’s domain: the gravitational bully of the outer system.' };
  if (rAU < 11) return { label: 'Saturnian region', detail: 'Out where sunlight is 1% of Earth’s and the giants are made of gas and ice.' };
  if (rAU < 21) return { label: 'Outer Solar System', detail: 'Between Saturn and Uranus - the long, dark middle of the system.' };
  if (rAU < 31) return { label: 'Ice giant region', detail: 'The realm of Uranus and Neptune, the outermost planets.' };
  if (rAU < 50) return { label: 'Kuiper belt', detail: 'The icy debris ring beyond Neptune, home of Pluto and its cousins.' };
  if (rAU < 120) return { label: 'Scattered disc', detail: 'Sparse, tilted, eccentric orbits scattered by Neptune long ago.' };
  if (rAU < 1000) return { label: 'Heliosphere edge', detail: 'Near the heliopause, where the solar wind gives way to interstellar space.' };
  return { label: 'Oort cloud (conceptual)', detail: 'Modelled, never observed - a spherical shell of comet nuclei around the Sun.' };
}
