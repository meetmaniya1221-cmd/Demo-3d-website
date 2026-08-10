/** Guided tour: a scripted journey with camera choreography and short lessons. */
import type { AppState } from '../sim/state';

export interface TourHost {
  state: AppState;
  focusBody(id: string, distanceFactor?: number): void;
  focusOverview(): void;
  focusBelt(): void;
}

interface TourStep {
  title: string;
  text: string;
  focus: { kind: 'body'; id: string; distanceFactor?: number } | { kind: 'overview' } | { kind: 'belt' };
  hz?: boolean;
  scale?: 'explorer' | 'true';
  speedIndex?: number;
}

const STEPS: TourStep[] = [
  {
    title: 'One star, eight worlds',
    text: 'Everything you see orbits a single star. The Sun holds 99.8% of all the mass here — its gravity is the invisible thread every planet hangs from. Planets don’t float: they fall around the Sun, moving sideways fast enough to keep missing it forever.',
    focus: { kind: 'overview' },
    speedIndex: 4,
  },
  {
    title: 'The Sun',
    text: 'A ball of plasma 109 times wider than Earth, fusing 600 million tonnes of hydrogen every second. The light leaving its surface right now will pass Earth in 8 minutes and Neptune in 4 hours.',
    focus: { kind: 'body', id: 'sun', distanceFactor: 4.2 },
    speedIndex: 3,
  },
  {
    title: 'Mercury — built for speed',
    text: 'Closest to the Sun, Mercury feels the strongest pull — so it must orbit fastest, completing a year in just 88 days. Watch its orbit: it is visibly stretched (eccentric), not a neat circle.',
    focus: { kind: 'body', id: 'mercury' },
    speedIndex: 4,
  },
  {
    title: 'Venus — the greenhouse warning',
    text: 'Venus is nearly Earth’s twin in size, yet its thick CO₂ atmosphere traps so much heat that its surface stays at 464 °C — hotter than Mercury, despite being twice as far from the Sun. Sunlight gets in; heat can’t get out.',
    focus: { kind: 'body', id: 'venus' },
  },
  {
    title: 'Earth — the right distance',
    text: 'The green band around the Sun is the habitable zone: close enough that water doesn’t freeze, far enough that it doesn’t boil. Earth sits inside it. That single accident of distance is why you exist.',
    focus: { kind: 'body', id: 'earth', distanceFactor: 9 },
    hz: true,
  },
  {
    title: 'The Moon — a locked dance',
    text: 'The Moon spins exactly once per orbit, so the same face always points at Earth — Earth’s gravity locked it in sync long ago. In return, the Moon steadies Earth’s tilt and drives the tides.',
    focus: { kind: 'body', id: 'moon', distanceFactor: 8 },
    hz: false,
  },
  {
    title: 'Mars — the world that lost its air',
    text: 'Half Earth’s size, Mars cooled early and lost its magnetic shield; the solar wind then stripped away most of its atmosphere. The riverbeds it kept tell us it was once warm and wet.',
    focus: { kind: 'body', id: 'mars' },
  },
  {
    title: 'The asteroid belt',
    text: 'Between Mars and Jupiter drift millions of rocky leftovers from the Solar System’s construction. Jupiter’s gravity stirred this region so much that no planet could ever form here. Their total mass is less than our Moon’s.',
    focus: { kind: 'belt' },
    speedIndex: 5,
  },
  {
    title: 'Jupiter — the gravity king',
    text: 'More massive than every other planet combined, with no surface to stand on — just clouds all the way down into liquid hydrogen. Its gravity deflects comets and shapes the orbits of everything nearby.',
    focus: { kind: 'body', id: 'jupiter' },
    speedIndex: 4,
  },
  {
    title: 'Saturn — gravity made visible',
    text: 'Every particle in the rings — from dust to house-sized ice boulders — is on its own orbit, inner ones moving faster than outer ones. The rings span 280,000 km yet average only ~10 metres thick.',
    focus: { kind: 'body', id: 'saturn' },
  },
  {
    title: 'Uranus — knocked sideways',
    text: 'Uranus rolls around the Sun tipped 98° on its side, probably after a giant ancient collision. Each pole endures 42 years of daylight, then 42 years of night.',
    focus: { kind: 'body', id: 'uranus' },
  },
  {
    title: 'Neptune — the far edge',
    text: 'So distant that sunlight takes 4 hours to arrive, Neptune was found by mathematics before telescopes: astronomers computed where an unseen world must be tugging Uranus off course — and there it was. Beyond it lies the Kuiper belt of icy dwarf worlds.',
    focus: { kind: 'body', id: 'neptune' },
  },
  {
    title: 'The real scale of everything',
    text: 'Until now, distances were compressed so you could sightsee. This is the truth: planets are grains of dust separated by oceans of nothing. If the Sun were a basketball, Earth would be a peppercorn 26 metres away — and Neptune almost 800 metres. Look at the labels. That emptiness is the Solar System.',
    focus: { kind: 'overview' },
    scale: 'true',
    speedIndex: 5,
  },
];

