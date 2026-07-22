/* ============================================================
   WORKSPACE-SUGGESTION-ENGINE.JS — Live Word Workspace (V2, Phase 12.8.3)

   PURPOSE: computeSuggestions(context, opts) — a PURE, STATELESS function
   turning one already-built WorkspaceContext (workspace-context-builder.js,
   Sprint 12.8.2) into LiveSuggestion[]. Mirrors
   learning/learning-recommendation-engine.js's own "pure, stateless,
   holds no repository, never writes, never auto-applies" discipline
   exactly — this is "Live Composition" from the Phase 12.8 architecture
   review, realized.

   CITE-OR-ABSTAIN, ENFORCED TWICE: live-suggestion-contract.js's
   makeLiveSuggestion() already throws on empty evidence — this engine
   additionally never CALLS it with empty evidence in the first place, so
   a suggestion source with nothing to cite (e.g. Recognition, which
   ships Phase 12.7 with zero real producers) simply contributes zero
   suggestions, never a placeholder or a guess.

   CONFIDENCE FLOOR: registry/suggestion-type-registry.js#confidenceFloorFor
   is the ONE tunable threshold per suggestionType — the mitigation the
   Phase 12.8 architecture review named for "false-positive suggestion
   noise," never a hardcoded constant in this file.

   FOUR RULES, EACH CITING ONLY REAL DATA ALREADY PRESENT ON THE CONTEXT
   (never a second fetch — this function takes a context, it does not
   build one):
     RECOGNITION  — RecognitionRecord{recordType: cluster|classification}
       with non-empty evidence becomes 'similar_document'/'repeated_pattern'.
     ORGANIZATIONAL MEMORY — commonTerminology entries with real
       supportCount become 'organizational_terminology'; frequently reused
       Knowledge (referencedByCount > 1, already Archive-derived) becomes
       'historical_decision'. Evidence.itemId here is a synthetic pointer
       (`organizational-memory:<domainType>:...`), not a literal
       KnowledgeItem id — this engine is a REAL PRODUCER of Evidence's
       long-reserved STATISTIC kind, the same role
       recognition-cluster-contract.js/recognition-relationship-
       contract.js's own header already named Recognition as the first
       real producer of (evidence-contract.js's header has flagged
       STATISTIC/RELATIONSHIP as "waiting for a real producer" since
       V2.0.12 — this is the second one, Organizational Memory).
     LEARNING     — LearningRecommendation (already cite-or-abstain by its
       OWN contract) becomes 'learning_recommendation'; its
       citedLearningEventIds become this suggestion's Evidence[].
     BODY         — a live Entity becomes 'related_entity' — ALWAYS framed
       as informational/descriptive payload (entityType + observedState),
       NEVER a directive ("suggest reassigning" etc.) — the same
       descriptive-only constraint body/README.md §1 places on
       reasoning/reasoning-engine.js applies here identically; this
       engine is not reasoning/, but the rule is the same for the same
       reason.

   RESPONSIBILITY: computeSuggestions(context, opts).

   DEPENDENCIES: contracts/live-suggestion-contract.js,
   registry/suggestion-type-registry.js.

   NON-GOALS: does not call workspace-context-builder.js itself (a caller
   supplies the context — see workspace-service.js#computeSuggestionsFor).
   Never mutates the context. Never persists a LiveSuggestion — see
   workspace-service.js for the ephemeral-until-decided lifecycle.
   ============================================================ */

'use strict';

import { makeLiveSuggestion, SUGGESTION_SOURCE_DOMAIN } from '../contracts/live-suggestion-contract.js';
import { confidenceFloorFor } from '../registry/suggestion-type-registry.js';

const MIN_TERMINOLOGY_SUPPORT = 2;

function fromRecognition(context, workspaceId, blockId) {
  const out = [];
  for (const record of context.recognition || []) {
    if (!record.evidence || record.evidence.length === 0) continue;
    const suggestionType = record.recordType === 'cluster' ? 'similar_document'
      : record.recordType === 'classification' ? 'repeated_pattern' : null;
    if (!suggestionType) continue;
    if (record.confidence < confidenceFloorFor(suggestionType)) continue;
    out.push(makeLiveSuggestion({
      workspaceId, blockId, suggestionType, payload: record.payload,
      sourceDomain: SUGGESTION_SOURCE_DOMAIN.RECOGNITION, sourceRecordId: record.id,
      confidence: record.confidence, evidence: record.evidence,
    }));
  }
  return out;
}

