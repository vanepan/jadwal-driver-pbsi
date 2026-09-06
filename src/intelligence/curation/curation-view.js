/* ============================================================
   CURATION-VIEW.JS — Human Curation Workspace (V2, Phase 5.x.8)

   PURPOSE: the PURE, deterministic projection layer the Human Curation
   Workspace renders. It COMPOSES the Phase 5.x.5 Style Guide query layer
   and the Phase 5.x.6 Visual Template query layer into the compact,
   evidence-aware shapes an operator cockpit needs:

     • buildCurationDashboard   §4  — counts derived ONLY from canonical data
     • buildStyleProposalRows / buildVisualProposalRows   §5 — list rows
     • filterCurationRows       §6  — deterministic filters over real fields
     • buildStyleRuleReview     §7  — proposed rule + evidence + temporal +
                                      predecessor + slot conflict
     • buildVisualTemplateReview §8 — template + regions + HONEST geometry
     • describeGeometry         §9  — "unavailable" when a dimension is null,
                                      never a fabricated A4
     • buildConflictView        §11 — both sides, NEVER a recommended winner
     • buildHistoryEntries      §24 — the append-only audit + supersession
                                      chain, normalised for display

   HARD BOUNDARIES:
     • It adds NO resolution logic, NO ranking, NO storage, NO mutation.
     • It NEVER picks a conflict winner by frequency / confidence / recency
       / document count / temporal status (§11).
     • Authority is a LABEL derived from `status`; evidence confidence is a
       SEPARATE number — the two are never conflated (§5).
     • Geometry that cannot be read is `null` / "unavailable" — never
       "assume A4" (§9).
     • Deterministic: same records ⇒ byte-identical projection (everything
       the query layer hands back is already sorted).

   `styleRules` / `visualTemplates` are `StyleRule[]` / `VisualTemplate[]`,
   or `null` when the subsystem could not be queried.

   DEPENDENCIES: ./contracts/curation-contract.js,
   ../corpus/style-guide/style-guide-query.js,
   ../corpus/visual-template/visual-template-query.js. PURE.
   ============================================================ */

'use strict';

import {
  CURATION_PROPOSAL_KIND, authorityLabelForStatus, temporalContextLabel,
} from './contracts/curation-contract.js';
import {
  queryStyleGuide, findStyleGuideConflicts, getSupersessionChain,
} from '../corpus/style-guide/style-guide-query.js';
import {
  queryVisualTemplates, findVisualTemplateConflicts, getVisualTemplateHistory,
} from '../corpus/visual-template/visual-template-query.js';

/* ── small local helpers (no cross-module coupling) ─────────────────── */

function list(v) { return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []; }
function ymd(v) { return typeof v === 'string' && v ? v : null; }
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
function byIdKey(a, b, k) { return a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0; }

/** Round an evidence-confidence number to 2 dp for DISPLAY — it is NEVER
 *  authority (§5). Returns a string like "0.94" or null. */
export function confidenceText(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return (Math.round(v * 100) / 100).toFixed(2);
}

/** The most recent audit event whose `event` matches one of `events`. */
function lastAudit(record, events) {
  const trail = Array.isArray(record && record.auditTrail) ? record.auditTrail : [];
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    if (events.includes(trail[i].event)) return trail[i];
  }
  return null;
}

/* ══ §4 — CURATION DASHBOARD ══════════════════════════════════════════
   Every metric is a COUNT over canonical records. No invented statistics.
   A `null` domain surfaces as `available:false`, never as 0. */

