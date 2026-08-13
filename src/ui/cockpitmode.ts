/**
 * Cockpit mode: sitting inside the observation craft.
 *
 * Two rotations, kept strictly apart, are what make this feel like a vessel
 * rather than a camera wearing a spaceship costume:
 *
 *   ship  - where the hull is pointing. Steered, and slow to come round.
 *   head  - where you are looking *inside* the cabin. Free, instant, 360°.
 *
 * The scene camera gets ship × head, and the cabin gets head alone. So the
 * frame stays welded to the vessel while the universe swings past outside, and
 * turning your head 180° shows you the real objects behind the ship through the
 * rear glass - the same scene, from the other side, never a substitute backdrop.
 *
 * Throttle and time compression are separate systems with separate controls and
 * separate readouts, and the HUD says so. The throttle moves the ship through
 * space; time compression moves the planets. Neither one is the other, and the
 * two panels sit on opposite sides of the view so they are never confused.
 */
import * as THREE from 'three';
import type { AppState } from '../sim/state';
import { SPEED_PRESETS } from '../sim/state';
import type { SolarSystem } from '../scene/system';
import { Cockpit } from '../scene/cockpit';
import { FlightModel, MAX_SPEED_AU_S, CRUISE_SPEED_AU_S, sceneToAU } from '../sim/flight';
import { catalogObject } from '../data/catalog';
import { sound } from '../audio';

/** Bodies offered by the target cycler, in flight-plan order. */
const TARGETS = [
  'sun', 'mercury', 'venus', 'earth', 'moon', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'ceres',
];

const PITCH_LIMIT = THREE.MathUtils.degToRad(88);
const LOOK_SPEED = 0.0026; // radians per pixel
const SHIP_TURN = 0.9; // rad/s under manual steering
const ALIGN_RATE = 1.35; // rad/s when swinging onto a target

export interface CockpitDeps {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLElement;
  root: HTMLElement;
  state: AppState;
  system: SolarSystem;
  onExit: () => void;
}

export class CockpitMode {
  active = false;
  private cabin = new Cockpit();
  private flight = new FlightModel();
  private deps: CockpitDeps;

  /** Hull attitude, and the head's yaw/pitch within the cabin. */
  private shipQuat = new THREE.Quaternion();
  private yaw = 0;
  private pitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;

  private throttle = 0;
  private braking = false;
  private boosting = false;
  private assist = true;
  private targetId: string | null = null;
  private aligning = false;

  private keys = new Set<string>();
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private pointerId: number | null = null;

  private el!: HTMLElement;
  private hud: Record<string, HTMLElement> = {};
  private markProgade!: HTMLElement;
  private markTarget!: HTMLElement;

  private headQuat = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private fwd = new THREE.Vector3();
  private step = { x: 0, y: 0, z: 0 };
  private auA = { x: 0, y: 0, z: 0 };
  private auB = { x: 0, y: 0, z: 0 };
  private hudTimer = 0;

  constructor(deps: CockpitDeps) {
    this.deps = deps;
    this.buildHud();
    this.bindInput();
  }

  /* --------------------------------------------------------------- mode -- */

