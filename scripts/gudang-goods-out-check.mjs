/* gudang-goods-out-check.mjs — Gudang V1.28.0, Phase 4 (Goods Out).

   Authorized by: Doc 1 Art.IV/V · Doc 2 §06 · Doc 3 Ch.04/07 — Phase 4:
   Movement-first workflow, no wizard, no CRUD, movement only.

   Same check()/throws() harness as the other Gudang scripts. Everything
   here is a guard-clause path that fails BEFORE any Firebase call (same
   proof convention as gudang-foundation-check.mjs Part C) — this repo has
   no live Firebase credentials available to this harness, so paths that
   need a real department/item read are not exercised here.

   Run: node scripts/gudang-goods-out-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateGoodsOutBatch, executeGoodsOut } from '../js/gudang/consumable/goods-out-engine.js';
import { MOVEMENT_REASON, makeMovement, isMovement } from '../js/gudang/contracts/movement-contract.js';
import { GUDANG_DOMAINS, getDomain, domainsWithFoundation, DOMAIN_STATUS } from '../js/gudang/config/gudang-domain-registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── Part A — Batch validation rejects bad input before any Firebase call ── */
console.log('\n[Part A — validateGoodsOutBatch()/executeGoodsOut() reject bad input before any Firebase call]');
{
  const r1 = await validateGoodsOutBatch({ lines: [{ itemId: 'i1', quantity: 1 }], actorId: 'u1' });
  check('missing departmentId fails INVALID_INPUT without touching Firebase', !r1.ok && r1.error.code === 'INVALID_INPUT');

  const r2 = await validateGoodsOutBatch({ departmentId: 'd1', lines: [{ itemId: 'i1', quantity: 1 }] });
  check('missing actorId fails INVALID_INPUT without touching Firebase', !r2.ok && r2.error.code === 'INVALID_INPUT');

  const r3 = await validateGoodsOutBatch({ departmentId: 'd1', lines: [], actorId: 'u1' });
  check('an empty lines[] fails INVALID_INPUT (no wizard means no "empty batch" save either)', !r3.ok && r3.error.code === 'INVALID_INPUT');

  const r4 = await validateGoodsOutBatch({ departmentId: 'd1', lines: [{ itemId: '', quantity: 1 }], actorId: 'u1' });
  check('a line missing itemId fails INVALID_INPUT', !r4.ok && r4.error.code === 'INVALID_INPUT');

  const r5 = await validateGoodsOutBatch({ departmentId: 'd1', lines: [{ itemId: 'i1', quantity: 0 }], actorId: 'u1' });
  check('a line with quantity 0 fails INVALID_INPUT (must be positive)', !r5.ok && r5.error.code === 'INVALID_INPUT');

  const r6 = await validateGoodsOutBatch({ departmentId: 'd1', lines: [{ itemId: 'i1', quantity: -5 }], actorId: 'u1' });
  check('a line with a negative quantity fails INVALID_INPUT', !r6.ok && r6.error.code === 'INVALID_INPUT');

  const r7 = await validateGoodsOutBatch({ departmentId: 'd1', lines: [{ itemId: 'i1', quantity: 'lots' }], actorId: 'u1' });
  check('a non-numeric quantity fails INVALID_INPUT, never throws', !r7.ok && r7.error.code === 'INVALID_INPUT');

  const r8 = await executeGoodsOut({ departmentId: '', lines: [{ itemId: 'i1', quantity: 1 }], actorId: 'u1' });
  check('executeGoodsOut() runs the same validation as validateGoodsOutBatch() before appending anything', !r8.ok && r8.error.code === 'INVALID_INPUT');

  const r9 = await validateGoodsOutBatch(undefined);
  check('validateGoodsOutBatch(undefined) fails cleanly, never throws', !r9.ok && r9.error.code === 'INVALID_INPUT');
}

/* ── Part B — MOVEMENT_REASON.ISSUE (Phase 4 amendment) ────────────────── */
console.log('\n[Part B — MOVEMENT_REASON.ISSUE: the Phase 4 amendment, contract-level]');
{
  check('MOVEMENT_REASON.ISSUE exists and equals "issue"', MOVEMENT_REASON.ISSUE === 'issue');
  const movement = makeMovement({
    movementId: 'mv-1', itemId: 'i1', type: 'goods_out', quantityDelta: -4,
    reason: MOVEMENT_REASON.ISSUE, departmentId: 'd1', actorId: 'u1',
  });
  check('makeMovement() accepts reason:ISSUE and round-trips through isMovement()', isMovement(movement));
  check('the resulting Movement carries the departmentId Goods Out actually collects', movement.departmentId === 'd1');
}

/* ── Part C — Architecture: goods-out-engine.js composes, never duplicates ── */
console.log('\n[Part C — Architecture: composes existing engines, owns no persistence of its own]');
{
  const code = read('js/gudang/consumable/goods-out-engine.js');
  check('imports appendMovement from movement-repository.js (Movement stays the only write path for quantity truth)', /appendMovement.*from ['"]\.\.\/repository\/movement-repository\.js['"]/.test(code));
  check('imports recalculateStock from stock-projection-engine.js (reuses Doc 3 Ch.05\'s Rebuild, does not reimplement it)', /recalculateStock.*from ['"]\.\.\/projection\/stock-projection-engine\.js['"]/.test(code));
  check('never imports asset-repository.js (Goods Out is Consumable-only, Doc 1 Art.V)', !code.includes('asset-repository'));
  check('never hardcodes a "gudang/..." RTDB path literal', !/['"`]gudang\//.test(code));
  check('never calls storeFirebaseData/runNodeTransaction directly (persistence stays behind the repositories)', !code.includes('storeFirebaseData') && !code.includes('runNodeTransaction'));
  check('checks itemType against ITEM_TYPE.CONSUMABLE before issuing (Doc 1 Art.V enforced, not assumed)', code.includes('ITEM_TYPE.CONSUMABLE'));
}

/* ── Part D — Regression: domain registry stays internally consistent ──── */
console.log('\n[Part D — Regression: domain registry after Phase 4\'s Consumable amendment]');
{
  check('GUDANG_DOMAINS still has exactly 15 entries — Phase 4 added no new domain (F-02)', GUDANG_DOMAINS.length === 15);
  check('Consumable is core + now has a foundation (Phase 4)', getDomain('consumable')?.status === DOMAIN_STATUS.CORE && getDomain('consumable')?.hasFoundation === true);
  // Updated in Phase 8 (Analytics): 9 -> 12. This assertion's job is only
  // to prove Goods Out (Phase 4) itself introduced no unrelated drift —
  // the exact count now tracks whatever the latest phase legitimately set.
  check('domainsWithFoundation() is exactly 12 (Phase 1\'s 8 + Consumable [P4] + analytics/forecast/recommendation [P8])', domainsWithFoundation().length === 12);
  check('Asset domain is untouched by Phase 4 (still hasFoundation:true, unrelated to Goods Out)', getDomain('asset')?.hasFoundation === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
