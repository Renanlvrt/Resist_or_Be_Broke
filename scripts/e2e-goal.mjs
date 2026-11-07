// Text-only e2e of the live ElevenLabs "Add a new goal" agent via backend /api/goals/session.
const BASE = process.env.BACKEND ?? 'http://localhost:8787';
const r = await fetch(`${BASE}/api/goals/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
if (!r.ok) { console.error('session failed', r.status, await r.text()); process.exit(2); }
const { signedUrl } = await r.json();
const ws = new WebSocket(signedUrl);
const events = []; let waiter = null;
const log = (...a) => console.log(`[${Date.now() % 100000}]`, ...a);
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', event_id: d.ping_event.event_id }));
  if (d.type === 'agent_response') { events.push({ kind: 'say', text: d.agent_response_event.agent_response }); log('AGENT:', d.agent_response_event.agent_response); }
  else if (d.type === 'client_tool_call') {
    const c = d.client_tool_call;
    events.push({ kind: 'tool', name: c.tool_name, params: c.parameters }); log('TOOL:', c.tool_name, JSON.stringify(c.parameters));
    ws.send(JSON.stringify({ type: 'client_tool_result', tool_call_id: c.tool_call_id, result: 'Saved. Say the confirmation line.', is_error: false }));
  }
  waiter?.();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms) { const end = Date.now() + ms; while (Date.now() < end && !pred()) await new Promise((r) => { waiter = r; setTimeout(r, 200); }); return pred(); }
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
ws.send(JSON.stringify({ type: 'conversation_initiation_client_data' }));
await waitFor(() => events.some((e) => e.kind === 'say'), 15000);
await sleep(3000);
const fails = [];
const first = events.find((e) => e.kind === 'say')?.text ?? '';
if (!/planning this time/i.test(first)) fails.push('first question wrong: ' + first);
const answers = [process.env.ANSWER ?? 'a trip to Spain in August, about 300 pounds', 'ok, about 300 pounds by the end of August'];
for (const [i, a] of answers.entries()) {
  if (events.some((e) => e.kind === 'tool')) break;
  const n = events.length; log(`USER ${i + 1}:`, a);
  ws.send(JSON.stringify({ type: 'user_message', text: a }));
  await waitFor(() => events.slice(n).some((e) => e.kind === 'tool' || e.kind === 'say'), 20000);
  await waitFor(() => events.some((e) => e.kind === 'tool'), 4000);
}
await sleep(5000); // confirmation line after the tool result
const tool = events.find((e) => e.kind === 'tool' && e.name === 'save_goal');
if (!tool) fails.push('save_goal not called');
else {
  const p = tool.params ?? {};
  if (p.amount !== 300) fails.push('amount not 300: ' + p.amount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.by ?? '') || !/-08-/.test(p.by)) fails.push('by not August date: ' + p.by);
  if (!p.label) fails.push('no label');
  const pr = await fetch(`${BASE}/api/goals`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
  const g = await pr.json();
  if (!g.id || g.amount !== 300) fails.push('POST /api/goals mismatch');
  const prof = await (await fetch(`${BASE}/api/profile`)).json();
  if (!prof.goals?.some((x) => x.id === g.id)) fails.push('goal not in GET /api/profile');
}
const says = events.filter((e) => e.kind === 'say');
for (const e of says) if (e.text.split(/\s+/).length > 10) fails.push(`>10 words: "${e.text}"`);
if (says.length > 4) fails.push('too many agent turns: ' + says.length);
if (!says.some((e) => /added/i.test(e.text))) fails.push('no confirmation line');
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'PASS');
ws.close();
process.exit(fails.length ? 1 : 0);
