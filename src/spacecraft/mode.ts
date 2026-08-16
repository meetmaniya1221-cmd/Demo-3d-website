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
import { WarpStreaks } from '../galaxy/chunks';
import { Ship, LIGHT_SPEED_KMS, THROTTLE_STEPS, THRUST_STEPS_MS2, type AttitudeHold } from './ship';
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

export interface SpacecraftDeps {
  state: AppState;
  system: SolarSystem;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** Hand the camera over / take it back from the orbit rig. */
  releaseCamera: () => void;
  resumeCamera: (target: THREE.Vector3) => void;
  /** Current orbit-rig target, captured on entry so exit can restore it. */
  cameraTarget?: () => THREE.Vector3;
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
  '2': [90, 0],     // port (+yaw turns the head to port)
  '3': [-90, 0],    // starboard
  '4': [0, 80],     // overhead
  '5': [0, -78],    // floor port
  '6': [180, 0],    // astern
};

/** Manoeuvre-axis holds, clear of the six window keys ('c' cycles them all,
 *  which is also the only route to the normal/anti-normal pair). */
const HOLD_KEYS: Record<string, AttitudeHold> = {
  '7': 'prograde',
  '8': 'retrograde',
  '9': 'radial-out',
  '0': 'radial-in',
};

type Phase = 'off' | 'entering' | 'flying' | 'exiting';

export class SpacecraftMode {
  readonly ship = new Ship();
  private deps: SpacecraftDeps;
  private cockpit = new Cockpit();
  private nakedEye = new NakedEyeBodies();
  private streaks = new WarpStreaks();
  private trajectory = new TrajectoryPreview();
  private ui: SpacecraftUI;
  private veil: HTMLElement;

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
    // opacity is driven per frame during the transitions - the stylesheet's
    // own transition would lag every write
    this.veil.style.transition = 'none';
    root.appendChild(this.veil);

    this.ui = new SpacecraftUI(root, {
      onExit: () => this.exit(),
      onSelectTarget: (id) => this.selectTarget(id),
      onTravel: (closeness) => this.withTarget((id) => this.ship.startTransit(id, this.simDays, closeness)),
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
      target: this.deps.cameraTarget?.() ?? new THREE.Vector3(),
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
    system.scene.add(this.streaks.points);
    system.scene.add(this.trajectory.group);
    this.nakedEye.setEnabled(true);

    if (this.ship.unplaced) {
      this.ship.placeNear('earth', state.simDays, 2.4);
      this.ship.targetId = 'earth';
    } else {
      // returning pilot: same place, same target, engines idle so re-entering
      // never launches you off at whatever throttle you left set. A transit or
      // fly-by left mid-run is stood down too - idling zeroed its cruise
      // speed, and a zombie autopilot would crawl forever at 1 km/s.
      if (this.ship.mode === 'transit' || this.ship.mode === 'flyby') {
        this.ship.abort('Autopilot stood down while the ship was unmanned.');
        this.ship.event = null;
      }
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
    this.streaks.update(0, 0);
    system.scene.remove(this.streaks.points);
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
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.lastPointer = { x: e.clientX, y: e.clientY };
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    // scale by field of view so the sensitivity feels the same at any FOV
    const k = (THREE.MathUtils.degToRad(this.fov) / window.innerHeight) * 1.15;
    this.ship.look(-dx * k, -dy * k);
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId === this.pointerId) this.dragging = false;
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
          this.ship.startTransit(this.ship.targetId, this.simDays);
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
      this.t = REDUCED_MOTION
        ? 1
        : Math.min(1, (performance.now() - this.transitionStart) / (ENTRY_SECONDS * 1000));
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
      this.t = REDUCED_MOTION
        ? 1
        : Math.min(1, (performance.now() - this.transitionStart) / (EXIT_SECONDS * 1000));
      this.veil.style.opacity = String(Math.min(1, this.t * 2.2));
      if (this.t >= 1) {
        this.finishExit();
        return;
      }
    }

    if (this.phase === 'flying') {
      this.readInput();
      const simDt = this.ship.update(dt, state.simDays);
      state.simDays += simDt / 86_400;
      this.flushShipEvent();
      camera.position.copy(this.ship.pos);
      this.ship.headQuaternion(this.headQ);
      camera.quaternion.copy(this.ship.quat).multiply(this.headQ);
      if (Math.abs(camera.fov - this.fov) > 1e-3) {
        camera.fov = this.fov;
        camera.updateProjectionMatrix();
      }
    }

    // refresh the neighbour list from the NEW ship position before the near
    // plane is sized from it - at high compression a frame-stale list can be
    // millions of kilometres out on an approach
    this.neighbours = nearestBodies(this.ship.pos, state.simDays, 8);
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

    // ---- naked-eye handover -------------------------------------------------
    this.nakedEye.update(this.ship.pos, state.simDays, halfTan, viewH);
    system.sun.setDiscVisible(this.nakedEye.pixelsOf('sun') > DISC_PIXELS);
    for (const [id, planet] of system.planets) {
      planet.setDiscVisible(this.nakedEye.pixelsOf(id) > DISC_PIXELS);
    }

    // ---- Saturn and Uranus: fine ring structure appears with proximity ------
    for (const id of ['saturn', 'uranus']) {
      const planet = system.planets.get(id);
      if (!planet?.hasRings) continue;
      const d = this.ship.pos.distanceTo(bodyPositionTrue(id, state.simDays, this.tmpA));
      const radii = d / Math.max(bodyRadiusTrue(id), 1e-9);
      planet.setRingDetail(1 - THREE.MathUtils.smoothstep(radii, 6, 46));
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

    // ---- cinematic cruise streaks -------------------------------------------
    // Star-flow past the windows once the APPARENT rate goes properly
    // superluminal (physical velocity x time compression). An impressionist
    // stand-in, not a physics claim - the same device galaxy mode uses.
    const apparentC = (this.ship.speedKms * (this.ship.paused ? 0 : this.ship.effectiveTimeScale)) / LIGHT_SPEED_KMS;
    this.streaks.points.position.copy(this.ship.pos);
    this.streaks.points.quaternion.copy(this.deps.camera.quaternion);
    this.streaks.update(dt, Math.min(60, apparentC * 0.55));

    // ---- Sun near field ------------------------------------------------------
    const sunDist = this.ship.pos.length();
    const sunRadii = system.sun.setObserver(sunDist, true);

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
    // the console bar: thrust fraction in orbit (the ladder means m/s² there),
    // log-scaled commanded velocity everywhere else so the physical band is
    // not crushed to zero by the accelerated notches
    const consoleThrottle =
      this.ship.mode === 'orbit'
        ? this.ship.thrustMs2 / THRUST_STEPS_MS2[THRUST_STEPS_MS2.length - 1]
        : Math.log10(1 + Math.max(0, this.ship.cmdKms)) /
          Math.log10(1 + THROTTLE_STEPS[THROTTLE_STEPS.length - 1]);
    this.cockpit.update(dt, this.headQ, this.tmpB, sunLight, {
      throttle: consoleThrottle,
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
    };
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
    this.streaks.setPixelRatio(pr);
  }

  /** Test hook. */
  get debug(): Record<string, unknown> {
    return {
      ship: this.ship,
      phase: () => this.phase,
      target: (id: string) => this.selectTarget(id),
      travel: (closeness = 1) =>
        this.withTarget((id) => this.ship.startTransit(id, this.simDays, closeness)),
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
      setPaused: (v: boolean) => {
        this.ship.paused = v;
      },
      setTime: (i: number) => this.ship.setTimeIndex(i),
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
    this.streaks.dispose();
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
