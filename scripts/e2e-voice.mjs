// Text-only e2e test of the live ElevenLabs voice agent via backend /api/voice/session.
import { readFileSync } from 'node:fs';
const BASE = process.env.BACKEND ?? 'http://localhost:8787';
const rd = (f) => JSON.parse(readFileSync(new URL('../packages/shared/' + f, import.meta.url), 'utf8'));
const profile = rd('demo-profile.json'), product = rd('demo-product.json');

const VARIANT = ['sport', 'scarcity', 'need', 'two'].includes(process.argv[2]) ? process.argv[2] : 'fashion';
const REJECT = 'Not a valid reason, come on.';
const ACCEPTS = [
  'Fair enough, just this once.',
  'Real need, this once.',
  'Go on then, you need them.',
];
const MAX_WORDS = 8;
// One sentence only: no sentence-ending punctuation except the final one.
const oneSentence = (s) => !/[.!?]\s+\S/.test(s.trim()) && (s.trim().match(/[.!?]/g) ?? []).length <= 1;
const checkTurn = (s) => {
  const fails = [];
  if (s.split(/\s+/).length > MAX_WORDS) fails.push(`>${MAX_WORDS} words: "${s}"`);
  if (!oneSentence(s)) fails.push(`not one sentence: "${s}"`);
  return fails;
};
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
// Silence step: after the greeting the agent must stay quiet for 15s with no input.
const greetings = events.filter((e) => e.kind === 'say').length;
await sleep(15000);
const unprompted = events.filter((e) => e.kind === 'say').length - greetings;
const silenceOk = unprompted === 0;
console.log(`SILENCE (15s, no input): ${silenceOk ? 'PASS' : 'FAIL ' + unprompted + ' unprompted agent_response(s)'}`);

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
    if (!expect.cats.includes(p.reasonCategory)) fails.push(`category ${p.reasonCategory} not in ${expect.cats}`);
    if (p.spokenLine && !expect.wants.includes(p.spokenLine.trim())) fails.push(`tool spokenLine "${p.spokenLine}" not expected`);
  }
  if (!says.length) fails.push('no agent_response');
  if (says.length && !says.some((x) => expect.wants.includes(x.trim()))) fails.push('spoken line mismatch');
  for (const s of says) fails.push(...checkTurn(s));
  console.log(`ROUND ${n}: ${fails.length ? 'FAIL ' + fails.join('; ') : 'PASS'} | latency to first agent response: ${firstResp ?? 'n/a'}ms`);
  return !fails.length;
}
const a = VARIANT === 'sport'
  ? await round(1, 'training for track', { verdict: 'accept', cats: ['sport'], wants: ACCEPTS })
  : VARIANT === 'two'
    ? (await round(1, 'my friend has them', { verdict: 'reject', cats: ['fashion', 'other'], wants: [REJECT] }))
      && (await round(2, 'okay I am cold and need leather shoes', { verdict: 'accept', cats: ['other', 'sport'], wants: ACCEPTS }))
  : VARIANT === 'scarcity'
    ? await round(1, 'There is only one in stock so I need them now', { verdict: 'reject', cats: ['other'], wants: [REJECT] })
    : VARIANT === 'need'
      ? await round(1, 'I am cold and need leather shoes', { verdict: 'accept', cats: ['other', 'sport'], wants: ACCEPTS })
      : await round(1, 'I need them for fashion, you know', { verdict: 'reject', cats: ['fashion'], wants: [REJECT] });
// Follow-up turn after the verdict: short dry reply, no second decide call.
async function followUp(text) {
  events = []; t0 = Date.now();
  log('FOLLOW-UP USER:', text);
  ws.send(JSON.stringify({ type: 'user_message', text }));
  await waitFor(() => events.some((e) => e.kind === 'say'), 15000);
  await sleep(4000);
  const says = events.filter((e) => e.kind === 'say').map((e) => e.text);
  const decides = events.filter((e) => e.kind === 'tool' && e.name === 'decide');
  const fails = [];
  if (!says.length) fails.push('no agent_response');
  for (const s of says) fails.push(...checkTurn(s));
  if (decides.length) fails.push('decide called again');
  console.log(`FOLLOW-UP: ${fails.length ? 'FAIL ' + fails.join('; ') : 'PASS'}`);
  return !fails.length;
}
const f = await followUp('okay I am going to buy them then');
ws.close();
process.exit(a && f && firstOk && silenceOk ? 0 : 1);
