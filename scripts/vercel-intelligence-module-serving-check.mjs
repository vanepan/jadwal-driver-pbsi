/* ============================================================
   vercel-intelligence-module-serving-check.mjs

   Guards the V2 Intelligence hotfix: the Sarpras Intelligence workspace is
   a RUNTIME dynamic import (js/config/module-loader-registry.js →
   src/ui/sarpras-intelligence-center.js and → js/intelligence-backend-
   wiring.js → src/intelligence/**). If any module in that transitive graph
   is not deployable to the Vercel production surface (excluded by
   .vercelignore or 404'd by a vercel.json route, or not git-tracked), the
   whole dynamic import fails with "Failed to fetch dynamically imported
   module" and Sarpras Intelligence renders blank — the exact bug this
   check exists to prevent from recurring (it has bitten twice before —
   see the .vercelignore header + js/config.js VERSION_HISTORY v1.25.x).

   Pure Node, no deps. Walks the static + dynamic import graph from the two
   entry points and asserts every reachable js/ + src/ file is:
     • git-tracked (so Vercel receives it), and
     • not matched by any .vercelignore pattern, and
     • not returned as 404 by any vercel.json route.

   Run:  node scripts/vercel-intelligence-module-serving-check.mjs
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

/* ── the two runtime entry points (the memoized dynamic imports) ─────── */
const ENTRY_POINTS = [
  'js/intelligence-backend-wiring.js',
  'src/ui/sarpras-intelligence-center.js',
];

/* ── files that will reach Vercel = git-tracked + untracked-not-ignored
      (a brand-new, not-yet-committed module still deploys once committed) ── */
const tracked = new Set([
  ...execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean),
  ...execSync('git ls-files --others --exclude-standard', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean),
]);

/* ── .vercelignore matcher (gitignore-style, as Vercel documents) ────── */
function loadIgnorePatterns() {
  const raw = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8');
  return raw.split('\n')
    .map((l) => l.replace(/\r$/, '').trim())
    .filter((l) => l && !l.startsWith('#'));
}
const IGNORE = loadIgnorePatterns();

/** Minimal but faithful gitignore semantics for the pattern shapes this
 *  repo actually uses: `/dir/`, `dir/`, `*.ext`, `/file`, `name`. */
function isVercelIgnored(rel) {
  const parts = rel.split('/');
  for (const pat of IGNORE) {
    if (pat.startsWith('*.')) {
      const ext = pat.slice(1); // ".md"
      if (rel.endsWith(ext)) return pat;
      continue;
    }
    const anchored = pat.startsWith('/');
    const body = pat.replace(/^\//, '').replace(/\/$/, '');
    const isDirPat = pat.endsWith('/');
    if (anchored) {
      if (isDirPat) { if (rel === body || rel.startsWith(body + '/')) return pat; }
      else if (rel === body || rel.startsWith(body + '/')) return pat;
    } else {
      // unanchored: match a path component of that name at any depth
      if (isDirPat) { if (parts.includes(body)) return pat; }
      else if (parts.includes(body) || rel === body) return pat;
    }
  }
  return null;
}

/* ── vercel.json route 404 matcher ──────────────────────────────────── */
const vercelJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const NOT_FOUND_ROUTES = (vercelJson.routes || [])
  .filter((r) => r.status === 404 && typeof r.src === 'string')
  .map((r) => new RegExp(r.src));
function vercelRoute404(rel) {
  const url = '/' + rel;
  for (const re of NOT_FOUND_ROUTES) if (re.test(url)) return re.source;
  return null;
}

/* ── resolve a relative import specifier from a file ────────────────── */
function resolveSpec(fromRel, spec) {
  if (!spec.startsWith('.')) return null; // bare / URL specifier — not a repo file
  const abs = path.resolve(ROOT, path.dirname(fromRel), spec);
  let rel = path.relative(ROOT, abs).split(path.sep).join('/');
  if (!/\.[a-z]+$/i.test(rel)) rel += '.js';
  return rel;
}

/* ── static + dynamic import specifiers in a source file ────────────── */
const SPEC_RE = /(?:^|[^.\w])(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]|(?:^|[^.\w])import\(\s*['"]([^'"]+)['"]\s*\)/g;
function importsOf(rel) {
  let src;
  try { src = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return []; }
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const out = [];
  let m;
  while ((m = SPEC_RE.exec(src))) { const s = m[1] || m[2]; if (s) out.push(s); }
  return out;
}

/* ── BFS the whole reachable graph ─────────────────────────────────── */
section('Transitive import graph from the Sarpras Intelligence entry points');
const seen = new Set();
const queue = [...ENTRY_POINTS];
const missing = [];      // not git-tracked
const ignored = [];      // excluded by .vercelignore
const routed404 = [];    // 404'd by vercel.json
const unresolved = [];   // relative spec that resolved to a nonexistent file

while (queue.length) {
  const rel = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);

  const onDisk = fs.existsSync(path.join(ROOT, rel));
  if (!onDisk) { unresolved.push(rel); continue; }
  if (!tracked.has(rel)) missing.push(rel);
  const ig = isVercelIgnored(rel); if (ig) ignored.push([rel, ig]);
  const rt = vercelRoute404(rel); if (rt) routed404.push([rel, rt]);

  for (const spec of importsOf(rel)) {
    const dep = resolveSpec(rel, spec);
    if (dep && !seen.has(dep)) queue.push(dep);
  }
}

console.log(`  reachable modules: ${seen.size} (js/ + src/ + siblings)`);

section('Every reachable module must be Vercel-servable');
check(unresolved.length === 0, `all relative imports resolve to a real file (${unresolved.join(', ') || 'ok'})`);
check(missing.length === 0, `all reachable modules are git-tracked (${missing.join(', ') || 'ok'})`);
check(ignored.length === 0, `NO reachable module is excluded by .vercelignore (${ignored.map(([f, p]) => `${f} ⟵ "${p}"`).join('; ') || 'ok'})`);
check(routed404.length === 0, `NO reachable module is 404'd by a vercel.json route (${routed404.map(([f, p]) => `${f} ⟵ /${p}/`).join('; ') || 'ok'})`);

section('Regression anchors — the exact modules from the production error');
for (const f of [
  'js/intelligence-backend-wiring.js',
  'src/ui/sarpras-intelligence-center.js',
  'src/intelligence/client-bootstrap.js',
  'src/intelligence/service/intelligence-service.js',
  'src/intelligence/console/intelligence-console-controller.js',
]) {
  check(tracked.has(f) && !isVercelIgnored(f) && !vercelRoute404(f), `${f} — tracked, not ignored, not route-404'd`);
}
check(!IGNORE.some((p) => p === '/src/' || p === 'src/' || p === '/src'), '.vercelignore no longer excludes /src/');
check(!(vercelJson.routes || []).some((r) => /\^\/src/.test(r.src || '') && r.status === 404), "vercel.json has no `^/src(...)` → 404 route");

section('Guard — the exclusions that MUST stay (docs/scripts/functions/etc.)');
for (const p of ['docs/x.md', 'scripts/x.mjs', 'functions/index.js', 'legacy/x.js', 'database.rules.json']) {
  check(!!isVercelIgnored(p), `${p} is still excluded from the Vercel surface`);
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
process.exit(fail === 0 ? 0 : 1);
