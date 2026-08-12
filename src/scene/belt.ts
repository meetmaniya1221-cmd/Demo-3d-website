/**
 * Asteroid + Kuiper belts as GPU-orbiting point clouds (zero per-frame CPU
 * cost). Every particle carries real orbital elements (a, e, i, node,
 * perihelion) drawn from the published structure of its population, so the
 * clouds have the correct shape - not decorative rings:
 *
 *  Main belt   - 2.1-3.3 AU with the 3:1 / 5:2 / 7:3 Kirkwood gaps cleared.
 *  Kuiper belt - cold classicals (42-47.5 AU, near-circular, flat, redder),
 *                hot classicals (higher e/i, grayer), plutinos locked at the
 *                3:2 resonance near 39.4 AU, and a thin scattered-disc tail
 *                with perihelia pinned near Neptune (structure per
 *                NASA/JPL Kuiper-belt overviews).
 */
import * as THREE from 'three';
import { mulberry32 } from './noise';
import { EXPLORER_A, EXPLORER_GAMMA, TRUE_UNITS_PER_AU } from '../sim/scale';

const BELT_VERT = /* glsl */ `
  attribute float aA;        // semi-major axis, AU
  attribute float aEcc;      // eccentricity
  attribute float aPeri;     // longitude of perihelion, rad
  attribute float aPhase;    // mean angle at J2000
  attribute float aIncl;     // orbital inclination, rad
  attribute float aNode;     // node phase for the vertical wobble
  attribute float aShade;    // per-particle brightness
  attribute float aTint;     // 0 = base colour, 1 = secondary colour
  varying float vShade;
  varying float vTint;
  uniform float uDays;       // sim days since J2000
  uniform float uScaleT;     // explorer(0) → true(1)
  uniform float uSize;
  uniform float uPr;

  void main() {
    // Kepler's third law: angular speed ∝ a^(-3/2)
    float ang = aPhase + uDays * 6.2831853 / (365.25 * pow(aA, 1.5));
    // radius from the conic equation (mean angle stands in for true
    // anomaly - a visual approximation, exact for e = 0)
    float r = aA * (1.0 - aEcc * aEcc) / (1.0 + aEcc * cos(ang - aPeri));
    vec3 ecl = vec3(cos(ang) * r, sin(ang) * r, 0.0);
    ecl.z = sin(ang + aNode) * sin(aIncl) * r;
    float len = length(ecl);
    float mapped = mix(${EXPLORER_A.toFixed(4)} * pow(len, ${EXPLORER_GAMMA.toFixed(4)}), len * ${TRUE_UNITS_PER_AU.toFixed(4)}, uScaleT);
    vec3 pos = ecl * (mapped / len);
    // ecliptic → scene axes (y up)
    vec4 mv = modelViewMatrix * vec4(pos.x, pos.z, -pos.y, 1.0);
    gl_PointSize = clamp(uSize * 140.0 / max(-mv.z, 0.1), 0.5, 2.6) * uPr;
    gl_Position = projectionMatrix * mv;
    vShade = aShade;
    vTint = aTint;
  }
`;

const BELT_FRAG = /* glsl */ `
  precision highp float;
  varying float vShade;
  varying float vTint;
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uOpacity;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.15, length(p));
    vec3 col = mix(uColor, uColor2, vTint);
    gl_FragColor = vec4(col * clamp(vShade, 0.0, 1.0), a * uOpacity);
  }
`;

export interface BeltParticles {
  a: Float32Array;
  ecc: Float32Array;
  peri: Float32Array;
  phase: Float32Array;
  incl: Float32Array;
  node: Float32Array;
  shade: Float32Array;
  tint: Float32Array;
}

export interface BeltStyle {
  color: number;
  color2: number;
  opacity: number;
  size: number;
}

function alloc(n: number): BeltParticles {
  return {
    a: new Float32Array(n),
    ecc: new Float32Array(n),
    peri: new Float32Array(n),
    phase: new Float32Array(n),
    incl: new Float32Array(n),
    node: new Float32Array(n),
    shade: new Float32Array(n),
    tint: new Float32Array(n),
  };
}

const DEG2RAD = Math.PI / 180;

/** Rayleigh-ish inclination draw (most bodies low, a tail up high). */
function inclDraw(rnd: () => number, sigmaDeg: number, maxDeg: number): number {
  const v = sigmaDeg * Math.sqrt(-2 * Math.log(1 - rnd() * 0.9999));
  return Math.min(v, maxDeg) * DEG2RAD;
}

