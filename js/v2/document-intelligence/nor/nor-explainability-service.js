/* ============================================================
   NOR-EXPLAINABILITY-SERVICE.JS — Explainability Workspace (Phase 10, Sprint 10.2)

   PURPOSE: answer, for one already-composed ComposerDocument, the five
   questions Phase 10's own spec names for the Explainability Workspace —
   Retrieved Knowledge, Applied Rules, Confidence, Missing Evidence, Unknown
   Facts — by MERGING three already-real data sources, never recomputing
   or inventing any of them:

     1. The explainability bundle problem-solving-service.js#
        composeApprovedNor attaches to the document at compose time
        (composer-store.js#attachExplainability/getExplainability) —
        unresolvedFields, citedKnowledgeIds, the per-citation `explanation`
        nor-composer.js already builds, renderingRulesConsidered, and
        reasoningConsidered (the Recommendation Sprint 9.5 wired live).
     2. Per-cited-KnowledgeItem provenance, via the SAME
        knowledge/services/explainability-service.js#explain(item)
        nor-composer.js and knowledge-center.js already call — not a
        second explainability engine.
     3. Human-readable rule labels for reasoningConsidered.citedRuleIds,
        resolved the same way nor-composer.js already resolves any
        KnowledgeItem id (knowledge-service.js#getKnowledge).

   WHY THIS FILE, NOT knowledge/services/: this needs composer-store.js
   (document-intelligence/), and js/v2/README.md's dependency graph is
   explicit that knowledge/ may NEVER depend on document-intelligence/
   (verified by composer-foundation-check.mjs's own "Dormancy" walk of the
   whole knowledge/ tree). document-intelligence/ MAY depend on knowledge/
   (nor-composer.js already does), so this file lives beside nor-composer.js,
   not under knowledge/services/.

   WHY "Conversation history" IS NOT HERE: document-intelligence/ may
   never depend on conversation/ either (same dependency graph). This file
   passes `conversationId` through as a bare id string — the same
   "cross-domain reference is a bare id, the UI resolves it" idiom
   knowledge-center.js already uses for importSessionId. review-workspace.js
   (ui/, which MAY depend on conversation/) resolves it directly.

   RESPONSIBILITY: explainDocument(documentId).

   DEPENDENCIES: composer/composer-store.js, knowledge/services/
   knowledge-service.js, knowledge/services/explainability-service.js.

   NON-GOALS: never recomputes a Recommendation, never re-derives
   citations — a document composed before this sprint (or outside
   composeApprovedNor entirely) honestly has no explainability attached,
   reported as NO_EXPLAINABILITY, never backfilled with a guess.
   ============================================================ */

'use strict';

import { getExplainability } from '../composer/composer-store.js';
import { getKnowledge } from '../../knowledge/services/knowledge-service.js';
import { explain } from '../../knowledge/services/explainability-service.js';

export const NOR_EXPLAINABILITY_ERRORS = Object.freeze({ NO_EXPLAINABILITY: 'NO_EXPLAINABILITY' });

function explainRetrievedKnowledgeItem(id) {
  const itemResult = getKnowledge(id);
  if (!itemResult.ok) {
    return Object.freeze({ id, available: false, kind: null, whereLearned: null, corroborationCount: null, approvedBy: null, whyPreferred: null });
  }
  const explained = explain(itemResult.data);
  return Object.freeze({
    id,
    available: true,
    kind: itemResult.data.kind,
    whereLearned: explained.ok ? explained.data.whereLearned : null,
    corroborationCount: explained.ok ? explained.data.corroborationCount : null,
    approvedBy: explained.ok ? explained.data.approvedBy : null,
    whyPreferred: explained.ok ? explained.data.whyPreferred : null,
  });
}

function labelRuleId(id) {
  const itemResult = getKnowledge(id);
  const label = (itemResult.ok && itemResult.data.payload && itemResult.data.payload.rule) || id;
  return Object.freeze({ id, label });
}

/**
 * @param {string} documentId
 * @returns {{ok: boolean, data: object|null, error: object|null}}
 */
export function explainDocument(documentId) {
  const bundle = getExplainability(documentId);
  if (!bundle) {
    return Object.freeze({
      ok: false,
      data: null,
      error: Object.freeze({
        code: NOR_EXPLAINABILITY_ERRORS.NO_EXPLAINABILITY,
        message: `No explainability data attached to ComposerDocument "${documentId}" — it may predate Sprint 10.2, or was created outside composeApprovedNor().`,
      }),
    });
  }

  const reasoning = bundle.reasoningConsidered;
  const reasoningOk = !!(reasoning && reasoning.ok);

  return Object.freeze({
    ok: true,
    error: null,
    data: Object.freeze({
      conversationId: bundle.conversationId,
      retrievedKnowledge: Object.freeze(bundle.citedKnowledgeIds.map(explainRetrievedKnowledgeItem)),
      citationStatements: bundle.explanation,
      appliedRules: Object.freeze(reasoningOk ? reasoning.citedRuleIds.map(labelRuleId) : []),
      confidence: reasoningOk ? reasoning.confidence : null,
      confidenceBasis: reasoningOk ? reasoning.confidenceBasis : null,
      missingEvidence: reasoningOk ? reasoning.conflicts : [],
      unknownFacts: bundle.unresolvedFields,
      reasoningOk: reasoning ? reasoning.ok : null,
      reasoningClaim: reasoningOk ? reasoning.claim : null,
      reasoningErrorCode: reasoning && !reasoning.ok ? reasoning.errorCode : null,
    }),
  });
}
