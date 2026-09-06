/* ============================================================
   VISUAL-TEMPLATE-CONTRACT.JS — PBSI Visual Template System
   (V2, Phase 5.x.6)

   PURPOSE: fix the shape of ONE authoritative PBSI document-layout
   template — the VISUAL authority layer, a sibling of the PBSI NOR Style
   Guide (Phase 5.x.5). The Style Guide governs LANGUAGE / convention; the
   Visual Template System governs PHYSICAL / document presentation (page
   size, margins, header/footer geometry, logo placement, region
   positions, typography, spacing, page-break behaviour).

     Visual Evidence → Visual Observations → Visual Template CANDIDATE →
     Human Approval → Authoritative Visual Template → (future) Renderer

   THE MANDATORY DISTINCTION (Phase 5.x.6 §2, §13, §26):

       Visual evidence is not visual policy.
       A repeated layout is not automatically an official template.
       Only explicit human approval creates authoritative template authority.

   A VisualTemplate is EITHER `proposed` (a candidate awaiting a human
   decision) or, once a human explicitly approves it with a written
   rationale, `approved`. `rejected` / `deprecated` are the retained
   terminal states — nothing is ever deleted (§10, §12).

     • `authorityState` is DERIVED from `status`, never client-set (§11).
       The future renderer reads THIS one field: only `authoritative`
       templates apply.
     • Frequency, confidence, `documentEra`, temporal status, cross-type
       evidence and any (optional) model output can justify a CANDIDATE —
       they can NEVER cause automatic approval (§0, §13, §21).
     • Geometry is NEVER fabricated: an unextractable page size / region is
       `null` / `unknown`, never "assume A4" (§5, §6, §17).
     • Coordinate spaces are ALWAYS explicit; coordinates from different
       spaces are never compared without an explicit normalisation step
       (§3, §5).
     • Changing an approved template creates a NEW superseding template;
       the old one is deprecated (retained, queryable), never mutated in
       place (§10, §12).

   RESPONSIBILITY: VISUAL_TEMPLATE_SYSTEM_SCHEMA / VISUAL_TEMPLATE_SCHEMA,
   VISUAL_TEMPLATE_SCOPE, VISUAL_TEMPLATE_STATUS (+ graph + human-gated
   set + `canVisualTemplateTransition`), VISUAL_AUTHORITY_STATE (+
   `authorityStateForStatus`), VISUAL_TEMPLATE_DOCUMENT_TYPE (reused),
   VISUAL_REGION_KIND, VISUAL_PAGE_RECURRENCE, COORDINATE_SPACE (re-export),
   makeTemplateGeometry / isTemplateGeometry, makeTemplatePageModel /
   isTemplatePageModel, makeTemplateRegion / isTemplateRegion,
   makeTemplateTypography, makeTemplateSpacing, VISUAL_TEMPLATE_AUDIT_EVENTS,
   visualTemplateIdFrom, makeVisualTemplateAuditEntry, makeVisualTemplate /
   isVisualTemplate.

   DEPENDENCIES: ../../contracts/corpus-provenance-contract.js
   (COORDINATE_SPACE, makeCorpusRegion, isCorpusRegion — reused, NOT
   redefined), ../../contracts/corpus-document-contract.js
   (CORPUS_DOCUMENT_TYPE — cross-reference), ../../temporal/contracts/
   temporal-contract.js (CONVENTION_STATUS, TEMPORAL_CLASSIFICATION —
   reused). PURE — no I/O, no DOM, no Firebase, no secret, no model.
   ============================================================ */

'use strict';

import {
  COORDINATE_SPACE, makeCorpusRegion, isCorpusRegion,
} from '../../contracts/corpus-provenance-contract.js';
import { CORPUS_DOCUMENT_TYPE } from '../../contracts/corpus-document-contract.js';
import { CONVENTION_STATUS, TEMPORAL_CLASSIFICATION } from '../../temporal/contracts/temporal-contract.js';

export const VISUAL_TEMPLATE_SYSTEM_SCHEMA = 'pbsi-visual-template@1';
export const VISUAL_TEMPLATE_SCHEMA = 'visual-template@1';

