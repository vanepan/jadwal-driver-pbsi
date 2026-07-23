/* ============================================================
   ASSET-HISTORY-REPOSITORY.JS — Gudang Foundation (Phase 1, Part 4)

   Authorized by: Doc 1 Art.V/VI · Doc 3 Ch.06 (Asset Engine's own
   equivalent of Movement) / Ch.11 (Audit)

   PURPOSE: persistence for AssetHistoryEntry — the "ASSET HISTORY" (truth)
   tier of Doc 3 Ch.02's three-tier engine map, structurally parallel to
   Movement but explicitly never the same model (Doc 1 Art.V). Like
   movement-repository.js, there is deliberately NO update/delete export —
   history is written once, per Doc 1 Art.VI.

   Phase 1.1 Foundation Hardening (Review 5) re-examined whether History and
   Status (asset-repository.js) belong in one file. They stay split: Doc 3
   Ch.02's own diagram already draws Asset as three tiers (Engine → History →
   Status), the same shape Movement → Stock already uses — collapsing History
   and Status into one file would make Asset LESS faithful to that diagram,
   not more, and would blur exactly the write-path boundary asset-
   repository.js's header now spells out (no status change without a
   corresponding history entry).

   firebase.js is imported LAZILY — see item-repository.js's header for why.

   Phase 1.2 Security Hardening (Part 2) added a database.rules.json rule —
   `!data.exists()` on gudang/assetHistory/{historyId} — enforcing this
   file's append-only guarantee independently of application code. The write
   below is wrapped so a rules-rejected write returns a normal failure()
   instead of an uncaught rejection, same as movement-repository.js.
   ============================================================ */

'use strict';

import { GUDANG_PATHS } from '../config/gudang-paths.js';
import { isAssetHistoryEntry } from '../contracts/asset-contract.js';
import { success, failure, REPOSITORY_ERROR } from './repository-result.js';

let _fbPromise = null;
function fb() {
  if (!_fbPromise) _fbPromise = import('../../firebase.js');
  return _fbPromise;
}

/** Append a new AssetHistoryEntry. Fails on a duplicate historyId. */
export async function appendAssetHistory(entry) {
  if (!isAssetHistoryEntry(entry)) return failure(REPOSITORY_ERROR.INVALID_INPUT, 'appendAssetHistory: entry does not satisfy the AssetHistoryEntry contract.');
  const { readNode, storeFirebaseData } = await fb();
  const existing = await readNode(`${GUDANG_PATHS.assetHistory}/${entry.historyId}`);
  if (existing.status === 'ok' && existing.value != null) {
    return failure(REPOSITORY_ERROR.DUPLICATE_ID, `A history entry with id "${entry.historyId}" already exists.`);
  }
  try {
    await storeFirebaseData(`${GUDANG_PATHS.assetHistory}/${entry.historyId}`, entry);
  } catch (err) {
    return failure(REPOSITORY_ERROR.WRITE_FAILED, `appendAssetHistory: write rejected (${err?.code || err?.message || 'unknown error'}).`);
  }
  return success(entry);
}

/**
 * Every AssetHistoryEntry, optionally filtered by assetId, sorted oldest → newest.
 * The ONLY read path Audit (Part 6) is meant to use for Asset truth.
 * @param {{assetId?:string}} [filter]
 */
export async function listAssetHistory(filter = {}) {
  const { readNode } = await fb();
  const res = await readNode(GUDANG_PATHS.assetHistory);
  if (res.status !== 'ok') return failure(REPOSITORY_ERROR.READ_FAILED, `listAssetHistory: read failed (${res.status}).`);
  let items = Object.values(res.value || {});
  if (filter.assetId) items = items.filter((e) => e.assetId === filter.assetId);
  items.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  return success(items);
}
