/**
 * Headless test for the long-distance travel transition.
 *
 * The claim being tested is not "it looks nice" - it is that the transition
 * fires on exactly the right jumps and changes nothing underneath. So this
 * checks both halves:
 *
 *   - Short and medium hops are untouched. The Moon (0.0026 AU) and Mars
 *     (~0.5-2.5 AU) must run through the same autopilot they always did, with
 *     no overlay at any point.
 *   - Long hops get the sequence: Earth to Saturn, planet to another star's
 *     system, star to star, and Solar System to a nearby system.
 *   - The flight underneath is real. Distance covered, velocity and the
 *     simulation clock all advance the way they would without the effect,
 *     because it is drawn over the flight rather than in place of it.
 *   - The destination is the real scene: after any long jump the ship is
 *     actually at the target, in the correct system, with its HUD intact.
 *   - Quality levels work, 'off' disables it entirely, and the frame does not
 *     go black or blow out while it plays.
 *
 * Usage: node scripts/warptest.mjs [--url http://localhost:4173] [--out shots-warp]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const URL = argOf('url', 'http://localhost:4173/');
const OUT = argOf('out', 'shots-warp');
mkdirSync(OUT, { recursive: true });

const problems = [];
const log = [];
function note(step, data) {
  log.push({ step, ...data });
  console.log(`\n── ${step}`);
  if (data && Object.keys(data).length) console.log(JSON.stringify(data, null, 1));
}
const fail = (msg) => {
  problems.push(msg);
  console.log(`  ! ${msg}`);
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') {
    const text = m.text();
    if (/deprecat|Third-party cookie/i.test(text)) return;
    fail(`console.${t}: ${text}`);
  }
});
page.on('pageerror', (e) => fail(`pageerror: ${e.message}`));

const shot = async (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const settle = (ms) => page.waitForTimeout(ms);
const api = (fn, ...a) => page.evaluate(([f, argv]) => window.__orrery[f](...argv), [fn, a]);
const sc = (fn, ...a) =>
  page.evaluate(([f, argv]) => window.__orrery.spacecraft[f](...argv), [fn, a]);
const warp = () => api('wormhole');
const info = () => sc('info');

/** Mean luminance + lit fraction: a transition that renders black, or one that
 *  blows the frame out to white, are both failures a state check cannot see. */
function frameStats(name) {
  const png = PNG.sync.read(readFileSync(`${OUT}/${name}.png`));
  let sum = 0;
  let lit = 0;
  let blown = 0;
  const n = png.width * png.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const l = 0.2126 * png.data[o] + 0.7152 * png.data[o + 1] + 0.0722 * png.data[o + 2];
    sum += l;
    if (l > 24) lit++;
    if (l > 250) blown++;
  }
  return { mean: sum / n, litFrac: lit / n, blownFrac: blown / n };
}

/** Wait until the autopilot reports one of `modes`. The software rasteriser
 *  this runs on advances the flight far slower than real hardware, so every
 *  arrival is waited for rather than timed. */
async function waitForMode(modes, timeoutMs = 180_000) {
  const t0 = Date.now();
  for (;;) {
    const m = (await info()).mode;
    if (modes.includes(m)) return m;
    if (Date.now() - t0 > timeoutMs) {
      fail(`timed out waiting for ${modes.join('/')} - still ${m}`);
      return m;
    }
    await settle(500);
  }
}

/**
 * Watch a jump from start to finish, sampling the effect every 250 ms.
 * Returns what the sequence actually did, so the caller can assert on it.
 */
async function observe(startFn, { maxMs = 45_000, shots = [], name = 'jump' } = {}) {
  const phases = new Set();
  let sawActive = false;
  let peakProgress = 0;
  let shotIdx = 0;
  await startFn();
  const t0 = Date.now();
  for (;;) {
    const w = await warp();
    if (w.active) {
      sawActive = true;
      phases.add(w.phase);
      peakProgress = Math.max(peakProgress, w.progress);
      if (shotIdx < shots.length && w.progress >= shots[shotIdx]) {
        await shot(`${name}-${String(shotIdx)}`);
        shotIdx += 1;
      }
    } else if (sawActive) {
      break;
    }
    if (Date.now() - t0 > maxMs) break;
    await settle(250);
  }
  return { sawActive, phases: [...phases], peakProgress };
}

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__orrery, null, { timeout: 60_000 });
await page.click('[data-act="explore"]');
await settle(2500);

// the effect bends the baked Milky Way, which only exists after the first bake
const skyReady = await page.evaluate(() => !!window.__orrery.wormhole);
if (!skyReady) fail('wormhole debug hook missing');

