/** One planet: tilted spin group, surface, optional atmosphere/clouds/rings. */
import * as THREE from 'three';
import { type BodyDef, MOON_DIST_KM, AU_KM } from '../data/bodies';
import { displayRadius, MOON_EXPLORER_DIST, TRUE_UNITS_PER_AU } from '../sim/scale';
import type { BodySurface } from './textures';

const ATMO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMO_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform float uPower;
  uniform float uStrength;
  void main() {
    float facing = dot(vNormal, vec3(0.0, 0.0, 1.0));
    // clamp the base into (0, 1]: the epsilon floor avoids driver pow(0, y)
    // NaNs and the cap bounds the hidden far hemisphere, whose fragments leak
    // through when a distant planet rasterises to less than a pixel
    float rim = pow(clamp(0.62 - facing, 1e-4, 1.0), uPower);
    // the glow belongs to the day side; fade it through the terminator
    float day = 0.15 + 0.85 * smoothstep(-0.35, 0.45, dot(vWorldNormal, uSunDir));
    vec3 col = uColor * rim * uStrength * day;
    gl_FragColor = vec4(min(col, vec3(2.0)), 1.0);
  }
`;

interface AtmosphereSpec {
  color: number;
  strength: number;
}

const ATMOSPHERES: Record<string, AtmosphereSpec> = {
  venus: { color: 0xe8c98f, strength: 0.75 },
  earth: { color: 0x5fa8ff, strength: 0.95 },
  mars: { color: 0xd98a5e, strength: 0.35 },
  jupiter: { color: 0xd9b48a, strength: 0.4 },
  saturn: { color: 0xe0cda2, strength: 0.35 },
  uranus: { color: 0x9fd8dc, strength: 0.45 },
  neptune: { color: 0x6f9ae8, strength: 0.55 },
};

const sphereGeo = new THREE.SphereGeometry(1, 64, 32);

/**
 * Fine ring structure, revealed by proximity.
 *
 * The base map (Cassini's real radial profile, streamed in over the procedural
 * one) carries the big features - C ring, B ring, the Cassini division, the
 * Encke gap. What a photograph of the whole system cannot carry is the scale
 * below that: the rings are not smooth sheets but thousands of individual
 * ringlets, and you only see them from close up. So this modulation stays at
 * zero for a distant Saturn and fades in as a ship closes on the ring plane,
 * adding density structure on top of the measured profile rather than
 * replacing it. The radius is recovered per fragment, so the bands stay
 * perfectly circular right down to a low pass over the rings.
 */
const RING_DETAIL_PARS = /* glsl */ `
  varying vec2 vRingLocal;
  uniform float uRingDetail;
  uniform float uRingInner;
  uniform float uRingOuter;
  float ringlets(float t) {
    float v = 0.55 * sin(t * 340.0);
    v += 0.30 * sin(t * 910.0 + 1.7);
    v += 0.18 * sin(t * 2350.0 + 3.1);
    return v;
  }
`;

const RING_DETAIL_BODY = /* glsl */ `
  {
    float rr = length(vRingLocal);
    float t = clamp((rr - uRingInner) / max(uRingOuter - uRingInner, 1e-5), 0.0, 1.0);
    float band = ringlets(t);
    diffuseColor.a *= clamp(1.0 + uRingDetail * 0.45 * band, 0.22, 1.9);
    diffuseColor.rgb *= 1.0 + uRingDetail * 0.15 * band;
  }
