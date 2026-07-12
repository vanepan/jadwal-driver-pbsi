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
   `getRevisionHistory` (Composer History), `getComposerTimeline`.

   DEPENDENCIES: contracts/composer-document-contract.js,
   contracts/field-override-contract.js, contracts/composer-revision-contract.js,
   knowledge/learning/diff-engine.js.

   NON-GOALS: never writes to Knowledge — a ComposerDocument's edits stay
   local to this store until V2.0.16's Diff Learning Foundation
   deliberately turns one into a Correction. Never generates a section's
   value — `createDocument`/`editSection` only ever store what a caller
   supplies.
   ============================================================ */

'use strict';

import { makeComposerDocument } from './contracts/composer-document-contract.js';
import { makeFieldOverride } from './contracts/field-override-contract.js';
import { makeComposerRevision } from './contracts/composer-revision-contract.js';
import { computeDiff } from '../../knowledge/learning/diff-engine.js';

export const COMPOSER_STORE_ERRORS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  UNKNOWN_FIELD: 'UNKNOWN_FIELD',
});

/** @type {Map<string, object>} documentId -> current ComposerDocument */
const _documents = new Map();
/** @type {Map<string, object[]>} documentId -> ordered ComposerRevision[] */
const _revisions = new Map();

function sectionsToFieldMap(sections) {
  const map = {};
  for (const s of sections) map[s.field] = s.value;
  return map;
}

/** @param {string} domainType @param {Object} fields @returns {import('./contracts/composer-document-contract.js').ComposerDocument} */
export function createDocument(domainType, fields = {}) {
  const doc = makeComposerDocument(domainType, fields);
  _documents.set(doc.documentId, doc);
  _revisions.set(doc.documentId, [
    makeComposerRevision({ documentId: doc.documentId, version: 1, sections: doc.sections, diff: null, editedBy: null }),
  ]);
  return doc;
}

export function getDocument(documentId) {
  return _documents.get(documentId) || null;
}

/**
 * Applies a Field Override to one section, producing a new ComposerRevision
 * with a real Diff against the immediately preceding revision.
 * @param {string} documentId @param {string} field @param {*} overrideValue @param {string} overriddenBy
 */
export function editSection(documentId, field, overrideValue, overriddenBy) {
  const doc = _documents.get(documentId);
  if (!doc) {
    return { ok: false, document: null, revision: null, override: null, error: { code: COMPOSER_STORE_ERRORS.NOT_FOUND, message: `No ComposerDocument "${documentId}".` } };
  }
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
  _documents.set(documentId, updatedDoc);

  const revision = makeComposerRevision({ documentId, version, sections: newSections, diff, editedBy: overriddenBy });
  _revisions.get(documentId).push(revision);

  return { ok: true, document: updatedDoc, revision, override, error: null };
}

/** Composer History — every revision, oldest first. */
export function getRevisionHistory(documentId) {
  return [...(_revisions.get(documentId) || [])];
}

/** Composer Timeline — every document of one domainType, oldest first. */
export function getComposerTimeline(domainType) {
  return [..._documents.values()]
    .filter((d) => d.domainType === domainType)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((d) => Object.freeze({ documentId: d.documentId, version: d.version, updatedAt: d.updatedAt }));
}

/** Test/teardown helper. Not used by any runtime path. */
export function resetComposerStore() {
  _documents.clear();
  _revisions.clear();
}
