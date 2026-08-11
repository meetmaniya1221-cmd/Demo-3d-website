/**
 * Screen-space object markers: one GPU point per registered body, drawn at a
 * CONSTANT pixel size. This is the far-distance representation for every
 * minor body (comets, asteroids, dwarfs, moons).
 *
 * Why it exists - the flicker fix: a sub-pixel mesh (a 100 m comet nucleus
 * hundreds of units away) rasterises to 0-or-1 pixels frame to frame, and a
 * single bright pixel crossing the bloom threshold pumps a full-screen glow
 * in and out. The cure is never to rasterise sub-pixel geometry at all:
 * meshes fade out below a few projected pixels and this marker - stable,
 * fixed-size, deliberately below the bloom threshold - fades in.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aFade;
  attribute float aPull;   // camera-ward offset so a marker clears its own mesh
  varying vec3 vColor;
  varying float vFade;
  uniform float uSize;     // device pixels
  void main() {
    vColor = aColor;
    vFade = aFade;
    vec3 toCam = normalize(cameraPosition - position);
    vec4 mv = modelViewMatrix * vec4(position + toCam * aPull, 1.0);
    gl_PointSize = uSize;
    gl_Position = projectionMatrix * mv;
    // fully faded markers are pushed off-screen instead of alpha-tested,
    // so the raster cost disappears with them
    if (vFade < 0.01) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    // crisp core with a soft rim - reads as an instrument mark, not a star
    float core = smoothstep(0.55, 0.35, d);
    float rim = smoothstep(1.0, 0.55, d) * 0.35;
    float a = (core + rim) * vFade;
    if (a < 0.004) discard;
    // kept below the bloom threshold on purpose: markers must never pump bloom
    gl_FragColor = vec4(min(vColor, vec3(0.82)), a * 0.9);
  }
`;

export class Markers {
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private fade: Float32Array;
  private pull: Float32Array;
  private count = 0;
  private capacity: number;
  private ids = new Map<string, number>();

  constructor(capacity = 96) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.fade = new Float32Array(capacity);
    this.pull = new Float32Array(capacity);
    const color = new Float32Array(capacity * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    this.geo.setAttribute('aFade', new THREE.BufferAttribute(this.fade, 1));
    this.geo.setAttribute('aPull', new THREE.BufferAttribute(this.pull, 1));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uSize: { value: 6 } },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  setPixelRatio(pr: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uSize.value = 6 * pr;
  }

  /** Reserve a marker slot for a body; returns its index. */
  register(id: string, color: number): number {
    let idx = this.ids.get(id);
    if (idx !== undefined) return idx;
    if (this.count >= this.capacity) return -1;
    idx = this.count++;
    this.ids.set(id, idx);
    const c = new THREE.Color(color);
    // lift very dark colors so the mark stays readable against space
    const l = Math.max(c.r, c.g, c.b);
    if (l < 0.45 && l > 0) c.multiplyScalar(0.45 / l);
    const attr = this.geo.getAttribute('aColor') as THREE.BufferAttribute;
    attr.setXYZ(idx, c.r, c.g, c.b);
    attr.needsUpdate = true;
    this.geo.setDrawRange(0, this.count);
    return idx;
  }

  /** Per-frame update of one marker. fade 0..1; pull = camera-ward offset. */
  set(idx: number, x: number, y: number, z: number, fade: number, pullDist: number): void {
    if (idx < 0) return;
    this.pos[idx * 3] = x;
    this.pos[idx * 3 + 1] = y;
    this.pos[idx * 3 + 2] = z;
    this.fade[idx] = fade;
    this.pull[idx] = pullDist;
  }

  /** Commit this frame's attribute writes. */
  commit(): void {
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aFade') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aPull') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Projected radius of a sphere in CSS pixels. */
export function projectedPx(
  radius: number,
  distance: number,
  halfTanFov: number,
  viewportH: number,
): number {
  if (distance <= 1e-9) return viewportH;
  return (radius / (distance * halfTanFov)) * (viewportH / 2);
}

/** 0 → mesh regime, 1 → marker regime, smooth in between. */
export function markerFade(px: number, meshFullPx = 5, meshGonePx = 2.2): number {
  return THREE.MathUtils.clamp((meshFullPx - px) / (meshFullPx - meshGonePx), 0, 1);
}