export function buildCurationDashboard({ styleRules, visualTemplates } = {}) {
  const sg = Array.isArray(styleRules) ? styleRules : null;
  const vt = Array.isArray(visualTemplates) ? visualTemplates : null;

  const sgAvailable = sg !== null;
  const vtAvailable = vt !== null;

  const sgProposed = sgAvailable ? queryStyleGuide(sg, { status: 'proposed' }).length : 0;
  const sgApproved = sgAvailable ? queryStyleGuide(sg, { status: 'approved', includeSuperseded: false }).length : 0;
  const sgRejected = sgAvailable ? queryStyleGuide(sg, { status: 'rejected' }).length : 0;
  const sgDeprecated = sgAvailable ? queryStyleGuide(sg, { status: 'deprecated' }).length : 0;

  const vtProposed = vtAvailable ? queryVisualTemplates(vt, { status: 'proposed' }).length : 0;
  const vtApproved = vtAvailable ? queryVisualTemplates(vt, { status: 'approved', includeSuperseded: false }).length : 0;
  const vtRejected = vtAvailable ? queryVisualTemplates(vt, { status: 'rejected' }).length : 0;
  const vtDeprecated = vtAvailable ? queryVisualTemplates(vt, { status: 'deprecated' }).length : 0;

  // §11 — conflicts split by lifecycle: a competing APPROVED slot is a live
  // authority risk; a competing PROPOSED slot is awaiting a human decision.
  const sgConflicts = sgAvailable ? findStyleGuideConflicts(sg) : [];
  const vtConflicts = vtAvailable ? findVisualTemplateConflicts(vt) : [];
  const approvedConflicts = sgConflicts.filter((c) => c.status === 'approved').length
    + vtConflicts.filter((c) => c.status === 'approved').length;
  const proposedConflicts = sgConflicts.filter((c) => c.status === 'proposed').length
    + vtConflicts.filter((c) => c.status === 'proposed').length;

  return Object.freeze({
    styleGuide: Object.freeze({
      available: sgAvailable,
      proposed: sgProposed,
      approved: sgApproved,
      rejected: sgRejected,
      deprecated: sgDeprecated,
    }),
    visualTemplate: Object.freeze({
      available: vtAvailable,
      proposed: vtProposed,
      approved: vtApproved,
      rejected: vtRejected,
      deprecated: vtDeprecated,
    }),
    awaitingReview: sgProposed + vtProposed,
    conflicts: Object.freeze({
      total: approvedConflicts + proposedConflicts,
      approved: approvedConflicts,
      proposed: proposedConflicts,
    }),
  });
}

/* ══ §5 — PROPOSAL LIST ROWS ═════════════════════════════════════════
   One compact row per record. Authority is an explicit LABEL; evidence
   confidence is a SEPARATE, labelled number. */

export function buildStyleProposalRows(styleRules, filter = {}) {
  const rows = queryStyleGuide(list(styleRules), filter && typeof filter === 'object' ? filter : {})
    .map((r) => Object.freeze({
      kind: CURATION_PROPOSAL_KIND.STYLE_RULE,
      id: r.ruleId,
      category: r.category,
      key: r.key,
      documentType: r.documentType,
      scope: r.scope,
      summary: r.value,
      normalizedValue: r.normalizedValue,
      status: r.status,
      authorityLabel: authorityLabelForStatus(r.status),
      evidenceConfidence: confidenceText(r.confidence),
      evidenceCount: num(r.evidence && r.evidence.occurrenceCount),
      sourceDocumentCount: num(r.evidence && r.evidence.documentCount),
      temporalStatus: (r.temporalEvidence && r.temporalEvidence.temporalStatus) || 'unknown',
      temporalContext: temporalContextLabel(r.temporalEvidence && r.temporalEvidence.conventionEra),
      conventionEra: (r.temporalEvidence && r.temporalEvidence.conventionEra) || 'unknown',
      version: num(r.version),
      supersedes: r.supersedesRuleId || null,
      supersededBy: r.supersededByRuleId || null,
      createdAt: r.createdAt || null,
    }));
  return annotateConflicts(rows, findStyleGuideConflicts(list(styleRules)), 'competingRuleIds');
}

