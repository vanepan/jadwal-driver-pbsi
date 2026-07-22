/* ============================================================
   UPLOAD-RECOMMENDATION-CONTRACT.JS — Official NOR Digital Archive
   Foundation (V2.0.17)

   PURPOSE: fix the shape of ONE human-readable upload recommendation —
   the roadmap's one new requirement for this milestone: "When NOR
   numbering jumps (120, 123), the system should detect 121, 122 are
   missing... Instead of blocking, recommend 'Upload missing NOR 121 and
   122.'" Everything this recommendation is built FROM already existed
   (gap-detection-engine.js's ArchiveGap, gap-workflow-engine.js's
   FLAGGED_FOR_UPLOAD workflow state, both V2.0.7/Phase 10) — this
   contract only fixes the shape of the grouped, human-readable summary
   sentence over those existing gaps.

   RESPONSIBILITY: define UploadRecommendation and a constructor.

   DEPENDENCIES: none.

   NON-GOALS: does not detect gaps (gap-detection-engine.js, unmodified).
   Does not implement file upload — no Storage capability exists
   anywhere in this codebase (see gap-workflow-engine.js's own header);
   this is a recommendation SENTENCE, never a mechanism.
   ============================================================ */

'use strict';

export const UPLOAD_RECOMMENDATION_SCHEMA = 'upload-recommendation@1';

/**
 * @typedef {Object} UploadRecommendation
 * @property {string} recommendationId
 * @property {string} domainType
 * @property {string[]} expectedNumbers  - the consecutive missing numbers this recommendation groups
 * @property {string[]} gapIds           - the ArchiveGap ids (gap-contract.js) this recommendation was built from
 * @property {string} message            - human-readable, e.g. "Upload missing NOR 121 and 122."
 * @property {string} generatedAt        - ISO 8601
 */

let _counter = 0;

export function makeUploadRecommendation({ domainType, expectedNumbers, gapIds, message }) {
  _counter += 1;
  return Object.freeze({
    recommendationId: `upload-rec:${domainType}:${Date.now()}:${_counter}`,
    domainType,
    expectedNumbers: Object.freeze([...expectedNumbers]),
    gapIds: Object.freeze([...gapIds]),
    message,
    generatedAt: new Date().toISOString(),
  });
}

export function isUploadRecommendation(r) {
  return !!r && typeof r === 'object'
    && typeof r.recommendationId === 'string' && r.recommendationId.length > 0
    && typeof r.domainType === 'string' && r.domainType.length > 0
    && Array.isArray(r.expectedNumbers) && r.expectedNumbers.length > 0
    && Array.isArray(r.gapIds) && r.gapIds.length === r.expectedNumbers.length
    && typeof r.message === 'string' && r.message.length > 0;
}
