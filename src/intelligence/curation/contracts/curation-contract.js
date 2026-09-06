/* ============================================================
   CURATION-CONTRACT.JS — Human Curation Workspace (V2, Phase 5.x.8)

   PURPOSE: fix the small vocabulary the Human Curation Workspace UI +
   controller share. This phase adds NO storage, NO new authority model and
   NO new resolution logic — the Style Guide (5.x.5) and Visual Template
   (5.x.6) contracts remain the ONE authority on lifecycle + authority
   state. This file only names the UI-side concepts:

     • CURATION_TAB           the five workspace surfaces (§3)
     • CURATION_DECISION      the four consequential human actions (§12–§15)
     • CURATION_PROPOSAL_KIND style_rule | visual_template
     • CURATION_DOMAIN_STATE  idle | ready | empty | unavailable (§21)
     • CURATION_AUTHORITY_LABEL   the explicit "Proposed / Authoritative /
                              Not authoritative" wording — NEVER a
                              confidence number (§5)

   It also carries the deterministic client-side error → sentence map for
   every Style Guide / Visual Template store error code the workspace can
   surface (§20 — "humans deserve slightly more useful error messages").

   DEPENDENCIES: none. PURE — no I/O, no DOM, no Firebase.
   ============================================================ */

'use strict';

export const CURATION_WORKSPACE_SCHEMA = 'pbsi-human-curation-workspace@1';

/** §3 — the five workspace surfaces. Sub-navigation WITHIN the V2
 *  Intelligence area, never a parallel app navigation system. */
export const CURATION_TAB = Object.freeze({
  OVERVIEW: 'overview',
  STYLE_RULES: 'style_rules',
  VISUAL_TEMPLATES: 'visual_templates',
  CONFLICTS: 'conflicts',
  HISTORY: 'history',
});
const TAB_VALUES = Object.freeze(Object.values(CURATION_TAB));
export function isCurationTab(t) { return TAB_VALUES.includes(t); }

/** The two proposal families the workspace curates. */
export const CURATION_PROPOSAL_KIND = Object.freeze({
  STYLE_RULE: 'style_rule',
  VISUAL_TEMPLATE: 'visual_template',
});
const KIND_VALUES = Object.freeze(Object.values(CURATION_PROPOSAL_KIND));
export function isCurationProposalKind(k) { return KIND_VALUES.includes(k); }

/** §12–§15 — the four consequential human actions. `supersede` is
 *  `approve` applied to a proposal that already carries a
 *  `supersedesRuleId` / `supersedesTemplateId` (built upstream); the
 *  workspace never fabricates a superseding proposal. */
export const CURATION_DECISION = Object.freeze({
  APPROVE: 'approve',
  REJECT: 'reject',
  DEPRECATE: 'deprecate',
  SUPERSEDE: 'supersede',
});
const DECISION_VALUES = Object.freeze(Object.values(CURATION_DECISION));
export function isCurationDecision(d) { return DECISION_VALUES.includes(d); }

/** Which store method a decision drives, and whether a written human
 *  reason is mandatory (it always is — §12, §13, §15). */
export const CURATION_DECISION_METHOD = Object.freeze({
  approve: 'approve',
  reject: 'reject',
  deprecate: 'deprecate',
  supersede: 'approve',
});

/** §21 — a domain is never silently "zero proposals". `unavailable` (the
 *  subsystem could not be queried) is distinct from `empty` (queried OK,
 *  nothing there) which is distinct from `ready`. */
export const CURATION_DOMAIN_STATE = Object.freeze({
  IDLE: 'idle',
  READY: 'ready',
  EMPTY: 'empty',
  UNAVAILABLE: 'unavailable',
});

/** §5 — authority is shown as an explicit LABEL, never as a confidence
 *  percentage. Evidence confidence is a SEPARATE, clearly-labelled number.
 *  Derived from the record `status` exactly as the two authority contracts
 *  derive `authorityState` — this file never invents its own mapping. */
export const CURATION_AUTHORITY_LABEL = Object.freeze({
  proposed: 'Proposed',
  approved: 'Authoritative',
  rejected: 'Not authoritative',
  deprecated: 'Not authoritative (deprecated)',
});
export function authorityLabelForStatus(status) {
  return CURATION_AUTHORITY_LABEL[status] || 'Unknown';
}

