'use strict';

/* assignment-notify-debounce-check.js — validates the v1.25.x Driver
   Notification V2 Final Hardening (Part 2 — REAL debounce) by actually
   RUNNING isStillCurrentAfterDebounce() concurrently with fake, fast
   timers and a fake in-memory "live" store — not just reading the code.
   Run: node functions/scripts/assignment-notify-debounce-check.js
   (exit 0 = all pass)

   This proves, with real (if compressed) async execution:
     - an ISOLATED write settles and is told "still current" (→ sends)
     - in a BURST of rapid writes to the same assignment, every write
       EXCEPT THE LAST is told "superseded" (→ skips), and the LAST one
       alone is told "still current" (→ the ONE notification that sends)
     - a slow "burst" (gaps wider than the debounce window) does NOT
       coalesce — each write settles on its own before the next arrives,
       matching genuine debounce semantics (not a batching window)

   isStillCurrentAfterDebounce is dependency-injected (readLiveFn, sleepFn)
   specifically so this is possible without a live Firebase connection or
   actually waiting out the real (2s default) window — see that function's
   header in onAssignmentWrite.js.
*/

const { isStillCurrentAfterDebounce } = require('../src/events/onAssignmentWrite');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/** A tiny fake "assignments/{id}" store — set() simulates a write arriving. */
function makeFakeStore(initial) {
  let live = initial;
  return {
    set: (v) => { live = v; },
    read: async () => live,
  };
}

async function main() {
  console.log('\n[debounce — isolated edit settles as "still current" → sends]');
  {
    const store = makeFakeStore({ startTime: '09:00' });
    const result = await isStillCurrentAfterDebounce({ startTime: '09:00' }, 30, store.read, sleep);
    check('a single write with no follow-up is still current after its window', result === true);
  }

  console.log('\n[debounce — debounceMs<=0 short-circuits to "always current" (disabled)]');
  {
    const store = makeFakeStore({ startTime: '09:00' });
    const result = await isStillCurrentAfterDebounce({ startTime: '10:00' }, 0, store.read, sleep);
    check('debounceMs=0 never waits, always proceeds', result === true);
  }

  console.log('\n[debounce — a RAPID burst coalesces to exactly ONE "still current"]');
  {
    // Simulates 09:00 → 09:10 → 09:20 → 09:30 → 09:45 → 10:00, six writes
    // arriving 5ms apart, each with its own 30ms debounce window (i.e. each
    // write's window comfortably outlasts the NEXT write's arrival, exactly
    // like a real rapid-edit burst outlasting a short live debounceMs).
    const store = makeFakeStore(null);
    const steps = ['09:00', '09:10', '09:20', '09:30', '09:45', '10:00'];
    const settleResults = [];

    const invocations = steps.map((startTime, i) => new Promise((resolve) => {
      setTimeout(async () => {
        const after = { startTime };
        store.set(after); // this write just landed — it's now the live state
        const stillCurrent = await isStillCurrentAfterDebounce(after, 30, store.read, sleep);
        settleResults.push({ startTime, stillCurrent });
        resolve();
      }, i * 5); // 5ms apart — much faster than the 30ms debounce window
    }));

    await Promise.all(invocations);

    const sentOnes = settleResults.filter((r) => r.stillCurrent);
    check('exactly ONE write out of the six-step burst is "still current"', sentOnes.length === 1);
    check('the ONE that sends is the LAST write (10:00 — the final, coalesced state)',
      sentOnes.length === 1 && sentOnes[0].startTime === '10:00');
    check('all five earlier writes in the burst were superseded (skipped)',
      settleResults.filter((r) => !r.stillCurrent).length === 5);
  }

  console.log('\n[debounce — a SLOW "burst" (gaps wider than the window) does NOT coalesce]');
  {
    // Two edits 50ms apart, but the debounce window is only 20ms — the first
    // one's window closes long before the second edit arrives, so it settles
    // on its own (genuinely a separate, isolated notification), matching real
    // trailing-edge debounce semantics (not a fixed batching interval).
    const store = makeFakeStore({ startTime: '09:00' });
    const firstCheck = isStillCurrentAfterDebounce({ startTime: '09:00' }, 20, store.read, sleep);
    await sleep(50);
    store.set({ startTime: '10:00' });
    const secondCheck = isStillCurrentAfterDebounce({ startTime: '10:00' }, 20, store.read, sleep);
    const [firstResult, secondResult] = await Promise.all([firstCheck, secondCheck]);
    check('the first (isolated, since the gap exceeded the window) edit sends on its own', firstResult === true);
    check('the second (also isolated by then) edit sends on its own too', secondResult === true);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
