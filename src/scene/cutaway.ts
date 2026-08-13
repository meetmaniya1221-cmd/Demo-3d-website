/**
 * Interactive 3D cross-section: a lit, textured sphere with a quarter sawn out
 * of it.
 *
 * Every layer of a body's published interior model is a real spherical shell.
 * The section is cut in the fragment shader - each shell discards the azimuth
 * wedge that has been removed - so the cut can open and close smoothly at full
 * geometric resolution without ever rebuilding a mesh, and the silhouette stays
 * round however far you zoom in. Two flat annuli per layer cap the cut, giving
 * every shell its true visible thickness, and the exposed interior is shaded as
 * a cavity: key light, fill, specular, fresnel and a depth-based occlusion term
 * that darkens the notch toward the axis. Nothing here is a billboard or a
 * painted diagram.
 *
 * The model itself never rotates - the camera orbits it. That keeps the cut
 * plane fixed in world space (so the wedge test is a constant) and, more
 * importantly, keeps the lighting anchored to the world, so turning the model
 * sweeps highlights across the shells the way it would on a real object.
 *
 * Layer radii, colours, notes and knowledge tags all come from the same
 * INTERIORS catalog the 2D structure view uses, so the two can never drift
 * apart. Each layer also declares what it is physically made of, and that
 * picks the shading: fusing plasma, radiative plasma, convecting plasma and a
 * granulated photosphere for a star; molten and solid metal, silicate rock,
 * water ice, liquid ocean, metallic and molecular hydrogen, ice-giant fluid,
 * regolith and volatile frost for everything else. A rocky mantle is lit like
 * rock and never glows like a star.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { CatalogObject, InteriorLayer, LayerMaterial } from '../data/types';

/** Azimuth span of the removed wedge, in radians, at full open: a clean quarter. */
export const MAX_CUT = Math.PI * 0.5;
const SPHERE_R = 1;
const TAU = Math.PI * 2;

/** Shader branch per material. Order must match MAT_* in the fragment shader. */
const MATERIAL_INDEX: Record<LayerMaterial, number> = {
  'fusion-core': 0,
  'radiative-plasma': 1,
  'convective-plasma': 2,
  photosphere: 3,
  'molten-metal': 4,
  'solid-metal': 5,
  'silicate-rock': 6,
  'water-ice': 7,
  'liquid-ocean': 8,
  'metallic-hydrogen': 9,
  'molecular-hydrogen': 10,
  'ice-giant-fluid': 11,
  'regolith-crust': 12,
  'volatile-ice': 13,
};

const PLASMA: LayerMaterial[] = [
  'fusion-core',
  'radiative-plasma',
  'convective-plasma',
  'photosphere',
];

/**
 * What a layer is made of, for shading. Data declares it; this is the fallback
 * for any layer that has not been given one, read off the layer's own name so a
 * newly added body still gets a physically sensible material instead of a
 * default grey.
 */
export function layerMaterial(layer: InteriorLayer, isStar: boolean, index: number): LayerMaterial {
  if (layer.material) return layer.material;
  if (isStar) return PLASMA[Math.min(index, 3)];
  const n = layer.name.toLowerCase();
  // hydrogen and the ice-giant fluids first: they are named unambiguously
  if (n.includes('metallic hydrogen')) return 'metallic-hydrogen';
  if (n.includes('molecular hydrogen') || n.includes('hydrogen') || n.includes('atmosphere'))
    return 'molecular-hydrogen';
  if (n.includes('icy mantle')) return 'ice-giant-fluid';
  if (n.includes('ocean')) return 'liquid-ocean';
  if (n.includes('volatile')) return 'volatile-ice';
  if (n.includes('ice')) return 'water-ice';
  // then metals, keyed on STATE before substance - a bare "Iron core" is more
  // often the molten one, and only "solid"/"inner" makes it a solid metal
  if (n.includes('core') || n.includes('metal')) {
    if (n.includes('rock') || n.includes('dilute') || n.includes('porous')) return 'silicate-rock';
    if (n.includes('solid') || n.includes('inner')) return 'solid-metal';
    if (n.includes('molten') || n.includes('liquid') || n.includes('fluid') || n.includes('outer'))
      return 'molten-metal';
    if (n.includes('iron') || n.includes('metallic')) return 'molten-metal';
    return 'silicate-rock';
  }
  if (n.includes('crust') && !n.includes('basalt')) return 'regolith-crust';
  return 'silicate-rock';
}

/* --------------------------------------------------------------- shaders -- */

// Compact 3D simplex noise (Ashima Arts / Ian McEwan, MIT) - the same one the
// main Sun shader uses, so the plasma reads as the same material.
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
  float fbm(vec3 p) {
    return snoise(p) * 0.55 + snoise(p * 2.03) * 0.27 + snoise(p * 4.11) * 0.13
         + snoise(p * 8.17) * 0.05;
  }
  // Ridged noise: zero crossings become bright filaments. Cheap stand-in for
  // the cellular pattern of granulation and of convective column walls.
  float ridges(vec3 p, float w) {
    return 1.0 - smoothstep(0.0, w, abs(snoise(p)));
  }
`;

const LAYER_VERT = /* glsl */ `
  varying vec3 vNrm;
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vNrm = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/**
 * One material for every layer of every body.
 *
 * uMat selects the physics being drawn; uIsCap switches between the curved
 * shell surface and the flat section face, which want completely different
 * patterns (a cut face shows what the layer looks like *sliced*: convective
 * columns become radial fibres, the radiative zone becomes fine concentric
 * banding, rock becomes strata).
 */
