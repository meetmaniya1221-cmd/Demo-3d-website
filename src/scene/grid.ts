/**
 * Astronomical orbital reference grid - a polar coordinate instrument
 * centred on the Sun in the ecliptic plane:
 *
 *   - smooth concentric rings at round heliocentric distances (AU),
 *   - subtle radial spokes every 15°, with the four cardinal directions
 *     (real ecliptic longitude 0°/90°/180°/270°) slightly stronger,
 *   - a log-space LOD window: rings near the camera's current working
 *     distance are visible, much-smaller and much-larger rings fade out,
 *     so the grid stays readable at every zoom instead of stacking up.
 *
 * All rings render as ONE LineSegments draw call (per-vertex AU attribute,
 * fade computed in the shader); spokes are a second. Label anchors for the
 * HUD ladder (AU values up the 0° axis) and the cardinal degree marks are
 * computed here and projected by SkyNotes.
 */
import * as THREE from 'three';
import { EXPLORER_A, EXPLORER_GAMMA, TRUE_UNITS_PER_AU, mapDistanceAU } from '../sim/scale';

/** Full ring ladder; "major" rings can carry labels. */
interface RingSpec {
  rAU: number;
  major: boolean;
}

const RINGS: RingSpec[] = [
  { rAU: 0.1, major: true },
  { rAU: 0.15, major: false },
  { rAU: 0.2, major: true },
  { rAU: 0.3, major: false },
  { rAU: 0.5, major: true },
  { rAU: 0.7, major: false },
  { rAU: 1, major: true },
  { rAU: 1.5, major: false },
  { rAU: 2, major: true },
  { rAU: 3, major: false },
  { rAU: 5, major: true },
  { rAU: 7, major: false },
  { rAU: 10, major: true },
  { rAU: 15, major: false },
  { rAU: 20, major: true },
  { rAU: 30, major: true },
  { rAU: 40, major: false },
  { rAU: 50, major: true },
  // the outer system: scattered disc, Sedna (aphelion 937 AU), inner Oort
  // approaches - true-scale zoom-outs reach past 1,000 AU and deserve a
  // distance reference too (the LOD window hides these when irrelevant)
  { rAU: 75, major: false },
  { rAU: 100, major: true },
  { rAU: 150, major: false },
  { rAU: 250, major: true },
  { rAU: 400, major: false },
  { rAU: 700, major: false },
  { rAU: 1000, major: true },
];

const RING_SEGMENTS = 256;
const SPOKES = 24;
const PLANE_Y = -0.05;

/** Log-distance window shared by shader and label logic: 1 near the focus
 *  distance, fading to 0 for rings far smaller/larger than the view. */
function ringWeight(rAU: number, focusAU: number): number {
  const d = Math.log(rAU / focusAU);
  // asymmetric: keep a couple of rings inside, a bit more headroom outside
  const inner = THREE.MathUtils.smoothstep(d, -2.6, -1.4);
  const outer = 1 - THREE.MathUtils.smoothstep(d, 0.9, 2.0);
  return Math.min(inner, outer);
}

