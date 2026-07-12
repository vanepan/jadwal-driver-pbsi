/* ============================================================
   COMPOSER-SESSION-CONTRACT.JS — Live Editable Composer Foundation (V2.0.15)

   PURPOSE: specialize document-intelligence's generic DocumentSession/
   DOCUMENT_SESSION_STATE (../../contracts/document-context-contract.js)
   for the Composer — NOT a redefinition, the exact reuse pattern
   nor-session-contract.js already establishes for the NOR pilot.
   ANALYZING/DRAFTING/REVIEWING/FINALIZED/ABANDONED already describes a
   Composer session's lifecycle correctly; no new state machine needed.

   RESPONSIBILITY: ComposerSession typedef — a thin, documentId-scoped
   wrapper over the generic DocumentSession shape.

   DEPENDENCIES: document-intelligence/contracts/document-context-contract.js.
   ============================================================ */

'use strict';

import { DOCUMENT_SESSION_STATE, canTransitionDocumentSession } from '../../contracts/document-context-contract.js';

/**
 * @typedef {Object} ComposerSession
 * @property {string} id
 * @property {string} documentId
 * @property {string} state        - one of DOCUMENT_SESSION_STATE (reused, not redefined)
 * @property {string} startedAt
 * @property {string} updatedAt
 */

let _counter = 0;

export function startComposerSession(documentId) {
  _counter += 1;
  const now = new Date().toISOString();
  return Object.freeze({
    id: `composer-session:${documentId}:${_counter}`,
    documentId, state: DOCUMENT_SESSION_STATE.DRAFTING,
    startedAt: now, updatedAt: now,
  });
}

export { DOCUMENT_SESSION_STATE, canTransitionDocumentSession };
