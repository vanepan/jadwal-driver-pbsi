/* ============================================================
   STYLE-GUIDE-CONTRACT.JS — PBSI NOR Style Guide (V2, Phase 5.x.5)

   PURPOSE: fix the shape of ONE authoritative organizational writing rule —
   LAYER 5, the FIRST authority layer in the chain:

     Historical Corpus → CorpusObservation → Temporal Interpretation →
     Organizational Writing Memory (EVIDENCE) →
     [THIS LAYER] PBSI NOR Style Guide (AUTHORITY) →
     (future) NOR generation / retrieval

   THE MANDATORY DISTINCTION (Phase 5.x.5 §2, §22):

       Corpus evidence is not policy.
       Writing Memory is not authority.
       Only explicit human approval creates Style Guide authority.

   A StyleRule is EITHER `proposed` (a candidate awaiting a human decision)
   or, once a human explicitly approves it with a written rationale,
   `approved` (an organizational rule). `rejected` / `deprecated` are the
   retained terminal states — nothing is ever deleted (§8, §15).

     • `authorityState` is DERIVED from `status`, never client-set (§4, §9).
       The future NOR generator reads THIS one field: only `authoritative`
       rules apply.
     • Frequency, confidence, documentEra, temporalStatus, Writing Memory
       `candidate` status, cross-type evidence and AI output can justify a
       PROPOSAL — they can NEVER cause automatic approval (§22).
     • Every rule retains traceable evidence: >= 1 sourceMemoryId,
       >= 1 sourceObservationId, >= 1 sourceDocumentId. An approved rule
       with no evidence is impossible — there is no manual-rule type this
       phase (§11).
     • Changing an approved rule creates a NEW superseding rule; the old
       one is deprecated (retained, queryable), never mutated in place
       (§8, §15).

   RESPONSIBILITY: STYLE_GUIDE_SCOPE, STYLE_RULE_STATUS (+ graph +
   human-gated set + `canStyleRuleTransition`), STYLE_AUTHORITY_STATE (+
   `authorityStateForStatus`), STYLE_RULE_CATEGORIES (= the Writing Memory
   language vocabulary, reused), DOCUMENT_TYPE_SCOPE (reused),
   STYLE_RULE_EVIDENCE_FIELDS, STYLE_RULE_TEMPORAL_FIELDS,
   STYLE_GUIDE_AUDIT_EVENTS, styleRuleIdFrom(), makeStyleRuleAuditEntry(),
   makeStyleRule / isStyleRule / isStyleRuleList.

   DEPENDENCIES: ../../contracts/corpus-observation-contract.js
   (OBSERVATION_CATEGORY — cross-reference only), ../../temporal/contracts/
   temporal-contract.js (CONVENTION_STATUS, TEMPORAL_CLASSIFICATION —
   reused), ../../writing-memory/contracts/writing-memory-contract.js
   (WRITING_MEMORY_CATEGORIES, DOCUMENT_TYPE_SCOPE, isWritingMemoryCategory
   — reused, NOT redefined). PURE — no I/O, no DOM, no Firebase, no secret.
   ============================================================ */

'use strict';

import { CONVENTION_STATUS, TEMPORAL_CLASSIFICATION } from '../../temporal/contracts/temporal-contract.js';
import {
  WRITING_MEMORY_CATEGORIES, DOCUMENT_TYPE_SCOPE, isWritingMemoryCategory,
} from '../../writing-memory/contracts/writing-memory-contract.js';

export const STYLE_GUIDE_SCHEMA = 'pbsi-nor-style-guide@1';
export const STYLE_RULE_SCHEMA = 'style-guide-rule@1';

/** §16 — Style Guide rules are ORGANIZATION-WIDE. This repository has no
 *  multi-tenant concept (one PBSI organization); the field is the seam,
 *  and `organization` is the only value this phase supports. A personal
 *  user's approval can NOT create a personal-only style rule — the scope
 *  is fixed by the server, never client-supplied (§9, §16). */
export const STYLE_GUIDE_SCOPE = Object.freeze({ ORGANIZATION: 'organization' });
const SCOPE_VALUES = Object.freeze(Object.values(STYLE_GUIDE_SCOPE));

/** §5 — REUSE the Writing Memory language-category vocabulary VERBATIM (the
 *  language subset of OBSERVATION_CATEGORY — `structure` / `layout` stay
 *  OUT; those belong to the future Visual Template System, §3). No
 *  competing taxonomy, no duplicate category names. */
