/**
 * Real bright stars + constellation stick figures.
 *
 * ~70 of the brightest stars with their real equatorial coordinates
 * (J2000, rounded to ~0.1h / 1°) and 15 well-known constellation figures.
 * Positions are converted equatorial → ecliptic to match the scene frame,
 * and the whole layer rides the camera-pinned sky group (optical infinity).
 * Good to about a degree - fine for stick figures, and honestly disclosed
 * in SOURCES.md. Named stars render brighter than the procedural backdrop.
 */
import * as THREE from 'three';
import { DEEP_SKY } from '../data/catalog/deepsky';

export interface StarDef {
  id: string;
  raH: number; // right ascension, hours
  decDeg: number;
  mag: number;
}

export const STARS: StarDef[] = [
  // Orion
  { id: 'betelgeuse', raH: 5.92, decDeg: 7.4, mag: 0.5 },
  { id: 'rigel', raH: 5.24, decDeg: -8.2, mag: 0.1 },
  { id: 'bellatrix', raH: 5.42, decDeg: 6.3, mag: 1.6 },
  { id: 'mintaka', raH: 5.53, decDeg: -0.3, mag: 2.2 },
  { id: 'alnilam', raH: 5.6, decDeg: -1.2, mag: 1.7 },
  { id: 'alnitak', raH: 5.68, decDeg: -1.9, mag: 1.8 },
  { id: 'saiph', raH: 5.8, decDeg: -9.7, mag: 2.1 },
  { id: 'meissa', raH: 5.58, decDeg: 9.9, mag: 3.4 },
  // Ursa Major (Big Dipper)
  { id: 'dubhe', raH: 11.06, decDeg: 61.8, mag: 1.8 },
  { id: 'merak', raH: 11.03, decDeg: 56.4, mag: 2.4 },
  { id: 'phecda', raH: 11.9, decDeg: 53.7, mag: 2.4 },
  { id: 'megrez', raH: 12.26, decDeg: 57.0, mag: 3.3 },
  { id: 'alioth', raH: 12.9, decDeg: 56.0, mag: 1.8 },
  { id: 'mizar', raH: 13.42, decDeg: 54.9, mag: 2.2 },
  { id: 'alkaid', raH: 13.79, decDeg: 49.3, mag: 1.9 },
  // Cassiopeia
  { id: 'caph', raH: 0.15, decDeg: 59.2, mag: 2.3 },
  { id: 'schedar', raH: 0.68, decDeg: 56.5, mag: 2.2 },
  { id: 'gammacas', raH: 0.95, decDeg: 60.7, mag: 2.4 },
  { id: 'ruchbah', raH: 1.43, decDeg: 60.2, mag: 2.7 },
  { id: 'segin', raH: 1.91, decDeg: 63.7, mag: 3.4 },
  // Cygnus
  { id: 'deneb', raH: 20.69, decDeg: 45.3, mag: 1.3 },
  { id: 'sadr', raH: 20.37, decDeg: 40.3, mag: 2.2 },
  { id: 'gienahcyg', raH: 20.77, decDeg: 34.0, mag: 2.5 },
  { id: 'deltacyg', raH: 19.75, decDeg: 45.1, mag: 2.9 },
  { id: 'albireo', raH: 19.51, decDeg: 28.0, mag: 3.1 },
  // Lyra
  { id: 'vega', raH: 18.62, decDeg: 38.8, mag: 0.0 },
  { id: 'sheliak', raH: 18.83, decDeg: 33.4, mag: 3.5 },
  { id: 'sulafat', raH: 18.98, decDeg: 32.7, mag: 3.2 },
  // Aquila
  { id: 'altair', raH: 19.85, decDeg: 8.9, mag: 0.8 },
  { id: 'tarazed', raH: 19.77, decDeg: 10.6, mag: 2.7 },
  { id: 'alshain', raH: 19.92, decDeg: 6.4, mag: 3.7 },
  // Scorpius
  { id: 'antares', raH: 16.49, decDeg: -26.4, mag: 1.0 },
  { id: 'graffias', raH: 16.09, decDeg: -19.8, mag: 2.6 },
  { id: 'dschubba', raH: 16.0, decDeg: -22.6, mag: 2.3 },
  { id: 'piscorpii', raH: 15.98, decDeg: -26.1, mag: 2.9 },
  { id: 'tauscorpii', raH: 16.6, decDeg: -28.2, mag: 2.8 },
  { id: 'epsilonsco', raH: 16.84, decDeg: -34.3, mag: 2.3 },
  { id: 'muscorpii', raH: 16.87, decDeg: -38.0, mag: 3.0 },
  { id: 'zetasco', raH: 16.91, decDeg: -42.4, mag: 3.6 },
  { id: 'sargas', raH: 17.62, decDeg: -43.0, mag: 1.9 },
  { id: 'shaula', raH: 17.56, decDeg: -37.1, mag: 1.6 },
  // Sagittarius (teapot)
  { id: 'kausaustralis', raH: 18.4, decDeg: -34.4, mag: 1.8 },
  { id: 'kausmedia', raH: 18.35, decDeg: -29.8, mag: 2.7 },
  { id: 'kausborealis', raH: 18.47, decDeg: -25.4, mag: 2.8 },
  { id: 'phisgr', raH: 18.76, decDeg: -27.0, mag: 3.2 },
  { id: 'nunki', raH: 18.92, decDeg: -26.3, mag: 2.0 },
  { id: 'ascella', raH: 19.04, decDeg: -29.9, mag: 2.6 },
  { id: 'tausgr', raH: 19.12, decDeg: -27.7, mag: 3.3 },
  // Leo
  { id: 'regulus', raH: 10.14, decDeg: 12.0, mag: 1.4 },
  { id: 'etaleo', raH: 10.12, decDeg: 16.8, mag: 3.5 },
  { id: 'algieba', raH: 10.33, decDeg: 19.8, mag: 2.0 },
  { id: 'zosma', raH: 11.24, decDeg: 20.5, mag: 2.6 },
  { id: 'chertan', raH: 11.24, decDeg: 15.4, mag: 3.3 },
  { id: 'denebola', raH: 11.82, decDeg: 14.6, mag: 2.1 },
  // Taurus
  { id: 'aldebaran', raH: 4.6, decDeg: 16.5, mag: 0.9 },
  { id: 'elnath', raH: 5.44, decDeg: 28.6, mag: 1.7 },
  { id: 'zetatau', raH: 5.63, decDeg: 21.1, mag: 3.0 },
  { id: 'gammatau', raH: 4.33, decDeg: 15.6, mag: 3.6 },
  // Gemini
  { id: 'castor', raH: 7.58, decDeg: 31.9, mag: 1.6 },
  { id: 'pollux', raH: 7.76, decDeg: 28.0, mag: 1.1 },
  { id: 'alhena', raH: 6.63, decDeg: 16.4, mag: 1.9 },
  { id: 'mebsuta', raH: 6.73, decDeg: 25.1, mag: 3.0 },
  { id: 'tejat', raH: 6.38, decDeg: 22.5, mag: 2.9 },
  // Canis Major
  { id: 'sirius', raH: 6.75, decDeg: -16.7, mag: -1.46 },
  { id: 'mirzam', raH: 6.38, decDeg: -18.0, mag: 2.0 },
  { id: 'adhara', raH: 6.98, decDeg: -29.0, mag: 1.5 },
  { id: 'wezen', raH: 7.14, decDeg: -26.4, mag: 1.8 },
  { id: 'aludra', raH: 7.4, decDeg: -29.3, mag: 2.5 },
  // Auriga
  { id: 'capella', raH: 5.28, decDeg: 46.0, mag: 0.1 },
  { id: 'menkalinan', raH: 6.0, decDeg: 44.9, mag: 1.9 },
  { id: 'thetaaur', raH: 5.99, decDeg: 37.2, mag: 2.6 },
  { id: 'hassaleh', raH: 4.95, decDeg: 33.2, mag: 2.7 },
  { id: 'almaaz', raH: 5.03, decDeg: 43.8, mag: 3.0 },
  // Pegasus square + Andromeda chain
  { id: 'markab', raH: 23.08, decDeg: 15.2, mag: 2.5 },
  { id: 'scheat', raH: 23.06, decDeg: 28.1, mag: 2.4 },
  { id: 'algenib', raH: 0.22, decDeg: 15.2, mag: 2.8 },
  { id: 'alpheratz', raH: 0.14, decDeg: 29.1, mag: 2.1 },
  { id: 'mirach', raH: 1.16, decDeg: 35.6, mag: 2.1 },
  { id: 'almach', raH: 2.06, decDeg: 42.3, mag: 2.1 },
  // Crux
  { id: 'acrux', raH: 12.44, decDeg: -63.1, mag: 0.8 },
  { id: 'mimosa', raH: 12.79, decDeg: -59.7, mag: 1.3 },
  { id: 'gacrux', raH: 12.52, decDeg: -57.1, mag: 1.6 },
  { id: 'deltacru', raH: 12.25, decDeg: -58.7, mag: 2.8 },
  // bright loners that anchor the sky
  { id: 'arcturus', raH: 14.26, decDeg: 19.2, mag: -0.05 },
  { id: 'spica', raH: 13.42, decDeg: -11.2, mag: 1.0 },
  { id: 'canopus', raH: 6.4, decDeg: -52.7, mag: -0.74 },
  { id: 'achernar', raH: 1.63, decDeg: -57.2, mag: 0.46 },
  { id: 'fomalhaut', raH: 22.96, decDeg: -29.6, mag: 1.2 },
  { id: 'procyon', raH: 7.66, decDeg: 5.2, mag: 0.4 },
  { id: 'alphacen', raH: 14.66, decDeg: -60.8, mag: -0.27 },
  { id: 'hadar', raH: 14.06, decDeg: -60.4, mag: 0.6 },
  { id: 'polaris', raH: 2.53, decDeg: 89.3, mag: 2.0 },
];