export class Tour {
  private root: HTMLElement;
  private stepEl: HTMLElement;
  private titleEl: HTMLElement;
  private textEl: HTMLElement;
  private progressEl: HTMLElement;
  private backBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private host: TourHost;

  constructor(parent: HTMLElement, host: TourHost) {
    this.host = host;
    this.root = document.createElement('section');
    this.root.className = 'tour-card';
    this.root.setAttribute('aria-label', 'Guided tour');
    this.root.innerHTML = `
      <div class="tour-step"></div>
      <h3 class="tour-title"></h3>
      <p class="tour-text"></p>
      <div class="tour-nav">
        <div class="tour-progress" aria-hidden="true"></div>
        <div class="group">
          <button class="chip back">Back</button>
          <button class="chip exit">End tour</button>
          <button class="chip active next">Next</button>
        </div>
      </div>
    `;
    this.stepEl = this.root.querySelector('.tour-step')!;
    this.titleEl = this.root.querySelector('.tour-title')!;
    this.textEl = this.root.querySelector('.tour-text')!;
    this.progressEl = this.root.querySelector('.tour-progress')!;
    this.backBtn = this.root.querySelector('.back')!;
    this.nextBtn = this.root.querySelector('.next')!;
    this.backBtn.addEventListener('click', () => this.go(-1));
    this.nextBtn.addEventListener('click', () => this.go(1));
    this.root.querySelector('.exit')!.addEventListener('click', () => this.end());
    parent.appendChild(this.root);

    for (let i = 0; i < STEPS.length; i++) this.progressEl.appendChild(document.createElement('i'));
  }

  get active(): boolean {
    return this.host.state.tourStep !== null;
  }

  start(): void {
    this.host.state.select(null);
    this.host.state.setTourStep(0);
    this.apply(0);
    this.root.classList.add('open');
  }

  end(): void {
    const st = this.host.state;
    st.setTourStep(null);
    this.root.classList.remove('open');
    // restore a sensible default view
    st.setToggle('showHZ', false);
    st.setScaleMode('explorer');
    st.setSpeedIndex(3);
    this.host.focusOverview();
  }

  private go(dir: 1 | -1): void {
    const cur = this.host.state.tourStep ?? 0;
    const next = cur + dir;
    if (next < 0) return;
    if (next >= STEPS.length) {
      this.end();
      return;
    }
    this.host.state.setTourStep(next);
    this.apply(next);
  }

  private apply(index: number): void {
    const step = STEPS[index];
    this.stepEl.textContent = `Stop ${index + 1} of ${STEPS.length}`;
    this.titleEl.textContent = step.title;
    this.textEl.textContent = step.text;
    this.backBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
    this.nextBtn.textContent = index === STEPS.length - 1 ? 'Finish' : 'Next';
    const dots = this.progressEl.children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('done', i <= index);

    const st = this.host.state;
    if (step.hz !== undefined) st.setToggle('showHZ', step.hz);
    if (step.scale) st.setScaleMode(step.scale);
    if (step.speedIndex !== undefined) st.setSpeedIndex(step.speedIndex);

    if (step.focus.kind === 'overview') this.host.focusOverview();
    else if (step.focus.kind === 'belt') this.host.focusBelt();
    else this.host.focusBody(step.focus.id, step.focus.distanceFactor);
  }
}
