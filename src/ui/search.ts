/** Global search palette (Ctrl/Cmd+K): every object, mission, star and
 *  deep-sky target in one box. Objects fly the camera; stars and DSOs open
 *  the Observatory. */
import { ALL_OBJECTS, MISSIONS_SORTED } from '../data/catalog';
import { NEAR_STARS } from '../data/catalog/stars';
import { DEEP_SKY } from '../data/catalog/deepsky';
import { TYPE_LABEL } from '../data/types';
import { sound } from '../audio';

interface SearchItem {
  id: string;
  kind: 'object' | 'mission' | 'sky';
  name: string;
  detail: string;
  color: string;
  /** lowercase haystacks, in priority order */
  keys: string[];
}

export interface SearchHost {
  selectObject: (id: string) => void;
  openMission: (id: string) => void;
  /** Open the Observatory focused on a star or deep-sky object. */
  openSky: (id: string) => void;
}

const ALIASES: Record<string, string[]> = {
  moon: ['the moon', 'luna'],
  halley: ["halley's comet", 'comet halley', '1p', 'orionids', 'eta aquariids'],
  encke: ['taurids'],
  '67p': ['churyumov', 'gerasimenko', 'rosetta comet'],
  swifttuttle: ['swift tuttle', 'perseids comet', 'perseids'],
  tempeltuttle: ['tempel tuttle', 'leonids comet', 'leonids'],
  halebopp: ['hale bopp'],
  'main-belt': ['asteroid belt', 'belt'],
  'kuiper-belt': ['kuiper'],
  'oort-cloud': ['oort'],
  sun: ['sol', 'the sun', 'star'],
  gonggong: ['2007 or10'],
};

