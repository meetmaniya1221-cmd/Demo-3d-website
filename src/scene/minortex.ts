/**
 * Lazy procedural painters for minor bodies (moons without photographic maps,
 * TNOs, asteroids, comet nuclei). Each painter is an honest artistic rendering
 * informed by published imagery/albedo - never presented as a photograph.
 * Painted small (256x128) and only on demand, so boot stays fast.
 */
import * as THREE from 'three';
import { ValueNoise, hex, ramp, lerpRGB, type RGB } from './noise';
import { paint, craters, toTexture } from './textures';

export type MinorPaintKind =
  | 'ice-gray' // Uranus moons, generic icy satellites
  | 'ice-dark' // Umbriel-like dark ice
  | 'ice-bright' // Eris, Haumea - high albedo
  | 'ice-red' // Sedna, Gonggong, Makemake - tholin-red ices
  | 'rock' // Pallas, Hygiea, Eros
  | 'rock-dark' // Bennu, Ryugu - carbonaceous rubble
  | 'metal' // Psyche
  | 'comet'; // comet nuclei - near-black with active patches

function seedOf(id: string): number {
  let s = 0;
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0;
  return (s % 100_000) + 1;
}

interface Palette {
  stops: Array<[number, RGB]>;
  craterCount: number;
  craterStrength: number;
  mottleColor?: RGB;
}

const PALETTES: Record<MinorPaintKind, Palette> = {
  'ice-gray': {
    stops: [
      [0, hex(0x62666c)],
      [0.5, hex(0x8d9298)],
      [1, hex(0xb8bdc2)],
    ],
    craterCount: 180,
    craterStrength: 0.9,
  },
  'ice-dark': {
    stops: [
      [0, hex(0x3c3e44)],
      [0.55, hex(0x54575e)],
      [1, hex(0x74777e)],
    ],
    craterCount: 150,
    craterStrength: 0.7,
  },
  'ice-bright': {
    stops: [
      [0, hex(0xc7ccd2)],
      [0.5, hex(0xe4e8ec)],
      [1, hex(0xfbfdff)],
    ],
    craterCount: 60,
    craterStrength: 0.35,
  },
  'ice-red': {
    stops: [
      [0, hex(0x5e3524)],
      [0.45, hex(0x8a5236)],
      [0.75, hex(0xb0714a)],
      [1, hex(0xcf9468)],
    ],
    craterCount: 70,
    craterStrength: 0.5,
  },
  rock: {
    stops: [
      [0, hex(0x4f4a44)],
      [0.5, hex(0x736c62)],
      [1, hex(0x9a9186)],
    ],
    craterCount: 240,
    craterStrength: 1.0,
  },
  'rock-dark': {
    stops: [
      [0, hex(0x262422)],
      [0.55, hex(0x3b3835)],
      [1, hex(0x565250)],
    ],
    craterCount: 120,
    craterStrength: 0.8,
  },
  metal: {
    stops: [
      [0, hex(0x585a5e)],
      [0.5, hex(0x7e8288)],
      [1, hex(0xb2b8c0)],
    ],
    craterCount: 200,
    craterStrength: 1.0,
    mottleColor: hex(0xd8dde4),
  },
  comet: {
    stops: [
      [0, hex(0x24211d)],
      [0.6, hex(0x393430)],
      [1, hex(0x554f49)],
    ],
    craterCount: 60,
    craterStrength: 0.6,
  },
};

const cache = new Map<string, THREE.CanvasTexture>();

/** Paint (or fetch from cache) the procedural map for a minor body. */
export function minorTexture(id: string, kind: MinorPaintKind): THREE.CanvasTexture {
  const key = `${id}:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const seed = seedOf(id);
  const p = PALETTES[kind];
  const n = new ValueNoise(seed);
  const mottle = new ValueNoise(seed + 7);
  const c = paint(256, 128, (u, v) => {
    const s = 5;
    const q = n.fbm(u * s, v * s, 4, 2, 0.5, s);
    const m = n.fbm(u * s + q * 1.4, v * s * 0.8 + q * 1.4, 4, 2, 0.5, s);
    let col = ramp(p.stops, m);
    if (p.mottleColor) {
      const fleck = mottle.ridged(u * 14, v * 14, 3, 14);
      if (fleck > 0.62) col = lerpRGB(col, p.mottleColor, (fleck - 0.62) * 1.6);
    }
    // subtle darker provinces so bodies read as varied, not uniform
    const province = mottle.fbm(u * 2.2 + 31, v * 1.8 + 31, 3, 2, 0.5, 2.2);
    if (province > 0.6) col = lerpRGB(col, p.stops[0][1], (province - 0.6) * 1.1);
    return col;
  });
  craters(c, seed + 13, p.craterCount, 14, p.craterStrength);
  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

/**
 * Irregular-body geometry: an icosphere displaced with seamless directional
 * noise and squashed to the given axis aspect. Used for small moons,
 * asteroids and comet nuclei whose true shapes are far from spherical.
 */
export function irregularGeometry(
  id: string,
  aspect: [number, number, number] = [1, 0.82, 0.74],
  roughness = 0.16,
): THREE.BufferGeometry {
  const seed = seedOf(id) + 101;
  const n = new ValueNoise(seed);
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // sum of three planar noises is continuous on the sphere (no seam)
    const d =
      n.fbm(v.x * 2 + 9, v.y * 2 + 9, 4, 2, 0.55) +
      n.fbm(v.y * 2 + 21, v.z * 2 + 21, 4, 2, 0.55) +
      n.fbm(v.z * 2 + 33, v.x * 2 + 33, 4, 2, 0.55);
    const r = 1 + (d / 3 - 0.5) * 2 * roughness;
    v.multiplyScalar(r);
    pos.setXYZ(i, v.x * aspect[0], v.y * aspect[1], v.z * aspect[2]);
  }
  geo.computeVertexNormals();
  return geo;
}
