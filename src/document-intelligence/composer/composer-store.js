/* ============================================================
   COMPOSER-STORE.JS — Live Editable Composer Foundation (V2.0.15)

   PURPOSE: a REAL, working in-memory store for ComposerDocuments and
   their revision history — mirroring document-intelligence/session-store.js's
   own precedent (Phase 9.5, "now-real") of shipping a genuine Map-backed
   store as part of a foundation milestone, not a stub. "Everything
   editable. Everything traceable." — every edit produces both a Field
   Override record and a new append-only ComposerRevision carrying a real
   Diff (knowledge/learning/diff-engine.js — the SHARED Diff Model).

   RESPONSIBILITY: `createDocument`, `getDocument`, `editSection`,
   `getRevisionHistory` (Composer History), `getComposerTimeline`,
   `attachExplainability`/`getExplainability` (Sprint 10.2),
   `listAllDocuments` (Sprint 10.1), `transitionStatus`/`getReviewHistory`
   (Sprint 10.4 — the ComposerDocument review workflow).

   DEPENDENCIES: contracts/composer-document-contract.js,
   contracts/field-override-contract.js, contracts/composer-revision-contract.js,
   contracts/composer-review-contract.js (Sprint 10.4),
   knowledge/learning/diff-engine.js, composer-document-repository.js,
   knowledge/review/contracts/promotion-contract.js + knowledge/review/
   review-history.js (Sprint 10.4 — reused verbatim, both already
   domain-agnostic).

   Phase 10, Sprint 10.1 — this file's own two Maps (`_documents`/
   `_revisions`) are RETIRED in favor of composer-document-repository.js's
   single persisted `{document, revisions}` record per id (RTDB-backed,
   survives reload — see that file's header for the full story). Every
   export below keeps its EXACT existing signature and return shape; no
   caller (nor-composer.js, problem-solving-service.js, nor-center.js)
   needs to change.

   NON-GOALS: never writes to Knowledge — a ComposerDocument's edits stay
   local to this store until V2.0.16's Diff Learning Foundation
   deliberately turns one into a Correction. Never generates a section's
   value — `createDocument`/`editSection` only ever store what a caller
   supplies.
   ============================================================ */

'use strict';

import { makeComposerDocument } from './contracts/composer-document-contract.js';
import { makeEditableSection } from './contracts/editable-section-contract.js';
import { makeFieldOverride } from './contracts/field-override-contract.js';
import { makeComposerRevision } from './contracts/composer-revision-contract.js';
import { computeDiff } from '../../../js/v2/knowledge/learning/diff-engine.js';
import { getRecord, putRecord, listRecords, resetComposerDocumentRepository } from './composer-document-repository.js';
// Phase 10, Sprint 10.4 — the ComposerDocument review lifecycle is its OWN
// graph (see that file's header for why it is NOT a reuse of knowledge/
// contracts/lifecycle-contract.js).
import { canTransitionComposerReview, COMPOSER_REVIEW_STATE } from './contracts/composer-review-contract.js';
// Reused VERBATIM — both are already domain-agnostic (itemId is just a
// string; neither imports KnowledgeItem or anything knowledge-specific),
// confirmed during Phase 10 planning research. No new audit-log code.
import { makePromotionRecord } from '../../../js/v2/knowledge/review/contracts/promotion-contract.js';
import { recordPromotion, listReviewHistory } from '../../../js/v2/knowledge/review/review-history.js';

export const COMPOSER_STORE_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  UNKNOWN_FIELD: 'UNKNOWN_FIELD',
  FIELD_ALREADY_EXISTS: 'FIELD_ALREADY_EXISTS',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  RATIONALE_REQUIRED: 'RATIONALE_REQUIRED',
});

function sectionsToFieldMap(sections) {
  const map = {};
  for (const s of sections) map[s.field] = s.value;
  return map;
}

/** @param {string} domainType @param {Object} fields @returns {import('./contracts/composer-document-contract.js').ComposerDocument} */
export function createDocument(domainType, fields = {}) {
  const doc = makeComposerDocument(domainType, fields);
  const initialRevision = makeComposerRevision({ documentId: doc.documentId, version: 1, sections: doc.sections, diff: null, editedBy: null });
  putRecord(doc.documentId, doc, [initialRevision]);
  return doc;
}

export function getDocument(documentId) {
  const record = getRecord(documentId);
  return record ? record.document : null;
}

/**
 * Applies a Field Override to one section, producing a new ComposerRevision
 * with a real Diff against the immediately preceding revision.
 * @param {string} documentId @param {string} field @param {*} overrideValue @param {string} overriddenBy
 */
