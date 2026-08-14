/**
 * Render budgets by device class.
 *
 * A phone is not a small desktop. A modern handset reports a device pixel
 * ratio of 3, so rendering "natively" at 393 CSS pixels wide means a
 * 1179x2556 framebuffer - and then the bloom pass resamples that several more
 * times. That is more fragments per frame than most laptops push, on a GPU
 * with a fraction of the bandwidth and no fan, and it is the single largest
 * cost in this app on mobile.
 *
 * So the budgets here are *starting points* chosen by capability, not final
 * answers: app.ts still measures frame time and adapts within these bounds.
 * The ceiling is what stops a phone from trying 3x in the first place; the
 * floor is what stops the adaptive loop from degrading into mush.
 */
import { device } from '../ui/device';

export interface RenderBudget {
  /** Hard ceiling on renderer pixel ratio. */
  maxPixelRatio: number;
  /** Where to start before the adaptive loop has an opinion. */
  startPixelRatio: number;
  /** Never go below this, however slow things get. */
  minPixelRatio: number;
  /** Bloom costs several full-screen passes; the smallest devices skip it. */
  bloom: boolean;
  /** Bloom resolution divisor - 1 is full, 2 is half-res and much cheaper. */
  bloomScale: number;
  /**
   * Highest texture rung Earth/Moon may stream. The 8k maps decode to
   * ~134 MB of RGBA each; a phone that loads two of them will be killed by
   * the OS before it ever finishes.
   */
  maxTextureRung: number;
  /** Multiplier on decorative particle counts (stars, belts, Oort cloud). */
  particleScale: number;
}

const BUDGETS: Record<'low' | 'mid' | 'high', RenderBudget> = {
  low: {
    maxPixelRatio: 1.25,
    startPixelRatio: 1,
    minPixelRatio: 0.75,
    bloom: true,
    bloomScale: 2,
    maxTextureRung: 1,
    particleScale: 0.45,
  },
  mid: {
    maxPixelRatio: 1.75,
    startPixelRatio: 1.25,
    minPixelRatio: 0.85,
    bloom: true,
    bloomScale: 2,
    maxTextureRung: 2,
    particleScale: 0.7,
  },
  high: {
    maxPixelRatio: 2,
    startPixelRatio: 2,
    minPixelRatio: 1,
    bloom: true,
    bloomScale: 1,
    maxTextureRung: 3,
    particleScale: 1,
  },
};

let overrideTier: 'low' | 'mid' | 'high' | null = null;

/** The budget for this device, clamped by its actual pixel ratio. */
export function renderBudget(): RenderBudget {
  const d = device();
  const tier = overrideTier ?? d.tier;
  const b = BUDGETS[tier];
  const dpr = d.devicePixelRatio;
  return {
    ...b,
    // asking for more than the display has is pure waste
    maxPixelRatio: Math.min(b.maxPixelRatio, dpr),
    startPixelRatio: Math.min(b.startPixelRatio, dpr),
    minPixelRatio: Math.min(b.minPixelRatio, dpr),
  };
}

/** Force a tier - used by the quality control and by the test harness. */
export function setQualityTier(tier: 'low' | 'mid' | 'high' | null): void {
  overrideTier = tier;
}

export function qualityTier(): 'low' | 'mid' | 'high' {
  return overrideTier ?? device().tier;
}
