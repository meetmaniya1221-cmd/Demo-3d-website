/**
 * Nearby stars: are the labels on their stars, and do the routes reach them?
 *
 * The two things this asserts are the two that were wrong. A label must sit on
 * the point it names - in the cockpit as well as outside it, and while the
 * camera is moving, not just when it happens to be still. And a connection
 * must end exactly on the star it claims to join, which is only guaranteed if
 * the route is built from the same positions the points are drawn at.
 *
 * Both are checked against the renderer's own numbers rather than against a
 * screenshot: the label's transform is compared with the star's projected draw
 * position, and the route's endpoints are read back out of the vertex buffer
 * the GPU draws from. Reading the buffer matters - an earlier version of this
 * test rebuilt the corners from the same inputs the renderer uses, so it could
 * only ever agree with itself.
 *
 * The routes only exist once the neighbourhood is the subject of the view, so
 * every route assertion runs from out past the Oort cloud. Checking them from
 * inside the planetary system would be checking a hidden layer.
 *
 * Usage: node scripts/starlinktest.mjs [--url ...] [--out shots/starlinks]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const URL = argOf('url', 'http://localhost:4173/');
const OUT = argOf('out', 'shots/starlinks');
mkdirSync(OUT, { recursive: true });

const problems = [];
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) problems.push(`${label}: ${detail ?? ''}`);
};

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Third-party/.test(m.text())) errors.push(m.text());
});

/**
 * For every on-screen star label: where the DOM has put it, and where its star
 * actually projects to. Read together in one evaluate so the camera cannot
 * move between the two.
 */
const labelOffsets = () =>
  page.evaluate(() => {
    const o = window.__orrery;
    const THREE = o.THREE;
    const cam = o.camera;
    const out = [];
    for (const el of document.querySelectorAll('#system-labels .star-label')) {
      if (el.style.display === 'none') continue;
      const id = el.dataset.system;
      const info = o.neighbourhoodEntry(id);
      if (!info) {
        out.push({ id, missing: true });
        continue;
      }
      const r = el.getBoundingClientRect();
      // the label is anchored bottom-centre, 12px above the point
      const lx = r.left + r.width / 2;
      const ly = r.bottom + 12;
      const v = new THREE.Vector3().fromArray(info.drawPos).project(cam);
      const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
      out.push({
        id,
        name: el.querySelector('.name')?.textContent ?? '',
        dx: lx - sx,
        dy: ly - sy,
        behind: v.z > 1,
      });
    }
    return out;
  });

/** Pull the free camera back to `k` times the distance at which the map opens. */
const standOff = (k) =>
  page.evaluate((mul) => {
    const o = window.__orrery;
    const r = o.mapSubjectDistance() * mul;
    o.camera.position.set(0, r * 0.35, r);
    o.camera.lookAt(0, 0, 0);
  }, k);

/**
 * Wait for the camera to stop moving.
 *
 * The label layer places its elements from the camera of the frame it runs in,
 * so a measurement taken mid-flight compares a label from one frame against a
 * camera from the next and reads the difference as an error. Every assertion
 * about where a label sits is taken from a still view.
 */
async function settle(ms = 14_000) {
  let last = null;
  // Consecutive stable samples, not one: a fly-to has a slow start, and a
  // single quiet pair at the top of the ease looks exactly like a finished
  // flight.
  let still = 0;
  for (let waited = 0; waited < ms; waited += 250) {
    const p = await page.evaluate(() => window.__orrery.camera.position.toArray());
    const scale = Math.max(1, Math.hypot(p[0], p[1], p[2]));
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < scale * 1e-6) still++;
    else still = 0;
    if (still >= 4) return true;
    last = p;
    await page.waitForTimeout(250);
  }
  return false;
}