export interface Figure {
  name: string;
  paths: string[][]; // sequences of star ids drawn as polylines
}

export const FIGURES: Figure[] = [
  {
    name: 'Orion',
    paths: [
      ['meissa', 'betelgeuse', 'alnitak', 'saiph'],
      ['meissa', 'bellatrix', 'mintaka', 'rigel'],
      ['mintaka', 'alnilam', 'alnitak'],
    ],
  },
  {
    name: 'Ursa Major',
    paths: [
      ['dubhe', 'merak', 'phecda', 'megrez', 'dubhe'],
      ['megrez', 'alioth', 'mizar', 'alkaid'],
    ],
  },
  { name: 'Cassiopeia', paths: [['caph', 'schedar', 'gammacas', 'ruchbah', 'segin']] },
  {
    name: 'Cygnus',
    paths: [
      ['deneb', 'sadr', 'albireo'],
      ['deltacyg', 'sadr', 'gienahcyg'],
    ],
  },
  { name: 'Lyra', paths: [['vega', 'sheliak', 'sulafat', 'vega']] },
  { name: 'Aquila', paths: [['tarazed', 'altair', 'alshain']] },
  {
    name: 'Scorpius',
    paths: [
      ['graffias', 'dschubba', 'antares', 'tauscorpii', 'epsilonsco', 'muscorpii', 'zetasco', 'sargas', 'shaula'],
      ['piscorpii', 'dschubba'],
    ],
  },
  {
    name: 'Sagittarius',
    paths: [
      ['kausaustralis', 'kausmedia', 'kausborealis', 'phisgr', 'nunki', 'ascella', 'tausgr'],
      ['kausmedia', 'phisgr'],
      ['kausaustralis', 'ascella'],
    ],
  },
  {
    name: 'Leo',
    paths: [
      ['regulus', 'etaleo', 'algieba', 'zosma', 'denebola', 'chertan', 'regulus'],
    ],
  },
  {
    name: 'Taurus',
    paths: [
      ['zetatau', 'aldebaran', 'gammatau', 'elnath'],
    ],
  },
  {
    name: 'Gemini',
    paths: [
      ['castor', 'pollux'],
      ['castor', 'mebsuta', 'tejat'],
      ['pollux', 'alhena'],
    ],
  },
  {
    name: 'Canis Major',
    paths: [
      ['sirius', 'mirzam'],
      ['sirius', 'wezen', 'adhara'],
      ['wezen', 'aludra'],
    ],
  },
  {
    name: 'Auriga',
    paths: [['capella', 'menkalinan', 'thetaaur', 'elnath', 'hassaleh', 'almaaz', 'capella']],
  },
  {
    name: 'Pegasus',
    paths: [
      ['markab', 'scheat', 'alpheratz', 'algenib', 'markab'],
      ['alpheratz', 'mirach', 'almach'],
    ],
  },
  { name: 'Crux', paths: [['acrux', 'gacrux'], ['mimosa', 'deltacru']] },
];

