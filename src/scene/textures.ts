/**
 * Procedural texture painter. Every surface in the app is generated here at
 * load time on 2D canvases — no downloaded assets. Each painter writes an
 * equirectangular map (seamless on the x axis via periodic noise).
 */
import * as THREE from 'three';
import { ValueNoise, mulberry32, hex, ramp, lerpRGB, type RGB } from './noise';

export interface BodySurface {
  map: THREE.CanvasTexture;
  clouds?: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
}

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

type PixelFn = (u: number, v: number) => RGB;

/** Run a per-pixel painter over an equirect canvas. */
function paint(w: number, h: number, fn: PixelFn): HTMLCanvasElement {
  const [c, ctx] = canvasOf(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const { r, g, b } = fn(u, v);
      const i = (y * w + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Sprinkle impact craters over a rocky-body canvas. */
function craters(
  c: HTMLCanvasElement,
  seed: number,
  count: number,
  maxR: number,
  strength = 1,
): void {
  const ctx = c.getContext('2d')!;
  const rnd = mulberry32(seed);
  const w = c.width;
  const h = c.height;
  for (let i = 0; i < count; i++) {
    const r = (0.15 + Math.pow(rnd(), 2.4) * 0.85) * maxR;
    const x = rnd() * w;
    // keep craters off the extreme poles where equirect stretching distorts them
    const y = h * (0.08 + rnd() * 0.84);
    const a = strength * (0.10 + rnd() * 0.16);

    // floor shadow
    let g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    g.addColorStop(0, `rgba(0,0,10,${a})`);
    g.addColorStop(0.75, `rgba(0,0,10,${a * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (x < r) { ctx.beginPath(); ctx.arc(x + w, y, r, 0, Math.PI * 2); ctx.fill(); }
    if (x > w - r) { ctx.beginPath(); ctx.arc(x - w, y, r, 0, Math.PI * 2); ctx.fill(); }

    // rim highlight
    g = ctx.createRadialGradient(x, y, r * 0.82, x, y, r * 1.12);
    g.addColorStop(0, 'rgba(255,250,240,0)');
    g.addColorStop(0.55, `rgba(255,250,240,${a * 0.8})`);
    g.addColorStop(1, 'rgba(255,250,240,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- painters --

function paintMercury(): HTMLCanvasElement {
  const n = new ValueNoise(101);
  const stops: Array<[number, RGB]> = [
    [0, hex(0x5c554f)],
    [0.45, hex(0x847c72)],
    [0.75, hex(0xa39a8c)],
    [1, hex(0xbdb4a4)],
  ];
  const c = paint(512, 256, (u, v) => {
    const s = 6;
    const m = n.fbm(u * s, v * s * 0.5 + 3, 5, 2, 0.5, s);
    const fine = n.fbm(u * s * 5, v * s * 2.5, 3, 2, 0.5, s * 5);
    return ramp(stops, m * 0.8 + fine * 0.2);
  });
  craters(c, 7, 260, 26);
  return c;
}

function paintVenus(): HTMLCanvasElement {
  const n = new ValueNoise(202);
  const stops: Array<[number, RGB]> = [
    [0, hex(0xb98f52)],
    [0.35, hex(0xd7b177)],
    [0.65, hex(0xecd3a2)],
    [1, hex(0xf7e8c8)],
  ];
  return paint(512, 256, (u, v) => {
    const s = 3;
    const q = n.fbm(u * s, v * s, 4, 2, 0.5, s);
    // chevron-like cloud sweep away from the equator
    const sweep = (v - 0.5) * (v - 0.5) * 14;
    const m = n.fbm(u * s * 1.6 + sweep + q * 1.5, v * s + q, 5, 2, 0.5, 0);
    const pole = Math.pow(Math.abs(v - 0.5) * 2, 6) * 0.35;
    return ramp(stops, 0.25 + m * 0.68 - pole);
  });
}

function paintEarth(): { surface: HTMLCanvasElement; rough: HTMLCanvasElement } {
  const n = new ValueNoise(303);
  const biome = new ValueNoise(304);
  const w = 1024;
  const h = 512;
  const ocean: Array<[number, RGB]> = [
    [0, hex(0x07203f)],
    [0.6, hex(0x0b3160)],
    [1, hex(0x1c5b8f)],
  ];
  const [roughCanvas, roughCtx] = canvasOf(w, h);
  const roughImg = roughCtx.createImageData(w, h);

  const surface = paint(w, h, (u, v) => {
    const s = 4;
    const q = n.fbm(u * s, v * s * 0.9, 4, 2, 0.5, s);
    const cont = n.fbm(u * s + q * 2.2, v * s * 0.9 + q * 2.2, 6, 2, 0.52, 0);
    const lat = Math.abs(v - 0.5) * 2; // 0 equator → 1 pole
    const iceEdge = 0.86 + n.noise2(u * 24, 7, 24) * 0.06;
    const x = Math.round(u * w) % w;
    const y = Math.min(h - 1, Math.round(v * (h - 1)));
    const ri = (y * w + x) * 4;

    let col: RGB;
    let rough: number;
    if (lat > iceEdge) {
      col = lerpRGB(hex(0xdfe9ef), hex(0xffffff), n.noise2(u * 30, v * 30));
      rough = 0.55;
    } else if (cont > 0.535) {
      const eleva = (cont - 0.535) / 0.2;
      const dry = biome.fbm(u * 5, v * 5, 4, 2, 0.5, 5);
      let land = ramp(
        [
          [0, hex(0x2e5c33)],
          [0.45, hex(0x557a3a)],
          [0.68, hex(0x9a8a56)],
          [1, hex(0xb59a6a)],
        ],
        dry * 0.7 + lat * 0.3,
      );
      if (eleva > 0.75) land = lerpRGB(land, hex(0xcfc9bd), (eleva - 0.75) * 3);
      if (lat > iceEdge - 0.09) land = lerpRGB(land, hex(0xf2f6f8), (lat - (iceEdge - 0.09)) / 0.09);
      col = land;
      rough = 0.95;
    } else {
      const depth = Math.min(1, (0.535 - cont) * 9);
      col = ramp(ocean, 1 - depth);
      rough = 0.42;
    }
    roughImg.data[ri] = roughImg.data[ri + 1] = roughImg.data[ri + 2] = Math.round(rough * 255);
    roughImg.data[ri + 3] = 255;
    return col;
  });
  roughCtx.putImageData(roughImg, 0, 0);
  return { surface, rough: roughCanvas };
}

function paintEarthClouds(): HTMLCanvasElement {
  const n = new ValueNoise(305);
  const w = 512;
  const h = 256;
  const [c, ctx] = canvasOf(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const s = 6.5;
      const q = n.fbm(u * s, v * s, 3, 2, 0.5, s);
      const m = n.fbm(u * s * 1.4 + q * 1.2 + 9, v * s * 1.1 + q * 1.2, 5, 2, 0.52, 0);
      const band = 0.92 + 0.08 * Math.sin(v * Math.PI * 5 + q * 3);
      const a = Math.pow(Math.max(0, (m * band - 0.5) / 0.5), 1.7);
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(Math.min(1, a * 1.55) * 235);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function paintMars(): HTMLCanvasElement {
  const n = new ValueNoise(404);
  const stops: Array<[number, RGB]> = [
    [0, hex(0x6e3620)],
    [0.4, hex(0x9c522f)],
    [0.7, hex(0xc4744a)],
    [1, hex(0xdd9a6b)],
  ];
  const c = paint(512, 256, (u, v) => {
    const s = 5;
    const q = n.fbm(u * s, v * s * 0.6, 4, 2, 0.5, s);
    const m = n.fbm(u * s + q * 1.6, v * s * 0.6 + q * 1.6, 5, 2, 0.5, 0);
    let col = ramp(stops, m);
    // dark volcanic provinces
    const dark = n.fbm(u * 2.4 + 40, v * 1.6 + 40, 4, 2, 0.5, 2.4);
    if (dark > 0.58) col = lerpRGB(col, hex(0x4c2b1c), Math.min(1, (dark - 0.58) * 3.2));
    // polar caps
    const lat = Math.abs(v - 0.5) * 2;
    const capEdge = 0.88 + n.noise2(u * 18, 3, 18) * 0.05;
    const cap = v < 0.5 ? capEdge - 0.03 : capEdge; // north cap slightly larger
    if (lat > cap) col = lerpRGB(col, hex(0xf5f0e8), Math.min(1, (lat - cap) * 14));
    return col;
  });
  craters(c, 11, 110, 16, 0.8);
  // Valles Marineris — a dark canyon streak just south of the equator
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = 'rgba(40,18,10,0.5)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = 4 - i;
    ctx.beginPath();
    ctx.moveTo(112, 140 + i * 2);
    ctx.quadraticCurveTo(160, 148 + i, 216, 142 + i * 2);
    ctx.stroke();
  }
  return c;
}

/** Banded gas-giant painter shared by Jupiter and Saturn. */
function paintBanded(
  seed: number,
  bandStops: Array<[number, RGB]>,
  bands: number,
  turbulence: number,
  contrast: number,
): HTMLCanvasElement {
  const n = new ValueNoise(seed);
  return paint(1024, 512, (u, v) => {
    const s = 5;
    const q = n.fbm(u * s, v * s * 2, 4, 2, 0.5, s);
    const wob = (q - 0.5) * turbulence;
    const bandPos = v + wob * 0.05;
    const t = 0.5 + 0.5 * Math.sin(bandPos * Math.PI * bands + Math.sin(bandPos * 7 + seed) * 1.2);
    const fine = n.fbm(u * s * 4, v * s * 8, 3, 2, 0.5, s * 4);
    const base = ramp(bandStops, Math.min(1, Math.max(0, t * contrast + (1 - contrast) * 0.5)));
    return lerpRGB(base, hex(0xffffff), (fine - 0.5) * 0.14);
  });
}

function paintJupiter(): HTMLCanvasElement {
  const c = paintBanded(
    505,
    [
      [0, hex(0x6d4326)],
      [0.28, hex(0x9c6845)],
      [0.52, hex(0xc59a6e)],
      [0.78, hex(0xe8d4b4)],
      [1, hex(0xf6ecd9)],
    ],
    12,
    2.0,
    1.0,
  );
  // Great Red Spot
  const ctx = c.getContext('2d')!;
  const cx = 700;
  const cy = 330;
  const rx = 56;
  const ry = 30;
  const spot = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
  spot.addColorStop(0, 'rgba(196,90,58,0.95)');
  spot.addColorStop(0.55, 'rgba(178,74,46,0.9)');
  spot.addColorStop(0.8, 'rgba(150,62,40,0.55)');
  spot.addColorStop(1, 'rgba(150,62,40,0)');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = spot;
  ctx.beginPath();
  ctx.arc(cx, cy, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return c;
}

function paintSaturn(): HTMLCanvasElement {
  return paintBanded(
    606,
    [
      [0, hex(0xa88d5f)],
      [0.35, hex(0xc4aa78)],
      [0.65, hex(0xdcc79a)],
      [1, hex(0xeee0bd)],
    ],
    9,
    0.8,
    0.55,
  );
}

function paintUranus(): HTMLCanvasElement {
  const n = new ValueNoise(707);
  return paint(512, 256, (u, v) => {
    const band = Math.sin(v * Math.PI * 6) * 0.03;
    const m = n.fbm(u * 3, v * 3, 3, 2, 0.5, 3) * 0.05;
    return ramp(
      [
        [0, hex(0x8fc6cc)],
        [0.5, hex(0xaadbde)],
        [1, hex(0xc2e8e8)],
      ],
      0.35 + band + m + (1 - Math.abs(v - 0.5) * 2) * 0.25,
    );
  });
}

function paintNeptune(): HTMLCanvasElement {
  const n = new ValueNoise(808);
  const c = paint(512, 256, (u, v) => {
    const s = 4;
    const q = n.fbm(u * s, v * s, 3, 2, 0.5, s);
    const t = 0.5 + 0.5 * Math.sin(v * Math.PI * 7 + q * 2.5);
    let col = ramp(
      [
        [0, hex(0x22448f)],
        [0.5, hex(0x3563b8)],
        [1, hex(0x4f80d6)],
      ],
      t * 0.5 + q * 0.3,
    );
    // bright methane cirrus streaks
    const streak = n.ridged(u * 6, v * 26, 3, 6);
    const latMask = Math.exp(-Math.pow((Math.abs(v - 0.5) - 0.18) * 9, 2));
    if (streak > 0.62) col = lerpRGB(col, hex(0xe8f2ff), (streak - 0.62) * 1.6 * latMask);
    return col;
  });
  // Great Dark Spot
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(160, 118, 2, 160, 118, 30);
  g.addColorStop(0, 'rgba(10,22,64,0.85)');
  g.addColorStop(0.7, 'rgba(10,22,64,0.4)');
  g.addColorStop(1, 'rgba(10,22,64,0)');
  ctx.save();
  ctx.translate(160, 118);
  ctx.scale(1, 0.55);
  ctx.translate(-160, -118);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(160, 118, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return c;
}

function paintMoon(): HTMLCanvasElement {
  const n = new ValueNoise(909);
  const c = paint(512, 256, (u, v) => {
    const s = 6;
    const m = n.fbm(u * s, v * s * 0.5, 5, 2, 0.5, s);
    let col = ramp(
      [
        [0, hex(0x6b6b68)],
        [0.55, hex(0x8f8d88)],
        [1, hex(0xb9b6ae)],
      ],
      m,
    );
    // dark basaltic maria
    const mare = n.fbm(u * 2.2 + 17, v * 1.8 + 17, 4, 2, 0.5, 2.2);
    if (mare > 0.55) col = lerpRGB(col, hex(0x4a4c52), Math.min(1, (mare - 0.55) * 3.4));
    return col;
  });
  craters(c, 21, 300, 20);
  return c;
}

// ------------------------------------------------------------------- rings --

export function makeRingTexture(kind: 'saturn' | 'uranus'): THREE.CanvasTexture {
  const w = 1024;
  const [c, ctx] = canvasOf(w, 4);
  const img = ctx.createImageData(w, 4);
  const n = new ValueNoise(kind === 'saturn' ? 42 : 43);
  for (let x = 0; x < w; x++) {
    const r = x / (w - 1); // 0 = inner edge, 1 = outer edge
    let alpha = 0;
    let col: RGB = hex(0xcbb695);
    if (kind === 'saturn') {
      if (r < 0.14) alpha = 0.12 + 0.1 * r; // C ring — translucent
      else if (r < 0.45) alpha = 0.75 + 0.2 * Math.sin(r * 40); // B ring — bright
      else if (r < 0.5) alpha = 0.06; // Cassini division
      else if (r < 0.86) alpha = r > 0.76 && r < 0.784 ? 0.08 : 0.5; // A ring + Encke gap
      else if (r < 0.9) alpha = 0.05;
      else alpha = 0.1 * Math.exp(-(r - 0.93) * (r - 0.93) * 900); // faint F ring
      alpha *= 0.62 + 0.38 * n.noise2(r * 160, 0.5);
      col = lerpRGB(hex(0xb49f80), hex(0xe8dcc2), n.noise2(r * 24, 3.5));
    } else {
      // Uranus — a few narrow charcoal ringlets
      const lines = [0.18, 0.34, 0.52, 0.66, 0.8, 0.94];
      for (const L of lines) alpha += 0.5 * Math.exp(-Math.pow((r - L) * 140, 2));
      alpha = Math.min(0.55, alpha);
      col = hex(0x9aa4ad);
    }
    for (let y = 0; y < 4; y++) {
      const i = (y * w + x) * 4;
      img.data[i] = col.r;
      img.data[i + 1] = col.g;
      img.data[i + 2] = col.b;
      img.data[i + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

// --------------------------------------------------------------- sky & fx --

export function makeMilkyWayTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const n = new ValueNoise(77);
  const [c, ctx] = canvasOf(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const drift = (n.noise2(u * 3, 0.5, 3) - 0.5) * 0.16;
      const dist = Math.abs(v - 0.5 - drift);
      const band = Math.exp(-dist * dist * 260);
      const clump = n.fbm(u * 10, v * 10, 5, 2, 0.55, 10);
      const dust = n.ridged(u * 7 + 30, v * 14 + 30, 4, 7);
      let bright = band * (0.35 + clump * 0.85) * (1 - Math.min(0.8, dust * band * 0.9));
      const core = Math.exp(-Math.pow((u - 0.5) * 4.5, 2)) * band * 0.5;
      bright = Math.min(1, bright + core * clump);
      const warm = core * 1.6;
      const i = (y * w + x) * 4;
      d[i] = Math.round(180 + warm * 60);
      d[i + 1] = Math.round(190 + warm * 30);
      d[i + 2] = 235;
      d[i + 3] = Math.round(Math.min(1, bright) * 110);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/** Soft radial glow sprite (sun corona, selection halo). */
export function makeGlowTexture(
  size: number,
  stops: Array<[number, string]>,
): THREE.CanvasTexture {
  const [c, ctx] = canvasOf(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, col] of stops) g.addColorStop(p, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c);
}

// ---------------------------------------------------------------- assembly --

export interface GeneratedTextures {
  bodies: Record<string, BodySurface>;
  saturnRing: THREE.CanvasTexture;
  uranusRing: THREE.CanvasTexture;
  milkyWay: THREE.CanvasTexture;
}

const nextFrame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));

/** Generate every texture, yielding between bodies so the boot UI can update. */
export async function generateAllTextures(
  onProgress: (done: number, total: number, label: string) => void,
): Promise<GeneratedTextures> {
  const bodies: Record<string, BodySurface> = {};
  const steps: Array<[string, () => void]> = [
    ['Mercury', () => (bodies.mercury = { map: toTexture(paintMercury()) })],
    ['Venus', () => (bodies.venus = { map: toTexture(paintVenus()) })],
    [
      'Earth',
      () => {
        const { surface, rough } = paintEarth();
        bodies.earth = {
          map: toTexture(surface),
          clouds: toTexture(paintEarthClouds()),
          roughnessMap: toTexture(rough, false),
        };
      },
    ],
    ['the Moon', () => (bodies.moon = { map: toTexture(paintMoon()) })],
    ['Mars', () => (bodies.mars = { map: toTexture(paintMars()) })],
    ['Jupiter', () => (bodies.jupiter = { map: toTexture(paintJupiter()) })],
    ['Saturn', () => (bodies.saturn = { map: toTexture(paintSaturn()) })],
    ['Uranus', () => (bodies.uranus = { map: toTexture(paintUranus()) })],
    ['Neptune', () => (bodies.neptune = { map: toTexture(paintNeptune()) })],
  ];
  const total = steps.length + 2;
  let done = 0;
  for (const [label, run] of steps) {
    onProgress(done, total, `Painting ${label}…`);
    await nextFrame();
    run();
    done++;
  }
  onProgress(done, total, 'Carving the rings…');
  await nextFrame();
  const saturnRing = makeRingTexture('saturn');
  const uranusRing = makeRingTexture('uranus');
  done++;
  onProgress(done, total, 'Spilling the Milky Way…');
  await nextFrame();
  const milkyWay = makeMilkyWayTexture();
  done++;
  onProgress(done, total, 'Ready');
  return { bodies, saturnRing, uranusRing, milkyWay };
}
