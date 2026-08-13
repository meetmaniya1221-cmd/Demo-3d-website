/**
 * Earth + Moon texture pyramid builder.
 *
 * Downloads the authoritative NASA source products and derives every map the
 * close-range Earth/Moon renderer needs. Run it when the assets need
 * regenerating; the outputs are committed under public/textures/{earth,moon}/
 * so a normal `npm run build` never touches the network.
 *
 *   npm install --no-save sharp
 *   node scripts/buildearthmoon.mjs
 *
 * Every source URL, its resolution and its documented physical encoding are
 * listed in SOURCES (below) and mirrored into SOURCES.md. Nothing here invents
 * data: the elevation-to-metres scalings are the ones NASA publishes for these
 * exact files, and they are applied verbatim when the normal maps are derived.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat, readdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('This script needs sharp:  npm install --no-save sharp');
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = process.env.ASSET_CACHE ?? path.join(ROOT, '.asset-cache');
const OUT_EARTH = path.join(ROOT, 'public', 'textures', 'earth');
const OUT_MOON = path.join(ROOT, 'public', 'textures', 'moon');

/**
 * The source products.
 *
 * `metresPerUnit` records the published encoding of each elevation product -
 * these are quoted from the NASA pages that host the files, not guessed, and
 * they are what makes the derived normal maps physically scaled rather than
 * artistic.
 */
const SOURCES = {
  earthDay: {
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x21600x10800.jpg',
    file: 'bmng_day_21600.jpg',
    what: 'Blue Marble Next Generation, December 2004, topography + bathymetry, 21600x10800 (2 km/px)',
    credit: 'NASA Earth Observatory (Reto Stockli, NASA GSFC)',
  },
  earthNight: {
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg_geo.tif',
    file: 'blackmarble_2016.tif',
    what: 'Black Marble 2016 night lights, 0.1 deg, 3600x1800',
    credit: 'NASA Earth Observatory (Joshua Stevens), Suomi NPP VIIRS day/night band',
  },
  earthTopo: {
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73934/gebco_08_rev_elev_21600x10800.png',
    file: 'gebco_topo_21600.png',
    what: 'Blue Marble Next Generation land topography (SRTM30/GEBCO_08), 21600x10800',
    credit: 'NASA Earth Observatory',
    // Published on the hosting page: "Data in these images were scaled
    // 0-6400 meters" across the 8-bit range.
    metresPerUnit: 6400 / 255,
  },
  cloudE: {
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud.E.2001210.21600x21600.png',
    file: 'cloud_E.png',
    what: 'Blue Marble clouds, MODIS composite 2001-07-29, eastern half 21600x21600',
    credit: 'NASA Earth Observatory / MODIS',
  },
  cloudW: {
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud.W.2001210.21600x21600.png',
    file: 'cloud_W.png',
    what: 'Blue Marble clouds, MODIS composite 2001-07-29, western half 21600x21600',
    credit: 'NASA Earth Observatory / MODIS',
  },
  cloudRef: {
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.tif',
    file: 'cloud_combined_2048.tif',
    what: 'Blue Marble clouds, pre-assembled global composite, 2048x1024 - used only to verify hemisphere order',
    credit: 'NASA Earth Observatory / MODIS',
  },
  moonColor: {
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_8k.tif',
    file: 'moon_color_8k.tif',
    what: 'CGI Moon Kit colour map, 8192x4096, from the Hapke-normalised LROC WAC mosaic',
    credit: 'NASA SVS (Ernie Wright), LRO/LROC',
  },
  moonDem64: {
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_64_uint.tif',
    file: 'moon_ldem_64.tif',
    what: 'CGI Moon Kit displacement map, LOLA LDEM 64 px/deg, 23040x11520, uint16',
    credit: 'NASA SVS / LRO LOLA',
    // Published on the hosting page: "unsigned 16-bit TIFFs in half-meters,
    // relative to a radius of 1727400 meters" (reference sphere 1737.4 km).
    metresPerUnit: 0.5,
  },
  moonDem16: {
    url: 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif',
    file: 'moon_ldem_16.tif',
    what: 'CGI Moon Kit displacement map, LOLA LDEM 16 px/deg, 5760x2880, uint16',
    credit: 'NASA SVS / LRO LOLA',
    metresPerUnit: 0.5,
  },
};

const EARTH_RADIUS_M = 6_371_000; // volumetric mean radius, NASA Earth fact sheet
const MOON_RADIUS_M = 1_737_400; // LOLA reference sphere, quoted above

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
  // these are big files off a busy public server; a 5xx here is usually load,
  // not a bad URL
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(src.url);
    if (res.ok) break;
    if (attempt >= 4 || res.status < 500) throw new Error(`${src.url} -> HTTP ${res.status}`);
    process.stdout.write(`${res.status}, retrying ... `);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  await pipeline(res.body, createWriteStream(dest));
  const { size } = await stat(dest);
  console.log(`${(size / 1e6).toFixed(1)} MB`);
  return dest;
}