const LAYER_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNrm;
  varying vec3 vWorld;
  varying vec2 vUv;

  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uMat;
  uniform float uIsCap;
  uniform float uInner;
  uniform float uOuter;
  uniform float uCutA;
  uniform float uCutB;
  uniform float uHighlight;
  uniform float uDim;
  uniform float uSeed;
  uniform vec3 uFaceNormal;
  uniform sampler2D uMap;
  uniform float uHasMap;
  ${NOISE_GLSL}

  const vec3 KEY  = vec3(0.5241, 0.6551, 0.5442);   // normalized(0.72,0.90,0.7475)
  const vec3 FILL = vec3(-0.7845, 0.1372, -0.6046); // normalized(-1.0,0.175,-0.771)

  void main() {
    // The group sits at the origin unrotated, so world space *is* model space -
    // and reading the pattern from it means a cap samples at the place it has
    // been swung to, not in the flat plane its geometry was authored in.
    vec3 P = vWorld;
    float r = length(P);

    // ---- the cut. Shells drop the removed azimuth wedge; the caps *are* the
    // cut, so they are never discarded.
    float phi = atan(P.z, P.x);
    if (phi < 0.0) phi += 6.283185307;
    if (uIsCap < 0.5 && phi > uCutA && phi < uCutB) discard;

    // 0 at the layer's inner edge, 1 at its outer edge
    float f = clamp((r - uInner) / max(uOuter - uInner, 1e-4), 0.0, 1.0);
    vec3 dir = P / max(r, 1e-4);
    // polar angle, measured down the section face - the natural "along the cut"
    // coordinate, and what radial structures stripe against
    float th = acos(clamp(P.y / max(r, 1e-4), -1.0, 1.0));
    float t = uTime;
    float sd = uSeed;

    // ---- surface frame. A cap is a plane, so it uses its own true outward
    // normal; a shell uses its geometric normal, flipped when we are looking at
    // its concave underside through the notch.
    vec3 N = uIsCap > 0.5 ? normalize(uFaceNormal) : normalize(vNrm);
    if (uIsCap < 0.5 && !gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 H = normalize(KEY + V);
    float ndl = max(dot(N, KEY), 0.0);
    float ndf = max(dot(N, FILL), 0.0);
    float ndv = max(dot(N, V), 0.0);
    float fres = pow(1.0 - ndv, 4.0);

    vec3 albedo = uColor;
    vec3 emissive = vec3(0.0);
    float gloss = 24.0;
    float specK = 0.05;

    // ================================================== plasma (stars) =====
    // Every plasma layer is built the same way: a dark base carrying the
    // layer's hue, structure painted in a brighter tone, and only the narrow
    // hottest fraction pushed near white. Keeping most of the area dark is what
    // gives a star its depth - a uniformly bright fill reads as a flat disc,
    // and once bloom touches it, as a white blob.
    if (uMat < 0.5) {
      // ---- MAT_FUSION_CORE: the one genuinely white-hot thing in the model,
      // and small enough that its glow stays a glow.
      float n = fbm(dir * 6.0 + vec3(0.0, t * 0.22, sd)) * 0.5 + 0.5;
      float grain = ridges(dir * 26.0 + vec3(t * 0.15, 0.0, sd), 0.5);
      float centre = 1.0 - smoothstep(0.0, 1.25, f);
      vec3 hot = mix(uColor, vec3(1.0, 0.98, 0.93), 0.35 + 0.62 * centre);
      emissive = hot * (1.15 + 1.85 * centre) * (0.82 + 0.20 * n + 0.13 * grain);
      emissive *= 0.97 + 0.04 * sin(t * 1.6 + sd);
      albedo = vec3(0.0);
    } else if (uMat < 1.5) {
      // ---- MAT_RADIATIVE_PLASMA: energy diffusing outward over millennia.
      // Sliced open it is fine concentric banding creeping toward the surface;
      // on the shell it is a slow mottled churn.
      float n = fbm(dir * 5.0 + vec3(t * 0.04, t * 0.03, sd)) * 0.5 + 0.5;
      float band = uIsCap > 0.5
        ? 0.5 + 0.5 * sin(r * 210.0 - t * 1.1 + n * 5.0)
        : 0.5 + 0.5 * sin(th * 60.0 + n * 4.0 - t * 0.3);
      float mottle = ridges(dir * 13.0 + vec3(0.0, t * 0.07, sd), 0.55);
      vec3 cool = mix(uColor, vec3(0.24, 0.055, 0.008), 0.80);
      vec3 warm = mix(uColor, vec3(1.0, 0.72, 0.30), 0.30);
      emissive = mix(cool, warm, clamp(band * 0.72 + mottle * 0.24, 0.0, 1.0));
      emissive *= 0.72 + 0.55 * n;
      // brighter toward the fusing core it is carrying heat away from
      emissive *= 1.20 - 0.44 * f;
      albedo = vec3(0.0);
    } else if (uMat < 2.5) {
      // ---- MAT_CONVECTIVE_PLASMA: plasma boiling in columns. The cut face
      // shows those columns end-on as radial fibres; the shell shows the tops
      // of the cells.
      float warp = fbm(dir * 3.4 + vec3(0.0, t * 0.1, sd));
      float warp2 = fbm(dir * 8.5 + sd);
      // columns, not corduroy: the spacing wanders and the walls break up
      float fib = 0.5 + 0.5 * sin(th * (74.0 + 46.0 * warp2) + warp * 7.0 + t * 0.55);
      fib *= 0.60 + 0.55 * ridges(dir * 20.0 + vec3(0.0, -t * 0.3, sd), 0.42);
      float cellw = ridges(dir * 17.0 + vec3(0.0, -t * 0.28, sd), 0.34);
      float rise = 0.5 + 0.5 * sin(f * 13.0 - t * 1.5 + warp * 5.0);
      float pat = uIsCap > 0.5 ? clamp(mix(fib, rise, 0.26), 0.0, 1.0) : cellw;
      vec3 cool = mix(uColor, vec3(0.20, 0.032, 0.004), 0.82);
      vec3 warm = mix(uColor, vec3(1.0, 0.62, 0.18), 0.34);
      emissive = mix(cool, warm, pow(pat, 1.35));
      emissive *= 0.68 + 0.34 * (warp * 0.5 + 0.5) + 0.30 * f;
      albedo = vec3(0.0);
    } else if (uMat < 3.5) {
      // ---- MAT_PHOTOSPHERE: granulation. Bright cells with dark intergranular
      // lanes, a supergranular swell under them, sunspot groups, and the real
      // limb darkening that makes a star read as a sphere and not a disc.
      // granulation cells, each ringed by a cool intergranular lane
      float lane = smoothstep(0.0, 0.30, abs(snoise(dir * 36.0 + vec3(t * 0.05, 0.0, sd))));
      float fine = snoise(dir * 62.0 + sd) * 0.5 + 0.5;
      float superg = fbm(dir * 9.0 + vec3(0.0, t * 0.03, sd)) * 0.5 + 0.5;
      float spot = smoothstep(0.60, 0.88, fbm(dir * 2.9 + vec3(sd, 0.0, 0.0)));
      // faculae are a thin bright network, not a wash - keep them narrow or the
      // whole disc goes the colour of sand
      float fac = ridges(dir * 58.0 + vec3(sd, t * 0.04, 0.0), 0.07);
      vec3 cool = mix(uColor, vec3(0.17, 0.022, 0.003), 0.88);
      vec3 warm = mix(uColor, vec3(1.0, 0.36, 0.05), 0.68);
      vec3 col = mix(cool, warm, lane * (0.80 + 0.20 * fine));
      col *= 0.78 + 0.34 * superg;
      col += mix(uColor, vec3(1.0, 0.62, 0.20), 0.45) * fac * 0.30;
      col = mix(col, vec3(0.05, 0.012, 0.004), spot * 0.92);
      if (uHasMap > 0.5 && uIsCap < 0.5) {
        col = mix(col, texture2D(uMap, vUv).rgb * (0.26 + 0.62 * lane), 0.22);
      }
      // sliced open, the photosphere is a thin bright rind
      if (uIsCap > 0.5) col *= 0.90 + 0.75 * f;
      emissive = col * 1.02;
      albedo = vec3(0.0);
    }
    // ================================================== solid worlds =======
    else if (uMat < 4.5) {
      // ---- MAT_MOLTEN_METAL: liquid iron. Dark, dense, threaded with bright
      // convecting veins - the dynamo, visibly in motion.
      float flow = fbm(P * 5.5 + vec3(t * 0.09, -t * 0.06, sd));
      float vein = ridges(P * 9.5 + vec3(0.0, t * 0.14, sd), 0.30);
      float swirl = 0.5 + 0.5 * sin(th * 26.0 + flow * 6.0 - t * 0.7);
      albedo = mix(uColor * 0.34, uColor * 0.8, 0.4 + 0.6 * (flow * 0.5 + 0.5));
      emissive = uHot * (vein * 0.36 + swirl * 0.10) * (uIsCap > 0.5 ? 1.0 : 0.55);
      gloss = 48.0; specK = 0.30;
    } else if (uMat < 5.5) {
      // ---- MAT_SOLID_METAL: crystalline iron-nickel under pressure. Faceted,
      // bright, with a faint heat glow.
      float facet = floor((fbm(dir * 9.0 + sd) * 0.5 + 0.5) * 7.0) / 7.0;
      float shine = ridges(dir * 20.0 + sd, 0.4);
      albedo = mix(uColor * 0.55, uColor, 0.35 + 0.65 * facet);
      emissive = uHot * 0.12 * (0.5 + 0.5 * shine);
      gloss = 90.0; specK = 0.55;
    } else if (uMat < 6.5) {
      // ---- MAT_SILICATE_ROCK: matte, mottled, barely shiny. On a cut face it
      // shows strata - the layering a mantle actually has.
      float mot = fbm(dir * 7.5 + sd) * 0.5 + 0.5;
      float grit = fbm(dir * 34.0 + sd) * 0.5 + 0.5;
      float strata = 0.5 + 0.5 * sin(r * 96.0 + mot * 7.0);
      albedo = mix(uColor * 0.58, uColor * 1.06, mot);
      albedo *= 0.90 + 0.14 * grit;
      if (uIsCap > 0.5) albedo *= 0.90 + 0.16 * strata;
      gloss = 14.0; specK = 0.05;
    } else if (uMat < 7.5) {
      // ---- MAT_WATER_ICE: pale, hard, faintly translucent at the rim, laced
      // with fractures.
      float crack = 1.0 - smoothstep(0.0, 0.055, abs(snoise(dir * 9.5 + sd)));
      float crack2 = 1.0 - smoothstep(0.0, 0.030, abs(snoise(dir * 21.0 + sd * 2.0)));
      float grain = fbm(dir * 26.0 + sd) * 0.5 + 0.5;
      albedo = mix(uColor * 0.86, uColor * 1.10, grain);
      albedo = mix(albedo, vec3(0.83, 0.92, 1.0), crack * 0.45 + crack2 * 0.22);
      albedo += vec3(0.10, 0.16, 0.24) * fres * (uIsCap > 0.5 ? 0.3 : 1.0);
      gloss = 76.0; specK = 0.38;
    } else if (uMat < 8.5) {
      // ---- MAT_LIQUID_OCEAN: deep, smooth, moving. Slow internal currents on
      // the cut face; a mirror-bright surface on the shell.
      float cur = fbm(P * 4.2 + vec3(t * 0.05, t * 0.03, sd));
      float wave = 0.5 + 0.5 * sin(th * 34.0 + cur * 8.0 - t * 0.9);
      albedo = mix(uColor * 0.42, uColor * 1.04, 0.4 + 0.6 * (cur * 0.5 + 0.5));
      albedo = mix(albedo, uHot, wave * 0.16);
      albedo += vec3(0.05, 0.10, 0.18) * fres;
      gloss = 120.0; specK = 0.52;
    } else if (uMat < 9.5) {
      // ---- MAT_METALLIC_HYDROGEN: hydrogen crushed until it conducts. Dark
      // and lustrous, streaked along the flow that runs the magnetic field.
      float streak = 0.5 + 0.5 * sin(th * 52.0 + fbm(P * 3.4 + sd) * 9.0 - t * 0.4);
      float sheen = ridges(P * 11.0 + vec3(0.0, t * 0.05, sd), 0.35);
      albedo = mix(uColor * 0.40, uColor * 0.95, streak);
      albedo += uHot * sheen * 0.14;
      gloss = 64.0; specK = 0.42;
    } else if (uMat < 10.5) {
      // ---- MAT_MOLECULAR_HYDROGEN: a bottomless atmosphere, banded by
      // latitude, with turbulence dragged along the bands.
      float turb = fbm(vec3(P.x * 2.6, dir.y * 9.0, P.z * 2.6) + vec3(t * 0.05, 0.0, sd));
      float bands = 0.5 + 0.5 * sin(dir.y * 26.0 + turb * 3.4);
      float storm = smoothstep(0.55, 0.9, fbm(dir * 5.5 + vec3(sd, t * 0.02, 0.0)));
      albedo = mix(uColor * 0.62, uColor * 1.12, bands);
      albedo = mix(albedo, uHot, storm * 0.30);
      if (uIsCap > 0.5) albedo *= 0.86 + 0.22 * (0.5 + 0.5 * sin(r * 120.0));
      gloss = 20.0; specK = 0.07;
    } else if (uMat < 11.5) {
      // ---- MAT_ICE_GIANT_FLUID: hot dense water-ammonia-methane fluid.
      // Domain-warped swirls, nothing like a solid mantle.
      vec3 w = P * 3.6 + vec3(fbm(P * 2.0 + sd), fbm(P * 2.0 + sd + 4.0), 0.0) * 1.6;
      float swirl = fbm(w + vec3(0.0, t * 0.06, 0.0)) * 0.5 + 0.5;
      float fil = ridges(w * 2.4, 0.45);
      albedo = mix(uColor * 0.46, uColor * 1.10, swirl);
      albedo = mix(albedo, uHot, fil * 0.20);
      albedo += vec3(0.04, 0.09, 0.14) * fres;
      gloss = 46.0; specK = 0.24;
    } else if (uMat < 12.5) {
      // ---- MAT_REGOLITH_CRUST: dust and craters, the dullest thing here.
      float dust = fbm(dir * 30.0 + sd) * 0.5 + 0.5;
      float crater = smoothstep(0.30, 0.0, abs(snoise(dir * 13.0 + sd) - 0.35));
      albedo = mix(uColor * 0.70, uColor * 1.05, dust);
      albedo *= 1.0 - crater * 0.24;
      gloss = 9.0; specK = 0.03;
    } else {
      // ---- MAT_VOLATILE_ICE: nitrogen and methane frost - pale, powdery,
      // slightly sparkling.
      float frost = fbm(dir * 18.0 + sd) * 0.5 + 0.5;
      float sparkle = ridges(dir * 60.0 + sd, 0.10);
      albedo = mix(uColor * 0.80, uColor * 1.12, frost);
      albedo += vec3(0.9) * sparkle * 0.10;
      gloss = 40.0; specK = 0.18;
    }

    // The outermost shell of a solid world wears its real mission mosaic - the
    // exterior of these bodies is photographed, not modelled, and the procedural
    // material is only there to carry the parts no camera has seen.
    if (uHasMap > 0.5 && uIsCap < 0.5 && uMat > 3.5) {
      albedo = mix(albedo, texture2D(uMap, vUv).rgb, 0.82);
    }

    // ---- cavity occlusion. The notch is a hole in a solid body: light that
    // reaches a point on the cut face has had to get past the opposite face and
    // the surrounding shell, and less of it arrives the deeper in you look.
    // This single term is most of what stops the section reading as a flat pie
    // chart - real cut-open objects are dark toward the middle.
    float ao = 1.0;
    if (uIsCap > 0.5) {
      float rn = clamp(r / ${SPHERE_R.toFixed(1)}, 0.0, 1.0);
      ao = 0.30 + 0.70 * smoothstep(0.0, 0.72, rn);
      // a narrow notch is a deeper, darker slot than a wide-open quarter
      ao *= mix(0.62, 1.0, clamp((uCutB - uCutA) / 1.35, 0.0, 1.0));
      // the poles of the face are tucked under the intact shell
      ao *= 0.72 + 0.28 * sin(clamp(th, 0.0, 3.14159));
    } else {
      // the concave underside of a shell, seen across the notch, is shadowed
      ao = gl_FrontFacing ? 1.0 : 0.46;
    }

    // ---- shading
    float spec = pow(max(dot(N, H), 0.0), gloss) * specK;
    vec3 lit = albedo * (0.17 + 0.95 * ndl + 0.34 * ndf) + vec3(spec) + emissive;
    lit *= mix(1.0, ao, uIsCap > 0.5 ? 1.0 : 0.85);

    // limb darkening on the curved shells: real spheres dim toward the edge,
    // and this is the cue that reads as volume before anything moves
    if (uIsCap < 0.5) {
      lit *= 0.42 + 0.62 * pow(ndv, 0.75);
      // Contact shadow. Where a shell runs up against its own cut it is tucked
      // into the crease behind the shell outside it, and almost no light gets
      // in there. This dark seam between neighbouring domes is most of what
      // separates them as solid objects rather than as printed bands.
      if (uCutB > uCutA + 0.01) {
        // wrapped angular distance: phi runs [0, 2pi) and the cut sits near 0,
        // so a raw difference reads ~2pi just below the seam and loses it
        float dA = abs(phi - uCutA); dA = min(dA, 6.283185307 - dA);
        float dB = abs(phi - uCutB); dB = min(dB, 6.283185307 - dB);
        lit *= 0.34 + 0.66 * smoothstep(0.0, 0.34, min(dA, dB));
      }
    }
    // fresnel rim picks the curvature back out at the silhouette
    lit += uHot * fres * (uIsCap > 0.5 ? 0.03 : 0.11);

    // ---- a bright machined edge where the cut face meets the shell above it,
    // and a hairline at the inner boundary: this is what a section drawing
    // gains from being a real cut and not a fill.
    if (uIsCap > 0.5) {
      float edge = smoothstep(0.965, 1.0, f);
      float inner = smoothstep(0.045, 0.0, f);
      lit += (uHot * 0.55 + vec3(0.35)) * edge * 0.55;
      lit += vec3(0.12) * inner;
    }

    lit *= mix(1.0, 1.5, uHighlight);
    lit *= uDim;
    gl_FragColor = vec4(max(lit, vec3(0.0)), 1.0);
  }
`;

/* ---------------------------------------------------- corona & prominences -- */

const CORONA_VERT = /* glsl */ `
  varying vec3 vDir;
  varying vec3 vWorld;
  void main() {
    vDir = normalize(position);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/**
 * The corona is drawn on the inside of a big sphere, so only its far half
 * renders and it never sits in front of the star.
 *
 * Its brightness comes from the ray's impact parameter - how close the line of
 * sight passes to the star's centre - not from the sphere's own geometry. That
 * makes it an exponential falloff hugging the limb at whatever radius the
 * carrier sphere happens to be, instead of a broad wash filling the frame.
 */
const CORONA_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  varying vec3 vWorld;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uDim;
  ${NOISE_GLSL}
  void main() {
    vec3 d = normalize(vWorld - cameraPosition);
    // closest approach of this line of sight to the star's centre
    vec3 near = cameraPosition + d * dot(-cameraPosition, d);
    float b = length(near);
    if (b < 1.0) discard;                       // the star itself covers this
    float falloff = exp(-(b - 1.0) / 0.15);
    // structure sampled where the ray grazes the limb, so the streamers stand
    // off the surface radially instead of drifting as blobs across the frame
    vec3 lim = normalize(near);
    float streamer = fbm(lim * 4.5 + vec3(0.0, uTime * 0.02, 0.0)) * 0.5 + 0.5;
    float a = falloff * (0.55 + 0.60 * streamer) * uOpacity * uDim;
    gl_FragColor = vec4(uColor * (0.75 + 0.45 * streamer), a);
  }
`;

/** Spicule fringe: the fuzzy, fibrous rind just above the visible surface. */
const FRINGE_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  varying vec3 vWorld;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uCutA;
  uniform float uCutB;
  uniform float uDim;
  ${NOISE_GLSL}
  void main() {
    float phi = atan(vDir.z, vDir.x);
    if (phi < 0.0) phi += 6.283185307;
    if (phi > uCutA && phi < uCutB) discard;
    vec3 V = normalize(cameraPosition - vWorld);
    float edge = 1.0 - abs(dot(normalize(vDir), V));
    float fib = fbm(vDir * 26.0 + vec3(0.0, uTime * 0.07, 0.0)) * 0.5 + 0.5;
    float a = pow(edge, 5.0) * (0.35 + 0.65 * fib) * 0.20;
    gl_FragColor = vec4(uColor, a * uDim);
  }
`;

const PROM_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const PROM_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorld;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uSeed;
  uniform float uDim;
  ${NOISE_GLSL}
  void main() {
    // fade in from the footpoints and flicker along the loop
    float along = vUv.x;
    float body = sin(along * 3.14159);
    float flick = fbm(vec3(along * 5.0, uTime * 0.35, uSeed)) * 0.5 + 0.5;
    float a = pow(body, 0.8) * (0.35 + 0.85 * flick);
    // A prominence is optically thin: against the blazing disc you would never
    // see it, and only the part standing off the limb shows. Without this they
    // read as scratches drawn across the surface.
    vec3 d = normalize(vWorld - cameraPosition);
    float b = length(cameraPosition + d * dot(-cameraPosition, d));
    a *= smoothstep(0.97, 1.06, b);
    gl_FragColor = vec4(uColor, a * 0.6 * uDim);
  }
`;

/* ------------------------------------------------------------- particles -- */

const HEAT_VERT = /* glsl */ `
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aSize;
  attribute float aSide;
  varying float vFade;
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  uniform float uCutA;
  uniform float uCutB;
  uniform float uPr;
  void main() {
    // each particle rises through the convective band and sinks back, which is
    // what convection does: hot plasma up, cooled plasma down
    float cycle = fract(aPhase + uTime * aSpeed * 0.06);
    float rise = cycle < 0.5 ? cycle * 2.0 : (1.0 - cycle) * 2.0;
    float rad = mix(uInner, uOuter, rise);
    float phi = aSide < 0.5 ? uCutA : uCutB;
    float theta = position.y;
    vec3 u = vec3(cos(phi), 0.0, sin(phi));
    vec3 p = (u * sin(theta) + vec3(0.0, 1.0, 0.0) * cos(theta)) * rad;
    // lift off the face so the sprites do not z-fight the cap
    vec3 outward = aSide < 0.5
      ? vec3(-sin(uCutA), 0.0, cos(uCutA))
      : vec3(sin(uCutB), 0.0, -cos(uCutB));
    p += outward * 0.006;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFade = sin(cycle * 3.14159) * (cycle < 0.5 ? 1.0 : 0.55);
    // clamped: an unclamped perspective size turns these into screen-filling
    // additive blobs the moment the camera comes close
    gl_PointSize = clamp(aSize * 30.0 / max(-mv.z, 0.1), 1.0, 5.5) * uPr;
    gl_Position = projectionMatrix * mv;
  }
`;

const HEAT_FRAG = /* glsl */ `
  precision highp float;
  varying float vFade;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uDim;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.05, length(d));
    gl_FragColor = vec4(uColor, a * vFade * uOpacity * uDim);
  }
