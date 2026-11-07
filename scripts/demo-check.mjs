// Pre-pitch check. Node 24, built-ins only. Exit 1 if any FAIL.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.env.BACKEND ?? 'http://localhost:8787';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f) => JSON.parse(readFileSync(path.join(root, 'packages/shared', f), 'utf8'));
const c = { PASS: '\x1b[32mPASS\x1b[0m', FAIL: '\x1b[31mFAIL\x1b[0m', WARN: '\x1b[33mWARN\x1b[0m' };
const counts = { PASS: 0, FAIL: 0, WARN: 0 };
const out = (s, msg) => { counts[s]++; console.log(`${c[s]}  ${msg}`); };
const post = async (url, body, ms = 15000) => {
  const t = Date.now();
  const r = await fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  return { r, ms: Date.now() - t };
};
const step = async (name, fn) => {
  try { await fn(); } catch (e) { out('FAIL', `${name}: ${e?.name === 'TimeoutError' ? 'timeout' : (e?.message ?? e)}`); }
};

const profile = rd('demo-profile.json');
const product = rd('demo-product.json');

// Start the slow agent round-trips right away, in parallel with the quick checks.
const runE2E = (variant) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(root, 'scripts/e2e-voice.mjs'), variant], { env: process.env });
  let buf = '';
  p.stdout.on('data', (d) => (buf += d));
  p.stderr.on('data', (d) => (buf += d));
  const timer = setTimeout(() => { p.kill(); resolve({ code: -1, buf: buf + '\ntimeout' }); }, 75000);
  p.on('close', (code) => { clearTimeout(timer); resolve({ code, buf }); });
});
const e2eJobs = ['fashion', 'need'].map((v) => runE2E(v).then((r) => [v, r]));

await step('backend /health', async () => {
  const r = await fetch(BASE + '/health', { signal: AbortSignal.timeout(3000) });
  const j = await r.json();
  j.ok ? out('PASS', `backend /health (${BASE})`) : out('FAIL', 'backend /health not ok');
});

await step('voice session', async () => {
  const { r, ms } = await post('/api/voice/session', { profile, product });
  const j = await r.json().catch(() => ({}));
  r.ok && /^wss:\/\//.test(j.signedUrl ?? '')
    ? out('PASS', `/api/voice/session signedUrl (${ms}ms)`)
    : out('FAIL', `/api/voice/session ${r.status} ${JSON.stringify({ error: j.error }).slice(0, 120)}`);
});

await step('voice speak', async () => {
  const { r, ms } = await post('/api/voice/speak', { text: 'Why do you need these shoes?' });
  const buf = r.ok ? (await r.arrayBuffer()).byteLength : 0;
  const hit = r.headers.get('x-tts-cache') === 'hit';
  if (!r.ok || buf < 1000) out('FAIL', `/api/voice/speak ${r.status}, ${buf} bytes`);
  else if (hit && ms >= 300) out('FAIL', `/api/voice/speak cached but slow: ${ms}ms (>=300)`);
  else if (!hit) out('WARN', `/api/voice/speak opening line NOT cached (${ms}ms), run warm-cache`);
  else out('PASS', `/api/voice/speak opening line cached, ${buf} bytes, ${ms}ms`);
});

const shoes = [
  ['Nike Revolution 8 (B0DPHTGD5C)', { title: "Nike Men's Revolution 8 Sneakers, Black/White", brand: 'Nike', price: 45.0, url: 'https://www.amazon.co.uk/dp/B0DPHTGD5C' }],
  ['Brooks Glycerin 22 (B0DBBBN8YP)', { title: "Brooks Glycerin 22 Men's Road Running Shoes", brand: 'Brooks', price: 184.0, url: 'https://www.amazon.co.uk/dp/B0DBBBN8YP' }],
  ['PUMA Viz Runner (B08KKVTB76)', { title: "PUMA Men's Viz Runner WideCross-Trainer", brand: 'PUMA', price: 59.67, url: 'https://www.amazon.co.uk/dp/B08KKVTB76' }],
  ['FitVille trainers', { title: 'FitVille Mens Wide Fit Trainers Lightweight Sneakers', brand: 'FitVille', price: 44.99, url: 'https://www.amazon.co.uk/dp/FITVILLE' }],
];
for (const [name, p] of shoes) {
  await step('search ' + name, async () => {
    const { r, ms } = await post('/api/search', { product: { ...p, currency: 'GBP', site: 'amazon.co.uk' } });
    const j = await r.json();
    const a = j.alternative;
    if (j.found && a && /^https:\/\//.test(a.url ?? '') && a.price < p.price) out('PASS', `search ${name}: ${a.retailer} GBP ${a.price} < ${p.price} (${ms}ms)`);
    else out('FAIL', `search ${name}: found=${j.found} price=${a?.price} url=${a?.url}`);
  });
}

try {
  const { r, ms } = await post('/api/search', { product: { title: 'Nike Pegasus 41 Running Shoes', brand: 'Nike', price: 119.99, currency: 'GBP', site: 'amazon.co.uk', url: 'https://www.amazon.co.uk/dp/LIVE' } }, 25000);
  const j = await r.json();
  j.found && j.alternative
    ? out('PASS', `live search Nike Pegasus 41: ${j.alternative.retailer} GBP ${j.alternative.price} (${ms}ms)`)
    : out('WARN', `live search slow/none (${ms}ms): stick to the safe demo shoes`);
} catch {
  out('WARN', 'live search slow/none (timeout): stick to the safe demo shoes');
}

await step('extension build', async () => {
  const f = path.join(root, 'extension/.output/chrome-mv3/manifest.json');
  if (!existsSync(f)) return out('FAIL', 'extension build missing: cd extension; npm run build');
  const m = JSON.parse(readFileSync(f, 'utf8'));
  const cs = (m.content_scripts ?? []).some((x) => (x.js ?? []).length);
  const bg = !!m.background?.service_worker;
  cs && bg ? out('PASS', `extension build ok (v${m.version}, content script + background)`) : out('FAIL', `extension manifest incomplete (content=${cs}, background=${bg})`);
});

await step('tts cache', async () => {
  const d = path.join(root, 'backend/cache/tts');
  const n = existsSync(d) ? readdirSync(d).filter((x) => x.endsWith('.mp3')).length : 0;
  n >= 30 ? out('PASS', `backend/cache/tts has ${n} mp3`) : out('FAIL', `backend/cache/tts has only ${n} mp3 (need >=30)`);
});

console.log('waiting for agent round-trips (about 30s)...');
for (const [v, { code, buf }] of await Promise.all(e2eJobs)) {
  if (code === 0) out('PASS', `agent websocket round-trip: ${v}`);
  else out('FAIL', `agent websocket round-trip: ${v} (${buf.split('\n').filter((l) => /FAIL|timeout|error|failed/i.test(l)).slice(0, 2).join(' | ').slice(0, 220)})`);
}

console.log(`\nSUMMARY: ${counts.PASS} PASS, ${counts.WARN} WARN, ${counts.FAIL} FAIL`);
process.exit(counts.FAIL ? 1 : 0);
