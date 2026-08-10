/** Application shell: renderer, post-processing, input, and UI wiring. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SolarSystem } from './scene/system';
import { CameraRig } from './scene/camera';
import type { GeneratedTextures } from './scene/textures';
import { AppState } from './sim/state';
import { mapDistanceAU } from './sim/scale';
import { Hud } from './ui/hud';
import { InfoPanel } from './ui/infopanel';
import { Labels } from './ui/labels';
import { CompareOverlay, GravityOverlay } from './ui/overlays';
import { Tour, type TourHost } from './ui/tour';
import { SUN, PLANETS } from './data/bodies';

const CYCLE_IDS = ['sun', ...PLANETS.map((p) => p.id)];

export class App implements TourHost {
  readonly state = new AppState();
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private rig: CameraRig;
  private system: SolarSystem;
  private hud: Hud;
  private infoPanel: InfoPanel;
  private labels: Labels;
  private compare: CompareOverlay;
  private gravity: GravityOverlay;
  private tour: Tour;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private scaleTarget = 0;
  private liveTimer = 0;
  private slowFrames = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downPos: { x: number; y: number; t: number } | null = null;
  private tmpV = new THREE.Vector3();

  constructor(root: HTMLElement, textures: GeneratedTextures) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'scene';
    this.renderer.domElement.setAttribute('aria-label', '3D view of the Solar System');
    root.appendChild(this.renderer.domElement);

    this.system = new SolarSystem(textures);
    this.rig = new CameraRig(this.renderer.domElement);
    this.rig.camera.position.set(40, 320, 720);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.system.scene, this.rig.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55,
      0.7,
      0.85,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // ---- UI ----
    this.labels = new Labels(root, this.state);
    this.hud = new Hud(root, this.state, {
      onTour: () => this.tour.start(),
      onCompare: () => this.compare.open(),
      onGravity: () => this.gravity.open(),
    });
    this.infoPanel = new InfoPanel(root, this.state, () => this.compare.open());
    this.compare = new CompareOverlay(root);
    this.gravity = new GravityOverlay(root);
    this.tour = new Tour(root, this);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.setAttribute('role', 'status');
    root.appendChild(this.toastEl);

    // ---- state wiring ----
    this.state.on('select', (id) => {
      this.system.setHighlightedOrbit(id);
      this.updateViewOffset();
      if (id) this.focusBody(id);
      else this.focusOverview();
    });
    this.state.on('tour', () => this.updateViewOffset());
    this.state.on('scale', (mode) => {
      this.scaleTarget = mode === 'true' ? 1 : 0;
      if (mode === 'true') {
        this.toast(
          'True scale',
          'Sizes and distances are now physically proportional. The emptiness you see is real — use the labels to find the planets.',
        );
      } else {
        this.toast(
          'Explorer view',
          'Distances compressed and planets enlarged so the whole system stays browsable.',
        );
      }
    });
    this.state.on('toggles', () => {
      this.system.setOrbitsVisible(this.state.showOrbits);
      this.system.setHZVisible(this.state.showHZ);
    });

    // ---- input ----
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      this.downPos = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.downPos) return;
      const dx = e.clientX - this.downPos.x;
      const dy = e.clientY - this.downPos.y;
      const dt = performance.now() - this.downPos.t;
      this.downPos = null;
      if (dx * dx + dy * dy > 36 || dt > 500) return; // it was a drag
      this.pick(e.clientX, e.clientY);
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.hud.updateClock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------ tour host --

  focusBody(id: string, distanceFactor?: number): void {
    const factor = distanceFactor ?? (id === 'sun' ? 4.2 : 5.5);
    this.rig.flyTo(
      () => ({
        position: this.system.bodyPosition(id, this.tmpV).clone(),
        radius: this.system.bodyRadius(id, this.state.scaleT),
      }),
      { distanceFactor: factor, litSide: id !== 'sun' },
    );
  }

  focusOverview(): void {
    this.rig.flyTo(
      () => {
        const dist = 265 * (1 - this.state.scaleT) + 5600 * this.state.scaleT;
        return { position: new THREE.Vector3(0, 0, 0), radius: dist / 5.5 };
      },
      { minDistanceOnArrive: 6 },
    );
  }

  focusBelt(): void {
    this.rig.flyTo(
      () => {
        const dir = this.tmpV.copy(this.rig.camera.position).setY(0);
        if (dir.lengthSq() < 1) dir.set(0, 0, 1);
        dir.normalize();
        const r = mapDistanceAU(2.7, this.state.scaleT);
        return {
          position: dir.clone().multiplyScalar(r),
          radius: 14 * (1 - this.state.scaleT) + 55 * this.state.scaleT,
        };
      },
      { distanceFactor: 3.2 },
    );
  }

  // --------------------------------------------------------------- input --

  private pick(clientX: number, clientY: number): void {
    this.pointer.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);
    const hits = this.raycaster.intersectObjects(this.system.pickables, false);
    if (hits.length > 0) {
      this.state.select(hits[0].object.name);
    } else if (this.state.selectedId) {
      this.state.select(null);
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        this.state.setPaused(!this.state.paused);
        break;
      case 'Escape':
        if (this.compare.isOpen) this.compare.close();
        else if (this.gravity.isOpen) this.gravity.close();
        else if (this.tour.active) this.tour.end();
        else if (this.state.selectedId) this.state.select(null);
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        const cur = this.state.selectedId ?? 'sun';
        const idx = CYCLE_IDS.indexOf(cur === 'moon' ? 'earth' : cur);
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = (idx + dir + CYCLE_IDS.length) % CYCLE_IDS.length;
        this.state.select(CYCLE_IDS[next]);
        break;
      }
    }
  }

  // --------------------------------------------------------------- frame --

  private frame(): void {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    this.elapsed += dt;
    this.state.tick(dt);

    // animate the explorer ↔ true-scale morph
    const diff = this.scaleTarget - this.state.scaleT;
    if (Math.abs(diff) > 0.0005) {
      this.state.scaleT += diff * Math.min(1, dt * 1.6);
    } else if (this.state.scaleT !== this.scaleTarget) {
      this.state.scaleT = this.scaleTarget;
    }

    this.system.update(this.state.simDays, this.state.scaleT, this.elapsed, this.rig.camera.position);
    // camera flights advance on wall-clock time so they finish on schedule
    // even when the GPU is struggling
    this.rig.update(Math.min(rawDt, 0.5));
    this.labels.update(this.system, this.rig.camera, this.state);

    this.liveTimer += dt;
    if (this.liveTimer > 1) {
      this.liveTimer = 0;
      this.hud.updateClock();
      this.infoPanel.updateLive();
      if (this.toastTimer > 0 && this.elapsed > this.toastTimer) {
        this.toastEl.classList.remove('show');
        this.toastTimer = 0;
      }
    }

    // adaptive resolution: back off pixel ratio if frames stay slow
    if (dt > 0.034) {
      if (++this.slowFrames > 90) {
        const pr = this.renderer.getPixelRatio();
        if (pr > 1) {
          this.renderer.setPixelRatio(Math.max(1, pr - 0.25));
          this.composer.setPixelRatio(this.renderer.getPixelRatio());
        }
        this.slowFrames = 0;
      }
    } else if (this.slowFrames > 0) {
      this.slowFrames--;
    }

    this.composer.render();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.rig.resize(w, h);
    this.updateViewOffset();
  }

  /** On small screens the info panel / tour card covers the lower half, so
   *  shift the projection centre to keep the focused body visible above it. */
  private updateViewOffset(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const covered = w <= 720 && (this.state.selectedId !== null || this.state.tourStep !== null);
    if (covered) this.rig.camera.setViewOffset(w, h, 0, h * 0.16, w, h);
    else this.rig.camera.clearViewOffset();
  }

  private toast(title: string, text: string): void {
    this.toastEl.innerHTML = `<b>${title}</b>${text}`;
    this.toastEl.classList.add('show');
    this.toastTimer = this.elapsed + 6;
  }

  /** Landing-screen entry: sweep from the far establishing shot to overview. */
  enter(withTour: boolean): void {
    document.body.classList.remove('pre-entry');
    if (withTour) this.tour.start();
    else this.focusOverview();
  }

  /** Test hook: expose enough surface to drive the app headlessly. */
  get debug(): Record<string, unknown> {
    return {
      state: this.state,
      select: (id: string | null) => this.state.select(id),
      setScale: (m: 'explorer' | 'true') => this.state.setScaleMode(m),
      startTour: () => this.tour.start(),
      renderer: this.renderer,
      camera: this.rig.camera,
      isFlying: () => this.rig.isFlying,
      sun: SUN.name,
    };
  }
}
