/**
 * The Oort cloud - a CONCEPTUAL visualization. The cloud has never been
 * observed directly; its existence and rough shape are inferred from the
 * orbits of long-period comets (NASA Science, Oort-cloud overview). This
 * renders that model honestly: an extremely sparse, diffuse, roughly
 * spherical swarm from ~2,000 AU outward, with the inner (Hills) region
 * slightly flattened toward the ecliptic and denser than the outer halo.
 *
 * Orbital motion out here takes hundreds of thousands of years, so the
 * points are static. The whole layer fades in only when the camera pulls
 * far outside the planetary system - up close it does not exist visually,
 * which is also true of the real thing.
 */
import * as THREE from 'three';
import { mulberry32 } from './noise';
import { EXPLORER_A, EXPLORER_GAMMA, TRUE_UNITS_PER_AU, mapDistanceAU } from '../sim/scale';
import { renderBudget } from './budget';

const INNER_AU = 2000;
const OUTER_AU = 60000;

const OORT_VERT = /* glsl */ `
  attribute vec3 aPosAU;    // heliocentric position, AU (ecliptic frame)
  attribute float aShade;
  varying float vShade;
  uniform float uScaleT;
  uniform float uPr;
  void main() {
    float r = length(aPosAU);
    float mapped = mix(${EXPLORER_A.toFixed(4)} * pow(r, ${EXPLORER_GAMMA.toFixed(4)}), r * ${TRUE_UNITS_PER_AU.toFixed(4)}, uScaleT);
    vec3 ecl = aPosAU * (mapped / r);
    // ecliptic → scene axes (y up)
    vec4 mv = modelViewMatrix * vec4(ecl.x, ecl.z, -ecl.y, 1.0);
    gl_PointSize = clamp(1.9 * 1400.0 / max(-mv.z, 1.0), 0.8, 2.6) * uPr;
    gl_Position = projectionMatrix * mv;
    vShade = aShade;
  }
`;

const OORT_FRAG = /* glsl */ `
  precision highp float;
  varying float vShade;
  uniform float uOpacity;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.1, length(p));
    // pale, cold, non-glowing ice - deliberately NOT a luminous shell
    gl_FragColor = vec4(vec3(0.62, 0.70, 0.80) * vShade, a * uOpacity);
  }
`;

export class OortCloud {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private enabled = true;
  private baseOpacity = 0.5;

  constructor(count = Math.round(9000 * renderBudget().particleScale), seed = 991) {
    const rnd = mulberry32(seed);
    const pos = new Float32Array(count * 3);
    const shade = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // log-spread radius, weighted toward the inner cloud (real density
      // falls steeply, roughly r^-3.5)
      const r = INNER_AU * Math.exp(Math.log(OUTER_AU / INNER_AU) * Math.pow(rnd(), 2.1));
      // isotropic direction...
      const z = 2 * rnd() - 1;
      const phi = rnd() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - z * z));
      // ...with the inner (Hills) region squashed toward the ecliptic
      const flatten = 0.45 + 0.55 * Math.min(1, Math.max(0, (r - INNER_AU) / 18000));
      const zf = z * flatten;
      const norm = r / Math.hypot(s, zf);
      pos[i * 3] = Math.cos(phi) * s * norm;
      pos[i * 3 + 1] = Math.sin(phi) * s * norm;
      pos[i * 3 + 2] = zf * norm;
      shade[i] = 0.35 + rnd() * 0.65;
    }
    const geo = new THREE.BufferGeometry();
    // three.js requires a 'position' attribute even though the shader
    // derives everything from aPosAU
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aPosAU', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: OORT_VERT,
      fragmentShader: OORT_FRAG,
      uniforms: {
        uScaleT: { value: 0 },
        uPr: { value: Math.min(2, window.devicePixelRatio || 1) },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }

  /** Fade with camera distance: the cloud only exists when you pull far
   *  outside the planetary system; at true scale it sits beyond the view
   *  frustum, so it quietly bows out rather than pretending. */
  update(scaleT: number, cameraDist: number): void {
    this.mat.uniforms.uScaleT.value = scaleT;
    const gateStart = mapDistanceAU(28, scaleT); // Neptune-ish
    const gateFull = mapDistanceAU(160, scaleT);
    const t = Math.min(1, Math.max(0, (cameraDist - gateStart) / (gateFull - gateStart)));
    const fade = t * t * (3 - 2 * t) * (1 - scaleT * 0.85);
    const opacity = this.enabled ? this.baseOpacity * fade : 0;
    this.mat.uniforms.uOpacity.value = opacity;
    this.points.visible = opacity > 0.004;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  setPixelRatio(pr: number): void {
    this.mat.uniforms.uPr.value = pr;
  }
}