export const STYLE_RULE_CATEGORIES = WRITING_MEMORY_CATEGORIES;
export function isStyleRuleCategory(c) {
  return isWritingMemoryCategory(c);
}

/** §6 — REUSE the Writing Memory document-type scope VERBATIM: the real
 *  corpus types plus `cross_type`. A rule observed in MEMORANDUM does NOT
 *  silently become a NOR rule; a LEGACY rule does NOT become current NOR
 *  authority; a `cross_type` rule keeps its per-type evidence. */
export { DOCUMENT_TYPE_SCOPE };
const DOC_TYPE_VALUES = Object.freeze(Object.values(DOCUMENT_TYPE_SCOPE));

/** §8 — the explicit state machine.
 *
 *    proposed ──▶ approved ──▶ deprecated
 *        │
 *        └──────▶ rejected
 *
 *  `rejected` and `deprecated` are TERMINAL and RETAINED (§8, §15) — a
 *  fresh proposal is the only way forward (fail closed — §14, §21). There
 *  is no `approved → approved` edge: a content change is a NEW superseding
 *  rule (§8, §15). */
export const STYLE_RULE_STATUS = Object.freeze({
  PROPOSED: 'proposed',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DEPRECATED: 'deprecated',
});

export const STYLE_RULE_STATUS_DEFS = Object.freeze([
  Object.freeze({ id: STYLE_RULE_STATUS.PROPOSED, label: 'Proposed (awaiting human decision)' }),
  Object.freeze({ id: STYLE_RULE_STATUS.APPROVED, label: 'Approved organizational rule' }),
  Object.freeze({ id: STYLE_RULE_STATUS.REJECTED, label: 'Rejected' }),
  Object.freeze({ id: STYLE_RULE_STATUS.DEPRECATED, label: 'Deprecated (was approved, no longer authoritative)' }),
]);

/** The ONE authority on legal state moves — mirrors
 *  src/knowledge/contracts/lifecycle-contract.js. */
export const STYLE_RULE_STATUS_GRAPH = Object.freeze({
  [STYLE_RULE_STATUS.PROPOSED]: Object.freeze([STYLE_RULE_STATUS.APPROVED, STYLE_RULE_STATUS.REJECTED]),
  [STYLE_RULE_STATUS.APPROVED]: Object.freeze([STYLE_RULE_STATUS.DEPRECATED]),
  [STYLE_RULE_STATUS.REJECTED]: Object.freeze([]),
  [STYLE_RULE_STATUS.DEPRECATED]: Object.freeze([]),
});

/** §9, §22 — states nothing may enter automatically. Every move into one of
 *  these requires an explicit authenticated human action (and, for
 *  `approved`, a non-empty human-written rationale — §10). */
export const STYLE_RULE_HUMAN_GATED_STATES = Object.freeze([
  STYLE_RULE_STATUS.APPROVED, STYLE_RULE_STATUS.REJECTED, STYLE_RULE_STATUS.DEPRECATED,
]);

export function canStyleRuleTransition(from, to) {
  const reachable = STYLE_RULE_STATUS_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}
export function isStyleRuleHumanGated(to) {
  return STYLE_RULE_HUMAN_GATED_STATES.includes(to);
}
export function isStyleRuleStatus(s) {
  return Object.values(STYLE_RULE_STATUS).includes(s);
}

/** §4 — DERIVED from `status`, NEVER stored from client input (§9). The
 *  future NOR generator checks exactly this: `authorityState ===
 *  'authoritative'`. */
export const STYLE_AUTHORITY_STATE = Object.freeze({
  PROPOSED: 'proposed',                    // status proposed — evidence under review, NOT authority
  AUTHORITATIVE: 'authoritative',          // status approved — an organizational rule
  NOT_AUTHORITATIVE: 'not_authoritative',  // status rejected | deprecated
});
export function authorityStateForStatus(status) {
  if (status === STYLE_RULE_STATUS.APPROVED) return STYLE_AUTHORITY_STATE.AUTHORITATIVE;
  if (status === STYLE_RULE_STATUS.PROPOSED) return STYLE_AUTHORITY_STATE.PROPOSED;
  return STYLE_AUTHORITY_STATE.NOT_AUTHORITATIVE;
}

