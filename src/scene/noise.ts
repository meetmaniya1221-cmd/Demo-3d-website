/** Seeded value noise + fBm used by the procedural texture painter. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ValueNoise {
  private perm: Uint8Array;
  private vals: Float32Array;

  constructor(seed: number) {
    const rnd = mulberry32(seed);
    this.perm = new Uint8Array(512);
    this.vals = new Float32Array(256);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) this.vals[i] = rnd();
  }

  private lattice(ix: number, iy: number): number {
    return this.vals[this.perm[(ix & 255) + this.perm[iy & 255]]];
  }

  /** 2D value noise in [0,1]; tiles every `period` cells on x (for seamless equirect wrap). */
  noise2(x: number, y: number, periodX = 0): number {
    let ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const wrap = (v: number) => (periodX > 0 ? ((v % periodX) + periodX) % periodX : v);
    const x0 = wrap(ix);
    const x1 = wrap(ix + 1);
    const v00 = this.lattice(x0, iy);
    const v10 = this.lattice(x1, iy);
    const v01 = this.lattice(x0, iy + 1);
    const v11 = this.lattice(x1, iy + 1);
    const a = v00 + (v10 - v00) * sx;
    const b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  }

  /** Fractal Brownian motion in [0,1]. `periodX` keeps octave 0 seamless on x. */
  fbm(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5, periodX = 0): number {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(x * freq, y * freq, periodX * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged fBm in [0,1] - good for mountains / turbulent bands. */
  ridged(x: number, y: number, octaves = 5, periodX = 0): number {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise2(x * freq, y * freq, periodX * freq) * 2 - 1);
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hex(c: number): RGB {
  return { r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255 };
}

export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  const k = Math.min(1, Math.max(0, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

/** Sample a multi-stop gradient. Stops: [position 0..1, color]. */
export function ramp(stops: Array<[number, RGB]>, t: number): RGB {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      return lerpRGB(c0, c1, (t - p0) / (p1 - p0 || 1));
    }
  }
  return stops[stops.length - 1][1];
}
