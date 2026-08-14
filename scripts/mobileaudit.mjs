/**
 * Mobile audit.
 *
 * Drives the app through its real states at real phone and tablet viewports,
 * in both orientations, and measures the things that actually make a 3D app
 * unusable on a phone: content wider than the screen, controls too small to
 * hit with a thumb, text below the legible floor, panels that eat the whole
 * viewport, overlays that trap the user, and frames that never arrive.
 *
 * It reports rather than asserts by default - `--strict` turns the findings
 * into a non-zero exit so it can guard a regression once the fixes land.
 *
 * Usage: node scripts/mobileaudit.mjs [--url ...] [--out shots/mobile] [--strict]
 */
import { chromium, devices } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const URL = argOf('url', 'http://localhost:4173/');
const OUT = argOf('out', 'shots/mobile');
const STRICT = args.includes('--strict');
const ONLY = argOf('only', null);
mkdirSync(OUT, { recursive: true });

/** The screen sizes worth caring about, smallest first. */
const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667, dpr: 2, touch: true },
  { name: 'iphone-14', width: 393, height: 852, dpr: 3, touch: true },
  { name: 'pixel-7', width: 412, height: 915, dpr: 2.6, touch: true },
  { name: 'iphone-14-land', width: 852, height: 393, dpr: 3, touch: true },
  { name: 'ipad-mini', width: 744, height: 1133, dpr: 2, touch: true },
  { name: 'galaxy-fold', width: 344, height: 882, dpr: 2.6, touch: true },
];

/** Minimum comfortable thumb target, per Apple HIG / Material. */
const MIN_TAP = 44;
/** Below this, body text stops being readable at arm's length on a phone. */
const MIN_TEXT = 11;

const findings = [];
function finding(viewport, state, kind, detail, severity = 'major') {
  findings.push({ viewport, state, kind, detail, severity });
}

/**
 * Everything measurable about the current DOM, gathered in one pass in the
 * page so a slow bridge does not turn an audit into a five-minute wait.
 */
const PROBE = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out = {
    vw,
    vh,
    scrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    overflowing: [],
    smallTaps: [],
    smallText: [],
    offscreen: [],
    hugePanels: [],
  };
  const seenTap = new Set();
  const interactive = document.querySelectorAll(
    'button, [role="button"], a[href], input, select, summary, [tabindex]:not([tabindex="-1"])',
  );
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    // hidden behind a closed overlay?
    let p = el;
    let hidden = false;
    while (p && p !== document.body) {
      const pcs = getComputedStyle(p);
      if (pcs.display === 'none' || pcs.visibility === 'hidden' || +pcs.opacity === 0) {
        hidden = true;
        break;
      }
      p = p.parentElement;
    }
    if (hidden) continue;
    const label = (el.textContent || el.getAttribute('aria-label') || el.className || el.tagName)
      .toString()
      .trim()
      .slice(0, 34);
    const key = `${label}@${Math.round(r.x)},${Math.round(r.y)}`;
    if (seenTap.has(key)) continue;
    seenTap.add(key);
    if (r.width < 44 || r.height < 44) {
      out.smallTaps.push({ label, w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
    }
    let scrollable = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (/auto|scroll/.test(acs.overflowY + acs.overflowX)) {
        scrollable = true;
        break;
      }
    }
    // content inside a scroller is meant to be off-screen until scrolled to
    if (!scrollable && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1)) {
      out.offscreen.push({
        label,
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      });
    }
  }
  // text below the legible floor
  const textSeen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length) continue;
    let hasText = false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim().length > 1) hasText = true;
    }
    if (!hasText) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const size = parseFloat(cs.fontSize);
    if (size < 11) {
      const k = `${el.className}|${size}`;
      if (textSeen.has(k)) continue;
      textSeen.add(k);
      out.smallText.push({
        cls: (el.className || el.tagName).toString().slice(0, 40),
        px: +size.toFixed(1),
        sample: (el.textContent || '').trim().slice(0, 26),
      });
    }
  }
  // Elements sticking out horizontally. Children of a horizontal scroller are
  // meant to be out there until scrolled to, so they are not overflow - the
  // scroller itself is what has to fit.
  const inXScroller = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(a).overflowX)) return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && cs.visibility === 'hidden') continue;
    if (inXScroller(el)) continue;
    if (r.right > vw + 2 && r.width > 40 && r.width < vw * 3) {
      out.overflowing.push({
        cls: (el.className || el.tagName).toString().slice(0, 44),
        right: Math.round(r.right),
        w: Math.round(r.width),
      });
    }
  }
  out.overflowing = out.overflowing.slice(0, 8);
  // panels eating the screen
  for (const el of document.querySelectorAll('.info-panel, .overlay, .overlay-card, .sc-nav, .sc-location, .sc-deck')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (r.width * r.height > vw * vh * 0.82) {
      out.hugePanels.push({
        cls: (el.className || '').toString().slice(0, 40),
        pct: Math.round(((r.width * r.height) / (vw * vh)) * 100),
      });
    }
  }
  return out;
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

