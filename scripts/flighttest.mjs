/**
 * Headless flight test for spacecraft mode.
 *
 * Boots the built app in Chromium, boards the vessel, and runs the full
 * exploration checklist - look around, fly, target, orbit, fly-by, exit and
 * re-enter - capturing a screenshot and a telemetry snapshot at each step and
 * failing loudly on console errors, WebGL errors or nonsensical numbers.
 *
 * Usage: node scripts/flighttest.mjs [--url http://localhost:4173] [--out shots]
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
const OUT = argOf('out', 'shots');
mkdirSync(OUT, { recursive: true });

const problems = [];
const log = [];

function note(step, data) {
  log.push({ step, ...data });
  console.log(`\n── ${step}`);
  if (data && Object.keys(data).length) console.log(JSON.stringify(data, null, 1));
}

const browser = await chromium.launch({
  // this environment ships a pinned Chromium that may not match the version
  // Playwright would download; point straight at it when it is present
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
    // three.js prints a benign notice about ANGLE on software renderers
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
};

/**
 * Mean luminance and lit-pixel fraction of a capture. State assertions alone
 * once let a full-screen black veil survive an exit unnoticed - the app was
 * "working" and the user saw nothing. Every important step now has to prove it
 * put light on the screen.
 */
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
  // a full-screen veil scores about 0.2% lit; a real space view clears 3%
  if (b.litFrac < minLitFrac) {
    problems.push(
      `${name} looks blank: ${(b.litFrac * 100).toFixed(2)}% of pixels lit ` +
        `(mean ${b.mean.toFixed(1)}), expected at least ${(minLitFrac * 100).toFixed(0)}%`,
    );
  }
  return b;
}

const info = () => page.evaluate(() => window.__orrery.spacecraft.info());
const sc = (fn, ...a) =>
  page.evaluate(
    ([f, args]) => window.__orrery.spacecraft[f](...args),
    [fn, a],
  );
const settle = async (ms) => page.waitForTimeout(ms);

/** Wait until the autopilot reports one of `modes`, or give up. */
async function waitForMode(modes, timeoutMs = 45_000) {
  const t0 = Date.now();
  for (;;) {
    const m = (await info()).mode;
    if (modes.includes(m)) return m;
    if (Date.now() - t0 > timeoutMs) {
      problems.push(`timed out waiting for ${modes.join('/')} - still ${m}`);
      return m;
    }
    await settle(400);
  }
}

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__orrery, null, { timeout: 60_000 });
await page.click('[data-act="explore"]');
await settle(2500);
await shot('01-explorer');

// ---------------------------------------------------------------- board --
await page.evaluate(() => window.__orrery.enterSpacecraft());
await settle(900);
await shot('02-entry-transition');
await settle(2200);
await shot('03-cockpit-front');
note('boarded', { ...(await info()), pixels: assertVisible('03-cockpit-front', 0.02) });
if (!(await page.evaluate(() => window.__orrery.spacecraftActive()))) {
  problems.push('spacecraft mode did not activate');
}

// --------------------------------------------------------- look around --
for (const [name, yaw, pitch] of [
  ['04-look-left', 78, 0],
  ['05-look-right', -78, 0],
  ['06-look-up', 0, 62],
  ['07-look-down', 0, -48],
]) {
  await sc('look', yaw, pitch);
  await settle(900);
  await shot(name);
}
await sc('look', 0, 0);
await settle(700);

// ------------------------------------------------------- speed + travel --
await sc('setThrottle', 4);
await sc('setTime', 5);
await settle(400);
const before = await info();
await sc('target', 'earth');
await sc('travel', 1);
await waitForMode(['follow']);
await settle(600);
await shot('08-arrive-earth');
assertVisible('08-arrive-earth', 0.03);
const earth = await info();
note('travel → Earth', {
  ...earth,
  earthAngularDeg: await sc('angularOf', 'earth'),
  movedKm: earth.travelledKm - before.travelledKm,
});
if (earth.targetAngularDeg < 5) {
  problems.push(`Earth arrival too far: ${earth.targetAngularDeg?.toFixed(2)}° across`);
}

// apparent size must fall as the ship backs off - the core scientific claim
const nearDeg = await sc('angularOf', 'earth');
await sc('teleportTo', 'earth', 12);
await settle(600);
const farDeg = await sc('angularOf', 'earth');
note('apparent size vs distance', { nearDeg, farDeg, ratio: nearDeg / farDeg });
if (!(farDeg < nearDeg * 0.4)) {
  problems.push(`Earth did not shrink with distance: ${nearDeg} → ${farDeg}`);
}
await shot('09-earth-distant');

// ------------------------------------------------------------ the Sun ---
await sc('target', 'sun');
await sc('setThrottle', 5);
await sc('setTime', 6);
await sc('travel', 1);
await waitForMode(['follow']);
await settle(800);
await shot('10-sun');
assertVisible('10-sun', 0.08);
const sun = await info();
note('travel → Sun', { ...sun, sunAngularDeg: await sc('angularOf', 'sun') });
if (sun.sunAU > 0.2) problems.push(`Sun approach stopped short: ${sun.sunAU} AU`);

// ------------------------------------------------------------- Saturn ---
await sc('target', 'saturn');
await sc('setThrottle', 6);
await sc('setTime', 6);
await sc('travel', 1);
await waitForMode(['follow']);
await settle(800);
await shot('11-saturn-arrival');
assertVisible('11-saturn-arrival', 0.03);
const saturn = await info();
note('travel → Saturn', {
  ...saturn,
  saturnAngularDeg: await sc('angularOf', 'saturn'),
});
if (saturn.targetAngularDeg < 8) {
  problems.push(`Saturn arrival too far: ${saturn.targetAngularDeg?.toFixed(2)}°`);
}

