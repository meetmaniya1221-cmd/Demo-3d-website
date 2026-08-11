/** Modal overlays: size/distance comparison and the gravity lab. */
import { SUN, PLANETS, MOON, EARTH_GRAVITY, type BodyDef } from '../data/bodies';
import { sound } from '../audio';

function colorOf(def: BodyDef): string {
  return `#${def.color.toString(16).padStart(6, '0')}`;
}

export abstract class Overlay {
  protected root: HTMLElement;
  protected bodyEl: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private restoreFocus: HTMLElement | null = null;
  private hideTimer: number | undefined;

  constructor(parent: HTMLElement, title: string, titleId: string) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', titleId);
    this.root.innerHTML = `
      <div class="overlay-card">
        <div class="overlay-head">
          <div class="overlay-title" id="${titleId}">${title}</div>
          <div class="overlay-head-slot" style="display:flex;gap:10px;align-items:center"></div>
          <button class="icon-btn close" aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11"/></svg>
          </button>
        </div>
        <div class="overlay-body"></div>
      </div>
    `;
    this.bodyEl = this.root.querySelector('.overlay-body')!;
    this.closeBtn = this.root.querySelector('.close')!;
    this.closeBtn.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    // keep Tab cycling inside the dialog while it is open
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(
        this.root.querySelectorAll<HTMLElement>(
          'button, input, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  open(): void {
    window.clearTimeout(this.hideTimer);
    this.root.hidden = false;
    // next frame so the opacity transition runs
    requestAnimationFrame(() => this.root.classList.add('open'));
    this.restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.onOpen();
    this.closeBtn.focus();
  }

  close(): void {
    if (this.isOpen) sound.play('back', 0.3);
    this.root.classList.remove('open');
    this.hideTimer = window.setTimeout(() => {
      this.root.hidden = true;
    }, 320);
    this.restoreFocus?.focus();
    this.restoreFocus = null;
  }

  protected abstract onOpen(): void;
}

/* --------------------------------------------------------------- compare -- */

export class CompareOverlay extends Overlay {
  private tab: 'size' | 'distance' = 'size';
  private tabButtons: Record<string, HTMLButtonElement> = {};

  constructor(parent: HTMLElement) {
    super(parent, 'Compare the worlds', 'compare-title');
    const slot = this.root.querySelector('.overlay-head-slot')!;
    const tabs = document.createElement('div');
    tabs.className = 'overlay-tabs';
    for (const t of ['size', 'distance'] as const) {
      const b = document.createElement('button');
      b.textContent = t === 'size' ? 'Size' : 'Distance';
      b.addEventListener('click', () => {
        this.tab = t;
        this.render();
      });
      tabs.appendChild(b);
      this.tabButtons[t] = b;
    }
    slot.appendChild(tabs);
    window.addEventListener('resize', () => {
      if (this.isOpen) this.render();
    });
  }

  protected onOpen(): void {
    this.render();
  }

  private render(): void {
    this.tabButtons.size.classList.toggle('active', this.tab === 'size');
    this.tabButtons.distance.classList.toggle('active', this.tab === 'distance');
    this.bodyEl.innerHTML = '';
    if (this.tab === 'size') this.renderSize();
    else this.renderDistance();
  }

  private makeCanvas(
    cssW: number,
    cssH: number,
    ariaLabel: string,
  ): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas');
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', ariaLabel);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    return [c, ctx];
  }

  /** Visually-hidden data table so the canvas charts have a text alternative. */
  private appendDataTable(): void {
    const rows = [...PLANETS, MOON]
      .map(
        (b) =>
          `<tr><th scope="row">${b.name}</th><td>${Math.round(b.facts.diameterKm).toLocaleString()} km</td>` +
          `<td>${(b.facts.diameterKm / 12_756).toFixed(2)}× Earth</td>` +
          // the Moon's catalog distance is measured from EARTH, not the Sun
          `<td>${b.id === 'moon' ? '384,400 km from Earth' : `${b.facts.distanceAU.toFixed(2)} AU from the Sun`}</td></tr>`,
      )
      .join('');
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
    wrap.innerHTML = `<table><caption>Planet sizes and distances</caption><thead><tr><th>Body</th><th>Diameter</th><th>Relative to Earth</th><th>Distance</th></tr></thead><tbody>${rows}</tbody></table>`;
    this.bodyEl.appendChild(wrap);
  }

