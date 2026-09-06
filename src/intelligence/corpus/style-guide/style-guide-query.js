/* ============================================================
   STYLE-GUIDE-QUERY.JS — PBSI NOR Style Guide (V2, Phase 5.x.5)

   PURPOSE: the pure, read-only retrieval + effective-rule resolution layer
   over a set of StyleRule records (§20, §21). Deterministic, scope-aware,
   provenance-preserving. NOT connected to the NOR generator (§26) — this
   is the interface a later phase will consume.

   THE TWO CRITICAL GUARANTEES:

     1. `getEffectiveStyleGuide` returns APPROVED authoritative rules ONLY.
        `proposed` / `rejected` / `deprecated` are NEVER in the default
        effective set (§20).

     2. `resolveEffectiveRule` returns `resolved` | `conflict` | `missing`.
        When two approved rules disagree it returns `conflict` with the
        competing rule ids + evidence — it NEVER picks one by frequency,
        confidence, recency or document-type spread (§21, §22). Fail
        closed: an ambiguous slot yields no rule.

   RESPONSIBILITY: queryStyleGuide(rules, filter), getEffectiveStyleGuide(
   rules, filter), resolveEffectiveRule(rules, target), findStyleGuideConflicts(
   rules), getSupersessionChain(rules, ruleId), plus the small named helpers
   (§20: by category, by document type, proposed queue, history).

   DEPENDENCIES: ./contracts/style-guide-contract.js,
   ../temporal/contracts/temporal-contract.js (CONVENTION_STATUS). PURE —
   no I/O, no mutation.
   ============================================================ */

'use strict';

import {
  STYLE_RULE_STATUS, STYLE_GUIDE_SCOPE, DOCUMENT_TYPE_SCOPE,
  isStyleRule, __style_guide_internals,
} from './contracts/style-guide-contract.js';

const { normValue } = __style_guide_internals;

function ruleList(rules) {
  return Array.isArray(rules) ? rules.filter((r) => r && typeof r === 'object' && r.ruleId) : [];
}
function inSet(v, spec) {
  if (spec == null) return true;
  const list = Array.isArray(spec) ? spec : [spec];
  if (list.includes('ANY')) return true;
  return list.includes(v);
}
function byRuleId(a, b) { return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0; }
function effectiveValue(r) { return r.normalizedValue == null ? normValue(r.value) : r.normalizedValue; }

/**
 * General query. NO status filter by default — this is the one place a
 * caller CAN ask for `proposed` (the review queue) or `deprecated` (history).
 *
 * @param {object[]} rules
 * @param {object} [filter]
 * @param {string|string[]} [filter.status]        STYLE_RULE_STATUS.*
 * @param {string|string[]} [filter.category]
 * @param {string|string[]} [filter.documentType]  a real type, 'cross_type', or 'ANY'
 * @param {string|string[]} [filter.scope]
 * @param {string} [filter.key]
 * @param {boolean} [filter.includeSuperseded]     default true; false drops rules with a supersededByRuleId
 * @returns {object[]}  a NEW sorted array; entries are the frozen originals (provenance intact)
 */
export function queryStyleGuide(rules, filter = {}) {
  const f = filter && typeof filter === 'object' ? filter : {};
  let out = ruleList(rules).filter((r) =>
    inSet(r.status, f.status)
    && inSet(r.category, f.category)
    && inSet(r.documentType, f.documentType)
    && inSet(r.scope, f.scope)
    && (f.key == null || r.key === f.key));
  if (f.includeSuperseded === false) out = out.filter((r) => !r.supersededByRuleId);
  return [...out].sort(byRuleId);
}

/**
 * The DEFAULT effective Style Guide — APPROVED authoritative rules only
 * (§20). Never includes proposed / rejected / deprecated.
 *
 * @param {object[]} rules
 * @param {object} [filter]  { category, documentType, scope, key }
 * @returns {object[]}
 */
export function getEffectiveStyleGuide(rules, filter = {}) {
  const f = filter && typeof filter === 'object' ? filter : {};
  return queryStyleGuide(rules, {
    status: STYLE_RULE_STATUS.APPROVED,
    category: f.category,
    documentType: f.documentType,
    scope: f.scope,
    key: f.key,
  });
}

/** The human review queue — every `proposed` rule (§20). */
export function getProposedStyleRules(rules, filter = {}) {
  return queryStyleGuide(rules, { ...filter, status: STYLE_RULE_STATUS.PROPOSED });
}

/** Approved rules for a document type — the real type PLUS `cross_type`
 *  (a cross-type rule applies unless a type-specific rule overrides it).
 *  Scope-aware: never leaks a MEMORANDUM-only rule into a NOR query. */
export function getEffectiveRulesForType(rules, documentType, filter = {}) {
  return getEffectiveStyleGuide(rules, {
    ...filter,
    documentType: [documentType, DOCUMENT_TYPE_SCOPE.CROSS_TYPE],
  });
}

/** Approved rules in a category. */
export function getEffectiveRulesByCategory(rules, category, filter = {}) {
  return getEffectiveStyleGuide(rules, { ...filter, category });
}

/**
 * Deterministic effective-rule resolution for an EXACT slot (§21).
 *
 * @param {object[]} rules
 * @param {object} target  { scope?, category, key, documentType }
 * @returns {{ outcome: 'resolved'|'conflict'|'missing', scope, category, key, documentType,
 *            rule: object|null, competingRuleIds: string[], competing: object[] }}
 */
