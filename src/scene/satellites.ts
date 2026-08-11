/**
 * A planet's satellite system: N moons on circular parent-centric orbits,
 * scale-mode aware, with lazily-loaded surfaces and per-moon orbit rings.
 *
 * Regular moons ride in the parent's equatorial plane (true for every major
 * moon rendered here except Earth's Moon, which orbits near the ecliptic and
 * is attached to the ecliptic group instead).
 */
import * as THREE from 'three';
import type { CatalogObject } from '../data/types';
import { moonDisplayDist, moonDisplayRadius, trueRadius } from '../sim/scale';
import { minorTexture, irregularGeometry, type MinorPaintKind } from './minortex';
import { Markers, projectedPx, markerFade } from './markers';

const sphereGeo = new THREE.SphereGeometry(1, 48, 24);

/** Moons with a visible gas envelope get a soft additive rim shell. */
const MOON_HAZE: Record<string, { color: number; strength: number }> = {
  titan: { color: 0xe8a04c, strength: 0.5 },
  triton: { color: 0xb8d8e8, strength: 0.16 },
};

const HAZE_VERT = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HAZE_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  uniform vec3 uColor;
  uniform float uStrength;
  void main() {
    float facing = dot(vNormal, vec3(0.0, 0.0, 1.0));
    float rim = pow(clamp(0.62 - facing, 1e-4, 1.0), 3.6);
    gl_FragColor = vec4(uColor * rim * uStrength, 1.0);
  }
