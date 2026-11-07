import { Conversation } from '@elevenlabs/client';
import type { AvatarState, Category, Product, Profile, Verdict } from '../../shared/types';
import { Emitter } from './emitter';

export type { AvatarState, Verdict };

export interface InterrogationOptions {
  profile: Profile;
  product: Product;
  backendUrl: string;
  demo?: boolean;
  /** ms to wait for the WebSocket before falling back to typed mode (default 4000) */
  connectTimeoutMs?: number;
  /** injectable fetch (e.g. proxied through an extension background worker); defaults to global fetch */
  fetch?: typeof fetch;
}

type Events = {
  state: (s: AvatarState) => void;
  caption: (text: string, who: 'avatar' | 'user') => void;
  verdict: (v: Verdict) => void;
  /** voice failed; use submitTyped(). */
  fallback: (reason: string) => void;
  error: (e: unknown) => void;
};

const MAX_ROUNDS = 2; // two rounds: a first reject lets the user insist once; the second verdict is final
const OPENING = 'Why do you need these shoes?';

export interface Interrogation {
  on: Emitter<Events>['on'];
  off: Emitter<Events>['off'];
  start(): Promise<void>;
  say(text: string, state?: AvatarState, priority?: SpeechPriority): Promise<void>;
  submitTyped(text: string): Promise<Verdict | undefined>;
  stop(): void;
  /** resolves once the live agent finished its post-verdict line (mode listening, or it never started speaking); typed say() also awaited. */
  agentDone(maxMs?: number): Promise<void>;
  /** close the live (mic) session without stopping say(). */
  endVoice(): void;
  readonly fallbackMode: boolean;
  /** the last verdict was final (accept, or the last round): the session is winding down */
  readonly finished: boolean;
}

/** tail of the page-wide serial speech queue */
let CLIP_ID = 0;
export type SpeechPriority = 'verdict' | 'beat' | 'savings' | 'nudge';
const PRIO: Record<SpeechPriority, number> = { verdict: 0, beat: 1, savings: 2, nudge: 3 };
const CLIP_SAFETY_MS = 12000;
/** Page-wide speech queue: one clip at a time, FIFO within a priority, higher priority jumps ahead of waiting clips
 *  (never interrupts the one playing). The next clip starts only after the previous one ended. */
const Q = { jobs: [] as { prio: number; seq: number; run: () => Promise<void> }[], busy: false, seq: 0 };
function pump() {
  if (Q.busy || !Q.jobs.length) return;
  Q.jobs.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
  const j = Q.jobs.shift()!;
  Q.busy = true;
  j.run().catch(() => {}).finally(() => { Q.busy = false; pump(); });
}
function enqueue(prio: number, run: () => Promise<void>): Promise<void> {
  return new Promise<void>((res) => {
    Q.jobs.push({ prio, seq: ++Q.seq, run: async () => { try { await run(); } finally { res(); } } });
    pump();
  });
}
async function withRetry<T>(fn: () => Promise<T>, bad: (v: T) => boolean): Promise<T> {
  try { const v = await fn(); if (!bad(v)) return v; } catch { /* retry once */ }
  await new Promise((r) => setTimeout(r, 1200));
  return fn();
}

class Session extends Emitter<Events> implements Interrogation {
  fallbackMode = false;
  get finished() { return this.done; }
  private lastAgentEnd = 0;
  private conv?: Conversation;
  private round = 0;
  private done = false;
  private stopped = false;
  private lastVerdict?: Verdict['verdict'];
  private audio?: HTMLAudioElement;
  private url?: string;
  private agentSpeaking = false;
  private pending = 0;
  private gate?: Promise<void>;
  private gateRes?: () => void;
  private gateSpoke?: () => void;
  private cancelClip?: () => void;

  constructor(private o: InterrogationOptions) { super(); }