/** re-export so a consumer needs ONE import surface. Same origin/orientation
 *  semantics as the corpus provenance contract:
 *    pdf_points  — 72 per inch, origin BOTTOM-LEFT (PDF native)
 *    pixels      — rendered raster, origin TOP-LEFT
 *    normalized  — 0..1 fraction of page width/height (origin follows the
 *                  space it was normalised from — recorded on the region)
 *    unknown     — the honest default; no geometry claim */
export { COORDINATE_SPACE };
const COORD_VALUES = Object.freeze(Object.values(COORDINATE_SPACE));

/** §H — organization-wide. One PBSI organization; the field is the seam,
 *  `organization` is the only value. A per-user visual template is
 *  impossible by construction (§11, §23). */
export const VISUAL_TEMPLATE_SCOPE = Object.freeze({ ORGANIZATION: 'organization' });
const SCOPE_VALUES = Object.freeze(Object.values(VISUAL_TEMPLATE_SCOPE));

/** §8 — the document types a template is scoped to. Reused from the corpus
 *  document contract, plus `cross_type` for a layout whose evidence
 *  explicitly spans >= 2 real types. A MEMORANDUM layout does NOT become a
 *  NOR template; a LEGACY layout does NOT become current NOR authority. */
export const VISUAL_TEMPLATE_DOCUMENT_TYPE = Object.freeze({
  NOR: CORPUS_DOCUMENT_TYPE.NOR,
  NOTA_ORGANISASI: CORPUS_DOCUMENT_TYPE.NOTA_ORGANISASI,
  MEMORANDUM: CORPUS_DOCUMENT_TYPE.MEMORANDUM,
  LEGACY: CORPUS_DOCUMENT_TYPE.LEGACY,
  UNKNOWN: CORPUS_DOCUMENT_TYPE.UNKNOWN,
  CROSS_TYPE: 'cross_type',
});
const DOC_TYPE_VALUES = Object.freeze(Object.values(VISUAL_TEMPLATE_DOCUMENT_TYPE));

/** §4, §15 — the controlled vocabulary of page regions. Every value maps to
 *  a real deterministic layout observation (`page_geometry`,
 *  `content_bounds`, `block_<role>`) or the optional visual-analyzer port —
 *  no speculative categories. */
export const VISUAL_REGION_KIND = Object.freeze({
  PAGE: 'page',                       // whole-page geometry (from `page_geometry`)
  MARGIN: 'margin',                   // content bounds → page margins (from `content_bounds`)
  HEADER: 'header',
  FOOTER: 'footer',
  LOGO: 'logo',
  TITLE: 'title',
  DOCUMENT_METADATA: 'document_metadata',
  RECIPIENT: 'recipient',
  SUBJECT: 'subject',
  DATE: 'date',
  BODY: 'body',
  SIGNATURE: 'signature',
  ATTACHMENT: 'attachment',
  PAGE_NUMBER: 'page_number',
  DIVIDER: 'divider',
  OTHER: 'other',
});
const REGION_KIND_VALUES = Object.freeze(Object.values(VISUAL_REGION_KIND));
export function isVisualRegionKind(k) { return REGION_KIND_VALUES.includes(k); }

/** §16 — a region's page recurrence. `unknown` is first-class — recurrence
 *  is inferred ONLY from sufficient multi-page evidence, never from one
 *  page. */
export const VISUAL_PAGE_RECURRENCE = Object.freeze({
  FIRST_PAGE_ONLY: 'first_page_only',
  LAST_PAGE_ONLY: 'last_page_only',
  EVERY_PAGE: 'every_page',
  UNKNOWN: 'unknown',
});
const RECURRENCE_VALUES = Object.freeze(Object.values(VISUAL_PAGE_RECURRENCE));

/** §10 — the explicit state machine.
 *
 *    proposed ──▶ approved ──▶ deprecated
 *        │
 *        └──────▶ rejected
 *
 *  `rejected` / `deprecated` are TERMINAL and RETAINED (§10, §12). There is
 *  no `approved → approved` edge: a layout change is a NEW superseding
 *  template (§10, §12). Mirrors src/intelligence/corpus/style-guide/
 *  contracts/style-guide-contract.js. */