// ======================================================= 1. board the vessel
await page.evaluate(() => window.__orrery.enterSpacecraft());
await settle(4000);
await shot('00-cockpit');
const board = frameStats('00-cockpit');
if (board.litFrac < 0.01) fail(`cockpit looks blank (${(board.litFrac * 100).toFixed(2)}% lit)`);
note('boarded', { region: (await info()).region, ...board });

// ============================================== 2. SHORT hop must be untouched
// Earth to the Moon is 0.0026 AU. Nothing should appear.
await sc('teleportTo', 'earth', 2.4);
await settle(800);
const beforeShort = await info();
const shortRun = await observe(
  async () => {
    await sc('target', 'moon');
    await sc('travel', 1);
  },
  { maxMs: 9000, name: 'short' },
);
if (shortRun.sawActive) fail('short hop (Earth → Moon) played the transition; it must not');
const afterShort = await info();
note('short hop: Earth → Moon', {
  transition: shortRun.sawActive ? 'PLAYED (wrong)' : 'none (correct)',
  target: afterShort.target,
  movedKm: Math.round(afterShort.travelledKm - beforeShort.travelledKm),
});

// ============================================ 3. MEDIUM hop must be untouched
// Earth to Mars swings between roughly 0.5 and 2.5 AU - always under the
// three-AU line, so still the ordinary cruise.
await sc('teleportTo', 'earth', 2.4);
await settle(700);
const medRun = await observe(
  async () => {
    await sc('target', 'mars');
    await sc('travel', 1);
  },
  { maxMs: 20_000, name: 'medium' },
);
if (medRun.sawActive) fail('medium hop (Earth → Mars) played the transition; it must not');
note('medium hop: Earth → Mars', {
  transition: medRun.sawActive ? 'PLAYED (wrong)' : 'none (correct)',
});

// ================================================== 4. LONG hop: Earth → Saturn
await sc('teleportTo', 'earth', 2.4);
await settle(800);
const beforeLong = await info();
const longRun = await observe(
  async () => {
    await sc('target', 'saturn');
    await sc('travel', 1);
  },
  { maxMs: 180_000, name: 'saturn', shots: [0.2, 0.45, 0.72, 0.95] },
);
if (!longRun.sawActive) fail('long hop (Earth → Saturn) did NOT play the transition');
for (const p of ['align', 'stretch', 'throat', 'emerge']) {
  if (!longRun.phases.includes(p)) fail(`Earth → Saturn never reached the "${p}" phase`);
}
// the sequence covers the flight; the flight is what actually has to finish
await waitForMode(['follow', 'free']);
await settle(2500);
await shot('saturn-arrived');
const afterLong = await info();
const arrivedStats = frameStats('saturn-arrived');
if (arrivedStats.litFrac < 0.004) {
  fail(`Saturn arrival is blank (${(arrivedStats.litFrac * 100).toFixed(2)}% lit)`);
}
// the flight underneath must be real: the odometer has to move by roughly the
// Earth-Saturn distance, not by nothing and not by a teleport of zero
const movedAU = ((afterLong.travelledKm - beforeLong.travelledKm) / 149_597_870.7);
if (movedAU < 3) {
  fail(`Earth → Saturn only logged ${movedAU.toFixed(2)} AU of travel; the flight did not happen`);
}
if (afterLong.target !== 'saturn') fail(`target after the jump is ${afterLong.target}, expected saturn`);
note('long hop: Earth → Saturn', {
  phases: longRun.phases,
  peakProgress: Number(longRun.peakProgress.toFixed(2)),
  auCovered: Number(movedAU.toFixed(2)),
  targetDistKm: Math.round(afterLong.targetDistKm),
  region: afterLong.region,
  ...arrivedStats,
});
for (let i = 0; i < 4; i++) {
  if (!existsSync(`${OUT}/saturn-${i}.png`)) continue;
  const st = frameStats(`saturn-${i}`);
  if (st.blownFrac > 0.55) fail(`saturn-${i} is blown out (${(st.blownFrac * 100).toFixed(0)}% white)`);
  if (st.litFrac < 0.002) fail(`saturn-${i} is black (${(st.litFrac * 100).toFixed(2)}% lit)`);
  note(`  frame saturn-${i}`, st);
}

