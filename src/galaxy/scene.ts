/**
 * The Milky Way as a place: every rendered layer of the galaxy-mode scene.
 *
 * LOD philosophy (nothing here draws "all the stars" - the galaxy has a
 * few hundred billion and the GPU gets ~350 thousand):
 *   LOD far   - an analytic disk sheet + bulge glow: the surface-brightness
 *               law evaluated per fragment, which is what a camera outside
 *               the galaxy would actually integrate along each ray
 *   LOD mid   - ~330k statistically sampled stars in additive point clouds
 *               (disk, young arms, bar/bulge, centre cusp, halo, globular
 *               clusters, satellites), one draw call per population
 *   LOD near  - chunk-streamed individual stars around the camera with
 *               stable seeded identities (chunks.ts)
 *   LOD warp  - streak field when individual stars stop being resolvable
 *
 * Every population is sampled from the same density model (model.ts), so
 * zooming from outside the galaxy down to a single procedural star crosses
 * representations of one consistent object.
 *
 * Precision: all galaxy-wide clouds store absolute galactocentric float32
 * vertices and ride in a root group repositioned to -camera each frame.
 * That leaves a worst-case whole-cloud offset of ~0.004 ly - invisible for
 * far-field light - while everything that must be *exact* near the camera
 * (chunk stars, S stars, markers) is positioned camera-relative in double
 * precision individually.
 */
import * as THREE from 'three';
import { mulberry32, ValueNoise } from '../scene/noise';
import {
  ARMS,
  SPUR,
  armTheta,
  buildLandmarks,
  densityAt,
  drawClass,
  STAR_CLASSES,
  type GalaxyParams,
  type Landmark,
} from './model';
import { ChunkField, WarpStreaks } from './chunks';
import { AccretionDisk, SStarCluster, FlareGenerator } from './sgra';
import {
  BAR_ANGLE_DEG,
  DISK_SCALE_LENGTH_LY,
  SUN_POS,
  Vec3d,
  galToScene,
} from './units';

// -------------------------------------------------------------- survey sky --

const SURVEY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SURVEY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  uniform sampler2D uMap;
  uniform float uFade;
  const float PI = 3.141592653589793;
  void main() {
    // galaxy-scene axes ARE the galactic frame: gal = (x, -z, y)
    vec3 g = normalize(vec3(vDir.x, -vDir.z, vDir.y));
    float b = asin(clamp(g.z, -1.0, 1.0));
    float l = atan(g.y, g.x);
    // NASA SVS maps: longitude to the LEFT, latitude downward (verified
    // against the Magellanic Clouds - see scene/galaxy.ts)
    vec2 uv = vec2(0.5 - l / (2.0 * PI), 0.5 + b / PI);
    gl_FragColor = vec4(texture2D(uMap, uv).rgb * uFade, 1.0);
  }
`;

/**
 * The real sky, while the ship is where the sky was measured from.
 *
 * Within a few hundred light-years of Sol the view of the galaxy IS the
 * NASA SVS "Deep Star Maps 2020" all-sky survey (Gaia DR2 / Hipparcos-2 /
 * Tycho-2) - the Great Rift, the Scutum and Sagittarius star clouds and
 * the bulge exactly where 1.7 billion measured stars put them. The map is
 * only valid from the solar neighbourhood, so it fades over the first few
 * thousand light-years of travel and the procedural model (whose job is to
 * be consistent with it) takes over. This is the difference between "a
 * galaxy texture" and "the sky, from here".
 */
class SurveySky {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private texture: THREE.Texture | null = null;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: SURVEY_VERT,
      fragmentShader: SURVEY_FRAG,
      uniforms: { uMap: { value: null }, uFade: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    // depth is neither written nor tested and the sphere is drawn first, so
    // its radius only needs to be "around the camera" - NOT large. At large
    // radii the projected depth sits within a float32 ulp of the far plane
    // and triangles get pseudo-randomly clipped into shards. 20k ly keeps
    // ~30 ulps of margin at any far plane this mode uses.
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(20_000, 64, 40), this.material);
    this.mesh.renderOrder = -30;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    new THREE.TextureLoader().load(
      `${import.meta.env.BASE_URL}textures/sky/milkyway_2k.webp`,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.wrapS = THREE.RepeatWrapping;
        this.texture = tex;
        this.material.uniforms.uMap.value = tex;
      },
      undefined,
      () => {
        // the procedural model still carries the sky if the map never loads
      },
    );
  }

  setFade(f: number): void {
    this.material.uniforms.uFade.value = f;
    this.mesh.visible = f > 0.005 && this.texture !== null;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
  }
}

// ------------------------------------------------------------ point shader --

const CLOUD_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uPr;
  uniform float uGain;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(length(mv.xyz), 1.0);
    // gentle attenuation: from outside the galaxy points read as density,
    // from inside nearby cloud stars swell a little. The divisor is capped
    // so being INSIDE a dense population (bulge, nuclear cusp) does not
    // inflate tens of thousands of points into a white wall
    float size = aSize * (0.55 + 1400.0 / max(dist, 2600.0));
    float clamped = clamp(size, 0.75, 3.6);
    float k = clamp(size / clamped, 0.0, 1.0);
    // the chunk streamer owns the true near field - statistical cloud
    // points fade out as they get individually close
    float nearFade = smoothstep(30.0, 300.0, dist);
    vColor = aColor * (0.30 + 0.70 * k) * uGain * nearFade;
    gl_PointSize = clamped * uPr;
    gl_Position = projectionMatrix * mv;
  }
`;

