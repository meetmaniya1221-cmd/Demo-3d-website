/**
 * Heliocentric small bodies: dwarf planets, notable TNOs, major asteroids and
 * periodic comets. Each rides real Kepler elements, draws an orbit ellipse,
 * lazily loads its surface, and (for comets) grows a coma and tails near the
 * Sun.
 *
 * Rendering strategy (stability + performance):
 *  - below a few projected pixels the mesh is hidden and a fixed-pixel-size
 *    marker takes over (see markers.ts) - nothing sub-pixel ever rasterises,
 *    which is what killed the comet flicker;
 *  - comet coma/tails have their own projected-size gates with smooth fades;
 *  - whole categories toggle via the layer system without touching the data.
 */
import * as THREE from 'three';
import type { CatalogObject } from '../data/types';
import { keplerPosition } from '../data/bodies';
import { mapPositionAU, minorDisplayRadius } from '../sim/scale';
import type { Layers } from '../sim/state';
import { OrbitLine } from './orbits';
import { minorTexture, irregularGeometry, type MinorPaintKind } from './minortex';
import { CometFX } from './comet';
import { Markers, projectedPx, markerFade } from './markers';

const sphereGeo = new THREE.SphereGeometry(1, 48, 24);
const textureLoader = new THREE.TextureLoader();

/** Paint recipe for bodies without photographic maps. */
const PAINT: Record<string, MinorPaintKind> = {
  eris: 'ice-bright',
  haumea: 'ice-bright',
  makemake: 'ice-red',
  quaoar: 'ice-red',
  sedna: 'ice-red',
  gonggong: 'ice-red',
  orcus: 'ice-gray',
  pallas: 'rock',
  hygiea: 'rock',
  psyche: 'metal',
  eros: 'rock',
};

function paintKindOf(def: CatalogObject): MinorPaintKind {
  if (def.type === 'comet') return 'comet';
  return PAINT[def.id] ?? (def.type === 'asteroid' ? 'rock-dark' : 'ice-gray');
}

function radiusFloor(def: CatalogObject): number {
  if (def.type === 'comet' || def.type === 'asteroid') return 0.05;
  return 0.1; // dwarfs / TNOs
}

function layerKeyOf(def: CatalogObject): 'dwarfs' | 'asteroids' | 'comets' {
  if (def.type === 'comet') return 'comets';
  if (def.type === 'asteroid') return 'asteroids';
  return 'dwarfs';
}

function parseAspect(dims?: string): [number, number, number] | null {
  if (!dims) return null;
  const nums = dims.match(/[\d.]+/g)?.map(Number) ?? [];
  if (nums.length < 3 || nums[0] <= 0) return null;
  return [1, nums[1] / nums[0], nums[2] / nums[0]];
}

interface SmallBody {
  def: CatalogObject;
  root: THREE.Group;
  mesh: THREE.Mesh;
  hit: THREE.Mesh;
  orbit: OrbitLine;
  fx?: CometFX;
  markerIdx: number;
  radius: number;
  rAU: number;
  activated: boolean;
  /** category layer currently on (or body force-shown by selection) */
  enabled: boolean;
  /** asteroid orbits stay hidden unless the body is selected */
  orbitOnSelectOnly: boolean;
  spinPhase: number;
}

