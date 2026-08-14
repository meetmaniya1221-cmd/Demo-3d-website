/**
 * Close-range Moon.
 *
 * The Moon is the one body a viewer can get within a few hundred kilometres
 * of and still see nothing but rock, so it gets what a rock needs: LRO's
 * colour mosaic, a normal map built from LOLA's laser altimetry at its
 * published half-metre encoding, real displaced relief on the limb, and the
 * photometric function that makes a full Moon look like a flat disc rather
 * than a shaded ball.
 *
 * Its position, phase and tidal lock all keep coming from the simulation -
 * this file only changes how the surface is drawn, never where it is.
 */
import * as THREE from 'three';
import { TextureLadder, colourMap, dataMap } from './texladder';
import { renderBudget } from './budget';

/** LOLA reference sphere (km) - the radius every LDEM height is relative to. */
const MOON_RADIUS_KM = 1737.4;
/**
 * Encoding of public/textures/moon/height_2k.webp, printed by
 * scripts/buildearthmoon.mjs when it quantises LDEM 64 px/deg to 8 bits.
 * DN 0..255 spans LDEM 2250..41332, which is half-metres offset by +20000,
 * i.e. -8875 m to +10666 m about the reference sphere.
 */
const HEIGHT_DN_MIN = 2250;
const HEIGHT_DN_MAX = 41332;
const KM_PER_DN = 1 / 2000; // half-metres → km
const HEIGHT_OFFSET_KM = -10; // the +20000 half-metre offset, in km

const DISPLACEMENT_SCALE =
  ((HEIGHT_DN_MAX - HEIGHT_DN_MIN) * KM_PER_DN) / MOON_RADIUS_KM;
const DISPLACEMENT_BIAS =
  (HEIGHT_DN_MIN * KM_PER_DN + HEIGHT_OFFSET_KM) / MOON_RADIUS_KM;

/**
 * Lunar photometry.
 *
 * Regolith is strongly backscattering, which is why the full Moon reads as a
 * flat bright disc instead of a sphere shaded off toward the limb - the thing
 * every Lambertian render of the Moon gets wrong. Lommel-Seeliger divides the
 * incidence term by (mu0 + mu), flattening exactly that falloff, and the
 * opposition surge adds the extra brightening seen when the Sun is directly
 * behind the observer. Both fade out with distance so the overview view of
 * the solar system is left alone.
 */
const MOON_PARS = /* glsl */ `
  varying vec3 vMoonNormal;
  varying vec3 vMoonWorld;
  uniform vec3 uSunDir;
  uniform float uPhotometric;
  uniform vec3 uEarthshine;
`;

const MOON_LIGHT_BODY = /* glsl */ `
  {
    vec3 n = normalize(vMoonNormal);
    vec3 toCam = normalize(cameraPosition - vMoonWorld);
    float mu0 = max(dot(n, uSunDir), 0.0);
    float mu = max(dot(n, toCam), 0.0);
    // ratio of Lommel-Seeliger to the Lambert term three already applied,
    // normalised to 1 at normal incidence and emission
    float ls = clamp(2.0 / max(mu0 + mu, 0.08), 0.55, 2.4);
    float phase = acos(clamp(dot(uSunDir, toCam), -1.0, 1.0));
    float surge = 1.0 + 0.45 * exp(-phase / 0.14);
    outgoingLight *= mix(1.0, ls * surge, uPhotometric);

    // The scene's fill light keeps distant bodies from reading as black
    // cutouts, but the Moon has no air to scatter it: up close its unlit side
    // should go almost out, leaving only the faint blue-grey of earthshine.
    float night = smoothstep(0.06, -0.08, dot(n, uSunDir));
    outgoingLight *= mix(1.0, mix(1.0, 0.035, night), uPhotometric);
    outgoingLight += uEarthshine * night * uPhotometric * diffuseColor.rgb;
  }
`;

/** Distance in radii → rung, one step tighter than the planets: the Moon is
 *  small enough that a viewer gets proportionally much closer to it. */
function rungFor(radii: number): number {
  if (radii > 120) return 0;
  if (radii > 30) return 1;
  if (radii > 8) return 2;
  return 3;
}

export class MoonDetail {
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly colour: TextureLadder;
  private readonly normal: TextureLadder;
  private readonly height: TextureLadder;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly baseGeometry: THREE.BufferGeometry;

  private fineGeometry?: THREE.SphereGeometry;
  private displaceGeometry?: THREE.SphereGeometry;
  private geometryTier = 0;
  private displaced = false;

