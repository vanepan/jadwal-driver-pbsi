/* ============================================================
   RULE-APPLICATION-CONTRACT.JS — Organizational Reasoning Foundation
   (V2, Phase 4-7)

   PURPOSE: fix the shape of ONE candidate Approved `rule`/`policy`
   KnowledgeItem's applicability verdict against a Problem — the "Applicable
   Rules" node of the Reasoning pipeline (CLAUDE.md-authorized brief:
   Problem -> Knowledge Lookup -> Applicable Rules -> Reasoning ->
   Recommendation -> Evidence -> Confidence -> Explainability).

   RESPONSIBILITY: RuleApplication typedef + constructor + structural check.

   DEPENDENCIES: none.

   NON-GOALS: does not decide applicability itself — see
   rule-applicability-engine.js. This is vocabulary, not logic.
   ============================================================ */

'use strict';

export const RULE_APPLICATION_SCHEMA = 'reasoning-rule-application@1';

/**
 * @typedef {Object} RuleApplication
 * @property {string} ruleId       - the KnowledgeItem id considered
 * @property {boolean} applies     - whether this rule's `appliesWhen` (if any) matched the Problem's facts
 * @property {number} weight       - the rule item's own `confidence` field, carried through unchanged (never recomputed here)
 * @property {string} rationale    - human-readable — why this verdict was reached
 */

export function makeRuleApplication({ ruleId, applies, weight, rationale }) {
  return Object.freeze({ ruleId, applies: !!applies, weight, rationale });
}

export function isRuleApplication(r) {
  return !!r && typeof r === 'object'
    && typeof r.ruleId === 'string' && r.ruleId.length > 0
    && typeof r.applies === 'boolean'
    && typeof r.weight === 'number' && r.weight >= 0 && r.weight <= 1
    && typeof r.rationale === 'string' && r.rationale.length > 0;
}
