/** Central app state with a tiny event emitter - the single source of truth
 *  that both the 3D scene and the DOM UI observe. */
import { daysSinceJ2000 } from '../data/bodies';

export type ScaleMode = 'explorer' | 'true';

/** Togglable visualization layers. Defaults give a clean first impression:
 *  Sun + planets + orbits + a subtle sky; the deep catalog is opt-in. */
export interface Layers {
  planets: boolean;
  planetOrbits: boolean;
  moons: boolean;
  dwarfs: boolean; // dwarf planets + TNOs
  asteroids: boolean; // named asteroids
  comets: boolean;
  beltDust: boolean; // aggregated asteroid/Kuiper belt particles
  labels: boolean;
  constellations: boolean;
  grid: boolean;
  distanceScale: boolean;
  habitableZone: boolean;
}

export const DEFAULT_LAYERS: Layers = {
  planets: true,
  planetOrbits: true,
  moons: true,
  dwarfs: false,
  asteroids: false,
  comets: false,
  beltDust: true,
  labels: true,
  constellations: true,
  grid: true,
  distanceScale: true,
  habitableZone: false,
};

export type LayerKey = keyof Layers;

export interface SpeedPreset {
  daysPerSec: number;
  label: string;
}

export const SPEED_PRESETS: SpeedPreset[] = [
  { daysPerSec: 1 / 86_400, label: 'Real time' },
  { daysPerSec: 1 / 1_440, label: '1 min / s' },
  { daysPerSec: 1 / 24, label: '1 hour / s' },
  { daysPerSec: 1, label: '1 day / s' },
  { daysPerSec: 7, label: '1 week / s' },
  { daysPerSec: 30.44, label: '1 month / s' },
  { daysPerSec: 365.25, label: '1 year / s' },
];

export const DEFAULT_SPEED_INDEX = 3;

type Events = {
  select: string | null;
  speed: number; // preset index
  pause: boolean;
  scale: ScaleMode;
  toggles: void;
  layers: void;
  timejump: void;
  direction: 1 | -1; // time flowing forward or in rewind
  tour: number | null; // step index or null = tour ended
};

type Handler<T> = (payload: T) => void;

export class AppState {
  simDays = daysSinceJ2000(Date.now());
  speedIndex = DEFAULT_SPEED_INDEX;
  /** +1 = forward, -1 = rewind; multiplies the active speed preset. */
  direction: 1 | -1 = 1;
  paused = false;
  scaleMode: ScaleMode = 'explorer';
  /** Animated 0→1 blend toward true scale; owned by the render loop. */
  scaleT = 0;
  selectedId: string | null = null;
  showOrbits = true;
  showLabels = true;
  showHZ = false;
  layers: Layers = { ...DEFAULT_LAYERS };
  tourStep: number | null = null;

  private handlers: { [K in keyof Events]?: Array<Handler<Events[K]>> } = {};

  on<K extends keyof Events>(event: K, fn: Handler<Events[K]>): () => void {
    const list = (this.handlers[event] ??= []) as Array<Handler<Events[K]>>;
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  private emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers[event]?.slice().forEach((fn) => fn(payload));
  }

  get speed(): SpeedPreset {
    return SPEED_PRESETS[this.speedIndex];
  }

  /** Advance simulation time by real elapsed seconds. */
  tick(dtSec: number): void {
    if (!this.paused) this.simDays += this.direction * this.speed.daysPerSec * dtSec;
  }

  setDirection(dir: 1 | -1): void {
    if (this.direction === dir) return;
    this.direction = dir;
    this.emit('direction', dir);
  }

  select(id: string | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.emit('select', id);
  }

  setSpeedIndex(i: number): void {
    const clamped = Math.min(SPEED_PRESETS.length - 1, Math.max(0, i));
    if (clamped === this.speedIndex) return;
    this.speedIndex = clamped;
    this.emit('speed', clamped);
  }

  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    this.emit('pause', p);
  }

  setScaleMode(mode: ScaleMode): void {
    if (this.scaleMode === mode) return;
    this.scaleMode = mode;
    this.emit('scale', mode);
  }

  setToggle(key: 'showOrbits' | 'showLabels' | 'showHZ', value: boolean): void {
    if (this[key] === value) return;
    this[key] = value;
    // legacy toggles mirror into the layer system
    if (key === 'showOrbits') this.layers.planetOrbits = value;
    if (key === 'showLabels') this.layers.labels = value;
    if (key === 'showHZ') this.layers.habitableZone = value;
    this.emit('toggles', undefined);
    this.emit('layers', undefined);
  }

  setLayer(key: LayerKey, value: boolean): void {
    if (this.layers[key] === value) return;
    this.layers[key] = value;
    // keep the legacy flags coherent for older call sites
    if (key === 'planetOrbits') this.showOrbits = value;
    if (key === 'labels') this.showLabels = value;
    if (key === 'habitableZone') this.showHZ = value;
    this.emit('layers', undefined);
    this.emit('toggles', undefined);
  }

  jumpToNow(): void {
    this.simDays = daysSinceJ2000(Date.now());
    this.setDirection(1);
    this.emit('timejump', undefined);
  }

  /** Time machine: jump the simulation to an absolute date (Unix epoch ms).
   *  Always use this rather than writing simDays directly, so listeners
   *  (HUD clock, announcements) hear about the jump. */
  setSimDate(msEpoch: number): void {
    if (!Number.isFinite(msEpoch)) return;
    this.simDays = daysSinceJ2000(msEpoch);
    this.emit('timejump', undefined);
  }

  setTourStep(step: number | null): void {
    this.tourStep = step;
    this.emit('tour', step);
  }
}
