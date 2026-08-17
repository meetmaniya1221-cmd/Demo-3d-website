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
  rank: number;
}

export class SkyNotes {
  private container: HTMLElement;
  private constNotes: ConstNote[] = [];
  private dsoNotes: ConstNote[] = [];
  private gridPool: HTMLElement[] = [];
  private v = new THREE.Vector3();
  private lastPlacedX = 0;
  private lastPlacedY = 0;

  constructor(parent: HTMLElement, system: SolarSystem) {
    this.container = document.createElement('div');
    this.container.id = 'skynotes';
    this.container.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.container);

    // brightest constellations first: with all 88 on the sky, the placement
    // pass below keeps the prominent names when they would collide
    const figs = [...system.constellations.labels].sort((a, b) => a.rank - b.rank);
    for (const fig of figs) {
      const el = document.createElement('span');
      el.className = `skynote constellation rank${fig.rank}`;
      el.textContent = fig.name;
      el.style.display = 'none';
      this.container.appendChild(el);
      this.constNotes.push({ el, dir: fig.dir, rank: fig.rank });
    }
    for (const dso of system.constellations.dsoLabels) {
      const el = document.createElement('span');
      el.className = 'skynote dso';
      el.textContent = dso.name;
      el.style.display = 'none';
      this.container.appendChild(el);
      this.dsoNotes.push({ el, dir: dso.dir, rank: 1 });
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

    // when a selected body fills the frame, sky-sphere names and grid marks
    // would float over its face (the 3D lines behind it are depth-tested out,
    // but these are DOM elements) - suppress them all for the close-up
    let dominated = false;
    if (state.selectedId) {
      const def = system.bodyDef(state.selectedId);
      if (def && def.type !== 'region') {
        system.bodyPosition(state.selectedId, this.v);
        const d = camera.position.distanceTo(this.v);
        const r = system.bodyRadius(state.selectedId, state.scaleT);
        const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        dominated = d > 1e-9 && (r / (d * halfTan)) * (h / 2) > h * 0.35;
      }
    }

    // constellation names ride the sky at optical infinity. 88 of them would
    // pile up, so a placed name blocks its neighbours - prominent figures
    // were sorted first, so they win the space.
    const showConst =
      !dominated && state.layers.constellations && system.constellations.linesVisible;
    const placed: Array<[number, number]> = [];
    for (const note of this.constNotes) {
      if (!showConst) {
        note.el.style.display = 'none';
        continue;
      }
      this.v.copy(note.dir).multiplyScalar(CONSTELLATION_SKY_R).add(camera.position);
      if (!this.place(note.el, camera, w, h)) continue;
      const x = this.lastPlacedX;
      const y = this.lastPlacedY;
      if (placed.some(([px, py]) => Math.abs(px - x) < 96 && Math.abs(py - y) < 26)) {
        note.el.style.display = 'none';
        continue;
      }
      placed.push([x, y]);
    }

    // deep-sky markers ride the same sky sphere behind their own layer
    const showDso = !dominated && state.layers.deepSky && system.constellations.dsoVisible;
    for (const note of this.dsoNotes) {
      if (!showDso) {
        note.el.style.display = 'none';
        continue;
      }
      this.v.copy(note.dir).multiplyScalar(CONSTELLATION_SKY_R).add(camera.position);
      this.place(note.el, camera, w, h);
    }

    // grid annotations: AU ladder up the 0° axis + cardinal degree marks
    let used = 0;
    if (state.layers.grid && !dominated) {
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
