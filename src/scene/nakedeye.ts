/**
 * Planets as points of light.
 *
 * At true scale a planet is a genuinely sub-pixel object from anywhere except
 * its own neighbourhood - Jupiter seen from Earth is 40 arcseconds across, well
 * under one pixel in a 50° field. Rasterising a sub-pixel sphere is both
 * invisible and unstable (it flickers, and the flicker pumps the bloom pass),
 * so below a few pixels the mesh steps aside and this takes over: one point per
 * body, sized and coloured from a real photometric model.
 *
 * That is not a cheat, it is what the sky looks like. From the cockpit, Jupiter
 * IS a bright star, and it gets brighter as you close on it, exactly as the
 * inverse-square law says it should.
 *
 * Brightness model - reflected sunlight:
 *   L  = albedo · R_km² / (r_AU² · d_AU²) · phase
 *   m  = 14.207 − 2.5·log₁₀(L)
 * The constant is calibrated so Jupiter at opposition lands on its catalogued
 * m = −2.7; Neptune then falls out at +7.8 against a real +7.8. The Sun uses
 * m = −26.74 + 5·log₁₀(d_AU) directly.
 *
 * Points are drawn on the sky shell at the body's true bearing, so they sit at
 * optical infinity with the stars and can never be clipped by the far plane.
 */
import * as THREE from 'three';
import { PLANETS, SUN } from '../data/bodies';
import { catalogObject } from '../data/catalog';
import { UNITS_PER_AU, bodyPositionTrue, bodyRadiusTrue } from '../spacecraft/ephemeris';

/** Just inside scene/sky.ts's shell so these sit among the stars. */
const SKY_R = 5700;
/** Photometric zero point (see the module note). */
const MAG_ZERO = 14.207;

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPr;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    gl_PointSize = aSize * uPr;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    if (aAlpha < 0.004) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    // a stellar point: tight core, soft halo, faint diffraction cross
    float core = smoothstep(0.42, 0.0, d);
    float halo = smoothstep(1.0, 0.18, d) * 0.32;
    float spike = max(0.0, 0.24 - min(abs(p.x), abs(p.y)) * 3.2) * smoothstep(1.0, 0.1, d);
    float a = (core + halo + spike) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

export interface NakedEyeEntry {
  id: string;
  /** Projected diameter of the real mesh in device-independent pixels. */
  px: number;
  /** Distance from the observer in scene units. */
  dist: number;
  /** Apparent magnitude right now. */
  mag: number;
}

interface Body {
  id: string;
  radiusKm: number;
  albedo: number;
  color: THREE.Color;
  isSun: boolean;
}

export class NakedEyeBodies {
  readonly points: THREE.Points;
  /** Per-body results from the last update, keyed by id. */
  readonly state = new Map<string, NakedEyeEntry>();
  private bodies: Body[] = [];
  private pos: Float32Array;
  private color: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private tmp = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private toSun = new THREE.Vector3();

