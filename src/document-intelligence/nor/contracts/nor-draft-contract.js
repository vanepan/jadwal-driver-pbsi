/* ============================================================
   NOR-DRAFT-CONTRACT.JS — NOR Intelligence Foundation (V2, Phase 8)

   PURPOSE: specialize document-intelligence's generic DocumentDraft/
   DocumentDraftValidation/DocumentExplanation/DocumentRecommendation
   (../../contracts/document-draft-contract.js) for NOR, plus NOR Preview —
   a read-only rendering of a draft using the EXISTING NOR Document Engine
   (js/petty-cash/nor-document-engine.js's `buildNorViewModel` +
   js/docs/templates/nor.js), never a new renderer.

   RESPONSIBILITY: NorDraft, NorValidation, NorReview, NorPreview typedefs.

   DEPENDENCIES: document-intelligence/contracts/document-draft-contract.js.

   NON-GOALS: no draft is generated. No template is duplicated. `NorPreview`
   is documentation of WHAT a future preview would reuse
   (`buildNorViewModel` → existing pdfmake/HTML/Excel renderers) — this
   file does not import or call any of them.

   FUTURE EVOLUTION: a real NOR pilot implementation feeds a NorDraft's
   `fields` into the EXISTING `buildNorViewModel(nor)` unchanged, so preview
   rendering is never re-implemented — only the fields are assisted.
   ============================================================ */

'use strict';

import { isDocumentDraft, isDocumentDraftValidation } from '../../contracts/document-draft-contract.js';

/**
 * @typedef {Object} NorDraft
 * @property {string} sessionId
 * @property {'nor'} domainType
 * @property {object} fields   - shape matches whatever `buildNorViewModel(nor)` (js/petty-cash/nor-document-engine.js) expects as input, NOT redefined here
 */

/** @typedef {import('../../contracts/document-draft-contract.js').DocumentDraftValidation} NorValidation */

/**
 * @typedef {Object} NorReview
 * @property {string} sessionId
 * @property {boolean} approved
 * @property {string} [note]
 */

/**
 * A NOR Preview is NEVER a new render — it is a pointer to invoking the
 * EXISTING `buildNorViewModel` + existing template renderer, unchanged.
 * @typedef {Object} NorPreview
 * @property {string} sessionId
 * @property {string} reusesViewModelBuilder  - documentation-only string: 'js/petty-cash/nor-document-engine.js#buildNorViewModel'
 */

export function isNorDraft(d) {
  return isDocumentDraft(d) && d.domainType === 'nor';
}

export { isDocumentDraftValidation as isNorValidation };
