/**
 * Structure view: an interactive cross-section of a body's interior.
 *
 * Renders the classic textbook cutaway - the sphere with a quarter removed -
 * as a 2D canvas: surface-shaded disc, concentric interior layers exposed in
 * the cut wedge, leader-line labels, and an explicit OBSERVED vs MODELLED
 * distinction so users can tell seismology from inference.
 */
import { ALL_OBJECTS, catalogObject } from '../data/catalog';
import type { CatalogObject } from '../data/types';
import { fmtKm } from './format';
import { Overlay } from './overlays';

/** Bodies that have interior data, in a sensible browse order. */
const ORDER = [
  'sun', 'mercury', 'venus', 'earth', 'moon', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune',
  'ceres', 'pluto', 'europa', 'ganymede', 'titan', 'enceladus',
];

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function shade(color: number, f: number): string {
  const r = Math.min(255, (((color >> 16) & 255) * f) | 0);
  const g = Math.min(255, (((color >> 8) & 255) * f) | 0);
  const b = Math.min(255, ((color & 255) * f) | 0);
  return `rgb(${r},${g},${b})`;
}

export class StructureOverlay extends Overlay {
  private currentId = 'earth';
  private bodies: CatalogObject[];
  private pickerEl!: HTMLElement;

  constructor(parent: HTMLElement) {
    super(parent, 'Interior structure', 'structure-title');
    this.bodies = ORDER.map((id) => catalogObject(id)).filter(
      (o): o is CatalogObject => !!o?.interior,
    );
    // any catalog body with interior data but missing from ORDER still shows up
    for (const o of ALL_OBJECTS) {
      if (o.interior && !this.bodies.includes(o)) this.bodies.push(o);
    }
  }

  openFor(id: string): void {
    if (catalogObject(id)?.interior) this.currentId = id;
    this.open();
  }

  protected onOpen(): void {
    this.render();
  }

