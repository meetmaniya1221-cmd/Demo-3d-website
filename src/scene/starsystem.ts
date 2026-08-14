/**
 * One nearby star system, assembled on demand.
 *
 * Built when you arrive and thrown away when you have been gone from it long
 * enough - which is what keeps thirteen systems from costing thirteen systems'
 * worth of GPU memory at boot. The Solar System is exempt: it is the default
 * view and stays resident.
 *
 * Geometry
 * --------
 * Planet positions come from the same Kepler machinery the Solar System uses,
 * with one honest simplification stated in the UI: for these systems we know
 * the period, the semi-major axis and usually the eccentricity, but almost
 * never the orientation of the orbit in space or where the planet was at any
 * particular epoch. So the ellipse's SHAPE and SIZE are real, the position
 * along it is a phase we chose and held stable, and the orbital planes are
 * drawn coplanar except where an inclination was actually measured (the
 * transiting TRAPPIST-1 planets). Saying that is better than drawing seven
 * randomly-tilted orbits and implying we measured them.
 *
 * Scale
 * -----
 * These systems are tiny. TRAPPIST-1's outermost planet orbits at 0.062 AU -
 * a sixth of Mercury's distance - so the app's heliocentric explorer curve,
 * tuned for a system 30 AU across, would collapse the whole thing onto the
 * star. Each system therefore gets its own explorer normalisation from its own
 * outermost orbit, and true scale remains exactly true scale, so switching to
 * it shows you honestly how little room there is.
 */
import * as THREE from 'three';
import { TRUE_UNITS_PER_AU } from '../sim/scale';
import { AU_KM } from '../data/bodies';
import { habitableZone, type HabitableZone } from '../sim/habitable';
import {
  primaryStar,
  type Exoplanet,
  type HostStar,
  type StarSystem,
} from '../data/catalog/starsystems';
import { ExoplanetBody } from './exoplanet';
import { HostStarBody } from './hoststar';

/** Sun radii in one AU - converts a stellar radius into orbit-scale units. */
const SUN_RADIUS_AU = 695_700 / AU_KM;
/** Earth radii in one AU. */
const EARTH_RADIUS_AU = 6371 / AU_KM;

/** Where the outermost orbit lands in explorer view, in scene units. */
const EXPLORER_OUTER_UNITS = 150;
/** Same power law the Solar System uses, so the inner planets still spread out. */
const EXPLORER_GAMMA = 0.55;

const ORBIT_SEGMENTS = 220;

/**
 * A phase for each planet that is stable across sessions but obviously
 * arbitrary. Derived from the id so a given world is always in the same place
 * when you come back, which matters more for orientation than a pretend epoch
 * would for accuracy.
 */
function phaseOf(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return (h % 3600) / 3600 * Math.PI * 2;
}

export interface SystemScales {
  /** Apoapsis of the outermost orbit in AU - sets framing and camera limits. */
  outerAU: number;
  /** Explorer-view coefficient: units = k · r^0.55. */
  k: number;
}

export function systemScales(sys: StarSystem): SystemScales {
  // Frame on what is established. Proxima's candidate c orbits at 1.49 AU, 30×
  // further out than either confirmed planet; letting it set the scale would
  // crush the two real ones onto the star to make room for one that may not
  // exist. The candidate is still drawn - it just falls outside the frame,
  // which is a fair description of its standing.
  const framing = sys.planets.filter((p) => p.status === 'confirmed');
  let outerAU = (framing.length ? framing : sys.planets).reduce(
    (m, p) => Math.max(m, p.semiMajorAU * (1 + (p.eccentricity ?? 0))),
    0,
  );
  if (outerAU <= 0) {
    // a system with no planets still needs a sensible frame around its star:
    // use the widest stellar separation, or a few stellar radii if it is single
    const widest = sys.stars.reduce((m, s) => Math.max(m, s.offsetAU ?? 0), 0);
    outerAU = widest > 0 ? widest : Math.max((primaryStar(sys).radiusSun ?? 1) * SUN_RADIUS_AU * 60, 0.05);
  }
  return { outerAU, k: EXPLORER_OUTER_UNITS / Math.pow(outerAU, EXPLORER_GAMMA) };
}

