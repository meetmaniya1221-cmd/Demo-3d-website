/**
 * Structured data model for every object in the Solar System Explorer.
 *
 * Design goals:
 *  - one uniform shape (`CatalogObject`) for stars, planets, moons, dwarf
 *    planets, asteroids, comets and regions, so UI/search/scene code never
 *    special-cases a category;
 *  - every entry carries its own source attribution;
 *  - every numeric field is optional beyond diameter, because real data
 *    coverage varies wildly between a planet and a comet nucleus;
 *  - adding a new object = adding one literal to a data file.
 */
import type { OrbitalElements } from './bodies';

export type ObjectType =
  | 'star'
  | 'planet'
  | 'dwarf' // IAU-recognised dwarf planets
  | 'moon'
  | 'asteroid'
  | 'comet'
  | 'tno' // trans-Neptunian objects that are dwarf-planet candidates
  | 'region'; // belts / clouds - selectable areas rather than bodies

export interface SourceRef {
  label: string;
  url: string;
}

/** Circular-orbit approximation for a satellite around its parent body.
 *  Real eccentricities of the major moons are small; where the shape or
 *  plane is simplified we say so in `simplified`. */
export interface SatelliteOrbit {
  distanceKm: number; // mean orbital distance from parent centre
  periodDays: number; // sidereal period; negative = retrograde
  simplified?: string; // display note, e.g. "real orbit inclined 157° to Neptune's equator"
}

export interface PhysicalFacts {
  diameterKm: number; // mean diameter; irregular bodies use volumetric mean
  dimensionsKm?: string; // e.g. "27 × 22 × 18" for irregular bodies
  massKg?: number;
  gravity?: number; // m/s² at surface (or 1-bar level for giants)
  density?: number; // g/cm³
  rotationHours?: number; // sidereal; negative = retrograde; undefined = chaotic/tidally locked
  tidallyLocked?: boolean;
  axialTiltDeg?: number;
  tempMeanC?: number;
  tempRangeC?: [number, number];
  albedo?: number; // geometric albedo
  moons?: number;
}

export interface Discovery {
  by: string;
  year: number | string; // "prehistory" for naked-eye objects
  how?: string;
}

export interface TextureInfo {
  /** File in /public/textures; when missing the procedural painter is used. */
  file?: string;
  /** Provenance of whatever map is shown (independent of `file` - an
   *  artistic map can ship as a file): photo = real mission mosaic;
   *  tinted = real grayscale mosaic with a display tint;
   *  procedural = artistic rendering informed by imagery. */
  kind: 'photo' | 'tinted' | 'procedural';
  credit?: string;
  note?: string;
}

/** One shell of a body's interior model, ordered inner → outer. */
export interface InteriorLayer {
  name: string;
  /** Outer edge of this layer as a fraction of the body's radius (0..1]. */
  outerRadiusFraction: number;
  color: number;
  note: string;
  /**
   * observed = probed directly (seismology, helioseismology, libration);
   * modelled = inferred from bulk density, gravity fields, magnetics.
   * Rendered differently so users can tell knowledge from inference.
   */
  knowledge: 'observed' | 'modelled';
}

export interface Interior {
  layers: InteriorLayer[];
  /** How we know: one honest sentence about the evidence. */
  evidence: string;
  sources: SourceRef[];
}

export interface CometActivity {
  /** Perihelion distance q in AU; drives the tail-length model. */
  qAU: number;
  aphelionAU: number;
  /** Where the comet comes from - Kuiper belt vs Oort cloud. */
  origin: string;
  lastPerihelion: string; // e.g. "9 Feb 1986"
  nextPerihelion?: string;
  meteorShower?: string; // shower this comet's debris produces
}

export interface CatalogObject {
  id: string;
  name: string;
  /** Alternate names/designations for search ("136199", "2007 OR10", "1P"). */
  aliases?: string[];
  type: ObjectType;
  /** Fine-grained label, e.g. "Galilean moon", "Jupiter-family comet". */
  category?: string;
  parent: string | null; // object id this body orbits ('sun', 'jupiter', ...)
  color: number; // UI accent / orbit line / label color
  physical: PhysicalFacts;
  /** Heliocentric Kepler elements (planets, dwarfs, asteroids, comets). */
  orbit?: OrbitalElements;
  /** Parent-centric circular orbit (moons). */
  satOrbit?: SatelliteOrbit;
  /** How accurately the rendered position tracks reality. */
  positionAccuracy?: 'ephemeris' | 'approximate';
  atmosphere?: string; // one-line composition, or "None to speak of..."
  composition?: string; // bulk composition line
  discovery?: Discovery;
  overview: string; // 2-3 sentence introduction
  concept?: { title: string; text: string }; // the science idea this body teaches
  quickFacts: string[];
  missionIds?: string[]; // missions that studied this object
  related?: string[]; // sibling/companion object ids worth visiting
  sources: SourceRef[];
  texture?: TextureInfo;
  comet?: CometActivity; // only for type === 'comet'
  /** Layered interior model for the cross-section view. */
  interior?: Interior;
  /** Explicit uncertainty statement where measurements are estimates. */
  uncertainty?: string;
}

export type MissionStatus = 'active' | 'en route' | 'completed';

export interface Mission {
  id: string;
  name: string;
  agency: string; // "NASA", "ESA", "NASA/ESA/ASI", "JAXA"...
  launched: number; // launch year
  ended?: number; // year the mission ended (undefined while active)
  status: MissionStatus;
  craft: string; // "Orbiter", "Flyby probe", "Rover", "Sample return"...
  targets: string[]; // catalog object ids the mission studied
  summary: string; // 1-2 sentences
  highlights: string[]; // 2-4 short achievements
  url: string; // official mission page
  sources: SourceRef[];
}

export const TYPE_LABEL: Record<ObjectType, string> = {
  star: 'Star',
  planet: 'Planet',
  dwarf: 'Dwarf planet',
  moon: 'Moon',
  asteroid: 'Asteroid',
  comet: 'Comet',
  tno: 'Trans-Neptunian object',
  region: 'Region',
};
