/* ============================================================
   COMPOSER-DOCUMENT-CONTRACT.JS — Live Editable Composer Foundation (V2.0.15)

   PURPOSE: fix the shape of a ComposerDocument — a DocumentDraft
   (document-draft-contract.js) reshaped into named, independently
   editable, independently traceable sections. Specializes DocumentDraft
   the same way nor-draft-contract.js specializes it for NOR — NOT a
   redefinition; `fields` there becomes `sections` here, one
   EditableSection per field.

   RESPONSIBILITY: define ComposerDocument and a constructor.

   DEPENDENCIES: editable-section-contract.js, contracts/document-draft-contract.js
   (typedef reference only — a real orchestrator turning a DocumentDraft
   into a ComposerDocument is a future consumer's job, not built here).

   NON-GOALS: no content is generated — `fromDraft` below only reshapes
   whatever `fields` a caller already has (e.g. a human-authored draft),
   never invents a value.
   ============================================================ */

'use strict';

import { makeEditableSection, isEditableSection } from './editable-section-contract.js';

export const COMPOSER_DOCUMENT_SCHEMA = 'composer-document@1';

/**
 * @typedef {Object} ComposerDocument
 * @property {string} documentId
 * @property {string} domainType
 * @property {number} version        - append-only, starts at 1
 * @property {import('./editable-section-contract.js').EditableSection[]} sections
 * @property {string} createdAt
 * @property {string} updatedAt
 */

let _counter = 0;

/** Reshapes a plain `{field: value}` map (e.g. a DocumentDraft.fields) into
 *  a ComposerDocument — one EditableSection per field, none overridden yet. */
export function makeComposerDocument(domainType, fields = {}) {
  _counter += 1;
  const now = new Date().toISOString();
  return Object.freeze({
    documentId: `composer-doc:${domainType}:${Date.now()}:${_counter}`,
    domainType, version: 1,
    sections: Object.freeze(Object.entries(fields).map(([field, value]) => makeEditableSection({ field, value }))),
    createdAt: now, updatedAt: now,
  });
}

export function isComposerDocument(d) {
  return !!d && typeof d === 'object'
    && typeof d.documentId === 'string' && d.documentId.length > 0
    && typeof d.domainType === 'string' && d.domainType.length > 0
    && typeof d.version === 'number' && d.version >= 1
    && Array.isArray(d.sections) && d.sections.every(isEditableSection);
}