/**
 * Orbit radius → scene units.
 *
 * Explorer view uses the same r^0.55 compression the Solar System uses, scaled
 * so this system's outermost orbit lands at a consistent size whatever its
 * actual span. True scale is 1 AU = 100 units, identical to everywhere else in
 * the app - which is the point: it is the mode where the comparison is fair.
 */
export function mapSystemAU(rAU: number, scaleT: number, scales: SystemScales): number {
  if (rAU <= 0) return 0;
  const explorer = scales.k * Math.pow(rAU, EXPLORER_GAMMA);
  return explorer * (1 - scaleT) + rAU * TRUE_UNITS_PER_AU * scaleT;
}

/**
 * Scene units → AU, the inverse of `mapSystemAU`.
 *
 * The forward map blends a power law with a linear one, and blending their
 * inverses is not the inverse of the blend, so mid-morph it is solved by
 * bisection - the same approach ui/distance takes for the Solar System, for
 * the same reason.
 */
export function invMapSystemUnits(sceneR: number, scaleT: number, scales: SystemScales): number {
  if (sceneR <= 0) return 0;
  if (scaleT <= 0) return Math.pow(sceneR / scales.k, 1 / EXPLORER_GAMMA);
  if (scaleT >= 1) return sceneR / TRUE_UNITS_PER_AU;
  const fwd = (r: number) => mapSystemAU(r, scaleT, scales);
  let lo = 0;
  let hi = Math.max(scales.outerAU * 1000, 1000);
  if (fwd(hi) < sceneR) return sceneR / TRUE_UNITS_PER_AU;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (fwd(mid) < sceneR) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Display radius of a planet, in scene units. */
export function planetDisplayRadius(p: Exoplanet, scaleT: number): number {
  const rEarth = p.radiusEarth ?? 1;
  const trueR = rEarth * EARTH_RADIUS_AU * TRUE_UNITS_PER_AU;
  // Explorer view exaggerates, but keeps the ordering honest: the same 0.45
  // power the Solar System applies to its planets, so a super-Earth still reads
  // as bigger than an Earth-sized world and a gas giant still dwarfs both.
  const explorer = Math.max(1.15, 2.6 * Math.pow(rEarth, 0.45));
  return explorer * (1 - scaleT) + trueR * scaleT;
}

/** Display radius of a star, in scene units. */
export function starDisplayRadius(star: HostStar, scaleT: number): number {
  const rSun = star.radiusSun ?? 0.3;
  const trueR = rSun * SUN_RADIUS_AU * TRUE_UNITS_PER_AU;
  const explorer = Math.max(4.5, 9 * Math.pow(rSun, 0.4));
  return explorer * (1 - scaleT) + trueR * scaleT;
}

/**
 * Ecliptic-plane position of a planet on its own ellipse.
 *
 * Solves Kepler's equation exactly like data/bodies does, but referenced to the
 * planet's own arbitrary phase rather than to J2000, because no epoch is known.
 * Inclination is applied only where one was measured.
 */
export function planetPosition(p: Exoplanet, simDays: number, out: THREE.Vector3): THREE.Vector3 {
  const e = Math.min(p.eccentricity ?? 0, 0.92);
  const M = phaseOf(p.id) + (simDays / p.periodDays) * Math.PI * 2;
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 20; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-10) break;
  }
  const a = p.semiMajorAU;
  const x = a * (Math.cos(E) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  // scene axes: ecliptic x stays x, ecliptic y becomes −z, the plane is y = 0
  out.set(x, 0, -y);
  if (p.inclinationDeg !== undefined) {
    // measured inclination is relative to the sky plane; the departure from
    // exactly edge-on is the physically meaningful part
    const tilt = THREE.MathUtils.degToRad(90 - p.inclinationDeg);
    out.applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
  }
  return out;
}

class SystemOrbitLine {
  readonly line: THREE.LineLoop;
  private base: Float32Array;
  private mat: THREE.LineBasicMaterial;
  private baseOpacity: number;

