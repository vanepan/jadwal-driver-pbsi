/* ============================================================
   COMPOSER-REVISION-CONTRACT.JS — Live Editable Composer Foundation (V2.0.15)

   PURPOSE: fix the shape of ONE ComposerDocument revision — "Revision
   Graph"/"Composer History" as append-only rows, mirroring
   knowledge-item-contract.js's own "a transition is a NEW version, never
   an overwrite" invariant (identity-contract.js's IDENTITY_INVARIANTS).
   Each revision carries the Diff (knowledge/learning/contracts/
   diff-contract.js — the SHARED Diff Model) against its immediate
   predecessor, so the timeline is traceable without recomputing anything.

   RESPONSIBILITY: define ComposerRevision and a constructor.

   DEPENDENCIES: knowledge/learning/contracts/diff-contract.js (Diff, the
   one shared Diff Model — no second diff shape invented here).

   NON-GOALS: does not compute the diff itself — see
   composer-store.js#editSection, which calls knowledge/learning/
   diff-engine.js#computeDiff.
   ============================================================ */

'use strict';

import { isDiff } from '../../../knowledge/learning/contracts/diff-contract.js';

export const COMPOSER_REVISION_SCHEMA = 'composer-revision@1';

/**
 * @typedef {Object} ComposerRevision
 * @property {string} revisionId
 * @property {string} documentId
 * @property {number} version              - matches the ComposerDocument.version this revision produced
 * @property {import('./editable-section-contract.js').EditableSection[]} sections - full snapshot at this version
 * @property {import('../../../knowledge/learning/contracts/diff-contract.js').Diff|null} diff - against the immediate predecessor; null for the first revision
 * @property {string|null} editedBy         - who caused this revision, null for the initial (non-edited) revision
 * @property {string} createdAt             - ISO 8601
 */

let _counter = 0;

export function makeComposerRevision({ documentId, version, sections, diff = null, editedBy = null }) {
  _counter += 1;
  return Object.freeze({
    revisionId: `revision:${documentId}:${version}:${_counter}`,
    documentId, version, sections: Object.freeze([...sections]), diff, editedBy,
    createdAt: new Date().toISOString(),
  });
}

export function isComposerRevision(r) {
  return !!r && typeof r === 'object'
    && typeof r.revisionId === 'string' && r.revisionId.length > 0
    && typeof r.documentId === 'string' && r.documentId.length > 0
    && typeof r.version === 'number' && r.version >= 1
    && Array.isArray(r.sections)
    && (r.diff === null || isDiff(r.diff));
}
