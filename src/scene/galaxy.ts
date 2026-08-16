/**
 * The Milky Way, drawn where the Milky Way actually is.
 *
 * The band is not a picture pasted on a sphere and it is not tilted by eye. It
 * is evaluated per fragment in *galactic* coordinates - the same (l, b) frame
 * astronomers use - and the sphere carries the real J2000 rotation that takes
 * the scene's ecliptic axes into that frame. So the band crosses Sagittarius
 * and Cygnus where it should, the bulge sits toward l = 0 rather than wherever
 * looked nice, and it agrees with the constellation figures drawn over it.
 *
 * Evaluating it in a shader rather than baking a canvas buys three things that
 * matter here: there is no equirectangular seam and no polar pinch, because the
 * noise is sampled on the 3D direction itself; detail holds up when a cockpit
 * window magnifies a patch of sky; and boot spends no time painting a texture.
 *
 * The structure is the physics, roughly stated:
 *   - an exponential disc, thin toward the centre and flaring to the anticentre
 *   - a bulge, broad and warm, concentrated within ~20° of l = 0
 *   - arm tangents, where a line of sight runs down a spiral arm and the
 *     surface brightness piles up (Scutum, Sagittarius, Carina, Cygnus)
 *   - dust: dark filaments hugging the plane, which is what makes the Great
 *     Rift split the band from Cygnus to Sagittarius
 *   - reddening, applied *because* of that dust rather than painted on, so the
 *     obscured regions go amber the way the real thing does
 *
 * Reference for the geometry: NASA/IPAC and the standard J2000 galactic pole
 * (RA 192.859508°, Dec 27.128336°, ascending node 32.932°).
 */
import * as THREE from 'three';
import { SNOISE_GLSL } from './glslnoise';

/** Obliquity of the ecliptic at J2000, degrees. */
const OBLIQUITY = 23.4392911;

/**
 * Equatorial (J2000) → galactic. Rows are the galactic x, y, z axes expressed
 * in equatorial components; this is the standard matrix, not a fitted one.
 */
const EQ_TO_GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
];

/** J2000 equatorial RA/Dec (degrees) → galactic longitude/latitude (degrees). */
export function equatorialToGalacticLB(raDeg: number, decDeg: number): { lDeg: number; bDeg: number } {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  const g = EQ_TO_GAL;
  const gx = g[0][0] * x + g[0][1] * y + g[0][2] * z;
  const gy = g[1][0] * x + g[1][1] * y + g[1][2] * z;
  const gz = g[2][0] * x + g[2][1] * y + g[2][2] * z;
  return {
    lDeg: ((Math.atan2(gy, gx) * 180) / Math.PI + 360) % 360,
    bDeg: (Math.asin(Math.max(-1, Math.min(1, gz))) * 180) / Math.PI,
  };
}

/**
 * Scene direction → galactic direction, as a single matrix.
 *
 * The scene stores ecliptic [x, y, z] as three.js [x, z, −y] (see sim/scale),
 * so the first step undoes that swap, the second rotates ecliptic → equatorial
 * by the obliquity, and the third applies the galactic rotation above.
 */
export function sceneToGalacticMatrix(): THREE.Matrix3 {
  const e = THREE.MathUtils.degToRad(OBLIQUITY);
  const ce = Math.cos(e);
  const se = Math.sin(e);

  // scene (x, y, z) -> ecliptic (x, -z, y)
  const sceneToEcl = [
    [1, 0, 0],
    [0, 0, -1],
    [0, 1, 0],
  ];
  // ecliptic -> equatorial: rotation about the x axis by +obliquity
  const eclToEq = [
    [1, 0, 0],
    [0, ce, -se],
    [0, se, ce],
  ];

  const mul = (a: number[][], b: number[][]) =>
    a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));

  const m = mul(EQ_TO_GAL, mul(eclToEq, sceneToEcl));
  // Matrix3.set takes row-major arguments
  return new THREE.Matrix3().set(
    m[0][0], m[0][1], m[0][2],
    m[1][0], m[1][1], m[1][2],
    m[2][0], m[2][1], m[2][2],
  );
}

