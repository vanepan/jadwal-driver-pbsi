/* ============================================================
   intelligence-security-scan-check.mjs — Sarpras Intelligence Foundation (V2, Phase 0)

   PART 25 security review, as an enforceable test. Scans the SHIPPED CLIENT
   surface (index.html, js/**, src/**, *.css, config, service worker) for:

     • provider secrets            OPENAI_API_KEY / sk-<key> / bare "Authorization: Bearer <key>"
     • provider endpoints in client code   api.openai.com / api.anthropic.com
     • a browser-side provider SDK import / client instantiation
     • a secret inside src/intelligence/** or intelligence config

   It does NOT scan node_modules, .git, functions/ (server-side, where a key
   legitimately lives via Secret Manager), or docs/ (prose).

   If a real secret is ever found this check FAILS and prints the FILE PATH
   ONLY — never the secret value.

   Run:  node scripts/intelligence-security-scan-check.mjs   (exit 0 = pass)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

/* ── collect the shipped client-side files ────────────────────────────── */

const SKIP_DIRS = new Set(['node_modules', '.git', '.firebase', 'functions', 'docs', 'scratch', 'legacy', 'vendor', 'Analytics Export', 'Analytics-V2', 'Engineering Operations Prototype', 'Petty Cash Center']);
const CLIENT_EXT = /\.(js|mjs|html|css|json)$/;

function collect(dir) {
  const out = [];
  (function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); }
      else if (CLIENT_EXT.test(e.name) && e.name !== 'package-lock.json') out.push(p);
    }
  })(dir);
  return out;
}

const files = [
  path.join(ROOT, 'index.html'),
  ...collect(path.join(ROOT, 'js')),
  ...collect(path.join(ROOT, 'src')),
  ...collect(path.join(ROOT, 'assets')),
  path.join(ROOT, 'service-worker.js'),
  path.join(ROOT, 'manifest.json'),
].filter((p) => fs.existsSync(p));

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const rel = (p) => path.relative(ROOT, p);
/** JS source with /* *​/ and // comments removed — so a header that says the
 *  word "secret" while explaining there is none does not trip a scan for
 *  credential-shaped CODE. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── patterns ────────────────────────────────────────────────────────── */

const SECRET_PATTERNS = [
  { name: 'OPENAI_API_KEY assignment', re: /OPENAI_API_KEY\s*[:=]\s*['"][^'"]+['"]/ },
  { name: 'OpenAI project/secret key literal (sk-...)', re: /['"]sk-[A-Za-z0-9_-]{16,}['"]/ },
  { name: 'Anthropic key literal (sk-ant-...)', re: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: 'hardcoded Bearer token', re: /Authorization['"]?\s*:\s*['"]Bearer\s+[A-Za-z0-9._-]{20,}['"]/ },
];

const CLIENT_PROVIDER_CALL_PATTERNS = [
  { name: 'api.openai.com in client code', re: /api\.openai\.com/ },
  { name: 'api.anthropic.com in client code', re: /api\.anthropic\.com/ },
  { name: "import of an OpenAI SDK", re: /from\s+['"]openai['"]|require\(['"]openai['"]\)/ },
  { name: "import of the Anthropic SDK", re: /from\s+['"]@anthropic-ai\/sdk['"]|require\(['"]@anthropic-ai\/sdk['"]\)/ },
  { name: "new OpenAI( client instantiation", re: /new\s+OpenAI\s*\(/ },
];

/* ── 1. no provider secret anywhere in the client surface ─────────────── */

section('No provider secret in the shipped client surface (PART 25)');
for (const { name, re } of SECRET_PATTERNS) {
  const offenders = files.filter((p) => re.test(read(p))).map(rel);
  check(offenders.length === 0, `${name}: ${offenders.length === 0 ? 'not present' : 'FOUND in → ' + offenders.join(', ')}`);
}

/* ── 2. no browser-side provider endpoint / SDK / client ──────────────── */

section('No browser-side AI-provider call (PART 4, 5)');
for (const { name, re } of CLIENT_PROVIDER_CALL_PATTERNS) {
  const offenders = files.filter((p) => re.test(read(p))).map(rel);
  check(offenders.length === 0, `${name}: ${offenders.length === 0 ? 'not present' : 'FOUND in → ' + offenders.join(', ')}`);
}

/* ── 3. src/intelligence/** specifically is secret-free and I/O-free ──── */

section('src/intelligence/** is secret-free and side-effect-free');
const intelFiles = collect(path.join(ROOT, 'src/intelligence')).filter((p) => /\.js$/.test(p));
check(intelFiles.length > 0, `scanned ${intelFiles.length} src/intelligence/*.js files`);
const secretInIntel = intelFiles.filter((p) => /sk-[A-Za-z0-9]|OPENAI_API_KEY|(api[_-]?key|token|secret|bearer)\s*[:=]\s*['"]|process\.env\./i.test(stripComments(read(p)))).map(rel);
check(secretInIntel.length === 0, `no key / env-var read in src/intelligence/** (${secretInIntel.join(', ') || 'none'})`);
const IO_RE = /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|from\s+['"][^'"]*firebase|\blocalStorage\.|\bsessionStorage\.|\bdocument\.(getElement|querySelector|createElement|cookie|body|head|addEventListener)|\bwindow\.(location|localStorage|sessionStorage|navigator|addEventListener|open)\b/;
const ioInIntel = intelFiles.filter((p) => IO_RE.test(stripComments(read(p)))).map(rel);
check(ioInIntel.length === 0, `no browser/network/storage access in src/intelligence/** (${ioInIntel.join(', ') || 'none'})`);

/* ── 4. the config that COULD carry a key does not ────────────────────── */

section('intelligence-config.js holds no credential');
const cfgRaw = read(path.join(ROOT, 'src/intelligence/config/intelligence-config.js'));
const cfgCode = stripComments(cfgRaw);
check(cfgRaw.length > 0, 'intelligence-config.js exists');
check(!/(token|secret|apiKey|api_key|bearer|OPENAI_API_KEY)\s*[:=]\s*['"]/i.test(cfgCode), 'no credential-shaped field in intelligence-config.js (comments excluded)');
check(!/sk-[A-Za-z0-9]/.test(cfgCode), 'no key literal in intelligence-config.js');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${fail} failing check(s).`);
if (fail > 0) console.log('\n⚠ If a real secret was reported above: rotate it, and do NOT paste the value anywhere.');
process.exit(fail === 0 ? 0 : 1);
