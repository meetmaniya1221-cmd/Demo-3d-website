/**
 * Interactive 3D cross-section: a real sphere with a wedge cut out of it.
 *
 * Every layer of a body's published interior model becomes two pieces of
 * geometry - a partial spherical shell (the wedge removed) and a flat
 * half-annulus capping each side of the cut - so the exposed faces show the
 * concentric structure exactly as a sawn-open sphere would. Nothing here is
 * a billboard or a painted diagram: the shells are nested 3D surfaces you
 * can orbit around and look into, and label anchors are real world-space
 * points the UI projects each frame.
 *
 * Layer radii, colours, notes and knowledge tags all come from the same
 * INTERIORS catalog the 2D structure view uses, so the two can never drift
 * apart. The Sun renders with emissive plasma shaders (fusion-bright core,
 * diffusing radiative zone, boiling convective cells, granular photosphere);
 * solid worlds render lit, so a rocky mantle does not glow like a star.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CatalogObject, InteriorLayer } from '../data/types';
import { makeGlowTexture } from './textures';

/** Azimuth span of the removed wedge, in radians, at full open. */
export const MAX_CUT = Math.PI * 0.52;
const SPHERE_R = 1;

/* --------------------------------------------------------------- shaders -- */

// Compact 3D simplex noise (Ashima Arts / Ian McEwan, MIT) - same one the
// main Sun shader uses, so the plasma reads as the same material.
const NOISE_GLSL = /* glsl */ `
  vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
  vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

const LAYER_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    vPos = position;
    vUv = uv;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

/**
 * One material for every layer. uStyle picks the physics being drawn:
 *   0 core - fusion glow, slow flicker
 *   1 radiative zone - photons random-walking outward as drifting bands
 *   2 convective zone - rising and sinking plasma cells
 *   3 photosphere - granulation over the real surface map
 *   4 solid - lit rock/ice/metal for the non-star bodies
 * uIsCap switches the sampling from the shell surface to the flat cut face,
 * where the radial coordinate is what matters.
 */
const LAYER_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vPos;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uStyle;
  uniform float uIsCap;
  uniform float uInner;
  uniform float uOuter;
  uniform float uHighlight;
  uniform float uDim;
  uniform sampler2D uMap;
  uniform float uHasMap;
  ${NOISE_GLSL}

  float fbm(vec3 p) {
    return snoise(p) * 0.6 + snoise(p * 2.1) * 0.28 + snoise(p * 4.3) * 0.12;
  }

  void main() {
    float r = length(vPos);
    // 0 at the layer's inner edge, 1 at its outer edge
    float f = clamp((r - uInner) / max(uOuter - uInner, 1e-4), 0.0, 1.0);
    vec3 dir = vPos / max(r, 1e-4);
    float t = uTime;
    vec3 col;
    float alpha = 1.0;

    // Each style paints from the layer's own catalog colour: a deep base for
    // the body of the layer, a hot accent where the physics is energetic.
    // Keeping the ramp anchored to one hue is what stops the star clipping to
    // a white blob and lets the four zones stay told apart.
    vec3 deep = uColor * 0.42;
    vec3 mid = uColor * 0.92;
    vec3 hot = mix(uColor, vec3(1.0), 0.38);

    if (uStyle < 0.5) {
      // ---- core: fusion. The brightest thing in the model, white-hot at the
      // centre and cooling toward the radiative boundary.
      float n = fbm(dir * 5.0 + vec3(0.0, t * 0.25, 0.0)) * 0.5 + 0.5;
      float centre = 1.0 - smoothstep(0.0, 1.05, f);
      col = mix(mid, hot, 0.35 + 0.5 * n);
      col = mix(col, vec3(1.0, 0.98, 0.90), centre * (uIsCap > 0.5 ? 0.85 : 0.55));
      col *= 0.95 + 0.07 * sin(t * 1.7) + 0.06 * n;
    } else if (uStyle < 1.5) {
      // ---- radiative zone: energy diffusing outward over millennia, drawn as
      // slow bands creeping toward the surface
      float n = fbm(dir * 6.0 + vec3(t * 0.05, t * 0.04, 0.0)) * 0.5 + 0.5;
      float bands = 0.5 + 0.5 * sin(r * 46.0 - t * 0.5 + n * 3.0);
      col = mix(deep, mid, 0.45 + 0.55 * n);
      col = mix(col, hot, bands * 0.35 * (1.0 - f * 0.4));
    } else if (uStyle < 2.5) {
      // ---- convective zone: plasma boiling in columns. Cells drift outward
      // along the radius and churn sideways.
      vec3 q = dir * 9.0;
      q.y -= t * 0.35;
      float cells = fbm(q + vec3(0.0, 0.0, t * 0.12)) * 0.5 + 0.5;
      float plume = 0.5 + 0.5 * sin(cells * 7.0 + r * 20.0 - t * 1.1);
      col = mix(deep, mid, cells);
      col = mix(col, hot, plume * 0.42);
    } else if (uStyle < 3.5) {
      // ---- photosphere: granulation over the photographic surface
      float n = fbm(dir * 12.0 + vec3(t * 0.09, t * 0.06, -t * 0.05)) * 0.5 + 0.5;
      col = mix(deep, mid, smoothstep(0.25, 0.85, n));
      col = mix(col, hot, smoothstep(0.72, 1.0, n) * 0.5);
      if (uHasMap > 0.5 && uIsCap < 0.5) {
        vec3 tex = texture2D(uMap, vUv).rgb;
        col = tex * (0.72 + 0.45 * n);
      }
    } else {
      // ---- solid worlds: lit surface, not a light source
      float n = fbm(dir * 7.0) * 0.5 + 0.5;
      vec3 base = mix(uColor * 0.75, uColor, n);
      if (uHasMap > 0.5 && uIsCap < 0.5) base = texture2D(uMap, vUv).rgb;
      vec3 lightDir = normalize(vec3(0.55, 0.5, 0.85));
      float lambert = max(dot(normalize(vNormalV), lightDir), 0.0);
      // the cut face is flat-lit so the exposed interior stays readable
      float lit = uIsCap > 0.5 ? 0.78 : (0.24 + 0.86 * lambert);
      col = base * lit;
    }

    // Curved shells are shaded like curved things - limb darkening on the
    // spherical surfaces, flat light on the section faces so the exposed
    // interior stays legible. Without this the emissive plasma reads as a
    // flat 2D fill, which is exactly what this view exists not to be.
    float facing = clamp(dot(normalize(vNormalV), normalize(vViewDir)), 1e-4, 1.0);
    if (uIsCap < 0.5) {
      col *= 0.50 + 0.62 * pow(facing, 0.5);
    } else {
      // the section face falls off gently toward the rim, so the cut reads as
      // a real plane catching light rather than a sticker
      col *= 0.86 + 0.30 * (1.0 - f * 0.5);
    }

    // rim light picks out the curvature of every shell
    float rim = 1.0 - facing;
    col += uHot * pow(rim, 3.2) * (uIsCap > 0.5 ? 0.04 : 0.22);

    // a hairline at the cut edge makes the section plane unmistakable
    if (uIsCap > 0.5) {
      float edge = smoothstep(0.985, 1.0, f) + smoothstep(0.015, 0.0, f);
      col = mix(col, vec3(1.0), edge * 0.35);
    }

    col *= mix(1.0, 1.45, uHighlight);
    col *= uDim;
    gl_FragColor = vec4(min(col, vec3(1.45)), alpha);
  }
`;

