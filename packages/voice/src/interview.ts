import { Conversation } from '@elevenlabs/client';
import type { AvatarState, Profile } from '../../shared/types';
import { Emitter } from './emitter';

export interface InterviewOptions {
  backendUrl: string;
  /** ms to wait for the WebSocket before falling back to typed mode (default 4000) */
  connectTimeoutMs?: number;
  fetch?: typeof fetch;
}

type Events = {
  state: (s: AvatarState) => void;
  caption: (text: string, who: 'avatar' | 'user') => void;
  profile: (p: Profile) => void;
  /** voice failed; use submitTyped(). */
  fallback: (reason: string) => void;
  error: (e: unknown) => void;
};

const QUESTIONS = [
  'How much money comes in this month?',
  'What are you saving for, and by when?',
  'What should you not spend on this month?',
];

export interface Interview {
  on: Emitter<Events>['on'];
  off: Emitter<Events>['off'];
  start(): Promise<void>;
  /** Typed fallback: one call per answer; the profile is built after the last one. */
  submitTyped(text: string): Promise<Profile | undefined>;
  stop(): void;
  readonly fallbackMode: boolean;
}

class Session extends Emitter<Events> implements Interview {
  fallbackMode = false;
  private conv?: Conversation;
  private answers: string[] = [];
  private done = false;
  private stopped = false;

  constructor(private o: InterviewOptions) { super(); }

  private post(path: string, body: unknown) {
    return (this.o.fetch ?? fetch)(`${this.o.backendUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private setState(s: AvatarState) { this.emit('state', s); }

  async start() {
    const timeout = this.o.connectTimeoutMs ?? 4000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const failed = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('connect timeout')), timeout); });
    const connect = (async () => {
      const r = await this.post('/api/interview/session', {});
      if (!r.ok) throw new Error(`session ${r.status}`);
      const { signedUrl } = await r.json();
      return Conversation.startSession({
        signedUrl,
        connectionType: 'websocket',
        clientTools: { save_profile: (p: Record<string, unknown>) => this.onSave(p) },
        onMessage: ({ message, source }) => {
          if (message) this.emit('caption', message, source === 'user' ? 'user' : 'avatar');
        },
        onModeChange: ({ mode }) => this.onMode(mode),
        onDisconnect: () => { if (!this.stopped && !this.done) this.goFallback('disconnected'); },
        onError: (m) => this.goFallback(String(m)),
      });
    })();
    connect.catch(() => {});
    try {
      const conv = await Promise.race([connect, failed]);
      if (this.stopped || this.fallbackMode) { conv.endSession().catch(() => {}); return; }
      this.conv = conv;
    } catch (e) {
      this.goFallback(e instanceof Error ? e.message : String(e));
      connect.then((c) => c.endSession()).catch(() => {});
    } finally {
      clearTimeout(timer);
    }
  }

  private goFallback(reason: string) {
    if (this.fallbackMode || this.stopped) return;
    this.fallbackMode = true;
    this.emit('fallback', reason);
    this.emit('caption', QUESTIONS[0], 'avatar');
    this.setState('listening');
  }

  private onMode(mode: string) {
    if (mode === 'speaking') this.setState('talking');
    else if (mode === 'listening') {
      if (this.done) { this.conv?.endSession().catch(() => {}); return; }
      this.setState('listening');
    }
  }

  private async onSave(p: Record<string, unknown>): Promise<string> {
    try {
      const r = await this.post('/api/interview', { saveProfile: p });
      if (!r.ok) throw new Error(`interview ${r.status}`);
      const profile: Profile = await r.json();
      this.done = true;
      this.setState('happy');
      this.emit('profile', profile);
      return 'Saved. Say one short closing line and stop.';
    } catch (e) {
      this.emit('error', e);
      return 'Saved.';
    }
  }

  async submitTyped(text: string): Promise<Profile | undefined> {
    if (this.done) return;
    this.emit('caption', text, 'user');
    this.answers.push(text);
    if (this.answers.length < QUESTIONS.length) {
      this.emit('caption', QUESTIONS[this.answers.length], 'avatar');
      return;
    }
    try {
      const r = await this.post('/api/interview', { answers: this.answers });
      if (!r.ok) throw new Error(`interview ${r.status}`);
      const profile: Profile = await r.json();
      this.done = true;
      this.setState('happy');
      this.emit('profile', profile);
      return profile;
    } catch (e) {
      this.emit('error', e);
    }
  }

  stop() {
    this.stopped = true;
    this.conv?.endSession().catch(() => {});
    this.setState('idle');
  }
}

export function createInterview(opts: InterviewOptions): Interview {
  return new Session(opts);
}
