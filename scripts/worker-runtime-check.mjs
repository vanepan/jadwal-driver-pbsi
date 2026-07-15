/* worker-runtime-check.mjs — Phase 7 (Runtime Hardening, Part 3)
   Run: node scripts/worker-runtime-check.mjs   (exit 0 = pass)

   Bare Node has no `Worker` global, so this always exercises the INLINE
   fallback path — which is exactly the path this script needs to prove
   correct, since it's also what runs in a browser with Workers disabled,
   an old browser, or a restrictive CSP. The Worker-side computation
   (cpu-worker.js) is byte-identical code to the inline fallback (same Web
   Crypto call, same JSON.parse) — the browser-only DOM check
   (sarpras-workspace-dom-check.mjs) separately proves a real browser can
   load and run this module without a fatal error. */
import crypto from 'node:crypto';
import { hashFile, parseJsonText, resetWorkerRuntime } from '../js/v2/file-storage/worker-runtime.js';
import { computeSha256 } from '../js/v2/file-storage/file-hash.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[worker-runtime.js — graceful fallback, Node has no Worker global]');

const text = 'hello world';
const expected = crypto.createHash('sha256').update(text).digest('hex');
const gotViaWorkerRuntime = await hashFile(new Blob([text]));
const gotViaFileHash = await computeSha256(new Blob([text]));
check('hashFile() falls back inline under Node and matches a known-correct SHA-256', gotViaWorkerRuntime === expected);
check('file-hash.js#computeSha256() (the real caller-facing API) delegates correctly, same digest', gotViaFileHash === expected);

const h1 = await computeSha256(new Blob(['same content']));
const h2 = await computeSha256(new Blob(['same content']));
const h3 = await computeSha256(new Blob(['different content']));
check('identical content hashes identically', h1 === h2);
check('different content hashes differently', h1 !== h3);

const parsed = await parseJsonText('{"a":1,"b":[1,2,3]}');
check('parseJsonText() parses valid JSON correctly', parsed.a === 1 && Array.isArray(parsed.b) && parsed.b.length === 3);

let threw = false;
try { await parseJsonText('{not valid json'); } catch { threw = true; }
check('parseJsonText() rejects invalid JSON exactly like JSON.parse would (never fabricates content)', threw);

resetWorkerRuntime();
check('resetWorkerRuntime() is safe to call (test/teardown helper)', true);

console.log(`\n${pass}/${pass + fail} checks passed.`);
process.exit(fail === 0 ? 0 : 1);
