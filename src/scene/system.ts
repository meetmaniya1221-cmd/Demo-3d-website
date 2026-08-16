/** Assembles the whole solar system and advances it each frame. */
import * as THREE from 'three';
import { PLANETS, keplerPosition, type BodyDef } from '../data/bodies';
import { mapDistanceAU, mapPositionAU } from '../sim/scale';
import { MOONS_BY_PARENT, SMALL_BODIES, catalogObject } from '../data/catalog';
import type { CatalogObject } from '../data/types';
import { DEFAULT_LAYERS, type Layers } from '../sim/state';
import { Sun } from './sun';
import { Planet } from './planet';
import { Sky } from './sky';
import { Belt, buildMainBelt, buildKuiperBelt, MAIN_BELT_STYLE, KUIPER_BELT_STYLE } from './belt';
import { OortCloud } from './oort';
import { OrbitLine, HabitableZone } from './orbits';
import { SatelliteSystem } from './satellites';
import { SmallBodies } from './smallbodies';
import { Markers, markerFade, projectedPx } from './markers';
import { ReferenceGrid } from './grid';
import { Constellations } from './constellations';
import type { GeneratedTextures } from './textures';

export class SolarSystem {
  readonly scene = new THREE.Scene();
  readonly sun: Sun;
  readonly planets = new Map<string, Planet>();
  readonly orbitLines = new Map<string, OrbitLine>();
  readonly satSystems = new Map<string, SatelliteSystem>(); // keyed by parent id
  readonly smallBodies: SmallBodies;
  readonly hz: HabitableZone;
  readonly markers: Markers;
  readonly grid: ReferenceGrid;
  readonly constellations: Constellations;
  readonly pickables: THREE.Object3D[] = [];
  readonly sky: Sky;
  private mainBelt: Belt;
  private kuiperBelt: Belt;
  private oortCloud: OortCloud;
  private lastOrbitScaleT = -1;
  private lastSimDays = 0;
  private selectedId: string | null = null;
  private layers: Layers = { ...DEFAULT_LAYERS };
  private tmp = { x: 0, y: 0, z: 0 };
  private tmpK: [number, number, number] = [0, 0, 0];
  private tmpV = new THREE.Vector3();
  private planetMarkerIdx = new Map<string, number>();
  /** moon id → its satellite system, so bodyPosition/bodyRadius are O(1). */
  private satSystemOf = new Map<string, SatelliteSystem>();
  private sunMarkerIdx = -1;
  /** Spacecraft mode draws sub-pixel planets itself (photometric points), so
   *  it turns the main view's marker/disc handoff off while it flies. */
  planetMarkersEnabled = true;

