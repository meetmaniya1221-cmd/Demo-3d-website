/**
 * Deep-space backdrop: a dense, galactically-distributed star field under the
 * real Milky Way.
 *
 * Both halves share one model. The band is evaluated in galactic coordinates
 * (see scene/galaxy), and the filler stars are scattered by the same density
 * law - so the crowding toward the plane and the thinning toward the poles are
 * the same phenomenon rather than two effects tuned separately to match. The
 * catalogued naked-eye stars are drawn on top of this by scene/constellations;
 * these are the faint multitude behind them.
 */
import * as THREE from 'three';
import { mulberry32 } from './noise';
import { galacticStarDensity, MilkyWay, sceneToGalacticMatrix } from './galaxy';
import { renderBudget, qualityTier } from './budget';

const SKY_RADIUS = 6000;

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vTwinkle;
  uniform float uTime;
  uniform float uPr;
  void main() {
    vColor = aColor;
    vTwinkle = 0.82 + 0.18 * sin(uTime * 0.9 + position.x * 0.02 + position.y * 0.013);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPr;
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    float a = smoothstep(1.0, 0.25, d);
    gl_FragColor = vec4(clamp(vColor * vTwinkle, 0.0, 1.5), a);
  }
`;

/** Rough blackbody tints, hot to cool. */
const STAR_COLORS = [
  [0.62, 0.71, 1.0],
  [0.75, 0.82, 1.0],
  [0.92, 0.94, 1.0],
  [1.0, 0.97, 0.9],
  [1.0, 0.88, 0.7],
  [1.0, 0.78, 0.58],
];

export class Sky {
  readonly group = new THREE.Group();
  private starMat: THREE.ShaderMaterial;
  private milkyWay!: MilkyWay;

  constructor(textureBase = '/') {
    const rnd = mulberry32(2024);
    // Scene directions come out of the galactic frame, so build the inverse
    // once: the matrix is orthonormal, so its transpose is its inverse.
    const galToScene = sceneToGalacticMatrix().transpose();
    const dir = new THREE.Vector3();
    // These are the faint background stars that give the galactic band its
    // texture, not the real catalogue - which is drawn separately and is never
    // thinned. They are the cheapest points on the screen to give up, and 26k
    // additive sprites is a lot to ask of a phone.
    // The survey map now carries the background star field, so these are here
    // only for the crispness a texture cannot give: real point sources that
    // stay sharp when a cockpit window magnifies a patch of sky. At the old
    // count they doubled up with the map and read as sensor grain over the
    // whole sky.
    const count = Math.round(11000 * renderBudget().particleScale);
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const color = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Rejection-sample a galactic direction against the disc density, with a
      // floor so the sky away from the plane is thin rather than empty. Every
      // direction is drawn uniformly on the sphere first, so no pole is
      // over-sampled the way naive spherical coordinates would.
      let gx = 0, gy = 0, gz = 0;
      for (let tries = 0; tries < 24; tries++) {
        let x = 0, y = 0, z = 0, len = 0;
        do {
          x = rnd() * 2 - 1;
          y = rnd() * 2 - 1;
          z = rnd() * 2 - 1;
          len = Math.hypot(x, y, z);
        } while (len > 1 || len < 1e-4);
        gx = x / len;
        gy = y / len;
        gz = z / len;
        const p = 0.16 + 0.84 * galacticStarDensity(gx, gy, gz);
        if (rnd() < p) break;
      }
      dir.set(gx, gy, gz).applyMatrix3(galToScene).multiplyScalar(SKY_RADIUS);
      pos[i * 3] = dir.x;
      pos[i * 3 + 1] = dir.y;
      pos[i * 3 + 2] = dir.z;

      // A steep magnitude distribution: a great many faint stars, a handful of
      // bright ones. Uniform sizes are what make a star field read as noise.
      const mag = Math.pow(rnd(), 3.4);
      size[i] = 0.7 + mag * 3.0;
      const tint = STAR_COLORS[Math.floor(Math.pow(rnd(), 1.4) * STAR_COLORS.length)];
      const bright = 0.34 + mag * 0.66;
      color[i * 3] = tint[0] * bright;
      color[i * 3 + 1] = tint[1] * bright;
      color[i * 3 + 2] = tint[2] * bright;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));

    this.starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uTime: { value: 0 }, uPr: { value: Math.min(2, window.devicePixelRatio || 1) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(geo, this.starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -10;
    // no rotation: the positions are already in scene space, carrying the real
    // galactic orientation rather than a tilt chosen to look right
    this.group.add(stars);

    // The survey map is the sky's structure; the tier decides only how finely
    // it is resolved and how much memory the bake takes.
    const tier = qualityTier();
    this.milkyWay = new MilkyWay({
      base: textureBase,
      quality: tier === 'high' ? 'high' : tier === 'mid' ? 'medium' : 'low',
      // The survey map is a long exposure; shown at full strength it is
      // brighter than the solar system in front of it. This is the exposure,
      // not a change to the data - every structure stays exactly where and
      // how the survey recorded it.
      intensity: 0.62,
    });
  }

  /** Diagnostic: drop the Milky Way so a capture can be differenced against
   *  one with it, which is how the compositing test proves it contributes
   *  nothing inside an opaque body's silhouette. */
  setMilkyWayVisible(v: boolean): void {
    this.milkyWay.setVisible(v);
  }

  update(elapsed: number): void {
    this.starMat.uniforms.uTime.value = elapsed;
    this.milkyWay.update(elapsed);
  }

  /**
   * Bake the galactic band once the renderer exists, and hand over the scene:
   * the Milky Way becomes that scene's background, which is what keeps it
   * behind every object at any distance.
   */
  bake(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    this.milkyWay.attach(renderer, scene);
  }

  /** The baked band as a cubemap, once it exists. */
  get milkyWayCubemap(): THREE.CubeTexture | null {
    return this.milkyWay.cubemap;
  }

  setPixelRatio(pr: number): void {
    this.starMat.uniforms.uPr.value = pr;
  }
}