const CLOUD_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float a = smoothstep(1.0, 0.2, length(p) * 2.0);
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

function cloudMaterial(gain: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    uniforms: {
      uPr: { value: Math.min(2, window.devicePixelRatio || 1) },
      uGain: { value: gain },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

interface CloudBuild {
  pos: number[];
  size: number[];
  color: number[];
}

function pushStar(
  b: CloudBuild,
  gx: number,
  gy: number,
  gz: number,
  size: number,
  r: number,
  g: number,
  bl: number,
): void {
  // galactic → scene axis swap, inlined for the hot path
  b.pos.push(gx, gz, -gy);
  b.size.push(size);
  b.color.push(r, g, bl);
}

function buildPoints(b: CloudBuild, mat: THREE.ShaderMaterial, order: number): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(b.size), 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(b.color), 3));
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = order;
  return points;
}

// ------------------------------------------------------------ sprite maker --

function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  paint(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial glow. */
function glowTexture(size = 128, inner = 'rgba(255,244,230,1)', outer = 'rgba(255,180,120,0)'): THREE.Texture {
  return canvasTexture(size, (ctx) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.25, inner.replace('1)', '0.55)'));
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  });
}

/** Blobby fbm texture for nebulae and dust, alpha in the shape. */
function blobTexture(seed: number, hue: [number, number, number], size = 128): THREE.Texture {
  const noise = new ValueNoise(seed);
  return canvasTexture(size, (ctx) => {
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const rad = Math.hypot(dx, dy) * 2;
        const n = noise.fbm(nx * 5, ny * 5, 4);
        const shape = Math.max(0, 1 - rad * (1.15 + n * 0.7));
        const a = Math.pow(shape, 1.6) * (0.35 + 0.65 * n);
        const i = (y * size + x) * 4;
        img.data[i] = hue[0];
        img.data[i + 1] = hue[1];
        img.data[i + 2] = hue[2];
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// --------------------------------------------------------- disk sheet GLSL --

/** Same sign convention as model.ts: near bar end toward l ≈ +27°. */
const BAR_ANGLE_RAD = (-BAR_ANGLE_DEG * Math.PI) / 180;

/** Arm constants injected into the sheet shader: phase, root, tan(pitch), strength. */
function armGlslArray(): string {
  const all = [...ARMS, SPUR];
  return all
    .map(
      (a) =>
        `vec4(${a.phase.toFixed(4)}, ${a.rootLy.toFixed(1)}, ${Math.tan((a.pitchDeg * Math.PI) / 180).toFixed(5)}, ${a.strength.toFixed(2)})`,
    )
    .join(', ');
}

const SHEET_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vGal; // galactocentric (gx, gy) in ly
  uniform float uFade;
  uniform float uDust;

  const vec4 ARMS_A[5] = vec4[5](${'${ARMS_GLSL}'});
  const float ARM_END[5] = float[5](50000.0, 52000.0, 46000.0, 55000.0, 30000.0);

  // radial distance-to-spiral (see model.ts armBoostAt for the derivation)
  float armBoost(float r, float theta, out float youth) {
    float boost = 0.0;
    youth = 0.0;
    for (int i = 0; i < 5; i++) {
      vec4 a = ARMS_A[i];
      float width = i == 4 ? 1430.0 : 2600.0;
      float cosp = inversesqrt(1.0 + a.z * a.z);
      for (int k = -1; k <= 2; k++) {
        float rk = a.y * exp((theta - a.x + 6.28318530 * float(k)) * a.z);
        if (rk < a.y * 0.8 || rk > ARM_END[i]) continue;
        float d = abs(r - rk) * cosp;
        if (d > width * 4.0) continue;
        float g = exp(-d * d / (2.0 * width * width));
        float taper = min(1.0, (rk - a.y * 0.8) / (a.y * 0.35) + 0.15)
                    * min(1.0, (ARM_END[i] - rk) / 6000.0 + 0.2);
        float c = a.w * g * max(0.0, taper);
        boost += c;
        youth += c * (i >= 2 ? 0.72 : 0.5);
      }
    }
    youth = boost > 1e-5 ? youth / boost : 0.0;
    return boost;
  }

  // cheap value noise for dust filaments (2D, tiled by hashing)
  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
      mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x),
      u.y
    );
  }
  float fbm2(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      s += a * vnoise(p);
      p *= 2.13;
      a *= 0.5;
    }
    return s;
  }

  void main() {
    float r = length(vGal);
    // atan(0,0) at the exact centre is NaN, and one NaN pixel smears grey
    // blocks through every bloom mip - carve out a 2-ly hole instead
    if (r > 60000.0 || r < 2.0) discard;
    float theta = atan(vGal.y, vGal.x);

    // exponential disk + edge truncation
    float disk = exp(-r / ${DISK_SCALE_LENGTH_LY.toFixed(1)});
    disk *= r > 52000.0 ? exp(-(r - 52000.0) / 4000.0) : 1.0;

    float youth;
    float arms = armBoost(r, theta, youth);

    // bar glow (the 3D bulge sprite handles the vertical extent)
    float bc = cos(${BAR_ANGLE_RAD.toFixed(5)});
    float bs = sin(${BAR_ANGLE_RAD.toFixed(5)});
    float bx = vGal.x * bc + vGal.y * bs;
    float by = -vGal.x * bs + vGal.y * bc;
    float barS = pow(abs(bx) / 16000.0, 2.2) + pow(abs(by) / 5800.0, 2.2);
    float bar = 2.4 * exp(-pow(barS, 0.4545) * 2.4);

    float mottling = 0.75 + 0.5 * fbm2(vGal / 4200.0);
    float surface = (disk * (1.0 + 2.2 * arms) * mottling + bar * 0.7) * 0.022;

    // dust: filamentary extinction hugging the arms' inner edges
    float lanes = fbm2(vGal / 2100.0 + 7.31);
    lanes = pow(clamp(lanes - 0.32, 0.0, 1.0) * 1.9, 1.3);
    float tau = uDust * (arms * 0.9 + disk * 1.7) * lanes * 2.6;
    float ext = exp(-tau);

    // colour: warm old light inside, young blue in the arms, reddened dust
    vec3 old = vec3(1.0, 0.87, 0.70);
    vec3 young = vec3(0.66, 0.76, 1.0);
    vec3 col = mix(old, young, clamp(youth * arms * 1.2 - r / 200000.0 + 0.18, 0.0, 0.75));
    col = vec3(col.r, col.g * exp(-tau * 0.35), col.b * exp(-tau * 0.8));

    gl_FragColor = vec4(col * surface * ext * uFade, 1.0);
  }
