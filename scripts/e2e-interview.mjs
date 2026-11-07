// Text-only e2e test of the live ElevenLabs interviewer agent via backend /api/interview/session.
const BASE = process.env.BACKEND ?? 'http://localhost:8787';
const r = await fetch(`${BASE}/api/interview/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
if (!r.ok) { console.error('session failed', r.status, await r.text()); process.exit(2); }
const { signedUrl } = await r.json();
const ws = new WebSocket(signedUrl);
let events = [], waiter = null;
const log = (...a) => console.log(`[${Date.now() % 100000}]`, ...a);
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', event_id: d.ping_event.event_id }));
  if (d.type === 'agent_response') { events.push({ kind: 'say', text: d.agent_response_event.agent_response }); log('AGENT:', d.agent_response_event.agent_response); }
  else if (d.type === 'client_tool_call') {
    const c = d.client_tool_call;
    events.push({ kind: 'tool', name: c.tool_name, params: c.parameters }); log('TOOL:', c.tool_name, JSON.stringify(c.parameters));
    ws.send(JSON.stringify({ type: 'client_tool_result', tool_call_id: c.tool_call_id, result: 'saved', is_error: false }));
  }
  waiter?.();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, ms) { const end = Date.now() + ms; while (Date.now() < end && !pred()) await new Promise((r) => { waiter = r; setTimeout(r, 200); }); return pred(); }
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
ws.send(JSON.stringify({ type: 'conversation_initiation_client_data' }));
await waitFor(() => events.some((e) => e.kind === 'say'), 15000);
await sleep(4000);
const answers = ['I get about 1100 pounds this month', "I'm saving 400 pounds for a summer holiday by June 30th", 'No fashion or tech this month, and less eating out'];
const fails = [];
for (const [i, a] of answers.entries()) {
  const n = events.length; log(`USER ${i + 1}:`, a);
  ws.send(JSON.stringify({ type: 'user_message', text: a }));
  await waitFor(() => (i === 2 ? events.some((e) => e.kind === 'tool') : events.slice(n).some((e) => e.kind === 'say')), 20000);
  await sleep(i === 2 ? 5000 : 3500);
}
const tool = events.find((e) => e.kind === 'tool' && e.name === 'save_profile');
if (!tool) fails.push('save_profile not called');
else {
  const p = tool.params ?? {};
  if (typeof p.monthlyBudget !== 'number') fails.push('monthlyBudget not number');
  if (typeof p.goalAmount !== 'number') fails.push('goalAmount not number');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.goalBy ?? '')) fails.push('goalBy bad: ' + p.goalBy);
  if (!/fashion/.test(p.noSpendCategories ?? '')) fails.push('noSpend lacks fashion');
  const pr = await fetch(`${BASE}/api/interview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ saveProfile: p }) });
  const prof = await pr.json();
  if (prof.monthlyBudget !== p.monthlyBudget || prof.categories?.fashion?.limit !== 0) fails.push('backend profile mismatch');
  const g = await (await fetch(`${BASE}/api/profile`)).json();
  if (g.monthlyBudget !== prof.monthlyBudget) fails.push('GET /api/profile mismatch');
}
for (const e of events.filter((e) => e.kind === 'say')) if (e.text.split(/\s+/).length > 15) fails.push(`>15 words: "${e.text}"`);
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'PASS');
ws.close();
process.exit(fails.length ? 1 : 0);