export function editSection(documentId, field, overrideValue, overriddenBy) {
  const record = getRecord(documentId);
  if (!record) {
    return { ok: false, document: null, revision: null, override: null, error: { code: COMPOSER_STORE_ERRORS.NOT_FOUND, message: `No ComposerDocument "${documentId}".` } };
  }
  const doc = record.document;
  const sectionIndex = doc.sections.findIndex((s) => s.field === field);
  if (sectionIndex === -1) {
    return { ok: false, document: null, revision: null, override: null, error: { code: COMPOSER_STORE_ERRORS.UNKNOWN_FIELD, message: `ComposerDocument "${documentId}" has no section "${field}".` } };
  }

  const before = sectionsToFieldMap(doc.sections);
  const originalSection = doc.sections[sectionIndex];
  const override = makeFieldOverride({
    sectionId: originalSection.sectionId, field, originalValue: originalSection.value, overrideValue, overriddenBy,
  });

  const newSections = doc.sections.map((s, i) => (i === sectionIndex
    ? Object.freeze({ ...s, value: overrideValue, isOverridden: true })
    : s));
  const after = sectionsToFieldMap(newSections);
  const diff = computeDiff(before, after);

  const version = doc.version + 1;
  const updatedDoc = Object.freeze({ ...doc, sections: Object.freeze(newSections), version, updatedAt: new Date().toISOString() });

  const revision = makeComposerRevision({ documentId, version, sections: newSections, diff, editedBy: overriddenBy });
  putRecord(documentId, updatedDoc, [...record.revisions, revision]);

  return { ok: true, document: updatedDoc, revision, override, error: null };
}

/**
 * Phase 11 Course Correction, Workstream 1 — creates a genuinely NEW
 * section that did not exist in the document before (e.g. "Kepada Yth."/
 * "Dari"/"Tembusan Yth." on a document composed before those were part of
 * any NOR Type's fieldSchema). `editSection` above deliberately refuses
 * this (UNKNOWN_FIELD) — a field appearing out of nowhere on an EXISTING
 * document would be indistinguishable from a silent fabrication; this
 * function exists precisely so that distinction stays real: a NEW field
 * only ever enters a document through this ONE explicit call, always
 * starting from a human directly typing it (the Live Document Workspace's
 * inline "+ Tambahkan Bagian" affordance is its only caller), never
 * pre-populated with guessed content. Same Diff/Revision shape as
 * editSection — `before` is the empty-string convention every other
 * "field did not exist yet" read in this codebase already uses (matches
 * content-fact-extraction-engine.js's own '' -> found value shape), never
 * `undefined` (computeDiff must see two real, comparable field maps).
 * @param {string} documentId @param {string} field @param {*} value @param {string} addedBy
 */
export function addSection(documentId, field, value, addedBy) {
  const record = getRecord(documentId);
  if (!record) {
    return { ok: false, document: null, revision: null, error: { code: COMPOSER_STORE_ERRORS.NOT_FOUND, message: `No ComposerDocument "${documentId}".` } };
  }
  const doc = record.document;
  if (doc.sections.some((s) => s.field === field)) {
    return { ok: false, document: null, revision: null, error: { code: COMPOSER_STORE_ERRORS.FIELD_ALREADY_EXISTS, message: `ComposerDocument "${documentId}" already has a section "${field}" — use editSection instead.` } };
  }

  const before = sectionsToFieldMap(doc.sections);
  const newSection = Object.freeze({ ...makeEditableSection({ field, value }), isOverridden: true });
  const newSections = [...doc.sections, newSection];
  const after = sectionsToFieldMap(newSections);
  const diff = computeDiff(before, after);

  const version = doc.version + 1;
  const updatedDoc = Object.freeze({ ...doc, sections: Object.freeze(newSections), version, updatedAt: new Date().toISOString() });

  const revision = makeComposerRevision({ documentId, version, sections: newSections, diff, editedBy: addedBy });
  putRecord(documentId, updatedDoc, [...record.revisions, revision]);

  return { ok: true, document: updatedDoc, revision, error: null };
}

/** Composer History — every revision, oldest first. */
export function getRevisionHistory(documentId) {
  const record = getRecord(documentId);
  return record ? [...record.revisions] : [];
}

/** Composer Timeline — every document of one domainType, oldest first. */
export function getComposerTimeline(domainType) {
  return listRecords()
    .map((r) => r.document)
    .filter((d) => d.domainType === domainType)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((d) => Object.freeze({ documentId: d.documentId, version: d.version, updatedAt: d.updatedAt }));
}

