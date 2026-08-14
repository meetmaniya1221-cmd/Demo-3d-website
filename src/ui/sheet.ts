/**
 * Bottom-sheet behaviour for touch devices.
 *
 * On a phone, a panel that simply appears and can only be dismissed by hunting
 * for a small X is a desktop dialog in disguise. A sheet should answer to the
 * thumb: drag it down to dismiss, drag it between heights, and flick it away.
 *
 * The subtle part is the handoff with the sheet's own scrolling content. A
 * downward drag that starts while the content is scrolled to the top must move
 * the *sheet*; the same drag once the content has scrolled must move the
 * *content*. Getting that wrong is what makes a hand-rolled sheet feel broken -
 * either it will not scroll, or it dismisses itself when you try to read it.
 *
 * This attaches to an existing element and is inert on pointer-fine devices, so
 * the desktop layout is untouched.
 */
import { isCompact, onDeviceChange } from './device';

export interface SheetOptions {
  /** The scrollable region inside the sheet, if any. */
  scroller?: HTMLElement;
  /**
   * Heights the sheet rests at, as a fraction of its own height that stays
   * visible. `1` is fully open. Sorted automatically; the largest is the
   * opening position unless `initial` says otherwise.
   */
  snaps?: number[];
  initial?: number;
  /** Dragged below this fraction, the sheet dismisses instead of snapping. */
  dismissBelow?: number;
  onDismiss?: () => void;
  onSnap?: (fraction: number) => void;
  /** Extra drag handles beyond the grip (e.g. the sheet's header). */
  handles?: HTMLElement[];
}

/** Flick speed (px/ms) past which direction wins over position. */
const FLICK = 0.5;

export class Sheet {
  private el: HTMLElement;
  private opts: Required<Pick<SheetOptions, 'snaps' | 'dismissBelow'>> & SheetOptions;
  private grip: HTMLElement;
  private dragging = false;
  private pointerId = -1;
  private startY = 0;
  private startOffset = 0;
  private lastY = 0;
  private lastT = 0;
  private velocity = 0;
  /** Pixels the sheet is pushed down from fully open. */
  private offset = 0;
  private height = 1;
  private fromScroller = false;
  private enabled = false;

  constructor(el: HTMLElement, options: SheetOptions = {}) {
    this.el = el;
    this.opts = {
      snaps: (options.snaps ?? [1]).slice().sort((a, b) => a - b),
      dismissBelow: options.dismissBelow ?? 0.45,
      ...options,
    };

    this.grip = document.createElement('div');
    this.grip.className = 'sheet-grip';
    this.grip.setAttribute('aria-hidden', 'true');
    el.prepend(this.grip);

    this.bind(this.grip);
    for (const h of this.opts.handles ?? []) this.bind(h);
    if (this.opts.scroller) this.bindScroller(this.opts.scroller);

    this.sync();
    onDeviceChange(() => this.sync());
  }

  /** Turn the behaviour on or off to match the current layout. */
  private sync(): void {
    const want = isCompact();
    if (want === this.enabled) return;
    this.enabled = want;
    this.el.classList.toggle('as-sheet', want);
    if (!want) this.reset();
  }

  private bind(target: HTMLElement): void {
    target.addEventListener('pointerdown', (e) => this.onDown(e, false), { passive: true });
  }

  /**
   * The scroll handoff. A drag starting at the very top of the content belongs
   * to the sheet; anywhere else it belongs to the scroller, and the sheet must
   * not steal it.
   */
  private bindScroller(scroller: HTMLElement): void {
    scroller.addEventListener(
      'pointerdown',
      (e) => {
        if (scroller.scrollTop > 0) return;
        this.onDown(e, true);
      },
      { passive: true },
    );
  }