export function buildVisualProposalRows(visualTemplates, filter = {}) {
  const rows = queryVisualTemplates(list(visualTemplates), filter && typeof filter === 'object' ? filter : {})
    .map((t) => Object.freeze({
      kind: CURATION_PROPOSAL_KIND.VISUAL_TEMPLATE,
      id: t.templateId,
      documentType: t.documentType,
      scope: t.scope,
      variant: t.variant,
      summary: `${t.documentType} · ${t.variant}`,
      status: t.status,
      authorityLabel: authorityLabelForStatus(t.status),
      evidenceConfidence: confidenceText(t.confidence),
      evidenceCount: num(t.evidence && t.evidence.observationCount),
      sourceDocumentCount: num(t.evidence && t.evidence.documentCount),
      pageCount: num(t.evidence && t.evidence.pageCount),
      geometryKnown: !!(t.evidence && t.evidence.geometryKnown),
      regionCount: Array.isArray(t.regions) ? t.regions.length : 0,
      temporalStatus: (t.temporalEvidence && t.temporalEvidence.temporalStatus) || 'unknown',
      temporalContext: temporalContextLabel(t.temporalEvidence && t.temporalEvidence.conventionEra),
      conventionEra: (t.temporalEvidence && t.temporalEvidence.conventionEra) || 'unknown',
      version: num(t.templateVersion),
      supersedes: t.supersedesTemplateId || null,
      supersededBy: t.supersededByTemplateId || null,
      createdAt: t.createdAt || null,
    }));
  return annotateConflicts(rows, findVisualTemplateConflicts(list(visualTemplates)), 'competingTemplateIds');
}

/** Mark each row that is one side of an unresolved same-status conflict. */
function annotateConflicts(rows, conflicts, idsField) {
  const inConflict = new Set();
  for (const c of conflicts) for (const id of c[idsField] || []) inConflict.add(`${c.status}:${id}`);
  return Object.freeze(rows.map((r) => Object.freeze({ ...r, hasConflict: inConflict.has(`${r.status}:${r.id}`) })));
}

/* ══ §6 — DETERMINISTIC FILTERS ══════════════════════════════════════
   Only over fields that exist on the row. No filter silently changes
   meaning; an unknown key is ignored. */

export function filterCurationRows(rows, filter = {}) {
  const f = filter && typeof filter === 'object' ? filter : {};
  let out = Array.isArray(rows) ? rows.slice() : [];
  if (f.status) out = out.filter((r) => r.status === f.status);
  if (f.documentType) out = out.filter((r) => r.documentType === f.documentType);
  if (f.category) out = out.filter((r) => r.category === f.category);
  if (f.temporalStatus) out = out.filter((r) => r.temporalStatus === f.temporalStatus);
  if (f.conventionEra) out = out.filter((r) => r.conventionEra === f.conventionEra);
  if (f.conflictOnly === true) out = out.filter((r) => r.hasConflict === true);
  if (f.variant) out = out.filter((r) => r.variant === f.variant);
  return out;
}

/** The distinct filter values actually present in a row set (for the
 *  filter UI — never offer a value that filters to nothing). */
export function availableFilterValues(rows) {
  const r = Array.isArray(rows) ? rows : [];
  const uniq = (fn) => [...new Set(r.map(fn).filter((v) => v != null && v !== ''))].sort();
  return Object.freeze({
    status: uniq((x) => x.status),
    documentType: uniq((x) => x.documentType),
    category: uniq((x) => x.category),
    temporalStatus: uniq((x) => x.temporalStatus),
    conventionEra: uniq((x) => x.conventionEra),
    variant: uniq((x) => x.variant),
  });
}

/* ══ §10 — EVIDENCE SUMMARY (shared by review + conflict) ═════════════
   Compact reference summary with drill-down ids — NEVER a copy of the
   corpus body. */

