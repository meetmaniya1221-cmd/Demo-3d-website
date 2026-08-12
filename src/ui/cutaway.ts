/**
 * The 3D cross-section view: an orbitable cutaway of a body's interior with
 * callouts that stay pinned to the layers they name.
 *
 * The geometry lives in scene/cutaway.ts; this file owns the room around it -
 * the layer list, the controls, and the labels. Labels are DOM (so they stay
 * crisp and selectable and scale down on phones) but they are positioned from
 * real world-space anchors projected every frame, with leader lines drawn on
 * a transparent canvas, so they track the model as it turns and drop out when
 * the body itself gets in the way.
 */
import * as THREE from 'three';
import { catalogObject } from '../data/catalog';
import type { CatalogObject } from '../data/types';
import { CutawayScene, MAX_CUT } from '../scene/cutaway';
import { fmtKm } from './format';
import { Overlay } from './overlays';
import { interiorBodies } from './structure';

interface LabelEl {
  el: HTMLButtonElement;
  index: number;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  visible: boolean;
}

const REVEAL_SECONDS = 1.1;

export class CutawayOverlay extends Overlay {
  private currentId = 'sun';
  private scene: CutawayScene | null = null;
  private canvas!: HTMLCanvasElement;
  private lineCanvas!: HTMLCanvasElement;
  private stage!: HTMLElement;
  private tabsEl!: HTMLElement;
  private tabs = new Map<string, HTMLButtonElement>();
  private labelWrap!: HTMLElement;
  private sideEl!: HTMLElement;
  private cutSlider!: HTMLInputElement;
  private rotateBtn!: HTMLButtonElement;
  private labels: LabelEl[] = [];
  private raf = 0;
  private lastT = 0;
  private reveal = 0;
  private lastW = 0;
  private lastH = 0;
  private projected = new THREE.Vector3();
  private onBodyChange?: (id: string) => void;

