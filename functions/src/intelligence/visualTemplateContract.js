'use strict';

/* ============================================================
   functions/src/intelligence/visualTemplateContract.js — Phase 5.x.6

   The CJS mirror of the ESM Visual Template layer
   (src/intelligence/corpus/visual-template/contracts/visual-template-contract.js
   + visual-template-proposal.js + visual-template-authority.js +
   visual-template-query.js + contracts/visual-template-store-contract.js).
   Kept byte-for-behaviour with the ESM side —
   scripts/intelligence-corpus-visual-template-check.cjs asserts drift
   parity (schemas, enums, graphs, and that makeVisualTemplate /
   makeVisualTemplateProposalFromPattern / markApproved /
   resolveEffectiveTemplate produce identical output).

   The Functions runtime is CJS and must NEVER import from src/. This file
   is the whole Visual Template contract + pure lifecycle the server store
   + callable need, dependency-free. The AGGREGATOR is NOT mirrored here —
   it is injected into the callable as an ESM port (like the Phase 5.x.4
   writing-memory builder), so its geometry logic lives in exactly one
   place.
   ============================================================ */

/* ── schemas ───────────────────────────────────────────────────────── */
const VISUAL_TEMPLATE_SYSTEM_SCHEMA = 'pbsi-visual-template@1';
const VISUAL_TEMPLATE_SCHEMA = 'visual-template@1';
const VISUAL_TEMPLATE_PROPOSAL_SET_SCHEMA = 'visual-template-proposal-set@1';
const VISUAL_TEMPLATE_STORE_SCHEMA = 'visual-template-store@1';

/* ── reused vocabularies (mirrored, not imported) ──────────────────── */
const COORDINATE_SPACE = Object.freeze({
  PDF_POINTS: 'pdf_points', PIXELS: 'pixels', NORMALIZED: 'normalized', UNKNOWN: 'unknown',
});
const COORD_VALUES = Object.freeze(Object.values(COORDINATE_SPACE));

const VISUAL_TEMPLATE_SCOPE = Object.freeze({ ORGANIZATION: 'organization' });
const SCOPE_VALUES = Object.freeze(Object.values(VISUAL_TEMPLATE_SCOPE));

const VISUAL_TEMPLATE_DOCUMENT_TYPE = Object.freeze({
  NOR: 'NOR', NOTA_ORGANISASI: 'NOTA_ORGANISASI', MEMORANDUM: 'MEMORANDUM',
  LEGACY: 'LEGACY', UNKNOWN: 'UNKNOWN', CROSS_TYPE: 'cross_type',
});
const DOC_TYPE_VALUES = Object.freeze(Object.values(VISUAL_TEMPLATE_DOCUMENT_TYPE));

const VISUAL_REGION_KIND = Object.freeze({
  PAGE: 'page', MARGIN: 'margin', HEADER: 'header', FOOTER: 'footer', LOGO: 'logo', TITLE: 'title',
  DOCUMENT_METADATA: 'document_metadata', RECIPIENT: 'recipient', SUBJECT: 'subject', DATE: 'date',
  BODY: 'body', SIGNATURE: 'signature', ATTACHMENT: 'attachment', PAGE_NUMBER: 'page_number',
  DIVIDER: 'divider', OTHER: 'other',
});
const REGION_KIND_VALUES = Object.freeze(Object.values(VISUAL_REGION_KIND));
function isVisualRegionKind(k) { return REGION_KIND_VALUES.includes(k); }

const VISUAL_PAGE_RECURRENCE = Object.freeze({
  FIRST_PAGE_ONLY: 'first_page_only', LAST_PAGE_ONLY: 'last_page_only', EVERY_PAGE: 'every_page', UNKNOWN: 'unknown',
});
const RECURRENCE_VALUES = Object.freeze(Object.values(VISUAL_PAGE_RECURRENCE));

const CONVENTION_STATUS = Object.freeze({
  ALIGNED: 'aligned', HISTORICAL_ONLY: 'historical_only', CURRENT_EVIDENCE: 'current_evidence',
  CONFLICTING: 'conflicting', POSSIBLE_DRIFT: 'possible_drift', INSUFFICIENT_EVIDENCE: 'insufficient_evidence',
});
const TEMPORAL_CLASSIFICATION = Object.freeze({
  HISTORICAL: 'historical', CURRENT: 'current', TRANSITIONAL: 'transitional', UNKNOWN: 'unknown',
});