const GALAXY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GALAXY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform mat3 uGal;
  uniform float uIntensity;
  ${SNOISE_GLSL}

  float fbm(vec3 p, int oct) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 6; i++) {
      if (i >= oct) break;
      s += snoise(p) * a;
      p *= 2.03;
      a *= 0.5;
    }
    return s;
  }

  // Ridged noise: zero crossings become filaments. Dust lanes are filamentary,
  // not blobby, and this is the cheapest honest way to say so.
  float ridge(vec3 p, int oct) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 5; i++) {
      if (i >= oct) break;
      s += (1.0 - abs(snoise(p))) * a;
      p *= 2.11;
      a *= 0.5;
    }
    return s;
  }

  void main() {
    // ---- into galactic coordinates
    vec3 g = normalize(uGal * normalize(vDir));
    float sb = clamp(g.z, -1.0, 1.0);
    float b = asin(sb);                 // galactic latitude, radians
    float l = atan(g.y, g.x);           // galactic longitude, radians (-pi..pi)
    float absB = abs(b);
    // 0 at the centre, 1 at the anticentre
    float fromCentre = abs(l) / 3.14159265;

    // ---- the disc. Thin looking inward, flaring outward, with a gentle warp
    // so the plane is not a mathematically straight line across the sky.
    float warp = 0.030 * sin(l + 0.6) + 0.016 * sin(2.0 * l - 1.1);
    float bb = b - warp;
    float scaleH = mix(0.055, 0.125, fromCentre);   // radians
    float disc = exp(-abs(bb) / scaleH);

    // brightness falls off away from the centre: we are 8 kpc out, so the
    // inner galaxy is behind far more stars than the outer galaxy is
    float lon = mix(1.0, 0.30, smoothstep(0.0, 1.0, fromCentre));

    // ---- the bulge
    float bulge = exp(-(l * l) / 0.16 - (bb * bb) / 0.045);

    // ---- arm tangents: lines of sight that run down an arm pile up light
    float arms = 0.0;
    arms += 0.55 * exp(-pow((l - 0.55) / 0.16, 2.0));   // Scutum / Sagittarius
    arms += 0.40 * exp(-pow((l + 0.50) / 0.18, 2.0));   // Carina
    arms += 0.34 * exp(-pow((l - 1.30) / 0.22, 2.0));   // Cygnus
    arms += 0.22 * exp(-pow((l + 1.25) / 0.24, 2.0));   // Vela
    arms *= exp(-abs(bb) / (scaleH * 1.3));

    // ---- star clouds: large-scale clumping along the band
    float cloud = fbm(g * 3.4 + vec3(0.0, 0.0, 1.7), 4) * 0.5 + 0.5;
    float fine = fbm(g * 11.0, 4) * 0.5 + 0.5;

    float surface = (disc * lon * (0.55 + 0.85 * cloud) + bulge * 1.45 + arms) * (0.72 + 0.56 * fine);
    surface *= 0.33;

    // ---- dust. Filaments that live in the plane, thickest toward the centre,
    // and they *subtract*: the Great Rift is the absence of light, not a grey
    // smear painted over it.
    float dustBand = exp(-abs(bb) / (scaleH * 0.62));
    float lanes = ridge(g * 5.5 + vec3(3.1, 0.0, 0.0), 4);
    lanes = pow(clamp(lanes - 0.38, 0.0, 1.0) * 1.9, 1.25);
    float fineLane = pow(clamp(ridge(g * 15.0, 3) - 0.55, 0.0, 1.0) * 2.0, 1.2);
    float tau = (lanes * 3.1 + fineLane * 1.2) * dustBand * mix(1.6, 0.6, fromCentre);
    float extinction = exp(-tau);

    // ---- colour. The disc is a mix of old yellow and young blue populations;
    // the bulge is old and warm. Reddening then follows the dust column, which
    // is why the obscured stretches run amber rather than simply dark.
    vec3 young = vec3(0.68, 0.78, 1.00);
    vec3 old   = vec3(1.00, 0.90, 0.72);
    vec3 col = mix(young, old, clamp(0.35 + 0.5 * (1.0 - fromCentre) + 0.35 * bulge, 0.0, 1.0));
    vec3 reddened = vec3(col.r, col.g * exp(-tau * 0.30), col.b * exp(-tau * 0.75));
    col = mix(col, reddened, 0.9);

    float bright = surface * extinction;
    // a faint diffuse floor so the plane never cuts to pure black at its edges
    bright += disc * 0.022 * lon;

    // Additive blending already scales by alpha, so brightness belongs in the
    // colour and the alpha stays at 1 - folding it into both was squaring the
    // term and left the band a grey smudge.
    gl_FragColor = vec4(col * clamp(bright, 0.0, 1.1) * uIntensity, 1.0);
  }
