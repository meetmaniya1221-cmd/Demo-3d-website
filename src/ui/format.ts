/** Number formatting for astronomical quantities. */
import { AU_KM, LIGHT_KM_PER_S } from '../data/bodies';

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function sup(n: number): string {
  return String(Math.abs(n))
    .split('')
    .map((c) => SUP[+c])
    .join('');
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtKm(km: number): string {
  return `${fmtInt(km)} km`;
}

export function fmtMass(kg: number): string {
  const exp = Math.floor(Math.log10(kg));
  const mant = kg / 10 ** exp;
  return `${mant.toFixed(2)} × 10${sup(exp)} kg`;
}

export function fmtAU(au: number, digits = 2): string {
  return `${au.toFixed(digits)} AU`;
}

export function fmtTempC(c: number): string {
  return `${c > 0 ? '+' : ''}${Math.round(c)} °C`;
}

/** Hours → friendly duration ("23.9 h", "243 days"). */
export function fmtHours(hours: number): string {
  const h = Math.abs(hours);
  if (h < 72) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(h / 24 >= 100 ? 0 : 1)} days`;
}

/** Days → friendly duration ("88 days", "11.9 years"). */
export function fmtDays(days: number): string {
  if (days < 1000) return `${days.toFixed(days < 10 ? 1 : 0)} days`;
  return `${(days / 365.25).toFixed(1)} years`;
}

/**
 * Distance with an automatically chosen readable unit:
 * "384,400 km" → "57.9 million km" → "1.52 AU".
 */
export function fmtDistanceAuto(au: number): string {
  const km = au * AU_KM;
  if (au >= 0.35) return `${au.toFixed(au >= 10 ? 1 : 2)} AU`;
  if (km >= 1e6) return `${(km / 1e6).toFixed(km >= 2e7 ? 0 : 1)} million km`;
  return `${fmtInt(km)} km`;
}

/** Light travel time for a distance in AU. */
export function fmtLightTime(au: number): string {
  const sec = (au * AU_KM) / LIGHT_KM_PER_S;
  if (sec < 90) return `${sec.toFixed(0)} s`;
  const min = sec / 60;
  if (min < 90) return `${min.toFixed(1)} min`;
  return `${(min / 60).toFixed(1)} h`;
}

/** Simulation date line, e.g. "10 Aug 2026". */
export function fmtSimDate(daysSinceJ2000: number): string {
  const ms = Date.UTC(2000, 0, 1, 12) + daysSinceJ2000 * 86_400_000;
  const d = new Date(ms);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
