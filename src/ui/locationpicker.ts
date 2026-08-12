/**
 * Observing-site picker: a world map you can click anywhere on, a searchable
 * list of cities, and degree/minute steppers - the classic planetarium
 * "where are you standing?" dialog, in the app's HUD language.
 *
 * Coastlines are real (Natural Earth 110m); city coordinates come from
 * GeoNames. Nothing here changes the sky maths - it only chooses the
 * latitude/longitude the night-sky view is computed for.
 */
import { CITIES, LAND_RINGS, countryName, type CityPreset } from '../data/catalog/worldmap';
import { sound } from '../audio';

export interface SiteChoice {
  lat: number;
  lon: number;
  /** Empty for a free-hand position. */
  name: string;
}

/** Nearest preset city within ~120 km, else null. */
export function nearestCity(lat: number, lon: number): CityPreset | null {
  let best: CityPreset | null = null;
  let bestD = 1.1; // degrees, great-circle-ish
  for (const c of CITIES) {
    const dx = (c.lon - lon) * Math.cos((lat * Math.PI) / 180);
    const d = Math.hypot(c.lat - lat, dx);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Signed degrees → whole degrees + minutes, carrying 60′ into a degree so
 *  the readout and the steppers can never disagree by a degree. */
export function toDegMin(v: number): { deg: number; min: number; sign: number } {
  const a = Math.abs(v);
  let deg = Math.floor(a);
  let min = Math.round((a - deg) * 60);
  if (min === 60) {
    deg += 1;
    min = 0;
  }
  return { deg, min, sign: v < 0 ? -1 : 1 };
}

export function fmtLat(lat: number): string {
  const { deg, min } = toDegMin(lat);
  return `${deg}° ${String(min).padStart(2, '0')}′ ${lat >= 0 ? 'N' : 'S'}`;
}

export function fmtLon(lon: number): string {
  const { deg, min } = toDegMin(lon);
  return `${deg}° ${String(min).padStart(2, '0')}′ ${lon >= 0 ? 'E' : 'W'}`;
}

export class LocationPicker {
  private root: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private listEl!: HTMLElement;
  private filterEl!: HTMLInputElement;
  private siteEl!: HTMLElement;
  private lat = 0;
  private lon = 0;
  private name = '';
  private onApply: ((site: SiteChoice) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private restoreFocus: HTMLElement | null = null;
  private dragging = false;
  private raf = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'locpicker';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Choose your observing location');
    this.root.innerHTML = `
      <div class="locpicker-card">
        <div class="locpicker-cols">
          <div class="locpicker-list-col">
            <button class="loc-geo" data-sfx="none">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="2.4"/><circle cx="7" cy="7" r="5.6"/><path d="M7 0v2.4M7 11.6V14M0 7h2.4M11.6 7H14"/></svg>
              Find my location
            </button>
            <input class="loc-filter" type="search" placeholder="Filter places…" aria-label="Filter the place list" autocomplete="off" spellcheck="false" />
            <div class="loc-list" role="listbox" aria-label="Places"></div>
          </div>
          <div class="locpicker-map-col">
            <canvas class="loc-map" tabindex="0" aria-label="World map - click or drag to choose a position"></canvas>
            <div class="loc-site"></div>
            <div class="locpicker-controls">
              <div class="loc-steppers">
                <div class="loc-stepper-row" data-axis="lat">
                  <button class="loc-arrow" data-act="hemi-prev" aria-label="Toggle north or south">◀</button>
                  <span class="loc-hemi" data-field="hemi">NORTH</span>
                  <button class="loc-arrow" data-act="hemi-next" aria-label="Toggle north or south">▶</button>
                  <button class="loc-arrow" data-act="deg-dn" aria-label="Latitude degrees down">◀</button>
                  <span class="loc-num" data-field="deg">00°</span>
                  <button class="loc-arrow" data-act="deg-up" aria-label="Latitude degrees up">▶</button>
                  <button class="loc-arrow" data-act="min-dn" aria-label="Latitude minutes down">◀</button>
                  <span class="loc-num" data-field="min">00′</span>
                  <button class="loc-arrow" data-act="min-up" aria-label="Latitude minutes up">▶</button>
                </div>
                <div class="loc-stepper-row" data-axis="lon">
                  <button class="loc-arrow" data-act="hemi-prev" aria-label="Toggle east or west">◀</button>
                  <span class="loc-hemi" data-field="hemi">EAST</span>
                  <button class="loc-arrow" data-act="hemi-next" aria-label="Toggle east or west">▶</button>
                  <button class="loc-arrow" data-act="deg-dn" aria-label="Longitude degrees down">◀</button>
                  <span class="loc-num" data-field="deg">00°</span>
                  <button class="loc-arrow" data-act="deg-up" aria-label="Longitude degrees up">▶</button>
                  <button class="loc-arrow" data-act="min-dn" aria-label="Longitude minutes down">◀</button>
                  <span class="loc-num" data-field="min">00′</span>
                  <button class="loc-arrow" data-act="min-up" aria-label="Longitude minutes up">▶</button>
                </div>
              </div>
              <div class="loc-actions">
                <button class="loc-ok" data-sfx="select">OK</button>
                <button class="loc-cancel" data-sfx="none">Cancel</button>
              </div>
            </div>
            <p class="fine-print loc-credit">Coastlines <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> (public domain) · place coordinates <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0). Your device location, if used, stays in this page.</p>
          </div>
        </div>
      </div>
    `;
    parent.appendChild(this.root);
    this.canvas = this.root.querySelector('.loc-map')!;
    this.listEl = this.root.querySelector('.loc-list')!;
    this.filterEl = this.root.querySelector('.loc-filter')!;
    this.siteEl = this.root.querySelector('.loc-site')!;

    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close(true);
    });
    // keep Tab cycling inside the dialog while it is open
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusables = Array.from(
        this.root.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
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
    this.root.querySelector('.loc-cancel')!.addEventListener('click', () => this.close(true));
    this.root.querySelector('.loc-ok')!.addEventListener('click', () => this.apply());
    this.root.querySelector('.loc-geo')!.addEventListener('click', () => this.useDeviceLocation());
    this.filterEl.addEventListener('input', () => this.renderList());

    // map interaction: click or drag anywhere on Earth
    const setFromEvent = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const fx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const fy = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      this.setSite(90 - fy * 180, fx * 360 - 180, '');
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      setFromEvent(e);
      sound.play('click', 0.14);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) setFromEvent(e);
    });
    const stop = () => (this.dragging = false);
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    this.canvas.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowUp') this.setSite(this.lat + step, this.lon, '');
      else if (e.key === 'ArrowDown') this.setSite(this.lat - step, this.lon, '');
      else if (e.key === 'ArrowLeft') this.setSite(this.lat, this.lon - step, '');
      else if (e.key === 'ArrowRight') this.setSite(this.lat, this.lon + step, '');
      else return;
      e.preventDefault();
    });

    // degree / minute steppers
    for (const row of Array.from(this.root.querySelectorAll<HTMLElement>('.loc-stepper-row'))) {
      const isLat = row.dataset.axis === 'lat';
      row.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
        if (!btn) return;
        const v0 = isLat ? this.lat : this.lon;
        const act = btn.dataset.act!;
        let v: number;
        if (act === 'hemi-prev' || act === 'hemi-next') {
          v = -v0;
        } else {
          // work in whole degrees + minutes so the display and the value stay
          // in lockstep, and clamp at zero instead of flipping hemisphere
          const { deg, min, sign } = toDegMin(v0);
          let total = deg * 60 + min;
          if (act === 'deg-up') total += 60;
          else if (act === 'deg-dn') total -= 60;
          else if (act === 'min-up') total += 1;
          else if (act === 'min-dn') total -= 1;
          const limit = (isLat ? 90 : 180) * 60;
          total = Math.max(0, Math.min(limit, total));
          v = (sign * total) / 60;
        }
        if (isLat) this.setSite(v, this.lon, '');
        else this.setSite(this.lat, v, '');
      });
    }

    window.addEventListener('resize', () => {
      if (!this.root.hidden) this.draw();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(current: SiteChoice, onApply: (site: SiteChoice) => void): void {
    this.onApply = onApply;
    this.lat = current.lat;
    this.lon = current.lon;
    this.name = current.name;
    this.restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add('open'));
    this.filterEl.value = '';
    this.renderList();
    this.syncFields();
    this.draw();
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      this.close(true);
    };
    window.addEventListener('keydown', this.keyHandler, { capture: true });
    this.root.querySelector<HTMLButtonElement>('.loc-ok')?.focus();
  }

  close(withSound: boolean): void {
    if (this.root.hidden) return;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler, { capture: true });
      this.keyHandler = null;
    }
    cancelAnimationFrame(this.raf);
    this.root.classList.remove('open');
    this.root.hidden = true;
    this.onApply = null;
    if (withSound) sound.play('back', 0.3);
    this.restoreFocus?.focus();
    this.restoreFocus = null;
  }

  private apply(): void {
    const site: SiteChoice = { lat: this.lat, lon: this.lon, name: this.name };
    const cb = this.onApply;
    this.close(false);
    cb?.(site);
  }

  private setSite(lat: number, lon: number, name: string): void {
    this.lat = Math.max(-90, Math.min(90, lat));
    // longitude wraps the globe; the +180 edge stays +180 so dragging to the
    // right edge of the map does not snap the crosshair to the left one
    const wrapped = ((lon + 180) % 360 + 360) % 360 - 180;
    this.lon = wrapped === -180 && lon > 0 ? 180 : wrapped;
    // only an explicit pick carries a place name; anything else is a free
    // position that the readout describes as "near <city>"
    this.name = name;
    this.syncFields();
    this.draw();
  }

  private syncFields(): void {
    const rows = Array.from(this.root.querySelectorAll<HTMLElement>('.loc-stepper-row'));
    for (const row of rows) {
      const isLat = row.dataset.axis === 'lat';
      const v = isLat ? this.lat : this.lon;
      const { deg, min } = toDegMin(v);
      row.querySelector('[data-field=hemi]')!.textContent = isLat
        ? v >= 0 ? 'NORTH' : 'SOUTH'
        : v >= 0 ? 'EAST' : 'WEST';
      row.querySelector('[data-field=deg]')!.textContent = `${String(deg).padStart(2, '0')}°`;
      row.querySelector('[data-field=min]')!.textContent = `${String(min).padStart(2, '0')}′`;
    }
    const near = nearestCity(this.lat, this.lon);
    const label = this.name || (near ? `near ${near.name}` : 'Open position');
    this.siteEl.innerHTML = `<b>${label}</b><span>${fmtLat(this.lat)} · ${fmtLon(this.lon)}</span>`;
    for (const row of Array.from(this.listEl.querySelectorAll<HTMLElement>('.loc-row'))) {
      const on = row.dataset.name === this.name && !!this.name;
      row.classList.toggle('active', on);
      row.setAttribute('aria-selected', String(on));
    }
  }

  private renderList(): void {
    const q = this.filterEl.value.trim().toLowerCase();
    const rows = CITIES.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || countryName(c.cc).toLowerCase().includes(q),
    );
    this.listEl.innerHTML = rows.length
      ? rows
          .map(
            (c) =>
              `<button class="loc-row" role="option" aria-selected="false" data-name="${c.name}" data-sfx="none"><span>${c.name}</span><small>${countryName(c.cc)}</small></button>`,
          )
          .join('')
      : '<div class="loc-empty">No place matches that.</div>';
    for (const el of Array.from(this.listEl.querySelectorAll<HTMLButtonElement>('.loc-row'))) {
      el.addEventListener('click', () => {
        const c = CITIES.find((x) => x.name === el.dataset.name);
        if (!c) return;
        sound.play('click', 0.18);
        this.setSite(c.lat, c.lon, c.name);
      });
    }
    this.syncFields();
  }

  private useDeviceLocation(): void {
    const btn = this.root.querySelector<HTMLButtonElement>('.loc-geo')!;
    if (!navigator.geolocation) {
      btn.classList.add('failed');
      btn.lastChild!.textContent = ' Location unavailable';
      return;
    }
    sound.play('click', 0.18);
    btn.classList.add('busy');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        btn.classList.remove('busy');
        this.setSite(p.coords.latitude, p.coords.longitude, '');
        sound.play('select', 0.35);
      },
      () => {
        btn.classList.remove('busy');
        btn.classList.add('failed');
        btn.lastChild!.textContent = ' Location denied';
      },
      { timeout: 8000, maximumAge: 600000 },
    );
  }

  /* ------------------------------------------------------------- map --- */

  private draw(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.paint());
  }

  private paint(): void {
    const canvas = this.canvas;
    const wrap = canvas.parentElement!;
    const cssW = Math.max(240, Math.min(620, wrap.clientWidth || 520));
    const cssH = Math.round(cssW / 2);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssW * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const X = (lon: number) => ((lon + 180) / 360) * cssW;
    const Y = (lat: number) => ((90 - lat) / 180) * cssH;

    // ocean
    const bg = ctx.createLinearGradient(0, 0, 0, cssH);
    bg.addColorStop(0, 'rgba(10,26,44,0.95)');
    bg.addColorStop(1, 'rgba(6,16,30,0.95)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    // graticule
    ctx.strokeStyle = 'rgba(102,224,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let lon = -150; lon <= 150; lon += 30) {
      ctx.moveTo(X(lon), 0);
      ctx.lineTo(X(lon), cssH);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.moveTo(0, Y(lat));
      ctx.lineTo(cssW, Y(lat));
    }
    ctx.stroke();

    // land
    ctx.fillStyle = 'rgba(116,196,255,0.55)';
    ctx.strokeStyle = 'rgba(168,226,255,0.75)';
    ctx.lineWidth = 0.7;
    for (const ring of LAND_RINGS) {
      ctx.beginPath();
      ctx.moveTo(X(ring[0]), Y(ring[1]));
      for (let i = 2; i < ring.length; i += 2) ctx.lineTo(X(ring[i]), Y(ring[i + 1]));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // preset cities
    ctx.fillStyle = 'rgba(255,196,107,0.65)';
    for (const c of CITIES) {
      ctx.fillRect(X(c.lon) - 0.9, Y(c.lat) - 0.9, 1.8, 1.8);
    }

    // crosshair on the chosen site
    const cx = X(this.lon);
    const cy = Y(this.lat);
    ctx.strokeStyle = 'rgba(240,250,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(cssW, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, cssH);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = 'rgba(102,224,255,0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}
