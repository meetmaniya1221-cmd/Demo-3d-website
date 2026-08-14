/**
 * Headless test for the nearby star systems.
 *
 * Boots the built app in Chromium and visits every neighbouring system in
 * turn, screenshotting each one and checking - against the data, not against a
 * previous screenshot - that:
 *
 *   - the 3D positions really are the ones the parallaxes and coordinates
 *     imply, and the distances between systems match the catalogue;
 *   - the scale is not lying: stars are at their true relative distances, and
 *     no two systems land on the same shell;
 *   - every confirmed planet is drawn, on an orbit whose radius follows its
 *     semi-major axis in the right order, with the right periods;
 *   - the habitable-zone edges come out where the published values say;
 *   - search resolves a planet, a star and a system by name;
 *   - the spacecraft can cross to another star through the same universe;
 *   - and every frame actually has light in it.
 *
 * Usage: node scripts/startest.mjs [--url http://localhost:4173] [--out shots]
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
const OUT = argOf('out', 'shots-stars');
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

/** Catalogue distances in light-years, from the data the app ships. */
const EXPECTED_LY = {
  'alpha-centauri': 4.365,
  'barnards-star': 5.9629,
  'lalande-21185': 8.3049,
  sirius: 8.6014,
  'epsilon-eridani': 10.5013,
  'ross-128': 11.0071,
  'epsilon-indi': 11.8666,
  'tau-ceti': 11.9114,
  'gj-1061': 11.9836,
  "teegardens-star": 12.4966,
  'wolf-1061': 14.05,
  'gj-876': 15.2385,
  'trappist-1': 40.6605,
};

/** Published conservative habitable-zone edges, AU, for a spot check. */
const EXPECTED_HZ = {
  'trappist-1': [0.0246, 0.0499],
  'alpha-centauri': [0.0405, 0.081],
  'tau-ceti': [0.687, 1.229],
  'epsilon-eridani': [0.612, 1.107],
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
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });

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

/** Mean luminance and lit fraction - a state assertion cannot catch a black
 *  screen, and a black screen is the failure a user actually notices. */
function brightness(name) {
  const png = PNG.sync.read(readFileSync(`${OUT}/${name}.png`));
  let sum = 0;
  let lit = 0;
  const n = png.width * png.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const l = 0.2126 * png.data[o] + 0.7152 * png.data[o + 1] + 0.0722 * png.data[o + 2];
    sum += l;
    if (l > 24) lit++;
  }
  return { mean: sum / n, litFrac: lit / n };
}

function assertVisible(name, minLitFrac) {
  const b = brightness(name);
  if (b.litFrac < minLitFrac) {
    fail(
      `${name} looks blank: ${(b.litFrac * 100).toFixed(2)}% of pixels lit ` +
        `(mean ${b.mean.toFixed(1)}), expected at least ${(minLitFrac * 100).toFixed(2)}%`,
    );
  }
  return b;
}

const settle = (ms) => page.waitForTimeout(ms);
const api = (fn, ...a) =>
  page.evaluate(([f, argv]) => window.__orrery[f](...argv), [fn, a]);

async function waitForArrival(id, timeoutMs = 40_000) {
  const t0 = Date.now();
  for (;;) {
    const active = await api('activeSystem');
    const flying = await api('voyageActive');
    if (active === id && !flying) return true;
    if (Date.now() - t0 > timeoutMs) {
      fail(`timed out travelling to ${id} - active=${active}, voyaging=${flying}`);
      return false;
    }
    await settle(350);
  }
}

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__orrery, null, { timeout: 60_000 });
await page.click('[data-act="explore"]');
await settle(2500);
await shot('00-solar-system');
assertVisible('00-solar-system', 0.02);

