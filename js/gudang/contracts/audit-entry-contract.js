/* ============================================================
   AUDIT-ENTRY-CONTRACT.JS — Gudang Foundation (Phase 1, Part 3)

   Authorized by: Doc 1 Art.VI (Audit First) · Doc 3 Ch.11 (Audit Engine —
   "Audit is not a subsystem. It is a consequence.")

   PURPOSE: fix the shape an AuditEntry takes once audit/audit-view.js
   (Part 6) derives it from Movement or AssetHistoryEntry. This contract
   does NOT define a persisted record — Audit owns no persistence of its own
   (Doc 3 Ch.11); it is only the read shape those two real, already-attributed
   sources are mapped into so a viewer sees one consistent who/what/why/when,
   regardless of which source it came from.

   PURE: no DOM, no Firebase, no `window`.
   ============================================================ */

'use strict';

export const AUDIT_ENTRY_SCHEMA = 'gudang.auditEntry@1';

/** The only two legitimate sources — nothing else is allowed to originate an AuditEntry. */
export const AUDIT_SOURCE = Object.freeze({
  MOVEMENT: 'movement',
  ASSET_HISTORY: 'assetHistory',
});

const AUDIT_SOURCES = new Set(Object.values(AUDIT_SOURCE));

/**
 * @typedef {Object} AuditEntry
 * @property {'movement'|'assetHistory'} source
 * @property {string} refId  - the source record's own id (movementId or historyId)
 * @property {string} who    - actorId
 * @property {string} what   - a short description derived from the source record
 * @property {string} why    - the source record's reason
 * @property {string} when   - ISO timestamp, copied verbatim from the source record
 */

/** @param {{source:string, refId:string, who:string, what:string, why:string, when:string}} seed
 *  @returns {AuditEntry} */
export function makeAuditEntry({ source, refId, who, what, why, when }) {
  if (!AUDIT_SOURCES.has(source)) throw new Error(`makeAuditEntry: unknown source "${source}".`);
  if (typeof refId !== 'string' || !refId) throw new Error('makeAuditEntry: refId is required.');
  if (typeof who !== 'string' || !who) throw new Error('makeAuditEntry: who is required.');
  if (typeof what !== 'string' || !what) throw new Error('makeAuditEntry: what is required.');
  if (typeof why !== 'string' || !why) throw new Error('makeAuditEntry: why is required.');
  if (typeof when !== 'string' || !when) throw new Error('makeAuditEntry: when is required.');
  return Object.freeze({ source, refId, who, what, why, when });
}

/** @param {*} entry @returns {boolean} */
export function isAuditEntry(entry) {
  return !!entry && typeof entry === 'object'
    && AUDIT_SOURCES.has(entry.source)
    && typeof entry.refId === 'string' && entry.refId.length > 0
    && typeof entry.who === 'string' && entry.who.length > 0
    && typeof entry.what === 'string' && entry.what.length > 0
    && typeof entry.why === 'string' && entry.why.length > 0
    && typeof entry.when === 'string' && entry.when.length > 0;
}
