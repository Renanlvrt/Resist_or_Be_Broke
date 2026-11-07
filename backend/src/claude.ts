// Minimal Anthropic Messages call via fetch. Returns text or throws.
export const MODEL = 'claude-sonnet-5-5';
export async function askClaude(system: string, user: string, timeoutMs: number, maxTokens = 400): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('no ANTHROPIC_API_KEY');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const j: any = await r.json();
  return j.content?.map((c: any) => c.text ?? '').join('') ?? '';
}
export function extractJson(t: string): unknown {
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no json');
  return JSON.parse(m[0]);
}