async function labelsFollow(stage) {
  const rows = await labelOffsets();
  const named = rows.filter((r) => !r.missing);
  const worst = named.reduce((m, r) => Math.max(m, Math.hypot(r.dx, r.dy)), 0);
  const orphans = rows.filter((r) => r.missing).length;
  console.log(
    `  ${stage.padEnd(30)} labels=${named.length}  worst offset=${worst.toFixed(1)}px` +
      (orphans ? `  ORPHANS=${orphans}` : '') +
      (named.length ? `  e.g. ${named[0].name} (${named[0].dx.toFixed(1)}, ${named[0].dy.toFixed(1)})` : ''),
  );
  return { rows: named, worst, orphans };
}

/** Every route, measured out of the vertex buffer. */
async function routes(stage) {
  const r = await page.evaluate(() => window.__orrery.starLinks());
  console.log(
    `  ${stage.padEnd(30)} visible=${r.visible}  planned=${r.planned}  drawn=${r.edges.length}` +
      `  segments=${r.segments}  vertices=${r.vertices}`,
  );
  return r;
}

/** The assertions that must hold of any frame in which the routes are drawn. */
function assertRoutes(r, stage) {
  if (!r.visible || r.edges.length === 0) {
    check(`routes are drawn (${stage})`, false, `visible=${r.visible}, ${r.edges.length} edges in the buffer`);
    return;
  }
  let offEnd = 0;
  let offAxis = 0;
  let breaks = 0;
  let worstGap = 0;
  let worstCorner = -Infinity;
  let sameFamily = 0;
  for (const e of r.edges) {
    // measured against the edge's own length, so a "gap" means visibly short
    // of the star rather than a float wobble on a route millions of units long
    const rel = (g) => g / Math.max(e.span, 1e-6);
    worstGap = Math.max(worstGap, rel(e.startGap), rel(e.endGap));
    if (rel(e.startGap) > 0.002 || rel(e.endGap) > 0.002) offEnd++;
    offAxis += e.offAxisRuns;
    breaks += e.breaks;
    // A corner is a right angle exactly when the two runs meeting there hold
    // different coordinates - parallels and meridians cross at 90 degrees
    // everywhere on a sphere. The measured chord angle is reported too, with
    // the sampling step as its slack, as a check on that reasoning.
    for (let r = 1; r < e.held.length; r++) if (e.held[r] === e.held[r - 1]) sameFamily++;
    for (let r = 1; r < e.corners.length + 1; r++) {
      const slack = 1 + (e.stepDeg[r - 1] + e.stepDeg[r]) / 2;
      worstCorner = Math.max(worstCorner, Math.abs(e.corners[r - 1] - 90) - slack);
    }
  }
  check(
    `every route ends on the two stars it joins (${stage})`,
    offEnd === 0,
    `${offEnd} of ${r.edges.length} edges miss a star; worst gap ${(worstGap * 100).toFixed(3)}% of the route`,
  );
  check(
    `every run holds one bearing, and the runs join up (${stage})`,
    offAxis === 0 && breaks === 0,
    `${offAxis} runs wandered off their coordinate, ${breaks} breaks, across ${r.edges.length} routes`,
  );
  check(
    `every corner is a right angle (${stage})`,
    sameFamily === 0 && worstCorner < 0,
    `${sameFamily} corners join two runs of the same family;` +
      ` worst measured turn exceeds 90 by ${Math.max(worstCorner, 0).toFixed(2)} degrees beyond sampling slack`,
  );
  check(
    `the network is a tree, not a mesh (${stage})`,
    r.planned > 0 && r.planned < r.nodes && r.edges.length <= r.planned,
    `${r.planned} planned edges for ${r.nodes} stars, ${r.edges.length} drawn`,
  );
  check(
    `no route passes through a star it does not join (${stage})`,
    r.worstClearance > 0.02,
    `closest approach ${r.worstClearance.toFixed(3)} of the route's length`,
  );
}

