/**
 * Close-range Earth.
 *
 * Seen from a spacecraft, Earth is not one textured sphere - it is a stack:
 * a lit ground surface with real topographic relief, a cloud deck turning on
 * its own period above it and casting shadows down onto the ground, and an
 * atmosphere that scatters sunlight into a blue limb and a red terminator.
 * Each layer is its own pass here, and each map streams in only when the
 * viewer is close enough to resolve it.
 *
 * Every map is derived from a published NASA product by
 * scripts/buildearthmoon.mjs - Blue Marble Next Generation for the ground,
 * Black Marble for the city lights, MODIS for the clouds, SRTM30/GEBCO for
 * the relief. Nothing here is painted by hand or upscaled from a small image.
 */
import * as THREE from 'three';
import { TextureLadder, colourMap, dataMap, blankTexture } from './texladder';

/** Volumetric mean radius, NASA Earth fact sheet. */
const EARTH_RADIUS_KM = 6371;
/** Rayleigh scale height (km). */
const SCALE_HEIGHT_KM = 8.5;
/** Atmosphere shell, in planet radii: 160 km, above the visible airglow. */
const ATMO_SHELL = 1 + 160 / EARTH_RADIUS_KM;
/** Cloud deck, in planet radii: about 22 km, high cirrus. */
const CLOUD_SHELL = 1 + 22 / EARTH_RADIUS_KM;

const _m4 = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();

// ---------------------------------------------------------------------------
// ground
// ---------------------------------------------------------------------------

const GROUND_PARS = /* glsl */ `
  varying vec2 vEarthUv;
  varying vec3 vEarthNormal;
  uniform vec3 uSunDir;
  uniform sampler2D uNightMap;
  uniform float uNightOn;
  uniform sampler2D uCloudMap;
  uniform float uCloudOn;
  uniform float uCloudUvOffset;
  uniform float uCloseness;
  uniform vec3 uTerminator;
  uniform vec3 uTauVertical;

  vec2 earthCloudUv() {
    return vec2(fract(vEarthUv.x + uCloudUvOffset), vEarthUv.y);
  }
`;

/**
 * Cloud shadow.
 *
 * The deck is only ~22 km above a 6371 km ball, so a shadow lands essentially
 * underneath the cloud that casts it and the same UV can be reused. It fades
 * through the terminator, where the Sun is too low to throw anything onto
 * ground the viewer can still see.
 */
const GROUND_MAP_BODY = /* glsl */ `
  {
    float sunCos = dot(normalize(vEarthNormal), uSunDir);
    float shade = texture2D(uCloudMap, earthCloudUv()).r * uCloudOn;
    diffuseColor.rgb *= 1.0 - 0.5 * shade * smoothstep(-0.02, 0.30, sunCos);
  }
`;

/**
 * Night side.
 *
 * The scene's fill light exists so distant planets read as spheres rather
 * than black cutouts; from a few hundred kilometres up it would drown the
 * cities. So the night hemisphere is dimmed back down as the viewer closes in
 * and the Black Marble lights are added into that darkness. Cloud cover
 * blocks them, which is why the glow breaks up over weather.
 */
