/* ============================================================
   WORKSPACE-EXPLAINABILITY-SERVICE.JS — Live Word Workspace (V2, Phase 12.8.6)

   PURPOSE: explainSuggestion(suggestion) — answers CLAUDE.md's five
   mandated explainability questions ("why it appeared. which evidence
   supports it. which historical documents contributed. which
   organizational knowledge supports it. which confidence produced it")
   for one LiveSuggestion. This is the platform's 7th disambiguated
   explain() surface — precedent-consistent, not a regression: this
   platform already carries 6 separate ones (js/prediction/explainability.js,
   js/services/dispatch-presentation.js, knowledge-explainability-engine.js,
   recognition-service.js#explainRecognition, learning-service.js#
   explainLearningEvent, nor-explainability-service.js) by deliberate,
   disclosed design (js/v2/README.md's "What this tree still does NOT
   do"). UNIFYING all 7 is explicitly OUT OF SCOPE for Phase 12.8 — see
   workspace/README.md.

   MERGE, NEVER REINVENT: exactly like
   document-intelligence/nor/nor-explainability-service.js already does
   for Reasoning + Composition, this file NEVER recomputes evidence or
   confidence itself — it only calls the underlying domain's OWN explain
   surface where one exists (recognition-service.js#explainRecognition
   for a RECOGNITION-sourced suggestion; learning-service.js#
   explainLearningEvent for a LEARNING-sourced one, keyed off the first
   cited LearningEvent id in the suggestion's own evidence) and merges the
   result alongside the suggestion's own fields. BODY and
   ORGANIZATIONAL_MEMORY have no dedicated explain() surface of their own
   in this platform today — for those, the suggestion's own `evidence`
   (already real, already cite-or-abstain, see live-suggestion-contract.js)
   IS the full explanation; this function says so honestly rather than
   fabricating a second layer.

   RESPONSIBILITY: explainSuggestion(suggestion).

   DEPENDENCIES: recognition/services/index.js (records.explainRecognition),
   learning/services/learning-service.js (explainLearningEvent),
   contracts/live-suggestion-contract.js (SUGGESTION_SOURCE_DOMAIN).

   NON-GOALS: does not explain a Live Block or a whole Workspace — scoped
   to one suggestion, the same "small, disambiguated, single-purpose"
   shape every sibling explain() surface in this platform takes.
   ============================================================ */

'use strict';

import { isLiveSuggestion, SUGGESTION_SOURCE_DOMAIN } from '../contracts/live-suggestion-contract.js';
import { records as recognitionRecords } from '../../../js/v2/recognition/services/index.js';
import { explainLearningEvent } from '../../learning/services/learning-service.js';

export const SUGGESTION_TYPE_LABELS = Object.freeze({
  similar_document: 'Dokumen serupa ditemukan',
  repeated_pattern: 'Pola berulang terdeteksi',
  organizational_terminology: 'Istilah organisasi yang umum digunakan',
  historical_decision: 'Pernah digunakan pada keputusan historis',
  learning_recommendation: 'Direkomendasikan dari pembelajaran organisasi',
  related_entity: 'Entitas operasional terkait',
  approval_pattern: 'Pola persetujuan organisasi',
  frequently_corrected: 'Sering dikoreksi sebelumnya — periksa kembali',
  reasoning_recommendation: 'Rekomendasi penalaran organisasi',
  knowledge_gap: 'Informasi organisasi yang belum lengkap',
});

function failure(code, message) { return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) }); }

function mergeSourceExplanation(suggestion) {
  try {
    if (suggestion.sourceDomain === SUGGESTION_SOURCE_DOMAIN.RECOGNITION && suggestion.sourceRecordId) {
      const result = recognitionRecords.explainRecognition(suggestion.sourceRecordId);
      return result.ok ? result.data : null;
    }
    if (suggestion.sourceDomain === SUGGESTION_SOURCE_DOMAIN.LEARNING && suggestion.evidence.length > 0) {
      const result = explainLearningEvent(suggestion.evidence[0].itemId);
      return result.ok ? result.data : null;
    }
  } catch { /* underlying backend not configured — honest null, never a guess */ }
  return null;
}

/**
 * @param {import('../contracts/live-suggestion-contract.js').LiveSuggestion} suggestion
 * @returns {{ok: boolean, data: object|null, error: object|null}}
 */
export function explainSuggestion(suggestion) {
  if (!isLiveSuggestion(suggestion)) {
    return failure('INVALID_SUGGESTION', 'explainSuggestion: argument does not satisfy the LiveSuggestion contract.');
  }
  const sourceExplanation = mergeSourceExplanation(suggestion);
  return {
    ok: true,
    error: null,
    data: Object.freeze({
      // "Why it appeared."
      why: SUGGESTION_TYPE_LABELS[suggestion.suggestionType] || `Jenis saran: ${suggestion.suggestionType}`,
      // "Which evidence supports it." + "Which organizational knowledge supports it."
      evidence: suggestion.evidence,
      // "Which historical documents contributed." — merged from the
      // underlying domain's own explain surface where one exists (see
      // header); null is an honest "no second layer for this source
      // domain," never a fabricated one.
      sourceDomain: suggestion.sourceDomain,
      sourceExplanation,
      // "Which confidence produced it."
      confidence: suggestion.confidence,
      computedAt: suggestion.computedAt,
    }),
  };
}