  constructor() {
    this.bodies.push({
      id: 'sun',
      radiusKm: SUN.facts.diameterKm / 2,
      albedo: 1,
      color: new THREE.Color(0xfff4e0),
      isSun: true,
    });
    for (const p of PLANETS) {
      this.bodies.push({
        id: p.id,
        radiusKm: p.facts.diameterKm / 2,
        albedo: p.facts.albedo ?? 0.3,
        // pull toward white: a naked-eye planet is a point of light, not a disc
        color: new THREE.Color(p.color).lerp(new THREE.Color(0xffffff), 0.45),
        isSun: false,
      });
    }

    const n = this.bodies.length;
    this.pos = new Float32Array(n * 3);
    this.color = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uPr: { value: Math.min(2, window.devicePixelRatio || 1) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    // after the star field, before anything solid - a nearby planet's disc
    // still occludes these through the depth test
    this.points.renderOrder = -9;
    this.points.visible = false;
    for (const b of this.bodies) {
      this.state.set(b.id, { id: b.id, px: 0, dist: 0, mag: 99 });
    }
  }

  setPixelRatio(pr: number): void {
    this.mat.uniforms.uPr.value = pr;
  }

  setEnabled(v: boolean): void {
    this.points.visible = v;
  }

  /**
   * @param observer camera position in scene units
   * @param halfTanFov tan(fov/2)
   * @param viewH viewport height in CSS pixels
   */
  update(observer: THREE.Vector3, simDays: number, halfTanFov: number, viewH: number): void {
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      bodyPositionTrue(b.id, simDays, this.tmp);
      this.dir.copy(this.tmp).sub(observer);
      const dist = this.dir.length();
      const entry = this.state.get(b.id)!;
      entry.dist = dist;

      const rScene = bodyRadiusTrue(b.id);
      const px = dist > 1e-9 ? ((2 * rScene) / dist / (2 * halfTanFov)) * viewH : 1e6;
      entry.px = px;

      let mag: number;
      const dAU = dist / UNITS_PER_AU;
      if (b.isSun) {
        mag = -26.74 + 5 * Math.log10(Math.max(dAU, 1e-6));
      } else {
        const rAU = this.tmp.length() / UNITS_PER_AU; // heliocentric distance
        // illuminated fraction as seen from here - this is what makes Venus
        // dim into a crescent when the ship is on its far side
        this.toSun.copy(this.tmp).negate();
        const cosPhase =
          this.toSun.lengthSq() > 1e-12 && this.dir.lengthSq() > 1e-12
            ? this.toSun.normalize().dot(this.dir.clone().negate().normalize())
            : 1;
        const phase = Math.max(0.015, (1 + cosPhase) / 2);
        const lum =
          (b.albedo * b.radiusKm * b.radiusKm * phase) /
          Math.max(1e-8, rAU * rAU * dAU * dAU);
        mag = MAG_ZERO - 2.5 * Math.log10(Math.max(lum, 1e-30));
      }
      entry.mag = mag;

      // hand over to the mesh once the disc is genuinely resolvable
      const handoff = 1 - THREE.MathUtils.smoothstep(px, 2.6, 6.5);
      let size = 1.6 + 5.0 * THREE.MathUtils.clamp((4.0 - mag) / 10, 0, 1);
      if (mag < -8) size += Math.min(5, (-8 - mag) * 0.28);
      const alpha = THREE.MathUtils.clamp((6.8 - mag) / 5, 0, 1) * handoff;

      this.dir.normalize();
      this.pos[i * 3] = observer.x + this.dir.x * SKY_R;
      this.pos[i * 3 + 1] = observer.y + this.dir.y * SKY_R;
      this.pos[i * 3 + 2] = observer.z + this.dir.z * SKY_R;
      // very bright points are allowed above the bloom threshold; faint ones
      // stay below it so they can never pump a full-screen glow
      const gain = mag < -10 ? 1.45 : mag < -3 ? 1.0 : 0.8;
      this.color[i * 3] = b.color.r * gain;
      this.color[i * 3 + 1] = b.color.g * gain;
      this.color[i * 3 + 2] = b.color.b * gain;
      this.size[i] = Math.min(size, 8);
      this.alpha[i] = alpha;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }

  /** Projected size in pixels of a body's mesh at the last update. */
  pixelsOf(id: string): number {
    return this.state.get(id)?.px ?? 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** Human-readable brightness note for the HUD. */
export function magnitudeNote(mag: number): string {
  if (mag < -20) return 'blinding';
  if (mag < -8) return 'brighter than any star';
  if (mag < -2) return 'brilliant';
  if (mag < 1) return 'bright naked-eye object';
  if (mag < 4) return 'easy naked-eye object';
  if (mag < 6.5) return 'at the naked-eye limit';
  return 'telescopic';
}

/** True when a catalog id is one of the bodies this renderer knows about. */
export function isNakedEyeBody(id: string): boolean {
  return id === 'sun' || !!catalogObject(id)?.orbit;
}
