/* gudang-goods-in-check.mjs — Gudang V1.28.0, Phase 5 (Goods In).

   Authorized by: Doc 1 Art.IV/V · Doc 2 §07 · Doc 3 Ch.04/07 — Phase 5:
   same philosophy as Goods Out, optional price never required, movement
   generated.

   Same check()/throws() harness and the same "only guard-clause paths
   that never touch Firebase" convention as gudang-goods-out-check.mjs.

   Run: node scripts/gudang-goods-in-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateGoodsInBatch, executeGoodsIn } from '../js/gudang/consumable/goods-in-engine.js';
import { MOVEMENT_REASON, makeMovement, isMovement } from '../js/gudang/contracts/movement-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}
function throws(name, fn) {
  try { fn(); check(name, false); }
  catch (_e) { check(name, true); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── Part A — Batch validation rejects bad input before any Firebase call ── */
console.log('\n[Part A — validateGoodsInBatch()/executeGoodsIn() reject bad input before any Firebase call]');
{
  const r1 = await validateGoodsInBatch({ lines: [{ itemId: 'i1', quantity: 1 }], actorId: 'u1' });
  check('missing reason fails INVALID_INPUT (Doc 2 §07: Goods In\'s one up-front choice)', !r1.ok && r1.error.code === 'INVALID_INPUT');

  const r2 = await validateGoodsInBatch({ reason: MOVEMENT_REASON.PURCHASE, lines: [{ itemId: 'i1', quantity: 1 }] });
  check('missing actorId fails INVALID_INPUT', !r2.ok && r2.error.code === 'INVALID_INPUT');

  const r3 = await validateGoodsInBatch({ reason: MOVEMENT_REASON.STOCK_OPNAME, lines: [{ itemId: 'i1', quantity: 1 }], actorId: 'u1' });
  check('reason:STOCK_OPNAME is rejected — that reason belongs to Phase 7, never a Goods In choice', !r3.ok && r3.error.code === 'INVALID_INPUT');

  const r4 = await validateGoodsInBatch({ reason: MOVEMENT_REASON.ISSUE, lines: [{ itemId: 'i1', quantity: 1 }], actorId: 'u1' });
  check('reason:ISSUE is rejected — that reason belongs to Goods Out (Phase 4), never a Goods In choice', !r4.ok && r4.error.code === 'INVALID_INPUT');

  const r5 = await validateGoodsInBatch({ reason: MOVEMENT_REASON.PURCHASE, lines: [], actorId: 'u1' });
  check('an empty lines[] fails INVALID_INPUT', !r5.ok && r5.error.code === 'INVALID_INPUT');

  const r6 = await validateGoodsInBatch({ reason: MOVEMENT_REASON.PURCHASE, lines: [{ itemId: 'i1', quantity: -1 }], actorId: 'u1' });
  check('a negative quantity fails INVALID_INPUT', !r6.ok && r6.error.code === 'INVALID_INPUT');

  const r7 = await validateGoodsInBatch({ reason: MOVEMENT_REASON.PURCHASE, lines: [{ itemId: 'i1', quantity: 1, price: -50 }], actorId: 'u1' });
  check('a negative price fails INVALID_INPUT even though price is optional', !r7.ok && r7.error.code === 'INVALID_INPUT');

  // NOTE: a batch with a valid shape and NO price (proving price is truly
  // optional) is deliberately NOT exercised here — validateGoodsInBatch()
  // would pass shape and proceed to a real getItem() Firebase call this
  // harness has no credentials for. That guarantee is instead proven at
  // the contract level in Part B (makeMovement() without price).

  const r9 = await executeGoodsIn({ reason: '', lines: [{ itemId: 'i1', quantity: 1 }], actorId: 'u1' });
  check('executeGoodsIn() runs the same validation before appending anything', !r9.ok && r9.error.code === 'INVALID_INPUT');
}

/* ── Part B — price: optional, per-line, never required (Phase 5 amendment) ── */
console.log('\n[Part B — Movement.price: optional, per-line, never required (Doc 2 §07)]');
{
  const withPrice = makeMovement({
    movementId: 'mv-1', itemId: 'i1', type: 'goods_in', quantityDelta: 10,
    reason: MOVEMENT_REASON.PURCHASE, actorId: 'u1', price: 15000,
  });
  check('makeMovement() accepts a price and carries it through', isMovement(withPrice) && withPrice.price === 15000);

  const withoutPrice = makeMovement({
    movementId: 'mv-2', itemId: 'i1', type: 'goods_in', quantityDelta: 10,
    reason: MOVEMENT_REASON.PURCHASE, actorId: 'u1',
  });
  check('makeMovement() without price defaults to null, still valid (never required)', isMovement(withoutPrice) && withoutPrice.price === null);

  throws('makeMovement() throws on a negative price', () => makeMovement({
    movementId: 'mv-3', itemId: 'i1', type: 'goods_in', quantityDelta: 10, reason: MOVEMENT_REASON.PURCHASE, actorId: 'u1', price: -1,
  }));
  throws('makeMovement() throws on a non-numeric price', () => makeMovement({
    movementId: 'mv-4', itemId: 'i1', type: 'goods_in', quantityDelta: 10, reason: MOVEMENT_REASON.PURCHASE, actorId: 'u1', price: 'free',
  }));

  const olderMovement = makeMovement({
    movementId: 'mv-5', itemId: 'i1', type: 'goods_out', quantityDelta: -1, reason: MOVEMENT_REASON.ISSUE, actorId: 'u1', departmentId: 'd1',
  });
  check('a pre-Phase-5-style Movement (no price passed) is still valid — the amendment is additive, not breaking', isMovement(olderMovement) && olderMovement.price === null);
}

/* ── Part C — Architecture: composes, never duplicates, Consumable-only ── */
console.log('\n[Part C — Architecture: goods-in-engine.js composes existing engines, Consumable-only]');
{
  const code = read('js/gudang/consumable/goods-in-engine.js');
  check('imports appendMovement from movement-repository.js', /appendMovement.*from ['"]\.\.\/repository\/movement-repository\.js['"]/.test(code));
  check('imports recalculateStock from stock-projection-engine.js (reuses the Doc 3 Ch.05 Rebuild)', /recalculateStock.*from ['"]\.\.\/projection\/stock-projection-engine\.js['"]/.test(code));
  check('never imports asset-repository.js (Goods In is Consumable-only, Doc 1 Art.V)', !code.includes('asset-repository'));
  check('never imports department-repository.js (Doc 2 §07: Goods In\'s one choice is reason, not department)', !code.includes('department-repository'));
  check('never hardcodes a "gudang/..." RTDB path literal', !/['"`]gudang\//.test(code));
  check('never calls storeFirebaseData/runNodeTransaction directly', !code.includes('storeFirebaseData') && !code.includes('runNodeTransaction'));
  check('restricts reason to the 4 Doc 2 §07 values, excluding STOCK_OPNAME and ISSUE', code.includes('MOVEMENT_REASON.PURCHASE') && code.includes('MOVEMENT_REASON.RETURN') && code.includes('MOVEMENT_REASON.TRANSFER') && code.includes('MOVEMENT_REASON.ADJUSTMENT'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
