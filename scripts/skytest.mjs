/**
 * All-sky Milky Way check.
 *
 * Points the camera in known directions and asks the rendered pixels whether
 * the sky behaves like the real one: the band where the survey says it is, the
 * galactic centre brighter than the anticentre, the poles dark, and the same
 * sky whichever way you turn - with no seam at the wrap and no pinch at the
 * poles, which are the two ways an equirectangular map gives itself away.
 *
 * Directions are computed from galactic coordinates through the app's own
 * scene->galactic matrix, so a mis-oriented sky fails here rather than looking
 * plausible.
 *
 * Usage: node scripts/skytest.mjs [--url ...] [--out shots/sky]
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
const OUT = argOf('out', 'shots/sky');
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
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Third-party/.test(m.text())) errors.push(m.text());
});

/** Mean luminance and colour of a capture, plus a seam detector. */
function frame(name) {
  const png = PNG.sync.read(readFileSync(`${OUT}/${name}.png`));
  const { width, height, data } = png;
  let sum = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  const n = width * height;
  const colLum = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const l = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
      sum += l;
      r += data[o];
      g += data[o + 1];
      b += data[o + 2];
      colLum[x] += l / height;
    }
  }
  // A seam is a one-or-two-pixel column that differs sharply from both of its
  // neighbours across the whole height. Real sky structure is never that thin
  // and never that vertical.
  //
  // The outer margin is skipped: the cockpit's corner brackets are exactly
  // such a column, they sit at the same x in every capture whatever the sky is
  // doing, and they were being reported as a seam at the galactic pole. The
  // threshold also scales with the frame's own brightness - an absolute one
  // makes any dark frame look discontinuous.
  let worstSeam = 0;
  let seamX = -1;
  const margin = Math.round(width * 0.05);
  const frameMean = sum / n;
  const floor = Math.max(4, frameMean * 0.25);
  for (let x = margin; x < width - margin; x++) {
    const jump = Math.abs(colLum[x] - (colLum[x - 2] + colLum[x + 2]) / 2);
    const local = (Math.abs(colLum[x - 2] - colLum[x - 1]) + Math.abs(colLum[x + 1] + colLum[x + 2])) / 4 + 1;
    const ratio = jump / local;
    if (jump > floor && ratio > worstSeam) {
      worstSeam = ratio;
      seamX = x;
    }
  }
  return {
    mean: +(sum / n).toFixed(2),
    r: +(r / n).toFixed(1),
    g: +(g / n).toFixed(1),
    b: +(b / n).toFixed(1),
    seam: +worstSeam.toFixed(2),
    seamX,
  };
}

