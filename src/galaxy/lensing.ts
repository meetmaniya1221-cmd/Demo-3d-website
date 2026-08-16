/**
 * Gravitational lensing around Sagittarius A*, as a full-screen pass over
 * the rendered galaxy - so what bends is the actual starfield the player
 * sees, not a canned effect texture.
 *
 * Two regimes, both driven by the real Schwarzschild radius (1.27×10⁷ km):
 *
 *  1. Background deflection - the Schwarzschild point-lens equation
 *     β = θ − θE²/θ with θE = √(2Rs/D) for sources at infinity. It costs a
 *     handful of ALU per pixel and produces the physical phenomenology for
 *     free: stars sweep away from the hole as you approach, sources behind
 *     it smear into an Einstein ring, and inside θE the secondary (parity-
 *     flipped) images appear. Light bending is achromatic, and so is this.
 *
 *  2. Near-field geodesics - inside a window around the shadow the shader
 *     integrates rays through the standard photon-bending approximation
 *     (acceleration −(3/2)h²r/r⁵, the same scheme most numerically honest
 *     real-time black-hole renderers use). Rays that spiral below the
 *     photon sphere go black - that IS the shadow, whose apparent radius
 *     √27/2·Rs ≈ 2.6 Rs emerges from the integration rather than being
 *     painted. Rays crossing the equatorial plane pick up emission from a
 *     hot-gas annulus between the ISCO (3 Rs) and ~14 Rs, with Keplerian
 *     streaks, Doppler boosting (δ³) that brightens the approaching side -
 *     the asymmetry in every EHT image - and gravitational-redshift
 *     dimming toward the inner edge.
 *
 * Honesty note, mirrored in the HUD: Sgr A* has NO bright Interstellar-
 * style disk. It accretes ~10⁻⁸ M☉/yr through a radiatively inefficient
 * flow at ~10⁻⁹ of its Eddington luminosity, so the quiescent emission here
 * is faint and the spectacle comes from flares (Chandra: ~1 X-ray flare per
 * day, up to ~400× quiescent; JWST: continuous IR flicker), accelerated for
 * gameplay by the flare generator in sgra.ts.
 */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SGRA_CAPTURE_RS, SGRA_ISCO_RS, SGRA_RS_LY } from './units';