/* ── state machine ─────────────────────────────────────────────────── */
const VISUAL_TEMPLATE_STATUS = Object.freeze({
  PROPOSED: 'proposed', APPROVED: 'approved', REJECTED: 'rejected', DEPRECATED: 'deprecated',
});
const VISUAL_TEMPLATE_STATUS_GRAPH = Object.freeze({
  [VISUAL_TEMPLATE_STATUS.PROPOSED]: Object.freeze([VISUAL_TEMPLATE_STATUS.APPROVED, VISUAL_TEMPLATE_STATUS.REJECTED]),
  [VISUAL_TEMPLATE_STATUS.APPROVED]: Object.freeze([VISUAL_TEMPLATE_STATUS.DEPRECATED]),
  [VISUAL_TEMPLATE_STATUS.REJECTED]: Object.freeze([]),
  [VISUAL_TEMPLATE_STATUS.DEPRECATED]: Object.freeze([]),
});
const VISUAL_TEMPLATE_HUMAN_GATED_STATES = Object.freeze([
  VISUAL_TEMPLATE_STATUS.APPROVED, VISUAL_TEMPLATE_STATUS.REJECTED, VISUAL_TEMPLATE_STATUS.DEPRECATED,
]);
function canVisualTemplateTransition(from, to) {
  const r = VISUAL_TEMPLATE_STATUS_GRAPH[from];
  return Array.isArray(r) && r.includes(to);
}
function isVisualTemplateHumanGated(to) { return VISUAL_TEMPLATE_HUMAN_GATED_STATES.includes(to); }
function isVisualTemplateStatus(s) { return Object.values(VISUAL_TEMPLATE_STATUS).includes(s); }

const VISUAL_AUTHORITY_STATE = Object.freeze({
  PROPOSED: 'proposed', AUTHORITATIVE: 'authoritative', NOT_AUTHORITATIVE: 'not_authoritative',
});
function authorityStateForStatus(status) {
  if (status === VISUAL_TEMPLATE_STATUS.APPROVED) return VISUAL_AUTHORITY_STATE.AUTHORITATIVE;
  if (status === VISUAL_TEMPLATE_STATUS.PROPOSED) return VISUAL_AUTHORITY_STATE.PROPOSED;
  return VISUAL_AUTHORITY_STATE.NOT_AUTHORITATIVE;
}

const VISUAL_TEMPLATE_AUDIT_EVENTS = Object.freeze({
  PROPOSED: 'VISUAL_TEMPLATE_PROPOSED', APPROVED: 'VISUAL_TEMPLATE_APPROVED', REJECTED: 'VISUAL_TEMPLATE_REJECTED',
  DEPRECATED: 'VISUAL_TEMPLATE_DEPRECATED', SUPERSEDED: 'VISUAL_TEMPLATE_SUPERSEDED',
});
const AUDIT_EVENT_VALUES = Object.freeze(Object.values(VISUAL_TEMPLATE_AUDIT_EVENTS));

const VISUAL_TEMPLATE_EVIDENCE_FIELDS = Object.freeze([
  'documentCount', 'observationCount', 'pageCount', 'regionKinds', 'coordinateSpaces', 'geometryKnown',
]);
const VISUAL_TEMPLATE_TEMPORAL_FIELDS = Object.freeze([
  'temporalStatus', 'conventionEra', 'oldestSourceDate', 'latestSourceDate',
  'recentDocumentCount', 'historicalDocumentCount', 'transitionalDocumentCount', 'undatedDocumentCount',
]);
const VISUAL_TEMPLATE_FIELDS = Object.freeze([
  'schema', 'visualTemplateSystemSchema', 'templateId', 'scope', 'documentType', 'variant',
  'status', 'authorityState', 'rationale',
  'pageModel', 'regions', 'typography', 'spacing', 'structuralRules',
  'sourceDocumentIds', 'sourceObservationIds', 'evidence', 'temporalEvidence', 'confidence',
  'templateVersion', 'supersedesTemplateId', 'supersededByTemplateId',
  'createdAt', 'createdBy', 'approvedAt', 'approvedBy',
  'rejectedAt', 'rejectedBy', 'deprecatedAt', 'deprecatedBy', 'auditTrail',
]);

/* ── store envelope + errors ───────────────────────────────────────── */
const VISUAL_TEMPLATE_ERRORS = Object.freeze({
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
  TEMPLATE_EXISTS: 'TEMPLATE_EXISTS',
  PATTERN_NOT_FOUND: 'PATTERN_NOT_FOUND',
  VISUAL_ANALYSIS_UNAVAILABLE: 'VISUAL_ANALYSIS_UNAVAILABLE',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
});
function visualTemplateSuccess(data) {
  return Object.freeze({ ok: true, data: data === undefined ? null : data, error: null });
}
function visualTemplateFailure(code, message) {
  return Object.freeze({ ok: false, data: null, error: Object.freeze({ code, message: String(message || '') }) });
}
const VISUAL_TEMPLATE_STORE_CONTRACT = Object.freeze({
  schema: VISUAL_TEMPLATE_STORE_SCHEMA,
  methods: Object.freeze(['list', 'get', 'proposeFromEvidence', 'approve', 'reject', 'deprecate', 'resolve', 'history']),
  errorCodes: VISUAL_TEMPLATE_ERRORS,
});

/* ── pure helpers ─────────────────────────────────────────────────── */
function clamp01(v) { const n = Number(v); return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n; }
function intOrZero(v) { return Number.isInteger(v) && v >= 0 ? v : 0; }
function isoOrNull(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
function str(v) { return v == null ? '' : String(v); }
function trimOrNull(v) { const s = typeof v === 'string' ? v.trim() : ''; return s || null; }
function finiteOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function boolOrNull(v) { return v === true ? true : v === false ? false : null; }
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
function strList(v) {
  return Object.freeze([...new Set((Array.isArray(v) ? v : []).map((x) => String(x)).filter(Boolean))].sort());
}
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : (Number.isFinite(Number(v)) ? Number(v) : null); }