  constructor(tex: GeneratedTextures, textureBase: string) {
    this.scene.background = new THREE.Color(0x020308);

    this.sky = new Sky();
    this.scene.add(this.sky.group);

    this.markers = new Markers();
    this.scene.add(this.markers.points);

    this.grid = new ReferenceGrid();
    this.scene.add(this.grid.group);

    this.constellations = new Constellations();
    // ride the camera-pinned sky group so stars stay at optical infinity
    this.sky.group.add(this.constellations.group);

    this.sun = new Sun();
    this.scene.add(this.sun.group);
    this.pickables.push(this.sun.mesh);
    this.sunMarkerIdx = this.markers.register('sun', 0xffd27d);

    for (const def of PLANETS) {
      const ringTex =
        def.id === 'saturn' ? tex.saturnRing : def.id === 'uranus' ? tex.uranusRing : undefined;
      const planet = new Planet(def, tex.bodies[def.id], ringTex);
      this.planets.set(def.id, planet);
      this.scene.add(planet.group);
      this.pickables.push(planet.hit);

      const orbit = new OrbitLine(def.orbit!, def.color);
      this.orbitLines.set(def.id, orbit);
      this.scene.add(orbit.line);

      // fixed-pixel marker for when the planet itself is sub-pixel (true-scale
      // overview): rasterising a sub-pixel mesh flickers and pumps the bloom
      this.planetMarkerIdx.set(def.id, this.markers.register(def.id, def.color));

      const moons = MOONS_BY_PARENT.get(def.id);
      if (moons?.length) {
        const sats = new SatelliteSystem(
          def.facts.diameterKm / 2,
          moons,
          planet.satEquatorial,
          planet.group,
          textureBase,
          this.markers,
        );
        this.satSystems.set(def.id, sats);
        for (const m of moons) this.satSystemOf.set(m.id, sats);
        this.pickables.push(...sats.pickables);
      }
    }

    this.smallBodies = new SmallBodies(this.scene, SMALL_BODIES, textureBase, this.markers);
    this.pickables.push(...this.smallBodies.pickables);

    // satellite systems around small-body parents (Pluto & Charon)
    for (const [parentId, moons] of MOONS_BY_PARENT) {
      if (this.satSystems.has(parentId) || parentId === 'earth') continue;
      const parentBody = this.smallBodies.bodies.get(parentId);
      const parentDef = catalogObject(parentId);
      if (!parentBody || !parentDef) continue;
      const sats = new SatelliteSystem(
        parentDef.physical.diameterKm / 2,
        moons,
        parentBody.root,
        parentBody.root,
        textureBase,
        this.markers,
      );
      this.satSystems.set(parentId, sats);
      for (const m of moons) this.satSystemOf.set(m.id, sats);
      this.pickables.push(...sats.pickables);
    }

    this.mainBelt = new Belt(buildMainBelt(), MAIN_BELT_STYLE);
    this.kuiperBelt = new Belt(buildKuiperBelt(), KUIPER_BELT_STYLE);
    this.oortCloud = new OortCloud();
    this.scene.add(this.mainBelt.points, this.kuiperBelt.points, this.oortCloud.points);

    this.hz = new HabitableZone();
    this.hz.mesh.visible = false;
    this.scene.add(this.hz.mesh);

    // fill so night sides read as dim spheres, not black cutouts, while the
    // lit side keeps a clear terminator
    this.scene.add(new THREE.AmbientLight(0x445870, 1.7));
  }

  update(simDays: number, scaleT: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.lastSimDays = simDays;
    this.sun.update(elapsed, scaleT, simDays);
    const cameraPos = camera.position;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const viewH = window.innerHeight;
    // pin the sky to the camera so the stars stay at optical infinity (the
    // app re-pins after the camera rig moves - see pinSky - so the sky never
    // lags a fast camera by a frame)
    this.sky.group.position.copy(cameraPos);

    for (const planet of this.planets.values()) {
      const def = planet.def;
      const [x, y, z] = keplerPosition(def.orbit!, simDays, this.tmpK);
      mapPositionAU(x, y, z, scaleT, this.tmp);
      planet.group.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
      planet.update(simDays, scaleT);

      // sub-pixel handoff: below a few projected pixels the mesh gives way to
      // a stable fixed-size marker (mirrors the small-body treatment)
      const idx = this.planetMarkerIdx.get(def.id) ?? -1;
      if (this.planetMarkersEnabled) {
        const dist = cameraPos.distanceTo(planet.group.position);
        const px = projectedPx(planet.radius, dist, halfTan, viewH);
        const fade = this.layers.planets ? markerFade(px) : 0;
        this.markers.set(idx, this.tmp.x, this.tmp.y, this.tmp.z, fade, planet.radius * 3);
        planet.setDiscVisible(fade < 0.999);
      } else {
        this.markers.set(idx, this.tmp.x, this.tmp.y, this.tmp.z, 0, 0);
      }
    }

    // the Sun gets the same guarantee for deep true-scale zoom-outs
    if (this.planetMarkersEnabled) {
      const sunPx = projectedPx(this.sun.radius, cameraPos.length(), halfTan, viewH);
      this.markers.set(this.sunMarkerIdx, 0, 0, 0, markerFade(sunPx), this.sun.radius * 3);
    } else {
      this.markers.set(this.sunMarkerIdx, 0, 0, 0, 0, 0);
    }

    this.smallBodies.update(simDays, scaleT, elapsed, cameraPos, halfTan, viewH);

    // satellite systems: collapse to nothing when the camera is far away
    for (const [parentId, sats] of this.satSystems) {
      const parentPos = this.bodyPosition(parentId, this.tmpV);
      const parentR = this.parentDisplayRadius(parentId);
      const extent = sats.systemExtent(parentR, scaleT);
      const camDist = cameraPos.distanceTo(parentPos);
      const selectedHere =
        this.selectedId !== null &&
        (this.selectedId === parentId || sats.has(this.selectedId));
      const near =
        (this.layers.moons || selectedHere) &&
        (selectedHere || camDist < Math.max(extent * 9, parentR * 24));
      sats.update(simDays, scaleT, parentR, near, elapsed, cameraPos, halfTan, viewH);
    }

    this.markers.commit();
    this.grid.updateFocus(cameraPos);
    this.mainBelt.update(simDays, scaleT);
    this.kuiperBelt.update(simDays, scaleT);
    // LOD: the Kuiper swarm reads as a distant context ring - fade it out
    // while the camera works the inner system so it never hangs over a
    // planet close-up (the Oort cloud already gates itself the same way)
    const kIn = mapDistanceAU(6, scaleT);
    const kOut = mapDistanceAU(18, scaleT);
    const kFade =
      this.selectedRegion === 'kuiper-belt'
        ? 1
        : THREE.MathUtils.clamp((cameraPos.length() - kIn) / (kOut - kIn), 0, 1);
    this.kuiperBelt.setViewFade(kFade * kFade);
    this.oortCloud.update(scaleT, cameraPos.length());

    if (Math.abs(scaleT - this.lastOrbitScaleT) > 0.0005) {
      this.lastOrbitScaleT = scaleT;
      for (const orbit of this.orbitLines.values()) orbit.rebuild(scaleT);
      this.smallBodies.rebuildOrbits(scaleT);
      this.grid.rebuild(scaleT);
      this.hz.update(scaleT);
    }
    this.hz.updateViewFade(cameraPos);
  }

