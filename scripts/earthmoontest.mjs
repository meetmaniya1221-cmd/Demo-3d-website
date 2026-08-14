/**
 * Close-range Earth and Moon check.
 *
 * Flies the spacecraft to every viewpoint the layered renderer is supposed to
 * handle - approach, day side, night side, terminator, low pass, then the Moon
 * and the view back home - and asserts on what actually reached the screen.
 * Pixels, not state: a shader that fails to compile leaves the app perfectly
 * "working" and the window black, and state assertions never notice.
 *
 * Usage: node scripts/earthmoontest.mjs [--url http://localhost:4173] [--out shots/earthmoon]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const URL = argOf('url', 'http://localhost:4173/');
const OUT = argOf('out', 'shots/earthmoon');
mkdirSync(OUT, { recursive: true });

const problems = [];
const results = [];

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', (m) => {
  const t = m.type();
  if (t !== 'error' && t !== 'warning') return;
  const text = m.text();
  if (/deprecat|Third-party cookie/i.test(text)) return;
  problems.push(`console.${t}: ${text}`);
  console.log(`  ! console.${t}: ${text}`);
});
page.on('pageerror', (e) => {
  problems.push(`pageerror: ${e.message}`);
  console.log(`  ! pageerror: ${e.message}`);
});

/**
 * Statistics over the part of the frame the cockpit does not cover.
 *
 * The window aperture is the middle of the screen, so sampling the centre box
 * measures what the pilot is actually looking at rather than the hull.
 */
function frameStats(name) {
  const png = PNG.sync.read(readFileSync(`${OUT}/${name}.png`));
  const { width, height, data } = png;
  const x0 = Math.round(width * 0.3);
  const x1 = Math.round(width * 0.7);
  const y0 = Math.round(height * 0.25);
  const y1 = Math.round(height * 0.6);
  let sum = 0;
  let lit = 0;
  let n = 0;
  let blue = 0;
  let warm = 0;
  let warmMax = -255;
  const hist = new Array(16).fill(0);
  let contrast = 0;
  let cn = 0;
  const lum = (o) => 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++, n++) {
      const o = (y * width + x) * 4;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += l;
      if (l > 20) lit++;
      if (b > r + 14 && b > 30) blue++;
      if (r > b + 22 && r > 40) warm++;
      // Peak warmth over the lit surface. The sunset line is a thin band, so
      // any average over the disc drowns it in ocean and blue limb - but its
      // warmest pixels are twice as red-shifted as anything full daylight
      // produces, and that separation is clean.
      if (l > 25 && r - b > warmMax) warmMax = r - b;
      hist[Math.min(15, Math.floor(l / 16))]++;
      // Only count texture on the lit body. Requiring the neighbours to be
      // bright too is what keeps the star field out: a star is one bright
      // pixel on black, which is maximal local contrast and would otherwise
      // score an empty frame as highly detailed.
      if (l > 45 && x + 1 < x1 && y + 1 < y1) {
        const rx = lum(o + 4);
        const ry = lum(o + width * 4);
        if (rx > 35 && ry > 35) {
          contrast += Math.abs(l - rx) + Math.abs(l - ry);
          cn++;
        }
      }
    }
  }
  const detail = cn > 0 ? contrast / cn : 0;
  return {
    mean: +(sum / n).toFixed(2),
    litFrac: +(lit / n).toFixed(3),
    blueFrac: +(blue / n).toFixed(3),
    warmFrac: +(warm / n).toFixed(3),
    // spread of the luminance histogram: a flat grey ball and a planet with
    // continents, weather and a terminator score very differently
    spread: +(hist.filter((c) => c > n * 0.005).length / 16).toFixed(3),
    // mean absolute neighbour difference: this is the one that actually tracks
    // resolvable surface detail. A histogram can widen just because a
    // terminator crossed the frame, but only real texture raises local
    // contrast, so this is what "the craters sharpened" has to be measured on.
    detail: +detail.toFixed(3),
    warmMax,
  };
}

const step = async (name, fn, settle = 2600) => {
  await fn();
  // the highest rungs are multi-megabyte; give them time to arrive so the
  // capture shows the detail the distance actually asked for
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const s = frameStats(name);
  results.push({ name, ...s });
  console.log(`  ${name.padEnd(26)} ${JSON.stringify(s)}`);
  return s;
};

const place = (id, bearing, radii) =>
  page.evaluate(
    ([i, b, r]) => window.__orrery.spacecraft.placeRelative(i, b, r),
    [id, bearing, radii],
  );

const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) problems.push(`${label}: ${detail ?? 'assertion failed'}`);
};

