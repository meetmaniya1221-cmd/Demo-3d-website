/**
 * Mobile interaction test.
 *
 * The layout audit measures what is on screen; this measures whether it
 * responds to a finger. Everything here uses real touch input - Playwright's
 * touchscreen API and CDP touch sequences - because the failures being hunted
 * are exactly the ones a synthetic click cannot reproduce: a tap thrown away
 * as a drag, a sheet that will not be dragged, a gesture the browser steals.
 *
 * Usage: node scripts/mobiletouch.mjs [--url ...]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const URL = argOf('url', 'http://localhost:4173/');
const OUT = argOf('out', 'shots/touch');
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

const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Third-party cookie/.test(m.text())) errors.push(m.text());
});
const cdp = await ctx.newCDPSession(page);

/** A real touch drag, in steps, so momentum and thresholds see motion. */
async function swipe(x0, y0, x1, y1, steps = 14, holdMs = 16) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: x0, y: y0 }],
  });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t }],
    });
    await page.waitForTimeout(holdMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Two fingers moving apart or together. */
async function pinch(cx, cy, from, to, steps = 12) {
  const pts = (d) => [
    { x: cx - d / 2, y: cy, id: 1 },
    { x: cx + d / 2, y: cy, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: pts(from + (to - from) * (i / steps)),
    });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** A tap with realistic finger jitter - the thing the old threshold rejected. */
async function tap(x, y, jitter = 9) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(70);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + jitter, y: y + jitter * 0.6 }],
  });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

