/** Camera rig: OrbitControls + cinematic fly-to flights + body following. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { isTouch, onDeviceChange } from '../ui/device';

export interface BodyFocus {
  position: THREE.Vector3;
  radius: number;
}

type FocusGetter = () => BodyFocus;

interface Flight {
  t: number;
  duration: number;
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  dir: THREE.Vector3; // approach direction captured at launch
  factor: number; // distance = radius × factor, resolved fresh each frame
  getFocus: FocusGetter;
  minDistanceOnArrive?: number;
  onArrive?: () => void;
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const REDUCED_MOTION =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private flight: Flight | null = null;
  private follow: FocusGetter | null = null;
  private prevFollowPos = new THREE.Vector3();
  private prevFollowRadius = 0;
  /** Distance the smooth wheel zoom is easing toward; null = at rest. */
  private wheelZoomTarget: number | null = null;
  private zoomOffset = new THREE.Vector3();

  constructor(dom: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.02,
      20000,
    );
    this.camera.position.set(0, 165, 335);

    // Smooth wheel zoom. OrbitControls applies a fixed step per wheel EVENT -
    // sign only, magnitude ignored - so a mouse notch lands as an instant
    // jump and a trackpad's event stream zooms in harsh stutters. Instead the
    // wheel drives a target distance (per-pixel, so mouse and trackpad agree)
    // and update() eases the camera toward it in log space. Registered BEFORE
    // OrbitControls is constructed: at the same element and phase, listeners
    // fire in registration order, so stopImmediatePropagation() below is what
    // keeps OrbitControls' own stepped handler from double-applying the event.
    dom.addEventListener('wheel', (e: WheelEvent) => this.onWheel(e), { passive: false });

    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.6;
    this.controls.minDistance = 0.01;
    this.controls.maxDistance = 12000;
    this.controls.autoRotate = !REDUCED_MOTION;
    this.controls.autoRotateSpeed = 0.12;
    this.applyInputFeel();
    onDeviceChange(() => this.applyInputFeel());

    dom.addEventListener('pointerdown', () => {
      this.controls.autoRotate = false;
    });
  }

  /**
   * Tune the controls to the input device.
   *
   * A mouse moves the cursor a long way for a small hand movement; a finger
   * drags the pixel it is touching. Reusing the mouse's rotate speed on touch
   * makes the system feel like it is on ice, and the mouse wheel's zoom step
   * has no equivalent in a pinch, where the gesture already carries the
   * magnitude. Heavier damping also hides the lower sample rate of touch
   * events on mid-range phones.
   */
  private applyInputFeel(): void {
    const touch = isTouch();
    this.controls.rotateSpeed = touch ? 0.38 : 0.55;
    // a pinch already carries its own magnitude: the distance ratio between
    // the fingers IS the zoom, so amplifying it makes the camera outrun the
    // gesture (a 3.3x pinch was moving the camera 6x)
    this.controls.zoomSpeed = touch ? 1.0 : 0.9;
    this.controls.panSpeed = touch ? 0.85 : 0.6;
    this.controls.dampingFactor = touch ? 0.11 : 0.06;
    // one finger orbits, two pinch-zoom and pan - the natural mapping, and
    // not what OrbitControls picks by default for the second finger
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  }

  private onWheel(e: WheelEvent): void {
    // during flights and in spacecraft/galaxy modes the controls are disabled
    // and someone else owns the wheel - let the event through untouched
    if (!this.controls.enabled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // one unit per pixel, whatever the delta mode reports in
    const px =
      e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
    // a single inertial trackpad fling can report a huge delta - cap the
    // burst so no one event teleports the target across the scene
    const step = THREE.MathUtils.clamp(px, -420, 420);
    const current =
      this.wheelZoomTarget ?? this.camera.position.distanceTo(this.controls.target);
    // exponential zoom: equal wheel travel = equal RATIO of distance, which
    // is what makes zooming feel uniform from 0.1 AU out to 1,000
    this.wheelZoomTarget = THREE.MathUtils.clamp(
      current * Math.exp(step * 0.00052),
      this.controls.minDistance,
      this.controls.maxDistance,
    );
  }

  /** Ease the camera toward the wheel's target distance, log-space, at a
   *  frame-rate-independent rate. Runs after controls.update() so damped
   *  rotation and the smooth dolly compose instead of fighting. */
  private updateWheelZoom(dt: number): void {
    if (this.wheelZoomTarget === null) return;
    if (!this.controls.enabled) {
      // a flight or another mode took the camera mid-ease - stand down
      this.wheelZoomTarget = null;
      return;
    }
    const offset = this.zoomOffset.copy(this.camera.position).sub(this.controls.target);
    const dist = offset.length();
    if (dist < 1e-9) {
      this.wheelZoomTarget = null;
      return;
    }
    // limits can change under us (scale-mode morph retunes maxDistance)
    const target = THREE.MathUtils.clamp(
      this.wheelZoomTarget,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    // ~0.5 s to settle: fast enough to feel connected to the wheel, slow
    // enough that even a six-notch burst never moves 5% in one 60 fps frame
    const k = REDUCED_MOTION ? 1 : 1 - Math.exp(-dt * 8);
    const next = Math.exp(THREE.MathUtils.lerp(Math.log(dist), Math.log(target), k));
    this.camera.position
      .copy(this.controls.target)
      .addScaledVector(offset.multiplyScalar(1 / dist), next);
    // settled within a tenth of a percent - snap and go quiet
    if (Math.abs(Math.log(next / target)) < 1e-3) this.wheelZoomTarget = null;
  }

  /** Distance the flight is aiming for, given the focus size right now. */
  private static flightDistance(radius: number, factor: number): number {
    return Math.max(radius * factor, radius + 0.002);
  }

  /** Fly toward a (possibly moving, possibly resizing) body and follow it on arrival. */
  flyTo(
    getFocus: FocusGetter,
    opts: {
      distanceFactor?: number;
      minDistanceOnArrive?: number;
      litSide?: boolean;
      onArrive?: () => void;
    } = {},
  ): void {
    const focus = getFocus();
    const factor = opts.distanceFactor ?? 5.5;
    const distance = CameraRig.flightDistance(focus.radius, factor);
    const dir = this.camera.position.clone().sub(focus.position);
    if (dir.lengthSq() < 1e-12) dir.set(0, 0.4, 1);
    dir.normalize();
    // arrive over the day side: bias the approach toward the Sun (at origin),
    // keeping enough of the old direction that the terminator stays visible
    if (opts.litSide && focus.position.lengthSq() > 1) {
      const sunward = focus.position.clone().multiplyScalar(-1).normalize();
      dir.multiplyScalar(0.5).addScaledVector(sunward, 0.5).normalize();
    }
    // guarantee a pleasant elevation on approach
    if (Math.abs(dir.y) < 0.18) {
      dir.y = 0.28;
      dir.normalize();
    }
    const travel = this.camera.position.distanceTo(
      focus.position.clone().add(dir.clone().multiplyScalar(distance)),
    );
    this.flight = {
      t: 0,
      duration: REDUCED_MOTION ? 0.05 : THREE.MathUtils.clamp(0.9 + travel * 0.004, 1.1, 2.6),
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      dir,
      factor,
      getFocus,
      minDistanceOnArrive: opts.minDistanceOnArrive,
      onArrive: opts.onArrive,
    };
    this.follow = null;
    this.wheelZoomTarget = null;
    this.controls.enabled = false;
    this.controls.autoRotate = false;
  }

  get isFlying(): boolean {
    return this.flight !== null;
  }

  /** Hand the camera to another owner (spacecraft mode): drop any flight or
   *  follow in progress and stop the orbit controls from touching it. */
  release(): void {
    this.flight = null;
    this.follow = null;
    this.wheelZoomTarget = null;
    this.controls.enabled = false;
    this.controls.autoRotate = false;
  }

  /** Take the camera back, re-aiming the orbit controls at `target`. */
  resume(target: THREE.Vector3): void {
    this.flight = null;
    this.follow = null;
    this.wheelZoomTarget = null;
    this.controls.target.copy(target);
    this.controls.minDistance = 0.01;
    this.controls.enabled = true;
    this.controls.update();
  }

  update(dt: number): void {
    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      const k = easeInOutCubic(Math.min(1, f.t / f.duration));
      const focus = f.getFocus();
      // resolve the approach distance from the CURRENT radius so flights track
      // the explorer ↔ true-scale morph instead of freezing launch-time values
      const distance = CameraRig.flightDistance(focus.radius, f.factor);
      const endPos = focus.position.clone().add(f.dir.clone().multiplyScalar(distance));
      const lift = REDUCED_MOTION ? 0 : f.fromPos.distanceTo(endPos) * 0.06;
      const pos = f.fromPos.clone().lerp(endPos, k);
      pos.y += Math.sin(k * Math.PI) * lift;
      this.camera.position.copy(pos);
      this.controls.target.copy(f.fromTarget.clone().lerp(focus.position, k));

      if (f.t >= f.duration) {
        const arrived = f;
        this.flight = null;
        this.controls.enabled = true;
        this.follow = arrived.getFocus;
        const fc = this.follow();
        this.prevFollowPos.copy(fc.position);
        this.prevFollowRadius = fc.radius;
        this.controls.minDistance =
          arrived.minDistanceOnArrive ?? Math.max(fc.radius * 1.75, 0.003);
        arrived.onArrive?.();
      }
    } else if (this.follow) {
      const fc = this.follow();
      // ride along with the body; move target by delta (not copy) so user
      // panning survives while the follow keeps tracking the body's motion
      const delta = fc.position.clone().sub(this.prevFollowPos);
      this.camera.position.add(delta);
      this.controls.target.add(delta);
      // if the body's display size is changing (scale-mode morph), zoom with it
      if (this.prevFollowRadius > 1e-9 && Math.abs(fc.radius - this.prevFollowRadius) > 1e-9) {
        const ratio = fc.radius / this.prevFollowRadius;
        const offset = this.camera.position.clone().sub(fc.position).multiplyScalar(ratio);
        this.camera.position.copy(fc.position).add(offset);
        const targetOffset = this.controls.target.clone().sub(fc.position).multiplyScalar(ratio);
        this.controls.target.copy(fc.position).add(targetOffset);
        this.controls.minDistance = Math.max(fc.radius * 1.75, 0.003);
        // an in-flight wheel ease rides the same morph, or it would fight it
        if (this.wheelZoomTarget !== null) this.wheelZoomTarget *= ratio;
      }
      this.prevFollowPos.copy(fc.position);
      this.prevFollowRadius = fc.radius;
    }

    this.controls.update();
    this.updateWheelZoom(dt);

    // dynamic near plane keeps depth precision at every zoom level
    const dist = this.camera.position.distanceTo(this.controls.target);
    const near = THREE.MathUtils.clamp(dist * 0.02, 0.0001, 2);
    if (Math.abs(near - this.camera.near) / this.camera.near > 0.2) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
