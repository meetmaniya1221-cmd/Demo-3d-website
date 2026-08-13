/**
 * Headless test for MANOEUVRABLE orbit mode.
 *
 * Walks the exact checklist the bug report asked for - travel to Mars, orbit,
 * throttle up, verify the orbital velocity and the orbit itself change, move
 * closer and farther, burn prograde and retrograde, exit orbit, confirm the
 * ship continues from its own position and velocity, re-enter - then repeats
 * the core of it at Earth, Jupiter and Saturn.
 *
 * It checks the PHYSICS, not just the UI: every claim is made against the
 * spacecraft's real body-centred state vector and its derived elements, and the
 * position is sampled over time to prove the hull genuinely moves through the
 * scene rather than the camera being swung around a planet.
 *
 * Usage: node scripts/orbitflight.mjs [--url http://localhost:4173] [--out shots]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const URL = argOf('url', 'http://localhost:4173/');
const OUT = argOf('out', 'shots-orbit');
mkdirSync(OUT, { recursive: true });

const problems = [];
const log = [];
let checks = 0;

function note(step, data) {
  log.push({ step, ...data });
  console.log(`\n── ${step}`);
  if (data && Object.keys(data).length) console.log(JSON.stringify(data, null, 1));
}
function check(label, pass, detail = '') {
  checks++;
  if (!pass) problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    if (/deprecat|Third-party cookie/i.test(m.text())) return;
    problems.push(`console.${m.type()}: ${m.text()}`);
    console.log(`  ! console.${m.type()}: ${m.text()}`);
  }
});
page.on('pageerror', (e) => {
  problems.push(`pageerror: ${e.message}`);
  console.log(`  ! pageerror: ${e.message}`);
});

const sc = (fn, ...a) =>
  page.evaluate(([f, args]) => window.__orrery.spacecraft[f](...args), [fn, a]);
const info = () => sc('info');
const orbit = () => sc('orbitInfo');
const state = () => sc('stateVector');
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

/** Hold an axis, let the nose slew there, then burn for `sec` of real time. */
async function burn(axis, throttleIdx, sec) {
  await sc('setHold', axis);
  await wait(2200); // attitude slews at 75 deg/s; this is ample
  await sc('setThrottle', throttleIdx);
  await wait(sec * 1000);
  await sc('setThrottle', 0);
  await wait(400);
}

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__orrery, null, { timeout: 60_000 });
await page.click('[data-act="explore"]');
await wait(1800);
await page.evaluate(() => window.__orrery.enterSpacecraft());
await page.waitForFunction(() => window.__orrery.spacecraft.phase() === 'flying', null, {
  timeout: 20_000,
});

// ======================================================== 1-3. Mars orbit ==
await sc('teleportTo', 'mars', 1);
await wait(900);
await sc('orbit');
await wait(1500);
await shot('01-mars-orbit');
const o0 = await orbit();
const s0 = await state();
note('1-3. Mars orbit entered', o0);
check('orbit mode is active', (await info()).mode === 'orbit');
check('anchored to Mars', o0 && o0.bodyName === 'Mars');
check('bound trajectory (e < 1)', o0.eccentricity < 1, `e=${o0.eccentricity.toFixed(4)}`);
check('near-circular insertion', o0.eccentricity < 0.02, `e=${o0.eccentricity.toFixed(4)}`);
check('has a real state vector', !!s0 && s0.r.length === 3 && s0.v.length === 3);
{
  // v = sqrt(mu/r) for a circular orbit - the insertion must satisfy it
  const r = Math.hypot(...s0.r);
  const v = Math.hypot(...s0.v);
  const vExpected = Math.sqrt(s0.mu / r);
  check('orbital velocity matches sqrt(mu/r)', Math.abs(v - vExpected) / vExpected < 0.01,
    `v=${v.toFixed(4)} expected=${vExpected.toFixed(4)} km/s`);
}