console.log(`\nMobile interaction test @ ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__orrery, null, { timeout: 90_000 });
await page.click('[data-act="explore"]').catch(() => {});
await page.waitForTimeout(2600);

// ---------------------------------------------------------------- shell --
console.log('\nShell');
const shell = await page.evaluate(() => ({
  shell: document.documentElement.dataset.shell,
  screen: document.documentElement.dataset.screen,
  pointer: document.documentElement.dataset.pointer,
  compactClass: document.body.classList.contains('compact-shell'),
  bottomBar: !!document.querySelector('.mnav-bottom.on'),
  topBar: !!document.querySelector('.mnav-top.on'),
  chipRowHidden: getComputedStyle(document.querySelector('.top-actions')).display === 'none',
}));
console.log(`  ${JSON.stringify(shell)}`);
check('compact shell is active', shell.shell === 'compact' && shell.compactClass);
check('bottom tab bar is present', shell.bottomBar);
check('desktop chip row is hidden', shell.chipRowHidden);

// ------------------------------------------------------- tap to select --
console.log('\nTap to select a world');
await page.evaluate(() => window.__orrery.select(null));
await page.waitForTimeout(900);
// aim at the Sun, which is always at the centre of the overview
await tap(196, 380);
await page.waitForTimeout(1200);
let selected = await page.evaluate(() => window.__orrery.state.selectedId);
if (!selected) {
  // the overview is mostly empty space; try a small sweep for a body
  for (const [x, y] of [
    [196, 420],
    [150, 400],
    [240, 400],
    [196, 340],
  ]) {
    await tap(x, y);
    await page.waitForTimeout(900);
    selected = await page.evaluate(() => window.__orrery.state.selectedId);
    if (selected) break;
  }
}
check('a jittery finger tap selects a body', !!selected, `selected=${selected}`);
await page.screenshot({ path: `${OUT}/01-selected.png` });

// ------------------------------------------------------------- the sheet --
console.log('\nInfo sheet');
if (selected) {
  const sheet = await page.evaluate(() => {
    const el = document.querySelector('.infopanel');
    const r = el.getBoundingClientRect();
    return {
      open: el.classList.contains('open'),
      asSheet: el.classList.contains('as-sheet'),
      top: Math.round(r.top),
      vh: window.innerHeight,
      hasGrip: !!el.querySelector('.sheet-grip'),
    };
  });
  console.log(`  ${JSON.stringify(sheet)}`);
  check('info panel opened as a sheet', sheet.open && sheet.asSheet && sheet.hasGrip);
  check(
    'sheet rests below the fold so the world stays visible',
    sheet.top > sheet.vh * 0.3,
    `top=${sheet.top} of ${sheet.vh}`,
  );

  // drag it up by the grip
  await swipe(196, sheet.top + 12, 196, 140);
  await page.waitForTimeout(600);
  const raised = await page.evaluate(() =>
    Math.round(document.querySelector('.infopanel').getBoundingClientRect().top),
  );
  check('dragging the grip raises the sheet', raised < sheet.top - 40, `${sheet.top} -> ${raised}`);
  await page.screenshot({ path: `${OUT}/02-sheet-raised.png` });

  // and flick it away
  await swipe(196, raised + 12, 196, 820, 10, 8);
  await page.waitForTimeout(900);
  const dismissed = await page.evaluate(() => window.__orrery.state.selectedId);
  check('flicking the sheet down dismisses it', !dismissed, `selected=${dismissed}`);
}

// ------------------------------------------------------------ more sheet --
console.log('\nNavigation');
await page.waitForTimeout(500);
const moreBox = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.mnav-tab')].pop();
  const r = b.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
await tap(moreBox.x, moreBox.y, 3);
await page.waitForTimeout(800);
const more = await page.evaluate(() => {
  const s = document.querySelector('.mnav-sheet');
  return {
    open: s.classList.contains('open'),
    tiles: s.querySelectorAll('.mnav-tile').length,
    visible: getComputedStyle(s).display !== 'none',
  };
});
check('More opens the feature sheet', more.open && more.visible, JSON.stringify(more));
check('every feature is reachable from it', more.tiles >= 10, `${more.tiles} tiles`);
await page.screenshot({ path: `${OUT}/03-more-sheet.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// --------------------------------------------------------- pinch to zoom --
console.log('\nCamera gestures');
await page.evaluate(() => window.__orrery.select(null));
await page.waitForTimeout(800);
const before = await page.evaluate(() => window.__orrery.camera.position.length());
await pinch(196, 420, 90, 300);
await page.waitForTimeout(900);
const after = await page.evaluate(() => window.__orrery.camera.position.length());
check('pinch changes the camera distance', Math.abs(after - before) / before > 0.02,
  `${before.toFixed(1)} -> ${after.toFixed(1)}`);

const q0 = await page.evaluate(() => window.__orrery.camera.position.clone().normalize().toArray());
await swipe(120, 420, 300, 460);
await page.waitForTimeout(900);
const q1 = await page.evaluate(() => window.__orrery.camera.position.clone().normalize().toArray());
const moved = Math.hypot(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]);
check('one-finger drag orbits the camera', moved > 0.02, `direction moved ${moved.toFixed(3)}`);
check('a drag did not also select something', !(await page.evaluate(() => window.__orrery.state.selectedId)));

// ------------------------------------------------------------- cockpit --
console.log('\nSpacecraft');
await page.evaluate(() => window.__orrery.enterSpacecraft());
await page
  .waitForFunction(() => window.__orrery.spacecraft.phase() === 'flying', null, { timeout: 40_000 })
  .catch(() => {});
await page.waitForTimeout(2200);
const cockpit = await page.evaluate(() => {
  const box = (s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const cs = getComputedStyle(e);
    if (cs.display === 'none') return 'hidden';
    const r = e.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  };
  return {
    top: box('.sc-top'),
    deck: box('.sc-deck'),
    nav: box('.sc-nav'),
    shellTop: box('.mnav-top'),
    shellBottom: box('.mnav-bottom'),
    vh: window.innerHeight,
  };
});
console.log(`  ${JSON.stringify(cockpit)}`);
check('the compact shell steps aside in the cockpit',
  cockpit.shellTop === 'hidden' && cockpit.shellBottom === 'hidden');
const chrome = cockpit.top[3] + cockpit.deck[3];
check('cockpit chrome leaves most of the glass',
  chrome < cockpit.vh * 0.32, `${chrome}px of ${cockpit.vh}`);
check('no panel overlaps the deck', cockpit.nav === 'hidden' || cockpit.nav[1] + cockpit.nav[3] <= cockpit.deck[1] + 2,
  `nav=${JSON.stringify(cockpit.nav)} deck=${JSON.stringify(cockpit.deck)}`);

