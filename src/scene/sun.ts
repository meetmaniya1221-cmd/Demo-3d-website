/** The Sun: animated plasma shader + layered corona sprites + the system's light. */
import * as THREE from 'three';
import { displayRadius } from '../sim/scale';
import { SUN } from '../data/bodies';
import { makeGlowTexture } from './textures';

// Compact 3D simplex noise (Ashima Arts / Ian McEwan, MIT).
const NOISE_GLSL = /* glsl */ `
  vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
  vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

const SUN_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vPos;
  varying vec3 vNormal;
  uniform float uTime;
  ${NOISE_GLSL}
  void main() {
    vec3 p = normalize(vPos);
    float t = uTime * 0.045;
    float n = snoise(p * 3.4 + vec3(t, t * 0.7, -t));
    n += 0.55 * snoise(p * 7.5 - vec3(t * 1.4, t, t * 0.6));
    n += 0.28 * snoise(p * 16.0 + vec3(0.0, t * 2.2, 0.0));
    n = n * 0.5 + 0.5;
    // granulation ramp: deep orange → gold → near white
    vec3 deep = vec3(0.78, 0.26, 0.05);
    vec3 mid  = vec3(1.0, 0.62, 0.16);
    vec3 hot  = vec3(1.0, 0.94, 0.78);
    vec3 col = mix(deep, mid, smoothstep(0.15, 0.6, n));
    col = mix(col, hot, smoothstep(0.62, 0.95, n));
    // limb darkening (epsilon floor guards against driver pow(0, y) NaNs)
    float facing = clamp(dot(vNormal, vec3(0.0, 0.0, 1.0)), 1e-4, 1.0);
    col *= 0.55 + 0.45 * pow(facing, 0.6);
    // HDR-ish, feeds bloom — bounded so a bad texel can never blow up the mips
    gl_FragColor = vec4(min(col * 2.1, vec3(6.0)), 1.0);
  }
`;

export class Sun {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly light: THREE.PointLight;
  private mat: THREE.ShaderMaterial;
  private coronaInner: THREE.Sprite;
  private coronaOuter: THREE.Sprite;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG,
      uniforms: { uTime: { value: 0 } },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.mat);
    this.mesh.name = 'sun';
    this.group.add(this.mesh);

    const innerTex = makeGlowTexture(256, [
      [0, 'rgba(255,190,90,0.85)'],
      [0.25, 'rgba(255,150,60,0.4)'],
      [0.6, 'rgba(255,120,40,0.12)'],
      [1, 'rgba(255,110,30,0)'],
    ]);
    const outerTex = makeGlowTexture(256, [
      [0, 'rgba(255,180,100,0.35)'],
      [0.4, 'rgba(255,140,70,0.12)'],
      [1, 'rgba(255,120,50,0)'],
    ]);
    this.coronaInner = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: innerTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.coronaOuter = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: outerTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.group.add(this.coronaInner, this.coronaOuter);

    this.light = new THREE.PointLight(0xfff1dd, 3.2, 0, 0);
    this.group.add(this.light);
  }

  update(elapsed: number, scaleT: number): void {
    this.mat.uniforms.uTime.value = elapsed;
    const r = displayRadius('sun', SUN.facts.diameterKm, scaleT);
    this.mesh.scale.setScalar(r);
    this.coronaInner.scale.setScalar(r * 5.2);
    this.coronaOuter.scale.setScalar(r * 11);
    // slow solar rotation for the granulation pattern
    this.mesh.rotation.y = elapsed * 0.008;
  }

  get radius(): number {
    return this.mesh.scale.x;
  }
}