  private renderSize(): void {
    const note = document.createElement('p');
    note.className = 'overlay-note';
    note.innerHTML =
      'Every diameter below shares one scale. The Sun is so large that only its edge fits - ' +
      '<b>1.3 million Earths</b> would fit inside it. Numbers show each world’s diameter and how many Earths would span it.';
    this.bodyEl.appendChild(note);

    const bodies = [...PLANETS, MOON];
    const jupiterPx = 200;
    const pxPerKm = jupiterPx / 142_984;
    const H = 330;
    const gap = 26;
    // every body claims at least a label-wide column so names never collide
    const colW = (b: (typeof bodies)[number]) =>
      Math.max(b.facts.diameterKm * pxPerKm, 78);
    let width = 130 + gap; // sun sliver
    for (const b of bodies) width += colW(b) + gap;

    const wrap = document.createElement('div');
    wrap.className = 'scroll-x';
    const [canvas, ctx] = this.makeCanvas(
      Math.max(width, 720),
      H,
      'All planets and the Moon drawn to one diameter scale, next to the edge of the Sun',
    );
    wrap.appendChild(canvas);
    this.bodyEl.appendChild(wrap);

    // sun edge (its full disc would be ~2,340 px tall at this scale)
    const sunR = (SUN.facts.diameterKm / 2) * pxPerKm;
    const cy = H / 2 - 22;
    const g = ctx.createRadialGradient(-sunR + 96, cy, sunR * 0.96, -sunR + 96, cy, sunR * 1.012);
    g.addColorStop(0, '#f4b45c');
    g.addColorStop(0.85, '#ffd9a0');
    g.addColorStop(1, 'rgba(255,217,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(-sunR + 96, cy, sunR * 1.012, 0, Math.PI * 2);
    ctx.fill();
    // dark chip so the caption survives the bright slab
    ctx.fillStyle = 'rgba(5,8,15,0.72)';
    ctx.beginPath();
    ctx.roundRect(6, H - 58, 104, 50, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,246,255,0.95)';
    ctx.font = '600 10px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SUN (edge)', 12, H - 44);
    ctx.fillStyle = 'rgba(190,204,228,0.95)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('1,391,400 km', 12, H - 30);
    ctx.fillText('109 × Earth', 12, H - 16);

    let x = 130 + gap;
    const earthD = 12_756;
    for (const b of bodies) {
      const d = Math.max(b.facts.diameterKm * pxPerKm, 3);
      const col = colW(b);
      const cx = x + col / 2;
      const grad = ctx.createRadialGradient(cx - d * 0.2, cy - d * 0.2, d * 0.05, cx, cy, d / 2);
      grad.addColorStop(0, this.lighten(colorOf(b), 0.35));
      grad.addColorStop(1, colorOf(b));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(223,230,244,0.85)';
      ctx.font = '600 10px -apple-system, sans-serif';
      ctx.fillText(b.name.toUpperCase(), cx, H - 44);
      ctx.fillStyle = 'rgba(132,148,176,0.9)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(`${Math.round(b.facts.diameterKm).toLocaleString()} km`, cx, H - 30);
      const rel = b.facts.diameterKm / earthD;
      ctx.fillText(`${rel >= 1 ? rel.toFixed(1) : rel.toFixed(2)} × Earth`, cx, H - 16);
      x += col + gap;
    }

    const hint = document.createElement('p');
    hint.className = 'overlay-note';
    hint.style.marginTop = '10px';
    hint.textContent = 'Scroll → to reach the ice giants and the Moon';
    this.bodyEl.appendChild(hint);
    this.appendDataTable();
  }