// 360 look: the head yaw is unbounded, so dragging far enough must carry the
// view straight through where the old 148-degree stop used to be, and the
// hull must NOT rotate - looking around is not steering.
const look0 = await page.evaluate(() => ({
  quat: window.__orrery.spacecraft.ship.quat.toArray(),
  headYaw: window.__orrery.spacecraft.ship.headYaw,
}));
for (let i = 0; i < 8; i++) await swipe(320, 400, 60, 400, 10, 8);
await page.waitForTimeout(700);
const look1 = await page.evaluate(() => ({
  quat: window.__orrery.spacecraft.ship.quat.toArray(),
  headYaw: window.__orrery.spacecraft.ship.headYaw,
}));
const swept = Math.abs(look1.headYaw - look0.headYaw) * (180 / Math.PI);
const hullMoved = Math.hypot(...look1.quat.map((v, i) => v - look0.quat[i]));
check('a touch drag sweeps the view past the old 148 degree stop',
  swept > 160, `swept ${swept.toFixed(0)} degrees`);
check('looking around does not steer the ship',
  hullMoved < 1e-6, `hull quaternion moved ${hullMoved.toExponential(1)}`);
await page.screenshot({ path: `${OUT}/04-cockpit-look.png` });

// the dock
const dockTab = await page.evaluate(() => {
  const b = document.querySelector('.sc-dock-tab[data-dock="engine"]');
  const r = b.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
await tap(dockTab.x, dockTab.y, 3);
await page.waitForTimeout(600);
const engineOpen = await page.evaluate(() => {
  const g = document.querySelector('.sc-deck [data-group="engine"]');
  return getComputedStyle(g).display !== 'none';
});
check('the dock opens the engine group', engineOpen);
await page.screenshot({ path: `${OUT}/05-cockpit-dock.png` });

// -------------------------------------------------------------- rotate --
console.log('\nRotation');
await page.setViewportSize({ width: 852, height: 393 });
await page.waitForTimeout(1600);
const land = await page.evaluate(() => {
  const box = (s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const cs = getComputedStyle(e);
    if (cs.display === 'none') return 'hidden';
    const r = e.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  };
  return {
    orient: document.documentElement.dataset.orient,
    shell: document.documentElement.dataset.shell,
    deck: box('.sc-deck'),
    nav: box('.sc-nav'),
    loc: box('.sc-loc'),
    scrollW: document.documentElement.scrollWidth,
    vw: window.innerWidth,
  };
});
console.log(`  ${JSON.stringify(land)}`);
check('rotation is detected', land.orient === 'landscape' && land.shell === 'compact');
check('no horizontal scroll after rotating', land.scrollW <= land.vw + 1,
  `${land.scrollW} vs ${land.vw}`);
const overlap = (a, b) =>
  Array.isArray(a) && Array.isArray(b) &&
  a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
check('landscape panels do not stack on the deck',
  !overlap(land.deck, land.nav) && !overlap(land.deck, land.loc),
  `deck=${JSON.stringify(land.deck)} nav=${JSON.stringify(land.nav)} loc=${JSON.stringify(land.loc)}`);
await page.screenshot({ path: `${OUT}/06-landscape-cockpit.png` });

await page.evaluate(() => window.__orrery.exitSpacecraft());
await page.waitForTimeout(1600);
await page.screenshot({ path: `${OUT}/07-landscape-explorer.png` });
const backLand = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  vw: window.innerWidth,
  bottomBar: !!document.querySelector('.mnav-bottom.on'),
}));
check('shell returns after leaving the cockpit', backLand.bottomBar);
check('still no horizontal scroll', backLand.scrollW <= backLand.vw + 1);

for (const e of [...new Set(errors)]) {
  problems.push(`console: ${e.slice(0, 140)}`);
  console.log(`  ! ${e.slice(0, 120)}`);
}

console.log(`\n${problems.length ? `FAILURES (${problems.length}):` : 'All interaction checks passed.'}`);
for (const p of problems) console.log(`  - ${p}`);
await browser.close();
process.exit(problems.length ? 1 : 0);
