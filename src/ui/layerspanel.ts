/** The View panel: visibility layers grouped like a chart legend. Sits in the
 *  bottom-right corner and opens upward; the 3D scene stays the hero. */
import { AppState, type LayerKey } from '../sim/state';
import { getUnitMode, setUnitMode, type UnitMode } from './format';
import { sound } from '../audio';
import {
  TRAVEL_EFFECT_HINT,
  TRAVEL_EFFECT_LABEL,
  type TravelEffects,
} from '../sim/travel';

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
      { key: 'beltDust', label: 'Asteroid belt', hint: 'main-belt particles' },
      { key: 'kuiperBelt', label: 'Kuiper belt', hint: 'beyond Neptune' },
      { key: 'oortCloud', label: 'Oort cloud', hint: 'conceptual - zoom far out' },
    ],
  },
  {
    title: 'Visualization',
    rows: [
      { key: 'labels', label: 'Object labels' },
      { key: 'constellations', label: 'Constellations' },
      { key: 'deepSky', label: 'Deep sky', hint: 'Messier objects' },
      { key: 'grid', label: 'Reference grid', hint: 'AU rings' },
      { key: 'distanceScale', label: 'Distance readout' },
      { key: 'habitableZone', label: 'Habitable zone' },
      {
        key: 'nearbyStars',
        label: 'Nearby star systems',
        hint: 'real 3D positions - zoom out to see them',
      },
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

    // units: one choice, applied to every formatted distance/temperature
    const unitsGroup = document.createElement('div');
    unitsGroup.className = 'layers-group';
    unitsGroup.innerHTML = '<div class="layers-group-title">Units</div>';
    const unitsRow = document.createElement('div');
    unitsRow.className = 'units-row';
    unitsRow.setAttribute('role', 'group');
    unitsRow.setAttribute('aria-label', 'Measurement units');
    const mkUnit = (mode: UnitMode, label: string) => {
      const b = document.createElement('button');
      b.className = 'chip unit-chip';
      b.dataset.sfx = 'none'; // plays its own tick below - keep the delegated one out
      b.textContent = label;
      b.setAttribute('aria-pressed', String(getUnitMode() === mode));
      b.classList.toggle('active', getUnitMode() === mode);
      b.addEventListener('click', () => {
        if (getUnitMode() === mode) return;
        setUnitMode(mode);
        state.notifyUnitsChanged();
        sound.play('click', 0.18);
        syncUnits();
      });
      return b;
    };
    const metricBtn = mkUnit('metric', 'km · °C');
    const imperialBtn = mkUnit('imperial', 'mi · °F');
    const syncUnits = () => {
      for (const [b, m] of [
        [metricBtn, 'metric'],
        [imperialBtn, 'imperial'],
      ] as const) {
        b.classList.toggle('active', getUnitMode() === m);
        b.setAttribute('aria-pressed', String(getUnitMode() === m));
      }
    };
    unitsRow.append(metricBtn, imperialBtn);
    unitsGroup.appendChild(unitsRow);
    this.panel.appendChild(unitsGroup);

    // Travel effects: the wormhole sequence on very long jumps. It is a piece
    // of cinema over a real flight, so it gets a plain off switch and the note
    // says what it is rather than implying anything travelled faster.
    const travelGroup = document.createElement('div');
    travelGroup.className = 'layers-group';
    travelGroup.innerHTML = '<div class="layers-group-title">Wormhole travel effect</div>';
    const travelRow = document.createElement('div');
    travelRow.className = 'units-row';
    travelRow.setAttribute('role', 'group');
    travelRow.setAttribute('aria-label', 'Long-distance travel transition');
    const travelHint = document.createElement('p');
    travelHint.className = 'layers-note';
    const travelButtons: Array<[HTMLButtonElement, TravelEffects]> = [];
    const syncTravel = () => {
      for (const [b, m] of travelButtons) {
        b.classList.toggle('active', state.travelEffects === m);
        b.setAttribute('aria-pressed', String(state.travelEffects === m));
      }
      travelHint.textContent = TRAVEL_EFFECT_HINT[state.travelEffects];
    };
    for (const mode of ['cinematic', 'reduced', 'off'] as const) {
      const b = document.createElement('button');
      b.className = 'chip unit-chip';
      b.textContent = TRAVEL_EFFECT_LABEL[mode];
      b.addEventListener('click', () => {
        if (state.travelEffects === mode) return;
        state.setTravelEffects(mode);
        sound.play('click', 0.18);
        syncTravel();
      });
      travelButtons.push([b, mode]);
      travelRow.appendChild(b);
    }
    travelGroup.append(travelRow, travelHint);
    this.panel.appendChild(travelGroup);
    syncTravel();

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
