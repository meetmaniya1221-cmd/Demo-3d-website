/** Non-interactive scene annotations: constellation names and AU ring labels,
 *  projected each frame. Quiet, small, instrument-style. */
import * as THREE from 'three';
import type { SolarSystem } from '../scene/system';
import { LABELED_RINGS_AU } from '../scene/grid';
import { CONSTELLATION_SKY_R } from '../scene/constellations';
import type { AppState } from '../sim/state';

interface Note {
  el: HTMLElement;
  kind: 'constellation' | 'ring';
  dir?: THREE.Vector3; // constellations: direction from camera
  rAU?: number; // rings
}

export class SkyNotes {
  private container: HTMLElement;
  private notes: Note[] = [];
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement, system: SolarSystem) {
    this.container = document.createElement('div');
    this.container.id = 'skynotes';
    this.container.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.container);

    for (const fig of system.constellations.labels) {
      const el = document.createElement('span');
      el.className = 'skynote constellation';
      el.textContent = fig.name;
      el.style.display = 'none';
      this.container.appendChild(el);
      this.notes.push({ el, kind: 'constellation', dir: fig.dir });
    }
    for (const rAU of LABELED_RINGS_AU) {
      const el = document.createElement('span');
      el.className = 'skynote ring';
      el.textContent = `${rAU} AU`;
      el.style.display = 'none';
      this.container.appendChild(el);
      this.notes.push({ el, kind: 'ring', rAU });
    }
  }

  update(system: SolarSystem, camera: THREE.PerspectiveCamera, state: AppState): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    for (const note of this.notes) {
      const show =
        note.kind === 'constellation'
          ? state.layers.constellations && system.constellations.linesVisible
          : state.layers.grid;
      if (!show) {
        note.el.style.display = 'none';
        continue;
      }
      if (note.kind === 'constellation') {
        this.v.copy(note.dir!).multiplyScalar(CONSTELLATION_SKY_R).add(camera.position);
      } else {
        system.grid.labelAnchor(note.rAU!, state.scaleT, this.v);
      }
      this.v.project(camera);
      if (this.v.z > 1 || this.v.x < -1.05 || this.v.x > 1.05 || this.v.y < -1.05 || this.v.y > 1.05) {
        note.el.style.display = 'none';
        continue;
      }
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      note.el.style.display = 'block';
      note.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }
}