  private post(path: string, body: unknown) {
    return (this.o.fetch ?? fetch)(`${this.o.backendUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private setState(s: AvatarState) { this.emit('state', s); }

  async start() {
    const { profile, product } = this.o;
    const timeout = this.o.connectTimeoutMs ?? 12000;
    let lastErr = 'unknown';
    for (let attempt = 0; attempt < 2 && !this.stopped; attempt++) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const failed = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('connect timeout (' + timeout + 'ms)')), timeout); });
      const connect = (async () => {
        const r = await this.post('/api/voice/session', { profile, product });
        if (!r.ok) throw new Error(`session ${r.status}`);
        const { signedUrl, dynamicVariables } = await r.json();
        return Conversation.startSession({
          signedUrl,
          connectionType: 'websocket',
          dynamicVariables,
          clientTools: { decide: (p: Verdict) => this.onDecide(p) },
          onMessage: ({ message, source }) => {
            if (message) this.emit('caption', message, source === 'user' ? 'user' : 'avatar');
          },
          onModeChange: ({ mode }) => this.onMode(mode),
          onDisconnect: () => { if (!this.stopped && !this.done) this.goFallback('disconnected'); },
          onError: (m) => this.goFallback(String(m)),
        });
      })();
      connect.catch(() => {}); // avoid unhandled rejection if the race is lost
      try {
        const conv = await Promise.race([connect, failed]);
        if (this.stopped || this.fallbackMode) { conv.endSession().catch(() => {}); return; }
        this.conv = conv;
        return;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        console.warn(`[keephard] voice connect attempt ${attempt + 1} failed:`, e);
        connect.then((c) => c.endSession()).catch(() => {}); // late connect: drop it
      } finally {
        clearTimeout(timer);
      }
    }
    this.goFallback(lastErr);
  }

  private goFallback(reason: string) {
    if (this.fallbackMode || this.stopped) return;
    this.fallbackMode = true;
    console.warn('[keephard] voice fallback:', reason);
    this.emit('fallback', reason);
    this.emit('caption', OPENING, 'avatar');
    void this.say(OPENING, 'listening');
  }

  private onMode(mode: string) {
    if (mode === 'speaking') { this.agentSpeaking = true; this.gateSpoke?.(); this.setState('talking'); }
    else if (mode === 'listening') {
      this.agentSpeaking = false; this.lastAgentEnd = Date.now();
      this.gateRes?.(); // (only releases once the agent has spoken: see armGate)
      if (this.done) { // final line finished: close the session, keep the verdict mood
        this.setState(this.lastVerdict === 'accept' ? 'happy' : 'disappointed');
        return;
      }
      this.setState('listening');
    }
  }

  /** Poll: done when the agent spoke and went back to listening, or ~800ms passed without it starting. */
  agentDone(maxMs = 15000): Promise<void> {
    return new Promise<void>((resolve) => {
      const t0 = Date.now();
      let seen = false;
      const iv = setInterval(() => {
        const active = this.agentSpeaking || this.pending > 0 || Q.busy || Q.jobs.length > 0;
        if (active) seen = true;
        if ((!active && seen) || (!active && !this.gate && Date.now() - t0 > 2500) || Date.now() - t0 > maxMs || this.stopped) { clearInterval(iv); resolve(); }
      }, 100);
    });
  }

  /** After a verdict the live agent calls `decide` FIRST and speaks AFTER. Hold every queued clip until the agent's own line
   *  has started (max 2.5s) and finished (max 8s total), so our clips can never talk over it. */
  private armGate() {
    if (this.fallbackMode || !this.conv || this.gate) return;
    let spoke = this.agentSpeaking;
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>;
    this.gate = new Promise<void>((res) => {
      const fin = () => { clearTimeout(t1); clearTimeout(t2); this.gate = undefined; this.gateRes = undefined; this.gateSpoke = undefined; res(); };
      this.gateSpoke = () => { spoke = true; clearTimeout(t1); };
      this.gateRes = () => { if (spoke) fin(); };
      t1 = setTimeout(() => { if (!spoke) fin(); }, 2500);
      t2 = setTimeout(fin, 8000);
    });
  }

  endVoice() { const c = this.conv; this.conv = undefined; c?.endSession().catch(() => {}); }

  private onDecide(p: Verdict): string {
    this.round++;
    const v: Verdict = {
      verdict: p.verdict === 'accept' ? 'accept' : 'reject',
      reasonCategory: p.reasonCategory as Category,
      userReasonSummary: p.userReasonSummary,
      spokenLine: p.spokenLine,
    };
    this.lastVerdict = v.verdict;
    this.armGate();
    const final = v.verdict === 'accept' || this.round >= MAX_ROUNDS;
    if (final) this.done = true;
    this.setState(v.verdict === 'accept' ? 'happy' : 'disappointed');
    this.emit('verdict', v);
    return final
      ? 'Final. Say your spokenLine and stop asking questions.'
      : 'Recorded. Say your spokenLine and ask once more.';
  }

  /** Typed fallback: judge via backend, then speak the reply. */
  async submitTyped(text: string): Promise<Verdict | undefined> {
    if (this.done) return;
    this.emit('caption', text, 'user');
    const round = this.round + 1;
    try {
      const r = await this.post('/api/voice/judge', { profile: this.o.profile, product: this.o.product, userText: text, round });
      if (!r.ok) throw new Error(`judge ${r.status}`);
      const v: Verdict = await r.json();
      this.round = round;
      this.lastVerdict = v.verdict;
      if (v.verdict === 'accept' || round >= MAX_ROUNDS) this.done = true;
      this.emit('verdict', v); // emit first: UI reacts before audio arrives
      this.emit('caption', v.spokenLine, 'avatar');
      const mood: AvatarState = v.verdict === 'accept' ? 'happy' : 'disappointed';
      void this.say(v.spokenLine, mood, 'verdict');
      return v;
    } catch (e) {
      this.emit('error', e);
    }
  }

  /** TTS via backend. ONE serial queue (shared by every session on the page): clips never overlap each other,
   *  and a clip also waits until the live agent has stopped speaking. The audio is fetched immediately
   *  (prefetch) but only played when it is its turn. Resolves when this clip has finished (or was dropped).
   *  Emits talking when the clip starts and `after` (default idle) when it ends and nothing else is queued. */
  say(text: string, after: AvatarState = 'idle', priority: SpeechPriority = 'beat'): Promise<void> {
    // nudges are droppable: skip if anything else is queued, playing, or the live agent is talking
    if (priority === 'nudge' && (Q.busy || Q.jobs.length || this.agentSpeaking || this.gate || Date.now() - this.lastAgentEnd < 2000)) return Promise.resolve(); // dropped, never queued
    this.pending++;
    const blobP: Promise<Blob | undefined> = withRetry(() => this.post('/api/voice/speak', { text }), (r) => r.status >= 500)
      .then((r) => { if (!r.ok) throw new Error(`speak ${r.status}`); return r.blob(); })
      .catch((e) => { this.emit('error', e); return undefined; });
    return enqueue(PRIO[priority], async () => {
      try {
        if (priority === 'nudge' && Q.jobs.length) return; // something real arrived while we waited
        const blob = await blobP;
        if (!blob || this.stopped) return;
        await this.waitAgentQuiet();
        if (this.stopped) return;
        this.setState('talking');
        await this.playBlob(blob);
      } catch (e) { this.emit('error', e); }
      finally {
        this.pending--;
        if (this.pending === 0 && !Q.jobs.length) { try { this.conv?.setVolume({ volume: 1 }); } catch { /* ignore */ } }
        if (!this.stopped && this.pending === 0) this.setState(after);
      }
    });
  }

  /** never start a clip on top of the live agent's own voice */
  private async waitAgentQuiet(maxMs = 15000) {
    const t0 = Date.now();
    if (this.gate) await this.gate;
    while (this.agentSpeaking && !this.stopped && Date.now() - t0 < maxMs) await new Promise((r) => setTimeout(r, 80));
  }

  private async playBlob(blob: Blob) {
    this.revoke();
    try { this.conv?.setVolume({ volume: 0 }); } catch { /* ignore */ } // a late agent response is muted, never on top of our clip
    this.url = URL.createObjectURL(blob);
    const a = (this.audio = new Audio(this.url));
    const id = ++CLIP_ID;
    a.addEventListener('play', () => console.debug('[kh-audio] play ' + id + ' ' + Math.round(blob.size)));
    a.addEventListener('ended', () => console.debug('[kh-audio] ended ' + id));
    await new Promise<void>((res) => {
      const safety = setTimeout(() => { console.warn('[keephard] clip safety timeout'); try { a.pause(); } catch { /* ignore */ } res(); }, CLIP_SAFETY_MS);
      this.cancelClip = () => { clearTimeout(safety); res(); };
      a.addEventListener('ended', () => clearTimeout(safety));
      a.onended = () => res();
      a.onerror = () => {
        const err = new Error('audio element error: ' + (a.error?.message || a.error?.code || 'unknown'));
        console.warn('[keephard] say()', err);
        this.emit('error', err);
        res();
      };
      a.play().catch(async (err) => {
        console.warn('[keephard] audio.play() rejected, trying WebAudio:', err);
        try { await this.playWebAudio(blob); }
        catch (e2) {
          console.warn('[keephard] WebAudio fallback failed:', e2);
          this.emit('error', new Error(`audio blocked (${err?.name || err}); click the page / Start button first`));
        }
        res();
      });
    });
    this.cancelClip = undefined;
  }

  private async playWebAudio(blob: Blob) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    await new Promise<void>((res) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => res();
      src.start();
    });
    ctx.close().catch(() => {});
  }

  private revoke() { if (this.url) { URL.revokeObjectURL(this.url); this.url = undefined; } }

  stop() {
    this.stopped = true;
    this.conv?.endSession().catch(() => {});
    this.audio?.pause();
    this.cancelClip?.();
    this.revoke();
    this.setState('idle');
  }
}

export function createInterrogation(opts: InterrogationOptions): Interrogation {
  return new Session(opts);
}

export { createInterview } from './interview';
export type { Interview, InterviewOptions } from './interview';