  /** Re-pin the sky sphere to the camera after the rig has moved it this
   *  frame. Without this the stars ride last frame's camera position and
   *  visibly swim during fast flights. */
  pinSky(camera: THREE.PerspectiveCamera): void {
    this.sky.group.position.copy(camera.position);
  }

  /** Apply the layer visibility state to every scene subsystem. */
  setLayers(layers: Layers): void {
    this.layers = { ...layers };
    for (const [id, planet] of this.planets) {
      planet.group.visible = layers.planets;
      const orbit = this.orbitLines.get(id);
      if (orbit) orbit.line.visible = layers.planets && layers.planetOrbits;
      planet.hit.layers.set(layers.planets ? 0 : 31);
    }
    this.smallBodies.setOrbitsVisible(layers.planetOrbits);
    this.smallBodies.setLayers(layers);
    for (const sats of this.satSystems.values()) sats.setOrbitsVisible(layers.planetOrbits);
    this.applyRegionVisibility();
    this.grid.setVisible(layers.grid);
    this.constellations.setVisible(layers.constellations);
    this.constellations.setDeepSkyVisible(layers.deepSky);
    this.hz.mesh.visible = layers.habitableZone;
  }

  private parentDisplayRadius(parentId: string): number {
    if (parentId === 'sun') return this.sun.radius;
    const planet = this.planets.get(parentId);
    if (planet) return planet.radius;
    return this.smallBodies.displayRadius(parentId);
  }

  /** A selected region is always force-shown even if its layer is off
   *  (search can reveal anything). Regions never reach setHighlightedOrbit
   *  (the app filters them out of orbit highlighting), so they carry their
   *  own selection channel. */
  private selectedRegion: string | null = null;

  setSelectedRegion(id: string | null): void {
    this.selectedRegion = id;
    this.applyRegionVisibility();
  }

  private applyRegionVisibility(): void {
    this.mainBelt.setEnabled(this.layers.beltDust || this.selectedRegion === 'main-belt');
    this.kuiperBelt.setEnabled(this.layers.kuiperBelt || this.selectedRegion === 'kuiper-belt');
    this.oortCloud.setEnabled(this.layers.oortCloud || this.selectedRegion === 'oort-cloud');
  }

