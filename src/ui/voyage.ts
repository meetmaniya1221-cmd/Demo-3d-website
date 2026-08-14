/**
 * Crossing between stars.
 *
 * The camera is not teleported and no second scene is loaded. It flies along
 * the real straight line joining two stars, through the same universe the
 * planets are in, and the odometer on screen counts the real distance. What
 * changes halfway across is the origin: the scene's zero point is handed from
 * the star you left to the star you are arriving at, at the moment when both
 * are equally far away and neither is more than a point of light. Because the
 * camera's position is tracked in absolute light-years and converted into
 * scene units fresh every frame, that handover moves nothing on screen.
 *
 * The scale transition is the other half of the effect. Departure ends with the
 * home system reduced to a star; the cruise runs at interstellar compression;
 * arrival zooms back down into a system whose orbits are measured in
 * hundredths of an AU. The readout changes units underneath the traveller -
 * AU, then light-years and parsecs, then AU again - which is the point.
 */
import * as THREE from 'three';
import type { AppState } from '../sim/state';
import type { SolarSystem } from '../scene/system';
import {
  KM_PER_LY,
  LY_PER_PC,
  AU_PER_LY,
  SOL_ID,
  positionLyOf,
  unitsPerLy,
  compressionFactor,
  fmtSpan,
} from '../sim/interstellar';
import { starSystem } from '../data/catalog/starsystems';
import { sound } from '../audio';

const DEPART_SECONDS = 2.0;
const CRUISE_SECONDS = 5.6;
const ARRIVE_SECONDS = 2.4;

const REDUCED_MOTION =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export type VoyagePhase = 'idle' | 'departing' | 'cruising' | 'arriving';

export interface VoyageHost {
  state: AppState;
  system: SolarSystem;
  camera: THREE.PerspectiveCamera;
  /** Hand the camera over / take it back from the orbit rig. */
  releaseCamera: () => void;
  resumeCamera: (target: THREE.Vector3) => void;
  /** Frame the system we have just arrived at. */
  onArrive: (systemId: string, focusId: string | null) => void;
  announce: (text: string) => void;
}

function systemName(id: string): string {
  return id === SOL_ID ? 'The Solar System' : (starSystem(id)?.name ?? id);
}

export class Voyage {
  phase: VoyagePhase = 'idle';
  private host: VoyageHost;
  private root: HTMLElement;
  private fromEl!: HTMLElement;
  private toEl!: HTMLElement;
  private odoEl!: HTMLElement;
  private remainEl!: HTMLElement;
  private noteEl!: HTMLElement;
  private fill!: HTMLElement;
  private phaseEl!: HTMLElement;

  private fromId = SOL_ID;
  private toId = SOL_ID;
  private focusId: string | null = null;
  private t = 0;
  private totalLy = 0;
  private swapped = false;
  /** Absolute positions in light-years from the Sun, so the origin can move. */
  private startLy = new THREE.Vector3();
  private endLy = new THREE.Vector3();
  private departFrom = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private look = new THREE.Vector3();
  private uiTimer = 0;

  constructor(parent: HTMLElement, host: VoyageHost) {
    this.host = host;
    this.root = document.createElement('section');
    this.root.className = 'voyage-hud';
    this.root.inert = true;
    this.root.setAttribute('aria-label', 'Interstellar transit');
    this.root.innerHTML = `
      <div class="voyage-card">
        <div class="voyage-route">
          <span class="voyage-from"></span>
          <svg width="26" height="8" viewBox="0 0 26 8" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M0 4h23M19 1l4 3-4 3"/></svg>
          <span class="voyage-to"></span>
        </div>
        <div class="voyage-odo"><b></b></div>
        <div class="voyage-remain"></div>
        <div class="voyage-progress"><i class="fill"></i></div>
        <div class="voyage-phase"></div>
        <div class="voyage-note"></div>
        <div class="voyage-actions"><button class="chip skip" data-sfx="back">Skip transit</button></div>
      </div>
    `;
    this.fromEl = this.root.querySelector('.voyage-from')!;
    this.toEl = this.root.querySelector('.voyage-to')!;
    this.odoEl = this.root.querySelector('.voyage-odo b')!;
    this.remainEl = this.root.querySelector('.voyage-remain')!;
    this.noteEl = this.root.querySelector('.voyage-note')!;
    this.phaseEl = this.root.querySelector('.voyage-phase')!;
    this.fill = this.root.querySelector('.fill')!;
    this.root.querySelector('.skip')!.addEventListener('click', () => this.skip());
    parent.appendChild(this.root);
  }