`;

/** RingGeometry with UVs remapped so u runs inner→outer radius. */
function radialRingGeometry(
  inner: number,
  outer: number,
  segments = 256,
  radialSegments = 6,
): THREE.RingGeometry {
  const geo = new THREE.RingGeometry(inner, outer, segments, radialSegments);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = (v.length() - inner) / (outer - inner);
    uv.setXY(i, r, 0.5);
  }
  return geo;
}

export class Planet {
  readonly def: BodyDef;
  /** Root: positioned at the body's heliocentric location by the system. */
  readonly group = new THREE.Group();
  /** Unscaled group in the planet's equatorial plane - satellites mount here. */
  readonly satEquatorial = new THREE.Group();
  /** Everything sized in planet radii, scaled by display radius. */
  private sizeGroup = new THREE.Group();
  private tiltGroup = new THREE.Group();
  private surface: THREE.Mesh;
  private clouds?: THREE.Mesh;
  private atmoMat?: THREE.ShaderMaterial;
  readonly hit: THREE.Mesh;
  private ringMesh?: THREE.Mesh;
  private ringUniforms?: Record<string, { value: number }>;
  private spinPhase: number;
  private currentRadius = 1;
  private discVisible = true;

  constructor(def: BodyDef, surface: BodySurface, ringTexture?: THREE.Texture) {
    this.def = def;
    // epoch-tied spin phase (see w0Deg's doc in data/bodies.ts: GMST for
    // Earth so day/night follows UTC, IAU W0 for the rest), a stable hash
    // otherwise
    this.spinPhase =
      def.facts.w0Deg !== undefined
        ? THREE.MathUtils.degToRad(def.facts.w0Deg)
        : (def.id.charCodeAt(0) * 0.7) % (Math.PI * 2);

    const mat = new THREE.MeshStandardMaterial({
      map: surface.map,
      roughness: 1,
      metalness: 0,
    });
    if (surface.roughnessMap) {
      mat.roughnessMap = surface.roughnessMap;
      mat.roughness = 1;
    }
    this.surface = new THREE.Mesh(sphereGeo, mat);
    this.surface.name = def.id;

    this.tiltGroup.add(this.surface);
    this.tiltGroup.rotation.z = -THREE.MathUtils.degToRad(def.facts.axialTiltDeg);
    this.sizeGroup.add(this.tiltGroup);
    this.satEquatorial.rotation.z = this.tiltGroup.rotation.z;
    this.group.add(this.sizeGroup, this.satEquatorial);

    if (surface.clouds) {
      this.clouds = new THREE.Mesh(
        sphereGeo,
        new THREE.MeshStandardMaterial({
          map: surface.clouds,
          transparent: true,
          depthWrite: false,
          roughness: 1,
        }),
      );
      this.clouds.scale.setScalar(1.012);
      this.tiltGroup.add(this.clouds);
    }

    const atmo = ATMOSPHERES[def.id];
    if (atmo) {
      this.atmoMat = new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(atmo.color) },
          uSunDir: { value: new THREE.Vector3(1, 0, 0) },
          uPower: { value: 4.2 },
          uStrength: { value: atmo.strength },
        },
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const shell = new THREE.Mesh(sphereGeo, this.atmoMat);
      shell.scale.setScalar(1.1);
      this.sizeGroup.add(shell);
    }

    if (ringTexture && (def.id === 'saturn' || def.id === 'uranus')) {
      const spec = def.id === 'saturn' ? { inner: 1.24, outer: 2.33 } : { inner: 1.65, outer: 2.0 };
      const ringGeo = radialRingGeometry(spec.inner, spec.outer);
      const ringMat = new THREE.MeshStandardMaterial({
        map: ringTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        roughness: 0.9,
        metalness: 0,
      });
      this.ringUniforms = {
        uRingDetail: { value: 0 },
        uRingInner: { value: spec.inner },
        uRingOuter: { value: spec.outer },
      };
      const uniforms = this.ringUniforms;
      ringMat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = `varying vec2 vRingLocal;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  vRingLocal = position.xy;',
        );
        shader.fragmentShader = `${RING_DETAIL_PARS}\n${shader.fragmentShader}`.replace(
          '#include <map_fragment>',
          `#include <map_fragment>\n${RING_DETAIL_BODY}`,
        );
      };
      // keep this variant out of the shared MeshStandardMaterial program cache
      ringMat.customProgramCacheKey = () => 'orrery-ring-detail';
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2; // into the equatorial plane
      ring.renderOrder = 1;
      this.ringMesh = ring;
      this.tiltGroup.add(ring);
    }

    // invisible-but-raycastable pick proxy
    const hitMat = new THREE.MeshBasicMaterial();
    hitMat.visible = false;
    this.hit = new THREE.Mesh(sphereGeo, hitMat);
    this.hit.name = def.id;
    this.group.add(this.hit);
  }

  /** Swap in a higher-quality surface map (progressive enhancement). */
  setSurfaceMap(map: THREE.Texture, roughnessMap?: THREE.Texture | null): void {
    const mat = this.surface.material as THREE.MeshStandardMaterial;
    mat.map?.dispose(); // free the procedural canvas texture on the GPU
    mat.map = map;
    if (roughnessMap !== undefined) mat.roughnessMap = roughnessMap ?? null;
    mat.needsUpdate = true;
  }

  /** Swap the ring's procedural strip for a photographic one (radial u-axis). */
  setRingMap(map: THREE.Texture): void {
    if (!this.ringMesh) return;
    const mat = this.ringMesh.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.map = map;
    mat.needsUpdate = true;
  }

  update(simDays: number, scaleT: number): void {
    const r = displayRadius(this.def.id, this.def.facts.diameterKm, scaleT);
    this.currentRadius = r;
    this.sizeGroup.scale.setScalar(r);
    // pick-proxy floor: generous in explorer view, but planets with moons
    // must shrink it at true scale or the proxy swallows the whole moon
    // system (Io orbits 0.28 units out; a 1-unit floor would eat it)
    let hitFloor = 1.0;
    if (this.def.id === 'earth') {
      const moonDist = MOON_EXPLORER_DIST * (1 - scaleT) + (MOON_DIST_KM / AU_KM) * TRUE_UNITS_PER_AU * scaleT;
      hitFloor = Math.min(1.0, moonDist * 0.55);
    } else if (this.def.facts.moons > 0) {
      hitFloor = 1.0 * (1 - scaleT);
    }
    this.hit.scale.setScalar(Math.max(r * 1.6, hitFloor));

    // keep the atmosphere's day side pointed at the Sun (which sits at origin)
    if (this.atmoMat) {
      const p = this.group.position;
      const len = p.length() || 1;
      (this.atmoMat.uniforms.uSunDir.value as THREE.Vector3)
        .set(-p.x / len, -p.y / len, -p.z / len);
    }

    // Sidereal spin. The axis orientation (axialTiltDeg > 90° flips the pole)
    // already encodes retrograde rotation, so spin about the local axis with
    // |rotationHours| - using the signed value too would double-negate Venus,
    // Uranus and Pluto into a wrong prograde spin.
    const hours = Math.abs(this.def.facts.rotationHours);
    const spin = this.spinPhase + ((simDays * 24) / hours) * Math.PI * 2;
    this.surface.rotation.y = spin;
    if (this.clouds) {
      const cloudHours = this.def.facts.cloudPeriodHours;
      this.clouds.rotation.y = cloudHours
        ? this.spinPhase + ((simDays * 24) / Math.abs(cloudHours)) * Math.PI * 2
        : spin * 0.88; // default: clouds lag the surface slightly
    }
  }

  get radius(): number {
    return this.currentRadius;
  }

  /**
   * How much fine ring structure to reveal, 0..1. Driven by how close an
   * observer is to the ring plane; zero everywhere except spacecraft mode.
   */
  setRingDetail(level: number): void {
    if (this.ringUniforms) {
      this.ringUniforms.uRingDetail.value = THREE.MathUtils.clamp(level, 0, 1);
    }
  }

  get hasRings(): boolean {
    return !!this.ringMesh;
  }

  /**
   * Hide the body itself (surface, atmosphere, clouds, rings) while leaving its
   * satellites and pick proxy alone. Used when the planet is a sub-pixel object
   * and the naked-eye point renderer is drawing it as a star instead - a
   * sub-pixel mesh only flickers and pumps the bloom pass.
   */
  setDiscVisible(v: boolean): void {
    if (this.discVisible === v) return;
    this.discVisible = v;
    this.sizeGroup.visible = v;
  }

  get isDiscVisible(): boolean {
    return this.discVisible;
  }
}