// ---- the hull genuinely moves through the scene, it is not a camera trick --
const track = [];
for (let i = 0; i < 6; i++) {
  const s = await state();
  const inf = await info();
  track.push({ r: s.r.slice(), pos: inf.pos.slice(), alt: (await orbit()).altitudeKm });
  await wait(700);
}
{
  const first = track[0].r;
  const last = track[track.length - 1].r;
  const moved = Math.hypot(last[0] - first[0], last[1] - first[1], last[2] - first[2]);
  const radii = track.map((t) => Math.hypot(...t.r));
  const spread = (Math.max(...radii) - Math.min(...radii)) / radii[0];
  const posMoved = Math.hypot(
    track[track.length - 1].pos[0] - track[0].pos[0],
    track[track.length - 1].pos[1] - track[0].pos[1],
    track[track.length - 1].pos[2] - track[0].pos[2],
  );
  note('hull motion over ~4 s of orbiting', {
    bodyRelativeMoveKm: Math.round(moved),
    scenePositionMovedUnits: posMoved,
    radiusSpreadFraction: spread,
  });
  check('body-relative position advances along the orbit', moved > 100, `${Math.round(moved)} km`);
  check('scene position genuinely changes', posMoved > 1e-9, `${posMoved} units`);
  check('radius stays constant on a circular orbit', spread < 0.02, `spread ${(spread * 100).toFixed(2)}%`);
}

// ============================================ 4-6. throttle changes things ==
/** Specific orbital energy, km²/s². The invariant that behaves sensibly for
 *  every conic: semi-major axis flips sign at escape, energy does not. */
const energyOf = (st) => {
  const r = Math.hypot(...st.r);
  const v = Math.hypot(...st.v);
  return (v * v) / 2 - st.mu / r;
};

const before = await orbit();
const beforeState = await state();
// notch 2 (5 mm/s²) keeps this bound at Mars - notch 3 for six seconds escapes,
// which is a fine thing for the engine to be able to do but a poor thing to
// assert "the orbit got bigger" against
await burn('prograde', 2, 6);
await shot('02-mars-after-prograde');
const afterPro = await orbit();
const afterProState = await state();
note('4-6. prograde burn', {
  before: { a: before.semiMajorKm, e: before.eccentricity, v: before.speedKms, apo: before.apoapsisAltKm },
  after: { a: afterPro.semiMajorKm, e: afterPro.eccentricity, v: afterPro.speedKms, apo: afterPro.apoapsisAltKm },
  dvSpent: afterPro.dvSpentKms,
  energy: { before: energyOf(beforeState), after: energyOf(afterProState) },
});
check('4. throttle produced thrust (Δv was spent)', afterPro.dvSpentKms > 0,
  `Δv=${afterPro.dvSpentKms.toFixed(4)} km/s`);
check('5. orbital velocity changed', Math.abs(afterPro.speedKms - before.speedKms) > 1e-4,
  `${before.speedKms.toFixed(4)} → ${afterPro.speedKms.toFixed(4)} km/s`);
check('6. prograde ADDED orbital energy', energyOf(afterProState) > energyOf(beforeState),
  `${energyOf(beforeState).toFixed(6)} → ${energyOf(afterProState).toFixed(6)} km²/s²`);
check('6b. orbit stayed bound and grew', !afterPro.escaping && afterPro.semiMajorKm > before.semiMajorKm * 1.001,
  `a ${Math.round(before.semiMajorKm)} → ${Math.round(afterPro.semiMajorKm)} km, e=${afterPro.eccentricity.toFixed(3)}`);
check('6c. apoapsis rose', afterPro.apoapsisAltKm > before.apoapsisAltKm,
  `${Math.round(before.apoapsisAltKm)} → ${Math.round(afterPro.apoapsisAltKm)} km`);

// ============================================== 7-10. closer / farther ======
const preRetro = await orbit();
const preRetroState = await state();
await burn('retrograde', 2, 6);
await shot('03-mars-after-retrograde');
const afterRetro = await orbit();
const afterRetroState = await state();
note('7-10. retrograde burn', {
  before: { a: preRetro.semiMajorKm, apo: preRetro.apoapsisAltKm, peri: preRetro.periapsisAltKm },
  after: { a: afterRetro.semiMajorKm, apo: afterRetro.apoapsisAltKm, peri: afterRetro.periapsisAltKm },
  energy: { before: energyOf(preRetroState), after: energyOf(afterRetroState) },
});
check('7/10. retrograde REMOVED orbital energy',
  energyOf(afterRetroState) < energyOf(preRetroState),
  `${energyOf(preRetroState).toFixed(6)} → ${energyOf(afterRetroState).toFixed(6)} km²/s²`);
check('7b. the orbit shrank', afterRetro.semiMajorKm < preRetro.semiMajorKm * 0.999,
  `a ${Math.round(preRetro.semiMajorKm)} → ${Math.round(afterRetro.semiMajorKm)} km`);

