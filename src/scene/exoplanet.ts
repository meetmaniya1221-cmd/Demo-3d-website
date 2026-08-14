/**
 * What an exoplanet looks like, when nobody has ever seen one.
 *
 * There are no photographs of these surfaces. Two of the planets in this app
 * have been imaged at all, and those images are single unresolved dots. So
 * nothing here is a picture pretending to be a measurement: every world is
 * built by a shader from the handful of numbers we do have - radius, mass,
 * bulk density where a transit gave us one, equilibrium temperature, how much
 * starlight it receives - and the UI labels every one of them as a rendering.
 *
 * The rules the shader follows are the ordinary physical expectations, applied
 * consistently rather than picked per planet:
 *
 *   - Above ~1,200 K a rocky surface is partly molten, so it glows on its own
 *     and the glow is strongest on the day side.
 *   - Between ~400 and ~1,200 K silicate rock is dark and dry: basalt, not
 *     desert.
 *   - Around 250-400 K rock is varied - the temperature band where the
 *     Solar System's rocky worlds live, and where the colour is genuinely
 *     unconstrained, so the rendering stays muted.
 *   - Below ~200 K water ice dominates the surface and albedo climbs.
 *   - Anything above ~1.8 R⊕ kept a thick envelope, so it gets banded cloud
 *     rather than terrain, and the band colour follows temperature: iron and
 *     silicate cloud tops run dark red when hot, ammonia clouds are pale,
 *     and methane absorption turns the cold ones blue.
 *
 * The banding is latitudinal because rotation makes it so, and it is drawn as
 * noise rather than as stripes because a real cloud deck is turbulent.
 */
import * as THREE from 'three';
import { SNOISE_GLSL } from './glslnoise';
import type { Exoplanet } from '../data/catalog/starsystems';
import { planetClass } from '../data/catalog/starsystems';

const VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vLocal = normalize(position);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vLocal;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  uniform vec3 uStarPos;
  uniform vec3 uStarColor;
  uniform vec3 uColdColor;
  uniform vec3 uWarmColor;
  uniform vec3 uAccent;
  uniform float uBanded;     // 1 = envelope world (latitude bands), 0 = surface
  uniform float uMolten;     // 0..1 self-luminous fraction
  uniform float uIce;        // 0..1 how much of the surface is bright ice
  uniform float uSpin;
  uniform float uSeed;
  uniform float uRough;      // terrain contrast
  ${SNOISE_GLSL}

  float fbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 5; i++) {
      s += snoise(p) * a;
      p *= 2.07;
      a *= 0.5;
    }
    return s;
  }

  void main() {
    // spin the pattern with the body rather than rotating the mesh, so the
    // lighting terminator stays fixed to the star while the surface turns
    float c = cos(uSpin), s = sin(uSpin);
    vec3 p = vec3(vLocal.x * c - vLocal.z * s, vLocal.y, vLocal.x * s + vLocal.z * c);
    vec3 seeded = p * 2.4 + vec3(uSeed, uSeed * 1.7, -uSeed);

    vec3 albedo;
    if (uBanded > 0.5) {
      // latitude bands, warped by turbulence so they meander like real ones
      float warp = fbm(seeded * 1.5) * 0.32;
      float lat = p.y + warp;
      float bands = sin(lat * 11.0 + uSeed) * 0.5 + 0.5;
      bands = mix(bands, sin(lat * 26.0 - uSeed * 2.0) * 0.5 + 0.5, 0.35);
      float storm = smoothstep(0.62, 0.95, fbm(seeded * 3.1 + 4.0));
      albedo = mix(uColdColor, uWarmColor, bands);
      albedo = mix(albedo, uAccent, storm * 0.55);
    } else {
      // terrain: continents-and-basins at low frequency, texture on top
      float h = fbm(seeded);
      float fine = fbm(seeded * 5.5) * 0.4;
      float t = clamp(0.5 + (h + fine) * uRough, 0.0, 1.0);
      albedo = mix(uColdColor, uWarmColor, t);
      // ice caps grow from the poles down as uIce rises
      float capEdge = 1.0 - uIce;
      float cap = smoothstep(capEdge - 0.18, capEdge + 0.12, abs(p.y) + h * 0.14);
      albedo = mix(albedo, uAccent, cap * uIce);
    }

    // ---- lighting from the host star (a real position, not a fixed vector)
    vec3 toStar = normalize(uStarPos - vWorldPos);
    float lambert = dot(normalize(vWorldNormal), toStar);
    // a soft terminator: an airless world would be harsher, but every one of
    // these is unresolved and the softness reads as "we do not know"
    float day = smoothstep(-0.12, 0.35, lambert);
    vec3 lit = albedo * uStarColor * (0.06 + 1.25 * day);

    // molten worlds emit; the night side keeps glowing because rock does
    if (uMolten > 0.001) {
      float veins = smoothstep(0.35, 0.85, fbm(seeded * 3.7 + 9.0) * 0.5 + 0.5);
      vec3 glow = mix(vec3(0.55, 0.06, 0.01), vec3(1.0, 0.55, 0.16), veins);
      lit += glow * uMolten * (0.35 + 0.65 * veins);
    }

    gl_FragColor = vec4(min(lit, vec3(4.0)), 1.0);
  }