/** §19 — the on-record append-only audit vocabulary. Event NAMES only;
 *  never a secret, a token, or corpus body text. */
export const STYLE_GUIDE_AUDIT_EVENTS = Object.freeze({
  PROPOSED: 'STYLE_RULE_PROPOSED',
  APPROVED: 'STYLE_RULE_APPROVED',
  REJECTED: 'STYLE_RULE_REJECTED',
  DEPRECATED: 'STYLE_RULE_DEPRECATED',
  SUPERSEDED: 'STYLE_RULE_SUPERSEDED',
});
const AUDIT_EVENT_VALUES = Object.freeze(Object.values(STYLE_GUIDE_AUDIT_EVENTS));

/** §11 — transparent provenance components carried onto the rule. This is
 *  a REFERENCE/summary, NOT a copy of the corpus. */
export const STYLE_RULE_EVIDENCE_FIELDS = Object.freeze([
  'occurrenceCount',
  'documentCount',
  'documentTypeDistribution', // { NOR: n, MEMORANDUM: n, ... } — from Writing Memory, NEVER collapsed
  'pageNumbers',              // where available; [] when the evidence layer has none (honest)
  'extractionMethods',        // where available
]);

/** §7 — temporal EVIDENCE carried onto the rule. It is EVIDENCE, never
 *  authority: `conventionEra === 'current'` does NOT mean approved;
 *  `historical` does NOT mean rejected (§7). */
export const STYLE_RULE_TEMPORAL_FIELDS = Object.freeze([
  'temporalStatus',           // CONVENTION_STATUS.*
  'conventionEra',            // TEMPORAL_CLASSIFICATION.*
  'oldestSourceDate',
  'latestSourceDate',
  'recentDocumentCount',
  'historicalDocumentCount',
  'conflictingDocumentCount',
  'approvedRulePresent',
  'approvedRuleMatches',
]);

export const STYLE_RULE_FIELDS = Object.freeze([
  'schema', 'styleGuideSchema', 'ruleId', 'scope', 'category', 'key', 'value', 'normalizedValue',
  'documentType', 'status', 'authorityState', 'rationale',
  'sourceMemoryIds', 'sourceObservationIds', 'sourceDocumentIds',
  'evidence', 'temporalEvidence', 'confidence',
  'version', 'supersedesRuleId', 'supersededByRuleId',
  'createdAt', 'createdBy', 'approvedAt', 'approvedBy',
  'rejectedAt', 'rejectedBy', 'deprecatedAt', 'deprecatedBy',
  'auditTrail',
]);

/* ── small pure helpers (same discipline as writing-memory-contract.js) ── */

function clamp01(v) { const n = Number(v); return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n; }
function intOrZero(v) { return Number.isInteger(v) && v >= 0 ? v : 0; }
function isoOrNull(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
function str(v) { return v == null ? '' : String(v); }
function trimOrNull(v) { const s = typeof v === 'string' ? v.trim() : ''; return s ? s : null; }

function slug(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
}
/** FNV-1a 32-bit hex — dependency-free, deterministic, browser + Node.
 *  Same fingerprint discipline as the Writing Memory layer. */
function fnv1a(input) {
  let h = 0x811c9dc5;
  const s = String(input == null ? '' : input);
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function normValue(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
}
/** distinct + sorted string list — deterministic, input-order independent. */
function strList(v) {
  return Object.freeze([...new Set((Array.isArray(v) ? v : []).map((x) => String(x)).filter(Boolean))].sort());
}
function intList(v) {
  return Object.freeze([...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1))].sort((a, b) => a - b));
}
function posIntMap(v) {
  const src = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const out = {};
  for (const [k, n] of Object.entries(src)) if (Number.isInteger(n) && n > 0) out[k] = n;
  return Object.freeze(out);
}

/**
 * Deterministic rule identity for a SLOT VALUE — the same (scope, category,
 * key, documentType, normalised value) always yields the same ruleId (§13).
 * Two competing values for the same slot get two DIFFERENT ids (both may be
 * `proposed`; the resolver reports the conflict — §12, §21). A superseding
 * value gets its own id and links back via `supersedesRuleId` (§15).
 */
export function styleRuleIdFrom(scope, category, key, documentType, value) {
  return `sgr_${slug(scope)}__${slug(category)}__${slug(key)}__${slug(documentType)}__${fnv1a(normValue(value))}`;
}