/* ------------------------------------------------------------- particles -- */

const HEAT_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aSize;
  attribute float aSide;
  varying float vFade;
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  uniform float uCut;
  uniform float uPr;
  void main() {
    // each particle rises through the convective band and falls back, which
    // is what convection does: hot plasma up, cooled plasma down
    float cycle = fract(aPhase + uTime * aSpeed * 0.06);
    float rise = cycle < 0.5 ? cycle * 2.0 : (1.0 - cycle) * 2.0;
    float r = mix(uInner, uOuter, rise);
    // ride the two cut faces so the motion is visible inside the section
    float phi = aSide < 0.5 ? 0.0 : uCut;
    float theta = position.y;
    vec3 p = vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta)) * r;
    // nudge off the face so the sprites are not z-fighting the cap
    p += vec3(-cos(phi), 0.0, sin(phi)) * 0.0 + normalize(cross(vec3(0.0, 1.0, 0.0), vec3(-cos(phi), 0.0, sin(phi)))) * (aSide < 0.5 ? 0.004 : -0.004);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFade = sin(cycle * 3.14159) * (cycle < 0.5 ? 1.0 : 0.55);
    // clamped: an unclamped perspective size turns these into screen-filling
    // additive blobs the moment the camera comes close
    gl_PointSize = clamp(aSize * 26.0 / max(-mv.z, 0.1), 1.0, 5.0) * uPr;
    gl_Position = projectionMatrix * mv;
  }
