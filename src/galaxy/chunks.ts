/**
 * Near-field star streaming: the LOD level between "galaxy as a cloud of
 * light" and "star as a destination".
 *
 * Space around the camera is divided into 40-ly cells. Cells within range
 * get individually generated stars - deterministically seeded from the cell
 * index, so a star you discover has the same position, class and name every
 * session. Each cell is one THREE.Points whose vertices are stored relative
 * to the cell's own origin; the cell group is positioned camera-relative in
 * double precision each frame, so a star 27,000 ly from the galactic centre
 * still renders rock-steady from two AU away.
 *
 * The star count per cell follows the model's density law (0.1 stars/pc³
 * near the Sun, a million times that in the nuclear cluster), capped per
 * cell for the GPU's sake - the HUD quotes the physical figure while the
 * render shows a fair sample of it.
 *
 * Above a few ly/s the ship crosses cells faster than any generator could
 * fill them; individual stars are genuinely unresolvable at those speeds,
 * so the cells fade out and a camera-local streak field carries the sense
 * of motion instead.
 */
import * as THREE from 'three';
import {
  STAR_CLASSES,
  YOUNG_CLASSES,
  armBoostAt,
  chunkRng,
  densityAt,
  drawClass,
  starDesignation,
  type GalaxyParams,
} from './model';
import { Vec3d, galToScene } from './units';

export const CELL_LY = 40;
const RANGE_CELLS = 3; // cells kept alive in each direction
const MAX_STARS_PER_CELL = 320;
const LY3_PER_PC3 = 34.7;

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  uniform float uPr;
  uniform float uFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(length(mv.xyz), 1e-6);
    // apparent size falls off with distance; clamp both ends and push the
    // lost brightness into colour so the falloff reads as dimming. The max
    // is deliberately modest: a sky where every near star balloons reads
    // as noise, and hierarchy - a few readable stars over a deep field -
    // is what makes it read as space
    float size = aSize * 46.0 / dist;
    float clamped = clamp(size, 0.7, 5.2);
    float k = clamp(size / clamped, 0.0, 1.0);
    vColor = aColor * (0.22 + 0.78 * k * k) * uFade;
    gl_PointSize = clamped * uPr;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p) * 2.0;
    float a = smoothstep(1.0, 0.18, d);
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

export interface ChunkStar {
  designation: string;
  cls: string;
  /** Galactocentric position, ly. */
  pos: Vec3d;
  lum: number;
}

interface Cell {
  key: string;
  cx: number;
  cy: number;
  cz: number;
  group: THREE.Group;
  points: THREE.Points | null;
  stars: ChunkStar[];
}

export class ChunkField {
  readonly root = new THREE.Group();
  private cells = new Map<string, Cell>();
  private material: THREE.ShaderMaterial;
  private queue: Array<[number, number, number]> = [];
  private queued = new Set<string>();
  private lastCam = { cx: NaN, cy: NaN, cz: NaN };
  private params: GalaxyParams;
  private seed: number;
  private tmp = { x: 0, y: 0, z: 0 };

  constructor(params: GalaxyParams) {
    this.params = params;
    this.seed = params.seed ^ 0x5f356495;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uPr: { value: Math.min(2, window.devicePixelRatio || 1) },
        uFade: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.root.renderOrder = -4;
  }

  setPixelRatio(pr: number): void {
    this.material.uniforms.uPr.value = pr;
  }