const GROUND_LIGHT_BODY = /* glsl */ `
  {
    vec3 n = normalize(vEarthNormal);
    float sunCos = dot(n, uSunDir);

    // Sunset, done the way a sunset actually happens. Near the terminator the
    // Sun's light reaches the ground through a long slant path, and Rayleigh
    // scattering strips the short wavelengths out of it on the way - so the
    // light that arrives is dimmer AND redder. Adding orange without taking
    // the blue away just tints a white band; removing the blue is what turns
    // the terminator the colour it really is.
    float airmass = 1.0 / max(sunCos, 0.035);
    vec3 sunTint = exp(-uTauVertical * min(airmass - 1.0, 34.0));
    outgoingLight *= mix(vec3(1.0), sunTint, uCloseness);

    float night = smoothstep(0.10, -0.10, sunCos);
    outgoingLight *= mix(1.0, mix(1.0, 0.055, night), uCloseness);

    float cover = texture2D(uCloudMap, earthCloudUv()).r * uCloudOn;
    vec3 lights = texture2D(uNightMap, vEarthUv).rgb * uNightOn;
    // the raw Black Marble product is very dark away from the big
    // conurbations; the extra power curve lifts small towns into view without
    // inventing any that are not in the data
    lights = lights * sqrt(lights);
    outgoingLight += lights * night * uCloseness * 2.8 * (1.0 - 0.85 * cover);

    // and the sky above the sunset scatters some of that reddened light back
    // down onto the ground, which is why the band has width rather than being
    // a single line
    float graze = exp(-abs(sunCos) * 8.0) * smoothstep(-0.06, 0.12, sunCos);
    outgoingLight += uTerminator * graze * 0.10 * uCloseness * (0.35 + 0.65 * diffuseColor.rgb);
  }
`;

// ---------------------------------------------------------------------------
// clouds
// ---------------------------------------------------------------------------

