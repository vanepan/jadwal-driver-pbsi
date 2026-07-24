/* gudang-movement-history-check.mjs — Gudang V1.28.0, Phase 6 (Movement History).

   Authorized by: Doc 2 §09 · Doc 3 Ch.11 — Phase 6: readable, auditable,
   searchable, reverse chronological, no accounting terminology.

   Same check()/throws() harness as the other Gudang scripts. Only
   formatMovementEntry() (pure) is directly testable — getMovementHistory()
   always reaches a real listMovements() Firebase read with no invalid-input
   guard clause to short-circuit on, exactly like Phase 1's getAuditTrail()
   (also never unit-tested directly, for the same reason).

   Run: node scripts/gudang-movement-history-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatMovementEntry } from '../js/gudang/audit/movement-history-view.js';
import { makeMovement, MOVEMENT_TYPE, MOVEMENT_REASON } from '../js/gudang/contracts/movement-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/* ── Part A — formatMovementEntry: readable, no ledger vocabulary ──────── */
console.log('\n[Part A — formatMovementEntry: who/what/why/when in plain words (Doc 1 Art.VI, Doc 2 §09)]');
{
  const goodsOut = makeMovement({
    movementId: 'mv-1', itemId: 'i1', type: MOVEMENT_TYPE.GOODS_OUT, quantityDelta: -5,
    reason: MOVEMENT_REASON.ISSUE, departmentId: 'd1', actorId: 'u1',
  });
  const entry = formatMovementEntry(goodsOut);
  check('what: "Goods Out", not the raw enum value "goods_out"', entry.what === 'Goods Out');
  check('why: "Issued", not the raw enum value "issue"', entry.why === 'Issued');
  check('who is the actorId, when is the createdAt timestamp (Doc 1 Art.VI)', entry.who === 'u1' && entry.when === goodsOut.createdAt);
  check('quantityDelta, itemId, departmentId, price pass through unmodified', entry.quantityDelta === -5 && entry.itemId === 'i1' && entry.departmentId === 'd1' && entry.price === null);

  const goodsIn = makeMovement({
    movementId: 'mv-2', itemId: 'i1', type: MOVEMENT_TYPE.GOODS_IN, quantityDelta: 20,
    reason: MOVEMENT_REASON.PURCHASE, actorId: 'u2', price: 5000,
  });
  const entry2 = formatMovementEntry(goodsIn);
  check('a second Movement type/reason translates independently ("Goods In" / "Purchase")', entry2.what === 'Goods In' && entry2.why === 'Purchase');
  check('price carries through when present', entry2.price === 5000);

  for (const [label, expected] of [
    ['transfer', 'Transfer'], ['adjustment', 'Adjustment'], ['stock_opname_adjustment', 'Stock Opname Adjustment'], ['return', 'Return'],
  ]) {
    const m = makeMovement({ movementId: `mv-${label}`, itemId: 'i1', type: label, quantityDelta: label === 'return' ? -1 : 3, reason: MOVEMENT_REASON.ADJUSTMENT, actorId: 'u1' });
    check(`type "${label}" translates to "${expected}"`, formatMovementEntry(m).what === expected);
  }

  for (const [label, expected] of [
    ['return', 'Return'], ['transfer', 'Transfer'], ['adjustment', 'Adjustment'], ['stock_opname', 'Stock Opname'],
  ]) {
    const m = makeMovement({ movementId: `mv-r-${label}`, itemId: 'i1', type: MOVEMENT_TYPE.ADJUSTMENT, quantityDelta: 1, reason: label, actorId: 'u1' });
    check(`reason "${label}" translates to "${expected}"`, formatMovementEntry(m).why === expected);
  }

  const labelValues = [...Object.values(entry).map(String), entry2.what, entry2.why].join(' ');
  check('no ledger vocabulary in any actual formatted label (Doc 2 §09: no debit/credit/posting)', !/debit|credit|posting|ledger|journal/i.test(labelValues));
  check('formatMovementEntry() output is frozen (a read view, not a mutable record)', Object.isFrozen(entry));
}

/* ── Part B — Architecture: presentation only, reads Movement, nothing else ── */
console.log('\n[Part B — Architecture: presentation only, no new persistence, Movement-only]');
{
  const rawCode = read('js/gudang/audit/movement-history-view.js');
  const code = stripComments(rawCode);
  check('imports listMovements from movement-repository.js, nothing else from repository/', /from ['"]\.\.\/repository\/movement-repository\.js['"]/.test(code));
  check('never imports asset-history-repository.js (Doc 2 §09 scopes this to Movement only, unlike audit-view.js)', !code.includes('asset-history-repository'));
  check('never imports or modifies search/search-resolver.js (UI-wiring decision deliberately deferred, see header)', !code.includes('search-resolver'));
  check('never hardcodes a "gudang/..." RTDB path literal', !/['"`]gudang\//.test(code));
  check('never calls storeFirebaseData/runNodeTransaction (writes nothing, Doc 3 Ch.11: "not a subsystem")', !code.includes('storeFirebaseData') && !code.includes('runNodeTransaction'));
  check('never branches on FUTURE_RESERVATION by name in actual code (dormant seam stays dormant, Doc 4 Art.VI)', !code.includes('FUTURE_RESERVATION'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
