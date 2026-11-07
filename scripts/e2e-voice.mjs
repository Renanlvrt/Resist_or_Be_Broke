// Text-only e2e test of the live ElevenLabs voice agent via backend /api/voice/session.
import { readFileSync } from 'node:fs';
const BASE = process.env.BACKEND ?? 'http://localhost:8787';
const rd = (f) => JSON.parse(readFileSync(new URL('../packages/shared/' + f, import.meta.url), 'utf8'));
const profile = rd('demo-profile.json'), product = rd('demo-product.json');

const VARIANT = process.argv[2] === 'sport' ? 'sport' : 'fashion';
const r = await fetch(`${BASE}/api/voice/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile, product }) });
if (!r.ok) { console.error('session failed', r.status, await r.text()); process.exit(2); }
const { signedUrl, dynamicVariables } = await r.json();
console.log('dynamicVariables:', dynamicVariables);

const ws = new WebSocket(signedUrl);
let t0 = 0, firstResp = null, events = [], waiter = null;
const log = (...a) => console.log(`[${(Date.now() % 100000)}]`, ...a);
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', event_id: d.ping_event.event_id }));
  if (d.type === 'agent_response') {
    const text = d.agent_response_event.agent_response;
    if (t0 && firstResp === null) firstResp = Date.now() - t0;
    events.push({ kind: 'say', text }); log('AGENT:', text);
  } else if (d.type === 'client_tool_call') {
    const c = d.client_tool_call;
    events.push({ kind: 'tool', name: c.tool_name, params: c.parameters }); log('TOOL:', c.tool_name, JSON.stringify(c.parameters));
    ws.send(JSON.stringify({ type: 'client_tool_result', tool_call_id: c.tool_call_id, result: 'ok', is_error: false }));
  } else if (d.type === 'conversation_initiation_metadata') log('init ok');
  else if (!['audio', 'user_transcript', 'internal_tentative_agent_response', 'vad_score', 'agent_chat_response_part'].includes(d.type)) log('evt', d.type, JSON.stringify(d).slice(0, 200));
  waiter?.();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms) { const end = Date.now() + ms; while (Date.now() < end && !pred()) await new Promise((r) => { waiter = r; setTimeout(r, 200); }); return pred(); }
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
ws.send(JSON.stringify({ type: 'conversation_initiation_client_data', dynamic_variables: dynamicVariables }));
await waitFor(() => events.some((e) => e.kind === 'say'), 15000); // first message
const first = events.find((e) => e.kind === 'say')?.text;
const firstOk = first === 'Why do you need these shoes?';
console.log('FIRST MESSAGE:', firstOk ? 'PASS' : 'FAIL ' + first);
await sleep(5000); // let the greeting finish so the text turn does not interrupt it

async function round(n, text, expect) {
  events = []; firstResp = null; t0 = Date.now();
  log(`ROUND ${n} USER:`, text);
  ws.send(JSON.stringify({ type: 'user_message', text }));
  await waitFor(() => events.some((e) => e.kind === 'tool'), 20000);
  await sleep(4000); // let post-tool speech arrive
  const tool = events.find((e) => e.kind === 'tool' && e.name === 'decide');
  const says = events.filter((e) => e.kind === 'say').map((e) => e.text);
  const fails = [];
  if (!tool) fails.push('decide not called');
  else {
    const p = tool.params ?? {};
    if (p.verdict !== expect.verdict) fails.push(`verdict ${p.verdict} != ${expect.verdict}`);
    if (p.reasonCategory !== expect.cat) fails.push(`category ${p.reasonCategory} != ${expect.cat}`);
    if (p.spokenLine && p.spokenLine.split(/\s+/).length > 12) fails.push('spokenLine >12 words');
  }
  if (!says.length) fails.push('no agent_response');
  const want = expect.verdict === 'reject' ? 'Not a valid reason. But if you really want them, here is a cheaper pair.' : 'Fair reason. Here is a cheaper pair anyway.';
  if (says.length && !says.some((x) => x.trim() === want)) fails.push('spoken line mismatch');
  for (const s of says) if (s.split(/\s+/).length > 12) fails.push(`reply >12 words: "${s}"`);
  console.log(`ROUND ${n}: ${fails.length ? 'FAIL ' + fails.join('; ') : 'PASS'} | latency to first agent response: ${firstResp ?? 'n/a'}ms`);
  return !fails.length;
}
const a = VARIANT === 'sport'
  ? await round(1, 'training for track', { verdict: 'accept', cat: 'sport' })
  : await round(1, 'I need them for fashion, you know', { verdict: 'reject', cat: 'fashion' });
ws.close();
process.exit(a && firstOk ? 0 : 1);
