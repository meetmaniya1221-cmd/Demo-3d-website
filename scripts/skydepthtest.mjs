/**
 * Does the sky composite over the foreground?
 *
 * The decisive measurement is a difference, not a judgement about brightness:
 * capture a planet's disc with the Milky Way on, capture it again with the
 * Milky Way off, and subtract. A correct background contributes nothing inside
 * the silhouette of an opaque body, so every pixel of the disc must be
 * identical between the two. Any non-zero difference is the sky bleeding
 * through, however faint - which is exactly the failure that went unnoticed
 * while the band was dim procedural noise.
 *
 * Two things have to be true for that subtraction to mean anything.
 *
 * The clock must be stopped. Every surface here is animated - clouds drift,
 * planets rotate, the corona churns, the atmosphere shader runs on elapsed
 * time - so two captures taken half a second apart differ everywhere no
 * matter what the sky is doing. An earlier version of this test did not
 * freeze, and duly reported that the sky was bleeding through Jupiter: it was
 * measuring Jupiter turning.
 *
 * And the claim needs a control. Each body is captured a third time with the
 * sky left exactly as it was, so the run reports its own noise floor next to
 * the measurement. If the control is as large as the difference, the
 * difference is not the sky.
 *
 * Checked on the bodies the report named, in both the solar-system view and
 * the cockpit, and on orbit lines and labels as well.
 *
 * Usage: node scripts/skydepthtest.mjs [--url ...] [--out shots/skydepth]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const URL = argOf('url', 'http://localhost:4173/');
const OUT = argOf('out', 'shots/skydepth');
mkdirSync(OUT, { recursive: true });

const problems = [];
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) problems.push(`${label}: ${detail ?? ''}`);
};

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Third-party/.test(m.text())) errors.push(m.text());
});

const load = (n) => PNG.sync.read(readFileSync(`${OUT}/${n}.png`));

/**
 * The pixels of a body's solid globe, from its projected disc.
 *
 * An earlier version thresholded on luminance instead, and that mask is
 * wrong in both directions. It swept in the additive star sprites and orbit
 * lines, which do not occlude anything - the sky is *supposed* to show
 * through them - and, worse, it swept in the atmospheric halo, which reaches
 * far past the limb and is semi-transparent by design. Differencing those
 * proves nothing, and no amount of eroding removes a halo sixty pixels wide.
 *
 * So the mask is geometric: the disc the scene says the body occupies,
 * shrunk to 0.9 R. Inside that circle there is opaque ground under every
 * pixel, an atmosphere in front of it is blending with the ground rather than
 * with the sky, and the margin clears the antialiased silhouette, where a
 * pixel really is part planet and part sky and differs for a good reason.
 * That circle is exactly what the report was about: the band crossing a
 * planet's face.
 */
function discMask(disc, width, height) {
  const mask = new Uint8Array(width * height);
  if (!disc) return { mask, count: 0 };
  const r = disc.r * 0.9;
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(disc.x - r));
  const x1 = Math.min(width - 1, Math.ceil(disc.x + r));
  const y0 = Math.max(0, Math.floor(disc.y - r));
  const y1 = Math.min(height - 1, Math.ceil(disc.y + r));
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - disc.x;
      const dy = y - disc.y;
      if (dx * dx + dy * dy <= r2) {
        mask[y * width + x] = 1;
        n++;
      }
    }
  }
  return { mask, count: n };
}

/**
 * Lit foreground, for the overview capture, where there is no single disc to
 * project - orbit lines, labels and belt particles. Eroded, because those are
 * additive: a four-pixel erosion leaves only what is genuinely solid.
 */
function litMask(off) {
  const { width, height, data } = off;
  const lit = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const l = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
    if (l > 30) lit[i] = 1;
  }
  const R = 4;
  const mask = new Uint8Array(width * height);
  let n = 0;
  for (let y = R; y < height - R; y++) {
    for (let x = R; x < width - R; x++) {
      let solid = 1;
      for (let dy = -R; dy <= R && solid; dy += R) {
        for (let dx = -R; dx <= R; dx += R) {
          if (!lit[(y + dy) * width + (x + dx)]) {
            solid = 0;
            break;
          }
        }
      }
      if (solid) {
        mask[y * width + x] = 1;
        n++;
      }
    }
  }
  return { mask, count: n };
}

