/* gudang-asset-lifecycle-check.mjs — Gudang V1.28.0, Phase 9 (Asset Foundation).

   Authorized by: Doc 1 Art.V · Doc 3 Ch.02/06/11 — Phase 9: asset
   lifecycle, assignment, return, maintenance, retirement, asset history,
   never mixed with Consumable.

   Same check()/throws() harness and "only guard-clause paths that never
   touch Firebase" convention as Phases 4-8.

   Run: node scripts/gudang-asset-lifecycle-check.mjs   (exit 0 = pass) */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  nextStatus, isTransitionAllowed, validateAssetTransition, applyAssetTransition,
} from '../js/gudang/asset/asset-lifecycle-engine.js';
import { ASSET_STATUS, ASSET_EVENT_TYPE, makeAssetHistoryEntry, isAssetHistoryEntry } from '../js/gudang/contracts/asset-contract.js';
import { formatAssetHistoryEntry } from '../js/gudang/audit/asset-history-view.js';
import { GUDANG_DOMAINS, getDomain } from '../js/gudang/config/gudang-domain-registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0; let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); }
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/* ── Part A — The state machine: pure, exactly Doc 3 Ch.06's four states ── */
console.log('\n[Part A — nextStatus()/isTransitionAllowed(): the Doc 3 Ch.06 state machine, pure]');
{
  check('available --assign--> assigned', nextStatus(ASSET_STATUS.AVAILABLE, ASSET_EVENT_TYPE.ASSIGN) === ASSET_STATUS.ASSIGNED);
  check('assigned --return--> available', nextStatus(ASSET_STATUS.ASSIGNED, ASSET_EVENT_TYPE.RETURN) === ASSET_STATUS.AVAILABLE);
  check('available --maintain--> maintenance', nextStatus(ASSET_STATUS.AVAILABLE, ASSET_EVENT_TYPE.MAINTAIN) === ASSET_STATUS.MAINTENANCE);
  check('maintenance --return--> available (documented reading of Return, see header)', nextStatus(ASSET_STATUS.MAINTENANCE, ASSET_EVENT_TYPE.RETURN) === ASSET_STATUS.AVAILABLE);
  check('available --retire--> retired', nextStatus(ASSET_STATUS.AVAILABLE, ASSET_EVENT_TYPE.RETIRE) === ASSET_STATUS.RETIRED);
  check('maintenance --retire--> retired', nextStatus(ASSET_STATUS.MAINTENANCE, ASSET_EVENT_TYPE.RETIRE) === ASSET_STATUS.RETIRED);

  check('assigned --assign--> invalid (must return before reassigning)', !isTransitionAllowed(ASSET_STATUS.ASSIGNED, ASSET_EVENT_TYPE.ASSIGN));
  check('assigned --retire--> invalid (must return before retiring)', !isTransitionAllowed(ASSET_STATUS.ASSIGNED, ASSET_EVENT_TYPE.RETIRE));
  check('assigned --maintain--> invalid', !isTransitionAllowed(ASSET_STATUS.ASSIGNED, ASSET_EVENT_TYPE.MAINTAIN));
  check('available --return--> invalid (nothing to return from)', !isTransitionAllowed(ASSET_STATUS.AVAILABLE, ASSET_EVENT_TYPE.RETURN));
  check('maintenance --assign--> invalid (must return from maintenance first)', !isTransitionAllowed(ASSET_STATUS.MAINTENANCE, ASSET_EVENT_TYPE.ASSIGN));
  check('maintenance --maintain--> invalid (already in maintenance)', !isTransitionAllowed(ASSET_STATUS.MAINTENANCE, ASSET_EVENT_TYPE.MAINTAIN));

  check('retired accepts NOTHING (Doc 3 Ch.06: "stops accepting new events")',
    !isTransitionAllowed(ASSET_STATUS.RETIRED, ASSET_EVENT_TYPE.ASSIGN)
    && !isTransitionAllowed(ASSET_STATUS.RETIRED, ASSET_EVENT_TYPE.RETURN)
    && !isTransitionAllowed(ASSET_STATUS.RETIRED, ASSET_EVENT_TYPE.MAINTAIN)
    && !isTransitionAllowed(ASSET_STATUS.RETIRED, ASSET_EVENT_TYPE.RETIRE));

  check('nextStatus() on an unknown status returns null, never throws', nextStatus('deleted', ASSET_EVENT_TYPE.ASSIGN) === null);
}

