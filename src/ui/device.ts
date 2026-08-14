/**
 * What kind of device is looking at this, and how much room does it have.
 *
 * One source of truth, published as attributes on <html> so CSS and TypeScript
 * agree. Everything is driven by the *viewport* and the *pointer*, never by
 * user-agent sniffing: a narrow desktop window should get the compact shell,
 * a tablet with a mouse should not get thumb-sized controls, and resizing a
 * desktop browser should reflow live rather than needing a reload.
 *
 *   <html data-screen="phone|tablet|desktop"
 *         data-pointer="coarse|fine"
 *         data-shell="compact|full"
 *         data-orient="portrait|landscape">
 *
 * Also publishes --app-h / --app-w. Mobile browsers change their visible
 * height as the URL bar slides away, and `100vh` is famously the *largest*
 * height rather than the current one, so a bottom bar sized in vh spends the
 * first scroll underneath the browser chrome. `dvh` fixes this where it
 * exists; --app-h is the fallback and the value JS can read.
 */

export type ScreenClass = 'phone' | 'tablet' | 'desktop';
export type Orientation = 'portrait' | 'landscape';

/**
 * Below this, on the short edge, a viewport is a phone however it is held.
 * Landscape phones are ~360-430 tall, so measuring the short edge keeps a
 * rotated phone classified as a phone instead of jumping to "tablet" and
 * being handed a layout its height cannot hold.
 */
const PHONE_SHORT_EDGE = 500;
const TABLET_SHORT_EDGE = 840;

export interface DeviceState {
  screen: ScreenClass;
  orientation: Orientation;
  coarse: boolean;
  /** Use the compact, touch-first shell rather than the desktop chrome. */
  compact: boolean;
  width: number;
  height: number;
  shortEdge: number;
  /** Rough capability tier, for choosing render budgets. */
  tier: 'low' | 'mid' | 'high';
  devicePixelRatio: number;
}

type Listener = (s: DeviceState) => void;

const listeners = new Set<Listener>();
let current: DeviceState;

function coarsePointer(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  // `any-pointer: coarse` is true on a laptop with a touchscreen, which should
  // still get the desktop layout - `pointer: coarse` asks about the *primary*
  // input, which is the question that matters here.
  return matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
}

/**
 * Capability tier. Nothing here is reliable on its own - deviceMemory is
 * Chromium-only and coarsely bucketed, and core count says little about the
 * GPU - so they are combined conservatively and only ever used to pick a
 * *starting* budget. The adaptive frame-cost loop in app.ts is what actually
 * settles on the right quality.
 */
function capabilityTier(coarse: boolean, shortEdge: number): 'low' | 'mid' | 'high' {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? (coarse ? 4 : 8);
  const cores = navigator.hardwareConcurrency ?? (coarse ? 4 : 8);
  // A mouse means a machine with a real GPU, mains power and no thermal
  // cliff, so it keeps the full budget. Core count in particular says almost
  // nothing here - a four-core desktop still has a discrete GPU, and demoting
  // on that alone capped the 8k Earth and Moon maps on ordinary laptops.
  if (!coarse) return mem <= 2 ? 'mid' : 'high';
  // A large touch screen with plenty of memory is a tablet, not a phone.
  if (mem >= 8 && shortEdge > TABLET_SHORT_EDGE) return 'high';
  if (mem <= 3 || cores <= 4) return 'low';
  if (mem <= 6) return 'mid';
  return 'mid';
}

function measure(): DeviceState {
  // visualViewport is the region actually on screen - it shrinks when the
  // on-screen keyboard opens, which innerHeight does not always do
  const vv = window.visualViewport;
  const width = Math.round(vv?.width ?? window.innerWidth);
  const height = Math.round(window.innerHeight);
  const shortEdge = Math.min(width, height);
  const coarse = coarsePointer();
  // A mouse rules out phone and tablet outright above the narrow-window
  // threshold: a 1440x810 desktop has an 810px short edge and was being
  // classified as a tablet. Below it, a narrow desktop window still gets the
  // compact shell, which is what makes the layout testable by resizing.
  const screen: ScreenClass =
    shortEdge <= PHONE_SHORT_EDGE
      ? 'phone'
      : !coarse || shortEdge > TABLET_SHORT_EDGE
        ? 'desktop'
        : 'tablet';
  return {
    screen,
    orientation: width >= height ? 'landscape' : 'portrait',
    coarse,
    // tablets keep the roomier layout in landscape, where they have the width
    // for it, and take the compact shell in portrait
    compact: screen === 'phone' || (screen === 'tablet' && width < height),
    width,
    height,
    shortEdge,
    tier: capabilityTier(coarse, shortEdge),
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

function publish(s: DeviceState): void {
  const el = document.documentElement;
  // Also as a body class, set here rather than by whichever UI module happens
  // to mount first - the compact stylesheet has to be in force before the
  // first paint or the phone shows a frame of desktop chrome.
  document.body?.classList.toggle('compact-shell', s.compact);
  el.dataset.screen = s.screen;
  el.dataset.pointer = s.coarse ? 'coarse' : 'fine';
  el.dataset.shell = s.compact ? 'compact' : 'full';
  el.dataset.orient = s.orientation;
  el.style.setProperty('--app-h', `${s.height}px`);
  el.style.setProperty('--app-w', `${s.width}px`);
}

function changed(a: DeviceState, b: DeviceState): boolean {
  return (
    a.screen !== b.screen ||
    a.orientation !== b.orientation ||
    a.coarse !== b.coarse ||
    a.compact !== b.compact ||
    a.width !== b.width ||
    a.height !== b.height
  );
}

function refresh(): void {
  const next = measure();
  if (current && !changed(current, next)) return;
  current = next;
  publish(next);
  for (const fn of listeners) fn(next);
}

current = measure();
publish(current);

if (typeof window !== 'undefined') {
  window.addEventListener('resize', refresh, { passive: true });
  window.addEventListener('orientationchange', () => {
    // iOS reports the old size for a frame or two either side of the rotation
    refresh();
    setTimeout(refresh, 120);
    setTimeout(refresh, 400);
  });
  window.visualViewport?.addEventListener('resize', refresh, { passive: true });
  matchMedia('(pointer: coarse)').addEventListener?.('change', refresh);
}

/** The current device state. Cheap - it is cached, not re-measured. */
export function device(): DeviceState {
  return current;
}

/** Subscribe to layout-relevant changes. Returns an unsubscribe function. */
export function onDeviceChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when the compact, touch-first shell should be used. */
export function isCompact(): boolean {
  return current.compact;
}

/** True when the primary input is a finger. */
export function isTouch(): boolean {
  return current.coarse;
}
