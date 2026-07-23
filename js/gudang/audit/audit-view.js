/* ============================================================
   AUDIT-VIEW.JS — Gudang Foundation (Phase 1, Part 6)

   Authorized by: Doc 1 Art.VI (Audit First) · Doc 3 Ch.11 (Audit Engine —
   "Audit is not a subsystem. It is a consequence.")

   PURPOSE: derive a readable audit trail from the two sources that already,
   mandatorily, record who/what/why/when — Movement and AssetHistoryEntry —
   and NOTHING else. There is deliberately no "audit repository": this file
   never writes anything; it only reads movement-repository.js and
   asset-history-repository.js and maps their already-attributed records
   into contracts/audit-entry-contract.js's shape. Building a dedicated
   audit store here would itself be Doc 4's Forbidden Ledger F-03 (multiple
   sources of truth) — a second, independently-populated record of something
   Movement and Asset History already record completely.
   ============================================================ */

'use strict';

import { listMovements } from '../repository/movement-repository.js';
import { listAssetHistory } from '../repository/asset-history-repository.js';
import { makeAuditEntry, AUDIT_SOURCE } from '../contracts/audit-entry-contract.js';
import { success } from '../repository/repository-result.js';

function movementToAuditEntry(m) {
  return makeAuditEntry({
    source: AUDIT_SOURCE.MOVEMENT,
    refId: m.movementId,
    who: m.actorId,
    what: `${m.type} ${m.quantityDelta > 0 ? '+' : ''}${m.quantityDelta} on item ${m.itemId}`,
    why: m.reason,
    when: m.createdAt,
  });
}

function assetHistoryToAuditEntry(e) {
  return makeAuditEntry({
    source: AUDIT_SOURCE.ASSET_HISTORY,
    refId: e.historyId,
    who: e.actorId,
    what: `${e.eventType} asset ${e.assetId}`,
    why: e.reason,
    when: e.occurredAt,
  });
}

/**
 * The complete audit trail, optionally scoped to one item and/or one asset,
 * merged and sorted oldest → newest. This is the ONLY function a future
 * Audit screen (a later phase) is meant to read from.
 * @param {{itemId?:string, assetId?:string}} [filter]
 */
export async function getAuditTrail(filter = {}) {
  const [movementsRes, historyRes] = await Promise.all([
    listMovements(filter.itemId ? { itemId: filter.itemId } : {}),
    listAssetHistory(filter.assetId ? { assetId: filter.assetId } : {}),
  ]);
  if (!movementsRes.ok) return movementsRes;
  if (!historyRes.ok) return historyRes;

  const entries = [
    ...movementsRes.data.map(movementToAuditEntry),
    ...historyRes.data.map(assetHistoryToAuditEntry),
  ].sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());

  return success(entries);
}
