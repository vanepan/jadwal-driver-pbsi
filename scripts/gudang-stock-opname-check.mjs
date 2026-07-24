/* gudang-stock-opname-check.mjs — Gudang V1.28.0, Phase 7 (Stock Opname).

   Authorized by: Doc 1 Art.IV/V · Doc 2 §10 · Doc 3 Ch.03/04/07 — Phase 7:
   movement-derived adjustment, never a direct stock edit, partial opname
   supported.

   Same check()/throws() harness and "only guard-clause paths that never
   touch Firebase" convention as the other Phase 4-6 scripts.

   Run: node scripts/gudang-stock-opname-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateStockOpnameBatch, executeStockOpname, getExpectedQuantity,
} from '../js/gudang/consumable/stock-opname-engine.js';
import { MOVEMENT_TYPE, MOVEMENT_REASON, makeMovement, isMovement } from '../js/gudang/contracts/movement-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/* ── Part A — Batch validation rejects bad input before any Firebase call ── */
console.log('\n[Part A — validateStockOpnameBatch()/executeStockOpname() reject bad input before any Firebase call]');
{
  const r1 = await validateStockOpnameBatch({ lines: [{ itemId: 'i1', countedQuantity: 5 }] });
  check('missing actorId fails INVALID_INPUT', !r1.ok && r1.error.code === 'INVALID_INPUT');

  const r2 = await validateStockOpnameBatch({ lines: [], actorId: 'u1' });
  check('an empty lines[] fails INVALID_INPUT (partial opname still needs at least one counted line)', !r2.ok && r2.error.code === 'INVALID_INPUT');

  const r3 = await validateStockOpnameBatch({ lines: [{ itemId: 'i1', countedQuantity: -1 }], actorId: 'u1' });
  check('a negative countedQuantity fails INVALID_INPUT (a physical count is never negative)', !r3.ok && r3.error.code === 'INVALID_INPUT');

  const r4 = await validateStockOpnameBatch({ lines: [{ itemId: '', countedQuantity: 0 }], actorId: 'u1' });
  check('a line missing itemId fails INVALID_INPUT', !r4.ok && r4.error.code === 'INVALID_INPUT');

  const r5 = await validateStockOpnameBatch({ lines: [{ itemId: 'i1', countedQuantity: 'zero' }], actorId: 'u1' });
  check('a non-numeric countedQuantity fails INVALID_INPUT, never throws', !r5.ok && r5.error.code === 'INVALID_INPUT');

  const r6 = await validateStockOpnameBatch({ lines: [{ itemId: 'i1', countedQuantity: 0, locationId: 42 }], actorId: 'u1' });
  check('a non-string locationId fails INVALID_INPUT', !r6.ok && r6.error.code === 'INVALID_INPUT');

  const r7 = await executeStockOpname({ lines: [{ itemId: 'i1', countedQuantity: 5 }], actorId: '' });
  check('executeStockOpname() runs the same validation before touching anything', !r7.ok && r7.error.code === 'INVALID_INPUT');

  const r8 = await getExpectedQuantity('');
  check('getExpectedQuantity("") fails INVALID_INPUT without touching Firebase', !r8.ok && r8.error.code === 'INVALID_INPUT');

  // NOTE: "countedQuantity: 0 is a valid shape" is deliberately NOT
  // exercised here — a fully-valid batch would pass shape validation and
  // proceed to a real getItem() Firebase call this harness has no
  // credentials for (same lesson as gudang-goods-in-check.mjs Part A).
  // validateShape()'s guard is `< 0`, not `<= 0` — provable by reading
  // the source below (Part C) rather than by executing it.
  const code0 = read('js/gudang/consumable/stock-opname-engine.js');
  check('validateShape() rejects only NEGATIVE counts, not zero (source-level proof, no Firebase needed)', /countedQuantity < 0/.test(code0) && !/countedQuantity <= 0/.test(code0));
}

/* ── Part B — Movement type/reason: Stock Opname Adjustment, pre-filled reason ── */
console.log('\n[Part B — MOVEMENT_TYPE.STOCK_OPNAME_ADJUSTMENT + MOVEMENT_REASON.STOCK_OPNAME (Doc 2 §10)]');
{
  const surplus = makeMovement({
    movementId: 'mv-1', itemId: 'i1', type: MOVEMENT_TYPE.STOCK_OPNAME_ADJUSTMENT, quantityDelta: 3,
    reason: MOVEMENT_REASON.STOCK_OPNAME, actorId: 'u1',
  });
  check('a surplus discrepancy (+3) round-trips through isMovement()', isMovement(surplus) && surplus.quantityDelta === 3);

  const shortage = makeMovement({
    movementId: 'mv-2', itemId: 'i1', type: MOVEMENT_TYPE.STOCK_OPNAME_ADJUSTMENT, quantityDelta: -2,
    reason: MOVEMENT_REASON.STOCK_OPNAME, actorId: 'u1', locationId: 'l1',
  });
  check('a shortage discrepancy (-2) round-trips too, and carries the counting location (Doc 2 §10 slice)', isMovement(shortage) && shortage.quantityDelta === -2 && shortage.locationId === 'l1');

  check('STOCK_OPNAME_ADJUSTMENT is distinct from plain ADJUSTMENT (Doc 3 Ch.04 names both separately)', MOVEMENT_TYPE.STOCK_OPNAME_ADJUSTMENT !== MOVEMENT_TYPE.ADJUSTMENT);
}

/* ── Part C — Architecture: composes, never duplicates, Consumable-only ── */
console.log('\n[Part C — Architecture: stock-opname-engine.js composes existing engines, Consumable-only]');
{
  const code = stripComments(read('js/gudang/consumable/stock-opname-engine.js'));
  check('imports appendMovement + listMovements from movement-repository.js', /from ['"]\.\.\/repository\/movement-repository\.js['"]/.test(code));
  check('imports deriveQuantity + recalculateStock from stock-projection-engine.js — reuses the Doc 3 Ch.05 pipeline, never reimplements it', /deriveQuantity/.test(code) && /recalculateStock/.test(code));
  check('never imports asset-repository.js (Stock Opname is Consumable-only, Doc 1 Art.V)', !code.includes('asset-repository'));
  check('never imports department-repository.js (Doc 2 §10 scopes by location/category, not department)', !code.includes('department-repository'));
  check('never hardcodes a "gudang/..." RTDB path literal', !/['"`]gudang\//.test(code));
  check('never calls storeFirebaseData/runNodeTransaction directly', !code.includes('storeFirebaseData') && !code.includes('runNodeTransaction'));
  check('has no concept of a required "slice" — no location/category filter forces a complete count (Doc 2 §10: never forced into a single sitting)', !/every item in|require.*location|require.*category/i.test(code));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