/**
 * @typedef {Object} StyleRuleAuditEntry
 * @property {string} event       - STYLE_GUIDE_AUDIT_EVENTS.*
 * @property {string} at          - ISO 8601
 * @property {string|null} actorId - server-derived human actor
 * @property {string|null} fromStatus
 * @property {string} toStatus
 * @property {number} version
 * @property {Object} detail      - metadata only (rationale / reason / supersedes ids) — NEVER a secret or corpus body
 */
export function makeStyleRuleAuditEntry(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return Object.freeze({
    event: AUDIT_EVENT_VALUES.includes(s.event) ? s.event : STYLE_GUIDE_AUDIT_EVENTS.PROPOSED,
    at: str(s.at) || new Date().toISOString(),
    actorId: s.actorId == null ? null : String(s.actorId),
    fromStatus: s.fromStatus == null ? null : String(s.fromStatus),
    toStatus: str(s.toStatus) || STYLE_RULE_STATUS.PROPOSED,
    version: Number.isInteger(s.version) && s.version >= 1 ? s.version : 1,
    detail: s.detail && typeof s.detail === 'object' && !Array.isArray(s.detail) ? Object.freeze({ ...s.detail }) : Object.freeze({}),
  });
}

/**
 * @typedef {Object} StyleRule
 * @property {string} schema                 - STYLE_RULE_SCHEMA
 * @property {string} styleGuideSchema       - STYLE_GUIDE_SCHEMA (the guide this rule belongs to)
 * @property {string} ruleId                 - deterministic — styleRuleIdFrom(...)
 * @property {string} scope                  - STYLE_GUIDE_SCOPE.* ('organization')
 * @property {string} category               - STYLE_RULE_CATEGORIES.* (= Writing Memory language vocab)
 * @property {string} key                    - the observation / memory `key` slug
 * @property {string} value                  - the VERBATIM wording (non-empty — §11)
 * @property {string|null} normalizedValue   - a SEPARATE analytical field
 * @property {string} documentType           - DOCUMENT_TYPE_SCOPE.* (a real type, or 'cross_type')
 * @property {string} status                 - STYLE_RULE_STATUS.*
 * @property {string} authorityState         - DERIVED from status (§4, §9)
 * @property {string|null} rationale         - human-written; REQUIRED (non-empty, non-whitespace) when status === 'approved' (§10)
 * @property {string[]} sourceMemoryIds      - >= 1 (§11) — the Writing Memory entries this rule came from
 * @property {string[]} sourceObservationIds - >= 1 (§11)
 * @property {string[]} sourceDocumentIds    - >= 1 (§11)
 * @property {Object} evidence               - STYLE_RULE_EVIDENCE_FIELDS bag (§11) — reference, not a corpus copy
 * @property {Object} temporalEvidence       - STYLE_RULE_TEMPORAL_FIELDS bag (§7) — evidence, not authority
 * @property {number} confidence             - 0..1 observation confidence carried through — NOT authority (§22)
 * @property {number} version                - supersession-chain position (1 = first rule for this slot)
 * @property {string|null} supersedesRuleId  - the prior rule this one replaces (§15)
 * @property {string|null} supersededByRuleId - the newer rule that replaced this one (set when it is deprecated — §15)
 * @property {string} createdAt
 * @property {string|null} createdBy         - server-derived proposer
 * @property {string|null} approvedAt        - server-derived
 * @property {string|null} approvedBy        - server-derived
 * @property {string|null} rejectedAt
 * @property {string|null} rejectedBy
 * @property {string|null} deprecatedAt
 * @property {string|null} deprecatedBy
 * @property {StyleRuleAuditEntry[]} auditTrail - append-only; first entry is STYLE_RULE_PROPOSED
 */
