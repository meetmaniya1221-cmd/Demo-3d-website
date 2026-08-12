/**
 * The Observatory: three sky instruments in one overlay.
 *
 *  NIGHT SKY - a first-person planetarium: you stand on Earth at a chosen
 *    latitude/longitude and look around the sky above a real horizon. Stars
 *    and figures come from the same catalog as the 3D scene; the Sun, Moon
 *    and planets are computed from the same Kepler elements driving the
 *    scene (the Moon from a truncated lunar theory), so the view always
 *    agrees with the orrery. Accuracy ~1°: real charts use full
 *    ephemerides, this is honest instrument-grade approximation.
 *
 *  NEAR STARS - the stellar neighbourhood on a log-distance map, from
 *    Proxima Centauri out to Deneb, with real Hipparcos/Gaia distances,
 *    published temperatures and spectral classification.
 *
 *  DEEP SKY - Messier highlights + the galactic centre, with real
 *    observational imagery from Hubble, NOIRLab and the EHT.
 */
import { PLANETS, keplerPosition } from '../data/bodies';
import { STARS, FIGURES } from '../scene/constellations';
import { NEAR_STARS, STAR_SOURCES, lyToPc, type NearStar } from '../data/catalog/stars';
import { DEEP_SKY, DEEP_SKY_SOURCES, type DeepSkyObject } from '../data/catalog/deepsky';
import type { AppState } from '../sim/state';
import { fmtSimDate, fmtSimTime } from './format';
import { Overlay } from './overlays';
import { sound } from '../audio';

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
  const alt = Math.asin(Math.max(-1, Math.min(1, dot(zen, vx, vy, vz)))) / DEG;
  const az = ((Math.atan2(dot(east, vx, vy, vz), dot(north, vx, vy, vz)) / DEG) % 360 + 360) % 360;
  return { alt, az };
}

/**
 * Geocentric ecliptic longitude/latitude of the Moon (degrees), from the
 * leading terms of the lunar theory (Meeus). Good to ~0.3° - a big step up
 * from the flat mean-longitude circle, still honestly approximate.
 */
function moonEcliptic(d: number): { lonDeg: number; latDeg: number; elongDeg: number } {
  const L = 218.3164477 + 13.17639648 * d; // mean longitude
  const D = (297.8501921 + 12.19074912 * d) * DEG; // mean elongation
  const M = (357.5291092 + 0.98560028 * d) * DEG; // Sun mean anomaly
  const Mp = (134.9633964 + 13.06499295 * d) * DEG; // Moon mean anomaly
  const F = (93.272095 + 13.22935024 * d) * DEG; // argument of latitude
  const lon =
    L +
    6.289 * Math.sin(Mp) +
    1.274 * Math.sin(2 * D - Mp) +
    0.658 * Math.sin(2 * D) +
    0.214 * Math.sin(2 * Mp) -
    0.186 * Math.sin(M) -
    0.114 * Math.sin(2 * F);
  const lat =
    5.128 * Math.sin(F) +
    0.281 * Math.sin(Mp + F) +
    0.278 * Math.sin(Mp - F) +
    0.173 * Math.sin(2 * D - F);
  return { lonDeg: lon, latDeg: lat, elongDeg: D / DEG };
}

function fmtLy(ly: number): string {
  if (ly < 1000) return `${ly % 1 === 0 ? ly : ly.toFixed(ly < 30 ? 2 : 0)} ly`;
  if (ly < 1e6) return `${Math.round(ly).toLocaleString('en-US')} ly`;
  return `${(ly / 1e6).toFixed(2)} million ly`;
}

function fmtPc(ly: number): string {
  const pc = lyToPc(ly);
  if (pc < 100) return `${pc.toFixed(2)} pc`;
  if (pc < 1e5) return `${Math.round(pc).toLocaleString('en-US')} pc`;
  return `${(pc / 1e6).toFixed(2)} Mpc`;
}

/**
 * Approximate sRGB colour of a blackbody at temperature K - the honest way
 * to colour a star when no true-colour imagery exists (standard
 * Planckian-locus fit, clamped to the stellar range).
 */
function tempToRGB(kelvin: number): [number, number, number] {
  const t = Math.max(2000, Math.min(30000, kelvin)) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = Math.max(0, Math.min(255, 99.47 * Math.log(t) - 161.12));
    b = t <= 19 ? 0 : Math.max(0, Math.min(255, 138.52 * Math.log(t - 10) - 305.04));
  } else {
    r = Math.max(0, Math.min(255, 329.7 * Math.pow(t - 60, -0.1332)));
    g = Math.max(0, Math.min(255, 288.12 * Math.pow(t - 60, -0.0755)));
    b = 255;
  }
  return [r | 0, g | 0, b | 0];
}