function styleEvidenceSummary(r) {
  const ev = r.evidence || {};
  const te = r.temporalEvidence || {};
  return Object.freeze({
    occurrenceCount: num(ev.occurrenceCount),
    documentCount: num(ev.documentCount),
    documentTypeDistribution: Object.freeze({ ...(ev.documentTypeDistribution || {}) }),
    pageNumbers: Object.freeze([...(ev.pageNumbers || [])]),
    extractionMethods: Object.freeze([...(ev.extractionMethods || [])]),
    sourceMemoryIds: Object.freeze([...(r.sourceMemoryIds || [])]),
    sourceObservationIds: Object.freeze([...(r.sourceObservationIds || [])]),
    sourceDocumentIds: Object.freeze([...(r.sourceDocumentIds || [])]),
    confidence: confidenceText(r.confidence),
    temporal: Object.freeze({
      status: te.temporalStatus || 'unknown',
      conventionEra: te.conventionEra || 'unknown',
      contextLabel: temporalContextLabel(te.conventionEra),
      oldestSourceDate: ymd(te.oldestSourceDate),
      latestSourceDate: ymd(te.latestSourceDate),
      recentDocumentCount: num(te.recentDocumentCount),
      historicalDocumentCount: num(te.historicalDocumentCount),
      conflictingDocumentCount: num(te.conflictingDocumentCount),
      approvedRulePresent: te.approvedRulePresent === true,
      approvedRuleMatches: te.approvedRuleMatches === true,
    }),
  });
}

function visualEvidenceSummary(t) {
  const ev = t.evidence || {};
  const te = t.temporalEvidence || {};
  return Object.freeze({
    documentCount: num(ev.documentCount),
    observationCount: num(ev.observationCount),
    pageCount: num(ev.pageCount),
    regionKinds: Object.freeze([...(ev.regionKinds || [])]),
    coordinateSpaces: Object.freeze([...(ev.coordinateSpaces || [])]),
    geometryKnown: ev.geometryKnown === true,
    sourceObservationIds: Object.freeze([...(t.sourceObservationIds || [])]),
    sourceDocumentIds: Object.freeze([...(t.sourceDocumentIds || [])]),
    confidence: confidenceText(t.confidence),
    temporal: Object.freeze({
      status: te.temporalStatus || 'unknown',
      conventionEra: te.conventionEra || 'unknown',
      contextLabel: temporalContextLabel(te.conventionEra),
      oldestSourceDate: ymd(te.oldestSourceDate),
      latestSourceDate: ymd(te.latestSourceDate),
      recentDocumentCount: num(te.recentDocumentCount),
      historicalDocumentCount: num(te.historicalDocumentCount),
      transitionalDocumentCount: num(te.transitionalDocumentCount),
      undatedDocumentCount: num(te.undatedDocumentCount),
    }),
  });
}

/* ══ §9 — HONEST GEOMETRY ════════════════════════════════════════════
   If a page dimension cannot be read the answer is "unavailable" — never
   a fabricated A4. A coordinate-space label with no coordinate is also
   "unavailable" (the two authority contracts already forbid it). */

export function describeGeometry(pageModel) {
  const p = pageModel && typeof pageModel === 'object' ? pageModel : {};
  const w = typeof p.width === 'number' && Number.isFinite(p.width) ? p.width : null;
  const h = typeof p.height === 'number' && Number.isFinite(p.height) ? p.height : null;
  if (w === null && h === null) {
    return Object.freeze({ known: false, note: 'Geometry unavailable', coordinateSpace: p.coordinateSpace || 'unknown' });
  }
  return Object.freeze({
    known: true,
    width: w,
    height: h,
    unit: p.unit || 'unknown',
    coordinateSpace: p.coordinateSpace || 'unknown',
    orientation: p.orientation || 'unknown',
    pageNumber: Number.isInteger(p.pageNumber) ? p.pageNumber : null,
  });
}

/* ══ §7 — STYLE RULE REVIEW ══════════════════════════════════════════ */

