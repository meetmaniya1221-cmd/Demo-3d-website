/** Atlas: the expandable hierarchy of the Solar System as a browsable tree.
 *  Sun → planets → their moons, then dwarf planets, TNOs, asteroids, comets
 *  and regions. Click any row to fly there. */
import { ALL_OBJECTS, MOONS_BY_PARENT, catalogObject } from '../data/catalog';
import type { CatalogObject } from '../data/types';
import type { AppState } from '../sim/state';
import { sound } from '../audio';

function dot(def: CatalogObject): string {
  return `<i class="dot" style="background:#${def.color.toString(16).padStart(6, '0')}"></i>`;
}

export class Atlas {
  private root: HTMLElement;
  private listEl: HTMLElement;
  private state: AppState;
  private expanded = new Set<string>(['earth']);
  private built = false;

  constructor(parent: HTMLElement, state: AppState) {
    this.state = state;
    this.root = document.createElement('aside');
    this.root.className = 'atlas';
    this.root.inert = true;
    this.root.setAttribute('aria-label', 'Solar System atlas');
    this.root.innerHTML = `
      <div class="atlas-head">
        <div class="atlas-title">Atlas</div>
        <button class="icon-btn close" aria-label="Close atlas">
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11"/></svg>
        </button>
      </div>
      <div class="atlas-list" role="tree"></div>
    `;
    this.listEl = this.root.querySelector('.atlas-list')!;
    this.root.querySelector('.close')!.addEventListener('click', () => this.close());
    parent.appendChild(this.root);

    state.on('select', (id) => {
      if (!this.isOpen || !id) return;
      // keep the tree in sync: expand the branch that owns the selection
      const def = catalogObject(id);
      if (def?.parent && MOONS_BY_PARENT.has(def.parent)) this.expanded.add(def.parent);
      this.render();
    });
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  open(): void {
    if (!this.built) {
      this.built = true;
      this.render();
    }
    this.root.inert = false;
    this.root.classList.add('open');
    sound.play('click', 0.2);
  }

  close(): void {
    this.root.classList.remove('open');
    this.root.inert = true;
  }

  toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  private row(def: CatalogObject, depth: number, childCount = 0): string {
    const expandable = childCount > 0;
    const isOpen = this.expanded.has(def.id);
    const selected = this.state.selectedId === def.id;
    return `
      <div class="atlas-row${selected ? ' selected' : ''}" style="--depth:${depth}" role="treeitem" ${expandable ? `aria-expanded="${isOpen}"` : ''}>
        ${
          expandable
            ? `<button class="atlas-caret${isOpen ? ' open' : ''}" data-expand="${def.id}" aria-label="${isOpen ? 'Collapse' : 'Expand'} ${def.name} system">
                 <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M2 0l4 4-4 4z"/></svg>
               </button>`
            : '<span class="atlas-caret-space"></span>'
        }
        <button class="atlas-item" data-go="${def.id}">
          ${dot(def)}<span class="name">${def.name}</span>
          <span class="type">${childCount > 0 ? `${childCount} moon${childCount > 1 ? 's' : ''} shown` : (def.category ?? '')}</span>
        </button>
      </div>
    `;
  }

  private section(title: string, note?: string): string {
    return `<div class="atlas-section">${title}${note ? `<small>${note}</small>` : ''}</div>`;
  }

  private render(): void {
    const parts: string[] = [];
    const sun = catalogObject('sun')!;
    parts.push(this.section('The star'));
    parts.push(this.row(sun, 0));

    parts.push(this.section('Planets', 'and their major moons'));
    for (const o of ALL_OBJECTS) {
      if (o.type !== 'planet') continue;
      const moons = MOONS_BY_PARENT.get(o.id) ?? [];
      parts.push(this.row(o, 0, moons.length));
      if (this.expanded.has(o.id)) {
        for (const m of moons) parts.push(this.row(m, 1));
      }
    }

    parts.push(this.section('Dwarf planets', 'recognised by the IAU'));
    for (const o of ALL_OBJECTS) {
      if (o.type !== 'dwarf') continue;
      const moons = MOONS_BY_PARENT.get(o.id) ?? [];
      parts.push(this.row(o, 0, moons.length));
      if (this.expanded.has(o.id)) {
        for (const m of moons) parts.push(this.row(m, 1));
      }
    }

    parts.push(this.section('Beyond Neptune', 'dwarf-planet candidates'));
    for (const o of ALL_OBJECTS) if (o.type === 'tno') parts.push(this.row(o, 0));

    parts.push(this.section('Asteroids'));
    for (const o of ALL_OBJECTS) if (o.type === 'asteroid') parts.push(this.row(o, 0));

    parts.push(this.section('Comets'));
    for (const o of ALL_OBJECTS) if (o.type === 'comet') parts.push(this.row(o, 0));

    parts.push(this.section('Regions'));
    for (const o of ALL_OBJECTS) if (o.type === 'region') parts.push(this.row(o, 0));

    this.listEl.innerHTML = parts.join('');

    this.listEl.querySelectorAll<HTMLButtonElement>('[data-expand]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.expand!;
        this.expanded.has(id) ? this.expanded.delete(id) : this.expanded.add(id);
        this.render();
      }),
    );
    this.listEl.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        this.state.select(b.dataset.go!);
      }),
    );
  }
}
