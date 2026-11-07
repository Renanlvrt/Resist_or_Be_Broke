import { addGoal, BACKEND, proxyFetch, type GoalItem } from './goalsStore';

export type GoalPhase = 'idle' | 'connecting' | 'listening' | 'talking' | 'done' | 'typed';
export interface GoalSessionHandlers {
  onPhase(p: GoalPhase): void;
  onCaption(text: string, who: 'avatar' | 'user'): void;
  onGoal(g: GoalItem): void;
  /** voice unavailable (no mic, no network, timeout): show the typed input. */
  onFallback(reason: string): void;
}
export interface GoalSession { stop(): void }

/** Starts the live "What are you planning this time?" interview. Adapts packages/voice createInterview():
 *  signed URL from POST /api/goals/session, @elevenlabs/client Conversation, blocking client tool save_goal. */
export async function startGoalSession(h: GoalSessionHandlers, opts: { connectTimeoutMs?: number; fetch?: typeof fetch } = {}): Promise<GoalSession> {
  const f = opts.fetch ?? proxyFetch;
  let conv: { endSession(): Promise<void> } | undefined, stopped = false, done = false, fellBack = false, spokeAfter = false;
  const fallback = (reason: string) => {
    if (fellBack || stopped || done) return;
    fellBack = true; h.onFallback(reason); h.onPhase('typed');
    conv?.endSession().catch(() => {});
  };
  const stop = () => { stopped = true; conv?.endSession().catch(() => {}); h.onPhase('idle'); };
  h.onPhase('connecting');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const failed = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('connect timeout')), opts.connectTimeoutMs ?? 6000); });
  const connect = (async () => {
    const r = await f(`${BACKEND}/api/goals/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!r.ok) throw new Error('session ' + r.status);
    const { signedUrl } = await r.json();
    // @ts-ignore @elevenlabs/client is installed under packages/voice only
    const { Conversation } = await import('../../packages/voice/node_modules/@elevenlabs/client') as any;
    return Conversation.startSession({
      signedUrl,
      connectionType: 'websocket',
      clientTools: {
        save_goal: async (p: Record<string, unknown>) => {
          try {
            const g = await addGoal({ label: String(p.label ?? ''), amount: Number(p.amount), by: String(p.by ?? ''), emoji: p.emoji ? String(p.emoji) : undefined }, f);
            done = true; h.onGoal(g); setTimeout(() => { h.onPhase('done'); conv?.endSession().catch(() => {}); }, 9000); // safety: end after the confirmation line
            return 'Saved. Say exactly: Added. Let us get it done. Then stop.';
          } catch { return 'Could not save. Say sorry in four words and stop.'; }
        },
      },
      onMessage: ({ message, source }: any) => { if (message) h.onCaption(message, source === 'user' ? 'user' : 'avatar'); },
      onModeChange: ({ mode }: any) => {
        if (mode === 'speaking') { if (done) spokeAfter = true; h.onPhase('talking'); }
        else if (done) { if (spokeAfter) { h.onPhase('done'); setTimeout(() => conv?.endSession().catch(() => {}), 300); } }
        else h.onPhase('listening');
      },
      onDisconnect: () => { if (!stopped && !done) fallback('disconnected'); else if (done) h.onPhase('done'); },
      onError: (m: unknown) => fallback(String(m)),
    });
  })();
  connect.catch(() => {});
  try {
    const c = await Promise.race([connect, failed]);
    if (stopped || fellBack) { c.endSession().catch(() => {}); } else { conv = c; h.onPhase('listening'); }
  } catch (e) {
    fallback(e instanceof Error ? e.message : String(e));
    connect.then(c => c.endSession()).catch(() => {});
  } finally { clearTimeout(timer); }
  return { stop };
}
