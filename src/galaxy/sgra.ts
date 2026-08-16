/**
 * Sagittarius A*: the stellar environment and temporal behaviour of the
 * Milky Way's central black hole. The relativistic optics live in
 * lensing.ts; this module owns what *orbits and flickers*.
 *
 * S-star cluster - the stars whose orbits weighed the black hole. Orbital
 * elements follow the published solutions (Gillessen et al. 2017; GRAVITY
 * 2018-2023): S2's 16.05-yr, e = 0.88 orbit with its 120-AU, 7,650 km/s
 * pericenter is the best-measured orbit in astronomy and carries two direct
 * GR detections (gravitational redshift 2018, Schwarzschild precession
 * 2020). S62 and S4714 are flagged reported-but-contested in the data.
 * Approximation, stated: the published (i, Ω) angles are defined against
 * the plane of the sky; mapping that frame onto galactocentric axes here
 * ignores the ~31° position-angle offset of galactic north - orbit shapes,
 * sizes and periods are honest, the cluster's absolute orientation is
 * approximate.
 *
 * Flares - Chandra sees roughly one X-ray flare a day (up to ~400× quiescent
 * in 2013); JWST sees continuous infrared flickering with 5-6 stronger
 * flares per day and no true "off" state. The generator below reproduces
 * that character - permanent low-level flicker plus Poisson-timed flares
 * with log-normal-ish amplitudes - on an accelerated clock, because a game
 * session is not a 24-hour observing run. The acceleration is a stated
 * gameplay choice, not a scientific claim.
 */
import * as THREE from 'three';
import { mulberry32 } from '../scene/noise';
import { AU_PER_LY, SGRA_RS_LY, Vec3d } from './units';

/**
 * The accretion flow's angular-momentum axis, in galaxy-scene world axes,
 * shared by the mid-range disk mesh and the close-range geodesic march so
 * the two representations describe one object. EHT model fits prefer a
 * spin axis within ~30° of our line of sight (we view Sgr A* nearly
 * pole-on); the axis here points broadly Sunward with enough tilt that the
 * disk reads as a disk rather than a circle - a stated visualization
 * choice within the observational uncertainty.
 */
export const SGRA_DISK_NORMAL = new THREE.Vector3(-0.82, 0.42, 0.39).normalize();

// ---------------------------------------------------------------- S stars --

export interface SStarDef {
  name: string;
  /** Semi-major axis, AU (angular size × 8,277 pc). */
  aAU: number;
  e: number;
  /** Sky-frame angles, degrees. */
  incDeg: number;
  raanDeg: number;
  argPeriDeg: number;
  /** Pericenter epoch, Julian years. */
  tPeri: number;
  periodYr: number;
  /** Published but contested (Peissker et al. 2020 faint-star orbits). */
  contested?: boolean;
}

export const S_STARS: SStarDef[] = [
  { name: 'S2', aAU: 1035, e: 0.8843, incDeg: 133.9, raanDeg: 228.1, argPeriDeg: 66.3, tPeri: 2018.38, periodYr: 16.05 },
  { name: 'S1', aAU: 4925, e: 0.556, incDeg: 119.1, raanDeg: 342.0, argPeriDeg: 122.3, tPeri: 2001.8, periodYr: 166.0 },
  { name: 'S8', aAU: 3350, e: 0.803, incDeg: 74.4, raanDeg: 315.4, argPeriDeg: 346.7, tPeri: 1983.6, periodYr: 92.9 },
  { name: 'S9', aAU: 2255, e: 0.644, incDeg: 82.4, raanDeg: 156.6, argPeriDeg: 150.6, tPeri: 1976.7, periodYr: 51.3 },
  { name: 'S12', aAU: 2472, e: 0.888, incDeg: 33.6, raanDeg: 230.1, argPeriDeg: 317.9, tPeri: 1995.6, periodYr: 58.9 },
  { name: 'S13', aAU: 2186, e: 0.425, incDeg: 24.7, raanDeg: 74.5, argPeriDeg: 245.2, tPeri: 2004.9, periodYr: 49.0 },
  { name: 'S14', aAU: 2370, e: 0.976, incDeg: 100.6, raanDeg: 226.4, argPeriDeg: 334.6, tPeri: 2000.1, periodYr: 55.3 },
  { name: 'S38', aAU: 1172, e: 0.820, incDeg: 171.1, raanDeg: 101.1, argPeriDeg: 18.0, tPeri: 2003.2, periodYr: 19.2 },
  { name: 'S55', aAU: 892, e: 0.721, incDeg: 150.1, raanDeg: 325.5, argPeriDeg: 331.5, tPeri: 2009.3, periodYr: 12.8 },
  { name: 'S62', aAU: 749, e: 0.976, incDeg: 72.8, raanDeg: 122.6, argPeriDeg: 42.6, tPeri: 2003.3, periodYr: 9.9, contested: true },
  { name: 'S4714', aAU: 844, e: 0.985, incDeg: 127.7, raanDeg: 129.3, argPeriDeg: 357.4, tPeri: 2017.3, periodYr: 12.0, contested: true },
];