`;

/**
 * Display shader.
 *
 * The band never changes, so the fifteen-octave evaluation above is baked once
 * into a cubemap and this is what runs per frame: one texture fetch plus a
 * single octave of fine grain, added only where there is light to modulate.
 * That keeps the band crisp when a cockpit window magnifies a patch of sky
 * without paying for the whole model every frame - measured, the full shader
 * was halving the frame rate all on its own.
 *
 * A cubemap rather than an equirectangular map on purpose: sampled by
 * direction, it has no seam to line up and no pinch at the poles.
 */
const DISPLAY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform samplerCube uSky;
  uniform float uIntensity;
  ${SNOISE_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    vec3 c = textureCube(uSky, d).rgb;
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    float n = snoise(d * 30.0) * 0.5 + 0.5;
    c *= 0.82 + 0.36 * n * smoothstep(0.015, 0.22, lum);
    gl_FragColor = vec4(c * uIntensity, 1.0);
  }
`;

export interface GalaxyOptions {
  radius: number;
  /** Fewer segments on weak hardware; the shader does the detail anyway. */
  segments?: number;
  intensity?: number;
}

/**
 * The galactic band as a back-facing sphere the camera sits inside.
 *
 * Starts out running the full model directly. Call `bake` once a renderer
 * exists and it swaps itself for the cheap sampler; until then it still draws
 * correctly, just expensively, so there is no frame where the sky is missing.
 */
export class MilkyWay {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private target: THREE.WebGLCubeRenderTarget | null = null;
  private baked = false;
  private intensity: number;

  constructor(opts: GalaxyOptions) {
    const seg = opts.segments ?? 64;
    this.intensity = opts.intensity ?? 1;
    this.material = new THREE.ShaderMaterial({
      vertexShader: GALAXY_VERT,
      fragmentShader: GALAXY_FRAG,
      uniforms: {
        uGal: { value: sceneToGalacticMatrix() },
        uIntensity: { value: this.intensity },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      // depthTest stays ON: the sphere sits behind everything in scene units,
      // and the test is what stops the additive band bleeding over planets
      // (renderOrder alone cannot - opaque meshes always draw first).
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(opts.radius, seg, Math.round(seg * 0.6)),
      this.material,
    );
    this.mesh.frustumCulled = false;
  }

  /**
   * Render the model into a cubemap once and switch to sampling it.
   *
   * 512 per face is ample for something this diffuse, and it keeps the one-off
   * cost to roughly a frame and a half even on a software renderer - the whole
   * point is to not pay it sixty times a second.
   */
  bake(renderer: THREE.WebGLRenderer, size = 512): void {
    if (this.baked) return;
    this.baked = true;

    const scene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 64, 40);
    const shell = new THREE.Mesh(geo, this.material.clone());
    (shell.material as THREE.ShaderMaterial).blending = THREE.NormalBlending;
    (shell.material as THREE.ShaderMaterial).transparent = false;
    scene.add(shell);

    this.target = new THREE.WebGLCubeRenderTarget(size);
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    const cam = new THREE.CubeCamera(0.5, 40, this.target);
    const prevTarget = renderer.getRenderTarget();
    cam.update(renderer, scene);
    renderer.setRenderTarget(prevTarget);

    geo.dispose();
    (shell.material as THREE.Material).dispose();

    const display = new THREE.ShaderMaterial({
      vertexShader: GALAXY_VERT,
      fragmentShader: DISPLAY_FRAG,
      uniforms: {
        uSky: { value: this.target.texture },
        uIntensity: { value: this.intensity },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      // depthTest stays ON - see the note on the pre-bake material
      blending: THREE.AdditiveBlending,
    });
    this.mesh.material = display;
    this.material.dispose();
    this.material = display;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.target?.dispose();
  }
}

/**
 * Relative stellar surface density at a galactic direction, 0..1.
 *
 * The background star field is scattered with this, so the crowding toward the
 * plane and toward the centre is the same law the band itself is drawn from -
 * the stars thin out as you look away from the Milky Way because that is what
 * stars do, not because a constant was tuned until it looked right.
 */
export function galacticStarDensity(gx: number, gy: number, gz: number): number {
  const b = Math.asin(THREE.MathUtils.clamp(gz, -1, 1));
  const l = Math.atan2(gy, gx);
  const fromCentre = Math.abs(l) / Math.PI;
  const scaleH = THREE.MathUtils.lerp(0.075, 0.16, fromCentre);
  const disc = Math.exp(-Math.abs(b) / scaleH);
  const lon = THREE.MathUtils.lerp(1, 0.42, fromCentre);
  const bulge = Math.exp(-(l * l) / 0.22 - (b * b) / 0.06);
  return THREE.MathUtils.clamp(disc * lon + bulge * 0.8, 0, 1);
}