export const VISUAL_TEMPLATE_STATUS = Object.freeze({
  PROPOSED: 'proposed',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DEPRECATED: 'deprecated',
});
export const VISUAL_TEMPLATE_STATUS_DEFS = Object.freeze([
  Object.freeze({ id: VISUAL_TEMPLATE_STATUS.PROPOSED, label: 'Proposed (awaiting human decision)' }),
  Object.freeze({ id: VISUAL_TEMPLATE_STATUS.APPROVED, label: 'Approved visual template' }),
  Object.freeze({ id: VISUAL_TEMPLATE_STATUS.REJECTED, label: 'Rejected' }),
  Object.freeze({ id: VISUAL_TEMPLATE_STATUS.DEPRECATED, label: 'Deprecated (was approved, no longer authoritative)' }),
]);
export const VISUAL_TEMPLATE_STATUS_GRAPH = Object.freeze({
  [VISUAL_TEMPLATE_STATUS.PROPOSED]: Object.freeze([VISUAL_TEMPLATE_STATUS.APPROVED, VISUAL_TEMPLATE_STATUS.REJECTED]),
  [VISUAL_TEMPLATE_STATUS.APPROVED]: Object.freeze([VISUAL_TEMPLATE_STATUS.DEPRECATED]),
  [VISUAL_TEMPLATE_STATUS.REJECTED]: Object.freeze([]),
  [VISUAL_TEMPLATE_STATUS.DEPRECATED]: Object.freeze([]),
});
export const VISUAL_TEMPLATE_HUMAN_GATED_STATES = Object.freeze([
  VISUAL_TEMPLATE_STATUS.APPROVED, VISUAL_TEMPLATE_STATUS.REJECTED, VISUAL_TEMPLATE_STATUS.DEPRECATED,
]);
export function canVisualTemplateTransition(from, to) {
  const reachable = VISUAL_TEMPLATE_STATUS_GRAPH[from];
  return Array.isArray(reachable) && reachable.includes(to);
}
export function isVisualTemplateHumanGated(to) { return VISUAL_TEMPLATE_HUMAN_GATED_STATES.includes(to); }
export function isVisualTemplateStatus(s) { return Object.values(VISUAL_TEMPLATE_STATUS).includes(s); }

/** §11 — DERIVED from `status`, NEVER stored from client input. The future
 *  renderer checks exactly `authorityState === 'authoritative'`. */
export const VISUAL_AUTHORITY_STATE = Object.freeze({
  PROPOSED: 'proposed',
  AUTHORITATIVE: 'authoritative',
  NOT_AUTHORITATIVE: 'not_authoritative',
});
export function authorityStateForStatus(status) {
  if (status === VISUAL_TEMPLATE_STATUS.APPROVED) return VISUAL_AUTHORITY_STATE.AUTHORITATIVE;
  if (status === VISUAL_TEMPLATE_STATUS.PROPOSED) return VISUAL_AUTHORITY_STATE.PROPOSED;
  return VISUAL_AUTHORITY_STATE.NOT_AUTHORITATIVE;
}

/** §25 — the on-record append-only audit vocabulary. Event NAMES only. */
export const VISUAL_TEMPLATE_AUDIT_EVENTS = Object.freeze({
  PROPOSED: 'VISUAL_TEMPLATE_PROPOSED',
  APPROVED: 'VISUAL_TEMPLATE_APPROVED',
  REJECTED: 'VISUAL_TEMPLATE_REJECTED',
  DEPRECATED: 'VISUAL_TEMPLATE_DEPRECATED',
  SUPERSEDED: 'VISUAL_TEMPLATE_SUPERSEDED',
});
const AUDIT_EVENT_VALUES = Object.freeze(Object.values(VISUAL_TEMPLATE_AUDIT_EVENTS));