/**
 * Difference between two captures inside a mask: the largest, the mean, and
 * the 99.99th percentile.
 *
 * The percentile is what the assertion uses. An absolute maximum over forty
 * thousand pixels is an extreme-value statistic and wanders on its own: the
 * same build failed one run of this test at 10 and passed the next at 6, while
 * the mean sat unmoved at 0.05 both times. Tuning the allowance until the
 * flake stopped would have been fitting a constant to noise.
 *
 * A percentile is the honest statistic for the claim being made, and it is
 * not a weaker one. The failure this test exists to catch is a sky painted
 * across a whole disc - tens of thousands of pixels - which moves the
 * percentile and the mean together and by a lot. Nothing real hides in the
 * top four pixels of a frame.
 */
function diff(aName, bName, mask, count) {
  const a = load(aName);
  const b = load(bName);
  let max = 0;
  let sum = 0;
  // channel-sum differences run 0..765, small enough to bucket exactly
  const hist = new Int32Array(766);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const o = i * 4;
    const d =
      Math.abs(a.data[o] - b.data[o]) +
      Math.abs(a.data[o + 1] - b.data[o + 1]) +
      Math.abs(a.data[o + 2] - b.data[o + 2]);
    if (d > max) max = d;
    sum += d;
    hist[d]++;
  }
  const cut = Math.max(1, Math.floor(count * 0.0001));
  let above = 0;
  let p9999 = 0;
  for (let v = 765; v >= 0; v--) {
    above += hist[v];
    if (above >= cut) {
      p9999 = v;
      break;
    }
  }
  return { max, p9999, mean: +(sum / Math.max(count, 1)).toFixed(3) };
}

const setSky = (on) => page.evaluate((v) => window.__orrery.setSkyVisible(v), on);
const freeze = (v) => page.evaluate((f) => window.__orrery.freeze(f), v);
const setBloom = (v) => page.evaluate((b) => window.__orrery.setBloom(b), v);

/**
 * Rectangles of the frosted UI, which have to come out of every mask.
 *
 * The panels are `backdrop-filter: blur(10px)` glass. A blurred backdrop
 * samples a neighbourhood, so a panel lying across a planet's limb mixes sky
 * from *outside* the disc into pixels *inside* it - and the difference test
 * then reports that the sky reached the planet. It did, but through the
 * browser's compositor rather than through the depth buffer, and frosting the
 * UI is the intended behaviour. Scanning outward from Mercury's centre found
 * the silhouette at 121, 122 and 122 pixels to the right, left and up, and at
 * 105 downward - straight into the engine panel. That asymmetry is the whole
 * of the residual.
 *
 * The margin is generous: the widest blur in the sheet is 14px, and a
 * Gaussian reaches about three sigma.
 */
const CHROME_MARGIN = 48;
const chromeRects = () =>
  page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.tagName === 'CANVAS') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const paints =
        cs.backdropFilter !== 'none' ||
        (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent');
      if (!paints) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      out.push([r.left, r.top, r.right, r.bottom]);
    }
    return out;
  });

function dropChrome(mask, rects, width, height) {
  let removed = 0;
  for (const [l, t, r, b] of rects) {
    const x0 = Math.max(0, Math.floor(l - CHROME_MARGIN));
    const x1 = Math.min(width - 1, Math.ceil(r + CHROME_MARGIN));
    const y0 = Math.max(0, Math.floor(t - CHROME_MARGIN));
    const y1 = Math.min(height - 1, Math.ceil(b + CHROME_MARGIN));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * width + x;
        if (mask[i]) {
          mask[i] = 0;
          removed++;
        }
      }
    }
  }
  return removed;
}

/**
 * Capture a body with the sky on, again with it off, and difference the disc.
 *
 * Bloom is off for these captures, and that is a separation of two different
 * questions rather than a way of making a number smaller. The question here is
 * whether the background reaches a planet's surface through the depth buffer.
 * Bloom is a deliberate full-frame post-process that spreads light across
 * everything by design, and on Earth it does have a measurable effect: Earth's
 * atmospheric halo extends past the limb, the sky behind it legitimately
 * shines through it, and bloom then smears that back over the disc. With bloom
 * off the disc is untouched - literally zero differing pixels out to 0.7 R -
 * and with it on the residual is about 0.02 of a level per channel.
 *
 * That is not the reported bug and it is not a depth fault, so it is measured
 * separately below rather than folded in here, where it would sit on top of
 * every body and hide a real regression in Earth's noise.
 *
 * @param bodyId  measure inside this body's projected disc; null falls back to
 *                the eroded lit mask, for captures with no single subject
 */
