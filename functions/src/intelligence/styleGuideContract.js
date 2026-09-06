'use strict';

/* ============================================================
   functions/src/intelligence/styleGuideContract.js — Phase 5.x.5

   The CJS mirror of the ESM Style Guide layer
   (src/intelligence/corpus/style-guide/contracts/style-guide-contract.js +
   style-guide-proposal.js + style-guide-authority.js + style-guide-query.js
   + contracts/style-guide-store-contract.js). Kept byte-for-behaviour with
   the ESM side — scripts/intelligence-corpus-style-guide-check.cjs asserts
   drift parity (schemas, enums, graphs, and that makeStyleRule /
   makeStyleGuideProposalFromMemory / resolveEffectiveRule produce
   identical output).

   The Functions runtime is CJS and must NEVER import from src/ (see
   scripts/intelligence-foundation-check.mjs). This file is the whole
   Style Guide contract + pure lifecycle the server store + callable need,
   dependency-free.

   Combines, in ONE file (same discipline as corpusContract.js /
   norRegistryContract.js):
     • style-guide-contract.js
     • style-guide-store-contract.js  (envelope + errors + method list)
     • style-guide-proposal.js        (makeStyleGuideProposalFromMemory)
     • style-guide-authority.js       (markApproved / markRejected / markDeprecated)
     • style-guide-query.js           (resolveEffectiveRule, queryStyleGuide,
                                       findStyleGuideConflicts, getSupersessionChain)
   ============================================================ */

/* ── schemas ───────────────────────────────────────────────────────── */
const STYLE_GUIDE_SCHEMA = 'pbsi-nor-style-guide@1';
const STYLE_RULE_SCHEMA = 'style-guide-rule@1';
const STYLE_GUIDE_PROPOSAL_SET_SCHEMA = 'style-guide-proposal-set@1';
const STYLE_GUIDE_STORE_SCHEMA = 'style-guide-store@1';

/* ── reused vocabularies (mirrored, not imported) ──────────────────── */
// the Writing Memory language-category subset (writing-memory-contract.js §4)
const STYLE_RULE_CATEGORIES = Object.freeze([
  'terminology', 'organizational_term', 'preferred_phrase',
  'opening_pattern', 'closing_pattern', 'recipient_convention',
  'subject_convention', 'date_convention', 'attachment_convention',
  'copy_convention', 'signature_wording', 'body_structure', 'formal_tone',
]);
function isStyleRuleCategory(c) { return STYLE_RULE_CATEGORIES.includes(c); }

// DOCUMENT_TYPE_SCOPE (writing-memory-contract.js)
const DOCUMENT_TYPE_SCOPE = Object.freeze({
  NOR: 'NOR', NOTA_ORGANISASI: 'NOTA_ORGANISASI', MEMORANDUM: 'MEMORANDUM',
  LEGACY: 'LEGACY', UNKNOWN: 'UNKNOWN', CROSS_TYPE: 'cross_type',
});
const DOC_TYPE_VALUES = Object.freeze(Object.values(DOCUMENT_TYPE_SCOPE));

// CONVENTION_STATUS / TEMPORAL_CLASSIFICATION (temporal-contract.js)
const CONVENTION_STATUS = Object.freeze({
  ALIGNED: 'aligned', HISTORICAL_ONLY: 'historical_only', CURRENT_EVIDENCE: 'current_evidence',
  CONFLICTING: 'conflicting', POSSIBLE_DRIFT: 'possible_drift', INSUFFICIENT_EVIDENCE: 'insufficient_evidence',
});
const TEMPORAL_CLASSIFICATION = Object.freeze({
  HISTORICAL: 'historical', CURRENT: 'current', TRANSITIONAL: 'transitional', UNKNOWN: 'unknown',
});

/* ── scope ─────────────────────────────────────────────────────────── */
const STYLE_GUIDE_SCOPE = Object.freeze({ ORGANIZATION: 'organization' });
const SCOPE_VALUES = Object.freeze(Object.values(STYLE_GUIDE_SCOPE));

