/** Assembles the whole solar system and advances it each frame. */
import * as THREE from 'three';
import { PLANETS, keplerPosition, type BodyDef } from '../data/bodies';
import { mapPositionAU } from '../sim/scale';
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
import { Markers } from './markers';
import { ReferenceGrid } from './grid';
import { Constellations } from './constellations';
import type { GeneratedTextures } from './textures';
import { Neighbourhood } from './neighbourhood';
import { Wormhole } from './wormhole';
import { StarSystemScene } from './starsystem';
import { SOL_ID } from '../sim/interstellar';
import { starSystem, systemOfPlanet, systemOfStar } from '../data/catalog/starsystems';
import { setInterstellarFrame } from '../spacecraft/ephemeris';
import { AU_KM } from '../data/bodies';

/** True-scale radius in scene units of anything in a foreign system.
 *  1 AU = 100 units, exactly as sim/scale defines it for the planets. */
function trueRadiusOf(scene: StarSystemScene, id: string): number | null {
  const km = scene.radiusKmOf(id);
  return km === null ? null : (km / AU_KM) * 100;
}

/** How many foreign systems stay built after you leave them. Two is enough to
 *  make an out-and-back instant without holding thirteen systems on the GPU. */
const SYSTEM_CACHE_SIZE = 2;

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
  /** The stellar neighbourhood, always present - it is the same universe. */
  readonly neighbourhood = new Neighbourhood();
  /** The long-distance travel transition. An overlay on the one scene, so what
   *  shows through its opening is the real destination. */
  readonly wormhole = new Wormhole();
  /** Everything the Solar System owns, so it can step aside for another star. */
  private solGroup = new THREE.Group();
  private foreignSystems = new Map<string, StarSystemScene>();
  private systemOrder: string[] = [];
  private activeId: string = SOL_ID;
  private mainBelt: Belt;
  private kuiperBelt: Belt;
  private oortCloud: OortCloud;
  private lastOrbitScaleT = -1;
  private lastScaleT = 0;
  private lastSimDays = 0;
  private selectedId: string | null = null;
  private layers: Layers = { ...DEFAULT_LAYERS };
  private tmp = { x: 0, y: 0, z: 0 };
  private tmpV = new THREE.Vector3();

  constructor(tex: GeneratedTextures, textureBase: string) {
    this.scene.background = new THREE.Color(0x020308);

    this.sky = new Sky();
    this.scene.add(this.sky.group);

    // The Solar System's own contents live under one group so the scene can
    // hand the origin to another star without tearing anything down. The sky,
    // the galaxy, the grid and the neighbourhood stay put - they belong to the
    // universe, not to the Sun.
    this.scene.add(this.solGroup);
    this.scene.add(this.neighbourhood.group);
    this.scene.add(this.wormhole.group);

    this.markers = new Markers();
    this.scene.add(this.markers.points);

    this.grid = new ReferenceGrid();
    this.scene.add(this.grid.group);

    this.constellations = new Constellations();
    // ride the camera-pinned sky group so stars stay at optical infinity
    this.sky.group.add(this.constellations.group);

    this.sun = new Sun();
    this.solGroup.add(this.sun.group);
    this.pickables.push(this.sun.mesh);

    for (const def of PLANETS) {
      const ringTex =
        def.id === 'saturn' ? tex.saturnRing : def.id === 'uranus' ? tex.uranusRing : undefined;
      const planet = new Planet(def, tex.bodies[def.id], ringTex);
      this.planets.set(def.id, planet);
      this.solGroup.add(planet.group);
      this.pickables.push(planet.hit);

      const orbit = new OrbitLine(def.orbit!, def.color);
      this.orbitLines.set(def.id, orbit);
      this.solGroup.add(orbit.line);

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
        this.pickables.push(...sats.pickables);
      }
    }

    this.smallBodies = new SmallBodies(this.solGroup, SMALL_BODIES, textureBase, this.markers);
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
      this.pickables.push(...sats.pickables);
    }

    this.mainBelt = new Belt(buildMainBelt(), MAIN_BELT_STYLE);
    this.kuiperBelt = new Belt(buildKuiperBelt(), KUIPER_BELT_STYLE);
    this.oortCloud = new OortCloud();
    this.solGroup.add(this.mainBelt.points, this.kuiperBelt.points, this.oortCloud.points);

    this.hz = new HabitableZone();
    this.hz.mesh.visible = false;
    this.solGroup.add(this.hz.mesh);

    // fill so night sides read as dim spheres, not black cutouts, while the
    // lit side keeps a clear terminator
    this.scene.add(new THREE.AmbientLight(0x445870, 1.7));
  }

  update(simDays: number, scaleT: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.lastSimDays = simDays;
    this.lastScaleT = scaleT;
    const cameraPos = camera.position;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const viewH = window.innerHeight;
    // pin the sky to the camera so the stars stay at optical infinity
    this.sky.group.position.copy(cameraPos);
    this.sky.update(elapsed);

    // The neighbourhood is drawn whichever system you are standing in - it is
    // the same map, re-expressed around a different origin.
    this.neighbourhood.update(cameraPos, scaleT);

    if (this.activeId !== SOL_ID) {
      const foreign = this.foreignSystems.get(this.activeId);
      foreign?.update(simDays, scaleT, elapsed, cameraPos);
      if (foreign) {
        // once the whole system is smaller than a few pixels there is nothing
        // to see but the star, so stop drawing thirty bodies nobody can resolve
        const px = (foreign.extent(scaleT) / Math.max(cameraPos.length(), 1e-6) / (2 * halfTan)) * viewH;
        foreign.setPlanetsVisible(px > 8);
      }
      this.markers.commit();
      return;
    }

    this.sun.update(elapsed, scaleT, simDays);

    for (const planet of this.planets.values()) {
      const def = planet.def;
      const [x, y, z] = keplerPosition(def.orbit!, simDays);
      mapPositionAU(x, y, z, scaleT, this.tmp);
      planet.group.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
      planet.update(simDays, scaleT);
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

  // ------------------------------------------------------- system switching --

  /** Which system the scene's origin currently sits on. */
  get activeSystemId(): string {
    return this.activeId;
  }

  /** The built scene for the active foreign system, if we are in one. */
  get activeForeign(): StarSystemScene | undefined {
    return this.activeId === SOL_ID ? undefined : this.foreignSystems.get(this.activeId);
  }

  /** Foreign systems currently resident on the GPU - the LOD budget. */
  get builtSystemIds(): string[] {
    return [...this.foreignSystems.keys()];
  }

  /** Any built foreign system, for code that needs to look one up by id. */
  foreign(id: string): StarSystemScene | undefined {
    return this.foreignSystems.get(id);
  }

  /**
   * Build a system's geometry without moving to it, so a cinematic arrival has
   * something to arrive at. Cheap to call twice - it returns the cached scene.
   */
  prepareSystem(id: string): StarSystemScene | null {
    if (id === SOL_ID) return null;
    const existing = this.foreignSystems.get(id);
    if (existing) {
      // freshen its place in the eviction queue
      this.systemOrder = this.systemOrder.filter((s) => s !== id);
      this.systemOrder.push(id);
      return existing;
    }
    const def = starSystem(id);
    if (!def) return null;
    const built = new StarSystemScene(def);
    built.group.visible = false;
    this.scene.add(built.group);
    this.foreignSystems.set(id, built);
    this.systemOrder.push(id);
    this.evict();
    this.rebuildPickables();
    built.setOrbitsVisible(this.layers.planetOrbits);
    built.setHabitableZoneVisible(this.layers.habitableZone);
    return built;
  }

  /** Hand the scene's origin to another system (or back to the Sun). */
  setActiveSystem(id: string): void {
    if (this.activeId === id) return;
    if (id !== SOL_ID) this.prepareSystem(id);
    this.activeId = id;
    this.neighbourhood.setOrigin(id);

    this.solGroup.visible = id === SOL_ID;
    for (const [sysId, scene] of this.foreignSystems) {
      scene.group.visible = sysId === id;
    }
    // the reference grid is a heliocentric AU ruler; it means nothing at
    // another star, so it goes away until we come home
    this.grid.setVisible(this.layers.grid && id === SOL_ID);
    this.constellations.setVisible(this.layers.constellations && id === SOL_ID);
    this.constellations.setDeepSkyVisible(this.layers.deepSky && id === SOL_ID);
    this.rebuildPickables();
    this.evict();
    this.publishFrame();
  }

  /**
   * Tell the spacecraft's ephemeris which system it is flying in. Without this
   * the cockpit would keep answering "where is Europa" while parked at
   * TRAPPIST-1 - the ship has to read the world it is actually inside.
   */
  private publishFrame(): void {
    const scene = this.activeForeign;
    if (!scene) {
      setInterstellarFrame(null);
      return;
    }
    setInterstellarFrame({
      systemId: scene.def.id,
      systemName: scene.def.name,
      position: (id, simDays, out) => scene.positionAt(id, simDays, 1, out),
      radiusUnits: (id) => (scene.has(id) ? trueRadiusOf(scene, id) : null),
      radiusKm: (id) => scene.radiusKmOf(id),
      ids: () => scene.targetIds(),
      nameOf: (id) =>
        scene.def.planets.find((p) => p.id === id)?.name ??
        scene.def.stars.find((s) => s.id === id)?.name ??
        null,
    });
  }

  /** Drop systems nobody is looking at, keeping the most recent few. */
  private evict(): void {
    while (this.systemOrder.length > SYSTEM_CACHE_SIZE) {
      const victim = this.systemOrder.find((s) => s !== this.activeId);
      if (!victim) break;
      this.systemOrder = this.systemOrder.filter((s) => s !== victim);
      const scene = this.foreignSystems.get(victim);
      if (scene) {
        this.scene.remove(scene.group);
        scene.dispose();
        this.foreignSystems.delete(victim);
      }
    }
  }

  private solPickables: THREE.Object3D[] = [];

  private rebuildPickables(): void {
    if (this.solPickables.length === 0) this.solPickables = [...this.pickables];
    this.pickables.length = 0;
    if (this.activeId === SOL_ID) {
      this.pickables.push(...this.solPickables);
    } else {
      const scene = this.foreignSystems.get(this.activeId);
      if (scene) this.pickables.push(...scene.pickables);
    }
  }

  /** Apply the layer visibility state to every scene subsystem. */
  setLayers(layers: Layers): void {
    this.layers = { ...layers };
    for (const scene of this.foreignSystems.values()) {
      scene.setOrbitsVisible(layers.planetOrbits);
      scene.setHabitableZoneVisible(layers.habitableZone);
    }
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
    this.grid.setVisible(layers.grid && this.activeId === SOL_ID);
    // Constellation figures are lines drawn between stars as seen from Earth,
    // and the Messier marks are catalogued in Earth's sky. Neither survives a
    // move of several light-years, so both stand down when the origin does -
    // the star field and the galaxy behind them do not change measurably and
    // stay exactly as they are.
    const atHome = this.activeId === SOL_ID;
    this.constellations.setVisible(layers.constellations && atHome);
    this.constellations.setDeepSkyVisible(layers.deepSky && atHome);
    this.hz.mesh.visible = layers.habitableZone;
    this.neighbourhood.setEnabled(layers.nearbyStars);
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
    this.mainBelt.points.visible = this.layers.beltDust || this.selectedRegion === 'main-belt';
    this.kuiperBelt.points.visible = this.layers.kuiperBelt || this.selectedRegion === 'kuiper-belt';
    this.oortCloud.setEnabled(this.layers.oortCloud || this.selectedRegion === 'oort-cloud');
  }

  setHighlightedOrbit(id: string | null): void {
    this.selectedId = id;
    for (const scene of this.foreignSystems.values()) scene.setSelected(id);
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

  /** World position of any selectable body, in this system or another star's. */
  bodyPosition(id: string, out: THREE.Vector3): THREE.Vector3 {
    const foreign = this.activeForeign;
    if (foreign?.has(id)) return foreign.position(id, out) ?? out.set(0, 0, 0);
    if (id === 'sun') return out.set(0, 0, 0);
    const p = this.planets.get(id);
    if (p) return out.copy(p.group.position);
    if (this.smallBodies.position(id, out)) return out;
    for (const sats of this.satSystems.values()) {
      if (sats.worldPosition(id, out)) return out;
    }
    // an id belonging to a system we are not standing in resolves to that
    // system's place in the neighbourhood, so navigation can still aim at it
    const owning = systemOfPlanet(id)?.id ?? systemOfStar(id)?.id;
    if (owning) return this.neighbourhood.positionOf(owning, this.lastScaleT, out);
    return out.set(0, 0, 0);
  }

  /** Current display radius of any selectable body. */
  bodyRadius(id: string, scaleT: number): number {
    const foreign = this.activeForeign;
    if (foreign?.has(id)) return foreign.radiusOf(id);
    if (id === 'sun') return this.sun.radius;
    const p = this.planets.get(id);
    if (p) return p.radius;
    if (this.smallBodies.has(id)) return this.smallBodies.displayRadius(id);
    for (const sats of this.satSystems.values()) {
      if (sats.has(id)) return sats.displayRadius(id, scaleT);
    }
    return 1;
  }

  /** The system id that owns a selectable id, or 'sol' for anything local. */
  systemOf(id: string): string {
    return systemOfPlanet(id)?.id ?? systemOfStar(id)?.id ?? SOL_ID;
  }

  /** Should this body's label be considered right now? */
  labelVisible(id: string, camPos: THREE.Vector3, selectedId: string | null): boolean {
    const foreign = this.activeForeign;
    if (foreign?.has(id)) return true;
    const def = catalogObject(id);
    if (!def) return false;
    // the Solar System's own labels have nothing to point at from another star
    if (this.activeId !== SOL_ID) return false;
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
    return camPos.distanceTo(pos) < 60;
  }

  /** Heliocentric distance in AU for the info panel, when known. */
  heliocentricAU(id: string): number | null {
    if (id === 'sun') return 0;
    const small = this.smallBodies.heliocentricAU(id);
    if (small !== null) return small;
    const planet = this.planets.get(id);
    if (planet?.def.orbit) {
      const [x, y, z] = keplerPosition(planet.def.orbit, this.lastSimDays);
      return Math.hypot(x, y, z);
    }
    return null;
  }

  /** Forward render-resolution changes to every DPR-aware point shader. */
  setPixelRatio(pr: number): void {
    this.neighbourhood.setPixelRatio(pr);
    this.sky.setPixelRatio(pr);
    this.mainBelt.setPixelRatio(pr);
    this.kuiperBelt.setPixelRatio(pr);
    this.oortCloud.setPixelRatio(pr);
    this.smallBodies.setPixelRatio(pr);
  }
}
