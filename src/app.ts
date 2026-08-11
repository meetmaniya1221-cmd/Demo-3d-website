/** Application shell: renderer, post-processing, input, and UI wiring. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SolarSystem } from './scene/system';
import { enhanceSurfaces } from './scene/surfaces';
import { CameraRig } from './scene/camera';
import { sound } from './audio';
import type { GeneratedTextures } from './scene/textures';
import { AppState } from './sim/state';
import { mapDistanceAU } from './sim/scale';
import { Hud } from './ui/hud';
import { InfoPanel } from './ui/infopanel';
import { Labels } from './ui/labels';
import { LayersPanel } from './ui/layerspanel';
import { DistanceReadout } from './ui/distance';
import { SkyNotes } from './ui/skynotes';
import { CompareOverlay, GravityOverlay } from './ui/overlays';
import { StructureOverlay } from './ui/structure';
import { EarthMoonOverlay } from './ui/earthmoon';
import { Observatory } from './ui/observatory';
import { MissionsOverlay } from './ui/missions';
import { MeteorsOverlay } from './ui/meteors';
import { Search } from './ui/search';
import { Atlas } from './ui/atlas';
import { Journey } from './ui/journey';
import { Tour, type TourHost } from './ui/tour';
import { PLANETS } from './data/bodies';
import { catalogObject } from './data/catalog';
import { fmtSimDate } from './ui/format';

const CYCLE_IDS = ['sun', ...PLANETS.map((p) => p.id)];

const REDUCED_MOTION =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  private layersPanel: LayersPanel;
  private distance: DistanceReadout;
  private skyNotes: SkyNotes;
  private compare: CompareOverlay;
  private gravity: GravityOverlay;
  private structure: StructureOverlay;
  private earthMoon: EarthMoonOverlay;
  private observatory: Observatory;
  private missions: MissionsOverlay;
  private meteors: MeteorsOverlay;
  private search: Search;
  private atlas: Atlas;
  private journey: Journey;
  private tour: Tour;
  private toastEl: HTMLElement;
  private liveRegion!: HTMLElement;
  private toastTimer = 0;
  private frameTimeEma = 16;
  private goodFrames = 0;
  private lastPrChange = 0;
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
    // MSAA happens on the composer's render target, so the default framebuffer
    // does not need (and would waste) its own antialiasing
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'scene';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      '3D view of the Solar System. Use search, the atlas, or arrow keys to move between worlds.',
    );
    root.appendChild(this.renderer.domElement);

    this.system = new SolarSystem(textures, import.meta.env.BASE_URL);
    this.rig = new CameraRig(this.renderer.domElement);
    this.rig.camera.position.set(40, 320, 720);

    // NOTE: no multisampled render target here. MSAA resolve of HalfFloat
    // targets is glitchy on some ANGLE/D3D11 drivers (transient garbage values
    // that the bloom pass amplifies into white flashes), so the composer uses
    // its default single-sample HDR target.
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
    this.skyNotes = new SkyNotes(root, this.system);
    this.distance = new DistanceReadout(root);
    this.layersPanel = new LayersPanel(root, this.state, () => {
      if (this.state.selectedId) this.state.select(null);
      else this.focusOverview();
    });
    this.compare = new CompareOverlay(root);
    this.gravity = new GravityOverlay(root);
    this.structure = new StructureOverlay(root);
    this.earthMoon = new EarthMoonOverlay(root, this.state);
    this.observatory = new Observatory(root, this.state);
    this.missions = new MissionsOverlay(root, { selectObject: (id) => this.state.select(id) });
    this.meteors = new MeteorsOverlay(root, { selectObject: (id) => this.state.select(id) });
    this.search = new Search(root, {
      selectObject: (id) => this.state.select(id),
      openMission: (id) => this.missions.openAt(id),
      openSky: (id) => this.observatory.openFor(id),
    });
    this.atlas = new Atlas(root, this.state);
    this.journey = new Journey(root, {
      state: this.state,
      camera: this.rig.camera,
      setControlsEnabled: (v) => {
        this.rig.controls.enabled = v;
      },
      onEnd: () => this.focusOverview(),
    });
    this.hud = new Hud(root, this.state, {
      onTour: () => this.tour.start(),
      onCompare: () => this.compare.open(),
      onGravity: () => this.gravity.open(),
      onSearch: () => this.search.open(),
      onAtlas: () => this.atlas.toggle(),
      onJourney: () => this.startJourney(),
      onMissions: () => this.missions.open(),
      onMeteors: () => this.meteors.open(),
      onObservatory: () => this.observatory.open(),
    });
    this.infoPanel = new InfoPanel(root, this.state, {
      onCompare: (id) => (id ? this.compare.openWith(id) : this.compare.open()),
      onStructure: (id) => this.structure.openFor(id),
      onEarthMoon: () => this.earthMoon.open(),
      openMission: (id) => this.missions.openAt(id),
      liveAU: (id) => this.system.heliocentricAU(id),
      cometActivity: (id) => this.system.smallBodies.cometActivity(id),
    });
    this.tour = new Tour(root, this);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.setAttribute('role', 'status');
    root.appendChild(this.toastEl);

    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.style.cssText =
      'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
    root.appendChild(this.liveRegion);

    // ---- state wiring ----
    this.state.on('select', (id) => {
      // picking a destination leaves the journey; mere deselection does not
      if (id && this.journey.active) this.journey.end();
      this.system.setHighlightedOrbit(id && catalogObject(id)?.type !== 'region' ? id : null);
      this.updateViewOffset();
      if (id) {
        // choosing a destination mid-tour means leaving the tour
        if (this.tour.active) this.tour.dismiss();
        sound.play('select', 0.45);
        const def = catalogObject(id);
        if (def?.type === 'region') this.focusRegion(id);
        else this.focusBody(id);
        this.announce(`${def?.name ?? id} selected, details panel opened.`);
      } else {
        sound.play('back', 0.4);
        this.focusOverview();
      }
    });
    this.state.on('tour', () => this.updateViewOffset());
    this.state.on('timejump', () =>
      this.announce(`Simulation date set to ${fmtSimDate(this.state.simDays)}`),
    );
    this.state.on('scale', (mode) => {
      this.scaleTarget = mode === 'true' ? 1 : 0;
      if (this.journey.active) return; // journey narrates the scale itself
      if (mode === 'true') {
        // labels are the only way to find planets at true scale
        if (!this.state.showLabels) this.state.setToggle('showLabels', true);
        this.toast(
          'True scale',
          'Sizes and distances are now physically proportional. The emptiness you see is real - use the labels to find the planets.',
        );
      } else {
        this.toast(
          'Explorer view',
          'Distances compressed and planet sizes enhanced for browsing. Moons keep their true size relative to their planet.',
        );
      }
    });
    this.state.on('layers', () => {
      this.system.setLayers(this.state.layers);
      this.distance.setVisible(this.state.layers.distanceScale);
    });
    this.system.setLayers(this.state.layers);
    this.distance.setVisible(this.state.layers.distanceScale);

    // ---- input ----
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      sound.init();
      this.downPos = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    // soft tick for generic UI buttons (bodies get their own select sound)
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const btn = t.closest('button');
      if (!btn) return;
      // after a MOUSE click, release focus so arrow-key world cycling keeps
      // working (keyboard activation keeps focus for accessibility)
      if (e.detail > 0 && btn.closest('.top-actions, .view-toggles, .timebar, .rail')) {
        btn.blur();
      }
      if (btn.closest('.body-label') || btn.closest('.rail')) return;
      sound.play('click', 0.22);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.downPos) return;
      const dx = e.clientX - this.downPos.x;
      const dy = e.clientY - this.downPos.y;
      const dt = performance.now() - this.downPos.t;
      this.downPos = null;
      if (dx * dx + dy * dy > 36 || dt > 500) return; // it was a drag
      if (this.journey.active) return;
      this.pick(e.clientX, e.clientY);
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.hud.updateClock();
    this.renderer.setAnimationLoop(() => this.frame());

    // stream in the photographic surface maps over the procedural ones
    enhanceSurfaces(this.system);
  }

  // ------------------------------------------------------------ tour host --

  focusBody(id: string, distanceFactor?: number): void {
    const def = catalogObject(id);
    const factor =
      distanceFactor ?? (id === 'sun' ? 4.2 : def?.type === 'comet' ? 9 : 5.5);
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
    this.focusRegion('main-belt');
  }

  focusRegion(id: string): void {
    const spec =
      id === 'kuiper-belt'
        ? { rAU: 41, radius: 26, trueRadius: 320 }
        : id === 'oort-cloud'
          ? { rAU: 55, radius: 60, trueRadius: 1500 }
          : id === 'trojans'
            ? { rAU: 5.2, radius: 18, trueRadius: 160 }
            : { rAU: 2.7, radius: 14, trueRadius: 55 };
    this.rig.flyTo(
      () => {
        const dir = this.tmpV.copy(this.rig.camera.position).setY(0);
        if (dir.lengthSq() < 1) dir.set(0, 0, 1);
        dir.normalize();
        const r = mapDistanceAU(spec.rAU, this.state.scaleT);
        return {
          position: dir.clone().multiplyScalar(r),
          radius: spec.radius * (1 - this.state.scaleT) + spec.trueRadius * this.state.scaleT,
        };
      },
      { distanceFactor: 3.2 },
    );
    if (id === 'oort-cloud') {
      this.toast(
        'The Oort cloud',
        'It begins roughly 2,000 AU out - about 40× farther than the whole map you are looking at - and has never been observed directly.',
      );
    }
  }

  startJourney(): void {
    if (this.tour.active) this.tour.dismiss();
    this.atlas.close();
    if (this.search.isOpen) this.search.close();
    this.journey.start();
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
      // a moon's pick proxy can sit inside its parent's generous proxy -
      // prefer the moon when the ray also passes through it anywhere within
      // the parent's proxy depth
      let name = hits[0].object.name;
      const proxyDepth = hits[0].object.scale.x * 2.2 + 0.4;
      const moonHit = hits.find((hit) => {
        const def = catalogObject(hit.object.name);
        return def?.parent === name && hit.distance < hits[0].distance + proxyDepth;
      });
      if (moonHit) name = moonHit.object.name;
      this.state.select(name);
    } else if (this.state.selectedId) {
      this.state.select(null);
    }
  }

  private onKey(e: KeyboardEvent): void {
    // Escape always works, even from inside inputs/sliders
    if (e.key === 'Escape') {
      if (this.search.isOpen) this.search.close();
      else if (this.layersPanel.isOpen) this.layersPanel.setOpen(false);
      else if (this.compare.isOpen) this.compare.close();
      else if (this.gravity.isOpen) this.gravity.close();
      else if (this.structure.isOpen) this.structure.close();
      else if (this.earthMoon.isOpen) this.earthMoon.close();
      else if (this.observatory.isOpen) this.observatory.close();
      else if (this.missions.isOpen) this.missions.close();
      else if (this.meteors.isOpen) this.meteors.close();
      else if (this.journey.active) this.journey.end();
      else if (this.atlas.isOpen) this.atlas.close();
      else if (this.tour.active) this.tour.end();
      else if (this.state.selectedId) this.state.select(null);
      return;
    }
    // don't steal keys from focused interactive elements (Space activates
    // buttons, arrows drive sliders)
    const t = e.target;
    if (t instanceof HTMLElement && t.closest('button, input, select, textarea, a, [contenteditable]')) {
      return;
    }
    switch (e.key) {
      case ' ':
        e.preventDefault();
        this.state.setPaused(!this.state.paused);
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        let cur = this.state.selectedId ?? 'sun';
        // from a moon or small body, cycle relative to its parent/nearest planet
        if (!CYCLE_IDS.includes(cur)) {
          const def = catalogObject(cur);
          cur = def?.parent && CYCLE_IDS.includes(def.parent) ? def.parent : 'sun';
        }
        const idx = CYCLE_IDS.indexOf(cur);
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

    // animate the explorer ↔ true-scale morph (snap under reduced motion).
    // The easing factor is time-normalized so the morph takes the same wall
    // time at any frame rate, and the asymptotic tail snaps early so orbit
    // geometry stops rebuilding as soon as the change is invisible.
    const diff = this.scaleTarget - this.state.scaleT;
    if (REDUCED_MOTION) {
      this.state.scaleT = this.scaleTarget;
    } else if (Math.abs(diff) > 0.002) {
      this.state.scaleT += diff * (1 - Math.exp(-dt * 1.6));
    } else if (this.state.scaleT !== this.scaleTarget) {
      this.state.scaleT = this.scaleTarget;
    }

    this.system.update(this.state.simDays, this.state.scaleT, this.elapsed, this.rig.camera);
    // camera flights advance on wall-clock time so they finish on schedule
    // even when the GPU is struggling
    if (this.journey.active) {
      this.journey.update(Math.min(rawDt, 0.5));
    } else {
      this.rig.update(Math.min(rawDt, 0.5));
    }
    const panelInset = this.state.selectedId && window.innerWidth > 720 ? 372 : 0;
    this.labels.update(this.system, this.rig.camera, this.state, panelInset);
    this.skyNotes.update(this.system, this.rig.camera, this.state);

    // right-edge distance readout: camera → focused body (or the Sun)
    if (this.state.layers.distanceScale) {
      const focusId = this.state.selectedId ?? 'sun';
      const def = catalogObject(focusId);
      this.system.bodyPosition(
        def && def.type !== 'region' ? focusId : 'sun',
        this.tmpV,
      );
      this.distance.update(
        this.rig.camera.position,
        this.tmpV,
        def && def.type !== 'region' ? (focusId === 'moon' ? 'the Moon' : (def?.name ?? 'the Sun')) : 'the Sun',
        this.state.scaleT,
      );
    }

    // deep true-scale views (Sedna's aphelion is 937 AU out) need a longer
    // far plane; explorer view keeps the tighter one for depth precision
    const wantFar = 22000 * (1 - this.state.scaleT) + 320000 * this.state.scaleT;
    if (Math.abs(wantFar - this.rig.camera.far) / this.rig.camera.far > 0.2) {
      this.rig.camera.far = wantFar;
      this.rig.camera.updateProjectionMatrix();
    }
    // zoom-out limit follows the scale mode: true scale needs to reach the
    // outermost aphelia (~940 AU = 94,000 units), explorer stays tight
    this.rig.controls.maxDistance = 12000 * (1 - this.state.scaleT) + 150000 * this.state.scaleT;

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

    // adaptive resolution: EMA of frame time with two-way hysteresis. Changes
    // recreate every post-processing target, so they are rate-limited - some
    // drivers show a garbage frame when targets churn mid-session. Clamp the
    // sample so one hidden-tab gap can't poison the average into a downscale.
    this.frameTimeEma += (Math.min(rawDt, 0.25) * 1000 - this.frameTimeEma) * 0.05;
    const pr = this.renderer.getPixelRatio();
    const maxPr = Math.min(window.devicePixelRatio || 1, 2);
    const cooledDown = this.elapsed - this.lastPrChange > 8;
    if (this.frameTimeEma > 34 && pr > 1) {
      if (++this.slowFrames > 45 && cooledDown) {
        this.setPixelRatio(Math.max(1, pr - 0.25));
        this.lastPrChange = this.elapsed;
        this.slowFrames = 0;
        this.goodFrames = 0;
      }
    } else if (this.frameTimeEma < 20 && pr < maxPr) {
      this.slowFrames = 0;
      if (++this.goodFrames > 600 && cooledDown) {
        this.setPixelRatio(Math.min(maxPr, pr + 0.25));
        this.lastPrChange = this.elapsed;
        this.goodFrames = 0;
      }
    } else {
      this.slowFrames = 0;
      this.goodFrames = 0;
    }

    this.composer.render();
  }

  private setPixelRatio(value: number): void {
    this.renderer.setPixelRatio(value);
    this.composer.setPixelRatio(value);
    this.system.markers.setPixelRatio(value);
    this.system.constellations.setPixelRatio(value);
    this.system.setPixelRatio(value);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    // composer.setSize resizes every pass (including bloom) in device pixels
    this.composer.setSize(w, h);
    this.rig.resize(w, h);
    this.updateViewOffset();
  }

  private announce(text: string): void {
    this.liveRegion.textContent = text;
  }

  /** Panels cover part of the viewport, so shift the projection centre to keep
   *  the focused body inside the uncovered area: bottom sheet on small screens,
   *  right-hand info panel on large ones. */
  private updateViewOffset(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const mobile = w <= 720;
    if (mobile && (this.state.selectedId !== null || this.state.tourStep !== null)) {
      this.rig.camera.setViewOffset(w, h, 0, h * 0.16, w, h);
    } else if (!mobile && this.state.selectedId !== null) {
      this.rig.camera.setViewOffset(w, h, 150, 0, w, h);
    } else {
      this.rig.camera.clearViewOffset();
    }
  }

  private toast(title: string, text: string): void {
    this.toastEl.innerHTML = `<b>${title}</b>${text}`;
    this.toastEl.classList.add('show');
    this.toastTimer = this.elapsed + 6;
  }

  /** Landing-screen entry: sweep from the far establishing shot to overview. */
  enter(withTour: boolean): void {
    sound.init();
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
      startJourney: () => this.startJourney(),
      openSearch: () => this.search.open(),
      openMissions: () => this.missions.open(),
      openMeteors: () => this.meteors.open(),
      openAtlas: () => this.atlas.open(),
      openStructure: (id: string) => this.structure.openFor(id),
      openEarthMoon: () => this.earthMoon.open(),
      openObservatory: (id?: string) => (id ? this.observatory.openFor(id) : this.observatory.open()),
      system: this.system,
      renderer: this.renderer,
      camera: this.rig.camera,
      isFlying: () => this.rig.isFlying,
    };
  }
}