const open = (p) => sharp(p, { limitInputPixels: false, unlimited: true });

async function writeWebp(img, out, { quality = 84, effort = 5, lossless = false } = {}) {
  await mkdir(path.dirname(out), { recursive: true });
  await img.webp({ quality, effort, lossless }).toFile(out);
  const { size } = await stat(out);
  console.log(`  ${path.relative(ROOT, out).padEnd(42)} ${(size / 1024).toFixed(0)} kB`);
}

/** Emit a resolution pyramid of one equirectangular map. */
async function pyramid(srcPath, outDir, prefix, widths, opts = {}) {
  for (const w of widths) {
    const label = w >= 1024 ? `${w / 1024}k` : `${w}`;
    await writeWebp(
      open(srcPath).resize(w, w / 2, { kernel: 'lanczos3' }),
      path.join(outDir, `${prefix}_${label}.webp`),
      opts,
    );
  }
}

/**
 * Read an elevation product as a single-channel height field.
 *
 * sharp's default pipeline drops 16-bit input to 8 bits somewhere between
 * decode and `raw()`, which silently flattens a DEM to about 150 usable
 * levels. Asking for the `grey16` colourspace explicitly keeps the full
 * range - worth checking with `--verify` if these products are ever swapped.
 */
async function heightField(srcPath, width, height, sixteenBit) {
  const raw = await open(srcPath)
    .resize(width, height, { kernel: 'lanczos3' })
    .toColourspace(sixteenBit ? 'grey16' : 'b-w')
    .raw({ depth: sixteenBit ? 'ushort' : 'uchar' })
    .toBuffer();
  if (!sixteenBit) return raw;
  const h = new Uint16Array(width * height);
  for (let i = 0; i < h.length; i++) h[i] = raw.readUInt16LE(i * 2);
  return h;
}

/**
 * Tangent-space normal map from an equirectangular height field.
 *
 * The horizontal spacing of samples shrinks with cos(latitude) on a sphere, so
 * the east-west slope is divided by it - without that, terrain smears into
 * streaks approaching the poles. Heights are converted to metres with the
 * product's own published scaling before any slope is taken, so the relief is
 * as steep as the real data says and no steeper.
 */
async function normalMap(srcPath, outPath, { metresPerUnit, radiusM, width, sixteenBit }) {
  const height = width / 2;
  const h = await heightField(srcPath, width, height, sixteenBit);

  const out = Buffer.allocUnsafe(width * height * 3);
  const dLat = Math.PI / height; // radians per pixel row
  const dLon = (2 * Math.PI) / width; // radians per pixel column
  // Guard the poles: cos(lat) -> 0 would divide the east-west slope by zero.
  const minCos = Math.cos(Math.PI / 2 - 2 * dLat);

  for (let y = 0; y < height; y++) {
    // pixel centre latitude, +90 at row 0 (equirectangular, north up)
    const lat = Math.PI / 2 - (y + 0.5) * dLat;
    const cosLat = Math.max(Math.cos(lat), minCos);
    const dx = radiusM * cosLat * dLon; // metres per column step
    const dy = radiusM * dLat; // metres per row step
    const yUp = Math.max(y - 1, 0) * width;
    const yDn = Math.min(y + 1, height - 1) * width;
    const yc = y * width;
    for (let x = 0; x < width; x++) {
      // longitude wraps, latitude clamps
      const xl = (x - 1 + width) % width;
      const xr = (x + 1) % width;
      const hl = h[yc + xl] * metresPerUnit;
      const hr = h[yc + xr] * metresPerUnit;
      const hu = h[yUp + x] * metresPerUnit;
      const hd = h[yDn + x] * metresPerUnit;
      // central differences, metres of rise per metre of run
      const sx = (hr - hl) / (2 * dx);
      const sy = (hu - hd) / (2 * dy);
      // three.js tangent space: +X along +U (east), +Y along +V, +Z out of the
      // surface. Sphere UVs run v upward from the south pole, and row 0 is
      // north, so +V is north - the same direction as sy.
      let nx = -sx;
      let ny = -sy;
      const inv = 1 / Math.hypot(nx, ny, 1);
      nx *= inv;
      ny *= inv;
      const i = (yc + x) * 3;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
    }
  }
  await writeWebp(sharp(out, { raw: { width, height, channels: 3 } }), outPath, {
    quality: 92,
    effort: 6,
  });
}

/**
 * Ocean/land split, straight off the Blue Marble radiometry.
 *
 * Water is the only large surface that is markedly more blue than red, so a
 * blue-dominance test separates sea from land, ice and cloud-free desert
 * without needing a separate coastline vector. The result drives roughness
 * (smooth water carries the Sun's glint, matte land does not).
 */
