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

const MAX_ROUNDS = 2;
const OPENING = 'Quick check before you buy. Why do you need these?';

export interface Interrogation {
  on: Emitter<Events>['on'];
  off: Emitter<Events>['off'];
  start(): Promise<void>;
  say(text: string, state?: AvatarState): Promise<void>;
  submitTyped(text: string): Promise<Verdict | undefined>;
  stop(): void;
  readonly fallbackMode: boolean;
}

class Session extends Emitter<Events> implements Interrogation {
  fallbackMode = false;
  private conv?: Conversation;
  private round = 0;
  private done = false;
  private stopped = false;
  private lastVerdict?: Verdict['verdict'];
  private audio?: HTMLAudioElement;
  private url?: string;

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
    const timeout = this.o.connectTimeoutMs ?? 4000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const failed = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('connect timeout')), timeout); });
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
    } catch (e) {
      this.goFallback(e instanceof Error ? e.message : String(e));
      connect.then((c) => c.endSession()).catch(() => {}); // late connect: drop it
    } finally {
      clearTimeout(timer);
    }
  }

  private goFallback(reason: string) {
    if (this.fallbackMode || this.stopped) return;
    this.fallbackMode = true;
    this.emit('fallback', reason);
    this.emit('caption', OPENING, 'avatar');
    void this.say(OPENING, 'listening');
  }

  private onMode(mode: string) {
    if (mode === 'speaking') this.setState('talking');
    else if (mode === 'listening') {
      if (this.done) { // final line finished: close the session, keep the verdict mood
        this.conv?.endSession().catch(() => {});
        return;
      }
      this.setState('listening');
    }
  }

  private onDecide(p: Verdict): string {
    this.round++;
    const v: Verdict = {
      verdict: p.verdict === 'accept' ? 'accept' : 'reject',
      reasonCategory: p.reasonCategory as Category,
      userReasonSummary: p.userReasonSummary,
      spokenLine: p.spokenLine,
    };
    this.lastVerdict = v.verdict;
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
      void this.say(v.spokenLine, mood);
      return v;
    } catch (e) {
      this.emit('error', e);
    }
  }

  /** TTS via backend; emits talking, then `after` (default idle) when audio ends. */
  async say(text: string, after: AvatarState = 'idle'): Promise<void> {
    this.setState('talking');
    try {
      const r = await this.post('/api/voice/speak', { text });
      if (!r.ok) throw new Error(`speak ${r.status}`);
      const blob = await r.blob();
      if (this.stopped) return;
      this.revoke();
      this.url = URL.createObjectURL(blob);
      const a = (this.audio = new Audio(this.url));
      await new Promise<void>((res) => {
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
    } catch (e) {
      this.emit('error', e);
    }
    this.setState(after);
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
    this.revoke();
    this.setState('idle');
  }
}

export function createInterrogation(opts: InterrogationOptions): Interrogation {
  return new Session(opts);
}