/** NGC cross-identifications for the Messier highlights ("NGC 224" → M31). */
const NGC_IDS: Record<string, string> = {
  m31: 'ngc 224',
  m33: 'ngc 598',
  m42: 'ngc 1976',
  m44: 'ngc 2632',
  m13: 'ngc 6205',
  m22: 'ngc 6656',
  m8: 'ngc 6523',
  m16: 'ngc 6611',
  m1: 'ngc 1952',
  m27: 'ngc 6853',
  m57: 'ngc 6720',
  m51: 'ngc 5194',
  m81: 'ngc 3031',
  m87: 'ngc 4486',
  m104: 'ngc 4594',
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildIndex(): SearchItem[] {
  const items: SearchItem[] = [];
  for (const o of ALL_OBJECTS) {
    const detail = o.category ?? TYPE_LABEL[o.type];
    items.push({
      id: o.id,
      kind: 'object',
      name: o.name,
      detail,
      color: `#${o.color.toString(16).padStart(6, '0')}`,
      keys: [
        norm(o.name),
        ...(o.aliases ?? []).map(norm),
        ...(ALIASES[o.id] ?? []).map(norm),
        norm(detail),
      ],
    });
  }
  for (const m of MISSIONS_SORTED) {
    items.push({
      id: m.id,
      kind: 'mission',
      name: m.name,
      detail: `${m.agency} · ${m.craft} · ${m.launched}`,
      color: '#9db4cc',
      keys: [norm(m.name), norm(m.agency), norm(m.craft)],
    });
  }
  for (const s of NEAR_STARS) {
    items.push({
      id: s.id,
      kind: 'sky',
      name: s.name,
      detail: `Star · ${s.distanceLy < 100 ? s.distanceLy.toFixed(1) : Math.round(s.distanceLy)} light-years`,
      color: '#cdd9ff',
      keys: [norm(s.name), norm(s.spectral), 'star'],
    });
  }
  for (const o of DEEP_SKY) {
    const ngc = NGC_IDS[o.id];
    items.push({
      id: o.id,
      kind: 'sky',
      name: o.m ? `${o.m} · ${o.name}` : o.name,
      detail: `${o.type[0].toUpperCase()}${o.type.slice(1)} · ${o.constellation}`,
      color: '#b9c8f0',
      keys: [
        norm(o.name),
        norm(o.m),
        ...(ngc ? [ngc, ngc.replace(' ', '')] : []),
        norm(o.type),
        norm(o.constellation),
        ...(o.m ? ['messier'] : []),
      ],
    });
  }
  // confirmed planets of the near stars: "Proxima b" opens its star's page
  for (const s of NEAR_STARS) {
    for (const p of s.planets ?? []) {
      items.push({
        id: s.id,
        kind: 'sky',
        name: p.name,
        detail: `${p.status === 'candidate' ? 'Candidate planet' : 'Exoplanet'} of ${s.name}`,
        color: '#a8d8c8',
        keys: [norm(p.name), 'exoplanet', 'planet'],
      });
    }
  }
  return items;
}

function score(item: SearchItem, q: string): number {
  let best = -1;
  for (let k = 0; k < item.keys.length; k++) {
    const key = item.keys[k];
    let s = -1;
    if (key === q) s = 100;
    else if (key.startsWith(q)) s = 80;
    else if (key.split(' ').some((w) => w.startsWith(q))) s = 60;
    else if (key.includes(q)) s = 40;
    if (s > 0) s -= k * 4; // primary name beats alias beats category
    best = Math.max(best, s);
  }
  return best;
}

export class Search {
  private root: HTMLElement;
  private input: HTMLInputElement;
  private list: HTMLElement;
  private items: SearchItem[] | null = null;
  private results: SearchItem[] = [];
  private cursor = 0;
  private host: SearchHost;
  private restoreFocus: HTMLElement | null = null;
  private hideTimer: number | undefined;
  private openFlag = false;

  constructor(parent: HTMLElement, host: SearchHost) {
    this.host = host;
    this.root = document.createElement('div');
    this.root.className = 'search-overlay';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Search the Solar System');
    this.root.innerHTML = `
      <div class="search-card">
        <div class="search-input-row">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.7"/><path d="M10.2 10.2L14 14"/></svg>
          <input type="text" placeholder="Search planets, moons, comets, missions…"
                 aria-label="Search" autocomplete="off" spellcheck="false" />
          <kbd>esc</kbd>
        </div>
        <div class="search-results" role="listbox"></div>
        <div class="search-hint">↑↓ navigate · Enter to fly there · Try “Europa”, “Halley”, “Cassini”, “Kuiper”</div>
      </div>
    `;
    this.input = this.root.querySelector('input')!;
    this.list = this.root.querySelector('.search-results')!;
    parent.appendChild(this.root);

    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close(true);
    });
    this.input.addEventListener('input', () => this.refresh());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.move(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.move(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.commit(this.cursor);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // don't let the global Escape handler also fire (it would deselect
        // the current body or end a journey underneath the palette)
        e.stopPropagation();
        this.close(true);
      }
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.isOpen ? this.close(true) : this.open();
      } else if (
        e.key === '/' &&
        !this.isOpen &&
        !(e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]'))
      ) {
        e.preventDefault();
        this.open();
      }
    });
  }

  get isOpen(): boolean {
    return this.openFlag;
  }

  open(): void {
    this.items ??= buildIndex();
    window.clearTimeout(this.hideTimer);
    this.openFlag = true;
    this.restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add('open'));
    this.input.value = '';
    this.refresh();
    this.input.focus();
    sound.play('click', 0.2);
  }

  /** withSound: play the shared dismiss tone (cancel paths); committing a
   *  result closes silently - the destination plays its own sound. */
  close(withSound = false): void {
    if (withSound && this.openFlag) sound.play('back', 0.3);
    // logically closed NOW - only the visual fade lags behind
    this.openFlag = false;
    this.root.classList.remove('open');
    // let the exit transition play before display:none kicks in
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.root.hidden = true;
    }, 240);
    this.restoreFocus?.focus();
    this.restoreFocus = null;
  }

  private refresh(): void {
    const q = norm(this.input.value);
    const items = this.items!;
    if (!q) {
      // curated defaults: a taste of every category
      const featured = ['earth', 'europa', 'titan', 'pluto', 'halley', 'ceres', 'main-belt'];
      this.results = featured
        .map((id) => items.find((i) => i.kind === 'object' && i.id === id))
        .filter((i): i is SearchItem => !!i);
    } else {
      this.results = items
        .map((item) => ({ item, s: score(item, q) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s || a.item.name.localeCompare(b.item.name))
        .slice(0, 9)
        .map((r) => r.item);
    }
    this.cursor = 0;
    this.render();
  }

  private render(): void {
    if (this.results.length === 0) {
      this.list.innerHTML = `<div class="search-empty">Nothing found. Try a planet, moon, asteroid, comet or mission name.</div>`;
      return;
    }
    this.list.innerHTML = this.results
      .map(
        (r, i) => `
        <button class="search-item${i === this.cursor ? ' active' : ''}" role="option"
                aria-selected="${i === this.cursor}" data-i="${i}">
          <i class="dot" style="background:${r.color}"></i>
          <span class="name">${r.name}</span>
          <span class="detail">${r.detail}</span>
          <span class="go">${r.kind === 'mission' ? 'mission' : r.kind === 'sky' ? 'observatory' : '→ fly'}</span>
        </button>`,
      )
      .join('');
    this.list.querySelectorAll<HTMLButtonElement>('.search-item').forEach((b) => {
      b.addEventListener('click', () => this.commit(Number(b.dataset.i)));
      b.addEventListener('pointerenter', () => {
        this.cursor = Number(b.dataset.i);
        this.paintCursor();
      });
    });
  }

  private paintCursor(): void {
    this.list.querySelectorAll('.search-item').forEach((el, i) => {
      el.classList.toggle('active', i === this.cursor);
      el.setAttribute('aria-selected', String(i === this.cursor));
    });
  }

  private move(dir: number): void {
    if (!this.results.length) return;
    this.cursor = (this.cursor + dir + this.results.length) % this.results.length;
    this.paintCursor();
    this.list.querySelectorAll('.search-item')[this.cursor]?.scrollIntoView({ block: 'nearest' });
  }

  private commit(i: number): void {
    const r = this.results[i];
    if (!r) return;
    this.close();
    if (r.kind === 'mission') this.host.openMission(r.id);
    else if (r.kind === 'sky') this.host.openSky(r.id);
    else this.host.selectObject(r.id);
  }
}