/** mirror of corpus-provenance-contract.makeCorpusRegion. */
function makeCorpusRegion(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const cx = num(s.x); const cy = num(s.y); const cw = num(s.width); const ch = num(s.height);
  const hasAny = cx !== null || cy !== null || cw !== null || ch !== null;
  const space = COORD_VALUES.includes(s.coordinateSpace) ? s.coordinateSpace : COORDINATE_SPACE.UNKNOWN;
  return Object.freeze({ x: cx, y: cy, width: cw, height: ch, coordinateSpace: hasAny ? space : COORDINATE_SPACE.UNKNOWN });
}
function isCorpusRegion(r) {
  if (!r || typeof r !== 'object') return false;
  for (const k of ['x', 'y', 'width', 'height']) {
    if (!(k in r)) return false;
    if (r[k] !== null && !(typeof r[k] === 'number' && Number.isFinite(r[k]))) return false;
  }
  return COORD_VALUES.includes(r.coordinateSpace);
}
function makeTemplateGeometry(seed) { return makeCorpusRegion(seed || {}); }
function isTemplateGeometry(g) { return isCorpusRegion(g); }
const UNKNOWN_GEOMETRY = Object.freeze(makeCorpusRegion({}));

const UNIT_FOR_SPACE = Object.freeze({
  [COORDINATE_SPACE.PDF_POINTS]: 'pt', [COORDINATE_SPACE.PIXELS]: 'px',
  [COORDINATE_SPACE.NORMALIZED]: 'fraction', [COORDINATE_SPACE.UNKNOWN]: 'unknown',
});
function makeTemplatePageModel(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const w = finiteOrNull(s.width);
  const h = finiteOrNull(s.height);
  const space = COORD_VALUES.includes(s.coordinateSpace) && (w !== null || h !== null)
    ? s.coordinateSpace : COORDINATE_SPACE.UNKNOWN;
  const pn = Number(s.pageNumber);
  const orientation = (w !== null && h !== null) ? (w > h ? 'landscape' : 'portrait') : 'unknown';
  return Object.freeze({
    pageNumber: Number.isInteger(pn) && pn >= 1 ? pn : null,
    width: w, height: h,
    unit: UNIT_FOR_SPACE[space] || 'unknown',
    coordinateSpace: space,
    orientation,
    sourceDocumentIds: strList(s.sourceDocumentIds),
    sourceObservationIds: strList(s.sourceObservationIds),
  });
}
function isTemplatePageModel(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.width !== null && !Number.isFinite(p.width)) return false;
  if (p.height !== null && !Number.isFinite(p.height)) return false;
  if (!COORD_VALUES.includes(p.coordinateSpace)) return false;
  if (!['portrait', 'landscape', 'unknown'].includes(p.orientation)) return false;
  if (!Array.isArray(p.sourceDocumentIds) || !Array.isArray(p.sourceObservationIds)) return false;
  if (p.coordinateSpace !== COORDINATE_SPACE.UNKNOWN && p.width === null && p.height === null) return false;
  return true;
}
function makeTemplateRegion(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return Object.freeze({
    kind: isVisualRegionKind(s.kind) ? s.kind : VISUAL_REGION_KIND.OTHER,
    geometry: makeCorpusRegion(s.geometry || {}),
    pageRecurrence: RECURRENCE_VALUES.includes(s.pageRecurrence) ? s.pageRecurrence : VISUAL_PAGE_RECURRENCE.UNKNOWN,
    occurrenceCount: intOrZero(s.occurrenceCount),
    documentCount: intOrZero(s.documentCount),
    confidence: clamp01(s.confidence),
    sourceObservationIds: strList(s.sourceObservationIds),
    sourceDocumentIds: strList(s.sourceDocumentIds),
    note: str(s.note),
  });
}
function isTemplateRegion(r) {
  if (!r || typeof r !== 'object') return false;
  if (!isVisualRegionKind(r.kind)) return false;
  if (!isCorpusRegion(r.geometry)) return false;
  if (!RECURRENCE_VALUES.includes(r.pageRecurrence)) return false;
  if (!Array.isArray(r.sourceObservationIds) || !Array.isArray(r.sourceDocumentIds)) return false;
  return true;
}
function makeTemplateTypography(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const align = ['left', 'center', 'right', 'justify'].includes(s.alignment) ? s.alignment : null;
  return Object.freeze({
    fontFamily: s.fontFamily == null || String(s.fontFamily).trim() === '' ? null : String(s.fontFamily),
    fontSizePt: finiteOrNull(s.fontSizePt),
    weight: s.weight == null ? null : (['normal', 'bold'].includes(s.weight) ? s.weight : finiteOrNull(s.weight)),
    italic: boolOrNull(s.italic),
    alignment: align,
    lineHeight: finiteOrNull(s.lineHeight),
    letterSpacing: finiteOrNull(s.letterSpacing),
    confidence: clamp01(s.confidence),
    sourceObservationIds: strList(s.sourceObservationIds),
  });
}
function makeTemplateSpacing(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const has = (s.paragraphSpacing != null || s.lineSpacing != null);
  const space = has && COORD_VALUES.includes(s.coordinateSpace) ? s.coordinateSpace : COORDINATE_SPACE.UNKNOWN;
  return Object.freeze({
    paragraphSpacing: finiteOrNull(s.paragraphSpacing),
    lineSpacing: finiteOrNull(s.lineSpacing),
    coordinateSpace: space,
    unit: UNIT_FOR_SPACE[space] || 'unknown',
    confidence: clamp01(s.confidence),
    sourceObservationIds: strList(s.sourceObservationIds),
  });
}
function makeTemplateStructuralRules(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const rec = (v) => (RECURRENCE_VALUES.includes(v) ? v : VISUAL_PAGE_RECURRENCE.UNKNOWN);
  return Object.freeze({
    multiPage: boolOrNull(s.multiPage),
    headerRecurrence: rec(s.headerRecurrence),
    footerRecurrence: rec(s.footerRecurrence),
    pageNumberRecurrence: rec(s.pageNumberRecurrence),
    signatureOnFinalPageOnly: boolOrNull(s.signatureOnFinalPageOnly),
  });
}