  constructor(parent: HTMLElement, onBodyChange?: (id: string) => void) {
    super(parent, '3D cross-section', 'cutaway-title');
    this.onBodyChange = onBodyChange;
    // it opens on top of the 2D structure view it was launched from, so
    // Escape drops back to that view instead of all the way to the scene
    this.root.classList.add('overlay-cutaway');
    // built once: the WebGL canvas must survive re-opens, so only the side
    // panel and the labels are re-rendered per body
    this.bodyEl.innerHTML = `
      <div class="cut3d-tabs chip-row" role="group" aria-label="Choose a body"></div>
      <div class="cut3d">
        <div class="cut3d-side"></div>
        <div class="cut3d-stage">
          <canvas class="cut3d-canvas" aria-label="Interactive 3D cross-section - drag to rotate, scroll to zoom"></canvas>
          <canvas class="cut3d-lines" aria-hidden="true"></canvas>
          <div class="cut3d-labels"></div>
          <div class="cut3d-hint">Drag to rotate · scroll to zoom · tap a layer to isolate it</div>
          <div class="cut3d-controls">
            <label class="cut3d-cut">
              <span class="u-label">Cut</span>
              <input type="range" min="0" max="100" value="100" aria-label="How far the section is opened" />
            </label>
            <button class="chip cut3d-rotate" aria-pressed="true">Auto-rotate</button>
            <button class="chip cut3d-reset">Reset view</button>
          </div>
        </div>
      </div>
    `;
    this.tabsEl = this.bodyEl.querySelector('.cut3d-tabs')!;
    this.stage = this.bodyEl.querySelector('.cut3d-stage')!;
    this.canvas = this.bodyEl.querySelector('.cut3d-canvas')!;
    this.lineCanvas = this.bodyEl.querySelector('.cut3d-lines')!;
    this.labelWrap = this.bodyEl.querySelector('.cut3d-labels')!;
    this.sideEl = this.bodyEl.querySelector('.cut3d-side')!;
    this.cutSlider = this.bodyEl.querySelector('.cut3d-cut input')!;
    this.rotateBtn = this.bodyEl.querySelector('.cut3d-rotate')!;

    this.cutSlider.addEventListener('input', () => {
      if (!this.scene) return;
      // a manual cut ends the opening animation
      this.reveal = REVEAL_SECONDS;
      this.scene.cutAngle = (Number(this.cutSlider.value) / 100) * MAX_CUT;
    });
    this.rotateBtn.addEventListener('click', () => {
      if (!this.scene) return;
      this.scene.autoRotate = !this.scene.autoRotate;
      this.rotateBtn.setAttribute('aria-pressed', String(this.scene.autoRotate));
      this.rotateBtn.classList.toggle('active', this.scene.autoRotate);
    });
    this.bodyEl.querySelector('.cut3d-reset')!.addEventListener('click', () => {
      this.scene?.resetView();
      this.reveal = REVEAL_SECONDS;
      this.cutSlider.value = '100';
      if (this.scene) this.scene.cutAngle = MAX_CUT;
    });
    // dragging the model should not also spin the auto-rotation
    this.canvas.addEventListener('pointerdown', () => {
      if (this.scene?.autoRotate) {
        this.scene.autoRotate = false;
        this.rotateBtn.setAttribute('aria-pressed', 'false');
        this.rotateBtn.classList.remove('active');
      }
    });
    this.rotateBtn.classList.add('active');

    // Body tabs. Picking one swaps the model outright - the previous body's
    // geometry, materials and texture are released and the new one is built -
    // so the viewer only ever holds the body you selected.
    for (const b of interiorBodies()) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = b.name;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => this.showBody(b.id));
      this.tabsEl.appendChild(chip);
      this.tabs.set(b.id, chip);
    }
  }

  /** Open on a specific body (any object with a published interior model). */
  openFor(id: string): void {
    if (catalogObject(id)?.interior) this.currentId = id;
    this.open();
  }

  /** The body currently loaded in the viewer. */
  get bodyId(): string {
    return this.currentId;
  }

  /** Diagnostic: which body is loaded, and how much geometry is in the scene. */
  get info(): { body: string; layers: number; objects: number } {
    const c = this.scene?.contents ?? { layers: 0, objects: 0 };
    return { body: this.currentId, ...c };
  }

  protected onOpen(): void {
    // nothing to draw without an interior model, and no reason to spin a
    // render loop over an empty scene
    if (!this.showBody(this.currentId)) return;
    this.lastT = performance.now();
    cancelAnimationFrame(this.raf);
    const loop = () => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  /**
   * Load a body into the viewer. This is a real model switch: setBody tears the
   * previous body down completely before building the new one, so the scene
   * never holds two bodies at once.
   */
  private showBody(id: string): boolean {
    const def = catalogObject(id);
    if (!def?.interior) return false;
    this.currentId = id;
    if (!this.scene) this.scene = new CutawayScene(this.canvas);
    this.scene.setBody(def, `${import.meta.env.BASE_URL}textures/${def.texture?.file ?? `${def.id}.webp`}`);
    this.scene.resetView();
    this.scene.autoRotate = true;
    this.rotateBtn.setAttribute('aria-pressed', 'true');
    this.rotateBtn.classList.add('active');
    this.cutSlider.value = '100';
    this.renderSide(def);
    this.buildLabels(def);
    for (const [bid, chip] of this.tabs) {
      const on = bid === id;
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', String(on));
    }
    // the section swings open on entry, so the cutaway reads as a 3D cut
    this.reveal = 0;
    this.scene.cutAngle = 0;
    this.onBodyChange?.(id);
    return true;
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    super.close();
  }

  private renderSide(def: CatalogObject): void {
    const interior = def.interior!;
    const radiusKm = def.physical.diameterKm / 2;
    const rows = [...interior.layers]
      .map((l, i) => {
        const innerFrac = i === 0 ? 0 : interior.layers[i - 1].outerRadiusFraction;
        const outerKm = l.outerRadiusFraction * radiusKm;
        const thickKm = l.thicknessKm ?? (l.outerRadiusFraction - innerFrac) * radiusKm;
        const extent =
          i === 0
            ? `centre → ${fmtKm(Math.round(outerKm))}`
            : `${fmtKm(Math.round(thickKm))} thick`;
        return `
          <button class="cut3d-row" data-i="${i}" aria-pressed="false">
            <i style="background:#${l.color.toString(16).padStart(6, '0')}"></i>
            <span>
              <b>${l.name}</b>
              <small>${extent}</small>
              <em>${l.note}</em>
            </span>
          </button>`;
      })
      .reverse()
      .join('');
    this.sideEl.innerHTML = `
      <div class="cut3d-head">
        <div class="cut3d-name">${def.name}</div>
        <div class="cut3d-kicker">${def.category}</div>
      </div>
      <div class="cut3d-rows">${rows}</div>
      <p class="overlay-note"><b>How we know:</b> ${interior.evidence}</p>
      <p class="fine-print">Layer model: ${interior.sources
        .map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`)
        .join(' · ')}</p>
    `;
    for (const row of Array.from(this.sideEl.querySelectorAll<HTMLButtonElement>('.cut3d-row'))) {
      row.addEventListener('click', () => this.toggleHighlight(Number(row.dataset.i)));
    }
  }

  private buildLabels(def: CatalogObject): void {
    this.labelWrap.innerHTML = '';
    this.labels = [];
    def.interior!.layers.forEach((l, i) => {
      const el = document.createElement('button');
      el.className = 'cut3d-label';
      el.dataset.i = String(i);
      el.innerHTML = `<b>${l.name}</b>${l.tagline ? `<small>${l.tagline}</small>` : ''}`;
      el.addEventListener('click', () => this.toggleHighlight(i));
      this.labelWrap.appendChild(el);
      this.labels.push({ el, index: i, x: 0, y: 0, anchorX: 0, anchorY: 0, visible: false });
    });
  }

  private toggleHighlight(i: number): void {
    if (!this.scene) return;
    const next = this.scene.highlighted === i ? null : i;
    this.scene.setHighlight(next);
    for (const row of Array.from(this.sideEl.querySelectorAll<HTMLButtonElement>('.cut3d-row'))) {
      const on = Number(row.dataset.i) === next;
      row.classList.toggle('active', on);
      row.setAttribute('aria-pressed', String(on));
    }
    this.labels.forEach((lab, k) => lab.el.classList.toggle('active', k === next));
  }

  /* ------------------------------------------------------------- frame -- */

  private frame(): void {
    const scene = this.scene;
    if (!scene) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    // size follows the stage; the label canvas tracks it pixel for pixel
    const w = Math.max(200, this.stage.clientWidth);
    const h = Math.max(200, this.stage.clientHeight);
    if (w !== this.lastW || h !== this.lastH) {
      this.lastW = w;
      this.lastH = h;
      scene.resize(w, h);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.lineCanvas.width = Math.round(w * dpr);
      this.lineCanvas.height = Math.round(h * dpr);
      this.lineCanvas.style.width = `${w}px`;
      this.lineCanvas.style.height = `${h}px`;
    }

    // opening sweep
    if (this.reveal < REVEAL_SECONDS) {
      this.reveal = Math.min(REVEAL_SECONDS, this.reveal + dt);
      const t = this.reveal / REVEAL_SECONDS;
      const eased = 1 - Math.pow(1 - t, 3);
      scene.cutAngle = MAX_CUT * eased;
      this.cutSlider.value = String(Math.round(eased * 100));
    }

    scene.update(dt);
    this.layoutLabels(w, h);
  }

  /** Project every anchor, place its callout, then draw the leader lines. */
  private layoutLabels(w: number, h: number): void {
    const scene = this.scene!;
    const anchors = scene.anchors();
    const narrow = w < 520;
    const gap = narrow ? 34 : 44;

    // the body's own screen position decides which side the column lives on,
    // so callouts never sit on top of the model
    this.projected.set(0, 0, 0).project(scene.camera);
    const bodyX = (this.projected.x * 0.5 + 0.5) * w;
    const columnSide = bodyX < w * 0.52 ? 1 : -1;

    const placed: LabelEl[] = [];
    for (let i = 0; i < anchors.length && i < this.labels.length; i++) {
      const a = anchors[i];
      const lab = this.labels[i];
      this.projected.copy(a.position).project(scene.camera);
      const behind = this.projected.z > 1;
      const sx = (this.projected.x * 0.5 + 0.5) * w;
      const sy = (-this.projected.y * 0.5 + 0.5) * h;
      const visible = !behind && a.visible;
      lab.visible = visible;
      lab.anchorX = sx;
      lab.anchorY = sy;
      if (!visible) {
        lab.el.classList.remove('shown');
        continue;
      }
      // push the callout clear of the body, away from the centre line, then
      // keep it inside the stage - a clipped callout is worse than a short one
      const width = lab.el.offsetWidth || 120;
      const side = columnSide;
      // the column is flush with the stage edge and the leader does the
      // reaching, so a long layer name can never run off the canvas
      lab.x = side > 0 ? w - width - 10 : width + 10;
      lab.y = Math.max(20, Math.min(h - 20, sy));
      lab.el.dataset.side = side > 0 ? 'right' : 'left';
      placed.push(lab);
    }

    // Lay the column out outermost-layer-first and evenly spaced, centred on
    // the anchors it serves. Because the anchors themselves run outer→inner
    // along one radius, keeping that order means the leader lines fan out
    // without ever crossing each other.
    placed.sort((a, b) => b.index - a.index);
    if (placed.length) {
      const centre = placed.reduce((acc, p) => acc + p.anchorY, 0) / placed.length;
      const span = (placed.length - 1) * gap;
      let top = centre - span / 2;
      top = Math.max(22, Math.min(h - span - 22, top));
      placed.forEach((p, i) => (p.y = top + i * gap));
    }

    const ctx = this.lineCanvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;

    for (const lab of placed) {
      const right = lab.el.dataset.side === 'right';
      lab.el.classList.add('shown');
      lab.el.style.transform = `translate(${Math.round(lab.x)}px, ${Math.round(lab.y)}px)`;
      // leader: out from the anchor, then a short horizontal run to the card
      const elbowX = lab.x + (right ? -12 : 12);
      ctx.strokeStyle = lab.el.classList.contains('active')
        ? 'rgba(102,224,255,0.85)'
        : 'rgba(150,196,240,0.45)';
      ctx.beginPath();
      ctx.moveTo(lab.anchorX, lab.anchorY);
      ctx.lineTo(elbowX, lab.y);
      ctx.lineTo(lab.x + (right ? -4 : 4), lab.y);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(lab.anchorX, lab.anchorY, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
