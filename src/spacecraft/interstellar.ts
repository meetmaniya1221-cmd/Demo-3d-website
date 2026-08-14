/**
 * Interstellar cruise for the spacecraft.
 *
 * The vessel does not teleport and it does not enter a different scene. It
 * flies the real straight line between two stars, and every number the panel
 * shows is the real one: the distance in light-years, the distance covered so
 * far in kilometres, the years the crossing takes at the cruise velocity the
 * pilot chose. The only thing being compressed is how long you have to sit
 * there watching it, and the compression factor is printed next to the clock
 * rather than hidden inside it.
 *
 * That honesty is the whole point of the mode. At 10% of light speed - a
 * velocity nothing humans have built comes within three orders of magnitude of
 * - Proxima Centauri is a forty-two-year one-way trip. The panel says so while
 * you make it in twenty seconds.
 *
 * Position is tracked in absolute light-years from the Sun, not in scene units,
 * because scene units for interstellar distance are compressed and the origin
 * moves halfway across. Converting to scene units happens at the last moment,
 * every frame, against whichever star the scene is currently centred on.
 */
import * as THREE from 'three';
import { KM_PER_LY, positionLyOf, unitsPerLy } from '../sim/interstellar';

/** Cruise velocities as a fraction of light speed. */
export const CRUISE_FRACTIONS = [0.01, 0.05, 0.1, 0.2] as const;
export const DEFAULT_CRUISE_INDEX = 2;

/** How each velocity compares to something real. */
export const CRUISE_NOTES: Record<number, string> = {
  0.01: '2,998 km/s - about 15× the fastest object humans have ever flown',
  0.05: '14,990 km/s - beyond any propulsion concept with a working prototype',
  0.1: '29,979 km/s - the target of several fusion and antimatter study designs',
  0.2: '59,958 km/s - Breakthrough Starshot’s design speed for a gram-scale sail',
};

/** Seconds in a Julian year. */
const SECONDS_PER_YEAR = 365.25 * 86_400;

/** Real seconds a transit should take on screen, whatever its true length. */
const TARGET_WALL_SECONDS = 18;

export interface CruiseTelemetry {
  fromId: string;
  toId: string;
  /** Total crossing distance in light-years. */
  totalLy: number;
  /** Distance covered so far, in light-years. */
  travelledLy: number;
  /** Fraction of light speed. */
  fractionC: number;
  /** Cruise velocity in km/s. */
  velocityKms: number;
  /** Years the crossing takes at this velocity. */
  totalYears: number;
  /** Years elapsed so far. */
  elapsedYears: number;
  /** How much faster than real time the simulation is running. */
  compression: number;
  /** 0..1 along the crossing. */
  progress: number;
}

export class InterstellarCruise {
  /** Absolute position in light-years from the Sun, scene axes. */
  readonly posLy = new THREE.Vector3();
  private fromLy = new THREE.Vector3();
  private toLy = new THREE.Vector3();
  private dirLy = new THREE.Vector3();
  private fromId = '';
  private toId = '';
  private totalLy = 0;
  private travelledLy = 0;
  private fractionIndex = DEFAULT_CRUISE_INDEX;
  private yearsPerSecond = 1;
  private running = false;

  get active(): boolean {
    return this.running;
  }

  get destination(): string {
    return this.toId;
  }

  get origin(): string {
    return this.fromId;
  }

  get fractionC(): number {
    return CRUISE_FRACTIONS[this.fractionIndex];
  }

  get cruiseIndex(): number {
    return this.fractionIndex;
  }

  setCruiseIndex(i: number): void {
    this.fractionIndex = THREE.MathUtils.clamp(Math.round(i), 0, CRUISE_FRACTIONS.length - 1);
    if (this.running) this.pickCompression();
  }

  /** Have we passed the halfway point, where the origin should change hands? */
  get pastMidpoint(): boolean {
    return this.totalLy > 0 && this.travelledLy >= this.totalLy * 0.5;
  }

  start(fromId: string, toId: string): void {
    this.fromId = fromId;
    this.toId = toId;
    this.fromLy.copy(positionLyOf(fromId));
    this.toLy.copy(positionLyOf(toId));
    this.dirLy.copy(this.toLy).sub(this.fromLy);
    this.totalLy = this.dirLy.length();
    if (this.totalLy < 1e-9) return;
    this.dirLy.divideScalar(this.totalLy);
    this.travelledLy = 0;
    this.posLy.copy(this.fromLy);
    this.running = true;
    this.pickCompression();
  }

  /**
   * Choose a time compression that gets the traveller there in about twenty
   * seconds. It is picked rather than fixed because the crossings differ by a
   * factor of ten in length, and a compression that suits Alpha Centauri would
   * leave TRAPPIST-1 running for three minutes.
   */
  private pickCompression(): void {
    const totalYears = this.totalLy / this.fractionC;
    this.yearsPerSecond = totalYears / TARGET_WALL_SECONDS;
  }

  /**
   * Advance the crossing. Returns the simulated time that passed, in seconds,
   * so the caller can move the simulation clock by the same amount - the date
   * on the panel has to agree with the years the journey took.
   */
  advance(dtSeconds: number): number {
    if (!this.running) return 0;
    const years = this.yearsPerSecond * dtSeconds;
    const dLy = Math.min(this.fractionC * years, this.totalLy - this.travelledLy);
    this.travelledLy += dLy;
    this.posLy.copy(this.fromLy).addScaledVector(this.dirLy, this.travelledLy);
    if (this.travelledLy >= this.totalLy - 1e-12) {
      this.travelledLy = this.totalLy;
      this.running = false;
    }
    // the simulated years that actually elapsed for the distance covered
    return (dLy / this.fractionC) * SECONDS_PER_YEAR;
  }

  /** Finish immediately, keeping the odometer and the clock consistent. */
  skipToArrival(): number {
    if (!this.running) return 0;
    const remainingLy = this.totalLy - this.travelledLy;
    this.travelledLy = this.totalLy;
    this.posLy.copy(this.toLy);
    this.running = false;
    return (remainingLy / this.fractionC) * SECONDS_PER_YEAR;
  }

  abort(): void {
    this.running = false;
  }

  /** Scene position right now, given whichever star the scene is centred on. */
  scenePosition(originSystemId: string, scaleT: number, out: THREE.Vector3): THREE.Vector3 {
    return out
      .copy(this.posLy)
      .sub(positionLyOf(originSystemId))
      .multiplyScalar(unitsPerLy(scaleT));
  }

  /** Unit direction of travel, in scene axes. */
  heading(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.dirLy);
  }

  telemetry(): CruiseTelemetry {
    const f = this.fractionC;
    return {
      fromId: this.fromId,
      toId: this.toId,
      totalLy: this.totalLy,
      travelledLy: this.travelledLy,
      fractionC: f,
      velocityKms: f * 299_792.458,
      totalYears: this.totalLy / f,
      elapsedYears: this.travelledLy / f,
      compression: this.yearsPerSecond * SECONDS_PER_YEAR,
      progress: this.totalLy > 0 ? this.travelledLy / this.totalLy : 1,
    };
  }

  /** Distance covered so far in kilometres - real ones. */
  get travelledKm(): number {
    return this.travelledLy * KM_PER_LY;
  }
}