/** Main belt: 2.1-3.3 AU, mild eccentricities, Kirkwood gaps cleared. */
export function buildMainBelt(count = 4200, seed = 555): BeltParticles {
  const rnd = mulberry32(seed);
  const p = alloc(count);
  const GAPS = [2.502, 2.825, 2.958]; // 3:1, 5:2, 7:3 resonances with Jupiter
  for (let i = 0; i < count; i++) {
    let a = 0;
    for (let tries = 0; tries < 8; tries++) {
      const t = Math.pow(rnd(), 0.7);
      a = 2.1 + 1.2 * t * (0.92 + rnd() * 0.16);
      if (GAPS.every((g) => Math.abs(a - g) > 0.035)) break;
    }
    p.a[i] = a;
    p.ecc[i] = rnd() * rnd() * 0.25;
    p.peri[i] = rnd() * Math.PI * 2;
    p.phase[i] = rnd() * Math.PI * 2;
    p.incl[i] = inclDraw(rnd, 6, 20);
    p.node[i] = rnd() * Math.PI * 2;
    p.shade[i] = 0.5 + rnd() * 0.5;
    p.tint[i] = rnd() * 0.4;
  }
  return p;
}

/**
 * Kuiper belt populations (fractions follow the broad observed census):
 * cold classicals dominate the bright torus, hot classicals thicken it,
 * plutinos clump at 39.4 AU, and the scattered disc thins outward -
 * giving the real sharp-inner-edge / fading-outer-tail profile instead of
 * a uniform donut.
 */
export function buildKuiperBelt(count = 9000, seed = 777): BeltParticles {
  const rnd = mulberry32(seed);
  const p = alloc(count);
  for (let i = 0; i < count; i++) {
    const pick = rnd();
    let a: number;
    let e: number;
    let incl: number;
    let tint: number;
    if (pick < 0.52) {
      // cold classical: near-circular, flat, distinctly red surfaces
      a = 42.4 + (rnd() + rnd()) * 0.5 * 5.2;
      e = rnd() * rnd() * 0.1;
      incl = inclDraw(rnd, 2.2, 8);
      tint = 0.55 + rnd() * 0.45;
    } else if (pick < 0.76) {
      // hot classical: stirred-up orbits, more neutral colours
      a = 40 + rnd() * 8;
      e = rnd() * 0.24;
      incl = inclDraw(rnd, 11, 34);
      tint = rnd() * 0.55;
    } else if (pick < 0.9) {
      // plutinos: 3:2 resonance with Neptune at 39.4 AU
      a = 39.4 + (rnd() - 0.5) * 0.7;
      e = 0.1 + rnd() * 0.16;
      incl = inclDraw(rnd, 9, 25);
      tint = 0.3 + rnd() * 0.55;
    } else {
      // scattered disc: perihelia held near Neptune, aphelia far out
      const q = 30 + rnd() * 8;
      a = 42 + rnd() * rnd() * 55;
      e = Math.min(0.6, Math.max(0, 1 - q / a));
      incl = inclDraw(rnd, 14, 40);
      tint = rnd() * 0.5;
    }
    p.a[i] = a;
    p.ecc[i] = e;
    p.peri[i] = rnd() * Math.PI * 2;
    p.phase[i] = rnd() * Math.PI * 2;
    p.incl[i] = incl;
    p.node[i] = rnd() * Math.PI * 2;
    // outer scattered objects receive far less sunlight - fade with distance
    p.shade[i] = (0.45 + rnd() * 0.55) * Math.min(1, Math.pow(44 / a, 1.2));
    p.tint[i] = tint;
  }
  return p;
}

export const MAIN_BELT_STYLE: BeltStyle = {
  color: 0xb8a58e,
  color2: 0x8f9aa8,
  opacity: 0.6,
  size: 1.6,
};

export const KUIPER_BELT_STYLE: BeltStyle = {
  color: 0x9db4cc, // fresh ice, neutral
  color2: 0xc79a7d, // irradiated organic (tholin) red
  opacity: 0.42,
  size: 1.35,
};

export class Belt {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(particles: BeltParticles, style: BeltStyle) {
    const n = particles.a.length;
    const geo = new THREE.BufferGeometry();
    // position is unused by the shader but required by three.js
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aA', new THREE.BufferAttribute(particles.a, 1));
    geo.setAttribute('aEcc', new THREE.BufferAttribute(particles.ecc, 1));
    geo.setAttribute('aPeri', new THREE.BufferAttribute(particles.peri, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(particles.phase, 1));
    geo.setAttribute('aIncl', new THREE.BufferAttribute(particles.incl, 1));
    geo.setAttribute('aNode', new THREE.BufferAttribute(particles.node, 1));
    geo.setAttribute('aShade', new THREE.BufferAttribute(particles.shade, 1));
    geo.setAttribute('aTint', new THREE.BufferAttribute(particles.tint, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: BELT_VERT,
      fragmentShader: BELT_FRAG,
      uniforms: {
        uDays: { value: 0 },
        uScaleT: { value: 0 },
        uSize: { value: style.size },
        uPr: { value: Math.min(2, window.devicePixelRatio || 1) },
        uColor: { value: new THREE.Color(style.color) },
        uColor2: { value: new THREE.Color(style.color2) },
        uOpacity: { value: style.opacity },
      },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  update(simDays: number, scaleT: number): void {
    this.mat.uniforms.uDays.value = simDays;
    this.mat.uniforms.uScaleT.value = scaleT;
  }

  setPixelRatio(pr: number): void {
    this.mat.uniforms.uPr.value = pr;
  }
}