async function pair(name, bodyId, prepare, { bloom = false } = {}) {
  await prepare();
  await setBloom(bloom);
  await setSky(true);
  await page.waitForTimeout(900);
  await freeze(true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}-on.png` });
  // Control: nothing has been touched between these two captures. Whatever it
  // measures is the renderer's own frame-to-frame noise, not the sky.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}-ctl.png` });
  // The disc and the chrome are read while the scene is still frozen and
  // framed, so the mask describes this capture rather than wherever the body
  // drifts to next.
  const disc = bodyId ? await page.evaluate((b) => window.__orrery.discOf(b), bodyId) : null;
  const rects = await chromeRects();
  await setSky(false);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}-off.png` });
  await setSky(true);
  await freeze(false);
  await setBloom(true);

  const off = load(`${name}-off`);
  const built = bodyId ? discMask(disc, off.width, off.height) : litMask(off);
  const { mask } = built;
  const covered = dropChrome(mask, rects, off.width, off.height);
  const count = built.count - covered;
  if (count < 200) {
    console.log(`  ${name.padEnd(22)} no body found (${count} px) - skipped`);
    return { pixels: count, max: -1, p9999: -1, control: -1, controlMean: 0 };
  }
  const b = diff(`${name}-on`, `${name}-off`, mask, count);
  const ctl = diff(`${name}-ctl`, `${name}-on`, mask, count);
  console.log(
    `  ${name.padEnd(22)} body px=${String(count).padStart(6)}` +
      `  p99.99 Δ=${String(b.p9999).padStart(3)}  max Δ=${String(b.max).padStart(3)}` +
      `  mean Δ=${String(b.mean).padStart(6)}  (control p99.99 ${ctl.p9999}, max ${ctl.max})`,
  );
  return {
    pixels: count,
    max: b.max,
    p9999: b.p9999,
    mean: b.mean,
    control: ctl.p9999,
    controlMax: ctl.max,
    controlMean: ctl.mean,
  };
}

console.log(`\nSky depth / compositing check @ ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__orrery, null, { timeout: 90_000 });
await page.click('[data-act="explore"]').catch(() => {});
await page.waitForTimeout(3500);

console.log('\nSolar system view');
const bodies = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'moon'];
const results = [];
for (const id of bodies) {
  results.push([id, await pair(`sys-${id}`, id, async () => {
    await page.evaluate((b) => window.__orrery.select(b), id);
    await page.waitForTimeout(3200);
  })]);
}

/**
 * A body passes when turning the sky off changes nothing inside it beyond what
 * the renderer changes by itself. The control is that self-difference, so the
 * comparison is against the control rather than against zero - a literal zero
 * would fail on the renderer's own dither instead of on the bug. Both maxima
 * are extremes over a hundred thousand pixels, which is a jumpy statistic, so
 * the max is allowed a few counts of slack and the mean carries the weight:
 * a sky genuinely painted across a disc moves the mean, not one pixel.
 */
// Both halves are measured against the control rather than against a constant.
// An absolute mean bound looked fine until Mercury's solar-system framing came
// in at 0.472 against a limit of 0.5 - passing, but only because the constant
// happened to sit where it did, and that capture's own control was just as
// noisy. A criterion that says "no worse than this same scene compares with
// itself" cannot be quietly tuned into passing.
const clean = (b) => b.p9999 <= b.control + 2 && b.mean <= Math.max(b.controlMean * 2, 0.2);

for (const [id, b] of results) {
  check(
    `the sky does not composite over ${id}`,
    clean(b),
    `p99.99 channel-sum difference inside the disc = ${b.p9999} (max ${b.max}) over ${b.pixels} px, mean ${b.mean} (noise floor ${b.control})`,
  );
}

console.log('\nOrbit lines, labels and the belts');
// The overview asks a different question. An orbit line and a belt particle
// are additive - they are glowing marks, not walls - so the sky showing
// through them is correct, and differencing them proves nothing either way.
// What must be true is that they are drawn ON TOP: brighter than the sky
// beside them, wherever the band happens to be. That is the property the
// report was really about, and unlike a difference it fails loudly if the sky
// ever gets painted over an overlay.
await page.evaluate(() => window.__orrery.select(null));
await page.waitForTimeout(2500);
await page.evaluate(() => window.__orrery.freeze(true));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/sys-overview-on.png` });
const overviewChrome = await chromeRects();
await setSky(false);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/sys-overview-off.png` });
await setSky(true);
await page.evaluate(() => window.__orrery.freeze(false));