console.log(`\nEarth + Moon close-range check @ ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__orrery, null, { timeout: 60_000 });
// dismiss the splash - it is a full-screen scrim and would dominate every
// pixel statistic below
await page.click('[data-act="explore"]');
await page.waitForTimeout(2500);
await page.evaluate(() => window.__orrery.enterSpacecraft());
await page.waitForFunction(() => window.__orrery.spacecraft.phase() === 'flying', null, {
  timeout: 30_000,
});
// hold the clock so every viewpoint is lit identically and repeatably
await page.evaluate(() => window.__orrery.spacecraft.setPaused(true));
// the HUD panels sit over the glass; hide them so the statistics describe the
// view through the window rather than the instruments in front of it
await page.addStyleTag({
  content: '.sc-nav,.sc-location,.sc-deck,.sc-top,.sc-orbit,.sc-help,.sc-navmap{opacity:0 !important}',
});

console.log('\nEarth');
const far = await step('earth-01-far', () => place('earth', 'day', 60));
const approach = await step('earth-02-approach', () => place('earth', 'day', 12));
const day = await step('earth-03-day', () => place('earth', 'day', 3));
const term = await step('earth-04-terminator', () => place('earth', 'terminator', 2.6));
const night = await step('earth-05-night', () => place('earth', 'night', 2.4));
const low = await step('earth-06-low-pass', () => place('earth', 'day', 1.35));
const polar = await step('earth-07-polar', () => place('earth', 'polar', 3));

check('Earth is lit and visible on approach', day.litFrac > 0.12, `litFrac=${day.litFrac}`);
check('detail grows with proximity', day.detail > far.detail, `far=${far.detail} close=${day.detail}`);
check('day side reads as blue', day.blueFrac > 0.05, `blueFrac=${day.blueFrac}`);
check(
  'night side is dark but not empty',
  night.mean < day.mean * 0.55 && night.litFrac > 0.004,
  `night mean=${night.mean} vs day=${day.mean}, litFrac=${night.litFrac}`,
);
check(
  'terminator light is redder than full daylight',
  term.warmMax > day.warmMax + 6,
  `peak warmth ${term.warmMax} at the terminator vs ${day.warmMax} in full sun`,
);
check('low pass still renders', low.litFrac > 0.15, `litFrac=${low.litFrac}`);
check('polar view renders', polar.litFrac > 0.08, `litFrac=${polar.litFrac}`);
check('approach is brighter than empty space', approach.mean > 3, `mean=${approach.mean}`);

console.log('\nMoon');
const mFar = await step('moon-01-far', () => place('moon', 'day', 40));
const mDay = await step('moon-02-day', () => place('moon', 'day', 3));
const mLow = await step('moon-03-low-pass', () => place('moon', 'day', 1.3));
const mTerm = await step('moon-04-terminator', () => place('moon', 'terminator', 2.2));

check('Moon is lit up close', mDay.litFrac > 0.12, `litFrac=${mDay.litFrac}`);
check(
  'crater detail resolves on approach',
  mDay.detail > mFar.detail * 1.3,
  `far=${mFar.detail} close=${mDay.detail}`,
);
check('surface still textured on a low pass', mLow.detail > 1.5, `detail=${mLow.detail}`);
check(
  'Moon reads grey, not blue',
  mDay.blueFrac < 0.05,
  `blueFrac=${mDay.blueFrac}`,
);
check(
  'terminator shows relief shadows',
  mTerm.detail > mDay.detail,
  `terminator=${mTerm.detail} vs full-face=${mDay.detail}`,
);
check(
  'lunar night side goes dark',
  mTerm.mean < mDay.mean * 0.6,
  `terminator mean=${mTerm.mean} vs day=${mDay.mean}`,
);

// Earth from the Moon: park beside the Moon and turn to look home.
console.log('\nEarth from the Moon');
await step('moon-05-earthrise', async () => {
  await place('moon', 'day', 2.2);
  await page.evaluate(() => {
    const d = window.__orrery.spacecraft;
    d.target('earth');
    d.follow();
  });
});
const earthrise = results[results.length - 1];
check('Earth is visible from lunar distance', earthrise.litFrac > 0.001, `litFrac=${earthrise.litFrac}`);

// performance at the most expensive viewpoint
console.log('\nPerformance');
await place('earth', 'day', 1.6);
await page.waitForTimeout(2500);
const measureFps = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
          else resolve(+(frames / ((performance.now() - t0) / 1000)).toFixed(2));
        };
        requestAnimationFrame(tick);
      }),
  );
const fps = await measureFps();
const mem = await page.evaluate(() => {
  const i = window.__orrery.renderer.info;
  return { textures: i.memory.textures, geometries: i.memory.geometries, calls: i.render.calls };
});
// Reference point: the same scene with Earth far enough away that the cloud
// and atmosphere shells cover almost no pixels. These tests run on
// SwiftShader, where a full-screen alpha pass is the entire frame budget, so
// an absolute frame rate measures the rasteriser rather than the shader. The
// ratio between two real app states is what would catch a runaway.
await place('earth', 'day', 500);
await page.waitForTimeout(2500);
const farFps = await measureFps();
console.log(`  low Earth orbit ${fps} fps vs 500 radii ${farFps} fps (software rasteriser)`);
console.log(`  ${JSON.stringify(mem)}`);
check('frames still complete in low orbit', fps > 0.8, `${fps} fps`);
check(
  'close-range layers stay within budget',
  farFps / fps < 6,
  `${(farFps / fps).toFixed(1)}x the far-view frame cost`,
);
check('texture count is bounded', mem.textures < 80, `${mem.textures} textures`);

console.log(`\n${problems.length ? `FAILURES (${problems.length}):` : 'All checks passed.'}`);
for (const p of problems) console.log(`  - ${p}`);
await browser.close();
process.exit(problems.length ? 1 : 0);
