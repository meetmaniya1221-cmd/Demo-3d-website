/**
 * Visual walkthrough of the sky's depth behaviour.
 *
 * skydepthtest proves the numbers; this produces the frames a person can
 * look at, following the report's own list: every named body close up, a full
 * turn of the camera, every window of the cockpit, a close approach, and the
 * overview with orbit lines and labels across the band.
 *
 * Usage: node scripts/skywalk.mjs [--url ...] [--out shots/skywalk]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const URL = argOf('url', 'http://localhost:4173/');
const OUT = argOf('out', 'shots/skywalk');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const shot = async (n) => {
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log(`  ${n}`);
};

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__orrery, null, { timeout: 90_000 });
await page.click('[data-act="explore"]').catch(() => {});
await page.waitForTimeout(3500);

console.log('\nSolar system view');
for (const id of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'moon']) {
  await page.evaluate((b) => window.__orrery.select(b), id);
  await page.waitForTimeout(3400);
  await shot(`10-${id}`);
}
await page.evaluate(() => window.__orrery.select(null));
await page.waitForTimeout(2600);
await shot('11-overview');

console.log('\nA full turn of the camera');
// drag the canvas round in steps, which is what a viewer actually does
for (let i = 0; i < 8; i++) {
  await page.mouse.move(500, 350);
  await page.mouse.down();
  await page.mouse.move(500 + 220, 350, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1100);
  await shot(`20-turn-${i}`);
}

console.log('\nCockpit, every window');
await page.evaluate(() => window.__orrery.enterSpacecraft());
await page
  .waitForFunction(() => window.__orrery.spacecraft.phase() === 'flying', null, { timeout: 40_000 })
  .catch(() => {});
await page.waitForTimeout(2600);
await page.evaluate(() => window.__orrery.spacecraft.setPaused(true));
await page.evaluate(() => window.__orrery.spacecraft.placeRelative('earth', 'day', 4));
await page.waitForTimeout(2200);
for (const [key, name] of [
  ['1', 'ahead'],
  ['2', 'starboard'],
  ['3', 'port'],
  ['4', 'overhead'],
  ['5', 'floor'],
  ['6', 'astern'],
]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(1500);
  await shot(`30-window-${key}-${name}`);
}

console.log('\nClose approaches');
for (const [id, radii] of [
  ['earth', 1.6],
  ['moon', 1.5],
  ['saturn', 2.4],
  ['jupiter', 2.2],
]) {
  await page.keyboard.press('1');
  await page.evaluate(
    ([b, r]) => window.__orrery.spacecraft.placeRelative(b, 'terminator', r),
    [id, radii],
  );
  await page.waitForTimeout(2400);
  await shot(`40-close-${id}`);
}

console.log('\nStraight into the galactic bulge, with a body in the way');
for (const id of ['mercury', 'earth', 'jupiter']) {
  await page.evaluate((b) => {
    const THREE = window.__orrery.THREE;
    const gc = new THREE.Vector3(1, 0, 0)
      .applyMatrix3(window.__orrery.galacticMatrix().clone().transpose())
      .normalize();
    window.__orrery.spacecraft.placeAlong(b, [-gc.x, -gc.y, -gc.z], b === 'mercury' ? 6 : 3);
  }, id);
  await page.waitForTimeout(2400);
  await shot(`50-bulge-${id}`);
}

for (const e of [...new Set(errors)]) console.log(`  ! ${e.slice(0, 140)}`);
console.log(`\nFrames in ${OUT}`);
await browser.close();
