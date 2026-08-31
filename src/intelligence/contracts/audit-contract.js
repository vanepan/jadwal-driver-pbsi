/* ============================================================
   AUDIT-CONTRACT.JS — Sarpras Intelligence Foundation (V2, Phase 0)

   PURPOSE: fix the VOCABULARY of AI-operation audit events (PART 17). This
   file defines event names and a record shape — nothing else. It creates
   no framework, no transport, no store.

   RESPONSIBILITY: define INTELLIGENCE_EVENT, the AuditEvent shape, and a
   constructor.

   DEPENDENCIES: none.

   NON-GOALS: does not dispatch, subscribe, persist, or fan out. The
   existing platform already has two audit-shaped mechanisms — the
   server-authoritative event outbox (functions/src/events/*, where a new
   type is an allow-list entry, not new transport code) and the client
   action log (js/logs.js) — and a real implementation rides one or both
   of those, never a third system built here.

   FUTURE EVOLUTION: when generation is wired, each step appends one of
   these events; NOR_PUBLISHED / KNOWLEDGE_* are emitted from the NOR
   Registry and Knowledge Platform respectively, not from the AI layer, so
   the same vocabulary spans the whole request → publish → learn lifecycle.
   ============================================================ */

'use strict';

export const INTELLIGENCE_AUDIT_SCHEMA = 'intelligence-audit-event@1';

/** The closed set of auditable events across the intelligence lifecycle. */
export const INTELLIGENCE_EVENT = Object.freeze({
  AI_REQUESTED: 'AI_REQUESTED',
  AI_RESPONSE_RECEIVED: 'AI_RESPONSE_RECEIVED',
  AI_QUESTION_ASKED: 'AI_QUESTION_ASKED',
  AI_DRAFT_CREATED: 'AI_DRAFT_CREATED',
  AI_DRAFT_EDITED: 'AI_DRAFT_EDITED',
  AI_DRAFT_APPROVED: 'AI_DRAFT_APPROVED',
  NOR_PUBLISHED: 'NOR_PUBLISHED',
  KNOWLEDGE_CREATED: 'KNOWLEDGE_CREATED',
  KNOWLEDGE_APPROVED: 'KNOWLEDGE_APPROVED',
});

export const INTELLIGENCE_EVENT_LIST = Object.freeze(Object.values(INTELLIGENCE_EVENT));

/**
 * @typedef {Object} IntelligenceAuditEvent
 * @property {string} schema
 * @property {string} type          - one of INTELLIGENCE_EVENT
 * @property {string} requestId     - the IntelligenceRequest this event belongs to
 * @property {string|null} actorId  - the user who triggered it (null for system steps)
 * @property {string|null} sourceModule
 * @property {string} at            - ISO 8601
 * @property {Object} detail        - free-form, event-specific; never carries a secret
 */

/** Whether `type` is a known intelligence audit event. */
export function isIntelligenceEvent(type) {
  return INTELLIGENCE_EVENT_LIST.includes(type);
}

/**
 * @param {Object} e
 * @returns {IntelligenceAuditEvent}
 */
export function makeIntelligenceAuditEvent({
  type,
  requestId,
  actorId = null,
  sourceModule = null,
  at = null,
  detail = {},
} = {}) {
  return Object.freeze({
    schema: INTELLIGENCE_AUDIT_SCHEMA,
    type: isIntelligenceEvent(type) ? type : null,
    requestId: requestId || null,
    actorId,
    sourceModule,
    at: at || new Date().toISOString(),
    detail: detail && typeof detail === 'object' ? detail : {},
  });
}

/** Structural check — known `type`, non-empty `requestId`. */
export function isIntelligenceAuditEvent(e) {
  if (!e || typeof e !== 'object') return false;
  if (e.schema !== INTELLIGENCE_AUDIT_SCHEMA) return false;
  if (!isIntelligenceEvent(e.type)) return false;
  return typeof e.requestId === 'string' && !!e.requestId;
}
