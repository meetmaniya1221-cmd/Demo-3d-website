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
import { AU_PER_LY, Vec3d } from './units';

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
