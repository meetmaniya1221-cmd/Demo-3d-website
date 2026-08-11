/** The View panel: visibility layers grouped like a chart legend. Sits in the
 *  bottom-right corner and opens upward; the 3D scene stays the hero. */
import { AppState, type LayerKey } from '../sim/state';
import { sound } from '../audio';

interface Row {
  key: LayerKey;
  label: string;
  hint?: string;
}

interface Group {
  title: string;
  rows: Row[];
}

const GROUPS: Group[] = [
  {
    title: 'Solar System',
    rows: [
      { key: 'planets', label: 'Planets' },
      { key: 'planetOrbits', label: 'Orbit paths' },
      { key: 'moons', label: 'Major moons', hint: 'shown near their planet' },
    ],
  },
  {
    title: 'Small bodies',
    rows: [
      { key: 'dwarfs', label: 'Dwarf planets & TNOs' },
      { key: 'asteroids', label: 'Asteroids' },
      { key: 'comets', label: 'Comets' },
      { key: 'beltDust', label: 'Belt dust', hint: 'asteroid + Kuiper belts' },
    ],
  },
  {
    title: 'Visualization',
    rows: [
      { key: 'labels', label: 'Object labels' },
      { key: 'constellations', label: 'Constellations' },
      { key: 'grid', label: 'Reference grid', hint: 'AU rings' },
      { key: 'distanceScale', label: 'Distance readout' },
      { key: 'habitableZone', label: 'Habitable zone' },
    ],
  },
];

export class LayersPanel {
  private root: HTMLElement;
  private panel: HTMLElement;
  private button: HTMLButtonElement;
  private checkboxes = new Map<LayerKey, HTMLInputElement>();

  constructor(parent: HTMLElement, state: AppState, onReset: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'view-cluster';

    this.panel = document.createElement('div');
    this.panel.className = 'layers-panel';
    this.panel.setAttribute('aria-label', 'Visibility layers');
    this.panel.hidden = true;
    for (const group of GROUPS) {
      const g = document.createElement('div');
      g.className = 'layers-group';
      g.innerHTML = `<div class="layers-group-title">${group.title}</div>`;
      for (const row of group.rows) {
        const label = document.createElement('label');
        label.className = 'layers-row';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = state.layers[row.key];
        input.addEventListener('change', () => {
          state.setLayer(row.key, input.checked);
          sound.play('click', 0.18);
        });
        const box = document.createElement('span');
        box.className = 'layers-box';
        const text = document.createElement('span');
        text.className = 'layers-text';
        text.innerHTML = row.label + (row.hint ? `<small>${row.hint}</small>` : '');
        label.append(input, box, text);
        g.appendChild(label);
        this.checkboxes.set(row.key, input);
      }
      this.panel.appendChild(g);
    }

    const actions = document.createElement('div');
    actions.className = 'layers-actions';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'chip';
    resetBtn.textContent = 'Reset view';
    resetBtn.setAttribute('aria-label', 'Reset camera to Solar System overview');
    resetBtn.addEventListener('click', () => {
      onReset();
    });
    actions.appendChild(resetBtn);

    this.button = document.createElement('button');
    this.button.className = 'chip layers-toggle';
    this.button.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 1L13 4.2 7 7.4 1 4.2z"/><path d="M1 7l6 3.2L13 7"/><path d="M1 9.8l6 3.2 6-3.2"/></svg>View';
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-label', 'Visibility layers');
    this.button.addEventListener('click', () => this.toggle());

    const bar = document.createElement('div');
    bar.className = 'view-cluster-bar';
    bar.append(this.button, resetBtn);
    this.root.append(this.panel, bar);
    parent.appendChild(this.root);

    state.on('layers', () => this.sync(state));
    state.on('toggles', () => this.sync(state));

    // close when clicking elsewhere
    document.addEventListener('pointerdown', (e) => {
      if (!this.panel.hidden && e.target instanceof Node && !this.root.contains(e.target)) {
        this.setOpen(false);
      }
    });
  }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }

  toggle(): void {
    this.setOpen(this.panel.hidden);
  }

  setOpen(open: boolean): void {
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    this.button.classList.toggle('active', open);
  }

  private sync(state: AppState): void {
    for (const [key, input] of this.checkboxes) input.checked = state.layers[key];
  }
}