  private onDown(e: PointerEvent, fromScroller: boolean): void {
    if (!this.enabled || this.dragging) return;
    if (e.pointerType === 'mouse' && fromScroller) return;
    // never hijack a press that landed on something interactive
    const t = e.target as HTMLElement | null;
    if (t?.closest('button, a, input, select, textarea, [role="button"], canvas')) return;
    this.dragging = true;
    this.fromScroller = fromScroller;
    this.pointerId = e.pointerId;
    this.height = this.el.getBoundingClientRect().height || 1;
    this.startY = e.clientY;
    this.lastY = e.clientY;
    this.lastT = performance.now();
    this.velocity = 0;
    this.startOffset = this.offset;
    this.el.classList.add('sheet-dragging');
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp, { passive: true });
    window.addEventListener('pointercancel', this.onUp, { passive: true });
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const dy = e.clientY - this.startY;
    // a drag that began on the scroller only counts once it is clearly
    // downward, so a fingertip wobble on the way to scrolling up is ignored
    if (this.fromScroller && dy < 6) return;
    if (e.cancelable) e.preventDefault();
    const now = performance.now();
    const dt = Math.max(now - this.lastT, 1);
    this.velocity = (e.clientY - this.lastY) / dt;
    this.lastY = e.clientY;
    this.lastT = now;
    // upward past fully-open gets heavy rather than stopping dead
    let next = this.startOffset + dy;
    if (next < 0) next *= 0.3;
    this.setOffset(next);
  };

  private onUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.el.classList.remove('sheet-dragging');

    const visible = 1 - this.offset / this.height;
    // a decisive flick beats where the finger happened to stop
    const flickDown = this.velocity > FLICK;
    const flickUp = this.velocity < -FLICK;
    if (flickDown && visible < this.opts.snaps[0] + 0.12) {
      this.dismiss();
      return;
    }
    if (!flickUp && visible < this.opts.dismissBelow) {
      this.dismiss();
      return;
    }
    let target = this.opts.snaps[0];
    if (flickUp) {
      target = this.opts.snaps[this.opts.snaps.length - 1];
    } else if (flickDown) {
      // the next rest position below where it is now
      const below = this.opts.snaps.filter((s) => s < visible - 0.02);
      target = below.length ? below[below.length - 1] : this.opts.snaps[0];
    } else {
      for (const s of this.opts.snaps) {
        if (Math.abs(s - visible) < Math.abs(target - visible)) target = s;
      }
    }
    this.snapTo(target);
  };

  private setOffset(px: number): void {
    this.offset = px;
    this.el.style.transform = px === 0 ? '' : `translate3d(0, ${px.toFixed(1)}px, 0)`;
  }

  /** Animate to a rest fraction (1 = fully open). */
  snapTo(fraction: number): void {
    if (!this.enabled) return;
    this.height = this.el.getBoundingClientRect().height || this.height;
    this.el.classList.add('sheet-settling');
    this.setOffset(Math.max(0, (1 - fraction) * this.height));
    this.opts.onSnap?.(fraction);
    window.setTimeout(() => this.el.classList.remove('sheet-settling'), 280);
    // content only scrolls at the tallest rest position
    if (this.opts.scroller) {
      const top = fraction >= this.opts.snaps[this.opts.snaps.length - 1] - 0.01;
      this.opts.scroller.style.overflowY = top ? '' : 'hidden';
      if (!top) this.opts.scroller.scrollTop = 0;
    }
  }

  private dismiss(): void {
    if (this.opts.onDismiss) {
      this.el.classList.add('sheet-settling');
      this.opts.onDismiss();
      window.setTimeout(() => this.reset(), 300);
    } else {
      this.snapTo(this.opts.snaps[this.opts.snaps.length - 1]);
    }
  }

  /** Back to fully open with no transform - call when the sheet is shown. */
  reset(): void {
    this.el.classList.remove('sheet-dragging', 'sheet-settling');
    this.setOffset(0);
    if (this.opts.scroller) this.opts.scroller.style.overflowY = '';
  }

  /** Open at the configured initial rest position. */
  present(): void {
    this.reset();
    const initial = this.opts.initial;
    if (this.enabled && initial !== undefined && initial < 1) {
      // let layout settle so the height is real before the first snap
      requestAnimationFrame(() => this.snapTo(initial));
    }
  }
}