export function resolveEffectiveRule(rules, target = {}) {
  const scope = target.scope || STYLE_GUIDE_SCOPE.ORGANIZATION;
  const category = target.category;
  const key = target.key;
  const documentType = target.documentType;

  const approved = ruleList(rules).filter((r) =>
    r.status === STYLE_RULE_STATUS.APPROVED
    && r.scope === scope
    && r.category === category
    && r.key === key
    && r.documentType === documentType);

  const base = { scope, category, key, documentType };

  if (approved.length === 0) {
    return Object.freeze({ ...base, outcome: 'missing', rule: null, competingRuleIds: [], competing: Object.freeze([]) });
  }

  const distinctValues = new Set(approved.map(effectiveValue));
  if (distinctValues.size === 1) {
    // one effective value — a linear supersession chain. Prefer the highest
    // `version` (the newest link that was never itself superseded).
    const active = approved.filter((r) => !r.supersededByRuleId);
    const pool = active.length ? active : approved;
    const rule = [...pool].sort((a, b) => (b.version - a.version) || byRuleId(a, b))[0];
    return Object.freeze({ ...base, outcome: 'resolved', rule, competingRuleIds: [], competing: Object.freeze([]) });
  }

  // §21, §22 — >= 2 DISTINCT approved values. DO NOT choose. Fail closed.
  const competing = [...approved].sort(byRuleId).map((r) => Object.freeze({
    ruleId: r.ruleId,
    value: r.value,
    normalizedValue: r.normalizedValue,
    version: r.version,
    approvedAt: r.approvedAt,
    approvedBy: r.approvedBy,
    rationale: r.rationale,
    evidence: r.evidence,
    temporalEvidence: r.temporalEvidence,
  }));
  return Object.freeze({
    ...base,
    outcome: 'conflict',
    rule: null,
    competingRuleIds: Object.freeze(competing.map((c) => c.ruleId)),
    competing: Object.freeze(competing),
  });
}

/**
 * Every slot with a conflict — competing APPROVED values (a hidden
 * majority-vote risk, §12/§21) OR competing PROPOSED values awaiting a
 * human decision (§12). Deterministic, sorted.
 *
 * @param {object[]} rules
 * @returns {Array<{ scope, category, key, documentType, status, competingRuleIds: string[], sides: object[] }>}
 */
export function findStyleGuideConflicts(rules) {
  const list = ruleList(rules);
  const out = [];
  for (const status of [STYLE_RULE_STATUS.APPROVED, STYLE_RULE_STATUS.PROPOSED]) {
    const groups = new Map();
    for (const r of list) {
      if (r.status !== status) continue;
      if (r.supersededByRuleId) continue; // a retired link is not a live conflict
      const gk = `${r.scope}|${r.category}|${r.key}|${r.documentType}`;
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk).push(r);
    }
    for (const [, group] of groups) {
      const distinct = new Set(group.map(effectiveValue));
      if (distinct.size < 2) continue;
      const sample = group[0];
      const sides = [...group].sort(byRuleId).map((r) => Object.freeze({
        ruleId: r.ruleId, value: r.value, normalizedValue: r.normalizedValue,
        version: r.version, status: r.status,
        evidence: r.evidence, temporalEvidence: r.temporalEvidence,
      }));
      out.push(Object.freeze({
        scope: sample.scope,
        category: sample.category,
        key: sample.key,
        documentType: sample.documentType,
        status,
        competingRuleIds: Object.freeze(sides.map((s) => s.ruleId)),
        sides: Object.freeze(sides),
      }));
    }
  }
  return out.sort((a, b) => {
    const ka = `${a.status}|${a.scope}|${a.category}|${a.key}|${a.documentType}`;
    const kb = `${b.status}|${b.scope}|${b.category}|${b.key}|${b.documentType}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/**
 * The full supersession history for a slot, oldest → newest, following
 * `supersedesRuleId` back and `supersededByRuleId` forward (§15). Every
 * version (approved or deprecated) remains queryable here.
 *
 * @param {object[]} rules
 * @param {string} ruleId  any rule id in the chain
 * @returns {object[]}  ordered by version then createdAt
 */
export function getSupersessionChain(rules, ruleId) {
  const byId = new Map(ruleList(rules).map((r) => [r.ruleId, r]));
  const start = byId.get(String(ruleId || ''));
  if (!start) return [];
  const seen = new Set();
  const chain = [];
  // walk back
  let cur = start;
  while (cur && !seen.has(cur.ruleId)) {
    seen.add(cur.ruleId);
    chain.push(cur);
    cur = cur.supersedesRuleId ? byId.get(cur.supersedesRuleId) : null;
  }
  // walk forward from start
  cur = start.supersededByRuleId ? byId.get(start.supersededByRuleId) : null;
  while (cur && !seen.has(cur.ruleId)) {
    seen.add(cur.ruleId);
    chain.push(cur);
    cur = cur.supersededByRuleId ? byId.get(cur.supersededByRuleId) : null;
  }
  return chain.sort((a, b) => (a.version - b.version) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : byRuleId(a, b)));
}

/** Whether a set of rules is internally consistent enough to serve as an
 *  effective guide (all well-formed StyleRules). */
export function isStyleGuideRuleSet(rules) {
  return Array.isArray(rules) && rules.every(isStyleRule);
}
