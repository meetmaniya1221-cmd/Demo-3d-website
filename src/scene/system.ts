/** Assembles the whole solar system and advances it each frame. */
import * as THREE from 'three';
import { PLANETS, keplerPosition, type BodyDef } from '../data/bodies';
import { mapPositionAU } from '../sim/scale';
import { MOONS_BY_PARENT, SMALL_BODIES, catalogObject } from '../data/catalog';
import type { CatalogObject } from '../data/types';
import { Sun } from './sun';
import { Planet } from './planet';
import { Sky } from './sky';
import { Belt, MAIN_BELT, KUIPER_BELT } from './belt';
import { OrbitLine, HabitableZone } from './orbits';
import { SatelliteSystem } from './satellites';
import { SmallBodies } from './smallbodies';
import type { GeneratedTextures } from './textures';

export class SolarSystem {
  readonly scene = new THREE.Scene();
  readonly sun: Sun;
  readonly planets = new Map<string, Planet>();
  readonly orbitLines = new Map<string, OrbitLine>();
  readonly satSystems = new Map<string, SatelliteSystem>(); // keyed by parent id
  readonly smallBodies: SmallBodies;
  readonly hz: HabitableZone;
  readonly pickables: THREE.Object3D[] = [];
  private sky: Sky;
  private mainBelt: Belt;
  private kuiperBelt: Belt;
  private lastOrbitScaleT = -1;
  private selectedId: string | null = null;
  private tmp = { x: 0, y: 0, z: 0 };
  private tmpV = new THREE.Vector3();

  constructor(tex: GeneratedTextures, textureBase: string) {
    this.scene.background = new THREE.Color(0x020308);

    this.sky = new Sky(tex.milkyWay);
    this.scene.add(this.sky.group);

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
        );
        this.satSystems.set(def.id, sats);
        this.pickables.push(...sats.pickables);
      }
    }

    this.smallBodies = new SmallBodies(this.scene, SMALL_BODIES, textureBase);
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
        parentBody.root as unknown as THREE.Group,
        parentBody.root as unknown as THREE.Group,
        textureBase,
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

  update(simDays: number, scaleT: number, elapsed: number, cameraPos?: THREE.Vector3): void {
    this.sun.update(elapsed, scaleT);
    // pin the sky to the camera so the stars stay at optical infinity
    if (cameraPos) this.sky.group.position.copy(cameraPos);

    for (const planet of this.planets.values()) {
      const def = planet.def;
      const [x, y, z] = keplerPosition(def.orbit!, simDays);
      mapPositionAU(x, y, z, scaleT, this.tmp);
      planet.group.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
      planet.update(simDays, scaleT);
    }

    this.smallBodies.update(simDays, scaleT, elapsed, cameraPos ?? this.tmpV.set(0, 0, 0));

    // satellite systems: collapse to nothing when the camera is far away
    for (const [parentId, sats] of this.satSystems) {
      const parentPos = this.bodyPosition(parentId, this.tmpV);
      const parentR = this.parentDisplayRadius(parentId);
      const extent = sats.systemExtent(parentR, scaleT);
      const camDist = cameraPos ? cameraPos.distanceTo(parentPos) : 1e9;
      const selectedHere =
        this.selectedId !== null &&
        (this.selectedId === parentId || sats.has(this.selectedId));
      const near = selectedHere || camDist < Math.max(extent * 9, parentR * 24);
      sats.update(simDays, scaleT, parentR, near, elapsed);
    }

    this.mainBelt.update(simDays, scaleT);
    this.kuiperBelt.update(simDays, scaleT);
    this.sky.update(elapsed);

    if (Math.abs(scaleT - this.lastOrbitScaleT) > 0.0005) {
      this.lastOrbitScaleT = scaleT;
      for (const orbit of this.orbitLines.values()) orbit.rebuild(scaleT);
      this.smallBodies.rebuildOrbits(scaleT);
      this.hz.update(scaleT);
    }
    if (cameraPos) this.hz.updateViewFade(cameraPos);
  }

  private parentDisplayRadius(parentId: string): number {
    if (parentId === 'sun') return this.sun.radius;
    const planet = this.planets.get(parentId);
    if (planet) return planet.radius;
    return this.smallBodies.displayRadius(parentId);
  }

  setOrbitsVisible(v: boolean): void {
    for (const o of this.orbitLines.values()) o.line.visible = v;
    this.smallBodies.setOrbitsVisible(v);
    for (const sats of this.satSystems.values()) sats.setOrbitsVisible(v);
  }

  setHZVisible(v: boolean): void {
    this.hz.mesh.visible = v;
  }

  setHighlightedOrbit(id: string | null): void {
    this.selectedId = id;
    // while a body is focused, other orbits recede so they don't slice the shot
    for (const [pid, o] of this.orbitLines) o.setHighlight(pid === id, id !== null);
    this.smallBodies.setSelected(id);
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
    if (def.type === 'star' || def.type === 'planet') return true;
    if (def.type === 'moon') {
      const sats = def.parent ? this.satSystems.get(def.parent) : undefined;
      return !!sats?.isVisible;
    }
    if (def.type === 'dwarf' || def.type === 'tno') return true;
    // asteroids + comets: visible when selected, near, or (comets) active
    if (id === selectedId) return true;
    if (def.type === 'comet' && this.smallBodies.cometActivity(id) > 0.08) return true;
    const pos = this.bodyPosition(id, this.tmpV);
    return camPos.distanceTo(pos) < 60;
  }

  /** Heliocentric distance in AU for the info panel, when known. */
  heliocentricAU(id: string): number | null {
    return this.smallBodies.heliocentricAU(id);
  }
}
