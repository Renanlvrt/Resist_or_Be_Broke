import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@elevenlabs/client', () => ({ Conversation: {} }));

class FakeAudio {
  static all: FakeAudio[] = []; static playing = 0; static maxPlaying = 0; static log: string[] = [];
  onended: (() => void) | null = null; onerror: (() => void) | null = null; error = null; started = false; ended = false;
  constructor(public src: string) { FakeAudio.all.push(this); }
  play() { this.started = true; FakeAudio.playing++; FakeAudio.maxPlaying = Math.max(FakeAudio.maxPlaying, FakeAudio.playing); FakeAudio.log.push('play:' + this.src); this.ls.play?.forEach((f) => f()); return Promise.resolve(); }
  pause() {}
  ls: Record<string, (() => void)[]> = {};
  addEventListener(ev: string, fn: () => void) { (this.ls[ev] ??= []).push(fn); }
  end() { if (this.ended) return; this.ended = true; FakeAudio.playing--; FakeAudio.log.push('end:' + this.src); this.ls.ended?.forEach((f) => f()); this.onended?.(); }
}
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const mkFetch = () => vi.fn(async (_u: string, init: any) => ({ ok: true, blob: async () => new Blob([JSON.parse(init.body).text]) })) as any;

async function make() {
  vi.resetModules();
  const { createInterrogation } = await import('../../packages/voice/src/index');
  return (fetchFn = mkFetch()) => createInterrogation({ profile: {} as any, product: {} as any, backendUrl: 'http://x', fetch: fetchFn });
}

beforeEach(() => {
  FakeAudio.all = []; FakeAudio.playing = 0; FakeAudio.maxPlaying = 0; FakeAudio.log = [];
  (globalThis as any).Audio = FakeAudio;
  URL.createObjectURL = (() => 'blob:' + ++n) as any; URL.revokeObjectURL = (() => {}) as any;
});

describe('serial audio queue', () => {
  it('never plays two say() clips at once, across sessions', async () => {
    const mk = await make();
    const a = mk(), b = mk();
    const p1 = a.say('one'), p2 = b.say('two'), p3 = a.say('three');
    await tick();
    expect(FakeAudio.all.filter((x) => x.started)).toHaveLength(1); // only the first plays
    FakeAudio.all[0]!.end(); await tick();
    expect(FakeAudio.all.filter((x) => x.started)).toHaveLength(2);
    expect(FakeAudio.playing).toBe(1);
    FakeAudio.all[1]!.end(); await tick(); FakeAudio.all[2]!.end();
    await Promise.all([p1, p2, p3]);
    expect(FakeAudio.maxPlaying).toBe(1);
  });

  it('a queued clip waits for the live agent to stop speaking', async () => {
    const mk = await make(); const s: any = mk();
    s.agentSpeaking = true;
    const p = s.say('late');
    await tick(150);
    expect(FakeAudio.all.filter((x) => x.started)).toHaveLength(0);
    s.agentSpeaking = false; await tick(200);
    expect(FakeAudio.all[0]!.started).toBe(true);
    FakeAudio.all[0]!.end(); await p;
  });

  it('stop() drops queued clips and releases the playing one', async () => {
    const mk = await make(); const s = mk();
    const p1 = s.say('one'), p2 = s.say('two');
    await tick(); s.stop(); await Promise.all([p1, p2]);
    expect(FakeAudio.all.filter((x) => x.started)).toHaveLength(1);
  });

  it('priority: waiting verdict beats beat beats savings; FIFO within a priority; never overlapping', async () => {
    const mk = await make(); const s = mk();
    const order: string[] = [];
    const track = (name: string, p: Promise<void>) => p.then(() => order.push(name));
    const first = track('first', s.say('first', 'idle', 'beat'));
    await tick();
    const ps = [track('savings', s.say('savings', 'idle', 'savings')), track('beat2', s.say('beat2', 'idle', 'beat')), track('verdict', s.say('verdict', 'idle', 'verdict'))];
    await tick();
    for (let i = 0; i < 4; i++) { await tick(); FakeAudio.all.filter((x) => x.started && !x.ended)[0]?.end(); }
    await Promise.all([first, ...ps]);
    expect(order).toEqual(['first', 'verdict', 'beat2', 'savings']);
    expect(FakeAudio.maxPlaying).toBe(1);
  });

  it('nudges are dropped when anything is playing or queued', async () => {
    const mk = await make(); const s = mk();
    const p = s.say('real', 'idle', 'beat'); await tick();
    await s.say('go on', 'listening', 'nudge'); // resolves immediately, never plays
    expect(FakeAudio.all).toHaveLength(1);
    FakeAudio.all[0]!.end(); await p; await tick();
    const n = s.say('go on', 'listening', 'nudge'); await tick(); // idle: plays
    expect(FakeAudio.all).toHaveLength(2); FakeAudio.all[1]!.end(); await n;
  });
});
