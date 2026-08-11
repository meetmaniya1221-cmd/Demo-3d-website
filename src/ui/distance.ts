/** Right-edge distance readout: how far the camera is from its focus, in an
 *  automatically chosen unit (km → million km → AU). Inverse-maps the scene's
 *  radial compression so the number stays meaningful in explorer view. */
import * as THREE from 'three';
import { EXPLORER_A, EXPLORER_GAMMA, TRUE_UNITS_PER_AU } from '../sim/scale';
import { fmtDistanceAuto } from './format';

/** Scene-space heliocentric radius → AU, honouring the current scale blend. */
function invMapRadius(sceneR: number, t: number): number {
  if (sceneR <= 0) return 0;
  const explorer = Math.pow(sceneR / EXPLORER_A, 1 / EXPLORER_GAMMA);
  const trueScale = sceneR / TRUE_UNITS_PER_AU;
  return explorer * (1 - t) + trueScale * t;
}

export class DistanceReadout {
  private root: HTMLElement;
  private valueEl: HTMLElement;
  private targetEl: HTMLElement;
  private lastText = '';
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
      </div>
      <i class="tick bottom"></i>
    `;
    this.valueEl = this.root.querySelector('.distance-value')!;
    this.targetEl = this.root.querySelector('.distance-target')!;
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
  }
}
