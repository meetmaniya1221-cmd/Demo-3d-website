/**
 * Audio. UI effects come from Kenney's CC0 packs (kenney.nl) plus a
 * user-supplied Mixkit click tone; the background track is Kevin MacLeod's
 * "Floating Cities" (incompetech.com, CC BY 4.0). WebAudio starts only after
 * the first user gesture, as browsers require; failure to load any file is
 * silent, sound is an enhancement, never a dependency.
 */

const FILES = ['click', 'select', 'back', 'open', 'whoosh', 'ambient'] as const;
type SoundName = (typeof FILES)[number];

const MUTE_KEY = 'orrery-muted';

class SoundFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private ambientGain: GainNode | null = null;
  private initStarted = false;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  init(): void {
    if (this.initStarted) {
      this.ctx?.resume().catch(() => {});
      return;
    }
    this.initStarted = true;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);

    for (const name of FILES) {
      fetch(`${import.meta.env.BASE_URL}sounds/${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then((buf) => this.ctx!.decodeAudioData(buf))
        .then((decoded) => {
          this.buffers.set(name, decoded);
          if (name === 'ambient') this.startAmbient();
        })
        .catch(() => {});
    }
  }

  /** Looping background music, kept well under the interface sounds. */
  private startAmbient(): void {
    if (!this.ctx || !this.master || this.ambientGain) return;
    const buffer = this.buffers.get('ambient');
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0;
    this.ambientGain.gain.linearRampToValueAtTime(0.35, this.ctx.currentTime + 5);
    src.connect(this.ambientGain).connect(this.master);
    src.start();
  }

  play(name: SoundName, volume = 1, rate = 1): void {
    if (!this.ctx || !this.master || this.muted) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.master);
    src.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // storage may be unavailable; the in-session state still applies
    }
    if (this.master && this.ctx) {
      this.master.gain.linearRampToValueAtTime(muted ? 0 : 1, this.ctx.currentTime + 0.15);
    }
  }
}

export const sound = new SoundFX();