export const VISUAL_TEMPLATE_EVIDENCE_FIELDS = Object.freeze([
  'documentCount', 'observationCount', 'pageCount',
  'regionKinds', 'coordinateSpaces', 'geometryKnown',
]);
export const VISUAL_TEMPLATE_TEMPORAL_FIELDS = Object.freeze([
  'temporalStatus', 'conventionEra',
  'oldestSourceDate', 'latestSourceDate',
  'recentDocumentCount', 'historicalDocumentCount', 'transitionalDocumentCount', 'undatedDocumentCount',
]);

export const VISUAL_TEMPLATE_FIELDS = Object.freeze([
  'schema', 'visualTemplateSystemSchema', 'templateId', 'scope', 'documentType', 'variant',
  'status', 'authorityState', 'rationale',
  'pageModel', 'regions', 'typography', 'spacing', 'structuralRules',
  'sourceDocumentIds', 'sourceObservationIds', 'evidence', 'temporalEvidence', 'confidence',
  'templateVersion', 'supersedesTemplateId', 'supersededByTemplateId',
  'createdAt', 'createdBy', 'approvedAt', 'approvedBy',
  'rejectedAt', 'rejectedBy', 'deprecatedAt', 'deprecatedBy',
  'auditTrail',
]);

/* ── pure helpers ──────────────────────────────────────────────────── */

function clamp01(v) { const n = Number(v); return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n; }
function intOrZero(v) { return Number.isInteger(v) && v >= 0 ? v : 0; }
function isoOrNull(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
function str(v) { return v == null ? '' : String(v); }
function trimOrNull(v) { const s = typeof v === 'string' ? v.trim() : ''; return s || null; }
/** finite number or null — NEVER 0-as-placeholder, NEVER rounded (§5). */
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

/** Full-precision page-region geometry — reuses `makeCorpusRegion` (finite
 *  check, no rounding, coordinateSpace forced to `unknown` when no
 *  coordinate is present). */
export function makeTemplateGeometry(seed = {}) {
  return makeCorpusRegion(seed || {});
}
export function isTemplateGeometry(g) { return isCorpusRegion(g); }
export const UNKNOWN_GEOMETRY = Object.freeze(makeCorpusRegion({}));

/**
 * @typedef {Object} TemplatePageModel
 * @property {number|null} pageNumber   - 1-based; null = "the representative page"
 * @property {number|null} width        - null = geometry unknown (§6 — never fabricated)
 * @property {number|null} height
 * @property {string} unit              - 'pt' | 'px' | 'fraction' | 'unknown' (derived from coordinateSpace)
 * @property {string} coordinateSpace   - COORDINATE_SPACE.*
 * @property {string} orientation       - 'portrait' | 'landscape' | 'unknown' (only when both dims present)
 * @property {string[]} sourceDocumentIds
 * @property {string[]} sourceObservationIds
 */
const UNIT_FOR_SPACE = Object.freeze({
  [COORDINATE_SPACE.PDF_POINTS]: 'pt',
  [COORDINATE_SPACE.PIXELS]: 'px',
  [COORDINATE_SPACE.NORMALIZED]: 'fraction',
  [COORDINATE_SPACE.UNKNOWN]: 'unknown',
});
export function makeTemplatePageModel(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const w = finiteOrNull(s.width);
  const h = finiteOrNull(s.height);
  const space = COORD_VALUES.includes(s.coordinateSpace) && (w !== null || h !== null)
    ? s.coordinateSpace : COORDINATE_SPACE.UNKNOWN;
  const pn = Number(s.pageNumber);
  const orientation = (w !== null && h !== null)
    ? (w > h ? 'landscape' : 'portrait')
    : 'unknown';
  return Object.freeze({
    pageNumber: Number.isInteger(pn) && pn >= 1 ? pn : null,
    width: w,
    height: h,
    unit: UNIT_FOR_SPACE[space] || 'unknown',
    coordinateSpace: space,
    orientation,
    sourceDocumentIds: strList(s.sourceDocumentIds),
    sourceObservationIds: strList(s.sourceObservationIds),
  });
}
export function isTemplatePageModel(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.width !== null && !Number.isFinite(p.width)) return false;
  if (p.height !== null && !Number.isFinite(p.height)) return false;
  if (!COORD_VALUES.includes(p.coordinateSpace)) return false;
  if (!['portrait', 'landscape', 'unknown'].includes(p.orientation)) return false;
  if (!Array.isArray(p.sourceDocumentIds) || !Array.isArray(p.sourceObservationIds)) return false;
  // §6 — a space label without any coordinate is a false geometry claim.
  if (p.coordinateSpace !== COORDINATE_SPACE.UNKNOWN && p.width === null && p.height === null) return false;
  return true;
}

