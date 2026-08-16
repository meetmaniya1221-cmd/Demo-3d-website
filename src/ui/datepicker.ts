/**
 * Time-machine date picker: a HUD-styled calendar that replaces the native
 * browser date input, so the time machine speaks the same visual language as
 * the rest of the interface. Pick a day between 1900 and 2100 - and a time
 * of day, because for a planetarium "which night, at what hour" is the whole
 * question - and the simulation jumps there (UTC).
 */
import type { AppState } from '../sim/state';
import { simDateMs } from './format';
import { sound } from '../audio';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export class DatePicker {
  private root: HTMLElement;
  private grid: HTMLElement;
  private title: HTMLElement;
  private yearInput: HTMLInputElement;
  private hourInput!: HTMLInputElement;
  private minInput!: HTMLInputElement;
  private state: AppState;
  private anchor: HTMLElement;
  private viewYear = 2026;
  private viewMonth = 7; // 0-based
  private openFlag = false;
  private hideTimer: number | undefined;

  constructor(parent: HTMLElement, anchor: HTMLElement, state: AppState) {
    this.state = state;
    this.anchor = anchor;
    this.root = document.createElement('div');
    this.root.className = 'datepicker';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'false');
    this.root.setAttribute('aria-label', 'Time machine - pick a date');
    this.root.innerHTML = `
      <div class="datepicker-head">
        <span class="datepicker-tag">TIME MACHINE</span>
        <button class="datepicker-close" data-sfx="back" aria-label="Cancel date selection">
          <svg width="11" height="11" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.6" fill="none" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11"/></svg>
        </button>
      </div>
      <div class="datepicker-nav">
        <button class="dp-nav dp-prev-y" aria-label="Previous year">«</button>
        <button class="dp-nav dp-prev-m" aria-label="Previous month">‹</button>
        <div class="datepicker-title">
          <span class="dp-month"></span>
          <input class="dp-year" type="number" min="${MIN_YEAR}" max="${MAX_YEAR}" aria-label="Year" />
        </div>
        <button class="dp-nav dp-next-m" aria-label="Next month">›</button>
        <button class="dp-nav dp-next-y" aria-label="Next year">»</button>
      </div>
      <div class="datepicker-dow" aria-hidden="true">${DOW.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="datepicker-grid" role="group" aria-label="Days of the month"></div>
      <div class="datepicker-time">
        <span class="dp-time-label">TIME</span>
        <input class="dp-hour" type="number" min="0" max="23" aria-label="Hour (UTC)" />
        <span class="dp-time-sep">:</span>
        <input class="dp-min" type="number" min="0" max="59" step="5" aria-label="Minute (UTC)" />
        <span class="dp-time-utc">UTC</span>
      </div>
      <div class="datepicker-foot">
        <span class="datepicker-range">1900 – 2100</span>
        <button class="dp-today" data-sfx="select">Today</button>
      </div>
    `;
    this.grid = this.root.querySelector('.datepicker-grid')!;
    this.title = this.root.querySelector('.dp-month')!;
    this.yearInput = this.root.querySelector('.dp-year')!;
    this.hourInput = this.root.querySelector('.dp-hour')!;
    this.minInput = this.root.querySelector('.dp-min')!;
    // typing a new time applies immediately to the current sim date, so the
    // planetarium can be dialled to "tonight at 22:00" without re-picking
    // the day
    const applyTime = () => {
      const d = new Date(simDateMs(this.state.simDays));
      this.state.setSimDate(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), this.hourVal(), this.minVal()),
      );
    };
    this.hourInput.addEventListener('change', applyTime);
    this.minInput.addEventListener('change', applyTime);

    this.root.querySelector('.dp-prev-m')!.addEventListener('click', () => this.shiftMonth(-1));
    this.root.querySelector('.dp-next-m')!.addEventListener('click', () => this.shiftMonth(1));
    this.root.querySelector('.dp-prev-y')!.addEventListener('click', () => this.shiftYear(-1));
    this.root.querySelector('.dp-next-y')!.addEventListener('click', () => this.shiftYear(1));
    this.root.querySelector('.datepicker-close')!.addEventListener('click', () => this.close(false));
    this.root.querySelector('.dp-today')!.addEventListener('click', () => {
      this.state.jumpToNow();
      this.close(false);
    });
    this.yearInput.addEventListener('change', () => {
      const y = Math.min(MAX_YEAR, Math.max(MIN_YEAR, Number(this.yearInput.value) || this.viewYear));
      this.viewYear = y;
      this.renderGrid();
    });
    // Escape cancels from anywhere inside the picker; other keys stay local
    // so arrows/space in the year input don't trigger app shortcuts
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close(true);
      e.stopPropagation();
    });

    // dismissal: interacting anywhere else = cancel (same back sound as
    // dialogs). Both pointerdown and click are watched so keyboard-driven
    // activations (Enter on a HUD chip fires click with no pointerdown)
    // also dismiss; close() is idempotent, so the pair never double-fires.
    const dismissOnOutside = (e: Event) => {
      if (!this.openFlag) return;
      if (e.target instanceof Node && !this.root.contains(e.target) && !this.anchor.contains(e.target)) {
        // a dismissal caused by pressing some other button already gets that
        // button's own tone from the app-level delegate - one sound per act
        const viaButton = e.target instanceof Element && !!e.target.closest('button');
        this.close(!viaButton);
      }
    };
    document.addEventListener('pointerdown', dismissOnOutside);
    document.addEventListener('click', dismissOnOutside);

    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.openFlag;
  }

  toggle(): void {
    this.openFlag ? this.close(true) : this.open();
  }

  open(): void {
    window.clearTimeout(this.hideTimer);
    sound.play('click', 0.22);
    const d = new Date(simDateMs(this.state.simDays));
    let y = d.getUTCFullYear();
    y = Math.min(MAX_YEAR, Math.max(MIN_YEAR, y));
    this.viewYear = y;
    this.viewMonth = d.getUTCMonth();
    this.hourInput.value = String(d.getUTCHours()).padStart(2, '0');
    this.minInput.value = String(d.getUTCMinutes()).padStart(2, '0');
    this.openFlag = true;
    this.root.hidden = false;
    // next frame so the opacity transition runs; guard against a close that
    // lands in the same frame
    requestAnimationFrame(() => {
      if (this.openFlag) this.root.classList.add('open');
    });
    this.renderGrid();
    this.grid.querySelector<HTMLButtonElement>('.dp-day.selected')?.focus();
  }

  /** withSound: play the shared dismiss tone (skip when a data-sfx button
   *  or another sound-owning path already covers it). */
  close(withSound: boolean): void {
    if (!this.openFlag) return;
    this.openFlag = false;
    this.root.classList.remove('open');
    if (withSound) sound.play('back', 0.3);
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.root.hidden = true;
    }, 180);
  }

  private hourVal(): number {
    return Math.min(23, Math.max(0, Number(this.hourInput.value) || 0));
  }

  private minVal(): number {
    return Math.min(59, Math.max(0, Number(this.minInput.value) || 0));
  }

  private shiftMonth(delta: number): void {
    let m = this.viewMonth + delta;
    let y = this.viewYear;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    if (y < MIN_YEAR || y > MAX_YEAR) return;
    this.viewMonth = m;
    this.viewYear = y;
    this.renderGrid();
  }

  private shiftYear(delta: number): void {
    const y = this.viewYear + delta;
    if (y < MIN_YEAR || y > MAX_YEAR) return;
    this.viewYear = y;
    this.renderGrid();
  }

  private renderGrid(): void {
    this.title.textContent = MONTHS[this.viewMonth].slice(0, 3).toUpperCase();
    this.yearInput.value = String(this.viewYear);
    const sim = new Date(simDateMs(this.state.simDays));
    const selY = sim.getUTCFullYear();
    const selM = sim.getUTCMonth();
    const selD = sim.getUTCDate();
    const now = new Date();
    const first = new Date(Date.UTC(this.viewYear, this.viewMonth, 1));
    const startDow = (first.getUTCDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(Date.UTC(this.viewYear, this.viewMonth + 1, 0)).getUTCDate();

    let html = '';
    for (let i = 0; i < startDow; i++) html += '<span class="dp-pad"></span>';
    for (let day = 1; day <= daysInMonth; day++) {
      const isSel = this.viewYear === selY && this.viewMonth === selM && day === selD;
      const isToday =
        this.viewYear === now.getUTCFullYear() && this.viewMonth === now.getUTCMonth() && day === now.getUTCDate();
      html += `<button class="dp-day${isSel ? ' selected' : ''}${isToday ? ' today' : ''}" data-day="${day}" data-sfx="select" aria-label="${day} ${MONTHS[this.viewMonth]} ${this.viewYear}"${isSel ? ' aria-current="date"' : ''}>${day}</button>`;
    }
    this.grid.innerHTML = html;
    this.grid.querySelectorAll<HTMLButtonElement>('.dp-day').forEach((b) => {
      b.addEventListener('click', () => {
        const day = Number(b.dataset.day);
        this.state.setSimDate(
          Date.UTC(this.viewYear, this.viewMonth, day, this.hourVal(), this.minVal()),
        );
        this.close(false);
      });
    });
  }
}
