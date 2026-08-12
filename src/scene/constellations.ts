/**
 * The real sky: every naked-eye star and all 88 IAU constellation figures.
 *
 * Stars come from the generated catalog (Yale BSC / HYG via d3-celestial):
 * 5,044 entries to magnitude 6.0, drawn at a size and brightness set by
 * their real visual magnitude and tinted by the blackbody colour of their
 * measured B-V index. Constellation figures are the traditional stick
 * figures at their J2000 coordinates. Positions are converted equatorial →
 * ecliptic to match the scene frame, and the whole layer rides the
 * camera-pinned sky group (optical infinity).
 */
import * as THREE from 'three';
import { DEEP_SKY } from '../data/catalog/deepsky';
import {
  FIGURES,
  STAR_COUNT,
  STAR_DEC,
  STAR_MAG,
  STAR_RA,
  STAR_TEMP,
  tempToRGB,
} from '../data/catalog/skydata';

const OBLIQUITY = 23.4368 * (Math.PI / 180);
const SKY_R = 5600;
const DEG = Math.PI / 180;

/** Equatorial (RA/Dec in degrees) → scene direction (ecliptic frame, y up). */
export function starDirection(raDeg: number, decDeg: number, out: THREE.Vector3): THREE.Vector3 {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const xEq = Math.cos(dec) * Math.cos(ra);
  const yEq = Math.cos(dec) * Math.sin(ra);
  const zEq = Math.sin(dec);
  const yEcl = yEq * Math.cos(OBLIQUITY) + zEq * Math.sin(OBLIQUITY);
  const zEcl = -yEq * Math.sin(OBLIQUITY) + zEq * Math.cos(OBLIQUITY);
  return out.set(xEq, zEcl, -yEcl);
}

/** Screen size in points for a star of this visual magnitude. */
export function magnitudeSize(mag: number): number {
  return THREE.MathUtils.clamp(4.4 - mag * 0.56, 0.75, 5.6);
}

/** Rendered opacity for a star of this visual magnitude. */
export function magnitudeAlpha(mag: number): number {
  return THREE.MathUtils.clamp(1.08 - mag * 0.125, 0.16, 1);
}

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uPr;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPr;
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    float a = smoothstep(1.0, 0.15, d);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

export interface FigureLabel {
  name: string;
  dir: THREE.Vector3; // unit direction; project at camera + dir * SKY_R
  /** 1 = prominent constellation, 3 = faint - used to thin labels out. */
  rank: number;
}

export class Constellations {
  readonly group = new THREE.Group();
  readonly labels: FigureLabel[] = [];
  /** Deep-sky object markers (own layer, off by default). */
  readonly dsoLabels: FigureLabel[] = [];
  private lineMat: THREE.LineBasicMaterial;
  private stars: THREE.Points;
  private lines!: THREE.LineSegments;
  private dsoPoints!: THREE.Points;
  linesVisible = true;
  dsoVisible = false;