  private render(): void {
    const def = catalogObject(this.currentId);
    const interior = def?.interior;
    if (!def || !interior) return;

    this.bodyEl.innerHTML = `
      <div class="structure-picker chip-row" role="group" aria-label="Choose a body"></div>
      <div class="structure-main">
        <div class="structure-canvas-wrap"><canvas></canvas></div>
        <div class="structure-side">
          <div class="structure-legend"></div>
          <p class="overlay-note structure-evidence"><b>How we know:</b> ${interior.evidence}</p>
          <p class="fine-print structure-sources">Source: ${interior.sources
            .map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`)
            .join(' · ')}</p>
        </div>
      </div>
    `;

    // body picker chips
    this.pickerEl = this.bodyEl.querySelector('.structure-picker')!;
    for (const b of this.bodies) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = b.name;
      chip.setAttribute('aria-pressed', String(b.id === this.currentId));
      if (b.id === this.currentId) chip.classList.add('active');
      chip.addEventListener('click', () => {
        this.currentId = b.id;
        this.render();
        // the re-render replaced every chip - keep focus on the chosen one
        this.bodyEl
          .querySelectorAll<HTMLButtonElement>('.structure-picker .chip.active')[0]
          ?.focus();
      });
      this.pickerEl.appendChild(chip);
    }

    // legend rows (outermost layer first, matching how you read the drawing)
    const legend = this.bodyEl.querySelector('.structure-legend')!;
    const radiusKm = def.physical.diameterKm / 2;
    const layers = interior.layers;
    legend.innerHTML = [...layers]
      .reverse()
      .map((l, ri) => {
        const i = layers.length - 1 - ri;
        const innerFrac = i === 0 ? 0 : layers[i - 1].outerRadiusFraction;
        const outerKm = l.outerRadiusFraction * radiusKm;
        // thin shells are drawn exaggerated; the legend reports the true value
        const thickKm = l.thicknessKm ?? (l.outerRadiusFraction - innerFrac) * radiusKm;
        const extent =
          i === 0
            ? `centre → ${fmtKm(Math.round(outerKm))}`
            : `${fmtKm(Math.round(thickKm))} thick`;
        return `
          <div class="structure-layer-row">
            <i style="background:${hex(l.color)}"></i>
            <div>
              <div class="layer-name">${l.name}
                <span class="knowledge-tag ${l.knowledge}">${l.knowledge === 'observed' ? 'OBSERVED' : 'MODELLED'}</span>
              </div>
              <div class="layer-extent">${extent}</div>
              <p class="layer-note">${l.note}</p>
            </div>
          </div>`;
      })
      .join('');

    this.draw(def);
  }

  private draw(def: CatalogObject): void {
    const wrap = this.bodyEl.querySelector<HTMLElement>('.structure-canvas-wrap')!;
    const canvas = this.bodyEl.querySelector('canvas')!;
    const cssW = Math.min(430, Math.max(280, wrap.clientWidth || 430));
    const cssH = cssW;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute(
      'aria-label',
      `Cutaway diagram of ${def.name} showing ${def.interior!.layers.map((l) => l.name).join(', ')}`,
    );
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const cx = cssW / 2;
    const cy = cssH / 2;
    const R = cssW * 0.36;
    const layers = def.interior!.layers;

    // the cut wedge opens toward the viewer's lower right
    const wedgeStart = -0.15 * Math.PI;
    const wedgeEnd = 0.42 * Math.PI;

    // --- surface disc (everything outside the wedge) with simple lighting
    const surfaceColor = layers[layers.length - 1].color;
    const grad = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx, cy, R);
    grad.addColorStop(0, shade(surfaceColor, 1.15));
    grad.addColorStop(0.75, shade(surfaceColor, 0.82));
    grad.addColorStop(1, shade(surfaceColor, 0.45));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, wedgeEnd, wedgeStart + Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // --- interior layers inside the wedge, outermost first
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      const r = l.outerRadiusFraction * R;
      const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      g.addColorStop(0, shade(l.color, 1.08));
      g.addColorStop(1, shade(l.color, 0.8));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, wedgeStart, wedgeEnd);
      ctx.closePath();
      ctx.fill();
      // modelled layers get a subtle hatch so inference is visibly different
      if (l.knowledge === 'modelled') {
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(6,8,14,0.16)';
        ctx.lineWidth = 1;
        const innerR = i === 0 ? 0 : layers[i - 1].outerRadiusFraction * R;
        for (let h = -r * 2; h < r * 2; h += 7) {
          ctx.beginPath();
          ctx.moveTo(cx + h, cy - r);
          ctx.lineTo(cx + h + r, cy + r);
          ctx.stroke();
        }
        // re-cover the layer beneath so the hatch only marks this annulus
        if (innerR > 0) {
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, innerR, wedgeStart, wedgeEnd);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // wedge cut faces
    ctx.strokeStyle = 'rgba(240,246,255,0.35)';
    ctx.lineWidth = 1.2;
    for (const a of [wedgeStart, wedgeEnd]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
    // rim
    ctx.strokeStyle = 'rgba(240,246,255,0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // --- leader-line labels along the wedge bisector. Labels right-align
    // against the canvas edge so long names never clip.
    const mid = (wedgeStart + wedgeEnd) / 2;
    const dirX = Math.cos(mid);
    const dirY = Math.sin(mid);
    ctx.font = '600 10px Rajdhani, system-ui, sans-serif';
    const labelX = cssW - 6;
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      const innerFrac = i === 0 ? 0 : layers[i - 1].outerRadiusFraction;
      const midR = ((innerFrac + l.outerRadiusFraction) / 2) * R;
      const ax = cx + dirX * midR;
      const ay = cy + dirY * midR;
      const ey = cy + dirY * (R + 20) + (i - layers.length / 2) * 17;
      const name = l.name.toUpperCase();
      const w = ctx.measureText(name).width;
      const ex = labelX - w - 6;
      ctx.strokeStyle = 'rgba(158,189,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = 'rgba(223,230,244,0.92)';
      ctx.textAlign = 'left';
      ctx.fillText(name, ex + 5, ey + 3);
    }
  }
}
