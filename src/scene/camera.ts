/** Camera rig: OrbitControls + cinematic fly-to flights + body following. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
  distance: number;
  getFocus: FocusGetter;
  minDistanceOnArrive?: number;
  onArrive?: () => void;
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private flight: Flight | null = null;
  private follow: FocusGetter | null = null;
  private prevFollowPos = new THREE.Vector3();
  private prevFollowRadius = 0;
  private idleDrift = true;

  constructor(dom: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.02,
      20000,
    );
    this.camera.position.set(0, 165, 335);

    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.6;
    this.controls.minDistance = 0.01;
    this.controls.maxDistance = 12000;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.12;

    dom.addEventListener('pointerdown', () => {
      this.idleDrift = false;
      this.controls.autoRotate = false;
    }, { once: false });
  }

  /** Fly toward a (possibly moving) body and follow it on arrival. */
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
    const distance = Math.max(focus.radius * factor, focus.radius + 0.002);
    const dir = this.camera.position.clone().sub(focus.position);
    if (dir.lengthSq() < 1e-12) dir.set(0, 0.4, 1);
    dir.normalize();
    // arrive over the day side: bias the approach toward the Sun (at origin)
    if (opts.litSide && focus.position.lengthSq() > 1) {
      const sunward = focus.position.clone().multiplyScalar(-1).normalize();
      dir.multiplyScalar(0.35).addScaledVector(sunward, 0.65).normalize();
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
      duration: THREE.MathUtils.clamp(0.9 + travel * 0.004, 1.1, 2.6),
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      dir,
      distance,
      getFocus,
      minDistanceOnArrive: opts.minDistanceOnArrive,
      onArrive: opts.onArrive,
    };
    this.follow = null;
    this.controls.enabled = false;
    this.controls.autoRotate = false;
    this.idleDrift = false;
  }

  /** Stop following and glide back to the requested overview framing. */
  toOverview(distance: number, onArrive?: () => void): void {
    const focus: BodyFocus = { position: new THREE.Vector3(0, 0, 0), radius: distance / 5.5 };
    this.flyTo(() => focus, { onArrive });
  }

  get isFlying(): boolean {
    return this.flight !== null;
  }

  get isFollowing(): boolean {
    return this.follow !== null;
  }

  stopFollowing(): void {
    this.follow = null;
  }

  update(dt: number): void {
    if (this.flight) {
      const f = this.flight;
      f.t += dt;
      const k = easeInOutCubic(Math.min(1, f.t / f.duration));
      const focus = f.getFocus();
      const endPos = focus.position.clone().add(f.dir.clone().multiplyScalar(f.distance));
      const lift = f.fromPos.distanceTo(endPos) * 0.06;
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
      // ride along with the body
      const delta = fc.position.clone().sub(this.prevFollowPos);
      this.camera.position.add(delta);
      this.controls.target.copy(fc.position);
      // if the body's display size is changing (scale-mode morph), zoom with it
      if (this.prevFollowRadius > 1e-9 && Math.abs(fc.radius - this.prevFollowRadius) > 1e-9) {
        const ratio = fc.radius / this.prevFollowRadius;
        const offset = this.camera.position.clone().sub(fc.position).multiplyScalar(ratio);
        this.camera.position.copy(fc.position).add(offset);
        this.controls.minDistance = Math.max(fc.radius * 1.75, 0.003);
      }
      this.prevFollowPos.copy(fc.position);
      this.prevFollowRadius = fc.radius;
    }

    this.controls.update();

    // dynamic near plane keeps depth precision at every zoom level
    const dist = this.camera.position.distanceTo(this.controls.target);
    const near = THREE.MathUtils.clamp(dist * 0.02, 0.0001, 2);
    if (Math.abs(near - this.camera.near) / this.camera.near > 0.2) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    void this.idleDrift;
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