async function oceanRoughness(srcPath, outPath, width) {
  const height = width / 2;
  const { data } = await open(srcPath)
    .resize(width, height, { kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.allocUnsafe(width * height * 3);
  for (let p = 0, q = 0; p < data.length; p += 3, q += 3) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const water = b > 42 && b > r * 1.14 && b > g * 1.04;
    // MeshStandardMaterial reads roughness from .g and metalness from .b
    out[q] = 255; // .r - ambient occlusion, unused
    out[q + 1] = water ? 62 : 236; // rough 0.24 water / 0.93 land
    out[q + 2] = 0; // .b - metalness stays 0 everywhere
  }
  await writeWebp(sharp(out, { raw: { width, height, channels: 3 } }), outPath, { quality: 88 });
}

/** One hemisphere resized to half of a target equirectangular canvas. */
async function cloudHalf(srcPath, width) {
  return open(srcPath)
    .resize(width / 2, width / 2, { kernel: 'lanczos3' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();
}

/**
 * Assemble the cloud map at one resolution from the two hemisphere files.
 *
 * Each source is 21600x21600 and covers 180 degrees of longitude by 180 of
 * latitude, so the pair tiles a 2:1 plate carree globe. They are downsampled
 * before being joined rather than after - stitching at full size would mean
 * holding a 933-megapixel intermediate for no gain.
 */
async function cloudRaw(paths, width) {
  const height = width / 2;
  const [left, right] = await Promise.all([
    cloudHalf(paths[0], width),
    cloudHalf(paths[1], width),
  ]);
  const out = Buffer.allocUnsafe(width * height);
  const half = width / 2;
  for (let y = 0; y < height; y++) {
    left.copy(out, y * width, y * half, (y + 1) * half);
    right.copy(out, y * width + half, y * half, (y + 1) * half);
  }
  return out;
}

/** cloudRaw, with the polar no-data rows blended in, ready to encode. */
async function cloudMap(order, width) {
  const height = width / 2;
  const raw = await cloudRaw(order, width);
  await fillCloudPoles(raw, width, height);
  return sharp(raw, { raw: { width, height, channels: 1 } });
}

/** Normalised cross-correlation of two same-size fields over a row band. */
function ncc(a, b, width, height, from, to) {
  const y0 = Math.round(height * from);
  const y1 = Math.round(height * to);
  let n = 0;
  let sa = 0;
  let sb = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++, n++) {
      sa += a[y * width + x];
      sb += b[y * width + x];
    }
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      const u = a[y * width + x] - ma;
      const v = b[y * width + x] - mb;
      num += u * v;
      da += u * u;
      db += v * v;
    }
  }
  return num / Math.sqrt(da * db);
}

/**
 * Which hemisphere goes on the left.
 *
 * Both orderings produce a seamless image - one is simply the other rotated
 * 180 degrees in longitude - so continuity cannot settle it, and getting it
 * backwards would silently park the Pacific's weather over Africa. NASA also
 * publishes a small pre-assembled version of this same composite, so the test
 * is to build both and correlate against that.
 *
 * Only the middle latitudes are compared. These hemisphere files are a late
 * July composite, so the Antarctic is in polar night and MODIS has no
 * visible-band retrieval there at all - the reference fills those rows in and
 * the hemispheres leave them black, which would swamp a whole-image
 * comparison.
 */
async function cloudOrder(ePath, wPath) {
  const W = 512;
  const H = 256;
  const ref = await open(await fetchSource('cloudRef'))
    .resize(W, H, { kernel: 'lanczos3' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();
  const score = async (paths) =>
    ncc(ref, await cloudRaw(paths, W), W, H, 0.2, 0.72);
  const we = await score([wPath, ePath]);
  const ew = await score([ePath, wPath]);
  console.log(`  hemisphere order: W|E r=${we.toFixed(4)}, E|W r=${ew.toFixed(4)}`);
  if (Math.max(we, ew) < 0.8) {
    throw new Error('neither cloud hemisphere order matches the NASA reference composite');
  }
  return we >= ew ? [wPath, ePath] : [ePath, wPath];
}

/**
 * Fill the polar rows the hemisphere composite leaves empty.
 *
 * Cutting the cloud deck off at a hard line of latitude would draw a straight
 * edge across the planet, so the rows with no retrieval fade into NASA's
 * pre-assembled composite, brightness-matched to the rows on either side.
 * That is a different rendition of the same MODIS data rather than invented
 * weather, and it is noted in SOURCES.md.
 */
async function fillCloudPoles(buf, width, height) {
  const ref = await open(await fetchSource('cloudRef'))
    .resize(width, height, { kernel: 'lanczos3' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  const rowMean = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let s = 0;
    for (let x = 0; x < width; x++) s += buf[y * width + x];
    rowMean[y] = s / width;
  }
  let top = 0;
  while (top < height && rowMean[top] < 3) top++;
  let bottom = height - 1;
  while (bottom > top && rowMean[bottom] < 3) bottom--;

  // brightness-match the reference to the rows that do have retrieval
  let sa = 0;
  let sb = 0;
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < width; x++) {
      sa += buf[y * width + x];
      sb += ref[y * width + x];
    }
  }
  const gain = sb > 0 ? sa / sb : 1;

  const ramp = Math.max(4, Math.round(height * 0.02));
  for (let y = 0; y < height; y++) {
    let w = 1;
    if (y < top + ramp) w = Math.max(0, (y - top) / ramp);
    else if (y > bottom - ramp) w = Math.max(0, (bottom - y) / ramp);
    if (w >= 1) continue;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      buf[i] = Math.min(255, Math.round(buf[i] * w + ref[i] * gain * (1 - w)));
    }
  }
  console.log(
    `  cloud retrieval rows ${top}..${bottom} of ${height}; poles blended from the reference`,
  );
  return buf;
}