function tempToCss(kelvin: number, alpha = 1): string {
  const [r, g, b] = tempToRGB(kelvin);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** Relative display size for the near-star map from the luminosity class. */
function starClassSize(spectral: string): number {
  if (/I[ab]|Ia|Ib(?!I)/.test(spectral) && !spectral.includes('III') && !spectral.includes('IV')) return 5.6; // supergiants
  if (spectral.includes('III')) return 4.4; // giants
  if (spectral.includes('IV')) return 3.8; // subgiants
  if (spectral.startsWith('D')) return 2.0; // white dwarfs
  const c = spectral[0]?.toUpperCase();
  if (c === 'O' || c === 'B' || c === 'A') return 3.6;
  if (c === 'F' || c === 'G') return 3.2;
  if (c === 'K') return 2.9;
  return 2.5; // M dwarfs
}

function luminosityClassLabel(spectral: string): string {
  if (spectral.includes('III')) return 'giant';
  if (spectral.includes('IV')) return 'subgiant';
  if (/I(a|b)/.test(spectral)) return 'supergiant';
  if (spectral.includes('II')) return 'bright giant';
  if (spectral.startsWith('D')) return 'white dwarf';
  const c = spectral[0]?.toUpperCase();
  return c === 'M' || c === 'K' ? 'dwarf (main sequence)' : 'main sequence';
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

const PLANET_CHART: Array<{ id: string; label: string; color: string; nakedEye: boolean }> = [
  { id: 'mercury', label: 'Mercury', color: '#b5a99a', nakedEye: true },
  { id: 'venus', label: 'Venus', color: '#e6c689', nakedEye: true },
  { id: 'mars', label: 'Mars', color: '#d88a5e', nakedEye: true },
  { id: 'jupiter', label: 'Jupiter', color: '#c9a67c', nakedEye: true },
  { id: 'saturn', label: 'Saturn', color: '#e3ce9e', nakedEye: true },
  { id: 'uranus', label: 'Uranus', color: '#9fd2d8', nakedEye: false },
  { id: 'neptune', label: 'Neptune', color: '#7fa8e8', nakedEye: false },
];

/** Observer presets - a spread of latitudes so the sky visibly changes. */
const LOCATIONS: Array<{ name: string; lat: number; lon: number }> = [
  { name: 'Reykjavik, Iceland', lat: 64.1, lon: -21.9 },
  { name: 'London, UK', lat: 51.5, lon: -0.1 },
  { name: 'Paris, France', lat: 48.9, lon: 2.4 },
  { name: 'New York, USA', lat: 40.7, lon: -74.0 },
  { name: 'Tokyo, Japan', lat: 35.7, lon: 139.7 },
  { name: 'Los Angeles, USA', lat: 34.1, lon: -118.2 },
  { name: 'Cairo, Egypt', lat: 30.0, lon: 31.2 },
  { name: 'Delhi, India', lat: 28.6, lon: 77.2 },
  { name: 'Honolulu, USA', lat: 21.3, lon: -157.9 },
  { name: 'Mexico City, Mexico', lat: 19.4, lon: -99.1 },
  { name: 'Singapore', lat: 1.4, lon: 103.8 },
  { name: 'Nairobi, Kenya', lat: -1.3, lon: 36.8 },
  { name: 'Rio de Janeiro, Brazil', lat: -22.9, lon: -43.2 },
  { name: 'Sydney, Australia', lat: -33.9, lon: 151.2 },
  { name: 'Cape Town, South Africa', lat: -33.9, lon: 18.4 },
  { name: 'Auckland, New Zealand', lat: -36.8, lon: 174.8 },
];

const WINDS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function windName(az: number): string {
  return WINDS[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];
}

/** Faint background stars: fixed random RA/Dec so they rotate with the real
 *  sky. Procedural backdrop, not a catalog - the named stars are real. */
interface FaintStar { raDeg: number; decDeg: number; mag: number }
let FAINT_CACHE: FaintStar[] | null = null;
function faintStars(): FaintStar[] {
  if (FAINT_CACHE) return FAINT_CACHE;
  let s = 20260812;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: FaintStar[] = [];
  for (let i = 0; i < 980; i++) {
    out.push({
      raDeg: rnd() * 360,
      decDeg: Math.asin(2 * rnd() - 1) / DEG,
      mag: 3.7 + rnd() * 2.7,
    });
  }
  FAINT_CACHE = out;
  return out;
}

/**
 * Milky Way band: soft patches along the real galactic plane (J2000
 * galactic→equatorial rotation), brightest toward the Sagittarius bulge.
 * The glow texture is procedural; the band's position on the sky is real.
 */
interface MwBlob { raDeg: number; decDeg: number; r: number; a: number }
let MW_CACHE: MwBlob[] | null = null;
let MW_SPRITE: HTMLCanvasElement | null = null;

/** 64px soft radial glow, rendered once and stamped for every band patch. */
function mwSprite(): HTMLCanvasElement {
  if (MW_SPRITE) return MW_SPRITE;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(200,214,238,0.9)');
  grad.addColorStop(0.55, 'rgba(200,214,238,0.28)');
  grad.addColorStop(1, 'rgba(200,214,238,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  MW_SPRITE = c;
  return c;
}
function milkyWayBlobs(): MwBlob[] {
  if (MW_CACHE) return MW_CACHE;
  let s = 19640512;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  // galactic→equatorial rotation (transpose of the standard J2000
  // equatorial→galactic matrix), applied row·vector below
  const M = [
    [-0.0548755604, 0.4941094279, -0.8676661490],
    [-0.8734370902, -0.4448296300, -0.1980763734],
    [-0.4838350155, 0.7469822445, 0.4559837762],
  ];
  const out: MwBlob[] = [];
  for (let i = 0; i < 680; i++) {
    const l = rnd() * 360;
    // gaussian-ish latitude scatter, tighter near the plane
    const b = (rnd() + rnd() + rnd() - 1.5) * 7;
    const lr = l * DEG;
    const br = b * DEG;
    const g = [Math.cos(br) * Math.cos(lr), Math.cos(br) * Math.sin(lr), Math.sin(br)];
    const ex = M[0][0] * g[0] + M[0][1] * g[1] + M[0][2] * g[2];
    const ey = M[1][0] * g[0] + M[1][1] * g[1] + M[1][2] * g[2];
    const ez = M[2][0] * g[0] + M[2][1] * g[1] + M[2][2] * g[2];
    const eq = raDecOf(ex, ey, ez);
    // the bulge toward l≈0 glows wider and brighter
    const centre = 0.5 + 0.5 * Math.cos(lr);
    out.push({
      raDeg: eq.raDeg,
      decDeg: eq.decDeg,
      r: 9 + rnd() * 10 + centre * 9,
      a: 0.02 + rnd() * 0.022 + centre * 0.032,
    });
  }
  MW_CACHE = out;
  return out;
}

interface SkyMarker { x: number; y: number; name: string; alt: number; az: number; info: string }

export class Observatory extends Overlay {
  private state: AppState;
  private tab: 'night' | 'stars' | 'deep' = 'night';
  private tabButtons: Record<string, HTMLButtonElement> = {};
  private latDeg = 40.7;
  private lonDeg = -74;
  private locName = 'New York, USA';
  private raf = 0;
  private selectedStar: string | null = 'proxima';
  private highlightDso: string | null = null;
  private lastNightReadout = '';
  private lastNightLegend = '';
  // first-person camera
  private yawDeg = 180; // azimuth of view centre (0=N, 90=E)
  private pitchDeg = 24; // altitude of view centre
  private fovDeg = 66; // vertical field of view
  private markers: SkyMarker[] = [];
  private picked: SkyMarker | null = null;
  private lastDrawKey = '';
  private lightbox: HTMLElement | null = null;
  private lightboxTrigger: HTMLElement | null = null;
  private lightboxKeyHandler: ((e: KeyboardEvent) => void) | null = null;

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
    this.closeLightbox(false);
    super.close();
  }

  private render(): void {
    cancelAnimationFrame(this.raf);
    this.closeLightbox(false);
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
    const locOptions = LOCATIONS.map(
      (l) => `<option value="${l.name}"${l.name === this.locName ? ' selected' : ''}>${l.name}</option>`,
    ).join('');
    this.bodyEl.innerHTML = `
      <div class="obs-night">
        <div class="obs-canvas-col obs-pano-col">
          <canvas class="obs-pano" tabindex="0" aria-label="First-person view of the sky - drag to look around"></canvas>
          <div class="obs-night-readout"></div>
        </div>
        <div class="obs-side">
          <label class="obs-loc-label">
            <span class="u-label">Observer location</span>
            <select class="obs-loc-select" aria-label="Choose an observing location">
              <option value="__custom"${LOCATIONS.some((l) => l.name === this.locName) ? '' : ' selected'}>Custom coordinates</option>
              ${locOptions}
            </select>
          </label>
          <label class="obs-slider">
            <span class="u-label">Latitude <b class="lat-val"></b></span>
            <input type="range" min="-90" max="90" step="0.5" value="${this.latDeg}" aria-label="Observer latitude" />
          </label>
          <label class="obs-slider">
            <span class="u-label">Longitude <b class="lon-val"></b></span>
            <input type="range" min="-180" max="180" step="0.5" value="${this.lonDeg}" aria-label="Observer longitude" />
          </label>
          <p class="overlay-note">You are standing on Earth, looking at the real sky for this place and the simulation clock. <b>Drag</b> to look around, <b>scroll</b> to zoom, click any labelled object for its position. Play, rewind or pick a date and watch the sky turn. Positions are good to about a degree.</p>
          <p class="overlay-note obs-planets-legend"></p>
        </div>
      </div>
    `;
    const [latSlider, lonSlider] = Array.from(
      this.bodyEl.querySelectorAll<HTMLInputElement>('input[type=range]'),
    );
    const locSelect = this.bodyEl.querySelector<HTMLSelectElement>('.obs-loc-select')!;
    const latVal = this.bodyEl.querySelector('.lat-val')!;
    const lonVal = this.bodyEl.querySelector('.lon-val')!;
    const syncText = () => {
      latVal.textContent = `${Math.abs(this.latDeg).toFixed(1).replace(/\.0$/, '')}°${this.latDeg >= 0 ? 'N' : 'S'}`;
      lonVal.textContent =
        this.lonDeg === 0 ? '0°' : `${Math.abs(this.lonDeg).toFixed(1).replace(/\.0$/, '')}°${this.lonDeg > 0 ? 'E' : 'W'}`;
    };
    const fromSliders = () => {
      this.latDeg = Number(latSlider.value);
      this.lonDeg = Number(lonSlider.value);
      this.locName = '__custom';
      locSelect.value = '__custom';
      syncText();
    };
    latSlider.addEventListener('input', fromSliders);
    lonSlider.addEventListener('input', fromSliders);
    locSelect.addEventListener('change', () => {
      const loc = LOCATIONS.find((l) => l.name === locSelect.value);
      if (!loc) return;
      this.locName = loc.name;
      this.latDeg = loc.lat;
      this.lonDeg = loc.lon;
      latSlider.value = String(loc.lat);
      lonSlider.value = String(loc.lon);
      this.picked = null;
      syncText();
      sound.play('click', 0.18);
    });
    syncText();

    // --- look-around input
    const canvas = this.bodyEl.querySelector<HTMLCanvasElement>('.obs-pano')!;
    let dragging = false;
    let moved = 0;
    let px = 0;
    let py = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = 0;
      px = e.clientX;
      py = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const fovH = this.fovDeg * (rect.width / rect.height) * 0.62;
      const dx = e.clientX - px;
      const dy = e.clientY - py;
      moved += Math.abs(dx) + Math.abs(dy);
      px = e.clientX;
      py = e.clientY;
      this.yawDeg = ((this.yawDeg - (dx * fovH) / rect.width) % 360 + 360) % 360;
      this.pitchDeg = Math.max(-14, Math.min(86, this.pitchDeg + (dy * this.fovDeg) / rect.height));
    });
    const endDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (moved < 6) this.pickSkyObject(canvas, e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', () => (dragging = false));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.fovDeg = Math.max(30, Math.min(100, this.fovDeg + Math.sign(e.deltaY) * 5));
      },
      { passive: false },
    );
    canvas.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 15 : 5;
      if (e.key === 'ArrowLeft') this.yawDeg = (this.yawDeg - step + 360) % 360;
      else if (e.key === 'ArrowRight') this.yawDeg = (this.yawDeg + step) % 360;
      else if (e.key === 'ArrowUp') this.pitchDeg = Math.min(86, this.pitchDeg + step);
      else if (e.key === 'ArrowDown') this.pitchDeg = Math.max(-14, this.pitchDeg - step);
      else return;
      e.preventDefault();
    });

    const loop = () => {
      this.drawNight();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  private pickSkyObject(canvas: HTMLCanvasElement, clientX: number, clientY: number): void {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: SkyMarker | null = null;
    let bestD = 16;
    for (const m of this.markers) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    this.picked = best;
    if (best) sound.play('click', 0.18);
  }

  /** View-space projection for the first-person sky camera. */
  private makeProjector(w: number, h: number) {
    const yaw = this.yawDeg * DEG;
    const pitch = this.pitchDeg * DEG;
    // basis in (east, up, north) coordinates
    const fx = Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = Math.cos(yaw) * Math.cos(pitch);
    // right = forward × worldUp (normalised)
    let rx = fz;
    let rz = -fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    // up = forward × right
    const ux = rz * fy;
    const uy = rx * fz - rz * fx;
    const uz = -rx * fy;
    const f = h / 2 / Math.tan((this.fovDeg / 2) * DEG);
    return (altDeg: number, azDeg: number): [number, number] | null => {
      const alt = altDeg * DEG;
      const az = azDeg * DEG;
      const dx = Math.sin(az) * Math.cos(alt);
      const dy = Math.sin(alt);
      const dz = Math.cos(az) * Math.cos(alt);
      const cz = dx * fx + dy * fy + dz * fz;
      if (cz < 0.03) return null;
      const cx = dx * rx + dz * rz;
      const cy = dx * ux + dy * uy + dz * uz;
      const sx = w / 2 + (cx / cz) * f;
      const sy = h / 2 - (cy / cz) * f;
      if (sx < -160 || sx > w + 160 || sy < -160 || sy > h + 160) return null;
      return [sx, sy];
    };
  }

  /** Sky + ground colours for the current solar altitude. */
  private skyPalette(sunAlt: number): { top: string; bottom: string; starFade: number } {
    // key stops: night, astronomical, nautical, civil, day
    const stops: Array<[number, [number, number, number], [number, number, number]]> = [
      [-90, [2, 4, 10], [4, 7, 16]],
      [-18, [2, 4, 10], [4, 7, 16]],
      [-12, [4, 8, 20], [10, 16, 34]],
      [-6, [8, 16, 38], [40, 44, 72]],
      [0, [30, 52, 96], [150, 110, 84]],
      [8, [88, 138, 205], [170, 196, 228]],
      [90, [98, 150, 216], [188, 210, 236]],
    ];
    let i = 0;
    while (i < stops.length - 2 && sunAlt > stops[i + 1][0]) i++;
    const [a0, top0, bot0] = stops[i];
    const [a1, top1, bot1] = stops[i + 1];
    const t = Math.max(0, Math.min(1, (sunAlt - a0) / (a1 - a0 || 1)));
    const mix = (c0: number[], c1: number[]) =>
      `rgb(${(c0[0] + (c1[0] - c0[0]) * t) | 0},${(c0[1] + (c1[1] - c0[1]) * t) | 0},${(c0[2] + (c1[2] - c0[2]) * t) | 0})`;
    return {
      top: mix(top0, top1),
      bottom: mix(bot0, bot1),
      starFade: Math.max(0, Math.min(1, (-sunAlt - 4) / 8)),
    };
  }

  private drawNight(): void {
    const canvas = this.bodyEl.querySelector<HTMLCanvasElement>('.obs-pano');
    if (!canvas) return;
    const wrap = canvas.parentElement!;
    const cssW = Math.max(300, wrap.clientWidth || 560);
    const cssH = Math.round(Math.min(Math.max(cssW * 0.62, 280), window.innerHeight * 0.6));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.setAttribute('role', 'img');
    }
    const d = this.state.simDays;
    // skip the repaint entirely while nothing has moved (paused sim, no
    // look-around, same place) - the loop then costs ~nothing per frame
    const drawKey = `${d.toFixed(7)}|${this.yawDeg.toFixed(2)}|${this.pitchDeg.toFixed(2)}|${this.fovDeg}|${this.latDeg}|${this.lonDeg}|${cssW}|${this.picked?.name ?? ''}`;
    if (drawKey === this.lastDrawKey) return;
    this.lastDrawKey = drawKey;

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const lst = gmstDeg(d) + this.lonDeg;
    const project = this.makeProjector(cssW, cssH);
    this.markers = [];

    // ---- sun & daylight state
    const [ex, ey, ez] = keplerPosition(EARTH_ORBIT, d);
    const [sx, sy, sz] = eclToEq(-ex, -ey, -ez);
    const sunEq = raDecOf(sx, sy, sz);
    const sun = altAz(sunEq.raDeg, sunEq.decDeg, this.latDeg, lst);
    const pal = this.skyPalette(sun.alt);
    const daylight = sun.alt > -6;

    // sky gradient
    const bg = ctx.createLinearGradient(0, 0, 0, cssH);
    bg.addColorStop(0, pal.top);
    bg.addColorStop(1, pal.bottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    // ---- Milky Way glow along the real galactic plane (soft sprite so the
    // band reads as haze, not circles)
    const starAlpha = pal.starFade;
    if (starAlpha > 0.01) {
      const sprite = mwSprite();
      for (const mw of milkyWayBlobs()) {
        const aa = altAz(mw.raDeg, mw.decDeg, this.latDeg, lst);
        if (aa.alt < -6) continue;
        const p = project(aa.alt, aa.az);
        if (!p) continue;
        ctx.globalAlpha = mw.a * starAlpha;
        ctx.drawImage(sprite, p[0] - mw.r, p[1] - mw.r, mw.r * 2, mw.r * 2);
      }
      ctx.globalAlpha = 1;
    }

    // ---- ecliptic: the road the Sun, Moon and planets travel
    if (starAlpha > 0.02) {
      ctx.strokeStyle = `rgba(255,196,107,${0.14 * starAlpha})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      let pen = false;
      for (let lon = 0; lon <= 360; lon += 3) {
        const [eqx, eqy, eqz] = eclToEq(Math.cos(lon * DEG), Math.sin(lon * DEG), 0);
        const eq = raDecOf(eqx, eqy, eqz);
        const aa = altAz(eq.raDeg, eq.decDeg, this.latDeg, lst);
        const p = aa.alt < -1 ? null : project(aa.alt, aa.az);
        if (!p) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        pen = true;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- faint procedural backdrop stars (rotate with the real sky)
    if (starAlpha > 0.01) {
      for (const fs of faintStars()) {
        const aa = altAz(fs.raDeg, fs.decDeg, this.latDeg, lst);
        if (aa.alt < -1) continue;
        const p = project(aa.alt, aa.az);
        if (!p) continue;
        const r = Math.max(0.4, (6.9 - fs.mag) * 0.3);
        ctx.fillStyle = `rgba(215,228,248,${(0.28 + (6.4 - fs.mag) * 0.16) * starAlpha})`;
        ctx.fillRect(p[0] - r / 2, p[1] - r / 2, r, r);
      }
    }

    // ---- constellation figures + real stars
    const starPos = new Map<string, [number, number] | null>();
    const starAlt = new Map<string, { alt: number; az: number }>();
    for (const s of STARS) {
      const aa = altAz(s.raH * 15, s.decDeg, this.latDeg, lst);
      starAlt.set(s.id, aa);
      starPos.set(s.id, aa.alt < -2 ? null : project(aa.alt, aa.az));
    }
    if (starAlpha > 0.02) {
      ctx.strokeStyle = `rgba(120,160,220,${0.4 * starAlpha})`;
      ctx.lineWidth = 1;
      for (const fig of FIGURES) {
        let sumX = 0;
        let sumY = 0;
        let nSeg = 0;
        for (const path of fig.paths) {
          for (let i = 0; i < path.length - 1; i++) {
            const a = starPos.get(path[i]);
            const b = starPos.get(path[i + 1]);
            if (!a || !b) continue;
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.stroke();
            sumX += a[0] + b[0];
            sumY += a[1] + b[1];
            nSeg++;
          }
        }
        if (nSeg >= 2) {
          ctx.fillStyle = `rgba(126,164,224,${0.5 * starAlpha})`;
          ctx.font = '600 10px Rajdhani, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(fig.name.toUpperCase(), sumX / (2 * nSeg), sumY / (2 * nSeg));
        }
      }

      for (const s of STARS) {
        const p = starPos.get(s.id);
        if (!p) continue;
        const size = Math.max(0.7, 3.2 - s.mag * 0.72);
        ctx.fillStyle = `rgba(235,242,255,${0.95 * starAlpha})`;
        ctx.beginPath();
        ctx.arc(p[0], p[1], size, 0, Math.PI * 2);
        ctx.fill();
        if (size > 2.2) {
          // subtle cross-glint on the brightest stars
          ctx.strokeStyle = `rgba(220,232,255,${0.35 * starAlpha})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(p[0] - size * 2.4, p[1]);
          ctx.lineTo(p[0] + size * 2.4, p[1]);
          ctx.moveTo(p[0], p[1] - size * 2.4);
          ctx.lineTo(p[0], p[1] + size * 2.4);
          ctx.stroke();
        }
      }
      // anchor names + pickable markers
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (const id of ['sirius', 'vega', 'arcturus', 'capella', 'antares', 'polaris', 'canopus', 'betelgeuse', 'rigel', 'altair', 'deneb', 'spica', 'procyon', 'fomalhaut', 'aldebaran', 'pollux', 'regulus', 'acrux']) {
        const p = starPos.get(id);
        if (!p) continue;
        const aa = starAlt.get(id)!;
        const def = STARS.find((s) => s.id === id)!;
        ctx.fillStyle = `rgba(158,189,255,${0.8 * starAlpha})`;
        ctx.fillText(id.toUpperCase(), p[0], p[1] - 7);
        this.markers.push({ x: p[0], y: p[1], name: id.toUpperCase(), alt: aa.alt, az: aa.az, info: `star · mag ${def.mag.toFixed(1)}` });
      }
    }

    // ---- planets (geocentric from the same Kepler elements as the scene)
    const visible: string[] = [];
    for (const spec of PLANET_CHART) {
      const def = PLANETS.find((p) => p.id === spec.id)!;
      const [px2, py2, pz2] = keplerPosition(def.orbit!, d);
      const [qx, qy, qz] = eclToEq(px2 - ex, py2 - ey, pz2 - ez);
      const eq = raDecOf(qx, qy, qz);
      const aa = altAz(eq.raDeg, eq.decDeg, this.latDeg, lst);
      if (aa.alt < -0.8) continue;
      const pp = project(aa.alt, aa.az);
      const dim = spec.nakedEye ? 1 : 0.62;
      const vis = spec.nakedEye ? Math.max(0.25, starAlpha) : starAlpha; // bright planets pierce twilight
      if (aa.alt > 0) visible.push(spec.label + (spec.nakedEye ? '' : '*'));
      if (!pp || vis < 0.02) continue;
      const r = spec.nakedEye ? 3.4 : 2.4;
      const glow = ctx.createRadialGradient(pp[0], pp[1], 0.5, pp[0], pp[1], r * 3);
      glow.addColorStop(0, spec.color);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = vis * dim;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(pp[0], pp[1], r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = spec.color;
      ctx.beginPath();
      ctx.arc(pp[0], pp[1], r, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '700 10px Rajdhani, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(spec.label.toUpperCase(), pp[0], pp[1] - 9);
      ctx.globalAlpha = 1;
      this.markers.push({
        x: pp[0],
        y: pp[1],
        name: spec.label.toUpperCase(),
        alt: aa.alt,
        az: aa.az,
        info: spec.nakedEye ? 'planet' : 'planet · needs binoculars/telescope',
      });
    }

    // ---- Moon (truncated lunar theory + phase from solar elongation)
    const moon = moonEcliptic(d);
    const [mx, my, mz] = eclToEq(
      Math.cos(moon.latDeg * DEG) * Math.cos(moon.lonDeg * DEG),
      Math.cos(moon.latDeg * DEG) * Math.sin(moon.lonDeg * DEG),
      Math.sin(moon.latDeg * DEG),
    );
    const moonEq = raDecOf(mx, my, mz);
    const moonAA = altAz(moonEq.raDeg, moonEq.decDeg, this.latDeg, lst);
    const pm = moonAA.alt > -1 ? project(moonAA.alt, moonAA.az) : null;
    // elongation between geocentric sun/moon directions → phase
    const sunLon = Math.atan2(-ey, -ex);
    const elong = Math.acos(
      Math.max(-1, Math.min(1, Math.cos(moon.latDeg * DEG) * Math.cos(moon.lonDeg * DEG - sunLon))),
    );
    const litFraction = (1 - Math.cos(elong)) / 2;
    if (pm) {
      // lit-limb direction: project a point nudged 2° from the Moon toward
      // the Sun along the great circle - always on-screen next to the Moon,
      // so the orientation stays right even with the Sun behind the camera
      const dirOf = (alt: number, az: number): [number, number, number] => [
        Math.sin(az * DEG) * Math.cos(alt * DEG),
        Math.sin(alt * DEG),
        Math.cos(az * DEG) * Math.cos(alt * DEG),
      ];
      const mv = dirOf(moonAA.alt, moonAA.az);
      const sv = dirOf(sun.alt, sun.az);
      const t = 0.035;
      const nx = mv[0] + (sv[0] - mv[0]) * t;
      const ny = mv[1] + (sv[1] - mv[1]) * t;
      const nz = mv[2] + (sv[2] - mv[2]) * t;
      const nr = Math.hypot(nx, ny, nz) || 1;
      const nAlt = Math.asin(ny / nr) / DEG;
      const nAz = ((Math.atan2(nx, nz) / DEG) % 360 + 360) % 360;
      const pn = project(nAlt, nAz);
      const sunDirAngle = pn ? Math.atan2(pn[1] - pm[1], pn[0] - pm[0]) : Math.PI;
      this.drawMoon(ctx, pm[0], pm[1], 7, -Math.cos(elong), sunDirAngle);
      ctx.fillStyle = 'rgba(232,230,218,0.95)';
      ctx.font = '700 10px Rajdhani, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MOON', pm[0], pm[1] - 12);
      this.markers.push({
        x: pm[0],
        y: pm[1],
        name: 'MOON',
        alt: moonAA.alt,
        az: moonAA.az,
        info: `${Math.round(litFraction * 100)}% lit`,
      });
    }

    // ---- Sun
    const ps = sun.alt > -1.5 ? project(sun.alt, sun.az) : null;
    if (ps) {
      const g = ctx.createRadialGradient(ps[0], ps[1], 2, ps[0], ps[1], 26);
      g.addColorStop(0, 'rgba(255,244,205,1)');
      g.addColorStop(0.35, 'rgba(255,226,150,0.85)');
      g.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ps[0], ps[1], 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff6dc';
      ctx.beginPath();
      ctx.arc(ps[0], ps[1], 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,230,170,0.95)';
      ctx.font = '700 10px Rajdhani, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SUN', ps[0], ps[1] - 14);
      this.markers.push({ x: ps[0], y: ps[1], name: 'SUN', alt: sun.alt, az: sun.az, info: 'star' });
    }

    // ---- ground + horizon (drawn last so it truncates everything below it)
    this.drawGround(ctx, project, cssW, cssH, daylight);

    // ---- readout + legend (cached - no per-frame DOM churn)
    const readout = this.bodyEl.querySelector('.obs-night-readout');
    if (readout) {
      const dir = windName(this.yawDeg);
      const pickedTxt = this.picked
        ? ` · <b>${this.picked.name}</b> alt ${this.picked.alt.toFixed(0)}° az ${this.picked.az.toFixed(0)}° (${windName(this.picked.az)}) · ${this.picked.info}`
        : '';
      const html = `<b>${fmtSimDate(d)} · ${fmtSimTime(d)}</b> · looking <b>${dir}</b> alt ${Math.round(this.pitchDeg)}°${pickedTxt}`;
      if (html !== this.lastNightReadout) {
        this.lastNightReadout = html;
        readout.innerHTML = html;
      }
    }
    const legend = this.bodyEl.querySelector('.obs-planets-legend');
    if (legend) {
      const moonTxt = pm ? `the Moon (${Math.round(litFraction * 100)}% lit)` : '';
      const list = visible.join(', ');
      let text: string;
      if (daylight) {
        text = 'Daylight - the atmosphere washes the stars out. Run time forward to nightfall, or rewind to last night.';
      } else if (visible.length || moonTxt) {
        text = `Above the horizon now: ${[moonTxt, list].filter(Boolean).join(' and ')}. ${visible.some((v) => v.includes('*')) ? '* too faint for the naked eye.' : ''}`;
      } else {
        text = 'No planets or Moon above this horizon right now - drag around the sky, or try another time of day.';
      }
      if (text !== this.lastNightLegend) {
        this.lastNightLegend = text;
        legend.textContent = text;
      }
    }
  }

  /** Moon disc with terminator. c = signed cos(phase angle); +1 full, -1 new.
   *  Dark disc, then the sun-side lit semicircle, then a full terminator
   *  ellipse: lit for gibbous (adds the far-side bulge), dark for crescent
   *  (carves into the lit half). */
  private drawMoon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    R: number,
    c: number,
    sunAngle: number,
  ): void {
    const LIT = '#e8e6da';
    const DARK = 'rgba(70,76,92,0.85)';
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = DARK;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // lit part faces the Sun's screen direction (+x after this rotation)
    ctx.rotate(sunAngle);
    ctx.fillStyle = LIT;
    ctx.beginPath();
    ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
    ctx.closePath();
    ctx.fill();
    const rx = Math.abs(c) * R;
    if (rx > 0.3) {
      ctx.fillStyle = c >= 0 ? LIT : DARK;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, R, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Ground plane, horizon line, compass ticks and the 8 wind labels. */
  private drawGround(
    ctx: CanvasRenderingContext2D,
    project: (alt: number, az: number) => [number, number] | null,
    w: number,
    h: number,
    daylight: boolean,
  ): void {
    // horizon polyline across the field of view
    const pts: Array<[number, number]> = [];
    for (let off = -130; off <= 130; off += 2.5) {
      const p = project(0, this.yawDeg + off);
      if (p) pts.push(p);
    }
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      // close the polygon along the bottom edge
      ctx.lineTo(w + 200, pts[pts.length - 1][1]);
      ctx.lineTo(w + 200, h + 200);
      ctx.lineTo(-200, h + 200);
      ctx.lineTo(-200, pts[0][1]);
      ctx.closePath();
      const gg = ctx.createLinearGradient(0, Math.min(pts[0][1], pts[Math.floor(pts.length / 2)][1]), 0, h);
      if (daylight) {
        gg.addColorStop(0, '#1c2b18');
        gg.addColorStop(1, '#0c130b');
      } else {
        gg.addColorStop(0, '#0b120c');
        gg.addColorStop(1, '#040604');
      }
      ctx.fillStyle = gg;
      ctx.fill();
      // horizon line
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.strokeStyle = daylight ? 'rgba(190,214,190,0.5)' : 'rgba(122,168,214,0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (this.pitchDeg < 0) {
      // looking almost straight down - fill everything as ground
      ctx.fillStyle = daylight ? '#101c0e' : '#070b07';
      ctx.fillRect(0, 0, w, h);
    }

    // compass ticks every 15°, wind labels every 45°
    ctx.textAlign = 'center';
    for (let az = 0; az < 360; az += 15) {
      const base = project(0, az);
      if (!base) continue;
      const tip = project(az % 45 === 0 ? 2.4 : 1.2, az);
      if (tip) {
        ctx.strokeStyle = 'rgba(140,190,235,0.5)';
        ctx.lineWidth = az % 45 === 0 ? 1.4 : 0.8;
        ctx.beginPath();
        ctx.moveTo(base[0], base[1]);
        ctx.lineTo(tip[0], tip[1]);
        ctx.stroke();
      }
      if (az % 45 === 0) {
        const lp = project(4.6, az);
        if (lp) {
          const name = windName(az);
          const major = az % 90 === 0;
          ctx.font = major
            ? '700 13px Orbitron, Rajdhani, sans-serif'
            : '600 10px Rajdhani, system-ui, sans-serif';
          ctx.fillStyle = major ? 'rgba(126,222,255,0.95)' : 'rgba(150,190,230,0.8)';
          ctx.fillText(name, lp[0], lp[1]);
        }
      }
    }
  }

  /* --------------------------------------------------------- near stars -- */

  private renderStars(): void {
    this.bodyEl.innerHTML = `
      <div class="obs-stars">
        <div class="obs-canvas-col">
          <canvas></canvas>
          <p class="fine-print">Angle = right ascension · radius = distance (log scale) · colour = measured temperature · size = luminosity class. Every dot is a real star system at its measured distance.</p>
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
      row.innerHTML = `<i style="background:${tempToCss(s.tempK)};box-shadow:0 0 6px ${tempToCss(s.tempK, 0.7)}"></i><span>${s.name}</span><small>${fmtLy(s.distanceLy)}</small>`;
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
      const size = starClassSize(s.spectral);
      const col = tempToCss(s.tempK);
      // soft halo so hot/luminous stars visibly outshine the red dwarfs
      const glow = ctx.createRadialGradient(x, y, 0.4, x, y, size * 2.4);
      glow.addColorStop(0, tempToCss(s.tempK, 0.55));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, size * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = 'rgba(240,246,255,0.9)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.62 + 4.5, 0, Math.PI * 2);
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
      ctx.fillText(sel.name.toUpperCase(), x, y - 13);
    }
  }

  private renderStarDetail(): void {
    const el = this.bodyEl.querySelector('.obs-star-detail');
    const s = NEAR_STARS.find((n) => n.id === this.selectedStar);
    if (!el || !s) return;
    const lightYears = s.distanceLy;
    const voyagerYears = Math.round((lightYears * 9.46e12) / (17 * 3.156e7) / 1e3) * 1000;
    el.innerHTML = `
      <div class="obs-star-head">
        <canvas class="obs-star-portrait" width="76" height="76" aria-hidden="true"></canvas>
        <div>
          <div class="obs-star-name" style="color:${tempToCss(s.tempK)}">${s.name}</div>
          <div class="obs-star-facts">
            <span>${fmtLy(s.distanceLy)} · ${fmtPc(s.distanceLy)}</span>
          </div>
        </div>
      </div>
      <div class="obs-star-grid">
        <span class="k">Spectral type</span><span>${s.spectral} · ${luminosityClassLabel(s.spectral)}</span>
        <span class="k">Temperature</span><span>≈ ${s.tempK.toLocaleString('en-US')} K</span>
        <span class="k">Brightness</span><span>magnitude ${s.mag} (apparent)</span>
        <span class="k">System</span><span>${s.system}</span>
      </div>
      <p>${s.note}</p>
      <p class="fine-print">Light you see tonight left it ${lightYears < 100 ? lightYears.toFixed(1) : Math.round(lightYears).toLocaleString()} years ago. At Voyager speed the trip would take ~${voyagerYears.toLocaleString()} years.</p>
      <p class="fine-print">Star rendered from its measured temperature and class - a physical representation, not a photograph (stars other than the Sun are points of light to any camera).</p>
    `;
    const portrait = el.querySelector<HTMLCanvasElement>('.obs-star-portrait');
    if (portrait) this.drawStarPortrait(portrait, s);
  }

  /** Procedural star disc: blackbody colour + limb darkening. Honest physics,
   *  no invented surface detail. */
  private drawStarPortrait(canvas: HTMLCanvasElement, s: NearStar): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = 76;
    canvas.width = css * dpr;
    canvas.height = css * dpr;
    canvas.style.width = `${css}px`;
    canvas.style.height = `${css}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = css / 2;
    const [r, g, b] = tempToRGB(s.tempK);
    const R = 8 + starClassSize(s.spectral) * 3.4;
    // corona glow
    const glow = ctx.createRadialGradient(cx, cx, R * 0.4, cx, cx, css / 2);
    glow.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, css, css);
    // photosphere with limb darkening (stronger for cool stars)
    const limb = s.tempK < 4500 ? 0.55 : 0.35;
    const disc = ctx.createRadialGradient(cx - R * 0.18, cx - R * 0.18, R * 0.1, cx, cx, R);
    disc.addColorStop(0, `rgb(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)})`);
    disc.addColorStop(0.75, `rgb(${r},${g},${b})`);
    disc.addColorStop(1, `rgb(${(r * (1 - limb)) | 0},${(g * (1 - limb)) | 0},${(b * (1 - limb)) | 0})`);
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(cx, cx, R, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ----------------------------------------------------------- deep sky -- */

  private renderDeep(): void {
    const cards = DEEP_SKY.map((o) => this.dsoCard(o)).join('');
    this.bodyEl.innerHTML = `
      <p class="overlay-note">Highlights of the deep sky - every entry is a real catalogued object with its measured distance and real observational imagery. Click an image to enlarge. Enable the <b>Deep sky</b> layer in the View panel to see where they sit in the main 3D view.</p>
      <div class="obs-dso-grid">${cards}</div>
      <p class="fine-print">Data & imagery: ${DEEP_SKY_SOURCES
        .map((sc) => `<a href="${sc.url}" target="_blank" rel="noopener">${sc.label}</a>`)
        .join(' · ')}</p>
    `;
    this.bodyEl.querySelectorAll<HTMLButtonElement>('.obs-dso-fig').forEach((btn) => {
      btn.addEventListener('click', () => {
        const o = DEEP_SKY.find((x) => x.id === btn.dataset.id);
        if (o) {
          this.lightboxTrigger = btn;
          this.openLightbox(o);
        }
      });
    });
    if (this.highlightDso) {
      const el = this.bodyEl.querySelector(`[data-dso="${this.highlightDso}"]`);
      el?.classList.add('highlight');
      el?.scrollIntoView({ block: 'center' });
      this.highlightDso = null;
    }
  }

  private dsoCard(o: DeepSkyObject): string {
    const color = DSO_COLORS[o.type] ?? '#9db4cc';
    const base = import.meta.env.BASE_URL;
    const catId = o.m || 'Sgr A*';
    return `
      <div class="obs-dso-card" data-dso="${o.id}">
        <button class="obs-dso-fig" data-id="${o.id}" data-sfx="none" aria-label="Enlarge image of ${o.name}">
          <img loading="lazy" decoding="async" src="${base}deepsky/${o.id}.webp" width="460" height="306"
               alt="${o.name} - ${o.image.via} image" />
          <span class="obs-dso-zoom" aria-hidden="true">⤢</span>
        </button>
        <div class="obs-dso-head">
          <span class="obs-dso-type" style="color:${color};border-color:${color}55">${o.type.toUpperCase()}</span>
          <span class="obs-dso-m">${catId}</span>
        </div>
        <div class="obs-dso-name">${o.name}</div>
        <div class="obs-dso-facts">${fmtLy(o.distanceLy)} · in ${o.constellation}${o.mag !== undefined ? ` · mag ${o.mag}` : ''}</div>
        <p>${o.note}</p>
        <p class="obs-dso-credit">${o.image.via} · <a href="${o.image.url}" target="_blank" rel="noopener">source</a></p>
      </div>
    `;
  }

  /** Full-size image viewer. The high-res file loads only on demand. */
  private openLightbox(o: DeepSkyObject): void {
    this.closeLightbox(false);
    sound.play('click', 0.22);
    const base = import.meta.env.BASE_URL;
    const box = document.createElement('div');
    box.className = 'dso-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', `${o.name} image`);
    box.innerHTML = `
      <div class="dso-lightbox-card">
        <button class="icon-btn dso-lightbox-close" data-sfx="none" aria-label="Close image">
          <svg width="13" height="13" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11"/></svg>
        </button>
        <img src="${base}deepsky/${o.id}-lg.webp" alt="${o.name} - ${o.image.via} image" />
        <div class="dso-lightbox-meta">
          <b>${o.m ? `${o.m} · ` : ''}${o.name}</b> · ${o.type} · ${fmtLy(o.distanceLy)} · ${o.constellation}
          <small>Image: ${o.image.via}. Credit: ${o.image.credit} · <a href="${o.image.url}" target="_blank" rel="noopener">original release</a></small>
        </div>
      </div>
    `;
    box.addEventListener('click', (e) => {
      if (e.target === box) this.closeLightbox(true);
    });
    box.querySelector('.dso-lightbox-close')!.addEventListener('click', () => this.closeLightbox(true));
    this.root.appendChild(box);
    this.lightbox = box;
    // keep Tab inside the viewer: the card behind it leaves the tab order
    this.root.querySelector('.overlay-card')?.setAttribute('inert', '');
    // Escape closes only the lightbox, not the whole Observatory - unless
    // something else (the search palette) has opened on top of it
    this.lightboxKeyHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target;
      if (t instanceof Node && !this.root.contains(t) && t !== document.body) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      this.closeLightbox(true);
    };
    window.addEventListener('keydown', this.lightboxKeyHandler, { capture: true });
    (box.querySelector('.dso-lightbox-close') as HTMLButtonElement).focus();
  }

  private closeLightbox(withSound: boolean): void {
    if (this.lightboxKeyHandler) {
      window.removeEventListener('keydown', this.lightboxKeyHandler, { capture: true });
      this.lightboxKeyHandler = null;
    }
    this.root.querySelector('.overlay-card')?.removeAttribute('inert');
    if (!this.lightbox) return;
    this.lightbox.remove();
    this.lightbox = null;
    this.lightboxTrigger?.focus();
    this.lightboxTrigger = null;
    if (withSound) sound.play('back', 0.3);
  }
}
