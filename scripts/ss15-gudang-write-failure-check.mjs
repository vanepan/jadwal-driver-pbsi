/* ss15-gudang-write-failure-check.mjs — SS15 write-failure containment for
   js/gudang/repository/stock-repository.js#saveProjection().

   Every repository write in js/gudang/repository/ follows the same contract:
   storeFirebaseData()'s raw (uncaught-by-design, see js/firebase.js) Firebase
   set() promise is wrapped in try/catch and converted to a failure() Result
   — movement-repository.js#appendMovement is the reference implementation.
   saveProjection() was the one write in this layer that called
   storeFirebaseData() completely unguarded.

   Real-world effect: recalculateStock() (projection/stock-projection-
   engine.js) calls `return saveProjection(projection);` with no try/catch,
   and executeGoodsIn()/executeGoodsOut() (consumable/goods-{in,out}-
   engine.js) await recalculateStock() inside a for-loop with no try/catch
   either — all of them trusting the Result contract instead of a throw.
   Their own callers, gudang-goods-in.js/gudang-goods-out.js's trySave(),
   also have no try/catch (they trust the same contract), only
   `b.saving = false` on the line AFTER the awaited call. A rejected
   Firebase write inside saveProjection() — permission-denied, dropped
   connection, quota — used to propagate as an unhandled rejection all the
   way up, skipping `b.saving = false` entirely: the movement itself had
   already been recorded (appendMovement succeeded), but the Goods In/Out
   screen's "saving" flag got permanently stuck at true, blocking any
   further save without a full page reload — a real partial-failure /
   stuck-loading-state defect in a HIGH-PRIORITY write path (physical
   inventory movements), not a cosmetic one.

   Fix: saveProjection() now wraps storeFirebaseData() in try/catch and
   returns failure(REPOSITORY_ERROR.WRITE_FAILED, ...) on rejection, exactly
   matching appendMovement()'s existing pattern.

   [1] static  — the try/catch is wired into saveProjection() and matches
       the reference pattern already proven in appendMovement().
   [2] dynamic — proves the wrap-in-try/catch-return-failure() pattern
       itself actually converts a rejected write into a Result instead of
       an unhandled rejection, and that the caller's busy-flag release
       (trySave()'s `b.saving = false`) only ever runs when the callee
       cannot throw — in total isolation (this project's own recorded
       constraint: headless scripts must never drive real Firebase-writing
       modules, so stock-repository.js/firebase.js are never imported or
       executed here).

   Run: node scripts/ss15-gudang-write-failure-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail !== undefined) console.log('     ' + JSON.stringify(detail)); }
};

console.log('[1 — static: saveProjection() now matches appendMovement()\'s try/catch-around-storeFirebaseData pattern]');

const movementSrc = fs.readFileSync(path.join(ROOT, 'js/gudang/repository/movement-repository.js'), 'utf-8');
const stockSrc = fs.readFileSync(path.join(ROOT, 'js/gudang/repository/stock-repository.js'), 'utf-8');

check('reference: appendMovement() wraps storeFirebaseData() in try/catch',
  /try \{\s*\n\s*await storeFirebaseData\(/.test(movementSrc) &&
  /\} catch \(err\) \{\s*\n\s*return failure\(REPOSITORY_ERROR\.WRITE_FAILED,/.test(movementSrc));

const saveProjectionBody = stockSrc.slice(stockSrc.indexOf('export async function saveProjection'), stockSrc.indexOf('export async function getProjection'));
check('saveProjection() wraps storeFirebaseData() in try/catch (was: unguarded, could throw)',
  /try \{\s*\n\s*await storeFirebaseData\(/.test(saveProjectionBody));
check('saveProjection() returns a failure() Result on write rejection, matching REPOSITORY_ERROR.WRITE_FAILED',
  /\} catch \(err\) \{\s*\n\s*return failure\(REPOSITORY_ERROR\.WRITE_FAILED,/.test(saveProjectionBody));
check('saveProjection() still returns success(projection) on the happy path',
  /return success\(projection\);/.test(saveProjectionBody));

console.log('\n[2 — dynamic (isolated): the wrap-in-try/catch-return-failure() pattern actually contains a rejected write]');

function success(data) { return { ok: true, data }; }
function failure(code, message) { return { ok: false, error: { code, message } }; }

// Stand-ins for the OLD (unguarded) and NEW (guarded) saveProjection shape,
// against a storeFirebaseData that rejects (simulating permission-denied /
// dropped connection / quota) — proving the fix, not just restating it.
function makeRejectingWrite() { return () => Promise.reject(new Error('PERMISSION_DENIED')); }

async function oldSaveProjection(storeFirebaseData, projection) {
  await storeFirebaseData('path', projection); // no try/catch — the bug
  return success(projection);
}
async function newSaveProjection(storeFirebaseData, projection) {
  try {
    await storeFirebaseData('path', projection);
  } catch (err) {
    return failure('WRITE_FAILED', `rejected (${err.message})`);
  }
  return success(projection);
}

console.log('  -- OLD shape: a rejected write throws past the caller, matching the historical defect --');
{
  let threw = false;
  try { await oldSaveProjection(makeRejectingWrite(), { itemId: 'x' }); }
  catch (_e) { threw = true; }
  check('confirms the bug: the OLD unguarded shape rejects instead of returning a Result', threw);
}

console.log('  -- NEW shape: a rejected write is converted to a failure() Result, never throws --');
{
  let threw = false;
  let result;
  try { result = await newSaveProjection(makeRejectingWrite(), { itemId: 'x' }); }
  catch (_e) { threw = true; }
  check('the NEW guarded shape does NOT throw', !threw);
  check('it returns ok:false instead', result && result.ok === false, result);
  check('the error code is WRITE_FAILED', result && result.error && result.error.code === 'WRITE_FAILED', result);
}

console.log('  -- end-to-end: a caller\'s busy-flag release (trySave()\'s `saving = false`) only ever runs when the callee cannot throw --');
{
  // Mirrors gudang-goods-in.js#trySave(): `b.saving = true; const res = await
  // executeGoodsIn(...); b.saving = false;` — no try/catch, trusting the
  // Result contract. Proves: once the callee is guaranteed never to throw,
  // the caller's own lack of try/catch is safe.
  async function trySave(execute) {
    const state = { saving: true };
    const res = await execute(); // would previously have thrown here, skipping the next line
    state.saving = false;
    return { state, res };
  }
  async function fakeExecuteGoodsIn(storeFirebaseData) {
    // mirrors executeGoodsIn() awaiting recalculateStock() -> saveProjection()
    return newSaveProjection(storeFirebaseData, { itemId: 'x' });
  }
  const { state, res } = await trySave(() => fakeExecuteGoodsIn(makeRejectingWrite()));
  check('the busy flag was released even though the underlying write failed', state.saving === false, state);
  check('the caller still receives an honest failure Result to show the user', res.ok === false, res);
}

console.log(`\nss15-gudang-write-failure-check: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
