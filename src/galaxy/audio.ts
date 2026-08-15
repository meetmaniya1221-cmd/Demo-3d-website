/**
 * Galaxy-mode ambience, synthesized entirely in WebAudio - no assets.
 *
 * Space is silent and the UI says so: everything here is presented as the
 * ship's instruments sonifying its environment - the radio band crackling
 * as the sensors sweep the galactic centre, the hull's own resonance under
 * tidal load, alarms. That framing is standard practice for spacecraft
 * interfaces and keeps the audio honest.
 *
 * Layers, mixed by distance/stage:
 *  - deep space: near-silent brown noise floor
 *  - galactic centre: band-swept radio static (the real centre is one of
 *    the brightest radio sources in the sky - Sgr A was found by Jansky)
 *  - black hole: low detuned rumble + slow beat
 *  - events: flare sweep, warning pips, hull-stress creaks
 */
import { sound } from '../audio';

export class GalaxyAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private spaceGain: GainNode | null = null;
  private radioGain: GainNode | null = null;
  private radioFilter: BiquadFilterNode | null = null;
  private rumbleGain: GainNode | null = null;
  private lfoPhase = 0;
  private creakTimer = 2;

  /** Create the graph. Must be called from a user gesture. */
  init(): void {
    if (this.ctx) {
      this.ctx.resume().catch(() => {});
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // shared noise buffer (2 s of white noise, looped)
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const brownBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const bdata = brownBuf.getChannelData(0);
    for (let i = 0; i < bdata.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.02) * 0.996;
      bdata[i] = brown * 3.5;
    }

    // deep-space floor
    const space = ctx.createBufferSource();
    space.buffer = brownBuf;
    space.loop = true;
    const spaceFilter = ctx.createBiquadFilter();
    spaceFilter.type = 'lowpass';
    spaceFilter.frequency.value = 110;
    this.spaceGain = ctx.createGain();
    this.spaceGain.gain.value = 0;
    space.connect(spaceFilter).connect(this.spaceGain).connect(this.master);
    space.start();

    // galactic-centre radio static
    const radio = ctx.createBufferSource();
    radio.buffer = noiseBuf;
    radio.loop = true;
    this.radioFilter = ctx.createBiquadFilter();
    this.radioFilter.type = 'bandpass';
    this.radioFilter.frequency.value = 700;
    this.radioFilter.Q.value = 9;
    this.radioGain = ctx.createGain();
    this.radioGain.gain.value = 0;
    radio.connect(this.radioFilter).connect(this.radioGain).connect(this.master);
    radio.start();

    // black-hole rumble: two slow detuned sines beat against each other
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    for (const f of [26, 31.4]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(this.rumbleGain);
      osc.start();
    }
    this.rumbleGain.connect(this.master);
  }

  /**
   * Per-frame mix. Distances in ly; stress 0..1 drives hull creaks.
   */
  update(dt: number, sgraDistLy: number, stress: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const muted = sound.muted;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.9, t, 0.2);
    if (muted) return;

    this.lfoPhase += dt;
    const centre = Math.max(0, 1 - sgraDistLy / 3000);
    const bh = Math.max(0, 1 - sgraDistLy / 0.2);

    this.spaceGain?.gain.setTargetAtTime(0.05 + centre * 0.02, t, 0.5);
    if (this.radioGain && this.radioFilter) {
      this.radioGain.gain.setTargetAtTime(centre * centre * 0.075, t, 0.5);
      this.radioFilter.frequency.setTargetAtTime(
        520 + 420 * Math.sin(this.lfoPhase * 0.23) + 160 * Math.sin(this.lfoPhase * 1.7),
        t,
        0.1,
      );
    }
    this.rumbleGain?.gain.setTargetAtTime(
      bh * (0.16 + 0.05 * Math.sin(this.lfoPhase * 0.6)),
      t,
      0.4,
    );

    // hull-stress creaks under tidal load
    if (stress > 0.15) {
      this.creakTimer -= dt * (0.4 + stress * 2);
      if (this.creakTimer <= 0) {
        this.creakTimer = 0.8 + Math.random() * 3;
        this.creak(stress);
      }
    }
  }

  private creak(strength: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const dur = 0.25 + Math.random() * 0.5;
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 120 + Math.random() * 300;
    f.Q.value = 14;
    const g = ctx.createGain();
    g.gain.value = 0.10 * strength;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  /** Flare alarm: a rising sweep and a noise wash. */
  flare(): void {
    if (!this.ctx || !this.master || sound.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(640, t + 1.1);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    osc.connect(f).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 2.4);
  }

  /** Navigation warning: three short pips. */
  warn(): void {
    if (!this.ctx || !this.master || sound.muted) return;
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.22;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 880;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.16);
    }
  }

  suspend(): void {
    this.ctx?.suspend().catch(() => {});
  }

  resume(): void {
    this.ctx?.resume().catch(() => {});
  }

  dispose(): void {
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
