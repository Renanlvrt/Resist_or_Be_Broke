// Builds the voice bridge and copies the frontend bundle into chrome-mv3-voice/ with the bridge patched in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'chrome-mv3', 'chrome-mv3');
const out = path.join(root, 'chrome-mv3-voice');
const voice = path.join(root, 'packages', 'voice');
const dist = path.join(voice, 'bridge', 'dist');

if (!process.argv.includes('--no-build')) execSync('npm run build:bridge', { cwd: voice, stdio: 'inherit' });
for (const f of ['bridge.js', 'background.js']) if (!fs.existsSync(path.join(dist, f))) throw new Error('missing ' + f);

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
for (const f of ['bridge.js', 'background.js']) fs.copyFileSync(path.join(dist, f), path.join(out, f));
for (const f of ['options.html', 'options.js']) fs.copyFileSync(path.join(voice, 'bridge', f), path.join(out, f));

const mpath = path.join(out, 'manifest.json');
const m = JSON.parse(fs.readFileSync(mpath, 'utf8'));
m.name = m.name + ' + Voice';
m.permissions = [...new Set([...(m.permissions || []), 'storage'])];
m.host_permissions = ['http://localhost:8787/*', 'wss://api.elevenlabs.io/*', 'https://api.elevenlabs.io/*'];
m.background = { service_worker: 'background.js' };
const matches = m.content_scripts?.[0]?.matches || [];
m.content_scripts = [...(m.content_scripts || []), { matches, js: ['bridge.js'], run_at: 'document_idle' }];
m.options_page = 'options.html'; // Extension options > "Allow microphone"
fs.writeFileSync(mpath, JSON.stringify(m, null, 2));
JSON.parse(fs.readFileSync(mpath, 'utf8')); // validity check
console.log('OK ->', out);