export class SmallBodies {
  readonly bodies = new Map<string, SmallBody>();
  readonly pickables: THREE.Object3D[] = [];
  private group = new THREE.Group();
  private orbitsEnabled = true;
  private selectedId: string | null = null;
  private textureBase: string;
  private markers: Markers;
  private tmp = { x: 0, y: 0, z: 0 };
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    defs: CatalogObject[],
    textureBase: string,
    markers: Markers,
  ) {
    this.textureBase = textureBase;
    this.markers = markers;
    scene.add(this.group);
    for (const def of defs) {
      if (!def.orbit) continue;
      const aspect = parseAspect(def.physical.dimensionsKm);
      const geo =
        aspect && (def.type === 'asteroid' || def.type === 'comet')
          ? irregularGeometry(def.id, aspect)
          : aspect
            ? sphereGeo // Haumea: true ellipsoid handled via scale below
            : def.type === 'comet' || def.type === 'asteroid'
              ? irregularGeometry(def.id)
              : sphereGeo;
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: def.color, roughness: 1, metalness: 0 }),
      );
      mesh.name = def.id;
      const hitMat = new THREE.MeshBasicMaterial();
      hitMat.visible = false;
      const hit = new THREE.Mesh(sphereGeo, hitMat);
      hit.name = def.id;
      const root = new THREE.Group();
      root.add(mesh, hit);
      this.group.add(root);
      const isComet = def.type === 'comet';
      const orbitOnSelectOnly = def.type === 'asteroid' && (def.orbit.a < 2 || def.orbit.a > 3.5);
      const orbit = new OrbitLine(def.orbit, def.color, {
        opacity: isComet ? 0.2 : def.type === 'dwarf' || def.type === 'tno' ? 0.2 : 0.16,
        focusOpacity: 0.8,
        fadeOpacity: 0.08,
      });
      this.group.add(orbit.line);
      let fx: CometFX | undefined;
      if (isComet) {
        fx = new CometFX(def.id.charCodeAt(0) * 7 + def.id.length);
        root.add(fx.group);
      }
      this.pickables.push(hit);
      this.bodies.set(def.id, {
        def,
        root,
        mesh,
        hit,
        orbit,
        fx,
        markerIdx: markers.register(def.id, def.color),
        radius: 0.2,
        rAU: def.orbit.a,
        activated: false,
        enabled: true,
        orbitOnSelectOnly,
        spinPhase: ((def.id.charCodeAt(0) * 3.1 + (def.id.charCodeAt(1) || 17) * 0.9)) % (Math.PI * 2),
      });
      if (orbitOnSelectOnly) orbit.line.visible = false;
    }
  }

  private activate(b: SmallBody): void {
    if (b.activated) return;
    b.activated = true;
    const mat = b.mesh.material as THREE.MeshStandardMaterial;
    const applyPainted = () => {
      mat.map = minorTexture(b.def.id, paintKindOf(b.def));
      mat.color.set(0xffffff);
      if (b.def.id === 'psyche') mat.metalness = 0.45;
      mat.needsUpdate = true;
    };
    const file = b.def.texture?.file;
    if (file) {
      textureLoader.load(
        `${this.textureBase}textures/${file}`,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          tex.anisotropy = 4;
          mat.map?.dispose();
          mat.map = tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
        },
        undefined,
        applyPainted,
      );
    } else {
      applyPainted();
    }
  }

  setOrbitsVisible(v: boolean): void {
    this.orbitsEnabled = v;
    this.syncOrbitVisibility();
  }

  /** Category layers; a selected body is always force-shown. */
  setLayers(layers: Layers): void {
    for (const b of this.bodies.values()) {
      b.enabled = layers[layerKeyOf(b.def)] || b.def.id === this.selectedId;
      b.root.visible = b.enabled;
      // keep disabled bodies out of the raycaster
      b.hit.layers.set(b.enabled ? 0 : 31);
    }
    this.syncOrbitVisibility();
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    for (const [bid, b] of this.bodies) {
      b.orbit.setHighlight(bid === id, id !== null);
      if (bid === id) this.activate(b);
    }
  }

  get selected(): string | null {
    return this.selectedId;
  }

  isEnabled(id: string): boolean {
    return this.bodies.get(id)?.enabled ?? false;
  }

  private syncOrbitVisibility(): void {
    for (const [bid, b] of this.bodies) {
      const wanted =
        b.enabled && (b.orbitOnSelectOnly ? bid === this.selectedId : this.orbitsEnabled);
      b.orbit.line.visible = wanted;
    }
  }

  update(
    simDays: number,
    scaleT: number,
    _elapsed: number,
    camera: THREE.Vector3,
    halfTanFov: number,
    viewH: number,
  ): void {
    for (const b of this.bodies.values()) {
      if (!b.enabled) {
        this.markers.set(b.markerIdx, 0, 0, 0, 0, 0);
        continue;
      }
      const el = b.def.orbit!;
      const [x, y, z] = keplerPosition(el, simDays);
      b.rAU = Math.hypot(x, y, z);
      mapPositionAU(x, y, z, scaleT, this.tmp);
      b.root.position.set(this.tmp.x, this.tmp.y, this.tmp.z);

      const r = minorDisplayRadius(b.def.id, b.def.physical.diameterKm, scaleT, radiusFloor(b.def));
      b.radius = r;
      if (b.def.id !== 'haumea') b.mesh.scale.setScalar(r);
      else b.mesh.scale.set(r, r * 0.51, r * 0.8); // fast spin flattened Haumea

      const camDist = camera.distanceTo(b.root.position);
      const px = projectedPx(r, camDist, halfTanFov, viewH);
      const mFade = markerFade(px);
      // sub-pixel meshes never rasterise: that IS the flicker fix
      b.mesh.visible = mFade < 1;
      this.markers.set(
        b.markerIdx,
        b.root.position.x,
        b.root.position.y,
        b.root.position.z,
        mFade,
        r * 1.6,
      );

      // activate surfaces as the camera approaches
      if (!b.activated && b.mesh.visible && px > 6) this.activate(b);

      if (b.mesh.visible) {
        const hours = b.def.physical.rotationHours ?? 30;
        b.mesh.rotation.y = b.spinPhase + ((simDays * 24) / hours) * Math.PI * 2;
      }
      b.hit.scale.setScalar(Math.max(r * 1.8, 0.3 * (1 - scaleT) + r * 2 * scaleT));

      if (b.fx) {
        const antiSun = this.tmpV.copy(b.root.position).normalize();
        // orbital velocity direction from a short finite difference
        const [x2, y2, z2] = keplerPosition(el, simDays + el.periodDays * 1e-4);
        mapPositionAU(x2, y2, z2, scaleT, this.tmp);
        const vel = this.tmpV2
          .set(this.tmp.x, this.tmp.y, this.tmp.z)
          .sub(b.root.position);
        if (vel.lengthSq() < 1e-12) vel.set(0, 0, 1);
        vel.normalize();
        // tail turbulence rides sim time (not the wall clock) so pausing the
        // simulation freezes the comet too; ~day-scale churn reads right at
        // typical time speeds
        b.fx.update(b.rAU, antiSun, vel, r, scaleT, simDays * 0.35);
        // LOD gates: the coma sprite needs real screen coverage to earn its
        // bloom; tails may linger longer (a distant active comet reads as a
        // marker dot with a faint streak - exactly right)
        const comaPx = projectedPx(r * (1.7 + b.fx.activity * 2.0), camDist, halfTanFov, viewH);
        const tailPx = projectedPx(
          b.fx.activity * (3.2 * (1 - scaleT) + 12 * scaleT),
          camDist,
          halfTanFov,
          viewH,
        );
        b.fx.setLOD(
          THREE.MathUtils.smoothstep(comaPx, 7, 16),
          THREE.MathUtils.smoothstep(tailPx, 14, 34),
        );
      }
    }
  }

  rebuildOrbits(scaleT: number): void {
    for (const b of this.bodies.values()) b.orbit.rebuild(scaleT);
  }

  has(id: string): boolean {
    return this.bodies.has(id);
  }

  position(id: string, out: THREE.Vector3): THREE.Vector3 | null {
    const b = this.bodies.get(id);
    return b ? out.copy(b.root.position) : null;
  }

  displayRadius(id: string): number {
    return this.bodies.get(id)?.radius ?? 0.2;
  }

  /** Current heliocentric distance in AU (for the info panel + comet UI). */
  heliocentricAU(id: string): number | null {
    return this.bodies.get(id)?.rAU ?? null;
  }

  cometActivity(id: string): number {
    return this.bodies.get(id)?.fx?.activity ?? 0;
  }

  setPixelRatio(pr: number): void {
    for (const b of this.bodies.values()) b.fx?.setPixelRatio(pr);
  }
}
