/**
 * Comet activity visuals: coma glow + two physically-motivated tails.
 *
 * The ion (plasma) tail streams straight anti-sunward - gas ionised by
 * sunlight is picked up by the solar wind's magnetic field, which travels
 * radially outward at ~400 km/s, far faster than the comet moves.
 * The dust tail also pushes anti-sunward (radiation pressure) but dust
 * leaves the nucleus slowly, so it lags along the orbit and curves.
 * Both effects mean tails point AWAY from the Sun - a comet flying outward
 * travels tail-first. Activity scales steeply as sunlight sublimates ice,
 * which is why comets "turn on" inside a few AU.
 */
import * as THREE from 'three';
import { makeGlowTexture } from './textures';

const TAIL_VERT = /* glsl */ `
  attribute float aT;      // 0..1 along the tail
  attribute vec3 aJitter;  // per-particle unit scatter
  attribute float aSeed;
  varying float vT;
  varying float vSeed;
  uniform vec3 uDir;       // anti-sunward unit vector (world)
  uniform vec3 uVel;       // orbital velocity unit vector (world)
  uniform float uLen;      // tail length, scene units
  uniform float uWidth;    // spread at the far end
  uniform float uCurve;    // 0 = straight ion tail, >0 = curved dust tail
  uniform float uTime;
  uniform float uSize;
  void main() {
    float t = aT;
    vT = t;
    vSeed = aSeed;
    // straight anti-sunward core, optionally sheared back along the orbit
    vec3 p = uDir * (t * uLen);
    p -= uVel * (t * t * uLen * uCurve);
    // widen with distance + slow swirl so the tail feels alive
    float w = uWidth * (0.12 + t);
    float swirl = uTime * (0.25 + aSeed * 0.2) + aSeed * 6.2831;
    vec3 jit = aJitter + vec3(sin(swirl), cos(swirl * 0.7), sin(swirl * 1.3)) * 0.35;
    p += jit * w;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(uSize * (1.0 - t * 0.55) * 240.0 / max(-mv.z, 0.1), 1.0, 10.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const TAIL_FRAG = /* glsl */ `
  precision highp float;
  varying float vT;
  varying float vSeed;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.08, length(p));
    // brightest near the head, fading down the tail
    a *= (1.0 - vT) * (0.55 + vSeed * 0.45) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

function tailPoints(
  count: number,
  color: THREE.Color,
  width: number,
  curve: number,
  size: number,
  opacity: number,
  seed: number,
): { points: THREE.Points; mat: THREE.ShaderMaterial } {
  const t = new Float32Array(count);
  const jitter = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const pos = new Float32Array(count * 3); // required attribute, unused
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    t[i] = Math.pow(rnd(), 1.4); // cluster particles near the head
    const a = rnd() * Math.PI * 2;
    const z = rnd() * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    jitter[i * 3] = Math.cos(a) * r;
    jitter[i * 3 + 1] = Math.sin(a) * r;
    jitter[i * 3 + 2] = z;
    seeds[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(t, 1));
  geo.setAttribute('aJitter', new THREE.BufferAttribute(jitter, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: TAIL_VERT,
    fragmentShader: TAIL_FRAG,
    uniforms: {
      uDir: { value: new THREE.Vector3(1, 0, 0) },
      uVel: { value: new THREE.Vector3(0, 0, 1) },
      uLen: { value: 1 },
      uWidth: { value: width },
      uCurve: { value: curve },
      uTime: { value: 0 },
      uSize: { value: size },
      uColor: { value: color },
      uOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat };
}

let comaTexture: THREE.Texture | null = null;

export class CometFX {
  readonly group = new THREE.Group();
  private ion: ReturnType<typeof tailPoints>;
  private dust: ReturnType<typeof tailPoints>;
  private coma: THREE.Sprite;
  /** Current activity level 0..4 (0 = frozen, far from the Sun). */
  activity = 0;

  constructor(seed: number) {
    this.ion = tailPoints(1100, new THREE.Color(0.45, 0.65, 1.0), 0.2, 0, 0.62, 0.4, seed);
    this.dust = tailPoints(1600, new THREE.Color(1.0, 0.93, 0.78), 0.5, 0.35, 0.8, 0.3, seed + 7);
    comaTexture ??= makeGlowTexture(128, [
      [0, 'rgba(210,230,255,0.9)'],
      [0.35, 'rgba(170,200,255,0.35)'],
      [1, 'rgba(140,170,255,0)'],
    ]);
    this.coma = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: comaTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.group.add(this.ion.points, this.dust.points, this.coma);
    this.group.visible = false;
  }

  /**
   * @param rAU current heliocentric distance
   * @param antiSun world-space unit vector away from the Sun
   * @param velDir world-space unit vector along the orbital motion
   * @param nucleusR display radius of the nucleus
   * @param scaleT explorer(0) -> true(1) blend
   */
  update(
    rAU: number,
    antiSun: THREE.Vector3,
    velDir: THREE.Vector3,
    nucleusR: number,
    scaleT: number,
    elapsed: number,
  ): void {
    // sublimation-driven activity: steep inverse-square-ish rise inside ~5 AU
    let act = Math.min(4, Math.pow(2.8 / Math.max(rAU, 0.05), 2));
    act *= THREE.MathUtils.smoothstep(6.5 - rAU, 0, 2.5); // gentle outer cutoff
    this.activity = act;
    const on = act > 0.02;
    this.group.visible = on;
    if (!on) return;

    const len = act * (3.2 * (1 - scaleT) + 12 * scaleT);
    for (const tail of [this.ion, this.dust]) {
      (tail.mat.uniforms.uDir.value as THREE.Vector3).copy(antiSun);
      (tail.mat.uniforms.uVel.value as THREE.Vector3).copy(velDir);
      tail.mat.uniforms.uTime.value = elapsed;
    }
    this.ion.mat.uniforms.uLen.value = len;
    this.dust.mat.uniforms.uLen.value = len * 0.7;
    this.ion.mat.uniforms.uOpacity.value = Math.min(0.42, act * 0.24);
    this.dust.mat.uniforms.uOpacity.value = Math.min(0.34, act * 0.19);
    const comaScale = nucleusR * (1.7 + act * 2.0);
    this.coma.scale.setScalar(comaScale);
    (this.coma.material as THREE.SpriteMaterial).opacity = Math.min(0.6, 0.16 + act * 0.13);
  }
}
