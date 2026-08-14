/**
 * Where is the residual?
 *
 * skydepthtest reports one number per body. A number cannot tell the
 * difference between the sky being composited across a whole disc and light
 * spilling a few pixels in from the limb, and those are completely different
 * faults. This renders the difference instead: for each captured pair it
 * writes a false-colour map and reports how the difference is distributed
 * against distance from the body's edge.
 *
 * Usage: node scripts/skydiffmap.mjs [--out shots/skydepth]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const OUT = argOf('out', 'shots/skydepth');

const load = (n) => PNG.sync.read(readFileSync(`${OUT}/${n}.png`));

/** Lit pixels of the sky-off frame: the foreground. */
function lit(off) {
  const { width, height, data } = off;
  const m = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2] > 30) m[i] = 1;
  }
  return m;
}

/**
 * Chebyshev distance from the nearest unlit pixel, by two passes. "How deep
 * inside the body is this pixel" - the single most diagnostic axis, because
 * anything that leaks in from outside dies away with depth and anything drawn
 * over the surface does not.
 */
function depth(m, width, height) {
  const d = new Int32Array(width * height).fill(1e9);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!m[i]) {
        d[i] = 0;
        continue;
      }
      if (y > 0) d[i] = Math.min(d[i], d[i - width] + 1);
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y > 0 && x > 0) d[i] = Math.min(d[i], d[i - width - 1] + 1);
      if (y > 0 && x < width - 1) d[i] = Math.min(d[i], d[i - width + 1] + 1);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!m[i]) continue;
      if (y < height - 1) d[i] = Math.min(d[i], d[i + width] + 1);
      if (x < width - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < height - 1 && x < width - 1) d[i] = Math.min(d[i], d[i + width + 1] + 1);
      if (y < height - 1 && x > 0) d[i] = Math.min(d[i], d[i + width - 1] + 1);
    }
  }
  return d;
}

const names = [
  ...new Set(
    readdirSync(OUT)
      .filter((f) => f.endsWith('-off.png'))
      .map((f) => f.replace(/-off\.png$/, '')),
  ),
].sort();

console.log('\nWhere the residual sits, by depth inside the body (Chebyshev px from the edge)\n');
console.log(
  `${'capture'.padEnd(20)} ${'1-4'.padStart(9)} ${'5-16'.padStart(9)} ${'17-48'.padStart(9)} ${'49+'.padStart(9)}   deepest hit`,
);

for (const name of names) {
  let on;
  let off;
  try {
    on = load(`${name}-on`);
    off = load(`${name}-off`);
  } catch {
    continue;
  }
  const { width, height } = off;
  const m = lit(off);
  const d = depth(m, width, height);

  const bands = [
    [1, 4],
    [5, 16],
    [17, 48],
    [49, 1e9],
  ];
  const maxOf = bands.map(() => 0);
  const vis = new PNG({ width, height });
  let deepest = 0;
  let deepestD = 0;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const diff =
      Math.abs(on.data[o] - off.data[o]) +
      Math.abs(on.data[o + 1] - off.data[o + 1]) +
      Math.abs(on.data[o + 2] - off.data[o + 2]);
    // the map: foreground in grey, difference in red, saturating at 60
    const base = m[i] ? 40 : 0;
    vis.data[o] = Math.min(255, base + diff * 4);
    vis.data[o + 1] = base;
    vis.data[o + 2] = base;
    vis.data[o + 3] = 255;
    if (!m[i]) continue;
    for (let b = 0; b < bands.length; b++) {
      if (d[i] >= bands[b][0] && d[i] <= bands[b][1]) maxOf[b] = Math.max(maxOf[b], diff);
    }
    if (diff > 6 && d[i] > deepestD) {
      deepestD = d[i];
      deepest = diff;
    }
  }
  writeFileSync(`${OUT}/${name}-diff.png`, PNG.sync.write(vis));
  console.log(
    `${name.padEnd(20)} ${String(maxOf[0]).padStart(9)} ${String(maxOf[1]).padStart(9)} ` +
      `${String(maxOf[2]).padStart(9)} ${String(maxOf[3]).padStart(9)}   Δ=${deepest} at depth ${deepestD}`,
  );
}
console.log('\nMaps written to', OUT, '(*-diff.png; red is the difference, x4)');
