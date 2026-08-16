/**
 * First-person spacecraft exploration mode.
 *
 * This is not a second universe. It is a different observer inside the one the
 * app already renders: the same Sun, the same Kepler orbits, the same textures,
 * the same LOD and instancing. The only things that change on entry are which
 * camera is driving and that the world is pinned to TRUE scale, where a scene
 * unit is a fixed 1,495,978.707 km and apparent size is nothing more than
 * radius over distance. Nothing is enlarged to look good; the Sun really does
 * shrink to a point by the time you reach Neptune, and Saturn's rings really do
 * fill the windows when you get close, because both follow from the geometry.
 *
 * Three things are layered on top for this observer:
 *   - a cockpit, drawn in its own pass (see cockpit.ts);
 *   - naked-eye point rendering for bodies that are genuinely sub-pixel from
 *     where the ship is (see scene/nakedeye.ts);
 *   - a dynamic near plane, because standing 130 km off Earth's cloud tops and
 *     looking at Neptune is a depth range no fixed frustum survives.
 */
import * as THREE from 'three';
import type { AppState, LayerKey, Layers, ScaleMode } from '../sim/state';
import type { SolarSystem } from '../scene/system';
import { NakedEyeBodies } from '../scene/nakedeye';
import { catalogObject } from '../data/catalog';
import { Cockpit } from './cockpit';
import { Ship, THROTTLE_STEPS, type AttitudeHold } from './ship';
import { TrajectoryPreview } from './trajectory';
import {
  KM_PER_UNIT,
  UNITS_PER_AU,
  bodyExtentTrue,
  bodyPositionTrue,
  bodyRadiusKm,
  bodyRadiusTrue,
  minSafeDistance,
  nearestBodies,
  regionOf,
  type Neighbour,
} from './ephemeris';
import { SpacecraftUI, type Telemetry } from '../ui/spacecraftui';
import { InterstellarCruise, type CruiseTelemetry } from './interstellar';
import { SOL_ID, positionLyOf } from '../sim/interstellar';
import { travelKind, wormholeDuration } from '../sim/travel';
import { primaryStar, starSystem } from '../data/catalog/starsystems';

export interface SpacecraftDeps {
  state: AppState;
  system: SolarSystem;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** Hand the camera over / take it back from the orbit rig. */
  releaseCamera: () => void;
  resumeCamera: (target: THREE.Vector3) => void;
  /** Fly back to the system overview instead of the saved camera. */
  focusOverview: () => void;
  announce: (text: string) => void;
}

const ENTRY_SECONDS = 2.1;
const EXIT_SECONDS = 0.75;
/** Bodies below this projected size hand over to the point renderer. */
const DISC_PIXELS = 2.6;

const REDUCED_MOTION =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Number-key shortcuts to the bearings a pilot reaches for most. These are
 * conveniences, not the set of directions the seat can face - the head turns
 * continuously through all 360°, and every bearing between these has glass.
 */
const LOOK_PRESETS: Record<string, [number, number]> = {
  '1': [0, 0],      // ahead
  '2': [90, 0],     // starboard
  '3': [-90, 0],    // port
  '4': [0, 80],     // overhead
  '5': [0, -78],    // floor port
  '6': [180, 0],    // astern
};

/** Manoeuvre-axis holds on the number keys above the window presets. */
const HOLD_KEYS: Record<string, AttitudeHold> = {
  '6': 'prograde',
  '7': 'retrograde',
  '8': 'radial-out',
  '9': 'radial-in',
  '0': 'normal',
};

type Phase = 'off' | 'entering' | 'flying' | 'exiting';

export class SpacecraftMode {
  readonly ship = new Ship();
  private deps: SpacecraftDeps;
  private cockpit = new Cockpit();
  private nakedEye = new NakedEyeBodies();
  private trajectory = new TrajectoryPreview();
  private ui: SpacecraftUI;
  private veil: HTMLElement;
  /** The interstellar leg. Same universe, same clock, real distances. */
  private cruise = new InterstellarCruise();
  /** Star system the navigation computer is aimed at, if any. */
  private starTargetId: string | null = null;

  phase: Phase = 'off';
  /** Spacecraft mode owns the explorer↔true-scale blend while it is running. */
  scaleT = 0;
  /** True while entering or leaving, so the app can stay quiet about it. */
  get busy(): boolean {
    return this.phase === 'entering' || this.phase === 'exiting' || this.restoring;
  }
  private restoring = false;

  get active(): boolean {
    return this.phase !== 'off';
  }

