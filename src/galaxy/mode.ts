/**
 * Galaxy Mode: the observer that leaves the Solar System.
 *
 * Like SpacecraftMode this is a phase machine (off → entering → flying →
 * exiting) that borrows the app's camera; unlike it, the world it renders
 * is the galaxy-scale scene with its own composer chain, because the two
 * regimes cannot share float precision: RenderPass → gravitational-lensing
 * pass → bloom → output.
 *
 * The Sagittarius A* approach is staged by real distances:
 *   1  <3,000 ly  galactic-centre approach (density climbing, radio noise)
 *   2  <100 ly    nuclear star cluster (10⁵-10⁶ stars/pc³)
 *   3  <0.15 ly   relativistic zone (S-star orbits, lensing visible,
 *                 time dilation reads on the clocks)
 *   4  <63 AU     extreme proximity (hull stress, navigation instability,
 *                 emergency envelope)
 * The flight computer's speed ceiling collapses with distance to the hole,
 * and inside ~2.5 Rs an automated recovery burn fires: the event horizon is
 * a one-way surface, and the game refuses to let you cross it casually -
 * the HUD says exactly why.
 *
 * Time: gravitational dilation uses the real static-observer factor
 * √(1 − Rs/r). The ship's clock accumulates proper time; the Earth-date
 * clock (state.simDays, shared with the rest of the app) runs FASTER the
 * deeper you sit in the well - hold at 1.1 Rs for a minute and watch the
 * Solar System's date pull ahead. Warp speeds are a labeled gameplay
 * device; the dilation math is not.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { AppState } from '../sim/state';
import { GalaxyScene } from './scene';
import { SGRA_DISK_NORMAL } from './sgra';
import { GalaxyShip } from './ship';
import { GalaxyHud, type HudMarker } from './hud';
import { GalaxyMap } from './map';
import { DiscoveryLog, DiscoveryPanel } from './discovery';
import { EventDirector, type GalaxyEvent } from './events';
import { GalaxyAudio } from './audio';
import { LensingPass } from './lensing';
import { DEFAULT_PARAMS, regionAt, starsPerPc3 } from './model';
import {
  SGRA_RS_LY,
  SUN_POS,
  Vec3d,
  galToScene,
  gravitationalDilation,
} from './units';

export interface GalaxyDeps {
  state: AppState;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  releaseCamera: () => void;
  resumeCamera: (target: THREE.Vector3) => void;
  focusOverview: () => void;
  announce: (text: string) => void;
}

type Phase = 'off' | 'entering' | 'flying' | 'exiting';

const ENTRY_SECONDS = 2.2;
const EXIT_SECONDS = 0.8;

const REDUCED_MOTION =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class GalaxyMode {
  phase: Phase = 'off';
  private deps: GalaxyDeps;
  private gscene: GalaxyScene | null = null;
  private ship = new GalaxyShip();
  private hud: GalaxyHud;
  private map: GalaxyMap | null = null;
  private log = new DiscoveryLog();
  private logPanel: DiscoveryPanel;
  private events: EventDirector;
  private audio = new GalaxyAudio();
  private composer: EffectComposer | null = null;
  private lens: LensingPass | null = null;
  private veil: HTMLElement;
  private root: HTMLElement;
  private t = 0;
  private transitionStart = 0;
  private elapsed = 0;
  private stage = 0;
  private warning: string | null = null;
  private navJitterTimer = 0;
  private scanTimer = 0;
  private emergencyCooldown = 0;
  private emergencyUntil = 0;
  private keys = new Set<string>();
  private dragging = false;
  private pointerId = -1;
  private lastPointer = { x: 0, y: 0 };
  private saved: {
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    fov: number;
    near: number;
    far: number;
  } | null = null;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpS = { x: 0, y: 0, z: 0 };
  private markers: HudMarker[] = [];
  private bound = {
    down: (e: PointerEvent) => this.onPointerDown(e),
    move: (e: PointerEvent) => this.onPointerMove(e),
    up: (e: PointerEvent) => this.onPointerUp(e),
    wheel: (e: WheelEvent) => this.onWheel(e),
    keyup: (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase()),
    blur: () => this.keys.clear(),
  };

  constructor(root: HTMLElement, deps: GalaxyDeps) {
    this.deps = deps;
    this.root = root;
    this.veil = document.createElement('div');
    this.veil.className = 'gx-veil';
    root.appendChild(this.veil);
    this.hud = new GalaxyHud(root, {
      onExit: () => this.exit(),
      onMap: () => this.toggleMap(),
      onScan: () => this.startScan(),
      onLog: () => this.logPanel.toggle(),
      onEnterSol: () => this.tryEnterSol(),
    });
    this.logPanel = new DiscoveryPanel(root, this.log, () => this.ship.pos);
    this.events = new EventDirector(DEFAULT_PARAMS.seed, (e) => this.onEvent(e));
  }

  get active(): boolean {
    return this.phase !== 'off';
  }

  get busy(): boolean {
    return this.phase === 'entering' || this.phase === 'exiting';
  }

  // ------------------------------------------------------------ enter/exit

  enter(): void {
    if (this.active) return;
    const { camera } = this.deps;
    this.saved = {
      pos: camera.position.clone(),
      quat: camera.quaternion.clone(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
    };
    this.deps.releaseCamera();
    camera.clearViewOffset();

    // heavy lifting happens once, behind the veil: ~350k sampled stars
    if (!this.gscene) {
      this.gscene = new GalaxyScene(DEFAULT_PARAMS);
      this.map = new GalaxyMap(
        this.root,
        this.gscene.landmarks,
        this.log,
        () => ({ pos: this.ship.pos, heading: this.heading() }),
        {
          onEngageRoute: (target, label) => {
            this.ship.engageRoute(label, target, 0.05);
            this.hud.toast('Route engaged', 'Autopilot will decelerate on approach.');
          },
          onClose: () => {},
        },
      );
      this.composer = new EffectComposer(this.deps.renderer);
      this.composer.addPass(new RenderPass(this.gscene.scene, camera));
      this.lens = new LensingPass();
      this.composer.addPass(this.lens);
      this.composer.addPass(
        new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.7, 0.78),
      );
      this.composer.addPass(new OutputPass());
    }

    if (this.ship.properTime === 0) {
      // first boarding: park just off Sol, nose toward the galactic centre -
      // then compose the shot rather than centring it: the centre sits
      // off-axis and a gentle roll lays the band as a diagonal across the
      // frame, the way a cinematographer would hold it
      this.ship.pos.copy(SUN_POS).add(new Vec3d(0, -0.5, 0.12));
      galToScene(0 - this.ship.pos.x, 0 - this.ship.pos.y, 0 - this.ship.pos.z, this.tmpS);
      this.tmpV.set(this.tmpS.x, this.tmpS.y, this.tmpS.z).normalize();
      this.ship.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.tmpV);
      const frame = new THREE.Quaternion();
      frame.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.22); // centre right of frame
      this.ship.quat.multiply(frame);
      frame.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.08); // slightly above the bow
      this.ship.quat.multiply(frame);
      frame.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.38); // band as a diagonal
      this.ship.quat.multiply(frame);
    }

    this.phase = 'entering';
    this.t = 0;
    this.transitionStart = performance.now();
    this.veil.classList.add('on');
    this.veil.style.opacity = '1';
    document.body.classList.add('galaxy-mode');
    this.audio.init();
    this.hud.show();
    this.attachInput();
    this.deps.announce(
      'Galaxy mode. You are leaving the Solar System: the Milky Way at one light-year per unit, Sagittarius A* twenty-seven thousand light-years ahead. Drag to look, W to warp, M for the map.',
    );
    if (REDUCED_MOTION) this.t = 1;
  }

  exit(): void {
    if (!this.active || this.phase === 'exiting') return;
    if (this.map?.isOpen) this.map.close();
    if (this.logPanel.isOpen) this.logPanel.close();
    this.phase = 'exiting';
    this.t = 0;
    this.transitionStart = performance.now();
    this.veil.classList.add('on');
    this.hud.hide();
    if (REDUCED_MOTION) this.finishExit();
  }

  private tryEnterSol(): void {
    if (this.ship.pos.distanceTo(SUN_POS) > 6) {
      this.hud.toast('Too far from Sol', 'Close to within a few light-years of the Solar System first.');
      return;
    }
    this.deps.announce('Re-entering the Solar System.');
    this.exit();
  }

  private finishExit(): void {
    const { camera } = this.deps;
    this.phase = 'off';
    this.detachInput();
    this.keys.clear();
    document.body.classList.remove('galaxy-mode');
    this.veil.classList.remove('on');
    this.veil.style.opacity = '0';
    this.audio.suspend();
    this.hud.scanStatus(null);
    if (this.saved) {
      camera.position.copy(this.saved.pos);
      camera.quaternion.copy(this.saved.quat);
      camera.fov = this.saved.fov;
      camera.near = this.saved.near;
      camera.far = this.saved.far;
      camera.updateProjectionMatrix();
      this.deps.resumeCamera(new THREE.Vector3(0, 0, 0));
      this.saved = null;
    }
    this.deps.focusOverview();
    this.deps.announce('Back in the Solar System explorer.');
  }

  // ---------------------------------------------------------------- input

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
    const k = (THREE.MathUtils.degToRad(this.deps.camera.fov) / window.innerHeight) * 1.1;
    this.ship.look(-dx * k, -dy * k);
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId === this.pointerId) this.dragging = false;
  }

  private onWheel(e: WheelEvent): void {
    if (this.phase !== 'flying') return;
    e.preventDefault();
    this.ship.nudgeThrottle(e.deltaY < 0 ? 1 : -1);
    this.flushShipEvent();
  }

  handleKey(e: KeyboardEvent): void {
    const target = e.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select')) {
      if (e.key === 'Escape') target.blur();
      return;
    }
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (this.map?.isOpen) this.map.close();
      else if (this.logPanel.isOpen) this.logPanel.close();
      else this.exit();
      return;
    }
    switch (k) {
      case 'm':
        this.toggleMap();
        return;
      case 'v':
        this.startScan();
        return;
      case 'b':
        this.logPanel.toggle();
        return;
      case 'x':
        this.ship.fullStop();
        this.flushShipEvent();
        return;
      case 't': {
        // route straight to the galactic centre, standing off at ~400 AU
        this.ship.engageRoute('Sagittarius A*', new Vec3d(0, 0, 0), 0.0063);
        this.flushShipEvent();
        return;
      }
      case 'w':
        this.ship.nudgeThrottle(1);
        this.flushShipEvent();
        return;
      case 's':
        this.ship.nudgeThrottle(-1);
        this.flushShipEvent();
        return;
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    this.keys.add(k);
  }

  private readInput(): void {
    const held = (...names: string[]) => names.some((n) => this.keys.has(n));
    this.ship.setRates(
      (held('arrowleft', 'a') ? 1 : 0) - (held('arrowright', 'd') ? 1 : 0),
      (held('arrowup') ? 1 : 0) - (held('arrowdown') ? 1 : 0),
      (held('q') ? 1 : 0) - (held('e') ? 1 : 0),
    );
  }

  private toggleMap(): void {
    if (!this.map) return;
    if (this.map.isOpen) this.map.close();
    else this.map.show();
  }

  private flushShipEvent(): void {
    if (this.ship.event) {
      this.hud.toast('Nav computer', this.ship.event);
      this.ship.event = null;
    }
  }

  // ----------------------------------------------------------------- scan

  private startScan(): void {
    if (!this.gscene || this.scanTimer > 0) return;
    this.scanTimer = 1.6;
    this.hud.scanStatus('SCANNING — wideband survey sweep…');
  }

  private finishScan(): void {
    if (!this.gscene) return;
    const stars = this.gscene.chunks.starsNear(this.ship.pos, 25);
    const result = this.log.scan(this.ship.pos, this.deps.state.simDays, stars, this.gscene.landmarks);
    this.hud.scanStatus(null);
    if (result.fresh.length > 0) {
      const names = result.fresh.slice(0, 3).map((e) => e.name).join(', ');
      this.hud.toast(
        `Recorded ${result.fresh.length} new object${result.fresh.length === 1 ? '' : 's'}`,
        `${names}${result.fresh.length > 3 ? '…' : ''} filed to the survey log.`,
      );
      this.deps.announce(`Scan complete. ${result.fresh.length} new objects recorded.`);
    } else {
      this.hud.toast(
        'Scan complete',
        result.known > 0
          ? 'Everything in range is already in the survey log.'
          : 'Nothing within instrument range. Try closer to stars, clusters or the galactic centre.',
      );
    }
  }

  // --------------------------------------------------------------- events

  private onEvent(e: GalaxyEvent): void {
    if (!this.gscene) return;
    this.hud.toast(e.title, e.text, e.severity);
    switch (e.kind) {
      case 'flare':
        this.gscene.flares.trigger(1);
        this.audio.flare();
        break;
      case 'radiation':
        this.gscene.flares.trigger(1.6);
        this.audio.flare();
        break;
      case 'nav-disturbance':
        this.navJitterTimer = e.effectSeconds;
        this.audio.warn();
        break;
      case 'stellar-flyby':
      case 'sensor-static':
      case 'gas-cloud':
        if (e.severity !== 'notice') this.audio.warn();
        break;
    }
  }

  // ---------------------------------------------------------------- frame

  private heading(): number {
    this.ship.forwardScene(this.tmpV);
    // heading in the galactic plane: angle of (gx, gy) = (sx, -sz)
    return Math.atan2(-this.tmpV.z, this.tmpV.x) - Math.PI / 2;
  }

  update(rawDt: number): void {
    const dt = Math.min(rawDt, 0.1);
    const { camera, state } = this.deps;
    this.elapsed += dt;

    if (this.phase === 'entering') {
      this.t = Math.min(1, (performance.now() - this.transitionStart) / (ENTRY_SECONDS * 1000));
      this.veil.style.opacity = String(this.t < 0.55 ? 1 : 1 - (this.t - 0.55) / 0.45);
      if (this.t >= 1) {
        this.phase = 'flying';
        this.veil.classList.remove('on');
        this.veil.style.opacity = '0';
      }
    } else if (this.phase === 'exiting') {
      this.t = Math.min(1, (performance.now() - this.transitionStart) / (EXIT_SECONDS * 1000));
      this.veil.style.opacity = String(Math.min(1, this.t * 2));
      if (this.t >= 1) {
        this.finishExit();
        return;
      }
    }

    if (!this.gscene) return;

    const sgraDist = this.ship.pos.length();
    const solDist = this.ship.pos.distanceTo(SUN_POS);

    if (this.phase === 'flying') {
      this.readInput();

      // the flight computer's local speed limit collapses near mass; an
      // active emergency burn overrides it - getting OUT is the priority
      let ceiling = Math.min(
        Math.max(sgraDist * 0.22, 2.2e-7),
        Math.max(solDist * 0.5, 3e-7),
      );
      if (this.elapsed < this.emergencyUntil) ceiling = Math.max(ceiling, 2.5e-5);
      this.ship.navJitter =
        (this.stage >= 4 ? 0.5 : this.stage >= 3 ? 0.12 : 0) +
        (this.navJitterTimer > 0 ? 0.35 : 0);
      if (this.navJitterTimer > 0) this.navJitterTimer -= dt;
      this.ship.update(dt, ceiling);
      this.flushShipEvent();

      // ---- event-horizon guard --------------------------------------
      if (this.emergencyCooldown > 0) this.emergencyCooldown -= dt;
      const rs = SGRA_RS_LY;
      if (sgraDist < rs * 2.5 && this.emergencyCooldown <= 0) {
        // no trajectory returns from inside ~1.5 Rs; refuse the crossing
        this.emergencyCooldown = 10;
        this.emergencyUntil = this.elapsed + 9;
        const out = this.ship.pos.clone().normalize().scale(rs * 80);
        this.ship.engageRoute('EMERGENCY RECOVERY', out, 0);
        // slam the nose outward now - slerping politely toward safety is
        // how you cross a horizon
        galToScene(out.x - this.ship.pos.x, out.y - this.ship.pos.y, out.z - this.ship.pos.z, this.tmpS);
        this.tmpV.set(this.tmpS.x, this.tmpS.y, this.tmpS.z).normalize();
        this.ship.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.tmpV);
        this.audio.warn();
        this.hud.toast(
          'EMERGENCY RECOVERY BURN',
          'Approach envelope violated: below 2.5 Schwarzschild radii no sustained trajectory can hold station. The flight computer is pulling out - past the horizon there is no path back.',
          'danger',
        );
        this.deps.announce('Emergency recovery burn engaged near the event horizon.');
      }
    }

    // ---- time: gravitational dilation, both clocks -------------------
    const dilation = gravitationalDilation(sgraDist);
    // ship proper time advanced inside ship.update; the Earth clock runs
    // faster by 1/√(1−Rs/r) as seen from far away
    state.simDays += (dt / 86_400) / dilation;

    // ---- stage machine ----------------------------------------------
    const newStage =
      sgraDist < 0.001 ? 4 : sgraDist < 0.15 ? 3 : sgraDist < 100 ? 2 : sgraDist < 3000 ? 1 : 0;
    if (newStage !== this.stage) {
      this.stage = newStage;
      const msgs: Record<number, [string, string]> = {
        1: [
          'Entering the galactic-centre region',
          'Stellar density is climbing fast; the bulge sky is beginning to glow.',
        ],
        2: [
          'Nuclear star cluster',
          'Up to a million times the solar neighbourhood’s star density. Sagittarius A* is close.',
        ],
        3: [
          'Relativistic zone',
          'S-cluster orbits all around; background stars are bending. Time dilation is now reading on the clocks.',
        ],
        4: [
          'Extreme proximity',
          'Hundreds of AU from the horizon. Navigation degraded; hull under tidal load; the flight computer holds the final envelope.',
        ],
      };
      if (this.stage > 0) {
        const [title, text] = msgs[this.stage];
        this.hud.toast(title, text, this.stage >= 3 ? 'warning' : 'notice');
        if (this.stage >= 2) this.audio.warn();
      }
    }
    this.warning =
      this.stage === 4
        ? 'TIDAL STRESS · NAVIGATION DEGRADED · EMERGENCY ENVELOPE ARMED'
        : this.stage === 3 && this.gscene.flareState.active
          ? 'FLARE IN PROGRESS · RADIATION ELEVATED'
          : null;

    // ---- events + scan ----------------------------------------------
    if (this.phase === 'flying') {
      this.events.update(dt, sgraDist);
      if (this.scanTimer > 0) {
        this.scanTimer -= dt;
        if (this.scanTimer <= 0) this.finishScan();
      }
    }

    // ---- camera ------------------------------------------------------
    camera.position.set(0, 0, 0);
    camera.quaternion.copy(this.ship.quat);
    if (this.stage === 4 && !REDUCED_MOTION) {
      // tidal shudder: strongest inside the emergency envelope
      const shake = 0.0016 * Math.min(1, (0.001 / Math.max(sgraDist, 1e-9)) * 0.2);
      camera.rotation.x += (Math.random() - 0.5) * shake;
      camera.rotation.y += (Math.random() - 0.5) * shake;
    }
    const near = THREE.MathUtils.clamp(Math.min(sgraDist, solDist) * 0.04, 4e-8, 0.4);
    const far = 620_000;
    if (Math.abs(near - camera.near) / camera.near > 0.15 || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    // ---- scene + lensing --------------------------------------------
    this.gscene.update(this.ship.pos, camera, dt, state.simDays, this.ship.speed);
    galToScene(-this.ship.pos.x, -this.ship.pos.y, -this.ship.pos.z, this.tmpS);
    this.tmpV.set(this.tmpS.x, this.tmpS.y, this.tmpS.z);
    const lensStrength = THREE.MathUtils.clamp(1 - (sgraDist - 0.004) / 0.6, 0, 1);
    this.lens?.syncFrame(
      this.tmpV,
      SGRA_DISK_NORMAL,
      camera,
      this.elapsed,
      this.gscene.flareState.level,
      lensStrength,
    );

    // ---- HUD ---------------------------------------------------------
    this.buildMarkers(camera);
    this.hud.update(dt, {
      pos: this.ship.pos,
      region: regionAt(this.ship.pos),
      starsPc3: starsPerPc3(this.ship.pos),
      speed: this.ship.speed,
      throttleIndex: this.ship.throttleIndex,
      routeLabel: this.ship.route?.label ?? null,
      routeDist: this.ship.routeDistance(),
      routeEta: this.ship.routeEta(),
      sgraDist,
      solDist,
      stage: this.stage,
      stageLabel:
        this.stage === 0
          ? ''
          : ['', 'GALACTIC CENTRE APPROACH', 'NUCLEAR STAR CLUSTER', 'RELATIVISTIC ZONE', 'EXTREME PROXIMITY'][this.stage],
      dilation,
      properTime: this.ship.properTime,
      simDays: state.simDays,
      radiation: this.gscene.flareState.radiation,
      warning: this.warning,
      markers: this.markers,
    });

    // ---- audio -------------------------------------------------------
    const stress = this.stage === 4 ? Math.min(1, 0.3 + (0.001 / Math.max(sgraDist, 1e-9)) * 0.02) : 0;
    this.audio.update(dt, sgraDist, stress);
  }

  private buildMarkers(camera: THREE.PerspectiveCamera): void {
    this.markers.length = 0;
    const push = (gal: Vec3d, label: string, kind: HudMarker['kind'], minDist: number) => {
      const dx = gal.x - this.ship.pos.x;
      const dy = gal.y - this.ship.pos.y;
      const dz = gal.z - this.ship.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < minDist) return;
      galToScene(dx, dy, dz, this.tmpS);
      this.tmpV2.set(this.tmpS.x, this.tmpS.y, this.tmpS.z);
      const view = this.tmpV2.applyMatrix4(camera.matrixWorldInverse);
      const front = view.z < 0;
      this.tmpV2.applyMatrix4(camera.projectionMatrix);
      this.markers.push({
        label,
        x: (this.tmpV2.x * 0.5 + 0.5) * window.innerWidth,
        y: (-this.tmpV2.y * 0.5 + 0.5) * window.innerHeight,
        front,
        kind,
      });
    };
    // once the hole fills the view it needs no locator - the marker only
    // exists to find something small
    push(new Vec3d(0, 0, 0), 'SGR A*', 'sgra', 0.00025);
    push(SUN_POS, 'SOL', 'sol', 0.02);
    const wp = this.map?.currentWaypoint;
    if (wp) push(wp, 'WAYPOINT', 'waypoint', 0.05);
  }

  render(): void {
    this.composer?.render();
  }

  resize(w: number, h: number): void {
    this.composer?.setSize(w, h);
    this.map?.resize();
    void w;
    void h;
  }

  setPixelRatio(pr: number): void {
    this.composer?.setPixelRatio(pr);
    this.gscene?.setPixelRatio(pr);
  }

  /** Test hook, mirroring the spacecraft's debug surface. */
  get debug(): Record<string, unknown> {
    return {
      phase: () => this.phase,
      info: () => ({
        pos: [this.ship.pos.x, this.ship.pos.y, this.ship.pos.z],
        speed: this.ship.speed,
        stage: this.stage,
        sgraDistLy: this.ship.pos.length(),
        solDistLy: this.ship.pos.distanceTo(SUN_POS),
        dilation: gravitationalDilation(this.ship.pos.length()),
        region: regionAt(this.ship.pos),
        discoveries: this.log.count,
        near: this.deps.camera.near,
        far: this.deps.camera.far,
      }),
      teleport: (x: number, y: number, z: number) => {
        this.ship.pos.set(x, y, z);
        this.ship.fullStop();
      },
      teleportToSgra: (distLy: number) => {
        this.ship.pos.set(-distLy, 0, 0);
        this.ship.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0));
        this.ship.fullStop();
      },
      aimAt: (x: number, y: number, z: number) => {
        galToScene(x - this.ship.pos.x, y - this.ship.pos.y, z - this.ship.pos.z, this.tmpS);
        this.tmpV.set(this.tmpS.x, this.tmpS.y, this.tmpS.z).normalize();
        this.ship.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.tmpV);
      },
      routeToSgra: () => this.ship.engageRoute('Sagittarius A*', new Vec3d(0, 0, 0), 0.0063),
      setThrottle: (i: number) => {
        this.ship.throttleIndex = i;
      },
      scan: () => this.startScan(),
      openMap: () => this.map?.show(),
      flare: () => this.gscene?.flares.trigger(1.5),
      scene: () => this.gscene?.scene,
    };
  }

  dispose(): void {
    this.detachInput();
    this.gscene?.dispose();
    this.map?.dispose();
    this.hud.dispose();
    this.logPanel.root.remove();
    this.audio.dispose();
    this.lens?.dispose();
    this.veil.remove();
  }
}
