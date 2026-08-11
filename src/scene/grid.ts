/**
 * Ecliptic reference grid: polar rings at round AU distances plus faint
 * radial spokes - the "instrumentation" layer that makes the view read as an
 * astronomical map. Scale-mode aware; ring labels are projected by the HUD.
 */
import * as THREE from 'three';
import { mapDistanceAU } from '../sim/scale';

export const GRID_RINGS_AU = [0.5, 1, 2, 5, 10, 20, 40];
export const LABELED_RINGS_AU = [1, 5, 10, 20, 40];

const RING_SEGMENTS = 180;
const SPOKES = 12;
const SPOKE_INNER_AU = 0.3;
const SPOKE_OUTER_AU = 46;

/** Fixed azimuth where ring labels sit (radians, scene frame). */
export const RING_LABEL_ANGLE = -0.62;

export class ReferenceGrid {
  readonly group = new THREE.Group();
  private rings: THREE.LineLoop[] = [];
  private spokes: THREE.LineSegments;
  private spokePos: Float32Array;

  constructor() {
    // unit circle shared by every ring; per-ring scale sets the radius
    const circle = new Float32Array(RING_SEGMENTS * 3);
    for (let i = 0; i < RING_SEGMENTS; i++) {
      const a = (i / RING_SEGMENTS) * Math.PI * 2;
      circle[i * 3] = Math.cos(a);
      circle[i * 3 + 2] = -Math.sin(a);
    }
    const circleGeo = new THREE.BufferGeometry();
    circleGeo.setAttribute('position', new THREE.BufferAttribute(circle, 3));

    const ringMat = new THREE.LineBasicMaterial({
      color: 0x4a6da8,
      transparent: true,
      opacity: 0.14,
    });
    for (const _ of GRID_RINGS_AU) {
      const ring = new THREE.LineLoop(circleGeo, ringMat);
      ring.frustumCulled = false;
      this.rings.push(ring);
      this.group.add(ring);
    }

    this.spokePos = new Float32Array(SPOKES * 2 * 3);
    const spokeGeo = new THREE.BufferGeometry();
    spokeGeo.setAttribute('position', new THREE.BufferAttribute(this.spokePos, 3));
    this.spokes = new THREE.LineSegments(
      spokeGeo,
      new THREE.LineBasicMaterial({ color: 0x4a6da8, transparent: true, opacity: 0.07 }),
    );
    this.spokes.frustumCulled = false;
    this.group.add(this.spokes);

    // sit just under the ecliptic so orbit lines never z-fight the grid
    this.group.position.y = -0.06;
    this.group.renderOrder = -2;
    this.rebuild(0);
  }

  rebuild(scaleT: number): void {
    GRID_RINGS_AU.forEach((rAU, i) => {
      const r = mapDistanceAU(rAU, scaleT);
      this.rings[i].scale.set(r, 1, r);
    });
    const inner = mapDistanceAU(SPOKE_INNER_AU, scaleT);
    const outer = mapDistanceAU(SPOKE_OUTER_AU, scaleT);
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = -Math.sin(a);
      this.spokePos[i * 6] = cos * inner;
      this.spokePos[i * 6 + 2] = sin * inner;
      this.spokePos[i * 6 + 3] = cos * outer;
      this.spokePos[i * 6 + 5] = sin * outer;
    }
    (this.spokes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** World anchor for a ring's AU label. */
  labelAnchor(rAU: number, scaleT: number, out: THREE.Vector3): THREE.Vector3 {
    const r = mapDistanceAU(rAU, scaleT);
    return out.set(Math.cos(RING_LABEL_ANGLE) * r, -0.06, -Math.sin(RING_LABEL_ANGLE) * r);
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }
}
