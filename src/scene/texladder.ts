/**
 * Resolution ladders for the close-range Earth and Moon maps.
 *
 * The full-detail maps are tens of megabytes; loading them at boot would be
 * absurd for a viewer who never leaves the solar-system overview. So each
 * family of maps is a ladder, and the renderer asks for the rung its current
 * distance justifies. Requests never block - `want()` hands back whatever is
 * already resident and fetches the rest in the background, so closing on a
 * body sharpens it over a second or two instead of freezing.
 */
import * as THREE from 'three';

const loader = new THREE.TextureLoader();

export function colourMap(t: THREE.Texture): void {
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
}

export function dataMap(t: THREE.Texture): void {
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
}

/** A 1x1 black texture, so every sampler is bound before anything loads. */
export function blankTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

export class TextureLadder {
  private readonly resident = new Map<number, THREE.Texture>();
  private readonly pending = new Set<number>();
  private live = -1;

  /**
   * @param urlFor  full URL of a rung, given its label
   * @param labels  one label per rung, coarse to fine; repeats are fine when a
   *                source product runs out of resolution before the ladder does
   */
  constructor(
    private readonly urlFor: (label: string) => string,
    private readonly labels: string[],
    private readonly configure: (t: THREE.Texture) => void,
  ) {}

  /**
   * The best resident texture for `rung`, starting a fetch if that rung is not
   * loaded yet. `onArrive` fires later for the background load.
   */
  want(rung: number, onArrive: (tex: THREE.Texture) => void): THREE.Texture | null {
    const target = THREE.MathUtils.clamp(rung, 0, this.labels.length - 1);
    if (!this.resident.has(target) && !this.pending.has(target)) {
      this.pending.add(target);
      loader.load(
        this.urlFor(this.labels[target]),
        (tex) => {
          this.pending.delete(target);
          this.configure(tex);
          this.resident.set(target, tex);
          this.retire(target);
          onArrive(tex);
        },
        undefined,
        () => {
          // a rung that will not load is not fatal - the coarser one stays up
          this.pending.delete(target);
        },
      );
    }
    let best: THREE.Texture | null = null;
    let bestRung = -1;
    for (const [r, tex] of this.resident) {
      // prefer the closest rung at or below the target, else the closest above
      const better =
        bestRung < 0 ||
        (r <= target && (bestRung > target || r > bestRung)) ||
        (r > target && bestRung > target && r < bestRung);
      if (better) {
        bestRung = r;
        best = tex;
      }
    }
    return best;
  }

  /** Release rungs far from the one now on screen; holding all of them at 8k
   *  exhausts GPU memory long before it helps anything. */
  private retire(active: number): void {
    if (this.live === active) return;
    this.live = active;
    for (const [r, tex] of [...this.resident]) {
      if (Math.abs(r - active) > 1) {
        tex.dispose();
        this.resident.delete(r);
      }
    }
  }

  dispose(): void {
    for (const tex of this.resident.values()) tex.dispose();
    this.resident.clear();
  }
}
