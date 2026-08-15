/**
 * The scientific discovery loop: SCAN → ANALYZE → CLASSIFY → RECORD.
 *
 * A scan sweeps a radius around the ship, picks up procedural stars (whose
 * seeded identities make them the *same* stars every session), landmarks,
 * and the black hole itself, runs a short analysis, then files anything new
 * into a persistent survey log (localStorage). The log distinguishes
 * catalogued objects (real astronomy, with their published names) from
 * survey objects (procedurally generated, with GSC designations).
 */
import type { ChunkStar } from './chunks';
import type { Landmark } from './model';
import { Vec3d, fmtLy } from './units';

const DB_KEY = 'orrery-galaxy-log-v1';

export type DiscoveryKind =
  | 'star'
  | 'black-hole'
  | 'nebula'
  | 'cluster'
  | 'galaxy'
  | 'region';

export interface DiscoveryEntry {
  id: string;
  name: string;
  kind: DiscoveryKind;
  /** Spectral class or object classification string. */
  cls: string;
  pos: { x: number; y: number; z: number };
  /** Sim date (days since J2000) when recorded. */
  simDays: number;
  /** Real catalogued object vs procedural survey object. */
  real: boolean;
}

export interface ScanResult {
  fresh: DiscoveryEntry[];
  known: number;
}

export class DiscoveryLog {
  private entries = new Map<string, DiscoveryEntry>();
  private dirty = false;

  constructor() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        for (const e of JSON.parse(raw) as DiscoveryEntry[]) this.entries.set(e.id, e);
      }
    } catch {
      // storage unavailable or corrupt - run with an in-memory log
    }
  }

  get count(): number {
    return this.entries.size;
  }

  all(): DiscoveryEntry[] {
    return [...this.entries.values()].sort((a, b) => b.simDays - a.simDays);
  }

  countsByKind(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries.values()) out[e.kind] = (out[e.kind] ?? 0) + 1;
    return out;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * Run a scan. Radius scales with what a survey instrument could plausibly
   * separate: nearby individual stars, plus bright landmarks much farther.
   */
  scan(
    shipPos: Vec3d,
    simDays: number,
    stars: ChunkStar[],
    landmarks: Landmark[],
  ): ScanResult {
    const fresh: DiscoveryEntry[] = [];
    let known = 0;

    const record = (e: DiscoveryEntry) => {
      if (this.entries.has(e.id)) {
        known++;
        return;
      }
      this.entries.set(e.id, e);
      fresh.push(e);
      this.dirty = true;
    };

    // individual stars: the nearest dozen within 25 ly
    for (const s of stars.slice(0, 12)) {
      if (s.pos.distanceTo(shipPos) > 25) break;
      record({
        id: `star:${s.designation}`,
        name: s.designation,
        kind: 'star',
        cls: `${s.cls}-type ${s.cls === 'WD' ? 'white dwarf' : 'star'}`,
        pos: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
        simDays,
        real: false,
      });
    }

    // landmarks: reachable when within ~40× their radius (bright and big)
    for (const lm of landmarks) {
      const d = lm.pos.distanceTo(shipPos);
      const reach = Math.max(lm.radiusLy * 40, lm.id === 'sgra' ? 60 : 25);
      if (d > reach) continue;
      record({
        id: `lm:${lm.id}`,
        name: lm.name,
        kind: lm.kind as DiscoveryKind,
        cls:
          lm.kind === 'black-hole'
            ? 'Supermassive black hole'
            : lm.kind === 'cluster'
              ? 'Globular cluster'
              : lm.kind === 'nebula'
                ? 'Star-forming region'
                : lm.kind === 'galaxy'
                  ? 'Satellite galaxy'
                  : 'Region',
        pos: { x: lm.pos.x, y: lm.pos.y, z: lm.pos.z },
        simDays,
        real: lm.real,
      });
    }

    this.persist();
    return { fresh, known };
  }

  private persist(): void {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      localStorage.setItem(DB_KEY, JSON.stringify([...this.entries.values()]));
    } catch {
      // storage full/unavailable - the in-memory log still works
    }
  }
}

// ------------------------------------------------------------------ panel --

const KIND_ICONS: Record<string, string> = {
  star: '✦',
  'black-hole': '●',
  nebula: '☁',
  cluster: '✳',
  galaxy: '✺',
  region: '▣',
};

/** The survey-log overlay: a list of everything recorded so far. */
export class DiscoveryPanel {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private open = false;

  constructor(parent: HTMLElement, private log: DiscoveryLog, private shipPos: () => Vec3d) {
    this.root = document.createElement('div');
    this.root.className = 'gx-panel gx-log';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Survey log');
    this.root.innerHTML = `
      <div class="gx-panel-head">
        <b>SURVEY LOG</b>
        <span class="gx-log-count"></span>
        <button class="gx-close" aria-label="Close survey log">×</button>
      </div>
      <div class="gx-panel-body"></div>
    `;
    this.body = this.root.querySelector('.gx-panel-body')!;
    this.root.querySelector('.gx-close')!.addEventListener('click', () => this.close());
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.root.classList.add('open');
    this.render();
  }

  close(): void {
    this.open = false;
    this.root.classList.remove('open');
  }

  private render(): void {
    const entries = this.log.all();
    const counts = this.log.countsByKind();
    this.root.querySelector('.gx-log-count')!.textContent =
      `${entries.length} recorded · ${Object.entries(counts)
        .map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`)
        .join(' · ')}`;
    if (entries.length === 0) {
      this.body.innerHTML =
        '<div class="gx-log-empty">Nothing recorded yet. Fly somewhere interesting and press <kbd>V</kbd> to scan.</div>';
      return;
    }
    const ship = this.shipPos();
    const pos = new Vec3d();
    this.body.innerHTML = entries
      .map((e) => {
        pos.set(e.pos.x, e.pos.y, e.pos.z);
        const d = pos.distanceTo(ship);
        return `<div class="gx-log-row">
          <span class="gx-log-icon">${KIND_ICONS[e.kind] ?? '·'}</span>
          <span class="gx-log-name">${e.name}${e.real ? '' : ' <i>(survey)</i>'}</span>
          <span class="gx-log-cls">${e.cls}</span>
          <span class="gx-log-dist">${fmtLy(d)}</span>
        </div>`;
      })
      .join('');
  }
}