  private renderDistance(): void {
    const note = document.createElement('p');
    note.className = 'overlay-note';
    note.innerHTML =
      'The Solar System is mostly <b>empty space</b>. Below, distance is to scale (sizes are not). ' +
      'Scroll right and watch how far apart the outer planets really are - sunlight itself needs ' +
      '<b>4 hours</b> to reach Neptune.';
    this.bodyEl.appendChild(note);

    const pxPerAU = 150;
    const W = Math.ceil(60 + 31.2 * pxPerAU);
    const H = 236;
    const wrap = document.createElement('div');
    wrap.className = 'scroll-x';
    const [canvas, ctx] = this.makeCanvas(
      W,
      H,
      'Planet distances from the Sun drawn to scale, with light travel times',
    );
    wrap.appendChild(canvas);
    this.bodyEl.appendChild(wrap);

    const y = H / 2 - 2;
    const x0 = 26;

    // habitable zone band + scattered asteroid belt
    ctx.fillStyle = 'rgba(56,217,150,0.08)';
    ctx.fillRect(x0 + 0.95 * pxPerAU, y - 34, (1.67 - 0.95) * pxPerAU, 68);
    let beltSeed = 12;
    const beltRnd = () => {
      beltSeed = (beltSeed * 16807) % 2147483647;
      return beltSeed / 2147483647;
    };
    ctx.fillStyle = 'rgba(184,165,142,0.55)';
    for (let i = 0; i < 130; i++) {
      const bx = x0 + (2.1 + beltRnd() * 1.2) * pxPerAU;
      const by = y + (beltRnd() - 0.5) * 56;
      ctx.fillRect(bx, by, 1.4, 1.4);
    }
    ctx.font = '600 9px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(56,217,150,0.7)';
    ctx.fillText('HABITABLE ZONE', x0 + 0.95 * pxPerAU, y + 76);
    ctx.fillStyle = 'rgba(184,165,142,0.8)';
    ctx.fillText('ASTEROID BELT', x0 + 2.35 * pxPerAU, y + 76);

    // baseline
    ctx.strokeStyle = 'rgba(158,189,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(W - 12, y);
    ctx.stroke();

    // AU ruler
    ctx.fillStyle = 'rgba(90,106,134,0.9)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let au = 0; au <= 31; au += 1) {
      const x = x0 + au * pxPerAU;
      ctx.fillRect(x, y - 3, 1, 6);
      if (au % 5 === 0) ctx.fillText(`${au} AU`, x, y + 22);
    }

    // sun
    const sunG = ctx.createRadialGradient(x0, y, 1, x0, y, 14);
    sunG.addColorStop(0, '#ffd9a0');
    sunG.addColorStop(1, 'rgba(255,196,107,0)');
    ctx.fillStyle = sunG;
    ctx.beginPath();
    ctx.arc(x0, y, 14, 0, Math.PI * 2);
    ctx.fill();

    let flip = false;
    for (const b of PLANETS) {
      const x = x0 + b.facts.distanceAU * pxPerAU;
      const r = Math.max(2.5, Math.min(7, (b.facts.diameterKm / 142_984) * 12 + 2));
      ctx.fillStyle = colorOf(b);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      const ly = flip ? y + 40 : y - 52;
      ctx.strokeStyle = 'rgba(158,189,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(x, flip ? y + r + 2 : y - r - 2);
      ctx.lineTo(x, flip ? ly - 12 : ly + 6);
      ctx.stroke();
      ctx.fillStyle = 'rgba(223,230,244,0.9)';
      ctx.font = '600 10px -apple-system, sans-serif';
      ctx.fillText(b.name.toUpperCase(), x, ly);
      ctx.fillStyle = 'rgba(132,148,176,0.9)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(`light: ${this.lightLabel(b.facts.distanceAU)}`, x, ly + 13);
      flip = !flip;
    }