function visualTemplateIdFrom(scope, documentType, geometryFingerprint) {
  return `vtpl_${slug(scope)}__${slug(documentType)}__${fnv1a(String(geometryFingerprint == null ? '' : geometryFingerprint))}`;
}

function makeVisualTemplateAuditEntry(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return Object.freeze({
    event: AUDIT_EVENT_VALUES.includes(s.event) ? s.event : VISUAL_TEMPLATE_AUDIT_EVENTS.PROPOSED,
    at: str(s.at) || new Date().toISOString(),
    actorId: s.actorId == null ? null : String(s.actorId),
    fromStatus: s.fromStatus == null ? null : String(s.fromStatus),
    toStatus: str(s.toStatus) || VISUAL_TEMPLATE_STATUS.PROPOSED,
    version: Number.isInteger(s.version) && s.version >= 1 ? s.version : 1,
    detail: s.detail && typeof s.detail === 'object' && !Array.isArray(s.detail) ? Object.freeze(Object.assign({}, s.detail)) : Object.freeze({}),
  });
}

function makeVisualTemplate(seed) {
  const s = seed && typeof seed === 'object' ? seed : {};

  const scope = SCOPE_VALUES.includes(s.scope) ? s.scope : VISUAL_TEMPLATE_SCOPE.ORGANIZATION;
  const documentType = DOC_TYPE_VALUES.includes(s.documentType) ? s.documentType : VISUAL_TEMPLATE_DOCUMENT_TYPE.UNKNOWN;
  const variant = str(s.variant);
  const status = isVisualTemplateStatus(s.status) ? s.status : VISUAL_TEMPLATE_STATUS.PROPOSED;
  const authorityState = authorityStateForStatus(status);

  const pageModel = isTemplatePageModel(s.pageModel) ? s.pageModel : makeTemplatePageModel(s.pageModel || {});
  const regions = Object.freeze((Array.isArray(s.regions) ? s.regions : [])
    .map((r) => (isTemplateRegion(r) ? r : makeTemplateRegion(r)))
    .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)));
  const typography = s.typography && s.typography.confidence !== undefined ? s.typography : makeTemplateTypography(s.typography || {});
  const spacing = s.spacing && s.spacing.confidence !== undefined ? s.spacing : makeTemplateSpacing(s.spacing || {});
  const structuralRules = makeTemplateStructuralRules(s.structuralRules || {});

  const ev = s.evidence && typeof s.evidence === 'object' ? s.evidence : {};
  const evidence = Object.freeze({
    documentCount: intOrZero(ev.documentCount),
    observationCount: intOrZero(ev.observationCount),
    pageCount: intOrZero(ev.pageCount),
    regionKinds: strList(ev.regionKinds),
    coordinateSpaces: strList(ev.coordinateSpaces),
    geometryKnown: ev.geometryKnown === true,
  });

  const te = s.temporalEvidence && typeof s.temporalEvidence === 'object' ? s.temporalEvidence : {};
  const temporalEvidence = Object.freeze({
    temporalStatus: Object.values(CONVENTION_STATUS).includes(te.temporalStatus) ? te.temporalStatus : CONVENTION_STATUS.INSUFFICIENT_EVIDENCE,
    conventionEra: Object.values(TEMPORAL_CLASSIFICATION).includes(te.conventionEra) ? te.conventionEra : TEMPORAL_CLASSIFICATION.UNKNOWN,
    oldestSourceDate: isoOrNull(te.oldestSourceDate),
    latestSourceDate: isoOrNull(te.latestSourceDate),
    recentDocumentCount: intOrZero(te.recentDocumentCount),
    historicalDocumentCount: intOrZero(te.historicalDocumentCount),
    transitionalDocumentCount: intOrZero(te.transitionalDocumentCount),
    undatedDocumentCount: intOrZero(te.undatedDocumentCount),
  });

  const templateVersion = Number.isInteger(s.templateVersion) && s.templateVersion >= 1 ? s.templateVersion : 1;
  const created = str(s.createdAt) || new Date().toISOString();
  const templateId = String(s.templateId || visualTemplateIdFrom(scope, documentType, variant));

  const isApproved = status === VISUAL_TEMPLATE_STATUS.APPROVED;
  const isRejected = status === VISUAL_TEMPLATE_STATUS.REJECTED;
  const isDeprecated = status === VISUAL_TEMPLATE_STATUS.DEPRECATED;
  const keepsApproval = isApproved || isDeprecated;

  const auditTrail = Object.freeze((Array.isArray(s.auditTrail) ? s.auditTrail : []).map(makeVisualTemplateAuditEntry));

  return Object.freeze({
    schema: VISUAL_TEMPLATE_SCHEMA,
    visualTemplateSystemSchema: VISUAL_TEMPLATE_SYSTEM_SCHEMA,
    templateId,
    scope,
    documentType,
    variant,
    status,
    authorityState,
    rationale: keepsApproval ? trimOrNull(s.rationale) : null,
    pageModel,
    regions,
    typography,
    spacing,
    structuralRules,
    sourceDocumentIds: strList(s.sourceDocumentIds),
    sourceObservationIds: strList(s.sourceObservationIds),
    evidence,
    temporalEvidence,
    confidence: clamp01(s.confidence),
    templateVersion,
    supersedesTemplateId: s.supersedesTemplateId == null ? null : String(s.supersedesTemplateId),
    supersededByTemplateId: s.supersededByTemplateId == null ? null : String(s.supersededByTemplateId),
    createdAt: created,
    createdBy: s.createdBy == null ? null : String(s.createdBy),
    approvedAt: keepsApproval ? (str(s.approvedAt) || null) : null,
    approvedBy: keepsApproval && s.approvedBy ? String(s.approvedBy) : null,
    rejectedAt: isRejected ? (str(s.rejectedAt) || null) : null,
    rejectedBy: isRejected && s.rejectedBy ? String(s.rejectedBy) : null,
    deprecatedAt: isDeprecated ? (str(s.deprecatedAt) || null) : null,
    deprecatedBy: isDeprecated && s.deprecatedBy ? String(s.deprecatedBy) : null,
    auditTrail,
  });
}

