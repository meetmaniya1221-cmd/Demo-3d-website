/** One planet: tilted spin group, surface, optional atmosphere/clouds/rings/moon. */
import * as THREE from 'three';
import { type BodyDef, MOON, MOON_DIST_KM, MOON_PERIOD_DAYS, AU_KM } from '../data/bodies';
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

/** RingGeometry with UVs remapped so u runs inner→outer radius. */
function radialRingGeometry(inner: number, outer: number, segments = 128): THREE.RingGeometry {
  const geo = new THREE.RingGeometry(inner, outer, segments, 1);
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
  /** Everything sized in planet radii, scaled by display radius. */
  private sizeGroup = new THREE.Group();
  private tiltGroup = new THREE.Group();
  private surface: THREE.Mesh;
  private clouds?: THREE.Mesh;
  private atmoMat?: THREE.ShaderMaterial;
  readonly hit: THREE.Mesh;
  private moonPivot?: THREE.Group;
  moonMesh?: THREE.Mesh;
  moonHit?: THREE.Mesh;
  private spinPhase: number;
  private currentRadius = 1;

  constructor(def: BodyDef, surface: BodySurface, ringTexture?: THREE.Texture) {
    this.def = def;
    this.spinPhase = (def.id.charCodeAt(0) * 0.7) % (Math.PI * 2);

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
    this.group.add(this.sizeGroup);

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
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2; // into the equatorial plane
      ring.renderOrder = 1;
      this.tiltGroup.add(ring);
    }

    // invisible-but-raycastable pick proxy
    const hitMat = new THREE.MeshBasicMaterial();
    hitMat.visible = false;
    this.hit = new THREE.Mesh(sphereGeo, hitMat);
    this.hit.name = def.id;
    this.group.add(this.hit);

    if (def.id === 'earth') this.buildMoon();
  }

  private buildMoon(): void {
    this.moonPivot = new THREE.Group();
    this.moonMesh = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ roughness: 1 }));
    this.moonMesh.name = 'moon';
    const hitMat = new THREE.MeshBasicMaterial();
    hitMat.visible = false;
    this.moonHit = new THREE.Mesh(sphereGeo, hitMat);
    this.moonHit.name = 'moon';
    this.moonPivot.add(this.moonMesh, this.moonHit);
    this.group.add(this.moonPivot);
  }

  /** Attach the generated moon texture (kept separate so Planet stays generic). */
  setMoonTexture(map: THREE.Texture): void {
    if (this.moonMesh) {
      (this.moonMesh.material as THREE.MeshStandardMaterial).map = map;
      (this.moonMesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }
  }

  update(simDays: number, scaleT: number): void {
    const r = displayRadius(this.def.id, this.def.facts.diameterKm, scaleT);
    this.currentRadius = r;
    this.sizeGroup.scale.setScalar(r);
    // pick-proxy floor: generous, but for Earth capped below the Moon's orbit
    // so the Moon stays clickable at true scale
    let hitFloor = 1.0;
    if (this.def.id === 'earth') {
      const moonDist = MOON_EXPLORER_DIST * (1 - scaleT) + (MOON_DIST_KM / AU_KM) * TRUE_UNITS_PER_AU * scaleT;
      hitFloor = Math.min(1.0, moonDist * 0.55);
    }
    this.hit.scale.setScalar(Math.max(r * 1.6, hitFloor));

    // keep the atmosphere's day side pointed at the Sun (which sits at origin)
    if (this.atmoMat) {
      const p = this.group.position;
      const len = p.length() || 1;
      (this.atmoMat.uniforms.uSunDir.value as THREE.Vector3)
        .set(-p.x / len, -p.y / len, -p.z / len);
    }

    // sidereal spin (negative rotationHours = retrograde)
    const spin = this.spinPhase + (simDays * 24 / this.def.facts.rotationHours) * Math.PI * 2;
    this.surface.rotation.y = spin;
    if (this.clouds) this.clouds.rotation.y = spin * 0.88; // clouds lag the surface

    if (this.moonPivot && this.moonMesh && this.moonHit) {
      const moonR = displayRadius('moon', MOON.facts.diameterKm, scaleT);
      const trueDist = (MOON_DIST_KM / AU_KM) * TRUE_UNITS_PER_AU;
      const dist = MOON_EXPLORER_DIST * (1 - scaleT) + trueDist * scaleT;
      const ang = (simDays / MOON_PERIOD_DAYS) * Math.PI * 2;
      this.moonMesh.position.set(Math.cos(ang) * dist, 0, -Math.sin(ang) * dist);
      this.moonMesh.scale.setScalar(moonR);
      // tidal lock: same face always toward Earth
      this.moonMesh.rotation.y = ang + Math.PI;
      this.moonHit.position.copy(this.moonMesh.position);
      this.moonHit.scale.setScalar(Math.max(moonR * 1.6, 0.3 * (1 - scaleT) + 0.1 * scaleT));
    }
  }

  get radius(): number {
    return this.currentRadius;
  }

  /** World position of the moon (valid after update). */
  moonWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.moonMesh ? this.moonMesh.getWorldPosition(out) : out.copy(this.group.position);
  }
}
