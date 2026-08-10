/** Deep-space backdrop: ~7000 individually tinted stars + a Milky Way band. */
import * as THREE from 'three';
import { mulberry32 } from './noise';

const SKY_RADIUS = 6000;

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vTwinkle;
  uniform float uTime;
  void main() {
    vColor = aColor;
    vTwinkle = 0.82 + 0.18 * sin(uTime * 0.9 + position.x * 0.02 + position.y * 0.013);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize;
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    float a = smoothstep(1.0, 0.25, d);
    gl_FragColor = vec4(vColor * vTwinkle, a);
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

  constructor(milkyWay: THREE.CanvasTexture) {
    const rnd = mulberry32(2024);
    const count = 7000;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const color = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // uniform on sphere, with extra density near the galactic band (y ~ 0 after tilt)
      let x = 0, y = 0, z = 0, len = 0;
      do {
        x = rnd() * 2 - 1;
        y = rnd() * 2 - 1;
        z = rnd() * 2 - 1;
        len = Math.hypot(x, y, z);
      } while (len > 1 || len < 1e-4);
      if (rnd() < 0.35) y *= 0.35; // concentrate a share of stars toward the band
      const inv = SKY_RADIUS / Math.hypot(x, y, z);
      pos[i * 3] = x * inv;
      pos[i * 3 + 1] = y * inv;
      pos[i * 3 + 2] = z * inv;

      const mag = Math.pow(rnd(), 3);
      size[i] = 1.0 + mag * 3.2;
      const tint = STAR_COLORS[Math.floor(Math.pow(rnd(), 1.4) * STAR_COLORS.length)];
      const bright = 0.45 + mag * 0.55;
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
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(geo, this.starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -10;
    this.group.add(stars);

    const mwGeo = new THREE.SphereGeometry(SKY_RADIUS * 0.98, 48, 32);
    const mwMat = new THREE.MeshBasicMaterial({
      map: milkyWay,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const mw = new THREE.Mesh(mwGeo, mwMat);
    mw.rotation.set(0.45, 0.2, 0.35); // tilt the band across the sky
    mw.renderOrder = -11;
    this.group.add(mw);
  }

  update(elapsed: number): void {
    this.starMat.uniforms.uTime.value = elapsed;
  }
}