function isVisualTemplate(t) {
  if (!t || typeof t !== 'object') return false;
  if (t.schema !== VISUAL_TEMPLATE_SCHEMA) return false;
  if (t.visualTemplateSystemSchema !== VISUAL_TEMPLATE_SYSTEM_SCHEMA) return false;
  if (typeof t.templateId !== 'string' || !t.templateId) return false;
  if (!SCOPE_VALUES.includes(t.scope)) return false;
  if (!DOC_TYPE_VALUES.includes(t.documentType)) return false;
  if (typeof t.variant !== 'string' || !t.variant) return false;
  if (!isVisualTemplateStatus(t.status)) return false;
  if (t.authorityState !== authorityStateForStatus(t.status)) return false;
  if (!isTemplatePageModel(t.pageModel)) return false;
  if (!Array.isArray(t.regions) || !t.regions.every(isTemplateRegion)) return false;
  if (!t.typography || typeof t.typography !== 'object' || typeof t.typography.confidence !== 'number') return false;
  if (!t.spacing || typeof t.spacing !== 'object' || typeof t.spacing.confidence !== 'number') return false;
  if (!t.structuralRules || typeof t.structuralRules !== 'object') return false;
  if (!Array.isArray(t.sourceDocumentIds) || t.sourceDocumentIds.length < 1) return false;
  if (!Array.isArray(t.sourceObservationIds) || t.sourceObservationIds.length < 1) return false;
  if (!t.evidence || typeof t.evidence !== 'object') return false;
  if (!VISUAL_TEMPLATE_EVIDENCE_FIELDS.every((f) => f in t.evidence)) return false;
  if (!t.temporalEvidence || typeof t.temporalEvidence !== 'object') return false;
  if (!VISUAL_TEMPLATE_TEMPORAL_FIELDS.every((f) => f in t.temporalEvidence)) return false;
  if (typeof t.confidence !== 'number' || t.confidence < 0 || t.confidence > 1) return false;
  if (!Number.isInteger(t.templateVersion) || t.templateVersion < 1) return false;
  if (t.supersedesTemplateId !== null && typeof t.supersedesTemplateId !== 'string') return false;
  if (t.supersededByTemplateId !== null && typeof t.supersededByTemplateId !== 'string') return false;
  if (typeof t.createdAt !== 'string' || !t.createdAt) return false;

  if (t.status === VISUAL_TEMPLATE_STATUS.APPROVED || t.status === VISUAL_TEMPLATE_STATUS.DEPRECATED) {
    if (typeof t.rationale !== 'string' || !t.rationale.trim()) return false;
    if (typeof t.approvedBy !== 'string' || !t.approvedBy) return false;
    if (typeof t.approvedAt !== 'string' || !t.approvedAt) return false;
  } else if (t.rationale !== null || t.approvedBy !== null || t.approvedAt !== null) {
    return false;
  }
  if (t.status === VISUAL_TEMPLATE_STATUS.REJECTED) {
    if (typeof t.rejectedBy !== 'string' || !t.rejectedBy) return false;
    if (typeof t.rejectedAt !== 'string' || !t.rejectedAt) return false;
  } else if (t.rejectedBy !== null || t.rejectedAt !== null) {
    return false;
  }
  if (t.status === VISUAL_TEMPLATE_STATUS.DEPRECATED) {
    if (typeof t.deprecatedBy !== 'string' || !t.deprecatedBy) return false;
    if (typeof t.deprecatedAt !== 'string' || !t.deprecatedAt) return false;
  } else if (t.deprecatedBy !== null || t.deprecatedAt !== null) {
    return false;
  }

  if (!Array.isArray(t.auditTrail) || t.auditTrail.length < 1) return false;
  if (!t.auditTrail.every((e) => e && AUDIT_EVENT_VALUES.includes(e.event))) return false;
  if (t.auditTrail[0].event !== VISUAL_TEMPLATE_AUDIT_EVENTS.PROPOSED) return false;

  return VISUAL_TEMPLATE_FIELDS.every((f) => f in t);
}
function isVisualTemplateList(list) { return Array.isArray(list) && list.every(isVisualTemplate); }

