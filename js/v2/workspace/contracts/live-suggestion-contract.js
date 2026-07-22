/* ============================================================
   LIVE-SUGGESTION-CONTRACT.JS — Live Word Workspace (V2, Phase 12.8.3)

   PURPOSE: fix the ONE envelope every Live Composition output is stored
   as — mirrors recognition-record-contract.js's "one record shape, one
   discriminant field" role exactly (`suggestionType` here plays
   `recordType`'s part). A Live Suggestion is the uniform, explainable,
   human-gated unit workspace-suggestion-engine.js (Sprint 12.8.3)
   produces by composing Knowledge/Body/Recognition/Learning read-only
   outputs — see js/v2/workspace/README.md §"Live Suggestion" for the
   full architecture review this realizes.

   RELATIONSHIP TO document-intelligence/composer/contracts/
   suggestion-placeholder-contract.js: that file ALREADY reserves a
   per-field SUGGESTED/ACCEPTED/REJECTED state machine on EditableSection
   itself, explicitly documented as waiting for "a future recommendation
   engine" — this IS that engine. Deliberately NOT wired to mutate
   suggestionPlaceholder in this phase: doing so would require
   composer-store.js to grow a new write path, and document-intelligence/
   stays byte-for-byte unchanged this phase (see workspace/README.md's
   "What Phase 12.8 does NOT do"). A LiveSuggestion is rendered
   ALONGSIDE its block by the UI, never written onto it. Flagged as a
   named future-expansion opportunity, not solved here.

   CITE-OR-ABSTAIN IS STRUCTURAL, NOT JUST CONVENTIONAL: unlike
   RecognitionRecord (whose `evidence` MAY legally be empty — "not enough
   evidence yet" is itself an honest state a Recognition finding can be
   in), a LiveSuggestion is a human-facing recommendation, not a raw
   observation — isLiveSuggestion() below REQUIRES at least one Evidence.
   workspace-suggestion-engine.js never constructs one without evidence;
   this contract makes that a structural guarantee, not just a habit.

   RESPONSIBILITY: define SUGGESTION_STATUS, the LiveSuggestion shape, and
   a structural validator.

   DEPENDENCIES: knowledge/contracts/evidence-contract.js (Evidence[] —
   reused, not a second citation shape).

   NON-GOALS: does not decide confidence or evidence — a caller
   (workspace-suggestion-engine.js) supplies them, already computed.
   ============================================================ */

'use strict';

import { isEvidenceList } from '../../knowledge/contracts/evidence-contract.js';

export const LIVE_SUGGESTION_SCHEMA = 'live-suggestion@1';

/** Closed set — a LiveSuggestion's own lifecycle, deliberately SEPARATE
 *  from SuggestionPlaceholder's SUGGESTION_STATUS (see header: two
 *  different objects, not yet bridged). */
export const SUGGESTION_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  SUPERSEDED: 'superseded',
});

/** Which upstream domain produced this suggestion's payload — always one
 *  workspace/ is a documented, approved reader of (js/v2/README.md's
 *  Phase 12.8 / 12.8.x dependency-direction extensions). REASONING added
 *  Phase 12.8.x, Sprint 3 — the second, narrow graph grant, mirroring the
 *  Phase 12.8 body/ grant exactly (see js/v2/workspace/README.md §2). */
export const SUGGESTION_SOURCE_DOMAIN = Object.freeze({
  KNOWLEDGE: 'knowledge',
  ORGANIZATIONAL_MEMORY: 'organizational-memory',
  RECOGNITION: 'recognition',
  LEARNING: 'learning',
  BODY: 'body',
  REASONING: 'reasoning',
});

/**
 * @typedef {Object} LiveSuggestion
 * @property {string} suggestionId
 * @property {string} workspaceId
 * @property {string|null} blockId       - which Live Block this concerns, or null for a document-wide suggestion
 * @property {string} suggestionType     - registry-backed, see registry/suggestion-type-registry.js
 * @property {Object} payload            - shape depends on suggestionType
 * @property {string} sourceDomain       - one of SUGGESTION_SOURCE_DOMAIN
 * @property {string|null} sourceRecordId - the upstream record (KnowledgeItem id / RecognitionRecord id / LearningEvent id / Entity id) this cites, if any
 * @property {number} confidence         - 0–1
 * @property {import('../../knowledge/contracts/evidence-contract.js').Evidence[]} evidence - NEVER empty, see header
 * @property {string} status             - one of SUGGESTION_STATUS
 * @property {string} computedAt         - ISO 8601
 */

let _counter = 0;

/** @param {{workspaceId: string, blockId?: string|null, suggestionType: string, payload: Object,
 *   sourceDomain: string, sourceRecordId?: string|null, confidence: number, evidence: Array}} seed
 *  @returns {LiveSuggestion} */
export function makeLiveSuggestion({
  workspaceId, blockId = null, suggestionType, payload, sourceDomain,
  sourceRecordId = null, confidence, evidence,
}) {
  if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('makeLiveSuggestion: workspaceId is required.');
  if (typeof suggestionType !== 'string' || !suggestionType) throw new Error('makeLiveSuggestion: suggestionType is required.');
  if (!Object.values(SUGGESTION_SOURCE_DOMAIN).includes(sourceDomain)) throw new Error(`makeLiveSuggestion: unknown sourceDomain "${sourceDomain}".`);
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) throw new Error('makeLiveSuggestion: confidence must be 0-1.');
  if (!isEvidenceList(evidence) || evidence.length === 0) throw new Error('makeLiveSuggestion: evidence must be a non-empty Evidence[] — cite-or-abstain.');
  _counter += 1;
  return Object.freeze({
    suggestionId: `live-suggestion:${suggestionType}:${Date.now()}:${_counter}`,
    workspaceId, blockId, suggestionType, payload, sourceDomain, sourceRecordId,
    confidence, evidence: Object.freeze([...evidence]), status: SUGGESTION_STATUS.PENDING,
    computedAt: new Date().toISOString(),
  });
}

/** @param {*} s @returns {boolean} */
export function isLiveSuggestion(s) {
  return !!s && typeof s === 'object'
    && typeof s.suggestionId === 'string' && s.suggestionId.length > 0
    && typeof s.workspaceId === 'string' && s.workspaceId.length > 0
    && (s.blockId === null || typeof s.blockId === 'string')
    && typeof s.suggestionType === 'string' && s.suggestionType.length > 0
    && !!s.payload && typeof s.payload === 'object'
    && Object.values(SUGGESTION_SOURCE_DOMAIN).includes(s.sourceDomain)
    && (s.sourceRecordId === null || typeof s.sourceRecordId === 'string')
    && typeof s.confidence === 'number' && s.confidence >= 0 && s.confidence <= 1
    && isEvidenceList(s.evidence) && s.evidence.length > 0
    && Object.values(SUGGESTION_STATUS).includes(s.status)
    && typeof s.computedAt === 'string' && s.computedAt.length > 0;
}
