/* ============================================================
   WORKSPACE-TIMELINE-ENTRY-CONTRACT.JS — Live Word Workspace (V2, Phase 12.8.5)

   PURPOSE: fix the shape of ONE Workspace Timeline entry — "what changed
   in this Workspace, and why" (CLAUDE.md's "editing a document must not
   merely modify text... the workspace should understand what changed").
   Mirrors document-intelligence/composer/contracts/composer-revision-
   contract.js's append-only role, but at Workspace grain (suggestion
   decisions), not document-content grain (composer-revision-contract.js
   already owns that — Workspace Timeline is explicitly NOT a second
   content-diff log, see workspace-service.js's header).

   RESPONSIBILITY: define ENTRY_TYPE, the WorkspaceTimelineEntry shape,
   and a constructor.

   DEPENDENCIES: none.

   NON-GOALS: does not itself write to Learning — a
   'suggestion_accepted'/'suggestion_rejected' entry and the
   emitLearningSignal() call it accompanies are two SEPARATE writes made
   by the SAME caller (workspace-service.js#decideSuggestion), never one
   causing the other — same "two honest, disjoint logs" reasoning
   composer-store.js's transitionStatus() already documents for review
   history vs. content revisions.
   ============================================================ */

'use strict';

export const WORKSPACE_TIMELINE_ENTRY_SCHEMA = 'workspace-timeline-entry@1';

/** Closed set — every kind of event this Workspace Timeline records. */
export const ENTRY_TYPE = Object.freeze({
  CONTEXT_REFRESHED: 'context_refreshed',
  SUGGESTION_ACCEPTED: 'suggestion_accepted',
  SUGGESTION_REJECTED: 'suggestion_rejected',
  CITATION_BOUND: 'citation_bound',
});

/**
 * @typedef {Object} WorkspaceTimelineEntry
 * @property {string} entryId
 * @property {string} workspaceId
 * @property {string} entryType       - one of ENTRY_TYPE
 * @property {string|null} suggestionId
 * @property {string|null} blockId
 * @property {string} actorId
 * @property {Object|null} detail     - free-form, entryType-shaped, never invented — always a real field the caller already computed
 * @property {string} occurredAt
 */

let _counter = 0;

/** @param {{workspaceId: string, entryType: string, suggestionId?: string|null,
 *   blockId?: string|null, actorId: string, detail?: Object|null}} seed
 *  @returns {WorkspaceTimelineEntry} */
export function makeWorkspaceTimelineEntry({
  workspaceId, entryType, suggestionId = null, blockId = null, actorId, detail = null,
}) {
  if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('makeWorkspaceTimelineEntry: workspaceId is required.');
  if (!Object.values(ENTRY_TYPE).includes(entryType)) throw new Error(`makeWorkspaceTimelineEntry: unknown entryType "${entryType}".`);
  if (typeof actorId !== 'string' || !actorId) throw new Error('makeWorkspaceTimelineEntry: actorId is required.');
  _counter += 1;
  return Object.freeze({
    entryId: `workspace-timeline:${entryType}:${Date.now()}:${_counter}`,
    workspaceId, entryType, suggestionId, blockId, actorId, detail,
    occurredAt: new Date().toISOString(),
  });
}

/** @param {*} e @returns {boolean} */
export function isWorkspaceTimelineEntry(e) {
  return !!e && typeof e === 'object'
    && typeof e.entryId === 'string' && e.entryId.length > 0
    && typeof e.workspaceId === 'string' && e.workspaceId.length > 0
    && Object.values(ENTRY_TYPE).includes(e.entryType)
    && (e.suggestionId === null || typeof e.suggestionId === 'string')
    && (e.blockId === null || typeof e.blockId === 'string')
    && typeof e.actorId === 'string' && e.actorId.length > 0
    && (e.detail === null || typeof e.detail === 'object')
    && typeof e.occurredAt === 'string' && e.occurredAt.length > 0;
}