console.log(`\nAll-sky Milky Way check @ ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__orrery, null, { timeout: 90_000 });
await page.click('[data-act="explore"]').catch(() => {});
await page.waitForTimeout(3000);

// Board the cockpit: it is the view the sky matters most in, and it lets the
// camera be aimed exactly rather than orbited.
await page.evaluate(() => window.__orrery.enterSpacecraft());
await page
  .waitForFunction(() => window.__orrery.spacecraft.phase() === 'flying', null, { timeout: 40_000 })
  .catch(() => {});
await page.waitForTimeout(2500);
// hide the cockpit and the HUD so the measurement sees sky, not hull
await page.addStyleTag({ content: '.sc-hud{opacity:0 !important}' });
await page.evaluate(() => {
  const sc = window.__orrery.spacecraft;
  sc.setPaused(true);
  if (sc.hideCockpit) sc.hideCockpit();
});

/**
 * Aim the ship at a galactic direction and capture.
 * Uses the app's own matrix, inverted, so the test cannot disagree with the
 * renderer about where the galactic centre is.
 */
async function look(name, lDeg, bDeg) {
  await page.evaluate(
    ([l, b]) => {
      const THREE = window.__orrery.THREE;
      const gal = window.__orrery.galacticMatrix();
      const lr = (l * Math.PI) / 180;
      const br = (b * Math.PI) / 180;
      // galactic cartesian -> scene direction (the matrix is orthonormal)
      const g = new THREE.Vector3(
        Math.cos(br) * Math.cos(lr),
        Math.cos(br) * Math.sin(lr),
        Math.sin(br),
      );
      const inv = gal.clone().transpose();
      const dir = g.applyMatrix3(inv).normalize();
      const ship = window.__orrery.spacecraft.ship;
      // Drop out of any flight mode first. Follow mode with gaze lock re-aims
      // the ship at its target every frame, which silently overrode the
      // bearing this test asked for - every capture was pointing at Earth.
      ship.abort();
      ship.gazeLock = false;
      const target = ship.pos.clone().addScaledVector(dir, 1000);
      ship.lookAtPoint(target);
      ship.headYawTarget = 0;
      ship.headPitchTarget = 0;
      ship.headYaw = 0;
      ship.headPitch = 0;
    },
    [lDeg, bDeg],
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const f = frame(name);
  console.log(`  ${name.padEnd(22)} l=${String(lDeg).padStart(4)} b=${String(bDeg).padStart(4)}  ${JSON.stringify(f)}`);
  return f;
}

console.log('\nGalactic landmarks');
const centre = await look('01-galactic-centre', 0, 0);
const anticentre = await look('02-anticentre', 180, 0);
const npole = await look('03-north-pole', 0, 90);
const spole = await look('04-south-pole', 0, -90);
const cygnus = await look('05-cygnus', 80, 0);
const carina = await look('06-carina', 285, 0);
const offplane = await look('07-off-plane', 0, 45);

check(
  'the galactic centre is the brightest direction in the sky',
  centre.mean > anticentre.mean && centre.mean > offplane.mean,
  `centre=${centre.mean} anticentre=${anticentre.mean} b=45 ${offplane.mean}`,
);
check(
  'the anticentre is still plainly the Milky Way',
  anticentre.mean > npole.mean * 1.4,
  `anticentre=${anticentre.mean} pole=${npole.mean}`,
);
check(
  'both galactic poles are dark',
  npole.mean < centre.mean * 0.5 && spole.mean < centre.mean * 0.5,
  `north=${npole.mean} south=${spole.mean} centre=${centre.mean}`,
);
check(
  'the band runs through Cygnus and Carina',
  cygnus.mean > npole.mean * 1.3 && carina.mean > npole.mean * 1.3,
  `cygnus=${cygnus.mean} carina=${carina.mean} pole=${npole.mean}`,
);
check(
  'the bulge is warmer than the high-latitude sky',
  centre.r / Math.max(centre.b, 1) > offplane.r / Math.max(offplane.b, 1),
  `centre r/b=${(centre.r / centre.b).toFixed(3)} off-plane r/b=${(offplane.r / offplane.b).toFixed(3)}`,
);

console.log('\nSeams and continuity');
// Sweep the wrap at l = 180 and both poles, where an equirectangular map
// would betray itself.
const sweep = [];
for (let l = 150; l <= 210; l += 10) sweep.push(await look(`10-wrap-l${l}`, l, 0));
const worstWrapSeam = Math.max(...sweep.map((s) => s.seam));
check('no seam at the l = 180 wrap', worstWrapSeam < 3, `worst column ratio ${worstWrapSeam}`);

const polar = [];
for (const b of [70, 80, 85, 89]) polar.push(await look(`11-polar-b${b}`, 0, b));
const worstPolarSeam = Math.max(...polar.map((s) => s.seam));
check('no pinch or seam approaching the galactic pole', worstPolarSeam < 3, `worst column ratio ${worstPolarSeam}`);

// continuity: neighbouring directions must not jump in brightness
let worstJump = 0;
for (let i = 1; i < sweep.length; i++) {
  worstJump = Math.max(worstJump, Math.abs(sweep[i].mean - sweep[i - 1].mean));
}
check('brightness varies smoothly across the wrap', worstJump < 12, `largest step ${worstJump.toFixed(2)}`);

console.log('\nThe sky is a background, not an object');
// Travel: the sky must not change with position. It is at infinity.
const before = await look('20-before-travel', 0, 0);
await page.evaluate(() => window.__orrery.spacecraft.teleportTo('saturn', 1.4));
await page.waitForTimeout(1500);
const after = await look('21-after-travel-to-saturn', 0, 0);
check(
  'travelling to Saturn does not move the Milky Way',
  Math.abs(after.mean - before.mean) < Math.max(3, before.mean * 0.35),
  `before=${before.mean} after=${after.mean}`,
);

for (const e of [...new Set(errors)]) {
  problems.push(`console: ${e.slice(0, 140)}`);
  console.log(`  ! ${e.slice(0, 120)}`);
}

console.log(`\n${problems.length ? `FAILURES (${problems.length}):` : 'All sky checks passed.'}`);
for (const p of problems) console.log(`  - ${p}`);
await browser.close();
process.exit(problems.length ? 1 : 0);