/** Phase 10, Sprint 10.2 — attaches explainability data computed ONE LAYER
 *  ABOVE this store (problem-solving-service.js#composeApprovedNor, after
 *  it has both `composed.data` and a real Reasoning Recommendation) —
 *  reasoning/ and conversation/ are not dependencies this store or
 *  nor-composer.js may take (see js/v2/README.md's dependency graph), so
 *  the data cannot be gathered here; it can only be RECEIVED and stored
 *  here. Additive: a document with none attached simply has none to show
 *  (nor-explainability-service.js reports this honestly, never fabricates
 *  a placeholder). */
export function attachExplainability(documentId, explainabilityData) {
  const record = getRecord(documentId);
  if (!record) {
    return { ok: false, error: { code: COMPOSER_STORE_ERRORS.NOT_FOUND, message: `No ComposerDocument "${documentId}".` } };
  }
  putRecord(documentId, record.document, record.revisions, explainabilityData);
  return { ok: true, error: null };
}

/** @returns {object|null} the explainability bag attached via
 *  attachExplainability(), or null if none exists yet. */
export function getExplainability(documentId) {
  const record = getRecord(documentId);
  return record ? (record.explainability || null) : null;
}

/** Phase 10, Sprint 10.1 — every ComposerDocument across every domainType,
 *  newest first. Review Workspace's own entry point: unlike
 *  getComposerTimeline() (one domain, summary shape only, an existing NOR
 *  Center contract this file must not change), a reviewer needs the FULL
 *  current document (not just id/version/updatedAt) and is not scoped to
 *  one domainType by construction. */
export function listAllDocuments() {
  return listRecords()
    .map((r) => r.document)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// Phase 10, Sprint 10.1 — re-exported so every UI consumer (review-
// workspace.js) reaches live-update notifications through this store, the
// same layering knowledge-service.js already establishes for knowledge-
// center.js (UI never imports a repository file directly).
export { registerChangeListener } from './composer-document-repository.js';

/**
 * Phase 10, Sprint 10.4 — the ONE place a ComposerDocument's review status
 * legally changes. Checks canTransitionComposerReview() BEFORE writing
 * (same pre-check shape import-session-repository.js#appendVersion already
 * uses for canTransitionImportSession), and — spec: "No automatic
 * approval" — refuses APPROVED without a real, non-blank rationale, the
 * identical requirement knowledge/contracts/review-contract.js#
 * isValidReviewDecision already enforces for Knowledge.
 *
 * Status-only transitions do NOT bump `version` or create a new
 * ComposerRevision: `version`/revisions track CONTENT edits (Sprint 10.1),
 * a separate axis from review status — conflating them would make Version
 * Information noisy with status-only entries that have no content diff.
 * The audit trail lives in review-history.js instead (recordPromotion),
 * exactly where Knowledge's own promotions are recorded.
 *
 * @param {string} documentId
 * @param {string} toState  one of COMPOSER_REVIEW_STATE
 * @param {{actorId: string, rationale?: string|null}} opts
 */
export function transitionStatus(documentId, toState, { actorId, rationale = null } = {}) {
  const record = getRecord(documentId);
  if (!record) {
    return { ok: false, document: null, error: { code: COMPOSER_STORE_ERRORS.NOT_FOUND, message: `No ComposerDocument "${documentId}".` } };
  }
  const fromState = record.document.status;
  if (!canTransitionComposerReview(fromState, toState)) {
    return { ok: false, document: null, error: { code: COMPOSER_STORE_ERRORS.ILLEGAL_TRANSITION, message: `Cannot transition ComposerDocument "${documentId}" from "${fromState}" to "${toState}".` } };
  }
  if (toState === COMPOSER_REVIEW_STATE.APPROVED && (!rationale || !rationale.trim())) {
    return { ok: false, document: null, error: { code: COMPOSER_STORE_ERRORS.RATIONALE_REQUIRED, message: 'Menyetujui dokumen memerlukan alasan/rasional keputusan.' } };
  }

  const updatedDoc = Object.freeze({ ...record.document, status: toState, updatedAt: new Date().toISOString() });
  putRecord(documentId, updatedDoc, record.revisions);

  const decidedAt = updatedDoc.updatedAt;
  recordPromotion(makePromotionRecord({
    itemId: documentId, itemVersion: updatedDoc.version, fromState, toState, approverId: actorId, decidedAt, preferenceRationale: rationale,
  }));

  return { ok: true, document: updatedDoc, error: null };
}

/** The audit trail for one document's review status — every
 *  transitionStatus() call, oldest first. Reused verbatim from
 *  review-history.js (itemId = documentId works as-is, confirmed
 *  domain-agnostic). */
export function getReviewHistory(documentId) {
  return listReviewHistory(documentId);
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetComposerStore() {
  resetComposerDocumentRepository();
}
