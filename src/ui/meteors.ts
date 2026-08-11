/**
 * Meteor lab: an interactive, terminology-correct walkthrough of
 * meteoroid → meteor → meteorite, with an animated atmospheric entry.
 *
 * The animation is a side view of Earth's upper atmosphere with real altitude
 * bands. Pick a size class and watch what actually happens to it - most
 * incoming rock never reaches the ground.
 */
import { Overlay } from './overlays';

export interface MeteorsHost {
  selectObject: (id: string) => void;
}

interface SizeClass {
  id: string;
  label: string;
  sub: string;
  /** where the visible meteor phase starts/ends, km */
  glowStartKm: number;
  glowEndKm: number;
  outcome: 'burnup' | 'meteorite' | 'airburst';
  outcomeTitle: string;
  outcomeText: string;
  speedNote: string;
  trailWidth: number;
}

const SIZES: SizeClass[] = [
  {
    id: 'grain',
    label: 'Sand grain (~1 mm)',
    sub: 'The most common visitor - millions hit every day',
    glowStartKm: 100,
    glowEndKm: 80,
    outcome: 'burnup',
    outcomeTitle: 'Fully vaporised at ~80 km',
    outcomeText:
      'Friction with air molecules heats the grain until it vaporises completely. The streak of light you see - a "shooting star" - is mostly glowing air (plasma), not the rock itself. Nothing reaches the ground.',
    speedNote: 'Entry speed: 11–72 km/s. At these speeds even a sand grain outshines the stars.',
    trailWidth: 2,
  },
  {
    id: 'pebble',
    label: 'Pebble (~1 cm)',
    sub: 'A bright meteor - a fireball if you are lucky',
    glowStartKm: 105,
    glowEndKm: 60,
    outcome: 'burnup',
    outcomeTitle: 'A brilliant fireball, gone by ~60 km',
    outcomeText:
      'A centimetre of rock makes a fireball bright enough to cast shadows, sometimes with a glowing train that lasts minutes. It still almost always vaporises completely high above the ground.',
    speedNote: 'Meteors this bright are called fireballs (brighter than Venus).',
    trailWidth: 4,
  },
  {
    id: 'boulder',
    label: 'Boulder (~1 m)',
    sub: 'Survivors reach the ground as meteorites',
    glowStartKm: 110,
    glowEndKm: 25,
    outcome: 'meteorite',
    outcomeTitle: 'Fragments land: now they are meteorites',
    outcomeText:
      'The outside ablates away, but the air also brakes the rock hard - below ~20 km it slows to free-fall and stops glowing (this is called dark flight). Surviving pieces hit the ground at merely terminal velocity. Only once a fragment lands is it called a meteorite - and its inside is not even hot.',
    speedNote: 'A ~1 m rock arrives somewhere on Earth every couple of weeks.',
    trailWidth: 6,
  },
  {
    id: 'house',
    label: 'House-sized (~20 m)',
    sub: 'Chelyabinsk, 2013 - an airburst',
    glowStartKm: 95,
    glowEndKm: 30,
    outcome: 'airburst',
    outcomeTitle: 'Airburst: the shockwave does the damage',
    outcomeText:
      'A rock this size rams the air so hard it shatters explosively kilometres above the ground - an airburst. The 2013 Chelyabinsk meteor (~20 m) released ~30 Hiroshimas of energy at ~30 km altitude; the shockwave broke thousands of windows. Small meteorites still rained down afterwards.',
    speedNote: 'Events like this happen once every few decades, usually over ocean.',
    trailWidth: 9,
  },
];

const TERMS = [
  {
    name: 'Meteoroid',
    where: 'In space',
    text: 'A piece of rock or metal travelling through space - from dust grains up to about a metre. Most are shed by asteroids or comets.',
  },
  {
    name: 'Meteor',
    where: 'In the atmosphere',
    text: 'The streak of light produced when a meteoroid enters the atmosphere at 11–72 km/s. The glow is superheated air and vaporising rock, typically 75–120 km up. It is an event, not an object.',
  },
  {
    name: 'Meteorite',
    where: 'On the ground',
    text: 'A fragment that survives the fiery passage and lands. About 500 reach Earth’s surface each year; most fall unseen into the ocean.',
  },
];

export class MeteorsOverlay extends Overlay {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private size: SizeClass = SIZES[0];
  private anim = 0;
  private t = 0;
  private lastTs = 0;
  private outcomeEl!: HTMLElement;
  private sizeButtons = new Map<string, HTMLButtonElement>();
  private host: MeteorsHost;
  private running = false;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(parent: HTMLElement, host: MeteorsHost) {
    super(parent, 'Meteor lab', 'meteors-title');
    this.host = host;
  }

  protected onOpen(): void {
    this.build();
    this.play(this.size);
  }

  close(): void {
    this.running = false;
    cancelAnimationFrame(this.anim);
    super.close();
  }