console.log(`\nNearby-star labels and routes @ ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__orrery, null, { timeout: 90_000 });
await page.click('[data-act="explore"]').catch(() => {});
await page.waitForTimeout(3000);

// ---- pull back until the neighbourhood is the subject -----------------------
await page.evaluate(() => window.__orrery.select(null));
await page.waitForTimeout(1200);
// Out past the Oort cloud, which is where the neighbourhood stops being a
// backdrop and becomes the map. Positioned from the app's own threshold rather
// than a guessed number.
await standOff(2.5);
await page.waitForTimeout(1200);
await settle();

console.log('\nOutside the spacecraft');
const outside = await labelsFollow('solar-system view');
check(
  'every visible label sits on its own star',
  outside.rows.length > 0 && outside.worst < 3 && outside.orphans === 0,
  `${outside.rows.length} labels, worst offset ${outside.worst.toFixed(1)}px, ${outside.orphans} orphaned`,
);
assertRoutes(await routes('solar-system view'), 'map view');
await page.screenshot({ path: `${OUT}/map.png` });

// ---- zoom ------------------------------------------------------------------
// The routes are rebuilt from the drawn vertices every frame, so a change of
// distance is the cheapest way to catch geometry that was baked once.
console.log('\nZoom');
const zooms = [];
for (const k of [1.3, 6, 18]) {
  await standOff(k);
  await page.waitForTimeout(500);
  zooms.push(await labelsFollow(`stand-off x${k}`));
  assertRoutes(await routes(`stand-off x${k}`), `zoom x${k}`);
}
check(
  'labels stay on their stars through the zoom range',
  zooms.every((z) => z.rows.length > 0 && z.worst < 3 && z.orphans === 0),
  `worst offset ${Math.max(...zooms.map((z) => z.worst)).toFixed(1)}px`,
);
await standOff(2.5);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/map-wide.png` });

// ---- time and selection ----------------------------------------------------
console.log('\nTime and selection');
await page.evaluate(() => {
  window.__orrery.state.simDays += 365 * 40;
});
await page.waitForTimeout(800);
const timed = await labelsFollow('after 40 simulated years');
assertRoutes(await routes('after 40 simulated years'), 'time advanced');
check(
  'labels and routes survive a time jump',
  timed.rows.length > 0 && timed.worst < 3 && timed.orphans === 0,
  `worst offset ${timed.worst.toFixed(1)}px`,
);

// Selecting a planet flies the camera to it, which puts the neighbourhood back
// to being a backdrop - so the chart correctly stands down. What must not
// happen is a label left behind naming a star it is no longer over.
await page.evaluate(() => window.__orrery.select('mars'));
await settle();
const selected = await labelsFollow('with a planet selected');
const selRoutes = await routes('with a planet selected');
check(
  'selecting a planet stands the chart down cleanly',
  selected.orphans === 0 && selected.worst < 3 && !selRoutes.visible,
  `${selected.rows.length} labels at worst ${selected.worst.toFixed(1)}px, routes visible=${selRoutes.visible}`,
);
// Deselecting flies the camera back to the overview; stand off only once that
// has finished, or the fly-to overwrites the position on the next frame.
await page.evaluate(() => window.__orrery.select(null));
await settle();
await standOff(2.5);
await page.waitForTimeout(900);
await settle();
const restored = await labelsFollow('after deselecting');
assertRoutes(await routes('after deselecting'), 'chart restored');
check(
  'the chart comes back when the view pulls out again',
  restored.rows.length > 0 && restored.worst < 3 && restored.orphans === 0,
  `${restored.rows.length} labels, worst offset ${restored.worst.toFixed(1)}px`,
);

// ---- board, and move -------------------------------------------------------
console.log('\nInside the cockpit');
await page.evaluate(() => window.__orrery.enterSpacecraft());
await page
  .waitForFunction(() => window.__orrery.spacecraft.phase() === 'flying', null, { timeout: 40_000 })
  .catch(() => {});