/* ── state machine ─────────────────────────────────────────────────── */
const STYLE_RULE_STATUS = Object.freeze({
  PROPOSED: 'proposed', APPROVED: 'approved', REJECTED: 'rejected', DEPRECATED: 'deprecated',
});
const STYLE_RULE_STATUS_GRAPH = Object.freeze({
  [STYLE_RULE_STATUS.PROPOSED]: Object.freeze([STYLE_RULE_STATUS.APPROVED, STYLE_RULE_STATUS.REJECTED]),
  [STYLE_RULE_STATUS.APPROVED]: Object.freeze([STYLE_RULE_STATUS.DEPRECATED]),
  [STYLE_RULE_STATUS.REJECTED]: Object.freeze([]),
  [STYLE_RULE_STATUS.DEPRECATED]: Object.freeze([]),
});
const STYLE_RULE_HUMAN_GATED_STATES = Object.freeze([
  STYLE_RULE_STATUS.APPROVED, STYLE_RULE_STATUS.REJECTED, STYLE_RULE_STATUS.DEPRECATED,
]);
function canStyleRuleTransition(from, to) {
  const r = STYLE_RULE_STATUS_GRAPH[from];
  return Array.isArray(r) && r.includes(to);
}
function isStyleRuleHumanGated(to) { return STYLE_RULE_HUMAN_GATED_STATES.includes(to); }
function isStyleRuleStatus(s) { return Object.values(STYLE_RULE_STATUS).includes(s); }

const STYLE_AUTHORITY_STATE = Object.freeze({
  PROPOSED: 'proposed', AUTHORITATIVE: 'authoritative', NOT_AUTHORITATIVE: 'not_authoritative',
});
function authorityStateForStatus(status) {
  if (status === STYLE_RULE_STATUS.APPROVED) return STYLE_AUTHORITY_STATE.AUTHORITATIVE;
  if (status === STYLE_RULE_STATUS.PROPOSED) return STYLE_AUTHORITY_STATE.PROPOSED;
  return STYLE_AUTHORITY_STATE.NOT_AUTHORITATIVE;
}

/* ── audit vocab ───────────────────────────────────────────────────── */
const STYLE_GUIDE_AUDIT_EVENTS = Object.freeze({
  PROPOSED: 'STYLE_RULE_PROPOSED', APPROVED: 'STYLE_RULE_APPROVED', REJECTED: 'STYLE_RULE_REJECTED',
  DEPRECATED: 'STYLE_RULE_DEPRECATED', SUPERSEDED: 'STYLE_RULE_SUPERSEDED',
});
const AUDIT_EVENT_VALUES = Object.freeze(Object.values(STYLE_GUIDE_AUDIT_EVENTS));

/* ── field lists ───────────────────────────────────────────────────── */
const STYLE_RULE_EVIDENCE_FIELDS = Object.freeze([
  'occurrenceCount', 'documentCount', 'documentTypeDistribution', 'pageNumbers', 'extractionMethods',
]);
const STYLE_RULE_TEMPORAL_FIELDS = Object.freeze([
  'temporalStatus', 'conventionEra', 'oldestSourceDate', 'latestSourceDate',
  'recentDocumentCount', 'historicalDocumentCount', 'conflictingDocumentCount',
  'approvedRulePresent', 'approvedRuleMatches',
]);
const STYLE_RULE_FIELDS = Object.freeze([
  'schema', 'styleGuideSchema', 'ruleId', 'scope', 'category', 'key', 'value', 'normalizedValue',
  'documentType', 'status', 'authorityState', 'rationale',
  'sourceMemoryIds', 'sourceObservationIds', 'sourceDocumentIds',
  'evidence', 'temporalEvidence', 'confidence',
  'version', 'supersedesRuleId', 'supersededByRuleId',
  'createdAt', 'createdBy', 'approvedAt', 'approvedBy',
  'rejectedAt', 'rejectedBy', 'deprecatedAt', 'deprecatedBy', 'auditTrail',
]);

/* ── store envelope + errors ───────────────────────────────────────── */
const STYLE_GUIDE_ERRORS = Object.freeze({
  NO_BACKEND_CONFIGURED: 'NO_BACKEND_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_RECORD: 'INVALID_RECORD',
  ILLEGAL_TRANSITION: 'ILLEGAL_TRANSITION',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  RATIONALE_REQUIRED: 'RATIONALE_REQUIRED',
  REASON_REQUIRED: 'REASON_REQUIRED',
  ACTOR_REQUIRED: 'ACTOR_REQUIRED',
  CONFLICT_UNRESOLVED: 'CONFLICT_UNRESOLVED',
  RULE_EXISTS: 'RULE_EXISTS',
  MEMORY_NOT_FOUND: 'MEMORY_NOT_FOUND',
  WRITING_MEMORY_UNAVAILABLE: 'WRITING_MEMORY_UNAVAILABLE',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});
