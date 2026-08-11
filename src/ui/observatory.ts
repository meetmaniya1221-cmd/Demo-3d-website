/**
 * The Observatory: three sky instruments in one overlay.
 *
 *  NIGHT SKY - a live planetarium: the sky above a horizon for a chosen
 *    latitude/longitude at the current simulation time. Stars and figures
 *    come from the same catalog as the 3D scene; the Sun, Moon and planets
 *    are computed from the same Kepler elements driving the scene, so the
 *    chart always agrees with the orrery. Accuracy ~1-2°: real charts use
 *    full ephemerides, this is honest instrument-grade approximation.
 *
 *  NEAR STARS - the stellar neighbourhood on a log-distance map, from
 *    Proxima Centauri out to Deneb, with real Hipparcos/Gaia distances.
 *
 *  DEEP SKY - Messier highlights + the galactic centre, from the NASA/ESA
 *    Hubble Messier Catalog.
 */
import { PLANETS, keplerPosition } from '../data/bodies';
import { STARS, FIGURES } from '../scene/constellations';
import { NEAR_STARS, STAR_SOURCES, type NearStar } from '../data/catalog/stars';
import { DEEP_SKY, DEEP_SKY_SOURCES, type DeepSkyObject } from '../data/catalog/deepsky';
import type { AppState } from '../sim/state';
import { fmtSimDate, fmtSimTime } from './format';
import { Overlay } from './overlays';

const DEG = Math.PI / 180;
const OBLIQUITY = 23.4368 * DEG;
const EARTH_ORBIT = PLANETS.find((p) => p.id === 'earth')!.orbit!;

/** Greenwich mean sidereal time in degrees for a J2000 day count. */
function gmstDeg(d: number): number {
  return ((280.46061837 + 360.98564736629 * d) % 360 + 360) % 360;
}

/** Ecliptic unit/AU vector → equatorial (x to equinox, z to celestial pole). */
function eclToEq(x: number, y: number, z: number): [number, number, number] {
  return [
    x,
    y * Math.cos(OBLIQUITY) - z * Math.sin(OBLIQUITY),
    y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY),
  ];
}

function raDecOf(x: number, y: number, z: number): { raDeg: number; decDeg: number } {
  const r = Math.hypot(x, y, z) || 1;
  return {
    raDeg: ((Math.atan2(y, x) / DEG) % 360 + 360) % 360,
    decDeg: Math.asin(z / r) / DEG,
  };
}

/** Alt-az for an equatorial direction at latitude/LST (all degrees). */
function altAz(raDeg: number, decDeg: number, latDeg: number, lstDeg: number): { alt: number; az: number } {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const lat = latDeg * DEG;
  const lst = lstDeg * DEG;
  const vx = Math.cos(dec) * Math.cos(ra);
  const vy = Math.cos(dec) * Math.sin(ra);
  const vz = Math.sin(dec);
  const zen = [Math.cos(lat) * Math.cos(lst), Math.cos(lat) * Math.sin(lst), Math.sin(lat)];
  const north = [-Math.sin(lat) * Math.cos(lst), -Math.sin(lat) * Math.sin(lst), Math.cos(lat)];
  const east = [-Math.sin(lst), Math.cos(lst), 0];
  const dot = (a: number[], bx: number, by: number, bz: number) => a[0] * bx + a[1] * by + a[2] * bz;
  const alt = Math.asin(dot(zen, vx, vy, vz)) / DEG;
  const az = ((Math.atan2(dot(east, vx, vy, vz), dot(north, vx, vy, vz)) / DEG) % 360 + 360) % 360;
  return { alt, az };
}

function fmtLy(ly: number): string {
  if (ly < 1000) return `${ly % 1 === 0 ? ly : ly.toFixed(ly < 30 ? 2 : 0)} ly`;
  if (ly < 1e6) return `${Math.round(ly).toLocaleString('en-US')} ly`;
  return `${(ly / 1e6).toFixed(2)} million ly`;
}

