/* ss15-write-failure-recovery-check.mjs — SS15 write-failure/duplicate-write
   hardening for js/overtime/overtime-center.js's Unit/Employee/RateVersion/
   Holiday create-or-edit forms.

   SS13 (ss13-double-action-check.mjs) fixed this exact class of bug for the
   Daily Entry batch save (_savingDailyEntry). It was NOT extended to the
   four sibling onSubmit() branches: submitUnit, submitEmployee,
   submitRateVersion, submitHoliday. Each renders a plain <form> with a
   `<button type="submit">` that stays enabled for the ENTIRE async
   round-trip — no setState() (and therefore no re-render/disable) happens
   until the write resolves or rejects. A rapid double-click, or hitting
   Enter twice, fires onSubmit() twice before the first `await svc.create*()`
   resolves. svc.createUnit/createEmployee/createRateVersion/createHoliday
   each mint a fresh genId() with no idempotency key, so two concurrent
   calls write two DIFFERENT records — a real duplicate-data defect (a
   duplicated Unit, Employee, Rate Version, or Holiday), not a cosmetic one.

   Fix: a shared `_savingForm` Set, keyed per form ('unit' | 'employee' |
   'rateVersion' | 'holiday'), checked synchronously before any await and
   always released in a finally — same pattern as _savingDailyEntry.

   [1] static  — the guard is wired into all four onSubmit() branches.
   [2] dynamic — proves the reentrancy-guard-via-Set pattern itself actually
       collapses a double dispatch into a single write, in total isolation
       (this project's own recorded constraint: headless scripts must never
       drive real Firebase-writing modules, so overtime-service.js is never
       imported/executed here — see ss13-double-action-check.mjs for the
       same convention).

   Run: node scripts/ss15-write-failure-recovery-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

console.log('[1 — static: the guard is wired into all four onSubmit() write branches]');
const src = fs.readFileSync(path.join(ROOT, 'js/overtime/overtime-center.js'), 'utf-8');

check('a shared _savingForm in-flight guard exists', /const _savingForm = new Set\(\);/.test(src));

const onSubmitBody = src.slice(src.indexOf('async function onSubmit(e)'), src.length);
for (const [act, key, writeCall] of [
  ['submitUnit', 'unit', 'svc.createUnit'],
  ['submitEmployee', 'employee', 'svc.createEmployee'],
  ['submitRateVersion', 'rateVersion', 'svc.createRateVersion'],
  ['submitHoliday', 'holiday', 'svc.createHoliday'],
]) {
  const start = onSubmitBody.indexOf(`if (act === '${act}')`);
  check(`${act}: branch found`, start !== -1);
  const nextBranch = onSubmitBody.indexOf("if (act === '", start + 1);
  const body = onSubmitBody.slice(start, nextBranch === -1 ? undefined : nextBranch);
  check(`${act}: guard checked (and returns early) BEFORE any write is attempted`,
    new RegExp(`if \\(_savingForm\\.has\\('${key}'\\)\\) return;[\\s\\S]*?${writeCall.replace('.', '\\.')}`).test(body));
  check(`${act}: guard is added to the Set synchronously (before the try block's await)`,
    new RegExp(`_savingForm\\.add\\('${key}'\\);[\\s\\S]*?try \\{`).test(body));
  check(`${act}: guard is released in a finally (a failed save can still be retried)`,
    new RegExp(`\\} finally \\{\\s*\\n\\s*_savingForm\\.delete\\('${key}'\\);\\s*\\n\\s*\\}`).test(body));
}

console.log('\n[2 — dynamic (isolated): the Set-based reentrancy guard actually blocks a concurrent double-submit]');

function makeFakeWriteCounter(delayMs, { failFirst = false } = {}) {
  let calls = 0;
  return {
    write: () => {
      calls++;
      const thisCall = calls;
      return new Promise((resolve, reject) => setTimeout(() => {
        if (failFirst && thisCall === 1) reject(new Error('network blip'));
        else resolve({ id: `rec-${thisCall}` });
      }, delayMs));
    },
    get calls() { return calls; },
  };
}

function makeGuardedSubmit(key, writeFn) {
  const saving = new Set();
  let successes = 0;
  async function onSubmit() {
    if (saving.has(key)) return; // the fix under test
    saving.add(key);
    try { await writeFn(); successes++; }
    finally { saving.delete(key); }
  }
  return { onSubmit, get successes() { return successes; } };
}

console.log('  -- rapid double-click shape: two submits fired back-to-back before the first await resolves --');
{
  const counter = makeFakeWriteCounter(50);
  const form = makeGuardedSubmit('unit', counter.write);
  const p1 = form.onSubmit(); // click
  const p2 = form.onSubmit(); // double-click / double Enter, same tick
  await Promise.all([p1, p2]);
  check('the underlying write happened exactly ONCE, not twice (no duplicate record)', counter.calls === 1, counter.calls);
  check('exactly one save was counted as successful', form.successes === 1, form.successes);
}

console.log('  -- independent forms are NOT cross-blocked by each other\'s guard --');
{
  const unitCounter = makeFakeWriteCounter(30);
  const employeeCounter = makeFakeWriteCounter(30);
  const saving = new Set();
  async function submit(key, writeFn) {
    if (saving.has(key)) return;
    saving.add(key);
    try { await writeFn(); } finally { saving.delete(key); }
  }
  await Promise.all([submit('unit', unitCounter.write), submit('employee', employeeCounter.write)]);
  check('the Unit form write went through', unitCounter.calls === 1, unitCounter.calls);
  check('the Employee form write went through (not blocked by the Unit guard)', employeeCounter.calls === 1, employeeCounter.calls);
}

console.log('  -- sequential (non-overlapping) submits are NOT blocked by each other --');
{
  const counter = makeFakeWriteCounter(10);
  const form = makeGuardedSubmit('holiday', counter.write);
  await form.onSubmit();
  await form.onSubmit(); // a genuinely separate, later submit must still work
  check('two sequential, non-overlapping submits both went through', counter.calls === 2, counter.calls);
}

console.log('  -- a failed write releases the guard, so retrying after failure is not permanently locked out --');
{
  const counter = makeFakeWriteCounter(10, { failFirst: true });
  const form = makeGuardedSubmit('rateVersion', counter.write);
  await form.onSubmit().catch(() => {});
  await form.onSubmit();
  check('after a failed first attempt, a retry is NOT blocked by a stuck guard', counter.calls === 2, counter.calls);
  check('exactly one of the two attempts actually succeeded', form.successes === 1, form.successes);
}

console.log(`\nss15-write-failure-recovery-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