`;

const sphereGeo = new THREE.SphereGeometry(1, 48, 24);

interface Palette {
  cold: number;
  warm: number;
  accent: number;
  banded: boolean;
  molten: number;
  ice: number;
  rough: number;
}

/**
 * Colour scheme from the physics, not from taste.
 *
 * `eqTempK` is the equilibrium temperature - what the planet radiates at given
 * the starlight it absorbs, before any greenhouse effect. It is the only
 * temperature we have for most of these worlds, and it is what decides which
 * condensates can exist at the top of the atmosphere or on the ground.
 */
export function paletteFor(p: Exoplanet): Palette {
  const cls = planetClass(p);
  const t = p.eqTempK ?? 255;
  const envelope = cls === 'gas-giant' || cls === 'ice-giant' || cls === 'sub-neptune';

  if (envelope) {
    if (t > 1000) {
      // alkali metals and silicate cloud: dark, deep red, weakly reflective
      return { cold: 0x3a0e08, warm: 0x8e2a12, accent: 0xd9663a, banded: true, molten: 0.12, ice: 0, rough: 1 };
    }
    if (t > 500) {
      return { cold: 0x6b4426, warm: 0xc39868, accent: 0xe8c79a, banded: true, molten: 0, ice: 0, rough: 1 };
    }
    if (t > 250) {
      // Jupiter's regime: ammonia and ammonium hydrosulphide, tan and cream
      return { cold: 0x8a6540, warm: 0xdcc296, accent: 0xf0e0c0, banded: true, molten: 0, ice: 0, rough: 1 };
    }
    if (t > 150) {
      // ammonia ice tops: pale, high albedo, low contrast
      return { cold: 0xb9b39d, warm: 0xe8e6d8, accent: 0xf6f4ee, banded: true, molten: 0, ice: 0, rough: 1 };
    }
    // methane absorbs red; Uranus and Neptune are the reference
    return { cold: 0x2f6f9e, warm: 0x79c2dc, accent: 0xb8e6f2, banded: true, molten: 0, ice: 0, rough: 1 };
  }

  // ---- surfaces
  if (t > 1200) {
    return { cold: 0x2a0d06, warm: 0x7a2a10, accent: 0xff8a3c, banded: false, molten: 1, ice: 0, rough: 1.15 };
  }
  if (t > 800) {
    return { cold: 0x241a16, warm: 0x5c3a2a, accent: 0xa46a44, banded: false, molten: 0.35, ice: 0, rough: 1.05 };
  }
  if (t > 400) {
    // scorched basalt - dark, dry, low albedo
    return { cold: 0x241f1c, warm: 0x5b4b40, accent: 0x8a7565, banded: false, molten: 0, ice: 0, rough: 1.0 };
  }
  if (t > 250) {
    // the temperate band. The honest answer is that we have no idea what
    // colour these are, so: muted rock, no oceans invented, no vegetation.
    return { cold: 0x4a4038, warm: 0x8d7f6d, accent: 0xd6d9de, banded: false, molten: 0, ice: 0.18, rough: 0.95 };
  }
  if (t > 180) {
    return { cold: 0x555a5e, warm: 0x9aa2a6, accent: 0xdfe9f2, banded: false, molten: 0, ice: 0.45, rough: 0.85 };
  }
  // water ice dominates and albedo climbs
  return { cold: 0x8c9aa8, warm: 0xd2dde8, accent: 0xf2f8ff, banded: false, molten: 0, ice: 0.75, rough: 0.7 };
}

/** A stable per-planet seed, so a world looks the same on every visit. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 200;
}

export class ExoplanetBody {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  /** Invisible, generously-sized proxy so a tiny world is still clickable. */
  readonly hit: THREE.Mesh;
  readonly def: Exoplanet;
  private mat: THREE.ShaderMaterial;
  private seed: number;
  private radius = 1;

  constructor(def: Exoplanet, starColor: number) {
    this.def = def;
    this.seed = seedOf(def.id);
    const pal = paletteFor(def);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uStarPos: { value: new THREE.Vector3(0, 0, 0) },
        uStarColor: { value: new THREE.Color(starColor) },
        uColdColor: { value: new THREE.Color(pal.cold) },
        uWarmColor: { value: new THREE.Color(pal.warm) },
        uAccent: { value: new THREE.Color(pal.accent) },
        uBanded: { value: pal.banded ? 1 : 0 },
        uMolten: { value: pal.molten },
        uIce: { value: pal.ice },
        uRough: { value: pal.rough },
        uSpin: { value: 0 },
        uSeed: { value: this.seed },
      },
    });
    this.mesh = new THREE.Mesh(sphereGeo, this.mat);
    this.mesh.name = def.id;
    this.group.add(this.mesh);

    const hitMat = new THREE.MeshBasicMaterial();
    hitMat.visible = false;
    this.hit = new THREE.Mesh(sphereGeo, hitMat);
    this.hit.name = def.id;
    this.group.add(this.hit);
  }

  /**
   * Rotation is not measured for any of these planets. Everything drawn here is
   * close enough to its star to be tidally locked or near it, so the pattern
   * turns very slowly - enough that the world is not visibly frozen, not so
   * much that it implies a day length we do not know.
   */
  update(simDays: number): void {
    this.mat.uniforms.uSpin.value =
      this.seed + (simDays / Math.max(this.def.periodDays, 0.5)) * Math.PI * 2;
  }

  setRadius(r: number): void {
    this.radius = r;
    this.mesh.scale.setScalar(r);
    this.hit.scale.setScalar(Math.max(r * 2.4, 0.06));
  }

  get displayRadius(): number {
    return this.radius;
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
    // keep the proxy pickable but out of the way when the disc is hidden
    this.hit.layers.set(v ? 0 : 31);
  }

  dispose(): void {
    this.mat.dispose();
    (this.hit.material as THREE.Material).dispose();
  }
}
