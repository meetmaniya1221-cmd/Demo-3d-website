/**
 * The NEARBY SYSTEMS rail.
 *
 * A card per destination and nothing else: distance, star type, how many
 * planets are known. Everything deeper - stellar parameters, orbits,
 * discovery history - lives in the information panel that opens when you get
 * there, because a launcher that tries to be a dashboard stops being a
 * launcher.
 */
import {
  STAR_SYSTEMS,
  confirmedPlanets,
  primaryStar,
  type StarSystem,
} from '../data/catalog/starsystems';
import { LY_PER_PC, SOL_ID } from '../sim/interstellar';
import { sound } from '../audio';

export interface SystemsHost {
  /** Travel to a system (or back to the Sun). */
  goToSystem: (id: string) => void;
  /** Which system the camera is in right now. */
  activeSystem: () => string;
  /** Fired before the rail opens, so a sibling panel can step aside. */
  onOpen?: () => void;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function planetCount(sys: StarSystem): string {
  const confirmed = confirmedPlanets(sys).length;
  const other = sys.planets.length - confirmed;
  if (confirmed === 0 && other === 0) return 'No planets found';
  const base = `${confirmed} confirmed planet${confirmed === 1 ? '' : 's'}`;
  return other > 0 ? `${base} · ${other} unconfirmed` : base;
}

/** Spectral types of every star in the system, e.g. "G2 V + K1 V + M5.5 Ve". */
function starTypes(sys: StarSystem): string {
  return sys.stars.map((s) => s.spectral).join(' + ');
}

export class SystemsPanel {
  private root: HTMLElement;
  private listEl: HTMLElement;
  private host: SystemsHost;

  constructor(parent: HTMLElement, host: SystemsHost) {
    this.host = host;
    this.root = document.createElement('aside');
    this.root.className = 'systems-panel';
    this.root.inert = true;
    this.root.setAttribute('aria-label', 'Nearby star systems');
    this.root.innerHTML = `
      <div class="systems-head">
        <div class="systems-title">Nearby systems</div>
        <button class="icon-btn close" aria-label="Close nearby systems">
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11"/></svg>
        </button>
      </div>
      <div class="systems-list" role="list"></div>
      <p class="systems-foot">Distances from Gaia DR3 parallaxes. Planets from the NASA Exoplanet Archive.</p>
    `;
    this.listEl = this.root.querySelector('.systems-list')!;
    this.root.querySelector('.close')!.addEventListener('click', () => this.close(true));
    parent.appendChild(this.root);
    this.render();
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  open(): void {
    this.host.onOpen?.();
    this.render();
    this.root.inert = false;
    this.root.classList.add('open');
    sound.play('click', 0.2);
  }

  close(withSound = false): void {
    if (withSound && this.isOpen) sound.play('back', 0.25);
    this.root.classList.remove('open');
    this.root.inert = true;
  }

  toggle(): void {
    this.isOpen ? this.close(true) : this.open();
  }

  /** Repaint the active marker without rebuilding the list. */
  syncActive(): void {
    const active = this.host.activeSystem();
    this.listEl.querySelectorAll<HTMLElement>('.system-card').forEach((el) => {
      const on = el.dataset.system === active;
      el.classList.toggle('active', on);
      el.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }

  private card(
    id: string,
    name: string,
    distance: string,
    type: string,
    planets: string,
    color: number,
  ): string {
    const active = this.host.activeSystem() === id;
    return `
      <button class="system-card${active ? ' active' : ''}" role="listitem"
              data-system="${esc(id)}" aria-current="${active ? 'true' : 'false'}">
        <i class="dot" style="background:#${color.toString(16).padStart(6, '0')}"></i>
        <span class="system-name">${esc(name)}</span>
        <span class="system-dist">${esc(distance)}</span>
        <span class="system-meta">${esc(type)}</span>
        <span class="system-planets">${esc(planets)}</span>
      </button>
    `;
  }

  private render(): void {
    const parts: string[] = [
      this.card(
        SOL_ID,
        'Solar System',
        'Home · 0 ly',
        'G2 V',
        '8 planets · 5 dwarf planets',
        0xffc46b,
      ),
    ];
    for (const sys of [...STAR_SYSTEMS].sort((a, b) => a.distanceLy - b.distanceLy)) {
      parts.push(
        this.card(
          sys.id,
          sys.name,
          `${sys.distanceLy.toFixed(2)} ly · ${(sys.distanceLy / LY_PER_PC).toFixed(2)} pc`,
          `${starTypes(sys)}${sys.stars.length > 1 ? '' : ''} · ${primaryStar(sys).tempK ? `${Math.round(primaryStar(sys).tempK!)} K` : ''}`,
          planetCount(sys),
          sys.color,
        ),
      );
    }
    this.listEl.innerHTML = parts.join('');
    this.listEl.querySelectorAll<HTMLButtonElement>('.system-card').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.system!;
        if (id === this.host.activeSystem()) return;
        this.host.goToSystem(id);
      }),
    );
  }
}