export function makeStyleRule(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};

  const scope = SCOPE_VALUES.includes(s.scope) ? s.scope : STYLE_GUIDE_SCOPE.ORGANIZATION;
  const category = String(s.category || '');
  const key = String(s.key || '');
  const value = s.value == null ? '' : String(s.value);
  const documentType = DOC_TYPE_VALUES.includes(s.documentType) ? s.documentType : DOCUMENT_TYPE_SCOPE.UNKNOWN;
  const status = isStyleRuleStatus(s.status) ? s.status : STYLE_RULE_STATUS.PROPOSED;
  // §4, §9 — authorityState is ALWAYS derived from status; any seed value is ignored.
  const authorityState = authorityStateForStatus(status);

  const ev = s.evidence && typeof s.evidence === 'object' ? s.evidence : {};
  const evidence = Object.freeze({
    occurrenceCount: intOrZero(ev.occurrenceCount),
    documentCount: intOrZero(ev.documentCount),
    documentTypeDistribution: posIntMap(ev.documentTypeDistribution),
    pageNumbers: intList(ev.pageNumbers),
    extractionMethods: strList(ev.extractionMethods),
  });

  const te = s.temporalEvidence && typeof s.temporalEvidence === 'object' ? s.temporalEvidence : {};
  const temporalEvidence = Object.freeze({
    temporalStatus: Object.values(CONVENTION_STATUS).includes(te.temporalStatus) ? te.temporalStatus : CONVENTION_STATUS.INSUFFICIENT_EVIDENCE,
    conventionEra: Object.values(TEMPORAL_CLASSIFICATION).includes(te.conventionEra) ? te.conventionEra : TEMPORAL_CLASSIFICATION.UNKNOWN,
    oldestSourceDate: isoOrNull(te.oldestSourceDate),
    latestSourceDate: isoOrNull(te.latestSourceDate),
    recentDocumentCount: intOrZero(te.recentDocumentCount),
    historicalDocumentCount: intOrZero(te.historicalDocumentCount),
    conflictingDocumentCount: intOrZero(te.conflictingDocumentCount),
    approvedRulePresent: te.approvedRulePresent === true,
    approvedRuleMatches: te.approvedRuleMatches === true,
  });

  const version = Number.isInteger(s.version) && s.version >= 1 ? s.version : 1;
  const created = str(s.createdAt) || new Date().toISOString();
  const ruleId = String(s.ruleId || styleRuleIdFrom(scope, category, key, documentType, value));

  // approval / decision metadata is meaningful ONLY in the matching status.
  // A `deprecated` rule was necessarily approved first (approved → deprecated
  // is the only inbound edge), so it RETAINS its approval provenance —
  // "was approved, no longer authoritative" (§8, §15). `proposed` / `rejected`
  // never carry approval metadata.
  const isApproved = status === STYLE_RULE_STATUS.APPROVED;
  const isRejected = status === STYLE_RULE_STATUS.REJECTED;
  const isDeprecated = status === STYLE_RULE_STATUS.DEPRECATED;
  const keepsApproval = isApproved || isDeprecated;

  const auditTrail = Object.freeze((Array.isArray(s.auditTrail) ? s.auditTrail : []).map(makeStyleRuleAuditEntry));

  return Object.freeze({
    schema: STYLE_RULE_SCHEMA,
    styleGuideSchema: STYLE_GUIDE_SCHEMA,
    ruleId,
    scope,
    category,
    key,
    value,
    normalizedValue: s.normalizedValue == null ? null : String(s.normalizedValue),
    documentType,
    status,
    authorityState,
    rationale: keepsApproval ? trimOrNull(s.rationale) : null,
    sourceMemoryIds: strList(s.sourceMemoryIds),
    sourceObservationIds: strList(s.sourceObservationIds),
    sourceDocumentIds: strList(s.sourceDocumentIds),
    evidence,
    temporalEvidence,
    confidence: clamp01(s.confidence),
    version,
    supersedesRuleId: s.supersedesRuleId == null ? null : String(s.supersedesRuleId),
    supersededByRuleId: s.supersededByRuleId == null ? null : String(s.supersededByRuleId),
    createdAt: created,
    createdBy: s.createdBy == null ? null : String(s.createdBy),
    approvedAt: keepsApproval ? (isoOrNull(s.approvedAt) ? s.approvedAt : str(s.approvedAt) || null) : null,
    approvedBy: keepsApproval && s.approvedBy ? String(s.approvedBy) : null,
    rejectedAt: isRejected ? (str(s.rejectedAt) || null) : null,
    rejectedBy: isRejected && s.rejectedBy ? String(s.rejectedBy) : null,
    deprecatedAt: isDeprecated ? (str(s.deprecatedAt) || null) : null,
    deprecatedBy: isDeprecated && s.deprecatedBy ? String(s.deprecatedBy) : null,
    auditTrail,
  });
}