function spectralColor(spectral: string): string {
  const c = spectral[0]?.toUpperCase();
  if (c === 'O' || c === 'B') return '#9db8ff';
  if (c === 'A') return '#cdd9ff';
  if (c === 'F' || c === 'D') return '#f2f4f8';
  if (c === 'G') return '#ffe9b0';
  if (c === 'K') return '#ffc37a';
  return '#ff9d66'; // M
}

const DSO_COLORS: Record<string, string> = {
  'spiral galaxy': '#9fb6ff',
  'elliptical galaxy': '#c9c2ff',
  'emission nebula': '#ff9db4',
  'planetary nebula': '#7fe0d4',
  'supernova remnant': '#ffb37a',
  'open cluster': '#bfe1ff',
  'globular cluster': '#ffe6a8',
  'galactic centre': '#ffd166',
};

const PLANET_CHART: Array<{ id: string; label: string; color: string }> = [
  { id: 'mercury', label: 'Mercury', color: '#b5a99a' },
  { id: 'venus', label: 'Venus', color: '#e6c689' },
  { id: 'mars', label: 'Mars', color: '#d88a5e' },
  { id: 'jupiter', label: 'Jupiter', color: '#c9a67c' },
  { id: 'saturn', label: 'Saturn', color: '#e3ce9e' },
];

export class Observatory extends Overlay {
  private state: AppState;
  private tab: 'night' | 'stars' | 'deep' = 'night';
  private tabButtons: Record<string, HTMLButtonElement> = {};
  private latDeg = 40;
  private lonDeg = 0;
  private raf = 0;
  private selectedStar: string | null = 'proxima';
  private highlightDso: string | null = null;
  private lastNightReadout = '';