export function buildStyleRuleReview(styleRules, ruleId) {
  const all = list(styleRules);
  const rule = all.find((r) => r.ruleId === String(ruleId || ''));
  if (!rule) return null;

  // predecessor (if this proposal supersedes an approved rule)
  const chain = getSupersessionChain(all, rule.ruleId);
  const predecessorRecord = rule.supersedesRuleId
    ? all.find((r) => r.ruleId === rule.supersedesRuleId) || null
    : null;

  // the live same-slot conflict (approved OR proposed), if any
  const slotKey = `${rule.scope}|${rule.category}|${rule.key}|${rule.documentType}`;
  const conflict = findStyleGuideConflicts(all).find((c) =>
    `${c.scope}|${c.category}|${c.key}|${c.documentType}` === slotKey && c.status === rule.status) || null;

  return Object.freeze({
    kind: CURATION_PROPOSAL_KIND.STYLE_RULE,
    id: rule.ruleId,
    proposed: Object.freeze({
      category: rule.category,
      key: rule.key,
      value: rule.value,
      normalizedValue: rule.normalizedValue,
      documentType: rule.documentType,
      scope: rule.scope,
      version: num(rule.version),
      status: rule.status,
      authorityLabel: authorityLabelForStatus(rule.status),
    }),
    evidence: styleEvidenceSummary(rule),
    decision: decisionCapability(rule.status, !!rule.supersedesRuleId),
    predecessor: predecessorRecord ? Object.freeze({
      id: predecessorRecord.ruleId,
      value: predecessorRecord.value,
      version: num(predecessorRecord.version),
      status: predecessorRecord.status,
      approvedAt: predecessorRecord.approvedAt || null,
      approvedBy: predecessorRecord.approvedBy || null,
      rationale: predecessorRecord.rationale || null,
      approvalHistory: buildHistoryEntries(predecessorRecord),
    }) : null,
    slotConflict: conflict ? Object.freeze({
      status: conflict.status,
      competingIds: Object.freeze([...(conflict.competingRuleIds || [])]),
      sides: Object.freeze((conflict.sides || []).map((s) => Object.freeze({
        id: s.ruleId, value: s.value, version: num(s.version), status: s.status,
      }))),
      recommendedWinner: null, // §11 — the system never nominates one
    }) : null,
    approvalMetadata: Object.freeze({
      createdAt: rule.createdAt || null,
      createdBy: rule.createdBy || null,
      approvedAt: rule.approvedAt || null,
      approvedBy: rule.approvedBy || null,
      rejectedAt: rule.rejectedAt || null,
      rejectedBy: rule.rejectedBy || null,
      deprecatedAt: rule.deprecatedAt || null,
      deprecatedBy: rule.deprecatedBy || null,
      rationale: rule.rationale || null,
    }),
    history: buildHistoryEntries(rule),
    supersessionChain: Object.freeze(chain.map((r) => Object.freeze({
      id: r.ruleId, version: num(r.version), status: r.status, value: r.value,
    }))),
  });
}

/* ══ §8 — VISUAL TEMPLATE REVIEW ═════════════════════════════════════ */