`.replace('${ARMS_GLSL}', armGlslArray());

const SHEET_VERT = /* glsl */ `
  varying vec2 vGal;
  void main() {
    // plane lies in scene XZ; scene z = -gal y
    vGal = vec2(position.x, -position.z);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ------------------------------------------------------------------ scene --

export class GalaxyScene {
  readonly scene = new THREE.Scene();
  readonly landmarks: Landmark[];
  readonly chunks: ChunkField;
  readonly sStars = new SStarCluster();
  readonly flares: FlareGenerator;
  /** Root that holds galaxy-wide clouds; repositioned to -camera each frame. */
  private cloudRoot = new THREE.Group();
  private sheet: THREE.Mesh;
  private sheetMat: THREE.ShaderMaterial;
  private bulgeGlow: THREE.Sprite;
  private coreGlow: THREE.Sprite;
  private sgraGroup = new THREE.Group();
  private sgraGlow: THREE.Sprite;
  private sgraMat: THREE.SpriteMaterial;
  private accretion = new AccretionDisk();
  private survey = new SurveySky();
  private starMats: THREE.ShaderMaterial[] = [];
  private baseGains: number[] = [];
  private time = 0;
  private solGroup = new THREE.Group();
  private solMat: THREE.SpriteMaterial;
  private warp = new WarpStreaks();
  private camHolder = new THREE.Group();
  private materials: THREE.ShaderMaterial[] = [];
  private disposables: Array<{ dispose(): void }> = [];
  private tmp = { x: 0, y: 0, z: 0 };

  constructor(private params: GalaxyParams) {
    this.scene.background = new THREE.Color(0x010208);
    this.landmarks = buildLandmarks();
    this.flares = new FlareGenerator(params.seed);
    const rnd = mulberry32(params.seed);

    // ---- LOD mid: the point-cloud populations --------------------------
    const diskMat = cloudMaterial(1);
    const youngMat = cloudMaterial(1.1);
    const bulgeMat = cloudMaterial(1);
    const haloMat = cloudMaterial(0.6);
    this.materials.push(diskMat, youngMat, bulgeMat, haloMat);
    // the survey-sky blend dims these while the real map carries the view
    this.starMats = [diskMat, youngMat, bulgeMat, haloMat];
    this.baseGains = this.starMats.map((m) => m.uniforms.uGain.value as number);

    this.cloudRoot.add(buildPoints(this.sampleDisk(rnd), diskMat, -14));
    this.cloudRoot.add(buildPoints(this.sampleYoungArms(rnd), youngMat, -11));
    this.cloudRoot.add(buildPoints(this.sampleBulgeBar(rnd), bulgeMat, -13));
    this.cloudRoot.add(buildPoints(this.sampleCentre(rnd), bulgeMat, -12));
    this.cloudRoot.add(buildPoints(this.sampleHaloAndGlobulars(rnd), haloMat, -16));
    this.cloudRoot.add(buildPoints(this.sampleSatellites(rnd), haloMat, -16));
    this.cloudRoot.add(this.buildDust(rnd));
    for (const neb of this.buildNebulae(rnd)) this.cloudRoot.add(neb);
    this.cloudRoot.add(this.buildDistantGalaxies(rnd));
    this.scene.add(this.cloudRoot);

    // ---- LOD far: analytic sheet + bulge glow --------------------------
    this.sheetMat = new THREE.ShaderMaterial({
      vertexShader: SHEET_VERT,
      fragmentShader: SHEET_FRAG,
      uniforms: { uFade: { value: 1 }, uDust: { value: params.dustDensity } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.sheet = new THREE.Mesh(new THREE.CircleGeometry(60_000, 96), this.sheetMat);
    this.sheet.rotation.x = -Math.PI / 2;
    this.sheet.renderOrder = -18;
    this.sheet.frustumCulled = false;
    this.cloudRoot.add(this.sheet);

    const bulgeTex = glowTexture(128, 'rgba(255,225,185,1)', 'rgba(255,190,130,0)');
    this.disposables.push(bulgeTex);
    const bulgeSpriteMat = new THREE.SpriteMaterial({
      map: bulgeTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.5,
    });
    this.bulgeGlow = new THREE.Sprite(bulgeSpriteMat);
    this.bulgeGlow.scale.set(15_000, 9_500, 1);
    this.bulgeGlow.renderOrder = -17;
    this.cloudRoot.add(this.bulgeGlow);

    this.coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: bulgeTex,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.75,
      }),
    );
    this.coreGlow.scale.set(2_600, 2_100, 1);
    this.coreGlow.renderOrder = -17;
    this.cloudRoot.add(this.coreGlow);

    // ---- Sagittarius A* beacon + S-star cluster ------------------------
    // The RIAF glow: honest about being faint - Sgr A* radiates at ~1e-9 of
    // its Eddington luminosity; this is a marker of hot gas, not a quasar.
    const sgraTex = glowTexture(128, 'rgba(255,214,170,1)', 'rgba(255,120,60,0)');
    this.disposables.push(sgraTex);
    this.sgraMat = new THREE.SpriteMaterial({
      map: sgraTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.sgraGlow = new THREE.Sprite(this.sgraMat);
    this.sgraGlow.renderOrder = -2;
    this.sgraGroup.add(this.sgraGlow);
    this.sgraGroup.add(this.sStars.group);
    this.sgraGroup.add(this.accretion.group);
    this.scene.add(this.sgraGroup);
    this.scene.add(this.survey.mesh);

    // ---- Sol marker ----------------------------------------------------
    const solTex = glowTexture(96, 'rgba(255,246,225,1)', 'rgba(255,220,150,0)');
    this.disposables.push(solTex);
    this.solMat = new THREE.SpriteMaterial({
      map: solTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const solSprite = new THREE.Sprite(this.solMat);
    solSprite.renderOrder = -2;
    this.solGroup.add(solSprite);
    this.scene.add(this.solGroup);

    // ---- LOD near + warp ----------------------------------------------
    this.chunks = new ChunkField(params);
    this.scene.add(this.chunks.root);
    this.camHolder.add(this.warp.points);
    this.scene.add(this.camHolder);
  }

  // ------------------------------------------------------------ sampling --

  private sampleDisk(rnd: () => number): CloudBuild {
    const b: CloudBuild = { pos: [], size: [], color: [] };
    const target = Math.round(150_000 * this.params.density);
    let guard = 0;
    while (b.size.length < target && guard++ < target * 12) {
      // r·exp(-r/Rd) via the sum of two exponentials trick (gamma k=2)
      const r = -DISK_SCALE_LENGTH_LY * Math.log(Math.max(1e-9, rnd() * rnd()));
      if (r < 2600 || r > 58_000) continue;
      const theta = rnd() * 2 * Math.PI;
      // arm contrast: accept against the local (1 + 2·boost) law
      const boost = densityBoostCheap(r, theta, this.params);
      if (rnd() > (1 + 2.0 * boost) / 3.0) continue;
      const hz = 980 * (1 + Math.max(0, (r - 30_000) / 22_000) * 1.4);
      const z = -hz * Math.log(Math.max(1e-9, rnd())) * (rnd() < 0.5 ? -1 : 1) * 0.7;
      const cls = drawClass(rnd, STAR_CLASSES);
      const jitter = 0.9 + rnd() * 0.2;
      pushStar(
        b,
        r * Math.cos(theta),
        r * Math.sin(theta),
        z,
        0.8 + Math.pow(Math.min(cls.lum, 200) / 200, 0.4) * 2.4,
        cls.color[0] * jitter,
        cls.color[1] * jitter,
        cls.color[2],
      );
    }
    return b;
  }

  private sampleYoungArms(rnd: () => number): CloudBuild {
    const b: CloudBuild = { pos: [], size: [], color: [] };
    const all = [...ARMS, SPUR];
    const totalStrength = all.reduce((s, a) => s + a.strength * a.youth, 0);
    const target = Math.round(30_000 * this.params.density);
    for (let i = 0; i < target; i++) {
      // pick an arm weighted by how much young light it carries
      let pick = rnd() * totalStrength;
      let arm = all[0];
      for (const a of all) {
        pick -= a.strength * a.youth;
        if (pick <= 0) {
          arm = a;
          break;
        }
      }
      // radial position, biased inward like the disk light
      let r = 0;
      for (let t = 0; t < 20; t++) {
        r = arm.rootLy + rnd() * (arm.endLy - arm.rootLy);
        if (rnd() < Math.exp(-(r - arm.rootLy) / 14_000)) break;
      }
      const width = (arm === SPUR ? 0.5 : 1) * this.params.armWidthLy * 0.55;
      const dTheta = (gaussian(rnd) * width) / r;
      const theta = armTheta(arm, r) + dTheta;
      const z = gaussian(rnd) * 300;
      // OB associations clump: quantize a fraction onto cluster knots
      const clump = rnd() < 0.4;
      const kx = clump ? gaussian(rnd) * 60 : 0;
      const ky = clump ? gaussian(rnd) * 60 : 0;
      const blue = 0.72 + rnd() * 0.16;
      pushStar(
        b,
        r * Math.cos(theta) + kx,
        r * Math.sin(theta) + ky,
        z,
        1.1 + rnd() * 2.3,
        blue * 0.92,
        blue * 0.97,
        1.0,
      );
    }
    return b;
  }

  private sampleBulgeBar(rnd: () => number): CloudBuild {
    const b: CloudBuild = { pos: [], size: [], color: [] };
    const target = Math.round(70_000 * this.params.density * this.params.bulgeScale);
    const bc = Math.cos(BAR_ANGLE_RAD);
    const bs = Math.sin(BAR_ANGLE_RAD);
    for (let i = 0; i < target; i++) {
      let gx: number;
      let gy: number;
      let gz: number;
      if (rnd() < 0.55) {
        // bar: exponential along the major axis, gaussian across
        const bx = -Math.log(Math.max(1e-9, rnd())) * 6200 * (rnd() < 0.5 ? -1 : 1);
        if (Math.abs(bx) > 16_500) continue;
        const by = gaussian(rnd) * 2300;
        const bz = gaussian(rnd) * 1600;
        gx = bx * bc - by * bs;
        gy = bx * bs + by * bc;
        gz = bz;
      } else {
        // spheroidal bulge
        const r = 2600 * Math.pow(-Math.log(Math.max(1e-9, rnd())), 1 / 1.35);
        const dir = isotropic(rnd);
        gx = dir[0] * r;
        gy = dir[1] * r;
        gz = (dir[2] * r) / 1.9;
      }
      // old, metal-rich population: warm colours
      const warm = 0.86 + rnd() * 0.14;
      pushStar(b, gx, gy, gz, 0.8 + rnd() * 1.7, 1.0 * warm, 0.86 * warm, 0.62 + rnd() * 0.12);
    }
    return b;
  }

  private sampleCentre(rnd: () => number): CloudBuild {
    // the observed cusp: density climbing six orders of magnitude from the
    // solar neighbourhood into the nuclear star cluster
    const b: CloudBuild = { pos: [], size: [], color: [] };
    const target = Math.round(45_000 * this.params.density);
    for (let i = 0; i < target; i++) {
      // p(r) ∝ r^-1.9 · r² = r^0.1 in 3D → nearly uniform in radius shells;
      // push samples inward with a strong power for the visual cusp
      const r = 0.3 + 2400 * Math.pow(rnd(), 2.6);
      const dir = isotropic(rnd);
      const flat = r > 100 ? 1.6 : 1.1;
      const warm = 0.85 + rnd() * 0.15;
      pushStar(
        b,
        dir[0] * r,
        dir[1] * r,
        (dir[2] * r) / flat,
        0.75 + rnd() * 1.6,
        warm,
        0.88 * warm,
        0.68 * warm,
      );
    }
    return b;
  }

  private sampleHaloAndGlobulars(rnd: () => number): CloudBuild {
    const b: CloudBuild = { pos: [], size: [], color: [] };
    // smooth halo
    for (let i = 0; i < 14_000; i++) {
      const r = 4000 * Math.pow(1 - rnd() * 0.985, -1 / 1.9);
      if (r > 110_000) continue;
      const dir = isotropic(rnd);
      const warm = 0.75 + rnd() * 0.2;
      pushStar(b, dir[0] * r, dir[1] * r, dir[2] * r * 0.85, 0.7 + rnd(), warm, warm * 0.93, warm * 0.8);
    }
    // ~150 globular clusters (a handful with real published positions come
    // via landmarks; the rest are drawn from the halo distribution)
    const centres: Array<[number, number, number]> = [];
    for (const lm of this.landmarks) {
      if (lm.kind === 'cluster') centres.push([lm.pos.x, lm.pos.y, lm.pos.z]);
    }
    for (let i = centres.length; i < 150; i++) {
      const r = 3500 + 55_000 * Math.pow(rnd(), 1.9);
      const dir = isotropic(rnd);
      centres.push([dir[0] * r, dir[1] * r, dir[2] * r * 0.9]);
    }
    for (const [cx, cy, cz] of centres) {
      // kept diffuse on purpose: members packed into a couple of pixels
      // stack additively into a beacon that trips bloom and turns into a
      // glowing block - a soft knot reads as a cluster, a hot pixel reads
      // as an artifact
      const members = 40 + Math.floor(rnd() * 42);
      for (let i = 0; i < members; i++) {
        // Plummer-ish profile, core ~24 ly, capped so the u→1 tail cannot
        // fling members thousands of ly out of their own cluster
        const rr = Math.min(110, 24 / Math.sqrt(Math.pow(Math.max(rnd(), 1e-4), -2 / 3) - 1 + 1e-6));
        const dir = isotropic(rnd);
        const warm = 0.66 + rnd() * 0.16;
        pushStar(
          b,
          cx + dir[0] * rr,
          cy + dir[1] * rr,
          cz + dir[2] * rr,
          0.75 + rnd() * 0.9,
          warm,
          warm * 0.92,
          warm * 0.78,
        );
      }
    }
    return b;
  }

  private sampleSatellites(rnd: () => number): CloudBuild {
    const b: CloudBuild = { pos: [], size: [], color: [] };
    for (const lm of this.landmarks) {
      if (lm.kind !== 'galaxy') continue;
      const count = lm.id === 'lmc' ? 2600 : lm.id === 'smc' ? 1300 : 900;
      const scale = lm.radiusLy;
      for (let i = 0; i < count; i++) {
        const dir = isotropic(rnd);
        const r = scale * Math.pow(rnd(), 0.6);
        // the Sagittarius dwarf is being tidally stretched toward the MW plane
        const stretch = lm.id === 'sgr-dwarf' ? 2.6 : 1;
        const cool = 0.8 + rnd() * 0.2;
        pushStar(
          b,
          lm.pos.x + dir[0] * r * stretch,
          lm.pos.y + dir[1] * r,
          lm.pos.z + dir[2] * r * 0.5,
          0.7 + rnd() * 0.9,
          cool * 0.92,
          cool * 0.94,
          cool,
        );
      }
    }
    return b;
  }

  // ------------------------------------------------------- dust + nebulae --

  private buildDust(rnd: () => number): THREE.Points {
    // dark filaments hugging the midplane (dust scale height ~100 pc,
    // several times thinner than the stars) and tracing the arms' inner edges
    const b: CloudBuild = { pos: [], size: [], color: [] };
    const target = Math.round(7000 * this.params.dustDensity);
    const all = [...ARMS, SPUR];
    let guard = 0;
    while (b.size.length < target && guard++ < target * 10) {
      const arm = all[Math.floor(rnd() * all.length)];
      let r = arm.rootLy + rnd() * (arm.endLy - arm.rootLy);
      if (rnd() > Math.exp(-(r - arm.rootLy) / 16_000)) continue;
      // dust rides the concave (inner) edge of each arm
      const inner = -0.35 * this.params.armWidthLy;
      const off = inner + gaussian(rnd) * this.params.armWidthLy * 0.5;
      const theta = armTheta(arm, r) + off / r;
      const z = gaussian(rnd) * 330;
      pushStar(
        b,
        r * Math.cos(theta),
        r * Math.sin(theta),
        z,
        220 + rnd() * 520,
        0.045,
        0.032,
        0.028,
      );
    }
    const tex = blobTexture(9137, [14, 10, 8]);
    this.disposables.push(tex);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying float vFade;
        uniform float uPr;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(length(mv.xyz), 1.0);
          float px = aSize * 900.0 / dist;
          // inside a cloud a billboard stops making sense - fade it out.
          // And beyond ~30 kly the camera is looking AT the galaxy, not
          // through it: the analytic sheet's baked lanes carry the dust
          // there, and thousands of stacked dark sprites would smear a
          // brown wedge across the far view (fade by camera distance -
          // pixel size never gets small enough, these sprites are huge)
          vFade = (1.0 - smoothstep(120.0, 340.0, px))
                * (1.0 - smoothstep(26000.0, 42000.0, dist));
          gl_PointSize = min(px, 340.0) * uPr;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying float vFade;
        uniform sampler2D uTex;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          // NORMAL blending: dust darkens what is behind it
          gl_FragColor = vec4(vec3(0.020, 0.014, 0.011), t.a * 0.42 * vFade);
        }
      `,
      uniforms: { uTex: { value: tex }, uPr: { value: Math.min(2, window.devicePixelRatio || 1) } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    this.materials.push(mat);
    const points = buildPoints(b, mat, -8);
    return points;
  }

  private buildNebulae(rnd: () => number): THREE.Points[] {
    // H II regions: pink-red emission knots strung along the gas-rich arms,
    // plus the named star-forming landmarks at their published positions
    const variants: Array<[THREE.Texture, [number, number, number]]> = [
      [blobTexture(311, [255, 120, 130]), [1.0, 0.42, 0.45]],
      [blobTexture(512, [255, 150, 110]), [1.0, 0.55, 0.4]],
      [blobTexture(713, [120, 180, 255]), [0.5, 0.7, 1.0]],
    ];
    const builds: CloudBuild[] = variants.map(() => ({ pos: [], size: [], color: [] }));
    const all = [...ARMS, SPUR];
    const target = Math.round(650 * this.params.nebulaDensity);
    for (let i = 0; i < target; i++) {
      const arm = all[Math.floor(rnd() * all.length)];
      // gas-rich arms carry more H II regions - weight by youth
      if (rnd() > arm.youth) continue;
      let r = arm.rootLy + rnd() * (arm.endLy - arm.rootLy);
      if (rnd() > Math.exp(-(r - arm.rootLy) / 15_000)) continue;
      const theta = armTheta(arm, r) + (gaussian(rnd) * this.params.armWidthLy * 0.4) / r;
      const z = gaussian(rnd) * 240;
      const v = rnd() < 0.75 ? (rnd() < 0.6 ? 0 : 1) : 2;
      const c = variants[v][1];
      const bright = 0.5 + rnd() * 0.5;
      pushStar(
        builds[v],
        r * Math.cos(theta),
        r * Math.sin(theta),
        z,
        130 + rnd() * 320,
        c[0] * bright,
        c[1] * bright,
        c[2] * bright,
      );
    }
    for (const lm of this.landmarks) {
      if (lm.kind !== 'nebula') continue;
      pushStar(builds[0], lm.pos.x, lm.pos.y, lm.pos.z, 200, 1.0, 0.5, 0.5);
    }
    return builds.map((b, i) => {
      const tex = variants[i][0];
      this.disposables.push(tex);
      const mat = new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute float aSize;
          attribute vec3 aColor;
          varying vec3 vColor;
          varying float vFade;
          uniform float uPr;
          void main() {
            vColor = aColor;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            float dist = max(length(mv.xyz), 1.0);
            float px = aSize * 900.0 / dist;
            vFade = (1.0 - smoothstep(100.0, 300.0, px)) * smoothstep(1.0, 3.0, px);
            gl_PointSize = min(px, 300.0) * uPr;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec3 vColor;
          varying float vFade;
          uniform sampler2D uTex;
          void main() {
            vec4 t = texture2D(uTex, gl_PointCoord);
            gl_FragColor = vec4(vColor * t.a * 0.16 * vFade, 1.0);
          }
        `,
        uniforms: { uTex: { value: tex }, uPr: { value: Math.min(2, window.devicePixelRatio || 1) } },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      this.materials.push(mat);
      return buildPoints(b, mat, -10);
    });
  }

  private buildDistantGalaxies(rnd: () => number): THREE.Points {
    // decorative background field galaxies - far beyond the navigable
    // volume, present so intergalactic space has depth rather than data
    const b: CloudBuild = { pos: [], size: [], color: [] };
    for (let i = 0; i < 90; i++) {
      const dir = isotropic(rnd);
      // kept well inside the far plane: near the clip boundary, float32
      // depth rounding swallows points at random (same cliff as the sky
      // sphere) - and a backdrop's absolute distance is invisible anyway
      const r = 130_000 + rnd() * 60_000;
      const warm = rnd();
      pushStar(
        b,
        dir[0] * r,
        dir[1] * r,
        dir[2] * r,
        1.3 + rnd() * 2.4,
        0.75 + warm * 0.2,
        0.78 + warm * 0.12,
        0.85 - warm * 0.15,
      );
    }
    const mat = cloudMaterial(0.5);
    this.materials.push(mat);
    return buildPoints(b, mat, -20);
  }

  // ---------------------------------------------------------------- frame --

  /**
   * Reposition everything camera-relative and advance the dynamics.
   * `camPos` is the ship's galactocentric double-precision position.
   */
  update(
    camPos: Vec3d,
    camera: THREE.PerspectiveCamera,
    dt: number,
    simDays: number,
    speedLyPerSec: number,
  ): void {
    this.time += dt;

    // galaxy-wide clouds: one shared offset (float32 rounding here moves
    // the whole far field by ≤ ~0.004 ly - beneath notice)
    galToScene(-camPos.x, -camPos.y, -camPos.z, this.tmp);
    this.cloudRoot.position.set(this.tmp.x, this.tmp.y, this.tmp.z);

    // ---- the real sky, while we are where it was measured --------------
    // Near Sol the NASA SVS survey map IS the view; the procedural model
    // dims underneath it and takes over as the viewpoint genuinely leaves
    // the neighbourhood the survey was made from.
    const solDist = camPos.distanceTo(SUN_POS);
    const surveyWeight = 1 - THREE.MathUtils.smoothstep(solDist, 300, 3200);
    this.survey.setFade(surveyWeight);
    for (let i = 0; i < this.starMats.length; i++) {
      this.starMats[i].uniforms.uGain.value = this.baseGains[i] * (1 - surveyWeight * 0.78);
    }

    // the far-view sheet fades as the camera descends into the disk - the
    // point clouds ARE the galaxy from inside
    const rho = Math.hypot(camPos.x, camPos.y);
    const inPlane = 1 - THREE.MathUtils.smoothstep(Math.abs(camPos.z), 2600, 14_000);
    const inDisk = 1 - THREE.MathUtils.smoothstep(rho, 42_000, 78_000);
    const inside = Math.min(inPlane, inDisk);
    this.sheetMat.uniforms.uFade.value = (1 - inside * 0.92) * (1 - surveyWeight * 0.9);

    // the analytic glows describe the bulge from OUTSIDE; once the camera
    // is inside them the point populations carry the light
    const centreDist = camPos.length();
    (this.coreGlow.material as THREE.SpriteMaterial).opacity =
      0.5 * THREE.MathUtils.smoothstep(centreDist, 1_500, 6_000) * (1 - surveyWeight * 0.9);
    (this.bulgeGlow.material as THREE.SpriteMaterial).opacity =
      0.4 * THREE.MathUtils.smoothstep(centreDist, 5_000, 16_000) * (1 - surveyWeight * 0.9);

    // Sgr A* group: exact camera-relative placement
    galToScene(-camPos.x, -camPos.y, -camPos.z, this.tmp);
    this.sgraGroup.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
    const sgraDist = camPos.length();
    this.sStars.update(simDays, sgraDist);

    // beacon glow: min apparent size so the centre is findable from the
    // rim; physically scaled once you are close; flare-driven brightness
    const flare = this.flares.update(dt);
    const base = Math.max(sgraDist * 0.012, 0.02);
    const s = Math.min(base, 260);
    this.sgraGlow.scale.set(s, s, 1);
    // three representations, one object: far beacon glow → mid-range disk
    // mesh with its shadow silhouette → close-range geodesic march. Each
    // hands over as the next can put real pixels on screen.
    this.sgraMat.opacity =
      THREE.MathUtils.clamp(0.35 + Math.log10(flare.level + 1) * 0.5, 0, 1) *
      THREE.MathUtils.smoothstep(sgraDist, 0.0022, 0.006);
    this.accretion.update(sgraDist, this.time, flare.level, camera);

    // Sol marker
    galToScene(SUN_POS.x - camPos.x, SUN_POS.y - camPos.y, SUN_POS.z - camPos.z, this.tmp);
    this.solGroup.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
    const solScale = THREE.MathUtils.clamp(solDist * 0.02, 0.00002, 160);
    (this.solGroup.children[0] as THREE.Sprite).scale.set(solScale, solScale, 1);

    // near-field streaming + warp streaks
    this.chunks.update(camPos, speedLyPerSec);
    this.camHolder.position.copy(camera.position);
    this.camHolder.quaternion.copy(camera.quaternion);
    this.warp.update(dt, speedLyPerSec);
  }

  get flareState() {
    return this.flares.state;
  }

  /** How present the photoreal plate is, for ducking the march's emission. */
  get accretionFade(): number {
    return this.accretion.fade;
  }

  setPixelRatio(pr: number): void {
    for (const m of this.materials) {
      if (m.uniforms.uPr) m.uniforms.uPr.value = pr;
    }
    this.chunks.setPixelRatio(pr);
    this.warp.setPixelRatio(pr);
    this.sStars.setPixelRatio(pr);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Points || o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry?.dispose();
      }
    });
    for (const m of this.materials) m.dispose();
    for (const d of this.disposables) d.dispose();
    this.chunks.dispose();
    this.warp.dispose();
    this.sStars.dispose();
    this.accretion.dispose();
    this.survey.dispose();
    this.sheetMat.dispose();
    this.sgraMat.dispose();
    this.solMat.dispose();
  }
}