// radial burns must change the shape, not just the size
const preRadial = await orbit();
await burn('radial-out', 3, 5);
const afterRadial = await orbit();
note('radial-out burn', {
  eBefore: preRadial.eccentricity,
  eAfter: afterRadial.eccentricity,
});
check('radial burn changed the orbit shape',
  Math.abs(afterRadial.eccentricity - preRadial.eccentricity) > 1e-4,
  `e ${preRadial.eccentricity.toFixed(4)} → ${afterRadial.eccentricity.toFixed(4)}`);

// normal burn must change inclination
const preNormal = await orbit();
await burn('normal', 4, 5);
const afterNormal = await orbit();
note('normal burn', { incBefore: preNormal.inclinationDeg, incAfter: afterNormal.inclinationDeg });
check('normal burn changed inclination',
  Math.abs(afterNormal.inclinationDeg - preNormal.inclinationDeg) > 0.05,
  `${preNormal.inclinationDeg.toFixed(2)}° → ${afterNormal.inclinationDeg.toFixed(2)}°`);

// ============================================ 11-12. exit preserves state ==
// Freeze the simulation first. Otherwise the ship legitimately rides Mars'
// 24 km/s heliocentric motion between the two samples and an absolute position
// comparison measures Mars moving, not the ship being teleported.
await sc('setPaused', true);
await wait(400);
const preExitState = await state();
const preExitInfo = await info();
await sc('releaseOrbit');
await wait(500);
await shot('04-mars-released');
const postExitInfo = await info();
note('11-12. release orbit', {
  modeBefore: preExitInfo.mode,
  modeAfter: postExitInfo.mode,
  speedBefore: Math.hypot(...preExitState.v),
  speedAfter: postExitInfo.speedKms,
  posBefore: preExitInfo.pos,
  posAfter: postExitInfo.pos,
});
check('11. mode became free flight', postExitInfo.mode === 'free');
{
  // with the clock frozen the hull must not move by so much as a metre
  const driftKm =
    Math.hypot(
      postExitInfo.pos[0] - preExitInfo.pos[0],
      postExitInfo.pos[1] - preExitInfo.pos[1],
      postExitInfo.pos[2] - preExitInfo.pos[2],
    ) * 1495978.707;
  check('12. position exactly preserved (no teleport)', driftKm < 0.001,
    `moved ${(driftKm * 1000).toFixed(3)} m`);
  // and relative to Mars too, which is what "continues naturally" means
  const relDriftKm =
    Math.hypot(
      postExitInfo.rel[0] - preExitInfo.rel[0],
      postExitInfo.rel[1] - preExitInfo.rel[1],
      postExitInfo.rel[2] - preExitInfo.rel[2],
    ) * 1495978.707;
  check('12b. position relative to Mars preserved', relDriftKm < 0.001,
    `moved ${(relDriftKm * 1000).toFixed(3)} m`);
  const vBefore = Math.hypot(...preExitState.v);
  check('12c. velocity magnitude preserved',
    Math.abs(postExitInfo.speedKms - vBefore) / Math.max(vBefore, 1e-9) < 1e-6,
    `${vBefore.toFixed(6)} → ${postExitInfo.speedKms.toFixed(6)} km/s`);
}
await sc('setPaused', false);
await wait(300);
check('trajectory preview cleared on release', (await orbit()) === null);

// "Continues naturally" has to survive the seconds AFTER the button, not just
// the instant of it: gaze lock drives an attitude assist in free flight, and if
// it is left on it swings the nose off the velocity vector and back onto the
// planet - and free flight travels along the nose.
{
  const relAt = (i) => Math.hypot(...i.rel) * 1495978.707;
  const dAtRelease = relAt(postExitInfo);
  await sc('setThrottle', 2);
  await wait(4500);
  const drifted = await info();
  const dAfter = relAt(drifted);
  note('free flight after release', {
    modeStill: drifted.mode,
    distanceAtReleaseKm: Math.round(dAtRelease),
    distanceAfterKm: Math.round(dAfter),
    gazeLock: drifted.gazeLock,
  });
  check('ship coasts away rather than turning into the planet',
    dAfter > dAtRelease * 0.98,
    `${Math.round(dAtRelease)} → ${Math.round(dAfter)} km from Mars`);
  check('still in free flight', drifted.mode === 'free');
  await sc('setThrottle', 0);
}

// ================================================== 13. re-enter orbit =====
await sc('orbit');
await wait(1500);
const reEntered = await orbit();
note('13. re-entered orbit', reEntered);
check('13. orbit re-entered cleanly', !!reEntered && reEntered.eccentricity < 1);

