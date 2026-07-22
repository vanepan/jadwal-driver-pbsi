/* ============================================================
   WORKSPACE-TIMELINE-REPOSITORY.JS — Live Word Workspace (V2, Phase 12.8.5)

   PURPOSE: the store for WorkspaceTimelineEntry — Learning-style (direct
   exported functions over a module-local Map, no Null variant, no
   swappable-backend registry), same shape as
   body/repository/body-event-repository.js and for the identical reason:
   a timeline entry is an append-only log entry, not a versioned record
   with its own lifecycle.

   Entries are immutable — no appendVersion, no delete. Same "there is no
   delete" reasoning body-event-repository.js's own header gives.

   ══════════════════════════════════════════════════════════════════════
   OWNERSHIP: the ONE legitimate caller of `append()` is
   services/workspace-service.js — enforced by
   scripts/workspace-ownership-check.mjs.
   ══════════════════════════════════════════════════════════════════════

   DEPENDENCIES: contracts/workspace-timeline-entry-contract.js
   (isWorkspaceTimelineEntry).
   ============================================================ */

'use strict';

import { isWorkspaceTimelineEntry } from '../contracts/workspace-timeline-entry-contract.js';

export const WORKSPACE_TIMELINE_REPOSITORY_ERRORS = Object.freeze({
  DUPLICATE_ID: 'DUPLICATE_ID',
  INVALID_ENTRY: 'INVALID_ENTRY',
});

function success(data) { return Object.freeze({ ok: true, data: data ?? null, error: null }); }
function failure(code, message) { return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) }); }

/** @type {Map<string, object>} entryId -> WorkspaceTimelineEntry */
const _store = new Map();

export function append(entry) {
  if (!entry || typeof entry.entryId !== 'string' || !entry.entryId) {
    return failure(WORKSPACE_TIMELINE_REPOSITORY_ERRORS.INVALID_ENTRY, 'append: entry.entryId must be supplied by the caller.');
  }
  if (_store.has(entry.entryId)) {
    return failure(WORKSPACE_TIMELINE_REPOSITORY_ERRORS.DUPLICATE_ID, `An entry with id "${entry.entryId}" already exists.`);
  }
  if (!isWorkspaceTimelineEntry(entry)) {
    return failure(WORKSPACE_TIMELINE_REPOSITORY_ERRORS.INVALID_ENTRY, 'append: entry does not satisfy the WorkspaceTimelineEntry contract.');
  }
  _store.set(entry.entryId, Object.freeze({ ...entry }));
  return success(_store.get(entry.entryId));
}

export function list(filter = {}) {
  let items = [..._store.values()];
  if (filter.workspaceId) items = items.filter((e) => e.workspaceId === filter.workspaceId);
  if (filter.entryType) items = items.filter((e) => e.entryType === filter.entryType);
  if (filter.blockId) items = items.filter((e) => e.blockId === filter.blockId);
  return success(items.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()));
}

export function getForWorkspace(workspaceId) {
  return list({ workspaceId });
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetWorkspaceTimelineRepository() {
  _store.clear();
}
