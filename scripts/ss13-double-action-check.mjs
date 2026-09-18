/* ss13-double-action-check.mjs — SS13 double-action/idempotency hardening.

   js/overtime/overtime-center.js#confirmSaveDailyEntry() batch-writes every
   pending overtime entry for a date via svc.createDailyEntries() — a real
   Firebase write. It has TWO independent trigger paths: the Save Confirm
   dialog's "Simpan" button (data-act="confirmSaveDailyEntry", dispatched
   through onClick) and its own direct Enter-keydown shortcut in
   onRekapGridKeydown (FIX 14 — "both the dialog's Simpan button AND its
   ENTER keyboard shortcut call the exact same logic"). NEITHER path was
   guarded against firing again while the first write was still in flight:
   a rapid double-click, or a double Enter-press before the first await
   resolves, could submit the SAME employeeIds/date batch twice — a real
   payroll-data defect (duplicate overtime entries), not a cosmetic one.

   Fix: _savingDailyEntry, a module-level in-flight guard checked
   synchronously (before any await) and always released in a finally.

   [1] static  — the guard is wired into confirmSaveDailyEntry().
   [2] dynamic — this file's import chain reaches overtime-service.js, a
       real Firebase-writing module (this project's own recorded
       constraint: headless scripts hitting production RTDB is a known
       hazard) — so, same approach as ss13-search-race-check.mjs, the real
       module is never imported/executed here. Instead this proves the
       REENTRANCY GUARD PATTERN itself — record-a-boolean-before-the-await,
       release-in-finally — actually prevents a double dispatch from
       reaching the write, in total isolation with a fake, delayed "write".

   Run: node scripts/ss13-double-action-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

console.log('[1 — static: the guard is wired into confirmSaveDailyEntry()]');
const src = fs.readFileSync(path.join(ROOT, 'js/overtime/overtime-center.js'), 'utf-8');
check('a module-level _savingDailyEntry in-flight guard exists', /let _savingDailyEntry = false;/.test(src));
const fnBody = src.slice(src.indexOf('async function confirmSaveDailyEntry()'), src.indexOf('function saveConfirmModal()'));
check('the guard is checked (and returns early) BEFORE any Firebase write is attempted',
  /if \(_savingDailyEntry\) return;[\s\S]*?const result = await svc\.createDailyEntries/.test(fnBody));
check('the guard is set to true BEFORE the await (synchronously, closing the race window)',
  /_savingDailyEntry = true;\s*\n\s*try \{/.test(fnBody));
check('the guard is released in a finally (so a failed save can still be retried, not permanently locked out)',
  /\} finally \{\s*\n\s*_savingDailyEntry = false;\s*\n\s*\}/.test(fnBody));
check('both trigger paths (button data-act dispatch, direct Enter-keydown shortcut) still call the SAME guarded function',
  /case 'confirmSaveDailyEntry': await confirmSaveDailyEntry\(\); return;/.test(src) &&
  /if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); confirmSaveDailyEntry\(\); \}/.test(src));

console.log('\n[2 — dynamic (isolated): the reentrancy guard pattern actually blocks a concurrent double-submit]');

// A minimal stand-in for svc.createDailyEntries(): resolves after delayMs,
// counting how many times the "real write" actually happened.
function makeFakeWriteCounter(delayMs) {
  let calls = 0;
  return {
    write: () => { calls++; return new Promise((resolve) => setTimeout(() => resolve({ count: 1 }), delayMs)); },
    get calls() { return calls; },
  };
}

function makeGuardedSaver(writeFn) {
  let saving = false;
  let successes = 0;
  async function confirmSave() {
    if (saving) return; // the fix under test
    saving = true;
    try { await writeFn(); successes++; }
    finally { saving = false; }
  }
  return { confirmSave, get successes() { return successes; } };
}

console.log('  -- rapid double-click shape: two calls fired back-to-back before the first await resolves --');
{
  const counter = makeFakeWriteCounter(50);
  const saver = makeGuardedSaver(counter.write);
  const p1 = saver.confirmSave(); // button click
  const p2 = saver.confirmSave(); // Enter keydown, milliseconds later, same tick
  await Promise.all([p1, p2]);
  check('the underlying write happened exactly ONCE, not twice', counter.calls === 1, counter.calls);
  check('exactly one save was counted as successful', saver.successes === 1, saver.successes);
}

console.log('  -- three overlapping triggers (click + click + Enter) --');
{
  const counter = makeFakeWriteCounter(30);
  const saver = makeGuardedSaver(counter.write);
  await Promise.all([saver.confirmSave(), saver.confirmSave(), saver.confirmSave()]);
  check('still exactly ONE write out of three overlapping triggers', counter.calls === 1, counter.calls);
}

console.log('  -- sequential (non-overlapping) saves are NOT blocked by each other --');
{
  const counter = makeFakeWriteCounter(10);
  const saver = makeGuardedSaver(counter.write);
  await saver.confirmSave();
  await saver.confirmSave(); // a genuinely separate, later save (e.g. the next day) must still work
  check('two sequential, non-overlapping saves both went through', counter.calls === 2, counter.calls);
}

console.log('  -- a failed write releases the guard, so retrying is not permanently locked out --');
{
  let calls = 0;
  const flakyWrite = () => { calls++; return calls === 1 ? Promise.reject(new Error('network blip')) : Promise.resolve({ count: 1 }); };
  const saver = makeGuardedSaver(flakyWrite);
  await saver.confirmSave().catch(() => {}); // guardedSaver doesn't catch internally in this minimal repro — simulate the app's own try/catch
  // makeGuardedSaver's finally already runs regardless of throw/resolve, so a second attempt should proceed:
  await saver.confirmSave();
  check('after a failed first attempt, a retry is NOT blocked by a stuck guard', calls === 2, calls);
}

console.log(`\nss13-double-action-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