function fromOrganizationalMemory(context, workspaceId, blockId) {
  const out = [];
  const om = context.organizationalMemory;
  if (!om) return out;

  for (const term of om.commonTerminology || []) {
    if (!term.supportCount || term.supportCount < MIN_TERMINOLOGY_SUPPORT) continue;
    const confidence = typeof term.confidence === 'number' ? term.confidence : 0.5;
    if (confidence < confidenceFloorFor('organizational_terminology')) continue;
    out.push(makeLiveSuggestion({
      workspaceId, blockId, suggestionType: 'organizational_terminology',
      payload: { value: term.value, supportCount: term.supportCount },
      sourceDomain: SUGGESTION_SOURCE_DOMAIN.ORGANIZATIONAL_MEMORY, sourceRecordId: null,
      confidence,
      evidence: [{
        itemId: `organizational-memory:${context.domainType}:terminology:${term.value}`,
        kind: 'statistic', weight: confidence,
        rationale: `Istilah ini muncul pada ${term.supportCount} dokumen historis domain "${context.domainType}".`,
      }],
    }));
  }

  for (const item of om.frequentlyReusedKnowledge || []) {
    if (!item.referencedByCount || item.referencedByCount <= 1) continue;
    const confidence = Math.min(1, item.referencedByCount / 5);
    if (confidence < confidenceFloorFor('historical_decision')) continue;
    out.push(makeLiveSuggestion({
      workspaceId, blockId, suggestionType: 'historical_decision',
      payload: { knowledgeItemId: item.knowledgeItemId, referencedByCount: item.referencedByCount },
      sourceDomain: SUGGESTION_SOURCE_DOMAIN.ORGANIZATIONAL_MEMORY, sourceRecordId: item.knowledgeItemId,
      confidence,
      evidence: [{
        itemId: item.knowledgeItemId, kind: 'statistic', weight: confidence,
        rationale: `Dirujuk oleh ${item.referencedByCount} dokumen historis lain.`,
      }],
    }));
  }
  return out;
}

function fromLearning(context, workspaceId, blockId) {
  const out = [];
  for (const rec of context.learningRecommendations || []) {
    const confidence = rec.confidence.value;
    if (confidence < confidenceFloorFor('learning_recommendation')) continue;
    out.push(makeLiveSuggestion({
      workspaceId, blockId, suggestionType: 'learning_recommendation',
      payload: { recommendationType: rec.recommendationType, claim: rec.claim, scope: rec.scope },
      sourceDomain: SUGGESTION_SOURCE_DOMAIN.LEARNING, sourceRecordId: rec.id,
      confidence,
      evidence: rec.citedLearningEventIds.map((id) => ({
        itemId: id, kind: 'corroboration', weight: confidence, rationale: rec.rationale,
      })),
    }));
  }
  return out;
}

function fromBody(context, workspaceId, blockId) {
  const out = [];
  const entities = (context.body && context.body.entities) || [];
  for (const entity of entities) {
    if (entity.confidence < confidenceFloorFor('related_entity')) continue;
    out.push(makeLiveSuggestion({
      workspaceId, blockId, suggestionType: 'related_entity',
      // Informational/descriptive only — never a directive. See header.
      payload: { entityId: entity.id, entityType: entity.entityType, observedState: entity.observedState },
      sourceDomain: SUGGESTION_SOURCE_DOMAIN.BODY, sourceRecordId: entity.id,
      confidence: entity.confidence,
      evidence: [{
        itemId: entity.id, kind: 'source', weight: entity.confidence,
        rationale: `Entitas "${entity.entityType}" teramati dengan status "${entity.observedState}".`,
      }],
    }));
  }
  return out;
}

/**
 * @param {ReturnType<import('../context/workspace-context-builder.js').buildWorkspaceContext>} context
 * @param {{blockId?: string|null}} [opts]
 * @returns {import('../contracts/live-suggestion-contract.js').LiveSuggestion[]}
 */
export function computeSuggestions(context, { blockId = null } = {}) {
  if (!context || !context.workspaceId) return [];
  const { workspaceId } = context;
  return [
    ...fromRecognition(context, workspaceId, blockId),
    ...fromOrganizationalMemory(context, workspaceId, blockId),
    ...fromLearning(context, workspaceId, blockId),
    ...fromBody(context, workspaceId, blockId),
  ];
}
