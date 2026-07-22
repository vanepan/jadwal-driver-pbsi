/* retry-with-backoff-check.mjs — Node check for Phase 1 "Operational
   Engine Hardening": the bounded retry mechanism (src/file-storage/
   retry-with-backoff.js) that now wraps file-storage-engine.js#uploadFile's
   Storage call. Firebase-free by construction (see that file's header),
   so this exercises the real retry/backoff/give-up logic directly with a
   fake async function — no Storage, no network, no production write.
   Run: node scripts/retry-with-backoff-check.mjs   (exit 0 = pass) */

import { withRetryAsync } from '../src/file-storage/retry-with-backoff.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('\n[Immediate success — zero retries]');
{
  let calls = 0;
  const result = await withRetryAsync(async () => { calls += 1; return { ok: true, value: 'first-try' }; }, { attempts: 3, delaysMs: [1, 1] });
  check('succeeds on the first attempt', result.ok === true && result.value === 'first-try');
  check('never calls fn a second time when the first succeeds', calls === 1);
}

console.log('\n[Succeeds after transient failures]');
{
  let calls = 0;
  const result = await withRetryAsync(async () => {
    calls += 1;
    if (calls < 3) return { ok: false, error: 'transient network hiccup' };
    return { ok: true, value: 'third-try' };
  }, { attempts: 3, delaysMs: [1, 1] });
  check('eventually succeeds within the attempt budget', result.ok === true && result.value === 'third-try');
  check('used exactly 3 attempts (2 failures + 1 success)', calls === 3);
}

console.log('\n[Exhausts retries and reports the real last failure]');
{
  let calls = 0;
  const result = await withRetryAsync(async () => {
    calls += 1;
    return { ok: false, error: `attempt ${calls} failed` };
  }, { attempts: 3, delaysMs: [1, 1] });
  check('reports failure once every attempt is exhausted', result.ok === false);
  check('never exceeds the configured attempt count', calls === 3);
  check('surfaces the real last attempt\'s error, not a fabricated one', result.error === 'attempt 3 failed');
}

console.log('\n[A thrown error is treated as a real failure, not fabricated success]');
{
  let calls = 0;
  const result = await withRetryAsync(async () => {
    calls += 1;
    if (calls < 2) throw new Error('simulated network exception');
    return { ok: true, value: 'recovered' };
  }, { attempts: 3, delaysMs: [1, 1] });
  check('a thrown error on attempt 1 does not abort the retry loop', result.ok === true && result.value === 'recovered');
  check('used 2 attempts (1 thrown + 1 success)', calls === 2);
}

console.log('\n[Default options — no config required]');
{
  let calls = 0;
  const result = await withRetryAsync(async () => { calls += 1; return { ok: calls >= 2, value: calls }; });
  check('defaults (3 attempts) recover a single transient failure with no explicit opts', result.ok === true);
}

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