const summary = [];

for (const vp of VIEWPORTS) {
  if (ONLY && vp.name !== ONLY) continue;
  console.log(`\n=== ${vp.name}  ${vp.width}x${vp.height} @${vp.dpr}x ===`);
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    hasTouch: vp.touch,
    isMobile: true,
    userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Third-party cookie/.test(m.text())) errors.push(m.text());
  });

  const shot = (n) => page.screenshot({ path: `${OUT}/${vp.name}-${n}.png` });
  const probe = async (state) => {
    const r = await page.evaluate(PROBE);
    if (r.scrollW > r.vw + 1) {
      finding(vp.name, state, 'horizontal-overflow', `document scrolls to ${r.scrollW}px in a ${r.vw}px viewport`, 'critical');
    }
    for (const o of r.overflowing) {
      finding(vp.name, state, 'element-overflow', `${o.cls} right edge at ${o.right} (w=${o.w})`);
    }
    for (const t of r.smallTaps) {
      finding(vp.name, state, 'tap-target', `${t.label} is ${t.w}x${t.h}, below ${MIN_TAP}px`);
    }
    for (const t of r.smallText) {
      finding(vp.name, state, 'text-size', `${t.cls} at ${t.px}px ("${t.sample}")`, 'minor');
    }
    for (const p of r.hugePanels) {
      finding(vp.name, state, 'panel-coverage', `${p.cls} covers ${p.pct}% of the viewport`);
    }
    for (const o of r.offscreen) {
      finding(vp.name, state, 'offscreen-control', `${o.label} at ${o.x},${o.y} ${o.w}x${o.h}`);
    }
    const counts = {
      taps: r.smallTaps.length,
      text: r.smallText.length,
      overflow: r.overflowing.length,
      offscreen: r.offscreen.length,
      huge: r.hugePanels.length,
    };
    console.log(`  ${state.padEnd(20)} ${JSON.stringify(counts)}`);
    return r;
  };

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => !!window.__orrery, null, { timeout: 90_000 });
    await page.waitForTimeout(2500);
    await shot('01-splash');
    await probe('splash');

    await page.click('[data-act="explore"]').catch(() => {});
    await page.waitForTimeout(2500);
    await shot('02-explorer');
    await probe('explorer');

    await page.evaluate(() => window.__orrery.select('saturn'));
    await page.waitForTimeout(3500);
    await shot('03-planet-selected');
    await probe('planet-selected');

    await page.evaluate(() => window.__orrery.openSearch());
    await page.waitForTimeout(900);
    await shot('04-search');
    await probe('search');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    await page.evaluate(() => window.__orrery.openAtlas());
    await page.waitForTimeout(1200);
    await shot('05-atlas');
    await probe('atlas');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    await page.evaluate(() => window.__orrery.openMissions());
    await page.waitForTimeout(1200);
    await shot('06-missions');
    await probe('missions');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    await page.evaluate(() => window.__orrery.openObservatory());
    await page.waitForTimeout(1800);
    await shot('07-observatory');
    await probe('observatory');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    await page.evaluate(() => window.__orrery.openEarthMoon());
    await page.waitForTimeout(1500);
    await shot('08-earthmoon');
    await probe('earthmoon-lab');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    await page.evaluate(() => window.__orrery.openStructure('earth'));
    await page.waitForTimeout(1500);
    await shot('09-structure');
    await probe('structure');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // spacecraft mode - the densest UI in the app
    await page.evaluate(() => window.__orrery.enterSpacecraft());
    await page
      .waitForFunction(() => window.__orrery.spacecraft.phase() === 'flying', null, { timeout: 40_000 })
      .catch(() => {});
    await page.waitForTimeout(2500);
    await shot('10-spacecraft');
    await probe('spacecraft');

    await page.evaluate(() => window.__orrery.spacecraft.target('mars'));
    await page.waitForTimeout(1200);
    await shot('11-spacecraft-target');
    await probe('spacecraft-target');

    await page.evaluate(() => window.__orrery.spacecraft.teleportTo('jupiter', 1.2));
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__orrery.spacecraft.orbit());
    await page.waitForTimeout(2000);
    await shot('12-spacecraft-orbit');
    await probe('spacecraft-orbit');

    // frame rate in the heaviest state
    const fps = await page.evaluate(
      () =>
        new Promise((res) => {
          let f = 0;
          const t0 = performance.now();
          const tick = () => {
            f++;
            if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
            else res(+(f / ((performance.now() - t0) / 1000)).toFixed(2));
          };
          requestAnimationFrame(tick);
        }),
    );
    const gl = await page.evaluate(() => {
      const i = window.__orrery.renderer.info;
      return {
        pixelRatio: window.__orrery.renderer.getPixelRatio(),
        textures: i.memory.textures,
        geometries: i.memory.geometries,
        calls: i.render.calls,
        triangles: i.render.triangles,
        programs: i.programs?.length ?? 0,
      };
    });
    console.log(`  fps=${fps}  ${JSON.stringify(gl)}`);
    summary.push({ viewport: vp.name, fps, ...gl });
    if (gl.pixelRatio > 2) {
      finding(vp.name, 'render', 'pixel-ratio', `rendering at ${gl.pixelRatio}x on a phone`, 'critical');
    }

    await page.evaluate(() => window.__orrery.exitSpacecraft());
    await page.waitForTimeout(1500);
  } catch (e) {
    finding(vp.name, 'run', 'crash', e.message, 'critical');
    console.log(`  ! ${e.message}`);
  }

  for (const e of [...new Set(errors)]) {
    finding(vp.name, 'console', 'js-error', e.slice(0, 160), 'critical');
    console.log(`  ! ${e.slice(0, 120)}`);
  }
  await ctx.close();
}

