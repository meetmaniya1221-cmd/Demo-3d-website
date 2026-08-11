/** Global search palette (Ctrl/Cmd+K): every object and mission, one box.
 *  Selecting an object flies the camera straight there - no menu digging. */
import { ALL_OBJECTS, MISSIONS_SORTED } from '../data/catalog';
import { TYPE_LABEL } from '../data/types';
import { sound } from '../audio';

interface SearchItem {
  id: string;
  kind: 'object' | 'mission';
  name: string;
  detail: string;
  color: string;
  /** lowercase haystacks, in priority order */
  keys: string[];
}

export interface SearchHost {
  selectObject: (id: string) => void;
  openMission: (id: string) => void;
}

const ALIASES: Record<string, string[]> = {
  moon: ['the moon', 'luna'],
  halley: ["halley's comet", 'comet halley', '1p'],
  '67p': ['churyumov', 'gerasimenko', 'rosetta comet'],
  swifttuttle: ['swift tuttle', 'perseids comet'],
  tempeltuttle: ['tempel tuttle', 'leonids comet'],
  halebopp: ['hale bopp'],
  'main-belt': ['asteroid belt', 'belt'],
  'kuiper-belt': ['kuiper'],
  'oort-cloud': ['oort'],
  sun: ['sol', 'the sun', 'star'],
  gonggong: ['2007 or10'],
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
      keys: [norm(o.name), ...(ALIASES[o.id] ?? []).map(norm), norm(detail)],
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
      if (e.target === this.root) this.close();
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
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.isOpen ? this.close() : this.open();
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
    return !this.root.hidden;
  }

  open(): void {
    this.items ??= buildIndex();
    this.restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add('open'));
    this.input.value = '';
    this.refresh();
    this.input.focus();
    sound.play('click', 0.2);
  }

  close(): void {
    this.root.classList.remove('open');
    this.root.hidden = true;
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
          <span class="go">${r.kind === 'mission' ? 'mission' : '→ fly'}</span>
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
    else this.host.selectObject(r.id);
  }
}