const DEG = Math.PI / 180;

/**
 * Position on a Kepler orbit at Julian year t, in the sky frame, AU.
 * Sky frame: z along the line of sight from Earth, x/y in the sky plane.
 */
function keplerSkyAU(def: SStarDef, tYr: number, out: THREE.Vector3): THREE.Vector3 {
  const M = ((tYr - def.tPeri) / def.periodYr) * 2 * Math.PI;
  // Newton solve for the eccentric anomaly; e up to 0.985 still converges
  // fast enough with a cosine-damped start
  let E = M % (2 * Math.PI);
  for (let i = 0; i < 12; i++) {
    const d = (E - def.e * Math.sin(E) - M) / (1 - def.e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-9) break;
  }
  const xo = def.aAU * (Math.cos(E) - def.e);
  const yo = def.aAU * Math.sqrt(1 - def.e * def.e) * Math.sin(E);
  const co = Math.cos(def.argPeriDeg * DEG);
  const so = Math.sin(def.argPeriDeg * DEG);
  const ci = Math.cos(def.incDeg * DEG);
  const si = Math.sin(def.incDeg * DEG);
  const cO = Math.cos(def.raanDeg * DEG);
  const sO = Math.sin(def.raanDeg * DEG);
  const x1 = xo * co - yo * so;
  const y1 = (xo * so + yo * co) * ci;
  const z1 = (xo * so + yo * co) * si;
  out.set(x1 * cO - y1 * sO, x1 * sO + y1 * cO, z1);
  return out;
}

/**
 * Sky frame → galactocentric scene offsets (ly). The line of sight from
 * Earth is +x galactic (we sit at -x); sky "up" maps to galactic +z. The
 * position-angle twist between equatorial and galactic north is dropped -
 * see the header note.
 */
function skyToGalLy(sky: THREE.Vector3, out: Vec3d): Vec3d {
  const k = 1 / AU_PER_LY;
  return out.set(-sky.z * k, sky.x * k, sky.y * k);
}

const STAR_COLORS: Record<string, [number, number, number]> = {
  // most bright S stars are young B-type main-sequence stars
  default: [0.74, 0.82, 1.0],
  S2: [0.7, 0.79, 1.0],
};

export class SStarCluster {
  /** Group positioned (camera-relative) at the black hole by the caller. */
  readonly group = new THREE.Group();
  private points: THREE.Points;
  private orbitLines: THREE.LineLoop[] = [];
  private material: THREE.ShaderMaterial;
  private positions: Float32Array;
  private galPos = S_STARS.map(() => new Vec3d());
  private tmpSky = new THREE.Vector3();