  enter(): void {
    if (this.active) return;
    this.active = true;
    const cam = this.deps.camera;
    // take the hull's attitude from wherever the camera was pointing, and start
    // the head centred on it so entering the cabin never snaps the view
    cam.getWorldDirection(this.fwd);
    this.shipQuat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.fwd.clone().normalize());
    this.yaw = this.pitch = this.targetYaw = this.targetPitch = 0;
    this.flight.halt();
    this.throttle = 0;
    this.targetId = null;
    this.aligning = false;
    this.el.hidden = false;
    this.deps.root.classList.add('in-cockpit');
    sound.play('select', 0.6);
    this.syncHud();
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.keys.clear();
    this.dragging = false;
    this.el.hidden = true;
    this.deps.root.classList.remove('in-cockpit');
    this.flight.halt();
    sound.play('back', 0.6);
    this.deps.onExit();
  }

  /* -------------------------------------------------------------- input -- */

  private bindInput(): void {
    const canvas = this.deps.canvas;

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (!this.active) return;
      this.dragging = true;
      this.pointerId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.active || !this.dragging || e.pointerId !== this.pointerId) return;
      // free look: yaw runs forever, pitch stops just short of straight up and
      // straight down so the horizon can never invert
      this.targetYaw -= (e.clientX - this.lastX) * LOOK_SPEED;
      this.targetPitch -= (e.clientY - this.lastY) * LOOK_SPEED;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -PITCH_LIMIT, PITCH_LIMIT);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const endDrag = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.dragging = false;
      this.pointerId = null;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') return; // the app owns the unwind chain
      // Capture phase, and nothing else sees it: while you are flying, the
      // keyboard belongs to the ship. Space is the brake here, not the app's
      // pause; the arrows steer, they do not switch worlds.
      e.stopImmediatePropagation();
      e.preventDefault();
      this.keys.add(k);
      if (k === 'z') {
        this.assist = !this.assist;
        this.flash(`Flight assist ${this.assist ? 'ON' : 'OFF'}`);
        sound.play('click', 0.5);
      } else if (k === 'x') {
        this.throttle = 0;
        sound.play('click', 0.4);
      } else if (k === 'c') {
        this.targetYaw = this.targetPitch = 0;
      } else if (k === 'g') {
        // point the nose where you are looking
        this.shipQuat.multiply(this.headQuat);
        this.targetYaw = this.targetPitch = 0;
        this.aligning = false;
        sound.play('click', 0.5);
      } else if (k === 't') {
        this.cycleTarget();
      } else if (k === 'n') {
        this.targetId = null;
        this.aligning = false;
        this.flash('Target cleared');
      } else if (k === '[') {
        this.deps.state.setSpeedIndex(this.deps.state.speedIndex - 1);
        this.flash(`Time compression ${SPEED_PRESETS[this.deps.state.speedIndex].label}`);
      } else if (k === ']') {
        this.deps.state.setSpeedIndex(this.deps.state.speedIndex + 1);
        this.flash(`Time compression ${SPEED_PRESETS[this.deps.state.speedIndex].label}`);
      } else if (k === 'p') {
        this.deps.state.setPaused(!this.deps.state.paused);
        this.flash(this.deps.state.paused ? 'Simulation clock paused' : 'Simulation clock running');
      }
    }, true);
    window.addEventListener('keyup', (e) => {
      if (this.active && e.key.toLowerCase() !== 'escape') e.stopImmediatePropagation();
      this.keys.delete(e.key.toLowerCase());
    }, true);
    window.addEventListener('blur', () => this.keys.clear());
  }

  private cycleTarget(): void {
    const list = TARGETS.filter((id) => catalogObject(id));
    if (!list.length) return;
    const i = this.targetId ? list.indexOf(this.targetId) : -1;
    this.targetId = list[(i + 1) % list.length];
    this.aligning = true;
    sound.play('select', 0.5);
    this.flash(`Target: ${catalogObject(this.targetId)?.name ?? this.targetId}`);
  }

  /* -------------------------------------------------------------- frame -- */

  update(dt: number): void {
    if (!this.active) return;
    const { camera, state, system } = this.deps;

    // ---- throttle, brake, boost
    const k = this.keys;
    if (k.has('w')) this.throttle = Math.min(1, this.throttle + dt * 0.85);
    if (k.has('s')) this.throttle = Math.max(0, this.throttle - dt * 0.85);
    // Braking cuts the throttle as it bites. Without this the ship leaps back
    // to the commanded speed the instant you let go of the brake, which is
    // technically what a throttle means and is nobody's idea of stopping.
    this.braking = k.has(' ');
    if (this.braking) this.throttle = 0;
    this.boosting = k.has('shift');

    // ---- steering: manual arrows, or swing onto the target
    const yawIn = (k.has('arrowleft') ? 1 : 0) - (k.has('arrowright') ? 1 : 0);
    const pitchIn = (k.has('arrowup') ? 1 : 0) - (k.has('arrowdown') ? 1 : 0);
    if (yawIn || pitchIn) {
      this.aligning = false;
      this.tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawIn * SHIP_TURN * dt);
      this.shipQuat.multiply(this.tmpQ);
      this.tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchIn * SHIP_TURN * dt);
      this.shipQuat.multiply(this.tmpQ);
    } else if (this.aligning && this.targetId) {
      system.bodyPosition(this.targetId, this.tmpV);
      this.tmpV.sub(camera.position);
      if (this.tmpV.lengthSq() > 1e-12) {
        this.tmpV.normalize();
        this.tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.tmpV);
        const before = this.shipQuat.angleTo(this.tmpQ);
        this.shipQuat.rotateTowards(this.tmpQ, ALIGN_RATE * dt);
        if (before < 0.01) this.aligning = false;
      }
    }

    // ---- head: damped toward the drag target, so looking around has weight
    const smooth = 1 - Math.exp(-dt * 14);
    this.yaw += (this.targetYaw - this.yaw) * smooth;
    this.pitch += (this.targetPitch - this.pitch) * smooth;
    this.headQuat.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    // ---- fly
    this.fwd.set(0, 0, -1).applyQuaternion(this.shipQuat);
    this.flight.step(dt, this.fwd, {
      throttle: this.throttle,
      brake: this.braking,
      boost: this.boosting,
      assist: this.assist,
    });
    this.flight.sceneStep(dt, camera.position.length(), state.scaleT, this.step);
    camera.position.x += this.step.x;
    camera.position.y += this.step.y;
    camera.position.z += this.step.z;

    // ---- the scene camera is hull attitude composed with where you are looking
    camera.quaternion.copy(this.shipQuat).multiply(this.headQuat);
    // inside a cabin the near plane can sit close; the cabin has its own camera
    if (camera.near !== 0.02) {
      camera.near = 0.02;
      camera.updateProjectionMatrix();
    }

    this.cabin.setHead(this.headQuat, camera.fov, camera.aspect);
    this.cabin.update(dt);

    this.hudTimer += dt;
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0;
      this.syncHud();
    }
    this.updateMarkers();
  }

  /** Diagnostic: what the ship is actually doing right now. */
  get info(): {
    active: boolean; speedAUs: number; throttle: number; assist: boolean;
    boost: boolean; target: string | null; yawDeg: number; pitchDeg: number;
    timeCompression: string;
  } {
    return {
      active: this.active,
      speedAUs: this.flight.speedAUs,
      throttle: this.throttle,
      assist: this.assist,
      boost: this.boosting,
      target: this.targetId,
      yawDeg: THREE.MathUtils.radToDeg(this.yaw),
      pitchDeg: THREE.MathUtils.radToDeg(this.pitch),
      timeCompression: SPEED_PRESETS[this.deps.state.speedIndex].label,
    };
  }

  /** Test/debug hook: drive the head without a pointer. */
  lookTo(yawDeg: number, pitchDeg: number): void {
    this.targetYaw = THREE.MathUtils.degToRad(yawDeg);
    this.targetPitch = THREE.MathUtils.clamp(
      THREE.MathUtils.degToRad(pitchDeg), -PITCH_LIMIT, PITCH_LIMIT,
    );
  }

  render(renderer: THREE.WebGLRenderer): void {
    if (!this.active) return;
    this.cabin.render(renderer);
  }

  /* ---------------------------------------------------------------- HUD -- */

  private buildHud(): void {
    const el = document.createElement('div');
    el.className = 'ckpt';
    el.hidden = true;
    el.innerHTML = `
      <div class="ckpt-nose" aria-hidden="true"></div>
      <div class="ckpt-mark ckpt-prograde" aria-hidden="true"><span></span></div>
      <div class="ckpt-mark ckpt-tgt" aria-hidden="true"><span></span></div>

      <div class="ckpt-panel ckpt-flight">
        <div class="u-label">Ship</div>
        <div class="ckpt-speed"><b>0.000</b> <i>AU/s</i></div>
        <div class="ckpt-kms">0 km/s</div>
        <div class="ckpt-thr"><div class="ckpt-thr-fill"></div><div class="ckpt-thr-cruise"></div></div>
        <div class="ckpt-thr-label">Throttle <b>0%</b></div>
        <div class="ckpt-flags"><span class="ckpt-assist">ASSIST</span><span class="ckpt-boost">BOOST</span></div>
      </div>

      <div class="ckpt-panel ckpt-time">
        <div class="u-label">Time compression</div>
        <div class="ckpt-tc"><b>1 day / s</b></div>
        <div class="ckpt-tc-note">Simulation clock — independent of ship speed</div>
      </div>

      <div class="ckpt-target"><b></b><span></span></div>
      <div class="ckpt-flash" aria-live="polite"></div>

      <div class="ckpt-keys">
        <span><kbd>drag</kbd> look around</span>
        <span><kbd>W</kbd><kbd>S</kbd> throttle</span>
        <span><kbd>Space</kbd> brake</span>
        <span><kbd>Shift</kbd> boost</span>
        <span><kbd>↑↓←→</kbd> steer</span>
        <span><kbd>G</kbd> nose to view</span>
        <span><kbd>C</kbd> centre view</span>
        <span><kbd>T</kbd> target</span>
        <span><kbd>Z</kbd> assist</span>
        <span><kbd>[</kbd><kbd>]</kbd> time</span>
      </div>
      <button class="chip ckpt-exit">Leave cockpit <kbd>Esc</kbd></button>
    `;
    this.deps.root.appendChild(el);
    this.el = el;
    el.querySelector<HTMLButtonElement>('.ckpt-exit')!.addEventListener('click', () => this.exit());
    this.markProgade = el.querySelector('.ckpt-prograde')!;
    this.markTarget = el.querySelector('.ckpt-tgt')!;
    for (const key of ['speed', 'kms', 'thr-fill', 'thr-label', 'assist', 'boost', 'tc', 'target', 'flash']) {
      this.hud[key] = el.querySelector(`.ckpt-${key}`)!;
    }
    // the cruise/boost boundary, drawn once
    el.querySelector<HTMLElement>('.ckpt-thr-cruise')!.style.left = `${(CRUISE_SPEED_AU_S / MAX_SPEED_AU_S) * 100}%`;
  }

  private flash(msg: string): void {
    const f = this.hud.flash;
    f.textContent = msg;
    f.classList.remove('show');
    // restart the animation
    void f.offsetWidth;
    f.classList.add('show');
  }

  private syncHud(): void {
    const f = this.flight;
    (this.hud.speed.querySelector('b') as HTMLElement).textContent = f.speedAUs.toFixed(3);
    this.hud.kms.textContent = `${Math.round(f.speedKmS).toLocaleString()} km/s`;
    // the bar is scaled to the boost ceiling, so engaging boost visibly opens
    // up headroom rather than silently rescaling what you were already reading
    const frac = (this.throttle * (this.boosting ? MAX_SPEED_AU_S : CRUISE_SPEED_AU_S)) / MAX_SPEED_AU_S;
    (this.hud['thr-fill'] as HTMLElement).style.width = `${Math.round(frac * 100)}%`;
    (this.hud['thr-label'].querySelector('b') as HTMLElement).textContent = `${Math.round(this.throttle * 100)}%`;
    this.hud.assist.classList.toggle('on', this.assist);
    this.hud.boost.classList.toggle('on', this.boosting);
    (this.hud.tc.querySelector('b') as HTMLElement).textContent = this.deps.state.paused
      ? 'Paused'
      : SPEED_PRESETS[this.deps.state.speedIndex].label;

    const tEl = this.hud.target;
    if (!this.targetId) {
      tEl.classList.remove('show');
    } else {
      const def = catalogObject(this.targetId);
      const t = this.deps.state.scaleT;
      this.deps.system.bodyPosition(this.targetId, this.tmpV);
      // both ends converted out of the scene's compressed radius, then measured
      sceneToAU(this.tmpV, t, this.auA);
      sceneToAU(this.deps.camera.position, t, this.auB);
      const au = Math.hypot(
        this.auA.x - this.auB.x,
        this.auA.y - this.auB.y,
        this.auA.z - this.auB.z,
      );
      const speed = f.speedAUs;
      const eta = speed > 1e-4 ? au / speed : Infinity;
      (tEl.querySelector('b') as HTMLElement).textContent = def?.name ?? this.targetId;
      (tEl.querySelector('span') as HTMLElement).textContent =
        `${au.toFixed(2)} AU${Number.isFinite(eta) ? ` · ETA ${fmtEta(eta)}` : ''}`;
      tEl.classList.add('show');
    }
  }

  /** Prograde and target markers, projected onto the glass each frame. */
  private updateMarkers(): void {
    const cam = this.deps.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;

    const place = (el: HTMLElement, world: THREE.Vector3) => {
      this.tmpV2.copy(world).project(cam);
      const behind = this.tmpV2.z > 1;
      if (behind) {
        el.classList.remove('show');
        return;
      }
      el.classList.add('show');
      el.style.transform = `translate(${(this.tmpV2.x * 0.5 + 0.5) * w}px, ${(-this.tmpV2.y * 0.5 + 0.5) * h}px)`;
    };

    const v = this.flight.velocity;
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed > 1e-4) {
      this.tmpV.set(v.x, v.y, v.z).normalize().multiplyScalar(10).add(cam.position);
      place(this.markProgade, this.tmpV);
    } else {
      this.markProgade.classList.remove('show');
    }

    if (this.targetId) {
      this.deps.system.bodyPosition(this.targetId, this.tmpV);
      place(this.markTarget, this.tmpV);
    } else {
      this.markTarget.classList.remove('show');
    }
  }

  dispose(): void {
    this.cabin.dispose();
    this.el.remove();
  }
}

function fmtEta(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}
