/**
 * A star that is not the Sun.
 *
 * Colour is not chosen - it comes from the star's measured effective
 * temperature through a blackbody approximation, so Sirius A at 9,940 K is
 * genuinely blue-white and TRAPPIST-1 at 2,566 K is genuinely a deep ember,
 * and the difference between them on screen is the difference in the data.
 * The same function tints the star's light, so a planet around a red dwarf is
 * lit red because its star is red.
 *
 * Surface granulation is procedural, as it is for the Sun - nobody has resolved
 * the disc of any of these stars except Betelgeuse and a handful of other
 * supergiants, and none of those are here.
 */
import * as THREE from 'three';
import { SNOISE_GLSL } from './glslnoise';
import { makeGlowTexture } from './textures';
import type { HostStar } from '../data/catalog/starsystems';

/**
 * Blackbody chromaticity, Tanner Helland's piecewise fit to the Planckian
 * locus (valid ~1,000-40,000 K). Returned normalised so the shader can scale
 * brightness separately from colour.
 */
export function blackbodyColor(tempK: number, out = new THREE.Color()): THREE.Color {
  const t = THREE.MathUtils.clamp(tempK, 1000, 40_000) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return out.setRGB(
    THREE.MathUtils.clamp(r, 0, 255) / 255,
    THREE.MathUtils.clamp(g, 0, 255) / 255,
    THREE.MathUtils.clamp(b, 0, 255) / 255,
  );
}

const VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vPos;
  varying vec3 vNormal;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uGranule;   // convection contrast: strong on cool dwarfs, weak on hot stars
  uniform float uSpots;     // starspot coverage
  ${SNOISE_GLSL}
  void main() {
    vec3 p = normalize(vPos);
    float t = uTime * 0.04;
    float n = snoise(p * 4.2 + vec3(t, t * 0.6, -t));
    n += 0.5 * snoise(p * 9.0 - vec3(t * 1.3, t, t * 0.5));
    n += 0.25 * snoise(p * 19.0 + vec3(0.0, t * 1.9, 0.0));
    n = n * 0.5 + 0.5;

    vec3 col = uColor * (1.0 - uGranule * 0.45 + uGranule * 0.9 * n);

    // Starspots: cool dwarfs are heavily spotted and the spots are large.
    // Drawn as darker, cooler patches rather than black holes in the disc.
    if (uSpots > 0.001) {
      float s = smoothstep(0.58, 0.86, snoise(p * 2.6 + 17.0) * 0.5 + 0.5);
      col = mix(col, uColor * 0.42, s * uSpots);
    }

    // limb darkening (epsilon floor guards driver pow(0, y) NaNs)
    float facing = clamp(dot(vNormal, vec3(0.0, 0.0, 1.0)), 1e-4, 1.0);
    col *= 0.55 + 0.45 * pow(facing, 0.62);
    gl_FragColor = vec4(min(col * 2.0, vec3(6.0)), 1.0);
  }
`;

const sphereGeo = new THREE.SphereGeometry(1, 48, 24);

export class HostStarBody {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly hit: THREE.Mesh;
  readonly light: THREE.PointLight | null;
  readonly def: HostStar;
  private mat: THREE.ShaderMaterial;
  private glowInner: THREE.Sprite;
  private glowOuter: THREE.Sprite;
  private radius = 1;

  /** `isPrimary` gets the point light - companions are lit sources too, but one
   *  light is enough for the geometry here and keeps the shader count down. */
  constructor(def: HostStar, isPrimary: boolean) {
    this.def = def;
    const color = blackbodyColor(def.tempK ?? 3500);
    // convection cells are enormous on cool dwarfs and vanishingly small on hot
    // stars; contrast on screen follows that
    const granule = THREE.MathUtils.clamp(1.15 - (def.tempK ?? 3500) / 9000, 0.15, 0.95);
    // a white dwarf has no convective envelope and no spots
    const isWhiteDwarf = def.spectral.startsWith('D');
    const spots = isWhiteDwarf ? 0 : THREE.MathUtils.clamp(1.4 - (def.tempK ?? 3500) / 4200, 0, 0.55);

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: color },
        uGranule: { value: isWhiteDwarf ? 0.1 : granule },
        uSpots: { value: spots },
      },
    });
    this.mesh = new THREE.Mesh(sphereGeo, this.mat);
    this.mesh.name = def.id;
    this.group.add(this.mesh);

    const hex = `${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)}`;
    this.glowInner = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(256, [
          [0, `rgba(${hex},0.62)`],
          [0.3, `rgba(${hex},0.22)`],
          [1, `rgba(${hex},0)`],
        ]),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.glowOuter = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(256, [
          [0, `rgba(${hex},0.19)`],
          [0.45, `rgba(${hex},0.06)`],
          [1, `rgba(${hex},0)`],
        ]),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.group.add(this.glowInner, this.glowOuter);

    // Light intensity does NOT follow luminosity: a shader that dims TRAPPIST-1
    // by its true 1/1800th of the Sun would render a black frame. Apparent
    // brightness at the planets is what the geometry already encodes (they orbit
    // far closer), so the lamp itself is normalised and the numbers are in the UI.
    this.light = isPrimary ? new THREE.PointLight(color.getHex(), 3.0, 0, 0) : null;
    if (this.light) this.group.add(this.light);

    const hitMat = new THREE.MeshBasicMaterial();
    hitMat.visible = false;
    this.hit = new THREE.Mesh(sphereGeo, hitMat);
    this.hit.name = def.id;
    this.group.add(this.hit);
  }

  update(elapsed: number, radius: number): void {
    this.mat.uniforms.uTime.value = elapsed;
    this.radius = radius;
    this.mesh.scale.setScalar(radius);
    // Scaled off the star's DRAWN radius, and deliberately tight. Sirius A is
    // 1.7 solar radii and gets an exaggerated explorer radius to match; a glow
    // ten times that filled half the frame and hid the white dwarf beside it.
    this.glowInner.scale.setScalar(radius * 2.9);
    this.glowOuter.scale.setScalar(radius * 5.6);
    this.hit.scale.setScalar(Math.max(radius * 1.8, 1.2));
  }

  get displayRadius(): number {
    return this.radius;
  }

  dispose(): void {
    this.mat.dispose();
    (this.glowInner.material as THREE.SpriteMaterial).map?.dispose();
    (this.glowInner.material as THREE.Material).dispose();
    (this.glowOuter.material as THREE.SpriteMaterial).map?.dispose();
    (this.glowOuter.material as THREE.Material).dispose();
    (this.hit.material as THREE.Material).dispose();
  }
}