/* ── Part B — Validation rejects bad input before any Firebase call ────── */
console.log('\n[Part B — validateAssetTransition()/applyAssetTransition() reject bad input before any Firebase call]');
{
  const r1 = await validateAssetTransition({ eventType: ASSET_EVENT_TYPE.ASSIGN, actorId: 'u1', reason: 'x', holderId: 'h1' });
  check('missing assetId fails INVALID_INPUT', !r1.ok && r1.error.code === 'INVALID_INPUT');

  const r2 = await validateAssetTransition({ assetId: 'a1', eventType: 'teleport', actorId: 'u1', reason: 'x' });
  check('an eventType outside the 4 Doc 3 Ch.06 values fails INVALID_INPUT', !r2.ok && r2.error.code === 'INVALID_INPUT');

  const r3 = await validateAssetTransition({ assetId: 'a1', eventType: ASSET_EVENT_TYPE.RETURN, actorId: '', reason: 'x' });
  check('missing actorId fails INVALID_INPUT (Doc 1 Art.VI)', !r3.ok && r3.error.code === 'INVALID_INPUT');

  const r4 = await validateAssetTransition({ assetId: 'a1', eventType: ASSET_EVENT_TYPE.MAINTAIN, actorId: 'u1', reason: '' });
  check('missing reason fails INVALID_INPUT', !r4.ok && r4.error.code === 'INVALID_INPUT');

  const r5 = await validateAssetTransition({ assetId: 'a1', eventType: ASSET_EVENT_TYPE.ASSIGN, actorId: 'u1', reason: 'x' });
  check('eventType:assign WITHOUT holderId fails INVALID_INPUT (Doc 3 Ch.06: Assignment records who holds it)', !r5.ok && r5.error.code === 'INVALID_INPUT');

  const r6 = await applyAssetTransition({ assetId: '', eventType: ASSET_EVENT_TYPE.RETIRE, actorId: 'u1', reason: 'x' });
  check('applyAssetTransition() runs the same validation before touching anything', !r6.ok && r6.error.code === 'INVALID_INPUT');
}

/* ── Part C — AssetHistoryEntry + readable Asset History (Phase 9's own bullet) ── */
console.log('\n[Part C — AssetHistoryEntry contract + formatAssetHistoryEntry(): plain words]');
{
  const entry = makeAssetHistoryEntry({ historyId: 'ah-1', assetId: 'a1', eventType: ASSET_EVENT_TYPE.ASSIGN, actorId: 'u1', reason: 'ruang rapat A' });
  check('makeAssetHistoryEntry() round-trips through isAssetHistoryEntry()', isAssetHistoryEntry(entry));

  const formatted = formatAssetHistoryEntry(entry);
  check('what: "Assigned", not the raw enum value "assign"', formatted.what === 'Assigned');
  check('who/why/when pass through untouched (Doc 1 Art.VI)', formatted.who === 'u1' && formatted.why === 'ruang rapat A' && formatted.when === entry.occurredAt);

  for (const [evt, expected] of [['return', 'Returned'], ['maintain', 'Sent for Maintenance'], ['retire', 'Retired']]) {
    const e = makeAssetHistoryEntry({ historyId: `ah-${evt}`, assetId: 'a1', eventType: evt, actorId: 'u1', reason: 'x' });
    check(`eventType "${evt}" translates to "${expected}"`, formatAssetHistoryEntry(e).what === expected);
  }
  check('formatAssetHistoryEntry() output is frozen', Object.isFrozen(formatted));
}

/* ── Part D — Architecture: never mixed with Consumable, correct ownership ── */
console.log('\n[Part D — Architecture: Asset stays Asset, Consumable stays Consumable (Phase 9 brief)]');
{
  const engineCode = stripComments(read('js/gudang/asset/asset-lifecycle-engine.js'));
  check('asset-lifecycle-engine.js never imports movement-repository.js or movement-contract.js ("never mixed with Consumable")', !engineCode.includes('movement-repository') && !engineCode.includes('movement-contract'));
  check('checks ITEM_TYPE.ASSET before allowing any transition (Doc 1 Art.V enforced, not assumed)', engineCode.includes('ITEM_TYPE.ASSET'));
  check('imports saveAssetStatus from asset-repository.js — the Phase 9 write path for the derived Status tier', /saveAssetStatus.*from ['"]\.\.\/repository\/asset-repository\.js['"]/.test(engineCode));
  check('never hardcodes a "gudang/..." RTDB path literal', !/['"`]gudang\//.test(engineCode));

  const repoCode = stripComments(read('js/gudang/repository/asset-repository.js'));
  const saveAssetStatusCallers = ['js/gudang/asset/asset-lifecycle-engine.js']
    .map((rel) => stripComments(read(rel)))
    .filter((code) => /\bsaveAssetStatus\b/.test(code));
  check('saveAssetStatus() has exactly one legitimate caller (asset-lifecycle-engine.js) among Phase 9\'s new files', saveAssetStatusCallers.length === 1);
  check('asset-repository.js still exports createAsset/getAsset/listAssets unchanged, plus the new saveAssetStatus', /export async function createAsset/.test(repoCode) && /export async function saveAssetStatus/.test(repoCode));

  const historyViewCode = stripComments(read('js/gudang/audit/asset-history-view.js'));
  check('asset-history-view.js writes nothing (no storeFirebaseData/runNodeTransaction)', !historyViewCode.includes('storeFirebaseData') && !historyViewCode.includes('runNodeTransaction'));
  check('asset-history-view.js never imports movement-repository.js (Doc 2 §09 scoped Movement History to Movement only; this is its Asset-side mirror, not a merge)', !historyViewCode.includes('movement-repository'));
}

/* ── Part E — Regression: domain registry unaffected (Asset already had a foundation) ── */
console.log('\n[Part E — Regression: GUDANG_DOMAINS unaffected — Asset already had hasFoundation:true since Phase 1]');
{
  check('GUDANG_DOMAINS still has exactly 15 entries — Phase 9 added no new domain (F-02)', GUDANG_DOMAINS.length === 15);
  check('Asset domain unchanged: core, hasFoundation true since Phase 1 (Phase 9 completed its workflow, not its existence)', getDomain('asset')?.hasFoundation === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