  constructor() {
    const n = S_STARS.length;
    this.positions = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const color = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = STAR_COLORS[S_STARS[i].name] ?? STAR_COLORS.default;
      color.set(c, i * 3);
      size[i] = S_STARS[i].name === 'S2' ? 3.6 : 2.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 aColor;
        varying vec3 vColor;
        uniform float uPr;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(length(mv.xyz), 1e-9);
          gl_PointSize = clamp(aSize * 0.0016 / dist, 1.4, 9.0) * uPr;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float a = smoothstep(1.0, 0.15, d);
          gl_FragColor = vec4(vColor * a, 1.0);
        }
      `,
      uniforms: { uPr: { value: Math.min(2, window.devicePixelRatio || 1) } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -2;
    this.group.add(this.points);

    // orbit traces, drawn by eccentric anomaly so pericenter keeps detail
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x3d5a7a,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const scene = { x: 0, y: 0, z: 0 };
    for (const def of S_STARS) {
      const pts: number[] = [];
      const gal = new Vec3d();
      for (let k = 0; k < 128; k++) {
        const E = (k / 128) * 2 * Math.PI;
        const xo = def.aAU * (Math.cos(E) - def.e);
        const yo = def.aAU * Math.sqrt(1 - def.e * def.e) * Math.sin(E);
        // same rotation chain as keplerSkyAU
        const co = Math.cos(def.argPeriDeg * DEG);
        const so = Math.sin(def.argPeriDeg * DEG);
        const ci = Math.cos(def.incDeg * DEG);
        const si = Math.sin(def.incDeg * DEG);
        const cO = Math.cos(def.raanDeg * DEG);
        const sO = Math.sin(def.raanDeg * DEG);
        const x1 = xo * co - yo * so;
        const y1 = (xo * so + yo * co) * ci;
        const z1 = (xo * so + yo * co) * si;
        this.tmpSky.set(x1 * cO - y1 * sO, x1 * sO + y1 * cO, z1);
        skyToGalLy(this.tmpSky, gal);
        // scene axis swap (galToScene) inline: (gx, gz, -gy)
        scene.x = gal.x;
        scene.y = gal.z;
        scene.z = -gal.y;
        pts.push(scene.x, scene.y, scene.z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      const line = new THREE.LineLoop(g, lineMat);
      line.frustumCulled = false;
      line.renderOrder = -3;
      this.orbitLines.push(line);
      this.group.add(line);
    }
  }

  setPixelRatio(pr: number): void {
    this.material.uniforms.uPr.value = pr;
  }

  /** Galactocentric position (ly) of star i right now. */
  starPos(i: number): Vec3d {
    return this.galPos[i];
  }

  /** Advance orbits to the given sim time and fade by camera distance. */
  update(simDays: number, camDistLy: number): void {
    const tYr = 2000.0 + simDays / 365.25;
    const gal = new Vec3d();
    for (let i = 0; i < S_STARS.length; i++) {
      keplerSkyAU(S_STARS[i], tYr, this.tmpSky);
      skyToGalLy(this.tmpSky, gal);
      this.galPos[i].copy(gal);
      this.positions[i * 3] = gal.x;
      this.positions[i * 3 + 1] = gal.z;
      this.positions[i * 3 + 2] = -gal.y;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    // the cluster spans ~0.1 ly; it only reads as structure when close
    const visible = camDistLy < 2.5;
    this.points.visible = visible;
    const orbitAlpha = THREE.MathUtils.clamp(1 - camDistLy / 0.6, 0, 0.5);
    for (const line of this.orbitLines) {
      line.visible = orbitAlpha > 0.02;
      (line.material as THREE.LineBasicMaterial).opacity = orbitAlpha;
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
    for (const l of this.orbitLines) l.geometry.dispose();
    (this.orbitLines[0]?.material as THREE.Material | undefined)?.dispose();
  }
}

// ---------------------------------------------------------- accretion disk --

const DISK_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorldDir;
  varying vec3 vTangent;
  void main() {
    vLocal = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorldDir = w.xyz - cameraPosition;
    // orbital direction in world space (modelMatrix only exists here, not
    // in the fragment stage); smooth interpolation around the ring is fine
    vTangent = normalize(mat3(modelMatrix) * vec3(-position.y, position.x, 0.0));
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const DISK_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vLocal;      // disk-plane local coords, units of Rs
  varying vec3 vWorldDir;   // fragment direction from the camera
  varying vec3 vTangent;    // orbital direction, world space
  uniform float uTime;
  uniform float uLevel;     // flare-driven emission multiplier
  uniform float uFade;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    float r = length(vLocal.xy);          // radius in Rs
    if (r < 2.7 || r > 14.0) discard;
    float phi = atan(vLocal.y, vLocal.x);

    // Keplerian shear: inner material laps the outer, streaks stretch
    float w = 6.0 / pow(r, 1.5);
    float streak = 0.5 + 0.5 * vnoise(vec2(phi * 3.0 + uTime * w, r * 2.0));
    streak *= 0.65 + 0.35 * vnoise(vec2(phi * 9.0 - uTime * w * 1.7, r * 5.0));

    // temperature falls outward: white-hot rim to deep ember edge
    float t = clamp((r - 3.0) / 11.0, 0.0, 1.0);
    vec3 hot = vec3(1.55, 1.38, 1.15);
    vec3 mid = vec3(1.45, 0.88, 0.42);
    vec3 cool = vec3(0.80, 0.28, 0.10);
    vec3 col = t < 0.5 ? mix(hot, mid, t * 2.0) : mix(mid, cool, t * 2.0 - 1.0);

    // Doppler boost: the side coming toward the viewer brightens - the
    // asymmetry every EHT image shows. beta = sqrt(Rs/2r) for a circular
    // orbit; delta^3 approximates the beaming. The orbital direction is
    // computed in the ring's local frame and carried to world space by the
    // mesh's own model matrix, so mesh and math share one orientation
    float beta = sqrt(0.5 / r);
    float mu = dot(normalize(vWorldDir), normalize(vTangent));
    float dopp = 1.0 / max(0.30, 1.0 - beta * mu);
    float boost = dopp * dopp * dopp;
    col = mix(col, col.zyx * vec3(0.85, 1.0, 1.4), clamp((dopp - 1.0) * 0.9, -0.3, 0.55));

    float gred = sqrt(max(0.0, 1.0 - 1.0 / r));
    float radial = pow(3.0 / r, 1.9);
    float edgeIn = smoothstep(2.7, 3.3, r);
    float edgeOut = 1.0 - smoothstep(10.0, 14.0, r);
    float e = radial * streak * boost * gred * edgeIn * edgeOut;
    gl_FragColor = vec4(col * e * uLevel * uFade * 1.6, 1.0);
  }
`;

/**
 * The mid-range Sagittarius A* structure: a Doppler-shaded hot-gas annulus
 * between the ISCO and ~14 Rs plus the black photon-capture silhouette.
 * From tens of AU out, the full geodesic march cannot put meaningful pixels
 * on screen, but the eye still needs "bright ring with a dark heart" - this
 * mesh carries that reading, then hands over to the lensing march (which
 * bends this very geometry on its way in) as the shadow grows past a few
 * dozen pixels. Emission is deliberately brighter than the real, badly
 * underluminous flow - the HUD's approximation note says so.
 */
export class AccretionDisk {
  readonly group = new THREE.Group();
  private diskMat: THREE.ShaderMaterial;
  private shadowMat: THREE.SpriteMaterial;
  private shadow: THREE.Sprite;