export function buildVisualTemplateReview(visualTemplates, templateId) {
  const all = list(visualTemplates);
  const t = all.find((x) => x.templateId === String(templateId || ''));
  if (!t) return null;

  const chain = getVisualTemplateHistory(all, t.templateId);
  const predecessorRecord = t.supersedesTemplateId
    ? all.find((x) => x.templateId === t.supersedesTemplateId) || null
    : null;

  const slotKey = `${t.scope}|${t.documentType}`;
  const conflict = findVisualTemplateConflicts(all).find((c) =>
    `${c.scope}|${c.documentType}` === slotKey && c.status === t.status) || null;

  const regions = Object.freeze((Array.isArray(t.regions) ? t.regions : []).map((r) => Object.freeze({
    kind: r.kind,
    geometry: describeGeometry(r.geometry),
    pageRecurrence: r.pageRecurrence || 'unknown',
    occurrenceCount: num(r.occurrenceCount),
    documentCount: num(r.documentCount),
    confidence: confidenceText(r.confidence),
    sourceObservationIds: Object.freeze([...(r.sourceObservationIds || [])]),
    sourceDocumentIds: Object.freeze([...(r.sourceDocumentIds || [])]),
    note: r.note || '',
  })));

  return Object.freeze({
    kind: CURATION_PROPOSAL_KIND.VISUAL_TEMPLATE,
    id: t.templateId,
    template: Object.freeze({
      documentType: t.documentType,
      scope: t.scope,
      variant: t.variant,
      version: num(t.templateVersion),
      status: t.status,
      authorityLabel: authorityLabelForStatus(t.status),
      pageModel: describeGeometry(t.pageModel),
      pageModelRaw: Object.freeze({
        coordinateSpace: (t.pageModel && t.pageModel.coordinateSpace) || 'unknown',
        unit: (t.pageModel && t.pageModel.unit) || 'unknown',
        orientation: (t.pageModel && t.pageModel.orientation) || 'unknown',
      }),
      regions,
      typography: t.typography || null,
      spacing: t.spacing || null,
      structuralRules: t.structuralRules || null,
    }),
    evidence: visualEvidenceSummary(t),
    decision: decisionCapability(t.status, !!t.supersedesTemplateId),
    predecessor: predecessorRecord ? Object.freeze({
      id: predecessorRecord.templateId,
      variant: predecessorRecord.variant,
      version: num(predecessorRecord.templateVersion),
      status: predecessorRecord.status,
      approvedAt: predecessorRecord.approvedAt || null,
      approvedBy: predecessorRecord.approvedBy || null,
      rationale: predecessorRecord.rationale || null,
      pageModel: describeGeometry(predecessorRecord.pageModel),
      approvalHistory: buildHistoryEntries(predecessorRecord),
    }) : null,
    slotConflict: conflict ? Object.freeze({
      status: conflict.status,
      competingIds: Object.freeze([...(conflict.competingTemplateIds || [])]),
      sides: Object.freeze((conflict.sides || []).map((s) => Object.freeze({
        id: s.templateId, variant: s.variant, version: num(s.templateVersion), status: s.status,
        pageModel: describeGeometry(s.pageModel),
      }))),
      recommendedWinner: null,
    }) : null,
    approvalMetadata: Object.freeze({
      createdAt: t.createdAt || null,
      createdBy: t.createdBy || null,
      approvedAt: t.approvedAt || null,
      approvedBy: t.approvedBy || null,
      rejectedAt: t.rejectedAt || null,
      rejectedBy: t.rejectedBy || null,
      deprecatedAt: t.deprecatedAt || null,
      deprecatedBy: t.deprecatedBy || null,
      rationale: t.rationale || null,
    }),
    history: buildHistoryEntries(t),
    supersessionChain: Object.freeze(chain.map((x) => Object.freeze({
      id: x.templateId, version: num(x.templateVersion), status: x.status, variant: x.variant,
    }))),
  });
}

/** §7, §8, §14 — which explicit actions a record's CURRENT status allows.
 *  Approval and supersession are never the same ambiguous button. */
export function decisionCapability(status, hasPredecessor) {
  if (status === 'proposed') {
    return Object.freeze({
      canApprove: !hasPredecessor,
      canSupersede: !!hasPredecessor, // approve a proposal that already links a predecessor
      canReject: true,
      canDeprecate: false,
      rationaleRequired: true,
    });
  }
  if (status === 'approved') {
    return Object.freeze({
      canApprove: false, canSupersede: false, canReject: false,
      canDeprecate: true, rationaleRequired: true,
    });
  }
  return Object.freeze({ canApprove: false, canSupersede: false, canReject: false, canDeprecate: false, rationaleRequired: true });
}

/* ══ §11 — CONFLICT VIEW ═════════════════════════════════════════════
   Both sides, side by side, each with its own evidence + temporal
   context. The system NEVER nominates a winner and NEVER resolves a
   conflict on its own. */