const CLOUD_VERT = /* glsl */ `
  varying vec2 vUvC;
  varying vec3 vNormalC;
  varying vec3 vViewC;
  void main() {
    vUvC = uv;
    vNormalC = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vViewC = normalize(world.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Cloud deck.
 *
 * Cloud tops are close to Lambertian white, so the shading is mostly the Sun's
 * incidence - but two effects matter up close and are worth the extra lines:
 * forward scattering gives edges facing the Sun their silver lining, and the
 * deck stays lit slightly past the terminator, because it catches sunlight
 * that the ground below it has already lost.
 */
const CLOUD_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUvC;
  varying vec3 vNormalC;
  varying vec3 vViewC;
  uniform sampler2D uMap;
  uniform vec3 uSunDir;
  uniform vec3 uAmbient;
  uniform float uOpacity;
  uniform float uCloseness;
  #include <common>
  void main() {
    float c = texture2D(uMap, vUvC).r;
    if (c < 0.004) discard;
    vec3 n = normalize(vNormalC);
    float sunCos = dot(n, uSunDir);

    float lit = smoothstep(-0.14, 0.16, sunCos);
    float forward = pow(clamp(dot(-vViewC, uSunDir), 0.0, 1.0), 6.0);
    vec3 col = vec3(1.0) * (lit * (0.92 + 0.55 * forward) + 0.05) + uAmbient;

    float alpha = clamp(c * 1.25, 0.0, 1.0) * uOpacity;
    // a thin shell seen edge-on covers less, not more
    float rim = clamp(abs(dot(n, vViewC)), 0.0, 1.0);
    alpha *= mix(0.55, 1.0, rim);

    gl_FragColor = vec4(col * (0.35 + 0.65 * lit), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// atmosphere
// ---------------------------------------------------------------------------

const ATMO_VERT = /* glsl */ `
  varying vec3 vShellPos;
  void main() {
    vShellPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Single-scattering atmosphere (Nishita / O'Neil form).
 *
 * The view ray is intersected against the planet and the shell analytically,
 * then marched: at each step the air density is sampled, the optical depth
 * back to the Sun is measured with a short secondary march, and what survives
 * is scattered toward the camera through the Rayleigh phase function. That
 * one integral produces all three things a painted rim cannot - blue on the
 * day limb, red where the ray grazes deep air at the terminator, and a shadow
 * where the planet itself blocks the Sun.
 *
 * Working units are planet radii, so the published per-metre coefficients
 * arrive pre-multiplied by Earth's radius.
 */
const ATMO_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vShellPos;
  uniform vec3 uCamLocal;
  uniform vec3 uSunLocal;
  uniform float uShell;
  uniform float uScaleHeight;
  uniform vec3 uBetaR;
  uniform float uBetaM;
  uniform float uSunI;
  uniform sampler2D uOpticalLut;
  uniform float uShellH;
  #include <common>

  bool hitSphere(vec3 ro, vec3 rd, float r, out float t0, out float t1) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float d = b * b - c;
    if (d < 0.0) return false;
    d = sqrt(d);
    t0 = -b - d;
    t1 = -b + d;
    return true;
  }

  /**
   * Optical depth from a point out to space along the sunward direction,
   * Rayleigh in .r and Mie in .g. Precomputed on the CPU over (altitude, sun
   * elevation) - it is a function of those two numbers alone, so marching it
   * per fragment was doing the same integral millions of times a frame. Rays
   * that would pass through the planet are stored saturated, which is what
   * puts the planet's own shadow on the atmosphere.
   */
  vec2 sunOpticalDepth(vec3 p) {
    float h = clamp((length(p) - 1.0) / uShellH, 0.0, 1.0);
    float mu = dot(p / length(p), uSunLocal) * 0.5 + 0.5;
    return texture2D(uOpticalLut, vec2(h, mu)).rg;
  }

  const int MAX_STEPS = 8;

  void main() {
    vec3 ro = uCamLocal;
    vec3 rd = normalize(vShellPos - uCamLocal);
    float mieH = uScaleHeight * 0.14;

    float a0, a1;
    if (!hitSphere(ro, rd, uShell, a0, a1)) discard;
    a0 = max(a0, 0.0);
    float p0, p1;
    if (hitSphere(ro, rd, 1.0, p0, p1) && p0 > 0.0) a1 = min(a1, p0);
    if (a1 <= a0) discard;

    // a ray straight down through the shell needs far fewer samples than one
    // grazing the limb through ten times as much air
    float span = a1 - a0;
    int steps = int(clamp(floor(span / uShellH * 2.2) + 1.0, 3.0, float(MAX_STEPS)));
    float seg = span / float(steps);
    float odR = 0.0;
    float odM = 0.0;
    vec3 sumR = vec3(0.0);
    float sumM = 0.0;

    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= steps) break;
      vec3 p = ro + rd * (a0 + (float(i) + 0.5) * seg);
      float alt = length(p) - 1.0;
      float dr = exp(-alt / uScaleHeight) * seg;
      float dm = exp(-alt / mieH) * seg;
      odR += dr;
      odM += dm;

      vec2 sun = sunOpticalDepth(p);
      vec3 att = exp(-(uBetaR * (odR + sun.r) + vec3(uBetaM * 1.1 * (odM + sun.g))));
      sumR += dr * att;
      sumM += dm * att.g;
    }

    float mu = dot(rd, uSunLocal);
    float phaseR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
    // Henyey-Greenstein, g = 0.76: the forward scattering that makes a sunlit
    // limb bright rather than merely blue
    const float g = 0.76;
    float denom = 1.0 + g * g - 2.0 * g * mu;
    float phaseM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu))
                 / ((2.0 + g * g) * pow(max(denom, 1e-4), 1.5));

    vec3 col = uSunI * (sumR * uBetaR * phaseR + sumM * uBetaM * phaseM);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Precompute the sunward optical depth over (altitude, sun elevation).
 *
 * Optical depth toward the Sun depends on nothing but where you are in the
 * shell and how high the Sun is from there, so it is a two-dimensional
 * function that can be integrated once instead of per fragment per frame -
 * the single biggest cost in the scattering shader before this existed.
 *
 * Rays that would pass through the planet are stored saturated rather than
 * skipped, so the planet's shadow on its own atmosphere falls out of the same
 * lookup instead of needing a separate test.
 */