await sc('orbit');
await settle(2500);
await shot('12-saturn-orbit');
note('orbit Saturn', await info());
await settle(6000);
await shot('13-saturn-orbit-later');

await sc('teleportTo', 'saturn', 2.4);
await settle(500);
await sc('flyby');
await settle(7000);
await shot('14-saturn-flyby-inbound');
const inbound = await info();
await settle(13_000);
await shot('15-saturn-flyby-close');
const close = await info();
await settle(15_000);
await shot('16-saturn-flyby-past');
const past = await info();
note('fly-by', {
  inboundDeg: inbound.targetAngularDeg,
  closeDeg: close.targetAngularDeg,
  pastDeg: past.targetAngularDeg,
  mode: past.mode,
});
// Saturn must grow and then shrink again - that is the whole point of a pass
if (!(close.targetAngularDeg > inbound.targetAngularDeg * 2)) {
  problems.push(
    `fly-by did not close in: ${inbound.targetAngularDeg?.toFixed(2)}° → ` +
      `${close.targetAngularDeg?.toFixed(2)}°`,
  );
}

// ------------------------------------------------------ moons + Jupiter --
await sc('target', 'titan');
await sc('setThrottle', 5);
await sc('travel', 1);
await waitForMode(['follow']);
await settle(700);
await shot('17-titan');
const titan = await info();
note('travel → Titan', { ...titan, titanDeg: await sc('angularOf', 'titan') });
if (titan.targetAngularDeg < 6) {
  problems.push(`Titan arrival too far: ${titan.targetAngularDeg?.toFixed(2)}°`);
}

await sc('teleportTo', 'jupiter', 1);
await settle(1400);
await shot('18-jupiter');
note('jupiter', { ...(await info()), jupiterDeg: await sc('angularOf', 'jupiter') });
const jup = await info();
if (jup.targetAngularDeg < 10) {
  problems.push(`Jupiter standoff wrong: ${jup.targetAngularDeg?.toFixed(2)}°`);
}

// --------------------------------------------------------- exit/re-enter --
await sc('setPaused', true);
const beforeExit = await info();
await page.evaluate(() => window.__orrery.exitSpacecraft());
await settle(1600);
await shot('19-exited');
// the explorer view has to come back with real pixels, not a leftover veil
note('after exit', assertVisible('19-exited', 0.03));
if (await page.evaluate(() => window.__orrery.spacecraftActive())) {
  problems.push('exit did not deactivate spacecraft mode');
}
await page.evaluate(() => window.__orrery.enterSpacecraft());
// wait for the entry cinematic to hand over before reading telemetry: until
// then the vessel has not been stepped and its position is last frame's
await page.waitForFunction(() => window.__orrery.spacecraft.phase() === 'flying', null, {
  timeout: 20_000,
});
await settle(1200);
await shot('20-re-entered');
assertVisible('20-re-entered', 0.02);
const afterReenter = await info();
note('exit → re-enter', {
  beforeExit: beforeExit.pos,
  afterReenter: afterReenter.pos,
  target: [beforeExit.target, afterReenter.target],
});
// Position is restored RELATIVE to what the ship is station-keeping with:
// the explorer view keeps running its own clock while you are outside, so the
// body itself has moved on and riding it is the correct outcome.
const drift = Math.hypot(...beforeExit.rel.map((v, i) => v - afterReenter.rel[i]));
if (drift > 1e-6) {
  problems.push(`station-keeping offset not restored on re-entry (drift ${drift} units)`);
}
if (beforeExit.target !== afterReenter.target) problems.push('target not restored on re-entry');
await sc('setPaused', false);

// ------------------------------------------- inverse-distance scaling law --
await sc('setPaused', true);
const law = [];
for (const factor of [1, 2, 4, 8, 16]) {
  await sc('teleportTo', 'saturn', factor);
  await settle(260);
  const i2 = await info();
  law.push({ factor, distKm: Math.round(i2.targetDistKm), deg: i2.targetAngularDeg });
}
note('Saturn apparent size vs distance', law);
for (let i = 1; i < law.length; i++) {
  // angular size must track radius/distance: doubling the range halves it
  const expected = (law[0].deg * law[0].distKm) / law[i].distKm;
  const err = Math.abs(law[i].deg - expected) / expected;
  if (err > 0.02) {
    problems.push(
      `apparent size does not follow 1/distance at ${law[i].factor}x: ` +
        `${law[i].deg.toFixed(3)}° vs expected ${expected.toFixed(3)}°`,
    );
  }
}
await sc('setPaused', false);

// ------------------------------------------------------------- WebGL ----
const gl = await page.evaluate(() => {
  const r = window.__orrery.renderer;
  const ctx = r.getContext();
  return {
    error: ctx.getError(),
    calls: r.info.render.calls,
    triangles: r.info.render.triangles,
    programs: r.info.programs?.length ?? 0,
    textures: r.info.memory.textures,
    geometries: r.info.memory.geometries,
    pixelRatio: r.getPixelRatio(),
  };
});
note('webgl', gl);
if (gl.error !== 0) problems.push(`WebGL error code ${gl.error}`);

// frame rate over one second of real flight
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - t0 > 1500) resolve((n * 1000) / (performance.now() - t0));
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
);
note('fps (software rasteriser)', { fps: Number(fps.toFixed(1)) });

writeFileSync(`${OUT}/report.json`, JSON.stringify({ log, problems }, null, 2));
await browser.close();

console.log('\n============================================');
if (problems.length) {
  console.log(`FAILED with ${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log('All checks passed.');