  constructor() {
    const dir = new THREE.Vector3();

    // ---- every naked-eye star, sized and tinted by its own measurements
    const pos = new Float32Array(STAR_COUNT * 3);
    const size = new Float32Array(STAR_COUNT);
    const alpha = new Float32Array(STAR_COUNT);
    const color = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      starDirection(STAR_RA[i], STAR_DEC[i], dir).multiplyScalar(SKY_R);
      pos[i * 3] = dir.x;
      pos[i * 3 + 1] = dir.y;
      pos[i * 3 + 2] = dir.z;
      size[i] = magnitudeSize(STAR_MAG[i]);
      alpha[i] = magnitudeAlpha(STAR_MAG[i]);
      const [r, g, b] = tempToRGB(STAR_TEMP[i]);
      // lift toward white: the eye sees little colour in faint point sources
      color[i * 3] = (r / 255) * 0.55 + 0.45;
      color[i * 3 + 1] = (g / 255) * 0.55 + 0.45;
      color[i * 3 + 2] = (b / 255) * 0.55 + 0.45;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    starGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    const starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uPr: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(starGeo, starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.group.add(this.stars);

    // ---- the 88 stick figures
    const linePts: number[] = [];
    for (const fig of FIGURES) {
      for (const seg of fig.segments) {
        for (let i = 0; i + 3 < seg.length; i += 2) {
          starDirection(seg[i], seg[i + 1], dir).multiplyScalar(SKY_R * 0.995);
          linePts.push(dir.x, dir.y, dir.z);
          starDirection(seg[i + 2], seg[i + 3], dir).multiplyScalar(SKY_R * 0.995);
          linePts.push(dir.x, dir.y, dir.z);
        }
      }
      starDirection(fig.labelRa, fig.labelDec, dir);
      this.labels.push({ name: fig.name, dir: dir.clone().normalize(), rank: fig.rank });
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePts), 3));
    this.lineMat = new THREE.LineBasicMaterial({
      color: 0x39597f,
      transparent: true,
      opacity: 0.34,
    });
    this.lines = new THREE.LineSegments(lineGeo, this.lineMat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = -9;
    this.group.add(this.lines);

    // ---- deep-sky markers: soft diffuse glows at the real J2000 directions.
    // Directions are real; the objects themselves lie far beyond the sphere.
    const dsoPos = new Float32Array(DEEP_SKY.length * 3);
    const dsoSize = new Float32Array(DEEP_SKY.length);
    const dsoAlpha = new Float32Array(DEEP_SKY.length);
    const dsoColor = new Float32Array(DEEP_SKY.length * 3);
    DEEP_SKY.forEach((o, i) => {
      starDirection(o.raH * 15, o.decDeg, dir).multiplyScalar(SKY_R * 0.99);
      dsoPos[i * 3] = dir.x;
      dsoPos[i * 3 + 1] = dir.y;
      dsoPos[i * 3 + 2] = dir.z;
      dsoSize[i] = o.type.includes('galaxy') ? 10 : o.type.includes('cluster') ? 8 : 9;
      dsoAlpha[i] = 0.55;
      dsoColor[i * 3] = 0.62;
      dsoColor[i * 3 + 1] = 0.72;
      dsoColor[i * 3 + 2] = 0.92;
      this.dsoLabels.push({
        name: o.m ? `${o.m} ${o.name}` : o.name,
        dir: dir.clone().normalize(),
        rank: 1,
      });
    });
    const dsoGeo = new THREE.BufferGeometry();
    dsoGeo.setAttribute('position', new THREE.BufferAttribute(dsoPos, 3));
    dsoGeo.setAttribute('aSize', new THREE.BufferAttribute(dsoSize, 1));
    dsoGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dsoAlpha, 1));
    dsoGeo.setAttribute('aColor', new THREE.BufferAttribute(dsoColor, 3));
    const dsoMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(vColor, a * a * vAlpha);
        }
      `,
      uniforms: { uPr: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dsoPoints = new THREE.Points(dsoGeo, dsoMat);
    this.dsoPoints.frustumCulled = false;
    this.dsoPoints.renderOrder = -9;
    this.dsoPoints.visible = false;
    this.group.add(this.dsoPoints);
  }

  setPixelRatio(pr: number): void {
    (this.stars.material as THREE.ShaderMaterial).uniforms.uPr.value = pr;
    (this.dsoPoints.material as THREE.ShaderMaterial).uniforms.uPr.value = pr;
  }

  /** The real stars always shine; the toggle governs figures + names. */
  setVisible(v: boolean): void {
    this.linesVisible = v;
    this.lines.visible = v;
  }

  setDeepSkyVisible(v: boolean): void {
    this.dsoVisible = v;
    this.dsoPoints.visible = v;
  }
}

export { SKY_R as CONSTELLATION_SKY_R };