function buildOpticalDepthLut(shellH: number, rayleighH: number, mieH: number): THREE.DataTexture {
  const W = 64; // altitude
  const H = 256; // sun elevation - the terminator lives here, so it gets the resolution
  const MARCH = 40;
  const data = new Uint16Array(W * H * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const shellR = 1 + shellH;

  for (let j = 0; j < H; j++) {
    const mu = ((j + 0.5) / H) * 2 - 1; // cos(angle between local up and the Sun)
    const sinT = Math.sqrt(Math.max(0, 1 - mu * mu));
    for (let i = 0; i < W; i++) {
      const alt = ((i + 0.5) / W) * shellH;
      const r0 = 1 + alt;
      // start on the local vertical, aim at the Sun
      const ox = 0;
      const oy = r0;
      const dx = sinT;
      const dy = mu;

      // does this ray dive into the planet before it escapes?
      const b = ox * dx + oy * dy;
      const cPlanet = r0 * r0 - 1;
      const discPlanet = b * b - cPlanet;
      const blocked = discPlanet > 0 && -b - Math.sqrt(discPlanet) > 0;

      let odR = 1;
      let odM = 1;
      if (!blocked) {
        // distance to the top of the shell
        const cShell = r0 * r0 - shellR * shellR;
        const exit = -b + Math.sqrt(Math.max(b * b - cShell, 0));
        const seg = exit / MARCH;
        odR = 0;
        odM = 0;
        for (let k = 0; k < MARCH; k++) {
          const t = (k + 0.5) * seg;
          const h = Math.hypot(ox + dx * t, oy + dy * t) - 1;
          odR += Math.exp(-h / rayleighH) * seg;
          odM += Math.exp(-h / mieH) * seg;
        }
      }
      const o = (j * W + i) * 4;
      data[o] = toHalf(Math.min(odR, 1));
      data[o + 1] = toHalf(Math.min(odM, 1));
      data[o + 2] = 0;
      data[o + 3] = toHalf(1);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------

/**
 * Distance in planet radii → detail rung.
 *
 * The thresholds are in radii rather than scene units on purpose: what decides
 * how much detail is worth streaming is how large the body actually appears,
 * which is the same question in explorer view and at true scale.
 */
export function rungForDistance(radii: number): number {
  if (radii > 90) return 0; // a disc, or less
  if (radii > 26) return 1; // recognisable continents
  if (radii > 7) return 2; // regional detail
  return 3; // filling the window
}

export class EarthDetail {
  readonly cloudMesh: THREE.Mesh;
  readonly atmoMesh: THREE.Mesh;

  private readonly groundMat: THREE.MeshStandardMaterial;
  private readonly cloudMat: THREE.ShaderMaterial;
  private readonly atmoMat: THREE.ShaderMaterial;
  private readonly uniforms: Record<string, THREE.IUniform>;

  private readonly day: TextureLadder;
  private readonly night: TextureLadder;
  private readonly cloud: TextureLadder;
  private readonly normal: TextureLadder;
  private readonly orm: TextureLadder;

  private readonly blank = blankTexture();
  private readonly camLocal = new THREE.Vector3();
  private ormApplied = false;

  constructor(surface: THREE.Mesh, base: string) {
    const dir = `${base}textures/earth/`;

    this.uniforms = {
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uNightMap: { value: this.blank },
      uNightOn: { value: 0 },
      uCloudMap: { value: this.blank },
      uCloudOn: { value: 0 },
      uCloudUvOffset: { value: 0 },
      uCloseness: { value: 0 },
      uTerminator: { value: new THREE.Color(0xff9d5c) },
      // vertical Rayleigh optical depth at sea level, R/G/B - the same
      // physics as uBetaR below, integrated over the column
      uTauVertical: { value: new THREE.Vector3(0.052, 0.115, 0.243) },
    };

    // Ground. Keeping three's own lit material means the Sun's real direction
    // and the scene's exposure still drive everything; the night side, the
    // city lights and the cloud shadow are woven into that rather than
    // replacing it.
    this.groundMat = surface.material as THREE.MeshStandardMaterial;
    this.groundMat.roughness = 1;
    this.groundMat.metalness = 0;
    const uniforms = this.uniforms;
    this.groundMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `
        varying vec2 vEarthUv;
        varying vec3 vEarthNormal;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vEarthUv = uv;
         vEarthNormal = normalize(mat3(modelMatrix) * normal);`,
      );
      shader.fragmentShader = `${GROUND_PARS}\n${shader.fragmentShader}`
        .replace('#include <map_fragment>', `#include <map_fragment>\n${GROUND_MAP_BODY}`)
        .replace('#include <opaque_fragment>', `${GROUND_LIGHT_BODY}\n#include <opaque_fragment>`);
    };
    this.groundMat.customProgramCacheKey = () => 'orrery-earth-ground';
    this.groundMat.needsUpdate = true;

    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: {
        uMap: { value: this.blank },
        uSunDir: this.uniforms.uSunDir,
        uAmbient: { value: new THREE.Color(0x22303f) },
        uOpacity: { value: 0 },
        uCloseness: this.uniforms.uCloseness,
      },
      transparent: true,
      depthWrite: false,
    });
    this.cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), this.cloudMat);
    this.cloudMesh.scale.setScalar(CLOUD_SHELL);
    this.cloudMesh.renderOrder = 2;
    this.cloudMesh.visible = false;

    this.atmoMat = new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: {
        uCamLocal: { value: new THREE.Vector3() },
        uSunLocal: { value: new THREE.Vector3(1, 0, 0) },
        uShell: { value: ATMO_SHELL },
        uScaleHeight: { value: SCALE_HEIGHT_KM / EARTH_RADIUS_KM },
        // Rayleigh coefficients (Bruneton 2008), m^-1 → per planet radius
        uBetaR: {
          value: new THREE.Vector3(5.802e-6, 13.558e-6, 33.1e-6).multiplyScalar(
            EARTH_RADIUS_KM * 1000,
          ),
        },
        uBetaM: { value: 21e-6 * EARTH_RADIUS_KM * 1000 },
        uSunI: { value: 19 },
        uShellH: { value: ATMO_SHELL - 1 },
        uOpticalLut: {
          value: buildOpticalDepthLut(
            ATMO_SHELL - 1,
            SCALE_HEIGHT_KM / EARTH_RADIUS_KM,
            (SCALE_HEIGHT_KM / EARTH_RADIUS_KM) * 0.14,
          ),
        },
      },
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.atmoMesh = new THREE.Mesh(new THREE.SphereGeometry(ATMO_SHELL, 96, 48), this.atmoMat);
    this.atmoMesh.renderOrder = 3;
    this.atmoMesh.visible = false;

    this.day = new TextureLadder(
      (l) => `${dir}day_${l}.webp`,
      ['1k', '2k', '4k', '8k'],
      colourMap,
    );
    this.night = new TextureLadder(
      (l) => `${dir}night_${l}.webp`,
      ['1k', '1k', '2k', '2k'],
      colourMap,
    );
    this.cloud = new TextureLadder(
      (l) => `${dir}clouds_${l}.webp`,
      ['1k', '2k', '2k', '4k'],
      dataMap,
    );
    this.normal = new TextureLadder(
      (l) => `${dir}normal_${l}.webp`,
      ['2k', '2k', '2k', '4k'],
      dataMap,
    );
    this.orm = new TextureLadder((l) => `${dir}orm_${l}.webp`, ['2k'], dataMap);
  }

  /**
   * Pull in the maps this distance justifies. `radii` is the camera's distance
   * from the centre in planet radii, so the decision is about apparent size
   * and not about which scale mode the app happens to be in.
   */
  setDistance(radii: number): void {
    const rung = rungForDistance(radii);
    // full close-range treatment inside ~14 radii, none beyond ~40
    const closeness = THREE.MathUtils.clamp((40 - radii) / 26, 0, 1);
    this.uniforms.uCloseness.value = closeness;

    const day = this.day.want(rung, (t) => this.applyDay(t));
    if (day) this.applyDay(day);

    if (rung >= 1) {
      const night = this.night.want(rung, (t) => this.applyNight(t));
      if (night) this.applyNight(night);
      const cloud = this.cloud.want(rung, (t) => this.applyCloud(t));
      if (cloud) this.applyCloud(cloud);
    }
    if (rung >= 2) {
      const nrm = this.normal.want(rung, (t) => this.applyNormal(t));
      if (nrm) this.applyNormal(nrm);
      const orm = this.orm.want(0, (t) => this.applyOrm(t));
      if (orm) this.applyOrm(orm);
    }

    // relief is a close-range effect: at a distance the shading it adds is
    // sub-pixel noise that only makes the terminator crawl
    if (this.groundMat.normalMap) {
      const s = THREE.MathUtils.clamp((30 - radii) / 22, 0, 1) * 0.85;
      this.groundMat.normalScale.set(s, s);
    }
    this.cloudMesh.visible = radii < 300 && this.cloudMat.uniforms.uOpacity.value > 0;
    this.atmoMesh.visible = radii < 300;
  }

  private applyDay(tex: THREE.Texture): void {
    if (this.groundMat.map === tex) return;
    this.groundMat.map = tex;
    this.groundMat.needsUpdate = true;
  }

  private applyNight(tex: THREE.Texture): void {
    if (this.uniforms.uNightMap.value === tex) return;
    this.uniforms.uNightMap.value = tex;
    this.uniforms.uNightOn.value = 1;
  }

  private applyCloud(tex: THREE.Texture): void {
    if (this.cloudMat.uniforms.uMap.value === tex) return;
    this.cloudMat.uniforms.uMap.value = tex;
    this.cloudMat.uniforms.uOpacity.value = 1;
    this.uniforms.uCloudMap.value = tex;
    this.uniforms.uCloudOn.value = 1;
  }

  private applyNormal(tex: THREE.Texture): void {
    if (this.groundMat.normalMap === tex) return;
    this.groundMat.normalMap = tex;
    this.groundMat.needsUpdate = true;
  }

  /** Ocean/land split: smooth water carries the Sun's glint, matte land does
   *  not. MeshStandardMaterial reads roughness from the map's green channel. */
  private applyOrm(tex: THREE.Texture): void {
    if (this.ormApplied) return;
    this.ormApplied = true;
    this.groundMat.roughnessMap = tex;
    this.groundMat.roughness = 1;
    this.groundMat.needsUpdate = true;
  }

  /**
   * Per-frame: aim every layer at the Sun and turn the cloud deck.
   * `sunDir` is the unit vector from the planet toward the Sun, world space.
   */
  update(
    sunDir: THREE.Vector3,
    cameraPos: THREE.Vector3,
    surfaceSpin: number,
    cloudSpin: number,
  ): void {
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
    this.cloudMesh.rotation.y = cloudSpin;
    // sample the cloud map at the world point each ground fragment sits under
    this.uniforms.uCloudUvOffset.value = ((surfaceSpin - cloudSpin) / (Math.PI * 2)) % 1;

    if (!this.atmoMesh.visible) return;
    // the scattering march runs in the shell's own space, where the planet is
    // the unit sphere - so the camera and the Sun come along for the ride
    this.atmoMesh.updateWorldMatrix(true, false);
    _m4.copy(this.atmoMesh.matrixWorld).invert();
    this.camLocal.copy(cameraPos).applyMatrix4(_m4);
    (this.atmoMat.uniforms.uCamLocal.value as THREE.Vector3).copy(this.camLocal);
    (this.atmoMat.uniforms.uSunLocal.value as THREE.Vector3)
      .copy(sunDir)
      .applyMatrix3(_m3.setFromMatrix4(_m4))
      .normalize();
    // once the camera is under the shell, only its inside faces are in front
    this.atmoMat.side = this.camLocal.length() < ATMO_SHELL ? THREE.BackSide : THREE.FrontSide;
  }

  dispose(): void {
    this.day.dispose();
    this.night.dispose();
    this.cloud.dispose();
    this.normal.dispose();
    this.orm.dispose();
    this.blank.dispose();
  }
}