  constructor(parent: HTMLElement, state: AppState) {
    super(parent, 'Observatory', 'observatory-title');
    this.state = state;
    const slot = this.root.querySelector('.overlay-head-slot')!;
    const tabs = document.createElement('div');
    tabs.className = 'overlay-tabs';
    const defs = [
      ['night', 'Night sky'],
      ['stars', 'Near stars'],
      ['deep', 'Deep sky'],
    ] as const;
    for (const [key, label] of defs) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => {
        this.tab = key;
        this.render();
      });
      tabs.appendChild(b);
      this.tabButtons[key] = b;
    }
    slot.appendChild(tabs);
  }

  /** Deep link from search: jump straight to a star or deep-sky object. */
  openFor(id: string): void {
    if (NEAR_STARS.some((s) => s.id === id)) {
      this.tab = 'stars';
      this.selectedStar = id;
    } else if (DEEP_SKY.some((o) => o.id === id)) {
      this.tab = 'deep';
      this.highlightDso = id;
    }
    this.open();
  }

  protected onOpen(): void {
    this.render();
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    super.close();
  }

  private render(): void {
    cancelAnimationFrame(this.raf);
    for (const [k, b] of Object.entries(this.tabButtons)) {
      b.classList.toggle('active', this.tab === k);
    }
    this.bodyEl.innerHTML = '';
    if (this.tab === 'night') this.renderNight();
    else if (this.tab === 'stars') this.renderStars();
    else this.renderDeep();
  }

  /* ---------------------------------------------------------- night sky -- */

  private renderNight(): void {
    this.bodyEl.innerHTML = `
      <div class="obs-night">
        <div class="obs-canvas-col">
          <canvas></canvas>
          <div class="obs-night-readout"></div>
        </div>
        <div class="obs-side">
          <label class="obs-slider">
            <span class="u-label">Latitude <b class="lat-val">40°N</b></span>
            <input type="range" min="-60" max="60" step="5" value="${this.latDeg}" aria-label="Observer latitude" />
          </label>
          <label class="obs-slider">
            <span class="u-label">Longitude <b class="lon-val">0°</b></span>
            <input type="range" min="-180" max="180" step="5" value="${this.lonDeg}" aria-label="Observer longitude" />
          </label>
          <p class="overlay-note">The dome shows the whole sky above your horizon - the rim is the horizon, the centre is straight up. It runs on the simulation clock: play, rewind or pick a date and watch the sky turn. Positions are good to a degree or two.</p>
          <p class="overlay-note obs-planets-legend"></p>
        </div>
      </div>
    `;
    const [latSlider, lonSlider] = Array.from(
      this.bodyEl.querySelectorAll<HTMLInputElement>('input[type=range]'),
    );
    const latVal = this.bodyEl.querySelector('.lat-val')!;
    const lonVal = this.bodyEl.querySelector('.lon-val')!;
    const sync = () => {
      this.latDeg = Number(latSlider.value);
      this.lonDeg = Number(lonSlider.value);
      latVal.textContent = `${Math.abs(this.latDeg)}°${this.latDeg >= 0 ? 'N' : 'S'}`;
      lonVal.textContent = `${Math.abs(this.lonDeg)}°${this.lonDeg === 0 ? '' : this.lonDeg > 0 ? 'E' : 'W'}`;
    };
    latSlider.addEventListener('input', sync);
    lonSlider.addEventListener('input', sync);
    sync();

    const loop = () => {
      this.drawNight();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  private drawNight(): void {
    const canvas = this.bodyEl.querySelector('canvas');
    if (!canvas) return;
    const wrap = canvas.parentElement!;
    const cssW = Math.min(520, Math.max(300, wrap.clientWidth || 520));
    const cssH = cssW;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssW * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'All-sky chart for the chosen place and simulation time');
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const d = this.state.simDays;
    const lst = gmstDeg(d) + this.lonDeg;
    const cx = cssW / 2;
    const cy = cssH / 2;
    const R = cssW * 0.44;

    // sky-position → chart. Looking UP: with north at top, east is on the LEFT.
    const project = (alt: number, az: number): [number, number] | null => {
      if (alt < -0.5) return null;
      const r = ((90 - alt) / 90) * R;
      return [cx - Math.sin(az * DEG) * r, cy - Math.cos(az * DEG) * r];
    };

    // ---- sun & daylight state
    const [ex, ey, ez] = keplerPosition(EARTH_ORBIT, d);
    const [sx, sy, sz] = eclToEq(-ex, -ey, -ez);
    const sunEq = raDecOf(sx, sy, sz);
    const sun = altAz(sunEq.raDeg, sunEq.decDeg, this.latDeg, lst);
    const daylight = sun.alt > -6;

    // dome background
    const bg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    if (daylight) {
      bg.addColorStop(0, 'rgba(64,110,170,0.55)');
      bg.addColorStop(1, 'rgba(30,58,102,0.65)');
    } else {
      bg.addColorStop(0, 'rgba(8,14,28,0.9)');
      bg.addColorStop(1, 'rgba(4,7,16,0.95)');
    }
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // altitude rings + horizon
    ctx.strokeStyle = 'rgba(158,189,255,0.16)';
    ctx.lineWidth = 1;
    for (const alt of [30, 60]) {
      ctx.beginPath();
      ctx.arc(cx, cy, ((90 - alt) / 90) * R, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(158,189,255,0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // compass
    ctx.font = '700 12px Rajdhani, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(223,230,244,0.9)';
    ctx.fillText('N', cx, cy - R - 8);
    ctx.fillText('S', cx, cy + R + 16);
    ctx.fillText('E', cx - R - 12, cy + 4);
    ctx.fillText('W', cx + R + 12, cy + 4);
    ctx.fillStyle = 'rgba(132,148,176,0.7)';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillText('ZENITH', cx, cy - 4);

    // ---- constellation figures
    const starPos = new Map<string, [number, number] | null>();
    for (const s of STARS) {
      const aa = altAz(s.raH * 15, s.decDeg, this.latDeg, lst);
      starPos.set(s.id, project(aa.alt, aa.az));
    }
    ctx.strokeStyle = daylight ? 'rgba(140,170,220,0.25)' : 'rgba(120,150,210,0.35)';
    ctx.lineWidth = 1;
    for (const fig of FIGURES) {
      for (const path of fig.paths) {
        for (let i = 0; i < path.length - 1; i++) {
          const a = starPos.get(path[i]);
          const b = starPos.get(path[i + 1]);
          if (!a || !b) continue;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
      }
    }

    // ---- stars
    for (const s of STARS) {
      const p = starPos.get(s.id);
      if (!p) continue;
      const size = Math.max(0.8, 3.4 - s.mag * 0.75);
      ctx.fillStyle = daylight ? 'rgba(210,225,250,0.5)' : 'rgba(235,242,255,0.95)';
      ctx.beginPath();
      ctx.arc(p[0], p[1], size, 0, Math.PI * 2);
      ctx.fill();
    }
    // a few anchor names
    ctx.fillStyle = 'rgba(158,189,255,0.75)';
    ctx.font = '600 9px system-ui, sans-serif';
    for (const id of ['sirius', 'vega', 'arcturus', 'capella', 'antares', 'polaris', 'canopus', 'betelgeuse']) {
      const p = starPos.get(id);
      if (p) ctx.fillText(id.toUpperCase(), p[0], p[1] - 6);
    }

    // ---- Moon (mean longitude; flat orbit approximation)
    const moonLon = (218.316 + 13.176396 * d) * DEG;
    const [mx, my, mz] = eclToEq(Math.cos(moonLon), Math.sin(moonLon), 0);
    const moonEq = raDecOf(mx, my, mz);
    const moon = altAz(moonEq.raDeg, moonEq.decDeg, this.latDeg, lst);
    const pm = project(moon.alt, moon.az);
    if (pm) {
      ctx.fillStyle = '#e8e6da';
      ctx.beginPath();
      ctx.arc(pm[0], pm[1], 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(232,230,218,0.9)';
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.fillText('MOON', pm[0], pm[1] - 8);
    }

    // ---- Sun
    const ps = project(sun.alt, sun.az);
    if (ps) {
      const g = ctx.createRadialGradient(ps[0], ps[1], 1, ps[0], ps[1], 12);
      g.addColorStop(0, 'rgba(255,236,180,1)');
      g.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ps[0], ps[1], 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,220,150,0.95)';
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.fillText('SUN', ps[0], ps[1] - 13);
    }

    // ---- planets (geocentric from the same Kepler elements as the scene)
    const visible: string[] = [];
    for (const spec of PLANET_CHART) {
      const def = PLANETS.find((p) => p.id === spec.id)!;
      const [px, py, pz] = keplerPosition(def.orbit!, d);
      const [qx, qy, qz] = eclToEq(px - ex, py - ey, pz - ez);
      const eq = raDecOf(qx, qy, qz);
      const aa = altAz(eq.raDeg, eq.decDeg, this.latDeg, lst);
      const pp = project(aa.alt, aa.az);
      if (!pp) continue;
      visible.push(spec.label);
      ctx.fillStyle = spec.color;
      ctx.beginPath();
      ctx.arc(pp[0], pp[1], 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(6,10,18,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = spec.color;
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.fillText(spec.label.toUpperCase(), pp[0], pp[1] - 7);
    }

    // readout line (cached - no per-frame DOM churn)
    const readout = this.bodyEl.querySelector('.obs-night-readout');
    if (readout) {
      const html = `<b>${fmtSimDate(d)} · ${fmtSimTime(d)}</b> · ${
        daylight ? 'daytime - the atmosphere would wash these stars out' : 'night sky'
      }`;
      if (html !== this.lastNightReadout) {
        this.lastNightReadout = html;
        readout.innerHTML = html;
      }
    }
    const legend = this.bodyEl.querySelector('.obs-planets-legend');
    if (legend) {
      const text = visible.length
        ? `Above the horizon now: ${pm ? 'the Moon and ' : ''}${visible.join(', ')} (naked-eye planets only).`
        : pm
          ? 'The Moon is up, but no naked-eye planets are above this horizon right now.'
          : 'No naked-eye planets above this horizon right now - try another time of day.';
      if (legend.textContent !== text) legend.textContent = text;
    }
  }

  /* --------------------------------------------------------- near stars -- */

  private renderStars(): void {
    this.bodyEl.innerHTML = `
      <div class="obs-stars">
        <div class="obs-canvas-col">
          <canvas></canvas>
          <p class="fine-print">Angle = right ascension · radius = distance (log scale). Every dot is a real star system with its measured distance.</p>
        </div>
        <div class="obs-side">
          <div class="obs-star-detail"></div>
          <div class="obs-star-list" role="listbox" aria-label="Star systems by distance"></div>
          <p class="fine-print">Distances: Hipparcos/Gaia parallaxes · ${STAR_SOURCES
            .map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`)
            .join(' · ')}</p>
        </div>
      </div>
    `;
    const list = this.bodyEl.querySelector('.obs-star-list')!;
    const sorted = [...NEAR_STARS].sort((a, b) => a.distanceLy - b.distanceLy);
    for (const s of sorted) {
      const row = document.createElement('button');
      row.className = 'obs-star-row';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(s.id === this.selectedStar));
      row.innerHTML = `<i style="background:${spectralColor(s.spectral)}"></i><span>${s.name}</span><small>${fmtLy(s.distanceLy)}</small>`;
      row.addEventListener('click', () => {
        this.selectedStar = s.id;
        this.renderStars();
        // re-render replaced the list - restore focus to the chosen row
        this.bodyEl.querySelector<HTMLButtonElement>('.obs-star-row.active')?.focus();
      });
      if (s.id === this.selectedStar) row.classList.add('active');
      list.appendChild(row);
    }
    this.drawStarMap();
    this.renderStarDetail();
    // click-to-select on the map
    const canvas = this.bodyEl.querySelector('canvas')!;
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let best: NearStar | null = null;
      let bestD = 14;
      for (const s of NEAR_STARS) {
        const p = this.starMapPos(s, rect.width);
        const dd = Math.hypot(p[0] - x, p[1] - y);
        if (dd < bestD) {
          bestD = dd;
          best = s;
        }
      }
      if (best) {
        this.selectedStar = best.id;
        this.renderStars();
      }
    });
  }

  private starMapPos(s: NearStar, cssW: number): [number, number] {
    const cx = cssW / 2;
    const R = cssW * 0.46;
    const t = (Math.log10(s.distanceLy) - Math.log10(3)) / (Math.log10(3000) - Math.log10(3));
    const r = Math.max(0.06, Math.min(1, t)) * R;
    const ang = (s.raH / 24) * Math.PI * 2 - Math.PI / 2; // 0h at top, clockwise
    return [cx + Math.cos(ang) * r, cx + Math.sin(ang) * r];
  }

  private drawStarMap(): void {
    const canvas = this.bodyEl.querySelector('canvas')!;
    const wrap = canvas.parentElement!;
    const cssW = Math.min(500, Math.max(300, wrap.clientWidth || 500));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssW}px`;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Map of the nearest star systems by distance from the Sun');
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = cssW / 2;
    const R = cssW * 0.46;

    // distance rings
    ctx.font = '600 9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    for (const ring of [5, 10, 25, 100, 1000]) {
      const t = (Math.log10(ring) - Math.log10(3)) / (Math.log10(3000) - Math.log10(3));
      const r = t * R;
      ctx.strokeStyle = 'rgba(158,189,255,0.14)';
      ctx.beginPath();
      ctx.arc(cx, cx, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(132,148,176,0.75)';
      ctx.fillText(`${ring} ly`, cx + 4, cx - r - 3);
    }

    // the Sun
    ctx.fillStyle = '#ffd9a0';
    ctx.beginPath();
    ctx.arc(cx, cx, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,217,160,0.9)';
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SUN', cx, cx + 14);

    for (const s of NEAR_STARS) {
      const [x, y] = this.starMapPos(s, cssW);
      const selected = s.id === this.selectedStar;
      ctx.fillStyle = spectralColor(s.spectral);
      ctx.beginPath();
      ctx.arc(x, y, s.group === 'neighbourhood' ? 3.4 : 2.8, 0, Math.PI * 2);
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = 'rgba(240,246,255,0.9)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // label the selected star
    const sel = NEAR_STARS.find((s) => s.id === this.selectedStar);
    if (sel) {
      const [x, y] = this.starMapPos(sel, cssW);
      ctx.fillStyle = 'rgba(240,246,255,0.95)';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sel.name.toUpperCase(), x, y - 12);
    }
  }

  private renderStarDetail(): void {
    const el = this.bodyEl.querySelector('.obs-star-detail');
    const s = NEAR_STARS.find((n) => n.id === this.selectedStar);
    if (!el || !s) return;
    const lightYears = s.distanceLy;
    const voyagerYears = Math.round((lightYears * 9.46e12) / (17 * 3.156e7) / 1e3) * 1000;
    el.innerHTML = `
      <div class="obs-star-name" style="color:${spectralColor(s.spectral)}">${s.name}</div>
      <div class="obs-star-facts">
        <span>${fmtLy(s.distanceLy)} away</span>
        <span>type ${s.spectral}</span>
        <span>magnitude ${s.mag}</span>
      </div>
      <p>${s.note}</p>
      <p class="fine-print">Light you see tonight left it ${lightYears < 100 ? lightYears.toFixed(1) : Math.round(lightYears).toLocaleString()} years ago. At Voyager speed the trip would take ~${voyagerYears.toLocaleString()} years.</p>
    `;
  }

  /* ----------------------------------------------------------- deep sky -- */

  private renderDeep(): void {
    const cards = DEEP_SKY.map((o) => this.dsoCard(o)).join('');
    this.bodyEl.innerHTML = `
      <p class="overlay-note">Highlights of the deep sky - every entry is a real catalogued object with its measured distance. Enable the <b>Deep sky</b> layer in the View panel to see where they sit on the sky in the main 3D view.</p>
      <div class="obs-dso-grid">${cards}</div>
      <p class="fine-print">Data: ${DEEP_SKY_SOURCES
        .map((sc) => `<a href="${sc.url}" target="_blank" rel="noopener">${sc.label}</a>`)
        .join(' · ')}</p>
    `;
    if (this.highlightDso) {
      const el = this.bodyEl.querySelector(`[data-dso="${this.highlightDso}"]`);
      el?.classList.add('highlight');
      el?.scrollIntoView({ block: 'center' });
      this.highlightDso = null;
    }
  }

  private dsoCard(o: DeepSkyObject): string {
    const color = DSO_COLORS[o.type] ?? '#9db4cc';
    return `
      <div class="obs-dso-card" data-dso="${o.id}">
        <div class="obs-dso-head">
          <span class="obs-dso-type" style="color:${color};border-color:${color}55">${o.type.toUpperCase()}</span>
          ${o.m ? `<span class="obs-dso-m">${o.m}</span>` : ''}
        </div>
        <div class="obs-dso-name">${o.name}</div>
        <div class="obs-dso-facts">${fmtLy(o.distanceLy)} · in ${o.constellation}${o.mag !== undefined ? ` · mag ${o.mag}` : ''}</div>
        <p>${o.note}</p>
      </div>
    `;
  }
}
