/* ============================================================
   PROBLEM-CONTRACT.JS — Organizational Reasoning Foundation (V2, Phase 4-7)

   PURPOSE: fix the shape of the ONE input the Reasoning Engine ever
   accepts — "here is a domainType and the facts already known about this
   occasion; tell me what applies." Mirrors conversation/contracts/
   intent-contract.js's discipline: a Problem is a plain data record a
   human can read top to bottom, never a free-text prompt handed to a
   model (there is no model — see js/v2/reasoning/README.md).

   RESPONSIBILITY: Problem typedef + constructor + structural check.

   DEPENDENCIES: none.

   NON-GOALS: does not decide what facts are relevant, does not look up
   anything — see reasoning-engine.js.
   ============================================================ */

'use strict';

export const PROBLEM_SCHEMA = 'reasoning-problem@1';

/**
 * @typedef {Object} Problem
 * @property {string} domainType    - registry-backed, e.g. 'nor' (knowledge/registry/domain-type-registry.js)
 * @property {string} description   - one human-readable sentence naming what is being reasoned about
 * @property {Object} facts         - whatever is already known about this occasion (plain key/value, never inferred here)
 * @property {string} createdAt     - ISO 8601
 */

export function makeProblem({ domainType, description, facts = {} }) {
  return Object.freeze({
    domainType, description, facts: Object.freeze({ ...facts }), createdAt: new Date().toISOString(),
  });
}

export function isProblem(p) {
  return !!p && typeof p === 'object'
    && typeof p.domainType === 'string' && p.domainType.length > 0
    && typeof p.description === 'string' && p.description.length > 0
    && !!p.facts && typeof p.facts === 'object';
}