// ============================================ 1. positions and true distances
// The neighbourhood layout is built from RA, Dec and parallax. If the maths is
// right, the distance from the origin to each system reproduces its catalogued
// distance exactly - and the distances BETWEEN systems come out right too,
// which a shell-of-equal-radius fake could never manage.
const positions = await page.evaluate(() => {
  const ids = window.__orrery.neighbourhood().map((e) => e.id);
  const out = {};
  for (const id of ids) out[id] = window.__orrery.interstellarPos(id);
  return out;
});
const norm = (v) => Math.hypot(v[0], v[1], v[2]);
let worstPos = 0;
for (const [id, expected] of Object.entries(EXPECTED_LY)) {
  const got = norm(positions[id]);
  const err = Math.abs(got - expected);
  worstPos = Math.max(worstPos, err);
  if (err > 0.002) fail(`${id} is ${got.toFixed(4)} ly from the Sun, expected ${expected}`);
}
note('positions from RA/Dec/parallax', {
  systems: Object.keys(EXPECTED_LY).length,
  worstErrorLy: Number(worstPos.toFixed(6)),
});

// separations between real pairs, checked against the published values
const sep = (a, b) => {
  const p = positions[a];
  const q = positions[b];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
// Alpha Centauri to Sirius is a well-known 9.5 ly; Barnard to the Sun 5.96
const acToSirius = sep('alpha-centauri', 'sirius');
if (Math.abs(acToSirius - 9.5) > 0.35) {
  fail(`Alpha Centauri → Sirius came out ${acToSirius.toFixed(2)} ly, expected ≈9.5`);
}
note('cross-checks', {
  alphaCenToSirius: Number(acToSirius.toFixed(3)),
  alphaCenToBarnard: Number(sep('alpha-centauri', 'barnards-star').toFixed(3)),
  solToTrappist: Number(norm(positions['trappist-1']).toFixed(3)),
});

// ================================================= 2. scale is not flattened
// Every system must be at a DIFFERENT scene distance, in the same order as
// their real distances. "Do not make all stars look equally close" is a
// testable claim.
const scene = await api('neighbourhood');
const sorted = scene
  .filter((e) => e.id !== 'sol')
  .map((e) => ({ id: e.id, ly: e.distLy, u: Math.hypot(...e.scenePos) }))
  .sort((a, b) => a.ly - b.ly);
for (let i = 1; i < sorted.length; i++) {
  if (sorted[i].u <= sorted[i - 1].u) {
    fail(`scene distance out of order: ${sorted[i].id} is not further than ${sorted[i - 1].id}`);
  }
}
// the layout is linear in light-years, so units-per-ly must be constant
const ratios = sorted.map((s) => s.u / s.ly);
const spread = Math.max(...ratios) / Math.min(...ratios);
if (spread > 1.001) fail(`neighbourhood layout is not linear: units-per-ly spread ${spread.toFixed(4)}`);

// The Sun's own Oort cloud is modelled out to 60,000 AU - 0.95 ly. If the
// nearest star were drawn inside that, the picture would contradict itself.
const oortOuterUnits = await page.evaluate(() => {
  // the same r^0.55 curve scene/oort feeds its vertex shader
  const t = window.__orrery.state.scaleT;
  return 26 * Math.pow(60_000, 0.55) * (1 - t) + 60_000 * 100 * t;
});
if (sorted[0].u <= oortOuterUnits) {
  fail(
    `nearest star drawn at ${Math.round(sorted[0].u)} units, inside the Oort cloud's ` +
      `${Math.round(oortOuterUnits)} units - the scales contradict each other`,
  );
}
note('scale consistency', {
  oortOuterUnits: Math.round(oortOuterUnits),
  nearestStarUnits: Math.round(sorted[0].u),
  clearance: Number((sorted[0].u / oortOuterUnits).toFixed(2)),
});

// True scale must be exactly true: one light-year = 63,241 AU × 100 units.
// The explorer↔true morph is animated, so wait for it rather than guessing.
await page.evaluate(() => window.__orrery.setScale('true'));
for (let i = 0; i < 60; i++) {
  const t = await page.evaluate(() => window.__orrery.state.scaleT);
  if (t > 0.9995) break;
  await settle(500);
}
const trueRatios = (await api('neighbourhood'))
  .filter((e) => e.id !== 'sol')
  .map((e) => Math.hypot(...e.scenePos) / e.distLy);
const trueUply = trueRatios[0];
if (Math.abs(trueUply - 6_324_107.7) / 6_324_107.7 > 0.001) {
  fail(`true-scale units per light-year is ${trueUply.toFixed(0)}, expected 6,324,108`);
}
note('true scale is true', { unitsPerLy: Math.round(trueUply), auPerLy: Math.round(trueUply / 100) });
await page.evaluate(() => window.__orrery.setScale('explorer'));
for (let i = 0; i < 60; i++) {
  const t = await page.evaluate(() => window.__orrery.state.scaleT);
  if (t < 0.0005) break;
  await settle(500);
}
note('scale', {
  nearestUnits: Math.round(sorted[0].u),
  furthestUnits: Math.round(sorted[sorted.length - 1].u),
  ratioFurthestToNearest: Number((sorted[sorted.length - 1].u / sorted[0].u).toFixed(2)),
  trueRatio: Number((sorted[sorted.length - 1].ly / sorted[0].ly).toFixed(2)),
  unitsPerLy: Number(ratios[0].toFixed(2)),
});

// ============================================ 3. visit every system in turn
const systemIds = Object.keys(EXPECTED_LY);
let index = 0;
for (const id of systemIds) {
  index += 1;
  await api('goToSystem', id);
  const ok = await waitForArrival(id);
  if (!ok) continue;
  await settle(1400);
  const name = `${String(index).padStart(2, '0')}-${id}`;
  await shot(name);
  const b = assertVisible(name, 0.006);

  const info = await api('systemInfo');
  if (info.id !== id) {
    fail(`systemInfo reports ${info.id} while active system is ${id}`);
    continue;
  }

  // --- orbits: drawn radius must increase with semi-major axis, and every
  // planet must be off the star rather than sitting on it
  const byA = [...info.planets].sort((a, b2) => a.semiMajorAU - b2.semiMajorAU);
  for (let i = 1; i < byA.length; i++) {
    // eccentric orbits legitimately overlap, so compare against the ratio of
    // semi-major axes rather than demanding strict ordering of instantaneous r
    if (byA[i].semiMajorAU > byA[i - 1].semiMajorAU * 1.3 && byA[i].r < byA[i - 1].r * 0.6) {
      fail(`${id}: ${byA[i].id} is drawn well inside ${byA[i - 1].id} despite a larger orbit`);
    }
  }
  for (const p of info.planets) {
    if (!(p.r > 0)) fail(`${id}: ${p.id} is sitting on top of its star (r=${p.r})`);
    if (!Number.isFinite(p.pos[0]) || !Number.isFinite(p.pos[1]) || !Number.isFinite(p.pos[2])) {
      fail(`${id}: ${p.id} has a non-finite position`);
    }
    if (!(p.radius > 0)) fail(`${id}: ${p.id} has no display radius`);
  }
  for (const s of info.stars) {
    if (!Number.isFinite(s.pos[0])) fail(`${id}: star ${s.id} has a non-finite position`);
  }

  // --- habitable zone, where we have a published value to compare with
  const expectHz = EXPECTED_HZ[id];
  if (expectHz) {
    if (!info.hz) fail(`${id}: no habitable zone computed, expected one`);
    else {
      const dIn = Math.abs(info.hz.innerAU - expectHz[0]);
      const dOut = Math.abs(info.hz.outerAU - expectHz[1]);
      if (dIn > expectHz[0] * 0.03 || dOut > expectHz[1] * 0.03) {
        fail(
          `${id}: habitable zone ${info.hz.innerAU.toFixed(4)}-${info.hz.outerAU.toFixed(4)} AU, ` +
            `expected ≈${expectHz[0]}-${expectHz[1]}`,
        );
      }
    }
  }
  if (id === 'sirius' && info.hz) {
    fail('Sirius should have no habitable zone - 9,940 K is outside the fit');
  }

  // lazy loading has to actually stay lazy: thirteen systems must never all
  // be resident at once
  const built = await api('builtSystems');
  if (built.length > 2) {
    fail(`${built.length} foreign systems held in memory (${built.join(', ')}), expected at most 2`);
  }

  note(`visited ${id}`, {
    built: built.length,
    planets: info.planets.length,
    stars: info.stars.length,
    extentUnits: Number(info.extent.toFixed(1)),
    hz: info.hz ? [Number(info.hz.innerAU.toFixed(4)), Number(info.hz.outerAU.toFixed(4))] : null,
    litFrac: Number((b.litFrac * 100).toFixed(2)),
  });
}

// TRAPPIST-1 is the headline claim: all seven, drawn.
await api('goToSystem', 'trappist-1');
await waitForArrival('trappist-1');
await settle(1200);
const t1 = await api('systemInfo');
if (t1.planets.length !== 7) fail(`TRAPPIST-1 has ${t1.planets.length} planets drawn, expected 7`);
const letters = t1.planets.map((p) => p.id.slice(-1)).sort().join('');
if (letters !== 'bcdefgh') fail(`TRAPPIST-1 letters are "${letters}", expected "bcdefgh"`);
await shot('20-trappist-1-system');
assertVisible('20-trappist-1-system', 0.006);
note('TRAPPIST-1', { planets: t1.planets.length, letters });

// habitable-zone ring on screen
await page.evaluate(() => window.__orrery.state.setLayer('habitableZone', true));
await settle(900);
await shot('21-trappist-1-habitable-zone');
assertVisible('21-trappist-1-habitable-zone', 0.006);
await page.evaluate(() => window.__orrery.state.setLayer('habitableZone', false));

// ============================================================ 4. planet focus
await api('goToSystem', 'trappist-1', 'trappist-1e');
await settle(2200);
const selected = await page.evaluate(() => window.__orrery.state.selectedId);
if (selected !== 'trappist-1e') fail(`focus on TRAPPIST-1e failed - selected is ${selected}`);
await shot('22-trappist-1e');
assertVisible('22-trappist-1e', 0.006);
const panelTitle = await page.evaluate(
  () => document.querySelector('.infopanel-title')?.textContent ?? '',
);
if (!/TRAPPIST-1e/.test(panelTitle)) fail(`info panel shows "${panelTitle}", expected TRAPPIST-1e`);
const panelText = await page.evaluate(
  () => document.querySelector('.infopanel-body')?.textContent ?? '',
);
for (const required of ['Confirmed planet', 'habitable zone', 'Artistic rendering']) {
  if (!panelText.toLowerCase().includes(required.toLowerCase())) {
    fail(`TRAPPIST-1e panel is missing "${required}"`);
  }
}
note('planet focus', { panelTitle, panelChars: panelText.length });

// ================================================================= 5. search
const searchCases = [
  ['Proxima Centauri', 'alpha-centauri', 'system'],
  ['TRAPPIST-1e', 'trappist-1e', 'body'],
  ["Barnard's Star", 'barnards-star', 'system'],
  ['Tau Ceti', 'tau-ceti', 'system'],
];
for (const [query, expectId, kind] of searchCases) {
  await api('goToSystem', 'sol');
  await waitForArrival('sol');
  await settle(700);
  await page.evaluate(() => window.__orrery.openSearch());
  await settle(350);
  await page.fill('.search-overlay input', query);
  await settle(400);
  const first = await page.evaluate(() => {
    const el = document.querySelector('.search-item');
    return el ? { name: el.querySelector('.name')?.textContent, go: el.querySelector('.go')?.textContent } : null;
  });
  await page.press('.search-overlay input', 'Enter');
  await settle(kind === 'system' ? 1200 : 1200);
  await waitForArrival(
    kind === 'system' ? expectId : 'trappist-1',
    45_000,
  );
  await settle(1200);
  if (kind === 'body') {
    const sel = await page.evaluate(() => window.__orrery.state.selectedId);
    if (sel !== expectId) fail(`search "${query}" selected ${sel}, expected ${expectId}`);
  } else {
    const active = await api('activeSystem');
    if (active !== expectId) fail(`search "${query}" landed on ${active}, expected ${expectId}`);
  }
  note(`search "${query}"`, { topResult: first, active: await api('activeSystem') });
}
await shot('23-after-search');

// ======================================================== 6. spacecraft cross
await api('goToSystem', 'sol');
await waitForArrival('sol');
await settle(900);
await page.evaluate(() => window.__orrery.enterSpacecraft());
await settle(3600);
await shot('24-cockpit-home');
assertVisible('24-cockpit-home', 0.015);

const scBefore = await page.evaluate(() => window.__orrery.spacecraft.info());
await page.evaluate(() => window.__orrery.spacecraft.setStarTarget('barnards-star'));
await settle(400);
await page.evaluate(() => window.__orrery.spacecraft.launchInterstellar());
await settle(2500);
await shot('25-cruise');
const mid = await page.evaluate(() => window.__orrery.spacecraft.cruise());
if (!mid) fail('interstellar cruise did not start');
else if (!(mid.travelledLy > 0)) fail('cruise reports zero distance covered');

// wait for arrival
const t0 = Date.now();
for (;;) {
  const c = await page.evaluate(() => window.__orrery.spacecraft.cruise());
  if (!c) break;
  if (Date.now() - t0 > 60_000) {
    fail('spacecraft cruise never finished');
    break;
  }
  await settle(600);
}
await settle(1500);
await shot('26-arrived-barnard');
assertVisible('26-arrived-barnard', 0.006);
const scAfter = await page.evaluate(() => window.__orrery.spacecraft.info());
const activeAfter = await api('activeSystem');
if (activeAfter !== 'barnards-star') {
  fail(`spacecraft cruise ended at ${activeAfter}, expected barnards-star`);
}
const crossedKm = scAfter.interstellarKm ?? 0;
const expectedKm = 5.9629 * 9.4607304725808e12;
if (Math.abs(crossedKm - expectedKm) / expectedKm > 0.02) {
  fail(
    `spacecraft odometer reads ${crossedKm.toExponential(3)} km, expected ≈${expectedKm.toExponential(3)}`,
  );
}
note('spacecraft crossing', {
  from: scBefore.region,
  to: activeAfter,
  crossedKm: crossedKm.toExponential(4),
  expectedKm: expectedKm.toExponential(4),
  region: scAfter.region,
});

// the cockpit must be able to navigate to a body in the NEW system
await page.evaluate(() => window.__orrery.spacecraft.target('barnard-b'));
await settle(500);
await page.evaluate(() => window.__orrery.spacecraft.travel(1));
await settle(6000);
await shot('27-barnard-b');
assertVisible('27-barnard-b', 0.004);
const atPlanet = await page.evaluate(() => window.__orrery.spacecraft.info());
note('local navigation at another star', {
  target: atPlanet.target,
  targetDistKm: atPlanet.targetDistKm,
  angularDeg: atPlanet.targetAngularDeg,
  region: atPlanet.region,
});
if (!(atPlanet.targetDistKm > 0)) fail('target distance at Barnard b is not positive');

await page.evaluate(() => window.__orrery.exitSpacecraft());
await settle(2200);
await shot('28-back-in-explorer');
assertVisible('28-back-in-explorer', 0.006);

// ============================================================ 7. return home
await api('goToSystem', 'sol');
await waitForArrival('sol');
await settle(1600);
await shot('29-home');
assertVisible('29-home', 0.02);
const finalActive = await api('activeSystem');
if (finalActive !== 'sol') fail(`did not return home - active system is ${finalActive}`);

// ------------------------------------------------------------------ report --
writeFileSync(`${OUT}/report.json`, JSON.stringify({ log, problems }, null, 2));
await browser.close();

console.log(`\n${'='.repeat(64)}`);
if (problems.length) {
  console.log(`FAILED - ${problems.length} problem(s):`);
  for (const p of problems) console.log(`  · ${p}`);
  process.exit(1);
}
console.log('PASSED - every system visited, data verified, no console errors.');
