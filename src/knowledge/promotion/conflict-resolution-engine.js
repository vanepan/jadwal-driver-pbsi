/* ============================================================
   CONFLICT-RESOLUTION-ENGINE.JS — Knowledge Promotion (V2.0.4, Phase 9.3)

   PURPOSE: act on a review/observability KnowledgeConflictReport (V2.0.2.1
   shape, V2.0.3 detection) by deprecating every item EXCEPT the chosen
   winner — "resolution" means eliminating the losing competitors from the
   pipeline, never force-approving the winner. The winner still has to
   earn Approved through the normal review-workflow-engine.js#approve()
   path, same as any other item — resolving a conflict is not a shortcut
   around Decision 6 ("teach once, learn forever").

   RESPONSIBILITY: `resolveConflict(conflictReport, winnerId, opts)`.

   DEPENDENCIES: promotion-engine.js#deprecate (reused, not reimplemented),
   contracts/event-contract.js.

   NON-GOALS: does not detect conflicts (review/conflict-detection-engine.js,
   V2.0.3) and does not decide who's right — `winnerId` is supplied by the
   caller (a human reviewer's judgment call), this engine only executes it.
   ============================================================ */

'use strict';

import { deprecate } from './promotion-engine.js';
import { PROMOTION_EVENT_TYPE, makePromotionEvent } from './contracts/event-contract.js';

/**
 * @param {import('../observability/contracts/conflict-report-contract.js').KnowledgeConflictReport} conflictReport
 * @param {string} winnerId - must be one of conflictReport.itemIds
 * @param {{actorId?: string, reason?: string, onEvent?: Function}} [opts]
 * @returns {{ok: boolean, winnerId: string, deprecated: string[], errors: {itemId: string, message: string}[]}}
 */
export function resolveConflict(conflictReport, winnerId, opts = {}) {
  if (!conflictReport.itemIds.includes(winnerId)) {
    return Object.freeze({ ok: false, winnerId, deprecated: Object.freeze([]), errors: Object.freeze([{ itemId: winnerId, message: 'winnerId is not one of conflictReport.itemIds.' }]) });
  }
  const reason = opts.reason || `Superseded — conflict "${conflictReport.conflictId}" resolved in favor of "${winnerId}".`;
  const deprecated = [];
  const errors = [];

  for (const itemId of conflictReport.itemIds) {
    if (itemId === winnerId) continue;
    const result = deprecate(itemId, reason, { actorId: opts.actorId, onEvent: opts.onEvent });
    if (result.ok) deprecated.push(itemId);
    else errors.push({ itemId, message: result.error ? result.error.message : 'deprecate() failed.' });
  }

  if (typeof opts.onEvent === 'function') {
    opts.onEvent(makePromotionEvent(PROMOTION_EVENT_TYPE.CONFLICT_RESOLVED, {
      itemId: winnerId,
      detail: { conflictId: conflictReport.conflictId, winnerId, deprecated: [...deprecated] },
    }));
  }

  return Object.freeze({ ok: errors.length === 0, winnerId, deprecated: Object.freeze(deprecated), errors: Object.freeze(errors) });
}
