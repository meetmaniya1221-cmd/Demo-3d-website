/** Application shell: renderer, post-processing, input, and UI wiring. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SolarSystem } from './scene/system';
import { enhanceSurfaces } from './scene/surfaces';

import { renderBudget } from './scene/budget';
import { sceneToGalacticMatrix } from './scene/galaxy';
import { MobileNav } from './ui/mobilenav';
import { isCompact, onDeviceChange } from './ui/device';
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
import { CutawayOverlay } from './ui/cutaway';
import { EarthMoonOverlay } from './ui/earthmoon';
import { Observatory } from './ui/observatory';
import { MissionsOverlay } from './ui/missions';
import { MeteorsOverlay } from './ui/meteors';
import { Search } from './ui/search';
import { Atlas } from './ui/atlas';
import { Journey } from './ui/journey';
import { Tour, type TourHost } from './ui/tour';
import { SpacecraftMode } from './spacecraft/mode';
import { PLANETS } from './data/bodies';
import { catalogObject } from './data/catalog';
import { fmtSimDate } from './ui/format';
import { SystemsPanel } from './ui/systems';
import { SystemLabels } from './ui/systemlabels';
import { Voyage } from './ui/voyage';
import {
  AU_PER_LY,
  NEIGHBOURHOOD_RADIUS_LY,
  SOL_ID,
  positionLyOf,
  unitsPerLy,
} from './sim/interstellar';
import { exoplanet, hostStar, primaryStar, starSystem } from './data/catalog/starsystems';
import { invMapSystemUnits } from './scene/starsystem';

/** Outer edge of the modelled Oort cloud, in AU - where the planetary scale
 *  stops being the right ruler (see scene/oort). */
const OORT_OUTER_AU = 60_000;