/* ── proposal builder (mirror of visual-template-proposal.js) ──────── */
function makeVisualTemplateProposalFromPattern(pattern, ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const p = pattern && typeof pattern === 'object' ? pattern : {};
  const variant = p.variant == null ? '' : String(p.variant);
  const sourceDocumentIds = Array.isArray(p.sourceDocumentIds) ? p.sourceDocumentIds : [];
  const sourceObservationIds = Array.isArray(p.sourceObservationIds) ? p.sourceObservationIds : [];

  if (!variant) return null;
  if (!DOC_TYPE_VALUES.includes(p.documentType)) return null;
  if (sourceDocumentIds.length < 1 || sourceObservationIds.length < 1) return null;

  const when = c.at || new Date().toISOString();
  const actorId = c.actorId == null ? null : String(c.actorId);
  const scope = c.scope || VISUAL_TEMPLATE_SCOPE.ORGANIZATION;
  const version = Number.isInteger(c.version) && c.version >= 1 ? c.version : 1;
  const supersedesTemplateId = c.supersedesTemplateId == null ? null : String(c.supersedesTemplateId);

  return makeVisualTemplate({
    scope,
    documentType: p.documentType,
    variant,
    status: VISUAL_TEMPLATE_STATUS.PROPOSED,
    rationale: null,
    pageModel: p.pageModel,
    regions: p.regions,
    typography: p.typography,
    spacing: p.spacing,
    structuralRules: p.structuralRules,
    sourceDocumentIds,
    sourceObservationIds,
    evidence: p.evidence,
    temporalEvidence: p.temporalEvidence,
    confidence: p.confidence,
    templateVersion: version,
    supersedesTemplateId,
    supersededByTemplateId: null,
    createdAt: when,
    createdBy: actorId,
    auditTrail: [makeVisualTemplateAuditEntry({
      event: VISUAL_TEMPLATE_AUDIT_EVENTS.PROPOSED,
      at: when,
      actorId,
      fromStatus: null,
      toStatus: VISUAL_TEMPLATE_STATUS.PROPOSED,
      version,
      detail: {
        patternId: p.patternId == null ? null : String(p.patternId),
        fromVisualEvidence: true,
        supersedesTemplateId,
      },
    })],
  });
}

/* ── authority helpers (mirror of visual-template-authority.js) ────── */
function nonEmpty(v) { return typeof v === 'string' && v.trim() ? v.trim() : ''; }

