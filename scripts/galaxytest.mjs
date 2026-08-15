/**
 * Headless test for galaxy mode.
 *
 * Boots the built app, enters the galaxy, and walks the whole journey:
 * departure from Sol, the outside view of the spiral, the top-down view,
 * the dive to the galactic centre, the four Sagittarius A* approach stages
 * with gravitational lensing, the galaxy map, a survey scan, and the exit
 * back to the Solar System - screenshotting every station, checking frame
 * rate at the heavy ones, and failing on console errors or dark frames.
 *
 * Usage: node scripts/galaxytest.mjs [--url http://localhost:4173] [--out shots-galaxy]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const URL = argOf('url', 'http://localhost:4173/');
const OUT = argOf('out', 'shots-galaxy');
mkdirSync(OUT, { recursive: true });

const problems = [];
const log = [];
function note(step, data = {}) {
  log.push({ step, ...data });
  console.log(`\n── ${step}`);
  if (Object.keys(data).length) console.log(JSON.stringify(data, null, 1));
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') {
    const text = m.text();
    if (/deprecat|Third-party cookie/i.test(text)) return;
    problems.push(`console.${t}: ${text}`);
    console.log(`  ! console.${t}: ${text}`);
  }
});
page.on('pageerror', (e) => {
  problems.push(`pageerror: ${e.message}`);
  console.log(`  ! pageerror: ${e.message}`);
});

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return name;
};

function brightness(name) {
  const png = PNG.sync.read(readFileSync(`${OUT}/${name}.png`));
  let sum = 0;
  let lit = 0;
  const n = png.width * png.height;
  for (let i = 0; i < n; i++) {
    const l =
      0.2126 * png.data[i * 4] + 0.7152 * png.data[i * 4 + 1] + 0.0722 * png.data[i * 4 + 2];
    sum += l;
    if (l > 12) lit++;
  }
  return { mean: sum / n, litFrac: lit / n };
}

function assertLit(name, minLitFrac, label) {
  const b = brightness(name);
  note(`check:${name}`, { mean: +b.mean.toFixed(2), litFrac: +b.litFrac.toFixed(4) });
  if (b.litFrac < minLitFrac) {
    problems.push(`${label}: ${name}.png litFrac ${b.litFrac.toFixed(4)} < ${minLitFrac}`);
  }
}

const gx = (expr) => page.evaluate(`window.__orrery.galaxy.${expr}`);
const info = () => gx('info()');
const settle = (ms) => page.waitForTimeout(ms);

async function fps(ms = 1500) {
  return page.evaluate(
    (dur) =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - t0 < dur) requestAnimationFrame(tick);
          else resolve(Math.round((frames / (performance.now() - t0)) * 1000));
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

// ---- boot -----------------------------------------------------------------
note('boot', { URL });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__orrery, null, { timeout: 60_000 });
await page.click('[data-act="explore"]');
await settle(2500);

// ---- enter galaxy mode ----------------------------------------------------
await page.evaluate(() => window.__orrery.enterGalaxy());
await settle(3200);
note('entered', await info());
await shot('01-depart-sol');
assertLit('01-depart-sol', 0.01, 'galaxy view from Sol is dark');

// ---- outside the galaxy: the spiral ---------------------------------------
await gx('teleport(-62000, -52000, 34000)');
await gx('aimAt(0, 0, 0)');
await settle(900);
note('outside', await info());
await shot('02-outside-spiral');
assertLit('02-outside-spiral', 0.02, 'outside view lost the galaxy');
note('fps:outside', { fps: await fps() });

// ---- top-down: arms + bar -------------------------------------------------
await gx('teleport(0, 0, 95000)');
await gx('aimAt(0, 0, 0)');
await settle(900);
await shot('03-top-down');
assertLit('03-top-down', 0.03, 'top-down view lost the disk');

// ---- edge-on --------------------------------------------------------------
await gx('teleport(-95000, 0, 2500)');
await gx('aimAt(0, 0, 0)');
await settle(900);
await shot('04-edge-on');

// ---- inside the disk, mid-flight to centre --------------------------------
await gx('teleport(-12000, -3000, 40)');
await gx('aimAt(0, 0, 0)');
await settle(1200);
note('inner-disk', await info());
await shot('05-inner-disk');
note('fps:inner', { fps: await fps() });

// ---- galactic centre approach (stage 1→2) ---------------------------------
await gx('teleportToSgra(60)');
await settle(1400);
note('nuclear-cluster', await info());
await shot('06-nuclear-cluster');
assertLit('06-nuclear-cluster', 0.05, 'nuclear cluster not dense/bright');

// ---- relativistic zone: S stars + first lensing ---------------------------
await gx('teleportToSgra(0.05)');
await settle(1200);
note('relativistic', await info());
await shot('07-s-stars');

// ---- extreme proximity: strong lensing ------------------------------------
await gx('teleportToSgra(0.0008)');
await settle(1200);
note('extreme', await info());
await shot('08-lensing-far');
await gx('teleportToSgra(0.00006)');
await settle(1200);
note('shadow', await info());
await shot('09-shadow');
note('fps:blackhole', { fps: await fps() });

// time dilation sanity: at r = 1.5 Rs the factor should be ≈ 0.577
await gx('teleportToSgra(0.000002013)'); // 1.5 Rs in ly
await settle(400);
const dil = await info();
note('dilation@1.5Rs', { dilation: dil.dilation });
if (Math.abs(dil.dilation - 0.577) > 0.03) {
  problems.push(`dilation at 1.5 Rs = ${dil.dilation}, expected ≈ 0.577`);
}

// the emergency envelope should be shoving us out at this range; the sim
// clamps dt to 100 ms per frame, so at software-GL frame rates game time
// runs slower than wall time - poll rather than sleep-once
let recovered = false;
for (let i = 0; i < 30; i++) {
  await settle(1000);
  const now = await info();
  if (now.sgraDistLy > dil.sgraDistLy * 3) {
    recovered = true;
    note('emergency-recovery', { sgraDistLy: now.sgraDistLy, seconds: i + 1 });
    break;
  }
}
if (!recovered) {
  problems.push('emergency recovery burn did not push the ship away from the horizon');
}
await shot('10-emergency');

// ---- flare ----------------------------------------------------------------
await gx('teleportToSgra(0.0005)');
await gx('flare()');
await settle(2600);
await shot('11-flare');

// ---- galaxy map -----------------------------------------------------------
await gx('openMap()');
await settle(1200);
await shot('12-galaxy-map');
assertLit('12-galaxy-map', 0.03, 'galaxy map failed to draw');
await page.keyboard.press('Escape');
await settle(300);

// ---- survey scan near Sol -------------------------------------------------
await gx('teleport(-26996, -0.5, 68)');
await settle(4000); // let chunks stream in
await gx('scan()');
let scannedCount = 0;
for (let i = 0; i < 15; i++) {
  await settle(1000);
  scannedCount = (await info()).discoveries;
  if (scannedCount > 0) break;
}
note('scan', { discoveries: scannedCount });
if (scannedCount < 1) problems.push('scan recorded nothing near Sol');
await shot('13-scan-near-sol');

// ---- exit back to the solar system ----------------------------------------
await page.evaluate(() => window.__orrery.exitGalaxy());
await settle(2200);
const active = await page.evaluate(() => window.__orrery.galaxyActive());
if (active) problems.push('galaxy mode failed to exit');
await shot('14-back-in-solar-system');
assertLit('14-back-in-solar-system', 0.01, 'solar system dark after exit');

// ---- report ---------------------------------------------------------------
writeFileSync(`${OUT}/report.json`, JSON.stringify({ problems, log }, null, 2));
await browser.close();
if (problems.length) {
  console.log(`\n✗ ${problems.length} problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\n✓ galaxy test passed');
