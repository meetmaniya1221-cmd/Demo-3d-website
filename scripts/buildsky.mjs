/**
 * All-sky Milky Way asset builder.
 *
 * Turns NASA's Gaia-based all-sky survey maps into the equirectangular sky
 * textures the renderer bakes into its cubemap. The structure that comes out
 * of this is measured sky, not invented: the band, the star clouds, the Great
 * Rift and every other dust lane are where the survey says they are.
 *
 *   npm install --no-save sharp
 *   node scripts/buildsky.mjs
 *
 * SOURCE
 *   NASA SVS "Deep Star Maps 2020" (Ernie Wright), entry 4851.
 *   Plotted from 1.7 billion stars: Hipparcos-2, Tycho-2 and Gaia DR2, with
 *   Yale Bright Star, UCAC3 and XHIP for completeness. Two products are used:
 *     milkyway_2020_8k_gal.exr  - the diffuse Milky Way background
 *     starmap_2020_8k_gal.exr   - the resolved stars
 *   Both in GALACTIC plate carree, which is why the renderer can sample them
 *   with the same scene->galactic matrix it already uses for orientation.
 *   The galactic images were corrected by SVS in January 2021 to use the
 *   Hipparcos/Gaia transformation rather than a B1950 one.
 *
 * WHY A TONE CURVE IS NEEDED
 *   The EXRs are linear half-float. Written straight to 8-bit sRGB the band
 *   crushes to near-black, because the dynamic range between the faint
 *   high-latitude sky and the galactic centre is far wider than 8 bits. The
 *   curve below lifts the faint end without clipping the bright end, so the
 *   dust lanes stay legible against the star clouds instead of both going to
 *   the same value.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat, readFile, readdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { DataUtils } from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('This script needs sharp:  npm install --no-save sharp');
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = process.env.ASSET_CACHE ?? path.join(ROOT, '.asset-cache');
const OUT = path.join(ROOT, 'public', 'textures', 'sky');
const BASE = 'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851';

const SOURCES = {
  milkyway: {
    url: `${BASE}/milkyway_2020_8k_gal.exr`,
    file: 'milkyway_8k_gal.exr',
    what: 'Diffuse Milky Way background, galactic plate carree, 8192x4096, linear half-float',
  },
  starmap: {
    url: `${BASE}/starmap_2020_8k_gal.exr`,
    file: 'starmap_8k_gal.exr',
    what: 'Resolved stars (Hipparcos-2 + Tycho-2 + Gaia DR2), galactic plate carree, 8192x4096',
  },
};

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchSource(key) {
  const src = SOURCES[key];
  const dest = path.join(CACHE, src.file);
  if (await exists(dest)) return dest;
  await mkdir(CACHE, { recursive: true });
  process.stdout.write(`  fetching ${src.file} ... `);
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(src.url);
    if (res.ok) break;
    if (attempt >= 4 || res.status < 500) throw new Error(`${src.url} -> HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  await pipeline(res.body, createWriteStream(dest));
  console.log(`${((await stat(dest)).size / 1e6).toFixed(1)} MB`);
  return dest;
}

/** Parse an EXR into linear Float32 RGB. */
async function readExr(file) {
  const buf = await readFile(file);
  const parsed = new EXRLoader().parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  const { width, height, data } = parsed;
  const n = width * height;
  const out = new Float32Array(n * 3);
  // EXRLoader hands back RGBA half-float bit patterns
  const half = data instanceof Uint16Array;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const v = data[i * 4 + c];
      out[i * 3 + c] = half ? DataUtils.fromHalfFloat(v) : v;
    }
  }
  return { width, height, data: out };
}

const srgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/**
 * Linear survey radiance -> 8-bit sRGB.
 *
 * `gain` scales the linear data before the curve; `toe` is a gamma applied in
 * linear space that lifts the faint sky. The Reinhard shoulder keeps the
 * galactic centre and the brightest star clouds from clipping to white, which
 * is what would erase the structure the whole exercise is about.
 */
