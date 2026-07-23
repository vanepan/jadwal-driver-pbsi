/* ============================================================
   EVENT-CONTRACT.JS — Knowledge Repository Observability (V2, Phase 9.1)

   PURPOSE: fix the shape of a storage-level fact — "item X now has version
   N" — distinct from lifecycle/contracts/event-contract.js's
   LifecycleEvent, which is about BUSINESS meaning (state X -> state Y). A
   `create()` is a RepositoryEvent but not a LifecycleEvent (a brand new
   Draft item has no "from" state); a plain content re-acquisition
   (appendVersion with the same lifecycleState) is a RepositoryEvent but
   not a LifecycleEvent either.

   RESPONSIBILITY: define REPOSITORY_EVENT_TYPE and RepositoryEvent.

   DEPENDENCIES: none.

   NON-GOALS: does not emit anything — see repository/knowledge-repository.js,
   the facade every backend is called through, which is the one place that
   sees every write regardless of which backend (Null, Memory, future
   Firebase) is active.
   ============================================================ */

'use strict';

export const REPOSITORY_EVENT_TYPE = Object.freeze({
  CREATED: 'created',
  VERSION_APPENDED: 'version_appended',
  ROLLED_BACK: 'rolled_back',
});

/**
 * @typedef {Object} RepositoryEvent
 * @property {string} type    - one of REPOSITORY_EVENT_TYPE
 * @property {string} id      - the KnowledgeItem id written
 * @property {number} version - the resulting version number
 * @property {string} lifecycleState - the resulting lifecycleState
 * @property {string} at      - ISO 8601
 */

export function makeRepositoryEvent(type, { id, version, lifecycleState }) {
  return Object.freeze({ type, id, version, lifecycleState, at: new Date().toISOString() });
}
