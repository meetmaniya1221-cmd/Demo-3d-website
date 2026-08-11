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
import { Belt, MAIN_BELT, KUIPER_BELT } from './belt';
import { OrbitLine, HabitableZone } from './orbits';
import { SatelliteSystem } from './satellites';
import { SmallBodies } from './smallbodies';
import { Markers } from './markers';
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
  private sky: Sky;
  private mainBelt: Belt;
  private kuiperBelt: Belt;
  private lastOrbitScaleT = -1;
  private selectedId: string | null = null;
  private layers: Layers = { ...DEFAULT_LAYERS };
  private tmp = { x: 0, y: 0, z: 0 };
  private tmpV = new THREE.Vector3();

  constructor(tex: GeneratedTextures, textureBase: string) {
    this.scene.background = new THREE.Color(0x020308);

    this.sky = new Sky(tex.milkyWay);
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
      this.pickables.push(...sats.pickables);
    }

    this.mainBelt = new Belt(MAIN_BELT);
    this.kuiperBelt = new Belt(KUIPER_BELT);
    this.scene.add(this.mainBelt.points, this.kuiperBelt.points);

    this.hz = new HabitableZone();
    this.hz.mesh.visible = false;
    this.scene.add(this.hz.mesh);

    // fill so night sides read as dim spheres, not black cutouts, while the
    // lit side keeps a clear terminator
    this.scene.add(new THREE.AmbientLight(0x445870, 1.7));
  }

  update(simDays: number, scaleT: number, elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.sun.update(elapsed, scaleT);
    const cameraPos = camera.position;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const viewH = window.innerHeight;
    // pin the sky to the camera so the stars stay at optical infinity
    this.sky.group.position.copy(cameraPos);

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
    this.mainBelt.update(simDays, scaleT);
    this.kuiperBelt.update(simDays, scaleT);
    this.sky.update(elapsed);

    if (Math.abs(scaleT - this.lastOrbitScaleT) > 0.0005) {
      this.lastOrbitScaleT = scaleT;
      for (const orbit of this.orbitLines.values()) orbit.rebuild(scaleT);
      this.smallBodies.rebuildOrbits(scaleT);
      this.grid.rebuild(scaleT);
      this.hz.update(scaleT);
    }
    this.hz.updateViewFade(cameraPos);
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
    this.mainBelt.points.visible = layers.beltDust;
    this.kuiperBelt.points.visible = layers.beltDust;
    this.grid.setVisible(layers.grid);
    this.constellations.setVisible(layers.constellations);
    this.hz.mesh.visible = layers.habitableZone;
  }

  private parentDisplayRadius(parentId: string): number {
    if (parentId === 'sun') return this.sun.radius;
    const planet = this.planets.get(parentId);
    if (planet) return planet.radius;
    return this.smallBodies.displayRadius(parentId);
  }

  setHighlightedOrbit(id: string | null): void {
    this.selectedId = id;
    // while a body is focused, other orbits recede so they don't slice the shot
    for (const [pid, o] of this.orbitLines) o.setHighlight(pid === id, id !== null);
    this.smallBodies.setSelected(id);
    // re-apply layers: a selected body is always force-shown even if its
    // category layer is off (search can reveal anything)
    this.smallBodies.setLayers(this.layers);
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
    for (const sats of this.satSystems.values()) {
      if (sats.worldPosition(id, out)) return out;
    }
    return out.set(0, 0, 0);
  }

  /** Current display radius of any selectable body. */
  bodyRadius(id: string, scaleT: number): number {
    if (id === 'sun') return this.sun.radius;
    const p = this.planets.get(id);
    if (p) return p.radius;
    if (this.smallBodies.has(id)) return this.smallBodies.displayRadius(id);
    for (const sats of this.satSystems.values()) {
      if (sats.has(id)) return sats.displayRadius(id, scaleT);
    }
    return 1;
  }

  /** Should this body's label be considered right now? */
  labelVisible(id: string, camPos: THREE.Vector3, selectedId: string | null): boolean {
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
    return camPos.distanceTo(pos) < 60;
  }

  /** Heliocentric distance in AU for the info panel, when known. */
  heliocentricAU(id: string): number | null {
    return this.smallBodies.heliocentricAU(id);
  }
}