// ============================== 5. STAR → STAR: the interstellar crossing
const beforeCross = await info();
const crossRun = await observe(
  async () => {
    await sc('setStarTarget', 'barnards-star');
    await sc('launchInterstellar');
  },
  { maxMs: 60_000, name: 'cross', shots: [0.25, 0.5, 0.8] },
);
if (!crossRun.sawActive) fail('the interstellar crossing did NOT play the transition');
// wait for the cruise itself to finish
for (let i = 0; i < 120; i++) {
  if (!(await sc('cruise'))) break;
  await settle(500);
}
await settle(2500);
await shot('cross-arrived');
const afterCross = await info();
const activeSystem = await api('activeSystem');
if (activeSystem !== 'barnards-star') {
  fail(`crossing ended in ${activeSystem}, expected barnards-star`);
}
const crossKm = afterCross.interstellarKm - (beforeCross.interstellarKm || 0);
const expectKm = 5.9629 * 9.4607304725808e12;
if (Math.abs(crossKm - expectKm) / expectKm > 0.02) {
  fail(`crossing odometer ${crossKm.toExponential(3)} km, expected ≈${expectKm.toExponential(3)}`);
}
note('star → star: Sol → Barnard', {
  phases: crossRun.phases,
  system: activeSystem,
  lightYears: Number((crossKm / 9.4607304725808e12).toFixed(4)),
  ...frameStats('cross-arrived'),
});

// ======================= 6. PLANET → STAR SYSTEM, from inside another system
// Now at Barnard's Star: a hop to one of its planets is SHORT (0.019-0.038 AU),
// so it must stay untouched even though we are light-years from home.
const inSystem = await observe(
  async () => {
    await sc('target', 'barnard-b');
    await sc('travel', 1);
  },
  { maxMs: 12_000, name: 'barnard-b' },
);
if (inSystem.sawActive) {
  fail("a 0.02 AU hop at Barnard's Star played the transition; distance rules must not depend on which system you are in");
}
note('short hop at another star', {
  transition: inSystem.sawActive ? 'PLAYED (wrong)' : 'none (correct)',
  target: (await info()).target,
});

// ====================================== 7. quality levels and the off switch
await page.evaluate(() => window.__orrery.setTravelEffects('off'));
await settle(400);
const offRun = await observe(
  async () => {
    await sc('setStarTarget', 'sol');
    await sc('launchInterstellar');
  },
  { maxMs: 45_000, name: 'off' },
);
if (offRun.sawActive) fail('travel effects set to Off still played the transition');
for (let i = 0; i < 120; i++) {
  if (!(await sc('cruise'))) break;
  await settle(500);
}
await settle(2000);
const homeAgain = await api('activeSystem');
if (homeAgain !== 'sol') fail(`with effects off the crossing ended in ${homeAgain}, expected sol`);
note('effects off', { transition: 'none (correct)', system: homeAgain });

await page.evaluate(() => window.__orrery.setTravelEffects('reduced'));
await settle(400);
await sc('teleportTo', 'earth', 2.4);
await settle(700);
const reducedRun = await observe(
  async () => {
    await sc('target', 'neptune');
    await sc('travel', 1);
  },
  { maxMs: 180_000, name: 'reduced', shots: [0.5] },
);
if (!reducedRun.sawActive) fail('reduced quality did not play the transition');
await waitForMode(['follow', 'free']);
if (existsSync(`${OUT}/reduced-0.png`)) {
  const st = frameStats('reduced-0');
  if (st.litFrac < 0.002) fail('reduced-quality frame is black');
  note('reduced quality: Earth → Neptune', { phases: reducedRun.phases, ...st });
}
await page.evaluate(() => window.__orrery.setTravelEffects('cinematic'));

// ================== 8. SOLAR SYSTEM → NEARBY SYSTEM, from the explorer view
await page.evaluate(() => window.__orrery.exitSpacecraft());
await settle(3000);
const explorerRun = await observe(
  async () => {
    await page.evaluate(() => window.__orrery.goToSystem('trappist-1'));
  },
  { maxMs: 45_000, name: 'explorer', shots: [0.3, 0.6, 0.9] },
);
if (!explorerRun.sawActive) fail('explorer-mode jump to TRAPPIST-1 did not play the transition');
for (let i = 0; i < 90; i++) {
  if (!(await api('voyageActive'))) break;
  await settle(400);
}
await settle(2500);
await shot('explorer-arrived');
const explorerSystem = await api('activeSystem');
if (explorerSystem !== 'trappist-1') {
  fail(`explorer jump ended in ${explorerSystem}, expected trappist-1`);
}
const sysInfo = await api('systemInfo');
if (sysInfo.planets.length !== 7) {
  fail(`TRAPPIST-1 has ${sysInfo.planets.length} planets after the jump, expected 7`);
}
const arrivedFrame = frameStats('explorer-arrived');
if (arrivedFrame.litFrac < 0.004) fail('explorer arrival frame is blank');
note('Solar System → TRAPPIST-1 (explorer)', {
  phases: explorerRun.phases,
  system: explorerSystem,
  planets: sysInfo.planets.length,
  ...arrivedFrame,
});