`;

/* ----------------------------------------------------------------- scene -- */

export interface LayerAnchor {
  index: number;
  layer: InteriorLayer;
  /** World-space point the label points at. */
  position: THREE.Vector3;
  innerFraction: number;
  /** False when the model itself is standing in front of this anchor. */
  visible: boolean;
}

interface LayerParts {
  shell: THREE.Mesh;
  caps: THREE.Mesh[];
  materials: THREE.ShaderMaterial[];
  inner: number;
  outer: number;
  /**
   * How much of the full cut this layer opens, 0..1. Outer shells are staged
   * open wider than the ones they enclose, so looking into the section you see
   * each inner shell's dome standing proud of the one outside it - the nested,
   * peeled-back structure a real sectioned model has. The innermost layer keeps
   * a fraction of 0: a core is a whole ball, not a wedge with a bite out.
   */
  open: number;
  phiA: number;
  phiB: number;
}

export class CutawayScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly renderer: THREE.WebGLRenderer;
  /** Radians of azimuth currently removed; animated on reveal. */
  cutAngle = MAX_CUT;
  private group = new THREE.Group();
  private layers: LayerParts[] = [];
  private defs: InteriorLayer[] = [];
  private extras: THREE.Object3D[] = [];
  private heatMat: THREE.ShaderMaterial | null = null;
  private timed: THREE.ShaderMaterial[] = [];
  private furniture: THREE.ShaderMaterial[] = [];
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private elapsed = 0;
  private isStar = false;
  private highlight: number | null = null;
  private surfaceMap: THREE.Texture | null = null;
  private mapToken = 0;
  private frameId = 0;
  private frontFrame = -1;
  private frontCache: { phi: number; normal: THREE.Vector3 } | null = null;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private pixelRatio = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearAlpha(0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.03, 60);
    this.camera.position.set(3.90, 1.87, 1.57);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.35;
    this.controls.maxDistance = 8;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.8;
    // the model stays put and the camera walks around it, so the cut plane and
    // the key light are both fixed in the world - turning the view sweeps the
    // highlight across the shells instead of dragging it along with them
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.75;

    this.scene.add(this.group);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  get autoRotate(): boolean {
    return this.controls.autoRotate;
  }

  set autoRotate(v: boolean) {
    this.controls.autoRotate = v;
  }

  /** Build the shells for a body's published interior model. */
  setBody(def: CatalogObject, surfaceMapUrl?: string): void {
    this.disposeBody();
    const interior = def.interior;
    if (!interior) return;
    this.defs = interior.layers;
    this.isStar = def.type === 'star';
    // a star is mostly light, so it can take a lot of bloom; a rocky world
    // would just go milky, and the point of the lit materials is that they do
    // not glow
    this.bloom.strength = this.isStar ? 0.46 : 0.16;
    this.bloom.threshold = this.isStar ? 0.86 : 0.92;
    this.bloom.radius = this.isStar ? 0.62 : 0.45;

    // a stable per-body seed keeps every body's texture its own, and keeps it
    // identical between visits
    const seed = Array.from(def.id).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);

    for (let i = 0; i < this.defs.length; i++) {
      const l = this.defs[i];
      const inner = i === 0 ? 0 : this.defs[i - 1].outerRadiusFraction * SPHERE_R;
      const outer = l.outerRadiusFraction * SPHERE_R;
      const kind = layerMaterial(l, this.isStar, i);
      const color = new THREE.Color(l.color);
      const hot = color.clone().lerp(new THREE.Color(0xffffff), PLASMA.includes(kind) ? 0.18 : 0.3);
      const uniforms = {
        uTime: { value: 0 },
        uColor: { value: color },
        uHot: { value: hot },
        uMat: { value: MATERIAL_INDEX[kind] },
        uIsCap: { value: 0 },
        uInner: { value: inner },
        uOuter: { value: outer },
        uCutA: { value: 0 },
        uCutB: { value: 0 },
        uHighlight: { value: 0 },
        uDim: { value: 1 },
        uSeed: { value: (seed % 97) + i * 13 },
        uFaceNormal: { value: new THREE.Vector3(0, 0, 1) },
        uMap: { value: null as THREE.Texture | null },
        uHasMap: { value: 0 },
      };
      const shellMat = new THREE.ShaderMaterial({
        vertexShader: LAYER_VERT,
        fragmentShader: LAYER_FRAG,
        uniforms,
        side: THREE.DoubleSide,
      });

      // Resolution scales with the shell: the outermost sphere carries the
      // silhouette and has to stay round at full zoom, the core does not.
      const seg = Math.round(THREE.MathUtils.lerp(72, 168, outer));
      const shell = new THREE.Mesh(new THREE.SphereGeometry(outer, seg, Math.round(seg * 0.55)), shellMat);
      shell.renderOrder = i;

      // The section faces. A plane through the polar axis cuts a shell into a
      // half-annulus from its inner to its outer radius - which is exactly the
      // band a sawn-open sphere shows, at its true thickness.
      const ring = new THREE.RingGeometry(Math.max(inner, 0.0001), outer, 96, 2, -Math.PI / 2, Math.PI);
      const caps: THREE.Mesh[] = [];
      const materials: THREE.ShaderMaterial[] = [shellMat];
      for (let s = 0; s < 2; s++) {
        const capMat = shellMat.clone();
        capMat.uniforms.uIsCap.value = 1;
        capMat.uniforms.uMap = shellMat.uniforms.uMap;
        capMat.uniforms.uHasMap.value = 0;
        capMat.side = THREE.DoubleSide;
        const cap = new THREE.Mesh(ring, capMat);
        cap.renderOrder = i;
        caps.push(cap);
        materials.push(capMat);
      }
      // staged opening: the outermost shell takes the full cut, each one
      // inside it opens less, and the core stays whole
      const open = this.defs.length > 1 ? Math.pow(i / (this.defs.length - 1), 0.85) : 1;
      this.group.add(shell, caps[0], caps[1]);
      this.layers.push({ shell, caps, materials, inner, outer, open, phiA: 0, phiB: 0 });
      this.timed.push(...materials);
    }

    this.buildCavityLiner();

    if (this.isStar) {
      this.buildStarAtmosphere(new THREE.Color(this.defs[this.defs.length - 1].color));
      if (this.defs.length >= 3) {
        const band = this.layers[this.layers.length - 2];
        this.buildHeatParticles(band.inner, band.outer);
      }
    }

    // the photographic surface map, when the body has one, blends into the
    // outermost shell so the exterior is the real world and not a guess
    if (surfaceMapUrl) {
      const token = ++this.mapToken;
      new THREE.TextureLoader().load(
        surfaceMapUrl,
        (tex) => {
          // a slower body switch must not strand the previous body's map, and
          // must not paint it onto the new one either
          if (token !== this.mapToken) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          this.surfaceMap?.dispose();
          this.surfaceMap = tex;
          const outer = this.layers[this.layers.length - 1];
          if (outer) {
            outer.materials[0].uniforms.uMap.value = tex;
            outer.materials[0].uniforms.uHasMap.value = 1;
          }
        },
        undefined,
        () => {
          /* no map for this body - the procedural material stands alone */
        },
      );
    }

    this.applyCut();
  }

  /**
   * Close the notch.
   *
   * The shells are surfaces, not solids, so a sight line that grazes in under
   * the surface can enter the removed wedge and leave through it again without
   * ever crossing material - and shows the background. That reads as a hole
   * punched clean through the body, which is exactly what a cutaway must not
   * look like.
   *
   * This is one more sphere at the body's own radius, uncut and drawn
   * back-faces-only. Because the only place it can be seen is where a ray
   * leaves the body, it is always the last surface along any line of sight: it
   * can never hide a layer, and it fills every one of those escaping rays with
   * the underside of the body's own surface. The cavity ends up lined with the
   * body instead of with space.
   */
  private buildCavityLiner(): void {
    const outer = this.layers[this.layers.length - 1];
    if (!outer) return;
    const mat = outer.materials[0].clone();
    mat.side = THREE.BackSide;
    // never cut: this surface is the far wall of the notch, not a shell
    mat.uniforms.uCutA.value = 0;
    mat.uniforms.uCutB.value = 0;
    // no photographic map - a mirrored mosaic on the inside of the far wall
    // would read as a second, wrong-way-round world
    mat.uniforms.uHasMap.value = 0;
    const seg = 128;
    const liner = new THREE.Mesh(new THREE.SphereGeometry(outer.outer, seg, Math.round(seg * 0.55)), mat);
    liner.renderOrder = -1;
    this.group.add(liner);
    this.extras.push(liner);
    this.timed.push(mat);
    this.furniture.push(mat);
  }

  /* ------------------------------------------------------- star furniture -- */

  private buildStarAtmosphere(surface: THREE.Color): void {
    const hot = surface.clone().lerp(new THREE.Color(0xffffff), 0.25);

    const fringeMat = new THREE.ShaderMaterial({
      vertexShader: CORONA_VERT,
      fragmentShader: FRINGE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: hot.clone().multiplyScalar(0.95) },
        uCutA: { value: 0 },
        uCutB: { value: 0 },
        uDim: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(SPHERE_R * 1.018, 128, 72), fringeMat);
    fringe.renderOrder = 30;
    this.group.add(fringe);
    this.extras.push(fringe);
    this.timed.push(fringeMat);
    this.furniture.push(fringeMat);

    const coronaMat = new THREE.ShaderMaterial({
      vertexShader: CORONA_VERT,
      fragmentShader: CORONA_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xff8c33) },
        uOpacity: { value: 0.85 },
        uDim: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    const corona = new THREE.Mesh(new THREE.SphereGeometry(SPHERE_R * 2.6, 96, 56), coronaMat);
    corona.renderOrder = -2;
    this.group.add(corona);
    this.extras.push(corona);
    this.timed.push(coronaMat);
    this.furniture.push(coronaMat);

    // Prominence loops standing on the limb, placed clear of the cut so they
    // never hang across the open section.
    let seed = 9176;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const promGeo = new THREE.TorusGeometry(0.115, 0.0085, 8, 56, Math.PI);
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: PROM_VERT,
        fragmentShader: PROM_FRAG,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(0xff8a3c) },
          uSeed: { value: i * 7.3 },
          uDim: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const loop = new THREE.Mesh(promGeo, mat);
      const phi = MAX_CUT + 0.35 + rnd() * (TAU - MAX_CUT - 0.7);
      const lat = (rnd() - 0.5) * 1.5;
      const normal = new THREE.Vector3(
        Math.cos(phi) * Math.cos(lat),
        Math.sin(lat),
        Math.sin(phi) * Math.cos(lat),
      ).normalize();
      loop.position.copy(normal).multiplyScalar(SPHERE_R * 1.0);
      // stand the loop up: the half-torus arches along its own +Y, so +Y must
      // point out along the surface normal and the footpoints stay tangent
      const t1 = new THREE.Vector3(0, 1, 0).cross(normal);
      if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0);
      t1.normalize();
      const t2 = new THREE.Vector3().crossVectors(normal, t1).normalize();
      loop.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t1, normal, t2));
      // spin it about the normal so the arcs are not all facing the same way
      loop.rotateY(rnd() * Math.PI);
      loop.scale.setScalar(0.7 + rnd() * 0.9);
      loop.renderOrder = 28;
      this.group.add(loop);
      this.extras.push(loop);
      this.timed.push(mat);
      this.furniture.push(mat);
    }
  }

  private buildHeatParticles(inner: number, outer: number): void {
    const COUNT = 460;
    const pos = new Float32Array(COUNT * 3);
    const phase = new Float32Array(COUNT);
    const speed = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);
    const side = new Float32Array(COUNT);
    let seed = 24601;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < COUNT; i++) {
      // position.y carries the polar angle; the shader turns it into a point
      // on whichever cut face this particle belongs to
      pos[i * 3 + 1] = 0.12 + rnd() * (Math.PI - 0.24);
      phase[i] = rnd();
      speed[i] = 0.6 + rnd() * 1.1;
      size[i] = 1.1 + rnd() * 2.2;
      side[i] = rnd() < 0.5 ? 0 : 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.heatMat = new THREE.ShaderMaterial({
      vertexShader: HEAT_VERT,
      fragmentShader: HEAT_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uInner: { value: inner + 0.012 },
        uOuter: { value: outer - 0.012 },
        uCutA: { value: 0 },
        uCutB: { value: 0 },
        uPr: { value: this.pixelRatio },
        uColor: { value: new THREE.Color(0xffd9a0) },
        uOpacity: { value: 0.4 },
        uDim: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.furniture.push(this.heatMat);
    const heat = new THREE.Points(geo, this.heatMat);
    heat.frustumCulled = false;
    heat.renderOrder = 25;
    this.group.add(heat);
    this.extras.push(heat);
  }

  /* ------------------------------------------------------------- the cut -- */

  /**
   * Push the current cut everywhere it is needed.
   *
   * The notch is centred on one bisector and each layer opens a different
   * amount around it, so the shells step back as they go outward. Each layer
   * tests its own two bounds in the fragment shader, swings its two caps onto
   * its own planes, and gets the true outward normal of each face - which is
   * what makes a cut face catch the key light like a real plane rather than
   * being flat-filled.
   */
  private applyCut(): void {
    const cut = this.cutAngle;
    const centre = cut / 2;
    for (const parts of this.layers) {
      const half = centre * parts.open;
      const phiA = centre - half;
      const phiB = centre + half;
      parts.phiA = phiA;
      parts.phiB = phiB;
      const visible = half > 0.004;
      for (const m of parts.materials) {
        m.uniforms.uCutA.value = phiA;
        m.uniforms.uCutB.value = phiB;
      }
      // material lies outside [phiA, phiB], so each face looks into the notch
      parts.caps[0].rotation.y = -phiA;
      parts.caps[1].rotation.y = -phiB;
      (parts.caps[0].material as THREE.ShaderMaterial).uniforms.uFaceNormal.value.set(
        -Math.sin(phiA),
        0,
        Math.cos(phiA),
      );
      (parts.caps[1].material as THREE.ShaderMaterial).uniforms.uFaceNormal.value.set(
        Math.sin(phiB),
        0,
        -Math.cos(phiB),
      );
      parts.caps[0].visible = visible;
      parts.caps[1].visible = visible;
    }
    // the spicule fringe and the convecting band ride the outermost opening
    const outer = this.layers[this.layers.length - 1];
    const oa = outer ? outer.phiA : 0;
    const ob = outer ? outer.phiB : 0;
    for (const m of this.timed) {
      if (m.uniforms.uCutA && m.uniforms.uIsCap === undefined) {
        m.uniforms.uCutA.value = oa;
        m.uniforms.uCutB.value = ob;
      }
    }
    if (this.heatMat) {
      const band = this.layers[this.layers.length - 2];
      this.heatMat.uniforms.uCutA.value = band ? band.phiA : oa;
      this.heatMat.uniforms.uCutB.value = band ? band.phiB : ob;
    }
  }

  /**
   * Whichever of a layer's two section faces is currently turned toward the
   * camera. The outermost layer's choice is cached per frame and reused for all
   * of them, so every callout sits on the same side of the notch and the leader
   * lines stay on one side of the model.
   */
  private frontSide(): number {
    if (this.frontCache && this.frontFrame === this.frameId) return this.frontCache.phi;
    const outer = this.layers[this.layers.length - 1];
    const cam = this.camera.position.clone().normalize();
    const nA = new THREE.Vector3(-Math.sin(outer?.phiA ?? 0), 0, Math.cos(outer?.phiA ?? 0));
    const nB = new THREE.Vector3(Math.sin(outer?.phiB ?? 0), 0, -Math.cos(outer?.phiB ?? 0));
    const side = nA.dot(cam) >= nB.dot(cam) ? 0 : 1;
    this.frontCache = { phi: side, normal: side === 0 ? nA : nB };
    this.frontFrame = this.frameId;
    return side;
  }

  /**
   * World-space points for the callouts, inner layer first.
   *
   * Each one rides its own layer's exposed section face - or, for a layer that
   * is not cut at all, the front of its dome - so every label points at the
   * thing it names and travels with it as the view moves around the model.
   * Visibility is computed here in the same pass: a callout is readable only
   * when the surface it sits on faces the camera and the sight line escapes
   * through the notch instead of through solid body.
   */
  anchors(): LayerAnchor[] {
    const out: LayerAnchor[] = [];
    const side = this.frontSide();
    const outer = this.layers[this.layers.length - 1];
    // lifted above the equator so the leader line does not run along the rim
    const theta = Math.PI * 0.42;
    for (let i = 0; i < this.layers.length; i++) {
      const parts = this.layers[i];
      const cut = parts.phiB - parts.phiA;
      // an uncut layer has no face, so its label points at the front of its
      // dome, on the bisector where the notch actually exposes it
      const onFace = cut > 0.02;
      const phi = onFace
        ? side === 0
          ? parts.phiA
          : parts.phiB
        : (parts.phiA + parts.phiB) / 2;
      const normal = onFace
        ? side === 0
          ? new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi))
          : new THREE.Vector3(Math.sin(phi), 0, -Math.cos(phi))
        : new THREE.Vector3(Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
      const radial = new THREE.Vector3(
        Math.cos(phi) * Math.sin(theta),
        Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
      );
      const mid = onFace
        ? i === this.layers.length - 1
          ? (parts.inner + parts.outer * 3) / 4
          : (parts.inner + parts.outer) / 2
        : parts.outer;
      const p = radial.multiplyScalar(mid).addScaledVector(normal, 0.016);
      const position = this.group.localToWorld(p);
      out.push({
        index: i,
        layer: this.defs[i],
        position,
        innerFraction: i === 0 ? 0 : this.defs[i - 1].outerRadiusFraction,
        visible: this.testVisible(position, normal, outer),
      });
    }
    return out;
  }

  /**
   * A callout is readable only when both things are true: the surface it sits
   * on is turned toward the camera (edge-on, the band it names is a sliver),
   * and the body itself is not in the way. The second test is analytic - walk
   * from the anchor toward the camera, find where that ray leaves the outer
   * sphere, and check it escapes through the removed wedge rather than through
   * solid body. Without it the callouts keep pointing at layers while you are
   * looking at the far side.
   */
  private testVisible(p: THREE.Vector3, normal: THREE.Vector3, outer?: LayerParts): boolean {
    if (this.cutAngle < 0.05 || !outer) return false;
    const local = this.group.worldToLocal(this.tmpA.copy(p));
    const dir = this.group
      .worldToLocal(this.tmpB.copy(this.camera.position))
      .sub(local)
      .normalize();
    if (normal.dot(dir) <= 0.2) return false;

    // The sight line has to clear every shell standing above the anchor, not
    // just the outermost one: because each shell opens by a different amount,
    // a ray can leave through the outer notch and still be buried in a shell
    // between - which would leave a callout pointing at something you cannot
    // actually see.
    const r0 = local.length();
    for (const l of this.layers) {
      if (l.outer <= r0 + 1e-4) continue;
      const b = local.dot(dir);
      const c = local.lengthSq() - l.outer * l.outer;
      const disc = b * b - c;
      if (disc <= 0) continue; // the ray never reaches this shell
      const t = -b + Math.sqrt(disc);
      if (t <= 0) continue;
      const ex = local.x + dir.x * t;
      const ez = local.z + dir.z * t;
      let phi = Math.atan2(ez, ex);
      if (phi < 0) phi += TAU;
      if (phi < l.phiA || phi > l.phiB) return false;
    }
    return true;
  }

  /** Emphasise one layer (or null for none). */
  setHighlight(index: number | null): void {
    this.highlight = index;
    // the star's corona, spicules, prominences and convection sparks belong to
    // the whole body, so they step back with everything else when one layer is
    // isolated - otherwise the Sun keeps blazing around a dimmed model
    for (const m of this.furniture) m.uniforms.uDim.value = index === null ? 1 : 0.22;
    for (let i = 0; i < this.layers.length; i++) {
      const on = index === null || index === i;
      const hi = index === i ? 1 : 0;
      for (const m of this.layers[i].materials) {
        m.uniforms.uHighlight.value = hi;
        m.uniforms.uDim.value = on ? 1 : 0.34;
      }
    }
  }

  get highlighted(): number | null {
    return this.highlight;
  }

  /** What is actually in the scene right now - one body's worth, or a bug. */
  get contents(): { layers: number; objects: number } {
    return { layers: this.layers.length, objects: this.group.children.length };
  }

  resize(w: number, h: number): void {
    const pr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    if (this.heatMat) this.heatMat.uniforms.uPr.value = pr;
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.frameId++;
    this.applyCut();
    for (const m of this.timed) m.uniforms.uTime.value = this.elapsed;
    if (this.heatMat) this.heatMat.uniforms.uTime.value = this.elapsed;
    this.controls.update();
    this.composer.render();
  }

  resetView(): void {
    this.camera.position.set(3.90, 1.87, 1.57);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /**
   * Tear the current body down completely. Switching bodies really does swap
   * the model - geometry, materials and textures are released and rebuilt - so
   * only one body is ever in the scene.
   */
  private disposeBody(): void {
    // a texture still in flight belongs to the body being replaced
    this.mapToken++;
    for (const l of this.layers) {
      l.shell.geometry.dispose();
      // both caps share one ring geometry
      l.caps[0].geometry.dispose();
      for (const m of l.materials) m.dispose();
      this.group.remove(l.shell, l.caps[0], l.caps[1]);
    }
    this.layers = [];
    // the prominence loops share one torus, so dedupe before releasing
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    for (const o of this.extras) {
      const mesh = o as THREE.Mesh | THREE.Points;
      if (mesh.geometry) geos.add(mesh.geometry);
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => mats.add(m));
      else if (mat) mats.add(mat);
      this.group.remove(o);
    }
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    this.extras = [];
    this.heatMat = null;
    this.timed = [];
    this.furniture = [];
    this.defs = [];
    this.highlight = null;
    this.surfaceMap?.dispose();
    this.surfaceMap = null;
  }

  dispose(): void {
    this.disposeBody();
    this.controls.dispose();
    // the composer releases its own buffers but not the passes' - bloom in
    // particular holds a stack of render targets and a pile of materials
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
