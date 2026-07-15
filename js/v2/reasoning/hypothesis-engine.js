/* ============================================================
   HYPOTHESIS-ENGINE.JS — Organizational Reasoning Foundation
   (V2, Phase 8-10, Part 2)

   PURPOSE: "generate hypothesis, update hypothesis after every answer" —
   PURE, deterministic, cite-or-abstain. A candidate cause is never
   invented; it is always a specific Approved KnowledgeItem's own recorded
   text (`organizational_reasoning`'s `claim`, or a `rule`/`statistic`'s
   `statement`/`label`), scored by plain keyword overlap against the
   Problem's own facts — never a model call, never a probability model
   beyond arithmetic.

   THE SCORING FORMULA, STATED ONCE. `likelihood` = (number of the
   Problem's own fact VALUES that appear, case-insensitively, as a
   substring of the candidate item's text) / (total number of the
   Problem's facts). A candidate with zero overlap is not returned at all
   — no evidence, no hypothesis (mirrors reasoning-engine.js's own
   NO_APPLICABLE_KNOWLEDGE refusal).

   RESPONSIBILITY: generateHypotheses(problem), updateHypotheses(hypotheses,
   resolvedFact).

   DEPENDENCIES: knowledge/services/knowledge-service.js, contracts/
   hypothesis-contract.js.
   ============================================================ */

'use strict';

import { listKnowledge, LIFECYCLE_STATE } from '../knowledge/services/knowledge-service.js';
import { HYPOTHESIS_STATUS, makeHypothesis } from './contracts/hypothesis-contract.js';

const CANDIDATE_KINDS = Object.freeze(['organizational_reasoning', 'rule', 'statistic']);
/** A hypothesis whose re-scored likelihood falls below this is honestly
 *  RULED_OUT — the evidence no longer supports it as the growing fact set
 *  narrows. A plain, documented threshold, never a model decision. */
const RULE_OUT_THRESHOLD = 0.15;
/** A hypothesis whose re-scored likelihood reaches this is CONFIRMED —
 *  every remaining known fact corroborates it. */
const CONFIRM_THRESHOLD = 0.8;

function textOf(item) {
  const p = item.payload || {};
  return String(p.claim || p.statement || p.label || '').toLowerCase();
}

function factValues(facts) {
  return Object.values(facts || {}).filter((v) => typeof v === 'string' && v.trim()).map((v) => v.toLowerCase());
}

/**
 * @param {import('./contracts/problem-contract.js').Problem} problem
 * @returns {import('./contracts/hypothesis-contract.js').Hypothesis[]}
 */
export function generateHypotheses(problem) {
  const values = factValues(problem.facts);
  if (!values.length) return [];

  const approved = listKnowledge({ domainType: problem.domainType, lifecycleState: LIFECYCLE_STATE.APPROVED });
  if (!approved.ok) return [];
  const candidates = approved.data.filter((item) => CANDIDATE_KINDS.includes(item.kind));

  const hypotheses = [];
  for (const item of candidates) {
    const text = textOf(item);
    if (!text) continue;
    const overlap = values.filter((v) => text.includes(v)).length;
    if (overlap === 0) continue;
    const evidenceRefs = [item.id, ...((item.payload && item.payload.evidenceRefs) || [])];
    hypotheses.push(makeHypothesis({
      id: `${problem.domainType}:hypothesis:${item.id}`,
      cause: item.payload.claim || item.payload.statement || item.payload.label,
      evidenceRefs,
      likelihood: Math.min(1, overlap / values.length),
      status: HYPOTHESIS_STATUS.CANDIDATE,
    }));
  }

  return hypotheses.sort((a, b) => b.likelihood - a.likelihood);
}

/**
 * Re-scores every still-CANDIDATE hypothesis against one newly-resolved
 * fact. A CONFIRMED or RULED_OUT hypothesis is terminal — never
 * reconsidered (mirrors the Knowledge lifecycle's own "Approved/Deprecated
 * are immutable, supersede instead" discipline).
 * @param {import('./contracts/hypothesis-contract.js').Hypothesis[]} hypotheses
 * @param {{field: string, value: *}} resolvedFact
 * @returns {import('./contracts/hypothesis-contract.js').Hypothesis[]}
 */
export function updateHypotheses(hypotheses, resolvedFact) {
  const value = typeof resolvedFact.value === 'string' ? resolvedFact.value.toLowerCase() : null;
  return hypotheses.map((h) => {
    if (h.status !== HYPOTHESIS_STATUS.CANDIDATE || !value) return h;
    const causeText = h.cause.toLowerCase();
    const corroborated = causeText.includes(value);
    const nextLikelihood = corroborated
      ? Math.min(1, h.likelihood + 0.15)
      : Math.max(0, h.likelihood - 0.1);
    let status = HYPOTHESIS_STATUS.CANDIDATE;
    if (nextLikelihood >= CONFIRM_THRESHOLD) status = HYPOTHESIS_STATUS.CONFIRMED;
    else if (nextLikelihood < RULE_OUT_THRESHOLD) status = HYPOTHESIS_STATUS.RULED_OUT;
    return makeHypothesis({
      id: h.id, cause: h.cause, evidenceRefs: h.evidenceRefs, likelihood: nextLikelihood, status,
    });
  }).sort((a, b) => b.likelihood - a.likelihood);
}
