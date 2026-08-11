/**
 * Earth-Moon lab: a live, to-the-date simulation of the lunar cycle.
 *
 * The top-down diagram runs off the app's simulation clock (pause, rewind
 * and the time machine all apply): the Moon rides its real J2000 mean
 * longitude, the Sun direction comes from Earth's actual heliocentric
 * position, and the phase inset shows what you would see from your window
 * tonight. Sizes and the orbit radius are NOT to scale (the real Moon sits
 * 30 Earth-diameters away) - the lab says so on screen.
 */
import { PLANETS, keplerPosition } from '../data/bodies';
import type { AppState } from '../sim/state';
import { fmtSimDate } from './format';
import { Overlay } from './overlays';

const EARTH_ORBIT = PLANETS.find((p) => p.id === 'earth')!.orbit!;
const SYNODIC_DAYS = 29.530589;
/** Moon mean ecliptic longitude at J2000 + daily rate (deg). */
const MOON_L0 = 218.316;
const MOON_RATE = 13.176396;

const DEG = Math.PI / 180;

function phaseName(d: number): string {
  if (d < 22.5 || d >= 337.5) return 'New Moon';
  if (d < 67.5) return 'Waxing crescent';
  if (d < 112.5) return 'First quarter';
  if (d < 157.5) return 'Waxing gibbous';
  if (d < 202.5) return 'Full Moon';
  if (d < 247.5) return 'Waning gibbous';
  if (d < 292.5) return 'Last quarter';
  return 'Waning crescent';
}

export class EarthMoonOverlay extends Overlay {
  private state: AppState;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private readouts!: HTMLElement;
  private raf = 0;
  private lastReadout = '';
  private lastAria = '';

  constructor(parent: HTMLElement, state: AppState) {
    super(parent, 'Earth & Moon lab', 'earthmoon-title');
    this.state = state;
    this.bodyEl.innerHTML = `
      <div class="em-main">
        <div class="em-canvas-col">
          <canvas></canvas>
          <div class="em-readouts"></div>
          <p class="fine-print">Sizes and orbit distance are not to scale - the real Moon orbits 30 Earth-diameters away. Positions use the mean lunar longitude; the true Moon can lead or lag by up to ~8°.</p>
        </div>
        <div class="em-cards">
          <div class="concept-card">
            <div class="k">Why the Moon has phases</div>
            <p>Half the Moon is always sunlit. As it orbits us each month, we see that lit half from a changing angle - from all shadow (new) to all light (full). The phase is geometry, not Earth's shadow.</p>
          </div>
          <div class="concept-card">
            <div class="k">Why no eclipse every month</div>
            <p>The Moon's orbit is tilted ~5.1° to Earth's orbit, so at most new and full moons its shadow misses. Only when a new or full moon happens near the crossing points (the nodes) do the three bodies align: a <b>solar eclipse</b> at new moon, a <b>lunar eclipse</b> at full moon. (This lab and the 3D scene draw the orbit flat - the real tilt is what makes eclipses rare.)</p>
          </div>
          <div class="concept-card">
            <div class="k">Tides</div>
            <p>The Moon pulls the near side of Earth harder than the far side, stretching the oceans into two bulges - so most coasts get two high tides a day. When the Sun and Moon line up (new or full moon), their pulls stack into stronger <b>spring tides</b>; at the quarters they partly cancel into gentler <b>neap tides</b>.</p>
          </div>
          <div class="concept-card">
            <div class="k">Tidal locking</div>
            <p>The same tidal stretching, applied to the Moon over billions of years, braked its spin until one rotation exactly matches one orbit - which is why we only ever see one face.</p>
          </div>
        </div>
      </div>
    `;
    this.canvas = this.bodyEl.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.readouts = this.bodyEl.querySelector('.em-readouts')!;
  }