  constructor(p: Exoplanet, color: number) {
    this.base = new Float32Array(ORBIT_SEGMENTS * 3);
    const e = Math.min(p.eccentricity ?? 0, 0.92);
    const a = p.semiMajorAU;
    const tilt = p.inclinationDeg !== undefined ? THREE.MathUtils.degToRad(90 - p.inclinationDeg) : 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < ORBIT_SEGMENTS; i++) {
      const E = (i / ORBIT_SEGMENTS) * Math.PI * 2;
      v.set(a * (Math.cos(E) - e), 0, -a * Math.sqrt(1 - e * e) * Math.sin(E));
      if (tilt !== 0) v.applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
      this.base[i * 3] = v.x;
      this.base[i * 3 + 1] = v.y;
      this.base[i * 3 + 2] = v.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ORBIT_SEGMENTS * 3), 3));
    // a candidate or disputed orbit must not read the same as a measured one
    this.baseOpacity = p.status === 'confirmed' ? 0.42 : 0.2;
    this.mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: this.baseOpacity });
    this.line = new THREE.LineLoop(geo, this.mat);
    this.line.frustumCulled = false;
  }

  rebuild(scaleT: number, scales: SystemScales): void {
    const attr = this.line.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < ORBIT_SEGMENTS; i++) {
      const x = this.base[i * 3];
      const y = this.base[i * 3 + 1];
      const z = this.base[i * 3 + 2];
      const r = Math.hypot(x, y, z);
      const k = r > 0 ? mapSystemAU(r, scaleT, scales) / r : 0;
      arr[i * 3] = x * k;
      arr[i * 3 + 1] = y * k;
      arr[i * 3 + 2] = z * k;
    }
    attr.needsUpdate = true;
  }

  setHighlight(on: boolean, someoneFocused: boolean): void {
    this.mat.opacity = on ? 0.9 : someoneFocused ? this.baseOpacity * 0.4 : this.baseOpacity;
  }

  dispose(): void {
    this.line.geometry.dispose();
    this.mat.dispose();
  }
}

const HZ_VERT = /* glsl */ `
  attribute float aRad;
  varying float vRad;
  varying vec3 vWorld;
  uniform float uInner;
  uniform float uOuter;
  void main() {
    vRad = aRad;
    float r = mix(uInner, uOuter, aRad);
    vec3 pos = vec3(position.x * r, 0.0, position.z * r);
    vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const HZ_FRAG = /* glsl */ `
  precision highp float;
  varying float vRad;
  varying vec3 vWorld;
  uniform vec3 uCamPos;
  uniform float uAlpha;
  void main() {
    float a = sin(vRad * 3.14159) * uAlpha;
    vec3 view = vWorld - uCamPos;
    float slope = abs(view.y) / max(length(view), 1e-4);
    a *= smoothstep(0.05, 0.2, slope);
    gl_FragColor = vec4(0.22, 0.85, 0.59, a);
  }