await page.waitForTimeout(2500);
await page.evaluate(() => window.__orrery.spacecraft.teleportTo('neptune', 3));
await page.waitForTimeout(2000);
const boarded = await labelsFollow('cockpit, station-keeping');
check(
  'labels still sit on their stars in the cockpit',
  boarded.rows.length > 0 && boarded.worst < 3 && boarded.orphans === 0,
  `${boarded.rows.length} labels, worst offset ${boarded.worst.toFixed(1)}px`,
);
await page.screenshot({ path: `${OUT}/cockpit.png` });

// Turn the head. This is the case that was broken: the labels were only
// repositioned outside the cockpit, so in here they stayed where they were
// while the sky moved past them.
const swept = [];
for (const yaw of [40, 90, 150, 220]) {
  await page.evaluate((y) => {
    const sc = window.__orrery.spacecraft;
    sc.ship.gazeLock = false;
    sc.ship.headYawTarget = (y * Math.PI) / 180;
    sc.ship.headYaw = (y * Math.PI) / 180;
  }, yaw);
  await page.waitForTimeout(700);
  swept.push(await labelsFollow(`cockpit, head yaw ${yaw}deg`));
}
const worstSweep = Math.max(...swept.map((s) => s.worst));
check(
  'labels track their stars while the camera turns',
  swept.some((s) => s.rows.length > 0) && worstSweep < 3 && swept.every((s) => s.orphans === 0),
  `worst offset across the sweep ${worstSweep.toFixed(1)}px`,
);
await page.screenshot({ path: `${OUT}/cockpit-turned.png` });

// ---- fly the ship out of the planetary system ------------------------------
// Same test as the map view, but with the cockpit camera driving it: this is
// where the routes have to appear for someone actually leaving the system.
console.log('\nCockpit, out past the planets');
await page.evaluate(() => {
  const o = window.__orrery;
  const ship = o.spacecraft.ship;
  ship.gazeLock = false;
  ship.headYawTarget = 0;
  ship.headYaw = 0;
  // out of station-keeping first, or the follow offset drags it straight back
  ship.mode = 'free';
  ship.targetId = null;
  ship.anchorId = null;
  ship.idle();
  const r = o.mapSubjectDistance() * 2.5;
  ship.pos.set(0, r * 0.2, r);
  ship.lookAtPoint(new o.THREE.Vector3(0, 0, 0));
});
await page.waitForTimeout(1500);
const far = await labelsFollow('cockpit, beyond the Oort cloud');
check(
  'labels hold when the ship leaves the system',
  far.rows.length > 0 && far.worst < 3 && far.orphans === 0,
  `${far.rows.length} labels, worst offset ${far.worst.toFixed(1)}px`,
);
assertRoutes(await routes('cockpit, beyond the Oort cloud'), 'cockpit');
await page.screenshot({ path: `${OUT}/cockpit-far.png` });

// ---- and back in, which must put the routes away ---------------------------
console.log('\nBack inside the planetary system');
await page.evaluate(() => window.__orrery.spacecraft.teleportTo('earth', 3));
await page.waitForTimeout(1800);
const back = await routes('cockpit, back at Earth');
check(
  'the routes go away inside the planetary system',
  !back.visible && back.edges.length === 0,
  `visible=${back.visible}, ${back.edges.length} edges`,
);
const home = await labelsFollow('cockpit, back at Earth');
check(
  'returning does not strand a label',
  home.orphans === 0 && home.worst < 3,
  `worst offset ${home.worst.toFixed(1)}px`,
);

for (const e of [...new Set(errors)]) {
  problems.push(`console: ${e.slice(0, 140)}`);
  console.log(`  ! ${e.slice(0, 120)}`);
}
console.log(`\n${problems.length ? `FAILURES (${problems.length}):` : 'Labels and routes are attached to their stars.'}`);
for (const p of problems) console.log(`  - ${p}`);
await browser.close();
process.exit(problems.length ? 1 : 0);