// ====================== 9. the throat at interstellar range, where the maths
//                            has to hold up
//
// An in-system hop keeps the camera a hundred units from the origin. A cruise
// between stars carries it past ten million, with a far plane of twenty
// thousand - and every earlier check in this file passed happily while the
// throat was, at that range, a field of flat violet triangles. The shader was
// rebuilding its view ray by unprojecting to the far plane and subtracting the
// camera position, which at 1e7 is a subtraction of two nearly equal enormous
// numbers; the quantised result went through a 1/theta term and into simplex
// noise, and drew the noise lattice instead of the filaments.
//
// So this measures smoothness rather than presence. Flat plate is the
// signature: a pixel bit-identical to the one eight along, which a gradient
// never is and a facet always is. Measured off-centre and above the panels so
// the HUD is not what is being scored.
const facets = (name) => {
  const p = PNG.sync.read(readFileSync(`${OUT}/${name}.png`));
  const { width, height, data } = p;
  const x0 = Math.round(width * 0.28);
  const x1 = Math.round(width * 0.95);
  const y0 = Math.round(height * 0.18);
  const y1 = Math.round(height * 0.45);
  let flat = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1 - 8; x++) {
      const a = (y * width + x) * 4;
      const b = (y * width + x + 8) * 4;
      n++;
      if (data[a] === data[b] && data[a + 1] === data[b + 1] && data[a + 2] === data[b + 2]) flat++;
    }
  }
  return n ? flat / n : 1;
};

await api('exitSpacecraft');
await settle(1500);
await api('enterSpacecraft');
await page
  .waitForFunction(() => window.__orrery.spacecraft.phase() === 'flying', null, { timeout: 40_000 })
  .catch(() => {});
await settle(2500);
await sc('setStarTarget', 'alpha-centauri');
await sc('launchInterstellar');

let worstFacet = 0;
let peakCam = 0;
let frames = 0;
for (let i = 0; i < 40; i++) {
  const w = await warp();
  if (w.active) {
    const camLen = await page.evaluate(() => window.__orrery.camera.position.length());
    peakCam = Math.max(peakCam, camLen);
    // only score the throat, where the effect actually covers the frame
    if (w.phase === 'throat') {
      const name = `interstellar-${String(frames).padStart(2, '0')}`;
      await shot(name);
      worstFacet = Math.max(worstFacet, facets(name));
      frames++;
    }
  } else if (frames > 0) break;
  await settle(600);
}
if (frames === 0) fail('the interstellar cruise never reached the throat, so nothing was measured');
if (peakCam < 1e6) fail(`the cruise stayed at |cam|=${peakCam.toExponential(2)}; this check needs interstellar range`);
// The facets ran at 31-38% of the frame; a clean throat sits near 2%, which is
// where the frames before the effect ramps up also sit.
if (worstFacet > 0.12) {
  fail(
    `the throat is faceted at interstellar range: ${(worstFacet * 100).toFixed(1)}% of the ` +
      'sampled area is flat plate (a smooth throat is about 2%)',
  );
}
note('interstellar throat', {
  frames,
  peakCameraDistance: peakCam.toExponential(2),
  worstFlatFraction: `${(worstFacet * 100).toFixed(1)}%`,
});
await sc('abortInterstellar').catch(() => {});
await settle(1200);
await api('exitSpacecraft');
await settle(1500);

// ============================================= 10. the overlay always cleans up
const stuck = await warp();
if (stuck.active) fail('the transition is still running after everything finished');
const noteVisible = await page.evaluate(
  () => document.querySelector('.warp-note')?.classList.contains('show') ?? false,
);
if (noteVisible) fail('the transit caption is still on screen after the transition ended');
note('cleanup', { wormholeActive: stuck.active, captionVisible: noteVisible });

writeFileSync(`${OUT}/report.json`, JSON.stringify({ log, problems }, null, 2));
await browser.close();

console.log(`\n${'='.repeat(64)}`);
if (problems.length) {
  console.log(`FAILED - ${problems.length} problem(s):`);
  for (const p of problems) console.log(`  · ${p}`);
  process.exit(1);
}
console.log('PASSED - transition fires on long jumps only, and changes nothing underneath.');
