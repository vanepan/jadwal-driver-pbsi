/* ============================================================
   PROFILE-OVERRIDE-CONTRACT.JS — Organizational Profiles, Editable Layer (V2.1)

   PURPOSE: fix the shape of a Profile Override — a real, persisted, human-
   authored row that either overlays one of the ten existing COMPUTED
   Organizational Knowledge Profile types (profiles/profile-engine.js,
   contracts/profile-contract.js#PROFILE_TYPE — unchanged, still ephemeral,
   still never written to) or DEFINEs one of four genuinely new standalone
   concepts the roadmap names: Business Rules, Document Templates, Section
   Requirements, Priority Rules.

   "Organizational Profiles are updated only after human approval" (the
   product requirement) is satisfied structurally: this contract's
   lifecycleState field is the SAME LIFECYCLE_STATE/canTransition/
   isHumanGated from knowledge/contracts/lifecycle-contract.js, reused
   completely unchanged — Draft -> Candidate -> Pending Review -> Approved
   already means exactly what it needs to mean here (no path into Approved
   without an explicit human ReviewDecision). No sibling graph was needed
   for this entity, unlike Import Session (a genuinely different question —
   see ../../datasets/import-session/contracts/import-session-contract.js's
   header for why THAT one needed its own graph).

   RESPONSIBILITY: define PROFILE_OVERRIDE_TYPE, OVERRIDE_ACTION, the
   ProfileOverrideEntry shape, per-type payload shapes, and a structural
   validator.

   DEPENDENCIES: knowledge/contracts/profile-contract.js (PROFILE_TYPE,
   spread — not redefined), knowledge/contracts/lifecycle-contract.js
   (LIFECYCLE_STATE, reused).

   NON-GOALS: does not compute anything (see ../profile-override-engine.js
   / ../profile-override-merge-engine.js). Does not decide which
   PROFILE_TYPE a recommendation came from (see contracts/
   pattern-recommendation-contract.js, a separate read-only concept).
   ============================================================ */

'use strict';

import { PROFILE_TYPE } from '../../../contracts/profile-contract.js';
import { LIFECYCLE_STATE } from '../../../contracts/lifecycle-contract.js';

export const PROFILE_OVERRIDE_SCHEMA = 'profile-override@1';

/** The ten existing computed profile types (overlay-only — PIN/SUPPRESS/
 *  RENAME an entry the engine already computed) plus four genuinely new
 *  standalone types (DEFINE-only — no computed baseline exists). */
export const PROFILE_OVERRIDE_TYPE = Object.freeze({
  ...PROFILE_TYPE,
  BUSINESS_RULE: 'business_rule',
  DOCUMENT_TEMPLATE: 'document_template',
  SECTION_REQUIREMENT: 'section_requirement',
  PRIORITY_RULE: 'priority_rule',
});

/** The four standalone types with no computed baseline to overlay. */
export const STANDALONE_OVERRIDE_TYPES = Object.freeze([
  PROFILE_OVERRIDE_TYPE.BUSINESS_RULE,
  PROFILE_OVERRIDE_TYPE.DOCUMENT_TEMPLATE,
  PROFILE_OVERRIDE_TYPE.SECTION_REQUIREMENT,
  PROFILE_OVERRIDE_TYPE.PRIORITY_RULE,
]);

export function isOverlayType(overrideType) {
  return Object.values(PROFILE_TYPE).includes(overrideType);
}

export function isStandaloneType(overrideType) {
  return STANDALONE_OVERRIDE_TYPES.includes(overrideType);
}

/** PIN/SUPPRESS/RENAME apply only to the ten overlay types (they modify a
 *  computed ProfileEntry at render time); DEFINE is the action for the
 *  four standalone types (there is nothing to overlay). */
export const OVERRIDE_ACTION = Object.freeze({
  PIN: 'pin',
  SUPPRESS: 'suppress',
  RENAME: 'rename',
  DEFINE: 'define',
});

/** Minimal, honest, human-authored payload shapes — no AI-generated
 *  content, no inference. */
export const OVERRIDE_PAYLOAD_SHAPE = Object.freeze({
  [PROFILE_OVERRIDE_TYPE.BUSINESS_RULE]: Object.freeze(['condition', 'action', 'rationale', 'active']),
  [PROFILE_OVERRIDE_TYPE.DOCUMENT_TEMPLATE]: Object.freeze(['documentCategory', 'sectionOrder', 'notes']),
  [PROFILE_OVERRIDE_TYPE.SECTION_REQUIREMENT]: Object.freeze(['documentCategory', 'sectionName', 'required', 'notes']),
  [PROFILE_OVERRIDE_TYPE.PRIORITY_RULE]: Object.freeze(['priorityField', 'order', 'rationale']),
});

/**
 * @typedef {Object} ProfileOverrideEntry
 * @property {string} id             - deterministic, `${domainType}:${overrideType}:${key}`
 * @property {number} version        - append-only, same invariants as KnowledgeItem
 * @property {string} domainType     - registry-backed domainType
 * @property {string} overrideType   - one of PROFILE_OVERRIDE_TYPE
 * @property {string} key            - the natural key: for overlay types, the ProfileEntry.value being overridden; for standalone types, a human-chosen identifier
 * @property {string} action         - one of OVERRIDE_ACTION
 * @property {Object} payload        - shape depends on overrideType; for overlay types with action RENAME, `{renameTo: string}`; PIN/SUPPRESS carry `{rationale: string}`
 * @property {string} lifecycleState - one of LIFECYCLE_STATE (reused unchanged)
 * @property {string} authoredBy
 * @property {string} authoredAt
 * @property {string|null} approvedBy
 * @property {string|null} approvedAt
 * @property {string|null} preferenceRationale
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export function makeProfileOverrideEntry({ id, domainType, overrideType, key, action, payload, authoredBy }) {
  const now = new Date().toISOString();
  return Object.freeze({
    id, version: 1, domainType, overrideType, key, action, payload: Object.freeze({ ...payload }),
    lifecycleState: LIFECYCLE_STATE.DRAFT,
    authoredBy, authoredAt: now,
    approvedBy: null, approvedAt: null, preferenceRationale: null,
    createdAt: now, updatedAt: now,
  });
}

export function isProfileOverrideEntry(e) {
  return !!e && typeof e === 'object'
    && typeof e.id === 'string' && e.id.length > 0
    && typeof e.version === 'number' && e.version >= 1
    && typeof e.domainType === 'string' && e.domainType.length > 0
    && Object.values(PROFILE_OVERRIDE_TYPE).includes(e.overrideType)
    && typeof e.key === 'string' && e.key.length > 0
    && Object.values(OVERRIDE_ACTION).includes(e.action)
    && !!e.payload && typeof e.payload === 'object'
    && Object.values(LIFECYCLE_STATE).includes(e.lifecycleState)
    && typeof e.authoredBy === 'string' && e.authoredBy.length > 0;
}