  /** All generated stars within `radius` ly of a point - the scanner's view. */
  starsNear(pos: Vec3d, radius: number): ChunkStar[] {
    const out: ChunkStar[] = [];
    for (const cell of this.cells.values()) {
      for (const s of cell.stars) {
        if (s.pos.distanceTo(pos) <= radius) out.push(s);
      }
    }
    out.sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos));
    return out;
  }

  /**
   * Advance streaming. `speed` in ly/s decides whether individual stars are
   * even resolvable; past ~2 ly/s the whole layer fades and generation
   * pauses (the warp streak field takes over outside this class).
   */
  update(camPos: Vec3d, speed: number): void {
    const fade = THREE.MathUtils.clamp(1 - (speed - 1.2) / 2.5, 0, 1);
    this.material.uniforms.uFade.value = fade;
    if (fade <= 0.01) {
      // drop the queue so a warp exit starts fresh around the new position
      this.queue.length = 0;
      this.queued.clear();
      return;
    }

    const cx = Math.floor(camPos.x / CELL_LY);
    const cy = Math.floor(camPos.y / CELL_LY);
    const cz = Math.floor(camPos.z / CELL_LY);

    if (cx !== this.lastCam.cx || cy !== this.lastCam.cy || cz !== this.lastCam.cz) {
      this.lastCam = { cx, cy, cz };
      // retire far cells
      for (const [key, cell] of this.cells) {
        if (
          Math.abs(cell.cx - cx) > RANGE_CELLS + 1 ||
          Math.abs(cell.cy - cy) > RANGE_CELLS + 1 ||
          Math.abs(cell.cz - cz) > RANGE_CELLS + 1
        ) {
          this.disposeCell(cell);
          this.cells.delete(key);
        }
      }
      // queue missing cells, nearest first
      const wanted: Array<[number, number, number, number]> = [];
      for (let dx = -RANGE_CELLS; dx <= RANGE_CELLS; dx++) {
        for (let dy = -RANGE_CELLS; dy <= RANGE_CELLS; dy++) {
          for (let dz = -RANGE_CELLS; dz <= RANGE_CELLS; dz++) {
            const key = `${cx + dx},${cy + dy},${cz + dz}`;
            if (this.cells.has(key) || this.queued.has(key)) continue;
            wanted.push([cx + dx, cy + dy, cz + dz, dx * dx + dy * dy + dz * dz]);
          }
        }
      }
      wanted.sort((a, b) => a[3] - b[3]);
      for (const [x, y, z] of wanted) {
        this.queue.push([x, y, z]);
        this.queued.add(`${x},${y},${z}`);
      }
    }

    // asynchronous generation: a fixed budget per frame keeps the worst
    // case (crossing a cell boundary in the nuclear cluster) hitch-free
    for (let i = 0; i < 3 && this.queue.length > 0; i++) {
      const [x, y, z] = this.queue.shift()!;
      this.queued.delete(`${x},${y},${z}`);
      if (
        Math.abs(x - cx) <= RANGE_CELLS &&
        Math.abs(y - cy) <= RANGE_CELLS &&
        Math.abs(z - cz) <= RANGE_CELLS
      ) {
        this.buildCell(x, y, z);
      }
    }

    // camera-relative placement in double precision - the point of it all
    for (const cell of this.cells.values()) {
      const ox = cell.cx * CELL_LY - camPos.x;
      const oy = cell.cy * CELL_LY - camPos.y;
      const oz = cell.cz * CELL_LY - camPos.z;
      galToScene(ox, oy, oz, this.tmp);
      cell.group.position.set(this.tmp.x, this.tmp.y, this.tmp.z);
    }
  }

  private buildCell(cx: number, cy: number, cz: number): void {
    const key = `${cx},${cy},${cz}`;
    const rnd = chunkRng(this.seed, cx, cy, cz);
    const baseX = cx * CELL_LY;
    const baseY = cy * CELL_LY;
    const baseZ = cz * CELL_LY;
    const centreDensity = densityAt(
      baseX + CELL_LY / 2,
      baseY + CELL_LY / 2,
      baseZ + CELL_LY / 2,
      this.params,
    );
    const starsPerPc3 = 0.1 * centreDensity;
    const expected = (starsPerPc3 / LY3_PER_PC3) * CELL_LY * CELL_LY * CELL_LY;
    const count = Math.min(MAX_STARS_PER_CELL, Math.round(expected * (0.8 + rnd() * 0.4)));

    const cell: Cell = { key, cx, cy, cz, group: new THREE.Group(), points: null, stars: [] };
    this.cells.set(key, cell);
    this.root.add(cell.group);
    if (count <= 0) return;

    // does this cell sit in an arm? then a slice of its stars are young/blue
    const r = Math.hypot(baseX, baseY);
    const youngFraction =
      0.1 * Math.min(1, armBoostAt(r, Math.atan2(baseY, baseX), this.params));

    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const scenePos = { x: 0, y: 0, z: 0 };

    for (let i = 0; i < count; i++) {
      const lx = rnd() * CELL_LY;
      const ly = rnd() * CELL_LY;
      const lz = rnd() * CELL_LY;
      const cls = drawClass(rnd, rnd() < youngFraction ? YOUNG_CLASSES : STAR_CLASSES);
      // vertices are cell-relative; the group carries the world offset
      galToScene(lx, ly, lz, scenePos);
      pos[i * 3] = scenePos.x;
      pos[i * 3 + 1] = scenePos.y;
      pos[i * 3 + 2] = scenePos.z;
      // steep magnitude hierarchy: most stars stay faint points, a handful
      // of giants get to be individually readable
      const lum = cls.lum * (0.55 + rnd() * 0.9);
      size[i] = 0.55 + Math.pow(Math.min(lum, 500) / 500, 0.45) * 3.0;
      const jitter = 0.92 + rnd() * 0.16;
      color[i * 3] = cls.color[0] * jitter;
      color[i * 3 + 1] = cls.color[1] * jitter;
      color[i * 3 + 2] = cls.color[2];
      cell.stars.push({
        designation: starDesignation(cx, cy, cz, i),
        cls: cls.cls,
        pos: new Vec3d(baseX + lx, baseY + ly, baseZ + lz),
        lum,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    const points = new THREE.Points(geo, this.material);
    points.frustumCulled = false;
    points.renderOrder = -4;
    cell.points = points;
    cell.group.add(points);
  }

  private disposeCell(cell: Cell): void {
    if (cell.points) cell.points.geometry.dispose();
    this.root.remove(cell.group);
  }

  dispose(): void {
    for (const cell of this.cells.values()) this.disposeCell(cell);
    this.cells.clear();
    this.material.dispose();
  }
}

// ------------------------------------------------------------ warp streaks

const STREAK_COUNT = 900;

const STREAK_VERT = /* glsl */ `
  attribute vec3 aSeed;
  varying float vBright;
  uniform float uPr;
  uniform float uPhase;
  uniform float uStrength;
  void main() {
    // each particle lives in a camera-local tube and recycles along -z as
    // uPhase advances; stars "flow past" without any real geometry moving
    float span = 140.0;
    float zz = mod(aSeed.z * span + uPhase, span) - span * 0.72;
    vec3 p = vec3((aSeed.x - 0.5) * 90.0, (aSeed.y - 0.5) * 90.0, zz);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = max(length(mv.xyz), 1e-4);
    gl_PointSize = clamp(120.0 / dist, 0.6, 3.4) * uPr;
    vBright = uStrength * smoothstep(-span * 0.72, -span * 0.2, zz);
    gl_Position = projectionMatrix * mv;
  }
`;

const STREAK_FRAG = /* glsl */ `
  precision highp float;
  varying float vBright;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float a = smoothstep(1.0, 0.2, length(p) * 2.0);
    gl_FragColor = vec4(vec3(0.75, 0.83, 1.0) * a * vBright, 1.0);
  }
`;

/**
 * Camera-local pseudo-stars for superluminal cruise. Not a claim about what
 * warp "looks like" - an honest impressionist stand-in for star fields that
 * genuinely cannot be resolved at those speeds.
 */
export class WarpStreaks {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private phase = 0;

  constructor() {
    const seed = new Float32Array(STREAK_COUNT * 3);
    const rnd = (() => {
      let s = 77;
      return () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
    })();
    for (let i = 0; i < STREAK_COUNT * 3; i++) seed[i] = rnd();
    const geo = new THREE.BufferGeometry();
    // position attribute is required by three even though the shader ignores it
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAK_COUNT * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      uniforms: {
        uPr: { value: Math.min(2, window.devicePixelRatio || 1) },
        uPhase: { value: 0 },
        uStrength: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -2;
  }

  setPixelRatio(pr: number): void {
    this.material.uniforms.uPr.value = pr;
  }

  /** Attach to the camera so the tube rides along; call every frame. */
  update(dt: number, speedLyPerSec: number): void {
    const strength = THREE.MathUtils.clamp((speedLyPerSec - 1.2) / 6, 0, 1) * 0.85;
    this.material.uniforms.uStrength.value = strength;
    if (strength > 0) {
      this.phase += dt * THREE.MathUtils.clamp(speedLyPerSec * 0.5, 4, 60);
      this.material.uniforms.uPhase.value = this.phase;
    }
    this.points.visible = strength > 0.01;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