`;

const HEAT_FRAG = /* glsl */ `
  precision highp float;
  varying float vFade;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.05, length(d));
    gl_FragColor = vec4(uColor, a * vFade * uOpacity);
  }
`;

/* ----------------------------------------------------------------- scene -- */

export interface LayerAnchor {
  index: number;
  layer: InteriorLayer;
  /** World-space point the label points at. */
  position: THREE.Vector3;
  innerFraction: number;
}

interface LayerParts {
  shell: THREE.Mesh;
  caps: THREE.Mesh[];
  material: THREE.ShaderMaterial;
  inner: number;
  outer: number;
}

export class CutawayScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly renderer: THREE.WebGLRenderer;
  /** Radians of azimuth currently removed; animated on reveal. */
  cutAngle = MAX_CUT;
  autoRotate = true;
  private group = new THREE.Group();
  private layers: LayerParts[] = [];
  private defs: InteriorLayer[] = [];
  private heat: THREE.Points | null = null;
  private heatMat: THREE.ShaderMaterial | null = null;
  private corona: THREE.Sprite | null = null;
  private elapsed = 0;
  private isStar = false;
  private highlight: number | null = null;
  private surfaceMap: THREE.Texture | null = null;
  private builtCut = -1;
  private frameId = 0;
  private frontFrame = -1;
  private frontCache: { phi: number; normal: THREE.Vector3 } | null = null;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearAlpha(0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
    this.camera.position.set(-2.6, 1.35, 2.95);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 7;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.8;

    this.scene.add(this.group);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 2.5, 4);
    this.scene.add(key);
  }

  /** Build the shells for a body's published interior model. */
  setBody(def: CatalogObject, surfaceMapUrl?: string): void {
    this.disposeLayers();
    const interior = def.interior;
    if (!interior) return;
    this.defs = interior.layers;
    this.isStar = def.type === 'star';
    this.builtCut = -1;

    if (surfaceMapUrl) {
      new THREE.TextureLoader().load(surfaceMapUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        // opening a second body would otherwise strand the first one's map
        this.surfaceMap?.dispose();
        this.surfaceMap = tex;
        const outer = this.layers[this.layers.length - 1];
        if (outer) {
          outer.material.uniforms.uMap.value = tex;
          outer.material.uniforms.uHasMap.value = 1;
        }
      });
    }

    for (let i = 0; i < this.defs.length; i++) {
      const l = this.defs[i];
      const inner = i === 0 ? 0 : this.defs[i - 1].outerRadiusFraction * SPHERE_R;
      const outer = l.outerRadiusFraction * SPHERE_R;
      const style = this.isStar ? Math.min(i, 3) : 4;
      const color = new THREE.Color(l.color);
      const hot = color.clone().lerp(new THREE.Color(0xffffff), this.isStar ? 0.55 : 0.25);
      const material = new THREE.ShaderMaterial({
        vertexShader: LAYER_VERT,
        fragmentShader: LAYER_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: color },
          uHot: { value: hot },
          uStyle: { value: style },
          uIsCap: { value: 0 },
          uInner: { value: inner },
          uOuter: { value: outer },
          uHighlight: { value: 0 },
          uDim: { value: 1 },
          uMap: { value: null },
          uHasMap: { value: 0 },
        },
        side: THREE.DoubleSide,
      });
      const shell = new THREE.Mesh(new THREE.BufferGeometry(), material);
      shell.renderOrder = i;
      // caps share the material's look but sample it as a flat section
      const capMat = material.clone();
      capMat.uniforms.uIsCap.value = 1;
      capMat.side = THREE.DoubleSide;
      const caps = [new THREE.Mesh(new THREE.BufferGeometry(), capMat), new THREE.Mesh(new THREE.BufferGeometry(), capMat)];
      for (const c of caps) c.renderOrder = i;
      this.group.add(shell, caps[0], caps[1]);
      this.layers.push({ shell, caps, material, inner, outer });
    }

    // heat flow along the exposed convective band (stars only)
    if (this.isStar && this.defs.length >= 3) {
      const band = this.layers[this.layers.length - 2];
      this.buildHeatParticles(band.inner, band.outer);
    }
    if (this.isStar) this.buildCorona();

    this.rebuildGeometry(true);
  }

  private buildHeatParticles(inner: number, outer: number): void {
    const COUNT = 420;
    const pos = new Float32Array(COUNT * 3);
    const phase = new Float32Array(COUNT);
    const speed = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);
    const side = new Float32Array(COUNT);
    let seed = 24601;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < COUNT; i++) {
      // position.y carries the polar angle; the shader turns it into a point
      // on whichever cut face this particle belongs to
      pos[i * 3 + 1] = 0.12 + rnd() * (Math.PI - 0.24);
      phase[i] = rnd();
      speed[i] = 0.6 + rnd() * 1.1;
      size[i] = 1.1 + rnd() * 2.2;
      side[i] = rnd() < 0.5 ? 0 : 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.heatMat = new THREE.ShaderMaterial({
      vertexShader: HEAT_VERT,
      fragmentShader: HEAT_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uInner: { value: inner + 0.01 },
        uOuter: { value: outer - 0.01 },
        uCut: { value: this.cutAngle },
        uPr: { value: 1 },
        uColor: { value: new THREE.Color(0xffd9a0) },
        uOpacity: { value: 0.42 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.heat = new THREE.Points(geo, this.heatMat);
    this.heat.frustumCulled = false;
    this.heat.renderOrder = 20;
    this.group.add(this.heat);
  }

  private buildCorona(): void {
    const tex = makeGlowTexture(256, [
      [0, 'rgba(255,206,138,0.34)'],
      [0.28, 'rgba(255,158,76,0.16)'],
      [0.62, 'rgba(255,124,46,0.05)'],
      [1, 'rgba(255,120,40,0)'],
    ]);
    this.corona = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        // depth-tested so the corona stays a halo around the limb instead of
        // washing out the exposed interior
        depthTest: true,
        transparent: true,
      }),
    );
    this.corona.scale.setScalar(2.6);
    this.corona.renderOrder = -1;
    this.group.add(this.corona);
  }

  /**
   * Rebuild shells and caps for the current cut angle. Called while the
   * reveal animates and when the user drags the cut control; the geometry is
   * small enough (a few thousand triangles) that this stays cheap.
   */
  private rebuildGeometry(force = false): void {
    const cut = this.cutAngle;
    if (!force && Math.abs(cut - this.builtCut) < 0.004) return;
    this.builtCut = cut;
    const open = cut > 0.002;

    for (let i = 0; i < this.layers.length; i++) {
      const parts = this.layers[i];
      const { inner, outer } = parts;
      const wSeg = Math.max(24, Math.round(64 * (1 - cut / (Math.PI * 2))));

      parts.shell.geometry.dispose();
      parts.shell.geometry = new THREE.SphereGeometry(
        outer,
        wSeg,
        36,
        cut,
        Math.PI * 2 - cut,
      );

      // Flat section faces. A plane through the axis cuts a shell into a
      // half-annulus from the inner to the outer radius - which is exactly
      // the concentric banding a sawn-open sphere shows.
      for (let s = 0; s < 2; s++) {
        const phi = s === 0 ? 0 : cut;
        parts.caps[s].geometry.dispose();
        const ring = new THREE.RingGeometry(inner, outer, 48, 1, -Math.PI / 2, Math.PI);
        // the ring is built in XY; swing it onto the cut half-plane at phi
        ring.rotateY(Math.PI + phi);
        parts.caps[s].geometry = ring;
        parts.caps[s].visible = open;
      }
    }
    if (this.heatMat) this.heatMat.uniforms.uCut.value = cut;
  }

  /**
   * Outward normal of a section face, i.e. the direction the exposed side of
   * the cut looks toward. Three.js sphere azimuth runs
   * dir(phi) = (-cos phi, 0, sin phi), and the wedge spans [0, cutAngle], so
   * the face at phi = 0 faces the way phi increases and the far face faces
   * back the other way.
   */
  private faceNormal(phi: number, atStart: boolean): THREE.Vector3 {
    const n = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
    return atStart ? n : n.negate();
  }

  /** Whichever section face is currently turned toward the camera. Cached per
   *  frame: the label pass asks for it once per layer. */
  private frontFace(): { phi: number; normal: THREE.Vector3 } {
    if (this.frontCache && this.frontFrame === this.frameId) return this.frontCache;
    const camLocal = this.group.worldToLocal(this.camera.position.clone()).normalize();
    const a = { phi: 0, normal: this.faceNormal(0, true) };
    const b = { phi: this.cutAngle, normal: this.faceNormal(this.cutAngle, false) };
    this.frontCache = a.normal.dot(camLocal) >= b.normal.dot(camLocal) ? a : b;
    this.frontFrame = this.frameId;
    return this.frontCache;
  }

  /**
   * World-space points for the callouts, inner layer first. They sit on the
   * exposed section face, one per layer along a single radial line, so each
   * label points at the band it names - and they travel with the face as the
   * model turns.
   */
  anchors(): LayerAnchor[] {
    const out: LayerAnchor[] = [];
    const face = this.frontFace();
    const phi = face.phi;
    // radial direction inside the face plane, lifted a little above the
    // equator so the callout line does not run along the rim
    const theta = Math.PI * 0.42;
    const radial = new THREE.Vector3(
      -Math.cos(phi) * Math.sin(theta),
      Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
    );
    for (let i = 0; i < this.layers.length; i++) {
      const { inner, outer } = this.layers[i];
      const mid = i === this.layers.length - 1 ? (inner + outer * 3) / 4 : (inner + outer) / 2;
      const p = radial.clone().multiplyScalar(mid).addScaledVector(face.normal, 0.012);
      out.push({
        index: i,
        layer: this.defs[i],
        position: this.group.localToWorld(p),
        innerFraction: i === 0 ? 0 : this.defs[i - 1].outerRadiusFraction,
      });
    }
    return out;
  }

  /**
   * A callout is readable only when both things are true: the face it sits on
   * is turned toward the camera (edge-on, the band it names is a sliver), and
   * the body itself is not in the way. The second test is analytic - walk from
   * the anchor toward the camera, find where that ray leaves the outer sphere,
   * and check it escapes through the removed wedge rather than through solid
   * plasma. Without it the callouts keep pointing at layers while you are
   * looking at the star's back.
   */
  anchorVisible(p: THREE.Vector3): boolean {
    if (this.cutAngle < 0.05) return false;
    const face = this.frontFace();
    const local = this.group.worldToLocal(this.tmpA.copy(p));
    const dir = this.group
      .worldToLocal(this.tmpB.copy(this.camera.position))
      .sub(local)
      .normalize();
    if (face.normal.dot(dir) <= 0.25) return false;

    const b = local.dot(dir);
    const c = local.lengthSq() - SPHERE_R * SPHERE_R;
    const disc = b * b - c;
    if (disc <= 0) return true; // the anchor is already outside the body
    const t = -b + Math.sqrt(disc);
    if (t <= 0) return true;
    const ex = local.x + dir.x * t;
    const ez = local.z + dir.z * t;
    // three.js sphere azimuth: x = -cos(phi) sin(theta), z = sin(phi) sin(theta)
    let phi = Math.atan2(ez, -ex);
    if (phi < 0) phi += Math.PI * 2;
    return phi <= this.cutAngle;
  }

  /** Emphasise one layer (or null for none). */
  setHighlight(index: number | null): void {
    this.highlight = index;
    for (let i = 0; i < this.layers.length; i++) {
      const on = index === null || index === i;
      const hi = index === i ? 1 : 0;
      for (const m of [this.layers[i].material, this.layers[i].caps[0].material as THREE.ShaderMaterial]) {
        m.uniforms.uHighlight.value = hi;
        m.uniforms.uDim.value = on ? 1 : 0.45;
      }
    }
  }

  get highlighted(): number | null {
    return this.highlight;
  }

  resize(w: number, h: number): void {
    const pr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    if (this.heatMat) this.heatMat.uniforms.uPr.value = pr;
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.frameId++;
    this.rebuildGeometry();
    for (const l of this.layers) {
      l.material.uniforms.uTime.value = this.elapsed;
      (l.caps[0].material as THREE.ShaderMaterial).uniforms.uTime.value = this.elapsed;
    }
    if (this.heatMat) this.heatMat.uniforms.uTime.value = this.elapsed;
    if (this.corona) {
      this.corona.material.opacity = 0.55 + 0.1 * Math.sin(this.elapsed * 0.9);
    }
    if (this.autoRotate) this.group.rotation.y += dt * 0.12;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resetView(): void {
    this.camera.position.set(-2.6, 1.35, 2.95);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.group.rotation.y = 0;
  }

  private disposeLayers(): void {
    for (const l of this.layers) {
      l.shell.geometry.dispose();
      l.material.dispose();
      for (const c of l.caps) {
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
      this.group.remove(l.shell, l.caps[0], l.caps[1]);
    }
    this.layers = [];
    if (this.heat) {
      this.heat.geometry.dispose();
      this.heatMat?.dispose();
      this.group.remove(this.heat);
      this.heat = null;
      this.heatMat = null;
    }
    if (this.corona) {
      this.corona.material.map?.dispose();
      this.corona.material.dispose();
      this.group.remove(this.corona);
      this.corona = null;
    }
  }

  dispose(): void {
    this.disposeLayers();
    this.surfaceMap?.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
