/** Assembles the whole solar system and advances it each frame. */
import * as THREE from 'three';
import { PLANETS, MOON, keplerPosition, type BodyDef } from '../data/bodies';
import { mapPositionAU, displayRadius } from '../sim/scale';
import { Sun } from './sun';
import { Planet } from './planet';
import { Sky } from './sky';
import { Belt, MAIN_BELT, KUIPER_BELT } from './belt';
import { OrbitLine, HabitableZone } from './orbits';
import type { GeneratedTextures } from './textures';

export class SolarSystem {
  readonly scene = new THREE.Scene();
  readonly sun: Sun;
  readonly planets = new Map<string, Planet>();
  readonly orbitLines = new Map<string, OrbitLine>();
  readonly hz: HabitableZone;
  readonly pickables: THREE.Object3D[] = [];
  private sky: Sky;
  private mainBelt: Belt;
  private kuiperBelt: Belt;
  private lastOrbitScaleT = -1;
  private tmp = { x: 0, y: 0, z: 0 };

  constructor(tex: GeneratedTextures) {
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
      if (def.id === 'earth') planet.setMoonTexture(tex.bodies.moon.map);
      this.planets.set(def.id, planet);
      this.scene.add(planet.group);
      this.pickables.push(planet.hit);
      if (planet.moonHit) this.pickables.push(planet.moonHit);

      const orbit = new OrbitLine(def);
      this.orbitLines.set(def.id, orbit);
      this.scene.add(orbit.line);
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

    for (const [id, planet] of this.planets) {
      const def = planet.def;
      const [x, y, z] = keplerPosition(def.orbit!, simDays);
      mapPositionAU(x, y, z, scaleT, this.tmp);
      planet.group.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
      planet.update(simDays, scaleT);
      void id;
    }

    this.mainBelt.update(simDays, scaleT);
    this.kuiperBelt.update(simDays, scaleT);
    this.sky.update(elapsed);

    if (Math.abs(scaleT - this.lastOrbitScaleT) > 0.0005) {
      this.lastOrbitScaleT = scaleT;
      for (const orbit of this.orbitLines.values()) orbit.rebuild(scaleT);
      this.hz.update(scaleT);
    }
    if (cameraPos) this.hz.updateViewFade(cameraPos);
  }

  setOrbitsVisible(v: boolean): void {
    for (const o of this.orbitLines.values()) o.line.visible = v;
  }

  setHZVisible(v: boolean): void {
    this.hz.mesh.visible = v;
  }

  setHighlightedOrbit(id: string | null): void {
    // while a body is focused, other orbits recede so they don't slice the shot
    for (const [pid, o] of this.orbitLines) o.setHighlight(pid === id, id !== null);
  }

  bodyDef(id: string): BodyDef | undefined {
    if (id === 'sun') return undefined;
    if (id === 'moon') return MOON;
    return this.planets.get(id)?.def;
  }

  /** World position of any selectable body. */
  bodyPosition(id: string, out: THREE.Vector3): THREE.Vector3 {
    if (id === 'sun') return out.set(0, 0, 0);
    if (id === 'moon') {
      const earth = this.planets.get('earth')!;
      return earth.moonWorldPosition(out);
    }
    const p = this.planets.get(id);
    return p ? out.copy(p.group.position) : out.set(0, 0, 0);
  }

  /** Current display radius of any selectable body. */
  bodyRadius(id: string, scaleT: number): number {
    if (id === 'sun') return this.sun.radius;
    if (id === 'moon') return displayRadius('moon', MOON.facts.diameterKm, scaleT);
    const p = this.planets.get(id);
    return p ? p.radius : 1;
  }
}