  private fov = 52;
  private navOverlay = false;
  private t = 0; // transition progress, 0..1
  /** Wall-clock start of the current transition. The render loop clamps its own
   *  delta to keep the simulation stable when frames are slow, which would
   *  stretch a 2 s cinematic into ten on a struggling machine - so the entry and
   *  exit are timed off the clock instead. */
  private transitionStart = 0;
  private restoreOverview = false;
  private entryFrom = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scaleT: 0 };
  private saved: {
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    target: THREE.Vector3;
    fov: number;
    near: number;
    far: number;
    scaleMode: ScaleMode;
    layers: Layers;
  } | null = null;

  private keys = new Set<string>();
  private dragging = false;
  private pointerId = -1;
  private lastPointer = { x: 0, y: 0 };
  private touches = new Map<number, { x: number; y: number }>();
  private pinchStart = 0;
  private pinchFov = 52;
  private neighbours: Neighbour[] = [];
  private region = regionOf(new THREE.Vector3(), 0);
  private slowTimer = 0;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private headQ = new THREE.Quaternion();
  private bound = {
    down: (e: PointerEvent) => this.onPointerDown(e),
    move: (e: PointerEvent) => this.onPointerMove(e),
    up: (e: PointerEvent) => this.onPointerUp(e),
    wheel: (e: WheelEvent) => this.onWheel(e),
    keyup: (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase()),
    blur: () => this.keys.clear(),
  };

  constructor(root: HTMLElement, deps: SpacecraftDeps) {
    this.deps = deps;
    this.veil = document.createElement('div');
    this.veil.className = 'sc-veil';
    root.appendChild(this.veil);

    this.ui = new SpacecraftUI(root, {
      onExit: () => this.exit(),
      onSelectTarget: (id) => this.selectTarget(id),
      onTravel: (closeness) => this.withTarget((id) => this.beginTransit(id, closeness)),
      onOrbit: () => this.withTarget((id) => this.ship.startOrbit(id, this.simDays)),
      onFlyby: () => this.withTarget((id) => this.ship.startFlyby(id, this.simDays)),
      onFollow: () => this.withTarget((id) => this.ship.startFollow(id, this.simDays)),
      onAbort: () => this.ship.abort(),
      onThrottle: (i) => this.ship.setThrottleIndex(i),
      onBrake: () => this.ship.nudgeThrottle(-1),
      onAccel: () => this.ship.nudgeThrottle(1),
      onTime: (i) => this.ship.setTimeIndex(i),
      onStop: () => this.ship.fullStop(),
      onPause: () => {
        this.ship.paused = !this.ship.paused;
      },
      onFov: (deg) => {
        this.fov = deg;
      },
      onNavOverlay: (on) => this.setNavOverlay(on),
      onLookPreset: (y, p) => this.ship.lookPreset(y, p),
      onGazeLock: (on) => {
        this.ship.gazeLock = on;
      },
      onAlign: () => this.ship.alignHullToGaze(),
      onHold: (hold) => {
        this.ship.setHold(hold);
        this.flushShipEvent();
      },
      onReleaseOrbit: () => {
        this.ship.releaseOrbit();
        this.flushShipEvent();
      },
      onSelectStar: (id) => this.setInterstellarTarget(id),
      onCruiseSpeed: (i) => {
        this.cruise.setCruiseIndex(i);
        this.ui.announce(
          `Cruise velocity set to ${(this.cruise.fractionC * 100).toFixed(0)}% of light speed.`,
        );
      },
      onLaunchInterstellar: () => this.startInterstellarCruise(),
      onAbortInterstellar: () => this.abortInterstellarCruise(),
    });
  }

  private get simDays(): number {
    return this.deps.state.simDays;
  }

  private withTarget(fn: (id: string) => void): void {
    if (!this.ship.targetId) {
      this.ui.announce('Select a target first.');
      return;
    }
    fn(this.ship.targetId);
    this.flushShipEvent();
  }

  // ------------------------------------------------------------ enter/exit --

  enter(opts: { restoreOverview?: boolean } = {}): void {
    if (this.active) return;
    this.restoreOverview = !!opts.restoreOverview;
    const { camera, state, system } = this.deps;
    this.saved = {
      pos: camera.position.clone(),
      quat: camera.quaternion.clone(),
      target: new THREE.Vector3(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      scaleMode: state.scaleMode,
      layers: { ...state.layers },
    };
    this.deps.releaseCamera();
    camera.clearViewOffset();

    this.entryFrom.pos.copy(camera.position);
    this.entryFrom.quat.copy(camera.quaternion);
    this.entryFrom.scaleT = state.scaleT;
    this.scaleT = state.scaleT;

    this.phase = 'entering';
    this.t = 0;
    this.transitionStart = performance.now();
    state.setScaleMode('true');

    // the cabin is a real place, so keep the sky honest: no orbit lines, no
    // reference grid, no constellation figures unless the pilot asks for them
    this.applyLayers({ grid: false, planetOrbits: false, constellations: false });
    system.scene.add(this.nakedEye.points);
    system.scene.add(this.trajectory.group);
    this.nakedEye.setEnabled(true);

    if (this.ship.unplaced) {
      // board wherever the explorer was standing: Earth at home, the host star
      // when the camera is already parked at another system
      const here = starSystem(system.activeSystemId);
      const anchorId = here ? primaryStar(here).id : 'earth';
      this.ship.placeNear(anchorId, state.simDays, here ? 3.2 : 2.4);
      this.ship.targetId = anchorId;
    } else {
      // returning pilot: same place, same target, engines idle so re-entering
      // never launches you off at whatever throttle you left set
      this.ship.idle();
    }
    this.ensureTargetVisible(this.ship.targetId);

    document.body.classList.add('spacecraft-mode');
    this.ui.show();
    this.attachInput();
    this.veil.classList.add('on');
    this.deps.announce(
      'Spacecraft mode. You are in the cockpit at true scale, with glass all round. Drag to look anywhere, including astern; W and S for the main engine, Escape to leave.',
    );
    if (REDUCED_MOTION) this.t = 1;
  }

  exit(): void {
    if (!this.active || this.phase === 'exiting') return;
    this.phase = 'exiting';
    this.t = 0;
    this.transitionStart = performance.now();
    this.veil.classList.add('on');
    this.ui.hide();
    if (REDUCED_MOTION) this.finishExit();
  }

  private finishExit(): void {
    const { camera, state, system } = this.deps;
    system.wormhole.abort();
    const s = this.saved;
    this.phase = 'off';
    // the scale-mode and layer restores below fire app-level notifications;
    // someone stepping out of the cockpit does not need to be told about them
    this.restoring = true;
    this.detachInput();
    this.keys.clear();
    document.body.classList.remove('spacecraft-mode');
    this.veil.classList.remove('on');
    // the transition writes opacity inline, which outranks the stylesheet -
    // leaving it set painted the explorer view black after every exit
    this.veil.style.opacity = '0';

    // put the world back exactly as it was
    this.nakedEye.setEnabled(false);
    system.scene.remove(this.nakedEye.points);
    this.trajectory.setVisible(false);
    system.scene.remove(this.trajectory.group);
    system.sun.setDiscVisible(true);
    system.sun.setObserver(1, false);
    for (const p of system.planets.values()) {
      p.setDiscVisible(true);
      p.setRingDetail(0);
    }
    if (s) {
      camera.position.copy(s.pos);
      camera.quaternion.copy(s.quat);
      camera.fov = s.fov;
      camera.near = s.near;
      camera.far = s.far;
      camera.updateProjectionMatrix();
      state.setScaleMode(s.scaleMode);
      this.scaleT = state.scaleT;
      for (const key of Object.keys(s.layers) as LayerKey[]) {
        state.setLayer(key, s.layers[key]);
      }
      this.deps.resumeCamera(s.target);
    }
    // entering mid-tour or mid-journey means the saved camera was parked
    // wherever that sequence happened to be, which is rarely a view worth
    // coming back to - drop the pilot at the overview instead
    if (this.restoreOverview) this.deps.focusOverview();
    this.saved = null;
    this.restoring = false;
    this.deps.announce('Left the spacecraft. Back in the Solar System explorer.');
  }

  private applyLayers(patch: Partial<Layers>): void {
    for (const [k, v] of Object.entries(patch)) {
      this.deps.state.setLayer(k as LayerKey, v as boolean);
    }
  }

  private setNavOverlay(on: boolean): void {
    this.navOverlay = on;
    this.applyLayers({ grid: on, planetOrbits: on, constellations: on });
  }

  /** Targeting a body whose category layer is off would fly you to nothing. */
  private ensureTargetVisible(id: string | null): void {
    const def = id ? catalogObject(id) : undefined;
    if (!def) return;
    const key: LayerKey | null =
      def.type === 'dwarf' || def.type === 'tno'
        ? 'dwarfs'
        : def.type === 'asteroid'
          ? 'asteroids'
          : def.type === 'comet'
            ? 'comets'
            : def.type === 'moon'
              ? 'moons'
              : null;
    if (key && !this.deps.state.layers[key]) this.applyLayers({ [key]: true });
  }

  /**
   * Start a run to a body in this system, with the transition if it earns one.
   *
   * The distinction is the distance and nothing else. A hop to a moon is a few
   * hundred thousand kilometres and the autopilot has always handled it
   * cleanly; Earth to Saturn is 8.5 AU, which at 400 km/s is a hundred and
   * seventeen days of nothing at all. The second one gets the wormhole - over
   * the top of the same flight, not instead of it. The ship still covers every
   * kilometre, the clock still advances by the real flight time, and the HUD
   * still shows the velocity and the compression as separate numbers.
   */
  private beginTransit(id: string, closeness: number): void {
    const { state } = this.deps;
    bodyPositionTrue(id, state.simDays, this.tmpA);
    const distAU = this.ship.pos.distanceTo(this.tmpA) / UNITS_PER_AU;
    const kind = travelKind(distAU);
    const effects = state.travelEffects;

    if (kind !== 'long' || effects === 'off') {
      // short and medium runs are exactly what they always were
      this.ship.startTransit(id, state.simDays, closeness);
      return;
    }

    // A long haul is flown faster, the way a pilot would fly one: the clock's
    // compression tops out at a million to one, so on its own an eight-AU run
    // at the default 50 km/s still takes half a minute of real time. Commanding
    // a higher cruise is the other knob, and it is the honest one - the HUD
    // shows the new velocity, and the flight time it implies (weeks, not
    // seconds) is what the event line reports.
    const seconds = wormholeDuration(effects);
    const runKm = distAU * 149_597_870.7;
    const wantKms = runKm / (1e6 * seconds * 0.6);
    let idx = this.ship.throttleIndex;
    while (idx < THROTTLE_STEPS.length - 1 && THROTTLE_STEPS[idx] < wantKms) idx += 1;
    if (idx > this.ship.throttleIndex) this.ship.setThrottleIndex(idx);
    this.ship.startTransit(id, state.simDays, closeness, seconds * 0.62);
    this.armWormhole(id, seconds);
  }

  /** Point the sequence at a body in this system and run it. */
  private armWormhole(targetId: string, seconds: number): void {
    const { state, system } = this.deps;
    bodyPositionTrue(targetId, state.simDays, this.tmpA);
    this.tmpB.copy(this.tmpA).sub(this.ship.pos);
    this.ship.faceDirection(this.tmpB);
    system.wormhole.start(this.tmpB, {
      duration: seconds,
      // hold the throat shut until the autopilot has actually arrived, so the
      // opening always reveals the ship where it really is
      hold: () => this.ship.mode === 'transit',
      maxHold: 40,
    });
  }

  // ------------------------------------------------------- interstellar leg --

  /** Aim the navigation computer at another star system, without launching. */
  setInterstellarTarget(systemId: string): void {
    if (this.cruise.active) return;
    if (systemId === this.deps.system.activeSystemId) {
      this.starTargetId = null;
      this.ui.announce('Already in that system.');
      return;
    }
    this.starTargetId = systemId;
    const name = systemId === SOL_ID ? 'the Solar System' : (starSystem(systemId)?.name ?? systemId);
    const ly = positionLyOf(systemId).distanceTo(positionLyOf(this.deps.system.activeSystemId));
    const years = ly / this.cruise.fractionC;
    this.ui.announce(
      `Interstellar target: ${name}. ${ly.toFixed(2)} light-years - ${years.toFixed(0)} years at ${(this.cruise.fractionC * 100).toFixed(0)}% of light speed.`,
    );
    this.deps.announce(`Interstellar target set to ${name}, ${ly.toFixed(2)} light-years away.`);
  }

  /**
   * Leave for another star. Everything local is released first: an orbit or a
   * follow is attached to a body that is about to be light-years behind.
   */
  startInterstellarCruise(): void {
    if (this.cruise.active || !this.starTargetId) {
      if (!this.starTargetId) this.ui.announce('Select a star system first.');
      return;
    }
    const from = this.deps.system.activeSystemId;
    this.ship.fullStop();
    this.ship.abort();
    this.cruise.start(from, this.starTargetId);
    if (!this.cruise.active) return;
    const t = this.cruise.telemetry();

    // Look where we are going. updateCruise faces the hull down the line every
    // frame, but the gaze lock would otherwise keep the head turned back
    // toward whatever the ship was station-keeping at - which, on departure,
    // is exactly astern.
    this.ship.gazeLock = false;
    this.cruise.heading(this.tmpB);

    if (this.deps.state.travelEffects !== 'off') {
      // aimed down the real line between the two stars; the throat is shut
      // while the scene's origin changes hands at the midpoint
      this.deps.system.wormhole.start(this.tmpB, {
        duration: 16,
        hold: () => this.cruise.active,
        maxHold: 60,
      });
    }
    this.ui.announce(
      `Departing. ${t.totalLy.toFixed(2)} light-years at ${(t.fractionC * 100).toFixed(0)}% of light speed - a ${t.totalYears.toFixed(0)}-year crossing, compressed ${t.compression.toExponential(1)}×.`,
    );
    this.deps.announce('Interstellar cruise under way.');
  }

  /** Stop between the stars. The ship stays wherever it has got to. */
  abortInterstellarCruise(): void {
    if (!this.cruise.active) return;
    this.cruise.abort();
    this.deps.system.wormhole.abort();
    this.ui.announce('Cruise held. The ship is between stars.');
  }

  /**
   * Drive the crossing: move the ship along the real line, hand the scene's
   * origin over at the midpoint, and park at the destination star on arrival.
   */
  private updateCruise(dt: number): void {
    const { state, system } = this.deps;
    const wasActive = this.cruise.active;
    const simSeconds = this.cruise.advance(dt);
    state.simDays += simSeconds / 86_400;

    // Halfway across, both stars are equally far off and neither is more than
    // a point. That is the moment to move the origin - the ship's position is
    // held in absolute light-years, so nothing on screen jumps.
    if (this.cruise.pastMidpoint && system.activeSystemId !== this.cruise.destination) {
      system.setActiveSystem(this.cruise.destination);
    }

    this.cruise.scenePosition(system.activeSystemId, 1, this.tmpA);
    this.ship.pos.copy(this.tmpA);
    // point the hull along the line of travel so the destination is ahead
    this.cruise.heading(this.tmpB);
    this.ship.faceDirection(this.tmpB);
    if (system.wormhole.active) system.wormhole.setAxis(this.tmpB);

    if (wasActive && !this.cruise.active) this.arriveInterstellar();
  }

  private arriveInterstellar(): void {
    this.deps.system.wormhole.abort();
    const { system, state } = this.deps;
    const destination = this.cruise.destination;
    if (system.activeSystemId !== destination) system.setActiveSystem(destination);
    const sys = starSystem(destination);
    const anchorId = sys ? primaryStar(sys).id : 'sun';
    this.ship.placeNear(anchorId, state.simDays, 3.2);
    this.ship.targetId = anchorId;
    this.ship.gazeLock = true;
    this.starTargetId = null;
    const name = sys?.name ?? 'the Solar System';
    this.ui.announce(`Arrived at ${name}. Engines idle.`);
    this.deps.announce(`Arrived at ${name}.`);
  }

  private selectTarget(id: string): void {
    this.ship.targetId = id;
    this.ship.gazeLock = true;
    this.ensureTargetVisible(id);
    const name = catalogObject(id)?.name ?? id;
    this.ui.announce(`Target set: ${name}.`);
    this.deps.announce(`Navigation target set to ${name}.`);
  }

  // ---------------------------------------------------------------- input --

  private attachInput(): void {
    const c = this.deps.canvas;
    c.addEventListener('pointerdown', this.bound.down);
    window.addEventListener('pointercancel', this.bound.up);
    window.addEventListener('pointermove', this.bound.move);
    window.addEventListener('pointerup', this.bound.up);
    window.addEventListener('pointercancel', this.bound.up);
    c.addEventListener('wheel', this.bound.wheel, { passive: false });
    window.addEventListener('keyup', this.bound.keyup);
    window.addEventListener('blur', this.bound.blur);
  }

  private detachInput(): void {
    const c = this.deps.canvas;
    c.removeEventListener('pointerdown', this.bound.down);
    window.removeEventListener('pointermove', this.bound.move);
    window.removeEventListener('pointerup', this.bound.up);
    window.removeEventListener('pointercancel', this.bound.up);
    c.removeEventListener('wheel', this.bound.wheel);
    window.removeEventListener('keyup', this.bound.keyup);
    window.removeEventListener('blur', this.bound.blur);
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.phase !== 'flying') return;
    // a press that lands on an instrument is for the instrument, not the view
    if ((e.target as HTMLElement | null)?.closest('.sc-hud button, .sc-hud input, .sc-nav, .sc-loc, .sc-deck, .sc-orbit, .sc-help')) {
      return;
    }
    if (e.pointerType !== 'mouse') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        // second finger: this is a pinch, so stop looking and start zooming
        this.dragging = false;
        this.pinchStart = this.touchSpread();
        this.pinchFov = this.fov;
        return;
      }
    }
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.lastPointer = { x: e.clientX, y: e.clientY };
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2 && this.pinchStart > 0) {
        // Pinching the glass changes the field of view - the one zoom that is
        // honest here, because it changes the lens and not the distance. What
        // the pilot sees still comes from where the ship actually is.
        const spread = this.touchSpread();
        if (spread > 0) {
          this.fov = THREE.MathUtils.clamp(
            this.pinchFov * (this.pinchStart / spread),
            38,
            72,
          );
          this.ui.setFov(this.fov);
        }
        return;
      }
    }
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    // scale by field of view so the sensitivity feels the same at any FOV, and
    // again for touch, where a thumb crosses far fewer pixels than a mouse
    const touch = e.pointerType !== 'mouse';
    const k =
      (THREE.MathUtils.degToRad(this.fov) / window.innerHeight) * (touch ? 1.75 : 1.15);
    this.ship.look(-dx * k, -dy * k);
  }

  private onPointerUp(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinchStart = 0;
    if (e.pointerId === this.pointerId) this.dragging = false;
  }

  /** Distance between the two active touches, in pixels. */
  private touchSpread(): number {
    const [a, b] = [...this.touches.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onWheel(e: WheelEvent): void {
    if (this.phase !== 'flying') return;
    // deliberately NOT a zoom: the wheel drives the engine, because apparent
    // size in this mode may only ever come from moving
    e.preventDefault();
    this.ship.nudgeThrottle(e.deltaY < 0 ? 1 : -1);
    this.flushShipEvent();
  }

  /** Called by the app's key handler while spacecraft mode owns the keyboard. */
  handleKey(e: KeyboardEvent): void {
    const target = e.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select')) {
      if (e.key === 'Escape') (target as HTMLElement).blur();
      return;
    }
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      this.exit();
      return;
    }
    if (LOOK_PRESETS[k]) {
      const [yaw, pitch] = LOOK_PRESETS[k];
      this.ship.lookPreset(yaw, pitch);
      e.preventDefault();
      return;
    }
    if (HOLD_KEYS[k]) {
      this.ship.setHold(HOLD_KEYS[k]);
      this.flushShipEvent();
      e.preventDefault();
      return;
    }
    switch (k) {
      case ' ':
        e.preventDefault();
        this.ship.paused = !this.ship.paused;
        this.ui.announce(this.ship.paused ? 'Simulation paused.' : 'Simulation running.');
        return;
      case 'x':
        this.ship.fullStop();
        this.flushShipEvent();
        return;
      case 'z':
        this.ship.alignHullToGaze();
        this.flushShipEvent();
        return;
      case 'g':
        this.ship.gazeLock = !this.ship.gazeLock;
        this.ui.announce(this.ship.gazeLock ? 'Gaze lock on.' : 'Gaze lock off.');
        return;
      case 'c':
        this.ship.cycleHold();
        this.flushShipEvent();
        return;
      case 'o':
        this.ship.releaseOrbit();
        this.flushShipEvent();
        return;
      case 't':
        if (this.ship.targetId) {
          this.beginTransit(this.ship.targetId, 1);
          this.flushShipEvent();
        }
        return;
      case '[':
        this.ship.setTimeIndex(this.ship.timeIndex - 1);
        return;
      case ']':
        this.ship.setTimeIndex(this.ship.timeIndex + 1);
        return;
    }
    if (k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault();
    }
    this.keys.add(k);
  }

  private readInput(): void {
    const i = this.ship.input;
    const held = (...names: string[]) => names.some((n) => this.keys.has(n));
    i.yaw = (held('arrowleft') ? 1 : 0) - (held('arrowright') ? 1 : 0);
    i.pitch = (held('arrowup') ? 1 : 0) - (held('arrowdown') ? 1 : 0);
    i.roll = (held('q') ? 1 : 0) - (held('e') ? 1 : 0);
    i.strafeX = (held('d') ? 1 : 0) - (held('a') ? 1 : 0);
    i.strafeY = (held('r') ? 1 : 0) - (held('f') ? 1 : 0);
    // W/S step the throttle rather than adding velocity directly, so the main
    // engine always reads as a commanded setting the flight computer holds
    if (this.keys.has('w')) {
      this.keys.delete('w');
      this.ship.nudgeThrottle(1);
      this.flushShipEvent();
    }
    if (this.keys.has('s')) {
      this.keys.delete('s');
      this.ship.nudgeThrottle(-1);
      this.flushShipEvent();
    }
  }

  private flushShipEvent(): void {
    if (this.ship.event) {
      this.ui.announce(this.ship.event);
      this.deps.announce(this.ship.event);
      this.ship.event = null;
    }
  }

  // ---------------------------------------------------------------- frames --

  /**
   * Runs before the solar system is stepped: advances the ship, moves the
   * clock, and puts the camera where the pilot's eyes are.
   */
  update(dt: number): void {
    const { camera, state } = this.deps;

    if (this.phase === 'entering') {
      this.t = Math.min(1, (performance.now() - this.transitionStart) / (ENTRY_SECONDS * 1000));
      const k = easeInOut(this.t);
      this.scaleT = THREE.MathUtils.lerp(this.entryFrom.scaleT, 1, Math.min(1, k * 1.35));
      // fly the last of the way in, then hand over to the cockpit behind the veil
      const ease = Math.min(1, this.t / 0.72);
      camera.position.lerpVectors(this.entryFrom.pos, this.ship.pos, easeInOut(ease));
      this.tmpQ.copy(this.ship.quat);
      camera.quaternion.slerpQuaternions(this.entryFrom.quat, this.tmpQ, easeInOut(ease));
      camera.fov = THREE.MathUtils.lerp(this.saved?.fov ?? 50, this.fov, easeInOut(ease));
      camera.updateProjectionMatrix();
      // veil: dip to black over the handover, then lift on the cockpit
      this.veil.style.opacity = String(veilCurve(this.t));
      if (this.t >= 1) {
        this.phase = 'flying';
        this.veil.classList.remove('on');
        this.veil.style.opacity = '0';
        this.ui.announce('Systems online. Windows clear.');
      }
    } else if (this.phase === 'exiting') {
      this.t = Math.min(1, (performance.now() - this.transitionStart) / (EXIT_SECONDS * 1000));
      this.veil.style.opacity = String(Math.min(1, this.t * 2.2));
      if (this.t >= 1) {
        this.finishExit();
        return;
      }
    }

    if (this.phase === 'flying') {
      this.readInput();
      if (this.cruise.active) {
        // between stars the local flight computer has nothing to hold on to -
        // the crossing drives the ship instead, on the same clock
        this.updateCruise(dt);
      } else {
        const simDt = this.ship.update(dt, state.simDays);
        state.simDays += simDt / 86_400;
      }
      this.flushShipEvent();
      camera.position.copy(this.ship.pos);
      this.ship.headQuaternion(this.headQ);
      camera.quaternion.copy(this.ship.quat).multiply(this.headQ);
      if (Math.abs(camera.fov - this.fov) > 1e-3) {
        camera.fov = this.fov;
        camera.updateProjectionMatrix();
      }
    }

    this.updateFrustum();
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  }

  /**
   * Dynamic near plane. Standing off Earth's cloud tops needs a near plane of a
   * few tens of km; looking at Neptune needs a far plane 200 AU out. The ratio
   * is only survivable because anything genuinely far is drawn as a point on
   * the sky shell rather than as geometry.
   */
  private updateFrustum(): void {
    const { camera } = this.deps;
    const nearest = this.neighbours[0];
    const surfaceDist = nearest
      ? Math.max(nearest.dist - bodyRadiusTrue(nearest.id), 1e-7)
      : 1;
    // capped well below the nearest catalogued body so an uncatalogued object
    // drifting past can never be sliced by the near plane
    const near = THREE.MathUtils.clamp(surfaceDist * 0.3, 2e-6, 6);
    const far = 20000; // 200 AU; the star shell sits at 6000
    if (Math.abs(near - camera.near) / camera.near > 0.15 || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  /** Runs after the solar system is stepped: LOD handover, cockpit, HUD. */
  postUpdate(dt: number): void {
    if (!this.active) return;
    const { camera, state, system } = this.deps;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const viewH = window.innerHeight;

    this.neighbours = nearestBodies(this.ship.pos, state.simDays, 8);

    // The naked-eye point renderer and the ring LOD both speak specifically
    // about the Sun's planets. At another star there are none of those to
    // speak about, so both stand down rather than drawing eight bodies piled
    // on the origin.
    const atHome = system.activeSystemId === SOL_ID && !this.cruise.active;
    this.nakedEye.setEnabled(atHome);
    if (atHome) {
      // ---- naked-eye handover -----------------------------------------------
      this.nakedEye.update(this.ship.pos, state.simDays, halfTan, viewH);
      system.sun.setDiscVisible(this.nakedEye.pixelsOf('sun') > DISC_PIXELS);
      for (const [id, planet] of system.planets) {
        planet.setDiscVisible(this.nakedEye.pixelsOf(id) > DISC_PIXELS);
      }

      // ---- Saturn and Uranus: fine ring structure appears with proximity ----
      for (const id of ['saturn', 'uranus']) {
        const planet = system.planets.get(id);
        if (!planet?.hasRings) continue;
        const d = this.ship.pos.distanceTo(bodyPositionTrue(id, state.simDays, this.tmpA));
        const radii = d / Math.max(bodyRadiusTrue(id), 1e-9);
        planet.setRingDetail(1 - THREE.MathUtils.smoothstep(radii, 6, 46));
      }
    }

    // ---- trajectory preview --------------------------------------------------
    const orbitState = this.ship.orbitState;
    if (orbitState) {
      const def = catalogObject(orbitState.anchorId);
      const reachKm = bodyRadiusKm(orbitState.anchorId) * (def?.type === 'planet' ? 260 : 90);
      this.trajectory.update(
        bodyPositionTrue(orbitState.anchorId, state.simDays, this.tmpA),
        orbitState.r,
        orbitState.v,
        orbitState.mu,
        reachKm,
        minSafeDistance(orbitState.anchorId) * KM_PER_UNIT,
      );
      this.trajectory.setVisible(true);
    } else {
      this.trajectory.setVisible(false);
    }

    // ---- host star near field -------------------------------------------------
    // The corona shader belongs to the Sun's mesh; away from home it is not on
    // screen, so it is armed only when the Sun is the star we are next to.
    const sunDist = this.ship.pos.length();
    const sunRadii = atHome ? system.sun.setObserver(sunDist, true) : sunDist;

    // ---- cockpit -------------------------------------------------------------
    this.cockpit.build(camera.aspect, this.fov);
    // direction to the Sun, expressed in hull coordinates
    this.tmpB
      .copy(this.ship.pos)
      .negate()
      .normalize()
      .applyQuaternion(this.tmpQ.copy(this.ship.quat).invert());
    const sunAU = sunDist / UNITS_PER_AU;
    const sunLight = 0.06 + 0.94 * THREE.MathUtils.clamp(Math.pow(1 / Math.max(sunAU, 0.05), 1.4), 0, 1);
    this.cockpit.update(dt, this.headQ, this.tmpB, sunLight, {
      throttle: this.ship.cmdKms / THROTTLE_STEPS[THROTTLE_STEPS.length - 1],
      time: Math.log10(Math.max(1, this.ship.effectiveTimeScale)) / 6,
      target: this.ship.targetId ? (catalogObject(this.ship.targetId)?.name ?? '') : 'No target',
      dist: this.ship.targetId ? shortDist(this.ship.targetDistance(state.simDays)) : '',
    });

    // ---- HUD ------------------------------------------------------------------
    this.slowTimer += dt;
    if (this.slowTimer > 0.4) {
      this.slowTimer = 0;
      this.region = regionOf(this.ship.pos, state.simDays);
    }
    this.ui.update(dt, this.telemetry(sunRadii));
  }

  private telemetry(sunRadii: number): Telemetry {
    const { state, camera } = this.deps;
    const simDays = state.simDays;
    const ship = this.ship;
    const bearing = { yaw: 0, pitch: 0 };
    const hasBearing = ship.targetBearing(simDays, bearing);
    const dist = ship.targetDistance(simDays);

    let targetScreen: Telemetry['targetScreen'] = null;
    if (ship.targetId) {
      bodyPositionTrue(ship.targetId, simDays, this.tmpA);
      const view = this.tmpB.copy(this.tmpA).applyMatrix4(camera.matrixWorldInverse);
      const front = view.z < 0;
      const ndc = this.tmpA.copy(view).applyMatrix4(camera.projectionMatrix);
      targetScreen = {
        x: (ndc.x * 0.5 + 0.5) * window.innerWidth,
        y: (-ndc.y * 0.5 + 0.5) * window.innerHeight,
        front,
      };
    }

    const earthPos = bodyPositionTrue('earth', simDays, this.tmpA);
    const earthDistAU = ship.pos.distanceTo(earthPos) / UNITS_PER_AU;
    const posAU = new THREE.Vector3().copy(ship.pos).multiplyScalar(1 / UNITS_PER_AU);

    return {
      mode: ship.mode,
      paused: ship.paused,
      targetId: ship.targetId,
      speedKms: ship.speedKms,
      cmdKms: ship.cmdKms,
      throttleIndex: ship.throttleIndex,
      timeIndex: ship.timeIndex,
      effectiveTimeScale: ship.paused ? 0 : ship.effectiveTimeScale,
      simDays,
      posAU,
      sunDistAU: ship.pos.length() / UNITS_PER_AU,
      earthDistAU,
      region: this.region,
      neighbours: this.neighbours,
      distanceTravelledKm: ship.distanceTravelledKm,
      targetDistKm: dist === null ? null : dist * KM_PER_UNIT,
      targetAngularDeg: ship.targetAngularDeg(simDays),
      targetAltitudeKm: ship.targetAltitudeKm(simDays),
      targetEtaSec: ship.targetEtaSec(simDays),
      targetBearing: hasBearing ? bearing : null,
      targetMag: ship.targetId ? (this.nakedEye.state.get(ship.targetId)?.mag ?? null) : null,
      frameName: ship.frameName,
      anchorName: ship.anchorName,
      etaVelocityKms: ship.etaVelocityKms,
      orbit: ship.orbitInfo,
      hold: ship.hold,
      thrustMs2: ship.thrustMs2,
      warning: ship.warning,
      sunRadii,
      targetScreen,
      fov: this.fov,
      navOverlay: this.navOverlay,
      gazeLock: ship.gazeLock,
      systemId: this.deps.system.activeSystemId,
      systemName:
        this.deps.system.activeSystemId === SOL_ID
          ? 'Solar System'
          : (starSystem(this.deps.system.activeSystemId)?.name ?? 'Unknown'),
      starTargetId: this.starTargetId,
      cruise: this.cruise.active ? this.cruise.telemetry() : null,
      cruiseIndex: this.cruise.cruiseIndex,
      interstellarKm: this.cruise.travelledKm,
      distanceFromSunLy: positionLyOf(this.deps.system.activeSystemId).length(),
    };
  }

  /** Where the ship is in the wider neighbourhood, for the location panel. */
  get cruiseTelemetry(): CruiseTelemetry | null {
    return this.cruise.active ? this.cruise.telemetry() : null;
  }

  /** Draw the cabin over the finished space image. */
  renderOverlay(): void {
    if (this.phase !== 'flying' && this.phase !== 'exiting') return;
    const r = this.deps.renderer;
    const prevAutoClear = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.cockpit.scene, this.cockpit.camera);
    r.autoClear = prevAutoClear;
  }

  resize(w: number, h: number): void {
    this.cockpit.build(w / h, this.fov);
    this.ui.syncPanels();
  }

  setPixelRatio(pr: number): void {
    this.nakedEye.setPixelRatio(pr);
  }

  /** Test hook. */
  get debug(): Record<string, unknown> {
    return {
      ship: this.ship,
      phase: () => this.phase,
      target: (id: string) => this.selectTarget(id),
      // routes through the same classifier the UI uses, so a test exercises the
      // real decision rather than a shortcut around it
      travel: (closeness = 1) => this.withTarget((id) => this.beginTransit(id, closeness)),
      orbit: () => this.withTarget((id) => this.ship.startOrbit(id, this.simDays)),
      flyby: () => this.withTarget((id) => this.ship.startFlyby(id, this.simDays)),
      follow: () => this.withTarget((id) => this.ship.startFollow(id, this.simDays)),
      look: (yaw: number, pitch: number) => this.ship.lookPreset(yaw, pitch),
      setThrottle: (i: number) => this.ship.setThrottleIndex(i),
      setHold: (h: AttitudeHold) => this.ship.setHold(h),
      releaseOrbit: () => this.ship.releaseOrbit(),
      orbitInfo: () => this.ship.orbitInfo,
      stateVector: () => {
        const st = this.ship.orbitState;
        return st ? { r: st.r.toArray(), v: st.v.toArray(), mu: st.mu, anchor: st.anchorId } : null;
      },
      setStarTarget: (id: string) => this.setInterstellarTarget(id),
      launchInterstellar: () => this.startInterstellarCruise(),
      abortInterstellar: () => this.abortInterstellarCruise(),
      setCruiseIndex: (i: number) => this.cruise.setCruiseIndex(i),
      cruise: () => this.cruiseTelemetry,
      setPaused: (v: boolean) => {
        this.ship.paused = v;
      },
      setTime: (i: number) => this.ship.setTimeIndex(i),
      /**
       * Park the ship on a chosen bearing relative to the Sun, at a chosen
       * distance in body radii. teleportTo always approaches from the sunward
       * side, which cannot show a night side or a terminator - and those are
       * exactly the views the Earth lighting has to be checked against.
       */
      placeRelative: (
        id: string,
        bearing: 'day' | 'night' | 'terminator' | 'polar',
        radii = 3,
      ) => {
        const target = bodyPositionTrue(id, this.simDays, new THREE.Vector3());
        const sunward = target.clone().negate().normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const dir =
          bearing === 'day'
            ? sunward
            : bearing === 'night'
              ? sunward.negate()
              : bearing === 'terminator'
                ? new THREE.Vector3().crossVectors(sunward, up).normalize()
                : up;
        this.ship.pos.copy(target).addScaledVector(dir, radii * bodyRadiusTrue(id));
        this.ship.lookAtPoint(target);
        this.ship.idle();
        this.ship.startFollow(id, this.simDays);
        this.ship.targetId = id;
        this.ensureTargetVisible(id);
      },
      /**
       * Test hook: stand off a body along an arbitrary scene direction.
       *
       * placeRelative only offers bearings defined by the Sun. The
       * compositing test needs a bearing defined by the *sky* - it puts the
       * galactic centre directly behind each body, which is the worst case
       * for a background that composites wrongly and the view the report
       * showed.
       */
      placeAlong: (id: string, dir: [number, number, number], radii = 3) => {
        const target = bodyPositionTrue(id, this.simDays, new THREE.Vector3());
        const away = new THREE.Vector3(...dir).normalize();
        this.ship.pos.copy(target).addScaledVector(away, radii * bodyRadiusTrue(id));
        this.ship.lookAtPoint(target);
        this.ship.idle();
        this.ship.startFollow(id, this.simDays);
        this.ship.targetId = id;
        this.ensureTargetVisible(id);
      },
      /** Test hook: take the cockpit interior out of the frame so a capture
       *  measures the sky rather than the hull around it. Toggling it back on
       *  gives the compositing test an exact mask of the hull's own pixels -
       *  whatever changes between the two frames is structure, and a
       *  luminance threshold could never have separated that from the star
       *  field behind the glass. */
      hideCockpit: (hidden = true) => {
        this.cockpit.setVisible(!hidden);
      },
      teleportTo: (id: string, factor = 1) => {
        this.ship.placeNear(id, this.simDays, factor);
        this.ship.targetId = id;
        this.ensureTargetVisible(id);
      },
      info: () => ({
        pos: this.ship.pos.toArray(),
        mode: this.ship.mode,
        target: this.ship.targetId,
        anchor: this.ship.anchorId,
        targetDistKm: (this.ship.targetDistance(this.simDays) ?? 0) * KM_PER_UNIT,
        targetAngularDeg: this.ship.targetAngularDeg(this.simDays),
        sunAU: this.ship.pos.length() / UNITS_PER_AU,
        region: this.region.label,
        speedKms: this.ship.speedKms,
        timeScale: this.ship.effectiveTimeScale,
        near: this.deps.camera.near,
        far: this.deps.camera.far,
        travelledKm: this.ship.distanceTravelledKm,
        interstellarKm: this.cruise.travelledKm,
        systemId: this.deps.system.activeSystemId,
        warning: this.ship.warning,
        frame: this.ship.frameId,
        hold: this.ship.hold,
        gazeLock: this.ship.gazeLock,
        thrustMs2: this.ship.thrustMs2,
        orbit: this.ship.orbitInfo,
        rel: this.ship.targetId
          ? new THREE.Vector3()
              .copy(this.ship.pos)
              .sub(bodyPositionTrue(this.ship.targetId, this.simDays, new THREE.Vector3()))
              .toArray()
          : null,
      }),
      angularOf: (id: string) => {
        const d = this.ship.pos.distanceTo(bodyPositionTrue(id, this.simDays, new THREE.Vector3()));
        return (2 * Math.asin(Math.min(1, bodyExtentTrue(id) / d)) * 180) / Math.PI;
      },
      pixelsOf: (id: string) => this.nakedEye.pixelsOf(id),
      /**
       * Test hook: run a burn on a throwaway vessel with a SYNTHETIC frame
       * clock, so the same manoeuvre can be compared across frame rates without
       * needing a machine that actually renders at them. The live ship is not
       * touched. Exists because tying orbital authority to frame rate is an easy
       * mistake to make and an invisible one to live with.
       */
      burnProbe: (opts?: {
        body?: string;
        dt?: number;
        seconds?: number;
        throttle?: number;
        axis?: AttitudeHold;
      }) => {
        const body = opts?.body ?? 'mars';
        const dt = opts?.dt ?? 1 / 60;
        const seconds = opts?.seconds ?? 6;
        const throttle = opts?.throttle ?? 3;
        const probe = new Ship();
        let simDays = this.simDays;
        probe.gazeLock = false;
        probe.placeNear(body, simDays, 1);
        probe.startOrbit(body, simDays);
        probe.setHold(opts?.axis ?? 'prograde');
        // let the attitude settle with the engine cold
        for (let i = 0; i < 120; i++) simDays += probe.update(1 / 60, simDays) / 86_400;
        const before = probe.orbitInfo!;
        probe.setThrottleIndex(throttle);
        const frames = Math.max(1, Math.round(seconds / dt));
        for (let i = 0; i < frames; i++) simDays += probe.update(dt, simDays) / 86_400;
        const after = probe.orbitInfo!;
        const st = probe.orbitState;
        // specific orbital energy: the one shape measure that stays finite and
        // monotone whether the burn left the orbit bound or not
        const energy = st
          ? st.v.lengthSq() / 2 - st.mu / st.r.length()
          : Number.NaN;
        return {
          dt,
          frames,
          dvSpentKms: after.dvSpentKms,
          energyKm2S2: energy,
          semiMajorBeforeKm: before.semiMajorKm,
          semiMajorAfterKm: after.semiMajorKm,
          eccentricity: after.eccentricity,
          escaping: after.escaping,
        };
      },
      cockpit: this.cockpit,
    };
  }

  dispose(): void {
    this.detachInput();
    this.cockpit.dispose();
    this.nakedEye.dispose();
    this.trajectory.dispose();
    this.ui.dispose();
    this.veil.remove();
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Dip to black across the hand-over, then lift to reveal the cockpit. */
function veilCurve(t: number): number {
  if (t < 0.45) return THREE.MathUtils.smoothstep(t, 0.2, 0.45) * 0.96;
  if (t < 0.62) return 0.96;
  return 0.96 * (1 - THREE.MathUtils.smoothstep(t, 0.62, 1));
}

function shortDist(units: number | null): string {
  if (units === null) return '';
  const km = units * KM_PER_UNIT;
  const au = km / 149_597_870.7;
  if (au >= 0.02) return `${au.toFixed(2)} AU`;
  if (km >= 1e6) return `${(km / 1e6).toFixed(1)}M km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}
