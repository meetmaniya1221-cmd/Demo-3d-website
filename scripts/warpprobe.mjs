/**
 * What the throat shader is working with during an interstellar jump.
 *
 * The reported artefact appears on star-to-star hops and not on in-system
 * ones, so the interesting quantities are the ones that differ between those
 * two cases: how far the camera is from the origin, and how far its far plane
 * reaches. The shader rebuilds each pixel's view ray by unprojecting to the
 * far plane and subtracting the camera position, and that subtraction is only
 * as good as the numbers going into it.
 *
 * Usage: node scripts/warpprobe.mjs [--to alpha-centauri]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const TO = argOf('to', 'alpha-centauri');
const OUT = argOf('out', 'shots/warpprobe');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.log('  ! ' + e.message.slice(0, 120)));

const probe = () =>
  page.evaluate(() => {
    const o = window.__orrery;
    const c = o.camera;
    const w = o.wormhole?.() ?? {};
    return {
      voyage: o.voyageActive?.() ?? false,
      phase: o.voyagePhase?.() ?? null,
      active: !!w.active,
      wphase: w.phase ?? null,
      p: w.progress ?? null,
      camLen: c.position.length(),
      near: c.near,
      far: c.far,
    };
  });

await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__orrery, null, { timeout: 90_000 });
await page.click('[data-act="explore"]').catch(() => {});
await page.waitForTimeout(3000);
await page.evaluate(() => window.__orrery.enterSpacecraft());
await page
  .waitForFunction(() => window.__orrery.spacecraft.phase() === 'flying', null, { timeout: 40_000 })
  .catch(() => {});
await page.waitForTimeout(2500);

console.log(`\n  interstellar cruise to ${TO}\n`);
console.log('   t   voyage  vphase      warp  wphase   p     |cam|        near        far        far/|cam|');
// This is the path the report used: from inside the ship, pick a star and
// engage. goToSystem only sets the target while the cockpit is up - the cruise
// itself is what carries the ship light-years, and light-years are where the
// world coordinates get large.
await page.evaluate((s) => {
  window.__orrery.spacecraft.setStarTarget(s);
  window.__orrery.spacecraft.launchInterstellar();
}, TO);

let shot = 0;
for (let i = 0; i < 150; i++) {
  const s = await probe();
  const ratio = s.camLen > 0 ? (s.far / s.camLen).toExponential(2) : '-';
  console.log(
    `  ${String(i).padStart(3)}  ${String(s.voyage).padStart(6)}  ${String(s.phase).padEnd(10)}` +
      `  ${String(s.active).padStart(5)}  ${String(s.wphase).padEnd(8)} ${String(s.p?.toFixed?.(2) ?? '-').padStart(5)}` +
      `  ${s.camLen.toExponential(3)}  ${s.near.toExponential(2)}  ${s.far.toExponential(3)}  ${ratio}`,
  );
  if (s.active && shot < 8) {
    await page.screenshot({ path: `${OUT}/warp-${String(shot).padStart(2, '0')}.png` });
    shot++;
  }
  if (!s.active && i > 6 && shot > 0) break;
  await page.waitForTimeout(600);
}
console.log(`\n  ${shot} frames captured while the throat was up -> ${OUT}`);
await browser.close();