export function buildConflictView({ styleRules, visualTemplates } = {}) {
  const sg = Array.isArray(styleRules) ? styleRules : null;
  const vt = Array.isArray(visualTemplates) ? visualTemplates : null;

  const styleGuide = (sg === null ? [] : findStyleGuideConflicts(sg)).map((c) => {
    const byId = new Map(list(sg).map((r) => [r.ruleId, r]));
    return Object.freeze({
      kind: CURATION_PROPOSAL_KIND.STYLE_RULE,
      slot: Object.freeze({ scope: c.scope, category: c.category, key: c.key, documentType: c.documentType }),
      status: c.status,
      competingIds: Object.freeze([...(c.competingRuleIds || [])]),
      recommendedWinner: null, // §11 — explicit: there is none
      resolutionRequiresHuman: true,
      sides: Object.freeze((c.sides || []).map((s) => {
        const full = byId.get(s.ruleId);
        return Object.freeze({
          id: s.ruleId,
          value: s.value,
          version: num(s.version),
          status: s.status,
          authorityLabel: authorityLabelForStatus(s.status),
          evidence: full ? styleEvidenceSummary(full) : null,
        });
      })),
    });
  });

  const visualTemplate = (vt === null ? [] : findVisualTemplateConflicts(vt)).map((c) => {
    const byId = new Map(list(vt).map((t) => [t.templateId, t]));
    return Object.freeze({
      kind: CURATION_PROPOSAL_KIND.VISUAL_TEMPLATE,
      slot: Object.freeze({ scope: c.scope, documentType: c.documentType }),
      status: c.status,
      competingIds: Object.freeze([...(c.competingTemplateIds || [])]),
      recommendedWinner: null,
      resolutionRequiresHuman: true,
      sides: Object.freeze((c.sides || []).map((s) => {
        const full = byId.get(s.templateId);
        return Object.freeze({
          id: s.templateId,
          variant: s.variant,
          version: num(s.templateVersion),
          status: s.status,
          authorityLabel: authorityLabelForStatus(s.status),
          pageModel: describeGeometry(s.pageModel),
          evidence: full ? visualEvidenceSummary(full) : null,
        });
      })),
    });
  });

  return Object.freeze({
    styleGuide: Object.freeze(styleGuide),
    visualTemplate: Object.freeze(visualTemplate),
    total: styleGuide.length + visualTemplate.length,
  });
}

/* ══ §24 — AUDIT HISTORY ═════════════════════════════════════════════
   The append-only audit trail, normalised for display. Metadata only —
   the `detail` bag carries rationale / reason / supersedes ids, never a
   secret or corpus body. */

export function buildHistoryEntries(record) {
  const trail = Array.isArray(record && record.auditTrail) ? record.auditTrail : [];
  return Object.freeze(trail.map((e) => Object.freeze({
    event: e.event,
    at: e.at || null,
    actorId: e.actorId || null,
    fromStatus: e.fromStatus || null,
    toStatus: e.toStatus || null,
    version: num(e.version),
    rationale: (e.detail && (e.detail.rationale || e.detail.reason)) || null,
    supersedes: (e.detail && (e.detail.supersedesRuleId || e.detail.supersedesTemplateId)) || null,
    supersededBy: (e.detail && (e.detail.supersededByRuleId || e.detail.supersededByTemplateId)) || null,
  })));
}

/** §24 — a merged, chronological history for one record: its own audit
 *  trail plus the trails of every other record in its supersession
 *  chain, so "History" shows the whole lineage. */
export function buildLineageHistory(records, id, chainFn) {
  const all = list(records);
  const chain = typeof chainFn === 'function' ? chainFn(all, String(id || '')) : [];
  const idKey = chain.length && chain[0].ruleId ? 'ruleId' : 'templateId';
  const events = [];
  for (const rec of chain) {
    for (const e of buildHistoryEntries(rec)) {
      events.push(Object.freeze({ ...e, recordId: rec[idKey] }));
    }
  }
  events.sort((a, b) => {
    if (a.at && b.at && a.at !== b.at) return a.at < b.at ? -1 : 1;
    if (a.version !== b.version) return a.version - b.version;
    return byIdKey(a, b, 'recordId');
  });
  return Object.freeze(events);
}

/* ── re-exports so the workspace has one import surface ─────────────── */
export {
  getSupersessionChain as styleSupersessionChain,
} from '../corpus/style-guide/style-guide-query.js';
export {
  getVisualTemplateHistory as visualSupersessionChain,
} from '../corpus/visual-template/visual-template-query.js';
export { lastAudit as __lastAudit };