/** Display name for anything living in a neighbouring system. */
function exoplanetName(id: string): string | null {
  return exoplanet(id)?.name ?? hostStar(id)?.name ?? null;
}

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
  private mobileNav!: MobileNav;
  private distance: DistanceReadout;
  private skyNotes: SkyNotes;
  private compare: CompareOverlay;
  private gravity: GravityOverlay;
  private structure: StructureOverlay;
  private cutaway: CutawayOverlay;
  private earthMoon: EarthMoonOverlay;
  private observatory: Observatory;
  private missions: MissionsOverlay;
  private meteors: MeteorsOverlay;
  private search: Search;
  private atlas: Atlas;
  private journey: Journey;
  private tour: Tour;
  private spacecraft: SpacecraftMode;
  private systemsPanel: SystemsPanel;
  private systemLabels: SystemLabels;
  private voyage: Voyage;
  private toastEl: HTMLElement;
  private liveRegion!: HTMLElement;
  private toastTimer = 0;
  private frameTimeEma = 16;
  /** Seconds of consistently good frames, for the adaptive resolution loop. */
  private goodFrames = 0;
  private lastPrChange = 0;
  private clock = new THREE.Clock();
  private elapsed = 0;
  /**
   * Stops the clock without stopping the render loop. Only the debug surface
   * sets it, and only so a test can capture two frames that differ in exactly
   * one thing. Every shader here is driven by `elapsed` - corona, clouds,
   * atmosphere, star twinkle - so two captures taken half a second apart are
   * never identical, and a difference test that does not freeze first measures
   * the animation rather than whatever it meant to isolate.
   */
  private frozen = false;
  private scaleTarget = 0;
  private liveTimer = 0;
  /** Seconds of consistently slow frames. */
  private slowFrames = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private activeTouches = new Set<number>();
  private pinching = false;
  private lastSize = { w: 0, h: 0 };
  private downPos: { x: number; y: number; t: number } | null = null;
  private tmpV = new THREE.Vector3();

  constructor(root: HTMLElement, textures: GeneratedTextures) {
    // MSAA happens on the composer's render target, so the default framebuffer
    // does not need (and would waste) its own antialiasing
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // A 3x-DPR phone asked to render natively is drawing more fragments than
    // most laptops, then resampling them again through bloom. Start inside the
    // device's budget and let trackFrameCost climb from there if it can.
    // (The subsystem setters are applied once everything exists - see the
    // setPixelRatio call at the end of the constructor.)
    this.renderer.setPixelRatio(renderBudget().startPixelRatio);
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
    // UnrealBloomPass allocates a bright-pass target plus five mip pairs, all
    // RGBA16F. At full resolution on a phone that is tens of megabytes of
    // bandwidth every frame for an effect that is deliberately soft anyway, so
    // constrained devices run it at half resolution - visually almost
    // indistinguishable, and roughly a quarter of the fill.
    const bloomScale = renderBudget().bloomScale;
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth / bloomScale, window.innerHeight / bloomScale),
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
    this.cutaway = new CutawayOverlay(root, (id) => this.structure?.syncBody(id));
    this.structure = new StructureOverlay(root, (id) => this.cutaway.openFor(id));
    this.earthMoon = new EarthMoonOverlay(root, this.state);
    this.observatory = new Observatory(root, this.state);
    this.missions = new MissionsOverlay(root, { selectObject: (id) => this.state.select(id) });
    this.meteors = new MeteorsOverlay(root, { selectObject: (id) => this.state.select(id) });
    this.search = new Search(root, {
      selectObject: (id) => this.state.select(id),
      goToSystem: (id) => this.goToSystem(id),
      openMission: (id) => this.missions.openAt(id),
      openSky: (id) => {
        // search can fire over an already-open modal - close the stack so
        // the Observatory is the only dialog and Escape unwinds correctly
        for (const o of [this.compare, this.gravity, this.structure, this.earthMoon]) {
          if (o.isOpen) o.close();
        }
        this.observatory.openFor(id);
      },
    });
    this.atlas = new Atlas(root, this.state);
    this.systemsPanel = new SystemsPanel(root, {
      goToSystem: (id) => this.goToSystem(id),
      activeSystem: () => this.system.activeSystemId,
      // both live on the left rail, so one opening closes the other
      onOpen: () => this.atlas.close(),
    });
    this.systemLabels = new SystemLabels(root, {
      goToSystem: (id) => this.goToSystem(id),
    });
    this.voyage = new Voyage(root, {
      state: this.state,
      system: this.system,
      camera: this.rig.camera,
      releaseCamera: () => this.rig.release(),
      resumeCamera: (target) => this.rig.resume(target),
      onArrive: (systemId, focusId) => this.onArrive(systemId, focusId),
      announce: (text) => this.announce(text),
    });
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
      onAtlas: () => {
        this.systemsPanel.close();
        this.atlas.toggle();
      },
      onJourney: () => this.startJourney(),
      onMissions: () => this.missions.open(),
      onMeteors: () => this.meteors.open(),
      onObservatory: () => this.observatory.open(),
      onSpacecraft: () => this.enterSpacecraft(),
      onSystems: () => this.systemsPanel.toggle(),
    });
    // The compact shell replaces the chip row entirely on phones; it shares
    // these same callbacks so there is one set of behaviours, two presentations.
    this.mobileNav = new MobileNav(root, this.state, {
      onSearch: () => this.search.open(),
      onAtlas: () => this.atlas.toggle(),
      onTour: () => this.tour.start(),
      onJourney: () => this.startJourney(),
      onObservatory: () => this.observatory.open(),
      onMissions: () => this.missions.open(),
      onMeteors: () => this.meteors.open(),
      onCompare: () => this.compare.open(),
      onGravity: () => this.gravity.open(),
      onSpacecraft: () => this.enterSpacecraft(),
      onLayers: () => this.layersPanel.setOpen(true),
      onResetView: () => {
        if (this.state.selectedId) this.state.select(null);
        else this.focusOverview();
      },
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
    this.spacecraft = new SpacecraftMode(root, {
      state: this.state,
      system: this.system,
      renderer: this.renderer,
      camera: this.rig.camera,
      canvas: this.renderer.domElement,
      releaseCamera: () => this.rig.release(),
      resumeCamera: (target) => this.rig.resume(target),
      focusOverview: () => this.focusOverview(),
      announce: (text) => this.announce(text),
    });

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
      if (this.spacecraft?.active || this.spacecraft?.busy) return; // the cockpit has its own targeting
      if (this.voyage?.active) return; // a transit is already flying the camera
      // Choosing something in another star's system is a decision to go there.
      // The transit runs first and re-issues the selection on arrival, so one
      // click from search or the atlas lands on the right planet.
      if (id) {
        const owner = this.system.systemOf(id);
        if (owner !== this.system.activeSystemId) {
          this.state.selectedId = null;
          this.goToSystem(owner, id);
          return;
        }
      }
      // picking a destination leaves the journey; mere deselection does not
      if (id && this.journey.active) this.journey.end();
      this.system.setHighlightedOrbit(id && catalogObject(id)?.type !== 'region' ? id : null);
      this.system.setSelectedRegion(id && catalogObject(id)?.type === 'region' ? id : null);
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
    this.state.on('timejump', () => {
      this.announce(`Simulation date set to ${fmtSimDate(this.state.simDays)}`);
      // refresh live readouts right away instead of waiting for the 1 Hz tick
      this.liveTimer = 1;
    });
    this.state.on('units', () => this.infoPanel.refresh());
    this.state.on('scale', (mode) => {
      this.scaleTarget = mode === 'true' ? 1 : 0;
      if (this.journey.active) return; // journey narrates the scale itself
      // spacecraft mode forces true scale on the way in and restores the
      // previous mode on the way out - neither deserves a toast
      if (this.spacecraft?.active || this.spacecraft?.busy) return;
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
    // one interaction-sound language for every button: generic taps tick,
    // dismissals (cancel/close/back) share the 'back' tone, commits share
    // 'select'. Buttons whose owner plays its own sound opt out via
    // data-sfx="none".
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
      const sfx = btn.dataset.sfx;
      if (sfx === 'none') return;
      if (sfx === 'back') sound.play('back', 0.3);
      else if (sfx === 'select') sound.play('select', 0.35);
      else sound.play('click', 0.22);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.downPos) return;
      const dx = e.clientX - this.downPos.x;
      const dy = e.clientY - this.downPos.y;
      const dt = performance.now() - this.downPos.t;
      const touch = e.pointerType !== 'mouse';
      this.downPos = null;
      // A finger is not a mouse. A deliberate tap routinely travels 10-15px
      // and takes longer than half a second, so the mouse thresholds threw
      // away a large share of real taps and the app felt unresponsive to
      // touch. Multi-touch never selects - that is a pinch, not a tap.
      const slop = touch ? 14 * 14 : 36;
      const hold = touch ? 900 : 500;
      if (dx * dx + dy * dy > slop || dt > hold) return;
      if (touch && this.pinching) return;
      if (this.journey.active || this.spacecraft.active) return;
      this.pick(e.clientX, e.clientY, touch);
    });
    // a second finger down means the gesture is a pinch or a two-finger pan
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.activeTouches.add(e.pointerId);
      if (this.activeTouches.size > 1) this.pinching = true;
    });
    const endTouch = (e: PointerEvent) => {
      this.activeTouches.delete(e.pointerId);
      if (this.activeTouches.size === 0) {
        // clear on the next frame so the pointerup that ends the pinch is
        // still seen as part of it
        requestAnimationFrame(() => {
          if (this.activeTouches.size === 0) this.pinching = false;
        });
      }
    };
    canvas.addEventListener('pointerup', endTouch);
    canvas.addEventListener('pointercancel', endTouch);
    // device.ts already listens to resize, orientationchange and
    // visualViewport; subscribing here as well ran the whole GL resize path
    // two or three times per rotation, reallocating every post-processing
    // target each time.
    onDeviceChange(() => this.resize());
    this.watchContextLoss(canvas, root);
    window.addEventListener('keydown', (e) => this.onKey(e));

    this.hud.updateClock();
    // Now that every subsystem exists, push the starting ratio through all of
    // them. Point sprites size themselves from it, so leaving them on their
    // constructor default made every star, belt particle and marker draw at
    // the wrong width - additively blended, with no depth write, which is the
    // most expensive way to be wrong about fill.
    this.setPixelRatio(renderBudget().startPixelRatio);
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
    // "the overview" means whichever system you are standing in
    if (this.system.activeSystemId !== SOL_ID) {
      this.focusSystemOverview();
      return;
    }
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
        ? { rAU: 43, radius: 30, trueRadius: 900 }
        : id === 'oort-cloud'
          ? { rAU: 900, radius: 1500, trueRadius: 1500 }
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
    if (id === 'kuiper-belt') {
      // highlight the belt's famous residents alongside the particle swarm
      if (!this.state.layers.dwarfs) this.state.setLayer('dwarfs', true);
      this.toast(
        'The Kuiper belt',
        'Cold classical bodies form the bright torus at 42-48 AU, plutinos cluster at Neptune’s 3:2 resonance, and a thin scattered disc trails outward. Notable residents - Pluto, Haumea, Makemake, Quaoar - are now shown.',
      );
    } else if (id === 'oort-cloud') {
      this.toast(
        'The Oort cloud (conceptual)',
        'No telescope has ever seen it - its existence is inferred from long-period comet orbits. This sparse spherical swarm is a model visualization beginning ~2,000 AU out; zoom all the way out to find yourself inside it.',
      );
    }
  }

  // ----------------------------------------------------- interstellar travel --

  /**
   * Travel to another system, optionally focusing something specific there.
   * Going somewhere you already are just frames it again rather than running a
   * transit to nowhere.
   */
  goToSystem(systemId: string, focusId: string | null = null): void {
    if (this.voyage.active) return;
    if (this.spacecraft.active) {
      this.spacecraft.setInterstellarTarget(systemId);
      return;
    }
    if (systemId === this.system.activeSystemId) {
      if (focusId) this.state.select(focusId);
      else this.focusSystemOverview();
      return;
    }
    if (this.tour.active) this.tour.dismiss();
    if (this.journey.active) this.journey.end();
    if (this.search.isOpen) this.search.close();
    this.atlas.close();
    this.systemsPanel.close();
    for (const o of [this.compare, this.gravity, this.structure, this.earthMoon, this.observatory, this.missions, this.meteors, this.cutaway]) {
      if (o.isOpen) o.close();
    }
    // a toast about the system you are leaving has no business surviving the
    // trip - it reads as a caption for wherever you land
    this.clearToast();
    this.voyage.start(systemId, focusId);
    this.systemsPanel.syncActive();
  }

  private onArrive(systemId: string, focusId: string | null): void {
    this.rig.resume(new THREE.Vector3(0, 0, 0));
    this.systemsPanel.syncActive();
    if (focusId) {
      // arrive, settle, then close on the thing that was asked for
      window.setTimeout(() => this.state.select(focusId), 60);
    } else {
      this.focusSystemOverview();
      const sys = starSystem(systemId);
      if (sys) {
        this.toast(
          sys.name,
          `${sys.tagline}. ${sys.distanceLy.toFixed(2)} light-years from the Sun. Planet sizes and colours here are informed renderings - nobody has photographed these worlds.`,
        );
      }
    }
  }

  /** Frame whichever system the camera is currently standing in. */
  focusSystemOverview(): void {
    const foreign = this.system.activeForeign;
    if (!foreign) {
      this.focusOverview();
      return;
    }
    this.rig.flyTo(
      () => {
        const extent = foreign.extent(this.state.scaleT);
        return { position: new THREE.Vector3(0, 0, 0), radius: Math.max(extent * 0.34, 1e-4) };
      },
      { distanceFactor: 2.6, minDistanceOnArrive: 1e-3 },
    );
  }

  /** Enter first-person spacecraft mode, closing anything modal first. */
  enterSpacecraft(): void {
    if (this.spacecraft.active) return;
    const wasSequenced = this.tour.active || this.journey.active;
    if (this.tour.active) this.tour.dismiss();
    if (this.journey.active) this.journey.end();
    this.atlas.close();
    if (this.search.isOpen) this.search.close();
    for (const o of [this.compare, this.gravity, this.structure, this.earthMoon, this.observatory, this.missions, this.meteors, this.cutaway]) {
      if (o.isOpen) o.close();
    }
    if (this.layersPanel.isOpen) this.layersPanel.setOpen(false);
    if (this.state.selectedId) this.state.select(null);
    this.spacecraft.enter({ restoreOverview: wasSequenced });
  }

  startJourney(): void {
    if (this.tour.active) this.tour.dismiss();
    this.atlas.close();
    if (this.search.isOpen) this.search.close();
    this.journey.start();
  }

  // --------------------------------------------------------------- input --

  private pick(clientX: number, clientY: number, touch = false): void {
    let hits = this.rayAt(clientX, clientY);
    if (hits.length === 0 && touch) {
      // A fingertip covers about 40px; a single ray through its centre misses
      // anything the user was plainly aiming at. Sweep a ring outward and take
      // the first thing found, so small moons are actually selectable.
      outer: for (const radius of [14, 26]) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const probe = this.rayAt(
            clientX + Math.cos(a) * radius,
            clientY + Math.sin(a) * radius,
          );
          if (probe.length > 0) {
            hits = probe;
            break outer;
          }
        }
      }
    }
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

  /** Raycast the pickables through one screen point. */
  private rayAt(clientX: number, clientY: number): THREE.Intersection[] {
    // against the canvas's own rect, not the window's: they agree today only
    // because the canvas is inset:0, and a stray page pinch-zoom already
    // separates clientX from innerWidth
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);
    return this.raycaster.intersectObjects(this.system.pickables, false);
  }

  private onKey(e: KeyboardEvent): void {
    // spacecraft mode owns the keyboard while it is flying
    if (this.spacecraft.active) {
      this.spacecraft.handleKey(e);
      return;
    }
    // Escape always works, even from inside inputs/sliders
    if (e.key === 'Escape') {
      if (this.voyage.active) this.voyage.skip();
      else if (this.hud.datePicker.isOpen) this.hud.datePicker.close(true);
      else if (this.search.isOpen) this.search.close(true);
      else if (this.systemsPanel.isOpen) this.systemsPanel.close(true);
      else if (this.layersPanel.isOpen) this.layersPanel.setOpen(false);
      else if (this.compare.isOpen) this.compare.close();
      else if (this.gravity.isOpen) this.gravity.close();
      else if (this.cutaway.isOpen) this.cutaway.close();
      else if (this.structure.isOpen) this.structure.close();
      else if (this.earthMoon.isOpen) this.earthMoon.close();
      else if (this.observatory.isOpen) this.observatory.close();
      else if (this.missions.isOpen) this.missions.close();
      else if (this.meteors.isOpen) this.meteors.close();
      else if (this.journey.active) this.journey.end();
      else if (this.atlas.isOpen) this.atlas.close(true);
      else if (this.tour.active) this.tour.end();
      else if (this.state.selectedId) this.state.select(null);
      // from another star, Escape's last stop is the way home
      else if (this.system.activeSystemId !== SOL_ID) this.goToSystem(SOL_ID);
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
        // in another star's system, cycle through that system's own worlds
        const foreignSys = starSystem(this.system.activeSystemId);
        if (foreignSys) {
          const ring = [primaryStar(foreignSys).id, ...foreignSys.planets.map((p) => p.id)];
          const at = ring.indexOf(this.state.selectedId ?? ring[0]);
          const step = e.key === 'ArrowRight' ? 1 : -1;
          this.state.select(ring[(Math.max(at, 0) + step + ring.length) % ring.length]);
          break;
        }
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

  private skyBaked = false;

  private frame(): void {
    // drained either way, so unfreezing does not deliver the whole pause as
    // one enormous delta
    const tick = this.clock.getDelta();
    const rawDt = this.frozen ? 0 : tick;
    const dt = Math.min(rawDt, 0.1);
    this.elapsed += dt;
    const flying = this.spacecraft.active;
    if (flying) {
      // the vessel drives the clock: simulated time advances at the ship's own
      // time-compression factor, so planets keep moving during a cruise
      this.spacecraft.update(Math.min(rawDt, 0.5));
    } else {
      this.state.tick(dt);
    }

    // animate the explorer ↔ true-scale morph (snap under reduced motion).
    // The easing factor is time-normalized so the morph takes the same wall
    // time at any frame rate, and the asymptotic tail snaps early so orbit
    // geometry stops rebuilding as soon as the change is invisible.
    const diff = this.scaleTarget - this.state.scaleT;
    if (flying) {
      this.state.scaleT = this.spacecraft.scaleT;
    } else if (REDUCED_MOTION) {
      this.state.scaleT = this.scaleTarget;
    } else if (Math.abs(diff) > 0.002) {
      this.state.scaleT += diff * (1 - Math.exp(-dt * 1.6));
    } else if (this.state.scaleT !== this.scaleTarget) {
      this.state.scaleT = this.scaleTarget;
    }

    if (!this.skyBaked) {
      // One-off, before any mode branch: turn the galactic band into a cubemap
      // so it stops costing a full-screen noise evaluation every frame. Doing
      // it here rather than in a render path means it happens exactly once
      // whichever view the session starts in.
      this.skyBaked = true;
      this.system.sky.bake(this.renderer, this.system.scene);
    }

    this.system.update(this.state.simDays, this.state.scaleT, this.elapsed, this.rig.camera);
    if (flying) {
      this.spacecraft.postUpdate(dt);
      this.composer.render();
      this.spacecraft.renderOverlay();
      this.trackFrameCost(rawDt);
      return;
    }
    // camera flights advance on wall-clock time so they finish on schedule
    // even when the GPU is struggling
    if (this.voyage.active) {
      this.voyage.update(Math.min(rawDt, 0.5));
    } else if (this.journey.active) {
      this.journey.update(Math.min(rawDt, 0.5));
    } else {
      this.rig.update(Math.min(rawDt, 0.5));
    }
    const panelInset = this.state.selectedId && !isCompact() ? 372 : 0;
    this.labels.update(this.system, this.rig.camera, this.state, panelInset);
    this.skyNotes.update(this.system, this.rig.camera, this.state);
    this.systemLabels.update(
      this.system.neighbourhood,
      this.rig.camera,
      this.state.layers.nearbyStars && !this.journey.active,
      this.rig.camera.position.length() > mapDistanceAU(OORT_OUTER_AU, this.state.scaleT),
      panelInset,
    );

    // right-edge distance readout: camera → focused body (or the system's star)
    if (this.state.layers.distanceScale) {
      const foreign = this.system.activeForeign;
      const camR = this.rig.camera.position.length();
      if (camR > mapDistanceAU(OORT_OUTER_AU, this.state.scaleT)) {
        // Out past the Oort cloud the planetary compression curve no longer
        // applies - the stars are laid out linearly in light-years, and
        // reading the camera's distance through the wrong curve was reporting
        // 109 light-years for a camera 44 light-years out.
        this.distance.update(
          this.rig.camera.position,
          this.tmpV.set(0, 0, 0),
          this.system.activeSystemId === SOL_ID
            ? 'the Sun'
            : (starSystem(this.system.activeSystemId)?.name ?? 'the star'),
          this.state.scaleT,
          (r, t) => (r / unitsPerLy(t)) * AU_PER_LY,
        );
      } else if (foreign) {
        // in another system the anchor is that system's own star, and the
        // scene-units→AU conversion is that system's own curve
        const anchor = primaryStar(foreign.def);
        const focusId = this.state.selectedId ?? anchor.id;
        const named = exoplanetName(focusId) ?? anchor.name;
        this.system.bodyPosition(focusId, this.tmpV);
        this.distance.update(
          this.rig.camera.position,
          this.tmpV,
          named,
          this.state.scaleT,
          (r, t) => invMapSystemUnits(r, t, foreign.scales),
        );
      } else {
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
    }

    // deep true-scale views (Sedna's aphelion is 937 AU out) need a longer
    // far plane; explorer view keeps the tighter one for depth precision.
    // Pulling out into the neighbourhood extends it further still - the star
    // points ride a shell 5,700 units from the camera, so the plane has to
    // clear the camera's own distance plus that shell.
    const camDist = this.rig.camera.position.length();
    const wantFar = Math.max(
      22000 * (1 - this.state.scaleT) + 320000 * this.state.scaleT,
      camDist * 1.1 + 9000,
    );
    if (Math.abs(wantFar - this.rig.camera.far) / this.rig.camera.far > 0.2) {
      this.rig.camera.far = wantFar;
      this.rig.camera.updateProjectionMatrix();
    }
    // Zoom-out limit follows the scale mode: true scale needs to reach the
    // outermost aphelia (~940 AU = 94,000 units), explorer stays tight - but
    // both must let the traveller pull back far enough to see the whole
    // stellar neighbourhood, which is what makes the star map reachable by
    // scrolling rather than only by a menu.
    const localMax = 12000 * (1 - this.state.scaleT) + 150000 * this.state.scaleT;
    this.rig.controls.maxDistance = Math.max(
      localMax,
      unitsPerLy(this.state.scaleT) * NEIGHBOURHOOD_RADIUS_LY * 1.35,
    );

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

    this.trackFrameCost(rawDt);
    // The simulation above still advances - time keeps running, bodies keep
    // moving - only the drawing is skipped, so nothing is out of date when the
    // sheet closes.
    if (this.sceneObscured) return;
    this.composer.render();
  }

  /** Adaptive resolution: EMA of frame time with two-way hysteresis. Changes
   *  recreate every post-processing target, so they are rate-limited - some
   *  drivers show a garbage frame when targets churn mid-session. Clamp the
   *  sample so one hidden-tab gap can't poison the average into a downscale. */
  private trackFrameCost(rawDt: number): void {
    const dt = Math.min(rawDt, 0.25);
    this.frameTimeEma += (dt * 1000 - this.frameTimeEma) * 0.05;
    const pr = this.renderer.getPixelRatio();
    const budget = renderBudget();
    const maxPr = budget.maxPixelRatio;
    const minPr = budget.minPixelRatio;
    const cooledDown = this.elapsed - this.lastPrChange > 8;
    // Accumulate seconds, not frames. Counting frames means the response time
    // scales with the frame rate itself - a phone struggling at 5 fps waited
    // nine seconds to shed resolution, which is exactly when it could least
    // afford to. Coming down is deliberately four times quicker than going
    // back up: a stutter should be answered immediately, a recovery earned.
    if (this.frameTimeEma > 34 && pr > minPr) {
      this.goodFrames = 0;
      this.slowFrames += dt;
      if (this.slowFrames > 0.75 && cooledDown) {
        this.setPixelRatio(Math.max(minPr, pr - 0.25));
        this.lastPrChange = this.elapsed;
        this.slowFrames = 0;
      }
    } else if (this.frameTimeEma < 20 && pr < maxPr) {
      this.slowFrames = 0;
      this.goodFrames += dt;
      if (this.goodFrames > 6 && cooledDown) {
        this.setPixelRatio(Math.min(maxPr, pr + 0.25));
        this.lastPrChange = this.elapsed;
        this.goodFrames = 0;
      }
    } else {
      this.slowFrames = 0;
      this.goodFrames = 0;
    }
  }

  /**
   * True when something opaque covers the whole viewport.
   *
   * Behind a full-screen overlay the entire solar system, its bloom composite
   * and every label are still being redrawn at the animation-loop rate, for a
   * viewer who cannot see any of it. On a phone that is the difference between
   * reading about the Apollo missions and watching the battery indicator move.
   */
  private get sceneObscured(): boolean {
    // Only full-coverage overlays qualify. The info panel also sets
    // `sheet-open`, but it rests at 42% of the screen with the planet it is
    // describing visible above it - skipping the render there would freeze
    // exactly the thing the user is looking at.
    return isCompact() && document.body.classList.contains('overlay-open');
  }

  private setPixelRatio(value: number): void {
    this.renderer.setPixelRatio(value);
    this.composer.setPixelRatio(value);
    this.system.markers.setPixelRatio(value);
    this.system.constellations.setPixelRatio(value);
    this.system.setPixelRatio(value);
    this.spacecraft.setPixelRatio(value);
  }

  /**
   * WebGL context loss.
   *
   * Mobile browsers drop the GL context far more readily than desktop ones -
   * on a background tab, under memory pressure, on some rotations - and the
   * default outcome is a frozen black canvas with no explanation. Chromium
   * will usually hand the context back, so the honest behaviour is to say what
   * happened, stop the render loop from throwing into the void, and reload
   * when the context returns.
   */
  private watchContextLoss(canvas: HTMLCanvasElement, root: HTMLElement): void {
    const panel = document.createElement('div');
    panel.className = 'gl-error';
    panel.setAttribute('role', 'alertdialog');
    panel.innerHTML =
      '<h2>Graphics paused</h2>' +
      '<p>The browser released this page&rsquo;s 3D context, usually to free memory for ' +
      'something else. Reloading will rebuild the Solar System.</p>';
    const retry = document.createElement('button');
    retry.textContent = 'Reload';
    retry.addEventListener('click', () => location.reload());
    panel.appendChild(retry);
    root.appendChild(panel);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // without this the context is never restored
      this.renderer.setAnimationLoop(null);
      panel.classList.add('show');
      retry.focus();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      // Rebuilding every texture, geometry and program by hand is a large
      // amount of code to keep correct for an event this rare; a reload is
      // honest, quick, and cannot leave half the scene missing.
      location.reload();
    });
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // the iOS URL bar slides for several frames, firing a resize each time at
    // the same width; reallocating half-float targets for that is pure waste
    if (w === this.lastSize.w && h === this.lastSize.h) return;
    this.lastSize = { w, h };
    this.renderer.setSize(w, h);
    // composer.setSize resizes every pass (including bloom) in device pixels
    this.composer.setSize(w, h);
    this.rig.resize(w, h);
    this.spacecraft.resize(w, h);
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
    // the compact shell puts a sheet across the bottom, so the focused body
    // has to sit in the upper part of the frame to stay visible behind it
    const mobile = isCompact();
    if (mobile && (this.state.selectedId !== null || this.state.tourStep !== null)) {
      this.rig.camera.setViewOffset(w, h, 0, h * 0.16, w, h);
    } else if (!mobile && this.state.selectedId !== null) {
      this.rig.camera.setViewOffset(w, h, 150, 0, w, h);
    } else {
      this.rig.camera.clearViewOffset();
    }
  }

  private clearToast(): void {
    this.toastEl.classList.remove('show');
    this.toastTimer = 0;
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
      openCutaway: (id: string) => this.cutaway.openFor(id),
      cutawayInfo: () => this.cutaway.info,
      openEarthMoon: () => this.earthMoon.open(),
      openObservatory: (id?: string) => (id ? this.observatory.openFor(id) : this.observatory.open()),
      system: this.system,
      renderer: this.renderer,
      camera: this.rig.camera,
      isFlying: () => this.rig.isFlying,
      enterSpacecraft: () => this.enterSpacecraft(),
      exitSpacecraft: () => this.spacecraft.exit(),
      spacecraftActive: () => this.spacecraft.active,
      spacecraft: this.spacecraft.debug,
      THREE,
      galacticMatrix: () => sceneToGalacticMatrix(),
      setSkyVisible: (v: boolean) => this.system.sky.setMilkyWayVisible(v),
      freeze: (v: boolean) => {
        this.frozen = v;
      },
      /**
       * A body's disc in CSS pixels: centre and radius on screen.
       *
       * The compositing test needs to know which pixels are solid globe. A
       * luminance threshold cannot tell it that - it also catches the
       * atmospheric halo, which extends well past the limb and is meant to be
       * semi-transparent - so the test asks the scene for the geometry
       * instead, and measures inside the projected disc.
       */
      discOf: (id: string) => {
        const cam = this.rig.camera;
        const pos = this.system.bodyPosition(id, new THREE.Vector3());
        const radius = this.system.bodyRadius(id, this.state.scaleT);
        const view = pos.clone().project(cam);
        if (view.z > 1) return null;
        const w = this.renderer.domElement.clientWidth;
        const h = this.renderer.domElement.clientHeight;
        // project a point one radius off the view axis to get the disc's size
        const off = pos
          .clone()
          .addScaledVector(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), radius)
          .project(cam);
        return {
          x: ((view.x + 1) / 2) * w,
          y: ((1 - view.y) / 2) * h,
          r: (Math.abs(off.x - view.x) / 2) * w,
        };
      },
      setBloom: (v: boolean) => {
        this.bloom.enabled = v;
      },
      bloomStrength: () => this.bloom.strength,
      earthDetail: () => this.system.planets.get('earth')?.earth?.detailState ?? null,
      moonDetail: () => this.system.moonDetailState(),
      mobileNav: this.mobileNav,
      // ---- interstellar
      goToSystem: (id: string, focusId?: string) => this.goToSystem(id, focusId ?? null),
      activeSystem: () => this.system.activeSystemId,
      voyageActive: () => this.voyage.active,
      voyagePhase: () => this.voyage.phase,
      skipVoyage: () => this.voyage.skip(),
      openSystems: () => this.systemsPanel.open(),
      neighbourhood: () =>
        this.system.neighbourhood.entries.map((e) => ({
          id: e.id,
          distLy: e.distLy,
          mag: e.mag,
          scenePos: e.scenePos.toArray(),
        })),
      systemInfo: () => {
        const foreign = this.system.activeForeign;
        if (!foreign) return { id: SOL_ID, planets: [] };
        const v = new THREE.Vector3();
        return {
          id: foreign.def.id,
          extent: foreign.extent(this.state.scaleT),
          hz: foreign.hz,
          planets: foreign.def.planets.map((p) => {
            foreign.position(p.id, v);
            return {
              id: p.id,
              status: p.status,
              semiMajorAU: p.semiMajorAU,
              periodDays: p.periodDays,
              radius: foreign.radiusOf(p.id),
              pos: v.toArray(),
              r: v.length(),
            };
          }),
          stars: foreign.def.stars.map((s) => {
            foreign.position(s.id, v);
            return { id: s.id, pos: v.toArray(), radius: foreign.radiusOf(s.id) };
          }),
        };
      },
      interstellarPos: (id: string) => positionLyOf(id).toArray(),
      builtSystems: () => this.system.builtSystemIds,
    };
  }
}
