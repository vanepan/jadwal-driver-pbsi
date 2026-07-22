/* ============================================================
   EDITABLE-SECTION-CONTRACT.JS — Live Editable Composer Foundation (V2.0.15)

   PURPOSE: fix the shape of ONE editable field of a ComposerDocument —
   "Editable Sections." Ties together Field Override (has this section
   been human-edited yet), Knowledge References (which Approved
   KnowledgeItems ground this section's current value — reusing
   knowledge/contracts/evidence-contract.js's Evidence[] directly, not a
   second citation shape), and a Suggestion Placeholder (always empty
   this milestone).

   RESPONSIBILITY: define EditableSection and a constructor.

   DEPENDENCIES: knowledge/contracts/evidence-contract.js (Evidence[] —
   the one-way Document-Intelligence-reads-Knowledge dependency this
   whole layer already follows), field-override-contract.js,
   suggestion-placeholder-contract.js.

   NON-GOALS: does not decide a section's value — a caller (a human,
   through the Composer store) supplies it.
   ============================================================ */

'use strict';

import { isEvidenceList } from '../../../../js/v2/knowledge/contracts/evidence-contract.js';
import { isSuggestionPlaceholder } from './suggestion-placeholder-contract.js';

export const EDITABLE_SECTION_SCHEMA = 'editable-section@1';

/**
 * @typedef {Object} EditableSection
 * @property {string} sectionId
 * @property {string} field
 * @property {*} value
 * @property {boolean} isOverridden
 * @property {import('../../../../js/v2/knowledge/contracts/evidence-contract.js').Evidence[]} knowledgeReferences
 * @property {import('./suggestion-placeholder-contract.js').SuggestionPlaceholder|null} suggestionPlaceholder
 */

export function makeEditableSection({ field, value, knowledgeReferences = [], suggestionPlaceholder = null }) {
  return Object.freeze({
    sectionId: `section:${field}`,
    field, value, isOverridden: false,
    knowledgeReferences: Object.freeze([...knowledgeReferences]),
    suggestionPlaceholder,
  });
}

export function isEditableSection(s) {
  return !!s && typeof s === 'object'
    && typeof s.sectionId === 'string' && s.sectionId.length > 0
    && typeof s.field === 'string' && s.field.length > 0
    && typeof s.isOverridden === 'boolean'
    && isEvidenceList(s.knowledgeReferences)
    && (s.suggestionPlaceholder === null || isSuggestionPlaceholder(s.suggestionPlaceholder));
}
