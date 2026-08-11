/** Non-interactive scene annotations: constellation names plus the reference
 *  grid's AU ladder and ecliptic-longitude marks. Projected each frame;
 *  quiet, small, instrument-style. */
import * as THREE from 'three';
import type { SolarSystem } from '../scene/system';
import { CONSTELLATION_SKY_R } from '../scene/constellations';
import type { AppState } from '../sim/state';

interface ConstNote {
  el: HTMLElement;
  dir: THREE.Vector3;
}

export class SkyNotes {
  private container: HTMLElement;
  private constNotes: ConstNote[] = [];
  private gridPool: HTMLElement[] = [];
  private v = new THREE.Vector3();
  private lastPlacedX = 0;
  private lastPlacedY = 0;

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
      this.constNotes.push({ el, dir: fig.dir });
    }
  }

  private gridSpan(i: number): HTMLElement {
    while (this.gridPool.length <= i) {
      const el = document.createElement('span');
      el.style.display = 'none';
      this.container.appendChild(el);
      this.gridPool.push(el);
    }
    return this.gridPool[i];
  }

  update(system: SolarSystem, camera: THREE.PerspectiveCamera, state: AppState): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    // constellation names ride the sky at optical infinity
    const showConst = state.layers.constellations && system.constellations.linesVisible;
    for (const note of this.constNotes) {
      if (!showConst) {
        note.el.style.display = 'none';
        continue;
      }
      this.v.copy(note.dir).multiplyScalar(CONSTELLATION_SKY_R).add(camera.position);
      if (!this.place(note.el, camera, w, h)) continue;
    }

    // grid annotations: AU ladder up the 0° axis + cardinal degree marks
    let used = 0;
    if (state.layers.grid) {
      const states = system.grid.labelStates();
      // explorer compression crowds the outer rings - declutter the ladder
      // by dropping labels that would land within a line-height of the last
      let lastX = -1e9;
      let lastY = -1e9;
      for (const s of states) {
        const el = this.gridSpan(used++);
        this.v.copy(s.world);
        el.className = `skynote ${s.kind === 'au' ? 'ring' : 'deg'}`;
        el.textContent = s.text;
        el.style.opacity = String(s.alpha.toFixed(2));
        const placed = this.place(el, camera, w, h);
        if (!placed) {
          used--;
          continue;
        }
        if (s.kind === 'au') {
          const px = this.lastPlacedX;
          const py = this.lastPlacedY;
          if (Math.abs(px - lastX) < 34 && Math.abs(py - lastY) < 15) {
            el.style.display = 'none';
            used--;
            continue;
          }
          lastX = px;
          lastY = py;
        }
      }
    }
    for (let i = used; i < this.gridPool.length; i++) this.gridPool[i].style.display = 'none';
  }

  /** Project this.v; position el or hide it. Returns true if placed. */
  private place(el: HTMLElement, camera: THREE.PerspectiveCamera, w: number, h: number): boolean {
    this.v.project(camera);
    if (this.v.z > 1 || this.v.x < -1.05 || this.v.x > 1.05 || this.v.y < -1.05 || this.v.y > 1.05) {
      el.style.display = 'none';
      return false;
    }
    const x = (this.v.x * 0.5 + 0.5) * w;
    const y = (-this.v.y * 0.5 + 0.5) * h;
    this.lastPlacedX = x;
    this.lastPlacedY = y;
    el.style.display = 'block';
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    return true;
  }
}