async function main() {
  const only = process.argv[2];
  console.log('Earth + Moon asset build');

  if (!only || only === 'earth') {
    console.log('\nEarth');
    const day = await fetchSource('earthDay');
    await pyramid(day, OUT_EARTH, 'day', [1024, 2048, 4096, 8192], { quality: 86 });

    const night = await fetchSource('earthNight');
    await pyramid(night, OUT_EARTH, 'night', [1024, 2048], { quality: 84 });

    const topo = await fetchSource('earthTopo');
    for (const w of [2048, 4096]) {
      await normalMap(topo, path.join(OUT_EARTH, `normal_${w / 1024}k.webp`), {
        metresPerUnit: SOURCES.earthTopo.metresPerUnit,
        radiusM: EARTH_RADIUS_M,
        width: w,
        sixteenBit: false,
      });
    }
    await oceanRoughness(day, path.join(OUT_EARTH, 'orm_2k.webp'), 2048);

    const order = await cloudOrder(await fetchSource('cloudE'), await fetchSource('cloudW'));
    for (const w of [1024, 2048, 4096]) {
      await writeWebp(await cloudMap(order, w), path.join(OUT_EARTH, `clouds_${w / 1024}k.webp`), {
        quality: 84,
        effort: 5,
      });
    }
  }

  if (!only || only === 'moon') {
    console.log('\nMoon');
    const colour = await fetchSource('moonColor');
    await pyramid(colour, OUT_MOON, 'color', [1024, 2048, 4096, 8192], { quality: 86 });

    const dem64 = await fetchSource('moonDem64');
    for (const w of [2048, 4096, 8192]) {
      await normalMap(dem64, path.join(OUT_MOON, `normal_${w / 1024}k.webp`), {
        metresPerUnit: SOURCES.moonDem64.metresPerUnit,
        radiusM: MOON_RADIUS_M,
        width: w,
        sixteenBit: true,
      });
    }
    // Displacement for the closest LOD. Quantising to 8 bits over the Moon's
    // actual 20 km of relief leaves ~78 m per level, finer than the 2k grid
    // can resolve horizontally anyway. MOON_DISPLACEMENT_KM in
    // src/scene/moon.ts must match the range printed here.
    const W = 2048;
    const H = 1024;
    const field = await heightField(dem64, W, H, true);
    let min = Infinity;
    let max = -Infinity;
    for (const v of field) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const halfM = SOURCES.moonDem64.metresPerUnit;
    const rangeM = (max - min) * halfM;
    console.log(
      `  height range at 2k: DN ${min}..${max} = ${rangeM.toFixed(0)} m ` +
        `(${(min * halfM - 10000).toFixed(0)}..${(max * halfM - 10000).toFixed(0)} m about R=1737.4 km)`,
    );
    const disp = Buffer.allocUnsafe(W * H);
    const span = max - min || 1;
    for (let i = 0; i < field.length; i++) {
      disp[i] = Math.round(((field[i] - min) / span) * 255);
    }
    await writeWebp(
      sharp(disp, { raw: { width: W, height: H, channels: 1 } }),
      path.join(OUT_MOON, 'height_2k.webp'),
      { quality: 94, effort: 6 },
    );
    console.log(`  MOON_DISPLACEMENT_KM = ${(rangeM / 1000).toFixed(3)}`);
  }

  for (const dir of [OUT_EARTH, OUT_MOON]) {
    if (!(await exists(dir))) continue;
    const files = await readdir(dir);
    let total = 0;
    for (const f of files) total += (await stat(path.join(dir, f))).size;
    console.log(`\n${path.relative(ROOT, dir)}: ${files.length} files, ${(total / 1e6).toFixed(1)} MB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
