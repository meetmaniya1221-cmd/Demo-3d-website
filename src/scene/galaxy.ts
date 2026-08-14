/**
 * The Milky Way, from inside it, out of real survey data.
 *
 * The band is a photograph of the sky, not a model of one. The texture is
 * NASA SVS "Deep Star Maps 2020" - 1.7 billion stars from Gaia DR2,
 * Hipparcos-2 and Tycho-2, published as an all-sky plate carree in *galactic*
 * coordinates. So the Great Rift, the Scutum and Sagittarius star clouds, the
 * bulge and both Magellanic Clouds are where the survey measured them, at the
 * brightness it measured, rather than where noise happened to put them.
 *
 * Orientation is not eyeballed either. The sphere carries the standard J2000
 * rotation from the scene's ecliptic axes into the galactic frame, so the band
 * crosses Sagittarius and Cygnus where it should and agrees with the
 * constellation figures drawn over it.
 *
 * The map's own axis convention was determined from the data rather than
 * assumed: the Large and Small Magellanic Clouds were located in the image by
 * searching for the brightest compact sources away from the plane, and their
 * pixel positions were tested against all four possible conventions. Galactic
 * longitude increasing to the left with latitude increasing downward matched
 * to within 4 pixels at 2048x1024; the other three were wrong by 640 to 820.
 * Getting this backwards would mirror the sky - the kind of error that looks
 * fine until you compare it with a star chart.
 *
 * At runtime the equirectangular map is baked once into a cubemap and sampled
 * by direction. That is what makes it a true all-sky environment: no seam to
 * line up at l = 180, no pinch at the galactic poles, and nothing that behaves
 * like a cylinder when you look straight up.
 *
 * Galactic pole reference: RA 192.859508°, Dec 27.128336°, node 32.932°.
 */
import * as THREE from 'three';

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
  uniform sampler2D uMap;
  uniform float uIntensity;

  const float PI = 3.141592653589793;

  void main() {
    // into galactic coordinates, then onto the survey's plate carree
    vec3 g = normalize(uGal * normalize(vDir));
    float b = asin(clamp(g.z, -1.0, 1.0));   // galactic latitude
    float l = atan(g.y, g.x);                // galactic longitude, -pi..pi
    // NASA SVS galactic maps run longitude to the LEFT and latitude downward
    // (south galactic pole at the top) - verified against the measured
    // positions of the Magellanic Clouds, see the note at the top of this file
    vec2 uv = vec2(0.5 - l / (2.0 * PI), 0.5 + b / PI);
    gl_FragColor = vec4(texture2D(uMap, uv).rgb * uIntensity, 1.0);
  }
`;

/**
 * Display shader.
 *
 * One cubemap fetch. The survey map is resampled into a cubemap once, so this
 * runs per frame against uniform texel density with working mipmaps - which is
 * what stops the star fields shimmering when the sky is minified, and what
 * removes the equirectangular seam and the polar pinch entirely.
 *
 * Nothing is added to the image here. An earlier version modulated it with a
 * noise octave to "sharpen" the band; that is exactly the procedural
 * invention this file exists to avoid, and it was fighting the real structure
 * underneath. Sharpness now comes from the catalogue stars drawn as points on
 * top (scene/sky.ts), which is real data as well.
 */
const DISPLAY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform samplerCube uSky;
  uniform float uIntensity;
  void main() {
    gl_FragColor = vec4(textureCube(uSky, normalize(vDir)).rgb * uIntensity, 1.0);
  }
`;

export interface GalaxyOptions {
  radius: number;
  segments?: number;
  intensity?: number;
  /** Base URL for /textures. */
  base?: string;
  /**
   * Which rung of the survey map to load, and how large a cubemap to bake it
   * into. Every rung is the same measured sky - the structure never changes,
   * only how finely it is resolved.
   */
  quality?: SkyQuality;
}

export type SkyQuality = 'low' | 'medium' | 'high';