{
  const on = load('sys-overview-on');
  const off = load('sys-overview-off');
  const { width, height } = off;
  const lum = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
  // Overlay pixels: bright against a black sky, and locally a ridge - which
  // is what an orbit line or a label stroke is and what a broad glow is not.
  // The surroundings are the MEDIAN of a ring, not the maximum of it. The sky
  // is full of stars, and a single bright one landing on a sample point makes
  // a perfectly composited orbit line look as though it had been covered up.
  const ring = (p, x, y) => {
    const s = [];
    for (const [dx, dy] of [
      [6, 0], [-6, 0], [0, 6], [0, -6],
      [5, 5], [-5, 5], [5, -5], [-5, -5],
    ]) {
      s.push(lum(p, ((y + dy) * width + (x + dx)) * 4));
    }
    s.sort((a, b) => a - b);
    return (s[3] + s[4]) / 2;
  };

  // frosted panels are excluded here too - a blurred backdrop is not an orbit
  // line, and its contrast against the sky is the compositor's business
  const usable = new Uint8Array(width * height).fill(1);
  dropChrome(usable, overviewChrome, width, height);

  let n = 0;
  let kept = 0;
  let worstDrop = 0;
  const offenders = [];
  for (let y = 8; y < height - 8; y++) {
    for (let x = 8; x < width - 8; x++) {
      if (!usable[y * width + x]) continue;
      const i = (y * width + x) * 4;
      const here = lum(off, i);
      if (here < 45) continue;
      // The mark has to stand alone against empty sky. Inside the stroke of a
      // grid label the six-pixel ring lands on more of the same glyph, so the
      // "surroundings" are the letter itself and the comparison is
      // meaningless - which is exactly where this check used to report a
      // handful of losses. An isolated mark is the case the report is about
      // anyway: a line or a particle with sky on both sides of it.
      const around = ring(off, x, y);
      if (around > 20) continue;
      if (here - around < 25) continue; // a ridge, not a broad glow
      n++;
      // With the sky on, the mark must still stand above its own surroundings
      const contrast = lum(on, i) - ring(on, x, y);
      if (contrast > 0) kept++;
      else {
        worstDrop = Math.min(worstDrop, contrast);
        if (offenders.length < 12) offenders.push(`${x},${y}:${contrast.toFixed(0)}`);
      }
    }
  }
  if (offenders.length) console.log(`     lost contrast at ${offenders.join(' ')}`);
  const ratio = n ? kept / n : 0;
  console.log(`  sys-overview           overlay ridge px=${n}  still above the sky: ${(ratio * 100).toFixed(2)}%`);
  check(
    'orbit lines, labels and belt particles stay in front of the sky',
    n > 500 && ratio > 0.995,
    `${n} ridge pixels, ${(ratio * 100).toFixed(2)}% still brighter than their surroundings (worst ${worstDrop.toFixed(1)})`,
  );
}

console.log('\nSpacecraft cockpit');
await page.evaluate(() => window.__orrery.enterSpacecraft());
await page
  .waitForFunction(() => window.__orrery.spacecraft.phase() === 'flying', null, { timeout: 40_000 })
  .catch(() => {});
await page.waitForTimeout(2500);
await page.evaluate(() => window.__orrery.spacecraft.setPaused(true));

const cockpit = [];
for (const [id, radii] of [
  ['earth', 3],
  ['jupiter', 4],
  ['saturn', 4],
  ['moon', 3],
]) {
  cockpit.push([id, await pair(`sc-${id}`, id, async () => {
    await page.evaluate(
      ([b, r]) => window.__orrery.spacecraft.placeRelative(b, 'day', r),
      [id, radii],
    );
    await page.waitForTimeout(2200);
  })]);
}
for (const [id, b] of cockpit) {
  check(
    `in the cockpit the sky stays behind ${id}`,
    clean(b),
    `p99.99 difference = ${b.p9999} (max ${b.max}) over ${b.pixels} px, mean ${b.mean} (noise floor ${b.control})`,
  );
}