  constructor(
    private readonly mesh: THREE.Mesh,
    base: string,
  ) {
    const dir = `${base}textures/moon/`;
    this.baseGeometry = mesh.geometry;
    this.mat = mesh.material as THREE.MeshStandardMaterial;
    this.mat.roughness = 1;
    this.mat.metalness = 0;
    this.mat.color.set(0xffffff);

    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uPhotometric: { value: 0 },
      // sunlight reflected off Earth, back onto the lunar night side - the
      // "old Moon in the new Moon's arms"
      uEarthshine: { value: new THREE.Color(0x1a2740) },
    };
    const uniforms = this.uniforms;
    this.mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `
        varying vec3 vMoonNormal;
        varying vec3 vMoonWorld;
        ${shader.vertexShader}
      `.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vMoonNormal = normalize(mat3(modelMatrix) * normal);
         vMoonWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
      shader.fragmentShader = `${MOON_PARS}\n${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        `${MOON_LIGHT_BODY}\n#include <opaque_fragment>`,
      );
    };
    this.mat.customProgramCacheKey = () => 'orrery-moon-surface';
    this.mat.needsUpdate = true;

    this.colour = new TextureLadder(
      (l) => `${dir}color_${l}.webp`,
      ['1k', '2k', '4k', '8k'],
      colourMap,
    );
    this.normal = new TextureLadder(
      (l) => `${dir}normal_${l}.webp`,
      ['2k', '2k', '4k', '8k'],
      dataMap,
    );
    this.height = new TextureLadder((l) => `${dir}height_${l}.webp`, ['2k'], dataMap);
  }

  /** `radii` is the camera's distance from the Moon's centre, in Moon radii. */
  setDistance(radii: number): void {
    const budget = renderBudget();
    const rung = Math.min(rungFor(radii), budget.maxTextureRung);
    this.uniforms.uPhotometric.value = THREE.MathUtils.clamp((70 - radii) / 45, 0, 1);

    const col = this.colour.want(rung, (t) => this.applyColour(t));
    if (col) this.applyColour(col);

    if (rung >= 1) {
      const nrm = this.normal.want(rung, (t) => this.applyNormal(t));
      if (nrm) this.applyNormal(nrm);
    }
    if (this.mat.normalMap) {
      // full strength up close, off in the distance where it is sub-pixel
      const s = THREE.MathUtils.clamp((60 - radii) / 45, 0, 1);
      this.mat.normalScale.set(s, s);
    }

    // 512x256 of displaced sphere is 131k vertices; a low-tier phone should
    // not be asked to transform that every frame for a 20 km bump
    const maxTier = budget.maxTextureRung >= 3 ? 2 : budget.maxTextureRung >= 2 ? 1 : 0;
    this.setGeometryTier(Math.min(radii <= 9 ? 2 : radii <= 40 ? 1 : 0, maxTier));

    // real relief on the limb, but only where the silhouette is big enough
    // for a 20 km bump to be worth 130k vertices
    if (radii <= 9 && maxTier >= 2) {
      const h = this.height.want(0, (t) => this.applyHeight(t));
      if (h) this.applyHeight(h);
    } else if (this.displaced) {
      this.displaced = false;
      this.mat.displacementMap = null;
      this.mat.needsUpdate = true;
    }
  }

  /**
   * Swap in a denser sphere as the Moon grows. The shared 48x24 geometry every
   * other satellite uses shows a visibly polygonal limb once the Moon fills a
   * window, and the displacement pass needs vertices to displace.
   */
  private setGeometryTier(tier: number): void {
    if (this.geometryTier === tier) return;
    this.geometryTier = tier;
    if (tier === 0) {
      this.mesh.geometry = this.baseGeometry;
      return;
    }
    if (tier === 1) {
      this.fineGeometry ??= new THREE.SphereGeometry(1, 192, 96);
      this.mesh.geometry = this.fineGeometry;
      return;
    }
    this.displaceGeometry ??= new THREE.SphereGeometry(1, 512, 256);
    this.mesh.geometry = this.displaceGeometry;
  }

  private applyColour(tex: THREE.Texture): void {
    if (this.mat.map === tex) return;
    this.mat.map?.dispose();
    this.mat.map = tex;
    this.mat.color.set(0xffffff);
    this.mat.needsUpdate = true;
  }

  private applyNormal(tex: THREE.Texture): void {
    if (this.mat.normalMap === tex) return;
    this.mat.normalMap = tex;
    this.mat.needsUpdate = true;
  }

  private applyHeight(tex: THREE.Texture): void {
    if (this.displaced && this.mat.displacementMap === tex) return;
    this.displaced = true;
    this.mat.displacementMap = tex;
    this.mat.displacementScale = DISPLACEMENT_SCALE;
    this.mat.displacementBias = DISPLACEMENT_BIAS;
    this.mat.needsUpdate = true;
  }

  /** `sunDir` is the unit vector from the Moon toward the Sun, world space. */
  update(sunDir: THREE.Vector3): void {
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
  }

  /** Which rungs are live, for the LOD test. */
  get detailState(): Record<string, number> {
    return {
      colour: this.colour.state.live,
      normal: this.normal.state.live,
      geometry: this.geometryTier,
    };
  }

  dispose(): void {
    this.colour.dispose();
    this.normal.dispose();
    this.height.dispose();
    this.fineGeometry?.dispose();
    this.displaceGeometry?.dispose();
  }
}
