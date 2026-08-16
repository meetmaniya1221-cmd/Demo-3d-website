/**
 * The interactive galaxy map: a top-down chart of the Milky Way rendered
 * from the same density model as the 3D scene - the map IS the territory,
 * just integrated down the galactic pole.
 *
 * Zoom (wheel), pan (drag), rotate (Shift+drag), search, click-to-set a
 * waypoint, route engagement, distance measurement, and overlays for the
 * arms, the Sun, Sagittarius A*, catalogued landmarks and everything the
 * player's survey has recorded.
 */
import { ARMS, SPUR, armTheta, densityAt, type Landmark } from './model';
import type { DiscoveryLog } from './discovery';
import { Vec3d, fmtLy } from './units';

export interface MapCallbacks {
  onEngageRoute: (target: Vec3d, label: string) => void;
  onClose?: () => void;
}

const BACKDROP_N = 240;
const BACKDROP_SPAN = 130_000; // ly across the full image

export class GalaxyMap {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private backdrop: HTMLCanvasElement | null = null;
  private open = false;
  private view = { cx: 0, cy: 0, scale: 0.006, rot: 0 };
  private waypoint: Vec3d | null = null;
  private measureA: Vec3d | null = null;
  private measureB: Vec3d | null = null;
  private measuring = false;
  private dragging = false;
  private rotating = false;
  private moved = false;
  private last = { x: 0, y: 0 };
  private cursorGal: Vec3d | null = null;
  private searchBox: HTMLInputElement;
  private resultsEl: HTMLElement;
  private readout: HTMLElement;
  private raf = 0;

