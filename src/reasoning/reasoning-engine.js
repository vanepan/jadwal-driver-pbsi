/* ============================================================
   REASONING-ENGINE.JS — Organizational Reasoning Foundation (V2, Phase 4-7)

   PURPOSE: the ONE orchestrator of the Reasoning pipeline (this phase's own
   binding brief): Problem -> Knowledge Lookup -> Applicable Rules ->
   Reasoning -> Recommendation -> Evidence -> Confidence -> Explainability.
   Mirrors knowledge-service.js's own orchestration style: this file
   composes already-real capabilities, computes no new number any of them
   doesn't already carry.

   WHY A RECOMMENDATION IS NEVER A DECISION. Every Recommendation this
   engine produces is read-only advisory output — it is never written to
   the Knowledge Repository, never auto-promotes anything, and has no path
   to Approved. A human deciding to act on a Recommendation still goes
   through the SAME, unmodified review workflow
   (knowledge-service.js#promoteKnowledge) every other KnowledgeItem does.
   This is Architecture Assessment §7's constraint #2 ("Diagnosis is never
   a Decision"), enforced structurally: this file has no import of
   anything that writes to the repository.

   CITE-OR-ABSTAIN (constraint #1). Zero applicable Approved
   rule/policy/knowledge for a Problem's domainType is NOT padded with a
   plausible-sounding guess — `reason()` returns
   `{ok:false, error:{code:'NO_APPLICABLE_KNOWLEDGE', ...}}`, mirroring
   conversation/'s own "honest NO_KNOWLEDGE refusal" precedent
   (conversation-ownership-check.mjs's own worked example).

   DETERMINISTIC UNTIL A REAL AI ADAPTER (constraint #3). No import of
   js/v2/ai-foundation/ anywhere in this file or its dependents. Every
   number here is plain arithmetic over already-real fields (a rule's own
   `confidence`, a conflict count) — never a model call.

   RESPONSIBILITY: `reason(problem)`.

   DEPENDENCIES (read-only — reasoning/ may depend on knowledge/, never the
   reverse, mirroring conversation/'s own dependency direction exactly):
   knowledge/services/knowledge-service.js, knowledge/services/
   explainability-service.js, rule-applicability-engine.js,
   conflict-detection-engine.js, contracts/*.
   ============================================================ */

'use strict';

import { listKnowledge, LIFECYCLE_STATE } from '../knowledge/services/knowledge-service.js';
import { explain } from '../knowledge/services/explainability-service.js';
import { applicableRulesFor } from './rule-applicability-engine.js';
import { detectConflicts } from './conflict-detection-engine.js';
import { RECOMMENDATION_ERRORS, makeRecommendation } from './contracts/recommendation-contract.js';
import { isProblem } from './contracts/problem-contract.js';

const RULE_KINDS = Object.freeze(['rule', 'policy']);
/** Additional Approved kinds cited as supporting context when present —
 *  never required, never fabricated if absent. */
const SUPPORTING_KINDS = Object.freeze(['organizational_reasoning', 'statistic']);

/** Every conflicting pair detected halves the affected rules' contribution
 *  to overall confidence — a plain, documented penalty, not a model score.
 *  Never zero: a genuine conflict lowers confidence, it does not silently
 *  discard the recommendation (a human reviewing it must still see it). */
const CONFLICT_CONFIDENCE_PENALTY = 0.5;

function failure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message }) });
}
function success(data) {
  return Object.freeze({ ok: true, data, error: null });
}

function statementOf(rule) {
  if (rule.payload && typeof rule.payload.statement === 'string' && rule.payload.statement) return rule.payload.statement;
  return `Approved ${rule.kind} "${rule.id}" applies (no human-recorded statement text on this item).`;
}

/**
 * @param {import('./contracts/problem-contract.js').Problem} problem
 * @returns {{ok: boolean, data: import('./contracts/recommendation-contract.js').Recommendation|null, error: object|null}}
 */
export function reason(problem) {
  if (!isProblem(problem)) {
    return failure('INVALID_PROBLEM', 'reason: problem must satisfy the Problem contract (domainType, description, facts).');
  }

  const approved = listKnowledge({ domainType: problem.domainType, lifecycleState: LIFECYCLE_STATE.APPROVED });
  if (!approved.ok) return failure('LOOKUP_FAILED', approved.error ? approved.error.message : 'Knowledge lookup failed.');
  const allApproved = approved.data;

  const candidateRules = allApproved.filter((item) => RULE_KINDS.includes(item.kind));
  const applicable = applicableRulesFor(candidateRules, problem);

  if (!applicable.length) {
    return failure(
      RECOMMENDATION_ERRORS.NO_APPLICABLE_KNOWLEDGE,
      `No Approved rule or policy applies to domainType "${problem.domainType}" given the Problem's facts — refusing to recommend rather than invent one (cite-or-abstain).`,
    );
  }

  // Prioritize: highest carried-through weight (the rule's own recorded
  // confidence) first — never an invented priority scheme.
  const ordered = [...applicable].sort((a, b) => b.weight - a.weight);
  const applicableIds = ordered.map((a) => a.ruleId);
  const conflicts = detectConflicts(applicableIds);

  const byId = new Map(candidateRules.map((r) => [r.id, r]));
  const top = byId.get(ordered[0].ruleId);
  const claimParts = [statementOf(top)];
  const secondaryStatements = ordered.slice(1).map((a) => statementOf(byId.get(a.ruleId)));
  const claim = [claimParts[0], ...secondaryStatements].filter(Boolean).join(' ');

  const supportingContext = allApproved.filter((item) => SUPPORTING_KINDS.includes(item.kind));
  const citedKnowledgeIds = supportingContext.map((i) => i.id);

  const avgWeight = ordered.reduce((sum, a) => sum + a.weight, 0) / ordered.length;
  const conflictPenaltyApplied = conflicts.length > 0;
  const confidence = conflictPenaltyApplied ? Math.max(0, avgWeight * CONFLICT_CONFIDENCE_PENALTY) : avgWeight;
  const confidenceBasis = conflictPenaltyApplied
    ? `Average carried-through confidence of ${ordered.length} applicable rule(s) (${avgWeight.toFixed(2)}), halved because ${conflicts.length} conflicting rule pair(s) were detected — a conflict is never silently resolved.`
    : `Average carried-through confidence of ${ordered.length} applicable, non-conflicting rule(s).`;

  const explanation = [...applicableIds, ...citedKnowledgeIds]
    .map((id) => byId.get(id) || supportingContext.find((i) => i.id === id))
    .filter(Boolean)
    .map((item) => {
      const result = explain(item);
      return result.ok ? { itemId: item.id, kind: item.kind, ...result.data } : null;
    })
    .filter(Boolean);

  const recommendation = makeRecommendation({
    problem,
    claim,
    citedRuleIds: applicableIds,
    citedKnowledgeIds,
    conflicts,
    confidence,
    confidenceBasis,
    explanation,
  });

  return success(recommendation);
}