export function isStyleRule(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== STYLE_RULE_SCHEMA) return false;
  if (r.styleGuideSchema !== STYLE_GUIDE_SCHEMA) return false;
  if (typeof r.ruleId !== 'string' || !r.ruleId) return false;
  if (!SCOPE_VALUES.includes(r.scope)) return false;
  if (!isStyleRuleCategory(r.category)) return false;
  if (typeof r.key !== 'string' || !r.key) return false;
  if (typeof r.value !== 'string' || !r.value) return false; // §11 — recoverable wording required
  if (r.normalizedValue !== null && typeof r.normalizedValue !== 'string') return false;
  if (!DOC_TYPE_VALUES.includes(r.documentType)) return false;
  if (!isStyleRuleStatus(r.status)) return false;
  // §4, §9 — the derived-authority invariant must hold on a stored record.
  if (r.authorityState !== authorityStateForStatus(r.status)) return false;
  // §11 — evidence-backed or invalid. No manual-rule type this phase.
  if (!Array.isArray(r.sourceMemoryIds) || r.sourceMemoryIds.length < 1) return false;
  if (!Array.isArray(r.sourceObservationIds) || r.sourceObservationIds.length < 1) return false;
  if (!Array.isArray(r.sourceDocumentIds) || r.sourceDocumentIds.length < 1) return false;
  if (!r.evidence || typeof r.evidence !== 'object') return false;
  if (!STYLE_RULE_EVIDENCE_FIELDS.every((f) => f in r.evidence)) return false;
  if (!r.temporalEvidence || typeof r.temporalEvidence !== 'object') return false;
  if (!STYLE_RULE_TEMPORAL_FIELDS.every((f) => f in r.temporalEvidence)) return false;
  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) return false;
  if (!Number.isInteger(r.version) || r.version < 1) return false;
  if (r.supersedesRuleId !== null && typeof r.supersedesRuleId !== 'string') return false;
  if (r.supersededByRuleId !== null && typeof r.supersededByRuleId !== 'string') return false;
  if (typeof r.createdAt !== 'string' || !r.createdAt) return false;

  // status-specific metadata (§9, §10). A `deprecated` rule RETAINS its
  // approval provenance (it was necessarily approved first — §15).
  if (r.status === STYLE_RULE_STATUS.APPROVED || r.status === STYLE_RULE_STATUS.DEPRECATED) {
    if (typeof r.rationale !== 'string' || !r.rationale.trim()) return false; // §10 — human rationale required
    if (typeof r.approvedBy !== 'string' || !r.approvedBy) return false;
    if (typeof r.approvedAt !== 'string' || !r.approvedAt) return false;
  } else if (r.rationale !== null || r.approvedBy !== null || r.approvedAt !== null) {
    return false;
  }
  if (r.status === STYLE_RULE_STATUS.REJECTED) {
    if (typeof r.rejectedBy !== 'string' || !r.rejectedBy) return false;
    if (typeof r.rejectedAt !== 'string' || !r.rejectedAt) return false;
  } else if (r.rejectedBy !== null || r.rejectedAt !== null) {
    return false;
  }
  if (r.status === STYLE_RULE_STATUS.DEPRECATED) {
    if (typeof r.deprecatedBy !== 'string' || !r.deprecatedBy) return false;
    if (typeof r.deprecatedAt !== 'string' || !r.deprecatedAt) return false;
  } else if (r.deprecatedBy !== null || r.deprecatedAt !== null) {
    return false;
  }

  if (!Array.isArray(r.auditTrail) || r.auditTrail.length < 1) return false;
  if (!r.auditTrail.every((e) => e && AUDIT_EVENT_VALUES.includes(e.event))) return false;
  if (r.auditTrail[0].event !== STYLE_GUIDE_AUDIT_EVENTS.PROPOSED) return false;

  return STYLE_RULE_FIELDS.every((f) => f in r);
}

export function isStyleRuleList(list) {
  return Array.isArray(list) && list.every(isStyleRule);
}

/* internal helpers re-exported for the sibling pure modules (proposal /
   authority / query) so the normalisation discipline lives in ONE place. */
export const __style_guide_internals = Object.freeze({
  clamp01, intOrZero, isoOrNull, slug, fnv1a, normValue, strList, intList, posIntMap, trimOrNull,
});
