/** Boot sequence: WebGL check → texture generation → app → landing screen. */
import './style.css';
import { generateAllTextures } from './scene/textures';
import { App } from './app';

declare global {
  interface Window {
    __orrery?: Record<string, unknown>;
  }
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function showWebglError(root: HTMLElement): void {
  root.innerHTML = `
    <div class="webgl-fail">
      <div>
        <h1>Orrery needs WebGL</h1>
        <p>Your browser or device blocked 3D rendering. Try a recent version of Chrome,
        Edge, Firefox or Safari with hardware acceleration enabled.</p>
      </div>
    </div>
  `;
}

function buildLanding(root: HTMLElement, app: App): void {
  const landing = document.createElement('div');
  landing.id = 'landing';
  landing.innerHTML = `
    <div class="landing-kicker">An interactive journey</div>
    <h1 class="landing-title">ORRERY</h1>
    <p class="landing-sub">Fly between the planets, bend time, and discover how big — and how empty — the Solar System really is.</p>
    <div class="landing-actions">
      <button class="btn primary" data-act="explore">Explore freely</button>
      <button class="btn" data-act="tour">Take the guided tour</button>
    </div>
    <div class="landing-hint">Drag to orbit &nbsp;·&nbsp; Scroll or pinch to zoom &nbsp;·&nbsp; Click any world to visit it</div>
  `;
  root.appendChild(landing);

  const dismiss = (withTour: boolean) => {
    landing.classList.add('hidden');
    setTimeout(() => landing.remove(), 1000);
    app.enter(withTour);
  };
  landing.querySelector('[data-act="explore"]')!.addEventListener('click', () => dismiss(false));
  landing.querySelector('[data-act="tour"]')!.addEventListener('click', () => dismiss(true));
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  const bootEl = document.getElementById('boot')!;
  const fill = document.getElementById('boot-fill')!;
  const msg = document.getElementById('boot-msg')!;

  if (!webglAvailable()) {
    bootEl.remove();
    showWebglError(root);
    return;
  }

  const textures = await generateAllTextures((done, total, label) => {
    fill.style.width = `${Math.round((done / total) * 100)}%`;
    msg.textContent = label;
  });

  document.body.classList.add('pre-entry');
  const app = new App(root, textures);
  window.__orrery = app.debug;

  buildLanding(root, app);
  bootEl.classList.add('done');
  setTimeout(() => bootEl.remove(), 800);
}

boot().catch((err) => {
  console.error('Orrery failed to start:', err);
  const msg = document.getElementById('boot-msg');
  if (msg) msg.textContent = 'Something went wrong while starting. Please reload.';
});