  protected onOpen(): void {
    cancelAnimationFrame(this.raf);
    const loop = () => {
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    super.close();
  }

  private draw(): void {
    const d = this.state.simDays;
    // geometry: geocentric ecliptic longitudes, degrees
    const moonLon = ((MOON_L0 + MOON_RATE * d) % 360 + 360) % 360;
    const [ex, ey] = keplerPosition(EARTH_ORBIT, d);
    const sunLon = ((Math.atan2(-ey, -ex) / DEG) % 360 + 360) % 360;
    const elong = ((moonLon - sunLon) % 360 + 360) % 360; // 0=new, 180=full
    const illum = (1 - Math.cos(elong * DEG)) / 2;

    // ---- canvas
    const wrap = this.canvas.parentElement!;
    const cssW = Math.min(460, Math.max(300, wrap.clientWidth || 460));
    const cssH = Math.round(cssW * 0.82);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(cssW * dpr) || this.canvas.height !== Math.round(cssH * dpr)) {
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
      this.canvas.style.width = `${cssW}px`;
      this.canvas.style.height = `${cssH}px`;
      this.canvas.setAttribute('role', 'img');
    }
    const aria = `Top-down diagram: the Moon at ${phaseName(elong)}, ${Math.round(illum * 100)} percent illuminated`;
    if (aria !== this.lastAria) {
      this.lastAria = aria;
      this.canvas.setAttribute('aria-label', aria);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const cx = cssW / 2;
    const cy = cssH / 2 + 8;
    const orbitR = Math.min(cssW, cssH) * 0.34;
    const earthR = 26;
    const moonR = 10;

    // sun direction on screen (ecliptic lon → screen: x=cos, y=-sin)
    const sx = Math.cos(sunLon * DEG);
    const sy = -Math.sin(sunLon * DEG);

    // sunlight rays from the sun side
    ctx.strokeStyle = 'rgba(255,214,140,0.30)';
    ctx.lineWidth = 1;
    const rayBase = orbitR + 46;
    for (let i = -2; i <= 2; i++) {
      const px = -sy * i * 26;
      const py = sx * i * 26;
      ctx.beginPath();
      ctx.moveTo(cx + sx * rayBase + px, cy + sy * rayBase + py);
      ctx.lineTo(cx + sx * (orbitR - 12) + px, cy + sy * (orbitR - 12) + py);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,214,140,0.85)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SUNLIGHT', cx + sx * (rayBase + 12), cy + sy * (rayBase + 12) + 3);

    // moon orbit
    ctx.strokeStyle = 'rgba(158,189,255,0.22)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // a body with its lit hemisphere toward the sun
    const litBall = (x: number, y: number, r: number, day: string, night: string) => {
      ctx.fillStyle = night;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      const ang = Math.atan2(sy, sx);
      ctx.fillStyle = day;
      ctx.beginPath();
      ctx.arc(x, y, r, ang - Math.PI / 2, ang + Math.PI / 2);
      ctx.closePath();
      ctx.fill();
    };

    litBall(cx, cy, earthR, '#7fb2e8', '#17263c');
    ctx.fillStyle = 'rgba(223,230,244,0.9)';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText('EARTH', cx, cy + earthR + 14);

    const mx = cx + Math.cos(moonLon * DEG) * orbitR;
    const my = cy - Math.sin(moonLon * DEG) * orbitR;
    litBall(mx, my, moonR, '#d8d8d2', '#20242c');
    ctx.fillText('MOON', mx, my + moonR + 13);

    // ---- phase inset: the Moon as seen from Earth right now
    // (northern-hemisphere convention: a waxing moon is lit on the right)
    const ix = cssW - 56;
    const iy = 52;
    const ir = 30;
    ctx.fillStyle = 'rgba(8,12,22,0.85)';
    ctx.beginPath();
    ctx.arc(ix, iy, ir + 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#232830';
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, Math.PI * 2);
    ctx.fill();
    // Lit region = the semicircle on the lit limb + the terminator, a
    // half-ellipse whose signed bulge is litSide * cos(elongation):
    // toward the lit limb for crescents, away from it for gibbous phases.
    const waxing = elong < 180;
    const bulge = ir * Math.cos(elong * DEG) * (waxing ? 1 : -1);
    const HALF = Math.PI / 2;
    ctx.fillStyle = '#e8e6da';
    ctx.beginPath();
    if (waxing) {
      // right limb, top → bottom; terminator returns bottom → top
      ctx.arc(ix, iy, ir, -HALF, HALF, false);
      if (bulge >= 0) ctx.ellipse(ix, iy, bulge, ir, 0, HALF, -HALF, true); // via right
      else ctx.ellipse(ix, iy, -bulge, ir, 0, HALF, 3 * HALF, false); // via left
    } else {
      // left limb, bottom → top; terminator returns top → bottom
      ctx.arc(ix, iy, ir, HALF, -HALF, false);
      if (bulge >= 0) ctx.ellipse(ix, iy, bulge, ir, 0, -HALF, HALF, false); // via right
      else ctx.ellipse(ix, iy, -bulge, ir, 0, -HALF, HALF, true); // via left
    }
    ctx.fill();
    ctx.strokeStyle = 'rgba(158,189,255,0.3)';
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(190,204,228,0.9)';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillText('FROM EARTH', ix, iy + ir + 20);

    // ---- readouts
    const age = (elong / 360) * SYNODIC_DAYS;
    const toFull = (((180 - elong + 360) % 360) / 360) * SYNODIC_DAYS;
    const toNew = (((360 - elong) % 360) / 360) * SYNODIC_DAYS;
    const tide =
      elong < 45 || elong > 315 || Math.abs(elong - 180) < 45
        ? 'spring tides (Sun + Moon aligned)'
        : 'neap tides (Sun and Moon at right angles)';
    const readout = `
      <div class="em-phase-name">${phaseName(elong)}</div>
      <div class="em-grid">
        <span>${fmtSimDate(d)}</span>
        <span>${Math.round(illum * 100)}% illuminated</span>
        <span>Moon age ${age.toFixed(1)} days</span>
        <span>Full moon in ${toFull.toFixed(1)} d · New in ${toNew.toFixed(1)} d</span>
        <span class="em-tide">Now favouring ${tide}</span>
      </div>
    `;
    // rebuilding this DOM 60x/s would churn layout for no reason
    if (readout !== this.lastReadout) {
      this.lastReadout = readout;
      this.readouts.innerHTML = readout;
    }
  }
}
