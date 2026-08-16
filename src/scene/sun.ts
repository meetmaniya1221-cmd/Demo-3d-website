/** The Sun: animated plasma shader + layered corona sprites + the system's light. */
import * as THREE from 'three';
import { displayRadius } from '../sim/scale';
import { SUN } from '../data/bodies';
import { makeGlowTexture } from './textures';
import { SNOISE_GLSL as NOISE_GLSL } from './glslnoise';


const SUN_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec2 vUv;
  uniform float uTime;
  uniform sampler2D uMap;
  uniform float uHasMap;
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
    // photographic solar surface, kept alive by noise-warped UVs and modulated
    // by the animated granulation so the plasma still visibly churns
    if (uHasMap > 0.5) {
      vec2 warp = vec2(snoise(p * 5.0 + vec3(t, 0.0, t)), snoise(p * 5.0 - vec3(0.0, t, t))) * 0.006;
      vec3 tex = texture2D(uMap, vUv + warp).rgb;
      col = tex * (0.72 + 0.55 * n);
    }
    // limb darkening (epsilon floor guards against driver pow(0, y) NaNs)
    float facing = clamp(dot(vNormal, vec3(0.0, 0.0, 1.0)), 1e-4, 1.0);
    col *= 0.55 + 0.45 * pow(facing, 0.6);
    // HDR-ish, feeds bloom - bounded so a bad texel can never blow up the mips
    gl_FragColor = vec4(min(col * 2.1, vec3(6.0)), 1.0);
  }
`;

/**
 * Near-field corona. The normal view never sees this - it only fades in when an
 * observer gets within a few tens of solar radii, which only the spacecraft can
 * do. Each fragment recovers the view ray's closest approach to the Sun's
 * centre, so the glow is a genuine function of 3D geometry rather than a
 * billboard: it thins correctly as you move around and through it, and drawing
 * the shell's far side means the Sun's own disc occludes it for free.
 *
 * The structure in it (streamers, prominence-like arcs at the limb) is
 * procedural. It is informed by coronagraph imagery, not derived from it, and
 * the HUD says so.
 */
const CORONA_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const CORONA_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform float uTime;
  uniform float uIntensity;
  ${NOISE_GLSL}
  void main() {
    if (uIntensity <= 0.001) discard;
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - ro);
    vec3 oc = uCenter - ro;
    float tca = dot(oc, rd);
    float d2 = max(0.0, dot(oc, oc) - tca * tca);
    // impact parameter of this view ray, in solar radii
    float x = sqrt(d2) / max(uRadius, 1e-9);
    if (x > 9.0) discard;

    // direction of the closest-approach point: what the ray grazes past
    vec3 mid = normalize((ro + rd * max(tca, 0.0)) - uCenter);
    float t = uTime * 0.06;
    float n = 0.5 + 0.5 * snoise(mid * 3.1 + vec3(t, t * 0.4, -t * 0.7));
    n = mix(n, 0.5 + 0.5 * snoise(mid * 8.0 - vec3(t * 0.9, 0.0, t * 1.3)), 0.45);

    // K-corona style falloff, brightened along streamers
    float shell = max(0.0, x - 1.0);
    float dens = exp(-shell * 1.55) * (0.55 + 0.85 * n);
    dens += exp(-shell * 0.42) * 0.16 * pow(n, 2.0);       // long streamers
    if (x < 1.0) dens *= 0.22;                              // behind the disc

    // prominence arcs: hot, red, and only right at the limb
    float limb = exp(-pow((x - 1.06) * 13.0, 2.0));
    float prom = limb * smoothstep(0.62, 0.92, n);
    vec3 col = vec3(1.0, 0.78, 0.46) * dens
             + vec3(1.0, 0.30, 0.14) * prom * 0.9
             + vec3(0.55, 0.72, 1.0) * dens * 0.12;         // faint blue outer wisp
    gl_FragColor = vec4(min(col * uIntensity, vec3(3.0)), 1.0);
  }
`;

/** Shell radius, in solar radii. */
const CORONA_SHELL = 8.0;

export class Sun {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly light: THREE.PointLight;
  private mat: THREE.ShaderMaterial;
  private coronaInner: THREE.Sprite;
  private coronaOuter: THREE.Sprite;
  private nearCorona: THREE.Mesh;
  private nearMat: THREE.ShaderMaterial;
  private nearEnabled = false;
  private discVisible = true;
  private currentRadius = 1;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: null },
        uHasMap: { value: 0 },
      },
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

    this.nearMat = new THREE.ShaderMaterial({
      vertexShader: CORONA_VERT,
      fragmentShader: CORONA_FRAG,
      uniforms: {
        uCenter: { value: new THREE.Vector3(0, 0, 0) },
        uRadius: { value: 1 },
        uTime: { value: 0 },
        uIntensity: { value: 0 },
      },
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.nearCorona = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.nearMat);
    this.nearCorona.visible = false;
    this.nearCorona.renderOrder = 2;
    this.group.add(this.nearCorona);
  }

  update(elapsed: number, scaleT: number, simDays = 0): void {
    this.mat.uniforms.uTime.value = elapsed;
    const r = displayRadius('sun', SUN.facts.diameterKm, scaleT);
    this.currentRadius = r;
    this.mesh.scale.setScalar(r);
    this.coronaInner.scale.setScalar(r * 5.2);
    this.coronaOuter.scale.setScalar(r * 11);
    this.nearCorona.scale.setScalar(r * CORONA_SHELL);
    this.nearMat.uniforms.uRadius.value = r;
    this.nearMat.uniforms.uTime.value = elapsed;
    // solar rotation follows simulation time (sidereal Carrington rate,
    // ~25.4 days at the equator) so pause/rewind/fast-forward all apply
    this.mesh.rotation.y = (simDays / 25.38) * Math.PI * 2;
  }

  get radius(): number {
    return this.currentRadius;
  }

  /**
   * Arm the near-field corona (spacecraft mode only - the orbit view's Sun is
   * unchanged) and set how strongly it shows for an observer at `camDist`
   * scene units from the centre. Returns the distance in solar radii.
   */
  setObserver(camDist: number, enabled: boolean): number {
    this.nearEnabled = enabled;
    const radii = camDist / Math.max(this.currentRadius, 1e-9);
    if (!enabled) {
      this.nearCorona.visible = false;
      this.nearMat.uniforms.uIntensity.value = 0;
      return radii;
    }
    // invisible past ~55 radii, full strength inside ~22
    const k = 1 - THREE.MathUtils.smoothstep(radii, 22, 55);
    this.nearMat.uniforms.uIntensity.value = k * 1.35;
    this.nearCorona.visible = k > 0.002 && this.discVisible;
    return radii;
  }

  /**
   * Hide the disc and its sprite corona once the Sun is a sub-pixel object -
   * the naked-eye point renderer takes over and draws it as the brilliant star
   * it actually is from out there.
   */
  setDiscVisible(v: boolean): void {
    if (this.discVisible === v) return;
    this.discVisible = v;
    this.mesh.visible = v;
    this.coronaInner.visible = v;
    this.coronaOuter.visible = v;
    if (!v) this.nearCorona.visible = false;
  }

  get isNearFieldArmed(): boolean {
    return this.nearEnabled;
  }

  /** Swap in the photographic solar surface (progressive enhancement). */
  setSurfaceMap(map: THREE.Texture): void {
    (this.mat.uniforms.uMap.value as THREE.Texture | null)?.dispose();
    this.mat.uniforms.uMap.value = map;
    this.mat.uniforms.uHasMap.value = 1;
  }
}
