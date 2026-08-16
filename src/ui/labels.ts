/** Screen-space body labels, projected every frame. Clickable - they are the
 *  main way to find worlds in true-scale mode, where bodies shrink to dots.
 *  Every selectable catalog object gets a label; visibility rules per type
 *  (moons only near their system, asteroids only up close, comets when
 *  active) keep the sky readable. */
import * as THREE from 'three';
import { ALL_OBJECTS } from '../data/catalog';
import type { CatalogObject } from '../data/types';
import type { SolarSystem } from '../scene/system';
import type { AppState } from '../sim/state';

interface LabelEntry {
  def: CatalogObject;
  el: HTMLButtonElement;
  world: THREE.Vector3;
}

const TYPE_PRIORITY: Record<string, number> = {
  star: 20000,
  planet: 10000,
  moon: 6000,
  dwarf: 4000,
  tno: 3600,
  comet: 3000,
  asteroid: 2000,
};

export class Labels {
  private entries: LabelEntry[] = [];
  private container: HTMLDivElement;
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement, state: AppState) {
    this.container = document.createElement('div');
    this.container.id = 'labels';
    parent.appendChild(this.container);

    for (const def of ALL_OBJECTS) {
      if (def.type === 'region') continue;
      const el = document.createElement('button');
      el.className = `body-label${def.type === 'star' || def.type === 'planet' ? '' : ' minor'}`;
      el.dataset.body = def.id;
      el.setAttribute('aria-label', `Select ${def.name}`);
      const mark = document.createElement('i');
      mark.className = 'mark';
      mark.style.background = `#${def.color.toString(16).padStart(6, '0')}`;
      el.appendChild(mark);
      el.appendChild(
        document.createTextNode(def.id === 'moon' ? 'Moon' : def.name),
      );
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        state.select(def.id);
      });
      el.style.display = 'none';
      this.container.appendChild(el);
      this.entries.push({ def, el, world: new THREE.Vector3() });
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

    // when the selected body fills the frame, faraway labels would float
    // over its surface - restrict labelling to its own neighbourhood
    let dominantSystem: string | null = null;
    if (state.selectedId) {
      const selEntry = this.entries.find((e) => e.def.id === state.selectedId);
      if (selEntry) {
        system.bodyPosition(selEntry.def.id, selEntry.world);
        const d = camPos.distanceTo(selEntry.world);
        const r = system.bodyRadius(selEntry.def.id, state.scaleT);
        if (d > 1e-9 && (r / (d * halfTan)) * (h / 2) > h * 0.42) {
          // a moon's neighbourhood is its parent's system; a planet's is its
          // own (falling back through `parent` would name the Sun and let
          // every heliocentric label float over the close-up)
          dominantSystem =
            selEntry.def.type === 'moon'
              ? (selEntry.def.parent ?? selEntry.def.id)
              : selEntry.def.id;
        }
      }
    }

    for (const entry of this.entries) {
      if (dominantSystem) {
        const inSystem =
          entry.def.id === state.selectedId ||
          entry.def.parent === dominantSystem ||
          entry.def.id === dominantSystem ||
          entry.def.parent === state.selectedId;
        if (!inSystem) {
          entry.el.style.display = 'none';
          continue;
        }
      }
      const { el, def } = entry;
      if (!state.showLabels || !system.labelVisible(def.id, camPos, state.selectedId, state.scaleT)) {
        el.style.display = 'none';
        continue;
      }
      system.bodyPosition(def.id, entry.world);
      const distToBody = camPos.distanceTo(entry.world);

      // apparent size of the body in pixels
      const radius = system.bodyRadius(def.id, state.scaleT);
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
        (state.selectedId === def.id ? 40000 : 0) +
        (TYPE_PRIORITY[def.type] ?? 0) -
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
      el.classList.toggle('selected', state.selectedId === c.entry.def.id);
    }
  }
}
