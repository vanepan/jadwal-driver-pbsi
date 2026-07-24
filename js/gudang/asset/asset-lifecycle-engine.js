/* ============================================================
   ASSET-LIFECYCLE-ENGINE.JS — Gudang Asset Engine (Phase 9, Part 1)

   Authorized by: Doc 1 Art.V (Assets vs. Consumables) · Doc 3 Ch.02
   (engine map: ASSET ENGINE -> creates -> ASSET HISTORY [truth] ->
   derives -> ASSET STATUS) / Ch.06 (Asset Engine)

   PURPOSE: the workflow layer Phase 1 explicitly left unbuilt (asset-
   repository.js's header: "No assign/return/maintain/retire WORKFLOW
   exists here at all — Phase 1 forbids it"). This file IS that workflow:
   validate a lifecycle transition against Doc 3 Ch.06's four states, then
   apply it the same two-step way Movement/Stock already work — append an
   AssetHistoryEntry (truth, never edited) and only then derive+persist the
   resulting Asset status (a projection, exactly parallel to Stock). A
   status changed without a corresponding history entry would be
   unattributed — the same "Movement bypass" pattern Doc 4 F-09 rejects,
   applied here to Asset.

   THE STATE MACHINE (Doc 3 Ch.06's own facet descriptions, made literal):
     available   --assign-->   assigned    (holderId set)
     assigned    --return-->   available   ("Assignment... ends with a
                                             Return event, not an edit")
     available   --maintain--> maintenance ("a bounded period... start,
                                             end, and reason")
     maintenance --return-->   available   (see note below)
     available   --retire-->   retired     (terminal)
     maintenance --retire-->   retired     (terminal)

   A DECISION WORTH NAMING: Ch.06 gives exactly four event types (assign,
   return, maintain, retire) but describes Maintenance as bounded ("start,
   end") without naming a distinct "end maintenance" event — Assignment
   is the only facet explicitly said to "end with a Return event."
   Rather than inventing a fifth event type (amending Doc 3's ratified
   vocabulary) or overloading `maintain` as a silent toggle (confusing to
   read back later — "why does this event sometimes mean start, sometimes
   end?"), this file reads RETURN generically as "the asset is available
   again," and accepts it from BOTH assigned and maintenance. Nothing in
   Ch.06 restricts Return to assignment only, and this reuses existing
   ratified vocabulary rather than adding to it — the same discipline
   Phase 4/5's amendments used, but resolved without needing one here.

   NOT ALLOWED, on purpose (fewer edges, less ambiguity, nothing in Doc
   3 requires otherwise): retiring directly out of `assigned` (return it
   first — an asset should not be retired while someone still holds it);
   re-assigning an already-assigned asset directly to a new holder
   (return it first — Doc 3 never describes a direct-transfer action);
   any event at all once `retired` (Ch.06: "stops accepting new events").

   "Never mixed with Consumable" (Phase 9 brief): every transition here
   re-confirms the Asset's own Item is itemType:'asset' before touching
   anything — the same boundary check Phase 4/5/7 apply in the opposite
   direction for Consumables.

   PURE where possible (the transition table itself); I/O only in
   validateAssetTransition/applyAssetTransition.
   ============================================================ */

'use strict';

import { getAsset, saveAssetStatus } from '../repository/asset-repository.js';
import { appendAssetHistory } from '../repository/asset-history-repository.js';
import { getItem } from '../repository/item-repository.js';
import { makeAssetHistoryEntry, ASSET_STATUS, ASSET_EVENT_TYPE } from '../contracts/asset-contract.js';
import { ITEM_TYPE } from '../contracts/item-contract.js';
import { success, failure, REPOSITORY_ERROR } from '../repository/repository-result.js';

/** The state machine, in full — see header for why each edge exists (or doesn't). */
const TRANSITIONS = Object.freeze({
  [ASSET_STATUS.AVAILABLE]: Object.freeze({
    [ASSET_EVENT_TYPE.ASSIGN]: ASSET_STATUS.ASSIGNED,
    [ASSET_EVENT_TYPE.MAINTAIN]: ASSET_STATUS.MAINTENANCE,
    [ASSET_EVENT_TYPE.RETIRE]: ASSET_STATUS.RETIRED,
  }),
  [ASSET_STATUS.ASSIGNED]: Object.freeze({
    [ASSET_EVENT_TYPE.RETURN]: ASSET_STATUS.AVAILABLE,
  }),
  [ASSET_STATUS.MAINTENANCE]: Object.freeze({
    [ASSET_EVENT_TYPE.RETURN]: ASSET_STATUS.AVAILABLE,
    [ASSET_EVENT_TYPE.RETIRE]: ASSET_STATUS.RETIRED,
  }),
  [ASSET_STATUS.RETIRED]: Object.freeze({}), // terminal — no event is ever valid here
});