  constructor(
    parent: HTMLElement,
    private landmarks: Landmark[],
    private log: DiscoveryLog,
    private ship: () => { pos: Vec3d; heading: number },
    private cb: MapCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'gx-map';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Galaxy map');
    this.root.innerHTML = `
      <div class="gx-map-top">
        <b>GALAXY MAP</b>
        <input type="text" class="gx-map-search" placeholder="Search the galaxy…" aria-label="Search landmarks" />
        <div class="gx-map-tools">
          <button data-act="measure" aria-pressed="false">Measure</button>
          <button data-act="route">Engage route</button>
          <button data-act="clear">Clear</button>
          <button data-act="close" aria-label="Close map">×</button>
        </div>
      </div>
      <div class="gx-map-results"></div>
      <canvas></canvas>
      <div class="gx-map-readout"></div>
      <div class="gx-map-hint">Click sets a waypoint · drag pans · wheel zooms · Shift+drag rotates</div>
    `;
    this.canvas = this.root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.searchBox = this.root.querySelector('.gx-map-search')!;
    this.resultsEl = this.root.querySelector('.gx-map-results')!;
    this.readout = this.root.querySelector('.gx-map-readout')!;
    parent.appendChild(this.root);

    this.root.querySelector('[data-act="close"]')!.addEventListener('click', () => this.close());
    this.root.querySelector('[data-act="clear"]')!.addEventListener('click', () => {
      this.waypoint = null;
      this.measureA = this.measureB = null;
    });
    const measureBtn = this.root.querySelector<HTMLButtonElement>('[data-act="measure"]')!;
    measureBtn.addEventListener('click', () => {
      this.measuring = !this.measuring;
      this.measureA = this.measureB = null;
      measureBtn.setAttribute('aria-pressed', String(this.measuring));
      measureBtn.classList.toggle('on', this.measuring);
    });
    this.root.querySelector('[data-act="route"]')!.addEventListener('click', () => {
      if (this.waypoint) {
        this.cb.onEngageRoute(this.waypoint.clone(), 'map waypoint');
        this.close();
      }
    });

    this.searchBox.addEventListener('input', () => this.renderSearch());
    this.searchBox.addEventListener('keydown', (e) => e.stopPropagation());

    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.rotating = e.shiftKey;
      this.moved = false;
      this.last = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.cursorGal = this.screenToGal(e.clientX - rect.left, e.clientY - rect.top);
      if (!this.dragging) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.moved = true;
      this.last = { x: e.clientX, y: e.clientY };
      if (this.rotating) {
        this.view.rot += dx * 0.005;
      } else {
        const cos = Math.cos(this.view.rot);
        const sin = Math.sin(this.view.rot);
        const gx = (dx * cos + dy * sin) / this.view.scale;
        const gy = (dx * -sin + dy * cos) / this.view.scale;
        this.view.cx -= gx;
        this.view.cy += gy;
      }
    });
    this.canvas.addEventListener('pointerup', (e) => {
      this.dragging = false;
      if (this.moved) return;
      const rect = this.canvas.getBoundingClientRect();
      const gal = this.screenToGal(e.clientX - rect.left, e.clientY - rect.top);
      if (this.measuring) {
        if (!this.measureA || this.measureB) {
          this.measureA = gal;
          this.measureB = null;
        } else {
          this.measureB = gal;
        }
      } else {
        this.waypoint = gal;
      }
    });
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0012);
        this.view.scale = Math.min(4, Math.max(0.002, this.view.scale * factor));
      },
      { passive: false },
    );
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.root.classList.add('open');
    const s = this.ship();
    this.view.cx = s.pos.x;
    this.view.cy = s.pos.y;
    if (!this.backdrop) this.buildBackdrop();
    this.resize();
    this.renderSearch();
    const loop = () => {
      if (!this.open) return;
      this.resize(); // no-op unless the layout box changed (search results strip)
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('open');
    cancelAnimationFrame(this.raf);
    this.cb.onClose?.();
  }

  /** Match the canvas backing store to its own layout box. Called on open and
   *  re-checked every frame, because the search-results strip changes the
   *  canvas's height and a stale store both stretches the chart and makes
   *  clicks land in the wrong place. Guarded for the display:none state,
   *  where the rect collapses to zero (a negative height assigned to
   *  canvas.height is invalid). */
  resize(): void {
    if (!this.open) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** The waypoint, if the player has set one (mode reads it for markers). */
  get currentWaypoint(): Vec3d | null {
    return this.waypoint;
  }

  // ------------------------------------------------------------- internals

  private buildBackdrop(): void {
    // integrate the model straight down the pole at modest resolution -
    // done once, ~60k density evaluations
    const c = document.createElement('canvas');
    c.width = c.height = BACKDROP_N;
    const bctx = c.getContext('2d')!;
    const img = bctx.createImageData(BACKDROP_N, BACKDROP_N);
    for (let py = 0; py < BACKDROP_N; py++) {
      for (let px = 0; px < BACKDROP_N; px++) {
        const gx = ((px + 0.5) / BACKDROP_N - 0.5) * BACKDROP_SPAN;
        const gy = -(((py + 0.5) / BACKDROP_N - 0.5) * BACKDROP_SPAN);
        const d = densityAt(gx, gy, 0) + densityAt(gx, gy, 600) * 0.5;
        const v = Math.pow(Math.min(1, d / 60), 0.42);
        const r = Math.hypot(gx, gy);
        const warm = Math.min(1, 2600 / Math.max(r, 300));
        const i = (py * BACKDROP_N + px) * 4;
        img.data[i] = Math.round(58 * v * (1 + warm * 1.6));
        img.data[i + 1] = Math.round(64 * v * (1 + warm * 1.1));
        img.data[i + 2] = Math.round(96 * v);
        img.data[i + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
    this.backdrop = c;
  }

  private galToScreen(gx: number, gy: number): { x: number; y: number } {
    const w = this.canvas.width / Math.min(2, window.devicePixelRatio || 1);
    const h = this.canvas.height / Math.min(2, window.devicePixelRatio || 1);
    const dx = gx - this.view.cx;
    const dy = gy - this.view.cy;
    const cos = Math.cos(this.view.rot);
    const sin = Math.sin(this.view.rot);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return { x: w / 2 + rx * this.view.scale, y: h / 2 - ry * this.view.scale };
  }

  private screenToGal(sx: number, sy: number): Vec3d {
    const w = this.canvas.width / Math.min(2, window.devicePixelRatio || 1);
    const h = this.canvas.height / Math.min(2, window.devicePixelRatio || 1);
    const rx = (sx - w / 2) / this.view.scale;
    const ry = -(sy - h / 2) / this.view.scale;
    const cos = Math.cos(-this.view.rot);
    const sin = Math.sin(-this.view.rot);
    return new Vec3d(this.view.cx + rx * cos - ry * sin, this.view.cy + rx * sin + ry * cos, 0);
  }

  private renderSearch(): void {
    const q = this.searchBox.value.trim().toLowerCase();
    if (!q) {
      this.resultsEl.innerHTML = '';
      return;
    }
    const hits = this.landmarks
      .filter((lm) => lm.name.toLowerCase().includes(q))
      .slice(0, 8);
    this.resultsEl.innerHTML = hits
      .map((lm) => `<button data-id="${lm.id}">${lm.name}</button>`)
      .join('');
    for (const btn of this.resultsEl.querySelectorAll<HTMLButtonElement>('button')) {
      btn.addEventListener('click', () => {
        const lm = this.landmarks.find((l) => l.id === btn.dataset.id)!;
        this.view.cx = lm.pos.x;
        this.view.cy = lm.pos.y;
        this.waypoint = lm.pos.clone();
        this.searchBox.value = '';
        this.resultsEl.innerHTML = '';
      });
    }
  }

  private draw(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    const ctx = this.ctx;
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, w, h);

    // backdrop
    if (this.backdrop) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-this.view.rot);
      const span = BACKDROP_SPAN * this.view.scale;
      const off = this.galToLocal(this.view.cx, this.view.cy);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.backdrop, -span / 2 - off.x, -span / 2 + off.y, span, span);
      ctx.restore();
    }

    // radius rings every 10 kly
    ctx.strokeStyle = 'rgba(110,140,190,0.16)';
    ctx.fillStyle = 'rgba(140,170,220,0.45)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (let r = 10_000; r <= 60_000; r += 10_000) {
      const c = this.galToScreen(0, 0);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * this.view.scale, 0, Math.PI * 2);
      ctx.stroke();
      if (r % 20_000 === 0) {
        ctx.fillText(`${r / 1000} kly`, c.x + r * this.view.scale + 4, c.y);
      }
    }

    // arm centre-lines + names
    ctx.font = '600 10.5px system-ui, sans-serif';
    for (const arm of [...ARMS, SPUR]) {
      ctx.strokeStyle = 'rgba(120,170,255,0.20)';
      ctx.beginPath();
      let first = true;
      for (let r = arm.rootLy; r <= arm.endLy; r += 900) {
        const th = armTheta(arm, r);
        const p = this.galToScreen(r * Math.cos(th), r * Math.sin(th));
        if (first) {
          ctx.moveTo(p.x, p.y);
          first = false;
        } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      const midR = (arm.rootLy + arm.endLy) * 0.52;
      const th = armTheta(arm, midR);
      const lp = this.galToScreen(midR * Math.cos(th), midR * Math.sin(th));
      ctx.fillStyle = 'rgba(150,190,255,0.6)';
      ctx.fillText(arm.name, lp.x + 5, lp.y - 4);
    }

    // landmarks
    for (const lm of this.landmarks) {
      const p = this.galToScreen(lm.pos.x, lm.pos.y);
      if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue;
      if (lm.id === 'sgra') {
        ctx.strokeStyle = '#ffb26b';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffb26b';
        ctx.fillText('SAGITTARIUS A*', p.x + 10, p.y + 3);
      } else if (lm.id === 'sol') {
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText('SOL', p.x + 7, p.y + 3);
      } else {
        const col =
          lm.kind === 'nebula' ? 'rgba(255,140,150,0.75)' : lm.kind === 'cluster' ? 'rgba(255,220,170,0.7)' : 'rgba(170,190,240,0.7)';
        ctx.fillStyle = col;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
        if (this.view.scale > 0.008) ctx.fillText(lm.name, p.x + 6, p.y + 3);
      }
    }

    // survey discoveries
    ctx.fillStyle = 'rgba(120,255,190,0.55)';
    for (const e of this.log.all()) {
      if (e.kind !== 'star') continue;
      const p = this.galToScreen(e.pos.x, e.pos.y);
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }

    // waypoint + route
    const ship = this.ship();
    const sp = this.galToScreen(ship.pos.x, ship.pos.y);
    if (this.waypoint) {
      const p = this.galToScreen(this.waypoint.x, this.waypoint.y);
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const d = ship.pos.distanceTo(this.waypoint);
      ctx.fillStyle = '#7fd4ff';
      ctx.fillText(`waypoint · ${fmtLy(d)}`, p.x + 8, p.y - 6);
    }

    // measurement
    if (this.measureA) {
      const a = this.galToScreen(this.measureA.x, this.measureA.y);
      ctx.strokeStyle = '#ffd27f';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
      ctx.stroke();
      const end = this.measureB ?? this.cursorGal;
      if (end) {
        const b = this.galToScreen(end.x, end.y);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = '#ffd27f';
        ctx.fillText(fmtLy(this.measureA.distanceTo(end)), (a.x + b.x) / 2 + 6, (a.y + b.y) / 2);
      }
    }

    // the ship
    ctx.save();
    ctx.translate(sp.x, sp.y);
    ctx.rotate(-ship.heading - this.view.rot);
    ctx.fillStyle = '#8ef0b2';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(142,240,178,0.8)';
    ctx.fillText('YOU', sp.x + 8, sp.y + 4);

    // cursor readout
    if (this.cursorGal) {
      const d = ship.pos.distanceTo(this.cursorGal);
      this.readout.textContent = `cursor: X ${Math.round(this.cursorGal.x).toLocaleString('en-US')} · Y ${Math.round(this.cursorGal.y).toLocaleString('en-US')} ly · ${fmtLy(d)} from ship`;
    }
  }

  private galToLocal(gx: number, gy: number): { x: number; y: number } {
    return { x: gx * this.view.scale, y: gy * this.view.scale };
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }
}