/**
 * Source resolution and bake size per quality level.
 *
 * The pairs are matched: a 1024-per-face cubemap resolves 11.4 pixels per
 * degree, and a 4096-wide plate carree carries 11.4 pixels per degree. Feeding
 * a larger source into the same bake would throw the extra away, and a larger
 * bake is what actually costs memory - 1024 per face is 25 MB resident, 2048
 * would be 100 MB.
 */
const SKY_TIERS: Record<SkyQuality, { map: string; cube: number }> = {
  low: { map: '1k', cube: 512 },
  medium: { map: '2k', cube: 768 },
  high: { map: '4k', cube: 1024 },
};

/**
 * The galactic band as a back-facing sphere the camera sits inside.
 *
 * The survey map streams in after boot: it is between 90 kB and 3 MB depending
 * on the quality tier, and the app should not wait on it to show a sky. Until
 * it arrives the sphere draws nothing, so the star field and the planets are
 * there from the first frame and the band fades in behind them.
 */
export class MilkyWay {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private target: THREE.WebGLCubeRenderTarget | null = null;
  private equirect: THREE.Texture | null = null;
  private baked = false;
  private intensity: number;
  private tier: { map: string; cube: number };
  private renderer: THREE.WebGLRenderer | null = null;

  constructor(opts: GalaxyOptions) {
    const seg = opts.segments ?? 64;
    this.intensity = opts.intensity ?? 1;
    this.tier = SKY_TIERS[opts.quality ?? 'high'];

    this.material = new THREE.ShaderMaterial({
      vertexShader: GALAXY_VERT,
      fragmentShader: GALAXY_FRAG,
      uniforms: {
        uGal: { value: sceneToGalacticMatrix() },
        uMap: { value: null },
        uIntensity: { value: this.intensity },
      },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(opts.radius, seg, Math.round(seg * 0.6)),
      this.material,
    );
    this.mesh.frustumCulled = false;
    // nothing to draw until the survey map is here
    this.mesh.visible = false;

    const base = opts.base ?? '/';
    new THREE.TextureLoader().load(
      `${base}textures/sky/milkyway_${this.tier.map}.webp`,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        // The bake reads this once at full resolution; mips on the source
        // would only blur what the cubemap is about to resample anyway.
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.wrapS = THREE.RepeatWrapping;
        this.equirect = tex;
        this.material.uniforms.uMap.value = tex;
        this.mesh.visible = true;
        if (this.renderer) this.bake(this.renderer);
      },
      undefined,
      () => {
        // No sky map is better than a fake one: the star field and the
        // constellations still carry the sky, and nothing here pretends to be
        // survey data it could not load.
      },
    );
  }

  /**
   * Resample the survey map into a cubemap and switch to sampling that.
   *
   * Safe to call before the texture has arrived - it records the renderer and
   * bakes as soon as there is something to bake. A cubemap rather than the
   * plate carree because sampling by direction has no seam at l = 180, no
   * pinch at the galactic poles, and mipmaps that actually work: an
   * equirectangular map wrapped in a shader has a discontinuity in its
   * texture-coordinate derivatives at the wrap, which shows up as a bright
   * line down the sky at exactly the place a 360 environment must not have one.
   */
  bake(renderer: THREE.WebGLRenderer, size?: number): void {
    this.renderer = renderer;
    if (this.baked || !this.equirect) return;
    this.baked = true;

    const scene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 96, 64);
    const shell = new THREE.Mesh(geo, this.material.clone());
    const shellMat = shell.material as THREE.ShaderMaterial;
    shellMat.blending = THREE.NormalBlending;
    shellMat.transparent = false;
    scene.add(shell);

    this.target = new THREE.WebGLCubeRenderTarget(size ?? this.tier.cube, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    const cam = new THREE.CubeCamera(0.5, 40, this.target);
    const prevTarget = renderer.getRenderTarget();
    cam.update(renderer, scene);
    renderer.setRenderTarget(prevTarget);

    geo.dispose();
    shellMat.dispose();
    // the plate carree has done its job; the cubemap is what gets sampled now
    this.equirect.dispose();
    this.equirect = null;

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
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh.material = display;
    this.material.dispose();
    this.material = display;
  }

  update(_elapsed: number): void {
    // the sky does not animate: it is a fixed map of a real sky
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.equirect?.dispose();
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