  constructor() {
    const rsScene = SGRA_RS_LY; // 1 unit = 1 ly; mesh is built in Rs then scaled
    const geo = new THREE.RingGeometry(2.7, 14, 96, 4);
    this.diskMat = new THREE.ShaderMaterial({
      vertexShader: DISK_VERT,
      fragmentShader: DISK_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uLevel: { value: 1 },
        uFade: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const disk = new THREE.Mesh(geo, this.diskMat);
    disk.renderOrder = -2;
    // orient the ring's +z onto the flow axis
    disk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), SGRA_DISK_NORMAL);
    this.group.add(disk);

    // the photon-capture silhouette: apparent radius √27/2 · Rs. A soft-edged
    // black billboard, drawn over the ring - at mid range the "far side rises
    // over the shadow" subtlety is sub-pixel, and the march owns the close-up
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.82, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    this.shadowMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.shadow = new THREE.Sprite(this.shadowMat);
    // sized in Rs like the ring; the group scale below converts both to ly
    this.shadow.scale.setScalar(2.598 * 2 * 1.15);
    this.shadow.renderOrder = -1;
    this.group.add(this.shadow);

    this.group.scale.setScalar(rsScene);
  }

  /** Fade by distance: invisible beyond ~0.03 ly (sub-pixel), handed to the
   *  march inside ~10 AU where the real bending takes over. */
  update(camDistLy: number, time: number, flareLevel: number): void {
    const rs = SGRA_RS_LY;
    const far = 1 - THREE.MathUtils.smoothstep(camDistLy, 0.012, 0.035);
    const near = THREE.MathUtils.smoothstep(camDistLy, rs * 18, rs * 60);
    const fade = far * near;
    this.group.visible = fade > 0.01;
    this.diskMat.uniforms.uTime.value = time;
    this.diskMat.uniforms.uLevel.value = 0.32 + Math.min(flareLevel, 20) * 0.22;
    this.diskMat.uniforms.uFade.value = fade;
    this.shadowMat.opacity = fade;
  }

