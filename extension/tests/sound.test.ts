import { describe, it, expect, vi } from 'vitest';
import { SoundEffects } from '../lib/sound';
function audio() {
  const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const param = () => ({ setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const ctx = { state: 'running', currentTime: 0, destination: {}, resume: vi.fn(), close: vi.fn(async () => {}),
    createOscillator: vi.fn(() => { const node = { type: 'sine', frequency: param(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }; oscillators.push(node); return node; }),
    createGain: vi.fn(() => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() })),
  };
  return { ctx, oscillators, factory: vi.fn(() => ctx as unknown as AudioContext) };
}
describe('local low-volume sound', () => {
  it('does not initialize or play before a trusted user gesture', async () => {
    const { factory, ctx } = audio(); const s = new SoundEffects(undefined, factory);
    s.play('peek'); await s.unlock(false); expect(factory).not.toHaveBeenCalled();
    await s.unlock(true); s.play('happy'); expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    const gain = ctx.createGain.mock.results[0]!.value;
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(.022, expect.any(Number)); s.dispose();
  });
  it('persists mute, stops active sound and suppresses repeated cues', async () => {
    const { factory, ctx, oscillators } = audio(); const write = vi.fn(async () => {});
    let now = 0; const s = new SoundEffects({ read: async () => false, write }, factory, () => now);
    await s.load(); await s.unlock(true); s.play('peek'); s.play('exclaim'); expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    s.setMuted(true); await Promise.resolve(); expect(oscillators[0]!.stop).toHaveBeenCalled();
    now = 1000; s.play('happy'); expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    await new Promise(resolve => setTimeout(resolve, 0)); expect(write).toHaveBeenCalledWith(true);
    s.setMuted(false); s.play('happy'); expect(ctx.createOscillator).toHaveBeenCalledTimes(3); s.dispose(); expect(ctx.close).toHaveBeenCalledOnce();
  });
  it('handles autoplay refusal without affecting the UI', async () => {
    const factory = vi.fn(() => { throw new Error('Audio blocked'); }); const s = new SoundEffects(undefined, factory);
    await expect(s.unlock(true)).resolves.toBeUndefined(); expect(s.state.ready).toBe(false); expect(() => s.play('guard')).not.toThrow(); s.dispose();
  });
});