// ================================================= escape trajectory =======
await burn('prograde', 6, 9);
const esc = await orbit();
const escInfo = await info();
note('escape burn', {
  orbit: esc,
  mode: escInfo.mode,
  note: esc ? 'still within the neighbourhood' : 'handed over to free flight',
});
if (esc) {
  check('escape detected (e >= 1)', esc.escaping && esc.eccentricity >= 1,
    `e=${esc.eccentricity.toFixed(3)}`);
} else {
  // it already left Mars' neighbourhood, which is the correct end state
  check('escape handed over to free flight', escInfo.mode === 'free');
}
await shot('05-mars-escape');

// ============================== 14. Earth, Jupiter and Saturn =============
for (const body of ['earth', 'jupiter', 'saturn']) {
  await sc('teleportTo', body, 1);
  await wait(900);
  await sc('orbit');
  await wait(1600);
  const a = await orbit();
  const st = await state();
  const r = Math.hypot(...st.r);
  const v = Math.hypot(...st.v);
  const vExp = Math.sqrt(st.mu / r);
  const period = 2 * Math.PI * Math.sqrt(r ** 3 / st.mu);
  note(`14. ${body} orbit`, {
    altitudeKm: Math.round(a.altitudeKm),
    speedKms: +v.toFixed(4),
    expectedKms: +vExp.toFixed(4),
    periodHours: +(period / 3600).toFixed(2),
    reportedPeriodHours: +(a.periodSec / 3600).toFixed(2),
    e: +a.eccentricity.toFixed(5),
  });
  check(`${body}: circular speed correct`, Math.abs(v - vExp) / vExp < 0.01);
  check(`${body}: reported period matches 2π√(r³/μ)`,
    Math.abs(a.periodSec - period) / period < 0.01);

  const pre = await orbit();
  await burn('prograde', 3, 5);
  const post = await orbit();
  check(`${body}: prograde burn raises the orbit`, post.semiMajorKm > pre.semiMajorKm * 1.0005,
    `${Math.round(pre.semiMajorKm)} → ${Math.round(post.semiMajorKm)} km`);
  await shot(`06-${body}-orbit`);
}

// ====================== frame-rate independence of orbital authority =======
// The same notch, held for the same wall-clock time, must change the orbit by
// the same amount whether the machine runs at 2 fps or 144. Capping the clock
// to bound per-frame delta-v silently breaks this; substepping the burn fixes
// it. This is the regression guard for that.
{
  const runs = [];
  for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.2, 0.5]) {
    // notch 2 keeps this bound, so the comparison is between two orbits rather
    // than between an orbit and an escape
    runs.push(await sc('burnProbe', { body: 'mars', dt, seconds: 6, throttle: 2 }));
  }
  note('frame-rate independence (6 s prograde burn at Mars)', runs.map((r) => ({
    fps: +(1 / r.dt).toFixed(0),
    frames: r.frames,
    dvKms: +r.dvSpentKms.toFixed(4),
    aKm: Math.round(r.semiMajorAfterKm),
    energy: +r.energyKm2S2.toFixed(5),
    escaping: r.escaping,
  })));
  const spreadOf = (xs) => (Math.max(...xs) - Math.min(...xs)) / Math.abs(Math.max(...xs));
  const dvSpread = spreadOf(runs.map((r) => r.dvSpentKms));
  check('Δv delivered is independent of frame rate', dvSpread < 0.05,
    `spread ${(dvSpread * 100).toFixed(2)}% across 144→2 fps`);
  check('no run escaped (comparing like with like)', runs.every((r) => !r.escaping));
  const eSpread = spreadOf(runs.map((r) => r.energyKm2S2));
  check('resulting orbital energy is independent of frame rate', eSpread < 0.05,
    `spread ${(eSpread * 100).toFixed(2)}%`);
}

// ================================================== engine / renderer =====
const gl = await page.evaluate(() => {
  const r = window.__orrery.renderer;
  return { error: r.getContext().getError(), programs: r.info.programs?.length ?? 0 };
});
note('webgl', gl);
check('no WebGL error', gl.error === 0, `code ${gl.error}`);

const fps = await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - t0 > 1500) res((n * 1000) / (performance.now() - t0));
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
);
note('fps (software rasteriser)', { fps: +fps.toFixed(1) });

writeFileSync(`${OUT}/orbit-report.json`, JSON.stringify({ log, problems }, null, 2));
await browser.close();

console.log(`\n============================================\n${checks} checks run`);
if (problems.length) {
  console.log(`FAILED with ${problems.length} problem(s):`);
  for (const p of problems) console.log(' -', p);
  process.exit(1);
}
console.log('Orbit mode is manoeuvrable. All checks passed.');