  setHighlightedOrbit(id: string | null): void {
    this.selectedId = id;
    // while a body is focused, other orbits recede so they don't slice the shot
    for (const [pid, o] of this.orbitLines) o.setHighlight(pid === id, id !== null);
    this.smallBodies.setSelected(id);
    // re-apply layers: a selected body is always force-shown even if its
    // category layer is off (search can reveal anything)
    this.smallBodies.setLayers(this.layers);
    this.applyRegionVisibility();
    if (id) {
      for (const sats of this.satSystems.values()) {
        if (sats.has(id)) sats.activateMoon(id);
      }
    }
  }

  /** Catalog record for any selectable id (undefined for the belts/regions). */
  bodyDef(id: string): CatalogObject | undefined {
    return catalogObject(id);
  }

  /** Render data for a planet (used by the legacy planet pipeline). */
  planetDef(id: string): BodyDef | undefined {
    return this.planets.get(id)?.def;
  }

  /** World position of any selectable body. */
  bodyPosition(id: string, out: THREE.Vector3): THREE.Vector3 {
    if (id === 'sun') return out.set(0, 0, 0);
    const p = this.planets.get(id);
    if (p) return out.copy(p.group.position);
    if (this.smallBodies.position(id, out)) return out;
    const sats = this.satSystemOf.get(id);
    if (sats?.worldPosition(id, out)) return out;
    return out.set(0, 0, 0);
  }

  /** Current display radius of any selectable body. */
  bodyRadius(id: string, scaleT: number): number {
    if (id === 'sun') return this.sun.radius;
    const p = this.planets.get(id);
    if (p) return p.radius;
    if (this.smallBodies.has(id)) return this.smallBodies.displayRadius(id);
    const sats = this.satSystemOf.get(id);
    if (sats) return sats.displayRadius(id, scaleT);
    return 1;
  }

  /** Should this body's label be considered right now? */
  labelVisible(id: string, camPos: THREE.Vector3, selectedId: string | null, scaleT = 0): boolean {
    const def = catalogObject(id);
    if (!def) return false;
    if (id === selectedId) return true;
    if (def.type === 'star') return true;
    if (def.type === 'planet') return this.layers.planets;
    if (def.type === 'moon') {
      const sats = def.parent ? this.satSystems.get(def.parent) : undefined;
      return !!sats?.isVisible;
    }
    // categories the user has switched off stay quiet
    if (def.type === 'dwarf' || def.type === 'tno') return this.layers.dwarfs;
    if (def.type === 'asteroid' && !this.layers.asteroids) return false;
    if (def.type === 'comet' && !this.layers.comets) return false;
    if (def.type === 'comet' && this.smallBodies.cometActivity(id) > 0.08) return true;
    const pos = this.bodyPosition(id, this.tmpV);
    // "nearby" must be measured in AU, not raw scene units - a fixed unit
    // threshold shrinks to a fraction of itself at true scale, which is
    // exactly the mode where labels are the only way to find these bodies
    return camPos.distanceTo(pos) < mapDistanceAU(4.5, scaleT);
  }

  /** Heliocentric distance in AU for the info panel, when known. */
  heliocentricAU(id: string): number | null {
    if (id === 'sun') return 0;
    const small = this.smallBodies.heliocentricAU(id);
    if (small !== null) return small;
    const planet = this.planets.get(id);
    if (planet?.def.orbit) {
      const [x, y, z] = keplerPosition(planet.def.orbit, this.lastSimDays, this.tmpK);
      return Math.hypot(x, y, z);
    }
    return null;
  }

  /** Forward render-resolution changes to every DPR-aware point shader. */
  setPixelRatio(pr: number): void {
    this.sky.setPixelRatio(pr);
    this.mainBelt.setPixelRatio(pr);
    this.kuiperBelt.setPixelRatio(pr);
    this.oortCloud.setPixelRatio(pr);
    this.smallBodies.setPixelRatio(pr);
  }
}
