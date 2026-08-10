/** Orbit ellipses + the habitable-zone annulus, both scale-mode aware. */
import * as THREE from 'three';
import { keplerPosition, type BodyDef, HZ_INNER_AU, HZ_OUTER_AU } from '../data/bodies';
import { mapDistanceAU, mapPositionAU } from '../sim/scale';

const ORBIT_SEGMENTS = 256;

export class OrbitLine {
  readonly line: THREE.LineLoop;
  private baseAU: Float32Array; // ecliptic AU positions, untransformed
  private mat: THREE.LineBasicMaterial;

  constructor(def: BodyDef) {
    const el = def.orbit!;
    this.baseAU = new Float32Array(ORBIT_SEGMENTS * 3);
    for (let i = 0; i < ORBIT_SEGMENTS; i++) {
      // sample uniformly in mean anomaly by sweeping a full period
      const t = (i / ORBIT_SEGMENTS) * el.periodDays;
      const [x, y, z] = keplerPosition(el, t);
      this.baseAU[i * 3] = x;
      this.baseAU[i * 3 + 1] = y;
      this.baseAU[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ORBIT_SEGMENTS * 3), 3));
    this.mat = new THREE.LineBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.32,
    });
    this.line = new THREE.LineLoop(geo, this.mat);
    this.line.frustumCulled = false;
    this.rebuild(0);
  }

  rebuild(scaleT: number): void {
    const attr = this.line.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const out = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < ORBIT_SEGMENTS; i++) {
      mapPositionAU(this.baseAU[i * 3], this.baseAU[i * 3 + 1], this.baseAU[i * 3 + 2], scaleT, out);
      arr[i * 3] = out.x;
      arr[i * 3 + 1] = out.y;
      arr[i * 3 + 2] = out.z;
    }
    attr.needsUpdate = true;
  }

  setHighlight(on: boolean, someoneFocused: boolean): void {
    this.mat.opacity = on ? 0.75 : someoneFocused ? 0.14 : 0.32;
  }
}

const HZ_VERT = /* glsl */ `
  attribute float aRad; // 0 = inner edge, 1 = outer edge
  varying float vRad;
  varying vec3 vWorld;
  uniform float uInner;
  uniform float uOuter;
  void main() {
    vRad = aRad;
    float r = mix(uInner, uOuter, aRad);
    vec3 pos = vec3(position.x * r, 0.0, position.z * r);
    vWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const HZ_FRAG = /* glsl */ `
  precision mediump float;
  varying float vRad;
  varying vec3 vWorld;
  uniform vec3 uCamPos;
  void main() {
    float a = sin(vRad * 3.14159) * 0.14;
    // fade fragments seen at grazing angles so the far rim never hardens
    // into a straight edge across the frame
    vec3 view = vWorld - uCamPos;
    float slope = abs(view.y) / max(length(view), 1e-4);
    a *= smoothstep(0.05, 0.2, slope);
    gl_FragColor = vec4(0.22, 0.85, 0.59, a);
  }
`;

/** Soft green annulus marking where liquid water could persist. */
export class HabitableZone {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    const seg = 160;
    const positions = new Float32Array((seg + 1) * 2 * 3);
    const rads = new Float32Array((seg + 1) * 2);
    const idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      // unit direction; the shader applies the radius
      positions[(i * 2) * 3] = cos;
      positions[(i * 2) * 3 + 2] = sin;
      positions[(i * 2 + 1) * 3] = cos;
      positions[(i * 2 + 1) * 3 + 2] = sin;
      rads[i * 2] = 0;
      rads[i * 2 + 1] = 1;
      if (i < seg) {
        const a0 = i * 2;
        idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aRad', new THREE.BufferAttribute(rads, 1));
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: HZ_VERT,
      fragmentShader: HZ_FRAG,
      uniforms: {
        uInner: { value: 1 },
        uOuter: { value: 2 },
        uCamPos: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.position.y = -0.02;
    this.update(0);
  }

  update(scaleT: number): void {
    this.mat.uniforms.uInner.value = mapDistanceAU(HZ_INNER_AU, scaleT);
    this.mat.uniforms.uOuter.value = mapDistanceAU(HZ_OUTER_AU, scaleT);
  }

  updateViewFade(cameraPos: THREE.Vector3): void {
    (this.mat.uniforms.uCamPos.value as THREE.Vector3).copy(cameraPos);
  }
}