const GRID_VERT = /* glsl */ `
  attribute float aAU;
  attribute float aStrength; // per-line base opacity share (major/minor/cardinal)
  varying float vAlpha;
  uniform float uLogFocus;
  uniform float uOpacity;
  float win(float d, float a, float b) {
    return clamp((d - a) / (b - a), 0.0, 1.0);
  }
  void main() {
    float d = log(aAU) - uLogFocus;
    float inner = win(d, -2.6, -1.4);
    float outer = 1.0 - win(d, 0.9, 2.0);
    vAlpha = aStrength * uOpacity * min(inner, outer);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GRID_FRAG = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  uniform vec3 uColor;
  void main() {
    if (vAlpha < 0.003) discard;
    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

export interface GridLabelState {
  kind: 'au' | 'deg';
  text: string;
  world: THREE.Vector3;
  alpha: number;
}

export class ReferenceGrid {
  readonly group = new THREE.Group();
  private rings: THREE.LineSegments;
  private spokes: THREE.LineSegments;
  private ringPos: Float32Array;
  private spokePos: Float32Array;
  private spokeAU: Float32Array;
  private ringMat: THREE.ShaderMaterial;
  private spokeMat: THREE.ShaderMaterial;
  private scaleT = 0;
  private focusAU = 12;
  private labelPool: GridLabelState[] = [];
  /** Pre-allocated label states (one per possible label) - no per-frame GC. */
  private labelStatesPool: GridLabelState[] = Array.from({ length: RINGS.length + 4 }, () => ({
    kind: 'au' as const,
    text: '',
    world: new THREE.Vector3(),
    alpha: 0,
  }));

  constructor() {
    // ---- rings: one geometry, per-vertex AU + strength
    const vertsPerRing = RING_SEGMENTS * 2;
    this.ringPos = new Float32Array(RINGS.length * vertsPerRing * 3);
    const ringAU = new Float32Array(RINGS.length * vertsPerRing);
    const ringStrength = new Float32Array(RINGS.length * vertsPerRing);
    RINGS.forEach((spec, ri) => {
      const base = ri * vertsPerRing;
      for (let i = 0; i < RING_SEGMENTS; i++) {
        for (let k = 0; k < 2; k++) {
          const idx = base + i * 2 + k;
          ringAU[idx] = spec.rAU;
          ringStrength[idx] = spec.major ? 1.0 : 0.38;
        }
      }
    });
    const ringGeo = new THREE.BufferGeometry();
    ringGeo.setAttribute('position', new THREE.BufferAttribute(this.ringPos, 3));
    ringGeo.setAttribute('aAU', new THREE.BufferAttribute(ringAU, 1));
    ringGeo.setAttribute('aStrength', new THREE.BufferAttribute(ringStrength, 1));
    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      uniforms: {
        uLogFocus: { value: Math.log(12) },
        uOpacity: { value: 0.16 },
        uColor: { value: new THREE.Color(0x64788f) },
      },
      transparent: true,
      depthWrite: false,
    });
    this.rings = new THREE.LineSegments(ringGeo, this.ringMat);
    this.rings.frustumCulled = false;
    this.rings.renderOrder = -3;
    this.group.add(this.rings);

    // ---- spokes: radial lines built from short segments so the LOD window
    // can fade each PIECE by its own distance (outer reaches vanish cleanly)
    const SPOKE_STEPS = RINGS.length - 1;
    const segs = SPOKES * SPOKE_STEPS;
    this.spokePos = new Float32Array(segs * 2 * 3);
    this.spokeAU = new Float32Array(segs * 2);
    const spokeStrength = new Float32Array(segs * 2);
    for (let s = 0; s < SPOKES; s++) {
      const cardinal = s % (SPOKES / 4) === 0;
      for (let p = 0; p < SPOKE_STEPS; p++) {
        const idx = (s * SPOKE_STEPS + p) * 2;
        this.spokeAU[idx] = RINGS[p].rAU;
        this.spokeAU[idx + 1] = RINGS[p + 1].rAU;
        spokeStrength[idx] = spokeStrength[idx + 1] = cardinal ? 0.75 : 0.3;
      }
    }
    const spokeGeo = new THREE.BufferGeometry();
    spokeGeo.setAttribute('position', new THREE.BufferAttribute(this.spokePos, 3));
    spokeGeo.setAttribute('aAU', new THREE.BufferAttribute(this.spokeAU, 1));
    spokeGeo.setAttribute('aStrength', new THREE.BufferAttribute(spokeStrength, 1));
    this.spokeMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      uniforms: {
        uLogFocus: { value: Math.log(12) },
        uOpacity: { value: 0.12 },
        uColor: { value: new THREE.Color(0x64788f) },
      },
      transparent: true,
      depthWrite: false,
    });
    this.spokes = new THREE.LineSegments(spokeGeo, this.spokeMat);
    this.spokes.frustumCulled = false;
    this.spokes.renderOrder = -3;
    this.group.add(this.spokes);

    this.group.position.y = PLANE_Y;
    this.rebuild(0);
  }

  /** Re-place every vertex for the current explorer↔true blend. */
  rebuild(scaleT: number): void {
    this.scaleT = scaleT;
    RINGS.forEach((spec, ri) => {
      const r = mapDistanceAU(spec.rAU, scaleT);
      const base = ri * RING_SEGMENTS * 2 * 3;
      for (let i = 0; i < RING_SEGMENTS; i++) {
        const a0 = (i / RING_SEGMENTS) * Math.PI * 2;
        const a1 = (((i + 1) % RING_SEGMENTS) / RING_SEGMENTS) * Math.PI * 2;
        const o = base + i * 6;
        this.ringPos[o] = Math.cos(a0) * r;
        this.ringPos[o + 2] = -Math.sin(a0) * r;
        this.ringPos[o + 3] = Math.cos(a1) * r;
        this.ringPos[o + 5] = -Math.sin(a1) * r;
      }
    });
    (this.rings.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    const SPOKE_STEPS = RINGS.length - 1;
    for (let s = 0; s < SPOKES; s++) {
      const a = (s / SPOKES) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = -Math.sin(a);
      for (let p = 0; p < SPOKE_STEPS; p++) {
        const r0 = mapDistanceAU(RINGS[p].rAU, scaleT);
        const r1 = mapDistanceAU(RINGS[p + 1].rAU, scaleT);
        const o = (s * SPOKE_STEPS + p) * 6;
        this.spokePos[o] = cos * r0;
        this.spokePos[o + 2] = sin * r0;
        this.spokePos[o + 3] = cos * r1;
        this.spokePos[o + 5] = sin * r1;
      }
    }
    (this.spokes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Per-frame: adapt the LOD window to the camera's working distance. */
  updateFocus(camPos: THREE.Vector3): void {
    // working distance ≈ how far the camera is from the plane centre,
    // converted to AU through the current mapping (approximate but smooth)
    const horiz = Math.hypot(camPos.x, camPos.z);
    const sceneR = Math.max(Math.abs(camPos.y) * 1.2, horiz * 0.5, 4);
    const explorer = Math.pow(sceneR / EXPLORER_A, 1 / EXPLORER_GAMMA);
    const trueScale = sceneR / TRUE_UNITS_PER_AU;
    const f = THREE.MathUtils.clamp(
      explorer * (1 - this.scaleT) + trueScale * this.scaleT,
      0.08,
      1050,
    );
    // ease toward the target so zooming never pops rings in and out
    this.focusAU += (f - this.focusAU) * 0.08;
    const logF = Math.log(this.focusAU);
    this.ringMat.uniforms.uLogFocus.value = logF;
    this.spokeMat.uniforms.uLogFocus.value = logF;
  }

  /**
   * Labels for the HUD projector: AU values laddered up the 0° spoke
   * (+x, the vernal-equinox direction) and the four ecliptic-longitude
   * cardinal marks on the outermost well-visible major ring.
   */
  labelStates(): GridLabelState[] {
    this.labelPool.length = 0;
    let poolIdx = 0;
    const take = (): GridLabelState => this.labelStatesPool[poolIdx++];
    let outermost: number | null = null;
    for (const spec of RINGS) {
      if (!spec.major) continue;
      const w = ringWeight(spec.rAU, this.focusAU);
      if (w < 0.25) continue;
      const r = mapDistanceAU(spec.rAU, this.scaleT);
      const label = take();
      label.kind = 'au';
      // inner rings read better in million km; 1 AU and out stay in AU
      label.text =
        spec.rAU < 1 ? `${Math.round(spec.rAU * 149.6)} M km` : `${spec.rAU} AU`;
      label.world.set(r, PLANE_Y, 0);
      label.alpha = Math.min(1, w * 1.4);
      this.labelPool.push(label);
      if (w > 0.55) outermost = spec.rAU;
    }
    if (outermost !== null) {
      const r = mapDistanceAU(outermost, this.scaleT) * 1.06;
      const marks: Array<[string, number]> = [
        ['0°', 0],
        ['90°', Math.PI / 2],
        ['180°', Math.PI],
        ['270°', (3 * Math.PI) / 2],
      ];
      for (const [text, ang] of marks) {
        const label = take();
        label.kind = 'deg';
        label.text = text;
        label.world.set(Math.cos(ang) * r, PLANE_Y, -Math.sin(ang) * r);
        label.alpha = 0.8;
        this.labelPool.push(label);
      }
    }
    return this.labelPool;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  get isVisible(): boolean {
    return this.group.visible;
  }
}
