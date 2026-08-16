/**
 * Visual audit: boots the built app headless and captures screenshots of every
 * major mode/view, logging console errors. Not a pass/fail test - an
 * inspection harness for the audit pass.
 *
 * Usage: node scripts/visualaudit.mjs [--url http://localhost:4173] [--out audit-shots]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const URL = argOf('url', 'http://localhost:4173/');
const OUT = argOf('out', 'audit-shots');
const ONLY = argOf('only', '');
mkdirSync(OUT, { recursive: true });

const problems = [];
const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on('console', (m) => {
  const t = m.type();
  if (t !== 'error' && t !== 'warning') return;
  const text = m.text();
  if (/deprecat|Third-party cookie/i.test(text)) return;
  problems.push(`console.${t}: ${text}`);
  console.log(`  ! console.${t}: ${text}`);
});
page.on('pageerror', (e) => {
  problems.push(`pageerror: ${e.message}`);
  console.log(`  ! pageerror: ${e.message}`);
});

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  shot: ${name}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = async (name, fn) => {
  if (ONLY && !name.includes(ONLY)) return;
  console.log(`\n── ${name}`);
  try {
    await fn();
  } catch (e) {
    problems.push(`${name}: ${e.message}`);
    console.log(`  ! FAILED: ${e.message}`);
    await shot(`${name}-FAILED`);
  }
};

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#landing', { timeout: 60000 });
await shot('00-landing');
await page.click('[data-act="explore"]');
await sleep(4000);
await shot('01-solar-system-default');

const api = () => page.evaluate(() => Object.keys(window.__orrery ?? {}));
console.log('debug api:', await api());

await step('02-grid', async () => {
  // toggle the reference grid through the layers/view panel if present
  await page.evaluate(() => {
    const o = window.__orrery;
    o?.state?.setLayer?.('grid', true);
  });
  await sleep(800);
  await shot('02-grid-on');
});

await step('03-belts', async () => {
  await page.evaluate(() => {
    const o = window.__orrery;
    o?.state?.setLayer?.('asteroids', true);
    o?.state?.setLayer?.('comets', true);
    o?.state?.setLayer?.('dwarfs', true);
  });
  await sleep(1200);
  await shot('03-asteroids-comets-on');
});

await step('04-earth', async () => {
  await page.evaluate(() => window.__orrery?.select?.('earth'));
  await sleep(5000);
  await shot('04-earth-selected');
});

await step('05-earth-close', async () => {
  // zoom in hard on Earth
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -400);
    await sleep(150);
  }
  await sleep(2000);
  await shot('05-earth-close');
});

await step('06-moon', async () => {
  await page.evaluate(() => window.__orrery?.select?.('moon'));
  await sleep(5000);
  await shot('06-moon');
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -400);
    await sleep(120);
  }
  await sleep(1500);
  await shot('06-moon-close');
});

await step('07-saturn', async () => {
  await page.evaluate(() => window.__orrery?.select?.('saturn'));
  await sleep(6000);
  await shot('07-saturn');
});

await step('08-search', async () => {
  await page.keyboard.press('Escape');
  await sleep(500);
  await page.keyboard.press('/');
  await sleep(600);
  await shot('08-search-open');
  await page.keyboard.type('europa', { delay: 40 });
  await sleep(600);
  await shot('08-search-europa');
  await page.keyboard.press('Escape');
});

await step('09-datepicker', async () => {
  const el = await page.$('#hud-date, .hud-date, [data-role="date"]');
  if (el) {
    await el.click();
    await sleep(700);
    await shot('09-datepicker');
    await page.keyboard.press('Escape');
  } else {
    console.log('  (no date element found by selector, dumping hud html)');
    const html = await page.evaluate(() => document.querySelector('#hud')?.outerHTML?.slice(0, 2000));
    console.log(html);
  }
});

await step('10-observatory-nightsky', async () => {
  await page.evaluate(() => window.__orrery?.openObservatory?.());
  await sleep(2500);
  await shot('10-night-sky');
});

await step('11-observatory-stars', async () => {
  await page.evaluate(() => window.__orrery?.openObservatory?.('alpha-centauri'));
  await sleep(1500);
  await shot('11-nearby-stars');
});

await step('12-observatory-deepsky', async () => {
  await page.evaluate(() => window.__orrery?.openObservatory?.('m31'));
  await sleep(2000);
  await shot('12-deep-sky');
});

await step('13-spacecraft', async () => {
  await page.keyboard.press('Escape');
  await sleep(400);
  await page.evaluate(() => window.__orrery?.enterSpacecraft?.());
  await sleep(5000);
  await shot('13-spacecraft-cockpit');
});

await step('14-spacecraft-look', async () => {
  // drag to look around 180 degrees
  await page.mouse.move(720, 400);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(720 - i * 30, 400, { steps: 2 });
  }
  await page.mouse.up();
  await sleep(800);
  await shot('14-spacecraft-look-back');
});

await step('15-true-scale', async () => {
  await page.evaluate(() => window.__orrery?.exitSpacecraft?.());
  await sleep(3000);
  await page.evaluate(() => window.__orrery?.setScale?.('true'));
  await sleep(3500);
  await shot('15-true-scale');
});

await step('16-galaxy-mode', async () => {
  await page.evaluate(() => window.__orrery?.enterGalaxy?.());
  await sleep(9000);
  await shot('16-galaxy-mode');
});

await step('17-mobile', async () => {
  await page.evaluate(() => window.__orrery?.exitGalaxy?.());
  await sleep(5000);
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(2500);
  await shot('17-mobile-portrait');
});

console.log(`\n============================================`);
console.log(problems.length ? `${problems.length} problems:\n${problems.join('\n')}` : 'No console/page errors.');
await browser.close();