await browser.close();

// ---------------------------------------------------------------- report --
const byKind = {};
for (const f of findings) {
  const k = `${f.kind}`;
  (byKind[k] ??= []).push(f);
}
console.log('\n================ FINDINGS ================');
const order = ['critical', 'major', 'minor'];
for (const kind of Object.keys(byKind).sort(
  (a, b) => order.indexOf(byKind[a][0].severity) - order.indexOf(byKind[b][0].severity),
)) {
  const list = byKind[kind];
  console.log(`\n${kind.toUpperCase()}  (${list.length}, ${list[0].severity})`);
  const uniq = new Map();
  for (const f of list) {
    const key = f.detail.replace(/\d+(\.\d+)?/g, '#');
    if (!uniq.has(key)) uniq.set(key, { ...f, viewports: new Set(), states: new Set() });
    uniq.get(key).viewports.add(f.viewport);
    uniq.get(key).states.add(f.state);
  }
  for (const f of [...uniq.values()].slice(0, 22)) {
    console.log(`  - ${f.detail}`);
    console.log(`      ${[...f.states].slice(0, 4).join(', ')} @ ${[...f.viewports].join(', ')}`);
  }
  if (uniq.size > 22) console.log(`  ... and ${uniq.size - 22} more distinct`);
}
console.log('\n================ RENDER ================');
for (const s of summary) console.log(`  ${JSON.stringify(s)}`);

writeFileSync(`${OUT}/findings.json`, JSON.stringify({ findings, summary }, null, 2));
const criticals = findings.filter((f) => f.severity === 'critical').length;
console.log(
  `\n${findings.length} findings (${criticals} critical) across ${VIEWPORTS.length} viewports -> ${OUT}/findings.json`,
);
process.exit(STRICT && findings.length ? 1 : 0);