`;

/** The habitable annulus for one star, sized from that star's own numbers. */
class SystemHabitableZone {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  readonly hz: HabitableZone;

  constructor(hz: HabitableZone) {
    this.hz = hz;
    const seg = 140;
    const positions = new Float32Array((seg + 1) * 2 * 3);
    const rads = new Float32Array((seg + 1) * 2);
    const idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const ang = (i / seg) * Math.PI * 2;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      positions[i * 2 * 3] = cos;
      positions[i * 2 * 3 + 2] = sin;
      positions[(i * 2 + 1) * 3] = cos;
      positions[(i * 2 + 1) * 3 + 2] = sin;
      rads[i * 2] = 0;
      rads[i * 2 + 1] = 1;
      if (i < seg) {
        const a0 = i * 2;
        idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRad', new THREE.BufferAttribute(rads, 1));
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: HZ_VERT,
      fragmentShader: HZ_FRAG,
      uniforms: {
        uInner: { value: 1 },
        uOuter: { value: 2 },
        uCamPos: { value: new THREE.Vector3() },
        // an extrapolated zone is drawn fainter - the edges are less certain
        uAlpha: { value: hz.extrapolated ? 0.09 : 0.15 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.position.y = -0.01;
  }

  rebuild(scaleT: number, scales: SystemScales): void {
    this.mat.uniforms.uInner.value = mapSystemAU(this.hz.innerAU, scaleT, scales);
    this.mat.uniforms.uOuter.value = mapSystemAU(this.hz.outerAU, scaleT, scales);
  }

  updateCamera(pos: THREE.Vector3): void {
    (this.mat.uniforms.uCamPos.value as THREE.Vector3).copy(pos);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/**
 * A live star system in the scene: its stars, its planets, their orbits and its
 * habitable zone. `group` is added to the scene at the origin, because the
 * origin is always wherever you currently are (see sim/interstellar).
 */
export class StarSystemScene {
  readonly def: StarSystem;
  readonly group = new THREE.Group();
  readonly scales: SystemScales;
  readonly hz: HabitableZone | null;
  readonly bodies = new Map<string, ExoplanetBody>();
  readonly starBodies = new Map<string, HostStarBody>();
  readonly pickables: THREE.Object3D[] = [];
  private orbits = new Map<string, SystemOrbitLine>();
  private hzMesh: SystemHabitableZone | null = null;
  private lastScaleT = -1;
  private selectedId: string | null = null;
  private tmp = new THREE.Vector3();
  private planetsVisible = true;

  constructor(def: StarSystem) {
    this.def = def;
    this.scales = systemScales(def);
    const host = primaryStar(def);
    this.hz = habitableZone(host.luminositySun, host.tempK);

    for (const star of def.stars) {
      const body = new HostStarBody(star, star.id === host.id);
      this.starBodies.set(star.id, body);
      this.group.add(body.group);
      this.pickables.push(body.hit);
    }

    for (const p of def.planets) {
      const body = new ExoplanetBody(p, host.color);
      this.bodies.set(p.id, body);
      this.group.add(body.group);
      this.pickables.push(body.hit);

      const orbit = new SystemOrbitLine(p, def.color);
      this.orbits.set(p.id, orbit);
      this.group.add(orbit.line);
    }

    if (this.hz) {
      this.hzMesh = new SystemHabitableZone(this.hz);
      this.hzMesh.mesh.visible = false;
      this.group.add(this.hzMesh.mesh);
    }
  }

  /**
   * Where a companion star is drawn.
   *
   * Explorer view caps the offset just outside the planetary system, because
   * Alpha Centauri AB at its real 12,950 AU from Proxima would be eighty times
   * further out than the outermost orbit and there would be nothing to look at
   * in between. True scale does not cap it: at true scale the pair really is
   * off past the edge of the frame, and that is the honest answer. Either way
   * the real separation is what the information panel prints.
   */
  private companionOffset(star: HostStar, scaleT: number, out: THREE.Vector3): THREE.Vector3 {
    const auOff = star.offsetAU ?? 0;
    if (auOff <= 0 || star.id === primaryStar(this.def).id) return out.set(0, 0, 0);
    const explorer = Math.min(
      this.scales.k * Math.pow(auOff, 0.55),
      EXPLORER_OUTER_UNITS * 1.55,
    );
    const trueR = auOff * TRUE_UNITS_PER_AU;
    const r = explorer * (1 - scaleT) + trueR * scaleT;
    const ang = phaseOf(star.id);
    return out.set(Math.cos(ang) * r, 0, -Math.sin(ang) * r);
  }

  update(simDays: number, scaleT: number, elapsed: number, cameraPos: THREE.Vector3): void {
    for (const [id, star] of this.starBodies) {
      const def = this.def.stars.find((s) => s.id === id)!;
      this.companionOffset(def, scaleT, this.tmp);
      star.group.position.copy(this.tmp);
      star.update(elapsed, starDisplayRadius(def, scaleT));
    }

    for (const body of this.bodies.values()) {
      const p = body.def;
      planetPosition(p, simDays, this.tmp);
      const r = this.tmp.length();
      const k = r > 0 ? mapSystemAU(r, scaleT, this.scales) / r : 0;
      body.group.position.copy(this.tmp).multiplyScalar(k);
      body.setRadius(planetDisplayRadius(p, scaleT));
      body.update(simDays);
    }

    if (Math.abs(scaleT - this.lastScaleT) > 0.0005) {
      this.lastScaleT = scaleT;
      for (const o of this.orbits.values()) o.rebuild(scaleT, this.scales);
      this.hzMesh?.rebuild(scaleT, this.scales);
    }
    this.hzMesh?.updateCamera(cameraPos);
  }

  /** Diameter of the whole system in scene units - framing and LOD use this. */
  extent(scaleT: number): number {
    return 2 * mapSystemAU(this.scales.outerAU, scaleT, this.scales);
  }

  setOrbitsVisible(v: boolean): void {
    for (const o of this.orbits.values()) o.line.visible = v && this.planetsVisible;
  }

  setHabitableZoneVisible(v: boolean): void {
    if (this.hzMesh) this.hzMesh.mesh.visible = v && this.planetsVisible;
  }

  /**
   * Drop the planets when the camera is far enough out that they would be
   * sub-pixel anyway - the whole system is smaller than a fifth of an AU in
   * most cases, so leaving thirty draw calls running while you look at it from
   * a light-year away is pure waste.
   */
  setPlanetsVisible(v: boolean): void {
    if (this.planetsVisible === v) return;
    this.planetsVisible = v;
    for (const b of this.bodies.values()) b.setVisible(v);
    for (const o of this.orbits.values()) o.line.visible = v && o.line.visible;
    if (this.hzMesh) this.hzMesh.mesh.visible = this.hzMesh.mesh.visible && v;
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    for (const [pid, o] of this.orbits) o.setHighlight(pid === id, id !== null);
  }

  get selected(): string | null {
    return this.selectedId;
  }

  /**
   * Analytic position of anything in this system, without waiting for the
   * render loop to have moved the mesh. Navigation asks the maths rather than
   * the scene graph for exactly the reason the Solar System's ephemeris does:
   * a mesh's position is one frame stale, and with time compression running at
   * a million to one that is a long way for a planet on a 1.5-day orbit.
   */
  positionAt(id: string, simDays: number, scaleT: number, out: THREE.Vector3): THREE.Vector3 | null {
    const body = this.bodies.get(id);
    if (body) {
      planetPosition(body.def, simDays, out);
      const r = out.length();
      const k = r > 0 ? mapSystemAU(r, scaleT, this.scales) / r : 0;
      return out.multiplyScalar(k);
    }
    const star = this.def.stars.find((s) => s.id === id);
    if (star) return this.companionOffset(star, scaleT, out);
    return null;
  }

  /** Physical radius in km of anything in this system. */
  radiusKmOf(id: string): number | null {
    const body = this.bodies.get(id);
    if (body) return (body.def.radiusEarth ?? 1) * 6371;
    const star = this.def.stars.find((s) => s.id === id);
    if (star) return (star.radiusSun ?? 0.3) * 695_700;
    return null;
  }

  /** Every id in this system that navigation may target. */
  targetIds(): string[] {
    return [...this.def.stars.map((s) => s.id), ...this.def.planets.map((p) => p.id)];
  }

  /** Scene position of any star or planet in this system. */
  position(id: string, out: THREE.Vector3): THREE.Vector3 | null {
    const body = this.bodies.get(id);
    if (body) return out.copy(body.group.position);
    const star = this.starBodies.get(id);
    if (star) return out.copy(star.group.position);
    return null;
  }

  radiusOf(id: string): number {
    return this.bodies.get(id)?.displayRadius ?? this.starBodies.get(id)?.displayRadius ?? 1;
  }

  has(id: string): boolean {
    return this.bodies.has(id) || this.starBodies.has(id);
  }

  dispose(): void {
    for (const b of this.bodies.values()) b.dispose();
    for (const s of this.starBodies.values()) s.dispose();
    for (const o of this.orbits.values()) o.dispose();
    this.hzMesh?.dispose();
    this.group.clear();
    this.bodies.clear();
    this.starBodies.clear();
    this.orbits.clear();
    this.pickables.length = 0;
  }
}