/** Pure: the resulting status, or null if `eventType` is not a valid
 *  transition out of `currentStatus`. @returns {?string} */
export function nextStatus(currentStatus, eventType) {
  return TRANSITIONS[currentStatus]?.[eventType] ?? null;
}

/** Pure. @returns {boolean} */
export function isTransitionAllowed(currentStatus, eventType) {
  return nextStatus(currentStatus, eventType) !== null;
}

function generateHistoryId() {
  return `ah-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Shape-only validation — no I/O. */
function validateShape({ assetId, eventType, actorId, reason, holderId } = {}) {
  if (typeof assetId !== 'string' || !assetId) return 'assetId is required.';
  if (!Object.values(ASSET_EVENT_TYPE).includes(eventType)) return `eventType must be one of ${Object.values(ASSET_EVENT_TYPE).join(', ')}.`;
  if (typeof actorId !== 'string' || !actorId) return 'actorId is required.';
  if (typeof reason !== 'string' || !reason) return 'reason is required (Doc 1 Art.VI).';
  if (eventType === ASSET_EVENT_TYPE.ASSIGN && (typeof holderId !== 'string' || !holderId)) {
    return 'holderId is required when eventType is "assign" (Doc 3 Ch.06: Assignment records who currently holds it).';
  }
  return null;
}

/**
 * Validate a lifecycle transition against real data: the Asset exists, its
 * Item is itemType:'asset' (never Consumable), and the transition is legal
 * from the Asset's CURRENT status. Read-only.
 * @param {{assetId:string, eventType:string, actorId:string, reason:string, holderId?:string, locationId?:?string}} input
 * @returns {Promise<{ok:boolean, data:?{asset:object}, error:*}>}
 */
export async function validateAssetTransition(input) {
  const shapeError = validateShape(input);
  if (shapeError) return failure(REPOSITORY_ERROR.INVALID_INPUT, `validateAssetTransition: ${shapeError}`);

  const assetRes = await getAsset(input.assetId);
  if (!assetRes.ok) return assetRes;

  const itemRes = await getItem(assetRes.data.itemId);
  if (!itemRes.ok) return failure(itemRes.error.code, `validateAssetTransition: ${itemRes.error.message}`);
  if (itemRes.data.itemType !== ITEM_TYPE.ASSET) {
    return failure(REPOSITORY_ERROR.INVALID_INPUT, `validateAssetTransition: "${itemRes.data.name}" is a Consumable, not an Asset — lifecycle events never apply to it (Doc 1 Art.V).`);
  }

  if (!isTransitionAllowed(assetRes.data.status, input.eventType)) {
    return failure(REPOSITORY_ERROR.INVALID_INPUT, `validateAssetTransition: "${input.eventType}" is not a valid transition from status "${assetRes.data.status}".`);
  }

  return success({ asset: assetRes.data });
}

/**
 * Validate, then apply: append an AssetHistoryEntry (truth), then derive
 * and persist the resulting Asset status (projection). holderId/locationId
 * are only meaningful for `assign`; every other event clears holderId.
 * @param {{assetId:string, eventType:string, actorId:string, reason:string, holderId?:string, locationId?:?string}} input
 * @returns {Promise<{ok:boolean, data:?{asset:object, historyEntry:object}, error:*}>}
 */
export async function applyAssetTransition(input) {
  const validated = await validateAssetTransition(input);
  if (!validated.ok) return validated;
  const { asset } = validated.data;

  const historyEntry = makeAssetHistoryEntry({
    historyId: generateHistoryId(),
    assetId: input.assetId,
    eventType: input.eventType,
    actorId: input.actorId,
    reason: input.reason,
  });
  const appended = await appendAssetHistory(historyEntry);
  if (!appended.ok) return appended;

  const newStatus = nextStatus(asset.status, input.eventType);
  const updatedAsset = Object.freeze({
    ...asset,
    status: newStatus,
    holderId: input.eventType === ASSET_EVENT_TYPE.ASSIGN ? input.holderId : null,
    locationId: input.locationId != null ? String(input.locationId) : asset.locationId,
  });

  const saved = await saveAssetStatus(updatedAsset);
  if (!saved.ok) {
    return failure(saved.error.code, `applyAssetTransition: history entry "${historyEntry.historyId}" was recorded, but Asset status failed to save — ${saved.error.message}`);
  }

  return success({ asset: saved.data, historyEntry: appended.data });
}
