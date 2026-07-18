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

   PHASE 9, SPRINT 9.5 (REASONING ACTIVATION) — NOR TYPE SCOPING. See
   docs/SPRINT_9_5_REASONING_ACTIVATION.md. A SEPARATE, pre-existing
   convention from `appliesWhen` — `payload.norType`, the same one
   knowledge-gap-engine.js and nor-composer.js already scope by — was
   flagged as a known gap in `CORE_NOR_KNOWLEDGE_PACK.md` §8's own nuance:
   `reason()`'s hypothetical citations ignored it entirely, so a rule
   tagged `norType: 'Pengadaan'` was (wrongly) cited as applicable to a
   Perjalanan Dinas Problem, confirmed live once Sprint 9.3 gave both
   types real, tagged rules to cross-contaminate with. This file now checks
   BOTH conventions — `appliesWhen` (unchanged) AND `norType` (new): a rule
   whose own `payload.norType` is present must match `problem.facts.type`
   to apply; absent means generic, applies regardless, byte-identical to
   this file's behavior before this rule existed for every rule that still
   carries no `norType` (i.e. every rule this file scoped before Sprint
   9.3).

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

/** Same "absent means generic" reading knowledge-gap-engine.js's own
 *  `matchesNorType` already established — see header. */
function matchesNorType(rule, problem) {
  const ruleNorType = rule.payload && typeof rule.payload === 'object' ? rule.payload.norType : null;
  if (!ruleNorType) return true;
  return !!problem.facts && problem.facts.type === ruleNorType;
}

/**
 * @param {import('../knowledge/contracts/knowledge-item-contract.js').KnowledgeItem} rule
 * @param {import('./contracts/problem-contract.js').Problem} problem
 * @returns {import('./contracts/rule-application-contract.js').RuleApplication}
 */
export function isApplicable(rule, problem) {
  const appliesWhen = rule.payload && typeof rule.payload === 'object' ? rule.payload.appliesWhen : null;
  const weight = typeof rule.confidence === 'number' ? rule.confidence : 0;

  if (!matchesNorType(rule, problem)) {
    return makeRuleApplication({
      ruleId: rule.id, applies: false, weight,
      rationale: `Rule is tagged norType "${rule.payload.norType}", which does not match this Problem's own NOR Type ("${problem.facts && problem.facts.type}") — does not apply to this occasion.`,
    });
  }

  if (!appliesWhen || typeof appliesWhen !== 'object' || !Object.keys(appliesWhen).length) {
    return makeRuleApplication({
      ruleId: rule.id, applies: true, weight,
      rationale: `Domain-wide rule for "${rule.domainType}" — no appliesWhen condition specified, so it applies to every Problem already scoped to this domain${rule.payload && rule.payload.norType ? ` and NOR Type "${rule.payload.norType}"` : ''}.`,
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