function styleGuideSuccess(data) {
  return Object.freeze({ ok: true, data: data === undefined ? null : data, error: null });
}
function styleGuideFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}
const STYLE_GUIDE_STORE_CONTRACT = Object.freeze({
  schema: STYLE_GUIDE_STORE_SCHEMA,
  methods: Object.freeze(['list', 'get', 'proposeFromMemory', 'approve', 'reject', 'deprecate', 'resolve', 'history']),
  errorCodes: STYLE_GUIDE_ERRORS,
});

/* ── pure helpers (identical to __style_guide_internals) ───────────── */
function clamp01(v) { const n = Number(v); return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n; }
function intOrZero(v) { return Number.isInteger(v) && v >= 0 ? v : 0; }
function isoOrNull(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
function str(v) { return v == null ? '' : String(v); }
function trimOrNull(v) { const s = typeof v === 'string' ? v.trim() : ''; return s || null; }
function slug(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
}
function fnv1a(input) {
  let h = 0x811c9dc5;
  const s = String(input == null ? '' : input);
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function normValue(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim();
}
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

function styleRuleIdFrom(scope, category, key, documentType, value) {
  return `sgr_${slug(scope)}__${slug(category)}__${slug(key)}__${slug(documentType)}__${fnv1a(normValue(value))}`;
}

function makeStyleRuleAuditEntry(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return Object.freeze({
    event: AUDIT_EVENT_VALUES.includes(s.event) ? s.event : STYLE_GUIDE_AUDIT_EVENTS.PROPOSED,
    at: str(s.at) || new Date().toISOString(),
    actorId: s.actorId == null ? null : String(s.actorId),
    fromStatus: s.fromStatus == null ? null : String(s.fromStatus),
    toStatus: str(s.toStatus) || STYLE_RULE_STATUS.PROPOSED,
    version: Number.isInteger(s.version) && s.version >= 1 ? s.version : 1,
    detail: s.detail && typeof s.detail === 'object' && !Array.isArray(s.detail) ? Object.freeze(Object.assign({}, s.detail)) : Object.freeze({}),
  });
}

function makeStyleRule(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};

  const scope = SCOPE_VALUES.includes(s.scope) ? s.scope : STYLE_GUIDE_SCOPE.ORGANIZATION;
  const category = String(s.category || '');
  const key = String(s.key || '');
  const value = s.value == null ? '' : String(s.value);
  const documentType = DOC_TYPE_VALUES.includes(s.documentType) ? s.documentType : DOCUMENT_TYPE_SCOPE.UNKNOWN;
  const status = isStyleRuleStatus(s.status) ? s.status : STYLE_RULE_STATUS.PROPOSED;
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

  const isApproved = status === STYLE_RULE_STATUS.APPROVED;
  const isRejected = status === STYLE_RULE_STATUS.REJECTED;
  const isDeprecated = status === STYLE_RULE_STATUS.DEPRECATED;
  const keepsApproval = isApproved || isDeprecated; // deprecated retains its approval provenance (§8, §15)

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

function isStyleRule(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.schema !== STYLE_RULE_SCHEMA) return false;
  if (r.styleGuideSchema !== STYLE_GUIDE_SCHEMA) return false;
  if (typeof r.ruleId !== 'string' || !r.ruleId) return false;
  if (!SCOPE_VALUES.includes(r.scope)) return false;
  if (!isStyleRuleCategory(r.category)) return false;
  if (typeof r.key !== 'string' || !r.key) return false;
  if (typeof r.value !== 'string' || !r.value) return false;
  if (r.normalizedValue !== null && typeof r.normalizedValue !== 'string') return false;
  if (!DOC_TYPE_VALUES.includes(r.documentType)) return false;
  if (!isStyleRuleStatus(r.status)) return false;
  if (r.authorityState !== authorityStateForStatus(r.status)) return false;
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

  if (r.status === STYLE_RULE_STATUS.APPROVED || r.status === STYLE_RULE_STATUS.DEPRECATED) {
    if (typeof r.rationale !== 'string' || !r.rationale.trim()) return false;
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

function isStyleRuleList(list) { return Array.isArray(list) && list.every(isStyleRule); }

/* ── proposal builder (mirror of style-guide-proposal.js) ──────────── */
function makeStyleGuideProposalFromMemory(memory, ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const m = memory && typeof memory === 'object' ? memory : {};
  const ev = m.evidence && typeof m.evidence === 'object' ? m.evidence : {};
  const memoryId = m.memoryId == null ? '' : String(m.memoryId);
  const category = m.category;
  const value = m.value == null ? '' : String(m.value);

  if (!memoryId) return null;
  if (!isStyleRuleCategory(category)) return null;
  if (!value) return null;
  const sourceObservationIds = Array.isArray(m.sourceObservationIds) ? m.sourceObservationIds : [];
  const sourceDocumentIds = Array.isArray(m.sourceDocumentIds) ? m.sourceDocumentIds : [];
  if (sourceObservationIds.length < 1 || sourceDocumentIds.length < 1) return null;

  const when = c.at || new Date().toISOString();
  const actorId = c.actorId == null ? null : String(c.actorId);
  const scope = c.scope || STYLE_GUIDE_SCOPE.ORGANIZATION;
  const version = Number.isInteger(c.version) && c.version >= 1 ? c.version : 1;
  const supersedesRuleId = c.supersedesRuleId == null ? null : String(c.supersedesRuleId);

  return makeStyleRule({
    scope,
    category,
    key: m.key,
    value,
    normalizedValue: m.normalizedValue == null ? null : String(m.normalizedValue),
    documentType: m.documentType,
    status: STYLE_RULE_STATUS.PROPOSED,
    rationale: null,
    sourceMemoryIds: [memoryId],
    sourceObservationIds,
    sourceDocumentIds,
    evidence: {
      occurrenceCount: ev.occurrenceCount,
      documentCount: ev.documentCount,
      documentTypeDistribution: ev.documentTypeDistribution,
      pageNumbers: [],
      extractionMethods: [],
    },
    temporalEvidence: {
      temporalStatus: m.temporalStatus,
      conventionEra: m.conventionEra,
      oldestSourceDate: ev.oldestSourceDate,
      latestSourceDate: ev.latestSourceDate,
      recentDocumentCount: ev.recentDocumentCount,
      historicalDocumentCount: ev.historicalDocumentCount,
      conflictingDocumentCount: ev.conflictingDocumentCount,
      approvedRulePresent: ev.approvedRulePresent,
      approvedRuleMatches: ev.approvedRuleMatches,
    },
    confidence: m.confidence,
    version,
    supersedesRuleId,
    supersededByRuleId: null,
    createdAt: when,
    createdBy: actorId,
    auditTrail: [makeStyleRuleAuditEntry({
      event: STYLE_GUIDE_AUDIT_EVENTS.PROPOSED,
      at: when,
      actorId,
      fromStatus: null,
      toStatus: STYLE_RULE_STATUS.PROPOSED,
      version,
      detail: { sourceMemoryId: memoryId, fromWritingMemory: true, supersedesRuleId },
    })],
  });
}

/* ── authority helpers (mirror of style-guide-authority.js) ────────── */
function nonEmpty(v) { return typeof v === 'string' && v.trim() ? v.trim() : ''; }

function markApproved(rule, ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  if (!isStyleRule(rule)) return { error: 'INVALID_RECORD' };
  if (!canStyleRuleTransition(rule.status, STYLE_RULE_STATUS.APPROVED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(c.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const rationale = nonEmpty(c.rationale);
  if (!rationale) return { error: 'RATIONALE_REQUIRED' };
  const when = c.at || new Date().toISOString();
  return {
    next: makeStyleRule(Object.assign({}, rule, {
      status: STYLE_RULE_STATUS.APPROVED,
      rationale,
      approvedAt: when,
      approvedBy: actorId,
      auditTrail: rule.auditTrail.concat([makeStyleRuleAuditEntry({
        event: STYLE_GUIDE_AUDIT_EVENTS.APPROVED, at: when, actorId,
        fromStatus: rule.status, toStatus: STYLE_RULE_STATUS.APPROVED, version: rule.version,
        detail: { rationale, supersedesRuleId: rule.supersedesRuleId || null },
      })]),
    })),
  };
}

function markRejected(rule, ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  if (!isStyleRule(rule)) return { error: 'INVALID_RECORD' };
  if (!canStyleRuleTransition(rule.status, STYLE_RULE_STATUS.REJECTED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(c.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const reason = nonEmpty(c.reason);
  if (!reason) return { error: 'REASON_REQUIRED' };
  const when = c.at || new Date().toISOString();
  return {
    next: makeStyleRule(Object.assign({}, rule, {
      status: STYLE_RULE_STATUS.REJECTED,
      rejectedAt: when,
      rejectedBy: actorId,
      auditTrail: rule.auditTrail.concat([makeStyleRuleAuditEntry({
        event: STYLE_GUIDE_AUDIT_EVENTS.REJECTED, at: when, actorId,
        fromStatus: rule.status, toStatus: STYLE_RULE_STATUS.REJECTED, version: rule.version,
        detail: { reason },
      })]),
    })),
  };
}

function markDeprecated(rule, ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  if (!isStyleRule(rule)) return { error: 'INVALID_RECORD' };
  if (!canStyleRuleTransition(rule.status, STYLE_RULE_STATUS.DEPRECATED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(c.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const reason = nonEmpty(c.reason);
  if (!reason) return { error: 'REASON_REQUIRED' };
  const when = c.at || new Date().toISOString();
  const supersededByRuleId = c.supersededByRuleId == null ? null : String(c.supersededByRuleId);
  const auditTrail = rule.auditTrail.concat([makeStyleRuleAuditEntry({
    event: STYLE_GUIDE_AUDIT_EVENTS.DEPRECATED, at: when, actorId,
    fromStatus: rule.status, toStatus: STYLE_RULE_STATUS.DEPRECATED, version: rule.version,
    detail: { reason, supersededByRuleId },
  })]);
  if (supersededByRuleId) {
    auditTrail.push(makeStyleRuleAuditEntry({
      event: STYLE_GUIDE_AUDIT_EVENTS.SUPERSEDED, at: when, actorId,
      fromStatus: STYLE_RULE_STATUS.DEPRECATED, toStatus: STYLE_RULE_STATUS.DEPRECATED, version: rule.version,
      detail: { supersededByRuleId, supersedesRuleId: rule.ruleId },
    }));
  }
  return {
    next: makeStyleRule(Object.assign({}, rule, {
      status: STYLE_RULE_STATUS.DEPRECATED,
      deprecatedAt: when,
      deprecatedBy: actorId,
      supersededByRuleId,
      auditTrail,
    })),
  };
}

/* ── query / resolver (mirror of style-guide-query.js) ────────────── */
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
function effectiveValueOf(r) { return r.normalizedValue == null ? normValue(r.value) : r.normalizedValue; }

function queryStyleGuide(rules, filter) {
  const f = filter && typeof filter === 'object' ? filter : {};
  let out = ruleList(rules).filter((r) =>
    inSet(r.status, f.status)
    && inSet(r.category, f.category)
    && inSet(r.documentType, f.documentType)
    && inSet(r.scope, f.scope)
    && (f.key == null || r.key === f.key));
  if (f.includeSuperseded === false) out = out.filter((r) => !r.supersededByRuleId);
  return out.slice().sort(byRuleId);
}

function getEffectiveStyleGuide(rules, filter) {
  const f = filter && typeof filter === 'object' ? filter : {};
  return queryStyleGuide(rules, {
    status: STYLE_RULE_STATUS.APPROVED,
    category: f.category, documentType: f.documentType, scope: f.scope, key: f.key,
  });
}

function resolveEffectiveRule(rules, target) {
  const t = target && typeof target === 'object' ? target : {};
  const scope = t.scope || STYLE_GUIDE_SCOPE.ORGANIZATION;
  const category = t.category;
  const key = t.key;
  const documentType = t.documentType;

  const approved = ruleList(rules).filter((r) =>
    r.status === STYLE_RULE_STATUS.APPROVED
    && r.scope === scope && r.category === category && r.key === key && r.documentType === documentType);

  const base = { scope, category, key, documentType };
  if (approved.length === 0) {
    return Object.freeze(Object.assign({}, base, { outcome: 'missing', rule: null, competingRuleIds: [], competing: Object.freeze([]) }));
  }
  const distinctValues = new Set(approved.map(effectiveValueOf));
  if (distinctValues.size === 1) {
    const active = approved.filter((r) => !r.supersededByRuleId);
    const pool = active.length ? active : approved;
    const rule = pool.slice().sort((a, b) => (b.version - a.version) || byRuleId(a, b))[0];
    return Object.freeze(Object.assign({}, base, { outcome: 'resolved', rule, competingRuleIds: [], competing: Object.freeze([]) }));
  }
  const competing = approved.slice().sort(byRuleId).map((r) => Object.freeze({
    ruleId: r.ruleId, value: r.value, normalizedValue: r.normalizedValue, version: r.version,
    approvedAt: r.approvedAt, approvedBy: r.approvedBy, rationale: r.rationale,
    evidence: r.evidence, temporalEvidence: r.temporalEvidence,
  }));
  return Object.freeze(Object.assign({}, base, {
    outcome: 'conflict', rule: null,
    competingRuleIds: Object.freeze(competing.map((c) => c.ruleId)),
    competing: Object.freeze(competing),
  }));
}

function findStyleGuideConflicts(rules) {
  const list = ruleList(rules);
  const out = [];
  for (const status of [STYLE_RULE_STATUS.APPROVED, STYLE_RULE_STATUS.PROPOSED]) {
    const groups = new Map();
    for (const r of list) {
      if (r.status !== status) continue;
      if (r.supersededByRuleId) continue;
      const gk = `${r.scope}|${r.category}|${r.key}|${r.documentType}`;
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk).push(r);
    }
    for (const group of groups.values()) {
      const distinct = new Set(group.map(effectiveValueOf));
      if (distinct.size < 2) continue;
      const sample = group[0];
      const sides = group.slice().sort(byRuleId).map((r) => Object.freeze({
        ruleId: r.ruleId, value: r.value, normalizedValue: r.normalizedValue,
        version: r.version, status: r.status, evidence: r.evidence, temporalEvidence: r.temporalEvidence,
      }));
      out.push(Object.freeze({
        scope: sample.scope, category: sample.category, key: sample.key, documentType: sample.documentType,
        status, competingRuleIds: Object.freeze(sides.map((s) => s.ruleId)), sides: Object.freeze(sides),
      }));
    }
  }
  return out.sort((a, b) => {
    const ka = `${a.status}|${a.scope}|${a.category}|${a.key}|${a.documentType}`;
    const kb = `${b.status}|${b.scope}|${b.category}|${b.key}|${b.documentType}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function getSupersessionChain(rules, ruleId) {
  const byId = new Map(ruleList(rules).map((r) => [r.ruleId, r]));
  const start = byId.get(String(ruleId || ''));
  if (!start) return [];
  const seen = new Set();
  const chain = [];
  let cur = start;
  while (cur && !seen.has(cur.ruleId)) {
    seen.add(cur.ruleId);
    chain.push(cur);
    cur = cur.supersedesRuleId ? byId.get(cur.supersedesRuleId) : null;
  }
  cur = start.supersededByRuleId ? byId.get(start.supersededByRuleId) : null;
  while (cur && !seen.has(cur.ruleId)) {
    seen.add(cur.ruleId);
    chain.push(cur);
    cur = cur.supersededByRuleId ? byId.get(cur.supersededByRuleId) : null;
  }
  return chain.sort((a, b) => (a.version - b.version) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : byRuleId(a, b)));
}

module.exports = {
  // schemas
  STYLE_GUIDE_SCHEMA, STYLE_RULE_SCHEMA, STYLE_GUIDE_PROPOSAL_SET_SCHEMA, STYLE_GUIDE_STORE_SCHEMA,
  // vocab
  STYLE_RULE_CATEGORIES, isStyleRuleCategory, DOCUMENT_TYPE_SCOPE,
  CONVENTION_STATUS, TEMPORAL_CLASSIFICATION,
  STYLE_GUIDE_SCOPE,
  STYLE_RULE_STATUS, STYLE_RULE_STATUS_GRAPH, STYLE_RULE_HUMAN_GATED_STATES,
  canStyleRuleTransition, isStyleRuleHumanGated, isStyleRuleStatus,
  STYLE_AUTHORITY_STATE, authorityStateForStatus,
  STYLE_GUIDE_AUDIT_EVENTS,
  STYLE_RULE_EVIDENCE_FIELDS, STYLE_RULE_TEMPORAL_FIELDS, STYLE_RULE_FIELDS,
  // record
  styleRuleIdFrom, makeStyleRuleAuditEntry, makeStyleRule, isStyleRule, isStyleRuleList,
  // proposal
  makeStyleGuideProposalFromMemory,
  // authority
  markApproved, markRejected, markDeprecated,
  // query
  queryStyleGuide, getEffectiveStyleGuide, resolveEffectiveRule, findStyleGuideConflicts, getSupersessionChain,
  // store envelope
  STYLE_GUIDE_ERRORS, styleGuideSuccess, styleGuideFailure, STYLE_GUIDE_STORE_CONTRACT,
  // internals (for drift parity assertions)
  __internals: { clamp01, intOrZero, isoOrNull, slug, fnv1a, normValue, strList, intList, posIntMap, trimOrNull },
};