// The hull, which is drawn in its own pass over the scene.
//
// Its mask cannot come from luminance either: the glass is most of the frame
// and the star field behind it is bright, so a threshold selects the sky and
// then complains that the sky changed. Instead the cockpit is toggled off and
// on, and the pixels that move are, by construction, exactly the pixels the
// hull covers - the solid structure where the difference is large.
console.log('\nCockpit structure');
await page.evaluate(() => window.__orrery.spacecraft.placeRelative('earth', 'day', 8));
await page.waitForTimeout(1800);
await setSky(true);
await page.waitForTimeout(600);
await page.evaluate(() => window.__orrery.freeze(true));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/sc-hull-on.png` });
const hullChrome = await chromeRects();
await page.evaluate(() => window.__orrery.spacecraft.hideCockpit(true));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/sc-hull-bare.png` });
await page.evaluate(() => window.__orrery.spacecraft.hideCockpit(false));
await page.waitForTimeout(400);
await setSky(false);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/sc-hull-off.png` });
await setSky(true);
await page.evaluate(() => window.__orrery.freeze(false));

{
  const withHull = load('sc-hull-on');
  const bare = load('sc-hull-bare');
  const { width, height } = bare;
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const d =
      Math.abs(withHull.data[o] - bare.data[o]) +
      Math.abs(withHull.data[o + 1] - bare.data[o + 1]) +
      Math.abs(withHull.data[o + 2] - bare.data[o + 2]);
    // a large change means solid structure stands there, not glass
    if (d > 60) {
      mask[i] = 1;
      count++;
    }
  }
  count -= dropChrome(mask, hullChrome, width, height);
  const b = diff('sc-hull-on', 'sc-hull-off', mask, count);
  console.log(`  sc-hull                hull px=${String(count).padStart(6)}  p99.99 Δ=${b.p9999}  max Δ=${String(b.max).padStart(3)}  mean Δ=${b.mean}`);
  check(
    'the sky does not composite over the cockpit frame',
    count > 5000 && b.p9999 <= 2 && b.mean < 0.5,
    `p99.99 difference = ${b.p9999} (max ${b.max}) over ${count} structural px, mean ${b.mean}`,
  );
}

// The worst case, and the one the report showed: a body standing directly in
// front of the brightest part of the band. Everything above measures wherever
// the sky happened to be; this puts the galactic centre deliberately behind
// each body, which is where a compositing fault is most visible and where a
// merely dim sky would hide one.
console.log('\nSilhouetted against the galactic centre');
const worstCase = [];
for (const [id, radii] of [
  ['mercury', 6],
  ['earth', 3],
  ['jupiter', 4],
  ['moon', 3],
]) {
  worstCase.push([id, await pair(`gc-${id}`, id, async () => {
    await page.evaluate(
      ([b, r]) => {
        const THREE = window.__orrery.THREE;
        // scene direction of the galactic centre, l = 0 b = 0, through the
        // app's own matrix so the test cannot disagree with the renderer
        // about where the bulge is
        const gc = new THREE.Vector3(1, 0, 0)
          .applyMatrix3(window.__orrery.galacticMatrix().clone().transpose())
          .normalize();
        // stand off on the far side, so looking at the body looks into it
        window.__orrery.spacecraft.placeAlong(b, [-gc.x, -gc.y, -gc.z], r);
      },
      [id, radii],
    );
    await page.waitForTimeout(2200);
  })]);
}
for (const [id, b] of worstCase) {
  check(
    `the galactic centre stays behind ${id}`,
    clean(b),
    `p99.99 difference = ${b.p9999} (max ${b.max}) over ${b.pixels} px, mean ${b.mean} (noise floor ${b.control})`,
  );
}

// And now the part that was deliberately excluded above: with bloom on, how
// much sky-derived light does the post-process carry onto a disc? Earth is the
// worst case in the whole scene - the only body with a halo bright enough to
// bloom - so if it is negligible here it is negligible everywhere.
console.log('\nWhat bloom carries onto a disc');
const bloomed = await pair(
  'bloom-earth',
  'earth',
  async () => {
    await page.evaluate(() => window.__orrery.exitSpacecraft());
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__orrery.select('earth'));
    await page.waitForTimeout(3400);
  },
  { bloom: true },
);
check(
  'bloom carries no visible sky onto Earth',
  bloomed.mean < 0.5 && bloomed.p9999 <= 12,
  `p99.99 = ${bloomed.p9999} (max ${bloomed.max}), mean ${bloomed.mean} over ${bloomed.pixels} px` +
    ' - about a fiftieth of a level per channel, from bloom of Earth\'s own halo',
);

for (const e of [...new Set(errors)]) {
  problems.push(`console: ${e.slice(0, 140)}`);
  console.log(`  ! ${e.slice(0, 120)}`);
}

console.log(`\n${problems.length ? `FAILURES (${problems.length}):` : 'The sky is behind everything.'}`);
for (const p of problems) console.log(`  - ${p}`);
await browser.close();
process.exit(problems.length ? 1 : 0);