/**
 * @typedef {Object} TemplateRegion
 * @property {string} kind            - VISUAL_REGION_KIND.*
 * @property {import('../../contracts/corpus-provenance-contract.js').CorpusRegion} geometry - may be UNKNOWN_GEOMETRY (§L)
 * @property {string} pageRecurrence  - VISUAL_PAGE_RECURRENCE.* ('unknown' unless enough evidence — §16)
 * @property {number} occurrenceCount
 * @property {number} documentCount
 * @property {number} confidence      - extraction/localisation confidence — NOT authority (§0)
 * @property {string[]} sourceObservationIds
 * @property {string[]} sourceDocumentIds
 * @property {string} note
 */
export function makeTemplateRegion(seed = {}) {
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
export function isTemplateRegion(r) {
  if (!r || typeof r !== 'object') return false;
  if (!isVisualRegionKind(r.kind)) return false;
  if (!isCorpusRegion(r.geometry)) return false;
  if (!RECURRENCE_VALUES.includes(r.pageRecurrence)) return false;
  if (!Array.isArray(r.sourceObservationIds) || !Array.isArray(r.sourceDocumentIds)) return false;
  return true;
}

/**
 * @typedef {Object} TemplateTypography — every field is nullable; a font
 *  that cannot be reliably extracted is `null` / `unknown` (§17 — NEVER
 *  fabricated).
 */
export function makeTemplateTypography(seed = {}) {
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

/**
 * @typedef {Object} TemplateSpacing — nullable; unextractable → null.
 */
export function makeTemplateSpacing(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const space = COORD_VALUES.includes(s.coordinateSpace) ? s.coordinateSpace : COORDINATE_SPACE.UNKNOWN;
  return Object.freeze({
    paragraphSpacing: finiteOrNull(s.paragraphSpacing),
    lineSpacing: finiteOrNull(s.lineSpacing),
    coordinateSpace: (s.paragraphSpacing != null || s.lineSpacing != null) ? space : COORDINATE_SPACE.UNKNOWN,
    unit: UNIT_FOR_SPACE[(s.paragraphSpacing != null || s.lineSpacing != null) ? space : COORDINATE_SPACE.UNKNOWN] || 'unknown',
    confidence: clamp01(s.confidence),
    sourceObservationIds: strList(s.sourceObservationIds),
  });
}

/** §16 — structural rules; only what evidence supports, else null/unknown. */
export function makeTemplateStructuralRules(seed = {}) {
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

/**
 * Deterministic template identity for a (scope, documentType) SLOT VARIANT
 * — the same geometry fingerprint always yields the same templateId (§7,
 * §12). Two materially different layouts for the same slot get two
 * DIFFERENT ids (both may be `proposed`; the resolver reports the
 * conflict — §20, §21). A superseding layout gets its own id and links
 * back via `supersedesTemplateId` (§12).
 */
export function visualTemplateIdFrom(scope, documentType, geometryFingerprint) {
  return `vtpl_${slug(scope)}__${slug(documentType)}__${fnv1a(String(geometryFingerprint == null ? '' : geometryFingerprint))}`;
}

/**
 * @typedef {Object} VisualTemplateAuditEntry
 * @property {string} event, at, actorId|null, fromStatus|null, toStatus
 * @property {number} version
 * @property {Object} detail  - metadata only (rationale / reason / supersedes ids) — NEVER a secret or document body
 */
export function makeVisualTemplateAuditEntry(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  return Object.freeze({
    event: AUDIT_EVENT_VALUES.includes(s.event) ? s.event : VISUAL_TEMPLATE_AUDIT_EVENTS.PROPOSED,
    at: str(s.at) || new Date().toISOString(),
    actorId: s.actorId == null ? null : String(s.actorId),
    fromStatus: s.fromStatus == null ? null : String(s.fromStatus),
    toStatus: str(s.toStatus) || VISUAL_TEMPLATE_STATUS.PROPOSED,
    version: Number.isInteger(s.version) && s.version >= 1 ? s.version : 1,
    detail: s.detail && typeof s.detail === 'object' && !Array.isArray(s.detail) ? Object.freeze({ ...s.detail }) : Object.freeze({}),
  });
}

/**
 * @typedef {Object} VisualTemplate
 * @property {string} schema, visualTemplateSystemSchema, templateId
 * @property {string} scope             - VISUAL_TEMPLATE_SCOPE.* ('organization')
 * @property {string} documentType      - VISUAL_TEMPLATE_DOCUMENT_TYPE.*
 * @property {string} variant           - a deterministic layout-variant label (from the geometry fingerprint)
 * @property {string} status            - VISUAL_TEMPLATE_STATUS.*
 * @property {string} authorityState    - DERIVED from status (§11)
 * @property {string|null} rationale    - human-written; REQUIRED non-empty when approved (§11)
 * @property {TemplatePageModel} pageModel
 * @property {TemplateRegion[]} regions
 * @property {Object} typography
 * @property {Object} spacing
 * @property {Object} structuralRules
 * @property {string[]} sourceDocumentIds   - >= 1
 * @property {string[]} sourceObservationIds - >= 1
 * @property {Object} evidence
 * @property {Object} temporalEvidence
 * @property {number} confidence        - carried through — NOT authority (§0)
 * @property {number} templateVersion   - supersession-chain position (1 = first template for this slot)
 * @property {string|null} supersedesTemplateId
 * @property {string|null} supersededByTemplateId
 * @property {string} createdAt
 * @property {string|null} createdBy    - server-derived proposer
 * @property {string|null} approvedAt, approvedBy, rejectedAt, rejectedBy, deprecatedAt, deprecatedBy
 * @property {VisualTemplateAuditEntry[]} auditTrail
 */
export function makeVisualTemplate(seed = {}) {
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
  const keepsApproval = isApproved || isDeprecated; // deprecated retains its approval provenance (§10, §12)

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

export function isVisualTemplate(t) {
  if (!t || typeof t !== 'object') return false;
  if (t.schema !== VISUAL_TEMPLATE_SCHEMA) return false;
  if (t.visualTemplateSystemSchema !== VISUAL_TEMPLATE_SYSTEM_SCHEMA) return false;
  if (typeof t.templateId !== 'string' || !t.templateId) return false;
  if (!SCOPE_VALUES.includes(t.scope)) return false;
  if (!DOC_TYPE_VALUES.includes(t.documentType)) return false;
  if (typeof t.variant !== 'string' || !t.variant) return false; // §7 — a variant label is required
  if (!isVisualTemplateStatus(t.status)) return false;
  if (t.authorityState !== authorityStateForStatus(t.status)) return false; // §11 — derived invariant
  if (!isTemplatePageModel(t.pageModel)) return false;
  if (!Array.isArray(t.regions) || !t.regions.every(isTemplateRegion)) return false;
  if (!t.typography || typeof t.typography !== 'object' || typeof t.typography.confidence !== 'number') return false;
  if (!t.spacing || typeof t.spacing !== 'object' || typeof t.spacing.confidence !== 'number') return false;
  if (!t.structuralRules || typeof t.structuralRules !== 'object') return false;
  // §13, §3 — evidence-backed or invalid.
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
    if (typeof t.rationale !== 'string' || !t.rationale.trim()) return false; // §11 — human rationale required
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

export function isVisualTemplateList(list) {
  return Array.isArray(list) && list.every(isVisualTemplate);
}

/* internals re-exported for the sibling pure modules — normalisation
   discipline lives in ONE place. */
export const __visual_template_internals = Object.freeze({
  clamp01, intOrZero, isoOrNull, str, trimOrNull, finiteOrNull, boolOrNull, slug, fnv1a, strList,
});
