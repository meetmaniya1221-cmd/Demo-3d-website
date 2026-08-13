/**
 * The predicted trajectory, drawn in the world.
 *
 * This is a real conic in the scene, sampled from the ship's actual state
 * vector, parented to a group that sits on the body it orbits. It is not a HUD
 * overlay: it occludes correctly behind the planet, it moves with the body, and
 * because the vertices are stored body-relative it keeps its precision even
 * when the body is 30 AU from the origin.
 *
 * It updates live. Light the engine and the curve deforms as you burn - which
 * is the whole point, since seeing the apoapsis climb while you hold a prograde
 * burn is the fastest way anyone has ever learned orbital mechanics.
 */
import * as THREE from 'three';
import { UNITS_PER_KM } from './ephemeris';
import { apsides, sampleConic } from './orbit';

const SEGMENTS = 220;
/** Closed orbit. */
const COLOR_BOUND = 0x7fd4ff;
/** Unbound - you are leaving. */
const COLOR_ESCAPE = 0xffc46b;
/** The predicted periapsis is inside the body. */
const COLOR_IMPACT = 0xff8f6b;

export class TrajectoryPreview {
  /** Parent this to the scene; it positions itself on the body each frame. */
  readonly group = new THREE.Group();
  private line: THREE.Line;
  private lineMat: THREE.LineBasicMaterial;
  private positions: Float32Array;
  private geo = new THREE.BufferGeometry();
  private apo: THREE.Mesh;
  private peri: THREE.Mesh;
  private markerMatA: THREE.MeshBasicMaterial;
  private markerMatP: THREE.MeshBasicMaterial;
  private points: THREE.Vector3[] = [];
  private markerGeo: THREE.SphereGeometry;

  constructor() {
    this.positions = new Float32Array((SEGMENTS + 2) * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setDrawRange(0, 0);
    this.lineMat = new THREE.LineBasicMaterial({
      color: COLOR_BOUND,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    this.line = new THREE.Line(this.geo, this.lineMat);
    this.line.frustumCulled = false;
    this.line.renderOrder = 3;
    this.group.add(this.line);

    // apsis markers: tiny spheres rather than sprites so they scale with the
    // scene and cannot smear into a full-screen blob at close range
    this.markerGeo = new THREE.SphereGeometry(1, 10, 6);
    this.markerMatP = new THREE.MeshBasicMaterial({
      color: COLOR_BOUND,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.markerMatA = new THREE.MeshBasicMaterial({
      color: 0x9ab6d8,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    this.peri = new THREE.Mesh(this.markerGeo, this.markerMatP);
    this.apo = new THREE.Mesh(this.markerGeo, this.markerMatA);
    this.peri.frustumCulled = false;
    this.apo.frustumCulled = false;
    this.group.add(this.peri, this.apo);
    this.group.visible = false;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  /**
   * Rebuild from a body-centred state vector.
   *
   * @param bodyPos    world position of the anchor, scene units
   * @param r          body-centred position, km
   * @param v          body-centred velocity, km/s
   * @param mu         gravitational parameter, km³/s²
   * @param maxRadiusKm how far out to draw an escape arc before cutting it off
   * @param safeRadiusKm periapsis inside this means an impact, and the curve
   *                     is coloured to say so
   */
  update(
    bodyPos: THREE.Vector3,
    r: THREE.Vector3,
    v: THREE.Vector3,
    mu: number,
    maxRadiusKm: number,
    safeRadiusKm: number,
  ): void {
    this.group.position.copy(bodyPos);
    sampleConic(r, v, mu, SEGMENTS, maxRadiusKm, this.points);

    const n = Math.min(this.points.length, SEGMENTS + 2);
    for (let i = 0; i < n; i++) {
      const p = this.points[i];
      this.positions[i * 3] = p.x * UNITS_PER_KM;
      this.positions[i * 3 + 1] = p.y * UNITS_PER_KM;
      this.positions[i * 3 + 2] = p.z * UNITS_PER_KM;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeBoundingSphere();

    const { periapsis, apoapsis } = apsides(r, v, mu);
    const impact = periapsis.length() < safeRadiusKm;
    const escaping = apoapsis === null;
    const color = impact ? COLOR_IMPACT : escaping ? COLOR_ESCAPE : COLOR_BOUND;
    this.lineMat.color.setHex(color);
    this.markerMatP.color.setHex(color);

    // marker size scales with the orbit so it stays a dot, never a moon
    const scale = Math.max(r.length() * UNITS_PER_KM * 0.006, 1e-7);
    this.peri.position.copy(periapsis).multiplyScalar(UNITS_PER_KM);
    this.peri.scale.setScalar(scale);
    if (apoapsis) {
      this.apo.position.copy(apoapsis).multiplyScalar(UNITS_PER_KM);
      this.apo.scale.setScalar(scale);
      this.apo.visible = true;
    } else {
      this.apo.visible = false;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.lineMat.dispose();
    this.markerGeo.dispose();
    this.markerMatA.dispose();
    this.markerMatP.dispose();
  }
}
