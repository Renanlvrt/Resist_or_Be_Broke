import { reactive } from 'vue';
import type { MascotAction } from './contracts';
export type SoundCue = 'peek' | 'exclaim' | 'happy' | 'disapprove' | 'guard' | 'dismiss';
export interface SoundPersistence { read(): Promise<boolean | undefined>; write(muted: boolean): Promise<void> }
const CUES: Partial<Record<MascotAction, SoundCue>> = {
  PEEK: 'peek', EXCLAIM: 'exclaim', HAPPY: 'happy', DISAPPROVE: 'disapprove', GUARD: 'guard', DISMISS: 'dismiss',
};
/** Quiet local synthesis; no context is even constructed until a trusted gesture. */
export class SoundEffects {
  state = reactive({ muted: false, ready: false });
  private context: AudioContext | null = null;
  private sources = new Set<OscillatorNode>();
  private lastAt = -Infinity;
  private disposed = false;
  private writes: Promise<void> = Promise.resolve();
  constructor(private persistence?: SoundPersistence, private factory = () => new AudioContext(), private now = () => performance.now()) {}
  async load() { const muted = await this.persistence?.read(); if (typeof muted === 'boolean') this.state.muted = muted; }
  async unlock(trusted: boolean) {
    if (!trusted || this.state.muted || this.disposed) return;
    try {
      this.context ??= this.factory();
      if (this.context.state === 'suspended') await this.context.resume();
      this.state.ready = this.context.state === 'running';
    } catch { this.state.ready = false; }
  }
  setMuted(muted: boolean, persist = true) {
    this.state.muted = muted;
    if (muted) this.stop();
    if (persist) this.writes = this.writes.catch(() => {}).then(() => this.persistence?.write(muted)).catch(() => {});
  }
  action(action: MascotAction) { const cue = CUES[action]; if (cue) this.play(cue); }
  play(cue: SoundCue) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.state.ready || this.state.muted || this.disposed || this.now() - this.lastAt < 240) return;
    this.lastAt = this.now();
    this.stop();
    const notes: [number, number, number][] = cue === 'happy' ? [[590, 740, 0], [740, 880, .085]]
      : cue === 'peek' ? [[340, 560, 0]] : cue === 'exclaim' ? [[760, 690, 0]]
        : cue === 'disapprove' ? [[230, 125, 0]] : cue === 'guard' ? [[180, 310, 0]] : [[380, 145, 0]];
    try {
      for (const [from, to, delay] of notes) {
        const oscillator = ctx.createOscillator(), gain = ctx.createGain();
        const at = ctx.currentTime + delay, length = cue === 'exclaim' ? .075 : .14;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(from, at);
        oscillator.frequency.exponentialRampToValueAtTime(to, at + length);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(.022, at + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, at + length);
        oscillator.connect(gain); gain.connect(ctx.destination);
        this.sources.add(oscillator);
        oscillator.onended = () => { this.sources.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at); oscillator.stop(at + length + .02);
      }
    } catch { this.stop(); }
  }
  private stop() { for (const source of this.sources) { try { source.stop(); } catch {} } this.sources.clear(); }
  dispose() { this.disposed = true; this.stop(); this.state.ready = false; void this.context?.close().catch(() => {}); this.context = null; }
}