/** §9 — a temporal-context label for a `conventionEra`
 *  (TEMPORAL_CLASSIFICATION.*). Evidence, never authority. */
export function temporalContextLabel(conventionEra) {
  switch (conventionEra) {
    case 'historical': return 'Historical evidence';
    case 'current': return 'Current evidence';
    case 'transitional': return 'Transitional evidence';
    default: return 'Temporal context unknown';
  }
}

/** §20 — deterministic error code → one plain sentence. The raw store /
 *  transport message (which can carry a Firebase string) is NEVER shown;
 *  display is always by CODE. Covers STYLE_GUIDE_ERRORS ∪
 *  VISUAL_TEMPLATE_ERRORS ∪ the transport shapes. */
export const CURATION_ERROR_TEXT = Object.freeze({
  // stale / already-decided
  VERSION_CONFLICT: 'This proposal changed since you opened it. Reload before deciding.',
  ILLEGAL_TRANSITION: 'This proposal was already decided elsewhere. Reload to see its current state.',
  RULE_EXISTS: 'This slot value was already decided. A changed value must be re-proposed as a supersession.',
  TEMPLATE_EXISTS: 'This layout was already decided. A changed layout must be re-proposed as a supersession.',
  NOT_FOUND: 'This proposal no longer exists. It may have been superseded or removed.',
  // human gate
  RATIONALE_REQUIRED: 'A written rationale is required to approve an organizational rule.',
  REASON_REQUIRED: 'A written reason is required for this action.',
  ACTOR_REQUIRED: 'Your session needs to be refreshed. Sign in again.',
  CONFLICT_UNRESOLVED: 'Approving this would create a competing authoritative rule for the same slot. Supersede the current one, or explicitly choose to keep both.',
  // authorization
  FORBIDDEN: 'You are not authorized to curate organizational rules.',
  PERMISSION_DENIED: 'You are not authorized to curate organizational rules.',
  AUTH: 'Your session needs to be refreshed. Sign in again.',
  // availability
  NO_BACKEND_CONFIGURED: 'The curation service is not available right now. Try again shortly.',
  NO_BACKEND: 'The curation service is not available right now. Try again shortly.',
  NOT_IMPLEMENTED: 'The curation service is not available right now. Try again shortly.',
  WRITING_MEMORY_UNAVAILABLE: 'The evidence layer that backs this proposal is not available right now.',
  VISUAL_ANALYSIS_UNAVAILABLE: 'The visual-evidence layer that backs this proposal is not available right now.',
  NETWORK: 'The curation service is not reachable right now. Try again shortly.',
  TIMEOUT: 'The curation service did not respond in time. Try again shortly.',
  INVALID_RECORD: 'This action could not be processed. Reload and try again.',
  INTERNAL: 'This action could not be completed right now. Try again shortly.',
});
export const CURATION_ERROR_FALLBACK = 'This action could not be completed right now.';

export function curationErrorText(code) {
  return (code && CURATION_ERROR_TEXT[code]) || CURATION_ERROR_FALLBACK;
}

/** Codes that mean "your local copy is stale" — the workspace tells the
 *  reviewer to reload rather than offering a retry (§19, §20). */
export const CURATION_STALE_CODES = Object.freeze([
  'VERSION_CONFLICT', 'ILLEGAL_TRANSITION', 'RULE_EXISTS', 'TEMPLATE_EXISTS', 'NOT_FOUND',
]);
export function isStaleCode(code) { return CURATION_STALE_CODES.includes(code); }

/** Codes that mean "the subsystem is down" — the domain renders as
 *  `unavailable`, never as "zero proposals" (§21). */
export const CURATION_UNAVAILABLE_CODES = Object.freeze([
  'NO_BACKEND_CONFIGURED', 'NO_BACKEND', 'NOT_IMPLEMENTED', 'NETWORK', 'TIMEOUT',
]);
export function isUnavailableCode(code) { return CURATION_UNAVAILABLE_CODES.includes(code); }