`;

/** Paint recipe for moons without photographic maps. */
const MOON_PAINT: Record<string, MinorPaintKind> = {
  miranda: 'ice-gray',
  ariel: 'ice-gray',
  umbriel: 'ice-dark',
  titania: 'ice-gray',
  oberon: 'ice-dark',
};

function parseAspect(dims?: string): [number, number, number] | null {
  if (!dims) return null;
  const nums = dims.match(/[\d.]+/g)?.map(Number) ?? [];
  if (nums.length < 3 || nums[0] <= 0) return null;
  return [1, nums[1] / nums[0], nums[2] / nums[0]];
}

interface Sat {
  def: CatalogObject;
  mesh: THREE.Mesh;
  hit: THREE.Mesh;
  ring: THREE.LineLoop;
  haze?: THREE.Mesh;
  markerIdx: number;
  phase: number;
  radius: number;
  activated: boolean;
}

const ringGeoCache: THREE.BufferGeometry | { geo?: THREE.BufferGeometry } = {};
function unitRing(): THREE.BufferGeometry {
  const holder = ringGeoCache as { geo?: THREE.BufferGeometry };
  if (holder.geo) return holder.geo;
  const seg = 96;
  const pos = new Float32Array(seg * 3);
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos[i * 3] = Math.cos(a);
    pos[i * 3 + 2] = -Math.sin(a);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  holder.geo = geo;
  return geo;
}

export class SatelliteSystem {
  readonly sats: Sat[] = [];
  readonly pickables: THREE.Object3D[] = [];
  private parentRadiusKm: number;
  private visible = true;
  private orbitsEnabled = true;
  private textureBase: string;
  private markers: Markers;
  private lastParentR = 1;
  private tmpV = new THREE.Vector3();

  constructor(
    parentRadiusKm: number,
    moons: CatalogObject[],
    equatorialGroup: THREE.Group,
    eclipticGroup: THREE.Group,
    textureBase: string,
    markers: Markers,
  ) {
    this.parentRadiusKm = parentRadiusKm;
    this.textureBase = textureBase;
    this.markers = markers;
    for (const def of moons) {
      const aspect = parseAspect(def.physical.dimensionsKm);
      const geo = aspect ? irregularGeometry(def.id, aspect) : sphereGeo;
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: def.color, roughness: 1, metalness: 0 }),
      );
      mesh.name = def.id;
      const hitMat = new THREE.MeshBasicMaterial();
      hitMat.visible = false;
      const hit = new THREE.Mesh(sphereGeo, hitMat);
      hit.name = def.id;
      const ring = new THREE.LineLoop(
        unitRing(),
        new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.22 }),
      );
      ring.frustumCulled = false;
      // Earth's Moon orbits near the ecliptic, regular moons near the equator
      const host = def.id === 'moon' ? eclipticGroup : equatorialGroup;
      host.add(mesh, hit, ring);
      let haze: THREE.Mesh | undefined;
      const hazeSpec = MOON_HAZE[def.id];
      if (hazeSpec) {
        haze = new THREE.Mesh(
          sphereGeo,
          new THREE.ShaderMaterial({
            vertexShader: HAZE_VERT,
            fragmentShader: HAZE_FRAG,
            uniforms: {
              uColor: { value: new THREE.Color(hazeSpec.color) },
              uStrength: { value: hazeSpec.strength },
            },
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
          }),
        );
        host.add(haze);
      }
      this.pickables.push(hit);
      this.sats.push({
        def,
        mesh,
        hit,
        ring,
        haze,
        markerIdx: markers.register(def.id, def.color),
        phase: (def.id.charCodeAt(0) * 1.37 + def.id.length) % (Math.PI * 2),
        radius: 0.1,
        activated: false,
      });
    }
  }

  /** Swap the flat-color material for the real surface (streamed or painted). */
  private activate(sat: Sat): void {
    if (sat.activated) return;
    sat.activated = true;
    const mat = sat.mesh.material as THREE.MeshStandardMaterial;
    const file = sat.def.texture?.file;
    const applyPainted = () => {
      const kind = MOON_PAINT[sat.def.id] ?? 'ice-gray';
      mat.map = minorTexture(sat.def.id, kind);
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    };
    if (file) {
      new THREE.TextureLoader().load(
        `${this.textureBase}textures/${file}`,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          tex.anisotropy = 4;
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

  /** Ensure a specific moon's real surface is loaded (e.g. on selection). */
  activateMoon(id: string): void {
    const sat = this.sats.find((s) => s.def.id === id);
    if (sat) this.activate(sat);
  }

  setVisible(v: boolean): void {
    if (this.visible === v) return;
    this.visible = v;
    for (const s of this.sats) {
      s.mesh.visible = v;
      if (s.haze) s.haze.visible = v;
      s.ring.visible = v && this.orbitsEnabled;
      // keep hit proxies raycastable only while shown
      s.hit.visible = false;
      (s.hit.material as THREE.MeshBasicMaterial).visible = false;
      s.hit.layers.set(v ? 0 : 31);
    }
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setOrbitsVisible(v: boolean): void {
    this.orbitsEnabled = v;
    for (const s of this.sats) s.ring.visible = v && this.visible;
  }

  /** Distance beyond which the whole system collapses into its parent. */
  systemExtent(parentDisplayR: number, scaleT: number): number {
    let max = parentDisplayR;
    for (const s of this.sats) {
      const d = moonDisplayDist(
        s.def.satOrbit!.distanceKm,
        this.parentRadiusKm,
        parentDisplayR,
        scaleT,
      );
      if (d > max) max = d;
    }
    return max;
  }

  update(
    simDays: number,
    scaleT: number,
    parentDisplayR: number,
    nearCamera: boolean,
    elapsed: number,
    camPos: THREE.Vector3,
    halfTanFov: number,
    viewH: number,
  ): void {
    this.lastParentR = parentDisplayR;
    this.setVisible(nearCamera);
    if (!nearCamera) {
      for (const s of this.sats) this.markers.set(s.markerIdx, 0, 0, 0, 0, 0);
      return;
    }
    // paint at most one surface per frame so approaching a five-moon system
    // does not stall a whole frame on texture generation
    let paintBudget = 1;
    for (const s of this.sats) {
      const orbit = s.def.satOrbit!;
      // TRUE size relative to the parent (plus a subtle visibility floor) -
      // the Moon must read as dramatically smaller than Earth, Titan as a
      // speck beside Saturn. Markers + labels carry findability below that.
      const r = moonDisplayRadius(
        s.def.id,
        s.def.physical.diameterKm,
        this.parentRadiusKm * 2,
        parentDisplayR,
        scaleT,
      );
      s.radius = r;
      let dist = moonDisplayDist(orbit.distanceKm, this.parentRadiusKm, parentDisplayR, scaleT);
      // never let a floored moon intersect its exaggerated parent
      dist = Math.max(dist, parentDisplayR * 1.15 + r * 2);
      const ang = (simDays / orbit.periodDays) * Math.PI * 2 + s.phase;
      s.mesh.position.set(Math.cos(ang) * dist, 0, -Math.sin(ang) * dist);
      s.mesh.scale.setScalar(r);
      if (s.def.physical.rotationHours === undefined && s.def.id === 'hyperion') {
        // chaotic tumbler
        s.mesh.rotation.set(elapsed * 0.11, elapsed * 0.23, elapsed * 0.07);
      } else if (s.def.physical.tidallyLocked === false && s.def.physical.rotationHours) {
        // free rotator (Phoebe spins in 9.3 h despite its 550-day orbit)
        s.mesh.rotation.y =
          s.phase + ((simDays * 24) / s.def.physical.rotationHours) * Math.PI * 2;
      } else {
        // tidal lock: same face toward the parent
        s.mesh.rotation.y = ang + Math.PI;
      }
      s.hit.position.copy(s.mesh.position);
      s.hit.scale.setScalar(Math.max(r * 1.7, 0.14 * (1 - scaleT) + r * 2 * scaleT));
      if (s.haze) {
        s.haze.position.copy(s.mesh.position);
        s.haze.scale.setScalar(r * 1.12);
      }
      s.ring.scale.setScalar(dist);

      // marker crossfade: tiny moons render as stable fixed-size dots
      const world = s.mesh.getWorldPosition(this.tmpV);
      const px = projectedPx(r, camPos.distanceTo(world), halfTanFov, viewH);
      const mFade = markerFade(px);
      s.mesh.visible = mFade < 1;
      if (s.haze) s.haze.visible = s.mesh.visible;
      this.markers.set(s.markerIdx, world.x, world.y, world.z, mFade, r * 1.6);

      if (!s.activated && s.mesh.visible && px > 4 && paintBudget > 0) {
        paintBudget--;
        this.activate(s);
      }
    }
  }

  /** True while this satellite id belongs to the system. */
  has(id: string): boolean {
    return this.sats.some((s) => s.def.id === id);
  }

  worldPosition(id: string, out: THREE.Vector3): THREE.Vector3 | null {
    const sat = this.sats.find((s) => s.def.id === id);
    return sat ? sat.mesh.getWorldPosition(out) : null;
  }

  displayRadius(id: string, scaleT: number): number {
    const sat = this.sats.find((s) => s.def.id === id);
    if (!sat) return 0.1;
    if (!this.visible) {
      return moonDisplayRadius(
        id,
        sat.def.physical.diameterKm,
        this.parentRadiusKm * 2,
        this.lastParentR,
        scaleT,
      );
    }
    return sat.radius;
  }

  trueRadiusOf(id: string): number {
    const sat = this.sats.find((s) => s.def.id === id);
    return sat ? trueRadius(id, sat.def.physical.diameterKm) : 0.01;
  }
}