  get active(): boolean {
    return this.phase !== 'idle';
  }

  get destination(): string {
    return this.toId;
  }

  /**
   * Fly to `systemId`, optionally focusing a particular star or planet on
   * arrival. Departing and arriving at the same system is a no-op.
   */
  start(systemId: string, focusId: string | null = null): void {
    if (this.active) return;
    const fromId = this.host.system.activeSystemId;
    if (fromId === systemId) return;

    this.fromId = fromId;
    this.toId = systemId;
    this.focusId = focusId;
    this.t = 0;
    this.swapped = false;
    this.phase = 'departing';

    const fromLy = positionLyOf(fromId);
    const toLy = positionLyOf(systemId);
    this.totalLy = fromLy.distanceTo(toLy);

    // Build the destination now, while there is a two-second departure to hide
    // the cost behind. Arriving at an empty sky and then popping seven planets
    // into it would be the one moment the illusion breaks.
    this.host.system.prepareSystem(systemId);

    const scaleT = this.host.state.scaleT;
    const uply = unitsPerLy(scaleT);
    const dirLy = this.tmp.copy(toLy).sub(fromLy).normalize().clone();

    // Departure point: back off from the home star along the line we are about
    // to fly, so the system we are leaving stays in frame ahead of us.
    const extent = this.homeExtent(scaleT);
    const backOff = Math.max(extent * 2.2, uply * 0.02);
    this.departFrom.copy(this.host.camera.position);
    this.startLy.copy(fromLy).addScaledVector(dirLy, -backOff / uply);

    // Arrival point: just outside the destination system, on the same line.
    const targetExtent = this.targetExtent(scaleT);
    this.endLy.copy(toLy).addScaledVector(dirLy, -(targetExtent * 1.9) / uply);

    this.host.releaseCamera();
    this.host.state.select(null);
    document.body.classList.add('voyage-active');
    this.root.inert = false;
    this.root.classList.add('open');
    this.fromEl.textContent = systemName(fromId);
    this.toEl.textContent = systemName(systemId);
    const squash = compressionFactor(scaleT);
    this.noteEl.textContent =
      `Light takes ${this.totalLy.toFixed(2)} years to make this crossing. ` +
      (squash < 1.02
        ? 'At true scale this is drawn exactly: one light-year on screen really is 63,241 AU.'
        : `Interstellar distances on screen are compressed about ${Math.round(squash).toLocaleString('en-US')}× - the layout is linear, so the stars keep their true relative distances.`);
    sound.play('select', 0.45);
    this.host.announce(
      `Interstellar transit to ${systemName(systemId)}, ${this.totalLy.toFixed(2)} light-years.`,
    );
    if (REDUCED_MOTION) this.finish();
  }

  /** Jump straight to the destination, keeping every state change intact. */
  skip(): void {
    if (!this.active) return;
    sound.play('back', 0.3);
    this.finish();
  }

  private homeExtent(scaleT: number): number {
    const foreign = this.host.system.foreign(this.fromId);
    if (foreign) return foreign.extent(scaleT);
    // the Solar System: Neptune's orbit is the useful outer marker
    return 30 * 100 * scaleT + 172 * (1 - scaleT);
  }

  private targetExtent(scaleT: number): number {
    const foreign = this.host.system.foreign(this.toId);
    if (foreign) return foreign.extent(scaleT);
    return 30 * 100 * scaleT + 172 * (1 - scaleT);
  }