function markApproved(template, ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  if (!isVisualTemplate(template)) return { error: 'INVALID_RECORD' };
  if (!canVisualTemplateTransition(template.status, VISUAL_TEMPLATE_STATUS.APPROVED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(c.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const rationale = nonEmpty(c.rationale);
  if (!rationale) return { error: 'RATIONALE_REQUIRED' };
  const when = c.at || new Date().toISOString();
  return {
    next: makeVisualTemplate(Object.assign({}, template, {
      status: VISUAL_TEMPLATE_STATUS.APPROVED,
      rationale,
      approvedAt: when,
      approvedBy: actorId,
      auditTrail: template.auditTrail.concat([makeVisualTemplateAuditEntry({
        event: VISUAL_TEMPLATE_AUDIT_EVENTS.APPROVED, at: when, actorId,
        fromStatus: template.status, toStatus: VISUAL_TEMPLATE_STATUS.APPROVED, version: template.templateVersion,
        detail: { rationale, supersedesTemplateId: template.supersedesTemplateId || null },
      })]),
    })),
  };
}

function markRejected(template, ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  if (!isVisualTemplate(template)) return { error: 'INVALID_RECORD' };
  if (!canVisualTemplateTransition(template.status, VISUAL_TEMPLATE_STATUS.REJECTED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(c.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const reason = nonEmpty(c.reason);
  if (!reason) return { error: 'REASON_REQUIRED' };
  const when = c.at || new Date().toISOString();
  return {
    next: makeVisualTemplate(Object.assign({}, template, {
      status: VISUAL_TEMPLATE_STATUS.REJECTED,
      rejectedAt: when,
      rejectedBy: actorId,
      auditTrail: template.auditTrail.concat([makeVisualTemplateAuditEntry({
        event: VISUAL_TEMPLATE_AUDIT_EVENTS.REJECTED, at: when, actorId,
        fromStatus: template.status, toStatus: VISUAL_TEMPLATE_STATUS.REJECTED, version: template.templateVersion,
        detail: { reason },
      })]),
    })),
  };
}

function markDeprecated(template, ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  if (!isVisualTemplate(template)) return { error: 'INVALID_RECORD' };
  if (!canVisualTemplateTransition(template.status, VISUAL_TEMPLATE_STATUS.DEPRECATED)) return { error: 'ILLEGAL_TRANSITION' };
  const actorId = nonEmpty(c.actorId);
  if (!actorId) return { error: 'ACTOR_REQUIRED' };
  const reason = nonEmpty(c.reason);
  if (!reason) return { error: 'REASON_REQUIRED' };
  const when = c.at || new Date().toISOString();
  const supersededByTemplateId = c.supersededByTemplateId == null ? null : String(c.supersededByTemplateId);
  const auditTrail = template.auditTrail.concat([makeVisualTemplateAuditEntry({
    event: VISUAL_TEMPLATE_AUDIT_EVENTS.DEPRECATED, at: when, actorId,
    fromStatus: template.status, toStatus: VISUAL_TEMPLATE_STATUS.DEPRECATED, version: template.templateVersion,
    detail: { reason, supersededByTemplateId },
  })]);
  if (supersededByTemplateId) {
    auditTrail.push(makeVisualTemplateAuditEntry({
      event: VISUAL_TEMPLATE_AUDIT_EVENTS.SUPERSEDED, at: when, actorId,
      fromStatus: VISUAL_TEMPLATE_STATUS.DEPRECATED, toStatus: VISUAL_TEMPLATE_STATUS.DEPRECATED, version: template.templateVersion,
      detail: { supersededByTemplateId, supersedesTemplateId: template.templateId },
    }));
  }
  return {
    next: makeVisualTemplate(Object.assign({}, template, {
      status: VISUAL_TEMPLATE_STATUS.DEPRECATED,
      deprecatedAt: when,
      deprecatedBy: actorId,
      supersededByTemplateId,
      auditTrail,
    })),
  };
}

/* ── query / resolver (mirror of visual-template-query.js) ────────── */
function templateList(templates) {
  return Array.isArray(templates) ? templates.filter((t) => t && typeof t === 'object' && t.templateId) : [];
}
function inSet(v, spec) {
  if (spec == null) return true;
  const list = Array.isArray(spec) ? spec : [spec];
  if (list.includes('ANY')) return true;
  return list.includes(v);
}
function byTemplateId(a, b) { return a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : 0; }

function queryVisualTemplates(templates, filter) {
  const f = filter && typeof filter === 'object' ? filter : {};
  let out = templateList(templates).filter((t) =>
    inSet(t.status, f.status)
    && inSet(t.documentType, f.documentType)
    && inSet(t.scope, f.scope)
    && (f.variant == null || t.variant === f.variant));
  if (f.includeSuperseded === false) out = out.filter((t) => !t.supersededByTemplateId);
  return out.slice().sort(byTemplateId);
}

function getEffectiveVisualTemplates(templates, filter) {
  const f = filter && typeof filter === 'object' ? filter : {};
  return queryVisualTemplates(templates, {
    status: VISUAL_TEMPLATE_STATUS.APPROVED,
    documentType: f.documentType, scope: f.scope, variant: f.variant,
  });
}

function resolveEffectiveTemplate(templates, target) {
  const t = target && typeof target === 'object' ? target : {};
  const scope = t.scope || VISUAL_TEMPLATE_SCOPE.ORGANIZATION;
  const documentType = t.documentType;

  const approved = templateList(templates).filter((x) =>
    x.status === VISUAL_TEMPLATE_STATUS.APPROVED && x.scope === scope && x.documentType === documentType);

  const base = { scope, documentType };
  if (approved.length === 0) {
    return Object.freeze(Object.assign({}, base, { outcome: 'missing', template: null, competingTemplateIds: [], competing: Object.freeze([]) }));
  }
  const distinctVariants = new Set(approved.map((x) => x.variant));
  if (distinctVariants.size === 1) {
    const active = approved.filter((x) => !x.supersededByTemplateId);
    const pool = active.length ? active : approved;
    const template = pool.slice().sort((a, b) => (b.templateVersion - a.templateVersion) || byTemplateId(a, b))[0];
    return Object.freeze(Object.assign({}, base, { outcome: 'resolved', template, competingTemplateIds: [], competing: Object.freeze([]) }));
  }
  const competing = approved.slice().sort(byTemplateId).map((x) => Object.freeze({
    templateId: x.templateId, variant: x.variant, templateVersion: x.templateVersion,
    approvedAt: x.approvedAt, approvedBy: x.approvedBy, rationale: x.rationale,
    pageModel: x.pageModel, regions: x.regions, evidence: x.evidence, temporalEvidence: x.temporalEvidence,
  }));
  return Object.freeze(Object.assign({}, base, {
    outcome: 'conflict', template: null,
    competingTemplateIds: Object.freeze(competing.map((c) => c.templateId)),
    competing: Object.freeze(competing),
  }));
}

function findVisualTemplateConflicts(templates) {
  const list = templateList(templates);
  const out = [];
  for (const status of [VISUAL_TEMPLATE_STATUS.APPROVED, VISUAL_TEMPLATE_STATUS.PROPOSED]) {
    const groups = new Map();
    for (const t of list) {
      if (t.status !== status) continue;
      if (t.supersededByTemplateId) continue;
      const gk = `${t.scope}|${t.documentType}`;
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk).push(t);
    }
    for (const group of groups.values()) {
      const distinct = new Set(group.map((t) => t.variant));
      if (distinct.size < 2) continue;
      const sample = group[0];
      const sides = group.slice().sort(byTemplateId).map((t) => Object.freeze({
        templateId: t.templateId, variant: t.variant, templateVersion: t.templateVersion, status: t.status,
        pageModel: t.pageModel, regions: t.regions, evidence: t.evidence, temporalEvidence: t.temporalEvidence,
      }));
      out.push(Object.freeze({
        scope: sample.scope, documentType: sample.documentType, status,
        competingTemplateIds: Object.freeze(sides.map((s) => s.templateId)), sides: Object.freeze(sides),
      }));
    }
  }
  return out.sort((a, b) => {
    const ka = `${a.status}|${a.scope}|${a.documentType}`;
    const kb = `${b.status}|${b.scope}|${b.documentType}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function getVisualTemplateHistory(templates, templateId) {
  const byId = new Map(templateList(templates).map((t) => [t.templateId, t]));
  const start = byId.get(String(templateId || ''));
  if (!start) return [];
  const seen = new Set();
  const chain = [];
  let cur = start;
  while (cur && !seen.has(cur.templateId)) {
    seen.add(cur.templateId);
    chain.push(cur);
    cur = cur.supersedesTemplateId ? byId.get(cur.supersedesTemplateId) : null;
  }
  cur = start.supersededByTemplateId ? byId.get(start.supersededByTemplateId) : null;
  while (cur && !seen.has(cur.templateId)) {
    seen.add(cur.templateId);
    chain.push(cur);
    cur = cur.supersededByTemplateId ? byId.get(cur.supersededByTemplateId) : null;
  }
  return chain.sort((a, b) => (a.templateVersion - b.templateVersion) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : byTemplateId(a, b)));
}

module.exports = {
  // schemas
  VISUAL_TEMPLATE_SYSTEM_SCHEMA, VISUAL_TEMPLATE_SCHEMA, VISUAL_TEMPLATE_PROPOSAL_SET_SCHEMA, VISUAL_TEMPLATE_STORE_SCHEMA,
  // vocab
  COORDINATE_SPACE, VISUAL_TEMPLATE_SCOPE, VISUAL_TEMPLATE_DOCUMENT_TYPE,
  VISUAL_REGION_KIND, isVisualRegionKind, VISUAL_PAGE_RECURRENCE,
  CONVENTION_STATUS, TEMPORAL_CLASSIFICATION,
  VISUAL_TEMPLATE_STATUS, VISUAL_TEMPLATE_STATUS_GRAPH, VISUAL_TEMPLATE_HUMAN_GATED_STATES,
  canVisualTemplateTransition, isVisualTemplateHumanGated, isVisualTemplateStatus,
  VISUAL_AUTHORITY_STATE, authorityStateForStatus,
  VISUAL_TEMPLATE_AUDIT_EVENTS,
  VISUAL_TEMPLATE_EVIDENCE_FIELDS, VISUAL_TEMPLATE_TEMPORAL_FIELDS, VISUAL_TEMPLATE_FIELDS,
  // geometry / sub-shape builders
  makeTemplateGeometry, isTemplateGeometry, UNKNOWN_GEOMETRY,
  makeTemplatePageModel, isTemplatePageModel,
  makeTemplateRegion, isTemplateRegion,
  makeTemplateTypography, makeTemplateSpacing, makeTemplateStructuralRules,
  // record
  visualTemplateIdFrom, makeVisualTemplateAuditEntry, makeVisualTemplate, isVisualTemplate, isVisualTemplateList,
  // proposal
  makeVisualTemplateProposalFromPattern,
  // authority
  markApproved, markRejected, markDeprecated,
  // query
  queryVisualTemplates, getEffectiveVisualTemplates, resolveEffectiveTemplate, findVisualTemplateConflicts, getVisualTemplateHistory,
  // store envelope
  VISUAL_TEMPLATE_ERRORS, visualTemplateSuccess, visualTemplateFailure, VISUAL_TEMPLATE_STORE_CONTRACT,
  // internals
  __internals: { clamp01, intOrZero, isoOrNull, str, trimOrNull, finiteOrNull, boolOrNull, slug, fnv1a, strList, makeCorpusRegion },
};
