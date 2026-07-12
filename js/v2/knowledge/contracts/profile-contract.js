/* ============================================================
   PROFILE-CONTRACT.JS — Knowledge Platform (V2.0.12.5)

   PURPOSE: fix the shape of an Organizational Knowledge Profile — a
   computed, read-only aggregate over Approved KnowledgeItems that answers
   "who/what does this organization actually use" (Recipients, Signatories,
   CC lists, Vocabulary, Paragraph structure, Attachment patterns, Approval
   chains, Writing Style, Departments, Document Categories). A Profile is
   Organizational Knowledge, never Configuration (Decision, V2 roadmap):
   it is derived from what the organization has actually approved, and it
   evolves as Approved Knowledge evolves — it is never a hand-authored
   settings row.

   RESPONSIBILITY: define PROFILE_TYPE (the closed set of ten profile
   kinds the roadmap names), the Profile/ProfileEntry typedefs, and
   structural validators. Does not compute a profile itself — see
   profiles/profile-engine.js.

   DEPENDENCIES: contracts/evidence-contract.js (a ProfileEntry's evidence
   is exactly an Evidence[] — no second provenance shape invented).

   NON-GOALS: does not decide which `kind` backs which PROFILE_TYPE (see
   profiles/profile-engine.js#PROFILE_KIND_MAP) and does not read the
   repository.

   FUTURE EVOLUTION: PROFILE_TYPE is closed by design (the roadmap names
   exactly ten) — a new profile type is an intentional roadmap decision,
   not something a caller can register ad hoc, mirroring how
   lifecycle-contract.js's state set is fixed rather than open.
   ============================================================ */

'use strict';

import { isEvidenceList } from './evidence-contract.js';

export const PROFILE_SCHEMA = 'knowledge-profile@1';

/** The closed set of ten Organizational Knowledge Profile types. */
export const PROFILE_TYPE = Object.freeze({
  RECIPIENT: 'recipient',
  SIGNATORY: 'signatory',
  CC: 'cc',
  VOCABULARY: 'vocabulary',
  PARAGRAPH: 'paragraph',
  ATTACHMENT: 'attachment',
  APPROVAL: 'approval',
  WRITING_STYLE: 'writing_style',
  DEPARTMENT: 'department',
  DOCUMENT_CATEGORY: 'document_category',
});

/** The payload field every profile-eligible KnowledgeItem must carry — the
 *  one convention that lets a single domain-agnostic engine group items
 *  categorically, the same way statistics-engine.js groups numeric fields
 *  generically instead of hardcoding a field name per domain. */
export const PROFILE_VALUE_FIELD = 'value';

/**
 * @typedef {Object} ProfileEntry
 * @property {string} value        - the distinct grouping value (e.g. a recipient name)
 * @property {number} sampleCount  - how many Approved items carry this value
 * @property {number} frequency    - 0–1, sampleCount / profile.sampleCount
 * @property {number} confidence   - 0–1, mean confidence of contributing items
 * @property {import('./evidence-contract.js').Evidence[]} evidence
 */

/**
 * @typedef {Object} Profile
 * @property {string} schema
 * @property {string} profileType   - one of PROFILE_TYPE
 * @property {string} domainType    - registry-backed domainType this profile was computed for
 * @property {ProfileEntry[]} entries
 * @property {number} sampleCount   - total Approved items considered (population size)
 * @property {number} confidence    - 0–1, mean confidence across the whole population
 * @property {number} frequency     - 0–1, sampleCount / total Approved items in domainType (coverage)
 * @property {import('./evidence-contract.js').Evidence[]} provenance - one SOURCE Evidence per contributing item
 * @property {string} computedAt    - ISO 8601
 */

function isRatio(n) {
  return typeof n === 'number' && n >= 0 && n <= 1;
}

/** @param {*} e @returns {boolean} */
export function isProfileEntry(e) {
  return !!e && typeof e === 'object'
    && typeof e.value === 'string' && e.value.length > 0
    && typeof e.sampleCount === 'number' && e.sampleCount > 0
    && isRatio(e.frequency)
    && isRatio(e.confidence)
    && isEvidenceList(e.evidence);
}

/** @param {*} p @returns {boolean} */
export function isProfile(p) {
  return !!p && typeof p === 'object'
    && p.schema === PROFILE_SCHEMA
    && Object.values(PROFILE_TYPE).includes(p.profileType)
    && typeof p.domainType === 'string' && p.domainType.length > 0
    && Array.isArray(p.entries) && p.entries.every(isProfileEntry)
    && typeof p.sampleCount === 'number' && p.sampleCount >= 0
    && isRatio(p.confidence)
    && isRatio(p.frequency)
    && isEvidenceList(p.provenance)
    && typeof p.computedAt === 'string' && p.computedAt.length > 0;
}

/** Structural check for the one convention profile-eligible payloads share.
 *  @param {*} payload @returns {boolean} */
export function isProfileEligiblePayload(payload) {
  return !!payload && typeof payload === 'object'
    && typeof payload[PROFILE_VALUE_FIELD] === 'string' && payload[PROFILE_VALUE_FIELD].length > 0;
}