const OBLIQUITY = 23.4368 * (Math.PI / 180);
const SKY_R = 5600;

/** Equatorial (RA/Dec) → scene direction (ecliptic frame, y up). */
function starDirection(raH: number, decDeg: number, out: THREE.Vector3): THREE.Vector3 {
  const ra = (raH / 24) * Math.PI * 2;
  const dec = decDeg * (Math.PI / 180);
  const xEq = Math.cos(dec) * Math.cos(ra);
  const yEq = Math.cos(dec) * Math.sin(ra);
  const zEq = Math.sin(dec);
  const yEcl = yEq * Math.cos(OBLIQUITY) + zEq * Math.sin(OBLIQUITY);
  const zEcl = -yEq * Math.sin(OBLIQUITY) + zEq * Math.cos(OBLIQUITY);
  return out.set(xEq, zEcl, -yEcl);
}

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  varying float vGlow;
  uniform float uPr;
  void main() {
    vGlow = aSize;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPr;
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  precision highp float;
  varying float vGlow;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    float a = smoothstep(1.0, 0.2, d);
    gl_FragColor = vec4(vec3(0.78, 0.84, 0.95), a * 0.8);
  }
`;

export interface FigureLabel {
  name: string;
  dir: THREE.Vector3; // unit direction; project at camera + dir * SKY_R
}

export class Constellations {
  readonly group = new THREE.Group();
  readonly labels: FigureLabel[] = [];
  /** Deep-sky object markers (own layer, off by default). */
  readonly dsoLabels: FigureLabel[] = [];
  private lineMat: THREE.LineBasicMaterial;
  private lines!: THREE.LineSegments;
  private dsoPoints!: THREE.Points;
  linesVisible = true;
  dsoVisible = false;

  constructor() {
    const byId = new Map(STARS.map((s) => [s.id, s]));
    const dir = new THREE.Vector3();

    // named bright stars, slightly stronger than the procedural backdrop
    const pos = new Float32Array(STARS.length * 3);
    const size = new Float32Array(STARS.length);
    STARS.forEach((s, i) => {
      starDirection(s.raH, s.decDeg, dir).multiplyScalar(SKY_R);
      pos[i * 3] = dir.x;
      pos[i * 3 + 1] = dir.y;
      pos[i * 3 + 2] = dir.z;
      size[i] = THREE.MathUtils.clamp(4.6 - s.mag * 0.95, 1.6, 6.2);
    });
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: { uPr: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    this.group.add(stars);

    // stick figures
    const linePts: number[] = [];
    const centroid = new THREE.Vector3();
    for (const fig of FIGURES) {
      centroid.set(0, 0, 0);
      let n = 0;
      for (const path of fig.paths) {
        for (let i = 0; i < path.length - 1; i++) {
          const a = byId.get(path[i]);
          const b = byId.get(path[i + 1]);
          if (!a || !b) continue;
          starDirection(a.raH, a.decDeg, dir).multiplyScalar(SKY_R * 0.995);
          linePts.push(dir.x, dir.y, dir.z);
          centroid.add(dir);
          n++;
          starDirection(b.raH, b.decDeg, dir).multiplyScalar(SKY_R * 0.995);
          linePts.push(dir.x, dir.y, dir.z);
          centroid.add(dir);
          n++;
        }
      }
      if (n > 0) {
        this.labels.push({ name: fig.name, dir: centroid.divideScalar(n).normalize().clone() });
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePts), 3));
    this.lineMat = new THREE.LineBasicMaterial({
      color: 0x39597f,
      transparent: true,
      opacity: 0.4,
    });
    this.lines = new THREE.LineSegments(lineGeo, this.lineMat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = -9;
    this.group.add(this.lines);

    // deep-sky markers: soft diffuse glows at the real J2000 directions.
    // Directions are real; the objects themselves lie far beyond the sphere.
    const dsoPos = new Float32Array(DEEP_SKY.length * 3);
    const dsoSize = new Float32Array(DEEP_SKY.length);
    DEEP_SKY.forEach((o, i) => {
      starDirection(o.raH, o.decDeg, dir).multiplyScalar(SKY_R * 0.99);
      dsoPos[i * 3] = dir.x;
      dsoPos[i * 3 + 1] = dir.y;
      dsoPos[i * 3 + 2] = dir.z;
      dsoSize[i] = o.type.includes('galaxy') ? 10 : o.type.includes('cluster') ? 8 : 9;
      this.dsoLabels.push({
        name: o.m ? `${o.m} ${o.name}` : o.name,
        dir: dir.clone().normalize(),
      });
    });
    const dsoGeo = new THREE.BufferGeometry();
    dsoGeo.setAttribute('position', new THREE.BufferAttribute(dsoPos, 3));
    dsoGeo.setAttribute('aSize', new THREE.BufferAttribute(dsoSize, 1));
    const dsoMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying float vGlow;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(vec3(0.62, 0.72, 0.92), a * a * 0.55);
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
    const stars = this.group.children[0] as THREE.Points;
    (stars.material as THREE.ShaderMaterial).uniforms.uPr.value = pr;
    (this.dsoPoints.material as THREE.ShaderMaterial).uniforms.uPr.value = pr;
  }

  /** The real bright stars always shine; the toggle governs figures+names. */
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
