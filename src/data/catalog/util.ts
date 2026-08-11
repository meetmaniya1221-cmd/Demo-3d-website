/** Helpers for building catalog orbital elements. */
import type { OrbitalElements } from '../bodies';

const J2000_JD = 2451545.0;

export interface PerihelionElements {
  a: number; // semi-major axis, AU
  e: number;
  i: number; // deg
  node: number; // longitude of ascending node Ω, deg
  argPeri: number; // argument of perihelion ω, deg
  /** Julian date of a (any) perihelion passage. */
  tpJD: number;
  periodDays: number;
}

/**
 * Convert perihelion-passage elements (the form JPL SBDB publishes for
 * comets and asteroids) into the mean-longitude form `keplerPosition` uses.
 */
export function elementsFromPerihelion(el: PerihelionElements): OrbitalElements {
  const wBar = (el.node + el.argPeri) % 360;
  const M0 = ((360 * (J2000_JD - el.tpJD)) / el.periodDays) % 360;
  return {
    a: el.a,
    e: el.e,
    i: el.i,
    omega: el.node,
    wBar,
    L0: (((M0 + wBar) % 360) + 360) % 360,
    periodDays: el.periodDays,
  };
}
