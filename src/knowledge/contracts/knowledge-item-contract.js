/* ============================================================
   KNOWLEDGE-ITEM-CONTRACT.JS — Knowledge Platform (V2, Phase 3)

   PURPOSE: fix the one shape every unit of Knowledge takes, regardless of
   domain or source (Decision 1). This is the platform's single "row shape" —
   analogous to PredictionModel in js/engines/prediction-engine.js, or a
   ReportModel in js/exports/analytics/model/report-types.js.

   RESPONSIBILITY: define the KnowledgeItem typedef, its identity/version
   contract, and a structural validity check. `domainType` and `kind` are
   validated against the registries (registry/domain-type-registry.js,
   registry/kind-registry.js) — never against a hardcoded switch.

   DEPENDENCIES: knowledge/registry/domain-type-registry.js,
   knowledge/registry/kind-registry.js, knowledge/contracts/lifecycle-contract.js.

   NON-GOALS: this module does not create, persist, or version an item — see
   knowledge/repository/knowledge-repository.js (still empty, Phase 3). It
   does not decide confidence or corroboration — see
   knowledge/contracts/explainability-contract.js and
   knowledge/contracts/source-weight-contract.js.

   FUTURE EVOLUTION: Phase 4+ connectors construct real KnowledgeItems
   against this exact shape; this contract should not need to change to
   accommodate a new domainType or kind — only the registries do.
   ============================================================ */

'use strict';

import { hasDomainType } from '../registry/domain-type-registry.js';
import { hasKind } from '../registry/kind-registry.js';
import { LIFECYCLE_STATE } from './lifecycle-contract.js';

export const KNOWLEDGE_ITEM_SCHEMA = 'knowledge-item@1';

/**
 * @typedef {Object} KnowledgeItem
 * @property {string} id                    - stable identity across versions (see identity-contract.js)
 * @property {number} version               - monotonically increasing per id; a transition is a NEW version, never an overwrite
 * @property {string} domainType            - registry-backed, e.g. 'nor' | 'engineering' | 'petty_cash' | ...
 * @property {string} sourceType            - which connector produced it (see contracts/connector-contract.js)
 * @property {string} kind                  - registry-backed, e.g. 'vocabulary' | 'structure' | 'rule' | ...
 * @property {*} payload                    - the learned content; shape depends on `kind` (opaque to the core)
 * @property {number} confidence            - 0–1
 * @property {string} lifecycleState        - one of LIFECYCLE_STATE (lifecycle-contract.js)
 * @property {import('./explainability-contract.js').Provenance} provenance
 * @property {string|null} approvedBy
 * @property {string|null} approvedAt       - ISO 8601, or null before Approved
 * @property {string|null} preferenceRationale - human-written at approval time, never auto-generated
 * @property {string} createdAt             - ISO 8601
 * @property {string} updatedAt             - ISO 8601
 */

/** The contract, as data, so future connectors and tests share one source of truth. */
export const KNOWLEDGE_ITEM_CONTRACT = Object.freeze({
  schema: KNOWLEDGE_ITEM_SCHEMA,
  fields: Object.freeze([
    'id', 'version', 'domainType', 'sourceType', 'kind', 'payload', 'confidence',
    'lifecycleState', 'provenance', 'approvedBy', 'approvedAt', 'preferenceRationale',
    'createdAt', 'updatedAt',
  ]),
});

/**
 * Structural validity check — NOT a persistence guard, NOT a lifecycle
 * check. Confirms an object has every required field of the right rough
 * shape, and that domainType/kind are registered values.
 * @param {*} item
 * @returns {boolean}
 */
export function isKnowledgeItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.id !== 'string' || !item.id) return false;
  if (typeof item.version !== 'number' || item.version < 1) return false;
  if (typeof item.domainType !== 'string' || !hasDomainType(item.domainType)) return false;
  if (typeof item.sourceType !== 'string' || !item.sourceType) return false;
  if (typeof item.kind !== 'string' || !hasKind(item.kind)) return false;
  if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) return false;
  if (typeof item.lifecycleState !== 'string' || !Object.values(LIFECYCLE_STATE).includes(item.lifecycleState)) return false;
  return true;
}
