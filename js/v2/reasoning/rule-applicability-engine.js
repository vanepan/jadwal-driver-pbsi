/* ============================================================
   RULE-APPLICABILITY-ENGINE.JS — Organizational Reasoning Foundation
   (V2, Phase 4-7)

   PURPOSE: the "Applicable Rules" node of the Reasoning pipeline. PURE:
   given a Problem and one Approved `rule`/`policy` KnowledgeItem, decide
   whether it applies — never invents a condition the rule's own payload
   doesn't state.

   CONVENTION (payload stays opaque to the core, per Decision 1 — this is a
   convention layered ON TOP of `payload`, not a schema change, exactly the
   same pattern Knowledge-Asset-Specification.md §5 established for
   `evidenceRefs`): a rule/policy payload MAY carry `appliesWhen: {field:
   expectedValue, ...}`. Every named field must equal the Problem's own
   `facts[field]` for the rule to apply. A rule with NO `appliesWhen` is a
   domain-wide rule — it applies to every Problem already filtered to its
   `domainType` (the lookup step, not this file, does that filtering).

   RESPONSIBILITY: `isApplicable(rule, problem)`, `applicableRulesFor(rules, problem)`.

   DEPENDENCIES: contracts/rule-application-contract.js.

   NON-GOALS: does not look up rules (see reasoning-engine.js, which calls
   knowledge-service.js#listKnowledge — this file is a pure filter over
   whatever list it is handed). Does not detect conflicts (see
   conflict-detection-engine.js). Does not decide priority ordering (see
   reasoning-engine.js, which orders by `weight` — the rule's own carried-
   through confidence — descending).
   ============================================================ */

'use strict';

import { makeRuleApplication } from './contracts/rule-application-contract.js';

function matchesAppliesWhen(appliesWhen, facts) {
  return Object.entries(appliesWhen).every(([field, expected]) => facts && facts[field] === expected);
}

/**
 * @param {import('../knowledge/contracts/knowledge-item-contract.js').KnowledgeItem} rule
 * @param {import('./contracts/problem-contract.js').Problem} problem
 * @returns {import('./contracts/rule-application-contract.js').RuleApplication}
 */
export function isApplicable(rule, problem) {
  const appliesWhen = rule.payload && typeof rule.payload === 'object' ? rule.payload.appliesWhen : null;
  const weight = typeof rule.confidence === 'number' ? rule.confidence : 0;

  if (!appliesWhen || typeof appliesWhen !== 'object' || !Object.keys(appliesWhen).length) {
    return makeRuleApplication({
      ruleId: rule.id, applies: true, weight,
      rationale: `Domain-wide rule for "${rule.domainType}" — no appliesWhen condition specified, so it applies to every Problem already scoped to this domain.`,
    });
  }

  const matched = matchesAppliesWhen(appliesWhen, problem.facts);
  return makeRuleApplication({
    ruleId: rule.id, applies: matched, weight,
    rationale: matched
      ? `All ${Object.keys(appliesWhen).length} appliesWhen condition(s) matched the Problem's facts.`
      : `At least one appliesWhen condition did not match the Problem's facts — rule does not apply to this specific occasion.`,
  });
}

/**
 * @param {import('../knowledge/contracts/knowledge-item-contract.js').KnowledgeItem[]} rules
 * @param {import('./contracts/problem-contract.js').Problem} problem
 * @returns {import('./contracts/rule-application-contract.js').RuleApplication[]}
 */
export function applicableRulesFor(rules, problem) {
  return rules.map((rule) => isApplicable(rule, problem)).filter((a) => a.applies);
}