    const hint = document.createElement('p');
    hint.className = 'overlay-note';
    hint.style.marginTop = '10px';
    hint.textContent = `Scroll → · 1 pixel ≈ ${Math.round(149_597_871 / pxPerAU).toLocaleString()} km`;
    this.bodyEl.appendChild(hint);
    this.appendDataTable();
  }

  private lightLabel(au: number): string {
    const min = (au * 149_597_870.7) / 299_792.458 / 60;
    if (min < 90) return `${min.toFixed(0)} min`;
    return `${(min / 60).toFixed(1)} h`;
  }

  private lighten(hexColor: string, amt: number): string {
    const n = parseInt(hexColor.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) + 255 * amt);
    const g = Math.min(255, ((n >> 8) & 255) + 255 * amt);
    const b = Math.min(255, (n & 255) + 255 * amt);
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
}

/* ---------------------------------------------------------------- gravity -- */

export class GravityOverlay extends Overlay {
  private massKg = 70;
  private grid!: HTMLElement;
  private valueEl!: HTMLElement;

  constructor(parent: HTMLElement) {
    super(parent, 'Gravity lab', 'gravity-title');
    this.bodyEl.innerHTML = `
      <p class="overlay-note">
        Your <b>mass</b> never changes - it is the amount of matter in you. Your <b>weight</b> is the
        pull of gravity on that mass, so it depends on which world you stand on. Set your Earth
        weight and see what a bathroom scale would read elsewhere - and how high the same jump
        would carry you.
      </p>
      <div class="gravity-controls">
        <span class="u-label">Your weight on Earth</span>
        <span class="u-label" style="opacity:0.7">20</span>
        <input type="range" min="20" max="150" step="1" value="70" aria-label="Your weight on Earth in kilograms" />
        <span class="u-label" style="opacity:0.7">150 kg</span>
        <span class="value">70 kg</span>
      </div>
      <div class="gravity-grid"></div>
      <p class="overlay-note" style="margin-top:14px;margin-bottom:0">
        Bars show each world's surface gravity relative to Earth (the Sun's is off the
        scale - its gravity is 28× ours, which is why you could not stand there).
      </p>
    `;
    this.grid = this.bodyEl.querySelector('.gravity-grid')!;
    this.valueEl = this.bodyEl.querySelector('.value')!;
    const slider = this.bodyEl.querySelector('input')!;
    slider.addEventListener('input', () => {
      this.massKg = Number(slider.value);
      this.valueEl.textContent = `${this.massKg} kg`;
      this.renderCards();
    });
  }

  protected onOpen(): void {
    this.renderCards();
  }

  private renderCards(): void {
    const bodies = [SUN, ...PLANETS, MOON];
    this.grid.innerHTML = bodies
      .map((b) => {
        const w = (this.massKg * b.facts.gravity) / EARTH_GRAVITY;
        const jump = 50 * (EARTH_GRAVITY / b.facts.gravity); // cm, from a 50 cm Earth jump
        const bar = Math.min(1, b.facts.gravity / 25);
        const offScale = b.facts.gravity > 25;
        const weightLabel = w >= 200 ? `${Math.round(w).toLocaleString()} kg` : `${w.toFixed(1)} kg`;
        const jumpLabel =
          b.id === 'sun'
            ? 'You could not stand here'
            : jump >= 100
              ? `Jump ${(jump / 100).toFixed(1)} m high`
              : `Jump ${Math.round(jump)} cm high`;
        return `
          <div class="gravity-card">
            <div class="name"><i style="background:${colorOf(b)}"></i>${b.name}</div>
            <div class="weight">${weightLabel}</div>
            <div class="jump">${jumpLabel}</div>
            <div class="bar${offScale ? ' over' : ''}"><i style="width:${(bar * 100).toFixed(0)}%"></i></div>
          </div>
        `;
      })
      .join('');
  }
}
