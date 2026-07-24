/* ============================================================
   ASSET-HISTORY-VIEW.JS — Gudang Audit Engine (Phase 9, Part 2)

   Authorized by: Doc 3 Ch.06 (Asset Engine — History facet) / Ch.11
   (Audit Engine: "Its only real job is presentation: making that already-
   complete trail readable, searchable, and fast")

   PURPOSE: the Asset-specific mirror of Phase 6's audit/movement-history-
   view.js — same reasoning, same shape, applied to AssetHistoryEntry
   instead of Movement. Reverse-chronological, translates the four Doc 3
   Ch.06 event types into plain words, writes nothing, stores nothing new.
   audit/audit-view.js stays untouched (still the cross-source Movement +
   Asset History primitive); this file reads asset-history-repository.js
   directly, exactly how movement-history-view.js reads movement-
   repository.js directly rather than filtering audit-view.js's merged
   output.

   PURE where possible; I/O only in getAssetHistory.
   ============================================================ */

'use strict';

import { listAssetHistory } from '../repository/asset-history-repository.js';
import { success } from '../repository/repository-result.js';

/** Doc 3 Ch.06's four lifecycle facets, in plain words. */
const ASSET_EVENT_LABEL = Object.freeze({
  assign: 'Assigned',
  return: 'Returned',
  maintain: 'Sent for Maintenance',
  retire: 'Retired',
});

function label(map, key) {
  return map[key] || key;
}

/**
 * One AssetHistoryEntry, translated into who/what/why/when in plain
 * words. Pure — no I/O.
 * @param {import('../contracts/asset-contract.js').AssetHistoryEntry} entry
 */
export function formatAssetHistoryEntry(entry) {
  return Object.freeze({
    historyId: entry.historyId,
    assetId: entry.assetId,
    when: entry.occurredAt,
    who: entry.actorId,
    what: label(ASSET_EVENT_LABEL, entry.eventType),
    why: entry.reason,
  });
}

/**
 * The Asset History feed: reverse-chronological, optionally filtered by
 * asset, event type, actor (person), and/or a date range.
 * @param {{assetId?:string, eventType?:string, actorId?:string, since?:string, until?:string}} [filter]
 * @returns {Promise<{ok:boolean, data:?object[], error:*}>}
 */
export async function getAssetHistory(filter = {}) {
  const { assetId, eventType, actorId, since, until } = filter;
  const res = await listAssetHistory(assetId ? { assetId } : {});
  if (!res.ok) return res;

  let entries = res.data;
  if (eventType) entries = entries.filter((e) => e.eventType === eventType);
  if (actorId) entries = entries.filter((e) => e.actorId === actorId);
  if (since) { const t = new Date(since).getTime(); entries = entries.filter((e) => new Date(e.occurredAt).getTime() >= t); }
  if (until) { const t = new Date(until).getTime(); entries = entries.filter((e) => new Date(e.occurredAt).getTime() <= t); }

  const reverseChronological = [...entries].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return success(reverseChronological.map(formatAssetHistoryEntry));
}