function tonemap(src, { gain, toe, shoulder }) {
  const out = Buffer.allocUnsafe(src.length);
  for (let i = 0; i < src.length; i++) {
    let v = Math.max(0, src[i]) * gain;
    if (toe !== 1) v = Math.pow(v, toe);
    v = v / (1 + v / shoulder);
    out[i] = Math.round(Math.min(1, Math.max(0, srgb(v))) * 255);
  }
  return out;
}

/** Percentiles of a channel-averaged image, for choosing the curve honestly. */
function stats(data, n = 3) {
  const lum = new Float64Array(data.length / n);
  for (let i = 0, j = 0; i < data.length; i += n, j++) {
    lum[j] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  const sorted = Float64Array.from(lum).sort();
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return { p50: at(0.5), p90: at(0.9), p99: at(0.99), p999: at(0.999), max: sorted[sorted.length - 1] };
}

async function writeWebp(img, out, opts = {}) {
  await mkdir(path.dirname(out), { recursive: true });
  await img.webp({ quality: opts.quality ?? 88, effort: 6 }).toFile(out);
  const { size } = await stat(out);
  console.log(`  ${path.relative(ROOT, out).padEnd(44)} ${(size / 1024).toFixed(0)} kB`);
}

async function main() {
  console.log('All-sky Milky Way build (NASA SVS 4851, Gaia DR2 + Hipparcos-2 + Tycho-2)\n');

  const mwFile = await fetchSource('milkyway');
  const stFile = await fetchSource('starmap');

  console.log('  decoding EXRs (8192x4096 half-float) ...');
  const mw = await readExr(mwFile);
  const st = await readExr(stFile);
  console.log(`  milkyway ${mw.width}x${mw.height}  starmap ${st.width}x${st.height}`);

  const mwStats = stats(mw.data);
  const stStats = stats(st.data);
  console.log(`  milkyway luminance p50=${mwStats.p50.toExponential(2)} p99=${mwStats.p99.toExponential(2)} max=${mwStats.max.toExponential(2)}`);
  console.log(`  starmap  luminance p50=${stStats.p50.toExponential(2)} p99=${stStats.p99.toExponential(2)} max=${stStats.max.toExponential(2)}`);

  // Composite the two the way the survey intends them: diffuse background plus
  // resolved stars. The stars are held back a little so the band reads as
  // surface brightness rather than as a field of dots - the renderer draws the
  // bright catalogue separately, in sharp points, on top of this.
  const combined = new Float32Array(mw.data.length);
  // The resolved stars are held well back. At 4k one pixel spans 5 arcmin, so
  // 1.7 billion point sources average into a mottled field - at full weight
  // that granularity reads as sensor noise across the whole sky rather than as
  // star clouds. The renderer draws the bright catalogue as sharp points on
  // top, which is where crispness should come from.
  for (let i = 0; i < combined.length; i++) combined[i] = mw.data[i] + st.data[i] * 0.32;

  // Anchor the curve to the data rather than to taste: put the 99.9th
  // percentile near the top of the range so the galactic centre is bright but
  // not clipped, and lift the faint end with a gamma so high-latitude sky is
  // visibly dark-but-not-black.
  // Anchor the curve to the data. The toe is deliberately close to linear:
  // lifting the faint end hard (0.62 in the first attempt) turned interstellar
  // space into a uniform grey haze at 56/255, which is not what space looks
  // like from anywhere. Deep sky should be nearly black, with the band and the
  // bulge carrying almost all of the signal.
  const cStats = stats(combined);
  const gain = 0.5 / Math.max(cStats.p999, 1e-6);
  const curve = { gain, toe: 0.88, shoulder: 1.6 };
  console.log(`  tone curve: gain=${gain.toFixed(3)} toe=${curve.toe} shoulder=${curve.shoulder}`);
  const curveAt = (v) => {
    let x = Math.max(0, v) * curve.gain;
    x = Math.pow(x, curve.toe);
    x = x / (1 + x / curve.shoulder);
    return Math.round(Math.min(1, Math.max(0, srgb(x))) * 255);
  };
  console.log(
    `  resulting 8-bit levels: p50=${curveAt(cStats.p50)} p90=${curveAt(cStats.p90)} ` +
      `p99=${curveAt(cStats.p99)} p99.9=${curveAt(cStats.p999)} max=${curveAt(cStats.max)}`,
  );

  const rgb = tonemap(combined, curve);
  const full = sharp(rgb, { raw: { width: mw.width, height: mw.height, channels: 3 } });

  await mkdir(OUT, { recursive: true });
  // 4k is the top rung shipped: the renderer bakes these into a 1024-per-face
  // cubemap, and 4096/360 = 11.4 px per degree is exactly what a 1024 face
  // resolves. An 8k source would be thrown away by that bake, and 8192x4096
  // decompresses to 134 MB on the GPU, which no phone should be asked for.
  for (const w of [4096, 2048, 1024]) {
    const label = `${w / 1024}k`;
    await writeWebp(
      sharp(rgb, { raw: { width: mw.width, height: mw.height, channels: 3 } }).resize(w, w / 2, {
        kernel: 'lanczos3',
      }),
      path.join(OUT, `milkyway_${label}.webp`),
      { quality: w >= 8192 ? 84 : 90 },
    );
  }
  void full;

  // A verification crop of the galactic centre. l=0,b=0 sits at the middle of
  // a galactic plate carree, and it must be the brightest thing in the frame -
  // if the map were mis-oriented, this is where it would show.
  const cx = Math.round(mw.width / 2);
  const cy = Math.round(mw.height / 2);
  await sharp(rgb, { raw: { width: mw.width, height: mw.height, channels: 3 } })
    .extract({ left: cx - 512, top: cy - 256, width: 1024, height: 512 })
    .webp({ quality: 92 })
    .toFile(path.join(OUT, '..', '..', '..', 'shots', 'sky-centre-check.webp'))
    .catch(() => {});

  // Objective orientation check: mean brightness in a 20-degree box at the
  // galactic centre against one at the pole.
  const boxMean = (l, b, halfDeg) => {
    const x0 = Math.round(((l + 180) / 360) * mw.width);
    const y0 = Math.round(((90 - b) / 180) * mw.height);
    const r = Math.round((halfDeg / 360) * mw.width);
    let sum = 0;
    let n = 0;
    for (let y = Math.max(0, y0 - r); y < Math.min(mw.height, y0 + r); y++) {
      for (let x = x0 - r; x < x0 + r; x++) {
        const xx = ((x % mw.width) + mw.width) % mw.width;
        const i = (y * mw.width + xx) * 3;
        sum += 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2];
        n++;
      }
    }
    return sum / n;
  };
  const centre = boxMean(0, 0, 10);
  const anticentre = boxMean(180, 0, 10);
  const pole = boxMean(0, 80, 10);
  console.log(
    `\n  orientation check (mean 8-bit luminance in 20 deg boxes):\n` +
      `    galactic centre  l=0   b=0   ${centre.toFixed(1)}\n` +
      `    anticentre       l=180 b=0   ${anticentre.toFixed(1)}\n` +
      `    north gal. pole  l=0   b=80  ${pole.toFixed(1)}`,
  );
  if (!(centre > anticentre && anticentre > pole)) {
    throw new Error('galactic centre is not the brightest region - the map is not oriented as assumed');
  }
  console.log('    centre > anticentre > pole: the map is in galactic coordinates as expected');

  const files = await readdir(OUT);
  let total = 0;
  for (const f of files) total += (await stat(path.join(OUT, f))).size;
  console.log(`\n  ${path.relative(ROOT, OUT)}: ${files.length} files, ${(total / 1e6).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
