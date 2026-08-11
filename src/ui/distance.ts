/** Right-edge distance readout: how far the camera is from its focus, in an
 *  automatically chosen unit (km → million km → AU). Inverse-maps the scene's
 *  radial compression so the number stays meaningful in explorer view. */
import * as THREE from 'three';
import { EXPLORER_A, EXPLORER_GAMMA, TRUE_UNITS_PER_AU } from '../sim/scale';
import { fmtDistanceAuto, fmtLightTime } from './format';

/** Scene-space heliocentric radius → AU, honouring the current scale blend.
 *  The forward map is mapped(r) = (1-t)·A·r^γ + t·r·U; blending the two
 *  inverses is NOT its inverse, so mid-morph we solve the monotonic forward
 *  map by bisection (exact at the endpoints, ~1e-6 AU elsewhere). */
function invMapRadius(sceneR: number, t: number): number {
  if (sceneR <= 0) return 0;
  if (t <= 0) return Math.pow(sceneR / EXPLORER_A, 1 / EXPLORER_GAMMA);
  if (t >= 1) return sceneR / TRUE_UNITS_PER_AU;
  const fwd = (r: number) =>
    (1 - t) * EXPLORER_A * Math.pow(r, EXPLORER_GAMMA) + t * r * TRUE_UNITS_PER_AU;
  let lo = 0;
  let hi = 4000;
  if (fwd(hi) < sceneR) return sceneR / TRUE_UNITS_PER_AU; // beyond the map
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (fwd(mid) < sceneR) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export class DistanceReadout {
  private root: HTMLElement;
  private valueEl: HTMLElement;
  private targetEl: HTMLElement;
  private lightEl: HTMLElement;
  private lastText = '';
  private lastLight = '';
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'distance-readout';
    this.root.setAttribute('aria-label', 'Camera distance');
    this.root.innerHTML = `
      <i class="tick top"></i>
      <div class="distance-body">
        <span class="distance-label">Distance</span>
        <span class="distance-value"></span>
        <span class="distance-target"></span>
        <span class="distance-light"></span>
      </div>
      <i class="tick bottom"></i>
    `;
    this.valueEl = this.root.querySelector('.distance-value')!;
    this.targetEl = this.root.querySelector('.distance-target')!;
    this.lightEl = this.root.querySelector('.distance-light')!;
    parent.appendChild(this.root);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  /**
   * @param camPos camera position (scene units)
   * @param targetPos focus position (scene units)
   * @param targetName label under the number ("from Saturn")
   * @param scaleT explorer(0) → true(1)
   */
  update(
    camPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    targetName: string,
    scaleT: number,
  ): void {
    // Map both endpoints into AU space radially (direction is preserved by
    // the scene mapping), then measure the chord there.
    const rCam = invMapRadius(camPos.length(), scaleT);
    const rTgt = invMapRadius(targetPos.length(), scaleT);
    this.a.copy(camPos).normalize().multiplyScalar(rCam);
    if (targetPos.lengthSq() > 1e-12) {
      this.b.copy(targetPos).normalize().multiplyScalar(rTgt);
    } else {
      this.b.set(0, 0, 0);
    }
    const au = this.a.distanceTo(this.b);
    const text = fmtDistanceAuto(au);
    if (text !== this.lastText) {
      this.lastText = text;
      this.valueEl.textContent = text;
    }
    const label = `from ${targetName}`;
    if (this.targetEl.textContent !== label) this.targetEl.textContent = label;
    // the educational kicker: how long light itself would need
    const light = au > 1e-7 ? `light ${fmtLightTime(au)}` : '';
    if (light !== this.lastLight) {
      this.lastLight = light;
      this.lightEl.textContent = light;
    }
  }
}