  private build(): void {
    this.bodyEl.innerHTML = `
      <p class="overlay-note">
        Same rock, three names, depending on where it is:
        <b>meteoroid</b> in space → <b>meteor</b> while it burns through the sky →
        <b>meteorite</b> if anything reaches the ground. Pick a size and watch its fate.
      </p>
      <div class="term-grid">
        ${TERMS.map(
          (t) => `
          <div class="term-card">
            <div class="term-where">${t.where}</div>
            <div class="term-name">${t.name}</div>
            <p>${t.text}</p>
          </div>`,
        ).join('')}
      </div>
      <div class="meteor-controls chip-row" role="group" aria-label="Meteoroid size"></div>
      <div class="meteor-stage">
        <canvas aria-label="Animation of a meteoroid entering Earth's atmosphere"></canvas>
        <div class="meteor-outcome"></div>
      </div>
      <p class="overlay-note" style="margin-top:12px">
        <b>Meteor showers</b> happen when Earth crosses the debris stream of a comet: the
        Perseids every August are dust from comet
        <button class="link-btn" data-go="swifttuttle">109P/Swift-Tuttle</button>, the Leonids from
        <button class="link-btn" data-go="tempeltuttle">55P/Tempel-Tuttle</button>, and the Orionids
        from <button class="link-btn" data-go="halley">1P/Halley</button> itself.
      </p>
    `;
    const controls = this.bodyEl.querySelector('.meteor-controls')!;
    this.sizeButtons.clear();
    for (const s of SIZES) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.innerHTML = `${s.label}<small>${s.sub}</small>`;
      b.addEventListener('click', () => this.play(s));
      controls.appendChild(b);
      this.sizeButtons.set(s.id, b);
    }
    this.bodyEl.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        this.close();
        this.host.selectObject(b.dataset.go!);
      }),
    );
    this.canvas = this.bodyEl.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.outcomeEl = this.bodyEl.querySelector('.meteor-outcome')!;
  }

  private play(size: SizeClass): void {
    this.size = size;
    for (const [id, b] of this.sizeButtons) b.classList.toggle('active', id === size.id);
    this.outcomeEl.classList.remove('show');
    this.t = 0;
    this.lastTs = 0;
    this.running = true;
    cancelAnimationFrame(this.anim);
    const step = (ts: number) => {
      if (!this.running) return;
      if (this.lastTs) this.t += Math.min(0.09, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      this.draw();
      if (this.t < 6.5) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
  }

  /** altitude (km) → canvas y; 130 km at top, ground at bottom */
  private yOf(km: number, h: number): number {
    return h * (1 - Math.max(0, km) / 130) * 0.92 + h * 0.02;
  }

  private draw(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = this.canvas.clientWidth || 640;
    const cssH = this.canvas.clientHeight || 340;
    if (this.canvas.width !== Math.round(cssW * dpr)) {
      this.canvas.width = Math.round(cssW * dpr);
      this.canvas.height = Math.round(cssH * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cssW;
    const h = cssH;

    // --- backdrop: space → atmosphere gradient with altitude bands
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#04060d');
    sky.addColorStop(0.45, '#0a1226');
    sky.addColorStop(0.8, '#16294d');
    sky.addColorStop(1, '#274777');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // stars up high
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 97.3) % w);
      const sy = ((i * 53.7) % (h * 0.35));
      ctx.fillStyle = `rgba(230,240,255,${0.25 + (i % 5) * 0.12})`;
      ctx.fillRect(sx, sy, 1.2, 1.2);
    }

    // ground
    const groundY = h * 0.94;
    ctx.fillStyle = '#1c3322';
    ctx.fillRect(0, groundY, w, h - groundY);

    // altitude rulers
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    for (const km of [120, 100, 80, 60, 40, 20]) {
      const y = this.yOf(km, h);
      ctx.strokeStyle = 'rgba(158,189,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(158,189,255,0.45)';
      ctx.fillText(`${km} km`, 8, y - 3);
    }
    ctx.fillStyle = 'rgba(120,220,160,0.5)';
    ctx.fillText('ground', 8, groundY - 4);
    // the "meteors glow here" band
    ctx.fillStyle = 'rgba(255,180,90,0.05)';
    const bandTop = this.yOf(120, h);
    ctx.fillRect(0, bandTop, w, this.yOf(75, h) - bandTop);
    ctx.fillStyle = 'rgba(255,190,110,0.5)';
    ctx.textAlign = 'right';
    ctx.fillText('meteors glow here (75–120 km)', w - 10, this.yOf(118, h) + 10);

    // --- trajectory: straight entry from upper-right toward lower-left
    const s = this.size;
    const entry = { x: w * 0.98, km: 128 };
    const exitKm = s.outcome === 'meteorite' ? 0 : s.glowEndKm;
    const exit = { x: w * (s.outcome === 'meteorite' ? 0.18 : 0.3), km: exitKm };
    // progress through altitude: fast at first (hypersonic), decelerating
    const dur = 3.4;
    const p = Math.min(1, this.t / dur);
    const ease = s.outcome === 'meteorite' ? 1 - Math.pow(1 - p, 1.7) : p;
    const km = entry.km + (exit.km - entry.km) * ease;
    const x = entry.x + (exit.x - entry.x) * ease;
    const y = this.yOf(km, h);

    const glowing = km <= s.glowStartKm && km >= s.glowEndKm && p < 1;
    const burstNow = s.outcome === 'airburst' && km <= s.glowEndKm;

    // trail
    if (km < s.glowStartKm) {
      const trailStartEase = (s.glowStartKm - entry.km) / (exit.km - entry.km);
      const tx = entry.x + (exit.x - entry.x) * trailStartEase;
      const ty = this.yOf(s.glowStartKm, h);
      const endX = burstNow || !glowing ? entry.x + (exit.x - entry.x) * ((s.glowEndKm - entry.km) / (exit.km - entry.km)) : x;
      const endY = burstNow || !glowing ? this.yOf(s.glowEndKm, h) : y;
      const grad = ctx.createLinearGradient(tx, ty, endX, endY);
      grad.addColorStop(0, 'rgba(255,150,60,0)');
      grad.addColorStop(0.7, `rgba(255,190,90,${glowing ? 0.5 : 0.25})`);
      grad.addColorStop(1, `rgba(255,240,200,${glowing ? 0.95 : 0.3})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = s.trailWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }

    // the object itself
    if (p < 1 && !burstNow) {
      ctx.fillStyle = glowing ? '#fff6e0' : '#b9b3aa';
      ctx.beginPath();
      ctx.arc(x, y, glowing ? s.trailWidth * 0.9 + 1.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (glowing) {
        const halo = ctx.createRadialGradient(x, y, 1, x, y, s.trailWidth * 4);
        halo.addColorStop(0, 'rgba(255,220,150,0.8)');
        halo.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, s.trailWidth * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // airburst flash + fragments
    if (burstNow) {
      const bx = entry.x + (exit.x - entry.x) * ((s.glowEndKm - entry.km) / (exit.km - entry.km));
      const by = this.yOf(s.glowEndKm, h);
      const since = Math.max(0, this.t - dur * ((s.glowEndKm - entry.km) / (exit.km - entry.km)));
      const flash = Math.max(0, 1 - since * 1.2);
      if (flash > 0) {
        const fg = ctx.createRadialGradient(bx, by, 2, bx, by, 60 * (1 + since * 2));
        fg.addColorStop(0, `rgba(255,250,230,${flash})`);
        fg.addColorStop(0.4, `rgba(255,200,110,${flash * 0.6})`);
        fg.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(bx, by, 60 * (1 + since * 2), 0, Math.PI * 2);
        ctx.fill();
      }
      // small surviving fragments drift down
      for (let i = 0; i < 5; i++) {
        const fx = bx - 12 + i * 7 + Math.sin(i * 3.1) * 6;
        const fy = by + since * (30 + i * 12);
        if (fy < groundY) {
          ctx.fillStyle = 'rgba(200,190,175,0.8)';
          ctx.fillRect(fx, fy, 2, 2);
        } else {
          ctx.fillStyle = 'rgba(230,220,200,0.9)';
          ctx.fillRect(fx, groundY - 2, 2, 2);
        }
      }
    }

    // meteorite landing: dark flight + ground marker
    if (s.outcome === 'meteorite' && km < s.glowEndKm && p < 1) {
      ctx.fillStyle = '#8f8a82';
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(158,189,255,0.55)';
      ctx.textAlign = 'left';
      ctx.fillText('dark flight - no longer glowing', x + 10, y);
    }
    if (s.outcome === 'meteorite' && p >= 1) {
      ctx.fillStyle = '#d9d2c4';
      ctx.beginPath();
      ctx.arc(exit.x, groundY - 2, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,220,160,0.8)';
      ctx.textAlign = 'left';
      ctx.font = '600 11px -apple-system, sans-serif';
      ctx.fillText('meteorite', exit.x + 9, groundY - 6);
    }

    // phase caption
    ctx.textAlign = 'center';
    ctx.font = '600 12px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(240,246,255,0.9)';
    const phase =
      km > s.glowStartKm
        ? 'METEOROID - a rock coasting through space'
        : glowing || burstNow
          ? 'METEOR - the glow of superheated air, 75–120 km up'
          : s.outcome === 'meteorite'
            ? p >= 1
              ? 'METEORITE - it reached the ground'
              : 'Dark flight - braked to free-fall'
            : 'Vaporised - nothing reaches the ground';
    ctx.fillText(phase, w / 2, 22);

    if (p >= 1 || (this.reduced && this.t > 0.1)) {
      this.outcomeEl.innerHTML = `<b>${s.outcomeTitle}</b>${s.outcomeText}<small>${s.speedNote}</small>`;
      this.outcomeEl.classList.add('show');
    }
  }
}