  /** Absolute light-year position → scene units around the current origin. */
  private toScene(ly: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out
      .copy(ly)
      .sub(positionLyOf(this.host.system.activeSystemId))
      .multiplyScalar(unitsPerLy(this.host.state.scaleT));
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    const cam = this.host.camera;
    const scaleT = this.host.state.scaleT;

    if (this.phase === 'departing') {
      const k = easeInOut(Math.min(1, this.t / DEPART_SECONDS));
      this.toScene(this.startLy, this.tmp);
      cam.position.lerpVectors(this.departFrom, this.tmp, k);
      this.aimAtDestination(cam);
      this.paintProgress(0, 'Departing');
      if (this.t >= DEPART_SECONDS) {
        this.phase = 'cruising';
        this.t = 0;
      }
      return;
    }

    if (this.phase === 'cruising') {
      const u = Math.min(1, this.t / CRUISE_SECONDS);
      // accelerate out and decelerate in, so the middle of the crossing is the
      // fast part - which is also where there is nothing to look at
      const e = easeInOut(u);

      // Hand the origin over at the midpoint. Both stars are points of light
      // here and the camera's position is tracked in absolute light-years, so
      // nothing on screen moves.
      if (!this.swapped && e >= 0.5) {
        this.swapped = true;
        this.host.system.setActiveSystem(this.toId);
      }

      this.tmp.copy(this.startLy).lerp(this.endLy, e);
      this.toScene(this.tmp, this.tmp);
      cam.position.copy(this.tmp);
      this.aimAtDestination(cam);
      this.paintProgress(e, 'Interstellar cruise');
      if (this.t >= CRUISE_SECONDS) {
        this.phase = 'arriving';
        this.t = 0;
        if (!this.swapped) {
          this.swapped = true;
          this.host.system.setActiveSystem(this.toId);
        }
      }
      return;
    }

    // arriving: settle into a framing shot of the destination system
    const k = easeOut(Math.min(1, this.t / ARRIVE_SECONDS));
    const extent = this.targetExtent(scaleT);
    this.toScene(this.endLy, this.tmp);
    const arrival = this.look
      .copy(this.tmp)
      .normalize()
      .multiplyScalar(Math.max(extent * 0.85, 1e-4));
    arrival.y += extent * 0.32;
    cam.position.lerpVectors(this.tmp, arrival, k);
    cam.lookAt(0, 0, 0);
    this.paintProgress(1, 'Arriving');
    if (this.t >= ARRIVE_SECONDS) this.finish();
  }

  private aimAtDestination(cam: THREE.PerspectiveCamera): void {
    this.toScene(positionLyOf(this.toId), this.look);
    cam.lookAt(this.look);
  }

  /** Odometer and progress bar. Throttled - this is DOM work in a render loop. */
  private paintProgress(fraction: number, phaseLabel: string): void {
    this.uiTimer += 1;
    if (this.uiTimer % 3 !== 0) return;
    const travelledLy = this.totalLy * fraction;
    const remainingLy = Math.max(0, this.totalLy - travelledLy);
    this.odoEl.textContent = fmtSpan(travelledLy * KM_PER_LY);
    this.remainEl.textContent =
      remainingLy > 1e-6
        ? `${remainingLy.toFixed(3)} ly to run · ${(remainingLy / LY_PER_PC).toFixed(3)} pc · ${Math.round(remainingLy * AU_PER_LY).toLocaleString('en-US')} AU`
        : 'Arrived';
    this.fill.style.width = `${(fraction * 100).toFixed(1)}%`;
    this.phaseEl.textContent = phaseLabel;
  }

  private finish(): void {
    if (this.host.system.activeSystemId !== this.toId) {
      this.host.system.setActiveSystem(this.toId);
    }
    this.phase = 'idle';
    this.root.classList.remove('open');
    this.root.inert = true;
    document.body.classList.remove('voyage-active');
    this.host.onArrive(this.toId, this.focusId);
    this.host.announce(`Arrived at ${systemName(this.toId)}.`);
    this.focusId = null;
  }

  /** Cancel without arriving - used when another mode takes over the camera. */
  abort(): void {
    if (!this.active) return;
    this.phase = 'idle';
    this.root.classList.remove('open');
    this.root.inert = true;
    document.body.classList.remove('voyage-active');
    this.focusId = null;
  }
}
