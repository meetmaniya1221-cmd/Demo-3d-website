/**
 * Labels for the neighbouring systems seen as points of light.
 *
 * These are not the same thing as body labels: a body label points at
 * something in the system you are in, whereas these point at somewhere else
 * entirely, and clicking one is a decision to travel several light-years. So
 * they carry the distance from where you are standing - a number that changes
 * when you move, because it is computed from your actual position rather than
 * looked up.
 *
 * They appear only once the point they are attached to is bright enough to see
 * and far enough from the frame's clutter to be worth naming, which in
 * practice means they fade in as you pull back out of a planetary system and
 * the neighbourhood opens up.
 */
import * as THREE from 'three';
import type { Neighbourhood } from '../scene/neighbourhood';
import { LY_PER_PC, SOL_ID } from '../sim/interstellar';
import { STAR_SYSTEMS } from '../data/catalog/starsystems';

interface Entry {
  id: string;
  el: HTMLButtonElement;
  distEl: HTMLElement;
}

export interface SystemLabelHost {
  goToSystem: (id: string) => void;
}

export class SystemLabels {
  private container: HTMLDivElement;
  private entries: Entry[] = [];
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement, host: SystemLabelHost) {
    this.container = document.createElement('div');
    this.container.id = 'system-labels';
    parent.appendChild(this.container);

    const make = (id: string, name: string, color: number) => {
      const el = document.createElement('button');
      el.className = 'star-label';
      el.dataset.system = id;
      el.setAttribute('aria-label', `Travel to ${name}`);
      const mark = document.createElement('i');
      mark.className = 'mark';
      mark.style.background = `#${color.toString(16).padStart(6, '0')}`;
      el.appendChild(mark);
      const nameEl = document.createElement('span');
      nameEl.className = 'name';
      nameEl.textContent = name;
      el.appendChild(nameEl);
      const distEl = document.createElement('span');
      distEl.className = 'dist';
      el.appendChild(distEl);
      el.style.display = 'none';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        host.goToSystem(id);
      });
      this.container.appendChild(el);
      this.entries.push({ id, el, distEl });
    };

    make(SOL_ID, 'The Sun', 0xffc46b);
    for (const sys of STAR_SYSTEMS) make(sys.id, sys.name, sys.color);
  }

  /**
   * @param mapIsSubject true once the camera has pulled back past the Sun's
   *        own Oort cloud, at which point the neighbourhood is what the user
   *        is looking at rather than a backdrop behind a planetary system.
   */
  update(
    neighbourhood: Neighbourhood,
    camera: THREE.PerspectiveCamera,
    visible: boolean,
    mapIsSubject: boolean,
    rightInset = 0,
  ): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const active = neighbourhood.origin;

    interface Placed {
      entry: Entry;
      x: number;
      y: number;
      priority: number;
    }
    const candidates: Placed[] = [];

    for (const entry of this.entries) {
      const info = neighbourhood.entry(entry.id);
      // the system you are standing in has its own body labels; naming it out
      // here as well would just be the same word twice
      if (!visible || !info || entry.id === active) {
        entry.el.style.display = 'none';
        continue;
      }
      // On the sky, only stars you could actually see get named - a label on a
      // magnitude 15 dwarf among the background stars is clutter. Once the map
      // itself is the subject, every system gets its name: out there the faint
      // ones are exactly the ones worth pointing at, and Teegarden's Star at
      // magnitude 15 is not clutter, it is the destination.
      if (!mapIsSubject && info.mag > 9.5) {
        entry.el.style.display = 'none';
        continue;
      }
      this.v.copy(info.drawPos).project(camera);
      if (this.v.z > 1) {
        entry.el.style.display = 'none';
        continue;
      }
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h - 12;
      if (x < 70 || x > w - rightInset - 70 || y < 40 || y > h - 24) {
        entry.el.style.display = 'none';
        continue;
      }
      candidates.push({ entry, x, y, priority: -info.mag * 100 - info.distLy });
    }

    // brightest and nearest win the space, same rule the body labels use
    candidates.sort((a, b) => b.priority - a.priority);
    const kept: Placed[] = [];
    for (const c of candidates) {
      const { el, distEl, id } = c.entry;
      const overlaps = kept.some((k) => Math.abs(k.x - c.x) < 96 && Math.abs(k.y - c.y) < 22);
      if (overlaps) {
        el.style.display = 'none';
        continue;
      }
      kept.push(c);
      const ly = neighbourhood.distanceLy(id);
      distEl.textContent = `${ly.toFixed(2)} ly · ${(ly / LY_PER_PC).toFixed(2)} pc`;
      el.style.display = 'flex';
      el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }
}