// ------------------------------------------------------------------ utils --

function gaussian(rnd: () => number): number {
  // Box-Muller, one branch is plenty here
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

function isotropic(rnd: () => number): [number, number, number] {
  const z = rnd() * 2 - 1;
  const t = rnd() * 2 * Math.PI;
  const s = Math.sqrt(Math.max(0, 1 - z * z));
  return [s * Math.cos(t), s * Math.sin(t), z];
}

/** Arm boost without the youth bookkeeping - the samplers' hot loop. */
function densityBoostCheap(r: number, theta: number, params: GalaxyParams): number {
  let boost = 0;
  const all = [...ARMS, SPUR];
  for (const arm of all) {
    const p = (arm.pitchDeg * Math.PI) / 180;
    const tanp = Math.tan(p);
    const cosp = Math.cos(p);
    const width = params.armWidthLy * (arm === SPUR ? 0.55 : 1);
    for (let k = -1; k <= 2; k++) {
      const rk = arm.rootLy * Math.exp((theta - arm.phase + 2 * Math.PI * k) * tanp);
      if (rk < arm.rootLy * 0.8 || rk > arm.endLy) continue;
      const d = Math.abs(r - rk) * cosp;
      if (d > width * 4) continue;
      boost += arm.strength * Math.exp(-(d * d) / (2 * width * width));
    }
  }
  return boost;
}

// re-export for the mode's convenience
export { densityAt };
