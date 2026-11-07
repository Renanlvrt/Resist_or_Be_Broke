// Usage: npx tsx .claude/skills/contracts/check.ts   (run from repo root)
// Validates packages/shared/demo-*.json against interfaces parsed from packages/shared/types.ts.
import { readFileSync } from 'node:fs';

const src = readFileSync('packages/shared/types.ts', 'utf8').replace(/\/\/.*$/gm, '');
const unions: Record<string, string[]> = {};
for (const m of src.matchAll(/export type (\w+)\s*=\s*([^;]+);/g))
  unions[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);

function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let d = 0, cur = '';
  for (const c of s) {
    if ('{<(['.includes(c)) d++;
    if ('}>)]'.includes(c)) d--;
    if (c === sep && d === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function body(name: string): string {
  const i = src.indexOf(`interface ${name}`);
  if (i < 0) throw new Error(`no interface ${name}`);
  const j = src.indexOf('{', i);
  let d = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') d++;
    if (src[k] === '}' && --d === 0) break;
  }
  return src.slice(j + 1, k);
}
function fields(b: string) {
  return splitTop(b, ';').map((f) => f.trim()).filter(Boolean).map((f) => {
    const m = f.match(/^(\w+)(\?)?\s*:\s*([\s\S]+)$/)!;
    return { key: m[1], opt: !!m[2], type: m[3].trim() };
  });
}
const errs: string[] = [];
function check(v: any, t: string, path: string) {
  t = t.trim();
  if (t.startsWith('{')) {
    if (typeof v !== 'object' || v === null) return errs.push(`${path}: expected object`);
    return checkObj(v, t.slice(1, -1), path);
  }
  const rec = t.match(/^Record<(\w+),\s*([\s\S]+)>$/);
  if (rec) {
    const keys = unions[rec[1]] ?? [];
    for (const k of keys) {
      if (!(k in (v ?? {}))) errs.push(`${path}.${k}: missing`);
      else check(v[k], rec[2], `${path}.${k}`);
    }
    for (const k of Object.keys(v ?? {})) if (!keys.includes(k)) errs.push(`${path}.${k}: unknown key`);
    return;
  }
  if (t === 'string' || t === 'number' || t === 'boolean')
    return typeof v === t || errs.push(`${path}: expected ${t}, got ${typeof v}`);
  const lits = [...t.matchAll(/'([^']+)'/g)].map((x) => x[1]);
  if (lits.length) return lits.includes(v) || errs.push(`${path}: ${JSON.stringify(v)} not in ${lits.join('|')}`);
  if (unions[t]) return unions[t].includes(v) || errs.push(`${path}: ${JSON.stringify(v)} not in ${t}`);
}
function checkObj(v: any, b: string, path: string) {
  const fs = fields(b);
  for (const f of fs) {
    if (!(f.key in v)) { if (!f.opt) errs.push(`${path}.${f.key}: missing`); continue; }
    check(v[f.key], f.type, `${path}.${f.key}`);
  }
  for (const k of Object.keys(v)) if (!fs.some((f) => f.key === k)) errs.push(`${path}.${k}: not in type`);
}
const targets: [string, string][] = [
  ['packages/shared/demo-profile.json', 'Profile'],
  ['packages/shared/demo-product.json', 'Product'],
  ['packages/shared/demo-search-cached.json', 'SearchResult'],
];
for (const [file, type] of targets) {
  const before = errs.length;
  try { checkObj(JSON.parse(readFileSync(file, 'utf8')), body(type), type); }
  catch (e) { errs.push(`${file}: ${(e as Error).message}`); }
  console.log(`${errs.length === before ? 'PASS' : 'FAIL'} ${file} as ${type}`);
}
errs.forEach((e) => console.log('  - ' + e));
process.exit(errs.length ? 1 : 0);
