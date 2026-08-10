/** Asteroid + Kuiper belts as GPU-orbiting point clouds (zero per-frame CPU cost). */
import * as THREE from 'three';
import { mulberry32 } from './noise';
import { EXPLORER_A, EXPLORER_GAMMA, TRUE_UNITS_PER_AU } from '../sim/scale';

const BELT_VERT = /* glsl */ `
  attribute float aRadius;   // semi-major axis, AU
  attribute float aPhase;    // starting angle
  attribute float aIncl;     // orbital inclination, rad
  attribute float aNode;     // node phase for the vertical wobble
  attribute float aShade;    // per-particle brightness
  varying float vShade;
  uniform float uDays;       // sim days since J2000
  uniform float uScaleT;     // explorer(0) → true(1)
  uniform float uSize;

  void main() {
    // Kepler's third law: angular speed ∝ a^(-3/2)
    float ang = aPhase + uDays * 6.2831853 / (365.25 * pow(aRadius, 1.5));
    vec3 ecl = vec3(cos(ang) * aRadius, sin(ang) * aRadius, 0.0);
    ecl.z = sin(ang + aNode) * sin(aIncl) * aRadius;
    float r = length(ecl);
    float mapped = mix(${EXPLORER_A.toFixed(1)} * pow(r, ${EXPLORER_GAMMA}), r * ${TRUE_UNITS_PER_AU.toFixed(1)}, uScaleT);
    vec3 pos = ecl * (mapped / r);
    // ecliptic → scene axes (y up)
    vec4 mv = modelViewMatrix * vec4(pos.x, pos.z, -pos.y, 1.0);
    gl_PointSize = clamp(uSize * 140.0 / -mv.z, 0.5, 2.6);
    gl_Position = projectionMatrix * mv;
    vShade = aShade;
  }
`;

const BELT_FRAG = /* glsl */ `
  precision mediump float;
  varying float vShade;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.15, length(p));
    gl_FragColor = vec4(uColor * vShade, a * uOpacity);
  }
`;

export interface BeltSpec {
  count: number;
  innerAU: number;
  outerAU: number;
  maxInclDeg: number;
  color: number;
  opacity: number;
  size: number;
  seed: number;
}

export const MAIN_BELT: BeltSpec = {
  count: 4200,
  innerAU: 2.1,
  outerAU: 3.3,
  maxInclDeg: 14,
  color: 0xb8a58e,
  opacity: 0.6,
  size: 1.6,
  seed: 555,
};

export const KUIPER_BELT: BeltSpec = {
  count: 3000,
  innerAU: 33,
  outerAU: 50,
  maxInclDeg: 20,
  color: 0x9db4cc,
  opacity: 0.4,
  size: 1.5,
  seed: 777,
};

export class Belt {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(spec: BeltSpec) {
    const rnd = mulberry32(spec.seed);
    const n = spec.count;
    const pos = new Float32Array(n * 3); // unused by the shader but required
    const radius = new Float32Array(n);
    const phase = new Float32Array(n);
    const incl = new Float32Array(n);
    const node = new Float32Array(n);
    const shade = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = Math.pow(rnd(), 0.7);
      radius[i] = spec.innerAU + (spec.outerAU - spec.innerAU) * t * (0.92 + rnd() * 0.16);
      phase[i] = rnd() * Math.PI * 2;
      incl[i] = (rnd() * rnd()) * THREE.MathUtils.degToRad(spec.maxInclDeg);
      node[i] = rnd() * Math.PI * 2;
      shade[i] = 0.5 + rnd() * 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aIncl', new THREE.BufferAttribute(incl, 1));
    geo.setAttribute('aNode', new THREE.BufferAttribute(node, 1));
    geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: BELT_VERT,
      fragmentShader: BELT_FRAG,
      uniforms: {
        uDays: { value: 0 },
        uScaleT: { value: 0 },
        uSize: { value: spec.size },
        uColor: { value: new THREE.Color(spec.color) },
        uOpacity: { value: spec.opacity },
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
}