  dispose(): void {
    this.diskMat.dispose();
    this.shadowMat.map?.dispose();
    this.shadowMat.dispose();
  }
}

// ------------------------------------------------------------------ flares --

export interface FlareState {
  /** Emission multiplier ≥ ~0.7; quiescent ≈ 1, big flares reach ~40. */
  level: number;
  /** True while a discrete flare event is in progress. */
  active: boolean;
  /** 0..1 normalized radiation reading for the HUD. */
  radiation: number;
}

/**
 * Accelerated Sgr A* variability: permanent flicker + Poisson flares.
 * Deterministic per session seed; every flare has a rise and an exponential
 * decay like the observed light curves.
 */
export class FlareGenerator {
  readonly state: FlareState = { level: 1, active: false, radiation: 0.08 };
  private rnd: () => number;
  private t = 0;
  private nextFlare: number;
  private flareT0 = -1;
  private flareRise = 3;
  private flareDecay = 20;
  private flareAmp = 6;

  constructor(seed: number) {
    this.rnd = mulberry32(seed ^ 0x9e3779b9);
    this.nextFlare = 25 + this.rnd() * 60;
  }

  /** Force a flare now (used by the procedural event system). */
  trigger(strength = 1): void {
    this.flareT0 = this.t;
    this.flareRise = 2 + this.rnd() * 4;
    this.flareDecay = 14 + this.rnd() * 26;
    // log-normal-ish amplitude: many modest flares, rare monsters -
    // Chandra's brightest on record hit ~400× quiescent, we cap lower
    // because the tone mapper has feelings too
    const u = this.rnd();
    this.flareAmp = (2.5 + Math.exp(u * 3.4) * strength) * (0.8 + this.rnd() * 0.4);
    this.flareAmp = Math.min(this.flareAmp, 42);
    this.nextFlare = this.t + 40 + this.rnd() * 140;
  }

  update(dt: number): FlareState {
    this.t += dt;
    if (this.t >= this.nextFlare) this.trigger();

    // continuous sub-flare flicker (JWST: no rest state) - three
    // incommensurate sines make a cheap band-limited wander
    const flicker =
      1 +
      0.16 * Math.sin(this.t * 0.83) +
      0.11 * Math.sin(this.t * 2.17 + 1.4) +
      0.07 * Math.sin(this.t * 5.31 + 4.0);

    let flare = 0;
    if (this.flareT0 >= 0) {
      const dtF = this.t - this.flareT0;
      if (dtF < this.flareRise) {
        flare = (dtF / this.flareRise) * this.flareAmp;
      } else {
        flare = this.flareAmp * Math.exp(-(dtF - this.flareRise) / this.flareDecay);
        if (flare < 0.05) this.flareT0 = -1;
      }
    }

    this.state.level = flicker + flare;
    this.state.active = flare > 0.35;
    this.state.radiation = Math.min(1, 0.08 + flare / 30);
    return this.state;
  }
}