const LENS_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform vec3 uBhView;      // black hole position, view space (ly)
  uniform float uRs;         // Schwarzschild radius (ly)
  uniform float uTanHalf;    // tan(fov/2)
  uniform float uAspect;
  uniform float uTime;
  uniform float uGlow;       // quiescent emission level
  uniform float uFlare;      // flare multiplier from the generator (~1..42)
  uniform float uStrength;   // pass fade 0..1
  uniform vec3 uDiskN;       // accretion-flow axis, view space (world-fixed)

  // ---- helpers ----------------------------------------------------------

  vec3 rayDir(vec2 uv) {
    vec2 ndc = uv * 2.0 - 1.0;
    return normalize(vec3(ndc.x * uTanHalf * uAspect, ndc.y * uTanHalf, -1.0));
  }

  vec2 dirToUv(vec3 d) {
    // inverse of rayDir for d.z < 0
    vec2 ndc = vec2(d.x / (-d.z * uTanHalf * uAspect), d.y / (-d.z * uTanHalf));
    return ndc * 0.5 + 0.5;
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  // hot-gas colour: temperature falls outward; values in HDR for bloom
  vec3 gasColor(float rRs) {
    float t = clamp((rRs - 3.0) / 11.0, 0.0, 1.0);
    vec3 hot = vec3(1.45, 1.30, 1.10);
    vec3 mid = vec3(1.35, 0.85, 0.45);
    vec3 cool = vec3(0.85, 0.32, 0.12);
    return t < 0.5 ? mix(hot, mid, t * 2.0) : mix(mid, cool, t * 2.0 - 1.0);
  }

  void main() {
    vec3 base = texture2D(tDiffuse, vUv).rgb;
    if (uStrength <= 0.001 || uBhView.z > -1e-9) {
      gl_FragColor = vec4(base, 1.0);
      return;
    }

    float D = length(uBhView);
    vec3 toBh = uBhView / D;
    vec3 d = rayDir(vUv);

    // angular separation pixel ↔ black hole
    float cosA = clamp(dot(d, toBh), -1.0, 1.0);
    float theta = acos(cosA);

    float thetaE = sqrt(2.0 * uRs / D);          // Einstein angle
    float thetaC = ${SGRA_CAPTURE_RS.toFixed(4)} * uRs / D; // apparent capture radius

    // ---- background deflection (point lens) -----------------------------
    vec2 bhUv = dirToUv(toBh);
    vec2 offs = vUv - bhUv;
    // aspect-corrected angular offset so the ring stays a circle
    vec2 ang = offs * vec2(uAspect, 1.0);
    float bend = 1.0 - (thetaE * thetaE) / (theta * theta + 1e-12);
    vec2 srcUv = bhUv + (ang * bend) / vec2(uAspect, 1.0);
    srcUv = clamp(srcUv, vec2(0.001), vec2(0.999));
    vec3 lensed = texture2D(tDiffuse, srcUv).rgb;

    // magnification brightening near the ring (|dβ/dθ|⁻¹ blows up at θE);
    // a soft cap keeps the tone mapper alive
    float mag = 1.0 + 1.6 * exp(-pow((theta - thetaE) / (thetaE * 0.25 + 1e-9), 2.0));
    lensed *= mag;

    vec3 col = mix(base, lensed, uStrength);

    // ---- near field: geodesic march -------------------------------------
    // only pay for rays that pass anywhere near the shadow
    float marchWindow = max(thetaC * 11.0, thetaE * 1.8);
    if (theta < marchWindow) {
      vec3 p = vec3(0.0);
      vec3 v = d;
      // conserved angular momentum of this ray about the hole
      vec3 rel0 = p - uBhView;
      float h2 = dot(cross(rel0, v), cross(rel0, v));
      float rs = uRs;

      // disk basis: the flow's angular momentum axis. WORLD-fixed and passed
      // in per frame - computing it in view space froze the disk to the
      // screen, so yawing around the hole dragged the flow with the camera.
      vec3 nDisk = normalize(uDiskN);
      vec3 ref = abs(nDisk.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
      vec3 e1 = normalize(cross(nDisk, ref));
      vec3 e2 = cross(nDisk, e1);

      vec3 emission = vec3(0.0);
      float captured = 0.0;
      float prevSide = dot(rel0, nDisk);
      float rIn = ${SGRA_ISCO_RS.toFixed(1)} * rs; // ISCO
      float rOut = 14.0 * rs;

      for (int i = 0; i < 52; i++) {
        vec3 rel = p - uBhView;
        float r = length(rel);
        if (r < rs * 1.02) { captured = 1.0; break; }
        if (r > D + 30.0 * rs && dot(rel, v) > 0.0) break; // escaped past
        // adaptive step: fine near the hole, coarse elsewhere
        float dt = max(0.42 * rs, r * 0.30);
        // photon bending: a = -(3/2)·Rs·h²·r̂/r⁴. The Rs factor matters -
        // the textbook form assumes r in units of Rs; here r is in ly, and
        // omitting it over-bends by ~10⁶ and swallows the whole sky
        v += -1.5 * rs * h2 * rel / pow(r, 5.0) * dt;
        v = normalize(v);
        p += v * dt;

        // equatorial crossing → hot-gas annulus emission
        float side = dot(p - uBhView, nDisk);
        if (side * prevSide < 0.0) {
          vec3 relHit = p - uBhView;
          float rHit = length(relHit);
          if (rHit > rIn && rHit < rOut) {
            float rRs = rHit / rs;
            float phi = atan(dot(relHit, e2), dot(relHit, e1));
            // Keplerian pattern speed ~ r^-1.5; streaks shear accordingly
            float w = 6.0 / pow(rRs, 1.5);
            float streak =
              0.55 + 0.45 * vnoise(vec2(phi * 3.0 + uTime * w, rRs * 2.2));
            streak *= 0.7 + 0.3 * vnoise(vec2(phi * 9.0 - uTime * w * 1.7, rRs * 5.0));
            // Doppler: orbital speed v/c = sqrt(Rs/2r); approaching side δ³
            float beta = sqrt(rs / (2.0 * rHit));
            vec3 tdir = cross(nDisk, relHit);
            float tl = length(tdir);
            // rays grazing the flow axis have no tangent - skip, not NaN
            float mu = tl > 1e-12 ? dot(tdir / tl, -v) : 0.0;
            float dopp = 1.0 / max(0.25, 1.0 - beta * mu);
            float boost = dopp * dopp * dopp;
            // gravitational redshift dims the inner edge
            float gred = sqrt(max(0.0, 1.0 - rs / rHit));
            float radial = pow(${SGRA_ISCO_RS.toFixed(1)} / rRs, 2.1);
            float e = radial * streak * boost * gred;
            // the comparison doubles as a NaN guard: a NaN e fails it and
            // never reaches the accumulator (one NaN poisons every bloom mip)
            if (e >= 0.0) {
              vec3 c = gasColor(rRs);
              // Doppler colour skew: approaching side slightly hotter/bluer
              c = mix(c, c.zyx * vec3(0.9, 1.0, 1.35), clamp((dopp - 1.0) * 0.8, -0.25, 0.5));
              emission += c * e;
            }
          }
        }
        prevSide = side;
      }

      // Photon ring: drawn analytically at the capture angle. The 52-step
      // march resolves the shadow but is too coarse to build the ring from
      // ray pile-up alone, so this term stands in for it - an approximation,
      // not an emergent result (the shadow above IS emergent).
      float ring = exp(-pow((theta - thetaC) / (thetaC * 0.16 + 1e-9), 2.0));
      emission += vec3(1.3, 1.0, 0.75) * ring * 0.55;

      float level = uGlow * (0.35 + uFlare * 0.65);
      col = mix(col, vec3(0.0), captured * uStrength);
      col += emission * level * uStrength * (1.0 - captured);
    }

    // a single NaN pixel poisons every bloom mip into grey blocks - scrub
    if (!(col.r + col.g + col.b >= 0.0)) col = vec3(0.0);
    gl_FragColor = vec4(clamp(col, 0.0, 48.0), 1.0);
  }
`;

/** Accretion-flow angular-momentum axis in galaxy-scene world coordinates. */
const DISK_AXIS_WORLD = new THREE.Vector3(-0.88, 0.44, 0.18).normalize();

const LENS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export class LensingPass extends Pass {
  private material: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null },
      uBhView: { value: new THREE.Vector3(0, 0, 1) },
      uRs: { value: SGRA_RS_LY },
      uTanHalf: { value: Math.tan((26 * Math.PI) / 180) },
      uAspect: { value: 16 / 9 },
      uTime: { value: 0 },
      uGlow: { value: 0.55 },
      uFlare: { value: 1 },
      uStrength: { value: 0 },
      uDiskN: { value: new THREE.Vector3(0, 1, 0) },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: LENS_VERT,
      fragmentShader: LENS_FRAG,
      uniforms: this.uniforms,
    });
    this.quad = new FullScreenQuad(this.material);
    this.needsSwap = true;
  }

  /**
   * Per-frame update. `bhWorld` is the hole's position in the render scene
   * (already camera-relative), `camera` the active camera.
   */
  syncFrame(
    bhWorld: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    time: number,
    flareLevel: number,
    strength: number,
  ): void {
    const v = this.uniforms.uBhView.value as THREE.Vector3;
    v.copy(bhWorld).applyMatrix4(camera.matrixWorldInverse);
    // EHT constrains Sgr A*'s flow axis to within ~30-50 degrees of our line
    // of sight: mostly toward the Sun (scene -x), tipped toward galactic
    // north. Fixed in the WORLD, converted to view space here each frame.
    (this.uniforms.uDiskN.value as THREE.Vector3)
      .copy(DISK_AXIS_WORLD)
      .transformDirection(camera.matrixWorldInverse);
    this.uniforms.uTanHalf.value = Math.tan((camera.fov * Math.PI) / 360);
    this.uniforms.uAspect.value = camera.aspect;
    this.uniforms.uTime.value = time;
    this.uniforms.uFlare.value = flareLevel;
    this.uniforms.uStrength.value = strength;
    this.enabled = strength > 0.001;
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
