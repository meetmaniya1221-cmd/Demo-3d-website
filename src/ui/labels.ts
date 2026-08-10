/** Screen-space body labels, projected every frame. Clickable — they are the
 *  main way to find planets in true-scale mode, where bodies shrink to dots. */
import * as THREE from 'three';
import { SUN, PLANETS, MOON } from '../data/bodies';
import type { SolarSystem } from '../scene/system';
import type { AppState } from '../sim/state';

interface LabelEntry {
  id: string;
  el: HTMLButtonElement;
  world: THREE.Vector3;
}

export class Labels {
  private entries: LabelEntry[] = [];
  private container: HTMLDivElement;
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement, state: AppState) {
    this.container = document.createElement('div');
    this.container.id = 'labels';
    parent.appendChild(this.container);

    const defs = [SUN, ...PLANETS, MOON];
    for (const def of defs) {
      const el = document.createElement('button');
      el.className = 'body-label';
      el.dataset.body = def.id;
      el.setAttribute('aria-label', `Select ${def.name}`);
      const mark = document.createElement('i');
      mark.className = 'mark';
      mark.style.background = `#${def.color.toString(16).padStart(6, '0')}`;
      el.appendChild(mark);
      el.appendChild(document.createTextNode(def.id === 'moon' ? 'Moon' : def.name));
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        state.select(def.id);
      });
      this.container.appendChild(el);
      this.entries.push({ id: def.id, el, world: new THREE.Vector3() });
    }
  }

  /** @param rightInset pixels on the right edge covered by an open panel */
  update(
    system: SolarSystem,
    camera: THREE.PerspectiveCamera,
    state: AppState,
    rightInset = 0,
  ): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const camPos = camera.position;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

    interface Placed {
      entry: LabelEntry;
      x: number;
      y: number;
      priority: number;
    }
    const candidates: Placed[] = [];

    for (const entry of this.entries) {
      const { el } = entry;
      if (!state.showLabels) {
        el.style.display = 'none';
        continue;
      }
      system.bodyPosition(entry.id, entry.world);
      const distToBody = camPos.distanceTo(entry.world);

      // the Moon's label only appears once you're near the Earth system
      if (entry.id === 'moon') {
        const near =
          state.selectedId === 'moon' ||
          (state.selectedId === 'earth' && distToBody < 40) ||
          distToBody < 12;
        if (!near) {
          el.style.display = 'none';
          continue;
        }
      }

      // apparent size of the body in pixels
      const radius = system.bodyRadius(entry.id, state.scaleT);
      const projR = distToBody > 1e-9 ? (radius / (distToBody * halfTan)) * (h / 2) : h;
      // when the body dominates the view its label is just noise
      if (projR > h * 0.25) {
        el.style.display = 'none';
        continue;
      }

      this.v.copy(entry.world).project(camera);
      if (this.v.z > 1) {
        el.style.display = 'none';
        continue;
      }
      const x = (this.v.x * 0.5 + 0.5) * w;
      // anchor above the body's limb, not its centre
      const y = (-this.v.y * 0.5 + 0.5) * h - Math.min(projR, h * 0.3);
      // never draw a partially clipped label at screen or panel edges
      if (x < 54 || x > w - rightInset - 54 || y < 34 || y > h - 16) {
        el.style.display = 'none';
        continue;
      }
      const priority =
        (state.selectedId === entry.id ? 40000 : 0) +
        (entry.id === 'sun' ? 20000 : 0) -
        distToBody;
      candidates.push({ entry, x, y, priority });
    }

    // greedy declutter: strongest labels claim space, overlapping ones hide
    candidates.sort((a, b) => b.priority - a.priority);
    const kept: Placed[] = [];
    for (const c of candidates) {
      const { el } = c.entry;
      const focused = document.activeElement === el;
      const overlaps =
        !focused && kept.some((k) => Math.abs(k.x - c.x) < 74 && Math.abs(k.y - c.y) < 20);
      if (overlaps) {
        el.style.display = 'none';
        continue;
      }
      kept.push(c);
      el.style.display = 'flex';
      el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) translate(-50%, -100%)`;
      el.classList.toggle('selected', state.selectedId === c.entry.id);
    }
  }
}
